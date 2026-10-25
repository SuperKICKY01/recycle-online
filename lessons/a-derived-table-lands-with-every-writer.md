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
