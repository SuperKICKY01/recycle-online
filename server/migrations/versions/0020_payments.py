r"""payments, payment_allocations, branches.separate_cashier, the permission
payments.record: money leaving the shop is a row, and every shop has it.

Revision ID: 0020
Revises: 0019
Create Date: 2026-09-05

WHAT THIS IS
------------
STRUCTURE.md section 2 (approved by the owner 2026-09-03), built as unit 3 of
its section 12 -- the ledger and the degenerate path ONLY: no counter screen,
no PromptPay, no slip verification, no shifts. Two tables, one column, one
permission:

  payments             money leaving the shop: client-minted id (no default,
                       hard rule 3's shape, because a counter can be offline),
                       tenant + branch + seller, method, amount > 0, an
                       idempotency key unique per tenant, the two timestamps,
                       the payer, and the three void columns under the same
                       all-or-none CHECK a bill has. Voided, never deleted.
  payment_allocations  the many-to-many link with an amount on it: a payment
                       pays PART of a bill, SEVERAL bills, or NO bill (an
                       advance). PRIMARY KEY (tenant_id, payment_id, bill_id).
                       APPEND-ONLY at the grant level: the app role holds
                       SELECT + INSERT and nothing else. An allocation carries
                       no void of its own; it moves with its payment.
  branches.separate_cashier
                       the declared counter policy (section 1.2 puts counter
                       policies on the branch): boolean NOT NULL DEFAULT false.
                       OFF: POST /bills writes one cash payment and one
                       allocation inside the bill's own transaction. ON: the
                       cashier records it later. NO ROUTE WRITES IT in this
                       unit (PATCH /branches arrives with section 9's second
                       yard); the proof flips it by SQL on a scratch.
  permissions row      payments.record, granted at birth to owner and admin
                       (section 3.1: staff weighs, the cashier is a role a shop
                       creates). payments.void stays DEFERRED: no route voids a
                       payment in this unit.

A BILL'S PAID STATUS IS DERIVED AND STORED NOWHERE (invariant 3). Paid amount is
the sum of allocations from LIVE payments; status is unpaid / partial / paid by
comparison with total_amount. A stored status would be a second copy of a
derivable fact, which is the thing this codebase exists to refuse.

THE FOUR INVARIANTS, each a reconcile.py check (P1..P4) with named row output:
  P1  for every payment, sum(allocations) <= amount
  P2  for every bill, sum(allocations from live payments) <= total_amount
  P3  an allocation's payment and bill share tenant_id (the composite FKs carry
      it) and seller_id (the checker's)
  P4  no allocation from a LIVE payment created AFTER a bill's void references
      that voided bill

NOT AUDITED -- THE OWNER'S DECISION 1 OF 2026-09-05, and the brief that asked for
the trigger was WRONG. These are TRANSACTIONAL tables, the same species as
purchase_bills, which migration 0017 excludes from the audit trigger by design
(its docstring: the ledger carries its author ON the row and is append-only), and
reconcile.py's CANNOT_SEE prints that boundary. Attaching audit_capture here would
conscript POST /bills, which declares no actor (bills.py create_bill), and double
the audit rows per bill. The record is the row itself: paid_by, voided_by, the
void reason, and the grant that forbids an allocation from ever changing.

paid_by IS NULLABLE UNDER CHECK (paid_by IS NOT NULL OR recorded_by_migration) --
the owner's decision 2. Section 2 wrote it NOT NULL. On dev, 71 live bills
predate migration 0006 and carry no created_by, so their reconstructed payment
has no payer. A RECORD always names its payer; a RECONSTRUCTION may not. Inventing
one would put a made-up name beside real money
(lessons/fallback-default-is-a-wrong-number.md).

shift_id IS OMITTED (the owner's decision 3, the 0019 precedent: no column nothing
reads). It arrives with the shifts table and is recorded as owed in OPEN_ITEMS.md.
Section 2.3's line rewrite (rounding_adjustment) is the unit after this one.

THE DEV-ONLY BACKFILL, MARKED
-----------------------------
On this database, which D5 says is discarded, every LIVE bill with a positive
total gets one payment (method cash, amount = total_amount, paid_by =
created_by, the bill's own two timestamps, idempotency_key 'auto:<bill id>') and
one allocation for the whole total, both with recorded_by_migration = true so a
reader can tell a reconstruction from a record. A voided bill gets none (nothing
is owed on it and nothing was recorded as paid); a zero-total bill gets none
(ck_payments_amount forbids a zero payment; its derived status is paid, because
0 = 0). On production, which does not exist yet, the tables are born with the
model and the flag is always false.

THE AUTOMATIC PAIR'S IDEMPOTENCY KEY IS DETERMINISTIC ('auto:' || bill id) ON
PURPOSE: uq_payments_tenant_idem then refuses a second automatic payment for one
bill even if the code path that writes it were ever reached twice, and the
allocation's primary key refuses a second allocation from it. The replay path in
POST /bills returns before any write; this constraint is the structural backstop
behind that.

WHY FORCE IS LIFTED, AND WHERE THE ACTOR IS DECLARED
----------------------------------------------------
Migrations run as recycle_owner (NOBYPASSRLS). tenants, purchase_bills, roles and
role_permissions are FORCE ROW LEVEL SECURITY, so with no app.tenant_id set the
owner reads ZERO rows, silently (lessons/a-migration-reads-zero-under-force-rls.md).
FORCE is lifted on those four for the cross-tenant reads and restored afterwards;
recycle_app is not the owner and stays governed. payments and payment_allocations
are created WITHOUT RLS, backfilled, and only then given ENABLE+FORCE+policy --
0015/0018/0019's order.

role_permissions IS AUDITED (0019), so the grant INSERT fires audit_capture, which
refuses a write with no actor and writes an audit row whose tenant_id must match
the context (lessons/a-fail-closed-trigger-conscripts-every-writer-of-its-table.md,
the 0019 amendment). So the grants are written PER TENANT under SET LOCAL
app.tenant_id with the reserved system actor declared as system:migration_0020.
The payments backfill needs neither: nothing on these two tables fires a trigger.

THE MIGRATION MEASURES ITSELF
-----------------------------
Six read-backs, each a RuntimeError that rolls the whole migration back to 0019:
one payment per live positive bill; one allocation per payment; no live bill
whose allocations do not sum to its total; every backfilled row marked; the
catalogue at 14 rows; the grant count equal to 2 x tenants AND to the number of
owner+admin roles (every tenant is born with both, 0019's own read-back). Alembic
runs the whole upgrade in ONE transaction (server/migrations/env.py,
context.begin_transaction()), so a refusal anywhere leaves 0019 intact: no table,
no column, no catalogue row. The rollback was OBSERVED on a scratch, not argued
-- a role-less tenant staged before the upgrade refused at the grant read-back
with alembic_version still 0019 (PROJECT_STATUS.md, this unit's record).

DOWNGRADE REFUSES RATHER THAN DESTROYS (the 0015/0018/0019 precedent)
--------------------------------------------------------------------
Downgrade removes the grants and the catalogue row, drops the two tables and the
column. That is only safe where nothing has moved past the born-with state. It
REFUSES, naming each count, if ANY of four things is true: a payment that is a
RECORD (recorded_by_migration = false); a voided payment; a branch with
separate_cashier on; a payments.record grant on a role other than owner/admin.
Each is a shop's own money or its own declaration and none can be reconstructed.
A freshly-upgraded database satisfies none of them, so the down-then-up path is
provable on a scratch.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Reusable RLS predicate. The same expression 0001 uses on every tenant table,
# so the value an INSERT writes and the value the policy tests are one thing.
_TENANT_MATCH = "NULLIF(current_setting('app.tenant_id', true), '')::uuid"

# The permission this unit mints, restated by hand from app/permissions.py (a
# migration is not a library; the boot check holds the two equal). ASCII ONLY,
# no apostrophes, NO BRACES: embedded in SQL literals through f-strings.
_PERMISSION = "payments.record"
_PERMISSION_DESCRIPTION = (
    "record money leaving the shop and read the ledger: POST /payments, GET /payments"
)
_CATALOGUE_SIZE_AFTER = 14
_GRANTED_ROLES = ("owner", "admin")
_AUTO_KEY_PREFIX = "auto:"

_PAYMENTS_COMMENT = (
    "Money leaving the shop (STRUCTURE.md section 2, migration 0020). One row per "
    "payment, client-minted id with no default (a counter can be offline), "
    "idempotent per tenant on idempotency_key, VOIDED never deleted (no DELETE "
    "grant), NOT audited: a transactional table like purchase_bills, whose record "
    "is the row itself (paid_by, voided_by, void_reason). Every shop has this "
    "table; with branches.separate_cashier off, POST /bills writes one cash "
    "payment and one allocation per bill inside the bill transaction. "
    "recorded_by_migration = true marks a dev-only RECONSTRUCTION written by "
    "migration 0020, never a record. The paid status of a bill is DERIVED from "
    "payment_allocations and stored nowhere."
)
_ALLOCATIONS_COMMENT = (
    "The link between a payment and a bill, with the amount applied. Many-to-many: "
    "one payment across several bills, several payments across one bill, or a "
    "payment allocated to no bill (an advance). APPEND-ONLY at the grant level: "
    "the app role holds SELECT and INSERT only. An allocation carries no void of "
    "its own: a query treats the allocations of a voided payment as void, so the "
    "pair moves together. Invariants P1..P4 in scripts/reconcile.py. Migration 0020."
)
_SEPARATE_CASHIER_COMMENT = (
    "Declared counter policy (STRUCTURE.md 1.2, 1.6): whether the weigher and the "
    "cashier are different people. false (the born-with value): POST /bills writes "
    "the cash payment and its allocation itself, so a cash-only shop never sees the "
    "ledger. true: the cashier records the payment later from a screen and a bill "
    "may be unpaid. A switch selects WHO performs the transition and never whether "
    "it exists (invariant 1): turning it off leaves unpaid bills unpaid, turning it "
    "on leaves paid bills paid. No route writes this column in 0020."
)
_PAID_BY_COMMENT = (
    "The principal who recorded the payment. NULL ONLY on a reconstruction "
    "(recorded_by_migration = true) whose bill predates created_by (0006): a record "
    "always names its payer, a reconstruction may not, and inventing one would put a "
    "made-up name beside real money. CHECK ck_payments_paid_by."
)
_RECORDED_BY_MIGRATION_COMMENT = (
    "true: a dev-only reconstruction written by migration 0020 from a bill that "
    "existed before the ledger. false: a record written by the server at bill "
    "create (the automatic pair) or by POST /payments. Always false on production, "
    "whose tables were born with the model."
)


def upgrade() -> None:
    # Each statement issued separately: asyncpg's extended query protocol forbids
    # multiple commands in one prepared statement (convention from 0001/0019).
    bind = op.get_bind()

    # ------------------------------------------------------------ the tables
    # id uuid PRIMARY KEY with NO default (hard rule 3's shape) plus the composite
    # uq (tenant_id, id), ARCHITECTURE 4 point 1: the FK target for allocations.
    op.execute(
        """
        CREATE TABLE payments (
            id                     uuid           PRIMARY KEY,
            tenant_id              uuid           NOT NULL REFERENCES tenants (id),
            branch_id              uuid           NOT NULL,
            seller_id              uuid           NOT NULL,
            method                 text           NOT NULL,
            amount                 numeric(14, 2) NOT NULL,
            idempotency_key        text           NOT NULL,
            reference              text,
            device_created_at      timestamptz    NOT NULL,
            server_received_at     timestamptz    NOT NULL DEFAULT now(),
            paid_by                uuid,
            recorded_by_migration  boolean        NOT NULL DEFAULT false,
            voided_at              timestamptz,
            voided_by              uuid,
            void_reason            text,
            CONSTRAINT uq_payments_tenant_id   UNIQUE (tenant_id, id),
            CONSTRAINT uq_payments_tenant_idem UNIQUE (tenant_id, idempotency_key),
            CONSTRAINT fk_payments_branch
                FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id),
            CONSTRAINT fk_payments_seller
                FOREIGN KEY (tenant_id, seller_id) REFERENCES sellers (tenant_id, id),
            CONSTRAINT fk_payments_paid_by
                FOREIGN KEY (tenant_id, paid_by) REFERENCES users (tenant_id, id),
            CONSTRAINT fk_payments_voided_by
                FOREIGN KEY (tenant_id, voided_by) REFERENCES users (tenant_id, id),
            CONSTRAINT ck_payments_method
                CHECK (method IN ('cash', 'promptpay', 'transfer', 'write_off')),
            CONSTRAINT ck_payments_amount CHECK (amount > 0),
            CONSTRAINT ck_payments_reference_len
                CHECK (reference IS NULL OR char_length(reference) <= 200),
            CONSTRAINT ck_payments_paid_by
                CHECK (paid_by IS NOT NULL OR recorded_by_migration),
            CONSTRAINT ck_payments_void_consistency CHECK (
                (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL) OR
                (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL)
            )
        )
        """
    )
    op.execute(f"COMMENT ON TABLE  payments IS '{_PAYMENTS_COMMENT}'")
    op.execute(f"COMMENT ON COLUMN payments.paid_by IS '{_PAID_BY_COMMENT}'")
    op.execute(
        f"COMMENT ON COLUMN payments.recorded_by_migration IS '{_RECORDED_BY_MIGRATION_COMMENT}'"
    )
    op.execute(
        """
        CREATE TABLE payment_allocations (
            tenant_id  uuid           NOT NULL REFERENCES tenants (id),
            payment_id uuid           NOT NULL,
            bill_id    uuid           NOT NULL,
            amount     numeric(14, 2) NOT NULL,
            created_at timestamptz    NOT NULL DEFAULT now(),
            CONSTRAINT pk_payment_allocations PRIMARY KEY (tenant_id, payment_id, bill_id),
            CONSTRAINT fk_allocations_payment
                FOREIGN KEY (tenant_id, payment_id) REFERENCES payments (tenant_id, id),
            CONSTRAINT fk_allocations_bill
                FOREIGN KEY (tenant_id, bill_id) REFERENCES purchase_bills (tenant_id, id),
            CONSTRAINT ck_allocations_amount CHECK (amount > 0)
        )
        """
    )
    op.execute(f"COMMENT ON TABLE payment_allocations IS '{_ALLOCATIONS_COMMENT}'")
    # The derived read (paid amount per bill) runs on every bill read-back, and
    # the unpaid queue anti-joins on it; the primary key leads with payment_id,
    # so the bill lookup needs its own index.
    op.execute(
        "CREATE INDEX ix_allocations_tenant_bill ON payment_allocations (tenant_id, bill_id)"
    )
    op.execute(
        "CREATE INDEX ix_payments_tenant_received ON payments (tenant_id, server_received_at)"
    )

    # ------------------------------------------------- the policy column
    # DDL fires no row trigger, so the audited branches table needs no actor here.
    op.execute(
        "ALTER TABLE branches ADD COLUMN separate_cashier boolean NOT NULL DEFAULT false"
    )
    op.execute(f"COMMENT ON COLUMN branches.separate_cashier IS '{_SEPARATE_CASHIER_COMMENT}'")

    # ------------------------------------------------------ the backfill
    # FORCE lifted on the SOURCE tables ONLY, and ONLY for the owner (the app role
    # stays governed). payments / payment_allocations have no RLS yet, by design.
    op.execute("ALTER TABLE tenants          NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE purchase_bills   NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE roles            NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE role_permissions NO FORCE ROW LEVEL SECURITY")

    live_positive = bind.exec_driver_sql(
        "SELECT count(*) FROM purchase_bills WHERE voided_at IS NULL AND total_amount > 0"
    ).scalar()
    op.execute(
        f"""
        INSERT INTO payments (id, tenant_id, branch_id, seller_id, method, amount,
                              idempotency_key, device_created_at, server_received_at,
                              paid_by, recorded_by_migration)
        SELECT gen_random_uuid(), b.tenant_id, b.branch_id, b.seller_id, 'cash',
               b.total_amount, '{_AUTO_KEY_PREFIX}' || b.id::text,
               b.device_created_at, b.server_received_at, b.created_by, true
          FROM purchase_bills b
         WHERE b.voided_at IS NULL AND b.total_amount > 0
        """
    )
    payments_n = bind.exec_driver_sql("SELECT count(*) FROM payments").scalar()
    if payments_n != live_positive:
        raise RuntimeError(
            f"REFUSING 0020: {live_positive} live positive-total bill(s) but {payments_n}"
            " backfilled payment(s); the two must be equal. Nothing is committed."
        )
    op.execute(
        f"""
        INSERT INTO payment_allocations (tenant_id, payment_id, bill_id, amount, created_at)
        SELECT p.tenant_id, p.id, b.id, b.total_amount, b.server_received_at
          FROM payments p
          JOIN purchase_bills b
            ON b.tenant_id = p.tenant_id
           AND p.idempotency_key = '{_AUTO_KEY_PREFIX}' || b.id::text
         WHERE p.recorded_by_migration
        """
    )
    allocations_n = bind.exec_driver_sql("SELECT count(*) FROM payment_allocations").scalar()
    if allocations_n != payments_n:
        raise RuntimeError(
            f"REFUSING 0020: {payments_n} backfilled payment(s) but {allocations_n}"
            " allocation(s); the two must be equal. Nothing is committed."
        )
    # THE DISPROOF SECTION 12 NAMES, read here before anything is committed: a
    # live bill whose allocations do not sum to its total.
    unbalanced = bind.exec_driver_sql(
        """
        SELECT count(*)
          FROM purchase_bills b
          LEFT JOIN payment_allocations a ON a.bill_id = b.id
         WHERE b.voided_at IS NULL AND b.total_amount > 0
         GROUP BY b.id, b.total_amount
        HAVING coalesce(sum(a.amount), 0) <> b.total_amount
        """
    ).fetchall()
    if unbalanced:
        raise RuntimeError(
            f"REFUSING 0020: {len(unbalanced)} live bill(s) whose backfilled allocations"
            " do not sum to total_amount. Nothing is committed."
        )
    unmarked = bind.exec_driver_sql(
        "SELECT count(*) FROM payments WHERE NOT recorded_by_migration"
    ).scalar()
    if unmarked:
        raise RuntimeError(
            f"REFUSING 0020: {unmarked} backfilled payment(s) not marked"
            " recorded_by_migration. Nothing is committed."
        )

    # ------------------------------------------------------- the catalogue
    op.execute(
        f"INSERT INTO permissions (code, description)"
        f" VALUES ('{_PERMISSION}', '{_PERMISSION_DESCRIPTION}')"
    )
    n_perm = bind.exec_driver_sql("SELECT count(*) FROM permissions").scalar()
    if n_perm != _CATALOGUE_SIZE_AFTER:
        raise RuntimeError(
            f"REFUSING 0020: {n_perm} catalogue row(s) after the insert, expected"
            f" {_CATALOGUE_SIZE_AFTER}. Nothing is committed."
        )

    # ------------------------------------------- the born-with grants
    # THIS MIGRATION DECLARES ITSELF AS THE SYSTEM WRITER: role_permissions is
    # audited (0019) and audit_capture refuses a write with no actor. The audit
    # ROW carries tenant_id = app.tenant_id into a FORCE-RLS table, so the grant
    # runs PER TENANT under SET LOCAL app.tenant_id (0019's measured refusals).
    op.execute(
        "SELECT set_config('app.actor_id', '00000000-0000-0000-0000-000000000000', true)"
    )
    op.execute("SELECT set_config('app.actor_username', 'system:migration_0020', true)")
    tenant_ids = [
        str(r[0]) for r in bind.exec_driver_sql("SELECT id FROM tenants").fetchall()
    ]
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
            f"REFUSING 0020: {grants_n} {_PERMISSION} grant(s) over {granted_roles_n}"
            f" owner/admin role(s) across {len(tenant_ids)} tenant(s); expected"
            f" {expected_grants} of each (every tenant is born with both roles, 0019)."
            " Nothing is committed."
        )

    # Restore FORCE. reconcile.py S3 re-checks this; a forgotten line goes red.
    op.execute("ALTER TABLE tenants          FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE purchase_bills   FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE roles            FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY")

    # -------------------------------------------------------------------- RLS
    # Enabled AFTER the backfill that wrote these tables, exactly as 0015/0018/0019.
    for table in ("payments", "payment_allocations"):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING (tenant_id = {_TENANT_MATCH}) "
            f"WITH CHECK (tenant_id = {_TENANT_MATCH})"
        )

    # ----------------------------------------------------------------- grants
    # ALTER DEFAULT PRIVILEGES has already handed recycle_app arwd (0008/0012
    # measured this); the REVOKE is what narrows. A payment is VOIDED (an UPDATE
    # of the three void columns), never deleted. An allocation is APPENDED and
    # never changed: a wrong allocation is corrected by voiding its payment and
    # reissuing (hard rule 5 read across two tables).
    op.execute("GRANT SELECT, INSERT, UPDATE ON payments TO recycle_app")
    op.execute("REVOKE DELETE ON payments FROM recycle_app")
    op.execute("GRANT SELECT, INSERT ON payment_allocations TO recycle_app")
    op.execute("REVOKE UPDATE, DELETE ON payment_allocations FROM recycle_app")


def downgrade() -> None:
    bind = op.get_bind()
    if bind.exec_driver_sql("SELECT to_regclass('public.payments')").scalar() is None:
        return

    # LIFT FORCE FIRST, or the guard reads nothing and defeats itself (0015's
    # measured lesson). Owner-only; the app role stays governed.
    for t in ("tenants", "branches", "payments", "payment_allocations",
              "roles", "role_permissions"):
        op.execute(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")

    # The four refusal conditions, each a count the operator can read.
    records = bind.exec_driver_sql(
        "SELECT count(*) FROM payments WHERE NOT recorded_by_migration"
    ).scalar()
    voided = bind.exec_driver_sql(
        "SELECT count(*) FROM payments WHERE voided_at IS NOT NULL"
    ).scalar()
    switched = bind.exec_driver_sql(
        "SELECT count(*) FROM branches WHERE separate_cashier"
    ).scalar()
    granted_roles = ", ".join(f"'{c}'" for c in _GRANTED_ROLES)
    widened = bind.exec_driver_sql(
        f"SELECT count(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id"
        f" WHERE rp.permission = '{_PERMISSION}' AND r.code NOT IN ({granted_roles})"
    ).scalar()

    if records or voided or switched or widened:
        for t in ("tenants", "branches", "payments", "payment_allocations",
                  "roles", "role_permissions"):
            op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")
        raise RuntimeError(
            "REFUSING to downgrade 0020: the ledger has moved past the born-with state.\n"
            f"  payments that are RECORDS (not a reconstruction) : {records}\n"
            f"  voided payments                                 : {voided}\n"
            f"  branches with separate_cashier on               : {switched}\n"
            f"  payments.record grants beyond owner/admin       : {widened}\n"
            "\n"
            "WHY THAT IS NOT SAFE: this downgrade DROPS payments and"
            " payment_allocations. Every payment a person recorded, every void"
            " with its reason, every allocation of cash to a bill, and every"
            " counter policy a shop declared would be lost, and none of it can"
            " be reconstructed from the bills.\n"
            "\n"
            "REMEDY: only downgrade a database still in the born-with state."
            " If you genuinely mean to discard the ledger, export it first.\n"
        )

    # Reverse order of upgrade(). The grant DELETE is audited: declare the system
    # writer and run it per tenant, as upgrade did.
    op.execute(
        "SELECT set_config('app.actor_id', '00000000-0000-0000-0000-000000000000', true)"
    )
    op.execute("SELECT set_config('app.actor_username', 'system:migration_0020', true)")
    for r in bind.exec_driver_sql("SELECT id FROM tenants").fetchall():
        tid = str(r[0])
        op.execute(f"SELECT set_config('app.tenant_id', '{tid}', true)")
        op.execute(
            f"DELETE FROM role_permissions WHERE tenant_id = '{tid}'"
            f" AND permission = '{_PERMISSION}'"
        )
    op.execute("SELECT set_config('app.tenant_id', '', true)")
    op.execute(f"DELETE FROM permissions WHERE code = '{_PERMISSION}'")

    for t in ("tenants", "branches", "roles", "role_permissions"):
        op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")

    op.execute("DROP TABLE IF EXISTS payment_allocations")
    op.execute("DROP TABLE IF EXISTS payments")
    op.execute("ALTER TABLE branches DROP COLUMN IF EXISTS separate_cashier")
