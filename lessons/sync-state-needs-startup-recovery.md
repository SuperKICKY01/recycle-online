# An in-progress state that nothing polls strands records forever

**Context.** The mobile sync engine moves a bill `pending -> syncing -> synced`.
The sender only ever looks for `pending` rows — that is what makes the in-flight
guard work, because a claimed bill disappears from every other runner's queue.
The consequence is that `syncing` is a state NO query returns. If the process
dies between the claim and the outcome, the bill sits in `syncing` and is never
looked at again: not by the next sync run, not by the next app launch, never.
The bill is saved locally, the user believes it is safe, and it silently never
reaches the server.

**Rule.** Any state that means "work in progress" must have an explicit startup
sweep that resolves it before the first work pass runs. Reset it to the
retryable state and record why. Never rely on the normal work loop to notice —
by construction, the normal loop cannot see it. Assert this in the proof by
checking that the stranded record is invisible to the sender BEFORE recovery
runs, not only that recovery works.

**Why (the failure it prevents).** Silent permanent loss of a real-money bill,
with the local record cheerfully claiming everything is fine. It is invisible in
testing because the strand requires a crash inside a narrow window, and it is
invisible in production because nothing ever queries the state that holds it.

**Corollary that made recovery cheap.** Recovery does not need to ask the server
whether the bill landed. Re-sending carries the same, never-regenerated
`idempotency_key`, so the server resolves the ambiguity itself — a repeated key
returns the existing bill instead of creating a second one (proven server-side
in Phase 1c, see [[login-resolves-under-tenant]] for the same
"let the lower layer enforce it" pattern). That turns distributed reconciliation
into a plain local state reset. It only works because the key is generated ONCE
at bill creation; regenerate it on retry and every recovery becomes a duplicate.

**Where proven.** `mobile/src/proof/proveSync.ts` CASE 4: the bill is forced to
`syncing`, the store is re-created to model a restart, and the proof asserts
`listReadyToSend` returns nothing — the bill really is unreachable — before
`recoverInterrupted()` returns it to `pending` and it syncs. CASE 3 proves the
same-key retry after a lost response yields exactly one bill on the server.
