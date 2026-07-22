/**
 * Minimal SQL surface the store needs. Two implementations exist:
 *
 *   NodeSqliteDriver  (node:sqlite)  — runs headless, and is what the Phase 2b
 *                                      proof actually executes against.
 *   ExpoSqliteDriver  (expo-sqlite)  — runs on the device. See src/device/.
 *
 * Both execute the SAME SQL text produced by SqliteLocalStore, so what the
 * proof establishes about the statements themselves carries over; what does NOT
 * carry over is the binding layer itself.
 *
 * Only these three value types ever cross the boundary. There is deliberately
 * no `number` path for money — see schema.ts.
 */
export type SqlValue = string | number | null;

export interface SqlRunResult {
  /** Rows actually modified. The claim's correctness depends on this being exact. */
  changes: number;
}

/**
 * Handle for statements INSIDE a transaction.
 *
 * Deliberately a separate type from SqlDriver. The statements of a transaction
 * must not re-enter the connection lock the transaction already holds, so they
 * cannot go through the driver's own run/all. Passing this handle to the
 * callback makes that a compile-time distinction instead of a rule someone has
 * to remember: calling `driver.run` inside a transaction body would deadlock.
 */
export interface SqlTx {
  run(sql: string, params?: readonly SqlValue[]): Promise<SqlRunResult>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
}

export interface SqlDriver {
  /** Statements without parameters: pragmas, DDL. */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<SqlRunResult>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  /**
   * Runs `fn` as ONE atomic unit: BEGIN IMMEDIATE, the body, COMMIT — or
   * ROLLBACK if the body throws. Nothing else may touch the connection while
   * it runs (see mutex.ts for why that exclusion is load-bearing rather than
   * merely tidy).
   *
   * Used for exactly one thing so far: promoting a cart draft to a pending
   * bill, where a crash must leave either an intact draft or an intact bill
   * and never both or neither.
   */
  transaction<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
