r"""M1 rulings R2 and R3 (ADVISOR-DECIDED 2026-10-25): a unit's KIND, and the owner's flag table.

R1 (separate_cashier, shifts_enabled and the accepted payment methods are OWNER-only) needs no schema:
it is a reclassification in app/policy.py's catalogue, enforced where each is written.

R2 -- uoms.kind  ('weight' | 'count', NULLABLE)
  A product priced per piece or as a lump must carry a COUNTING unit, never a weight unit: "3 x 40.00"
  on a line whose unit is Kilogram reads as three kilograms. The schema did not know which unit is
  which (uoms held code and name only), so this column declares it. NULL means NOT DECLARED, and that
  is the value every existing unit gets: classifying a shop's units from their names would be a guess
  written into its master data, and a guess here decides whether a product may be counted. The route
  refuses a piece/lump product on a unit not declared 'count' (create, or an edit of its basis or
  unit); the owner's list (GET /products/unit-mismatches) names every existing product that is priced
  by count on a unit not declared 'count', so the shop declares its units or moves its products --
  NO product is changed by this migration or by any route on its behalf.

R3 -- owner_flags (append-only)
  A line declares the rule it was priced under (0027); the server re-derives it and does NOT substitute
  the shop's setting, because offline money is already paid. R3 keeps that and makes the difference
  VISIBLE: when the rule a line declares differs from the shop's setting effective at the line's
  device_created_at, the line is accepted and a flag row is written in the SAME transaction, so the
  owner's exception view (planned) can list it. A table of its own rather than a column on the line:
  M2 will flag a sale line AFTER it was written (a late purchase moving its cost), and a sale line is
  never edited, so the flag has to live beside the line, not on it. One table for every kind of
  exception the owner reviews; this migration mints the first kind, 'off_rule'. M2 widens the CHECK.

  The flag carries what was declared AND what was in force, so the view never re-derives a setting's
  history later. Append-only at the grant level: recycle_app holds SELECT and INSERT, no UPDATE, no
  DELETE. Not audited: a transactional table, its author is the bill's.

  "The setting effective at device_created_at" is read out of audit_log (0017/0018): the value now,
  walked back over every audited UPDATE after that instant (app/policy.py rules_effective_at). audit_log
  is the only history a setting has; nothing deletes its rows (0017's retention note).

ALSO: uq_items_tenant_id UNIQUE (tenant_id, id) on purchase_bill_items -- the composite FK target the
flag needs (ARCHITECTURE 4 point 1: a cross-table reference carries tenant_id). id is the primary key,
so the pair is unique already and the constraint cannot fail on existing rows.

DOWNGRADE refuses while any flag exists or any unit has been declared: either would be lost.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0028"
down_revision: Union[str, None] = "0027"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TENANT_MATCH = "NULLIF(current_setting('app.tenant_id', true), '')::uuid"
UOM_KINDS = ("weight", "count")
FLAG_KINDS = ("off_rule",)
OFF_RULE_KEYS = ("rounding_rule", "deduction_mode", "pricing_basis")

# ASCII only, no quotes, no braces (the 0015..0027 convention).
_UOM_KIND_COMMENT = (
    "What a unit measures (migration 0028, ruling R2): weight or count. NULL = not declared. A product "
    "priced per piece or as a lump must carry a unit declared count; the route refuses otherwise and "
    "GET /products/unit-mismatches lists existing products that do not."
)
_FLAGS_COMMENT = (
    "Exceptions for the owner to review (migration 0028, ruling R3). APPEND-ONLY: recycle_app holds "
    "SELECT and INSERT only. kind off_rule: a purchase line whose declared rule differs from the shop "
    "setting effective at its device_created_at -- accepted, because offline money is already paid, and "
    "flagged here with what it declared and what was in force."
)


def _in(values: Sequence[str]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    bind = op.get_bind()

    op.execute("ALTER TABLE uoms ADD COLUMN kind text")
    op.execute(f"ALTER TABLE uoms ADD CONSTRAINT ck_uoms_kind CHECK (kind IS NULL OR kind IN ({_in(UOM_KINDS)}))")
    op.execute(f"COMMENT ON COLUMN uoms.kind IS '{_UOM_KIND_COMMENT}'")

    op.execute("ALTER TABLE purchase_bill_items ADD CONSTRAINT uq_items_tenant_id UNIQUE (tenant_id, id)")

    keys = f"ARRAY[{_in(OFF_RULE_KEYS)}]::text[]"
    op.execute(
        f"""
        CREATE TABLE owner_flags (
            id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id                uuid        NOT NULL REFERENCES tenants (id),
            branch_id                uuid        NOT NULL,
            kind                     text        NOT NULL,
            purchase_item_id         uuid,
            off_rule_keys            text[],
            declared_rounding_rule   text,
            effective_rounding_rule  text,
            declared_deduction_mode  text,
            effective_deduction_mode text,
            declared_pricing_basis   text,
            effective_pricing_basis  text,
            effective_at             timestamptz,
            created_at               timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT fk_owner_flags_branch
                FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id),
            CONSTRAINT fk_owner_flags_purchase_item
                FOREIGN KEY (tenant_id, purchase_item_id) REFERENCES purchase_bill_items (tenant_id, id),
            CONSTRAINT ck_owner_flags_kind CHECK (kind IN ({_in(FLAG_KINDS)})),
            CONSTRAINT ck_owner_flags_off_rule CHECK (
                kind <> 'off_rule' OR (
                    purchase_item_id IS NOT NULL
                    AND off_rule_keys IS NOT NULL AND cardinality(off_rule_keys) > 0
                    AND off_rule_keys <@ {keys}
                    AND declared_rounding_rule IS NOT NULL AND effective_rounding_rule IS NOT NULL
                    AND declared_deduction_mode IS NOT NULL AND effective_deduction_mode IS NOT NULL
                    AND declared_pricing_basis IS NOT NULL AND effective_pricing_basis IS NOT NULL
                    AND effective_at IS NOT NULL))
        )
        """
    )
    # One off_rule flag per line: the flag is written in the line's own transaction, once.
    op.execute("CREATE UNIQUE INDEX uq_owner_flags_purchase_item ON owner_flags (tenant_id, kind, purchase_item_id)"
               " WHERE purchase_item_id IS NOT NULL")
    op.execute("CREATE INDEX ix_owner_flags_tenant_created ON owner_flags (tenant_id, created_at)")
    op.execute(f"COMMENT ON TABLE owner_flags IS '{_FLAGS_COMMENT}'")

    op.execute("ALTER TABLE owner_flags ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE owner_flags FORCE ROW LEVEL SECURITY")
    op.execute(f"CREATE POLICY tenant_isolation ON owner_flags USING (tenant_id = {_TENANT_MATCH})"
               f" WITH CHECK (tenant_id = {_TENANT_MATCH})")
    # ALTER DEFAULT PRIVILEGES hands recycle_app arwd; the REVOKE is what makes it append-only.
    op.execute("GRANT SELECT, INSERT ON owner_flags TO recycle_app")
    op.execute("REVOKE UPDATE, DELETE ON owner_flags FROM recycle_app")

    n = bind.exec_driver_sql(
        "SELECT count(*) FROM pg_constraint WHERE conname IN ('ck_uoms_kind', 'uq_items_tenant_id',"
        " 'fk_owner_flags_branch', 'fk_owner_flags_purchase_item', 'ck_owner_flags_kind', 'ck_owner_flags_off_rule')"
    ).scalar()
    priv = bind.exec_driver_sql(
        "SELECT has_table_privilege('recycle_app', 'owner_flags', 'UPDATE')"
        " OR has_table_privilege('recycle_app', 'owner_flags', 'DELETE')"
    ).scalar()
    if n != 6 or priv:
        raise RuntimeError(f"REFUSING 0028: constraints={n} (want 6), recycle_app can update/delete flags={priv}.")


def downgrade() -> None:
    bind = op.get_bind()
    op.execute("ALTER TABLE uoms NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE owner_flags NO FORCE ROW LEVEL SECURITY")
    try:
        held = bind.exec_driver_sql(
            "SELECT (SELECT count(*) FROM owner_flags), (SELECT count(*) FROM uoms WHERE kind IS NOT NULL)"
        ).one()
    finally:
        op.execute("ALTER TABLE uoms FORCE ROW LEVEL SECURITY")
    if any(held):
        raise RuntimeError(
            f"REFUSING to downgrade 0028: owner flags={held[0]}, units with a declared kind={held[1]}. Dropping"
            " them would lose the owner's exception record or a shop's declaration. Nothing is changed."
        )
    op.execute("DROP TABLE owner_flags")
    op.execute("ALTER TABLE purchase_bill_items DROP CONSTRAINT uq_items_tenant_id")
    op.execute("ALTER TABLE uoms DROP CONSTRAINT ck_uoms_kind, DROP COLUMN kind")
