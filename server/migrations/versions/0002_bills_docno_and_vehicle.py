"""purchase bills: vehicle_no, gap-free per-tenant doc_no counter, relax grade

Revision ID: 0002
Revises: 0001
Create Date: 2026-07-20

Phase 1c support.

* purchase_bills.vehicle_no — truck/vehicle number on the bill header (optional).
* purchase_bill_items.grade — relaxed to NULLABLE. It was added NOT NULL in 0001
  beyond the documented item spec; the bill contract does not carry a grade, so
  it must not be required.
* doc_no_counters — a per-(tenant, be_year) counter used to assign a GAP-FREE
  human-readable doc_no. A native SEQUENCE is deliberately NOT used: sequences
  are not gap-free (nextval does not roll back on abort). This counter row is
  incremented in the SAME transaction as the bill insert and takes a row lock,
  so concurrent submits serialize (no collision) and an aborted submit releases
  its increment (no gap).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TENANT_MATCH = "NULLIF(current_setting('app.tenant_id', true), '')::uuid"


def upgrade() -> None:
    op.execute("ALTER TABLE purchase_bills ADD COLUMN vehicle_no text")

    op.execute("ALTER TABLE purchase_bill_items ALTER COLUMN grade DROP NOT NULL")

    op.execute(
        """
        CREATE TABLE doc_no_counters (
            tenant_id uuid    NOT NULL REFERENCES tenants (id),
            be_year   integer NOT NULL,
            last_seq  bigint  NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
            PRIMARY KEY (tenant_id, be_year)
        )
        """
    )
    op.execute("ALTER TABLE doc_no_counters ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE doc_no_counters FORCE ROW LEVEL SECURITY")
    op.execute(
        f"CREATE POLICY tenant_isolation ON doc_no_counters "
        f"USING (tenant_id = {_TENANT_MATCH}) "
        f"WITH CHECK (tenant_id = {_TENANT_MATCH})"
    )
    # DML only; the app increments the counter but never owns/DDLs it.
    op.execute(
        "GRANT SELECT, INSERT, UPDATE ON doc_no_counters TO recycle_app"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS doc_no_counters CASCADE")
    op.execute("ALTER TABLE purchase_bill_items ALTER COLUMN grade SET NOT NULL")
    op.execute("ALTER TABLE purchase_bills DROP COLUMN IF EXISTS vehicle_no")
