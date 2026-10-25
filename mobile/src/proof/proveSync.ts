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
import { billNotice } from "../sync/parkedReason.js";
import { assessQueue, POISON_ALARM_ATTEMPTS, POISON_ALARM_MS } from "../sync/queueHealth.js";
import { NOTHING_OWED } from "../sync/outbox.js";
import { statusNotice } from "../sync/statusNotice.js";
import type { BillItemPayload, LocalBill, LocalStore } from "../sync/types.js";
import {
  ExpiredSessionTransport,
  FakeClock,
  FakeServer,
  FlakyTransport,
  GatedTransport,
  HeadFailingTransport,
  LegacyUnauthorizedTransport,
  LostAckTransport,
  MasterDataMissingTransport,
  mulberry32,
  noSellerKind,
  OfflineTransport,
  OnlineTransport,
  PROOF_OWNER,
  RejectingTransport,
  SendCounter,
  SeqIds,
} from "./fakes.js";
import type { StoreHarness, StoreSession } from "./harness.js";
import { memoryHarness, sqliteHarness } from "./harness.js";

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
  /** The interface type, never a concrete store — cases must not know which. */
  store: LocalStore;
  session: StoreSession;
  server: FakeServer;
  billIds: SeqIds;
  itemIds: SeqIds;
}

/** Every session opened this run, so main() can close and delete them all. */
const openSessions: StoreSession[] = [];

async function disposeAll(): Promise<void> {
  // Newest first: CASE 4's restarted session shares a directory with the one it
  // replaced, and the directory can only be removed once nothing holds it open.
  for (const s of openSessions.splice(0).reverse()) await s.dispose();
}

async function rig(harness: StoreHarness, prefix: string): Promise<Rig> {
  const session = await harness.open(prefix);
  openSessions.push(session);
  return {
    clock: new FakeClock(),
    store: session.store,
    session,
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
          seller: { kind: "server", seller_id: "sell-aaaa-0001" },
          vehicle_no: "1กก-1234",
          items: items(r.itemIds),
          total_amount: null,
          master_as_of: null,
        },
    PROOF_OWNER,
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

async function case1Happy(harness: StoreHarness): Promise<void> {
  header("CASE 1: happy path");
  const r = await rig(harness, "bill-h");
  const counter = new SendCounter();
  const engine = new SyncEngine({ ...noSellerKind(),
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

async function case2OfflineThenRestored(harness: StoreHarness): Promise<void> {
  header("CASE 2: transport fails (offline), then network restored");
  const r = await rig(harness, "bill-o");
  const created = await createBills(r, 1);
  const bill = created[0]!;

  const offline = new SyncEngine({ ...noSellerKind(),
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
  const online = new SyncEngine({ ...noSellerKind(),
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

async function case3LostResponse(harness: StoreHarness): Promise<void> {
  header("CASE 3: LOST RESPONSE (server committed, ack never arrived)");
  const r = await rig(harness, "bill-l");
  const created = await createBills(r, 1);
  const bill = created[0]!;
  const counter = new SendCounter();

  const lossy = new SyncEngine({ ...noSellerKind(),
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
  const retry = new SyncEngine({ ...noSellerKind(),
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

async function case4CrashDuringSyncing(harness: StoreHarness): Promise<void> {
  header("CASE 4: crash while syncing, then restart");
  const r = await rig(harness, "bill-c");
  const created = await createBills(r, 1);
  const bill = created[0]!;

  // Kill the process exactly between claim and outcome.
  await r.session.forceSyncing(bill.id);
  const stranded = await r.store.getBill(bill.id);
  check("bill is stranded in syncing", stranded?.sync_state === "syncing");

  // Restart: new process, new engine, same durable rows.
  const restarted = await r.session.restart();
  openSessions.push(restarted);
  const rebooted = restarted.store;
  const counter = new SendCounter();
  const engine = new SyncEngine({ ...noSellerKind(),
    store: rebooted,
    transport: new OnlineTransport(r.server, counter),
    clock: r.clock,
    backoffBaseMs: 1000,
  });

  const beforeRecovery = await rebooted.listReadyToSend(r.clock.now(), 10);
  check("without recovery it would never be sent again", beforeRecovery.length === 0);

  // CHANGED at P1.18 stage 3 by a named behaviour change: recoverInterrupted
  // returns a map keyed by kind — the boot sweeps THROUGH the registry, and
  // the key set equalling the kind set is the only observable a kind with a
  // no-op recovery has (a boot calling resetSyncingToPending directly could
  // not produce it).
  const recovered = await engine.recoverInterrupted();
  const afterRecovery = await rebooted.getBill(bill.id);
  check(
    "startup recovery returns it to pending, reported under its kind",
    recovered.bill_send.length === 1 && recovered.bill_send[0] === bill.id &&
      afterRecovery?.sync_state === "pending",
    `recovered=${JSON.stringify(recovered)}`,
  );
  check(
    // SUPERSEDED 2026-08-25 (P1.8b): this read "bill_send,bill_void". A third
    // kind, `seller_create`, joined the union. THE COMPILER COULD NOT SEE THIS
    // — it is a string comparison — and it was found by a run going red, not by
    // a search, which is the whole subject of
    // lessons/a-quantified-sentence-names-no-member.md.
    "the recovery map's key set EQUALS the kind set",
    Object.keys(recovered).sort().join(",") === "bill_send,bill_void,sale_send,seller_create",
    JSON.stringify(Object.keys(recovered)),
  );

  const run = await engine.runOnce();
  const after = await rebooted.getBill(bill.id);
  check("it then syncs", run.synced === 1 && after?.sync_state === "synced", `state=${after?.sync_state}`);
  invariant(r, created);
}

/* ------------------------------------------------------------------ 5 ---- */

async function case5FlakyMany(harness: StoreHarness, seed: number, count: number): Promise<void> {
  header(`CASE 5: ${count} pending bills, flaky transport (seed=${seed})`);
  const r = await rig(harness, "bill-f");
  const created = await createBills(r, count);
  const counter = new SendCounter();
  const transport = new FlakyTransport(r.server, mulberry32(seed), counter);
  const engine = new SyncEngine({ ...noSellerKind(),
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

/**
 * Yields to the event loop until `cond` holds, returning how many yields it
 * took. Used instead of a fixed number of `await Promise.resolve()` ticks.
 *
 * Phase 2c-3 is why: the SQLite driver now serialises every statement through
 * a Mutex, which adds microtask hops, so "three ticks" stopped being a point at
 * which the claim had happened. A fixed tick count encodes the scheduler's
 * current shape into the test and silently changes WHAT MOMENT is observed
 * whenever the storage layer changes — a green that has quietly stopped
 * measuring the thing it names. Waiting for the observable event is stable
 * across both stores.
 */
async function waitFor(cond: () => boolean, maxYields = 500): Promise<number> {
  for (let i = 0; i < maxYields; i += 1) {
    if (cond()) return i;
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return -1;
}

async function case6DoubleTrigger(harness: StoreHarness): Promise<void> {
  header("CASE 6: rapid double-trigger of sync while a send is in flight");
  const r = await rig(harness, "bill-d");
  const created = await createBills(r, 1);
  const bill = created[0]!;
  const counter = new SendCounter();
  const gated = new GatedTransport(r.server, counter);
  const engine = new SyncEngine({ ...noSellerKind(),
    store: r.store,
    transport: gated,
    clock: r.clock,
    backoffBaseMs: 1000,
  });

  const first = engine.runOnce();
  const second = engine.runOnce();
  // Let both runs get as far as they can, then observe at the moment the send
  // is genuinely in flight — not at a guessed number of ticks.
  const yields = await waitFor(() => gated.started.length === 1);
  console.log(`  send entered after ${String(yields)} yield(s); transport is holding it open`);

  const midFlight = await r.store.getBill(bill.id);
  check("bill is claimed (syncing) while in flight", midFlight?.sync_state === "syncing", `state=${midFlight?.sync_state}`);
  const stolen = await r.store.claimForSend(bill.id, r.clock.now());
  check("a competing claim on an in-flight bill is refused", stolen === false);

  gated.open();
  const r1 = await first;
  const r2 = await second;
  const after = await r.store.getBill(bill.id);

  check("transport was entered once for this bill", gated.started.length === 1 && counter.get(bill.id) === 1, `started=${JSON.stringify(gated.started)} sends=${counter.get(bill.id)}`);
  // CHANGED at P1.18 stage 3 by a named behaviour change: the process-scoped
  // pass lock (PASSES-OVERLAP-AND-ORDER-HOLDS). The losing pass no longer
  // reads the queue and skips the held head — it RETURNS WITHOUT READING
  // ROWS, so it reports nothing at all, and skippedInFlight's live meaning
  // narrows to a lost durable claim. The durable guard's own cell above ("a
  // competing claim on an in-flight bill is refused") is unchanged.
  check(
    "one run sent it, the other returned without reading rows",
    r1.attempted + r2.attempted === 1 &&
      r1.synced + r2.synced === 1 &&
      r1.skippedInFlight + r2.skippedInFlight === 0,
    `run1=${JSON.stringify(r1)} run2=${JSON.stringify(r2)}`,
  );
  check("bill ends synced", after?.sync_state === "synced");
  invariant(r, created);
}

/* ------------------------------------------------------------------ 7 ---- */

/**
 * CASE 8 — the doc_no ordering defect found on the device.
 *
 * Observed: B-2569-34 was weighed at 22:53:38 and B-2569-33 at 22:54:51, yet 34
 * arrived at the server SECOND and took the higher number, so the document
 * numbers contradicted the order the loads were actually bought.
 *
 * Two mechanisms had to be fixed, and this case exercises both:
 *   - the queue was ordered by the row's created_at, not by the weighing time;
 *   - an older bill that had failed a few times sat behind its retry backoff,
 *     so it was not even a candidate while newer bills went straight out.
 */
async function case8WeighingOrder(harness: StoreHarness): Promise<void> {
  header("CASE 8: a backlog syncs in WEIGHING order, so doc_no follows it");
  const r = await rig(harness, "bill-ord");

  // Five bills whose weighing times are deliberately NOT in insertion order:
  // the clock jumps around, as it would if bills were entered from notes.
  const offsets = [40, 10, 50, 0, 25];
  const created: LocalBill[] = [];
  for (const min of offsets) {
    r.clock.advance(min * 60_000);
    created.push(
      await createLocalBill(
        { store: r.store, clock: r.clock, ids: r.billIds },
        { seller: { kind: "server", seller_id: "sell-aaaa-0001" }, vehicle_no: null, items: items(r.itemIds), total_amount: null, master_as_of: null },
    PROOF_OWNER,
  ),
    );
    r.clock.advance(-min * 60_000); // rewind, so the NEXT offset is absolute
  }

  // All five fail while offline, collecting a backoff.
  const offline = new SyncEngine({ ...noSellerKind(),
    store: r.store,
    transport: new OfflineTransport(),
    clock: r.clock,
    backoffBaseMs: 30_000,
  });
  await offline.runOnce();
  await offline.runOnce();

  const gatedBefore = await r.store.listReadyToSend(r.clock.now(), 100);
  console.log(`  after the outage, ${String(gatedBefore.length)} of 5 bills are past their backoff`);

  const byWeighing = [...created].sort((a, b) =>
    a.device_created_at.localeCompare(b.device_created_at),
  );
  console.log(`  weighing order: ${byWeighing.map((b) => b.device_created_at.slice(11, 19)).join(" < ")}`);

  // Network returns.
  const engine = new SyncEngine({ ...noSellerKind(),
    store: r.store,
    transport: new OnlineTransport(r.server),
    clock: r.clock,
    backoffBaseMs: 1000,
  });
  const run = await engine.runUntilQuiescent();
  console.log(`  run -> synced=${String(run.synced)} backoffsCleared=${String(run.backoffsCleared)}`);

  const finals = await Promise.all(byWeighing.map((b) => r.store.getBill(b.id)));
  const docNos = finals.map((b) => b?.doc_no ?? "-");
  const seqs = docNos.map((d) => Number(d.split("-").pop()));
  console.log(`  doc_no in weighing order: ${docNos.join(" , ")}`);

  check("all five reached the server", r.server.billCount === 5 && run.synced === 5);
  check(
    "doc_no increases strictly with weighing time",
    seqs.every((n, i) => i === 0 || n > seqs[i - 1]!),
    `sequence=${seqs.join(",")}`,
  );
  check(
    "the earliest-weighed bill has the LOWEST doc_no",
    seqs[0] === Math.min(...seqs),
    `first=${String(seqs[0])} min=${String(Math.min(...seqs))}`,
  );
  check(
    "a stale backoff did not gate an older bill out of the queue",
    run.backoffsCleared > 0 || gatedBefore.length === 5,
    `backoffsCleared=${String(run.backoffsCleared)} readyBefore=${String(gatedBefore.length)}`,
  );
  invariant(r, created, "server holds exactly the five bills");

  /* ---- the exact device sequence that produced B-2569-33/34 ------------- */

  header("CASE 8b: a newer bill may NOT overtake an older one stuck in backoff");
  const q = await rig(harness, "bill-hol");

  // A is weighed, and its send fails — it now sits behind a 30s backoff.
  const a = (await createBills(q, 1))[0]!;
  const offlineEngine = new SyncEngine({ ...noSellerKind(),
    store: q.store,
    transport: new OfflineTransport(),
    clock: q.clock,
    backoffBaseMs: 30_000,
  });
  await offlineEngine.runOnce();

  // 10 seconds later the network is fine and B is weighed. This is the shape
  // that produced the defect: B is immediately sendable, A is not.
  q.clock.advance(10_000);
  const b = (await createBills(q, 1))[0]!;

  const onlineEngine = new SyncEngine({ ...noSellerKind(),
    store: q.store,
    transport: new OnlineTransport(q.server),
    clock: q.clock,
    backoffBaseMs: 1000,
  });
  const blocked = await onlineEngine.runOnce();
  const readyNow = await q.store.listReadyToSend(q.clock.now(), 10);

  console.log(`  A weighed ${a.device_created_at.slice(11, 19)} (send failed, in backoff)`);
  console.log(`  B weighed ${b.device_created_at.slice(11, 19)} (network fine)`);
  console.log(`  backoff-filtered queue would offer: ${JSON.stringify(readyNow.map((x) => (x.id === b.id ? "B" : "A")))}`);
  console.log(`  runOnce while A is gated -> sent=${String(blocked.synced)}  billsOnServer=${String(q.server.billCount)}`);

  check(
    "B alone is past its backoff, so a naive queue WOULD send it",
    readyNow.length === 1 && readyNow[0]?.id === b.id,
    "this is the state that caused the defect — the case is not vacuous",
  );
  check(
    "but nothing is sent: the head of the queue blocks it",
    blocked.synced === 0 && q.server.billCount === 0,
    `synced=${String(blocked.synced)}`,
  );

  // Once A's backoff elapses, both go — oldest first, in one pass.
  q.clock.advance(30_000);
  const drained = await onlineEngine.runOnce();
  const aFinal = await q.store.getBill(a.id);
  const bFinal = await q.store.getBill(b.id);
  const aSeq = Number(aFinal?.doc_no?.split("-").pop());
  const bSeq = Number(bFinal?.doc_no?.split("-").pop());
  console.log(`  after the backoff elapses -> synced=${String(drained.synced)}  A=${String(aFinal?.doc_no)}  B=${String(bFinal?.doc_no)}`);

  check("both bills sync in the same pass", drained.synced === 2);
  check(
    "the EARLIER-weighed bill got the LOWER doc_no",
    aSeq < bSeq,
    `A(${a.device_created_at.slice(11, 19)})=${String(aFinal?.doc_no)} < B(${b.device_created_at.slice(11, 19)})=${String(bFinal?.doc_no)}`,
  );
}

/* ------------------------------------------------------------------ 9 ---- */

/**
 * CASE 9 — a jammed head is VISIBLE, and OFFLINE is told apart from POISONED.
 *
 * Strict head-of-line order (CASE 8) is deliberately unforgiving: one unsendable
 * bill holds up every bill behind it. Two very different things can cause that,
 * and staff respond to them differently:
 *
 *   OFFLINE — the whole network is down. A backlog is normal and honest; it must
 *   stay CALM AMBER however long it lasts, or the alarm cries wolf every time a
 *   yard loses signal and staff learn to ignore the strip.
 *
 *   POISONED — one bill makes the REACHABLE server fail every time (a 5xx on its
 *   own payload, classified `unavailable`, not `rejected`, so it retries
 *   forever). Only support can clear it; it must go LOUD RED.
 *
 * The signal that separates them is NOT elapsed time and NOT attempt count —
 * both bounce for minutes. It is whether the server ANSWERED. This case drives
 * BOTH paths past the SAME threshold and asserts they end in DIFFERENT states,
 * then fixes the poison server and watches the backlog drain in weighing order —
 * proving the poisoned queue was jammed, not dead.
 */
async function case9OfflineVsPoison(harness: StoreHarness): Promise<void> {
  // Both paths are driven the same distance past the threshold, on purpose: the
  // only thing that may differ between them is the reachable-server signal.
  const totalMs = POISON_ALARM_MS + 30_000;
  const stepMs = 10_000;

  /* ---- 9a: a pure-OFFLINE backlog stays amber, even past the threshold ---- */

  header("CASE 9a: an OFFLINE backlog stays calm amber — even long past the alarm threshold");
  const off = await rig(harness, "bill-off");

  // Three bills weighed in order; the network is simply down for all of them.
  const offBills: LocalBill[] = [];
  for (let i = 0; i < 3; i += 1) {
    offBills.push(
      await createLocalBill(
        { store: off.store, clock: off.clock, ids: off.billIds },
        { seller: { kind: "server", seller_id: "sell-aaaa-0001" }, vehicle_no: null, items: items(off.itemIds), total_amount: null, master_as_of: null },
    PROOF_OWNER,
  ),
    );
    off.clock.advance(60_000);
  }
  const offlineEngine = new SyncEngine({ ...noSellerKind(),
    store: off.store,
    transport: new OfflineTransport(),
    clock: off.clock,
    backoffBaseMs: 1000,
    backoffMaxMs: 5000,
    batchLimit: 50,
  });

  // Keep bouncing, offline, for well past the alarm threshold.
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    off.clock.advance(stepMs);
    await offlineEngine.runOnce();
  }
  const offSnap = await off.store.pendingQueueSnapshot();
  const offlineHealth = assessQueue(offSnap, off.clock.now());

  check(
    "the head bounced repeatedly and all three bills are still pending",
    (offSnap.head?.attempts ?? 0) >= 3 && offSnap.pendingCount === 3,
    `attempts=${String(offSnap.head?.attempts)} pending=${String(offSnap.pendingCount)}`,
  );
  check("nothing reached the server", off.server.billCount === 0);
  check(
    "it has been unable to send for LONGER than the alarm threshold",
    offlineHealth.blockedForMs >= POISON_ALARM_MS,
    `blockedForMs=${String(offlineHealth.blockedForMs)} threshold=${String(POISON_ALARM_MS)}`,
  );
  check(
    "yet it reads as OFFLINE, not poisoned — the server never answered",
    offlineHealth.offline === true &&
      offlineHealth.poisoned === false &&
      offlineHealth.poisonedForMs === 0,
    `offline=${String(offlineHealth.offline)} poisoned=${String(offlineHealth.poisoned)} poisonedForMs=${String(offlineHealth.poisonedForMs)}`,
  );
  check(
    "so NO red alarm and NO blocker marked — a long outage is honest amber",
    offlineHealth.alarm === false && offlineHealth.blockerId === null,
    `alarm=${String(offlineHealth.alarm)} blockerId=${String(offlineHealth.blockerId)}`,
  );

  /* ---- 9b: a POISONED head goes loud red once it persists ---- */

  header("CASE 9b: a POISONED head (reachable server, 5xx every time) goes LOUD RED");
  const r = await rig(harness, "bill-blk");

  // Four bills weighed strictly in order A < B < C < D.
  const created: LocalBill[] = [];
  for (let i = 0; i < 4; i += 1) {
    created.push(
      await createLocalBill(
        { store: r.store, clock: r.clock, ids: r.billIds },
        { seller: { kind: "server", seller_id: "sell-aaaa-0001" }, vehicle_no: null, items: items(r.itemIds), total_amount: null, master_as_of: null },
    PROOF_OWNER,
  ),
    );
    r.clock.advance(60_000); // each later bill is weighed a minute after the last
  }
  const a = created[0]!;
  const b = created[1]!;
  const c = created[2]!;
  const d = created[3]!;

  // A is the poison pill: the REACHABLE server errors on it every time — a 5xx,
  // so `unavailable` with reachable:true, NOT rejected. It retries forever.
  const failing = new HeadFailingTransport(r.server, a.id);
  const engine = new SyncEngine({ ...noSellerKind(),
    store: r.store,
    transport: failing,
    clock: r.clock,
    backoffBaseMs: 1000,
    backoffMaxMs: 5000,
    batchLimit: 50,
  });

  // One pass: A is tried and bounces; B, C, D sit behind it, untried.
  await engine.runOnce();
  let snap = await r.store.pendingQueueSnapshot();
  let health = assessQueue(snap, r.clock.now());

  check(
    "only the poisoned head was ever attempted",
    failing.attemptedIds.length >= 1 && failing.attemptedIds.every((id) => id === a.id),
    `attempted=${JSON.stringify(failing.attemptedIds)}`,
  );
  check("nothing reached the server", r.server.billCount === 0);
  check("all four bills are still pending", snap.pendingCount === 4, `pending=${String(snap.pendingCount)}`);
  check(
    "the head is A (earliest weighed) and it has bounced",
    snap.head?.id === a.id && (snap.head?.attempts ?? 0) >= 1,
    `head=${String(snap.head?.id)} attempts=${String(snap.head?.attempts)}`,
  );
  check(
    "it reads as POISONED — the server answered (5xx) — with three bills behind it",
    health.poisoned === true && health.offline === false && health.behind === 3,
    `poisoned=${String(health.poisoned)} offline=${String(health.offline)} behind=${String(health.behind)}`,
  );
  check(
    "but the LOUD alarm holds off below the threshold (not vacuous)",
    health.alarm === false && health.blockerId === null,
    `poisonedForMs=${String(health.poisonedForMs)} threshold=${String(POISON_ALARM_MS)}`,
  );

  // The reachable server keeps erroring on A for well past the threshold. Each
  // step advances the clock beyond the capped backoff, so A really is retried.
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    r.clock.advance(stepMs);
    await engine.runOnce();
  }

  snap = await r.store.pendingQueueSnapshot();
  const poisonHealth = assessQueue(snap, r.clock.now());

  check(
    "A was retried many times, never given up on",
    (snap.head?.attempts ?? 0) >= 3,
    `attempts=${String(snap.head?.attempts)}`,
  );
  check(
    "STILL nothing behind it synced",
    r.server.billCount === 0 && snap.pendingCount === 4,
    `onServer=${String(r.server.billCount)} pending=${String(snap.pendingCount)}`,
  );
  check(
    "B, C and D were never attempted while A blocked",
    ![b, c, d].some((x) => failing.attemptedIds.includes(x.id)),
    `distinct attempted=${JSON.stringify([...new Set(failing.attemptedIds)])}`,
  );
  check(
    "the block is now reported LOUDLY: one POISONED bill, 3 behind, and for how long",
    poisonHealth.alarm === true &&
      poisonHealth.poisoned === true &&
      poisonHealth.blockerId === a.id &&
      poisonHealth.behind === 3 &&
      poisonHealth.poisonedForMs >= POISON_ALARM_MS,
    `alarm=${String(poisonHealth.alarm)} blockerId=${String(poisonHealth.blockerId)} behind=${String(poisonHealth.behind)} poisonedForMs=${String(poisonHealth.poisonedForMs)}`,
  );

  /* ---- 9c: the two are DISTINGUISHABLE, and by the signal, not the clock ---- */

  header("CASE 9c: offline and poisoned are told apart by the reachable-server signal, not by elapsed time");
  check(
    "at comparable elapsed times, offline stays amber while poison goes red",
    offlineHealth.alarm === false && poisonHealth.alarm === true,
    `offline.alarm=${String(offlineHealth.alarm)} poison.alarm=${String(poisonHealth.alarm)}`,
  );
  check(
    "and it is NOT the clock that separates them — both waited past the threshold",
    offlineHealth.blockedForMs >= POISON_ALARM_MS && poisonHealth.poisonedForMs >= POISON_ALARM_MS,
    `offline.blockedForMs=${String(offlineHealth.blockedForMs)} poison.poisonedForMs=${String(poisonHealth.poisonedForMs)}`,
  );

  // NON-VACUITY: the poisoned queue is jammed, not dead. Fix the server and the
  // whole backlog drains — in weighing order, A first now that it can send.
  const online = new SyncEngine({ ...noSellerKind(),
    store: r.store,
    transport: new OnlineTransport(r.server),
    clock: r.clock,
    backoffBaseMs: 1000,
  });
  const drained = await online.runUntilQuiescent();
  const finals = await Promise.all(created.map((x) => r.store.getBill(x.id)));
  const seqs = finals.map((x) => Number(x?.doc_no?.split("-").pop()));
  console.log(`  after the server recovers -> synced=${String(drained.synced)}  doc_no order: ${seqs.join(" , ")}`);

  check(
    "once the head can send, the whole backlog drains",
    r.server.billCount === 4 && drained.synced === 4,
    `onServer=${String(r.server.billCount)} synced=${String(drained.synced)}`,
  );
  check(
    "and doc_no follows weighing order A < B < C < D",
    seqs.every((n, i) => i === 0 || n > seqs[i - 1]!),
    `seqs=${seqs.join(",")}`,
  );

  const clearSnap = await r.store.pendingQueueSnapshot();
  const clearHealth = assessQueue(clearSnap, r.clock.now());
  check(
    "the alarm clears once the queue drains",
    clearHealth.alarm === false && clearHealth.blockerId === null && clearSnap.pendingCount === 0,
    `alarm=${String(clearHealth.alarm)} pending=${String(clearSnap.pendingCount)}`,
  );
  invariant(r, created, "server holds exactly the four bills");
}

/* ----------------------------------------------------------------- 9d ---- */

/**
 * CASE 9d — the COUNT trigger: N consecutive reachable refusals raise the alarm
 * even when almost no wall-clock time has passed.
 *
 * POISON_ALARM_MS alone assumes a poisoned bill takes time to become obvious.
 * That is only true while the backoff is short: a fast-answering server, or one
 * already at the capped backoff, can refuse a bill many times inside a single
 * threshold window. Every refusal is direct evidence the bill will not go, so
 * sitting on N of them waiting for a clock is just a later alarm.
 *
 * The risk this case has to disprove is the one queue-jam-must-be-visible.md
 * warns about: attempt count cannot separate a long outage from a poison pill,
 * so a count-based alarm could cry wolf on every dead spot. It does not here,
 * because server_error_attempts RESETS on any transport-level bounce — 9d proves
 * that directly by bouncing an OFFLINE head the same number of times and
 * asserting it stays calm.
 */
async function case9dAttemptTrigger(harness: StoreHarness): Promise<void> {
  header("CASE 9d: N consecutive REACHABLE refusals raise the alarm without waiting out the clock");

  // Deliberately far too little time for the clock trigger: the whole point is
  // that the alarm fires on evidence, not on elapsed time.
  const stepMs = 6_000;
  const r = await rig(harness, "bill-cnt");

  const created: LocalBill[] = [];
  for (let i = 0; i < 3; i += 1) {
    created.push(
      await createLocalBill(
        { store: r.store, clock: r.clock, ids: r.billIds },
        { seller: { kind: "server", seller_id: "sell-aaaa-0001" }, vehicle_no: null, items: items(r.itemIds), total_amount: null, master_as_of: null },
    PROOF_OWNER,
  ),
    );
    r.clock.advance(1_000);
  }
  const head = created[0]!;

  const failing = new HeadFailingTransport(r.server, head.id);
  const engine = new SyncEngine({ ...noSellerKind(),
    store: r.store,
    transport: failing,
    clock: r.clock,
    backoffBaseMs: 1000,
    backoffMaxMs: 5000,
    batchLimit: 50,
  });

  // NON-VACUITY: one refusal must NOT be enough, or the case proves nothing
  // about the threshold.
  await engine.runOnce();
  let snap = await r.store.pendingQueueSnapshot();
  const afterOne = assessQueue(snap, r.clock.now());
  check(
    "one refusal is poisoned but NOT yet alarming",
    afterOne.poisoned === true && afterOne.alarm === false && afterOne.serverErrorAttempts === 1,
    `poisoned=${String(afterOne.poisoned)} alarm=${String(afterOne.alarm)} serverErrorAttempts=${String(afterOne.serverErrorAttempts)}`,
  );

  // Keep refusing until the count threshold is crossed.
  for (let i = 0; i < POISON_ALARM_ATTEMPTS; i += 1) {
    r.clock.advance(stepMs);
    await engine.runOnce();
  }
  snap = await r.store.pendingQueueSnapshot();
  const counted = assessQueue(snap, r.clock.now());
  console.log(
    `  serverErrorAttempts=${String(counted.serverErrorAttempts)} (threshold ${String(POISON_ALARM_ATTEMPTS)})` +
      `  poisonedForMs=${String(counted.poisonedForMs)} (clock threshold ${String(POISON_ALARM_MS)})`,
  );

  check(
    "the reachable server has now refused it at least N times in a row",
    counted.serverErrorAttempts >= POISON_ALARM_ATTEMPTS,
    `serverErrorAttempts=${String(counted.serverErrorAttempts)}`,
  );
  check(
    "and the alarm is RAISED",
    counted.alarm === true && counted.blockerId === head.id && counted.behind === 2,
    `alarm=${String(counted.alarm)} blockerId=${String(counted.blockerId)} behind=${String(counted.behind)}`,
  );
  check(
    "it was the COUNT that raised it, not the clock — elapsed is still under POISON_ALARM_MS",
    counted.poisonedForMs < POISON_ALARM_MS,
    `poisonedForMs=${String(counted.poisonedForMs)} < ${String(POISON_ALARM_MS)}`,
  );
  check(
    "the head was never skipped — nothing behind it reached the server",
    r.server.billCount === 0 && snap.pendingCount === 3,
    `onServer=${String(r.server.billCount)} pending=${String(snap.pendingCount)}`,
  );

  /* ---- the disproof: the same number of OFFLINE bounces must stay calm ---- */

  const off = await rig(harness, "bill-cnt-off");
  for (let i = 0; i < 3; i += 1) {
    await createLocalBill(
      { store: off.store, clock: off.clock, ids: off.billIds },
      { seller: { kind: "server", seller_id: "sell-aaaa-0001" }, vehicle_no: null, items: items(off.itemIds), total_amount: null, master_as_of: null },
    PROOF_OWNER,
  );
    off.clock.advance(1_000);
  }
  const offEngine = new SyncEngine({ ...noSellerKind(),
    store: off.store,
    transport: new OfflineTransport(),
    clock: off.clock,
    backoffBaseMs: 1000,
    backoffMaxMs: 5000,
    batchLimit: 50,
  });
  for (let i = 0; i < POISON_ALARM_ATTEMPTS * 2; i += 1) {
    off.clock.advance(stepMs);
    await offEngine.runOnce();
  }
  const offSnap = await off.store.pendingQueueSnapshot();
  const offHealth = assessQueue(offSnap, off.clock.now());

  check(
    "an OFFLINE head bounced at least as many times",
    (offSnap.head?.attempts ?? 0) >= POISON_ALARM_ATTEMPTS,
    `attempts=${String(offSnap.head?.attempts)} threshold=${String(POISON_ALARM_ATTEMPTS)}`,
  );
  check(
    "yet its consecutive-server-error count stayed 0 — transport bounces reset it",
    offHealth.serverErrorAttempts === 0,
    `serverErrorAttempts=${String(offHealth.serverErrorAttempts)}`,
  );
  check(
    "so the count trigger does NOT cry wolf on a dead spot: still calm amber",
    offHealth.alarm === false && offHealth.offline === true && offHealth.blockerId === null,
    `alarm=${String(offHealth.alarm)} offline=${String(offHealth.offline)}`,
  );

  /* ---- and a recovery resets the count, so a blip cannot accumulate ---- */

  const recovered = new SyncEngine({ ...noSellerKind(),
    store: r.store,
    transport: new OnlineTransport(r.server),
    clock: r.clock,
    backoffBaseMs: 1000,
  });
  await recovered.runUntilQuiescent();
  const clearSnap = await r.store.pendingQueueSnapshot();
  const clearHealth = assessQueue(clearSnap, r.clock.now());
  const headAfter = await r.store.getBill(head.id);
  check(
    "once it finally sends, the queue drains and the count is cleared",
    r.server.billCount === 3 &&
      clearHealth.alarm === false &&
      clearSnap.pendingCount === 0 &&
      headAfter?.server_error_attempts === 0,
    `onServer=${String(r.server.billCount)} pending=${String(clearSnap.pendingCount)} headCount=${String(headAfter?.server_error_attempts)}`,
  );
}

/* ----------------------------------------------------------------- 10 ---- */

/**
 * CASE 10 — a RESOLVABLE rejection parks; a PERMANENT one stays terminal.
 *
 * Both are rejections: the server answered definitively and refused the bill. But
 * they have opposite futures, and conflating them costs a real load either way:
 *
 *   PERMANENT (malformed money) — no action makes this payload valid. Terminal
 *   `failed`, surfaced for correction. Retrying forever would hide it.
 *
 *   RESOLVABLE (no price tier for the seller's grade) — becomes valid the moment
 *   the office adds the price. If this were terminal, the yard would have to
 *   re-weigh a load that has already been tipped into the pile and no longer
 *   exists as a separate load. So it PARKS: still pending, still owed, out of the
 *   head-of-line queue so it blocks nothing, visible with the server's own code.
 *
 * THE COST, asserted rather than hidden: a parked bill is passed by bills weighed
 * after it, so it takes a HIGHER doc_no when it finally syncs. That is a real
 * weakening of weighing order (doc-no-is-arrival-order-not-event-time). It is
 * accepted because the alternative is one un-priced product stopping the entire
 * yard from syncing, and because the bill is parked VISIBLY — which is the
 * distinction queue-jam-must-be-visible actually draws, its objection being to a
 * SILENT skip.
 */
async function case10ResolvableVsPermanent(harness: StoreHarness): Promise<void> {
  header("CASE 10a: a RESOLVABLE rejection parks the bill and does NOT jam the queue");
  const r = await rig(harness, "bill-md");

  // A is weighed FIRST and is the one whose product has no price tier.
  const created: LocalBill[] = [];
  for (let i = 0; i < 3; i += 1) {
    created.push(
      await createLocalBill(
        { store: r.store, clock: r.clock, ids: r.billIds },
        { seller: { kind: "server", seller_id: "sell-aaaa-0001" }, vehicle_no: null, items: items(r.itemIds), total_amount: null, master_as_of: null },
    PROOF_OWNER,
  ),
    );
    r.clock.advance(60_000);
  }
  const a = created[0]!;
  const b = created[1]!;
  const c = created[2]!;
  const originalKey = a.idempotency_key;

  const transport = new MasterDataMissingTransport(r.server, a.id);
  const engine = new SyncEngine({ ...noSellerKind(),
    store: r.store,
    transport,
    clock: r.clock,
    backoffBaseMs: 1000,
    backoffMaxMs: 5000,
    batchLimit: 50,
    masterDataRetryMs: 300_000,
  });

  const run = await engine.runUntilQuiescent();
  let snap = await r.store.pendingQueueSnapshot();
  let health = assessQueue(snap, r.clock.now());
  const parked = await r.store.listMasterDataBlocked(10);
  const aRow = await r.store.getBill(a.id);

  check(
    "the resolvable refusal was recorded as parked, not as a failure",
    run.masterDataBlocked === 1 && run.rejected === 0,
    `masterDataBlocked=${String(run.masterDataBlocked)} rejected=${String(run.rejected)}`,
  );
  check(
    "the parked bill is NOT terminally failed — it is still pending and still owed",
    aRow?.sync_state === "pending" && aRow.master_data_missing_at !== null,
    `state=${String(aRow?.sync_state)} parkedAt=${String(aRow?.master_data_missing_at)}`,
  );
  check(
    "it carries the server's machine-readable code — nothing string-matched a message",
    aRow?.master_data_code === "product_price_unset",
    `code=${String(aRow?.master_data_code)}`,
  );
  check(
    "it is VISIBLE as waiting on master data",
    parked.length === 1 && parked[0]?.id === a.id && health.masterDataBlocked === 1,
    `parked=${String(parked.length)} healthBlocked=${String(health.masterDataBlocked)}`,
  );
  check(
    "and it did NOT jam the queue — the two bills behind it reached the server",
    r.server.billCount === 2 && r.server.hasBillId(b.id) && r.server.hasBillId(c.id),
    `onServer=${String(r.server.billCount)}`,
  );
  check(
    "the send queue is empty and raises NO alarm — this is not a poisoned head",
    snap.pendingCount === 0 && health.alarm === false && health.poisoned === false,
    `pending=${String(snap.pendingCount)} alarm=${String(health.alarm)} poisoned=${String(health.poisoned)}`,
  );
  check(
    "the parked bill is counted separately, never as a queue backlog",
    snap.masterDataBlockedCount === 1 && health.behind === 0,
    `blockedCount=${String(snap.masterDataBlockedCount)} behind=${String(health.behind)}`,
  );

  /* ---- 10b: the office adds the price; the SAME bill goes, no re-weighing ---- */

  header("CASE 10b: the office adds the price — the SAME bill syncs, same idempotency key, no duplicate");
  transport.addPrice();
  const releasedCount = await engine.retryMasterDataNow();
  await engine.runUntilQuiescent();
  const aFinal = await r.store.getBill(a.id);
  snap = await r.store.pendingQueueSnapshot();
  health = assessQueue(snap, r.clock.now());

  check(
    "the operator's retry released exactly the parked bill",
    releasedCount === 1,
    `released=${String(releasedCount)}`,
  );
  check(
    "it synced on the SAME bill id — nothing was re-created and nothing re-weighed",
    aFinal?.sync_state === "synced" && r.server.hasBillId(a.id),
    `state=${String(aFinal?.sync_state)} onServer=${String(r.server.hasBillId(a.id))}`,
  );
  check(
    "with the SAME idempotency key it was born with — the dedup guarantee is intact",
    aFinal?.idempotency_key === originalKey,
    `key=${String(aFinal?.idempotency_key)} original=${originalKey}`,
  );
  check(
    "exactly three bills on the server — the park never produced a duplicate",
    r.server.billCount === 3 && r.server.distinctBillIds().size === 3,
    `billCount=${String(r.server.billCount)} distinct=${String(r.server.distinctBillIds().size)}`,
  );
  check(
    "the park is cleared and nothing is left waiting",
    aFinal?.master_data_missing_at === null &&
      aFinal.master_data_code === null &&
      health.masterDataBlocked === 0,
    `parkedAt=${String(aFinal?.master_data_missing_at)} blocked=${String(health.masterDataBlocked)}`,
  );

  /*
   * THE ORDERING EXCEPTION, asserted out loud rather than left to be discovered
   * — AND BOUNDED, because "we gave up weighing order" and "we gave it up for
   * exactly the parked bill" are very different claims and only the second one
   * is true. Both halves are checked:
   *
   *   the exception — A was weighed FIRST and takes the HIGHEST doc_no;
   *   the bound     — B and C, which never left the sendable queue, are still
   *                   in weighing order relative to each other.
   *
   * Without the second check this case would pass just as happily if parking had
   * scrambled the whole queue, and the invariant from 2c-5.1 would have been
   * silently traded away rather than narrowed.
   */
  const seqOf = (bill: LocalBill | null): number => Number(bill?.doc_no?.split("-").pop());
  const seqs = [aFinal, await r.store.getBill(b.id), await r.store.getBill(c.id)].map(seqOf);
  const sa = seqs[0] ?? -1;
  const sb = seqs[1] ?? -1;
  const sc = seqs[2] ?? -1;
  console.log(`  doc_no: A(weighed 1st, parked)=${String(sa)}  B=${String(sb)}  C=${String(sc)}`);
  check(
    "ACCEPTED EXCEPTION: the parked bill was weighed FIRST but took the HIGHEST doc_no",
    sa > sb && sa > sc,
    `A=${String(sa)} B=${String(sb)} C=${String(sc)} — weighing order is deliberately given up for a bill parked on missing master data; doc_no is arrival order and reports key on server_received_at`,
  );
  check(
    "THE BOUND: every bill that stayed in the sendable queue kept weighing order",
    sb < sc,
    `B=${String(sb)} < C=${String(sc)} — the exception is exactly the parked bill, not a general loss of ordering`,
  );

  /* ---- 10c: the slow cadence releases it even with no operator ---- */

  header("CASE 10c: with no operator at all, the slow cadence retries a parked bill");
  const s = await rig(harness, "bill-md2");
  const only = await createLocalBill(
    { store: s.store, clock: s.clock, ids: s.billIds },
    { seller: { kind: "server", seller_id: "sell-aaaa-0001" }, vehicle_no: null, items: items(s.itemIds), total_amount: null, master_as_of: null },
    PROOF_OWNER,
  );
  const t2 = new MasterDataMissingTransport(s.server, only.id);
  const e2 = new SyncEngine({ ...noSellerKind(),
    store: s.store,
    transport: t2,
    clock: s.clock,
    backoffBaseMs: 1000,
    batchLimit: 50,
    masterDataRetryMs: 300_000,
  });
  await e2.runOnce();
  check(
    "parked, and a pass BEFORE the cadence is due does not retry it",
    (await s.store.listMasterDataBlocked(5)).length === 1 &&
      (await e2.runOnce()).masterDataReleased === 0,
    "still parked, not released early",
  );

  // The office adds the price; nobody presses anything. Time passes.
  t2.addPrice();
  s.clock.advance(300_001);
  const auto = await e2.runUntilQuiescent();
  const onlyFinal = await s.store.getBill(only.id);
  check(
    "once the cadence comes due it is released and syncs on its own",
    auto.masterDataReleased >= 1 &&
      onlyFinal?.sync_state === "synced" &&
      s.server.billCount === 1,
    `released=${String(auto.masterDataReleased)} state=${String(onlyFinal?.sync_state)} onServer=${String(s.server.billCount)}`,
  );

  /* ---- 10d: the contrast — a PERMANENT rejection is still terminal ---- */

  header("CASE 10d: a PERMANENT rejection (malformed) is still terminal — never parked");
  const p = await rig(harness, "bill-perm");
  const bad = await createLocalBill(
    { store: p.store, clock: p.clock, ids: p.billIds },
    { seller: { kind: "server", seller_id: "sell-aaaa-0001" }, vehicle_no: null, items: items(p.itemIds), total_amount: null, master_as_of: null },
    PROOF_OWNER,
  );
  const permEngine = new SyncEngine({ ...noSellerKind(),
    store: p.store,
    transport: new RejectingTransport(),
    clock: p.clock,
    backoffBaseMs: 1000,
  });
  const permRun = await permEngine.runOnce();
  const badRow = await p.store.getBill(bad.id);
  const permParked = await p.store.listMasterDataBlocked(5);

  check(
    "it is counted as a rejection, NOT as a master-data park",
    permRun.rejected === 1 && permRun.masterDataBlocked === 0,
    `rejected=${String(permRun.rejected)} blocked=${String(permRun.masterDataBlocked)}`,
  );
  check(
    "the bill is terminally failed, with the reason kept",
    badRow?.sync_state === "failed" && (badRow.last_error ?? "").includes("422"),
    `state=${String(badRow?.sync_state)} err=${String(badRow?.last_error)}`,
  );
  check(
    "and it is NOT parked — a malformed bill must never wait on the office",
    permParked.length === 0 && badRow?.master_data_missing_at === null,
    `parked=${String(permParked.length)}`,
  );
  check(
    "nor is it retried by the release path — releasing touches only parked bills",
    (await permEngine.retryMasterDataNow()) === 0 &&
      (await p.store.getBill(bad.id))?.sync_state === "failed",
    "still failed after a retry press",
  );
}

/* ----------------------------------------------------------------- 11 ---- */

/**
 * CASE 11: THE SESSION ENDS.
 *
 * JWT_TTL_SECONDS is 3600 and there is no refresh token, so on a long shift the
 * token simply runs out. Until Phase 2c-7 the transport classified the 401 as
 * `unavailable, reachable: true` — an unknown outcome from a server that
 * answered — and the app then told the operator one of two false things,
 * depending only on how many bills happened to be queued:
 *
 *   1 bill   -> `retryable`, so App set online=false: "ออฟไลน์ — จะส่งให้เอง
 *               เมื่อเน็ตกลับมา". The network was fine. Waiting fixes nothing.
 *   3 bills  -> reachable-and-refusing, so first_server_error_at ran and
 *               server_error_attempts climbed to POISON_ALARM_ATTEMPTS: the red
 *               "ติดต่อฝ่ายสนับสนุน" alarm. There is nothing for support to do.
 *
 * Neither names the fix. Both are asserted below as the DISPROOF (11a-legacy and
 * 11c), driven by LegacyUnauthorizedTransport, which differs from the new
 * classification in nothing but the SendOutcome member it returns.
 *
 * Run on both stores, because markSessionExpired is a store transition and the
 * in-memory fake mirroring it is the only thing keeping the two honest.
 */
async function case11SessionExpired(harness: StoreHarness): Promise<void> {
  /* ---- 11a: ONE queued bill ---- */

  header("CASE 11a: the session expires with ONE bill queued — not offline, not poison");
  const one = await rig(harness, "bill-s1");
  const oneCreated = await createBills(one, 1);
  const solo = oneCreated[0]!;
  const t1 = new ExpiredSessionTransport(one.server);
  const e1 = new SyncEngine({ ...noSellerKind(),
    store: one.store,
    transport: t1,
    clock: one.clock,
    backoffBaseMs: 1000,
    backoffMaxMs: 5000,
  });

  const run1 = await e1.runOnce();
  const soloRow = await one.store.getBill(solo.id);
  const soloHealth = assessQueue(await one.store.pendingQueueSnapshot(), one.clock.now());

  check(
    "the pass reports a SESSION problem, and not a retryable one",
    run1.sessionExpired === 1 && run1.retryable === 0 && run1.rejected === 0 && run1.synced === 0,
    `run=${JSON.stringify(run1)}`,
  );
  check(
    "the bill is untouched and still queued — nothing failed, nothing was dropped",
    soloRow?.sync_state === "pending" && soloRow.doc_no === null,
    `state=${String(soloRow?.sync_state)}`,
  );
  check(
    "the POISON clocks never started — a 401 is not the server refusing this bill",
    soloRow?.first_server_error_at === null && soloRow.server_error_attempts === 0,
    `first_server_error_at=${String(soloRow?.first_server_error_at)} serverErrorAttempts=${String(soloRow?.server_error_attempts)}`,
  );
  check("nothing reached the server", one.server.billCount === 0);

  /*
   * What the yard actually sees. App derives session="expired" from
   * SyncRunResult.sessionExpired and online=true (the server ANSWERED), so these
   * are the exact inputs the screen gets.
   */
  const soloStrip = statusNotice({
    appOutdated: false,
    session: "expired",
    account: "ok",
    voidsRefused: 0,
    online: true,
    pending: 1,
    parkedForAnother: 0,
    parkedUnknownOwner: 0,
    // Nothing owed beyond the bills this case stages. The strip's owed-work
    // branch sits BELOW every branch this file asserts on, so a zero map keeps
    // it out of the way; it is driven in proveOwedSurfaces.
    owed: NOTHING_OWED,
    failed: 0,
    blocked: soloHealth.alarm
      ? { behind: soloHealth.behind, forMs: soloHealth.poisonedForMs, attempts: soloHealth.serverErrorAttempts }
      : null,
    waitingOnMasterData: 0,
    masterDataCodes: [],
  });
  console.log(`  strip: ${soloStrip.message}`);
  console.log(`  card : ${billNotice(soloRow!, "expired", "ok").lines.join(" / ")}`);
  check(
    "the strip does NOT say ออฟไลน์ and does NOT send anyone to support",
    !soloStrip.message.includes("ออฟไลน์") && !soloStrip.message.includes("ฝ่ายสนับสนุน"),
    soloStrip.message,
  );
  check(
    "it names the sign-in and carries the button",
    soloStrip.message.includes("เข้าสู่ระบบ") && soloStrip.action?.kind === "sign_in",
    `action=${String(soloStrip.action?.kind)}`,
  );
  check(
    "the bill's own card reads as a session problem, not an error",
    billNotice(soloRow!, "expired", "ok").tone === "session",
    `tone=${billNotice(soloRow!, "expired", "ok").tone}`,
  );

  /* ---- 11a-legacy: THE DISPROOF for one bill ---- */

  const legacyOne = await rig(harness, "bill-s1L");
  await createBills(legacyOne, 1);
  const legacyRun = await new SyncEngine({ ...noSellerKind(),
    store: legacyOne.store,
    transport: new LegacyUnauthorizedTransport(),
    clock: legacyOne.clock,
    backoffBaseMs: 1000,
  }).runOnce();
  // This is the number App branched on: retryable > 0 -> setOnline(false).
  const legacyStrip = statusNotice({
    appOutdated: false,
    session: "active",
    account: "ok",
    voidsRefused: 0,
    online: false,
    pending: 1,
    parkedForAnother: 0,
    parkedUnknownOwner: 0,
    // Nothing owed beyond the bills this case stages. The strip's owed-work
    // branch sits BELOW every branch this file asserts on, so a zero map keeps
    // it out of the way; it is driven in proveOwedSurfaces.
    owed: NOTHING_OWED,
    failed: 0,
    blocked: null,
    waitingOnMasterData: 0,
    masterDataCodes: [],
  });
  console.log(`  BEFORE (401 as unavailable): ${legacyStrip.message}`);
  check(
    "DISPROOF: the old classification produced a RETRYABLE, which is what set online=false",
    legacyRun.retryable === 1 && legacyRun.sessionExpired === 0,
    `run=${JSON.stringify(legacyRun)}`,
  );
  check(
    "DISPROOF: and that is the input on which the strip said ออฟไลน์",
    legacyStrip.message.includes("ออฟไลน์"),
    legacyStrip.message,
  );

  /* ---- 11b: THREE queued bills, driven past BOTH alarm triggers ---- */

  header("CASE 11b: the session expires with THREE queued — the poison counter stays 0");
  const many = await rig(harness, "bill-s3");
  const created: LocalBill[] = [];
  for (let i = 0; i < 3; i += 1) {
    created.push(
      await createLocalBill(
        { store: many.store, clock: many.clock, ids: many.billIds },
        { seller: { kind: "server", seller_id: "sell-aaaa-0001" }, vehicle_no: null, items: items(many.itemIds), total_amount: null, master_as_of: null },
    PROOF_OWNER,
  ),
    );
    many.clock.advance(60_000); // weighed a minute apart, so order is unambiguous
  }
  const t3 = new ExpiredSessionTransport(many.server);
  const e3 = new SyncEngine({ ...noSellerKind(),
    store: many.store,
    transport: t3,
    clock: many.clock,
    backoffBaseMs: 1000,
    backoffMaxMs: 5000,
    batchLimit: 50,
  });

  // Past the clock threshold AND past the count threshold, so neither trigger
  // can be said to have simply not been reached yet.
  const passes = POISON_ALARM_ATTEMPTS + 3;
  for (let i = 0; i < passes; i += 1) {
    many.clock.advance(15_000);
    await e3.runOnce();
  }
  const manySnap = await many.store.pendingQueueSnapshot();
  const manyHealth = assessQueue(manySnap, many.clock.now());

  console.log(
    `  after ${String(passes)} passes: attempts=${String(manySnap.head?.attempts)}` +
      ` serverErrorAttempts=${String(manySnap.head?.server_error_attempts)}` +
      ` blockedForMs=${String(manyHealth.blockedForMs)} alarm=${String(manyHealth.alarm)}`,
  );
  check(
    "the head really has bounced past BOTH alarm triggers' worth of attempts and time",
    (manySnap.head?.attempts ?? 0) >= POISON_ALARM_ATTEMPTS &&
      manyHealth.blockedForMs >= POISON_ALARM_MS,
    `attempts=${String(manySnap.head?.attempts)} (>= ${String(POISON_ALARM_ATTEMPTS)})` +
      ` blockedForMs=${String(manyHealth.blockedForMs)} (>= ${String(POISON_ALARM_MS)}) — so this case is not vacuous`,
  );
  check(
    "yet the consecutive-server-refusal counter is still ZERO",
    manySnap.head?.server_error_attempts === 0 && manySnap.head.first_server_error_at === null,
    `serverErrorAttempts=${String(manySnap.head?.server_error_attempts)}`,
  );
  check(
    "so NO poison, NO red alarm and NO blocker — nobody is told to call support",
    manyHealth.poisoned === false && manyHealth.alarm === false && manyHealth.blockerId === null,
    `poisoned=${String(manyHealth.poisoned)} alarm=${String(manyHealth.alarm)}`,
  );
  check(
    "all three bills are still queued, in weighing order, and nothing reached the server",
    manySnap.pendingCount === 3 && many.server.billCount === 0,
    `pending=${String(manySnap.pendingCount)} onServer=${String(many.server.billCount)}`,
  );

  const manyStrip = statusNotice({
    appOutdated: false,
    session: "expired",
    account: "ok",
    voidsRefused: 0,
    online: true,
    pending: 3,
    parkedForAnother: 0,
    parkedUnknownOwner: 0,
    // Nothing owed beyond the bills this case stages. The strip's owed-work
    // branch sits BELOW every branch this file asserts on, so a zero map keeps
    // it out of the way; it is driven in proveOwedSurfaces.
    owed: NOTHING_OWED,
    failed: 0,
    blocked: manyHealth.alarm
      ? { behind: manyHealth.behind, forMs: manyHealth.poisonedForMs, attempts: manyHealth.serverErrorAttempts }
      : null,
    waitingOnMasterData: 0,
    masterDataCodes: [],
  });
  console.log(`  strip: ${manyStrip.message}`);
  check(
    "three bills produce the SAME honest message as one — not a different, scarier lie",
    !manyStrip.message.includes("ฝ่ายสนับสนุน") &&
      !manyStrip.message.includes("ออฟไลน์") &&
      manyStrip.action?.kind === "sign_in",
    manyStrip.message,
  );

  /* ---- 11c: THE DISPROOF for three bills ---- */

  header("CASE 11c: DISPROOF — the same three bills under the OLD 401 classification");
  const legacyMany = await rig(harness, "bill-s3L");
  for (let i = 0; i < 3; i += 1) {
    await createLocalBill(
      { store: legacyMany.store, clock: legacyMany.clock, ids: legacyMany.billIds },
      { seller: { kind: "server", seller_id: "sell-aaaa-0001" }, vehicle_no: null, items: items(legacyMany.itemIds), total_amount: null, master_as_of: null },
    PROOF_OWNER,
  );
    legacyMany.clock.advance(60_000);
  }
  const eLegacy = new SyncEngine({ ...noSellerKind(),
    store: legacyMany.store,
    transport: new LegacyUnauthorizedTransport(),
    clock: legacyMany.clock,
    backoffBaseMs: 1000,
    backoffMaxMs: 5000,
    batchLimit: 50,
  });
  for (let i = 0; i < passes; i += 1) {
    legacyMany.clock.advance(15_000);
    await eLegacy.runOnce();
  }
  const legacySnap = await legacyMany.store.pendingQueueSnapshot();
  const legacyHealth = assessQueue(legacySnap, legacyMany.clock.now());
  const legacyManyStrip = statusNotice({
    appOutdated: false,
    session: "active",
    account: "ok",
    voidsRefused: 0,
    online: true,
    pending: 3,
    parkedForAnother: 0,
    parkedUnknownOwner: 0,
    // Nothing owed beyond the bills this case stages. The strip's owed-work
    // branch sits BELOW every branch this file asserts on, so a zero map keeps
    // it out of the way; it is driven in proveOwedSurfaces.
    owed: NOTHING_OWED,
    failed: 0,
    blocked: legacyHealth.alarm
      ? { behind: legacyHealth.behind, forMs: legacyHealth.poisonedForMs, attempts: legacyHealth.serverErrorAttempts }
      : null,
    waitingOnMasterData: 0,
    masterDataCodes: [],
  });
  console.log(
    `  serverErrorAttempts=${String(legacySnap.head?.server_error_attempts)}` +
      ` poisoned=${String(legacyHealth.poisoned)} alarm=${String(legacyHealth.alarm)}`,
  );
  console.log(`  BEFORE: ${legacyManyStrip.message}`);
  check(
    "DISPROOF: the old classification DID run the poison counter past the threshold",
    (legacySnap.head?.server_error_attempts ?? 0) >= POISON_ALARM_ATTEMPTS &&
      legacyHealth.poisoned === true &&
      legacyHealth.alarm === true,
    `serverErrorAttempts=${String(legacySnap.head?.server_error_attempts)} alarm=${String(legacyHealth.alarm)}`,
  );
  check(
    "DISPROOF: and the yard was told to call support about an expired token",
    legacyManyStrip.message.includes("ฝ่ายสนับสนุน"),
    legacyManyStrip.message,
  );

  /* ---- 11d: sign in again — the queue drains, unchanged ---- */

  header("CASE 11d: after signing in, the SAME bills drain — no duplicates, nothing re-typed");
  t3.signIn();
  const freed = await e3.resumeAfterSignIn();
  const drained = await e3.runUntilQuiescent();
  const finals = await Promise.all(created.map((b) => many.store.getBill(b.id)));

  check(
    "signing in freed the backoff that was never about the network",
    freed > 0,
    `freed=${String(freed)} — without this the yard signs in and watches nothing happen`,
  );
  check(
    "all three bills synced",
    finals.every((b) => b?.sync_state === "synced" && b.doc_no !== null),
    finals.map((b) => `${String(b?.doc_no)}:${String(b?.sync_state)}`).join(" "),
  );
  invariant(many, created, "exactly the three created bills exist on the server — no duplicates");
  check(
    "every idempotency key is the one the bill was born with",
    finals.every((b, i) => b?.idempotency_key === created[i]?.idempotency_key),
  );
  check(
    "every payload is byte-identical to what was weighed — nothing was re-typed",
    finals.every((b, i) => JSON.stringify(b?.payload) === JSON.stringify(created[i]?.payload)),
  );
  const docSeq = finals.map((b) => Number(b?.doc_no?.split("-").pop()));
  console.log(`  doc_no order: ${docSeq.join(" < ")}  (drained=${JSON.stringify(drained.synced)})`);
  check(
    "and they arrived in WEIGHING order — an expired session did not reorder the queue",
    docSeq.every((n, i) => i === 0 || n > (docSeq[i - 1] ?? -1)),
    docSeq.join(","),
  );
  check(
    "the session state is over: nothing is left pending or blocked",
    (await many.store.listPendingOldestFirst(10)).length === 0,
  );
}

async function case7RejectionIsNotRetry(harness: StoreHarness): Promise<void> {
  header("CASE 7 (extra): a server REJECTION is not a transport failure");
  const r = await rig(harness, "bill-r");
  const created = await createBills(r, 1);
  const bill = created[0]!;
  const engine = new SyncEngine({ ...noSellerKind(),
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

const SEED = 20260721;

/**
 * The same suite, run against each store. The cases are identical — none of
 * them knows or asks which store it is on. A case that needed adjusting to pass
 * on SQLite would mean the interface is not really the contract.
 */
async function runSuite(harness: StoreHarness): Promise<void> {
  console.log(`
################ STORE: ${harness.name} ################`);
  console.log(`  CASE 4 restart = ${harness.restartKind}`);
  await case1Happy(harness);
  await case2OfflineThenRestored(harness);
  await case3LostResponse(harness);
  await case4CrashDuringSyncing(harness);
  await case5FlakyMany(harness, SEED, 50);
  await case6DoubleTrigger(harness);
  await case7RejectionIsNotRetry(harness);
  await case8WeighingOrder(harness);
  await case9OfflineVsPoison(harness);
  await case9dAttemptTrigger(harness);
  await case10ResolvableVsPermanent(harness);
  await case11SessionExpired(harness);
}

async function main(): Promise<number> {
  console.log("Phase 2a suite re-run on both stores (Phase 2b deliverable)");
  console.log(`node ${process.version} — fake transports, but a REAL SQLite file for the second store`);

  case0Purity();
  try {
    await runSuite(memoryHarness);
    await runSuite(sqliteHarness);
  } finally {
    await disposeAll();
  }

  console.log("");
  if (failures === 0) {
    console.log("ALL CASES PASSED ON BOTH STORES");
  } else {
    console.log(`INVARIANT FAILED — ${failures} check(s) failed`);
  }
  return failures === 0 ? 0 : 1;
}

// Preset RED, per lessons/a-default-exit-code-is-a-default-verdict.md: a run
// that ends before main()'s tally completes exits non-zero, not a default 0.
process.exitCode = 1;

main()
  .then((code) => {
    console.log(`SUITE_EXIT=${code}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("PROOF CRASHED:", err);
    process.exitCode = 1;
  });
