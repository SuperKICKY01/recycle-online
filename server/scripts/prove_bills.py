"""Phase 1c deliverable: prove purchase-bill create/read/void over REAL HTTP.

Seed with scripts/seed_dev.py and start the server first. Bills + counters
should be empty for deterministic doc_no assertions (the run script truncates
them first).

    python scripts/prove_bills.py    (from the server/ directory)
"""
from __future__ import annotations

import os
import sys
import re
import threading
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx  # noqa: E402

from app.bills import _be_year  # noqa: E402
from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    PRODUCT_A_ID,
    PRODUCT_B_ID,
    SELLER_A_ID,
    SELLER_B_ID,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
    TENANT_B_ID,
    TENANT_B_PASSWORD,
)

BASE = os.environ.get("API_BASE_URL", "http://127.0.0.1:8099")
# THE SHOP's Buddhist-era year, from the server's own derivation — not
# `datetime.now(utc).year + 543`, which is what stood here. That expression is
# the exact bug lessons/be-year-comes-after-the-timezone.md exists for: between
# 00:00 and 06:59 Bangkok the UTC date is still yesterday, so for seven hours of
# every new year's day it answers 2569 while the server stamps 2570 — and this
# proof would go red over a defect it does not have.
BE_YEAR = _be_year(datetime.now(tz=timezone.utc))

# Idempotency keys are scoped to THIS run. With fixed keys the script could only
# ever run once against a database: the second run collides with the first run's
# bills, the server correctly returns those existing bills instead of creating
# new ones, and every downstream assertion fails for the wrong reason.
RUN = uuid.uuid4().hex[:8]

failures: list[str] = []


def banner(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def check(cond: bool, label: str) -> None:
    if not cond:
        failures.append(label)
        print(f"    [FAIL] {label}")


def login(client: httpx.Client, tenant_id, password: str) -> str:
    r = client.post(
        f"{BASE}/auth/login",
        json={"tenant_id": str(tenant_id), "username": ADMIN_USERNAME, "password": password},
    )
    r.raise_for_status()
    return r.json()["access_token"]


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def item(product_id, line_no, net, unit="1.00", gross=None, tare="0.000") -> dict:
    return {
        "id": str(uuid.uuid4()),
        "product_id": str(product_id),
        "line_no": line_no,
        "gross_weight": gross if gross is not None else net,
        "tare_weight": tare,
        "net_weight": net,
        "unit_price": unit,
        "list_price": unit,
    }


def bill_body(seller_id, idem, items, *, bill_id=None, total=None, vehicle="70-1234") -> dict:
    body = {
        "id": bill_id or str(uuid.uuid4()),
        "seller_id": str(seller_id),
        "vehicle_no": vehicle,
        "device_created_at": datetime.now(tz=timezone.utc).isoformat(),
        "idempotency_key": idem,
        "items": items,
    }
    if total is not None:
        body["total_amount"] = total
    return body


def seq_of(doc_no: str) -> int:
    return int(doc_no.rsplit("-", 1)[1])


def main() -> int:
    with httpx.Client(timeout=15.0) as client:
        token_a = login(client, TENANT_A_ID, TENANT_A_PASSWORD)
        token_b = login(client, TENANT_B_ID, TENANT_B_PASSWORD)
        print(f"logged in tenant A and B admins; be_year={BE_YEAR}")

        # ---------------------------------------------------------------- CASE 1
        banner("CASE 1 - normal create (NUMERIC: net 0.1 + 0.2 = 0.3, exact)")
        body1 = bill_body(
            SELLER_A_ID, f"bill-A-{RUN}-0001",
            [item(PRODUCT_A_ID, 1, "0.100"), item(PRODUCT_A_ID, 2, "0.200")],
        )
        r = client.post(f"{BASE}/bills", headers=auth(token_a), json=body1)
        b1 = r.json() if r.status_code in (200, 201) else {}
        print(f"  status={r.status_code}  doc_no={b1.get('doc_no')}  total={b1.get('total_amount')}")
        print(f"  item amounts = {[i['amount'] for i in b1.get('items', [])]}")
        check(r.status_code == 201, "case1: create not 201")
        check(re.fullmatch(rf"B-{BE_YEAR}-\d+", b1.get("doc_no") or "") is not None,
              "case1: doc_no is not B-<beYear>-<seq>")
        check(b1.get("total_amount") == "0.30", "case1: total 0.1+0.2 != 0.30 (float drift?)")
        check([i["amount"] for i in b1.get("items", [])] == ["0.10", "0.20"],
              "case1: line amounts wrong")
        doc1 = b1.get("doc_no")
        id1 = b1.get("id")
        # read back
        r = client.get(f"{BASE}/bills/{id1}", headers=auth(token_a))
        print(f"  GET /bills/{{id}} -> status={r.status_code} status_field={r.json().get('status')}")
        check(r.status_code == 200 and r.json().get("status") == "active", "case1: read-back failed")
        # appears in active list
        r = client.get(f"{BASE}/bills", headers=auth(token_a))
        docs = [b["doc_no"] for b in r.json().get("bills", [])]
        check(doc1 in docs, "case1: bill missing from active list")

        # ---------------------------------------------------------------- CASE 2
        banner("CASE 2 - duplicate idempotency_key -> ONE bill, same bill returned")
        r = client.post(f"{BASE}/bills", headers=auth(token_a), json=body1)  # identical
        b2 = r.json() if r.status_code in (200, 201) else {}
        print(f"  status={r.status_code}  doc_no={b2.get('doc_no')}  id_matches={b2.get('id') == id1}")
        check(r.status_code == 200, "case2: replay not 200")
        check(b2.get("id") == id1 and b2.get("doc_no") == doc1, "case2: replay returned a different bill")
        r = client.get(f"{BASE}/bills", headers=auth(token_a))
        n_with_doc1 = sum(1 for b in r.json().get("bills", []) if b["doc_no"] == doc1)
        check(n_with_doc1 == 1, "case2: duplicate created more than one bill")

        # ---------------------------------------------------------------- CASE 3
        banner("CASE 3 - cross-tenant reference rejected (RLS + composite FK), atomic")
        # 3a: A submits with tenant B's seller
        bad_id_a = str(uuid.uuid4())
        r = client.post(f"{BASE}/bills", headers=auth(token_a),
                        json=bill_body(SELLER_B_ID, f"bill-A-{RUN}-xseller",
                                       [item(PRODUCT_A_ID, 1, "1.000")], bill_id=bad_id_a))
        print(f"  A -> seller_B : status={r.status_code}  detail={r.json().get('detail')}")
        check(r.status_code in (400, 404, 409, 422), "case3a: foreign seller not rejected")
        check(client.get(f"{BASE}/bills/{bad_id_a}", headers=auth(token_a)).status_code == 404,
              "case3a: a header was persisted despite rejection (not atomic)")
        # 3b: A submits an item with tenant B's product
        bad_id_b = str(uuid.uuid4())
        r = client.post(f"{BASE}/bills", headers=auth(token_a),
                        json=bill_body(SELLER_A_ID, f"bill-A-{RUN}-xproduct",
                                       [item(PRODUCT_B_ID, 1, "1.000")], bill_id=bad_id_b))
        print(f"  A -> product_B: status={r.status_code}  detail={r.json().get('detail')}")
        check(r.status_code in (400, 404, 409, 422), "case3b: foreign product not rejected")
        check(client.get(f"{BASE}/bills/{bad_id_b}", headers=auth(token_a)).status_code == 404,
              "case3b: a header was persisted despite rejection (not atomic)")

        # ---------------------------------------------------------------- CASE 4
        banner("CASE 4 - void, then re-read; doc_no NOT reused")
        r = client.post(f"{BASE}/bills/{id1}/void", headers=auth(token_a),
                        json={"reason": "wrong weight, reissue"})
        vb = r.json() if r.status_code == 200 else {}
        print(f"  void status={r.status_code}  status_field={vb.get('status')}  by={vb.get('voided_by')}")
        check(r.status_code == 200 and vb.get("status") == "voided", "case4: void did not take")
        check(vb.get("void_reason") == "wrong weight, reissue" and vb.get("voided_at"),
              "case4: void fields not set")
        # still readable
        r = client.get(f"{BASE}/bills/{id1}", headers=auth(token_a))
        check(r.status_code == 200 and r.json().get("status") == "voided",
              "case4: voided bill not readable")
        # excluded from active list
        r = client.get(f"{BASE}/bills", headers=auth(token_a))
        check(doc1 not in [b["doc_no"] for b in r.json().get("bills", [])],
              "case4: voided bill still in active list")
        # a NEW bill takes the NEXT number, not the voided one's
        r = client.post(f"{BASE}/bills", headers=auth(token_a),
                        json=bill_body(SELLER_A_ID, f"bill-A-{RUN}-0002", [item(PRODUCT_A_ID, 1, "5.000")]))
        b_new = r.json()
        doc_new = b_new.get("doc_no")
        print(f"  new bill after void: doc_no={doc_new}  (voided was {doc1})")
        check(r.status_code == 201 and doc_new == f"B-{BE_YEAR}-{seq_of(doc1) + 1}",
              "case4: new doc_no not the next seq")
        check(doc_new != doc1, "case4: voided doc_no was reused")
        prev_max = seq_of(doc_new)  # whatever the counter is at, not a fixed 2

        # ---------------------------------------------------------------- CASE 5
        banner("CASE 5 - doc_no under CONCURRENCY: two near-simultaneous submits")
        bodies = [
            bill_body(SELLER_A_ID, f"bill-A-{RUN}-conc-1", [item(PRODUCT_A_ID, 1, "1.000")]),
            bill_body(SELLER_A_ID, f"bill-A-{RUN}-conc-2", [item(PRODUCT_A_ID, 1, "1.000")]),
        ]
        barrier = threading.Barrier(2)
        results: list[httpx.Response | None] = [None, None]

        def worker(i: int) -> None:
            with httpx.Client(timeout=15.0) as c:
                barrier.wait()  # release both at once
                results[i] = c.post(f"{BASE}/bills", headers=auth(token_a), json=bodies[i])

        threads = [threading.Thread(target=worker, args=(i,)) for i in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        codes = [r.status_code for r in results]
        docs = sorted(r.json().get("doc_no") for r in results)
        seqs = sorted(seq_of(d) for d in docs)
        print(f"  statuses={codes}  doc_nos={docs}")
        check(all(c == 201 for c in codes), "case5: a concurrent create failed")
        check(len(set(docs)) == 2, "case5: doc_no COLLISION under concurrency")
        check(seqs == [prev_max + 1, prev_max + 2], "case5: doc_nos not consecutive/gap-free")

        # ---------------------------------------------------------------- CASE 6
        banner("CASE 6 - client-sent total that mismatches server -> rejected")
        r = client.post(f"{BASE}/bills", headers=auth(token_a),
                        json=bill_body(SELLER_A_ID, f"bill-A-{RUN}-badtotal",
                                       [item(PRODUCT_A_ID, 1, "1.000")], total="999.99"))
        print(f"  status={r.status_code}  detail={r.json().get('detail')}")
        check(r.status_code == 422, "case6: mismatched client total not rejected")

    banner("RESULT")
    if failures:
        print("  FAILED:")
        for f in failures:
            print(f"    - {f}")
        return 1
    print("  ALL CASES PASSED - bills are atomic, idempotent, exact, tenant-safe, gap-free.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
