"""Prove GET /reports/summary -- the shop-owner dashboard's server half -- over
real HTTP: a period aggregated by product/seller/user/day, void as a state, and
the per-shop staff-money-visibility toggle (P1.23 item 4, unit 2).

    uv run python scripts/prove_reports_summary.py --database recycle_summary_scratch
    uv run python scripts/prove_reports_summary.py        (self-restores the scratch)

WHAT DATABASE, AND WHY A SCRATCH. This proof creates purchase bills -- hard-rule-5
transactions that cannot be deleted -- and it PATCHes tenants.staff_money_visible.
Writing those into dev would leave them forever (lessons/a-mutation-on-a-protected-
write-path-needs-a-scratch-database.md, "DEV IS NOT SCRATCH"). So it RESTORES its
own scratch from a live dump (backup_db.py -> restore_db.py, the prove_seller_code_
guards / prove_reconcile shape; the live dev database is only READ), REFUSES to run
against the live database, and points its own process AND its child uvicorn at the
scratch via APP_DATABASE_URL / DIRECTORY_DATABASE_URL. It DELETES nothing and it
provisions its OWN two throwaway tenants (fresh uuids each run) rather than touch
the seeded shops or the dev debris -- so every assertion is an ABSOLUTE hand-
computed figure, not a delta, because the tenant under test contains ONLY this
run's fixture (RLS isolates it). This is the brief's preferred scratch-database
pattern; the choice is stated here per its "say which you used".

WHAT IT TALKS TO, ESTABLISHED BEFORE ANY CELL. Its OWN uvicorn on a FREE port
(never a fixed one), watching the child rather than only the clock, and
/openapi.json must declare /reports/summary with from_date/to_date/by/state AND
ShopUpdate.staff_money_visible before any cell is read (lessons/a-proof-must-
establish-what-it-is-talking-to.md): a server that does not declare them is not
this code, and its careful negative cells would go green over the OLD code.

THE HAND-COMPUTED SUMS DUPLICATE THE ARITHMETIC, THEY DO NOT SHARE IT
(lessons/a-checker-must-not-share-the-code-it-checks.md). The expected figures are
computed in Python Decimal from the fixture literals -- round(net*unit, 2) and
round(net*list, 2), ROUND_HALF_UP, the second implementation that can DISAGREE with
the route's SQL -- and NEVER read back off the response. But the shop-day boundary
IS imported (config.SHOP_TIMEZONE) rather than re-derived, because a second date
expression written here would be a second formatter, correct-by-luck all day and
wrong across Bangkok midnight (lessons/render-in-shop-time-not-device-time.md). The
list_price each line is priced against is READ from the scratch (an INPUT, the
seeded reference), the way prove_daily_report reads it.

MONEY IS COMPARED AS STRINGS, BYTE FOR BYTE, never as floats
(lessons/sqlite-money-is-text.md, console-is-not-the-observation.md): the route
emits decimal strings and the proof asserts string equality, so the IEEE-754
behaviour a JSON number would carry cannot pass unnoticed.

RUNS TWICE (lessons/proof-must-run-twice.md). Each invocation re-restores its
scratch and provisions fresh tenants, so a second run is independent and passes.

EXIT IS RED UNLESS THE FULL SUCCESS PATH IS REACHED. main() returns 1 on any
failure, 2 when it could not run (unfit fixture / wrong database), and 0 only at
the very end. A crash prints no EXIT line; an ABSENT exit line is the failure
signal (lessons/a-check-that-never-went-red-was-never-observed.md).

THE FOUR DISPROOFS (performed by the operator on the route source, recorded in the
phase report -- the prove_shop_settings shape). Each names its cell FIRST, reddens
EXACTLY that cell, and reverts green:
  (a) drop the `created_by = self` forcing for staff in reports.summary_report ->
      the STAFF-OWN-ROWS cell (S-ON) reddens: staff then see shop-wide figures.
  (b) there is NO tenant_id predicate to drop -- tenant isolation is held ENTIRELY
      by FORCE RLS + SET LOCAL app.tenant_id, exactly as across this codebase
      (ARCHITECTURE 8.1/8.2). The cross-tenant cell cannot be reddened by editing a
      query predicate because there is none; it is held one layer down. Demonstrated
      instead by pointing the route at tenant_connection(None): the result fails
      CLOSED to zero rows and the OWN-ROWS-PRESENT control reddens -- proving the
      context is load-bearing. RECORDED, per the brief's "if RLS alone keeps it
      green, SAY SO".
  (c) flip list_total to sum(i.unit_price ...) -> the OVERRIDE-DIFF cell reddens:
      the diff collapses to 0. An in-script control (C-CTL) also shows that summing
      unit_price would make list_minus_paid 0 where the route returns non-zero.
  (d) compute the day bucket with make_interval(secs => 0) (UTC) -> the MIDNIGHT-PAIR
      cell reddens: the 23:30 and 00:30 bills collapse into one UTC day. An in-script
      control (D-CTL) shows the UTC bucket collapses the pair the shop bucket splits.
"""
from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from decimal import ROUND_HALF_UP, Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH_DB = "recycle_summary_scratch"
RUN = uuid.uuid4().hex[:8]

BASE = ""
failures: list[str] = []


# ---------------------------------------------------------------------------
# reporting helpers
# ---------------------------------------------------------------------------
def check(cond: bool, label: str) -> None:
    if not cond:
        failures.append(label)
    print(f"  [{'ok ' if cond else 'RED'}] {label}")


def header(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _tail(path: str, n: int = 40) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return "".join(f.readlines()[-n:])
    except OSError:
        return "(no child log)"


# ---------------------------------------------------------------------------
# the scratch: dump the LIVE database (read only) and restore it into SCRATCH_DB,
# overwriting it. Lifted from prove_seller_code_guards.restore_scratch.
# ---------------------------------------------------------------------------
def restore_scratch(live_name: str, scratch: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-summary-dump-{RUN}")
    label = f"summary-{RUN}"
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "backup_db.py"),
         "--db", live_name, "--out", out, "--label", label],
        cwd=SERVER_DIR, capture_output=True, text=True, timeout=300)
    if cp.returncode != 0:
        raise RuntimeError(f"backup_db.py (live) failed: {cp.stderr.strip()[:600]}")
    dumps = [d for d in os.listdir(out) if d.endswith(label)]
    if len(dumps) != 1:
        raise RuntimeError(f"expected one dump dir ending {label!r}, got {dumps}")
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "restore_db.py"),
         os.path.join(out, dumps[0]), "--into", scratch],
        cwd=SERVER_DIR, capture_output=True, text=True, timeout=300)
    if cp.returncode != 0:
        raise RuntimeError(f"restore_db.py -> {scratch} failed: {cp.stderr.strip()[:600]}")
    shutil.rmtree(out, ignore_errors=True)


# ---------------------------------------------------------------------------
# THE FIXTURE, declared as literals. Each bill is SINGLE-PRODUCT (so by=product
# bill_count partitions the bills the way day/seller/user do) with two lines: one
# off-list (unit = list + delta) and one on-list (unit = list). list is the seeded
# price for (product, seller-grade), read from the scratch at run time.
# ---------------------------------------------------------------------------
# product -> its four grade prices (the fresh tenant's seeded price list).
PRICES = {
    "FE": {"A": "15.50", "B": "15.00", "C": "14.50", "D": "14.00"},
    "AL": {"A": "45.00", "B": "44.00", "C": "43.00", "D": "42.00"},
}
# seller key -> (code, grade). Three sellers, three grades.
SELLERS = {
    "s1": ("S001", "B"),
    "s2": ("S002", "A"),
    "s3": ("S003", "C"),
}
D0 = dt.date(2026, 3, 10)  # a settled past window inside the current BE year.


def at(day_offset: int, h: int, m: int) -> dict:
    """A SHOP-time instant, given as an offset in days from D0. The proof imports
    SHOP_TIMEZONE for this (the convention), never re-derives an offset."""
    return {"day_offset": day_offset, "h": h, "m": m}


# (name, product, seller, creator, when, voided, lines[(net, delta)])
# creator in {"admin", "staff"}; delta "0" is on-list.
FIXTURE = [
    ("b1", "FE", "s1", "admin", at(0, 10, 0),  False, [("10.000", "1.00"), ("4.000", "0")]),
    ("b2", "AL", "s2", "staff", at(0, 11, 0),  False, [("2.000", "5.00"), ("1.000", "0")]),
    ("b3", "FE", "s3", "admin", at(1, 9, 0),   False, [("6.333", "0.50"), ("2.000", "0")]),
    ("b4", "AL", "s1", "staff", at(1, 14, 0),  True,  [("3.000", "2.00"), ("1.000", "0")]),
    # the midnight pair: 23:30 shop time on day 2, 00:30 shop time on day 3.
    ("b5", "FE", "s2", "admin", at(2, 23, 30), False, [("8.000", "1.00"), ("2.000", "0")]),
    ("b6", "AL", "s3", "staff", at(3, 0, 30),  False, [("1.000", "5.00"), ("2.000", "0")]),
    ("b7", "FE", "s1", "staff", at(1, 16, 0),  False, [("2.000", "2.00"), ("3.000", "0")]),
]

Q2 = Decimal("0.01")
Q3 = Decimal("0.001")


def money(v: Decimal) -> str:
    return str(v.quantize(Q2, rounding=ROUND_HALF_UP))


def weight(v: Decimal) -> str:
    return str(v.quantize(Q3, rounding=ROUND_HALF_UP))


def line_amount(net: Decimal, unit: Decimal) -> Decimal:
    """round(net*price, 2), ROUND_HALF_UP -- the second implementation of
    bills._line_amount, written here so it can DISAGREE with the route's SQL."""
    return (net * unit).quantize(Q2, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# the run-time identities (fresh uuids, so a second run does not read the first)
# ---------------------------------------------------------------------------
class Ctx:
    """Everything the fixture resolves against, filled during provisioning."""
    def __init__(self) -> None:
        self.main_tenant = uuid.uuid4()
        self.other_tenant = uuid.uuid4()
        self.admin_id = uuid.uuid4()
        self.staff_id = uuid.uuid4()
        self.other_admin_id = uuid.uuid4()
        self.product_ids = {"FE": uuid.uuid4(), "AL": uuid.uuid4()}
        self.other_product_id = uuid.uuid4()
        self.seller_ids = {k: uuid.uuid4() for k in SELLERS}
        self.other_seller_id = uuid.uuid4()
        self.uom_id = uuid.uuid4()
        self.cat_id = uuid.uuid4()
        self.other_uom_id = uuid.uuid4()
        self.other_cat_id = uuid.uuid4()
        # the effective list price per (product, seller-grade), read from the DB.
        self.list_of: dict[tuple[str, str], Decimal] = {}


ADMIN_PW = "summary-admin-pw"
STAFF_PW = "summary-staff-pw"
OTHER_ADMIN_PW = "summary-other-pw"


def creator_id(ctx: Ctx, who: str) -> uuid.UUID:
    return ctx.admin_id if who == "admin" else ctx.staff_id


def shop_dt(when: dict) -> dt.datetime:
    from app.config import SHOP_TIMEZONE
    d = D0 + dt.timedelta(days=when["day_offset"])
    return dt.datetime(d.year, d.month, d.day, when["h"], when["m"], tzinfo=SHOP_TIMEZONE)


def shop_date_iso(when: dict) -> str:
    from app.config import SHOP_TIMEZONE
    return shop_dt(when).astimezone(SHOP_TIMEZONE).date().isoformat()


def list_price(ctx: Ctx, product: str, seller: str) -> Decimal:
    return ctx.list_of[(product, SELLERS[seller][1])]


# ---------------------------------------------------------------------------
# the expected aggregation -- computed from the fixture literals, NOT from the
# route. Mirrors the route's grouping and D2's money bases, in Python Decimal.
# ---------------------------------------------------------------------------
def _state_match(voided: bool, state: str) -> bool:
    if state == "live":
        return not voided
    if state == "void":
        return voided
    return True  # all


def _group_key(ctx: Ctx, bill: tuple, by: str) -> str:
    _name, product, seller, creator, when, _v, _lines = bill
    if by == "product":
        return str(ctx.product_ids[product])
    if by == "seller":
        return SELLERS[seller][0]
    if by == "user":
        return str(creator_id(ctx, creator))
    return shop_date_iso(when)  # day


def expected(ctx: Ctx, by: str, state: str, only_creator: str | None = None) -> dict:
    """{"rows": {key: figures}, "totals": figures} for the MAIN tenant fixture."""
    groups: dict[str, dict] = {}
    tot = {"bills": set(), "net": Decimal(0), "paid": Decimal(0), "list": Decimal(0)}
    for bill in FIXTURE:
        name, product, seller, creator, _when, voided, lines = bill
        if not _state_match(voided, state):
            continue
        if only_creator is not None and creator != only_creator:
            continue
        key = _group_key(ctx, bill, by)
        g = groups.setdefault(
            key, {"bills": set(), "net": Decimal(0), "paid": Decimal(0), "list": Decimal(0)}
        )
        lp = list_price(ctx, product, seller)
        for net_s, delta_s in lines:
            net = Decimal(net_s)
            unit = lp + Decimal(delta_s)
            paid = line_amount(net, unit)
            listed = line_amount(net, lp)
            for bucket in (g, tot):
                bucket["net"] += net
                bucket["paid"] += paid
                bucket["list"] += listed
        g["bills"].add(name)
        tot["bills"].add(name)

    def figures(b: dict) -> dict:
        return {
            "bill_count": len(b["bills"]),
            "net_weight": weight(b["net"]),
            "paid_total": money(b["paid"]),
            "list_total": money(b["list"]),
            "list_minus_paid": money(b["list"] - b["paid"]),
        }

    return {"rows": {k: figures(v) for k, v in groups.items()}, "totals": figures(tot)}


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def wait_for_health(proc: subprocess.Popen, timeout: float = 40.0) -> str:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            return f"the uvicorn child exited with code {proc.returncode}"
        try:
            r = httpx.get(f"{BASE}/health", timeout=2.0)
            if r.status_code == 200:
                return ""
        except httpx.HTTPError:
            pass
        time.sleep(0.25)
    return "health never came up within the timeout"


def assert_serving_this_code() -> str:
    """Identity: /reports/summary with the four params, and ShopUpdate carries
    staff_money_visible. Either missing => not this code."""
    try:
        r = httpx.get(f"{BASE}/openapi.json", timeout=5.0)
    except httpx.HTTPError as exc:
        return f"/openapi.json unreachable: {exc}"
    if r.status_code != 200:
        return f"/openapi.json returned {r.status_code}"
    doc = r.json()
    summ = doc.get("paths", {}).get("/reports/summary", {}).get("get")
    if summ is None:
        return "the server does not declare GET /reports/summary -- predates unit 2"
    params = {p["name"] for p in summ.get("parameters", [])}
    missing = {"from_date", "to_date", "by", "state"} - params
    if missing:
        return f"/reports/summary is missing query params {sorted(missing)}"
    props = (
        doc.get("components", {}).get("schemas", {})
        .get("ShopUpdate", {}).get("properties", {})
    )
    if "staff_money_visible" not in props:
        return "ShopUpdate does not declare staff_money_visible -- predates migration 0014"
    return ""


async def login(client: httpx.AsyncClient, tenant: uuid.UUID, username: str, password: str) -> str:
    r = await client.post(
        "/auth/login",
        json={"tenant_id": str(tenant), "username": username, "password": password},
    )
    r.raise_for_status()
    return r.json()["access_token"]


# ---------------------------------------------------------------------------
# provisioning: two fresh throwaway tenants, master data, users. No DELETE.
# ---------------------------------------------------------------------------
async def provision(ctx: Ctx) -> None:
    from sqlalchemy import text
    from app.db import tenant_connection
    from app.security import hash_password

    admin_hash = await hash_password(ADMIN_PW)
    staff_hash = await hash_password(STAFF_PW)
    other_hash = await hash_password(OTHER_ADMIN_PW)

    async def seed_tenant(tid, name, users, uom, cat, products, sellers):
        async with tenant_connection(tid) as conn:
            await conn.execute(
                text("INSERT INTO tenants (id, name) VALUES (:id, :n)"),
                {"id": tid, "n": name},
            )
            for uid, un, fn, role, ph in users:
                await conn.execute(
                    text("INSERT INTO users (id, tenant_id, username, full_name, role,"
                         " password_hash) VALUES (:id, :t, :u, :fn, :r, :ph)"),
                    {"id": uid, "t": tid, "u": un, "fn": fn, "r": role, "ph": ph},
                )
            await conn.execute(
                text("INSERT INTO uoms (id, tenant_id, code, name)"
                     " VALUES (:id, :t, 'KG', 'Kilogram')"),
                {"id": uom, "t": tid},
            )
            await conn.execute(
                text("INSERT INTO product_categories (id, tenant_id, code, name)"
                     " VALUES (:id, :t, 'SCRAP', 'Scrap')"),
                {"id": cat, "t": tid},
            )
            # grade_tiers FIRST (migration 0015): product_prices.grade and
            # sellers.grade carry composite FKs to grade_tiers, so a tier must
            # exist before a graded row references it. This tenant is FRESH, so
            # seed one per distinct grade it uses -- same transaction.
            tier_codes = sorted(
                {g for _p, _c, prices in products for g in prices}
                | {g for _s, _c, g in sellers if g}
            )
            for _i, tcode in enumerate(tier_codes):
                await conn.execute(
                    text("INSERT INTO grade_tiers (tenant_id, code, name,"
                         " sort_order, is_active)"
                         " VALUES (:t, :code, :code, :so, true)"),
                    {"t": tid, "code": tcode, "so": _i},
                )
            for pid, code, prices in products:
                await conn.execute(
                    text("INSERT INTO products (id, tenant_id, category_id, uom_id, code,"
                         " name, is_active) VALUES (:id, :t, :c, :u, :code, :code, true)"),
                    {"id": pid, "t": tid, "c": cat, "u": uom, "code": code},
                )
                for grade, price in prices.items():
                    await conn.execute(
                        text("INSERT INTO product_prices (tenant_id, product_id, grade, price)"
                             " VALUES (:t, :p, :g, :price)"),
                        {"t": tid, "p": pid, "g": grade, "price": Decimal(price)},
                    )
            for sid, code, grade in sellers:
                await conn.execute(
                    text("INSERT INTO sellers (id, tenant_id, code, name, grade, is_active)"
                         " VALUES (:id, :t, :code, :nm, :g, true)"),
                    {"id": sid, "t": tid, "code": code, "nm": f"Seller {code}", "g": grade},
                )

    await seed_tenant(
        ctx.main_tenant, f"Summary MAIN {RUN}",
        [(ctx.admin_id, "admin", "Main Admin", "admin", admin_hash),
         (ctx.staff_id, "staff", "Main Staff", "staff", staff_hash)],
        ctx.uom_id, ctx.cat_id,
        [(ctx.product_ids["FE"], "FE-STEEL", PRICES["FE"]),
         (ctx.product_ids["AL"], "AL-CAN", PRICES["AL"])],
        [(ctx.seller_ids[k], SELLERS[k][0], SELLERS[k][1]) for k in SELLERS],
    )
    await seed_tenant(
        ctx.other_tenant, f"Summary OTHER {RUN}",
        [(ctx.other_admin_id, "admin", "Other Admin", "admin", other_hash)],
        ctx.other_uom_id, ctx.other_cat_id,
        [(ctx.other_product_id, "FE-STEEL", {"A": "9.50", "B": "9.00", "C": "8.50", "D": "8.00"})],
        [(ctx.other_seller_id, "S001", "A")],
    )

    # read the effective list price per (product, seller-grade) FROM the scratch --
    # the seeded reference, an INPUT, exactly as prove_daily_report reads it.
    async with tenant_connection(ctx.main_tenant) as conn:
        for pkey, pid in ctx.product_ids.items():
            for skey, (_code, grade) in SELLERS.items():
                price = (
                    await conn.execute(
                        text("SELECT price FROM product_prices"
                             " WHERE product_id = :p AND grade = :g"),
                        {"p": pid, "g": grade},
                    )
                ).scalar_one()
                ctx.list_of[(pkey, grade)] = Decimal(price)


async def seed_fixture(ctx: Ctx, client: httpx.AsyncClient, tokens: dict) -> None:
    """Create every bill over the REAL POST /bills path, then backdate its
    server_received_at onto the fixture instant (the only way to place a bill in
    the past; server_received_at is DEFAULT now())."""
    from sqlalchemy import text
    from app.db import tenant_connection

    created: dict[str, uuid.UUID] = {}
    for name, product, seller, creator, when, voided, lines in FIXTURE:
        lp = list_price(ctx, product, seller)
        items = []
        for i, (net_s, delta_s) in enumerate(lines, start=1):
            unit = lp + Decimal(delta_s)
            items.append({
                "id": str(uuid.uuid4()),
                "product_id": str(ctx.product_ids[product]),
                "line_no": i,
                "gross_weight": net_s, "tare_weight": "0.000", "net_weight": net_s,
                "unit_price": str(unit),
            })
        bid = uuid.uuid4()
        r = await client.post("/bills", headers=auth(tokens[creator]), json={
            "id": str(bid),
            "seller_id": str(ctx.seller_ids[seller]),
            "vehicle_no": f"SUM-{RUN[:4]}",
            "device_created_at": shop_dt(when).astimezone(dt.timezone.utc).isoformat(),
            "idempotency_key": f"summary-{RUN}-{name}",
            "items": items,
        })
        if r.status_code != 201:
            raise RuntimeError(f"POST /bills {name} -> {r.status_code}: {r.text[:300]}")
        created[name] = bid
        async with tenant_connection(ctx.main_tenant) as conn:
            await conn.execute(
                text("UPDATE purchase_bills SET server_received_at = :s WHERE id = :i"),
                {"s": shop_dt(when).astimezone(dt.timezone.utc), "i": bid},
            )

    # void b4 through the real admin path (created by staff, voided by admin).
    rv = await client.post(
        f"/bills/{created['b4']}/void", headers=auth(tokens["admin"]),
        json={"reason": f"summary proof {RUN}: fixture void"},
    )
    if rv.status_code != 200:
        raise RuntimeError(f"void b4 -> {rv.status_code}: {rv.text[:300]}")

    # OTHER tenant: one bill (the cross-tenant control).
    bo = uuid.uuid4()
    ro = await client.post("/bills", headers=auth(tokens["other_admin"]), json={
        "id": str(bo),
        "seller_id": str(ctx.other_seller_id),
        "vehicle_no": "OTHER",
        "device_created_at": shop_dt(at(1, 12, 0)).astimezone(dt.timezone.utc).isoformat(),
        "idempotency_key": f"summary-{RUN}-other",
        "items": [{
            "id": str(uuid.uuid4()), "product_id": str(ctx.other_product_id), "line_no": 1,
            "gross_weight": "1000.000", "tare_weight": "0.000", "net_weight": "1000.000",
            "unit_price": "9.50",
        }],
    })
    if ro.status_code != 201:
        raise RuntimeError(f"OTHER bill -> {ro.status_code}: {ro.text[:300]}")
    async with tenant_connection(ctx.other_tenant) as conn:
        await conn.execute(
            text("UPDATE purchase_bills SET server_received_at = :s WHERE id = :i"),
            {"s": shop_dt(at(1, 12, 0)).astimezone(dt.timezone.utc), "i": bo},
        )
    ctx.other_bill = bo  # type: ignore[attr-defined]


# the whole fixture window, with slack, so from/to bracket every bill.
FROM_DATE = D0.isoformat()
TO_DATE = (D0 + dt.timedelta(days=5)).isoformat()


async def get_summary(client, token, by, state="live", frm=FROM_DATE, to=TO_DATE):
    return await client.get(
        "/reports/summary", headers=auth(token),
        params={"from_date": frm, "to_date": to, "by": by, "state": state},
    )


def rows_by_key(body: dict) -> dict:
    return {r["key"]: r for r in body["rows"]}


def figures_match(got: dict, exp: dict, fields=("bill_count", "net_weight", "paid_total",
                                                "list_total", "list_minus_paid")) -> bool:
    return all(str(got.get(f)) == str(exp.get(f)) for f in fields)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
async def run(ctx: Ctx, admin_tok, staff_tok, other_tok, client) -> None:
    dims = ["product", "seller", "user", "day"]

    # =====================================================================
    header("A -- every dimension's rows equal the hand-computed sums (state=live)")
    live_totals_by_dim = {}
    for by in dims:
        exp = expected(ctx, by, "live")
        r = await get_summary(client, admin_tok, by)
        check(r.status_code == 200, f"A: by={by} live -> 200 (got {r.status_code})")
        body = r.json()
        got = rows_by_key(body)
        print(f"      by={by}: keys={sorted(got)}  vs expected {sorted(exp['rows'])}")
        check(set(got) == set(exp["rows"]),
              f"A: by={by} the key SPACE matches hand-computed (no missing/extra group)")
        for key, ex in exp["rows"].items():
            g = got.get(key, {})
            ok = figures_match(g, ex)
            if not ok:
                print(f"        MISMATCH key={key}: got={g} exp={ex}")
            check(ok, f"A: by={by} key={key} figures equal hand-computed (byte-for-byte strings)")
        check(figures_match(body["totals"], exp["totals"]),
              f"A: by={by} totals equal hand-computed  (got {body['totals']})")
        live_totals_by_dim[by] = body["totals"]

    # =====================================================================
    header("B -- the four groupings of one set agree on totals; totals == sum(rows)")
    ref = live_totals_by_dim["day"]
    for by in dims:
        t = live_totals_by_dim[by]
        check(figures_match(t, ref),
              f"B: by={by} totals equal by=day totals (the same set, four groupings)")
    for by in dims:
        r = await get_summary(client, admin_tok, by)
        body = r.json()
        for fld in ("bill_count", "net_weight", "paid_total", "list_total", "list_minus_paid"):
            if fld == "bill_count":
                summed = sum(int(row[fld]) for row in body["rows"])
                ok = summed == body["totals"][fld]
            else:
                acc = sum((Decimal(row[fld]) for row in body["rows"]), Decimal(0))
                summed = weight(acc) if fld == "net_weight" else money(acc)
                ok = summed == body["totals"][fld]
            check(ok, f"B: by={by} totals.{fld} == sum(rows.{fld})  "
                      f"(sum={summed} totals={body['totals'][fld]})")

    # =====================================================================
    header("C -- the midnight pair splits by shop day (and would collapse in UTC)")
    day_all = rows_by_key((await get_summary(client, admin_tok, "day", "all")).json())
    d2 = shop_date_iso(at(2, 23, 30))  # 2026-03-12
    d3 = shop_date_iso(at(3, 0, 30))   # 2026-03-13
    check(d2 != d3, f"C: the pair is on two DIFFERENT shop days ({d2} vs {d3})")
    check(d2 in day_all and d3 in day_all,
          f"C: both midnight-pair days are present as rows ({d2}, {d3})")
    # D-CTL: the UTC bucket would put both on the same day -- the disproof (d) shape.
    from app.config import SHOP_TIMEZONE
    utc2 = shop_dt(at(2, 23, 30)).astimezone(dt.timezone.utc).date().isoformat()
    utc3 = shop_dt(at(3, 0, 30)).astimezone(dt.timezone.utc).date().isoformat()
    print(f"      D-CTL: under UTC the pair would bucket to {utc2} and {utc3}"
          f"  (shop: {d2}, {d3})")
    check(utc2 == utc3 and d2 != d3,
          "C (D-CTL): a UTC day bucket COLLAPSES the pair (one day) that the shop "
          "bucket SPLITS (two days) -- so this cell is sensitive to disproof (d)")

    # =====================================================================
    header("O -- list_minus_paid uses list_price, not unit_price (state=live, by=seller)")
    sel = rows_by_key((await get_summary(client, admin_tok, "seller")).json())
    exp_sel = expected(ctx, "seller", "live")["rows"]
    # every seller has an off-list line, so list_total != paid_total and diff != 0.
    for code, ex in exp_sel.items():
        g = sel[code]
        check(g["list_minus_paid"] == ex["list_minus_paid"],
              f"O: seller {code} list_minus_paid == hand-computed ({g['list_minus_paid']})")
        # C-CTL: if list_total summed unit_price it would EQUAL paid_total (diff 0).
        check(Decimal(g["list_minus_paid"]) != Decimal("0"),
              f"O (C-CTL): seller {code} list_minus_paid is NON-zero, so list_total is "
              f"NOT summing unit_price -- sensitive to disproof (c)")

    # =====================================================================
    header("V -- void is a state: live + void == all, and the void bill only in void/all")
    for by in ["day", "seller", "user", "product"]:
        live_t = (await get_summary(client, admin_tok, by, "live")).json()["totals"]
        void_t = (await get_summary(client, admin_tok, by, "void")).json()["totals"]
        all_t = (await get_summary(client, admin_tok, by, "all")).json()["totals"]
        check(live_t["bill_count"] + void_t["bill_count"] == all_t["bill_count"],
              f"V: by={by} live_count + void_count == all_count "
              f"({live_t['bill_count']}+{void_t['bill_count']}=={all_t['bill_count']})")
        check(money(Decimal(live_t["paid_total"]) + Decimal(void_t["paid_total"]))
              == all_t["paid_total"],
              f"V: by={by} live_paid + void_paid == all_paid")
    exp_void = expected(ctx, "user", "void")
    void_user = rows_by_key((await get_summary(client, admin_tok, "user", "void")).json())
    live_user = rows_by_key((await get_summary(client, admin_tok, "user", "live")).json())
    staff_key = str(ctx.staff_id)
    check(set(void_user) == set(exp_void["rows"]),
          "V: the void set is exactly the voided bill's creator (staff)")
    check(figures_match(void_user.get(staff_key, {}), exp_void["rows"][staff_key]),
          "V: the voided bill's money appears under state=void (byte-for-byte)")
    # negative + presence sibling: the void bill's money is NOT in live, but the
    # creator IS present in live (from other, live bills) -- so the absence is real.
    live_staff_paid = Decimal(live_user.get(staff_key, {}).get("paid_total", "0"))
    all_staff_paid = Decimal(
        rows_by_key((await get_summary(client, admin_tok, "user", "all")).json())
        .get(staff_key, {}).get("paid_total", "0"))
    check(staff_key in live_user and all_staff_paid > live_staff_paid,
          "V: the voided bill's money is ABSENT from live but the creator is PRESENT "
          "in live (all_paid > live_paid), so the exclusion is not vacuous")

    # =====================================================================
    header("T -- tenant isolation is held by RLS (cross-tenant control)")
    for by in dims:
        body = (await get_summary(client, admin_tok, by, "all")).json()
        keys = {r["key"] for r in body["rows"]}
        check(str(ctx.other_product_id) not in keys and "9500.00" != body["totals"]["paid_total"],
              f"T: by={by} the OTHER tenant's bill is INVISIBLE to MAIN admin")
    # positive control: OTHER's own admin DOES see its bill.
    ob = (await get_summary(client, other_tok, "product", "all")).json()
    check(any(r["key"] == str(ctx.other_product_id) for r in ob["rows"])
          and ob["totals"]["paid_total"] == "9500.00",
          "T: the OTHER tenant's OWN admin sees its bill (9500.00) -- so T is not vacuous")

    # =====================================================================
    header("S -- the staff money-visibility toggle (403 off; own-rows only on)")
    # OFF (default): staff refused 403, pinned to detail.code.
    r = await get_summary(client, staff_tok, "user", "live")
    detail = r.json().get("detail", {})
    code = detail.get("code") if isinstance(detail, dict) else None
    print(f"      S-OFF operands: status={r.status_code} code={code!r}")
    check(r.status_code == 403, f"S-OFF: staff GET -> 403 while toggle off (got {r.status_code})")
    check(code == "staff_money_hidden",
          f"S-OFF: refusal pinned to detail.code (code={code!r})")
    check(isinstance(detail, dict) and detail.get("decided_by") == "shop_owner",
          "S-OFF: the 403 names that the shop owner decides this")
    # admin scope is UNCHANGED by the toggle being off (it is on for admin already).
    check((await get_summary(client, admin_tok, "user", "live")).status_code == 200,
          "S-OFF: admin is unaffected by the staff toggle")

    # turn it ON (admin PATCH /shop).
    pr = await client.patch("/shop", headers=auth(admin_tok),
                            json={"staff_money_visible": True})
    check(pr.status_code == 200 and pr.json().get("staff_money_visible") is True,
          f"S: admin PATCH /shop staff_money_visible=true -> 200 (got {pr.status_code})")

    # ON: staff sees ONLY their own bills. by=user -> exactly one row (themselves).
    exp_staff_user = expected(ctx, "user", "live", only_creator="staff")
    su = await get_summary(client, staff_tok, "user", "live")
    check(su.status_code == 200, f"S-ON: staff GET -> 200 with toggle on (got {su.status_code})")
    su_rows = rows_by_key(su.json())
    check(set(su_rows) == {staff_key},
          f"S-ON: by=user returns exactly ONE row, the staff themselves (got {sorted(su_rows)})")
    check(figures_match(su_rows.get(staff_key, {}), exp_staff_user["rows"][staff_key]),
          "S-ON: the staff's own figures equal the hand-computed sums of THEIR bills")
    # by=day, staff scope: totals equal the hand-computed sums of the staff's OWN bills.
    exp_staff_day = expected(ctx, "day", "live", only_creator="staff")
    sd = await get_summary(client, staff_tok, "day", "live")
    check(figures_match(sd.json()["totals"], exp_staff_day["totals"]),
          "S-ON: by=day totals equal the staff's OWN hand-computed sums (not shop-wide)")
    # the PRESENCE sibling of S-OFF: with the flag on, the SAME request returns the
    # staff's amounts -- so S-OFF's 403 was the flag, not an empty fixture.
    check(Decimal(sd.json()["totals"]["paid_total"]) > 0,
          "S-ON: the staff's own money is PRESENT with the flag on (the S-OFF sibling)")
    # staff is scoped to SELF: their shop-wide-if-unscoped total would be larger.
    admin_day_total = (await get_summary(client, admin_tok, "day", "live")).json()["totals"]
    check(Decimal(admin_day_total["paid_total"]) > Decimal(sd.json()["totals"]["paid_total"]),
          "S-ON: staff (own-only) sees LESS than admin (shop-wide) -- the forcing is active")
    # admin scope UNCHANGED by the toggle being on.
    check(figures_match((await get_summary(client, admin_tok, "user", "live")).json()["totals"],
                        expected(ctx, "user", "live")["totals"]),
          "S-ON: admin still sees shop-wide, unchanged by the toggle")

    # =====================================================================
    header("E -- the 422s, each pinned to its field")
    # to_date < from_date
    r = await client.get("/reports/summary", headers=auth(admin_tok),
                         params={"from_date": TO_DATE, "to_date": FROM_DATE,
                                 "by": "day", "state": "live"})
    d = r.json().get("detail", {})
    check(r.status_code == 422 and isinstance(d, dict) and d.get("code") == "date_range_inverted"
          and d.get("field") == "to_date",
          f"E: to_date < from_date -> 422 date_range_inverted on to_date (got {r.status_code} {d})")
    # span 367 (inclusive)
    wide_to = (D0 + dt.timedelta(days=366)).isoformat()
    r = await client.get("/reports/summary", headers=auth(admin_tok),
                         params={"from_date": FROM_DATE, "to_date": wide_to,
                                 "by": "day", "state": "live"})
    d = r.json().get("detail", {})
    check(r.status_code == 422 and isinstance(d, dict) and d.get("code") == "date_range_too_wide"
          and d.get("span_days") == 367,
          f"E: span 367 -> 422 date_range_too_wide (got {r.status_code} {d})")
    # by=weigher (not a Literal member)
    r = await client.get("/reports/summary", headers=auth(admin_tok),
                         params={"from_date": FROM_DATE, "to_date": TO_DATE,
                                 "by": "weigher", "state": "live"})
    d = r.json().get("detail")
    loc = d[0].get("loc") if isinstance(d, list) and d else None
    check(r.status_code == 422 and loc is not None and "by" in loc,
          f"E: by=weigher -> 422 naming the field 'by' (got {r.status_code} loc={loc})")
    # missing from_date
    r = await client.get("/reports/summary", headers=auth(admin_tok),
                         params={"to_date": TO_DATE, "by": "day", "state": "live"})
    d = r.json().get("detail")
    loc = d[0].get("loc") if isinstance(d, list) and d else None
    check(r.status_code == 422 and loc is not None and "from_date" in loc,
          f"E: missing from_date -> 422 naming 'from_date' (got {r.status_code} loc={loc})")

    # =====================================================================
    header("M -- money and weight are STRINGS, never JSON numbers")
    body = (await get_summary(client, admin_tok, "day", "all")).json()
    fields = []
    for row in body["rows"] + [body["totals"]]:
        for f in ("net_weight", "paid_total", "list_total", "list_minus_paid"):
            fields.append(row[f])
    check(all(isinstance(v, str) for v in fields),
          "M: every money/weight value is a string (isinstance str), not a JSON number")


async def main() -> int:
    global BASE
    ap = argparse.ArgumentParser(description="Prove GET /reports/summary over real HTTP.")
    ap.add_argument("--database", default=None,
                    help=f"a SCRATCH database. Omit to self-restore {SCRATCH_DB!r} from a "
                         "live dump (live is read only). Never the live database: this "
                         "proof writes bills that hard rule 5 forbids removing.")
    ap.add_argument("--skip-restore", action="store_true",
                    help="use the scratch as it stands (must already be provisioned).")
    args = ap.parse_args()

    app_live = make_url(os.environ["APP_DATABASE_URL"])
    dir_live = make_url(os.environ["DIRECTORY_DATABASE_URL"])
    live_name = app_live.database

    if args.database is not None and args.database == live_name:
        print(f"REFUSED: --database {args.database!r} is the LIVE database from"
              " APP_DATABASE_URL.\n  This proof creates bills that cannot be removed"
              " (hard rule 5). Omit --database to self-restore a scratch.")
        return 2
    scratch = args.database or SCRATCH_DB
    if scratch == live_name:
        print(f"REFUSED: the scratch name {scratch!r} equals the live database.")
        return 2

    if not args.skip_restore:
        print(f"  restoring scratch {scratch!r} from a live dump of {live_name!r}"
              " (live read-only)...")
        try:
            restore_scratch(live_name, scratch)
        except Exception as exc:  # noqa: BLE001
            print(f"REFUSED: could not restore the scratch: {exc}")
            return 2

    # Point THIS process and the child uvicorn at the scratch, BEFORE importing
    # app.db / app.config (they read the environment at import).
    os.environ["APP_DATABASE_URL"] = app_live.set(
        database=scratch).render_as_string(hide_password=False)
    os.environ["DIRECTORY_DATABASE_URL"] = dir_live.set(
        database=scratch).render_as_string(hide_password=False)

    ctx = Ctx()

    port = free_port()
    BASE = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(
        mode="w", suffix=".log", prefix="prove_reports_summary_",
        delete=False, encoding="utf-8")
    proc = subprocess.Popen(
        [sys.executable, "-u", "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=SERVER_DIR, env=dict(os.environ),
        stdout=log, stderr=subprocess.STDOUT)
    print(f"  child uvicorn pid={proc.pid} on {BASE} against scratch {scratch!r}"
          f" (log {log.name})")

    try:
        why = wait_for_health(proc)
        if why:
            print(_tail(log.name))
            check(False, f"E0: server started -- {why}")
            return 1
        wrong = assert_serving_this_code()
        if wrong:
            check(False, f"E0: serving THIS code -- {wrong}")
            return 1
        check(True, "E0: /openapi.json declares /reports/summary (4 params) and "
                    "ShopUpdate.staff_money_visible")

        try:
            await provision(ctx)
        except Exception as exc:  # noqa: BLE001
            print(f"UNFIT: provisioning failed: {exc!r}")
            return 2
        print(f"      provisioned MAIN={ctx.main_tenant} OTHER={ctx.other_tenant}")

        async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
            admin_tok = await login(client, ctx.main_tenant, "admin", ADMIN_PW)
            staff_tok = await login(client, ctx.main_tenant, "staff", STAFF_PW)
            other_tok = await login(client, ctx.other_tenant, "admin", OTHER_ADMIN_PW)
            tokens = {"admin": admin_tok, "staff": staff_tok, "other_admin": other_tok}
            try:
                await seed_fixture(ctx, client, tokens)
            except Exception as exc:  # noqa: BLE001
                print(f"UNFIT: seeding the fixture failed: {exc!r}")
                return 2
            print("      fixture seeded (7 MAIN bills incl. 1 void + midnight pair,"
                  " 1 OTHER bill)")

            await run(ctx, admin_tok, staff_tok, other_tok, client)

        return 1 if failures else 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()
        try:
            os.unlink(log.name)
        except OSError:
            pass


if __name__ == "__main__":
    rc = asyncio.run(main())
    print(f"PROVE_REPORTS_SUMMARY_EXIT={rc}")
    sys.exit(rc)
