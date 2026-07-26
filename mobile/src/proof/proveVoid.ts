/**
 * Phase 2c-5 proof: voiding a bill, including one the server has never seen.
 *
 * Run: npm run prove:void
 *
 * Real SQLite files, fake transports. V4 uses a real child process killed with
 * SIGKILL and a file-backed server, because the invariant it defends — an owner
 * cancels a bill and the server is never told — fails silently and costs real
 * money.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { initConnection } from "../adapters/sqlite/schema.js";
import { buildLine } from "../cart/cart.js";
import { createLocalBill } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import type { LocalBill, SendOutcome, Transport, VoidOutcome } from "../sync/types.js";
import { isVoided } from "../sync/types.js";
import {
  FakeClock,
  FakeServer,
  OfflineTransport,
  OnlineTransport,
  SeqIds,
  VoidLosesFirstAckTransport,
} from "./fakes.js";
import { FileServer } from "./fileServer.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function tempDir(name: string): string {
  return mkdtempSync(join(tmpdir(), `recycle-2c5-${name}-`));
}

const ITEM = {
  id: "item-1",
  product_id: "prod-1",
  line_no: 1,
  gross_weight: "10.005",
  tare_weight: "0.002",
  net_weight: "10.003",
  unit_price: "15.00",
  list_price: "15.00",
};

async function makeBill(store: SqliteLocalStore, clock: FakeClock, ids: SeqIds): Promise<LocalBill> {
  return createLocalBill(
    { store, clock, ids },
    { seller_id: "sell-1", vehicle_no: null, items: [ITEM], total_amount: "150.05" },
  );
}

/** Counts void calls so the ORDER of send-then-void can be asserted, not assumed. */
class CountingTransport implements Transport {
  voidCalls = 0;
  constructor(private readonly inner: Transport) {}
  sendBill(bill: LocalBill): Promise<SendOutcome> {
    return this.inner.sendBill(bill);
  }
  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    this.voidCalls += 1;
    return this.inner.voidBill(bill, reason);
  }
}

/* ------------------------------------------------------------------ V0 ---- */

/**
 * The upgrade path. A device coming from 2c-4 has a local_bills table with no
 * void columns and REAL unsynced bills in it.
 */
async function v0Migration(): Promise<void> {
  header("V0: an existing 2c-4 database migrates without losing its bills");
  const dir = tempDir("migrate");
  const file = join(dir, "old.db");

  // Exactly the 2c-4 table: ten columns, no void anything.
  const pre = NodeSqliteDriver.open(file);
  await pre.exec("PRAGMA busy_timeout = 5000");
  await pre.exec(`CREATE TABLE local_bills (
     id TEXT NOT NULL PRIMARY KEY,
     idempotency_key TEXT NOT NULL UNIQUE,
     payload_json TEXT NOT NULL,
     sync_state TEXT NOT NULL,
     attempt_count INTEGER NOT NULL DEFAULT 0,
     last_error TEXT,
     created_at TEXT NOT NULL,
     next_attempt_at TEXT NOT NULL,
     doc_no TEXT,
     synced_at TEXT,
     CHECK (sync_state IN ('pending','syncing','synced','failed'))
   ) STRICT`);
  const insertOld = `INSERT INTO local_bills (id, idempotency_key, payload_json, sync_state,
       attempt_count, last_error, created_at, next_attempt_at, doc_no, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  // One with device_created_at in its payload (the normal case) ...
  await pre.run(insertOld, [
    "old-bill-1", "old-idem-1",
    JSON.stringify({
      id: "old-bill-1", items: [ITEM], total_amount: "150.05",
      device_created_at: "2026-07-01T08:15:00.000Z",
    }),
    "pending", 2, "was offline", "2026-07-01T00:00:00.000Z",
    "2026-07-01T00:00:00.000Z", null, null,
  ]);
  // ... and one without it, to prove the fallback rather than assume it.
  await pre.run(insertOld, [
    "old-bill-2", "old-idem-2",
    JSON.stringify({ id: "old-bill-2", items: [ITEM], total_amount: "150.05" }),
    "pending", 0, null, "2026-07-02T00:00:00.000Z",
    "2026-07-02T00:00:00.000Z", null, null,
  ]);
  const before = await pre.all<{ name: string }>("PRAGMA table_info(local_bills)");
  await pre.close();
  console.log(`  before: ${String(before.length)} columns, 2 unsynced bills on disk`);

  const driver = NodeSqliteDriver.open(file);
  const added = await initConnection(driver);
  const after = await driver.all<{ name: string }>("PRAGMA table_info(local_bills)");
  console.log(`  migration added: ${JSON.stringify(added)}`);
  console.log(`  after:  ${String(after.length)} columns`);

  const store = await SqliteLocalStore.open(driver);
  const survivor = await store.getBill("old-bill-1");

  // Asserted by NAME, not by count: a count is a magic number that goes stale
  // the moment another column is added, and says nothing about which.
  const expected = [
    "device_created_at", "void_reason", "void_requested_at",
    "voided_at", "void_attempts", "void_last_error", "first_attempt_at",
    "first_server_error_at",
  ];
  check(
    "every new column was added",
    expected.every((c) => added.includes(c)) && added.length === expected.length,
    JSON.stringify(added),
  );

  const backfilled = await driver.all<{ id: string; device_created_at: string | null }>(
    "SELECT id, device_created_at FROM local_bills ORDER BY id",
  );
  console.log(`  backfill: ${JSON.stringify(backfilled)}`);
  check(
    "device_created_at was backfilled from the existing payload",
    backfilled.find((b) => b.id === "old-bill-1")?.device_created_at ===
      "2026-07-01T08:15:00.000Z",
    "the weighing time was always in the payload; the migration only lifts it somewhere sortable",
  );
  check(
    "the pre-existing bill survived with its state and attempt count",
    survivor?.sync_state === "pending" && survivor.attempt_count === 2 &&
      survivor.last_error === "was offline",
    `state=${String(survivor?.sync_state)} attempts=${String(survivor?.attempt_count)}`,
  );
  check(
    "its money is untouched",
    survivor?.payload.items[0]?.gross_weight === "10.005",
    `gross=${String(survivor?.payload.items[0]?.gross_weight)}`,
  );
  check(
    "it reads back as not-voided rather than as broken",
    survivor !== null && !isVoided(survivor) && survivor.void_attempts === 0,
  );
  const noDevField = await store.getBill("old-bill-2");
  check(
    "a legacy bill whose payload lacked the field falls back to created_at",
    noDevField?.device_created_at === "2026-07-02T00:00:00.000Z",
    "so the send queue never sorts a null to one end and silently reorders it",
  );
  // The index over the new columns must exist too — it is created after the
  // migration, not alongside the tables, or this query would throw here.
  const owed = await store.listVoidsToApply(10);
  check("void queries work on the migrated table", owed.length === 0);
  check(
    "a void can be requested on a bill that predates the feature",
    await store.requestVoid("old-bill-1", "ลูกค้ายกเลิก", new Date()),
  );

  // Running it a second time must be a no-op, not a duplicate-column error.
  const again = await initConnection(driver);
  check("re-running the migration adds nothing", again.length === 0, JSON.stringify(again));

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ V1 ---- */

async function v1VoidSyncedBill(): Promise<void> {
  header("V1: voiding a bill the server already has");
  const dir = tempDir("synced");
  const driver = NodeSqliteDriver.open(join(dir, "v1.db"));
  const store = await SqliteLocalStore.open(driver);
  const clock = new FakeClock();
  const server = new FakeServer();
  const transport = new CountingTransport(new OnlineTransport(server));
  const engine = new SyncEngine({ store, transport, clock, backoffBaseMs: 1000 });

  const bill = await makeBill(store, clock, new SeqIds("v1"));
  await engine.runUntilQuiescent();
  const synced = await store.getBill(bill.id);
  console.log(`  bill synced as ${String(synced?.doc_no)}`);

  const first = await store.requestVoid(bill.id, "ชั่งผิด", clock.now());
  const local = await store.getBill(bill.id);
  check("the void request is recorded locally", first && isVoided(local!));
  check(
    "and it shows as voided IMMEDIATELY, before any server round trip",
    local?.voided_at === null && local.void_reason === "ชั่งผิด",
    "void_requested_at drives the UI; voided_at is the server's confirmation",
  );

  const run = await engine.runOnce();
  const after = await store.getBill(bill.id);
  const onServer = server.findById(bill.id);
  console.log(`  runOnce -> voidsApplied=${String(run.voidsApplied)}  serverVoidCalls=${String(server.voidCalls)}`);
  console.log(`  server row: doc_no=${String(onServer?.doc_no)} voided_at=${String(onServer?.voided_at)} reason=${String(onServer?.void_reason)}`);

  check("the server marked it voided", onServer?.voided_at !== null);
  check("with the reason the owner typed", onServer?.void_reason === "ชั่งผิด");
  check(
    "the local row is settled",
    after !== null && after.voided_at !== null && after.void_last_error === null,
  );
  check("the bill still exists locally — never deleted", after !== null);
  check("and it kept its doc_no", after?.doc_no === synced?.doc_no && after?.doc_no !== null);
  check("exactly one bill on the server", server.billCount === 1);

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ V2 ---- */

/** The sequencing case: void a bill created offline, that has no doc_no yet. */
async function v2VoidNeverSyncedBill(): Promise<void> {
  header("V2: voiding a bill created offline — it must sync FIRST, then void");
  const dir = tempDir("offline");
  const driver = NodeSqliteDriver.open(join(dir, "v2.db"));
  const store = await SqliteLocalStore.open(driver);
  const clock = new FakeClock();
  const server = new FakeServer();

  // Offline: the bill cannot reach the server, and the owner voids it anyway.
  const offline = new CountingTransport(new OfflineTransport());
  const offlineEngine = new SyncEngine({ store, transport: offline, clock, backoffBaseMs: 1 });
  const bill = await makeBill(store, clock, new SeqIds("v2"));
  await offlineEngine.runOnce();
  await store.requestVoid(bill.id, "ลูกค้าเปลี่ยนใจ", clock.now());

  const whileOffline = await store.getBill(bill.id);
  const owedWhileUnsynced = await store.listVoidsToApply(10);
  await offlineEngine.runOnce();

  console.log(`  offline: doc_no=${String(whileOffline?.doc_no)} voided(local)=${String(isVoided(whileOffline!))}`);
  console.log(`  void attempts made while unsynced: ${String(offline.voidCalls)}`);

  check("the bill has no doc_no yet", whileOffline?.doc_no === null);
  check("but it already shows as voided to the owner", isVoided(whileOffline!));
  check(
    "the void is NOT yet eligible to send — the bill must exist server-side first",
    owedWhileUnsynced.length === 0,
  );
  check(
    "so no void call was attempted for a bill the server has never seen",
    offline.voidCalls === 0,
    "voiding first would 404, and the owner could never see it was created then cancelled",
  );
  check("and the bill was NOT deleted locally", (await store.getBill(bill.id)) !== null);

  // Network returns. One quiescent run must sync it AND void it.
  const online = new CountingTransport(new OnlineTransport(server));
  const onlineEngine = new SyncEngine({ store, transport: online, clock, backoffBaseMs: 1 });
  const run = await onlineEngine.runUntilQuiescent();
  const final = await store.getBill(bill.id);
  const onServer = server.findById(bill.id);

  console.log(`  back online -> ${JSON.stringify({ synced: run.synced, voidsApplied: run.voidsApplied })}`);
  console.log(`  server: bills=${String(server.billCount)} doc_no=${String(onServer?.doc_no)} voided_at=${String(onServer?.voided_at)}`);

  check("the bill reached the server", server.billCount === 1 && onServer !== undefined);
  check("it received a real doc_no", typeof onServer?.doc_no === "string" && onServer.doc_no.length > 0);
  check(
    "and was then voided, reason intact",
    onServer !== undefined && onServer.voided_at !== null &&
      onServer.void_reason === "ลูกค้าเปลี่ยนใจ",
  );
  check(
    "locally: synced, with doc_no, and settled as voided",
    final !== null && final.sync_state === "synced" && final.doc_no !== null &&
      final.voided_at !== null,
  );
  check("exactly one bill on the server — never duplicated", server.billCount === 1);
  check("exactly one void call was needed", online.voidCalls === 1, `calls=${String(online.voidCalls)}`);

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ V3 ---- */

async function v3VoidRetryAfterLostAck(): Promise<void> {
  header("V3: the void response is lost — retry must not double-apply or error");
  const dir = tempDir("lostack");
  const driver = NodeSqliteDriver.open(join(dir, "v3.db"));
  const store = await SqliteLocalStore.open(driver);
  const clock = new FakeClock();
  const server = new FakeServer();
  const transport = new VoidLosesFirstAckTransport(server);
  const engine = new SyncEngine({ store, transport, clock, backoffBaseMs: 1 });

  const bill = await makeBill(store, clock, new SeqIds("v3"));
  await engine.runUntilQuiescent();
  await store.requestVoid(bill.id, "ยกเลิกซ้ำ", clock.now());

  // Pass 1: the server applies the void, then the connection dies.
  const run1 = await engine.runOnce();
  const after1 = await store.getBill(bill.id);
  console.log(`  pass 1 -> applied=${String(run1.voidsApplied)} retryable=${String(run1.voidsRetryable)}  serverVoided=${String(server.voidedCount)}`);
  console.log(`  local after pass 1: voided_at=${String(after1?.voided_at)} last_error=${String(after1?.void_last_error)}`);

  check("the client could not confirm, so the void is still owed", run1.voidsRetryable === 1 && after1?.voided_at === null);
  check("the void request was NOT dropped", isVoided(after1!));
  check("the server did apply it though — this is the dangerous state", server.voidedCount === 1);

  // Pass 2: retry. The server answers "already voided", which is success.
  const run2 = await engine.runOnce();
  const after2 = await store.getBill(bill.id);
  console.log(`  pass 2 -> applied=${String(run2.voidsApplied)}  serverVoidCalls=${String(server.voidCalls)} serverVoided=${String(server.voidedCount)}`);

  check("the retry settles the void", run2.voidsApplied === 1 && after2?.voided_at !== null);
  check("no error is left showing to the owner", after2?.void_last_error === null);
  check(
    "the server was called twice but voided exactly once",
    server.voidCalls === 2 && server.voidedCount === 1,
    "409 already-voided is treated as success, not as a failure to retry forever",
  );
  check("the reason is still the original one", server.findById(bill.id)?.void_reason === "ยกเลิกซ้ำ");

  // A third void request must not overwrite the reason.
  const again = await store.requestVoid(bill.id, "เหตุผลใหม่", clock.now());
  const after3 = await store.getBill(bill.id);
  check(
    "voiding an already-voided bill locally is a no-op, keeping the first reason",
    !again && after3?.void_reason === "ยกเลิกซ้ำ",
    `reason=${String(after3?.void_reason)}`,
  );

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ V4 ---- */

async function v4CrashBetweenSyncAndVoid(): Promise<void> {
  header("V4: SIGKILL between 'bill synced' and 'void applied'");
  const dir = tempDir("crash");
  const dbFile = join(dir, "v4.db");
  const srvFile = join(dir, "server.json");

  const driver = NodeSqliteDriver.open(dbFile);
  const store = await SqliteLocalStore.open(driver);
  const clock = new FakeClock();
  const bill = await makeBill(store, clock, new SeqIds("v4"));
  await store.requestVoid(bill.id, "รถผิดคัน", clock.now());
  await driver.close();
  new FileServer(srvFile); // create the empty server file

  const child = fileURLToPath(new URL("./voidCrashChild.js", import.meta.url));
  const r = spawnSync(process.execPath, [child, dbFile, srvFile], { encoding: "utf8" });
  for (const line of (r.stdout || "").split("\n").filter(Boolean)) console.log(`  | ${line}`);
  console.log(`  child exit: status=${String(r.status)} signal=${String(r.signal)}`);
  check(
    "the child really died at the crash point",
    r.status !== 0 && r.status !== 99 && r.status !== 98,
    `status=${String(r.status)} — 99 would mean the hook never fired`,
  );

  const server = new FileServer(srvFile);
  const mid = server.snapshot();
  console.log(`  server after crash: bills=${String(mid.rows.length)} voided=${String(mid.rows.filter((x) => x.voided_at).length)} voidCalls=${String(mid.voidCalls)}`);
  check(
    "the bill IS on the server, active, with a doc_no — the dangerous state",
    mid.rows.length === 1 && mid.rows[0]?.voided_at === null && typeof mid.rows[0]?.doc_no === "string",
  );
  check("the server was never told about the void", mid.voidCalls === 0);

  // Restart: a fresh process, fresh connection, nothing carried in memory.
  const driver2 = NodeSqliteDriver.open(dbFile);
  const store2 = await SqliteLocalStore.open(driver2);
  const recovered = await store2.getBill(bill.id);
  console.log(`  on restart, local: sync_state=${String(recovered?.sync_state)} doc_no=${String(recovered?.doc_no)} voided(local)=${String(isVoided(recovered!))} voided_at=${String(recovered?.voided_at)}`);

  check(
    "the void intent survived the kill",
    recovered !== null && isVoided(recovered) && recovered.void_reason === "รถผิดคัน",
  );
  check("and it is still owed to the server", (await store2.listVoidsToApply(10)).length === 1);
  check(
    "the bill was never left looking active on the device",
    isVoided(recovered!),
    "void_requested_at is written before any network call, so the UI shows ยกเลิกแล้ว throughout",
  );

  const engine2 = new SyncEngine({
    store: store2,
    transport: new (await import("./fileServer.js")).FileServerTransport(server),
    clock,
    backoffBaseMs: 1,
  });
  const run = await engine2.runUntilQuiescent();
  const end = server.snapshot();
  const localEnd = await store2.getBill(bill.id);

  console.log(`  after restart run -> voidsApplied=${String(run.voidsApplied)}`);
  console.log(`  server: bills=${String(end.rows.length)} voided_at=${String(end.rows[0]?.voided_at)} reason=${String(end.rows[0]?.void_reason)}`);

  check("the void is applied after the restart", run.voidsApplied === 1);
  check("the server now shows it voided, with the reason", end.rows[0]?.voided_at !== null && end.rows[0]?.void_reason === "รถผิดคัน");
  check("still exactly one bill, never duplicated", end.rows.length === 1);
  check("its doc_no is unchanged by the void", end.rows[0]?.doc_no === mid.rows[0]?.doc_no);
  check("local row settled", localEnd?.voided_at !== null);

  await driver2.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ V5 ---- */

function v5ZeroValueLines(): void {
  header("V5: zero-value lines are refused; a zero TARE is not");

  const line = (gross: string, tare: string, price: string) =>
    buildLine({
      id: "l", product_id: "p", product_code: "FE", product_name: "เหล็ก",
      uom_code: "KG", gross, tare, price, list_price: price,
    });

  const zeroNet = line("1.000", "1.000", "15.00");
  console.log(`  gross 1.000 tare 1.000 -> ${zeroNet.ok ? "accepted" : `${zeroNet.field}/${zeroNet.error}`}`);
  check("net of zero is refused", !zeroNet.ok && zeroNet.error === "zero_net");

  const allZero = line("0.000", "0.000", "15.00");
  check("an all-zero line is refused", !allZero.ok && allZero.error === "zero_net");

  // Non-zero net AND non-zero price, yet the amount still rounds to nothing.
  const zeroAmount = line("0.001", "0.000", "0.01");
  console.log(`  net 0.001 x 0.01 = 0.00 -> ${zeroAmount.ok ? "accepted" : `${zeroAmount.field}/${zeroAmount.error}`}`);
  check(
    "an amount that rounds to zero is refused, even with a non-zero net and price",
    !zeroAmount.ok && zeroAmount.error === "zero_amount",
    "this is why the amount check is separate from the net check",
  );

  const freePrice = line("10.000", "0.000", "0.00");
  check("a zero price is refused via the amount", !freePrice.ok && freePrice.error === "zero_amount");

  const zeroTare = line("10.005", "0.000", "15.00");
  console.log(`  gross 10.005 tare 0.000 -> ${zeroTare.ok ? `accepted, amount ${zeroTare.line.amount}` : "REFUSED"}`);
  check(
    "a tare of 0.000 is perfectly valid — loose scrap has no container",
    zeroTare.ok && zeroTare.line.net_weight === "10.005" && zeroTare.line.amount === "150.08",
  );

  const normal = line("10.005", "0.002", "15.00");
  check("and a normal line is unaffected", normal.ok && normal.line.amount === "150.05");
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("Phase 2c-5 — void, confirm and zero-guard, headless proof");
  console.log(`node ${process.version}, node:sqlite against real files in ${tmpdir()}`);

  await v0Migration();
  await v1VoidSyncedBill();
  await v2VoidNeverSyncedBill();
  await v3VoidRetryAfterLostAck();
  await v4CrashBetweenSyncAndVoid();
  v5ZeroValueLines();

  console.log("");
  console.log(failures === 0 ? "ALL VOID CASES PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => {
    console.log(`VOID_EXIT=${code}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("VOID PROOF CRASHED:", err);
    process.exitCode = 1;
  });
