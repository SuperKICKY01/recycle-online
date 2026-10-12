"""Seed DEV fixtures: two tenants, each with an admin AND a staff user (known
passwords) and master data (uom, category, product, seller). Runs as the app role
under tenant context (SET LOCAL), exactly like the runtime. Idempotent.

    python scripts/seed_dev.py      (from the server/ directory)
"""
from __future__ import annotations

import asyncio
import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

from app.db import SYSTEM_ACTOR_ID, engine, tenant_connection  # noqa: E402
from app.permissions import Permission, seed_system_roles  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.seeddata import SEED  # noqa: E402

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class SeedRefused(RuntimeError):
    """The seed cannot honestly run against this database."""


def _code_head() -> str:
    """The alembic head of THIS checkout's migrations, from alembic's own script directory."""
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    cfg = Config(os.path.join(SERVER_DIR, "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(SERVER_DIR, "migrations"))
    head = ScriptDirectory.from_config(cfg).get_current_head()
    if head is None:
        raise SeedRefused("the migrations directory has no single head")
    return head


async def _database_revision() -> str:
    """alembic_version of the database being seeded. Read through MIGRATION_DATABASE_URL,
    because alembic_version is REVOKEd from the app role -- and REFUSED unless that URL
    names the SAME database as APP_DATABASE_URL, or the seed would judge one database
    (say, a scratch) by another's revision (say, dev)."""
    from sqlalchemy.engine import make_url
    from sqlalchemy.ext.asyncio import create_async_engine
    app_url = make_url(os.environ["APP_DATABASE_URL"])
    mig_url = make_url(os.environ["MIGRATION_DATABASE_URL"])
    if app_url.database != mig_url.database:
        raise SeedRefused(
            f"APP_DATABASE_URL names {app_url.database!r} but MIGRATION_DATABASE_URL names"
            f" {mig_url.database!r}; the revision read would not be this database's")
    eng = create_async_engine(mig_url)
    try:
        async with eng.connect() as c:
            rev = (await c.execute(text("SELECT version_num FROM alembic_version"))).scalar()
    finally:
        await eng.dispose()
    if rev is None:
        raise SeedRefused("alembic_version is empty: this database was never migrated")
    return rev


async def grantable_codes() -> frozenset[str] | None:
    """WHICH PERMISSIONS THE SYSTEM ROLES MAY BE GRANTED HERE (ADVISOR-DECIDED 2026-10-12).

    The code's catalogue is the enumeration in app/permissions.py; the database's is the
    `permissions` table, which a migration fills. They are equal AT HEAD (assert_catalogue
    refuses to serve otherwise) and the code's is LARGER below head: a proof that builds
    an empty scratch at an older revision on purpose (prove_shifts' round trip builds at
    0022) seeds a database that predates every code minted since, and granting one of them
    is a foreign-key violation (role_permissions -> permissions), measured on the C1 gate
    of seller search: 'sellers.read_personal' at 0022.

    BELOW HEAD: grant the INTERSECTION, and PRINT the revision and every code skipped --
    never silently. AT HEAD: a code missing from the table is a broken database, not an
    old one, and it is an ERROR (SeedRefused, exit non-zero), exactly as before this
    function existed. Returns None at head (grant everything), else the intersection.
    """
    rev, head = await _database_revision(), _code_head()
    print(f"seed_dev: database alembic revision {rev}; this checkout's head {head}")
    async with tenant_connection(None) as conn:
        listed = set((await conn.execute(text("SELECT code FROM permissions"))).scalars().all())
    code = {p.value for p in Permission}
    missing = sorted(code - listed)
    if rev == head:
        if missing:
            raise SeedRefused(
                f"the database is AT head {head} but its permissions catalogue lacks {missing};"
                " that is a broken catalogue, not an old one, and nothing will be granted")
        return None
    for m in missing:
        print(f"seed_dev: below head -- NOT granting {m!r}: this database ({rev}) has no such"
              " catalogue row")
    if not missing:
        print("seed_dev: below head, but its catalogue holds every code -- nothing skipped")
    return frozenset(code & listed)


async def main() -> None:
    try:
        only = await grantable_codes()
        for s in SEED:
            user_hashes = [
                (u, await hash_password(u["password"])) for u in s["users"]
            ]
            # Every table seeded below is audited (0017), and dev seeding has no
            # human principal, so it declares itself as the system actor. See
            # db.SYSTEM_ACTOR_ID.
            async with tenant_connection(
                s["tenant_id"],
                actor_id=SYSTEM_ACTOR_ID,
                actor_username="system:seed_dev",
            ) as conn:
                await conn.execute(
                    text(
                        "INSERT INTO tenants (id, name) VALUES (:id, :name)"
                        " ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name"
                    ),
                    {"id": s["tenant_id"], "name": s["tenant_name"]},
                )
                # THE BORN-WITH BRANCH (migration 0018): every tenant has one,
                # code MAIN, name = the shop's own name, prefix B. Idempotent on
                # (tenant_id, code); a re-run never touches a branch a shop has
                # since renamed, and a tenant that predates 0018 already got its
                # row from the migration's backfill, so this is a no-op there.
                await conn.execute(
                    text(
                        "INSERT INTO branches (tenant_id, code, name, doc_prefix, is_active)"
                        " VALUES (:t, 'MAIN', :name, 'B', true)"
                        " ON CONFLICT (tenant_id, code) DO NOTHING"
                    ),
                    {"t": s["tenant_id"], "name": s["tenant_name"]},
                )
                # THE THREE SYSTEM ROLES (migration 0019), through the app's own
                # seeder: idempotent on (tenant_id, code) and on each grant, so a
                # re-run neither duplicates nor overwrites a grant edited since. A
                # tenant that predates 0019 already got its rows from the
                # migration's backfill, so this is a no-op there.
                roles = await seed_system_roles(conn, s["tenant_id"], only=only)
                for u, pw_hash in user_hashes:
                    await conn.execute(
                        text(
                            "INSERT INTO users (tenant_id, username, full_name, role_id,"
                            " password_hash) VALUES (:t, :u, :fn, :role_id, :ph)"
                            " ON CONFLICT (tenant_id, username)"
                            " DO UPDATE SET password_hash = EXCLUDED.password_hash,"
                            "               full_name = EXCLUDED.full_name,"
                            # role_id is re-asserted on conflict on purpose. Without
                            # it, re-running the seed would leave a role edited in
                            # the database in place while claiming to have seeded
                            # a known fixture — and the gate would then be proven
                            # against whatever happened to be there.
                            "               role_id = EXCLUDED.role_id"
                        ),
                        {"t": s["tenant_id"], "u": u["username"], "fn": u["full_name"],
                         "role_id": roles[u["role"]], "ph": pw_hash},
                    )
                await conn.execute(
                    text(
                        "INSERT INTO uoms (id, tenant_id, code, name)"
                        " VALUES (:id, :t, 'KG', 'Kilogram') ON CONFLICT (id) DO NOTHING"
                    ),
                    {"id": s["uom_id"], "t": s["tenant_id"]},
                )
                await conn.execute(
                    text(
                        "INSERT INTO product_categories (id, tenant_id, code, name)"
                        " VALUES (:id, :t, 'FERROUS', 'Ferrous metal') ON CONFLICT (id) DO NOTHING"
                    ),
                    {"id": s["category_id"], "t": s["tenant_id"]},
                )
                # grade_tiers FIRST: product_prices.grade and sellers.grade carry
                # composite FKs to grade_tiers since migration 0015, so a tier must
                # exist before a graded row references it (same transaction, so the
                # FK sees it). One tier per distinct grade this tenant uses,
                # code=name=grade, 0-based alphabetical -- the rule 0015's backfill
                # applies. Idempotent via ON CONFLICT (tenant_id, code) DO NOTHING.
                grades = sorted(
                    {g for p in s["products"] for g in p["prices"]}
                    | {sl["grade"] for sl in s["sellers"] if sl["grade"]}
                )
                for i, g in enumerate(grades):
                    await conn.execute(
                        text(
                            "INSERT INTO grade_tiers"
                            " (tenant_id, code, name, sort_order, is_active)"
                            " VALUES (:t, :code, :name, :so, true)"
                            " ON CONFLICT (tenant_id, code) DO NOTHING"
                        ),
                        {"t": s["tenant_id"], "code": g, "name": g, "so": i},
                    )
                for p in s["products"]:
                    await conn.execute(
                        text(
                            "INSERT INTO products (id, tenant_id, category_id, uom_id,"
                            " code, name, is_active)"
                            " VALUES (:id, :t, :c, :u, :code, :name, true)"
                            " ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code,"
                            "                                name = EXCLUDED.name,"
                            "                                is_active = true"
                        ),
                        {"id": p["id"], "t": s["tenant_id"], "c": s["category_id"],
                         "u": s["uom_id"], "code": p["code"], "name": p["name"]},
                    )
                    for grade, price in p["prices"].items():
                        await conn.execute(
                            text(
                                "INSERT INTO product_prices (tenant_id, product_id, grade, price)"
                                " VALUES (:t, :p, :g, :price)"
                                " ON CONFLICT (tenant_id, product_id, grade)"
                                " DO UPDATE SET price = EXCLUDED.price"
                            ),
                            # Decimal, never float: price is NUMERIC(14,2).
                            {"t": s["tenant_id"], "p": p["id"], "g": grade,
                             "price": Decimal(price)},
                        )
                for sl in s["sellers"]:
                    await conn.execute(
                        text(
                            "INSERT INTO sellers (id, tenant_id, code, name, phone, grade,"
                            " id_number, address, vehicle_no, is_active)"
                            " VALUES (:id, :t, :code, :nm, :ph, :g, :idn, :addr, :veh, true)"
                            " ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code,"
                            "                                name = EXCLUDED.name,"
                            "                                phone = EXCLUDED.phone,"
                            "                                grade = EXCLUDED.grade,"
                            "                                id_number = EXCLUDED.id_number,"
                            "                                address = EXCLUDED.address,"
                            "                                vehicle_no = EXCLUDED.vehicle_no,"
                            # Re-asserted for the same reason as role: a seller a
                            # proof retired and failed to restore would otherwise
                            # stay invisible, and the next run would measure that
                            # instead of the fixture.
                            "                                is_active = true"
                        ),
                        {"id": sl["id"], "t": s["tenant_id"], "code": sl["code"],
                         "nm": sl["name"], "ph": sl["phone"], "g": sl["grade"],
                         "idn": sl.get("id_number"), "addr": sl.get("address"),
                         "veh": sl.get("vehicle_no")},
                    )
            grades = ", ".join(str(sl["grade"] or "no grade") for sl in s["sellers"])
            users = ", ".join(f"{u['username']}={u['role']}" for u in s["users"])
            print(
                f"seeded tenant {s['tenant_id']}: users ({users}), uom/category,"
                f" {len(s['products'])} products with A-D price tiers,"
                f" {len(s['sellers'])} sellers (grades: {grades})"
            )
    finally:
        await engine.dispose()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except SeedRefused as exc:
        print(f"seed_dev: REFUSED: {exc}")
        sys.exit(1)
