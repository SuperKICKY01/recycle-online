"""Prove GET /sellers/{seller_id}/history -- seller history at the weighbridge
(P1.21, the reading half) -- over real HTTP: a seller's prior bills newest first,
voids included and marked, the empty case distinguishable from an unknown seller,
and money gated by the per-shop staff-money-visibility toggle (G2).

    uv run python scripts/prove_seller_history.py --database recycle_seller_history_scratch
    uv run python scripts/prove_seller_history.py        (self-restores the scratch)

WHAT DATABASE, AND WHY A SCRATCH. This proof creates purchase bills -- hard-rule-5
transactions that cannot be deleted -- voids one, and GRANTS money.view_own to the
staff role by SQL (what PATCHing tenants.staff_money_visible did before migration
0019). Writing those into dev would leave them forever
(lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-database.md, "DEV IS
NOT SCRATCH"). So it RESTORES its own scratch from a live dump (backup_db.py ->
restore_db.py, the prove_reports_summary / prove_seller_code_guards shape; the live
dev database is only READ), REFUSES to run against the live database, and points
its own process AND its child uvicorn at the scratch via APP_DATABASE_URL /
DIRECTORY_DATABASE_URL. It DELETES nothing and provisions its OWN two throwaway
tenants (fresh uuids each run) rather than touch the seeded shops -- so every
assertion is an ABSOLUTE hand-computed figure, not a delta, because the tenant
under test contains ONLY this run's fixture (RLS isolates it). This is the brief's
preferred scratch-database pattern; the choice is stated here per its "say which".

WHAT IT TALKS TO, ESTABLISHED BEFORE ANY CELL. Its OWN uvicorn on a FREE port
(never a fixed one), watching the child rather than only the clock, and
/openapi.json must declare GET /sellers/{seller_id}/history with its seller_id path
param and its limit query param before any cell is read (lessons/a-proof-must-
establish-what-it-is-talking-to.md): a server that does not declare the route is
not this code, and its careful negative cells would go green over the OLD code.

THE HAND-COMPUTED SUMS DUPLICATE THE ARITHMETIC, THEY DO NOT SHARE IT
(lessons/a-checker-must-not-share-the-code-it-checks.md). Each line amount and each
bill total is computed in Python Decimal from the fixture literals -- round(net *
unit, 2), ROUND_HALF_UP, the second implementation of bills._line_amount that can
DISAGREE with the route's SQL -- and NEVER read back off the response. The shop-day
boundary IS imported (config.SHOP_TIMEZONE) rather than re-derived, because a second
date expression here would be a second formatter, correct by luck all day and wrong
across Bangkok midnight (lessons/render-in-shop-time-not-device-time.md). The
list_price each line is priced against is READ from the scratch (an INPUT).

MONEY AND WEIGHT ARE COMPARED AS STRINGS, BYTE FOR BYTE, never as floats
(lessons/sqlite-money-is-text.md, a-backup-is-a-claim-until-it-is-restored.md
"Compare money and weight as TEXT, digit for digit"): the route emits decimal
strings and the proof asserts string equality, so the IEEE-754 behaviour a JSON
number would carry cannot pass unnoticed.

THE MONEY-ABSENT CELL HAS A POSITIVE-CONTROL SIBLING (lessons/a-check-that-never-
went-red-was-never-observed.md): the staff-off body is asserted NOT to contain the
strings "total_amount"/"unit_price" -- and the SAME assertion is shown to FIRE on
the admin body, where those strings DO occur. "found nothing" is thereby
distinguished from an instrument that never looked.

RUNS TWICE (lessons/proof-must-run-twice.md). Each invocation re-restores its
scratch and provisions fresh tenants, so a second run is independent and passes.

EXIT IS RED UNLESS THE FULL SUCCESS PATH IS REACHED. main() returns 1 on any
failure, 2 when it could not run (unfit fixture / wrong database), and 0 only at
the very end. A crash prints no EXIT line; an ABSENT exit line is the failure
signal (lessons/a-check-that-never-went-red-was-never-observed.md).

THE FOUR DISPROOFS (performed by the operator on server/app/master.py, recorded in
the phase report -- the prove_reports_summary shape). Each names its cell FIRST,
reddens EXACTLY that cell, and reverts green:
  (a) drop the money gate (always include total_amount/unit_price regardless of the
      toggle) -> the S-OFF ABSENT-KEYS cell reddens: the staff-off body then carries
      money. Its presence sibling (admin body carries money) stays green.
  (b) drop the void flag (is_void hardcoded false, or the voided_at check removed)
      -> the VOID-MARKED cell reddens: the voided bill reads is_void=false.
  (c) order oldest-first (ORDER BY server_received_at ASC) -> the ORDERING cell
      reddens: the newest-first bill id sequence flips.
  (d) drop the existence check (return [] for an unknown seller instead of 404)
      -> the UNKNOWN-SELLER 404 cell reddens: an unknown id returns 200 empty.
"""
from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import json
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
SCRATCH_DB = "recycle_seller_history_scratch"
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
# overwriting it. Lifted from prove_reports_summary.restore_scratch.
# ---------------------------------------------------------------------------
def restore_scratch(live_name: str, scratch: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-history-dump-{RUN}")
    label = f"history-{RUN}"
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
# THE FIXTURE, declared as literals. One SUBJECT seller (s1) with five bills
# across four shop-local days, one of them VOIDED and one straddling shop
# midnight; one seller with ZERO bills (s2); one seller in a SECOND tenant (the
# cross-tenant control). Every bill has an off-list first line (unit = list +
# delta) and an on-list second line, so unit_price != list_price on at least one
# line of every bill.
# ---------------------------------------------------------------------------
# product -> its four grade prices (the fresh tenant's seeded price list).
PRICES = {
    "FE": {"A": "15.50", "B": "15.00", "C": "14.50", "D": "14.00"},
    "AL": {"A": "45.00", "B": "44.00", "C": "43.00", "D": "42.00"},
}
# product -> (code, name). Distinct name so product_name is a meaningful column.
PRODUCTS = {"FE": ("FE-STEEL", "เหล็ก"), "AL": ("AL-CAN", "อลูมิเนียม")}
# MAIN tenant sellers. s1 is the history subject; s2 has no bills.
SELLERS = {
    "s1": ("S001", "B"),
    "s2": ("S002", "A"),
}
D0 = dt.date(2026, 3, 10)  # a settled past window inside the current BE year.


def at(day_offset: int, h: int, m: int) -> dict:
    """A SHOP-time instant, given as an offset in days from D0. The proof imports
    SHOP_TIMEZONE for this (the convention), never re-derives an offset."""
    return {"day_offset": day_offset, "h": h, "m": m}


# (name, product, seller, creator, when, voided, lines[(net, delta)]).
# creator in {"admin", "staff"} -- deliberately MIXED, so the staff-toggle-on cell
# can prove a staff caller sees the money on bills OTHER staff/admin weighed (G2's
# reading is broader than E1's own-bills scoping on /reports/summary).
FIXTURE = [
    ("h1", "FE", "s1", "admin", at(0, 10, 0),  False, [("10.000", "1.00"), ("4.000", "0")]),
    ("h2", "AL", "s1", "staff", at(0, 14, 0),  False, [("2.000", "5.00"), ("1.000", "0")]),
    ("h3", "FE", "s1", "admin", at(1, 9, 0),   True,  [("6.000", "0.50"), ("2.000", "0")]),
    # the midnight pair: 23:30 shop time on day 2, 00:30 shop time on day 3. h5's
    # UTC date is day 2, its SHOP date day 3 -- the straddle the shop conversion
    # must get right.
    ("h4", "AL", "s1", "staff", at(2, 23, 30), False, [("8.000", "1.00"), ("2.000", "0")]),
    ("h5", "FE", "s1", "admin", at(3, 0, 30),  False, [("1.000", "5.00"), ("2.000", "0")]),
]
FIXTURE_BY_NAME = {row[0]: row for row in FIXTURE}
# newest-first by server_received_at, hand-derived from the instants above.
EXPECTED_ORDER = ["h5", "h4", "h3", "h2", "h1"]

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
        # name -> the client-generated bill id we created it with.
        self.bill_ids: dict[str, uuid.UUID] = {}


ADMIN_PW = "history-admin-pw"
STAFF_PW = "history-staff-pw"
OTHER_ADMIN_PW = "history-other-pw"


def creator_id(ctx: Ctx, who: str) -> uuid.UUID:
    return ctx.admin_id if who == "admin" else ctx.staff_id


def shop_dt(when: dict) -> dt.datetime:
    from app.config import SHOP_TIMEZONE
    d = D0 + dt.timedelta(days=when["day_offset"])
    return dt.datetime(d.year, d.month, d.day, when["h"], when["m"], tzinfo=SHOP_TIMEZONE)


def shop_date_iso(when: dict) -> str:
    from app.config import SHOP_TIMEZONE
    return shop_dt(when).astimezone(SHOP_TIMEZONE).date().isoformat()


def utc_date_iso(when: dict) -> str:
    return shop_dt(when).astimezone(dt.timezone.utc).date().isoformat()


def list_price(ctx: Ctx, product: str, seller: str) -> Decimal:
    return ctx.list_of[(product, SELLERS[seller][1])]


# ---------------------------------------------------------------------------
# the expected bill payload -- computed from the fixture literals, NOT the route.
# ---------------------------------------------------------------------------
def expected_products(ctx: Ctx, name: str, with_money: bool) -> list[dict]:
    _n, product, seller, _c, _w, _v, lines = FIXTURE_BY_NAME[name]
    lp = list_price(ctx, product, seller)
    out = []
    for net_s, delta_s in lines:
        line = {
            "product_id": str(ctx.product_ids[product]),
            "product_name": PRODUCTS[product][1],
            "net_weight": weight(Decimal(net_s)),
        }
        if with_money:
            line["unit_price"] = money(lp + Decimal(delta_s))
        out.append(line)
    return out


def expected_total(ctx: Ctx, name: str) -> str:
    _n, product, seller, _c, _w, _v, lines = FIXTURE_BY_NAME[name]
    lp = list_price(ctx, product, seller)
    total = sum(
        (line_amount(Decimal(net_s), lp + Decimal(delta_s)) for net_s, delta_s in lines),
        Decimal("0.00"),
    )
    return money(total)


def bill_ok(ctx: Ctx, got: dict, name: str, with_money: bool) -> tuple[bool, str]:
    """Does the response bill equal the hand-computed one? Returns (ok, why)."""
    _n, _p, _s, _c, when, voided, _lines = FIXTURE_BY_NAME[name]
    if got.get("bill_id") != str(ctx.bill_ids[name]):
        return False, f"bill_id {got.get('bill_id')} != {ctx.bill_ids[name]}"
    if got.get("is_void") is not voided:
        return False, f"is_void {got.get('is_void')!r} != {voided!r}"
    if got.get("received_date") != shop_date_iso(when):
        return False, f"received_date {got.get('received_date')} != {shop_date_iso(when)}"
    if "doc_no" not in got:
        return False, "doc_no key absent"
    exp_products = expected_products(ctx, name, with_money)
    if got.get("products") != exp_products:
        return False, f"products {got.get('products')} != {exp_products}"
    if with_money:
        if got.get("total_amount") != expected_total(ctx, name):
            return False, f"total_amount {got.get('total_amount')} != {expected_total(ctx, name)}"
    else:
        if "total_amount" in got:
            return False, "total_amount PRESENT with money excluded"
    return True, ""


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
    """Identity: /openapi.json declares GET /sellers/{seller_id}/history with the
    seller_id path param and the limit query param. Either missing => not this
    code, and the negative cells would go green over a server that predates it."""
    try:
        r = httpx.get(f"{BASE}/openapi.json", timeout=5.0)
    except httpx.HTTPError as exc:
        return f"/openapi.json unreachable: {exc}"
    if r.status_code != 200:
        return f"/openapi.json returned {r.status_code}"
    doc = r.json()
    op = doc.get("paths", {}).get("/sellers/{seller_id}/history", {}).get("get")
    if op is None:
        return "the server does not declare GET /sellers/{seller_id}/history -- predates P1.21"
    params = {p["name"]: p.get("in") for p in op.get("parameters", [])}
    if params.get("seller_id") != "path":
        return f"seller_id is not declared as a path param (params={params})"
    if params.get("limit") != "query":
        return f"limit is not declared as a query param (params={params})"
    return ""


async def login(client: httpx.AsyncClient, tenant: uuid.UUID, username: str, password: str) -> str:
    r = await client.post(
        "/auth/login",
        json={"tenant_id": str(tenant), "username": username, "password": password},
    )
    r.raise_for_status()
    return r.json()["access_token"]


# ---------------------------------------------------------------------------
# the staff money grant (0019): what the staff_money_visible toggle became
# ---------------------------------------------------------------------------
async def grant_staff_money(tenant, on: bool) -> None:
    """Grant (on) or revoke (off) money.view_own on this tenant's STAFF role, by
    SQL under the tenant context with a declared actor (role_permissions is
    audited). This is the row migration 0019's fold writes for a tenant whose
    toggle was true; no route writes it until the role screen exists."""
    from sqlalchemy import text
    from app.db import SYSTEM_ACTOR_ID, tenant_connection
    async with tenant_connection(
        tenant, actor_id=SYSTEM_ACTOR_ID, actor_username="system:prove_seller_history",
    ) as conn:
        if on:
            await conn.execute(text(
                "INSERT INTO role_permissions (tenant_id, role_id, permission)"
                " SELECT r.tenant_id, r.id, 'money.view_own' FROM roles r"
                "  WHERE r.code = 'staff' ON CONFLICT DO NOTHING"))
        else:
            await conn.execute(text(
                "DELETE FROM role_permissions rp USING roles r"
                " WHERE r.id = rp.role_id AND r.code = 'staff'"
                "   AND rp.permission = 'money.view_own'"))


async def staff_money_granted(tenant) -> bool:
    """Re-read the grant OUT OF POSTGRES, not off a response body."""
    from sqlalchemy import text
    from app.db import tenant_connection
    async with tenant_connection(tenant) as conn:
        return bool((await conn.execute(text(
            "SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id"
            " WHERE r.code = 'staff' AND rp.permission = 'money.view_own'"))).scalar_one())


# ---------------------------------------------------------------------------
# provisioning: two fresh throwaway tenants, master data, users. No DELETE.
# ---------------------------------------------------------------------------
async def provision(ctx: Ctx) -> None:
    from sqlalchemy import text
    from app.db import SYSTEM_ACTOR_ID, tenant_connection
    from app.permissions import seed_system_roles
    from app.security import hash_password

    admin_hash = await hash_password(ADMIN_PW)
    staff_hash = await hash_password(STAFF_PW)
    other_hash = await hash_password(OTHER_ADMIN_PW)

    async def seed_tenant(tid, name, users, uom, cat, products, sellers):
        async with tenant_connection(
            tid, actor_id=SYSTEM_ACTOR_ID,
            actor_username="system:prove_seller_history",
        ) as conn:
            await conn.execute(
                text("INSERT INTO tenants (id, name) VALUES (:id, :n)"),
                {"id": tid, "n": name},
            )
            # THE BORN-WITH BRANCH (0018): this fresh tenant writes bills through
            # POST /bills, which resolves an absent branch_id to the tenant's
            # single active branch -- provisioned here as provision_shop.py does,
            # and as 0015 made this seed provision a tier.
            await conn.execute(
                text("INSERT INTO branches (tenant_id, code, name, doc_prefix, is_active)"
                     " VALUES (:t, 'MAIN', :n, 'B', true)"),
                {"t": tid, "n": name},
            )
            # THE THREE SYSTEM ROLES (0019): users.role_id is NOT NULL with a
            # composite FK to roles, so the tenant is provisioned with its roles
            # first, as provision_shop.py provisions them (the 0018 conscription
            # for the branch above, one table on).
            roles = await seed_system_roles(conn, tid)
            for uid, un, fn, role, ph in users:
                await conn.execute(
                    text("INSERT INTO users (id, tenant_id, username, full_name, role_id,"
                         " password_hash) VALUES (:id, :t, :u, :fn, :r, :ph)"),
                    {"id": uid, "t": tid, "u": un, "fn": fn, "r": roles[role], "ph": ph},
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
            # exist before a graded row references it. This tenant is FRESH (its
            # tiers are not backfilled), so seed one per distinct grade it uses --
            # same transaction, so the FK sees them.
            tier_codes = sorted(
                {g for _p, _c, _n, prices in products for g in prices}
                | {g for _s, _c, g in sellers if g}
            )
            for _i, tcode in enumerate(tier_codes):
                await conn.execute(
                    text("INSERT INTO grade_tiers (tenant_id, code, name,"
                         " sort_order, is_active)"
                         " VALUES (:t, :code, :code, :so, true)"),
                    {"t": tid, "code": tcode, "so": _i},
                )
            for pid, code, pname, prices in products:
                await conn.execute(
                    text("INSERT INTO products (id, tenant_id, category_id, uom_id, code,"
                         " name, is_active) VALUES (:id, :t, :c, :u, :code, :name, true)"),
                    {"id": pid, "t": tid, "c": cat, "u": uom, "code": code, "name": pname},
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
        ctx.main_tenant, f"History MAIN {RUN}",
        [(ctx.admin_id, "admin", "Main Admin", "admin", admin_hash),
         (ctx.staff_id, "staff", "Main Staff", "staff", staff_hash)],
        ctx.uom_id, ctx.cat_id,
        [(ctx.product_ids["FE"], PRODUCTS["FE"][0], PRODUCTS["FE"][1], PRICES["FE"]),
         (ctx.product_ids["AL"], PRODUCTS["AL"][0], PRODUCTS["AL"][1], PRICES["AL"])],
        [(ctx.seller_ids[k], SELLERS[k][0], SELLERS[k][1]) for k in SELLERS],
    )
    await seed_tenant(
        ctx.other_tenant, f"History OTHER {RUN}",
        [(ctx.other_admin_id, "admin", "Other Admin", "admin", other_hash)],
        ctx.other_uom_id, ctx.other_cat_id,
        [(ctx.other_product_id, "FE-STEEL", "เหล็ก", {"A": "9.50", "B": "9.00", "C": "8.50", "D": "8.00"})],
        [(ctx.other_seller_id, "S001", "A")],
    )

    # read the effective list price per (product, seller-grade) FROM the scratch --
    # the seeded reference, an INPUT (as prove_reports_summary reads it).
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
            "vehicle_no": f"HIS-{RUN[:4]}",
            "device_created_at": shop_dt(when).astimezone(dt.timezone.utc).isoformat(),
            "idempotency_key": f"history-{RUN}-{name}",
            "items": items,
        })
        if r.status_code != 201:
            raise RuntimeError(f"POST /bills {name} -> {r.status_code}: {r.text[:300]}")
        ctx.bill_ids[name] = bid
        async with tenant_connection(ctx.main_tenant) as conn:
            await conn.execute(
                text("UPDATE purchase_bills SET server_received_at = :s WHERE id = :i"),
                {"s": shop_dt(when).astimezone(dt.timezone.utc), "i": bid},
            )

    # void h3 through the real admin path (created by admin, voided by admin).
    rv = await client.post(
        f"/bills/{ctx.bill_ids['h3']}/void", headers=auth(tokens["admin"]),
        json={"reason": f"history proof {RUN}: fixture void"},
    )
    if rv.status_code != 200:
        raise RuntimeError(f"void h3 -> {rv.status_code}: {rv.text[:300]}")

    # OTHER tenant: one bill against OTHER's seller (the cross-tenant control's
    # positive side -- OTHER's own admin must be able to see it).
    bo = uuid.uuid4()
    ro = await client.post("/bills", headers=auth(tokens["other_admin"]), json={
        "id": str(bo),
        "seller_id": str(ctx.other_seller_id),
        "vehicle_no": "OTHER",
        "device_created_at": shop_dt(at(1, 12, 0)).astimezone(dt.timezone.utc).isoformat(),
        "idempotency_key": f"history-{RUN}-other",
        "items": [{
            "id": str(uuid.uuid4()), "product_id": str(ctx.other_product_id), "line_no": 1,
            "gross_weight": "5.000", "tare_weight": "0.000", "net_weight": "5.000",
            "unit_price": "9.50",
        }],
    })
    if ro.status_code != 201:
        raise RuntimeError(f"OTHER bill -> {ro.status_code}: {ro.text[:300]}")


async def get_history(client, token, seller_id, limit=None):
    params = {} if limit is None else {"limit": limit}
    return await client.get(
        f"/sellers/{seller_id}/history", headers=auth(token), params=params,
    )


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
async def run(ctx: Ctx, admin_tok, staff_tok, other_tok, client) -> None:
    s1 = ctx.seller_ids["s1"]
    s2 = ctx.seller_ids["s2"]

    # =====================================================================
    header("A -- newest first by server_received_at (disproof c reddens this)")
    r = await get_history(client, admin_tok, s1, limit=20)
    check(r.status_code == 200, f"A: admin history(s1) -> 200 (got {r.status_code})")
    body = r.json()
    got_ids = [b["bill_id"] for b in body["bills"]]
    exp_ids = [str(ctx.bill_ids[n]) for n in EXPECTED_ORDER]
    print(f"      order got={got_ids}")
    print(f"      order exp={exp_ids}")
    check(got_ids == exp_ids,
          "A: the bills are newest-first by server_received_at (h5,h4,h3,h2,h1)")
    admin_body = body  # reused as the money presence sibling and the ON comparand

    # =====================================================================
    header("B -- limit respected, and its bound refused (422 on 'limit')")
    r2 = await get_history(client, admin_tok, s1, limit=2)
    b2 = r2.json()
    check(r2.status_code == 200 and b2["limit"] == 2 and len(b2["bills"]) == 2,
          f"B: limit=2 -> exactly 2 bills, limit echoed (got {r2.status_code}, "
          f"{len(b2['bills'])} bills, limit={b2.get('limit')})")
    check([b["bill_id"] for b in b2["bills"]] == [str(ctx.bill_ids['h5']), str(ctx.bill_ids['h4'])],
          "B: limit=2 returns the TWO NEWEST (h5, h4), not an arbitrary two")
    rd = await get_history(client, admin_tok, s1)  # no limit -> default
    bd = rd.json()
    check(rd.status_code == 200 and bd["limit"] == 5 and len(bd["bills"]) == 5,
          f"B: default limit is 5 (got limit={bd.get('limit')}, {len(bd['bills'])} bills)")
    for bad in (0, 21, 100):
        rb = await get_history(client, admin_tok, s1, limit=bad)
        d = rb.json().get("detail")
        loc = d[0].get("loc") if isinstance(d, list) and d else None
        check(rb.status_code == 422 and loc is not None and "limit" in loc,
              f"B: limit={bad} -> 422 naming the field 'limit' (got {rb.status_code} loc={loc})")

    # =====================================================================
    header("C -- the voided bill is INCLUDED and marked is_void (disproof b)")
    by_id = {b["bill_id"]: b for b in admin_body["bills"]}
    h3 = by_id[str(ctx.bill_ids["h3"])]
    print(f"      h3 is_void={h3['is_void']}  present={str(ctx.bill_ids['h3']) in by_id}")
    check(str(ctx.bill_ids["h3"]) in by_id and h3["is_void"] is True,
          "C: the voided bill h3 is PRESENT and is_void=true")
    live_flags = {n: by_id[str(ctx.bill_ids[n])]["is_void"] for n in ("h1", "h2", "h4", "h5")}
    check(all(v is False for v in live_flags.values()),
          f"C: the four live bills are is_void=false ({live_flags})")

    # =====================================================================
    header("D -- weights and (admin) money byte-for-byte equal the hand-computed")
    for n in EXPECTED_ORDER:
        got = by_id[str(ctx.bill_ids[n])]
        ok, why = bill_ok(ctx, got, n, with_money=True)
        if not ok:
            print(f"        MISMATCH {n}: {why}")
        check(ok, f"D: bill {n} equals the hand-computed payload (strings, byte-for-byte)")

    # =====================================================================
    header("E -- the midnight-straddle bill takes its SHOP day, not the UTC day")
    h5 = by_id[str(ctx.bill_ids["h5"])]
    shop_d = shop_date_iso(at(3, 0, 30))   # 2026-03-13
    utc_d = utc_date_iso(at(3, 0, 30))     # 2026-03-12
    print(f"      h5 received_date={h5['received_date']}  shop={shop_d}  utc={utc_d}")
    check(h5["received_date"] == shop_d, f"E: h5.received_date is the SHOP day ({shop_d})")
    # control: the pair really does straddle -- shop and UTC dates DIFFER, so the
    # conversion is doing work (a UTC bucket would read the previous day).
    check(shop_d != utc_d,
          f"E (control): h5 straddles midnight -- shop day {shop_d} != UTC day {utc_d}")
    h4 = by_id[str(ctx.bill_ids["h4"])]
    check(h4["received_date"] == shop_date_iso(at(2, 23, 30)),
          f"E: h4.received_date is its shop day ({shop_date_iso(at(2, 23, 30))})")

    # =====================================================================
    header("F -- a seller with NO bills: 200, empty list, seller_id echoed")
    rz = await get_history(client, admin_tok, s2)
    bz = rz.json()
    print(f"      status={rz.status_code} seller_id={bz.get('seller_id')} "
          f"bills={bz.get('bills')} money_included={bz.get('money_included')}")
    check(rz.status_code == 200, f"F: zero-bill seller -> 200 (got {rz.status_code})")
    check(bz.get("bills") == [], "F: bills is an empty list (not an error, not a 404)")
    check(bz.get("seller_id") == str(s2), "F: seller_id is echoed")
    check(bz.get("money_included") is True, "F: money_included is true for admin (consistent)")

    # =====================================================================
    header("G -- an UNKNOWN seller is 404 seller_not_found (disproof d reddens this)")
    unknown = uuid.uuid4()
    ru = await get_history(client, admin_tok, unknown)
    d = ru.json().get("detail", {})
    code = d.get("code") if isinstance(d, dict) else None
    print(f"      status={ru.status_code} code={code!r}")
    check(ru.status_code == 404, f"G: unknown seller -> 404 (got {ru.status_code})")
    check(code == "seller_not_found", f"G: refusal pinned to detail.code (code={code!r})")

    # =====================================================================
    header("H -- another tenant's seller is 404 (RLS makes it invisible), not empty")
    rx = await get_history(client, admin_tok, ctx.other_seller_id)
    dx = rx.json().get("detail", {})
    codex = dx.get("code") if isinstance(dx, dict) else None
    print(f"      MAIN admin -> other seller: status={rx.status_code} code={codex!r}")
    check(rx.status_code == 404 and codex == "seller_not_found",
          "H: MAIN admin reading OTHER's seller -> 404 (RLS: _read_seller sees zero "
          "rows -> _not_found; NEVER 403, NEVER an empty 200)")
    # positive control: OTHER's OWN admin sees that seller's history (not vacuous).
    ro = await get_history(client, other_tok, ctx.other_seller_id)
    bo = ro.json()
    check(ro.status_code == 200 and len(bo["bills"]) == 1,
          f"H (control): OTHER's own admin sees the seller's 1 bill (got "
          f"{ro.status_code}, {len(bo.get('bills', []))} bills) -- so H is not vacuous")

    # =====================================================================
    header("S -- the staff money gate (G2): keys ABSENT off, PRESENT & equal on")
    # OFF (default): staff CAN read history (200, not 403), money_included=false,
    # and the SERIALISED body carries neither money string.
    rs = await get_history(client, staff_tok, s1, limit=20)
    staff_off = rs.json()
    raw_off = json.dumps(staff_off, ensure_ascii=False)
    print(f"      S-OFF: status={rs.status_code} money_included={staff_off.get('money_included')}")
    check(rs.status_code == 200, f"S-OFF: staff GET history -> 200, NOT 403 (got {rs.status_code})")
    check(staff_off.get("money_included") is False, "S-OFF: money_included is false")
    check("total_amount" not in raw_off and "unit_price" not in raw_off,
          "S-OFF: the serialised body contains NEITHER 'total_amount' NOR 'unit_price'")
    # the absence is money-ONLY: the non-money facts are still there.
    check(len(staff_off["bills"]) == 5
          and all(len(b["products"]) >= 1 and "net_weight" in b["products"][0]
                  for b in staff_off["bills"]),
          "S-OFF: the non-money facts (bills, products, net_weight) ARE present")
    # POSITIVE CONTROL SIBLING: the SAME string-search FIRES on the admin body, so
    # "found nothing" above is not an instrument that never looked.
    raw_admin = json.dumps(admin_body, ensure_ascii=False)
    check("total_amount" in raw_admin and "unit_price" in raw_admin,
          "S-OFF (control): the admin body DOES contain 'total_amount' and 'unit_price'")

    # GRANT money.view_own to this tenant's staff role -- what PATCH /shop
    # staff_money_visible=true did before 0019, now a grant row (by SQL: the
    # role-management route is not built; the migration's fold is the same row).
    await grant_staff_money(ctx.main_tenant, True)
    check((await staff_money_granted(ctx.main_tenant)) is True,
          "S: money.view_own GRANTED to the staff role, re-read from role_permissions")

    # ON: staff now sees money on ALL of s1's bills, EQUAL to the admin body (proving
    # no created_by=self scoping -- G2's reading, broader than E1's on /reports/summary).
    rs2 = await get_history(client, staff_tok, s1, limit=20)
    staff_on = rs2.json()
    print(f"      S-ON: status={rs2.status_code} money_included={staff_on.get('money_included')}")
    check(rs2.status_code == 200 and staff_on.get("money_included") is True,
          f"S-ON: staff GET history -> 200, money_included true (got {rs2.status_code})")
    check(staff_on == admin_body,
          "S-ON: the staff body EQUALS the admin body byte-for-byte -- money on ALL "
          "of the seller's bills (h2/h4 weighed by staff, h1/h3/h5 by admin), no "
          "created_by=self scope")

    # REVOKE it again in finally-like fashion and RE-READ the grant table.
    await grant_staff_money(ctx.main_tenant, False)
    check((await staff_money_granted(ctx.main_tenant)) is False,
          "S: money.view_own REVOKED from the staff role and RE-READ absent (fixture restored)")
    # and the staff money is gone again -- the toggle, not a one-way door.
    raw_off2 = json.dumps((await get_history(client, staff_tok, s1)).json(), ensure_ascii=False)
    check("total_amount" not in raw_off2,
          "S: with the toggle off again, the staff money keys are ABSENT once more")

    # =====================================================================
    header("M -- every money/weight value is a STRING, never a JSON number")
    vals = []
    for b in admin_body["bills"]:
        vals.append(b["total_amount"])
        for p in b["products"]:
            vals.append(p["net_weight"])
            vals.append(p["unit_price"])
    check(all(isinstance(v, str) for v in vals),
          "M: every total_amount / net_weight / unit_price is a string (isinstance str)")


async def main() -> int:
    global BASE
    ap = argparse.ArgumentParser(description="Prove GET /sellers/{seller_id}/history over real HTTP.")
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
        mode="w", suffix=".log", prefix="prove_seller_history_",
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
        check(True, "E0: /openapi.json declares GET /sellers/{seller_id}/history "
                    "(seller_id path, limit query)")

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
            print("      fixture seeded (s1: 5 bills incl. 1 void + midnight pair; "
                  "s2: 0 bills; OTHER: 1 bill)")

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
    print(f"PROVE_SELLER_HISTORY_EXIT={rc}")
    sys.exit(rc)
