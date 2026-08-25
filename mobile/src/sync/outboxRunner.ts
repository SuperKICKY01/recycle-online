/**
 * THE OUTBOX RUNNER: one drain, no hand-written loop per kind.
 *
 * The drain is generic over Row and Outcome, so it can name no kind: every
 * per-kind difference it exhibits is read off `OutboxPolicy`, and every
 * per-kind meaning (what an outcome says, what the store writes, which
 * counter moves) stays inside the handler. It obtains handlers ONLY by
 * enumerating the registry, in member order.
 *
 * RUNNER STATE OUTLIVES A PASS — the design's rule: the halted-kind set and
 * the in-flight key set live on the runner (the scope the engine's own
 * sendForbidden and inFlight fields carried before stage 3 moved both onto
 * this class), and the per-kind pass lock outlives even the
 * runner object — it is PROCESS-scoped (see PASS_LOCKS below), because the
 * serialisation claim the design makes is about one JavaScript context and a
 * second runner instance is the same context. `claim` (the durable
 * conditional UPDATE) remains the guard for a crash and for a second process.
 * Three mechanisms, three scopes, each needed: the per-unit `await` orders
 * one pass, the pass lock orders the passes, the claim survives the process.
 */

import { SEND_SCHEDULE_HORIZON_MS, scheduledInstantIsDue } from "../time/clockSanity.js";
import type { Clock } from "./types.js";
import type { SyncRunResult } from "./engine.js";
import type { OutboxHandler, OutboxKind, OutboxRegistry } from "./outbox.js";

/**
 * What one pass reports. `result` is the floor — every field the screen reacts
 * to, produced with the meaning `engine.ts` gives it today. `performed` is the
 * per-kind report added BESIDE it (the design licenses exactly that): rows on
 * which `perform` ran this pass, keyed by kind, so a kind the runner never
 * drained is a visible zero-keyed entry rather than a silence.
 */
export interface OutboxPassReport {
  readonly result: SyncRunResult;
  readonly performed: { readonly [K in OutboxKind]: number };
}

export interface OutboxRunnerOptions {
  registry: OutboxRegistry;
  clock: Clock;
  /** Rows examined per kind per pass. Bounds the work of one pass; not a retry cap. */
  batchLimit?: number;
}

/**
 * Per-kind pass locks for `serial_per_kind` kinds — PROCESS-SCOPED, not an
 * instance field. The design's serialisation section says "takes an
 * in-process lock", and `PASSES-OVERLAP-AND-ORDER-HOLDS` stages TWO RUNNER
 * INSTANCES over one store precisely because a lock held in an instance field
 * is a claim about one OBJECT: the second runner's pass would reach past the
 * first one's claimed head, and doc_no would fall to whichever request wins.
 *
 * KEYED BY KIND ALONE, which scopes it to the process rather than to a
 * store: one device is one process and one store, so this is exact for the
 * app. A process holding two INDEPENDENT stores would over-serialise only
 * passes it chose to run concurrently, and no caller in this tree does. The
 * durable `claim` remains the guard for a crash and for a second PROCESS.
 */
const PASS_LOCKS = new Set<OutboxKind>();

/**
 * A fresh, all-zero pass result. The field list is duplicated from
 * `engine.ts`'s private emptyResult ON PURPOSE, and the duplication cannot
 * drift silently: the literal is typed `SyncRunResult`, so a field added to
 * that interface is a missing-property compile error here.
 */
function emptyRunResult(): SyncRunResult {
  return {
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
  };
}

export class OutboxRunner {
  private readonly registry: OutboxRegistry;
  private readonly clock: Clock;
  private readonly batchLimit: number;

  /**
   * In-flight keys, ALL kinds in one set — the key spaces are kept apart by
   * each policy's `inFlightKey`. Fast in-process guard; the durable guard is
   * the handler's `claim`.
   */
  private readonly inFlight = new Set<string>();

  /**
   * Kinds a `halt_kind` disposition has stopped, DURABLY: a halted kind's
   * drain returns without reading rows on every later pass until retracted.
   * Deliberately in memory and not persisted — a restart costs one request,
   * and that request is the only way the device ever discovers the refusal
   * was lifted (the whole argument sits on `halt_kind`'s doc in ./outbox.js;
   * it carried over unchanged from the engine's sendForbidden field, which
   * this set replaced in stage 3).
   */
  private readonly halted = new Set<OutboxKind>();

  constructor(opts: OutboxRunnerOptions) {
    this.registry = opts.registry;
    this.clock = opts.clock;
    this.batchLimit = opts.batchLimit ?? 100;
  }

  /**
   * The registry's member set, in the literal's member order. String keys
   * enumerate in insertion order, and the registry is a mapped type with no
   * index signature, so these ARE the kinds — and the ORDER is load-bearing:
   * kinds drain in this order within a pass
   * (`SENDS-SETTLE-BEFORE-VOIDS-ARE-READ`).
   */
  private kinds(): readonly OutboxKind[] {
    return Object.keys(this.registry) as OutboxKind[];
  }

  /** Which kinds are currently halted. For callers with a screen; read-only. */
  haltedKinds(): readonly OutboxKind[] {
    return [...this.halted];
  }

  /**
   * Retract every halt. Exactly two events may call this — a sign-in (the one
   * event on this device that can change who is asking) and a sign-out (the
   * refusal was about an account that has just left) — and nothing else.
   */
  retractHalts(): void {
    this.halted.clear();
  }

  /**
   * Boot sweep, one call per kind, THROUGH the registry. Returns the swept ids
   * keyed by kind: the key set equals the member set by construction, so a
   * boot that bypassed a kind cannot produce this map — which is the only
   * observable a no-op recover has (`EVERY-KIND-RECOVERS-AT-BOOT`).
   */
  async recoverAll(now: Date): Promise<{ readonly [K in OutboxKind]: readonly string[] }> {
    const out: Partial<Record<OutboxKind, readonly string[]>> = {};
    for (const kind of this.kinds()) {
      out[kind] = await this.registry[kind].recover(now);
    }
    // Complete by construction: the loop just visited every registry key, and
    // the registry's own type is total over OutboxKind.
    return out as { readonly [K in OutboxKind]: readonly string[] };
  }

  /**
   * One pass: every kind, in registry order, each drained to its stop.
   * `seller_create` therefore settles before `bill_send` reads its owed rows,
   * and `bill_send` settles before `bill_void` reads its own — the cross-kind
   * rule — because each literal precedes the next.
   */
  async runPass(): Promise<OutboxPassReport> {
    const result = emptyRunResult();
    /** Keys already skip-counted this pass, so one held row is one skip. */
    const skipped = new Set<string>();
    const performed: Partial<Record<OutboxKind, number>> = {};
    for (const kind of this.kinds()) performed[kind] = 0;
    for (const kind of this.kinds()) {
      // The pair-erased view is sound: the drain is generic and never names a
      // kind, so every value it hands a handler is a value that same handler
      // produced.
      const handler: OutboxHandler<unknown, unknown> = this.registry[kind];
      await this.drainKind(handler, result, skipped, () => {
        performed[kind] = (performed[kind] ?? 0) + 1;
      });
    }
    return {
      result,
      // Complete by construction — same argument as recoverAll's map.
      performed: performed as { readonly [K in OutboxKind]: number },
    };
  }

  /**
   * Drain ONE kind to its stop. A halted kind, and a `serial_per_kind` kind
   * whose pass lock is taken, both return without reading rows.
   */
  private async drainKind<Row, Outcome>(
    h: OutboxHandler<Row, Outcome>,
    result: SyncRunResult,
    skipped: Set<string>,
    onPerformed: () => void,
  ): Promise<void> {
    if (this.halted.has(h.kind)) return;
    const serial = h.policy.concurrency === "serial_per_kind";
    if (serial) {
      if (PASS_LOCKS.has(h.kind)) return;
      PASS_LOCKS.add(h.kind);
    }
    try {
      await this.drainRows(h, result, skipped, onPerformed);
    } finally {
      // Every exit path — the throw out of perform/record included: held for
      // the length of one kind's drain, and a leaked lock is a kind that
      // silently never drains again in this process.
      if (serial) PASS_LOCKS.delete(h.kind);
    }
  }

  /**
   * The one loop. Its rules are the design's, one clause each:
   *
   *  - a batch is iterated by CURSOR, never by re-selecting its first row;
   *  - a held or not-due row is not attempted — `head_blocks` ends the pass,
   *    `independent` advances the cursor;
   *  - a lost claim is not an outcome — skip reported, cursor advances, row
   *    still owed;
   *  - one unit of work is claim, perform, classify, record, with the
   *    in-flight key held from before the claim until `record` returns and a
   *    throw out of `perform` converted by `onThrow`;
   *  - after `record` the disposition decides: `halt_kind` stops the kind
   *    durably, `retry` under `head_blocks` ends the pass (the row is still
   *    owed), every other disposition advances;
   *  - `rereadAfterEach` selects what advancing means after a row that
   *    advanced the QUEUE: re-read with cursor reset (how a bill freed by
   *    clearBackoffForPending goes in the SAME pass), or cursor within the
   *    batch;
   *  - the pass terminates under every policy: every iteration advances the
   *    cursor or ends the pass, each row is attempted at most once (the
   *    `attempted` set), and `guard` bounds the iterations — the re-read path
   *    included.
   */
  private async drainRows<Row, Outcome>(
    h: OutboxHandler<Row, Outcome>,
    result: SyncRunResult,
    skipped: Set<string>,
    onPerformed: () => void,
  ): Promise<void> {
    const headBlocks = h.policy.blocking === "head_blocks";
    const attempted = new Set<string>();
    const noteSkip = (key: string): void => {
      if (skipped.has(key)) return;
      skipped.add(key);
      result.skippedInFlight += 1;
    };

    let batch = await h.owed(this.batchLimit);
    let cursor = 0;

    for (let guard = 0; guard < this.batchLimit; guard += 1) {
      const row = batch[cursor];
      if (row === undefined) return;
      const id = h.rowId(row);
      const key = h.policy.inFlightKey(id);

      // Tried already this pass and still owed: under head_blocks, stop
      // rather than reach past it (or the retry of an older row would land
      // after a newer one); under independent, pass it by cursor.
      if (attempted.has(id)) {
        if (headBlocks) return;
        cursor += 1;
        continue;
      }
      // Held by another pass in this process. Under head_blocks that is a
      // stop worth reporting (the whole kind waits on it); under independent
      // it is routine — the transcription of today's send noteSkip+break
      // against the void drain's silent continue.
      if (this.inFlight.has(key)) {
        if (headBlocks) {
          noteSkip(key);
          return;
        }
        cursor += 1;
        continue;
      }
      // Not due — under the clock-sanity read: an over-horizon schedule is a
      // clock reading, not a schedule, and counts as due now.
      const due = h.dueAt(row);
      if (due !== null && !scheduledInstantIsDue(due, this.clock.now().getTime())) {
        if (headBlocks) return;
        cursor += 1;
        continue;
      }

      attempted.add(id);
      this.inFlight.add(key);
      let endPass = false;
      let advanced = false;
      try {
        const claimed = await h.claim(row);
        if (!claimed) {
          // A lost claim is not an outcome: nothing performed, nothing
          // classified, nothing recorded; the skip is the pass's only report
          // of it, and the row is still owed.
          noteSkip(key);
          cursor += 1;
          continue;
        }
        let outcome: Outcome;
        try {
          outcome = await h.perform(row);
        } catch (err) {
          outcome = h.onThrow(err);
        }
        onPerformed();
        const d = h.classify(outcome);
        const attempt = h.attempt(row) + 1;
        const now = this.clock.now();
        const next = h.nextAttemptAt(row, d, attempt, now);
        if (next !== null && next.getTime() - now.getTime() > SEND_SCHEDULE_HORIZON_MS) {
          // The constructor's horizon throw, moved to the only place that can
          // see a per-row value. LOUD, never a clamp: the schedule's reader
          // fails open, so a written over-horizon delay is a backoff silently
          // reduced to zero — and a clamp is the same defect one layer
          // quieter.
          throw new Error(
            `outbox ${h.kind} ${id}: nextAttemptAt=${next.toISOString()} is ` +
              `${String(next.getTime() - now.getTime())}ms out, past ` +
              `SEND_SCHEDULE_HORIZON_MS=${String(SEND_SCHEDULE_HORIZON_MS)}ms — ` +
              "refusing to write a schedule its own reader would discard as " +
              "clock damage. Raise the horizon in time/clockSanity.ts " +
              "deliberately, or fix the kind's schedule.",
          );
        }
        await h.record(row, outcome, d, attempt, next, now, result);
        switch (d.next) {
          case "halt_kind":
            this.halted.add(h.kind);
            endPass = true;
            break;
          case "retry":
            // The row is still owed. Under head_blocks that ends the pass —
            // the one disposition that does; under independent the cursor
            // passes it.
            if (headBlocks) endPass = true;
            else cursor += 1;
            break;
          default:
            // settled, terminal, parked, needs_review: the row left the
            // queue (or the sendable part of it) — the queue advanced.
            advanced = true;
        }
      } finally {
        this.inFlight.delete(key);
      }
      if (endPass) return;
      if (advanced) {
        if (h.policy.rereadAfterEach) {
          batch = await h.owed(this.batchLimit);
          cursor = 0;
        } else {
          cursor += 1;
        }
      }
    }
  }
}
