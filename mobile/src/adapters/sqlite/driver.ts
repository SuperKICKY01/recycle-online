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

export interface SqlDriver {
  /** Statements without parameters: pragmas, DDL. */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: readonly SqlValue[]): Promise<SqlRunResult>;
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]>;
  close(): Promise<void>;
}
