"""tenants.default_grade: a shop-wide fallback so a yard that does not grade
its sellers can still trade (S16, pulled by the feature per S17)

Revision ID: 0010
Revises: 0009
Create Date: 2026-08-18

WHAT THIS UNBLOCKS, and it is a whole shop shape rather than a convenience.
`POST /bills` reads the seller's grade and, when it is NULL, refuses the bill
with a resolvable 424 `seller_grade_unset` (server/app/bills.py). That refusal
is correct for a yard that DOES grade its sellers: the office sets the grade and
the same bill goes through unchanged. For a yard that does not use grades at
all, every walk-in seller hits it, and the only remedy is a trip back to the
office to set a grade the shop does not believe in. The bill cannot be priced
without one, because `product_prices` is keyed by grade.

A per-tenant default makes the grade a SHOP-LEVEL decision that a seller may
override, instead of a per-seller requirement with no default. A shop that
grades its sellers leaves this NULL and nothing changes for it.

NULLABLE ON PURPOSE, and the refusal is kept. NULL means "this shop has not
decided", which is exactly today's behaviour, so no existing tenant changes
meaning and no backfill invents a policy for a shop nobody asked. The 424 still
fires when the seller has no grade AND the tenant has no default — the path is
narrowed, never removed.

**THIS IS THE FIFTH SITE ENCODING THE GRADE SET A-D, AND S16 OPENS ALL OF THEM.**
Recorded here so whoever implements the per-tenant grade TABLE finds it rather
than discovering it. The other four are `product_prices.grade` and
`purchase_bill_items.grade` CHECKs in 0001, `ck_sellers_grade` in 0003, and
`Grade = Literal["A","B","C","D"]` in server/app/master.py. Adding a fifth was a
deliberate trade: S17 says a schema change is PULLED by the feature that needs
it, and waiting for S16 means a whole shop shape cannot trade until a much
larger piece of work lands. The alternative -- a per-tenant grade catalogue --
IS S16, and it is not this change.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Mirrors ck_sellers_grade exactly: NULL allowed, otherwise A-D. A shop that
    # has not decided is NULL, which is every shop that exists today.
    op.execute("ALTER TABLE tenants ADD COLUMN default_grade text")
    op.execute(
        "ALTER TABLE tenants ADD CONSTRAINT ck_tenants_default_grade"
        " CHECK (default_grade IN ('A', 'B', 'C', 'D'))"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE tenants DROP CONSTRAINT IF EXISTS ck_tenants_default_grade"
    )
    op.execute("ALTER TABLE tenants DROP COLUMN IF EXISTS default_grade")
