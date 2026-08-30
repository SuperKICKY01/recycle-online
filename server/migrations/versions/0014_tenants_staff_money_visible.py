"""tenants.staff_money_visible: the per-shop switch that decides whether STAFF
may see money figures in the shop dashboard. boolean NOT NULL DEFAULT false --
staff see NO money by default, and only the shop owner can turn it on.

Revision ID: 0014
Revises: 0013
Create Date: 2026-08-30

WHY NOW, AND WHY THIS COLUMN. The dashboard (P1.23 item 4) is the first surface
that shows a shop-day money total on the yard floor. Decision D1 (ROADMAP
P1.23 item 4, 2026-08-30) settles who may see it: staff see no money figure by
default, and visibility is a per-shop setting the owner controls. That setting
needs a home on `tenants`, and this is it. The dashboard route (GET
/reports/summary, added to server/app/reports.py in the same commit) reads it;
master.py widens GET/PATCH /shop to surface it.

DEFAULT false, AND THIS IS NOT A fallback-default-is-a-wrong-number CASE. That
lesson is about a default that STANDS IN for a real value the office might act on
-- a price, a grade, an address -- where any guess is a wrong number somebody
trusts. This is the opposite: false is the OWNER-STATED correct initial value,
not a placeholder for one. D1 names OFF as the only safe initial state, because a
cash figure shown to the yard by mistake cannot be unshown, and a shop turns it
ON deliberately or never. Every shop that exists today should start with staff
seeing no money, which is exactly what false gives them -- so there is no backfill
that invents a policy no owner chose (the same shape 0010's default_grade and
0006's created_by reason about, from the other side).

STORED BY KIND, NEVER A JSON BAG (S16). A boolean column, like
seller_code_target_holding (0012) is an integer column: a setting stored as the
type it is, so a CHECK, an index or a query can see it, rather than buried in a
JSON settings blob where none of them can. S16 keeps the shop-chosen settings as
real columns for exactly this reason.

NOT NULL WITH A DEFAULT IS SAFE ON THIS LIVE TABLE. `tenants` is small and the
default is a constant, so Postgres records the default in the catalogue and
rewrites nothing; every existing row reads back false, which is the policy D1
wants for every shop that has not opted in. This mirrors 0012's
seller_code_target_holding (NOT NULL DEFAULT 20), the established shape for a
NOT NULL tenants setting with a safe constant default.

WHAT THIS MIGRATION DOES NOT DO. No route -- server/app/master.py widens
GET/PATCH /shop and server/app/reports.py adds the dashboard route in the same
commit; the schema is separate so a schema audit reads one file (the convention
0012/0013 state). No change to name, default_grade, address, phone, or
seller_code_target_holding. provision_shop.py names its tenants columns
explicitly, so one new NOT NULL column with a default reaches it with no edit,
and it is not touched.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# ASCII ONLY, no apostrophes, and NO BRACES: this string is embedded in a SQL
# literal through an f-string and is meant to be read back out of the catalogue
# on a codepage-874 box without needing hex to be believed
# (lessons/console-is-not-the-observation.md). A brace under an f prefix would be
# interpolated away with no error raised. Convention from 0006/0009/0011/0012/0013.
_STAFF_MONEY_VISIBLE_COMMENT = (
    "Per-shop, owner-controlled: whether STAFF may see money figures in the shop "
    "dashboard. false (the default) means staff see no money total at all -- the "
    "only safe initial state, because a cash figure shown to the yard by mistake "
    "cannot be unshown (P1.23 item 4, decision D1). NOT a fallback default that "
    "could be a wrong number: false is the owner-stated correct initial value, not "
    "a guess standing in for a real one. Admin sees shop-wide money regardless of "
    "this flag. Stored as a boolean by kind, never inside a JSON settings bag (S16)."
)


def upgrade() -> None:
    # One statement: asyncpg's extended query protocol forbids multiple commands
    # in one prepared statement (convention from 0001/0009/0012/0013). Plain
    # string for the DDL; only the COMMENT interpolates, and it is ASCII.
    op.execute(
        "ALTER TABLE tenants ADD COLUMN staff_money_visible boolean NOT NULL"
        " DEFAULT false"
    )
    op.execute(
        f"COMMENT ON COLUMN tenants.staff_money_visible IS"
        f" '{_STAFF_MONEY_VISIBLE_COMMENT}'"
    )


def downgrade() -> None:
    # The comment is an attribute OF the column and dies with it, so there is no
    # second statement here. Same shape as 0006's downgrade.
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS staff_money_visible")
