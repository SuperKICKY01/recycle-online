"""Shared plumbing for the local safety-net subsystem (P1.2, backup half).

Three scripts form one subsystem and are authored together:

    safety_net_backup.py      the daily job: dump + .env + revision, off-disk
    verify_backup.py          the weekly drill: restore the newest dump, assert
    check_backup_freshness.py the visible alarm: an overdue marker git surfaces

They share machinery that MUST agree across all three — the exit-code scheme,
the physical-disk detection that decides where a copy may live, and the paths
of the local heartbeat. That is why this is a module and not the deliberate
per-file duplication that backup_db.py / restore_db.py use for identifier
quoting: quoting is "arithmetic a second author re-derives" (see
lessons/a-checker-must-not-share-the-code-it-checks.md, Bound 1); an exit code
and a heartbeat path are a CONVENTION this subsystem owns, and the same lesson
says a convention is imported, never re-encoded.

WHAT THIS SUBSYSTEM IS FOR — read before touching it. As measured 2026-09-02,
the database (Docker/WSL2 on C:, physical disk 3) and the existing backups
(E:\\recycle-online-backups, disk 1) are ALREADY on different physical disks, and
restores from at-rest backup files have been performed repeatedly. So a single
disk death is already survivable today. What is NOT survivable is losing the
MACHINE — fire, theft, a whole-box failure — because every copy is inside it,
and nothing runs the backup on a schedule. This subsystem does exactly two
things about that: it makes the backup run itself, and it makes the copy reach a
drive that can physically leave the building (a removable USB). It does not add
encryption or an internet upload; those stay deliberately out of scope until the
owner chooses to pay for them.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
from pathlib import Path

# ---------------------------------------------------------------------------
# paths
# ---------------------------------------------------------------------------
SCRIPTS_DIR = Path(__file__).resolve().parent
SERVER_DIR = SCRIPTS_DIR.parent
REPO_DIR = SERVER_DIR.parent

# Local state, on the REPO disk so it is readable even when the USB is unplugged
# (the whole point of a heartbeat: it must survive the destination being gone).
# git-ignored — see .gitignore. The OVERDUE marker below is deliberately NOT
# ignored, because being seen in `git status` is its entire job.
STATE_DIR = SCRIPTS_DIR / ".backup_state"
HEARTBEAT_PATH = STATE_DIR / "heartbeat.json"
LAST_RUN_PATH = STATE_DIR / "last_run.json"
OVERDUE_MARKER = REPO_DIR / "BACKUP_OVERDUE.md"

# A directory the job wrote carries this file; retention prunes ONLY these, and
# the drill only ever restores one of these — never a foreign directory that
# happens to share the destination.
SAFETY_NET_MARKER = "SAFETY_NET.marker"

# The .env copied beside each dump. It is a CREDENTIAL, not data — see the
# accepted-risk note in safety_net_backup.py's docstring and OPEN_ITEMS.md.
ENV_COPY_SUBDIR = "env"

DEFAULT_CONTAINER = os.environ.get("RECYCLE_PG_CONTAINER", "recycle_pg")
DEFAULT_DB = "recycle"

# The interpreter the scheduled task will use. Absolute so the task needs no cwd.
VENV_PYTHON = SERVER_DIR / ".venv" / "Scripts" / "python.exe"

# ---------------------------------------------------------------------------
# exit codes — ONE scheme across the three scripts. A drive that is UNPLUGGED
# (3) is a different fact from a backup that is WRONG (1) or a destination that
# is unsafe by construction (4); the owner needs to tell them apart at 07:00,
# and addition (1) of the phase brief requires the drill to.
# ---------------------------------------------------------------------------
EXIT_OK = 0
EXIT_FAILED = 1          # a real defect: dump failed, checksum/rowcount/RLS wrong
EXIT_COULD_NOT_RUN = 2   # misconfigured / container down / no backup to verify
EXIT_UNAVAILABLE = 3     # destination not present — USB unplugged, or not a drive
EXIT_UNSAFE_DISK = 4     # destination shares a physical disk with a source


class Abort(Exception):
    """Raised to end a run with a specific exit code and a printed reason."""

    def __init__(self, code: int, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def now_utc() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def stamp(when: dt.datetime | None = None) -> str:
    return (when or now_utc()).strftime("%Y%m%dT%H%M%SZ")


# ---------------------------------------------------------------------------
# process helpers — bytes, never text=True. This box's locale is cp874
# (CLAUDE.md), so letting Python decode with the default corrupts Thai. Same
# discipline as backup_db.py.
# ---------------------------------------------------------------------------
def run(cmd: list[str]) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(cmd, capture_output=True)


def err_text(cp: subprocess.CompletedProcess[bytes]) -> str:
    return cp.stderr.decode("utf-8", errors="replace").strip()


def out_text(cp: subprocess.CompletedProcess[bytes]) -> str:
    # CRLF normalised on decode before any anchored parsing (CLAUDE.md footgun:
    # a child's CRLF defeats an anchored regex).
    return cp.stdout.decode("utf-8", errors="replace").replace("\r\n", "\n")


def powershell(one_line: str) -> tuple[int, str]:
    """Run ONE line of PowerShell, capture bytes, decode UTF-8.

    Kept to one ASCII line on purpose: a non-ASCII char in PowerShell source is
    a footgun on this box, and a multi-line arg is mangled (CLAUDE.md). The disk
    facts we read back (numbers, serials) are ASCII, so the decode is safe.
    """
    cp = run(["powershell", "-NoProfile", "-NonInteractive", "-Command", one_line])
    return cp.returncode, out_text(cp).strip()


def psql_scalar(container: str, db: str, sql: str) -> str | None:
    """One-line SQL as the container superuser, first column of first row.

    Read-only helper. One line because a multi-line shell argument is mangled
    here; UTF-8 pinned because the locale default is cp874 (CLAUDE.md).
    """
    if "\n" in sql:
        raise ValueError("SQL passed as an argument must be a single line")
    cp = run(["docker", "exec", "-e", "PGCLIENTENCODING=UTF8", container,
              "psql", "-U", "postgres", "-d", db, "-Atq", "-v", "ON_ERROR_STOP=1", "-c", sql])
    if cp.returncode != 0:
        raise Abort(EXIT_COULD_NOT_RUN, f"psql({db}) failed: {err_text(cp)}")
    rows = [ln for ln in out_text(cp).strip("\n").split("\n") if ln != ""]
    return rows[0] if rows else None


def container_status(container: str) -> str:
    """The container's `docker ps` status line, or '' if not running."""
    cp = run(["docker", "ps", "--filter", f"name=^{container}$", "--format", "{{.Status}}"])
    if cp.returncode != 0:
        raise Abort(EXIT_COULD_NOT_RUN, f"docker is not answering: {err_text(cp)}")
    return out_text(cp).strip()


# ---------------------------------------------------------------------------
# physical-disk detection — the whole point of S1: a copy on the same disk as
# the source is not a backup, and the SCRIPT is the thing that must know it.
# ---------------------------------------------------------------------------
def drive_letter_of(path: str | Path) -> str | None:
    """'E' from 'E:\\...'. None for a UNC path or anything with no drive letter —
    which is the 'cannot determine' case the caller must fail closed on."""
    p = str(Path(path))
    if len(p) >= 2 and p[1] == ":" and p[0].isalpha():
        return p[0].upper()
    return None


def disk_of_letter(letter: str) -> dict | None:
    """The PHYSICAL disk behind a drive letter: {number, serial, uniqueid, friendly}.

    Physical disk, not volume — two partitions on ONE disk are different volumes
    but share a failure domain, and that is exactly the trap ('I put the backup
    on D: but D: and C: are the same SSD'). st_dev / volume GUID cannot see it;
    the disk number can. Returns None when the letter maps to no simple
    partition (a network drive, a subst) — again the fail-closed case.
    """
    if not (isinstance(letter, str) and len(letter) == 1 and letter.isalpha()):
        return None
    # Plain concatenation, NOT an f-string: the PowerShell braces are literal and
    # an f-string's brace-doubling across several string fragments silently
    # unbalanced them once already (a `}}` in a non-f-string fragment stayed two
    # braces). The only interpolation is the single-letter drive, inserted here.
    cmd = (
        "$ErrorActionPreference='Stop'; "
        "try { $p = Get-Partition -DriveLetter " + letter + " -ErrorAction Stop; "
        "$d = $p | Get-Disk -ErrorAction Stop; "
        "Write-Output ('OK|'+$d.Number+'|'+[string]$d.SerialNumber+'|'"
        "+[string]$d.UniqueId+'|'+[string]$d.FriendlyName) } "
        "catch { Write-Output ('ERR|'+$_.Exception.Message) }"
    )
    code, out = powershell(cmd)
    if code != 0 or not out.startswith("OK|"):
        return None
    _, number, serial, uniqueid, friendly = (out.split("|", 4) + ["", "", "", ""])[:5]
    return {"number": number.strip(), "serial": serial.strip(),
            "uniqueid": uniqueid.strip(), "friendly": friendly.strip()}


def docker_data_disk() -> tuple[dict | None, str | None]:
    """Best-effort: the physical disk holding the Docker Desktop / WSL2 data.

    Measured location on this box: the data lives in a vhdx under
    %LOCALAPPDATA%\\Docker\\wsl (docker_data.vhdx), on C:. If the WSL2 backend is
    not in use, or the data-root has been relocated, this returns (None, None)
    and the caller WARNS rather than blocks — the mandatory repo-disk guard
    still holds. It is named best-effort in the report on purpose.
    """
    local = os.environ.get("LOCALAPPDATA")
    if not local:
        return None, None
    wsl_root = Path(local) / "Docker" / "wsl"
    if not wsl_root.is_dir():
        return None, None
    vhdxs = sorted(wsl_root.rglob("*.vhdx"), key=lambda p: p.stat().st_size, reverse=True)
    if not vhdxs:
        return None, None
    biggest = vhdxs[0]                       # docker_data.vhdx dwarfs the boot ext4
    letter = drive_letter_of(biggest)
    if letter is None:
        return None, str(biggest)
    return disk_of_letter(letter), str(biggest)


def classify_destination(dest: str | Path) -> tuple[str, str]:
    """Is the destination REACHABLE right now? Returns (status, detail).

    status is one of:
        'ok'          the drive is present (the folder itself may not exist yet)
        'unavailable' the drive letter is not present — USB unplugged, most likely
        'no_letter'   not a local drive-letter path (UNC / network) — undeterminable

    This is the addition-(1) split: 'unplugged' is a different event from
    'failing', and the caller reports them with different exit codes.
    """
    letter = drive_letter_of(dest)
    if letter is None:
        return "no_letter", f"{dest} is not a local drive-letter path"
    root = Path(f"{letter}:\\")
    if not root.exists():
        return "unavailable", f"drive {letter}: is not present (is the backup drive plugged in?)"
    return "ok", f"drive {letter}: is present"


def assert_destination_safe(dest: str | Path) -> list[str]:
    """The S1 gate. Raises Abort on any unsafe or undeterminable destination.

    Refuses if the destination shares a physical disk with a SOURCE — the repo
    disk (which holds server/.env and the existing E: backups; ALWAYS
    determinable, so this guard is mandatory) or the database's Docker/WSL2 disk
    (best-effort). A copy on the same disk survives neither a disk death nor the
    thing this subsystem is really for, losing the machine.

    Returns human notes to print (e.g. the disks compared, any best-effort miss).
    """
    status, detail = classify_destination(dest)
    if status == "no_letter":
        raise Abort(EXIT_UNAVAILABLE, f"cannot determine the destination's disk: {detail}. "
                    "A network/UNC destination is refused: this script cannot prove it is off "
                    "the source disk, so it fails closed.")
    if status == "unavailable":
        raise Abort(EXIT_UNAVAILABLE, detail)

    dest_letter = drive_letter_of(dest)
    dest_disk = disk_of_letter(dest_letter)  # type: ignore[arg-type]
    if dest_disk is None:
        raise Abort(EXIT_UNAVAILABLE, f"drive {dest_letter}: exists but its physical disk could "
                    "not be determined (a mapped/subst/network drive?). Refused, fail-closed.")

    repo_letter = drive_letter_of(REPO_DIR)
    repo_disk = disk_of_letter(repo_letter) if repo_letter else None
    if repo_disk is None:
        raise Abort(EXIT_COULD_NOT_RUN, f"could not determine the repository's own disk "
                    f"({REPO_DIR}); refusing rather than guessing the source.")

    db_disk, db_vhdx = docker_data_disk()

    notes: list[str] = []
    notes.append(f"destination {dest_letter}: -> physical disk {dest_disk['number']} "
                 f"({dest_disk['friendly'] or 'unknown'})")
    notes.append(f"repo/.env    {repo_letter}: -> physical disk {repo_disk['number']} "
                 f"({repo_disk['friendly'] or 'unknown'})")
    if db_disk is not None:
        notes.append(f"database     -> physical disk {db_disk['number']} "
                     f"({db_disk['friendly'] or 'unknown'}; {db_vhdx})")
    else:
        notes.append("database     -> physical disk UNDETERMINED (best-effort WSL2 lookup "
                     "found nothing); the repo-disk guard below still holds")

    forbidden: dict[str, str] = {repo_disk["number"]: "the repository, server/.env and the "
                                 "existing E: backups"}
    if db_disk is not None:
        forbidden.setdefault(db_disk["number"], "the live database (Docker/WSL2)")

    if dest_disk["number"] in forbidden:
        raise Abort(EXIT_UNSAFE_DISK,
                    f"destination is on physical disk {dest_disk['number']}, the SAME disk as "
                    f"{forbidden[dest_disk['number']]}. A copy on the same disk is not a backup. "
                    "Point the destination at a different physical drive.")

    if db_disk is None:
        notes.append("WARNING: the database's physical disk was not verified; confirm the "
                     "destination is not the OS/Docker drive.")
    return notes


# ---------------------------------------------------------------------------
# heartbeat / last-run — the local record the freshness alarm reads
# ---------------------------------------------------------------------------
def _write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False),
                    encoding="utf-8", newline="\n")


def read_heartbeat() -> dict | None:
    if not HEARTBEAT_PATH.is_file():
        return None
    try:
        return json.loads(HEARTBEAT_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None


def write_heartbeat(payload: dict) -> None:
    _write_json(HEARTBEAT_PATH, payload)


def write_last_run(payload: dict) -> None:
    _write_json(LAST_RUN_PATH, payload)


def safety_net_dirs(dest: Path) -> list[Path]:
    """Directories at the destination that THIS job created (marker present),
    newest first. Retention prunes only these; the drill restores only these."""
    if not dest.is_dir():
        return []
    dirs = [p for p in dest.iterdir() if p.is_dir() and (p / SAFETY_NET_MARKER).is_file()]
    return sorted(dirs, key=lambda p: p.name, reverse=True)
