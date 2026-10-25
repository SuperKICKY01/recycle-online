# A table derived from other rows lands in the same commit as every writer that keeps it derived

**Applies to:** any table whose rows must exist for each row of another table (a ledger row per bill line, a
summary per day, an audit row per write) -- on THIS project, where the gate's dev-targeting proofs write to the
shared dev database between commits.

## What happened (M2, 2026-10-25)

Migration 0029 created `stock_movements` and backfilled one movement per existing purchase line. The commit that
teaches `POST /bills` and its void to write a movement was planned as the NEXT commit (schema, then server). In
between, a gate ran: its dev-targeting proofs (`prove_bills`, `prove_auth`, ...) posted and voided bills on DEV
through the old route, which writes no movement. Dev ended with 3741 purchase lines against 3707 movements and 627
voided lines against 619 reversals (`prove_m2_schema` B1, `_prove_all/20261025T085702Z`). Every scratch is restored
from a dump of dev, so the gap reached every proof; the reconciler's "every line has its movement" could never be
green again on any copy. Closing it took a data migration (0030), not a code fix.

## The rule

A derived table and EVERY writer that keeps it derived ship in ONE commit -- or the commit that creates the table
does not migrate dev until the writers exist. "Schema first, routes next" is safe only for tables nothing depends
on per row. Before migrating dev, ask: which existing routes write the rows this table must mirror? If any, they
change in this commit.

The same split also put a checker ahead of its writer (S1 in reconcile.py reddened two proofs the same day); the
checker moved to the writer's commit. A checker of a derivation lands with the derivation, never before it.

## AMENDED (2026-10-25) -- a guard over a derived table names the PROPERTY, not the writer

0029's downgrade refuses when it would destroy what nothing else holds. It counted "movements recorded by the app"
(`NOT recorded_by_migration`): it told derived from held by WHO wrote the row. That stood while the migration was
the only writer of purchase movements. The next commit taught `POST /bills` to write the SAME derived row -- and
from then on one purchase made every downgrade below 0029 impossible: gate `_prove_all/20261025T095430Z` reddened
prove_drawer and prove_seller_personal on it, and the dev dump of that morning already held 74 such rows (dev
itself could no longer be rolled back). No proof had ever driven the guard either way, so nothing saw it.

The rule: a guard (or checker) over a derived table classifies a row by what it IS -- here its `kind`: a purchase
movement or its reversal is rebuilt by `upgrade()` whoever wrote it; a sale, its reversal or an adjustment is held
-- never by which writer produced it. A writer flag answers "who", and the next writer changes the answer without
changing the row. And a refusal guard gets a cell that makes it refuse AND one that makes it proceed
(`prove_m2_schema` D1 refuses, D2 proceeds -- each made to redden by a mutation of the guard, D3 the rebuild): a
guard never seen both ways is a guard nobody observed.
