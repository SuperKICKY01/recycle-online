# A proof that passes only once proves the environment, not the code

**Rule: every proof script must be runnable twice in a row against a live
database and still pass.** No truncate between runs, no reseed, no dropped
volume. If it needs a fresh database to be green, it is not testing the code —
it is testing that you remembered to wipe the database.

## What happened

`prove_bills.py` was written in Phase 1c and passed. It was run again in Phase
2c-2, untouched, against the same database it had passed on before. It failed.

The observed response was the giveaway:

```
status=200  doc_no=B-2569-1  status_field=voided
```

A `201` was expected. The server had done nothing wrong — it did exactly what
Phase 1c asked it to do. The script hardcoded its idempotency keys
(`bill-A-0001`, `bill-A-conc-1`, ...) and asserted absolute document numbers
(`doc_no == "B-2569-1"`, then `"B-2569-2"`). On the second run those keys
already existed, so the idempotency guarantee correctly returned the *first
run's* bills — which CASE 4 had since voided. Every later assertion then failed
downstream of that, pointing at the wrong thing.

It had passed in Phase 1c for one reason: the tables had just been truncated.

## Why this is worse than a failing test

A test that fails is honest. This one was green while asserting nothing about
the code — its green depended on a manual step outside the script that nobody
recorded and nobody would repeat. Phase 1c shipped believing bills were proven
idempotent under repeat submission. That property *is* true, but the script had
not demonstrated it: it only ever exercised the fresh-key path.

The failure also arrived disguised. The first instinct was that the new Phase
2c-2 seed data had broken it. `git` showed the file unmodified and the seed
untouched by this path; the `200 / voided` response identified the real cause.
Never diagnose from the *newest* change — diagnose from the observed response
([[metro-file-map-nesting]]).

## The fix

Scope every idempotency key to a per-run UUID, and assert `doc_no` **relative**
to wherever the counter currently sits rather than to a fixed number:

```python
RUN = uuid.uuid4().hex[:8]                       # once, at module level
... f"bill-A-{RUN}-0001" ...                     # keys unique per run
check(re.fullmatch(rf"B-{BE_YEAR}-\d+", doc1))   # shape, not value
check(doc_new == f"B-{BE_YEAR}-{seq_of(doc1) + 1}")  # next, not "2"
```

The invariants being proven — gap-free, never reused, monotonic under
concurrency — are all *relative* properties. Asserting them with absolute
numbers was never testing the invariant, only the starting state.

## AMENDED (Phase 2c-6): the seed's SIZE is an environment fact too

The same mistake has a second shape, and a per-run UUID does not catch it.
`prove_master.py` asserted tenant isolation like this:

```python
check("tenant A sees exactly its own seller", len(sa) == 1 and sa[0]["id"] == ...)
```

It was green for a year. Adding four sellers to the dev seed — a change that
touches no isolation logic whatsoever — turned it red. The count was never the
property: **isolation is a set relation**, not a cardinality. The rewrite says
what was actually meant, and is immune to the seed growing again:

```python
check("no seller is visible to BOTH tenants", ids_a.isdisjoint(ids_b))
```

An assertion that breaks when a fixture is *added* was measuring the fixture. Ask
of every count in a proof: if this number changed, would the property I am
claiming actually be false? If not, assert the property.

## AMENDED AGAIN (migration 0004): a fixture a BILL points at can never be cleaned up

The per-run UUID makes fixtures unique. It does not make them *removable*, and
those are different problems.

`prove_master_write.py` creates a product, seller, uom and category per run and
deletes them in its `finally`. One case then wrote an accepted bill against the
run's own product, to show that reactivating it let the bill through. That bill
can never be deleted — hard rule 5 — so `fk_items_product` pinned the product
forever. Three things went wrong at once:

- the `DELETE` raised inside `finally`, so **every restore after it was
  skipped** — including putting a borrowed seeded row back;
- the traceback replaced the summary that would have said so;
- and the run left a live product in the dev picker, which then turned
  `prove_master.py` red for a completely unrelated-looking reason.

Two rules come out of it:

1. **A proof may write a bill against a SEEDED row, or against a row it can
   delete — never both in one fixture.** If a case needs "a bill already
   references this", borrow a seeded row and restore it, the way
   `prove_master_data_gate.py` borrows a price. Retirement (`is_active`) is not
   an escape either: the row still exists and still accumulates.
2. **Every statement in a `finally` must be isolated.** Wrap each cleanup in its
   own `try/except`, record the failure as a named check, and let the rest run.
   A cleanup block that aborts halfway is worse than one that never ran, because
   it leaves the fixture in a state nobody chose and no output explaining it.

The corollary for the count rule above: it bites in **both** directions. The
products assertion in `prove_master.py` was still `len(pa) == 3` after the
sellers one had been fixed — the amendment was applied to the line that failed
rather than to the class. When you fix an assertion of this shape, grep for its
siblings in the same file before moving on.

## AMENDED A THIRD TIME (daily report, 2026-07-29): debris is PERMANENT, so a count assertion has a half-life

The previous amendment ended with "grep for its siblings in the same file before
moving on." That was done for `prove_master.py` and **not** for
`prove_master_write.py`, which carried this in its own retirement case:

```python
check("...everything else is still there",
      len(default_list) > 0 and len(with_inactive) == len(default_list) + 1)
```

It went red while proving the daily report — on a run that changed nothing in
that path. The cause was a bill from the day before, `mw-f0c445f2-inactive`,
written against that run's OWN seller and product: exactly the trap rule 1 above
names. Hard rule 5 pins the bill, the FKs pin the seller and product, its cleanup
could not remove them, and they sit in the tenant retired and immortal. So there
were now TWO inactive products, and `+ 1` was false.

The retirement worked perfectly. The assertion was counting.

**The new part is the time axis.** The earlier amendments ask "would this break
if a fixture were added?" — a question about the seed, which someone chooses to
change. This one breaks with no change at all, because on any table that cannot
be hard-deleted, leftover rows only ever accumulate. A count assertion over such
a table is not merely fragile; it has a **half-life**. It is not a question of
whether it goes red, only of which unrelated phase is holding it when it does —
and the cost is paid by whoever is debugging something else that day.

The fix is the set difference the check was always trying to state, which needs
the before-set observed:

```python
offered_before = {p["id"] for p in get("/products")}     # BEFORE the deactivate
...
check(offered_before - offered_after == {this_run_product}
      and offered_after and offered_after < with_inactive_ids)
```

And the corollary widens: **grep every proof script for this shape, not just the
file that went red.** `len(x) == n`, `len(a) == len(b) + 1`, and any arithmetic
between two counts of live data are all the same defect wearing different
clothes.

## AMENDED A FOURTH TIME (reconciliation, 2026-08-02): a proof that NORMALISES its own fixture measures its last run

`prove_reconcile.py` breaks each money invariant on purpose in a restored copy.
The live database is not clean — it carries 84 violations, all proof debris — so
the harness first UNDOES the two known causes in the copy, and asserts the copy
then runs green. That assertion is the whole proof of the diagnosis: if those two
causes did not account for all 84, something else does and must be found.

Run 1 was honest. **Run 2 printed this:**

```
  the copy as restored : exit 0, 0 violations {}
  cause 1, prove_rls direct inserts : DELETE 0, DELETE 0
  cause 2, prove_daily_report fixture day : UPDATE 0
  [OK  ] the two known causes account for ALL of the live violations
```

Zero rows deleted, zero updated, and a green tick under it. The copy was still
normalised **from the previous run**, so "before" was already clean and the check
confirmed nothing. Every earlier amendment here is about a proof whose second run
FAILS; this is the other half — a proof whose second run PASSES, for a reason
that has nothing to do with the claim.

The distinguishing feature is that this script mutates its own fixture as a
*setup step* rather than as the thing under test. A per-run UUID cannot help: the
fixture is the whole database.

Two rules:

1. **A proof that mutates its fixture must CREATE that fixture**, not find it.
   `prove_reconcile.py` now runs `restore_db.py` itself, so every run starts from
   the same dump and the "before" state is a fact rather than a hope.
2. **Where a claim needs a precondition, ASSERT the precondition, and SKIP rather
   than pass when it is absent.** The diagnosis check now requires that the copy
   arrived dirty; given a clean one it prints `[SKIP]` and says a fresh restore is
   needed. A check that cannot be made must never be reported as a check that
   passed — the same distinction the checker itself draws between exit 1 (the
   money is wrong) and exit 2 (nobody looked).

See [[a-checker-must-not-share-the-code-it-checks]] for the injection discipline
this sits inside: fires / names the row / **clears again when undone**.

## How to apply

Before trusting any proof script:

1. Run it twice in a row without touching the database. If run 2 fails, the
   script is wrong, not the run.
2. Grep it for hardcoded unique keys and absolute expected values. Any
   idempotency key, external reference, or generated number must be per-run.
3. Assert the shape and the *delta*, not the value, for anything the server
   assigns.
4. Grep it for `len(...) == <n>` on seeded data. Rewrite as a membership or
   disjointness claim unless the exact count really is the invariant — and fix
   every one you find, not only the one that went red.
5. Check what the script leaves behind, by querying for its run tag after it
   exits. "It passed" and "it cleaned up" are separate claims, and the second
   one needs its own assertion in the script.

This sits alongside the other lessons about a green result that proves nothing:
[[concurrency-tests-need-a-barrier]] (workers that never overlapped),
[[schema-audit]] (proofs pass while the schema is wrong), and
[[metro-file-map-nesting]] (one green run pinned the wrong cause). The common
shape: **a passing result is only evidence if you know what would have made it
fail.** Here, nothing would have — on a fresh database it could not fail, and
on a used one it could not pass.
