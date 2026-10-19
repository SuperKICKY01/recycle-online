#!/usr/bin/env python
"""Reset a shop OWNER's password -- the provider-side recovery (ADVISOR-DECIDED 2026-10-17, 3a).

    OWNER_NEW_PASSWORD=<set in the environment, never typed on the command line>
    python scripts/reset_owner_password.py --database <db> --tenant-id <uuid> --username <owner>
                                                                     (from the server/ directory)

FOR US, THE PROVIDER, NOT FOR THE SHOP. Since 3a no one but the owner may change the owner's
password over the API: POST /users/{id}/password answers 403 `owner_password_owner_only` to
anyone else, admins included (server/app/users.py). That closes the takeover the red team found
on f3abf7b, and it also closes the shop's only way back for an owner who has forgotten the
password -- so the way back is this script, run by us after we have confirmed who is asking.

IT REFUSES (exit 2) unless BOTH identities are explicit: `--tenant-id` names the shop and
`--username` names the account, and that account must exist in that shop AND hold the `owner`
role. It is not a general password tool: an admin or staff account is reset by the shop's own
owner or admin over the API, never by us.

WHAT IT WRITES, in ONE transaction under the shop's tenant context, as the declared system actor
`system:reset_owner_password` -- so the 0017 audit trigger records the UPDATE on `users` with
that actor (the audit trail the brief requires):
  * the new argon2 hash and `token_version + 1` in ONE UPDATE (every session the old password
    minted ends, as the API's own password routes do);
  * a lockout-clear marker (login_guard.clear_lockout), because an owner who forgot a password
    has usually also locked the account by trying.

SAFETY, as provision_shop.py states it: the live database is refused unless
`--yes-this-is-the-live-database` is passed; no password, DSN or connection detail is printed on
any path; connection details come from server/.env, the new password from OWNER_NEW_PASSWORD.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
import uuid

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SERVER_DIR)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(SERVER_DIR, ".env"))

from sqlalchemy import text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

ACTOR = "system:reset_owner_password"


class Refused(RuntimeError):
    """The reset cannot honestly run with these arguments."""


async def run(args: argparse.Namespace) -> dict:
    live = make_url(os.environ["APP_DATABASE_URL"]).database
    if args.database == live and not args.yes_this_is_the_live_database:
        raise Refused(f"--database {args.database!r} is the LIVE database; pass"
                      " --yes-this-is-the-live-database if that is meant")
    if not args.tenant_id or not args.username:
        raise Refused("both --tenant-id and --username are required: the shop AND the owner"
                      " are named explicitly, never inferred")
    try:
        tenant = uuid.UUID(args.tenant_id)
    except ValueError:
        raise Refused(f"--tenant-id {args.tenant_id!r} is not a uuid") from None
    password = os.environ.get("OWNER_NEW_PASSWORD", "")
    # Rebound BEFORE the app is imported, so its engine can only see the named database.
    for key in ("APP_DATABASE_URL", "DIRECTORY_DATABASE_URL"):
        os.environ[key] = make_url(os.environ[key]).set(database=args.database).render_as_string(
            hide_password=False)
    from app import login_guard
    from app.db import SYSTEM_ACTOR_ID, engine, tenant_connection
    from app.permissions import OWNER_ROLE
    from app.security import hash_password
    from app.users import PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH

    if not (PASSWORD_MIN_LENGTH <= len(password) <= PASSWORD_MAX_LENGTH):
        raise Refused(f"OWNER_NEW_PASSWORD must be set, {PASSWORD_MIN_LENGTH} to"
                      f" {PASSWORD_MAX_LENGTH} characters (the API's own rule); it is never"
                      " taken from the command line")
    new_hash = await hash_password(password)
    try:
        async with tenant_connection(tenant, actor_id=SYSTEM_ACTOR_ID, actor_username=ACTOR) as conn:
            row = (await conn.execute(
                text("SELECT u.id, u.username, r.code AS role FROM users u"
                     " JOIN roles r ON r.id = u.role_id WHERE u.username = :u"),
                {"u": args.username})).mappings().first()
            if row is None:
                raise Refused(f"no user {args.username!r} in shop {tenant} (in {args.database!r})")
            if row["role"] != OWNER_ROLE:
                raise Refused(f"{args.username!r} holds the role {row['role']!r}, not"
                              f" {OWNER_ROLE!r}; only an owner is reset here")
            out = (await conn.execute(
                text("UPDATE users SET password_hash = :ph, token_version = token_version + 1"
                     " WHERE id = :id RETURNING id, username, token_version"),
                {"ph": new_hash, "id": row["id"]})).mappings().one()
            await login_guard.clear_lockout(conn, row["username"])
    finally:
        await engine.dispose()
    return {"user_id": str(out["id"]), "username": out["username"], "token_version": out["token_version"]}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Reset a shop owner's password (provider-side).")
    ap.add_argument("--database", required=True, help="the database NAME (never a URL)")
    ap.add_argument("--tenant-id", default="", help="the shop's tenant uuid (required)")
    ap.add_argument("--username", default="", help="the owner's username (required)")
    ap.add_argument("--yes-this-is-the-live-database", action="store_true")
    args = ap.parse_args(argv)
    try:
        done = asyncio.run(run(args))
    except Refused as exc:
        print(f"RESET_OWNER_PASSWORD REFUSED: {exc}")
        print("RESET_OWNER_PASSWORD_EXIT=2")
        return 2
    print(f"RESET_OWNER_PASSWORD done: user {done['username']} ({done['user_id']}) in {args.database};"
          f" token_version now {done['token_version']}; lockout cleared; audited as {ACTOR}")
    print("RESET_OWNER_PASSWORD_EXIT=0")
    return 0


if __name__ == "__main__":
    sys.exit(main())
