"""The cost of a sale line, by weighted average (M2, ADVISOR-DECIDED 2026-10-25).

PURE: Decimal in, Decimal out, no I/O, no float. app/stock.py reads the ledger under a per-product lock and
calls this; golden/stock_cost_vectors.json holds the worked cases and scripts/prove_stock_cost.py (and the
desktop's prove:stockcost, which reads the same file) hold this rule to them.

THE RULE (stated once, here):
  The ledger for one product at one branch holds Q = sum of quantities and V = sum of values (money).
  cost per unit (4 dp, half-up):
    Q > 0 and V >= 0   ->  V / Q                         the weighted average of what is on hand
    otherwise          ->  the newest purchase's unit cost (its value / its quantity), when there is one
                           -- the stock is gone or overdrawn, so there is no average to take
    no purchase at all ->  0, and the line is flagged no_cost for the owner
  cost amount (2 dp, half-up) = quantity x cost per unit; the movement's value is minus that.
  The line stores BOTH, so the figure never moves when later purchases arrive (hard rule 6); a purchase
  that syncs later than a sale it predates is flagged against that sale (late_purchase), never re-costed.

  An adjustment moves stock at the same cost per unit (in or out), so it never changes the average.

WORKED EXAMPLE (golden vector 1):
  buy 100.000 kg for 1000.00 -> Q 100, V 1000.00
  buy  50.000 kg for  650.00 -> Q 150, V 1650.00, cpu 11.0000
  sell 30.000 kg             -> cost 330.00; Q 120, V 1320.00, cpu 11.0000
  buy  30.000 kg for  375.00 -> Q 150, V 1695.00, cpu 11.3000
  sell 45.000 kg             -> cost 508.50; Q 105, V 1186.50
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

_CPU = Decimal("0.0001")
_M = Decimal("0.01")
ZERO = Decimal("0")


@dataclass(frozen=True)
class Ledger:
    """What the ledger says about one (branch, product) at the moment a line is recorded."""

    quantity: Decimal                # Q: sum of movement quantities
    value: Decimal                   # V: sum of movement values
    last_unit_cost: Decimal | None   # the newest purchase movement's value / quantity, or None


@dataclass(frozen=True)
class Cost:
    cost_per_unit: Decimal
    cost_amount: Decimal
    basis: str                        # average | last_purchase | none
    balance_after: Decimal


def unit_cost(ledger: Ledger) -> tuple[Decimal, str]:
    if ledger.quantity > 0 and ledger.value >= 0:
        return (ledger.value / ledger.quantity).quantize(_CPU, rounding=ROUND_HALF_UP), "average"
    if ledger.last_unit_cost is not None:
        return ledger.last_unit_cost.quantize(_CPU, rounding=ROUND_HALF_UP), "last_purchase"
    return Decimal("0.0000"), "none"


def cost_out(ledger: Ledger, quantity: Decimal) -> Cost:
    """The cost of taking `quantity` (>= 0) out of stock."""
    if quantity < 0:
        raise ValueError("quantity out must be >= 0")
    cpu, basis = unit_cost(ledger)
    amount = (quantity * cpu).quantize(_M, rounding=ROUND_HALF_UP)
    return Cost(cost_per_unit=cpu, cost_amount=amount, basis=basis, balance_after=ledger.quantity - quantity)


def purchase_unit_cost(value: Decimal, quantity: Decimal) -> Decimal | None:
    """A purchase movement's own unit cost, for last_unit_cost. None for a zero-quantity line."""
    return None if quantity <= 0 else value / quantity
