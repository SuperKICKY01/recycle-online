/**
 * THE TWO HANDLERS AND THE REGISTRY LITERAL.
 *
 * Each handler is the transcription of one of the hand-written drains
 * `engine.ts` carried until stage 3 (last present at `47d17ab`) — the store
 * calls, the counter increments and the schedules are the ones `sendOne` and
 * `applyVoids` made, moved and not redesigned. Commit 2 deleted those loops,
 * so this file is the only copy of each mapping, which is the design's point:
 * one producer per kind, imported and not retyped.
 *
 * THE REGISTRY LITERAL IS HERE, outside src/proof on purpose: both typecheck
 * programs read this file, so adding a member to `OutboxKind` reddens BOTH
 * (`THE-REGISTRY-IS-TOTAL-AND-IS-WHAT-THE-DRAIN-ENUMERATES` — a literal only a
 * proof can see reddens one program and ships an app that constructs no
 * registry at all).
 */

import { VOID_REJECTED_CODE } from "./types.js";
import type { Clock, LocalBill, LocalStore, SendOutcome, Transport, VoidOutcome } from "./types.js";
import { BILL_SEND, BILL_VOID, SELLER_CREATE } from "./outbox.js";
import type { OutboxDisposition, OutboxHandler, OutboxRegistry } from "./outbox.js";
import type { LocalSeller, LocalSellerStore } from "./localSeller.js";
import { classifySellerCreate } from "./sellerCreate.js";
import type { SellerCreateOutcome, SellerCreateTransport } from "./sellerCreate.js";

/**
 * What every handler closes over. The knob values are REQUIRED — the defaults
 * live on `SyncEngine`'s constructor (which also enforces the horizon bound on
 * them), and a second copy of a default here would be a number free to drift.
 *
 * THE TWO SELLER FIELDS ARE REQUIRED, AND THAT IS THE WHOLE MECHANISM. An
 * optional field with a default would leave every existing construction site
 * compiling clean while the seller kind quietly drained against a store that is
 * not the device's — which is the defect this project's design names in its own
 * words about a defaulted parameter. Required, they turned all 67
 * `new SyncEngine` sites into compile errors, and the compiler is what found
 * every one of them rather than anybody remembering.
 */
export interface OutboxDeps {
  readonly store: LocalStore;
  readonly transport: Transport;
  readonly clock: Clock;
  /** First retry delay; doubles per attempt up to backoffMaxMs. */
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
  /** The parked-bill slow cadence. Deliberately not a backoff. */
  readonly masterDataRetryMs: number;
  /**
   * The seller kind's own store — a SEPARATE contract from `LocalStore`,
   * because `local_sellers` and `local_seller_codes` are not `local_bills`.
   * See `sync/localSeller.ts` for the argument and for what it costs.
   */
  readonly sellerStore: LocalSellerStore;
  readonly sellerTransport: SellerCreateTransport;
}

/** Same rendering `engine.ts` uses for a thrown transport error today. */
function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

/* ------------------------------------------------------------ bill_send -- */

/**
 * Pure — drivable headlessly over every member, with no server.
 *
 * The stage-1 mapping's `rejected_resolvable` arm returned `terminal` under a
 * comment saying "It is NOT terminal"; the design repairs that here: it is
 * `parked`, the three-way split of unavailable-is-not-rejected. A 401 and an
 * offline bounce both classify `retry` — they stay distinguishable because
 * `record` receives the OUTCOME, not because the disposition says.
 */
function classifySend(o: SendOutcome): OutboxDisposition {
  switch (o.kind) {
    case "accepted":
    case "duplicate":
      // "Already exists" is success: our key won a previous race or a lost
      // response actually landed — the bill IS on the server.
      return { next: "settled" };
    case "rejected":
      return { next: "terminal", reason: o.reason, code: "rejected" };
    case "rejected_resolvable":
      // Parks in a named state and returns when the office adds the price.
      return { next: "parked", reason: o.reason, code: o.code };
    case "session_expired":
      return { next: "retry", reason: o.reason };
    case "forbidden":
      // A 403 refuses every bill equally: the KIND stops, durably.
      return { next: "halt_kind", reason: o.reason, code: o.code };
    case "unavailable":
      return { next: "retry", reason: o.reason };
  }
}

export function billSendHandler(deps: OutboxDeps): OutboxHandler<LocalBill, SendOutcome> {
  const backoffFor = (attempt: number): number => {
    const raw = deps.backoffBaseMs * 2 ** Math.max(0, attempt - 1);
    return Math.min(raw, deps.backoffMaxMs);
  };
  /**
   * The schedules `record` must not be handed a null for. `nextAttemptAt`
   * returns non-null exactly for `retry` and `parked`, so a null here is a
   * drain that skipped the call — refuse it rather than invent a schedule.
   */
  const requireNext = (next: Date | null, id: string): Date => {
    if (next === null) {
      throw new Error(`bill_send ${id}: record needs a schedule and was handed null`);
    }
    return next;
  };
  return {
    kind: "bill_send",
    policy: BILL_SEND,
    // Strict head-of-line: ALL pending bills in weighing order, backoff
    // ignored — the sender has to SEE the bill it is not allowed to skip
    // (the 73-second incident). Owner filter and order live in the QUERY.
    owed: (limit) => deps.store.listPendingOldestFirst(limit),
    // Wider than owed() by two whole classes of row: a claimed (syncing) bill
    // and a parked bill are both still owed. mine + mineBlocked is the pair
    // the sign-out gate already counts (ownUnsentCount in App.tsx).
    owedCount: async () => {
      const b = await deps.store.unsentBreakdown();
      return b.mine + b.mineBlocked;
    },
    // The one durable in-flight state there is: rows stranded `syncing` by a
    // crash. Re-sending carries the same idempotency key, so recovery is a
    // plain state reset rather than a distributed query.
    recover: (now) => deps.store.resetSyncingToPending(now),
    rowId: (b) => b.id,
    attempt: (b) => b.attempt_count,
    dueAt: (b) => b.next_attempt_at,
    claim: (b) => deps.store.claimForSend(b.id, deps.clock.now()),
    perform: (b) => deps.transport.sendBill(b),
    // A throw means we got no answer at all: offline-shaped, never poison.
    onThrow: (err) => ({ kind: "unavailable", reason: describeError(err), reachable: false }),
    classify: classifySend,
    nextAttemptAt: (_row, d, attempt, now) => {
      switch (d.next) {
        case "retry":
          // The ordinary backoff — for a 401 too: it is cleared wholesale by
          // resumeAfterSignIn the moment the operator signs in.
          return new Date(now.getTime() + backoffFor(attempt));
        case "parked":
          // The slow cadence: retrying sooner cannot make the office add a
          // price faster, and the operator has an explicit retry.
          return new Date(now.getTime() + deps.masterDataRetryMs);
        default:
          // settled/terminal leave the queue; halt_kind writes next=now inside
          // markSendForbidden itself (nothing this device does changes a role,
          // so a delay would be a number pretending the row waits for time).
          return null;
      }
    },
    record: async (row, o, _d, attempt, next, now, result) => {
      // "Bills this pass actually claimed and sent" — every call here is one.
      // Send-only on purpose: App.tsx's `attempted === 0` early-return decides
      // whether a pass may draw conclusions about the connection, and a
      // void-only pass must not count.
      result.attempted += 1;
      switch (o.kind) {
        case "accepted":
        case "duplicate": {
          await deps.store.markSynced(row.id, o.doc_no, attempt, now);
          result.synced += 1;
          // This send PROVED the server reachable, so every other pending
          // bill's backoff was computed against a stale world. The count feeds
          // the result — the reason this member holds the counters at all.
          result.backoffsCleared += await deps.store.clearBackoffForPending(now);
          return;
        }
        case "rejected":
          await deps.store.markFailed(row.id, o.reason, attempt, now);
          result.rejected += 1;
          return;
        case "rejected_resolvable":
          await deps.store.markMasterDataMissing(
            row.id,
            o.code,
            o.reason,
            attempt,
            requireNext(next, row.id),
            now,
          );
          result.masterDataBlocked += 1;
          return;
        case "session_expired":
          // A named transition, not markPendingAgain(reachable=true): the
          // poison counters are cleared, or an expired session with bills
          // behind it raises the "call support" alarm again.
          await deps.store.markSessionExpired(
            row.id,
            o.reason,
            attempt,
            requireNext(next, row.id),
            now,
          );
          result.sessionExpired += 1;
          return;
        case "forbidden":
          await deps.store.markSendForbidden(row.id, o.reason, attempt, now);
          result.forbidden += 1;
          return;
        case "unavailable":
          // `o.reachable` drives the poison columns — the reason record takes
          // the OUTCOME: the disposition dropped it, by design.
          await deps.store.markPendingAgain(
            row.id,
            o.reason,
            attempt,
            requireNext(next, row.id),
            now,
            o.reachable,
          );
          result.retryable += 1;
          return;
      }
    },
  };
}

/* ------------------------------------------------------------ bill_void -- */

/**
 * Pure. `forbidden` and `rejected` both map to `terminal` — both leave the
 * owed queue via markVoidRefused — and `record` tells them apart by the
 * OUTCOME, because the two refusal codes drive opposite retractions:
 * clearVoidRefusals retracts a 403 on sign-in (who is asking can change) and
 * must never retract VOID_REJECTED_CODE (what was asked cannot).
 */
function classifyVoid(o: VoidOutcome): OutboxDisposition {
  switch (o.kind) {
    case "voided":
    case "already_voided":
      // "Already voided" is success: the server is in the state the owner
      // asked for, which is the entire question being answered.
      return { next: "settled" };
    case "rejected":
      return { next: "terminal", reason: o.reason, code: VOID_REJECTED_CODE };
    case "session_expired":
      return { next: "retry", reason: o.reason };
    case "forbidden":
      return { next: "terminal", reason: o.reason, code: o.code };
    case "unavailable":
      return { next: "retry", reason: o.reason };
  }
}

export function billVoidHandler(deps: OutboxDeps): OutboxHandler<LocalBill, VoidOutcome> {
  return {
    kind: "bill_void",
    policy: BILL_VOID,
    // Requester-filtered and ordered in the QUERY (ORDER BY void_requested_at,
    // id) — the drain imposes no order, which is a different fact.
    owed: (limit) => deps.store.listVoidsToApply(limit),
    // Wider than owed(): a void on a bill that has not synced yet is owed even
    // though it is not yet actionable (listVoidsToApply requires 'synced').
    owedCount: () => deps.store.countVoidsOwed(),
    // No durable in-flight state: the void's guard is the runner's in-memory
    // key set, and a void stays owed across a kill with or without any sweep
    // (void_requested_at is never cleared). Correct as a no-op — the runner's
    // per-kind map is what makes the no-op visible rather than silent.
    recover: () => Promise.resolve([]),
    rowId: (b) => b.id,
    attempt: (b) => b.void_attempts,
    // No time gate, no backoff, no attempt cap: bounded only by the server
    // settling it.
    dueAt: () => null,
    // A constant true — this kind has no durable claim.
    claim: () => Promise.resolve(true),
    // A void request with no reason cannot exist: the store only ever writes
    // the two together. Defensive, and it keeps the type honest.
    perform: (b) => deps.transport.voidBill(b, b.void_reason ?? ""),
    onThrow: (err) => ({ kind: "unavailable", reason: describeError(err) }),
    classify: classifyVoid,
    nextAttemptAt: () => null,
    record: async (row, o, _d, attempt, _next, now, result) => {
      switch (o.kind) {
        case "voided":
        case "already_voided":
          await deps.store.markVoidApplied(row.id, attempt, now);
          result.voidsApplied += 1;
          return;
        case "rejected":
          // The server refused the VOID ITSELF (404/400/422): permanently, and
          // under the client-minted code clearVoidRefusals never retracts —
          // the whole argument (both consumers of the code, and why reusing
          // the 403's marker would break each of them) sits on
          // VOID_REJECTED_CODE in sync/types.ts.
          await deps.store.markVoidRefused(row.id, VOID_REJECTED_CODE, o.reason, attempt, now);
          result.voidsRejected += 1;
          return;
        case "session_expired":
          // Still owed — void_requested_at is never cleared — and NOT counted
          // as a rejection or an outage: the UI asks for a sign-in instead of
          // blaming the network.
          await deps.store.markVoidAttemptFailed(row.id, o.reason, attempt);
          result.sessionExpired += 1;
          return;
        case "forbidden":
          // Refused because of WHO asked: leaves the owed queue under the
          // server's own code, retractable by the next sign-in.
          await deps.store.markVoidRefused(row.id, o.code, o.reason, attempt, now);
          result.voidsForbidden += 1;
          return;
        case "unavailable":
          await deps.store.markVoidAttemptFailed(row.id, o.reason, attempt);
          result.voidsRetryable += 1;
          return;
      }
    },
  };
}

/* -------------------------------------------------------- seller_create -- */

/**
 * THE SELLER KIND. Its policy lives on `SELLER_CREATE` in ./outbox.js, where
 * the two axes that differ from a bill are argued at the constant; its
 * `classify` lives in ./sellerCreate.js, where the outcome union it switches
 * over is declared. What is here is the wiring, and the two members that do
 * something neither bill kind does.
 */
export function sellerCreateHandler(
  deps: OutboxDeps,
): OutboxHandler<LocalSeller, SellerCreateOutcome> {
  const backoffFor = (attempt: number): number => {
    const raw = deps.backoffBaseMs * 2 ** Math.max(0, attempt - 1);
    return Math.min(raw, deps.backoffMaxMs);
  };
  return {
    kind: "seller_create",
    policy: SELLER_CREATE,
    /**
     * OWED AND ACTIONABLE, and THIS KIND ASKS A THIRD OWNER QUESTION.
     * `bill_send` filters on who WEIGHED the bill, `bill_void` on who ORDERED
     * THE REVERSAL, and this on who CREATED THE SELLER. Three questions, three
     * filters, each written by hand at its own site — and the filter and the
     * order both live in the QUERY, because a sort cannot order a row the
     * query did not return.
     */
    owed: (limit) => deps.sellerStore.listSellersToCreate(deps.clock.now(), limit),
    /**
     * WIDER than `owed`, as the rule requires: a claimed (syncing) row and a
     * row held for review are both still owed. A kind whose two methods share
     * a predicate is a screen that goes quiet exactly while work is happening.
     */
    owedCount: () => deps.sellerStore.countSellersOwed(),
    /**
     * A REAL SWEEP, UNLIKE THE VOID KIND'S — and this kind is the first in the
     * tree that can tell the two apart.
     *
     * The void's `recover` correctly returns an empty array: its in-flight
     * guard is the runner's IN-MEMORY key set, and a void stays owed across a
     * kill with or without any sweep because `void_requested_at` is never
     * cleared. NEITHER IS TRUE HERE. `claim` is a conditional UPDATE that
     * writes `syncing` to disk, and `listSellersToCreate` returns only
     * `pending` rows — which is exactly what makes the claim work and exactly
     * what strands the row. Nothing would ever look at it again.
     *
     * An empty array here would satisfy the inherited boot criterion
     * completely, because that criterion asks whether the boot VISITED the kind
     * and not what the visit did.
     */
    recover: (now) => deps.sellerStore.resetSyncingSellersToPending(now),
    rowId: (s) => s.id,
    attempt: (s) => s.attempt_count,
    /** A real schedule, unlike the void kind's null: an offline device must not
        hammer a route it cannot reach. */
    dueAt: (s) => s.next_attempt_at,
    claim: (s) => deps.sellerStore.claimSellerCreate(s.id, deps.clock.now()),
    perform: (s) => deps.sellerTransport.createSeller(s),
    /**
     * THE KIND'S OWN `unavailable`, CARRYING NO `reachable`.
     *
     * That omission is deliberate and is not a shortcut. `reachable` drives the
     * POISON ALARM — the "call support" state raised when a REACHABLE server
     * keeps refusing a BILL. A seller create bouncing must not feed it: the
     * alarm is about a dammed money queue, and this kind is `independent` and
     * dams nothing.
     *
     * `classify(onThrow(x))` is `retry`, which is ONLY legal because the resend
     * is idempotent — and it is idempotent only because the request carries the
     * reservation token. The two facts are one fact.
     */
    onThrow: (err) => ({ kind: "unavailable", reason: describeError(err) }),
    classify: classifySellerCreate,
    nextAttemptAt: (_row, d, attempt, now) => {
      switch (d.next) {
        case "retry":
          return new Date(now.getTime() + backoffFor(attempt));
        default:
          // settled and terminal leave the queue; needs_review leaves the
          // ACTIONABLE set by its own column and is never re-asked, so a
          // schedule on it would be a number pretending the row waits for
          // time. halt_kind is held by the runner, not by a delay.
          return null;
      }
    },
    /**
     * THE KIND'S ONLY WRITER.
     *
     * IT TOUCHES NO COUNTER ON `SyncRunResult`, AND THAT IS DELIBERATE RATHER
     * THAN AN OMISSION. `result.attempted` is documented on the send kind as
     * "bills this pass actually claimed and sent", send-only on purpose,
     * because `App.tsx`'s `attempted === 0` early-return decides whether a pass
     * may draw conclusions about the CONNECTION — and a void-only pass must not
     * count. A seller-only pass must not count for the same reason. The
     * per-kind report the runner already returns (`performed`, keyed by kind)
     * is where this kind's work is visible, and the counters a SCREEN reads
     * belong with the screen that reads them, which is the surfaces phase.
     *
     * WHAT IT DOES THAT NEITHER BILL KIND DOES: on settling it writes the
     * SERVER's seller id onto the local row, AND RELEASES EVERY BILL PARKED
     * BEHIND THAT SELLER.
     *
     * THE RELEASE ARRIVED IN P1.8b GATES; the paragraph that stood here said it
     * was not built and that "a release written here now would be a statement
     * over a park no bill can be in". Both halves were true and both have
     * stopped being: `local_bills` has the park, `QUEUED` honours it, and
     * `createBill` writes it from a `BillSeller` union.
     *
     * IT IS THE SECOND STATEMENT IN THIS ARM AND THAT IS DELIBERATE, not an
     * oversight of the one-statement habit. The two writes are to DIFFERENT
     * TABLES — `local_sellers` and `local_bills` — so no single statement could
     * do both, and the design puts the release in this writer precisely so
     * there is one producer of "the seller settled" rather than a second
     * mechanism watching for it.
     *
     * WHAT A CRASH BETWEEN THEM COSTS, said rather than left to be found: the
     * seller is settled and its bills are still parked. They are NOT lost — the
     * park is visible, the bills are counted, the card says what they are
     * waiting for — but nothing releases them, because a seller settles once.
     * That window is real and is NOT closed here; it is reported with the other
     * findings this phase produced rather than repaired by a mechanism the
     * design does not have.
     *
     * `already_created` RELEASES TOO, and it must: it is the replay the
     * reservation token bought, the server holds the row, and a bill parked
     * behind a seller that is already on the server is stranded exactly as hard
     * as one behind a seller that never settled.
     */
    record: async (row, o, _d, attempt, next, now, _result) => {
      switch (o.kind) {
        case "created":
        case "already_created":
          // Both are success and both write the SERVER's id. `already_created`
          // is the replay the reservation token bought: the server created
          // nothing this time and handed back the row the first attempt made.
          await deps.sellerStore.markSellerCreated(row.id, o.server_seller_id, attempt, now);
          // ...and every bill that was waiting on this seller rejoins the queue
          // carrying the id the server just gave us. NOT owner-filtered: a
          // seller settles once, so a bill filtered out here has no second
          // event to release it (see the store contract for the whole
          // argument).
          await deps.store.releaseBillsParkedOnLocalSeller(
            row.id,
            o.server_seller_id,
            now,
          );
          return;
        case "invalid":
          // TERMINAL, and the store's own writer returns the reserved code to
          // the device's spendable holding — the reservation was never spent,
          // because the server moves one to `spent` only inside the seller
          // INSERT. A LOST refusal is NOT this arm: it is `unavailable`, and
          // nothing is returned.
          await deps.sellerStore.markSellerCreateRefused(row.id, o.reason, attempt, now);
          return;
        case "conflict":
          // STILL OWED, out of the actionable set, operator-visible, and the
          // code stays BOUND — the server may hold a row under it.
          await deps.sellerStore.markSellerCreateNeedsReview(
            row.id,
            o.code,
            o.reason,
            attempt,
            now,
          );
          return;
        case "session_expired":
        case "unavailable":
        case "ambiguous":
          // All three are unknown-or-retryable and all three keep the row owed
          // with the SAME code and the SAME token. They stay separate members
          // so a later reader can tell an outage from an expired session from
          // an unreadable 2xx.
          await deps.sellerStore.markSellerCreateAttemptFailed(
            row.id,
            o.reason,
            attempt,
            next ?? now,
          );
          return;
        case "forbidden":
          // The KIND halts, durably, in the runner. The ROW keeps its schedule
          // and stays owed: nothing about this row is wrong, and the refusal is
          // retracted by a sign-in or a sign-out.
          await deps.sellerStore.markSellerCreateAttemptFailed(row.id, o.reason, attempt, now);
          return;
      }
    },
  };
}

/* -------------------------------------------------------- the registry -- */

/**
 * THE registry literal. Typed with the mapped type, so a member added to
 * `OutboxKind` is a compile error HERE until the kind has a handler.
 *
 * MEMBER ORDER IS LOAD-BEARING and this order is transcribed, not chosen:
 * the runner drains kinds in enumeration order, and `bill_send` must settle
 * before `bill_void`'s owed rows are read — a bill created offline and voided
 * offline becomes void-owed the instant its send settles (listVoidsToApply
 * requires sync_state='synced'), so the void applies in the SAME pass.
 * Reversed, the void stays owed for a whole poll interval, and a crash in
 * that window looks exactly like a bill the owner cancelled while the server
 * still shows it as active (`SENDS-SETTLE-BEFORE-VOIDS-ARE-READ`; the
 * crash-window argument is engine.ts's own comment above its applyVoids call).
 *
 * `seller_create` IS FIRST, AND FOR THE SAME SHAPE OF REASON ONE STEP EARLIER
 * IN THE CHAIN. A seller created and a bill weighed in ONE offline stretch both
 * become actionable in one pass only if the seller goes first: the bill is
 * waiting on that seller, and the seller's settle is what releases it.
 * Reversed, every such bill waits a whole poll interval behind a seller that
 * had already settled in the same pass (`THIS-KIND-DRAINS-BEFORE-BILLS-IN-ONE-PASS`).
 *
 * THE ORDER IS PINNED, NOT THE ADJACENCY. A runner draining a fourth kind
 * between these still satisfies the rule, and should.
 *
 * AND THIS IS A REORDERING WITH NO DIFF ANYWHERE ELSE, which is exactly what
 * makes it worth a paragraph: swap two lines here and every assertion about the
 * final queue stays green over two passes. Only a ONE-pass staging separates
 * the two orders.
 */
export function buildOutboxRegistry(deps: OutboxDeps): OutboxRegistry {
  return {
    seller_create: sellerCreateHandler(deps),
    bill_send: billSendHandler(deps),
    bill_void: billVoidHandler(deps),
  };
}
