"""Prove POST /auth/shop-code over REAL HTTP, and prove login is unchanged.

    python scripts/prove_shop_code.py \
        --app-database recycle_restore_scratch \
        --directory-database recycle_keyshape_scratch

REFUSES TO RUN AGAINST THE LIVE DATABASE, for either argument, and the refusal
is the point: this script WRITES a fixture row into the directory relation, and
`recycle` is the live money database. Nothing writes to that relation in
production, so a fixture seeded there would be the only row any shop ever had.

IT STARTS ITS OWN SERVER. uvicorn is launched as a child process with the two
database URLs overridden IN THE CHILD'S ENVIRONMENT -- a dict, never a command
line, because every shell command on this box lands verbatim in
.claude/hooks/*.log and these URLs carry passwords. The URLs are derived from
.env by swapping only the database NAME (make_url(...).set(database=...)), so no
credential is typed anywhere in this file.

WHY TWO DIFFERENT SCRATCH DATABASES, and it is the whole of P4. The fixture code
is created in the DIRECTORY database and asserted ABSENT from the APP database.
A resolution therefore cannot have come from the application engine: that engine
is pointed at a database where the row does not exist, and its role additionally
holds no privilege on schema `directory` at all. Two independent reasons, either
of which would turn a wrong-engine handler red.

REPEATABLE. The fixture is DELETED and re-created on every run rather than found
(lessons/proof-must-run-twice.md: a proof that normalises its own fixture as
setup measures its previous run). Run it twice with no reseed; it passes twice.

THE EXIT LINE, AND WHAT SUPPRESSES IT. main() prints
`PROVE_SHOP_CODE_EXIT=<n>` from the same integer it returns. That line is
ABSENT if the script dies before the summary -- uvicorn failing to start, a
database being unreachable, an unhandled exception. THE ABSENCE IS THE SIGNAL:
a reader scanning for a number and finding none has NOT found a pass.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import socket
import subprocess
import sys
import tempfile
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

# Same placement as prove_docno_clock.py, and for the reason
# lessons/config-defaults-must-fail-closed.md records: load_dotenv resolves .env
# from the CALLING FILE, not the cwd. This file is server/scripts/..., so the
# walk up finds server/.env whatever directory the script was invoked from.
load_dotenv()

import httpx  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
)

# CHOSEN AT RUNTIME, NEVER FIXED, AND THIS COST A FALSE GREEN ONCE.
# A hardcoded 8137 met a python3.12 process that had been listening there since
# 2026-08-07 -- not this venv, not started by this proof. The child uvicorn could
# not bind, exited, and `wait_for_health` cheerfully got 200 FROM THE STALE
# SERVER. /health cannot tell "my server" from "somebody else's": P2 and P3 then
# passed against that server's route-not-found 404, which is the right status for
# the wrong reason. A free port removes the collision; assert_serving_this_code()
# below removes the ambiguity even if one happens anyway.
BASE = ""  # set in main(), once the port is known


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])

# 8 characters from ck_shop_code's alphabet: A-Z and 0-9 minus O, 0, I, 1, L.
FIXTURE_CODE = "ZZ9TEST4"      # created by this script, resolves to tenant A
ABSENT_CODE = "ZZ9ABSNT"       # well-formed, deliberately never created
MALFORMED_CODE = "zzz"         # lowercase and too short: cannot match any row

failures: list[str] = []


def banner(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def check(cond: bool, label: str) -> None:
    if not cond:
        failures.append(label)
    print(f"  [{'ok ' if cond else 'RED'}] {label}")


async def seed_fixture(owner_url: str, app_owner_url: str) -> tuple[int, int]:
    """Create the fixture in the DIRECTORY database. Returns (dir_rows, app_rows).

    Deleted then inserted, never upserted-and-hoped: a run must not be able to
    pass on a row an earlier run left behind in some other shape.
    """
    eng = create_async_engine(owner_url)
    try:
        async with eng.begin() as conn:
            await conn.execute(
                text("DELETE FROM directory.shop_codes"
                     " WHERE code = :c OR tenant_id = :t"),
                {"c": FIXTURE_CODE, "t": TENANT_A_ID},
            )
            await conn.execute(
                text("INSERT INTO directory.shop_codes (tenant_id, code)"
                     " VALUES (:t, :c)"),
                {"t": TENANT_A_ID, "c": FIXTURE_CODE},
            )
        async with eng.connect() as conn:
            dir_rows = (await conn.execute(
                text("SELECT count(*) FROM directory.shop_codes WHERE code = :c"),
                {"c": FIXTURE_CODE},
            )).scalar_one()
    finally:
        await eng.dispose()

    # The other half of P4's discriminator: the APP database must NOT hold it.
    eng2 = create_async_engine(app_owner_url)
    try:
        async with eng2.connect() as conn:
            app_rows = (await conn.execute(
                text("SELECT count(*) FROM directory.shop_codes WHERE code = :c"),
                {"c": FIXTURE_CODE},
            )).scalar_one()
    finally:
        await eng2.dispose()
    return dir_rows, app_rows


async def app_role_is_refused(app_role_url_on_dir_db: str) -> str:
    """As the APPLICATION role, try to read the directory relation. Must fail."""
    eng = create_async_engine(app_role_url_on_dir_db)
    try:
        async with eng.connect() as conn:
            await conn.execute(text("SELECT count(*) FROM directory.shop_codes"))
        return ""            # no refusal: the discriminator is void
    except Exception as exc:  # noqa: BLE001 - the refusal IS the measurement
        orig = getattr(exc, "orig", None)
        for c in (getattr(orig, "__cause__", None), orig, exc):
            if c is not None and str(c).strip():
                return str(c).strip()
        return "<no message>"
    finally:
        await eng.dispose()


def wait_for_health(proc: subprocess.Popen, timeout_s: float = 45.0) -> str:
    """Wait for OUR child to serve /health. Returns "" on success, else why not.

    Takes the child so a DEAD child fails immediately instead of being waited out
    for the full timeout and then blamed on the clock.
    """
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            return f"the uvicorn child exited with code {proc.returncode}"
        try:
            r = httpx.get(f"{BASE}/health", timeout=2.0)
            if r.status_code == 200:
                return ""
        except Exception:  # noqa: BLE001 - not up yet
            pass
        time.sleep(0.4)
    return f"no 200 from {BASE}/health within {timeout_s:.0f}s"


def assert_serving_this_code() -> str:
    """Prove the server answering is running THE CODE UNDER TEST.

    Without this, a stale server on the same port answers /health, 404s the new
    route, and every refusal assertion passes for the wrong reason. Asking its
    own schema ties the socket to the source: a server that does not declare
    this path is not the server this proof is about.
    """
    try:
        r = httpx.get(f"{BASE}/openapi.json", timeout=5.0)
    except Exception as exc:  # noqa: BLE001
        return f"could not read /openapi.json ({exc})"
    if r.status_code != 200:
        return f"/openapi.json returned {r.status_code}"
    paths = r.json().get("paths", {})
    if "/auth/shop-code" not in paths:
        return ("the server on this port does NOT declare /auth/shop-code -- it "
                "is not running the code under test")
    return ""


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Prove the shop-code lookup, and that login is unchanged.")
    ap.add_argument("--app-database", required=True,
                    help="a SCRATCH database for APP_DATABASE_URL.")
    ap.add_argument("--directory-database", required=True,
                    help="a SCRATCH database for DIRECTORY_DATABASE_URL. This "
                         "script WRITES a fixture row into its shop_codes.")
    args = ap.parse_args()

    app_live = make_url(os.environ["APP_DATABASE_URL"])
    dir_live = make_url(os.environ["DIRECTORY_DATABASE_URL"])
    owner_live = make_url(os.environ["MIGRATION_DATABASE_URL"])
    live_name = app_live.database

    for label, chosen in (("--app-database", args.app_database),
                          ("--directory-database", args.directory_database)):
        if chosen == live_name:
            print(f"REFUSED: {label} {chosen!r} is the LIVE database.\n"
                  "  This script writes a fixture row into directory.shop_codes.\n"
                  "  Nothing writes to that relation in production, so a seeded\n"
                  "  code there would be the only code any shop ever had, issued\n"
                  "  by a test. Point both arguments at scratch databases.")
            return 2
    if args.app_database == args.directory_database:
        print("REFUSED: the two databases must DIFFER.\n"
              "  P4 proves the endpoint read through the directory role by\n"
              "  asserting the code is absent from the APP database. Pointing\n"
              "  both at one database deletes that discriminator and the proof\n"
              "  would pass whichever engine the handler used.")
        return 2

    app_url = app_live.set(database=args.app_database)
    dir_url = dir_live.set(database=args.directory_database)
    owner_on_dir = owner_live.set(database=args.directory_database)
    owner_on_app = owner_live.set(database=args.app_database)
    app_role_on_dir = app_live.set(database=args.directory_database)

    print("=== prove_shop_code ===")
    print(f"  app database       : {args.app_database}")
    print(f"  directory database : {args.directory_database}")
    print(f"  live database      : {live_name!r} -- not touched")
    print(f"  fixture code       : {FIXTURE_CODE}")

    banner("FIXTURE - created, not found")
    dir_rows, app_rows = asyncio.run(seed_fixture(
        owner_on_dir.render_as_string(hide_password=False),
        owner_on_app.render_as_string(hide_password=False)))
    check(dir_rows == 1,
          f"fixture: the code exists in the DIRECTORY database (rows={dir_rows})")
    check(app_rows == 0,
          f"fixture: the code is ABSENT from the APP database (rows={app_rows})"
          " -- this is what makes P4 discriminating")

    refusal = asyncio.run(app_role_is_refused(
        app_role_on_dir.render_as_string(hide_password=False)))
    check(bool(refusal) and "permission denied" in refusal,
          f"fixture: the APPLICATION role cannot read the relation at all "
          f"({refusal or 'NO REFUSAL RAISED'})")

    # ------------------------------------------------------------------ server
    env = dict(os.environ)
    env["APP_DATABASE_URL"] = app_url.render_as_string(hide_password=False)
    env["DIRECTORY_DATABASE_URL"] = dir_url.render_as_string(hide_password=False)
    env["PYTHONUNBUFFERED"] = "1"

    server_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    port = free_port()
    global BASE
    BASE = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(  # noqa: SIM115 - closed in finally
        prefix="prove_shop_code_uvicorn_", suffix=".log", delete=False, mode="w+")
    proc = subprocess.Popen(
        [sys.executable, "-u", "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=server_dir, env=env, stdout=log, stderr=subprocess.STDOUT)
    try:
        why = wait_for_health(proc)
        if why:
            log.flush()
            with open(log.name, encoding="utf-8", errors="replace") as fh:
                tail = fh.read().replace("\r\n", "\n")[-2000:]
            print(f"SERVER DID NOT START: {why}\nuvicorn output:\n{tail}")
            return 1
        wrong = assert_serving_this_code()
        if wrong:
            print(f"WRONG SERVER: {wrong}\n"
                  f"  Something else is answering on {BASE}. Every assertion\n"
                  "  below would have measured that server instead of this code.")
            return 1
        print(f"  server             : up on {BASE} (pid {proc.pid}),"
              " declaring /auth/shop-code")

        with httpx.Client(timeout=15.0) as client:
            # ---------------------------------------------------------- P1
            banner("P1 - a code that exists resolves, and carries ONLY tenant_id")
            r1 = client.post(f"{BASE}/auth/shop-code",
                             json={"code": FIXTURE_CODE})
            print(f"  status={r1.status_code} body={r1.text.strip()[:200]}")
            check(r1.status_code == 200, "P1: status is 200")
            b1 = r1.json() if r1.headers.get("content-type", "").startswith(
                "application/json") else {}
            check(b1.get("tenant_id") == str(TENANT_A_ID),
                  f"P1: tenant_id is tenant A ({b1.get('tenant_id')})")
            # ABSENCE, asserted field by field. A presence-only check would pass
            # against a response that also leaked a shop's name.
            check(set(b1.keys()) == {"tenant_id"},
                  f"P1: the body carries EXACTLY {{'tenant_id'}}, got {sorted(b1)}")
            for leaked in ("name", "shop_name", "code", "created_at",
                           "is_active", "id"):
                check(leaked not in b1, f"P1: '{leaked}' is ABSENT from the body")

            # ---------------------------------------------------------- P2
            banner("P2 - a well-formed code that does not exist is refused")
            r2 = client.post(f"{BASE}/auth/shop-code",
                             json={"code": ABSENT_CODE})
            print(f"  status={r2.status_code} body={r2.text.strip()[:200]}")
            check(r2.status_code == 404, "P2: status is 404")
            # PINNED TO THIS HANDLER'S OWN REFUSAL, not merely to the status.
            # A stale server 404s an unknown ROUTE with {"detail":"Not Found"},
            # and a status-only assertion passes against it -- the right number
            # for the wrong reason. Measured: that is exactly what happened on
            # this proof's first run.
            check(r2.json().get("detail") == "unknown shop code",
                  f"P2: the body is THIS endpoint's refusal, not a routing 404 "
                  f"({r2.json().get('detail')!r})")
            check("tenant_id" not in r2.text,
                  "P2: the refusal body carries no tenant_id")

            # ---------------------------------------------------------- P3
            banner("P3 - a malformed code is refused INDISTINGUISHABLY from P2")
            r3 = client.post(f"{BASE}/auth/shop-code",
                             json={"code": MALFORMED_CODE})
            print(f"  status={r3.status_code} body={r3.text.strip()[:200]}")
            check(r3.status_code == r2.status_code,
                  f"P3: status equals P2's ({r3.status_code} == {r2.status_code})")
            check(r3.text == r2.text,
                  "P3: the FULL BODY is byte-identical to P2's"
                  f" ({r3.text.strip()[:60]!r} vs {r2.text.strip()[:60]!r})")

            # ---------------------------------------------------------- P4
            banner("P4 - the read went through the DIRECTORY role")
            # Nothing new is issued here: P4 is the conjunction of the fixture
            # facts above and P1. Stated as its own assertion so that a reader
            # sees the argument rather than reconstructing it.
            check(r1.status_code == 200 and app_rows == 0,
                  "P4: the endpoint resolved a code that does NOT exist in the "
                  "app engine's database, so the app engine cannot have answered")
            check(bool(refusal),
                  "P4: and the app ROLE is refused on that relation anyway, so "
                  "neither the database nor the privilege would have allowed it")

            # ---------------------------------------------------------- P5
            banner("P5 - CONTROL: the login endpoint is unchanged")
            ok = client.post(f"{BASE}/auth/login", json={
                "tenant_id": str(TENANT_A_ID), "username": ADMIN_USERNAME,
                "password": TENANT_A_PASSWORD})
            print(f"  valid login   status={ok.status_code}")
            check(ok.status_code == 200, "P5: a valid login still returns 200")
            check("access_token" in ok.json(), "P5: it still carries a token")

            bad_pw = client.post(f"{BASE}/auth/login", json={
                "tenant_id": str(TENANT_A_ID), "username": ADMIN_USERNAME,
                "password": "definitely-not-the-password"})
            no_user = client.post(f"{BASE}/auth/login", json={
                "tenant_id": str(TENANT_A_ID), "username": "no-such-user-here",
                "password": TENANT_A_PASSWORD})
            print(f"  wrong password status={bad_pw.status_code} "
                  f"body={bad_pw.text.strip()[:80]}")
            print(f"  unknown user   status={no_user.status_code} "
                  f"body={no_user.text.strip()[:80]}")
            check(bad_pw.status_code == 401, "P5: a wrong password is still 401")
            check(no_user.status_code == 401, "P5: an unknown user is still 401")
            check(bad_pw.text == no_user.text,
                  "P5: login's two refusals are still byte-identical to each "
                  "other -- its collapse is unchanged")
            check("access_token" not in bad_pw.text,
                  "P5: the refused login body carries NO access_token")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()

    banner("SUMMARY")
    if failures:
        for f in failures:
            print(f"  FAILED: {f}")
    print(f"  failures: {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    rc = main()
    print(f"PROVE_SHOP_CODE_EXIT={rc}")
    sys.exit(rc)
