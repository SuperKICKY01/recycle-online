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
import { buildOutboxRegistry } from "./outboxHandlers.js";
import { OutboxRunner } from "./outboxRunner.js";
import type { OutboxKind } from "./outbox.js";

export interface SyncEngineOptions {
  store: LocalStore;
  transport: Transport;
  clock: Clock;
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
});

export class SyncEngine {
  private readonly store: LocalStore;
  private readonly clock: Clock;

  /**
   * THE MECHANISM. One registry — `bill_send` before `bill_void`, because the
   * literal's member order is the cross-kind drain order — and one generic
   * runner. The runner owns what the two hand-written loops used to: the
   * in-flight key set, the per-kind halted set (the successor of the
   * `sendForbidden` flag this class carried until stage 3 — the whole
   * argument, including why a halt is in memory and not persisted, lives on
   * `halt_kind` in ./outbox.js and on the runner's `halted` field), and the
   * process-scoped pass lock.
   */
  private readonly runner: OutboxRunner;

  constructor(opts: SyncEngineOptions) {
    this.store = opts.store;
    this.clock = opts.clock;
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
   */
  async recoverInterrupted(): Promise<{ readonly [K in OutboxKind]: readonly string[] }> {
    return this.runner.recoverAll(this.clock.now());
  }

  /**
   * One pass: the parked bills whose slow cadence has come due rejoin the
   * queue first, then the runner drains every kind in registry order —
   * `bill_send` to its stop before `bill_void`'s owed rows are read, which
   * is the cross-kind rule the registry literal's member order carries (the
   * crash-window argument sits on the literal in ./outboxHandlers.js).
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
    return report.result;
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
