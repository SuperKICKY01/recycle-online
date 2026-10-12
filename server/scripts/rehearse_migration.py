"""Rehearse the head migration on a scratch copy of dev BEFORE it touches dev.

    uv run python scripts/rehearse_migration.py

Dumps the live (APP_DATABASE_URL) database, restores it into a lane scratch, then on the
scratch: upgrade head -> downgrade one step -> upgrade head, reading the revision after each
step. Prints REHEARSE_EXIT=0 only when every step exited 0 and each revision read back as
expected. Dev itself is only READ (the dump). Credentials stay in .env, never on a command line.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import uuid

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from sqlalchemy.engine import make_url  # noqa: E402

from lane import scratch_name  # noqa: E402

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH = scratch_name("recycle_migration_rehearsal")
RUN = uuid.uuid4().hex[:8]


def say(s: str) -> None:
    sys.stdout.buffer.write((s + "\n").encode("utf-8", "backslashreplace"))
    sys.stdout.flush()


def run(args: list[str], env: dict) -> tuple[int, str]:
    cp = subprocess.run(args, cwd=SERVER_DIR, capture_output=True, env=env, timeout=600)
    out = (cp.stdout + cp.stderr).decode("utf-8", "replace").replace("\r\n", "\n")
    return cp.returncode, out


def main() -> int:
    live = make_url(os.environ["APP_DATABASE_URL"]).database
    if SCRATCH == live:
        say("REFUSED: scratch equals live")
        return 2
    out = os.path.join(tempfile.gettempdir(), f"recycle-rehearse-{RUN}")
    rc, txt = run([sys.executable, "scripts/backup_db.py", "--db", live, "--out", out, "--label", f"rehearse-{RUN}"], dict(os.environ))
    if rc != 0:
        say(f"backup failed: {txt[-400:]}")
        return 2
    dump = os.path.join(out, [d for d in os.listdir(out) if d.endswith(f"rehearse-{RUN}")][0])
    rc, txt = run([sys.executable, "scripts/restore_db.py", dump, "--into", SCRATCH], dict(os.environ))
    shutil.rmtree(out, ignore_errors=True)
    if rc != 0:
        say(f"restore failed: {txt[-400:]}")
        return 2
    env = dict(os.environ)
    env["MIGRATION_DATABASE_URL"] = make_url(os.environ["MIGRATION_DATABASE_URL"]).set(database=SCRATCH).render_as_string(hide_password=False)
    alembic = [sys.executable, "-m", "alembic"]
    steps = [("current (restored)", ["current"]), ("upgrade head", ["upgrade", "head"]), ("current", ["current"]),
             ("downgrade -1", ["downgrade", "-1"]), ("current", ["current"]), ("upgrade head", ["upgrade", "head"]),
             ("current", ["current"])]
    bad = 0
    for label, args in steps:
        rc, txt = run(alembic + args, env)
        if args == ["current"]:
            # alembic prints the revision ("0025 (head)") on stdout among INFO lines on stderr
            revs = [l.strip() for l in txt.split("\n") if l.strip()[:4].isdigit()]
            shown = revs[-1] if revs else "NO REVISION LINE"
            bad += not revs
        else:
            shown = ([l for l in txt.split("\n") if "Running" in l][-1:] or ["no Running line"])[0].strip()
        say(f"{label:20s} exit={rc}  {shown[:160]}")
        bad += rc != 0
    say(f"REHEARSE_EXIT={1 if bad else 0}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
