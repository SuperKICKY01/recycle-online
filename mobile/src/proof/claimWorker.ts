/**
 * One racing claimer. Runs in a REAL OS thread with its OWN SQLite connection
 * to the same file — this is not a simulated race.
 *
 * It calls the production SqliteLocalStore.claimForSend, not raw SQL, so what
 * is under test is the shipped method.
 */
import { parentPort, workerData } from "node:worker_threads";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";

export interface ClaimWorkerData {
  file: string;
  ids: string[];
  sab: SharedArrayBuffer;
}

export interface ClaimWorkerResult {
  wins: number;
  losses: number;
  errors: number;
  firstAt: number;
  lastAt: number;
}

const { file, ids, sab } = workerData as ClaimWorkerData;
const ctl = new Int32Array(sab); // [0] = start gate, [1] = ready count

const driver = NodeSqliteDriver.open(file);
const store = await SqliteLocalStore.open(driver);

// Announce readiness, then block until every worker is ready. Without this
// barrier the threads never overlap: spawning a worker costs far more than
// claiming a few hundred rows, so worker 1 finishes everything before worker 2
// opens its connection, and the "race" silently proves nothing.
Atomics.add(ctl, 1, 1);
while (Atomics.load(ctl, 0) === 0) Atomics.wait(ctl, 0, 0, 50);

let wins = 0;
let losses = 0;
let errors = 0;
const firstAt = Date.now();
const now = new Date();

for (const id of ids) {
  try {
    if (await store.claimForSend(id, now)) wins += 1;
    else losses += 1;
  } catch {
    errors += 1;
  }
}
const lastAt = Date.now();

await driver.close();
const result: ClaimWorkerResult = { wins, losses, errors, firstAt, lastAt };
parentPort?.postMessage(result);
