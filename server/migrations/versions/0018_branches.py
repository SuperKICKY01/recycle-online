r"""branches: one shop, many yards -- a branch is a row inside the tenant, every
tenant is born with one, and the legal bill series is per branch.

Revision ID: 0018
Revises: 0017
Create Date: 2026-09-03

WHAT THIS IS
------------
STRUCTURE.md section 9, approved by the owner 2026-09-03 and adopted in that
section's shape (OPEN_ITEMS.md, Decisions open): a branch is a ROW INSIDE THE
TENANT, never a second GUC and never a separate tenant; every tenant is
provisioned with one; the derived switch is the COUNT of branches, so a
single-yard shop never sees a branch control. RLS is untouched -- a branch is a
filter and a composite FK, and the composite FK (tenant_id, branch_id) is what
forbids a bill in tenant A naming a branch of tenant B.

The advisor sequenced branches BEFORE the permission model (STRUCTURE.md
section 12 numbers them the other way round): branches touch every operational
table and re-key the counter that mints the shop's legal bill series, a cost
that grows with every table and every real row; permissions touch routes and
cost the same whenever done. Doing permissions first would have meant sweeping
the new permission tables again for branch_id.

This migration lands what exists today -- purchase_bills, doc_no_counters, users
-- and NOTHING that does not: payments/cash_movements/shifts (batch B), files
(C), notifications/deliveries/user_devices (E) gain branch_id in the migration
that creates them. product_prices.branch_id (the per-branch price override
section 9 sketches) is DEFERRED to the unit that builds branch pricing;
section 12's unit spec fences prices off from this one.

THE ONE THING THAT COULD HAVE LOST A SHOP'S WORK -- READ THIS BEFORE MAKING
branch_id REQUIRED ON THE WIRE
--------------------------------------------------------------------------
A bill sitting in a phone's outbox right now was written by code that knows
nothing of branches. The phone stores the wire body VERBATIM as JSON at creation
(mobile/src/sync/createBill.ts:133-141), parses it back unchanged
(mobile/src/adapters/sqlite/SqliteLocalStore.ts:301) and posts it byte for byte
(mobile/src/adapters/httpTransport.ts:108). Its seven fields
(mobile/src/sync/types.ts:30-38) carry no branch and never will.

On that phone a 422 is decided by STATUS ALONE (httpTransport.ts:161-163), maps
to `terminal` (mobile/src/sync/outboxHandlers.ts:83), lands the row in
sync_state='failed' (SqliteLocalStore.ts:769-777), which the sendable queue
excludes for ever (SqliteLocalStore.ts:189-191); the void button is withheld
(mobile/src/sync/parkedReason.ts:788) and the operator reads that the system
refused the bill and will not accept it later, that the money is already paid,
and that the bill exists on this device only (parkedReason.ts:588-592).

So a REQUIRED branch_id in BillCreate would turn EVERY queued bill on EVERY
phone into a permanent refusal of cash already handed over, at the moment the
server restarts on this commit. Therefore branch_id is OPTIONAL on the wire and
the SERVER resolves it inside the bill's transaction (server/app/bills.py,
_resolve_bill_branch): the caller's users.branch_id if set, else the tenant's
single active branch. A named branch is looked up under RLS -- unknown is 422
(the seller doctrine), deactivated is 424 branch_inactive (the product
doctrine), and a multi-branch tenant with an unscoped caller and no branch in
the payload is 424 branch_unresolved, which the office clears by assigning the
user a branch. No path reaches a 500. A later session that wants to make the
field required must first answer what happens to the bill that is already in
an outbox; this docstring is where that answer lives.

THE BORN-WITH BRANCH
--------------------
code 'MAIN' (the programme's ASCII handle, as 'A' is a tier's and 'KG' a unit's
-- lessons/fallback-default-is-a-wrong-number.md), name = the TENANT'S OWN NAME
(never an invented word: the main yard is the shop), doc_prefix 'B', active.
Keeping prefix 'B' means NO EXISTING doc_no CHANGES -- proven value against
value, every (id, doc_no) pair before and after on a restored scratch -- and the
partial unique index uq_bills_tenant_docno on (tenant_id, doc_no) stands.

THE COUNTER RE-KEY, AND THE HIGH-WATER MARK
-------------------------------------------
doc_no_counters' primary key becomes (tenant_id, branch_id, be_year). The
migration ADDS the column, points every existing row at the tenant's born-with
branch, and NEVER TOUCHES last_seq -- so the next number continues the series.
A RESTARTED SERIES IS A DUPLICATE LEGAL DOCUMENT NUMBER, and this is the most
important cell in the unit: the migration reads (tenant_id, be_year, last_seq)
before and after and REFUSES if any value moved; scripts/prove_branches.py reads
the same values on a restored scratch and then mints the next bill and asserts
seq = last_seq + 1. Measured on dev before this migration: Shop A (2569) -> 617,
Shop B (2569) -> 13; after: 617 and 13; next bills 618 and 14.

TWO CONSTRAINTS SECTION 9 DID NOT NAME, ADDED HERE (the builder's decision,
confirmed by the owner 2026-09-03)
-----------------------------------------------------------------------------
  * uq_branches_tenant_prefix UNIQUE (tenant_id, doc_prefix). Without it two
    branches could mint ONE string -- both 'B-2569-1' -- and the partial unique
    index would answer the second with an IntegrityError, a 500 to the phone,
    which is `unavailable` to the client and dams that device's queue
    (lessons/queue-jam-must-be-visible.md). Invariant 10 ("doc_no is unique per
    tenant and its series is per branch") needs the prefix to be unique per
    tenant, and a constraint is what makes it structural.
  * ck_branches_doc_prefix CHECK (doc_prefix ~ '^[A-Z]{1,4}$'). Uppercase ASCII
    letters only, one to four, so a prefix can never contain '-' or a digit and
    split_part(doc_no, '-', n) stays unambiguous for every reader (reports.py,
    reconcile.py, prove_reconcile.py). An engineering bound, not a business
    rule; no route writes doc_prefix in this unit, so the column is the only
    edge and it refuses exactly what a future route must refuse.

THE YEAR GATE STAYS PER TENANT; THE COUNTER'S IDENTITY IS PER BRANCH
--------------------------------------------------------------------
bills.py's year gate compares the arriving be_year against max(be_year) over
the TENANT's counters, unchanged: it detects a wrong server clock, which is a
fact about the server, not a yard. A second yard's first bill of a year the
shop already trades in is not a clock jump and must not be refused.

THE BACKFILL, AND WHY FORCE IS LIFTED AND THE TRIGGER ATTACHED LAST
------------------------------------------------------------------
Migrations run as recycle_owner (NOBYPASSRLS) and tenants, purchase_bills and
doc_no_counters are FORCE ROW LEVEL SECURITY, so with no app.tenant_id set the
owner reads and updates ZERO rows -- silently (lessons/a-migration-reads-zero-
under-force-rls.md, measured at 0015). FORCE is lifted on those three tables
for the backfill and restored afterwards; recycle_app is not the owner and stays
governed throughout. branches itself is created WITHOUT RLS, backfilled, used as
the JOIN source for the two column backfills, and only THEN given
ENABLE+FORCE+policy -- the same order 0015 used for grade_tiers.

The audit trigger (0017's audit_capture, SECURITY DEFINER) REFUSES a write with
no app.actor_id in context, and a migration sets none
(lessons/a-fail-closed-trigger-conscripts-every-writer-of-its-table.md). So the
trigger is attached AFTER the backfill INSERT. branches joins _AUDITED_TABLES
and reconcile.py's S6 set in this migration (STRUCTURE.md invariant 14).

THE MIGRATION MEASURES ITSELF
-----------------------------
Three read-backs inside the transaction, each a RuntimeError on failure so the
whole migration rolls back rather than landing half-keyed: (1) one branch per
tenant, counts equal; (2) no bill and no counter row left without a branch --
the SET NOT NULL would also refuse, but the message here names the count; (3)
every (tenant_id, be_year, last_seq) triple is byte-identical before and after.

DOWNGRADE REFUSES RATHER THAN DESTROYS (the 0015 precedent)
-----------------------------------------------------------
Downgrade restores PRIMARY KEY (tenant_id, be_year), drops the three columns and
the table. That is only safe where nothing has moved past the born-with state.
It REFUSES, naming each count, if ANY of five things is true: a tenant has more
or fewer than one branch; a branch is not the pristine born-with row (code
'MAIN', prefix 'B', active, name equal to the tenant's name, no address, no
phone); a user carries a branch; a bill sits on a non-born-with branch; a
counter row sits on a non-born-with branch. Each of those is a shop's own
declaration or a series the drop would merge, and none can be reconstructed
afterwards. A freshly-upgraded database satisfies none of them, so the
down-then-up path is provable on a scratch.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Reusable RLS predicate. The same expression 0001 uses on every tenant table,
# so the value an INSERT writes and the value the policy tests are one thing.
_TENANT_MATCH = "NULLIF(current_setting('app.tenant_id', true), '')::uuid"

# The born-with branch's handle and prefix. Named ONCE here; the downgrade guard
# and provision_shop.py / seed_dev.py restate the same two literals by hand
# (a migration is not a library).
_BORN_CODE = "MAIN"
_BORN_PREFIX = "B"

# ASCII ONLY, no apostrophes, NO BRACES: these strings are embedded in SQL
# literals through f-strings and are meant to be read back out of the catalogue
# on a codepage-874 box without needing hex to be believed
# (lessons/console-is-not-the-observation.md). Convention from 0006..0017.
_TABLE_COMMENT = (
    "A yard of a shop. A branch is a ROW INSIDE THE TENANT (STRUCTURE.md section "
    "9): every tenant is born with one (code MAIN, name = the name of the shop, "
    "doc_prefix B), the derived switch is the count, and every operational row "
    "carries branch_id by composite FK (tenant_id, id). Never a second GUC and "
    "never a separate tenant; RLS is keyed on tenant_id alone. A branch is "
    "DEACTIVATED, never deleted (no DELETE grant). Branch SCOPE is enforced by "
    "nothing but the composite FK until the permission model lands. See "
    "migration 0018."
)
_CODE_COMMENT = (
    "The stable handle of the branch within the shop, unique per tenant. The "
    "born-with branch is MAIN, the ASCII placeholder of the programme (as A is "
    "for a tier); the words of the shop go in name. Bounded 1..32 chars, an "
    "engineering bound."
)
_NAME_COMMENT = (
    "The display text of the yard, the words of the shop. The born-with branch "
    "takes the tenant name at creation and the shop renames it. Bounded "
    "1..100 chars, matching grade_tiers.name."
)
_PREFIX_COMMENT = (
    "The prefix of the legal bill series of this branch: doc_no is "
    "prefix-beyear-seq, and doc_no_counters is keyed per branch, so each branch "
    "mints its own gap-free series. UNIQUE per tenant (two branches sharing a "
    "prefix would mint one string and the partial unique index on doc_no would "
    "answer the second with a 500 that jams a phone) and CHECKed to uppercase "
    "ASCII letters 1..4 so split_part parsing stays unambiguous. The born-with "
    "branch keeps B, so no doc_no minted before 0018 changed. IMMUTABLE ONCE A "
    "BILL CARRIES IT by intent -- a change would restart a visible series; no "
    "route writes it in 0018 and reconciler check T17 reds on any bill whose "
    "prefix is not the prefix of its branch."
)
_IS_ACTIVE_COMMENT = (
    "Whether the branch is offered for new work. Deactivated, never deleted; "
    "a bill naming a deactivated branch is refused 424 branch_inactive, "
    "resolvable by reactivating it. Row-level reads never filter on this."
)
_BILLS_BRANCH_COMMENT = (
    "The yard this bill was written at, and the series its doc_no belongs to. "
    "NOT NULL; backfilled to the born-with branch of the tenant for every bill "
    "that predates 0018. OPTIONAL ON THE WIRE -- the server resolves an absent "
    "branch_id from the caller (users.branch_id, else the single active branch "
    "of the tenant) because a bill queued offline before 0018 carries none and "
    "a required field would refuse it terminally with the cash already paid. "
    "See the docstring of migration 0018 before making it required."
)
_COUNTERS_BRANCH_COMMENT = (
    "The branch whose series this counter row mints; part of the primary key "
    "(tenant_id, branch_id, be_year) since 0018. Existing rows were re-keyed to "
    "the born-with branch with last_seq UNTOUCHED, so every series continued. "
    "A restarted counter is a duplicate legal document number."
)
_USERS_BRANCH_COMMENT = (
    "The branch this user works at, or NULL meaning every branch (the owner, "
    "the accountant). Read by POST /bills to resolve a bill that names no "
    "branch and by GET /shop to report the branch of the caller. Enforced as a "
    "SCOPE by nothing yet: the gate arrives with the permission model, and "
    "nothing here half-builds it."
)


def upgrade() -> None:
    # Each statement issued separately: asyncpg's extended query protocol forbids
    # multiple commands in one prepared statement (convention from 0001/0015).
    bind = op.get_bind()

    # ----------------------------------------------------------------- the table
    # id uuid PK plus the composite uq (tenant_id, id), ARCHITECTURE 4 point 1: the
    # FK target for purchase_bills, doc_no_counters and users.
    op.execute(
        """
        CREATE TABLE branches (
            id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id  uuid        NOT NULL REFERENCES tenants (id),
            code       text        NOT NULL,
            name       text        NOT NULL,
            address    text,
            phone      text,
            doc_prefix text        NOT NULL DEFAULT 'B',
            is_active  boolean     NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_branches_tenant_id     UNIQUE (tenant_id, id),
            CONSTRAINT uq_branches_tenant_code   UNIQUE (tenant_id, code),
            CONSTRAINT uq_branches_tenant_prefix UNIQUE (tenant_id, doc_prefix),
            CONSTRAINT ck_branches_code_len
                CHECK (char_length(code) BETWEEN 1 AND 32),
            CONSTRAINT ck_branches_name_len
                CHECK (char_length(name) BETWEEN 1 AND 100),
            CONSTRAINT ck_branches_doc_prefix
                CHECK (doc_prefix ~ '^[A-Z]{1,4}$'),
            CONSTRAINT ck_branches_address_len
                CHECK (address IS NULL OR char_length(address) <= 500),
            CONSTRAINT ck_branches_phone_len
                CHECK (phone IS NULL OR char_length(phone) <= 32)
        )
        """
    )
    op.execute(f"COMMENT ON TABLE  branches            IS '{_TABLE_COMMENT}'")
    op.execute(f"COMMENT ON COLUMN branches.code       IS '{_CODE_COMMENT}'")
    op.execute(f"COMMENT ON COLUMN branches.name       IS '{_NAME_COMMENT}'")
    op.execute(f"COMMENT ON COLUMN branches.doc_prefix IS '{_PREFIX_COMMENT}'")
    op.execute(f"COMMENT ON COLUMN branches.is_active  IS '{_IS_ACTIVE_COMMENT}'")

    # ------------------------------------------- the born-with branch per tenant
    # FORCE lifted on the SOURCE and TARGET tables ONLY, and ONLY for the owner
    # (recycle_app stays governed). See the docstring's FORCE section.
    op.execute("ALTER TABLE tenants         NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE purchase_bills  NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE doc_no_counters NO FORCE ROW LEVEL SECURITY")

    # THE HIGH-WATER MARK, READ BEFORE ANYTHING IS TOUCHED. Compared after the
    # re-key; any movement refuses the whole migration.
    counters_before = sorted(
        (str(r[0]), int(r[1]), int(r[2]))
        for r in bind.exec_driver_sql(
            "SELECT tenant_id, be_year, last_seq FROM doc_no_counters"
        ).fetchall()
    )

    op.execute(
        f"""
        INSERT INTO branches (tenant_id, code, name, doc_prefix, is_active)
        SELECT t.id, '{_BORN_CODE}', t.name, '{_BORN_PREFIX}', true
          FROM tenants t
        """
    )
    tenants_n = bind.exec_driver_sql("SELECT count(*) FROM tenants").scalar()
    branches_n = bind.exec_driver_sql("SELECT count(*) FROM branches").scalar()
    if tenants_n != branches_n:
        raise RuntimeError(
            f"REFUSING 0018: {tenants_n} tenant(s) but {branches_n} born-with"
            " branch(es) after the backfill; the two must be equal. Nothing is"
            " committed."
        )

    # ------------------------------------------------ purchase_bills.branch_id
    # Nullable first, backfilled through the born-with branch, then NOT NULL and
    # the composite FK. The JOIN reads branches, which has NO RLS yet -- by
    # design, see the docstring: enabling it first would empty this read.
    op.execute("ALTER TABLE purchase_bills ADD COLUMN branch_id uuid")
    op.execute(
        f"""
        UPDATE purchase_bills b
           SET branch_id = br.id
          FROM branches br
         WHERE br.tenant_id = b.tenant_id AND br.code = '{_BORN_CODE}'
        """
    )
    bills_null = bind.exec_driver_sql(
        "SELECT count(*) FROM purchase_bills WHERE branch_id IS NULL"
    ).scalar()
    if bills_null:
        raise RuntimeError(
            f"REFUSING 0018: {bills_null} bill(s) found no born-with branch for"
            " their tenant after the backfill. Nothing is committed."
        )
    op.execute("ALTER TABLE purchase_bills ALTER COLUMN branch_id SET NOT NULL")
    op.execute(
        "ALTER TABLE purchase_bills ADD CONSTRAINT fk_bills_branch"
        " FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id)"
    )
    op.execute(f"COMMENT ON COLUMN purchase_bills.branch_id IS '{_BILLS_BRANCH_COMMENT}'")

    # ------------------------------------------- doc_no_counters re-keyed
    op.execute("ALTER TABLE doc_no_counters ADD COLUMN branch_id uuid")
    op.execute(
        f"""
        UPDATE doc_no_counters c
           SET branch_id = br.id
          FROM branches br
         WHERE br.tenant_id = c.tenant_id AND br.code = '{_BORN_CODE}'
        """
    )
    counters_null = bind.exec_driver_sql(
        "SELECT count(*) FROM doc_no_counters WHERE branch_id IS NULL"
    ).scalar()
    if counters_null:
        raise RuntimeError(
            f"REFUSING 0018: {counters_null} counter row(s) found no born-with"
            " branch for their tenant after the backfill. Nothing is committed."
        )
    op.execute("ALTER TABLE doc_no_counters ALTER COLUMN branch_id SET NOT NULL")
    op.execute("ALTER TABLE doc_no_counters DROP CONSTRAINT doc_no_counters_pkey")
    op.execute(
        "ALTER TABLE doc_no_counters ADD CONSTRAINT doc_no_counters_pkey"
        " PRIMARY KEY (tenant_id, branch_id, be_year)"
    )
    op.execute(
        "ALTER TABLE doc_no_counters ADD CONSTRAINT fk_counters_branch"
        " FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id)"
    )
    op.execute(f"COMMENT ON COLUMN doc_no_counters.branch_id IS '{_COUNTERS_BRANCH_COMMENT}'")

    # THE HIGH-WATER MARK, READ AGAIN. Value against value, every triple.
    counters_after = sorted(
        (str(r[0]), int(r[1]), int(r[2]))
        for r in bind.exec_driver_sql(
            "SELECT tenant_id, be_year, last_seq FROM doc_no_counters"
        ).fetchall()
    )
    if counters_before != counters_after:
        raise RuntimeError(
            "REFUSING 0018: the doc_no counter high-water marks MOVED during the"
            f" re-key.\n  before: {counters_before}\n  after : {counters_after}\n"
            "A restarted or shifted series is a duplicate legal document number."
            " Nothing is committed."
        )

    # Restore FORCE. reconcile.py S3 re-checks this; a forgotten line goes red.
    op.execute("ALTER TABLE tenants         FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE purchase_bills  FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE doc_no_counters FORCE ROW LEVEL SECURITY")

    # ------------------------------------------------------- users.branch_id
    # Nullable: NULL means every branch. MATCH SIMPLE, so the composite FK is not
    # checked while NULL (the 0001 voided_by mechanic). No backfill: nobody is
    # scoped until an admin says so.
    op.execute("ALTER TABLE users ADD COLUMN branch_id uuid")
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT fk_users_branch"
        " FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id)"
    )
    op.execute(f"COMMENT ON COLUMN users.branch_id IS '{_USERS_BRANCH_COMMENT}'")

    # -------------------------------------------------------------------- RLS
    # Enabled AFTER every backfill that read this table, exactly as 0015 did.
    op.execute("ALTER TABLE branches ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE branches FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON branches "
        f"USING (tenant_id = {_TENANT_MATCH}) "
        f"WITH CHECK (tenant_id = {_TENANT_MATCH})"
    )

    # ----------------------------------------------------------------- grants
    # ALTER DEFAULT PRIVILEGES has already handed recycle_app arwd (0008/0012
    # measured this); the REVOKE is what narrows. A branch is DEACTIVATED, never
    # deleted, so the app gets no DELETE.
    op.execute("GRANT SELECT, INSERT, UPDATE ON branches TO recycle_app")
    op.execute("REVOKE DELETE ON branches FROM recycle_app")

    # -------------------------------------------------------------- the trigger
    # LAST, after the backfill INSERT: audit_capture refuses a write with no actor
    # in context, and a migration has none. branches is master data a shop edits
    # (name, address, phone, activation), so it is audited like the other eight.
    op.execute(
        "CREATE TRIGGER audit_capture"
        " AFTER INSERT OR UPDATE OR DELETE ON branches"
        " FOR EACH ROW EXECUTE FUNCTION audit_capture()"
    )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.exec_driver_sql("SELECT to_regclass('public.branches')").scalar() is None:
        return

    # LIFT FORCE FIRST, or the guard reads nothing and defeats itself (0015's
    # measured lesson): with no app.tenant_id set the owner sees 0 rows in every
    # FORCE-RLS table, and a count of zero would let a destructive downgrade
    # proceed. Owner-only; recycle_app stays governed.
    for t in ("branches", "tenants", "users", "purchase_bills", "doc_no_counters"):
        op.execute(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")

    # The five refusal conditions, each a count the operator can read.
    uneven = bind.exec_driver_sql(
        "SELECT count(*) FROM tenants t"
        " WHERE (SELECT count(*) FROM branches b WHERE b.tenant_id = t.id) <> 1"
    ).scalar()
    nontrivial = bind.exec_driver_sql(
        "SELECT count(*) FROM branches b JOIN tenants t ON t.id = b.tenant_id"
        f" WHERE NOT (b.code = '{_BORN_CODE}' AND b.doc_prefix = '{_BORN_PREFIX}'"
        "            AND b.is_active AND b.name = t.name"
        "            AND b.address IS NULL AND b.phone IS NULL)"
    ).scalar()
    scoped_users = bind.exec_driver_sql(
        "SELECT count(*) FROM users WHERE branch_id IS NOT NULL"
    ).scalar()
    moved_bills = bind.exec_driver_sql(
        "SELECT count(*) FROM purchase_bills pb JOIN branches b ON b.id = pb.branch_id"
        f" WHERE b.code <> '{_BORN_CODE}'"
    ).scalar()
    moved_counters = bind.exec_driver_sql(
        "SELECT count(*) FROM doc_no_counters c JOIN branches b ON b.id = c.branch_id"
        f" WHERE b.code <> '{_BORN_CODE}'"
    ).scalar()

    # Restore FORCE on the tables that survive (branches is dropped below). Done
    # before the raise so a refusal leaves a clean tree even were the transaction
    # not rolled back.
    for t in ("tenants", "users", "purchase_bills", "doc_no_counters"):
        op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")

    if uneven or nontrivial or scoped_users or moved_bills or moved_counters:
        raise RuntimeError(
            "REFUSING to downgrade 0018: the branch model has moved past the"
            " born-with state.\n"
            f"  tenants with a branch count other than one : {uneven}\n"
            f"  branches that are not the pristine born-with row : {nontrivial}\n"
            f"  users scoped to a branch                     : {scoped_users}\n"
            f"  bills on a non-born-with branch              : {moved_bills}\n"
            f"  counter rows on a non-born-with branch       : {moved_counters}\n"
            "\n"
            "WHY THAT IS NOT SAFE: this downgrade restores PRIMARY KEY"
            " (tenant_id, be_year) on doc_no_counters and DROPS branches with"
            " every column that points at it. Two branches' counter rows for one"
            " year would collide on the restored key, two series would merge"
            " into one numbering, and every branch name, address, phone,"
            " deactivation and user scope a shop declared would be lost.\n"
            "\n"
            "REMEDY: only downgrade a database still in the born-with state."
            " If you genuinely mean to discard the branch configuration, move"
            " every bill, counter and user back to the born-with branch and"
            " remove the other branches deliberately first.\n"
        )

    # Reverse order of upgrade().
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS fk_users_branch")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS branch_id")
    op.execute("ALTER TABLE doc_no_counters DROP CONSTRAINT IF EXISTS fk_counters_branch")
    op.execute("ALTER TABLE doc_no_counters DROP CONSTRAINT doc_no_counters_pkey")
    op.execute(
        "ALTER TABLE doc_no_counters ADD CONSTRAINT doc_no_counters_pkey"
        " PRIMARY KEY (tenant_id, be_year)"
    )
    op.execute("ALTER TABLE doc_no_counters DROP COLUMN IF EXISTS branch_id")
    op.execute("ALTER TABLE purchase_bills DROP CONSTRAINT IF EXISTS fk_bills_branch")
    op.execute("ALTER TABLE purchase_bills DROP COLUMN IF EXISTS branch_id")
    op.execute("DROP TRIGGER IF EXISTS audit_capture ON branches")
    op.execute("DROP TABLE IF EXISTS branches")
