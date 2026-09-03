"""Prove STAFF can create a seller, that the SERVER assigns the code, that the
row records WHO created it, and that the gate was NARROWED and not opened.

    python scripts/prove_seller_create.py --database recycle_p18a_scratch

REFUSES TO RUN AGAINST THE LIVE DATABASE, and the refusal is the point. This
script CREATES SELLERS AND POSTS A BILL through the real path. `is_active`
retires a seller, it does not remove one, and hard rule 5 forbids deleting the
bill — so every run leaves permanent rows in whatever database it is pointed at.
Two mutation runs proving `created_by` once left ten unremovable bills in the dev
database (lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-database.md);
sellers accumulate the same way. DEV IS NOT SCRATCH.

IT STARTS ITS OWN SERVER, and that is the residual this file exists to close.
An API process is bound to its database AT STARTUP, so a proof correctly pointed
at scratch while a server runs against dev would drive the REAL PATH INTO DEV and
report a scratch run. The child uvicorn is launched with APP_DATABASE_URL and
DIRECTORY_DATABASE_URL overridden IN THE CHILD'S ENVIRONMENT -- a dict, never a
command line, because every shell command on this box lands verbatim in
.claude/hooks/*.log and these URLs carry passwords. The URLs are derived from
.env by swapping only the database NAME, so no credential is typed in this file.

AND THE BINDING IS MEASURED RATHER THAN INTENDED (B2 below). A SENTINEL seller
carrying this run's own uuid is written into the scratch database BEFORE the
server starts, and the server is required to return it. No other database on
this cluster can hold that row: it did not exist anywhere until this run wrote
it. A server bound to dev would answer B1 (the route is declared -- it is
declared in both) and fail B2.

REPEATABLE. Run it twice with no reseed; it passes twice
(lessons/proof-must-run-twice.md). Every key is scoped to a per-run uuid, and
the one thing this proof cannot choose -- the code the SERVER assigns -- is
asserted RELATIVE to the maximum read out of Postgres immediately before the
call, never against a fixed string.

THE EXIT LINE, AND WHAT SUPPRESSES IT. main() prints
`PROVE_SELLER_CREATE_EXIT=<n>` from the same integer it returns. That line is
ABSENT if the script dies before the summary -- uvicorn failing to start, a
database being unreachable, an unhandled exception. THE ABSENCE IS THE SIGNAL:
a reader scanning for a number and finding none has NOT found a pass.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import socket
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

# Resolved from THIS file and not the cwd, the placement
# lessons/config-defaults-must-fail-closed.md records.
load_dotenv()

import httpx  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

from app.bills import _be_year  # noqa: E402
from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    PRODUCT_A_ID,
    STAFF_USERNAME,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
    TENANT_A_STAFF_PASSWORD,
)

RUN = uuid.uuid4().hex[:8]
BE_YEAR = _be_year(datetime.now(tz=timezone.utc))
BASE = ""            # set in main(), once the port is known
OWNER_URL = ""       # set in main(): the read-back connection, owner role

# The shape the server assigns. Held HERE as an independent expectation rather
# than imported from master.py: a checker that shares the constant it checks
# agrees with the code by construction
# (lessons/a-checker-must-not-share-the-code-it-checks.md).
ASSIGNED_SHAPE = re.compile(r"^S(\d+)$")

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


def detail_of(r: httpx.Response) -> dict:
    """The refusal envelope, or {} -- never a crash, and never a default that
    makes an assertion vacuously true. Every caller asserts a VALUE out of this,
    so {} fails rather than passes."""
    try:
        d = r.json().get("detail")
    except Exception:  # noqa: BLE001 - a body that will not parse is not a detail
        return {}
    return d if isinstance(d, dict) else {}


def body_of(r: httpx.Response) -> dict:
    """The JSON object, or {} -- never a raise. Same discipline as detail_of:
    every caller asserts a VALUE out of it, so an unparseable body fails."""
    try:
        b = r.json()
    except Exception:  # noqa: BLE001
        return {}
    return b if isinstance(b, dict) else {}


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def login(client: httpx.Client, username: str, password: str) -> str:
    r = client.post(f"{BASE}/auth/login", json={
        "tenant_id": str(TENANT_A_ID), "username": username, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


# ---------------------------------------------------------------------------
# Postgres, read as the OWNER with tenant context set -- the same primitive the
# server uses. FORCE ROW LEVEL SECURITY applies to the owner too, so without
# set_config these reads would return zero rows and every "absent" assertion
# would be vacuously true (mechanism 9 of
# lessons/a-check-that-never-went-red-was-never-observed.md).
# ---------------------------------------------------------------------------
async def _in_tenant(sql: str, params: dict | None = None):
    eng = create_async_engine(OWNER_URL)
    try:
        async with eng.connect() as conn:
            async with conn.begin():
                await conn.execute(
                    text("SELECT set_config('app.tenant_id', :t, true)"),
                    {"t": str(TENANT_A_ID)},
                )
                return (await conn.execute(text(sql), params or {})).mappings().all()
    finally:
        await eng.dispose()


def sql(query: str, params: dict | None = None) -> list:
    return asyncio.run(_in_tenant(query, params))


def max_assigned_number() -> int:
    """The highest S<n> tenant A currently holds, 0 if none. READ FROM POSTGRES,
    because the number the server will assign is a function of the database's
    state and not of anything this script chose.

    IT READS BOTH TABLES SINCE MIGRATION 0012, and the change is to the RULE
    rather than to this script's opinion of it. `sellers` stopped being the whole
    of the assigned code space the day a seller code could be RESERVED to a
    handset that has not come back: such a code is one that handset will write
    into `sellers`, so a server that derived above `sellers` alone would propose
    it to somebody at the counter. Reading one table here would now assert the
    OLD rule against a server that correctly follows the new one -- which is
    exactly how this cell went red: it expected S845 while the server minted
    S1010 above a thousand reservations, and the server was right.

    THIS IS STILL THIS CHECKER'S OWN STATEMENT OF THE RULE. The SQL is written
    out here rather than imported from app.master, so a checker that agrees with
    the code by construction is still avoided
    (lessons/a-checker-must-not-share-the-code-it-checks.md); what is shared is
    the DECISION, which is in ROADMAP under P1.8.
    """
    rows = sql("SELECT greatest("
               " coalesce((SELECT max(substring(code from 2)::numeric)"
               "             FROM sellers WHERE code ~ '^S[0-9]+$'), 0),"
               " coalesce((SELECT max(substring(code from 2)::numeric)"
               "             FROM seller_code_reservations"
               "            WHERE code ~ '^S[0-9]+$'), 0)) AS m")
    m = rows[0]["m"]
    return 0 if m is None else int(m)


def as_uuid(value: object) -> uuid.UUID | None:
    """A uuid, or None -- NEVER a raise.

    MEASURED, 2026-08-17, and this guard is why it exists. The first disproof run
    reverted the gate, cells 1 and 2 were correctly refused 403, and the script
    then died on `uuid.UUID(None)` INSIDE cell 5. Cells 6 and 7 never ran and no
    PROVE_SELLER_CREATE_EXIT line was printed at all. A disproof whose whole job
    is to name WHICH cells move cannot stop halfway: a crash and a red suite are
    different results, and only one of them is a measurement.
    """
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return None


def stored_code(seller_id: object) -> str | None:
    """The code Postgres holds for this row. None if there is no such row -- and
    None if the caller had no id to give, which is the same answer for a
    different reason. Every caller of this pairs it with a NON-NULL assertion on
    the value it expected, so `None == None` cannot pass as agreement."""
    sid = as_uuid(seller_id)
    if sid is None:
        return None
    rows = sql("SELECT code FROM sellers WHERE id = :i", {"i": sid})
    return rows[0]["code"] if rows else None


def seller_created_by(seller_id: object) -> uuid.UUID | None:
    """The author Postgres holds for this row, as a uuid.

    None if there is no such row, and None if the caller had no id to give --
    the same answer for two different reasons. That is exactly why every caller
    pairs it with a NON-NULL conjunct ON THE SAME LINE as its comparison: a cell
    reading `None == None` prints [ok] under a failed create, which this
    repository has already paid for once in stored_code above.

    READ OUT OF POSTGRES, never off the response. `created_by` is not in
    _seller_payload at all, but the argument would hold even if it were: a
    response echoing a value proves what the handler SAID, not what the table
    HOLDS.
    """
    sid = as_uuid(seller_id)
    if sid is None:
        return None
    rows = sql("SELECT created_by FROM sellers WHERE id = :i", {"i": sid})
    return as_uuid(rows[0]["created_by"]) if rows else None


def rows_with_code(code: str) -> int:
    return int(sql("SELECT count(*) AS c FROM sellers WHERE code = :c",
                   {"c": code})[0]["c"])


def seed_sentinel(code: str) -> None:
    """A row only THIS database can have, written BEFORE the server starts.

    It is a row the product itself could produce -- a seller with a code and a
    name -- so it cannot be mistaken for a shape no handler would ever write.
    """
    asyncio.run(_seed_sentinel(code))


async def _seed_sentinel(code: str) -> None:
    eng = create_async_engine(OWNER_URL)
    try:
        async with eng.begin() as conn:
            await conn.execute(
                text("SELECT set_config('app.tenant_id', :t, true)"),
                {"t": str(TENANT_A_ID)},
            )
            # sellers is audited (0017); this proof is a system writer.
            await conn.execute(
                text("SELECT set_config('app.actor_id', :a, true)"),
                {"a": "00000000-0000-0000-0000-000000000000"},
            )
            await conn.execute(
                text("SELECT set_config('app.actor_username', :u, true)"),
                {"u": "system:prove_seller_create"},
            )
            await conn.execute(
                text("INSERT INTO sellers (tenant_id, code, name, grade)"
                     " VALUES (:t, :c, :n, 'B')"),
                {"t": TENANT_A_ID, "c": code, "n": f"binding sentinel {RUN}"},
            )
    finally:
        await eng.dispose()


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


def bill_body(seller_id: str, idem: str) -> dict:
    """One line of FE-STEEL. The seller created in cell 1 carries grade B, whose
    tier is seeded at 15.00, so list_price resolves and the bill is priceable."""
    return {
        "id": str(uuid.uuid4()),
        "seller_id": seller_id,
        "vehicle_no": f"P18A-{RUN}",
        "device_created_at": datetime.now(tz=timezone.utc).isoformat(),
        "idempotency_key": f"p18a-{RUN}-bill-1",
        "items": [{
            "id": str(uuid.uuid4()),
            "product_id": str(PRODUCT_A_ID),
            "line_no": 1,
            "gross_weight": "1.000",
            "tare_weight": "0.000",
            "net_weight": "1.000",
            "unit_price": "15.00",
        }],
    }


def main() -> int:
    ap = argparse.ArgumentParser(
        description="Prove staff seller creation and the server-assigned code.")
    ap.add_argument("--database", required=True,
                    help="a SCRATCH database. This script writes sellers and a "
                         "bill through the real path; neither can be removed.")
    args = ap.parse_args()

    app_live = make_url(os.environ["APP_DATABASE_URL"])
    dir_live = make_url(os.environ["DIRECTORY_DATABASE_URL"])
    owner_live = make_url(os.environ["MIGRATION_DATABASE_URL"])
    live_name = app_live.database

    if args.database == live_name:
        print(f"REFUSED: --database {args.database!r} is the LIVE database from\n"
              "  APP_DATABASE_URL. This script CREATES SELLERS and POSTS A BILL\n"
              "  through the real path. is_active retires a seller rather than\n"
              "  removing it, and hard rule 5 forbids deleting the bill, so every\n"
              "  run leaves permanent rows. Restore a copy first:\n"
              "    python scripts/backup_db.py\n"
              "    python scripts/restore_db.py <dir> --into recycle_p18a_scratch")
        return 2

    app_url = app_live.set(database=args.database)
    dir_url = dir_live.set(database=args.database)
    global OWNER_URL
    OWNER_URL = owner_live.set(database=args.database).render_as_string(
        hide_password=False)

    sentinel_code = f"ZZ-BIND-{RUN}"
    supplied_code = f"P18A-{RUN}"          # a shop's OWN paper code (S6)
    admin_code = f"P18A-ADMIN-{RUN}"

    print("=== prove_seller_create ===")
    print(f"  run tag            : {RUN}")
    print(f"  scratch database   : {args.database}")
    print(f"  live database      : {live_name!r} -- not touched by this script")
    print(f"  be_year            : {BE_YEAR}")

    # ---------------------------------------------------------------- sentinel
    banner("B0 - the binding sentinel, written BEFORE the server starts")
    seed_sentinel(sentinel_code)
    check(rows_with_code(sentinel_code) == 1,
          f"B0: the sentinel {sentinel_code} exists in {args.database}")
    _srows = sql("SELECT id FROM sellers WHERE code = :c", {"c": sentinel_code})
    sentinel_id = str(_srows[0]["id"]) if _srows else None
    print("       it carries this run's uuid, so no other database on this")
    print("       cluster can hold it. That is what makes B2 discriminating.")

    env = dict(os.environ)
    env["APP_DATABASE_URL"] = app_url.render_as_string(hide_password=False)
    env["DIRECTORY_DATABASE_URL"] = dir_url.render_as_string(hide_password=False)
    env["PYTHONUNBUFFERED"] = "1"

    server_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    port = free_port()
    global BASE
    BASE = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(  # noqa: SIM115 - closed in finally
        prefix="prove_seller_create_uvicorn_", suffix=".log", delete=False, mode="w+")
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

        with httpx.Client(timeout=20.0) as client:
            # ======================================================== B1 / B2
            banner("B1 - the route is DECLARED by the server this proof drives")
            paths = declared_paths()
            check("/sellers" in paths,
                  f"B1: /sellers is declared in /openapi.json (paths={len(paths)})")
            check("post" in {m.lower() for m in paths.get("/sellers", {})},
                  "B1: and it declares a POST -- a carefully written refusal "
                  "assertion is satisfied by a route's ABSENCE, so this is "
                  "checked before anything below is believed")
            for p in ("/products/{product_id}/prices/{grade}",
                      "/sellers/{seller_id}", "/sellers/{seller_id}/deactivate",
                      "/bills"):
                check(p in paths, f"B1: {p} is declared (cells 3-5 depend on it)")

            token_staff = login(client, STAFF_USERNAME, TENANT_A_STAFF_PASSWORD)
            token_admin = login(client, ADMIN_USERNAME, TENANT_A_PASSWORD)
            who = client.get(f"{BASE}/whoami", headers=auth(token_staff))
            print(f"  staff /whoami -> {who.status_code} {who.text.strip()[:160]}")
            check(who.status_code == 200 and who.json().get("role") == "staff",
                  f"B1: the staff token really is role=staff "
                  f"({who.json().get('role') if who.status_code == 200 else who.status_code})")
            # THE ADMIN SIDE OF CELL 8's DIFFERENTIAL, resolved by the SERVER for
            # this run. Both identities are taken from /whoami rather than from
            # seeddata or a literal: a difference-check whose sides are constants
            # measures the constants
            # (lessons/a-differential-control-is-only-as-good-as-its-weaker-side.md).
            who_admin = client.get(f"{BASE}/whoami", headers=auth(token_admin))
            print(f"  admin /whoami -> {who_admin.status_code} "
                  f"{who_admin.text.strip()[:160]}")
            check(who_admin.status_code == 200 and
                  body_of(who_admin).get("role") == "admin",
                  f"B1: the admin token really is role=admin "
                  f"({body_of(who_admin).get('role')!r})")
            staff_uid = as_uuid(body_of(who).get("user_id"))
            admin_uid = as_uuid(body_of(who_admin).get("user_id"))

            banner("B2 - WHICH DATABASE THE SERVER IS BOUND TO, measured")
            r = client.get(f"{BASE}/sellers?include_inactive=true",
                           headers=auth(token_admin))
            codes = {s["code"] for s in r.json().get("sellers", [])}
            check(r.status_code == 200 and len(codes) > 0,
                  f"B2: the roster came back non-empty ({r.status_code}, "
                  f"{len(codes)} sellers) -- an empty list would make the next "
                  "cell vacuous")
            check(sentinel_code in codes,
                  f"B2: the server returned the sentinel {sentinel_code}, which "
                  f"exists ONLY in {args.database}. The server this proof drives "
                  "is bound to the scratch database, observed rather than intended")

            # ============================================================ 1
            banner("CELL 1 - STAFF creates a seller with NO code; the SERVER "
                   "assigns one")
            before = max_assigned_number()
            body1 = {"name": f"ผู้ขายใหม่ {RUN}", "grade": "B"}
            check("code" not in body1,
                  "cell1: the request body carries NO `code` key -- asserted on "
                  "the object that is about to be sent, not described in prose")
            print(f"  highest S<n> in Postgres BEFORE the call: {before}")
            r1 = client.post(f"{BASE}/sellers", headers=auth(token_staff), json=body1)
            print(f"  status={r1.status_code} body={r1.text.strip()[:240]}")
            check(r1.status_code == 201, f"cell1: status is 201 (got {r1.status_code})")
            b1 = body_of(r1) if r1.status_code == 201 else {}
            assigned = b1.get("code")
            m = ASSIGNED_SHAPE.fullmatch(assigned or "")
            check(m is not None,
                  f"cell1: the response carries a server-assigned code of the "
                  f"shape S<n> ({assigned!r})")
            # RELATIVE, never absolute: this script runs twice with no reseed and
            # the number moves every run (lessons/proof-must-run-twice.md).
            check(m is not None and int(m.group(1)) == before + 1,
                  f"cell1: the assigned number is the one after the highest that "
                  f"existed IN EITHER TABLE ({assigned!r} vs before={before}) -- "
                  "a reserved code is one a handset will write into `sellers`, so "
                  "the sequence the server continues spans both")
            seller1_id = b1.get("id")
            # `assigned is not None` IS THE CELL, not decoration. Without it a
            # refused create leaves assigned=None and stored_code(None)=None, and
            # `None == None` printed [ok] under a 403 -- measured on the first
            # disproof run, in this exact line.
            check(assigned is not None and stored_code(seller1_id) == assigned,
                  f"cell1: and Postgres stores that same code for the new row "
                  f"(db={stored_code(seller1_id)!r} response={assigned!r})")

            # ============================================================ 2
            banner("CELL 2 - STAFF creates a seller WITH a code; the code is kept")
            body2 = {"code": supplied_code, "name": f"ร้านพี่แดง {RUN}", "grade": "A"}
            r2 = client.post(f"{BASE}/sellers", headers=auth(token_staff), json=body2)
            print(f"  status={r2.status_code} body={r2.text.strip()[:240]}")
            check(r2.status_code == 201, f"cell2: status is 201 (got {r2.status_code})")
            seller2_id = body_of(r2).get("id") if r2.status_code == 201 else None
            # READ OUT OF POSTGRES. A response echoing the input proves nothing
            # about what was stored -- the server could have overwritten the code
            # on its way to the table and still echoed what it was handed.
            in_db = stored_code(seller2_id) if seller2_id else None
            print(f"  code stored in Postgres for {seller2_id}: {in_db!r}")
            check(in_db == supplied_code,
                  f"cell2: the STORED code is the one supplied "
                  f"({in_db!r} == {supplied_code!r}), read out of Postgres")
            check(ASSIGNED_SHAPE.fullmatch(supplied_code) is None,
                  "cell2: the supplied code is deliberately NOT of the assigned "
                  "shape, so cell 1's counter cannot have produced it by accident")

            # ============================================================ 3
            banner("CELL 3 - a bill for cell 1's seller posts and gets a doc_no")
            r3 = client.post(f"{BASE}/bills", headers=auth(token_staff),
                             json=bill_body(seller1_id, RUN))
            b3 = body_of(r3) if r3.status_code in (200, 201) else {}
            print(f"  status={r3.status_code} doc_no={b3.get('doc_no')} "
                  f"total={b3.get('total_amount')}")
            check(r3.status_code == 201, f"cell3: status is 201 (got {r3.status_code}"
                                         f" body={r3.text.strip()[:200]})")
            check(re.fullmatch(rf"B-{BE_YEAR}-\d+", b3.get("doc_no") or "") is not None,
                  f"cell3: the bill came back with a doc_no of the shape "
                  f"B-{BE_YEAR}-<seq> ({b3.get('doc_no')!r})")
            check(seller1_id is not None and b3.get("seller_id") == seller1_id,
                  f"cell3: and it is a bill for the seller cell 1 created "
                  f"(bill.seller_id={b3.get('seller_id')!r} cell1={seller1_id!r}) "
                  "-- the non-null guard is the cell: two Nones agreeing is not "
                  "a match")

            # ============================================================ 4
            banner("CELL 4 - CONTROL: the SAME staff token is refused on a price "
                   "write")
            r4 = client.put(
                f"{BASE}/products/{PRODUCT_A_ID}/prices/B",
                headers=auth(token_staff), json={"price": "999.00"})
            print(f"  status={r4.status_code} body={r4.text.strip()[:240]}")
            check(r4.status_code == 403, f"cell4: status is 403 (got {r4.status_code})")
            # THE CODE, NOT ONLY THE STATUS. One require_admin answers
            # admin_required for every admin path, so a status alone cannot say
            # WHICH rule refused -- and a 403 from anything else would satisfy a
            # status-only cell (mechanism 7 of
            # lessons/a-check-that-never-went-red-was-never-observed.md).
            check(detail_of(r4).get("code") == "admin_required",
                  f"cell4: the refusal names admin_required "
                  f"({detail_of(r4).get('code')!r})")
            check(detail_of(r4).get("actual_role") == "staff",
                  f"cell4: and it names the role that was refused "
                  f"({detail_of(r4).get('actual_role')!r})")
            price_now = sql("SELECT price FROM product_prices WHERE product_id = :p"
                            " AND grade = 'B'", {"p": PRODUCT_A_ID})
            check(bool(price_now) and str(price_now[0]["price"]) != "999.00",
                  f"cell4: and the price in Postgres is unchanged "
                  f"({price_now[0]['price'] if price_now else 'NO ROW'}) -- a 403 "
                  "that had already written would still be a 403")

            # ============================================================ 5
            banner("CELL 5 - CONTROL: the SAME staff token is refused on PATCH "
                   "/sellers/{id} and on deactivate")
            # THE TARGET MUST NOT DEPEND ON CELLS 1-2 SUCCEEDING. Under the
            # disproof they are refused, seller2_id is None, and a PATCH to
            # /sellers/None is a 422 from the path validator -- a red cell about
            # a URL rather than about the gate. The sentinel row always exists,
            # so cells 4-7 keep measuring the thing they are named for whatever
            # happened above them.
            patch_target = seller2_id or sentinel_id
            print(f"  target seller: {patch_target}"
                  f"{'  (sentinel: cell 2 did not create one)' if not seller2_id else ''}")
            r5a = client.patch(f"{BASE}/sellers/{patch_target}",
                               headers=auth(token_staff), json={"name": "renamed"})
            r5b = client.post(f"{BASE}/sellers/{patch_target}/deactivate",
                              headers=auth(token_staff))
            print(f"  PATCH      status={r5a.status_code} {r5a.text.strip()[:160]}")
            print(f"  deactivate status={r5b.status_code} {r5b.text.strip()[:160]}")
            check(r5a.status_code == 403 and
                  detail_of(r5a).get("code") == "admin_required",
                  f"cell5: PATCH /sellers/{{id}} is refused admin_required "
                  f"({r5a.status_code}, {detail_of(r5a).get('code')!r}) -- if this "
                  "now succeeds the gate was OPENED, not narrowed")
            check(r5b.status_code == 403 and
                  detail_of(r5b).get("code") == "admin_required",
                  f"cell5: POST /sellers/{{id}}/deactivate is refused "
                  f"admin_required ({r5b.status_code}, "
                  f"{detail_of(r5b).get('code')!r})")
            after5 = sql("SELECT name, is_active FROM sellers WHERE id = :i",
                         {"i": as_uuid(patch_target)}) if as_uuid(patch_target) else []
            check(bool(after5) and after5[0]["name"] != "renamed"
                  and after5[0]["is_active"] is True,
                  f"cell5: and Postgres shows the row neither renamed nor retired "
                  f"({after5[0]['name']!r}, is_active={after5[0]['is_active']})"
                  if after5 else
                  f"cell5: NO ROW to read back for {patch_target!r} -- the "
                  "refusals above are unverified at the database")

            # ============================================================ 6
            banner("CELL 6 - CONTROL: an ADMIN token still creates a seller, and "
                   "still owns the routes staff was refused")
            r6 = client.post(f"{BASE}/sellers", headers=auth(token_admin),
                             json={"code": admin_code, "name": f"แอดมินสร้าง {RUN}",
                                   "grade": "C"})
            print(f"  create     status={r6.status_code} {r6.text.strip()[:200]}")
            check(r6.status_code == 201,
                  f"cell6: admin create is 201 (got {r6.status_code}) -- the "
                  "change must not have traded one caller for another")
            admin_seller_id = body_of(r6).get("id") if r6.status_code == 201 else None
            r6b = client.post(f"{BASE}/sellers", headers=auth(token_admin),
                              json={"name": f"แอดมินไม่ใส่รหัส {RUN}", "grade": "C"})
            check(r6b.status_code == 201 and
                  ASSIGNED_SHAPE.fullmatch(body_of(r6b).get("code") or "") is not None,
                  f"cell6: admin also gets a server-assigned code when none is "
                  f"supplied ({r6b.status_code}, {body_of(r6b).get('code')!r})")
            # THE OTHER HALF OF CELL 5. Without this, "staff is refused" is
            # satisfied by a route that refuses EVERYONE -- a broken route and a
            # narrowed gate produce the same 403 for staff.
            r6c = client.patch(f"{BASE}/sellers/{admin_seller_id}",
                               headers=auth(token_admin), json={"name": "renamed"})
            r6d = client.post(f"{BASE}/sellers/{admin_seller_id}/deactivate",
                              headers=auth(token_admin))
            r6e = client.post(f"{BASE}/sellers/{admin_seller_id}/activate",
                              headers=auth(token_admin))
            print(f"  PATCH      status={r6c.status_code}")
            print(f"  deactivate status={r6d.status_code}  activate "
                  f"status={r6e.status_code}")
            check(r6c.status_code == 200,
                  f"cell6: an ADMIN can still PATCH a seller ({r6c.status_code}) "
                  "-- so cell 5's 403 is a role refusal, not a dead route")
            check(r6d.status_code == 200 and r6e.status_code == 200,
                  f"cell6: an ADMIN can still deactivate and reactivate one "
                  f"({r6d.status_code}, {r6e.status_code}) -- same argument")

            # ============================================================ 7
            banner("CELL 7 - a duplicate SUPPLIED code is 409 duplicate_code, and "
                   "writes NO row")
            rows_before = rows_with_code(supplied_code)
            r7 = client.post(f"{BASE}/sellers", headers=auth(token_staff),
                             json={"code": supplied_code,
                                   "name": f"ซ้ำ {RUN}", "grade": "B"})
            rows_after = rows_with_code(supplied_code)
            print(f"  status={r7.status_code} body={r7.text.strip()[:240]}")
            print(f"  rows with code {supplied_code!r}: before={rows_before} "
                  f"after={rows_after}")
            check(r7.status_code == 409, f"cell7: status is 409 (got {r7.status_code})")
            check(detail_of(r7).get("code") == "duplicate_code",
                  f"cell7: the refusal names duplicate_code "
                  f"({detail_of(r7).get('code')!r}) -- NOT the assigner's "
                  "code_assignment_failed, and not a bare status")
            check(rows_before == 1 and rows_after == 1,
                  f"cell7: no second row was written (before={rows_before}, "
                  f"after={rows_after}), counted in Postgres either side")

            # ============================================================ 8
            banner("CELL 8 - sellers.created_by names the SESSION that created "
                   "the row, over TWO real principals")
            # WHY THE ADMIN ROW IS HERE AND NOT A SECOND NON-NULL CHECK. A cell
            # asserting only "the staff row is not null" passes over a column
            # storing the tenant id, the seller's own id, or one hardcoded user;
            # so does "the staff row equals staff" if staff is the only principal
            # in the comparison. TWO rows created by TWO different principals,
            # each required to name ITS OWN creator, is refused by every single
            # constant a mutation could write -- one constant is wrong for at
            # least one of the two rows
            # (lessons/a-green-cell-is-evidence-about-the-assertion-not-the-claim.md,
            # whose first mechanism is a difference-check satisfied by a wrong
            # non-null value).
            print(f"  staff user_id (server, /whoami): {staff_uid}")
            print(f"  admin user_id (server, /whoami): {admin_uid}")
            check(staff_uid is not None and admin_uid is not None
                  and staff_uid != admin_uid,
                  f"cell8: the two principals are REAL and DISTINCT "
                  f"(staff={staff_uid} admin={admin_uid}) -- the weaker side of "
                  "the differential, checked first: if these were one identity "
                  "both assertions below would hold over a broken column")
            cb_staff = seller_created_by(seller1_id)
            cb_admin = seller_created_by(admin_seller_id)
            print(f"  sellers.created_by, STAFF-created row {seller1_id}: "
                  f"{cb_staff}")
            print(f"  sellers.created_by, ADMIN-created row {admin_seller_id}: "
                  f"{cb_admin}")
            check(cb_staff is not None and cb_staff == staff_uid
                  and cb_staff != admin_uid,
                  f"cell8: the STAFF-created seller records the STAFF user "
                  f"(db={cb_staff} staff={staff_uid} admin={admin_uid}) -- read "
                  "out of Postgres, and the non-null conjunct is ON THIS LINE "
                  "because two Nones agreeing prints [ok] under a failed create")
            check(cb_admin is not None and cb_admin == admin_uid
                  and cb_admin != staff_uid,
                  f"cell8: the ADMIN-created seller records the ADMIN user "
                  f"(db={cb_admin} admin={admin_uid} staff={staff_uid}) -- the "
                  "other side, and the reason a single wrong constant cannot "
                  "satisfy this pair")
            # THE SENTINEL IS THE NEGATIVE HALF. It was INSERTed directly, before
            # any server existed, so its author is NULL -- and it must stay NULL.
            # Migration 0011 is not retroactive and nothing backfills; a value
            # here would mean something had invented one.
            cb_sentinel = seller_created_by(sentinel_id)
            check(as_uuid(sentinel_id) is not None and cb_sentinel is None,
                  f"cell8: the directly-INSERTed sentinel {sentinel_code} still "
                  f"has NO author (created_by={cb_sentinel}) -- nothing "
                  "retroactive, and the row id was real (id="
                  f"{sentinel_id}) so this is not an absent row reading as a "
                  "clean NULL")

            banner("WHAT THIS RUN CANNOT SEE")
            print("  - That any CLIENT can call this route. Nothing under mobile/")
            print("    is touched or executed by this script.")
            print("  - That any operator can reach it. There is no screen.")
            print("  - WHO created any seller that already existed. Migration 0011")
            print("    is not retroactive: every seller written before it stays")
            print("    authorless permanently, and cell 8 proves the column only")
            print("    for rows this run created through POST /sellers.")
            print("  - WHO last EDITED a seller. PATCH /sellers keeps")
            print("    require_admin and does not touch created_by, so an admin")
            print("    edit leaves the staff creator named. There is no")
            print("    last-modified-by column and this run asserts nothing")
            print("    about one.")
            print("  - Two phones racing for real. The concurrency argument is")
            print("    about the unique index being the arbiter; this run makes")
            print("    the calls in sequence and does NOT exercise the retry.")
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
    print(f"PROVE_SELLER_CREATE_EXIT={rc}")
    sys.exit(rc)
