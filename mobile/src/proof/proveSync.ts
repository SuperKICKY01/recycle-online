/**
 * Phase 2a proof. Headless, node only, fake adapters, adversarial.
 *
 * The invariant every case asserts:
 *   distinct bills the server accepted === bills the user created
 * never fewer (lost), never more (duplicated).
 *
 * Run: npm run prove:sync
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createLocalBill } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import type { BillItemPayload, LocalBill } from "../sync/types.js";
import {
  FakeClock,
  FakeServer,
  FlakyTransport,
  GatedTransport,
  InMemoryStore,
  LostAckTransport,
  OfflineTransport,
  OnlineTransport,
  RejectingTransport,
  SendCounter,
  SeqIds,
  mulberry32,
} from "./fakes.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  const tag = ok ? "OK  " : "FAIL";
  console.log(`  [${tag}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function items(ids: SeqIds): BillItemPayload[] {
  return [
    {
      id: ids.newId(),
      product_id: "prod-aaaa-0001",
      line_no: 1,
      gross_weight: "10.500",
      tare_weight: "0.500",
      net_weight: "10.000",
      unit_price: "10.50",
      list_price: "10.50",
    },
  ];
}

interface Rig {
  clock: FakeClock;
  store: InMemoryStore;
  server: FakeServer;
  billIds: SeqIds;
  itemIds: SeqIds;
}

function rig(prefix: string): Rig {
  return {
    clock: new FakeClock(),
    store: new InMemoryStore(),
    server: new FakeServer(),
    billIds: new SeqIds(prefix),
    itemIds: new SeqIds(`${prefix}-item`),
  };
}

async function createBills(r: Rig, n: number): Promise<LocalBill[]> {
  const out: LocalBill[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(
      await createLocalBill(
        { store: r.store, clock: r.clock, ids: r.billIds },
        {
          seller_id: "sell-aaaa-0001",
          vehicle_no: "1กก-1234",
          items: items(r.itemIds),
          total_amount: null,
        },
      ),
    );
  }
  return out;
}

function invariant(r: Rig, created: LocalBill[], label = "server holds exactly the created bills"): void {
  const ids = r.server.distinctBillIds();
  const allPresent = created.every((b) => ids.has(b.id));
  check(
    label,
    r.server.billCount === created.length && ids.size === created.length && allPresent,
    `created=${created.length} onServer=${r.server.billCount} distinctIds=${ids.size} submitsIncludingRetries=${r.server.submits}`,
  );
}

/* ------------------------------------------------------------------ 0 ---- */

function case0Purity(): void {
  header("CASE 0: engine is pure TypeScript (architectural rule)");
  const dir = fileURLToPath(new URL("../../src/sync/", import.meta.url));
  const banned = /from\s+["'](react-native|expo[-/]?[^"']*|node:[^"']+)["']|require\(\s*["'](react-native|expo)/;
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  const offenders: string[] = [];
  for (const f of files) {
    const src = readFileSync(dir + f, "utf8");
    if (banned.test(src)) offenders.push(f);
  }
  check(
    `no react-native / expo / node: imports in src/sync (${files.length} files scanned)`,
    offenders.length === 0,
    offenders.length === 0 ? files.join(", ") : `offenders: ${offenders.join(", ")}`,
  );
}

/* ------------------------------------------------------------------ 1 ---- */

async function case1Happy(): Promise<void> {
  header("CASE 1: happy path");
  const r = rig("bill-h");
  const counter = new SendCounter();
  const engine = new SyncEngine({
    store: r.store,
    transport: new OnlineTransport(r.server, counter),
    clock: r.clock,
    backoffBaseMs: 1000,
  });

  const created = await createBills(r, 1);
  const bill = created[0]!;
  const afterCreate = await r.store.getBill(bill.id);
  check("bill is saved locally before any network call", afterCreate?.sync_state === "pending", `state=${afterCreate?.sync_state} doc_no=${String(afterCreate?.doc_no)}`);
  check("no doc_no yet while offline", afterCreate?.doc_no === null);

  const run = await engine.runOnce();
  const after = await r.store.getBill(bill.id);
  check("sync run sent exactly one bill", run.attempted === 1 && run.synced === 1, JSON.stringify(run));
  check("local state is synced", after?.sync_state === "synced", `state=${after?.sync_state} doc_no=${String(after?.doc_no)} attempts=${after?.attempt_count}`);
  check("server doc_no stored locally", after?.doc_no === "B-2569-1");
  check("transport called once", counter.get(bill.id) === 1);
  invariant(r, created);
}

/* ------------------------------------------------------------------ 2 ---- */

async function case2OfflineThenRestored(): Promise<void> {
  header("CASE 2: transport fails (offline), then network restored");
  const r = rig("bill-o");
  const created = await createBills(r, 1);
  const bill = created[0]!;

  const offline = new SyncEngine({
    store: r.store,
    transport: new OfflineTransport(),
    clock: r.clock,
    backoffBaseMs: 1000,
  });
  const run1 = await offline.runOnce();
  const afterFail = await r.store.getBill(bill.id);
  check("failed send returns the bill to pending, not stuck syncing", afterFail?.sync_state === "pending", `state=${afterFail?.sync_state}`);
  check("attempt_count incremented", afterFail?.attempt_count === 1, `attempts=${afterFail?.attempt_count}`);
  check("last_error is recorded and visible", afterFail?.last_error === "Network request failed", `last_error=${String(afterFail?.last_error)}`);
  check("nothing reached the server", r.server.billCount === 0, `run=${JSON.stringify(run1)}`);

  // Backoff gate: the bill is not eligible again until next_attempt_at.
  const beforeBackoff = await r.store.listReadyToSend(r.clock.now(), 10);
  check("backoff holds the bill back before the delay elapses", beforeBackoff.length === 0, `next_attempt_at=${String(afterFail?.next_attempt_at)}`);
  r.clock.advance(1000);

  const counter = new SendCounter();
  const online = new SyncEngine({
    store: r.store,
    transport: new OnlineTransport(r.server, counter),
    clock: r.clock,
    backoffBaseMs: 1000,
  });
  const run2 = await online.runOnce();
  const after = await r.store.getBill(bill.id);
  check("second run syncs it", run2.synced === 1 && after?.sync_state === "synced", `state=${after?.sync_state} attempts=${after?.attempt_count}`);
  check("last_error cleared on success", after?.last_error === null);
  invariant(r, created);
}

/* ------------------------------------------------------------------ 3 ---- */

async function case3LostResponse(): Promise<void> {
  header("CASE 3: LOST RESPONSE (server committed, ack never arrived)");
  const r = rig("bill-l");
  const created = await createBills(r, 1);
  const bill = created[0]!;
  const counter = new SendCounter();

  const lossy = new SyncEngine({
    store: r.store,
    transport: new LostAckTransport(r.server, counter),
    clock: r.clock,
    backoffBaseMs: 1000,
  });
  await lossy.runOnce();
  const afterLoss = await r.store.getBill(bill.id);
  check("server DID commit the bill", r.server.billCount === 1);
  check("client does not know it and stays pending", afterLoss?.sync_state === "pending", `state=${afterLoss?.sync_state} last_error=${String(afterLoss?.last_error)}`);

  r.clock.advance(1000);
  const retry = new SyncEngine({
    store: r.store,
    transport: new OnlineTransport(r.server, counter),
    clock: r.clock,
    backoffBaseMs: 1000,
  });
  const run = await retry.runOnce();
  const after = await r.store.getBill(bill.id);
  check("retry reuses the SAME idempotency key", bill.idempotency_key === after?.idempotency_key, `key=${bill.idempotency_key}`);
  check("server answers 'already exists' and the engine treats it as success", run.synced === 1 && after?.sync_state === "synced", `state=${after?.sync_state} attempts=${after?.attempt_count}`);
  check("transport was called twice", counter.get(bill.id) === 2);
  invariant(r, created);
}

/* ------------------------------------------------------------------ 4 ---- */

async function case4CrashDuringSyncing(): Promise<void> {
  header("CASE 4: crash while syncing, then restart");
  const r = rig("bill-c");
  const created = await createBills(r, 1);
  const bill = created[0]!;

  // Kill the process exactly between claim and outcome.
  r.store.forceState(bill.id, "syncing");
  const stranded = await r.store.getBill(bill.id);
  check("bill is stranded in syncing", stranded?.sync_state === "syncing");

  // Restart: new process, new engine, same durable rows.
  const rebooted = new InMemoryStore(r.store.snapshot());
  const counter = new SendCounter();
  const engine = new SyncEngine({
    store: rebooted,
    transport: new OnlineTransport(r.server, counter),
    clock: r.clock,
    backoffBaseMs: 1000,
  });

  const beforeRecovery = await rebooted.listReadyToSend(r.clock.now(), 10);
  check("without recovery it would never be sent again", beforeRecovery.length === 0);

  const recovered = await engine.recoverInterrupted();
  const afterRecovery = await rebooted.getBill(bill.id);
  check("startup recovery returns it to pending", recovered.length === 1 && afterRecovery?.sync_state === "pending", `recovered=${JSON.stringify(recovered)}`);

  const run = await engine.runOnce();
  const after = await rebooted.getBill(bill.id);
  check("it then syncs", run.synced === 1 && after?.sync_state === "synced", `state=${after?.sync_state}`);
  invariant(r, created);
}

/* ------------------------------------------------------------------ 5 ---- */

async function case5FlakyMany(seed: number, count: number): Promise<void> {
  header(`CASE 5: ${count} pending bills, flaky transport (seed=${seed})`);
  const r = rig("bill-f");
  const created = await createBills(r, count);
  const counter = new SendCounter();
  const transport = new FlakyTransport(r.server, mulberry32(seed), counter);
  const engine = new SyncEngine({
    store: r.store,
    transport,
    clock: r.clock,
    backoffBaseMs: 1000,
    backoffMaxMs: 4000,
    batchLimit: 200,
  });

  const total = await engine.runUntilQuiescent(500, 5000);
  const synced = await r.store.listByState("synced");
  const pending = await r.store.listByState("pending");
  const syncing = await r.store.listByState("syncing");
  const failed = await r.store.listByState("failed");

  const modes = transport.modes.reduce<Record<string, number>>((acc, m) => {
    acc[m] = (acc[m] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  transport outcomes: ${JSON.stringify(modes)}`);
  console.log(`  engine totals: ${JSON.stringify(total)}`);

  check(`all ${count} bills locally synced`, synced.length === count, `synced=${synced.length} pending=${pending.length} syncing=${syncing.length} failed=${failed.length}`);
  check("nothing left stranded in syncing", syncing.length === 0);
  check("more submits than bills (duplicates really were attempted)", r.server.submits > count, `submits=${r.server.submits} bills=${count}`);
  invariant(r, created, "zero duplicates, zero lost on the server");
}

/* ------------------------------------------------------------------ 6 ---- */

async function case6DoubleTrigger(): Promise<void> {
  header("CASE 6: rapid double-trigger of sync while a send is in flight");
  const r = rig("bill-d");
  const created = await createBills(r, 1);
  const bill = created[0]!;
  const counter = new SendCounter();
  const gated = new GatedTransport(r.server, counter);
  const engine = new SyncEngine({
    store: r.store,
    transport: gated,
    clock: r.clock,
    backoffBaseMs: 1000,
  });

  const first = engine.runOnce();
  const second = engine.runOnce();
  // Let both runs get as far as they can while the send hangs.
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();

  const midFlight = await r.store.getBill(bill.id);
  check("bill is claimed (syncing) while in flight", midFlight?.sync_state === "syncing", `state=${midFlight?.sync_state}`);
  const stolen = await r.store.claimForSend(bill.id, r.clock.now());
  check("a competing claim on an in-flight bill is refused", stolen === false);

  gated.open();
  const r1 = await first;
  const r2 = await second;
  const after = await r.store.getBill(bill.id);

  check("transport was entered once for this bill", gated.started.length === 1 && counter.get(bill.id) === 1, `started=${JSON.stringify(gated.started)} sends=${counter.get(bill.id)}`);
  check("one run sent it, the other skipped it", r1.attempted + r2.attempted === 1 && r1.skippedInFlight + r2.skippedInFlight === 1, `run1=${JSON.stringify(r1)} run2=${JSON.stringify(r2)}`);
  check("bill ends synced", after?.sync_state === "synced");
  invariant(r, created);
}

/* ------------------------------------------------------------------ 7 ---- */

async function case7RejectionIsNotRetry(): Promise<void> {
  header("CASE 7 (extra): a server REJECTION is not a transport failure");
  const r = rig("bill-r");
  const created = await createBills(r, 1);
  const bill = created[0]!;
  const engine = new SyncEngine({
    store: r.store,
    transport: new RejectingTransport(),
    clock: r.clock,
    backoffBaseMs: 1000,
  });

  const run = await engine.runOnce();
  const after = await r.store.getBill(bill.id);
  check("rejected bill is terminally failed, not retried forever", run.rejected === 1 && after?.sync_state === "failed", `state=${after?.sync_state} run=${JSON.stringify(run)}`);
  check("the reason is visible to the UI", after?.last_error === "HTTP 422: seller_id does not exist in this tenant", `last_error=${String(after?.last_error)}`);

  r.clock.advance(60_000);
  const ready = await r.store.listReadyToSend(r.clock.now(), 10);
  check("a failed bill is not silently resent", ready.length === 0);
  check("nothing was created on the server", r.server.billCount === 0, `created=${created.length} onServer=0 (correct: the server refused it)`);
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  const seed = 20260721;
  console.log("Phase 2a — mobile local store + sync engine, headless proof");
  console.log(`node ${process.version}, fake adapters only, no network, no device`);

  case0Purity();
  await case1Happy();
  await case2OfflineThenRestored();
  await case3LostResponse();
  await case4CrashDuringSyncing();
  await case5FlakyMany(seed, 50);
  await case6DoubleTrigger();
  await case7RejectionIsNotRetry();

  console.log("");
  if (failures === 0) {
    console.log("ALL CASES PASSED");
  } else {
    console.log(`INVARIANT FAILED — ${failures} check(s) failed`);
  }

  console.log("");
  console.log("NOT PROVEN BY THIS RUN:");
  console.log("  - The real expo-sqlite LocalStore adapter. It does not exist yet and is");
  console.log("    not exercised here; every case above ran against an in-memory fake.");
  console.log("    Durability across a real process kill, SQLite transaction semantics,");
  console.log("    and the atomicity of claimForSend on a real device are UNVERIFIED.");
  console.log("  - HttpTransport against the real server. It is written but was never");
  console.log("    called in this run; the status mapping (201/200/422) is asserted only");
  console.log("    against the Phase 1c contract on paper, not over HTTP.");
  console.log("  - Anything on a device or emulator: React Native, Expo, app lifecycle,");
  console.log("    background sync, real clocks, real network transitions.");
  console.log("  That is Phase 2b.");

  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => {
    console.log(`SCRIPT_EXIT=${code}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("PROOF CRASHED:", err);
    process.exitCode = 1;
  });
