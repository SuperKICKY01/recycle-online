r"""Money rules a shop configures -- deductions, rounding, pricing basis -- and the snapshot every line keeps.

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-24

WHAT THIS IS
------------
ADVISOR-DECIDED 2026-10-24 (M1). A shop configures how an impurity deduction is entered, how a line's
amount is rounded and how a product is priced; each bill line stores the rule values it used; changing
a setting never changes an existing bill. STRUCTURE.md 1.2 (where a declared policy lives) and 2.3 (the
bill line, rewritten once) were re-derived for it; where this departs from 2.3 it says so below.

THE SETTINGS -- typed columns, never a bag (S16), each with its own CHECK; read through ONE reader
(app/policy.py ShopPolicy); written by owner-only routes (the catalogue in policy.py says which):
  tenants.deduction_mode             'none'|'kg'|'percent'|'both'  NOT NULL DEFAULT 'none'
  tenants.deduction_reason_required  boolean                       NOT NULL DEFAULT false
  tenants.rounding_rule              one of ROUNDING_RULES         NOT NULL DEFAULT 'half_up_0.01'
  branches.rounding_rule             one of ROUNDING_RULES, NULL = the shop's
  products.deduction_mode            'none'|'kg'|'percent'|'both', NULL = the shop's
  products.pricing_basis             'weight'|'piece'|'lump'       NOT NULL DEFAULT 'weight'
Every default is TODAY'S BEHAVIOUR: no deduction, half-up to the satang, priced by weight. A shop that
never opens the settings screen computes every bill exactly as before.

THE ROUNDING RULES, a fixed list and why each is on it. The amount is NUMERIC end to end (hard rule 1);
a rule only chooses the step and the direction, applied to the exact product quantity x unit_price:
  half_up_0.01  nearest satang, ties up -- the rule every bill used until now (the default)
  down_0.01     satang, remainder dropped
  half_up_0.25  nearest 25 satang, ties up -- the smallest coin a yard pays out in practice
  down_0.25     25 satang, remainder dropped
  half_up_1     nearest baht, ties up
  down_1        whole baht, remainder dropped ("ปัดเศษทิ้ง", the common yard habit)
No rule rounds UP unconditionally and none rounds to anything coarser than a baht: both would move the
paid figure by more than the smallest coin, which is a price change, not a rounding. Rounding is per
LINE (the phone and the server both round each line, then sum -- the order cart.ts already documents);
a bill-level rounding_adjustment (STRUCTURE 2.3) is NOT built: one rounding per line keeps the total
the plain sum the reconciler's T1 already checks.

THE LINE -- what each new purchase_bill_items column records, and the CHECKs that bind them:
  deduction_mode    'none'|'kg'|'percent'         how the impurity deduction was entered
  deduction_pct     NUMERIC(5,2)  (0, 100]        the percent typed, percent mode only
  deduction_weight  NUMERIC(14,3) >= 0, DEFAULT 0 the weight deducted (kg typed, or derived from pct)
  deduction_reason  text <= 200                    the reason given, if any
  pricing_basis     'weight'|'piece'|'lump'
  quantity          NUMERIC(14,3)                  what the price multiplies
  rounding_rule     one of ROUNDING_RULES
  unit_code, unit_name                             the product's unit at the moment the line was received
  tier_code                                        the grade the list_price was taken at (0003 dropped
                                                   the line's grade; this restores what the snapshot needs)
ck_items_net is REDEFINED, keeping its name (prove_reconcile drops it by name to plant T3):
    net_weight = gross_weight - tare_weight - deduction_weight
Every existing row satisfies it unchanged, because deduction_weight is 0 on every one of them.

TWO SHAPES OF LINE, AND ONLY TWO (ck_items_rules): every snapshot column NULL -- a line received before
this migration, whose rules were never recorded -- or every one present. A half-recorded line is
unrepresentable. A NULL snapshot is NOT backfilled: the unit and the grade a pre-0027 line was priced
at are not knowable now (products.uom_id and sellers.grade are both editable), and writing today's
values onto last year's lines would be a wrong number dressed as a record
(lessons/fallback-default-is-a-wrong-number.md). No existing column of any existing line is written by
this migration; the read-back below proves it, column by column, against a hash taken before.

On a recorded line the arithmetic is enforced HERE, not only in the route:
  ck_items_deduction  mode none: pct NULL, weight 0, reason NULL; kg: pct NULL, weight > 0;
                      percent: weight = round((gross - tare) * pct / 100, 3)  (half away from zero, which
                      is half-up on the non-negative values the CHECKs allow)
  ck_items_quantity   weight: quantity = net_weight; piece: a whole number > 0, no deduction;
                      lump: quantity = 1, no deduction
  ck_items_amount     amount = line_amount_rounded(quantity, unit_price, rounding_rule) IS TRUE
line_amount_rounded is an IMMUTABLE SQL function with search_path pinned; an unknown rule yields NULL
and the IS TRUE wrapper turns that into a refusal, never a pass. The reconciler does NOT call it: its
T2 restates the arithmetic in its own SQL (a checker must not share the code it checks).

DEPARTURES FROM STRUCTURE 2.3, stated: no containers table (tare stays a typed kg, as today); no
item_ref; no rounding_adjustment (above); the deduction is a kg OR a percent of (gross - tare) and lands
in net_weight itself (the brief's "Net = gross - tare - deduction") instead of a separate payable_weight.

THE MIGRATION MEASURES ITSELF. Before: a hash of every existing line's existing columns, and the count of
lines. After: the same hash, equal; every existing line has the all-NULL snapshot; the new columns,
CHECKs and function exist. Downgrade REFUSES where dropping would destroy evidence or a shop's
declaration: any line priced under a non-default rule (a deduction, another rounding rule, another
basis) and any setting not at its default. A line under the default rules is let go: 0026 states it
fully by its own net, price and amount, and only its unit and tier labels are lost (downgrade() says why).
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0027"
down_revision: Union[str, None] = "0026"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Restated by hand in app/money_rules.py and app/policy.py (a migration is not a library); the
# settings proof compares the three sets member by member.
ROUNDING_RULES = ("half_up_0.01", "down_0.01", "half_up_0.25", "down_0.25", "half_up_1", "down_1")
DEDUCTION_SETTINGS = ("none", "kg", "percent", "both")
LINE_DEDUCTION_MODES = ("none", "kg", "percent")
PRICING_BASES = ("weight", "piece", "lump")

_LIFTED = ("purchase_bill_items", "tenants", "branches", "products")
_SNAPSHOT = ("deduction_mode", "pricing_basis", "quantity", "rounding_rule", "unit_code", "unit_name",
             "tier_code")
_OLD_ITEM_COLUMNS = ("id", "tenant_id", "bill_id", "product_id", "line_no", "gross_weight", "tare_weight",
                     "net_weight", "unit_price", "list_price", "amount")


def _in(values: Sequence[str]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def _lift(bind) -> None:
    # FORCE RLS hides every row from the owner (lessons/a-migration-reads-zero-under-force-rls.md):
    # lifted for this migration's own reads, restored before it returns.
    for t in _LIFTED:
        bind.exec_driver_sql(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")


def _restore(bind) -> None:
    for t in _LIFTED:
        bind.exec_driver_sql(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")


def _old_lines_digest(bind) -> tuple[int, str]:
    cols = ", ".join(f"i.{c}" for c in _OLD_ITEM_COLUMNS)
    row = bind.exec_driver_sql(
        f"SELECT count(*), coalesce(md5(string_agg(row({cols})::text, '|' ORDER BY i.id)), '')"
        " FROM purchase_bill_items i"
    ).one()
    return int(row[0]), str(row[1])


def upgrade() -> None:
    bind = op.get_bind()
    _lift(bind)
    try:
        before = _old_lines_digest(bind)

        # ------------------------------------------------------------ the settings
        op.execute(
            "ALTER TABLE tenants"
            "  ADD COLUMN deduction_mode text NOT NULL DEFAULT 'none',"
            "  ADD COLUMN deduction_reason_required boolean NOT NULL DEFAULT false,"
            "  ADD COLUMN rounding_rule text NOT NULL DEFAULT 'half_up_0.01'"
        )
        op.execute(f"ALTER TABLE tenants ADD CONSTRAINT ck_tenants_deduction_mode"
                   f" CHECK (deduction_mode IN ({_in(DEDUCTION_SETTINGS)}))")
        op.execute(f"ALTER TABLE tenants ADD CONSTRAINT ck_tenants_rounding_rule"
                   f" CHECK (rounding_rule IN ({_in(ROUNDING_RULES)}))")
        op.execute("ALTER TABLE branches ADD COLUMN rounding_rule text")
        op.execute(f"ALTER TABLE branches ADD CONSTRAINT ck_branches_rounding_rule"
                   f" CHECK (rounding_rule IS NULL OR rounding_rule IN ({_in(ROUNDING_RULES)}))")
        op.execute(
            "ALTER TABLE products"
            "  ADD COLUMN deduction_mode text,"
            "  ADD COLUMN pricing_basis text NOT NULL DEFAULT 'weight'"
        )
        op.execute(f"ALTER TABLE products ADD CONSTRAINT ck_products_deduction_mode"
                   f" CHECK (deduction_mode IS NULL OR deduction_mode IN ({_in(DEDUCTION_SETTINGS)}))")
        op.execute(f"ALTER TABLE products ADD CONSTRAINT ck_products_pricing_basis"
                   f" CHECK (pricing_basis IN ({_in(PRICING_BASES)}))")

        # ------------------------------------------------------- the rounding rule
        op.execute(
            """
            CREATE FUNCTION line_amount_rounded(p_quantity numeric, p_price numeric, p_rule text)
                RETURNS numeric
                LANGUAGE sql IMMUTABLE PARALLEL SAFE
                SET search_path = pg_catalog
            AS $fn$
                SELECT CASE p_rule
                    WHEN 'half_up_0.01' THEN round(p_quantity * p_price, 2)
                    WHEN 'down_0.01'    THEN trunc(p_quantity * p_price, 2)
                    WHEN 'half_up_0.25' THEN round(round(p_quantity * p_price * 4, 0) / 4, 2)
                    WHEN 'down_0.25'    THEN round(trunc(p_quantity * p_price * 4, 0) / 4, 2)
                    WHEN 'half_up_1'    THEN round(p_quantity * p_price, 0)
                    WHEN 'down_1'       THEN trunc(p_quantity * p_price, 0)
                    ELSE NULL
                END
            $fn$
            """
        )

        # ------------------------------------------------------------- the line
        op.execute(
            "ALTER TABLE purchase_bill_items"
            "  ADD COLUMN deduction_mode text,"
            "  ADD COLUMN deduction_pct numeric(5, 2),"
            "  ADD COLUMN deduction_weight numeric(14, 3) NOT NULL DEFAULT 0,"
            "  ADD COLUMN deduction_reason text,"
            "  ADD COLUMN pricing_basis text,"
            "  ADD COLUMN quantity numeric(14, 3),"
            "  ADD COLUMN rounding_rule text,"
            "  ADD COLUMN unit_code text,"
            "  ADD COLUMN unit_name text,"
            "  ADD COLUMN tier_code text"
        )
        op.execute("ALTER TABLE purchase_bill_items DROP CONSTRAINT ck_items_net")
        op.execute("ALTER TABLE purchase_bill_items ADD CONSTRAINT ck_items_net"
                   " CHECK (net_weight = gross_weight - tare_weight - deduction_weight)")
        op.execute("ALTER TABLE purchase_bill_items ADD CONSTRAINT ck_items_deduction_weight"
                   " CHECK (deduction_weight >= 0)")
        op.execute("ALTER TABLE purchase_bill_items ADD CONSTRAINT ck_items_deduction_reason_len"
                   " CHECK (deduction_reason IS NULL OR char_length(deduction_reason) BETWEEN 1 AND 200)")
        op.execute(f"ALTER TABLE purchase_bill_items ADD CONSTRAINT ck_items_deduction_mode"
                   f" CHECK (deduction_mode IS NULL OR deduction_mode IN ({_in(LINE_DEDUCTION_MODES)}))")
        op.execute(f"ALTER TABLE purchase_bill_items ADD CONSTRAINT ck_items_pricing_basis"
                   f" CHECK (pricing_basis IS NULL OR pricing_basis IN ({_in(PRICING_BASES)}))")
        op.execute(f"ALTER TABLE purchase_bill_items ADD CONSTRAINT ck_items_rounding_rule"
                   f" CHECK (rounding_rule IS NULL OR rounding_rule IN ({_in(ROUNDING_RULES)}))")
        all_null = " AND ".join(f"{c} IS NULL" for c in _SNAPSHOT)
        all_set = " AND ".join(f"{c} IS NOT NULL" for c in _SNAPSHOT)
        op.execute("ALTER TABLE purchase_bill_items ADD CONSTRAINT ck_items_rules"
                   f" CHECK (({all_null} AND deduction_pct IS NULL AND deduction_weight = 0"
                   f"         AND deduction_reason IS NULL)"
                   f"        OR ({all_set}))")
        op.execute(
            "ALTER TABLE purchase_bill_items ADD CONSTRAINT ck_items_deduction CHECK ("
            " deduction_mode IS NULL"
            " OR (deduction_mode = 'none' AND deduction_pct IS NULL AND deduction_weight = 0"
            "     AND deduction_reason IS NULL)"
            " OR (deduction_mode = 'kg' AND deduction_pct IS NULL AND deduction_weight > 0)"
            " OR (deduction_mode = 'percent' AND deduction_pct > 0 AND deduction_pct <= 100"
            "     AND deduction_weight = round((gross_weight - tare_weight) * deduction_pct / 100, 3)))"
        )
        op.execute(
            "ALTER TABLE purchase_bill_items ADD CONSTRAINT ck_items_quantity CHECK ("
            " pricing_basis IS NULL"
            " OR (pricing_basis = 'weight' AND quantity = net_weight)"
            " OR (pricing_basis = 'piece' AND quantity > 0 AND quantity = trunc(quantity)"
            "     AND deduction_mode = 'none')"
            " OR (pricing_basis = 'lump' AND quantity = 1 AND deduction_mode = 'none'))"
        )
        op.execute(
            "ALTER TABLE purchase_bill_items ADD CONSTRAINT ck_items_amount CHECK ("
            " rounding_rule IS NULL"
            " OR (amount = public.line_amount_rounded(quantity, unit_price, rounding_rule)) IS TRUE)"
        )

        # ----------------------------------------------------------- the read-back
        after = _old_lines_digest(bind)
        if after != before:
            raise RuntimeError(f"REFUSING 0027: existing lines changed under the migration ({before} -> {after})."
                               " Nothing is committed.")
        recorded = bind.exec_driver_sql(
            "SELECT count(*) FROM purchase_bill_items WHERE rounding_rule IS NOT NULL"
            " OR deduction_weight <> 0").scalar()
        if recorded:
            raise RuntimeError(f"REFUSING 0027: {recorded} existing line(s) read back with a snapshot or a"
                               " deduction. Nothing is committed.")
        checks = bind.exec_driver_sql(
            "SELECT count(*) FROM pg_constraint WHERE conname IN ('ck_items_net', 'ck_items_rules',"
            " 'ck_items_deduction', 'ck_items_quantity', 'ck_items_amount', 'ck_items_deduction_weight',"
            " 'ck_items_deduction_reason_len', 'ck_items_deduction_mode', 'ck_items_pricing_basis',"
            " 'ck_items_rounding_rule', 'ck_tenants_deduction_mode', 'ck_tenants_rounding_rule',"
            " 'ck_branches_rounding_rule', 'ck_products_deduction_mode', 'ck_products_pricing_basis')"
        ).scalar()
        funcs = bind.exec_driver_sql("SELECT count(*) FROM pg_proc WHERE proname = 'line_amount_rounded'").scalar()
        if checks != 15 or funcs != 1:
            raise RuntimeError(f"REFUSING 0027: checks={checks} (want 15), functions={funcs} (want 1).")
    finally:
        _restore(bind)


def downgrade() -> None:
    bind = op.get_bind()
    _lift(bind)
    try:
        # WHAT THE REFUSAL GUARDS, AND WHAT IT DELIBERATELY LETS GO (measured 2026-10-24: refusing on
        # ANY recorded line made 0027 impossible to roll back once a single bill was written, which
        # reddened every proof that downgrades a used scratch). A line whose rules are the pre-0027 ones
        # -- weight-priced, nothing deducted, half-up to the satang -- is fully stated at 0026 by its
        # own net, price and amount; dropping its snapshot loses its unit and tier LABELS, which 0026
        # never held for any line, and no figure. A line with a deduction, another rounding rule or
        # another basis would lose the arithmetic its amount was computed under -- that is the evidence
        # this refuses to destroy, together with every setting a shop has moved off its default.
        held = bind.exec_driver_sql(
            "SELECT (SELECT count(*) FROM purchase_bill_items WHERE deduction_weight <> 0"
            "          OR coalesce(rounding_rule, 'half_up_0.01') <> 'half_up_0.01'"
            "          OR coalesce(pricing_basis, 'weight') <> 'weight'),"
            "       (SELECT count(*) FROM tenants WHERE deduction_mode <> 'none'"
            "          OR deduction_reason_required OR rounding_rule <> 'half_up_0.01'),"
            "       (SELECT count(*) FROM branches WHERE rounding_rule IS NOT NULL),"
            "       (SELECT count(*) FROM products WHERE deduction_mode IS NOT NULL"
            "          OR pricing_basis <> 'weight')"
        ).one()
        if any(held):
            raise RuntimeError(
                "REFUSING to downgrade 0027: dropping its columns would destroy evidence or a shop's"
                f" declaration -- lines priced under a non-default rule={held[0]}, tenants with a money rule set={held[1]},"
                f" branches with a rounding override={held[2]}, products with a rule set={held[3]}."
                " Nothing is changed."
            )
        for name in ("ck_items_amount", "ck_items_quantity", "ck_items_deduction", "ck_items_rules",
                     "ck_items_rounding_rule", "ck_items_pricing_basis", "ck_items_deduction_mode",
                     "ck_items_deduction_reason_len", "ck_items_deduction_weight", "ck_items_net"):
            op.execute(f"ALTER TABLE purchase_bill_items DROP CONSTRAINT {name}")
        op.execute("ALTER TABLE purchase_bill_items"
                   "  DROP COLUMN deduction_mode, DROP COLUMN deduction_pct, DROP COLUMN deduction_weight,"
                   "  DROP COLUMN deduction_reason, DROP COLUMN pricing_basis, DROP COLUMN quantity,"
                   "  DROP COLUMN rounding_rule, DROP COLUMN unit_code, DROP COLUMN unit_name,"
                   "  DROP COLUMN tier_code")
        op.execute("ALTER TABLE purchase_bill_items ADD CONSTRAINT ck_items_net"
                   " CHECK (net_weight = gross_weight - tare_weight)")
        op.execute("DROP FUNCTION line_amount_rounded(numeric, numeric, text)")
        op.execute("ALTER TABLE products DROP CONSTRAINT ck_products_pricing_basis,"
                   " DROP CONSTRAINT ck_products_deduction_mode,"
                   " DROP COLUMN pricing_basis, DROP COLUMN deduction_mode")
        op.execute("ALTER TABLE branches DROP CONSTRAINT ck_branches_rounding_rule, DROP COLUMN rounding_rule")
        op.execute("ALTER TABLE tenants DROP CONSTRAINT ck_tenants_rounding_rule,"
                   " DROP CONSTRAINT ck_tenants_deduction_mode,"
                   " DROP COLUMN rounding_rule, DROP COLUMN deduction_reason_required, DROP COLUMN deduction_mode")
        left = bind.exec_driver_sql(
            "SELECT (SELECT count(*) FROM information_schema.columns WHERE table_name = 'purchase_bill_items'"
            "          AND column_name IN ('deduction_weight', 'rounding_rule', 'tier_code'))"
            "     + (SELECT count(*) FROM pg_proc WHERE proname = 'line_amount_rounded')"
        ).scalar()
        if left:
            raise RuntimeError(f"REFUSING to finish downgrading 0027: {left} object(s) remain.")
    finally:
        _restore(bind)
