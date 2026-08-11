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
import type { SqlDriver, SqlTx } from "./driver.js";

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
     /* Non-null ⟺ the server REFUSED this void on identity grounds (403). The
        request itself stays on the row; this takes it out of listVoidsToApply so
        nothing re-asks, and tells the card to stop claiming the bill is
        cancelled when the server still holds it live. */
     void_refused_at   TEXT,
     void_refused_code TEXT,
     /* When the bill first failed to send, for any reason. Set once, on the
        first bounce; never moved. The total-stuck clock. */
     first_attempt_at  TEXT,
     /* When the REACHABLE server last started refusing it (offline bounces reset
        it to null). Non-null ⟺ poisoned; the clock the red alarm is measured
        from, so a plain outage never trips it. See sync/queueHealth.ts. */
     first_server_error_at TEXT,
     /* Consecutive failures against a REACHABLE server: +1 on a server-answered
        bounce, reset to 0 by a transport-level one or a success. The COUNT
        trigger for the same red alarm, so a server refusing this bill quickly is
        surfaced after N refusals rather than only after the wall-clock
        threshold. Deliberately NOT attempt_count, which includes offline
        bounces and never resets. */
     server_error_attempts INTEGER NOT NULL DEFAULT 0,
     /* Non-null ⟺ parked waiting on master data the office has not set up. The
        bill stays 'pending' (still owed) but is excluded from the head-of-line
        queue so it cannot dam the bills behind it. Deliberately NOT a new
        sync_state value: the CHECK below is baked into CREATE TABLE and SQLite
        cannot alter a CHECK without rebuilding the table — on a database already
        holding the shop's unsynced bills. */
     master_data_missing_at TEXT,
     master_data_code       TEXT,
     /* WHOSE BILL THIS IS: the pair, and both NULLABLE.
        Nullable is not a preference. ALTER TABLE ADD COLUMN ... NOT NULL with no
        default is a hard engine error on a table that already holds rows, which
        every upgraded handset does — and NULL is the value that means UNKNOWN,
        which rows written before ownership existed must be able to carry. An
        unknown owner is treated as a MISMATCH and parks; it is never assumed to
        belong to whoever is signed in, because a guess here manufactures false
        provenance that reads exactly like true provenance. */
     owner_tenant_id TEXT,
     owner_user_id   TEXT,
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
     updated_at  TEXT    NOT NULL,
     /* Fetch time of the master data available when this draft was STARTED —
        the oldest data any line on it could have been priced from. Carried to
        the bill at promotion. See master/freshness.ts. */
     master_as_of TEXT,
     /* THE SAME PAIR AS local_bills, and for a reason that is not symmetry.
        SUPERSEDED — this comment previously read that a draft BECOMES a bill
        through promoteToBill, so a draft carrying no owner produces a bill
        carrying none. THE BILL DOES NOT INHERIT THIS PAIR. It is stamped from
        the identity read live at the moment of saving, because the pair here
        records who OPENED the cart and a bill must be owned by whoever CLOSED
        it and handed over the cash — across a shift change those are different
        people, and the server records the sender as a bill's creator.
        What these two columns are for is therefore the draft in its own right:
        a cart abandoned half-typed still says whose it was. Nullable for the
        same two reasons as on local_bills. See SqliteDraftStore.promoteToBill. */
     owner_tenant_id TEXT,
     owner_user_id   TEXT
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

  /*
   * THE MASTER-DATA CACHE (Phase 2c-8). Products and sellers, so the yard can
   * open the app with the server unreachable and still pick a customer, weigh,
   * and save.
   *
   * WHEN each list was fetched, kept per KIND rather than as one row. A refresh
   * is two requests over one connection and the second can fail on its own; a
   * shared timestamp would then claim the seller list had been re-read when only
   * the product list had. The price default is gated on the OLDER of the two
   * (master/freshness.ts), which only means anything if they can differ.
   */
  /*
   * THE CACHE BINDS TO THE TENANT ONLY, NEVER TO A PERSON. Prices and the
   * shop's people belong to the SHOP; two staff at one yard price identically,
   * and keying this to a user would drop a perfectly good price list every time
   * the phone changed hands.
   *
   * The reading rule that goes with the column, and it does not follow from the
   * column: a tenant MISMATCH must read as ABSENT, not as STALE. freshness.ts
   * already teaches the operator that stale data is usable — that is its whole
   * job — and this is the one case where it is not, because another shop's
   * price is not an old price, it is a wrong one, and the cash is paid against
   * it. Wiring that rule into the readers is NOT this pass.
   */
  `CREATE TABLE IF NOT EXISTS master_cache (
     kind       TEXT NOT NULL PRIMARY KEY,
     fetched_at TEXT NOT NULL,
     owner_tenant_id TEXT
   ) STRICT`,

  /*
   * PRICES ARE TEXT, and this is the same rule as local_bills.payload_json, for
   * the same reason: a column declared NUMERIC silently converts a bound decimal
   * string into an IEEE-754 float, so '15.50' would come back 15.5 and '10.500'
   * as 10.5, with hard rule 1 violated invisibly at the storage layer. The whole
   * tier map is one JSON TEXT column holding the server's decimal strings
   * verbatim. See lessons/sqlite-money-is-text.md.
   */
  `CREATE TABLE IF NOT EXISTS cached_products (
     id          TEXT NOT NULL PRIMARY KEY,
     code        TEXT NOT NULL,
     name        TEXT NOT NULL,
     uom_code    TEXT NOT NULL,
     uom_name    TEXT NOT NULL,
     prices_json TEXT NOT NULL,
     /* Tenant only. See the note above master_cache. */
     owner_tenant_id TEXT
   ) STRICT`,

  `CREATE TABLE IF NOT EXISTS cached_sellers (
     id    TEXT NOT NULL PRIMARY KEY,
     code  TEXT NOT NULL,
     name  TEXT NOT NULL,
     phone TEXT,
     grade TEXT,
     /* Tenant only. See the note above master_cache. */
     owner_tenant_id TEXT
   ) STRICT`,

  /*
   * WHO THIS DEVICE IS SIGNED IN AS — one row, and deliberately NOT the OS
   * keystore.
   *
   * It has to outlive the token. A token expires within the hour and is
   * deliberately KEPT in the keystore when it does (App.tsx says why), and a
   * sign-out DELETES the keystore entry. So keystore presence is already not a
   * proxy for "signed in", and an identity living there would share the token's
   * lifetime — which is the opposite of what ownership needs.
   *
   * There is no point at which this is reconciled against the token, and there
   * must not be: it is written when a login succeeds, read when a row is
   * written, and removed only by a deliberate sign-out.
   */
  `CREATE TABLE IF NOT EXISTS local_identity (
     only_row   INTEGER NOT NULL PRIMARY KEY CHECK (only_row = 1),
     tenant_id  TEXT    NOT NULL,
     user_id    TEXT    NOT NULL,
     updated_at TEXT    NOT NULL
   ) STRICT`,
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
  {
    name: "server_error_attempts",
    ddl: "server_error_attempts INTEGER NOT NULL DEFAULT 0",
  },
  { name: "master_data_missing_at", ddl: "master_data_missing_at TEXT" },
  { name: "master_data_code", ddl: "master_data_code TEXT" },
  { name: "master_as_of", ddl: "master_as_of TEXT" },
  // Phase 2c-9: the void the server refused on identity grounds. An upgraded
  // device must gain these too — listVoidsToApply filters on void_refused_at, so
  // without them the void queue itself would fail to read on a database that
  // already holds the shop's bills, including ones with a void owed.
  { name: "void_refused_at", ddl: "void_refused_at TEXT" },
  { name: "void_refused_code", ddl: "void_refused_code TEXT" },
  // P1.7: whose bill this is. NULLABLE, and it must stay so — see the CREATE
  // TABLE above. On an upgraded handset every existing row gets NULL, which
  // means UNKNOWN and parks; nothing is attributed to whoever is signed in.
  { name: "owner_tenant_id", ddl: "owner_tenant_id TEXT" },
  { name: "owner_user_id", ddl: "owner_user_id TEXT" },
];

/**
 * Columns added to local_draft after IT first shipped.
 *
 * local_draft has never needed one before, which is exactly why this list is
 * being created rather than the column being quietly appended to the CREATE
 * TABLE above: CREATE TABLE IF NOT EXISTS does nothing to a table that already
 * exists, so on a device upgraded from Phase 2c-7 the column would simply not be
 * there and every draft save would throw — on a phone with a cart open.
 */
const ADDED_DRAFT_COLUMNS: readonly { name: string; ddl: string }[] = [
  { name: "master_as_of", ddl: "master_as_of TEXT" },
  { name: "owner_tenant_id", ddl: "owner_tenant_id TEXT" },
  { name: "owner_user_id", ddl: "owner_user_id TEXT" },
];

/**
 * Columns added to the three master-data cache tables.
 *
 * TENANT ONLY — no user column, on any of them. Prices belong to the shop.
 *
 * `local_draft_lines` is deliberately ABSENT from this file's migration lists
 * and gains nothing. Every line is reachable only through `draft_id`, which is
 * `REFERENCES local_draft(id) ON DELETE CASCADE` in the CREATE TABLE above with
 * `PRAGMA foreign_keys = ON` in CONNECTION_PRAGMAS below — so a line cannot
 * outlive its owned parent or be reached apart from it, and a second copy of
 * the owner could only ever disagree with the first.
 */
const ADDED_CACHE_TENANT_COLUMN: readonly { name: string; ddl: string }[] = [
  { name: "owner_tenant_id", ddl: "owner_tenant_id TEXT" },
];

/** The three tables that take the tenant column and nothing else. */
const CACHE_TABLES: readonly string[] = ["master_cache", "cached_products", "cached_sellers"];

/**
 * Adds any missing column, by asking the database what it actually has.
 *
 * Deliberately driven by PRAGMA table_info rather than by running ALTER TABLE
 * and swallowing the "duplicate column name" error: a blanket catch would hide
 * a REAL failure (disk full, locked, STRICT rejecting the type) behind the same
 * silence as the benign case, on the one operation that decides whether the
 * shop's existing bills remain readable.
 */
async function migrateColumns(
  tx: SqlTx,
  table: string,
  columns: readonly { name: string; ddl: string }[],
): Promise<string[]> {
  const existing = await tx.all<{ name: string }>(`PRAGMA table_info(${table})`);
  const have = new Set(existing.map((c) => c.name));
  const added: string[] = [];
  for (const col of columns) {
    if (have.has(col.name)) continue;
    // tx.run, not exec: SqlTx deliberately has no exec (driver.ts), because a
    // statement inside a transaction must not re-enter the connection lock the
    // transaction already holds.
    await tx.run(`ALTER TABLE ${table} ADD COLUMN ${col.ddl}`);
    added.push(`${table}.${col.name}`);
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
 * Brings a fresh connection up: pragmas in order, then the schema and every
 * migration AS ONE TRANSACTION.
 *
 * Both stores share one connection and either may be opened first, so this is
 * idempotent (every statement is IF NOT EXISTS or a pragma) and lives in one
 * place — two copies of the pragma loop would be two chances to get the
 * busy_timeout ordering wrong.
 *
 * ---------------------------------------------------------------------------
 * WHY THE TRANSACTION, AND WHAT IT COSTS TO NOT HAVE ONE
 * ---------------------------------------------------------------------------
 * This ran as three bare loops of `exec` until P1.7 step 3. A process death
 * part-way through therefore left a HALF-MIGRATED database on disk that the
 * next launch resumed from wherever it had stopped — measured, not argued: a
 * SIGKILL after the 12th statement left seven tables, two indexes and thirteen
 * of twenty-six columns (proveMigration M2, which was written first and run
 * against this function BEFORE the wrapper was added, precisely so the red was
 * seen).
 *
 * On this box that is a bad afternoon. On the shop's handset it is unobservable:
 * the only signal is somebody saying the app will not open, and which statement
 * stopped it, which columns went in and which rows were backfilled cannot be
 * read by anyone — see ARCHITECTURE.md section 11. The requirement is therefore
 * a migration that CANNOT stop half-done, not one that can be repaired
 * afterwards, because there is no afterwards in which anyone knows.
 *
 * THE PRAGMAS STAY OUTSIDE IT, and that is not an oversight. `journal_mode`
 * cannot be changed inside a transaction at all, and `busy_timeout` must be in
 * force before anything can need a lock — including the BEGIN itself.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS PROVED, AND ON WHICH DRIVER — READ THIS BEFORE TRUSTING IT
 * ---------------------------------------------------------------------------
 * Atomicity here is proved at `a471dc2` AGAINST node:sqlite ONLY, by
 * proveMigration's M2: a child process SIGKILLed at four points inside this
 * function, the database reopened, and asserted to hold either the complete old
 * shape with every row at its original value or the complete new shape, never a
 * partial column set.
 *
 * THE SHA ABOVE READ `7b4f22d` UNTIL P1.7's login pass, and it was wrong — kept
 * here because the way it was wrong is the instructive part. `7b4f22d` is the
 * DOCS commit that designed this ownership scheme; it touched neither this file
 * nor the proof (`git show --stat 7b4f22d -- <either path>` is empty), so the
 * sentence pinned a measurement to a commit at which nothing had been measured.
 * It was written while the work was still uncommitted, when the only sha to hand
 * was the previous one. A claim can be pinned to a sha only AFTER the work
 * carrying it lands — before that there is no sha that means what the sentence
 * needs, and the nearest one is always the one that does not contain the work.
 *
 * THE HANDSET IS NOT COVERED BY THAT. `src/device/expoSqliteDriver.ts` gets its
 * transaction from `withExclusiveTransactionAsync`, which its own header records
 * as running on a SEPARATE CONNECTION isolated by SQLite's file lock rather than
 * by the JS mutex — a different mechanism, and that file cannot run under node
 * at all, so no proof on this box reaches it.
 *
 * That gap is ACCEPTED for this step rather than closed, because the project has
 * no route to a device pass today. It is WORK TO RETURN TO, not work that is
 * finished: what is owed is a way to exercise this same kill-and-reopen against
 * the expo driver on real hardware. Nobody should read the green above as
 * covering the phone.
 */
export async function initConnection(db: SqlDriver): Promise<string[]> {
  for (const pragma of CONNECTION_PRAGMAS) await db.exec(pragma);
  return db.transaction(async (tx) => {
    for (const ddl of SCHEMA_STATEMENTS) await tx.run(ddl);
    const added = [
      ...(await migrateColumns(tx, "local_bills", ADDED_BILL_COLUMNS)),
      ...(await migrateColumns(tx, "local_draft", ADDED_DRAFT_COLUMNS)),
    ];
    for (const t of CACHE_TABLES) {
      added.push(...(await migrateColumns(tx, t, ADDED_CACHE_TENANT_COLUMN)));
    }
    for (const ddl of POST_MIGRATION_STATEMENTS) await tx.run(ddl);
    return added;
  });
}
