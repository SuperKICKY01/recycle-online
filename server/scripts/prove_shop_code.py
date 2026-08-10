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
import json
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


class ResolvedTenant(str):
    """A tenant identifier PARSED OUT OF A RESOLVE RESPONSE, never typed.

    THIS TYPE IS THE ONLY THING THAT CAN TELL A CHAIN FROM A COINCIDENCE, and it
    exists because no assertion over VALUES can. A hardcoded correct identifier
    and one carried from A1's response are the same 36 bytes; every equality
    check, every `/whoami` cross-check and every status code agrees with both.
    Measured, not reasoned: replacing A2's input with the literal uuid leaves all
    five criteria GREEN.

    So provenance is carried by the TYPE rather than checked by the value. A1
    wraps what it parsed; A2 refuses anything that is not that wrapper; a literal
    is a plain `str` and fails before a request is sent.

    ITS LIMIT, STATED RATHER THAN DISCOVERED: this proves the value FLOWED
    through this process. It cannot stop an author who writes
    `ResolvedTenant("1111-...")` by hand. It catches the lazy break and the
    accidental one, which is what a regression looks like; it is not a defence
    against someone determined to fake the chain.
    """

    __slots__ = ()


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

            # ============================================================
            # CRITERION A, ROADMAP.md P1.3. The CHAIN is the point: A2 must
            # CONSUME A1's response. Two requests fired independently and
            # reconciled afterwards demonstrate two facts that happen to
            # agree, which is not the same claim.
            # ============================================================
            banner("A1 - POST the shop code, receive a tenant identifier")
            req1 = {"code": FIXTURE_CODE}
            r1 = client.post(f"{BASE}/auth/shop-code", json=req1)
            print(f"  REQUEST   POST {BASE}/auth/shop-code")
            print(f"            {json.dumps(req1)}")
            print(f"  RESPONSE  {r1.status_code} {r1.text.strip()}")
            check(r1.status_code == 200, "A1: the code resolves, 200")
            resolved = None
            if r1.status_code == 200:
                resolved = ResolvedTenant(r1.json()["tenant_id"])
            check(resolved is not None,
                  "A1: a tenant identifier was parsed out of the response")

            banner("A2 - log in with the identifier TAKEN FROM A1's RESPONSE")
            # THE REQUEST BODY CARRIES THE PARSED OBJECT ITSELF, not a copy of
            # its text. ResolvedTenant subclasses str, so httpx serialises it as
            # a plain JSON string -- the wire is unchanged and only the local
            # object keeps its provenance.
            req2 = {"tenant_id": resolved, "username": ADMIN_USERNAME,
                    "password": TENANT_A_PASSWORD}
            # THE PROVENANCE GATE, and MEASURED 2026-08-10 to be the only cell
            # that can detect a broken chain. With A2 hardcoded to the correct
            # literal and this check removed, ALL assertions passed and the run
            # exited 0 -- including A3's "the chain closes" cross-check, because
            # a correct hardcode and a chained value are the same 36 bytes. It
            # asserts on the object IN THE REQUEST BODY, never on `resolved`:
            # checking `resolved` would pass while a literal sat in req2 beside
            # it, which is exactly the break this exists to catch.
            check(isinstance(req2["tenant_id"], ResolvedTenant),
                  "A2: the identifier IN THE REQUEST BODY is the OBJECT PARSED "
                  "FROM A1, not a literal (checked by TYPE, because a correct "
                  "literal is byte-identical to a chained value)")
            shown2 = dict(req2)
            shown2["password"] = "<REDACTED - a real password WAS sent>"
            print(f"  REQUEST   POST {BASE}/auth/login")
            print(f"            {json.dumps(shown2)}")
            print("            (the password is REDACTED in this record, not "
                  "omitted from the request)")
            r2 = client.post(f"{BASE}/auth/login", json=req2)
            token = r2.json().get("access_token") if r2.status_code == 200 else None
            shown2r = dict(r2.json()) if r2.headers.get(
                "content-type", "").startswith("application/json") else {}
            if "access_token" in shown2r:
                shown2r["access_token"] = (
                    f"<REDACTED bearer token, {len(shown2r['access_token'])} chars>")
            print(f"  RESPONSE  {r2.status_code} {json.dumps(shown2r)}")
            print("            (the token is REDACTED in this record for the same "
                  "reason as the password: it is a credential, and this output is "
                  "read in transcripts. Its LENGTH and the field's presence are "
                  "recorded so the response shape is still checkable.)")
            check(r2.status_code == 200, "A2: login with the resolved id returns 200")
            check(bool(token), "A2: a bearer token came back")

            banner("A3 - USE the token against an endpoint requiring authentication")
            print("  endpoint  : GET /whoami")
            print("  why       : it depends on get_principal, which verifies the "
                  "JWT signature, re-reads the user row and compares "
                  "token_version -- a 200 here is not producible without a valid "
                  "token. It also echoes the tenant the SERVER resolved, which "
                  "closes the chain end to end.")
            r3 = client.get(f"{BASE}/whoami",
                            headers={"Authorization": f"Bearer {token}"})
            print(f"  RESPONSE  {r3.status_code} {r3.text.strip()[:300]}")
            check(r3.status_code == 200, "A3: the token is ACCEPTED, 200")
            check(r3.json().get("tenant_id") == str(resolved),
                  "A3: the tenant /whoami reports is the one A1 resolved -- the "
                  "chain closes")

            banner("A4 - CONTROL, refusing side: a code that does not exist")
            r4 = client.post(f"{BASE}/auth/shop-code", json={"code": ABSENT_CODE})
            print(f"  RESPONSE  {r4.status_code} {r4.text.strip()}")
            check(r4.status_code == 404, "A4: an absent code returns 404")
            check(r4.json().get("detail") == "unknown shop code",
                  "A4: and it is THIS endpoint's refusal, not a routing 404")

            banner("A5 - CONTROL, authentication side: no token, and a bad token")
            r5a = client.get(f"{BASE}/whoami")
            bad_token = ("A" if token[0] != "A" else "B") + token[1:]
            r5b = client.get(f"{BASE}/whoami",
                             headers={"Authorization": f"Bearer {bad_token}"})
            print(f"  no token       {r5a.status_code} {r5a.text.strip()[:160]}")
            print(f"  invalid token  {r5b.status_code} {r5b.text.strip()[:160]}")
            check(r5a.status_code == 401, "A5: /whoami with NO token is refused 401")
            check(r5b.status_code == 401,
                  "A5: /whoami with an INVALID token is refused 401")
            differ = (r5a.status_code, r5a.text) != (r5b.status_code, r5b.text)
            # AN OBSERVATION, PRINTED -- deliberately NOT a check(). Whether the
            # two refusals differ is a fact to record, not a bar to clear: this
            # phase was asked to report it, and auth.py collapsing them is a
            # design choice rather than a requirement. A check() here could only
            # have been check(True, ...), which is a cell that can never go red
            # sitting in a column of [ok] marks, and reads as an assertion to
            # anyone scanning it.
            print(f"  the two refusals DIFFER: {differ}")
            print("  (recorded as an OBSERVATION, not asserted -- see the note "
                  "in the source)")

            print("\n  A POSITIVE WITH NO PAIRED NEGATIVE IN THE SAME RUN IS NOT")
            print("  READABLE. A3's 200 means something only because A5 shows the")
            print("  same endpoint refusing without a token and with a broken one,")
            print("  in this process, against this server.")
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
