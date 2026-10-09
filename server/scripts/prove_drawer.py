"""Prove the shifts unit's commit 2 -- the drawer ROUTES, the stamping, the frozen
close, the settings, the masking and migration 0022 -- over REAL HTTP, on a SCRATCH.

    uv run python scripts/prove_drawer.py                   (self-restores a scratch from a live dump)
    uv run python scripts/prove_drawer.py --break <name>    (DISPROOF: break one DB object first)

Model on prove_payments.py (a child uvicorn on a restored scratch, gated on
/openapi.json) and prove_shifts.py (asyncpg as recycle_app for the grant and trigger
cells, the round trip on a fresh scratch with EXPLICIT targets). Per-run uuids and
keys everywhere; run 2 restores a fresh scratch, so it is green TWICE with no reseed
(lessons/proof-must-run-twice.md). The alembic head is asserted AT OR PAST 0022,
never as a fact (that lesson's sixth amendment).

THE VERDICT IS PRESET TO RED: rc starts at 1 and only a completed tally with no RED
clears it; a crash leaves no PROVE_DRAWER_EXIT=0 line
(lessons/a-default-exit-code-is-a-default-verdict.md).

THE CELLS (every negative cell has a positive sibling in the same run, named):
  E0  the scratch is at 0022 or later; /openapi.json declares the drawer routes;
      shifts.manage is in the catalogue (read from Postgres).
  OP  open: 201; a replay of the same id 200 with the same shift; a SECOND open is
      409 shift_already_open naming the open shift (sibling: the 201); GET
      /shifts/current 200 with the drawer figure for admin (money.view_shop).
  ST  stamping: a cash payment via POST /payments, the AUTOMATIC cash payment of
      POST /bills and a transfer payment are each stamped with the open shift, read
      out of Postgres; three kinds of movement stamped likewise; a movement replay is
      200 with the same id; GET /cash-movements lists them.
  CL  close: counted differs from expected; the response's expected_cash equals a
      figure THIS PROOF computes from the rows it reads out of Postgres, AND the
      figure computed from the literal amounts it sent; variance = counted -
      expected; the row carries all five; a second close is 409 shift_closed; GET
      /shifts/current is then 404 no_open_shift (sibling: the earlier 200).
  FR  the frozen close: as recycle_app an UPDATE of counted_cash on the closed row
      is REFUSED with SQLSTATE RF001 (sibling: the same UPDATE on an OPEN shift is
      accepted); PATCH variance_reason NULL->text 200; a second PATCH 409
      shift_reason_frozen; as recycle_app a second reason RF001; a blank reason RF001;
      PATCH on an open shift 409 shift_open.
  RH  THE LOCKS, BY HOLDING THEM (lessons/a-lock-is-proven-by-what-waits-not-by-a-
      race.md): a close-mode hold (FOR NO KEY UPDATE) makes POST /payments WAIT, and
      pg_stat_activity names the stamp's FOR SHARE as the waiter; a recorder-mode
      hold (FOR SHARE) does NOT (the negative half); an in-flight recorder (FOR SHARE
      + an uncommitted cash payment) makes POST /shifts/{id}/close WAIT and the frozen
      figure INCLUDES that payment; a close committing under its lock leaves a
      concurrent payment stamped NULL, outside the figure.
  RB  THE BARRIER RACE the brief names: a close and a cash payment released together,
      K times, overlap printed and required; every outcome is (A) stamped to the shift
      and inside its frozen figure or (B) stamped NULL -- NEVER stamped to the closed
      shift and missing from its figure -- and every frozen figure equals opening minus
      exactly the cash payments stamped to it. On this box the close wins every
      overlapping round (B); two SEQUENTIAL rounds are the positive control that the
      classifier reads A, and A under concurrency is RH2's (see the cell's comment).
  INV invariant 1: shifts_enabled false AND cash deactivated on the branch (read back
      through GET /shop/policy -- the switches really were written), then a cash
      payment and a bill are both ACCEPTED.
  PM  staff is 403 permission_required naming shifts.manage on all six shift routes
      (siblings: admin's successes above).
  CH  channels: a payment naming the shop's own channel stores it; a DEACTIVATED
      channel is ACCEPTED; another tenant's channel is 422 channel_unknown (the
      composite FK, translated); PATCH label 200; PATCH of an identifying field 422.
  MK  masking: the admin response carries the full identifiers (the scanner's
      POSITIVE CONTROL finds them); the staff response carries no 5-character
      substring of either identifier, no full-identifier key, and the right last four.
  BW  born with cash: a shop provisioned by provision_shop.py on the scratch has its
      one active cash row.
  RV  REVOKE: as recycle_app, DELETE on purchase_bills, purchase_bill_items and
      doc_no_counters each REFUSED (InsufficientPrivilege); a SELECT on each is the
      control that the connection works.
  G   invariant 1 as MECHANISM: an AST scan of every function in server/app finds no
      refusal branch reading shifts_enabled / branch_payment_methods /
      separate_cashier; the same scanner over a planted violation finds it.
  X   reconcile.py on the scratch after every write above exits 0, H1..H3 and P1..P4
      present as [OK].
  RT  on a scratch BUILT FROM EMPTY (alembic upgrade head + seed_dev.py + one bill
      through POST /bills; never a dump of dev -- the gate repair, 2026-10-09):
      downgrade to 0021 (a closed shift present does NOT refuse), the objects gone and
      the DELETE grant restored from the recorded marker; a branch inserted at 0021 has
      no cash row; upgrade to 0022 gives it one.
  RF  the cell stamps the seeded bill's own automatic payment with a channel, and the
      downgrade REFUSES naming payments, read as an error, head still 0022.

--break <name> breaks ONE database object on the scratch before the cells run:
  freeze_trigger, born_trigger, channel_fk, revoke_bills, one_open_index.
--disprove-refusal: RF does not make its refusing row; RF1 alone must go red.
The code-level disproofs (a lock deleted, the mask removed, a gate removed, the
formula changed) are made BY HAND on the working tree and restored byte-identical;
the phase record carries that table.
"""
from __future__ import annotations

import argparse
import ast
import asyncio
import datetime as dt
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import asyncpg  # noqa: E402
import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    PRODUCT_A_ID,
    SELLER_A_ID,
    STAFF_USERNAME,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
    TENANT_A_STAFF_PASSWORD,
    TENANT_B_ID,
)

try:  # pragma: no cover
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH_DB = "recycle_drawer_scratch"
RUN = uuid.uuid4().hex[:8]
SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000"
HOLD = 1.5          # seconds a lock is held in the RH cells
WAITED = 1.0        # a request that took at least this long waited for the hold
FREE = 0.6          # a request faster than this did not
RACE_ROUNDS = 6

ORIG_ENV = dict(os.environ)   # BEFORE the rebind: provision_shop.py needs the live name
_APP_URL = make_url(os.environ["APP_DATABASE_URL"])
_DIR_URL = make_url(os.environ["DIRECTORY_DATABASE_URL"])

BASE = ""
failures: list[str] = []
passes: list[str] = []


def check(cond: bool, claim: str) -> bool:
    print(f"  [{'OK  ' if cond else 'RED '}] {claim}")
    (passes if cond else failures).append(claim)
    return bool(cond)


def header(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def D(v) -> Decimal:
    return Decimal(str(v))


def now_iso() -> str:
    return dt.datetime.now(tz=dt.timezone.utc).isoformat()


def detail_of(r: httpx.Response) -> dict:
    try:
        d = r.json().get("detail")
    except ValueError:
        return {}
    return d if isinstance(d, dict) else {}


# ---------------------------------------------------------------------------
# scratch, alembic, child server
# ---------------------------------------------------------------------------
def restore_scratch(live_name: str, scratch: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-drawer-dump-{RUN}-{uuid.uuid4().hex[:4]}")
    label = f"drawer-{RUN}"
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "backup_db.py"),
         "--db", live_name, "--out", out, "--label", label],
        cwd=SERVER_DIR, capture_output=True, text=True, timeout=300,
        encoding="utf-8", errors="replace", env=ORIG_ENV)
    if cp.returncode != 0:
        raise RuntimeError(f"backup_db.py failed: {(cp.stdout + cp.stderr)[-600:]}")
    dumps = [d for d in os.listdir(out) if d.endswith(label)]
    if len(dumps) != 1:
        raise RuntimeError(f"expected one dump dir ending {label!r}, got {dumps}")
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "restore_db.py"),
         os.path.join(out, dumps[0]), "--into", scratch],
        cwd=SERVER_DIR, capture_output=True, text=True, timeout=300,
        encoding="utf-8", errors="replace", env=ORIG_ENV)
    if cp.returncode != 0:
        raise RuntimeError(f"restore_db.py -> {scratch} failed: {(cp.stdout + cp.stderr)[-600:]}")
    shutil.rmtree(out, ignore_errors=True)


def run_alembic(scratch: str, *args: str) -> tuple[int, str]:
    env = dict(ORIG_ENV)
    env["MIGRATION_DATABASE_URL"] = (
        make_url(ORIG_ENV["MIGRATION_DATABASE_URL"]).set(database=scratch)
        .render_as_string(hide_password=False))
    env["PYTHONIOENCODING"] = "utf-8"
    cp = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=SERVER_DIR, env=env,
                        capture_output=True, text=True, timeout=600,
                        encoding="utf-8", errors="replace")
    return cp.returncode, cp.stdout + cp.stderr


# ---------------------------------------------------------------------------
# THE EMPTY BUILD (the gate repair, 2026-10-09). The round trip and its refusal test
# MIGRATION MECHANICS, so their scratch is built from an EMPTY database brought to head
# by `alembic upgrade head`, seeded by scripts/seed_dev.py, and given ONE paid bill
# through the real POST /bills -- never a dump of dev, which holds whatever every other
# proof, live round and device walk left there (lessons/proof-must-run-twice.md, the
# 2026-10-09 amendment). The same helper lives in prove_shifts.py: the brief's fence
# names these three proofs and no shared module. Built from ORIG_ENV, never os.environ,
# which amain rebinds to the scratch while the cells run.
# ---------------------------------------------------------------------------
def _qi(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _ql(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


_ACL_PRIVS = {"C": "CREATE", "c": "CONNECT", "T": "TEMPORARY"}


def scratch_env(scratch: str) -> dict:
    env = dict(ORIG_ENV)
    for key in ("APP_DATABASE_URL", "DIRECTORY_DATABASE_URL", "MIGRATION_DATABASE_URL"):
        env[key] = make_url(ORIG_ENV[key]).set(database=scratch).render_as_string(hide_password=False)
    env["PYTHONIOENCODING"] = "utf-8"
    return env


INIT_SQL = os.path.join(SERVER_DIR, "db", "init", "00_init_roles.sql")


async def apply_init_in_database(scratch: str) -> None:
    """The IN-DATABASE half of db/init/00_init_roles.sql -- every statement after its
    `\\connect recycle` -- run on `scratch` as the superuser, READ FROM THE FILE so the two
    cannot drift. It carries the schema ownership, the PUBLIC revoke, the app role's USAGE
    and the ALTER DEFAULT PRIVILEGES that hands recycle_app DELETE on doc_no_counters; an
    empty build without it differs from every real database (measured 2026-10-09: RT2 read
    del_ctr False on the first empty build, because 0022 truthfully recorded `absent`).
    The parser must find the ALTER DEFAULT PRIVILEGES statement or it raises -- a parser
    that quietly stops matching would rebuild exactly that difference."""
    text = open(INIT_SQL, encoding="utf-8").read().replace("\r\n", "\n")
    head, sep, tail = text.partition("\n\\connect recycle\n")
    if not sep:
        raise RuntimeError(f"{INIT_SQL}: no `\\connect recycle` line to split at")
    body = "\n".join(ln for ln in tail.split("\n") if not ln.lstrip().startswith("--"))
    stmts = [s.strip() for s in body.split(";") if s.strip()]
    if not any(s.startswith("ALTER DEFAULT PRIVILEGES") for s in stmts) or any("\\" in s for s in stmts):
        raise RuntimeError(f"{INIT_SQL}: the in-database half did not parse as expected ({stmts})")
    c = await asyncpg.connect(host=_APP_URL.host, port=_APP_URL.port, user="postgres",
                              password="postgres", database=scratch)
    try:
        for s in stmts:
            await c.execute(s)
    finally:
        await c.close()


async def build_empty_scratch(live_name: str, scratch: str) -> None:
    """DROP and CREATE `scratch` with the LIVE database's owner, encoding, locale, ACL and
    per-database settings (the facts restore_db.py takes from its manifest), then
    `alembic upgrade head` and scripts/seed_dev.py. Raises on any step's failure."""
    if scratch == live_name:
        raise RuntimeError("refusing to build an empty scratch over the live database")
    c = await asyncpg.connect(host=_APP_URL.host, port=_APP_URL.port, user="postgres",
                              password="postgres", database="postgres")
    try:
        row = await c.fetchrow(
            "SELECT pg_get_userbyid(d.datdba) AS owner, pg_encoding_to_char(d.encoding) AS enc,"
            " d.datcollate, d.datctype, d.datacl::text AS acl FROM pg_database d WHERE d.datname = $1",
            live_name)
        settings = await c.fetch(
            "SELECT unnest(s.setconfig) AS kv FROM pg_db_role_setting s JOIN pg_database d"
            " ON d.oid = s.setdatabase WHERE d.datname = $1 AND s.setrole = 0", live_name)
        await c.execute(f"DROP DATABASE IF EXISTS {_qi(scratch)} WITH (FORCE)")
        await c.execute(
            f"CREATE DATABASE {_qi(scratch)} WITH TEMPLATE = template0 ENCODING = {_ql(row['enc'])}"
            f" LC_COLLATE = {_ql(row['datcollate'])} LC_CTYPE = {_ql(row['datctype'])}"
            f" OWNER = {_qi(row['owner'])}")
        for item in [a for a in (row["acl"] or "").strip("{}").split(",") if a]:
            grantee, _, rest = item.partition("=")
            for ch in rest.split("/")[0]:
                if ch in _ACL_PRIVS:
                    who = "PUBLIC" if grantee == "" else _qi(grantee.strip('"'))
                    await c.execute(f"GRANT {_ACL_PRIVS[ch]} ON DATABASE {_qi(scratch)} TO {who}")
        for r in settings:
            k, _, v = r["kv"].partition("=")
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?", k):
                raise RuntimeError(f"refusing a database setting named {k!r}")
            await c.execute(f"ALTER DATABASE {_qi(scratch)} SET {k} = {_ql(v)}")
    finally:
        await c.close()
    await apply_init_in_database(scratch)
    env = scratch_env(scratch)
    cp = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=SERVER_DIR, env=env,
                        capture_output=True, text=True, timeout=900, encoding="utf-8", errors="replace")
    if cp.returncode != 0:
        raise RuntimeError(f"alembic upgrade head on the empty scratch failed:\n{(cp.stdout + cp.stderr)[-1500:]}")
    cp = subprocess.run([sys.executable, os.path.join("scripts", "seed_dev.py")], cwd=SERVER_DIR, env=env,
                        capture_output=True, text=True, timeout=300, encoding="utf-8", errors="replace")
    if cp.returncode != 0:
        raise RuntimeError(f"seed_dev.py on the empty scratch failed:\n{(cp.stdout + cp.stderr)[-1500:]}")


def seed_paid_bill(scratch: str) -> str:
    """ONE bill through the REAL POST /bills on a child uvicorn bound to `scratch` (the
    switch is off at birth, so the server writes the automatic payment itself) -- a row
    the product produces, not one written by hand
    (lessons/a-proof-fixture-must-be-a-row-the-product-could-produce.md)."""
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(mode="w", suffix=".log", prefix="prove_drawer_seed_",
                                      delete=False, encoding="utf-8")
    proc = subprocess.Popen([sys.executable, "-u", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1",
                             "--port", str(port), "--log-level", "warning"],
                            cwd=SERVER_DIR, env=scratch_env(scratch), stdout=log, stderr=subprocess.STDOUT)
    try:
        deadline = time.time() + 40
        while True:
            if proc.poll() is not None:
                raise RuntimeError(f"the seeding uvicorn exited {proc.returncode} (log {log.name})")
            try:
                if httpx.get(f"{base}/health", timeout=2.0).status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            if time.time() > deadline:
                raise RuntimeError(f"the seeding uvicorn never answered /health (log {log.name})")
            time.sleep(0.25)
        r = httpx.post(f"{base}/auth/login", json={"tenant_id": str(TENANT_A_ID), "username": ADMIN_USERNAME,
                                                   "password": TENANT_A_PASSWORD}, timeout=15.0)
        token = r.json().get("access_token") if r.status_code == 200 else None
        if not token:
            raise RuntimeError(f"admin login on the empty scratch -> {r.status_code}")
        bill_id = str(uuid.uuid4())
        r = httpx.post(f"{base}/bills", headers={"Authorization": f"Bearer {token}"}, timeout=15.0, json={
            "id": bill_id, "seller_id": str(SELLER_A_ID), "vehicle_no": f"RT-{RUN[:4]}",
            "device_created_at": now_iso(),
            "idempotency_key": f"drawer-rt-{RUN}",
            "items": [{"id": str(uuid.uuid4()), "product_id": str(PRODUCT_A_ID), "line_no": 1,
                       "gross_weight": "1.000", "tare_weight": "0.000", "net_weight": "1.000",
                       "unit_price": "20.00"}]})
        if r.status_code != 201:
            raise RuntimeError(f"POST /bills on the empty scratch -> {r.status_code}: {r.text[:300]}")
        return bill_id
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def wait_for_health(proc: subprocess.Popen, timeout: float = 40.0) -> str:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            return f"the uvicorn child exited with code {proc.returncode}"
        try:
            if httpx.get(f"{BASE}/health", timeout=2.0).status_code == 200:
                return ""
        except httpx.HTTPError:
            pass
        time.sleep(0.25)
    return "health never came up within the timeout"


# ---------------------------------------------------------------------------
# Postgres: the SUPERUSER seat for reads and setup, recycle_app for the grant cells
# ---------------------------------------------------------------------------
class Db:
    def __init__(self, scratch: str) -> None:
        self.scratch = scratch

    async def su(self) -> asyncpg.Connection:
        return await asyncpg.connect(host=_APP_URL.host, port=_APP_URL.port, user="postgres",
                                     password="postgres", database=self.scratch)

    async def app(self) -> asyncpg.Connection:
        return await asyncpg.connect(host=_APP_URL.host, port=_APP_URL.port,
                                     user=_APP_URL.username, password=_APP_URL.password,
                                     database=self.scratch)

    async def fetchval(self, sql: str, *args):
        c = await self.su()
        try:
            return await c.fetchval(sql, *args)
        finally:
            await c.close()

    async def fetchrow(self, sql: str, *args):
        c = await self.su()
        try:
            return await c.fetchrow(sql, *args)
        finally:
            await c.close()

    async def fetch(self, sql: str, *args):
        c = await self.su()
        try:
            return await c.fetch(sql, *args)
        finally:
            await c.close()

    async def exec_as(self, tenant, sql: str, *args) -> None:
        """One write as the superuser WITH the tenant and system actor declared
        (audited tables refuse a write with no actor; the audit row takes its
        tenant from app.tenant_id)."""
        c = await self.su()
        try:
            async with c.transaction():
                await c.execute("SELECT set_config('app.tenant_id', $1, true)", str(tenant))
                await c.execute("SELECT set_config('app.actor_id', $1, true)", SYSTEM_ACTOR)
                await c.execute("SELECT set_config('app.actor_username', $1, true)",
                                "system:prove_drawer")
                await c.execute(sql, *args)
        finally:
            await c.close()


async def app_try(db: Db, sql: str, *args, actor: str | None = None) -> tuple[str | None, str | None, object]:
    """One statement as recycle_app under tenant A (and an actor), ROLLED BACK.
    Returns (exception class name or None, sqlstate or None, value)."""
    c = await db.app()
    try:
        tr = c.transaction()
        await tr.start()
        try:
            await c.execute("SELECT set_config('app.tenant_id', $1, true)", str(TENANT_A_ID))
            await c.execute("SELECT set_config('app.actor_id', $1, true)", actor or SYSTEM_ACTOR)
            await c.execute("SELECT set_config('app.actor_username', $1, true)",
                            f"prove_drawer:{RUN}")
            val = await c.fetchval(sql, *args)
            return None, None, val
        except asyncpg.PostgresError as e:
            return type(e).__name__, getattr(e, "sqlstate", None), None
        finally:
            await tr.rollback()
    finally:
        await c.close()


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def login(client: httpx.AsyncClient, username: str, password: str) -> str | None:
    r = await client.post("/auth/login", json={
        "tenant_id": str(TENANT_A_ID), "username": username, "password": password})
    return r.json().get("access_token") if r.status_code == 200 else None


def payment_body(tag: str, amount: str, method: str = "cash", channel_id: str | None = None) -> dict:
    body = {"id": str(uuid.uuid4()), "seller_id": str(SELLER_A_ID), "method": method,
            "amount": amount, "idempotency_key": f"drawer-{RUN}-{tag}",
            "device_created_at": now_iso(), "allocations": []}
    if channel_id:
        body["channel_id"] = channel_id
    return body


def bill_body(tag: str, net: str = "1.000", unit: str = "20.00") -> dict:
    return {"id": str(uuid.uuid4()), "seller_id": str(SELLER_A_ID),
            "vehicle_no": f"70-{RUN[:4]}", "device_created_at": now_iso(),
            "idempotency_key": f"drawer-{RUN}-bill-{tag}",
            "items": [{"id": str(uuid.uuid4()), "product_id": str(PRODUCT_A_ID), "line_no": 1,
                       "gross_weight": net, "tare_weight": "0.000", "net_weight": net,
                       "unit_price": unit}]}


def movement_body(tag: str, kind: str, amount: str) -> dict:
    return {"id": str(uuid.uuid4()), "kind": kind, "amount": amount,
            "note": f"proof {kind}", "idempotency_key": f"drawer-{RUN}-mv-{tag}",
            "device_created_at": now_iso()}


async def open_shift(client, token, opening: str = "0.00") -> httpx.Response:
    return await client.post("/shifts", headers=auth(token),
                             json={"id": str(uuid.uuid4()), "opening_float": opening})


async def rows_figure(db: Db, shift_id: str) -> tuple[Decimal, dict]:
    """THE INDEPENDENT FIGURE: this proof's own arithmetic over the rows it reads
    out of Postgres, never the route's (a checker that shared the code would agree
    with its bug)."""
    s = await db.fetchrow("SELECT opening_float FROM shifts WHERE id = $1", uuid.UUID(shift_id))
    mv = await db.fetch("SELECT kind, amount FROM cash_movements WHERE shift_id = $1"
                        " AND voided_at IS NULL", uuid.UUID(shift_id))
    pays = await db.fetch("SELECT id, amount FROM payments WHERE shift_id = $1 AND method = 'cash'"
                          " AND voided_at IS NULL", uuid.UUID(shift_id))
    fig = D(s["opening_float"])
    for m in mv:
        fig += D(m["amount"]) if m["kind"] == "float_in" else -D(m["amount"])
    for p in pays:
        fig -= D(p["amount"])
    return fig.quantize(Decimal("0.01")), {"cash_payment_ids": {str(p["id"]) for p in pays},
                                          "movements": len(mv)}


async def timed(coro):
    """(response, the instant IT completed). The RH cells measure a request against
    its OWN completion, never against when the proof next looks: the first version
    awaited the task after the hold was released, so every request 'took' the hold's
    length whether it waited or not -- RH1 stayed GREEN with the stamp's FOR SHARE
    deleted (measured; RH1b's pg_stat_activity reading was the cell that reddened).
    lessons/a-check-that-never-went-red-was-never-observed.md."""
    r = await coro
    return r, time.monotonic()


async def stamp_of(db: Db, payment_id: str):
    v = await db.fetchval("SELECT shift_id FROM payments WHERE id = $1", uuid.UUID(payment_id))
    return str(v) if v else None


async def waiting_queries(db: Db) -> list[str]:
    """Backends waiting on a lock, read as the SUPERUSER (another role's backend
    shows a redaction otherwise -- the lock lesson's second rule)."""
    rows = await db.fetch(
        "SELECT query FROM pg_stat_activity WHERE datname = $1 AND wait_event_type = 'Lock'",
        db.scratch)
    return [" ".join((r["query"] or "").split()) for r in rows]


# ---------------------------------------------------------------------------
# G: invariant 1 as a scan
# ---------------------------------------------------------------------------
POLICY_TOKENS = ("shifts_enabled", "branch_payment_methods", "separate_cashier")


def policy_refusals(source: str, filename: str) -> list[str]:
    """Every `if` whose TEST reads a policy -- by name, or through a variable that was
    assigned from an expression naming one -- and whose branch RAISES. A function's
    docstring and comments are not code and are not read."""
    tree = ast.parse(source, filename)
    hits: list[str] = []
    for fn in ast.walk(tree):
        if not isinstance(fn, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue
        tainted: set[str] = set()
        for node in ast.walk(fn):
            if isinstance(node, (ast.Assign, ast.AnnAssign)) and node.value is not None:
                if any(t in ast.unparse(node.value) for t in POLICY_TOKENS):
                    targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                    for tg in targets:
                        tainted |= {n.id for n in ast.walk(tg) if isinstance(n, ast.Name)}
        for node in ast.walk(fn):
            if isinstance(node, ast.If):
                test = ast.unparse(node.test)
                names = {n.id for n in ast.walk(node.test) if isinstance(n, ast.Name)}
                reads_policy = any(t in test for t in POLICY_TOKENS) or bool(names & tainted)
                raises = any(isinstance(n, ast.Raise) for b in (node.body, node.orelse)
                             for s in b for n in ast.walk(s))
                if reads_policy and raises:
                    hits.append(f"{filename}:{node.lineno} {fn.name}: if {test[:80]}")
    return hits


def run_g() -> None:
    header("G  invariant 1 as mechanism: no refusal branch reads a switch")
    app_dir = os.path.join(SERVER_DIR, "app")
    files = sorted(f for f in os.listdir(app_dir) if f.endswith(".py"))
    hits: list[str] = []
    fns = 0
    for f in files:
        # BYTES, decoded here: a NUL or an encoding quirk cannot drop a file silently.
        src = open(os.path.join(app_dir, f), "rb").read().decode("utf-8")
        fns += sum(isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                   for n in ast.walk(ast.parse(src)))
        hits += policy_refusals(src, f)
    planted_direct = (
        "@router.post('/payments')\nasync def create_payment(body):\n"
        "    if not branch.shifts_enabled:\n        raise HTTPException(409)\n")
    planted_tainted = (
        "async def create_payment(conn, body):\n"
        "    methods = await conn.execute(text('SELECT method FROM branch_payment_methods'))\n"
        "    if body.method not in methods:\n        raise _invalid('x', 'y')\n")
    control = (len(policy_refusals(planted_direct, "planted_direct.py")),
               len(policy_refusals(planted_tainted, "planted_tainted.py")))
    check(control == (1, 1), f"G control: the scanner finds a planted direct AND a planted"
                             f" tainted refusal (found {control})")
    check(len(files) >= 10 and fns > 100,
          f"G the scan covered {len(files)} files and {fns} functions in server/app")
    check(not hits, f"G no function in server/app refuses on a switch (hits: {hits})")


# ---------------------------------------------------------------------------
# the HTTP cells
# ---------------------------------------------------------------------------
async def run_cells(client: httpx.AsyncClient, db: Db, scratch: str) -> None:
    admin = await login(client, ADMIN_USERNAME, TENANT_A_PASSWORD)
    staff = await login(client, STAFF_USERNAME, TENANT_A_STAFF_PASSWORD)
    if not check(bool(admin) and bool(staff), "E0: admin and staff of Shop A log in"):
        return
    admin_id = await db.fetchval("SELECT id FROM users WHERE tenant_id = $1 AND username = $2",
                                 TENANT_A_ID, ADMIN_USERNAME)
    branch_id = await db.fetchval(
        "SELECT id FROM branches WHERE tenant_id = $1 AND is_active ORDER BY code LIMIT 1",
        TENANT_A_ID)
    stray = await db.fetchval("SELECT count(*) FROM shifts WHERE tenant_id = $1"
                              " AND closed_at IS NULL", TENANT_A_ID)
    if not check(stray == 0, f"E0: the scratch starts with no open shift in Shop A (n={stray})"):
        return

    # ------------------------------------------------------------------ OP
    header("OP  open a shift")
    s1_id = str(uuid.uuid4())
    r = await client.post("/shifts", headers=auth(admin),
                          json={"id": s1_id, "opening_float": "500.00"})
    check(r.status_code == 201 and r.json().get("status") == "open"
          and r.json().get("opening_float") == "500.00",
          f"OP1 admin opens a shift: 201 open, float 500.00 (got {r.status_code} {r.text[:120]})")
    r = await client.post("/shifts", headers=auth(admin),
                          json={"id": s1_id, "opening_float": "500.00"})
    check(r.status_code == 200 and r.json().get("id") == s1_id,
          f"OP2 a replay of the same id is 200 with the same shift (got {r.status_code})")
    r = await open_shift(client, admin, "10.00")
    d = detail_of(r)
    ok = check(r.status_code == 409 and d.get("code") == "shift_already_open"
               and d.get("open_shift_id") == s1_id,
               f"OP3 a SECOND open on the branch is 409 shift_already_open naming the open"
               f" shift (got {r.status_code} {d.get('code')!r} {d.get('open_shift_id')!r})")
    if not ok and r.status_code == 201:
        # Only under --break one_open_index: close the stray so no later cell inherits it.
        await client.post(f"/shifts/{r.json()['id']}/close", headers=auth(admin),
                          json={"counted_cash": "10.00"})
    r = await client.get("/shifts/current", headers=auth(admin))
    check(r.status_code == 200 and r.json().get("id") == s1_id and "drawer" in r.json(),
          f"OP4 GET /shifts/current: 200, the open shift, with the drawer for money.view_shop"
          f" (got {r.status_code} drawer={'drawer' in (r.json() if r.status_code == 200 else {})})")

    # ------------------------------------------------------------------ ST
    header("ST  stamping: every money row recorded while the shift is open")
    pay_cash = payment_body("cash30", "30.00")
    r = await client.post("/payments", headers=auth(admin), json=pay_cash)
    check(r.status_code == 201 and r.json().get("shift_id") == s1_id
          and await stamp_of(db, pay_cash["id"]) == s1_id,
          f"ST1 a cash payment via POST /payments is stamped with the shift (response AND"
          f" Postgres) (got {r.status_code} {r.json().get('shift_id') if r.status_code == 201 else r.text[:120]})")
    bill = bill_body("auto20")
    r = await client.post("/bills", headers=auth(admin), json=bill)
    auto = await db.fetchrow("SELECT id, shift_id, amount, method FROM payments"
                             " WHERE tenant_id = $1 AND idempotency_key = $2",
                             TENANT_A_ID, f"auto:{bill['id']}")
    check(r.status_code == 201 and auto is not None and str(auto["shift_id"]) == s1_id
          and auto["method"] == "cash" and D(auto["amount"]) == Decimal("20.00"),
          f"ST2 POST /bills' AUTOMATIC cash payment is stamped with the shift, read from"
          f" Postgres (bill {r.status_code}, auto={dict(auto) if auto else None})")
    pay_tr = payment_body("tr7", "7.00", method="transfer")
    r = await client.post("/payments", headers=auth(admin), json=pay_tr)
    check(r.status_code == 201 and await stamp_of(db, pay_tr["id"]) == s1_id,
          f"ST3 a TRANSFER payment is stamped too -- every method is (got {r.status_code})")
    sent_movements = [("float_in", "100.00"), ("float_out", "5.00"), ("expense", "15.00"),
                      ("deposit_to_bank", "200.00")]
    mv_ids = []
    for kind, amount in sent_movements:
        body = movement_body(kind, kind, amount)
        r = await client.post("/cash-movements", headers=auth(admin), json=body)
        stamped = await db.fetchval("SELECT shift_id FROM cash_movements WHERE id = $1",
                                    uuid.UUID(body["id"]))
        check(r.status_code == 201 and str(stamped) == s1_id,
              f"ST4 a {kind} movement of {amount} is 201 and stamped with the shift"
              f" (got {r.status_code}, stamp={stamped})")
        mv_ids.append(body)
    r = await client.post("/cash-movements", headers=auth(admin), json=mv_ids[0])
    check(r.status_code == 200 and r.json().get("id") == mv_ids[0]["id"],
          f"ST5 a movement replay (same key) is 200 with the same id (got {r.status_code})")
    r = await client.get(f"/cash-movements?shift_id={s1_id}", headers=auth(admin))
    listed = {m["id"] for m in r.json().get("movements", [])} if r.status_code == 200 else set()
    check(listed == {b["id"] for b in mv_ids},
          f"ST6 GET /cash-movements lists exactly the four movements of the shift ({len(listed)})")

    # ------------------------------------------------------------------ CL
    header("CL  close with a count that differs")
    fig, parts = await rows_figure(db, s1_id)
    # The literal arithmetic over what THIS PROOF SENT, a second independent side.
    sent = (Decimal("500.00") + Decimal("100.00") - Decimal("5.00") - Decimal("15.00")
            - Decimal("200.00") - Decimal("30.00") - Decimal("20.00"))
    check(fig == sent, f"CL0 the rows-derived figure equals the sent-amounts figure"
                       f" ({fig} vs {sent}; {len(parts['cash_payment_ids'])} cash payments,"
                       f" {parts['movements']} movements)")
    counted = fig - Decimal("3.50")
    r = await client.post(f"/shifts/{s1_id}/close", headers=auth(admin),
                          json={"counted_cash": str(counted)})
    body = r.json() if r.status_code == 200 else {}
    check(r.status_code == 200 and body.get("expected_cash") == str(fig)
          and body.get("variance") == "-3.50" and body.get("counted_cash") == str(counted),
          f"CL1 close: 200, expected_cash {body.get('expected_cash')} == the proof's {fig},"
          f" variance {body.get('variance')} == -3.50 (status {r.status_code})")
    row = await db.fetchrow("SELECT * FROM shifts WHERE id = $1", uuid.UUID(s1_id))
    check(row["closed_at"] is not None and row["closed_by"] == admin_id
          and D(row["expected_cash"]) == fig and D(row["counted_cash"]) == counted
          and D(row["variance"]) == counted - fig,
          f"CL2 the row in Postgres carries the five close columns and the figures"
          f" (expected={row['expected_cash']} counted={row['counted_cash']} variance={row['variance']})")
    r = await client.post(f"/shifts/{s1_id}/close", headers=auth(admin),
                          json={"counted_cash": "1.00"})
    check(r.status_code == 409 and detail_of(r).get("code") == "shift_closed",
          f"CL3 a second close is 409 shift_closed (got {r.status_code} {detail_of(r).get('code')!r})")
    r = await client.get("/shifts/current", headers=auth(admin))
    check(r.status_code == 404 and detail_of(r).get("code") == "no_open_shift",
          f"CL4 GET /shifts/current is 404 no_open_shift after the close (sibling OP4)"
          f" (got {r.status_code})")

    # --------------------------------------------------- open S2 for FR/RH
    r = await open_shift(client, admin, "50.00")
    s2_id = r.json().get("id") if r.status_code == 201 else None
    if not check(s2_id is not None, f"setup: a second shift opens after the first closed ({r.status_code})"):
        return

    # ------------------------------------------------------------------ FR
    header("FR  the frozen close (migration 0022's trigger), as recycle_app and over HTTP")
    err, state, _ = await app_try(db, "UPDATE shifts SET counted_cash = expected_cash"
                                      " WHERE id = $1 RETURNING id", uuid.UUID(s1_id))
    check(state == "RF001", f"FR1 as recycle_app, an UPDATE of counted_cash on the CLOSED"
                            f" shift is REFUSED (got {err} {state})")
    err, state, val = await app_try(db, "UPDATE shifts SET opening_float = opening_float + 1"
                                        " WHERE id = $1 RETURNING id", uuid.UUID(s2_id))
    check(err is None and str(val) == s2_id,
          f"FR1+ sibling: the same kind of UPDATE on an OPEN shift is accepted (got {err})")
    r = await client.patch(f"/shifts/{s1_id}", headers=auth(admin),
                           json={"variance_reason": "เงินทอนผิด proof"})
    reason_now = await db.fetchval("SELECT variance_reason FROM shifts WHERE id = $1", uuid.UUID(s1_id))
    check(r.status_code == 200 and reason_now == "เงินทอนผิด proof",
          f"FR2 PATCH sets variance_reason NULL->text once (got {r.status_code})")
    r = await client.patch(f"/shifts/{s1_id}", headers=auth(admin),
                           json={"variance_reason": "a second reason"})
    check(r.status_code == 409 and detail_of(r).get("code") == "shift_reason_frozen",
          f"FR3 a second PATCH is 409 shift_reason_frozen, refused by the trigger"
          f" (got {r.status_code} {detail_of(r).get('code')!r})")
    err, state, _ = await app_try(db, "UPDATE shifts SET variance_reason = 'other'"
                                      " WHERE id = $1 RETURNING id", uuid.UUID(s1_id))
    check(state == "RF001", f"FR4 as recycle_app, rewriting a set reason is REFUSED ({err} {state})")
    r = await client.patch(f"/shifts/{s2_id}", headers=auth(admin),
                           json={"variance_reason": "too early"})
    check(r.status_code == 409 and detail_of(r).get("code") == "shift_open",
          f"FR5 PATCH on an OPEN shift is 409 shift_open (got {r.status_code})")

    # ------------------------------------------------------------------ RH
    header("RH  the locks, by holding them")
    su = await db.su()
    try:
        # RH1: a close-mode hold makes the recording WAIT
        tr = su.transaction()
        await tr.start()
        await su.execute("SELECT id FROM shifts WHERE id = $1 FOR NO KEY UPDATE", uuid.UUID(s2_id))
        pay = payment_body("rh1", "2.00")
        t0 = time.monotonic()
        task = asyncio.create_task(timed(client.post("/payments", headers=auth(admin), json=pay)))
        await asyncio.sleep(0.8)
        waiters = await waiting_queries(db)
        await asyncio.sleep(HOLD - 0.8)
        await tr.rollback()
        r, t_done = await task
        took = t_done - t0
        check(r.status_code == 201 and took >= WAITED and await stamp_of(db, pay["id"]) == s2_id,
              f"RH1 a close-mode hold (FOR NO KEY UPDATE) makes POST /payments WAIT, and it"
              f" is then stamped to the still-open shift ({r.status_code}, {took:.2f}s)")
        check(any("FOR SHARE" in q and "shifts" in q for q in waiters),
              f"RH1b pg_stat_activity names the waiter: the stamp's FOR SHARE on shifts"
              f" (waiting: {[q[:90] for q in waiters]})")
        # RH1n: a recorder-mode hold does NOT make another recording wait
        tr = su.transaction()
        await tr.start()
        await su.execute("SELECT id FROM shifts WHERE id = $1 FOR SHARE", uuid.UUID(s2_id))
        pay = payment_body("rh1n", "2.50")
        t0 = time.monotonic()
        r = await client.post("/payments", headers=auth(admin), json=pay)
        took = time.monotonic() - t0
        await tr.rollback()
        check(r.status_code == 201 and took < FREE and await stamp_of(db, pay["id"]) == s2_id,
              f"RH1n NEGATIVE HALF: a recorder-mode hold (FOR SHARE) does NOT make another"
              f" recording wait ({r.status_code}, {took:.2f}s)")
    finally:
        await su.close()

    # RH2: an in-flight recorder makes the close WAIT, and the figure INCLUDES it
    app = await db.app()
    try:
        tr = app.transaction()
        await tr.start()
        await app.execute("SELECT set_config('app.tenant_id', $1, true)", str(TENANT_A_ID))
        await app.execute("SELECT id FROM shifts WHERE id = $1 AND closed_at IS NULL FOR SHARE",
                          uuid.UUID(s2_id))
        inflight = uuid.uuid4()
        # THE WHOLE ROW POST /payments would write, stamp included, uncommitted.
        await app.execute(
            "INSERT INTO payments (id, tenant_id, branch_id, seller_id, method, amount,"
            " idempotency_key, device_created_at, server_received_at, paid_by, shift_id)"
            " VALUES ($1, $2, $3, $4, 'cash', 4.00, $5, now(), now(), $6, $7)",
            inflight, TENANT_A_ID, branch_id, SELLER_A_ID, f"drawer-{RUN}-inflight",
            admin_id, uuid.UUID(s2_id))
        t0 = time.monotonic()
        task = asyncio.create_task(timed(client.post(f"/shifts/{s2_id}/close", headers=auth(admin),
                                                     json={"counted_cash": "0.00"})))
        await asyncio.sleep(0.8)
        waiters = await waiting_queries(db)
        await asyncio.sleep(HOLD - 0.8)
        await tr.commit()
        r, t_done = await task
        took = t_done - t0
    finally:
        await app.close()
    fig2, parts2 = await rows_figure(db, s2_id)
    body = r.json() if r.status_code == 200 else {}
    check(r.status_code == 200 and took >= WAITED,
          f"RH2 an in-flight recorder (FOR SHARE, uncommitted) makes the close WAIT"
          f" ({r.status_code}, {took:.2f}s)")
    check(any("FOR NO KEY UPDATE" in q and "shifts" in q for q in waiters),
          f"RH2b pg_stat_activity names the waiter: the close's FOR NO KEY UPDATE"
          f" (waiting: {[q[:90] for q in waiters]})")
    check(str(inflight) in parts2["cash_payment_ids"] and body.get("expected_cash") == str(fig2),
          f"RH2c the frozen figure INCLUDES the in-flight payment: expected_cash"
          f" {body.get('expected_cash')} == rows figure {fig2}, which counts payment {inflight}")

    # RH3: a close committing under its lock leaves a concurrent payment stamped NULL
    r = await open_shift(client, admin, "20.00")
    s3_id = r.json().get("id") if r.status_code == 201 else None
    if not check(s3_id is not None, f"setup: a third shift opens ({r.status_code})"):
        return
    app = await db.app()
    try:
        tr = app.transaction()
        await tr.start()
        await app.execute("SELECT set_config('app.tenant_id', $1, true)", str(TENANT_A_ID))
        await app.execute("SELECT set_config('app.actor_id', $1, true)", str(admin_id))
        await app.execute("SELECT set_config('app.actor_username', $1, true)", f"prove_drawer:{RUN}")
        await app.execute("SELECT id FROM shifts WHERE id = $1 FOR NO KEY UPDATE", uuid.UUID(s3_id))
        # The figure as the close route would compute it under this lock: nothing is
        # stamped to s3 yet, so it is the opening float.
        await app.execute(
            "UPDATE shifts SET closed_at = clock_timestamp(), closed_by = $2, counted_cash = 20.00,"
            " expected_cash = 20.00, variance = 0.00 WHERE id = $1", uuid.UUID(s3_id), admin_id)
        pay = payment_body("rh3", "3.00")
        t0 = time.monotonic()
        task = asyncio.create_task(timed(client.post("/payments", headers=auth(admin), json=pay)))
        await asyncio.sleep(HOLD)
        await tr.commit()
        r, t_done = await task
        took = t_done - t0
    finally:
        await app.close()
    fig3, _ = await rows_figure(db, s3_id)
    stamped3 = await stamp_of(db, pay["id"])
    check(r.status_code == 201 and took >= WAITED and stamped3 is None
          and fig3 == Decimal("20.00"),
          f"RH3 a close committing under its lock: the concurrent payment WAITED ({took:.2f}s),"
          f" is 201, stamped NULL (got {stamped3}) and outside the frozen figure ({fig3})")
    # FR6: the ONE permitted transition must carry a real reason. s3 is closed with a
    # NULL reason, so a blank one is exactly the write the freeze would otherwise allow.
    err, state, _ = await app_try(db, "UPDATE shifts SET variance_reason = '   '"
                                      " WHERE id = $1 RETURNING id", uuid.UUID(s3_id))
    check(state == "RF001", f"FR6 as recycle_app, a BLANK reason on a closed shift is REFUSED"
                            f" ({err} {state})")
    err, state, val = await app_try(db, "UPDATE shifts SET variance_reason = 'counted twice'"
                                        " WHERE id = $1 RETURNING id", uuid.UUID(s3_id))
    check(err is None and str(val) == s3_id,
          f"FR6+ sibling: a non-blank first reason on the same shift is accepted ({err})")

    # ------------------------------------------------------------------ RB
    # MEASURED over three runs, and it shapes this cell: released together, the CLOSE
    # won the lock every time (outcome B, 18 of 18 overlapping rounds) -- the payment
    # path does more work before its stamp than the close does before its lock. Delayed
    # starts produced outcome A ONLY in rounds that did NOT overlap (the payment had
    # already committed), and the timings quantise at ~15.6 ms (this box's timer), so
    # a finer offset cannot be scheduled. A race is a coin (lessons/a-lock-is-proven-
    # by-what-waits-not-by-a-race.md): outcome A UNDER CONCURRENCY is RH2's, by holding
    # the lock. Here: the simultaneous rounds must overlap and never lose a payment,
    # and two deliberately SEQUENTIAL rounds (close +60 ms) are the POSITIVE CONTROL
    # that the classifier can see A at all -- so "all B" is not a classifier that
    # never says A.
    offsets_ms = [0] * RACE_ROUNDS + [60, 60]
    header(f"RB  the barrier race: a close and a cash payment released together,"
           f" x{RACE_ROUNDS}, plus 2 sequential control rounds")
    outcomes = {"A_inside": 0, "B_null_or_next": 0, "C_lost": 0}
    control_outcomes: list[str] = []
    exact = True
    overlapped = 0
    for i, offset in enumerate(offsets_ms):
        r = await open_shift(client, admin, "10.00")
        sid = r.json().get("id") if r.status_code == 201 else None
        if sid is None:
            check(False, f"RB setup round {i}: a shift opens ({r.status_code} {r.text[:100]})")
            return
        gate = asyncio.Event()
        times: dict[str, tuple[float, float]] = {}
        pay = payment_body(f"rb{i}", "1.00")

        async def fire(name, coro_fn, delay=0.0):
            await gate.wait()
            if delay:
                await asyncio.sleep(delay)
            t_a = time.monotonic()
            resp = await coro_fn()
            times[name] = (t_a, time.monotonic())
            return resp

        close_t = asyncio.create_task(fire("close", lambda: client.post(
            f"/shifts/{sid}/close", headers=auth(admin), json={"counted_cash": "10.00"}),
            offset / 1000))
        pay_t = asyncio.create_task(fire("pay", lambda: client.post(
            "/payments", headers=auth(admin), json=pay)))
        await asyncio.sleep(0.05)
        gate.set()
        rc_, rp_ = await close_t, await pay_t
        did_overlap = max(t[0] for t in times.values()) < min(t[1] for t in times.values())
        stamp = await stamp_of(db, pay["id"])
        figi, partsi = await rows_figure(db, sid)
        frozen = D(await db.fetchval("SELECT expected_cash FROM shifts WHERE id = $1", uuid.UUID(sid)))
        exact = exact and frozen == figi
        if stamp == sid and pay["id"] in partsi["cash_payment_ids"] and frozen == figi:
            kind = "A inside the frozen figure"
        elif stamp != sid:
            kind = f"B stamped {stamp}"
        else:
            kind = "C STAMPED TO THE CLOSED SHIFT AND MISSING"
        if offset:
            control_outcomes.append(kind[0])
        else:
            overlapped += did_overlap
            outcomes[{"A": "A_inside", "B": "B_null_or_next", "C": "C_lost"}[kind[0]]] += 1
        spans = {k: (round((a - min(t[0] for t in times.values())) * 1000),
                     round((b - min(t[0] for t in times.values())) * 1000))
                 for k, (a, b) in times.items()}
        print(f"      round {i} (close +{offset}ms): close {rc_.status_code} pay {rp_.status_code}"
              f" -> {kind}; frozen {frozen} rows {figi}; overlap={did_overlap} ms={spans}")
    print(f"      simultaneous rounds: {outcomes}; sequential control rounds: {control_outcomes}")
    check(outcomes["C_lost"] == 0 and sum(outcomes.values()) == RACE_ROUNDS,
          f"RB1 no simultaneous round lost a payment: never stamped to the closed shift and"
          f" missing from its figure ({outcomes})")
    check(exact, "RB2 every round's frozen figure equals opening minus EXACTLY the cash"
                 " payments stamped to it")
    check(overlapped == RACE_ROUNDS, f"RB3 the two requests overlapped in every simultaneous"
                                     f" round ({overlapped}/{RACE_ROUNDS}) -- a race, not a sequence")
    check(control_outcomes == ["A", "A"],
          f"RB4 POSITIVE CONTROL: a payment committed BEFORE the close is classified A, inside"
          f" the frozen figure (got {control_outcomes})")

    # ------------------------------------------------------------------ INV
    header("INV invariant 1: the switches OFF, and money is still accepted")
    r1 = await client.patch(f"/branches/{branch_id}", headers=auth(admin),
                            json={"shifts_enabled": True})
    r2 = await client.patch(f"/branches/{branch_id}", headers=auth(admin),
                            json={"shifts_enabled": False})
    r3 = await client.put(f"/branches/{branch_id}/payment-methods/cash", headers=auth(admin),
                          json={"is_active": False})
    pol = await client.get("/shop/policy", headers=auth(admin))
    polb = pol.json() if pol.status_code == 200 else {}
    check(r1.status_code == 200 and r1.json().get("shifts_enabled") is True
          and r2.status_code == 200 and r2.json().get("shifts_enabled") is False
          and r3.status_code == 200 and r3.json().get("is_active") is False
          and polb.get("shifts_enabled") is False
          # `is not None`, never `or`: an EMPTY list is the true answer here (cash
          # was the only method) and `or` read it as missing -- measured, run 1.
          and polb.get("payment_methods") is not None and "cash" not in polb["payment_methods"],
          f"INV0 the switches were WRITTEN: shifts_enabled on then off, cash deactivated, and"
          f" GET /shop/policy reads them back ({polb})")
    pay = payment_body("inv", "6.00")
    r = await client.post("/payments", headers=auth(admin), json=pay)
    check(r.status_code == 201, f"INV1 a CASH payment is ACCEPTED with cash deactivated and"
                                f" shifts off ({r.status_code} {r.text[:100]})")
    bill = bill_body("inv")
    r = await client.post("/bills", headers=auth(admin), json=bill)
    auto = await db.fetchval("SELECT count(*) FROM payments WHERE tenant_id = $1 AND"
                             " idempotency_key = $2", TENANT_A_ID, f"auto:{bill['id']}")
    check(r.status_code == 201 and auto == 1,
          f"INV2 a bill is ACCEPTED and its automatic cash payment written (bill"
          f" {r.status_code}, auto rows {auto})")
    r = await client.put(f"/branches/{branch_id}/payment-methods/not_a_method",
                         headers=auth(admin), json={"is_active": True})
    check(r.status_code == 422, f"INV3 a method outside the set is 422 ({r.status_code})")
    r = await client.put(f"/branches/{branch_id}/payment-methods/cash", headers=auth(admin),
                         json={"is_active": True})
    check(r.status_code == 200 and r.json().get("is_active") is True,
          f"INV4 cash re-activated (restore) ({r.status_code})")

    # ------------------------------------------------------------------ PM
    header("PM  staff holds no shifts.manage: 403 on every shift route")
    probes = [
        ("POST /shifts", client.post("/shifts", headers=auth(staff),
                                     json={"id": str(uuid.uuid4()), "opening_float": "1.00"})),
        ("GET /shifts/current", client.get("/shifts/current", headers=auth(staff))),
        ("POST /shifts/{id}/close", client.post(f"/shifts/{s2_id}/close", headers=auth(staff),
                                                json={"counted_cash": "1.00"})),
        ("PATCH /shifts/{id}", client.patch(f"/shifts/{s2_id}", headers=auth(staff),
                                            json={"variance_reason": "x"})),
        ("POST /cash-movements", client.post("/cash-movements", headers=auth(staff),
                                             json=movement_body("staff", "expense", "1.00"))),
        ("GET /cash-movements", client.get(f"/cash-movements?shift_id={s1_id}",
                                           headers=auth(staff))),
    ]
    for name, coro in probes:
        r = await coro
        d = detail_of(r)
        check(r.status_code == 403 and d.get("code") == "permission_required"
              and d.get("required_permission") == "shifts.manage",
              f"PM staff on {name}: 403 permission_required naming shifts.manage"
              f" (got {r.status_code} {d.get('code')!r} {d.get('required_permission')!r})")

    # ------------------------------------------------------------------ CH / MK
    header("CH  the shop's own channels, and a payment naming one")
    proxy = "08" + str(uuid.uuid4().int)[:8]
    account = str(uuid.uuid4().int)[:12]
    r = await client.post("/shop/payment-channels", headers=auth(admin), json={
        "kind": "promptpay", "label": f"PP {RUN}", "promptpay_proxy": proxy,
        "promptpay_proxy_type": "phone"})
    ch_pp = r.json().get("id") if r.status_code == 201 else None
    r2 = await client.post("/shop/payment-channels", headers=auth(admin), json={
        "kind": "bank_account", "label": f"BANK {RUN}", "bank_code": "014",
        "account_no": account, "account_name": "the shop"})
    ch_bank = r2.json().get("id") if r2.status_code == 201 else None
    check(ch_pp is not None and ch_bank is not None,
          f"CH1 admin creates a promptpay and a bank channel ({r.status_code}/{r2.status_code})")
    r = await client.post("/shop/payment-channels", headers=auth(admin), json={
        "kind": "promptpay", "label": "bad", "bank_code": "014"})
    check(r.status_code == 422 and detail_of(r).get("code") == "channel_incoherent",
          f"CH2 an incoherent channel is 422 channel_incoherent ({r.status_code})")
    pay = payment_body("ch", "8.00", method="transfer", channel_id=ch_bank)
    r = await client.post("/payments", headers=auth(admin), json=pay)
    stored = await db.fetchval("SELECT channel_id FROM payments WHERE id = $1", uuid.UUID(pay["id"]))
    check(r.status_code == 201 and str(stored) == ch_bank,
          f"CH3 a payment naming the shop's channel stores it ({r.status_code}, {stored})")
    r = await client.patch(f"/shop/payment-channels/{ch_bank}", headers=auth(admin),
                           json={"is_active": False, "label": f"BANK {RUN} retired"})
    check(r.status_code == 200 and r.json().get("is_active") is False,
          f"CH4 PATCH label and is_active 200 ({r.status_code})")
    r = await client.patch(f"/shop/payment-channels/{ch_bank}", headers=auth(admin),
                           json={"account_no": "999"})
    check(r.status_code == 422, f"CH5 PATCH of an identifying field is 422 ({r.status_code})")
    pay = payment_body("chx", "9.00", method="transfer", channel_id=ch_bank)
    r = await client.post("/payments", headers=auth(admin), json=pay)
    check(r.status_code == 201, f"CH6 a DEACTIVATED channel is ACCEPTED -- the money already"
                                f" moved ({r.status_code} {r.text[:100]})")
    b_user = await db.fetchval("SELECT id FROM users WHERE tenant_id = $1 ORDER BY username LIMIT 1",
                               TENANT_B_ID)
    ch_b = uuid.uuid4()
    await db.exec_as(TENANT_B_ID,
                     "INSERT INTO shop_payment_channels (id, tenant_id, kind, label, promptpay_proxy,"
                     " promptpay_proxy_type, created_by) VALUES ($1, $2, 'promptpay', 'B', '0800000001',"
                     " 'phone', $3)", ch_b, TENANT_B_ID, b_user)
    pay = payment_body("chb", "9.50", method="transfer", channel_id=str(ch_b))
    r = await client.post("/payments", headers=auth(admin), json=pay)
    check(r.status_code == 422 and detail_of(r).get("code") == "channel_unknown",
          f"CH7 ANOTHER TENANT's channel is 422 channel_unknown (the composite FK, translated)"
          f" ({r.status_code} {detail_of(r).get('code')!r})")

    header("MK  masking: a principal without shop.settings.write never gets the identifier")
    ra = await client.get("/shop/payment-channels", headers=auth(admin))
    rs = await client.get("/shop/payment-channels", headers=auth(staff))
    grams = {s[i:i + 5] for s in (proxy, account) for i in range(len(s) - 4)}
    admin_hits = sorted(g for g in grams if g in ra.text)
    staff_hits = sorted(g for g in grams if g in rs.text)
    check(ra.status_code == 200 and proxy in ra.text and account in ra.text and admin_hits,
          f"MK0 POSITIVE CONTROL: the scanner finds the full identifiers in the ADMIN"
          f" response ({len(admin_hits)} of {len(grams)} 5-grams)")
    check(rs.status_code == 200 and not staff_hits,
          f"MK1 the STAFF response carries no 5-character piece of either identifier"
          f" (found {staff_hits})")
    srows = {c["id"]: c for c in rs.json().get("channels", [])} if rs.status_code == 200 else {}
    leaked_keys = [k for c in srows.values() for k in ("promptpay_proxy", "account_no") if k in c]
    check(not leaked_keys and srows.get(ch_pp, {}).get("identifier_last4") == proxy[-4:]
          and srows.get(ch_bank, {}).get("identifier_last4") == account[-4:]
          and srows.get(ch_bank, {}).get("account_name") == "the shop",
          f"MK2 staff rows carry no full-identifier key and the right last four"
          f" (leaked keys {leaked_keys})")


# ---------------------------------------------------------------------------
# cells that need no server
# ---------------------------------------------------------------------------
async def run_db_cells(db: Db, scratch: str) -> None:
    header("BW  born with cash: a shop provisioned through provision_shop.py")
    name = f"drawer-bw-{RUN}"
    env = dict(ORIG_ENV)
    env["PYTHONIOENCODING"] = "utf-8"
    cp = subprocess.run([sys.executable, os.path.join("scripts", "provision_shop.py"),
                         "--database", scratch, "--name", name], cwd=SERVER_DIR, env=env,
                        capture_output=True, text=True, timeout=300,
                        encoding="utf-8", errors="replace")
    tid = await db.fetchval("SELECT id FROM tenants WHERE name = $1", name)
    rows = await db.fetch("SELECT method, is_active FROM branch_payment_methods WHERE tenant_id = $1",
                          tid) if tid else []
    check(cp.returncode == 0 and tid is not None,
          f"BW0 provision_shop.py exit {cp.returncode}, the tenant exists"
          + ("" if cp.returncode == 0 else f": {(cp.stdout + cp.stderr)[-300:]}"))
    check([(r["method"], r["is_active"]) for r in rows] == [("cash", True)],
          f"BW1 its born-with branch holds exactly one active cash row"
          f" (got {[tuple(r) for r in rows]})")

    header("RV  hard rule 5 at the grant level, as recycle_app")
    a_bill = await db.fetchval("SELECT id FROM purchase_bills WHERE tenant_id = $1 LIMIT 1", TENANT_A_ID)
    for t, pred in (("purchase_bills", "id = $1"), ("purchase_bill_items", "bill_id = $1"),
                    ("doc_no_counters", "$1::uuid IS NOT NULL")):
        err, _, _ = await app_try(db, f"DELETE FROM {t} WHERE {pred}", a_bill)
        check(err == "InsufficientPrivilegeError", f"RV DELETE on {t} is REFUSED (got {err})")
        err, _, n = await app_try(db, f"SELECT count(*) FROM {t}")
        check(err is None and n is not None and n > 0,
              f"RV control: a SELECT on {t} works on the same connection shape (n={n})")

    header("X  reconcile.py on the scratch after every write")
    cp = subprocess.run([sys.executable, os.path.join("scripts", "reconcile.py"),
                         "--database", scratch, "--verbose"], cwd=SERVER_DIR,
                        env={**ORIG_ENV, "PYTHONIOENCODING": "utf-8"}, capture_output=True,
                        text=True, timeout=600, encoding="utf-8", errors="replace")
    out = cp.stdout + cp.stderr
    present = [c for c in ("H1", "H2", "H3", "P1", "P2", "P3", "P4")
               if any(ln.strip().startswith(f"[OK  ] {c} ") for ln in out.splitlines())]
    check(cp.returncode == 0, f"X1 reconcile.py exits 0 on the scratch (exit {cp.returncode})")
    check(present == ["H1", "H2", "H3", "P1", "P2", "P3", "P4"],
          f"X2 the report carries H1..H3 and P1..P4 as [OK] lines (present {present})")
    if cp.returncode != 0:
        print(out[-3000:])


async def run_round_trip(db: Db, paid_bill: str, drop_refusal_row: bool) -> None:
    header("RT  the 0022 round trip on a scratch BUILT FROM EMPTY (explicit targets 0021 / 0022)")
    head = await db.fetchval("SELECT version_num FROM alembic_version")
    check(head is not None and head >= "0022", f"RT0 the empty-built scratch is at 0022 or later ({head})")
    a_branch = await db.fetchval("SELECT id FROM branches WHERE tenant_id = $1 ORDER BY code LIMIT 1",
                                 TENANT_A_ID)
    a_user = await db.fetchval("SELECT id FROM users WHERE tenant_id = $1 ORDER BY username LIMIT 1",
                               TENANT_A_ID)
    # A CLOSED shift present: the docstring says it is NOT a reason to refuse.
    await db.exec_as(TENANT_A_ID,
                     "INSERT INTO shifts (id, tenant_id, branch_id, opened_at, opened_by, opening_float,"
                     " closed_at, closed_by, counted_cash, expected_cash, variance)"
                     " VALUES ($1, $2, $3, now(), $4, 5.00, now(), $4, 5.00, 5.00, 0.00)",
                     uuid.uuid4(), TENANT_A_ID, a_branch, a_user)
    rc, out = run_alembic(db.scratch, "downgrade", "0021")
    check(rc == 0, f"RT1 downgrade to 0021 exit 0 with a CLOSED shift present (got {rc})"
                   + ("" if rc == 0 else f": {out[-400:]}"))
    state = await db.fetchrow(
        "SELECT (SELECT version_num FROM alembic_version) AS head,"
        " (SELECT count(*) FROM permissions) AS perms,"
        " (SELECT count(*) FROM pg_trigger WHERE tgname IN ('shifts_freeze_closed',"
        "   'branches_born_with_cash')) AS trig,"
        " (SELECT count(*) FROM information_schema.columns WHERE table_name = 'payments'"
        "   AND column_name = 'channel_id') AS col,"
        " has_table_privilege('recycle_app', 'public.purchase_bills', 'DELETE') AS del_bills,"
        " has_table_privilege('recycle_app', 'public.doc_no_counters', 'DELETE') AS del_ctr,"
        " obj_description('public.purchase_bills'::regclass, 'pg_class') AS comment")
    check(state["head"] == "0021" and state["perms"] == 14 and state["trig"] == 0
          and state["col"] == 0 and state["del_bills"] and state["del_ctr"]
          and state["comment"] is None,
          f"RT2 at 0021: 14 codes, no trigger, no channel_id, the DELETE grant RESTORED from"
          f" the recorded marker, comment cleared ({dict(state)})")
    bf = uuid.uuid4()
    await db.exec_as(TENANT_A_ID,
                     "INSERT INTO branches (id, tenant_id, code, name, doc_prefix, is_active)"
                     " VALUES ($1, $2, $3, 'backfill probe', 'QZ', true)",
                     bf, TENANT_A_ID, f"BF{RUN[:4].upper()}")
    n0 = await db.fetchval("SELECT count(*) FROM branch_payment_methods WHERE branch_id = $1", bf)
    check(n0 == 0, f"RT3 control: a branch inserted at 0021 has NO cash row (n={n0}) -- no"
                   " trigger existed to give it one")
    rc, out = run_alembic(db.scratch, "upgrade", "0022")
    n1 = await db.fetchrow("SELECT count(*) AS n, bool_and(method = 'cash' AND is_active) AS ok"
                           " FROM branch_payment_methods WHERE branch_id = $1", bf)
    check(rc == 0 and n1["n"] == 1 and n1["ok"],
          f"RT4 upgrade to 0022 exit {rc}: that branch now holds its cash row ({dict(n1)})"
          + ("" if rc == 0 else f": {out[-400:]}"))
    back = await db.fetchrow(
        "SELECT (SELECT count(*) FROM permissions) AS perms,"
        " has_table_privilege('recycle_app', 'public.purchase_bills', 'DELETE') AS del_bills")
    check(back["perms"] == 15 and not back["del_bills"],
          f"RT5 at 0022 again: 15 codes, no app DELETE on purchase_bills ({dict(back)})")

    header("RF  a payment naming a channel makes the downgrade REFUSE")
    ch = uuid.uuid4()
    await db.exec_as(TENANT_A_ID,
                     "INSERT INTO shop_payment_channels (id, tenant_id, kind, label, promptpay_proxy,"
                     " promptpay_proxy_type, created_by) VALUES ($1, $2, 'promptpay', 'RF', '0800000002',"
                     " 'phone', $3)", ch, TENANT_A_ID, a_user)
    # The refusing row is MADE HERE, on the empty build: the automatic payment the server
    # wrote for the bill seed_paid_bill posted is stamped with the channel. Read back, never
    # assumed (the gate repair, 2026-10-09: `payments LIMIT 1` on a dev dump took whatever
    # was there). --disprove-refusal withholds the stamp, and RF1 alone must go red.
    pid = await db.fetchval("SELECT id FROM payments WHERE tenant_id = $1 AND idempotency_key = $2",
                            TENANT_A_ID, f"auto:{paid_bill}")
    check(pid is not None, f"RF0 the seeded bill's automatic payment exists on the empty build ({pid})")
    if not drop_refusal_row:
        await db.exec_as(TENANT_A_ID, "UPDATE payments SET channel_id = $1 WHERE id = $2", ch, pid)
    else:
        print("  !! DISPROOF: the refusing row is NOT made (no payment names a channel)")
    stamped = await db.fetchval("SELECT count(*) FROM payments WHERE channel_id IS NOT NULL")
    rc, out = run_alembic(db.scratch, "downgrade", "0021")
    head = await db.fetchval("SELECT version_num FROM alembic_version")
    check(rc != 0 and "REFUSING to downgrade 0022" in out
          and "payments naming a shop payment channel" in out and head == "0022",
          f"RF1 the downgrade REFUSED over the {stamped} payment(s) this cell stamped (exit {rc},"
          f" refusal named={'REFUSING to downgrade 0022' in out},"
          f" names payments={'payments naming a shop payment channel' in out}, head still {head})")


BREAKS = {
    "freeze_trigger": "DROP TRIGGER shifts_freeze_closed ON shifts",
    "born_trigger": "DROP TRIGGER branches_born_with_cash ON branches",
    "channel_fk": "ALTER TABLE payments DROP CONSTRAINT fk_payments_channel",
    "revoke_bills": "GRANT DELETE ON purchase_bills TO recycle_app",
    "one_open_index": "DROP INDEX uq_shifts_one_open_per_branch",
}


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
async def amain(args) -> int:
    global BASE
    live_name = _APP_URL.database
    scratch = SCRATCH_DB
    print(f"prove_drawer  RUN={RUN}  scratch={scratch}  break={args.brk or '(none)'}")
    if scratch == live_name:
        print("REFUSED: the scratch name equals the live database.")
        return 2
    restore_scratch(live_name, scratch)
    db = Db(scratch)
    head = await db.fetchval("SELECT version_num FROM alembic_version")
    check(head is not None and head >= "0022", f"E0: the scratch is at alembic 0022 or later ({head})")
    perm = await db.fetchval("SELECT count(*) FROM permissions WHERE code = 'shifts.manage'")
    check(perm == 1, f"E0: shifts.manage is in the catalogue, read from Postgres (n={perm})")
    if head is None or head < "0022":
        return 1
    if args.brk:
        if args.brk not in BREAKS:
            raise SystemExit(f"unknown --break {args.brk!r}; choose from {sorted(BREAKS)}")
        c = await db.su()
        try:
            await c.execute(BREAKS[args.brk])
        finally:
            await c.close()
        print(f"  !! DISPROOF: {BREAKS[args.brk]}")

    os.environ["APP_DATABASE_URL"] = _APP_URL.set(database=scratch).render_as_string(hide_password=False)
    os.environ["DIRECTORY_DATABASE_URL"] = _DIR_URL.set(database=scratch).render_as_string(hide_password=False)
    port = free_port()
    BASE = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(mode="w", suffix=".log", prefix="prove_drawer_",
                                      delete=False, encoding="utf-8")
    proc = subprocess.Popen([sys.executable, "-u", "-m", "uvicorn", "app.main:app",
                             "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
                            cwd=SERVER_DIR, env=dict(os.environ), stdout=log, stderr=subprocess.STDOUT)
    print(f"  child uvicorn pid={proc.pid} on {BASE} against scratch {scratch!r} (log {log.name})")
    try:
        why = wait_for_health(proc)
        if why:
            check(False, f"E0: server started -- {why}")
            return 1
        paths = httpx.get(f"{BASE}/openapi.json", timeout=5.0).json().get("paths", {})
        need = [("/shifts", "post"), ("/shifts/current", "get"), ("/shifts/{shift_id}/close", "post"),
                ("/shifts/{shift_id}", "patch"), ("/cash-movements", "post"),
                ("/cash-movements", "get"), ("/shop/payment-channels", "get"),
                ("/branches/{branch_id}/payment-methods/{method}", "put")]
        missing = [f"{m.upper()} {p}" for p, m in need if m not in paths.get(p, {})]
        if not check(not missing, f"E0: the child serves THIS code: the drawer routes are"
                                  f" declared (missing {missing})"):
            return 1
        async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
            await run_cells(client, db, scratch)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()
    os.environ["APP_DATABASE_URL"] = ORIG_ENV["APP_DATABASE_URL"]
    os.environ["DIRECTORY_DATABASE_URL"] = ORIG_ENV["DIRECTORY_DATABASE_URL"]
    await run_db_cells(db, scratch)
    run_g()
    if not args.brk:
        # BUILT FROM EMPTY (the gate repair, 2026-10-09), never a dump of dev: a dev dump
        # carries whatever drawer rows other proofs and walks left, and 0022's downgrade
        # refused over them before RT1 could judge the mechanics.
        await build_empty_scratch(live_name, scratch)
        paid_bill = seed_paid_bill(scratch)
        await run_round_trip(db, paid_bill, args.disprove_refusal)

    header("verdict")
    total = len(passes) + len(failures)
    print(f"  cells: {total}   OK: {len(passes)}   RED: {len(failures)}")
    if failures:
        print("  THESE CLAIMS DID NOT HOLD:")
        for f in failures:
            print(f"    - {f}")
    return 1 if failures else 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Prove the drawer routes (shifts unit, commit 2).")
    ap.add_argument("--break", dest="brk", default=None,
                    help=f"DISPROOF: break one DB object first. One of {sorted(BREAKS)}")
    ap.add_argument("--disprove-refusal", action="store_true",
                    help="DISPROOF: RF does not make the row that makes the downgrade refuse;"
                         " RF1 alone must go red")
    return asyncio.run(amain(ap.parse_args()))


if __name__ == "__main__":
    rc = 1  # PRESET RED: only a completed clean tally clears it
    try:
        rc = main()
    except SystemExit:
        raise
    except BaseException:
        import traceback
        traceback.print_exc()
        rc = 1
    print(f"PROVE_DRAWER_EXIT={rc}")
    sys.exit(rc)
