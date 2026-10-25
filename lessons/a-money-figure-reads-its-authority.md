# A money figure on a screen reads the authority that owns it, never a nearby copy

**Rule.** When a route shows a money figure that a rule or a table already defines -- a unit cost the sale path
charges, a stock value the ledger sums -- it CALLS that rule or READS that table over the domain the figure names.
It does not re-derive the figure with arithmetic of its own, and it does not total the rows it happens to be
drawing. A second derivation is a second authority, and two authorities disagree exactly where one of them has a
guard the other lacks.

## The two instances (M2, 2026-10-25, found by a red-team pass)

**A second reader of the cost rule.** The sale path costs a line by `app/stock_cost.unit_cost`: the average
(value / quantity) only while quantity > 0 AND value >= 0, else the newest purchase's unit cost. `GET /stock`
showed an "average cost" computed in place as `value / quantity if quantity > 0` -- the same rule minus one guard.
Reachable with the shop's default `negative_stock = allow`: buy 10 @ 1.00, sell 1000, buy 2000 @ 0.01 leaves
quantity 1010.000 and value -970.00; the stock screen showed -0.9604 while the next sale was costed at 0.0100.
Neither number was "wrong" by its own code; the owner was shown one and charged the other. The golden cost
vectors had no case with quantity > 0 and value < 0, so deleting the guard from `unit_cost` itself was green too.

**A total over the wrong domain.** `GET /stock`'s `total_value` summed the rows the route listed, and the route
lists active products by default. Retiring a product that still held 1000.00 of goods lowered the branch's stock
value by 1000.00 with nothing having moved, and `?include_inactive=true` returned a different total over the same
ledger. The figure is named "the stock's value"; its domain is the ledger, not the page.

## The fix and its proof

`GET /stock` builds each product's `Ledger` (with the newest live purchase, one SQL fragment shared with the sale
path's `read_ledger`) and calls `unit_cost`; it reports the arm as `cost_basis`. `total_value` is one SUM over the
branch's movements in the same REPEATABLE READ snapshot as the rows. `prove_sales` SC14.4 drives the ledger above
and requires the screen's unit cost to equal the next sale's cost; SC14.6 retires a product holding stock and
requires the total unchanged and equal to the ledger's own sum; a golden vector pins `unit_cost`'s guard. Each
was disproved by restoring the copy it replaced.

## How to spot the next one

For every money figure a route computes, ask: **does a module or a table already define this number?** If yes,
the route calls it -- and a cell compares the route's figure with the authority's over a state where a guard
matters (a negative value, a retired row, an empty set). For every total, ask **what domain does its NAME claim?**
and sum that domain, whatever the list beside it shows. Related: [[a-checker-must-not-share-the-code-it-checks]]
is the opposite bound -- a CHECKER must be independent of the code it checks; a PRODUCTION reader must not be.
