"""Serve a fresh SCRATCH copy of the live database for a desktop proof, and say how to reach it.

    server/.venv/Scripts/python.exe scripts/scratch_server.py [--ttl SECONDS]   (from server/)

NOT A PROOF (its name does not start `prove_`, so tools/prove_all.py does not enumerate it). The
desktop's `npm run prove:*` scripts are node programs the gate runs without a server, and the
gate's own servers are handed only to the mobile proofs it names; so a desktop proof that must
talk to a REAL server starts this, reads one line, and kills it when done.

What it does, in order, and nothing to the live database but a READ (the dump):
  1. restores scratch_name("recycle_desktop_scratch") from a fresh dump of the live database;
  2. provisions ONE per-run user in seed Shop A on the ADMIN role, with a random password, by
     SQL as the declared system actor (users is audited) -- never a seeded account, so a proof's
     deliberate wrong password can never lock an account the other proofs use;
  3. reads Shop A's shop code from the directory;
  4. prints ONE line, `SCRATCH_SERVER=<json>` with base, shop_code, tenant_id, username,
     password -- a throwaway credential for a throwaway database, on stdout, never argv;
  5. serves uvicorn IN THIS PROCESS on 127.0.0.1:<free port> until killed, so killing this
     process stops the server (no orphaned child on Windows).
--ttl sets JWT_TTL_SECONDS for this server only (the expired-session cells use a short one).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import secrets
import shutil
import socket
import subprocess
import sys
import tempfile
import uuid

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SERVER_DIR)
sys.path.insert(0, os.path.join(SERVER_DIR, "scripts"))
os.chdir(SERVER_DIR)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(SERVER_DIR, ".env"))

from sqlalchemy.engine import make_url  # noqa: E402

from lane import scratch_name  # noqa: E402

SCRATCH = scratch_name("recycle_desktop_scratch")
ORIG_ENV = dict(os.environ)


def restore(live: str) -> None:
    run = uuid.uuid4().hex[:8]
    out = os.path.join(tempfile.gettempdir(), f"recycle-desktop-dump-{run}")
    label = f"desktop-{run}"
    cp = subprocess.run([sys.executable, os.path.join("scripts", "backup_db.py"), "--db", live, "--out", out,
                         "--label", label], capture_output=True, text=True, encoding="utf-8", errors="replace",
                        timeout=300, env=ORIG_ENV)
    if cp.returncode != 0:
        raise SystemExit(f"SCRATCH_SERVER_REFUSED backup_db.py: {(cp.stdout + cp.stderr)[-400:]}")
    dumps = [d for d in os.listdir(out) if d.endswith(label)]
    cp = subprocess.run([sys.executable, os.path.join("scripts", "restore_db.py"), os.path.join(out, dumps[0]),
                         "--into", SCRATCH], capture_output=True, text=True, encoding="utf-8", errors="replace",
                        timeout=300, env=ORIG_ENV)
    shutil.rmtree(out, ignore_errors=True)
    if cp.returncode != 0:
        raise SystemExit(f"SCRATCH_SERVER_REFUSED restore_db.py: {(cp.stdout + cp.stderr)[-400:]}")


async def provision() -> dict:
    from sqlalchemy import text

    from app.db import SYSTEM_ACTOR_ID, directory_connection, tenant_connection
    from app.security import hash_password
    from app.seeddata import TENANT_A_ID

    username = f"desk-{uuid.uuid4().hex[:8]}"
    password = secrets.token_urlsafe(12)
    async with tenant_connection(TENANT_A_ID, actor_id=SYSTEM_ACTOR_ID,
                                 actor_username="system:scratch_server") as conn:
        role_id = (await conn.execute(text("SELECT id FROM roles WHERE code = 'admin'"))).scalar_one()
        await conn.execute(
            text("INSERT INTO users (id, tenant_id, username, full_name, role_id, password_hash)"
                 " VALUES (:id, :t, :u, :fn, :r, :ph)"),
            {"id": uuid.uuid4(), "t": TENANT_A_ID, "u": username, "fn": "desktop proof",
             "r": role_id, "ph": await hash_password(password)})
    async with directory_connection() as conn:
        code = (await conn.execute(text("SELECT code FROM directory.shop_codes WHERE tenant_id = :t"),
                                   {"t": TENANT_A_ID})).scalar_one()
    # This loop ends when provision() returns, and uvicorn then serves from a NEW loop with the
    # same module-level engines: pooled asyncpg connections cannot cross loops, so drop them.
    from app.db import directory_engine, engine
    await engine.dispose()
    await directory_engine.dispose()
    return {"shop_code": code, "tenant_id": str(TENANT_A_ID), "username": username, "password": password}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--ttl", type=int, default=None)
    args = ap.parse_args()
    live = make_url(os.environ["APP_DATABASE_URL"]).database
    if SCRATCH == live:
        raise SystemExit("SCRATCH_SERVER_REFUSED the scratch name equals the live database")
    restore(live)
    for key in ("APP_DATABASE_URL", "DIRECTORY_DATABASE_URL", "MIGRATION_DATABASE_URL"):
        os.environ[key] = make_url(ORIG_ENV[key]).set(database=SCRATCH).render_as_string(hide_password=False)
    if args.ttl is not None:
        os.environ["JWT_TTL_SECONDS"] = str(args.ttl)
    info = asyncio.run(provision())
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        port = int(s.getsockname()[1])
    info["base"] = f"http://127.0.0.1:{port}"
    info["database"] = SCRATCH
    print("SCRATCH_SERVER=" + json.dumps(info), flush=True)
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=port, log_level="info", access_log=True)


if __name__ == "__main__":
    main()
