#!/usr/bin/env python
"""Provision ONE shop: a tenant, its first admin user, and its shop code.

    python scripts/provision_shop.py --database <db> --name "Shop Name" \
        --admin-username admin
    python scripts/provision_shop.py --database <db> --tenant-id <uuid>

FOR THE PERSON DOING THE INSTALLATION. NOT FOR THE APPLICATION, and the reason
is measured rather than stylistic: writing `directory.shop_codes` needs
`recycle_owner`, a role the API never connects as. Measured 2026-08-10 on
`recycle_restore_scratch`, all three in one execution against a row that existed:
the owner's INSERT succeeded; `recycle_app` was refused with
`permission denied for schema directory` -- it never reaches the relation at all;
and `recycle_directory` was refused with `permission denied for table shop_codes`
-- it reaches the relation and is stopped at the verb. Those are two different
facts and the API holds neither privilege, so no endpoint can do this work.

WHY A SCRIPT IS THE RIGHT SIZE OF ANSWER *FOR NOW*, and why that stops being
true later. `ROADMAP.md § The decisions the ordering forced` records the bar:
"A handover that leaves the owner running SQL for shop number two is a debt taken
on with money already received", and S2 separates "what must be complete before a
PILOT" from "what must be complete before the product is SOLD to a stranger".
This script is on the near side of that line. It removes the hand-run SQL
statement for the pilot's own shop; it does NOT remove the human, and a stranger
buying this product must not be handed it. The tool that closes that gap is a
later step and this is not it.

WHAT IT IS NOT. It does not satisfy P1.3's Criterion B, which needs a real shop
to have a real code in production -- a script that CAN issue one is not a shop
that HAS one. It does not satisfy P1.5 either: that step's DONE WHEN wants a
first admin AND a staff account, both signing in from a handset, and this creates
one admin and never touches a phone.

SAFETY, in one place so it can be checked in one place:
  * it refuses the live database unless told explicitly (see the guard in main);
  * it never prints a password, a DSN or a connection detail, on any path;
  * connection details come from configuration (.env), never from an argument,
    because every shell command on this box lands verbatim in .claude/hooks/*.log.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import re
import secrets
import sys
import uuid

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SERVER_DIR)

from dotenv import load_dotenv  # noqa: E402

# load_dotenv resolves .env from the CALLING FILE, not the cwd
# (lessons/config-defaults-must-fail-closed.md), so this finds server/.env
# whichever directory the installer runs from.
load_dotenv()

from sqlalchemy import text  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlalchemy.ext.asyncio import create_async_engine  # noqa: E402

# A collision on an eight-character code from a 31-character alphabet is a
# 1-in-852,891,037,441 event per attempt. FIVE in a row is not luck; it means
# the alphabet was misparsed, or the relation is not what this script thinks it
# is. The bound exists so that case ends in a sentence instead of a loop.
MAX_CODE_ATTEMPTS = 5


class ProvisionError(Exception):
    """A refusal the installer can act on.

    Raised instead of letting a driver exception reach the screen: a traceback
    is not an instruction, and an installer reading `UniqueViolationError` learns
    nothing about what to do next. main() catches this, prints it, and returns 1
    -- so the exit line still prints. `sys.exit()` from inside a helper would
    skip that line, and an ABSENT exit line is the failure mode this repository
    has already been bitten by twice.
    """


# ---------------------------------------------------------------------------
# The code's shape, derived from the database at runtime
# ---------------------------------------------------------------------------
def _expand_class(body: str) -> str:
    """`A-HJKMNP-Z2-9` -> the 31 characters it admits, in order, deduplicated."""
    out: list[str] = []
    i = 0
    while i < len(body):
        if i + 2 < len(body) and body[i + 1] == "-":
            lo, hi = body[i], body[i + 2]
            if ord(hi) < ord(lo):
                raise ProvisionError(
                    f"REFUSING: ck_shop_code contains the range {lo!r}-{hi!r},"
                    " which runs backwards. This script will not guess at what"
                    " was meant."
                )
            out.extend(chr(c) for c in range(ord(lo), ord(hi) + 1))
            i += 3
        else:
            out.append(body[i])
            i += 1
    return "".join(dict.fromkeys(out))


def code_shape_from_constraint(defn: str) -> tuple[str, int]:
    """Read the alphabet and the length OUT OF the CHECK constraint.

    NOTHING IS HARDCODED HERE AND NOTHING FALLS BACK, deliberately. If the
    constraint changes shape and this parser cannot follow it, the script must
    stop. A built-in default would do one of two things, both worse than
    stopping: mint codes the database rejects (loud, but only at INSERT time and
    only after a tenant already exists), or mint codes the database ACCEPTS
    while the rest of the system -- a printed slip, a client-side check, a
    support script -- expects a different shape. The second is silent and
    permanent, because a code lives on paper this system never sees again.
    """
    m = re.search(r"~\s*'([^']*)'", defn)
    if not m:
        raise ProvisionError(
            "REFUSING: no regex found in ck_shop_code.\n"
            f"  the catalogue gave: {defn}\n"
            "  This script derives the alphabet and the length from that\n"
            "  constraint and has no built-in default, on purpose. Fix the\n"
            "  parser or the constraint. Do NOT add a fallback."
        )
    pattern = m.group(1)
    shape = re.fullmatch(r"\^\[([^\]]+)\]\{(\d+)\}\$", pattern)
    if not shape:
        raise ProvisionError(
            "REFUSING: ck_shop_code's regex is not the anchored"
            " ^[...]{n}$ form this script knows how to satisfy.\n"
            f"  the catalogue gave: {pattern}\n"
            "  Same rule as above: no fallback. Teach the parser the new shape\n"
            "  deliberately, so that whoever changes the constraint also decides\n"
            "  what this script should generate."
        )
    alphabet = _expand_class(shape.group(1))
    length = int(shape.group(2))
    if len(alphabet) < 2 or length < 1:
        raise ProvisionError(
            f"REFUSING: ck_shop_code yields a {len(alphabet)}-character alphabet"
            f" and length {length}. That is not a keyspace; it is a constant."
        )
    return alphabet, length


def generate_code(alphabet: str, length: int) -> str:
    """`secrets`, never `random`.

    A shop code is an identifier an outsider types at an unauthenticated
    endpoint. A predictable sequence would let one issued code narrow the search
    for the next, which is precisely the enumeration the lookup's single refusal
    exists to frustrate.
    """
    return "".join(secrets.choice(alphabet) for _ in range(length))


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
async def run(args: argparse.Namespace) -> int:
    live_db = make_url(os.environ["APP_DATABASE_URL"]).database

    # THE LIVE GUARD. The live name is read from configuration rather than
    # hardcoded, because "recycle" is a deployment's choice and a hardcoded name
    # would silently stop guarding the day it changes. The explicit long flag is
    # this repository's existing shape for "yes, I mean the dangerous one"
    # (scripts/reset_clock_watermark.py uses the same form), so an installer who
    # has met one has met both.
    if args.database == live_db and not args.yes_this_is_the_live_database:
        raise ProvisionError(
            f"REFUSING: --database {args.database!r} is the LIVE database.\n"
            "  This writes a tenant, a user and a shop code that a real shop\n"
            "  will depend on, and a shop code is IMMUTABLE ONCE ISSUED -- it\n"
            "  goes onto printed slips this system never sees again.\n"
            "  If you mean it, pass --yes-this-is-the-live-database."
        )

    # ONE CONNECTION PER ROLE, AND THE SPLIT IS MEASURED RATHER THAN TIDY.
    # The app role reaches `tenants` and `users` and is refused at schema
    # `directory`; the owner reaches `directory.shop_codes` and is the only role
    # holding INSERT there. Neither can do the other's half.
    #
    # The APP half reuses the application's OWN primitive rather than reissuing
    # `set_config` by hand: `tenant_connection` is where the SET LOCAL
    # convention lives (server/app/db.py), and
    # lessons/a-checker-must-not-share-the-code-it-checks.md says never to
    # duplicate a convention -- a second copy is correct-by-luck until the day
    # the first one changes. Overriding APP_DATABASE_URL before importing it is
    # the same move scripts/prove_docno_clock.py makes, for the same reason.
    os.environ["APP_DATABASE_URL"] = (
        make_url(os.environ["APP_DATABASE_URL"])
        .set(database=args.database)
        .render_as_string(hide_password=False)
    )
    from app.db import constraint_name_of, tenant_connection  # noqa: E402
    from app.security import hash_password  # noqa: E402

    owner_engine = create_async_engine(
        make_url(os.environ["MIGRATION_DATABASE_URL"]).set(database=args.database)
    )

    try:
        # ---------------------------------------------------- the code's shape
        async with owner_engine.connect() as conn:
            defn = (
                await conn.execute(
                    text(
                        "SELECT pg_get_constraintdef(oid) FROM pg_constraint"
                        " WHERE conrelid = 'directory.shop_codes'::regclass"
                        "   AND conname = 'ck_shop_code'"
                    )
                )
            ).scalar_one_or_none()
        if defn is None:
            raise ProvisionError(
                "REFUSING: ck_shop_code does not exist on"
                f" directory.shop_codes in {args.database!r}."
                " Is migration 0009 applied there?"
            )
        alphabet, length = code_shape_from_constraint(defn)
        print(f"  constraint     : {defn}")
        print(f"  alphabet       : {len(alphabet)} characters, length {length}")

        # ------------------------------------------------- the tenant and user
        if args.tenant_id:
            tenant_id = uuid.UUID(args.tenant_id)
            # THE GUC IS SET FOR THIS READ, AND THE FIRST VERSION DID NOT SET IT.
            # `tenants` carries FORCE RLS with USING (id = app.tenant_id), so a
            # SELECT with no context returns ZERO ROWS -- for the OWNER too, not
            # just the app role. The first version read it on the owner engine
            # with no GUC, found nothing, and refused with "no tenant ... exists"
            # about a tenant that was sitting right there. That is a message
            # naming the wrong cause, and it is worse than a crash: an installer
            # who believes it goes and creates a SECOND shop for a shop that
            # already exists. Measured on the second run of this script, which is
            # the only reason it was found.
            async with tenant_connection(tenant_id) as conn:
                exists = (
                    await conn.execute(
                        text("SELECT name FROM public.tenants WHERE id = :t"),
                        {"t": tenant_id},
                    )
                ).scalar_one_or_none()
            if exists is None:
                raise ProvisionError(
                    f"REFUSING: no tenant {tenant_id} exists in"
                    f" {args.database!r}. Run without --tenant-id to create one."
                )
            print(f"  tenant         : {tenant_id} (existing, {exists!r})")
        else:
            if not args.name:
                raise ProvisionError(
                    "REFUSING: --name is required when creating a new shop."
                )
            admin_password = os.environ.get("PROVISION_ADMIN_PASSWORD", "")
            if not admin_password.strip():
                raise ProvisionError(
                    "REFUSING: PROVISION_ADMIN_PASSWORD is unset or empty.\n"
                    "  The first admin's password is read from the environment,\n"
                    "  never from an argument: every shell command on this box is\n"
                    "  logged verbatim, so a password on the command line is a\n"
                    "  password written to a file."
                )

            # THE SCRIPT CHOOSES THE UUID, AND THE COLUMN DEFAULT CANNOT BE USED.
            # MEASURED 2026-08-10: an INSERT omitting `id` and letting
            # gen_random_uuid() fire is REFUSED -- with the GUC set and with it
            # unset alike -- because the RLS policy's WITH CHECK compares the new
            # row's id against app.tenant_id, and no caller can set that GUC to a
            # value the database has not generated yet. So the id must exist
            # before the row does, and it is chosen here.
            tenant_id = uuid.uuid4()

            # ONE GUC, SET ONCE, FOR BOTH INSERTS. Measured: `tenants` compares
            # `id` and `users` compares `tenant_id`, both against the SAME
            # app.tenant_id, so naming the tenant once satisfies both and the two
            # rows land in one transaction. SET LOCAL, not session-level -- also
            # measured: a session-level value survives COMMIT and is inherited by
            # the next transaction on that connection, which is the leak
            # lessons/set-local-per-request.md exists to forbid.
            pw_hash = await hash_password(admin_password)
            async with tenant_connection(tenant_id) as conn:
                await conn.execute(
                    text(
                        "INSERT INTO public.tenants (id, name)"
                        " VALUES (:id, :name)"
                    ),
                    {"id": tenant_id, "name": args.name},
                )
                await conn.execute(
                    text(
                        "INSERT INTO public.users"
                        " (tenant_id, username, full_name, role, password_hash)"
                        " VALUES (:t, :u, :fn, 'admin', :ph)"
                    ),
                    {"t": tenant_id, "u": args.admin_username,
                     "fn": args.admin_full_name or args.admin_username,
                     "ph": pw_hash},
                )
            print(f"  tenant         : {tenant_id} (created, {args.name!r})")
            print(f"  admin user     : {args.admin_username} (created)")

        # ------------------------------------------------------- the shop code
        # ONE CODE PER SHOP IS THE DATABASE'S RULE, not this script's:
        # shop_codes' PRIMARY KEY is tenant_id. This check turns that rule into a
        # sentence BEFORE the insert; the IntegrityError arm below is the
        # backstop for the race, and both end in the same words.
        async with owner_engine.connect() as conn:
            existing = (
                await conn.execute(
                    text(
                        "SELECT code FROM directory.shop_codes"
                        " WHERE tenant_id = :t"
                    ),
                    {"t": tenant_id},
                )
            ).scalar_one_or_none()
        if existing is not None:
            raise ProvisionError(
                f"REFUSING: shop {tenant_id} already has a code.\n"
                "  A shop has exactly one code, and a code is immutable once\n"
                "  issued -- it is printed on slips this system will never see\n"
                "  again, so reissuing one is not a rename, it is two shops\n"
                "  sharing an identifier across time.\n"
                "  Nothing was written. If this shop has genuinely lost its\n"
                "  code, that is a decision for the owner, not a re-run."
            )

        code = ""
        for attempt in range(1, MAX_CODE_ATTEMPTS + 1):
            code = generate_code(alphabet, length)
            try:
                async with owner_engine.begin() as conn:
                    await conn.execute(
                        text(
                            "INSERT INTO directory.shop_codes (tenant_id, code)"
                            " VALUES (:t, :c)"
                        ),
                        {"t": tenant_id, "c": code},
                    )
                break
            except IntegrityError as exc:
                # BY IDENTITY, NEVER BY CATCHING EVERYTHING. constraint_name_of
                # is server/app/db.py's documented helper, written because
                # `exc.orig.constraint_name` is ABSENT on this stack and reading
                # it yields "" for every violation
                # (lessons/a-defaulted-getattr-is-a-silent-dead-branch.md).
                # A blanket `except` here would retry a permissions error, a
                # dropped connection, the tenant_id FOREIGN KEY and the PRIMARY
                # KEY -- turning each into a quiet loop that ends in the same
                # misleading "exhausted" message.
                name = constraint_name_of(exc)
                if name == "uq_shop_code":
                    print(f"  code collision : attempt {attempt} hit"
                          f" uq_shop_code, generating another")
                    continue
                if name == "shop_codes_pkey":
                    raise ProvisionError(
                        f"REFUSING: shop {tenant_id} already has a code"
                        " (detected at INSERT, so another process issued one"
                        " while this ran). Nothing was written by this run."
                    ) from exc
                raise
        else:
            raise ProvisionError(
                f"FAILED: {MAX_CODE_ATTEMPTS} generated codes in a row already"
                " existed.\n"
                f"  With a {len(alphabet)}-character alphabet at length"
                f" {length} that is not chance.\n"
                "  Likely the alphabet was parsed wrongly, or this relation is\n"
                "  far larger than expected. The tenant and its admin user were\n"
                "  created and are still there; only the code is missing. Do NOT\n"
                "  re-run blindly -- look at the constraint first, then re-run\n"
                "  with --tenant-id to give this shop its code."
            )

        print()
        print("  ===================================================")
        print(f"   SHOP CODE: {code}")
        print("  ===================================================")
        print("  Give this to the shop owner. THIS SCRIPT WILL NOT SHOW IT")
        print("  AGAIN -- re-running refuses, because a shop has one code and")
        print("  a code is immutable once issued. Read it out of the database")
        print("  if it is lost.")
        return 0
    finally:
        await owner_engine.dispose()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        description="Provision one shop: tenant, first admin, shop code.")
    ap.add_argument("--database", required=True,
                    help="database to provision into. Connection details come "
                         "from .env; only the NAME is an argument.")
    ap.add_argument("--name", default="",
                    help="the shop's name. Required unless --tenant-id.")
    ap.add_argument("--tenant-id", default="",
                    help="an EXISTING tenant to issue a code for. Skips "
                         "creating a tenant and a user.")
    ap.add_argument("--admin-username", default="admin")
    ap.add_argument("--admin-full-name", default="")
    ap.add_argument("--yes-this-is-the-live-database", action="store_true",
                    help="required to write to the database named in "
                         "APP_DATABASE_URL.")
    args = ap.parse_args(argv)

    print("=== provision_shop ===")
    print(f"  database       : {args.database}")
    try:
        return asyncio.run(run(args))
    except ProvisionError as exc:
        print()
        print(str(exc))
        return 1


if __name__ == "__main__":
    rc = main()
    print(f"PROVISION_EXIT={rc}")
    sys.exit(rc)
