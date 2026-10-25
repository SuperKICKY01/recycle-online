"""M1 (ADVISOR-DECIDED 2026-10-24): THE SHOP'S MONEY RULES, over real HTTP on a scratch.

    uv run python scripts/prove_money_rules.py                  (self-restores a scratch from a live dump)
    uv run python scripts/prove_money_rules.py --break <name>   (DISPROOF: drop one CHECK on the scratch first)

A shop configures how deductions, rounding and pricing work (migration 0027); each line stores the rule
values it used; changing a setting never changes an existing bill; only the OWNER changes a money rule.
Model on prove_money_faults.py: restore a SCRATCH from a live dump, start a child uvicorn, provision ONE
throwaway shop by SQL (tenant, branch, the three system roles, an owner, an admin and a staff member),
build its master data through the API as the owner. Every figure a cell expects is FIXED FROM THIS
PROOF'S OWN INPUTS before the write (worked by hand -- never by calling app/money_rules), then read back
out of Postgres as the superuser and compared value against value (buddhist-method: what Postgres
stored, not what the route said).

THE CELLS
  C1  THE CATALOGUE: every column of tenants, branches and products is either a SETTING in
      app/policy.py or one of its IDENTITY_COLUMNS -- set equality against information_schema, so a
      column added without a declaration is a red.
  C2  GET /shop/policy before any change: half_up_0.01, deduction none, reason not required.
  O1  admin -> PATCH /shop rounding_rule: 403 money_rule_owner_only; tenants row unchanged; no audit row.
  O2  admin -> PATCH /shop default_grade: 403 (default_grade is a money rule since 2026-10-24).
  O3  admin -> PATCH /branches rounding_rule, PATCH /products pricing_basis, POST /products with a
      pricing_basis: each 403, and nothing written (no product created).
  O4  admin -> a MIXED body (address beside rounding_rule): 403 and the address NOT written.
  O5  owner -> PATCH /shop rounding_rule + deduction_mode + deduction_reason_required: 200, the row
      holds them, and audit_log holds ONE tenants UPDATE by the owner with old and new values.
  O6  OPERATIONAL settings stay with shop.settings.write: admin -> PATCH /shop address 200 (audited as
      the admin). Staff -> PATCH /shop address 403 permission_required (the control: the gate above the
      owner check still stands). shifts_enabled left this cell with ruling R1 (prove_rulings.py).
  P1  precedence, branch over shop: owner sets the branch's rounding; /shop/policy reports it; cleared
      with null, /shop/policy reports the shop's again.
  P2  precedence, product over shop: a product's deduction_mode overrides; GET /products reports the
      effective mode; cleared with null, the shop's.
  L1  a kg deduction: 100.000 - 5.000 - 2.500 at 10.00 -> net 92.500, amount 925.00, all stored.
  L2  a percent deduction: 3.00% of 95.000 -> 2.850 stored, net 92.150, amount 921.50.
  L3  BOTH in one bill (a product whose mode is `both`): a kg line and a percent line, 201.
  L4  a reason is stored with its deduction; a reason with no deduction is 422 reason_without_deduction.
  L5  reason REQUIRED by the shop and a deducting line sent WITHOUT one: 201. The server never refuses
      on a switch (STRUCTURE invariant 1: a load paid under the phone's cached rule must sync); the
      phone refuses to build such a line (mobile prove:linerules / prove:cart).
  L6  EACH ROUNDING RULE over HTTP: one bill per rule on the same 10.003 x 15.00 (and 12.010 x 12.50 for
      the quarter tie), stored amount = the hand-worked figure.
  L7  piece pricing: 3 pieces at 45.50 -> 136.50, quantity 3.000 and net 0.000 stored.
  L8  lump pricing: 1234.56 under down_0.25 -> 1234.50, quantity 1.000.
  L9  a LEGACY body (no rule fields -- an old outbox) -> 201, recorded as weight / half_up_0.01 / none.
  L10 refusals at the edge: a net that ignores the deduction (422 net_mismatch), a percent whose weight
      does not follow (422 deduction_weight_mismatch), a client total that disagrees (422).
  L11 THE UNIT ON THE LINE: GET /bills/{id} names the line's unit; after the product's unit is renamed
      AND the product moved to another unit, the same bill still names the unit it was received under.
  F1  A SETTING CHANGED AFTER A BILL CHANGES NOTHING ON IT: a bill's every row (header and lines, as
      row_to_json) and its GET /bills/{id} body are read, then the owner changes the rounding rule, the
      deduction rule, the reason rule, the product's basis and deduction rule, the default grade, the
      tier price and the seller's grade -- and the bill's rows and body are re-read VALUE-EQUAL.
  K1-K6  THE DATABASE HOLDS THE LINE ON ITS OWN (superuser inserts, each in a rolled-back transaction):
      net that ignores a deduction (ck_items_net), an amount off by one satang under its rule
      (ck_items_amount), a half-recorded snapshot (ck_items_rules), a percent whose weight does not
      follow (ck_items_deduction), a fractional piece (ck_items_quantity) -- each REFUSED by name; and
      the pre-0027 shape (snapshot all NULL) still ACCEPTED (K6, the control).
  R1  reconcile.py over the whole scratch: RECONCILE_EXIT=0 (T2/T3 restate every rule independently).

DISPROOFS (--break drops one CHECK on the scratch before the cells, and its K cell must redden):
  --break ck_items_net | ck_items_amount | ck_items_rules | ck_items_deduction | ck_items_quantity
The code-level disproofs (owner guard bypassed; the bill read showing the product's CURRENT unit) are
run by hand and recorded in PROJECT_STATUS.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import asyncpg  # noqa: E402
import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from lane import scratch_name  # noqa: E402

SCRATCH_DB = scratch_name("recycle_money_rules_scratch")
RUN = uuid.uuid4().hex[:8]
BREAKS = ("ck_items_net", "ck_items_amount", "ck_items_rules", "ck_items_deduction", "ck_items_quantity")

failures: list[str] = []
passes: list[str] = []


def check(cond: bool, claim: str) -> None:
    print(f"  [{'OK  ' if cond else 'RED '}] {claim}")
    (passes if cond else failures).append(claim)


def header(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def restore_scratch(live_name: str, scratch: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-mrules-dump-{RUN}")
    label = f"mrules-{RUN}"
    cp = subprocess.run([sys.executable, os.path.join("scripts", "backup_db.py"), "--db", live_name,
                         "--out", out, "--label", label], cwd=SERVER_DIR, capture_output=True, text=True, timeout=300)
    if cp.returncode != 0:
        raise RuntimeError(f"backup_db.py (live) failed: {cp.stderr.strip()[:600]}")
    dumps = [d for d in os.listdir(out) if d.endswith(label)]
    if len(dumps) != 1:
        raise RuntimeError(f"expected one dump dir ending {label!r}, got {dumps}")
    cp = subprocess.run([sys.executable, os.path.join("scripts", "restore_db.py"), os.path.join(out, dumps[0]),
                         "--into", scratch], cwd=SERVER_DIR, capture_output=True, text=True, timeout=300)
    if cp.returncode != 0:
        raise RuntimeError(f"restore_db.py -> {scratch} failed: {cp.stderr.strip()[:600]}")
    shutil.rmtree(out, ignore_errors=True)


class Db:
    def __init__(self, url: str, scratch: str) -> None:
        u = make_url(url)
        self.host, self.port, self.scratch = u.host, u.port, scratch

    async def su(self) -> asyncpg.Connection:
        return await asyncpg.connect(host=self.host, port=self.port, user="postgres", password="postgres",
                                     database=self.scratch)

    async def fetch(self, sql: str, *args: Any) -> list:
        c = await self.su()
        try:
            return await c.fetch(sql, *args)
        finally:
            await c.close()

    async def fetchrow(self, sql: str, *args: Any) -> Any:
        c = await self.su()
        try:
            return await c.fetchrow(sql, *args)
        finally:
            await c.close()

    async def fetchval(self, sql: str, *args: Any) -> Any:
        c = await self.su()
        try:
            return await c.fetchval(sql, *args)
        finally:
            await c.close()

    async def bill_rows(self, bill_id: str) -> tuple:
        b = uuid.UUID(bill_id)
        head = await self.fetch("SELECT row_to_json(x)::text FROM purchase_bills x WHERE id = $1", b)
        items = await self.fetch("SELECT row_to_json(x)::text FROM purchase_bill_items x WHERE bill_id = $1"
                                 " ORDER BY line_no", b)
        return tuple(r[0] for r in head), tuple(r[0] for r in items)

    async def line(self, bill_id: str, line_no: int = 1) -> Any:
        return await self.fetchrow(
            "SELECT gross_weight::text, tare_weight::text, net_weight::text, unit_price::text, list_price::text,"
            " amount::text, deduction_mode, deduction_pct::text, deduction_weight::text, deduction_reason,"
            " pricing_basis, quantity::text, rounding_rule, unit_code, unit_name, tier_code"
            " FROM purchase_bill_items WHERE bill_id = $1 AND line_no = $2", uuid.UUID(bill_id), line_no)


class Shop:
    def __init__(self) -> None:
        self.id = uuid.uuid4()
        self.uid = {k: uuid.uuid4() for k in ("owner", "admin", "staff")}
        self.names = {k: f"{k}-mr-{RUN}" for k in self.uid}
        self.pw = {k: f"pw-{k}-mr-{RUN}" for k in self.uid}
        self.tok: dict[str, str] = {}
        self.ids: dict[str, str] = {}


async def provision(shop: Shop) -> None:
    from sqlalchemy import text
    from app.db import SYSTEM_ACTOR_ID, tenant_connection
    from app.permissions import seed_system_roles
    from app.security import hash_password

    async with tenant_connection(shop.id, actor_id=SYSTEM_ACTOR_ID, actor_username="system:prove_money_rules") as conn:
        await conn.execute(text("INSERT INTO tenants (id, name) VALUES (:id, :n)"), {"id": shop.id, "n": f"MR {RUN}"})
        await conn.execute(text("INSERT INTO branches (tenant_id, code, name, doc_prefix, is_active)"
                                " VALUES (:t, 'MAIN', :n, 'B', true)"), {"t": shop.id, "n": f"MR {RUN}"})
        roles = await seed_system_roles(conn, shop.id)
        for key, uid in shop.uid.items():
            await conn.execute(text("INSERT INTO users (id, tenant_id, username, full_name, role_id, password_hash)"
                                    " VALUES (:id, :t, :u, :u, :r, :ph)"),
                               {"id": uid, "t": shop.id, "u": shop.names[key], "r": roles[key],
                                "ph": await hash_password(shop.pw[key])})


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def code_of(r: httpx.Response) -> str | None:
    try:
        d = r.json().get("detail")
    except ValueError:
        return None
    return d.get("code") if isinstance(d, dict) else None


async def build(c: httpx.AsyncClient, shop: Shop) -> None:
    async def call(method: str, path: str, body: Any = None) -> dict:
        r = await c.request(method, path, headers=auth(shop.tok["owner"]), json=body)
        if r.status_code not in (200, 201):
            raise RuntimeError(f"fixture: {method} {path} -> {r.status_code} {r.text[:300]}")
        return r.json()

    s = shop.ids
    s["branch"] = (await call("GET", "/shop"))["branch"]["id"]
    await call("POST", "/grade-tiers", {"code": "A", "name": "เกรด A"})
    await call("POST", "/grade-tiers", {"code": "B", "name": "เกรด B"})
    s["kg"] = (await call("POST", "/uoms", {"code": "KG", "name": "กก."}))["id"]
    # Ruling R2 (0028): a product priced by count must sit on a unit declared `count`.
    s["pc"] = (await call("POST", "/uoms", {"code": "PC", "name": "ชิ้น", "kind": "count"}))["id"]
    s["lot"] = (await call("POST", "/uoms", {"code": "LOT", "name": "เหมา", "kind": "count"}))["id"]
    s["box"] = (await call("POST", "/uoms", {"code": "BOX", "name": "ลัง", "kind": "count"}))["id"]
    s["cat"] = (await call("POST", "/product-categories", {"code": "FE", "name": "เหล็ก"}))["id"]

    async def product(code: str, uom: str, price: str, **rules: str) -> str:
        pid = (await call("POST", "/products", {"code": code, "name": f"สินค้า {code}", "category_id": s["cat"],
                                                 "uom_id": s[uom], **rules}))["id"]
        await call("PUT", f"/products/{pid}/prices/A", {"price": price})
        await call("PUT", f"/products/{pid}/prices/B", {"price": price})
        return pid

    s["w"] = await product("W1", "kg", "15.00")
    s["w10"] = await product("W10", "kg", "10.00", deduction_mode="both")
    s["pc_p"] = await product("PC1", "pc", "45.50", pricing_basis="piece")
    s["lot_p"] = await product("LOT1", "lot", "1234.56", pricing_basis="lump")
    s["fwd"] = await product("FWD", "kg", "15.00")
    s["seller"] = (await call("POST", "/sellers", {"name": f"ผู้ขาย {RUN}", "grade": "A"}))["id"]


def line(product: str, gross: str, tare: str, price: str, line_no: int = 1, **rules: Any) -> dict:
    return {"id": str(uuid.uuid4()), "product_id": product, "line_no": line_no, "gross_weight": gross,
            "tare_weight": tare, "unit_price": price, **rules}


def bill(shop: Shop, *lines: dict, total: str | None = None) -> dict:
    body: dict[str, Any] = {"id": str(uuid.uuid4()), "seller_id": shop.ids["seller"], "device_created_at": now_iso(),
                            "idempotency_key": f"mr-{uuid.uuid4()}", "items": list(lines)}
    if total is not None:
        body["total_amount"] = total
    return body


async def post_bill(c: httpx.AsyncClient, shop: Shop, body: dict, who: str = "owner") -> httpx.Response:
    return await c.post("/bills", headers=auth(shop.tok[who]), json=body)


# ---------------------------------------------------------------------------
async def catalogue(db: Db) -> None:
    header("C1  the settings catalogue equals the columns (set equality per table)")
    from app.policy import CATALOGUED_TABLES, IDENTITY_COLUMNS, SETTINGS
    for t in CATALOGUED_TABLES:
        cols = {r[0] for r in await db.fetch(
            "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1", t)}
        declared = {s.column for s in SETTINGS if s.table == t} | set(IDENTITY_COLUMNS[t])
        check(cols == declared, f"C1 {t}: every column is declared (undeclared {sorted(cols - declared)},"
                                f" stale {sorted(declared - cols)})")
    owner = sorted(f"{s.table}.{s.column} ({s.kind})" for s in SETTINGS if s.kind in ("money", "payment"))
    print(f"      owner-only: {owner}")


async def owner_only(c: httpx.AsyncClient, db: Db, shop: Shop) -> None:
    header("C2 / O1-O6  who may change which setting")
    r = await c.get("/shop/policy", headers=auth(shop.tok["staff"]))
    pol = r.json() if r.status_code == 200 else {}
    check(r.status_code == 200 and pol.get("rounding_rule") == "half_up_0.01" and pol.get("deduction_mode") == "none"
          and pol.get("deduction_reason_required") is False,
          f"C2 /shop/policy defaults: {r.status_code} {({k: pol.get(k) for k in ('rounding_rule', 'deduction_mode', 'deduction_reason_required')})}")

    async def tenant_row() -> str:
        return await db.fetchval("SELECT row_to_json(t)::text FROM tenants t WHERE id = $1", shop.id)

    async def audits() -> int:
        return int(await db.fetchval("SELECT count(*) FROM audit_log WHERE tenant_id = $1", shop.id))

    t0, a0 = await tenant_row(), await audits()
    r = await c.patch("/shop", headers=auth(shop.tok["admin"]), json={"rounding_rule": "down_1"})
    check(r.status_code == 403 and code_of(r) == "money_rule_owner_only" and await tenant_row() == t0
          and await audits() == a0,
          f"O1 admin -> rounding_rule: {r.status_code} {code_of(r)}; tenants row and audit_log unchanged")
    r = await c.patch("/shop", headers=auth(shop.tok["admin"]), json={"default_grade": "A"})
    check(r.status_code == 403 and code_of(r) == "money_rule_owner_only" and await tenant_row() == t0,
          f"O2 admin -> default_grade: {r.status_code} {code_of(r)}")
    rb = await c.patch(f"/branches/{shop.ids['branch']}", headers=auth(shop.tok["admin"]), json={"rounding_rule": "half_up_1"})
    rp = await c.patch(f"/products/{shop.ids['w']}", headers=auth(shop.tok["admin"]), json={"pricing_basis": "piece"})
    n_before = int(await db.fetchval("SELECT count(*) FROM products WHERE tenant_id = $1", shop.id))
    rc = await c.post("/products", headers=auth(shop.tok["admin"]),
                      json={"code": "ADM1", "name": "admin", "category_id": shop.ids["cat"], "uom_id": shop.ids["kg"],
                            "pricing_basis": "lump"})
    n_after = int(await db.fetchval("SELECT count(*) FROM products WHERE tenant_id = $1", shop.id))
    basis = await db.fetchval("SELECT pricing_basis FROM products WHERE id = $1", uuid.UUID(shop.ids["w"]))
    branch_rule = await db.fetchval("SELECT rounding_rule FROM branches WHERE id = $1", uuid.UUID(shop.ids["branch"]))
    check(all(x.status_code == 403 and code_of(x) == "money_rule_owner_only" for x in (rb, rp, rc))
          and n_before == n_after and basis == "weight" and branch_rule is None,
          f"O3 admin -> branch rounding {rb.status_code}, product basis {rp.status_code}, product created with a"
          f" basis {rc.status_code}; nothing written (products {n_before}->{n_after}, basis {basis}, branch {branch_rule})")
    r = await c.patch("/shop", headers=auth(shop.tok["admin"]), json={"address": f"mixed {RUN}", "rounding_rule": "down_1"})
    check(r.status_code == 403 and await tenant_row() == t0,
          f"O4 admin -> address beside rounding_rule: {r.status_code}; the address NOT written")

    r = await c.patch("/shop", headers=auth(shop.tok["owner"]),
                      json={"rounding_rule": "down_1", "deduction_mode": "kg", "deduction_reason_required": True})
    row = await db.fetchrow("SELECT rounding_rule, deduction_mode, deduction_reason_required FROM tenants WHERE id = $1", shop.id)
    aud = await db.fetch(
        "SELECT actor_user_id, old_data->>'rounding_rule' AS o, new_data->>'rounding_rule' AS n,"
        " new_data->>'deduction_mode' AS dm, new_data->>'deduction_reason_required' AS rr"
        " FROM audit_log WHERE tenant_id = $1 AND table_name = 'tenants' AND action = 'UPDATE' ORDER BY created_at", shop.id)
    last = aud[-1] if aud else None
    check(r.status_code == 200 and tuple(row) == ("down_1", "kg", True) and len(aud) == 1 and last is not None
          and last["actor_user_id"] == shop.uid["owner"] and (last["o"], last["n"], last["dm"], last["rr"])
          == ("half_up_0.01", "down_1", "kg", "true"),
          f"O5 owner -> three money rules: {r.status_code}; row {tuple(row)}; tenants audit rows {len(aud)}"
          f" {dict(last) if last else None}")

    r = await c.patch("/shop", headers=auth(shop.tok["admin"]), json={"address": f"ถนน {RUN}"})
    adm = await db.fetchval("SELECT count(*) FROM audit_log WHERE tenant_id = $1 AND table_name = 'tenants'"
                            " AND actor_user_id = $2 AND new_data->>'address' = $3", shop.id, shop.uid["admin"], f"ถนน {RUN}")
    st = await c.patch("/shop", headers=auth(shop.tok["staff"]), json={"address": "staff"})
    # shifts_enabled was this cell's second operational write until ruling R1 (2026-10-25) made it a
    # payment rule; prove_rulings.py R1 holds it (admin 403, owner 200, audited).
    check(r.status_code == 200 and adm == 1 and st.status_code == 403
          and code_of(st) == "permission_required",
          f"O6 operational: admin address {r.status_code} (audited as admin: {adm});"
          f" staff address {st.status_code} {code_of(st)}")


async def precedence(c: httpx.AsyncClient, shop: Shop) -> None:
    header("P1 / P2  the one reader: branch over shop, product over shop")
    o = auth(shop.tok["owner"])
    r1 = await c.patch(f"/branches/{shop.ids['branch']}", headers=o, json={"rounding_rule": "half_up_1"})
    p1 = (await c.get("/shop/policy", headers=o)).json()
    r2 = await c.patch(f"/branches/{shop.ids['branch']}", headers=o, json={"rounding_rule": None})
    p2 = (await c.get("/shop/policy", headers=o)).json()
    check(r1.status_code == 200 and p1.get("rounding_rule") == "half_up_1" and r2.status_code == 200
          and p2.get("rounding_rule") == "down_1",
          f"P1 branch override half_up_1 -> policy {p1.get('rounding_rule')}; cleared -> {p2.get('rounding_rule')} (the shop's)")

    async def eff(pid: str) -> tuple[Any, Any]:
        ps = (await c.get("/products", headers=o)).json()["products"]
        p = next(x for x in ps if x["id"] == pid)
        return p.get("deduction_mode"), p.get("deduction_mode_effective")

    before = await eff(shop.ids["w"])
    r3 = await c.patch(f"/products/{shop.ids['w']}", headers=o, json={"deduction_mode": "percent"})
    mid = await eff(shop.ids["w"])
    r4 = await c.patch(f"/products/{shop.ids['w']}", headers=o, json={"deduction_mode": None})
    after = await eff(shop.ids["w"])
    check(before == (None, "kg") and r3.status_code == 200 and mid == ("percent", "percent") and r4.status_code == 200
          and after == (None, "kg"),
          f"P2 product override: {before} -> {mid} -> cleared {after}")
    # back to the default rounding for the line cells below
    await c.patch("/shop", headers=o, json={"rounding_rule": "half_up_0.01", "deduction_reason_required": False})


async def lines(c: httpx.AsyncClient, db: Db, shop: Shop) -> None:
    header("L1-L10  every rule, over HTTP, read back from Postgres")
    s = shop.ids

    b = bill(shop, line(s["w10"], "100.000", "5.000", "10.00", net_weight="92.500", deduction_mode="kg",
                        deduction_weight="2.500", deduction_reason="ดินติด", rounding_rule="half_up_0.01",
                        pricing_basis="weight"))
    r = await post_bill(c, shop, b)
    row = await db.line(b["id"])
    check(r.status_code == 201 and row is not None and (row["deduction_mode"], row["deduction_weight"], row["net_weight"],
          row["quantity"], row["amount"], row["deduction_reason"], row["rounding_rule"], row["pricing_basis"],
          row["unit_code"], row["unit_name"], row["tier_code"], row["deduction_pct"])
          == ("kg", "2.500", "92.500", "92.500", "925.00", "ดินติด", "half_up_0.01", "weight", "KG", "กก.", "A", None),
          f"L1 kg deduction: {r.status_code} {dict(row) if row else None}")

    b = bill(shop, line(s["w10"], "100.000", "5.000", "10.00", net_weight="92.150", deduction_mode="percent",
                        deduction_pct="3.00", deduction_weight="2.850", deduction_reason="ความชื้น"))
    r = await post_bill(c, shop, b)
    row = await db.line(b["id"])
    check(r.status_code == 201 and row is not None and (row["deduction_mode"], row["deduction_pct"], row["deduction_weight"],
          row["net_weight"], row["amount"]) == ("percent", "3.00", "2.850", "92.150", "921.50"),
          f"L2 percent deduction: {r.status_code} {dict(row) if row else None}")

    b = bill(shop,
             line(s["w10"], "100.000", "5.000", "10.00", 1, net_weight="92.500", deduction_mode="kg", deduction_weight="2.500"),
             line(s["w10"], "100.000", "5.000", "10.00", 2, net_weight="92.150", deduction_mode="percent",
                  deduction_pct="3.00", deduction_weight="2.850"),
             total="1846.50")
    r = await post_bill(c, shop, b)
    l1, l2 = await db.line(b["id"], 1), await db.line(b["id"], 2)
    total = await db.fetchval("SELECT total_amount::text FROM purchase_bills WHERE id = $1", uuid.UUID(b["id"]))
    check(r.status_code == 201 and l1["deduction_mode"] == "kg" and l2["deduction_mode"] == "percent" and total == "1846.50",
          f"L3 both modes in one bill (product mode `both`): {r.status_code}, total {total}")

    r_bad = await post_bill(c, shop, bill(shop, line(s["w"], "10.000", "0.000", "15.00", net_weight="10.000",
                                                    deduction_reason="ไม่มีการหัก")))
    check(r_bad.status_code == 422 and code_of(r_bad) == "reason_without_deduction",
          f"L4 a reason with no deduction: {r_bad.status_code} {code_of(r_bad)} (L1/L2 stored theirs)")

    await c.patch("/shop", headers=auth(shop.tok["owner"]), json={"deduction_reason_required": True})
    b = bill(shop, line(s["w10"], "100.000", "5.000", "10.00", net_weight="92.500", deduction_mode="kg",
                        deduction_weight="2.500"))
    r = await post_bill(c, shop, b, who="staff")
    row = await db.line(b["id"])
    check(r.status_code == 201 and row is not None and row["deduction_reason"] is None,
          f"L5 reason required, a deducting line sent without one: {r.status_code} (a switch never refuses a paid load)")
    await c.patch("/shop", headers=auth(shop.tok["owner"]), json={"deduction_reason_required": False})

    cases = (("half_up_0.01", "10.003", "15.00", "150.05"), ("down_0.01", "10.003", "15.00", "150.04"),
             ("half_up_0.25", "12.010", "12.50", "150.25"), ("down_0.25", "12.010", "12.50", "150.00"),
             ("half_up_1", "10.000", "15.05", "151.00"), ("down_1", "10.000", "15.05", "150.00"))
    for rule, g, p, want in cases:
        b = bill(shop, line(s["w"], g, "0.000", p, net_weight=g, rounding_rule=rule))
        r = await post_bill(c, shop, b)
        row = await db.line(b["id"])
        got = row["amount"] if row else None
        check(r.status_code == 201 and got == want and row["rounding_rule"] == rule,
              f"L6 {rule}: {g} x {p} -> stored {got} (want {want})")

    b = bill(shop, line(s["pc_p"], "0.000", "0.000", "45.50", net_weight="0.000", pricing_basis="piece", quantity="3"))
    r = await post_bill(c, shop, b)
    row = await db.line(b["id"])
    check(r.status_code == 201 and row is not None and (row["pricing_basis"], row["quantity"], row["net_weight"],
          row["amount"], row["unit_name"]) == ("piece", "3.000", "0.000", "136.50", "ชิ้น"),
          f"L7 piece: {r.status_code} {dict(row) if row else None}")

    b = bill(shop, line(s["lot_p"], "0.000", "0.000", "1234.56", net_weight="0.000", pricing_basis="lump",
                        rounding_rule="down_0.25"))
    r = await post_bill(c, shop, b)
    row = await db.line(b["id"])
    check(r.status_code == 201 and row is not None and (row["pricing_basis"], row["quantity"], row["amount"])
          == ("lump", "1.000", "1234.50"),
          f"L8 lump: {r.status_code} {dict(row) if row else None}")

    b = bill(shop, {"id": str(uuid.uuid4()), "product_id": s["w"], "line_no": 1, "gross_weight": "10.003",
                    "tare_weight": "0.000", "net_weight": "10.003", "unit_price": "15.00"})
    r = await post_bill(c, shop, b)
    row = await db.line(b["id"])
    check(r.status_code == 201 and row is not None and (row["pricing_basis"], row["rounding_rule"], row["deduction_mode"],
          row["quantity"], row["amount"], row["tier_code"]) == ("weight", "half_up_0.01", "none", "10.003", "150.05", "A"),
          f"L9 a legacy body (no rule fields): {r.status_code} {dict(row) if row else None}")

    r1 = await post_bill(c, shop, bill(shop, line(s["w10"], "100.000", "5.000", "10.00", net_weight="95.000",
                                                  deduction_mode="kg", deduction_weight="2.500")))
    r2 = await post_bill(c, shop, bill(shop, line(s["w10"], "100.000", "5.000", "10.00", net_weight="92.151",
                                                  deduction_mode="percent", deduction_pct="3.00", deduction_weight="2.849")))
    r3 = await post_bill(c, shop, bill(shop, line(s["w"], "10.003", "0.000", "15.00", net_weight="10.003",
                                                  rounding_rule="down_1"), total="150.05"))
    check(r1.status_code == 422 and code_of(r1) == "net_mismatch" and r2.status_code == 422
          and code_of(r2) == "deduction_weight_mismatch" and r3.status_code == 422,
          f"L10 refused at the edge: net ignoring the deduction {r1.status_code} {code_of(r1)}; percent weight"
          f" {r2.status_code} {code_of(r2)}; client total under another rule {r3.status_code}")


async def unit_and_forward(c: httpx.AsyncClient, db: Db, shop: Shop) -> None:
    header("L11 / F1  the line keeps its unit and every rule after the settings move")
    s, o = shop.ids, auth(shop.tok["owner"])
    # 20.000 - 1.000 - 1.000 = 18.000 at 15.00 = 270.00, half-up to the satang (no rule sent: the default).
    b = bill(shop, line(s["fwd"], "20.000", "1.000", "15.00", net_weight="18.000", deduction_mode="kg",
                        deduction_weight="1.000"))
    await c.patch("/shop", headers=o, json={"deduction_mode": "kg"})
    r = await post_bill(c, shop, b)
    check(r.status_code == 201, f"F1 the bill is created under the first rules ({r.status_code})")
    rows_before = await db.bill_rows(b["id"])
    body_before = (await c.get(f"/bills/{b['id']}", headers=o)).json()
    item0 = body_before["items"][0]
    check(item0.get("unit_name") == "กก." and item0.get("rules_recorded") is True and item0.get("amount") == "270.00",
          f"L11 GET /bills/{{id}} names the line's unit: {item0.get('unit_code')} {item0.get('unit_name')},"
          f" amount {item0.get('amount')}")

    changes = [
        ("PATCH", "/shop", {"rounding_rule": "down_1", "deduction_mode": "percent", "deduction_reason_required": True}),
        ("PATCH", f"/branches/{s['branch']}", {"rounding_rule": "half_up_0.25"}),
        ("PATCH", f"/products/{s['fwd']}", {"pricing_basis": "piece", "deduction_mode": "none", "uom_id": s["box"]}),
        ("PATCH", f"/uoms/{s['kg']}", {"name": f"กิโลกรัม {RUN}"}),
        ("PUT", f"/products/{s['fwd']}/prices/A", {"price": "99.00"}),
        ("PATCH", f"/sellers/{s['seller']}", {"grade": "B"}),
        ("PATCH", "/shop", {"default_grade": "B"}),
    ]
    codes = []
    for method, path, body in changes:
        rr = await c.request(method, path, headers=o, json=body)
        codes.append(rr.status_code)
    check(all(x == 200 for x in codes), f"F1 the owner moved every setting the line used: {codes}")
    rows_after = await db.bill_rows(b["id"])
    body_after = (await c.get(f"/bills/{b['id']}", headers=o)).json()
    check(rows_after == rows_before, "F1 THE BILL'S ROWS (header and lines, row_to_json) ARE VALUE-EQUAL after every change")
    keep = ("amount", "net_weight", "quantity", "deduction_weight", "deduction_mode", "rounding_rule", "pricing_basis",
            "unit_code", "unit_name", "tier_code", "list_price", "unit_price")
    check(all(body_after["items"][0].get(k) == item0.get(k) for k in keep)
          and body_after.get("total_amount") == body_before.get("total_amount"),
          f"L11/F1 GET /bills/{{id}} still reads the received unit {body_after['items'][0].get('unit_name')!r}"
          f" and the received figures (total {body_after.get('total_amount')})")
    # put the shop back for anything after this
    await c.patch("/shop", headers=o, json={"rounding_rule": "half_up_0.01", "deduction_mode": "none",
                                            "deduction_reason_required": False})
    await c.patch(f"/branches/{s['branch']}", headers=o, json={"rounding_rule": None})


async def db_checks(db: Db, shop: Shop, broken: str | None) -> None:
    header("K1-K6  the database refuses a line the rules do not produce (superuser, rolled back)")
    bill_id = await db.fetchval("SELECT id FROM purchase_bills WHERE tenant_id = $1 ORDER BY server_received_at LIMIT 1",
                                shop.id)
    pid = uuid.UUID(shop.ids["w"])
    base = {"gross_weight": "10.000", "tare_weight": "0.000", "net_weight": "10.000", "unit_price": "15.00",
            "list_price": "15.00", "amount": "150.00", "deduction_mode": "none", "deduction_pct": None,
            "deduction_weight": "0", "deduction_reason": None, "pricing_basis": "weight", "quantity": "10.000",
            "rounding_rule": "half_up_0.01", "unit_code": "KG", "unit_name": "กก.", "tier_code": "A"}
    cases = [
        ("K1", "ck_items_net", {"deduction_mode": "kg", "deduction_weight": "1.000"}),
        ("K2", "ck_items_amount", {"amount": "150.01"}),
        ("K3", "ck_items_rules", {"tier_code": None}),
        ("K4", "ck_items_deduction", {"deduction_mode": "percent", "deduction_pct": "10.00", "deduction_weight": "1.001",
                                      "net_weight": "8.999", "quantity": "8.999", "amount": "134.99"}),
        ("K5", "ck_items_quantity", {"pricing_basis": "piece", "quantity": "2.500", "amount": "37.50"}),
    ]
    c = await db.su()
    try:
        line_no = 900
        for cell, cname, over in cases:
            vals = {**base, **over}
            line_no += 1
            got = None
            tr = c.transaction()
            await tr.start()
            try:
                await c.execute(
                    "INSERT INTO purchase_bill_items (id, tenant_id, bill_id, product_id, line_no, gross_weight,"
                    " tare_weight, net_weight, unit_price, list_price, amount, deduction_mode, deduction_pct,"
                    " deduction_weight, deduction_reason, pricing_basis, quantity, rounding_rule, unit_code,"
                    " unit_name, tier_code) VALUES ($1,$2,$3,$4,$5,$6::numeric,$7::numeric,$8::numeric,$9::numeric,"
                    "$10::numeric,$11::numeric,$12,$13::numeric,$14::numeric,$15,$16,$17::numeric,$18,$19,$20,$21)",
                    uuid.uuid4(), shop.id, bill_id, pid, line_no, vals["gross_weight"], vals["tare_weight"],
                    vals["net_weight"], vals["unit_price"], vals["list_price"], vals["amount"], vals["deduction_mode"],
                    vals["deduction_pct"], vals["deduction_weight"], vals["deduction_reason"], vals["pricing_basis"],
                    vals["quantity"], vals["rounding_rule"], vals["unit_code"], vals["unit_name"], vals["tier_code"])
                got = "ACCEPTED"
            except asyncpg.CheckViolationError as e:
                got = e.constraint_name
            finally:
                await tr.rollback()
            note = " (the constraint was dropped by --break)" if broken == cname else ""
            check(got == cname, f"{cell} {cname}: the insert was refused by {got}{note}")
        tr = c.transaction()
        await tr.start()
        try:
            await c.execute(
                "INSERT INTO purchase_bill_items (id, tenant_id, bill_id, product_id, line_no, gross_weight,"
                " tare_weight, net_weight, unit_price, list_price, amount) VALUES ($1,$2,$3,$4,999,10,0,10,15,15,150)",
                uuid.uuid4(), shop.id, bill_id, pid)
            ok6 = True
        except asyncpg.PostgresError as e:
            ok6 = False
            print(f"      K6 refused: {type(e).__name__} {getattr(e, 'constraint_name', '')}")
        finally:
            await tr.rollback()
        check(ok6, "K6 CONTROL: the pre-0027 shape (no snapshot, no deduction) is still accepted")
    finally:
        await c.close()


def reconcile(scratch: str) -> None:
    header("R1  reconcile.py over the whole scratch")
    cp = subprocess.run([sys.executable, os.path.join("scripts", "reconcile.py"), "--database", scratch],
                        cwd=SERVER_DIR, capture_output=True, timeout=600)
    out = (cp.stdout + cp.stderr).decode("utf-8", "replace").replace("\r\n", "\n")
    lines_ = [x for x in out.split("\n") if x.startswith("RECONCILE_EXIT=")]
    reds = [x.strip() for x in out.split("\n") if " T2 " in x or " T3 " in x][:4]
    check(lines_ == ["RECONCILE_EXIT=0"], f"R1 RECONCILE_EXIT=0 over every tenant, the new lines included ({lines_}) {reds}")
    if lines_ != ["RECONCILE_EXIT=0"]:
        print(out[-3000:])


async def main() -> int:
    ap = argparse.ArgumentParser(description="The shop's money rules (M1).")
    ap.add_argument("--break", dest="brk", choices=BREAKS, default=None)
    args = ap.parse_args()
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
    rev = await db.fetchval("SELECT version_num FROM alembic_version")
    if rev is None or rev < "0028":
        # The live database has not taken the head yet: upgrade THE SCRATCH (never live) to head, so this
        # proof runs on a migrated copy BEFORE the migration touches dev (0028 since ruling R2: the
        # product reads name the unit's kind).
        env = dict(os.environ)
        env["MIGRATION_DATABASE_URL"] = make_url(os.environ["MIGRATION_DATABASE_URL"]).set(
            database=SCRATCH_DB).render_as_string(hide_password=False)
        cp = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=SERVER_DIR, env=env,
                            capture_output=True, timeout=600)
        rev2 = await db.fetchval("SELECT version_num FROM alembic_version")
        print(f"  the live database is at {rev}; the SCRATCH was upgraded to {rev2} (exit {cp.returncode})")
        if cp.returncode != 0 or rev2 is None or rev2 < "0027":
            print(f"UNFIT: {cp.stderr.decode('utf-8', 'replace')[-800:]}")
            return 2
    if args.brk:
        c = await db.su()
        try:
            await c.execute(f"ALTER TABLE purchase_bill_items DROP CONSTRAINT {args.brk}")
        finally:
            await c.close()
        print(f"  DISPROOF: dropped {args.brk} on the scratch")
    shop = Shop()

    port = free_port()
    base = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(mode="w", suffix=".log", prefix="prove_money_rules_", delete=False, encoding="utf-8")
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
            await catalogue(db)
            await owner_only(c, db, shop)
            await precedence(c, shop)
            await lines(c, db, shop)
            await unit_and_forward(c, db, shop)
        await db_checks(db, shop, args.brk)
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
    if not args.brk:
        reconcile(SCRATCH_DB)

    print("\n" + "=" * 72)
    print(f"  passes={len(passes)}  failures={len(failures)}")
    for f in failures:
        print(f"    RED: {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    rc = asyncio.run(main())
    print(f"PROVE_MONEY_RULES_EXIT={rc}")
    sys.exit(rc)
