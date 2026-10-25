"""THE THREE M1 RULINGS (ADVISOR-DECIDED 2026-10-25), over real HTTP on a scratch.

    uv run python scripts/prove_rulings.py

Restores a SCRATCH from a live dump (upgraded to head on the scratch if the live database is behind),
starts a child uvicorn, provisions ONE throwaway shop by SQL (owner, admin, staff), builds its master
data as the owner through the API. Every expected value is fixed from this proof's inputs before the
write and read back from Postgres as the superuser (buddhist-method: what Postgres stored).

R1 -- separate_cashier, shifts_enabled and the accepted payment methods are the OWNER's
  R1a  the catalogue classes all three as `payment` (owner-only), and every other kind is unchanged.
  R1b  admin -> PATCH /branches separate_cashier: 403 money_rule_owner_only; the branch row and the
       branches audit count unchanged.
  R1c  admin -> PATCH /branches shifts_enabled: 403, row unchanged.
  R1d  admin -> PUT payment-methods promptpay on (a method the branch was not born with) and transfer off
       (a born one, 0023): each 403; the branch's method set unchanged.
  R1e  staff -> the same PUT: 403 permission_required (the gate above the owner check still stands).
  R1f  owner -> the two switches and both method writes: 200; the rows hold the values; audit_log holds a
       branches UPDATE, a branch_payment_methods INSERT (promptpay) and UPDATE (transfer), each by the owner.
  R1g  CONTROL: admin -> PATCH /shop address (operational) is still 200.
R2 -- a product priced by count needs a counting unit
  R2a  POST /uoms with kind count / weight / absent stores count / weight / NULL; GET /uoms reads them.
  R2b  owner -> POST /products piece on the weight unit: 422 unit_not_counting; on the undeclared unit:
       422; nothing created. CONTROL: piece on the count unit 201, weight on the weight unit 201.
  R2c  PATCH a weight product to piece on its weight unit: 422, row unchanged; PATCH a piece product's
       unit to the weight unit: 422, row unchanged.
  R2d  an EXISTING mismatch (written by SQL, as pre-R2 data is): GET /products/unit-mismatches lists
       EXACTLY the mismatched products (set equality), and every products row is value-equal after.
  R2e  PATCH /uoms kind=weight on a unit a piece product sits on: 409 uom_kind_in_use, kind unchanged.
  R2f  an edit of the NAME of an existing mismatched product is 200 (the list names it; it is not trapped).
R3 -- a line whose declared rule the shop did not have in force is accepted and FLAGGED
  R3a  shop rounding half_up_0.01, then the owner moves it to down_1 at T. A line weighed BEFORE T
       declaring down_1 -> 201, its amount is the down_1 amount, and ONE off_rule flag holds
       keys {rounding_rule}, declared down_1, effective half_up_0.01.
  R3b  a line weighed before T declaring half_up_0.01 (what was in force) -> 201, NO flag.
  R3c  a line weighed after T declaring down_1 -> no flag; declaring half_up_0.01 -> flagged.
  R3d  a kg deduction while the shop's mode is none -> flagged deduction_mode; the same deduction on a
       product whose own mode is `both` -> no flag.
  R3e  a piece-priced line on a weight-priced product -> flagged pricing_basis.
  R3f  owner_flags is append-only for the app role: UPDATE and DELETE are refused (privilege).
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import timedelta
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from lane import scratch_name  # noqa: E402
from prove_money_rules import Db, Shop, auth, code_of, free_port, provision, restore_scratch  # noqa: E402

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH_DB = scratch_name("recycle_rulings_scratch")
RUN = uuid.uuid4().hex[:8]

failures: list[str] = []
passes: list[str] = []


def check(cond: bool, claim: str) -> None:
    print(f"  [{'OK  ' if cond else 'RED '}] {claim}")
    (passes if cond else failures).append(claim)


def header(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


async def call(c: httpx.AsyncClient, shop: Shop, method: str, path: str, body: Any = None, who: str = "owner") -> dict:
    r = await c.request(method, path, headers=auth(shop.tok[who]), json=body)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"fixture: {method} {path} -> {r.status_code} {r.text[:300]}")
    return r.json()


async def build(c: httpx.AsyncClient, shop: Shop) -> None:
    s = shop.ids
    s["branch"] = (await call(c, shop, "GET", "/shop"))["branch"]["id"]
    await call(c, shop, "POST", "/grade-tiers", {"code": "A", "name": "เกรด A"})
    s["kg"] = (await call(c, shop, "POST", "/uoms", {"code": "KG", "name": "กก.", "kind": "weight"}))["id"]
    s["pc"] = (await call(c, shop, "POST", "/uoms", {"code": "PC", "name": "ชิ้น", "kind": "count"}))["id"]
    s["und"] = (await call(c, shop, "POST", "/uoms", {"code": "UND", "name": "ไม่ระบุ"}))["id"]
    s["cat"] = (await call(c, shop, "POST", "/product-categories", {"code": "FE", "name": "เหล็ก"}))["id"]

    async def product(code: str, uom: str, price: str, **rules: str) -> str:
        pid = (await call(c, shop, "POST", "/products", {"code": code, "name": f"สินค้า {code}", "category_id": s["cat"],
                                                          "uom_id": s[uom], **rules}))["id"]
        await call(c, shop, "PUT", f"/products/{pid}/prices/A", {"price": price})
        return pid

    s["w"] = await product("W1", "kg", "15.00")
    s["both"] = await product("WB", "kg", "10.00", deduction_mode="both")
    s["p"] = await product("P1", "pc", "40.00", pricing_basis="piece")
    s["seller"] = (await call(c, shop, "POST", "/sellers", {"name": f"ผู้ขาย {RUN}", "grade": "A"}))["id"]


# ---------------------------------------------------------------------------
async def r1(c: httpx.AsyncClient, db: Db, shop: Shop) -> None:
    header("R1  who pays and how: the owner's")
    from app.policy import MONEY_KEYS, SETTINGS
    kinds = {(s.table, s.column): s.kind for s in SETTINGS}
    want = {("branches", "separate_cashier"), ("branches", "shifts_enabled"), ("branch_payment_methods", "is_active")}
    check(all(kinds.get(k) == "payment" for k in want)
          and want <= {(t, col) for t, cols in MONEY_KEYS.items() for col in cols}
          and kinds.get(("tenants", "rounding_rule")) == "money" and kinds.get(("tenants", "address")) == "operational",
          f"R1a catalogue: {sorted((t, col, kinds.get((t, col))) for t, col in want)}; rounding money, address operational")

    b = uuid.UUID(shop.ids["branch"])
    branch_row = "SELECT row_to_json(x)::text FROM branches x WHERE id = $1"
    audits = ("SELECT count(*) FROM audit_log WHERE tenant_id = $1 AND table_name = $2")
    row0 = await db.fetchval(branch_row, b)
    a0 = int(await db.fetchval(audits, shop.id, "branches"))
    adm = auth(shop.tok["admin"])
    r = await c.patch(f"/branches/{b}", headers=adm, json={"separate_cashier": True})
    check(r.status_code == 403 and code_of(r) == "money_rule_owner_only" and await db.fetchval(branch_row, b) == row0
          and int(await db.fetchval(audits, shop.id, "branches")) == a0,
          f"R1b admin -> separate_cashier: {r.status_code} {code_of(r)}; branch row and audit unchanged")
    r = await c.patch(f"/branches/{b}", headers=adm, json={"shifts_enabled": True})
    check(r.status_code == 403 and code_of(r) == "money_rule_owner_only" and await db.fetchval(branch_row, b) == row0,
          f"R1c admin -> shifts_enabled: {r.status_code} {code_of(r)}")
    # A branch is born with ACTIVE cash and transfer rows (migration 0023's trigger), so the cell turns a
    # method ON that the branch was not born with (promptpay: an INSERT) and turns a born one OFF
    # (transfer: an UPDATE) -- both shapes of the one writer -- and compares the branch's whole method set.
    methods = ("SELECT string_agg(method || '=' || is_active::text, ',' ORDER BY method)"
               " FROM branch_payment_methods WHERE branch_id = $1")
    m0 = await db.fetchval(methods, b)
    ra = await c.put(f"/branches/{b}/payment-methods/promptpay", headers=adm, json={"is_active": True})
    rb = await c.put(f"/branches/{b}/payment-methods/transfer", headers=adm, json={"is_active": False})
    m1 = await db.fetchval(methods, b)
    check(all(x.status_code == 403 and code_of(x) == "money_rule_owner_only" for x in (ra, rb)) and m1 == m0
          and m0 == "cash=true,transfer=true",
          f"R1d admin -> promptpay on {ra.status_code} {code_of(ra)}, transfer off {rb.status_code} {code_of(rb)};"
          f" methods {m0} -> {m1}")
    r = await c.put(f"/branches/{b}/payment-methods/promptpay", headers=auth(shop.tok["staff"]), json={"is_active": True})
    check(r.status_code == 403 and code_of(r) == "permission_required",
          f"R1e staff -> payment method: {r.status_code} {code_of(r)}")

    own = auth(shop.tok["owner"])
    r1_ = await c.patch(f"/branches/{b}", headers=own, json={"separate_cashier": True, "shifts_enabled": True})
    r2_ = await c.put(f"/branches/{b}/payment-methods/promptpay", headers=own, json={"is_active": True})
    r3_ = await c.put(f"/branches/{b}/payment-methods/transfer", headers=own, json={"is_active": False})
    row = await db.fetchrow("SELECT separate_cashier, shifts_enabled FROM branches WHERE id = $1", b)
    m2 = await db.fetchval(methods, b)
    au_b = await db.fetch("SELECT actor_user_id FROM audit_log WHERE tenant_id = $1 AND table_name = 'branches'"
                          " AND action = 'UPDATE' AND new_data->>'separate_cashier' = 'true'"
                          " AND new_data->>'shifts_enabled' = 'true'", shop.id)
    au_m = await db.fetch("SELECT action, new_data->>'method' AS m, actor_user_id FROM audit_log WHERE tenant_id = $1"
                          " AND table_name = 'branch_payment_methods' AND actor_user_id = $2 ORDER BY created_at, id",
                          shop.id, shop.uid["owner"])
    check(r1_.status_code == 200 and r2_.status_code == 200 and r3_.status_code == 200 and tuple(row) == (True, True)
          and m2 == "cash=true,promptpay=true,transfer=false" and [x[0] for x in au_b] == [shop.uid["owner"]]
          and [(x["action"], x["m"]) for x in au_m] == [("INSERT", "promptpay"), ("UPDATE", "transfer")],
          f"R1f owner -> both switches {r1_.status_code}, promptpay on {r2_.status_code}, transfer off {r3_.status_code};"
          f" row {tuple(row)}; methods {m2}; audit by the owner: branches {len(au_b)},"
          f" methods {[(x['action'], x['m']) for x in au_m]}")
    await c.put(f"/branches/{b}/payment-methods/transfer", headers=own, json={"is_active": True})
    # put the counter back: the R3 bills below are paid at the weighbridge
    await c.patch(f"/branches/{b}", headers=own, json={"separate_cashier": False, "shifts_enabled": False})
    r = await c.patch("/shop", headers=adm, json={"address": f"ถนน {RUN}"})
    check(r.status_code == 200, f"R1g CONTROL admin -> PATCH /shop address (operational): {r.status_code}")


async def r2(c: httpx.AsyncClient, db: Db, shop: Shop) -> None:
    header("R2  a product priced by count needs a counting unit")
    s, o = shop.ids, auth(shop.tok["owner"])
    kinds = {r["code"]: r.get("kind") for r in (await c.get("/uoms", headers=o)).json()["uoms"]}
    stored = {r["code"]: r["kind"] for r in await db.fetch("SELECT code, kind FROM uoms WHERE tenant_id = $1", shop.id)}
    check(kinds == stored == {"KG": "weight", "PC": "count", "UND": None},
          f"R2a units stored and read: {stored} / GET {kinds}")

    n0 = int(await db.fetchval("SELECT count(*) FROM products WHERE tenant_id = $1", shop.id))

    async def create(code: str, uom: str, basis: str) -> httpx.Response:
        return await c.post("/products", headers=o, json={"code": code, "name": code, "category_id": s["cat"],
                                                          "uom_id": s[uom], "pricing_basis": basis})
    bad1 = await create("BAD1", "kg", "piece")
    bad2 = await create("BAD2", "und", "lump")
    n1 = int(await db.fetchval("SELECT count(*) FROM products WHERE tenant_id = $1", shop.id))
    ok1 = await create("OK1", "pc", "lump")
    ok2 = await create("OK2", "kg", "weight")
    check(bad1.status_code == 422 and code_of(bad1) == "unit_not_counting" and bad2.status_code == 422
          and code_of(bad2) == "unit_not_counting" and n1 == n0 and ok1.status_code == 201 and ok2.status_code == 201,
          f"R2b piece on weight {bad1.status_code} {code_of(bad1)}, lump on undeclared {bad2.status_code}"
          f" {code_of(bad2)}, nothing created ({n0}->{n1}); CONTROL lump on count {ok1.status_code},"
          f" weight on weight {ok2.status_code}")

    prow = "SELECT row_to_json(x)::text FROM products x WHERE id = $1"
    w0, p0 = await db.fetchval(prow, uuid.UUID(s["w"])), await db.fetchval(prow, uuid.UUID(s["p"]))
    e1 = await c.patch(f"/products/{s['w']}", headers=o, json={"pricing_basis": "piece"})
    e2 = await c.patch(f"/products/{s['p']}", headers=o, json={"uom_id": s["kg"]})
    check(e1.status_code == 422 and code_of(e1) == "unit_not_counting" and e2.status_code == 422
          and code_of(e2) == "unit_not_counting" and await db.fetchval(prow, uuid.UUID(s["w"])) == w0
          and await db.fetchval(prow, uuid.UUID(s["p"])) == p0,
          f"R2c edit to a mismatch: basis {e1.status_code} {code_of(e1)}, unit {e2.status_code} {code_of(e2)}; rows unchanged")

    # An existing mismatch, written the way pre-R2 data was: by SQL, beneath the route.
    from app.db import SYSTEM_ACTOR_ID
    con = await db.su()
    try:
        mm = {}
        async with con.transaction():
            # products is audited: the trigger refuses a write with no actor (0017), as it should.
            # ...and its SECURITY DEFINER writer is held to audit_log's tenant policy, so the tenant rides too.
            await con.execute("SELECT set_config('app.actor_id', $1, true), set_config('app.actor_username', $2, true),"
                              " set_config('app.tenant_id', $3, true)",
                              str(SYSTEM_ACTOR_ID), "system:prove_rulings", str(shop.id))
            for code, uom, basis in (("OLD-PC-KG", "kg", "piece"), ("OLD-LUMP-UND", "und", "lump")):
                pid = uuid.uuid4()
                await con.execute("INSERT INTO products (id, tenant_id, category_id, uom_id, code, name, pricing_basis)"
                                  " VALUES ($1, $2, $3, $4, $5, $5, $6)", pid, shop.id, uuid.UUID(s["cat"]),
                                  uuid.UUID(s[uom]), code, basis)
                mm[code] = str(pid)
    finally:
        await con.close()
    all_rows = "SELECT string_agg(row_to_json(x)::text, '|' ORDER BY id) FROM products x WHERE tenant_id = $1"
    before = await db.fetchval(all_rows, shop.id)
    lst = await c.get("/products/unit-mismatches", headers=o)
    got = {p["code"]: p["id"] for p in lst.json().get("products", [])} if lst.status_code == 200 else {}
    check(lst.status_code == 200 and got == mm and await db.fetchval(all_rows, shop.id) == before,
          f"R2d the owner's list: {lst.status_code} {sorted(got)} == {sorted(mm)}; every products row value-equal")

    k0 = await db.fetchval("SELECT kind FROM uoms WHERE id = $1", uuid.UUID(s["pc"]))
    r = await c.patch(f"/uoms/{s['pc']}", headers=o, json={"kind": "weight"})
    k1 = await db.fetchval("SELECT kind FROM uoms WHERE id = $1", uuid.UUID(s["pc"]))
    check(r.status_code == 409 and code_of(r) == "uom_kind_in_use" and k0 == k1 == "count",
          f"R2e a counting unit with a piece product cannot become weight: {r.status_code} {code_of(r)}; kind {k1}")

    r = await c.patch(f"/products/{mm['OLD-PC-KG']}", headers=o, json={"name": f"เปลี่ยนชื่อ {RUN}"})
    check(r.status_code == 200, f"R2f renaming an existing mismatch is not trapped: {r.status_code}")


def line(product: str, gross: str, tare: str, price: str, **rules: Any) -> dict:
    return {"id": str(uuid.uuid4()), "product_id": product, "line_no": 1, "gross_weight": gross,
            "tare_weight": tare, "unit_price": price, **rules}


async def r3(c: httpx.AsyncClient, db: Db, shop: Shop) -> None:
    header("R3  a line off the rule in force is accepted and flagged")
    s, o = shop.ids, auth(shop.tok["owner"])

    async def post(item: dict, at: Any) -> tuple[httpx.Response, str]:
        body = {"id": str(uuid.uuid4()), "seller_id": s["seller"], "device_created_at": at.isoformat(),
                "idempotency_key": f"rl-{uuid.uuid4()}", "items": [item]}
        return await c.post("/bills", headers=o, json=body), item["id"]

    async def flags(item_id: str) -> list:
        return await db.fetch("SELECT off_rule_keys, declared_rounding_rule, effective_rounding_rule,"
                              " declared_deduction_mode, effective_deduction_mode, declared_pricing_basis,"
                              " effective_pricing_basis FROM owner_flags WHERE purchase_item_id = $1", uuid.UUID(item_id))

    before = await db.fetchval("SELECT now()") - timedelta(seconds=5)
    r = await c.patch("/shop", headers=o, json={"rounding_rule": "down_1"})
    assert r.status_code == 200, r.text
    await asyncio.sleep(1.1)
    after = await db.fetchval("SELECT now()")

    # 10.003 x 15.00 = 150.045: down_1 -> 150.00, half_up_0.01 -> 150.05 (worked by hand)
    ra, ia = await post(line(s["w"], "10.003", "0.000", "15.00", net_weight="10.003", rounding_rule="down_1"), before)
    fa = await flags(ia)
    amt = await db.fetchval("SELECT amount::text FROM purchase_bill_items WHERE id = $1", uuid.UUID(ia))
    check(ra.status_code == 201 and amt == "150.00" and len(fa) == 1 and list(fa[0]["off_rule_keys"]) == ["rounding_rule"]
          and (fa[0]["declared_rounding_rule"], fa[0]["effective_rounding_rule"]) == ("down_1", "half_up_0.01"),
          f"R3a down_1 weighed before the change: {ra.status_code}, amount {amt}, flags {[dict(x) for x in fa]}")
    rb, ib = await post(line(s["w"], "10.003", "0.000", "15.00", net_weight="10.003", rounding_rule="half_up_0.01"), before)
    check(rb.status_code == 201 and await flags(ib) == [],
          f"R3b half_up_0.01 weighed before the change (what was in force): {rb.status_code}, no flag")
    rc1, ic1 = await post(line(s["w"], "10.003", "0.000", "15.00", net_weight="10.003", rounding_rule="down_1"), after)
    rc2, ic2 = await post(line(s["w"], "10.003", "0.000", "15.00", net_weight="10.003", rounding_rule="half_up_0.01"), after)
    fc2 = await flags(ic2)
    check(rc1.status_code == 201 and await flags(ic1) == [] and rc2.status_code == 201 and len(fc2) == 1
          and fc2[0]["effective_rounding_rule"] == "down_1",
          f"R3c after the change: down_1 {rc1.status_code} no flag; half_up_0.01 {rc2.status_code} flagged {len(fc2)}")
    await c.patch("/shop", headers=o, json={"rounding_rule": "half_up_0.01"})
    await asyncio.sleep(1.1)
    now = await db.fetchval("SELECT now()")

    # 100.000 - 5.000 - 2.500 = 92.500 x 10.00 = 925.00
    rd1, id1 = await post(line(s["w"], "100.000", "5.000", "10.00", net_weight="92.500", deduction_mode="kg",
                               deduction_weight="2.500"), now)
    rd2, id2 = await post(line(s["both"], "100.000", "5.000", "10.00", net_weight="92.500", deduction_mode="kg",
                               deduction_weight="2.500"), now)
    fd1 = await flags(id1)
    check(rd1.status_code == 201 and len(fd1) == 1 and list(fd1[0]["off_rule_keys"]) == ["deduction_mode"]
          and fd1[0]["effective_deduction_mode"] == "none" and rd2.status_code == 201 and await flags(id2) == [],
          f"R3d kg deduction under shop mode none {rd1.status_code} flagged {[list(x['off_rule_keys']) for x in fd1]};"
          f" on a `both` product {rd2.status_code} no flag")
    re_, ie = await post(line(s["w"], "0.000", "0.000", "15.00", net_weight="0.000", pricing_basis="piece", quantity="2"), now)
    fe = await flags(ie)
    check(re_.status_code == 201 and len(fe) == 1 and list(fe[0]["off_rule_keys"]) == ["pricing_basis"]
          and (fe[0]["declared_pricing_basis"], fe[0]["effective_pricing_basis"]) == ("piece", "weight"),
          f"R3e piece line on a weight product: {re_.status_code}, flags {[dict(x) for x in fe]}")

    from sqlalchemy import text
    from sqlalchemy.exc import ProgrammingError, DBAPIError
    from app.db import tenant_connection
    outcomes = []
    for sql in ("UPDATE owner_flags SET off_rule_keys = ARRAY['rounding_rule']", "DELETE FROM owner_flags"):
        try:
            async with tenant_connection(shop.id) as conn:
                await conn.execute(text(sql))
            outcomes.append("ALLOWED")
        except (ProgrammingError, DBAPIError) as e:
            outcomes.append("refused" if "permission denied" in str(e) else f"other: {str(e)[:80]}")
    n = int(await db.fetchval("SELECT count(*) FROM owner_flags WHERE tenant_id = $1", shop.id))
    check(outcomes == ["refused", "refused"] and n == 4,
          f"R3f owner_flags append-only for recycle_app: update/delete {outcomes}; this shop's flags {n} (want 4)")


async def main() -> int:
    app_live = make_url(os.environ["APP_DATABASE_URL"])
    dir_live = make_url(os.environ["DIRECTORY_DATABASE_URL"])
    live_name = app_live.database
    if SCRATCH_DB == live_name:
        print(f"REFUSED: the scratch name {SCRATCH_DB!r} equals the live database.")
        return 2
    print(f"  restoring scratch {SCRATCH_DB!r} from a live dump of {live_name!r}...")
    try:
        restore_scratch(live_name, SCRATCH_DB)
    except Exception as exc:  # noqa: BLE001
        print(f"REFUSED: could not restore the scratch: {exc}")
        return 2
    os.environ["APP_DATABASE_URL"] = app_live.set(database=SCRATCH_DB).render_as_string(hide_password=False)
    os.environ["DIRECTORY_DATABASE_URL"] = dir_live.set(database=SCRATCH_DB).render_as_string(hide_password=False)
    db = Db(os.environ["APP_DATABASE_URL"], SCRATCH_DB)
    env = dict(os.environ)
    env["MIGRATION_DATABASE_URL"] = make_url(os.environ["MIGRATION_DATABASE_URL"]).set(
        database=SCRATCH_DB).render_as_string(hide_password=False)
    rev = await db.fetchval("SELECT version_num FROM alembic_version")
    # Upgrading THE SCRATCH (never live) to head is a no-op when live is already there.
    cp = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=SERVER_DIR, env=env,
                        capture_output=True, timeout=600)
    rev2 = await db.fetchval("SELECT version_num FROM alembic_version")
    print(f"  live at {rev}; the scratch at {rev2} (alembic exit {cp.returncode})")
    if cp.returncode != 0 or rev2 is None or rev2 < "0028":
        print(f"UNFIT: {cp.stderr.decode('utf-8', 'replace')[-800:]}")
        return 2
    shop = Shop()
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(mode="w", suffix=".log", prefix="prove_rulings_", delete=False, encoding="utf-8")
    proc = subprocess.Popen([sys.executable, "-u", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
                             "--port", str(port), "--log-level", "warning"],
                            cwd=SERVER_DIR, env=dict(os.environ), stdout=log, stderr=subprocess.STDOUT)
    try:
        deadline, up = time.time() + 40, False
        while time.time() < deadline and proc.poll() is None and not up:
            try:
                up = httpx.get(f"{base}/health", timeout=2.0).status_code == 200
            except httpx.HTTPError:
                time.sleep(0.25)
        check(up, "E0 the child server answers /health")
        if not up:
            return 1
        await provision(shop)
        async with httpx.AsyncClient(base_url=base, timeout=60.0) as c:
            for who in shop.uid:
                r = await c.post("/auth/login", json={"tenant_id": str(shop.id), "username": shop.names[who],
                                                     "password": shop.pw[who]})
                shop.tok[who] = r.json().get("access_token", "") if r.status_code == 200 else ""
            check(all(shop.tok.values()), "E0 owner, admin and staff sign in")
            try:
                await build(c, shop)
            except Exception as exc:  # noqa: BLE001
                print(f"UNFIT: {exc}")
                return 2
            await r1(c, db, shop)
            await r2(c, db, shop)
            await r3(c, db, shop)
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                proc.kill()
        log.close()
        tail = open(log.name, encoding="utf-8", errors="replace").read()[-2000:]
        if failures and tail.strip():
            print("\n--- server log tail ---\n" + tail)
        try:
            os.unlink(log.name)
        except OSError:
            pass

    print("\n" + "=" * 72)
    print(f"  passes={len(passes)}  failures={len(failures)}")
    for f in failures:
        print(f"    RED: {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    rc = asyncio.run(main())
    print(f"PROVE_RULINGS_EXIT={rc}")
    sys.exit(rc)
