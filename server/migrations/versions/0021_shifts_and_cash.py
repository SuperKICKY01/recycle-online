r"""shifts, cash_movements, branch_payment_methods, shop_payment_channels,
branches.shifts_enabled, payments.shift_id: the drawer, the shift it belongs to,
the methods a branch accepts, and the shop's own payment channels -- SCHEMA ONLY.

Revision ID: 0021
Revises: 0020
Create Date: 2026-09-12

WHAT THIS IS
------------
STRUCTURE.md section 2.4 (the drawer, shifts, expenses) and section 1.6 (the
switch inventory), built as commit 1 of the SHIFTS AND CASH-DRAWER unit -- the
SCHEMA and NOTHING ELSE. NO route, NO handler, NO screen, NO client code. Every
object below is either read by a future route (commit 2) or refuses a shape the
schema must not hold. Four tables, two columns:

  shifts                 a cash-drawer session: opened_at/opened_by/opening_float,
                         and a close (closed_at/closed_by/counted_cash/expected_cash/
                         variance) that is ALL NULL or ALL PRESENT. AT MOST ONE OPEN
                         shift per branch, enforced by a partial unique index in the
                         SCHEMA, not by a route (two open drawers on one branch makes
                         every derived drawer figure meaningless). expected_cash is
                         FROZEN at close by the server (hard rule 6); NOTHING computes
                         or writes it in this commit.
  cash_movements         money moving in the drawer that is not a payment: an expense,
                         a float in/out, a deposit to the bank. The same immutability
                         and idempotency as payments (section 2.4): amount > 0, one
                         idempotency key per tenant, VOIDED never deleted under the
                         payments void-consistency shape. receipt_file_id is NULLABLE
                         and carries NO FK -- files is batch C, and the FK arrives with
                         it; a dangling reference would be worse than none.
  branch_payment_methods which payment methods a branch accepts (section 1.6, a DERIVED
                         switch: the control is shown when the set has more than the one
                         cash row). PRIMARY KEY (tenant_id, branch_id, method); method is
                         CHECKed against the SAME fixed set as payments.method, and the
                         upgrade REFUSES if the two sets ever differ (a branch accepting
                         a method no payment can record would be a dead string). BORN
                         WITH CASH: every branch that exists gets method='cash'. A branch
                         created LATER gets its cash row from provision_shop.py (server
                         code, migration 0018's precedent) -- that is commit 2, recorded
                         as owed; a branch with no method row refuses every payment once
                         a route reads this table.
  shop_payment_channels  the shop's OWN payment channels the owner uploads (his gap of
                         2026-09-11: "upload payment channels ... add QR bank payment").
                         PER TENANT, with a NULLABLE branch scope. A row is COHERENT FOR
                         ITS KIND -- a 'promptpay' row carries a proxy and its type and no
                         bank fields; a 'bank_account' row carries bank fields and no
                         proxy -- enforced by ck_shop_channels_coherent. This is the
                         shop's own business account, NOT personal-data machinery: no
                         encryption at rest, no retention purge (section 4.1/4.4's rules
                         govern data held about OTHERS). NOTHING reads or writes it here.
  branches.shifts_enabled the declared shift switch (1.6), the DECLARED species 1.1
                         names, boolean NOT NULL DEFAULT false exactly as separate_cashier.
  payments.shift_id      uuid NULL, composite FK to shifts (tenant_id, id). This is the
                         column unit 3 (migration 0020) filed as owed. NO backfill, NO
                         default, and NOTHING writes it in this commit; existing rows and
                         shifts-off shops carry NULL.

WHAT IS AUDITED, AND WHAT IS NOT -- THE OWNER'S DECISION 2026-09-18, AND IT SPLITS
---------------------------------------------------------------------------------
Audited (the 0017 trigger, one CREATE TRIGGER each, attached AFTER any backfill so
audit_capture's fail-closed no-actor RAISE cannot conscript this migration):
  * shifts -- the ONLY new table whose rows are UPDATED IN PLACE, and the updated
    columns are MONEY: counted_cash, expected_cash, variance, frozen at close. Recording
    who changed what is the trigger's whole purpose. The 0020 reason for NOT auditing a
    ledger is MECHANICAL -- auditing "would have conscripted POST /bills, which declares
    no actor" -- and it does NOT transfer here: every write to shifts originates in a
    user action carrying a principal (open, close), and no automatic path creates one
    without an actor. Invariant 14 sets a FLOOR (master-data tables MUST be audited); it
    does not forbid auditing a table above it, and this is such a table.
  * branch_payment_methods -- master data a shop edits (which methods it accepts).
  * shop_payment_channels  -- master data a shop edits (its own accounts).
All three join reconcile.py's AUDITED_TABLES and S6 in the SAME commit.

NOT audited -- cash_movements ALONE, and the reason is the 0020 precedent transferring
COMPLETELY, NOT this migration's preference:
  * cash_movements -- section 2.4's "same immutability and idempotency as payments"
    verbatim: insert-plus-void, the author on the row (created_by, voided_by), voided
    never deleted, no in-place rewrite of a settled figure. 0017 excludes the
    transactional ledger (purchase_bills) by design and 0020 left payments unaudited
    for the same reason. shifts and cash_movements SPLIT because shifts is updated in
    place on money columns and its writers always carry a principal, while
    cash_movements is not updated in place and is the payments species exactly.
  THE DISPATCH BRIEF's T8 said "audit trigger on all FOUR new tables"; commit 1 first
  audited only the two config tables (invariant 14's floor). The owner's 2026-09-18
  decision splits: shifts IN (the positive reason above), cash_movements OUT (the 0020
  precedent). This is MECHANISM, recorded here and at OPEN_ITEMS.md so it is not silence.

paid_by / created_by / opened_by ARE NOT NULLABLE HERE, unlike payments.paid_by:
these tables are BORN WITH THE MODEL (no pre-0006 rows to reconstruct), so a writer
always exists. The only born-with rows are branch_payment_methods cash rows, which
carry no actor column at all.

THE BACKFILL, AND WHY FORCE IS LIFTED AND THE TRIGGER ATTACHED LAST
------------------------------------------------------------------
Migrations run as recycle_owner (NOBYPASSRLS) and branches is FORCE ROW LEVEL
SECURITY, so with no app.tenant_id set the owner reads ZERO rows -- silently
(lessons/a-migration-reads-zero-under-force-rls.md, measured at 0015/0018/0020).
FORCE is lifted on branches for the born-with-cash backfill and restored afterwards;
recycle_app is not the owner and stays governed. branch_payment_methods is created
WITHOUT RLS, backfilled, and only THEN given ENABLE+FORCE+policy and its audit
trigger -- the 0018 order. shifts, cash_movements and shop_payment_channels are born
empty, so they take RLS at create time with no backfill fighting their own WITH CHECK.

THE MIGRATION MEASURES ITSELF
-----------------------------
Read-backs inside the one transaction, each a RuntimeError that rolls the whole
upgrade back to 0020 (env.py runs the upgrade in one transaction): one cash row per
branch; every born-with method row is pristine (cash, active); and the method set
branch_payment_methods accepts EQUALS the set payments accepts, read out of
pg_constraint (NOT restated by hand on both sides) -- if they ever differ a branch
could accept a method no payment can record.

DOWNGRADE REFUSES RATHER THAN DESTROYS (the 0015/0018/0020 precedent)
--------------------------------------------------------------------
Downgrade drops the four tables and two columns. That is only safe where nothing has
moved past the born-with state. It REFUSES, naming each count, if ANY of five things
is true: a shift exists; a cash movement exists; a branch_payment_methods row is not
the pristine born-with cash row; a shop_payment_channels row exists; a branch has
shifts_enabled on. Each is a shop's own money or its own declaration and none can be
reconstructed. A freshly-upgraded database satisfies none of them, so the
down-then-up path is provable on a scratch.
"""
import re
from typing import Sequence, Union

from alembic import op

revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The same predicate 0001 uses on every tenant table, so the value an INSERT writes
# and the value the RLS policy tests are one expression.
_TENANT_MATCH = "NULLIF(current_setting('app.tenant_id', true), '')::uuid"

# The payment-method set. Restated ONCE here for the branch_payment_methods CHECK; the
# upgrade then reads payments' own ck_payments_method out of pg_constraint and REFUSES
# if the two sets differ, so this literal cannot silently drift from the ledger's.
_METHODS = ("cash", "promptpay", "transfer", "write_off")
_METHODS_SQL = ", ".join(f"'{m}'" for m in _METHODS)
_BORN_METHOD = "cash"

# The kinds a cash movement may be. Section 2.4 verbatim.
_CASH_KINDS = ("expense", "float_in", "float_out", "deposit_to_bank")
_CASH_KINDS_SQL = ", ".join(f"'{k}'" for k in _CASH_KINDS)

# The channel kinds and proxy types. Section T5.
_CHANNEL_KINDS_SQL = "'promptpay', 'bank_account'"
_PROXY_TYPES_SQL = "'phone', 'national_id', 'ewallet'"

# The tables this migration audits (the owner's 2026-09-18 split): shifts (updated
# in place on money columns, its writers always carry a principal) plus the two
# master-data config tables. cash_movements ALONE is NOT here -- the payments species,
# insert-plus-void, no in-place rewrite. See the docstring.
_AUDITED_NEW = ("shifts", "branch_payment_methods", "shop_payment_channels")

# ASCII ONLY, no apostrophes, NO BRACES: these strings are embedded in SQL literals
# through f-strings and are read back out of the catalogue on a codepage-874 box
# without needing hex to be believed (0015..0020 convention;
# lessons/console-is-not-the-observation.md).
_SHIFTS_COMMENT = (
    "A cash-drawer session (STRUCTURE.md 2.4, 3.5), migration 0021. Opened with a "
    "float and a cashier; closed with the counted cash, the server-frozen expected "
    "cash (hard rule 6), and the variance -- the close columns are ALL NULL (open) or "
    "ALL PRESENT (closed), ck_shifts_close_consistency. AT MOST ONE OPEN shift per "
    "branch, enforced in the schema by the partial unique index "
    "uq_shifts_one_open_per_branch. NOT audited: a transactional table carrying its "
    "author on the row (opened_by, closed_by). No route writes it in 0021; the close "
    "route and the day-close materialiser are commit 2."
)
_SHIFTS_VARIANCE_COMMENT = (
    "counted_cash minus expected_cash, frozen at close (hard rule 6). Part of the "
    "close set: NULL while the shift is open, present when it is closed. A blank or "
    "missing reason for a NON-ZERO variance is a close-route policy (3.5, commit 2), "
    "not a schema invariant, so variance_reason is separately nullable."
)
_CASH_MOVEMENTS_COMMENT = (
    "Money moving in the drawer that is not a payment (STRUCTURE.md 2.4), migration "
    "0021: an expense, a float in or out, or a deposit to the bank. The same "
    "immutability and idempotency as payments -- amount > 0, one idempotency key per "
    "tenant, VOIDED never deleted (no DELETE grant) under ck_cash_movements_void_"
    "consistency. shift_id is NULLABLE: a shifts-off shop has no shift, and a movement "
    "recorded before the day-close materialises one carries none. receipt_file_id is "
    "NULLABLE with NO FK -- files is batch C and the FK arrives with it. NOT audited: "
    "transactional, its author on the row (created_by, voided_by)."
)
_BRANCH_PAYMENT_METHODS_COMMENT = (
    "Which payment methods a branch accepts (STRUCTURE.md 1.6), migration 0021: a "
    "DERIVED switch, the control shown when the set holds more than the one cash row "
    "every branch is born with. method is CHECKed against the SAME fixed set as "
    "payments.method (the upgrade refuses if they differ). A method is DEACTIVATED, "
    "never deleted (no DELETE grant). Audited: master data a shop edits. A branch "
    "created after 0021 gets its cash row from provision_shop.py (server code, commit "
    "2); a branch with no method row refuses every payment once a route reads this."
)
_SHOP_PAYMENT_CHANNELS_COMMENT = (
    "Payment channels the shop itself owns and the owner uploads (STRUCTURE.md 2.4; "
    "the owner gap recorded 2026-09-11), migration 0021. PER TENANT with a NULLABLE "
    "branch scope. A row is COHERENT FOR ITS KIND (ck_shop_channels_coherent): a "
    "promptpay row carries a proxy and its type and no bank fields; a bank_account row "
    "carries bank fields and no proxy. These accounts belong to the shop itself, NOT "
    "personal-data machinery -- no encryption, no purge (4.1/4.4 govern data about "
    "OTHERS). Audited: master data a shop edits. NOTHING reads or writes it in 0021; "
    "schema for commit 2."
)
_SHIFTS_ENABLED_COMMENT = (
    "Declared shift switch (STRUCTURE.md 1.6, the declared species of 1.1), migration "
    "0021: whether this branch runs cashier shifts. false (the born-with value): the "
    "server materialises one day-shift at the day close. true: the cashier opens and "
    "closes shifts. A switch selects WHO performs a transition, never whether it "
    "exists. No route writes it in 0021 (PATCH /branches is the section 9 work)."
)
_PAYMENTS_SHIFT_ID_COMMENT = (
    "The shift this payment was recorded in (STRUCTURE.md 2.1), added by migration "
    "0021 -- the column unit 3 (0020) filed as owed. NULLABLE: existing rows and "
    "shifts-off shops carry NULL. Composite FK to shifts (tenant_id, id). NOTHING "
    "writes it in 0021."
)


def upgrade() -> None:
    # Each statement issued separately: asyncpg's extended query protocol forbids
    # multiple commands in one prepared statement (convention from 0001..0020).
    bind = op.get_bind()

    # ------------------------------------------------------------------- shifts
    # id uuid PK plus the composite uq (tenant_id, id): the FK target for
    # payments.shift_id and cash_movements.shift_id (ARCHITECTURE 4 point 1).
    # The close columns (closed_at, closed_by, counted_cash, expected_cash, variance)
    # are all NULL or all PRESENT -- the void-consistency shape 2.4 names. The brief
    # named FOUR; variance is the FIFTH in the same set because 2.4 stores it and a
    # closed shift with a null variance is a hole hard rule 6 forbids.
    op.execute(
        """
        CREATE TABLE shifts (
            id              uuid           PRIMARY KEY,
            tenant_id       uuid           NOT NULL REFERENCES tenants (id),
            branch_id       uuid           NOT NULL,
            opened_at       timestamptz    NOT NULL,
            opened_by       uuid           NOT NULL,
            opening_float   numeric(14, 2) NOT NULL,
            closed_at       timestamptz,
            closed_by       uuid,
            counted_cash    numeric(14, 2),
            expected_cash   numeric(14, 2),
            variance        numeric(14, 2),
            variance_reason text,
            created_at      timestamptz    NOT NULL DEFAULT now(),
            CONSTRAINT uq_shifts_tenant_id UNIQUE (tenant_id, id),
            CONSTRAINT fk_shifts_branch
                FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id),
            CONSTRAINT fk_shifts_opened_by
                FOREIGN KEY (tenant_id, opened_by) REFERENCES users (tenant_id, id),
            CONSTRAINT fk_shifts_closed_by
                FOREIGN KEY (tenant_id, closed_by) REFERENCES users (tenant_id, id),
            CONSTRAINT ck_shifts_opening_float CHECK (opening_float >= 0),
            CONSTRAINT ck_shifts_variance_reason_len
                CHECK (variance_reason IS NULL OR char_length(variance_reason) <= 500),
            CONSTRAINT ck_shifts_close_consistency CHECK (
                (closed_at IS NULL AND closed_by IS NULL AND counted_cash IS NULL
                     AND expected_cash IS NULL AND variance IS NULL) OR
                (closed_at IS NOT NULL AND closed_by IS NOT NULL AND counted_cash IS NOT NULL
                     AND expected_cash IS NOT NULL AND variance IS NOT NULL)
            )
        )
        """
    )
    # AT MOST ONE OPEN shift per branch, in the SCHEMA. A route-only guard is a rule
    # nothing enforces when a second writer appears.
    op.execute(
        "CREATE UNIQUE INDEX uq_shifts_one_open_per_branch"
        " ON shifts (tenant_id, branch_id) WHERE closed_at IS NULL"
    )
    op.execute(f"COMMENT ON TABLE  shifts          IS '{_SHIFTS_COMMENT}'")
    op.execute(f"COMMENT ON COLUMN shifts.variance IS '{_SHIFTS_VARIANCE_COMMENT}'")

    # ---------------------------------------------------------- cash_movements
    op.execute(
        f"""
        CREATE TABLE cash_movements (
            id                 uuid           PRIMARY KEY,
            tenant_id          uuid           NOT NULL REFERENCES tenants (id),
            branch_id          uuid           NOT NULL,
            shift_id           uuid,
            kind               text           NOT NULL,
            amount             numeric(14, 2) NOT NULL,
            note               text,
            receipt_file_id    uuid,
            created_by         uuid           NOT NULL,
            device_created_at  timestamptz    NOT NULL,
            server_received_at timestamptz    NOT NULL DEFAULT now(),
            idempotency_key    text           NOT NULL,
            voided_at          timestamptz,
            voided_by          uuid,
            void_reason        text,
            CONSTRAINT uq_cash_movements_tenant_idem UNIQUE (tenant_id, idempotency_key),
            CONSTRAINT fk_cash_movements_branch
                FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id),
            CONSTRAINT fk_cash_movements_shift
                FOREIGN KEY (tenant_id, shift_id) REFERENCES shifts (tenant_id, id),
            CONSTRAINT fk_cash_movements_created_by
                FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id),
            CONSTRAINT fk_cash_movements_voided_by
                FOREIGN KEY (tenant_id, voided_by) REFERENCES users (tenant_id, id),
            CONSTRAINT ck_cash_movements_kind CHECK (kind IN ({_CASH_KINDS_SQL})),
            CONSTRAINT ck_cash_movements_amount CHECK (amount > 0),
            CONSTRAINT ck_cash_movements_note_len
                CHECK (note IS NULL OR char_length(note) <= 500),
            CONSTRAINT ck_cash_movements_void_consistency CHECK (
                (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL) OR
                (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL)
            )
        )
        """
    )
    op.execute(f"COMMENT ON TABLE cash_movements IS '{_CASH_MOVEMENTS_COMMENT}'")

    # ------------------------------------------------ branch_payment_methods
    # method CHECKed against the SAME set as payments.method. A read-back below
    # asserts the two sets are equal out of pg_constraint.
    op.execute(
        f"""
        CREATE TABLE branch_payment_methods (
            tenant_id  uuid        NOT NULL REFERENCES tenants (id),
            branch_id  uuid        NOT NULL,
            method     text        NOT NULL,
            is_active  boolean     NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT pk_branch_payment_methods PRIMARY KEY (tenant_id, branch_id, method),
            CONSTRAINT fk_branch_payment_methods_branch
                FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id),
            CONSTRAINT ck_branch_payment_methods_method CHECK (method IN ({_METHODS_SQL}))
        )
        """
    )
    op.execute(
        f"COMMENT ON TABLE branch_payment_methods IS '{_BRANCH_PAYMENT_METHODS_COMMENT}'"
    )

    # ------------------------------------------------- shop_payment_channels
    op.execute(
        f"""
        CREATE TABLE shop_payment_channels (
            id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id            uuid        NOT NULL REFERENCES tenants (id),
            branch_id            uuid,
            kind                 text        NOT NULL,
            label                text        NOT NULL,
            promptpay_proxy      text,
            promptpay_proxy_type text,
            bank_code            text,
            account_no           text,
            account_name         text,
            is_active            boolean     NOT NULL DEFAULT true,
            created_at           timestamptz NOT NULL DEFAULT now(),
            created_by           uuid        NOT NULL,
            CONSTRAINT fk_shop_channels_branch
                FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id),
            CONSTRAINT fk_shop_channels_created_by
                FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id),
            CONSTRAINT ck_shop_channels_kind CHECK (kind IN ({_CHANNEL_KINDS_SQL})),
            CONSTRAINT ck_shop_channels_proxy_type
                CHECK (promptpay_proxy_type IS NULL
                       OR promptpay_proxy_type IN ({_PROXY_TYPES_SQL})),
            CONSTRAINT ck_shop_channels_label_len
                CHECK (char_length(label) BETWEEN 1 AND 100),
            CONSTRAINT ck_shop_channels_proxy_len
                CHECK (promptpay_proxy IS NULL OR char_length(promptpay_proxy) <= 64),
            CONSTRAINT ck_shop_channels_bank_code_len
                CHECK (bank_code IS NULL OR char_length(bank_code) <= 16),
            CONSTRAINT ck_shop_channels_account_no_len
                CHECK (account_no IS NULL OR char_length(account_no) <= 64),
            CONSTRAINT ck_shop_channels_account_name_len
                CHECK (account_name IS NULL OR char_length(account_name) <= 200),
            CONSTRAINT ck_shop_channels_coherent CHECK (
                (kind = 'promptpay'
                     AND promptpay_proxy IS NOT NULL AND promptpay_proxy_type IS NOT NULL
                     AND bank_code IS NULL AND account_no IS NULL AND account_name IS NULL) OR
                (kind = 'bank_account'
                     AND bank_code IS NOT NULL AND account_no IS NOT NULL
                     AND account_name IS NOT NULL
                     AND promptpay_proxy IS NULL AND promptpay_proxy_type IS NULL)
            )
        )
        """
    )
    op.execute(
        f"COMMENT ON TABLE shop_payment_channels IS '{_SHOP_PAYMENT_CHANNELS_COMMENT}'"
    )

    # ----------------------------------------------- branches.shifts_enabled
    # DDL fires no row trigger, so the audited branches table needs no actor here.
    op.execute(
        "ALTER TABLE branches ADD COLUMN shifts_enabled boolean NOT NULL DEFAULT false"
    )
    op.execute(f"COMMENT ON COLUMN branches.shifts_enabled IS '{_SHIFTS_ENABLED_COMMENT}'")

    # ------------------------------------------------------- payments.shift_id
    op.execute("ALTER TABLE payments ADD COLUMN shift_id uuid")
    op.execute(
        "ALTER TABLE payments ADD CONSTRAINT fk_payments_shift"
        " FOREIGN KEY (tenant_id, shift_id) REFERENCES shifts (tenant_id, id)"
    )
    op.execute(f"COMMENT ON COLUMN payments.shift_id IS '{_PAYMENTS_SHIFT_ID_COMMENT}'")

    # --------------------------------- born-with cash rows, FORCE lifted on the source
    # branches is FORCE RLS; the owner reads 0 rows without a tenant context, so the
    # INSERT ... SELECT FROM branches would insert nothing. Lift FORCE on branches
    # only (recycle_app stays governed), backfill, restore.
    op.execute("ALTER TABLE branches NO FORCE ROW LEVEL SECURITY")
    op.execute(
        f"""
        INSERT INTO branch_payment_methods (tenant_id, branch_id, method, is_active)
        SELECT tenant_id, id, '{_BORN_METHOD}', true FROM branches
        """
    )
    branches_n = bind.exec_driver_sql("SELECT count(*) FROM branches").scalar()
    op.execute("ALTER TABLE branches FORCE ROW LEVEL SECURITY")

    methods_n = bind.exec_driver_sql(
        "SELECT count(*) FROM branch_payment_methods"
    ).scalar()
    if methods_n != branches_n:
        raise RuntimeError(
            f"REFUSING 0021: {branches_n} branch(es) but {methods_n} born-with payment "
            "method row(s); every branch must be born with exactly one. Nothing is "
            "committed."
        )
    impure = bind.exec_driver_sql(
        f"SELECT count(*) FROM branch_payment_methods"
        f" WHERE NOT (method = '{_BORN_METHOD}' AND is_active)"
    ).scalar()
    if impure:
        raise RuntimeError(
            f"REFUSING 0021: {impure} born-with method row(s) are not the pristine "
            f"active '{_BORN_METHOD}' row. Nothing is committed."
        )

    # THE METHOD SETS MUST MATCH -- read out of the catalogue, not restated on both
    # sides. A branch accepting a method no payment can record would be a dead string.
    # conname is an ASCII constant, not input, so it is interpolated as 0020 does.
    def _methods_of(conname: str) -> list[str]:
        cdef = bind.exec_driver_sql(
            f"SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = '{conname}'"
        ).scalar()
        if cdef is None:
            raise RuntimeError(
                f"REFUSING 0021: constraint {conname} not found; cannot compare the "
                "payment-method sets. Nothing is committed."
            )
        return sorted(re.findall(r"'([a-z_]+)'", cdef))

    payments_set = _methods_of("ck_payments_method")
    branch_set = _methods_of("ck_branch_payment_methods_method")
    if payments_set != branch_set or branch_set != sorted(_METHODS):
        raise RuntimeError(
            "REFUSING 0021: the payment-method sets do not all agree.\n"
            f"  payments.method               : {payments_set}\n"
            f"  branch_payment_methods.method  : {branch_set}\n"
            f"  this migration's literal       : {sorted(_METHODS)}\n"
            "A branch could accept a method no payment can record. Nothing is committed."
        )

    # -------------------------------------------------------------------- RLS
    # ENABLE + FORCE + one tenant_isolation policy, exactly as 0015..0020. All four
    # tables are inside the isolation model. Enabled AFTER the branch_payment_methods
    # backfill so that INSERT is not subject to its own WITH CHECK; the other three
    # are born empty.
    for table in (
        "shifts", "cash_movements", "branch_payment_methods", "shop_payment_channels"
    ):
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING (tenant_id = {_TENANT_MATCH}) "
            f"WITH CHECK (tenant_id = {_TENANT_MATCH})"
        )

    # ----------------------------------------------------------------- grants
    # ALTER DEFAULT PRIVILEGES has already handed recycle_app arwd (0008/0012
    # measured this); the REVOKE is what narrows. NONE of the four is ever DELETEd:
    # a shift is closed, a cash movement is voided, a method or channel is
    # deactivated. shifts and channels need UPDATE (a close, an is_active toggle);
    # cash_movements needs UPDATE for a void; branch_payment_methods for is_active.
    for table in (
        "shifts", "cash_movements", "branch_payment_methods", "shop_payment_channels"
    ):
        op.execute(f"GRANT SELECT, INSERT, UPDATE ON {table} TO recycle_app")
        op.execute(f"REVOKE DELETE ON {table} FROM recycle_app")

    # --------------------------------------------------- the audit triggers
    # LAST, after the branch_payment_methods backfill: audit_capture refuses a write
    # with no app.actor_id in context, and a migration has none (0018's precedent).
    # ONLY the two master-data tables (invariant 14); shifts and cash_movements are
    # transactional and are excluded -- see the docstring.
    for table in _AUDITED_NEW:
        op.execute(
            f"CREATE TRIGGER audit_capture"
            f" AFTER INSERT OR UPDATE OR DELETE ON {table}"
            f" FOR EACH ROW EXECUTE FUNCTION audit_capture()"
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.exec_driver_sql("SELECT to_regclass('public.shifts')").scalar() is None:
        return

    # LIFT FORCE FIRST, or the guard reads nothing and defeats itself (0015's measured
    # lesson): with no app.tenant_id set the owner sees 0 rows in every FORCE-RLS
    # table. Owner-only; recycle_app stays governed.
    _force_tables = (
        "shifts", "cash_movements", "branch_payment_methods", "shop_payment_channels",
        "branches",
    )
    for t in _force_tables:
        op.execute(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")

    shifts_n = bind.exec_driver_sql("SELECT count(*) FROM shifts").scalar()
    movements_n = bind.exec_driver_sql("SELECT count(*) FROM cash_movements").scalar()
    nontrivial_methods = bind.exec_driver_sql(
        f"SELECT count(*) FROM branch_payment_methods"
        f" WHERE NOT (method = '{_BORN_METHOD}' AND is_active)"
    ).scalar()
    channels_n = bind.exec_driver_sql(
        "SELECT count(*) FROM shop_payment_channels"
    ).scalar()
    switched = bind.exec_driver_sql(
        "SELECT count(*) FROM branches WHERE shifts_enabled"
    ).scalar()

    # Restore FORCE on the tables that survive the downgrade (the four new ones are
    # dropped below). Done before the raise so a refusal leaves a clean tree even were
    # the transaction not rolled back.
    op.execute("ALTER TABLE branches FORCE ROW LEVEL SECURITY")

    if shifts_n or movements_n or nontrivial_methods or channels_n or switched:
        raise RuntimeError(
            "REFUSING to downgrade 0021: the drawer model has moved past the born-with"
            " state.\n"
            f"  shifts                                          : {shifts_n}\n"
            f"  cash movements                                  : {movements_n}\n"
            f"  branch payment methods beyond the born-with cash: {nontrivial_methods}\n"
            f"  shop payment channels                           : {channels_n}\n"
            f"  branches with shifts_enabled on                 : {switched}\n"
            "\n"
            "WHY THAT IS NOT SAFE: this downgrade DROPS shifts, cash_movements,"
            " branch_payment_methods and shop_payment_channels. Every shift a cashier"
            " opened, every expense and float movement, every payment method or bank"
            " channel a shop declared, and every shifts switch a branch turned on would"
            " be lost, and none of it can be reconstructed.\n"
            "\n"
            "REMEDY: only downgrade a database still in the born-with state. If you"
            " genuinely mean to discard the drawer model, export it first.\n"
        )

    # Reverse order of upgrade().
    for table in _AUDITED_NEW:
        op.execute(f"DROP TRIGGER IF EXISTS audit_capture ON {table}")
    op.execute("ALTER TABLE payments DROP CONSTRAINT IF EXISTS fk_payments_shift")
    op.execute("ALTER TABLE payments DROP COLUMN IF EXISTS shift_id")
    op.execute("ALTER TABLE branches DROP COLUMN IF EXISTS shifts_enabled")
    op.execute("DROP TABLE IF EXISTS shop_payment_channels")
    op.execute("DROP TABLE IF EXISTS branch_payment_methods")
    op.execute("DROP TABLE IF EXISTS cash_movements")
    op.execute("DROP TABLE IF EXISTS shifts")
