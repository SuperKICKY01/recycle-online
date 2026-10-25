"""Mint ONE per-run user in seed Shop A on a named SCRATCH database, and say how to sign in as it.

    server/.venv/Scripts/python.exe scripts/scratch_user.py --database <scratch> [--role owner]   (from server/)

NOT A PROOF (its name does not start `prove_`, so tools/prove_all.py does not enumerate it). Ruling R1
(2026-10-25) made the counter switches and the payment methods the OWNER's, and dev seeds no owner, while
the mobile live proofs sign in over HTTP only and an admin cannot create an owner (the escalation guard
on POST /users). So the gate calls this on the scratch it serves those proofs, and hands the credential
to them by ENVIRONMENT.

Refuses the live database by name. Writes ONE users row, by SQL as the declared system actor (users is
audited), with a random password -- never a seeded account, so nothing a proof does can lock an account
another proof uses. Prints one line, `SCRATCH_USER=<json>` with username and password: a throwaway
credential for a throwaway database, on stdout, never argv.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import secrets
import sys
import uuid

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SERVER_DIR)
os.chdir(SERVER_DIR)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(SERVER_DIR, ".env"))

from sqlalchemy.engine import make_url  # noqa: E402


async def mint(role: str) -> dict:
    from sqlalchemy import text

    from app.db import SYSTEM_ACTOR_ID, engine, tenant_connection
    from app.security import hash_password
    from app.seeddata import TENANT_A_ID

    username = f"gate-{role}-{uuid.uuid4().hex[:8]}"
    password = secrets.token_urlsafe(12)
    async with tenant_connection(TENANT_A_ID, actor_id=SYSTEM_ACTOR_ID,
                                 actor_username="system:scratch_user") as conn:
        role_id = (await conn.execute(text("SELECT id FROM roles WHERE code = :c"), {"c": role})).scalar_one()
        await conn.execute(
            text("INSERT INTO users (id, tenant_id, username, full_name, role_id, password_hash)"
                 " VALUES (:id, :t, :u, :fn, :r, :ph)"),
            {"id": uuid.uuid4(), "t": TENANT_A_ID, "u": username, "fn": f"gate {role}",
             "r": role_id, "ph": await hash_password(password)})
    await engine.dispose()
    return {"username": username, "password": password}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--database", required=True)
    ap.add_argument("--role", choices=("owner", "admin", "staff"), default="owner")
    args = ap.parse_args()
    live = make_url(os.environ["APP_DATABASE_URL"]).database
    if args.database == live:
        print(f"SCRATCH_USER_REFUSED the database {args.database!r} is the live database")
        return 2
    for key in ("APP_DATABASE_URL", "DIRECTORY_DATABASE_URL"):
        os.environ[key] = make_url(os.environ[key]).set(database=args.database).render_as_string(hide_password=False)
    print("SCRATCH_USER=" + json.dumps(asyncio.run(mint(args.role))), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
