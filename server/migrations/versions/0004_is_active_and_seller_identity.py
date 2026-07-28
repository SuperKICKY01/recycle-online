"""master-data retirement (is_active) + seller identity fields (SRS 1.6)

Revision ID: 0004
Revises: 0003
Create Date: 2026-07-28

WHY is_active EXISTS AT ALL
---------------------------
Master-data rows are referenced by bills through composite (tenant_id, id)
foreign keys, and a bill is a receipt for real money that must stay readable
for years. So a row can never be deleted — proveCold C6 showed exactly what a
removed product does to history: a priced line rendering with a blank code.

But a shop still needs to take a mistyped product or a departed seller OUT of
the picker. That is retirement, not deletion: the row stays, keeps its code and
name, keeps answering every historical bill that points at it, and simply stops
being offered for NEW work. `is_active` is the whole of that distinction.

DEFAULT true IS WHAT MAKES THIS SAFE ON A LIVE TABLE. Every existing row becomes
active, which is the state it is already in — the migration cannot change the
meaning of any current data. Postgres 11+ records a non-volatile default in the
catalogue instead of rewriting the table, so this does not lock the tables for a
rewrite either.

NO INDEX ON is_active, deliberately. These are per-shop master-data tables — the
live database has 46 products and 48 sellers across 42 tenants. The RLS tenant
predicate already reduces every scan to one shop's handful of rows, and a
low-cardinality boolean index on top of that would be read less often than it is
maintained. Add one when a real shop's list makes it measurable, not before.

SELLER IDENTITY FIELDS
----------------------
id_number, address and vehicle_no, per SRS 1.6. All THREE ARE NULLABLE, and that
is not laziness: a yard weighs a walk-in's scrap and pays cash long before it has
their address, and refusing the seller row would refuse the purchase. The bill
header already carries its own vehicle_no for the truck that turned up on the
day; the seller's vehicle_no is the one they usually arrive in, which is a
different fact and is why it lives here as well as there.

NO UNIQUE CONSTRAINT ON id_number, also deliberate. A national id looks like a
natural key and is not a usable one here: it is frequently unknown, is entered by
hand at a weighbridge, and a UNIQUE would turn a typo in one seller's row into a
refusal to create an unrelated one. If the office wants duplicates surfaced, that
is a report, not a constraint. Revisit only with a real shop's data in hand.

No privilege changes: table-level grants from 0001 already cover future columns,
and RLS policies are per-table, not per-column, so the existing tenant_isolation
policies apply to these columns unchanged (cf. lessons/revoke-in-migration.md —
there is genuinely nothing to grant here, which is not the same as forgetting).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Every master-data table a bill can reference, directly or through a product.
_RETIRABLE = ["sellers", "products", "uoms", "product_categories"]

# text, nullable — see the docstring on why each one is nullable.
_SELLER_FIELDS = ["id_number", "address", "vehicle_no"]


def upgrade() -> None:
    for table in _RETIRABLE:
        op.execute(
            f"ALTER TABLE {table}"
            f" ADD COLUMN is_active boolean NOT NULL DEFAULT true"
        )

    for column in _SELLER_FIELDS:
        op.execute(f"ALTER TABLE sellers ADD COLUMN {column} text")


def downgrade() -> None:
    for column in reversed(_SELLER_FIELDS):
        op.execute(f"ALTER TABLE sellers DROP COLUMN IF EXISTS {column}")

    for table in reversed(_RETIRABLE):
        op.execute(f"ALTER TABLE {table} DROP COLUMN IF EXISTS is_active")
