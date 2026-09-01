r"""failed_login_attempts - the record of a refused login, and the counter a
temporary lockout is derived from

Revision ID: 0016
Revises: 0015
Create Date: 2026-09-01

WHY THIS TABLE EXISTS
---------------------
Until now NOTHING anywhere in this API limited repeated attempts, and login was
included, not excepted (OPEN_ITEMS.md, "NOTHING ANYWHERE LIMITS REPEATED
ATTEMPTS"). A system that holds a shop's money and is about to be reachable from
the internet (P1.2) cannot ship a login that a guesser may hammer without cost.

The finding it closes states the trap this table must NOT fall into: A KEYSPACE
IS NOT A RATE LIMIT. migration 0009's 31^8 code space and D9's 8-character
password minimum each bound guessing PER ATTEMPT while bounding NOTHING about the
NUMBER of attempts. What is needed is a bound on the number of attempts, and that
needs a counter that survives a restart and is shared across worker processes -
so it lives in Postgres, the single source of truth, not in a process's memory.

WHAT IT IS, IN ONE SENTENCE
---------------------------
One append-only row per REFUSED login attempt (outcome 'failed'), plus one row
per administrative unlock (outcome 'unlocked_by_admin'). The login path counts
the 'failed' rows for a (tenant_id, username) in a trailing window and refuses
once they reach a threshold; the count ignores anything older than the most
recent 'unlocked_by_admin' marker for that key. The bounds and the query live in
server/app/login_guard.py; this file is only the relation they read and write.

THE KEY IS (tenant_id, username), AND THE tenant_id HAS NO FOREIGN KEY
----------------------------------------------------------------------
This is the one place this table departs from every other tenant table in the
schema, and the departure is forced by WHERE a login sits. To reach a real
account a caller MUST submit that shop's real tenant_id, because RLS resolves the
user only under it (app/main.py's login, ARCHITECTURE 8.2's one by-design
exception). So counting failures under (tenant_id, username) counts exactly the
attempts that make progress against a real account.

But tenant_id here is the SUBMITTED identity claim, not a resolved tenant. A
guesser may submit a tenant_id that names no shop at all, and the attempt must
still be answered - and, if it is a 'failed' one, recorded - rather than raising.
A REFERENCES tenants(id) FK would turn such an attempt into a foreign-key error
on the record INSERT, i.e. turn a refusal into a 500 on the login path and change
the response an attacker sees. So tenant_id is a bare uuid with NO FK. Contrast
seller_code_reservations (0012), whose tenant_id DOES reference tenants because
every writer of it already holds a resolved tenant; here the writer does not.

username IS ALSO A BARE text WITH NO FK, for the same shape of reason: the string
recorded is the one the caller TYPED, and a guesser types usernames that name no
user. It is stored exactly as given so that a later forensic read sees what was
tried, and it is never matched back to users.username by this table.

RLS: THE STANDARD POLICY, keyed on the SUBMITTED tenant during login
--------------------------------------------------------------------
ENABLE + FORCE + one policy keyed on the app.tenant_id GUC, exactly as 0001
attaches to every other tenant table and 0012 restates. During a login the GUC
is the SUBMITTED tenant (tenant_connection(body.tenant_id)), so the INSERT writes
that tenant and the SELECT counts only that tenant's rows - a guesser can only
ever touch the counter for the (tenant_id, username) it is actually attacking,
and to attack a real account it must name the real tenant. During an admin unlock
the GUC is the admin's TOKEN tenant, so the marker lands in the same tenant the
failures did. FORCE binds the owner too, so a migration or a proof that reads this
table sees ZERO rows until it sets a tenant context
(lessons/a-migration-reads-zero-under-force-rls.md).

WHAT COUNTS, AND WHAT DOES NOT
------------------------------
outcome IN ('failed', 'unlocked_by_admin'), and there is no third value.

'failed'            - a login that was refused for a bad credential while the
                      account was NOT already locked: unknown username, wrong
                      password, or a deactivated account. All three are one value
                      because the login response makes them one thing already, and
                      the counter has no reason to tell them apart. THESE are what
                      the lockout counts.
'unlocked_by_admin' - an administrator cleared the counter for this username. The
                      count query ignores every 'failed' row at or before the most
                      recent one of these, so an append UNDOES a lockout without a
                      DELETE and without any mutable state.

AN ATTEMPT THAT ARRIVES WHILE ALREADY LOCKED IS NOT RECORDED. It is refused (with
a DUMMY_HASH verify so its timing matches the others) and nothing is written. Two
reasons: recording it as 'failed' would let a guesser hold a lockout open past
its window by hammering, and recording it as a third value would let a guesser
grow this table one row per request with no bound. Not recording it means the
lockout throttles this table's OWN growth: at most THRESHOLD 'failed' rows per
window per account before further attempts write nothing. The cost is that the
forensic trail does not show hammering-while-locked; that is judged the right
trade against an unbounded write.

NO PASSWORD MATERIAL, AND THE COLUMN LIST IS THE PROOF
------------------------------------------------------
There is no column for a password, a hash of one, or its length, and none is
written by any path. The row is (id, tenant_id, username, outcome, created_at)
and nothing else. scripts/prove_login_guard.py asserts the submitted password's
bytes appear NOWHERE in a serialised row, with the username - which IS stored - as
the presence sibling that proves the search can fire.

created_at USES now(), AND THAT IS SAFE HERE
--------------------------------------------
0008 disbelieves now() because doc_no_counters is keyed on (tenant_id, be_year)
and a wrong year burns a legal document number. NOTHING keyed is derived from
created_at: it feeds a trailing-window comparison whose only failure under a
wrong clock is a lockout that clears a little early or late. A wrong now() here
mis-times a refusal; it does not corrupt a record.

RETENTION: NOTHING DELETES ROWS YET, AND THAT IS RECORDED, NOT SOLVED
--------------------------------------------------------------------
This table is append-only and no scheduled job prunes it - this system has no
scheduler (deliberately-not-built). Growth is bounded in the short run by the
lockout (see above) but unbounded over time. A retention/prune position is owed
and is recorded in OPEN_ITEMS.md rather than invented here; a pruner that deletes
rows older than the window is safe because such rows can no longer affect any
count. Until it exists the table simply grows, slowly.

GRANTS: SELECT + INSERT ONLY, AND THE REVOKE IS THE LINE THAT DOES THE WORK
--------------------------------------------------------------------------
The app reads the counter (SELECT) and appends to it (INSERT) and never needs to
change or remove a row - append-only. db/init/00_init_roles.sql runs ALTER
DEFAULT PRIVILEGES FOR ROLE recycle_owner IN SCHEMA public, which has ALREADY
handed recycle_app arwd on this table before either line below runs (0008 and
0012 measured exactly that). So the GRANT is written for the reader and the
REVOKE is what narrows: with UPDATE and DELETE revoked, append-only is a property
of the privilege, not of anyone remembering. The admin unlock is an INSERT (a
marker), so it needs nothing more than INSERT.

reconcile.py IS TOUCHED BY THIS MIGRATION, and not optionally. S2 - "no table
exists that this checker does not know about" - goes RED on the first run after
this lands and prints `table=failed_login_attempts - add it to ALL_RLS_TABLES and
give it checks`. That red is the checker working as designed; the repair is to add
the table to TENANT_TABLES, SCOPE_SQL and SCOPE_COLUMN, done in this same commit.
Its constraints and its index are DELIBERATELY NOT in REQUIRED_CONSTRAINTS /
REQUIRED_INDEXES, the same decision 0005, 0006, 0011, 0012 and 0015 recorded for
theirs: prove_reconcile.py restores a COPY from a dump, and a dump taken before
0016 has neither, so S5 would go red on such a copy for a reason unrelated to
money. Wake condition: a dump taken AFTER 0016 becoming the oldest one restored.

A KNOWN BOUNDARY OF reconcile.py, recorded in its CANNOT_SEE: because a 'failed'
row may carry a tenant_id that names no shop (a guesser's submitted claim), X2's
per-tenant completeness sum - which iterates the tenants that DO exist - cannot
attribute such a row and would count it UNSEEN. No such row exists on a LAN-only
dev database and none is written by any proof, so X2 is green today; the boundary
becomes reachable at the P1.2 internet move and is recorded rather than engineered
around in this commit.

WHY THE DOWNGRADE IS A PLAIN DROP, unlike 0012
----------------------------------------------
0012 refuses to downgrade while any reservation exists, because dropping it loses
the irrecoverable record of which seller codes are out on which handsets. Nothing
here is irrecoverable: dropping this table loses forensic history and clears every
live lockout, but a cleared lockout is one an attacker's window would have cleared
within LOCKOUT_WINDOW anyway, and no money or document sequence depends on a row.
So the downgrade is the plain DROP that 0007 and 0008 use, with no refuse guard.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The same predicate 0001 uses on every other tenant table, and the same one
# master.py's _TENANT writes with -- so the value an INSERT writes and the value
# the RLS policy tests are one expression. See 0012's identical note.
_TENANT_MATCH = "NULLIF(current_setting('app.tenant_id', true), '')::uuid"

# ASCII ONLY, no apostrophes, no braces: embedded in SQL literals through an
# f-string and meant to be read back out of the catalogue on a codepage-874 box
# without needing hex to be believed (lessons/console-is-not-the-observation.md).
# Convention from 0006, used by 0008/0009/0011/0012.
# NO SINGLE QUOTES anywhere in these strings: they are interpolated into a
# single-quoted SQL literal, so an apostrophe or a quoted value would terminate
# it early - the exact break 0007 warns about with "no apostrophes". The two
# outcome values are named in BARE words below, never quoted.
_TABLE_COMMENT = (
    "Append-only record of REFUSED login attempts, and the counter a temporary "
    "account lockout is derived from. One row per refused login (outcome value "
    "failed) plus one per admin unlock (outcome value unlocked_by_admin). The "
    "login path counts the failed rows for a (tenant_id, username) in a trailing "
    "window and refuses once they reach a threshold; the count ignores rows at or "
    "before the most recent unlocked_by_admin marker for that key, so an admin "
    "unlock is an append, never a delete. Bounds and query live in "
    "app/login_guard.py. APPEND-ONLY: recycle_app holds SELECT and INSERT only; "
    "UPDATE and DELETE are revoked. NO password material is stored - the columns "
    "are the proof. See migration 0016."
)

_TENANT_ID_COMMENT = (
    "The SUBMITTED tenant_id from the login body - an UNVERIFIED identity claim, "
    "NOT a resolved tenant, so there is deliberately NO foreign key to tenants: a "
    "guesser may name a shop that does not exist, and that attempt must be "
    "answered and recorded rather than raising a foreign-key error on the login "
    "path. To reach a real account a caller must name the real tenant, so "
    "counting on this column counts real progress. RLS keys on it exactly as on "
    "every other tenant table."
)

_USERNAME_COMMENT = (
    "The username string AS THE CALLER TYPED IT, which may name no user at all. "
    "Bare text with NO foreign key, for the same reason tenant_id has none: a "
    "guesser types usernames that name nobody. Stored verbatim so a forensic read "
    "sees what was tried; never matched back to users.username by this table."
)

_OUTCOME_COMMENT = (
    "Value failed or value unlocked_by_admin, and there is no third value. failed "
    "is a login refused for a bad credential while NOT already locked - unknown "
    "user, wrong password, or deactivated account, made one value because the "
    "login response already makes them one thing. These are what the lockout "
    "counts. unlocked_by_admin is an admin clearing the counter; the count query "
    "ignores failed rows at or before the latest one, so it undoes a lockout with "
    "no DELETE. An attempt that arrives while ALREADY locked is refused and NOT "
    "recorded, so the lockout bounds this table own growth."
)


def upgrade() -> None:
    # Each statement issued separately: asyncpg uses the extended query protocol,
    # which forbids multiple commands in a single prepared statement. Convention
    # from 0001, restated by 0012.
    #
    # A plain string, not an f-string: nothing here needs interpolation and 0009
    # recorded that a brace under an f prefix renders away with no error.
    op.execute(
        """
        CREATE TABLE failed_login_attempts (
            id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            -- NO FK on tenant_id or username: both are unverified caller input.
            -- See the docstring; this is the one table that departs from the
            -- composite-tenant-FK rule, on purpose.
            tenant_id  uuid        NOT NULL,
            username   text        NOT NULL,
            outcome    text        NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            -- NAMED, not inline: a refusal may one day be attributed to it, and
            -- an inline CHECK gets the name Postgres derives. Same convention as
            -- ck_reservations_state (0012), ck_tenants_default_grade (0010).
            CONSTRAINT ck_failed_login_outcome
                CHECK (outcome IN ('failed', 'unlocked_by_admin'))
        )
        """
    )

    # The ONE query this table serves on a cadence is the login-path count:
    # WHERE tenant_id = <GUC, injected by RLS> AND username = :u
    #   AND outcome = 'failed' AND created_at >= now() - <window>
    # plus the max(created_at) of the 'unlocked_by_admin' markers for that key.
    # (tenant_id, username, created_at) is equality, equality, range - the shape a
    # btree serves best. Added WITH the feature that reads it, unlike 0011 which
    # refused an index nothing queried; this one is queried on every login.
    op.execute(
        """
        CREATE INDEX ix_failed_login_tenant_username_time
            ON failed_login_attempts (tenant_id, username, created_at)
        """
    )

    op.execute(f"COMMENT ON TABLE failed_login_attempts IS '{_TABLE_COMMENT}'")
    op.execute(
        f"COMMENT ON COLUMN failed_login_attempts.tenant_id IS '{_TENANT_ID_COMMENT}'"
    )
    op.execute(
        f"COMMENT ON COLUMN failed_login_attempts.username IS '{_USERNAME_COMMENT}'"
    )
    op.execute(
        f"COMMENT ON COLUMN failed_login_attempts.outcome IS '{_OUTCOME_COMMENT}'"
    )

    # -------------------------------------------------------------------- RLS
    # Ordinary tenant-scoped data inside the isolation model, keyed on the GUC the
    # login sets from the submitted tenant. FORCE makes even the owner obey it.
    # Enabled AFTER the CREATE and with no backfill to fight its own WITH CHECK
    # (lessons/a-migration-reads-zero-under-force-rls.md): this table is born
    # empty.
    op.execute("ALTER TABLE failed_login_attempts ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE failed_login_attempts FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON failed_login_attempts "
        f"USING (tenant_id = {_TENANT_MATCH}) "
        f"WITH CHECK (tenant_id = {_TENANT_MATCH})"
    )

    # ----------------------------------------------------------------- grants
    # Written for the reader; the REVOKE is what narrows. ALTER DEFAULT PRIVILEGES
    # in db/init/00_init_roles.sql has already handed recycle_app arwd on this
    # table (0008 and 0012 measured it), so the GRANT is a no-op against that and
    # the REVOKE makes append-only a property of the privilege. The app needs
    # SELECT (count) and INSERT (record a 'failed' row, and the admin-unlock
    # marker); it never updates or deletes.
    op.execute(
        "GRANT SELECT, INSERT ON failed_login_attempts TO recycle_app"
    )
    op.execute(
        "REVOKE UPDATE, DELETE ON failed_login_attempts FROM recycle_app"
    )


def downgrade() -> None:
    # A plain DROP, no refuse-if-rows guard, unlike 0012. Dropping this table
    # loses forensic history and clears every live lockout, but neither is
    # irrecoverable business data: a cleared lockout is one that would have
    # auto-cleared within LOCKOUT_WINDOW anyway, and no money or document sequence
    # depends on a row here. The index, the policy, the comments and the ACL are
    # attributes OF the table and die with it - the same shape as 0007's and
    # 0008's downgrades.
    op.execute("DROP TABLE IF EXISTS failed_login_attempts")
