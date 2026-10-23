/**
 * Child process for proveSyncFaults: ONE device syncing, in its own OS process so it can be KILLED,
 * against the REAL server through the production HttpTransport, the production SyncEngine and the
 * production SqliteLocalStore on a real file.
 *
 * argv: <mode> <dbFile> <goFile>      env: SYNCFAULTS_API, SYNCFAULTS_TOKEN (never argv), SYNCFAULTS_KILL_AT
 *   ackkill  SIGKILLs itself after the Nth bill the server answered success for, BEFORE the engine
 *            records it -- the bill is committed on the server and the device does not know.
 *   slow     every send delayed 250 ms, run until quiescent; the parent kills it partway.
 *   sync     waits until goFile exists (the parent's start line for two devices), then runs.
 * Every mode boots as the app does -- recoverInterrupted() first -- and prints one summary line.
 */
import { existsSync } from "node:fs";

import { HttpTransport } from "../adapters/httpTransport.js";
import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { withClientVersion } from "../net/clientVersion.js";
import { SyncEngine } from "../sync/engine.js";
import { systemClock } from "../sync/systemClock.js";
import type { LocalBill, SendOutcome, Transport, VoidOutcome } from "../sync/types.js";
import { noSellerKind } from "./fakes.js";
import { signInProofDevice } from "./proofDevice.js";

class ChildTransport implements Transport {
  readonly outcomes: Record<string, string[]> = {};
  /** [start, end] wall-clock ms of each send, so the parent can show two devices' sends overlapped. */
  readonly spans: Record<string, [number, number][]> = {};
  private answered = 0;

  constructor(
    private readonly inner: HttpTransport,
    private readonly mode: string,
    private readonly killAt: number,
  ) {}

  async sendBill(bill: LocalBill): Promise<SendOutcome> {
    if (this.mode === "slow") await new Promise((resolve) => setTimeout(resolve, 250));
    const start = Date.now();
    const out = await this.inner.sendBill(bill);
    (this.spans[bill.id] ??= []).push([start, Date.now()]);
    (this.outcomes[bill.id] ??= []).push(out.kind);
    if (this.mode === "ackkill" && (out.kind === "accepted" || out.kind === "duplicate")) {
      this.answered += 1;
      if (this.answered === this.killAt) {
        console.log(`CHILD: ${bill.id} answered ${out.kind} doc_no=${String(out.doc_no)}; killing before it is recorded`);
        process.kill(process.pid, "SIGKILL");
      }
    }
    return out;
  }

  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    return this.inner.voidBill(bill, reason);
  }
}

async function main(): Promise<void> {
  const [mode, dbFile, goFile] = process.argv.slice(2);
  const api = process.env.SYNCFAULTS_API;
  const token = process.env.SYNCFAULTS_TOKEN;
  if (mode === undefined || dbFile === undefined || goFile === undefined || !api || !token) {
    throw new Error("usage: syncFaultsChild <ackkill|slow|sync> <dbFile> <goFile>, SYNCFAULTS_API and _TOKEN set");
  }
  const driver = NodeSqliteDriver.open(dbFile);
  const store = await SqliteLocalStore.open(driver);
  await signInProofDevice(driver);
  const transport = new ChildTransport(
    new HttpTransport({
      baseUrl: api,
      getToken: () => Promise.resolve(token),
      fetchImpl: withClientVersion(globalThis.fetch.bind(globalThis)),
    }),
    mode,
    Number(process.env.SYNCFAULTS_KILL_AT ?? "0"),
  );
  const engine = new SyncEngine({ ...noSellerKind(),
    store,
    transport,
    clock: systemClock,
    backoffBaseMs: 50,
    backoffMaxMs: 200,
  });
  if (mode === "sync") {
    while (!existsSync(goFile)) await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const recovered = await engine.recoverInterrupted();
  const total = await engine.runUntilQuiescent(400, 50);
  console.log(`SYNCFAULTS_CHILD ${JSON.stringify({ recovered: recovered.bill_send, total, outcomes: transport.outcomes,
    spans: transport.spans })}`);
  await driver.close();
}

main().catch((err: unknown) => {
  console.error("CHILD ERROR:", err);
  process.exitCode = 98;
});
