"""Prove the shifts-and-cash-drawer SCHEMA (migration 0021, STRUCTURE.md 2.4/1.6,
commit 1 of the shifts unit). This commit adds NO route, so the subject is the
SCHEMA: what it ACCEPTS and what it REFUSES.

    uv run python scripts/prove_shifts.py                 (self-restores a scratch from a live dump)
    uv run python scripts/prove_shifts.py --break <name>  (DISPROOF: drop one object first, watch its cell redden)

Model on prove_payments.py / prove_branches.py: dump the live database named in
APP_DATABASE_URL (which must already be at 0021), restore a SCRATCH from it, and
drive the schema DIRECTLY over asyncpg -- as recycle_app (RLS-bound) for the
constraint/grant/audit/isolation cells, and as the cluster superuser for setup and
the cross-tenant seeds only. No uvicorn: there is no route to reach. Per-run uuids
and idempotency keys everywhere, so the script is green TWICE in a row with no
reseed (proof-must-run-twice); run 2 restores a fresh scratch and mints fresh keys.

THE VERDICT IS PRESET TO RED. rc starts at 1 and is cleared to 0 only by a
completed run whose tally has no failures; a crash leaves Python's own non-zero
exit and no PROVE_SHIFTS_EXIT=0 line (a-default-exit-code-is-a-default-verdict).

EVERY NEGATIVE CELL HAS A POSITIVE SIBLING in the same run, so "refused" is
distinguishable from an instrument that never looked. The cells:

  E0  the scratch reads alembic 0021 and holds the four tables and two columns.
  SC  shifts close-consistency: a PARTIAL close is REFUSED; a FULL close is
      ACCEPTED; an all-NULL (open) close is ACCEPTED.
  OI  the partial unique index: a SECOND OPEN shift on one branch is REFUSED; a
      second shift on a DIFFERENT branch is ACCEPTED; a new shift after the first
      is CLOSED, on the same branch, is ACCEPTED.
  CM  cash_movements: a bad kind is REFUSED; EACH of the four valid kinds is
      ACCEPTED; a zero and a negative amount are REFUSED; a duplicate
      idempotency_key within a tenant is REFUSED and the SAME key in ANOTHER tenant
      is ACCEPTED; a partial void is REFUSED and a full void ACCEPTED.
  BPM branch_payment_methods: a method outside the set is REFUSED; the accepted set
      EQUALS payments.method's, asserted MEMBER BY MEMBER out of the catalogue (not
      a count, not a literal on both sides); every branch HAS its born-with cash row.
  CH  shop_payment_channels: an incoherent row for EACH kind is REFUSED; a coherent
      row of each kind is ACCEPTED; a bad kind and a bad proxy type are REFUSED.
  XT  cross-tenant: a shift naming ANOTHER tenant's branch is REFUSED (fk), the
      same-tenant shift ACCEPTED; a payment.shift_id pointing at another tenant's
      shift is REFUSED, NULL is accepted, and a same-tenant shift is accepted.
  GR  grants: as recycle_app, a DELETE on EACH new table is REFUSED, with an INSERT
      ACCEPTED on the same table as the control (a revoked privilege vs a dead
      connection).
  AU  audit (the owner's 2026-09-18 split): an UPDATE on branch_payment_methods AND on
      shifts (both AUDITED) each write an audit_log row read back with THIS run's actor;
      a write to cash_movements (NOT audited) writes none -- the audited rows are the
      positive control that the reader fires, so the absence is not an instrument that
      never looked.
  RT  round trip on a clean scratch: downgrade drops the objects, upgrade restores
      them.
  RF  the refusal: with a real shift present, `alembic downgrade` REFUSES (non-zero
      exit, the message naming the shift), read as an error not inferred from an
      absence.

--break <name> drops ONE object before the cells run (the DISPROOF), so exactly
the cell that tests it reddens. Names: close_consistency, one_open_index,
cash_kind, cash_amount, cash_idem, cash_void, method_check, channel_coherent,
shifts_fk_branch, payments_shift_fk, shifts_delete_grant, audit_bpm, audit_shifts,
audit_cm_add, bpm_delete_grant, bpm_insert_revoke.

RT and RF run on a scratch BUILT FROM EMPTY (`alembic upgrade head`, scripts/seed_dev.py,
one bill through the real POST /bills) since the gate repair of 2026-10-09 -- never on a
dump of dev, whose drawer rows made both downgrades refuse before the cells could judge
them. The cells above still run on a dump of dev; what they insert is chosen by reading
its rows (the BPM and GR method), never assumed absent. RF makes its own refusing row
(an open shift); --disprove-refusal withholds it, and the RF cells alone must go red.
"""
from __future__ import annotations

import argparse
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
    TENANT_A_ID,
    TENANT_A_PASSWORD,
    TENANT_B_ID,
)

try:  # pragma: no cover
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
from lane import scratch_name  # noqa: E402  (scratch names are decided in lane.py only)
SCRATCH_DB = scratch_name("recycle_shifts_scratch")
RUN = uuid.uuid4().hex[:8]

_APP_URL = make_url(os.environ["APP_DATABASE_URL"])
_METHODS = ("cash", "promptpay", "transfer", "write_off")
# The reserved system actor (db.SYSTEM_ACTOR_ID, all-zeros). shifts and the two config
# tables are audited, and audit_capture RAISES on a write with no actor; so every write
# carries one. A real actor tags the row with this run (the AU cells find it by that
# username); without one this system actor keeps an audited write from failing closed.
SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000"

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


# ---------------------------------------------------------------------------
# subprocess helpers: dump/restore and alembic on the scratch (prove_branches model)
# ---------------------------------------------------------------------------
def restore_scratch() -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-shifts-dump-{RUN}")
    label = f"shifts-{RUN}"
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "backup_db.py"),
         "--db", _APP_URL.database, "--out", out, "--label", label],
        cwd=SERVER_DIR, capture_output=True, text=True, timeout=300,
        encoding="utf-8", errors="replace")
    if cp.returncode != 0:
        raise RuntimeError(f"backup_db.py failed:\n{(cp.stdout + cp.stderr)[-800:]}")
    dumps = [d for d in os.listdir(out) if d.endswith(label)]
    if len(dumps) != 1:
        raise RuntimeError(f"expected one dump dir ending {label!r}, got {dumps}")
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "restore_db.py"),
         os.path.join(out, dumps[0]), "--into", SCRATCH_DB],
        cwd=SERVER_DIR, capture_output=True, text=True, timeout=300,
        encoding="utf-8", errors="replace")
    if cp.returncode != 0:
        raise RuntimeError(f"restore_db.py -> {SCRATCH_DB} failed:\n{(cp.stdout + cp.stderr)[-800:]}")
    shutil.rmtree(out, ignore_errors=True)


def run_alembic(*args: str) -> tuple[int, str]:
    env = dict(os.environ)
    env["MIGRATION_DATABASE_URL"] = (
        make_url(os.environ["MIGRATION_DATABASE_URL"]).set(database=SCRATCH_DB)
        .render_as_string(hide_password=False))
    env["PYTHONIOENCODING"] = "utf-8"
    cp = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=SERVER_DIR, env=env,
                        capture_output=True, text=True, timeout=600,
                        encoding="utf-8", errors="replace")
    return cp.returncode, cp.stdout + cp.stderr


# ---------------------------------------------------------------------------
# THE EMPTY BUILD (the gate repair, 2026-10-09). The round trip and the refusal test
# MIGRATION MECHANICS, so their scratch is built from an EMPTY database brought to head
# by `alembic upgrade head`, seeded by scripts/seed_dev.py, and given ONE paid bill
# through the real POST /bills -- never a dump of dev, which holds whatever every other
# proof, live round and device walk left there (lessons/proof-must-run-twice.md, the
# 2026-10-09 amendment). Measured 2026-10-09 before this was written: an empty database
# upgrades to 0022 and seeds clean (2 tenants, 2 branches, 4 users, 2 born-with cash rows,
# no bill, no shift, no channel). The same helper lives in prove_drawer.py: the brief's
# fence names these three proofs and no shared module.
# ---------------------------------------------------------------------------
def _qi(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _ql(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


_ACL_PRIVS = {"C": "CREATE", "c": "CONNECT", "T": "TEMPORARY"}


def scratch_env(scratch: str) -> dict:
    env = dict(os.environ)
    for key in ("APP_DATABASE_URL", "DIRECTORY_DATABASE_URL", "MIGRATION_DATABASE_URL"):
        env[key] = make_url(os.environ[key]).set(database=scratch).render_as_string(hide_password=False)
    env["PYTHONIOENCODING"] = "utf-8"
    return env


INIT_SQL = os.path.join(SERVER_DIR, "db", "init", "00_init_roles.sql")


async def apply_init_in_database(scratch: str) -> None:
    """The IN-DATABASE half of db/init/00_init_roles.sql -- every statement after its
    `\\connect recycle` -- run on `scratch` as the superuser, READ FROM THE FILE so the two
    cannot drift. It carries the schema ownership, the PUBLIC revoke, the app role's USAGE
    and the ALTER DEFAULT PRIVILEGES that hands recycle_app DELETE on doc_no_counters; an
    empty build without it differs from every real database (measured 2026-10-09 in
    prove_drawer's RT2, del_ctr False on the first empty build). The parser must find the
    ALTER DEFAULT PRIVILEGES statement or it raises."""
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


async def build_empty_scratch(scratch: str) -> None:
    """DROP and CREATE `scratch` with the LIVE database's owner, encoding, locale, ACL and
    per-database settings (the facts restore_db.py takes from its manifest), then
    `alembic upgrade head` and scripts/seed_dev.py. Raises on any step's failure."""
    if scratch == _APP_URL.database:
        raise RuntimeError("refusing to build an empty scratch over the live database")
    c = await asyncpg.connect(host=_APP_URL.host, port=_APP_URL.port, user="postgres",
                              password="postgres", database="postgres")
    try:
        row = await c.fetchrow(
            "SELECT pg_get_userbyid(d.datdba) AS owner, pg_encoding_to_char(d.encoding) AS enc,"
            " d.datcollate, d.datctype, d.datacl::text AS acl FROM pg_database d WHERE d.datname = $1",
            _APP_URL.database)
        settings = await c.fetch(
            "SELECT unnest(s.setconfig) AS kv FROM pg_db_role_setting s JOIN pg_database d"
            " ON d.oid = s.setdatabase WHERE d.datname = $1 AND s.setrole = 0", _APP_URL.database)
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


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def seed_paid_bill(scratch: str) -> str:
    """ONE bill through the REAL POST /bills on a child uvicorn bound to `scratch` (the
    switch is off at birth, so the server writes the automatic payment itself) -- a row
    the product produces, not one written by hand
    (lessons/a-proof-fixture-must-be-a-row-the-product-could-produce.md)."""
    port = _free_port()
    base = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(mode="w", suffix=".log", prefix="prove_shifts_seed_",
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
            "device_created_at": dt.datetime.now(tz=dt.timezone.utc).isoformat(),
            "idempotency_key": f"shifts-rt-{RUN}",
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


async def absent_method(su: asyncpg.Connection, branch, method_set: list[str]) -> str | None:
    """A method in the CHECK set that `branch` does NOT already hold, chosen BY READING its
    rows (the gate repair, 2026-10-09: a fixed 'transfer' collided with a row a settings
    toggle left on dev, and the next migration makes transfer born-with). None when the
    branch holds every method."""
    held = {r["method"] for r in await su.fetch(
        "SELECT method FROM branch_payment_methods WHERE branch_id = $1", branch)}
    for m in method_set:
        if m not in held:
            return m
    return None


async def branch_lacking_a_method(su: asyncpg.Connection, tid, branch, method_set: list[str]):
    """(branch, method) such that the branch does NOT hold the method -- `branch` itself
    when it lacks one, otherwise a branch CREATED for the test (the born-with trigger gives
    it cash alone). Read from the rows, never assumed."""
    m = await absent_method(su, branch, method_set)
    if m is not None:
        return branch, m
    new = uuid.uuid4()
    async with su.transaction():
        await su.execute("SELECT set_config('app.tenant_id', $1, true)", str(tid))
        await su.execute("SELECT set_config('app.actor_id', $1, true)", SYSTEM_ACTOR)
        await su.execute("SELECT set_config('app.actor_username', $1, true)", "system:prove_shifts")
        await su.execute(
            "INSERT INTO branches (id, tenant_id, code, name, doc_prefix, is_active)"
            " VALUES ($1, $2, $3, 'method probe', 'QM', true)", new, tid, f"M{RUN[:5].upper()}")
    m = await absent_method(su, new, method_set)
    if m is None:
        raise RuntimeError("a branch created for the test already holds every method")
    return new, m


# ---------------------------------------------------------------------------
# connections
# ---------------------------------------------------------------------------
async def app_conn() -> asyncpg.Connection:
    """recycle_app, RLS-bound, exactly what a request uses."""
    return await asyncpg.connect(
        host=_APP_URL.host, port=_APP_URL.port, user=_APP_URL.username,
        password=_APP_URL.password, database=SCRATCH_DB)


async def su_conn() -> asyncpg.Connection:
    """The cluster superuser, for setup, cross-tenant seeds, and --break only."""
    return await asyncpg.connect(
        host=_APP_URL.host, port=_APP_URL.port, user="postgres",
        password="postgres", database=SCRATCH_DB)


# ---------------------------------------------------------------------------
# insert-and-judge, each in its own transaction so a refusal rolls back cleanly
# ---------------------------------------------------------------------------
async def _try(conn: asyncpg.Connection, tid, sql: str, args: tuple,
               *, actor: str | None = None, commit: bool = False) -> str | None:
    """Run one statement under tenant context. Return None on success, else the
    error class name. Rolls back unless commit=True (and it succeeded)."""
    tr = conn.transaction()
    await tr.start()
    err: str | None = None
    try:
        await conn.execute("SELECT set_config('app.tenant_id', $1, true)", str(tid))
        # ALWAYS set an actor: shifts and the two config tables are audited, so a write
        # with no actor RAISES. A real actor tags the row with this run so the AU cells
        # find it; otherwise the SYSTEM actor keeps the write from failing closed.
        await conn.execute("SELECT set_config('app.actor_id', $1, true)",
                           actor or SYSTEM_ACTOR)
        await conn.execute("SELECT set_config('app.actor_username', $1, true)",
                           f"prove_shifts:{RUN}" if actor else "system:prove_shifts")
        await conn.execute(sql, *args)
    except asyncpg.PostgresError as e:
        err = type(e).__name__
    if err is None and commit:
        await tr.commit()
    else:
        await tr.rollback()
    return err


async def accepts(conn, tid, sql, args, claim, *, actor=None, commit=False) -> None:
    err = await _try(conn, tid, sql, args, actor=actor, commit=commit)
    check(err is None, f"{claim} -- ACCEPTED" + (f" [but {err}]" if err else ""))


async def refuses(conn, tid, sql, args, claim, *, expect: str | None = None) -> None:
    err = await _try(conn, tid, sql, args)
    ok = err is not None and (expect is None or err == expect)
    check(ok, f"{claim} -- REFUSED"
          + ("" if ok else (f" [accepted!]" if err is None else f" [{err}, wanted {expect}]")))


# ---------------------------------------------------------------------------
# SQL builders for the fixtures
# ---------------------------------------------------------------------------
def shift_row(tid, branch, user, *, closed: bool | None = False, partial: bool = False) -> tuple[str, tuple]:
    sid = uuid.uuid4()
    if partial:  # closed_at set, the rest NULL -> ck_shifts_close_consistency
        return (
            "INSERT INTO shifts (id, tenant_id, branch_id, opened_at, opened_by,"
            " opening_float, closed_at) VALUES ($1,$2,$3, now(), $4, 100.00, now())",
            (sid, tid, branch, user))
    if closed:
        return (
            "INSERT INTO shifts (id, tenant_id, branch_id, opened_at, opened_by,"
            " opening_float, closed_at, closed_by, counted_cash, expected_cash, variance)"
            " VALUES ($1,$2,$3, now(), $4, 100.00, now(), $4, 90.00, 100.00, -10.00)",
            (sid, tid, branch, user))
    return (
        "INSERT INTO shifts (id, tenant_id, branch_id, opened_at, opened_by, opening_float)"
        " VALUES ($1,$2,$3, now(), $4, 100.00)",
        (sid, tid, branch, user))


def cash_row(tid, branch, user, *, kind="expense", amount="50.00", key=None,
             void: str | None = None) -> tuple[str, tuple]:
    mid = uuid.uuid4()
    key = key or f"cm-{RUN}-{uuid.uuid4().hex[:8]}"
    if void == "partial":  # voided_at set, voided_by/void_reason NULL
        return (
            "INSERT INTO cash_movements (id, tenant_id, branch_id, kind, amount,"
            " created_by, device_created_at, idempotency_key, voided_at)"
            " VALUES ($1,$2,$3,$4,$5,$6, now(), $7, now())",
            (mid, tid, branch, kind, amount, user, key))
    if void == "full":
        return (
            "INSERT INTO cash_movements (id, tenant_id, branch_id, kind, amount,"
            " created_by, device_created_at, idempotency_key, voided_at, voided_by, void_reason)"
            " VALUES ($1,$2,$3,$4,$5,$6, now(), $7, now(), $6, 'a reason')",
            (mid, tid, branch, kind, amount, user, key))
    return (
        "INSERT INTO cash_movements (id, tenant_id, branch_id, kind, amount, created_by,"
        " device_created_at, idempotency_key) VALUES ($1,$2,$3,$4,$5,$6, now(), $7)",
        (mid, tid, branch, kind, amount, user, key))


def channel_row(tid, branch, user, **cols) -> tuple[str, tuple]:
    base = dict(id=uuid.uuid4(), tenant_id=tid, branch_id=None, kind="promptpay",
                label="a label", promptpay_proxy=None, promptpay_proxy_type=None,
                bank_code=None, account_no=None, account_name=None, created_by=user)
    base.update(cols)
    keys = list(base)
    ph = ", ".join(f"${i + 1}" for i in range(len(keys)))
    return (f"INSERT INTO shop_payment_channels ({', '.join(keys)}) VALUES ({ph})",
            tuple(base[k] for k in keys))


def _methods_of(cdef: str) -> list[str]:
    return sorted(re.findall(r"'([a-z_]+)'", cdef or ""))


# ---------------------------------------------------------------------------
# the cells
# ---------------------------------------------------------------------------
async def run_cells(break_name: str | None) -> None:
    su = await su_conn()
    app = await app_conn()
    # shifts is audited (the 2026-09-18 split): a su shifts write fires audit_capture,
    # which runs as recycle_owner (bound by audit_log's FORCE RLS) and writes the audit
    # row's tenant_id from app.tenant_id. su (superuser) bypasses shifts/read RLS, but the
    # TRIGGER's owner role does not, so both app.tenant_id and an actor must be set on this
    # su connection or the audit INSERT violates audit_log's policy. Set them session-level
    # (su autocommits each statement); tenant_id defaults to A here and is switched to B
    # just before the one tenant-B shift seed below.
    await su.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_A_ID))
    await su.execute("SELECT set_config('app.actor_id', $1, false)", SYSTEM_ACTOR)
    await su.execute("SELECT set_config('app.actor_username', $1, false)", "system:prove_shifts")
    try:
        # ---- fixtures: a branch + user + payment for each tenant, from the seed
        a_branch = await su.fetchval(
            "SELECT id FROM branches WHERE tenant_id=$1 ORDER BY code LIMIT 1", TENANT_A_ID)
        a_user = await su.fetchval(
            "SELECT id FROM users WHERE tenant_id=$1 ORDER BY username LIMIT 1", TENANT_A_ID)
        b_branch = await su.fetchval(
            "SELECT id FROM branches WHERE tenant_id=$1 ORDER BY code LIMIT 1", TENANT_B_ID)
        b_user = await su.fetchval(
            "SELECT id FROM users WHERE tenant_id=$1 ORDER BY username LIMIT 1", TENANT_B_ID)
        a_payment = await su.fetchval(
            "SELECT id FROM payments WHERE tenant_id=$1 LIMIT 1", TENANT_A_ID)

        if break_name:
            broke = await apply_break(su, break_name)
            print(f"  !! DISPROOF: broke {break_name} -> {broke}")

        header("E0  the scratch is at 0021 and holds the objects")
        head = await su.fetchval("SELECT version_num FROM alembic_version")
        check(head is not None and head >= "0021",
              f"alembic head is 0021 or later (got {head!r})")
        tabs = set(r["table_name"] for r in await su.fetch(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public'"
            " AND table_name = ANY($1::text[])",
            ["shifts", "cash_movements", "branch_payment_methods", "shop_payment_channels"]))
        check(tabs == {"shifts", "cash_movements", "branch_payment_methods",
                       "shop_payment_channels"}, f"the four tables exist (got {sorted(tabs)})")
        cols = set(r["c"] for r in await su.fetch(
            "SELECT table_name||'.'||column_name AS c FROM information_schema.columns"
            " WHERE (table_name='branches' AND column_name='shifts_enabled')"
            " OR (table_name='payments' AND column_name='shift_id')"))
        check(cols == {"branches.shifts_enabled", "payments.shift_id"},
              f"the two columns exist (got {sorted(cols)})")

        header("SC  shifts close-consistency (four close columns all NULL or all present)")
        sql, args = shift_row(TENANT_A_ID, a_branch, a_user, partial=True)
        await refuses(app, TENANT_A_ID, sql, args,
                      "SC1 a PARTIAL close (closed_at set, the rest NULL)")
        sql, args = shift_row(TENANT_A_ID, a_branch, a_user, closed=True)
        await accepts(app, TENANT_A_ID, sql, args, "SC2 a FULL close")
        sql, args = shift_row(TENANT_A_ID, a_branch, a_user, closed=False)
        await accepts(app, TENANT_A_ID, sql, args, "SC3 an all-NULL (open) shift")

        header("OI  one open shift per branch (partial unique index)")
        # persist one open shift on a_branch, then test the index
        sql, args = shift_row(TENANT_A_ID, a_branch, a_user, closed=False)
        first_err = await _try(app, TENANT_A_ID, sql, args, commit=True)
        check(first_err is None, f"OI setup: one open shift persisted{' [%s]' % first_err if first_err else ''}")
        sql, args = shift_row(TENANT_A_ID, a_branch, a_user, closed=False)
        await refuses(app, TENANT_A_ID, sql, args,
                      "OI1 a SECOND open shift on the same branch", expect="UniqueViolationError")
        # a DIFFERENT branch of tenant A if the seed has one, else tenant B's branch
        second_branch = await su.fetchval(
            "SELECT id FROM branches WHERE tenant_id=$1 AND id<>$2 LIMIT 1", TENANT_A_ID, a_branch)
        if second_branch is not None:
            sql, args = shift_row(TENANT_A_ID, second_branch, a_user, closed=False)
            await accepts(app, TENANT_A_ID, sql, args, "OI2 an open shift on a DIFFERENT branch")
        else:
            # tenant A has one branch on the seed; use tenant B's branch under B's context as the sibling
            sql, args = shift_row(TENANT_B_ID, b_branch, b_user, closed=False)
            await accepts(app, TENANT_B_ID, sql, args,
                          "OI2 an open shift on a DIFFERENT branch (another tenant)")
        # close the persisted open shift (as su, bypassing RLS -- this is setup, not a
        # cell), then a new open shift on a_branch is allowed
        await su.execute(
            "UPDATE shifts SET closed_at=now(), closed_by=$1, counted_cash=90.00,"
            " expected_cash=100.00, variance=-10.00 WHERE tenant_id=$2 AND branch_id=$3"
            " AND closed_at IS NULL", a_user, TENANT_A_ID, a_branch)
        sql, args = shift_row(TENANT_A_ID, a_branch, a_user, closed=False)
        await accepts(app, TENANT_A_ID, sql, args,
                      "OI3 a new open shift on the same branch AFTER the first is closed")

        header("CM  cash_movements")
        sql, args = cash_row(TENANT_A_ID, a_branch, a_user, kind="not_a_kind")
        await refuses(app, TENANT_A_ID, sql, args, "CM a bad kind", expect="CheckViolationError")
        for k in ("expense", "float_in", "float_out", "deposit_to_bank"):
            sql, args = cash_row(TENANT_A_ID, a_branch, a_user, kind=k)
            await accepts(app, TENANT_A_ID, sql, args, f"CM the valid kind {k!r}")
        sql, args = cash_row(TENANT_A_ID, a_branch, a_user, amount="0.00")
        await refuses(app, TENANT_A_ID, sql, args, "CM a zero amount", expect="CheckViolationError")
        sql, args = cash_row(TENANT_A_ID, a_branch, a_user, amount="-5.00")
        await refuses(app, TENANT_A_ID, sql, args, "CM a negative amount", expect="CheckViolationError")
        # duplicate idempotency key within a tenant vs the same key in another tenant
        dup = f"cm-dup-{RUN}"
        sql, args = cash_row(TENANT_A_ID, a_branch, a_user, key=dup)
        await _try(app, TENANT_A_ID, sql, args, commit=True)
        sql, args = cash_row(TENANT_A_ID, a_branch, a_user, key=dup)
        await refuses(app, TENANT_A_ID, sql, args,
                      "CM a duplicate idempotency_key within a tenant", expect="UniqueViolationError")
        sql, args = cash_row(TENANT_B_ID, b_branch, b_user, key=dup)
        await accepts(app, TENANT_B_ID, sql, args, "CM the SAME idempotency_key in ANOTHER tenant")
        sql, args = cash_row(TENANT_A_ID, a_branch, a_user, void="partial")
        await refuses(app, TENANT_A_ID, sql, args, "CM a partial void", expect="CheckViolationError")
        sql, args = cash_row(TENANT_A_ID, a_branch, a_user, void="full")
        await accepts(app, TENANT_A_ID, sql, args, "CM a full void")

        header("BPM branch_payment_methods and its method set")
        sql = ("INSERT INTO branch_payment_methods (tenant_id, branch_id, method)"
               " VALUES ($1,$2,'not_a_method')")
        await refuses(app, TENANT_A_ID, sql, (TENANT_A_ID, a_branch),
                      "BPM a method outside the set", expect="CheckViolationError")
        # A method inside the set that the branch does NOT already hold, chosen by
        # reading its rows (the gate repair, 2026-10-09: this cell hard-coded
        # 'promptpay', the same class as GR's fixed 'transfer' that collided on dev).
        bpm_def_now = await su.fetchval(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint"
            " WHERE conname='ck_branch_payment_methods_method'")
        bpm_branch, bpm_method = await branch_lacking_a_method(
            su, TENANT_A_ID, a_branch, _methods_of(bpm_def_now))
        sql = ("INSERT INTO branch_payment_methods (tenant_id, branch_id, method)"
               " VALUES ($1,$2,$3)")
        await accepts(app, TENANT_A_ID, sql, (TENANT_A_ID, bpm_branch, bpm_method),
                      f"BPM a method inside the set ({bpm_method}), on a branch that does not hold it",
                      actor=str(a_user))
        pay_def = await su.fetchval(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='ck_payments_method'")
        bpm_def = await su.fetchval(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint"
            " WHERE conname='ck_branch_payment_methods_method'")
        pay_set, bpm_set = _methods_of(pay_def), _methods_of(bpm_def)
        for m in sorted(set(pay_set) | set(bpm_set) | set(_METHODS)):
            check(m in pay_set and m in bpm_set,
                  f"BPM method {m!r} is in BOTH payments.method and branch_payment_methods.method")
        check(pay_set == bpm_set == sorted(_METHODS),
              f"BPM the two sets equal the expected {sorted(_METHODS)} (payments={pay_set}, bpm={bpm_set})")
        no_cash = await su.fetchval(
            "SELECT count(*) FROM branches b WHERE NOT EXISTS (SELECT 1 FROM"
            " branch_payment_methods m WHERE m.tenant_id=b.tenant_id AND m.branch_id=b.id"
            " AND m.method='cash' AND m.is_active)")
        total_branches = await su.fetchval("SELECT count(*) FROM branches")
        check(total_branches > 0 and no_cash == 0,
              f"BPM every branch ({total_branches}) has its born-with active cash row (missing={no_cash})")

        header("CH  shop_payment_channels coherence")
        sql, args = channel_row(TENANT_A_ID, a_branch, a_user, kind="promptpay",
                                promptpay_proxy="0812345678", promptpay_proxy_type="phone")
        await accepts(app, TENANT_A_ID, sql, args, "CH a coherent promptpay channel",
                      actor=str(a_user))
        sql, args = channel_row(TENANT_A_ID, a_branch, a_user, kind="bank_account",
                                bank_code="014", account_no="1234567890", account_name="the shop")
        await accepts(app, TENANT_A_ID, sql, args, "CH a coherent bank_account channel",
                      actor=str(a_user))
        sql, args = channel_row(TENANT_A_ID, a_branch, a_user, kind="promptpay",
                                promptpay_proxy="0812345678", promptpay_proxy_type="phone",
                                bank_code="014")
        await refuses(app, TENANT_A_ID, sql, args,
                      "CH a promptpay row carrying a bank field", expect="CheckViolationError")
        sql, args = channel_row(TENANT_A_ID, a_branch, a_user, kind="bank_account",
                                bank_code="014", account_no="123", account_name="x",
                                promptpay_proxy="0812345678")
        await refuses(app, TENANT_A_ID, sql, args,
                      "CH a bank_account row carrying a proxy", expect="CheckViolationError")
        sql, args = channel_row(TENANT_A_ID, a_branch, a_user, kind="paypal",
                                promptpay_proxy="x", promptpay_proxy_type="phone")
        await refuses(app, TENANT_A_ID, sql, args, "CH a bad kind", expect="CheckViolationError")
        sql, args = channel_row(TENANT_A_ID, a_branch, a_user, kind="promptpay",
                                promptpay_proxy="x", promptpay_proxy_type="carrier_pigeon")
        await refuses(app, TENANT_A_ID, sql, args, "CH a bad proxy type", expect="CheckViolationError")

        header("XT  cross-tenant references and payments.shift_id")
        # a shift for tenant A naming tenant B's branch -> composite FK refuses
        sql, args = shift_row(TENANT_A_ID, b_branch, a_user, closed=False)
        await refuses(app, TENANT_A_ID, sql, args,
                      "XT a shift naming ANOTHER tenant's branch", expect="ForeignKeyViolationError")
        # its same-tenant sibling: a shift for tenant B naming B's branch is accepted
        sql, args = shift_row(TENANT_B_ID, b_branch, b_user, closed=False)
        await accepts(app, TENANT_B_ID, sql, args, "XT the same-tenant shift (tenant B, B's branch)")
        # payments.shift_id: existing rows are NULL (control), a cross-tenant value refused
        null_shift = await su.fetchval(
            "SELECT count(*) FROM payments WHERE tenant_id=$1 AND shift_id IS NULL", TENANT_A_ID)
        check(null_shift > 0, f"XT existing payments carry shift_id NULL (n={null_shift})")
        # seed one shift in tenant A and one in tenant B, then UPDATE a payment's shift_id
        a_shift = uuid.uuid4()
        await su.execute(
            "INSERT INTO shifts (id, tenant_id, branch_id, opened_at, opened_by, opening_float)"
            " VALUES ($1,$2,$3, now(), $4, 0)", a_shift, TENANT_A_ID, a_branch, a_user)
        b_shift = uuid.uuid4()
        # the audit row for a tenant-B shift must carry tenant_id=B (audit_log RLS), so
        # switch the su tenant GUC to B for this one seed, then back to A.
        await su.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_B_ID))
        await su.execute(
            "INSERT INTO shifts (id, tenant_id, branch_id, opened_at, opened_by, opening_float)"
            " VALUES ($1,$2,$3, now(), $4, 0)", b_shift, TENANT_B_ID, b_branch, b_user)
        await su.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_A_ID))
        await refuses(app, TENANT_A_ID,
                      "UPDATE payments SET shift_id=$1 WHERE tenant_id=$2 AND id=$3",
                      (b_shift, TENANT_A_ID, a_payment),
                      "XT a payment.shift_id pointing at ANOTHER tenant's shift",
                      expect="ForeignKeyViolationError")
        await accepts(app, TENANT_A_ID,
                      "UPDATE payments SET shift_id=$1 WHERE tenant_id=$2 AND id=$3",
                      (a_shift, TENANT_A_ID, a_payment),
                      "XT a payment.shift_id pointing at a SAME-tenant shift")

        header("GR  grants: DELETE refused on each new table, INSERT accepted (control)")
        for t in ("shifts", "cash_movements", "branch_payment_methods", "shop_payment_channels"):
            err = await _try(app, TENANT_A_ID, f"DELETE FROM {t} WHERE tenant_id=$1", (TENANT_A_ID,))
            check(err == "InsufficientPrivilegeError",
                  f"GR DELETE on {t} is refused (got {err})")
        # the INSERT controls (a good row on each), rolled back
        sql, args = shift_row(TENANT_A_ID, a_branch, a_user, closed=False)
        # a_branch may already hold an open shift from XT seed; use tenant B for a clean control
        sql, args = shift_row(TENANT_B_ID, b_branch, b_user, closed=True)
        await accepts(app, TENANT_B_ID, sql, args, "GR control: INSERT into shifts is accepted")
        sql, args = cash_row(TENANT_A_ID, a_branch, a_user)
        await accepts(app, TENANT_A_ID, sql, args, "GR control: INSERT into cash_movements is accepted")
        # The method is chosen BY READING the branch's rows (the gate repair, 2026-10-09):
        # a fixed 'transfer' collided with a row a settings toggle left on dev, and the
        # next migration makes transfer born-with on every branch.
        gr_def = await su.fetchval(
            "SELECT pg_get_constraintdef(oid) FROM pg_constraint"
            " WHERE conname='ck_branch_payment_methods_method'")
        gr_branch, gr_method = await branch_lacking_a_method(
            su, TENANT_A_ID, a_branch, _methods_of(gr_def))
        await accepts(app, TENANT_A_ID,
                      "INSERT INTO branch_payment_methods (tenant_id, branch_id, method)"
                      " VALUES ($1,$2,$3)", (TENANT_A_ID, gr_branch, gr_method),
                      f"GR control: INSERT into branch_payment_methods is accepted ({gr_method},"
                      f" a method the branch did not hold)",
                      actor=str(a_user))
        sql, args = channel_row(TENANT_A_ID, a_branch, a_user, kind="promptpay",
                                promptpay_proxy="0800000000", promptpay_proxy_type="phone")
        await accepts(app, TENANT_A_ID, sql, args,
                      "GR control: INSERT into shop_payment_channels is accepted",
                      actor=str(a_user))

        header("AU  audit: an audited-table write is logged; a non-audited one is not")
        # count this run's audit rows before/after, keyed on the actor username we set
        actor_name = f"prove_shifts:{RUN}"
        before = await app_audit_count(app, TENANT_A_ID, actor_name)
        check(before == 0, f"AU control: this run's actor has no audit rows yet (n={before})")
        # an UPDATE on branch_payment_methods (audited) with an actor set
        await _try(app, TENANT_A_ID,
                   "UPDATE branch_payment_methods SET is_active = NOT is_active"
                   " WHERE tenant_id=$1 AND branch_id=$2 AND method='cash'",
                   (TENANT_A_ID, a_branch), actor=str(a_user), commit=True)
        after_bpm = await app_audit_count(app, TENANT_A_ID, actor_name, table="branch_payment_methods")
        check(after_bpm == 1,
              f"AU an UPDATE on branch_payment_methods (audited) wrote one audit row (n={after_bpm})")
        # an UPDATE on shifts (AUDITED, the owner's 2026-09-18 split) writes an audit row
        await _try(app, TENANT_A_ID,
                   "UPDATE shifts SET opening_float = opening_float WHERE tenant_id=$1 AND id=$2",
                   (TENANT_A_ID, a_shift), actor=str(a_user), commit=True)
        after_shifts = await app_audit_count(app, TENANT_A_ID, actor_name, table="shifts")
        check(after_shifts == 1,
              f"AU an UPDATE on shifts (AUDITED) wrote one audit row (n={after_shifts})")
        # cash_movements is NOT audited (the split's other half): a write with THIS run's
        # actor leaves no audit row. The NEGATIVE sibling; the two rows above are the
        # positive control that the reader sees audited writes. Reddens under audit_cm_add.
        await _try(app, TENANT_A_ID,
                   "INSERT INTO cash_movements (id, tenant_id, branch_id, kind, amount,"
                   " created_by, device_created_at, idempotency_key)"
                   " VALUES ($1,$2,$3,'expense','5.00',$4, now(), $5)",
                   (uuid.uuid4(), TENANT_A_ID, a_branch, a_user, f"cm-au-{RUN}"),
                   actor=str(a_user), commit=True)
        after_cm = await app_audit_count(app, TENANT_A_ID, actor_name, table="cash_movements")
        check(after_cm == 0,
              f"AU cash_movements is NOT audited: its write left no audit row (n={after_cm})")
    finally:
        await su.close()
        await app.close()


async def app_audit_count(conn, tid, actor_name: str, table: str | None = None) -> int:
    # set_config(is_local=true) is transaction-scoped, so the read of the
    # RLS-bound audit_log must share the transaction that sets the context.
    async with conn.transaction():
        await conn.execute("SELECT set_config('app.tenant_id', $1, true)", str(tid))
        if table:
            return await conn.fetchval(
                "SELECT count(*) FROM audit_log WHERE actor_username=$1 AND table_name=$2",
                actor_name, table)
        return await conn.fetchval(
            "SELECT count(*) FROM audit_log WHERE actor_username=$1", actor_name)


BREAKS = {
    "close_consistency": "ALTER TABLE shifts DROP CONSTRAINT ck_shifts_close_consistency",
    "one_open_index": "DROP INDEX uq_shifts_one_open_per_branch",
    "cash_kind": "ALTER TABLE cash_movements DROP CONSTRAINT ck_cash_movements_kind",
    "cash_amount": "ALTER TABLE cash_movements DROP CONSTRAINT ck_cash_movements_amount",
    "cash_idem": "ALTER TABLE cash_movements DROP CONSTRAINT uq_cash_movements_tenant_idem",
    "cash_void": "ALTER TABLE cash_movements DROP CONSTRAINT ck_cash_movements_void_consistency",
    "method_check": "ALTER TABLE branch_payment_methods DROP CONSTRAINT ck_branch_payment_methods_method",
    "channel_coherent": "ALTER TABLE shop_payment_channels DROP CONSTRAINT ck_shop_channels_coherent",
    "shifts_fk_branch": "ALTER TABLE shifts DROP CONSTRAINT fk_shifts_branch",
    "payments_shift_fk": "ALTER TABLE payments DROP CONSTRAINT fk_payments_shift",
    "shifts_delete_grant": "GRANT DELETE ON shifts TO recycle_app",
    # The gate repair (2026-10-09): GR on branch_payment_methods, both directions -- the
    # DELETE grant re-granted reddens its refusal cell; the INSERT grant revoked reddens
    # the control the repaired method chooser feeds.
    "bpm_delete_grant": "GRANT DELETE ON branch_payment_methods TO recycle_app",
    "bpm_insert_revoke": "REVOKE INSERT ON branch_payment_methods FROM recycle_app",
    "audit_bpm": "DROP TRIGGER audit_capture ON branch_payment_methods",
    "audit_shifts": "DROP TRIGGER audit_capture ON shifts",
    "audit_cm_add": ("CREATE TRIGGER audit_capture AFTER INSERT OR UPDATE OR DELETE"
                     " ON cash_movements FOR EACH ROW EXECUTE FUNCTION audit_capture()"),
}


async def apply_break(su: asyncpg.Connection, name: str) -> str:
    if name not in BREAKS:
        raise SystemExit(f"unknown --break {name!r}; choose from {sorted(BREAKS)}")
    await su.execute(BREAKS[name])
    return BREAKS[name]


# ---------------------------------------------------------------------------
# round trip and refusal, each on a freshly-restored clean scratch
# ---------------------------------------------------------------------------
async def run_round_trip() -> None:
    header("RT  the upgrade/downgrade round trip, on a clean scratch")
    # Explicit targets 0020/0021, never -1/head, so a FUTURE migration (0022+) cannot
    # move what this isolates: downgrade to 0020 removes 0021 (and anything above it),
    # upgrade to 0021 applies exactly 0021 (proof-must-run-twice: assert 0021, not the
    # head as a fact).
    rc, out = run_alembic("downgrade", "0020")
    check(rc == 0, f"RT downgrade to 0020 exit 0 (got {rc})")
    su = await su_conn()
    try:
        head = await su.fetchval("SELECT version_num FROM alembic_version")
        gone = await su.fetchval(
            "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
            " AND table_name = ANY($1::text[])",
            ["shifts", "cash_movements", "branch_payment_methods", "shop_payment_channels"])
        control = await su.fetchval("SELECT count(*) FROM payments")
        check(head == "0020" and gone == 0,
              f"RT after downgrade: head={head}, the four tables are gone ({gone} present)")
        check(control > 0, f"RT control: payments survived the downgrade (n={control})")
    finally:
        await su.close()
    rc, out = run_alembic("upgrade", "0021")
    check(rc == 0, f"RT upgrade to 0021 exit 0 (got {rc})")
    su = await su_conn()
    try:
        back = await su.fetchval(
            "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
            " AND table_name = ANY($1::text[])",
            ["shifts", "cash_movements", "branch_payment_methods", "shop_payment_channels"])
        check(back == 4, f"RT after upgrade: the four tables are back ({back} present)")
    finally:
        await su.close()


async def run_refusal(drop_refusal_row: bool) -> None:
    header("RF  a downgrade with a real shift present REFUSES")
    # The refusing row is MADE HERE, on the empty build (the gate repair, 2026-10-09).
    # --disprove-refusal withholds it, and the RF cells alone must go red.
    su = await su_conn()
    try:
        a_branch = await su.fetchval(
            "SELECT id FROM branches WHERE tenant_id=$1 ORDER BY code LIMIT 1", TENANT_A_ID)
        a_user = await su.fetchval(
            "SELECT id FROM users WHERE tenant_id=$1 ORDER BY username LIMIT 1", TENANT_A_ID)
        # shifts is audited: audit_capture writes the audit row's tenant_id from
        # app.tenant_id and RAISES with no actor, so set both (tenant A) before the seed.
        await su.execute("SELECT set_config('app.tenant_id', $1, false)", str(TENANT_A_ID))
        await su.execute("SELECT set_config('app.actor_id', $1, false)", SYSTEM_ACTOR)
        await su.execute("SELECT set_config('app.actor_username', $1, false)", "system:prove_shifts")
        if not drop_refusal_row:
            await su.execute(
                "INSERT INTO shifts (id, tenant_id, branch_id, opened_at, opened_by, opening_float)"
                " VALUES ($1,$2,$3, now(), $4, 0)", uuid.uuid4(), TENANT_A_ID, a_branch, a_user)
        else:
            print("  !! DISPROOF: the refusing row is NOT made (no shift)")
        made = await su.fetchval("SELECT count(*) FROM shifts")
    finally:
        await su.close()
    rc, out = run_alembic("downgrade", "0020")
    refused = rc != 0 and "REFUSING to downgrade 0021" in out and "shifts" in out
    check(refused, f"RF the downgrade REFUSED over the {made} shift(s) this cell made (exit {rc},"
                   f" refusal message present={('REFUSING to downgrade 0021' in out)})")
    su = await su_conn()
    try:
        head = await su.fetchval("SELECT version_num FROM alembic_version")
        still = await su.fetchval(
            "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"
            " AND table_name='shifts'")
        check(head is not None and head >= "0021" and still == 1,
              f"RF the refusal rolled back cleanly, head still at or past 0021 (got {head}), shifts present")
    finally:
        await su.close()


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
async def amain(args) -> int:
    print(f"prove_shifts  RUN={RUN}  scratch={SCRATCH_DB}  break={args.brk or '(none)'}")
    if _APP_URL.database == SCRATCH_DB:
        raise SystemExit("refusing to run against the scratch's own name as live")

    # cells on a fresh scratch
    restore_scratch()
    await run_cells(args.brk)

    if not args.brk:
        # Round trip and refusal each need a clean, cell-free scratch -- BUILT FROM EMPTY
        # (the gate repair, 2026-10-09), never a dump of dev: they test the migration's
        # mechanics, and a dev dump carries whatever drawer rows anything left there,
        # which made 0022's and 0021's downgrades refuse before the cells could judge them.
        await build_empty_scratch(SCRATCH_DB)
        seed_paid_bill(SCRATCH_DB)
        await run_round_trip()
        await build_empty_scratch(SCRATCH_DB)
        seed_paid_bill(SCRATCH_DB)
        await run_refusal(args.disprove_refusal)

    header("verdict")
    total = len(passes) + len(failures)
    print(f"  cells: {total}   OK: {len(passes)}   RED: {len(failures)}")
    if failures:
        print("  THESE CLAIMS DID NOT HOLD:")
        for f in failures:
            print(f"    - {f}")
    return 1 if failures else 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Prove the shifts/cash-drawer schema (migration 0021).")
    ap.add_argument("--break", dest="brk", default=None,
                    help=f"DISPROOF: drop one object first. One of {sorted(BREAKS)}")
    ap.add_argument("--disprove-refusal", action="store_true",
                    help="DISPROOF: RF does not make the shift that makes the downgrade refuse;"
                         " the RF cells alone must go red")
    args = ap.parse_args()
    return asyncio.run(amain(args))


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
    print(f"PROVE_SHIFTS_EXIT={rc}")
    sys.exit(rc)
