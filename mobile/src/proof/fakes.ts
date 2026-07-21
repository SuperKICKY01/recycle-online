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
  SendOutcome,
  SyncState,
  Transport,
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

  listReadyToSend(now: Date, limit: number): Promise<LocalBill[]> {
    const out = [...this.rows.values()]
      .filter((b) => b.sync_state === "pending")
      .filter((b) => new Date(b.next_attempt_at).getTime() <= now.getTime())
      .sort(byCreatedAt)
      .slice(0, limit)
      .map(clone);
    return Promise.resolve(out);
  }

  claimForSend(id: string, _now: Date): Promise<boolean> {
    const row = this.rows.get(id);
    if (!row || row.sync_state !== "pending") return Promise.resolve(false);
    row.sync_state = "syncing";
    return Promise.resolve(true);
  }

  markSynced(id: string, docNo: string | null, attempt: number, now: Date): Promise<void> {
    const row = this.require(id);
    row.sync_state = "synced";
    row.doc_no = docNo;
    row.attempt_count = attempt;
    row.last_error = null;
    row.synced_at = now.toISOString();
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
  ): Promise<void> {
    const row = this.require(id);
    row.sync_state = "pending";
    row.attempt_count = attempt;
    row.last_error = reason;
    row.next_attempt_at = nextAttemptAt.toISOString();
    return Promise.resolve();
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

const byCreatedAt = (a: LocalBill, b: LocalBill): number =>
  a.created_at === b.created_at
    ? a.id.localeCompare(b.id)
    : a.created_at.localeCompare(b.created_at);

/* --------------------------------------------------------- fake server --- */

export interface ServerBill {
  id: string;
  doc_no: string;
  idempotency_key: string;
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
    };
    this.byKey.set(payload.idempotency_key, bill);
    return { kind: "accepted", bill };
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
}

/** Never reaches the server at all. */
export class OfflineTransport implements Transport {
  sendBill(): Promise<SendOutcome> {
    return Promise.reject(new Error("Network request failed"));
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
}

/** Server understood the bill and refused it on its merits. */
export class RejectingTransport implements Transport {
  sendBill(): Promise<SendOutcome> {
    return Promise.resolve({
      kind: "rejected",
      reason: "HTTP 422: seller_id does not exist in this tenant",
    });
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
