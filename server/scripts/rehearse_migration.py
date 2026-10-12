"""Rehearse the head migration on a scratch copy of dev BEFORE it touches dev.

    uv run python scripts/rehearse_migration.py [--refuse-sql FILE]

Dumps the live (APP_DATABASE_URL) database, restores it into a lane scratch, then on the
scratch: upgrade head -> downgrade one step -> upgrade head, reading the revision after each
step and ASSERTING the sequence (red team on 36db720, finding 4 -- the first version printed the
revisions and asserted only that some line began with four digits):
    after the upgrade        the head
    after the downgrade      a different revision, not the head
    after the second upgrade the head again
--refuse-sql FILE: then, as a superuser on the scratch, run FILE (it must write the rows the head
migration's downgrade is meant to refuse to destroy), run `downgrade -1` again and REQUIRE it to
fail with a REFUSING line and the revision to stay at head -- the downgrade's refusal OBSERVED,
not inferred. Dev itself is only READ (the dump). Credentials stay in .env, never on a command line.
Prints REHEARSE_EXIT=0 only when every assertion held.
"""
from __future__ import annotations

import argparse
import asyncio
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


def revision(out: str) -> str:
    """alembic prints the revision ("0025 (head)") on stdout among INFO lines on stderr."""
    revs = [line.strip() for line in out.split("\n") if line.strip()[:4].isdigit()]
    return revs[-1] if revs else ""


async def superuser_sql(sql: str) -> None:
    import asyncpg
    u = make_url(os.environ["APP_DATABASE_URL"])
    c = await asyncpg.connect(host=u.host, port=u.port, user="postgres", password="postgres", database=SCRATCH)
    try:
        await c.execute(sql)
    finally:
        await c.close()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--refuse-sql", default=None)
    args = ap.parse_args()
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
    say(f"rehearsing on {SCRATCH} (dev, {live}, is only read)")
    failures: list[str] = []

    def step(label: str, cmd: list[str]) -> tuple[int, str]:
        rc, txt = run(alembic + cmd, env)
        say(f"{label:26s} exit={rc}")
        return rc, txt

    rc, txt = step("current (restored)", ["current"])
    restored = revision(txt)
    rc1, _ = step("upgrade head", ["upgrade", "head"])
    _, t = step("current", ["current"])
    after_up = revision(t)
    rc2, _ = step("downgrade -1", ["downgrade", "-1"])
    _, t = step("current", ["current"])
    after_down = revision(t)
    rc3, _ = step("upgrade head", ["upgrade", "head"])
    _, t = step("current", ["current"])
    after_up2 = revision(t)
    say(f"revisions: restored {restored!r} -> up {after_up!r} -> down {after_down!r} -> up {after_up2!r}")
    if rc1 or rc2 or rc3:
        failures.append("a step exited non-zero")
    if not after_up.endswith("(head)"):
        failures.append(f"after the upgrade the revision is {after_up!r}, not the head")
    if after_down == "" or after_down == after_up:
        failures.append(f"the downgrade did not move the revision ({after_down!r})")
    if after_up2 != after_up:
        failures.append(f"the second upgrade did not return to the head ({after_up2!r})")

    if args.refuse_sql is not None:
        with open(args.refuse_sql, encoding="utf-8") as f:
            asyncio.run(superuser_sql(f.read()))
        say(f"wrote the rows the downgrade must protect ({os.path.basename(args.refuse_sql)})")
        rc4, txt4 = step("downgrade -1 (must refuse)", ["downgrade", "-1"])
        _, t = step("current", ["current"])
        stayed = revision(t)
        refusing = [line.strip() for line in txt4.split("\n") if "REFUSING" in line]
        say(f"refusal: exit={rc4} {refusing[:1]} revision {stayed!r}")
        if rc4 == 0 or not refusing or stayed != after_up:
            failures.append(f"the downgrade did not refuse (exit {rc4}, REFUSING lines {len(refusing)}, revision {stayed!r})")

    for f in failures:
        say(f"FAILED: {f}")
    say(f"REHEARSE_EXIT={1 if failures else 0}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
