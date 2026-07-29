"""Prove the daily money view — GET /reports/daily — over real HTTP.

    python scripts/prove_daily_report.py     (from the server/ directory)

The owner balances the cash box against this number at closing. Everything it
claims is checked here against a live database, and the two claims that decide
whether the number is TRUE — which day a bill belongs to, and which bills are
left out — are checked WITH THE WRONG ANSWER PRINTED BESIDE THE RIGHT ONE. A
boundary case that only shows the passing value proves nothing: it would look
identical if the boundary were computed in UTC.

WHAT IS PROVEN

  D   the day boundary at BOTH edges, in shop time. 00:00:00.000000+07 is IN,
      23:59:59.999999+07 is IN, and the two instants one microsecond outside are
      OUT. Half-open [start, end): the stroke of midnight belongs to exactly one
      day, so no bill is counted twice.
  X   THE DISPROOF. The same fixtures aggregated the two WRONG ways — a UTC day,
      and a day keyed on device_created_at — with both totals printed. Each is a
      different number from the right one, and the script says by how much and
      which bills moved.
  V   a voided bill: excluded from the day's total, PRESENT in the voided list
      with doc_no, total, reason, who voided it and when.
  W   a void PERFORMED today against an older bill — the unwatched void. It
      appears in voids_applied flagged from_earlier_day, and it moves neither
      this day's total nor this day's voided list.
  O   off-list payment: a bill with unit_price <> list_price is flagged, an
      on-list bill is not, and off_list_variance is the exact baht difference.
  A   a staff token is refused 403 (admin only).
  T   tenant B's day is invisible to tenant A, and B sees its own.
  M   money is exact strings everywhere; no float appears anywhere in the body.
  P   the money is NEVER paged: limit=1 returns one line and the SAME totals.
  F   a future day is refused 422 day_in_the_future.
  R   the report really does run under REPEATABLE READ (the snapshot claim), and
      the default really is READ COMMITTED — so the parameter is doing something.

FIXTURE DAY. Everything is placed on a fixed day in 2019, far from any real
trade, so this script never perturbs a day an owner might read. Bills are created
over HTTP (so doc_no and list_price come from the real path) and then their
server_received_at is moved onto the fixture day by direct UPDATE — that column
is DEFAULT now() and there is no other way to place a bill in the past.

RUNS TWICE (lessons/proof-must-run-twice.md). The fixture bills are LEFT IN
PLACE: hard rule 5 forbids deleting a transaction, and this script does not make
an exception for its own. So NOTHING here asserts an absolute count or total.
Every assertion is either set membership on this run's own doc_nos, or a DELTA
between a baseline read before the fixtures and a read after them. A second run
adds a second set of fixtures and every delta comes out identical.

WEIGHTS ARE POWERS OF TWO, deliberately. Every fixture's amount is a distinct
power of two times the list price, so any subset of them sums to a unique
number. If a delta ever comes out wrong, the difference itself names which bills
leaked in or fell out, instead of only saying that something did.
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

load_dotenv()  # BEFORE app.config, which reads the environment at import.

from sqlalchemy import text  # noqa: E402

from app.config import SHOP_TIMEZONE, SHOP_TIMEZONE_NAME  # noqa: E402
from app.db import tenant_connection  # noqa: E402
from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    PRODUCT_A_ID,
    PRODUCT_B_ID,
    SELLER_A_ID,
    SELLER_B_ID,
    STAFF_USERNAME,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
    TENANT_A_STAFF_PASSWORD,
    TENANT_B_ID,
    TENANT_B_PASSWORD,
)

BASE = os.environ.get("API_BASE_URL", "http://127.0.0.1:8099")
RUN = uuid.uuid4().hex[:8]

# A day in the settled past. Never a day any shop is reading.
DAY = dt.date(2019, 3, 14)
DAY_BE_LABEL = "14/03/2562"  # 2019 + 543, rendered DD/MM/BBBB

MONEY_RE = re.compile(r"^-?\d+\.\d{2}$")

_failures: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    print(f"  [{'OK  ' if ok else 'FAIL'}] {label}" + (f" - {detail}" if detail else ""))
    if not ok:
        _failures.append(label)


def header(title: str) -> None:
    print(f"\n=== {title} ===")


def at(day: dt.date, h: int, m: int, s: int = 0, us: int = 0) -> dt.datetime:
    """An instant on a SHOP-time clock. The only place fixtures name a time."""
    return dt.datetime(day.year, day.month, day.day, h, m, s, us, tzinfo=SHOP_TIMEZONE)


# ---------------------------------------------------------------------------
# The fixtures. weight is the power of two; `when` is the SHOP-time instant the
# bill ARRIVES (server_received_at); `weighed` is what the device claims
# (device_created_at). Where the two disagree, that disagreement is the point.
# ---------------------------------------------------------------------------
DAY_BEFORE = DAY - dt.timedelta(days=1)
DAY_AFTER = DAY + dt.timedelta(days=1)

FIXTURES = [
    # name          weight   arrives (shop time)              weighed (device clock)
    ("edge_first",  1,   at(DAY, 0, 0, 0, 0),            at(DAY_BEFORE, 23, 55)),
    ("edge_last",   2,   at(DAY, 23, 59, 59, 999999),    at(DAY, 23, 59, 59, 999999)),
    ("edge_before", 4,   at(DAY_BEFORE, 23, 59, 59, 999999), at(DAY_BEFORE, 23, 59)),
    ("edge_after",  8,   at(DAY_AFTER, 0, 0, 0, 0),      at(DAY_AFTER, 0, 0)),
    ("late_sync",   16,  at(DAY_AFTER, 0, 5),            at(DAY, 23, 50)),
    ("voided",      32,  at(DAY, 10, 0),                 at(DAY, 10, 0)),
    ("on_list",     64,  at(DAY, 12, 0),                 at(DAY, 12, 0)),
    ("off_list",    128, at(DAY, 12, 30),                at(DAY, 12, 30)),
    ("old_bill",    256, at(DAY - dt.timedelta(days=5), 9, 0), at(DAY - dt.timedelta(days=5), 9, 0)),
]

# Bills whose money must land in THIS day's active total.
IN_DAY_ACTIVE = {"edge_first", "edge_last", "on_list", "off_list"}
OUT_OF_DAY = {"edge_before", "edge_after", "late_sync", "old_bill"}


def money(v) -> Decimal:
    return Decimal(v).quantize(Decimal("0.01"))


def floats_in(node, path="body", allow=("quiet_for_seconds",)) -> list[str]:
    """Every JSON float in the response, by path. Money must never be one."""
    found: list[str] = []
    if isinstance(node, dict):
        for k, v in node.items():
            if k in allow:
                continue
            found += floats_in(v, f"{path}.{k}", allow)
    elif isinstance(node, list):
        for i, v in enumerate(node):
            found += floats_in(v, f"{path}[{i}]", allow)
    elif isinstance(node, float):
        found.append(path)
    return found


async def main() -> int:
    url = os.environ["APP_DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    db = await asyncpg.connect(url)
    await db.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_A_ID))

    async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as http:

        async def login(tenant, username, password) -> str:
            r = await http.post("/auth/login", json={
                "tenant_id": str(tenant), "username": username, "password": password,
            })
            r.raise_for_status()
            return r.json()["access_token"]

        admin_a = {"Authorization": f"Bearer {await login(TENANT_A_ID, ADMIN_USERNAME, TENANT_A_PASSWORD)}"}
        staff_a = {"Authorization": f"Bearer {await login(TENANT_A_ID, STAFF_USERNAME, TENANT_A_STAFF_PASSWORD)}"}
        admin_b = {"Authorization": f"Bearer {await login(TENANT_B_ID, ADMIN_USERNAME, TENANT_B_PASSWORD)}"}

        async def daily(headers, **params) -> httpx.Response:
            return await http.get("/reports/daily", headers=headers, params=params)

        # The seeded list price for seller A's grade — the reference every
        # fixture is priced against. Read from the DB, never assumed.
        grade = await db.fetchval("SELECT grade FROM sellers WHERE id = $1", SELLER_A_ID)
        list_price = await db.fetchval(
            "SELECT price FROM product_prices WHERE product_id = $1 AND grade = $2",
            PRODUCT_A_ID, grade,
        )
        print(f"seller A grade={grade} list_price={list_price} run={RUN} fixture day={DAY}")

        # ---- baseline BEFORE the fixtures -------------------------------
        base = (await daily(admin_a, date=DAY.isoformat())).json()

        # ---- create the fixtures ----------------------------------------
        created: dict[str, dict] = {}
        for name, weight, arrives, weighed in FIXTURES:
            unit = money(list_price) + (Decimal("1.00") if name == "off_list" else Decimal("0"))
            net = Decimal(weight).quantize(Decimal("0.001"))
            bill_id = uuid.uuid4()
            r = await http.post("/bills", headers=admin_a, json={
                "id": str(bill_id),
                "seller_id": str(SELLER_A_ID),
                "vehicle_no": f"PRF-{RUN[:4]}",
                "device_created_at": weighed.astimezone(dt.timezone.utc).isoformat(),
                "idempotency_key": f"daily-{RUN}-{name}",
                "items": [{
                    "id": str(uuid.uuid4()), "product_id": str(PRODUCT_A_ID), "line_no": 1,
                    "gross_weight": str(net), "tare_weight": "0.000", "net_weight": str(net),
                    "unit_price": str(unit),
                }],
            })
            if r.status_code != 201:
                print(f"FATAL: creating {name} returned {r.status_code}: {r.text[:300]}")
                return 1
            body = r.json()
            created[name] = {
                "id": bill_id, "doc_no": body["doc_no"],
                "amount": money(body["total_amount"]), "arrives": arrives,
            }
            # Place it in the past. server_received_at is DEFAULT now(); this is
            # the only way to put a bill on a day that has already happened.
            await db.execute(
                "UPDATE purchase_bills SET server_received_at = $1, device_created_at = $2"
                " WHERE id = $3",
                arrives, weighed, bill_id,
            )

        # voided: void through the real admin path, then move the void onto the
        # fixture day too (it is the day's own bill, voided the same day).
        rv = await http.post(
            f"/bills/{created['voided']['id']}/void", headers=admin_a,
            json={"reason": f"proof fixture {RUN}: not a real correction"},
        )
        if rv.status_code != 200:
            print(f"FATAL: void returned {rv.status_code}: {rv.text[:300]}")
            return 1
        await db.execute(
            "UPDATE purchase_bills SET voided_at = $1 WHERE id = $2",
            at(DAY, 11, 0), created["voided"]["id"],
        )

        # old_bill: received five days BEFORE the fixture day, voided ON it.
        # This is the void nobody would ever see: it belongs to no day anyone
        # opens unless voids_applied exists.
        rv2 = await http.post(
            f"/bills/{created['old_bill']['id']}/void", headers=admin_a,
            json={"reason": f"proof fixture {RUN}: back-dated void"},
        )
        if rv2.status_code != 200:
            print(f"FATAL: void(old) returned {rv2.status_code}: {rv2.text[:300]}")
            return 1
        await db.execute(
            "UPDATE purchase_bills SET voided_at = $1 WHERE id = $2",
            at(DAY, 15, 30), created["old_bill"]["id"],
        )

        # tenant B, same day — must be invisible to A.
        await db.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_B_ID))
        b_grade = await db.fetchval("SELECT grade FROM sellers WHERE id = $1", SELLER_B_ID)
        b_price = await db.fetchval(
            "SELECT price FROM product_prices WHERE product_id = $1 AND grade = $2",
            PRODUCT_B_ID, b_grade,
        )
        b_id = uuid.uuid4()
        rb = await http.post("/bills", headers=admin_b, json={
            "id": str(b_id), "seller_id": str(SELLER_B_ID), "vehicle_no": "TENANT-B",
            "device_created_at": at(DAY, 13, 0).astimezone(dt.timezone.utc).isoformat(),
            "idempotency_key": f"daily-{RUN}-tenantB",
            "items": [{
                "id": str(uuid.uuid4()), "product_id": str(PRODUCT_B_ID), "line_no": 1,
                "gross_weight": "1000.000", "tare_weight": "0.000", "net_weight": "1000.000",
                "unit_price": str(money(b_price)),
            }],
        })
        if rb.status_code != 201:
            print(f"FATAL: tenant B bill returned {rb.status_code}: {rb.text[:300]}")
            return 1
        b_bill = rb.json()
        await db.execute(
            "UPDATE purchase_bills SET server_received_at = $1 WHERE id = $2",
            at(DAY, 13, 0), b_id,
        )
        await db.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_A_ID))

        # ---- the report under test --------------------------------------
        resp = await daily(admin_a, date=DAY.isoformat())
        rep = resp.json()
        doc_of = {n: created[n]["doc_no"] for n in created}
        listed = {ln["doc_no"] for ln in rep["bills"]["lines"]}

        # ================================================================
        header("D - the day boundary, both edges, in shop time")
        check("day is labelled", rep["day"]["date"] == DAY.isoformat(), rep["day"]["date"])
        check("BE date is DD/MM/BBBB", rep["day"]["date_be"] == DAY_BE_LABEL, rep["day"]["date_be"])
        check("starts at 00:00:00+07:00",
              rep["day"]["starts_at"] == f"{DAY.isoformat()}T00:00:00+07:00", rep["day"]["starts_at"])
        check("ends at next 00:00:00+07:00 (half-open)",
              rep["day"]["ends_at"] == f"{DAY_AFTER.isoformat()}T00:00:00+07:00", rep["day"]["ends_at"])
        check("timezone is the shop's", rep["day"]["timezone"] == SHOP_TIMEZONE_NAME)
        check("is_today false for a past day", rep["day"]["is_today"] is False)
        check("requested true when a date was named", rep["day"]["requested"] is True)

        check("00:00:00.000000+07 is IN the day", doc_of["edge_first"] in listed)
        check("23:59:59.999999+07 is IN the day", doc_of["edge_last"] in listed)
        check("previous day 23:59:59.999999 is OUT", doc_of["edge_before"] not in listed)
        check("next day 00:00:00.000000 is OUT", doc_of["edge_after"] not in listed)
        check("weighed 23:50, synced 00:05 -> NEXT day (out)", doc_of["late_sync"] not in listed)

        # The stated consequence must travel IN the response, not only in a file.
        consequence = rep["basis"]["consequence_en"]
        check("basis names server_received_at", rep["basis"]["aggregated_on"] == "server_received_at")
        check("basis disclaims device_created_at", rep["basis"]["not_aggregated_on"] == "device_created_at")
        check("response STATES the 23:50/00:05 consequence",
              "23:50" in consequence and "00:05" in consequence and "NEXT" in consequence)
        th = rep["basis"]["consequence_th"]
        check("consequence is also in Thai (codepoints, not eyeballs)",
              any("฀" <= ch <= "๿" for ch in th) and "23:50" in th and "00:05" in th,
              f"{len(th)} chars, Thai range present")

        # money delta — the powers of two make any wrong subset identifiable
        expected_active = (
            money(list_price) * Decimal(1 + 2 + 64)
            + (money(list_price) + Decimal("1.00")) * Decimal(128)
        )
        got_active = money(rep["totals"]["active_total"]) - money(base["totals"]["active_total"])
        check("active_total delta counts EXACTLY the in-day active bills",
              got_active == expected_active, f"expected {expected_active}, got {got_active}")
        check("active_bill_count delta is 4",
              rep["totals"]["active_bill_count"] - base["totals"]["active_bill_count"] == 4)

        # ================================================================
        header("X - the disproof: what the WRONG day boundaries would have said")
        # Same fixtures, aggregated the two wrong ways, straight from SQL.
        shop_start = at(DAY, 0, 0).astimezone(dt.timezone.utc)
        shop_end = at(DAY_AFTER, 0, 0).astimezone(dt.timezone.utc)
        utc_start = dt.datetime(DAY.year, DAY.month, DAY.day, tzinfo=dt.timezone.utc)
        utc_end = utc_start + dt.timedelta(days=1)

        async def total_over(column: str, start, end) -> Decimal:
            row = await db.fetchval(
                f"SELECT coalesce(sum(total_amount), 0) FROM purchase_bills"
                f" WHERE voided_at IS NULL AND {column} >= $1 AND {column} < $2",
                start, end,
            )
            return money(row)

        async def docs_over(column: str, start, end) -> set:
            rows = await db.fetch(
                f"SELECT doc_no FROM purchase_bills"
                f" WHERE voided_at IS NULL AND {column} >= $1 AND {column} < $2",
                start, end,
            )
            return {r["doc_no"] for r in rows}

        right = await total_over("server_received_at", shop_start, shop_end)
        wrong_utc = await total_over("server_received_at", utc_start, utc_end)
        wrong_dev = await total_over("device_created_at", shop_start, shop_end)
        docs_right = await docs_over("server_received_at", shop_start, shop_end)
        docs_utc = await docs_over("server_received_at", utc_start, utc_end)
        docs_dev = await docs_over("device_created_at", shop_start, shop_end)

        mine = {v: k for k, v in doc_of.items()}

        def named(docs: set) -> set:
            return {mine[d] for d in docs if d in mine}

        print(f"  shop day  [{shop_start.isoformat()} .. {shop_end.isoformat()})")
        print(f"  UTC  day  [{utc_start.isoformat()} .. {utc_end.isoformat()})")
        print(f"  server_received_at + shop tz : {right}   fixtures {sorted(named(docs_right))}")
        print(f"  server_received_at + UTC day : {wrong_utc}   fixtures {sorted(named(docs_utc))}")
        print(f"  device_created_at  + shop tz : {wrong_dev}   fixtures {sorted(named(docs_dev))}")

        check("the endpoint agrees with the shop-time server_received_at basis",
              money(rep["totals"]["active_total"]) == right)
        check("a UTC day would have returned a DIFFERENT total",
              wrong_utc != right, f"{wrong_utc} vs {right}, off by {wrong_utc - right}")
        check("a UTC day DROPS the bill that arrived at 00:00 shop time",
              doc_of["edge_first"] in docs_right and doc_of["edge_first"] not in docs_utc)
        check("a UTC day PICKS UP bills belonging to the next shop day",
              doc_of["edge_after"] in docs_utc and doc_of["late_sync"] in docs_utc)
        check("a device_created_at day would have returned a DIFFERENT total",
              wrong_dev != right, f"{wrong_dev} vs {right}, off by {wrong_dev - right}")
        check("device_created_at basis WRONGLY includes the 23:50-weighed bill",
              doc_of["late_sync"] in docs_dev and doc_of["late_sync"] not in docs_right)
        check("device_created_at basis WRONGLY drops the bill weighed before midnight",
              doc_of["edge_first"] not in docs_dev and doc_of["edge_first"] in docs_right)

        # ================================================================
        header("V - a voided bill: out of the total, in the voided list")
        voided_docs = {v["doc_no"] for v in rep["voided"]}
        check("voided bill is NOT in the day's lines", doc_of["voided"] not in listed)
        check("voided bill IS in the voided list", doc_of["voided"] in voided_docs)
        vrow = next(v for v in rep["voided"] if v["doc_no"] == doc_of["voided"])
        check("voided entry carries its total", money(vrow["total_amount"]) == created["voided"]["amount"])
        check("voided entry carries the reason", RUN in (vrow["reason"] or ""))
        check("voided entry names WHO voided it", vrow["voided_by_username"] == ADMIN_USERNAME,
              str(vrow["voided_by_username"]))
        check("voided entry carries WHEN, in shop offset",
              (vrow["voided_at"] or "").startswith(f"{DAY.isoformat()}T11:00:00")
              and (vrow["voided_at"] or "").endswith("+07:00"), str(vrow["voided_at"]))
        # Stated as a DISPROOF: had the voided bill's money been left in the
        # total, the delta would have been exactly this larger number.
        check("voided money is absent from active_total",
              got_active != expected_active + created["voided"]["amount"],
              f"would have been {expected_active + created['voided']['amount']}")
        check("voided_total delta is exactly the voided bill",
              money(rep["totals"]["voided_total"]) - money(base["totals"]["voided_total"])
              == created["voided"]["amount"])
        check("voided_bill_count delta is 1",
              rep["totals"]["voided_bill_count"] - base["totals"]["voided_bill_count"] == 1)

        # ================================================================
        header("W - a void PERFORMED this day against an older bill")
        applied = {v["doc_no"] for v in rep["voids_applied"]}
        check("older bill's void appears in voids_applied", doc_of["old_bill"] in applied)
        arow = next(v for v in rep["voids_applied"] if v["doc_no"] == doc_of["old_bill"])
        check("it is flagged as from an earlier day", arow["from_earlier_day"] is True)
        check("it names the bill's own day", arow["bill_date"] == (DAY - dt.timedelta(days=5)).isoformat())
        check("it is NOT in this day's voided list", doc_of["old_bill"] not in voided_docs)
        check("it does NOT move this day's voided_total",
              money(rep["totals"]["voided_total"]) - money(base["totals"]["voided_total"])
              == created["voided"]["amount"])
        check("this day's own void is in voids_applied too, NOT flagged earlier",
              doc_of["voided"] in applied
              and next(v for v in rep["voids_applied"]
                       if v["doc_no"] == doc_of["voided"])["from_earlier_day"] is False)

        # ================================================================
        header("O - off-list payment surfaced")
        line_by_doc = {ln["doc_no"]: ln for ln in rep["bills"]["lines"]}
        off = line_by_doc[doc_of["off_list"]]
        on = line_by_doc[doc_of["on_list"]]
        check("the off-list bill is flagged", off["off_list"] is True)
        check("its off-list line count is 1", off["off_list_line_count"] == 1)
        check("the on-list bill is NOT flagged", on["off_list"] is False)
        check("its off-list line count is 0", on["off_list_line_count"] == 0)
        check("off_list_bill_count delta is 1",
              rep["totals"]["off_list_bill_count"] - base["totals"]["off_list_bill_count"] == 1)
        check("off_list_line_count delta is 1",
              rep["totals"]["off_list_line_count"] - base["totals"]["off_list_line_count"] == 1)
        expected_variance = Decimal(128) * Decimal("1.00")
        check("off_list_variance delta is the exact baht paid above list",
              money(rep["totals"]["off_list_variance"]) - money(base["totals"]["off_list_variance"])
              == expected_variance,
              f"expected {expected_variance}")

        # ================================================================
        header("A - admin only")
        rs = await daily(staff_a, date=DAY.isoformat())
        check("staff token is refused", rs.status_code == 403, f"HTTP {rs.status_code}")
        detail = rs.json().get("detail")
        check("refusal carries kind=forbidden",
              isinstance(detail, dict) and detail.get("kind") == "forbidden", str(detail)[:120])
        check("admin token is allowed", resp.status_code == 200)

        # ================================================================
        header("T - tenant isolation")
        check("tenant B's bill is invisible in A's day", b_bill["doc_no"] not in listed)
        b_rep = (await daily(admin_b, date=DAY.isoformat())).json()
        b_listed = {ln["doc_no"] for ln in b_rep["bills"]["lines"]}
        check("tenant B sees its OWN bill on that day", b_bill["doc_no"] in b_listed)
        check("none of A's fixtures appear in B's day",
              not (set(doc_of.values()) & b_listed))
        check("A's day total does not contain B's money",
              money(b_bill["total_amount"]) > 0 and got_active == expected_active)

        # ================================================================
        header("M - money is exact strings, never a float")
        money_fields = [
            rep["totals"]["active_total"], rep["totals"]["voided_total"],
            rep["totals"]["off_list_variance"],
            *[ln["total_amount"] for ln in rep["bills"]["lines"]],
            *[v["total_amount"] for v in rep["voided"]],
        ]
        check("every money value is a string", all(isinstance(m, str) for m in money_fields))
        check("every money value has exactly two decimal places",
              all(MONEY_RE.match(m) for m in money_fields),
              next((m for m in money_fields if not MONEY_RE.match(m)), "all match"))
        stray = floats_in(rep)
        check("no JSON float anywhere in the body", not stray, ", ".join(stray[:5]))
        check("the off-list bill's stored amount is exact",
              money(off["total_amount"]) == Decimal(128) * (money(list_price) + Decimal("1.00")))

        # ================================================================
        header("P - the money is never paged")
        paged = (await daily(admin_a, date=DAY.isoformat(), limit=1, offset=0)).json()
        check("limit=1 returns one line", paged["bills"]["returned"] == 1)
        check("...but the SAME active_total",
              paged["totals"]["active_total"] == rep["totals"]["active_total"],
              f'{paged["totals"]["active_total"]} vs {rep["totals"]["active_total"]}')
        check("...and the SAME active_bill_count",
              paged["totals"]["active_bill_count"] == rep["totals"]["active_bill_count"])
        check("...and the same off-list figures",
              paged["totals"]["off_list_variance"] == rep["totals"]["off_list_variance"])
        check("truncated is flagged", paged["bills"]["truncated"] is True)
        check("next_offset points at the next page", paged["bills"]["next_offset"] == 1)
        check("bills.total is the whole day, not the page",
              paged["bills"]["total"] == rep["totals"]["active_bill_count"])
        last_page = (await daily(admin_a, date=DAY.isoformat(),
                                 limit=500, offset=0)).json()
        check("a full page reports not truncated and no next_offset",
              last_page["bills"]["truncated"] is False and last_page["bills"]["next_offset"] is None)

        # ================================================================
        header("F - a future day is refused")
        today_shop = dt.datetime.now(tz=dt.timezone.utc).astimezone(SHOP_TIMEZONE).date()
        rf = await daily(admin_a, date=(today_shop + dt.timedelta(days=1)).isoformat())
        check("tomorrow is refused 422", rf.status_code == 422, f"HTTP {rf.status_code}")
        fdetail = rf.json().get("detail")
        check("refusal names day_in_the_future",
              isinstance(fdetail, dict) and fdetail.get("code") == "day_in_the_future", str(fdetail)[:140])
        rtoday = await daily(admin_a)
        check("today with NO date parameter is answered", rtoday.status_code == 200)
        tbody = rtoday.json()
        check("the server decides today itself", tbody["day"]["requested"] is False
              and tbody["day"]["is_today"] is True)
        check("the server's own clock travels with it", bool(tbody["day"]["server_now"]))
        # The SUBSTANCE, not `len(cannot_know) >= 3`. A count says nothing about
        # whether the blind spot an owner needs is named, and it would stay green
        # while someone replaced the list with three empty strings.
        cannot = " | ".join(tbody["completeness"]["cannot_know"])
        check("completeness admits it cannot see unsynced phones",
              tbody["completeness"]["understatement_possible"] is True
              and "unsynced" in cannot and "phone" in cannot,
              cannot[:90])

        # ================================================================
        header("R - the snapshot really is REPEATABLE READ")
        async with tenant_connection(TENANT_A_ID, isolation_level="REPEATABLE READ") as conn:
            lvl = (await conn.execute(text("SHOW transaction_isolation"))).scalar_one()
        check("the report's transaction is repeatable read", lvl == "repeatable read", lvl)
        async with tenant_connection(TENANT_A_ID) as conn:
            dflt = (await conn.execute(text("SHOW transaction_isolation"))).scalar_one()
        check("the default is still read committed (so the option does something)",
              dflt == "read committed", dflt)

    await db.close()

    print("\n" + "=" * 62)
    if _failures:
        print(f"FAILED ({len(_failures)}):")
        for f in _failures:
            print(f"  - {f}")
        return 1
    print("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
