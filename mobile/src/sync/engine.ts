/**
 * Sync engine. PURE TypeScript — imports nothing but ./types.js.
 *
 * No React Native, no Expo, no node builtins. Production wires it to
 * expo-sqlite and fetch through the LocalStore/Transport interfaces; the proof
 * wires it to in-memory fakes. The engine cannot tell the difference, which is
 * exactly why it can be proven headless.
 */
import type {
  Clock,
  LocalBill,
  LocalStore,
  SendOutcome,
  Transport,
  VoidOutcome,
} from "./types.js";

export interface SyncEngineOptions {
  store: LocalStore;
  transport: Transport;
  clock: Clock;
  /** First retry delay; doubles per attempt up to backoffMaxMs. */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Bills examined per pass. Bounds the work of one run; not a retry cap. */
  batchLimit?: number;
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
});

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

export class SyncEngine {
  private readonly store: LocalStore;
  private readonly transport: Transport;
  private readonly clock: Clock;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly batchLimit: number;

  /** Fast in-process guard. The durable guard is store.claimForSend. */
  private readonly inFlight = new Set<string>();

  constructor(opts: SyncEngineOptions) {
    this.store = opts.store;
    this.transport = opts.transport;
    this.clock = opts.clock;
    this.backoffBaseMs = opts.backoffBaseMs ?? 1_000;
    this.backoffMaxMs = opts.backoffMaxMs ?? 5 * 60_000;
    this.batchLimit = opts.batchLimit ?? 100;
  }

  /**
   * Call once at startup, BEFORE any sync run.
   *
   * A bill in `syncing` means a send was in progress when the process died. We
   * do not ask the server whether it landed: re-sending carries the same
   * idempotency key, so the server itself resolves it — a duplicate submit
   * returns the existing bill instead of creating a second one. That makes
   * recovery a plain state reset rather than a distributed query.
   */
  async recoverInterrupted(): Promise<string[]> {
    return this.store.resetSyncingToPending(this.clock.now());
  }

  /**
   * One pass over the bills whose backoff has elapsed.
   *
   * The queue is RE-READ after every send rather than snapshotted once. A
   * successful send clears the stale backoff on every other pending bill, and
   * re-reading is what lets those freed bills be picked up in this same pass,
   * in device_created_at order, instead of waiting for the next tick.
   *
   * `attempted` bounds the loop: a bill is tried at most once per pass, so a
   * bill that returns to pending cannot be retried in a tight spin.
   */
  async runOnce(): Promise<SyncRunResult> {
    const result = emptyResult();
    const attempted = new Set<string>();
    const skipped = new Set<string>();

    const noteSkip = (id: string): void => {
      if (skipped.has(id)) return;
      skipped.add(id);
      result.skippedInFlight += 1;
    };

    for (let guard = 0; guard < this.batchLimit; guard += 1) {
      /*
       * STRICT HEAD-OF-LINE ORDER. The queue is read WITHOUT the backoff
       * filter, and only its head — the oldest unsent bill by weighing time —
       * may be sent. If the head cannot go, the pass stops; nothing behind it
       * is allowed to overtake.
       *
       * This is what actually fixes the observed defect. Sorting alone could
       * not: the older bill had failed twice and was sitting behind a 30s
       * backoff, so a backoff-filtered query did not return it at all, and a
       * bill weighed 73 seconds later was sent first and took the lower
       * doc_no (device: B-2569-34 weighed 22:53:38, B-2569-33 weighed
       * 22:54:51). A sort cannot order a row it cannot see.
       *
       * The cost is deliberate: one unsendable bill holds up the ones behind
       * it. That is what a queue means, and it is the right trade when the
       * numbers are legal documents.
       *
       * It CAN practically deadlock, and pretending otherwise was a real
       * mistake. A bill that fails DETERMINISTICALLY — a 5xx on that specific
       * payload, classified `unavailable` (not `rejected`, see
       * unavailable-is-not-rejected) — retries here forever and dams every bill
       * behind it, on this device, silently, while staff keep saving. The
       * engine does NOT auto-skip it: skipping the head would break ordering
       * silently, which is worse than the jam. The jam is made VISIBLE instead,
       * outside this loop — see sync/queueHealth.ts, surfaced by the UI once the
       * head has blocked past a threshold. No silent forever-stuck queue.
       */
      const queue = await this.store.listPendingOldestFirst(this.batchLimit);
      const bill = queue[0];
      if (bill === undefined) break;

      // Tried already this pass and still pending: stop rather than reach past
      // it, or the retry of an older bill would land after a newer one.
      if (attempted.has(bill.id)) break;
      // Being sent by another pass. Also a stop, not a skip.
      if (this.inFlight.has(bill.id)) {
        noteSkip(bill.id);
        break;
      }
      // The head is still in backoff, so the whole queue waits.
      if (new Date(bill.next_attempt_at).getTime() > this.clock.now().getTime()) break;

      attempted.add(bill.id);
      this.inFlight.add(bill.id);
      try {
        // Durable claim: loses the race cleanly if another runner got here
        // first, even one in a different process that we cannot see.
        const claimed = await this.store.claimForSend(bill.id, this.clock.now());
        if (!claimed) {
          noteSkip(bill.id);
          continue;
        }
        result.attempted += 1;
        await this.sendOne(bill, result);
      } finally {
        this.inFlight.delete(bill.id);
      }
    }

    // Voids run AFTER the sends, in the same pass and on purpose. A bill
    // created offline and voided offline becomes eligible the instant its send
    // succeeds above, so it syncs, receives its doc_no, and is voided without
    // waiting for another tick. Reversing this order would leave the void owed
    // for a whole poll interval, and a crash in that window would look exactly
    // like a bill the owner cancelled but the server still shows as active.
    await this.applyVoids(result);
    return result;
  }

  /**
   * Push every void still owed to the server.
   *
   * There is no attempt cap and no terminal failure state for an unknown
   * outcome: `void_requested_at` is never cleared, so the void stays owed
   * across retries, restarts and days offline. The only things that settle it
   * are the server confirming the void, or the server refusing it outright.
   */
  private async applyVoids(result: SyncRunResult): Promise<void> {
    const owed = await this.store.listVoidsToApply(this.batchLimit);
    for (const bill of owed) {
      const key = `void:${bill.id}`;
      if (this.inFlight.has(key)) continue;
      this.inFlight.add(key);
      try {
        const attempt = bill.void_attempts + 1;
        // A void request with no reason cannot exist: the store only ever
        // writes the two together. Defensive, and it keeps the type honest.
        const reason = bill.void_reason ?? "";

        let outcome: VoidOutcome;
        try {
          outcome = await this.transport.voidBill(bill, reason);
        } catch (err) {
          outcome = { kind: "unavailable", reason: describeError(err) };
        }

        switch (outcome.kind) {
          case "voided":
          case "already_voided":
            // "Already voided" is success. The server is in the state the owner
            // asked for, which is the entire question being answered.
            await this.store.markVoidApplied(bill.id, attempt, this.clock.now());
            result.voidsApplied += 1;
            break;

          case "rejected":
            await this.store.markVoidAttemptFailed(bill.id, outcome.reason, attempt);
            result.voidsRejected += 1;
            break;

          case "unavailable":
            await this.store.markVoidAttemptFailed(bill.id, outcome.reason, attempt);
            result.voidsRetryable += 1;
            break;

          default: {
            const never: never = outcome;
            throw new Error(`unhandled void outcome: ${JSON.stringify(never)}`);
          }
        }
      } finally {
        this.inFlight.delete(key);
      }
    }
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

      // Quiescent means nothing left to send AND nothing left to void. Testing
      // only `pending` would return while a void was still owed, and a proof
      // built on that would assert the final state before it was final.
      const pending = await this.store.listByState("pending");
      const owedVoids = await this.store.listVoidsToApply(1);
      if (pending.length === 0 && owedVoids.length === 0) return total;
      await this.clock.sleep(pollMs);
    }
    return total;
  }

  private async sendOne(bill: LocalBill, result: SyncRunResult): Promise<void> {
    const attempt = bill.attempt_count + 1;

    let outcome: SendOutcome;
    try {
      outcome = await this.transport.sendBill(bill);
    } catch (err) {
      // The send threw. The server may have committed the bill before the
      // connection died — we cannot know. Unknown is NOT failure: go back to
      // pending and retry with the same idempotency key. A throw means we got no
      // answer at all, so it is `reachable: false` (offline-shaped), never poison.
      outcome = { kind: "unavailable", reason: describeError(err), reachable: false };
    }

    switch (outcome.kind) {
      case "accepted":
      case "duplicate":
        // "Already exists" is success. It means our key won a previous race or
        // a lost response actually landed — the bill IS on the server.
        await this.store.markSynced(bill.id, outcome.doc_no, attempt, this.clock.now());
        result.synced += 1;
        // This send PROVED the server is reachable, so every other pending
        // bill's backoff was computed against a stale view of the world. Clear
        // it, or an older bill that failed a few times stays invisible to
        // listReadyToSend while newer bills sail past it and take lower
        // doc_no values — observed on the device as B-2569-34 (weighed
        // 22:53:38) arriving after B-2569-33 (weighed 22:54:51).
        result.backoffsCleared += await this.store.clearBackoffForPending(this.clock.now());
        return;

      case "rejected":
        // The server saw the bill and refused it. Retrying cannot fix that, so
        // it stops here — visibly failed, with the reason kept for the UI.
        await this.store.markFailed(bill.id, outcome.reason, attempt, this.clock.now());
        result.rejected += 1;
        return;

      case "unavailable": {
        // No attempt cap on purpose: a yard can be offline for days, and a bill
        // marked `failed` for being offline would be a lie. It stays pending
        // with attempt_count and last_error visible.
        const now = this.clock.now();
        const next = new Date(now.getTime() + this.backoffFor(attempt));
        // `now` stamps first_attempt_at on the FIRST bounce (COALESCE in the
        // store). `outcome.reachable` additionally drives first_server_error_at:
        // a server-answered failure runs the poison clock, a transport failure
        // resets it — that is how the UI tells a poisoned head from a plain
        // outage (sync/queueHealth.ts).
        await this.store.markPendingAgain(
          bill.id,
          outcome.reason,
          attempt,
          next,
          now,
          outcome.reachable,
        );
        result.retryable += 1;
        return;
      }

      default: {
        const never: never = outcome;
        throw new Error(`unhandled send outcome: ${JSON.stringify(never)}`);
      }
    }
  }

  private backoffFor(attempt: number): number {
    const raw = this.backoffBaseMs * 2 ** Math.max(0, attempt - 1);
    return Math.min(raw, this.backoffMaxMs);
  }
}
