/**
 * Production LocalStore over SQLite. Implements the exact interface the sync
 * engine already depends on — the engine was not changed to fit the database.
 *
 * EVERY method here is exactly ONE SQL statement. That is deliberate:
 *
 *  - SQLite wraps every statement in an implicit transaction, so a single
 *    conditional UPDATE is already atomic; the claim cannot half-happen.
 *  - Nothing in the bill lifecycle needs to span statements, so none of it
 *    depends on explicit transaction handling at all.
 *
 * The claim's atomicity therefore rests on one thing: UPDATE ... WHERE
 * sync_state = 'pending' reporting an exact rowcount. Proven under four real
 * OS threads on one database file in src/proof/sqliteProof.ts.
 *
 * AMENDED IN PHASE 2c-3. This header used to conclude "and no mutex is
 * needed". That was true only while every operation in the whole app was a
 * single statement. The cart's draft -> bill promotion is genuinely
 * multi-statement (insert the bill, clear the draft, indivisibly), so the
 * driver now serialises the connection and offers `transaction()`. The
 * statements below are unchanged and still need nothing from it — but the
 * blanket claim was no longer true and would have misled the next reader into
 * adding a second statement to one of these methods believing it was safe.
 * See adapters/sqlite/mutex.ts.
 */
import type { LocalBill, LocalStore, QueueSnapshot, SyncState } from "../../sync/types.js";
import type { SqlDriver, SqlValue } from "./driver.js";
import { initConnection } from "./schema.js";

interface BillRow {
  id: string;
  idempotency_key: string;
  payload_json: string;
  sync_state: string;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  device_created_at: string;
  next_attempt_at: string;
  doc_no: string | null;
  synced_at: string | null;
  void_reason: string | null;
  void_requested_at: string | null;
  voided_at: string | null;
  void_attempts: number;
  void_last_error: string | null;
  first_attempt_at: string | null;
  first_server_error_at: string | null;
  server_error_attempts: number;
  master_data_missing_at: string | null;
  master_data_code: string | null;
}

const COLUMNS =
  "id, idempotency_key, payload_json, sync_state, attempt_count, last_error," +
  " created_at, device_created_at, next_attempt_at, doc_no, synced_at," +
  " void_reason, void_requested_at, voided_at, void_attempts, void_last_error," +
  " first_attempt_at, first_server_error_at, server_error_attempts," +
  " master_data_missing_at, master_data_code";

/**
 * The head-of-line queue excludes parked bills, in ONE place, reused by every
 * query that defines "queued to send".
 *
 * This is the deliberate ordering trade, and it is the only place it happens:
 * a parked bill is passed by bills weighed after it, so it will take a HIGHER
 * doc_no when it finally syncs. That is a real weakening of weighing order — see
 * lessons/doc-no-is-arrival-order-not-event-time.md — accepted because the
 * alternative is one un-priced product stopping the whole yard from syncing, and
 * because the bill is parked VISIBLY rather than silently skipped, which is the
 * distinction lessons/queue-jam-must-be-visible.md actually draws.
 */
const QUEUED = "sync_state = 'pending' AND master_data_missing_at IS NULL";

/**
 * The bill INSERT, defined once and exported.
 *
 * SqliteDraftStore.promoteToBill has to perform this same insert inside its
 * transaction. Writing it out a second time there would be a column list free
 * to drift from this one — silently, since both would still compile and only
 * the promoted bills would be wrong. One definition, two call sites.
 */
export const BILL_INSERT_SQL =
  `INSERT INTO local_bills (${COLUMNS})` +
  " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

export function billInsertParams(bill: LocalBill): SqlValue[] {
  return [
    bill.id,
    bill.idempotency_key,
    JSON.stringify(bill.payload),
    bill.sync_state,
    bill.attempt_count,
    bill.last_error,
    bill.created_at,
    bill.device_created_at,
    bill.next_attempt_at,
    bill.doc_no,
    bill.synced_at,
    bill.void_reason,
    bill.void_requested_at,
    bill.voided_at,
    bill.void_attempts,
    bill.void_last_error,
    bill.first_attempt_at,
    bill.first_server_error_at,
    bill.server_error_attempts,
    bill.master_data_missing_at,
    bill.master_data_code,
  ];
}

function toBill(row: BillRow): LocalBill {
  return {
    id: row.id,
    idempotency_key: row.idempotency_key,
    payload: JSON.parse(row.payload_json) as LocalBill["payload"],
    sync_state: row.sync_state as SyncState,
    attempt_count: row.attempt_count,
    last_error: row.last_error,
    created_at: row.created_at,
    // Backfilled rows can still be null if a legacy payload lacked the field;
    // fall back to created_at so ordering never sees a null and silently sorts
    // that bill to one end of the queue.
    device_created_at: row.device_created_at ?? row.created_at,
    next_attempt_at: row.next_attempt_at,
    doc_no: row.doc_no,
    synced_at: row.synced_at,
    void_reason: row.void_reason,
    void_requested_at: row.void_requested_at,
    voided_at: row.voided_at,
    void_attempts: row.void_attempts,
    void_last_error: row.void_last_error,
    first_attempt_at: row.first_attempt_at,
    first_server_error_at: row.first_server_error_at,
    server_error_attempts: row.server_error_attempts,
    master_data_missing_at: row.master_data_missing_at,
    master_data_code: row.master_data_code,
  };
}

export class SqliteLocalStore implements LocalStore {
  private constructor(private readonly db: SqlDriver) {}

  /** Opens (or reopens) the store and ensures the schema exists. */
  static async open(db: SqlDriver): Promise<SqliteLocalStore> {
    await initConnection(db);
    return new SqliteLocalStore(db);
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  async putBill(bill: LocalBill): Promise<void> {
    // Plain INSERT, not INSERT OR REPLACE: a duplicate bill id is a bug that
    // must surface, never silently overwrite a bill that may already be synced.
    await this.db.run(BILL_INSERT_SQL, billInsertParams(bill));
  }

  async getBill(id: string): Promise<LocalBill | null> {
    const rows = await this.db.all<BillRow>(
      `SELECT ${COLUMNS} FROM local_bills WHERE id = ?`,
      [id],
    );
    const row = rows[0];
    return row === undefined ? null : toBill(row);
  }

  async listByState(state: SyncState): Promise<LocalBill[]> {
    const rows = await this.db.all<BillRow>(
      `SELECT ${COLUMNS} FROM local_bills WHERE sync_state = ?
       ORDER BY created_at, id`,
      [state],
    );
    return rows.map(toBill);
  }

  /**
   * ORDER BY device_created_at: the bill weighed FIRST is sent first, so within
   * any backlog it receives the lower doc_no.
   *
   * Ordering by created_at (the row's own timestamp) looked equivalent — both
   * are written from the same clock in the same breath — but it is the wrong
   * field to name. The queue's contract is "weighing order", and
   * device_created_at is the field that means that; created_at only happens to
   * agree today. Ordering on the field that carries the meaning is what keeps
   * this correct if the two ever diverge.
   *
   * `id` remains the tiebreaker so the order is total, never arbitrary, when
   * two bills share a timestamp.
   */
  async listReadyToSend(now: Date, limit: number): Promise<LocalBill[]> {
    const rows = await this.db.all<BillRow>(
      `SELECT ${COLUMNS} FROM local_bills
       WHERE ${QUEUED} AND next_attempt_at <= ?
       ORDER BY device_created_at, created_at, id
       LIMIT ?`,
      [now.toISOString(), limit],
    );
    return rows.map(toBill);
  }

  /** Every pending bill in weighing order, INCLUDING ones still in backoff. */
  async listPendingOldestFirst(limit: number): Promise<LocalBill[]> {
    const rows = await this.db.all<BillRow>(
      `SELECT ${COLUMNS} FROM local_bills
       WHERE ${QUEUED}
       ORDER BY device_created_at, created_at, id
       LIMIT ?`,
      [limit],
    );
    return rows.map(toBill);
  }

  /**
   * Drop the retry backoff on every pending bill.
   *
   * Called after a send SUCCEEDS. The backoff exists to stop us hammering a
   * server we cannot reach; the moment one bill gets through we have direct
   * evidence the server IS reachable, so every other bill's delay was computed
   * against a world that no longer exists.
   *
   * This is the other half of the ordering fix, and on real device evidence it
   * was the half that actually mattered: an older bill that had failed a few
   * times sat with next_attempt_at up to 30s out, so listReadyToSend could not
   * see it at all, while a bill weighed 73 seconds LATER was sent immediately
   * and took the lower number. Sorting cannot rescue a bill that is not in the
   * candidate set.
   */
  async clearBackoffForPending(now: Date): Promise<number> {
    const r = await this.db.run(
      // Parked bills are excluded: their next_attempt_at is a slow master-data
      // cadence, not a network backoff, and a reachable server says nothing about
      // whether the office has added the price yet.
      `UPDATE local_bills SET next_attempt_at = ?
       WHERE ${QUEUED} AND next_attempt_at > ?`,
      [now.toISOString(), now.toISOString()],
    );
    return r.changes;
  }

  /**
   * The atomic claim. One conditional UPDATE; the winner sees changes === 1 and
   * every loser sees 0. There is no read-then-write window for a competing
   * claimer to slip into, in this process or any other.
   */
  async claimForSend(id: string, now: Date): Promise<boolean> {
    // QUEUED, not just 'pending': a bill parked on master data must not be
    // claimable, or a concurrent pass could send it while the UI shows it as
    // waiting on the office.
    const r = await this.db.run(
      `UPDATE local_bills SET sync_state = 'syncing', next_attempt_at = ?
       WHERE id = ? AND ${QUEUED}`,
      [now.toISOString(), id],
    );
    return r.changes === 1;
  }

  /* --------------------------------------------------- master-data park -- */

  /**
   * Park a bill the server refused for a RESOLVABLE reason.
   *
   * sync_state goes back to 'pending' — the bill is still owed and nothing may
   * drop it — but master_data_missing_at takes it out of the head-of-line queue.
   * The poison clocks are CLEARED: this is not a server fault and must never
   * raise the "call support" alarm. It is a "call the office" state.
   */
  async markMasterDataMissing(
    id: string,
    code: string,
    reason: string,
    attempt: number,
    retryAt: Date,
    now: Date,
  ): Promise<void> {
    await this.db.run(
      `UPDATE local_bills
       SET sync_state = 'pending', attempt_count = ?, last_error = ?,
           master_data_missing_at = ?, master_data_code = ?,
           next_attempt_at = ?,
           first_attempt_at = NULL, first_server_error_at = NULL,
           server_error_attempts = 0
       WHERE id = ?`,
      [attempt, reason, now.toISOString(), code, retryAt.toISOString(), id],
    );
  }

  /* -------------------------------------------------------- session end -- */

  /**
   * The send bounced on a 401. The session ended; the bill is untouched.
   *
   * sync_state goes back to 'pending' — still owed, still in the head-of-line
   * queue in weighing order, so nothing is reordered by an expiry — and the two
   * POISON columns are CLEARED. That is the whole point of this being its own
   * statement: while a 401 was classified `unavailable, reachable: true`, every
   * bounce stamped first_server_error_at and incremented server_error_attempts,
   * so an expired session with bills behind it reached POISON_ALARM_ATTEMPTS and
   * raised the red "ติดต่อฝ่ายสนับสนุน" alarm. There is nothing for support to do.
   *
   * first_attempt_at is still stamped with COALESCE: the bill genuinely has been
   * unable to send since then, which is what that clock measures. Only the
   * poison judgement is off the table.
   */
  async markSessionExpired(
    id: string,
    reason: string,
    attempt: number,
    retryAt: Date,
    now: Date,
  ): Promise<void> {
    await this.db.run(
      `UPDATE local_bills
       SET sync_state = 'pending', attempt_count = ?, last_error = ?,
           next_attempt_at = ?,
           first_attempt_at = COALESCE(first_attempt_at, ?),
           first_server_error_at = NULL, server_error_attempts = 0
       WHERE id = ?`,
      [attempt, reason, retryAt.toISOString(), now.toISOString(), id],
    );
  }

  async listMasterDataBlocked(limit: number): Promise<LocalBill[]> {
    const rows = await this.db.all<BillRow>(
      `SELECT ${COLUMNS} FROM local_bills
       WHERE master_data_missing_at IS NOT NULL AND sync_state = 'pending'
       ORDER BY device_created_at, created_at, id
       LIMIT ?`,
      [limit],
    );
    return rows.map(toBill);
  }

  /**
   * Un-park. `all` is the operator pressing retry — try everything right now,
   * because they have just added the price and want to see it clear. Otherwise
   * only bills whose slow cadence is due.
   *
   * next_attempt_at is reset to now so a released bill is immediately eligible;
   * it rejoins the queue at its WEIGHING position, so if it is the oldest it goes
   * straight back to the head. If the price is still missing it simply parks
   * again on that attempt, without having blocked anything.
   *
   * last_error IS CLEARED HERE, and leaving it out was a real defect found on
   * device (Phase 2c-6). This statement retires the parked state, so the failure
   * text that state produced — `HTTP 424: {...json...}` — stops describing the
   * bill the instant it runs. Keeping it made this a HALF-UPDATE: for the length
   * of the retry the row said "not parked" and "here is why it was parked" at the
   * same time, and the UI, seeing no parked flag, fell back to rendering that raw
   * diagnostic in red. Compare markSynced below, which has always cleared
   * last_error alongside the columns that justified it. The rule is that no
   * transition may leave behind an error describing a state it just left.
   */
  async releaseMasterDataBlocked(now: Date, all: boolean): Promise<number> {
    const nowIso = now.toISOString();
    const due = all ? "" : " AND next_attempt_at <= ?";
    const params: SqlValue[] = all ? [nowIso] : [nowIso, nowIso];
    const r = await this.db.run(
      `UPDATE local_bills
       SET master_data_missing_at = NULL, master_data_code = NULL,
           last_error = NULL,
           next_attempt_at = ?
       WHERE master_data_missing_at IS NOT NULL AND sync_state = 'pending'${due}`,
      params,
    );
    return r.changes;
  }

  async markSynced(
    id: string,
    docNo: string | null,
    attempt: number,
    now: Date,
  ): Promise<void> {
    await this.db.run(
      `UPDATE local_bills
       SET sync_state = 'synced', doc_no = ?, attempt_count = ?,
           last_error = NULL, synced_at = ?,
           first_attempt_at = NULL, first_server_error_at = NULL,
           server_error_attempts = 0,
           master_data_missing_at = NULL, master_data_code = NULL
       WHERE id = ?`,
      [docNo, attempt, now.toISOString(), id],
    );
  }

  async markFailed(id: string, reason: string, attempt: number, now: Date): Promise<void> {
    await this.db.run(
      `UPDATE local_bills
       SET sync_state = 'failed', attempt_count = ?, last_error = ?,
           next_attempt_at = ?
       WHERE id = ?`,
      [attempt, reason, now.toISOString(), id],
    );
  }

  async markPendingAgain(
    id: string,
    reason: string,
    attempt: number,
    nextAttemptAt: Date,
    now: Date,
    reachable: boolean,
  ): Promise<void> {
    // first_attempt_at is stamped with COALESCE, so it records the FIRST bounce
    // of any kind and never moves — the total-stuck clock.
    //
    // first_server_error_at is the POISON clock and it is conditional: when the
    // server answered (reachable), COALESCE stamps it once and lets it run; when
    // the bounce was transport-level (offline), it is RESET to null. So it is
    // non-null exactly while the reachable server has been refusing this bill
    // continuously — an offline spell in the middle wipes it and the poison timer
    // starts fresh only if the server refuses again. That is what stops a long
    // outage (all transport-level) from ever tripping the red alarm.
    //
    // server_error_attempts moves on the SAME condition and for the same reason:
    // +1 while the server is answering-and-failing, reset to 0 the moment a
    // bounce is transport-level. It is the count-based trigger for the same red
    // alarm, so a server that refuses this bill quickly surfaces after N
    // refusals instead of waiting out the wall clock. Keeping both on one CASE
    // means they can never disagree about whether the server answered.
    const nowIso = now.toISOString();
    const reachableFlag = reachable ? 1 : 0;
    await this.db.run(
      `UPDATE local_bills
       SET sync_state = 'pending', attempt_count = ?, last_error = ?,
           next_attempt_at = ?,
           first_attempt_at = COALESCE(first_attempt_at, ?),
           first_server_error_at =
             CASE WHEN ? = 1 THEN COALESCE(first_server_error_at, ?) ELSE NULL END,
           server_error_attempts =
             CASE WHEN ? = 1 THEN server_error_attempts + 1 ELSE 0 END
       WHERE id = ?`,
      [
        attempt,
        reason,
        nextAttemptAt.toISOString(),
        nowIso,
        reachableFlag,
        nowIso,
        reachableFlag,
        id,
      ],
    );
  }

  /**
   * Two reads, no write: how many bills are pending and which one is the head.
   *
   * The head is chosen by the SAME order the engine sends in
   * (device_created_at, created_at, id), so the bill reported as the blocker is
   * exactly the bill the engine is stuck on — the UI cannot point at a different
   * row than the one actually holding up the queue.
   */
  async pendingQueueSnapshot(): Promise<QueueSnapshot> {
    const counts = await this.db.all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM local_bills WHERE ${QUEUED}`,
    );
    const pendingCount = counts[0]?.n ?? 0;
    // Parked bills are counted separately and NEVER as "behind": they are not
    // waiting their turn in a queue, they are waiting on the office, and folding
    // them into the queue depth would report a backlog no network can drain.
    const blocked = await this.db.all<{ n: number }>(
      "SELECT COUNT(*) AS n FROM local_bills" +
        " WHERE master_data_missing_at IS NOT NULL AND sync_state = 'pending'",
    );
    const rows = await this.db.all<BillRow>(
      `SELECT ${COLUMNS} FROM local_bills
       WHERE ${QUEUED}
       ORDER BY device_created_at, created_at, id
       LIMIT 1`,
    );
    const head = rows[0];
    return {
      pendingCount,
      masterDataBlockedCount: blocked[0]?.n ?? 0,
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
    };
  }

  /**
   * Startup sweep. RETURNING makes it one statement, so the set of recovered
   * ids is exactly the set that changed — no second SELECT that another writer
   * could invalidate in between.
   */
  /* ---------------------------------------------------------------- void -- */

  /**
   * Records the owner's intent, once.
   *
   * `WHERE void_requested_at IS NULL` is what makes a second press harmless:
   * the row changes zero times and the ORIGINAL reason survives. Without it a
   * double-tap would quietly rewrite the reason on a real-money reversal, and
   * the second reason might be blank-ish, hurried, or simply not what the owner
   * meant the first time.
   */
  async requestVoid(id: string, reason: string, now: Date): Promise<boolean> {
    const r = await this.db.run(
      `UPDATE local_bills SET void_reason = ?, void_requested_at = ?
       WHERE id = ? AND void_requested_at IS NULL`,
      [reason, now.toISOString(), id],
    );
    return r.changes === 1;
  }

  /**
   * Voids still owed to the server.
   *
   * `sync_state = 'synced'` is the sequencing rule in one clause: a bill the
   * server has never seen is NOT eligible, so it syncs through the normal path
   * first and acquires its doc_no. The void then applies to a bill that exists,
   * which is what lets the owner see it was created and then cancelled instead
   * of it silently never existing.
   */
  async listVoidsToApply(limit: number): Promise<LocalBill[]> {
    const rows = await this.db.all<BillRow>(
      `SELECT ${COLUMNS} FROM local_bills
       WHERE void_requested_at IS NOT NULL AND voided_at IS NULL
         AND sync_state = 'synced' AND doc_no IS NOT NULL
       ORDER BY void_requested_at, id
       LIMIT ?`,
      [limit],
    );
    return rows.map(toBill);
  }

  async markVoidApplied(id: string, attempt: number, now: Date): Promise<void> {
    await this.db.run(
      `UPDATE local_bills
       SET voided_at = ?, void_attempts = ?, void_last_error = NULL
       WHERE id = ?`,
      [now.toISOString(), attempt, id],
    );
  }

  /**
   * A failed attempt. Note what is NOT written: void_requested_at is untouched,
   * so the void stays owed no matter how many attempts fail. There is no
   * attempt cap and no terminal "void failed" state that would drop it —
   * the same reasoning as an offline bill never being marked failed.
   */
  async markVoidAttemptFailed(id: string, reason: string, attempt: number): Promise<void> {
    await this.db.run(
      `UPDATE local_bills SET void_attempts = ?, void_last_error = ? WHERE id = ?`,
      [attempt, reason, id],
    );
  }

  async resetSyncingToPending(now: Date): Promise<string[]> {
    const rows = await this.db.all<{ id: string }>(
      `UPDATE local_bills
       SET sync_state = 'pending', last_error = 'recovered from interrupted send',
           next_attempt_at = ?
       WHERE sync_state = 'syncing'
       RETURNING id`,
      [now.toISOString()],
    );
    return rows.map((r) => r.id).sort();
  }
}
