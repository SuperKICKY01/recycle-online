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
 * text that SqliteLocalStore produces, and every store method is a single
 * statement, so the atomicity argument does not depend on driver behaviour
 * beyond reporting `changes` honestly. That last point is the assumption this
 * file rests on and it is UNVERIFIED until it runs on a device.
 * ======================================================================
 */
import * as SQLite from "expo-sqlite";

import type { SqlDriver, SqlRunResult, SqlValue } from "../adapters/sqlite/driver.js";

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

  async close(): Promise<void> {
    await this.db.closeAsync();
  }
}
