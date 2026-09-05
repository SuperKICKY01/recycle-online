# A proof fixture must be a row the product could have produced

**Applies to** every proof, seed or test that writes business rows directly —
by SQL, by driver, by ORM — instead of through the code path a real client uses.

**The rule:** if `POST /bills` could not have produced the row, the row is not a
fixture. It is a hypothesis about a database.

## What happened

The first ever run of `server/scripts/reconcile.py` against the live dev
database reported **84 violations**. None of them were product defects. Both
causes were proof scripts writing rows the API cannot create:

| check | rows | written by | what makes it impossible |
|---|---|---|---|
| T5 — every persisted bill has a `doc_no` | 44 | `prove_rls.py:96` INSERTs a whole tenant graph directly, to exercise the RLS `WITH CHECK` on INSERT, and never calls `create_bill` | `create_bill` assigns `doc_no` in the SAME transaction as the insert. The column is nullable only for hard rule 3's offline state, which by definition never reaches the server |
| T7 — `doc_no`'s BE year is the year the bill arrived | 40 | `prove_daily_report.py` creates bills over HTTP, then backdates `server_received_at` onto a synthetic 2019 fixture day by direct UPDATE | the year and the stamp are now taken from ONE instant (see [[be-year-comes-after-the-timezone]]); nothing in the product can separate them |

Both scripts are otherwise good, and both had a real reason to write directly.
That is the point: **the mistake is not laziness, it is a reason that stopped at
the write and never asked what the row would look like afterwards.**

## Why this is worse than untidy test data

The pollution is the least of it.

1. **It pollutes, permanently.** Hard rule 5 forbids deleting a transaction, so
   these rows cannot be cleaned up. A checker that is red on its first run, for
   reasons unrelated to the product, is a checker with a short life —
   see [[queue-jam-must-be-visible]] for the general shape: a signal nobody can
   act on is a signal that gets switched off.

2. **A proof over an impossible row can be green while the real path is broken.**
   `prove_rls`'s bill has never once been through `create_bill` — not its doc_no
   assignment, not its idempotency check, not its master-data gate. Every
   assertion made about that bill is an assertion about seven INSERT statements
   the proof itself wrote. It proves RLS, which is what it set out to do; it
   proves nothing whatever about bills, and its ROW is nonetheless indistinguishable
   in the database from one that lost its number.

3. **It teaches the next reader the wrong lesson, in the dangerous direction.**
   The natural reading of a red T5 is "the invariant is too strict — bills are
   allowed a NULL doc_no, look, the column is nullable." Relaxing the check is
   one edit away, and after it the checker can no longer see a bill that really
   did lose its number. **Debris does not just add noise; it argues for its own
   legitimacy**, and the argument is persuasive because the rows are right there.

## The test to apply before writing a fixture directly

> Could the product, given some sequence of legitimate requests, have arrived at
> this exact row? Not "is it valid" — the schema will tell you that, and both of
> these rows are schema-valid. **Could the code have made it?**

If no, you have three honest ways out, in order of preference:

1. **Go through the real path** and then adjust only what the path cannot set.
   `prove_daily_report` already does the first half correctly — it creates over
   HTTP so `doc_no` and `list_price` come from the real code — and then breaks
   the second half by moving `server_received_at` somewhere the product could
   never have put it *relative to the doc_no it had already been given*.
2. **Write directly, but write the whole row**, including the columns the
   product would have filled. `prove_rls` needs a direct INSERT to exercise the
   RLS `WITH CHECK`; that requirement is about the INSERT, not about leaving
   `doc_no` empty. It could supply a `doc_no` and the matching `doc_no_counters`
   row and lose nothing.
3. **Make the fixture disposable and dispose of it.** `prove_rls` invents a
   THROWAWAY TENANT per run. Hard rule 5 protects a shop's ledger from a hard
   delete; it was never about a synthetic tenant a proof created eight seconds
   earlier. Deleting that tenant's whole graph on the way out costs nothing and
   leaves nothing. (46 tenants exist today, 44 of them one-bill husks.)

What is NOT on the list: teaching the checker to tolerate the row. That is
[[a-checker-must-not-share-the-code-it-checks]] in reverse — instead of the
checker borrowing the product's bug, the product's checker borrows the test's
bug.

## The general form

This is the write-side twin of [[proof-must-run-twice]]. That lesson asks
whether a proof's GREEN means anything. This one asks whether its FIXTURE does.
Both have the same root: **a proof is only evidence about the system to the
extent that what it touches is something the system could have touched.**

And the two compound. A fixture that is impossible AND undeletable is a
permanent false statement about the product, sitting in the one place — the
database — that every future instrument will read as ground truth.

## AMENDED (migration 0020, 2026-09-05): a fixture written THROUGH the real path can be made impossible AFTERWARDS, by editing one of the rows the path wrote together

The list above is about rows a proof WRITES. A third way in: the proof goes
through the real path (way 1, done right), then backdates ONE row by direct
UPDATE while the same transaction wrote a SIBLING it never touches. Migration
0020 made `POST /bills` write a `payments` row beside every bill, carrying the
bill's own `server_received_at`; `prove_daily_report.py` had for months moved
its bills' `server_received_at` and `voided_at` onto a fixture day in January by
direct UPDATE, and from 0020 on that left the bill in January beside a payment
stamped today — for the two fixtures it voids, exactly the shape the new P4
check names: a LIVE payment recorded AFTER the void. Measured: 8 P4 violations
on a scratch restored after the sweep, 40 mis-stamped pairs on dev after four
runs of that proof, every one green at the proof's own exit line, because the
proof asserts the report and the checker asserts the ledger and nothing asserted
the pair.

**The rule the amendment adds.** When a proof edits a row the product wrote,
ask what ELSE the product wrote in that transaction and whether the edit
leaves the set consistent — and re-ask it at every migration that widens the
transaction, because the proof's UPDATE was correct the day it was written and
went wrong the day the path grew a sibling. The repair is the same as way 2:
move the sibling with the row (`prove_daily_report` now backdates the automatic
payment's stamps beside the bill's). What is NOT the repair: teaching P4 to
excuse a payment that predates its bill's void by less than a fixture's shift.
Sibling of [[a-fail-closed-trigger-conscripts-every-writer-of-its-table]] —
there a new obligation conscripts every WRITER of a table; here a new sibling
row conscripts every proof that EDITS what the path wrote.

**Where measured.** `scripts/reconcile.py` P4 on `recycle_payments_scratch`
after the removed-pair disproof run, 2026-09-05, rows naming
`doc_no=B-2569-768 … voided_at=2026-01-06T11:00:00+07:00
payment_received_at=2026-09-05T11:17:41…`; dev repaired by aligning each
automatic pair's two stamps to its bill's (40 rows, then 0), reconcile 0 after.
