"""Prove doc_no's Buddhist-era year comes from the SHOP's date, not UTC's.

    python scripts/prove_shop_time.py     (from the server/ directory)

WHY THIS IS NOT COSMETIC. doc_no is a legal document number, and
doc_no_counters is keyed on (tenant_id, be_year). Deriving be_year from the UTC
date meant that for the seven hours either side of new year — 00:00 to 06:59 in
Bangkok, when UTC is still 31 December — a bill would take the PREVIOUS year's
be_year. Two consequences, both bad: the number on the document names the wrong
business year, and the new year's sequence does not restart at 1 because the
counter row for the old year is what gets incremented.

WHAT IS PROVEN WHERE, and why it is split. be_year derives from the moment the
server RECEIVES the bill (doc_no is arrival order — see
lessons/doc-no-is-arrival-order-not-event-time.md), not from any client-supplied
timestamp. So a proof cannot place a real HTTP request at a chosen instant
without injecting a clock into the server, which this pass does not do. Instead:

  S1/S2  the boundary is proven AT THE FUNCTION that computes it, against
         instants chosen to straddle new year, including the disproof that the
         old UTC-based expression really would have answered differently;
  S3     the WIRING is proven over real HTTP — that the be_year the function
         returns is the one that reaches doc_no and the counter key.

Together those cover the behaviour. Stated plainly rather than implying an
end-to-end test placed a bill on new year's eve, because it did not.

Run-twice safe (lessons/proof-must-run-twice.md): per-run idempotency key, and
doc_no asserted by shape and by delta against the counter, never an absolute.
"""
from __future__ import annotations

import asyncio
import datetime as dt
import os
import re
import sys
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncpg  # noqa: E402
import httpx  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

from app.bills import _BE_OFFSET, _be_year  # noqa: E402
from app.config import SHOP_TIMEZONE, SHOP_TIMEZONE_NAME  # noqa: E402
from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    PRODUCT_A_ID,
    SELLER_A_ID,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
)

load_dotenv()

BASE = os.environ.get("API_BASE_URL", "http://127.0.0.1:8099")
RUN = uuid.uuid4().hex[:8]

_failures: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'OK  ' if ok else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))
    if not ok:
        _failures.append(label)


def header(text: str) -> None:
    print(f"\n=== {text} ===")


async def main() -> int:
    print("Phase 2c-7 — shop-timezone doc_no year, proof")
    print(f"  shop timezone = {SHOP_TIMEZONE_NAME} ({SHOP_TIMEZONE})")

    # ---------------------------------------------------------------- S1 ----
    header("S1: the new-year boundary — a Bangkok instant that is still last year in UTC")

    # 2027-01-01 00:30 in Bangkok is 2026-12-31 17:30 UTC. The shop is in the new
    # year; UTC is not.
    boundary = dt.datetime(2026, 12, 31, 17, 30, tzinfo=dt.timezone.utc)
    shop_wall = boundary.astimezone(SHOP_TIMEZONE)
    print(f"  instant {boundary.isoformat()}  ->  Bangkok {shop_wall.isoformat()}")

    check(
        "the instant really does straddle new year (the case is not vacuous)",
        boundary.year == 2026 and shop_wall.year == 2027,
        f"UTC year={boundary.year} shop year={shop_wall.year}",
    )
    check(
        "be_year is the SHOP's year, 2570",
        _be_year(boundary) == 2027 + _BE_OFFSET,
        f"_be_year={_be_year(boundary)} expected={2027 + _BE_OFFSET}",
    )
    # THE DISPROOF: the expression this replaced, evaluated on the same instant.
    old_be_year = boundary.year + _BE_OFFSET
    check(
        "and the OLD UTC-based expression really would have said 2569 — the bug was real",
        old_be_year == 2026 + _BE_OFFSET and old_be_year != _be_year(boundary),
        f"old={old_be_year} new={_be_year(boundary)} — differ by {_be_year(boundary) - old_be_year} year",
    )

    # ---------------------------------------------------------------- S2 ----
    header("S2: the rest of the boundary window, and the hours that were never wrong")
    cases: list[tuple[dt.datetime, int, str]] = [
        # instant (UTC)                                        expected shop year, note
        (dt.datetime(2026, 12, 31, 16, 59, tzinfo=dt.timezone.utc), 2026, "23:59 Bangkok, still old year"),
        (dt.datetime(2026, 12, 31, 17, 0, tzinfo=dt.timezone.utc), 2027, "00:00 Bangkok, first minute of the new year"),
        (dt.datetime(2026, 12, 31, 23, 59, tzinfo=dt.timezone.utc), 2027, "06:59 Bangkok, last wrong minute under the old code"),
        (dt.datetime(2027, 1, 1, 0, 0, tzinfo=dt.timezone.utc), 2027, "07:00 Bangkok, UTC catches up"),
        (dt.datetime(2026, 7, 26, 8, 16, tzinfo=dt.timezone.utc), 2026, "an ordinary afternoon, unaffected"),
    ]
    for instant, want_year, note in cases:
        got = _be_year(instant)
        want = want_year + _BE_OFFSET
        check(
            f"{instant.strftime('%Y-%m-%d %H:%M')}Z -> be_year {want} ({note})",
            got == want,
            f"got={got}",
        )

    # ---------------------------------------------------------------- S3 ----
    header("S3: the wiring — the value reaches doc_no AND the counter key, over real HTTP")

    url = os.environ["APP_DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    db = await asyncpg.connect(url)
    client = httpx.Client(timeout=20.0)
    try:
        await db.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_A_ID))

        token = client.post(
            f"{BASE}/auth/login",
            json={
                "tenant_id": str(TENANT_A_ID),
                "username": ADMIN_USERNAME,
                "password": TENANT_A_PASSWORD,
            },
        ).json()["access_token"]
        auth = {"authorization": f"Bearer {token}"}

        # The be_year the server SHOULD use for a bill arriving right now.
        expected_be = _be_year(dt.datetime.now(tz=dt.timezone.utc))

        r = client.post(
            f"{BASE}/bills",
            headers=auth,
            json={
                "id": str(uuid.uuid4()),
                "seller_id": str(SELLER_A_ID),
                "vehicle_no": f"TZ-{RUN}",
                "device_created_at": "2026-07-26T08:00:00+00:00",
                "idempotency_key": f"shoptime-{RUN}",
                "items": [
                    {
                        "id": str(uuid.uuid4()),
                        "product_id": str(PRODUCT_A_ID),
                        "line_no": 1,
                        "gross_weight": "1.000",
                        "tare_weight": "0.000",
                        "net_weight": "1.000",
                        "unit_price": "15.00",
                    }
                ],
            },
        )
        check("the bill was accepted", r.status_code == 201, f"status={r.status_code}")
        doc_no = (r.json() or {}).get("doc_no") or ""
        m = re.fullmatch(r"B-(\d{4})-(\d+)", doc_no)
        check("doc_no has the expected shape B-<be_year>-<seq>", m is not None, f"doc_no={doc_no}")

        if m is not None:
            doc_be = int(m.group(1))
            doc_seq = int(m.group(2))
            check(
                "the BE year in doc_no is the SHOP-timezone year",
                doc_be == expected_be,
                f"doc_no be_year={doc_be} expected={expected_be}",
            )
            # The counter is keyed on that same be_year, and the bill took the
            # sequence that row now holds. Asserted as a delta, never an absolute.
            last_seq = await db.fetchval(
                "SELECT last_seq FROM doc_no_counters WHERE tenant_id = $1 AND be_year = $2",
                TENANT_A_ID,
                doc_be,
            )
            check(
                "doc_no_counters is keyed on the SAME be_year, and holds this bill's sequence",
                last_seq is not None and last_seq >= doc_seq,
                f"counter row (tenant, {doc_be}).last_seq={last_seq} bill seq={doc_seq}",
            )
            # And nothing was written under the UTC year when the two differ.
            utc_be = dt.datetime.now(tz=dt.timezone.utc).year + _BE_OFFSET
            if utc_be != expected_be:
                stray = await db.fetchval(
                    "SELECT last_seq FROM doc_no_counters WHERE tenant_id = $1 AND be_year = $2",
                    TENANT_A_ID,
                    utc_be,
                )
                check(
                    "no counter row was created under the UTC year",
                    stray is None,
                    f"utc be_year={utc_be} row={stray}",
                )
            else:
                print(
                    f"  (note: right now the shop year and the UTC year agree at {expected_be};"
                    " the divergence itself is covered by S1/S2)"
                )
    finally:
        client.close()
        await db.close()

    print()
    if _failures:
        print(f"FAILED — {len(_failures)} check(s): {_failures}")
        return 1
    print("  ALL CASES PASSED — be_year is the shop's year, and it reaches doc_no and the counter key.")
    return 0


if __name__ == "__main__":
    code = asyncio.run(main())
    print(f"SHOPTIME_EXIT={code}")
    sys.exit(code)
