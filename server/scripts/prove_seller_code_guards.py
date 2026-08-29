"""Prove the two guards on POST /sellers, and that a replay carrying the token
is answered with the row the first attempt produced.

    uv run python scripts/prove_seller_code_guards.py

Bare re-run: with no arguments it restores its OWN scratch (recycle_guards_scratch,
from a live dump -- live is only read) and builds its OWN detached worktree at the
commit BEFORE the guards, removing the worktree afterward. Pass --database and/or
--old-tree to override either half.

EVERY GUARD IS MEASURED AS A PAIR, AND THE OLD HALF IS A REAL SERVER.
A criterion that only showed the new behaviour would be a restatement of the new
code rather than a measurement of anything: "the server refuses a reserved code"
is satisfied by a server that refuses every code, and "the minted code is not
reserved" is satisfied by a server that mints nothing. So this script starts TWO
uvicorns against the SAME scratch database -- one from a git worktree at the
commit BEFORE the guards, one from the tree as it stands -- and every guard is
reported as ADMITTED-then-REFUSED, with the original capability asserted in the
same block so a widening cannot trade one hole for another.

THE INSTRUMENT CHECKS ITSELF. Nothing here reads the old tree's source to decide
whether it is old: pointing --old-tree at the current tree reddens the ADMITTED
cells, which is the discriminator. Both servers are additionally required to
return a sentinel seller written into this database before either of them
started, so the pair is known to be talking to one database.

REFUSES TO RUN AGAINST THE LIVE DATABASE. This script creates sellers, mints
reserved codes, and DELIBERATELY DRIVES THE OLD SERVER INTO THE DEFECT -- it
writes a `sellers` row carrying a code a device is still holding, which is the
invariant the new code exists to make unreachable. None of it can be undone:
`is_active` retires a seller rather than removing one, and a reservation is never
reclaimed. DEV IS NOT SCRATCH
(lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-database.md).

THE ORDER OF THE BLOCKS IS LOAD-BEARING. G5's invariant queries assert that no
`sellers` row carries a code whose reservation is still `held`; G1 and G2's
ADMITTED halves deliberately CREATE exactly that state. G5 therefore runs first,
and its queries are scoped to THIS RUN's device identities so a second run is not
reading the first run's deliberate damage
(lessons/proof-must-run-twice.md). What that scoping costs is stated at the cell.

REPEATABLE. Run it twice with no reseed; it passes twice. Every device identity,
every token and every seller name is per-run, no code is written into this file,
and every assertion is relative to a reading taken immediately before the call.

THE EXIT LINE, AND WHAT SUPPRESSES IT. main() prints
`PROVE_SELLER_CODE_GUARDS_EXIT=<n>` from the same integer it returns. That line
is ABSENT if the script dies before the summary. THE ABSENCE IS THE SIGNAL.
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

load_dotenv()

import asyncpg  # noqa: E402
import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

# THE ATTEMPT BUDGET IS READ OUT OF THE ARTEFACT, never written into this file.
# The criterion this serves requires a reserved block LONGER than the assigner's
# budget, and a literal here would be a second copy that rots the day somebody
# tunes the loop -- the raw-count-in-a-criterion defect, one level down.
#
# THIS IS NOT THE CHECKER SHARING THE CODE IT CHECKS. That rule is about a
# checker agreeing with the product BY CONSTRUCTION on the thing under test. The
# thing under test here is the BEHAVIOUR at a block longer than the budget; the
# budget itself is a fixture parameter, and reading it from the module is how the
# fixture stays correct rather than how the assertion stays true.
from app.master import _ASSIGN_ATTEMPTS  # noqa: E402
from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    STAFF_USERNAME,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
    TENANT_A_STAFF_PASSWORD,
)

RUN = uuid.uuid4().hex[:8]
OWNER_DSN = ""
NEW = ""   # base url of the server built from the tree as it stands
OLD = ""   # base url of the server built from the worktree

ASSIGNED_SHAPE = re.compile(r"^S(\d+)$")
REFILL_PATH = "/seller-code-reservations"

# The guards this proof pairs the OLD server against were added in b8b557f
# (P1.8b server, commit 2). The old tree is that commit's PARENT -- the last one
# still lacking the guard, so the ADMITTED halves reach the defect. Pinned to the
# commit, not "N commits back", so it cannot drift as history grows.
GUARDS_COMMIT = "b8b557f"
# The scratch this proof restores for itself, overwritten each run (twice-bare).
SCRATCH_DB = "recycle_guards_scratch"

failures: list[str] = []


def free_port() -> int:
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
    try:
        b = r.json()
    except Exception:  # noqa: BLE001
        return {}
    return b if isinstance(b, dict) else {}


def detail_of(r: httpx.Response) -> dict:
    d = body_of(r).get("detail")
    return d if isinstance(d, dict) else {}


def login(client: httpx.Client, base: str, username: str, password: str) -> str:
    r = client.post(f"{base}/auth/login", json={
        "tenant_id": str(TENANT_A_ID), "username": username, "password": password})
    r.raise_for_status()
    return r.json()["access_token"]


# ---------------------------------------------------------------------------
# Postgres, through asyncpg, as the OWNER with tenant context set.
#
# FORCE ROW LEVEL SECURITY applies to the owner too, so without set_config every
# read here returns zero rows and every "absent" assertion is vacuously true.
# ---------------------------------------------------------------------------
async def _in_tenant(fn):
    conn = await asyncpg.connect(OWNER_DSN)
    try:
        tx = conn.transaction()
        await tx.start()
        try:
            await conn.execute("SELECT set_config('app.tenant_id', $1, true)",
                               str(TENANT_A_ID))
            out = await fn(conn)
            await tx.commit()
            return out
        except BaseException:
            await tx.rollback()
            raise
    finally:
        await conn.close()


def fetch(sql: str, *args) -> list:
    async def go(conn):
        return await conn.fetch(sql, *args)
    return asyncio.run(_in_tenant(go))


def fetchval(sql: str, *args):
    async def go(conn):
        return await conn.fetchval(sql, *args)
    return asyncio.run(_in_tenant(go))


def execute(sql: str, *args) -> str:
    async def go(conn):
        return await conn.execute(sql, *args)
    return asyncio.run(_in_tenant(go))


def assigned_max() -> tuple[int, int, int]:
    """(sellers max, reservations max, union max), 0 where empty."""
    row = fetch("""
        SELECT
          coalesce((SELECT max(substring(code from 2)::numeric) FROM sellers
                     WHERE code ~ '^S[0-9]+$'), 0) AS s,
          coalesce((SELECT max(substring(code from 2)::numeric)
                      FROM seller_code_reservations
                     WHERE code ~ '^S[0-9]+$'), 0) AS r
    """)[0]
    return int(row["s"]), int(row["r"]), max(int(row["s"]), int(row["r"]))


def number_of(code: str | None) -> int | None:
    m = ASSIGNED_SHAPE.match(code or "")
    return int(m.group(1)) if m else None


def rows_with_code(code: str) -> int:
    return int(fetchval("SELECT count(*) FROM sellers WHERE code = $1", code))


def reservation(token: str) -> dict | None:
    rows = fetch("SELECT code, state, seller_id, device_id FROM"
                 " seller_code_reservations WHERE token = $1", token)
    return dict(rows[0]) if rows else None


def held_of(device: uuid.UUID) -> list[str]:
    return [r["code"] for r in fetch(
        "SELECT code FROM seller_code_reservations"
        " WHERE device_id = $1 AND state = 'held' ORDER BY code", device)]


# ---------------------------------------------------------------------------
# the two servers
# ---------------------------------------------------------------------------
def wait_for_health(proc: subprocess.Popen, base: str,
                    timeout_s: float = 60.0) -> str:
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            return f"the uvicorn child exited with code {proc.returncode}"
        try:
            if httpx.get(f"{base}/health", timeout=2.0).status_code == 200:
                return ""
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.4)
    return f"no 200 from {base}/health within {timeout_s:.0f}s"


def start_server(server_dir: str, env: dict, label: str
                 ) -> tuple[subprocess.Popen, str, object]:
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(  # noqa: SIM115 - closed by the caller
        prefix=f"prove_guards_{label}_", suffix=".log", delete=False, mode="w+")
    proc = subprocess.Popen(
        [sys.executable, "-u", "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=server_dir, env=env, stdout=log, stderr=subprocess.STDOUT)
    return proc, base, log


def stop(proc: subprocess.Popen, log) -> None:
    try:
        proc.terminate()
        proc.wait(timeout=15)
    except subprocess.TimeoutExpired:
        proc.kill()
    except Exception:  # noqa: BLE001
        pass
    try:
        log.close()
    except Exception:  # noqa: BLE001
        pass


def create_seller(client: httpx.Client, base: str, token: str, name: str,
                  code: str | None = None,
                  reservation_token: str | None = None,
                  identity: bool = False) -> httpx.Response:
    payload: dict = {"name": name, "grade": "B"}
    if code is not None:
        payload["code"] = code
    if reservation_token is not None:
        payload["reservation_token"] = reservation_token
    if identity:
        # The two fields a refusal on this route must never hand back.
        payload["id_number"] = ID_NUMBER
        payload["address"] = ADDRESS
    return client.post(f"{base}/sellers", headers=auth(token), json=payload)


def refill(client: httpx.Client, base: str, token: str,
           device: uuid.UUID) -> httpx.Response:
    return client.post(f"{base}{REFILL_PATH}", headers=auth(token),
                       json={"device_id": str(device)})


def refill_codes(r: httpx.Response) -> list[tuple[str, str]]:
    res = body_of(r).get("reservations")
    if not isinstance(res, list):
        return []
    return [(str(x.get("code")), str(x.get("token")))
            for x in res if isinstance(x, dict)]


def set_target(n: int) -> None:
    execute("UPDATE tenants SET seller_code_target_holding = $1", n)


# Distinctive values, so "absent from the response" is a statement about the echo
# and not about luck. Both are the shape SRS 1.6 asks a yard to transcribe.
ID_NUMBER = f"1234567{RUN[:6]}"
ADDRESS = f"99/1 moo 4 guard-probe {RUN}"


def _repo_root() -> str:
    return os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def build_old_worktree(ref: str) -> str:
    """git worktree add a DETACHED checkout at `ref`, into a temp path that must
    NOT already exist -- never the repo root, and never a silent reuse of a stale
    path (which would run stale code). Returns the path; the caller removes it in
    a finally."""
    path = os.path.join(tempfile.gettempdir(), f"recycle-guards-oldtree-{RUN}")
    if os.path.exists(path):
        raise RuntimeError(
            f"old-tree worktree path already exists, refusing to reuse: {path}")
    cp = subprocess.run(
        ["git", "-C", _repo_root(), "worktree", "add", "--detach", path, ref],
        capture_output=True, text=True, timeout=120)
    if cp.returncode != 0:
        raise RuntimeError(f"git worktree add {ref} failed: {cp.stderr.strip()}")
    return path


def remove_old_worktree(path: str) -> None:
    subprocess.run(
        ["git", "-C", _repo_root(), "worktree", "remove", "--force", path],
        capture_output=True, text=True, timeout=60)


def restore_scratch(live_name: str, scratch: str) -> None:
    """Dump the LIVE database (READ-ONLY) and restore it into `scratch`,
    overwriting it -- the prove_backup_restore shape. Live is only read; every
    write this proof makes lands in the scratch."""
    server_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    out = os.path.join(tempfile.gettempdir(), f"recycle-guards-dump-{RUN}")
    label = f"guards-{RUN}"
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "backup_db.py"),
         "--db", live_name, "--out", out, "--label", label],
        cwd=server_dir, capture_output=True, text=True, timeout=300)
    if cp.returncode != 0:
        raise RuntimeError(f"backup_db.py (live) failed: {cp.stderr.strip()[:600]}")
    dumps = [d for d in os.listdir(out) if d.endswith(label)]
    if len(dumps) != 1:
        raise RuntimeError(f"expected one dump dir ending {label!r}, got {dumps}")
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "restore_db.py"),
         os.path.join(out, dumps[0]), "--into", scratch],
        cwd=server_dir, capture_output=True, text=True, timeout=300)
    if cp.returncode != 0:
        raise RuntimeError(f"restore_db.py -> {scratch} failed: {cp.stderr.strip()[:600]}")


def main() -> int:  # noqa: PLR0912, PLR0915 - one linear script
    ap = argparse.ArgumentParser(
        description="Prove the reserved-code guards on POST /sellers.")
    ap.add_argument("--database", default=None,
                    help="a SCRATCH database. Omit it and the script restores "
                         f"{SCRATCH_DB!r} from a live dump itself (live read-only). "
                         "This script creates sellers, mints reserved codes, and "
                         "deliberately drives the OLD server into the defect -- none "
                         "of which can be undone, so it never runs against live.")
    ap.add_argument("--old-tree", default=None,
                    help="a git worktree at the commit BEFORE the guards. Omit it "
                         f"and the script builds one at {GUARDS_COMMIT}^ itself and "
                         "removes it afterward. Its server/ is the second API, and "
                         "it is what makes each guard a PAIR.")
    args = ap.parse_args()

    app_live = make_url(os.environ["APP_DATABASE_URL"])
    dir_live = make_url(os.environ["DIRECTORY_DATABASE_URL"])
    owner_live = make_url(os.environ["MIGRATION_DATABASE_URL"])
    live_name = app_live.database
    # Validate any OVERRIDE up front, before provisioning, so a bad one never
    # leaves a half-built worktree or a wasted restore behind.
    if args.database is not None and args.database == live_name:
        print(f"REFUSED: --database {args.database!r} is the LIVE database from\n"
              "  APP_DATABASE_URL. This script writes sellers that cannot be\n"
              "  removed, burns reserved codes that are never reclaimed, and\n"
              "  DELIBERATELY creates the invariant violation the new code exists\n"
              f"  to prevent. Omit --database to restore a fresh {SCRATCH_DB!r} here.")
        return 2
    if args.old_tree is not None and not os.path.isdir(
            os.path.join(args.old_tree, "server")):
        print(f"REFUSED: {os.path.join(args.old_tree, 'server')} is not a directory."
              " --old-tree must be a git worktree at the commit before the guards,"
              " or omit it to have this script build one.")
        return 2

    # ---- SELF-PROVISION what was not supplied (full self-containment) ----
    # Live is only READ (dumped); every seller, reserved code and deliberate
    # violation this proof writes lands in the scratch. The worktree is built
    # LAST, so a scratch-restore failure leaves nothing to remove; whatever IS
    # built is removed by the finally below.
    built_worktree = None
    if args.database is None:
        print(f"  restoring a fresh scratch {SCRATCH_DB!r} from a live dump...")
        restore_scratch(live_name, SCRATCH_DB)
        args.database = SCRATCH_DB
    if args.old_tree is None:
        built_worktree = build_old_worktree(f"{GUARDS_COMMIT}^")
        args.old_tree = built_worktree
        print(f"  built old worktree at {GUARDS_COMMIT}^ (before the guards): "
              f"{built_worktree}")

    old_server_dir = os.path.join(args.old_tree, "server")

    global OWNER_DSN
    OWNER_DSN = owner_live.set(
        database=args.database, drivername="postgresql"
    ).render_as_string(hide_password=False)

    env = dict(os.environ)
    env["APP_DATABASE_URL"] = app_live.set(
        database=args.database).render_as_string(hide_password=False)
    env["DIRECTORY_DATABASE_URL"] = dir_live.set(
        database=args.database).render_as_string(hide_password=False)
    env["PYTHONUNBUFFERED"] = "1"

    try:
        old_sha = subprocess.run(
            ["git", "-C", args.old_tree, "rev-parse", "HEAD"],
            capture_output=True, text=True, timeout=30).stdout.strip()
    except Exception as e:  # noqa: BLE001
        old_sha = f"<unreadable: {e}>"

    print("=== prove_seller_code_guards ===")
    print(f"  run tag          : {RUN}")
    print(f"  scratch database : {args.database}")
    print(f"  live database    : {live_name!r} -- not touched by this script")
    print(f"  old tree         : {args.old_tree}")
    print(f"  old tree HEAD    : {old_sha}")
    print(f"  assigner budget  : {_ASSIGN_ATTEMPTS} (read from app.master)")

    new_proc, new_log = None, None
    old_proc, old_log = None, None
    original_target: int | None = None
    try:
        banner("B0 - the binding sentinel, written BEFORE either server starts")
        sentinel_code = f"ZZ-GUARD-{RUN}"
        execute("INSERT INTO sellers (tenant_id, code, name, grade)"
                " VALUES ($1, $2, $3, 'B')",
                TENANT_A_ID, sentinel_code, f"guard sentinel {RUN}")
        check(rows_with_code(sentinel_code) == 1,
              f"B0: the sentinel {sentinel_code} exists in {args.database}; no other "
              "database on this cluster can hold it")

        server_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        global NEW, OLD
        new_proc, NEW, new_log = start_server(server_dir, env, "new")
        old_proc, OLD, old_log = start_server(old_server_dir, env, "old")

        for proc, base, log, what in ((new_proc, NEW, new_log, "NEW"),
                                      (old_proc, OLD, old_log, "OLD")):
            why = wait_for_health(proc, base)
            if why:
                log.flush()
                with open(log.name, encoding="utf-8", errors="replace") as fh:
                    tail = fh.read().replace("\r\n", "\n")[-2000:]
                print(f"{what} SERVER DID NOT START: {why}\n{tail}")
                return 1

        with httpx.Client(timeout=60.0) as c:
            banner("B1 - both servers are up, on this database, and are TWO")
            print(f"  NEW {NEW}   OLD {OLD}")
            check(NEW != OLD, f"B1: two distinct ports ({NEW} vs {OLD})")
            staff = login(c, NEW, STAFF_USERNAME, TENANT_A_STAFF_PASSWORD)
            admin = login(c, NEW, ADMIN_USERNAME, TENANT_A_PASSWORD)
            # ONE TOKEN, BOTH SERVERS. They share a JWT_SECRET because they share
            # an environment, which is what lets the same session drive the pair.
            for base, what in ((NEW, "NEW"), (OLD, "OLD")):
                w = c.get(f"{base}/whoami", headers=auth(staff))
                lst = c.get(f"{base}/sellers?include_inactive=true",
                            headers=auth(staff))
                codes = {s["code"] for s in body_of(lst).get("sellers", [])}
                check(w.status_code == 200
                      and body_of(w).get("role") == "staff"
                      and sentinel_code in codes,
                      f"B1: the {what} server accepts this staff session and "
                      f"returns the sentinel -- so it is bound to "
                      f"{args.database}")

            original_target = int(fetchval(
                "SELECT seller_code_target_holding FROM tenants"))
            print(f"  target holding   : {original_target}")

            # ============================================================= G5
            # RUN FIRST, DELIBERATELY. G1 and G2's ADMITTED halves create the
            # very state cell 3 asserts absent, so this block cannot follow them.
            banner("G5 - A-SPENT-RESERVATION-NAMES-A-ROW-THAT-EXISTS")
            dev5 = uuid.uuid4()
            set_target(2)
            r5 = refill(c, NEW, staff, dev5)
            block5 = refill_codes(r5)
            check(r5.status_code == 200 and len(block5) == 2,
                  f"G5 staging: device 5 holds {len(block5)} reserved codes")
            (code5a, tok5a), (code5b, tok5b) = block5[0], block5[1]
            spend5 = create_seller(c, NEW, staff, f"g5 {RUN}", code=code5a,
                                   reservation_token=tok5a)
            new_id = body_of(spend5).get("id")
            res5a, res5b = reservation(tok5a), reservation(tok5b)
            print(f"  create -> {spend5.status_code}  seller id={new_id}")
            print(f"  reservation A: state={res5a and res5a['state']} "
                  f"seller_id={res5a and res5a['seller_id']}")
            print(f"  reservation B: state={res5b and res5b['state']} "
                  f"seller_id={res5b and res5b['seller_id']}")
            check(spend5.status_code == 201 and new_id is not None
                  and res5a is not None
                  and res5a["seller_id"] is not None
                  and str(res5a["seller_id"]) == str(new_id),
                  f"G5 cell 1: the spent reservation's seller_id "
                  f"({res5a and res5a['seller_id']}) EQUALS the created row's id "
                  f"({new_id}), and the NON-NULL conjunct is on this line -- two "
                  "derivations of one event both return null when the event did "
                  "not happen, and None == None is the most convincing green "
                  "available")
            check(res5a is not None and res5a["state"] == "spent"
                  and res5b is not None and res5b["state"] == "held"
                  and res5b["seller_id"] is None,
                  f"G5 cell 2: the FIRST reservation is `spent` and the second, "
                  f"issued to the same device and untouched, is still `held` "
                  f"({res5b and res5b['state']}) -- so `spent` is a fact about "
                  "one row rather than a column defaulted for every row")

            # THE TWO INVARIANT QUERIES, SCOPED TO THIS RUN'S DEVICES.
            # ITS BOUND, STATED: a shop-wide version of these would read the
            # deliberate damage G1 and G2 leave behind on every earlier run and
            # could not pass twice. What is measured is that the CREATE PATH
            # holds the invariant for the rows it wrote; a standing shop-wide
            # check belongs in reconcile.py and is not built.
            run_devices = [dev5]
            bad_spent = fetch(
                "SELECT code FROM seller_code_reservations"
                " WHERE device_id = ANY($1::uuid[]) AND state = 'spent'"
                "   AND seller_id IS NULL", run_devices)
            good_spent = fetch(
                "SELECT code FROM seller_code_reservations"
                " WHERE device_id = ANY($1::uuid[]) AND state = 'spent'"
                "   AND seller_id IS NOT NULL", run_devices)
            bad_held = fetch(
                "SELECT r.code FROM seller_code_reservations r"
                " JOIN sellers s ON s.code = r.code"
                " WHERE r.device_id = ANY($1::uuid[]) AND r.state = 'held'",
                run_devices)
            good_held = fetch(
                "SELECT r.code FROM seller_code_reservations r"
                " WHERE r.device_id = ANY($1::uuid[]) AND r.state = 'held'"
                "   AND NOT EXISTS (SELECT 1 FROM sellers s WHERE s.code = r.code)",
                run_devices)
            print(f"  spent with NULL seller_id : {len(bad_spent)}   "
                  f"complementary (spent, named): {len(good_spent)}")
            print(f"  held whose code is in sellers: {len(bad_held)}   "
                  f"complementary (held, absent): {len(good_held)}")
            check(not bad_spent and len(good_spent) == 1,
                  f"G5 cell 3a: NO reservation of this run is `spent` with a null "
                  f"seller_id ({len(bad_spent)}), and the complementary query "
                  f"returns the correctly-paired row ({len(good_spent)}) -- an "
                  "empty result from a query that never matched anything is "
                  "indistinguishable from an invariant that holds")
            check(not bad_held and len(good_held) == 1,
                  f"G5 cell 3b: NO `sellers` row carries a code this run still "
                  f"holds ({len(bad_held)}), with the complementary query "
                  f"returning the held-and-absent row ({len(good_held)})")

            # ============================================================= G4
            banner("G4 - A-REPLAY-CARRYING-THE-TOKEN-IS-ANSWERED-WITH-THE-FIRST-ROW")
            dev4 = uuid.uuid4()
            set_target(2)
            block4 = refill_codes(refill(c, NEW, staff, dev4))
            (code4a, tok4a), (code4b, tok4b) = block4[0], block4[1]
            first = create_seller(c, NEW, staff, f"g4 {RUN}", code=code4a,
                                  reservation_token=tok4a)
            second = create_seller(c, NEW, staff, f"g4 {RUN}", code=code4a,
                                   reservation_token=tok4a)
            other = create_seller(c, NEW, staff, f"g4 other {RUN}", code=code4b,
                                  reservation_token=tok4b)
            id1 = body_of(first).get("id")
            id2 = body_of(second).get("id")
            id3 = body_of(other).get("id")
            print(f"  first={first.status_code} id={id1}")
            print(f"  replay={second.status_code} id={id2}")
            print(f"  a different create={other.status_code} id={id3}")
            check(first.status_code == 201 and second.status_code == 200,
                  f"G4: the first create is 201 and the byte-identical replay is "
                  f"200 ({first.status_code}, {second.status_code}) -- the replay "
                  "created nothing")
            check(id1 is not None and id2 is not None and id1 == id2,
                  f"G4 cell 1: the replay carries the SAME seller.id ({id2})")
            check(id3 is not None and id3 != id1,
                  f"G4 cell 1 presence sibling: a DIFFERENT create in the same "
                  f"run returns a DIFFERENT id ({id3}) -- 'the same id' is "
                  "satisfied by a server that returns a constant")
            n_a, n_b = rows_with_code(code4a), rows_with_code(code4b)
            print(f"  rows in Postgres: {code4a}={n_a}  {code4b}={n_b}")
            check(n_a == 1 and n_b == 1,
                  f"G4 cell 2: exactly ONE `sellers` row carries {code4a} and one "
                  f"carries {code4b} ({n_a}, {n_b}) -- a pair of readings, "
                  "because a route that ignored the token and minted a new code "
                  "would look successful to the client")
            after1 = reservation(tok4a)
            check(after1 is not None and after1["state"] == "spent"
                  and after1["seller_id"] is not None
                  and str(after1["seller_id"]) == str(id1),
                  f"G4 cell 3: the reservation is `spent` after the replay too, "
                  f"still naming the first row ({after1 and after1['seller_id']})")

            banner("G4b - two BYTE-IDENTICAL creates at once, behind a barrier")
            dev4b = uuid.uuid4()
            set_target(1)
            block4b = refill_codes(refill(c, NEW, staff, dev4b))
            code4c, tok4c = block4b[0]
            barrier = threading.Barrier(2)
            race: list[tuple[int, str | None, float, float]] = []
            rlock = threading.Lock()

            def racer() -> None:
                cc = httpx.Client(timeout=60.0)
                try:
                    barrier.wait(timeout=20)
                    t0 = time.perf_counter()
                    rr = create_seller(cc, NEW, staff, f"g4b {RUN}",
                                       code=code4c, reservation_token=tok4c)
                    t1 = time.perf_counter()
                    with rlock:
                        race.append((rr.status_code, body_of(rr).get("id"), t0, t1))
                finally:
                    cc.close()

            ths = [threading.Thread(target=racer) for _ in range(2)]
            for t in ths:
                t.start()
            for t in ths:
                t.join(timeout=90)
            if len(race) != 2:
                check(False, f"G4b: both racers returned (got {len(race)})")
            else:
                (s1, i1, a1, b1), (s2, i2, a2, b2) = race
                overlap = (min(b1, b2) - max(a1, a2)) * 1000
                print(f"  statuses={sorted([s1, s2])}  ids={{{i1}, {i2}}}  "
                      f"request windows overlapped by {overlap:.1f} ms")
                check(overlap > 0,
                      f"G4b: the two requests overlapped ({overlap:.1f} ms)")
                check(sorted([s1, s2]) == [200, 201],
                      f"G4b: one CREATED it and the other was handed the same row "
                      f"({sorted([s1, s2])}) -- neither is a 500, which would be "
                      "`unavailable` and retried for ever")
                check(i1 is not None and i1 == i2 and rows_with_code(code4c) == 1,
                      f"G4b: both answers name ONE seller ({i1}) and Postgres "
                      f"holds exactly one row for {code4c}")
                print("  BOUND: which ARM the loser took -- its own SELECT seeing")
                print("  `spent`, or the re-read after a unique violation -- is")
                print("  not observable from outside. Both are correct outcomes,")
                print("  so this asserts the OUTCOME the branch produces.")

            # ============================================================= G6
            banner("G6 - the token's own refusals, and none of them echoes it")
            dev6 = uuid.uuid4()
            set_target(1)
            code6, tok6 = refill_codes(refill(c, NEW, staff, dev6))[0]
            no_code = c.post(f"{NEW}/sellers", headers=auth(staff), json={
                "name": f"g6 {RUN}", "grade": "B", "reservation_token": tok6})
            unknown = create_seller(c, NEW, staff, f"g6 {RUN}", code=code6,
                                    reservation_token=f"nosuchtoken-{RUN}")
            mismatch = create_seller(c, NEW, staff, f"g6 {RUN}",
                                     code=f"ZZ-MISMATCH-{RUN}",
                                     reservation_token=tok6)
            for r, want, label in (
                (no_code, "reservation_token_without_code", "a token with NO code"),
                (unknown, "reservation_not_found", "a token this shop never issued"),
                (mismatch, "reservation_code_mismatch", "a token naming another code"),
            ):
                got = detail_of(r).get("code")
                print(f"  {label}: {r.status_code} {got!r}")
                check(r.status_code == 422 and got == want,
                      f"G6: {label} -> 422 {want} (got {r.status_code} {got!r})")
                check(tok6 not in r.text and len(r.text) > 0,
                      f"G6: and the refusal does NOT echo the token, with the "
                      f"presence sibling that the body is non-empty "
                      f"({len(r.text)} bytes)")
            check(rows_with_code(f"ZZ-MISMATCH-{RUN}") == 0,
                  "G6: the mismatched create wrote NO row")

            # ============================================================= G1
            banner("G1 - A-SUPPLIED-RESERVED-CODE-IS-REFUSED, and today the "
                   "server takes it")
            dev1 = uuid.uuid4()
            set_target(4)
            block1 = refill_codes(refill(c, NEW, staff, dev1))
            check(len(block1) >= 2,
                  f"G1 staging: a block of {len(block1)} is reserved to device 1")
            c_admit, c_refuse = block1[0][0], block1[1][0]
            print(f"  two members of ONE block: admitted half uses {c_admit}, "
                  f"refused half uses {c_refuse}")
            print("  TWO CODES AND NOT ONE, because the admitted half CONSUMES")
            print("  its code: nothing differs between the halves except which")
            print("  server answered.")

            # (a) ADMITTED under the server as it stands.
            before_a = rows_with_code(c_admit)
            adm = create_seller(c, OLD, staff, f"g1 admitted {RUN}",
                                code=c_admit, identity=True)
            after_a = rows_with_code(c_admit)
            print(f"  OLD  supplied {c_admit}: {adm.status_code}   rows "
                  f"{before_a} -> {after_a}")
            check(adm.status_code == 201 and before_a == 0 and after_a == 1,
                  f"G1 (a) ADMITTED under the OLD server: 201 and a `sellers` row "
                  f"carrying {c_admit} now exists ({before_a} -> {after_a}) -- "
                  "the defect, reproduced, and what makes (b) a measurement "
                  "rather than a restatement of the new code")

            # (b) REFUSED under the new rule. The absence from `sellers` is
            # asserted IMMEDIATELY BEFORE the request: that is the discriminator
            # against a server that refuses by having inserted a placeholder row
            # at issue time and letting the unique constraint fire.
            before_b = rows_with_code(c_refuse)
            check(before_b == 0,
                  f"G1 (b) staging: {c_refuse} is ABSENT from `sellers` at the "
                  f"moment of the request ({before_b}) -- so the refusal below "
                  "cannot be a unique-constraint answer wearing a new name")
            ref = create_seller(c, NEW, staff, f"g1 refused {RUN}",
                                code=c_refuse, identity=True)
            after_b = rows_with_code(c_refuse)
            got = detail_of(ref).get("code")
            print(f"  NEW  supplied {c_refuse}: {ref.status_code} {got!r}   rows "
                  f"{before_b} -> {after_b}")
            check(ref.status_code == 409 and got == "code_reserved",
                  f"G1 (b) REFUSED under the NEW server: 409 with a code of its "
                  f"OWN ({got!r}), and NOT `duplicate_code`")
            check(after_b == 0,
                  f"G1 (b): and NO `sellers` row carrying {c_refuse} exists "
                  f"afterwards ({after_b})")

            # (c) The original capability, kept in the same block.
            plain = f"PAPER-{RUN}"
            keep = create_seller(c, NEW, staff, f"g1 paper {RUN}", code=plain)
            check(keep.status_code == 201 and rows_with_code(plain) == 1,
                  f"G1 (c) THE ORIGINAL CAPABILITY IS KEPT: a supplied code that "
                  f"is NOT reserved ({plain}) still returns 201 and its row is "
                  "readable -- a server that refused every supplied code would "
                  "satisfy (b) completely")

            # (d) The refusal does not echo the request body.
            print(f"  refusal body: {ref.text.strip()[:200]}")
            check(ID_NUMBER not in ref.text and ADDRESS not in ref.text,
                  f"G1 (d): neither the supplied id_number nor the address "
                  "appears anywhere in the response bytes")
            check(len(ref.text) > 0 and c_refuse in ref.text,
                  f"G1 (d) presence sibling: the body is non-empty and NAMES the "
                  f"code ({c_refuse}) -- an absence over an empty body is "
                  "satisfied by silence")

            # ============================================================= G2
            banner("G2 - A-MINTED-CODE-SKIPS-WHAT-IS-RESERVED, and today it does "
                   "not")
            # STAGING: push the `sellers` maximum up to the union maximum, so a
            # freshly reserved block begins at sellers_max + 1. Without that the
            # OLD server -- which derives from `sellers` alone -- would mint a
            # code far BELOW the block and (a) would be green for the wrong
            # reason, proving nothing about the skip.
            s_max, r_max, u_max = assigned_max()
            lift = f"S{u_max + 1:03d}"
            lifted = create_seller(c, NEW, staff, f"g2 lift {RUN}", code=lift)
            s_max, r_max, u_max = assigned_max()
            check(lifted.status_code == 201 and s_max == u_max,
                  f"G2 staging: the sellers maximum is lifted to the union "
                  f"maximum (sellers={s_max} reservations={r_max}) -- so the next "
                  "reserved block starts immediately above it")

            dev2 = uuid.uuid4()
            set_target(4)
            block2 = [x[0] for x in refill_codes(refill(c, NEW, staff, dev2))]
            block2_nums = sorted(n for n in (number_of(x) for x in block2)
                                 if n is not None)
            print(f"  reserved block: {block2} (numbers {block2_nums})")

            adm2 = create_seller(c, OLD, staff, f"g2 admitted {RUN}")
            got2 = body_of(adm2).get("code")
            print(f"  OLD  no code -> {adm2.status_code} code={got2!r}")
            check(adm2.status_code == 201 and got2 in block2,
                  f"G2 (a) ADMITTED under the OLD server: the minted code "
                  f"({got2!r}) IS a member of the reserved block, and the row "
                  "exists -- the worse of the two holes, reproduced, with nobody "
                  "making a mistake")

            new2 = create_seller(c, NEW, staff, f"g2 refused {RUN}")
            got3 = body_of(new2).get("code")
            in_relation = int(fetchval(
                "SELECT count(*) FROM seller_code_reservations WHERE code = $1",
                got3 or ""))
            print(f"  NEW  no code -> {new2.status_code} code={got3!r}  "
                  f"in the relation: {in_relation}")
            check(new2.status_code == 201,
                  f"G2 (b) presence sibling: the create still SUCCEEDS "
                  f"({new2.status_code}) -- a route that had started refusing "
                  "this path would satisfy any assertion phrased as 'no reserved "
                  "code was minted'")
            check(in_relation == 0,
                  f"G2 (b): the minted code {got3!r} is NOT in the reservation "
                  f"relation for this tenant ({in_relation})")

            # ============================================================= G3
            banner("G3 - THE-ASSIGNER-STILL-TERMINATES-ABOVE-A-RESERVED-BLOCK")
            # Cell 1: a block LONGER than the assigner's attempt budget.
            s_max, r_max, u_max = assigned_max()
            lift3 = f"S{u_max + 1:03d}"
            create_seller(c, NEW, staff, f"g3 lift {RUN}", code=lift3)
            dev3 = uuid.uuid4()
            set_target(_ASSIGN_ATTEMPTS + 4)
            block3 = [x[0] for x in refill_codes(refill(c, NEW, staff, dev3))]
            nums3 = sorted(n for n in (number_of(x) for x in block3)
                           if n is not None)
            r3 = create_seller(c, NEW, staff, f"g3 long {RUN}")
            got_l = body_of(r3).get("code")
            n_l = number_of(got_l)
            print(f"  budget={_ASSIGN_ATTEMPTS}  block of {len(block3)} "
                  f"({nums3[0]}..{nums3[-1]})  minted={got_l!r}")
            check(len(block3) > _ASSIGN_ATTEMPTS,
                  f"G3 staging: the block ({len(block3)}) is LONGER than the "
                  f"assigner's budget ({_ASSIGN_ATTEMPTS}) -- read out of "
                  "app.master when this staging was built")
            check(r3.status_code == 201 and n_l is not None
                  and n_l > nums3[-1],
                  f"G3 cell 1: 201, and the minted code {got_l!r} sits ABOVE the "
                  f"whole block (>{nums3[-1]}) -- not merely outside it, because "
                  "ABOVE is the only answer consistent with the sequence a "
                  "shop's paper slips carry")

            # Cell 2: the control -- nothing reserved ABOVE the sellers maximum.
            # THE LITERAL STAGING THE CRITERION NAMES IS UNREACHABLE ON A SECOND
            # RUN, and saying so is cheaper than pretending otherwise: nothing
            # ever deletes a reservation, so "no reservations held for that
            # tenant" is true once in the life of a database. What is staged
            # instead preserves the property the control is for -- with nothing
            # reserved above the sellers maximum, the identical call must mint
            # the successor of that maximum and not from some unrelated place.
            s_max, r_max, u_max = assigned_max()
            lift4 = f"S{u_max + 1:03d}"
            create_seller(c, NEW, staff, f"g3 control lift {RUN}", code=lift4)
            s_max, r_max, u_max = assigned_max()
            ctl = create_seller(c, NEW, staff, f"g3 control {RUN}")
            n_c = number_of(body_of(ctl).get("code"))
            print(f"  control: sellers max={s_max} reservations max={r_max}  "
                  f"minted={body_of(ctl).get('code')!r}")
            check(ctl.status_code == 201 and s_max >= r_max and n_c == s_max + 1,
                  f"G3 cell 2 (control): with nothing reserved ABOVE the sellers "
                  f"maximum ({s_max}), the identical call mints its successor "
                  f"({n_c}) -- so cell 1 measures the skip and not a server "
                  "minting from an unrelated place")

            # Cell 3: EXACTLY ONE code reserved. The cheap one, and the only cell
            # that catches a NON-WALKING post-check: that shape hands a reserved
            # candidate back to the retry, which re-derives the identical value
            # from an unchanged `sellers` on all its attempts, so it is refused
            # at a block of ONE and the block-length staging above sails past it.
            s_max, r_max, u_max = assigned_max()
            lift5 = f"S{u_max + 1:03d}"
            create_seller(c, NEW, staff, f"g3 one lift {RUN}", code=lift5)
            dev3b = uuid.uuid4()
            set_target(1)
            one_block = [x[0] for x in refill_codes(refill(c, NEW, staff, dev3b))]
            r3b = create_seller(c, NEW, staff, f"g3 one {RUN}")
            n_one = number_of(one_block[0] if one_block else None)
            n_got = number_of(body_of(r3b).get("code"))
            print(f"  exactly one reserved: {one_block}  minted="
                  f"{body_of(r3b).get('code')!r}")
            check(len(one_block) == 1,
                  f"G3 cell 3 staging: EXACTLY ONE code is reserved "
                  f"({len(one_block)})")
            check(r3b.status_code == 201 and n_one is not None
                  and n_got == n_one + 1,
                  f"G3 cell 3: 201, and the minted code is that ONE code's "
                  f"successor ({n_got} = {n_one} + 1) -- a non-walking "
                  f"post-check answers 409 code_assignment_failed to this "
                  "identical request")

            # ============================================================= G7
            banner("G7 - THE LOCK ON THE CREATE PATH, measured the way a lock "
                   "has to be")
            # The pair of holds, for the reason
            # lessons/a-lock-is-proven-by-what-waits-not-by-a-race.md records: a
            # barrier synchronises requests and the section this lock protects is
            # a fragment of one, so the lock is measured by HOLDING something.
            LOCK_MODE = "FOR NO KEY UPDATE"
            hold_s = 2.0
            set_target(2)

            def create_against(hold_sql: str, hold_args: tuple):
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
                    cc = httpx.Client(timeout=90.0)
                    try:
                        t0 = time.perf_counter()
                        rr = create_seller(cc, NEW, staff, f"g7 {RUN}")
                        out["ms"] = (time.perf_counter() - t0) * 1000
                        out["status"] = rr.status_code
                        out["code"] = body_of(rr).get("code")
                    except Exception as e:  # noqa: BLE001
                        out["error"] = repr(e)
                    finally:
                        cc.close()

                h = threading.Thread(target=hold)
                h.start()
                taken.wait(timeout=20)
                k = threading.Thread(target=call)
                k.start()
                time.sleep(hold_s)
                release.set()
                h.join(timeout=20)
                k.join(timeout=90)
                return float(out.get("ms", -1.0)), out, err

            t0 = time.perf_counter()
            free_r = create_seller(c, NEW, staff, f"g7 free {RUN}")
            free_ms = (time.perf_counter() - t0) * 1000
            print(f"  nothing held        : {free_ms:7.0f} ms "
                  f"(status {free_r.status_code})")
            check(free_r.status_code == 201 and free_ms < hold_s * 1000 * 0.5,
                  f"G7 control: with NOTHING held the create answers 201 in "
                  f"{free_ms:.0f} ms, well inside the {hold_s:.1f}s hold")

            w_ms, w_out, w_err = create_against(
                f"SELECT id FROM tenants {LOCK_MODE}", ())
            print(f"  the refill's lock   : {w_ms:7.0f} ms "
                  f"(status {w_out.get('status')})")
            check(not w_err and w_ms >= hold_s * 1000 * 0.75,
                  f"G7: with the tenant row held the way THE REFILL holds it, "
                  f"POST /sellers WAITED ({w_ms:.0f} ms against a {hold_s:.1f}s "
                  f"hold) -- the create path takes the lock BEFORE it derives "
                  f"(holder_err={w_err.get('e')})")
            check(w_ms - free_ms >= hold_s * 1000 * 0.7,
                  f"G7: and the DIFFERENCE is about the hold "
                  f"({w_ms - free_ms:.0f} ms), asserted by DIRECTION against the "
                  "control")
            check(w_out.get("status") == 201,
                  f"G7: and the wait ENDED IN A NORMAL 201 "
                  f"({w_out.get('status')}) -- a lock that turned a create into a "
                  "failure would satisfy the two cells above")

            o_ms, o_out, o_err = create_against(
                "INSERT INTO uoms (tenant_id, code, name) VALUES ($1, $2, $3)",
                (TENANT_A_ID, f"ZZG7-{RUN}", f"g7 key share {RUN}"))
            print(f"  a bill being written: {o_ms:7.0f} ms "
                  f"(status {o_out.get('status')})")
            check(not o_err and o_out.get("status") == 201
                  and 0 <= o_ms < hold_s * 1000 * 0.5,
                  f"G7: AND AN ORDINARY IN-FLIGHT WRITE FOR THE SAME SHOP DOES "
                  f"NOT STALL IT -- {o_ms:.0f} ms, status {o_out.get('status')}. "
                  "This pins the MODE: every tenant-scoped INSERT holds FOR KEY "
                  "SHARE on the tenant row, FOR UPDATE conflicts with it and FOR "
                  f"NO KEY UPDATE does not (holder_err={o_err.get('e')})")

            # ============================================================ G2c
            banner("G2 (c) - a refill and a no-code create, CONCURRENTLY")
            set_target(3)
            dev2c = uuid.uuid4()
            barrier2 = threading.Barrier(2)
            out2c: dict = {}
            l2 = threading.Lock()

            def do_refill() -> None:
                cc = httpx.Client(timeout=60.0)
                try:
                    barrier2.wait(timeout=20)
                    t0 = time.perf_counter()
                    rr = refill(cc, NEW, staff, dev2c)
                    with l2:
                        out2c["refill"] = (rr.status_code, t0,
                                           time.perf_counter())
                finally:
                    cc.close()

            def do_create() -> None:
                cc = httpx.Client(timeout=60.0)
                try:
                    barrier2.wait(timeout=20)
                    t0 = time.perf_counter()
                    rr = create_seller(cc, NEW, staff, f"g2c {RUN}")
                    with l2:
                        out2c["create"] = (rr.status_code, t0,
                                           time.perf_counter())
                finally:
                    cc.close()

            ths = [threading.Thread(target=do_refill),
                   threading.Thread(target=do_create)]
            for t in ths:
                t.start()
            for t in ths:
                t.join(timeout=90)
            if "refill" not in out2c or "create" not in out2c:
                check(False, f"G2 (c): both requests returned ({sorted(out2c)})")
            else:
                (sr, ar, br), (sc, ac, bc) = out2c["refill"], out2c["create"]
                overlap = (min(br, bc) - max(ar, ac)) * 1000
                print(f"  refill={sr} create={sc}  request windows overlapped by "
                      f"{overlap:.1f} ms")
                check(overlap > 0 and sr == 200 and sc == 201,
                      f"G2 (c): both completed (refill={sr}, create={sc}) with "
                      f"overlapping request windows ({overlap:.1f} ms)")
                # THE SCOPE WORD: `sellers` against the codes still HELD, never
                # the whole relation. A SPENT reservation's code is in `sellers`
                # by construction -- that is what `spent` means -- so an unscoped
                # disjointness turns a CORRECT implementation red the moment
                # anything has been spent, and this run has spent several.
                shared = fetch(
                    "SELECT r.code FROM seller_code_reservations r"
                    " JOIN sellers s ON s.code = r.code WHERE r.state = 'held'"
                    "   AND r.device_id = $1", dev2c)
                held2c = held_of(dev2c)
                sellers_n = int(fetchval("SELECT count(*) FROM sellers"))
                print(f"  held by this device: {len(held2c)}   sellers rows: "
                      f"{sellers_n}   shared members: {len(shared)}")
                check(not shared and bool(held2c) and sellers_n > 0,
                      f"G2 (c): the codes still HELD by this device and the codes "
                      f"in `sellers` share no member ({len(shared)}), with both "
                      f"sets asserted non-empty ({len(held2c)}, {sellers_n})")
                print("  BOUND: the overlap above is between two REQUESTS, not")
                print("  between the two derivations. G7 is what measures the")
                print("  lock; this cell is the criterion's own staging and is")
                print("  reported as such.")

            banner("WHAT THIS RUN CANNOT SEE")
            print("  - ANY CLIENT. Nothing under mobile/ is touched or executed,")
            print("    so that the token is on the wire FROM THE DEVICE is not")
            print("    measured here -- it needs the outbox kind.")
            print("  - THAT THE TOKEN IS UNGUESSABLE. G6 shows an unknown token")
            print("    is refused; entropy is not measurable from outside.")
            print("  - A CALLER WHO INVENTS DEVICE IDENTITIES. Every identity")
            print("    here is a uuid this process generated, and nothing")
            print("    authenticates a device -- a recorded bound, not a hole.")
            print("  - THE SHOP-WIDE INVARIANT. G5's queries are scoped to this")
            print("    run's devices so the proof can pass twice; a standing")
            print("    check over every row belongs in reconcile.py and is not")
            print("    built.")
            print("  - WHICH ARM the concurrent replay's loser took. Both are")
            print("    correct, and G4b asserts the outcome rather than the path.")
    finally:
        if original_target is not None:
            try:
                set_target(original_target)
                check(int(fetchval(
                    "SELECT seller_code_target_holding FROM tenants"))
                    == original_target,
                    f"cleanup: the shop's target holding is back at "
                    f"{original_target}")
            except Exception as e:  # noqa: BLE001
                check(False, f"cleanup: could not restore the target: {e}")
        if new_proc is not None:
            stop(new_proc, new_log)
        if old_proc is not None:
            stop(old_proc, old_log)
        # The worktree lifecycle: remove ONLY what this run built, in its own try
        # so a failure here does not swallow the server stops above.
        if built_worktree is not None:
            try:
                remove_old_worktree(built_worktree)
            except Exception as e:  # noqa: BLE001
                check(False,
                      f"cleanup: could not remove the worktree {built_worktree}: {e}")

    banner("SUMMARY")
    if failures:
        for f in failures:
            print(f"  FAILED: {f}")
    print(f"  failures: {len(failures)}")
    return 1 if failures else 0


if __name__ == "__main__":
    rc = main()
    print(f"PROVE_SELLER_CODE_GUARDS_EXIT={rc}")
    sys.exit(rc)
