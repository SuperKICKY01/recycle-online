# A report is many reads; under READ COMMITTED they are many moments

**Rule.** When one response is assembled from more than one SELECT and the
reader will COMPARE those parts against each other, the whole response must come
from one snapshot: `tenant_connection(tid, isolation_level="REPEATABLE READ")`.
The default is READ COMMITTED, where **every statement takes a fresh snapshot**.

## The bug this prevents

`GET /reports/daily` runs five queries: a summary aggregate, an off-list
aggregate, the per-bill lines, and two void lists. Under READ COMMITTED a bill
that commits between statement 1 and statement 3 is counted by the total and
absent from the list printed underneath it.

The owner is holding cash. The screen says 47 bills, 128,400 baht, and lists 46
bills that add to 126,100. Nothing is corrupt, no query is wrong, and there is
no way to tell from the response which number to trust. On the one screen whose
entire job is reconciling, an unreconcilable answer is worse than an error.

It is also the least reproducible class of bug there is: it needs a write to land
inside a window a few milliseconds wide, so it will never appear in a proof and
will appear in a busy yard at closing time.

## Why REPEATABLE READ is free HERE, and the trap in generalising it

A **read-only** REPEATABLE READ transaction in Postgres cannot fail with a
serialization error. 40001 comes from writes detecting a concurrent update, and
this transaction performs none. So the snapshot costs nothing and adds no retry
path.

**Do not carry that sentence to a write path, and do not carry it to
SERIALIZABLE.** They are different guarantees:

| | read-only | with writes |
|---|---|---|
| REPEATABLE READ | cannot get 40001 | CAN get 40001 |
| SERIALIZABLE | **CAN get 40001** | CAN get 40001 |

SERIALIZABLE will abort a purely read-only transaction to protect someone else's
serializable write. Reaching for "the strongest isolation" on a report would
therefore introduce a failure mode that REPEATABLE READ does not have — and a
500 on a report path is `unavailable` to a client, with everything
[[unavailable-is-not-rejected]] says that costs.

## The mechanical part that is easy to get wrong

The isolation level can only be chosen **at transaction start**. It is applied
before `begin()`, not inside it:

```python
async with engine.connect() as conn:
    if isolation_level is not None:
        conn = await conn.execution_options(isolation_level=isolation_level)
    async with conn.begin():
        ...  # SET LOCAL app.tenant_id goes here, INSIDE the transaction
```

Setting it after the transaction has begun is silently ignored by some drivers —
the code reads as if it asked for a snapshot and does not have one. **Assert the
level rather than believing the parameter**: `SHOW transaction_isolation` must
answer `repeatable read`, and the SAME check against a default connection must
answer `read committed`. Without the second half the first proves only that a
string was returned, not that the option did anything.

## How to apply

1. More than one SELECT in one response, and the parts get compared? One
   snapshot. Ask whether a reader would notice the parts disagreeing — if yes,
   it is this rule.
2. Read-only: REPEATABLE READ. Never SERIALIZABLE for a report.
3. Prove the level is really in effect, in both directions.
4. This is orthogonal to WHICH rows the report selects. The day boundary is
   [[doc-no-is-arrival-order-not-event-time]] and
   [[render-in-shop-time-not-device-time]]; this lesson is only about the
   parts agreeing with each other.

**Where proven.** `server/scripts/prove_daily_report.py` section R asserts both
levels through the real `tenant_connection`. Section P is the reason it matters:
`limit=1` returns one line and the identical totals, because the money is
aggregated in SQL over the whole day and never derived from the returned page —
a truncated list can never produce a short total.
