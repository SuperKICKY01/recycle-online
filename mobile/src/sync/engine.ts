/**
 * Sync engine. PURE TypeScript — imports nothing but the sync layer's own
 * modules.
 *
 * No React Native, no Expo, no node builtins. Production wires it to
 * expo-sqlite and fetch through the LocalStore/Transport interfaces; the proof
 * wires it to in-memory fakes. The engine cannot tell the difference, which is
 * exactly why it can be proven headless.
 *
 * Since P1.18 stage 3 the engine holds no drain of its own: the registry in
 * ./outboxHandlers.js carries one handler per kind and ./outboxRunner.js is
 * the one loop that reads them. What stays here is the public surface App.tsx
 * and the proofs drive — the pass, the recovery sweep, the sign-in/sign-out
 * retractions, and the operator's explicit master-data retry.
 */
import { SEND_SCHEDULE_HORIZON_MS } from "../time/clockSanity.js";
import type { Clock, LocalStore, Transport } from "./types.js";
import type { LocalSellerStore } from "./localSeller.js";
import type { SellerCreateTransport } from "./sellerCreate.js";
import { refillOnce } from "./sellerRefill.js";
import type { ReservationTransport } from "./sellerRefill.js";
import type { DeviceIdentityStore } from "../session/deviceIdentity.js";
import { buildOutboxRegistry } from "./outboxHandlers.js";
import { OutboxRunner } from "./outboxRunner.js";
import type { OutboxKind, OwedByKind } from "./outbox.js";

export interface SyncEngineOptions {
  store: LocalStore;
  transport: Transport;
  clock: Clock;
  /**
   * THE SELLER KIND'S STORE AND TRANSPORT — REQUIRED, not optional.
   *
   * `OutboxRegistry` is total over `OutboxKind`, so a third member means this
   * engine cannot build a registry without a store for it. Making these
   * optional with a default would leave every existing construction site
   * compiling clean while the kind drained against something that is not the
   * device's database — which is the defect the design names in its own words,
   * one level down, about a defaulted parameter.
   *
   * Required, they turned all 67 existing `new SyncEngine` sites into compile
   * errors. That sweep IS the mechanism: it is how the set of call sites is
   * known to be complete rather than remembered.
   */
  sellerStore: LocalSellerStore;
  /**
   * IT SPEAKS BOTH SELLER ROUTES, since P1.8b GATES. `SellerCreateTransport`
   * is the create; `ReservationTransport` is the top-up the pass now performs.
   * ONE object rather than two options because ONE class already implements
   * both (`adapters/httpSellerTransport.ts`), they share a base URL and a
   * token, and two fields would let a construction site point them at
   * different servers — which is a device creating sellers against one shop
   * while holding codes reserved by another.
   */
  sellerTransport: SellerCreateTransport & ReservationTransport;
  /**
   * WHICH INSTALLATION THIS IS. Required, for the same reason the two above
   * are: a reservation is held BY A DEVICE, and an engine that could not name
   * the device would have to invent an identity or skip the top-up silently.
   * The second is worse — a handset that never asks is a handset that can
   * never buy from a walk-in, with nothing on any screen to say so.
   */
  deviceStore: DeviceIdentityStore;
  /** First retry delay; doubles per attempt up to backoffMaxMs. */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Bills examined per pass. Bounds the work of one run; not a retry cap. */
  batchLimit?: number;
  /**
   * How long a bill parked on missing master data waits before it is retried
   * automatically. Deliberately SLOW and deliberately not a backoff: retrying
   * sooner cannot make the office add a price faster, and the operator has an
   * explicit retry for the moment they have added it.
   */
  masterDataRetryMs?: number;
}

export interface SyncRunResult {
  /** Bills this pass actually claimed and sent. */
  attempted: number;
  /** Reached the server (accepted or already-existed). */
  synced: number;
  /** Outcome unknown or unreachable — back to pending, will retry. */
  retryable: number;
  /** Server refused the bill on its merits — terminal, visibly failed. */
  rejected: number;
  /** Already in flight elsewhere; skipped rather than double-sent. */
  skippedInFlight: number;
  /** Voids confirmed by the server this pass (including "already voided"). */
  voidsApplied: number;
  /** Void attempts whose outcome is unknown — still owed, will retry. */
  voidsRetryable: number;
  /** Voids the server refused outright. */
  voidsRejected: number;
  /** Pending bills whose stale backoff was released by a successful send. */
  backoffsCleared: number;
  /** Bills the server refused for a RESOLVABLE reason; parked, not failed. */
  masterDataBlocked: number;
  /** Parked bills whose slow retry came due and were returned to the queue. */
  masterDataReleased: number;
  /**
   * Sends or voids that bounced because THE SESSION ENDED (401).
   *
   * Reported separately from `retryable` on purpose, because the UI's reaction
   * is different and opposite: `retryable` means "wait, it will go by itself"
   * and this one means "it will NOT go by itself — sign in". Folding it into
   * retryable is exactly how an expired session came to be displayed as ออฟไลน์.
   */
  sessionExpired: number;
  /**
   * Sends the server REFUSED on identity grounds (403): this account may not
   * submit bills.
   *
   * Separate from every other counter because the reaction is different from all
   * of them: `retryable` means wait, `sessionExpired` means sign in, `rejected`
   * means this bill is broken — and this one means NOTHING ON THIS DEVICE will
   * change the answer. It is also the signal that halts the send kind on the
   * runner, durably, until a sign-in or a sign-out retracts it.
   */
  forbidden: number;
  /** Voids the server refused on identity grounds (403). Not owed any more. */
  voidsForbidden: number;
  /**
   * Sends, voids or seller-creates the server refused because THIS BUILD is too
   * old (426). Device-global — the build is one fact for every kind — and its
   * reaction is unlike all the others: not wait (`retryable`), not sign in
   * (`sessionExpired`), not ask the owner (`forbidden`), but UPDATE THE APP, which
   * is a new process. It is the signal App turns into the sticky "update to
   * continue" screen; the kinds halt on the runner, and every queued unit stays
   * owed and untouched for the updated build to send.
   */
  clientOutdated: number;
}

const emptyResult = (): SyncRunResult => ({
  attempted: 0,
  synced: 0,
  retryable: 0,
  rejected: 0,
  skippedInFlight: 0,
  voidsApplied: 0,
  voidsRetryable: 0,
  voidsRejected: 0,
  backoffsCleared: 0,
  masterDataBlocked: 0,
  masterDataReleased: 0,
  sessionExpired: 0,
  forbidden: 0,
  voidsForbidden: 0,
  clientOutdated: 0,
});

export class SyncEngine {
  private readonly store: LocalStore;
  private readonly clock: Clock;
  /** The three the top-up needs. Held, not rebuilt: one device, one holding. */
  private readonly sellerStore: LocalSellerStore;
  private readonly sellerTransport: ReservationTransport;
  private readonly deviceStore: DeviceIdentityStore;

  /**
   * THE MECHANISM. One registry — `seller_create`, then `bill_send`, then
   * `bill_void`, because the literal's member order IS the cross-kind drain
   * order — and one generic runner. The runner owns what the two hand-written loops used to: the
   * in-flight key set, the per-kind halted set (the successor of the
   * `sendForbidden` flag this class carried until stage 3 — the whole
   * argument, including why a halt is in memory and not persisted, lives on
   * `halt_kind` in ./outbox.js and on the runner's `halted` field), and the
   * process-scoped pass lock.
   */
  private readonly runner: OutboxRunner;

  /**
   * THE REFILL HEARD A 401 (amended 2026-10-12). Set when the top-up answers
   * `session_expired`; while set the pass does NOT ask again — a dead token re-sent every
   * four seconds is a request that cannot succeed (measured on the walk: 7 per 30 s, all
   * 401). Cleared ONLY by a sign-in or a sign-out, the two events that change who is asking.
   * In memory on purpose, like the runner's halts: a cold start re-asks once and re-learns.
   */
  private refillSessionEnded = false;

  constructor(opts: SyncEngineOptions) {
    this.store = opts.store;
    this.clock = opts.clock;
    this.sellerStore = opts.sellerStore;
    this.sellerTransport = opts.sellerTransport;
    this.deviceStore = opts.deviceStore;
    const backoffBaseMs = opts.backoffBaseMs ?? 1_000;
    const backoffMaxMs = opts.backoffMaxMs ?? 5 * 60_000;
    const batchLimit = opts.batchLimit ?? 100;
    const masterDataRetryMs = opts.masterDataRetryMs ?? 5 * 60_000;

    /*
     * THE HORIZON MUST DOMINATE EVERY DELAY THESE KNOBS CAN PRODUCE.
     *
     * `next_attempt_at` is trusted only up to SEND_SCHEDULE_HORIZON_MS out;
     * past that it is read as evidence the clock moved and the bill is treated
     * as due (time/clockSanity.ts). If a knob were ever raised above the
     * horizon, the handlers built from it would write real schedules their own
     * reader discards — a backoff silently reduced to zero, which is the kind
     * of defect that shows up as "the server is being hammered" months later
     * and is never traced back to a constant.
     *
     * A throw, not a comment and not a clamp: it fires at construction, on
     * every path that builds an engine including the proofs, so the two numbers
     * cannot drift apart in silence. The runner carries the second gate — it
     * refuses any PER-ROW schedule past the horizon at the moment of the
     * write, which is the only place a per-row value can be seen.
     */
    for (const [name, ms] of [
      ["backoffMaxMs", backoffMaxMs],
      ["masterDataRetryMs", masterDataRetryMs],
    ] as const) {
      if (ms > SEND_SCHEDULE_HORIZON_MS) {
        throw new Error(
          `${name}=${String(ms)}ms exceeds SEND_SCHEDULE_HORIZON_MS=` +
            `${String(SEND_SCHEDULE_HORIZON_MS)}ms: schedules this engine writes` +
            " would be discarded as clock damage by its own reader. Raise the" +
            " horizon in time/clockSanity.ts deliberately, or lower the knob.",
        );
      }
    }

    this.runner = new OutboxRunner({
      registry: buildOutboxRegistry({
        store: opts.store,
        transport: opts.transport,
        clock: opts.clock,
        backoffBaseMs,
        backoffMaxMs,
        masterDataRetryMs,
        sellerStore: opts.sellerStore,
        sellerTransport: opts.sellerTransport,
      }),
      clock: opts.clock,
      batchLimit,
    });
  }

  /**
   * The operator has added the missing price and wants to see it clear NOW.
   * Releases every parked bill regardless of its slow cadence; the next pass
   * sends them in weighing order.
   */
  async retryMasterDataNow(): Promise<number> {
    return this.store.releaseMasterDataBlocked(this.clock.now(), true);
  }

  /**
   * The operator has signed in again. Returns how many records were freed to be
   * tried again — backoffs cleared PLUS void refusals retracted, because both are
   * "work that was blocked and no longer is", and the caller's only use of the
   * number is deciding whether to kick a sync pass now.
   *
   * Every backoff currently on the queue was computed while there was no usable
   * session, which is not a fact about the network at all — so without this the
   * yard signs in, sees the sign-in succeed, and then watches nothing happen for
   * up to backoffMaxMs. Same reasoning as clearBackoffForPending after a
   * successful send: the delay was computed against a world that no longer
   * exists. It does NOT re-send anything itself; the next pass does that, in
   * weighing order, with the same idempotency keys.
   */
  async resumeAfterSignIn(): Promise<number> {
    const now = this.clock.now();
    /*
     * A SIGN-IN IS THE ONLY EVENT ON THIS DEVICE THAT CAN CHANGE WHO IS ASKING,
     * so it is the only thing allowed to retract a 403. Both refusals go: every
     * halted kind on the runner (the 403 submit block), and every per-bill void
     * refusal.
     *
     * If the same staff user signs back in, each refused thing is re-asked
     * exactly once and lands back where it was. That is one request, not a loop,
     * and it is the price of the app not having to guess when a role changed.
     *
     * KNOWN LIMIT, stated rather than hidden: a role changed in the back office
     * while this session continues is invisible here until the next sign-in. The
     * token's TTL is one hour and there is no refresh, so in practice a shift
     * re-asks at least hourly. Nothing else on the device is evidence about a
     * role, and inventing a poll would be a request that exists to make the app
     * feel responsive rather than to answer a question anyone asked.
     */
    this.runner.retractHalts();
    this.refillSessionEnded = false;
    const freed = await this.store.clearBackoffForPending(now);
    const unrefused = await this.store.clearVoidRefusals(now);
    return freed + unrefused;
  }

  /**
   * A SIGN-OUT happened on this device (R1b). Drop the halted kinds.
   *
   * A halt on the send kind means "the server refused THIS ACCOUNT's submits",
   * and the account has just left. Carrying it across a sign-out would gate the
   * next user's send passes on a refusal that was never about them — the same
   * class of mistake as leaving the previous user's role on screen.
   *
   * SYNCHRONOUS AND STORE-FREE, deliberately, which is why it is not a sibling
   * of resumeAfterSignIn. That method also clears backoff and per-bill void
   * refusals; NEITHER belongs here. A backoff is a fact about the network and
   * survives a change of operator, and a refused void is recorded on its own row
   * as money the yard believes is cancelled and the server still holds live —
   * wiping that on sign-out would erase a disagreement about money because
   * somebody's shift ended. Both are retracted on the next SIGN-IN, which is the
   * event that can actually change the answer.
   */
  resetAfterSignOut(): void {
    this.runner.retractHalts();
    // The refill's 401 was about the account that just left (amended 2026-10-12).
    this.refillSessionEnded = false;
  }

  /**
   * THE GRANT IS BACK, ON THE SAME SESSION (3b, ADVISOR-DECIDED 2026-10-17). /whoami,
   * re-read after a refusal (app foreground, or ลองอีกครั้ง — src/session/grantRecheck.ts),
   * shows the permission a refused act needs; lift exactly that refusal so the next pass
   * re-asks. It amends the premise resumeAfterSignIn states — "a sign-in is the only event
   * that can change who is asking" stays true, but WHAT the same person may do can change
   * under them when the owner edits a role, and the server's own /whoami is evidence of it.
   *
   * `submit` retracts the runner's halts (the send kind's 403 halt); `voids` clears the
   * per-bill void refusals. NO backoff is cleared: a backoff is a fact about the network,
   * and nothing here says the network changed. Returns how many void refusals were lifted.
   * The server still judges every resent request; this only lets the device ask once more.
   */
  async resumeAfterGrantRestored(restored: { readonly submit: boolean; readonly voids: boolean }): Promise<number> {
    if (restored.submit) this.runner.retractHalts();
    return restored.voids ? this.store.clearVoidRefusals(this.clock.now()) : 0;
  }

  /**
   * Retract the per-kind halts so the NEXT pass RE-PROBES the server — the
   * recovery path for the version gate (red-team findings 4-5). A 426 halts every
   * kind, so without a periodic retract a floor RAISED past this build and then
   * LOWERED again (a bad raise, rolled back) could never be observed and the
   * device would stay wedged on the "update" screen. App calls this before each
   * pass WHILE it believes the build is too old; the re-probe either re-halts
   * (still 426) or drains (accepted). Unlike resumeAfterSignIn it clears NO
   * backoff and NO void refusals — it is only a re-probe, not a change of who is
   * asking, so it must not disturb work that was blocked for those other reasons.
   */
  retractOutdatedHalt(): void {
    this.runner.retractHalts();
  }

  /**
   * Call once at startup, BEFORE any sync run.
   *
   * One sweep per kind, THROUGH the registry, and the return value is a map
   * keyed by kind: its key set equals the member set of `OutboxKind` by
   * construction, which is the only observable a no-op recovery has — a boot
   * that swept some kinds and forgot others could not produce it.
   *
   * For bills stranded `syncing` the sweep is the old one: a send in progress
   * when the process died is reset to pending, and re-sending carries the same
   * idempotency key, so the server itself resolves a duplicate — recovery is a
   * plain state reset rather than a distributed query. The void kind reports
   * an empty list: its in-flight guard is in-memory, and a void stays owed
   * across a kill with or without any sweep.
   *
   * `seller_create` SWEEPS FOR REAL, as of P1.8b, and it is the SECOND kind
   * with durable in-flight state rather than the first. Its `claim` writes
   * `syncing` to disk and its queue reads only `pending`, so a row stranded by
   * a kill is invisible to everything until this runs. Re-sending carries the
   * same reservation TOKEN — the seller path's answer to what an idempotency
   * key is for a bill — so recovery is the same plain state reset.
   */
  async recoverInterrupted(): Promise<{ readonly [K in OutboxKind]: readonly string[] }> {
    return this.runner.recoverAll(this.clock.now());
  }

  /**
   * WHAT THIS DEVICE STILL OWES THE SERVER, PER KIND — the number the sign-out
   * gate turns on and the number the surfaces speak from.
   *
   * A PASS-THROUGH TO THE RUNNER AND NOTHING ELSE. It adds no arithmetic of its
   * own on purpose: the moment this class summed the map, the sum would be a
   * hand-written enumeration living one layer away from the registry that
   * defines the set, and the next kind would join the outbox without joining
   * the gate. `totalOwed` in ./outbox.js is the only reducer, and it walks the
   * map at run time.
   *
   * WHY THE GATE READS IT FROM HERE RATHER THAN FROM `LocalStore`. Until P1.8b
   * every kind's rows were in `local_bills`, so one statement over that table
   * WAS the whole answer and the gate could take it from the bill store.
   * `seller_create` is the first kind whose rows are not there
   * (`ROADMAP.md § P1.8` "The seller kind is the FIRST kind whose rows are not in `local_bills`"),
   * and its store is a separate contract by design. There is no longer a single
   * table to ask. The registry is what knows the set, so the registry is what
   * is asked.
   */
  async owedByKind(): Promise<OwedByKind> {
    return this.runner.owedCountByKind();
  }

  /**
   * One pass: the parked bills whose slow cadence has come due rejoin the
   * queue first, then the runner drains every kind in registry order —
   * `seller_create` to its stop, then `bill_send` to its stop before
   * `bill_void`'s owed rows are read, which is the cross-kind rule the registry
   * literal's member order carries (both arguments sit on the literal in
   * ./outboxHandlers.js).
   *
   * The release stays HERE rather than in any handler because it is not a
   * drain step: it mutates which rows are OWED before the pass reads them.
   * A released bill rejoins at its weighing position — if it is the oldest it
   * goes straight back to the head and is tried before anything newer, and if
   * the price is still missing it parks again on that attempt without having
   * blocked anything behind it.
   */
  async runOnce(): Promise<SyncRunResult> {
    const released = await this.store.releaseMasterDataBlocked(this.clock.now(), false);
    const report = await this.runner.runPass();
    report.result.masterDataReleased += released;
    report.result.sessionExpired += await this.topUpReservations();
    return report.result;
  }

  /**
   * TOP THE DEVICE'S HOLDING OF RESERVED SELLER CODES BACK UP — the refill's
   * call site, and it lands in P1.8b GATES rather than earlier.
   *
   * ---------------------------------------------------------------------------
   * WHY IT WAS BUILT AT `1d7f638` AND DELIBERATELY LEFT WITH NO CALLER
   * ---------------------------------------------------------------------------
   * A refill mints REAL reserved codes against the shop's own code sequence, and
   * NOTHING RE-ISSUES A RESERVATION — every code a device holds and never spends
   * is a permanent gap in a sequence that prints on slips this system never sees
   * again. Wiring it while no screen could write `local_sellers` would have had
   * every handset burn a block per pass for a capability nobody could use.
   *
   * WHAT CHANGED. A gate now refuses a sign-out that would strand an owed seller
   * create, and a bill can park behind one instead of dying on the server's 422.
   * The codes therefore have something to be spent on and something protecting
   * the work they produce. FROM THIS COMMIT ONWARD ANY HANDSET RUNNING THIS
   * BUILD AGAINST A REAL SERVER CONSUMES CODE SPACE — that is the intended
   * consequence, not a side effect, and it is irreversible.
   *
   * ---------------------------------------------------------------------------
   * AFTER THE DRAIN, NEVER BEFORE IT
   * ---------------------------------------------------------------------------
   * The design's rule is that a refill failure never blocks, parks or fails any
   * other unit of work. Running it AFTER the pass makes that structural rather
   * than argued: it cannot delay a bill send by even one round trip, on the one
   * path where a delay is money sitting on a device. A top-up is for the NEXT
   * walk-in and can wait a pass; a queued bill cannot.
   *
   * IT TOUCHES NO COUNTER AND OWES NOTHING. A refill is what the device WANTS
   * from the server, not what it OWES — so it has no queue entry and cannot
   * refuse a sign-out. That is the design's own reason for refusing to make it an
   * outbox kind, and it is unchanged: this produces no owed count.
   *
   * WHAT IT NOW WRITES, AND WHY THAT IS NOT OWED WORK. It captures the answer's
   * one fact the device cannot know locally — the shop's TARGET — and persists it
   * (`sellerStore.saveReserveTarget`) so the reserve strip can read the level with
   * no server. That is a read-only LEGIBILITY write, not a queue entry: it colours
   * nothing over work anyone is waiting for, and an `unavailable` bounce writes
   * nothing, leaving the last-known target for the strip itself to age out
   * (`master/reserveStrip.ts`). The method used to DISCARD `refillOnce`'s answer;
   * capturing it is the whole of what changed here.
   *
   * EVERY NON-ANSWER IS `unavailable`, FOR EVER, WITH NO CAP. `refillOnce`
   * catches its own throw, so an offline device, a dead token and a 500 all cost
   * exactly one attempt and leave one trace: the holding did not grow. A device
   * that gave up asking is a device that silently stops being able to buy from a
   * walk-in.
   */
  private async topUpReservations(): Promise<number> {
    // A 401 already heard: do not ask again until a sign-in or sign-out clears the flag.
    // Returns 0 — the session end was already REPORTED on the pass that heard it, and the
    // app's banner is sticky until a sign-in (sessionEndedAfterPass), so re-counting adds
    // nothing but would not hurt either.
    if (this.refillSessionEnded) return 0;
    const deviceId = await this.deviceStore.ensure(this.clock.now());
    const now = this.clock.now();
    const result = await refillOnce(
      { transport: this.sellerTransport, store: this.sellerStore },
      deviceId,
      now,
    );
    // Persist the shop's target from a `holding` answer, stamped with the same
    // `now` the refill used so `target_at` is this target's own age. An
    // `unavailable` bounce carries no target and writes nothing.
    if (result.outcome.kind === "holding") {
      await this.sellerStore.saveReserveTarget(result.outcome.holding.target, now);
    }
    if (result.outcome.kind === "session_expired") {
      this.refillSessionEnded = true;
      return 1;
    }
    return 0;
  }

  /**
   * Repeat passes until nothing is pending or maxPasses is spent. Between
   * passes it sleeps on the injected Clock, so tests advance time instantly.
   */
  async runUntilQuiescent(maxPasses = 200, pollMs = 250): Promise<SyncRunResult> {
    const total = emptyResult();
    for (let pass = 0; pass < maxPasses; pass += 1) {
      const r = await this.runOnce();
      total.attempted += r.attempted;
      total.synced += r.synced;
      total.retryable += r.retryable;
      total.rejected += r.rejected;
      total.skippedInFlight += r.skippedInFlight;
      total.voidsApplied += r.voidsApplied;
      total.voidsRetryable += r.voidsRetryable;
      total.voidsRejected += r.voidsRejected;
      total.backoffsCleared += r.backoffsCleared;
      total.masterDataBlocked += r.masterDataBlocked;
      total.masterDataReleased += r.masterDataReleased;
      total.sessionExpired += r.sessionExpired;
      total.forbidden += r.forbidden;
      total.voidsForbidden += r.voidsForbidden;
      total.clientOutdated += r.clientOutdated;

      /*
       * THE BUILD IS TOO OLD (426). No number of passes makes an old app new —
       * every send re-hits 426 and re-halts its kind — so spinning would only
       * inflate attempt_count before the operator has seen the "update" screen.
       * Checked FIRST of the three early returns, because a 426 refuses even the
       * sign-in a 401 would ask for. The caller (which has a screen) learns it
       * from the returned totals.
       */
      if (r.clientOutdated > 0) return total;

      /*
       * A REFUSAL ABOUT WHO IS ASKING is not progress this loop can make either,
       * and for the send half it would not even terminate: the bills stay
       * pending, so the quiescence test below never clears while the send loop is
       * gated off. Returning here reports the refusal to the caller in the same
       * breath as the session case, which is the caller that has a screen.
       */
      if (r.forbidden > 0 || r.voidsForbidden > 0) return total;

      // A session that has ended is not progress this loop can make. No number
      // of passes conjures a token, so spinning to maxPasses would only inflate
      // attempt_count and the backoff on every queued bill before the operator
      // has even seen the sign-in prompt. Same reasoning as the parked bills
      // below, and the caller learns why from the returned totals.
      if (r.sessionExpired > 0) return total;

      // Quiescent means nothing left to SEND and nothing left to void. Testing
      // only `pending` would return while a void was still owed, and a proof
      // built on that would assert the final state before it was final.
      //
      // listPendingOldestFirst, not listByState('pending'): a bill parked on
      // missing master data is still `pending` but is NOT work this loop can
      // make progress on — no number of passes will conjure a price. Counting it
      // would spin every caller to maxPasses and call a settled queue busy.
      const sendable = await this.store.listPendingOldestFirst(1);
      const owedVoids = await this.store.listVoidsToApply(1);
      if (sendable.length === 0 && owedVoids.length === 0) return total;
      await this.clock.sleep(pollMs);
    }
    return total;
  }
}
