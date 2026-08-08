r"""server_clock_watermark - the server's own clock, disbelieved

Revision ID: 0008
Revises: 0007
Create Date: 2026-08-08

WHY THIS TABLE EXISTS
---------------------
Every clock-distrust mechanism in this system points at DEVICES. Hard rule 7
keeps device_created_at and server_received_at as two facts because the device
clock is untrusted; reconcile's CANNOT_SEE refuses to bound device_created_at
against anything for the same reason. Nothing disbelieves now().

app/bills.py reads now() ONCE and derives both be_year and server_received_at
from that one instant. That single read is correct and deliberate - it closed a
real two-clock bug. It also means the two values can never disagree, so T7 in
scripts/reconcile.py compares _be_year(X) against _be_year(X) and cannot fail
for any bill this code wrote. If the instant itself is wrong, every check
downstream agrees with it.

The damage is not a mis-stamped row. doc_no_counters is keyed on
(tenant_id, be_year), so a now() wrong by enough to cross a Buddhist year
boundary OPENS THE COUNTER FOR A YEAR THAT HAS NOT HAPPENED. When the real year
arrives its first sequence number is already spent: B-<year>-1 never exists, and
a gap in a legal document sequence cannot be repaired afterwards.

WHAT IT CATCHES, AND WHAT IT DOES NOT
-------------------------------------
One row holding the highest now() this server has ever observed. On startup and
on a periodic tick the app compares now() against it. A now() below the
watermark by more than the tolerance means the clock moved BACKWARDS - the
signature of a container starting before time sync, and of an NTP step
correcting a fast clock.

It does NOT catch a clock wrong FORWARD from a fresh install, and it cannot:
there is nothing to compare against. Nor does it catch a coherent rollback that
takes the clock and this table back together, because then now() and the
watermark agree. Those limits are why the year-boundary gate is a separate
guard, and even that cannot see a jump of exactly +1 year without an
independent time reference this system does not have.

NO tenant_id, AND THAT IS THE POINT
-----------------------------------
Hard rule 2 puts tenant_id on every business-data table. This is not business
data - it is a property of the SERVER, like alembic_version. A shop does not
have a clock; the machine does.

Being outside RLS is FORCED, not preferred. The guard runs at STARTUP, before
any request and therefore before any tenant context exists. app/db.py has
tenant_connection(None) open a transaction with NO context, and the policies
match nothing, so it fails CLOSED with zero rows. An RLS-protected watermark
would be unreadable at exactly the moment the guard must read it.

The cost is recorded here rather than discovered later: this is the second table
the app role can read with no tenant context, after alembic_version - which the
app role cannot read at all. S1 and S2 in scripts/reconcile.py are updated to
know about it, and its CANNOT_SEE carries the same prohibition, because the
boundary of a check belongs in the check's output and not only here. S3 is not
updated, because there is no RLS here to check.

NOTHING TENANT-SCOPED MAY EVER BE ADDED TO THIS TABLE. That prohibition is the
entire reason a table outside the isolation model is acceptable at all.

GRANTS ARE NARROWER THAN THE DEFAULT, AND A GRANT ALONE DOES NOT ACHIEVE THAT
-----------------------------------------------------------------------------
SELECT and UPDATE only. No INSERT, no DELETE: the single row is seeded here and
the app must never create a second or remove the one that exists. The singleton
is enforced by a primary key on a boolean that must be true, so a second row is
impossible even by hand - but DELETE would remove the only row, and a guard with
no watermark to read is a guard that cannot run.

WRITING ONLY THE NARROW GRANT DOES NOT PRODUCE A NARROW GRANT, AND THIS WAS
OBSERVED HERE RATHER THAN REASONED ABOUT. db/init/00_init_roles.sql:106-107 runs
ALTER DEFAULT PRIVILEGES FOR ROLE recycle_owner IN SCHEMA public, which hands
recycle_app arwd - insert, select, update, delete - on every table created
afterwards, this one included. The first application of this migration granted
SELECT, UPDATE and then read the catalogue back: recycle_app held
DELETE,INSERT,SELECT,UPDATE. The GRANT was not wrong, it was irrelevant.

So the narrowing is done by REVOKE, which is the same shape 0001 already used
when the blanket grant reached alembic_version and had to be taken back. A
migration that only GRANTS here would ship a docstring promising a restriction
the database does not have.

The app advances the watermark with GREATEST(highest_seen, now()) - forward
only. Clearing a trip means LOWERING it, which is an operator action run as the
OWNER role and recorded in reset_at / reset_reason on this same row.

BUT THE FORWARD-ONLY PROPERTY IS NOT ENFORCED BY THE DATABASE, AND THIS WAS
BELIEVED TO BE OTHERWISE UNTIL IT WAS TESTED. UPDATE is granted to recycle_app,
so a HAND-WRITTEN update as the app role CAN lower the watermark. GREATEST lives
in app/clock_guard.py, which means the guarantee is "no code path in this
application lowers it", NOT "the database refuses to lower it". Only INSERT and
DELETE are refused at the grant level. scripts/prove_clock_guard.py demonstrates
the successful lowering rather than asserting the opposite.

Closing that would need a BEFORE UPDATE trigger. This schema has no triggers at
all, and adding the first one is not a decision this migration makes. The
limitation is recorded here, and in reconcile's CANNOT_SEE, because a design
property the owner believes and the database does not enforce is exactly the
shape this table exists to argue against.

SEEDING USES now(), WHICH IS THE THING BEING DISBELIEVED
--------------------------------------------------------
A migration run on an already-wrong clock seeds an already-wrong watermark.
Nothing here detects that. The operator reset is the only cure, and this
paragraph exists so the next reader does not assume otherwise.

THIS IS WHY THE ORDER MATTERS: THIS LANDS BEFORE P1.2, THE HOSTING MOVE.
Moving hosts is the single most likely moment for this machine's clock to be
wrong. Seeding the watermark AFTER the move would seed it from the suspect
clock and the guard would certify the very error it exists to catch. Seeding it
before the move means the watermark crosses the move as evidence.
"""
from typing import Union

from alembic import op

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Each statement issued separately: asyncpg uses the extended query
    # protocol, which forbids multiple commands in a single prepared statement.
    op.execute(
        """
        CREATE TABLE server_clock_watermark (
            only_row     boolean     PRIMARY KEY DEFAULT true CHECK (only_row),
            highest_seen timestamptz NOT NULL,
            reset_at     timestamptz,
            reset_reason text,
            CONSTRAINT ck_clock_reset_consistency CHECK (
                (reset_at IS NULL) = (reset_reason IS NULL)
            )
        )
        """
    )
    op.execute(
        "INSERT INTO server_clock_watermark (only_row, highest_seen)"
        " VALUES (true, now())"
    )
    op.execute("GRANT SELECT, UPDATE ON server_clock_watermark TO recycle_app")
    # THE LINE THAT ACTUALLY NARROWS IT. ALTER DEFAULT PRIVILEGES in
    # db/init/00_init_roles.sql has already given recycle_app arwd on this
    # table; the GRANT above is a no-op against that. Same remedy 0001 used for
    # alembic_version. Verified by reading role_table_grants after applying.
    op.execute(
        "REVOKE INSERT, DELETE ON server_clock_watermark FROM recycle_app"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS server_clock_watermark")
