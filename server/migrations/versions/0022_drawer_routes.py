r"""shifts.manage, the frozen close, born-with cash by any path, payments.channel_id,
and hard rule 5 moved from code to grant -- the SCHEMA half of the shifts unit's
commit 2 (the routes are app/shifts.py and app/channels.py).

Revision ID: 0022
Revises: 0021
Create Date: 2026-09-26

WHAT THIS IS
------------
Commit 2 of the SHIFTS AND CASH-DRAWER unit gives migration 0021's four tables their
routes. The routes need five schema objects the tree does not hold, and nothing else:

  shifts.manage          the FIFTEENTH catalogue code. Gates opening and closing a
                         shift and recording a cash movement. Granted at birth to the
                         owner and admin system roles of every tenant, exactly as 0020
                         minted payments.record. NOT staff: staff weighs, and a shop's
                         cashier is a role the shop creates (STRUCTURE.md 3.1).
  shifts_freeze_closed   a BEFORE UPDATE trigger on shifts that REFUSES any change to a
                         row whose OLD.closed_at is set, with ONE permitted transition:
                         variance_reason from NULL to a non-blank text, every other
                         column unchanged. THE BUSINESS RULE, stated so it survives: the
                         cashier's COUNT is frozen the moment it is submitted, and the
                         reason for a difference is written AFTER the cashier sees the
                         difference -- so a count can never be adjusted toward the
                         expected figure, but an explanation can always be added once.
                         A reason, once set, is frozen too. This closes the hole
                         OPEN_ITEMS.md recorded at 0021 ("nothing in the SCHEMA stops a
                         SECOND update rewriting counted_cash") by MECHANISM; until now
                         only the shifts audit trigger would have RECORDED such a rewrite.
                         The comparison is to_jsonb(NEW) - 'variance_reason' against the
                         same of OLD, so a column added to shifts later is frozen too
                         without editing this function (it fails closed, not open).
  branches_born_with_cash an AFTER INSERT trigger on branches that inserts the branch's
                         one active method='cash' row into branch_payment_methods. A
                         SCHEMA guarantee rather than server code because provisioning is
                         one path today and an add-branch route is a second tomorrow, and
                         a trigger cannot be forgotten by a new path. SECURITY INVOKER: it
                         writes as whoever inserted the branch, under that writer's own
                         tenant context and RLS WITH CHECK -- no privilege is lent. Every
                         writer of branches already declares an actor and a tenant
                         (branches is audited since 0018), so the audited
                         branch_payment_methods insert this fires inherits a valid context.
  payments.channel_id    uuid NULL, composite FK (tenant_id, channel_id) ->
                         shop_payment_channels (tenant_id, id), MATCH SIMPLE, no backfill.
                         Which of the SHOP's own accounts a transfer or PromptPay payment
                         left from -- the join key a bank-statement match needs. A cash
                         payment carries NULL. Nothing requires it.
  REVOKE DELETE          on purchase_bills, purchase_bill_items and doc_no_counters from
                         recycle_app. Hard rule 5 ("no hard deletes on transactions") was
                         true of every route and of nothing in the database (OPEN_ITEMS.md,
                         measured 2026-09-03 and again 2026-09-26: the app role held
                         DELETE,INSERT,SELECT,UPDATE on all three, from the ALTER DEFAULT
                         PRIVILEGES in db/init). Nothing in server/app deletes from them
                         (searched 2026-09-26 for DELETE FROM / .delete( / TRUNCATE; the
                         same search found the known proof-script deletes, the control).

ONE SUPPORTING CONSTRAINT THE FK FORCES: uq_shop_channels_tenant_id UNIQUE (tenant_id,
id). A composite FK needs a unique key on exactly its referenced columns, and 0021
created shop_payment_channels with only PRIMARY KEY (id) -- read out of pg_constraint on
dev 2026-09-26, beside shifts' uq_shifts_tenant_id as the control. id is already the
primary key, so the pair is unique by construction: the constraint adds no rule, only
the index the FK must point at (the ARCHITECTURE 4 point 1 shape every other FK target
here already has).

THE PRE-STATE OF THE DELETE GRANT IS RECORDED, NOT ASSUMED
----------------------------------------------------------
The downgrade must put back what was there. Where the app role held DELETE before 0022
is MEASURED here per table (has_table_privilege) and written into that table's COMMENT
as `pre0022_app_delete=held` or `=absent`; the downgrade reads the marker and restores
exactly that, then clears the comment. The three tables carried NO comment at 0021
(read on dev 2026-09-26), and the upgrade REFUSES if one appears, rather than overwrite
a comment it did not write: a record that destroys another record is not a record.

WHY FORCE IS LIFTED, AND WHERE THE ACTOR IS DECLARED
----------------------------------------------------
Migrations run as recycle_owner (NOBYPASSRLS) and tenants, roles, role_permissions,
branches and branch_payment_methods are FORCE ROW LEVEL SECURITY, so with no
app.tenant_id the owner reads ZERO rows (lessons/a-migration-reads-zero-under-force-
rls.md). FORCE is lifted on those for the cross-tenant reads and restored afterwards;
recycle_app is not the owner and stays governed throughout. role_permissions and
branch_payment_methods are AUDITED, so every write to them runs PER TENANT under
SET LOCAL app.tenant_id with the reserved system actor declared as
system:migration_0022 (the 0019 amendment of lessons/a-fail-closed-trigger-conscripts-
every-writer-of-its-table.md; 0020 is the same shape).

THE BORN-WITH BACKFILL: every branch at 0021 was given its cash row by 0021 itself, but
a branch created BETWEEN 0021 and this migration by server code had no path to one. The
upgrade gives each such branch its row before attaching the trigger, and then REFUSES
unless every branch holds a cash row -- so "every branch is born with cash" is exact from
0022 on, not only for branches created after it.

THE MIGRATION MEASURES ITSELF
-----------------------------
Read-backs inside the one transaction (env.py), each a RuntimeError that rolls the whole
upgrade back to 0021: the catalogue at 15 rows; shifts.manage grants equal to 2 x tenants
AND to the owner+admin role count; no branch without a cash row; both triggers present
in pg_trigger; the app role holding NO DELETE on any of the three bill tables.

DOWNGRADE REFUSES ONLY WHERE A LIVE ROW DEPENDS ON WHAT IT DROPS
----------------------------------------------------------------
It REFUSES, naming each count, if (1) a payment carries a non-null channel_id -- the
column and its record of which account the money left from would be destroyed; or (2)
shifts.manage is granted to a role other than owner/admin -- a shop's own declaration
the catalogue row's removal would destroy, 0020's precedent. It does NOT refuse on a
CLOSED SHIFT, and the reason is recorded here so the omission is not read as an
oversight: dropping the freeze trigger destroys no row -- every closed shift keeps its
frozen figures exactly -- it returns the database to 0021's state, in which the figures
were protected by prose and RECORDED by the shifts audit trigger (which 0022 does not
touch). That is a weaker guard, not lost data, and the downgrade target is by
definition the state before the guard existed. Likewise the born-with trigger's rows
stay: they are rows 0021 knows how to hold.
"""
import re
from typing import Sequence, Union

from alembic import op

revision: str = "0022"
down_revision: Union[str, None] = "0021"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Restated by hand from app/permissions.py (a migration is not a library; the boot
# check holds the two equal). ASCII ONLY, no apostrophes, NO BRACES: embedded in SQL
# literals through f-strings (0015..0021 convention).
_PERMISSION = "shifts.manage"
_PERMISSION_DESCRIPTION = (
    "open and close a cash-drawer shift and record a cash movement: POST /shifts,"
    " GET /shifts/current, POST /shifts/id/close, PATCH /shifts/id,"
    " POST /cash-movements, GET /cash-movements"
)
_CATALOGUE_SIZE_AFTER = 15
_GRANTED_ROLES = ("owner", "admin")
_SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000"
_ACTOR_NAME = "system:migration_0022"

_BILL_TABLES = ("purchase_bills", "purchase_bill_items", "doc_no_counters")
_MARKER_RE = re.compile(r"pre0022_app_delete=(held|absent)")

# The custom SQLSTATE the freeze trigger raises, so app/shifts.py can translate THIS
# refusal (and only this one) to a 409 without matching message text. Class RF is
# unused by Postgres.
_FROZEN_SQLSTATE = "RF001"

_PAYMENTS_CHANNEL_ID_COMMENT = (
    "Which of the SHOP own payment channels (shop_payment_channels) a transfer or "
    "PromptPay payment left from, migration 0022. NULLABLE and required by nothing: a "
    "cash payment carries NULL, and a payment already made is never refused for "
    "lacking one. Composite FK (tenant_id, channel_id), so a channel of another "
    "tenant is unrepresentable. The join key a bank-statement match needs."
)


def _bill_table_comment(state: str) -> str:
    return (
        "Hard rule 5 at the grant level (migration 0022): recycle_app holds NO DELETE "
        "here -- a wrong bill is voided and reissued, never deleted. "
        f"pre0022_app_delete={state} (read by the 0022 downgrade to restore exactly "
        "what was there)."
    )


def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------ measure BEFORE any write (preflight)
    pre_state: dict[str, str] = {}
    for t in _BILL_TABLES:
        comment = bind.exec_driver_sql(
            f"SELECT obj_description('public.{t}'::regclass, 'pg_class')"
        ).scalar()
        if comment is not None:
            raise RuntimeError(
                f"REFUSING 0022: public.{t} already carries a COMMENT, and 0022 records"
                " the pre-REVOKE DELETE state in that comment. It will not overwrite a"
                f" comment it did not write. Comment found: {comment[:200]!r}. Nothing"
                " is committed."
            )
        held = bind.exec_driver_sql(
            f"SELECT has_table_privilege('recycle_app', 'public.{t}', 'DELETE')"
        ).scalar()
        pre_state[t] = "held" if held else "absent"

    # ---------------------------------------------- lift FORCE for the owner's reads
    _lifted = ("tenants", "roles", "role_permissions", "branches", "branch_payment_methods")
    for t in _lifted:
        op.execute(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")

    # ------------------------------------------------------------ the catalogue row
    op.execute(
        f"INSERT INTO permissions (code, description)"
        f" VALUES ('{_PERMISSION}', '{_PERMISSION_DESCRIPTION}')"
    )
    n_perm = bind.exec_driver_sql("SELECT count(*) FROM permissions").scalar()
    if n_perm != _CATALOGUE_SIZE_AFTER:
        raise RuntimeError(
            f"REFUSING 0022: {n_perm} catalogue row(s) after the insert, expected"
            f" {_CATALOGUE_SIZE_AFTER}. Nothing is committed."
        )

    # --------------------- per tenant, as the declared system writer: grants + cash
    op.execute(f"SELECT set_config('app.actor_id', '{_SYSTEM_ACTOR}', true)")
    op.execute(f"SELECT set_config('app.actor_username', '{_ACTOR_NAME}', true)")
    tenant_ids = [str(r[0]) for r in bind.exec_driver_sql("SELECT id FROM tenants").fetchall()]
    granted_roles = ", ".join(f"'{c}'" for c in _GRANTED_ROLES)
    for tid in tenant_ids:
        op.execute(f"SELECT set_config('app.tenant_id', '{tid}', true)")
        op.execute(
            f"""
            INSERT INTO role_permissions (tenant_id, role_id, permission)
            SELECT r.tenant_id, r.id, '{_PERMISSION}'
              FROM roles r
             WHERE r.tenant_id = '{tid}' AND r.code IN ({granted_roles})
            """
        )
        # A branch created after 0021 by server code had no path to its cash row.
        op.execute(
            f"""
            INSERT INTO branch_payment_methods (tenant_id, branch_id, method, is_active)
            SELECT b.tenant_id, b.id, 'cash', true
              FROM branches b
             WHERE b.tenant_id = '{tid}'
               AND NOT EXISTS (SELECT 1 FROM branch_payment_methods m
                                WHERE m.tenant_id = b.tenant_id AND m.branch_id = b.id
                                  AND m.method = 'cash')
            """
        )
    op.execute("SELECT set_config('app.tenant_id', '', true)")

    grants_n = bind.exec_driver_sql(
        f"SELECT count(*) FROM role_permissions WHERE permission = '{_PERMISSION}'"
    ).scalar()
    granted_roles_n = bind.exec_driver_sql(
        f"SELECT count(*) FROM roles WHERE code IN ({granted_roles})"
    ).scalar()
    expected_grants = len(_GRANTED_ROLES) * len(tenant_ids)
    if grants_n != expected_grants or granted_roles_n != expected_grants:
        raise RuntimeError(
            f"REFUSING 0022: {grants_n} {_PERMISSION} grant(s) over {granted_roles_n}"
            f" owner/admin role(s) across {len(tenant_ids)} tenant(s); expected"
            f" {expected_grants} of each. Nothing is committed."
        )
    cashless = bind.exec_driver_sql(
        "SELECT count(*) FROM branches b WHERE NOT EXISTS (SELECT 1 FROM"
        " branch_payment_methods m WHERE m.tenant_id = b.tenant_id AND m.branch_id = b.id"
        " AND m.method = 'cash')"
    ).scalar()
    if cashless:
        raise RuntimeError(
            f"REFUSING 0022: {cashless} branch(es) hold no cash row after the backfill."
            " Nothing is committed."
        )

    for t in _lifted:
        op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")

    # ------------------------------------------------------- the frozen close
    # SECURITY INVOKER (the default) and search_path pinned: the function reads only
    # its OLD/NEW rows. The blank check keeps a whitespace "reason" from being the one
    # write the freeze permits.
    op.execute(
        f"""
        CREATE FUNCTION shifts_freeze_closed() RETURNS trigger
            LANGUAGE plpgsql
            SET search_path = pg_catalog
        AS $fn$
        BEGIN
            IF OLD.closed_at IS NULL THEN
                RETURN NEW;
            END IF;
            IF OLD.variance_reason IS NULL
               AND NEW.variance_reason IS NOT NULL
               AND btrim(NEW.variance_reason) <> ''
               AND (to_jsonb(NEW) - 'variance_reason') = (to_jsonb(OLD) - 'variance_reason')
            THEN
                RETURN NEW;
            END IF;
            RAISE EXCEPTION
                'shifts_frozen: shift % is closed; its row is frozen', OLD.id
              USING ERRCODE = '{_FROZEN_SQLSTATE}',
                    HINT = 'only variance_reason may be set, once, from NULL to a non-blank text';
        END
        $fn$
        """
    )
    op.execute(
        "CREATE TRIGGER shifts_freeze_closed BEFORE UPDATE ON shifts"
        " FOR EACH ROW EXECUTE FUNCTION shifts_freeze_closed()"
    )

    # ---------------------------------------------------- born with cash, any path
    op.execute(
        """
        CREATE FUNCTION branches_born_with_cash() RETURNS trigger
            LANGUAGE plpgsql
            SET search_path = pg_catalog
        AS $fn$
        BEGIN
            INSERT INTO public.branch_payment_methods (tenant_id, branch_id, method, is_active)
            VALUES (NEW.tenant_id, NEW.id, 'cash', true);
            RETURN NULL;
        END
        $fn$
        """
    )
    op.execute(
        "CREATE TRIGGER branches_born_with_cash AFTER INSERT ON branches"
        " FOR EACH ROW EXECUTE FUNCTION branches_born_with_cash()"
    )

    # ------------------------------------------------------ payments.channel_id
    op.execute(
        "ALTER TABLE shop_payment_channels"
        " ADD CONSTRAINT uq_shop_channels_tenant_id UNIQUE (tenant_id, id)"
    )
    op.execute("ALTER TABLE payments ADD COLUMN channel_id uuid")
    op.execute(
        "ALTER TABLE payments ADD CONSTRAINT fk_payments_channel"
        " FOREIGN KEY (tenant_id, channel_id)"
        " REFERENCES shop_payment_channels (tenant_id, id)"
    )
    op.execute(f"COMMENT ON COLUMN payments.channel_id IS '{_PAYMENTS_CHANNEL_ID_COMMENT}'")

    # ------------------------------------------------ hard rule 5 at the grant level
    for t in _BILL_TABLES:
        op.execute(f"REVOKE DELETE ON {t} FROM recycle_app")
        op.execute(f"COMMENT ON TABLE {t} IS '{_bill_table_comment(pre_state[t])}'")

    # ------------------------------------------------------------ read-backs
    for trig, table in (("shifts_freeze_closed", "shifts"),
                        ("branches_born_with_cash", "branches")):
        present = bind.exec_driver_sql(
            f"SELECT count(*) FROM pg_trigger WHERE tgname = '{trig}'"
            f" AND tgrelid = 'public.{table}'::regclass AND NOT tgisinternal"
        ).scalar()
        if present != 1:
            raise RuntimeError(f"REFUSING 0022: trigger {trig} on {table} not found. Nothing is committed.")
    still = [t for t in _BILL_TABLES if bind.exec_driver_sql(
        f"SELECT has_table_privilege('recycle_app', 'public.{t}', 'DELETE')").scalar()]
    if still:
        raise RuntimeError(
            f"REFUSING 0022: recycle_app still holds DELETE on {still} after the REVOKE"
            " (a grant through another role?). Nothing is committed."
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.exec_driver_sql(
        "SELECT count(*) FROM information_schema.columns"
        " WHERE table_name = 'payments' AND column_name = 'channel_id'"
    ).scalar() == 0:
        return

    _lifted = ("payments", "roles", "role_permissions", "tenants")
    for t in _lifted:
        op.execute(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")
    channelled = bind.exec_driver_sql(
        "SELECT count(*) FROM payments WHERE channel_id IS NOT NULL"
    ).scalar()
    granted_roles = ", ".join(f"'{c}'" for c in _GRANTED_ROLES)
    widened = bind.exec_driver_sql(
        f"SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id"
        f" WHERE rp.permission = '{_PERMISSION}' AND r.code NOT IN ({granted_roles})"
    ).scalar()
    if channelled or widened:
        for t in _lifted:
            op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")
        raise RuntimeError(
            "REFUSING to downgrade 0022: a live row depends on what it would drop.\n"
            f"  payments naming a shop payment channel      : {channelled}\n"
            f"  shifts.manage grants beyond owner/admin     : {widened}\n"
            "\n"
            "WHY THAT IS NOT SAFE: this downgrade DROPS payments.channel_id (the record of"
            " which of the shop's accounts each of those payments left from) and the"
            " shifts.manage catalogue row (every role a shop granted it to). Neither can"
            " be reconstructed.\n"
            "\n"
            "A CLOSED SHIFT IS NOT A REASON TO REFUSE: dropping the freeze trigger loses"
            " no row, and the shifts audit trigger (0021) still records any rewrite.\n"
        )

    # The grant DELETE is audited: declare the system writer and run it per tenant.
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
    for t in _lifted:
        op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")

    # Put back exactly the DELETE state the upgrade recorded, then clear its comment.
    for t in _BILL_TABLES:
        comment = bind.exec_driver_sql(
            f"SELECT obj_description('public.{t}'::regclass, 'pg_class')"
        ).scalar() or ""
        m = _MARKER_RE.search(comment)
        if m is None:
            raise RuntimeError(
                f"REFUSING to downgrade 0022: public.{t} carries no pre0022_app_delete"
                " marker, so the DELETE state before 0022 is unknown and will not be"
                " guessed. Nothing is committed."
            )
        if m.group(1) == "held":
            op.execute(f"GRANT DELETE ON {t} TO recycle_app")
        op.execute(f"COMMENT ON TABLE {t} IS NULL")

    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS fk_payments_channel")
    op.execute("ALTER TABLE payments DROP COLUMN IF EXISTS channel_id")
    op.execute(
        "ALTER TABLE shop_payment_channels DROP CONSTRAINT IF EXISTS uq_shop_channels_tenant_id"
    )
    op.execute("DROP TRIGGER IF EXISTS branches_born_with_cash ON branches")
    op.execute("DROP FUNCTION IF EXISTS branches_born_with_cash()")
    op.execute("DROP TRIGGER IF EXISTS shifts_freeze_closed ON shifts")
    op.execute("DROP FUNCTION IF EXISTS shifts_freeze_closed()")
