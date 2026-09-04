#!/usr/bin/env python
"""Prove branches (migration 0018): one shop, many yards, one legal series per yard.

    python scripts/prove_branches.py --from <pre-0018 backup dir> --database recycle_branches_scratch

RUNS AGAINST A SCRATCH ONLY, AND BUILDS THAT SCRATCH ITSELF: it restores the
given PRE-0018 backup into --database (overwriting it), reads every (id, doc_no)
pair and every counter high-water mark, runs `alembic upgrade head` on the copy,
reads them again, and only then starts a uvicorn child bound to the copy and
mints bills through the real POST /bills. Every write lands in the scratch; the
live database is never named. It refuses the live database by name, and it
refuses a backup that is already at 0018 -- the before/after cell needs a 0017
copy or it compares the migration's output with itself.

THE CELLS, and the disproof each one stands against:

  B1  the migration applies (exit 0, alembic_version 0018).
  B2  EVERY (id, doc_no) pair is byte-identical before and after, compared value
      against value over the whole table, with a control that reddens on one
      altered pair. Disproof: any prefix other than the born-with 'B' would move
      every string.
  B3  every (tenant, be_year, last_seq) triple is identical before and after --
      the high-water mark. Disproof: a re-key that restarted the counter.
  B4  THE CONTINUITY CELL, the most important one in the unit: the first bill
      minted after the migration on the born-with branch takes seq = last_seq
      BEFORE + 1 (617 -> 618 on Shop A's dump of 2026-09-03). The cell prints
      what a RESTARTED series would have produced (seq 1) beside what was
      observed, and SKIPs rather than passes when the copy holds no counter for
      the current year, because then the two are indistinguishable.
  B5  a bill with NO branch_id in its payload -- the shape every pre-0018 outbox
      holds -- is accepted on a single-branch tenant and lands in the born-with
      branch. This is the server half of "the queued bill survives"; the phone
      half is mobile prove:branch.
  B6  two branches mint two INDEPENDENT series with two prefixes: after a
      second branch (YARD2, prefix C) exists, its first bill is C-<year>-1, its
      second C-<year>-2, and the born-with branch's next bill continues its own
      series at +1. Disproof (a) in the brief: had the counter key lost its
      branch leg, YARD2's first bill would have taken MAIN's next number.
  B7  a bill naming ANOTHER TENANT'S branch is refused 422 by the handler (the
      branch is invisible under RLS), no bill row exists and no counter moved.
      The composite-FK half of "unrepresentable" is prove_rls.py STEP 7.
  B8  a bill naming a DEACTIVATED branch is refused 424 branch_inactive, the
      resolvable class, and reactivating it lets the SAME payload through.
  B9  on a multi-branch tenant an UNSCOPED caller sending no branch is refused
      424 branch_unresolved (active_branches=2); scoping the user to MAIN makes
      the SAME payload land in MAIN. Not a permission check -- a resolution.
  B10 GET /shop reports the caller's branch: MAIN with branch_count 1 on a
      single-branch tenant; null with branch_count 2 when unscoped on the
      two-branch tenant; MAIN again when scoped.
  B11 hard rule 4 still holds across branches: replaying B4's idempotency key
      answers 200 with the SAME doc_no, on the same branch.
  B12 reconcile.py on the two-branch scratch exits 0 -- T8/T9 per (branch,
      year), T17 and T18 green over two live series. Disproof: a reconciler
      that still grouped by year alone would red on the interleaved numbering.

Every assertion is a DELTA or a set comparison, never an absolute number
(lessons/proof-must-run-twice.md); the run tag scopes every idempotency key, and
the scratch is rebuilt each run, so the proof is green twice by construction.
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

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SERVER_DIR)

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import asyncpg  # noqa: E402
import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from app.bills import _be_year  # noqa: E402
from app.seeddata import (  # noqa: E402
    ADMIN_USERNAME,
    PRODUCT_A_ID,
    SELLER_A_ID,
    TENANT_A_ID,
    TENANT_A_PASSWORD,
    TENANT_B_ID,
)

RUN = uuid.uuid4().hex[:8]
BE_YEAR = _be_year(datetime.now(tz=timezone.utc))
DOC_NO_RE = re.compile(r"^([A-Z]{1,4})-(\d{4})-([1-9]\d*)$")
SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000"

failures: list[str] = []
skips: list[str] = []


def banner(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def check(cond: bool, label: str, detail: str = "") -> None:
    if not cond:
        failures.append(label)
    print(f"  [{'ok ' if cond else 'RED'}] {label}" + (f"  -- {detail}" if detail else ""))


def skip(label: str, why: str) -> None:
    skips.append(label)
    print(f"  [SKIP] {label}  -- {why}")


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


# ---------------------------------------------------------------------------
# Postgres on the SCRATCH, as the cluster superuser, with tenant + actor context
# ---------------------------------------------------------------------------
class Db:
    def __init__(self, dsn: str) -> None:
        self.dsn = dsn

    async def _run(self, fn, tenant: uuid.UUID | None):
        conn = await asyncpg.connect(self.dsn)
        try:
            tx = conn.transaction()
            await tx.start()
            try:
                if tenant is not None:
                    await conn.execute("SELECT set_config('app.tenant_id', $1, true)", str(tenant))
                    # branches and users are AUDITED (0017): a write needs an actor.
                    await conn.execute("SELECT set_config('app.actor_id', $1, true)", SYSTEM_ACTOR)
                    await conn.execute("SELECT set_config('app.actor_username', $1, true)",
                                       "system:prove_branches")
                out = await fn(conn)
                await tx.commit()
                return out
            except BaseException:
                await tx.rollback()
                raise
        finally:
            await conn.close()

    def fetch(self, sql: str, *args, tenant: uuid.UUID | None = None) -> list:
        return asyncio.run(self._run(lambda c: c.fetch(sql, *args), tenant))

    def fetchval(self, sql: str, *args, tenant: uuid.UUID | None = None):
        return asyncio.run(self._run(lambda c: c.fetchval(sql, *args), tenant))

    def execute(self, sql: str, *args, tenant: uuid.UUID | None = None) -> str:
        return asyncio.run(self._run(lambda c: c.execute(sql, *args), tenant))


def snapshot_bills(db: Db) -> dict[str, str | None]:
    # Superuser: BYPASSRLS, so this is every row in the table, all tenants.
    return {str(r["id"]): r["doc_no"] for r in
            db.fetch("SELECT id, doc_no FROM purchase_bills")}


def snapshot_counters(db: Db) -> dict[tuple[str, int], int]:
    return {(str(r["tenant_id"]), int(r["be_year"])): int(r["last_seq"]) for r in
            db.fetch("SELECT tenant_id, be_year, last_seq FROM doc_no_counters")}


# ---------------------------------------------------------------------------
# subprocess helpers: restore, alembic, uvicorn, reconcile
# ---------------------------------------------------------------------------
def run_restore(backup_dir: str, scratch: str) -> None:
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "restore_db.py"), backup_dir, "--into", scratch],
        cwd=SERVER_DIR, capture_output=True, text=True, timeout=600, encoding="utf-8",
        errors="replace")
    if cp.returncode != 0:
        raise RuntimeError(f"restore_db.py -> {scratch} failed (exit {cp.returncode}):\n"
                           f"{(cp.stdout + cp.stderr)[-1500:]}")


def run_alembic(scratch: str, *args: str) -> int:
    env = dict(os.environ)
    env["MIGRATION_DATABASE_URL"] = (
        make_url(os.environ["MIGRATION_DATABASE_URL"]).set(database=scratch)
        .render_as_string(hide_password=False))
    env["PYTHONIOENCODING"] = "utf-8"
    cp = subprocess.run([sys.executable, "-m", "alembic", *args], cwd=SERVER_DIR, env=env,
                        capture_output=True, text=True, timeout=600, encoding="utf-8",
                        errors="replace")
    if cp.returncode != 0:
        print((cp.stdout + cp.stderr)[-1500:])
    return cp.returncode


def run_reconcile(scratch: str) -> tuple[int, str]:
    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    # --verbose, so every per-tenant check line is printed (a clean tenant
    # otherwise collapses to "N checks, all clean") and B12 can read T8's title.
    cp = subprocess.run(
        [sys.executable, os.path.join("scripts", "reconcile.py"), "--database", scratch,
         "--verbose"],
        cwd=SERVER_DIR, env=env, capture_output=True, text=True, timeout=600,
        encoding="utf-8", errors="replace")
    return cp.returncode, cp.stdout + cp.stderr


def wait_for_health(proc: subprocess.Popen, base: str, timeout_s: float = 60.0) -> str:
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


def start_server(scratch: str):
    """A uvicorn child bound to the SCRATCH: APP_DATABASE_URL and
    DIRECTORY_DATABASE_URL rebound by name, everything else (JWT_SECRET) from
    server/.env as the real server reads it."""
    env = dict(os.environ)
    for key in ("APP_DATABASE_URL", "DIRECTORY_DATABASE_URL"):
        env[key] = make_url(os.environ[key]).set(database=scratch).render_as_string(
            hide_password=False)
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(  # noqa: SIM115 - closed in stop()
        prefix="prove_branches_", suffix=".log", delete=False, mode="w+")
    proc = subprocess.Popen(
        [sys.executable, "-u", "-m", "uvicorn", "app.main:app",
         "--host", "127.0.0.1", "--port", str(port), "--log-level", "warning"],
        cwd=SERVER_DIR, env=env, stdout=log, stderr=subprocess.STDOUT)
    return proc, base, log


def stop(proc, log) -> None:
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


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def login(client: httpx.Client, base: str) -> str:
    r = client.post(f"{base}/auth/login", json={
        "tenant_id": str(TENANT_A_ID), "username": ADMIN_USERNAME,
        "password": TENANT_A_PASSWORD})
    r.raise_for_status()
    return r.json()["access_token"]


def body_of(r: httpx.Response) -> dict:
    try:
        b = r.json()
    except Exception:  # noqa: BLE001
        return {}
    return b if isinstance(b, dict) else {}


def detail_of(r: httpx.Response) -> dict:
    d = body_of(r).get("detail")
    return d if isinstance(d, dict) else {}


def bill_body(tag: str, branch_id: str | None = None) -> dict:
    body = {
        "id": str(uuid.uuid4()),
        "seller_id": str(SELLER_A_ID),
        "vehicle_no": f"br-{RUN}",
        "device_created_at": datetime.now(tz=timezone.utc).isoformat(),
        "idempotency_key": f"branches-{RUN}-{tag}",
        "items": [{
            "id": str(uuid.uuid4()), "product_id": str(PRODUCT_A_ID), "line_no": 1,
            "gross_weight": "10.000", "tare_weight": "0.000", "net_weight": "10.000",
            "unit_price": "15.00", "list_price": "15.00",
        }],
    }
    if branch_id is not None:
        body["branch_id"] = branch_id
    return body


def seq_of(doc_no: str) -> int:
    m = DOC_NO_RE.match(doc_no or "")
    return int(m.group(3)) if m else -1


def prefix_of(doc_no: str) -> str:
    m = DOC_NO_RE.match(doc_no or "")
    return m.group(1) if m else ""


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description="Prove branches (0018) on a scratch.")
    ap.add_argument("--from", dest="backup", required=True,
                    help="a backup_db.py directory taken at alembic 0017 (pre-0018)")
    ap.add_argument("--database", required=True,
                    help="the SCRATCH to restore into and break; never the live one")
    args = ap.parse_args()

    live = make_url(os.environ["APP_DATABASE_URL"]).database
    if args.database == live:
        print(f"REFUSED: --database {args.database!r} is the LIVE database. This script"
              " restores a dump over it, deactivates branches and scopes users. Name a"
              " scratch.")
        return 2
    owner = make_url(os.environ["MIGRATION_DATABASE_URL"])
    # The cluster superuser seat reconcile.py / restore_db.py use on this dev
    # cluster (the prove_seller_code_guards shape): BYPASSRLS, so before/after
    # snapshots read EVERY row rather than the zero FORCE RLS shows an owner.
    db = Db(f"postgresql://postgres:postgres@{owner.host}:{owner.port}/{args.database}")

    banner(f"B0  restore {os.path.basename(args.backup)} -> {args.database}")
    run_restore(args.backup, args.database)
    version = db.fetchval("SELECT version_num FROM alembic_version")
    print(f"  restored copy is at alembic {version}")
    if version != "0017":
        print(f"REFUSED: the backup is at {version}, not 0017. The before/after cells need a"
              " PRE-0018 copy; a copy already at 0018 would compare the migration with"
              " itself.")
        return 2
    bills_before = snapshot_bills(db)
    counters_before = snapshot_counters(db)
    print(f"  before: {len(bills_before)} bills, {len(counters_before)} counter rows:"
          f" {sorted((t[:8], y, n) for (t, y), n in counters_before.items())}")

    banner("B1  alembic upgrade head on the copy")
    rc = run_alembic(args.database, "upgrade", "head")
    # AT OR PAST 0018, not exactly 0018: `upgrade head` lands wherever the tree's
    # head is (0019 the day the permission model landed), and every cell below
    # reads the BRANCH schema, which no later migration has touched. Exactly
    # "0018" was a cell that expired the day a later migration existed.
    after_version = db.fetchval("SELECT version_num FROM alembic_version")
    check(rc == 0 and str(after_version) >= "0018", "B1: the migration applied",
          f"alembic exit={rc} version={after_version} (head is at or past 0018)")
    if rc != 0:
        return 1

    banner("B2  every (id, doc_no) pair identical, value against value")
    bills_after = snapshot_bills(db)
    moved = [i for i in bills_before if bills_after.get(i) != bills_before[i]]
    check(set(bills_before) == set(bills_after) and not moved,
          f"B2: {len(bills_before)} bills before, {len(bills_after)} after, 0 doc_no moved",
          f"moved={moved[:5]}")
    # CONTROL: the comparison reddens on ONE altered pair, or it measured nothing.
    ctrl = dict(bills_after)
    some = next(i for i in ctrl if ctrl[i])
    ctrl[some] = ctrl[some] + "x"
    ctrl_moved = [i for i in bills_before if ctrl.get(i) != bills_before[i]]
    check(ctrl_moved == [some], "B2 control: one altered pair is detected",
          f"detected={len(ctrl_moved)}")

    banner("B3  every counter high-water mark identical")
    counters_after = snapshot_counters(db)
    check(counters_before == counters_after,
          "B3: (tenant, be_year, last_seq) identical before and after the re-key",
          f"before={sorted(counters_before.items())} after={sorted(counters_after.items())}")
    born = {str(r["tenant_id"]): str(r["id"]) for r in
            db.fetch("SELECT tenant_id, id FROM branches WHERE code = 'MAIN'")}
    on_born = db.fetchval(
        "SELECT count(*) FROM purchase_bills b JOIN branches br ON br.id = b.branch_id"
        " WHERE br.code = 'MAIN'")
    check(int(on_born) == len(bills_after) and str(TENANT_A_ID) in born,
          f"B3: every one of the {len(bills_after)} bills reads back on its tenant's born-with"
          " branch", f"on MAIN={on_born}")

    # ------------------------------------------------------------ the server
    proc, base, log = start_server(args.database)
    try:
        why = wait_for_health(proc, base)
        if why:
            print(f"  server did not come up: {why}")
            failures.append("uvicorn child on the scratch")
            return 1
        print(f"  uvicorn child on {base} bound to {args.database}")
        client = httpx.Client(timeout=30.0)
        token = login(client, base)
        main_id = born[str(TENANT_A_ID)]
        a_before = counters_before.get((str(TENANT_A_ID), BE_YEAR))

        banner("B4  THE CONTINUITY CELL: the next number continues the series")
        r4 = client.post(f"{base}/bills", headers=auth(token), json=bill_body("b4"))
        d4 = body_of(r4)
        print(f"  POST /bills (no branch_id) -> {r4.status_code} doc_no={d4.get('doc_no')}"
              f" branch_id={d4.get('branch_id')}")
        if a_before is None:
            skip("B4: continuity", f"the copy holds no counter for tenant A in {BE_YEAR};"
                 " a continued and a restarted series are indistinguishable here")
        else:
            expected = f"B-{BE_YEAR}-{a_before + 1}"
            restarted = f"B-{BE_YEAR}-1"
            check(r4.status_code == 201 and d4.get("doc_no") == expected,
                  f"B4: last_seq before={a_before}, first bill after={d4.get('doc_no')},"
                  f" expected {expected}",
                  f"a RESTARTED series would have produced {restarted}")
            check(expected != restarted or a_before == 0,
                  "B4: the cell can distinguish continued from restarted",
                  f"before={a_before}")
        check(d4.get("branch_id") == main_id,
              "B5: a payload with NO branch_id lands in the born-with branch (the pre-0018"
              " outbox shape survives)", f"branch_id={d4.get('branch_id')} MAIN={main_id}")
        doc4 = d4.get("doc_no") or ""

        banner("B6  two branches, two independent series, two prefixes")
        yard2 = str(uuid.uuid4())
        db.execute("INSERT INTO branches (id, tenant_id, code, name, doc_prefix, is_active)"
                   " VALUES ($1, $2, 'YARD2', $3, 'C', true)",
                   uuid.UUID(yard2), TENANT_A_ID, f"Yard two {RUN}", tenant=TENANT_A_ID)
        r6a = client.post(f"{base}/bills", headers=auth(token), json=bill_body("b6a", yard2))
        r6b = client.post(f"{base}/bills", headers=auth(token), json=bill_body("b6b", yard2))
        r6c = client.post(f"{base}/bills", headers=auth(token), json=bill_body("b6c", main_id))
        d6a, d6b, d6c = body_of(r6a), body_of(r6b), body_of(r6c)
        print(f"  YARD2 #1 -> {r6a.status_code} {d6a.get('doc_no')};"
              f" YARD2 #2 -> {r6b.status_code} {d6b.get('doc_no')};"
              f" MAIN next -> {r6c.status_code} {d6c.get('doc_no')}")
        check(r6a.status_code == 201 and d6a.get("doc_no") == f"C-{BE_YEAR}-1"
              and d6a.get("branch_id") == yard2,
              "B6: the second branch's first bill is C-<year>-1", f"got {d6a.get('doc_no')}")
        check(r6b.status_code == 201 and d6b.get("doc_no") == f"C-{BE_YEAR}-2",
              "B6: its second is C-<year>-2", f"got {d6b.get('doc_no')}")
        check(r6c.status_code == 201 and prefix_of(d6c.get("doc_no")) == "B"
              and seq_of(d6c.get("doc_no")) == seq_of(doc4) + 1,
              "B6: the born-with branch continues its OWN series at +1, untouched by YARD2's"
              " two bills", f"MAIN went {doc4} -> {d6c.get('doc_no')}")
        # DISPROOF (a) stated as the observation that distinguishes it: with the
        # branch leg dropped from the counter key, YARD2's first bill would have
        # taken MAIN's next number, seq_of(doc4)+1, not 1.
        check(seq_of(d6a.get("doc_no")) == 1 and seq_of(doc4) + 1 != 1,
              "B6 disproof (a): a shared counter would have numbered YARD2's first bill"
              f" {seq_of(doc4) + 1}; it is 1")
        rows = db.fetch("SELECT br.code, c.be_year, c.last_seq FROM doc_no_counters c"
                        " JOIN branches br ON br.id = c.branch_id"
                        " WHERE c.tenant_id = $1 ORDER BY br.code", TENANT_A_ID)
        print(f"  counters now: {[(r['code'], r['be_year'], r['last_seq']) for r in rows]}")
        check(any(r["code"] == "YARD2" and r["last_seq"] == 2 for r in rows)
              and any(r["code"] == "MAIN" and r["last_seq"] == seq_of(d6c.get("doc_no"))
                      for r in rows),
              "B6: two counter rows, one per branch, each at its own high-water mark")

        banner("B7  a bill naming ANOTHER TENANT'S branch is unrepresentable")
        b_main = born.get(str(TENANT_B_ID))
        if b_main is None:
            skip("B7", "the copy holds no born-with branch for tenant B")
        else:
            counters_pre7 = snapshot_counters(db)
            body7 = bill_body("b7", b_main)
            r7 = client.post(f"{base}/bills", headers=auth(token), json=body7)
            print(f"  tenant A posting branch_id=<tenant B's MAIN> -> {r7.status_code}"
                  f" {str(body_of(r7).get('detail'))[:80]}")
            check(r7.status_code == 422, "B7: refused 422 by the handler (the branch is not"
                  " visible under tenant A's RLS context)", f"status={r7.status_code}")
            exists = db.fetchval("SELECT count(*) FROM purchase_bills WHERE id = $1",
                                 uuid.UUID(body7["id"]))
            check(int(exists) == 0 and snapshot_counters(db) == counters_pre7,
                  "B7: no bill row exists and no counter moved")

        banner("B8  a DEACTIVATED branch is a resolvable 424, and reactivation clears it")
        db.execute("UPDATE branches SET is_active = false WHERE id = $1", uuid.UUID(yard2),
                   tenant=TENANT_A_ID)
        body8 = bill_body("b8", yard2)
        r8 = client.post(f"{base}/bills", headers=auth(token), json=body8)
        check(r8.status_code == 424 and detail_of(r8).get("code") == "branch_inactive",
              "B8: 424 branch_inactive while YARD2 is deactivated",
              f"status={r8.status_code} code={detail_of(r8).get('code')}")
        db.execute("UPDATE branches SET is_active = true WHERE id = $1", uuid.UUID(yard2),
                   tenant=TENANT_A_ID)
        r8b = client.post(f"{base}/bills", headers=auth(token), json=body8)
        check(r8b.status_code == 201 and body_of(r8b).get("doc_no") == f"C-{BE_YEAR}-3",
              "B8: the SAME payload is accepted after reactivation, continuing YARD2's series",
              f"status={r8b.status_code} doc_no={body_of(r8b).get('doc_no')}")

        banner("B9  unscoped caller, two branches, no branch in the payload")
        body9 = bill_body("b9")
        r9 = client.post(f"{base}/bills", headers=auth(token), json=body9)
        check(r9.status_code == 424 and detail_of(r9).get("code") == "branch_unresolved"
              and detail_of(r9).get("active_branches") == "2",
              "B9: 424 branch_unresolved naming active_branches=2",
              f"status={r9.status_code} detail={detail_of(r9)}")
        admin_id = db.fetchval("SELECT id FROM users WHERE tenant_id = $1 AND username = $2",
                               TENANT_A_ID, ADMIN_USERNAME)
        db.execute("UPDATE users SET branch_id = $1 WHERE id = $2", uuid.UUID(main_id),
                   admin_id, tenant=TENANT_A_ID)
        r9b = client.post(f"{base}/bills", headers=auth(token), json=body9)
        d9b = body_of(r9b)
        check(r9b.status_code == 201 and d9b.get("branch_id") == main_id
              and prefix_of(d9b.get("doc_no")) == "B",
              "B9: the SAME payload lands in MAIN once the user is scoped to it",
              f"status={r9b.status_code} doc_no={d9b.get('doc_no')}")

        banner("B10 GET /shop reports the caller's branch")
        s_scoped = body_of(client.get(f"{base}/shop", headers=auth(token)))
        check((s_scoped.get("branch") or {}).get("id") == main_id
              and s_scoped.get("branch_count") == 2,
              "B10: scoped caller on a two-branch shop -> branch=MAIN, branch_count=2",
              f"branch={s_scoped.get('branch')} count={s_scoped.get('branch_count')}")
        db.execute("UPDATE users SET branch_id = NULL WHERE id = $1", admin_id,
                   tenant=TENANT_A_ID)
        s_unscoped = body_of(client.get(f"{base}/shop", headers=auth(token)))
        check(s_unscoped.get("branch") is None and s_unscoped.get("branch_count") == 2,
              "B10: unscoped caller on a two-branch shop -> branch=null, branch_count=2",
              f"branch={s_unscoped.get('branch')} count={s_unscoped.get('branch_count')}")
        db.execute("UPDATE branches SET is_active = false WHERE id = $1", uuid.UUID(yard2),
                   tenant=TENANT_A_ID)
        s_single = body_of(client.get(f"{base}/shop", headers=auth(token)))
        check((s_single.get("branch") or {}).get("id") == main_id
              and (s_single.get("branch") or {}).get("doc_prefix") == "B"
              and s_single.get("branch_count") == 1,
              "B10: with one active branch -> branch=MAIN (prefix B), branch_count=1",
              f"branch={s_single.get('branch')} count={s_single.get('branch_count')}")
        db.execute("UPDATE branches SET is_active = true WHERE id = $1", uuid.UUID(yard2),
                   tenant=TENANT_A_ID)

        banner("B11 hard rule 4 across branches: a replayed key is the same bill")
        r11 = client.post(f"{base}/bills", headers=auth(token), json=bill_body("b4"))
        d11 = body_of(r11)
        check(r11.status_code == 200 and d11.get("doc_no") == doc4
              and d11.get("branch_id") == main_id,
              "B11: replaying B4's key answers 200 with the same doc_no and branch",
              f"status={r11.status_code} doc_no={d11.get('doc_no')}")
        client.close()
    finally:
        stop(proc, log)

    banner("B12 reconcile.py on the two-branch scratch")
    rc, out = run_reconcile(args.database)
    tail = [ln for ln in out.splitlines() if ln.startswith("RECONCILE") or "VIOLATIONS" in ln]
    print("  " + " | ".join(tail[-2:]))
    check(rc == 0, "B12: reconcile exits 0 with two live series (T8/T9 per branch, T17, T18)",
          f"exit={rc}")
    t8 = [ln for ln in out.splitlines()
          if "T8" in ln and "(tenant, branch, be_year)" in ln and "series" in ln]
    check(bool(t8), "B12: T8 reports per (tenant, branch, be_year)",
          (t8 or ["no T8 line"])[0].strip()[:120])

    banner("summary")
    print(f"  RED   : {len(failures)}")
    for f in failures:
        print(f"    - {f}")
    print(f"  SKIP  : {len(skips)}")
    for s in skips:
        print(f"    - {s}")
    return 1 if failures else 0


if __name__ == "__main__":
    rc = main()
    print(f"PROVE_BRANCHES_EXIT={rc}")
    sys.exit(rc)
