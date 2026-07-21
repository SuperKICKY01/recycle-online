# A failure to reach a verdict is not a negative verdict

**Context.** Every sync path has two failure shapes that look identical from the
call site — both are "the send didn't work" — and must be handled in opposite
ways:

- **UNAVAILABLE** — no network, timeout, socket closed, 5xx, expired token, or a
  response that was lost after the server may already have committed. The
  outcome is UNKNOWN. We do not know whether the bill exists on the server.
- **REJECTED** — the server received the bill, understood it, and refused it
  (422: bad seller, cross-tenant reference, malformed payload). The outcome is
  KNOWN and it is bad. Every retry will be refused for the same reason.

**Rule.** Classify every send outcome into one of these two before deciding
anything else, and make the type system carry the distinction rather than a
boolean or an exception. Then:

- UNAVAILABLE -> back to `pending`, `attempt_count++`, `last_error` recorded,
  retry with the SAME idempotency key, with backoff, **forever**. No attempt cap:
  a yard can be offline for days, and a bill marked `failed` for being offline is
  a lie about real money.
- REJECTED -> `failed`, terminal, with the server's reason kept and shown. Never
  silently retried.
- A transport that **throws** is UNAVAILABLE, never REJECTED. A throw carries no
  information about whether the server committed.

**Why (the failure it prevents).** Conflating them breaks in both directions:

- Marking UNKNOWN as `failed` **loses bills**. Nothing retries a failed record,
  so a bill that merely hit a dead spot is abandoned. If the server had in fact
  committed it, local and server now disagree permanently; if it hadn't, the sale
  is simply gone. Either way the loss is silent — the record says "failed" as if
  someone decided that.
- Marking REJECTED as retryable **hides the bill instead of surfacing it**. It
  loops in `pending` forever, burning battery and data, and never reaches the
  operator as something needing correction. Staff see a bill that "hasn't synced
  yet," re-key it by hand, and now one load has produced two bills — one broken
  and hidden, one manual. That is the duplicate.

There is a second-order trap: if this split is wrong, your sync metrics measure
network uptime instead of data quality. "Failed bills" becomes a graph of dead
spots, and the genuinely malformed bills are invisible inside it.

**Scope.** This governs every sync path built from here — bill sync, master-data
pull, any future upload queue — not only the purchase-bill engine. The retry
side only stays safe because the idempotency key is generated once and never
regenerated; see [[sync-state-needs-startup-recovery]].

**Where proven.** `mobile/src/sync/types.ts` models it as the `SendOutcome`
union (`accepted | duplicate | rejected | unavailable`) so a missed case is a
compile error, and `mobile/src/sync/engine.ts` catches any thrown send into
`unavailable`. `mobile/src/proof/proveSync.ts` CASE 2 and CASE 3 prove
unavailable stays retryable (including after the server already committed);
CASE 7 proves a 422 lands in `failed`, keeps its reason, and is never picked up
again by `listReadyToSend`. Generalised from defensive-coding rule #1.
