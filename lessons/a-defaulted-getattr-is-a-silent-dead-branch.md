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

## AMENDED (P1.8b SERVER, 2026-08-25) — a FAST PATH in front of the safety branch is what stops any SINGLE mutation from reaching it

The rule above says a safety branch with no proof that ENTERS it is not a safety
branch, and prescribes running the race. **What it does not say is how to get in
when something correct answers first** — and reason 2 of *Why it hid for so long*
is exactly that obstacle, named and then left standing: *"`create_bill` pre-checks
the key with a SELECT, so a sequential replay returns 200 without ever raising.
`prove_bills` CASE 2 tests exactly that and passes — it never reaches the
handler."*

**The same structure, built deliberately this time.** `POST /sellers` learned to
answer a replay carrying a reservation token, and it has two mechanisms that
produce the identical answer:

1. a **fast path** — the reservation is read first, and if it is already `spent`
   the row it names is returned without attempting an INSERT at all;
2. a **fallback** — the INSERT is attempted, collides on
   `uq_sellers_tenant_code`, and the handler re-reads the reservation and returns
   the winner. The same *ask the authority* shape the rules above prescribe.

**MEASURED, and the pair is the point.** Disabling ONLY the fast path left every
replay cell GREEN: `first=201 id=3bacda99…`, `replay=200 id=3bacda99…`, whole
suite exit 0. Disabling ONLY the fallback would have done the same. **Both had to
go before the cell moved** — with neither, the replay came back `409` and the cell
printed `the replay carries the SAME seller.id (None)`.

**So a single mutation proves nothing about either, and two mutations tell you
which one is load-bearing.** Here the answer was not the obvious one: the fast
path is an OPTIMISATION and the fallback is the GUARANTEE, because a genuinely
concurrent replay reads `held` in its own SELECT and can only be saved by the
collision.

**AND THAT MUTATION IS THE WAY IN.** Deleting the fast path makes the fallback the
only thing that can produce the outcome, so the branch is *known* to have executed
rather than hoped to have. It is deterministic, where the race this file already
prescribes is not: the barrier race staged for the same commit's lock collided
**once in five runs** of the same mutation
([[a-lock-is-proven-by-what-waits-not-by-a-race]]).

### The rule

- **Where two mechanisms produce the same answer, mutate them ONE AT A TIME.** A
  cell green under a single mutation is evidence about the pair and about neither
  member. Ask which one you would still have if the other were deleted.
- **To enter a branch a fast path hides, delete the fast path.** Do not reach for
  the race first — a race is an intermittent instrument, and its greens read as
  evidence.
- **Then say which one carries the guarantee, at the site.** Nothing in the code
  distinguishes an optimisation from a guarantee, and the next reader deleting
  "the redundant one" has a suite that will agree with them either way.

### NOT the seventh mechanism of `a-check-that-never-went-red-was-never-observed`, and the separation runs the OPPOSITE way

That mechanism is titled *the guard is reachable, but a SIBLING GUARD gets there
first*, **and that title fits this word for word, which is the trap.** Its BODY
does not, on all three of its load-bearing claims:

| the seventh mechanism | this |
| --- | --- |
| *"unreachable through every path the product has… no input exists"* | reachable, by a genuinely concurrent replay, which the proof stages |
| *"deleting it changes nothing observable at all"* | deleting it changes a 200 into a 409 — measured |
| its value is *"FORWARD-LOOKING"* | it is the guarantee TODAY; the sibling is the optimisation |

**And neither of its two rules can be applied here.** Rule 10 says order the guard
naming the durable fact first — but ordering is not the question, and both orders
return the same answer. Rule 11 says *assert on the field that DISCRIMINATES, not
the field they share* — and **there is no discriminating field**: both mechanisms
return 200 with the same `seller.id` and a byte-identical body. The seventh's
remedy has nothing to attach to, which is the test that settles where this
belongs.

**THE PRACTICAL COST OF FILING IT THERE.** In the seventh, the FIRST guard is
load-bearing and the second earns its place forward-looking. Here it is inverted.
A maintainer who read this as the seventh would delete the second one — the
fallback — as the decorative member, and every test would agree with them.

Related: [[a-check-that-never-went-red-was-never-observed]] (the seventh mechanism
this separates from), [[a-lock-is-proven-by-what-waits-not-by-a-race]] (why the
race is not the way in), [[concurrency-tests-need-a-barrier]].
