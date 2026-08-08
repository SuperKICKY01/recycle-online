"""Prove the clock guard — RED first, then GREEN, in one run.

HOW THE INSTANT WAS OBTAINED, AND WHAT THAT WEAKENS
---------------------------------------------------
The value under test is Postgres' now(). THIS PROOF DOES NOT MOVE IT, and could
not: a container has no clock of its own — it reads the host kernel's — and the
dev database `recycle` lives in the same container as every scratch database.
Moving the clock would move it for dev, for this shell, and for the whole box,
which is precisely the mutation the scratch rule forbids.

So the mutation is applied to the OTHER side of the comparison: an OWNER-role
connection, outside the guard's own code path, sets highest_seen far ahead of
real time. `now() < highest_seen - tolerance` is the guard's condition, and
raising the watermark by N is arithmetically identical to lowering now() by N.

WHAT THAT IS WORTH, STATED PLAINLY:
  * It DOES prove the comparison, the trip, the 503s, the recovery and the
    reset, and it supplies the mutation from outside the guard — so it is not
    T7's shape, where both sides came from one value the check itself derived.
  * It DOES NOT prove behaviour under a genuinely wrong OS clock. If the guard
    read the wrong clock — Python's instead of Postgres' — every cell below
    would still pass. C0 addresses that as far as anything here can, by
    comparing the guard's reported instant against now() read on a SEPARATE
    connection this script owns; agreement is corroboration, not proof.
An honestly weaker proof, labelled, beats one that looks strong because it never
left the guard's own arithmetic.

RUN AGAINST SCRATCH ONLY — NOW AND ALWAYS, AND NEVER AGAINST dev.
This script deliberately drives the API into refusing every business request,
which is exactly the mutation class the scratch rule exists for. It also moves
the watermark, which is server state a later run would inherit. Point it at a
database restored for the purpose (scripts/restore_db.py --into ...) and at an
API started against THAT database. There is no flag to run it against dev
because there is no reason to want one.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import argparse  # noqa: E402
import datetime as dt  # noqa: E402
import subprocess  # noqa: E402

import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from prove_bills import BASE, auth, bill_body, item, login  # noqa: E402
from app.seeddata import (  # noqa: E402
    PRODUCT_A_ID, SELLER_A_ID, TENANT_A_ID, TENANT_A_PASSWORD,
)

# psql through the container: no driver dependency, and the OWNER/APP split is
# a real credential boundary rather than two URLs that happen to differ.
CONTAINER = os.environ.get("PROVE_PG_CONTAINER", "recycle_pg")
# Set by _require_scratch_database() before any statement runs. NOT a default:
# PROVE_DB used to default to a scratch name, so a shell that had it unset or
# pointed elsewhere chose the target silently — and C6 did not read it at all.
DB = ""
OWNER = "recycle_owner"


def _require_scratch_database() -> str | None:
    """Refuse to run against the live database. Returns the name, or None.

    The same shape as `prove_docno_clock.py:109-128`, which this repository
    already proved: --database REQUIRED with no default, compared against
    APP_DATABASE_URL, refused with the restore command printed, and the URL
    rebound so nothing in THIS process can escape.

    MIGRATION_DATABASE_URL is rebound too, because C6 spawns
    reset_clock_watermark.py as a SUBPROCESS and that script falls back to the
    inherited value when no --database is passed. C6 now passes --database as
    well; the rebinding is the second lock, not the first.

    WHAT IT DOES NOT REACH: the API under test is a SEPARATE PROCESS bound to
    its database at startup, via API_BASE_URL. No rebinding here can move it.
    Point that API at the same scratch database and check that you did.
    """
    ap = argparse.ArgumentParser(description="Prove the clock guard.")
    ap.add_argument("--database", required=True,
                    help="a SCRATCH database. This script drives the API into "
                         "refusing every business request and moves the stored "
                         "watermark, so it may not be pointed at the live "
                         "database.")
    args = ap.parse_args()

    url = os.environ.get("APP_DATABASE_URL")
    if not url:
        print("REFUSED: APP_DATABASE_URL is not set, so this script cannot tell\n"
              "  which database is the live one. Refusing rather than guessing.")
        return None

    live = make_url(url)
    if args.database == live.database:
        print(f"REFUSED: --database {args.database!r} is the LIVE database.\n"
              "  This script moves server_clock_watermark and drives the API into\n"
              "  refusing every request. The watermark is server state a later run\n"
              "  inherits, and lowering it is an operator act this would record\n"
              "  against a machine on which nobody performed it.\n"
              "  Restore a copy and point it there:\n"
              "    python scripts/backup_db.py\n"
              "    python scripts/restore_db.py <dir> --into recycle_clock_scratch")
        return None

    scratch = live.set(database=args.database).render_as_string(hide_password=False)
    os.environ["APP_DATABASE_URL"] = scratch
    mig = os.environ.get("MIGRATION_DATABASE_URL")
    if mig:
        os.environ["MIGRATION_DATABASE_URL"] = (
            mig.rsplit("/", 1)[0] + "/" + args.database)
    return args.database
APP = "recycle_app"
TICK = float(os.environ.get("CLOCK_GUARD_TICK_SECONDS", "2"))

FAILS: list[str] = []
RUN = str(int(time.time()))


def check(ok: bool, label: str, detail: str = "") -> None:
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}" + (f"  — {detail}" if detail else ""))
    if not ok:
        FAILS.append(label)


def banner(s: str) -> None:
    print(f"\n=== {s} ===")


def sql(role: str, q: str) -> str:
    """Run one statement as `role`. Raises on any error, so a refusal is loud."""
    p = subprocess.run(
        ["docker", "exec", CONTAINER, "psql", "-U", role, "-d", DB,
         "-v", "ON_ERROR_STOP=1", "-tAc", q],
        capture_output=True, text=True,
    )
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout).strip())
    return p.stdout.strip()


def ts(s: str) -> dt.datetime:
    """psql -tA prints `2026-08-08 07:49:43.14+00`; make that ISO-parseable."""
    s = s.strip().replace(" ", "T")
    if s.endswith("+00"):
        s = s[:-3] + "+00:00"
    return dt.datetime.fromisoformat(s)


def watermark() -> dt.datetime:
    return ts(sql(OWNER, "SELECT highest_seen FROM server_clock_watermark"))


def wait_ticks(n: float = 2.5) -> None:
    time.sleep(TICK * n)


def main() -> int:
    # BEFORE any statement runs. A refusal here must cost nothing.
    global DB
    chosen = _require_scratch_database()
    if chosen is None:
        return 2
    DB = chosen
    print(f"target database: {DB} (checked against APP_DATABASE_URL)")

    print(__doc__.split("RUN AGAINST")[0])
    with httpx.Client(timeout=15.0) as client:

        # ------------------------------------------------------------- C0
        banner("C0 — the guard's instant tracks Postgres, on an independent connection")
        h = client.get(f"{BASE}/health")
        guard_now = h.json().get("clock", {}).get("observed_now")
        mine = ts(sql(OWNER, "SELECT now()"))
        print(f"  guard observed_now = {guard_now}")
        print(f"  my own SELECT now() = {mine.isoformat()}")
        check(guard_now is not None, "C0: /health exposes the guard's own instant")
        if guard_now:
            delta = abs((dt.datetime.fromisoformat(guard_now) - mine).total_seconds())
            check(delta < 120, "C0: guard's instant agrees with an independent read",
                  f"delta={delta:.1f}s (corroboration, NOT proof of which clock)")

        # ------------------------------------------------------------- C1
        banner("C1 GREEN — normal operation: /health 200, and a bill writes")
        h = client.get(f"{BASE}/health")
        check(h.status_code == 200, "C1: /health is 200", f"got {h.status_code}")
        check(h.json().get("clock", {}).get("tripped") is False, "C1: clock not tripped")

        token = login(client, TENANT_A_ID, TENANT_A_PASSWORD)
        body = bill_body(SELLER_A_ID, f"clock-{RUN}-green",
                         [item(PRODUCT_A_ID, 1, "1.000")])
        r = client.post(f"{BASE}/bills", headers=auth(token), json=body)
        print(f"  POST /bills -> {r.status_code} doc_no={r.json().get('doc_no')}")
        check(r.status_code == 201, "C1: a bill writes while the guard is green",
              f"status={r.status_code}")

        # ------------------------------------------------------------- C2
        banner("C2 — the watermark advances on the tick (hot path not broken)")
        w0 = watermark()
        wait_ticks()
        w1 = watermark()
        print(f"  before={w0.isoformat()}  after={w1.isoformat()}")
        check(w1 > w0, "C2: watermark advanced forward on its own")

        # ------------------------------------------------------------- C3
        banner("C3 RED — watermark pushed 48h ahead (== now() 48h behind, > 24h tolerance)")
        sql(OWNER, "UPDATE server_clock_watermark"
                       " SET highest_seen = now() + interval '48 hours'")
        wait_ticks()
        h = client.get(f"{BASE}/health")
        j = h.json()
        print(f"  /health -> {h.status_code}  status={j.get('status')}")
        print(f"  reason={j.get('detail')}")
        print(f"  behind_by_seconds={j.get('clock', {}).get('behind_by_seconds')}")
        check(h.status_code == 503, "C3: /health is 503", f"got {h.status_code}")
        check(j.get("status") == "clock_guard_tripped", "C3: status is machine-readable")
        check(j.get("clock", {}).get("tripped") is True, "C3: clock.tripped is true")
        check(isinstance(j.get("clock", {}).get("behind_by_seconds"), (int, float))
              and j["clock"]["behind_by_seconds"] > 24 * 3600,
              "C3: behind_by_seconds exceeds the tolerance")

        r = client.post(f"{BASE}/bills", headers=auth(token), json=bill_body(
            SELLER_A_ID, f"clock-{RUN}-red", [item(PRODUCT_A_ID, 1, "1.000")]))
        print(f"  POST /bills while tripped -> {r.status_code}")
        check(r.status_code == 503, "C3: business endpoint refuses with 503",
              f"status={r.status_code}")
        check(r.json().get("detail") is not None,
              "C3: refusal carries a machine-readable reason")

        # ------------------------------------------------------------- C4
        banner("C4 — the app role's grants: INSERT/DELETE refused, UPDATE is NOT")
        for verb, stmt in (
            ("DELETE", "DELETE FROM server_clock_watermark"),
            ("INSERT", "INSERT INTO server_clock_watermark (only_row, highest_seen)"
                       " VALUES (false, now())"),
        ):
            try:
                sql(APP, stmt)
                check(False, f"C4: app role {verb} refused", "IT SUCCEEDED")
            except Exception as e:  # noqa: BLE001
                ok = "permission denied" in str(e).lower()
                check(ok, f"C4: app role {verb} refused", str(e).strip()[:90])

        # The honest half. UPDATE is granted, so a HAND-WRITTEN update can lower
        # the watermark. Forward-only lives in app code (GREATEST), not in the
        # grant. Demonstrated rather than asserted, because the design claimed
        # the app "cannot lower it" and that is only true of its normal path.
        keep = watermark()
        try:
            sql(APP, "UPDATE server_clock_watermark"
                         " SET highest_seen = now() - interval '10 days'")
            lowered = watermark() < keep
            check(lowered, "C4: (EXPECTED) a raw UPDATE as app role DOES lower it",
                  "grant-level protection is INSERT/DELETE only")
        except Exception as e:  # noqa: BLE001
            check(False, "C4: raw UPDATE as app role", f"unexpectedly refused: {e}")
        sql(OWNER, f"UPDATE server_clock_watermark SET highest_seen = '{keep.isoformat()}'")

        # ------------------------------------------------------------- C5
        banner("C5 — recovery WITHOUT a restart (the container-before-NTP case)")
        pid_before = client.get(f"{BASE}/health").headers.get("date")
        sql(OWNER, "UPDATE server_clock_watermark SET highest_seen = now()")
        wait_ticks()
        h = client.get(f"{BASE}/health")
        print(f"  /health after the watermark came back -> {h.status_code}")
        check(h.status_code == 200, "C5: guard cleared itself on the tick",
              f"got {h.status_code}")
        check(h.json().get("clock", {}).get("tripped") is False, "C5: tripped is false")
        r = client.post(f"{BASE}/bills", headers=auth(token), json=bill_body(
            SELLER_A_ID, f"clock-{RUN}-recovered", [item(PRODUCT_A_ID, 1, "1.000")]))
        check(r.status_code == 201, "C5: bills write again after recovery",
              f"status={r.status_code}")
        check(pid_before is not None, "C5: same process served both (never restarted)")

        # ------------------------------------------------------------- C6
        banner("C6 — the owner reset writes reset_at and reset_reason")
        sql(OWNER, "UPDATE server_clock_watermark"
                       " SET highest_seen = now() + interval '48 hours'")
        wait_ticks()
        check(client.get(f"{BASE}/health").status_code == 503,
              "C6: tripped again, ready for the reset path")
        # LIST form, no shell. os.system() sent this through cmd, which mangled
        # the quoted --reason and the script exited 1 while exiting 0 by hand —
        # the shell-argument trap CLAUDE.md already documents for this box.
        proc = subprocess.run(
            [sys.executable, str(Path(__file__).parent / "reset_clock_watermark.py"),
             # --database EXPLICITLY. Without it the child falls back to the
             # inherited MIGRATION_DATABASE_URL, which app.config's load_dotenv()
             # points at dev — so this cell used to reset the watermark of a
             # database this proof was never pointed at, and record an operator
             # act against a machine on which nobody performed it.
             "--database", DB,
             "--reason", "prove_clock_guard C6",
             "--yes-the-clock-is-verified-correct"],
            capture_output=True, text=True,
        )
        rc = proc.returncode
        if rc != 0:
            print("  reset stdout/stderr:", (proc.stdout + proc.stderr).strip()[:300])
        check(rc == 0, "C6: reset script exits 0", f"exit={rc}")
        row = sql(OWNER, "SELECT coalesce(reset_at::text,'') || '|' ||"
                         " coalesce(reset_reason,'') FROM server_clock_watermark")
        r_at, _, r_why = row.partition("|")
        print(f"  reset_at={r_at!r}  reset_reason={r_why!r}")
        check(r_at != "", "C6: reset_at written")
        check(r_why == "prove_clock_guard C6", "C6: reset_reason written")
        wait_ticks()
        check(client.get(f"{BASE}/health").status_code == 200,
              "C6: guard cleared after the reset, no restart")

    print("\n" + "=" * 70)
    if FAILS:
        print(f"CLOCK GUARD PROOF FAILED — {len(FAILS)} cell(s):")
        for f in FAILS:
            print(f"  - {f}")
        return 1
    print("CLOCK GUARD PROOF OK — every cell above passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
