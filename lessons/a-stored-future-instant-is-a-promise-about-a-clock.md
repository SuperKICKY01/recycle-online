# A stored future instant is a promise about a clock you do not control

**Rule.** A stored instant is a claim made by a clock we do not own. When it
falls **outside the window the code that wrote it could possibly have
produced**, it is not information about the data — it is evidence that the
clock moved between the write and the read. Believe the bound, not the stamp.

Applies to anything that schedules future work from a device clock, and to
every elapsed duration derived from a stored device timestamp.

## What happened

A bill bounced while the phone's clock was ~14h fast, so `markPendingAgain`
stamped `next_attempt_at` ~14h in the future. Legitimate at the moment it was
written. Then the clock was corrected **backwards**, and that stamp became a
schedule 14 hours out.

The send queue is strict head-of-line — only the oldest pending bill may go,
nothing may overtake — so `runOnce()` hit this at the head and stopped:

```ts
if (new Date(bill.next_attempt_at).getTime() > this.clock.now().getTime()) break;
```

One row held the entire queue shut for fourteen hours while the server was
reachable and answering every request. Moving the clock forward again released
it and it synced green.

And the screen said **ยังส่งเข้าระบบไม่ได้ตอนนี้ ระบบจะส่งให้เองเมื่อเชื่อมต่อได้** — the
same class of lie as [[401-is-about-the-caller-not-the-bill]], through a door
nobody was watching. The mechanism is worth writing down because it is not
obvious: a pass that attempts nothing returns at `r.attempted === 0` before
anything touches `online`, so the strip keeps whatever it last said. **A state
that is never recomputed is not "unknown", it is stale — and it reads as a
confident claim.**

## Two windows, one rule

The audit found the same rule needed against two different bounds, and they
look like opposite tests until you state the bound:

| | what it stamps | largest gap the writer can produce | suspect when |
|---|---|---|---|
| `master_cache.fetched_at` | something that ALREADY happened | **zero** (+ tolerance) | stamp is in the future |
| `next_attempt_at` | something SCHEDULED | `max(backoffMaxMs, masterDataRetryMs)` | stamp is beyond the horizon |

Both catch the *same backwards move*, from opposite sides. That is why they are
one module (`mobile/src/time/clockSanity.ts`) and not two ideas — a rule written
twice is two behaviours waiting to drift, the same reasoning as one formatter in
[[render-in-shop-time-not-device-time]].

**The horizon is what makes detection possible at all.** Backoff has a maximum,
so a `next_attempt_at` further out than that maximum cannot be a schedule. On the
device the stamp was 14h out against a 5-minute maximum — 168×. Not a judgement
call.

## The reaction is NOT shared, and must not be

This is the part that would be wrong if it were tidied up later:

- **`master/freshness.ts` fails CLOSED.** A suspect clock withdraws the price
  default, because a price defaulted from data of unknowable age is paid out in
  cash ([[cached-master-data-is-a-price-claim]]).
- **The send queue fails OPEN.** A suspect schedule is treated as **due now**,
  because the harm there is a bill that never leaves the device — real money
  already paid, on one phone, with no server record. An early send costs nothing:
  same `idempotency_key`, so the server answers a repeat with the existing bill
  (hard rule 4).
  The other half of this — that no one can look inside that phone to check — is
  `ARCHITECTURE.md § 11`.

Same rule, opposite responses. Folding them into one *decision* would be the
mistake; folding the *question* into one module is what stops them drifting.

## Read time, never write time

The stamp was **correct when written**. It only became evidence when the clock
moved afterwards. A write-time clamp cannot see that and would have fixed
nothing — this is the whole reason the check lives in the reader.

## Capping the number does not disarm the trigger

Found by the proof before it shipped, and it is the sharpest thing here.

`poisonedForMs = now - first_server_error_at` gates the red "ติดต่อฝ่ายสนับสนุน"
alarm. A **forward** jump made it 14h, so one bounce produced:

```
บิล 1 ใบส่งไม่ผ่าน 1 ครั้งติด นาน 840 นาที ทั้งที่เชื่อมต่อเซิร์ฟเวอร์ได้ — ... ต้องติดต่อฝ่ายสนับสนุน
```

A forward jump is **not detectable from one stamp** — "stored 14h ago" and
"genuinely 14h old" are the same past instant. What bounds it is not a clock but
the **work that must have happened during it**: N consecutive refusals can only
account for N attempt cycles. Beyond that the device was not watching (clock
jump, or the app was simply closed overnight), and the extra time is not
evidence.

The first fix capped the reported duration at `attempts × MAX_ATTEMPT_CYCLE_MS`.
That stops the absurd number and **does not stop the alarm**: at a 60s cycle,
merely *two* refusals account for 120s, which clears the 90s threshold on its
own — so the red alarm would still have fired at two refusals instead of five,
undercutting `POISON_ALARM_ATTEMPTS` by exactly the cry-wolf failure
[[queue-jam-must-be-visible]] exists to prevent. A quieter wolf is still a wolf.

**Two questions, two answers, off the same pair:**

```ts
poisonedForMs   // what the operator is TOLD.     Capped, so never absurd.
poisonObserved  // whether it is EVIDENCE.        False once the raw span
                // exceeds what the refusals account for. Only this may arm
                // the clock trigger.
```

A "worst case" and a "sanity check" computed off one expression is the identical
shape to the `Math.min`/`Math.max` bug in [[cached-master-data-is-a-price-claim]].
It will keep reappearing; it is worth recognising on sight.

Note what carried the alarm through all of this: **the COUNT trigger, which does
not read a clock at all.** That is why a genuinely poisoned bill still goes red
when the clock is unreliable, and it is the strongest argument for having had two
triggers in the first place.

## A refusal can be right while the sentence is absurd

The freshness gate withdrawing the price default under a forward jump is
**correct** — it fails closed. But it then told the operator that data fetched
two minutes ago was *"เก่าเกิน 12 ชั่วโมง"*.

Since the jump is undetectable, the fix is not to the decision but to the
**claim**. Separate the halves and say which is which:

- `asOf` is a **stored stamp** — true whatever the clock has done since. It leads.
- the age is **derived** from the device clock — so it is attributed
  (`ตามเวลาในเครื่อง`), never asserted as a fact about the data.

A banner that is occasionally absurd is a banner staff stop reading, and the
fetch time printed beside the age is what lets someone see for themselves that
the age is nonsense. Same family as never rendering a diagnostic
([[correct-classification-can-still-render-as-an-error]]): the audience decides
what the artifact may claim.

## A negative age is not a fresh bill

`pricingProvenanceLine` computed `age = device_created_at - master_as_of` and
returned null for `age <= JUST_FETCHED_WINDOW_MS` (then `FRESH_MAX_AGE_MS`). A backwards jump between opening the
cart and saving makes that difference **negative**, which sails through the same
test — so the stale-pricing marker **vanished on exactly the bill most likely to
have been priced from a cache of unknowable age**. A false negative on a money
marker, which is the direction that hides things (Rule 4,
[[cached-master-data-is-a-price-claim]]).

`master_as_of <= device_created_at` holds by construction, so the largest gap in
the other direction is zero. It fails closed: the line is shown and states the
fetch time instead of an age it cannot compute.

Also fixed alongside it, and wrong independently of any clock: `App.tsx` passed
the **minute-rounded** UI ticker as the bill's `device_created_at` on the confirm
dialog. Rounding *down* understates the age by up to 59s and, near the threshold,
suppresses the line entirely — on the last screen before cash leaves the drawer.
**A value rounded for display is not a timestamp.**

## What this deliberately does NOT solve

- **A forward jump collapses backoff.** Every stored `next_attempt_at` becomes
  due, and nothing can distinguish that from time genuinely passing without a
  monotonic reference that survives a restart — there is none (`performance.now()`
  resets; `Date.now()` is the thing under suspicion). The proof therefore claims
  only that backoff holds **with the clock stable**, and enumerates 904
  (schedule, instant) pairs showing the old and new gates agree inside the
  horizon. Retrying early is the safe direction anyway.
- **The deferred alternative, named and not built:** store `backoff_ms` beside
  the stamp and anchor it to a **server-supplied instant** (`server_received_at`
  is already returned), making the schedule a duration from a clock we do control
  rather than an instant from one we do not. That is a schema change plus a wire
  change. Owner's call; it was weighed and declined for this phase.
- **`ORDER BY device_created_at`** — a backwards jump makes a later-weighed bill
  sort earlier and take the lower `doc_no`. **No horizon reaches this**: every
  value is a plausible past instant. Already covered by
  [[doc-no-is-arrival-order-not-event-time]] (reports key on
  `server_received_at`); explicitly out of scope, on the record.
- `blockedForMs` has **no upper bound** and that is stated at the call site
  rather than skipped: an offline device legitimately accumulates days of elapsed
  time with no attempts to account for it, so capping it by attempts would
  understate a genuine outage. It is amber context and triggers nothing.

## How to apply

1. Every stored instant read against `now` gets a bound: **what is the largest
   gap the writer could have produced?** If the answer is "there isn't one", write
   that down at the call site (`Number.POSITIVE_INFINITY` is an explicit
   parameter in `credibleElapsedMs` for exactly this reason — the question must be
   answered, not skipped).
2. Check at **read** time. A write-time clamp cannot see a jump that happens
   afterwards.
3. Decide the **reaction** per call site — closed where money is paid, open where
   work would be stranded — and never let one helper decide it for both.
4. For a duration, ask what **work** accounts for it, and keep "what we report"
   apart from "what we treat as evidence". Capping a number does not disarm a
   trigger that reads it.
5. Put the rule where **every** reader sees it. `listReadyToSend` is dead in
   production but live in five proof cases; a rule that landed only in the engine
   would have left the suite green while asserting the pre-fix semantics. Both
   stores — real and fake — or the suite proves two different behaviours.
6. Return `null`, not `0`, for an unknowable duration. A clamped `0` is a number,
   and a caller will compare it to a threshold without noticing.

**Where proven.** `mobile/src/proof/proveClock.ts` — K1 clock stable (backoff
intact, 904 pairs), K2 back 14h (head sendable, whole queue drains in weighing
order), K3 forward 14h (no false alarm, no absurd count, plus the two-refusal
hole the proof itself found), K4 backwards mid-cart (marker survives), K5 the
banner's wording. **Every case carries its disproof**: the same inputs through
the pre-fix expression, asserted to produce the bad outcome — so green means
something failed before and does not now ([[proof-must-run-twice]]).

A guard in `SyncEngine`'s constructor **throws** if `backoffMaxMs` or
`masterDataRetryMs` ever exceeds `SEND_SCHEDULE_HORIZON_MS`, so the engine can
never write schedules its own reader would discard as clock damage. A comment
would have been forgotten; a throw fires on every path that builds an engine,
proofs included.
