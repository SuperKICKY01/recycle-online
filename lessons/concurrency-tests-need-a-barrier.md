# A concurrency test without a start barrier proves nothing

**Context.** Phase 2b had to prove that `claimForSend` is atomic: two overlapping
sync passes must never both claim the same bill. The test spawns N worker
threads, each with its own connection to one SQLite file, all racing to claim
the same rows.

**Rule.** Any test claiming to prove behaviour *under concurrency* must (a) hold
every worker at an explicit barrier until all of them are ready, and (b) print
evidence that their working windows actually overlapped — e.g. the latest start
timestamp against the earliest finish. Without both, the test has not
demonstrated concurrency and must not be described as if it had.

**Why (the failure it prevents).** Spawning a thread costs far more than doing a
few hundred small writes. The first version of this test reported
`wins = 200 + 0 + 0 + 0`: worker 1 finished every claim before worker 2 finished
opening its connection. The run was green. It asserted "each row claimed exactly
once" and that assertion passed — on a workload that never had two claimers
alive at the same time. A broken, non-atomic claim would have passed it just as
happily. The danger is not the failing test, it is the **passing** one:
false proof of the single guarantee standing between the customer and duplicate
real-money bills.

With a `SharedArrayBuffer` + `Atomics.wait` barrier the same test reported
`0 + 0 + 84 + 216` wins with 900 lost races, and the overlap line showed all
four threads claiming simultaneously — that is a race.

**Generalises to.** Anything where "at the same time" is the property under
test: parallel API calls, DB row locks, file locks, queue consumers. Green means
nothing until you can show the workers overlapped.

**Where proven.** `mobile/src/proof/claimWorker.ts` (barrier) and
`mobile/src/proof/sqliteProof.ts` S3, which asserts the overlap itself as a
check rather than assuming it. Related: [[sync-state-needs-startup-recovery]].

## Amended 2026-10-12 — the barrier for an HTTP route over Postgres, and the view that lies inside a transaction

To prove a route's write under concurrency (the void route, `server/scripts/prove_bill_filters.py` W1), build the
barrier from the database: a superuser connection takes the row lock (`SELECT … FOR UPDATE` in an open transaction),
the requests are sent, and the proof WAITS until `pg_stat_activity` shows every one of them blocked on that lock
(`wait_event_type = 'Lock'`) — that is the overlap evidence this file asks for — then releases it. **Watch from a SECOND
connection.** Inside a transaction Postgres reads `pg_stat_activity` once and serves that snapshot for the rest of the
transaction, so polling from the lock holder re-reads its first, empty picture forever: the first W1 run reported
0 waiters for ten seconds while both requests sat on the lock, and printed rows that cannot coexist (`state = 'idle'`
with `wait_event_type = 'Lock'`). Read that as "no concurrency happened" and a race is declared absent by an instrument
that never looked. The barrier earned its keep at once: the old SELECT-then-UPDATE route passed the sequential cell and
failed the barrier cell with two 200s.

