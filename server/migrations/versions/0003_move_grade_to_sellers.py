"""move grade: drop from purchase_bill_items, add to sellers (SRS 1.6)

Revision ID: 0003
Revises: 0002
Create Date: 2026-07-20

grade was added to purchase_bill_items in 0001 beyond the agreed item spec —
a schema-audit slip (see lessons/schema-audit.md). Line items do not carry a
grade. Per SRS 1.6 the grade belongs to the SELLER: the customer grade that
maps to product_prices tiers. No auto-pricing logic yet — this only puts the
column in the right place.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Dropping the column also drops its inline CHECK (grade IN 'A'..'D').
    op.execute("ALTER TABLE purchase_bill_items DROP COLUMN grade")

    # Seller carries an optional customer grade; the CHECK allows NULL and
    # otherwise restricts to A-D.
    op.execute("ALTER TABLE sellers ADD COLUMN grade text")
    op.execute(
        "ALTER TABLE sellers ADD CONSTRAINT ck_sellers_grade"
        " CHECK (grade IN ('A', 'B', 'C', 'D'))"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE sellers DROP CONSTRAINT IF EXISTS ck_sellers_grade")
    op.execute("ALTER TABLE sellers DROP COLUMN IF EXISTS grade")
    # Restore the 0002 state: nullable grade on items, with the A-D CHECK.
    op.execute("ALTER TABLE purchase_bill_items ADD COLUMN grade text")
    op.execute(
        "ALTER TABLE purchase_bill_items ADD CONSTRAINT ck_items_grade"
        " CHECK (grade IN ('A', 'B', 'C', 'D'))"
    )
