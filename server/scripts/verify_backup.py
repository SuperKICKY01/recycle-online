r"""The restore drill — a backup nobody has restored is a hope, not a backup.

    server\.venv\Scripts\python.exe server\scripts\verify_backup.py --dest D:\recycle-backups
    server\.venv\Scripts\python.exe server\scripts\verify_backup.py --dir  <one dump directory>

WHY THIS IS A NEW SCRIPT AND NOT AN EXTENSION OF prove_backup_restore.py.
prove_backup_restore.py verifies a FRESH round trip of the LIVE database — it
dumps live now and checks the restore against it. This drill verifies an EXISTING
at-rest backup FILE sitting on the off-disk destination, days after it was
written, which is the artefact a real recovery depends on. Different subject,
different failure modes (a bit-rotted USB, a half-written dump), so a different
script.

WHAT IT REUSES, AND WHAT IT ADDS. It restores the newest backup into a SCRATCH
database with restore_db.py, which already verifies every file's sha256 (so a
flipped byte is caught), refuses a body containing \connect, checks the restored
row counts against the dump's own manifest, and asserts RLS is still FORCEd. This
drill adds the checks restore_db.py does not make:

    * the restored alembic revision EQUALS the revision the job recorded at dump
      time (SOURCE_REVISION.json) — the schema is at the commit it claims;
    * table GRANTS in the restore match the live source (a restore that dropped
      a grant leaves recycle_app unable to read, with the data all present);
    * a known bill reads back byte-identical — money and weight as TEXT, digit
      for digit (lessons/a-backup-is-a-claim-until-it-is-restored.md §4), and its
      Thai master-data names byte-faithful to the dump file (cp874 corruption
      guard, lessons/console-is-not-the-observation.md).

Then it DROPS the scratch database. It exits non-zero on any mismatch, printing
the operands.

ADDITION (1): UNPLUGGED IS NOT THE SAME AS FAILING. A removable USB drive that is
not plugged in (exit 3, UNAVAILABLE) is a different fact from a drive that is
present but whose dump cannot be read or does not verify (exit 1, FAILED). The
drill classifies the destination first and, before restoring, tries to READ each
dump file so a dying drive is reported as failing rather than as a bad backup.

THE DISPROOF (run it, do not trust this comment): copy the newest dump to a
scratch location, flip ONE byte of its recycle.sql, and run this with --dir on
the copy. restore_db.py's checksum cell goes red and this exits 1 naming that
file. Restore the good copy and it is green again. A check never seen red has not
been observed (lessons/a-check-that-never-went-red-was-never-observed.md).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

import safety_net_common as C  # noqa: E402

SCRATCH_DB = "recycle_backup_drill_scratch"

_failures: list[str] = []


def _print(msg: str = "") -> None:
    print(msg, flush=True)


def check(label: str, ok: bool, detail: str = "") -> bool:
    _print(f"  [{'OK  ' if ok else 'FAIL'}] {label}{' — ' + detail if detail else ''}")
    if not ok:
        _failures.append(label)
    return ok


def psql_rows(container: str, db: str, sql: str) -> list[str]:
    """One-line SQL as the superuser; raw bytes decoded UTF-8; lines back."""
    if "\n" in sql:
        raise ValueError("SQL passed as an argument must be a single line")
    cp = C.run(["docker", "exec", "-e", "PGCLIENTENCODING=UTF8", container,
                "psql", "-U", "postgres", "-d", db, "-Atq", "-v", "ON_ERROR_STOP=1", "-c", sql])
    if cp.returncode != 0:
        raise C.Abort(C.EXIT_COULD_NOT_RUN, f"psql({db}) failed: {C.err_text(cp)}")
    return [ln for ln in C.out_text(cp).strip("\n").split("\n") if ln != ""]


def _scalar(container: str, db: str, sql: str) -> str | None:
    rows = psql_rows(container, db, sql)
    return rows[0] if rows else None


def _newest_dir(dest: Path) -> Path | None:
    dirs = C.safety_net_dirs(dest)
    return dirs[0] if dirs else None


def _assert_readable(dump_dir: Path, manifest: dict) -> None:
    """Read a chunk of every file the manifest lists. An OSError here is a DRIVE
    that is present but FAILING (bit rot, a yanked USB mid-read) — reported
    distinctly from a corrupt-but-readable dump (which the checksum catches)."""
    for name in manifest.get("files", {}):
        path = dump_dir / name
        try:
            with path.open("rb") as fh:
                fh.read(1 << 16)
        except OSError as e:
            raise C.Abort(C.EXIT_FAILED, f"DESTINATION FAILING: cannot read {name}: {e} "
                          "(the drive is present but unreadable — not a corrupt backup)")


def _restore(container: str, dump_dir: Path) -> None:
    _print("\n=== restore into scratch (restore_db.py: checksums, \\connect, row counts, RLS) ===")
    cp = C.run([str(C.VENV_PYTHON), str(SCRIPTS_DIR / "restore_db.py"), str(dump_dir),
                "--into", SCRATCH_DB, "--container", container])
    for ln in C.out_text(cp).splitlines():
        _print(f"    | {ln}")
    if cp.returncode != 0:
        for ln in C.err_text(cp).splitlines():
            _print(f"    ! {ln}")
        # restore_db prints "sha256 mismatch" for a flipped byte — name that so
        # the disproof's target cell is unmistakable.
        why = "checksum/verification" if "sha256" in C.out_text(cp) + C.err_text(cp) else "restore"
        raise C.Abort(C.EXIT_FAILED,
                      f"restore_db.py exited {cp.returncode} ({why}); the backup did not verify")
    check("restore_db.py verified and restored the backup", True, f"scratch {SCRATCH_DB}")


def _drop_scratch(container: str) -> None:
    C.run(["docker", "exec", container, "psql", "-U", "postgres", "-d", "postgres",
           "-c", f"DROP DATABASE IF EXISTS {SCRATCH_DB} WITH (FORCE)"])


# --- immutable bill columns (never change after creation: hard rules 5 & 6). ---
# voided_at/by/reason are EXCLUDED because a void can land after the dump, which
# is legitimate drift, not a restore defect.
_BILL_IMMUTABLE = ("id::text,coalesce(doc_no,''),seller_id::text,coalesce(vehicle_no,''),"
                   "idempotency_key,total_amount::text,device_created_at::text,server_received_at::text")
_ITEM_COLS = ("line_no::text,product_id::text,gross_weight::text,tare_weight::text,"
              "net_weight::text,unit_price::text,list_price::text,amount::text")


def _bill_line(container: str, db: str, bill_id: str) -> str | None:
    rows = psql_rows(container, db,
                     f"set time zone 'UTC'; select concat_ws('|',{_BILL_IMMUTABLE}) "
                     f"from public.purchase_bills where id = '{bill_id}'")
    return rows[0] if rows else None


def _item_lines(container: str, db: str, bill_id: str) -> list[str]:
    return psql_rows(container, db,
                     f"set time zone 'UTC'; select concat_ws('|',{_ITEM_COLS}) "
                     f"from public.purchase_bill_items where bill_id = '{bill_id}' order by line_no")


def _thai_names(container: str, db: str, bill_id: str) -> list[str]:
    """The witness bill's seller + product names, so we can prove byte-fidelity."""
    return psql_rows(container, db,
                     f"select s.name from public.sellers s join public.purchase_bills b "
                     f"on b.seller_id = s.id where b.id = '{bill_id}' "
                     f"union all select p.name from public.products p "
                     f"join public.purchase_bill_items i on i.product_id = p.id "
                     f"where i.bill_id = '{bill_id}'")


def _grants(container: str, db: str) -> set[str]:
    return set(psql_rows(container, db,
               "select concat_ws('|', grantee, table_name, privilege_type) "
               "from information_schema.role_table_grants where table_schema = 'public' "
               "order by grantee, table_name, privilege_type"))


def verify(container: str, live_db: str, dump_dir: Path) -> None:
    manifest = json.loads((dump_dir / "MANIFEST.json").read_text(encoding="utf-8"))
    revision_path = dump_dir / "SOURCE_REVISION.json"
    revision = json.loads(revision_path.read_text(encoding="utf-8")) if revision_path.is_file() else {}

    _print("=== the backup under test ===")
    _print(f"  directory : {dump_dir}")
    _print(f"  taken     : {manifest.get('started_utc')}")
    _print(f"  recorded  : git {revision.get('git_head_short', '?')}, "
           f"alembic {revision.get('alembic_version', '?')}")

    _assert_readable(dump_dir, manifest)
    _restore(container, dump_dir)

    # 1. alembic revision == the revision the job recorded at dump time.
    _print("\n=== assertions against the RESTORED copy ===")
    scratch_alembic = _scalar(container, SCRATCH_DB, "select version_num from public.alembic_version")
    recorded_alembic = revision.get("alembic_version")
    live_alembic = _scalar(container, live_db, "select version_num from public.alembic_version")
    if recorded_alembic is None:
        check("recorded revision present to compare against", False,
              "SOURCE_REVISION.json missing or has no alembic_version")
    else:
        check("restored alembic revision equals the recorded one",
              scratch_alembic == recorded_alembic,
              f"restored={scratch_alembic} recorded={recorded_alembic} (live now={live_alembic})")

    # 2. grants match the live source (soft-noted if the live schema has advanced).
    g_scratch, g_live = _grants(container, SCRATCH_DB), _grants(container, live_db)
    if g_scratch == g_live:
        check("table grants match the live source", True, f"{len(g_scratch)} grants")
    elif recorded_alembic is not None and live_alembic != recorded_alembic:
        _print(f"  [NOTE] grants differ but live schema has advanced past this backup "
               f"(live={live_alembic}, backup={recorded_alembic}); "
               f"symmetric diff {sorted(g_scratch ^ g_live)[:6]} — not counted as a failure")
    else:
        check("table grants match the live source", False,
              f"symmetric diff {sorted(g_scratch ^ g_live)[:8]}")

    # 3. a known bill, byte-identical. Witness comes from the RESTORE (guaranteed
    #    to be in the dump); compared to live on IMMUTABLE columns only.
    witness = _scalar(container, SCRATCH_DB,
                      "select b.id::text from public.purchase_bills b "
                      "join public.purchase_bill_items i on i.bill_id = b.id "
                      "group by b.id, b.server_received_at order by b.server_received_at desc limit 1")
    if not check("the restored database has a witness bill with items (positive control)",
                 witness is not None, str(witness)):
        return

    r_bill = _bill_line(container, SCRATCH_DB, witness)
    r_items = _item_lines(container, SCRATCH_DB, witness)
    l_bill = _bill_line(container, live_db, witness)
    if l_bill is None:
        _print(f"  [SKIP] witness {witness} is absent from live — live was rebuilt AFTER this "
               "backup; the byte-identity cell needs a witness present on both sides. Row "
               "counts (vs the dump's manifest) and alembic already cover completeness.")
    else:
        l_items = _item_lines(container, live_db, witness)
        check("the witness bill's immutable columns are byte-identical (money as TEXT)",
              r_bill == l_bill, f"restored={r_bill!r} live={l_bill!r}")
        check("every item's weight and money column is byte-identical",
              r_items == l_items,
              f"restored={r_items} live={l_items}" if r_items != l_items else f"{len(r_items)} item(s)")

    # 3b. Thai names byte-faithful to the DUMP FILE (drift-proof; catches cp874
    #     corruption in the restore). The dump stores names as UTF-8 bytes.
    body_bytes = (dump_dir / manifest["body_file"]).read_bytes()
    names = [n for n in _thai_names(container, SCRATCH_DB, witness) if n]
    if names:
        missing = [n for n in names if n.encode("utf-8") not in body_bytes]
        check("the witness's Thai master-data names are byte-faithful to the dump",
              not missing, f"{len(names)} name(s); missing {missing}" if missing else f"{len(names)} name(s)")
    else:
        _print("  [NOTE] the witness bill references no non-empty master-data names to hex-check")

    # 4. RLS, re-read for the record (restore_db already hard-fails if it is gone).
    rls = psql_rows(container, SCRATCH_DB,
                    "select concat_ws('|', count(*) filter (where c.relrowsecurity), "
                    "count(*) filter (where c.relforcerowsecurity), "
                    "(select count(*) from pg_policies where schemaname='public')) "
                    "from pg_class c join pg_namespace n on n.oid = c.relnamespace "
                    "where n.nspname='public' and c.relkind='r'")[0].split("|")
    check("RLS still binds in the restore (ENABLE, FORCE, policies all present)",
          rls[1] != "0" and rls[2] != "0",
          f"{rls[0]} ENABLE, {rls[1]} FORCE, {rls[2]} policies")


def main() -> int:
    ap = argparse.ArgumentParser(description="Restore drill for a safety-net backup.")
    ap.add_argument("--dest", default=os.environ.get("RECYCLE_SAFETY_NET_DIR"),
                    help="destination whose NEWEST safety-net dump is verified "
                         "(or env RECYCLE_SAFETY_NET_DIR)")
    ap.add_argument("--dir", dest="one_dir", default=None,
                    help="verify ONE specific dump directory instead of the newest on --dest "
                         "(used by the corruption disproof)")
    ap.add_argument("--container", default=C.DEFAULT_CONTAINER)
    ap.add_argument("--live-db", default=C.DEFAULT_DB,
                    help="the live source database to compare grants/witness against")
    args = ap.parse_args()

    try:
        if args.one_dir:
            dump_dir = Path(args.one_dir)
            if not (dump_dir / "MANIFEST.json").is_file():
                raise C.Abort(C.EXIT_COULD_NOT_RUN, f"{dump_dir} is not a backup directory")
        else:
            if not args.dest:
                raise C.Abort(C.EXIT_COULD_NOT_RUN,
                              "no --dest and no --dir; nothing to verify")
            status, detail = C.classify_destination(args.dest)
            if status != "ok":
                # UNPLUGGED / not-a-drive: distinct from a failing or bad backup.
                raise C.Abort(C.EXIT_UNAVAILABLE, detail)
            dump_dir = _newest_dir(Path(args.dest))
            if dump_dir is None:
                raise C.Abort(C.EXIT_COULD_NOT_RUN,
                              f"no safety-net backup found under {args.dest}")

        if not C.container_status(args.container):
            raise C.Abort(C.EXIT_COULD_NOT_RUN, f"container {args.container!r} is not running")

        try:
            verify(args.container, args.live_db, dump_dir)
        finally:
            _drop_scratch(args.container)

    except C.Abort as ab:
        _print(f"\nDRILL FAILED ({ab.code}): {ab.message}")
        return ab.code

    if _failures:
        _print(f"\nDRILL FAILED: {_failures}")
        return C.EXIT_FAILED
    _print(f"\nDRILL OK: {dump_dir.name} restored and verified; scratch dropped")
    return C.EXIT_OK


if __name__ == "__main__":
    code = main()
    print(f"VERIFY_BACKUP_EXIT={code}")
    sys.exit(code)
