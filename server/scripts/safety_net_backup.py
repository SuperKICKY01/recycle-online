r"""The local safety-net backup job — automate the proven dump, off the source disk.

    server\.venv\Scripts\python.exe server\scripts\safety_net_backup.py --dest D:\recycle-backups

WHAT THIS ADDS TO backup_db.py, AND WHAT IT DELIBERATELY DOES NOT. backup_db.py
already writes a self-verifying, RLS-safe dump and refuses the silent-empty
backup; prove_backup_restore.py already proves the round trip. Neither runs
itself, and both write to E: — the same disk as the repository. This job wraps
the proven tool with the three things P1.2's backup half was missing:

    1. it REFUSES to run unless the destination is on a DIFFERENT physical disk
       from the source (the repo/.env disk, and the database's Docker disk),
       because a copy on the same disk is not a backup (safety_net_common.py);
    2. it copies the two single-copy assets a database dump cannot contain —
       server/.env (the credential) and a record of the git commit whose
       migrations this schema matches (SOURCE_REVISION.json) — so a restored
       database can be matched to code that understands it;
    3. it PRUNES old runs to a stated retention, updates a local heartbeat, and
       fails LOUDLY (never a silent skip) when the drive is unplugged or full.

WHY server/.env GOES TO THE DESTINATION IN CLEARTEXT — A STATED DECISION, NOT A
SIDE EFFECT. Each dump directory already carries globals.sql, which holds the
cluster PASSWORD HASHES, so the directory is a credential store the moment it
exists. Copying server/.env beside it (the three DSN passwords and JWT_SECRET)
adds no new class of secret — the drive is already as sensitive as the machine.
This is ACCEPTED only because the destination is a drive kept under the SAME
physical control as the machine. IT BECOMES UNACCEPTABLE the moment either is
true: the drive leaves the building, or a real shop's data is in the dumps. That
is the trigger to add encryption at rest before anything else — named now, in
OPEN_ITEMS.md, so it is not forgotten. A dump directory is a credential store,
not a data file; treat it exactly like the database.

RETENTION. KEEP_RUNS most-recent safety-net runs are kept; older ones this job
created (marked) are pruned. The dump is written FIRST and pruning happens
AFTER, so a good backup is never deleted to make room for one that then fails; a
full destination fails loudly with nothing deleted.

DELIBERATELY OUT OF SCOPE (owner's decision, local-and-free first): encryption at
rest, any internet/off-site upload, and reaching a database this job cannot
`docker exec` into. Those are the next steps and are recorded in ROADMAP § P1.2.
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

import safety_net_common as C  # noqa: E402
import check_backup_freshness as freshness  # noqa: E402

# The retention rule, in ONE named constant (S3). 30 daily runs ~= a month of
# history on a drive where each run is a few hundred KB. The number is a rule,
# not a space calculation: the destination has gigabytes free, so the reason to
# bound it is to keep the directory legible and old credentials from piling up,
# not to save space.
KEEP_RUNS = 30


def _print(msg: str = "") -> None:
    print(msg, flush=True)


def _git(args: list[str]) -> str:
    cp = C.run(["git", "-C", str(C.REPO_DIR), *args])
    return C.out_text(cp).strip() if cp.returncode == 0 else ""


def _source_revision(container: str, db: str) -> dict:
    """The git commit + schema revision this dump corresponds to.

    A dump without its migration revision is a puzzle: you cannot know which code
    understands the data. Read the alembic revision from the LIVE database
    (read-only) and the commit from git; record whether the tree was dirty,
    because a dump taken from a dirty tree matches no clean commit exactly.
    """
    head = _git(["rev-parse", "HEAD"])
    dirty = _git(["status", "--porcelain"]) != ""
    alembic = C.psql_scalar(container, db, "select version_num from alembic_version")
    return {
        "git_head": head,
        "git_head_short": head[:7],
        "git_tree_dirty": dirty,
        "alembic_version": alembic,
        "recorded_utc": C.now_utc().isoformat(),
        "note": ("The code commit whose migrations this schema matches. Restore this dump "
                 "AND check out this commit to get a system that understands the data. If "
                 "git_tree_dirty is true, uncommitted changes were present and no clean "
                 "commit reproduces the schema exactly."),
    }


def _write_dest_status(dest: Path, ok: bool, detail: str) -> None:
    """Best-effort loud signal AT the destination. May itself fail if the drive
    is full or gone; that is caught and the local last_run record still stands."""
    try:
        (dest / "STATUS.txt").write_text(
            f"{'OK' if ok else 'FAILED'} at {C.now_utc().isoformat()}\n{detail}\n",
            encoding="utf-8", newline="\n")
        failed_marker = dest / "LAST_RUN_FAILED.txt"
        if ok:
            if failed_marker.exists():
                failed_marker.unlink()
        else:
            failed_marker.write_text(
                f"The safety-net backup FAILED at {C.now_utc().isoformat()}.\n{detail}\n\n"
                "This file stays until a run succeeds. See BACKUP_OVERDUE.md in the repo, "
                "which git surfaces after 3 stale days.\n",
                encoding="utf-8", newline="\n")
    except OSError as e:
        _print(f"  (could not write status to the destination: {e})")


def perform(dest: Path, container: str, db: str, keep: int) -> dict:
    """Do the work; raise C.Abort with an exit code on any failure."""
    _print("=== destination safety (S1) ===")
    for line in C.assert_destination_safe(dest):
        _print(f"  {line}")
    dest.mkdir(parents=True, exist_ok=True)

    _print("\n=== preflight ===")
    status = C.container_status(container)
    if not status:
        raise C.Abort(C.EXIT_COULD_NOT_RUN,
                      f"container {container!r} is not running (docker compose up -d)")
    _print(f"  container   : {status}")

    _print("\n=== dump (backup_db.py) ===")
    before = {p.name for p in dest.iterdir() if p.is_dir()}
    cp = C.run([str(C.VENV_PYTHON), str(SCRIPTS_DIR / "backup_db.py"),
                "--out", str(dest), "--db", db, "--container", container])
    for ln in C.out_text(cp).splitlines():
        _print(f"    | {ln}")
    if cp.returncode != 0:
        for ln in C.err_text(cp).splitlines():
            _print(f"    ! {ln}")
        raise C.Abort(C.EXIT_FAILED, f"backup_db.py exited {cp.returncode}; no dump written")
    after = {p.name for p in dest.iterdir() if p.is_dir()}
    new = sorted(after - before)
    if len(new) != 1:
        raise C.Abort(C.EXIT_FAILED,
                      f"backup_db.py did not produce exactly one new directory: {new}")
    dump_dir = dest / new[0]
    _print(f"  dump        : {dump_dir}")

    # 2a. the credential: server/.env, copied verbatim (never read/printed here).
    env_src = C.SERVER_DIR / ".env"
    if not env_src.is_file():
        raise C.Abort(C.EXIT_FAILED, f"{env_src} not found — cannot back up the credential half")
    env_dir = dump_dir / C.ENV_COPY_SUBDIR
    env_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(env_src, env_dir / ".env")
    _print(f"  env         : server/.env -> {env_dir / '.env'}  (CREDENTIAL — as sensitive as the DB)")

    # 2b. the revision record.
    revision = _source_revision(container, db)
    (dump_dir / "SOURCE_REVISION.json").write_text(
        json.dumps(revision, indent=2, ensure_ascii=False), encoding="utf-8", newline="\n")
    _print(f"  revision    : git {revision['git_head_short']}"
           f"{' (DIRTY tree)' if revision['git_tree_dirty'] else ''}, "
           f"alembic {revision['alembic_version']}")

    # the marker that makes this a safety-net run (retention + drill find only these).
    (dump_dir / C.SAFETY_NET_MARKER).write_text(
        json.dumps({"tool": "safety_net_backup.py", "run_utc": C.now_utc().isoformat(),
                    "dir": dump_dir.name}, indent=2), encoding="utf-8", newline="\n")

    rows = 0
    try:
        manifest = json.loads((dump_dir / "MANIFEST.json").read_text(encoding="utf-8"))
        rows = sum(manifest.get("row_counts_in_dump", {}).values())
    except (OSError, json.JSONDecodeError):
        pass

    # 3. retention — AFTER the dump is safely written. Only marked dirs.
    _print("\n=== retention ===")
    runs = C.safety_net_dirs(dest)
    keep_set = runs[:keep]
    prune = runs[keep:]
    _print(f"  keep {keep}: {len(keep_set)} run(s) retained; {len(prune)} to prune")
    for old in prune:
        try:
            shutil.rmtree(old)
            _print(f"    pruned {old.name}")
        except OSError as e:
            _print(f"    could NOT prune {old.name}: {e}")

    _write_dest_status(dest, True, f"dump {dump_dir.name}, {rows} rows, git {revision['git_head_short']}")
    C.write_heartbeat({
        "last_success_utc": C.now_utc().isoformat(),
        "destination": str(dest),
        "dump_dir": dump_dir.name,
        "rows": rows,
        "git_head": revision["git_head"],
        "alembic_version": revision["alembic_version"],
    })
    return {"dump_dir": str(dump_dir), "rows": rows}


def main() -> int:
    ap = argparse.ArgumentParser(description="Local safety-net backup job (P1.2 backup half).")
    ap.add_argument("--dest", default=os.environ.get("RECYCLE_SAFETY_NET_DIR"),
                    help="off-disk destination root (or env RECYCLE_SAFETY_NET_DIR). "
                         "NO DEFAULT: the destination is configuration, never code.")
    ap.add_argument("--container", default=C.DEFAULT_CONTAINER)
    ap.add_argument("--db", default=C.DEFAULT_DB)
    ap.add_argument("--keep", type=int, default=KEEP_RUNS)
    args = ap.parse_args()

    started = C.now_utc()
    if not args.dest:
        _print("SAFETY-NET BACKUP FAILED: no destination. Pass --dest <drive> or set "
               "RECYCLE_SAFETY_NET_DIR. The destination is configuration, and this job "
               "refuses to guess one.")
        C.write_last_run({"utc": started.isoformat(), "outcome": "misconfigured",
                          "exit": C.EXIT_COULD_NOT_RUN, "detail": "no destination set"})
        _run_freshness()
        return C.EXIT_COULD_NOT_RUN

    dest = Path(args.dest)
    try:
        result = perform(dest, args.container, args.db, args.keep)
    except C.Abort as ab:
        _print(f"\nSAFETY-NET BACKUP FAILED ({_code_name(ab.code)}): {ab.message}")
        # Loud at the destination too — but ONLY when the destination itself is
        # not the problem. For UNAVAILABLE (unplugged/no drive) and UNSAFE_DISK
        # (the wrong disk) we must NOT create or write there: creating a directory
        # on a disk we just refused is the opposite of the point, and there is
        # nowhere safe to write on an absent one. The local last_run record and
        # the freshness alarm below carry those cases instead.
        if ab.code not in (C.EXIT_UNAVAILABLE, C.EXIT_UNSAFE_DISK):
            try:
                dest.mkdir(parents=True, exist_ok=True)
                _write_dest_status(dest, False, ab.message)
            except OSError:
                pass
        C.write_last_run({"utc": started.isoformat(), "outcome": "failed",
                          "exit": ab.code, "detail": ab.message})
        _run_freshness()
        return ab.code

    _print(f"\nSAFETY-NET BACKUP OK: {result['dump_dir']} ({result['rows']} rows)")
    C.write_last_run({"utc": started.isoformat(), "outcome": "ok", "exit": C.EXIT_OK,
                      "detail": result["dump_dir"]})
    msg = _run_freshness()
    if msg:
        _print(f"  freshness: {msg}")
    return C.EXIT_OK


def _code_name(code: int) -> str:
    return {C.EXIT_FAILED: "backup failed", C.EXIT_COULD_NOT_RUN: "could not run",
            C.EXIT_UNAVAILABLE: "destination unavailable",
            C.EXIT_UNSAFE_DISK: "destination on the source disk"}.get(code, f"exit {code}")


def _run_freshness() -> str:
    try:
        _, msg = freshness.refresh_marker()
        return msg
    except Exception as e:  # freshness must never mask the job's own outcome
        return f"(freshness check errored: {e})"


if __name__ == "__main__":
    code = main()
    print(f"SAFETY_NET_BACKUP_EXIT={code}")
    sys.exit(code)
