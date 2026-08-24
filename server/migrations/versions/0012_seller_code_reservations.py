r"""seller_code_reservations - one holder per seller code, for ever; and the
per-tenant target holding a device is topped up to

Revision ID: 0012
Revises: 0011
Create Date: 2026-08-24

WHY THIS RELATION EXISTS
------------------------
P1.8b lets a yard phone create a seller while offline. Under device-minted codes
two handsets in one shop draw from one namespace, collide days later, and a
settle-on-409 binds one device's local seller to a row somebody else created -
a wrong seller on a cash purchase. The owner's decision (ROADMAP S22) replaces
that with codes MINTED BY THE SERVER AND RESERVED TO A DEVICE before it goes
offline. This is the schema half of it.

THE INVARIANT THE WHOLE DESIGN RESTS ON IS *ONE HOLDER PER CODE PER TENANT*, so
the CODE is the key and nothing else is: PRIMARY KEY (tenant_id, code). A
relation keyed on the token with the code merely indexed admits two holders for
one code - the exact defect this work removes, written down as a schema - and it
passes every single-block test, because one block never collides with itself.

THERE IS NO SURROGATE `id`, AND THAT IS THE ONE PLACE THIS TABLE DEPARTS FROM
EVERY OTHER TABLE IN THIS SCHEMA. Every other relation carries
`id uuid PRIMARY KEY DEFAULT gen_random_uuid()`. Here the natural key IS the
thing being reserved, and a surrogate key would sit beside it as a second
identity nothing references - additional, unread, and available to be keyed on
by mistake. Nothing references a reservation by composite FK either, so there is
no uq_..._tenant_id pair to support.

TWO STATES, ONE TRANSITION, AND NO THIRD STATE
----------------------------------------------
`held`  - issued to a device, not yet used.
`spent` - a seller row exists that this reservation produced.

`held -> spent` happens ONLY inside the same statement that INSERTs the seller.
`spent -> anything` is forbidden: a spent reservation records that a real row
exists, which is hard rule 5's shape one table over.

A THIRD `void`/reclaimed state was weighed and REJECTED by the design, and the
rejection is the load-bearing part: it buys nothing, because nothing is ever
re-issued, and it costs a transition that can race a use - a handset offline for
a week would spend a code the shop had withdrawn. Two states have one
transition; three have four, and three of those exist only to be got wrong.

ck_reservations_spent_consistency IS THAT RULE MADE UNBREAKABLE RATHER THAN
MERELY ASSERTED. The design states as a RULE that nothing outside the seller
INSERT may write `spent`, and names the red: a reservation observed `spent` with
a null seller_id. A CHECK cannot see WHO wrote the row, but it can refuse the
STATE that a two-statement implementation leaves behind when the second
statement is lost. Same shape and same argument as ck_bills_void_consistency in
0001 and ck_clock_reset_consistency in 0008: the three void fields move
together, so the pair here moves together too. It forbids nothing the design
permits.

WHAT IT DOES NOT CATCH, said so the constraint is not read as wider than it is:
the OTHER half of that invariant - a `sellers` row whose code is reserved while
that reservation is still `held` - is a statement ACROSS two tables and no CHECK
can express it. That half is enforced by the create path writing both in one
statement, and it is queried by scripts/prove_seller_code_guards.py.

AN UNUSED RESERVED CODE LEAKS FOR EVER: NO RECLAIM, NO RE-ISSUE
---------------------------------------------------------------
This is the sharpest decision behind this table and it is taken deliberately
against the tidier alternative. RE-ISSUING A CODE TO A SECOND HOLDER RECREATES
THE ORIGINAL DEFECT EXACTLY: a device holding a stale reservation drains days
later, collides with a row it did not create, and settles onto another person's
seller. Every reclaim scheme has to defeat that race and none of them can defeat
a handset that is simply switched off.

THE COST, STATED RATHER THAN GLOSSED: gaps in the human-readable code sequence.
A shop whose phone is lost holding twenty codes has twenty gaps, and those gaps
are visible on the neighbours of a printed slip and nowhere else. A gap in a
sequence is not a defect; a wrong seller on a cash purchase is.

The consequence for THIS FILE is the DELETE grant below and the downgrade guard
at the bottom: a row here is a permanent record that a code was issued, and
removing one is what would let it be issued twice.

THE HOLDER IS A DEVICE, AND device_id CARRIES NO FOREIGN KEY
-------------------------------------------------------------
Not a tenant - a tenant-scoped pool is two handsets drawing from one set of
codes, which is the defect being removed. Not a user - the codes physically live
in ONE device's SQLite, so a person signing out on handset A and in on handset B
would leave the server believing B holds what A is carrying.

There is no `devices` relation and this migration does not create one. The
device identity is minted on the handset (a v4 uuid in SQLite, never the
keystore, because reserved codes must outlive a sign-out) and supplied by the
client, so there is nothing here for a FK to reference. THE BOUND THAT FOLLOWS
IS REAL AND IS NOT CLOSED HERE, and the design records it as a bound rather than
a stop: a caller inside the tenant can mint reservations under device
identities it invents, consuming the code space in blocks. Every such caller can
already create sellers one at a time. Recorded at
ROADMAP.md, inside P1.8, in the seller-kind criteria's findings subsection.

THE TOKEN IS THE WHOLE OF THE GUARD, AND IT GETS NO CHECK
----------------------------------------------------------
A create carrying the token is recognisable BY THE SERVER as the same create, so
a replay is answered with the row the first attempt produced - hard rule 4's
"already created", extended to POST /sellers by decision. That is what removes
settle-on-409 from the client design entirely, so the token's unguessability is
load bearing.

NO ck_ ON `token`, AND THE ABSENCE IS DELIBERATE. The property required is
ENTROPY, and no CHECK expresses entropy. A minimum-length CHECK would read as
coverage while admitting a 43-character counter - the shape
lessons/a-round-trip-must-agree-on-its-key-space.md warns about when it says an
exclusion-list entry "reads as coverage and changes no result". What the
database CAN state about it is a COMMENT, so it does, at the column.

Contrast 0009, which DID add this repository's first regex CHECK to
directory.shop_codes: that value is TYPED BY A HUMAN off a printed slip, so the
set of admissible strings is a property of the data. A reservation token is
never typed, never printed, and never read by a person.

ISSUED_AT USES now(), WHICH 0008 DISBELIEVES, AND THAT IS SAFE HERE
--------------------------------------------------------------------
0008 exists because doc_no_counters is keyed on (tenant_id, be_year), so a wrong
now() opens a counter for a year that has not happened and burns a legal
document number that can never be recovered. NOTHING is derived from issued_at:
no key, no sequence, no expiry. The design has no lease and no clock anywhere in
this mechanism, on purpose - a lease expiry would be a stored future instant,
and lessons/a-stored-future-instant-is-a-promise-about-a-clock.md is what that
costs. A wrong issued_at is a wrong note in a column nothing reads.

issued_by IS NOT NULL, WHERE sellers.created_by IS NULLABLE
------------------------------------------------------------
0011 could not make its column NOT NULL: sellers already existed with no author
and any uuid a DEFAULT could name is a REAL PERSON, so a backfill would put
somebody's name on rows they never created. THIS TABLE IS NEW AND EMPTY. Every
row it will ever hold is written by an authenticated route, so there is no true
value missing from any row and NOT NULL is available. It is also stronger: with
NOT NULL the MATCH SIMPLE composite FK is checked on every row rather than
skipped.

COMPOSITE FOREIGN KEYS, NEVER PLAIN ONES - 0001's rule, unchanged. A plain
seller_id -> sellers (id) would not stop a reservation in shop X naming a seller
in shop Y. FOREIGN KEY (tenant_id, seller_id) makes that impossible at the
constraint level, and referential-integrity checks in Postgres bypass RLS, so
the guarantee holds whatever the session's tenant context is.

seller_id IS NULLABLE and its FK is therefore MATCH SIMPLE - simply not checked
while the reservation is `held`. That is what makes the nullable column and the
composite FK coherent, and it is the same mechanic 0001 documents for voided_by,
0006 for bills.created_by and 0011 for sellers.created_by.

ONE INDEX, AND IT IS ON THE OTHER SIDE OF 0011's LINE
------------------------------------------------------
0011 added NO index and gave the reason: nothing queries sellers BY author, so
an index would be a write cost on a create path paid to speed up a query no code
makes. Add one when something reads it, not before.

SOMETHING READS THIS ONE, ON A CADENCE. The top-up route computes the shortfall
as `target - (reservations currently held by this device)`, and the design puts
that on EVERY SYNC PASS while online - not on a threshold, not on exhaustion.
The predicate is (tenant_id, device_id) WHERE state = 'held'. The table grows by
roughly one row per seller ever created and nothing is ever deleted, so the scan
it replaces grows without bound while the answer stays about twenty rows. It is
PARTIAL for that reason: only `held` rows are ever asked for, so the index holds
a device's live holding and not the shop's history.

NEITHER THIS INDEX NOR ANY CONSTRAINT ON THIS TABLE GOES INTO reconcile.py's
REQUIRED_INDEXES / REQUIRED_CONSTRAINTS, for the reason 0005, 0006 and 0011 each
recorded for theirs. The decision and its wake condition live ONCE, in
scripts/reconcile.py beside the TENANT_TABLES entry this migration forces, rather
than in two files that can drift. What belongs HERE is only the property of the
index itself: nothing in reconcile.py leans on it, it is performance alone, and
an index cannot change what a query ANSWERS.

reconcile.py IS TOUCHED BY THIS MIGRATION, and not optionally. S2 -- "no table
exists that this checker does not know about" -- goes RED on the first run after
this lands and prints `table=seller_code_reservations - add it to
ALL_RLS_TABLES and give it checks`. MEASURED 2026-08-24 on the dev database:
exactly one violation, S2, with S1, S3, S4, S5, B1 and all 68 per-tenant checks
still green. That red is the checker working as designed, and the repair is the
one its own row prescribes.

GRANTS: THE REVOKE IS THE LINE THAT DOES THE WORK
--------------------------------------------------
db/init/00_init_roles.sql runs ALTER DEFAULT PRIVILEGES FOR ROLE recycle_owner
IN SCHEMA public, which hands recycle_app arwd on every table created afterwards
- this one included, before the GRANT below runs. 0008 measured exactly that and
recorded that a narrow GRANT does not produce a narrow grant. So the GRANT here
is written for the reader and the REVOKE is what narrows.

NO DELETE. Nothing in this system ever removes a reservation. A row is the
permanent record that a code was issued to a device, and it is what stops the
same code being issued to a second holder; deleting one re-opens the defect the
whole relation exists to close, silently, with no constraint left to refuse it.
This is hard rule 5's argument applied one table over - the row is not a
transaction, but removing it makes a transaction possible that must not be.

SELECT, INSERT and UPDATE are all needed: the route reads the holding, writes a
block, and the create path moves one row `held -> spent`.

COLUMN-LEVEL UPDATE GRANTS WERE WEIGHED AND ARE NOT TAKEN.
`GRANT UPDATE (state, seller_id)` would stop the application changing a code,
a token or a holder at the privilege level. It is refused for two reasons, both
about this schema rather than about the idea: there is no column-level grant
anywhere in this database today, so it would introduce a mechanism whose absence
elsewhere then reads as an oversight; and it does not reach the transition that
actually matters - it would still permit `spent -> held`. Recorded as the
alternative that was weighed, so a later reader does not rediscover it.

RLS: THE STANDARD POLICY, NO EXCEPTION CLAIMED
-----------------------------------------------
Unlike 0008 (no tenant_id at all) and 0009 (tenant_id but no policy, forced by
circularity), this relation is ordinary business data inside the isolation
model. ENABLE + FORCE + one policy keyed on the app.tenant_id GUC, exactly as
0001 attaches to every other tenant table. It is read and written only by
requests that already know their tenant.

tenants.seller_code_target_holding - THE ONE NUMBER NO MEASUREMENT SUPPORTS
---------------------------------------------------------------------------
How many codes a device holds is a PER-TENANT value read from the tenant row and
never a constant (ROADMAP S16 puts a per-tenant value in a column of its own
with its own CHECK rather than in a settings bag; S17 says the column arrives
with the feature that needs it).

THE VALUE 20 IS AN ASSUMPTION AND IS LABELLED AS ONE RATHER THAN ARGUED. The
right target is a function of the walk-in rate and the longest offline stretch,
and this repository measures neither. Twenty is a day's walk-ins at a yard busy
enough to matter and small enough that the gaps from a lost handset are
unremarkable. The COLUMN is what makes it changeable without a release; the
NUMBER is a guess, and it belongs in
PROJECT_STATUS.md, "Tuned constants - trial ledger", at trial 1.

NOT NULL WITH A DEFAULT, where 0010's default_grade is nullable-on-purpose. The
two mean different things. A NULL default_grade means "this shop has not
decided", which is a real and correct state that changes nothing. A NULL target
holding would mean the refill has no number to top up to - not a decision, a
hole. Every INSERT INTO tenants in this repository names its columns explicitly
(app, both proof scripts, seed_dev.py, provision_shop.py: measured 2026-08-24),
so a new column with a default reaches all of them without an edit, and a
nullable column with no default is safe on a live table for the reason 0011
gives - with no default there is no value to write, so Postgres records the
column in the catalogue and rewrites nothing. A CONSTANT default is written into
existing rows in PostgreSQL 11+ without a rewrite either.

A FLOOR OF 1 AND NO CEILING. The floor is the design's, and it is what stops a
target of zero making offline creation permanently impossible while every screen
reports a healthy device. NO upper bound is added, for two reasons: the design
names none, so any number here would be a second unmeasured constant; and no
route in this phase writes this column at all, so the only writer is an operator
with SQL, who is not the caller a bound would be protecting anything from.

WHAT THIS MIGRATION DOES NOT DO
-------------------------------
* No route. app/master.py adds the top-up route in the same commit; the schema
  is separate so a schema audit reads one file.
* No devices table, no device authentication. See device_id above.
* No admin surface for reservations. With nothing re-issued there is nothing to
  administer.
* No reclaim, no expiry, no clock. See the no-reclaim section.
* Nothing retroactive. Every seller that already exists keeps its code and is
  named by no reservation, which is the truth about it.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Reusable predicate for the RLS policy. The same expression 0001 uses on every
# other tenant table, and the same one master.py's _TENANT writes with -- so the
# value an INSERT writes and the value the policy tests are one thing.
_TENANT_MATCH = "NULLIF(current_setting('app.tenant_id', true), '')::uuid"

# ASCII ONLY, no apostrophes, and NO BRACES: these strings are embedded in SQL
# literals through an f-string, and they are meant to be read back out of the
# catalogue on a codepage-874 box without needing hex to be believed
# (cf. lessons/console-is-not-the-observation.md). A brace here would be
# interpolated away and never reach the database. Convention established by 0006
# and used by 0009 and 0011.
_TABLE_COMMENT = (
    "A seller CODE reserved to one DEVICE so that device can create a seller "
    "while offline. ONE HOLDER PER CODE PER TENANT, FOR EVER: the primary key "
    "is (tenant_id, code) because the code is the thing being reserved. "
    "NOTHING IS EVER RECLAIMED AND NOTHING IS EVER RE-ISSUED - a code held by "
    "a handset that never comes back leaks, and the cost is a gap in the "
    "printed sequence. Re-issuing it to a second holder recreates the defect "
    "this relation exists to remove: a device that has been offline for a week "
    "drains, collides with a row it did not create, and binds its local seller "
    "to another person. THAT IS WHY THERE IS NO DELETE GRANT and why a "
    "downgrade refuses once any row exists. See migration 0012."
)

_CODE_COMMENT = (
    "The reserved seller code, and the KEY. It is the same namespace as "
    "sellers.code within a tenant, so a code appearing here must not be "
    "written into sellers by any path except the create that spends this "
    "reservation. Two server rules enforce that and neither is a constraint: "
    "POST /sellers refuses a SUPPLIED code that is currently held, and the "
    "code assigner derives its candidate above BOTH tables. A future writer "
    "that mints an assigned-shape code without doing both re-opens the hole."
)

_TOKEN_COMMENT = (
    "An opaque server-minted secret naming this reservation, and the whole of "
    "the guard on it. A create carrying it is recognised as the SAME create, "
    "so a replay after a lost response is answered with the row the first "
    "attempt produced instead of a second seller for one person. IT MUST COME "
    "FROM A CSPRNG and must never be derived from anything the caller sent, "
    "from the code, or from a counter. THERE IS NO CHECK CONSTRAINT ON THIS "
    "COLUMN AND THAT IS DELIBERATE: the property required is entropy, no CHECK "
    "expresses entropy, and a minimum-length CHECK would read as coverage "
    "while admitting a 43-character counter."
)

_DEVICE_COMMENT = (
    "The handset holding this code, as a uuid minted ON THE DEVICE and stored "
    "in its SQLite - never in the keystore, because a sign-out deletes the "
    "keystore entry and reserved codes must outlive a sign-out. NO FOREIGN "
    "KEY: there is no devices relation and this system does not authenticate a "
    "device. A caller inside the tenant can therefore mint reservations under "
    "identities it invents, consuming the code space in blocks. That is a "
    "known BOUND, not an oversight - every such caller can already create "
    "sellers one at a time - and it is recorded in ROADMAP under P1.8."
)

_STATE_COMMENT = (
    "held or spent, and there is no third value. held -> spent happens ONLY "
    "inside the same statement that INSERTs the seller. spent -> anything is "
    "forbidden: a spent reservation records that a real row exists. A "
    "reclaimed state was weighed and rejected because nothing is ever "
    "re-issued, so it buys nothing and costs a transition that can race a use."
)

_SELLER_ID_COMMENT = (
    "The seller this reservation produced, NULL while it is held. Kept "
    "consistent with state by ck_reservations_spent_consistency, so a spent "
    "reservation always names a row and a held one never does. That CHECK "
    "cannot see the other half of the same invariant - a sellers row whose "
    "code is reserved while the reservation is still held - because it spans "
    "two tables."
)

_TARGET_HOLDING_COMMENT = (
    "How many reserved seller codes a device in this shop is topped up to on "
    "every sync pass while online. THE DEFAULT 20 IS AN ASSUMPTION, NOT A "
    "MEASUREMENT: the right value is a function of the walk-in rate and the "
    "longest offline stretch, and neither is measured anywhere in this system "
    "yet. This column exists so the number can change without a release. Floor "
    "of 1, enforced: a target of zero would make offline seller creation "
    "permanently impossible while every screen reported a healthy device. No "
    "ceiling, because no route writes this column - only an operator with SQL."
)


def upgrade() -> None:
    # Each statement issued separately: asyncpg uses the extended query
    # protocol, which forbids multiple commands in a single prepared statement.
    # Convention from 0001 and 0009.
    #
    # NOT AN f-STRING. Nothing here needs interpolation, and the CHECK below
    # carries no braces today -- but 0009 shipped a note that a `{8}` quantifier
    # under an f prefix renders as the integer 8 with no error raised anywhere,
    # so the default for a DDL block in this repository is a plain string.
    op.execute(
        """
        CREATE TABLE seller_code_reservations (
            tenant_id uuid        NOT NULL REFERENCES tenants (id),
            code      text        NOT NULL,
            device_id uuid        NOT NULL,
            token     text        NOT NULL,
            state     text        NOT NULL,
            issued_at timestamptz NOT NULL DEFAULT now(),
            issued_by uuid        NOT NULL,
            seller_id uuid,
            PRIMARY KEY (tenant_id, code),
            -- NAMED, not written inline. An inline CHECK gets the name Postgres
            -- derives (seller_code_reservations_state_check), and a constraint a
            -- refusal may have to be attributed to should carry a name this
            -- project chose. ck_sellers_grade in 0003 and ck_tenants_default_grade
            -- in 0010 are the same kind of membership CHECK under the same
            -- convention; 0001's inline ones predate it.
            CONSTRAINT ck_reservations_state
                CHECK (state IN ('held', 'spent')),
            CONSTRAINT uq_reservations_tenant_token UNIQUE (tenant_id, token),
            CONSTRAINT fk_reservations_issued_by
                FOREIGN KEY (tenant_id, issued_by)
                REFERENCES users (tenant_id, id),
            CONSTRAINT fk_reservations_seller
                FOREIGN KEY (tenant_id, seller_id)
                REFERENCES sellers (tenant_id, id),
            -- The two columns move TOGETHER, the shape ck_bills_void_consistency
            -- already has. It refuses the state a two-statement create leaves
            -- behind when the second statement is lost: a code used and still
            -- held, which a later replay would spend AGAIN.
            CONSTRAINT ck_reservations_spent_consistency
                CHECK ((state = 'spent') = (seller_id IS NOT NULL))
        )
        """
    )

    # PARTIAL, on the only predicate anything asks for on a cadence. See the
    # docstring for why this migration adds an index where 0011 refused one.
    op.execute(
        """
        CREATE INDEX ix_reservations_device_held
            ON seller_code_reservations (tenant_id, device_id)
            WHERE state = 'held'
        """
    )

    # The bounds this relation depends on, written where \d+ shows them. 0006's
    # reason, unchanged: this file is not in the database, and whoever runs \d+
    # on this table in two years will not have this migration open. That reader
    # is exactly the one who would otherwise add a reclaim path.
    op.execute(
        f"COMMENT ON TABLE seller_code_reservations IS '{_TABLE_COMMENT}'"
    )
    op.execute(
        f"COMMENT ON COLUMN seller_code_reservations.code IS '{_CODE_COMMENT}'"
    )
    op.execute(
        f"COMMENT ON COLUMN seller_code_reservations.token IS '{_TOKEN_COMMENT}'"
    )
    op.execute(
        "COMMENT ON COLUMN seller_code_reservations.device_id IS"
        f" '{_DEVICE_COMMENT}'"
    )
    op.execute(
        f"COMMENT ON COLUMN seller_code_reservations.state IS '{_STATE_COMMENT}'"
    )
    op.execute(
        "COMMENT ON COLUMN seller_code_reservations.seller_id IS"
        f" '{_SELLER_ID_COMMENT}'"
    )

    # -------------------------------------------------------------------- RLS
    # Ordinary business data inside the isolation model: no exception is claimed
    # here, unlike 0008 (no tenant_id) and 0009 (tenant_id, no policy). FORCE
    # makes even the table owner obey it.
    op.execute("ALTER TABLE seller_code_reservations ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE seller_code_reservations FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON seller_code_reservations "
        f"USING (tenant_id = {_TENANT_MATCH}) "
        f"WITH CHECK (tenant_id = {_TENANT_MATCH})"
    )

    # ----------------------------------------------------------------- grants
    # Written for the reader; the REVOKE below is what actually narrows. 0008
    # measured that ALTER DEFAULT PRIVILEGES in db/init/00_init_roles.sql has
    # already handed recycle_app arwd on this table before either line runs.
    op.execute(
        "GRANT SELECT, INSERT, UPDATE ON seller_code_reservations TO recycle_app"
    )
    # THE LINE THAT DOES THE WORK. A reservation row is the permanent record
    # that a code was issued; removing one is what would let the same code be
    # issued to a second holder. Same remedy 0001 used for alembic_version and
    # 0008 for server_clock_watermark.
    op.execute("REVOKE DELETE ON seller_code_reservations FROM recycle_app")

    # ------------------------------------------- tenants.seller_code_target_holding
    # NOT NULL with a constant DEFAULT: safe on a live table in PostgreSQL 11+,
    # which records the default in the catalogue instead of rewriting the heap.
    op.execute(
        "ALTER TABLE tenants ADD COLUMN seller_code_target_holding integer"
        " NOT NULL DEFAULT 20"
    )
    op.execute(
        "ALTER TABLE tenants ADD CONSTRAINT ck_tenants_seller_code_target_holding"
        " CHECK (seller_code_target_holding >= 1)"
    )
    op.execute(
        "COMMENT ON COLUMN tenants.seller_code_target_holding IS"
        f" '{_TARGET_HOLDING_COMMENT}'"
    )


def downgrade() -> None:
    # REFUSE IF ANY CODE HAS BEEN RESERVED, the shape 0009 established for
    # directory.shop_codes and for the same reason one level in: dropping this
    # table destroys the record of which codes are out on which handsets, and a
    # re-upgrade then mints from a maximum that no longer sees them. A device
    # still holding one of those codes drains days later onto a row somebody
    # else created -- which is the whole defect this relation removes.
    #
    # to_regclass returns NULL rather than raising when the relation is absent,
    # so this is safe on a database where upgrade() never ran.
    bind = op.get_bind()
    if bind.exec_driver_sql(
        "SELECT to_regclass('public.seller_code_reservations')"
    ).scalar() is not None:
        held = bind.exec_driver_sql(
            "SELECT count(*) FROM seller_code_reservations"
        ).scalar()
        if held:
            raise RuntimeError(
                f"REFUSING to downgrade 0012: seller_code_reservations holds"
                f" {held} reservation(s).\n"
                "\n"
                "WHY THAT IS NOT RECOVERABLE: each row is a seller code issued"
                " to a handset, and some of those handsets are offline holding"
                " codes right now. With this table gone the code assigner"
                " derives its next candidate from `sellers` alone, cannot see"
                " them, and will mint one of them for somebody at the counter."
                " When the handset comes back it collides with a row it did not"
                " create. That is two sellers sharing one code, which is the"
                " harm this relation exists to prevent.\n"
                "\n"
                "REMEDY: if these reservations are genuinely finished with --"
                " every device that held one has drained or is gone for good --"
                " remove them deliberately and then downgrade:\n"
                "    DELETE FROM seller_code_reservations;\n"
            )

    # Reverse order of upgrade(). No REVOKE statements and no COMMENT drops:
    # ACLs and comments are attributes OF the objects dropped here and die with
    # them -- the same shape as the absent COMMENT ON drops in 0006, 0009 and
    # 0011. The index dies with the table for the same reason.
    op.execute(
        "ALTER TABLE tenants DROP CONSTRAINT IF EXISTS"
        " ck_tenants_seller_code_target_holding"
    )
    op.execute(
        "ALTER TABLE tenants DROP COLUMN IF EXISTS seller_code_target_holding"
    )
    op.execute("DROP TABLE IF EXISTS seller_code_reservations")
