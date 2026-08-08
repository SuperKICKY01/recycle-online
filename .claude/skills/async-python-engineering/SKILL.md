---
name: async-python-engineering
description: Concurrency and resource anti-patterns for asyncio-based Python systems. Use when writing or reviewing any async Python code — coroutines, event loops, background tasks, long-lived services, event-bus/pub-sub pipelines, or code mixing async with synchronous libraries (DB drivers, C-extension SDKs, requests). Trigger on asyncio, await, event loop, coroutine, background task, worker loop, streaming, or any service that must stay responsive while doing work.
---

# Async Python Engineering

Every rule below is a production failure that actually happened in a
long-lived asyncio service; examples are neutralized. Ordered by severity.

### 1. Never call a blocking synchronous function inside a coroutine

Wrap every blocking call in `await asyncio.to_thread(...)` (or an executor).
Sync SDKs, C-extension bindings, DB drivers, `requests`, slow disk/network
I/O — all of them freeze the entire event loop, not just the caller.

```python
# ✅ Correct
result = await asyncio.to_thread(sdk.fetch_status)

# ❌ Wrong — stalls every other coroutine in the process
result = sdk.fetch_status()
```

Even a 50 ms block inside a tight loop drops events. A 5 s block means your
watchdog/heartbeat coroutine misses exactly the window it exists for. The
most dangerous victims are the safety-critical tasks whose silence you
won't notice.

Example: a service polled a vendor API through a sync C-extension; one
unwrapped call froze the heartbeat and alerting coroutines, so the
emergency path could not fire during the freeze.

### 2. Worker loops never raise — catch, log, continue

An exception escaping a `while True:` worker body kills the task silently.
The rest of the system keeps publishing into a dead consumer and degrades
to "everything passes" or "everything stalls" — with no crash to see.

Do: `while True: try: ... except Exception: logger.exception(...)`.
Never: let a per-item error terminate the loop.

Example: one malformed event raised during decode and killed a consumer
task; the queue kept filling for hours while the pipeline looked healthy.

### 3. Make concurrent tasks independently restartable

One task failing must never take down its siblings. Supervise each task
individually; if you `asyncio.gather` a set of long-lived workers, wrap
each in its own restart/containment logic so a single failure is contained
and visible, not fatal to the group.

Example: three pollers (fast/medium/slow cadence) ran with per-task
supervision; a transient API outage restarted one poller while the other
two kept streaming.

### 4. Release large objects deterministically in long-running loops

Scope DataFrames and large buffers locally; free them in a `finally:`
block (`del obj`, plus `gc.collect()` if profiling justifies it). Never
store a large object as an instance attribute of a long-lived worker —
that pins it for the worker's lifetime.

Example: a per-cycle DataFrame held on `self` pinned gigabytes across
event-loop iterations; memory grew until the box swapped.

### 5. Key time logic to data time, not wallclock

Cooldowns, rate limits, and "N seconds since last X" must use the
timestamp of the data being processed, not `time.time()`. Wallclock logic
silently breaks under replay/simulation (which may run 1000× real time)
and under clock skew; data-time logic behaves identically live and in
tests.

Example: a 60 s dedup cooldown keyed to wallclock never fired in a replay
harness; keyed to event timestamps, it behaved identically in both modes.

### 6. Watch for accidental O(n²) — scan the new tail, and verify before optimizing

- A scan over a *growing* list inside a per-event loop is quadratic.
  Record a high-water mark and scan only the new tail.
- Before optimizing the "obvious" culprit, verify complexity from the
  actual data structure. Example: a `.loc[:ts]` slice in a hot loop looked
  quadratic but was O(log n) on a monotonic index — the real quadratic was
  a full scan of an ever-growing results ledger elsewhere. "Fixing" the
  false lead would have saved nothing.

### 7. Never route paid per-call APIs through high-iteration loops

An LLM or metered API inside a loop that a test harness or batch job runs
thousands of times turns every iteration into a bill — and makes the
harness too expensive to run iteratively, which kills its value. Treat
metered calls as separately calibrated stages: stub or bypass them inside
the loop and validate them once, out of band.

Example: routing a simulation's items through a per-item LLM evaluation
would have cost $5–15 per run at hundreds of runs; the loop bypassed the
evaluator and its pass-rate was calibrated separately.

### 8. Keep LLM (and any slow-model) calls off latency-critical paths

If a code path has a deadline measured in seconds, it must be 100%
deterministic. Demote model judgment to a slow, cached, fail-open advisory
layer: it may *suppress* an action using its cached answer, but the hot
path never blocks on it, and an advisory outage must never block the
deterministic path.

Example: a 60–120 s model call gated a real-time action; by the time it
answered, the state it had evaluated no longer existed. Moving the model
to an hourly cached advisory kept the judgment and removed the latency
tax.

### 9. Respect routing contracts in event-driven systems

Components communicate via the bus/queue, never by direct call. Direct
calls bypass whatever the routing layer enforces — rate caps, cost caps,
escalation filters — and those caps then fail silently.

Example: a cost-capped evaluation service was designed to receive only
escalated items via the queue; a direct call path would have bypassed the
cost cap entirely.
