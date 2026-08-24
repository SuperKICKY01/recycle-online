"""Prove the reservation relation holds ONE holder per code, and that the top-up
route is a LEVEL rather than an ISSUE.

    python scripts/prove_seller_code_reservations.py --database recycle_p18b_scratch

REFUSES TO RUN AGAINST THE LIVE DATABASE, and the refusal is the point. Every
call here MINTS RESERVED SELLER CODES, and migration 0012 says a reservation is
never reclaimed, never re-issued and never deleted -- so each run permanently
consumes a stretch of whatever database it is pointed at, and the gaps show up on
the neighbours of a printed slip. That is the same shape as the two mutation runs
that once left ten unremovable bills in dev
(lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-database.md).
DEV IS NOT SCRATCH.

IT STARTS ITS OWN SERVER, for the reason prove_seller_create.py gives: an API
process is bound to its database AT STARTUP, so a proof correctly pointed at
scratch while a server runs against dev would drive the REAL PATH INTO DEV and
report a scratch run. The child uvicorn is launched with APP_DATABASE_URL and
DIRECTORY_DATABASE_URL overridden IN THE CHILD'S ENVIRONMENT -- a dict, never a
command line, because every shell command on this box lands verbatim in
.claude/hooks/*.log and these URLs carry passwords.

AND THE BINDING IS MEASURED RATHER THAN INTENDED (B2). A reservation carrying a
token minted in THIS RUN is written into the scratch database BEFORE the server
starts, and the server is required to hand it back. No other database on this
cluster can hold that token: it did not exist anywhere until this run generated
it. A server bound to dev answers B1 (the route is declared -- it is declared in
both) and fails B2.

WHAT THIS PROOF IS ABOUT, AND WHAT IT IS NOT. It covers the RELATION and the
REFILL ROUTE. It does NOT touch POST /sellers, does not spend a reservation, and
cannot: nothing in this commit writes `spent`. The two guards on the create path
-- refusing a supplied reserved code, and deriving a minted one above both tables
-- are a separate change to behaviour that already works, with their own proof.
Everything below is additive, and the cells say so where it matters.

REPEATABLE. Run it twice with no reseed; it passes twice
(lessons/proof-must-run-twice.md). Every device identity and every token is a
per-run uuid, no code is ever written into this file, and every count is asserted
as a MOVEMENT against a reading taken immediately before the call -- never
against an absolute, because the one thing this proof cannot choose is where the
server's code sequence currently sits.

ORDER IS NEVER ASSUMED. The route returns `ORDER BY code`, which is LEXICAL, so
S1000 sorts below S999. Every assertion here parses the number out and sorts on
that, so a run that crosses the width boundary measures the same property.

THE EXIT LINE, AND WHAT SUPPRESSES IT. main() prints
`PROVE_SELLER_CODE_RESERVATIONS_EXIT=<n>` from the same integer it returns. That
line is ABSENT if the script dies before the summary -- uvicorn failing to start,
a database being unreachable, an unhandled exception. THE ABSENCE IS THE SIGNAL:
a reader scanning for a number and finding none has NOT found a pass.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import secrets
import socket
import subprocess
import sys
import tempfile
import threading
import time
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

# Resolved from THIS file and not the cwd, the placement
# lessons/config-defaults-must-fail-closed.md records.
load_dotenv()

import asyncpg  # noqa: E402
import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    STAFF_USERNAME,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
    TENANT_A_STAFF_PASSWORD,
    TENANT_B_ID,
    TENANT_B_STAFF_PASSWORD,
)

RUN = uuid.uuid4().hex[:8]
BASE = ""        # set in main(), once the port is known
OWNER_DSN = ""   # set in main(): the read-back connection, owner role
APP_DSN = ""     # set in main(): the RLS-bound application role

# The shape the server assigns. Held HERE as an independent expectation rather
# than imported from master.py: a checker that shares the constant it checks
# agrees with the code by construction
# (lessons/a-checker-must-not-share-the-code-it-checks.md).
ASSIGNED_SHAPE = re.compile(r"^S(\d+)$")

# The route under test. Also written out rather than imported, same reason.
REFILL_PATH = "/seller-code-reservations"

# EXACTLY the keys the response may carry. Asserted by EQUALITY and not by
# containment: containment answers what is present, and only equality answers
# what is in EXCESS -- and what must not be in excess here is a QUANTITY, which
# the design took off the wire in both directions.
EXPECTED_RESPONSE_KEYS = {"device_id", "target_holding", "reservations"}

failures: list[str] = []


def free_port() -> int:
    """Never a fixed port. A hardcoded 8137 once met a stale uvicorn and two of
    three refusal cells passed against a route that did not exist
    (lessons/a-proof-must-establish-what-it-is-talking-to.md)."""
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def banner(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def check(cond: bool, label: str) -> None:
    if not cond:
        failures.append(label)
    print(f"  [{'ok ' if cond else 'RED'}] {label}")


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def body_of(r: httpx.Response) -> dict:
    """The JSON object, or {} -- never a raise. Every caller asserts a VALUE out
    of it, so an unparseable body fails rather than passes."""
    try:
        b = r.json()
    except Exception:  # noqa: BLE001
        return {}
    return b if isinstance(b, dict) else {}


def login(client: httpx.Client, tenant: uuid.UUID, username: str,
          password: str) -> str:
    r = client.post(f"{BASE}/auth/login", json={
        "tenant_id": str(tenant), "username": username, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


# ---------------------------------------------------------------------------
# Postgres, through asyncpg directly.
#
# NOT through app/db.py. Two of the cells below assert that a WRITE IS REFUSED
# and read the CONSTRAINT NAME out of the refusal, and asyncpg raises
# UniqueViolationError / CheckViolationError with `.constraint_name` on the
# exception itself. SQLAlchemy's asyncpg dialect does not: it builds its own
# DBAPI-shaped IntegrityError, copies only sqlstate, and chains the real one as
# __cause__ -- the quirk app/db.py's constraint_name_of exists to walk. Reading
# the authority directly keeps this checker from sharing the code it checks
# (lessons/a-checker-must-not-share-the-code-it-checks.md).
#
# READ AS THE OWNER WITH TENANT CONTEXT SET, the same primitive the server uses.
# FORCE ROW LEVEL SECURITY applies to the owner too, so without set_config these
# reads would return zero rows and every "absent" assertion would be vacuously
# true (mechanism 9 of
# lessons/a-check-that-never-went-red-was-never-observed.md).
# ---------------------------------------------------------------------------
async def _in_tenant(dsn: str, tenant: uuid.UUID, fn):
    conn = await asyncpg.connect(dsn)
    try:
        tx = conn.transaction()
        await tx.start()
        try:
            await conn.execute("SELECT set_config('app.tenant_id', $1, true)",
                               str(tenant))
            result = await fn(conn)
            await tx.commit()
            return result
        except BaseException:
            await tx.rollback()
            raise
    finally:
        await conn.close()


def owner(tenant: uuid.UUID, fn):
    return asyncio.run(_in_tenant(OWNER_DSN, tenant, fn))


def app_role(tenant: uuid.UUID, fn):
    return asyncio.run(_in_tenant(APP_DSN, tenant, fn))


def fetch(tenant: uuid.UUID, sql: str, *args) -> list:
    async def go(conn):
        return await conn.fetch(sql, *args)
    return owner(tenant, go)


def fetchval(tenant: uuid.UUID, sql: str, *args):
    async def go(conn):
        return await conn.fetchval(sql, *args)
    return owner(tenant, go)


def execute(tenant: uuid.UUID, sql: str, *args) -> str:
    async def go(conn):
        return await conn.execute(sql, *args)
    return owner(tenant, go)


def refused(tenant: uuid.UUID, sql: str, *args, as_app: bool = False):
    """Run a statement that is EXPECTED to be refused, and hand back the
    exception -- or None if it was accepted.

    None is the FAILING answer for every caller, and each one says so on its own
    line. A helper that swallowed the difference would make "refused" and
    "accepted" print the same tick.
    """
    async def go(conn):
        return await conn.execute(sql, *args)
    runner = app_role if as_app else owner
    try:
        runner(tenant, go)
        return None
    except Exception as e:  # noqa: BLE001 -- the refusal IS the measurement
        return e


def constraint_of(e: object) -> str:
    """The constraint name asyncpg put on the exception, or "" if there is none.

    "" means I DO NOT KNOW, never "there was no constraint" -- the distinction
    lessons/a-defaulted-getattr-is-a-silent-dead-branch.md is about. Every caller
    compares it against a NAMED constraint, so "" fails.
    """
    return str(getattr(e, "constraint_name", "") or "")


# ---------------------------------------------------------------------------
# the relation, read back
# ---------------------------------------------------------------------------
def held_codes(device: uuid.UUID) -> list[str]:
    rows = fetch(TENANT_A_ID,
                 "SELECT code FROM seller_code_reservations"
                 " WHERE device_id = $1 AND state = 'held'", device)
    return [r["code"] for r in rows]


def reservation_rows(tenant: uuid.UUID) -> int:
    return int(fetchval(tenant,
                        "SELECT count(*) FROM seller_code_reservations"))


def assigned_max(tenant: uuid.UUID) -> tuple[int, int, int]:
    """(max over sellers, max over reservations, max over the union), 0 if empty.

    THREE numbers and not one, because the whole point of the derivation is
    WHICH TABLE the maximum came from. A cell that only knew the union could not
    tell a server deriving above both tables from one deriving above `sellers`
    while the reservations happen to sit below it.
    """
    row = fetch(tenant, """
        SELECT
          coalesce((SELECT max(substring(code from 2)::numeric) FROM sellers
                     WHERE code ~ '^S[0-9]+$'), 0)                    AS s,
          coalesce((SELECT max(substring(code from 2)::numeric)
                      FROM seller_code_reservations
                     WHERE code ~ '^S[0-9]+$'), 0)                    AS r
    """)[0]
    return int(row["s"]), int(row["r"]), max(int(row["s"]), int(row["r"]))


def numbers_of(codes: list[str]) -> list[int]:
    """The integers behind a list of assigned codes, sorted NUMERICALLY.

    Never the order the server returned: that is `ORDER BY code`, which is
    lexical, so S1000 sorts below S999. A proof that read the wire order would
    quietly start measuring something else the day a shop crosses the width.
    """
    out = []
    for c in codes:
        m = ASSIGNED_SHAPE.match(c)
        if m:
            out.append(int(m.group(1)))
    return sorted(out)


def target_in_db(tenant: uuid.UUID) -> int:
    return int(fetchval(tenant,
                        "SELECT seller_code_target_holding FROM tenants"))


# ---------------------------------------------------------------------------
# the route
# ---------------------------------------------------------------------------
def refill(client: httpx.Client, token: str, device: uuid.UUID,
           extra: dict | None = None) -> httpx.Response:
    payload: dict = {"device_id": str(device)}
    if extra:
        payload.update(extra)
    return client.post(f"{BASE}{REFILL_PATH}", headers=auth(token), json=payload)


def codes_and_tokens(r: httpx.Response) -> tuple[list[str], list[str]]:
    b = body_of(r)
    res = b.get("reservations")
    if not isinstance(res, list):
        return [], []
    return ([str(x.get("code")) for x in res if isinstance(x, dict)],
            [str(x.get("token")) for x in res if isinstance(x, dict)])


# ---------------------------------------------------------------------------
# the server
# ---------------------------------------------------------------------------
def wait_for_health(proc: subprocess.Popen, timeout_s: float = 45.0) -> str:
    """Takes the CHILD, so a dead child fails immediately instead of being waited
    out for the full timeout and then blamed on the clock."""
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


def declared_paths() -> dict:
    r = httpx.get(f"{BASE}/openapi.json", timeout=5.0)
    r.raise_for_status()
    return r.json().get("paths", {})


def main() -> int:  # noqa: PLR0915 - one linear script, read top to bottom
    ap = argparse.ArgumentParser(
        description="Prove the seller-code reservation relation and the top-up "
                    "route.")
    ap.add_argument("--database", required=True,
                    help="a SCRATCH database. Every run permanently consumes a "
                         "stretch of the seller code sequence; nothing here can "
                         "be reclaimed.")
    args = ap.parse_args()

    app_live = make_url(os.environ["APP_DATABASE_URL"])
    dir_live = make_url(os.environ["DIRECTORY_DATABASE_URL"])
    owner_live = make_url(os.environ["MIGRATION_DATABASE_URL"])
    live_name = app_live.database

    if args.database == live_name:
        print(f"REFUSED: --database {args.database!r} is the LIVE database from\n"
              "  APP_DATABASE_URL. Every call in this script MINTS RESERVED\n"
              "  SELLER CODES, and migration 0012 never reclaims, re-issues or\n"
              "  deletes one -- so each run burns a stretch of the sequence in\n"
              "  whatever database it is pointed at, permanently, and the gaps\n"
              "  land on printed slips. Restore a copy first:\n"
              "    python scripts/backup_db.py\n"
              "    python scripts/restore_db.py <dir> --into recycle_p18b_scratch")
        return 2

    app_url = app_live.set(database=args.database)
    dir_url = dir_live.set(database=args.database)
    global OWNER_DSN, APP_DSN
    # asyncpg takes a bare postgresql:// DSN, not the +asyncpg driver form.
    OWNER_DSN = owner_live.set(
        database=args.database, drivername="postgresql"
    ).render_as_string(hide_password=False)
    APP_DSN = app_live.set(
        database=args.database, drivername="postgresql"
    ).render_as_string(hide_password=False)

    sentinel_device = uuid.uuid4()
    # SHAPED LIKE A PRODUCT TOKEN, not like a test string: the route mints
    # secrets.token_urlsafe(32), so this is indistinguishable from one and is
    # still unique to this run (lessons/
    # a-proof-fixture-must-be-a-row-the-product-could-produce.md).
    sentinel_token = secrets.token_urlsafe(32)

    print("=== prove_seller_code_reservations ===")
    print(f"  run tag            : {RUN}")
    print(f"  scratch database   : {args.database}")
    print(f"  live database      : {live_name!r} -- not touched by this script")

    # ---------------------------------------------------------------- sentinel
    banner("B0 - the binding sentinel, written BEFORE the server starts")
    s_max, r_max, u_max = assigned_max(TENANT_A_ID)
    sentinel_code = f"S{u_max + 1:03d}"
    issuer = fetchval(TENANT_A_ID,
                      "SELECT id FROM users WHERE username = $1", STAFF_USERNAME)
    print(f"  assigned maxima before anything: sellers={s_max} "
          f"reservations={r_max} union={u_max}")
    print(f"  sentinel code {sentinel_code} for device {sentinel_device}")
    execute(TENANT_A_ID,
            "INSERT INTO seller_code_reservations"
            " (tenant_id, code, device_id, token, state, issued_by)"
            " VALUES ($1, $2, $3, $4, 'held', $5)",
            TENANT_A_ID, sentinel_code, sentinel_device, sentinel_token, issuer)
    check(reservation_rows(TENANT_A_ID) > 0
          and fetchval(TENANT_A_ID,
                       "SELECT count(*) FROM seller_code_reservations"
                       " WHERE token = $1", sentinel_token) == 1,
          f"B0: the sentinel reservation {sentinel_code} exists in "
          f"{args.database}, carrying a token generated in THIS run")
    print("       no other database on this cluster can hold that token. That")
    print("       is what makes B2 discriminating rather than decorative.")

    env = dict(os.environ)
    env["APP_DATABASE_URL"] = app_url.render_as_string(hide_password=False)
    env["DIRECTORY_DATABASE_URL"] = dir_url.render_as_string(hide_password=False)
    env["PYTHONUNBUFFERED"] = "1"

    server_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    port = free_port()
    global BASE
    BASE = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(  # noqa: SIM115 - closed in finally
        prefix="prove_scr_uvicorn_", suffix=".log", delete=False, mode="w+")
    proc = subprocess.Popen(
        [sys.executable, "-u", "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=server_dir, env=env, stdout=log, stderr=subprocess.STDOUT)

    original_target: int | None = None
    try:
        why = wait_for_health(proc)
        if why:
            log.flush()
            with open(log.name, encoding="utf-8", errors="replace") as fh:
                tail = fh.read().replace("\r\n", "\n")[-2000:]
            print(f"SERVER DID NOT START: {why}\nuvicorn output:\n{tail}")
            return 1

        with httpx.Client(timeout=30.0) as client:
            # ======================================================== B1 / B2
            banner("B1 - the route is DECLARED by the server this proof drives")
            paths = declared_paths()
            check(REFILL_PATH in paths,
                  f"B1: {REFILL_PATH} is declared in /openapi.json "
                  f"(paths={len(paths)})")
            check("post" in {m.lower() for m in paths.get(REFILL_PATH, {})},
                  "B1: and it declares a POST -- a carefully written refusal "
                  "assertion is satisfied by a route's ABSENCE, so this is "
                  "checked before anything below is believed")

            staff = login(client, TENANT_A_ID, STAFF_USERNAME,
                          TENANT_A_STAFF_PASSWORD)
            admin = login(client, TENANT_A_ID, ADMIN_USERNAME, TENANT_A_PASSWORD)
            who_s = client.get(f"{BASE}/whoami", headers=auth(staff))
            who_a = client.get(f"{BASE}/whoami", headers=auth(admin))
            staff_uid = body_of(who_s).get("user_id")
            admin_uid = body_of(who_a).get("user_id")
            check(body_of(who_s).get("role") == "staff",
                  f"B1: the staff token really is role=staff "
                  f"({body_of(who_s).get('role')!r}) -- D1's gate claim is about "
                  "STAFF, so an admin token would prove the wrong thing")
            check(staff_uid is not None and admin_uid is not None
                  and staff_uid != admin_uid,
                  f"B1: the two principals are REAL and DISTINCT "
                  f"(staff={staff_uid} admin={admin_uid}) -- the weaker side of "
                  "the issued_by differential, checked first")

            banner("B2 - WHICH DATABASE THE SERVER IS BOUND TO, measured")
            r = refill(client, staff, sentinel_device)
            print(f"  status={r.status_code}")
            _, toks = codes_and_tokens(r)
            check(r.status_code == 200 and sentinel_token in toks,
                  f"B2: the refill for the sentinel device hands back this run's "
                  f"own token -- so the server is bound to {args.database} and "
                  "not to the live database")

            # ============================================================= C1
            banner("C1 - A-CODE-HAS-ONE-HOLDER-AND-KEEPS-IT, cell 1: the PRIMARY "
                   "KEY refuses a second holder for one code")
            other_device = uuid.uuid4()
            rows_before = reservation_rows(TENANT_A_ID)
            err = refused(
                TENANT_A_ID,
                "INSERT INTO seller_code_reservations"
                " (tenant_id, code, device_id, token, state, issued_by)"
                " VALUES ($1, $2, $3, $4, 'held', $5)",
                TENANT_A_ID, sentinel_code, other_device,
                secrets.token_urlsafe(32), issuer)
            rows_after = reservation_rows(TENANT_A_ID)
            print(f"  second INSERT of (tenant, {sentinel_code}) -> "
                  f"{type(err).__name__ if err else 'ACCEPTED'} "
                  f"constraint={constraint_of(err)!r}")
            check(err is not None
                  and constraint_of(err) == "seller_code_reservations_pkey",
                  f"C1: the second holder is REFUSED BY THE PRIMARY KEY "
                  f"(constraint={constraint_of(err)!r}) -- not by a unique index "
                  "on the token, which is the shape that admits two holders for "
                  "one code")
            check(rows_before == rows_after,
                  f"C1: and no second row landed (before={rows_before} "
                  f"after={rows_after}), counted in Postgres either side")

            # THE PRESENCE SIBLING. Without it the refusal above is satisfied by
            # a broken connection, a mistyped table, or a role that cannot write
            # this relation at all.
            free_code = f"S{assigned_max(TENANT_A_ID)[2] + 1:03d}"
            ok_err = refused(
                TENANT_A_ID,
                "INSERT INTO seller_code_reservations"
                " (tenant_id, code, device_id, token, state, issued_by)"
                " VALUES ($1, $2, $3, $4, 'held', $5)",
                TENANT_A_ID, free_code, other_device,
                secrets.token_urlsafe(32), issuer)
            check(ok_err is None
                  and fetchval(TENANT_A_ID,
                               "SELECT count(*) FROM seller_code_reservations"
                               " WHERE code = $1", free_code) == 1,
                  f"C1 presence sibling: the IDENTICAL statement for a code not "
                  f"in the relation ({free_code}) SUCCEEDS -- so C1 is evidence "
                  "about the key and not about the connection")

            # ============================================================= C2
            banner("C2 - ck_reservations_spent_consistency: `spent` and a seller "
                   "id move TOGETHER, in both directions")
            # A DIRECT INSERT of a `spent` row is a row the product WILL produce
            # once the create path spends a reservation; nothing in this commit
            # can. It is written directly here for the reason prove_rls.py writes
            # its graph directly -- the constraint is what is under test, and a
            # constraint is only observable by asking it to refuse something.
            #
            # AND THE SELLER IS CREATED TO CARRY THE RESERVATION'S OWN CODE,
            # rather than borrowing whichever seller happens to sort first. A
            # spent reservation pointing at a seller with a DIFFERENT code is a
            # row no sequence of legitimate requests can produce, and leaving one
            # behind would be a permanent false statement about the product in
            # the one place every future instrument reads as ground truth
            # (lessons/a-proof-fixture-must-be-a-row-the-product-could-produce.md).
            base = assigned_max(TENANT_A_ID)[2]
            spent_code = f"S{base + 1:03d}"
            null_code = f"S{base + 2:03d}"
            held_code = f"S{base + 3:03d}"
            execute(TENANT_A_ID,
                    "INSERT INTO sellers (tenant_id, code, name, grade)"
                    " VALUES ($1, $2, $3, 'B')",
                    TENANT_A_ID, spent_code, f"c2 fixture {RUN}")
            a_seller = fetchval(TENANT_A_ID,
                                "SELECT id FROM sellers WHERE code = $1",
                                spent_code)
            e_null = refused(
                TENANT_A_ID,
                "INSERT INTO seller_code_reservations"
                " (tenant_id, code, device_id, token, state, issued_by, seller_id)"
                " VALUES ($1, $2, $3, $4, 'spent', $5, NULL)",
                TENANT_A_ID, null_code, other_device,
                secrets.token_urlsafe(32), issuer)
            check(e_null is not None
                  and constraint_of(e_null) == "ck_reservations_spent_consistency",
                  f"C2: `spent` with a NULL seller_id is REFUSED "
                  f"(constraint={constraint_of(e_null)!r}) -- the state a "
                  "two-statement create leaves behind when the second statement "
                  "is lost, and the one a later replay would spend AGAIN")
            e_held = refused(
                TENANT_A_ID,
                "INSERT INTO seller_code_reservations"
                " (tenant_id, code, device_id, token, state, issued_by, seller_id)"
                " VALUES ($1, $2, $3, $4, 'held', $5, $6)",
                TENANT_A_ID, held_code, other_device,
                secrets.token_urlsafe(32), issuer, a_seller)
            check(e_held is not None
                  and constraint_of(e_held) == "ck_reservations_spent_consistency",
                  f"C2: and `held` NAMING a seller is refused too "
                  f"(constraint={constraint_of(e_held)!r}) -- asserted in BOTH "
                  "directions, because a one-way implication is satisfied by a "
                  "CHECK that only forbids one of the two wrong states")
            e_pair = refused(
                TENANT_A_ID,
                "INSERT INTO seller_code_reservations"
                " (tenant_id, code, device_id, token, state, issued_by, seller_id)"
                " VALUES ($1, $2, $3, $4, 'spent', $5, $6)",
                TENANT_A_ID, spent_code, other_device,
                secrets.token_urlsafe(32), issuer, a_seller)
            check(e_pair is None and a_seller is not None,
                  f"C2 presence sibling: `spent` WITH a seller id is accepted "
                  f"(code={spent_code} seller={a_seller}) -- so the two refusals "
                  "above are about the PAIRING and not about the row being "
                  "unwritable. The seller carries that same code, so the row left "
                  "behind is one the create path will itself produce")

            # ============================================================= C3
            banner("C3 - the grant boundary: the app role may UPDATE a "
                   "reservation and may NOT DELETE one")
            impossible = f"NO-SUCH-CODE-{RUN}"
            del_err = refused(
                TENANT_A_ID,
                "DELETE FROM seller_code_reservations WHERE code = $1",
                impossible, as_app=True)
            upd_err = refused(
                TENANT_A_ID,
                "UPDATE seller_code_reservations SET state = 'held'"
                " WHERE code = $1",
                impossible, as_app=True)
            print(f"  as recycle_app: DELETE -> "
                  f"{type(del_err).__name__ if del_err else 'PERMITTED'};"
                  f"  UPDATE -> {type(upd_err).__name__ if upd_err else 'PERMITTED'}")
            check(del_err is not None
                  and "permission denied" in str(del_err).lower(),
                  "C3: DELETE is REFUSED to recycle_app at the privilege level "
                  f"({str(del_err)[:90]!r}) -- a reservation is the permanent "
                  "record that a code was issued, and removing one is what would "
                  "let it be issued twice")
            check(upd_err is None,
                  "C3 presence sibling: UPDATE is PERMITTED to the same role on "
                  "the same relation in the same run -- so C3 measures the "
                  "REVOKE and not a role with no reach at all. Neither statement "
                  "can touch a row: both name a code that does not exist, so "
                  "what is measured is the privilege")

            # ============================================================= C4
            banner("C4 - ck_tenants_seller_code_target_holding: the floor of 1")
            original_target = target_in_db(TENANT_A_ID)
            zero_err = refused(
                TENANT_A_ID,
                "UPDATE tenants SET seller_code_target_holding = 0")
            check(zero_err is not None
                  and constraint_of(zero_err)
                  == "ck_tenants_seller_code_target_holding",
                  f"C4: a target of 0 is REFUSED "
                  f"(constraint={constraint_of(zero_err)!r}) -- zero would make "
                  "offline seller creation permanently impossible while every "
                  "screen reported a healthy device")
            check(target_in_db(TENANT_A_ID) == original_target,
                  f"C4: and the target is unchanged at {original_target} -- the "
                  "refusal took nothing with it")

            # ============================================================= D1
            banner("D1 - a FRESH device is topped up to the target, and the "
                   "relation grows by EXACTLY the shortfall")
            dev1 = uuid.uuid4()
            target_db = target_in_db(TENANT_A_ID)
            rows_before = reservation_rows(TENANT_A_ID)
            held_before = len(held_codes(dev1))
            _, _, umax_before = assigned_max(TENANT_A_ID)
            r1 = refill(client, staff, dev1)
            b1 = body_of(r1)
            codes1, tokens1 = codes_and_tokens(r1)
            rows_after = reservation_rows(TENANT_A_ID)
            print(f"  status={r1.status_code}  target_in_db={target_db}  "
                  f"held_before={held_before}")
            print(f"  relation rows for this tenant: {rows_before} -> "
                  f"{rows_after}   minted={rows_after - rows_before}")
            check(r1.status_code == 200,
                  f"D1: 200 (got {r1.status_code}) -- never 201, because the "
                  "response describes a LEVEL and a status that varied with the "
                  "number of rows written would put the quantity back on the wire")
            check(set(b1) == EXPECTED_RESPONSE_KEYS,
                  f"D1: the response carries EXACTLY {sorted(EXPECTED_RESPONSE_KEYS)} "
                  f"(got {sorted(b1)}) -- equality, not containment, because what "
                  "must not be in EXCESS is a quantity")
            check(b1.get("target_holding") == target_db,
                  f"D1: the answer's target_holding ({b1.get('target_holding')}) "
                  f"equals the shop's column ({target_db}) -- read out of "
                  "Postgres, not off the response it is being compared with")
            shortfall = target_db - held_before
            check(rows_after - rows_before == shortfall,
                  f"D1: the relation grew by EXACTLY the shortfall "
                  f"({rows_after - rows_before} vs {shortfall}) -- a route that "
                  "minted the TARGET on every call rather than the shortfall is "
                  "invisible on the device and lives entirely in this number")
            check(len(codes1) == target_db and len(held_codes(dev1)) == target_db,
                  f"D1: the device now holds the target -- {len(codes1)} in the "
                  f"answer and {len(held_codes(dev1))} in Postgres, both equal to "
                  f"{target_db}. BOTH readings are required: the count alone is "
                  "satisfied by a route that answers nothing")
            nums1 = numbers_of(codes1)
            check(bool(nums1) and len(nums1) == len(codes1)
                  and nums1 == list(range(umax_before + 1, umax_before + 1 + len(nums1))),
                  f"D1: the codes are CONSECUTIVE successors of the union maximum "
                  f"({umax_before}) -- {nums1[:3]}...{nums1[-1:] if nums1 else []}. "
                  "Every one is of the assigned shape, so a code the edge type "
                  "would refuse was never minted")
            check(len(set(tokens1)) == len(tokens1) and len(tokens1) > 0
                  and all(len(t) >= 40 for t in tokens1)
                  and not any(t in c or c in t for t, c in zip(tokens1, codes1)),
                  "D1: every token in the block is DISTINCT, is at least 40 "
                  "characters, and is not derivable from its own code. THIS IS "
                  "NOT A TEST OF ENTROPY -- nothing here can measure that; it "
                  "refuses the three shapes a counter or a hash of the code "
                  "would take")
            # staff_uid is asserted NON-NULL in B1 above; guarded again here so a
            # failed login costs a red cell rather than a TypeError that stops
            # the run and prints no exit line at all.
            bad = fetch(TENANT_A_ID,
                        "SELECT code, state, seller_id, issued_by, device_id"
                        " FROM seller_code_reservations WHERE device_id = $1"
                        " AND (state <> 'held' OR seller_id IS NOT NULL"
                        "      OR issued_by <> $2)",
                        dev1, uuid.UUID(str(staff_uid))) if staff_uid else [
                            {"code": "no staff user_id from /whoami"}]
            check(staff_uid is not None and not bad,
                  f"D1: every minted row is `held`, names NO seller, and records "
                  f"the STAFF session that asked ({staff_uid}) -- read out of "
                  f"Postgres; {len(bad)} row(s) disagreed")

            # ============================================================= D2
            banner("D2 - THE LOST RESPONSE: the same request again mints ZERO "
                   "and hands back the SAME holding")
            rows_before = reservation_rows(TENANT_A_ID)
            r2 = refill(client, staff, dev1)
            codes2, tokens2 = codes_and_tokens(r2)
            rows_after = reservation_rows(TENANT_A_ID)
            print(f"  relation rows: {rows_before} -> {rows_after}")
            check(r2.status_code == 200 and rows_after == rows_before,
                  f"D2: the repeat minted ZERO new reservations "
                  f"({rows_before} -> {rows_after}) -- read as the relation's row "
                  "count, which is the only place a second block would show")
            check(set(codes2) == set(codes1) and len(codes2) == target_db,
                  f"D2: and it handed back the SAME set, whole -- "
                  f"{len(codes2)} codes equal to D1's {len(codes1)}. EQUALITY, "
                  "because a route returning only the NEW block answers a repeat "
                  "with an empty set and strands the device asking for ever")
            check(set(tokens2) == set(tokens1),
                  "D2: the tokens come back unchanged too -- a route that "
                  "re-minted tokens for the same codes would satisfy the code "
                  "assertion above and silently invalidate what the device holds")

            # ============================================================= D3
            banner("D3 - a PARTIAL shortfall, and the answer is still EVERYTHING "
                   "held rather than what was just minted")
            bump = 5
            execute(TENANT_A_ID,
                    "UPDATE tenants SET seller_code_target_holding = $1",
                    original_target + bump)
            s_max, r_max, u_max = assigned_max(TENANT_A_ID)
            rows_before = reservation_rows(TENANT_A_ID)
            r3 = refill(client, staff, dev1)
            codes3, _ = codes_and_tokens(r3)
            rows_after = reservation_rows(TENANT_A_ID)
            print(f"  target {original_target} -> {original_target + bump};  "
                  f"assigned maxima now sellers={s_max} reservations={r_max}")
            print(f"  relation rows: {rows_before} -> {rows_after}")
            check(rows_after - rows_before == bump,
                  f"D3: exactly {bump} were minted ({rows_after - rows_before}) "
                  "-- the shortfall the SERVER computed, not the target and not "
                  "a number this proof sent")
            check(body_of(r3).get("target_holding") == original_target + bump
                  and len(codes3) == original_target + bump,
                  f"D3: the device now holds {len(codes3)} against a target of "
                  f"{original_target + bump}")
            check(set(codes1).issubset(set(codes3))
                  and len(set(codes3) - set(codes1)) == bump,
                  f"D3: the answer CONTAINS all {len(codes1)} codes the device "
                  f"already held and exactly {bump} new ones -- this is the cell "
                  "that separates *answer what it holds* from *answer what was "
                  "just minted*, and only a partial top-up can reach it")
            new3 = numbers_of(sorted(set(codes3) - set(codes1)))
            check(r_max > s_max and new3
                  and new3 == list(range(r_max + 1, r_max + 1 + bump)),
                  f"D3: THE NEW CODES ARE SUCCESSORS OF THE RESERVATION MAXIMUM "
                  f"({r_max}), which is ABOVE the sellers maximum ({s_max}) -- "
                  "so the derivation is over the UNION. A server deriving from "
                  "`sellers` alone would have restarted at "
                  f"S{s_max + 1:03d} and re-issued a code this device is holding")

            execute(TENANT_A_ID,
                    "UPDATE tenants SET seller_code_target_holding = $1",
                    original_target)
            check(target_in_db(TENANT_A_ID) == original_target,
                  f"D3: the target is put back to {original_target}")

            # ============================================================= D4
            banner("D4 - A-CODE-HAS-ONE-HOLDER-AND-KEEPS-IT, cell 2: two devices "
                   "in ONE tenant share no code")
            dev2 = uuid.uuid4()
            r4 = refill(client, staff, dev2)
            codes4, _ = codes_and_tokens(r4)
            set_a, set_b = set(codes1), set(codes4)
            print(f"  device 1 holds {len(set_a)}, device 2 holds {len(set_b)}, "
                  f"union {len(set_a | set_b)}")
            check(bool(set_a) and bool(set_b),
                  f"D4: both sets are NON-EMPTY ({len(set_a)}, {len(set_b)}) -- "
                  "an empty set is disjoint from everything")
            check(not (set_a & set_b),
                  f"D4: their INTERSECTION IS EMPTY (shared={sorted(set_a & set_b)})")
            check(len(set_a | set_b) == len(set_a) + len(set_b),
                  f"D4: and the UNION has the size of the two added together "
                  f"({len(set_a | set_b)} vs {len(set_a) + len(set_b)}) -- "
                  "EQUALITY, because disjointness answers what is present and "
                  "only this answers what is in EXCESS")

            # ============================================================= D5
            banner("D5 - THE PER-TENANT LOCK, MEASURED DIRECTLY: a refill WAITS "
                   "for the OTHER code writer and for NOBODY ELSE")
            # WHY THIS CELL EXISTS RATHER THAN THE RACE BELOW, and it was
            # MEASURED rather than reasoned: with the lock deleted from
            # _lock_shop_for_code_assignment, D5b's barrier race stayed GREEN --
            # statuses [200, 200], blocks disjoint, whole suite exit 0. A start
            # barrier synchronises the REQUEST, and the window this lock closes
            # is a sub-millisecond SELECT sitting behind an auth round trip, so
            # the two critical sections essentially never overlap. The race is a
            # true statement about two requests and evidence about NOTHING to do
            # with the lock (lessons/
            # a-green-cell-is-evidence-about-the-assertion-not-the-claim.md).
            #
            # So the lock is measured by HOLDING SOMETHING and watching whether
            # the route waits. Two holds, and the pair is the evidence:
            #
            #   (1) hold the tenant row the way the OTHER CODE WRITER holds it
            #       -> the refill MUST wait. This is what a lock is for.
            #   (2) hold it the way an ORDINARY IN-FLIGHT WRITE for this shop
            #       holds it -- a FOR KEY SHARE taken by any child row's foreign
            #       key check -> the refill must NOT wait.
            #
            # CELL 2 IS WHAT PINS THE LOCK MODE, and it is the one that was got
            # wrong twice before it was got right. `tenants.id` is referenced by
            # EVERY tenant-scoped table, so every insert in the shop holds
            # FOR KEY SHARE on that row for the length of its transaction.
            # FOR UPDATE conflicts with FOR KEY SHARE and FOR NO KEY UPDATE does
            # not -- so under FOR UPDATE a refill stalls behind any bill being
            # written, and a bill being written stalls behind any refill, on
            # every sync pass from every device in the yard.
            #
            # AN EARLIER VERSION TIMED THE OTHER DIRECTION -- an unrelated write
            # made WHILE the refill was blocked -- and could not fail: a request
            # WAITING for a lock is holding nothing, so that cell was measuring
            # this script's own holder and not the route at all.
            LOCK_MODE = "FOR NO KEY UPDATE"
            hold_s = 2.0

            def refill_against(hold_sql: str, hold_args: tuple, dev: uuid.UUID):
                """Hold `hold_sql` open in its own transaction for hold_s, and
                time ONE refill against it.

                The holding transaction is ROLLED BACK, never committed: it
                exists to own a lock and must leave nothing behind.
                """
                taken, release = threading.Event(), threading.Event()
                err: dict = {}
                out: dict = {}

                def hold() -> None:
                    async def go() -> None:
                        conn = await asyncpg.connect(OWNER_DSN)
                        try:
                            tx = conn.transaction()
                            await tx.start()
                            try:
                                await conn.execute(
                                    "SELECT set_config('app.tenant_id', $1, true)",
                                    str(TENANT_A_ID))
                                await conn.execute(hold_sql, *hold_args)
                                taken.set()
                                while not release.is_set():
                                    await asyncio.sleep(0.05)
                            finally:
                                await tx.rollback()
                        finally:
                            await conn.close()
                    try:
                        asyncio.run(go())
                    except Exception as e:  # noqa: BLE001
                        err["e"] = e
                        taken.set()

                def call() -> None:
                    c = httpx.Client(timeout=90.0)
                    try:
                        started = time.perf_counter()
                        resp = refill(c, staff, dev)
                        out["ms"] = (time.perf_counter() - started) * 1000
                        out["status"] = resp.status_code
                        out["codes"] = codes_and_tokens(resp)[0]
                    except Exception as e:  # noqa: BLE001
                        out["error"] = repr(e)
                    finally:
                        c.close()

                holder = threading.Thread(target=hold)
                holder.start()
                taken.wait(timeout=15)
                caller = threading.Thread(target=call)
                caller.start()
                # NOT joined before the release: if the call blocks, joining here
                # would hold the lock open until its own timeout and turn a red
                # cell into a two-minute stall.
                time.sleep(hold_s)
                release.set()
                holder.join(timeout=15)
                caller.join(timeout=90)
                return float(out.get("ms", -1.0)), out, err

            # THE CONTROL FIRST, with NOTHING held, in the same run and on the
            # same route. Without it "the blocked call took two seconds" is
            # satisfied by a server that is simply slow.
            t0 = time.perf_counter()
            r_free = refill(client, staff, uuid.uuid4())
            free_ms = (time.perf_counter() - t0) * 1000
            print(f"  nothing held        : {free_ms:7.0f} ms  "
                  f"(status {r_free.status_code})")
            check(r_free.status_code == 200 and free_ms < hold_s * 1000 * 0.5,
                  f"D5 control: with NOTHING held the route answers 200 in "
                  f"{free_ms:.0f} ms, well inside the {hold_s:.1f}s hold -- so a "
                  "long time below is a WAIT and not a slow server")

            # ---- hold 1: the other code writer's lock. The refill MUST wait.
            writer_ms, writer_out, writer_err = refill_against(
                f"SELECT id FROM tenants {LOCK_MODE}", (), uuid.uuid4())
            print(f"  code writer's lock  : {writer_ms:7.0f} ms  "
                  f"(status {writer_out.get('status')}, held {hold_s:.1f}s)")
            check(not writer_err and writer_ms >= hold_s * 1000 * 0.75,
                  f"D5: with the tenant row held the way the OTHER CODE WRITER "
                  f"holds it, the refill WAITED ({writer_ms:.0f} ms against a "
                  f"{hold_s:.1f}s hold) -- it takes the lock BEFORE it derives "
                  f"anything (holder_err={writer_err.get('e')})")
            check(writer_ms - free_ms >= hold_s * 1000 * 0.7,
                  f"D5: and the DIFFERENCE is about the hold "
                  f"({writer_ms - free_ms:.0f} ms) -- asserted by DIRECTION "
                  "against the control rather than as an absolute, because two "
                  "wrong durations still differ")
            check(writer_out.get("status") == 200
                  and len(writer_out.get("codes") or []) == target_db,
                  f"D5: and the wait ENDED IN A NORMAL ANSWER -- status "
                  f"{writer_out.get('status')}, "
                  f"{len(writer_out.get('codes') or [])} codes against a target "
                  f"of {target_db}. A lock that turned a refill into a failure "
                  "would satisfy the two cells above")

            # ---- hold 2: an ORDINARY in-flight write for this shop. It must NOT.
            # A uom is a child of `tenants`, so inserting one takes FOR KEY SHARE
            # on the tenant row and holds it until the transaction ends -- which
            # is exactly what a bill on the weighbridge is doing while it is
            # being written. The transaction is rolled back, so no uom is left.
            other_ms, other_out, other_err = refill_against(
                "INSERT INTO uoms (tenant_id, code, name) VALUES ($1, $2, $3)",
                (TENANT_A_ID, f"ZZKS-{RUN}", f"key share probe {RUN}"),
                uuid.uuid4())
            print(f"  a bill being written: {other_ms:7.0f} ms  "
                  f"(status {other_out.get('status')}, held {hold_s:.1f}s)")
            check(not other_err and other_out.get("status") == 200
                  and 0 <= other_ms < hold_s * 1000 * 0.5,
                  f"D5: AND AN ORDINARY IN-FLIGHT WRITE FOR THE SAME SHOP DOES "
                  f"NOT STALL IT -- {other_ms:.0f} ms against a {hold_s:.1f}s "
                  f"hold, status {other_out.get('status')}. THIS CELL PINS THE "
                  "LOCK MODE. Every tenant-scoped INSERT holds FOR KEY SHARE on "
                  "the tenant row; FOR UPDATE conflicts with it and FOR NO KEY "
                  "UPDATE does not, so under FOR UPDATE this reads about "
                  f"{hold_s * 1000:.0f} ms and a refill waits behind every bill "
                  f"in the yard -- and every bill waits behind every refill "
                  f"(holder_err={other_err.get('e')})")
            check(len(other_out.get("codes") or []) == target_db,
                  f"D5: and that unblocked call was a REAL refill -- "
                  f"{len(other_out.get('codes') or [])} codes against a target "
                  f"of {target_db}, not a fast failure")

            # ============================================================ D5b
            banner("D5b - two refills at once behind a start barrier: a smoke "
                   "test, and NOT evidence about the lock")
            print("  MEASURED 2026-08-24: with FOR UPDATE deleted from the route,")
            print("  every cell in this block stayed GREEN. Read D5 for the lock.")
            dev3, dev4 = uuid.uuid4(), uuid.uuid4()
            barrier = threading.Barrier(2)
            race: list[tuple[int, list[str], float, float]] = []
            race_lock = threading.Lock()

            def racer(dev: uuid.UUID) -> None:
                # Its own client: sharing one would serialise on the connection
                # pool and the "race" would be two sequential requests in a
                # costume.
                c = httpx.Client(timeout=30.0)
                try:
                    barrier.wait(timeout=15)
                    started = time.perf_counter()
                    resp = refill(c, staff, dev)
                    ended = time.perf_counter()
                    cs, _ = codes_and_tokens(resp)
                    with race_lock:
                        race.append((resp.status_code, cs, started, ended))
                finally:
                    c.close()

            threads = [threading.Thread(target=racer, args=(d,))
                       for d in (dev3, dev4)]
            for t in threads:
                t.start()
            for t in threads:
                t.join(timeout=60)

            if len(race) != 2:
                check(False, f"D5b: both racers returned (got {len(race)})")
            else:
                (s1, c1, a1, b1t), (s2, c2, a2, b2t) = race
                overlap_ms = (min(b1t, b2t) - max(a1, a2)) * 1000
                print(f"    statuses={sorted([s1, s2])}  request windows "
                      f"overlapped by {overlap_ms:.1f} ms")
                # A concurrency test without printed overlap evidence proves
                # nothing about concurrency
                # (lessons/concurrency-tests-need-a-barrier.md) -- and THIS
                # overlap is between two REQUESTS, which is not the same thing as
                # an overlap between the two critical sections inside them. That
                # gap is why D5 above exists.
                check(overlap_ms > 0,
                      f"D5b: the two REQUEST windows overlapped "
                      f"({overlap_ms:.1f} ms). This says nothing about whether "
                      "the two derivations overlapped, which is the window the "
                      "lock closes and which D5 measures instead")
                check(s1 == 200 and s2 == 200,
                      f"D5b: neither refill got a 500 (statuses={[s1, s2]})")
                check(bool(c1) and bool(c2) and not (set(c1) & set(c2))
                      and len(set(c1) | set(c2)) == len(c1) + len(c2),
                      f"D5b: the two blocks are disjoint and their union is the "
                      f"sum of their sizes ({len(set(c1) | set(c2))} vs "
                      f"{len(c1) + len(c2)}), both non-empty")

            # ============================================================= D6
            banner("D6 - the quantity is NOT on the wire, in either direction")
            rows_before = reservation_rows(TENANT_A_ID)
            # A value no ordinary body or message can contain by accident, so
            # "it is absent" is a statement about the echo and not about luck.
            quantity = 987654321
            r6 = refill(client, staff, uuid.uuid4(), extra={"count": quantity})
            rows_after = reservation_rows(TENANT_A_ID)
            print(f"  status={r6.status_code}  body={r6.text.strip()[:200]}")
            check(r6.status_code == 422,
                  f"D6: a body carrying a quantity is REFUSED 422 "
                  f"(got {r6.status_code}) -- the field is not ignored, which "
                  "would leave a client believing in it")
            check(rows_after == rows_before,
                  f"D6: and nothing was minted ({rows_before} -> {rows_after})")
            check(str(quantity) not in r6.text and "count" in r6.text,
                  f"D6: the refusal NAMES the offending field and does not echo "
                  f"its value ({quantity}) -- the presence sibling is on the same "
                  "line, because an absence over an empty body is satisfied by "
                  "silence")

            # ============================================================= D7
            banner("D7 - the gate: STAFF may call it, an unauthenticated caller "
                   "may not")
            anon = client.post(f"{BASE}{REFILL_PATH}",
                               json={"device_id": str(uuid.uuid4())})
            check(anon.status_code == 401,
                  f"D7: no token -> 401 (got {anon.status_code})")
            r7 = refill(client, admin, uuid.uuid4())
            check(r7.status_code == 200,
                  f"D7 presence sibling: an ADMIN token is also accepted "
                  f"(got {r7.status_code}) -- the gate was NARROWED to "
                  "get_principal, not moved to staff-only")

            # ============================================================= D8
            # NOT "shares no code": codes are unique PER TENANT, so shop B's
            # S003 and shop A's S003 are two different reservations and both are
            # correct. What isolation means here is that neither context can
            # READ the other's row.
            banner("D8 - RLS: another shop is topped up in its own right and "
                   "cannot see a row of this one's")
            staff_b = login(client, TENANT_B_ID, STAFF_USERNAME,
                            TENANT_B_STAFF_PASSWORD)
            # The SAME device identity, deliberately. Device ids are not
            # tenant-scoped and nothing stops a caller reusing one, so this is
            # the sharpest form of the question.
            r8 = refill(client, staff_b, dev1)
            codes8, _ = codes_and_tokens(r8)
            b_sees_a = fetchval(
                TENANT_B_ID,
                "SELECT count(*) FROM seller_code_reservations WHERE token = $1",
                sentinel_token)
            a_sees_a = fetchval(
                TENANT_A_ID,
                "SELECT count(*) FROM seller_code_reservations WHERE token = $1",
                sentinel_token)
            print(f"  shop B holds {len(codes8)} for the same device id; shop B "
                  f"sees {b_sees_a} of shop A's sentinel, shop A sees {a_sees_a}")
            check(r8.status_code == 200 and bool(codes8),
                  f"D8: shop B is topped up in its own right "
                  f"({len(codes8)} codes)")
            check(b_sees_a == 0 and a_sees_a == 1,
                  "D8: shop B's context CANNOT see shop A's reservation and "
                  "shop A's context CAN -- the presence sibling is on the same "
                  "line, because a zero from a query that matches nothing "
                  "anywhere is indistinguishable from isolation")

            banner("WHAT THIS RUN CANNOT SEE")
            print("  - THAT A RESERVATION IS EVER SPENT. Nothing in this commit")
            print("    writes `spent` through any route. C2 asserts the CHECK by")
            print("    inserting directly; the create path that will produce that")
            print("    row is a separate change with its own proof.")
            print("  - THAT POST /sellers REFUSES A RESERVED CODE, or that the")
            print("    minting path skips one. Both holes are OPEN on this")
            print("    commit, deliberately and by construction: create_seller")
            print("    still derives from `sellers` alone. D3 measures that the")
            print("    REFILL derives above both tables, which is a different")
            print("    writer.")
            print("  - THAT THE TOKEN IS UNGUESSABLE. D1 refuses a counter, a")
            print("    duplicate and a hash of the code. Entropy is not")
            print("    measurable from outside and no cell here claims it.")
            print("  - HOW MANY CODES A DEVICE SHOULD HOLD. The mechanism is")
            print("    measured; 20 is an assumption migration 0012 labels as")
            print("    one, and nothing here can move it.")
            print("  - A SECOND DEVICE THAT IS REALLY A SECOND DEVICE. Every")
            print("    identity here is a uuid this process generated. Nothing")
            print("    authenticates a device, which is a recorded bound.")
            print("  - TWO DERIVATIONS ACTUALLY OVERLAPPING. D5b overlaps two")
            print("    REQUESTS and D5 measures that the route waits on a lock")
            print("    somebody else holds. Neither of them catches the two")
            print("    critical sections landing in the same instant, which is")
            print("    the event the lock exists for and which no test here")
            print("    stages -- MEASURED: deleting FOR UPDATE left D5b green.")
            print("  - ANY CLIENT. Nothing under mobile/ is touched or executed.")
    finally:
        # Each cleanup in its own try/except: a finally block that aborts halfway
        # leaves the fixture in a state nobody chose and no output explaining it
        # (lessons/proof-must-run-twice.md, third amendment).
        if original_target is not None:
            try:
                execute(TENANT_A_ID,
                        "UPDATE tenants SET seller_code_target_holding = $1",
                        original_target)
                check(target_in_db(TENANT_A_ID) == original_target,
                      f"cleanup: the shop's target holding is back at "
                      f"{original_target}")
            except Exception as e:  # noqa: BLE001
                check(False, f"cleanup: could not restore the target holding: {e}")
        try:
            proc.terminate()
            proc.wait(timeout=15)
        except subprocess.TimeoutExpired:
            proc.kill()
        except Exception as e:  # noqa: BLE001
            print(f"  (could not stop the uvicorn child: {e})")
        log.close()

    banner("SUMMARY")
    if failures:
        for f in failures:
            print(f"  FAILED: {f}")
    print(f"  failures: {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    rc = main()
    print(f"PROVE_SELLER_CODE_RESERVATIONS_EXIT={rc}")
    sys.exit(rc)
