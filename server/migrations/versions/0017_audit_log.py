r"""audit_log - an append-only record of every master-data write, written by
database triggers, attributed to the actor the request carried

Revision ID: 0017
Revises: 0016
Create Date: 2026-09-02

WHY THIS TABLE EXISTS
---------------------
ARCHITECTURE.md D3 settled it: "audit logging exists from the provider service's
first day ... every master-data write with its author." Until now nothing recorded
who changed a price, who moved a seller between tiers, or who deactivated a user.
PUT /products/{id}/prices/{grade} is an UPSERT that overwrites (master.py, the
DO UPDATE SET price line), so every price a shop has ever charged before the current
one is already gone with no author. That loss is PERMANENT for every day the gap
stays open, which is why this lands now and not with the provider web.

D3's OTHER half - "every provider READ of a shop's data" - is a provider-service
concern and that service is decided-but-unbuilt (ARCHITECTURE 2.2). This migration
builds the write half.

WHAT IS AUDITED, AND WHAT IS NOT
--------------------------------
Audited (8 master-data tables, one trigger each): uoms, product_categories,
products, product_prices, sellers, grade_tiers, users, tenants. These are the
configuration a shop edits, and today a mutation to any of them leaves the new
value and no author (21 of the app's 25 write sites record no actor at all).

NOT audited, each for a stated reason:
  * purchase_bills / purchase_bill_items - the transactional ledger already carries
    its author ON the row (created_by since 0006, voided_by), is append-only (void,
    never delete), and is high-volume; a per-row trigger would double its writes for
    an author it already stores. A bill-level audit is a separate, later decision.
  * doc_no_counters - a server-owned sequence, no human action to attribute.
  * seller_code_reservations - a mint carries issued_by ON the row; a spend is part
    of a seller INSERT, which IS audited. The mechanism needs no second record.
  * server_clock_watermark - server-internal clock state, written by clock_guard
    with tenant_connection(None): no tenant, no actor, nothing to attribute.
  * failed_login_attempts - already an append-only security log; auditing it is
    circular, and its writer (the login path) has no principal.
  * alembic_version - Alembic bookkeeping, written by migrations only.
  * audit_log itself - a trigger on it would recurse.

THE TRIGGER MECHANISM, AND WHY A TRIGGER RATHER THAN HANDLER CODE
----------------------------------------------------------------
There is no service layer: ~40 handlers issue raw text(...) SQL. A hand-written
audit INSERT in each is a sweep that WILL miss one, and the one it misses is the one
that matters. A trigger cannot be forgotten. The cost is that a trigger does not
know WHO did the write - so the actor is carried into the transaction as a GUC, the
same shape app.tenant_id already uses (db.py, tenant_connection).

audit_capture() is SECURITY DEFINER (owner: recycle_owner). MEASURED on dev recycle
2026-09-02 inside a rolled-back transaction reproducing the production roles: as the
RLS-bound recycle_app, an INSERT and an UPDATE on a FORCE-RLS table each produced
exactly one audit row in a FORCE-RLS audit_log, read back under context - even
though recycle_app holds NO INSERT on audit_log. The write runs as the function
OWNER, so the ONLY way a row enters this table is through the trigger; recycle_app
can read its own tenant's log and can neither forge nor alter a row. SECURITY
INVOKER would run as recycle_app, which lacks INSERT here, so every audited write
would fail - which is the disproof scripts/prove_audit.py performs.

The GUCs are transaction state, not role state, so they are visible inside the
SECURITY DEFINER function. search_path is pinned to pg_catalog and audit_log is
schema-qualified: a SECURITY DEFINER function must not resolve objects through a
caller-influenced search_path.

THE ACTOR, AND FAIL-CLOSED WITH A DECLARED EXCEPTION
----------------------------------------------------
audit_capture() reads app.actor_id and app.actor_username. If app.actor_id is unset
it RAISES and the write is REFUSED - an audited write with no actor records NOTHING,
loudly, rather than an unattributable row. tenant_connection sets both GUCs from the
principal for every handler. Two writers legitimately have no human principal and
must DECLARE themselves rather than fall through: provision_shop.py (a shop's first
admin - there is no prior user) and seed_dev.py. Each passes the reserved SYSTEM
actor (db.SYSTEM_ACTOR_ID, all-zeros, and a system: username), so a forensic reader
sees at a glance that no person did the write. A migration that ever backfills an
audited table must do the same, or lift the trigger for its own transaction.

actor_user_id is the durable identity (ARCHITECTURE 4, point 4: the pair that names
a person is (tenant_id, user_id), never a username, which is per-tenant and mutable).
actor_username is a POINT-IN-TIME snapshot for readability - what the actor was
called when the write happened - deliberately frozen, so it stays legible after a
rename or a deactivation. NEITHER carries a foreign key: this is an independent
forensic record, and an FK could turn a record into a raise (the same reasoning 0016
gives for failed_login_attempts). tenant_id likewise carries no FK; it is the GUC
the write already ran under, which RLS proved matched the mutated row.

WHAT A ROW STORES
-----------------
The WHOLE row image, before and after, as jsonb: new_data on INSERT, old_data on
DELETE, both on UPDATE (ck_audit_log_images enforces exactly that shape per action).
Whole-row rather than a diff because a diff needs the rest of the row to read, and
because reconstructing any intermediate value from the log alone - the thing that
makes price history fall out of this - needs each step to be complete. Master-data
rows are narrow and low-volume, so the size is cheap. MONEY SURVIVES EXACTLY:
to_jsonb over NUMERIC(14,2) preserves the value and its scale (MEASURED: 12.30,
9.05, 100.00, 0.10 each read back byte-identical from new_data->>'price'); jsonb
stores numbers as numeric, not float, so hard rule 1 holds.

PASSWORD MATERIAL IS REDACTED. The log is readable (RLS-scoped) by a shop admin, and
users.password_hash is the only stored secret across the audited tables, so the
trigger drops that one key for the users table before writing. Explicit per table,
never a name denylist (a denylist misses an alias). prove_audit.py asserts the hash
bytes appear in no row, with the username as the presence sibling that proves the
search can fire - the same control 0016/prove_login_guard uses.

PRICE HISTORY (blueprint decision 7) - SATISFIED, NOT MERELY MITIGATED
----------------------------------------------------------------------
With product_prices audited, an overwrite is no longer a loss: every price a shop
has charged is a row in this log, before and after, with the admin who set it and
when. "What was product X's grade-B price on that day, and who changed it" is now
answerable from the log alone. A dedicated price_history table would record LESS
(one dimension, no author) and duplicate this, so it is deliberately NOT built.

RLS: THE STANDARD POLICY, keyed on the GUC the write ran under
-------------------------------------------------------------
ENABLE + FORCE + one tenant_isolation policy keyed on app.tenant_id, exactly as
0001 attaches to every tenant table. The row is born with tenant_id = the GUC, so
its own WITH CHECK is trivially satisfied; the USING half scopes reads to one shop.
FORCE binds the owner too, so a proof or migration that reads this table sees ZERO
rows until it sets a tenant context or reads as the superuser
(lessons/a-migration-reads-zero-under-force-rls.md) - MEASURED here: owner, no
context, read 0 of 4 rows that existed.

GRANTS: SELECT ONLY, AND THE REVOKE IS WHAT NARROWS
---------------------------------------------------
db/init/00_init_roles.sql runs ALTER DEFAULT PRIVILEGES ... GRANT SELECT, INSERT,
UPDATE, DELETE ON TABLES TO recycle_app, so recycle_app already holds all four on
this table before the lines below run (0008/0012/0016 measured that). The app needs
only SELECT (a future read endpoint, and the RLS proof); the trigger, running as the
owner, is the sole writer. So INSERT, UPDATE and DELETE are all revoked - stronger
than 0016, which keeps INSERT because its rows are written by the app directly.

reconcile.py IS TOUCHED BY THIS MIGRATION, and not optionally. S2 ("no table exists
that this checker does not know about") goes RED on the first run after this lands
and prints `table=audit_log  - add it to ALL_RLS_TABLES and give it checks`; the
repair is to add audit_log to TENANT_TABLES, SCOPE_SQL and SCOPE_COLUMN, done in this
same commit, plus a NEW check (S6) that every audited table still carries its trigger
- because a silently-dropped trigger is this design's worst failure and reconcile is
where production would notice it. audit_log's constraints and index are DELIBERATELY
NOT added to REQUIRED_CONSTRAINTS / REQUIRED_INDEXES, the same decision
0005/0006/0011/0012/0015/0016 recorded for theirs: prove_reconcile.py restores a COPY
from a dump, and a dump taken before 0017 has neither, so S5 would go red on such a
copy for a reason unrelated to money. Wake condition: a dump taken AFTER 0017
becoming the oldest one restored.

created_at USES now(), AND THAT IS SAFE HERE - the same argument 0016 makes: nothing
keyed is derived from it. It orders the log and bounds a forensic window; a wrong
clock mis-times a record, it does not corrupt a document sequence.

RETENTION: NOTHING DELETES ROWS YET, AND THAT IS RECORDED, NOT SOLVED
--------------------------------------------------------------------
Append-only and unbounded over time, but master-data writes are infrequent, so
growth is slow. This system has no scheduler (deliberately-not-built). A retention
position is owed and recorded in OPEN_ITEMS.md rather than invented here.

BACKUP / RESTORE: NOTHING TO REGISTER, AND THE TRIGGERS DO NOT FIRE ON RESTORE
-----------------------------------------------------------------------------
backup_db.py enumerates public relkind=r from the catalogue, so audit_log is dumped
and counted with no edit; restore_db.py compares the dump's own keys, so it picks it
up automatically. A plain pg_dump emits CREATE TRIGGER in the post-data section,
AFTER the COPY data, so on a restore the rows load before the triggers exist and no
audit row is manufactured for a restore (proven by prove_backup_restore.py running
green with the triggers present).

WHY THE DOWNGRADE DROPS ROWS, AND SAYS SO
-----------------------------------------
downgrade() drops the triggers, the function and the table. DROPPING THE TABLE LOSES
EVERY AUDIT ROW WRITTEN SINCE THE UPGRADE - the forensic history is gone. That is
acceptable only because a downgrade is a development action on a schema still being
shaped; it must never be run against a database whose log anyone relies on. No
refuse-if-rows guard (unlike 0012), because unlike a seller-code reservation an audit
row is not itself irrecoverable business state the way a live money row is - but the
loss is real and is named here so it is a decision, not a surprise.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0017"
down_revision: Union[str, None] = "0016"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The same predicate 0001 uses on every tenant table and master.py writes with, so
# the value an INSERT writes and the value the RLS policy tests are one expression.
_TENANT_MATCH = "NULLIF(current_setting('app.tenant_id', true), '')::uuid"

# The tables whose every write is recorded. One trigger per table, all bound to the
# one audit_capture() function. This list is the audited set; reconcile.py S6 reads
# the same set back out of pg_trigger and refuses a table that has lost its trigger.
_AUDITED_TABLES = (
    "uoms",
    "product_categories",
    "products",
    "product_prices",
    "sellers",
    "grade_tiers",
    "users",
    "tenants",
)

# ASCII ONLY and NO SINGLE QUOTES: these are interpolated through an f-string into a
# single-quoted SQL literal and read back out of the catalogue on a codepage-874 box
# without needing hex to be believed (0016 convention;
# lessons/console-is-not-the-observation.md).
_TABLE_COMMENT = (
    "Append-only record of every master-data write, written by the audit_capture "
    "trigger on 8 tables (uoms, product_categories, products, product_prices, "
    "sellers, grade_tiers, users, tenants), attributed to the actor the request "
    "carried in app.actor_id / app.actor_username. Stores the whole row image "
    "before and after (jsonb); money survives exactly. users.password_hash is "
    "redacted. APPEND-ONLY at the grant level: recycle_app holds SELECT only, the "
    "SECURITY DEFINER trigger (owner recycle_owner) is the sole writer. RLS+FORCE "
    "keyed on app.tenant_id. See migration 0017 and ARCHITECTURE D3."
)


def upgrade() -> None:
    # Each statement issued separately: asyncpg uses the extended query protocol,
    # which forbids multiple commands in one prepared statement (0001 convention).

    op.execute(
        """
        CREATE TABLE audit_log (
            id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            -- NO FK on tenant_id or the actor columns: this is an independent
            -- forensic record, and an FK could turn a record into a raise. See
            -- the docstring; the values were already validated by the write that
            -- produced the event.
            tenant_id      uuid        NOT NULL,
            table_name     text        NOT NULL,
            action         text        NOT NULL,
            actor_user_id  uuid        NOT NULL,
            actor_username text        NOT NULL,
            old_data       jsonb,
            new_data       jsonb,
            created_at     timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT ck_audit_log_action
                CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
            -- INSERT has no before-image, DELETE has no after-image, UPDATE has
            -- both. Refuse to store a shape that says otherwise.
            CONSTRAINT ck_audit_log_images CHECK (
                (action = 'INSERT' AND old_data IS NULL     AND new_data IS NOT NULL) OR
                (action = 'UPDATE' AND old_data IS NOT NULL AND new_data IS NOT NULL) OR
                (action = 'DELETE' AND old_data IS NOT NULL AND new_data IS NULL)
            )
        )
        """
    )

    # The forensic query: this shop's changes to this table over time. Leading
    # tenant_id (RLS also filters on it), then table_name, then created_at as the
    # range. Entity-level lookup filters the jsonb and is left unindexed until
    # volume warrants it (the retention decision owns that).
    op.execute(
        """
        CREATE INDEX ix_audit_log_tenant_table_time
            ON audit_log (tenant_id, table_name, created_at)
        """
    )

    op.execute(f"COMMENT ON TABLE audit_log IS '{_TABLE_COMMENT}'")

    # -------------------------------------------------------------- the function
    # SECURITY DEFINER: runs as the owner (recycle_owner), the sole writer of this
    # table. search_path pinned to pg_catalog and audit_log schema-qualified, so a
    # caller-influenced search_path cannot redirect the objects this resolves.
    # Dollar-quoted, so the single quotes inside are literal and need no escaping.
    #
    # DO NOT "SIMPLIFY" THIS TO SECURITY INVOKER. It is the flip side of
    # lessons/a-migration-reads-zero-under-force-rls.md and it is PROVEN load-bearing:
    # recycle_app holds NO INSERT on audit_log (only the owner writes it), so under
    # INVOKER the trigger would run as recycle_app and EVERY audited write would fail
    # with permission denied. scripts/prove_audit.py disproof Dc flips it on a scratch
    # and watches the price change break; reconcile.py S3/S6 also check prosecdef.
    # INVOKER is not a simpler equivalent -- it is a different, broken program.
    op.execute(
        """
        CREATE FUNCTION audit_capture() RETURNS trigger
            LANGUAGE plpgsql
            SECURITY DEFINER
            SET search_path = pg_catalog
        AS $fn$
        DECLARE
            v_tenant uuid := nullif(current_setting('app.tenant_id', true), '')::uuid;
            v_actor  uuid := nullif(current_setting('app.actor_id', true), '')::uuid;
            v_name   text := nullif(current_setting('app.actor_username', true), '');
            v_old    jsonb;
            v_new    jsonb;
        BEGIN
            -- FAIL CLOSED. A write to an audited table with no actor in context is
            -- refused, not recorded with a null author. A system writer declares
            -- itself by setting the reserved actor; see the docstring.
            IF v_actor IS NULL THEN
                RAISE EXCEPTION
                    'audit_capture: no actor in context (app.actor_id unset) for % on %',
                    TG_OP, TG_TABLE_NAME
                  USING HINT =
                    'open the connection with an actor; a system writer sets db.SYSTEM_ACTOR_ID';
            END IF;

            v_old := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
            v_new := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;

            -- Redact stored secrets. users.password_hash is the only one across the
            -- audited tables, and this log is admin-readable, so it must never carry
            -- a hash. Explicit per table, never a name denylist.
            IF TG_TABLE_NAME = 'users' THEN
                v_old := v_old - 'password_hash';
                v_new := v_new - 'password_hash';
            END IF;

            INSERT INTO public.audit_log
                (tenant_id, table_name, action,
                 actor_user_id, actor_username, old_data, new_data)
            VALUES (v_tenant, TG_TABLE_NAME, TG_OP,
                    v_actor, coalesce(v_name, ''), v_old, v_new);

            -- AFTER trigger: the return value is ignored.
            RETURN NULL;
        END
        $fn$
        """
    )

    # --------------------------------------------------------------- the triggers
    # AFTER, so the row is already whatever it will be (defaults filled, the write
    # committed to the row); FOR EACH ROW, so a multi-row statement logs each row.
    # DELETE is covered although no app route deletes any of these tables today
    # (measured: no DELETE anywhere in server/app), so a manual or future deletion
    # is recorded too.
    for table in _AUDITED_TABLES:
        op.execute(
            f"CREATE TRIGGER audit_capture"
            f" AFTER INSERT OR UPDATE OR DELETE ON {table}"
            f" FOR EACH ROW EXECUTE FUNCTION audit_capture()"
        )

    # -------------------------------------------------------------------- RLS
    # Enabled AFTER the CREATE and with no backfill to fight its own WITH CHECK
    # (lessons/a-migration-reads-zero-under-force-rls.md): this table is born empty.
    op.execute("ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE audit_log FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON audit_log "
        f"USING (tenant_id = {_TENANT_MATCH}) "
        f"WITH CHECK (tenant_id = {_TENANT_MATCH})"
    )

    # ----------------------------------------------------------------- grants
    # SELECT only. ALTER DEFAULT PRIVILEGES has already handed recycle_app all four,
    # so the GRANT is a no-op against that and the REVOKE is what makes append-only
    # (and write-only-via-trigger) a property of the privilege, not of anyone
    # remembering. The trigger writes as the owner, so the app never needs INSERT.
    op.execute("GRANT SELECT ON audit_log TO recycle_app")
    op.execute("REVOKE INSERT, UPDATE, DELETE ON audit_log FROM recycle_app")


def downgrade() -> None:
    # Drop the triggers first (they depend on the function), then the function, then
    # the table (its policy, index, comment and ACL die with it). DROPPING THE TABLE
    # LOSES EVERY AUDIT ROW - named in the docstring, not a surprise.
    for table in _AUDITED_TABLES:
        op.execute(f"DROP TRIGGER IF EXISTS audit_capture ON {table}")
    op.execute("DROP FUNCTION IF EXISTS audit_capture()")
    op.execute("DROP TABLE IF EXISTS audit_log")
