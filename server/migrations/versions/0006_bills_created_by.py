r"""purchase_bills.created_by — the session that SUBMITTED the bill

Revision ID: 0006
Revises: 0005
Create Date: 2026-08-07

WHY THIS COLUMN EXISTS
----------------------
No bill has ever recorded an author. create_bill's INSERT wrote nine columns and
no user of any kind, so the only user on a bill was voided_by: a bill said who
CANCELLED it and never who WROTE it, and a load could not be traced to the staff
member who weighed it and handed over the cash.

NOTHING HERE IS RETROACTIVE. Every bill already written stays authorless
permanently — no column added now makes one existing row traceable. This closes
the gap going forward and closes nothing behind it.

WHAT IT MEANS — AND THE BOUND LIVES IN THE DATABASE, NOT IN THIS FILE
--------------------------------------------------------------------
created_by is the user whose session SUBMITTED the bill: the principal of the
POST /bills request, the same source voided_by already takes. It is NOT
necessarily the user who weighed the load. A bill is created offline by one
operator and may sync under a different session on a later shift.

The NAME cannot carry that distinction and does not try to. "created_by" is the
string three documents already cite (OPEN_ITEMS.md, ARCHITECTURE.md,
PROJECT_STATUS.md) and renaming it would orphan them, so the bound is written
into the SCHEMA instead, as a COMMENT ON COLUMN. This file is not in the
database; somebody running \d+ on this table in two years is the reader that
comment is for, and they will not have this migration open.

THAT COMMENT IS THE FIRST COMMENT ON IN THIS REPOSITORY. A deliberate new
convention, accepted for one reason: a bound that only exists in prose outside
the database is a bound the database cannot state about itself. It is ASCII-only
on purpose — this box is codepage 874, and a comment that has to be read back
through a console to be verified must not need hex to be trusted
(cf. lessons/console-is-not-the-observation.md).

Today the distinction is UNMEASURABLE and the column does not pretend otherwise:
mobile has one account (app/config.ts holds hardcoded DEMO credentials and
App.tsx has no TextInput at all), so signing out and back in returns the same
user. Weigher and syncer are the same principal by construction until real
per-shop accounts exist. If cross-shift attribution ever matters, a SECOND
column is added beside this one — the same shape as device_created_at beside
server_received_at, two columns because two facts. Nothing here scaffolds for
that, and no user id is accepted from the client.

NULLABLE, NO DEFAULT — THE MIRROR IMAGE OF 0005's DEFAULT 1
-----------------------------------------------------------
Every existing bill has no author and there is no true value to backfill with,
so NOT NULL is not available: ADD COLUMN ... NOT NULL on a non-empty table
requires a DEFAULT.

0005 could take DEFAULT 1 precisely BECAUSE no user row can ever hold the value
an absent claim would produce — that default was chosen to match NOTHING, so it
refused loudly. A default here is the opposite in the only way that counts: any
uuid it could name is a REAL PERSON, and it would put their name on every load
written before this migration, loads they did not weigh, permanently. That is a
default IDENTITY (lessons/config-defaults-must-fail-closed.md) and a wrong
number somebody acts on (lessons/fallback-default-is-a-wrong-number.md). Worse
than a blank, because a blank makes the next reader ask.

WHAT NULL MEANS: no author was recorded for this row. NOT "written by nobody" —
some session submitted every bill; the system did not write it down.

From a single row a reader CANNOT tell "written before this column existed" from
"written by nobody", and this file will not pretend otherwise. What IS decidable,
with no date literal and no constant: after this migration POST /bills cannot
produce a NULL, because create_bill is Depends(get_principal), which raises 401
before the handler body runs. So a post-migration NULL means exactly one thing —
THE ROW DID NOT COME THROUGH POST /bills.

IT DOES NOT FOLLOW THAT THE NULLS FORM A PREFIX in arrival order, and an earlier
draft of this docstring said they did. Direct INSERTs happen, and are not rare:
scripts/prove_backup_restore.py:208 writes a marker bill straight into this table
on every run — deliberately, so the proof keeps working when no API is up — and
VOIDS that marker rather than deleting it (hard rule 5), so every run leaves one
permanent authorless row after however many authored ones precede it.
scripts/prove_rls.py:104 and :311 do the same inside throwaway tenants they tear
down. The correction is recorded rather than the sentence quietly removed,
because the step that produced it — "the API cannot write a NULL, therefore a
NULL is old" — silently assumes the API is the only writer, and that assumption
is the thing worth seeing.

A prefix check over API-WRITTEN rows only is still possible, and is deliberately
NOT built — see OPEN_ITEMS.md for the proposal and the cost that keeps it one.

COMPOSITE FK, NEVER A PLAIN ONE
-------------------------------
FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id), against
uq_users_tenant_id from 0001. A plain created_by -> users (id) would not stop a
bill in shop X naming a user in shop Y. The composite one makes that impossible
at the constraint level, and referential-integrity checks in Postgres bypass
RLS, so the guarantee holds whatever the session's tenant context is — it is not
something a policy could be tricked into skipping. Same shape as
fk_bills_voided_by, resting on the same UNIQUE, for the same reason.

MATCH SIMPLE, so the FK is simply NOT CHECKED when created_by is NULL. That is
what makes a nullable column and a composite FK coherent, and it is the same
mechanic 0001 already documents for voided_by on a live bill.

NO ck_bills_created_by, AND THAT IS NOT AN OMISSION. voided_by moves with
voided_at and void_reason because a void is three facts that are meaningless
apart, and ck_bills_void_consistency is what holds them together. An author is
ONE fact. There is no second column for it to be consistent with, and a
multi-column consistency CHECK over one column would be ceremony.

DELIBERATELY NOT IN reconcile.py's REQUIRED_CONSTRAINTS
-------------------------------------------------------
Same reason 0005 gives for ck_users_token_version, and the argument is unchanged
here: prove_reconcile.py restores a COPY from a dump, and a dump taken before
this migration has neither the column nor the constraint, so S5 would go red on
every such copy for a reason that has nothing to do with money. "The money is
wrong" and "the fixture predates the schema" must never share an outcome.
Postgres enforces the FK on the live database regardless; what is missing is only
the checker's assertion that it is still there. Wake condition, recorded in
OPEN_ITEMS.md beside its twin: a dump taken AFTER 0006 becoming the oldest one
anyone restores from.

NO INDEX. Nothing queries bills BY author — not GET /bills, not the daily
report, not reconcile.py. An index is a write cost on POST /bills, the hot path,
paid to speed up a query no code makes. Add one when something reads it, not
before. Same reasoning as 0004's is_active.

A NULLABLE COLUMN WITH NO DEFAULT IS SAFE ON A LIVE TABLE for a stronger reason
than 0004's and 0005's: with no default there is no value to write at all, so
Postgres records the column in the catalogue and rewrites nothing. Every
existing row reads back NULL, which is the truth about it.

No privilege changes: the table-level grants in 0001 already cover future
columns, and RLS policies are per-table rather than per-column, so
purchase_bills' existing tenant_isolation policy governs this column unchanged
(cf. lessons/revoke-in-migration.md — there is genuinely nothing to grant here,
which is not the same as forgetting).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0006"
down_revision: Union[str, None] = "0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ASCII ONLY, and no apostrophes: this string is embedded in a SQL literal and
# is meant to be read back out of the catalogue on a codepage-874 box without
# needing hex to be believed. See the docstring.
_CREATED_BY_COMMENT = (
    "The user whose session SUBMITTED this bill - the principal of the "
    "POST /bills request, the same source voided_by takes. NOT necessarily the "
    "user who weighed the load: a bill is created offline by one operator and "
    "may sync under a different session on a later shift. NULL means no author "
    "was recorded - every bill written before migration 0006, plus any row "
    "inserted outside the API."
)


def upgrade() -> None:
    op.execute("ALTER TABLE purchase_bills ADD COLUMN created_by uuid")
    op.execute(
        "ALTER TABLE purchase_bills ADD CONSTRAINT fk_bills_created_by"
        " FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id)"
    )
    op.execute(
        f"COMMENT ON COLUMN purchase_bills.created_by IS '{_CREATED_BY_COMMENT}'"
    )


def downgrade() -> None:
    # The comment is an attribute OF the column and dies with it, so there is no
    # third statement here. Dropped in the reverse order of upgrade() all the
    # same: the constraint depends on the column, not the other way round.
    op.execute(
        "ALTER TABLE purchase_bills DROP CONSTRAINT IF EXISTS fk_bills_created_by"
    )
    op.execute("ALTER TABLE purchase_bills DROP COLUMN IF EXISTS created_by")
