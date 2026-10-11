/**
 * THE APP'S LOCAL DATABASE, BROUGHT UP ONCE PER JS PROCESS (A3 batch 1b, 2026-10-11).
 *
 * App.tsx's startup used to open the driver and run the three schema-initialising store
 * opens every time its root mounted. An Android activity relaunch (any configuration change
 * the activity does not handle — font size first among them) mounts a NEW root in the SAME JS
 * process, so all of it ran again, and on the emulator it failed two ways:
 *   - a second open of the same name on expo-sqlite left the cached native connection to be
 *     closed under the app when the first JS wrapper was collected (openOnce.ts) —
 *     `NativeDatabase.execAsync … NullPointerException`, 2 of 2 second relaunches;
 *   - with the handle reused, the second `initConnection` still took an EXCLUSIVE transaction
 *     on a fresh connection — expo-sqlite runs `transaction()` on a new connection, where the
 *     main connection's `busy_timeout` does not apply — while the first root's leftover work
 *     held the file: `NativeStatement.finalizeAsync … database is locked`, 1 of 1 first
 *     relaunch after the handle fix.
 * So the startup step itself is idempotent per process: the first caller opens the driver and
 * brings the stores up; a caller arriving mid-open awaits the same promise; every later caller
 * (a relaunched root) gets the SAME driver and stores, and no schema transaction runs twice. A
 * failed bring-up is not remembered, so the next startup tries again.
 *
 * Node-importable on purpose: the driver opener is a parameter, so prove:sqlite drives exactly
 * this function over node:sqlite and counts the opens.
 */
import type { SqlDriver } from "./driver.js";
import { openOncePerProcess } from "./openOnce.js";
import { SqliteDraftStore } from "./SqliteDraftStore.js";
import { SqliteLocalStore } from "./SqliteLocalStore.js";
import { SqliteMasterStore } from "./SqliteMasterStore.js";

export interface LocalDatabase {
  readonly driver: SqlDriver;
  readonly billStore: SqliteLocalStore;
  readonly draftStore: SqliteDraftStore;
  readonly masterStore: SqliteMasterStore;
}

export function localDatabaseOnce(openDriver: (name: string) => Promise<SqlDriver>): {
  open: (name: string) => Promise<LocalDatabase>;
  forget: (name: string) => void;
} {
  return openOncePerProcess(async (name: string): Promise<LocalDatabase> => {
    const driver = await openDriver(name);
    const billStore = await SqliteLocalStore.open(driver);
    const draftStore = await SqliteDraftStore.open(driver);
    const masterStore = await SqliteMasterStore.open(driver);
    return { driver, billStore, draftStore, masterStore };
  });
}
