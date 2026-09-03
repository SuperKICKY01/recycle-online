"""Break the reconciler on purpose, and prove it catches each break by name.

    python scripts/prove_reconcile.py --database recycle_recon_break

A checker that has never caught anything is decoration. This script injects one
violation at a time into a RESTORED COPY of the database, runs
`scripts/reconcile.py` against that copy as a subprocess, and asserts that:

  * exactly the expected check ids fire, with the expected counts;
  * the printed report NAMES THE ACTUAL ROW — the assertion is made against the
    human report, not against a machine format, because "it must scream" is a
    claim about what a person reads at 07:00;
  * undoing the injection returns the copy to a clean, exit-0 run.

That last step is what makes each result mean anything. A checker whose green is
sticky, or whose red never clears, would pass an injection test that only ever
looked at the red.

SAFETY — THREE GATES, BECAUSE THIS SCRIPT ISSUES DESTRUCTIVE SQL
----------------------------------------------------------------
1. It REFUSES to run against the database named in APP_DATABASE_URL. The copy is
   the subject; the live money data is never the subject.
2. It refuses any injection whose SQL touches a ROLE. `ALTER ROLE recycle_app
   BYPASSRLS` would be the natural way to prove check S4 — and roles are
   CLUSTER-WIDE, so it would disable tenant isolation on the LIVE database
   sitting in the same cluster. A proof that endangers production is not a
   proof. S4 is therefore listed below as DELIBERATELY NOT INJECTED, with this
   as the reason, rather than quietly skipped. The gate is mechanical (the SQL
   is scanned) rather than a promise to remember.
3. Every injection is undone and re-verified before the next one runs, so a
   failure part-way through cannot silently compound into the next result.

THE BASELINE PROBLEM, AND WHY THE COPY IS NORMALISED FIRST
-----------------------------------------------------------
The live database is NOT clean: it carries 84 violations, all of them debris
from proof scripts (see the phase report). Injecting into that would mean
asserting deltas against a dirty floor, and every result would be one
subtraction away from meaningless.

So the copy is first NORMALISED — the two known debris causes, and nothing else,
are undone IN THE COPY. That the checker then goes fully green is not a
convenience: it is the PROOF OF THE DIAGNOSIS. If those two causes did not
account for all 84, the run stops right here and says so.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import sys
import uuid as uuidlib
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SERVER_DIR)

import asyncpg  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv()

try:  # pragma: no cover
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass

RECONCILE = os.path.join(SERVER_DIR, "scripts", "reconcile.py")
RESTORE = os.path.join(SERVER_DIR, "scripts", "restore_db.py")

_failures: list[str] = []
_skipped: list[str] = []


class Unfit(Exception):
    """The copy cannot be injected into. NOT "the money is wrong".

    reconcile.py separates exit 1 ("at least one VIOLATION") from exit 2 ("the
    checker could not run") and says why in its own docstring: anything that
    treats them the same will one day report a silent green because the database
    was unreachable. That discipline was never applied to THIS script. A copy
    that could not be normalised, or that does not hold the rows the injections
    aim at, exited 1 — the same code as an injection that failed to fire, so a
    dirty fixture and a broken checker shared an outcome. Raised here, answered
    with exit 2 in main().
    """


def check(label: str, ok: bool, detail: str = "") -> bool:
    print(f"    [{'OK  ' if ok else 'FAIL'}] {label}" + (f" - {detail}" if detail else ""))
    if not ok:
        _failures.append(label)
    return ok


def skip(label: str, reason: str) -> None:
    """A claim whose PRECONDITION is absent. Not a pass, and not a failure.

    lessons/proof-must-run-twice.md, fourth amendment: a proof must SKIP rather
    than pass when a claim's precondition is absent. The reason is printed
    beside it and the count is carried into the summary, so "exit 0 with three
    claims never exercised" cannot be read off as "exit 0".
    """
    print(f"    [SKIP] {label}")
    print(f"           {reason}")
    _skipped.append(label)


def header(title: str) -> None:
    print(f"\n=== {title} ===")


# ---------------------------------------------------------------------------
# Running the checker and reading its report
# ---------------------------------------------------------------------------
EXIT_RE = re.compile(r"^RECONCILE_EXIT=(\d+)$", re.M)
COUNT_RE = re.compile(r"^ {6}([A-Z]\d+): (\d+)$", re.M)
TOTAL_RE = re.compile(r"^ +VIOLATIONS +: (\d+)$", re.M)


def decode(raw: bytes) -> str:
    """Subprocess stdout, with line endings normalised.

    THE \\r MATTERS. A child Python writing to a pipe on Windows emits CRLF, and
    `$` under re.MULTILINE anchors before \\n — with a \\r sitting in between,
    every anchored pattern here silently matches NOTHING. The first run of this
    script failed with "reconcile.py printed no RECONCILE_EXIT line" while the
    line was plainly in the output.
    """
    return raw.decode("utf-8", errors="replace").replace("\r\n", "\n")


@dataclass
class Run:
    exit_code: int
    total: int
    counts: dict[str, int]
    out: str

    def names(self, needle: str) -> bool:
        return needle in self.out


async def run_reconcile(database: str, *extra: str) -> Run:
    # --max-rows 5 rather than 0: the two RLS injections cascade into tens of
    # thousands of rows, and every assertion below needs at most two of them.
    proc = await asyncio.create_subprocess_exec(
        sys.executable, RECONCILE, "--database", database, "--max-rows", "5", *extra,
        cwd=SERVER_DIR,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
    )
    raw, _ = await proc.communicate()
    out = decode(raw)
    m = EXIT_RE.search(out)
    if not m:
        print(out[-4000:])
        raise RuntimeError("reconcile.py printed no RECONCILE_EXIT line")
    total_m = TOTAL_RE.search(out)
    return Run(
        exit_code=int(m.group(1)),
        total=int(total_m.group(1)) if total_m else -1,
        counts={k: int(v) for k, v in COUNT_RE.findall(out)},
        out=out,
    )


# ---------------------------------------------------------------------------
# One injection
# ---------------------------------------------------------------------------
@dataclass
class Injection:
    id: str
    why: str
    apply: list[tuple[str, tuple]] = field(default_factory=list)
    undo: list[tuple[str, tuple]] = field(default_factory=list)
    expect: dict[str, int] = field(default_factory=dict)
    expect_rows: list[str] = field(default_factory=list)
    mode: str = "exact"          # "exact" | "superset"

    # Tenant ids that must EACH carry a failing T0 in their own block of the
    # report. Deliberately not a count — see t0_tenants_named() below.
    expect_t0_for: list[str] = field(default_factory=list)

    # Non-empty = this claim's precondition is absent on this copy. SKIP with
    # the reason printed, never a quiet pass, and never applied.
    skip: str = ""


# ROLE, AND EVERY SPELLING POSTGRES ACCEPTS FOR IT — the alias list IS the gate's
# domain, and it lives here because no cell can hold it (see below).
#
# `ALTER USER`, `CREATE USER` and `DROP USER` are documented aliases of the ROLE
# forms and write pg_authid, the same catalogue. `ALTER GROUP` is the same family
# one step out: its RENAME form is defined as `ALTER ROLE ... RENAME`, and its
# ADD/DROP USER forms write role MEMBERSHIP in pg_auth_members. All of them are
# CLUSTER-WIDE, which is the only property gate 2 cares about.
#
# A pattern naming `role` alone therefore ADMITTED `ALTER USER recycle_app
# BYPASSRLS` — the exact statement this module's docstring says gate 2 exists to
# refuse, in the other spelling. Matching the keyword and not the engine's
# synonyms for it is how a mechanical gate quietly becomes the promise to
# remember that it was written to replace.
#
# WHY THE PROBE FOR THIS IS NOT A CELL IN THIS FILE. guard() raises SystemExit,
# so a probe injection carrying one of these statements would abort the whole
# run at the loop below rather than report a pass. A gate whose positive result
# kills the suite cannot be self-tested from inside it — the probe is external
# and one-off, which is why the alias list is written HERE, where the next person
# editing this pattern must read it. Re-run that probe when this line changes.
ROLE_SQL = re.compile(r"\b(alter|create|drop)\s+(role|user|group)\b", re.I)


def guard(inj: Injection) -> None:
    """Gate 2. Roles are cluster-wide; the live database shares this cluster."""
    for sql, _ in [*inj.apply, *inj.undo]:
        if ROLE_SQL.search(sql):
            raise SystemExit(
                f"REFUSED: injection {inj.id} contains a ROLE statement:\n    {sql}\n"
                "  Roles are CLUSTER-WIDE. That would reach the live database.")


async def exec_all(conn: asyncpg.Connection, stmts: list[tuple[str, tuple]]) -> None:
    for sql, params in stmts:
        await conn.execute(sql, *params)


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
async def main() -> int:
    ap = argparse.ArgumentParser(description="Break reconcile.py on purpose.")
    ap.add_argument("--database", required=True,
                    help="the RESTORED COPY to break. Must not be the live database.")
    ap.add_argument("--from", dest="backup", default=None,
                    help="a backup_db.py directory. The copy is restored from it FIRST, "
                         "so every run starts from the same known state.")
    ap.add_argument("--skip-restore", action="store_true",
                    help="use the copy as it stands. The diagnosis check below can then "
                         "only be SKIPPED, never passed — a copy this script has already "
                         "normalised would otherwise pass it having proved nothing.")
    ap.add_argument("--admin-dsn", default=os.environ.get("RECON_ADMIN_DSN", ""))
    args = ap.parse_args()
    if not args.backup and not args.skip_restore:
        print("REFUSED: pass --from <backup dir>, or --skip-restore if you mean it.\n"
              "  python scripts/backup_db.py\n"
              "  python scripts/prove_reconcile.py --database recycle_recon_break"
              " --from <dir>")
        return 2

    from sqlalchemy.engine import make_url

    live = make_url(os.environ["APP_DATABASE_URL"])
    if args.database == live.database:
        print(f"REFUSED: --database {args.database!r} is the LIVE database from"
              " APP_DATABASE_URL.\n  Restore a copy first:\n"
              "    python scripts/backup_db.py\n"
              "    python scripts/restore_db.py <dir> --into recycle_recon_break")
        return 2

    dsn = args.admin_dsn or (
        f"postgresql://postgres:postgres@{live.host}:{live.port}/{args.database}")

    print("=== prove_reconcile ===")
    print(f"  copy under test : {args.database} @ {live.host}:{live.port}")
    print(f"  live database   : {live.database} (gate 1: never touched)")
    print(f"  checker         : {RECONCILE}")

    # The restore comes BEFORE the connection: restore_db.py issues DROP DATABASE
    # ... WITH (FORCE), which would kill a session this script was holding open.
    if args.backup:
        if not await restore_copy(args.backup, args.database):
            return 2

    conn = await asyncpg.connect(dsn)
    try:
        if await conn.fetchval("SELECT current_database()") == live.database:
            print("REFUSED: the admin DSN points at the LIVE database.")
            return 2

        await normalise(conn, args.database, restored=bool(args.backup))
        if _failures:
            print("\nPROVE_RECONCILE INCONCLUSIVE: the copy could not be normalised into a"
                  "\nclean baseline, so nothing below would have been injected into a known"
                  "\nstate. Exit 2 — the FIXTURE is unfit. Deliberately NOT exit 1, which"
                  "\nmeans an injection did not fire.")
            for f in _failures:
                print(f"    - {f}")
            return 2

        try:
            fx = await fixtures(conn)
        except Unfit as e:
            print(f"\nPROVE_RECONCILE INCONCLUSIVE: {e}"
                  "\nExit 2 — the FIXTURE is unfit. Deliberately NOT exit 1.")
            return 2

        injections = build(fx)
        for inj in injections:
            guard(inj)

        # Before the destructive part, and cheap: a pure-function assertion that
        # needs no copy and no connection. Placed here so a broken parse is
        # reported BEFORE 19 injections run, not after. See its docstring for why
        # this one assertion does not go through reconcile.py's report.
        prove_rolconfig_parse()

        header(f"injections ({len(injections)})")
        for inj in injections:
            await run_injection(conn, args.database, inj)

        await prove_x3(conn, args.database, fx)
        await prove_inconclusive(args.database, live)
        not_injected()
    finally:
        await conn.close()

    header("summary")
    print(f"  failures: {len(_failures)}")
    for f in _failures:
        print(f"    - {f}")
    print(f"  skipped : {len(_skipped)}")
    for s in _skipped:
        print(f"    - {s}")
    if _failures:
        print("\nPROVE_RECONCILE FAILED")
        return 1
    if _skipped:
        print("\nPROVE_RECONCILE OK, WITH SKIPS: every claim that RAN was made to fire,"
              "\nnamed its rows, and cleared again when the injection was undone. The"
              "\nskipped claims above were NOT exercised on this copy, and this run says"
              "\nnothing whatever about them. Read the count, not the exit code.")
        return 0
    print("\nPROVE_RECONCILE OK: every check above was made to fire, named its rows,"
          "\nand cleared again when the injection was undone.")
    return 0


# ---------------------------------------------------------------------------
# Normalise the copy: undo the two known debris causes, and ONLY those
# ---------------------------------------------------------------------------
async def restore_copy(backup_dir: str, database: str) -> bool:
    header("restore the copy from the backup")
    proc = await asyncio.create_subprocess_exec(
        sys.executable, RESTORE, backup_dir, "--into", database, cwd=SERVER_DIR,
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    raw, _ = await proc.communicate()
    out = decode(raw)
    m = re.search(r"^RESTORE_EXIT=(\d+)$", out, re.M)
    ok = bool(m) and m.group(1) == "0"
    if not ok:
        print(out[-3000:])
    for line in out.splitlines():
        if line.startswith("RESTORE OK") or "rows in dump" in line:
            print(f"  {line.strip()}")
    check("the copy was restored from the backup (so this run starts from a known state)",
          ok, f"RESTORE_EXIT={m.group(1) if m else 'none'}")
    return ok


async def normalise(conn: asyncpg.Connection, database: str, *, restored: bool) -> None:
    header("normalise the copy (the live database's violations are proof debris)")

    before = await run_reconcile(database)
    print(f"  the copy as restored : exit {before.exit_code}, "
          f"{before.total} violations {before.counts}")

    # Cause 1 — prove_rls.py seeds a whole tenant graph with a DIRECT INSERT into
    # purchase_bills (scripts/prove_rls.py:96) and supplies no doc_no, because it
    # is proving row-level security and never calls create_bill. One per run,
    # never cleaned up (hard rule 5). In the COPY they are simply removed.
    items = await conn.execute(
        "DELETE FROM purchase_bill_items WHERE bill_id IN"
        " (SELECT id FROM purchase_bills WHERE doc_no IS NULL)")
    bills = await conn.execute("DELETE FROM purchase_bills WHERE doc_no IS NULL")
    print(f"  cause 1, prove_rls direct inserts : {bills}, {items}")

    # Cause 2 — prove_daily_report.py creates bills over HTTP (so doc_no comes
    # from the real path, in the CURRENT be_year) and then moves them onto a
    # synthetic 2019 fixture day by direct UPDATE (its own docstring, line 40).
    # doc_no says 2569; arrival says 2562. Every one of the 40 is exactly seven
    # Gregorian years adrift, so ONE uniform shift repairs them — and shifting
    # voided_at by the same interval keeps T12's "voided after it arrived" true.
    shifted = await conn.execute(
        """
        UPDATE purchase_bills
           SET server_received_at = server_received_at + interval '7 years',
               device_created_at  = device_created_at  + interval '7 years',
               voided_at          = voided_at          + interval '7 years'
         WHERE doc_no IS NOT NULL
           AND split_part(doc_no, '-', 2)::int
               <> (extract(year from server_received_at
                           AT TIME ZONE interval '+07:00')::int + 543)
        """)
    print(f"  cause 2, prove_daily_report fixture day : {shifted}")

    after = await run_reconcile(database)
    print(f"  the copy normalised  : exit {after.exit_code}, "
          f"{after.total} violations {after.counts}")

    # THIS CLAIM IS ONLY MAKEABLE ON A FRESH RESTORE. Run this script twice
    # against the same copy without restoring and the "before" is already clean,
    # so the check would pass having demonstrated nothing — the exact shape
    # lessons/proof-must-run-twice.md is about. It is SKIPPED rather than passed.
    if not restored or before.total == 0:
        skip("the two known causes account for ALL of the live violations",
             "this claim needs a freshly restored copy that arrives DIRTY, and this one"
             f" arrived with {before.total} violations. Re-run with --from pointed at a"
             " dump that carries them.")
    else:
        check("the two known causes account for ALL of the live violations,"
              f" all {before.total} of them", after.total == 0,
              f"before={before.counts} after={after.counts}")

    check("the normalised copy is a clean, exit-0 run to inject into",
          after.exit_code == 0 and after.total == 0,
          f"exit={after.exit_code} violations={after.total} {after.counts}")


# ---------------------------------------------------------------------------
# Fixtures — rows in the copy to aim each injection at
# ---------------------------------------------------------------------------
@dataclass
class Fx:
    tenant: uuidlib.UUID
    other_tenant: uuidlib.UUID | None    # None = the copy holds only one bill-carrying tenant
    other_seller: uuidlib.UUID | None
    tenants: int                         # rows in `tenants`, read ONCE in fixtures()
    tenant_ids: list[str]                # every tenant id in the copy, as text
    be_year: int
    max_seq: int
    max_bill: uuidlib.UUID
    mid: Any            # an active, single-line bill with a non-max doc_no
    mid2: Any           # another one
    mid_item: Any
    voided: Any         # a voided bill
    audit_present: bool  # the copy is a 0017+ database (audit_log + triggers exist)


async def fixtures(conn: asyncpg.Connection) -> Fx:
    header("fixtures in the copy")

    # THE TENANT COUNT, READ ONCE, HERE, FROM THIS SCRIPT'S OWN CONNECTION.
    #
    # Three expectations below are derived from it, and until 2026-08-07 all
    # three were LITERALS of the database this proof happened to be written
    # against — 46 tenants, so `{"T0": 91}`, `...context=46` and
    # `rows_at_start=46 rows_at_end=47`. The 2026-08-03 rebuild took that
    # database to 2 tenants and the proof went red for four days over a checker
    # that was working perfectly. A count assertion over data that can change
    # has a half-life (lessons/proof-must-run-twice.md).
    #
    # READ HERE, and not later, for one reason: prove_x3() INSERTS a tenant, so
    # a number read at probe time would be read from the fixture the probe has
    # already moved.
    #
    # AND NOT PARSED OUT OF reconcile.py'S REPORT, which would be the same
    # mistake wearing a fix's clothes. That report is the object under test: a
    # checker that swept the wrong tenant set would carry the expectation along
    # with it and every assertion below would hold BY CONSTRUCTION — which is
    # lessons/a-checker-must-not-share-the-code-it-checks.md, and its
    # sign-flipped twin a-differential-control-is-only-as-good-as-its-weaker-
    # side.md, where a control ran fully green against the exact defect it was
    # written for because one side of it was supplied by the test. This is a
    # different process, a different role and a different query, and reconcile.py
    # writes nothing — so no defect in the checker can change what it returns.
    tenant_ids = [str(r["id"]) for r in await conn.fetch("SELECT id FROM tenants")]

    # The two tenants holding the most bills: one to break, one to point at.
    rows = await conn.fetch(
        "SELECT tenant_id, count(*) AS n FROM purchase_bills GROUP BY 1"
        " ORDER BY 2 DESC LIMIT 2")
    if not rows:
        raise Unfit("the copy holds no purchase bills at all, so there is nothing to"
                    " break. Every injection below aims at a real row.")
    tenant = rows[0]["tenant_id"]
    other = rows[1]["tenant_id"] if len(rows) > 1 else None

    # Every column an undo needs is captured HERE, before anything is broken.
    # An undo that re-derives a value it could have remembered is one refactor
    # away from restoring something else.
    bills = await conn.fetch(
        """
        SELECT b.id, b.doc_no, split_part(b.doc_no, '-', 3)::int AS seq,
               split_part(b.doc_no, '-', 2)::int AS be_year,
               b.total_amount, b.seller_id, b.idempotency_key,
               b.voided_at, b.void_reason, b.voided_at IS NOT NULL AS voided,
               (SELECT count(*) FROM purchase_bill_items i WHERE i.bill_id = b.id) AS lines
          FROM purchase_bills b
         WHERE b.tenant_id = $1 AND b.doc_no IS NOT NULL
         ORDER BY seq
        """, tenant)
    if not bills:
        raise Unfit(f"tenant {tenant} holds no NUMBERED bills, so the doc_no series the"
                    " injections aim at does not exist in this copy.")
    top = bills[-1]
    singles = [b for b in bills if not b["voided"] and b["lines"] == 1 and b["id"] != top["id"]]
    voided = [b for b in bills if b["voided"]]
    if len(singles) < 2 or not voided:
        raise Unfit("the copy does not hold the fixtures this proof needs:"
                    f" {len(singles)} active single-line bills below the top of the series"
                    f" (2 wanted) and {len(voided)} voided bills (1 wanted).")

    mid, mid2 = singles[0], singles[1]
    item = await conn.fetchrow(
        "SELECT * FROM purchase_bill_items WHERE bill_id = $1", mid["id"])
    other_seller = None if other is None else await conn.fetchval(
        "SELECT id FROM sellers WHERE tenant_id = $1 LIMIT 1", other)

    audit_present = await conn.fetchval(
        "SELECT to_regclass('public.audit_log') IS NOT NULL")
    fx = Fx(tenant=tenant, other_tenant=other, other_seller=other_seller,
            tenants=len(tenant_ids), tenant_ids=tenant_ids,
            be_year=top["be_year"], max_seq=top["seq"], max_bill=top["id"],
            mid=mid, mid2=mid2, mid_item=item, voided=voided[0],
            audit_present=audit_present)
    print(f"  tenants in copy   : {fx.tenants}  (every expectation about a tenant count"
          " below is derived from this number, at runtime)")
    print(f"  tenant under test : {tenant}  ({len(bills)} numbered bills,"
          f" be_year {fx.be_year}, highest seq {fx.max_seq})")
    if other is None:
        print("  another tenant    : NONE — the copy holds one bill-carrying tenant, so"
              " the cross-tenant claims below are SKIPPED, not passed")
    else:
        print(f"  another tenant    : {other}  (its seller {other_seller} is the"
              " cross-tenant target)")
    print(f"  active 1-line     : {mid['doc_no']} {mid['id']}")
    print(f"  another 1-line    : {mid2['doc_no']} {mid2['id']}")
    print(f"  highest doc_no    : {top['doc_no']} {top['id']}")
    print(f"  a voided bill     : {fx.voided['doc_no']} {fx.voided['id']}")
    return fx


# ---------------------------------------------------------------------------
# The injections
# ---------------------------------------------------------------------------
CK_ITEMS_NET = ("ALTER TABLE purchase_bill_items ADD CONSTRAINT ck_items_net"
                " CHECK (net_weight = gross_weight - tare_weight)")
CK_VOID = ("ALTER TABLE purchase_bills ADD CONSTRAINT ck_bills_void_consistency CHECK ("
           "(voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL) OR "
           "(voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL))")
FK_SELLER = ("ALTER TABLE purchase_bills ADD CONSTRAINT fk_bills_seller"
             " FOREIGN KEY (tenant_id, seller_id) REFERENCES sellers (tenant_id, id)")
IDX_DOCNO = ("CREATE UNIQUE INDEX uq_bills_tenant_docno ON purchase_bills"
             " (tenant_id, doc_no) WHERE doc_no IS NOT NULL")


def build(fx: Fx) -> list[Injection]:
    mid, mid2, item, voided = fx.mid, fx.mid2, fx.mid_item, fx.voided
    injs = [
        Injection(
            "T1", "a bill's stored total no longer equals its lines — the one"
                  " number an owner balances the cash box against",
            apply=[("UPDATE purchase_bills SET total_amount = total_amount + 0.01"
                    " WHERE id = $1", (mid["id"],))],
            undo=[("UPDATE purchase_bills SET total_amount = $2 WHERE id = $1",
                   (mid["id"], mid["total_amount"]))],
            expect={"T1": 1},
            expect_rows=[f"doc_no={mid['doc_no']}", "difference=0.01"],
        ),
        Injection(
            "T2", "a line's amount drifts from net x price — and the bill total is"
                  " moved with it, so ONLY the arithmetic check can see it",
            apply=[("UPDATE purchase_bill_items SET amount = amount + 0.01 WHERE id = $1",
                    (item["id"],)),
                   ("UPDATE purchase_bills SET total_amount = total_amount + 0.01"
                    " WHERE id = $1", (mid["id"],))],
            undo=[("UPDATE purchase_bill_items SET amount = $2 WHERE id = $1",
                   (item["id"], item["amount"])),
                  ("UPDATE purchase_bills SET total_amount = $2 WHERE id = $1",
                   (mid["id"], mid["total_amount"]))],
            expect={"T2": 1},
            expect_rows=[f"doc_no={mid['doc_no']}",
                         f"stored_amount={item['amount'] + Decimal('0.01')}",
                         f"expected_amount={item['amount']}"],
        ),
        Injection(
            "T3", "net no longer equals gross - tare. The CHECK forbids it, so the"
                  " injection must DROP the constraint first — which S5 also catches",
            apply=[("ALTER TABLE purchase_bill_items DROP CONSTRAINT ck_items_net", ()),
                   ("UPDATE purchase_bill_items SET tare_weight = tare_weight + 1"
                    " WHERE id = $1", (item["id"],))],
            undo=[("UPDATE purchase_bill_items SET tare_weight = $2 WHERE id = $1",
                   (item["id"], item["tare_weight"])),
                  (CK_ITEMS_NET, ())],
            expect={"T3": 1, "S5": 1},
            expect_rows=[f"doc_no={mid['doc_no']}", "constraint=ck_items_net  MISSING"],
        ),
        Injection(
            "T4", "a bill with no lines at all — a receipt for money with nothing"
                  " bought. Its total is zeroed too, so T1 stays silent and T4 alone speaks",
            apply=[("DELETE FROM purchase_bill_items WHERE bill_id = $1", (mid["id"],)),
                   ("UPDATE purchase_bills SET total_amount = 0 WHERE id = $1", (mid["id"],))],
            undo=[("""INSERT INTO purchase_bill_items (id, tenant_id, bill_id, product_id,
                        line_no, gross_weight, tare_weight, net_weight, unit_price,
                        list_price, amount)
                      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)""",
                   (item["id"], item["tenant_id"], item["bill_id"], item["product_id"],
                    item["line_no"], item["gross_weight"], item["tare_weight"],
                    item["net_weight"], item["unit_price"], item["list_price"],
                    item["amount"])),
                  ("UPDATE purchase_bills SET total_amount = $2 WHERE id = $1",
                   (mid["id"], mid["total_amount"]))],
            expect={"T4": 1},
            expect_rows=[f"doc_no={mid['doc_no']}", f"bill_id={mid['id']}"],
        ),
        Injection(
            "T5", "a bill loses its doc_no. The column is NULLable by design (an"
                  " offline bill has none yet) so nothing in the schema objects",
            apply=[("UPDATE purchase_bills SET doc_no = NULL WHERE id = $1", (mid["id"],))],
            undo=[("UPDATE purchase_bills SET doc_no = $2 WHERE id = $1",
                   (mid["id"], mid["doc_no"]))],
            expect={"T5": 1, "T8": 1},
            expect_rows=[f"bill_id={mid['id']}", f"MISSING seq=[{mid['seq']}]"],
        ),
        Injection(
            "T6", "doc_no gains a leading zero: B-2569-0007-shaped. A different"
                  " STRING for the same number, which the unique index cannot see",
            apply=[("UPDATE purchase_bills SET doc_no = $2 WHERE id = $1",
                    (mid["id"], f"B-{fx.be_year}-{mid['seq']:04d}"))],
            undo=[("UPDATE purchase_bills SET doc_no = $2 WHERE id = $1",
                   (mid["id"], mid["doc_no"]))],
            expect={"T6": 1, "T8": 1},
            expect_rows=[f"doc_no=B-{fx.be_year}-{mid['seq']:04d}",
                         f"MISSING seq=[{mid['seq']}]"],
        ),
        Injection(
            "T7", "a bill's arrival is moved into the previous Buddhist-era year"
                  " while its doc_no keeps the old one — the be-year-across-midnight bug",
            apply=[("UPDATE purchase_bills SET server_received_at ="
                    " server_received_at - interval '1 year' WHERE id = $1", (mid["id"],))],
            undo=[("UPDATE purchase_bills SET server_received_at ="
                   " server_received_at + interval '1 year' WHERE id = $1", (mid["id"],))],
            expect={"T7": 1},
            expect_rows=[f"doc_no={mid['doc_no']}",
                         f"be_year_in_doc_no={fx.be_year}",
                         f"be_year_of_arrival={fx.be_year - 1}"],
        ),
        Injection(
            # Renumbered to one PAST the top, not to some far value: a hand
            # renumber is what this actually looks like in the wild, and it keeps
            # the report crisp. Aiming at 99999 instead is also caught, but it
            # makes every number from here to 99998 genuinely missing, and the
            # report then correctly says so at length.
            "T8", "a bill is renumbered past the top of the series, leaving a hole"
                  " where it was and a counter that no longer matches",
            apply=[("UPDATE purchase_bills SET doc_no = $2 WHERE id = $1",
                    (mid["id"], f"B-{fx.be_year}-{fx.max_seq + 1}"))],
            undo=[("UPDATE purchase_bills SET doc_no = $2 WHERE id = $1",
                   (mid["id"], mid["doc_no"]))],
            expect={"T8": 1, "T9": 1},
            expect_rows=[f"MISSING seq=[{mid['seq']}]",
                         f"highest={fx.max_seq + 1}",
                         f"counter_last_seq={fx.max_seq}"
                         f"  highest_doc_no={fx.max_seq + 1}  difference=-1"],
        ),
        Injection(
            "T9", "the gap-free counter runs ahead of the numbers actually issued —"
                  " the next five bills would skip five doc_nos",
            apply=[("UPDATE doc_no_counters SET last_seq = last_seq + 5"
                    " WHERE tenant_id = $1 AND be_year = $2", (fx.tenant, fx.be_year))],
            undo=[("UPDATE doc_no_counters SET last_seq = last_seq - 5"
                   " WHERE tenant_id = $1 AND be_year = $2", (fx.tenant, fx.be_year))],
            expect={"T9": 1},
            expect_rows=[f"counter_last_seq={fx.max_seq + 5}",
                         f"highest_doc_no={fx.max_seq}", "difference=5"],
        ),
        Injection(
            "T10", "a bill is pointed at ANOTHER SHOP'S seller. The composite FK"
                   " forbids it, so it must be dropped first — three checks see it,"
                   " each from a different lens",
            apply=[("ALTER TABLE purchase_bills DROP CONSTRAINT fk_bills_seller", ()),
                   ("UPDATE purchase_bills SET seller_id = $2 WHERE id = $1",
                    (mid["id"], fx.other_seller))],
            undo=[("UPDATE purchase_bills SET seller_id = $2 WHERE id = $1",
                   (mid["id"], mid["seller_id"])),
                  (FK_SELLER, ())],
            expect={"T10": 1, "X1": 1, "S5": 1},
            expect_rows=["bill -> seller", f"holder={mid['doc_no']}",
                         f"pointed_at_tenant={fx.other_tenant}",
                         "constraint=fk_bills_seller  MISSING"],
            skip=("" if fx.other_seller is not None else
                  "there is no second tenant with a seller in this copy, so there is no"
                  " cross-tenant reference to make. T10, X1 and the S5 constraint check"
                  " they share are NOT exercised here."),
        ),
        Injection(
            "T11", "a voided bill keeps its timestamp and its author but loses its"
                   " reason — a void with half an audit trail",
            apply=[("ALTER TABLE purchase_bills DROP CONSTRAINT ck_bills_void_consistency", ()),
                   ("UPDATE purchase_bills SET void_reason = NULL WHERE id = $1",
                    (voided["id"],))],
            undo=[("UPDATE purchase_bills SET void_reason = $2 WHERE id = $1",
                   (voided["id"], voided["void_reason"])),
                  (CK_VOID, ())],
            expect={"T11": 1, "S5": 1},
            expect_rows=[f"doc_no={voided['doc_no']}", "has_voided_at=true",
                         "has_void_reason=false",
                         "constraint=ck_bills_void_consistency  MISSING"],
        ),
        Injection(
            "T12", "a bill is voided a day BEFORE it arrived. Both stamps come from"
                   " the server's own clock, so this cannot happen honestly",
            apply=[("UPDATE purchase_bills SET voided_at = server_received_at"
                    " - interval '1 day' WHERE id = $1", (voided["id"],))],
            undo=[("UPDATE purchase_bills SET voided_at = $2 WHERE id = $1",
                   (voided["id"], voided["voided_at"]))],
            expect={"T12": 1},
            expect_rows=[f"doc_no={voided['doc_no']}", "voided_after=-1 day"],
        ),
        Injection(
            "T13", "the void reason is blanked to whitespace. NOT NULL is satisfied;"
                   " the audit trail is not",
            apply=[("UPDATE purchase_bills SET void_reason = '   ' WHERE id = $1",
                    (voided["id"],))],
            undo=[("UPDATE purchase_bills SET void_reason = $2 WHERE id = $1",
                   (voided["id"], voided["void_reason"]))],
            expect={"T13": 1},
            expect_rows=[f"doc_no={voided['doc_no']}", "reason_length=3"],
        ),
        Injection(
            "T14", "a bill's idempotency_key is blanked — hard rule 4's key, which"
                   " is unique exactly once per tenant when empty",
            apply=[("UPDATE purchase_bills SET idempotency_key = '' WHERE id = $1",
                    (mid["id"],))],
            undo=[("UPDATE purchase_bills SET idempotency_key = $2 WHERE id = $1",
                   (mid["id"], mid["idempotency_key"]))],
            expect={"T14": 1},
            expect_rows=[f"doc_no={mid['doc_no']}", "key_length=0"],
        ),
        Injection(
            "T15", "a line is renumbered to 5 on a one-line bill: the shape a lost"
                   " line leaves behind, which no total can reveal",
            apply=[("UPDATE purchase_bill_items SET line_no = 5 WHERE id = $1",
                    (item["id"],))],
            undo=[("UPDATE purchase_bill_items SET line_no = $2 WHERE id = $1",
                   (item["id"], item["line_no"]))],
            expect={"T15": 1},
            expect_rows=[f"doc_no={mid['doc_no']}", "lines=1", "min_line=5", "max_line=5"],
        ),
        Injection(
            "T16", "two bills carry ONE doc_no. The partial unique index forbids it,"
                   " so it must be dropped first",
            apply=[("DROP INDEX uq_bills_tenant_docno", ()),
                   ("UPDATE purchase_bills SET doc_no = $2 WHERE id = $1",
                    (mid["id"], mid2["doc_no"]))],
            undo=[("UPDATE purchase_bills SET doc_no = $2 WHERE id = $1",
                   (mid["id"], mid["doc_no"])),
                  (IDX_DOCNO, ())],
            expect={"T16": 1, "T8": 2, "S5": 1},
            expect_rows=[f"doc_no={mid2['doc_no']}  bills=2",
                         f"MISSING seq=[{mid['seq']}]",
                         f"seq={mid2['seq']}  DUPLICATED",
                         "index=uq_bills_tenant_docno  MISSING"],
        ),
        Injection(
            "S1", "a new table lands in public with no tenant_id and no RLS — the"
                  " migration that quietly ends multi-tenancy",
            apply=[("CREATE TABLE public.notes (id uuid PRIMARY KEY, body text)", ())],
            undo=[("DROP TABLE public.notes", ())],
            expect={"S1": 1, "S2": 1},
            expect_rows=["table=notes  HAS NO tenant_id COLUMN",
                         "add it to ALL_RLS_TABLES"],
        ),
        Injection(
            # T0 is asserted BY NAME, per tenant, and NOT by a count. The count
            # is 2N-1 — every tenant sees N tenants instead of 1, and every
            # tenant but the min(id::text) one also reports the wrong visible
            # tenant. That formula is not arithmetic, it is a transcription of
            # how many strings context_check happens to append, which is a
            # CONVENTION: add a fourth problem there and the formula goes
            # silently wrong while nothing announces it. Apply the test in
            # lessons/a-checker-must-not-share-the-code-it-checks.md — could a
            # second author, given only the spec, reach 2N-1? No. So assert the
            # thing T0 exists for instead: that the context was checked for
            # EVERY tenant, each named in its own block of the report.
            "S3/T0", "row-level security is switched off on `tenants`. Every tenant"
                     " context now sees every tenant in the copy, so the sweep's own"
                     " self-check screams before any money check does",
            apply=[("ALTER TABLE tenants DISABLE ROW LEVEL SECURITY", ())],
            undo=[("ALTER TABLE tenants ENABLE ROW LEVEL SECURITY", ())],
            expect={"S3": 1, "B1": 1, "B2": 1},
            expect_t0_for=fx.tenant_ids,
            expect_rows=["table=tenants  RLS NOT ENABLED",
                         f"table=tenants  rows_visible_with_no_tenant_context={fx.tenants}",
                         f"{fx.tenants} tenants visible under this context, expected 1"],
            mode="superset",
            skip=("" if fx.tenants >= 2 else
                  f"the copy holds {fx.tenants} tenant. With one tenant, disabling RLS on"
                  " `tenants` changes nothing T0 can observe — one row is visible either"
                  " way and it is this tenant's own — so T0 CANNOT fire, and asserting"
                  " that it does would be a red about the copy rather than about the"
                  " checker. A pilot shop's database has exactly one tenant"
                  " (ROADMAP.md D10), so this is the ordinary case there, not an exotic"
                  " one. S3, B1 and B2 are not exercised on such a copy either."),
        ),
        Injection(
            "S3/X2", "row-level security is switched off on purchase_bills — the"
                     " money table. The blind read sees every bill in the cluster and"
                     " the sweep's completeness arithmetic stops adding up",
            apply=[("ALTER TABLE purchase_bills DISABLE ROW LEVEL SECURITY", ())],
            undo=[("ALTER TABLE purchase_bills ENABLE ROW LEVEL SECURITY", ())],
            expect={"S3": 1, "B1": 1, "B2": 1, "X2": 1},
            expect_rows=["table=purchase_bills  RLS NOT ENABLED",
                         "table=purchase_bills  rows_visible_with_no_tenant_context=",
                         "table=purchase_bills  seen_by_the_sweep="],
            mode="superset",
            skip=("" if fx.tenants >= 2 else
                  f"the copy holds {fx.tenants} tenant. X2 compares what the per-tenant"
                  " sweep SAW against what is globally present; with one tenant those are"
                  " the same number whether RLS is on or off, so X2 cannot fire. The"
                  " cascades this injection also expects (a tenant seeing another's bills)"
                  " have nothing to cascade from."),
        ),
    ]
    # S6 (migration 0017) exists only on a 0017+ copy. Dropping the audit trigger
    # from product_prices is the silent loss this design's worst failure -- a write
    # that then leaves NO record -- and S6 is what makes reconcile notice it. Gated
    # on audit_present so a pre-0017 copy (no trigger to drop) simply omits it.
    if fx.audit_present:
        injs.append(Injection(
            "S6", "the audit_capture trigger is DROPPED from product_prices — after"
                  " this a price change leaves no record, and S6 is the production"
                  " detector for a silently-missing trigger",
            apply=[("DROP TRIGGER audit_capture ON product_prices", ())],
            undo=[("CREATE TRIGGER audit_capture AFTER INSERT OR UPDATE OR DELETE"
                   " ON product_prices FOR EACH ROW EXECUTE FUNCTION audit_capture()",
                   ())],
            expect={"S6": 1},
            expect_rows=["table=product_prices  HAS NO audit_capture TRIGGER"],
        ))
    return injs


def t0_tenants_named(out: str) -> set[str]:
    """Every tenant whose OWN block of the report carries a failing T0.

    Parsed out of the report a person reads at 07:00, per tenant, rather than
    off the aggregate violation count — because the aggregate is 2N-1 only by
    virtue of how many problem strings context_check appends, and that is a
    convention of the checker rather than a fact about the data. This survives a
    third problem string being added; a count does not.

    It is also the stronger claim. A count says "T0 fired 3 times" and cannot
    distinguish that from one tenant firing three times, which is EXACTLY the
    failure T0 exists to catch (its own docstring: "A sweep that silently
    re-checked tenant A forty-six times would otherwise print forty-six
    greens"). Where two mechanisms produce one number, that number is evidence
    about neither — the seventh mechanism in
    lessons/a-check-that-never-went-red-was-never-observed.md.

    reconcile.py's sweep prints "  --- tenant <uuid> ---" before that tenant's
    results whenever any of them failed, and Report.emit prints "  [FAIL] T0 "
    within that block.
    """
    named: set[str] = set()
    for block in out.split("\n  --- tenant ")[1:]:
        tid = block.split(" ---", 1)[0].strip()
        if re.search(r"^\s*\[FAIL\] T0\b", block, re.M):
            named.add(tid)
    return named


async def run_injection(conn: asyncpg.Connection, database: str, inj: Injection) -> None:
    print(f"\n  --- {inj.id}: {inj.why} ---")
    if inj.skip:
        skip(f"{inj.id}: not exercised on this copy", inj.skip)
        return
    for sql, _ in inj.apply:
        print(f"      inject: {' '.join(sql.split())[:110]}")
    await exec_all(conn, inj.apply)
    try:
        run = await run_reconcile(database)
        print(f"      checker: exit {run.exit_code}, {run.total} violations {run.counts}")

        check(f"{inj.id}: the checker exits non-zero", run.exit_code == 1,
              f"exit={run.exit_code}")
        if inj.mode == "exact":
            check(f"{inj.id}: exactly the expected checks fire, with the expected counts",
                  run.counts == inj.expect, f"expected {inj.expect}, got {run.counts}")
        else:
            missing = {k: v for k, v in inj.expect.items() if run.counts.get(k) != v}
            check(f"{inj.id}: the named checks fire with the expected counts"
                  " (others may cascade)", not missing,
                  f"wrong or absent: {missing}" if missing else f"got {run.counts}")
        if inj.expect_t0_for:
            named = t0_tenants_named(run.out)
            silent = [t for t in inj.expect_t0_for if t not in named]
            check(f"{inj.id}: T0 fired for EVERY one of the {len(inj.expect_t0_for)}"
                  " tenants in the copy, each named in its own block of the report",
                  not silent,
                  f"no failing T0 in the block of: {silent}" if silent
                  else f"named {sorted(named)}")
        for needle in inj.expect_rows:
            check(f"{inj.id}: the report NAMES it - {needle!r}", run.names(needle))
    finally:
        await exec_all(conn, inj.undo)

    back = await run_reconcile(database)
    check(f"{inj.id}: undoing the injection returns the copy to a clean exit-0 run",
          back.exit_code == 0 and back.total == 0,
          f"exit={back.exit_code} violations={back.total} {back.counts}")


# ---------------------------------------------------------------------------
# X3 — the database moving under the checker while it runs
# ---------------------------------------------------------------------------
async def prove_x3(conn: asyncpg.Connection, database: str, fx: Fx) -> None:
    print("\n  --- X3: a row lands WHILE the sweep is running ---")
    print("      X3 is not an invariant about the data; it is a statement about the")
    print("      RESULT. A violation found while rows were landing could be a bill")
    print("      mid-flight rather than a defect, and the reader must be told.")

    # fx.tenants was read before the first injection. Every injection since has
    # been undone and re-verified against a clean exit-0 run, so it must still
    # hold — this is a drift check on the fixture, not a second opinion about
    # the checker, and it is here because the two assertions below rest on it.
    now = await conn.fetchval("SELECT count(*) FROM tenants")
    check("X3: the tenant count the expectations are derived from has not moved since"
          " fixtures", now == fx.tenants, f"fixtures={fx.tenants} now={now}")

    tid = uuidlib.uuid4()
    # On a 0017 copy the INSERT and DELETE below fire the audit trigger, which needs
    # an actor (and a tenant for the audit row). conn is the superuser, so set both
    # session-level; harmless on a pre-0017 copy where no trigger reads them. The
    # audit row's tenant is the probe's own tenant (this INSERT creates it).
    await conn.execute("SELECT set_config('app.tenant_id', $1, false)", str(tid))
    await conn.execute("SELECT set_config('app.actor_id', $1, false)",
                       "00000000-0000-0000-0000-000000000000")
    await conn.execute("SELECT set_config('app.actor_username', $1, false)",
                       "system:prove_reconcile")
    proc = await asyncio.create_subprocess_exec(
        # -u, AND IT IS THE WHOLE PROBE.
        #
        # This probe works by watching the child's output for a marker and
        # inserting a row while the sweep is still running. Python BLOCK-buffers
        # a non-tty stdout at 8192 bytes, so on a small copy the entire report
        # (5364 bytes over a 2-tenant database, measured 2026-08-07) reaches the
        # pipe only when the child EXITS. The marker then arrives after the
        # sweep is over, the row lands outside the window, X3 correctly reports
        # no drift — and the probe has silently stopped probing.
        #
        # It was green until 2026-08-03 for a reason that is not one: the
        # 46-tenant report ran to several buffers, so the first flush happened
        # to land mid-sweep. Nothing about the assertion changed. The fixture
        # shrank, and with it the timing the assertion had been resting on.
        #
        # -u on ARGV rather than PYTHONUNBUFFERED in the environment: an
        # argument cannot be dropped by whoever launches this script. It changes
        # WHEN bytes arrive and nothing about what the checker computes.
        #
        # `=== structure` below is the EARLIEST SAFE marker and must not be
        # moved earlier: it is the first thing reconcile.py prints after it takes
        # its opening fingerprint, so a marker before it risks the row landing
        # before the window opens — a silent false negative rather than a red.
        #
        # A RESIDUAL REMAINS AND IT FAILS CLOSED: the sweep must not finish
        # between the marker arriving and the INSERT committing. If it does, X3
        # does not fire and the cell below is RED. There is no path to a false
        # green.
        sys.executable, "-u", RECONCILE, "--database", database, "--max-rows", "0",
        cwd=SERVER_DIR, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    injected = False
    chunks: list[bytes] = []
    assert proc.stdout is not None
    while True:
        line = await proc.stdout.readline()
        if not line:
            break
        chunks.append(line)
        if not injected and b"=== structure" in line:
            await conn.execute("INSERT INTO tenants (id, name) VALUES ($1, 'x3 probe')", tid)
            injected = True
            print(f"      inserted tenant {tid} mid-run")
    await proc.wait()
    out = decode(b"".join(chunks))
    m, t = EXIT_RE.search(out), TOTAL_RE.search(out)
    counts = {k: int(v) for k, v in COUNT_RE.findall(out)}
    print(f"      checker: exit {m.group(1) if m else '?'}, "
          f"{t.group(1) if t else '?'} violations {counts}")
    # On a 0017 copy the INSERT fires the audit trigger, so TWO tables drift under
    # the sweep -- tenants AND its audit_log row -- and X3 correctly reports both.
    # On a pre-0017 copy only tenants drifts.
    expected_x3 = 2 if fx.audit_present else 1
    check("X3: a row landing mid-run is reported, not silently absorbed",
          counts.get("X3") == expected_x3,
          f"got {counts}, expected X3={expected_x3}"
          + (" (tenants AND its audit_log row)" if fx.audit_present else ""))
    check("X3: the report names the table and both counts",
          f"table=tenants  rows_at_start={fx.tenants}  rows_at_end={fx.tenants + 1}" in out,
          f"expected rows_at_start={fx.tenants} rows_at_end={fx.tenants + 1}")

    await conn.execute("DELETE FROM tenants WHERE id = $1", tid)
    back = await run_reconcile(database)
    check("X3: removing the probe returns the copy to a clean exit-0 run",
          back.exit_code == 0 and back.total == 0,
          f"exit={back.exit_code} violations={back.total} {back.counts}")


# ---------------------------------------------------------------------------
# exit 2 — "nobody looked" must not read as "nothing is wrong"
# ---------------------------------------------------------------------------
async def prove_inconclusive(database: str, live: Any) -> None:
    print("\n  --- exit 2: could not run is NOT a pass ---")
    run = await run_reconcile(database, "--admin-dsn",
                              f"postgresql://nosuch:nosuch@{live.host}:{live.port}/{database}")
    check("a refused admin connection exits 2, not 0", run.exit_code == 2,
          f"exit={run.exit_code}")
    check("and says why", "COULD NOT CONNECT" in run.out)

    proc = await asyncio.create_subprocess_exec(
        sys.executable, RECONCILE, "--database", "recycle_no_such_database",
        cwd=SERVER_DIR, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    raw, _ = await proc.communicate()
    out = decode(raw)
    m = EXIT_RE.search(out)
    check("a database that does not exist exits 2, not 0", bool(m) and m.group(1) == "2",
          f"exit={m.group(1) if m else 'none'}")


# ---------------------------------------------------------------------------
# The rolconfig parse — the ONE assertion in this file that does not run
# reconcile.py and does not read its report
# ---------------------------------------------------------------------------
def prove_rolconfig_parse() -> None:
    """S4's rolconfig parse, driven directly, with inputs written HERE.

    THIS IS A NEW INSTRUMENT SHAPE IN THIS FILE AND IT IS DELIBERATE, NOT
    CASUAL. Every other assertion in this script breaks a restored copy, runs
    reconcile.py as a SUBPROCESS, and asserts against the human report. This one
    imports a function and calls it. Written down here so the next person reads
    it as the exception it is rather than as the file's convention.

    WHY IT IS NEEDED. S4 extracts one setting out of a rolconfig ARRAY. This
    cluster has exactly one role carrying rolconfig at all and it holds exactly
    one entry, so the multi-entry, duplicate, NULL and separator-in-the-value
    branches are unreachable from any database this project has; and
    manufacturing them needs ALTER ROLE, which gate 2 refuses for the reason gate
    2 exists. A clause no input can reach is the shape
    lessons/a-check-that-never-went-red-was-never-observed.md catalogues, and
    this is the cheapest honest way to give these ones a cell.

    WHY IT DOES NOT VIOLATE
    lessons/a-checker-must-not-share-the-code-it-checks.md. That lesson's test is
    whether the proof read its EXPECTED VALUE out of the thing under test. It did
    not. The subject is the function; the inputs and the expected outputs below
    are written by hand from the shape of pg_roles.rolconfig, and are read
    neither from reconcile.py, nor from REQUIRED_ROLES, nor from any database.
    Nothing here can agree with the function by construction — change the
    function and these cells go red, which is the whole point.
    """
    from reconcile import rolconfig_setting  # noqa: E402 — see the docstring

    header("the rolconfig parse (pure function, inputs written in this file)")
    cases: list[tuple[str, list[str] | None, str, tuple[str, str | None]]] = [
        ("NULL rolconfig - a role that carries no settings at all",
         None, "search_path", ("absent", None)),
        ("the only entry, and it is the one asked for",
         ["search_path=directory"], "search_path", ("present", "directory")),
        ("the setting sits BESIDE unrelated entries and must still be found",
         ["statement_timeout=5s", "search_path=directory", "lock_timeout=1s"],
         "search_path", ("present", "directory")),
        ("a value containing commas and quotes",
         ['search_path="$user", public'], "search_path",
         ("present", '"$user", public')),
        # THE SEPARATOR MUST BE IN THE VALUE, and the first version of this cell
        # got that wrong: it used '"$user", public', which carries no `=` at all,
        # so it asserted the split-on-the-FIRST-`=` rule without exercising it.
        # Measured: mutating the parse to entry.split('=')[1] reddened NOTHING.
        # A quoted identifier may contain `=`, and this is the input that fails
        # under any parse that splits on every separator.
        ("a value that itself contains the separator - splits on the FIRST only",
         ['search_path="a=b", public'], "search_path",
         ("present", '"a=b", public')),
        ("a non-empty array holding no such setting is ABSENT, not empty-string",
         ["statement_timeout=5s"], "search_path", ("absent", None)),
        # PREFIX, NEVER SUBSTRING, and this one was uncovered too: mutating
        # `entry.startswith(prefix)` to `prefix in entry` reddened NOTHING until
        # this cell existed. The first entry is a synthetic confusable rather
        # than a real GUC - the property under test is the parse, not Postgres'
        # settings catalogue - and under substring matching it makes the lookup
        # return `duplicated` for a role that is perfectly configured.
        ("a DIFFERENT setting whose name ENDS WITH the one asked for is not a match",
         ["not_the_search_path=wrong", "search_path=directory"], "search_path",
         ("present", "directory")),
        ("two entries for one setting fail CLOSED, never take the first",
         ["search_path=a", "search_path=b"], "search_path", ("duplicated", None)),
    ]
    for label, cfg, name, want in cases:
        got = rolconfig_setting(cfg, name)
        check(f"parse: {label}", got == want, f"expected {want}, got {got}")


def not_injected() -> None:
    header("deliberately NOT injected")
    print("  S4's ATTRIBUTE CLAUSE — that no required role is SUPERUSER or has")
    print("  BYPASSRLS. The only way to make it fire is to grant one of those, and")
    print("  ROLES ARE CLUSTER-WIDE: the LIVE database shares this cluster, so the")
    print("  injection would disable tenant isolation on real money data for as long")
    print("  as it ran — and would leave it disabled if this script died in between.")
    print("  A proof that endangers production is not a proof. The guard in this file")
    print("  scans every injection's SQL for role statements and refuses them, so the")
    print("  reason cannot decay into a comment nobody enforces. It scans for ROLE,")
    print("  USER and GROUP: USER is a documented alias of the ROLE forms and GROUP")
    print("  reaches role MEMBERSHIP, and every one of them is cluster-wide — a gate")
    print("  that knows only one spelling of what it refuses is not a gate.")
    print()
    print("  THAT CLAUSE, AND ONLY THAT CLAUSE, IS UNPROVEN BY EXECUTION — the older")
    print("  blanket claim that S4 was unproven is no longer true. S4 has THREE")
    print("  clauses: the role SET exists, the ATTRIBUTES above, and the rolconfig")
    print("  SETTINGS. The other two are exercised by changing what the checker")
    print("  DECLARES rather than by touching a role, which reaches no role, no")
    print("  database and no cluster; and the parse beneath the settings clause has")
    print("  its own cells, printed above.")
    print()
    print("  NO ROLE NAME IS PRINTED HERE, DELIBERATELY. The declaration in")
    print("  reconcile.py is the one place the set is written; a second copy in this")
    print("  text is a copy that can go stale while nothing notices, which is the")
    print("  defect this check was just repaired for. S4's own `examined` line names")
    print("  every required role on every run — read the set there.")


if __name__ == "__main__":
    try:
        code = asyncio.run(main())
    except Exception as exc:  # noqa: BLE001
        import traceback

        traceback.print_exc()
        print(f"\nPROVE_RECONCILE FAILED: {type(exc).__name__}")
        code = 1
    print(f"PROVE_RECONCILE_EXIT={code}")
    sys.exit(code)
