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
  R1  scripts/reset_owner_password.py REFUSES (exit 2) with no --username, and on a non-owner.
  R2  it resets the owner (exit 0): the new password signs in, the session minted before is 401,
      and audit_log holds the UPDATE on users for that id by `system:reset_owner_password`.

THE DISPROOF, RUN BY HAND (2026-10-19): delete the owner guard in
server/app/users.py::reset_user_password -- O1 and O2 go red (200, the owner's row changed), and O4
with them: the admin's reset has already taken the owner's password and ended the owner's session, so
the owner's own change answers 401. That cascade IS the takeover; no other cell goes red.
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


def run_reset(scratch: str, ctx: Ctx, username: str | None, password: str) -> tuple[int, str]:
    """The script, as WE run it: server/.env's own URLs (it rebinds itself to --database) and
    the new password in the environment, never on the command line."""
    env = dict(ORIG_ENV)
    env["OWNER_NEW_PASSWORD"] = password
    env["PYTHONIOENCODING"] = "utf-8"
    args = [sys.executable, os.path.join("scripts", "reset_owner_password.py"),
            "--database", scratch, "--tenant-id", str(ctx.tenant)]
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

    header("R1  the provider script refuses without an explicit owner identity")
    rc, out = run_reset(scratch, ctx, None, f"provider-{RUN}")
    check(rc == 2 and "--username are required" in out,
          f"R1: no --username -> exit 2, refusing (exit {rc})")
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
