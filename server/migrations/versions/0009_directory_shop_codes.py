r"""directory.shop_codes - the tenant lookup that runs BEFORE anyone is authenticated

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-09

WHY THIS RELATION EXISTS
------------------------
POST /auth/login takes a tenant_id today. app/main.py:125 opens the connection
from body.tenant_id, a raw uuid the caller must already be holding, and the
comment at app/main.py:156-159 names the step that removes it: "the step that
replaces the uuid with something a human can type". This is the schema half of
that step - an eight-character code a person reads off a printed slip and types
into a handset, and the tenant it resolves to.

NOTHING READS THIS RELATION YET. No endpoint resolves a code, no client sends
one, and this migration adds no code path of any kind: it creates the schema and
the table, grants the reader role, and stops. The lookup is a separate change.

THE CODE IS MEANT TO BE IMMUTABLE ONCE ISSUED, AND NOTHING HERE ENFORCES THAT.
A code lives on printed slips this system will never see again, so reissuing one
is not a rename, it is two shops sharing an identifier across time. Enforcing it
would need a BEFORE UPDATE trigger, and this database has no USER-DEFINED
trigger anywhere - measured: schema public carries 68 triggers and every one of
them is tgisinternal, the row-level referential-integrity triggers Postgres
creates for the composite foreign keys. 0008 declined to add the first
user-defined one for its own forward-only property, for the same reason. What
the database DOES enforce is that a code names at most one tenant
and a tenant has at most one code - the primary key and uq_shop_code between
them.

HARD RULE 2's SECOND HALF IS EXCEPTED HERE, NOT ITS FIRST
---------------------------------------------------------
Hard rule 2 is two claims: every business-data table carries tenant_id, and
every query filters by it. THIS RELATION CARRIES tenant_id - it is the primary
key. What it does NOT have is a query that filters by one, and it carries no RLS
policy at all.

That is a sharper exception than 0008's, and which half is being excepted is
worth stating. 0008 excepted the FIRST half: server_clock_watermark has no
tenant_id because a shop does not have a clock; the column is meaningless there.
Here the column is present and load-bearing. The isolation MECHANISM is what is
absent.

IT IS FORCED BY CIRCULARITY, NOT CHOSEN. The question this relation answers is
"which tenant?". A tenant-filtered directory could only be read by a caller who
already knows the answer, so an RLS policy keyed on app.tenant_id would make the
lookup readable exactly when it is useless - and, with no context set, fail
closed to zero rows on every legitimate read. Same shape as 0008's startup
guard, arriving from the other side: there the tenant context does not exist
yet, here the tenant context IS the result.

ISOLATION HERE IS A GRANT, NOT A POLICY
---------------------------------------
recycle_directory has NO USAGE on schema public.
db/init/00_init_roles.sql:109-117 says so, and says it is the point of the role,
so this reader cannot reach tenants, users, purchase_bills or any other business
table BY ANY PATH: not through a schema-qualified name, not through a view, not
by accident. IT CAN READ NO ROW OF ANY SHOP'S DATA, and that is the
load-bearing half.

THE OTHER HALF, STATED SO THIS ROLE IS NOT READ AS NARROWER THAN IT IS. The two
grants in upgrade() are NOT its entire world. It also holds CONNECT on the
database (db/init/00_init_roles.sql) and USAGE on pg_catalog and
information_schema, which every role has through PUBLIC - MEASURED: nspacl on
both is `postgres=UC/postgres,=U/postgres`, where the `=U/` entry IS the PUBLIC
grant, against schema public, whose nspacl carries no PUBLIC entry at all
because 00_init_roles.sql revokes it. So this role CAN enumerate every table
name, every column name and every RLS policy EXPRESSION in schema public. It
learns the SHAPE of the database and none of its CONTENTS - a smaller thing
than reading rows, and a larger thing than nothing. Anyone deciding what else
to grant this role needs the true baseline and not the flattering one.

The containment is therefore at the SCHEMA boundary rather than the row
boundary, and it excludes by DEFAULT rather than by a REVOKE somebody has to
remember on every future table. What a caller of this lookup can learn is
bounded by what this relation CONTAINS - which is why the prohibition below is
the price of the exception, not a tidiness preference.

THE COST, AND EVERY CHECKER THAT IS NOT UPDATED
-----------------------------------------------
This is the first relation in this database outside schema public. Three debts
follow, none of them paid here, each recorded with its MECHANISM rather than its
intention - a debt named vaguely is not findable later.

(a) scripts/reconcile.py IS NOT UPDATED, AND ADDING A NAME TO ITS EXCLUSION
LISTS WOULD DO NOTHING. S1 and S2 are bounded by a `nspname = 'public'`
predicate, NOT by their exclusion lists. The shared `present` query
(reconcile.py:809) and S1's own query (reconcile.py:818) each carry that
predicate, and S2 (reconcile.py:837) filters `present`, so a relation in another
schema is never enumerated in the first place and can never be reported as
unknown. There is nothing for `NOT IN ('alembic_version', ...)` to exclude, and
an entry added there would read as coverage while changing no result.

Seven sites carry the same public-only bound: 809 and 818 above; S3 at 851, 855
and 857; S5 at 903 (pg_constraint) and 905 (pg_indexes). So S5 cannot see
uq_shop_code or ck_shop_code either, and could not be asked to.

Owed as a SEPARATE change, together with a CANNOT_SEE entry. 0008 set that
precedent (its lines 56-59): the boundary of a check belongs in the check's own
output, and not only in a migration docstring nobody runs.

(b) scripts/restore_db.py WILL REPORT A FALSE FAILURE ON THE NEXT RESTORE, and
that is a live consequence rather than a tidiness one. backup_db.py:436-440
takes the body with no --schema flag, so pg_dump writes a
`COPY directory.shop_codes ... FROM stdin;` block. copy_block_counts
(backup_db.py:329-362) strips only a `public.` prefix - backup_db.py:351-352 -
so the block is recorded in the manifest under the key `directory.shop_codes`.
restore_db.py:299 reads that manifest back as `expected`, builds `counts` from
schema public alone (restore_db.py:300-314), and the comparison at
restore_db.py:316-319 walks the UNION of the two key sets: the directory key is
present on one side and absent on the other, so want != got, the name lands in
`bad`, and restore_db.py:324 fails a restore that was byte-correct. It fails
whether or not the relation holds a single row.

NOT FIXED HERE. Owed with (a), and owed BEFORE anyone trusts the next backup -
this is a checker that goes red on a good restore, which is the failure mode
that teaches an operator to stop reading it.

(c) NOTHING ENFORCES THE LINK BETWEEN THIS SCHEMA'S NAME AND THE READER ROLE'S
search_path. db/init/00_init_roles.sql:87 runs
`ALTER ROLE recycle_directory SET search_path = directory`, and the comment
above it (that file, line 76) says in capitals that the name must match the
schema migration 0009 creates. That is a comment on one side and a bootstrap
statement on the other. Renaming either leaves the other silently pointing
nowhere, and the observed failure is `relation "..." does not exist` naming no
schema, no permission and no migration - recorded at that file's lines 78-86.

Enforcement belongs in reconcile.py's S4, which today selects rolname, rolsuper
and rolbypassrls only (reconcile.py:886-888), does not read rolconfig at all,
and does not name recycle_directory among the roles it checks.

NO SHOP DATA MAY EVER BE ADDED TO THIS RELATION
----------------------------------------------
Two columns, and that is the entire design: tenant_id and code. No created_at,
no name, no anything else.

THE REASON IS A SECURITY PROPERTY, NOT TIDINESS. Every column here is readable
through a path that runs BEFORE ANY PRINCIPAL EXISTS - that is what the relation
is for, and it is why the reader needs no credential belonging to any shop. So a
`name` column would make every shop's trading name enumerable to anyone who can
reach the lookup, and a `created_at` would date every shop's onboarding to the
same audience. A code that resolves to a uuid tells an outsider nothing they did
not already type at it; a code that resolves to a shop's name tells them who
they just found.

It is the same prohibition 0008 wrote, for the mirrored reason. There, nothing
TENANT-SCOPED may be added, because the table sits outside the isolation model.
Here, nothing about the SHOP may be added, because the relation sits outside
authentication. In both cases the prohibition is what makes the exception
acceptable at all.

BOTH PROHIBITIONS ARE COMMENT ON - THE THIRD USE OF 0006's CONVENTION
---------------------------------------------------------------------
Accepted for the reason 0006 gave and 0007 repeated: a bound that only exists in
prose outside the database is a bound the database cannot state about itself,
and the person running \d+ on this table in two years will not have this file
open. That reader is exactly the one who would otherwise add a `name` column.

So both prohibitions above are written INTO the schema - the no-shop-data rule
as a COMMENT ON TABLE, the immutable-once-issued rule as a COMMENT ON COLUMN on
`code`. Neither is enforced by anything; a comment cannot refuse a statement.
What it can do is be present at the moment somebody is deciding, which is more
than a migration docstring manages. Both are ASCII-only for 0006's reason - this
box is codepage 874, and a comment read back through a console must not need hex
to be trusted (cf. lessons/console-is-not-the-observation.md).

DOWNGRADE REFUSES ONCE A CODE HAS BEEN ISSUED
----------------------------------------------
Dropping this table drops uq_shop_code with it, so a downgrade followed by a
re-upgrade can hand an already-printed code to a DIFFERENT shop. That is the
harm named at the top of this docstring, arriving through the reverse path. So
downgrade() counts the rows first and refuses if there are any, naming how many
it found and how to proceed deliberately. An empty table downgrades silently,
which is the only case where nothing is lost.

THE FIRST REGEX IN THIS REPOSITORY'S DDL
----------------------------------------
Measured over migrations 0001-0008: 20 CHECK constraint expressions, zero
regexes. Not because a regex was ever rejected - no column before this one had a
SHAPE to constrain. Every existing CHECK is a membership (grade IN 'A'..'D'), a
bound (price >= 0, line_no > 0, token_version >= 1), an arithmetic identity
(net_weight = gross_weight - tare_weight), or a multi-column consistency rule
(ck_bills_void_consistency, ck_clock_reset_consistency).

A deliberate new convention, announced the way 0006 announced the first
COMMENT ON, and accepted for one reason: this value is TYPED BY A HUMAN off a
printed slip, so the set of strings that may enter the column is a property of
the data and not of whichever client happens to be validating this month. A
check that lives only in a client has to be re-implemented, identically, in
every client that ever accepts a code - and the first one that gets it wrong
writes a row nothing downstream can distinguish from a good one.

THE ANCHORS ARE WHY THERE IS NO char_length CONJUNCT
----------------------------------------------------
`^...{8}$` bounds the length by itself here, and that is a MEASURED property of
this engine, not a general fact about regexes. Run on this cluster,
PostgreSQL 16.14:

    'ABCDEFGH'    ~ '^[A-HJKMNP-Z2-9]{8}$'  -> t
    E'ABCDEFGH\n' ~ '^[A-HJKMNP-Z2-9]{8}$'  -> f
    'abcdefgh'    ~ '^[A-HJKMNP-Z2-9]{8}$'  -> f
    'ABCDEFGO'    ~ '^[A-HJKMNP-Z2-9]{8}$'  -> f
    'bcdefghJ'    ~ '^[A-HJKMNP-Z2-9]{8}$'  -> f

The SECOND row is the one this section exists for. `$` does NOT match before a
trailing newline in Postgres, so 'ABCDEFGH\n' is REFUSED, and a
`char_length(code) = 8` conjunct would forbid nothing the anchors already
forbid. Without that row written down, the missing conjunct reads as an
oversight and the next reader adds it.

THE FIFTH ROW IS THERE BECAUSE THE FIRST FOUR DO NOT ESTABLISH WHAT THEY LOOK
LIKE THEY ESTABLISH. A bracket range in a POSIX class can be read two ways -
by code point, or by the collation's sort order - and this database is
en_US.utf8, not C (measured: datcollate on `recycle`). Under a collation-ordered
reading, `A-H` would also admit b through h, so a range bug of exactly that
shape would let a lowercase code in. Row three cannot rule it out: 'abcdefgh'
starts with 'a', which falls outside `A-H` under EITHER reading, so it is
refused either way and discriminates nothing. Row five starts with 'b' - inside
the a-h span, and still REFUSED. That is what rules the collation-ordered
reading out, and it is the only row here that does.

IT IS NOT A PORTABLE ASSUMPTION, and the difference runs in the dangerous
direction. Several engines - Python's `re` among them, measured while writing
this file - DO match `$` before a final newline, so the identical pattern in a
client would ACCEPT the string this column refuses. Whoever writes the
client-side check measures their own engine; they do not copy this line.

THE ALPHABET IS 31 CHARACTERS, NOT 36
-------------------------------------
[A-HJKMNP-Z2-9] admits 31 of the 95 printable ASCII characters, measured over
all 95: A-Z and 0-9 minus exactly five - O, 0, I, 1 and L. In order, the set is

    23456789ABCDEFGHJKMNPQRSTUVWXYZ

Those five are the confusables a human misreads off a printed thermal slip,
which is the medium this code has to survive. The cost is real and is paid
once: 31^8 = 852,891,037,441 codes against 36^8 = 2,821,109,907,456, so about
30 percent of the unfiltered keyspace remains. What it buys is that no support
call ever turns on whether a character was an I or a 1, and no code ever needs a
human to be told which.

NO REVOKE HERE, AND THAT IS THE INVERSE OF 0008's SITUATION
-----------------------------------------------------------
0008 found (its lines 72-78) that writing a narrow GRANT does not produce a
narrow grant: db/init/00_init_roles.sql:106-107 runs ALTER DEFAULT PRIVILEGES
FOR ROLE recycle_owner IN SCHEMA public, so recycle_app had already been handed
arwd on the new table before that migration's GRANT ran, and only a REVOKE
narrowed it.

The same statement is the reason there is nothing to take back here. It is
scoped `IN SCHEMA public` - it is the only ALTER DEFAULT PRIVILEGES statement in
this repository, so pg_default_acl holds exactly that one row - and NOTHING is
auto-granted in schema directory: not to recycle_app, not to recycle_directory,
not to PUBLIC. The two GRANTs in upgrade() are the entire privilege state of
this schema.

recycle_app gets nothing here, and it is not refused by a REVOKE - it is simply
never given anything, and a REVOKE would have nothing to subtract
(cf. lessons/revoke-in-migration.md - there is genuinely nothing to revoke here,
which is not the same as forgetting).

THIS MIGRATION READS ONCE, WHERE EIGHT BEFORE IT NEVER READ AT ALL
------------------------------------------------------------------
No migration 0001-0008 executes a SELECT or asserts anything about what it just
wrote. 0008 verified its REVOKE by reading role_table_grants BY HAND after
applying, and recorded that in a comment. A migration that measures its own
write measures its own write, and the convention is a good one.

THIS ONE DEPARTS FROM IT ONCE, AT THE TOP OF upgrade(), AND THE DEPARTURE IS A
PRECONDITION CHECK RATHER THAN AN ASSERTION ABOUT ITS OWN WORK. It reads
pg_roles BEFORE it writes anything, and it reads nothing back afterwards. That
distinction is the whole justification: checking your own write tells you what
you already know, because you just wrote it; checking a precondition tells you
whether you may start.

WHY THIS MIGRATION HAS A PRECONDITION AND THE OTHER EIGHT DO NOT. Every object
0001-0008 touches is created by a migration, so the chain carries its own
prerequisites with it. This one grants to recycle_directory, and NO MIGRATION
CREATES THAT ROLE. It comes from db/init/00_init_roles.sql, which the Postgres
entrypoint runs ONLY on an empty data directory - that file says so in its own
words at its lines 9-13. So on any cluster whose data volume predates the role
being added to that file, the role is simply absent, and `alembic upgrade head`
fails at

    GRANT USAGE ON SCHEMA directory TO recycle_directory

with `role "recycle_directory" does not exist`. MEASURED: the role is absent
from every globals.sql in the backup directory, including the one taken the
morning this migration was written. env.py wraps the whole run in a single
transaction, so nothing lands and the database stays at 0008 - with an error
naming a GRANT, which is the consequence, and never naming the bootstrap file,
which is the cause.

Replacing that message is the entire purpose of the guard, and the remedy is
inside it: 00_init_roles.sql is re-runnable by design and can be applied by
hand with psql.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ASCII ONLY, no apostrophes, and NO BRACES: these strings are embedded in SQL
# literals through an f-string, and they are meant to be read back out of the
# catalogue on a codepage-874 box without needing hex to be believed. A brace
# here would be interpolated away and never reach the database. See the
# docstring.
_TABLE_COMMENT = (
    "Maps a human-typable shop code to a tenant. READ BEFORE ANY PRINCIPAL "
    "EXISTS: this is the lookup that turns a code typed at login into a "
    "tenant_id, so it runs before authentication and sits outside the tenant "
    "isolation model - it carries tenant_id but no RLS policy, because the "
    "question it answers is which tenant. NO SHOP DATA MAY EVER BE ADDED TO "
    "THIS RELATION. Every column here is readable pre-authentication, so a "
    "name column would make shop trading names enumerable to anyone who can "
    "reach the lookup, and a created_at would date every onboarding to the "
    "same audience. Two columns is the design, not an omission. See "
    "migration 0009."
)

_CODE_COMMENT = (
    "The shop code as printed and as typed. IMMUTABLE ONCE ISSUED: a code "
    "lives on printed slips this system will never see again, so reissuing "
    "one is not a rename, it is two shops sharing an identifier across time. "
    "NOTHING IN THE DATABASE ENFORCES THAT - there is no update path in scope "
    "and no trigger here - so it is a rule the writer must keep. Form: "
    "exactly 8 characters from a 31-character alphabet, A-Z and 0-9 minus O, "
    "0, I, 1 and L, the confusables a human misreads off a thermal slip. "
    "Enforced by ck_shop_code."
)


def upgrade() -> None:
    # THE ONLY READ IN THIS FILE, AND IT RUNS BEFORE ANYTHING IS WRITTEN.
    # recycle_directory is created by db/init/00_init_roles.sql, which the
    # Postgres entrypoint runs ONLY on an empty data directory - no migration
    # creates it, so the chain does not carry this prerequisite the way it
    # carries every other one. Without this guard the run dies six statements
    # later at the GRANT, saying `role "recycle_directory" does not exist`,
    # which names the consequence and never the cause. This is a PRECONDITION
    # check, not an assertion about this migration's own work; see the
    # docstring section on the departure from the no-read-back convention.
    if op.get_bind().exec_driver_sql(
        "SELECT 1 FROM pg_roles WHERE rolname = 'recycle_directory'"
    ).first() is None:
        raise RuntimeError(
            "migration 0009 requires the role recycle_directory, and this"
            " cluster does not have it.\n"
            "\n"
            "CAUSE: that role is created by server/db/init/00_init_roles.sql,"
            " which the Postgres entrypoint runs ONLY on an empty data"
            " directory. A cluster initialised before the role was added to"
            " that file will never have run the version that creates it, and"
            " no migration creates it either.\n"
            "\n"
            "REMEDY: that file is re-runnable by design - every statement in"
            " it is guarded - so apply it by hand with psql and then re-run"
            " this migration:\n"
            "    docker cp server/db/init/00_init_roles.sql"
            " <container>:/tmp/00_init_roles.sql\n"
            "    docker exec <container> psql -U postgres -d postgres"
            " -v ON_ERROR_STOP=1 -f /tmp/00_init_roles.sql\n"
        )

    # Each statement issued separately: asyncpg uses the extended query
    # protocol, which forbids multiple commands in a single prepared statement.
    op.execute("CREATE SCHEMA directory")

    # EVERY OBJECT REFERENCE IS SCHEMA-QUALIFIED, EVERY TIME. recycle_owner's
    # rolconfig is empty, so its search_path is the default `"$user", public` -
    # an unqualified CREATE TABLE here would land the relation in public,
    # among the tenant tables, with no RLS policy on it.
    #
    # NOT AN f-STRING, AND IT MUST NEVER BECOME ONE. `{8}` is a regex
    # quantifier; an f prefix would render it as the integer 8 and ship
    # `^[A-HJKMNP-Z2-9]8$` - a pattern no valid code can match - with no error
    # raised anywhere and nothing in the catalogue to read as wrong.
    op.execute(
        """
        CREATE TABLE directory.shop_codes (
            tenant_id uuid PRIMARY KEY REFERENCES public.tenants (id),
            code      text NOT NULL,
            CONSTRAINT uq_shop_code UNIQUE (code),
            CONSTRAINT ck_shop_code CHECK (code ~ '^[A-HJKMNP-Z2-9]{8}$')
        )
        """
    )

    # The two prohibitions this relation depends on, written where \d+ shows
    # them. 0006's reason applies unchanged: this file is not in the database,
    # and somebody running \d+ on this table in two years will not have this
    # migration open. Both are f-strings, which is safe here and only here -
    # the constants carry no braces, unlike the CHECK above.
    op.execute(f"COMMENT ON TABLE directory.shop_codes IS '{_TABLE_COMMENT}'")
    op.execute(
        f"COMMENT ON COLUMN directory.shop_codes.code IS '{_CODE_COMMENT}'"
    )

    # The reader role, and nothing else. USAGE on the schema is what makes the
    # relation reachable at all; SELECT is the only privilege it ever needs.
    # recycle_app is deliberately absent: see the docstring.
    op.execute("GRANT USAGE ON SCHEMA directory TO recycle_directory")
    op.execute("GRANT SELECT ON directory.shop_codes TO recycle_directory")


def downgrade() -> None:
    # REFUSE IF ANY CODE HAS BEEN ISSUED, and the reasoning is the same shape as
    # the no-CASCADE decision below: a refusal IS the correct outcome, and it
    # must name what it found. That one declines to destroy an object this
    # migration did not create. This one declines to destroy the rows it DID -
    # which are worth more, because dropping the table drops uq_shop_code with
    # it and a re-upgrade can then hand an already-printed code to a different
    # shop.
    #
    # to_regclass returns NULL rather than raising when the relation is absent,
    # so this is safe on a database where upgrade() never ran.
    bind = op.get_bind()
    if bind.exec_driver_sql(
        "SELECT to_regclass('directory.shop_codes')"
    ).scalar() is not None:
        issued = bind.exec_driver_sql(
            "SELECT count(*) FROM directory.shop_codes"
        ).scalar()
        if issued:
            raise RuntimeError(
                f"REFUSING to downgrade 0009: directory.shop_codes holds"
                f" {issued} issued code(s), and dropping the table destroys"
                " them and uq_shop_code together.\n"
                "\n"
                "WHY THAT IS NOT RECOVERABLE: a code is printed on slips this"
                " system will never see again. With the constraint gone, a"
                " later re-upgrade can issue the SAME code to a DIFFERENT"
                " shop while the first shop's slips are still in circulation."
                " That is two shops sharing an identifier across time, which"
                " is the harm this relation exists to prevent.\n"
                "\n"
                "REMEDY: if these codes are genuinely finished with, delete"
                " them deliberately and then downgrade:\n"
                "    DELETE FROM directory.shop_codes;\n"
            )

    # No REVOKE statements, and no COMMENT drops. Both ACLs and both comments
    # are attributes OF the objects dropped below and die with them - the same
    # shape as the absent COMMENT ON drop in 0006's and 0007's downgrades.
    op.execute("DROP TABLE IF EXISTS directory.shop_codes")

    # NO CASCADE, deliberately. With the table gone the schema is empty and a
    # bare DROP SCHEMA succeeds. If it FAILS, something this migration did not
    # create is living in `directory`, and CASCADE would destroy it silently
    # during a downgrade. The refusal IS the correct outcome: it stops the
    # downgrade and names the schema, which is what the reader needs.
    op.execute("DROP SCHEMA IF EXISTS directory")
