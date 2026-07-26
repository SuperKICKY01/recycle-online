"""Prove the SELLER is per-bill, and that their grade prices the bill.

    python scripts/prove_seller_pricing.py     (from the server/ directory)

Phase 2c-6. Until now every bill this device wrote carried the same seller_id,
so nothing distinguished "the server files a bill under the seller it was sent"
from "there is only ever one seller". This sends the SAME product at the SAME
unit_price under sellers of three different grades and shows the stored
list_price following the GRADE — which is what makes an off-list payment
visible in an audit (hard rule 6).

Also proves the two states the yard app must warn about BEFORE weighing:

  * a seller with no grade      -> 424 seller_grade_unset  (resolvable: parks)
  * a product with no tier for  -> 424 product_price_unset (resolvable: parks)
    that seller's grade

Both are 424, NOT 422. The distinction is the whole content of
lessons/unavailable-is-not-rejected.md: 422 is terminal and the load is
stranded, 424 parks and clears itself when the office fixes the data.

STATE: creates bills (hard rule 5 — no hard deletes on transactions, so they
stay). It borrows ONE price row for R4 and restores it in a finally block.
Idempotency keys, bill ids and vehicle numbers are per-run and doc_no is
asserted by shape, so it passes twice in a row against a live database
(lessons/proof-must-run-twice.md).
"""
from __future__ import annotations

import asyncio
import os
import re
import sys
import uuid
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncpg  # noqa: E402
import httpx  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    PRODUCT_A_ID,
    SELLER_A_ID,
    SELLER_A2_ID,
    SELLER_A3_ID,
    SELLER_A5_ID,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
)

load_dotenv()

BASE = os.environ.get("API_BASE_URL", "http://127.0.0.1:8099")
RUN = uuid.uuid4().hex[:8]

# The seeded tenant-A price list for FE-STEEL. Read from the DB at runtime; these
# are only what the run is EXPECTED to find, printed on mismatch.
EXPECTED = {"A": "15.50", "B": "15.00", "C": "14.50"}

_failures: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'OK  ' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        _failures.append(label)


def header(text: str) -> None:
    print(f"\n=== {text} ===")


def bill_body(seller_id: uuid.UUID, key: str, vehicle: str, unit_price: str) -> dict:
    """One FE-STEEL line. The unit_price is the SAME whoever the seller is —
    so any difference in the stored list_price came from the grade, not from us.
    """
    return {
        "id": str(uuid.uuid4()),
        "seller_id": str(seller_id),
        "vehicle_no": vehicle,
        "device_created_at": "2026-07-26T08:00:00+00:00",
        "idempotency_key": key,
        "items": [
            {
                "id": str(uuid.uuid4()),
                "product_id": str(PRODUCT_A_ID),
                "line_no": 1,
                "gross_weight": "10.000",
                "tare_weight": "0.000",
                "net_weight": "10.000",
                "unit_price": unit_price,
            }
        ],
    }


async def main() -> int:
    url = os.environ["APP_DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    db = await asyncpg.connect(url)
    await db.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_A_ID))

    tiers = {
        r["grade"]: str(r["price"])
        for r in await db.fetch(
            "SELECT grade, price FROM product_prices WHERE product_id = $1", PRODUCT_A_ID
        )
    }
    if any(tiers.get(g) != want for g, want in EXPECTED.items()):
        print(f"SETUP FAILED: FE-STEEL tiers are {tiers}, expected at least {EXPECTED}.")
        print("Run scripts/seed_dev.py.")
        await db.close()
        return 1

    grades = {
        str(r["id"]): r["grade"]
        for r in await db.fetch("SELECT id, grade FROM sellers WHERE tenant_id = $1", TENANT_A_ID)
    }
    if grades.get(str(SELLER_A5_ID)) is not None:
        print(f"SETUP FAILED: seller S005 should have NO grade, has {grades.get(str(SELLER_A5_ID))!r}.")
        print("Run scripts/seed_dev.py.")
        await db.close()
        return 1

    client = httpx.Client(timeout=20.0)
    saved_c_price: Decimal | None = None
    try:
        token = client.post(
            f"{BASE}/auth/login",
            json={
                "tenant_id": str(TENANT_A_ID),
                "username": ADMIN_USERNAME,
                "password": TENANT_A_PASSWORD,
            },
        ).json()["access_token"]
        auth = {"authorization": f"Bearer {token}"}

        # ----------------------------------------------------------------- R1
        header("R1: the picker has a real list to choose from, with grades")
        sellers = client.get(f"{BASE}/sellers", headers=auth).json()["sellers"]
        for s in sellers:
            print(f"  {s['code']}  grade {str(s['grade'] or '(none)'):<7} {s['name']}")
        check(
            "more than one seller is offered — a per-bill choice needs one",
            len(sellers) > 1,
            f"n={len(sellers)}",
        )
        check(
            "grades vary across sellers, so the tier actually differs per bill",
            len({s["grade"] for s in sellers}) > 1,
            f"grades={sorted(str(s['grade']) for s in sellers)}",
        )
        check(
            "a grade-less seller is present and reported as null, not omitted",
            any(s["grade"] is None for s in sellers),
        )

        # ----------------------------------------------------------------- R2
        header("R2: same product, same unit_price, different sellers -> list_price follows the GRADE")

        # Deliberately 16.00 for everyone: ABOVE every tier, so no bill can
        # accidentally match its list and look on-tier by luck.
        PAID = "16.00"
        results: dict[str, dict] = {}
        for seller_id, label in (
            (SELLER_A_ID, "S001"),
            (SELLER_A2_ID, "S002"),
            (SELLER_A3_ID, "S003"),
        ):
            body = bill_body(seller_id, f"selpx-{RUN}-{label}", f"{label}-{RUN}", PAID)
            r = client.post(f"{BASE}/bills", headers=auth, json=body)
            if r.status_code != 201:
                check(f"{label}: bill accepted", False, f"status={r.status_code} body={r.text[:200]}")
                continue
            got = r.json()
            results[label] = got
            grade = grades[str(seller_id)]
            item = got["items"][0]
            print(
                f"  {label} grade {grade}: paid {item['unit_price']}"
                f"  list stamped {item['list_price']}  doc {got['doc_no']}"
            )
            check(
                f"{label} (grade {grade}) is filed under the seller it was sent for",
                got["seller_id"] == str(seller_id),
                f"seller_id={got['seller_id']}",
            )
            check(
                f"{label} (grade {grade}) got the grade-{grade} tier as list_price",
                item["list_price"] == tiers[grade],
                f"list_price={item['list_price']} expected={tiers[grade]}",
            )
            check(
                f"{label} kept the unit_price the yard actually paid",
                item["unit_price"] == PAID,
                f"unit_price={item['unit_price']}",
            )

        check(
            "the three bills stamped THREE DIFFERENT list prices from one product",
            len({r["items"][0]["list_price"] for r in results.values()}) == 3,
            f"list_prices={sorted(r['items'][0]['list_price'] for r in results.values())}",
        )
        check(
            "and each carries its own vehicle_no",
            len({r["vehicle_no"] for r in results.values()}) == 3,
            f"vehicle_nos={sorted(r['vehicle_no'] for r in results.values())}",
        )
        for label, got in results.items():
            check(
                f"{label} received a doc_no of the right shape",
                bool(re.fullmatch(r"B-\d{4}-\d+", got["doc_no"] or "")),
                f"doc_no={got['doc_no']}",
            )

        # ----------------------------------------------------------------- R3
        header("R3: a seller with NO grade is refused 424 — resolvable, so the load is not stranded")
        seq_before = await db.fetchval(
            "SELECT last_seq FROM doc_no_counters WHERE tenant_id = $1"
            " AND be_year = (SELECT max(be_year) FROM doc_no_counters WHERE tenant_id = $1)",
            TENANT_A_ID,
        )
        nog = bill_body(SELLER_A5_ID, f"selpx-{RUN}-nograde", f"NOGRADE-{RUN}", PAID)
        r3 = client.post(f"{BASE}/bills", headers=auth, json=nog)
        d3 = r3.json().get("detail", {})
        check(
            "424, NOT 422 — a 422 would mark it terminally failed and strand a tipped load",
            r3.status_code == 424,
            f"status={r3.status_code}",
        )
        check(
            "named seller_grade_unset, so the client never string-matches a message",
            isinstance(d3, dict) and d3.get("code") == "seller_grade_unset",
            f"code={d3.get('code') if isinstance(d3, dict) else None}",
        )
        exists = await db.fetchval(
            "SELECT count(*) FROM purchase_bills WHERE id = $1", uuid.UUID(nog["id"])
        )
        seq_after = await db.fetchval(
            "SELECT last_seq FROM doc_no_counters WHERE tenant_id = $1"
            " AND be_year = (SELECT max(be_year) FROM doc_no_counters WHERE tenant_id = $1)",
            TENANT_A_ID,
        )
        check("the refusal created no bill row", exists == 0, f"rows={exists}")
        check(
            "and burned no doc_no — parking must cost nothing",
            seq_before == seq_after,
            f"before={seq_before} after={seq_after}",
        )

        # ----------------------------------------------------------------- R4
        header("R4: a grade the office has not priced is ALSO 424, named differently")
        saved_c_price = await db.fetchval(
            "SELECT price FROM product_prices WHERE product_id = $1 AND grade = 'C'",
            PRODUCT_A_ID,
        )
        await db.execute(
            "DELETE FROM product_prices WHERE product_id = $1 AND grade = 'C'", PRODUCT_A_ID
        )
        r4 = client.post(
            f"{BASE}/bills",
            headers=auth,
            json=bill_body(SELLER_A3_ID, f"selpx-{RUN}-noprice", f"NOPRICE-{RUN}", PAID),
        )
        d4 = r4.json().get("detail", {})
        check(
            "the grade-C seller is parked with product_price_unset",
            r4.status_code == 424
            and isinstance(d4, dict)
            and d4.get("code") == "product_price_unset",
            f"status={r4.status_code} code={d4.get('code') if isinstance(d4, dict) else None}",
        )
        check(
            "the refusal names the grade, so the office knows which tier to add",
            isinstance(d4, dict) and d4.get("grade") == "C",
            f"grade={d4.get('grade') if isinstance(d4, dict) else None}",
        )
        # ...while a seller on a DIFFERENT grade is unaffected by the same gap.
        r4b = client.post(
            f"{BASE}/bills",
            headers=auth,
            json=bill_body(SELLER_A_ID, f"selpx-{RUN}-bstill", f"BSTILL-{RUN}", PAID),
        )
        check(
            "a grade-B seller still goes through — the gate is per grade, not per product",
            r4b.status_code == 201,
            f"status={r4b.status_code}",
        )

        # ----------------------------------------------------------------- R5
        header("R5: the bills on record now differ by seller AND by vehicle")
        rows = await db.fetch(
            "SELECT b.doc_no, s.code AS seller_code, s.grade, b.vehicle_no,"
            "       i.unit_price, i.list_price"
            " FROM purchase_bills b"
            " JOIN sellers s ON s.id = b.seller_id"
            " JOIN purchase_bill_items i ON i.bill_id = b.id"
            " WHERE b.idempotency_key LIKE $1 ORDER BY b.doc_no",
            f"selpx-{RUN}-%",
        )
        for r in rows:
            print(
                f"  {r['doc_no']:<12} {r['seller_code']} grade {r['grade']}"
                f"  vehicle {r['vehicle_no']:<14} paid {r['unit_price']} list {r['list_price']}"
            )
        check(
            "this run wrote bills under more than one seller",
            len({r["seller_code"] for r in rows}) > 1,
            f"sellers={sorted({r['seller_code'] for r in rows})}",
        )
        check(
            "with more than one vehicle_no",
            len({r["vehicle_no"] for r in rows}) > 1,
            f"vehicles={sorted({r['vehicle_no'] for r in rows})}",
        )
        check(
            "every line records the payment as an override of ITS OWN grade's list",
            all(r["unit_price"] != r["list_price"] for r in rows),
            "which is the comparison hard rule 6 stores both prices for",
        )

    finally:
        if saved_c_price is not None:
            await db.execute(
                "INSERT INTO product_prices (tenant_id, product_id, grade, price)"
                " VALUES ($1, $2, 'C', $3)"
                " ON CONFLICT (tenant_id, product_id, grade)"
                " DO UPDATE SET price = EXCLUDED.price",
                TENANT_A_ID, PRODUCT_A_ID, Decimal(saved_c_price),
            )
            restored = await db.fetchval(
                "SELECT price FROM product_prices WHERE product_id = $1 AND grade = 'C'",
                PRODUCT_A_ID,
            )
            print(f"\n  master data restored: FE-STEEL grade C = {restored}")
            if restored != saved_c_price:
                _failures.append("grade C price was not restored")
        client.close()
        await db.close()

    print()
    if _failures:
        print(f"FAILED — {len(_failures)} check(s): {_failures}")
        return 1
    print("  ALL CASES PASSED — the seller is per bill, and their grade prices it.")
    return 0


if __name__ == "__main__":
    code = asyncio.run(main())
    print(f"SELLERPX_EXIT={code}")
    sys.exit(code)
