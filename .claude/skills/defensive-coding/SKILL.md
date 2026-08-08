---
name: defensive-coding
description: Error semantics, state modeling, and validation gotchas that produce silent, hard-to-diagnose bugs. Use when writing or reviewing validation logic, status/lifecycle fields, identity/cache/dedup keys, data normalization or ingestion (choosing upsert keys, distinguishing "source failed" from "source returned nothing"), metrics with time-based names, error handling in evaluators or pipelines, or any sizing/limit computation (timeouts, budgets, capacity). Language-agnostic; examples in Python.
---

# Defensive Coding

Each rule is a production bug class. The lead rule was independently
confirmed across two different failure types — treat it as load-bearing.

### 1. A failure to evaluate is not a negative verdict

When an evaluator (validator, scorer, external API, model) fails for
infrastructure reasons — timeout, auth error, connection loss — emit an
explicit non-decision (SKIP / ESCALATE / UNKNOWN), never the domain's
"no." The terminal behavior may be identical (the item is not accepted),
but the recorded meaning must differ, or your quality analytics become a
mirror of your uptime.

Confirmed twice: a local-model timeout recorded as "rejected," and an API
auth failure recorded as "rejected." In the second case, 79% of recorded
"rejections" turned out to be infrastructure noise — every downstream
analysis of rejection quality was measuring API availability instead.

### 2. Identity keys contain only lifetime-stable fields

Dedup keys, cache keys, and idempotency keys may include only fields that
cannot change while the entity stays the same. A *measurement* of the
entity (a score, a rank, a computed size) is not its identity.

Example: a dedup key that included a recomputed quality score flickered
every processing cycle, so identical entities never matched the key —
thousands of duplicate events from one unchanged source. The identity was
the entity's stable bounds; the score was a measurement.

### 3. Lifecycle status needs a history scan, not a snapshot

A status describing what has *happened* to an entity
(untouched → used → exhausted; open → mitigated → closed) cannot be
computed from a point-in-time comparison of current values. Snapshot and
history agree on fresh entities and diverge exactly when the status
matters most.

Example: a promo code's "unused" status was derived from whether it
appeared in the *current* open-cart table; codes redeemed in past orders
re-qualified as fresh on every scan and were re-sent to customers
indefinitely. The status question is historical ("was this ever used?");
the query was a snapshot ("is it in use right now?"). The fix walks the
redemption history, not the current state.

### 4. A temporal qualifier in a name must exist in the formula

`daily_*`, `hourly_*`, `session_*` metrics must contain a temporal anchor
(day start, session start) in their computation. When you read or import
such a metric, trace the formula: if it's anchored to an all-time baseline
or a constant, the name is lying — and every consumer that trusted the
name inherits the bug.

Example: a "daily" error-budget metric was computed against the all-time
baseline and never reset per day; one bad day would have locked the
system out permanently, in a way no one predicted because the name said
"daily."

### 5. Handle zero before clamping

`clamp(x, min, max)` silently converts "nothing" into "minimum
something." If zero means "skip the action entirely," branch on it
explicitly *before* the clamp.

Example: a computed batch size of 0 was clamped up to the 1-unit minimum
and silently performed a real action that a deliberate cutoff was supposed
to prevent.

### 6. abs() hides directional violations

Validation via `abs(a - b) < threshold` collapses sign. If "wrong side"
is a distinct failure (a limit above instead of below; a start after the
deadline instead of before), check the signed condition first, then the
magnitude.

Example: a bounds check `abs(value - limit) > minimum` passed while the
value sat on the wrong side of the limit entirely; the vendor rejected the
request with an opaque error code that took a day to trace.

### 7. Never hardcode unit constants in timestamp→count conversions

`total_seconds() // 60` bakes "one bucket = one minute" into logic that
will someday run on 5-minute or 1-hour buckets and silently produce
numbers 5–60× off. Derive the bucket size from the data (median index
spacing) or take it as a parameter.

Detection trigger: any `total_seconds() // <literal>` in code that
consumes bucketed/resampled data is a suspected unit-mismatch bug until
proven otherwise.

Example: a timeout helper divided elapsed seconds by 60; correct on
1-minute buckets, it expired items 5× too early on 5-minute buckets and
60× too early on hourly ones — every prior run's timeout statistics were
wrong.

### 8. Size limits against worst-case, not nominal

Any sizing computation — timeouts, memory budgets, capacity limits, retry
budgets, per-unit risk — must include the execution overhead the real
world adds (network jitter, serialization cost, the spread between quoted
and actual cost). Sizing on the nominal figure means the configured limit
is a lie by exactly the overhead, on every single use.

Examples: a timeout sized to nominal processing time fires on healthy
requests the moment the network adds jitter; a per-operation budget sized
without per-call fees overruns by the fee on every call — the "5% cap" is
actually 5% plus overhead, compounding.

### 9. (minor) A block comment whose prose contains `*/` self-terminates

Documenting glob/regex patterns like `a*/b*` inside a `/* ... */` comment
closes the comment early; the rest of the file parses as code and fails
somewhere unrelated. Use line comments for prose that must contain `*/`.
