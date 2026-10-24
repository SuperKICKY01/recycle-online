"""A bill line's arithmetic under the shop's money rules (migration 0027, ADVISOR-DECIDED 2026-10-24 M1).

PURE: Decimal in, Decimal out, no I/O, no float. The route (bills.create_bill) computes every stored
figure here; the phone's twin is mobile/src/money/lineRules.ts; both are held to ONE data file of golden
vectors, golden/line_rules_vectors.json, read by scripts/prove_line_rules.py and the phone's
`npm run prove:linerules`. Perturb one vector and both suites go red -- that is the parity proof.

THE SERVER IS AUTHORITATIVE, AND IT COMPUTES WITH THE RULE THE LINE DECLARES. A line carries the rule
values the phone applied when the load was weighed (deduction mode and value, pricing basis, rounding
rule); the server re-derives deduction weight, net, quantity and amount from them with its own arithmetic
and refuses (422, permanent) any figure that does not follow. It does NOT substitute the shop's current
setting: a bill weighed offline under one rule and synced after the owner changed it was paid under the
first, and refusing or re-pricing it would rewrite money already handed over (STRUCTURE.md invariant 1:
a switch never appears on a write path's acceptance test). The setting decides what the PHONE offers;
the line records what was used.

THE RULES (the migration's docstring says why each is on the list):
  deduction  none | kg (a weight typed) | percent (of gross - tare, half-up to 0.001 kg)
  net        gross - tare - deduction_weight
  quantity   weight: net | piece: a whole number of pieces | lump: 1
  amount     rounding_rule applied to quantity x unit_price
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal

# Restated from migration 0027 (a migration is not a library); prove_line_rules compares the sets.
ROUNDING_RULES: tuple[str, ...] = ("half_up_0.01", "down_0.01", "half_up_0.25", "down_0.25", "half_up_1", "down_1")
DEFAULT_ROUNDING_RULE = "half_up_0.01"
DEDUCTION_SETTINGS: tuple[str, ...] = ("none", "kg", "percent", "both")
LINE_DEDUCTION_MODES: tuple[str, ...] = ("none", "kg", "percent")
PRICING_BASES: tuple[str, ...] = ("weight", "piece", "lump")

_W = Decimal("0.001")
_M = Decimal("0.01")
_HUNDRED = Decimal(100)
_STEPS: dict[str, tuple[Decimal, str]] = {
    "half_up_0.01": (Decimal("0.01"), ROUND_HALF_UP),
    "down_0.01": (Decimal("0.01"), ROUND_DOWN),
    "half_up_0.25": (Decimal("0.25"), ROUND_HALF_UP),
    "down_0.25": (Decimal("0.25"), ROUND_DOWN),
    "half_up_1": (Decimal("1"), ROUND_HALF_UP),
    "down_1": (Decimal("1"), ROUND_DOWN),
}


class LineRuleError(ValueError):
    """A line whose figures do not follow from its declared rules. `code` names which, for the 422."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def round_amount(raw: Decimal, rule: str) -> Decimal:
    """`rule` applied to an exact, non-negative product. The step is counted in whole units of itself,
    so 0.25 rounds to quarters and never through a binary fraction."""
    if rule not in _STEPS:
        raise LineRuleError("rounding_rule_unknown", f"rounding rule {rule!r} is not one of {ROUNDING_RULES}")
    step, mode = _STEPS[rule]
    return ((raw / step).quantize(Decimal(1), rounding=mode) * step).quantize(_M)


def percent_weight(gross: Decimal, tare: Decimal, pct: Decimal) -> Decimal:
    """The weight a percent deduction removes: (gross - tare) x pct / 100, half-up to the gram."""
    return ((gross - tare) * pct / _HUNDRED).quantize(_W, rounding=ROUND_HALF_UP)


@dataclass(frozen=True)
class LineIn:
    gross_weight: Decimal
    tare_weight: Decimal
    unit_price: Decimal
    pricing_basis: str = "weight"
    rounding_rule: str = DEFAULT_ROUNDING_RULE
    deduction_mode: str = "none"
    deduction_pct: Decimal | None = None
    deduction_weight: Decimal | None = None
    # piece: the count typed; weight/lump: None (derived)
    quantity: Decimal | None = None


@dataclass(frozen=True)
class LineOut:
    deduction_weight: Decimal
    net_weight: Decimal
    quantity: Decimal
    amount: Decimal


def compute_line(line: LineIn) -> LineOut:
    """Every derived figure of one line, or LineRuleError naming the first rule it breaks."""
    if line.pricing_basis not in PRICING_BASES:
        raise LineRuleError("pricing_basis_unknown", f"pricing basis {line.pricing_basis!r} is not one of {PRICING_BASES}")
    if line.deduction_mode not in LINE_DEDUCTION_MODES:
        raise LineRuleError("deduction_mode_unknown", f"deduction mode {line.deduction_mode!r} is not one of"
                                                      f" {LINE_DEDUCTION_MODES}")
    if line.rounding_rule not in ROUNDING_RULES:
        raise LineRuleError("rounding_rule_unknown", f"rounding rule {line.rounding_rule!r} is not one of {ROUNDING_RULES}")
    base = line.gross_weight - line.tare_weight
    if base < 0:
        raise LineRuleError("tare_exceeds_gross", "tare_weight exceeds gross_weight")

    if line.deduction_mode == "none":
        if line.deduction_pct is not None or (line.deduction_weight not in (None, Decimal(0))):
            raise LineRuleError("deduction_without_mode", "a deduction value was sent with deduction_mode none")
        deduction = Decimal("0.000")
    elif line.deduction_mode == "kg":
        if line.deduction_pct is not None:
            raise LineRuleError("deduction_pct_in_kg_mode", "deduction_pct is for percent mode only")
        if line.deduction_weight is None or line.deduction_weight <= 0:
            raise LineRuleError("deduction_weight_required", "kg mode needs a deduction_weight above zero")
        deduction = line.deduction_weight.quantize(_W)
    else:  # percent
        pct = line.deduction_pct
        if pct is None or pct <= 0 or pct > _HUNDRED:
            raise LineRuleError("deduction_pct_out_of_range", "percent mode needs 0 < deduction_pct <= 100")
        deduction = percent_weight(line.gross_weight, line.tare_weight, pct)
        if line.deduction_weight is not None and line.deduction_weight != deduction:
            raise LineRuleError("deduction_weight_mismatch",
                                f"deduction_weight {line.deduction_weight} is not {pct}% of gross - tare ({deduction})")
    if deduction > base:
        raise LineRuleError("deduction_exceeds_net", "the deduction is larger than gross - tare")
    net = (base - deduction).quantize(_W)

    if line.pricing_basis == "weight":
        if line.quantity is not None and line.quantity != net:
            raise LineRuleError("quantity_mismatch", f"a weight-priced line's quantity is its net ({net})")
        quantity = net
    elif line.pricing_basis == "piece":
        if line.deduction_mode != "none":
            raise LineRuleError("deduction_not_by_weight", "a deduction applies to weight-priced lines only")
        q = line.quantity
        if q is None or q <= 0 or q != q.to_integral_value():
            raise LineRuleError("piece_quantity_invalid", "a piece-priced line needs a whole number of pieces above zero")
        quantity = q.quantize(_W)
    else:  # lump
        if line.deduction_mode != "none":
            raise LineRuleError("deduction_not_by_weight", "a deduction applies to weight-priced lines only")
        if line.quantity is not None and line.quantity != 1:
            raise LineRuleError("quantity_mismatch", "a lump line's quantity is 1")
        quantity = Decimal("1.000")

    return LineOut(deduction_weight=deduction, net_weight=net, quantity=quantity,
                   amount=round_amount(quantity * line.unit_price, line.rounding_rule))
