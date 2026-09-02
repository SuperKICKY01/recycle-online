r"""Surface a stale backup where the owner already looks — an unread failure is no backup.

    server\.venv\Scripts\python.exe server\scripts\check_backup_freshness.py

THE PROBLEM THIS SOLVES. safety_net_backup.py writes LAST_RUN_FAILED.txt and
STATUS.txt to the DESTINATION. Nobody looks at the destination until the day it
matters — which is exactly too late. So this adds a SECOND signal the owner
meets during ordinary work: after OVERDUE_DAYS with no successful off-disk
backup, it writes BACKUP_OVERDUE.md at the REPOSITORY ROOT.

WHY THE REPO ROOT. That file is not git-ignored, so it appears in `git status`
(the owner pushes and commits — twenty-one commits once sat unpushed, so git
state IS something looked at) AND in the git-status snapshot at the head of every
Claude Code session. Two touchpoints met during normal work, and neither is the
destination. When a backup next succeeds the marker is removed automatically, so
a healthy system has a CLEAN tree — the alarm costs nothing until it fires. The
heartbeat it reads lives on the REPO disk, so it is readable even when the USB
destination is unplugged (the case that most needs surfacing).

WHY OVERDUE_DAYS = 3, AND NOT 1 OR 7. The job runs daily, so the number is the
worst-case window of a silent failure before the owner is told. One day is too
twitchy — a single evening with the machine off, or the drive briefly
unplugged, would raise a false alarm. Seven is a week of silent failure on a
system recording real money. Three tolerates a weekend plus a day, and no more.
It counts failed AND missing runs alike, because both leave the last-success
heartbeat stale — the checker asks "how long since a backup actually worked",
which is the only question that matters.

THE RESIDUAL, STATED. If the machine (or the scheduled task) is entirely dead
for the whole window, nothing runs this checker to CREATE the marker until
something runs again. The daily task runs it as its last step, so a drive
unplugged for days IS caught within a day of the next task firing; a box off for
a week is caught the moment it boots and the task runs. What this cannot catch is
a box that is off AND never turned back on — but then there is no operator to
alarm either.
"""
from __future__ import annotations

import datetime as dt
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

import safety_net_common as C  # noqa: E402

OVERDUE_DAYS = 3


def _parse_iso(text: str) -> dt.datetime | None:
    try:
        return dt.datetime.fromisoformat(text.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def _overdue_body(reason: str, last_success: str | None, age_days: float | None) -> str:
    when = last_success or "NEVER (no successful safety-net backup on record)"
    age = f"{age_days:.1f} days ago" if age_days is not None else "unknown"
    return f"""# BACKUP OVERDUE

**The off-disk safety-net backup has not succeeded for more than {OVERDUE_DAYS} days.**

- Last successful backup: **{when}** ({age})
- Reason surfaced: {reason}

This file is written by `server/scripts/check_backup_freshness.py` and appears in
`git status` on purpose — it is how a silent backup failure reaches you. It is
removed automatically the next time a backup succeeds.

## What to check, in order

1. Is the backup drive plugged in? (the destination is a removable USB drive)
2. Is the destination not full?
3. Is the scheduled task still enabled? (Task Scheduler -> RecycleOnline-Backup-Daily)
4. Run it by hand and read the exit line:

   ```
   server\\.venv\\Scripts\\python.exe server\\scripts\\safety_net_backup.py --dest D:\\recycle-backups
   ```

   Exit 0 = OK; 3 = drive unavailable (unplugged); 4 = destination on the source
   disk; 1 = the backup itself failed; 2 = could not run (container down / no dest).

Do not delete this file by hand — a successful backup clears it, and clearing it
any other way hides the fact that there is still no recent backup.
"""


def refresh_marker() -> tuple[int, str]:
    """Create or remove BACKUP_OVERDUE.md based on the heartbeat. Returns
    (exit_code, human message). Importable so the job runs it as its last step."""
    hb = C.read_heartbeat()
    now = C.now_utc()

    overdue = False
    reason = ""
    last_success = None
    age_days: float | None = None

    if hb is None or "last_success_utc" not in hb:
        overdue = True
        reason = "no heartbeat: no successful safety-net backup has ever been recorded"
    else:
        last_success = hb["last_success_utc"]
        when = _parse_iso(last_success)
        if when is None:
            overdue = True
            reason = f"heartbeat timestamp unparseable: {last_success!r}"
        else:
            age_days = (now - when).total_seconds() / 86400.0
            if age_days > OVERDUE_DAYS:
                overdue = True
                reason = f"last success was {age_days:.1f} days ago (limit {OVERDUE_DAYS})"

    if overdue:
        C.OVERDUE_MARKER.write_text(_overdue_body(reason, last_success, age_days),
                                    encoding="utf-8", newline="\n")
        return C.EXIT_FAILED, f"OVERDUE -> wrote {C.OVERDUE_MARKER.name}: {reason}"

    if C.OVERDUE_MARKER.exists():
        C.OVERDUE_MARKER.unlink()
        return C.EXIT_OK, f"fresh ({age_days:.1f} days) -> removed {C.OVERDUE_MARKER.name}"
    return C.EXIT_OK, f"fresh ({age_days:.1f} days); no marker"


def main() -> int:
    code, msg = refresh_marker()
    print(msg)
    return code


if __name__ == "__main__":
    code = main()
    print(f"BACKUP_FRESHNESS_EXIT={code}")
    sys.exit(code)
