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
     CHECK (sync_state IN ('pending', 'syncing', 'synced', 'failed'))
   ) STRICT`,

  // Drives listReadyToSend. Timestamps are ISO-8601 UTC from toISOString(), a
  // fixed-width format, so lexicographic ordering IS chronological ordering.
  `CREATE INDEX IF NOT EXISTS ix_local_bills_ready
     ON local_bills (sync_state, next_attempt_at, created_at)`,
];

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
