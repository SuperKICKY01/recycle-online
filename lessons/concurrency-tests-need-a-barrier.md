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
