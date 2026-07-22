# A fixed number of ticks is not a synchronisation primitive

**Rule: a test must never wait a fixed number of microtasks (or `setTimeout`
delays) to reach the state it wants to observe. Wait for the observable EVENT,
with a bound, and print how long it took.** If there is no observable event,
add one — that is cheaper than a test whose meaning drifts.

## What happened

`proveSync.ts` CASE 6 proves the in-flight guard: while a send is hanging, the
bill must be `syncing`, and a competing claim must be refused. It set the scene
like this:

```ts
const first = engine.runOnce();
const second = engine.runOnce();
await Promise.resolve();   // "let both runs get as far as they can"
await Promise.resolve();
await Promise.resolve();
const midFlight = await r.store.getBill(bill.id);
```

Phase 2c-3 added a `Mutex` to the SQLite driver (the cart's draft -> bill
promotion needs a real transaction). Each store operation now costs extra
microtask hops. The three ticks stopped being enough to reach the claim, and
the case went red:

```
[FAIL] bill is claimed (syncing) while in flight — state=pending
```

Nothing was broken. The engine was fine — every other check in the same case
passed, including "a competing claim on an in-flight bill is refused", which
could only pass if the claim HAD happened by then. The test was simply looking
at the wrong moment.

The fix waits for the thing itself:

```ts
const yields = await waitFor(() => gated.started.length === 1);
```

which then reported `send entered after 1 yield(s)` — one **macrotask**, a point
three microtasks could never have reached.

## Why this is worse than the red run

Red is the lucky outcome. A tick count encodes the current shape of the
scheduler into the test, and the same drift can move the observation the other
way — past the window, into the state AFTER the interesting one. Then the
assertion still runs, still passes, and is measuring nothing. The in-flight
guard is the single thing standing between the customer and a double-sent bill;
a version of CASE 6 that observes after the send completed would assert
`syncing` against a settled row and be green forever.

So the failure mode is not "the test breaks when I change the storage layer".
It is "the test silently stops testing what its name says, at some unknown
future change, with no signal". Same shape as
[[concurrency-tests-need-a-barrier]]: there, workers that never overlapped; here,
an observation that never landed in the window. In both, **green is not
evidence until you can show the measurement happened when it claims to.**

## How to apply

1. Never `await Promise.resolve()` N times to "let things settle". Ask what
   event you are actually waiting for.
2. Wait on that event with a bound and a failure value (`waitFor` returns `-1`
   rather than hanging), so a genuine hang is a visible failure, not a timeout.
3. Print the cost (`after N yield(s)`). It makes a drift visible as a changing
   number long before it becomes a wrong result.
4. Suspect this whenever a timing-shaped test changes colour after a change to a
   layer BELOW it that has no business affecting correctness.

**Where proven.** `mobile/src/proof/proveSync.ts` — `waitFor()` and CASE 6, which
now passes identically on the in-memory store and the real SQLite store. The
mutex that exposed it is `mobile/src/adapters/sqlite/mutex.ts`.
