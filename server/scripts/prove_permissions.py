"""Prove the permission model (migration 0019, STRUCTURE.md section 3, unit 1 of
its section 12) over real HTTP, on a SCRATCH.

    uv run python scripts/prove_permissions.py            (self-restores a scratch from a live dump)
    uv run python scripts/prove_permissions.py --database <scratch> --skip-restore

Model on prove_user_admin.py: restore a SCRATCH from a live dump of the database
named in APP_DATABASE_URL (which must already be at 0019), start a child uvicorn
on it, gate on /openapi.json and a live /whoami before any cell, provision the
fixture by direct insert into Shop A, then exercise every gate. Per-run uuids
everywhere, so the script is green TWICE in a row with no reseed
(proof-must-run-twice): run 2 restores a fresh scratch and mints fresh names.

THE CELLS, and the disproof each stands against:

  E0  the child serves THIS code: /openapi.json's ShopUpdate carries NO
      staff_money_visible (0019 dropped it) and /whoami carries `permissions`.
  F   the fixture: SIXTEEN roles in Shop A by SQL (fifteen before 0020 minted
      payments.record) -- one per catalogue
      permission holding EVERY permission BUT that one (nb-<code>), one holding
      all but BOTH money permissions (nomoney), one holding all fourteen (all)
      -- and a user in each. Every user signs in, and /whoami's `permissions`
      EQUALS the role's grant set (set equality, both directions), so the
      catalogue this proof restates BY HAND is the catalogue the server serves.
      F is the control for the whole matrix: a server that resolved the wrong
      set would fail here before a single route was asked.
  T1  the login token's `permissions` claim equals /whoami's set at mint --
      advisory, and equal at the moment it is minted.
  T2  THE TOKEN IN FLIGHT: a token minted WITHOUT the claim (the pre-0019
      shape, signed with the server's own secret) is ACCEPTED and /whoami
      resolves the full set from the ROW. The deploy signs nobody out.
  M   THE MATRIX, 49 route gates (36 before 0029 added 13 for M2; 34 before 0020 added GET and POST /payments):
      for each (route, permission) the principal
      holding every permission BUT that one reads 403 kind=forbidden
      code=permission_required required_permission=<that one>, and the all
      principal reads the route's own success status. Section 12's two
      disproofs are these cells: a principal holding every permission but one
      reaching 200 on the route that needs it, and a route still answering
      admin_required -- the sweep at the end asserts NO refusal in this run
      carried code=admin_required, with the site count as its control.
  S   the two INLINE gates (the 35th and 36th sites): GET /reports/summary --
      neither money permission -> 403 naming money.view_own; own-only -> 200
      with exactly the caller's row at by=user; shop -> 200 with more.
      GET /sellers/{id}/history -- money keys ABSENT without either, PRESENT
      with own-only and with shop (the former staff_money_visible = true).
  G   THE ESCALATION GUARD (the owner's decision 6): the nb-roles.manage user --
      an admin's exact set -- POST /users role=owner -> 403 role_exceeds_caller
      with over_reach == ["roles.manage"], and the roster is unchanged; the all
      user -> 201; role=<nonsense> -> 422 role_unknown field=role.
      DISPROOF, NAMED FIRST AND RUN BY HAND: delete the `over_reach` block in
      server/app/users.py::create_user and G's first cell reads 201 -- an admin
      mints an owner and takes the shop. (Measured 2026-09-04; see the record.)
  R   reconcile.py on the scratch exits 0, S7 green over the fixture roles.

Every assertion is a set comparison or a status, never an absolute count of
rows the proof did not create.
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
import jwt  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.seeddata import (  # noqa: E402
    CATEGORY_A_ID,
    PRODUCT_A_ID,
    SELLER_A_ID,
    TENANT_A_ID,
    UOM_A_ID,
)

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from lane import scratch_name  # noqa: E402  (scratch names are decided in lane.py only)
SCRATCH_DB = scratch_name("recycle_permissions_scratch")
RUN = uuid.uuid4().hex[:8]

# THE CATALOGUE, RESTATED BY HAND. Never imported from app.permissions: the F
# cells compare the server's answer against THIS list, and an import would make
# them agree by construction (a-checker-must-not-share-the-code-it-checks).
PERMS: tuple[str, ...] = (
    "bills.create", "bills.read", "bills.void", "money.view_own", "money.view_shop",
    "master.write", "prices.write", "sellers.create", "sellers.write", "tiers.manage",
    "users.manage", "shop.settings.write", "roles.manage",
    # Migration 0020 (the money ledger): the fourteenth code.
    "payments.record",
    # Migration 0022 (the shifts unit, commit 2): the fifteenth code.
    "shifts.manage",
    # Migration 0024 (seller search, C1): the sixteenth code -- an INLINE gate in the
    # seller responses, not a route gate, so it adds no matrix site.
    "sellers.read_personal",
    # Migration 0029 (M2): the seventeenth to twenty-second codes.
    "sales.create", "sales.read", "sales.void", "sales.receive", "buyers.write", "stock.adjust",
)

BASE = ""
failures: list[str] = []
passes: list[str] = []
refusal_codes_seen: list[str] = []


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


def _tail(path: str, n: int = 40) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return "".join(f.readlines()[-n:])
    except OSError:
        return "(no child log)"


def restore_scratch(live_name: str, scratch: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-perm-dump-{RUN}")
    label = f"perm-{RUN}"
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
    doc = r.json()
    props = (doc.get("components", {}).get("schemas", {})
             .get("ShopUpdate", {}).get("properties", {}))
    if "staff_money_visible" in props:
        return "ShopUpdate still declares staff_money_visible -- predates migration 0019"
    if "post" not in doc.get("paths", {}).get("/bills", {}):
        return "the server does not declare POST /bills"
    if "post" not in doc.get("paths", {}).get("/payments", {}):
        return "the server does not declare POST /payments -- predates migration 0020"
    return ""


# ---------------------------------------------------------------------------
# fixture: fifteen roles and users in Shop A, by direct insert
# ---------------------------------------------------------------------------
class Ctx:
    def __init__(self) -> None:
        # role label -> (role code, grant set, username, password, user id)
        self.roles: dict[str, tuple[str, frozenset[str], str, str, uuid.UUID]] = {}
        self.tokens: dict[str, str] = {}
        allset = frozenset(PERMS)
        for i, p in enumerate(PERMS):
            self.roles[f"nb:{p}"] = (
                f"nb{i:02d}-{RUN}", allset - {p}, f"nb{i:02d}-{RUN}", f"pw-{RUN}-nb{i:02d}",
                uuid.uuid4())
        self.roles["nomoney"] = (
            f"nomoney-{RUN}", allset - {"money.view_own", "money.view_shop"},
            f"nomoney-{RUN}", f"pw-{RUN}-nomoney", uuid.uuid4())
        self.roles["all"] = (f"all-{RUN}", allset, f"all-{RUN}", f"pw-{RUN}-all", uuid.uuid4())

    def lacking(self, perm: str) -> str:
        """The token of the principal holding every permission but `perm`."""
        return self.tokens[f"nb:{perm}"]


async def provision(ctx: Ctx) -> None:
    from sqlalchemy import text
    from app.db import SYSTEM_ACTOR_ID, tenant_connection
    from app.security import hash_password

    async with tenant_connection(
        TENANT_A_ID, actor_id=SYSTEM_ACTOR_ID, actor_username="system:prove_permissions",
    ) as conn:
        for label, (code, grants, username, password, uid) in ctx.roles.items():
            rid = (await conn.execute(
                text("INSERT INTO roles (tenant_id, code, name, is_system, is_active)"
                     " VALUES (:t, :code, :code, false, true) RETURNING id"),
                {"t": TENANT_A_ID, "code": code})).scalar_one()
            for p in sorted(grants):
                await conn.execute(
                    text("INSERT INTO role_permissions (tenant_id, role_id, permission)"
                         " VALUES (:t, :r, :p)"),
                    {"t": TENANT_A_ID, "r": rid, "p": p})
            ph = await hash_password(password)
            await conn.execute(
                text("INSERT INTO users (id, tenant_id, username, full_name, role_id,"
                     " password_hash) VALUES (:id, :t, :u, :fn, :r, :ph)"),
                {"id": uid, "t": TENANT_A_ID, "u": username, "fn": label, "r": rid, "ph": ph})


async def token_version_of(uid: uuid.UUID) -> int:
    from sqlalchemy import text
    from app.db import tenant_connection
    async with tenant_connection(TENANT_A_ID) as conn:
        return int((await conn.execute(
            text("SELECT token_version FROM users WHERE id = :id"), {"id": uid})).scalar_one())


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def login(client: httpx.AsyncClient, username: str, password: str) -> str | None:
    r = await client.post("/auth/login", json={
        "tenant_id": str(TENANT_A_ID), "username": username, "password": password})
    return r.json().get("access_token") if r.status_code == 200 else None


def detail_of(r: httpx.Response) -> dict:
    try:
        d = r.json().get("detail")
    except ValueError:
        return {}
    return d if isinstance(d, dict) else {}


async def whoami_perms(client: httpx.AsyncClient, token: str) -> set[str] | None:
    r = await client.get("/whoami", headers=auth(token))
    if r.status_code != 200:
        return None
    perms = r.json().get("permissions")
    return set(perms) if isinstance(perms, list) else None


def bill_body(tag: str) -> dict:
    return {
        "id": str(uuid.uuid4()),
        "seller_id": str(SELLER_A_ID),
        "vehicle_no": f"perm-{RUN}",
        "device_created_at": dt.datetime.now(tz=dt.timezone.utc).isoformat(),
        "idempotency_key": f"perm-{RUN}-{tag}",
        "items": [{
            "id": str(uuid.uuid4()), "product_id": str(PRODUCT_A_ID), "line_no": 1,
            "gross_weight": "10.000", "tare_weight": "0.000", "net_weight": "10.000",
            "unit_price": "15.00",
        }],
    }


# ---------------------------------------------------------------------------
# the matrix
# ---------------------------------------------------------------------------
class Matrix:
    def __init__(self, client: httpx.AsyncClient, ctx: Ctx) -> None:
        self.client = client
        self.ctx = ctx
        self.sites = 0

    async def site(self, perm: str, method: str, path: str, body: dict | None = None,
                   json_success: bool = True) -> httpx.Response:
        """One gated route: the all-but-`perm` principal is refused naming `perm`;
        the all principal succeeds. Returns the successful response."""
        self.sites += 1
        refused = await self.client.request(
            method, path, headers=auth(self.ctx.lacking(perm)), json=body)
        d = detail_of(refused)
        if isinstance(d.get("code"), str):
            refusal_codes_seen.append(d["code"])
        check(refused.status_code == 403 and d.get("kind") == "forbidden"
              and d.get("code") == "permission_required"
              and d.get("required_permission") == perm,
              f"M: {method} {path} -- all-but-{perm} is refused 403 permission_required"
              f" naming {perm} (got {refused.status_code} {d.get('code')!r}"
              f" {d.get('required_permission')!r})")
        allowed = await self.client.request(
            method, path, headers=auth(self.ctx.tokens["all"]), json=body)
        check(200 <= allowed.status_code < 300,
              f"M: {method} {path} -- the full principal succeeds"
              f" (got {allowed.status_code})")
        return allowed


async def run(ctx: Ctx, client: httpx.AsyncClient, scratch: str) -> None:
    # ---------------------------------------------------------------- F
    header("F  the fixture signs in, and /whoami resolves EXACTLY each role's set")
    for label, (code, grants, username, password, uid) in ctx.roles.items():
        tok = await login(client, username, password)
        check(bool(tok), f"F: {label} ({code}) can sign in")
        if not tok:
            return
        ctx.tokens[label] = tok
        got = await whoami_perms(client, tok)
        check(got == set(grants),
              f"F: /whoami permissions for {label} EQUAL the role's grant set"
              f" (|set|={len(grants)}; missing={sorted(set(grants) - (got or set()))},"
              f" extra={sorted((got or set()) - set(grants))})")
    all_tok = ctx.tokens["all"]
    check((await whoami_perms(client, all_tok)) == set(PERMS),
          f"F: the all user's set EQUALS this proof's hand-written {len(PERMS)}-code"
          " catalogue -- the server's catalogue is the one this file names")

    # ---------------------------------------------------------------- T
    header("T  the token claim is advisory and equal at mint; a claimless token still resolves")
    claims = jwt.decode(all_tok, options={"verify_signature": False})
    check(sorted(claims.get("permissions", [])) == sorted(PERMS),
          "T1: the login token's `permissions` claim equals the set /whoami resolves")
    from app.config import JWT_ALG, JWT_SECRET
    _, _, username, _, uid = ctx.roles["all"]
    now = dt.datetime.now(tz=dt.timezone.utc)
    old_shape = jwt.encode({
        "sub": str(uid), "tenant_id": str(TENANT_A_ID), "username": username,
        "role": f"all-{RUN}", "token_version": await token_version_of(uid),
        "iat": int(now.timestamp()), "exp": int((now + dt.timedelta(hours=1)).timestamp()),
    }, JWT_SECRET, algorithm=JWT_ALG)
    r = await client.get("/whoami", headers=auth(old_shape))
    check(r.status_code == 200 and set(r.json().get("permissions", [])) == set(PERMS),
          f"T2: a token WITHOUT a permissions claim (the pre-0019 shape) is accepted and"
          f" /whoami resolves the full set from the ROW (got {r.status_code})")

    # ---------------------------------------------------------------- M
    header("M  the matrix: 49 route gates, all-but-one refused naming it, all succeeds")
    m = Matrix(client, ctx)
    # bills
    created = await m.site("bills.create", "POST", "/bills", bill_body("m-create"))
    bill_id = created.json().get("id") if created.status_code == 201 else str(uuid.uuid4())
    await m.site("bills.read", "GET", "/bills")
    await m.site("bills.read", "GET", f"/bills/{bill_id}")
    await m.site("bills.void", "POST", f"/bills/{bill_id}/void", {"reason": f"perm {RUN}"})
    # payments.record -- 2 (migration 0020). The POST is an ADVANCE (no
    # allocations), so it depends on no bill this matrix voided above.
    await m.site("payments.record", "GET", "/payments")
    await m.site("payments.record", "POST", "/payments", {
        "id": str(uuid.uuid4()), "seller_id": str(SELLER_A_ID), "method": "cash",
        "amount": "1.00", "idempotency_key": f"pay-{RUN}-matrix",
        "device_created_at": dt.datetime.now(tz=dt.timezone.utc).isoformat(),
        "allocations": []})
    # money
    await m.site("money.view_shop", "GET", "/reports/daily")
    # master.write -- 12
    uom = await m.site("master.write", "POST", "/uoms", {"code": f"U{RUN[:6]}", "name": "unit"})
    uom_id = uom.json().get("id", uuid.uuid4())
    await m.site("master.write", "PATCH", f"/uoms/{uom_id}", {"name": "unit2"})
    await m.site("master.write", "POST", f"/uoms/{uom_id}/deactivate")
    await m.site("master.write", "POST", f"/uoms/{uom_id}/activate")
    cat = await m.site("master.write", "POST", "/product-categories",
                       {"code": f"C{RUN[:6]}", "name": "cat"})
    cat_id = cat.json().get("id", uuid.uuid4())
    await m.site("master.write", "PATCH", f"/product-categories/{cat_id}", {"name": "cat2"})
    await m.site("master.write", "POST", f"/product-categories/{cat_id}/deactivate")
    await m.site("master.write", "POST", f"/product-categories/{cat_id}/activate")
    prod = await m.site("master.write", "POST", "/products", {
        "code": f"P{RUN[:6]}", "name": "prod",
        "category_id": str(CATEGORY_A_ID), "uom_id": str(UOM_A_ID)})
    prod_id = prod.json().get("id", uuid.uuid4())
    await m.site("master.write", "PATCH", f"/products/{prod_id}", {"name": "prod2"})
    await m.site("master.write", "POST", f"/products/{prod_id}/deactivate")
    await m.site("master.write", "POST", f"/products/{prod_id}/activate")
    # prices.write
    await m.site("prices.write", "PUT", f"/products/{PRODUCT_A_ID}/prices/B", {"price": "15.00"})
    # sellers.create -- 2
    await m.site("sellers.create", "POST", "/sellers", {"name": f"seller {RUN}"})
    await m.site("sellers.create", "POST", "/seller-code-reservations",
                 {"device_id": str(uuid.uuid4())})
    # sellers.write -- 3
    await m.site("sellers.write", "PATCH", f"/sellers/{SELLER_A_ID}", {"vehicle_no": f"v-{RUN}"})
    await m.site("sellers.write", "POST", f"/sellers/{SELLER_A_ID}/deactivate")
    await m.site("sellers.write", "POST", f"/sellers/{SELLER_A_ID}/activate")
    # tiers.manage -- 3
    tier = await m.site("tiers.manage", "POST", "/grade-tiers",
                        {"code": f"T{RUN[:4]}", "name": "tier"})
    tier_id = tier.json().get("id", uuid.uuid4())
    await m.site("tiers.manage", "PATCH", f"/grade-tiers/{tier_id}", {"name": "tier2"})
    tiers = (await client.get("/grade-tiers?include_inactive=true",
                              headers=auth(all_tok))).json().get("grade_tiers", [])
    order = [t["id"] for t in tiers]
    await m.site("tiers.manage", "PUT", "/grade-tiers/order", {"order": order})
    # shop.settings.write
    await m.site("shop.settings.write", "PATCH", "/shop", {"address": f"addr {RUN}"})
    # users.manage -- 7
    await m.site("users.manage", "GET", "/users")
    tgt = await m.site("users.manage", "POST", "/users", {
        "username": f"tgt-{RUN}", "full_name": "target", "role": "staff",
        "password": f"pw-{RUN}-target"})
    tgt_id = tgt.json().get("user_id", uuid.uuid4())
    await m.site("users.manage", "POST", f"/users/{tgt_id}/revoke-sessions")
    await m.site("users.manage", "POST", f"/users/{tgt_id}/deactivate")
    await m.site("users.manage", "POST", f"/users/{tgt_id}/activate")
    await m.site("users.manage", "POST", f"/users/{tgt_id}/unlock-login")
    await m.site("users.manage", "POST", f"/users/{tgt_id}/password",
                 {"new_password": f"pw-{RUN}-target2"})
    # M2 (migration 0029) -- 13 route gates: buyers, sales, receipts, stock adjustments, the sell price, the report.
    now_iso = dt.datetime.now(tz=dt.timezone.utc).isoformat()
    buyer = await m.site("buyers.write", "POST", "/buyers", {"name": f"buyer {RUN}"})
    buyer_id = buyer.json().get("id", str(uuid.uuid4()))
    await m.site("buyers.write", "PATCH", f"/buyers/{buyer_id}", {"note": f"n {RUN}"})
    await m.site("buyers.write", "POST", f"/buyers/{buyer_id}/deactivate")
    await m.site("buyers.write", "POST", f"/buyers/{buyer_id}/activate")
    sale_id = str(uuid.uuid4())
    await m.site("sales.create", "POST", "/sales", {
        "id": sale_id, "buyer_id": buyer_id, "device_created_at": now_iso, "idempotency_key": f"sale-{RUN}-matrix",
        "items": [{"id": str(uuid.uuid4()), "product_id": str(PRODUCT_A_ID), "line_no": 1, "gross_weight": "1.000",
                   "tare_weight": "0.000", "net_weight": "1.000", "unit_price": "20.00"}]})
    await m.site("sales.read", "GET", "/sales")
    await m.site("sales.read", "GET", f"/sales/{sale_id}")
    await m.site("sales.receive", "POST", "/sale-receipts", {
        "id": str(uuid.uuid4()), "buyer_id": buyer_id, "method": "cash", "amount": "5.00",
        "idempotency_key": f"rcpt-{RUN}-matrix", "device_created_at": now_iso,
        "allocations": [{"bill_id": sale_id, "amount": "5.00"}]})
    await m.site("sales.receive", "GET", f"/sale-receipts?buyer_id={buyer_id}")
    await m.site("sales.void", "POST", f"/sales/{sale_id}/void", {"reason": f"perm {RUN}"})
    await m.site("stock.adjust", "POST", "/stock/adjustments", {
        "product_id": str(PRODUCT_A_ID), "quantity": "1.000", "reason": f"count {RUN}",
        "idempotency_key": f"adj-{RUN}-matrix", "device_created_at": now_iso})
    await m.site("prices.write", "PUT", f"/products/{PRODUCT_A_ID}/sell-price", {"price": "20.00"})
    today = dt.date.today().isoformat()
    await m.site("money.view_shop", "GET", f"/reports/sales?from_date={today}&to_date={today}")
    # 49 since 0029 (36 + the 13 above), edited by name.
    check(m.sites == 49, f"M: the matrix visited 49 route gates (control; visited {m.sites})")
    check(refusal_codes_seen.count("admin_required") == 0 and len(refusal_codes_seen) == 49,
          f"M: NO refusal in this run answered admin_required, over {len(refusal_codes_seen)}"
          " refusals read (section 12's disproof)")

    # ---------------------------------------------------------------- S
    header("S  the two inline gates: /reports/summary and /sellers/{id}/history")
    own_only = ctx.lacking("money.view_shop")   # holds money.view_own, not view_shop
    shop = ctx.lacking("money.view_own")        # holds money.view_shop, not view_own
    neither = ctx.tokens["nomoney"]
    # the own-only principal writes one bill so its own scope has a row to show
    rb = await client.post("/bills", headers=auth(own_only), json=bill_body("s-own"))
    check(rb.status_code == 201, f"S (staging): the own-only principal weighs a bill (got {rb.status_code})")
    today = dt.datetime.now(tz=dt.timezone(dt.timedelta(hours=7))).date().isoformat()
    q = {"from_date": today, "to_date": today, "by": "user", "state": "live"}
    r = await client.get("/reports/summary", headers=auth(neither), params=q)
    d = detail_of(r)
    check(r.status_code == 403 and d.get("code") == "permission_required"
          and d.get("required_permission") == "money.view_own",
          f"S: summary -- NEITHER money permission -> 403 permission_required naming"
          f" money.view_own (got {r.status_code} {d.get('code')!r})")
    r = await client.get("/reports/summary", headers=auth(own_only), params=q)
    own_uid = str(ctx.roles["nb:money.view_shop"][4])
    keys = {row.get("key") for row in r.json().get("rows", [])} if r.status_code == 200 else set()
    check(r.status_code == 200 and keys == {own_uid},
          f"S: summary -- money.view_own only -> 200 with EXACTLY the caller's own row at"
          f" by=user (got {r.status_code}, keys={sorted(keys)})")
    # state=all: the all principal's own bill from M was VOIDED there, so `live`
    # would show only the own-only user's row and the "AND others" half would be
    # vacuous (mechanism 9 of a-check-that-never-went-red-was-never-observed).
    r = await client.get("/reports/summary", headers=auth(shop), params={**q, "state": "all"})
    keys_shop = {row.get("key") for row in r.json().get("rows", [])} if r.status_code == 200 else set()
    check(r.status_code == 200 and own_uid in keys_shop and len(keys_shop) >= 2,
          f"S: summary -- money.view_shop -> 200 and sees the own-only user's row AND others"
          f" (got {r.status_code}, {len(keys_shop)} rows)")
    for label, tok, want in (("neither", neither, False), ("own-only", own_only, True),
                             ("shop", shop, True)):
        r = await client.get(f"/sellers/{SELLER_A_ID}/history", headers=auth(tok))
        raw = json.dumps(r.json(), ensure_ascii=False) if r.status_code == 200 else ""
        has = "total_amount" in raw
        check(r.status_code == 200 and r.json().get("money_included") is want and has is want,
              f"S: history -- {label}: money_included={want} and the money keys are"
              f" {'PRESENT' if want else 'ABSENT'} (got {r.status_code},"
              f" money_included={r.json().get('money_included') if r.status_code == 200 else None},"
              f" total_amount in body={has})")

    # ---------------------------------------------------------------- G
    header("G  the escalation guard: an admin's set cannot mint an owner")
    admin_like = ctx.lacking("roles.manage")
    before = (await client.get("/users?include_inactive=true", headers=auth(all_tok))).json()
    n_before = len(before.get("users", []))
    r = await client.post("/users", headers=auth(admin_like), json={
        "username": f"esc-{RUN}", "full_name": "escalation", "role": "owner",
        "password": f"pw-{RUN}-esc"})
    d = detail_of(r)
    check(r.status_code == 403 and d.get("code") == "role_exceeds_caller"
          and d.get("over_reach") == ["roles.manage"],
          f"G: all-but-roles.manage POST /users role=owner -> 403 role_exceeds_caller,"
          f" over_reach == ['roles.manage'] (got {r.status_code} {d.get('code')!r}"
          f" {d.get('over_reach')!r})")
    after = (await client.get("/users?include_inactive=true", headers=auth(all_tok))).json()
    check(len(after.get("users", [])) == n_before,
          f"G: nothing was written by the refused create ({n_before} -> {len(after.get('users', []))})")
    r = await client.post("/users", headers=auth(all_tok), json={
        "username": f"own-{RUN}", "full_name": "owner-minted", "role": "owner",
        "password": f"pw-{RUN}-own"})
    check(r.status_code == 201 and r.json().get("role") == "owner",
          f"G: the all principal (an owner's set) mints an owner -> 201 (got {r.status_code})")
    r = await client.post("/users", headers=auth(all_tok), json={
        "username": f"nonsense-{RUN}", "full_name": "x", "role": f"no-such-{RUN}",
        "password": f"pw-{RUN}-x"})
    d = detail_of(r)
    check(r.status_code == 422 and d.get("code") == "role_unknown" and d.get("field") == "role",
          f"G: a role code the shop does not hold -> 422 role_unknown field=role"
          f" (got {r.status_code} {d.get('code')!r})")

    # ---------------------------------------------------------------- R
    header("R  reconcile.py on the scratch: S7 green over the fixture roles")
    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "reconcile.py"), "--database", scratch],
        cwd=SERVER_DIR, env=env, capture_output=True, text=True, timeout=600,
        encoding="utf-8", errors="replace")
    out = cp.stdout + cp.stderr
    s7 = [ln for ln in out.splitlines() if "S7" in ln]
    print("      " + (s7[0].strip() if s7 else "(no S7 line)"))
    check(cp.returncode == 0 and bool(s7),
          f"R: reconcile.py exits 0 on the scratch and reports S7 (exit {cp.returncode})")


async def main() -> int:
    global BASE
    ap = argparse.ArgumentParser(description="Prove the permission model (0019) on a scratch.")
    ap.add_argument("--database", default=None,
                    help=f"a SCRATCH database. Omit to self-restore {SCRATCH_DB!r}. Never live.")
    ap.add_argument("--skip-restore", action="store_true")
    args = ap.parse_args()

    app_live = make_url(os.environ["APP_DATABASE_URL"])
    dir_live = make_url(os.environ["DIRECTORY_DATABASE_URL"])
    live_name = app_live.database
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

    os.environ["APP_DATABASE_URL"] = app_live.set(database=scratch).render_as_string(hide_password=False)
    os.environ["DIRECTORY_DATABASE_URL"] = dir_live.set(database=scratch).render_as_string(hide_password=False)

    ctx = Ctx()
    port = free_port()
    BASE = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(
        mode="w", suffix=".log", prefix="prove_permissions_", delete=False, encoding="utf-8")
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
        check(True, "E0: /openapi.json declares POST /bills and ShopUpdate WITHOUT staff_money_visible")

        try:
            await provision(ctx)
        except Exception as exc:  # noqa: BLE001
            print(f"UNFIT: provisioning failed: {exc!r}")
            return 2
        print(f"      provisioned {len(ctx.roles)} roles and users in Shop A ({TENANT_A_ID})")

        async with httpx.AsyncClient(base_url=BASE, timeout=60.0) as client:
            await run(ctx, client, scratch)

        print("\n" + "=" * 72)
        print(f"  passes={len(passes)}  failures={len(failures)}")
        for f in failures:
            print(f"    RED: {f}")
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
    print(f"PROVE_PERMISSIONS_EXIT={rc}")
    sys.exit(rc)
