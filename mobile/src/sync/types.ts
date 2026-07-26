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
  /**
   * When the load was WEIGHED, per the device clock. The send queue is ordered
   * by this so a backlog reaches the server in the order the loads were bought.
   *
   * Same value as payload.device_created_at; held here as its own field so it
   * can be indexed and sorted on. Note it is the DEVICE's clock and therefore
   * untrusted for anything but ordering our own queue — real skew of ~3s was
   * measured on the test iPhone. Reports key on server_received_at.
   */
  device_created_at: string;
  /** Earliest time this bill may be sent again (backoff gate). */
  next_attempt_at: string;
  /**
   * When this bill was FIRST attempted and bounced, for ANY reason (offline or
   * server error) — set once, on the first failed send, never moved after
   * (COALESCE, not assignment), cleared when the bill finally syncs. It measures
   * total time unable to send. `next_attempt_at` keeps sliding forward with
   * every backoff and `created_at` is the weighing time, so neither answers
   * "how long has this been unable to send"; this does. On its own, though, it
   * cannot tell a long outage from a poisoned bill — both bounce for minutes —
   * which is exactly why first_server_error_at exists alongside it.
   */
  first_attempt_at: string | null;
  /**
   * When the head last STARTED failing against a REACHABLE server — the server
   * answered (an HTTP status came back), the network is fine, yet the bill still
   * did not go. Stamped once with COALESCE while that holds, and RESET to null
   * the moment a bounce is transport-level instead (offline again). So it is
   * non-null exactly when "the server is reachable and has been refusing this
   * bill continuously since this instant" — both the fact and its duration, in
   * one field.
   *
   * This is the poison signal. A bill offline for hours never sets it (every
   * bounce is transport-level), so a long outage stays calm amber; a bill the
   * reachable server keeps erroring on sets it and, once it persists past
   * POISON_ALARM_MS, raises the loud red alarm. See sync/queueHealth.ts.
   */
  first_server_error_at: string | null;
  /** Assigned by the server at sync time; null while the bill is offline. */
  doc_no: string | null;
  synced_at: string | null;

  /* ------------------------------------------------------------- void ---- */
  /*
   * Voiding is modelled as a DURABLE INTENT plus a separate confirmation,
   * exactly like the bill itself, and for the same reason: the owner may void a
   * bill that the server has never seen.
   *
   *   void_requested_at  the owner pressed confirm. Written once, NEVER
   *                      cleared, and it is what the UI shows as ยกเลิกแล้ว —
   *                      so the void is visible immediately, offline included.
   *   voided_at          the SERVER confirmed it. Until then the void is still
   *                      owed, and nothing may drop it.
   *
   * Keeping these two apart is what makes a crash survivable: the intent is on
   * disk before any network call, so a restart simply finds it again. There is
   * no state in which the owner voided a bill and the app has forgotten.
   */
  void_reason: string | null;
  void_requested_at: string | null;
  voided_at: string | null;
  void_attempts: number;
  void_last_error: string | null;
}

/** Locally voided the moment the owner confirms, server round trip or not. */
export const isVoided = (bill: LocalBill): boolean => bill.void_requested_at !== null;

/** The void has been confirmed by the server and owes nothing further. */
export const isVoidSettled = (bill: LocalBill): boolean => bill.voided_at !== null;

/**
 * The result of one send attempt.
 *
 * The split between `rejected` and `unavailable` is the whole point of this
 * type: a failure to REACH a verdict is not a negative verdict. `unavailable`
 * means we do not know whether the server committed — retry with the same
 * idempotency key. `rejected` means the server understood the bill and refused
 * it; retrying forever would never help, so it becomes visibly `failed`.
 *
 * Within `unavailable`, `reachable` records whether the SERVER ANSWERED at all:
 * true for an HTTP status we could not use (5xx/401/403 — the network works, the
 * server erred or refused), false for a transport-level failure (timeout, DNS,
 * no connection, no token — we never got a word back). Both retry forever; the
 * flag is not about retrying. It is what lets the UI tell an offline yard ("wait
 * it out", amber) apart from a head bill the reachable server keeps failing
 * ("call support", red). See sync/queueHealth.ts.
 */
export type SendOutcome =
  | { kind: "accepted"; doc_no: string | null }
  | { kind: "duplicate"; doc_no: string | null }
  | { kind: "rejected"; reason: string }
  | { kind: "unavailable"; reason: string; reachable: boolean };

/**
 * The result of one void attempt. Same shape and same discipline as
 * SendOutcome — and `already_voided` is the void's `duplicate`.
 *
 * The server answers a repeat void with 409. That is SUCCESS, not an error:
 * the desired state (this bill is void) already holds. Treating it as a failure
 * would retry forever and surface a scary red state for a bill that is exactly
 * as the owner wanted it. This is the only thing that makes a lost void
 * response safe to retry.
 */
export type VoidOutcome =
  | { kind: "voided"; doc_no: string | null }
  | { kind: "already_voided"; doc_no: string | null }
  | { kind: "rejected"; reason: string }
  | { kind: "unavailable"; reason: string };

export interface Transport {
  /**
   * May reject (throw). A throw carries NO information about whether the
   * server committed, so the engine treats it as `unavailable`, never as a
   * rejection.
   */
  sendBill(bill: LocalBill): Promise<SendOutcome>;
  /**
   * Void an ALREADY-SYNCED bill. The engine never calls this for a bill with no
   * doc_no — an unsynced bill must reach the server first, so that the owner
   * can see it was created and then voided rather than having it vanish.
   */
  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome>;
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

/** The bill at the front of the send queue, with what the UI needs to judge it. */
export interface QueueHead {
  id: string;
  doc_no: string | null;
  /** Failed send attempts so far. 0 means it has not been tried yet. */
  attempts: number;
  /** When it first failed for any reason; null if never attempted. Total-stuck clock. */
  first_attempt_at: string | null;
  /**
   * When the reachable server last started refusing it; null if the last bounce
   * was offline (or it never failed). Non-null ⟺ poisoned, and the poison clock.
   */
  first_server_error_at: string | null;
  last_error: string | null;
}

/** A snapshot of the pending send queue for health assessment. */
export interface QueueSnapshot {
  pendingCount: number;
  head: QueueHead | null;
}

export interface LocalStore {
  /** Local-first write. Once this resolves, the bill is saved from the user's view. */
  putBill(bill: LocalBill): Promise<void>;
  getBill(id: string): Promise<LocalBill | null>;
  listByState(state: SyncState): Promise<LocalBill[]>;
  /**
   * Pending bills whose backoff has elapsed, ordered by device_created_at —
   * WEIGHING order, so a backlog drains in the order the loads were bought and
   * the earlier bill takes the lower doc_no.
   */
  listReadyToSend(now: Date, limit: number): Promise<LocalBill[]>;
  /**
   * Clear the retry backoff on all pending bills; returns how many were freed.
   * Called once a send succeeds, because that success proves the server is
   * reachable and every outstanding backoff was computed against a stale view.
   */
  clearBackoffForPending(now: Date): Promise<number>;
  /**
   * ALL pending bills in weighing order, backoff ignored.
   *
   * The sender needs to see the bill it is NOT allowed to skip. Filtering by
   * backoff first hides exactly that bill, which is how a newer load overtook
   * an older one and took the lower doc_no.
   */
  listPendingOldestFirst(limit: number): Promise<LocalBill[]>;
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
    now: Date,
    /**
     * Did the server ANSWER this failed attempt? true stamps
     * first_server_error_at (reachable-but-refusing → the poison clock runs);
     * false clears it (offline → no poison clock). This is the one input that
     * lets the UI tell a poisoned head from a plain outage.
     */
    reachable: boolean,
  ): Promise<void>;
  /**
   * A cheap read of the send queue's health for the UI: how many bills are
   * pending and, if any, the head — the exact bill the engine will try next and
   * refuse to send past. Keyed on the SAME ordering the engine blocks on, so the
   * bill the UI marks as the blocker is the bill actually blocking.
   */
  pendingQueueSnapshot(): Promise<QueueSnapshot>;
  /**
   * Startup recovery: every row stranded in `syncing` by a crash goes back to
   * pending. Returns the ids that were recovered. Never silent.
   */
  resetSyncingToPending(now: Date): Promise<string[]>;

  /* ------------------------------------------------------------- void ---- */
  /**
   * Record the owner's intent to void. Returns false if this bill was already
   * void-requested, WITHOUT overwriting the original reason — the first reason
   * given is the true one, and a second press must not silently replace it.
   */
  requestVoid(id: string, reason: string, now: Date): Promise<boolean>;
  /**
   * Bills owing a void to the server: void requested, not yet confirmed, and
   * already synced so there is something on the server to void.
   */
  listVoidsToApply(limit: number): Promise<LocalBill[]>;
  markVoidApplied(id: string, attempt: number, now: Date): Promise<void>;
  markVoidAttemptFailed(id: string, reason: string, attempt: number): Promise<void>;
}
