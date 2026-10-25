"""The cost rule held to its golden vectors (M2, app/stock_cost.py).

    uv run python scripts/prove_stock_cost.py
    uv run python scripts/prove_stock_cost.py --vectors <file>   (DISPROOF: a perturbed copy must go red)

PURE: no database, no server. golden/stock_cost_vectors.json holds sequences of ledger steps on one product; every
expected figure in it was worked by hand from the rule in stock_cost.py's docstring. This proof replays each step on
a ledger it keeps itself (buy: +quantity, +value; sell: app.stock_cost.cost_out, then -quantity, -cost_amount; the
newest buy's value/quantity is the last unit cost) and compares every sell's four figures as STRINGS.

The rule is the server's alone: no client computes a cost (the phone and desktop show the stored one), so there is
no second implementation to hold to parity -- stated so a reader does not look for one.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.stock_cost import Ledger, cost_out, purchase_unit_cost  # noqa: E402

DEFAULT = Path(__file__).resolve().parents[2] / "golden" / "stock_cost_vectors.json"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--vectors", type=Path, default=DEFAULT)
    args = ap.parse_args()
    data = json.loads(args.vectors.read_text(encoding="utf-8"))
    fails = passes = sells = 0
    for case in data["cases"]:
        q, v, last = Decimal("0"), Decimal("0"), None
        for i, st in enumerate(case["steps"], 1):
            qty = Decimal(st["quantity"])
            if st["op"] == "buy":
                val = Decimal(st["value"])
                q, v = q + qty, v + val
                u = purchase_unit_cost(val, qty)
                last = u if u is not None else last
                continue
            sells += 1
            c = cost_out(Ledger(quantity=q, value=v, last_unit_cost=last), qty)
            got = {"cost_per_unit": str(c.cost_per_unit), "cost_amount": str(c.cost_amount), "basis": c.basis,
                   "balance_after": str(c.balance_after.quantize(Decimal("0.001")))}
            ok = got == st["expect"]
            print(f"  [{'OK  ' if ok else 'RED '}] {case['name'][:60]} / step {i}: {got}" + ("" if ok else f" WANT {st['expect']}"))
            passes += ok
            fails += not ok
            q, v = q - qty, v - c.cost_amount
    print(f"\n  {len(data['cases'])} cases, {sells} sells; passes={passes} failures={fails}")
    if sells == 0:
        print("  RED: no sell step was replayed -- the file proved nothing")
        fails += 1
    return 1 if fails else 0


if __name__ == "__main__":
    rc = main()
    print(f"PROVE_STOCK_COST_EXIT={rc}")
    sys.exit(rc)
