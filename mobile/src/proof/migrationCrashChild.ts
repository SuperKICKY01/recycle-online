/**
 * Crash-injection child for proveMigration. Run as a separate OS process and
 * killed with SIGKILL, so the "crash" is a real process death — no unwinding,
 * no finally blocks, no chance for anything to tidy up. What survives is
 * whatever SQLite actually put on disk.
 *
 * argv: <dbFile> <killAfterStatements>
 *
 * The kill is injected by wrapping the DRIVER, so the code under test is the
 * real schema.initConnection — not a copy of its statements. A copy could drift
 * from production and would then prove nothing about it. This is the same shape
 * as cartCrashChild.ts, which kills inside promoteToBill.
 *
 * WHY IT COUNTS BOTH exec AND tx.run. The migration's statements travel one of
 * two ways depending on whether it is wrapped in a transaction, and this child
 * has to be able to kill either shape — it is run against the migration BEFORE
 * the wrapper is added, to establish the proof goes red, and again after. A
 * counter that watched only one path would silently stop killing when the
 * migration moved to the other.
 *
 * PRAGMAS ARE NOT COUNTED. They run before any schema statement and cannot be
 * part of the transaction (journal_mode cannot be changed inside one), so a kill
 * during a pragma would measure the connection bring-up rather than the
 * migration.
 */
import type { SqlDriver, SqlRunResult, SqlTx, SqlValue } from "../adapters/sqlite/driver.js";
import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { initConnection } from "../adapters/sqlite/schema.js";

/** Dies instantly and unconditionally. SIGKILL cannot be caught or deferred. */
function die(): never {
  process.kill(process.pid, "SIGKILL");
  // Unreachable in practice; keeps the type as `never` and guards the
  // theoretical case where the signal has not landed yet.
  throw new Error("SIGKILL did not terminate the process");
}

const isPragma = (sql: string): boolean => /^\s*PRAGMA\b/i.test(sql);

const oneLine = (sql: string): string => sql.trim().replace(/\s+/g, " ").slice(0, 70);

class MigrationCrashDriver implements SqlDriver {
  private n = 0;

  constructor(
    private readonly inner: SqlDriver,
    /** Kill once this many non-pragma migration statements have RUN. */
    private readonly killAfter: number,
  ) {}

  /**
   * Called AFTER the statement has completed, so its effect is already on disk
   * when the process dies. Killing before it ran would prove nothing about a
   * half-applied migration.
   */
  private countAndMaybeDie(sql: string): void {
    if (isPragma(sql)) return;
    this.n += 1;
    if (this.n >= this.killAfter) {
      console.log(`CHILD: killing after statement ${String(this.n)}: ${oneLine(sql)}`);
      die();
    }
  }

  async exec(sql: string): Promise<void> {
    await this.inner.exec(sql);
    this.countAndMaybeDie(sql);
  }

  run(sql: string, params?: readonly SqlValue[]): Promise<SqlRunResult> {
    return this.inner.run(sql, params);
  }

  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]> {
    return this.inner.all<T>(sql, params);
  }

  async transaction<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T> {
    return this.inner.transaction(async (tx) => {
      const watched: SqlTx = {
        run: async (sql, params) => {
          const r = await tx.run(sql, params);
          this.countAndMaybeDie(sql);
          return r;
        },
        all: (sql, params) => tx.all(sql, params),
      };
      return fn(watched);
    });
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}

async function main(): Promise<void> {
  const [dbFile, killAfterRaw] = process.argv.slice(2);
  if (dbFile === undefined || killAfterRaw === undefined) {
    throw new Error("usage: migrationCrashChild <dbFile> <killAfterStatements>");
  }
  const killAfter = Number(killAfterRaw);
  if (!Number.isInteger(killAfter) || killAfter < 1) {
    throw new Error(`killAfterStatements must be a positive integer, got ${killAfterRaw}`);
  }

  const inner = NodeSqliteDriver.open(dbFile);
  const driver = new MigrationCrashDriver(inner, killAfter);

  console.log(`CHILD: migrating ${dbFile}, killing after ${String(killAfter)} statement(s)`);
  await initConnection(driver);

  // Only reachable if the kill failed to happen.
  console.log("CHILD: STILL ALIVE AFTER MIGRATION — crash injection did not fire");
  process.exitCode = 99;
}

main().catch((err: unknown) => {
  console.error("CHILD ERROR:", err);
  process.exitCode = 98;
});
