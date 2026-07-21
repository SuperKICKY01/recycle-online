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
}

const emptyResult = (): SyncRunResult => ({
  attempted: 0,
  synced: 0,
  retryable: 0,
  rejected: 0,
  skippedInFlight: 0,
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

  /** One pass over the bills whose backoff has elapsed. */
  async runOnce(): Promise<SyncRunResult> {
    const result = emptyResult();
    const ready = await this.store.listReadyToSend(this.clock.now(), this.batchLimit);

    for (const bill of ready) {
      if (this.inFlight.has(bill.id)) {
        result.skippedInFlight += 1;
        continue;
      }
      this.inFlight.add(bill.id);
      try {
        // Durable claim: loses the race cleanly if another runner got here
        // first, even one in a different process that we cannot see.
        const claimed = await this.store.claimForSend(bill.id, this.clock.now());
        if (!claimed) {
          result.skippedInFlight += 1;
          continue;
        }
        result.attempted += 1;
        await this.sendOne(bill, result);
      } finally {
        this.inFlight.delete(bill.id);
      }
    }
    return result;
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

      const pending = await this.store.listByState("pending");
      if (pending.length === 0) return total;
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
      // pending and retry with the same idempotency key.
      outcome = { kind: "unavailable", reason: describeError(err) };
    }

    switch (outcome.kind) {
      case "accepted":
      case "duplicate":
        // "Already exists" is success. It means our key won a previous race or
        // a lost response actually landed — the bill IS on the server.
        await this.store.markSynced(bill.id, outcome.doc_no, attempt, this.clock.now());
        result.synced += 1;
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
        const next = new Date(this.clock.now().getTime() + this.backoffFor(attempt));
        await this.store.markPendingAgain(bill.id, outcome.reason, attempt, next);
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
