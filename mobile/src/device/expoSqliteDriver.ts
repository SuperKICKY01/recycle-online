/**
 * SqlDriver over expo-sqlite — the DEVICE path.
 *
 * ============================ NOT EXECUTED ============================
 * This file cannot run under node. Verified in Phase 2b, not assumed:
 *   1. expo-sqlite@57.0.1 ships ESM with extensionless specifiers
 *      (`export * from './SQLiteDatabase'`), which only the Metro bundler
 *      resolves; node throws ERR_MODULE_NOT_FOUND on import.
 *   2. Past that, SQLiteDatabase.js imports `react-native` and ExpoSQLite.js
 *      is `requireNativeModule('ExpoSQLite')` — a native module that exists
 *      only inside an Expo app runtime.
 * It also cannot share a TypeScript program with the node code: importing
 * expo-sqlite pulls React Native's global declarations in, which redefine URL
 * and break node's own types. Hence src/device/ and tsconfig.device.json.
 *
 * What IS carried over from the proof: this driver executes the identical SQL
 * text that SqliteLocalStore produces, and every single-statement store method
 * depends on nothing beyond `changes` being reported honestly. That last point
 * is the assumption this file rests on and it is UNVERIFIED until it runs on a
 * device.
 *
 * TRANSACTIONS (Phase 2c-3) ARE THE ONE PLACE THE TWO DRIVERS DIFFER, AND THE
 * DIFFERENCE IS REAL — read this before assuming the node proof covers it.
 *
 * The node driver hand-rolls BEGIN IMMEDIATE / COMMIT and gets its exclusion
 * from the Mutex, because both the transaction and every other statement share
 * one connection. expo-sqlite does NOT work that way: checked against the
 * installed 16.0.10 typings, `withExclusiveTransactionAsync` hands the callback
 * a `Transaction extends SQLiteDatabase`, documented as "a new connection". So
 * the transaction runs on its OWN connection, and what isolates it from
 * statements still going through this one is SQLite's file-level write lock
 * plus busy_timeout — not the JS mutex.
 *
 * What that changes, and what it does not:
 *   - unchanged: all-or-nothing on a crash. That is a property of the SQLite
 *     transaction itself, which is what proveCart C5 exercises, so it carries.
 *   - changed: a concurrent write on this connection during a promotion does
 *     not queue behind a mutex, it contends for the write lock and waits up to
 *     busy_timeout. The app avoids relying on that by cancelling any pending
 *     debounced draft save BEFORE promoting (see App.tsx submitBill).
 *
 * Hand-rolling BEGIN/COMMIT through execAsync instead would fight expo-sqlite's
 * internal queueing rather than cooperate with it.
 *
 * SUPERSEDED 2026-08-12 — this paragraph ended "All of this is UNVERIFIED here
 * until it runs on a device." The ALL-OR-NOTHING half has now run.
 *
 * PROVED ON Android, on THIS PROJECT'S OWN DEBUG BUILD (built at `9d2eb22`,
 * applicationId `dev.chutipon.recycle`), on ONE handset — not through Expo Go,
 * which runs a third party's package and could not have answered it.
 * HOW: this transaction, driving `initConnection` over a 150,000-row pre-P1.7
 * database, force-stopped TWICE mid-flight (4.5 MB and 64.7 MB of WAL, both past
 * the 32-byte header so both after BEGIN, the second ~4 s before the commit a
 * no-kill control had timed). Both reopens held the COMPLETE OLD SHAPE with
 * every row at its original value. See `src/adapters/sqlite/schema.ts`.
 * STILL UNPROVED: iOS has never run it, and NO RELEASE BUILD EXISTS. The
 * `changes` assumption above is a SEPARATE claim and was not isolated by that
 * pass. And the CONTENTION half of this header — a concurrent write on this
 * connection waiting out busy_timeout rather than queueing on a mutex — was not
 * exercised at all: the migration ran with nothing else writing.
 * ======================================================================
 */
import * as SQLite from "expo-sqlite";

import type { SqlDriver, SqlRunResult, SqlTx, SqlValue } from "../adapters/sqlite/driver.js";

export class ExpoSqliteDriver implements SqlDriver {
  private constructor(private readonly db: SQLite.SQLiteDatabase) {}

  static async open(databaseName = "recycle.db"): Promise<ExpoSqliteDriver> {
    return new ExpoSqliteDriver(await SQLite.openDatabaseAsync(databaseName));
  }

  async exec(sql: string): Promise<void> {
    await this.db.execAsync(sql);
  }

  async run(sql: string, params: readonly SqlValue[] = []): Promise<SqlRunResult> {
    const r = await this.db.runAsync(sql, [...params]);
    return { changes: r.changes };
  }

  async all<T>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    return this.db.getAllAsync<T>(sql, [...params]);
  }

  async transaction<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T> {
    let out!: T;
    await this.db.withExclusiveTransactionAsync(async (txn) => {
      const tx: SqlTx = {
        run: async (sql, params = []) => {
          const r = await txn.runAsync(sql, [...params]);
          return { changes: r.changes };
        },
        all: <R,>(sql: string, params: readonly SqlValue[] = []) =>
          txn.getAllAsync<R>(sql, [...params]),
      };
      // A throw here propagates out of withExclusiveTransactionAsync and
      // expo-sqlite rolls the transaction back — the same contract the node
      // driver implements by hand.
      out = await fn(tx);
    });
    return out;
  }

  async close(): Promise<void> {
    await this.db.closeAsync();
  }
}
