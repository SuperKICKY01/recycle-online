"""Prove the two SPECIES of rejection over real HTTP.

    python scripts/prove_master_data_gate.py     (from the server/ directory)

A rejection means the server understood the bill and refused it. Two kinds:

  PERMANENT (422)  — malformed money. No action makes this payload valid, so the
                     client marks it terminally failed and surfaces it.
  RESOLVABLE (424) — the bill is well-formed but master data it depends on is not
                     set up. It BECOMES valid when the office adds the price, so
                     the client parks it instead of failing it. Marking it
                     terminal would strand a load already tipped into the pile and
                     force the yard to re-weigh scrap that no longer exists.

The point being proven is that the SAME bill — same id, same idempotency_key —
goes through after the price appears. No re-weighing, no duplicate.

STATE: this script touches only EXISTING master data (it removes one price row
and one seller grade, then restores both in a finally block). It creates no
fixtures to leave behind. The bills it creates are left in place: hard rule 5,
no hard deletes on transactions. Idempotency keys and bill ids are per-run, and
doc_no is asserted by shape, so it passes twice in a row against a live database
(lessons/proof-must-run-twice.md).
"""
from __future__ import annotations

import asyncio
import datetime as dt
import os
import re
import sys
import uuid
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncpg  # noqa: E402
import httpx  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

from app.bills import _be_year  # noqa: E402
from app.seeddata import (  # noqa: E402
    PRODUCT_A_ID,
    SELLER_A_ID,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
    ADMIN_USERNAME,
)

load_dotenv()

BASE = os.environ.get("API_BASE_URL", "http://127.0.0.1:8099")
RUN = uuid.uuid4().hex[:8]
# The counter is keyed on (tenant_id, be_year), so the year has to be the SHOP's
# — derived by the server's own function, never written as a literal. A hardcoded
# 2569 is a proof with an expiry date on it: correct until 2027-01-01, then red
# every run for a reason that has nothing to do with the behaviour under test.
BE_YEAR = _be_year(dt.datetime.now(tz=dt.timezone.utc))
GRADE = "B"  # seller A's grade, seeded

_failures: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'OK  ' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        _failures.append(label)


def header(text: str) -> None:
    print(f"\n=== {text} ===")


def _bill_body(bill_id: str, key: str) -> dict:
    """One well-formed line against the seeded FE-STEEL product."""
    return {
        "id": bill_id,
        "seller_id": str(SELLER_A_ID),
        "vehicle_no": f"MD-{RUN}",
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
                "unit_price": "15.00",
                # Deliberately a lie; the server stamps list_price itself (S5).
                "list_price": "999.00",
            }
        ],
    }


async def main() -> int:
    url = os.environ["APP_DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    db = await asyncpg.connect(url)
    await db.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_A_ID))

    saved_price = await db.fetchval(
        "SELECT price FROM product_prices WHERE product_id = $1 AND grade = $2",
        PRODUCT_A_ID, GRADE,
    )
    if saved_price is None:
        print("SETUP FAILED: seeded price for FE-STEEL grade B not found. Run seed_dev.py.")
        return 1

    client = httpx.Client(timeout=20.0)
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

        # ---------------------------------------------------------------- M1
        header("M1: no price tier for the seller's grade -> 424 RESOLVABLE, named in the body")

        # The office has not set this price up yet.
        await db.execute(
            "DELETE FROM product_prices WHERE product_id = $1 AND grade = $2",
            PRODUCT_A_ID, GRADE,
        )

        bill_id = str(uuid.uuid4())
        key = f"mdgate-{RUN}-1"
        body = _bill_body(bill_id, key)

        seq_before = await db.fetchval(
            "SELECT last_seq FROM doc_no_counters WHERE tenant_id = $1 AND be_year = $2",
            TENANT_A_ID, BE_YEAR,
        )

        r = client.post(f"{BASE}/bills", headers=auth, json=body)
        detail = r.json().get("detail", {})
        check("the server refuses it with 424, not 422", r.status_code == 424, f"status={r.status_code}")
        check(
            "the refusal NAMES its kind — the client never string-matches a message",
            isinstance(detail, dict) and detail.get("kind") == "master_data_missing",
            f"kind={detail.get('kind') if isinstance(detail, dict) else detail!r}",
        )
        check(
            "with a machine-readable code identifying WHICH master data is missing",
            isinstance(detail, dict) and detail.get("code") == "product_price_unset",
            f"code={detail.get('code') if isinstance(detail, dict) else None}",
        )
        check(
            "and the context needed to fix it",
            isinstance(detail, dict) and detail.get("grade") == GRADE
            and detail.get("product_id") == str(PRODUCT_A_ID),
            f"product_id={detail.get('product_id') if isinstance(detail, dict) else None} grade={detail.get('grade') if isinstance(detail, dict) else None}",
        )

        # ---------------------------------------------------------------- M2
        header("M2: the refusal cost nothing — no bill, and no doc_no burned")
        exists = await db.fetchval("SELECT count(*) FROM purchase_bills WHERE id = $1", uuid.UUID(bill_id))
        seq_after = await db.fetchval(
            "SELECT last_seq FROM doc_no_counters WHERE tenant_id = $1 AND be_year = $2",
            TENANT_A_ID, BE_YEAR,
        )
        check("no bill row was created", exists == 0, f"rows={exists}")
        check(
            "the gap-free counter did NOT advance — a resolvable refusal never burns a number",
            seq_before == seq_after,
            f"before={seq_before} after={seq_after}",
        )

        # ---------------------------------------------------------------- M3
        header("M3: a PERMANENT refusal is a DIFFERENT status — malformed money stays 422")
        malformed = _bill_body(str(uuid.uuid4()), f"mdgate-{RUN}-malformed")
        malformed["items"][0]["gross_weight"] = "1.0005"   # 4dp, cannot ever be valid
        malformed["items"][0]["net_weight"] = "1.0005"
        rm = client.post(f"{BASE}/bills", headers=auth, json=malformed)
        check(
            "malformed input is 422, never 424 — the two species are distinguishable by status alone",
            rm.status_code == 422,
            f"status={rm.status_code}",
        )

        # ---------------------------------------------------------------- M4
        header("M4: the office adds the price — the SAME bill, SAME key, now goes through")
        await db.execute(
            "INSERT INTO product_prices (tenant_id, product_id, grade, price)"
            " VALUES ($1, $2, $3, $4)"
            " ON CONFLICT (tenant_id, product_id, grade) DO UPDATE SET price = EXCLUDED.price",
            TENANT_A_ID, PRODUCT_A_ID, GRADE, Decimal(saved_price),
        )

        # Byte-identical payload. Nothing was re-weighed and nothing re-keyed.
        r2 = client.post(f"{BASE}/bills", headers=auth, json=body)
        check("the identical payload is now accepted", r2.status_code == 201, f"status={r2.status_code}")
        got = r2.json() if r2.status_code == 201 else {}
        check(
            "it is the SAME bill id the yard weighed",
            got.get("id") == bill_id,
            f"id={got.get('id')}",
        )
        check(
            "carrying the SAME idempotency key",
            got.get("idempotency_key") == key,
            f"key={got.get('idempotency_key')}",
        )
        check(
            "it received a doc_no of the right shape",
            bool(re.fullmatch(rf"B-{BE_YEAR}-\d+", got.get("doc_no") or "")),
            f"doc_no={got.get('doc_no')}",
        )
        check(
            "and list_price was stamped from the price the office just added, not from the client's 999.00",
            got.get("items", [{}])[0].get("list_price") == str(saved_price),
            f"list_price={got.get('items', [{}])[0].get('list_price')} expected={saved_price}",
        )

        # ---------------------------------------------------------------- M5
        header("M5: exactly one bill — parking then retrying never duplicates")
        count = await db.fetchval(
            "SELECT count(*) FROM purchase_bills WHERE idempotency_key = $1", key
        )
        check("exactly one bill exists for that key", count == 1, f"count={count}")

        r3 = client.post(f"{BASE}/bills", headers=auth, json=body)
        count_again = await db.fetchval(
            "SELECT count(*) FROM purchase_bills WHERE idempotency_key = $1", key
        )
        check(
            "re-sending after the gate opened returns the existing bill (200), not a second one",
            r3.status_code == 200 and count_again == 1,
            f"status={r3.status_code} count={count_again}",
        )

        # ---------------------------------------------------------------- M6
        header("M6: the seller-grade gate is resolvable too, and named distinctly")
        await db.execute("UPDATE sellers SET grade = NULL WHERE id = $1", SELLER_A_ID)
        r4 = client.post(
            f"{BASE}/bills", headers=auth,
            json=_bill_body(str(uuid.uuid4()), f"mdgate-{RUN}-nograde"),
        )
        d4 = r4.json().get("detail", {})
        check(
            "a seller with no grade is 424 with its own code",
            r4.status_code == 424
            and isinstance(d4, dict)
            and d4.get("code") == "seller_grade_unset",
            f"status={r4.status_code} code={d4.get('code') if isinstance(d4, dict) else None}",
        )

    finally:
        # Restore EXACTLY what was borrowed, whatever happened above.
        await db.execute("UPDATE sellers SET grade = $2 WHERE id = $1", SELLER_A_ID, GRADE)
        await db.execute(
            "INSERT INTO product_prices (tenant_id, product_id, grade, price)"
            " VALUES ($1, $2, $3, $4)"
            " ON CONFLICT (tenant_id, product_id, grade) DO UPDATE SET price = EXCLUDED.price",
            TENANT_A_ID, PRODUCT_A_ID, GRADE, Decimal(saved_price),
        )
        restored_price = await db.fetchval(
            "SELECT price FROM product_prices WHERE product_id = $1 AND grade = $2",
            PRODUCT_A_ID, GRADE,
        )
        restored_grade = await db.fetchval("SELECT grade FROM sellers WHERE id = $1", SELLER_A_ID)
        print()
        print(f"  master data restored: price={restored_price} sellerGrade={restored_grade}")
        if restored_price != saved_price or restored_grade != GRADE:
            _failures.append("master data was not restored")
        client.close()
        await db.close()

    print()
    if _failures:
        print(f"FAILED — {len(_failures)} check(s): {_failures}")
        return 1
    print("  ALL CASES PASSED — resolvable refusals are named, cost nothing, and clear without re-weighing.")
    return 0


if __name__ == "__main__":
    code = asyncio.run(main())
    print(f"MDGATE_EXIT={code}")
    sys.exit(code)
