"""Prove the year-boundary gate — the counter states are the mutation.

RUN AGAINST SCRATCH ONLY, NEVER AGAINST dev. It fabricates doc_no_counters rows
for years that have not happened and for years long past, which is permanent
damage to a numbering series if done to real data.

HOW THE MUTATION IS SUPPLIED, AND WHAT IT WEAKENS
-------------------------------------------------
The gate compares be_year (derived from now()) against max(be_year) in
doc_no_counters. As in the clock guard, now() cannot be moved: a container reads
the host kernel's clock and dev shares this container. So the mutation is
applied to the OTHER side again — an OWNER-role connection writes counter rows
so that the CURRENT be_year lands at max+1, max+2, or below max.

That is a real mutation from outside the gate's own code, so it is not T7's
shape. What it does NOT establish is behaviour under a genuinely wrong clock:
every cell here would pass identically if be_year came from the wrong source.
The gate's protection against THAT is bills.py reading now() once — which
prove_docno_clock.py already covers for the Python-clock direction, and which
nothing covers for the Postgres direction.
"""
from __future__ import annotations

import argparse
import datetime as dt
import os
import subprocess
import sys
import time
from pathlib import Path

from sqlalchemy.engine import make_url

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

from prove_bills import BASE, auth, bill_body, item, login  # noqa: E402
from app.bills import _be_year  # noqa: E402
from app.seeddata import (  # noqa: E402
    PRODUCT_A_ID, SELLER_A_ID, TENANT_A_ID, TENANT_A_PASSWORD,
)

CONTAINER = os.environ.get("PROVE_PG_CONTAINER", "recycle_pg")
# Set by _require_scratch_database() before any statement runs. NOT a default:
# PROVE_DB used to default to a scratch name, which meant a shell that had it
# unset or set to something else decided the target silently.
DB = ""
OWNER = "recycle_owner"


def _require_scratch_database() -> str | None:
    """Refuse to run against the live database. Returns the name, or None.

    The same shape as `prove_docno_clock.py:109-128`, which this repository
    already proved: --database REQUIRED with no default, compared against
    APP_DATABASE_URL, refused with the restore command printed, and the URL
    rebound so anything reading it in THIS process cannot escape.

    WHAT IT DOES NOT REACH, and this is not a detail: the API under test is a
    SEPARATE PROCESS bound to its database at startup, via API_BASE_URL. No
    rebinding here can move it. If that API is running against dev while this
    script is pointed at scratch, post_bill() still writes real bills to dev
    through the real path. Point the API at the same scratch database and check
    that you did.
    """
    ap = argparse.ArgumentParser(description="Prove the year-boundary gate.")
    ap.add_argument("--database", required=True,
                    help="a SCRATCH database. This script fabricates "
                         "doc_no_counters rows for years that have not happened "
                         "and DELETEs this tenant's bills, so it may not be "
                         "pointed at the live database.")
    args = ap.parse_args()

    url = os.environ.get("APP_DATABASE_URL")
    if not url:
        print("REFUSED: APP_DATABASE_URL is not set, so this script cannot tell\n"
              "  which database is the live one. Refusing rather than guessing.")
        return None

    live = make_url(url)
    if args.database == live.database:
        print(f"REFUSED: --database {args.database!r} is the LIVE database.\n"
              "  This script writes doc_no_counters rows for years that have not\n"
              "  happened and DELETEs purchase_bills for its tenant. Hard rule 5\n"
              "  means those deletions are not something the product can undo.\n"
              "  Restore a copy and point it there:\n"
              "    python scripts/backup_db.py\n"
              "    python scripts/restore_db.py <dir> --into recycle_clock_scratch")
        return None

    os.environ["APP_DATABASE_URL"] = live.set(
        database=args.database).render_as_string(hide_password=False)
    return args.database

FAILS: list[str] = []
RUN = str(int(time.time()))
BE_NOW = _be_year(dt.datetime.now(dt.timezone.utc))


def check(ok: bool, label: str, detail: str = "") -> None:
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f"  — {detail}" if detail else ""))
    if not ok:
        FAILS.append(label)


def banner(s: str) -> None:
    print(f"\n=== {s} ===")


def sql(q: str) -> str:
    """Run one statement as OWNER, under tenant A's context.

    doc_no_counters has FORCE ROW LEVEL SECURITY, so even the table owner obeys
    the policy and an INSERT with no app.tenant_id set is refused outright. The
    context is set with a session-level SET in the SAME psql session (two -c
    flags, one connection) — session-level is correct here because this is
    proof SETUP, not the runtime path, which uses transaction-local set_config.
    """
    p = subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", OWNER, "-d", DB,
         "-v", "ON_ERROR_STOP=1", "-tA",
         "-c", f"SET app.tenant_id = '{TENANT_A_ID}'", "-c", q],
        capture_output=True, text=True)
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout).strip())
    # psql echoes the command tag of the SET (and of INSERT/DELETE) even under
    # -tA. Keep only real result rows, or the caller parses "SET" as data.
    tags = ("SET", "INSERT", "DELETE", "UPDATE")
    rows = [ln for ln in p.stdout.splitlines()
            if ln.strip() and not ln.split()[0] in tags]
    return "\n".join(rows).strip()


def set_counters(years: list[int]) -> None:
    """Replace this tenant's counters with exactly `years`. OWNER role, so it
    bypasses nothing the app would enforce — it is setting up the world, not
    exercising the gate."""
    # Bills too: a later cell reopening the same year would regenerate a doc_no
    # an earlier cell already wrote, and the unique index would raise a 500 that
    # reads exactly like a gate failure. Each cell starts from an empty series.
    clear_bills()
    sql(f"DELETE FROM doc_no_counters WHERE tenant_id = '{TENANT_A_ID}'")
    for y in years:
        # The counter is keyed per BRANCH since migration 0018; the fabricated
        # rows belong to the tenant's born-with branch (code MAIN), which is the
        # one the gate's bills land in. The gate itself reads max(be_year) over
        # EVERY branch of the tenant, so which branch holds the row does not
        # change what it sees.
        sql("INSERT INTO doc_no_counters (tenant_id, branch_id, be_year, last_seq)"
            f" VALUES ('{TENANT_A_ID}',"
            f" (SELECT id FROM branches WHERE tenant_id = '{TENANT_A_ID}'"
            f"   AND code = 'MAIN'), {y}, 5)")


def clear_bills() -> None:
    """Empty this tenant's bill history so doc_no collisions cannot confuse a
    cell. THIS IS WHY THE SCRIPT IS SCRATCH-ONLY: hard rule 5 forbids deleting
    transactions, and that rule is about the product, not about a database
    restored for the purpose. Without this, resetting a counter regenerates a
    doc_no that already exists and the unique index raises a 500 that looks
    exactly like a gate failure."""
    # The ledger first (migration 0020): every bill this tenant wrote through
    # the real path carries one payment and one allocation, and the allocation
    # FKs to the bill, so the bill DELETE below is refused while they stand.
    # OWNER role, so the app role's missing DELETE grant on both tables does
    # not apply here. Guarded, so a scratch restored from a pre-0020 dump still
    # clears (to_regclass is NULL where the table does not exist).
    if sql("SELECT to_regclass('public.payment_allocations') IS NOT NULL") == "t":
        sql(f"DELETE FROM payment_allocations WHERE tenant_id = '{TENANT_A_ID}'")
        sql(f"DELETE FROM payments WHERE tenant_id = '{TENANT_A_ID}'")
    # 0028/0029: a purchase line is named by its stock movements and may be by an owner flag; both go
    # first (fk_movements_purchase_item, fk_owner_flags_purchase_item), guarded like the ledger above.
    if sql("SELECT to_regclass('public.owner_flags') IS NOT NULL") == "t":
        sql(f"DELETE FROM owner_flags WHERE tenant_id = '{TENANT_A_ID}'")
    if sql("SELECT to_regclass('public.stock_movements') IS NOT NULL") == "t":
        sql(f"DELETE FROM stock_movements WHERE tenant_id = '{TENANT_A_ID}'")
    sql(f"DELETE FROM purchase_bill_items WHERE tenant_id = '{TENANT_A_ID}'")
    sql(f"DELETE FROM purchase_bills WHERE tenant_id = '{TENANT_A_ID}'")


def snapshot() -> str:
    return sql("SELECT coalesce(string_agg(be_year::text, ',' ORDER BY be_year), '-')"
               f" FROM doc_no_counters WHERE tenant_id = '{TENANT_A_ID}'")


def post_bill(client, token, tag):
    return client.post(f"{BASE}/bills", headers=auth(token), json=bill_body(
        SELLER_A_ID, f"yg-{RUN}-{tag}", [item(PRODUCT_A_ID, 1, "1.000")]))


def main() -> int:
    # BEFORE any statement runs, and before anything is imported that might
    # read the URL. A refusal here must cost nothing.
    global DB
    chosen = _require_scratch_database()
    if chosen is None:
        return 2
    DB = chosen
    print(f"target database: {DB} (checked against APP_DATABASE_URL)")

    print(__doc__.split("RUN AGAINST")[0])
    original = sql("SELECT coalesce(string_agg(be_year||':'||last_seq, ',' ORDER BY be_year),'')"
                   f" FROM doc_no_counters WHERE tenant_id = '{TENANT_A_ID}'")
    print(f"current be_year = {BE_NOW}; counters before = {original or '(none)'}")
    clear_bills()
    print("cleared this tenant's bills (scratch only) so doc_no is deterministic")

    with httpx.Client(timeout=15.0) as client:
        token = login(client, TENANT_A_ID, TENANT_A_PASSWORD)

        # ------------------------------------------------------------- G1
        banner("G1 — the hot path: current year's counter already exists")
        set_counters([BE_NOW])
        r = post_bill(client, token, "hot")
        print(f"  POST /bills -> {r.status_code} doc_no={r.json().get('doc_no')}")
        check(r.status_code == 201, "G1: a normal bill in the current year writes",
              f"status={r.status_code}")
        check(str(r.json().get("doc_no", "")).startswith(f"B-{BE_NOW}-"),
              "G1: doc_no carries the current be_year")

        # ------------------------------------------------------------- G2
        banner("G2 — Y == max+1 allowed (the legitimate new year)")
        set_counters([BE_NOW - 1])
        r = post_bill(client, token, "newyear")
        print(f"  counters={snapshot()}  POST -> {r.status_code} doc_no={r.json().get('doc_no')}")
        check(r.status_code == 201, "G2: Y == max+1 is allowed", f"status={r.status_code}")
        check(str(r.json().get("doc_no", "")) == f"B-{BE_NOW}-1",
              "G2: the new year opens at seq 1", str(r.json().get("doc_no")))

        # ------------------------------------------------------------- G3
        banner("G3 — reopening after MONTHS shut is still max+1, still allowed")
        # A seasonally closed yard: last bill was early in the previous year.
        set_counters([BE_NOW - 1])
        sql(f"UPDATE doc_no_counters SET last_seq = 900 WHERE tenant_id='{TENANT_A_ID}'")
        r = post_bill(client, token, "reopen")
        print(f"  counters={snapshot()}  POST -> {r.status_code} doc_no={r.json().get('doc_no')}")
        check(r.status_code == 201, "G3: a yard shut for months reopens fine",
              f"status={r.status_code}")

        # ------------------------------------------------------------- G4
        banner("G4 RED-CASE — Y > max+1 refused (clock jumped forward >1 year)")
        set_counters([BE_NOW - 3])
        before = snapshot()
        r = post_bill(client, token, "ahead")
        after = snapshot()
        j = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        print(f"  counters before={before} after={after}  POST -> {r.status_code}")
        print(f"  detail={j.get('detail')}")
        check(r.status_code == 409, "G4: Y > max+1 is refused", f"status={r.status_code}")
        check(isinstance(j.get("detail"), dict)
              and j["detail"].get("code") == "be_year_not_contiguous",
              "G4: refusal is machine-readable")
        check(before == after, "G4: NO counter row was created for the bad year",
              f"{before} -> {after}")

        # ------------------------------------------------------------- G5
        banner("G5 RED-CASE — Y < max refused (clock fell back into a closed year)")
        set_counters([BE_NOW + 2])
        before = snapshot()
        r = post_bill(client, token, "behind")
        after = snapshot()
        j = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        print(f"  counters before={before} after={after}  POST -> {r.status_code}")
        check(r.status_code == 409, "G5: Y < max is refused", f"status={r.status_code}")
        check(before == after, "G5: NO counter row created", f"{before} -> {after}")

        # ------------------------------------------------------------- G6
        banner("G6 — a tenant's FIRST EVER counter is allowed, by design and unguarded")
        set_counters([])
        r = post_bill(client, token, "first")
        print(f"  counters before=(none) after={snapshot()}  POST -> {r.status_code}")
        check(r.status_code == 201, "G6: the first counter is allowed with no predecessor",
              f"status={r.status_code}")
        check(snapshot() == str(BE_NOW), "G6: it opened the CURRENT year", snapshot())
        print("  NOTE: this is the documented hole. A tenant onboarded under a")
        print("  wrong clock takes a wrong first year and nothing here objects.")

        # ------------------------------------------------------------- G7
        banner("G7 — the gate did not disable the PART 1 clock guard")
        h = client.get(f"{BASE}/health")
        print(f"  /health -> {h.status_code} tripped={h.json().get('clock', {}).get('tripped')}")
        check(h.status_code == 200, "G7: clock guard still green alongside the gate")
        check(h.json().get("clock", {}).get("has_evaluated") is True,
              "G7: clock guard is still actually evaluating")

    print("\n" + "=" * 70)
    if FAILS:
        print(f"YEAR GATE PROOF FAILED — {len(FAILS)} cell(s):")
        for f in FAILS:
            print(f"  - {f}")
        return 1
    print("YEAR GATE PROOF OK — every cell above passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
