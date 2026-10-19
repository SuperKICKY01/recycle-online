"""Build or refresh the owner's demo database `recycle_demo` (called by start_demo.ps1).

    server\\.venv\\Scripts\\python.exe tools\\owner\\demo_db.py      (from the repo root)

ABSENT -> built from empty: CREATE DATABASE shaped like dev, `alembic upgrade head`,
          scripts/seed_dev.py (prove_shifts.build_empty_scratch, the walk databases' builder).
PRESENT -> refreshed in place: `alembic upgrade head`, then seed_dev.py (idempotent). Never
          dropped, so the shop code issued on the first build stays the same.
EITHER -> scripts/walk_fixture.py (37 products, 30 sellers, idempotent), then Shop A's shop
          code: read from the directory, or issued once by scripts/provision_shop.py.

Prints DEMO_SHOP_CODE=, DEMO_TENANT_ID= and DEMO_DB_EXIT=0 on success. Never prints a password
or a connection string; every URL is rebound in the environment, never passed as an argument.
REFUSES (exit 2) if server/.env names `recycle_demo` itself (that would make the demo dev).
"""
from __future__ import annotations

import asyncio
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SERVER_DIR = os.path.join(ROOT, "server")
sys.path.insert(0, SERVER_DIR)
sys.path.insert(0, os.path.join(SERVER_DIR, "scripts"))
os.chdir(SERVER_DIR)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(SERVER_DIR, ".env"))

import asyncpg  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

DEMO = "recycle_demo"
URL_KEYS = ("APP_DATABASE_URL", "DIRECTORY_DATABASE_URL", "MIGRATION_DATABASE_URL")


def say(line: str) -> None:
    sys.stdout.buffer.write((line + "\n").encode("utf-8", "backslashreplace"))
    sys.stdout.flush()


def fail(step: str, out: str) -> int:
    say(f"DEMO_DB_FAILED at {step}:")
    say(out[-1500:])
    say("DEMO_DB_EXIT=1")
    return 1


def demo_env() -> dict:
    env = dict(os.environ)
    for key in URL_KEYS:
        env[key] = make_url(os.environ[key]).set(database=DEMO).render_as_string(hide_password=False)
    env["PYTHONIOENCODING"] = "utf-8"
    env.pop("RECYCLE_LANE", None)
    return env


def own_env() -> dict:
    """server/.env's own URLs, for the two scripts that take `--database` and rebind THEMSELVES:
    each compares its target against APP_DATABASE_URL as "dev", so a rebound env would make the
    demo read as dev and be refused."""
    env = dict(os.environ)
    env["PYTHONIOENCODING"] = "utf-8"
    env.pop("RECYCLE_LANE", None)
    return env


def run(step: str, args: list[str], rebound: bool = True) -> tuple[int, str]:
    cp = subprocess.run([sys.executable, *args], cwd=SERVER_DIR, env=demo_env() if rebound else own_env(),
                        capture_output=True,
                        text=True, encoding="utf-8", errors="replace", timeout=900)
    out = cp.stdout + cp.stderr
    say(f"  {step:34s} exit={cp.returncode}")
    return cp.returncode, out


async def exists() -> bool:
    u = make_url(os.environ["APP_DATABASE_URL"])
    c = await asyncpg.connect(host=u.host, port=u.port, user="postgres", password="postgres", database="postgres")
    try:
        return await c.fetchval("SELECT 1 FROM pg_database WHERE datname = $1", DEMO) is not None
    finally:
        await c.close()


async def shop_code(tenant_id: str) -> str | None:
    u = make_url(os.environ["MIGRATION_DATABASE_URL"])
    c = await asyncpg.connect(host=u.host, port=u.port, user=u.username, password=u.password, database=DEMO)
    try:
        return await c.fetchval("SELECT code FROM directory.shop_codes WHERE tenant_id = $1::uuid", tenant_id)
    finally:
        await c.close()


def main() -> int:
    dev = make_url(os.environ["APP_DATABASE_URL"]).database
    if dev == DEMO:
        say(f"DEMO_DB_REFUSED: server/.env names {DEMO!r} as its own database; the demo must not be dev")
        say("DEMO_DB_EXIT=2")
        return 2
    from app.seeddata import TENANT_A_ID
    tenant = str(TENANT_A_ID)
    if not asyncio.run(exists()):
        say(f"  {DEMO} is absent: building it from empty (migrations at head + seed)")
        from prove_shifts import build_empty_scratch
        try:
            asyncio.run(build_empty_scratch(DEMO, "head"))
        except Exception as exc:  # noqa: BLE001 -- reported whole, then exit 1
            return fail("build from empty", str(exc))
        say(f"  {'build from empty':34s} exit=0")
    else:
        say(f"  {DEMO} exists: refreshing it in place (nothing is dropped)")
        rc, out = run("alembic upgrade head", ["-m", "alembic", "upgrade", "head"])
        if rc != 0:
            return fail("alembic upgrade head", out)
        rc, out = run("seed_dev.py", [os.path.join("scripts", "seed_dev.py")])
        if rc != 0:
            return fail("seed_dev.py", out)
    rc, out = run("walk_fixture.py", [os.path.join("scripts", "walk_fixture.py"), "--database", DEMO],
                  rebound=False)
    if rc != 0:
        return fail("walk_fixture.py", out)
    for line in out.splitlines():
        if line.startswith("  Shop A now holds"):
            say(line)
    code = asyncio.run(shop_code(tenant))
    if code is None:
        rc, out = run("provision_shop.py (shop code)",
                      [os.path.join("scripts", "provision_shop.py"), "--database", DEMO, "--tenant-id", tenant],
                      rebound=False)
        if rc != 0:
            return fail("provision_shop.py", out)
        code = asyncio.run(shop_code(tenant))
    if code is None:
        return fail("shop code", "no code in directory.shop_codes after provisioning")
    say(f"DEMO_SHOP_CODE={code}")
    say(f"DEMO_TENANT_ID={tenant}")
    say("DEMO_DB_EXIT=0")
    return 0


if __name__ == "__main__":
    sys.exit(main())
