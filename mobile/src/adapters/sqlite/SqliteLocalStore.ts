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
import type { LocalBill, LocalStore, SyncState } from "../../sync/types.js";
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
  next_attempt_at: string;
  doc_no: string | null;
  synced_at: string | null;
}

const COLUMNS =
  "id, idempotency_key, payload_json, sync_state, attempt_count, last_error," +
  " created_at, next_attempt_at, doc_no, synced_at";

/**
 * The bill INSERT, defined once and exported.
 *
 * SqliteDraftStore.promoteToBill has to perform this same insert inside its
 * transaction. Writing it out a second time there would be a column list free
 * to drift from this one — silently, since both would still compile and only
 * the promoted bills would be wrong. One definition, two call sites.
 */
export const BILL_INSERT_SQL =
  `INSERT INTO local_bills (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

export function billInsertParams(bill: LocalBill): SqlValue[] {
  return [
    bill.id,
    bill.idempotency_key,
    JSON.stringify(bill.payload),
    bill.sync_state,
    bill.attempt_count,
    bill.last_error,
    bill.created_at,
    bill.next_attempt_at,
    bill.doc_no,
    bill.synced_at,
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
    next_attempt_at: row.next_attempt_at,
    doc_no: row.doc_no,
    synced_at: row.synced_at,
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

  async listReadyToSend(now: Date, limit: number): Promise<LocalBill[]> {
    const rows = await this.db.all<BillRow>(
      `SELECT ${COLUMNS} FROM local_bills
       WHERE sync_state = 'pending' AND next_attempt_at <= ?
       ORDER BY created_at, id
       LIMIT ?`,
      [now.toISOString(), limit],
    );
    return rows.map(toBill);
  }

  /**
   * The atomic claim. One conditional UPDATE; the winner sees changes === 1 and
   * every loser sees 0. There is no read-then-write window for a competing
   * claimer to slip into, in this process or any other.
   */
  async claimForSend(id: string, now: Date): Promise<boolean> {
    const r = await this.db.run(
      `UPDATE local_bills SET sync_state = 'syncing', next_attempt_at = ?
       WHERE id = ? AND sync_state = 'pending'`,
      [now.toISOString(), id],
    );
    return r.changes === 1;
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
           last_error = NULL, synced_at = ?
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
  ): Promise<void> {
    await this.db.run(
      `UPDATE local_bills
       SET sync_state = 'pending', attempt_count = ?, last_error = ?,
           next_attempt_at = ?
       WHERE id = ?`,
      [attempt, reason, nextAttemptAt.toISOString(), id],
    );
  }

  /**
   * Startup sweep. RETURNING makes it one statement, so the set of recovered
   * ids is exactly the set that changed — no second SELECT that another writer
   * could invalidate in between.
   */
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
