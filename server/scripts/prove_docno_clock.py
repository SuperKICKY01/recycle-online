"""Prove doc_no's Buddhist-era year and the bill's arrival stamp are ONE moment.

    python scripts/prove_docno_clock.py --database recycle_clock_scratch

REFUSES TO RUN AGAINST THE LIVE DATABASE, and the refusal is the point. This
script LIES TO THE SERVER ABOUT THE TIME — it moves Python's clock across the
Buddhist new year while Postgres keeps the real one. Against unfixed code that
mints a bill numbered in the wrong year and opens a doc_no_counters row for a
year that has not happened, and hard rule 5 means neither can ever be removed.
A clock lie is not something you point at a real ledger.

WHAT IS BEING PROVEN

  C1  THE DISPROOF, offline. The two instants a straddling transaction actually
      produces, put through the REAL `_be_year`, with the wrong answer printed
      beside the right one. 150 milliseconds apart, one year apart in BE.
  C2  THE SAME STRADDLE THROUGH THE REAL create_bill, with Python's clock moved
      a year ahead and Postgres' left alone. The shipped code must be COMPLETELY
      INSENSITIVE to that lie: the year in doc_no, the year keying
      doc_no_counters, and the year of server_received_at must all agree, and no
      counter row may appear for the year the lie named.
  C3  the honest clock, same assertions, plus that the counter advances by
      exactly one and the next bill continues the same series.

WHY THE DEFECT WAS REAL, AND WHY A TOLERANCE WOULD NOT HAVE FIXED IT

`server_received_at` is `DEFAULT now()`, and Postgres' `now()` is TRANSACTION
START. The old code read `datetime.now(tz=utc)` in PYTHON, later in that same
transaction — after the seller lookup, the product lookups and the price
lookups. Two clocks AND two moments, and the gap is a whole master-data
round-trip wide, not a scheduling jitter.

It is not cosmetic and it is not repairable afterwards. `doc_no_counters` is
keyed on `(tenant_id, be_year)`, so a bill that took the wrong year did not
merely get a wrong label: it opened or advanced the WRONG COUNTER. The new
year's real first bill then finds a counter already at 1 and becomes B-<year>-2,
and there is no B-<year>-1 — a permanent gap in a legal document sequence, which
is exactly what reconcile.py's T8 exists to scream about and exactly what
nothing can go back and repair.

THE FIX IS AN ORDERING, NOT A TOLERANCE. The transaction's own instant is read
FIRST, the year is derived from THAT instant with the one `_be_year` authority,
and the SAME value is written to server_received_at explicitly. One value, used
twice. There is no window left to be tolerant about.
"""
from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import os
import re
import sys
import uuid
from decimal import Decimal

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SERVER_DIR)

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

try:  # pragma: no cover
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

RUN = uuid.uuid4().hex[:8]
DOC_NO_RE = re.compile(r"^B-(\d{4})-([1-9]\d*)$")

_failures: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> bool:
    print(f"  [{'OK  ' if ok else 'FAIL'}] {label}" + (f" - {detail}" if detail else ""))
    if not ok:
        _failures.append(label)
    return ok


def header(title: str) -> None:
    print(f"\n=== {title} ===")


class LyingClock:
    """Stands in for `datetime` inside app.bills. Only `now` is overridden.

    Patched in AFTER import, so the Pydantic models built from the real
    `datetime` annotation are already constructed and untouched.
    """

    def __init__(self, instant: dt.datetime, real: type[dt.datetime]) -> None:
        self.instant = instant
        self._real = real
        self.reads = 0

    def now(self, tz: dt.tzinfo | None = None) -> dt.datetime:
        self.reads += 1
        return self.instant.astimezone(tz) if tz else self.instant

    def __getattr__(self, name: str):        # everything else is the real thing
        return getattr(self._real, name)


async def main() -> int:
    ap = argparse.ArgumentParser(description="Prove the doc_no year and the arrival "
                                             "stamp come from one moment.")
    ap.add_argument("--database", required=True,
                    help="a SCRATCH database. This script lies about the time; "
                         "against unfixed code that permanently corrupts a doc_no "
                         "series, so it may not be pointed at the live database.")
    args = ap.parse_args()

    from sqlalchemy.engine import make_url

    live = make_url(os.environ["APP_DATABASE_URL"])
    if args.database == live.database:
        print(f"REFUSED: --database {args.database!r} is the LIVE database.\n"
              "  This script moves Python's clock across the Buddhist new year. On code\n"
              "  that derives be_year from that clock it mints a bill in a year that has\n"
              "  not happened and opens a doc_no_counters row for it — and hard rule 5\n"
              "  means neither can be removed. Restore a copy and point it there:\n"
              "    python scripts/backup_db.py\n"
              "    python scripts/restore_db.py <dir> --into recycle_clock_scratch")
        return 2
    os.environ["APP_DATABASE_URL"] = live.set(
        database=args.database).render_as_string(hide_password=False)

    import app.bills as bills  # noqa: E402
    from app.auth import Principal  # noqa: E402
    from app.bills import BillCreate, BillItemIn, _be_year, create_bill  # noqa: E402
    from app.config import SHOP_TIMEZONE  # noqa: E402
    from app.db import tenant_connection  # noqa: E402
    from app.seeddata import PRODUCT_A_ID, SELLER_A_ID, TENANT_A_ID  # noqa: E402
    from fastapi import Response  # noqa: E402
    from sqlalchemy import text  # noqa: E402

    print("=== prove_docno_clock ===")
    print(f"  database : {args.database} (live {live.database!r} is not touched)")
    print(f"  shop tz  : {SHOP_TIMEZONE}")
    print(f"  run tag  : {RUN}")

    # ---------------------------------------------------------------- C1
    header("C1 — the disproof, offline: two instants 150ms apart, one year apart")
    tx_start = dt.datetime(2026, 12, 31, 23, 59, 59, 900000, tzinfo=SHOP_TIMEZONE)
    py_read = dt.datetime(2027, 1, 1, 0, 0, 0, 50000, tzinfo=SHOP_TIMEZONE)
    year_of_stamp = _be_year(tx_start)
    year_of_python = _be_year(py_read)
    gap_ms = (py_read - tx_start).total_seconds() * 1000
    print(f"  transaction start (Postgres now(), -> server_received_at)"
          f" : {tx_start.isoformat()}  -> BE {year_of_stamp}")
    print(f"  python read later in the SAME transaction (the old be_year)"
          f" : {py_read.isoformat()}  -> BE {year_of_python}")
    print(f"  the two are {gap_ms:.0f} ms apart and {year_of_python - year_of_stamp}"
          f" Buddhist year apart")
    check("the OLD source of be_year disagrees with the stamp at the boundary",
          year_of_python != year_of_stamp,
          f"doc_no would say {year_of_python}, the bill arrived in {year_of_stamp}")
    check("and it is the COUNTER KEY, so the damage is a numbering gap, not a label",
          year_of_python == year_of_stamp + 1,
          f"doc_no_counters would open (tenant, {year_of_python}) a year early;"
          f" the real first bill of {year_of_python} then becomes seq 2")

    # ---------------------------------------------------------------- fixtures
    async with tenant_connection(TENANT_A_ID) as conn:
        user_id = (await conn.execute(text(
            "SELECT id FROM users WHERE role = 'admin' ORDER BY username LIMIT 1"
        ))).scalar_one()
        price = (await conn.execute(text(
            "SELECT p.price FROM product_prices p JOIN sellers s ON s.grade = p.grade"
            " WHERE p.product_id = :p AND s.id = :s"), {"p": PRODUCT_A_ID, "s": SELLER_A_ID}
        )).scalar_one()
    principal = Principal(user_id=user_id, tenant_id=TENANT_A_ID,
                          username="admin", role="admin")
    print(f"\n  tenant {TENANT_A_ID}, admin {user_id}, list price {price}")

    async def make_bill(tag: str) -> dict:
        body = BillCreate(
            id=uuid.uuid4(), seller_id=SELLER_A_ID,
            device_created_at=dt.datetime.now(dt.timezone.utc),
            idempotency_key=f"clock-{RUN}-{tag}",
            items=[BillItemIn(
                id=uuid.uuid4(), product_id=PRODUCT_A_ID, line_no=1,
                gross_weight=Decimal("2.000"), tare_weight=Decimal("0.000"),
                net_weight=Decimal("2.000"), unit_price=price)],
        )
        return await create_bill(body, Response(), principal)

    async def read_back(bill_id) -> tuple[str, dt.datetime, dict[int, int]]:
        async with tenant_connection(TENANT_A_ID) as conn:
            row = (await conn.execute(text(
                "SELECT doc_no, server_received_at FROM purchase_bills WHERE id = :i"),
                {"i": bill_id})).mappings().one()
            counters = {c["be_year"]: c["last_seq"] for c in (await conn.execute(text(
                "SELECT be_year, last_seq FROM doc_no_counters"))).mappings().all()}
        return row["doc_no"], row["server_received_at"], counters

    def assert_agreement(label: str, doc_no: str, received: dt.datetime,
                         counters: dict[int, int]) -> int:
        m = DOC_NO_RE.match(doc_no or "")
        if not check(f"{label}: doc_no has the shape B-<be_year>-<seq>", bool(m), doc_no):
            return -1
        year, seq = int(m.group(1)), int(m.group(2))
        arrived = _be_year(received)
        print(f"      doc_no={doc_no}  server_received_at={received.astimezone(SHOP_TIMEZONE).isoformat()}")
        print(f"      be_year in doc_no={year}   be_year of the stamp={arrived}"
              f"   counters={dict(sorted(counters.items()))}")
        check(f"{label}: the year in doc_no IS the year the bill arrived in",
              year == arrived, f"doc_no says {year}, the stamp says {arrived}")
        check(f"{label}: the COUNTER KEY is that same year, and covers this bill",
              counters.get(year, 0) >= seq,
              f"counter for {year} is {counters.get(year)}, this bill is seq {seq}")
        return year

    # ---------------------------------------------------------------- C2
    header("C2 — the same straddle through the REAL create_bill, clock lied to")
    # Captured as year -> last_seq, not as a SET of years. A set would let this
    # pass on a scratch database some earlier run had already corrupted: the bad
    # year would be in `before`, so "no NEW year appeared" would be true while the
    # counter moved again. The claim is that the lied-about counter DID NOT MOVE.
    async with tenant_connection(TENANT_A_ID) as conn:
        before = {c["be_year"]: c["last_seq"] for c in (await conn.execute(text(
            "SELECT be_year, last_seq FROM doc_no_counters"))).mappings().all()}

    real_datetime = bills.datetime
    lie = LyingClock(dt.datetime(2027, 1, 1, 0, 0, 5, tzinfo=SHOP_TIMEZONE), real_datetime)
    lied_year = _be_year(lie.instant)
    print(f"  Python's clock inside app.bills now reads {lie.instant.isoformat()}"
          f" (BE {lied_year}).")
    print("  Postgres' clock is untouched. Any be_year taken from Python lands on"
          f" {lied_year}.")
    bills.datetime = lie                      # type: ignore[assignment]
    try:
        created = await make_bill("straddle")
    finally:
        bills.datetime = real_datetime        # type: ignore[assignment]
    doc_no, received, counters = await read_back(created["id"])
    honest_year = _be_year(received)
    year = assert_agreement("C2", doc_no, received, counters)

    check("C2: the lie changed NOTHING — be_year did not follow Python's clock",
          year == honest_year and year != lied_year,
          f"python said {lied_year}, the bill took {year}, the stamp is {honest_year}")
    check(f"C2: the counter for {lied_year} — a year that has not happened — did NOT move",
          counters.get(lied_year) == before.get(lied_year),
          f"be_year {lied_year}: last_seq before={before.get(lied_year)}"
          f" after={counters.get(lied_year)}")
    print(f"      (the old code read Python here and would have taken BE {lied_year}"
          f" — C1 above shows that instant's derivation)")

    # ---------------------------------------------------------------- C3
    header("C3 — the honest clock: the same agreement, and the series continues")
    seq_before = counters.get(honest_year, 0)
    c3 = await make_bill("honest")
    doc3, recv3, counters3 = await read_back(c3["id"])
    assert_agreement("C3", doc3, recv3, counters3)
    check("C3: the counter advanced by exactly one",
          counters3.get(honest_year, 0) == seq_before + 1,
          f"{seq_before} -> {counters3.get(honest_year)}")
    m2, m3 = DOC_NO_RE.match(doc_no), DOC_NO_RE.match(doc3)
    check("C3: the two bills are consecutive in the SAME series — the lied-to bill"
          " did not wander off into its own year",
          m2.group(1) == m3.group(1) and int(m3.group(2)) == int(m2.group(2)) + 1,
          f"{doc_no} then {doc3}")

    header("summary")
    print(f"  failures: {len(_failures)}")
    for f in _failures:
        print(f"    - {f}")
    if _failures:
        print("\nPROVE_DOCNO_CLOCK FAILED")
        return 1
    print("\nPROVE_DOCNO_CLOCK OK: the doc_no year, the counter key and the arrival"
          "\nstamp are one moment, and lying to Python's clock cannot separate them.")
    return 0


if __name__ == "__main__":
    try:
        code = asyncio.run(main())
    except Exception as exc:  # noqa: BLE001
        import traceback

        traceback.print_exc()
        print(f"\nPROVE_DOCNO_CLOCK FAILED: {type(exc).__name__}")
        code = 1
    print(f"PROVE_DOCNO_CLOCK_EXIT={code}")
    sys.exit(code)
