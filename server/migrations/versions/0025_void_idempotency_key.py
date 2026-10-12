r"""purchase_bills.void_idempotency_key: the key a void was made with, so a replay of THAT void
returns its original outcome while any other second void is refused.

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-12

WHAT THIS IS
------------
ADVISOR-DECIDED 2026-10-12 (desktop B3 red team, finding 4): a void record is the shop's
anti-fraud evidence and must never be overwritten. The route's write becomes conditional
(`UPDATE ... WHERE id = :id AND voided_at IS NULL`, app/bills.py void_bill), so a second void
of a voided bill is refused 409 and the first void's who/when/why stay as they were. Hard rule
4 asks one more thing of a write a client may repeat: a replay carrying the SAME idempotency
key must return the ORIGINAL outcome, not a refusal. That needs the key the void was made
with, stored on the row it voided -- this column.

  void_idempotency_key  text NULL. Written only by the void that voids the bill, in the same
                        UPDATE as voided_at/voided_by/void_reason; never written again (the
                        conditional UPDATE cannot match a voided row). NULL for every bill
                        voided before 0025 and for any void whose client sent no key (the
                        phone today), which simply has no replay to recognise.

The CHECK `purchase_bills_void_key_needs_void` holds the key to the void triple: a key may
exist only on a voided bill. No index: the key is compared only on the one row a void names.

NO DATA IS TOUCHED. The column is added NULL everywhere; the read-back counts that no row
carries a key, and the CHECK is validated against every existing row in the same transaction.
Downgrade REFUSES, naming the count, if any row carries a key (dropping it would destroy the
evidence a replay is recognised by); otherwise it drops the CHECK and the column.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0025"
down_revision: Union[str, None] = "0024"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_CHECK = "purchase_bills_void_key_needs_void"


def upgrade() -> None:
    bind = op.get_bind()
    op.execute("ALTER TABLE purchase_bills ADD COLUMN void_idempotency_key text")
    op.execute(
        f"ALTER TABLE purchase_bills ADD CONSTRAINT {_CHECK}"
        " CHECK (void_idempotency_key IS NULL OR voided_at IS NOT NULL)"
    )
    # FORCE RLS would hide every row from the owner here (lessons/a-migration-reads-zero-under-
    # force-rls.md), so the read-back asks the catalogue, which RLS does not filter.
    cols = bind.exec_driver_sql(
        "SELECT count(*) FROM information_schema.columns"
        " WHERE table_name = 'purchase_bills' AND column_name = 'void_idempotency_key'"
        " AND is_nullable = 'YES' AND data_type = 'text'"
    ).scalar()
    checks = bind.exec_driver_sql(
        f"SELECT count(*) FROM pg_constraint WHERE conname = '{_CHECK}' AND convalidated"
    ).scalar()
    if cols != 1 or checks != 1:
        raise RuntimeError(
            f"REFUSING 0025: column rows={cols} (want 1, nullable text), validated CHECK rows={checks}"
            " (want 1). Nothing is committed."
        )


def downgrade() -> None:
    bind = op.get_bind()
    has = bind.exec_driver_sql(
        "SELECT count(*) FROM information_schema.columns"
        " WHERE table_name = 'purchase_bills' AND column_name = 'void_idempotency_key'"
    ).scalar()
    if has == 0:
        return
    op.execute("ALTER TABLE purchase_bills NO FORCE ROW LEVEL SECURITY")
    try:
        keyed = bind.exec_driver_sql(
            "SELECT count(*) FROM purchase_bills WHERE void_idempotency_key IS NOT NULL"
        ).scalar()
    finally:
        op.execute("ALTER TABLE purchase_bills FORCE ROW LEVEL SECURITY")
    if keyed:
        raise RuntimeError(
            "REFUSING to downgrade 0025: a live row depends on what it would drop.\n"
            f"  voided bills carrying the key their void was made with : {keyed}\n"
            "\n"
            "WHY THAT IS NOT SAFE: the key is how a replay of that void is recognised and answered"
            " with its original outcome; dropping it turns a safe replay into a refusal.\n"
        )
    op.execute(f"ALTER TABLE purchase_bills DROP CONSTRAINT {_CHECK}")
    op.execute("ALTER TABLE purchase_bills DROP COLUMN void_idempotency_key")
