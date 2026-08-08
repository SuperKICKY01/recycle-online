---
name: crash-safety
description: Keeping systems that take real-world actions (payments, orders, notifications, external writes) safe across failures, restarts, and state desyncs — and keeping unattended/scheduled jobs and data-ingestion pipelines safe from instance overlap, silent-empty feeds, and false successes. Use when building or reviewing execution paths, reconciliation, recovery/startup logic, kill-switches, safety gates on external data, deferred/queued actions, cron/Task Scheduler/CI jobs, ETL or sync pipelines with database writes, or anything where a crash mid-action or a false success can cost money, lose data, or duplicate real-world effects.
---

# Crash Safety

For systems whose actions are real — money moves, orders ship, emails send —
and for unattended pipelines whose failures nobody watches. The lead rule
was independently confirmed across four incidents; it goes first.

## Battle-tested core

### 1. Decide fail-open vs fail-closed per check — deliberately

- **Safety gates fail CLOSED:** missing, stale, or unparseable input means
  block the action. A gate that silently passes when its data feed breaks
  is not a gate.
- **Advisory layers fail OPEN:** an outage of a nice-to-have filter must
  never block the deterministic core path.

Classify every check as one or the other and implement its failure mode on
purpose. Confirmed across four incidents: a blocking flag that stays on
when its clear-signal is missed (correct — fail-closed); an advisory
model whose outage must not stop the pipeline (correct — fail-open); and
a safety feed where the code path that *fetches and parses* the data was
fail-open even though the gate it fed was documented as fail-closed —
every failure mode silently yielded "no data, no protection" for six days
spanning the single highest-risk window (see rule 2).

### 2. An empty result from a source that should never be empty is an alarm, not data

"Fetched successfully, parsed to zero items" is operationally identical to
"no protection" or "no data" — and it looks like success in every log.
For any feed, API, or query with a known-populated expectation:

- Assert the expectation ("this week's calendar cannot have zero entries";
  "this customer list is never empty") and alert loudly when it fails.
- Treat a non-empty response that parses to nothing as a **schema break**,
  not an empty dataset — log it as an error, discard nothing silently.
- For safety-relevant feeds, layer deterministic fallbacks (static known
  data, computed defaults) so protection is never zero while the live
  feed is broken.

Example: an upstream provider changed its date format; the parser
silently produced zero events from a fully populated feed for six days —
every fetch "succeeded," every log line looked routine, and the
protection that depended on the feed was disarmed the entire time. A
schedule-sync pipeline has the same failure shape: a source returning `[]`
upserts nothing and exits 0 unless zero-from-a-populated-source is
treated as an alarm.

## Executing actions

### 3. "Request accepted" is not "executed"

An API's success code often means "request received," not "action
completed." Confirm the authoritative record — the settlement entry, the
ledger row, the posted transaction — before recording the action as done.
If confirmation times out: alert and halt. Never fabricate the success
event; everything downstream (DB rows, monitors, analytics) would be built
on a success that may not exist.

Example: a submission API returned its DONE code while the transaction had
not yet posted; state recorded from that acceptance was silently corrupt.
The fix polls the authoritative history for the posted entry and halts
loudly on confirmation timeout.

### 4. Revalidate preconditions at execution time

When latency separates decision from action (queue delay, approval steps,
slow evaluation), the state that justified the decision may be gone.
Recheck preconditions against live state immediately before executing, and
abort with a visible reason if they no longer hold — time-of-check vs
time-of-use, applied to actions.

Example: a decision computed against one state executed 77 seconds later
against a drifted one; the request was structurally invalid by
submission time. The executor now rechecks the qualifying condition at
send time.

### 5. Preflight external constraints at the integration layer

Validate requests against the external system's rules (minimums, required
distances, formats) before submitting. The integration layer owns
constraint knowledge; business logic shouldn't know vendor rules and can't
keep them current.

Example: requests violating a vendor's minimum-distance rule surfaced only
as an opaque vendor error code retried three times; a preflight check at
the executor turned them into a clear local rejection with a reason.

### 6. Decide the transient-failure policy for every external call — in writing

For each external call, choose one deliberately:

- **Retry:** capped exponential backoff, honoring `Retry-After` on
  429/503; bounded attempts; only for idempotent (safe-to-resend)
  requests.
- **No retry:** an explicit, recorded decision that the next scheduled
  run is the retry.

Never the accidental third option — silent give-up that *looks like* a
no-retry policy but was never decided. And never unbounded retry, which
is a self-inflicted outage.

Provenance: an external safety feed returned HTTP 429 four times in one
afternoon; the fetch path silently gave up on each, leaving the dependent
gate unprotected with no record that a decision had ever been made. The
hardened path retries 429/5xx with capped backoff honoring `Retry-After`
and falls back to static data rather than running without.

### 7. Probe third-party constants before shipping

Documented enum constants may not exist in the installed package; compile
and import won't catch it — the `AttributeError` fires only when the code
path runs, possibly in production. One `hasattr` sweep over every newly
referenced constant of a wrapper library catches it cheaply.

### 8. Classify outcomes from recorded reason codes, not reconstruction

When the source system records *why* something closed, failed, or settled,
use that field. Inferring cause from nearby values (amount proximity,
timing) cannot distinguish causes that land at the same value.

Example: a support-ticket pipeline labeled closures by timing — "auto-
closed" vs "agent-closed" guessed from how near the close was to the SLA
deadline. Tickets the auto-janitor closed minutes before an agent's shift
were labeled agent-closed, and vice versa. The ticketing system's own
`closed_by` field distinguished them exactly; timing reconstruction never
could.

## Process lifecycle

### 9. Enforce single-instance before launching

Before starting a process that writes to a shared resource, check that an
instance isn't already running. Two writers on one account is a
double-action hazard — observed live: two instances briefly ran against
the same account, and only luck prevented duplicate real actions. Also
note: the already-running instance keeps its old code and config —
deploying a change means restarting *that* process.

### 10. Reconcile persisted in-flight state at startup

In-memory tracking dies with the process. On boot, sweep every record
marked "in progress" against external reality: still alive → re-track it;
already finished → resolve it now, idempotently. Otherwise orphans
accumulate silently.

Example: a record sat "in progress" for 18+ hours because the process
restarted between monitor polls; a startup sweep now resolves or re-tracks
every open record before listeners start.

### 11. Reconciliation monitors must survive the happy path

A desync detector that flags the normal success path is a self-DoS. Give
it grace windows for legitimately in-flight items, guards for
normal-completion races, and per-item debounce — and test it against the
ordinary success flow, not just failure scenarios.

Example: a monitor halted the system on every routine partial completion,
because "one part done, one part still active" looked identical to
"untracked item." The halt fired on the system's most common *success*
pattern.

### 12. When the detector might be wrong, halt — don't auto-remediate

On suspected desync, stop initiating new actions but never auto-reverse
existing ones: a false-positive detector that force-closes healthy work
converts a monitoring bug into real damage. Reserve automatic remediation
for unambiguous emergencies; everything else is halt + alert + human.

## Guarding state

### 13. Kill-switches must cover pending actions, not just active ones

Every guard written for active work has a blind spot for deferred work:
the queued or scheduled action that fires *after* the guard triggered.
When adding any deferred-execution mechanism, audit every kill-switch for
"does this also cancel what hasn't started yet?"

Example: a maintenance freeze cancelled active jobs but not scheduled
ones; a queued job fired mid-freeze — exactly what the freeze existed to
prevent. The freeze switch now also drains the schedule.

### 14. Deferred-action locks need three transitions

Lock on intent (placement), release on abandonment (cancelled without
executing), keep on commitment (executed). An append-only lock built when
"placed" and "done" were the same moment breaks the day they aren't:
either abandoned intents lock resources forever, or the gap between
placement and execution lets duplicates through.

### 15. A backstop is not a guard

If the check described as "last resort" or "fail-safe" is the only line of
defense, you have a single-layer defense with a two-layer name — by the
time it fires, the harm condition has already occurred. Add the preemptive
layer that keeps the line from being crossed, or rename the backstop
honestly.

Example: a threshold check fired only *after* the limit was breached;
historical data showed the limit had been breached 15 times with nothing
upstream to prevent it. A preemptive check now blocks any action whose
worst-case outcome would cross the line, and the backstop remains as the
second layer.

### 16. Fallbacks must not fabricate plausible data

A fallback that writes placeholder values shaped like real data (status
"MANUAL", amount 0.0) hides the failure and poisons every downstream
consumer — analytics, learning systems, dashboards. Fallback outputs must
be loud and unmistakably distinct from data ("UNRESOLVED", null + alert).
Watch also for fallback log messages that assert a cause ("likely manual
intervention") — one such message misdirected diagnosis for days while the
real bug was a query that never matched.

### 17. Multi-part state needs per-part tracking

One record with a single terminal status for a multi-component action lets
the first component's completion orphan its still-active siblings — and
lets the last write win on the aggregate result. Keep the parent open
until all parts resolve; accumulate per-part outcomes idempotently; and
make success labels net-aware — "hit the first milestone" is not success
if the remaining parts gave it back.

Example: an order fulfilled in two shipments had one `status` field, and
whichever shipment's carrier event arrived last overwrote the whole
order's outcome. An order that delivered parcel 1 and had parcel 2
returned was recorded simply as "returned" — and refund logic then
refunded the *entire* order. Meanwhile the still-in-transit sibling of a
"completed" order was flagged as untracked by reconciliation (the rule-11
self-DoS).

### 18. Query external systems by ID, never by time window

When an identifier exists, use it. Time-window queries silently return
empty on timezone or clock-basis mismatch. Example: a lookup used naive
local datetimes against a server expecting its own timezone — the window
pointed hours into the future, matched nothing, and 100% of lookups took
the (fabricating, rule-16-violating) fallback path. The ID-keyed query has
no timezone in scope at all.
