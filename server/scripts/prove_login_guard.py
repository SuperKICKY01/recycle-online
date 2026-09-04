"""Prove login rate-limiting / account lockout over real HTTP (migration 0016).

Model on prove_grade_tiers.py: restore a SCRATCH from a live dump, start a child
uvicorn on it, gate on /openapi.json before any cell, provision throwaway tenants
and users by direct insert, then exercise POST /auth/login and POST
/users/{id}/unlock-login. Per-run uuids everywhere, so the script is green TWICE
in a row with no reseed (proof-must-run-twice): run 2 uses fresh tenants and fresh
usernames, and the rows run 1 wrote for its own usernames can never touch them.

Time is not slept. The lockout clears when failures age past the window, and that
is driven by moving the OTHER side of the comparison: an OWNER/superuser UPDATE
backdates created_at, which is arithmetically identical to advancing now()
(prove_clock_guard.py's mechanism, one table over).

The four disproofs the brief names are run by hand against this script, each
naming its cell first:
  (a) remove the counter increment (record_failed_attempt) -> the lock cell P2
  (b) let a correct password bypass the lock              -> the lock cell P2
  (c) return a different body for an unknown username     -> P3, indistinguishable
  (d) log the attempted password                          -> P6, no password material
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

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

# The threshold and window come from app.login_guard, read LAZILY inside main()
# AFTER the scratch rebind. They are shared parameters (not the predicate under
# test), so reading them keeps this proof in step with a changed constant; but
# app.login_guard imports app.db, and app.db binds its engine to APP_DATABASE_URL
# at IMPORT time, so importing it up here would pin every in-process read to the
# LIVE database -- the same lazy-import discipline prove_grade_tiers uses for
# app.db. The COUNT and the LOCK decision are NOT imported: this proof re-derives
# lock state from Postgres with its own query (a-checker-must-not-share-the-code).
FAILURE_THRESHOLD = -1
LOCKOUT_WINDOW_SECONDS = -1

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTAINER = os.environ.get("PROVE_PG_CONTAINER", "recycle_pg")
SCRATCH_DB = "recycle_login_guard_scratch"
RUN = uuid.uuid4().hex[:8]

BASE = ""
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


def _tail(path: str, n: int = 40) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            return "".join(f.readlines()[-n:])
    except OSError:
        return "(no child log)"


def restore_scratch(live_name: str, scratch: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-loginguard-dump-{RUN}")
    label = f"loginguard-{RUN}"
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
    paths = r.json().get("paths", {})
    if "post" not in paths.get("/auth/login", {}):
        return "the server does not declare POST /auth/login"
    if "post" not in paths.get("/users/{user_id}/unlock-login", {}):
        return "the server does not declare POST /users/{user_id}/unlock-login -- predates 0016"
    return ""


# ---------------------------------------------------------------------------
# fixture: two throwaway tenants and a user per cell. Distinct per-run usernames
# and passwords, none ever printed, each secret distinctive enough that finding
# its bytes in a row could not be a coincidence.
# ---------------------------------------------------------------------------
U = {
    "admin":     f"admin-{RUN}",
    "allow":     f"allow-{RUN}",
    "lock":      f"lock-{RUN}",
    "expire":    f"expire-{RUN}",
    "adminlock": f"adminlock-{RUN}",
    "bystander": f"bystander-{RUN}",
    "nopw":      f"nopw-{RUN}",
    "collide":   f"collide-{RUN}",
}
GHOST = f"ghost-{RUN}"                       # a username that is never created
PW = {k: f"pw-{k}-{RUN}" for k in U}         # tenant_main real passwords
PW_COLLIDE_OTHER = f"pw-collide-other-{RUN}"  # tenant_other's collide password
WRONG = f"wrong-{RUN}"                        # a wrong password, never anyone's
NOPW_SECRET = f"NOPW-SECRET-{RUN}-must-not-be-stored"  # the password P6 hunts for


class Ctx:
    def __init__(self) -> None:
        self.main = uuid.uuid4()
        self.other = uuid.uuid4()
        self.ids = {k: uuid.uuid4() for k in U}     # user ids in tenant_main
        self.collide_other_id = uuid.uuid4()


async def provision(ctx: Ctx) -> None:
    from sqlalchemy import text
    from app.db import SYSTEM_ACTOR_ID, tenant_connection
    from app.security import hash_password
    ACTOR = dict(actor_id=SYSTEM_ACTOR_ID, actor_username="system:prove_login_guard")

    async def mkuser(conn, uid, username, role, password):
        ph = await hash_password(password)
        await conn.execute(
            text("INSERT INTO users (id, tenant_id, username, full_name, role,"
                 " password_hash) VALUES (:id, :t, :u, :fn, :r, :ph)"),
            {"id": uid, "t": conn_tenant[0], "u": username,
             "fn": username, "r": role, "ph": ph})

    conn_tenant = [None]
    async with tenant_connection(ctx.main, **ACTOR) as conn:
        conn_tenant[0] = ctx.main
        await conn.execute(text("INSERT INTO tenants (id, name) VALUES (:id, :n)"),
                           {"id": ctx.main, "n": f"LG MAIN {RUN}"})
        # THE BORN-WITH BRANCH (0018): this proof mints tenants by SQL and leaves
        # them behind, and reconcile.py's T18 requires every tenant to hold an
        # active branch -- so the tenant is provisioned with one, as
        # provision_shop.py provisions it. No bill is written here.
        await conn.execute(
            text("INSERT INTO branches (tenant_id, code, name, doc_prefix, is_active)"
                 " VALUES (:t, 'MAIN', :n, 'B', true)"),
            {"t": ctx.main, "n": f"LG MAIN {RUN}"})
        await mkuser(conn, ctx.ids["admin"], U["admin"], "admin", PW["admin"])
        for k in ("allow", "lock", "expire", "adminlock", "bystander", "nopw", "collide"):
            await mkuser(conn, ctx.ids[k], U[k], "staff", PW[k])

    async with tenant_connection(ctx.other, **ACTOR) as conn:
        conn_tenant[0] = ctx.other
        await conn.execute(text("INSERT INTO tenants (id, name) VALUES (:id, :n)"),
                           {"id": ctx.other, "n": f"LG OTHER {RUN}"})
        await conn.execute(
            text("INSERT INTO branches (tenant_id, code, name, doc_prefix, is_active)"
                 " VALUES (:t, 'MAIN', :n, 'B', true)"),
            {"t": ctx.other, "n": f"LG OTHER {RUN}"})
        await mkuser(conn, ctx.collide_other_id, U["collide"], "staff",
                     PW_COLLIDE_OTHER)


# ---------------------------------------------------------------------------
# helpers over HTTP and over Postgres
# ---------------------------------------------------------------------------
def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def login_raw(client: httpx.AsyncClient, tenant: uuid.UUID, username: str,
                    password: str) -> httpx.Response:
    return await client.post(
        "/auth/login",
        json={"tenant_id": str(tenant), "username": username, "password": password})


async def login_token(client, tenant, username, password) -> str | None:
    r = await login_raw(client, tenant, username, password)
    if r.status_code == 200:
        return r.json().get("access_token")
    return None


def body_id(r: httpx.Response) -> tuple[int, str]:
    """Status + raw body, the pair the byte-identity cells compare."""
    return (r.status_code, r.text)


async def pg_rows(tid: uuid.UUID, username: str | None = None) -> list[dict]:
    from sqlalchemy import text
    from app.db import tenant_connection
    q = ("SELECT id, tenant_id, username, outcome, created_at"
         " FROM failed_login_attempts")
    params: dict = {}
    if username is not None:
        q += " WHERE username = :u"
        params["u"] = username
    async with tenant_connection(tid) as conn:
        return [dict(r) for r in (await conn.execute(text(q), params)).mappings().all()]


async def pg_failed_count(tid: uuid.UUID, username: str) -> int:
    from sqlalchemy import text
    from app.db import tenant_connection
    async with tenant_connection(tid) as conn:
        return (await conn.execute(
            text("SELECT count(*) FROM failed_login_attempts"
                 " WHERE username = :u AND outcome = 'failed'"),
            {"u": username})).scalar_one()


def backdate(scratch: str, username: str, minutes: int) -> str:
    # OWNER/superuser UPDATE (the app role has no UPDATE grant on this table). No
    # quoting risk: username is f"...-{hex}" and minutes is an int.
    q = (f"UPDATE failed_login_attempts SET created_at ="
         f" created_at - interval '{minutes} minutes' WHERE username = '{username}'")
    p = subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", "postgres", "-d", scratch,
         "-v", "ON_ERROR_STOP=1", "-c", q],
        capture_output=True, text=True, timeout=60)
    return "" if p.returncode == 0 else (p.stderr or p.stdout).strip()


# ---------------------------------------------------------------------------
# the cells
# ---------------------------------------------------------------------------
async def run(ctx: Ctx, client: httpx.AsyncClient, scratch: str) -> None:
    admin_tok = await login_token(client, ctx.main, U["admin"], PW["admin"])
    check(bool(admin_tok), "E1: the throwaway admin can sign in (fixture is live)")
    if not admin_tok:
        return

    # --- P1: THRESHOLD-1 failures do NOT lock; the correct password still works
    header("P1  four failures do not lock -- the correct password still works")
    for i in range(FAILURE_THRESHOLD - 1):
        r = await login_raw(client, ctx.main, U["allow"], WRONG)
        check(r.status_code == 401, f"P1: wrong attempt {i + 1} of {FAILURE_THRESHOLD - 1} is refused 401")
    tok = await login_token(client, ctx.main, U["allow"], PW["allow"])
    check(bool(tok), f"P1: after {FAILURE_THRESHOLD - 1} failures the correct password STILL signs in")

    # --- P2: the THRESHOLD-th failure locks; the correct password is then refused
    header("P2  the fifth failure locks -- the correct password is then REFUSED")
    for i in range(FAILURE_THRESHOLD):
        r = await login_raw(client, ctx.main, U["lock"], WRONG)
        check(r.status_code == 401, f"P2: wrong attempt {i + 1} of {FAILURE_THRESHOLD} is refused 401")
    r_locked = await login_raw(client, ctx.main, U["lock"], PW["lock"])
    check(r_locked.status_code == 401,
          "P2: the CORRECT password is REFUSED once the account is locked (not theatre)")

    # --- P3: every refusal is byte-identical. The LOCKED sample is a locked
    # account with a WRONG password (u_lock is locked from P2), so it exercises the
    # lockout's own refusal branch; P2 already covers a locked account refusing the
    # CORRECT one. Sampling wrong-while-locked (rather than P2's correct-while-
    # locked) keeps this cell measuring indistinguishability alone -- a bypass of
    # the lock changes only the correct-password path, which is P2's to catch.
    header("P3  locked == wrong password == unknown user, byte for byte")
    r_ghost = await login_raw(client, ctx.main, GHOST, PW["allow"])
    r_wrong = await login_raw(client, ctx.main, U["bystander"], WRONG)  # 1 failure, still usable
    r_lockwrong = await login_raw(client, ctx.main, U["lock"], WRONG)   # locked account, wrong password
    ghost_body, wrong_body, locked_body = body_id(r_ghost), body_id(r_wrong), body_id(r_lockwrong)
    check(r_ghost.status_code == 401 and r_wrong.status_code == 401 and r_lockwrong.status_code == 401,
          "P3: an unknown username, a wrong password, and a locked account are all 401")
    check(ghost_body == wrong_body,
          "P3: unknown-username body is byte-identical to wrong-password body")
    check(locked_body == wrong_body,
          "P3: the LOCKED refusal is byte-identical to a wrong-password body")

    # --- P4: a locked account signs in again once its failures age past the window
    header("P4  a locked account clears itself once the failures age out")
    for _ in range(FAILURE_THRESHOLD):
        await login_raw(client, ctx.main, U["expire"], WRONG)
    cnt = await pg_failed_count(ctx.main, U["expire"])
    check(cnt >= FAILURE_THRESHOLD,
          f"P4a: the account is locked per the counter ({cnt} >= {FAILURE_THRESHOLD} failed rows in Postgres)")
    err = backdate(scratch, U["expire"], (LOCKOUT_WINDOW_SECONDS // 60) + 1)
    check(err == "", f"P4: backdating the failures past the window succeeded ({err or 'ok'})")
    tok = await login_token(client, ctx.main, U["expire"], PW["expire"])
    check(bool(tok), "P4b: once its failures are older than the window the account signs in AGAIN")

    # --- P5: an admin unlock clears the lockout immediately
    header("P5  an admin unlock clears the lockout")
    for _ in range(FAILURE_THRESHOLD):
        await login_raw(client, ctx.main, U["adminlock"], WRONG)
    check((await pg_failed_count(ctx.main, U["adminlock"])) >= FAILURE_THRESHOLD,
          "P5a: the account is locked per the counter before the unlock")
    ru = await client.post(f"/users/{ctx.ids['adminlock']}/unlock-login",
                           headers=auth(admin_tok))
    ub = ru.json() if ru.status_code == 200 else {}
    check(ru.status_code == 200 and ub.get("was_locked") is True
          and ub.get("failed_attempts_cleared", 0) >= FAILURE_THRESHOLD,
          "P5b: the unlock route reports was_locked=true and the failures cleared")
    tok = await login_token(client, ctx.main, U["adminlock"], PW["adminlock"])
    check(bool(tok), "P5c: after the admin unlock the account signs in again")

    # --- P6: no password material in the stored row (absence, with a presence sibling)
    header("P6  no password material is stored")
    r = await login_raw(client, ctx.main, U["nopw"], NOPW_SECRET)
    check(r.status_code == 401, "P6: the attempt with the hunted password is refused")
    blob = json.dumps([{k: str(v) for k, v in row.items()} for row in
                       await pg_rows(ctx.main)], ensure_ascii=True)
    check(NOPW_SECRET not in blob,
          "P6: the submitted password appears NOWHERE in any stored row (absence)")
    check(U["nopw"] in blob,
          "P6: the attempted username DOES appear in a stored row (the presence sibling that proves the search can fire)")

    # --- P7: the stored rows read back with the expected outcomes
    header("P7  the record reads back with the right outcomes")
    lock_rows = await pg_rows(ctx.main, U["lock"])
    check(len(lock_rows) == FAILURE_THRESHOLD
          and all(row["outcome"] == "failed" for row in lock_rows),
          f"P7a: the locked account has exactly {FAILURE_THRESHOLD} rows, all outcome=failed"
          f" (the locked attempt was NOT recorded)")
    adminlock_rows = await pg_rows(ctx.main, U["adminlock"])
    check(any(row["outcome"] == "unlocked_by_admin" for row in adminlock_rows),
          "P7b: the admin-unlocked account carries an unlocked_by_admin marker row")

    # --- P8: a second user in the same tenant is unaffected while the first is locked
    header("P8  a bystander in the same tenant is unaffected")
    check((await pg_failed_count(ctx.main, U["lock"])) >= FAILURE_THRESHOLD,
          "P8a: the first account is still locked per the counter")
    tok = await login_token(client, ctx.main, U["bystander"], PW["bystander"])
    check(bool(tok),
          "P8b: a second user in the same tenant signs in normally while the first is locked")

    # --- P9: a second TENANT with the same username is unaffected
    header("P9  the same username in a second tenant is unaffected")
    for _ in range(FAILURE_THRESHOLD):
        await login_raw(client, ctx.main, U["collide"], WRONG)
    check((await pg_failed_count(ctx.main, U["collide"])) >= FAILURE_THRESHOLD,
          "P9a: (tenant_main, collide) is locked per the counter")
    check((await pg_failed_count(ctx.other, U["collide"])) == 0,
          "P9b: the SAME username in tenant_other has ZERO failures -- the counter is tenant-scoped")
    tok = await login_token(client, ctx.other, U["collide"], PW_COLLIDE_OTHER)
    check(bool(tok),
          "P9c: the same username in a second tenant signs in normally while the first is locked")


async def main() -> int:
    global BASE
    ap = argparse.ArgumentParser(description="Prove login rate-limiting / lockout over real HTTP.")
    ap.add_argument("--database", default=None,
                    help=f"a SCRATCH database. Omit to self-restore {SCRATCH_DB!r} from a live dump. Never live.")
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

    # NOW it is safe to touch app.* -- the rebind above is in place, so app.db's
    # engine will bind to the SCRATCH. This is the first app import in-process.
    global FAILURE_THRESHOLD, LOCKOUT_WINDOW_SECONDS
    from app.login_guard import FAILURE_THRESHOLD as _ft, LOCKOUT_WINDOW_SECONDS as _lw
    FAILURE_THRESHOLD, LOCKOUT_WINDOW_SECONDS = _ft, _lw

    ctx = Ctx()
    port = free_port()
    BASE = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(
        mode="w", suffix=".log", prefix="prove_login_guard_", delete=False, encoding="utf-8")
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
        check(True, "E0: /openapi.json declares POST /auth/login and POST /users/{user_id}/unlock-login")

        try:
            await provision(ctx)
        except Exception as exc:  # noqa: BLE001
            print(f"UNFIT: provisioning failed: {exc!r}")
            return 2
        print(f"      provisioned MAIN={ctx.main} OTHER={ctx.other} (threshold={FAILURE_THRESHOLD},"
              f" window={LOCKOUT_WINDOW_SECONDS}s)")

        async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
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
    print(f"PROVE_LOGIN_GUARD_EXIT={rc}")
    sys.exit(rc)
