r"""sellers.read_personal: a seller's full ID number and address become personal data,
returned only to a caller holding this permission.

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-12

WHAT THIS IS
------------
The SCHEMA half of the seller-search milestone's C1 (ADVISOR-DECIDED 2026-10-12). Measured
before it on lane A's walk database (2026-10-12, head 0023), over real HTTP: GET /sellers
handed every signed-in caller -- the staff role included, whose grant set is bills.create,
bills.read and sellers.create -- the full 13-digit id_number and the address of every seller.
The phone never cached them (cached_sellers has no such columns), but they crossed the wire
to every yard phone.

  sellers.read_personal  the SIXTEENTH catalogue code, moved out of app/permissions.py
                         DEFERRED (where it was recorded against "batch C"). The server
                         gates on it INSIDE the seller routes (app/master.py
                         _seller_payload): a caller without it receives neither id_number
                         nor address -- the KEYS ARE ABSENT, the money-gate shape of
                         GET /sellers/{id}/history. A caller without it may not WRITE
                         them through PATCH either (an explicit null would erase an ID
                         the caller cannot see).
                         It refuses no route.

WHO HOLDS IT AT 0024, AND WHY BY PERMISSION RATHER THAN BY ROLE CODE
--------------------------------------------------------------------
The advisor's default: "the users who today hold users.manage (the shop's admins). Nobody
else gains it." So the grant goes to EVERY ROLE THAT HOLDS users.manage at upgrade time, in
every tenant -- the owner and admin system roles at birth (permissions.SYSTEM_ROLE_GRANTS),
plus any role a shop has granted users.manage to. Granting by role CODE ('owner','admin', the
0020/0022 shape) would be a different set the day a shop narrows its admin role or mints a
manager with users.manage; the permission is the advisor's criterion, so it is the query.
A NEW shop provisioned after 0024 receives it on owner and admin through SYSTEM_ROLE_GRANTS
(frozenset(Permission), minus roles.manage for admin), which is the same set by construction.

This is ASSUMED, pending P1.1 / PDPA advice (OPEN_ITEMS.md), and reversible: a narrower holder
set is a data change once the role screen exists; the downgrade restores 0023 exactly.

WHY FORCE IS LIFTED, AND WHERE THE ACTOR IS DECLARED
----------------------------------------------------
Migrations run as recycle_owner (NOBYPASSRLS); tenants, roles and role_permissions are FORCE
ROW LEVEL SECURITY, so with no app.tenant_id the owner reads ZERO rows
(lessons/a-migration-reads-zero-under-force-rls.md). FORCE is lifted on those three for the
cross-tenant reads and restored afterwards. role_permissions is AUDITED, so every write to it
runs PER TENANT under SET LOCAL app.tenant_id with the reserved system actor declared as
system:migration_0024 (the 0020/0022 shape).

THE MIGRATION MEASURES ITSELF
-----------------------------
Read-backs inside the one transaction, each a RuntimeError that rolls the whole upgrade back
to 0023: the catalogue at 16 rows; the sellers.read_personal grants EQUAL, as a set of role
ids, the roles holding users.manage -- in both directions, so a grant to a role without
users.manage and a users.manage role without the grant are both refusals.

DOWNGRADE REFUSES ONLY WHERE A LIVE ROW DEPENDS ON WHAT IT DROPS
----------------------------------------------------------------
It REFUSES, naming the count, if sellers.read_personal is granted to a role that does NOT hold
users.manage -- a shop's own declaration, which dropping the catalogue row would destroy and
nothing could reconstruct (0020/0022's precedent). Otherwise it deletes the grants per tenant
as the declared system writer, then the catalogue row. No seller row is touched in either
direction: the gate is in route code, and at 0023 that code does not exist.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0024"
down_revision: Union[str, None] = "0023"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Restated by hand from app/permissions.py (a migration is not a library; the boot check
# holds the two equal). ASCII ONLY, no apostrophes, NO BRACES: embedded in SQL literals
# through f-strings (0015..0023 convention).
_PERMISSION = "sellers.read_personal"
_PERMISSION_DESCRIPTION = (
    "see a seller full id_number and address in every seller response: GET /sellers,"
    " POST /sellers, PATCH /sellers/id, POST /sellers/id/deactivate and /activate;"
    " without it those keys are absent and the caller may not write them"
)
_HOLDER_PERMISSION = "users.manage"
_CATALOGUE_SIZE_BEFORE = 15
_CATALOGUE_SIZE_AFTER = 16
_SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000"
_ACTOR_NAME = "system:migration_0024"
_LIFTED = ("tenants", "roles", "role_permissions")


def _role_sets(bind) -> tuple[set[str], set[str]]:
    """(roles holding users.manage, roles holding sellers.read_personal), as role ids."""
    holders = {
        str(r[0]) for r in bind.exec_driver_sql(
            f"SELECT role_id FROM role_permissions WHERE permission = '{_HOLDER_PERMISSION}'"
        ).fetchall()
    }
    granted = {
        str(r[0]) for r in bind.exec_driver_sql(
            f"SELECT role_id FROM role_permissions WHERE permission = '{_PERMISSION}'"
        ).fetchall()
    }
    return holders, granted


def upgrade() -> None:
    bind = op.get_bind()

    n_before = bind.exec_driver_sql("SELECT count(*) FROM permissions").scalar()
    if n_before != _CATALOGUE_SIZE_BEFORE:
        raise RuntimeError(
            f"REFUSING 0024: {n_before} catalogue row(s) before the insert, expected"
            f" {_CATALOGUE_SIZE_BEFORE} (0023's catalogue). Nothing is committed."
        )

    for t in _LIFTED:
        op.execute(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")

    op.execute(
        f"INSERT INTO permissions (code, description)"
        f" VALUES ('{_PERMISSION}', '{_PERMISSION_DESCRIPTION}')"
    )
    n_perm = bind.exec_driver_sql("SELECT count(*) FROM permissions").scalar()
    if n_perm != _CATALOGUE_SIZE_AFTER:
        raise RuntimeError(
            f"REFUSING 0024: {n_perm} catalogue row(s) after the insert, expected"
            f" {_CATALOGUE_SIZE_AFTER}. Nothing is committed."
        )

    # Per tenant, as the declared system writer: role_permissions is audited.
    op.execute(f"SELECT set_config('app.actor_id', '{_SYSTEM_ACTOR}', true)")
    op.execute(f"SELECT set_config('app.actor_username', '{_ACTOR_NAME}', true)")
    tenant_ids = [str(r[0]) for r in bind.exec_driver_sql("SELECT id FROM tenants").fetchall()]
    for tid in tenant_ids:
        op.execute(f"SELECT set_config('app.tenant_id', '{tid}', true)")
        op.execute(
            f"""
            INSERT INTO role_permissions (tenant_id, role_id, permission)
            SELECT rp.tenant_id, rp.role_id, '{_PERMISSION}'
              FROM role_permissions rp
             WHERE rp.tenant_id = '{tid}' AND rp.permission = '{_HOLDER_PERMISSION}'
            """
        )
    op.execute("SELECT set_config('app.tenant_id', '', true)")

    holders, granted = _role_sets(bind)
    if granted != holders:
        raise RuntimeError(
            f"REFUSING 0024: {len(granted)} {_PERMISSION} grant(s), but {len(holders)} role(s)"
            f" hold {_HOLDER_PERMISSION}; granted-without-holder={len(granted - holders)},"
            f" holder-without-grant={len(holders - granted)}. Nothing is committed."
        )

    for t in _LIFTED:
        op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.exec_driver_sql(
        f"SELECT count(*) FROM permissions WHERE code = '{_PERMISSION}'"
    ).scalar() == 0:
        return

    for t in _LIFTED:
        op.execute(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")
    holders, granted = _role_sets(bind)
    widened = granted - holders
    if widened:
        for t in _LIFTED:
            op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")
        raise RuntimeError(
            "REFUSING to downgrade 0024: a live row depends on what it would drop.\n"
            f"  {_PERMISSION} grants to a role without {_HOLDER_PERMISSION} : {len(widened)}\n"
            "\n"
            f"WHY THAT IS NOT SAFE: this downgrade DROPS the {_PERMISSION} catalogue row and"
            " every grant of it. A grant to a role 0024 did not choose is a shop's own"
            " declaration, and nothing could reconstruct it.\n"
        )

    op.execute(f"SELECT set_config('app.actor_id', '{_SYSTEM_ACTOR}', true)")
    op.execute(f"SELECT set_config('app.actor_username', '{_ACTOR_NAME}', true)")
    for r in bind.exec_driver_sql("SELECT id FROM tenants").fetchall():
        tid = str(r[0])
        op.execute(f"SELECT set_config('app.tenant_id', '{tid}', true)")
        op.execute(
            f"DELETE FROM role_permissions WHERE tenant_id = '{tid}'"
            f" AND permission = '{_PERMISSION}'"
        )
    op.execute("SELECT set_config('app.tenant_id', '', true)")
    op.execute(f"DELETE FROM permissions WHERE code = '{_PERMISSION}'")
    for t in _LIFTED:
        op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")
