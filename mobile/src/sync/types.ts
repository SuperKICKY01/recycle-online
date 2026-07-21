/**
 * Sync layer contracts. PURE TypeScript — no React Native, no Expo, no node
 * builtins. Everything the engine touches is an interface defined here, so the
 * engine runs identically on a device, in a node test, or anywhere else.
 *
 * Money and weight are decimal STRINGS end to end (project hard rule 1: never
 * float, anywhere — DB, API, or client math). The client never does arithmetic
 * on them; the server computes every amount.
 */

export type SyncState = "pending" | "syncing" | "synced" | "failed";

export interface BillItemPayload {
  id: string;
  product_id: string;
  line_no: number;
  gross_weight: string;
  tare_weight: string;
  net_weight: string;
  unit_price: string;
  list_price: string;
}

/** Exactly the body POST /bills accepts (server contract, Phase 1c). */
export interface BillPayload {
  id: string;
  seller_id: string;
  vehicle_no: string | null;
  device_created_at: string;
  idempotency_key: string;
  items: BillItemPayload[];
  total_amount: string | null;
}

export interface LocalBill {
  /** Client-generated UUID; the SAME id the server stores (hard rule 3). */
  id: string;
  /**
   * Generated ONCE at creation and never regenerated — not on retry, not after
   * a crash, not after a lost response. Regenerating it would defeat the
   * server's dedup and create a duplicate bill for real money. It is a random
   * value frozen at birth, never derived from payload contents, so nothing
   * about the bill can change it.
   */
  idempotency_key: string;
  payload: BillPayload;
  sync_state: SyncState;
  attempt_count: number;
  /** Text of the most recent failure. Cleared on success. Never hidden from the UI. */
  last_error: string | null;
  created_at: string;
  /** Earliest time this bill may be sent again (backoff gate). */
  next_attempt_at: string;
  /** Assigned by the server at sync time; null while the bill is offline. */
  doc_no: string | null;
  synced_at: string | null;
}

/**
 * The result of one send attempt.
 *
 * The split between `rejected` and `unavailable` is the whole point of this
 * type: a failure to REACH a verdict is not a negative verdict. `unavailable`
 * means we do not know whether the server committed — retry with the same
 * idempotency key. `rejected` means the server understood the bill and refused
 * it; retrying forever would never help, so it becomes visibly `failed`.
 */
export type SendOutcome =
  | { kind: "accepted"; doc_no: string | null }
  | { kind: "duplicate"; doc_no: string | null }
  | { kind: "rejected"; reason: string }
  | { kind: "unavailable"; reason: string };

export interface Transport {
  /**
   * May reject (throw). A throw carries NO information about whether the
   * server committed, so the engine treats it as `unavailable`, never as a
   * rejection.
   */
  sendBill(bill: LocalBill): Promise<SendOutcome>;
}

export interface Clock {
  now(): Date;
  sleep(ms: number): Promise<void>;
}

/**
 * UUID source. Injected rather than calling crypto.randomUUID() directly: that
 * would tie the engine to whatever the JS runtime happens to provide, and which
 * UUID API exists under Hermes on a device is UNVERIFIED here (Phase 2b).
 * Injecting it also makes ids deterministic in the proof.
 */
export interface IdSource {
  newId(): string;
}

export interface LocalStore {
  /** Local-first write. Once this resolves, the bill is saved from the user's view. */
  putBill(bill: LocalBill): Promise<void>;
  getBill(id: string): Promise<LocalBill | null>;
  listByState(state: SyncState): Promise<LocalBill[]>;
  /** Pending bills whose backoff has elapsed, oldest first. */
  listReadyToSend(now: Date, limit: number): Promise<LocalBill[]>;
  /**
   * Atomically move pending -> syncing. Returns false if the row was not
   * pending (someone else already claimed it). This is the durable in-flight
   * guard; an in-memory set alone dies with the process.
   */
  claimForSend(id: string, now: Date): Promise<boolean>;
  markSynced(id: string, docNo: string | null, attempt: number, now: Date): Promise<void>;
  markFailed(id: string, reason: string, attempt: number, now: Date): Promise<void>;
  markPendingAgain(
    id: string,
    reason: string,
    attempt: number,
    nextAttemptAt: Date,
  ): Promise<void>;
  /**
   * Startup recovery: every row stranded in `syncing` by a crash goes back to
   * pending. Returns the ids that were recovered. Never silent.
   */
  resetSyncingToPending(now: Date): Promise<string[]>;
}
