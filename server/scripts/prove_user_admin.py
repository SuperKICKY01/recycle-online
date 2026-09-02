"""Prove the LAST-ACTIVE-ADMIN guard on POST /users/{id}/deactivate over real HTTP.

Model on prove_login_guard.py: restore a SCRATCH from a live dump, start a child
uvicorn on it, gate on /openapi.json before any cell, provision ONE throwaway
tenant with TWO admins and a staff by direct insert, then exercise the deactivate
route. Per-run uuids everywhere, so the script is green TWICE in a row with no
reseed (proof-must-run-twice): run 2 uses a fresh tenant and fresh usernames.

WHY THIS PROOF IS SHAPED THE WAY IT IS -- read before editing a cell.

The guard refuses deactivating the LAST active admin (409 `last_active_admin`).
That refusal is UNREACHABLE in any serial request: the caller passed require_admin
so IS an active admin this request, and a deactivate either targets the caller
(cannot_deactivate_self refuses first, BEFORE this guard) or targets someone else
(the caller stays active, so >=1 admin remains). So `user_id` being the sole active
admin implies user_id == caller, which the self-check caught. The guard exists only
for the CONCURRENT race: admins A and B each deactivating the other in overlapping
transactions, where without serialisation both read two admins and both commit,
leaving zero -- a shop permanently unable to sign in to its own user management,
recoverable only by SQL on site.

A plain `SELECT count(*)` guard (the shape master.update_grade_tier uses for tiers)
would be FALSE ASSURANCE here: never fires serially (self-check first) and does not
stop the race (READ COMMITTED lets both racers read count=2 before either commits).
The guard is therefore a `SELECT ... FOR NO KEY UPDATE` lock over the active-admin
set, and the ONLY cell that can observe it is a concurrency cell (C below).

HOW C IS DETERMINISTIC, NOT TIMING-DEPENDENT (concurrency-tests-need-a-barrier).
It does NOT race two HTTP requests and hope they overlap. It uses an EXTERNAL
transaction C0 as the barrier: C0 takes the SAME FOR NO KEY UPDATE lock the route
will take, so the route's lock acquisition DETERMINISTICALLY blocks on C0 -- a real
Postgres lock wait, not a scheduler coincidence. C0 then plays the concurrent
winner (deactivates the OTHER admin and commits), and only then does the blocked
route resume, now finding its own target is the last admin. The interleaving is
imposed by C0's commit point, so the outcome is fixed. The block is OBSERVED, not
inferred: C1 waits (bounded, for the EVENT not a fixed tick) until a NOT-granted
lock appears in pg_locks AND the request has not returned -- that is "waiting on a
lock", which "slow" is not.

THE DISPROOF, NAMED FIRST AND RUN BY HAND: delete ` FOR NO KEY UPDATE` from the
guard's SELECT in server/app/users.py::deactivate_user and run this against a fresh
scratch. C1 still goes green (the route now blocks at its UPDATE instead of its
SELECT), but C2 flips to 200 and C3 to 0 active admins -- the race zeroes the shop.
That red is the ONLY direct evidence the lock does anything, because no serial path
reaches the guard. (A no-guard build reddens C2/C3 identically.)
"""
from __future__ import annotations

import argparse
import asyncio
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
SCRATCH_DB = "recycle_user_admin_scratch"
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
    out = os.path.join(tempfile.gettempdir(), f"recycle-useradmin-dump-{RUN}")
    label = f"useradmin-{RUN}"
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
    if "post" not in paths.get("/users/{user_id}/deactivate", {}):
        return "the server does not declare POST /users/{user_id}/deactivate"
    if "post" not in paths.get("/users/{user_id}/activate", {}):
        return "the server does not declare POST /users/{user_id}/activate"
    return ""


# ---------------------------------------------------------------------------
# fixture: one throwaway tenant, two admins and a staff. Per-run usernames and
# passwords, none ever printed.
# ---------------------------------------------------------------------------
U = {
    "a1": f"admin1-{RUN}",
    "a2": f"admin2-{RUN}",
    "staff": f"staff-{RUN}",
}
PW = {k: f"pw-{k}-{RUN}" for k in U}


class Ctx:
    def __init__(self) -> None:
        self.tenant = uuid.uuid4()
        self.ids = {k: uuid.uuid4() for k in U}

    @property
    def a1(self) -> uuid.UUID:
        return self.ids["a1"]

    @property
    def a2(self) -> uuid.UUID:
        return self.ids["a2"]

    @property
    def staff(self) -> uuid.UUID:
        return self.ids["staff"]


async def provision(ctx: Ctx) -> None:
    from sqlalchemy import text
    from app.db import tenant_connection
    from app.security import hash_password

    async with tenant_connection(ctx.tenant) as conn:
        await conn.execute(text("INSERT INTO tenants (id, name) VALUES (:id, :n)"),
                           {"id": ctx.tenant, "n": f"UA {RUN}"})
        for k, role in (("a1", "admin"), ("a2", "admin"), ("staff", "staff")):
            ph = await hash_password(PW[k])
            await conn.execute(
                text("INSERT INTO users (id, tenant_id, username, full_name, role,"
                     " password_hash) VALUES (:id, :t, :u, :fn, :r, :ph)"),
                {"id": ctx.ids[k], "t": ctx.tenant, "u": U[k],
                 "fn": U[k], "r": role, "ph": ph})


# ---------------------------------------------------------------------------
# helpers over HTTP and over Postgres
# ---------------------------------------------------------------------------
def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def login_token(client, tenant, username, password) -> str | None:
    r = await client.post(
        "/auth/login",
        json={"tenant_id": str(tenant), "username": username, "password": password})
    return r.json().get("access_token") if r.status_code == 200 else None


def refusal_code(r: httpx.Response) -> str | None:
    try:
        detail = r.json().get("detail")
    except ValueError:
        return None
    return detail.get("code") if isinstance(detail, dict) else None


async def pg_active_admin_count(tenant: uuid.UUID) -> int:
    """Re-derive the count OUT OF POSTGRES, not off a response body
    (a-checker-must-not-share-the-code-it-checks)."""
    from sqlalchemy import text
    from app.db import tenant_connection
    async with tenant_connection(tenant) as conn:
        return (await conn.execute(
            text("SELECT count(*) FROM users WHERE role = 'admin' AND is_active"),
        )).scalar_one()


# ---------------------------------------------------------------------------
# the cells
# ---------------------------------------------------------------------------
async def run(ctx: Ctx, client: httpx.AsyncClient) -> None:
    admin_tok = await login_token(client, ctx.tenant, U["a1"], PW["a1"])
    check(bool(admin_tok), "E1: admin1 can sign in (fixture is live)")
    if not admin_tok:
        return
    check((await pg_active_admin_count(ctx.tenant)) == 2,
          "E1: the shop starts with exactly two active admins")

    # --- S1: with two active admins, deactivating one SUCCEEDS (down to one)
    header("S1  two active admins -> deactivating one is allowed")
    r = await client.post(f"/users/{ctx.a2}/deactivate", headers=auth(admin_tok))
    body = r.json() if r.status_code == 200 else {}
    check(r.status_code == 200 and body.get("is_active") is False,
          f"S1: admin1 deactivates admin2 -> 200, is_active false (got {r.status_code})")
    check((await pg_active_admin_count(ctx.tenant)) == 1,
          "S1: exactly one active admin remains in Postgres")

    # --- S3: the SOLE remaining admin deactivating ITSELF is refused by
    # cannot_deactivate_self, BEFORE the new guard -- proving the guard did not
    # change the existing refusal's identity or its order.
    header("S3  the sole admin self-deactivating is still cannot_deactivate_self")
    r = await client.post(f"/users/{ctx.a1}/deactivate", headers=auth(admin_tok))
    code = refusal_code(r)
    check(r.status_code == 403 and code == "cannot_deactivate_self",
          f"S3: self-deactivation is 403 cannot_deactivate_self, NOT last_active_admin"
          f" (got {r.status_code} {code}) -- the self-check still runs first")
    check((await pg_active_admin_count(ctx.tenant)) == 1,
          "S3: still one active admin -- the refusal changed nothing")

    # --- S2: reactivation restores the ability
    header("S2  reactivation restores the second admin")
    r = await client.post(f"/users/{ctx.a2}/activate", headers=auth(admin_tok))
    body = r.json() if r.status_code == 200 else {}
    check(r.status_code == 200 and body.get("is_active") is True,
          f"S2: admin2 reactivated -> 200, is_active true (got {r.status_code})")
    check((await pg_active_admin_count(ctx.tenant)) == 2,
          "S2: two active admins again")

    # --- S4: the guard is scoped to admins -- a staff deactivation is untouched
    header("S4  a staff deactivation is not gated by the admin guard")
    r = await client.post(f"/users/{ctx.staff}/deactivate", headers=auth(admin_tok))
    check(r.status_code == 200,
          f"S4: deactivating a STAFF account succeeds -> 200 (got {r.status_code})")
    check((await pg_active_admin_count(ctx.tenant)) == 2,
          "S4: the active-admin count is unchanged by a staff deactivation")

    # --- C: the concurrent mutual-deactivation race, closed by the lock. See the
    # module docstring for why C0 is the barrier and why this is deterministic.
    header("C  concurrent mutual deactivation -> the shop is NOT locked out")
    await cell_concurrency(ctx, client, admin_tok)


async def cell_concurrency(ctx: Ctx, client: httpx.AsyncClient, admin_tok: str) -> None:
    from sqlalchemy import text
    from app.db import engine

    async with engine.connect() as c0:
        async with c0.begin():
            # C0 takes the SAME lock the route will take, under the tenant context
            # the route runs in (set_config, the tenant_connection primitive).
            await c0.execute(
                text("SELECT set_config('app.tenant_id', :t, true)"),
                {"t": str(ctx.tenant)})
            locked = (await c0.execute(text(
                "SELECT id FROM users WHERE role = 'admin' AND is_active"
                " ORDER BY id FOR NO KEY UPDATE"))).scalars().all()
            check(len(locked) == 2,
                  f"C0: the barrier holds the two active admins the route contends on"
                  f" (locked {len(locked)})")

            # Fire the REAL route on the child uvicorn: admin1 deactivates admin2.
            # This is the race's LOSER; C0 will play the winner (deactivate admin1).
            task = asyncio.create_task(
                client.post(f"/users/{ctx.a2}/deactivate", headers=auth(admin_tok)))

            # Wait for the EVENT -- a lock waiter -- bounded, not a fixed sleep.
            waiters = 0
            for _ in range(60):
                await asyncio.sleep(0.1)
                waiters = (await c0.execute(
                    text("SELECT count(*) FROM pg_locks WHERE NOT granted"))).scalar_one()
                if waiters >= 1 and not task.done():
                    break
            check(waiters >= 1 and not task.done(),
                  f"C1: the HTTP deactivate is BLOCKED on a lock -- a NOT-granted lock"
                  f" exists ({waiters}) and the request has not returned"
                  f" (done={task.done()}); waiting, not slow")

            # C0 is the concurrent winner: it deactivates the OTHER admin, then the
            # `async with c0.begin()` exit COMMITS and releases the lock.
            await c0.execute(
                text("UPDATE users SET is_active = false,"
                     " token_version = token_version + 1 WHERE id = :id"),
                {"id": ctx.a1})

    # The blocked route now resumes: admin1 is gone, so admin2 is the last admin.
    r = await task
    code = refusal_code(r)
    check(r.status_code == 409 and code == "last_active_admin",
          f"C2: the loser is refused 409 last_active_admin (got {r.status_code} {code})")
    remaining = await pg_active_admin_count(ctx.tenant)
    check(remaining == 1,
          f"C3: exactly ONE active admin remains -- the shop is not locked out"
          f" (active admins = {remaining}; a no-lock guard would read 0)")


async def main() -> int:
    global BASE
    ap = argparse.ArgumentParser(
        description="Prove the last-active-admin guard on POST /users/{id}/deactivate.")
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
        mode="w", suffix=".log", prefix="prove_user_admin_", delete=False, encoding="utf-8")
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
        check(True, "E0: /openapi.json declares POST /users/{user_id}/deactivate and /activate")

        try:
            await provision(ctx)
        except Exception as exc:  # noqa: BLE001
            print(f"UNFIT: provisioning failed: {exc!r}")
            return 2
        print(f"      provisioned tenant={ctx.tenant}")

        async with httpx.AsyncClient(base_url=BASE, timeout=30.0) as client:
            await run(ctx, client)

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
    print(f"PROVE_USER_ADMIN_EXIT={rc}")
    sys.exit(rc)
