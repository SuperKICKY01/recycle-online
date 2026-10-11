"""Prove the per-tenant grade model over real HTTP (P1.24 commit 1b, the routes).

    uv run python scripts/prove_grade_tiers.py        (self-restores the scratch)
    uv run python scripts/prove_grade_tiers.py --database recycle_grade_tiers_scratch

WHAT THIS PROVES, and WHY A SCRATCH. It configures grade tiers, creates sellers
against them, posts bills, and DEACTIVATES tiers -- writes that touch bills
(hard rule 5, undeletable) and master data. Writing them into dev would leave
them for ever, so it RESTORES its own scratch from a live dump (backup_db.py ->
restore_db.py, the prove_seller_history shape; live dev is READ only), REFUSES to
run against the live database, and points its own process AND its child uvicorn
at the scratch. It DELETES nothing and provisions its OWN three throwaway tenants
(fresh uuids each run) with NO grades -- every tier, price, seller and bill is
built through the REAL ROUTES, so each assertion is an absolute fact about a
tenant that contains only this run's fixture (RLS isolates it).

WHAT IT TALKS TO, established before any cell: its own uvicorn on a FREE port,
watching the child rather than the clock, and /openapi.json must declare
GET+POST /grade-tiers and PATCH /grade-tiers/{tier_id} before any cell is read
(lessons/a-proof-must-establish-what-it-is-talking-to.md) -- a server without the
routes is not this code and the negative cells would go green over it.

THE TIER NAMES ARE THAI, and they are compared as PYTHON STRINGS read back out of
Postgres (asyncpg decodes UTF-8), never judged by the console
(lessons/console-is-not-the-observation.md): two str values equal iff their
codepoints equal, which is the byte comparison this needs, with no console, pipe
or re-decode anywhere. Money and weight are decimal STRINGS compared byte-for-byte
(lessons/sqlite-money-is-text.md), read from purchase_bill_items, never off the
response.

THE DONE WHEN, READ OUT OF POSTGRES (P1.24): a shop configures a NON-DEFAULT tier
set (Thai names, its own order, TWELVE tiers -- F1, no ceiling), a seller is
created against one of its tiers, and a bill is priced from that tier -- all read
back from the database; AND a shop that does not grade (ONE tier) creates a seller
and posts a walk-in bill with NO office round trip (F2).

THE DISPROOFS (performed by the operator on server/app/master.py, recorded in the
phase report). Each names its cell FIRST, reddens EXACTLY it, and reverts:
  (a) drop the deactivation in_use check -> cell E: a tier with sellers deactivates
      with no 409.
  (b) drop the composite FK's tenant leg on sellers.grade -> cell H stays GREEN,
      because the ROUTE-level cross-tenant refusal is held by RLS + _validate_grade
      (grade_tiers is RLS-scoped, so another shop's code is simply not a tier here,
      a 422), NOT by the FK -- the FK is the structural backstop for a direct
      INSERT that bypasses the route, which prove_rls and the composite-FK structure
      cover. SAID here rather than staged, the unit-2 precedent.
  (c) drop _validate_grade in update_shop -> cell K: a foreign default_grade becomes
      the FK's IntegrityError 500 instead of the readable 422.
  (d) is a 1a-MIGRATION concern (backfill only from product_prices), not a route
      concern: this proof builds every tier through the route, so no tenant here
      goes through the backfill. Proven in 1a by the migration read-back; the
      backfill's UNION over product_prices+sellers+default_grade is what a
      sellers-only grade needs, and dev holds no such grade so it is vacuous there.
  (e) drop the last-active guard in update_grade_tier (commit 3) -> cell L: the
      shop's LAST active tier deactivates (409 -> 200), leaving ZERO active tiers,
      which is the F1 break the guard exists to refuse.
  (f) drop the set-equality check in reorder_grade_tiers (commit 3) -> cell M: a
      PARTIAL order is accepted (422 -> 200) and half-rewrites sort_order, which is
      the "an ordering that does not cover the set is not an ordering" refusal.

RUNS TWICE (lessons/proof-must-run-twice.md): each run re-restores its scratch and
provisions fresh tenants. EXIT is red unless the full success path is reached; an
ABSENT exit line is the failure signal
(lessons/a-check-that-never-went-red-was-never-observed.md).
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

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from lane import scratch_name  # noqa: E402  (scratch names are decided in lane.py only)
SCRATCH_DB = scratch_name("recycle_grade_tiers_scratch")
RUN = uuid.uuid4().hex[:8]

BASE = ""
failures: list[str] = []


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


def restore_scratch(live_name: str, scratch: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-gradetiers-dump-{RUN}")
    label = f"gradetiers-{RUN}"
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
# fixture: three throwaway tenants. MAIN configures the twelve-tier set; ONE is
# the one-tier F2 shop; OTHER is the cross-tenant control. Tier NAMES are Thai.
# ---------------------------------------------------------------------------
# code -> Thai name, for MAIN's twelve tiers. sort_order is REVERSED (12..1) so
# the read-back proves the SHOP's order, not insertion or alphabetical order.
MAIN_TIERS = [(f"T{i:02d}", f"เกรดที่ {i}") for i in range(1, 13)]  # T01..T12
PRICE_TIER = "T05"            # the tier a bill is priced from
MOVE_TIER = "T06"             # the tier the seller is moved to before deactivation
ONE_TIER_CODE = "มาตรฐาน"     # the one-tier shop's sole tier -- a Thai CODE too
ONE_TIER_NAME = "ราคาเดียว"

ADMIN_PW = "gt-admin-pw"
STAFF_PW = "gt-staff-pw"
OTHER_PW = "gt-other-pw"
ONE_PW = "gt-one-pw"


class Ctx:
    def __init__(self) -> None:
        self.main = uuid.uuid4()
        self.one = uuid.uuid4()
        self.other = uuid.uuid4()
        self.admin_id = uuid.uuid4()
        self.staff_id = uuid.uuid4()
        self.one_admin_id = uuid.uuid4()
        self.other_admin_id = uuid.uuid4()
        # product per tenant
        self.main_product = uuid.uuid4()
        self.one_product = uuid.uuid4()
        self.other_product = uuid.uuid4()
        self.uom = {t: uuid.uuid4() for t in ("main", "one", "other")}
        self.cat = {t: uuid.uuid4() for t in ("main", "one", "other")}


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
    try:
        r = httpx.get(f"{BASE}/openapi.json", timeout=5.0)
    except httpx.HTTPError as exc:
        return f"/openapi.json unreachable: {exc}"
    if r.status_code != 200:
        return f"/openapi.json returned {r.status_code}"
    paths = r.json().get("paths", {})
    coll = paths.get("/grade-tiers", {})
    if "get" not in coll or "post" not in coll:
        return "the server does not declare GET+POST /grade-tiers -- predates P1.24 1b"
    if "patch" not in paths.get("/grade-tiers/{tier_id}", {}):
        return "the server does not declare PATCH /grade-tiers/{tier_id}"
    if "put" not in paths.get("/grade-tiers/order", {}):
        return "the server does not declare PUT /grade-tiers/order -- predates P1.24 commit 3"
    return ""


async def login(client: httpx.AsyncClient, tenant: uuid.UUID, username: str, password: str) -> str:
    r = await client.post(
        "/auth/login",
        json={"tenant_id": str(tenant), "username": username, "password": password},
    )
    r.raise_for_status()
    return r.json()["access_token"]


async def provision(ctx: Ctx) -> None:
    """Three tenants, users and master data -- but NO grade_tiers, NO product_prices
    and NO sellers: those are built through the routes under test."""
    from sqlalchemy import text
    from app.db import SYSTEM_ACTOR_ID, tenant_connection
    from app.permissions import seed_system_roles
    from app.security import hash_password

    admin_hash = await hash_password(ADMIN_PW)
    staff_hash = await hash_password(STAFF_PW)
    one_hash = await hash_password(ONE_PW)
    other_hash = await hash_password(OTHER_PW)

    async def seed(tid, name, users, uom, cat, product_id):
        async with tenant_connection(
            tid, actor_id=SYSTEM_ACTOR_ID,
            actor_username="system:prove_grade_tiers",
        ) as conn:
            await conn.execute(
                text("INSERT INTO tenants (id, name) VALUES (:id, :n)"),
                {"id": tid, "n": name})
            # THE BORN-WITH BRANCH (0018): this proof mints a tenant by SQL and
            # then writes bills through POST /bills, which resolves an absent
            # branch_id to the tenant's single active branch -- so the tenant
            # must be provisioned with one, exactly as provision_shop.py does
            # and as 0015 made this seed provision a tier.
            await conn.execute(
                text("INSERT INTO branches (tenant_id, code, name, doc_prefix, is_active)"
                     " VALUES (:t, 'MAIN', :n, 'B', true)"),
                {"t": tid, "n": name})
            # THE THREE SYSTEM ROLES (0019): users.role_id is NOT NULL with a
            # composite FK to roles, so the tenant is provisioned with its roles
            # first, as provision_shop.py provisions them.
            roles = await seed_system_roles(conn, tid)
            for uid, un, fn, role, ph in users:
                await conn.execute(
                    text("INSERT INTO users (id, tenant_id, username, full_name, role_id,"
                         " password_hash) VALUES (:id, :t, :u, :fn, :r, :ph)"),
                    {"id": uid, "t": tid, "u": un, "fn": fn, "r": roles[role], "ph": ph})
            await conn.execute(
                text("INSERT INTO uoms (id, tenant_id, code, name)"
                     " VALUES (:id, :t, 'KG', 'Kilogram')"),
                {"id": uom, "t": tid})
            await conn.execute(
                text("INSERT INTO product_categories (id, tenant_id, code, name)"
                     " VALUES (:id, :t, 'SCRAP', 'Scrap')"),
                {"id": cat, "t": tid})
            await conn.execute(
                text("INSERT INTO products (id, tenant_id, category_id, uom_id, code,"
                     " name, is_active) VALUES (:id, :t, :c, :u, 'FE-STEEL', 'เหล็ก', true)"),
                {"id": product_id, "t": tid, "c": cat, "u": uom})

    await seed(ctx.main, f"GT MAIN {RUN}",
               [(ctx.admin_id, "admin", "Main Admin", "admin", admin_hash),
                (ctx.staff_id, "staff", "Main Staff", "staff", staff_hash)],
               ctx.uom["main"], ctx.cat["main"], ctx.main_product)
    await seed(ctx.one, f"GT ONE {RUN}",
               [(ctx.one_admin_id, "admin", "One Admin", "admin", one_hash)],
               ctx.uom["one"], ctx.cat["one"], ctx.one_product)
    await seed(ctx.other, f"GT OTHER {RUN}",
               [(ctx.other_admin_id, "admin", "Other Admin", "admin", other_hash)],
               ctx.uom["other"], ctx.cat["other"], ctx.other_product)


async def pg_tiers(tid: uuid.UUID) -> list[dict]:
    """The tenant's grade_tiers, read straight from Postgres (the DONE WHEN's
    SOURCE), ordered by the shop's sort_order."""
    from sqlalchemy import text
    from app.db import tenant_connection
    async with tenant_connection(tid) as conn:
        rows = (await conn.execute(
            text("SELECT code, name, sort_order, is_active FROM grade_tiers"
                 " ORDER BY sort_order, code"))).mappings().all()
    return [dict(r) for r in rows]


async def pg_seller_grade(tid: uuid.UUID, seller_id: str) -> str | None:
    from sqlalchemy import text
    from app.db import tenant_connection
    async with tenant_connection(tid) as conn:
        return (await conn.execute(
            text("SELECT grade FROM sellers WHERE id = :i"),
            {"i": seller_id})).scalar_one()


async def pg_bill_line(tid: uuid.UUID, bill_id: str) -> dict:
    from sqlalchemy import text
    from app.db import tenant_connection
    async with tenant_connection(tid) as conn:
        return dict((await conn.execute(
            text("SELECT unit_price::text AS unit_price, list_price::text AS list_price,"
                 " net_weight::text AS net_weight FROM purchase_bill_items"
                 " WHERE bill_id = :b ORDER BY line_no LIMIT 1"),
            {"b": bill_id})).mappings().one())


async def make_bill(client, token, seller_id, product_id, net, unit) -> str:
    bid = uuid.uuid4()
    r = await client.post("/bills", headers=auth(token), json={
        "id": str(bid),
        "seller_id": str(seller_id),
        "vehicle_no": f"GT-{RUN[:4]}",
        "device_created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "idempotency_key": f"gt-{RUN}-{bid.hex[:8]}",
        "items": [{
            "id": str(uuid.uuid4()), "product_id": str(product_id), "line_no": 1,
            "gross_weight": net, "tare_weight": "0.000", "net_weight": net,
            "unit_price": unit,
        }],
    })
    if r.status_code != 201:
        raise RuntimeError(f"POST /bills -> {r.status_code}: {r.text[:300]}")
    return str(bid)


# ---------------------------------------------------------------------------
async def run(ctx: Ctx, client, admin, staff, one_admin, other_admin) -> None:
    # =====================================================================
    header("A -- a shop configures a NON-DEFAULT set: 12 Thai-named tiers, its own order")
    for i, (code, name) in enumerate(MAIN_TIERS):
        r = await client.post("/grade-tiers", headers=auth(admin),
                              json={"code": code, "name": name, "sort_order": 12 - i})
        if r.status_code != 201:
            raise RuntimeError(f"POST /grade-tiers {code} -> {r.status_code}: {r.text[:200]}")
    tiers = await pg_tiers(ctx.main)
    print(f"      read back from Postgres: {len(tiers)} tiers")
    check(len(tiers) == 12, f"A: TWELVE tiers exist -- no product ceiling, F1 (got {len(tiers)})")
    # the shop's order is the REVERSE of insertion (sort_order 12..1), so ordered
    # by sort_order the codes run T12..T01.
    got_codes = [t["code"] for t in tiers]
    exp_codes = [c for c, _ in reversed(MAIN_TIERS)]
    print(f"      order got={got_codes[:4]}...  exp={exp_codes[:4]}...")
    check(got_codes == exp_codes, "A: the tiers read back in the SHOP's order (sort_order), not insertion/alpha")
    names = {t["code"]: t["name"] for t in tiers}
    check(all(names[c] == n for c, n in MAIN_TIERS),
          "A: every tier's Thai name is stored byte-for-byte (python-str equality, no console)")

    # =====================================================================
    header("B -- a price on one tier, and a seller created AGAINST that tier")
    rp = await client.put(f"/products/{ctx.main_product}/prices/{PRICE_TIER}",
                          headers=auth(admin), json={"price": "44.00"})
    check(rp.status_code == 200, f"B: PUT price for tier {PRICE_TIER} -> 200 (got {rp.status_code})")
    rs = await client.post("/sellers", headers=auth(admin),
                          json={"name": f"ผู้ขาย {RUN}", "grade": PRICE_TIER})
    check(rs.status_code == 201, f"B: POST seller grade={PRICE_TIER} -> 201 (got {rs.status_code})")
    seller_id = rs.json()["id"]
    pg_grade = await pg_seller_grade(ctx.main, seller_id)
    print(f"      seller grade in Postgres = {pg_grade!r}")
    check(pg_grade == PRICE_TIER, f"B: the seller sits in tier {PRICE_TIER}, read back from Postgres")

    # =====================================================================
    header("C -- a bill priced from that tier, unit_price read back byte-for-byte")
    bill_id = await make_bill(client, admin, seller_id, ctx.main_product, "10.000", "44.00")
    line = await pg_bill_line(ctx.main, bill_id)
    print(f"      line from purchase_bill_items: {line}")
    check(line["unit_price"] == "44.00" and line["list_price"] == "44.00",
          "C: unit_price AND list_price are '44.00' (the tier's price), byte-for-byte from Postgres")
    check(line["net_weight"] == "10.000", "C: net_weight is '10.000' from Postgres")

    # =====================================================================
    header("D -- a ONE-TIER shop (F2): a walk-in with NO grade, NO office round trip")
    r1 = await client.post("/grade-tiers", headers=auth(one_admin),
                          json={"code": ONE_TIER_CODE, "name": ONE_TIER_NAME})
    check(r1.status_code == 201, f"D: the one shop declares ONE tier -> 201 (got {r1.status_code})")
    await client.put(f"/products/{ctx.one_product}/prices/{ONE_TIER_CODE}",
                    headers=auth(one_admin), json={"price": "12.50"})
    # a seller with NO grade -- F2 seats it in the sole tier.
    rs1 = await client.post("/sellers", headers=auth(one_admin), json={"name": f"เดินเข้า {RUN}"})
    check(rs1.status_code == 201, f"D: POST seller with NO grade -> 201 (got {rs1.status_code})")
    one_seller = rs1.json()["id"]
    seated = await pg_seller_grade(ctx.one, one_seller)
    print(f"      one-tier seller grade in Postgres = {seated!r} (F2 seated it)")
    check(seated == ONE_TIER_CODE, f"D: F2 seated the seller in the sole tier {ONE_TIER_CODE!r} -- not NULL")
    # the walk-in bill goes straight through: no 424, no office round trip.
    rb = await client.post("/bills", headers=auth(one_admin), json={
        "id": str(uuid.uuid4()), "seller_id": one_seller, "vehicle_no": "WALK",
        "device_created_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "idempotency_key": f"gt-{RUN}-walkin",
        "items": [{"id": str(uuid.uuid4()), "product_id": str(ctx.one_product), "line_no": 1,
                   "gross_weight": "5.000", "tare_weight": "0.000", "net_weight": "5.000",
                   "unit_price": "12.50"}]})
    print(f"      walk-in bill status={rb.status_code}")
    check(rb.status_code == 201, f"D: the walk-in bill posts with NO office round trip -> 201 (got {rb.status_code})")

    # =====================================================================
    header("E -- deactivating a tier with sellers in it REFUSES and names the count (disproof a)")
    tier_id = next(t for t in (await client_tiers(client, admin)) if t["code"] == PRICE_TIER)["id"]
    rd = await client.patch(f"/grade-tiers/{tier_id}", headers=auth(admin),
                           json={"is_active": False})
    d = rd.json().get("detail", {})
    code = d.get("code") if isinstance(d, dict) else None
    cnt = d.get("sellers_in_tier") if isinstance(d, dict) else None
    print(f"      status={rd.status_code} code={code!r} sellers_in_tier={cnt!r}")
    check(rd.status_code == 409, f"E: deactivation with a seller present -> 409 (got {rd.status_code})")
    check(code == "grade_tier_in_use", f"E: refusal pinned to code grade_tier_in_use (got {code!r})")
    check(cnt == "1", f"E: the refusal NAMES the count (1 seller) (got {cnt!r})")

    # =====================================================================
    header("F -- move the seller, THEN deactivate the now-empty tier -> 200")
    rm = await client.patch(f"/sellers/{seller_id}", headers=auth(admin),
                           json={"grade": MOVE_TIER})
    check(rm.status_code == 200, f"F: move the seller to {MOVE_TIER} -> 200 (got {rm.status_code})")
    rd2 = await client.patch(f"/grade-tiers/{tier_id}", headers=auth(admin),
                            json={"is_active": False})
    print(f"      deactivate-after-move status={rd2.status_code}")
    check(rd2.status_code == 200, f"F: the now-empty tier deactivates -> 200 (got {rd2.status_code})")
    check(rd2.json().get("is_active") is False, "F: the tier reads back is_active=false")

    # =====================================================================
    header("G -- a deactivated tier still resolves: history intact, include_inactive finds it (F4)")
    # the bill priced against T05 while it was active still reads its price back.
    line2 = await pg_bill_line(ctx.main, bill_id)
    check(line2["unit_price"] == "44.00",
          "G: the historical bill still carries '44.00' after the tier was deactivated (hard rule 6)")
    active_list = await client_tiers(client, admin)
    check(all(t["code"] != PRICE_TIER for t in active_list),
          f"G: GET /grade-tiers no longer offers the deactivated {PRICE_TIER} (default list)")
    all_list = await client_tiers(client, admin, include_inactive=True)
    check(any(t["code"] == PRICE_TIER and t["is_active"] is False for t in all_list),
          f"G: include_inactive=true resolves {PRICE_TIER} again, marked inactive")

    # =====================================================================
    header("H -- another shop's code is a 422 here (RLS + _validate_grade; disproof b stays green)")
    rh = await client.post("/sellers", headers=auth(one_admin),
                          json={"name": f"ต่างร้าน {RUN}", "grade": PRICE_TIER})
    dh = rh.json().get("detail", {})
    codeh = dh.get("code") if isinstance(dh, dict) else None
    print(f"      one-shop seller with MAIN's tier code: status={rh.status_code} code={codeh!r}")
    check(rh.status_code == 422 and codeh == "grade_not_a_tier",
          "H: MAIN's tier code is NOT a tier in the one-tier shop -> 422 grade_not_a_tier "
          "(RLS scopes grade_tiers; the FK is the structural backstop, not what fires here)")

    # =====================================================================
    header("I -- GET /grade-tiers is RLS-scoped: each shop sees only its own")
    main_codes = {t["code"] for t in await client_tiers(client, admin, include_inactive=True)}
    one_codes = {t["code"] for t in await client_tiers(client, one_admin, include_inactive=True)}
    print(f"      MAIN sees {len(main_codes)} codes; ONE sees {sorted(one_codes)}")
    check(ONE_TIER_CODE in one_codes and ONE_TIER_CODE not in main_codes,
          "I: the one-tier shop's code is visible to it and INVISIBLE to MAIN (RLS)")
    check(PRICE_TIER in main_codes and PRICE_TIER not in one_codes,
          "I (control): MAIN's tier is visible to MAIN and invisible to the one shop -- not vacuous")

    # =====================================================================
    header("J -- staff may READ tiers (200) but not WRITE one (403 with its code)")
    rgs = await client.get("/grade-tiers", headers=auth(staff))
    check(rgs.status_code == 200, f"J: staff GET /grade-tiers -> 200 (got {rgs.status_code})")
    rps = await client.post("/grade-tiers", headers=auth(staff),
                           json={"code": "X99", "name": "ห้าม"})
    djs = rps.json().get("detail", {})
    codej = djs.get("code") if isinstance(djs, dict) else None
    print(f"      staff POST status={rps.status_code} code={codej!r}")
    check(rps.status_code == 403, f"J: staff POST /grade-tiers -> 403 (got {rps.status_code})")
    check(codej == "permission_required",
          f"J: the 403 is pinned to permission_required (got {codej!r})")
    check(isinstance(djs, dict) and djs.get("required_permission") == "tiers.manage",
          "J: and it names tiers.manage as the permission the route needs")

    # =====================================================================
    header("K -- PATCH /shop default_grade is validated against the tiers (disproof c)")
    rk = await client.patch("/shop", headers=auth(admin), json={"default_grade": "NOPE"})
    # Defensive parse: under disproof (c) the readable 422 is gone and the FK's
    # 500 returns a non-JSON/empty body -- cell K must then redden cleanly, not
    # crash on json().
    try:
        dk = rk.json().get("detail", {})
    except Exception:  # noqa: BLE001
        dk = {}
    codek = dk.get("code") if isinstance(dk, dict) else None
    print(f"      PATCH /shop default_grade=NOPE: status={rk.status_code} code={codek!r}")
    check(rk.status_code == 422 and codek == "grade_not_a_tier",
          "K: a foreign default_grade is a READABLE 422, not the FK's 500 (disproof c reddens this)")
    # and a REAL tier is accepted.
    rk2 = await client.patch("/shop", headers=auth(admin), json={"default_grade": MOVE_TIER})
    check(rk2.status_code == 200 and rk2.json().get("default_grade") == MOVE_TIER,
          f"K (control): a real tier {MOVE_TIER} IS accepted as the default -> 200")

    # =====================================================================
    header("L -- F1 (commit 3): a shop cannot deactivate its LAST active tier (disproof e)")
    # OTHER has no tiers; give it two, NO sellers, a clean F1 test the in-use check
    # never touches. The guard is the server's -- the phone's mayDeactivate is a
    # courtesy, and this is the route curl reaches directly.
    await client.post("/grade-tiers", headers=auth(other_admin), json={"code": "F1A", "name": "เกรดหนึ่ง"})
    await client.post("/grade-tiers", headers=auth(other_admin), json={"code": "F1B", "name": "เกรดสอง"})
    ol = {t["code"]: t["id"] for t in await client_tiers(client, other_admin, include_inactive=True)}
    # with TWO active, deactivating one succeeds (the guard passes, in_use passes).
    rl1 = await client.patch(f"/grade-tiers/{ol['F1B']}", headers=auth(other_admin), json={"is_active": False})
    check(rl1.status_code == 200, f"L: with two active tiers, deactivating one -> 200 (got {rl1.status_code})")
    # now F1A is the LAST active -- deactivating it is refused with its own code, and
    # the refusal NAMES the operand (active_tiers=1).
    rl2 = await client.patch(f"/grade-tiers/{ol['F1A']}", headers=auth(other_admin), json={"is_active": False})
    dl = rl2.json().get("detail", {})
    codel = dl.get("code") if isinstance(dl, dict) else None
    activel = dl.get("active_tiers") if isinstance(dl, dict) else None
    print(f"      deactivate-the-last: status={rl2.status_code} code={codel!r} active_tiers={activel!r}")
    check(rl2.status_code == 409, f"L: deactivating the LAST active tier -> 409 (got {rl2.status_code})")
    check(codel == "grade_tier_last_active", f"L: refusal pinned to grade_tier_last_active (got {codel!r})")
    check(activel == "1", f"L: the refusal NAMES the operand (active_tiers=1) (got {activel!r})")
    # reactivating the second restores the ability: two active again, F1A deactivates.
    rl3 = await client.patch(f"/grade-tiers/{ol['F1B']}", headers=auth(other_admin), json={"is_active": True})
    check(rl3.status_code == 200, f"L: reactivate the second tier -> 200 (got {rl3.status_code})")
    rl4 = await client.patch(f"/grade-tiers/{ol['F1A']}", headers=auth(other_admin), json={"is_active": False})
    check(rl4.status_code == 200, f"L: with the ability restored, the not-last tier deactivates -> 200 (got {rl4.status_code})")

    # =====================================================================
    header("M -- PUT /grade-tiers/order rewrites the whole ordering in ONE write (commit 3, disproof f)")
    # OTHER now holds F1A (inactive) and F1B (active). The order covers EVERY tier.
    oa = {t["code"]: t["id"] for t in await client_tiers(client, other_admin, include_inactive=True)}
    rm = await client.put("/grade-tiers/order", headers=auth(other_admin),
                          json={"order": [oa["F1A"], oa["F1B"]]})
    check(rm.status_code == 200, f"M: PUT /grade-tiers/order -> 200 (got {rm.status_code})")
    pg = await pg_tiers(ctx.other)
    print(f"      order read back from Postgres: {[t['code'] for t in pg]}")
    check([t["code"] for t in pg] == ["F1A", "F1B"],
          "M: the shop's order is read back from Postgres in the PUT's order")
    # reverse it -- the other direction, so the cell is not vacuous.
    rm2 = await client.put("/grade-tiers/order", headers=auth(other_admin),
                           json={"order": [oa["F1B"], oa["F1A"]]})
    check(rm2.status_code == 200, f"M: reorder the other way -> 200 (got {rm2.status_code})")
    pg2 = await pg_tiers(ctx.other)
    print(f"      reversed read back: {[t['code'] for t in pg2]}")
    check([t["code"] for t in pg2] == ["F1B", "F1A"],
          "M (control): reversing the order reverses the read-back -- not vacuous")
    # a PARTIAL order (a tier missing) is refused: an ordering must cover the set.
    rp1 = await client.put("/grade-tiers/order", headers=auth(other_admin),
                           json={"order": [oa["F1A"]]})
    dp1 = rp1.json().get("detail", {})
    codep1 = dp1.get("code") if isinstance(dp1, dict) else None
    print(f"      partial order: status={rp1.status_code} code={codep1!r}")
    check(rp1.status_code == 422 and codep1 == "grade_tier_order_invalid",
          "M: a PARTIAL order (a tier missing) is a 422 grade_tier_order_invalid")
    # a FOREIGN id in the order is refused.
    rp2 = await client.put("/grade-tiers/order", headers=auth(other_admin),
                           json={"order": [oa["F1A"], oa["F1B"], str(uuid.uuid4())]})
    dp2 = rp2.json().get("detail", {})
    codep2 = dp2.get("code") if isinstance(dp2, dict) else None
    print(f"      foreign id: status={rp2.status_code} code={codep2!r}")
    check(rp2.status_code == 422 and codep2 == "grade_tier_order_invalid",
          "M: a FOREIGN tier id in the order is a 422 grade_tier_order_invalid")
    # the refused writes did not half-apply: the order is still the last GOOD one.
    pg3 = await pg_tiers(ctx.other)
    check([t["code"] for t in pg3] == ["F1B", "F1A"],
          "M: after two refusals the order is UNCHANGED -- a rejected ordering wrote nothing")


async def client_tiers(client, token, include_inactive=False):
    params = {"include_inactive": "true"} if include_inactive else {}
    r = await client.get("/grade-tiers", headers=auth(token), params=params)
    r.raise_for_status()
    return r.json()["grade_tiers"]


async def main() -> int:
    global BASE
    ap = argparse.ArgumentParser(description="Prove the per-tenant grade model over real HTTP.")
    ap.add_argument("--database", default=None,
                    help=f"a SCRATCH database. Omit to self-restore {SCRATCH_DB!r} from a "
                         "live dump. Never the live database: this proof writes bills.")
    ap.add_argument("--skip-restore", action="store_true")
    args = ap.parse_args()

    app_live = make_url(os.environ["APP_DATABASE_URL"])
    dir_live = make_url(os.environ["DIRECTORY_DATABASE_URL"])
    live_name = app_live.database

    if args.database is not None and args.database == live_name:
        print(f"REFUSED: --database {args.database!r} is the LIVE database.")
        return 2
    scratch = args.database or SCRATCH_DB
    if scratch == live_name:
        print(f"REFUSED: the scratch name {scratch!r} equals the live database.")
        return 2

    if not args.skip_restore:
        print(f"  restoring scratch {scratch!r} from a live dump of {live_name!r}...")
        try:
            restore_scratch(live_name, scratch)
        except Exception as exc:  # noqa: BLE001
            print(f"REFUSED: could not restore the scratch: {exc}")
            return 2

    os.environ["APP_DATABASE_URL"] = app_live.set(
        database=scratch).render_as_string(hide_password=False)
    os.environ["DIRECTORY_DATABASE_URL"] = dir_live.set(
        database=scratch).render_as_string(hide_password=False)

    ctx = Ctx()
    port = free_port()
    BASE = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(
        mode="w", suffix=".log", prefix="prove_grade_tiers_", delete=False, encoding="utf-8")
    proc = subprocess.Popen(
        [sys.executable, "-u", "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=SERVER_DIR, env=dict(os.environ), stdout=log, stderr=subprocess.STDOUT)
    print(f"  child uvicorn pid={proc.pid} on {BASE} against scratch {scratch!r} (log {log.name})")

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
        check(True, "E0: /openapi.json declares GET+POST /grade-tiers and PATCH /grade-tiers/{tier_id}")

        try:
            await provision(ctx)
        except Exception as exc:  # noqa: BLE001
            print(f"UNFIT: provisioning failed: {exc!r}")
            return 2
        print(f"      provisioned MAIN={ctx.main} ONE={ctx.one} OTHER={ctx.other}")

        async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
            admin = await login(client, ctx.main, "admin", ADMIN_PW)
            staff = await login(client, ctx.main, "staff", STAFF_PW)
            one_admin = await login(client, ctx.one, "admin", ONE_PW)
            other_admin = await login(client, ctx.other, "admin", OTHER_PW)
            await run(ctx, client, admin, staff, one_admin, other_admin)

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
    print(f"PROVE_GRADE_TIERS_EXIT={rc}")
    sys.exit(rc)
