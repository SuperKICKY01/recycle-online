/**
 * SqlDriver over node:sqlite — the real SQLite C library bundled with Node,
 * against a real file on disk. This is what the Phase 2b proof executes.
 *
 * node:sqlite is synchronous; the Promise wrapping only satisfies the async
 * SqlDriver interface that expo-sqlite needs on the device.
 */
import { DatabaseSync } from "node:sqlite";

import type { SqlDriver, SqlRunResult, SqlValue } from "./driver.js";

export class NodeSqliteDriver implements SqlDriver {
  private constructor(private readonly db: DatabaseSync) {}

  static open(filename: string): NodeSqliteDriver {
    return new NodeSqliteDriver(new DatabaseSync(filename));
  }

  exec(sql: string): Promise<void> {
    this.db.exec(sql);
    return Promise.resolve();
  }

  run(sql: string, params: readonly SqlValue[] = []): Promise<SqlRunResult> {
    const r = this.db.prepare(sql).run(...params);
    return Promise.resolve({ changes: Number(r.changes) });
  }

  all<T>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    return Promise.resolve(this.db.prepare(sql).all(...params) as T[]);
  }

  close(): Promise<void> {
    this.db.close();
    return Promise.resolve();
  }
}
