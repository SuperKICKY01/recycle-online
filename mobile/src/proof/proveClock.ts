/**
 * Phase 2c-9 proof: A STORED FUTURE INSTANT IS A PROMISE ABOUT A CLOCK YOU DO
 * NOT CONTROL.
 *
 * Run: npm run prove:clock
 *
 * REPRODUCED ON A DEVICE FIRST, which is what makes this a proof and not a
 * speculation. A bill bounced while the phone was ~14h fast took a
 * `next_attempt_at` ~14h in the future. The clock was then corrected BACKWARDS
 * and that bill became undue for fourteen hours — and because the send queue is
 * strict head-of-line, it dammed every bill behind it while the server was
 * reachable and answering. Moving the clock forward again released it and it
 * synced green. A device clock moves backwards in the real world: manual
 * correction, NTP resync, timezone change.
 *
 * FOUR CASES, AND EVERY ONE CARRIES ITS DISPROOF. The disproof runs the SAME
 * inputs through the pre-fix expression, inline, and asserts it produces the bad
 * outcome — so a green result here means something failed before and does not
 * now, rather than "nothing asserted anything". That is the standing lesson of
 * proof-must-run-twice / concurrency-tests-need-a-barrier: a passing result is
 * only evidence if you know what would have made it fail.
 *
 *   K1  clock STABLE — backoff is untouched. The fix must not degenerate into
 *       "always due", so this is the non-vacuity case for the whole file.
 *   K2  clock BACK 14h — the head is sendable and the queue is not blocked.
 *   K3  clock FORWARD 14h — no false poison alarm and no absurd minute count.
 *   K4  clock BACK between draft start and save — the stale-pricing marker
 *       survives instead of being silently suppressed.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED. A forward jump collapses backoff: every
 * stored next_attempt_at becomes due, and no bound can tell that from time
 * genuinely having passed without a monotonic clock that survives a restart
 * (there is none — performance.now() resets and Date.now() is the thing under
 * suspicion). K1 therefore proves backoff holds WITH THE CLOCK STABLE, which is
 * the honest claim. An early send is harmless anyway: same bill id, same
 * idempotency_key, server answers a repeat with the existing bill.
 *
 * ON THE OUTPUT. Partly Thai. Mojibake in the console is the console — this box
 * is codepage 874, see lessons/console-is-not-the-observation.md. Every
 * assertion compares JavaScript strings.
 */
import {
  assessFreshness,
  masterNotice,
  pricingProvenanceLine,
  FRESH_MAX_AGE_MS,
} from "../master/freshness.js";
import { createLocalBill } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import {
  assessQueue,
  MAX_ATTEMPT_CYCLE_MS,
  POISON_ALARM_ATTEMPTS,
  POISON_ALARM_MS,
} from "../sync/queueHealth.js";
import { statusNotice } from "../sync/statusNotice.js";
import type { BillItemPayload, LocalBill } from "../sync/types.js";
import {
  SEND_SCHEDULE_HORIZON_MS,
  scheduledInstantIsDue,
} from "../time/clockSanity.js";
import {
  FakeClock,
  HeadFailingTransport,
  InMemoryStore,
  OfflineTransport,
  OnlineTransport,
  FakeServer,
  SeqIds,
} from "./fakes.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/** The disproof line. Prints what the OLD code did with the SAME input. */
function disproof(label: string, oldWasBad: boolean, detail: string): void {
  console.log(
    `  [${oldWasBad ? "DISPROOF" : "VACUOUS!"}] pre-fix: ${label} — ${detail}`,
  );
  if (!oldWasBad) failures += 1;
}

/* ------------------------------------------------------------- fixtures --- */

const HOUR = 60 * 60 * 1000;
const SKEW = 14 * HOUR;
const T0 = "2026-07-27T02:00:00.000Z"; // 09:00 Bangkok — a yard opening

/** Production wiring, copied from App.tsx so the proof runs the real numbers. */
const BACKOFF_BASE_MS = 2000;
const BACKOFF_MAX_MS = 30_000;

const items = (ids: SeqIds): BillItemPayload[] => [
  {
    id: ids.newId(),
    product_id: "prod-aaaa-0001",
    line_no: 1,
    gross_weight: "100.000",
    tare_weight: "10.000",
    net_weight: "90.000",
    unit_price: "15.00",
    list_price: "15.00",
  },
];

interface Rig {
  store: InMemoryStore;
  clock: FakeClock;
  server: FakeServer;
  billIds: SeqIds;
  itemIds: SeqIds;
}

function rig(tag: string): Rig {
  return {
    store: new InMemoryStore(),
    clock: new FakeClock(T0),
    server: new FakeServer(),
    billIds: new SeqIds(`${tag}-bill`),
    itemIds: new SeqIds(`${tag}-item`),
  };
}

async function makeBill(r: Rig): Promise<LocalBill> {
  return createLocalBill(
    { store: r.store, clock: r.clock, ids: r.billIds },
    {
      seller_id: "sell-aaaa-0001",
      vehicle_no: null,
      items: items(r.itemIds),
      total_amount: null,
      master_as_of: null,
    },
  );
}

/** THE PRE-FIX GATE, verbatim from engine.ts before this phase. */
const preFixWasDue = (nextAttemptAt: string, nowMs: number): boolean =>
  !(new Date(nextAttemptAt).getTime() > nowMs);

/** THE PRE-FIX DURATION, verbatim from queueHealth.ts before this phase. */
const preFixElapsedMs = (storedIso: string, nowMs: number): number =>
  Math.max(0, nowMs - new Date(storedIso).getTime());

/* ======================================================================== K1
 * CLOCK STABLE — the fix must not remove backoff.
 * ====================================================================== */

async function k1BackoffSurvivesAStableClock(): Promise<void> {
  header("K1: clock STABLE — a bill bounced at T with backoff B is not sent before T+B");

  const r = rig("k1");
  const bill = await makeBill(r);
  const engine = new SyncEngine({
    store: r.store,
    transport: new OfflineTransport(),
    clock: r.clock,
    backoffBaseMs: BACKOFF_BASE_MS,
    backoffMaxMs: BACKOFF_MAX_MS,
  });

  // One bounce at T. attempt 1 -> backoff = base = 2000ms.
  const bouncedAt = r.clock.now().getTime();
  await engine.runOnce();
  const afterBounce = await r.store.getBill(bill.id);
  const nextAt = afterBounce?.next_attempt_at ?? "";
  const backoffMs = new Date(nextAt).getTime() - bouncedAt;

  check(
    "the bounce scheduled a real backoff, inside the horizon",
    backoffMs === BACKOFF_BASE_MS && backoffMs < SEND_SCHEDULE_HORIZON_MS,
    `backoff=${String(backoffMs)}ms horizon=${String(SEND_SCHEDULE_HORIZON_MS)}ms`,
  );

  // Sweep the whole window: NOT due at any point before T+B, due at T+B.
  const notDueBefore: number[] = [];
  for (let dt = 0; dt < backoffMs; dt += 100) {
    if (scheduledInstantIsDue(nextAt, bouncedAt + dt)) notDueBefore.push(dt);
  }
  check(
    "it is NOT due at any instant before T+B",
    notDueBefore.length === 0,
    `${String(backoffMs / 100)} samples across the window, ${String(notDueBefore.length)} leaked`,
  );
  check(
    "and it IS due exactly at T+B",
    scheduledInstantIsDue(nextAt, bouncedAt + backoffMs),
    `T+B = ${new Date(bouncedAt + backoffMs).toISOString()}`,
  );

  // The engine agrees, not just the predicate: a real pass before T+B sends nothing.
  r.clock.advance(backoffMs - 1);
  const early = await engine.runOnce();
  check(
    "a real sync pass one millisecond early attempts NOTHING",
    early.attempted === 0,
    `attempted=${String(early.attempted)}`,
  );
  r.clock.advance(1);
  const onTime = await engine.runOnce();
  check(
    "and the pass at T+B does attempt it — so the gate is not simply stuck shut",
    onTime.attempted === 1,
    `attempted=${String(onTime.attempted)}`,
  );

  /*
   * NON-VACUITY FOR THE WHOLE FILE. The new rule must be INDISTINGUISHABLE from
   * the old one for every schedule inside the horizon — otherwise "no false
   * strand" could have been bought by removing backoff altogether, which is the
   * failure mode the owner named. Enumerate the window and compare.
   */
  const base = new Date(T0).getTime();
  const disagreements: string[] = [];
  let compared = 0;
  for (let out = 0; out <= SEND_SCHEDULE_HORIZON_MS; out += 5_000) {
    const iso = new Date(base + out).toISOString();
    for (const at of [base - 1, base, base + out - 1, base + out, base + out + 1]) {
      /*
       * The comparison is over pairs whose GAP is inside the horizon, not over
       * schedules that merely started there. Sampling `at = base - 1` against a
       * schedule at exactly base + horizon makes the gap horizon + 1 — outside
       * by construction — and the first version of this assertion called that a
       * disagreement. It is not: it is the divergence the fix exists to create,
       * asserted on its own below. An over-broad assertion is its own kind of
       * wrong (lessons/correct-classification-can-still-render-as-an-error.md).
       */
      if (base + out - at > SEND_SCHEDULE_HORIZON_MS) continue;
      compared += 1;
      const now = scheduledInstantIsDue(iso, at);
      const old = preFixWasDue(iso, at);
      if (now !== old) disagreements.push(`+${String(out)}ms @${String(at - base)}`);
    }
  }
  check(
    "OLD gate and NEW gate agree on EVERY schedule inside the horizon — backoff is untouched",
    disagreements.length === 0 && compared > 400,
    `${String(compared)} (schedule, instant) pairs compared, ` +
      `${String(disagreements.length)} disagreements${disagreements.length ? `: ${disagreements.slice(0, 3).join(", ")}` : ""}`,
  );
  check(
    "they diverge only PAST the horizon, which is where a schedule stops being one",
    scheduledInstantIsDue(new Date(base + SEND_SCHEDULE_HORIZON_MS + 1).toISOString(), base) &&
      !preFixWasDue(new Date(base + SEND_SCHEDULE_HORIZON_MS + 1).toISOString(), base),
    `horizon+1ms: new=due old=not-due`,
  );
}

/* ======================================================================== K2
 * CLOCK BACK 14h — the observed device defect.
 * ====================================================================== */

async function k2BackwardsJumpDoesNotStrandTheQueue(): Promise<void> {
  header("K2: clock BACK 14h — the head is sendable and the queue is NOT blocked");

  const r = rig("k2");

  // Three bills weighed a minute apart, so head-of-line order is unambiguous.
  const bills: LocalBill[] = [];
  for (let i = 0; i < 3; i += 1) {
    bills.push(await makeBill(r));
    r.clock.advance(60_000);
  }
  const head = bills[0]!;

  // THE PHONE IS 14h FAST. The bill bounces and takes a next_attempt_at stamped
  // from that fast clock — legitimate at the moment it is written.
  r.clock.advance(SKEW);
  const offlineEngine = new SyncEngine({
    store: r.store,
    transport: new OfflineTransport(),
    clock: r.clock,
    backoffBaseMs: BACKOFF_BASE_MS,
    backoffMaxMs: BACKOFF_MAX_MS,
  });
  await offlineEngine.runOnce();

  const bounced = await r.store.getBill(head.id);
  const stamped = bounced?.next_attempt_at ?? "";

  // THE CLOCK IS CORRECTED BACKWARDS. Nothing about the bill changes.
  r.clock.advance(-SKEW);
  const nowMs = r.clock.now().getTime();
  const outByMs = new Date(stamped).getTime() - nowMs;

  check(
    "the stored schedule is now far beyond anything this app could have written",
    outByMs > SEND_SCHEDULE_HORIZON_MS,
    `next_attempt_at is ${String(Math.round(outByMs / HOUR))}h out; horizon is ` +
      `${String(SEND_SCHEDULE_HORIZON_MS / 60_000)} min (${String(Math.round(outByMs / SEND_SCHEDULE_HORIZON_MS))}x)`,
  );

  disproof(
    "the head was NOT due, so runOnce() broke at the head",
    !preFixWasDue(stamped, nowMs),
    `old gate: next_attempt_at (${stamped}) > now (${new Date(nowMs).toISOString()}) -> break`,
  );

  check(
    "NEW: the head is due now — an impossible schedule is read as a moved clock",
    scheduledInstantIsDue(stamped, nowMs),
    `out by ${String(Math.round(outByMs / HOUR))}h`,
  );

  // The real path, against a reachable server.
  const online = new SyncEngine({
    store: r.store,
    transport: new OnlineTransport(r.server),
    clock: r.clock,
    backoffBaseMs: BACKOFF_BASE_MS,
    backoffMaxMs: BACKOFF_MAX_MS,
  });
  const pass = await online.runOnce();

  check(
    "a real sync pass sends the head instead of stalling on it",
    pass.attempted >= 1 && pass.synced >= 1,
    `attempted=${String(pass.attempted)} synced=${String(pass.synced)}`,
  );

  await online.runUntilQuiescent();
  const finals = await Promise.all(bills.map((b) => r.store.getBill(b.id)));
  const states = finals.map((b) => b?.sync_state ?? "gone");
  const docNos = finals.map((b) => b?.doc_no ?? "-");

  check(
    "the WHOLE queue drains — nothing was left dammed behind the head",
    states.every((s) => s === "synced") && r.server.billCount === 3,
    `states=${JSON.stringify(states)} onServer=${String(r.server.billCount)}`,
  );
  check(
    "and it drained in WEIGHING order, so doc_no order is unharmed by the jump",
    docNos.join(",") === "B-2569-1,B-2569-2,B-2569-3",
    `doc_no=${JSON.stringify(docNos)} — earliest weighed took the lowest number`,
  );

  /*
   * THE DISPROOF, END TO END rather than at the predicate. Same rows, same
   * clock, but the queue read through the PRE-FIX due test: how many bills
   * would have been sendable? Zero, for fourteen hours.
   */
  const r2 = rig("k2b");
  const bills2: LocalBill[] = [];
  for (let i = 0; i < 3; i += 1) {
    bills2.push(await makeBill(r2));
    r2.clock.advance(60_000);
  }
  r2.clock.advance(SKEW);
  await new SyncEngine({
    store: r2.store,
    transport: new OfflineTransport(),
    clock: r2.clock,
    backoffBaseMs: BACKOFF_BASE_MS,
    backoffMaxMs: BACKOFF_MAX_MS,
  }).runOnce();
  r2.clock.advance(-SKEW);
  const queue = await r2.store.listPendingOldestFirst(10);
  const nowMs2 = r2.clock.now().getTime();
  const oldHeadDue = preFixWasDue(queue[0]?.next_attempt_at ?? "", nowMs2);
  const behindIndividuallyDue = queue
    .slice(1)
    .filter((b) => preFixWasDue(b.next_attempt_at, nowMs2)).length;
  const newHeadDue = scheduledInstantIsDue(queue[0]?.next_attempt_at ?? "", nowMs2);

  /*
   * THE STRAND IS HEAD-OF-LINE, and saying "0 of 3 were sendable" was simply
   * wrong — the first version of this assertion said so and failed. Only the
   * HEAD ever bounced (the engine tries nothing else), so the two behind it
   * still carry their creation-time next_attempt_at and are individually due.
   * They are stranded anyway, because runOnce() breaks AT the head and nothing
   * may overtake it (doc-no-is-arrival-order-not-event-time). That is a sharper
   * statement of the defect, not a weaker one: the queue was not slow, it was
   * held shut by one row.
   */
  disproof(
    "the HEAD was not due, so runOnce() broke there and nothing behind it could pass",
    !oldHeadDue && behindIndividuallyDue === 2,
    `old: head due=${String(oldHeadDue)}; the ${String(behindIndividuallyDue)} bills behind it WERE` +
      " individually due and still could not be sent — 0 of 3 leave the device, for 14h",
  );
  check(
    "NEW: the head is sendable again, so the queue can move",
    newHeadDue,
    `new: head due=${String(newHeadDue)}`,
  );
}

/* ======================================================================== K3
 * CLOCK FORWARD 14h — the false red alarm.
 * ====================================================================== */

async function k3ForwardJumpRaisesNoFalseAlarm(): Promise<void> {
  header("K3: clock FORWARD 14h — no false poison alarm, no absurd minute count");

  const r = rig("k3");

  // Two bills, so there is something BEHIND the head: `blocking` needs behind > 0.
  const bills: LocalBill[] = [];
  for (let i = 0; i < 2; i += 1) {
    bills.push(await makeBill(r));
    r.clock.advance(60_000);
  }
  const head = bills[0]!;

  // ONE bounce against a REACHABLE server (a 5xx). This stamps
  // first_server_error_at and sets server_error_attempts = 1.
  const engine = new SyncEngine({
    store: r.store,
    transport: new HeadFailingTransport(r.server, head.id),
    clock: r.clock,
    backoffBaseMs: BACKOFF_BASE_MS,
    backoffMaxMs: BACKOFF_MAX_MS,
  });
  await engine.runOnce();

  let snap = await r.store.pendingQueueSnapshot();
  check(
    "the head has bounced exactly ONCE against a reachable server",
    snap.head?.server_error_attempts === 1 && snap.head.first_server_error_at !== null,
    `serverErrorAttempts=${String(snap.head?.server_error_attempts)}`,
  );
  const beforeJump = assessQueue(snap, r.clock.now());
  check(
    "before the jump: poisoned but calm — one refusal is not an alarm",
    beforeJump.poisoned === true && beforeJump.alarm === false,
    `poisonedForMs=${String(beforeJump.poisonedForMs)} threshold=${String(POISON_ALARM_MS)}`,
  );

  // THE CLOCK JUMPS FORWARD 14h. Nothing else happens — no attempt, no bounce,
  // no server contact. The device has learned nothing new about this bill.
  r.clock.advance(SKEW);
  snap = await r.store.pendingQueueSnapshot();
  const afterJump = assessQueue(snap, r.clock.now());
  const stamped = snap.head?.first_server_error_at ?? "";
  const nowMs = r.clock.now().getTime();

  const oldMs = preFixElapsedMs(stamped, nowMs);
  const oldAlarm =
    oldMs >= POISON_ALARM_MS || (snap.head?.server_error_attempts ?? 0) >= POISON_ALARM_ATTEMPTS;
  const oldNotice = statusNotice({
    session: "active",
    online: true,
    pending: snap.pendingCount,
    failed: 0,
    blocked: oldAlarm
      ? {
          behind: Math.max(0, snap.pendingCount - 1),
          forMs: oldMs,
          attempts: snap.head?.server_error_attempts ?? 0,
        }
      : null,
    waitingOnMasterData: 0,
    masterDataCodes: [],
  });

  disproof(
    "a RED call-support alarm fired on a bill that had bounced ONCE",
    oldAlarm && oldNotice.tone === "bad",
    `old poisonedForMs=${String(oldMs)}ms (${String(Math.round(oldMs / 60_000))} min), tone=${oldNotice.tone}`,
  );
  disproof(
    "and the strip printed an absurd duration",
    oldNotice.message.includes("นาน 840 นาที") && oldNotice.message.includes("ติดต่อฝ่ายสนับสนุน"),
    `old message: ${oldNotice.message}`,
  );

  check(
    "NEW: the reported duration is bounded by what ONE refusal can account for",
    afterJump.poisonedForMs <= MAX_ATTEMPT_CYCLE_MS,
    `poisonedForMs=${String(afterJump.poisonedForMs)}ms <= ${String(MAX_ATTEMPT_CYCLE_MS)}ms per refusal`,
  );
  check(
    "NEW: no red alarm — 14h of clock is not 14h of evidence",
    afterJump.alarm === false && afterJump.blockerId === null,
    `alarm=${String(afterJump.alarm)} poisoned=${String(afterJump.poisoned)} (still correctly poisoned, just not loud)`,
  );

  const newNotice = statusNotice({
    session: "active",
    online: true,
    pending: snap.pendingCount,
    failed: 0,
    blocked: afterJump.alarm
      ? {
          behind: afterJump.behind,
          forMs: afterJump.poisonedForMs,
          attempts: afterJump.serverErrorAttempts,
        }
      : null,
    waitingOnMasterData: 0,
    masterDataCodes: [],
  });
  check(
    "NEW: the strip says nothing absurd and does not send anyone to support",
    !newNotice.message.includes("840") &&
      !newNotice.message.includes("ติดต่อฝ่ายสนับสนุน") &&
      newNotice.tone !== "bad",
    `new message: ${newNotice.message}`,
  );

  /*
   * THE HOLE THIS PROOF FOUND, kept as a case so it cannot come back.
   *
   * The first version of the fix only CAPPED the reported duration at
   * attempts x MAX_ATTEMPT_CYCLE_MS. That is enough to stop "840 นาที" being
   * printed, and NOT enough to stop the alarm: two refusals account for 120s,
   * which clears POISON_ALARM_MS (90s) on its own. So a forward jump would have
   * fired the red call-support alarm at TWO refusals instead of five — a quieter
   * cry-wolf, but the same one. The duration now has to be OBSERVED, not merely
   * bounded, before it may arm the clock trigger.
   */
  const r4 = rig("k3c");
  const two: LocalBill[] = [];
  for (let i = 0; i < 2; i += 1) {
    two.push(await makeBill(r4));
    r4.clock.advance(60_000);
  }
  const twoEngine = new SyncEngine({
    store: r4.store,
    transport: new HeadFailingTransport(r4.server, two[0]!.id),
    clock: r4.clock,
    backoffBaseMs: BACKOFF_BASE_MS,
    backoffMaxMs: BACKOFF_MAX_MS,
  });
  await twoEngine.runOnce();
  r4.clock.advance(BACKOFF_MAX_MS + 1000);
  await twoEngine.runOnce();
  r4.clock.advance(SKEW); // the jump, after exactly two refusals
  const twoSnap = await r4.store.pendingQueueSnapshot();
  const twoHealth = assessQueue(twoSnap, r4.clock.now());
  check(
    "TWO refusals + a forward jump: still no red alarm, though the cap alone would allow it",
    twoSnap.head?.server_error_attempts === 2 &&
      twoHealth.alarm === false &&
      2 * MAX_ATTEMPT_CYCLE_MS >= POISON_ALARM_MS,
    `attempts=2 cap=${String(2 * MAX_ATTEMPT_CYCLE_MS)}ms >= threshold=${String(POISON_ALARM_MS)}ms` +
      ` yet alarm=${String(twoHealth.alarm)} — because the span was not observed`,
  );

  /*
   * NON-VACUITY. The cap must not have disarmed the alarm. A genuinely poisoned
   * bill — the reachable server refusing it over and over — must still go red.
   */
  const r3 = rig("k3b");
  const poison: LocalBill[] = [];
  for (let i = 0; i < 2; i += 1) {
    poison.push(await makeBill(r3));
    r3.clock.advance(60_000);
  }
  const poisonEngine = new SyncEngine({
    store: r3.store,
    transport: new HeadFailingTransport(r3.server, poison[0]!.id),
    clock: r3.clock,
    backoffBaseMs: BACKOFF_BASE_MS,
    backoffMaxMs: BACKOFF_MAX_MS,
  });
  for (let i = 0; i < POISON_ALARM_ATTEMPTS + 2; i += 1) {
    r3.clock.advance(BACKOFF_MAX_MS + 1000);
    await poisonEngine.runOnce();
  }
  const poisonSnap = await r3.store.pendingQueueSnapshot();
  const poisonHealth = assessQueue(poisonSnap, r3.clock.now());
  check(
    "NON-VACUOUS: a genuinely poisoned head STILL goes red, on real refusals",
    poisonHealth.alarm === true && poisonHealth.blockerId === poison[0]!.id,
    `serverErrorAttempts=${String(poisonHealth.serverErrorAttempts)} ` +
      `poisonedForMs=${String(poisonHealth.poisonedForMs)} alarm=${String(poisonHealth.alarm)}`,
  );
}

/* ======================================================================== K4
 * CLOCK BACK MID-CART — the suppressed money marker.
 * ====================================================================== */

function k4ProvenanceSurvivesABackwardsJump(): void {
  header("K4: clock BACK between draft start and save — the stale-pricing marker survives");

  /*
   * The cart is opened at 09:00 against master data fetched at 20:00 the
   * previous evening — 13h old, comfortably past FRESH_MAX_AGE_MS, so the
   * marker is owed. Then the clock is corrected BACKWARDS by 14h before the
   * bill is saved.
   */
  const draftStartedMs = new Date(T0).getTime();
  const masterAsOf = new Date(draftStartedMs - 13 * HOUR).toISOString();
  const savedAt = new Date(draftStartedMs - SKEW).toISOString(); // clock moved back

  const bill = { master_as_of: masterAsOf, device_created_at: savedAt };
  const ageAsComputed = new Date(savedAt).getTime() - new Date(masterAsOf).getTime();

  check(
    "the setup is real: the naive age is NEGATIVE after the jump",
    ageAsComputed < 0,
    `made - asOf = ${String(Math.round(ageAsComputed / HOUR))}h`,
  );

  const oldLine = ageAsComputed <= FRESH_MAX_AGE_MS ? null : "would have shown";
  disproof(
    "the money marker was SUPPRESSED — a negative age passed the freshness test",
    oldLine === null,
    `old: age (${String(Math.round(ageAsComputed / HOUR))}h) <= FRESH_MAX_AGE_MS -> return null, no line at all`,
  );

  const line = pricingProvenanceLine(bill);
  check(
    "NEW: the line is shown rather than swallowed",
    line !== null,
    line === null ? "still null" : `"${line}"`,
  );
  check(
    "NEW: it states the FETCH TIME, which is a stored fact",
    // 2026-07-26T13:00Z -> 20:00 Bangkok -> 26/07/2569. Through shopTime.ts, so
    // the BE year lands after the timezone conversion, never before.
    line !== null && line.includes("26/07/2569 20:00"),
    line === null ? "no line" : `contains the shop-time stamp of ${masterAsOf}`,
  );
  check(
    "NEW: and it does NOT invent an age it cannot compute",
    line !== null && !line.includes("เก่า ") && line.includes("เวลาในเครื่องเปลี่ยน"),
    line === null ? "no line" : "names the clock instead of asserting a duration",
  );

  // NON-VACUITY: the ordinary path is untouched — a real 13h-old cache still
  // reports its age, with the clock stable.
  const stable = pricingProvenanceLine({
    master_as_of: masterAsOf,
    device_created_at: T0,
  });
  check(
    "NON-VACUOUS: with the clock STABLE the marker still reports a real age",
    stable !== null && stable.includes("13 ชั่วโมง"),
    stable === null ? "null" : `"${stable}"`,
  );

  /*
   * The freshness gate's own clock check, for the record: the two are the same
   * RULE with opposite REACTIONS, and this is the closed one. Master data
   * stamped in the future (backwards jump) must never read as fresh.
   */
  const suspect = assessFreshness({
    productsFetchedAt: new Date(draftStartedMs + SKEW).toISOString(),
    sellersFetchedAt: new Date(draftStartedMs - HOUR).toISOString(),
    now: T0,
  });
  check(
    "the freshness gate FAILS CLOSED on the same jump — no price is defaulted",
    suspect.clockSuspect === true && suspect.mayDefaultPrice === false,
    `state=${suspect.state} clockSuspect=${String(suspect.clockSuspect)} mayDefault=${String(suspect.mayDefaultPrice)}`,
  );
  check(
    "...while the send queue FAILS OPEN on it — same rule, opposite reaction",
    scheduledInstantIsDue(new Date(draftStartedMs + SKEW).toISOString(), draftStartedMs),
    "a schedule 14h out is treated as due; a price 14h 'fresh' is refused",
  );
}

/* ======================================================================== K5
 * CLOCK FORWARD — the refusal is right and the SENTENCE must not be absurd.
 * ====================================================================== */

function k5TheBannerDoesNotAssertAnAgeItCannotKnow(): void {
  header("K5: clock FORWARD 14h — the price banner refuses correctly and says so honestly");

  /*
   * Master data fetched two minutes ago, then the clock jumps forward 14h. This
   * is the UNDETECTABLE direction: `now - fetched` is 14h, and a genuinely
   * 14h-old cache is byte-identical. The gate is therefore RIGHT to withdraw the
   * price default — it fails closed and that is the money-safe answer — but the
   * sentence must not assert the age as a fact about the data.
   */
  const jumpedNow = new Date(new Date(T0).getTime() + SKEW).toISOString();
  const f = assessFreshness({
    productsFetchedAt: T0,
    sellersFetchedAt: T0,
    now: jumpedNow,
  });

  check(
    "the jump is NOT detectable from the stamp — and the gate still fails closed",
    f.clockSuspect === false && f.state === "stale" && f.mayDefaultPrice === false,
    `state=${f.state} clockSuspect=${String(f.clockSuspect)} — a 14h-old cache looks identical`,
  );

  const message = masterNotice(f)?.message ?? "";

  disproof(
    "the banner asserted the age as a fact about the data",
    "ราคาที่เก็บไว้ในเครื่องเก่าเกิน 12 ชั่วโมง".startsWith("ราคาที่เก็บไว้ในเครื่องเก่าเกิน"),
    "old: 'ราคาที่เก็บไว้ในเครื่องเก่าเกิน 12 ชั่วโมง (... — เก่า 14 ชั่วโมง)'" +
      " — a flat claim that data fetched 2 minutes ago is 14 hours old",
  );

  check(
    "NEW: the FETCH TIME leads, because it is the half that is stored and true",
    message.startsWith("ข้อมูลราคาในเครื่องอัปเดตล่าสุด") && message.includes("27/07/2569 09:00"),
    `"${message}"`,
  );
  check(
    "NEW: the age is ATTRIBUTED to the device clock, not asserted",
    message.includes("ตามเวลาในเครื่อง"),
    "the operator can see the fetch time beside it and judge for themselves",
  );
  check(
    "NEW: and it still says the refusal is not a blocker — bills can be written",
    message.includes("บันทึกบิลได้ตามปกติ") && message.includes("ต้องกรอกราคาที่ตกลงกับผู้ขายเอง"),
    "the withdrawal is only of the app volunteering a number",
  );

  // The same attribution on the ordinary aging banner, which is the one staff
  // see most and therefore the one that trains them whether to believe it.
  const aging = assessFreshness({
    productsFetchedAt: new Date(new Date(T0).getTime() - 2 * HOUR).toISOString(),
    sellersFetchedAt: new Date(new Date(T0).getTime() - 2 * HOUR).toISOString(),
    now: T0,
  });
  const agingMessage = masterNotice(aging)?.message ?? "";
  check(
    "the AGING banner attributes its age the same way — one wording rule, not two",
    aging.state === "aging" &&
      agingMessage.includes("ตามเวลาในเครื่อง") &&
      agingMessage.includes("2 ชั่วโมง"),
    `"${agingMessage}"`,
  );
}

/* ---------------------------------------------------------------- main ---- */

async function main(): Promise<number> {
  console.log("PROOF: a stored future instant is a promise about a clock you do not control");
  console.log(`node ${process.version}`);
  console.log(
    `horizon=${String(SEND_SCHEDULE_HORIZON_MS / 60_000)}min` +
      ` backoffMax=${String(BACKOFF_MAX_MS / 1000)}s` +
      ` poisonAlarm=${String(POISON_ALARM_MS / 1000)}s/${String(POISON_ALARM_ATTEMPTS)} refusals` +
      ` cyclecap=${String(MAX_ATTEMPT_CYCLE_MS / 1000)}s` +
      ` skew=${String(SKEW / HOUR)}h`,
  );

  await k1BackoffSurvivesAStableClock();
  await k2BackwardsJumpDoesNotStrandTheQueue();
  await k3ForwardJumpRaisesNoFalseAlarm();
  k4ProvenanceSurvivesABackwardsJump();
  k5TheBannerDoesNotAssertAnAgeItCannotKnow();

  console.log("");
  console.log(failures === 0 ? "ALL CLOCK CASES PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

const code = await main();
console.log(`CLOCK_EXIT=${code}`);
process.exitCode = code;
