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
import type { LocalSeller } from "./localSeller.js";
import type { LocalSale } from "./localSale.js";
import type { SellerCreateOutcome } from "./sellerCreate.js";
import type { SyncRunResult } from "./engine.js";

/**
 * EVERY KIND OF WORK THE DEVICE OWES THE SERVER.
 *
 * FOUR members as of M2 (2026-10-25): `sale_send` joined -- a sale written at the yard, offline-first, drained
 * after the purchase kinds (the argument is on the registry literal). THREE members as of P1.8b.
 *
 * SUPERSEDED 2026-08-25, and the superseded text is kept because it records why
 * the member was absent rather than forgotten. It read: "TWO members,
 * deliberately. `seller_create` was declared in stage 1 and is REMOVED by the
 * stage-2 design: what identifies a locally created seller across offline
 * devices is an OPEN DECISION of the owner's, and a union member nobody may
 * build makes the registry literal a permanent red or a permanent excuse to
 * leave it unbuilt. The kind returns in the step that answers the decision."
 *
 * THE DECISION WAS ANSWERED AND THE KIND HAS RETURNED, under its own name —
 * `ROADMAP.md § P1.8` "The member is named `seller_create`", the name the union
 * carried before the removal, so it comes back as itself rather than acquiring
 * a second spelling. What identifies a locally created seller is a SERVER-MINTED
 * RESERVATION: a code held by one device for ever, and an opaque token that
 * makes a repeat of the create recognisable BY THE SERVER as the same create.
 *
 * WHAT THE OLD PARAGRAPH CLAIMED THAT IS NOW MEASURED RATHER THAN PREDICTED:
 * "the generalisation is demonstrated by the COMPILE ERROR adding a member
 * produces, not by a third runtime kind." Adding this member produced compile
 * errors in `OutboxRow`, `OutboxResult`, the registry literal, and every one of
 * the 67 `new SyncEngine` sites that had to supply the kind's store. There is
 * now a third runtime kind as well, and the compile error is what found every
 * site rather than anybody remembering them.
 */
export type OutboxKind = "bill_send" | "bill_void" | "seller_create" | "sale_send";

/**
 * Each kind's own row type. The two bill kinds carry LocalBill; `seller_create`
 * is the FIRST kind whose row is not a bill and not in `local_bills` — which is
 * what the map existed for, and is also the reason the surfaces criterion
 * `EVERY-SURFACE-SEES-A-KIND-THAT-IS-NOT-A-BILL` becomes reachable the day this
 * lands. That criterion is NOT met here; it belongs to the phase that draws the
 * surfaces, and the gap is real in the meantime.
 */
export interface OutboxRow {
  bill_send: LocalBill;
  bill_void: LocalBill;
  seller_create: LocalSeller;
  sale_send: LocalSale;
}

/**
 * Each kind's own transport-outcome union. Kept per kind so the drain never
 * learns what a status means: "409 settles here and retries there" is two
 * lines in two different `classify` functions, never a drain branch.
 *
 * `seller_create` IS THE CASE THAT MAKES THAT RULE PAY. A 409 settles nowhere
 * on this kind — it is `needs_review`, an invariant violation — while the void
 * kind's 409 is `already_voided` and SETTLES. One status, two opposite
 * dispositions, two `classify` functions, no drain branch.
 */
export interface OutboxResult {
  bill_send: SendOutcome;
  bill_void: VoidOutcome;
  seller_create: SellerCreateOutcome;
  /** The bill kind's own union, reused: every answer POST /sales gives, POST /bills gives (localSale.ts). */
  sale_send: SendOutcome;
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
 * THE POLICIES (two when this was written; FOUR since M2 -- SELLER_CREATE and SALE_SEND below), written as data so the difference between the kinds is
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

/**
 * THE SELLER-CREATE POLICY. Five axes, each RE-DERIVED from the design's own
 * table, and the THREE that are worth a sentence are the two that DIFFER from
 * `bill_send` and the one that agrees for a different reason.
 *
 * ---------------------------------------------------------------------------
 * DIFFERENT #1 — `blocking: "independent"`, where `bill_send` is `head_blocks`
 * ---------------------------------------------------------------------------
 * `head_blocks` exists on the send kind because A BILL'S ARRIVAL ORDER DECIDES
 * ITS `doc_no`, AND A `doc_no` IS A LEGAL DOCUMENT — two bills weighed 73
 * seconds apart took their numbers in the wrong order before that ordering
 * existed.
 *
 * A SELLER HAS NO `doc_no` AND NO ARRIVAL-ORDERED NUMBER OF ANY KIND. Its code
 * came from a reservation minted long before the create is sent, so the order
 * in which two creates reach the server changes nothing about either. The whole
 * argument for head-of-line is absent, and keeping it would mean ONE REFUSED
 * SELLER HOLDS ANOTHER — a walk-in at the gate waiting on a stranger's row.
 *
 * ---------------------------------------------------------------------------
 * DIFFERENT #2 — `inFlightKey` is PREFIXED, where `bill_send` uses the bare id
 * ---------------------------------------------------------------------------
 * One in-flight set is keyed by more than one kind, so the key spaces must not
 * collide. A LOCAL SELLER ID AND A LOCAL BILL ID COME FROM THE SAME GENERATOR —
 * `app/ids.ts`, one `newId()` for both — and they live in two different tables,
 * so nothing stops the same string naming a row of each.
 *
 * AND UNLIKE THE VOID KIND'S PREFIX, THIS ONE HAS A BEHAVIOURAL CELL. A send
 * and a void of ONE bill are never simultaneously actionable, so the void's
 * prefix can only ever be asserted as a declaration. Here the state IS
 * representable: give a local seller and an unparked bill the SAME id, leave
 * both owed, and hold one in flight — under a bare key the other is skipped,
 * under the prefix it is performed.
 *
 * ---------------------------------------------------------------------------
 * SAME VALUE, DIFFERENT REASON — `resendIsIdempotent: true`
 * ---------------------------------------------------------------------------
 * THE SINGLE MOST LOAD-BEARING CONSEQUENCE OF THE OWNER'S DECISION, and it is
 * not the same fact as the bill's. A bill is idempotent because HARD RULE 4
 * PUTS A KEY ON IT — a column, in the schema, that the server dedups by.
 * `sellers` HAS NO SUCH COLUMN: read forward through the whole migration stack,
 * there is no idempotency key on that table and there never was.
 *
 * WHAT MAKES IT TRUE HERE IS THE RESERVATION TOKEN, and only that. The create
 * carries it, the server recognises the repeat as the same create, and answers
 * 200 with the row the first attempt produced. WITHOUT THE TOKEN ON THE WIRE
 * THIS FIELD WOULD BE FALSE and the kind would have to classify a throw as
 * `needs_review` instead of `retry`.
 *
 * That is why `THE-TOKEN-IS-ON-THE-WIRE` exists as a criterion: this field is a
 * DECLARATION the drain reads no branch of, so an author who sets it right and
 * writes a `perform` that omits the token compiles, classifies identically,
 * drains identically, and is green everywhere — while every replay after a lost
 * response creates a second seller for one person.
 *
 * ---------------------------------------------------------------------------
 * The remaining two agree with the void kind and need no argument beyond it:
 * `rereadAfterEach: false` is FORCED — `independent` with a re-read is the
 * legal-but-slow pair that drains one row per pass, because a row that stays
 * owed heads every re-read. `concurrency: "parallel_rows"` because the rows are
 * unrelated and a held row must not stop another.
 */
export const SELLER_CREATE: OutboxPolicy = {
  blocking: "independent",
  rereadAfterEach: false,
  concurrency: "parallel_rows",
  inFlightKey: (rowId) => `seller:${rowId}`,
  resendIsIdempotent: true,
};

/**
 * THE SALE-SEND POLICY. The bill send's, member for member, and for the bill send's own reason: a sale's doc_no
 * (S-<prefix>-<BE year>-<seq>) is assigned in ARRIVAL order and is a legal document, so two sales written 73
 * seconds apart must reach the server in the order they were written -- `head_blocks`, which forces the re-read
 * (the pair rule above), serial per kind. Its HEAD IS ITS OWN: a sale held at the front of its queue never holds a
 * purchase bill, and a purchase never holds a sale. The in-flight key is prefixed because a sale id and a bill id
 * come from the same generator (`app/ids.ts`). Idempotent by hard rule 4: the create carries its key and a repeat
 * answers 200 with the sale the first attempt made.
 */
export const SALE_SEND: OutboxPolicy = {
  blocking: "head_blocks",
  rereadAfterEach: true,
  concurrency: "serial_per_kind",
  inFlightKey: (rowId) => `sale:${rowId}`,
  resendIsIdempotent: true,
};

/* ------------------------------------------------- what the device owes -- */

/**
 * HOW MANY UNITS OF WORK THE DEVICE STILL OWES, PER KIND.
 *
 * A MAPPED TYPE over `OutboxKind` and never a hand-written triple, for the same
 * reason `OutboxRegistry` is one: a member added to the union is a compile
 * error at every literal of this type, so a kind cannot join the outbox and be
 * silently left out of the number a sign-out turns on.
 *
 * IT IS A COUNT OF WORK AND NOT A COUNT OF ROWS, and the difference is not
 * pedantry. A bill saved offline and cancelled before it synced is owed TWICE —
 * once by `bill_send` and once by `bill_void` — and both are real: the server
 * has to receive the bill and then be told it is void. Nothing may therefore
 * present the SUM of these numbers to an operator as a quantity of bills; the
 * sum answers "is anything owed" and nothing else, and every surface that
 * SPEAKS about the work says one sentence per kind.
 */
export type OwedByKind = { readonly [K in OutboxKind]: number };

/**
 * Nothing owed. A TOTAL literal, so a fifth kind is a compile error here.
 *
 * Exported for the surfaces and for proof fixtures that need a device with a
 * quiet outbox: written out by hand at each site, it is exactly the omission
 * this file's mapped types exist to prevent.
 */
export const NOTHING_OWED: OwedByKind = {
  bill_send: 0,
  bill_void: 0,
  seller_create: 0,
  sale_send: 0,
};

/**
 * IS ANYTHING OWED, AND HOW MUCH — by ENUMERATING the map at RUN TIME.
 *
 * `Object.values(...).reduce(...)` and emphatically NOT
 * `o.bill_send + o.bill_void + o.seller_create`. A hand-written sum over an
 * enumerable set compiles perfectly, keeps running, and silently stops counting
 * the next member — this repository measured exactly that in the commit before
 * this one, at five sites of which ZERO were compiler-visible, and the whole of
 * `lessons/a-quantified-sentence-names-no-member.md`'s second amendment is
 * about it. The typechecker cannot help: reading two keys of a total map is
 * perfectly well typed, and widening the map invalidates nothing already
 * written.
 *
 * The counterpart guarantee — that the map ITSELF has an entry for every kind —
 * is `OutboxRunner.owedCountByKind`, which builds it by walking the registry,
 * and is asserted as a SET EQUALITY against the registry's members rather than
 * as a containment (containment answers what is present; only equality answers
 * what is missing).
 */
export function totalOwed(o: OwedByKind): number {
  return Object.values(o).reduce<number>((n, v) => n + v, 0);
}
