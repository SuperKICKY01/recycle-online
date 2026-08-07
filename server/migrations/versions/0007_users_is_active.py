r"""users.is_active - an account that can be LOCKED, not only signed out

Revision ID: 0007
Revises: 0006
Create Date: 2026-08-07

WHY THIS COLUMN EXISTS
----------------------
0005 gave the server the ability to refuse a token it had already issued, and
POST /users/{id}/revoke-sessions is the trigger. That endpoint's own docstring
says what it cannot do: it ends live SESSIONS and does not lock the ACCOUNT, so
the user signs in again the same second and receives a fresh token carrying the
new version. Right for a handover, wrong for a dismissal, and until now there
was no way to express the second.

The absence was tolerable while a shop owned the handsets: a dismissal ended
with taking the phone back. Staff use their own phones, so nothing is taken
back and the account is the only lever left.

IT MUST BITE IN TWO PLACES OR IT IS HALF A LOCK
-----------------------------------------------
A locked account is refused at POST /auth/login (app/main.py) AND at
get_principal (app/auth.py), and neither site is sufficient alone.

Login only: every token already in a pocket keeps working until it expires.
JWT_TTL_SECONDS is 3600 and there is no refresh token, so a dismissal at 09:05
leaves that phone able to write bills until roughly 10:05 - which is the exact
exposure 0005 exists to close, re-opened through a different door. The comment
in get_principal has named this case since before there was a state that could
produce it: "A user deleted or disabled in the back office keeps full access
until their token expires, because nothing ever re-checks them."

get_principal only: every request 401s while /auth/login keeps answering 200
with a usable token. That is worse than it sounds - the client believes it has
a session, so the device retries against a credential the server will never
accept and the send queue dams behind it.

The lock ALSO bumps token_version, in the same UPDATE statement rather than in a
second one. One statement leaves no window in which the account is locked and
the sessions are not, and no conditional branch that could be wrong in the
permissive direction. So the two guards are belt and braces on purpose: the
version bump kills the live tokens at once, and this column is what stops a new
one being minted.

NOT NULL DEFAULT true, AND WHY THAT IS SAFE ON A LIVE TABLE
------------------------------------------------------------
0004's argument, applied unchanged: every existing row becomes active, which is
the state it is already in, so THE MIGRATION CANNOT CHANGE THE MEANING OF ANY
CURRENT DATA. Here that is stronger than a convention rather than merely equal
to it - there is no other state a users row could currently be in, because
nothing anywhere refuses one. `true` restates a fact that is already observably
true of every row; it does not guess at one.

Postgres 11+ records a non-volatile default in the catalogue instead of
rewriting the table, and `true` is non-volatile, so there is no rewrite and no
rewrite lock. That property is what matters, not the size of the table.

WHY THIS DIFFERS FROM 0006's REFUSAL OF A DEFAULT
--------------------------------------------------
0006 refused a default for created_by and the reasoning does not transfer, which
is worth stating because the two migrations otherwise look alike. Any uuid a
default could have named there is a REAL PERSON, and it would have put their
name on every load written before that migration - loads they did not weigh,
permanently. A default IDENTITY.

is_active names nobody. Run 0004's test on each: can the default change the
meaning of data already written? For created_by, yes, and irreparably. For
is_active there is nothing for it to change, because the value it writes is the
value every row already has.

WHY NULLABLE WOULD BE WORSE
----------------------------
NULL means "not recorded" - 0006's own words about its own column. A third state
in a SECURITY predicate has to be resolved somewhere, and there is only one
place left to resolve it: the gate itself, as COALESCE(is_active, true).

That single expression is two lessons at once. A default value standing in for
an absent one, inside the check that decides who may sign in, is
lessons/config-defaults-must-fail-closed.md - a default value is a default
identity. And an absent value read as a confident answer is
lessons/a-defaulted-getattr-is-a-silent-dead-branch.md, where an attribute that
did not exist read as a negative and left a safety branch dead for four phases.
Note the direction it fails: COALESCE(..., true) lets through a row nobody set,
which is the permissive direction.

NOT NULL deletes the branch rather than guarding it. There is no COALESCE to
write because there is no third state to resolve, and no future handler can
forget to write one.

NO CHECK CONSTRAINT, AND THAT IS NOT AN OMISSION
-------------------------------------------------
0005 added ck_users_token_version because its DEFAULT 1 had to be prevented from
ever meeting a 0, and the CHECK is what made "no row can hold the value an
absent claim would produce" a property of the table. A boolean needs no such
guard: NOT NULL boolean has exactly two values and the type is the constraint.

It follows that this migration adds NOTHING to reconcile.py's
REQUIRED_CONSTRAINTS, and that there is no wake condition to record beside the
two already in OPEN_ITEMS.md for ck_users_token_version and fk_bills_created_by.
There is no constraint here for S5 to hold.

NO INDEX. 0004's reasoning, and it is stronger here than there. users is reached
by primary key in get_principal (WHERE id = :uid) and by uq_users_tenant_username
in login (WHERE username = :u, under the tenant's RLS predicate). is_active is
never a search key - it is a predicate applied to a row already located by an
existing unique index. A low-cardinality boolean index would be maintained on
every write and read by nothing. Add one when something searches on it, which
today nothing does.

THE COMMENT ON COLUMN - THE SECOND USE OF 0006's CONVENTION
------------------------------------------------------------
Accepted for the same reason 0006 accepted it: a bound that only exists in prose
outside the database is a bound the database cannot state about itself, and the
person running \d+ on this table in two years will not have this file open. It
is ASCII-only on purpose - this box is codepage 874, and a comment that has to
be read back through a console to be verified must not need hex to be trusted
(cf. lessons/console-is-not-the-observation.md).

The bound it carries is the one the name cannot, and it is load-bearing:
A LOCKED USER MUST STILL RESOLVE ON EVERY BILL THAT NAMES THEM. purchase_bills
carries created_by (0006) and voided_by (0001), both composite FKs into this
table, so a row-level read that filtered on is_active would blank the author of
every bill a departed employee ever wrote. That is 0004's "row-level reads never
filter" rule - written there about a retired product keeping its code and name
on a historical bill - arriving here about a person. The four master-data tables
have list endpoints that exclude retired rows; users has no list endpoint at all,
so there is nothing here that even could filter yet, and the comment is what
tells whoever writes the first one (P3.7) that it must not.

WHAT A LOCK DOES NOT DO
------------------------
It deletes nothing, here or anywhere: this migration adds no delete path and
there is still none in the system. It does not reach a bill that has already
been written - the money, the doc_no and the author stay exactly as recorded,
which is the whole point of an audit column and is not something locking an
account may disturb.

And it is a STATE, where revoke-sessions is an EVENT. users.py argues that
distinction about itself already; this column is the state half of it, and the
two are related only in that locking performs the event as well.

No privilege changes: the table-level grants in 0001 already cover future
columns, and RLS policies are per-table rather than per-column, so `users`'
existing tenant_isolation policy governs this column unchanged (cf.
lessons/revoke-in-migration.md - there is genuinely nothing to grant here, which
is not the same as forgetting).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0007"
down_revision: Union[str, None] = "0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ASCII ONLY, and no apostrophes: this string is embedded in a SQL literal and is
# meant to be read back out of the catalogue on a codepage-874 box without
# needing hex to be believed. See the docstring.
_IS_ACTIVE_COMMENT = (
    "Whether this account may authenticate. false = LOCKED: POST /auth/login is "
    "refused, and every token already issued is refused at its next request. A "
    "lock bumps token_version in the same statement, so it ends live sessions "
    "as well - this column is what stops a new token being minted. It is NOT a "
    "delete: nothing is removed and no bill is altered. Historical bills keep "
    "naming a locked user through created_by and voided_by, so no row-level "
    "read of this table may filter on this column."
)


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN is_active boolean NOT NULL DEFAULT true"
    )
    op.execute(f"COMMENT ON COLUMN users.is_active IS '{_IS_ACTIVE_COMMENT}'")


def downgrade() -> None:
    # The comment is an attribute OF the column and dies with it, so there is no
    # second statement here - the same shape as 0006's downgrade.
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_active")
