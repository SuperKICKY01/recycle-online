/**
 * THE OUTBOX: ONE MECHANISM CARRYING SEVERAL KINDS OF WORK.
 *
 * P1.18 stage 3 — the TYPES of the mechanism, built to the design committed at
 * `91d49d0` (`ROADMAP.md § P1.18`, "THE OUTBOX DESIGN"). The handlers and the
 * registry literal live in ./outboxHandlers.ts; the drain lives in
 * ./outboxRunner.ts. This file declares WHAT a kind is and what every kind must
 * supply; it constructs nothing.
 *
 * WHY THIS IS NOT "EXTRACT THE COMMON LOOP", and the measurement that says so.
 * `engine.ts` held two hand-written drains at `91d49d0` — moved onto this
 * mechanism in stage 3 — that are DELIBERATELY DIFFERENT, and each
 * difference has a device incident behind it:
 *
 *   send   strict head-of-line over listPendingOldestFirst, queue read WITHOUT
 *          the backoff filter, the whole pass stops when the head cannot go,
 *          per-attempt backoff, and it does not run at all while submission is
 *          forbidden. Two bills weighed 73 seconds apart took doc_nos in the
 *          wrong order before that ordering existed.
 *   void   no backoff, no time gate, no attempt cap; a refusal of one row does
 *          not hold another; in-flight guard keyed `void:${id}`;
 *          void_requested_at is never cleared, so a void stays owed across
 *          restarts and days offline. (The void QUEUE is ordered —
 *          listVoidsToApply ends ORDER BY void_requested_at, id — it is the
 *          DRAIN that imposes no order. The design records that correction.)
 *
 * A single shared policy is a REGRESSION whichever way it goes — voids gaining
 * head-of-line blocking, or bills losing backoff. So POLICY IS PER KIND and the
 * shared part is what a kind IS, how it is drained, how its outcome is
 * classified, and how it is made visible.
 *
 * THE COMPILE-TIME GUARANTEE. `OutboxRegistry` is a MAPPED TYPE over
 * `OutboxKind`, and the one registry literal (outboxHandlers.ts,
 * buildOutboxRegistry) is typed with it. Adding a member to `OutboxKind` makes
 * that literal — and the OutboxRow/OutboxResult maps here — fail to typecheck
 * until a handler exists for it. That is the observable of
 * `THE-REGISTRY-IS-TOTAL-AND-IS-WHAT-THE-DRAIN-ENUMERATES` (the named criteria
 * in `ROADMAP.md § P1.18`; the numbered 1-7 this file's earlier revision cited
 * are superseded there).
 *
 * WHAT IT DOES NOT STOP, stated because a guarantee believed is not a guarantee
 * measured: nothing here prevents somebody writing a second drain that ignores
 * this file entirely. The registry makes the SUPPORTED path total over the
 * kinds — it cannot make an unsupported path unwriteable
 * (`NO-SECOND-DRAIN` states that limit in its own text).
 */

import type { LocalBill, SendOutcome, VoidOutcome } from "./types.js";
import type { SyncRunResult } from "./engine.js";

/**
 * EVERY KIND OF WORK THE DEVICE OWES THE SERVER.
 *
 * TWO members, deliberately. `seller_create` was declared in stage 1 and is
 * REMOVED by the stage-2 design: what identifies a locally created seller
 * across offline devices is an OPEN DECISION of the owner's
 * (`OPEN_ITEMS.md § Decisions open`, the two-handsets seller-code finding), and
 * a union member nobody may build makes the registry literal a permanent red or
 * a permanent excuse to leave it unbuilt. The kind returns in the step that
 * answers the decision. The generalisation is demonstrated by the COMPILE
 * ERROR adding a member produces, not by a third runtime kind.
 */
export type OutboxKind = "bill_send" | "bill_void";

/**
 * Each kind's own row type. Both bill kinds carry LocalBill today; the map
 * exists so a kind with a DIFFERENT row (a photo descriptor, a local seller)
 * is three one-line edits in this file, each demanded by the compiler.
 */
export interface OutboxRow {
  bill_send: LocalBill;
  bill_void: LocalBill;
}

/**
 * Each kind's own transport-outcome union. Kept per kind so the drain never
 * learns what a status means: "409 settles here and retries there" is two
 * lines in two different `classify` functions, never a drain branch.
 */
export interface OutboxResult {
  bill_send: SendOutcome;
  bill_void: VoidOutcome;
}

/**
 * THE REGISTRY — total by construction. A mapped type over `OutboxKind`, so a
 * new member reddens every literal of this type until the kind has a handler,
 * and pins each kind to its own Row and Outcome, so a handler written against
 * the wrong row does not compile. The runner obtains handlers ONLY by
 * enumerating a value of this type, and drains kinds in its member order —
 * which makes the literal's member order LOAD-BEARING
 * (`SENDS-SETTLE-BEFORE-VOIDS-ARE-READ`; the argument sits on the literal in
 * outboxHandlers.ts).
 */
export type OutboxRegistry = {
  readonly [K in OutboxKind]: OutboxHandler<OutboxRow[K], OutboxResult[K]>;
};

/**
 * The per-kind policy, read by the drain and by nothing else.
 *
 * `blocking` AND `rereadAfterEach` ARE NOT INDEPENDENT — only two of the four
 * pairs mean anything, and one illegal pair fails by draining SLOWLY rather
 * than by failing (the design's pair rule):
 *
 *   head_blocks + re-read   the send kind. The re-read is the only reason a
 *                           bill freed by clearBackoffForPending goes in the
 *                           SAME pass. Safe only here: a row still owed after
 *                           `record` stops the pass, so no re-read can hand
 *                           the same row back.
 *   independent + snapshot  the void kind. One read, iterated by cursor; a
 *                           row that stays owed is passed over by the cursor
 *                           rather than by leaving the set.
 *   independent + re-read   legal to write, drains ONE row per pass — a row
 *                           that stays owed heads every re-read, so the pass
 *                           ends on the per-pass bound instead of the queue.
 *   head_blocks + snapshot  the send kind with its second half removed: the
 *                           pass can never pick up a row its own success just
 *                           released.
 */
export interface OutboxPolicy {
  /** A row that cannot go: `head_blocks` ends the kind's pass, `independent` advances past it. */
  readonly blocking: "head_blocks" | "independent";
  /**
   * TRUE  -> after every row that ADVANCED the queue, discard the batch and
   *          re-read (cursor reset). FALSE -> iterate the one batch by cursor.
   * Not free to combine with `blocking`; see the pair rule above.
   */
  readonly rereadAfterEach: boolean;
  /**
   * `serial_per_kind`: a pass over this kind takes an in-process lock for the
   * whole pass, and a second pass over the kind returns without reading rows —
   * so overlapping ticks cannot reach past a claimed head
   * (`PASSES-OVERLAP-AND-ORDER-HOLDS`). `parallel_rows` takes no lock: the
   * kind's rows are independent and one held row must not stop another.
   * An in-process lock is a claim about ONE JavaScript context; the durable
   * claim (`claim` below) remains the guard for a crash or a second process.
   */
  readonly concurrency: "serial_per_kind" | "parallel_rows";
  /**
   * The in-flight guard's key for a row of this kind. One in-flight set is
   * keyed by more than one kind, so the key spaces must not collide — which is
   * why the void kind prefixes. A send and a void of ONE bill are never
   * simultaneously actionable (the store predicates forbid it: an in-flight
   * send is `syncing`, an owed void requires `synced`), so the prefix is a
   * declaration the field-by-field criterion asserts, not a behaviour any
   * staging can reach — the design deletes that staging and says why.
   */
  readonly inFlightKey: (rowId: string) => string;
  /**
   * Can the SERVER recognise a repeat of this kind's request? Read by no
   * branch of the drain. It is a declaration the kind makes about its own
   * route, and it is what `A-THROW-LANDS-IN-ONE-OF-TWO-PLACES` checks
   * `classify(onThrow(x))` against without re-deriving idempotence in a proof.
   */
  readonly resendIsIdempotent: boolean;
}

/**
 * WHAT THE DRAIN DOES NEXT with one unit of work, in the drain's own
 * vocabulary. Each kind classifies its own transport outcome into this; the
 * drain never sees a status. Six members, each a NEXT ACTION and never a
 * reason. Adding a member here is deliberately expensive — it is a new drain
 * behaviour, and it is a compile error in EVERY kind's `classify` until that
 * kind answers it, because a kind silently inheriting somebody else's answer
 * is the failure `correct-classification-can-still-render-as-an-error` records
 * three times over.
 */
export type OutboxDisposition =
  /** Done. The server is in the state the device asked for. The row leaves the queue. */
  | { readonly next: "settled" }
  /**
   * Not done, and a later attempt may differ. The row is STILL OWED — under
   * `head_blocks` this is the one disposition that ends the kind's pass.
   */
  | { readonly next: "retry"; readonly reason: string }
  /**
   * Not done, out of the sendable queue, and IT COMES BACK BY ITSELF — the 424
   * case: master data the office has not set up. `terminal` cannot express it
   * (the stage-1 mapping claimed it could, against its own comment); this is
   * unavailable-is-not-rejected's three-way split put in the type.
   */
  | { readonly next: "parked"; readonly reason: string; readonly code: string }
  /**
   * Not done, and no later attempt on this device can differ. The row leaves
   * the queue into a named, operator-visible state. NEVER for an unknown
   * outcome: a throw carries no information about whether the server
   * committed.
   */
  | { readonly next: "terminal"; readonly reason: string; readonly code: string }
  /**
   * The server MAY have committed, and a repeat is NOT safe. No bill kind
   * produces it today (both routes are idempotent); it exists because a route
   * with no idempotency key already names this state (`createSeller`'s
   * "ambiguous") and a union with no arm for it forces every implementation to
   * pick one of the three wrong answers: `settled` lies, `terminal` strands
   * work the server may hold, `retry` duplicates it.
   */
  | { readonly next: "needs_review"; readonly reason: string; readonly code: string }
  /**
   * Not done, and the whole KIND must stop — durably, not for one pass. The
   * measured case is a 403 on the send path: it refuses every bill equally, so
   * retrying any of them re-asks a settled question. The runner holds the halt
   * on itself, keyed by kind; exactly two events retract it (sign-in and
   * sign-out — `SyncEngine.resumeAfterSignIn` / `resetAfterSignOut`), and it
   * is deliberately not persisted: a restart costs one request, and that
   * request is the only way the device ever discovers the role was fixed.
   */
  | { readonly next: "halt_kind"; readonly reason: string; readonly code: string };

/**
 * EVERYTHING A KIND MUST SUPPLY TO BE DRAINED. One implementation per kind;
 * the registry makes the set total. One member per thing `engine.ts` does
 * today for exactly one kind — which is the design's own generative rule for
 * this interface, and the licence for `record`'s two stage-3 parameters (see
 * its doc).
 */
export interface OutboxHandler<Row, Outcome> {
  readonly kind: OutboxKind;
  readonly policy: OutboxPolicy;

  /**
   * Rows owed AND ACTIONABLE NOW, already in the order `policy` requires, and
   * already filtered to rows this device's current identity may act on.
   * Ordering lives in the QUERY: a sort cannot order a row the query did not
   * return, and an owner filter applied in the drain is a filter every future
   * kind has to remember (`OWED-CARRIES-THE-OWNER-PREDICATE`).
   */
  owed(limit: number): Promise<Row[]>;
  /**
   * How many rows the device still OWES. The only input to the visible counts,
   * and its predicate is DELIBERATELY WIDER than `owed`'s: `owed` is filtered
   * by what can be ATTEMPTED, this only by what is SETTLED. A kind whose two
   * methods share a predicate is a screen that goes quiet exactly while work
   * is happening — a claimed (in-flight) bill and a parked bill are both
   * outside `owed()` and both still owed.
   */
  owedCount(): Promise<number>;
  /**
   * Boot sweep for THIS kind: rows stranded in flight go back to owed.
   * Returns the ids it swept, so the runner can report a result keyed by kind
   * and a missing kind is visible rather than silent
   * (`EVERY-KIND-RECOVERS-AT-BOOT`). A kind with no durable in-flight state
   * correctly returns an empty array.
   */
  recover(now: Date): Promise<readonly string[]>;

  rowId(row: Row): string;
  /** Attempts already made, off the row. Reported, never inferred. */
  attempt(row: Row): number;
  /**
   * The row's own schedule, or null for a kind that carries none. The drain
   * reads it under the clock-sanity rule (an over-horizon schedule is due
   * NOW), so a stamp written by a since-corrected clock cannot hold a queue.
   */
  dueAt(row: Row): string | null;

  /**
   * THE DURABLE CLAIM — `claimForSend`'s conditional UPDATE, or a constant
   * `true` for a kind that has none. A false answer is not an outcome: nothing
   * is performed, classified or recorded, the pass reports the skip, and the
   * row is still owed (`A-LOST-CLAIM-IS-NOT-AN-OUTCOME`).
   */
  claim(row: Row): Promise<boolean>;

  perform(row: Row): Promise<Outcome>;
  /** A throw, converted to THIS kind's own outcome. A throw carries no
      information about whether the server committed, so
      `classify(onThrow(x))` must never be `terminal` — and the positive form
      is asserted per kind: `retry` where the kind's re-send is idempotent,
      `needs_review` where it is not (`A-THROW-LANDS-IN-ONE-OF-TWO-PLACES`). */
  onThrow(err: unknown): Outcome;
  /** Pure. Drivable headlessly over every member, with no server. */
  classify(o: Outcome): OutboxDisposition;
  /**
   * The next schedule, or null. Covers the send backoff, the parked slow
   * cadence, and a transfer that made progress and must not be delayed. The
   * DRAIN calls this — once per recorded unit — and hands the result to
   * `record`; the drain also refuses (loudly, with kind, row and value) any
   * result past SEND_SCHEDULE_HORIZON_MS, because the schedule's own reader
   * fails open and would silently reduce such a backoff to zero
   * (`A-SCHEDULE-STAYS-INSIDE-THE-HORIZON`).
   */
  nextAttemptAt(row: Row, d: OutboxDisposition, attempt: number, now: Date): Date | null;
  /**
   * THE ONLY WRITER FOR THIS KIND — the store transition AND the pass-result
   * counters, in one member, exactly as `engine.ts`'s `sendOne(bill, result)`
   * and `applyVoids` arms are today.
   *
   * Two parameters here are stage 3's, and each carries its licence:
   *
   *   `next`    the design's inherits section names this exact shape — the
   *             drain calls `nextAttemptAt` and its "result [is] handed to
   *             `record`". Null where the kind or the disposition carries no
   *             schedule.
   *   `result`  the pass result the screen reacts to. It CANNOT be filled by
   *             the runner: `sessionExpired` versus `retryable` is a fact
   *             about SendOutcome — both classify `retry` — and the drain
   *             never learns what an outcome means. It cannot be a separate
   *             pure member either: `backoffsCleared` is the return value of a
   *             store write this member makes. So the kind's own writer folds
   *             its outcome into the counters, which is one member per thing
   *             engine.ts does today for exactly one kind — the design's own
   *             rule for what this interface holds.
   *
   * Takes the OUTCOME as well as the disposition: with only the disposition
   * the send kind cannot maintain its poison columns (`reachable` lives on the
   * outcome and nowhere else — `THE-POISON-SIGNAL-SURVIVES-BOTH-WAYS`), and a
   * 401 could not stay distinguishable from an offline bounce across this
   * interface.
   */
  record(
    row: Row,
    o: Outcome,
    d: OutboxDisposition,
    attempt: number,
    next: Date | null,
    now: Date,
    result: SyncRunResult,
  ): Promise<void>;
}

/**
 * THE TWO POLICIES, written as data so the difference between the kinds is
 * READABLE rather than buried in two loops diffed by eye. Transcriptions of
 * measured behaviour (engine.ts at `91d49d0`), not proposals — and
 * `VOID-KEEPS-EVERY-DIFFERENCE-THE-DESIGN-NAMES` asserts BILL_VOID field by
 * field, so a member silently changed by a later edit is a red cell.
 */
export const BILL_SEND: OutboxPolicy = {
  blocking: "head_blocks",
  rereadAfterEach: true,
  concurrency: "serial_per_kind",
  inFlightKey: (rowId) => rowId,
  // hard rule 4: every bill create carries an idempotency_key, and a repeat
  // returns the existing bill rather than a second one.
  resendIsIdempotent: true,
};

export const BILL_VOID: OutboxPolicy = {
  blocking: "independent",
  rereadAfterEach: false,
  concurrency: "parallel_rows",
  inFlightKey: (rowId) => `void:${rowId}`,
  // a repeat is answered 409, which httpTransport.voidBill maps to
  // `already_voided` and the void kind's classify settles.
  resendIsIdempotent: true,
};
