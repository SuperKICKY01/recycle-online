/**
 * Test doubles for the headless proof. These are NOT production code — the
 * production adapters are expo-sqlite (Phase 2b) and HttpTransport.
 */
import { scheduledInstantIsDue } from "../time/clockSanity.js";
import { NOTHING_OWED } from "../sync/outbox.js";
import type { OwedByKind } from "../sync/outbox.js";
import { VOID_REJECTED_CODE } from "../sync/types.js";
import type {
  BillPayload,
  Clock,
  IdSource,
  LocalBill,
  LocalStore,
  QueueSnapshot,
  RowOwner,
  SendOutcome,
  SyncState,
  Transport,
  UnsentBreakdown,
  VoidOutcome,
} from "../sync/types.js";
import type {
  CreateLocalSellerResult,
  LocalSeller,
  LocalSellerStore,
  ReservedCode,
} from "../sync/localSeller.js";
import type { SellerCreateOutcome, SellerCreateTransport } from "../sync/sellerCreate.js";
import type { RefillOutcome, ReservationTransport } from "../sync/sellerRefill.js";
import type { DeviceId, DeviceIdentityStore } from "../session/deviceIdentity.js";

const clone = <T>(value: T): T => structuredClone(value);

/**
 * The identity every proof that is NOT about ownership runs as.
 *
 * Those proofs are about sending, backoff, voids, clocks and cold starts, and
 * a real device running them is a device somebody has signed in on. Giving them
 * one owner and matching the store's identity to it keeps them testing what
 * they are named for; leaving their bills unowned would park every one of them
 * and turn the whole suite red for a reason that has nothing to do with the
 * case under test.
 */
export const PROOF_OWNER: RowOwner = {
  tenant_id: "00000000-0000-4000-8000-00000000aaaa",
  user_id: "00000000-0000-4000-8000-00000000bbbb",
};

const sameOwner = (a: RowOwner | null, b: RowOwner | null): boolean =>
  a !== null && b !== null && a.tenant_id === b.tenant_id && a.user_id === b.user_id;

/** Everything an InMemoryStore restart must carry across the "process death". */
export interface MemorySnapshot {
  rows: Map<string, LocalBill>;
  owners: Map<string, RowOwner | null>;
  voidRequesters: Map<string, RowOwner | null>;
  identity: RowOwner | null;
}

/* -------------------------------------------------------------- clock ---- */

export class FakeClock implements Clock {
  private t: number;

  constructor(startIso = "2026-07-21T00:00:00.000Z") {
    this.t = new Date(startIso).getTime();
  }

  now(): Date {
    return new Date(this.t);
  }

  /** Instant: advances virtual time instead of waiting. */
  sleep(ms: number): Promise<void> {
    this.t += ms;
    return Promise.resolve();
  }

  advance(ms: number): void {
    this.t += ms;
  }
}

/* ------------------------------------------------------------ id source -- */

/** Deterministic ids so proof output is reproducible. */
export class SeqIds implements IdSource {
  private n = 0;

  constructor(private readonly prefix: string) {}

  newId(): string {
    this.n += 1;
    return `${this.prefix}-${String(this.n).padStart(8, "0")}`;
  }
}

/* ---------------------------------------------------------- local store -- */

/**
 * In-memory LocalStore. `snapshot()` + the rows constructor argument model a
 * device restart: the process dies, the stored rows survive.
 */
export class InMemoryStore implements LocalStore {
  private readonly rows = new Map<string, LocalBill>();
  /**
   * Row ownership, held BESIDE the bill rather than on it. LocalBill carries no
   * owner — the columns are written by the INSERT and are not in the SELECT
   * list any read uses — so mirroring the real store means mirroring that split
   * too, not inventing a field the SQLite store would not populate.
   */
  private readonly owners = new Map<string, RowOwner | null>();
  /**
   * Who ORDERED each void — a different question from who owns the bill, and
   * held separately for the same reason the SQL store keeps separate columns.
   */
  private readonly voidRequesters = new Map<string, RowOwner | null>();
  /** Who this fake device is signed in as. The analogue of local_identity. */
  private identity: RowOwner | null = null;

  constructor(snap?: MemorySnapshot) {
    if (!snap) return;
    for (const [id, bill] of snap.rows) this.rows.set(id, clone(bill));
    for (const [id, owner] of snap.owners) this.owners.set(id, clone(owner));
    for (const [id, who] of snap.voidRequesters) this.voidRequesters.set(id, clone(who));
    this.identity = clone(snap.identity);
  }

  /**
   * Everything a restart must carry. The identity is in it because on a real
   * device it lives in the database and survives the process — a fake that lost
   * it on restart would make every restarted case park its own bills.
   */
  snapshot(): MemorySnapshot {
    return {
      rows: new Map([...this.rows].map(([id, b]) => [id, clone(b)])),
      owners: new Map([...this.owners].map(([id, o]) => [id, clone(o)])),
      voidRequesters: new Map([...this.voidRequesters].map(([id, o]) => [id, clone(o)])),
      identity: clone(this.identity),
    };
  }

  /** Sign this fake device in. Mirrors SqliteIdentityStore.save. */
  setIdentity(owner: RowOwner | null): void {
    this.identity = clone(owner);
  }

  /**
   * "Queued to send": pending, not parked on master data, AND owned by whoever
   * is signed in now. Mirrors the QUEUED constant in SqliteLocalStore, owner
   * clause included — both stores must agree exactly on what the head-of-line
   * queue contains, or a case would pass on one and fail on the other for
   * reasons that have nothing to do with the engine.
   *
   * The null handling is SQL's, reproduced deliberately rather than reinvented:
   * a row with no owner, and a device with no identity, both compare unequal
   * and are excluded. That is what makes UNKNOWN park.
   */
  private isQueued(b: LocalBill): boolean {
    return queuedIgnoringOwner(b) && sameOwner(this.owners.get(b.id) ?? null, this.identity);
  }

  putBill(bill: LocalBill, owner: RowOwner | null): Promise<void> {
    this.rows.set(bill.id, clone(bill));
    this.owners.set(bill.id, clone(owner));
    return Promise.resolve();
  }

  getBill(id: string): Promise<LocalBill | null> {
    const row = this.rows.get(id);
    return Promise.resolve(row ? clone(row) : null);
  }

  listByState(state: SyncState): Promise<LocalBill[]> {
    const out = [...this.rows.values()]
      .filter((b) => b.sync_state === state)
      .sort(byCreatedAt)
      .map(clone);
    return Promise.resolve(out);
  }

  /**
   * Ordered by device_created_at — weighing order — like the SQLite store.
   *
   * The due test mirrors SqliteLocalStore's DUE_OR_UNBELIEVABLE exactly: due, OR
   * scheduled further out than any backoff this app writes, which means the
   * clock moved rather than that a schedule exists. Both stores must agree, or
   * the same proof case would pass on one and fail on the other for reasons that
   * have nothing to do with the engine.
   */
  listReadyToSend(now: Date, limit: number): Promise<LocalBill[]> {
    const out = [...this.rows.values()]
      .filter((b) => this.isQueued(b))
      .filter((b) => scheduledInstantIsDue(b.next_attempt_at, now.getTime()))
      .sort(byDeviceCreatedAt)
      .slice(0, limit)
      .map(clone);
    return Promise.resolve(out);
  }

  listPendingOldestFirst(limit: number): Promise<LocalBill[]> {
    const out = [...this.rows.values()]
      .filter((b) => this.isQueued(b))
      .sort(byDeviceCreatedAt)
      .slice(0, limit)
      .map(clone);
    return Promise.resolve(out);
  }

  clearBackoffForPending(now: Date): Promise<number> {
    let freed = 0;
    for (const row of this.rows.values()) {
      if (!this.isQueued(row)) continue;
      if (new Date(row.next_attempt_at).getTime() <= now.getTime()) continue;
      row.next_attempt_at = now.toISOString();
      freed += 1;
    }
    return Promise.resolve(freed);
  }

  claimForSend(id: string, _now: Date): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || !this.isQueued(row)) return Promise.resolve(false);
    row.sync_state = "syncing";
    return Promise.resolve(true);
  }

  markMasterDataMissing(
    id: string,
    code: string,
    reason: string,
    attempt: number,
    retryAt: Date,
    now: Date,
  ): Promise<void> {
    const row = this.require(id);
    row.sync_state = "pending";
    row.attempt_count = attempt;
    row.last_error = reason;
    row.master_data_missing_at = now.toISOString();
    row.master_data_code = code;
    row.next_attempt_at = retryAt.toISOString();
    // Not a server fault: the poison clocks must not run, or a missing price
    // would eventually raise the "call support" alarm.
    row.first_attempt_at = null;
    row.first_server_error_at = null;
    row.server_error_attempts = 0;
    return Promise.resolve();
  }

  /**
   * Mirrors SqliteLocalStore.markSessionExpired statement for statement: back to
   * pending, first_attempt_at stamped once, and BOTH poison columns cleared. The
   * suite runs the same cases against both stores, so a difference here would
   * make one of them a lie about what an expired session does to the alarm.
   */
  markSessionExpired(
    id: string,
    reason: string,
    attempt: number,
    retryAt: Date,
    now: Date,
  ): Promise<void> {
    const row = this.require(id);
    row.sync_state = "pending";
    row.attempt_count = attempt;
    row.last_error = reason;
    row.next_attempt_at = retryAt.toISOString();
    row.first_attempt_at = row.first_attempt_at ?? now.toISOString();
    row.first_server_error_at = null;
    row.server_error_attempts = 0;
    return Promise.resolve();
  }

  /**
   * Mirrors SqliteLocalStore.markSendForbidden: back to pending, poison columns
   * cleared, and NO backoff — next_attempt_at is `now`, because there is no
   * schedule to write for a refusal only a human elsewhere can lift.
   */
  markSendForbidden(id: string, reason: string, attempt: number, now: Date): Promise<void> {
    const row = this.require(id);
    row.sync_state = "pending";
    row.attempt_count = attempt;
    row.last_error = reason;
    row.next_attempt_at = now.toISOString();
    row.first_attempt_at = row.first_attempt_at ?? now.toISOString();
    row.first_server_error_at = null;
    row.server_error_attempts = 0;
    return Promise.resolve();
  }

  listMasterDataBlocked(limit: number): Promise<LocalBill[]> {
    const out = [...this.rows.values()]
      .filter((b) => b.sync_state === "pending" && b.master_data_missing_at !== null)
      .sort(byDeviceCreatedAt)
      .slice(0, limit)
      .map(clone);
    return Promise.resolve(out);
  }

  releaseMasterDataBlocked(now: Date, all: boolean): Promise<number> {
    let released = 0;
    for (const row of this.rows.values()) {
      if (row.sync_state !== "pending" || row.master_data_missing_at === null) continue;
      // Mirrors SqliteLocalStore.releaseMasterDataBlocked: the slow cadence is
      // the other writer of a future next_attempt_at, so it gets the same clock
      // rule.
      if (!all && !scheduledInstantIsDue(row.next_attempt_at, now.getTime())) continue;
      row.master_data_missing_at = null;
      row.master_data_code = null;
      // Cleared for the same reason as in SqliteLocalStore: this transition
      // retires the parked state, so the text that state produced must not
      // outlive it. The two stores must not diverge here — the suite runs the
      // same cases against both and a difference would make one of them a lie.
      row.last_error = null;
      row.next_attempt_at = now.toISOString();
      released += 1;
    }
    return Promise.resolve(released);
  }

  markSynced(id: string, docNo: string | null, attempt: number, now: Date): Promise<void> {
    // The same refusal as SqliteLocalStore.markSynced, and for the reason the
    // comment in releaseMasterDataBlocked above already states: the two stores
    // must not diverge. This fake accepting a null the real store throws on
    // would let an engine proof go green over a scenario the device refuses.
    // proveDocNo D7 pins this mirror; the full reasoning lives on the real
    // store's gate.
    if (docNo === null) {
      return Promise.reject(
        new Error(
          `markSynced(${id}): refusing sync_state='synced' with doc_no null — ` +
            "a 2xx that lost its doc_no is a retry, never a synced-null",
        ),
      );
    }
    const row = this.require(id);
    row.sync_state = "synced";
    row.doc_no = docNo;
    row.attempt_count = attempt;
    row.last_error = null;
    row.synced_at = now.toISOString();
    row.first_attempt_at = null;
    row.first_server_error_at = null;
    row.server_error_attempts = 0;
    row.master_data_missing_at = null;
    row.master_data_code = null;
    return Promise.resolve();
  }

  markFailed(id: string, reason: string, attempt: number, now: Date): Promise<void> {
    const row = this.require(id);
    row.sync_state = "failed";
    row.attempt_count = attempt;
    row.last_error = reason;
    row.next_attempt_at = now.toISOString();
    return Promise.resolve();
  }

  markPendingAgain(
    id: string,
    reason: string,
    attempt: number,
    nextAttemptAt: Date,
    now: Date,
    reachable: boolean,
  ): Promise<void> {
    const row = this.require(id);
    row.sync_state = "pending";
    row.attempt_count = attempt;
    row.last_error = reason;
    row.next_attempt_at = nextAttemptAt.toISOString();
    // COALESCE: stamp the FIRST bounce only, never move it after.
    row.first_attempt_at = row.first_attempt_at ?? now.toISOString();
    // The poison clock: run it only while the reachable server is refusing
    // (COALESCE), and RESET it on a transport-level bounce. Mirrors the CASE
    // expression in SqliteLocalStore.markPendingAgain exactly.
    row.first_server_error_at = reachable
      ? (row.first_server_error_at ?? now.toISOString())
      : null;
    // Same condition, same reason: consecutive server-answered failures, reset
    // by any transport-level bounce. Mirrors the CASE in SqliteLocalStore.
    row.server_error_attempts = reachable ? row.server_error_attempts + 1 : 0;
    return Promise.resolve();
  }

  pendingQueueSnapshot(): Promise<QueueSnapshot> {
    const pending = [...this.rows.values()].filter((b) => this.isQueued(b)).sort(byDeviceCreatedAt);
    const blocked = [...this.rows.values()].filter(
      (b) => b.sync_state === "pending" && b.master_data_missing_at !== null,
    );
    const head = pending[0];
    return Promise.resolve({
      pendingCount: pending.length,
      masterDataBlockedCount: blocked.length,
      head:
        head === undefined
          ? null
          : {
              id: head.id,
              doc_no: head.doc_no,
              attempts: head.attempt_count,
              first_attempt_at: head.first_attempt_at,
              first_server_error_at: head.first_server_error_at,
              server_error_attempts: head.server_error_attempts,
              last_error: head.last_error,
            },
    });
  }

  /**
   * Mirrors SqliteLocalStore.unsentBreakdown's four CASE arms, three-valued
   * logic included: `mine` needs an identity AND a matching owner (a device
   * with no identity matches nothing — fail closed); `otherAccount` is any
   * KNOWN owner that is not me, which with no identity stored is every known
   * owner; `unknownOwner` is an absent owner. Both stores must agree or a
   * count case would pass on one and lie on the other.
   */
  unsentBreakdown(): Promise<UnsentBreakdown> {
    let mine = 0;
    let mineBlocked = 0;
    let otherAccount = 0;
    let unknownOwner = 0;
    for (const b of this.rows.values()) {
      if (b.sync_state !== "pending" && b.sync_state !== "syncing") continue;
      const owner = this.owners.get(b.id) ?? null;
      if (owner === null) {
        unknownOwner += 1;
      } else if (!sameOwner(owner, this.identity)) {
        otherAccount += 1;
      } else if (b.master_data_missing_at !== null) {
        mineBlocked += 1;
      } else {
        mine += 1;
      }
    }
    return Promise.resolve({ mine, mineBlocked, otherAccount, unknownOwner });
  }

  resetSyncingToPending(now: Date): Promise<string[]> {
    const recovered: string[] = [];
    for (const row of this.rows.values()) {
      if (row.sync_state === "syncing") {
        row.sync_state = "pending";
        row.last_error = "recovered from interrupted send";
        row.next_attempt_at = now.toISOString();
        recovered.push(row.id);
      }
    }
    return Promise.resolve(recovered.sort());
  }

  /**
   * Mirrors SqliteLocalStore.releaseBillsParkedOnLocalSeller, INCLUDING the
   * absence of an owner filter — a fake that quietly filtered would make the
   * one cell that matters (a second person's bill released) pass here and fail
   * on the real store, which is the direction that strands money.
   *
   * The payload rewrite is the same rewrite: the id the server will be sent is
   * inside the payload, and releasing without replacing it hands the queue a
   * bill the server answers 422.
   */
  releaseBillsParkedOnLocalSeller(
    localSellerId: string,
    serverSellerId: string,
    now: Date,
  ): Promise<number> {
    let released = 0;
    for (const row of this.rows.values()) {
      if (row.local_seller_id !== localSellerId) continue;
      if (row.local_seller_parked_at === null) continue;
      row.payload = { ...row.payload, seller_id: serverSellerId };
      row.local_seller_parked_at = null;
      row.next_attempt_at = now.toISOString();
      released += 1;
    }
    return Promise.resolve(released);
  }

  requestVoid(id: string, reason: string, now: Date): Promise<boolean> {
    const row = this.require(id);
    if (row.void_requested_at !== null) return Promise.resolve(false);
    row.void_reason = reason;
    row.void_requested_at = now.toISOString();
    // WHO ASKED, recorded in the same breath and under the same guard, so a
    // second press cannot reassign the request. Mirrors the SQL statement,
    // including that this is the CURRENT identity rather than the bill's owner.
    this.voidRequesters.set(id, clone(this.identity));
    return Promise.resolve(true);
  }

  listVoidsToApply(limit: number): Promise<LocalBill[]> {
    const out = [...this.rows.values()]
      .filter(
        (b) =>
          b.void_requested_at !== null &&
          b.voided_at === null &&
          // Mirrors the SQL: a refused void is not owed work, so it must leave
          // this queue in BOTH stores or the same proof case would pass on one
          // and hammer the server on the other.
          b.void_refused_at === null &&
          // Mirrors the requester clause: a void goes under the identity that
          // ORDERED it, and an unrecorded requester matches nobody and waits.
          sameOwner(this.voidRequesters.get(b.id) ?? null, this.identity) &&
          b.sync_state === "synced" &&
          b.doc_no !== null,
      )
      .sort(byCreatedAt)
      .slice(0, limit)
      .map(clone);
    return Promise.resolve(out);
  }

  /**
   * Mirrors SqliteLocalStore.countVoidsOwed: requested, not settled, not
   * refused, not on a TERMINALLY FAILED bill, ordered by the current identity —
   * and DELIBERATELY no `synced` clause, unlike listVoidsToApply above, because
   * a void on a still-unsent bill is owed even though it is not yet actionable.
   * Both stores must agree on the width of "owed" or the same count case would
   * lie on one of them.
   *
   * THE `failed` EXCLUSION IS P1.8b's AND IT IS NOT A SHORTCUT HERE. The whole
   * argument is on the SQLite method; what matters at this copy is that the two
   * must not disagree, because the sign-out gate now reads this number through
   * the registry and the proofs drive both stores.
   */
  countVoidsOwed(): Promise<number> {
    let n = 0;
    for (const b of this.rows.values()) {
      if (b.void_requested_at === null || b.voided_at !== null || b.void_refused_at !== null) {
        continue;
      }
      // A void on a bill the server permanently refused can never be applied:
      // listVoidsToApply requires 'synced' and nothing moves a failed bill
      // there. Owed-for-ever is not owed; it is office work, and the failed
      // bill itself is what says so on the screen.
      if (b.sync_state === "failed") continue;
      if (!sameOwner(this.voidRequesters.get(b.id) ?? null, this.identity)) continue;
      n += 1;
    }
    return Promise.resolve(n);
  }

  markVoidApplied(id: string, attempt: number, now: Date): Promise<void> {
    const row = this.require(id);
    row.voided_at = now.toISOString();
    row.void_attempts = attempt;
    row.void_last_error = null;
    // Cleared with it, exactly as in SqliteLocalStore: no transition may leave
    // behind state describing the state it just left.
    row.void_refused_at = null;
    row.void_refused_code = null;
    return Promise.resolve();
  }

  markVoidAttemptFailed(id: string, reason: string, attempt: number): Promise<void> {
    const row = this.require(id);
    row.void_attempts = attempt;
    row.void_last_error = reason;
    return Promise.resolve();
  }

  markVoidRefused(
    id: string,
    code: string,
    reason: string,
    attempt: number,
    now: Date,
  ): Promise<void> {
    const row = this.require(id);
    row.void_refused_at = now.toISOString();
    row.void_refused_code = code;
    row.void_attempts = attempt;
    row.void_last_error = reason;
    return Promise.resolve();
  }

  clearVoidRefusals(_now: Date): Promise<number> {
    let cleared = 0;
    for (const row of this.rows.values()) {
      if (row.void_refused_at === null) continue;
      // Mirrors the SQL exclusion: a sign-in retracts a refusal of the CALLER
      // (403), never a rejection of the REQUEST (404/400/422), which no sign-in
      // can change. Both stores must agree or the same case passes on one and
      // resumes an endless retry on the other.
      if (row.void_refused_code === VOID_REJECTED_CODE) continue;
      // Mirrors the requester clause: a sign-in retracts only the refusals on
      // voids this person ordered. Somebody else signing in changes nothing
      // about a reversal they did not ask for.
      if (!sameOwner(this.voidRequesters.get(row.id) ?? null, this.identity)) continue;
      row.void_refused_at = null;
      row.void_refused_code = null;
      row.void_last_error = null;
      cleared += 1;
    }
    return Promise.resolve(cleared);
  }

  /** Test-only: force a state, e.g. to simulate a kill mid-send. */
  forceState(id: string, state: SyncState): void {
    this.require(id).sync_state = state;
  }

  private require(id: string): LocalBill {
    const row = this.rows.get(id);
    if (!row) throw new Error(`no such local bill: ${id}`);
    return row;
  }
}

/**
 * "Queued to send": pending AND not parked on missing master data. Mirrors the
 * QUEUED predicate in SqliteLocalStore — both stores must agree exactly on what
 * the head-of-line queue contains, or the proofs would pass on one and not the
 * other for reasons that have nothing to do with the engine.
 */
const queuedIgnoringOwner = (b: LocalBill): boolean =>
  b.sync_state === "pending" &&
  b.master_data_missing_at === null &&
  // The SECOND park, P1.8b. Both stores must agree on what the queue holds:
  // a bill waiting on a seller this device created is out of it, and a case
  // that passed here and failed on SQLite would be about the fake.
  b.local_seller_parked_at === null;

const byCreatedAt = (a: LocalBill, b: LocalBill): number =>
  a.created_at === b.created_at
    ? a.id.localeCompare(b.id)
    : a.created_at.localeCompare(b.created_at);

/** Weighing order, with id as a total-order tiebreaker. */
const byDeviceCreatedAt = (a: LocalBill, b: LocalBill): number =>
  a.device_created_at === b.device_created_at
    ? byCreatedAt(a, b)
    : a.device_created_at.localeCompare(b.device_created_at);

/* --------------------------------------------------------- fake server --- */

export interface ServerBill {
  id: string;
  doc_no: string;
  idempotency_key: string;
  voided_at: string | null;
  void_reason: string | null;
}

/**
 * Mirrors the Phase 1c server contract: a repeated idempotency_key returns the
 * EXISTING bill instead of creating a second one.
 */
export class FakeServer {
  private readonly byKey = new Map<string, ServerBill>();
  /** Every submit that reached the server, duplicates included. */
  submits = 0;

  submit(payload: BillPayload): { kind: "accepted" | "duplicate"; bill: ServerBill } {
    this.submits += 1;
    const existing = this.byKey.get(payload.idempotency_key);
    if (existing) return { kind: "duplicate", bill: existing };
    const bill: ServerBill = {
      id: payload.id,
      doc_no: `B-2569-${this.byKey.size + 1}`,
      idempotency_key: payload.idempotency_key,
      voided_at: null,
      void_reason: null,
    };
    this.byKey.set(payload.idempotency_key, bill);
    return { kind: "accepted", bill };
  }

  /**
   * Mirrors POST /bills/{id}/void from Phase 1c: 404 unknown, 409 already
   * voided, otherwise voided. doc_no is deliberately left alone — a voided
   * bill KEEPS its number and the counter never rewinds, so the number is
   * never handed to a different bill.
   */
  voidBill(id: string, reason: string): { kind: "voided" | "already_voided" | "not_found"; bill?: ServerBill } {
    this.voidCalls += 1;
    const bill = [...this.byKey.values()].find((b) => b.id === id);
    if (!bill) return { kind: "not_found" };
    if (bill.voided_at !== null) return { kind: "already_voided", bill };
    bill.voided_at = "2026-07-22T10:00:00.000Z";
    bill.void_reason = reason;
    return { kind: "voided", bill };
  }

  /** Every void request that reached the server, repeats included. */
  voidCalls = 0;

  findById(id: string): ServerBill | undefined {
    return [...this.byKey.values()].find((b) => b.id === id);
  }

  get voidedCount(): number {
    return [...this.byKey.values()].filter((b) => b.voided_at !== null).length;
  }

  get billCount(): number {
    return this.byKey.size;
  }

  distinctBillIds(): Set<string> {
    return new Set([...this.byKey.values()].map((b) => b.id));
  }

  hasBillId(id: string): boolean {
    return this.distinctBillIds().has(id);
  }
}

/* ----------------------------------------------------------- transports -- */

/** Counts send attempts per bill id, for the double-send guard test. */
export class SendCounter {
  private readonly counts = new Map<string, number>();

  record(id: string): void {
    this.counts.set(id, (this.counts.get(id) ?? 0) + 1);
  }

  get(id: string): number {
    return this.counts.get(id) ?? 0;
  }

  max(): number {
    return this.counts.size === 0 ? 0 : Math.max(...this.counts.values());
  }
}

/** Maps the fake server's answer onto the same union the HTTP transport uses. */
export function toVoidOutcome(r: {
  kind: "voided" | "already_voided" | "not_found";
  bill?: ServerBill;
}): VoidOutcome {
  if (r.kind === "not_found") {
    return { kind: "rejected", reason: "HTTP 404: bill not found" };
  }
  return { kind: r.kind, doc_no: r.bill?.doc_no ?? null };
}

export class OnlineTransport implements Transport {
  constructor(
    private readonly server: FakeServer,
    private readonly counter = new SendCounter(),
  ) {}

  sendBill(bill: LocalBill): Promise<SendOutcome> {
    this.counter.record(bill.id);
    const r = this.server.submit(bill.payload);
    return Promise.resolve({ kind: r.kind, doc_no: r.bill.doc_no });
  }

  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    return Promise.resolve(toVoidOutcome(this.server.voidBill(bill.id, reason)));
  }
}

/** Never reaches the server at all. */
export class OfflineTransport implements Transport {
  sendBill(): Promise<SendOutcome> {
    return Promise.reject(new Error("Network request failed"));
  }

  voidBill(): Promise<VoidOutcome> {
    return Promise.reject(new Error("Network request failed"));
  }
}

/**
 * The void equivalent of LostAckTransport, and the reason void retries have to
 * be safe: the FIRST void reaches the server and is applied, then the response
 * is lost. The client cannot know it worked. Every later attempt behaves
 * normally, so the server answers "already voided".
 */
export class VoidLosesFirstAckTransport implements Transport {
  voidAttempts = 0;

  constructor(private readonly server: FakeServer) {}

  sendBill(bill: LocalBill): Promise<SendOutcome> {
    const r = this.server.submit(bill.payload);
    return Promise.resolve({ kind: r.kind, doc_no: r.bill.doc_no });
  }

  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    this.voidAttempts += 1;
    const r = this.server.voidBill(bill.id, reason);
    if (this.voidAttempts === 1) {
      return Promise.reject(new Error("socket hang up after the void committed"));
    }
    return Promise.resolve(toVoidOutcome(r));
  }
}

/**
 * The dangerous one: the server COMMITS the bill, then the response is lost.
 * The client sees only a thrown error and cannot know the bill exists.
 */
export class LostAckTransport implements Transport {
  constructor(
    private readonly server: FakeServer,
    private readonly counter = new SendCounter(),
  ) {}

  sendBill(bill: LocalBill): Promise<SendOutcome> {
    this.counter.record(bill.id);
    this.server.submit(bill.payload);
    return Promise.reject(new Error("socket hang up after commit"));
  }

  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    this.server.voidBill(bill.id, reason);
    return Promise.reject(new Error("socket hang up after commit"));
  }
}

/** Server understood the bill and refused it on its merits. */
export class RejectingTransport implements Transport {
  sendBill(): Promise<SendOutcome> {
    return Promise.resolve({
      kind: "rejected",
      reason: "HTTP 422: seller_id does not exist in this tenant",
    });
  }

  voidBill(): Promise<VoidOutcome> {
    return Promise.resolve({
      kind: "rejected",
      reason: "HTTP 404: bill not found",
    });
  }
}

/**
 * The poison pill. One specific bill (by id) makes the server fail
 * DETERMINISTICALLY with a 5xx — reachable server, understood request, but it
 * errors on that payload every single time. Crucially that is `unavailable`,
 * NOT `rejected`: the engine cannot know the server will never accept it, so it
 * retries forever. Under strict head-of-line order that one bill dams the whole
 * queue. Every other bill would submit and succeed — but with the poison bill at
 * the head, nothing behind it is ever even attempted, which `attemptedIds`
 * proves.
 */
export class HeadFailingTransport implements Transport {
  readonly attemptedIds: string[] = [];

  constructor(
    private readonly server: FakeServer,
    private readonly failId: string,
  ) {}

  sendBill(bill: LocalBill): Promise<SendOutcome> {
    this.attemptedIds.push(bill.id);
    if (bill.id === this.failId) {
      // reachable: true — the server ANSWERED with a 503. That is the poison
      // shape: the network is fine, the reachable server keeps erroring on this
      // one payload. It is what the UI must escalate to a red alarm, unlike a
      // transport-level failure that only means offline.
      return Promise.resolve({
        kind: "unavailable",
        reason: "HTTP 503: server error on this payload",
        reachable: true,
      });
    }
    const r = this.server.submit(bill.payload);
    return Promise.resolve({ kind: r.kind, doc_no: r.bill.doc_no });
  }

  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    return Promise.resolve(toVoidOutcome(this.server.voidBill(bill.id, reason)));
  }
}

/**
 * The RESOLVABLE refusal. One bill references a product whose price tier the
 * office has not set up, so the server refuses it with 424 + a reason code —
 * until `addPrice()` models the office adding it, after which the SAME bill,
 * unchanged, is accepted.
 *
 * The contrast with HeadFailingTransport is the whole point: that one is a 5xx
 * the server will never resolve (poison, call support); this one is a definite
 * refusal that a human clears in seconds (call the office). Same "the bill did
 * not go", opposite correct responses.
 */
export class MasterDataMissingTransport implements Transport {
  readonly attemptedIds: string[] = [];
  private priced = false;

  constructor(
    private readonly server: FakeServer,
    private readonly blockedId: string,
  ) {}

  /** The back office sets the price. Nothing about the bill changes. */
  addPrice(): void {
    this.priced = true;
  }

  sendBill(bill: LocalBill): Promise<SendOutcome> {
    this.attemptedIds.push(bill.id);
    if (bill.id === this.blockedId && !this.priced) {
      return Promise.resolve({
        kind: "rejected_resolvable",
        reason: "HTTP 424: ยังไม่ได้ตั้งราคาสินค้าสำหรับเกรด B",
        code: "product_price_unset",
      });
    }
    const r = this.server.submit(bill.payload);
    return Promise.resolve({ kind: r.kind, doc_no: r.bill.doc_no });
  }

  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    return Promise.resolve(toVoidOutcome(this.server.voidBill(bill.id, reason)));
  }
}

/**
 * THE EXPIRED SESSION. Every request is answered 401 until `signIn()` is called,
 * after which the SAME bills — same ids, same idempotency keys, nothing re-typed
 * — go through normally.
 *
 * Note what it is NOT: it is not offline (the server answers every time) and it
 * is not poison (the bills are perfectly valid, as signIn() then demonstrates).
 * Those are the two things the app used to say instead.
 */
export class ExpiredSessionTransport implements Transport {
  readonly attemptedIds: string[] = [];
  private signedIn = false;

  constructor(private readonly server: FakeServer) {}

  /** The operator signs in again. Nothing about any bill changes. */
  signIn(): void {
    this.signedIn = true;
  }

  sendBill(bill: LocalBill): Promise<SendOutcome> {
    this.attemptedIds.push(bill.id);
    if (!this.signedIn) {
      return Promise.resolve({ kind: "session_expired", reason: "HTTP 401: Not authenticated" });
    }
    const r = this.server.submit(bill.payload);
    return Promise.resolve({ kind: r.kind, doc_no: r.bill.doc_no });
  }

  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    if (!this.signedIn) {
      return Promise.resolve({ kind: "session_expired", reason: "HTTP 401: Not authenticated" });
    }
    return Promise.resolve(toVoidOutcome(this.server.voidBill(bill.id, reason)));
  }
}

/**
 * THE ROLE GATE. The server answers 403 — the caller is authenticated and is
 * exactly who they say they are, and their role does not permit this.
 *
 * Which operations are gated is a constructor argument because the REAL server
 * gates them asymmetrically and that asymmetry is the whole point: POST /bills is
 * open to staff, POST /bills/{id}/void is admin-only. So the case a yard actually
 * meets is `{ sends: false, voids: true }` — a phone that works all day and is
 * refused the moment someone taps ยกเลิกบิล.
 *
 * `grantAdmin()` models the ONE thing that can change the answer: a human
 * elsewhere changes the role, and someone signs in again.
 */
export class ForbiddenTransport implements Transport {
  sendCalls = 0;
  voidCalls = 0;
  private granted = false;

  constructor(
    private readonly server: FakeServer,
    private readonly gate: { sends: boolean; voids: boolean },
  ) {}

  /** The owner fixes the role. Nothing about any bill changes. */
  grantAdmin(): void {
    this.granted = true;
  }

  sendBill(bill: LocalBill): Promise<SendOutcome> {
    this.sendCalls += 1;
    if (this.gate.sends && !this.granted) {
      return Promise.resolve({
        kind: "forbidden",
        code: "admin_required",
        // The shape httpTransport builds: `HTTP 403: ` + the server's detail
        // object, verbatim. Kept realistic ON PURPOSE — it is what must never
        // reach the screen, so a proof asserting the screen is clean has to be
        // running against the real thing rather than a tidy placeholder.
        reason:
          'HTTP 403: {"kind":"forbidden","code":"admin_required","message":' +
          '"ต้องมีสิทธิ์ผู้ดูแลระบบจึงจะทำรายการนี้ได้","required_role":"admin",' +
          '"actual_role":"staff"}',
      });
    }
    const r = this.server.submit(bill.payload);
    return Promise.resolve({ kind: r.kind, doc_no: r.bill.doc_no });
  }

  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    this.voidCalls += 1;
    if (this.gate.voids && !this.granted) {
      return Promise.resolve({
        kind: "forbidden",
        code: "admin_required",
        reason:
          'HTTP 403: {"kind":"forbidden","code":"admin_required","message":' +
          '"ต้องมีสิทธิ์ผู้ดูแลระบบจึงจะทำรายการนี้ได้","required_role":"admin",' +
          '"actual_role":"staff"}',
      });
    }
    return Promise.resolve(toVoidOutcome(this.server.voidBill(bill.id, reason)));
  }
}

/**
 * THE PRE-FIX 403, kept so the proof can show what it prevents rather than
 * merely asserting the new state is fine — the same device as
 * LegacyUnauthorizedTransport below, one status along.
 *
 * Byte-identical reason string to ForbiddenTransport; only the classification
 * differs. On the SEND path that difference is `reachable: true`, which runs the
 * poison counter to POISON_ALARM_ATTEMPTS and produces the red
 * "ติดต่อฝ่ายสนับสนุน" alarm. On the VOID path VoidOutcome has no `reachable` at
 * all, so the failure is quieter and worse: the void stays owed, there is no
 * backoff column on that path, and it is re-POSTed on every pass forever.
 */
export class LegacyForbiddenTransport implements Transport {
  sendCalls = 0;
  voidCalls = 0;

  private static readonly REASON =
    'HTTP 403: {"kind":"forbidden","code":"admin_required","message":' +
    '"ต้องมีสิทธิ์ผู้ดูแลระบบจึงจะทำรายการนี้ได้","required_role":"admin",' +
    '"actual_role":"staff"}';

  sendBill(): Promise<SendOutcome> {
    this.sendCalls += 1;
    return Promise.resolve({
      kind: "unavailable",
      reason: LegacyForbiddenTransport.REASON,
      reachable: true,
    });
  }

  voidBill(): Promise<VoidOutcome> {
    this.voidCalls += 1;
    return Promise.resolve({ kind: "unavailable", reason: LegacyForbiddenTransport.REASON });
  }
}

/**
 * The PRE-FIX behaviour, kept so the proof can show what it prevents rather than
 * merely asserting the new state is fine.
 *
 * A 401 classified the way httpTransport classified it until Phase 2c-7: an
 * `unavailable` whose server ANSWERED, so `reachable: true`. Byte-identical
 * reason string; only the classification differs. Used by CASE 11c to run the
 * exact same scenario and watch the red poison alarm fire.
 */
export class LegacyUnauthorizedTransport implements Transport {
  sendBill(): Promise<SendOutcome> {
    return Promise.resolve({
      kind: "unavailable",
      reason: "HTTP 401: Not authenticated",
      reachable: true,
    });
  }

  voidBill(): Promise<VoidOutcome> {
    return Promise.resolve({ kind: "unavailable", reason: "HTTP 401: Not authenticated" });
  }
}

export type FlakyMode = "lost-before-commit" | "lost-after-commit" | "ok";

/**
 * Seeded flaky transport. Roughly half the sends fail, and half of THOSE
 * failures happen after the server already committed — the duplicate-producing
 * shape.
 */
export class FlakyTransport implements Transport {
  readonly modes: FlakyMode[] = [];

  constructor(
    private readonly server: FakeServer,
    private readonly rand: () => number,
    private readonly counter = new SendCounter(),
  ) {}

  sendBill(bill: LocalBill): Promise<SendOutcome> {
    this.counter.record(bill.id);
    const roll = this.rand();
    if (roll < 0.25) {
      this.modes.push("lost-before-commit");
      return Promise.reject(new Error("Network request failed"));
    }
    if (roll < 0.5) {
      this.modes.push("lost-after-commit");
      this.server.submit(bill.payload);
      return Promise.reject(new Error("socket hang up after commit"));
    }
    this.modes.push("ok");
    const r = this.server.submit(bill.payload);
    return Promise.resolve({ kind: r.kind, doc_no: r.bill.doc_no });
  }

  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    return Promise.resolve(toVoidOutcome(this.server.voidBill(bill.id, reason)));
  }
}

/**
 * Holds every send open until released, so two sync runs can overlap on the
 * same bill on purpose.
 */
export class GatedTransport implements Transport {
  private release: (() => void) | null = null;
  private readonly gate: Promise<void>;
  readonly started: string[] = [];

  constructor(
    private readonly server: FakeServer,
    private readonly counter = new SendCounter(),
  ) {
    this.gate = new Promise<void>((resolve) => {
      this.release = resolve;
    });
  }

  async sendBill(bill: LocalBill): Promise<SendOutcome> {
    this.started.push(bill.id);
    this.counter.record(bill.id);
    await this.gate;
    const r = this.server.submit(bill.payload);
    return { kind: r.kind, doc_no: r.bill.doc_no };
  }

  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    return Promise.resolve(toVoidOutcome(this.server.voidBill(bill.id, reason)));
  }

  open(): void {
    this.release?.();
  }
}

/* ------------------------------------------------------------- seeded rng */

/** mulberry32 — small, fast, reproducible from a 32-bit seed. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------ the seller kind -- */

/**
 * A `LocalSellerStore` THAT HOLDS NOTHING AND REFUSES EVERY WRITE.
 *
 * WHAT IT IS FOR. `OutboxRegistry` is total over `OutboxKind`, so every
 * `new SyncEngine` in this suite must supply a seller store — including the
 * ~60 of them that are about bills, backoff, voids, clocks and cold starts and
 * have no seller in them at all.
 *
 * WHY THE READS ARE EMPTY AND THE WRITES THROW, WHICH IS NOT AN ARBITRARY
 * MIXTURE. The reads are empty because that is TRUE of those proofs: they hold
 * no local sellers, so an empty queue and a zero count are the correct answers,
 * and `recover` returning nothing is the correct sweep of nothing. The WRITES
 * throw because a bill proof reaching one would mean the seller kind acted on a
 * row that does not exist — so this doubles as a standing assertion, in ~60
 * places, that the third kind stays out of the way of the other two. A silent
 * no-op there would let a real defect pass as a green.
 *
 * IT IS NOT A DEFAULT. It is supplied EXPLICITLY at every site, by name, which
 * is the difference between a call site that has answered the question and one
 * that never saw it.
 */
export class EmptySellerStore implements LocalSellerStore {
  private refuse(method: string): never {
    throw new Error(
      `EmptySellerStore.${method}: a proof with no local sellers reached the` +
        " seller kind's writer. That is the third kind acting on a row that does" +
        " not exist, not a fixture that needs widening.",
    );
  }

  saveReservations(): Promise<number> {
    return this.refuse("saveReservations");
  }
  listReservations(): Promise<ReservedCode[]> {
    return Promise.resolve([]);
  }
  spendableCount(): Promise<number> {
    return Promise.resolve(0);
  }
  createLocalSeller(): Promise<CreateLocalSellerResult> {
    return this.refuse("createLocalSeller");
  }
  getLocalSeller(): Promise<LocalSeller | null> {
    return Promise.resolve(null);
  }
  listSellersToCreate(): Promise<LocalSeller[]> {
    return Promise.resolve([]);
  }
  countSellersOwed(): Promise<number> {
    return Promise.resolve(0);
  }
  claimSellerCreate(): Promise<boolean> {
    return this.refuse("claimSellerCreate");
  }
  markSellerCreated(): Promise<void> {
    return this.refuse("markSellerCreated");
  }
  markSellerCreateRefused(): Promise<void> {
    return this.refuse("markSellerCreateRefused");
  }
  markSellerCreateNeedsReview(): Promise<void> {
    return this.refuse("markSellerCreateNeedsReview");
  }
  markSellerCreateAttemptFailed(): Promise<void> {
    return this.refuse("markSellerCreateAttemptFailed");
  }
  /**
   * THE ONE WRITER THAT DOES NOT THROW, and the exception is required rather
   * than convenient: `recoverAll` calls every kind's `recover` at boot, and
   * many of these proofs boot. An empty sweep of an empty table is the correct
   * answer and writes nothing.
   */
  resetSyncingSellersToPending(): Promise<string[]> {
    return Promise.resolve([]);
  }
}

/**
 * A `SellerCreateTransport` that refuses to be called.
 *
 * The companion to `EmptySellerStore`: with no rows there is nothing to
 * perform, so a call here is the same defect the store's writers catch, one
 * layer out — and catching it at BOTH layers is what makes either of them
 * evidence rather than a hope.
 */
export class RefusingSellerTransport implements SellerCreateTransport, ReservationTransport {
  createSeller(): Promise<SellerCreateOutcome> {
    throw new Error(
      "RefusingSellerTransport.createSeller: a proof with no local sellers" +
        " performed a seller create.",
    );
  }

  /**
   * ANSWERS `unavailable` AND DOES NOT THROW, which is the opposite of its
   * sibling above and is deliberate.
   *
   * Since P1.8b GATES every pass tops the holding up, so a call here is NORMAL
   * on a proof with no sellers rather than the defect `createSeller`'s throw
   * catches. What such a proof models is a device that cannot reach the
   * reservation route at all — which is exactly `unavailable`, costs nothing,
   * writes nothing, and never reaches `EmptySellerStore.saveReservations`,
   * whose throw would otherwise fire on every pass of half this suite.
   */
  topUp(): Promise<RefillOutcome> {
    return Promise.resolve({
      kind: "unavailable",
      reason: "RefusingSellerTransport: no reservation route in this proof",
    });
  }
}

/**
 * A device identity that is already minted and never changes.
 *
 * `ensure` is idempotent by construction on the real store (the table is keyed
 * `only_row`), so a fake that minted per call would be a different contract:
 * the one property this value has is that it is the SAME for ever, and a
 * handset that re-minted would leave its whole holding `held` in a name it no
 * longer answers to.
 */
export class FixedDeviceStore implements DeviceIdentityStore {
  constructor(private readonly id: DeviceId = "00000000-0000-4000-8000-0000000d0001") {}
  load(): Promise<DeviceId | null> {
    return Promise.resolve(this.id);
  }
  ensure(): Promise<DeviceId> {
    return Promise.resolve(this.id);
  }
}

/**
 * The seller-kind deps for a proof that has no sellers in it.
 *
 * A FUNCTION AND NOT A SHARED CONST, so no two engines in one proof can share
 * a double and no state can leak between cases even if these ever gain any.
 */
export function noSellerKind(): {
  sellerStore: LocalSellerStore;
  sellerTransport: SellerCreateTransport & ReservationTransport;
  deviceStore: DeviceIdentityStore;
} {
  return {
    sellerStore: new EmptySellerStore(),
    sellerTransport: new RefusingSellerTransport(),
    // P1.8b GATES: the pass tops the holding up, so an engine cannot be built
    // without a device to hold it. Supplied HERE rather than at each site, so
    // the ~70 `new SyncEngine` calls that spread this helper needed no edit —
    // and the ones that do NOT spread it are exactly the sites that had to
    // answer the question, which is the sweep working as intended.
    deviceStore: new FixedDeviceStore(),
  };
}

/**
 * A `SellerCreateTransport` whose answer is SCRIPTED, and which RECORDS the row
 * it was handed.
 *
 * `recorded` is what `THE-TOKEN-IS-ON-THE-WIRE` reads for its headless cell —
 * but note carefully what this class can and cannot establish. It records the
 * ROW, so it proves what `perform` was GIVEN and not what went on the wire. The
 * wire is read off `HttpSellerTransport` through a recording `fetchImpl`, which
 * is the only instrument that can see a `perform` that quietly drops the token.
 */
export class ScriptedSellerTransport implements SellerCreateTransport {
  readonly recorded: LocalSeller[] = [];
  private queue: SellerCreateOutcome[] = [];

  constructor(private readonly fallback: SellerCreateOutcome) {}

  /** Answers to give, in order, before the fallback takes over. */
  script(...outcomes: SellerCreateOutcome[]): this {
    this.queue.push(...outcomes);
    return this;
  }

  createSeller(row: LocalSeller): Promise<SellerCreateOutcome> {
    this.recorded.push(row);
    const next = this.queue.shift();
    return Promise.resolve(next ?? this.fallback);
  }
}

/**
 * AN `OwedByKind` FOR A PROOF THAT ONLY CARES ABOUT SOME OF IT.
 *
 * `owedWith({ seller_create: 1 })` — everything else zero. Built by spreading
 * `NOTHING_OWED`, which is the TOTAL literal in `sync/outbox.ts`, so a fourth
 * kind is a compile error THERE and every fixture built here follows it without
 * a second edit. Written out by hand at each of the forty-odd call sites, the
 * kind that mattered would be the one somebody forgot.
 *
 * IT DOES NOT WEAKEN THE COMPILE GUARANTEE THE GATE RESTS ON. What must be
 * total is the map the RUNNER produces and the wording tables that speak from
 * it; a proof fixture naming one kind and defaulting the rest is exactly the
 * staging a criterion asks for.
 */
export function owedWith(over: Partial<OwedByKind>): OwedByKind {
  return { ...NOTHING_OWED, ...over };
}
