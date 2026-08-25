/**
 * Crash-injection child for proveVoid V4.
 *
 * Runs ONE real sync pass against a real SQLite file and a file-backed server,
 * and SIGKILLs itself at the exact instant the engine turns from "the bill is
 * synced" to "now apply the void" — before the server hears anything about the
 * void.
 *
 * That is the dangerous window: the bill now EXISTS on the server, active, with
 * a doc_no, and the only record that the owner cancelled it is the local
 * void_requested_at. If a crash there lost the intent, the shop would have a
 * live bill for a load it had reversed, and nothing on the device would say so.
 *
 * argv: <dbFile> <serverFile>
 */
import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { SyncEngine } from "../sync/engine.js";
import { systemClock } from "../sync/systemClock.js";
import { noSellerKind } from "./fakes.js";
import { FileServer, FileServerTransport } from "./fileServer.js";
import { signInProofDevice } from "./proofDevice.js";

async function main(): Promise<void> {
  const [dbFile, serverFile] = process.argv.slice(2);
  if (dbFile === undefined || serverFile === undefined) {
    throw new Error("usage: voidCrashChild <dbFile> <serverFile>");
  }

  const driver = NodeSqliteDriver.open(dbFile);
  const store = await SqliteLocalStore.open(driver);
  await signInProofDevice(driver);
  const server = new FileServer(serverFile);

  const engine = new SyncEngine({ ...noSellerKind(),
    store,
    transport: new FileServerTransport(server, () => {
      console.log("CHILD: bill is synced; killing before the void is sent");
      process.kill(process.pid, "SIGKILL");
    }),
    clock: systemClock,
    backoffBaseMs: 1000,
  });

  console.log("CHILD: running one sync pass");
  await engine.runOnce();

  console.log("CHILD: STILL ALIVE — the crash hook never fired");
  process.exitCode = 99;
}

main().catch((err: unknown) => {
  console.error("CHILD ERROR:", err);
  process.exitCode = 98;
});
