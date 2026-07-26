/**
 * Local bill schema.
 *
 * MONEY AND WEIGHT ARE TEXT. This is not a style choice.
 *
 * SQLite has no NUMERIC type — it has column *affinity*, and a column declared
 * NUMERIC silently converts a bound decimal string into an IEEE-754 float:
 * '0.10' is stored as 0.1 and '10.500' as 10.5, with typeof() reporting 'real'.
 * That is project hard rule 1 ("never float, anywhere") violated invisibly, at
 * the storage layer, on data that already looked like a safe string.
 *
 * So every amount and weight lives inside payload_json, a TEXT column, exactly
 * as the decimal string the server will receive. The client never does
 * arithmetic on them; the server computes every amount.
 *
 * The table is STRICT (SQLite 3.37+), but do NOT read that as protection for
 * money. Verified in Phase 2b, against the assumption: STRICT rejects a text
 * value in an INTEGER column, yet a TEXT column silently ACCEPTS a bound
 * number and stringifies it — 0.3 is stored as "0.3", and the integer 5 is
 * stored as "5.0". So a JS float that reached this layer would be written as
 * whatever its decimal expansion happens to be ("0.30000000000000004"), with
 * no error anywhere.
 *
 * The real guarantee is therefore upstream and it is the type system: every
 * money and weight field on BillPayload is declared `string`, the client never
 * computes with them, and the store only ever binds JSON.stringify output.
 * STRICT is kept because it does protect the INTEGER columns and rejects
 * unknown types, not because it makes money safe.
 */
import type { SqlDriver } from "./driver.js";

export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS local_bills (
     id              TEXT    NOT NULL PRIMARY KEY,
     idempotency_key TEXT    NOT NULL UNIQUE,
     payload_json    TEXT    NOT NULL,
     sync_state      TEXT    NOT NULL,
     attempt_count   INTEGER NOT NULL DEFAULT 0,
     last_error      TEXT,
     created_at      TEXT    NOT NULL,
     next_attempt_at TEXT    NOT NULL,
     doc_no          TEXT,
     synced_at       TEXT,
     /*
      * A REAL COLUMN, not read out of payload_json, because the send queue is
      * ordered by it. Ordering is the one thing that decides which bill gets
      * the lower doc_no, so it must be indexable and it must be the actual
      * weighing time — see ix_local_bills_ready_dev.
      */
     device_created_at TEXT,
     void_reason       TEXT,
     void_requested_at TEXT,
     voided_at         TEXT,
     void_attempts     INTEGER NOT NULL DEFAULT 0,
     void_last_error   TEXT,
     /* When the bill first failed to send, for any reason. Set once, on the
        first bounce; never moved. The total-stuck clock. */
     first_attempt_at  TEXT,
     /* When the REACHABLE server last started refusing it (offline bounces reset
        it to null). Non-null ⟺ poisoned; the clock the red alarm is measured
        from, so a plain outage never trips it. See sync/queueHealth.ts. */
     first_server_error_at TEXT,
     CHECK (sync_state IN ('pending', 'syncing', 'synced', 'failed'))
   ) STRICT`,

  // Drives listReadyToSend. Timestamps are ISO-8601 UTC from toISOString(), a
  // fixed-width format, so lexicographic ordering IS chronological ordering.
  `CREATE INDEX IF NOT EXISTS ix_local_bills_ready
     ON local_bills (sync_state, next_attempt_at, created_at)`,

  /*
   * THE CART DRAFT (Phase 2c-3). Separate tables on purpose.
   *
   * A draft is not a bill in a different state — it is a different thing. By
   * living outside local_bills it is unreachable by every query the sync engine
   * runs (listReadyToSend, listByState, claimForSend all name local_bills), so
   * "the engine must never send a draft" is a structural fact rather than a
   * condition someone has to keep remembering in a WHERE clause.
   *
   * There is no id and no idempotency_key here: both are minted at the moment
   * of promotion. Nothing is consumed while the yard is still typing.
   */
  `CREATE TABLE IF NOT EXISTS local_draft (
     id          TEXT    NOT NULL PRIMARY KEY,
     seller_id   TEXT    NOT NULL,
     vehicle_no  TEXT,
     next_seq    INTEGER NOT NULL,
     form_json   TEXT    NOT NULL,
     updated_at  TEXT    NOT NULL
   ) STRICT`,

  // Money and weight are TEXT here for the same reason as in local_bills: a
  // NUMERIC column would silently convert '10.500' to the float 10.5.
  `CREATE TABLE IF NOT EXISTS local_draft_lines (
     id            TEXT    NOT NULL PRIMARY KEY,
     draft_id      TEXT    NOT NULL REFERENCES local_draft(id) ON DELETE CASCADE,
     seq           INTEGER NOT NULL,
     product_id    TEXT    NOT NULL,
     product_code  TEXT    NOT NULL,
     product_name  TEXT    NOT NULL,
     uom_code      TEXT    NOT NULL,
     gross_weight  TEXT    NOT NULL,
     tare_weight   TEXT    NOT NULL,
     net_weight    TEXT    NOT NULL,
     unit_price    TEXT    NOT NULL,
     list_price    TEXT    NOT NULL,
     amount        TEXT    NOT NULL,
     UNIQUE (draft_id, seq)
   ) STRICT`,

  `CREATE INDEX IF NOT EXISTS ix_draft_lines_draft
     ON local_draft_lines (draft_id, seq)`,
];

/**
 * Statements that depend on the migrated columns, so they must run AFTER
 * migrateBillColumns and never alongside SCHEMA_STATEMENTS.
 *
 * This index sat in SCHEMA_STATEMENTS for about a minute during Phase 2c-5 and
 * would have thrown on any UPGRADED device — a fresh install has the columns
 * from CREATE TABLE, so it works there and only there. Ordering is the whole
 * content of this constant's existence.
 */
const POST_MIGRATION_STATEMENTS: readonly string[] = [
  // Drives listVoidsToApply: voids still owed to the server.
  `CREATE INDEX IF NOT EXISTS ix_local_bills_void_owed
     ON local_bills (void_requested_at, voided_at, sync_state)`,

  /*
   * Backfill for bills written before device_created_at was a column. The value
   * has always been in the payload — it is what the server stores — so nothing
   * is invented here, it is only lifted somewhere it can be ordered by.
   * Idempotent: after the first run there is nothing left NULL to update.
   */
  `UPDATE local_bills
     SET device_created_at = json_extract(payload_json, '$.device_created_at')
   WHERE device_created_at IS NULL`,

  // Drives listReadyToSend. device_created_at leads the sort so a backlog
  // drains in weighing order.
  `CREATE INDEX IF NOT EXISTS ix_local_bills_ready_dev
     ON local_bills (sync_state, next_attempt_at, device_created_at)`,
];

/**
 * Columns added to local_bills AFTER the table first shipped.
 *
 * CREATE TABLE IF NOT EXISTS does nothing to a table that already exists, so a
 * device upgraded from Phase 2c-4 would keep the old five-column-shorter
 * local_bills and every void query would fail at runtime — on a database that
 * already holds the shop's unsynced bills. Fresh installs get these from the
 * CREATE above; existing ones get them from here. Both paths must end at the
 * same shape, which is what proveVoid V0 checks.
 */
const ADDED_BILL_COLUMNS: readonly { name: string; ddl: string }[] = [
  { name: "device_created_at", ddl: "device_created_at TEXT" },
  { name: "void_reason", ddl: "void_reason TEXT" },
  { name: "void_requested_at", ddl: "void_requested_at TEXT" },
  { name: "voided_at", ddl: "voided_at TEXT" },
  { name: "void_attempts", ddl: "void_attempts INTEGER NOT NULL DEFAULT 0" },
  { name: "void_last_error", ddl: "void_last_error TEXT" },
  { name: "first_attempt_at", ddl: "first_attempt_at TEXT" },
  { name: "first_server_error_at", ddl: "first_server_error_at TEXT" },
];

/**
 * Adds any missing column, by asking the database what it actually has.
 *
 * Deliberately driven by PRAGMA table_info rather than by running ALTER TABLE
 * and swallowing the "duplicate column name" error: a blanket catch would hide
 * a REAL failure (disk full, locked, STRICT rejecting the type) behind the same
 * silence as the benign case, on the one operation that decides whether the
 * shop's existing bills remain readable.
 */
async function migrateBillColumns(db: SqlDriver): Promise<string[]> {
  const existing = await db.all<{ name: string }>("PRAGMA table_info(local_bills)");
  const have = new Set(existing.map((c) => c.name));
  const added: string[] = [];
  for (const col of ADDED_BILL_COLUMNS) {
    if (have.has(col.name)) continue;
    await db.exec(`ALTER TABLE local_bills ADD COLUMN ${col.ddl}`);
    added.push(col.name);
  }
  return added;
}

/**
 * Connection pragmas. ORDER MATTERS — busy_timeout MUST be first.
 *
 * Every later statement can need a lock, including the journal_mode switch
 * itself. With the default timeout of 0 a connection does not wait, it fails
 * immediately with SQLITE_BUSY, and on a WAL database that recovery contention
 * surfaces as errcode 261 (SQLITE_BUSY_RECOVERY). Proven the hard way in
 * Phase 2b: the WAL pragma ran before busy_timeout and threw "database is
 * locked" on 2 of 3 runs.
 */
export const CONNECTION_PRAGMAS: readonly string[] = [
  "PRAGMA busy_timeout = 5000",
  "PRAGMA journal_mode = WAL",
  "PRAGMA foreign_keys = ON",
];

/**
 * Brings a fresh connection up: pragmas in order, then the schema.
 *
 * Both stores share one connection and either may be opened first, so this is
 * idempotent (every statement is IF NOT EXISTS or a pragma) and lives in one
 * place — two copies of the pragma loop would be two chances to get the
 * busy_timeout ordering wrong.
 */
export async function initConnection(db: SqlDriver): Promise<string[]> {
  for (const pragma of CONNECTION_PRAGMAS) await db.exec(pragma);
  for (const ddl of SCHEMA_STATEMENTS) await db.exec(ddl);
  const added = await migrateBillColumns(db);
  for (const ddl of POST_MIGRATION_STATEMENTS) await db.exec(ddl);
  return added;
}
