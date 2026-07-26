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

## How to apply

Before trusting any proof script:

1. Run it twice in a row without touching the database. If run 2 fails, the
   script is wrong, not the run.
2. Grep it for hardcoded unique keys and absolute expected values. Any
   idempotency key, external reference, or generated number must be per-run.
3. Assert the shape and the *delta*, not the value, for anything the server
   assigns.
4. Grep it for `len(...) == <n>` on seeded data. Rewrite as a membership or
   disjointness claim unless the exact count really is the invariant.

This sits alongside the other lessons about a green result that proves nothing:
[[concurrency-tests-need-a-barrier]] (workers that never overlapped),
[[schema-audit]] (proofs pass while the schema is wrong), and
[[metro-file-map-nesting]] (one green run pinned the wrong cause). The common
shape: **a passing result is only evidence if you know what would have made it
fail.** Here, nothing would have — on a fresh database it could not fail, and
on a used one it could not pass.
