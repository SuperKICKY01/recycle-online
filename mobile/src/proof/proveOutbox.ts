/**
 * P1.18 stage 3 (commit 1) proof: the outbox mechanism, driven DIRECTLY.
 *
 * Run: npm run prove:outbox
 *
 * `SyncEngine.runOnce` is untouched in this commit and every existing proof
 * still drives it; THIS file is the only driver of `OutboxRunner` +
 * `buildOutboxRegistry`, so a red here names the mechanism and nothing else —
 * which is the whole argument for the two-commit split.
 *
 * Sections are named for the criteria they carry
 * (`ROADMAP.md § P1.18`, "THE CRITERIA, DERIVED FROM THE DESIGN ABOVE"):
 *
 *   O1  THE-REGISTRY-IS-TOTAL... (enumeration + recoverAll's keyed map)
 *       and EVERY-KIND-RECOVERS-AT-BOOT
 *   O2  SENDS-SETTLE-BEFORE-VOIDS-ARE-READ
 *   O3  THE-DRAIN-ADVANCES-AND-TERMINATES
 *   O4  HEAD-BLOCKS-A-ROW-THAT-MUST-NOT-GO (headless mechanism half)
 *   O5  VOID-KEEPS-EVERY-DIFFERENCE-THE-DESIGN-NAMES
 *   O6  A-THROW-LANDS-IN-ONE-OF-TWO-PLACES
 *   O7  A-SCHEDULE-STAYS-INSIDE-THE-HORIZON
 *   O8  PARKED-IS-NOT-TERMINAL (headless mechanism half)
 *   O9  THE-POISON-SIGNAL-SURVIVES-BOTH-WAYS (headless half) and the
 *       halt-survives-the-pass cell of THE-PASS-REPORTS...
 *   O10 OWED-CARRIES-THE-OWNER-PREDICATE (through SqliteLocalStore, real
 *       files — the criterion demands the store, not a fake)
 *   O11 A-LOST-CLAIM-IS-NOT-AN-OUTCOME
 *   O12 the mid-pass count separation (owed vs owedCount, the cell the design
 *       says it nearly shipped wrong)
 *   O13 PASSES-OVERLAP-AND-ORDER-HOLDS (two runner instances over one store,
 *       with the parallel_rows control the criterion requires)
 *
 * The SERVER and HANDSET halves of the criteria are NOT here and are reported
 * as unobserved by the phase report; a fake transport proves the mechanism's
 * mapping, never the wire.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { SqliteIdentityStore } from "../adapters/sqlite/SqliteIdentityStore.js";
import { SEND_SCHEDULE_HORIZON_MS } from "../time/clockSanity.js";
import { buildLocalBill, createLocalBill } from "../sync/createBill.js";
import type { BillDraft } from "../sync/createBill.js";
import type {
  Clock,
  LocalBill,
  RowOwner,
  SendOutcome,
  Transport,
  VoidOutcome,
} from "../sync/types.js";
import type { OutboxHandler, OutboxKind, OutboxRegistry } from "../sync/outbox.js";
import { buildOutboxRegistry } from "../sync/outboxHandlers.js";
import type { OutboxDeps } from "../sync/outboxHandlers.js";
import { OutboxRunner } from "../sync/outboxRunner.js";
import {
  ExpiredSessionTransport,
  FakeClock,
  FakeServer,
  ForbiddenTransport,
  GatedTransport,
  HeadFailingTransport,
  InMemoryStore,
  MasterDataMissingTransport,
  OfflineTransport,
  OnlineTransport,
  PROOF_OWNER,
  SeqIds,
  toVoidOutcome,
} from "./fakes.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
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

const DRAFT: BillDraft = {
  seller_id: "sell-1",
  vehicle_no: null,
  items: [ITEM],
  total_amount: "150.05",
  master_as_of: null,
};

/** Same shop, different person — the sharper wrong-identity case. */
const OTHER_OWNER: RowOwner = {
  tenant_id: PROOF_OWNER.tenant_id,
  user_id: "00000000-0000-4000-8000-00000000cccc",
};

function fixedClock(iso: string): Clock {
  return { now: () => new Date(iso), sleep: () => Promise.resolve() };
}

/**
 * A product-shaped pending bill with CONTROLLED timestamps. Built through
 * buildLocalBill so every other column is exactly what the real path writes;
 * only the weighing time (and optionally the schedule) is then overridden —
 * the shape a legacy backfill produces, and the one staging that separates
 * `device_created_at` from `created_at` in the sort
 * (HEAD-BLOCKS-A-ROW-THAT-MUST-NOT-GO's own demand).
 */
function billAt(ids: SeqIds, deviceIso: string, createdIso: string, nextIso = createdIso): LocalBill {
  const b = buildLocalBill({ clock: fixedClock(createdIso), ids }, DRAFT);
  return {
    ...b,
    device_created_at: deviceIso,
    payload: { ...b.payload, device_created_at: deviceIso },
    next_attempt_at: nextIso,
  };
}

/** The bill as the product leaves it after a successful sync. */
function asSynced(b: LocalBill, docNo: string, syncedIso: string): LocalBill {
  return { ...b, sync_state: "synced", doc_no: docNo, synced_at: syncedIso };
}

/* ----------------------------------------------------- proof transports -- */

/** Swappable inner transport, so one registry can face several networks. */
class MutableTransport implements Transport {
  constructor(public inner: Transport) {}
  sendBill(bill: LocalBill): Promise<SendOutcome> {
    return this.inner.sendBill(bill);
  }
  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    return this.inner.voidBill(bill, reason);
  }
}

/** Records every perform call's bill id, whatever the inner transport does. */
class RecordingTransport implements Transport {
  readonly sendIds: string[] = [];
  readonly voidIds: string[] = [];
  constructor(private readonly inner: Transport) {}
  sendBill(bill: LocalBill): Promise<SendOutcome> {
    this.sendIds.push(bill.id);
    return this.inner.sendBill(bill);
  }
  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    this.voidIds.push(bill.id);
    return this.inner.voidBill(bill, reason);
  }
}

/** Holds the FIRST void call open until released; later calls pass. */
class VoidGatedTransport implements Transport {
  readonly voidCallIds: string[] = [];
  readonly firstVoidStarted: Promise<void>;
  private signalFirst!: () => void;
  private releaseGate!: () => void;
  private readonly gate: Promise<void>;
  private calls = 0;

  constructor(private readonly server: FakeServer) {
    this.firstVoidStarted = new Promise((resolve) => {
      this.signalFirst = resolve;
    });
    this.gate = new Promise((resolve) => {
      this.releaseGate = resolve;
    });
  }

  sendBill(bill: LocalBill): Promise<SendOutcome> {
    const r = this.server.submit(bill.payload);
    return Promise.resolve({ kind: r.kind, doc_no: r.bill.doc_no });
  }

  async voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    this.voidCallIds.push(bill.id);
    this.calls += 1;
    if (this.calls === 1) {
      this.signalFirst();
      await this.gate;
    }
    return toVoidOutcome(this.server.voidBill(bill.id, reason));
  }

  open(): void {
    this.releaseGate();
  }
}

/** Holds the FIRST send call open until released; later calls pass. */
class SendGatedTransport implements Transport {
  readonly sendIds: string[] = [];
  readonly firstSendStarted: Promise<void>;
  private signalFirst!: () => void;
  private releaseGate!: () => void;
  private readonly gate: Promise<void>;
  private calls = 0;

  constructor(private readonly server: FakeServer) {
    this.firstSendStarted = new Promise((resolve) => {
      this.signalFirst = resolve;
    });
    this.gate = new Promise((resolve) => {
      this.releaseGate = resolve;
    });
  }

  async sendBill(bill: LocalBill): Promise<SendOutcome> {
    this.sendIds.push(bill.id);
    this.calls += 1;
    if (this.calls === 1) {
      this.signalFirst();
      await this.gate;
    }
    const r = this.server.submit(bill.payload);
    return { kind: r.kind, doc_no: r.bill.doc_no };
  }

  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    return Promise.resolve(toVoidOutcome(this.server.voidBill(bill.id, reason)));
  }

  open(): void {
    this.releaseGate();
  }
}

/** One void bounces at transport level; every other call is normal. */
class VoidFailingTransport implements Transport {
  constructor(
    private readonly server: FakeServer,
    private readonly failId: string,
  ) {}
  sendBill(bill: LocalBill): Promise<SendOutcome> {
    const r = this.server.submit(bill.payload);
    return Promise.resolve({ kind: r.kind, doc_no: r.bill.doc_no });
  }
  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    if (bill.id === this.failId) {
      return Promise.reject(new Error("Network request failed"));
    }
    return Promise.resolve(toVoidOutcome(this.server.voidBill(bill.id, reason)));
  }
}

/* ---------------------------------------------------------------- rig ---- */

interface Rig {
  store: InMemoryStore;
  clock: FakeClock;
  server: FakeServer;
  transport: MutableTransport;
  recorder: RecordingTransport;
  registry: OutboxRegistry;
  runner: OutboxRunner;
  ids: SeqIds;
  deps: OutboxDeps;
}

function rig(opts?: {
  prefix?: string;
  inner?: Transport;
  backoffBaseMs?: number;
  masterDataRetryMs?: number;
}): Rig {
  const store = new InMemoryStore();
  store.setIdentity(PROOF_OWNER);
  const clock = new FakeClock();
  const server = new FakeServer();
  const transport = new MutableTransport(opts?.inner ?? new OnlineTransport(server));
  const recorder = new RecordingTransport(transport);
  const deps: OutboxDeps = {
    store,
    transport: recorder,
    clock,
    backoffBaseMs: opts?.backoffBaseMs ?? 1000,
    backoffMaxMs: 30_000,
    masterDataRetryMs: opts?.masterDataRetryMs ?? 300_000,
  };
  const registry = buildOutboxRegistry(deps);
  const runner = new OutboxRunner({ registry, clock });
  return {
    store,
    clock,
    server,
    transport,
    recorder,
    registry,
    runner,
    ids: new SeqIds(opts?.prefix ?? "ob"),
    deps,
  };
}

async function newBill(r: Rig): Promise<LocalBill> {
  return createLocalBill({ store: r.store, clock: r.clock, ids: r.ids }, DRAFT, PROOF_OWNER);
}

/* ------------------------------------------------------------------ O1 ---- */

async function o1RegistryAndRecovery(): Promise<void> {
  header("O1: the runner enumerates the registry; every kind recovers at boot");
  const r = rig({ prefix: "o1" });

  const kinds = Object.keys(r.registry);
  check(
    "registry member order is bill_send then bill_void — LOAD-BEARING, the runner drains in this order",
    kinds.length === 2 && kinds[0] === "bill_send" && kinds[1] === "bill_void",
    JSON.stringify(kinds),
  );

  const rec = await r.runner.recoverAll(r.clock.now());
  const recKeys = Object.keys(rec).sort();
  const kindSet = [...kinds].sort();
  check(
    "recoverAll's key set EQUALS the member set — equality, because only equality asks what is missing",
    JSON.stringify(recKeys) === JSON.stringify(kindSet),
    `keys=${JSON.stringify(recKeys)} kinds=${JSON.stringify(kindSet)}`,
  );
  check(
    "bill_void's recover is a VISIBLE no-op: present in the map, and empty",
    Array.isArray(rec.bill_void) && rec.bill_void.length === 0,
    JSON.stringify(rec.bill_void),
  );

  // (i) the kind WITH durable in-flight state: a send in progress when the
  // process died is swept back to owed, and the next pass attempts it.
  const bill = await newBill(r);
  await r.store.claimForSend(bill.id, r.clock.now());
  const stranded = await r.store.getBill(bill.id);
  check("staging: the bill is stranded 'syncing'", stranded?.sync_state === "syncing");
  const rec2 = await r.runner.recoverAll(r.clock.now());
  check(
    "the send kind's recover sweeps it back, and NAMES it",
    rec2.bill_send.includes(bill.id),
    JSON.stringify(rec2),
  );
  const rep = await r.runner.runPass();
  check(
    "one pass then attempts and settles it",
    rep.result.attempted === 1 && rep.result.synced === 1,
    `attempted=${String(rep.result.attempted)} synced=${String(rep.result.synced)}`,
  );
  check(
    "the pass report is keyed by kind, both kinds present",
    Object.keys(rep.performed).sort().join(",") === "bill_send,bill_void" &&
      rep.performed.bill_send === 1 &&
      rep.performed.bill_void === 0,
    JSON.stringify(rep.performed),
  );
}

/* ------------------------------------------------------------------ O2 ---- */

async function o2SendsSettleBeforeVoidsAreRead(): Promise<void> {
  header("O2: sends settle before voids are read — offline bill + offline void, ONE pass");
  const r = rig({ prefix: "o2" });
  const bill = await newBill(r);
  await r.store.requestVoid(bill.id, "ชั่งผิด", r.clock.now());

  const before = await r.store.getBill(bill.id);
  const owedBefore = await r.store.listVoidsToApply(10);
  const countBefore = await r.store.countVoidsOwed();
  check(
    "staging: unsent, no doc_no, void requested",
    before?.sync_state === "pending" && before.doc_no === null && before.void_requested_at !== null,
  );
  check(
    "the void is OWED (countVoidsOwed=1) while not yet ACTIONABLE (listVoidsToApply empty) — owed is wider",
    countBefore === 1 && owedBefore.length === 0,
    `count=${String(countBefore)} actionable=${String(owedBefore.length)}`,
  );

  const rep = await r.runner.runPass();
  const after = await r.store.getBill(bill.id);
  console.log(
    `  one pass -> synced=${String(rep.result.synced)} voidsApplied=${String(rep.result.voidsApplied)}` +
      ` doc_no=${String(after?.doc_no)} voided_at=${String(after?.voided_at)}`,
  );
  check(
    "at the end of ONE pass the bill is synced with a doc_no AND voided_at is set",
    after?.sync_state === "synced" && after.doc_no !== null && after.voided_at !== null,
  );
  check(
    "presence pair in the SAME pass's result: one send settled and one void applied, together",
    rep.result.synced === 1 && rep.result.voidsApplied === 1,
    `synced=${String(rep.result.synced)} voidsApplied=${String(rep.result.voidsApplied)}`,
  );
}

/* ------------------------------------------------------------------ O3 ---- */

async function o3DrainAdvancesAndTerminates(): Promise<void> {
  header("O3: the drain advances by cursor and terminates under every policy");

  // (i) independent kind, EVERY row bouncing retry: one pass returns, and the
  // set of ids performed EQUALS the set owed() returned at the start.
  const r = rig({ prefix: "o3a" });
  const bills = [await newBill(r), await newBill(r), await newBill(r)];
  await r.runner.runPass(); // sync all three
  for (const b of bills) await r.store.requestVoid(b.id, "ยกเลิก", r.clock.now());
  const owedAtStart = (await r.store.listVoidsToApply(100)).map((b) => b.id);
  r.transport.inner = new OfflineTransport(); // every void THROWS -> retry
  const voidsBefore = r.recorder.voidIds.length;
  const rep = await r.runner.runPass();
  const performedIds = r.recorder.voidIds.slice(voidsBefore);
  check(
    "the ids performed EQUAL the owed set at pass start — each exactly once",
    JSON.stringify([...performedIds].sort()) === JSON.stringify([...owedAtStart].sort()) &&
      performedIds.length === owedAtStart.length,
    `performed=${JSON.stringify(performedIds)} owed=${JSON.stringify(owedAtStart)}`,
  );
  check(
    "all three are STILL OWED after the pass (retry keeps them), and the pass returned",
    rep.result.voidsRetryable === 3 && (await r.store.listVoidsToApply(100)).length === 3,
    `voidsRetryable=${String(rep.result.voidsRetryable)}`,
  );

  // (ii) head_blocks with the same staging: perform is called on exactly the
  // head and on nothing else.
  const r2 = rig({ prefix: "o3b", inner: new OfflineTransport() });
  const first = await newBill(r2);
  r2.clock.advance(1000);
  await newBill(r2);
  r2.clock.advance(1000);
  await newBill(r2);
  const sendsBefore = r2.recorder.sendIds.length;
  const rep2 = await r2.runner.runPass();
  const sent = r2.recorder.sendIds.slice(sendsBefore);
  check(
    "under head_blocks, perform ran on exactly the head",
    sent.length === 1 && sent[0] === first.id,
    JSON.stringify(sent),
  );
  check(
    "and the pass reports one attempt, one retryable",
    rep2.result.attempted === 1 && rep2.result.retryable === 1,
    `attempted=${String(rep2.result.attempted)} retryable=${String(rep2.result.retryable)}`,
  );
}

/* ------------------------------------------------------------------ O4 ---- */

async function o4HeadBlocks(): Promise<void> {
  header("O4: the head blocks — with device_created_at DISAGREEING with created_at and insert order");

  // Weighing order A < B < C; created_at order C < B < A; inserted C, B, A.
  // Any drain ordering by created_at, or by insertion, puts C first — only
  // device_created_at puts A first. A bounces with a reachable 503 (retry).
  const r = rig({ prefix: "o4a" });
  const a = billAt(r.ids, "2026-07-21T08:00:00.000Z", "2026-07-21T10:02:00.000Z");
  const b = billAt(r.ids, "2026-07-21T08:30:00.000Z", "2026-07-21T10:01:00.000Z");
  const c = billAt(r.ids, "2026-07-21T09:00:00.000Z", "2026-07-21T10:00:00.000Z");
  await r.store.putBill(c, PROOF_OWNER);
  await r.store.putBill(b, PROOF_OWNER);
  await r.store.putBill(a, PROOF_OWNER);
  r.clock.advance(13 * 3_600_000); // 13:00 — every schedule is due
  r.transport.inner = new HeadFailingTransport(r.server, a.id);
  const sendsBefore = r.recorder.sendIds.length;
  const rep = await r.runner.runPass();
  const sent = r.recorder.sendIds.slice(sendsBefore);
  check(
    "the OLDEST BY WEIGHING was performed exactly once (presence sibling)",
    sent.length === 1 && sent[0] === a.id,
    `sent=${JSON.stringify(sent)} — created_at order would have sent ${c.id}`,
  );
  const bAfter = await r.store.getBill(b.id);
  const cAfter = await r.store.getBill(c.id);
  check(
    "the two younger bills have NO doc_no after the pass",
    bAfter?.doc_no === null && cAfter?.doc_no === null,
  );
  check(
    "the pass stopped at the head: one attempt, one retryable, nothing synced",
    rep.result.attempted === 1 && rep.result.retryable === 1 && rep.result.synced === 0,
    `attempted=${String(rep.result.attempted)}`,
  );

  // The same-pass half: a send frees a younger bill's backoff, and the freed
  // bill goes IN THE SAME PASS — what rereadAfterEach exists for, and what a
  // snapshot drain cannot do (the batch's clone still carries the old
  // schedule).
  const r2 = rig({ prefix: "o4b" });
  const x = billAt(r2.ids, "2026-07-21T08:00:00.000Z", "2026-07-21T08:00:00.000Z");
  const y = billAt(
    r2.ids,
    "2026-07-21T08:30:00.000Z",
    "2026-07-21T08:30:00.000Z",
    "2026-07-21T13:00:30.000Z", // a real backoff, 30s past the pass's `now`
  );
  await r2.store.putBill(x, PROOF_OWNER);
  await r2.store.putBill(y, PROOF_OWNER);
  r2.clock.advance(13 * 3_600_000); // 13:00
  const rep2 = await r2.runner.runPass();
  const xAfter = await r2.store.getBill(x.id);
  const yAfter = await r2.store.getBill(y.id);
  console.log(
    `  same-pass: synced=${String(rep2.result.synced)} backoffsCleared=${String(rep2.result.backoffsCleared)}` +
      ` x=${String(xAfter?.doc_no)} y=${String(yAfter?.doc_no)}`,
  );
  check(
    "the head's success cleared the younger bill's backoff and BOTH went in ONE pass",
    rep2.result.synced === 2 && rep2.result.backoffsCleared === 1,
    `synced=${String(rep2.result.synced)} backoffsCleared=${String(rep2.result.backoffsCleared)}`,
  );
  check(
    "in weighing order: the older bill took the lower doc_no",
    xAfter?.doc_no === "B-2569-1" && yAfter?.doc_no === "B-2569-2",
    `x=${String(xAfter?.doc_no)} y=${String(yAfter?.doc_no)}`,
  );
}

/* ------------------------------------------------------------------ O5 ---- */

async function o5VoidKeepsEveryDifference(): Promise<void> {
  header("O5: the void kind keeps every difference the design names");

  // The policy object, field by field, against the design's enumerated list.
  // Expected values are LITERALS from the design's text, never read off the
  // policy constant — comparing the constant to itself would prove nothing.
  const r0 = rig({ prefix: "o5p" });
  const vp = r0.registry.bill_void.policy;
  check(
    "bill_void policy field-by-field: independent, snapshot, parallel_rows, prefixed key, idempotent re-send",
    vp.blocking === "independent" &&
      vp.rereadAfterEach === false &&
      vp.concurrency === "parallel_rows" &&
      vp.inFlightKey("x") === "void:x" &&
      vp.resendIsIdempotent === true,
    JSON.stringify({
      blocking: vp.blocking,
      rereadAfterEach: vp.rereadAfterEach,
      concurrency: vp.concurrency,
      key: vp.inFlightKey("x"),
      resendIsIdempotent: vp.resendIsIdempotent,
    }),
  );
  const sp = r0.registry.bill_send.policy;
  check(
    "bill_send policy sibling: head_blocks, re-read, serial_per_kind, bare key",
    sp.blocking === "head_blocks" &&
      sp.rereadAfterEach === true &&
      sp.concurrency === "serial_per_kind" &&
      sp.inFlightKey("x") === "x",
    JSON.stringify({ blocking: sp.blocking, key: sp.inFlightKey("x") }),
  );
  const sampleVoid = billAt(r0.ids, "2026-07-21T08:00:00.000Z", "2026-07-21T08:00:00.000Z");
  check(
    "no time gate and no schedule: dueAt and nextAttemptAt are null for the void kind",
    r0.registry.bill_void.dueAt(sampleVoid) === null &&
      r0.registry.bill_void.nextAttemptAt(sampleVoid, { next: "retry", reason: "x" }, 3, r0.clock.now()) ===
        null,
  );
  check(
    "no durable claim: claim answers true, recover answers empty",
    (await r0.registry.bill_void.claim(sampleVoid)) === true &&
      (await r0.registry.bill_void.recover(r0.clock.now())).length === 0,
  );

  // THE HELD BRANCH under `independent`, staged against a state the stores CAN
  // produce: two owed voids, one runner, the first void call held in flight —
  // a second pass must ADVANCE past the held row and attempt the SECOND void.
  const r = rig({ prefix: "o5h" });
  const b1 = await newBill(r);
  r.clock.advance(1000);
  const b2 = await newBill(r);
  await r.runner.runPass(); // sync both
  await r.store.requestVoid(b1.id, "ยกเลิก 1", r.clock.now());
  await r.store.requestVoid(b2.id, "ยกเลิก 2", r.clock.now());
  const gated = new VoidGatedTransport(r.server);
  r.transport.inner = gated;
  const p1 = r.runner.runPass();
  await gated.firstVoidStarted; // v1 is now held in flight inside pass 1
  const rep2 = await r.runner.runPass(); // pass 2, entered while v1 is held
  check(
    "a second pass ADVANCES past the held row and attempts the SECOND void",
    rep2.result.voidsApplied === 1 && gated.voidCallIds.length === 2 && gated.voidCallIds[1] === b2.id,
    `calls=${JSON.stringify(gated.voidCallIds)}`,
  );
  gated.open();
  const rep1 = await p1;
  const b1After = await r.store.getBill(b1.id);
  const b2After = await r.store.getBill(b2.id);
  check(
    "presence sibling: the FIRST void was performed exactly ONCE across both passes, and both settled",
    gated.voidCallIds.filter((id) => id === b1.id).length === 1 &&
      b1After?.voided_at !== null &&
      b2After?.voided_at !== null,
    `calls=${JSON.stringify(gated.voidCallIds)}`,
  );
  // Pass 1 resumed over its own SNAPSHOT and re-POSTed the second void, which
  // pass 2 had already settled. That is today's applyVoids under overlapping
  // passes too — a snapshot is read at pass start, and the in-flight key was
  // released when pass 2 finished — and it is exactly the repeat
  // resendIsIdempotent declares safe: the server answers "already voided",
  // which classifies settled. Asserted rather than hidden.
  check(
    "the stale-snapshot repeat was answered 'already voided' — a settle, never a failure or a second void",
    rep1.result.voidsRetryable === 0 && rep1.result.voidsRejected === 0 && r.server.voidedCount === 2,
    `applied(p1)=${String(rep1.result.voidsApplied)} serverVoided=${String(r.server.voidedCount)}`,
  );

  // TWO VOIDS OWED, THE FIRST BOUNCING: the second is attempted in the SAME
  // pass — the whole of what `independent` means.
  const r3 = rig({ prefix: "o5f" });
  const c1 = await newBill(r3);
  r3.clock.advance(1000);
  const c2 = await newBill(r3);
  await r3.runner.runPass();
  await r3.store.requestVoid(c1.id, "ยกเลิก 1", r3.clock.now());
  await r3.store.requestVoid(c2.id, "ยกเลิก 2", r3.clock.now());
  r3.transport.inner = new VoidFailingTransport(r3.server, c1.id);
  const rep3 = await r3.runner.runPass();
  check(
    "the first void bounced and the second was still attempted in the SAME pass",
    rep3.result.voidsRetryable === 1 && rep3.result.voidsApplied === 1,
    `retryable=${String(rep3.result.voidsRetryable)} applied=${String(rep3.result.voidsApplied)}`,
  );
  // A bounced void is re-attempted on the NEXT pass with NO wait: no backoff
  // column exists on this path, and the kind's schedule is null.
  r3.transport.inner = new OnlineTransport(r3.server);
  const rep4 = await r3.runner.runPass(); // clock NOT advanced
  const c1After = await r3.store.getBill(c1.id);
  check(
    "the bounced void was re-attempted immediately — no wait, no backoff",
    rep4.result.voidsApplied === 1 && c1After?.voided_at !== null,
    `applied=${String(rep4.result.voidsApplied)}`,
  );

  // A void the server refuses on identity grounds leaves the owed queue.
  const r5 = rig({ prefix: "o5r" });
  const d1 = await newBill(r5);
  await r5.runner.runPass();
  await r5.store.requestVoid(d1.id, "ยกเลิก", r5.clock.now());
  check("presence sibling: the void is owed before the refusal", (await r5.store.countVoidsOwed()) === 1);
  r5.transport.inner = new ForbiddenTransport(r5.server, { sends: false, voids: true });
  const rep5 = await r5.runner.runPass();
  const d1After = await r5.store.getBill(d1.id);
  check(
    "refused on identity grounds: void_refused_at set, with the server's own code",
    rep5.result.voidsForbidden === 1 &&
      d1After?.void_refused_at !== null &&
      d1After?.void_refused_code === "admin_required",
    `code=${String(d1After?.void_refused_code)}`,
  );
  check(
    "and it LEFT the owed queue: not actionable, not counted",
    (await r5.store.listVoidsToApply(10)).length === 0 && (await r5.store.countVoidsOwed()) === 0,
  );
}

/* ------------------------------------------------------------------ O6 ---- */

function o6ThrowLandsInOneOfTwoPlaces(r: Rig): void {
  header("O6: a throw lands in one of two places — every kind, operands printed");
  for (const kind of Object.keys(r.registry) as OutboxKind[]) {
    const h: OutboxHandler<unknown, unknown> = r.registry[kind];
    const d = h.classify(h.onThrow(new Error("x")));
    const expected = h.policy.resendIsIdempotent ? "retry" : "needs_review";
    console.log(
      `  kind=${kind} resendIsIdempotent=${String(h.policy.resendIsIdempotent)}` +
        ` classify(onThrow(Error)).next=${d.next} expected=${expected}`,
    );
    check(`${kind}: classify(onThrow(x)).next EQUALS ${expected}`, d.next === expected);
  }
}

/* ------------------------------------------------------------------ O7 ---- */

async function o7ScheduleStaysInsideTheHorizon(): Promise<void> {
  header("O7: a schedule past the horizon fails LOUDLY; a legal one is honoured");

  // (i) a handler returning now + HORIZON + 1ms: the write must fail loudly,
  // with the kind, the row id and the value — never a clamp.
  const r = rig({ prefix: "o7a", inner: new OfflineTransport() });
  const broken: OutboxRegistry = {
    ...r.registry,
    bill_send: {
      ...r.registry.bill_send,
      nextAttemptAt: (_row, d, _attempt, now) =>
        d.next === "retry" ? new Date(now.getTime() + SEND_SCHEDULE_HORIZON_MS + 1) : null,
    },
  };
  const brokenRunner = new OutboxRunner({ registry: broken, clock: r.clock });
  const bill = await newBill(r);
  let threw: Error | null = null;
  try {
    await brokenRunner.runPass();
  } catch (err) {
    threw = err instanceof Error ? err : new Error(String(err));
  }
  check(
    "the pass THREW, naming the kind, the row and the value",
    threw !== null &&
      threw.message.includes("bill_send") &&
      threw.message.includes(bill.id) &&
      threw.message.includes("nextAttemptAt"),
    threw === null ? "no throw" : threw.message,
  );
  const after = await r.store.getBill(bill.id);
  check(
    "and record NEVER RAN: no attempt recorded, no error text, the claim left standing for recovery",
    after?.sync_state === "syncing" && after.attempt_count === 0 && after.last_error === null,
    `state=${String(after?.sync_state)} attempts=${String(after?.attempt_count)}`,
  );
  // The pass lock was released ON THE THROW PATH: after recovery, the same
  // runner drains normally. A leaked lock would return without reading rows.
  await brokenRunner.recoverAll(r.clock.now());
  r.transport.inner = new OnlineTransport(r.server);
  const rep = await brokenRunner.runPass(); // settled -> nextAttemptAt null -> no throw
  check(
    "the pass lock survived the throw: the SAME runner's next pass drains and settles the bill",
    rep.performed.bill_send === 1 && rep.result.synced === 1,
    `performed=${JSON.stringify(rep.performed)}`,
  );

  // (ii) a LEGAL delay is honoured: not attempted again before it, attempted
  // after it — the presence sibling for (i).
  const r2 = rig({ prefix: "o7b", inner: new OfflineTransport(), backoffBaseMs: 5000 });
  const b2 = await newBill(r2);
  const rep1 = await r2.runner.runPass();
  const mid = await r2.store.getBill(b2.id);
  const expectedNext = new Date(r2.clock.now().getTime() + 5000).toISOString();
  check(
    "the bounce wrote the kind's own schedule (base backoff, attempt 1)",
    rep1.result.retryable === 1 && mid?.next_attempt_at === expectedNext,
    `next=${String(mid?.next_attempt_at)} expected=${expectedNext}`,
  );
  r2.transport.inner = new OnlineTransport(r2.server);
  const rep2 = await r2.runner.runPass(); // immediately — schedule not due
  check(
    "before the delay the row is NOT attempted (the head waits, the pass ends)",
    rep2.performed.bill_send === 0 && rep2.result.attempted === 0,
    JSON.stringify(rep2.performed),
  );
  r2.clock.advance(5001);
  const rep3 = await r2.runner.runPass();
  check(
    "after the delay it IS attempted, and settles",
    rep3.result.attempted === 1 && rep3.result.synced === 1,
    `attempted=${String(rep3.result.attempted)}`,
  );
}

/* ------------------------------------------------------------------ O8 ---- */

async function o8ParkedIsNotTerminal(): Promise<void> {
  header("O8: parked is not terminal — and not a session expiry (headless half)");
  const r = rig({ prefix: "o8" });
  const p = billAt(r.ids, "2026-07-21T08:00:00.000Z", "2026-07-21T08:00:00.000Z");
  const q = billAt(r.ids, "2026-07-21T08:30:00.000Z", "2026-07-21T08:30:00.000Z");
  await r.store.putBill(p, PROOF_OWNER);
  await r.store.putBill(q, PROOF_OWNER);
  r.clock.advance(13 * 3_600_000);
  const transport = new MasterDataMissingTransport(r.server, p.id);
  r.transport.inner = transport;

  const countBefore = await r.registry.bill_send.owedCount();
  const rep = await r.runner.runPass();
  const pAfter = await r.store.getBill(p.id);
  const qAfter = await r.store.getBill(q.id);
  check(
    "the 424 bill is parked: still pending, master_data_missing_at set",
    pAfter?.sync_state === "pending" && pAfter.master_data_missing_at !== null,
  );
  check(
    "its master_data_code EQUALS the code the server sent",
    pAfter?.master_data_code === "product_price_unset",
    `code=${String(pAfter?.master_data_code)}`,
  );
  check(
    "it is absent from the sendable queue",
    !(await r.store.listPendingOldestFirst(10)).some((x) => x.id === p.id),
  );
  check(
    "presence sibling: the bill weighed BEHIND it sent in the SAME pass",
    qAfter?.sync_state === "synced" && rep.result.synced === 1,
    `q=${String(qAfter?.sync_state)}`,
  );
  check(
    "the pass reports PARKED and not a session expiry",
    rep.result.masterDataBlocked === 1 && rep.result.sessionExpired === 0,
    `masterDataBlocked=${String(rep.result.masterDataBlocked)} sessionExpired=${String(rep.result.sessionExpired)}`,
  );
  const countAfter = await r.registry.bill_send.owedCount();
  check(
    "owedCount still counts the parked bill — out of the queue is not out of the debt",
    countBefore === 2 && countAfter === 1,
    `before=${String(countBefore)} after=${String(countAfter)}`,
  );

  // After the kind's own cadence it returns to the queue with nobody pressing
  // anything. The release call is runOnce's pre-pass step today; commit 2
  // wires this composition — here the mechanism half is what is proven.
  transport.addPrice();
  r.clock.advance(300_001);
  const released = await r.store.releaseMasterDataBlocked(r.clock.now(), false);
  const rep2 = await r.runner.runPass();
  const pFinal = await r.store.getBill(p.id);
  check(
    "after the cadence the parked bill returns and settles, unchanged",
    released === 1 && rep2.result.synced === 1 && pFinal?.sync_state === "synced",
    `released=${String(released)} synced=${String(rep2.result.synced)}`,
  );
}

/* ------------------------------------------------------------------ O9 ---- */

async function o9PoisonSignalSurvivesBothWays(): Promise<void> {
  header("O9: the poison signal accumulates, resets, and a 401/403 is never 'retryable'");
  const r = rig({ prefix: "o9", backoffBaseMs: 1000 });
  const bill = await newBill(r);
  const row = async () => {
    const b = await r.store.getBill(bill.id);
    if (b === null) throw new Error("bill vanished");
    return b;
  };

  // ACCUMULATE against a reachable server — the same row, so the later resets
  // are known to act on non-zero columns.
  r.transport.inner = new HeadFailingTransport(r.server, bill.id);
  await r.runner.runPass();
  const after1 = await row();
  const t1 = after1.first_server_error_at;
  check(
    "reachable bounce 1: server_error_attempts=1, first_server_error_at stamped",
    after1.server_error_attempts === 1 && t1 !== null,
    `attempts=${String(after1.server_error_attempts)} first=${String(t1)}`,
  );
  r.clock.advance(60_000);
  await r.runner.runPass();
  const after2 = await row();
  check(
    "reachable bounce 2: attempts accumulate and the stamp DOES NOT MOVE",
    after2.server_error_attempts === 2 && after2.first_server_error_at === t1,
    `attempts=${String(after2.server_error_attempts)} first=${String(after2.first_server_error_at)}`,
  );

  // ONE transport-level bounce: both poison columns RESET; the total-stuck
  // clock (first_attempt_at) survives, because it measures something else.
  r.transport.inner = new OfflineTransport();
  r.clock.advance(60_000);
  await r.runner.runPass();
  const after3 = await row();
  check(
    "offline bounce: both poison columns reset, first_attempt_at kept",
    after3.server_error_attempts === 0 &&
      after3.first_server_error_at === null &&
      after3.first_attempt_at !== null,
    `attempts=${String(after3.server_error_attempts)} first=${String(after3.first_server_error_at)}`,
  );

  // A 401 on a row with accumulated counters: reset, and the pass reports
  // sessionExpired — NOT retryable. The cell that separates the collapse.
  r.transport.inner = new HeadFailingTransport(r.server, bill.id);
  r.clock.advance(60_000);
  await r.runner.runPass();
  check("re-accumulated: attempts=1 before the 401", (await row()).server_error_attempts === 1);
  r.transport.inner = new ExpiredSessionTransport(r.server);
  r.clock.advance(60_000);
  const rep401 = await r.runner.runPass();
  const after4 = await row();
  check(
    "401: both poison columns reset, and the pass reports sessionExpired, not retryable",
    after4.server_error_attempts === 0 &&
      after4.first_server_error_at === null &&
      rep401.result.sessionExpired === 1 &&
      rep401.result.retryable === 0,
    `sessionExpired=${String(rep401.result.sessionExpired)} retryable=${String(rep401.result.retryable)}`,
  );

  // A 403 the same way — and the KIND stops, durably.
  r.transport.inner = new HeadFailingTransport(r.server, bill.id);
  r.clock.advance(60_000);
  await r.runner.runPass();
  check("re-accumulated: attempts=1 before the 403", (await row()).server_error_attempts === 1);
  r.transport.inner = new ForbiddenTransport(r.server, { sends: true, voids: false });
  r.clock.advance(60_000);
  const rep403 = await r.runner.runPass();
  const after5 = await row();
  check(
    "403: both poison columns reset, and the pass reports forbidden, not retryable",
    after5.server_error_attempts === 0 &&
      after5.first_server_error_at === null &&
      rep403.result.forbidden === 1 &&
      rep403.result.retryable === 0,
    `forbidden=${String(rep403.result.forbidden)} retryable=${String(rep403.result.retryable)}`,
  );
  check(
    "halt_kind is set on the runner, keyed by kind",
    r.runner.haltedKinds().includes("bill_send"),
    JSON.stringify(r.runner.haltedKinds()),
  );

  // The halt SURVIVES the pass: the next pass reads no rows and calls no
  // transport for the halted kind.
  const sendCalls = r.recorder.sendIds.length;
  r.clock.advance(60_000);
  const repHalted = await r.runner.runPass();
  check(
    "a halted kind's pass attempts nothing — no rows read into work, no transport call",
    repHalted.performed.bill_send === 0 &&
      repHalted.result.attempted === 0 &&
      r.recorder.sendIds.length === sendCalls,
    JSON.stringify(repHalted.performed),
  );

  // Retraction — the two events that may call this in commit 2 are
  // resumeAfterSignIn and resetAfterSignOut; here the runner API is driven
  // directly. One request rediscovers the world.
  r.runner.retractHalts();
  r.transport.inner = new OnlineTransport(r.server);
  r.clock.advance(60_000);
  const repAfter = await r.runner.runPass();
  const final = await row();
  check(
    "after retraction the kind drains again and the bill settles",
    repAfter.result.synced === 1 && final.sync_state === "synced" && final.doc_no !== null,
    `synced=${String(repAfter.result.synced)} doc_no=${String(final.doc_no)}`,
  );
}

/* ----------------------------------------------------------------- O10 ---- */

async function o10OwedCarriesTheOwnerPredicate(): Promise<void> {
  header("O10: owed() carries the owner predicate — through the REAL store, per kind");
  const dir = mkdtempSync(join(tmpdir(), "recycle-p118-owner-"));
  const driver = NodeSqliteDriver.open(join(dir, "owner.db"));
  try {
    const store = await SqliteLocalStore.open(driver);
    const idStore = new SqliteIdentityStore(driver);
    await idStore.save(PROOF_OWNER);
    const clock = new FakeClock();
    const server = new FakeServer();
    const ids = new SeqIds("o10");
    const deps: OutboxDeps = {
      store,
      transport: new OnlineTransport(server),
      clock,
      backoffBaseMs: 1000,
      backoffMaxMs: 30_000,
      masterDataRetryMs: 300_000,
    };
    const registry = buildOutboxRegistry(deps);

    // bill_send: a row weighed by somebody else is ABSENT, mine is PRESENT —
    // in the same call, because an empty result satisfies every absence.
    const mine = await createLocalBill({ store, clock, ids }, DRAFT, PROOF_OWNER);
    const theirs = await createLocalBill({ store, clock, ids }, DRAFT, OTHER_OWNER);
    const sendOwed = (await registry.bill_send.owed(100)).map((x) => x.id);
    check(
      "bill_send.owed: my bill present, the other identity's bill absent",
      sendOwed.includes(mine.id) && !sendOwed.includes(theirs.id),
      JSON.stringify(sendOwed),
    );
    check(
      "bill_send.owedCount counts mine only",
      (await registry.bill_send.owedCount()) === 1,
    );

    // bill_void: the fixtures DIFFER PER KIND — the predicate is who ORDERED
    // the reversal, not who weighed the bill. A predicate copied from the send
    // path gets BOTH of these backwards.
    const myBill = asSynced(
      billAt(ids, "2026-07-21T09:00:00.000Z", "2026-07-21T09:00:00.000Z"),
      "B-2569-90",
      "2026-07-21T09:05:00.000Z",
    );
    await store.putBill(myBill, PROOF_OWNER);
    await idStore.save(OTHER_OWNER); // the OTHER person orders the reversal
    await store.requestVoid(myBill.id, "ยกเลิกโดยคนอื่น", clock.now());
    await idStore.save(PROOF_OWNER);

    const theirBill = asSynced(
      billAt(ids, "2026-07-21T09:10:00.000Z", "2026-07-21T09:10:00.000Z"),
      "B-2569-91",
      "2026-07-21T09:15:00.000Z",
    );
    await store.putBill(theirBill, OTHER_OWNER);
    await store.requestVoid(theirBill.id, "ยกเลิกโดยฉัน", clock.now()); // I order it

    const voidOwed = (await registry.bill_void.owed(100)).map((x) => x.id);
    check(
      "bill_void.owed: MY bill voided by SOMEBODY ELSE is absent",
      !voidOwed.includes(myBill.id),
      JSON.stringify(voidOwed),
    );
    check(
      "bill_void.owed: SOMEBODY ELSE'S bill voided by ME is present",
      voidOwed.includes(theirBill.id),
      JSON.stringify(voidOwed),
    );
    check("bill_void.owedCount counts my request only", (await registry.bill_void.owedCount()) === 1);

    // NO identity stored: owed() is EMPTY for every kind — fail closed — with
    // the presence control that the same instrument saw rows a moment ago and
    // sees them again once the identity returns.
    await idStore.clear();
    for (const kind of Object.keys(registry) as OutboxKind[]) {
      const h: OutboxHandler<unknown, unknown> = registry[kind];
      const owed = await h.owed(100);
      const count = await h.owedCount();
      check(
        `${kind}: with NO identity stored, owed() is empty and owedCount is 0`,
        owed.length === 0 && count === 0,
        `owed=${String(owed.length)} count=${String(count)}`,
      );
    }
    await idStore.save(PROOF_OWNER);
    check(
      "presence control: the identity restored, the same instrument sees the rows again",
      (await registry.bill_send.owed(100)).length === 1 &&
        (await registry.bill_void.owed(100)).length === 1,
    );

    await driver.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ----------------------------------------------------------------- O11 ---- */

async function o11LostClaimIsNotAnOutcome(): Promise<void> {
  header("O11: a lost claim is not an outcome");
  const r = rig({ prefix: "o11" });
  let recordCalled = false;
  const lostClaim: OutboxRegistry = {
    ...r.registry,
    bill_send: {
      ...r.registry.bill_send,
      claim: () => Promise.resolve(false),
      record: (...args) => {
        recordCalled = true;
        return r.registry.bill_send.record(...args);
      },
    },
  };
  const runner = new OutboxRunner({ registry: lostClaim, clock: r.clock });
  const bill = await newBill(r);
  const rep = await runner.runPass();
  const after = await r.store.getBill(bill.id);
  check("record was NOT called", !recordCalled);
  check(
    "the row is untouched: still pending, attempt_count unchanged",
    after?.sync_state === "pending" && after.attempt_count === 0,
    `state=${String(after?.sync_state)} attempts=${String(after?.attempt_count)}`,
  );
  check(
    "the pass reports the skip and nothing else",
    rep.result.skippedInFlight === 1 && rep.result.attempted === 0,
    `skipped=${String(rep.result.skippedInFlight)} attempted=${String(rep.result.attempted)}`,
  );
  check(
    "and the row is still returned by owed()",
    (await r.registry.bill_send.owed(10)).some((x) => x.id === bill.id),
  );
}

/* ----------------------------------------------------------------- O12 ---- */

async function o12MidPassCounts(): Promise<void> {
  header("O12: a claimed bill leaves owed() and NOT owedCount() — the mid-pass separation");
  const r = rig({ prefix: "o12" });
  const gated = new GatedTransport(r.server);
  r.transport.inner = gated;
  const bill = await newBill(r);
  const p1 = r.runner.runPass();
  for (let i = 0; i < 10_000 && gated.started.length === 0; i += 1) {
    await Promise.resolve();
  }
  check("staging: the send is held in flight", gated.started.length === 1, JSON.stringify(gated.started));
  const owedMidPass = await r.registry.bill_send.owed(10);
  const countMidPass = await r.registry.bill_send.owedCount();
  const midRow = await r.store.getBill(bill.id);
  check(
    "mid-pass: the claimed bill is outside owed() (it is 'syncing') and INSIDE owedCount()",
    midRow?.sync_state === "syncing" && owedMidPass.length === 0 && countMidPass === 1,
    `state=${String(midRow?.sync_state)} owed=${String(owedMidPass.length)} count=${String(countMidPass)}`,
  );
  gated.open();
  const rep = await p1;
  check(
    "released: the send settles and the debt is gone",
    rep.result.synced === 1 && (await r.registry.bill_send.owedCount()) === 0,
  );
}

/* ----------------------------------------------------------------- O13 ---- */

async function o13PassesOverlapAndOrderHolds(): Promise<void> {
  header("O13: passes overlap and order holds — TWO runner instances over ONE store");

  // The pass lock is PROCESS-scoped, so a second RUNNER OBJECT is still the
  // same JavaScript context: entered while the first pass holds a claimed head
  // in flight, it must return without reading rows. An instance-field lock is
  // the criterion's named red case — it passes a one-runner staging and lets
  // the second instance reach past the head.
  const r = rig({ prefix: "o13" });
  const x = billAt(r.ids, "2026-07-21T08:00:00.000Z", "2026-07-21T08:00:00.000Z");
  const y = billAt(r.ids, "2026-07-21T08:30:00.000Z", "2026-07-21T08:30:00.000Z");
  await r.store.putBill(x, PROOF_OWNER);
  await r.store.putBill(y, PROOF_OWNER);
  r.clock.advance(13 * 3_600_000);
  const gated = new SendGatedTransport(r.server);
  r.transport.inner = gated;
  const p1 = r.runner.runPass();
  await gated.firstSendStarted; // the older bill is claimed and held in flight
  const second = new OutboxRunner({ registry: r.registry, clock: r.clock });
  const repB = await second.runPass();
  check(
    "a SECOND runner instance entered mid-flight returns without reading rows",
    repB.performed.bill_send === 0 && repB.result.attempted === 0 && gated.sendIds.length === 1,
    `performed=${JSON.stringify(repB.performed)} sends=${JSON.stringify(gated.sendIds)}`,
  );
  gated.open();
  const repA = await p1;
  const xAfter = await r.store.getBill(x.id);
  const yAfter = await r.store.getBill(y.id);
  check(
    "the first pass then sends BOTH, in weighing order",
    repA.result.synced === 2 && xAfter?.doc_no === "B-2569-1" && yAfter?.doc_no === "B-2569-2",
    `x=${String(xAfter?.doc_no)} y=${String(yAfter?.doc_no)}`,
  );

  // THE CONTROL THE CRITERION REQUIRES: `concurrency` forced to parallel_rows
  // for the send kind, the identical staging, and the order must INVERT with
  // the observed order printed — a green above that cannot go red would be
  // measuring the fixture.
  const r2 = rig({ prefix: "o13c" });
  const x2 = billAt(r2.ids, "2026-07-21T08:00:00.000Z", "2026-07-21T08:00:00.000Z");
  const y2 = billAt(r2.ids, "2026-07-21T08:30:00.000Z", "2026-07-21T08:30:00.000Z");
  await r2.store.putBill(x2, PROOF_OWNER);
  await r2.store.putBill(y2, PROOF_OWNER);
  r2.clock.advance(13 * 3_600_000);
  const gated2 = new SendGatedTransport(r2.server);
  r2.transport.inner = gated2;
  const noLock: OutboxRegistry = {
    ...r2.registry,
    bill_send: {
      ...r2.registry.bill_send,
      policy: { ...r2.registry.bill_send.policy, concurrency: "parallel_rows" },
    },
  };
  const rc = new OutboxRunner({ registry: noLock, clock: r2.clock });
  const rd = new OutboxRunner({ registry: noLock, clock: r2.clock });
  const pc = rc.runPass();
  await gated2.firstSendStarted;
  await rd.runPass(); // no lock: reaches past the claimed head and sends the younger bill
  gated2.open();
  await pc;
  const x2After = await r2.store.getBill(x2.id);
  const y2After = await r2.store.getBill(y2.id);
  console.log(
    `  control observed order: younger=${String(y2After?.doc_no)} older=${String(x2After?.doc_no)}`,
  );
  check(
    "CONTROL: with parallel_rows forced, the younger bill overtakes and takes the LOWER doc_no",
    y2After?.doc_no === "B-2569-1" && x2After?.doc_no === "B-2569-2",
    `younger=${String(y2After?.doc_no)} older=${String(x2After?.doc_no)}`,
  );
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("P1.18 stage 3 (commit 1) — the outbox mechanism, driven directly");
  console.log(`node ${process.version}; in-memory fakes, plus node:sqlite real files for O10`);

  await o1RegistryAndRecovery();
  await o2SendsSettleBeforeVoidsAreRead();
  await o3DrainAdvancesAndTerminates();
  await o4HeadBlocks();
  await o5VoidKeepsEveryDifference();
  o6ThrowLandsInOneOfTwoPlaces(rig({ prefix: "o6" }));
  await o7ScheduleStaysInsideTheHorizon();
  await o8ParkedIsNotTerminal();
  await o9PoisonSignalSurvivesBothWays();
  await o10OwedCarriesTheOwnerPredicate();
  await o11LostClaimIsNotAnOutcome();
  await o12MidPassCounts();
  await o13PassesOverlapAndOrderHolds();

  console.log("");
  console.log(failures === 0 ? "ALL OUTBOX CASES PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

/*
 * PRESET TO RED. A staged deadlock (a gate whose signal never comes) drains
 * the event loop, and node then exits 0 with the top-level await unsettled —
 * no exit line, no red, measured here under the leaked-pass-lock disproof.
 * With the code preset, a run that ends any way other than main() completing
 * exits 1, and OUTBOX_EXIT's ABSENCE is backed by a non-zero status instead
 * of contradicted by a zero.
 */
process.exitCode = 1;

main()
  .then((code) => {
    console.log(`OUTBOX_EXIT=${String(code)}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("OUTBOX PROOF CRASHED:", err);
    console.log("OUTBOX_EXIT=1");
    process.exitCode = 1;
  });
