# A lock is proven by what waits, not by a race

**Applies to** every cell claiming that code takes a lock, a mutex or any other
serialisation point — and to every cell claiming that taking it costs nothing.
Hardest over HTTP, where the only window a test can synchronise is the REQUEST
and the window the lock closes is a fragment of it.

**The rule, in one line:** do not race the lock, HOLD it — and then say WHICH
lock the thing that waited was actually waiting on.

## What happened

P1.8b added a per-tenant lock so that the two writers of the seller-code space —
the refill route and the create path — cannot derive the same candidate at the
same moment. Three cells were written to prove it. **All three were green with
the lock deleted from the route**, each for a different reason, and each reason
is one somebody would reach for again.

### Attempt 1 — a start barrier between two requests

Two refills, two threads, one `threading.Barrier`, overlap printed, exactly the
shape [[concurrency-tests-need-a-barrier]] prescribes. With `FOR UPDATE` deleted
from the route the cell reported `statuses=[200, 200]`, disjoint blocks,
`windows overlapped by 40.8 ms`, and **the whole suite exited 0**.

The overlap was real and the cell was honest. It is simply about the wrong
window. **A barrier synchronises the START of two requests; the section the lock
protects is a sub-millisecond SELECT sitting behind an auth round trip, JSON
parsing and a connection checkout.** Two requests overlapping for 40 ms says
nothing about whether their two critical sections landed in the same instant.

That is the gap in the earlier lesson, and it is worth naming: it says green
means nothing until you show the WORKERS overlapped, and it is right — but over
HTTP the overlap you can measure is between requests, and the overlap you need
is between the few microseconds inside them. **It happens intermittently and
therefore reddens intermittently.** Measured here: across five runs of the same
mutation the race collided ONCE, printing `statuses=[200, 500]`. A cell that
catches a defect one run in five is not a cell, it is a coin.

### Attempt 2 — hold the row, and time the route

The replacement looked airtight: the proof opens its own transaction, takes
`SELECT id FROM tenants FOR UPDATE`, holds it two seconds, and times one refill
against it. With the lock in the route it read **1796 ms**. With the lock
DELETED it read **1851 ms** — still green, still confident.

Nothing in the route was waiting for the route's lock, because there was not
one. **The INSERT was waiting, and it was waiting on the FOREIGN KEY.**
`seller_code_reservations.tenant_id` references `tenants (id)`, an INSERT's FK
check takes `FOR KEY SHARE` on the parent row, and `FOR UPDATE` conflicts with
`FOR KEY SHARE`. So the proof's own holder blocked the route whatever the route
did.

READ OUT OF POSTGRES, not inferred — `pg_stat_activity`, one second into the
hold, with the route's lock removed:

    pid=35461  state=active  wait=Lock/transactionid
      q=INSERT INTO seller_code_reservations (tenant_id, code, device_id, ...)

**AND THE FIRST ATTEMPT TO READ THAT COULD NOT SEE IT.** Connected as
`recycle_owner`, the same query returned

    pid=35338  state=None  wait=None/None  q=<insufficient privilege>

`pg_stat_activity` hides `state`, `query` and the wait event for a backend owned
by ANOTHER ROLE, and the application role is another role. The row was there and
said nothing, which reads exactly like "there is no server backend at all" — the
conclusion actually drawn for one round. **Read it as a superuser or you are
reading a redaction.**

### Attempt 3 — time an unrelated write while the refill is blocked

The obvious next cell: while the refill is stuck, does an ordinary write for the
same shop get through? It read 78 ms under `FOR UPDATE` and 70 ms under
`FOR NO KEY UPDATE` — green under both, so it discriminated nothing.

**A request WAITING for a lock is holding nothing.** The route's transaction had
not acquired anything yet, so the mode it would have taken could not possibly
affect a third party. The cell measured the proof's own holder.

## The measurement that settled it

A lock's whole content is what it blocks. So enumerate that, with a control:

| holder on the tenant row | INSERT of a child row (FK `KEY SHARE`) | the other writer's lock |
| --- | --- | --- |
| nobody | 4.6 ms | 2.7 / 4.1 ms |
| `FOR UPDATE` | **1506.0 ms BLOCKED** | 1508.8 ms BLOCKED |
| `FOR NO KEY UPDATE` | **3.2 ms free** | 1511.5 ms BLOCKED |

PostgreSQL 16.14, 1.5 s hold, 2026-08-24. The bottom row is what the design
wanted and nobody had written down: the two code writers wait for each other and
nothing else waits at all.

**THIS IS A DEFECT AND NOT ONLY A TEST PROBLEM.** `tenants.id` is referenced by
every tenant-scoped table in this schema. A per-tenant `FOR UPDATE` therefore
stalls every INSERT in the shop — a bill on the weighbridge included — for the
length of a refill, and a refill happens on every sync pass from every device.
Nothing errors; the yard just gets slower under exactly the load that matters.
**The next person who reaches for a per-tenant lock will write `FOR UPDATE`,
because that is the phrase everyone knows.**

## The cell that finally discriminates

Two holds, and the PAIR is the evidence:

1. Hold the row the way **the other writer** holds it → the route MUST wait.
2. Hold it the way **an ordinary in-flight write** holds it — a real uncommitted
   INSERT of any child row → the route must NOT wait.

Measured against the finished code, 2.0 s hold: nothing held **22 ms**, the
other writer's lock **1835 ms**, a bill being written **20 ms**. Deleting the
lock reddens cell 1 at 48 ms against 21 ms free. Changing the mode to
`FOR UPDATE` reddens cell 2 at 1880 ms — **exactly one cell, naming the number
it found**, which is what a disproof should look like
([[a-green-cell-is-evidence-about-the-assertion-not-the-claim]], its amendment).

## The rules

- **Do not race a lock; hold it.** A race asks the scheduler to reproduce a
  microsecond window and reports whatever it got. Holding the lock makes the
  wait deterministic, and the difference between waiting and not waiting is the
  entire content of the claim.
- **Say which lock the waiter was waiting on, from `pg_stat_activity`, as a
  superuser.** A duration is not a cause. `wait_event_type`/`wait_event` and the
  blocked statement name it; another role's backend will show you a redaction
  that looks like an absence.
- **Every lock cell needs its NEGATIVE half.** *It waits for the right thing* is
  half a claim; *and for nothing else* is the half that catches the mode, and it
  is the half that turns a lock from a correctness fix into a shop-wide stall.
- **A blocked request holds nothing**, so never measure collateral damage from
  inside one. Hold the collateral lock yourself and time the route.
- **When the parent row is referenced by foreign keys, `FOR UPDATE` is almost
  never the mode you mean.** `FOR NO KEY UPDATE` serialises writers against each
  other and leaves `FOR KEY SHARE` alone. Measure the pair before choosing; the
  conflict matrix is four lines of SQL and the wrong choice is invisible.
- **A cell that reddens intermittently is not a cell.** If a mutation has to be
  run five times to see one red, the green runs were not evidence either.

## Two of the probe's own defects, because they are the same class

The script written to MEASURE the conflict matrix was wrong twice before it was
right, and both are worth carrying:

- It read the FK's issuing user on a connection with no open transaction, where
  `set_config(..., true)` applies to that statement alone. The next statement ran
  with no tenant context, RLS returned nothing, the id came back NULL, and the
  INSERT died on `NOT NULL` **before it ever reached the foreign key the probe
  was about** — reporting `not blocked` truthfully about nothing
  ([[set-local-per-request]]; the constraint disarming the mutation is the shape
  the [[a-green-cell-is-evidence-about-the-assertion-not-the-claim]] amendment
  records).
- It shared ONE holder transaction across two timings and rolled it back twice.
  The second timing measured a lock nobody was holding and printed
  `not blocked`, which was true and meaningless.

**An instrument built to check a lock needs its own control**: a row measuring
the same operations with NOTHING held. Both defects are visible in one glance at
such a row and invisible without it.

## Where proven

`server/scripts/prove_seller_code_reservations.py` cell D5 — the two-hold pair —
and D5b, which is kept as a smoke test and carries in its own banner the
measurement that it stayed green against a route with no lock. The lock itself is
`server/app/master.py` `_lock_shop_for_code_assignment`, which holds the measured
table in its docstring so the mode cannot be "tidied" back to `FOR UPDATE` by
somebody who has not run it.

Related: [[concurrency-tests-need-a-barrier]] (the barrier this extends),
[[a-check-that-never-went-red-was-never-observed]] (an instrument that cannot
fire), [[a-proof-must-establish-what-it-is-talking-to]].
