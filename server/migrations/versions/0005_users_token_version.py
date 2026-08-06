"""users.token_version — the server's ability to refuse a token it already issued

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-06

WHY THIS COLUMN EXISTS
----------------------
A JWT is a bearer claim the server cannot take back. JWT_TTL_SECONDS is 3600 and
there is no refresh token, so today the only thing that ends a session is the
clock: a handset that is lost, sold, or kept by a departing employee holds a
working credential for that shop until the hour is up, and there is nothing
anyone can do about it from either side.

token_version is the smallest thing that changes that. It is minted into every
token and re-read from this row on every request — on the SAME query
get_principal already runs to prove the user still exists and to resolve the
role, so the check costs no extra round trip. Bump the row and every token
issued before the bump stops being accepted at the next request.

NOTHING IS DELETED. A bump ends sessions. It removes no user, and this migration
adds no delete path of any kind. Note also what it does NOT do: `users` has no
is_active column, so a bump ends live sessions without locking the account — the
user can sign in again immediately and receive a fresh token.

DEFAULT 1, NOT 0, AND THAT IS THE POINT
---------------------------------------
Every token minted before this migration carries NO token_version claim, and
such a token must be REFUSED — never read as version 0, never waved through.
get_principal enforces that by REQUIRING the claim (KeyError -> 401). The
default here is a second, independent guard on the same failure: because no user
row can ever hold 0, the value an absent claim would default to matches NOTHING.
A future `claims.get("token_version", 0)` — the exact shape of
lessons/a-defaulted-getattr-is-a-silent-dead-branch.md, where an ABSENT
attribute read as a confident negative and left a safety branch dead for four
phases — would then refuse every request loudly instead of accepting every
legacy token silently. The CHECK is what makes that a property of the table
rather than of this comment.

The CHECK is deliberately NOT added to reconcile.py's REQUIRED_CONSTRAINTS.
prove_reconcile.py restores a COPY from a dump, and a dump taken before this
migration has neither the column nor the constraint, so S5 would go red for a
reason that has nothing to do with money — "the money is wrong" and "the fixture
predates the schema" must never share an outcome. Recorded in OPEN_ITEMS.md with
its wake condition: a dump taken after 0005.

A DEFAULT ON A LIVE TABLE IS SAFE here for the same reason 0004's is_active was:
Postgres 11+ records a non-volatile default in the catalogue instead of
rewriting the table, so there is no rewrite lock, and every existing row gets a
value it can then only move forward from.

NO INDEX. token_version is only ever read by primary key, on the row
get_principal has already located by id.

No privilege changes: the table-level grants in 0001 already cover future
columns, and RLS policies are per-table rather than per-column, so `users`'
existing tenant_isolation policy governs this column unchanged (cf.
lessons/revoke-in-migration.md — there is genuinely nothing to grant here, which
is not the same as forgetting).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE users ADD COLUMN token_version integer NOT NULL DEFAULT 1"
    )
    op.execute(
        "ALTER TABLE users ADD CONSTRAINT ck_users_token_version"
        " CHECK (token_version >= 1)"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_token_version")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS token_version")
