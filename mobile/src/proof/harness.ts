/**
 * Lets the Phase 2a proof suite run unchanged against either store.
 *
 * The point is that the CASES do not know which store they are on. If a case
 * had to be adjusted to pass on SQLite, that adjustment would be the bug.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteIdentityStore } from "../adapters/sqlite/SqliteIdentityStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import type { LocalStore } from "../sync/types.js";
import { InMemoryStore, PROOF_OWNER } from "./fakes.js";

export interface StoreSession {
  readonly store: LocalStore;
  /** Simulate a kill between claim and outcome. */
  forceSyncing(id: string): Promise<void>;
  /** Restart the app. For SQLite this really closes and reopens the file. */
  restart(): Promise<StoreSession>;
  dispose(): Promise<void>;
}

export interface StoreHarness {
  readonly name: string;
  /** How honest the restart is, printed in the proof output. */
  readonly restartKind: string;
  open(caseName: string): Promise<StoreSession>;
}

/* ---------------------------------------------------------------- memory -- */

class MemorySession implements StoreSession {
  constructor(readonly store: InMemoryStore) {}

  forceSyncing(id: string): Promise<void> {
    this.store.forceState(id, "syncing");
    return Promise.resolve();
  }

  restart(): Promise<StoreSession> {
    return Promise.resolve(new MemorySession(new InMemoryStore(this.store.snapshot())));
  }

  dispose(): Promise<void> {
    return Promise.resolve();
  }
}

export const memoryHarness: StoreHarness = {
  name: "InMemoryStore",
  restartKind: "snapshot rebuild (rows copied, no file involved)",
  open: () => {
    const store = new InMemoryStore();
    // SIGNED IN, because a device running any of these cases is one somebody
    // signed in on. The send queue now filters by owner, so a harness that left
    // the identity unset would park every bill in the suite and every case
    // would go red for a reason that has nothing to do with what it tests.
    store.setIdentity(PROOF_OWNER);
    return Promise.resolve(new MemorySession(store));
  },
};

/* ---------------------------------------------------------------- sqlite -- */

class SqliteSession implements StoreSession {
  /** restart() closes the connection; dispose() must not close it twice. */
  private closed = false;

  constructor(
    readonly store: SqliteLocalStore,
    private readonly driver: NodeSqliteDriver,
    readonly file: string,
    private readonly dir: string,
  ) {}

  static async open(file: string, dir: string): Promise<SqliteSession> {
    const driver = NodeSqliteDriver.open(file);
    const store = await SqliteLocalStore.open(driver);
    // The same signed-in device the memory harness models, written to the real
    // local_identity table so the store's own live read finds it. Idempotent by
    // construction (the row's key is fixed), so a restart re-running this is
    // harmless — and it must run on restart, because a reopened file is a
    // reopened device that is still signed in.
    await new SqliteIdentityStore(driver).save(PROOF_OWNER);
    return new SqliteSession(store, driver, file, dir);
  }

  async forceSyncing(id: string): Promise<void> {
    await this.driver.run("UPDATE local_bills SET sync_state = 'syncing' WHERE id = ?", [id]);
  }

  private async closeOnce(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    await this.driver.close();
  }

  /** A genuine restart: the connection is closed, then the file is reopened. */
  async restart(): Promise<StoreSession> {
    await this.closeOnce();
    return SqliteSession.open(this.file, this.dir);
  }

  async dispose(): Promise<void> {
    // Windows refuses to remove a directory that still holds an open file, so
    // the connection must be shut before the rm. Sessions are disposed newest
    // first (see disposeAll) because a restarted session shares this directory.
    await this.closeOnce();
    rmSync(this.dir, { recursive: true, force: true });
  }
}

export const sqliteHarness: StoreHarness = {
  name: "SqliteLocalStore (node:sqlite, real file on disk)",
  restartKind: "real close() + reopen of the same database file",
  open: async (caseName: string): Promise<StoreSession> => {
    const dir = mkdtempSync(join(tmpdir(), `recycle-proof-${caseName}-`));
    return SqliteSession.open(join(dir, "bills.db"), dir);
  },
};
