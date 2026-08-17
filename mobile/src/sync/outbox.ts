/**
 * THE OUTBOX: ONE MECHANISM CARRYING SEVERAL KINDS OF WORK.
 *
 * P1.18 stage 1 — TYPES ONLY. Nothing is moved onto this yet and no behaviour
 * changes in this file's first commit. It exists so that stage 2 has something
 * to move onto, and so the compile-time guarantee the step's DONE WHEN requires
 * is in place BEFORE any drain is rewritten rather than asserted afterwards.
 *
 * WHY THIS IS NOT "EXTRACT THE COMMON LOOP", and the measurement that says so.
 * `engine.ts` holds two drains that are DELIBERATELY DIFFERENT, and each
 * difference has a device incident behind it:
 *
 *   send   strict head-of-line over listPendingOldestFirst, queue read WITHOUT
 *          the backoff filter, the whole pass stops when the head cannot go,
 *          per-attempt backoff, and it does not run at all while submission is
 *          forbidden. Two bills weighed 73 seconds apart took doc_nos in the
 *          wrong order before that ordering existed.
 *   void   no backoff, no time gate, no ordering; iterates everything owed;
 *          in-flight guard keyed `void:${id}` so a void and a send of the SAME
 *          bill do not block each other; void_requested_at is never cleared, so
 *          a void stays owed across restarts and days offline, with no attempt
 *          cap.
 *
 * A single shared policy is a REGRESSION whichever way it goes — voids gaining
 * head-of-line blocking, or bills losing backoff. So POLICY IS PER KIND and the
 * shared part is what a kind IS, how it is drained, how its outcome is
 * classified, and how it is made visible. Anything here that unifies the
 * policies has misread `engine.ts`.
 *
 * THE COMPILE-TIME GUARANTEE, and what it does and does not stop.
 * `OutboxRegistry` is `Record<OutboxKind, OutboxHandler<...>>`. Adding a member
 * to `OutboxKind` makes every registry literal fail to typecheck until a handler
 * exists for it, and no cast at a call site can dodge that — the error is at the
 * registry, which is one object in one place. That is the mechanism behind the
 * step's criterion 2, which replaced "read the diff and see there is no new
 * loop": `runOnce` is a function NAME rather than a structural property, so a
 * per-kind loop moved into a helper satisfies a diff-reading criterion while
 * defeating the design.
 *
 * WHAT IT DOES NOT STOP, stated because a guarantee believed is not a guarantee
 * measured: nothing here prevents somebody writing a second drain that ignores
 * this file entirely. The registry makes the SUPPORTED path total over the kinds
 * — it cannot make an unsupported path unwriteable. What it does is remove the
 * excuse: a new kind has exactly one place to be declared, and leaving it out is
 * a red typecheck rather than a silent omission.
 */

import type { LocalBill, SendOutcome, VoidOutcome } from "./types.js";

/**
 * EVERY KIND OF WORK THE DEVICE OWES THE SERVER.
 *
 * `seller_create` is declared here in stage 1 and has NO handler yet, which is
 * deliberate and is the first thing this file proves about itself: the registry
 * type below cannot be satisfied without one, so the typecheck is red until
 * stage 3 supplies it. A kind that could be forgotten is the defect this whole
 * step exists to remove.
 */
export type OutboxKind = "bill_send" | "bill_void" | "seller_create";

/**
 * HOW A KIND IS ORDERED. Not a preference — the two existing values are the two
 * measured behaviours, and mixing them up is the regression named at the head of
 * this file.
 */
export type OutboxOrdering =
  /**
   * Oldest first by the row's own business time, and THE HEAD BLOCKS. If the
   * head cannot go, the pass stops and nothing behind it may overtake. The cost
   * is deliberate: one unsendable row holds up the rest. That is what a queue
   * means when the numbers it produces are legal documents.
   */
  | "head_of_line"
  /**
   * No order at all. Every owed row is attempted in the same pass and one
   * failing row does not hold another. Correct for work whose rows are
   * independent of each other, which a void is and a bill send is not.
   */
  | "unordered";

/**
 * WHETHER A FAILED ATTEMPT IS DELAYED BEFORE THE NEXT ONE.
 *
 * `none` is not an oversight for the void kind. A void has no attempt cap and no
 * terminal failure state for an unknown outcome, so its retry is bounded by the
 * server settling it rather than by a schedule — and a backoff would delay the
 * one action that corrects a wrong bill.
 */
export type OutboxBackoff = "per_attempt" | "none";

/**
 * The per-kind policy, read by the drain and by nothing else.
 *
 * `inFlightKey` exists because two kinds can be owed for the SAME row: a bill
 * can be awaiting send and carrying a void request at once. Keying the in-flight
 * guard by row id alone would make one silently block the other, which is the
 * case the step's criterion 5 drives on a device precisely because it is the
 * point a unified drain is most likely to fail.
 */
export interface OutboxPolicy {
  readonly ordering: OutboxOrdering;
  readonly backoff: OutboxBackoff;
  /**
   * Whether a row's scheduled next-attempt time gates the attempt. FALSE for a
   * kind that carries no schedule; TRUE for one that does, in which case the
   * drain must also apply the clock-sanity read that stops a stamp written by a
   * since-corrected device clock from holding the queue.
   */
  readonly timeGated: boolean;
  readonly inFlightKey: (rowId: string) => string;
}

/**
 * WHAT THE DRAIN DID WITH ONE UNIT OF WORK, in the drain's own vocabulary rather
 * than the server's.
 *
 * Each kind classifies its own transport outcome into this, which is what keeps
 * the drain from knowing anything about `SendOutcome` or `VoidOutcome`. The
 * names are about WHAT HAPPENS NEXT, because that is the only question the drain
 * asks: it does not care why.
 */
export type OutboxDisposition =
  /** Done. The server is in the state the device asked for. */
  | { readonly next: "settled" }
  /** Not done, and a later attempt may differ. Backoff applies if the kind has one. */
  | { readonly next: "retry"; readonly reason: string }
  /**
   * Not done, and no later attempt on this device can differ. The row leaves the
   * queue into a named, operator-visible state. NEVER used for an unknown
   * outcome: a throw carries no information about whether the server committed,
   * and treating that as terminal would strand real work.
   */
  | { readonly next: "terminal"; readonly reason: string; readonly code: string }
  /**
   * Not done, and the whole KIND must stop for this pass — not just this row.
   * The measured case is a 403 on the send path: every further attempt is an
   * identical question to a server that has already answered it, so the drain
   * stops rather than climbing attempt counts on rows that are perfectly fine.
   */
  | { readonly next: "halt_kind"; readonly reason: string; readonly code: string };

/**
 * EVERYTHING A KIND MUST SUPPLY TO BE DRAINED. One implementation per kind, and
 * `OutboxRegistry` below makes the set of them total.
 *
 * `Row` is the kind's own row type. It is a type parameter rather than a union
 * so that a handler cannot be handed a row belonging to a different kind: the
 * registry pins each kind to its own row type, and a handler written against the
 * wrong one does not compile.
 */
export interface OutboxHandler<Row> {
  readonly kind: OutboxKind;
  readonly policy: OutboxPolicy;
  /**
   * The rows this kind currently owes, already in the order `policy.ordering`
   * requires. Ordering lives in the QUERY and not in the drain, because a sort
   * cannot order a row the query did not return — the defect that produced the
   * 73-second incident was a backoff-filtered query hiding the older bill, and no
   * amount of sorting in the loop could have fixed it.
   */
  owed(limit: number): Promise<Row[]>;
  /** The row's identity, for the in-flight guard and for reporting. */
  rowId(row: Row): string;
  /** Attempts already made. Drives backoff, and is reported, never inferred. */
  attempt(row: Row): number;
  /**
   * Do the work. May throw; a throw is classified by the drain as `retry`, never
   * as terminal, because it carries no information about whether the server
   * committed.
   */
  perform(row: Row): Promise<OutboxDisposition>;
  /** Record the disposition against the row. The only writer for this kind. */
  record(row: Row, d: OutboxDisposition, attempt: number, now: Date): Promise<void>;
}

/**
 * THE REGISTRY, AND IT IS THE WHOLE COMPILE-TIME GUARANTEE.
 *
 * `Record<OutboxKind, ...>` is total: every member of `OutboxKind` must have an
 * entry. Add a kind and every registry literal is a compile error until it is
 * handled. That is criterion 2's observable — a command with an exit code —
 * rather than a property somebody reads off a diff.
 *
 * The row types are pinned per kind rather than left as a union, so a handler
 * written against the wrong row does not compile either.
 */
export interface OutboxRegistry {
  readonly bill_send: OutboxHandler<LocalBill>;
  readonly bill_void: OutboxHandler<LocalBill>;
  readonly seller_create: OutboxHandler<LocalOutboxSeller>;
}

/**
 * A locally created seller awaiting its first send. DECLARED, NOT BUILT — stage
 * 3 owns it, and the fields here are the ones P1.8b's survey says the kind must
 * carry rather than a guess at a schema:
 *
 *   - it has an ORIGIN, because `cached_sellers` has none and a locally created
 *     seller is otherwise indistinguishable from one the server sent;
 *   - it has NO server id, because the server refuses a client-minted one
 *     (`SellerCreate` sets extra="forbid" and `sellers.id` defaults to
 *     gen_random_uuid(), where `purchase_bills.id` has no default);
 *   - it carries the code it asked for, because `sellers` has no idempotency key
 *     and a re-send is recognisable only by a code collision — which is why a
 *     409 on this kind means ALREADY EXISTS and settles the row, where the same
 *     status on the bill path would be retry-forever and would dam the queue.
 *
 * Every one of those is to be re-derived against the artefacts in stage 3. They
 * are written here so the shape is argued before it is built, not after.
 */
export interface LocalOutboxSeller {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly tenant_id: string;
  readonly device_created_at: string;
  readonly attempts: number;
  readonly last_error: string | null;
}

/**
 * THE TWO POLICIES THAT EXIST TODAY, written as data so the difference between
 * them is READABLE rather than buried in two loops that must be diffed by eye.
 *
 * These are transcriptions of measured behaviour, not proposals. Stage 2 moves
 * the drains onto them and the existing proofs are what establish that the
 * transcription is faithful — a claim this file cannot make about itself.
 */
export const BILL_SEND_POLICY: OutboxPolicy = {
  ordering: "head_of_line",
  backoff: "per_attempt",
  timeGated: true,
  inFlightKey: (rowId) => rowId,
};

export const BILL_VOID_POLICY: OutboxPolicy = {
  ordering: "unordered",
  backoff: "none",
  timeGated: false,
  inFlightKey: (rowId) => `void:${rowId}`,
};

/**
 * Classify a bill send's transport outcome. Pure, so a proof can drive every
 * member without a server.
 *
 * NOT YET WIRED — stage 2 hands this to the drain. It is written now because the
 * mapping is where the send path's meaning lives, and getting it wrong is
 * exactly the class `unavailable-is-not-rejected` records: `rejected` is
 * terminal and `unavailable` is not, and collapsing them either strands a
 * correct bill or retries a malformed one forever.
 */
export function dispositionOfSend(o: SendOutcome): OutboxDisposition {
  switch (o.kind) {
    case "accepted":
    case "duplicate":
      return { next: "settled" };
    case "rejected":
      return { next: "terminal", reason: o.reason, code: "rejected" };
    case "rejected_resolvable":
      // Parks in a named state and returns when the office adds the price. It is
      // NOT terminal: the bill becomes valid without anything being re-weighed.
      return { next: "terminal", reason: o.reason, code: o.code };
    case "session_expired":
      return { next: "retry", reason: o.reason };
    case "forbidden":
      return { next: "halt_kind", reason: o.reason, code: o.code };
    case "unavailable":
      return { next: "retry", reason: o.reason };
  }
}

/** Classify a void's transport outcome. Same contract as above. */
export function dispositionOfVoid(o: VoidOutcome): OutboxDisposition {
  switch (o.kind) {
    case "voided":
    case "already_voided":
      // "Already voided" is success: the server is in the state the owner asked
      // for, which is the entire question being answered.
      return { next: "settled" };
    case "rejected":
      return { next: "terminal", reason: o.reason, code: "void_rejected" };
    case "session_expired":
      return { next: "retry", reason: o.reason };
    case "forbidden":
      return { next: "terminal", reason: o.reason, code: o.code };
    case "unavailable":
      return { next: "retry", reason: o.reason };
  }
}
