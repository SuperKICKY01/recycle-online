# Audit a migration field-by-field against the agreed schema before commit

**Context.** Migration 0001 quietly added several columns that were never in the
agreed schema. Most were harmless (`created_at`, `full_name`, `phone`), but one —
`grade` — landed on the WRONG table (`purchase_bill_items`). Line items do not
carry a grade; per SRS 1.6 the seller does. Every proof still passed the whole
time, because the extra column simply sat there unused.

**Rule.** Before committing any migration, read it column-by-column, constraint-
by-constraint, table-by-table against the agreed schema (the spec / SRS / the
fields explicitly listed for the phase). Every addition must trace to a
requirement or an agreed rule. Anything that doesn't is either removed or
explicitly justified out loud. Passing proofs is NOT sufficient evidence that
the schema is correct.

**Why (the failure it prevents).** Green tests only show that what the code
exercises works; they say nothing about columns nothing reads yet. An unused
column on the wrong table becomes load-bearing the moment later code trusts it,
and by then it is in production data and expensive to move. Schema drift is
silent precisely because it doesn't break anything — until it does.

**Where proven.** Phase 1c review: the human audit (not the test suite) caught
`grade` on `purchase_bill_items`; migration `0003_move_grade_to_sellers.py` drops
it there and adds it to `sellers`. All proofs had been green with the column
misplaced.
