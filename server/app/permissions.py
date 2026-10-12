"""The permission catalogue: the SET is code, the ASSIGNMENT is data.

STRUCTURE.md section 3 (approved by the owner 2026-09-03), built as unit 1 of its
section 12. A permission is a gate at a code site. The set of permissions is the
closed enumeration below; which roles hold which permission, and which role each
user holds, is per-tenant data (migration 0019: `roles`, `role_permissions`,
`users.role_id`). The gate reads the row on every request (auth.get_principal)
and never a token claim.

THE CATALOGUE EQUALS THE CODE OR THE SERVER DOES NOT START (invariant 6).
`assert_catalogue` runs in main.lifespan before the first request, the slot the
clock guard already uses, and compares `SELECT code FROM permissions` as a SET
against this enumeration. Any difference -- a code here with no row, a row with no
code here, or no table at all because migration 0019 has not run -- is a
RuntimeError that fails uvicorn's startup. Fail closed, like JWT_SECRET
(lessons/config-defaults-must-fail-closed.md): a missing row would make every gate
on that permission refuse everyone (no role can hold it, the FK forbids it), and an
extra row would let data name a permission no code checks. Serving either is a
shop locked out or a rule nobody enforces, and the operator sees both sets in the
refusal instead of a 500 storm.

THE MIGRATION RESTATES THESE LITERALS BY HAND -- a migration is not a library and
must not import the application -- and the boot check is what holds the two copies
equal. That is duplicate arithmetic, not a duplicated convention
(lessons/a-checker-must-not-share-the-code-it-checks.md).

WHAT IS MINTED, AND WHAT IS DELIBERATELY NOT. Section 3.1 lists 23 codes; THIRTEEN
were minted by unit 1, the ones a route gates on in this tree (the owner's decision
2026-09-04: a permission nobody checks means nothing, and ten unchecked rows would
be ten meanings a later session must guess). One of the thirteen is the exception
and says so at its line: `roles.manage` gates no route yet. Unit 3 (the money
ledger, migration 0020) minted the FOURTEENTH, `payments.record`, the day
POST /payments and GET /payments gated on it. The shifts unit (migration 0022)
minted the FIFTEENTH, `shifts.manage`, the day the drawer routes gated on it.
Migration 0024 minted the SIXTEENTH, `sellers.read_personal`, the day the seller
responses gated their personal fields on it. The other seven are recorded in DEFERRED against the unit that will gate them, so nobody
re-invents a name later.

THE THREE SYSTEM ROLES every shop is born with are S9's owner/admin/staff, as rows
(SYSTEM_ROLE_GRANTS is what each holds at birth). A shop may create a fourth once
the role-management screen exists; that screen is NOT this unit and is filed as
owed. Until it exists no existing shop holds `roles.manage` at all -- the owner
seat of a shop provisioned before 0019 is empty by design, which is correct
because the surface that would need it does not exist (the owner's decision 1,
2026-09-04). A NEW shop's first user is `owner` (scripts/provision_shop.py).
"""
from __future__ import annotations

import uuid
from collections.abc import Mapping
from enum import StrEnum

from sqlalchemy import text
from sqlalchemy.exc import ProgrammingError

from .db import tenant_connection


class Permission(StrEnum):
    """The closed set. A gate takes a MEMBER, never a string, so a permission that
    is not in this enumeration is a type error at the call site, not a runtime
    miss (section 3.4's "what breaks it")."""

    BILLS_CREATE = "bills.create"
    BILLS_READ = "bills.read"
    BILLS_VOID = "bills.void"
    MONEY_VIEW_OWN = "money.view_own"
    MONEY_VIEW_SHOP = "money.view_shop"
    MASTER_WRITE = "master.write"
    PRICES_WRITE = "prices.write"
    SELLERS_CREATE = "sellers.create"
    SELLERS_WRITE = "sellers.write"
    TIERS_MANAGE = "tiers.manage"
    USERS_MANAGE = "users.manage"
    SHOP_SETTINGS_WRITE = "shop.settings.write"
    ROLES_MANAGE = "roles.manage"
    # Migration 0020 (STRUCTURE.md section 2, unit 3): money leaving the shop.
    # Owner and admin hold it at birth; staff does not (section 3.1's staff set:
    # the weigher weighs, and with separate_cashier off the SERVER writes the
    # payment inside POST /bills under bills.create, so a cash-only shop's staff
    # never needs this). The cashier is a role a shop creates.
    PAYMENTS_RECORD = "payments.record"
    # Migration 0022 (the shifts unit, commit 2): the cash drawer. Opening and
    # closing a shift and recording a cash movement. Owner and admin hold it at
    # birth; staff does not (staff weighs; a shop's cashier is a role it creates).
    # It gates WHO may act on the drawer, never whether a payment is accepted:
    # POST /payments and POST /bills stamp a shift and refuse nothing for a missing
    # one (STRUCTURE.md invariant 1).
    SHIFTS_MANAGE = "shifts.manage"
    # Migration 0024 (seller search, ADVISOR-DECIDED 2026-10-12): a seller's full
    # id_number and address are personal data. Not a ROUTE gate -- every seller route
    # still answers -- but an INLINE one in master._seller_payload: without it the two
    # keys are ABSENT, and PATCH refuses to write them. Granted by 0024 to
    # every role holding users.manage (owner and admin at birth); staff does not hold
    # it. ASSUMED pending P1.1/PDPA advice (OPEN_ITEMS.md).
    SELLERS_READ_PERSONAL = "sellers.read_personal"


# What each permission gates, by route. ASCII, because migration 0019 restates the
# same sentences into SQL COMMENT literals (its convention) and the two are read
# side by side.
DESCRIPTIONS: Mapping[Permission, str] = {
    Permission.BILLS_CREATE: "create a purchase bill: POST /bills",
    Permission.BILLS_READ: "read the shop's bills: GET /bills, GET /bills/{id}",
    Permission.BILLS_VOID: "void a bill: POST /bills/{id}/void",
    Permission.MONEY_VIEW_OWN: (
        "see money on the caller's OWN bills: GET /reports/summary scoped to"
        " created_by = self; money keys in GET /sellers/{id}/history"
        " (the former tenants.staff_money_visible, folded here by 0019)"
    ),
    Permission.MONEY_VIEW_SHOP: (
        "see the shop's money: GET /reports/daily, GET /reports/summary at any"
        " scope, money keys in GET /sellers/{id}/history"
    ),
    Permission.MASTER_WRITE: (
        "create, edit, retire and reactivate units, categories and products"
        " (12 routes under /uoms, /product-categories, /products)"
    ),
    Permission.PRICES_WRITE: "set a product's price per tier: PUT /products/{id}/prices/{grade}",
    Permission.SELLERS_CREATE: (
        "create a seller and reserve seller codes: POST /sellers,"
        " POST /seller-code-reservations"
    ),
    Permission.SELLERS_WRITE: (
        "edit, retire and reactivate a seller: PATCH /sellers/{id},"
        " POST /sellers/{id}/deactivate, POST /sellers/{id}/activate"
    ),
    Permission.TIERS_MANAGE: (
        "create, edit and reorder grade tiers: POST /grade-tiers,"
        " PATCH /grade-tiers/{id}, PUT /grade-tiers/order"
    ),
    Permission.USERS_MANAGE: (
        "the roster and every act on another account: GET /users, POST /users,"
        " revoke-sessions, deactivate, activate, unlock-login, password reset"
    ),
    Permission.SHOP_SETTINGS_WRITE: "write the shop's settings: PATCH /shop",
    # THE ONE CODE WITH NO ROUTE, and it is minted anyway, said out loud: it is the
    # only permission that separates the owner seat from the admin seat, and the
    # escalation guard on POST /users (users.create_user) is what makes that
    # separation enforceable today -- an admin cannot mint an owner because the
    # owner's set is not a subset of the admin's. The route that will gate on it
    # is the role-management screen (OPEN_ITEMS.md, owed).
    Permission.ROLES_MANAGE: (
        "create and edit a shop's own roles (the role-management screen, owed;"
        " no route gates on this yet)"
    ),
    Permission.PAYMENTS_RECORD: (
        "record money leaving the shop and read the ledger: POST /payments, GET /payments"
    ),
    Permission.SHIFTS_MANAGE: (
        "open and close a cash-drawer shift and record a cash movement: POST /shifts,"
        " GET /shifts/current, POST /shifts/id/close, PATCH /shifts/id,"
        " POST /cash-movements, GET /cash-movements"
    ),
    Permission.SELLERS_READ_PERSONAL: (
        "see a seller full id_number and address in every seller response: GET /sellers,"
        " POST /sellers, PATCH /sellers/id, POST /sellers/id/deactivate and /activate;"
        " without it those keys are absent and the caller may not write them"
    ),
}

# Section 3.1's codes NOT minted by unit 1, each against the unit that gates it.
# Recorded so a later unit reuses the name rather than inventing a neighbour.
DEFERRED: Mapping[str, str] = {
    "bills.read_all_users": "the per-user bill list, if a route for it is ever built",
    # payments.record left this map with migration 0020. payments.void stays: no
    # route voids a payment in unit 3 (the counter screen is the unit that does).
    "payments.void": "the counter unit, when POST /payments/{id}/void exists",
    # shifts.manage left this map with migration 0022 (the shifts unit, commit 2).
    # sellers.read_personal left this map with migration 0024 (seller search, C1).
    "audit.read": "the audit-log read route, when one exists (D3 wrote the log only)",
    "reports.export": "the export step (Excel is out of MVP today)",
    "files.read_personal": "batch C, files",
    "approvals.decide": "batch B, approvals above a threshold",
    "licence.manage": "section 6, licensing",
}

# The three roles every shop is born with (S9), by code. The code is the stable
# handle (a system role cannot change it; migration 0019's trigger refuses); the
# name is the shop's own text and starts equal to the code, as a tier's does.
OWNER_ROLE = "owner"
ADMIN_ROLE = "admin"
STAFF_ROLE = "staff"
SYSTEM_ROLE_CODES: tuple[str, ...] = (OWNER_ROLE, ADMIN_ROLE, STAFF_ROLE)

# What each system role holds AT BIRTH. Data thereafter: a shop may widen or narrow
# its own admin or staff role once the role screen exists. Owner holds everything;
# admin everything but roles.manage; staff exactly what today's gates gave staff
# (POST /bills, GET /bills, POST /sellers and the reservation top-up were the
# any-principal routes, now gated on these three). money.view_own is NOT here: the
# migration grants it to a tenant's staff role only where that tenant had
# staff_money_visible = true, and a new shop starts with money hidden from staff
# exactly as 0014's DEFAULT false did. payments.record (0020) rides the two
# frozenset(Permission) expressions below, so a shop provisioned after 0020 holds
# it on owner and admin with no edit here; 0020 granted it to every existing one.
SYSTEM_ROLE_GRANTS: Mapping[str, frozenset[Permission]] = {
    OWNER_ROLE: frozenset(Permission),
    ADMIN_ROLE: frozenset(Permission) - {Permission.ROLES_MANAGE},
    STAFF_ROLE: frozenset(
        {Permission.BILLS_CREATE, Permission.BILLS_READ, Permission.SELLERS_CREATE}
    ),
}


class CatalogueMismatch(RuntimeError):
    """The database's permission catalogue is not the code's enumeration."""


async def assert_catalogue() -> None:
    """Refuse to serve unless `permissions` holds exactly this enumeration.

    Read as the app role over tenant_connection(None): `permissions` is a global
    table with no RLS, granted SELECT to recycle_app by 0019, exactly the shape
    server_clock_watermark (0008) has and the clock guard reads in the same slot.
    A missing table (0019 not applied) is the same refusal with a different
    sentence -- never a 500 on the first request.
    """
    try:
        async with tenant_connection(None) as conn:
            rows = (await conn.execute(text("SELECT code FROM permissions"))).scalars().all()
    except ProgrammingError as exc:
        raise CatalogueMismatch(
            "REFUSING TO START: the permissions catalogue could not be read"
            f" ({type(exc.orig).__name__ if exc.orig else type(exc).__name__}).\n"
            "  Migration 0019 creates it. Run `alembic upgrade head` and start again.\n"
            "  Serving without it would answer 500 on every gated route, which a phone"
            " reads as `unavailable` and retries for ever."
        ) from exc
    have = set(rows)
    want = {p.value for p in Permission}
    if have != want:
        missing = sorted(want - have)
        extra = sorted(have - want)
        raise CatalogueMismatch(
            "REFUSING TO START: the permissions catalogue in the database does not"
            " equal the enumeration in app/permissions.py.\n"
            f"  in code but not in the table : {missing}\n"
            f"  in the table but not in code : {extra}\n"
            "  A code with no row means every gate on it refuses everyone (no role"
            " can hold it); a row with no code means data names a permission nothing"
            " checks. Neither is servable. Fix by a migration, never by hand."
        )


async def seed_system_roles(conn: object, tenant_id: uuid.UUID) -> dict[str, uuid.UUID]:
    """Write a NEW tenant's three system roles and their born-with grants.

    For provisioning and seeding (scripts/provision_shop.py, scripts/seed_dev.py,
    and the proofs that mint a tenant by SQL) -- the runtime never creates a role
    in this unit. `conn` is a tenant_connection with the tenant AND an actor set
    (roles and role_permissions are audited). Idempotent on (tenant_id, code) and on
    the grant's primary key, so a re-run adds nothing and never overwrites a grant
    a shop has since changed. Returns code -> role id.
    """
    ids: dict[str, uuid.UUID] = {}
    for code in SYSTEM_ROLE_CODES:
        await conn.execute(  # type: ignore[attr-defined]
            text(
                "INSERT INTO roles (tenant_id, code, name, is_system, is_active)"
                " VALUES (:t, :code, :code, true, true)"
                " ON CONFLICT (tenant_id, code) DO NOTHING"
            ),
            {"t": tenant_id, "code": code},
        )
        rid = (
            await conn.execute(  # type: ignore[attr-defined]
                text("SELECT id FROM roles WHERE tenant_id = :t AND code = :code"),
                {"t": tenant_id, "code": code},
            )
        ).scalar_one()
        ids[code] = rid
        for perm in sorted(SYSTEM_ROLE_GRANTS[code]):
            await conn.execute(  # type: ignore[attr-defined]
                text(
                    "INSERT INTO role_permissions (tenant_id, role_id, permission)"
                    " VALUES (:t, :r, :p) ON CONFLICT DO NOTHING"
                ),
                {"t": tenant_id, "r": rid, "p": perm.value},
            )
    return ids
