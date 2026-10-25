r"""Close the stock ledger's gap: every purchase line has its movement (M2, lane A, 2026-10-25).

WHY THIS EXISTS. Migration 0029 backfilled one purchase movement per existing purchase line, and the server
commit that teaches POST /bills and POST /bills/{id}/void to write movements came AFTER it. Between the two, the
gate's dev-targeting proofs posted and voided bills on dev through the old route, which wrote no movement: on dev
3741 purchase lines against 3707 purchase movements, and 627 voided lines against 619 reversals (measured by
prove_m2_schema B1 in _prove_all/20261025T085702Z). A dump of dev carries that gap into every scratch, and the
reconciler's S1 (every purchase line has its one movement) is red on all of them.

WHAT IT DOES. The same backfill as 0029, restricted to what is missing: a purchase movement for every line with
none, and a reversal for every line of a voided bill whose purchase movement has none -- each marked
recorded_by_migration, as 0029's are. IDEMPOTENT: on a database with no gap it inserts nothing. No purchase row
changes (digested before and after).

DOWNGRADE does nothing: the rows it adds are marked, and 0029's downgrade already treats marked movements as its
own reconstruction.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0030"
down_revision: Union[str, None] = "0029"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_LIFTED = ("purchase_bills", "purchase_bill_items", "stock_movements")


def _digest(bind) -> tuple:
    return bind.exec_driver_sql(
        "SELECT count(*), coalesce(md5(string_agg(row(i.id, i.quantity, i.net_weight, i.amount, b.voided_at)::text, '|'"
        " ORDER BY i.id)), '') FROM purchase_bill_items i JOIN purchase_bills b ON b.id = i.bill_id").one()


def upgrade() -> None:
    bind = op.get_bind()
    for t in _LIFTED:
        op.execute(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")
    try:
        before = _digest(bind)
        op.execute(
            """
            INSERT INTO stock_movements (tenant_id, branch_id, product_id, kind, quantity, value, purchase_item_id,
                                         recorded_by_migration, created_at)
            SELECT i.tenant_id, b.branch_id, i.product_id, 'purchase', coalesce(i.quantity, i.net_weight), i.amount,
                   i.id, true, b.server_received_at
              FROM purchase_bill_items i JOIN purchase_bills b ON b.id = i.bill_id
             WHERE NOT EXISTS (SELECT 1 FROM stock_movements m WHERE m.purchase_item_id = i.id AND m.kind = 'purchase')
            """
        )
        op.execute(
            """
            INSERT INTO stock_movements (tenant_id, branch_id, product_id, kind, quantity, value, purchase_item_id,
                                         reverses_movement_id, recorded_by_migration, created_at)
            SELECT m.tenant_id, m.branch_id, m.product_id, 'void_purchase', -m.quantity, -m.value, m.purchase_item_id,
                   m.id, true, b.voided_at
              FROM stock_movements m
              JOIN purchase_bill_items i ON i.id = m.purchase_item_id
              JOIN purchase_bills b ON b.id = i.bill_id
             WHERE m.kind = 'purchase' AND b.voided_at IS NOT NULL
               AND NOT EXISTS (SELECT 1 FROM stock_movements r WHERE r.reverses_movement_id = m.id)
            """
        )
        if _digest(bind) != before:
            raise RuntimeError("REFUSING 0030: purchase lines changed under the migration. Nothing is committed.")
        gap = bind.exec_driver_sql(
            "SELECT (SELECT count(*) FROM purchase_bill_items i WHERE NOT EXISTS (SELECT 1 FROM stock_movements m"
            "          WHERE m.purchase_item_id = i.id AND m.kind = 'purchase')),"
            "       (SELECT count(*) FROM stock_movements m JOIN purchase_bill_items i ON i.id = m.purchase_item_id"
            "          JOIN purchase_bills b ON b.id = i.bill_id WHERE m.kind = 'purchase' AND b.voided_at IS NOT NULL"
            "          AND NOT EXISTS (SELECT 1 FROM stock_movements r WHERE r.reverses_movement_id = m.id))"
        ).one()
        if any(gap):
            raise RuntimeError(f"REFUSING 0030: the gap remains after the backfill {tuple(gap)}. Nothing is committed.")
    finally:
        for t in _LIFTED:
            op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    pass
