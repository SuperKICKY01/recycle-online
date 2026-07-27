/**
 * IS THIS STORED INSTANT A FACT, OR A READING FROM A CLOCK THAT HAS MOVED?
 *
 * PURE TypeScript — no React Native, no Expo, no node — so the headless proof
 * exercises exactly the rule the device runs.
 *
 * ---------------------------------------------------------------------------
 * THE RULE, stated once, in one place
 * ---------------------------------------------------------------------------
 *
 *   A stored instant is a claim made by a clock we do not control. When it
 *   falls OUTSIDE the window the code that wrote it could possibly have
 *   produced, it is not information about the data — it is evidence that the
 *   clock moved between the write and the read. Believe the bound, not the
 *   stamp.
 *
 * Device clocks are untrusted (hard rule 7) and they move in the real world:
 * manual correction, NTP resync, a timezone change. ~3s of skew was measured
 * between the test phone and the server. A ~14h skew was observed on a device:
 * a bill bounced while the phone was 14h fast took a `next_attempt_at` 14h in
 * the future, and when the clock was corrected BACKWARDS that bill became undue
 * for 14 hours — which, under strict head-of-line ordering, stopped the entire
 * send queue while the server was reachable and answering.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS MODULE DELIBERATELY DOES NOT DECIDE: THE REACTION
 * ---------------------------------------------------------------------------
 * The two call sites want OPPOSITE things, and folding them into one decision
 * would be the mistake — it is the same shape as computing a "worst case" and a
 * "sanity check" off one expression, which is the bug
 * lessons/cached-master-data-is-a-price-claim.md records.
 *
 *   master/freshness.ts   fails CLOSED. A suspect clock WITHDRAWS the price
 *                         default, because a price defaulted from data of
 *                         unknowable age is paid out in cash.
 *
 *   sync/*                fails OPEN. A suspect schedule is treated as DUE NOW,
 *                         because the harm there is a bill that never leaves the
 *                         device — and a send that goes early is harmless: it
 *                         carries the same idempotency_key, so the server
 *                         resolves a repeat as "already created" (hard rule 4).
 *
 * Same rule, opposite responses. The rule lives here; each caller keeps its own
 * answer, and each says why at the call site.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CANNOT DO — read before assuming a clock jump is now handled
 * ---------------------------------------------------------------------------
 * A FORWARD jump cannot be detected from a single stamp. "Stored 14h ago" is
 * indistinguishable from "genuinely 14h old", because both are ordinary past
 * instants. Only two things bound it, and neither is a clock:
 *
 *   - a FUTURE stamp has a horizon (nothing schedules further out than the
 *     largest delay the writer can produce), so `futureStampSuspect` catches a
 *     backwards jump from the schedule side;
 *   - an ELAPSED duration can be bounded by the WORK that must have happened
 *     during it (`credibleElapsedMs`). Fourteen hours of continuous refusal by
 *     a reachable server implies hundreds of attempts; one attempt does not.
 *
 * Where neither bound exists, the age is simply believed and the failure must be
 * arranged to be safe — see the `accountedForMs` note below, and
 * ORDER BY device_created_at in SqliteLocalStore, which no bound reaches at all
 * (lessons/doc-no-is-arrival-order-not-event-time.md; deliberately out of scope).
 */

/* ------------------------------------------------------------- horizons -- */

/**
 * THE LARGEST GAP any writer of a scheduled instant in this app can produce.
 *
 * Everything that writes a future `next_attempt_at` writes `now + delay` where
 * delay is one of:
 *
 *   SyncEngine.backoffFor(...)  capped at backoffMaxMs  (30s in App.tsx, 5min default)
 *   masterDataRetryMs           the parked-bill cadence (5min default)
 *
 * so 5 minutes is the true maximum today. 15 is three times that, which leaves
 * room for a knob to be raised without silently turning real schedules into
 * "clock moved" — and SyncEngine's constructor THROWS if either knob ever
 * exceeds it, so the two cannot drift apart in silence. It is also comfortably
 * below the smallest clock move worth calling a jump: the coarsest timezone
 * step is 15 minutes and the common ones are 30 and 60.
 *
 * A judgement, like POISON_ALARM_MS. It is one constant, in one place, named.
 */
export const SEND_SCHEDULE_HORIZON_MS = 15 * 60_000;

/* ------------------------------------------------------------- parsing --- */

/**
 * An ISO instant as epoch ms, or null when it cannot be parsed.
 *
 * One definition, imported by every caller. A corrupt row must degrade to
 * "unknown" — never to a number that happens to look plausible.
 */
export function instantMs(iso: string): number | null {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

/* ---------------------------------------------------- the two predicates -- */

/**
 * PREDICATE 1 — a stamp recording something that ALREADY HAPPENED.
 *
 * A fetch, a first bounce, the start of a draft: all of them are in the past by
 * construction, so the largest gap the writer could have produced is ZERO. Any
 * meaningful amount of "ahead of now" means the clock moved BACKWARDS since the
 * write — and that is the dangerous direction, because it makes `now - stored`
 * SMALLER, so every age is understated and old data looks fresh.
 *
 * `toleranceMs` exists because two reads of the same clock are never exactly
 * ordered, and because a caller may round `now` (App.tsx rounds it down to the
 * minute for the freshness strip). It is the caller's slack, not a fudge: pass
 * the smallest value that cannot fire on ordinary jitter.
 */
export function pastStampSuspect(
  storedMs: number,
  nowMs: number,
  toleranceMs: number,
): boolean {
  return storedMs - nowMs > toleranceMs;
}

/**
 * PREDICATE 2 — a stamp that SCHEDULES something, with a known maximum horizon.
 *
 * A backoff has a maximum. So a `next_attempt_at` further out than that maximum
 * is not a schedule at all — no code path in this app could have written it —
 * and it is evidence the clock was AHEAD when it was written and has since been
 * corrected back.
 *
 * Note this catches the same backwards move as predicate 1, from the other
 * side: there the stored instant should have been in the past and is in the
 * future; here it is in the future but further out than it could legitimately
 * be. Two windows, one rule.
 */
export function futureStampSuspect(
  storedMs: number,
  nowMs: number,
  horizonMs: number,
): boolean {
  return storedMs - nowMs > horizonMs;
}

/* -------------------------------------------- the two things built on them */

/**
 * MAY THIS SCHEDULED INSTANT BE ACTED ON NOW? Built on predicate 2, and it
 * FAILS OPEN — every uncertain answer is `true`.
 *
 * Three ways to be due, and all three are deliberate:
 *
 *   the time has come            — the ordinary case; backoff is untouched
 *   the stamp is beyond the horizon — not a schedule, a clock reading
 *   the stamp will not parse     — a corrupt row must not strand a bill either
 *
 * WHY OPEN AND NOT CLOSED. Under strict head-of-line order the head is the only
 * bill that may be sent, so an unsendable head stops the whole queue
 * (lessons/queue-jam-must-be-visible.md). A stranded bill is real money already
 * paid, sitting on one phone, with the server holding no record. An early send
 * costs nothing: same bill id, same idempotency_key, and the server answers a
 * repeat with the existing bill.
 *
 * This is checked at READ time, never clamped at write time. A write-time clamp
 * cannot see a jump that happens AFTERWARDS, which is the entire observed
 * scenario: the stamp was legitimate when written and became evidence later.
 */
export function scheduledInstantIsDue(
  iso: string,
  nowMs: number,
  horizonMs: number = SEND_SCHEDULE_HORIZON_MS,
): boolean {
  const t = instantMs(iso);
  if (t === null) return true;
  if (futureStampSuspect(t, nowMs, horizonMs)) return true;
  return t <= nowMs;
}

/**
 * HOW LONG SINCE THIS HAPPENED — or null when the answer cannot be believed.
 * Built on predicate 1, and it FAILS CLOSED: null means "unknown", never 0.
 *
 * Returning `number | null` rather than clamping to 0 is the point. A clamped 0
 * is a NUMBER, and a caller will compare it to a threshold and act on the
 * comparison; `null` cannot be compared by accident, so the caller has to decide
 * what "unknown" means for it.
 *
 * `accountedForMs` — THE FORWARD-JUMP BOUND, and it has NO default on purpose.
 * Every caller must state what work bounds its duration, or state that nothing
 * does by passing Number.POSITIVE_INFINITY. Making it explicit is what stops the
 * question being skipped: a duration nothing bounds is believed, and the caller
 * should have written down that it knows that.
 */
export function credibleElapsedMs(
  storedMs: number,
  nowMs: number,
  toleranceMs: number,
  accountedForMs: number,
): number | null {
  if (pastStampSuspect(storedMs, nowMs, toleranceMs)) return null;
  return Math.min(Math.max(0, nowMs - storedMs), accountedForMs);
}
