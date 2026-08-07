# A mutation on a protected write path needs a scratch database

A mutation test proves an assertion can go red. To do that it has to run BROKEN
code against something. On a write path that hard rule 5 protects, that
"something" keeps every row the broken code writes, forever.

## What happened

`purchase_bills.created_by` was added in migration 0006, and `prove_bills.py`
CASE 1 and CASE 7 were written to assert it. Both assertions were then disproven
on purpose — the discipline [[a-check-that-never-went-red-was-never-observed]]
exists for, and the right thing to do. Two mutations of `create_bill`, each run
against the DEV database:

1. the column, its placeholder and `"cb": principal.user_id` removed from the
   INSERT. Five bills written with a NULL author (run `e903453d`).
2. a hardcoded seeded staff id written in place of the caller. Five bills
   written naming the wrong user (run `e63a1c76`).

Both went red as predicted, both were reverted, and the revert was proven
byte-exact by two hashes. The proof works. **Ten bills remain, and hard rule 5
means none of them can be removed.**

## Why this is worse than proof debris

The rows came through `POST /bills`. They are schema-valid, satisfy every
constraint including the composite FK, pass `reconcile.py`'s checks — which do
not look at `created_by` at all — and appear in the daily report as ordinary
trade. Nothing marks them.

That is what separates this from
[[a-proof-fixture-must-be-a-row-the-product-could-produce]]. That lesson is
about fixtures a proof writes DIRECTLY: rows the product could not have
produced, which is exactly what makes them findable — a checker can be taught
to catch a bill with no `doc_no`. These are the opposite. The product produced
them, through its real path, with its real validation. They carry a LIE rather
than an impossibility, and no check can see a lie in a column whose whole
purpose is to be believed.

Mutation 2's five rows name the staff user on bills an admin submitted. They are
indistinguishable BY INSPECTION from genuine staff-created bills — which is
precisely the harm `created_by` was added to prevent. The mutation that proved
the column works also wrote the first false attributions that column will ever
hold.

## The parallel was already in the repository

`scripts/prove_docno_clock.py` REFUSES to run against the live database, and
says why in its own `--help`: it lies to the server about the time, and against
unfixed code that mints a bill in a year which has not happened and opens a
counter row for it — neither of which hard rule 5 permits removing.

Same shape, written down before any of this. A clock lie and an authorship lie
are both mutations of production code on a write path whose rows are permanent.
The refusal `prove_docno_clock` carries is not specific to clocks; it is
specific to WRITES THAT CANNOT BE UNDONE. Nobody drew the parallel, and the
mutation was pointed at dev.

## The rule

Before mutating production code to make a proof go red, ask what the BROKEN code
writes, and whether hard rule 5 protects it. If it does, restore a scratch copy
and point the run at that. `prove_docno_clock.py --database` and
`prove_reconcile.py --from/--database` are both already this shape, and
`restore_db.py` makes the copy in one command.

**The test is not "is this the live database". Dev is not scratch.** It is the
database every proof, every report and every device pass reads, its rows are
protected by the same hard rule, and the only way it has ever shed a bill is
replacing the whole volume — which on 2026-08-03 also took the four real device
bills with it.

And a mutation that cannot be made scratch-safe should refuse WHERE IT RUNS, the
way `prove_docno_clock` does, rather than resting on whoever is at the keyboard
remembering. A reason enforced by a comment decays; one enforced by a refusal
does not — the same argument [[a-checker-must-not-share-the-code-it-checks]]
makes about its own ROLE-statement scan.

## Cost, measured

Ten permanent rows in the dev database across two runs — five authorless
(`e903453d`), five falsely attributed (`e63a1c76`) — identified by the run token
in their `idempotency_key`, which is the only thing that distinguishes them from
trade at all. That handle exists by luck, not by design: it is `prove_bills.py`'s
per-run idempotency key, and a mutation of any proof that does not scope its keys
per run would leave rows with no handle whatsoever.
