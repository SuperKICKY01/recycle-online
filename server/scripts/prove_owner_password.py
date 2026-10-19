"""Prove that ONLY THE OWNER changes the owner's password, and that the provider-side reset works
and is audited (ADVISOR-DECIDED 2026-10-17, 3a), over real HTTP on a scratch.

Model on prove_user_admin.py: restore a SCRATCH from a live dump, start a child uvicorn on it,
gate on /openapi.json, provision ONE throwaway tenant by SQL -- two owners, an admin, a staff --
with per-run names and passwords (none printed), so the proof is green twice with no reseed and
never touches a seeded account's login lock.

  O1  an ADMIN resetting the OWNER's password -> 403 owner_password_owner_only; the owner's
      hash and token_version in Postgres are unchanged.
  O2  a SECOND OWNER resetting the owner's password -> 403 as well ("no one but the owner").
  O3  the control: the same admin resetting a STAFF password -> 200 (the guard is scoped).
  O4  the owner's OWN change through POST /users/me/password -> 200, and the new password signs in.
  O5  the owner through the reset route on their OWN id -> 200 (self is the owner).
  A1-A4 WIDENED 2026-10-19 -- every other write on a user row (revoke-sessions, deactivate,
      activate, unlock-login): admin -> owner 403 owner_account_owner_only with the owner's row
      unchanged in Postgres; a second owner -> owner 403; admin -> staff still works; the owner on
      their OWN account as before (revoke 200, deactivate 403 cannot_deactivate_self, activate 200,
      unlock 200).
  R1  scripts/reset_owner_password.py REFUSES (exit 2) with no --username, with no --tenant-id,
      and on a non-owner.
  R2  it resets the owner (exit 0): the new password signs in, the session minted before is 401,
      and audit_log holds the UPDATE on users for that id by `system:reset_owner_password`.
  R3  a LOCKED-OUT owner (FAILURE_THRESHOLD wrong passwords): the right password is refused; the
      tool's --unlock refuses without --username, then unlocks (exit 0), the owner signs in, and a
      second audited UPDATE exists.
  R4  a DEACTIVATED owner (set by SQL as the system actor -- no route can do it now): the tool's
      --reactivate (exit 0) brings it back, the owner signs in, and the audit row shows is_active
      false -> true.

THE DISPROOFS, RUN BY HAND (2026-10-19), one per call site of
server/app/users.py::_refuse_another_owners_account: delete the call in a route and that route's
admin/owner2 -> owner cells go red. For the password route O4 goes red with them: the admin's reset
has already taken the owner's password and ended the owner's session -- that cascade IS the
takeover.
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
from lane import scratch_name  # noqa: E402  (scratch names are decided in lane.py only)
SCRATCH_DB = scratch_name("recycle_owner_password_scratch")
RUN = uuid.uuid4().hex[:8]
ORIG_ENV = dict(os.environ)

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


def restore_scratch(live_name: str, scratch: str) -> None:
    out = os.path.join(tempfile.gettempdir(), f"recycle-ownerpw-dump-{RUN}")
    label = f"ownerpw-{RUN}"
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
            if httpx.get(f"{BASE}/health", timeout=2.0).status_code == 200:
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
    for p in ("/users/{user_id}/password", "/users/me/password"):
        if "post" not in paths.get(p, {}):
            return f"the server does not declare POST {p}"
    return ""


# ---------------------------------------------------------------------------
# fixture: one throwaway tenant -- two owners, an admin, a staff. Per-run names and
# passwords, none ever printed.
# ---------------------------------------------------------------------------
U = {"owner": f"owner-{RUN}", "owner2": f"owner2-{RUN}", "admin": f"admin-{RUN}", "staff": f"staff-{RUN}"}
ROLE = {"owner": "owner", "owner2": "owner", "admin": "admin", "staff": "staff"}
PW = {k: f"pw-{k}-{RUN}" for k in U}


class Ctx:
    def __init__(self) -> None:
        self.tenant = uuid.uuid4()
        self.ids = {k: uuid.uuid4() for k in U}


async def provision(ctx: Ctx) -> None:
    from sqlalchemy import text
    from app.db import SYSTEM_ACTOR_ID, tenant_connection
    from app.permissions import seed_system_roles
    from app.security import hash_password

    async with tenant_connection(ctx.tenant, actor_id=SYSTEM_ACTOR_ID,
                                 actor_username="system:prove_owner_password") as conn:
        await conn.execute(text("INSERT INTO tenants (id, name) VALUES (:id, :n)"),
                           {"id": ctx.tenant, "n": f"OP {RUN}"})
        # The born-with branch (0018) and the three system roles (0019), as provision_shop.py
        # provisions a shop -- reconcile.py's T18 requires the branch on every tenant.
        await conn.execute(
            text("INSERT INTO branches (tenant_id, code, name, doc_prefix, is_active)"
                 " VALUES (:t, 'MAIN', :n, 'B', true)"),
            {"t": ctx.tenant, "n": f"OP {RUN}"})
        roles = await seed_system_roles(conn, ctx.tenant)
        for k in U:
            await conn.execute(
                text("INSERT INTO users (id, tenant_id, username, full_name, role_id,"
                     " password_hash) VALUES (:id, :t, :u, :fn, :r, :ph)"),
                {"id": ctx.ids[k], "t": ctx.tenant, "u": U[k], "fn": U[k],
                 "r": roles[ROLE[k]], "ph": await hash_password(PW[k])})


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


async def login_token(client: httpx.AsyncClient, tenant: uuid.UUID, username: str, password: str) -> str | None:
    r = await client.post("/auth/login",
                          json={"tenant_id": str(tenant), "username": username, "password": password})
    return r.json().get("access_token") if r.status_code == 200 else None


def refusal_code(r: httpx.Response) -> str | None:
    try:
        detail = r.json().get("detail")
    except ValueError:
        return None
    return detail.get("code") if isinstance(detail, dict) else None


async def pg_user(ctx: Ctx, key: str) -> tuple[str, int]:
    """The row OUT OF POSTGRES, never off a response body."""
    from sqlalchemy import text
    from app.db import tenant_connection
    async with tenant_connection(ctx.tenant) as conn:
        row = (await conn.execute(text("SELECT password_hash, token_version FROM users WHERE id = :id"),
                                  {"id": ctx.ids[key]})).one()
    return row[0], int(row[1])


async def pg_state(ctx: Ctx, key: str) -> tuple[bool, int]:
    """is_active and token_version OUT OF POSTGRES."""
    from sqlalchemy import text
    from app.db import tenant_connection
    async with tenant_connection(ctx.tenant) as conn:
        row = (await conn.execute(text("SELECT is_active, token_version FROM users WHERE id = :id"),
                                  {"id": ctx.ids[key]})).one()
    return bool(row[0]), int(row[1])


async def pg_markers(ctx: Ctx, key: str) -> int:
    """Rows in failed_login_attempts for this account (an unlock APPENDS a marker)."""
    from sqlalchemy import text
    from app.db import tenant_connection
    async with tenant_connection(ctx.tenant) as conn:
        return int((await conn.execute(text("SELECT count(*) FROM failed_login_attempts WHERE username = :u"),
                                       {"u": U[key]})).scalar_one())


async def pg_reactivations(ctx: Ctx) -> int:
    from sqlalchemy import text
    from app.db import tenant_connection
    async with tenant_connection(ctx.tenant) as conn:
        return int((await conn.execute(text(
            "SELECT count(*) FROM audit_log WHERE table_name = 'users' AND action = 'UPDATE'"
            " AND actor_username = 'system:reset_owner_password' AND new_data->>'id' = :id"
            " AND (old_data->>'is_active')::boolean = false AND (new_data->>'is_active')::boolean = true"),
            {"id": str(ctx.ids["owner"])})).scalar_one())


async def pg_audit_resets(ctx: Ctx) -> int:
    from sqlalchemy import text
    from app.db import tenant_connection
    async with tenant_connection(ctx.tenant) as conn:
        return int((await conn.execute(text(
            "SELECT count(*) FROM audit_log WHERE table_name = 'users' AND action = 'UPDATE'"
            " AND actor_username = 'system:reset_owner_password'"
            # The hash itself is REDACTED by the trigger (0017), so the reset is recognised by
            # the token_version bump it makes in the same UPDATE -- and the hash must be absent.
            " AND new_data->>'id' = :id"
            " AND (new_data->>'token_version')::int = (old_data->>'token_version')::int + 1"
            " AND NOT (new_data ? 'password_hash') AND NOT (old_data ? 'password_hash')"),
            {"id": str(ctx.ids["owner"])})).scalar_one())


def run_reset(scratch: str, ctx: Ctx, username: str | None, password: str | None,
              *flags: str, tenant: bool = True) -> tuple[int, str]:
    """The script, as WE run it: server/.env's own URLs (it rebinds itself to --database) and
    the new password in the environment, never on the command line."""
    env = dict(ORIG_ENV)
    env.pop("OWNER_NEW_PASSWORD", None)
    if password is not None:
        env["OWNER_NEW_PASSWORD"] = password
    env["PYTHONIOENCODING"] = "utf-8"
    args = [sys.executable, os.path.join("scripts", "reset_owner_password.py"), "--database", scratch, *flags]
    if tenant:
        args += ["--tenant-id", str(ctx.tenant)]
    if username is not None:
        args += ["--username", username]
    cp = subprocess.run(args, cwd=SERVER_DIR, env=env, capture_output=True, text=True,
                        encoding="utf-8", errors="replace", timeout=120)
    return cp.returncode, cp.stdout + cp.stderr


async def run(ctx: Ctx, client: httpx.AsyncClient, scratch: str) -> None:
    tok = {k: await login_token(client, ctx.tenant, U[k], PW[k]) for k in U}
    check(all(tok.values()), f"E1: all four fixture accounts sign in ({sorted(k for k, v in tok.items() if v)})")
    if not all(tok.values()):
        return

    header("O1  an ADMIN resetting the OWNER's password is refused")
    before = await pg_user(ctx, "owner")
    r = await client.post(f"/users/{ctx.ids['owner']}/password", headers=auth(tok["admin"]),
                          json={"new_password": f"taken-by-admin-{RUN}"})
    check(r.status_code == 403 and refusal_code(r) == "owner_password_owner_only",
          f"O1: admin -> owner is 403 owner_password_owner_only (got {r.status_code} {refusal_code(r)})")
    check(await pg_user(ctx, "owner") == before,
          "O1: the owner's password_hash and token_version in Postgres are unchanged")

    header("O2  a SECOND OWNER resetting the owner's password is refused too")
    r = await client.post(f"/users/{ctx.ids['owner']}/password", headers=auth(tok["owner2"]),
                          json={"new_password": f"taken-by-owner2-{RUN}"})
    check(r.status_code == 403 and refusal_code(r) == "owner_password_owner_only",
          f"O2: owner2 -> owner is 403 owner_password_owner_only (got {r.status_code} {refusal_code(r)})")
    check(await pg_user(ctx, "owner") == before, "O2: the owner's row is still unchanged")

    header("O3  control: the same admin resetting a STAFF password still works")
    r = await client.post(f"/users/{ctx.ids['staff']}/password", headers=auth(tok["admin"]),
                          json={"new_password": f"staff-new-{RUN}"})
    check(r.status_code == 200, f"O3: admin -> staff is 200 (got {r.status_code})")
    check(bool(await login_token(client, ctx.tenant, U["staff"], f"staff-new-{RUN}")),
          "O3: staff signs in with the password the admin set")

    header("O4  the owner's OWN change through /users/me/password works")
    new_own = f"owner-own-{RUN}"
    r = await client.post("/users/me/password", headers=auth(tok["owner"]),
                          json={"current_password": PW["owner"], "new_password": new_own})
    check(r.status_code == 200, f"O4: owner /users/me/password is 200 (got {r.status_code})")
    owner_tok = await login_token(client, ctx.tenant, U["owner"], new_own)
    check(bool(owner_tok), "O4: the owner signs in with the new password")

    header("O5  the owner through the reset route on their OWN id works")
    new_self = f"owner-self-{RUN}"
    r = await client.post(f"/users/{ctx.ids['owner']}/password", headers=auth(owner_tok or ""),
                          json={"new_password": new_self})
    check(r.status_code == 200, f"O5: owner -> own id is 200 (got {r.status_code})")
    owner_tok = await login_token(client, ctx.tenant, U["owner"], new_self)
    check(bool(owner_tok), "O5: the owner signs in with that password")
    owner_pw = new_self

    # --- A: every OTHER write on a user row (widened 2026-10-19). Each route: admin -> owner and
    # owner2 -> owner refused with the owner's row unchanged in Postgres; admin -> staff works;
    # the owner on their own account as before. Statuses and codes are read off the raw response.
    async def refused_on_owner(label: str, path: str) -> None:
        before = (await pg_state(ctx, "owner"), await pg_markers(ctx, "owner"))
        for who in ("admin", "owner2"):
            r = await client.post(path.format(ctx.ids["owner"]), headers=auth(tok[who]))
            check(r.status_code == 403 and refusal_code(r) == "owner_account_owner_only",
                  f"{label}: {who} -> owner is 403 owner_account_owner_only (got {r.status_code} {refusal_code(r)})")
        after = (await pg_state(ctx, "owner"), await pg_markers(ctx, "owner"))
        check(after == before, f"{label}: the owner's is_active, token_version and lockout rows are unchanged"
                               f" ({before} -> {after})")

    header("A1  revoke-sessions")
    await refused_on_owner("A1", "/users/{}/revoke-sessions")
    r = await client.get("/whoami", headers=auth(owner_tok or ""))
    check(r.status_code == 200, f"A1: the owner's session survived the refused revokes (whoami {r.status_code})")
    staff_tok = await login_token(client, ctx.tenant, U["staff"], f"staff-new-{RUN}")
    r = await client.post(f"/users/{ctx.ids['staff']}/revoke-sessions", headers=auth(tok["admin"]))
    r2 = await client.get("/whoami", headers=auth(staff_tok or ""))
    check(r.status_code == 200 and r2.status_code == 401,
          f"A1: admin -> staff revoke still works (got {r.status_code}; staff whoami now {r2.status_code})")
    r = await client.post(f"/users/{ctx.ids['owner']}/revoke-sessions", headers=auth(owner_tok or ""))
    check(r.status_code == 200, f"A1: the owner revokes their OWN sessions as before (got {r.status_code})")
    owner_tok = await login_token(client, ctx.tenant, U["owner"], owner_pw)

    header("A2  deactivate")
    await refused_on_owner("A2", "/users/{}/deactivate")
    r = await client.post(f"/users/{ctx.ids['staff']}/deactivate", headers=auth(tok["admin"]))
    check(r.status_code == 200 and r.json().get("is_active") is False,
          f"A2: admin -> staff deactivate still works (got {r.status_code})")
    r = await client.post(f"/users/{ctx.ids['owner']}/deactivate", headers=auth(owner_tok or ""))
    check(r.status_code == 403 and refusal_code(r) == "cannot_deactivate_self",
          f"A2: the owner deactivating their OWN account is still cannot_deactivate_self"
          f" (got {r.status_code} {refusal_code(r)})")

    header("A3  activate")
    await refused_on_owner("A3", "/users/{}/activate")
    r = await client.post(f"/users/{ctx.ids['staff']}/activate", headers=auth(tok["admin"]))
    check(r.status_code == 200 and r.json().get("is_active") is True,
          f"A3: admin -> staff activate still works (got {r.status_code})")
    r = await client.post(f"/users/{ctx.ids['owner']}/activate", headers=auth(owner_tok or ""))
    check(r.status_code == 200, f"A3: the owner on their OWN active account is the idempotent 200 as before"
                                f" (got {r.status_code})")

    header("A4  unlock-login")
    await refused_on_owner("A4", "/users/{}/unlock-login")
    r = await client.post(f"/users/{ctx.ids['staff']}/unlock-login", headers=auth(tok["admin"]))
    check(r.status_code == 200, f"A4: admin -> staff unlock still works (got {r.status_code})")
    r = await client.post(f"/users/{ctx.ids['owner']}/unlock-login", headers=auth(owner_tok or ""))
    check(r.status_code == 200, f"A4: the owner unlocks their OWN account as before (got {r.status_code})")

    header("R1  the provider script refuses without an explicit owner identity")
    rc, out = run_reset(scratch, ctx, None, f"provider-{RUN}")
    check(rc == 2 and "--username are required" in out,
          f"R1: no --username -> exit 2, refusing (exit {rc})")
    rc, out = run_reset(scratch, ctx, U["owner"], f"provider-{RUN}", tenant=False)
    check(rc == 2 and "--tenant-id and --username are required" in out,
          f"R1: no --tenant-id -> exit 2, refusing (exit {rc})")
    rc, out = run_reset(scratch, ctx, U["admin"], f"provider-{RUN}")
    check(rc == 2 and "not 'owner'" in out, f"R1: an ADMIN username -> exit 2, not an owner (exit {rc})")
    check(await pg_audit_resets(ctx) == 0, "R1: the refusals wrote no audit row")

    header("R2  the provider script resets the owner, ends the old session, and is audited")
    provider_pw = f"provider-{RUN}"
    rc, out = run_reset(scratch, ctx, U["owner"], provider_pw)
    check(rc == 0 and "RESET_OWNER_PASSWORD_EXIT=0" in out and provider_pw not in out,
          f"R2: the script exits 0 and never prints the password (exit {rc})")
    check(bool(await login_token(client, ctx.tenant, U["owner"], provider_pw)),
          "R2: the owner signs in with the provider-set password")
    r = await client.get("/whoami", headers=auth(owner_tok or ""))
    check(r.status_code == 401, f"R2: the session minted before the reset is 401 (got {r.status_code})")
    n = await pg_audit_resets(ctx)
    check(n == 1, f"R2: audit_log holds exactly one UPDATE of the owner's row by"
                  f" system:reset_owner_password, token_version +1, hash redacted (found {n})")

    header("R3  a LOCKED-OUT owner comes back only through the provider's --unlock")
    from app.login_guard import FAILURE_THRESHOLD
    for i in range(FAILURE_THRESHOLD):
        await login_token(client, ctx.tenant, U["owner"], f"wrong-{i}-{RUN}")
    check(not await login_token(client, ctx.tenant, U["owner"], provider_pw),
          f"R3: after {FAILURE_THRESHOLD} wrong passwords the RIGHT one is refused (locked out)")
    rc, out = run_reset(scratch, ctx, None, None, "--unlock")
    check(rc == 2 and "--username are required" in out, f"R3: --unlock with no --username -> exit 2 (exit {rc})")
    rc, out = run_reset(scratch, ctx, U["owner"], None, "--unlock")
    check(rc == 0 and "done (unlock)" in out, f"R3: --unlock exits 0 (exit {rc})")
    check(bool(await login_token(client, ctx.tenant, U["owner"], provider_pw)),
          "R3: the owner signs in with the same password, unlocked")
    n = await pg_audit_resets(ctx)
    check(n == 2, f"R3: a second audited UPDATE of the owner's row by system:reset_owner_password (found {n})")

    header("R4  a DEACTIVATED owner comes back only through the provider's --reactivate")
    from sqlalchemy import text
    from app.db import SYSTEM_ACTOR_ID, tenant_connection
    # No route can deactivate an owner now (A2), so the state is made by SQL as the system actor --
    # the state a shop would be in after an older build, or a deactivation by us.
    async with tenant_connection(ctx.tenant, actor_id=SYSTEM_ACTOR_ID,
                                 actor_username="system:prove_owner_password") as conn:
        await conn.execute(text("UPDATE users SET is_active = false, token_version = token_version + 1"
                                " WHERE id = :id"), {"id": ctx.ids["owner"]})
    check(not await login_token(client, ctx.tenant, U["owner"], provider_pw),
          "R4: the deactivated owner cannot sign in")
    rc, out = run_reset(scratch, ctx, U["owner"], None, "--reactivate")
    check(rc == 0 and "done (reactivate)" in out and "is_active True" in out, f"R4: --reactivate exits 0 (exit {rc})")
    check(bool(await login_token(client, ctx.tenant, U["owner"], provider_pw)), "R4: the owner signs in again")
    n = await pg_reactivations(ctx)
    check(n == 1, f"R4: audit_log holds the provider's UPDATE with is_active false -> true (found {n})")


async def main() -> int:
    global BASE
    ap = argparse.ArgumentParser(description="Prove only the owner changes the owner's password.")
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
    log = tempfile.NamedTemporaryFile(mode="w", suffix=".log", prefix="prove_owner_password_",
                                      delete=False, encoding="utf-8")
    proc = subprocess.Popen(
        [sys.executable, "-u", "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=SERVER_DIR, env=dict(os.environ), stdout=log, stderr=subprocess.STDOUT)
    print(f"  child uvicorn pid={proc.pid} on {BASE} against scratch {scratch!r}")
    try:
        why = wait_for_health(proc)
        if why:
            check(False, f"E0: server started -- {why}")
            return 1
        wrong = assert_serving_this_code()
        if wrong:
            check(False, f"E0: serving THIS code -- {wrong}")
            return 1
        check(True, "E0: /openapi.json declares POST /users/{user_id}/password and /users/me/password")
        try:
            await provision(ctx)
        except Exception as exc:  # noqa: BLE001
            print(f"UNFIT: provisioning failed: {exc!r}")
            return 2
        print(f"      provisioned tenant={ctx.tenant}")
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
    print(f"PROVE_OWNER_PASSWORD_EXIT={rc}")
    sys.exit(rc)
