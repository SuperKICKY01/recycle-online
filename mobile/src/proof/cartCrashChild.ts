/**
 * Crash-injection child for proveCart C5. Run as a separate OS process and
 * killed with SIGKILL, so the "crash" is a real process death — no unwinding,
 * no finally blocks, no chance for anything to tidy up. What survives is
 * whatever SQLite actually put on disk.
 *
 * argv: <dbFile> <mode> <billId> <idemKey>
 *   mode = before-commit  kill INSIDE the transaction, after the bill INSERT
 *                         has run but before COMMIT
 *   mode = after-commit   kill immediately after COMMIT returned
 *
 * The crash is injected by wrapping the DRIVER, so the code under test is the
 * real SqliteDraftStore.promoteToBill — not a copy of its statements. A copy
 * could drift from production and would then prove nothing about it.
 */
import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteDraftStore } from "../adapters/sqlite/SqliteDraftStore.js";
import type { SqlDriver, SqlRunResult, SqlTx, SqlValue } from "../adapters/sqlite/driver.js";
import { buildLocalBill } from "../sync/createBill.js";
import { toBillItems, cartTotal } from "../cart/cart.js";
import { FakeClock } from "./fakes.js";
import type { IdSource } from "../sync/types.js";

/** Dies instantly and unconditionally. SIGKILL cannot be caught or deferred. */
function die(): never {
  process.kill(process.pid, "SIGKILL");
  // Unreachable in practice; keeps the type as `never` and guards the
  // theoretical case where the signal has not landed yet.
  throw new Error("SIGKILL did not terminate the process");
}

/**
 * Delegating driver that kills the process after the Nth statement inside a
 * transaction, or straight after the COMMIT.
 */
class CrashDriver implements SqlDriver {
  constructor(
    private readonly inner: SqlDriver,
    private readonly mode: "before-commit" | "after-commit",
    /** Kill after this many statements have run inside the transaction. */
    private readonly killAfterStatements = 1,
  ) {}

  exec(sql: string): Promise<void> {
    return this.inner.exec(sql);
  }

  run(sql: string, params?: readonly SqlValue[]): Promise<SqlRunResult> {
    return this.inner.run(sql, params);
  }

  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]> {
    return this.inner.all<T>(sql, params);
  }

  async transaction<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T> {
    const out = await this.inner.transaction(async (tx) => {
      let n = 0;
      const watched: SqlTx = {
        run: async (sql, params) => {
          const r = await tx.run(sql, params);
          n += 1;
          if (this.mode === "before-commit" && n >= this.killAfterStatements) {
            // Inside BEGIN...COMMIT, with the bill row already inserted.
            console.log(`CHILD: killing after ${String(n)} statement(s), before COMMIT`);
            die();
          }
          return r;
        },
        all: (sql, params) => tx.all(sql, params),
      };
      return fn(watched);
    });
    if (this.mode === "after-commit") {
      console.log("CHILD: COMMIT returned; killing now");
      die();
    }
    return out;
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}

class FixedIds implements IdSource {
  private i = 0;
  constructor(private readonly values: string[]) {}
  newId(): string {
    const v = this.values[this.i];
    this.i += 1;
    if (v === undefined) throw new Error("FixedIds exhausted");
    return v;
  }
}

async function main(): Promise<void> {
  const [dbFile, mode, billId, idemKey] = process.argv.slice(2);
  if (
    dbFile === undefined ||
    (mode !== "before-commit" && mode !== "after-commit") ||
    billId === undefined ||
    idemKey === undefined
  ) {
    throw new Error("usage: cartCrashChild <dbFile> <before-commit|after-commit> <billId> <idemKey>");
  }

  const inner = NodeSqliteDriver.open(dbFile);
  const driver = new CrashDriver(inner, mode);
  const store = await SqliteDraftStore.open(driver);

  const draft = await store.load();
  if (draft === null) throw new Error("child: no draft to promote");

  // The bill id and idempotency key are minted HERE, at promotion — exactly as
  // the app does it. Fixed values so the parent can look for them by name.
  const bill = buildLocalBill(
    { clock: new FakeClock(), ids: new FixedIds([billId, idemKey]) },
    {
      seller_id: draft.seller_id,
      vehicle_no: draft.vehicle_no,
      items: toBillItems(draft),
      total_amount: cartTotal(draft),
      master_as_of: draft.master_as_of,
    },
  );

  console.log(`CHILD: promoting draft ${draft.id} -> bill ${billId} (mode=${mode})`);
  await store.promoteToBill(draft, bill);

  // Only reachable if the kill failed to happen.
  console.log("CHILD: STILL ALIVE AFTER PROMOTION — crash injection did not fire");
  process.exitCode = 99;
}

main().catch((err: unknown) => {
  console.error("CHILD ERROR:", err);
  process.exitCode = 98;
});
