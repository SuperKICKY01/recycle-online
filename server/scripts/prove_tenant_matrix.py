"""H1 (ADVISOR-DECIDED 2026-10-23): the TENANT-ISOLATION ATTACK MATRIX, over real HTTP on a scratch.

Model on prove_owner_password.py: restore a SCRATCH from a live dump, start a child uvicorn on it,
provision TWO throwaway tenants by SQL (tenant, born-with branch, the three system roles, an owner,
an admin and a staff each -- per-run names and passwords, none printed), then build each tenant's
graph THROUGH THE API as its own owner, so every row attacked is a row the product produced.

WHAT IS ATTACKED, AND HOW THE LIST IS KEPT HONEST
  E1  every operation in /openapi.json is enumerated and printed. A route "takes a resource id" when
      it has a path parameter, a query parameter named *_id or `cursor`, a uuid-typed field anywhere
      in its request body, or a body string that names a row by secret or key (`token`, `*_token`,
      `idempotency_key`). EVERY such route must carry at least one matrix cell; one that
      does not is RED (COVERAGE) -- a route added tomorrow fails this proof until it is attacked.
  M*  per cell, tenant B's ADMIN and then tenant B's OWNER send the request naming tenant A's id
      (the owner as well because the admin lacks roles.manage, so the admin's 403 on that route
      would be a permission refusal and not isolation). A cell passes when:
        - the status is a refusal (4xx) -- or, for an OWN cell, a 2xx that wrote only into B;
        - the response body carries none of A's markers (A's ids, per-run names, id number,
          account number, idempotency keys, reservation tokens) other than strings B itself sent;
        - tenant A's rows in EVERY table holding a tenant_id (discovered from information_schema,
          count printed) are byte-equal before and after, read in Postgres as the migration role
          with an explicit `WHERE tenant_id = A` -- value against value, row_to_json text;
        - for a REFUSE cell tenant B's rows are byte-equal too (a refusal wrote nothing anywhere).
      Then A's OWN owner sends the valid form of the request (A-CONTROL): it must succeed, and for
      a write the same snapshot must now DIFFER -- the instrument that read "unchanged" is shown
      to see this very write. A read's control must carry A's marker, so the marker check is shown
      to find what it is looking for.
  A*  every id-free GET as B's admin: no A marker in the body.

THE POOLED CONNECTION -- the tenant context is `set_config('app.tenant_id', :t, true)` (is_local)
inside `tenant_connection`'s transaction (server/app/db.py), so Postgres discards it at that
transaction's COMMIT or ROLLBACK; the pool's reset-on-return is SQLAlchemy's default ROLLBACK.
  P1-P6 IN-PROCESS, through app.db.tenant_connection itself with its engine swapped for a ONE-
      connection pool (pool_size=1, max_overflow=0), pg_backend_pid read in every transaction so
      "the same physical connection" is measured, not assumed: A commits; A errors mid-transaction
      (1/0 after a read); then no-context and B on that same backend see no A context and no A row;
      A cancelled mid-statement; then no-context again.
  H0-H5 OVER HTTP against a SECOND child uvicorn whose engine is likewise one connection (this
      script re-executes itself with --serve-pool-one; application_name names the connection), with
      pg_stat_activity read before and after: A's /whoami, A's requests that fail inside their
      transaction (a duplicate-code INSERT, a foreign channel FK, a frozen-reason trigger), then B's
      /whoami reports B's context, B's lists carry no A marker, and an UNAUTHENTICATED login for
      tenant B with A's credentials is 401 -- all on the one backend pid. WHAT THIS BLOCK CAN AND
      CANNOT SEE (red team on a4bbd07, and the first disproof run agreed): every HTTP request sets
      its own tenant context at the top of its transaction before it reads anything, and the only
      no-context paths (clock_guard, the permission catalogue) read tables without RLS -- so no HTTP
      observable can show a context CARRIED from a previous transaction. The block proves that an
      errored request leaves the connection usable and the next one correctly scoped; that a
      context does not carry is P3's, in process, and only P3 reddens under the session-SET disproof.

THE DISPROOFS, RUN BY HAND (2026-10-23):
  - server/app/db.py: `set_config('app.tenant_id', :t, true)` -> `false` (a session-level SET).
    P3 goes red: the no-context transaction on the same backend still carries A and sees 178 rows.
    Every HTTP cell, the H block included, stays green -- by construction, as said above.
  - RLS off on one table in the scratch (`ALTER TABLE sellers NO FORCE ROW LEVEL SECURITY` and
    `DISABLE ROW LEVEL SECURITY`, as the owner, after provisioning). The sellers cells go red: B's
    PATCH of A's seller is 200 and A's row changed.
  - a cell removed from the matrix: E1 COVERAGE goes red naming the route.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from typing import Any
from urllib.parse import quote

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from lane import scratch_name  # noqa: E402  (scratch names are decided in lane.py only)
SCRATCH_DB = scratch_name("recycle_tenant_matrix_scratch")
RUN = uuid.uuid4().hex[:8]
POOL_ONE_APP_NAME = f"tenant-matrix-pool1-{RUN}"

BASE = ""
failures: list[str] = []
passes: list[str] = []
B_WROTE: set[str] = set()


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


def restore_scratch(live_name: str, scratch: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-matrix-dump-{RUN}")
    label = f"matrix-{RUN}"
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


def start_server(port: int, *, pool_one: bool) -> tuple[subprocess.Popen, Any]:
    log = tempfile.NamedTemporaryFile(mode="w", suffix=".log", prefix="prove_tenant_matrix_",
                                      delete=False, encoding="utf-8")
    if pool_one:
        argv = [sys.executable, "-u", os.path.abspath(__file__), "--serve-pool-one", str(port)]
    else:
        argv = [sys.executable, "-u", "-m", "uvicorn", "app.main:app",
                "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"]
    proc = subprocess.Popen(argv, cwd=SERVER_DIR, env=dict(os.environ), stdout=log,
                            stderr=subprocess.STDOUT)
    return proc, log


def stop_server(proc: subprocess.Popen, log: Any) -> None:
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


def wait_for_health(proc: subprocess.Popen, base: str, timeout: float = 40.0) -> str:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            return f"the uvicorn child exited with code {proc.returncode}"
        try:
            if httpx.get(f"{base}/health", timeout=2.0).status_code == 200:
                return ""
        except httpx.HTTPError:
            pass
        time.sleep(0.25)
    return "health never came up within the timeout"


def serve_pool_one(port: int) -> None:
    """The second child: today's app, its engine swapped for ONE pooled connection BEFORE app.main
    is imported (app.db.tenant_connection reads the module-level `engine` at call time, and main's
    lifespan disposes the same object). application_name lets pg_stat_activity name it."""
    import app.db as db
    from sqlalchemy.ext.asyncio import create_async_engine
    import uvicorn
    db.engine = create_async_engine(
        os.environ["APP_DATABASE_URL"], pool_size=1, max_overflow=0, pool_pre_ping=True,
        connect_args={"server_settings": {"application_name": os.environ["POOL_ONE_APP_NAME"]}})
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, log_level="warning")


# ---------------------------------------------------------------------------
# the route enumeration (E1)
# ---------------------------------------------------------------------------
def _is_handle_name(name: str) -> bool:
    """A body STRING that names a row it does not carry a uuid for: a reservation secret, an
    idempotency key. Red team on a4bbd07: POST /sellers took another shop's reservation token as a
    plain `str` and the uuid-only classifier did not ask for a cell on it."""
    return name == "token" or name.endswith("_token") or name == "idempotency_key"


def _has_uuid(schema: Any, comps: dict, seen: set[str]) -> bool:
    if isinstance(schema, dict):
        ref = schema.get("$ref")
        if ref:
            name = ref.split("/")[-1]
            if name in seen:
                return False
            return _has_uuid(comps[name], comps, seen | {name})
        if schema.get("format") == "uuid":
            return True
        if any(_is_handle_name(k) for k in schema.get("properties", {})):
            return True
        return any(_has_uuid(v, comps, seen) for v in schema.values())
    if isinstance(schema, list):
        return any(_has_uuid(v, comps, seen) for v in schema)
    return False


def enumerate_routes(spec: dict) -> tuple[list[str], set[str]]:
    comps = spec.get("components", {}).get("schemas", {})
    every: list[str] = []
    id_taking: set[str] = set()
    for path, ops in sorted(spec["paths"].items()):
        for method, op in ops.items():
            key = f"{method.upper()} {path}"
            every.append(key)
            params = op.get("parameters", [])
            if any(p.get("in") == "path" for p in params):
                id_taking.add(key)
            if any(p.get("in") == "query" and (p["name"].endswith("_id") or p["name"] == "cursor")
                   for p in params):
                id_taking.add(key)
            body = op.get("requestBody", {}).get("content", {}).get("application/json", {}).get("schema")
            if body is not None and _has_uuid(body, comps, set()):
                id_taking.add(key)
    return every, id_taking


# ---------------------------------------------------------------------------
# fixture: two tenants, provisioned by SQL as provision_shop.py does, then built through the API
# ---------------------------------------------------------------------------
ROLES = ("owner", "admin", "staff")


@dataclass
class Tenant:
    label: str
    id: uuid.UUID = field(default_factory=uuid.uuid4)
    users: dict[str, uuid.UUID] = field(default_factory=lambda: {r: uuid.uuid4() for r in ROLES})
    names: dict[str, str] = field(default_factory=dict)
    pw: dict[str, str] = field(default_factory=dict)
    tok: dict[str, str] = field(default_factory=dict)
    ids: dict[str, Any] = field(default_factory=dict)
    markers: set[str] = field(default_factory=set)

    def __post_init__(self) -> None:
        for r in ROLES:
            self.names[r] = f"{r}-{self.label.lower()}-{RUN}"
            self.pw[r] = f"pw-{r}-{self.label.lower()}-{RUN}"
        self.markers |= {str(self.id), f"{self.label}-{RUN}", *map(str, self.users.values()),
                         *self.names.values()}


async def provision(t: Tenant) -> None:
    from sqlalchemy import text
    from app.db import SYSTEM_ACTOR_ID, tenant_connection
    from app.permissions import seed_system_roles
    from app.security import hash_password

    async with tenant_connection(t.id, actor_id=SYSTEM_ACTOR_ID,
                                 actor_username="system:prove_tenant_matrix") as conn:
        await conn.execute(text("INSERT INTO tenants (id, name) VALUES (:id, :n)"),
                           {"id": t.id, "n": f"ร้าน {t.label}-{RUN}"})
        await conn.execute(
            text("INSERT INTO branches (tenant_id, code, name, doc_prefix, is_active)"
                 " VALUES (:t, 'MAIN', :n, 'B', true)"),
            {"t": t.id, "n": f"สาขา {t.label}-{RUN}"})
        roles = await seed_system_roles(conn, t.id)
        for r in ROLES:
            await conn.execute(
                text("INSERT INTO users (id, tenant_id, username, full_name, role_id,"
                     " password_hash) VALUES (:id, :t, :u, :fn, :r, :ph)"),
                {"id": t.users[r], "t": t.id, "u": t.names[r], "fn": f"{r} {t.label}-{RUN}",
                 "r": roles[r], "ph": await hash_password(t.pw[r])})


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def collect_uuids(value: Any, into: set[str]) -> None:
    if isinstance(value, dict):
        for v in value.values():
            collect_uuids(v, into)
    elif isinstance(value, list):
        for v in value:
            collect_uuids(v, into)
    elif isinstance(value, str):
        try:
            uuid.UUID(value)
        except ValueError:
            return
        into.add(value)


def bill_body(seller: str, product: str, **over: Any) -> dict:
    body = {"id": str(uuid.uuid4()), "seller_id": seller, "device_created_at": now_iso(),
            "idempotency_key": f"bill-{uuid.uuid4()}",
            "items": [{"id": str(uuid.uuid4()), "product_id": product, "line_no": 1,
                       "gross_weight": "12.000", "tare_weight": "2.000", "net_weight": "10.000",
                       "unit_price": "10.00"}]}
    item_over = over.pop("item", {})
    body["items"][0].update(item_over)
    body.update(over)
    return body


async def build_graph(client: httpx.AsyncClient, t: Tenant) -> None:
    """Every row through the API, as the tenant's own owner. Each step is checked: a fixture that
    did not build is an UNFIT run, never a matrix of refusals over ids that do not exist."""
    h = auth(t.tok["owner"])
    ids = t.ids
    L = f"{t.label}-{RUN}"

    async def call(method: str, path: str, body: Any = None, want: tuple[int, ...] = (200, 201)) -> dict:
        r = await client.request(method, path, headers=h, json=body)
        if r.status_code not in want:
            raise RuntimeError(f"fixture {t.label}: {method} {path} -> {r.status_code} {r.text[:300]}")
        out = r.json() if r.content else {}
        if t.label == "A":
            collect_uuids(out, t.markers)
        return out

    ids["branch"] = (await call("GET", "/shop"))["branch"]["id"]
    ids["tier"] = (await call("POST", "/grade-tiers", {"code": "A", "name": f"เกรด {L}"}))["id"]
    ids["uom"] = (await call("POST", "/uoms", {"code": "KG", "name": f"กิโล {L}"}))["id"]
    ids["cat"] = (await call("POST", "/product-categories", {"code": "FE", "name": f"เหล็ก {L}"}))["id"]
    ids["product"] = (await call("POST", "/products", {"code": "FE01", "name": f"เหล็กหนา {L}",
                                                        "category_id": ids["cat"], "uom_id": ids["uom"]}))["id"]
    await call("PUT", f"/products/{ids['product']}/prices/A", {"price": "10.00"})
    ids["id_number"] = f"{t.label}9{RUN}0000"
    seller = await call("POST", "/sellers", {"name": f"ผู้ขาย {L}", "phone": "0810000001",
                                             "id_number": ids["id_number"], "address": f"บ้าน {L}"})
    ids["seller"] = seller["id"]
    ids["account_no"] = f"77{int(RUN, 16) % 10**8:08d}{1 if t.label == 'A' else 2}"
    ids["channel"] = (await call("POST", "/shop/payment-channels", {
        "kind": "bank_account", "label": f"บัญชี {L}", "bank_code": "004",
        "account_no": ids["account_no"], "account_name": f"ชื่อบัญชี {L}"}))["id"]
    ids["shift1"] = str(uuid.uuid4())
    await call("POST", "/shifts", {"id": ids["shift1"], "opening_float": "500.00"})
    b1 = bill_body(ids["seller"], ids["product"])
    ids["bill1"], ids["bill1_key"], ids["bill1_item"] = b1["id"], b1["idempotency_key"], b1["items"][0]["id"]
    await call("POST", "/bills", b1)
    b2 = bill_body(ids["seller"], ids["product"])
    ids["bill2"] = b2["id"]
    await call("POST", "/bills", b2)
    # bill3 UNPAID: the counter separated for one bill, so a payment can be allocated to it.
    await call("PATCH", f"/branches/{ids['branch']}", {"separate_cashier": True})
    b3 = bill_body(ids["seller"], ids["product"])
    ids["bill3"] = b3["id"]
    await call("POST", "/bills", b3)
    await call("PATCH", f"/branches/{ids['branch']}", {"separate_cashier": False})
    ids["payment"], ids["payment_key"] = str(uuid.uuid4()), f"pay-{uuid.uuid4()}"
    await call("POST", "/payments", {"id": ids["payment"], "seller_id": ids["seller"], "method": "transfer",
                                     "amount": "50.00", "idempotency_key": ids["payment_key"],
                                     "device_created_at": now_iso(), "channel_id": ids["channel"],
                                     "allocations": []})
    # M2 (0029): a buyer, a sale with money received at the counter, so B has A's buyer, sale, line and receipt to aim at.
    ids["buyer"] = (await call("POST", "/buyers", {"name": f"ผู้ซื้อ {L}"}))["id"]
    ids["sale"], ids["sale_item"], ids["sale_key"] = str(uuid.uuid4()), str(uuid.uuid4()), f"sale-{uuid.uuid4()}"
    await call("POST", "/sales", {"id": ids["sale"], "buyer_id": ids["buyer"], "device_created_at": now_iso(),
                                  "idempotency_key": ids["sale_key"], "received_amount": "5.00",
                                  "items": [{"id": ids["sale_item"], "product_id": ids["product"], "line_no": 1,
                                             "gross_weight": "2.000", "tare_weight": "0.000", "net_weight": "2.000",
                                             "unit_price": "12.00"}]})
    ids["move"], ids["move_key"] = str(uuid.uuid4()), f"move-{uuid.uuid4()}"
    await call("POST", "/cash-movements", {"id": ids["move"], "kind": "expense", "amount": "20.00",
                                           "idempotency_key": ids["move_key"], "device_created_at": now_iso()})
    await call("POST", f"/shifts/{ids['shift1']}/close", {"counted_cash": "0.00"})
    if t.label == "A":
        # A keeps an OPEN shift for B to try to close; B has none, so B's id-collision open below
        # meets the primary key and nothing else.
        ids["shift2"] = str(uuid.uuid4())
        await call("POST", "/shifts", {"id": ids["shift2"], "opening_float": "100.00"})
    ids["user"] = (await call("POST", "/users", {"username": f"extra-{t.label.lower()}-{RUN}",
                                                 "full_name": f"พนักงาน {L}", "role": "staff",
                                                 "password": f"pw-extra-{RUN}-long"}))["user_id"]
    ids["device"] = str(uuid.uuid4())
    res = await call("POST", "/seller-code-reservations", {"device_id": ids["device"]})
    held = [(r["code"], r["token"]) for r in res.get("reservations", []) if r.get("token")]
    if len(held) < 2:
        raise RuntimeError(f"fixture {t.label}: the top-up held {len(held)} reservations, two are needed")
    ids["tokens"] = [tok for _, tok in held]
    # ONE reservation SPENT, the way a handset spends it -- so a cross-shop replay of a spent token
    # meets the arm that answers 200 with a seller row (master.py create_seller, `spent`).
    ids["res_spent"], ids["res_held"] = held[0], held[1]
    await call("POST", "/sellers", {"code": held[0][0], "reservation_token": held[0][1], "name": f"ผู้ขายจอง {L}"})
    roles = (await call("GET", "/roles"))["roles"]
    ids["roles"] = {r["code"]: r for r in roles}
    page = await call("GET", "/bills?limit=1")
    ids["cursor"] = page.get("next_cursor")
    if not ids["cursor"]:
        raise RuntimeError(f"fixture {t.label}: GET /bills?limit=1 over three bills returned no next_cursor")
    if t.label == "A":
        t.markers |= {ids["id_number"], ids["account_no"], ids["bill1_key"], ids["payment_key"],
                      ids["move_key"], ids["device"], *ids["tokens"], ids["sale_key"]}
        if ids["cursor"]:
            t.markers.add(ids["cursor"])


# ---------------------------------------------------------------------------
# Postgres, as the migration role: every tenant_id table, value against value
# ---------------------------------------------------------------------------
class Pg:
    def __init__(self, url: str) -> None:
        from sqlalchemy.ext.asyncio import create_async_engine
        from sqlalchemy.pool import NullPool
        self.engine = create_async_engine(url, poolclass=NullPool)
        self.tables: list[str] = []

    async def discover(self) -> None:
        from sqlalchemy import text
        async with self.engine.connect() as c:
            self.tables = list((await c.execute(text(
                "SELECT c.table_name FROM information_schema.columns c"
                " JOIN information_schema.tables t ON t.table_schema = c.table_schema"
                "  AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'"
                " WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'"
                " ORDER BY c.table_name"))).scalars().all())

    async def snapshot(self, tid: uuid.UUID, exclude: frozenset[str] = frozenset()) -> dict[str, list[str]]:
        from sqlalchemy import text
        out: dict[str, list[str]] = {}
        async with self.engine.connect() as c:
            async with c.begin():
                # FORCE RLS binds the owner too, so the context is set; the explicit WHERE makes the
                # read correct whether or not the role is RLS-bound.
                await c.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": str(tid)})
                out["tenants"] = list((await c.execute(text(
                    "SELECT row_to_json(x)::text FROM tenants x WHERE id = :t"), {"t": tid})).scalars().all())
                for tb in self.tables:
                    if tb in exclude:
                        continue
                    out[tb] = list((await c.execute(text(
                        f"SELECT row_to_json(x)::text AS j FROM {tb} x WHERE tenant_id = :t ORDER BY 1"),
                        {"t": tid})).scalars().all())
        return out

    async def scalar(self, sql: str, **params: Any) -> Any:
        from sqlalchemy import text
        async with self.engine.connect() as c:
            return (await c.execute(text(sql), params)).scalar()

    async def column(self, sql: str, **params: Any) -> list:
        from sqlalchemy import text
        async with self.engine.connect() as c:
            return list((await c.execute(text(sql), params)).scalars().all())


def diff(a: dict[str, list[str]], b: dict[str, list[str]]) -> list[str]:
    return sorted(t for t in set(a) | set(b) if a.get(t) != b.get(t))


def rows_in(s: dict[str, list[str]]) -> int:
    return sum(len(v) for v in s.values())


# ---------------------------------------------------------------------------
# the matrix
# ---------------------------------------------------------------------------
@dataclass
class Cell:
    route: str                       # "METHOD /spec/path", the coverage key
    label: str
    method: str
    url: str
    body: Any = None
    # refuse  -- a 4xx, nothing written in either tenant
    # filter  -- a list route given A's id as a FILTER: a 4xx, or a 2xx whose `empty` list is empty
    # collide -- B reuses A's client-minted primary key: a 4xx, or the 500 OPEN_ITEMS records (the
    #            key is global, the INSERT meets A's row, the handler re-raises); nothing written
    # own     -- B reuses one of A's free-text keys: a 2xx that wrote only into B
    kind: str = "refuse"
    empty: str = ""
    control: tuple | None = None     # (method, url, body, wanted statuses, "write" | "read" | "compute")
    exclude: frozenset[str] = frozenset()
    attackers: tuple[str, ...] = ("admin", "owner")
    anon: bool = False               # sent with no token (login)


@dataclass
class Row:
    route: str
    label: str
    statuses: dict[str, int]
    a_same: bool
    b_same: bool | None
    control: str


def leaked(text_body: str, markers: set[str], sent: str) -> list[str]:
    return sorted(m for m in markers if m and m in text_body and m not in sent)


def build_cells(A: Tenant, B: Tenant) -> list[Cell]:
    a, b = A.ids, B.ids
    staff_perms = sorted(set(a["roles"]["staff"]["permissions"]) | {"money.view_own"})
    cells: list[Cell] = [
        # --- bills
        Cell("GET /bills/{bill_id}", "read A's bill", "GET", f"/bills/{a['bill1']}",
             control=("GET", f"/bills/{a['bill1']}", None, (200,), "read")),
        Cell("GET /bills", "list bills filtered by A's seller", "GET", f"/bills?seller_id={a['seller']}",
             kind="filter", empty="bills",
             control=("GET", f"/bills?seller_id={a['seller']}", None, (200,), "read")),
        # A keyset position, not a row: B may legitimately list its OWN older bills after it. What must
        # not appear is an A row, and every A row carries its id, which is a marker.
        Cell("GET /bills", "page bills with A's cursor", "GET", f"/bills?limit=1&cursor={quote(a['cursor'], safe='')}",
             kind="filter",
             control=("GET", f"/bills?limit=1&cursor={quote(a['cursor'], safe='')}", None, (200,), "read")),
        Cell("POST /bills/{bill_id}/void", "void A's bill", "POST", f"/bills/{a['bill2']}/void",
             {"reason": f"attack {RUN}"},
             control=("POST", f"/bills/{a['bill2']}/void", {"reason": f"control {RUN}"}, (200,), "write")),
        Cell("POST /bills", "bill for A's seller", "POST", "/bills", bill_body(a["seller"], b["product"]),
             control=("POST", "/bills", bill_body(a["seller"], a["product"]), (201,), "write")),
        Cell("POST /bills", "bill with A's product", "POST", "/bills", bill_body(b["seller"], a["product"])),
        Cell("POST /bills", "bill into A's branch", "POST", "/bills",
             bill_body(b["seller"], b["product"], branch_id=a["branch"])),
        Cell("POST /bills", "bill reusing A's bill id", "POST", "/bills",
             bill_body(b["seller"], b["product"], id=a["bill1"]), kind="collide"),
        Cell("POST /bills", "bill reusing A's line id", "POST", "/bills",
             bill_body(b["seller"], b["product"], item={"id": a["bill1_item"]}), kind="collide"),
        Cell("POST /bills", "bill reusing A's idempotency key (OWN)", "POST", "/bills",
             bill_body(b["seller"], b["product"], idempotency_key=a["bill1_key"]), kind="own",
             attackers=("admin",)),
        # --- payments
        Cell("POST /payments", "payment to A's seller", "POST", "/payments",
             {"id": str(uuid.uuid4()), "seller_id": a["seller"], "method": "cash", "amount": "5.00",
              "idempotency_key": f"x-{uuid.uuid4()}", "device_created_at": now_iso(), "allocations": []}),
        Cell("POST /payments", "payment allocated to A's bill", "POST", "/payments",
             {"id": str(uuid.uuid4()), "seller_id": b["seller"], "method": "cash", "amount": "5.00",
              "idempotency_key": f"x-{uuid.uuid4()}", "device_created_at": now_iso(),
              "allocations": [{"bill_id": a["bill3"], "amount": "5.00"}]},
             control=("POST", "/payments",
                      {"id": str(uuid.uuid4()), "seller_id": a["seller"], "method": "cash", "amount": "5.00",
                       "idempotency_key": f"c-{uuid.uuid4()}", "device_created_at": now_iso(),
                       "allocations": [{"bill_id": a["bill3"], "amount": "5.00"}]}, (201,), "write")),
        Cell("POST /payments", "payment through A's channel", "POST", "/payments",
             {"id": str(uuid.uuid4()), "seller_id": b["seller"], "method": "transfer", "amount": "5.00",
              "idempotency_key": f"x-{uuid.uuid4()}", "device_created_at": now_iso(),
              "channel_id": a["channel"], "allocations": []}),
        Cell("POST /payments", "payment into A's branch", "POST", "/payments",
             {"id": str(uuid.uuid4()), "seller_id": b["seller"], "method": "cash", "amount": "5.00",
              "idempotency_key": f"x-{uuid.uuid4()}", "device_created_at": now_iso(),
              "branch_id": a["branch"], "allocations": []}),
        Cell("POST /payments", "payment reusing A's payment id", "POST", "/payments",
             {"id": a["payment"], "seller_id": b["seller"], "method": "cash", "amount": "5.00",
              "idempotency_key": f"x-{uuid.uuid4()}", "device_created_at": now_iso(), "allocations": []},
             kind="collide"),
        Cell("POST /payments", "payment reusing A's idempotency key (OWN)", "POST", "/payments",
             {"id": str(uuid.uuid4()), "seller_id": b["seller"], "method": "cash", "amount": "5.00",
              "idempotency_key": a["payment_key"], "device_created_at": now_iso(), "allocations": []},
             kind="own", attackers=("admin",)),
        # --- shifts and the drawer
        Cell("GET /shifts/current", "current shift of A's branch", "GET", f"/shifts/current?branch_id={a['branch']}",
             control=("GET", f"/shifts/current?branch_id={a['branch']}", None, (200,), "read")),
        Cell("GET /cash-movements", "movements of A's shift", "GET", f"/cash-movements?shift_id={a['shift1']}",
             kind="filter", empty="movements", control=("GET", f"/cash-movements?shift_id={a['shift1']}", None, (200,), "read")),
        Cell("PATCH /shifts/{shift_id}", "reason on A's closed shift", "PATCH", f"/shifts/{a['shift1']}",
             {"variance_reason": f"attack {RUN}"},
             control=("PATCH", f"/shifts/{a['shift1']}", {"variance_reason": f"control {RUN}"}, (200,), "write")),
        Cell("POST /shifts", "open a shift in A's branch", "POST", "/shifts",
             {"id": str(uuid.uuid4()), "opening_float": "1.00", "branch_id": a["branch"]}),
        Cell("POST /shifts", "open a shift reusing A's shift id", "POST", "/shifts",
             {"id": a["shift1"], "opening_float": "1.00"}, kind="collide"),
        Cell("POST /cash-movements", "movement into A's branch", "POST", "/cash-movements",
             {"id": str(uuid.uuid4()), "kind": "expense", "amount": "1.00", "idempotency_key": f"x-{uuid.uuid4()}",
              "device_created_at": now_iso(), "branch_id": a["branch"]}),
        Cell("POST /cash-movements", "movement reusing A's movement id", "POST", "/cash-movements",
             {"id": a["move"], "kind": "expense", "amount": "1.00", "idempotency_key": f"x-{uuid.uuid4()}",
              "device_created_at": now_iso()}, kind="collide"),
        Cell("POST /cash-movements", "movement reusing A's idempotency key (OWN)", "POST", "/cash-movements",
             {"id": str(uuid.uuid4()), "kind": "expense", "amount": "1.00", "idempotency_key": a["move_key"],
              "device_created_at": now_iso()}, kind="own", attackers=("admin",)),
        Cell("POST /shifts/{shift_id}/close", "close A's open shift", "POST", f"/shifts/{a['shift2']}/close",
             {"counted_cash": "100.00"},
             control=("POST", f"/shifts/{a['shift2']}/close", {"counted_cash": "100.00"}, (200,), "write")),
        # --- branches and channels
        Cell("PATCH /branches/{branch_id}", "A's branch policy", "PATCH", f"/branches/{a['branch']}",
             {"shifts_enabled": True},
             control=("PATCH", f"/branches/{a['branch']}", {"shifts_enabled": True}, (200,), "write")),
        Cell("PUT /branches/{branch_id}/payment-methods/{method}", "A's branch methods", "PUT",
             f"/branches/{a['branch']}/payment-methods/promptpay", {"is_active": False},
             control=("PUT", f"/branches/{a['branch']}/payment-methods/promptpay", {"is_active": False},
                      (200,), "write")),
        Cell("PATCH /shop/payment-channels/{channel_id}", "rename A's channel", "PATCH",
             f"/shop/payment-channels/{a['channel']}", {"label": f"attack {RUN}"},
             control=("PATCH", f"/shop/payment-channels/{a['channel']}", {"label": f"control {RUN}"},
                      (200,), "write")),
        Cell("POST /shop/payment-channels", "channel in A's branch", "POST", "/shop/payment-channels",
             {"kind": "promptpay", "label": f"x {RUN}", "branch_id": a["branch"], "promptpay_proxy": "0811111111",
              "promptpay_proxy_type": "phone"}),
        # --- M2 (0029): buyers, sales, money in, stock
        Cell("PATCH /buyers/{buyer_id}", "edit A's buyer", "PATCH", f"/buyers/{a['buyer']}", {"note": f"attack {RUN}"},
             control=("PATCH", f"/buyers/{a['buyer']}", {"note": f"control {RUN}"}, (200,), "write")),
        Cell("POST /buyers/{buyer_id}/deactivate", "retire A's buyer", "POST", f"/buyers/{a['buyer']}/deactivate",
             control=("POST", f"/buyers/{a['buyer']}/deactivate", None, (200,), "write")),
        Cell("POST /buyers/{buyer_id}/activate", "restore A's buyer", "POST", f"/buyers/{a['buyer']}/activate",
             control=("POST", f"/buyers/{a['buyer']}/activate", None, (200,), "write")),
        Cell("GET /sales/{sale_id}", "read A's sale", "GET", f"/sales/{a['sale']}",
             control=("GET", f"/sales/{a['sale']}", None, (200,), "read")),
        Cell("GET /sales", "list sales filtered by A's buyer", "GET", f"/sales?buyer_id={a['buyer']}",
             kind="filter", empty="sales", control=("GET", f"/sales?buyer_id={a['buyer']}", None, (200,), "read")),
        Cell("POST /sales", "sale to A's buyer", "POST", "/sales",
             {"id": str(uuid.uuid4()), "buyer_id": a["buyer"], "device_created_at": now_iso(),
              "idempotency_key": f"x-{uuid.uuid4()}",
              "items": [{"id": str(uuid.uuid4()), "product_id": b["product"], "line_no": 1, "gross_weight": "1.000",
                         "tare_weight": "0.000", "net_weight": "1.000", "unit_price": "1.00"}]}),
        Cell("POST /sales", "sale of A's product", "POST", "/sales",
             {"id": str(uuid.uuid4()), "buyer_id": b["buyer"], "device_created_at": now_iso(),
              "idempotency_key": f"x-{uuid.uuid4()}",
              "items": [{"id": str(uuid.uuid4()), "product_id": a["product"], "line_no": 1, "gross_weight": "1.000",
                         "tare_weight": "0.000", "net_weight": "1.000", "unit_price": "1.00"}]}),
        Cell("POST /sales", "sale into A's branch", "POST", "/sales",
             {"id": str(uuid.uuid4()), "buyer_id": b["buyer"], "device_created_at": now_iso(), "branch_id": a["branch"],
              "idempotency_key": f"x-{uuid.uuid4()}",
              "items": [{"id": str(uuid.uuid4()), "product_id": b["product"], "line_no": 1, "gross_weight": "1.000",
                         "tare_weight": "0.000", "net_weight": "1.000", "unit_price": "1.00"}]}),
        Cell("POST /sales", "sale reusing A's sale id", "POST", "/sales",
             {"id": a["sale"], "buyer_id": b["buyer"], "device_created_at": now_iso(), "idempotency_key": f"x-{uuid.uuid4()}",
              "items": [{"id": str(uuid.uuid4()), "product_id": b["product"], "line_no": 1, "gross_weight": "1.000",
                         "tare_weight": "0.000", "net_weight": "1.000", "unit_price": "1.00"}]}, kind="collide"),
        Cell("POST /sales", "sale reusing A's line id", "POST", "/sales",
             {"id": str(uuid.uuid4()), "buyer_id": b["buyer"], "device_created_at": now_iso(),
              "idempotency_key": f"x-{uuid.uuid4()}",
              "items": [{"id": a["sale_item"], "product_id": b["product"], "line_no": 1, "gross_weight": "1.000",
                         "tare_weight": "0.000", "net_weight": "1.000", "unit_price": "1.00"}]}, kind="collide"),
        Cell("POST /sales", "sale reusing A's idempotency key (OWN)", "POST", "/sales",
             {"id": str(uuid.uuid4()), "buyer_id": b["buyer"], "device_created_at": now_iso(),
              "idempotency_key": a["sale_key"],
              "items": [{"id": str(uuid.uuid4()), "product_id": b["product"], "line_no": 1, "gross_weight": "1.000",
                         "tare_weight": "0.000", "net_weight": "1.000", "unit_price": "1.00"}]},
             kind="own", attackers=("admin",)),
        Cell("POST /sales/quote", "quote of A's product", "POST", "/sales/quote",
             {"items": [{"id": str(uuid.uuid4()), "product_id": a["product"], "line_no": 1, "gross_weight": "1.000",
                         "tare_weight": "0.000", "net_weight": "1.000", "unit_price": "1.00"}]},
             control=("POST", "/sales/quote",
                      {"items": [{"id": str(uuid.uuid4()), "product_id": a["product"], "line_no": 1, "gross_weight": "1.000",
                                  "tare_weight": "0.000", "net_weight": "1.000", "unit_price": "1.00"}]}, (200,), "compute")),
        Cell("POST /sale-receipts", "receipt allocated to A's sale", "POST", "/sale-receipts",
             {"id": str(uuid.uuid4()), "buyer_id": b["buyer"], "method": "cash", "amount": "1.00",
              "idempotency_key": f"x-{uuid.uuid4()}", "device_created_at": now_iso(),
              "allocations": [{"bill_id": a["sale"], "amount": "1.00"}]},
             control=("POST", "/sale-receipts",
                      {"id": str(uuid.uuid4()), "buyer_id": a["buyer"], "method": "cash", "amount": "1.00",
                       "idempotency_key": f"c-{uuid.uuid4()}", "device_created_at": now_iso(),
                       "allocations": [{"bill_id": a["sale"], "amount": "1.00"}]}, (201,), "write")),
        Cell("POST /sale-receipts", "receipt from A's buyer", "POST", "/sale-receipts",
             {"id": str(uuid.uuid4()), "buyer_id": a["buyer"], "method": "cash", "amount": "1.00",
              "idempotency_key": f"x-{uuid.uuid4()}", "device_created_at": now_iso(), "allocations": []}),
        Cell("GET /sale-receipts", "receipts of A's buyer", "GET", f"/sale-receipts?buyer_id={a['buyer']}",
             kind="filter", empty="receipts",
             control=("GET", f"/sale-receipts?buyer_id={a['buyer']}", None, (200,), "read")),
        # BEFORE the void below: a voided sale leaves the report, and A's control must still find A's buyer in it.
        # by=buyer: the rows are keyed by buyer id, so A's own control carries A's marker (by=day would not).
        Cell("GET /reports/sales", "sales report filtered by A's buyer", "GET",
             f"/reports/sales?from_date=2000-01-01&to_date=2100-01-01&by=buyer&buyer_id={a['buyer']}",
             kind="filter", empty="rows",
             control=("GET", f"/reports/sales?from_date=2000-01-01&to_date=2100-01-01&by=buyer&buyer_id={a['buyer']}",
                      None, (200,), "read")),
        Cell("POST /sales/{sale_id}/void", "void A's sale", "POST", f"/sales/{a['sale']}/void", {"reason": f"attack {RUN}"},
             control=("POST", f"/sales/{a['sale']}/void", {"reason": f"control {RUN}"}, (200,), "write")),
        Cell("GET /stock", "stock of A's branch", "GET", f"/stock?branch_id={a['branch']}",
             control=("GET", f"/stock?branch_id={a['branch']}", None, (200,), "read")),
        Cell("GET /stock/movements", "movements of A's product", "GET", f"/stock/movements?product_id={a['product']}",
             kind="filter", empty="movements",
             control=("GET", f"/stock/movements?product_id={a['product']}", None, (200,), "read")),
        Cell("POST /stock/adjustments", "adjust A's product", "POST", "/stock/adjustments",
             {"product_id": a["product"], "quantity": "1.000", "reason": f"attack {RUN}",
              "idempotency_key": f"x-{uuid.uuid4()}", "device_created_at": now_iso()}),
        Cell("POST /stock/adjustments", "adjust in A's branch", "POST", "/stock/adjustments",
             {"product_id": b["product"], "quantity": "1.000", "reason": f"attack {RUN}", "branch_id": a["branch"],
              "idempotency_key": f"x-{uuid.uuid4()}", "device_created_at": now_iso()}),
        Cell("PUT /products/{product_id}/sell-price", "re-price A's product for sale", "PUT",
             f"/products/{a['product']}/sell-price", {"price": "99.00"},
             control=("PUT", f"/products/{a['product']}/sell-price", {"price": "11.00"}, (200,), "write")),
        Cell("POST /buyers", "buyer reusing A's buyer id", "POST", "/buyers", {"id": a["buyer"], "name": f"x {RUN}"},
             kind="collide"),
        # --- master data
        Cell("PATCH /uoms/{uom_id}", "rename A's unit", "PATCH", f"/uoms/{a['uom']}", {"name": f"attack {RUN}"},
             control=("PATCH", f"/uoms/{a['uom']}", {"name": f"control {RUN}"}, (200,), "write")),
        Cell("POST /uoms/{uom_id}/deactivate", "retire A's unit", "POST", f"/uoms/{a['uom']}/deactivate",
             control=("POST", f"/uoms/{a['uom']}/deactivate", None, (200,), "write")),
        Cell("POST /uoms/{uom_id}/activate", "restore A's unit", "POST", f"/uoms/{a['uom']}/activate",
             control=("POST", f"/uoms/{a['uom']}/activate", None, (200,), "write")),
        Cell("PATCH /product-categories/{category_id}", "rename A's category", "PATCH",
             f"/product-categories/{a['cat']}", {"name": f"attack {RUN}"},
             control=("PATCH", f"/product-categories/{a['cat']}", {"name": f"control {RUN}"}, (200,), "write")),
        Cell("POST /product-categories/{category_id}/deactivate", "retire A's category", "POST",
             f"/product-categories/{a['cat']}/deactivate",
             control=("POST", f"/product-categories/{a['cat']}/deactivate", None, (200,), "write")),
        Cell("POST /product-categories/{category_id}/activate", "restore A's category", "POST",
             f"/product-categories/{a['cat']}/activate",
             control=("POST", f"/product-categories/{a['cat']}/activate", None, (200,), "write")),
        Cell("PATCH /products/{product_id}", "rename A's product", "PATCH", f"/products/{a['product']}",
             {"name": f"attack {RUN}"},
             control=("PATCH", f"/products/{a['product']}", {"name": f"control {RUN}"}, (200,), "write")),
        Cell("PATCH /products/{product_id}", "move B's product into A's category", "PATCH",
             f"/products/{b['product']}", {"category_id": a["cat"]}),
        Cell("POST /products", "product in A's category and unit", "POST", "/products",
             {"code": f"X{RUN[:4].upper()}", "name": f"x {RUN}", "category_id": a["cat"], "uom_id": a["uom"]}),
        Cell("POST /products/{product_id}/deactivate", "retire A's product", "POST",
             f"/products/{a['product']}/deactivate",
             control=("POST", f"/products/{a['product']}/deactivate", None, (200,), "write")),
        Cell("POST /products/{product_id}/activate", "restore A's product", "POST",
             f"/products/{a['product']}/activate",
             control=("POST", f"/products/{a['product']}/activate", None, (200,), "write")),
        Cell("PUT /products/{product_id}/prices/{grade}", "re-price A's product", "PUT",
             f"/products/{a['product']}/prices/A", {"price": "99.00"},
             control=("PUT", f"/products/{a['product']}/prices/A", {"price": "11.00"}, (200,), "write")),
        Cell("PATCH /grade-tiers/{tier_id}", "rename A's tier", "PATCH", f"/grade-tiers/{a['tier']}",
             {"name": f"attack {RUN}"},
             control=("PATCH", f"/grade-tiers/{a['tier']}", {"name": f"control {RUN}"}, (200,), "write")),
        Cell("PUT /grade-tiers/order", "order naming A's tier", "PUT", "/grade-tiers/order",
             {"order": [b["tier"], a["tier"]]},
             control=("PUT", "/grade-tiers/order", {"order": [a["tier"]]}, (200,), "read")),
        Cell("PATCH /sellers/{seller_id}", "edit A's seller", "PATCH", f"/sellers/{a['seller']}",
             {"name": f"attack {RUN}"},
             control=("PATCH", f"/sellers/{a['seller']}", {"name": f"ผู้ขาย A-{RUN} ctl"}, (200,), "write")),
        Cell("PATCH /sellers/{seller_id}", "erase A's seller's ID number", "PATCH", f"/sellers/{a['seller']}",
             {"id_number": None}),
        Cell("POST /sellers/{seller_id}/deactivate", "retire A's seller", "POST",
             f"/sellers/{a['seller']}/deactivate",
             control=("POST", f"/sellers/{a['seller']}/deactivate", None, (200,), "write")),
        Cell("POST /sellers/{seller_id}/activate", "restore A's seller", "POST",
             f"/sellers/{a['seller']}/activate",
             control=("POST", f"/sellers/{a['seller']}/activate", None, (200,), "write")),
        Cell("GET /sellers/{seller_id}/history", "A's seller's history", "GET",
             f"/sellers/{a['seller']}/history",
             control=("GET", f"/sellers/{a['seller']}/history", None, (200,), "read")),
        # Controls: A's own owner reaches BOTH arms with the same bodies -- the held one spends (201, a
        # write the snapshot sees), the spent one replays (200 with A's seller row, carrying its id).
        Cell("POST /sellers", "spend A's HELD reservation (its code + token)", "POST", "/sellers",
             {"code": a["res_held"][0], "reservation_token": a["res_held"][1], "name": f"x {RUN}"},
             control=("POST", "/sellers", {"code": a["res_held"][0], "reservation_token": a["res_held"][1],
                                           "name": f"ผู้ขายจองสอง A-{RUN}"}, (201,), "write")),
        Cell("POST /sellers", "replay A's SPENT reservation (its code + token)", "POST", "/sellers",
             {"code": a["res_spent"][0], "reservation_token": a["res_spent"][1], "name": f"x {RUN}"},
             control=("POST", "/sellers", {"code": a["res_spent"][0], "reservation_token": a["res_spent"][1],
                                           "name": f"x {RUN}"}, (200,), "read")),
        Cell("POST /seller-code-reservations", "top up A's device (OWN)", "POST", "/seller-code-reservations",
             {"device_id": a["device"]}, kind="own", attackers=("admin",)),
        # --- people and roles
        Cell("POST /users/{user_id}/revoke-sessions", "end A's user's sessions", "POST",
             f"/users/{a['user']}/revoke-sessions",
             control=("POST", f"/users/{a['user']}/revoke-sessions", None, (200,), "write")),
        Cell("POST /users/{user_id}/password", "set A's user's password", "POST", f"/users/{a['user']}/password",
             {"new_password": f"attack-{RUN}-long"},
             control=("POST", f"/users/{a['user']}/password", {"new_password": f"control-{RUN}-long"},
                      (200,), "write")),
        Cell("POST /users/{user_id}/unlock-login", "unlock A's user", "POST", f"/users/{a['user']}/unlock-login",
             control=("POST", f"/users/{a['user']}/unlock-login", None, (200,), "write")),
        Cell("POST /users/{user_id}/deactivate", "deactivate A's user", "POST", f"/users/{a['user']}/deactivate",
             control=("POST", f"/users/{a['user']}/deactivate", None, (200,), "write")),
        Cell("POST /users/{user_id}/activate", "activate A's user", "POST", f"/users/{a['user']}/activate",
             control=("POST", f"/users/{a['user']}/activate", None, (200,), "write")),
        Cell("POST /users/{user_id}/deactivate", "deactivate A's OWNER", "POST",
             f"/users/{A.users['owner']}/deactivate"),
        Cell("PUT /roles/{role_id}/permissions", "re-grant A's staff role", "PUT",
             f"/roles/{a['roles']['staff']['id']}/permissions", {"permissions": staff_perms},
             control=("PUT", f"/roles/{a['roles']['staff']['id']}/permissions", {"permissions": staff_perms},
                      (200,), "write")),
        # --- sign-in: the identity claim itself (no token)
        # A FAILED SIGN-IN IS RECORDED, BY DESIGN, UNDER THE SHOP THE REQUEST NAMED (migration 0016,
        # login_guard.record_failed_attempt) -- so these cells are not "nothing written": they assert
        # the exact write (one failed_login_attempts row, in the NAMED shop, the submitted username,
        # never the password) and nothing anywhere else. Red team on a4bbd07 found the first version
        # excluding that table and printing "nothing was written anywhere" over the rows.
        Cell("POST /auth/login", "B's admin signing in to A", "POST", "/auth/login",
             {"tenant_id": str(A.id), "username": B.names["admin"], "password": B.pw["admin"]},
             kind="login", anon=True, attackers=("anon",)),
        Cell("POST /auth/login", "A's owner's credentials under B", "POST", "/auth/login",
             {"tenant_id": str(B.id), "username": A.names["owner"], "password": A.pw["owner"]},
             kind="login", anon=True, attackers=("anon",)),
    ]
    return cells


async def run_matrix(client: httpx.AsyncClient, pg: Pg, A: Tenant, B: Tenant, cells: list[Cell]) -> list[Row]:
    rows: list[Row] = []
    for c in cells:
        sent = c.url + json.dumps(c.body, ensure_ascii=False)
        before_a = await pg.snapshot(A.id, c.exclude)
        before_b = await pg.snapshot(B.id, c.exclude)
        statuses: dict[str, int] = {}
        bodies: list[str] = []
        for who in c.attackers:
            headers = {} if who == "anon" else auth(B.tok[who])
            r = await client.request(c.method, c.url, headers=headers, json=c.body)
            statuses[who] = r.status_code
            bodies.append(r.text)
        after_a = await pg.snapshot(A.id, c.exclude)
        after_b = await pg.snapshot(B.id, c.exclude)
        a_same = not diff(before_a, after_a)
        b_same = not diff(before_b, after_b)
        leaks = sorted({m for body in bodies for m in leaked(body, A.markers, sent)})
        tag = f"{c.route} -- {c.label}"
        if c.kind == "login":
            named_a = c.body["tenant_id"] == str(A.id)
            before_n, after_n = (before_a, after_a) if named_a else (before_b, after_b)
            before_o, after_o = (before_b, after_b) if named_a else (before_a, after_a)
            added = sorted(set(after_n.get("failed_login_attempts", [])) - set(before_n.get("failed_login_attempts", [])))
            shape = (diff(before_n, after_n) == ["failed_login_attempts"] and len(added) == 1
                     and f'"{c.body["username"]}"' in added[0] and c.body["password"] not in added[0])
            check(all(s == 401 for s in statuses.values()), f"{tag}: refused {statuses}")
            check(shape, f"{tag}: the ONLY write is one failed_login_attempts row in the NAMED shop"
                         f" ({'A' if named_a else 'B'}), carrying the submitted username and not the password"
                         f" (changed {diff(before_n, after_n)}, rows added {len(added)})")
            check(not diff(before_o, after_o), f"{tag}: the OTHER shop's {rows_in(before_o)} rows are value-equal"
                                               + (f" -- CHANGED {diff(before_o, after_o)}" if diff(before_o, after_o) else ""))
            leaks = sorted({m for body in bodies for m in leaked(body, A.markers, sent)})
            check(not leaks, f"{tag}: no A marker in the responses")
            # In the table: A= reads "the shop-side outcome is exactly the designed one" for a login cell.
            rows.append(Row(c.route, c.label, statuses, shape and not diff(before_o, after_o), None, "-"))
            continue
        if c.kind == "own":
            ok_status = all(200 <= s < 300 for s in statuses.values())
            check(ok_status, f"{tag}: B's own write succeeded {statuses}")
            B_WROTE.update(m for m in A.markers if m in sent)
        else:
            if c.kind == "filter" and c.empty:
                listed = []
                for body in bodies:
                    try:
                        listed.append(len(json.loads(body).get(c.empty, [None])))
                    except (ValueError, AttributeError):
                        listed.append(-1)
                ok_status = all((400 <= s < 500) or (200 <= s < 300 and n == 0)
                                for s, n in zip(statuses.values(), listed))
                check(ok_status, f"{tag}: refused or EMPTY {statuses} ({c.empty} listed: {listed})")
            elif c.kind == "filter":
                ok_status = all(s < 500 for s in statuses.values())
                check(ok_status, f"{tag}: answered {statuses} -- no A row may appear (the marker check below)")
            elif c.kind == "collide":
                ok_status = all(400 <= s < 500 or s == 500 for s in statuses.values())
                check(ok_status, f"{tag}: refused {statuses}"
                                 + (" -- the 500 is the global-primary-key collision OPEN_ITEMS records"
                                    if 500 in statuses.values() else ""))
            else:
                ok_status = all(400 <= s < 500 for s in statuses.values())
                check(ok_status, f"{tag}: refused {statuses}")
            check(b_same, f"{tag}: tenant B's rows unchanged too (nothing was written anywhere)"
                          + ("" if b_same else f" -- CHANGED {diff(before_b, after_b)}"))
        check(a_same, f"{tag}: tenant A's {rows_in(before_a)} rows in {len(before_a)} tables are value-equal"
                      " before and after" + ("" if a_same else f" -- CHANGED {diff(before_a, after_a)}"))
        check(not leaks, f"{tag}: no A marker in B's responses" + (f" -- LEAKED {leaks[:4]}" if leaks else ""))
        ctl = "-"
        if c.control:
            m, url, body, want, what = c.control
            r = await client.request(m, url, headers=auth(A.tok["owner"]), json=body)
            after_ctl = await pg.snapshot(A.id, c.exclude)
            if what == "write":
                seen = bool(diff(after_a, after_ctl))
                check(r.status_code in want and seen,
                      f"{tag}: A-CONTROL {m} by A's owner is {r.status_code} and the snapshot SEES it"
                      f" ({diff(after_a, after_ctl)})")
            elif what == "compute":
                # A computation (POST /sales/quote) answers with arithmetic on the caller's own input: no row to
                # see, no secret to carry. Its control is that A's owner is ANSWERED -- so B's refusal is the
                # tenancy, not a malformed body -- and that the answer wrote nothing.
                still = not diff(after_a, after_ctl)
                check(r.status_code in want and still,
                      f"{tag}: A-CONTROL {m} by A's owner is {r.status_code} and writes nothing"
                      f" ({diff(after_a, after_ctl) or 'no change'})")
            else:
                found = any(mk in r.text for mk in A.markers)
                check(r.status_code in want and found,
                      f"{tag}: A-CONTROL {m} by A's owner is {r.status_code} and carries A's marker")
            ctl = str(r.status_code)
        rows.append(Row(c.route, c.label, statuses, a_same, None if c.kind == "own" else b_same, ctl))
    return rows


AMBIENT = ["/bills", "/payments", "/sellers?include_inactive=true", "/products?include_inactive=true",
           "/uoms?include_inactive=true", "/product-categories?include_inactive=true",
           "/grade-tiers?include_inactive=true", "/users?include_inactive=true", "/roles", "/shop",
           "/shop/policy", "/shop/payment-channels", "/whoami", "/shifts/current"]


async def run_ambient(client: httpx.AsyncClient, A: Tenant, B: Tenant) -> None:
    today = date.today().isoformat()
    # B OPENS A SHIFT FIRST, so /shifts/current answers a shift rather than 404 -- and every ambient
    # read must be a 2xx: a refusal body carries no marker by construction, so a 4xx here would be a
    # green that inspected nothing (red team on a4bbd07: /reports/summary was a 422 for a missing
    # `by`, /shifts/current a 404). The summary is read BY PRODUCT: its rows are keyed by product id,
    # which is a marker, so an aggregate mixing A's purchases into B's would name A's product.
    r = await client.post("/shifts", headers=auth(B.tok["owner"]), json={"id": str(uuid.uuid4()), "opening_float": "1.00"})
    check(r.status_code == 201, f"AMBIENT setup: B opens a shift ({r.status_code})")
    reports = [f"/reports/daily?date={today}", f"/reports/summary?from_date={today}&to_date={today}&by=product"]
    # A free-text key B ITSELF wrote in an OWN cell (A's idempotency key, reused) is B's own data
    # now, so it is exempt here; A's row ids stay markers, and they would name a leaked A row.
    for path in AMBIENT + reports:
        r = await client.get(path, headers=auth(B.tok["admin"]))
        leaks = leaked(r.text, A.markers - B_WROTE, path)
        check(200 <= r.status_code < 300 and not leaks,
              f"AMBIENT GET {path} as B's admin: {r.status_code}, no A marker"
              + (f" -- LEAKED {leaks[:4]}" if leaks else ""))
    for path in ("/sellers", reports[1]):
        r = await client.get(path, headers=auth(A.tok["owner"]))
        check(r.status_code == 200 and any(m in r.text for m in (A.ids["seller"], A.ids["product"])),
              f"AMBIENT control: A's own GET {path} carries A's id (the marker check finds what it looks for)")


# ---------------------------------------------------------------------------
# pooled connections
# ---------------------------------------------------------------------------
async def pooled_in_process(pg: Pg, A: Tenant, B: Tenant) -> None:
    from sqlalchemy import text
    from sqlalchemy.exc import DBAPIError
    from sqlalchemy.ext.asyncio import create_async_engine
    import app.db as db

    header("P  POOLED CONNECTION, in process: app.db.tenant_connection over ONE pooled connection")
    original = db.engine
    one = create_async_engine(os.environ["APP_DATABASE_URL"], pool_size=1, max_overflow=0)
    db.engine = one
    guc_sql = text("SELECT pg_backend_pid(), current_setting('app.tenant_id', true),"
                   " current_setting('app.actor_id', true), current_setting('app.actor_username', true)")
    seller_a = text("SELECT count(*) FROM sellers WHERE id = :s")
    readable = [t for t in pg.tables]

    async def visible_everywhere(c) -> int:
        n = 0
        for tb in readable:
            if (await c.execute(text("SELECT has_table_privilege(current_user, :t, 'SELECT')"),
                                {"t": tb})).scalar():
                n += (await c.execute(text(f"SELECT count(*) FROM {tb}"))).scalar_one()
        return n

    try:
        async with db.tenant_connection(A.id, actor_id=A.users["owner"], actor_username=A.names["owner"]) as c:
            pid1, t1, a1, _ = (await c.execute(guc_sql)).one()
            seen = (await c.execute(seller_a, {"s": A.ids["seller"]})).scalar_one()
        check(t1 == str(A.id) and a1 == str(A.users["owner"]) and seen == 1,
              f"P1: A's committed transaction carries A's context and sees A's seller (backend pid {pid1})")

        raised = ""
        try:
            async with db.tenant_connection(A.id, actor_id=A.users["owner"], actor_username=A.names["owner"]) as c:
                pid2 = (await c.execute(text("SELECT pg_backend_pid()"))).scalar_one()
                await c.execute(seller_a, {"s": A.ids["seller"]})
                await c.execute(text("SELECT 1/0"))
        except DBAPIError as exc:
            raised = type(getattr(exc.orig, "__cause__", None) or exc.orig or exc).__name__
        check(bool(raised) and pid2 == pid1,
              f"P2: A's transaction ERRORED mid-way ({raised}) on the same backend pid {pid2}")

        async with db.tenant_connection(None) as c:
            pid3, t3, a3, u3 = (await c.execute(guc_sql)).one()
            n3 = await visible_everywhere(c)
            s3 = (await c.execute(seller_a, {"s": A.ids["seller"]})).scalar_one()
        check(pid3 == pid1 and t3 in ("", None) and a3 in ("", None) and u3 in ("", None),
              f"P3: the NEXT transaction on that same backend (pid {pid3}) with no context carries"
              f" tenant={t3!r} actor={a3!r} username={u3!r}")
        check(n3 == 0 and s3 == 0, f"P3: and sees {n3} rows across {len(readable)} tenant tables, A's seller {s3}")

        async with db.tenant_connection(B.id) as c:
            pid4, t4, _, _ = (await c.execute(guc_sql)).one()
            s4a = (await c.execute(seller_a, {"s": A.ids["seller"]})).scalar_one()
            s4b = (await c.execute(seller_a, {"s": B.ids["seller"]})).scalar_one()
        check(pid4 == pid1 and t4 == str(B.id) and s4a == 0 and s4b == 1,
              f"P4: B on the same backend (pid {pid4}) carries B's context, sees A's seller {s4a}, its own {s4b}")

        cancelled = ""
        cpid = None
        try:
            async with db.tenant_connection(A.id) as c:
                cpid = (await c.execute(text("SELECT pg_backend_pid()"))).scalar_one()
                await asyncio.wait_for(c.execute(text("SELECT pg_sleep(5)")), timeout=0.5)
        except (asyncio.TimeoutError, TimeoutError) as exc:
            cancelled = type(exc).__name__
        except DBAPIError as exc:
            cancelled = f"DBAPIError {type(exc.orig).__name__ if exc.orig else ''}"
        check(bool(cancelled), f"P5: A's transaction (backend pid {cpid}) was CANCELLED mid-statement ({cancelled})")
        async with db.tenant_connection(None) as c:
            pid6, t6, a6, _ = (await c.execute(guc_sql)).one()
            n6 = await visible_everywhere(c)
        # P6 MUST BE ABOUT THE CANCELLED CONNECTION, not about whichever one the pool hands out next
        # (red team on a4bbd07: the first version read a fresh backend and passed by construction).
        # Two honest outcomes: the SAME backend is reused and carries nothing of A, or the cancelled
        # backend was DISCARDED -- gone from pg_stat_activity, so nothing of it can ever be reused.
        gone = False
        for _ in range(40):
            if not await pg.scalar("SELECT count(*) FROM pg_stat_activity WHERE pid = :p", p=cpid):
                gone = True
                break
            await asyncio.sleep(0.05)
        if pid6 == cpid:
            check(t6 in ("", None) and a6 in ("", None) and n6 == 0,
                  f"P6: the cancelled backend {cpid} was REUSED and carries tenant={t6!r}, sees {n6} rows")
        else:
            check(gone and t6 in ("", None) and n6 == 0,
                  f"P6: the cancelled backend {cpid} was DISCARDED (gone from pg_stat_activity: {gone}); the next"
                  f" transaction runs on a new backend {pid6}, tenant={t6!r}, {n6} rows")
    finally:
        await one.dispose()
        db.engine = original


async def pooled_over_http(pg: Pg, scratch: str, A: Tenant, B: Tenant) -> None:
    header("H  POOLED CONNECTION, over HTTP: errored requests leave the ONE connection usable and the next"
           " request applies its own context (context SCOPING is P3's -- see the docstring)")
    os.environ["POOL_ONE_APP_NAME"] = POOL_ONE_APP_NAME
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    proc, log = start_server(port, pool_one=True)
    try:
        why = wait_for_health(proc, base)
        if why:
            check(False, f"H0: the one-connection server started -- {why}")
            return
        pid_sql = ("SELECT pid FROM pg_stat_activity WHERE datname = :d AND application_name = :n")
        async with httpx.AsyncClient(base_url=base, timeout=60.0) as client:
            tok = {}
            for t in (A, B):
                r = await client.post("/auth/login", json={"tenant_id": str(t.id), "username": t.names["owner"],
                                                           "password": t.pw["owner"]})
                tok[t.label] = r.json().get("access_token") if r.status_code == 200 else ""
            pids0 = await pg.column(pid_sql, d=scratch, n=POOL_ONE_APP_NAME)
            check(len(pids0) == 1, f"H0: pg_stat_activity holds exactly ONE backend for this server {pids0}")
            r = await client.get("/whoami", headers=auth(tok["A"]))
            check(r.status_code == 200 and r.json().get("db_tenant_context") == str(A.id),
                  f"H1: A's /whoami reports the context the server applied = A ({r.status_code})")
            errs = [
                ("POST", "/uoms", {"code": "KG", "name": f"dup {RUN}"}, "duplicate code INSERT"),
                ("POST", "/payments", {"id": str(uuid.uuid4()), "seller_id": A.ids["seller"], "method": "transfer",
                                       "amount": "1.00", "idempotency_key": f"h-{uuid.uuid4()}",
                                       "device_created_at": now_iso(), "channel_id": B.ids["channel"],
                                       "allocations": []}, "foreign channel FK"),
                ("PATCH", f"/shifts/{A.ids['shift1']}", {"variance_reason": f"again {RUN}"}, "frozen-reason trigger"),
            ]
            for i, (m, path, body, what) in enumerate(errs, start=2):
                r = await client.request(m, path, headers=auth(tok["A"]), json=body)
                check(400 <= r.status_code < 500,
                      f"H{i}: A's request failed INSIDE its transaction ({what}) -> {r.status_code}")
                w = await client.get("/whoami", headers=auth(tok["B"]))
                ctx = w.json().get("db_tenant_context") if w.status_code == 200 else None
                s = await client.get("/sellers?include_inactive=true", headers=auth(tok["B"]))
                leaks = leaked(s.text, A.markers, "")
                check(ctx == str(B.id) and not leaks,
                      f"H{i}: the NEXT request, B's, applied B's context ({ctx == str(B.id)}) and B's"
                      f" sellers carry no A marker ({len(leaks)} found)")
                lg = await client.post("/auth/login", json={"tenant_id": str(B.id), "username": A.names["owner"],
                                                            "password": A.pw["owner"]})
                check(lg.status_code == 401,
                      f"H{i}: an UNAUTHENTICATED login under B with A's credentials -> {lg.status_code}")
            pids1 = await pg.column(pid_sql, d=scratch, n=POOL_ONE_APP_NAME)
            check(pids1 == pids0, f"H5: every request above ran on the one backend: pid before {pids0}, after {pids1}")
    finally:
        stop_server(proc, log)


# ---------------------------------------------------------------------------
async def main() -> int:
    global BASE
    ap = argparse.ArgumentParser(description="Tenant-isolation attack matrix (H1).")
    ap.add_argument("--database", default=None,
                    help=f"a SCRATCH database. Omit to self-restore {SCRATCH_DB!r}. Never live.")
    ap.add_argument("--skip-restore", action="store_true")
    args = ap.parse_args()

    app_live = make_url(os.environ["APP_DATABASE_URL"])
    dir_live = make_url(os.environ["DIRECTORY_DATABASE_URL"])
    mig_live = make_url(os.environ["MIGRATION_DATABASE_URL"])
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
    pg = Pg(mig_live.set(database=scratch).render_as_string(hide_password=False))

    A, B = Tenant("A"), Tenant("B")
    port = free_port()
    BASE = f"http://127.0.0.1:{port}"
    proc, log = start_server(port, pool_one=False)
    print(f"  child uvicorn pid={proc.pid} on {BASE} against scratch {scratch!r}")
    try:
        why = wait_for_health(proc, BASE)
        if why:
            check(False, f"E0: server started -- {why}")
            return 1
        spec = httpx.get(f"{BASE}/openapi.json", timeout=10.0).json()
        every, id_taking = enumerate_routes(spec)
        header(f"E1  THE ROUTES: {len(every)} operations in /openapi.json, {len(id_taking)} take a resource id")
        for k in every:
            print(f"      {'[id]' if k in id_taking else '    '} {k}")

        await pg.discover()
        print(f"\n  snapshot tables (every public table with a tenant_id column, plus tenants):"
              f" {len(pg.tables)} -- {', '.join(pg.tables)}")
        try:
            await provision(A)
            await provision(B)
        except Exception as exc:  # noqa: BLE001
            print(f"UNFIT: provisioning failed: {exc!r}")
            return 2
        async with httpx.AsyncClient(base_url=BASE, timeout=60.0) as client:
            for t in (A, B):
                for r in ROLES:
                    resp = await client.post("/auth/login", json={"tenant_id": str(t.id), "username": t.names[r],
                                                                  "password": t.pw[r]})
                    t.tok[r] = resp.json().get("access_token", "") if resp.status_code == 200 else ""
            check(all(t.tok[r] for t in (A, B) for r in ROLES), "E2: all six fixture accounts sign in")
            try:
                await build_graph(client, A)
                await build_graph(client, B)
            except Exception as exc:  # noqa: BLE001
                import traceback
                traceback.print_exc()
                print(f"UNFIT: the fixture did not build: {exc!r}")
                return 2
            check(True, "E3: both graphs built through the API by each tenant's owner -- B's unit KG, category FE,"
                        " product FE01 and tier A were 201 while A already held the same codes (no global key)")
            print(f"      tenant A={A.id}  tenant B={B.id}  A markers={len(A.markers)}")

            cells = build_cells(A, B)
            covered = {c.route for c in cells}
            missing = sorted(id_taking - covered)
            unknown = sorted(covered - set(every))
            check(not missing, f"E1 COVERAGE: every id-taking route has a matrix cell ({len(id_taking)} routes,"
                               f" {len(cells)} cells)" + (f" -- MISSING {missing}" if missing else ""))
            check(not unknown, "E1 COVERAGE: every cell names a route the server declares"
                               + (f" -- UNKNOWN {unknown}" if unknown else ""))

            header("M  THE MATRIX: tenant B's admin and owner against tenant A's ids")
            rows = await run_matrix(client, pg, A, B, cells)
            header("A  AMBIENT: every id-free read as tenant B's admin")
            await run_ambient(client, A, B)

            header("MATRIX TABLE  (status per attacker | A rows value-equal | B rows value-equal | A-control)")
            for row in rows:
                st = " ".join(f"{k}={v}" for k, v in row.statuses.items())
                b = "-" if row.b_same is None else ("yes" if row.b_same else "NO")
                print(f"  {row.route:52} {row.label:44} {st:22} A={'yes' if row.a_same else 'NO':3}"
                      f" B={b:3} ctl={row.control}")
    finally:
        stop_server(proc, log)

    await pooled_in_process(pg, A, B)
    await pooled_over_http(pg, scratch, A, B)
    await pg.engine.dispose()

    print("\n" + "=" * 72)
    print(f"  passes={len(passes)}  failures={len(failures)}")
    for f in failures:
        print(f"    RED: {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--serve-pool-one":
        serve_pool_one(int(sys.argv[2]))
        sys.exit(0)
    rc = asyncio.run(main())
    print(f"PROVE_TENANT_MATRIX_EXIT={rc}")
    sys.exit(rc)
