"""Prove POST /users over REAL HTTP: an admin creates an account that works.

    python scripts/prove_user_create.py --database recycle_restore_scratch

REFUSES TO RUN AGAINST THE LIVE DATABASE, and the refusal is the point: this
script CREATES USER ROWS, and there is no delete path for a user anywhere in this
system (users.py, "NOTHING HERE DELETES ANYTHING"). A row it writes is a row that
stays. The live name is read from configuration rather than hardcoded, because
"recycle" is a deployment's choice and a hardcoded name stops guarding the day it
changes -- scripts/provision_shop.py's argument, unchanged. The refusal itself is
prove_docno_clock.py's, by way of prove_shop_code.py, which is also where the
"start your own uvicorn with the database overridden IN THE CHILD'S ENVIRONMENT"
shape comes from: a dict, never a command line, because every shell command on
this box lands verbatim in .claude/hooks/*.log and these URLs carry passwords.

WHAT IT LEAVES BEHIND: five user rows per run in tenant A of the scratch database
and one in tenant B, every username carrying a per-run tag. They cannot be
removed and they are not meant to be -- that is what makes the database a
throwaway rather than dev.

IDENTITY BEFORE ANY WRITE, AND IT IS A GATE RATHER THAN A CELL
---------------------------------------------------------------
lessons/a-proof-must-establish-what-it-is-talking-to.md: liveness is not
identity. A stale server answering on this port would take every create below and
write it into WHATEVER DATABASE IT IS ON, and finding that out afterwards is an
autopsy -- CLAUDE.md's workflow rule about a write that cannot be undone says the
measurement has to come first or it is only that.

So before the first create: log in as the seeded admin and as the seeded staff,
and require each token's `sub` and `token_version` claims to equal the values
read DIRECTLY out of the database this script named. token_version is the
discriminator that no shape can fake -- it is a per-row counter of how many times
that row's sessions have been revoked, it differs between two databases that have
seen different runs, and /auth/login mints it into the token while the API
publishes it nowhere else. ITS BOUND: two databases holding the same id AND the
same version for BOTH users would be indistinguishable by it. Two coincidences,
not one, and the numbers are printed so a reader can see them.

If that gate does not hold the script exits 2 -- could-not-run -- having created
nothing.

WHY IT DOES NOT DISCOVER USER IDS BY LOGGING IN AS EACH USER
-------------------------------------------------------------
prove_revocation.py has to: it needs a colleague's uuid and, until GET /users
existed, no response in this API produced one, so it logs in as each user and
asks /whoami. Its own docstring records that this is "structurally unavailable to
the product's actual user, because a shop owner dismissing an employee does not
hold that employee's password" -- the proof had a route to an id that the yard
did not.

THIS ROUTE HANDS THE ID TO THE ADMIN IN ITS OWN 201, which is exactly what the
yard has and what that proof recorded it could not get. So every id below comes
from the create response or from the roster, and the only passwords this script
sends for a created account are ones it set itself one request earlier. Nothing
here is left as forgotten -- it is the capability that removed the need.

TWICE IN A ROW, NO RESEED (lessons/proof-must-run-twice.md): every username
carries a per-run uuid tag, so run 2 collides with nothing run 1 left behind, and
nothing is normalised as setup -- the script creates everything it measures.

IT ALSO CARRIES THE VALIDATION HANDLER'S PROOF, and that is deliberate rather
than tidy. The defect was found here (P6 printed `the 422 body ECHOES the
rejected password: True` as an observation and asserted nothing), the lesson
written from here, and the fix is API-wide — so the cells that measure it belong
in the file whose own gap they close. P6/H4 asserts the password case on this
route; H1-H3 ask the question this route cannot answer about itself, namely
whether the value is removed because it was a PASSWORD or removed from every
validation error the API emits. H3 leaves this module entirely and refuses a
`POST /uoms` with an empty code, because a handler that pleased POST /users and
left every other route echoing would be invisible to P1-P8.

NO USERNAME OR FULL NAME BELOW MAY CONTAIN THE TEXT "token_version" OR
"password_hash". prove_revocation.py CASE 6b asserts those two strings are absent
from the WHOLE roster body, on the raw bytes, and a user whose name carried one
would redden that proof from the fixture side. The same rule applies to the
byte-level cells in P1 here.

THE EXIT LINE, AND WHAT SUPPRESSES IT. main() prints PROVE_USER_CREATE_EXIT=<n>
from the same integer it returns. That line is ABSENT if the script dies before
the summary -- uvicorn failing to start, a database unreachable, an unhandled
exception. THE ABSENCE IS THE SIGNAL: a reader scanning for a number and finding
none has NOT found a pass.

NOTHING PRINTS A PASSWORD OR A DSN, on any path.
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
import uuid

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SERVER_DIR)

from dotenv import load_dotenv  # noqa: E402

# load_dotenv resolves .env from the CALLING FILE, not the cwd
# (lessons/config-defaults-must-fail-closed.md), so this finds server/.env
# whichever directory the script was invoked from.
load_dotenv()

import httpx  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

BASE = ""  # set in main(), once the port is known

# Per-run tag. Every username this script writes carries it.
RUN = uuid.uuid4().hex[:8]

STAFF_NEW = f"p1-yard-{RUN}"
ADMIN_NEW = f"p3-office-{RUN}"
DENIED_NEW = f"p4-refused-{RUN}"
SHORT_NEW = f"p6-shortpw-{RUN}"
CROSS_NEW = f"p7-crossed-{RUN}"

# Set by this script, sent to this server, never printed. Length 8+ is what the
# route requires; SHORT_PW is one character under it on purpose.
NEW_PW = f"yard-pass-{RUN}"
SHORT_PW = "abc1234"

failures: list[str] = []
# A COUNT the reader must meet. A proof that fails by running FEWER cells is
# indistinguishable from one that passed, which is this repository's oldest
# failure shape, and "failures: 0" cannot tell the two apart on its own.
passes: list[str] = []


def banner(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def check(cond: bool, claim: str) -> None:
    """`claim` is what must be TRUE, printed either way, so the tag and the
    sentence can never disagree with each other."""
    print(f"  [{'OK  ' if cond else 'FAIL'}] {claim}")
    (passes if cond else failures).append(claim)


def body_of(r: httpx.Response) -> dict:
    try:
        b = r.json()
        return b if isinstance(b, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def detail_of(r: httpx.Response) -> dict:
    d = body_of(r).get("detail")
    return d if isinstance(d, dict) else {}


def shown(body: dict) -> str:
    """A body as one ASCII line. ensure_ascii because this box is codepage 874
    and a Thai refusal message rendered through the console is an artefact, not
    an observation (lessons/console-is-not-the-observation.md)."""
    return json.dumps(body, ensure_ascii=True, sort_keys=True)


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def claims_of(token: str) -> dict:
    """A token's payload, read WITHOUT verifying it.

    Inspecting an artifact the server just handed us, the way the mobile client
    reads its own `role` claim. Never used to decide whether a request should
    have succeeded -- only, in the gate, to ask the responder to name the row it
    read.
    """
    import base64

    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return json.loads(base64.urlsafe_b64decode(payload))


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
def login_raw(client: httpx.Client, tenant_id, username: str,
              password: str) -> httpx.Response:
    """The whole response, because two cells assert on what is NOT in the body."""
    return client.post(
        f"{BASE}/auth/login",
        json={"tenant_id": str(tenant_id), "username": username,
              "password": password},
    )


def login(client: httpx.Client, tenant_id, username: str,
          password: str) -> str | None:
    r = login_raw(client, tenant_id, username, password)
    return body_of(r).get("access_token") if r.status_code == 200 else None


def create_user(client: httpx.Client, token: str, username: str, full_name: str,
                role: str, password: str, **extra) -> httpx.Response:
    """POST /users. `extra` exists for P7, which sends a field the model forbids."""
    payload = {"username": username, "full_name": full_name, "role": role,
               "password": password, **extra}
    return client.post(f"{BASE}/users", headers=auth(token), json=payload)


def list_users(client: httpx.Client, token: str,
               include_inactive: bool = True) -> httpx.Response:
    query = "?include_inactive=true" if include_inactive else ""
    return client.get(f"{BASE}/users{query}", headers=auth(token))


def roster(client: httpx.Client, token: str) -> list[dict]:
    r = list_users(client, token)
    users = body_of(r).get("users")
    return users if isinstance(users, list) else []


def named(rows: list[dict], username: str) -> dict | None:
    return next((u for u in rows if u.get("username") == username), None)


# ---------------------------------------------------------------------------
# Reads straight out of the scratch database, for the identity gate and for the
# no-write counts. tenant_connection is the application's OWN primitive: the SET
# LOCAL convention lives there (server/app/db.py) and
# lessons/a-checker-must-not-share-the-code-it-checks.md forbids a second copy of
# a convention. `users` carries FORCE RLS, so a read with no context returns zero
# rows for every role -- that is not a hypothetical, provision_shop.py was
# already bitten by it on `tenants`.
# ---------------------------------------------------------------------------
async def _db_users(tenant_id) -> list[dict]:
    from app.db import engine, tenant_connection

    try:
        async with tenant_connection(tenant_id) as conn:
            rows = (
                await conn.execute(
                    text("SELECT id, username, role, is_active, token_version"
                         " FROM users ORDER BY username")
                )
            ).mappings().all()
        return [dict(r) for r in rows]
    finally:
        await engine.dispose()


def db_users(tenant_id) -> list[dict]:
    return asyncio.run(_db_users(tenant_id))


# ---------------------------------------------------------------------------
# The server
# ---------------------------------------------------------------------------
def wait_for_health(proc: subprocess.Popen, timeout_s: float = 45.0) -> str:
    """Wait for OUR child to serve /health. "" on success, else why not.

    Takes the child so a DEAD child fails immediately rather than being waited
    out for the full timeout and then blamed on the clock.
    """
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            return f"the uvicorn child exited with code {proc.returncode}"
        try:
            if httpx.get(f"{BASE}/health", timeout=2.0).status_code == 200:
                return ""
        except Exception:  # noqa: BLE001 - not up yet
            pass
        time.sleep(0.4)
    return f"no 200 from {BASE}/health within {timeout_s:.0f}s"


def declares_post_users() -> str:
    """Prove the server answering declares the ROUTE UNDER TEST, not just /users.

    GET /users has existed since 2026-08-07, so asking whether the path is
    declared would be satisfied by every server this repo has run for days. The
    METHOD is what this commit adds, and it is what a stale server on a colliding
    port would not have.
    """
    try:
        r = httpx.get(f"{BASE}/openapi.json", timeout=5.0)
    except Exception as exc:  # noqa: BLE001
        return f"could not read /openapi.json ({exc})"
    if r.status_code != 200:
        return f"/openapi.json returned {r.status_code}"
    methods = r.json().get("paths", {}).get("/users", {})
    if "post" not in methods:
        return ("the server on this port declares /users with"
                f" {sorted(methods) or 'nothing'} and no POST -- it is not"
                " running the code under test")
    return ""


def main() -> int:  # noqa: C901
    ap = argparse.ArgumentParser(
        description="Prove POST /users: an admin creates an account that works.")
    ap.add_argument("--database", required=True,
                    help="a SCRATCH database. This script CREATES USER ROWS and "
                         "nothing in this system can delete one.")
    args = ap.parse_args()

    live = make_url(os.environ["APP_DATABASE_URL"])
    if args.database == live.database:
        print(f"REFUSED: --database {args.database!r} is the LIVE database.\n"
              "  This script creates user rows through the real endpoint, and\n"
              "  there is NO delete path for a user anywhere in this system --\n"
              "  every account it invents would stay in that shop's roster for\n"
              "  good, with a password only this script ever knew.\n"
              "  Restore a copy and point it there:\n"
              "    python scripts/backup_db.py\n"
              "    python scripts/restore_db.py <dir> --into recycle_users_scratch")
        return 2

    scratch_url = live.set(database=args.database).render_as_string(
        hide_password=False)
    # The PARENT's own reads go to the scratch database too. Overriding
    # APP_DATABASE_URL before app.db is imported is prove_docno_clock.py's move
    # and provision_shop.py's, for the reason both give.
    os.environ["APP_DATABASE_URL"] = scratch_url

    from app.seeddata import (  # noqa: E402
        ADMIN_USERNAME,
        STAFF_USERNAME,
        TENANT_A_ID,
        TENANT_A_PASSWORD,
        TENANT_A_STAFF_PASSWORD,
        TENANT_B_ID,
        TENANT_B_PASSWORD,
    )

    print("=== prove_user_create ===")
    print(f"  database   : {args.database} (live {live.database!r} is not touched)")
    print(f"  run tag    : {RUN}")
    print(f"  usernames  : {STAFF_NEW}, {ADMIN_NEW}, {DENIED_NEW},"
          f" {SHORT_NEW}, {CROSS_NEW}")
    print("  passwords  : set by this run, sent to this server, never printed")

    # ---------------------------------------------------------------- server
    env = dict(os.environ)
    env["APP_DATABASE_URL"] = scratch_url
    env["PYTHONUNBUFFERED"] = "1"

    port = free_port()
    global BASE
    BASE = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(  # noqa: SIM115 - closed in finally
        prefix="prove_user_create_uvicorn_", suffix=".log", delete=False, mode="w+")
    proc = subprocess.Popen(
        [sys.executable, "-u", "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=SERVER_DIR, env=env, stdout=log, stderr=subprocess.STDOUT)
    try:
        why = wait_for_health(proc)
        if why:
            log.flush()
            with open(log.name, encoding="utf-8", errors="replace") as fh:
                tail = fh.read().replace("\r\n", "\n")[-2000:]
            print(f"SERVER DID NOT START: {why}\nuvicorn output:\n{tail}")
            return 2
        wrong = declares_post_users()
        if wrong:
            print(f"WRONG SERVER: {wrong}\n"
                  f"  Something else is answering on {BASE}. Every assertion\n"
                  "  below would have measured that server instead of this code.")
            return 2
        print(f"  server     : up on {BASE} (pid {proc.pid}), declaring POST /users")

        with httpx.Client(timeout=30.0) as client:
            # ==============================================================
            banner("GATE - the server answering is reading THIS database")
            # ==============================================================
            db_a = db_users(TENANT_A_ID)
            db_admin = named(db_a, ADMIN_USERNAME)
            db_staff = named(db_a, STAFF_USERNAME)
            if db_admin is None or db_staff is None:
                print("  the scratch database has no seeded admin/staff in tenant A"
                      " -- cannot establish identity, and nothing was created")
                return 2
            print(f"  from the DATABASE  admin  id={db_admin['id']}"
                  f"  token_version={db_admin['token_version']}")
            print(f"  from the DATABASE  staff  id={db_staff['id']}"
                  f"  token_version={db_staff['token_version']}")

            admin_token = login(client, TENANT_A_ID, ADMIN_USERNAME,
                                TENANT_A_PASSWORD)
            staff_token = login(client, TENANT_A_ID, STAFF_USERNAME,
                                TENANT_A_STAFF_PASSWORD)
            b_admin_token = login(client, TENANT_B_ID, ADMIN_USERNAME,
                                  TENANT_B_PASSWORD)
            if not (admin_token and staff_token and b_admin_token):
                print("  could not log in as the seeded users"
                      f" (adminA={bool(admin_token)} staffA={bool(staff_token)}"
                      f" adminB={bool(b_admin_token)}).")
                print("  If tenant A's staff is LOCKED, a previous"
                      " prove_revocation.py run died between its CASE 7 and"
                      " CASE 8; unlock it and re-run.")
                return 2
            ac, sc = claims_of(admin_token), claims_of(staff_token)
            print(f"  from the TOKEN     admin  sub={ac.get('sub')}"
                  f"  token_version={ac.get('token_version')}")
            print(f"  from the TOKEN     staff  sub={sc.get('sub')}"
                  f"  token_version={sc.get('token_version')}")

            identity = (
                ac.get("sub") == str(db_admin["id"])
                and ac.get("token_version") == db_admin["token_version"]
                and sc.get("sub") == str(db_staff["id"])
                and sc.get("token_version") == db_staff["token_version"]
                and ac.get("tenant_id") == str(TENANT_A_ID)
            )
            check(identity,
                  "gate: the tokens this server mints carry the ids AND the"
                  " token_versions this script read out of the named database"
                  " -- so the server is reading that database and not another")
            if not identity:
                print("  REFUSING to create anything: identity is not established.")
                return 2

            before = roster(client, admin_token)
            print(f"  tenant A roster before this run: {len(before)} entries")

            # ==============================================================
            banner("P1 - an admin creates a staff account")
            # ==============================================================
            r1 = create_user(client, admin_token, STAFF_NEW,
                             "Yard staff created by P1", "staff", NEW_PW)
            b1 = body_of(r1)
            print(f"  POST /users  status={r1.status_code}  body={shown(b1)}")
            check(r1.status_code == 201, "p1: the create answers 201")

            EXPECTED = {"user_id", "username", "full_name", "role", "is_active"}
            # THE PRESENCE SIBLING for every absence below. An absence assertion
            # over an empty or defaulted body is true of everything
            # (lessons/a-check-that-never-went-red-was-never-observed.md, ninth
            # mechanism), so the exact key SET is asserted first.
            check(set(b1) == EXPECTED,
                  f"p1: the body carries EXACTLY {sorted(EXPECTED)},"
                  f" got {sorted(b1)}")
            for withheld in ("password", "password_hash", "token_version",
                             "created_at", "tenant_id", "id"):
                check(withheld not in b1,
                      f"p1: '{withheld}' is ABSENT from the create response")
            # ON THE RAW BYTES as well. A key absent from a dict says nothing
            # about the same string sitting elsewhere in the body, and bytes need
            # no codec to be believed.
            check(b"password_hash" not in r1.content,
                  "p1: the response body carries no password_hash ANYWHERE")
            check(b"token_version" not in r1.content,
                  "p1: the response body carries no token_version ANYWHERE")
            check(NEW_PW.encode() not in r1.content,
                  "p1: the response does not echo the password ANYWHERE"
                  " (checked on the bytes; the password itself is not printed)")

            check(b1.get("username") == STAFF_NEW,
                  "p1: the response names the username that was asked for")
            check(b1.get("full_name") == "Yard staff created by P1",
                  "p1: the response carries the full name that was asked for")
            check(b1.get("role") == "staff",
                  f"p1: the response says role=staff (got {b1.get('role')!r})")
            check(b1.get("is_active") is True,
                  "p1: the new account is active")
            new_staff_id = b1.get("user_id")
            try:
                uuid.UUID(str(new_staff_id))
                parsed = True
            except (TypeError, ValueError):
                parsed = False
            check(parsed, f"p1: user_id is a uuid ({new_staff_id})")

            after_p1 = roster(client, admin_token)
            check(len(after_p1) == len(before) + 1,
                  f"p1: the roster grew by exactly one ({len(before)} ->"
                  f" {len(after_p1)}) -- and this is the CONTROL that makes the"
                  " unchanged counts in P4 and P6 mean anything")

            # ==============================================================
            banner("P2 - THE LOOP CLOSES: sign in as what was just created")
            # ==============================================================
            r2 = login_raw(client, TENANT_A_ID, STAFF_NEW, NEW_PW)
            tok2 = body_of(r2).get("access_token") if r2.status_code == 200 else None
            print(f"  POST /auth/login as {STAFF_NEW}  status={r2.status_code}"
                  f"  token={'<REDACTED, %d chars>' % len(tok2) if tok2 else None}")
            check(r2.status_code == 200,
                  "p2: the account created one request ago can SIGN IN")
            check(bool(tok2), "p2: the login returns a bearer token")
            if not tok2:
                print("  cannot continue P2 without a token")
            else:
                r2b = client.get(f"{BASE}/whoami", headers=auth(tok2))
                w = body_of(r2b)
                print(f"  GET /whoami  status={r2b.status_code}  body={shown(w)}")
                check(r2b.status_code == 200,
                      "p2: that token reaches an endpoint requiring"
                      " authentication (/whoami, 200)")
                check(w.get("user_id") == new_staff_id,
                      "p2: the session /whoami reports IS the user the create"
                      " returned -- the row created and the row signed in as are"
                      " one row")
                check(w.get("role") == "staff",
                      "p2: the role the SERVER resolved from the row is staff")
                check(w.get("tenant_id") == str(TENANT_A_ID),
                      "p2: the session is in the creating admin's own tenant")
                check(w.get("user_visible_under_tenant") is True,
                      "p2: the new row is visible under that tenant context")

            # THE PAIRED NEGATIVE, in the same run, on the same endpoint. Without
            # it "the login succeeded" is satisfiable by a server that admits
            # anybody, and every cell above would still hold.
            r2c = login_raw(client, TENANT_A_ID, STAFF_NEW, NEW_PW + "-wrong")
            print(f"  the same username with a WRONG password"
                  f"  status={r2c.status_code}")
            check(r2c.status_code == 401,
                  "p2 CONTROL: the same username with a wrong password is refused")
            check("access_token" not in r2c.text,
                  "p2 CONTROL: the refused login carries NO access_token")

            # ==============================================================
            banner("P3 - the role is what was ASKED FOR, read back from the roster")
            # ==============================================================
            # TWO ROLES IN ONE RUN, ON PURPOSE. A route that hardcoded either
            # value would satisfy a single-role check
            # (lessons/a-differential-control-is-only-as-good-as-its-weaker-
            # side.md): both sides have to be asked for, and they have to differ.
            r3 = create_user(client, admin_token, ADMIN_NEW,
                             "Second admin created by P3", "admin", NEW_PW)
            b3 = body_of(r3)
            print(f"  POST /users role=admin  status={r3.status_code}"
                  f"  body={shown(b3)}")
            check(r3.status_code == 201,
                  "p3: an admin MAY create another admin (201) -- the recovery"
                  " case the route's docstring argues for")
            check(b3.get("role") == "admin",
                  f"p3: the response says role=admin (got {b3.get('role')!r})")
            new_admin_id = b3.get("user_id")

            rows = roster(client, admin_token)
            listed_staff = named(rows, STAFF_NEW)
            listed_admin = named(rows, ADMIN_NEW)
            print(f"  roster entry for {STAFF_NEW}: {shown(listed_staff or {})}")
            print(f"  roster entry for {ADMIN_NEW}: {shown(listed_admin or {})}")
            check(listed_staff is not None and listed_admin is not None,
                  "p3: both created accounts appear on the roster")
            if listed_staff and listed_admin:
                check(listed_staff.get("role") == "staff",
                      "p3: the roster reports role=staff for the account created"
                      " as staff")
                check(listed_admin.get("role") == "admin",
                      "p3: the roster reports role=admin for the account created"
                      " as admin")
                check(listed_staff.get("role") != listed_admin.get("role"),
                      "p3: the two roles DIFFER -- so neither cell is satisfied"
                      " by a route that writes a constant")
                check(listed_staff.get("user_id") == new_staff_id
                      and listed_admin.get("user_id") == new_admin_id,
                      "p3: the ids on the roster are the ids the creates"
                      " returned")

            # THE ROLE FUNCTIONALLY, NOT JUST AS A STRING IN A LIST. A route that
            # wrote 'staff' while reporting 'admin' would pass every cell above.
            tok_admin_new = login(client, TENANT_A_ID, ADMIN_NEW, NEW_PW)
            check(bool(tok_admin_new),
                  "p3: the created admin can sign in")
            if tok_admin_new:
                r3b = list_users(client, tok_admin_new)
                print(f"  GET /users as the CREATED admin  status={r3b.status_code}")
                check(r3b.status_code == 200,
                      "p3: the created ADMIN passes an admin-only gate (200 on"
                      " GET /users) -- the role landed in the row the gate reads")
            if tok2:
                r3c = list_users(client, tok2)
                print(f"  GET /users as the CREATED staff  status={r3c.status_code}"
                      f"  code={detail_of(r3c).get('code')!r}")
                check(r3c.status_code == 403
                      and detail_of(r3c).get("code") == "admin_required",
                      "p3: the created STAFF is refused that same gate (403"
                      " admin_required) -- the pair is what makes 'role' mean"
                      " something")

            # ==============================================================
            banner("P4 - CONTROL: a STAFF caller may not create an account")
            # ==============================================================
            before_p4 = roster(client, admin_token)
            r4 = create_user(client, staff_token, DENIED_NEW,
                             "Refused by P4", "staff", NEW_PW)
            print(f"  POST /users as tenant A STAFF  status={r4.status_code}"
                  f"  body={shown(body_of(r4))}")
            # THE SAME THREE CELLS prove_revocation.py asserts for the bump
            # endpoint (CASE 6) and for the roster (CASE 6b). One require_admin
            # answers for every admin path, so the refusal must be the same one.
            check(r4.status_code == 403,
                  "p4: a STAFF caller is refused with 403")
            check(detail_of(r4).get("kind") == "forbidden",
                  "p4: the refusal carries kind=forbidden")
            check(detail_of(r4).get("code") == "admin_required",
                  "p4: the refusal carries code=admin_required")
            after_p4 = roster(client, admin_token)
            check(len(after_p4) == len(before_p4),
                  f"p4: the roster is unchanged ({len(before_p4)} ->"
                  f" {len(after_p4)})")
            check(named(after_p4, DENIED_NEW) is None,
                  "p4: the refused username exists nowhere on the roster")

            # ==============================================================
            banner("P5 - CONTROL: a duplicate username is refused, as a conflict")
            # ==============================================================
            before_p5 = roster(client, admin_token)
            r5 = create_user(client, admin_token, STAFF_NEW,
                             "A different person, same username", "staff",
                             NEW_PW + "-other")
            print(f"  POST /users, username already taken  status={r5.status_code}"
                  f"  body={shown(body_of(r5))}")
            check(r5.status_code == 409, "p5: a duplicate username is refused 409")
            # THE CODE STRING, not just the status: this is master.py's EXISTING
            # conflict shape, imported rather than restated, and the code is what
            # a client branches on.
            check(detail_of(r5).get("kind") == "conflict",
                  "p5: the refusal carries kind=conflict")
            check(detail_of(r5).get("code") == "duplicate_code",
                  "p5: the refusal carries code=duplicate_code -- master.py's"
                  " existing shape, not a second one")
            check(detail_of(r5).get("entity") == "user",
                  "p5: the refusal names entity=user")
            after_p5 = roster(client, admin_token)
            check(len(after_p5) == len(before_p5),
                  f"p5: nothing was written ({len(before_p5)} ->"
                  f" {len(after_p5)} entries)")
            check(len([u for u in after_p5 if u.get("username") == STAFF_NEW]) == 1,
                  "p5: exactly ONE account holds that username")

            # THE CONFLICT IS PER TENANT, AND THIS IS THE CONTROL THAT SAYS SO.
            # uq_users_tenant_username is (tenant_id, username), so another shop
            # taking the same username must SUCCEED. Without this cell, a route
            # that refused the username globally would be green above.
            r5b = create_user(client, b_admin_token, STAFF_NEW,
                              "Same username, other shop", "staff", NEW_PW)
            print(f"  POST /users, SAME username in tenant B"
                  f"  status={r5b.status_code}")
            check(r5b.status_code == 201,
                  "p5 CONTROL: another shop may take the SAME username (201) --"
                  " the conflict is per tenant, not global")

            # ==============================================================
            banner("P6 - CONTROL: a short password is refused BEFORE any write")
            # ==============================================================
            before_p6 = roster(client, admin_token)
            db_before_p6 = db_users(TENANT_A_ID)
            r6 = create_user(client, admin_token, SHORT_NEW,
                             "Refused by P6", "staff", SHORT_PW)
            print(f"  POST /users with a {len(SHORT_PW)}-character password"
                  f"  status={r6.status_code}")
            print(f"  body={r6.text.strip()[:200]}")
            check(r6.status_code == 422,
                  "p6: a password under the minimum is refused 422 (terminal,"
                  " never a 500 the client would read as unavailable)")
            check(b"password_hash" not in r6.content,
                  "p6: the refusal carries no password_hash")
            # H4. THIS WAS AN OBSERVATION AND IS NOW A CELL, and that change is
            # the whole point of the commit carrying it. It printed
            # `the 422 body ECHOES the rejected password: True` and asserted
            # NOTHING, because at the time no contract said a refusal body may
            # not carry the value it refused, and a cell asserting a decision
            # nobody had taken would have failed for being right too early. The
            # decision is taken: app/main.py::validation_error_handler removes
            # pydantic's `input` from every validation error this API emits.
            #
            # ON THE RAW BYTES, SEARCHING FOR THE VALUE ITSELF. Reading the
            # parsed body is not the test: a key absent from a dict says nothing
            # about the same string sitting elsewhere in the response.
            check(SHORT_PW.encode() not in r6.content,
                  "p6/H4: the 422 refusing a short password does NOT carry the"
                  " password anywhere in its bytes")
            # THE PRESENCE SIBLING, in the SAME response, through the SAME byte
            # search. Without it the absence above is satisfied by an empty body,
            # by a 500, or by a handler that returned nothing at all
            # (lessons/a-check-that-never-went-red-was-never-observed.md, ninth).
            check(b"password" in r6.content,
                  "p6/H4 CONTROL: the same byte search DOES find the field name"
                  " `password` in that body -- so the absence above is a working"
                  " search over a body that exists")
            after_p6 = roster(client, admin_token)
            db_after_p6 = db_users(TENANT_A_ID)
            # COUNTED ON BOTH SIDES, and in the DATABASE as well as through the
            # API: the response is exactly what must not be trusted here.
            check(len(after_p6) == len(before_p6),
                  f"p6: the roster count is unchanged ({len(before_p6)} ->"
                  f" {len(after_p6)})")
            check(len(db_after_p6) == len(db_before_p6),
                  f"p6: the DATABASE row count for this tenant is unchanged"
                  f" ({len(db_before_p6)} -> {len(db_after_p6)})")
            check(named(after_p6, SHORT_NEW) is None
                  and named(db_after_p6, SHORT_NEW) is None,
                  "p6: that username exists in neither the roster nor the table")

            # ==============================================================
            banner("P7 - CONTROL: an admin of one tenant cannot create in another")
            # ==============================================================
            print("  THE ATTEMPT CANNOT BE EXPRESSED THROUGH THIS ROUTE, and that")
            print("  is the finding rather than a gap in the test. POST /users")
            print("  takes no tenant field: the tenant it writes is the GUC the")
            print("  RLS policy itself reads, set from the caller's own token, so")
            print("  there is no argument on this route that could name tenant B.")
            print("  What CAN be measured is the three things below. What CANNOT")
            print("  be measured here is a route that ACCEPTED a tenant argument")
            print("  and scoped it wrongly -- no assertion can rule that out for")
            print("  an argument that does not exist, and inventing a weaker cell")
            print("  that looked like it had would be worse than saying so.")

            before_a = roster(client, admin_token)
            before_b = roster(client, b_admin_token)
            # (a) NAMING another tenant is REFUSED, not ignored. extra="forbid" is
            # what makes those two different outcomes, and they are
            # indistinguishable to a caller if the field is merely dropped.
            r7 = create_user(client, admin_token, CROSS_NEW,
                             "Attempted into tenant B", "staff", NEW_PW,
                             tenant_id=str(TENANT_B_ID))
            print(f"  POST /users carrying tenant_id=<tenant B>"
                  f"  status={r7.status_code}")
            print(f"  body={r7.text.strip()[:200]}")
            check(r7.status_code == 422,
                  "p7a: a request NAMING another tenant is REFUSED (422), not"
                  " silently ignored")
            after_a = roster(client, admin_token)
            after_b = roster(client, b_admin_token)
            check(named(after_a, CROSS_NEW) is None
                  and named(after_b, CROSS_NEW) is None,
                  "p7a: that username was created in NEITHER tenant")
            check(len(after_a) == len(before_a) and len(after_b) == len(before_b),
                  f"p7a: neither roster changed (A {len(before_a)} ->"
                  f" {len(after_a)}, B {len(before_b)} -> {len(after_b)})")

            # (b) where the row DID land: present in A, absent from B, with the
            # presence sibling that stops an empty B roster satisfying it.
            #
            # AND THE SHARPEST PEER AVAILABLE IS ALREADY THERE: P5's control
            # created a tenant B account with the SAME USERNAME, so this is not
            # "a name absent from another list" -- the name IS on that list, on a
            # different row, and the assertion is on the ID. A route that resolved
            # a user by username rather than by tenant context is exactly what
            # that catches.
            b_ids = {u.get("user_id") for u in after_b}
            db_b = db_users(TENANT_B_ID)
            check(new_staff_id in {u.get("user_id") for u in after_a},
                  "p7b: the account created by tenant A's admin is in tenant A's"
                  " roster")
            check(new_staff_id not in b_ids,
                  "p7b: it is ABSENT from tenant B's roster")
            check(len(b_ids) > 0 and any(
                      str(u["id"]) in b_ids for u in db_b),
                  f"p7b POSITIVE CONTROL: tenant B's roster is non-empty and"
                  f" carries tenant B's own rows ({len(b_ids)} entries) -- so the"
                  " absence above is not an empty list")
            check(str(new_staff_id) not in {str(u["id"]) for u in db_b},
                  "p7b: and it is absent from tenant B's rows read straight out"
                  " of the table, not only from the response")

            # (c) the credential does not work in the other shop. ADMIN_NEW, not
            # STAFF_NEW: P5's control deliberately created STAFF_NEW in tenant B
            # as well, so a refusal there would be about the PASSWORD rather than
            # about the account being absent, and the two must not share a cell.
            r7c = login_raw(client, TENANT_B_ID, ADMIN_NEW, NEW_PW)
            print(f"  POST /auth/login, tenant B, the account created in tenant A"
                  f"  status={r7c.status_code}")
            check(r7c.status_code == 401,
                  "p7c: the created credential is refused by the OTHER tenant")
            check("access_token" not in r7c.text,
                  "p7c: that refusal carries no access_token")
            r7d = login_raw(client, TENANT_A_ID, ADMIN_NEW, NEW_PW)
            check(r7d.status_code == 200,
                  "p7c PAIR: the same credential still works in its OWN tenant --"
                  " both sides of this comparison come off live responses")

            # ==============================================================
            banner("H1-H3 - the validation handler, and that it is API-WIDE")
            # ==============================================================
            # P6/H4 above already asserts the password case on this route. These
            # three ask the question the route cannot answer about itself: is the
            # value removed BECAUSE IT WAS A PASSWORD, or removed from every
            # validation error this API emits? A handler that pleased POST /users
            # and left every other route echoing would be invisible to P1-P8.
            print("  the handler is app/main.py::validation_error_handler,")
            print("  registered against RequestValidationError on the app, so it")
            print("  answers for every route -- including routes not yet written.")

            # ---------------------------------------------------------- H1
            r_h1 = create_user(client, admin_token, f"h1-{RUN}",
                               "Refused by H1", "staff", SHORT_PW)
            print(f"\n  H1  POST /users, short password   status={r_h1.status_code}")
            print(f"      body={r_h1.text.strip()[:220]}")
            h1_errors = body_of(r_h1).get("detail")
            h1_errors = h1_errors if isinstance(h1_errors, list) else []
            check(r_h1.status_code == 422, "H1: the refusal is a 422")
            check(SHORT_PW.encode() not in r_h1.content,
                  "H1: the submitted value is ABSENT from the raw bytes of the"
                  " response")
            check(all("input" not in e for e in h1_errors) and len(h1_errors) == 1,
                  f"H1: the one error object carries no `input` key at all"
                  f" (entries={len(h1_errors)},"
                  f" keys={sorted(h1_errors[0]) if h1_errors else []})")
            check(b"password" in r_h1.content and b"string_too_short" in r_h1.content,
                  "H1 CONTROL: the same byte search finds `password` and"
                  " `string_too_short` in that body -- the absence above is not"
                  " an empty haystack")

            # ---------------------------------------------------------- H2
            # A NON-SECRET FIELD, and its value is searchable on purpose: 73
            # characters against a 64 maximum, so the error is string_too_long and
            # the value is distinctive enough that finding it could not be a
            # coincidence. THIS IS THE CELL THAT SAYS THE RULE IS UNCONDITIONAL
            # rather than a list of field names somebody maintains.
            long_username = "h2-" + "u" * 70
            r_h2 = create_user(client, admin_token, long_username,
                               "Refused by H2", "staff", NEW_PW)
            print(f"\n  H2  POST /users, username {len(long_username)} chars"
                  f"   status={r_h2.status_code}")
            print(f"      body={r_h2.text.strip()[:260]}")
            h2_errors = body_of(r_h2).get("detail")
            h2_errors = h2_errors if isinstance(h2_errors, list) else []
            h2 = next((e for e in h2_errors
                       if e.get("loc") == ["body", "username"]), None)
            check(r_h2.status_code == 422, "H2: the refusal is a 422")
            check(h2 is not None,
                  "H2: the body still names WHICH field failed"
                  " (loc == ['body','username'])")
            check(h2 is not None and h2.get("type") == "string_too_long",
                  f"H2: it still names WHY, machine-readably"
                  f" (type == 'string_too_long', got"
                  f" {h2.get('type') if h2 else None!r})")
            check(h2 is not None and "at most 64" in str(h2.get("msg", "")),
                  f"H2: it still says why in words, with the bound"
                  f" (msg contains 'at most 64': {h2.get('msg') if h2 else None!r})")
            check(h2 is not None and isinstance(h2.get("ctx"), dict)
                  and h2["ctx"].get("max_length") == 64,
                  f"H2: and it still carries the bound as data"
                  f" (ctx.max_length == 64, got"
                  f" {h2.get('ctx') if h2 else None!r})")
            check(h2 is not None and "input" not in h2,
                  "H2: the value is removed from a NON-SECRET field too -- the"
                  " rule is one key removed unconditionally, not a list of field"
                  " names somebody has to keep up to date")
            check(long_username.encode() not in r_h2.content,
                  "H2: and the submitted username is absent from the raw bytes")

            # ---------------------------------------------------------- H3
            # A DIFFERENT ENDPOINT ENTIRELY, and one that has nothing to do with
            # passwords or with users: POST /uoms, whose `code` field has carried
            # StringConstraints(min_length=1) since master.py was written. If the
            # handler were scoped to this module, or to a field name, this cell is
            # where that shows.
            empty_code = {"code": "", "name": f"H3 unit {RUN}"}
            r_h3 = client.post(f"{BASE}/uoms", headers=auth(admin_token),
                               json=empty_code)
            print(f"\n  H3  POST /uoms, empty code        status={r_h3.status_code}")
            print(f"      body={r_h3.text.strip()[:260]}")
            h3_errors = body_of(r_h3).get("detail")
            h3_errors = h3_errors if isinstance(h3_errors, list) else []
            h3 = next((e for e in h3_errors
                       if e.get("loc") == ["body", "code"]), None)
            check(r_h3.status_code == 422, "H3: POST /uoms still refuses 422")
            check(h3 is not None and h3.get("type") == "string_too_short"
                  and "at least 1" in str(h3.get("msg", "")),
                  f"H3: an UNRELATED endpoint's validation error still names the"
                  f" field and the reason (loc ['body','code'],"
                  f" type 'string_too_short', msg carries 'at least 1'): {h3!r}")
            check(h3 is not None and "input" not in h3,
                  "H3: and the handler reached it -- no `input` key on an"
                  " endpoint this commit did not touch")
            check(isinstance(body_of(r_h3).get("detail"), list),
                  "H3: `detail` is still a LIST, which is the shape"
                  " prove_master_write.py uses to tell a pydantic 422 from this"
                  " API's kind/code refusals")

            # ==============================================================
            banner("P8 - the existing revocation proof still passes, UNCHANGED")
            # ==============================================================
            # This commit adds a route to a module prove_revocation.py already
            # covers. It is run as a child against THIS server and THIS scratch
            # database, and its EXIT CODE is read from the process object -- never
            # parsed out of its output, because a child's stdout arrives CRLF on
            # this box and an anchored pattern would match nothing (CLAUDE.md,
            # Machine footguns).
            rev_log = tempfile.NamedTemporaryFile(  # noqa: SIM115
                prefix="prove_user_create_revocation_", suffix=".log",
                delete=False, mode="w+")
            rev_env = dict(env)
            rev_env["API_BASE_URL"] = BASE
            print(f"  running scripts/prove_revocation.py against {BASE}")
            rev = subprocess.run(
                [sys.executable, "-u",
                 os.path.join(SERVER_DIR, "scripts", "prove_revocation.py")],
                cwd=SERVER_DIR, env=rev_env, stdout=rev_log,
                stderr=subprocess.STDOUT)
            rev_log.flush()
            with open(rev_log.name, encoding="utf-8", errors="replace") as fh:
                rev_out = fh.read().replace("\r\n", "\n")
            rev_log.close()
            ok_cells = rev_out.count("[OK  ]")
            fail_cells = rev_out.count("[FAIL]")
            print(f"  prove_revocation.py exit code : {rev.returncode}")
            print(f"  its cells                     : {ok_cells} OK,"
                  f" {fail_cells} FAIL")
            print(f"  its full output               : {rev_log.name}")
            if rev.returncode != 0:
                print("  --- its last 40 lines ---")
                for line in rev_out.strip().split("\n")[-40:]:
                    print(f"  | {line}")
            check(rev.returncode == 0,
                  f"p8: prove_revocation.py exits 0 against this server"
                  f" (got {rev.returncode})")
            check(fail_cells == 0 and ok_cells > 0,
                  f"p8: it reports no failed cell and did run some"
                  f" ({ok_cells} OK, {fail_cells} FAIL)")
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()
        log.close()

    banner("SUMMARY")
    print(f"  accounts created by this run: 2 in tenant A ({STAFF_NEW},"
          f" {ADMIN_NEW}) and 1 in tenant B ({STAFF_NEW}), plus whatever"
          " prove_revocation.py wrote. None of them can be deleted.")
    print(f"  uvicorn log: {log.name}")
    if failures:
        print("  THESE CLAIMS DID NOT HOLD:")
        for f in failures:
            print(f"    - {f}")
    print(f"  cells: {len(passes)} OK, {len(failures)} FAIL"
          f"  (total {len(passes) + len(failures)})")
    print(f"  failures: {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    rc = main()
    print(f"PROVE_USER_CREATE_EXIT={rc}")
    sys.exit(rc)
