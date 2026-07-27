/**
 * Test doubles for the headless proof. These are NOT production code — the
 * production adapters are expo-sqlite (Phase 2b) and HttpTransport.
 */
import type {
  BillPayload,
  Clock,
  IdSource,
  LocalBill,
  LocalStore,
  QueueSnapshot,
  SendOutcome,
  SyncState,
  Transport,
  VoidOutcome,
} from "../sync/types.js";

const clone = <T>(value: T): T => structuredClone(value);

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

  constructor(rows?: Map<string, LocalBill>) {
    if (rows) for (const [id, bill] of rows) this.rows.set(id, clone(bill));
  }

  snapshot(): Map<string, LocalBill> {
    return new Map([...this.rows].map(([id, b]) => [id, clone(b)]));
  }

  putBill(bill: LocalBill): Promise<void> {
    this.rows.set(bill.id, clone(bill));
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

  /** Ordered by device_created_at — weighing order — like the SQLite store. */
  listReadyToSend(now: Date, limit: number): Promise<LocalBill[]> {
    const out = [...this.rows.values()]
      .filter(queued)
      .filter((b) => new Date(b.next_attempt_at).getTime() <= now.getTime())
      .sort(byDeviceCreatedAt)
      .slice(0, limit)
      .map(clone);
    return Promise.resolve(out);
  }

  listPendingOldestFirst(limit: number): Promise<LocalBill[]> {
    const out = [...this.rows.values()]
      .filter(queued)
      .sort(byDeviceCreatedAt)
      .slice(0, limit)
      .map(clone);
    return Promise.resolve(out);
  }

  clearBackoffForPending(now: Date): Promise<number> {
    let freed = 0;
    for (const row of this.rows.values()) {
      if (!queued(row)) continue;
      if (new Date(row.next_attempt_at).getTime() <= now.getTime()) continue;
      row.next_attempt_at = now.toISOString();
      freed += 1;
    }
    return Promise.resolve(freed);
  }

  claimForSend(id: string, _now: Date): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || !queued(row)) return Promise.resolve(false);
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
      if (!all && new Date(row.next_attempt_at).getTime() > now.getTime()) continue;
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
    const pending = [...this.rows.values()].filter(queued).sort(byDeviceCreatedAt);
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

  requestVoid(id: string, reason: string, now: Date): Promise<boolean> {
    const row = this.require(id);
    if (row.void_requested_at !== null) return Promise.resolve(false);
    row.void_reason = reason;
    row.void_requested_at = now.toISOString();
    return Promise.resolve(true);
  }

  listVoidsToApply(limit: number): Promise<LocalBill[]> {
    const out = [...this.rows.values()]
      .filter(
        (b) =>
          b.void_requested_at !== null &&
          b.voided_at === null &&
          b.sync_state === "synced" &&
          b.doc_no !== null,
      )
      .sort(byCreatedAt)
      .slice(0, limit)
      .map(clone);
    return Promise.resolve(out);
  }

  markVoidApplied(id: string, attempt: number, now: Date): Promise<void> {
    const row = this.require(id);
    row.voided_at = now.toISOString();
    row.void_attempts = attempt;
    row.void_last_error = null;
    return Promise.resolve();
  }

  markVoidAttemptFailed(id: string, reason: string, attempt: number): Promise<void> {
    const row = this.require(id);
    row.void_attempts = attempt;
    row.void_last_error = reason;
    return Promise.resolve();
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
const queued = (b: LocalBill): boolean =>
  b.sync_state === "pending" && b.master_data_missing_at === null;

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
