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
import { BILL_SEND, BILL_VOID } from "./outbox.js";
import type { OutboxDisposition, OutboxHandler, OutboxRegistry } from "./outbox.js";

/**
 * What every handler closes over. The knob values are REQUIRED — the defaults
 * live on `SyncEngine`'s constructor (which also enforces the horizon bound on
 * them), and a second copy of a default here would be a number free to drift.
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
 */
export function buildOutboxRegistry(deps: OutboxDeps): OutboxRegistry {
  return {
    bill_send: billSendHandler(deps),
    bill_void: billVoidHandler(deps),
  };
}
