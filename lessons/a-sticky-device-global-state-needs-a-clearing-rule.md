# A sticky device-global state is a wedge when its fact can go false without a new process

Applies to any device-global flag set from a server answer and meant to persist —
a session end, a "too old" build, a "server in maintenance" banner. The 401 lesson
already says such state is **device-global and DERIVED, never stamped on a row**.
This is the other half: *derived* means derived on EVERY pass, and a flag that is
set-once and never re-derived is a **latch**, not a derivation — and a latch is
wrong the moment the fact it stands for can become false again on its own.

## What happened (red-team findings 4-5, version contract)

`appOutdated` was set `true` when a pass saw a 426 and **never set false** — sticky,
"cleared only by a new process (the app update)". That reasoning holds for the
normal case: an old build stays old until it is replaced. It breaks on one input the
author did not consider: the server floor is DATA, so a bad raise can be **rolled
back**, and then the same build the server refused a minute ago is accepted — with
nothing on the device to notice. Measured headless: floor raised past the build,
`appOutdated=true`, floor lowered again → the device went on rendering
`แอปเวอร์ชันนี้เก่าเกินไป` while its bills were syncing successfully. The screen
contradicting its own rows, and a shop that cannot work and cannot be helped
remotely.

## Two traps, and the second is subtler than the first

1. **THE LATCH.** A `boolean` set true and never false cannot represent a fact that
   oscillates. Replace it with a pure derivation over the pass result:
   `outdatedAfterPass(was, r)` — a fresh 426 sets it, a definitive **non-426** server
   answer clears it, no answer keeps `was`. The clearing evidence is unforgeable by a
   stale response because every counter it reads (`r.synced`, `r.rejected`, …) is set
   only when the server returned that status on a request THIS pass made — there is no
   cached client state that produces `r.synced > 0` without an actual accepted send.

2. **THE HALT THAT BLOCKS ITS OWN RE-PROBE.** The 426 correctly `halt_kind`s every
   kind (like a 403) so the queue does not re-POST. But a halted kind attempts
   nothing, so a plain pass observes an all-zero result and the derivation KEEPS the
   flag — for ever. The state that would clear the flag is the state the flag's own
   mechanism prevents from being observed. The recovery therefore needs an explicit
   **re-probe**: while the flag holds, retract the halt before each pass so it
   re-attempts and either re-halts (still 426) or drains (accepted). Prompt matters —
   *a floor that cannot be lowered promptly is worse than no floor* — so the re-probe
   rides the normal sync cadence rather than a slow timer.

**The queued work must survive BOTH directions**, and that is the acceptance test the
derivation is written against: the rows stay pending/owed and untouched under the
426, and drain unchanged when the fact goes false. Clearing a flag must never be able
to discard work.

## How to spot it before it ships

Ask of any device-global flag set from a server answer: **what event sets it back,
and is that event reachable in the state the flag creates?** For `appOutdated` the
answer was "a new process", and the input the author missed is the one where the
fact ends WITHOUT one. If the only clearer is a restart, and the underlying fact is
server-controlled data (a floor, a licence, a maintenance switch), it can change
under you and the latch will lie. Derive it; give it a re-probe if a halt hides the
evidence; and prove the clear on a real run, not the set.

**Where proven.** `mobile/src/sync/outdatedState.ts` (the derivation),
`SyncEngine.retractOutdatedHalt` (the re-probe), `mobile/src/proof/proveVersion.ts`
`caseRecovery` — a 426 sets the flag, a halted pass KEEPS it (the wedge), and a
lowered floor with a retract DRAINS and clears it with the bill surviving.
Sibling of [[401-is-about-the-caller-not-the-bill]] (rule 4, device-global and
derived) and of [[correct-classification-can-still-render-as-an-error]] (a screen
contradicting the row behind it).
