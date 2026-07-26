# A failure to reach a verdict is not a negative verdict — and not every verdict is final

**Context.** Every sync path has failure shapes that look identical from the call
site — all of them are "the send didn't work" — and must be handled in opposite
ways. There are THREE, not two.

- **UNAVAILABLE** — no network, timeout, socket closed, 5xx, expired token, or a
  response that was lost after the server may already have committed. The
  outcome is UNKNOWN. We do not know whether the bill exists on the server.
- **REJECTED, PERMANENT** — the server received the bill, understood it, and
  refused it on the payload's own merits (422: malformed money, net ≠ gross −
  tare, cross-tenant reference). The outcome is KNOWN and it is bad, and nothing
  anyone does will make THIS payload valid.
- **REJECTED, RESOLVABLE** — the server received the bill, understood it, and
  refused it because MASTER DATA it depends on is not set up (424: no price tier
  for the seller's grade, seller has no grade). The outcome is KNOWN and it is
  bad *today*. It becomes valid the moment the back office adds the price —
  without the bill changing at all.

## The question that separates them

The useful question is **not** "did it fail". It is:

> **Can anything make this bill valid later — and does the failure name what?**

- No, nothing can → PERMANENT. Terminal, surfaced for correction.
- Yes, and the server named it → RESOLVABLE. Park it, retry when that thing is
  fixed.
- We do not even know whether it failed → UNAVAILABLE. Retry forever.

"Does the failure name what" is load-bearing, not decoration. A refusal the
client can only recognise by string-matching an error message is not a
classification, it is a guess that breaks the first time someone rewords a
message or translates it. The server must state the kind in a form the client
reads structurally — here a distinct status code (424), with a machine-readable
`code` in the body for the UI. If the server cannot name it, treat it as
PERMANENT: better one bill visibly needing attention than a silent retry loop.

**Rule.** Classify every send outcome into one of these three before deciding
anything else, and make the type system carry the distinction rather than a
boolean or an exception. Then:

- UNAVAILABLE -> back to `pending`, `attempt_count++`, `last_error` recorded,
  retry with the SAME idempotency key, with backoff, **forever**. No attempt cap:
  a yard can be offline for days, and a bill marked `failed` for being offline is
  a lie about real money.
- REJECTED, PERMANENT -> `failed`, terminal, with the server's reason kept and
  shown. Never silently retried.
- REJECTED, RESOLVABLE -> PARKED: still `pending` and still owed, but removed
  from the sendable queue so it cannot dam the bills behind it, held in a named
  operator-visible state carrying the server's code, and retried on a slow
  cadence or when the operator says the data is fixed. Same idempotency key, so
  the eventual retry cannot duplicate. Retry backoff is the WRONG cadence here:
  retrying sooner cannot make a human add a price faster.
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
- Marking RESOLVABLE as PERMANENT **strands a load that has already been
  tipped**. The bill is terminally failed for a reason that stops being true five
  minutes later when the office adds the price — but nothing retries a `failed`
  record, so the only recovery is to re-weigh scrap that no longer exists as a
  separate load. The shop either loses the purchase or invents a weight. This is
  the failure that forced the third class: the two-way split was not wrong, it
  was too coarse.

There is a second-order trap: if this split is wrong, your sync metrics measure
network uptime instead of data quality. "Failed bills" becomes a graph of dead
spots, and the genuinely malformed bills are invisible inside it.

**Scope.** This governs every sync path built from here — bill sync, master-data
pull, any future upload queue — not only the purchase-bill engine. The retry
side only stays safe because the idempotency key is generated once and never
regenerated; see [[sync-state-needs-startup-recovery]].

**Where proven.** `mobile/src/sync/types.ts` models it as the `SendOutcome`
union (`accepted | duplicate | rejected | rejected_resolvable | unavailable`) so
a missed case is a compile error, and `mobile/src/sync/engine.ts` catches any
thrown send into `unavailable`. In `mobile/src/proof/proveSync.ts`: CASE 2 and
CASE 3 prove unavailable stays retryable (including after the server already
committed); CASE 7 proves a 422 lands in `failed`, keeps its reason, and is never
picked up again by `listReadyToSend`; CASE 10 proves the three-way split — 10a a
424 parks WITHOUT jamming the queue, 10b the SAME bill and SAME idempotency key
sync once the price exists (no re-weighing, no duplicate), 10c the slow cadence
releases it with no operator at all, 10d a malformed bill is still terminal and
is not touched by the release path. Server side,
`server/scripts/prove_master_data_gate.py` proves it over real HTTP: 424 carrying
`kind` and `code`, no bill row created and no `doc_no` burned, malformed input
still 422, then the byte-identical payload accepted once the price is added.
Generalised from defensive-coding rule #1.

**The ordering price.** Parking takes a bill out of the sendable queue, so it
receives a higher `doc_no` than loads weighed after it. That exemption and its
bound are recorded in [[doc-no-is-arrival-order-not-event-time]]; read it before
introducing any further "skippable" state.
