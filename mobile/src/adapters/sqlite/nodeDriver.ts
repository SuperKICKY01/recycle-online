/**
 * SqlDriver over node:sqlite — the real SQLite C library bundled with Node,
 * against a real file on disk. This is what the Phase 2b/2c-3 proofs execute.
 *
 * node:sqlite is synchronous; the Promise wrapping only satisfies the async
 * SqlDriver interface that expo-sqlite needs on the device. The Mutex is
 * therefore near-free here — a synchronous driver cannot interleave anyway —
 * but it is kept so both drivers enforce the same discipline, and so the
 * transaction path the proof exercises is the same shape as the device's.
 */
import { DatabaseSync } from "node:sqlite";

import type { SqlDriver, SqlRunResult, SqlTx, SqlValue } from "./driver.js";
import { Mutex } from "./mutex.js";

export class NodeSqliteDriver implements SqlDriver {
  private readonly lock = new Mutex();

  private constructor(private readonly db: DatabaseSync) {}

  static open(filename: string): NodeSqliteDriver {
    return new NodeSqliteDriver(new DatabaseSync(filename));
  }

  /* -- raw forms: no lock. Only for callers that already hold it. ---------- */

  private rawExec(sql: string): void {
    this.db.exec(sql);
  }

  private rawRun(sql: string, params: readonly SqlValue[]): SqlRunResult {
    const r = this.db.prepare(sql).run(...params);
    return { changes: Number(r.changes) };
  }

  private rawAll<T>(sql: string, params: readonly SqlValue[]): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  /* -- locked public surface ---------------------------------------------- */

  exec(sql: string): Promise<void> {
    return this.lock.run(() => {
      this.rawExec(sql);
      return Promise.resolve();
    });
  }

  run(sql: string, params: readonly SqlValue[] = []): Promise<SqlRunResult> {
    return this.lock.run(() => Promise.resolve(this.rawRun(sql, params)));
  }

  all<T>(sql: string, params: readonly SqlValue[] = []): Promise<T[]> {
    return this.lock.run(() => Promise.resolve(this.rawAll<T>(sql, params)));
  }

  /**
   * BEGIN IMMEDIATE, not plain BEGIN: it takes the write lock up front. A
   * deferred transaction that starts by reading and only later tries to write
   * can fail to upgrade when another connection wrote in between — SQLITE_BUSY
   * that no busy_timeout can resolve, because backing off cannot help a lock
   * that is already lost.
   */
  async transaction<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T> {
    return this.lock.run(async () => {
      const tx: SqlTx = {
        run: (sql, params = []) => Promise.resolve(this.rawRun(sql, params)),
        all: <R,>(sql: string, params: readonly SqlValue[] = []) =>
          Promise.resolve(this.rawAll<R>(sql, params)),
      };
      this.rawExec("BEGIN IMMEDIATE");
      try {
        const out = await fn(tx);
        this.rawExec("COMMIT");
        return out;
      } catch (err) {
        // Best-effort: if the connection itself is gone the ROLLBACK will also
        // throw, and the original error is the one worth propagating.
        try {
          this.rawExec("ROLLBACK");
        } catch {
          /* ignore */
        }
        throw err;
      }
    });
  }

  close(): Promise<void> {
    return this.lock.run(() => {
      this.db.close();
      return Promise.resolve();
    });
  }
}
