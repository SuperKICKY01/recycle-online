# A defaulted `getattr` is a silent dead branch

**Applies to:** every place code asks an exception, a driver object, or any
foreign object for an attribute it did not define itself — and to every "safety"
branch that no test has ever been observed entering.

## What happened

`bills.py` handled the idempotency race like this, from Phase 1c:

```python
constraint = getattr(getattr(e, "orig", None), "constraint_name", "") or ""
if "idem" in constraint:
    ...return the winner's bill (200)
```

`constraint_name` **is not on `e.orig`**. SQLAlchemy's asyncpg dialect does not
hand back the asyncpg exception: it builds its OWN DBAPI-shaped `IntegrityError`,
copies only `sqlstate` onto it, and chains the real one as `__cause__`
(`dialects/postgresql/asyncpg.py::_handle_exception`). Observed here, asyncpg
0.30 / SQLAlchemy 2.0.51:

```
exc.orig                           -> sqlalchemy...asyncpg.IntegrityError
exc.orig.constraint_name           -> ABSENT
exc.orig.sqlstate                  -> '23505'
exc.orig.__cause__                 -> asyncpg.exceptions.UniqueViolationError
exc.orig.__cause__.constraint_name -> 'uq_sellers_tenant_code'
```

So `constraint` was `""` on every violation that has ever occurred, `"idem" in
""` was always False, and **the branch had never executed once**. The loser of a
concurrent same-key submit got a 500 instead of the winner's bill — a 500 is
`unavailable` to the sync engine, never `rejected`, so that bill retried forever
and dammed every bill behind it on that device. Hard rule 4 held sequentially and
failed under concurrency, on the money path, for four phases.

It surfaced by accident: the same idiom, copied into the new master-data writes,
turned a duplicate seller code into a 500 instead of a 409.

## Why it hid for so long

Three separate things had to line up, and all three are the normal case:

1. **The default made "I don't know" indistinguishable from "no".** `getattr`
   with a default cannot fail. An absent attribute and a genuinely empty
   constraint name produce the identical `""`, and only one of those is a fact.
2. **The happy path covered the visible case.** `create_bill` pre-checks the key
   with a SELECT, so a *sequential* replay returns 200 without ever raising.
   `prove_bills` CASE 2 tests exactly that and passes — it never reaches the
   handler. CASE 5 does race two submits, but with *different* keys, so it never
   collides.
3. **Nothing asserted the branch had run.** Every proof was green. A branch that
   is never entered cannot fail a test that never enters it.

## The rules

- **Never `getattr(foreign_object, name, default)` on a contract you have not
  observed.** Print the actual object, its type, and its `__cause__` chain once,
  from a real failure, and pin what you saw in a comment with the library
  versions. A wrapped exception is a different object from the one that was
  raised.
- **A missing attribute must not read as a negative answer.** Resolve to `""`
  only if every caller treats `""` as *"I do not know"* — never as *"there was no
  constraint"*. Encode that in the helper, not in each caller's head.
- **Prefer asking the authority over recognising the symptom.** The fix in
  `bills.py` was not to read the constraint name correctly — it was to stop
  needing it: on any `IntegrityError`, re-SELECT the idempotency key and return
  the bill if it now resolves. That is also *more* correct, because the bill's
  primary key is client-generated too, so a device retrying the same bill
  collides on `purchase_bills_pkey` OR on `uq_bills_tenant_idem` depending on
  which index Postgres checked first — not something a handler can predict.
  Where the name genuinely matters (`master.py` must know *which* entity's code
  was duplicated, and products carry two unique constraints), read it through one
  helper that documents the chain: `db.constraint_name_of`.
- **A safety branch with no proof that ENTERS it is not a safety branch.** If a
  handler exists for a race, the proof must actually run the race, with a start
  barrier and printed overlap evidence
  (`concurrency-tests-need-a-barrier.md`) — `prove_master_write` I1 prints
  `windows overlapped by 37.5 ms` and asserts the overlap is positive, because a
  green result from two sequential requests would prove nothing. Assert on the
  *outcome the branch produces* (statuses `[200, 201]`, exactly one bill), not on
  the absence of a crash.

## The generalisable shape

This is the sibling of `diagnosis-must-precede-the-fix.md`. That one is a
**failing** result pinned on the wrong cause. This one is a **passing** result
that proves nothing, because the code under test was unreachable. Both come from
the same move: believing a story about the system instead of observing it. When a
conditional guards something expensive to get wrong, the question is not "is the
condition right?" but **"have I ever seen this branch execute?"**
