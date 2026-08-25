/**
 * P1.8 proof: A 2xx THAT LOST ITS doc_no MUST NOT BECOME "SYNCED" — AND ONE
 * THAT KEPT IT MUST.
 *
 * Run: npm run prove:docno
 *
 * The defect this proves fixed (the architecture audit's band-A finding): a
 * 201 whose response body failed to parse yielded doc_no null, markSynced
 * wrote that null permanently, and a later void of the bill was stranded for
 * ever — listVoidsToApply requires `doc_no IS NOT NULL` — while the card
 * promised the cancellation would happen automatically. The server held the
 * bill WITH its doc_no the whole time, so the fix is to keep retrying until a
 * readable body delivers it, which the idempotency key makes safe.
 *
 * WHAT THIS DRIVES, stated plainly: the REAL HttpTransport over real fetch
 * against a real local HTTP server scripted per request, the REAL SyncEngine,
 * and the REAL SqliteLocalStore on the node driver. It does NOT drive
 * App.tsx or any screen — the wiring layer above the engine remains outside
 * every proof (the audit's standing gap) — and it does not drive the real
 * FastAPI server: the scripted stub is what lets a body arrive broken on
 * demand, which the real server cannot be asked to do.
 *
 * THE CONTROL (D4) is load-bearing: without it, a "fix" that classified every
 * 2xx as retryable would park every bill forever and this file would go green
 * exactly the same way. D4 pins the other side: a 201 with a readable body
 * still becomes synced-with-doc_no on the first attempt.
 *
 * D6 AND D7 ARE THE (b) HALF — the WRITE-layer gate, added after the handset
 * measurement of 2026-08-16 found local_bills EMPTY: a zero that proves
 * nothing, because the axis the synced-null query measures had nothing on it.
 * D6 drives the REAL SqliteLocalStore.markSynced DIRECTLY on a fresh
 * throwaway db — no engine, no transport, deliberately: (a) already guards
 * the transport, and the point of (b) is that the last writer must refuse on
 * its own even when every layer above it has been missed. It constructs the
 * axis first (a synced row WITH a doc_no), so its zeros are the strong form
 * the handset could not give. D7 drives only the proof fake (InMemoryStore)
 * and pins its mirror of the gate, so no engine proof running on the fake can
 * go green over a scenario the real store throws on.
 */
import { createServer } from "node:http";
import type { Server } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HttpTransport } from "../adapters/httpTransport.js";
import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { buildLocalBill, createLocalBill } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import { systemClock } from "../sync/systemClock.js";
import type { BillItemPayload, LocalBill } from "../sync/types.js";
import {
  InMemoryStore,
  noSellerKind,
  PROOF_OWNER,
  SeqIds,
} from "./fakes.js";
import { signInProofDevice } from "./proofDevice.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/* ------------------------------------------------------- the scripted server */

interface ScriptedResponse {
  status: number;
  body: string;
}

/**
 * Answers each request with the next scripted response, in order, and records
 * how many requests arrived. Running out of script is a proof bug and answers
 * 599 so the cell that hits it goes red rather than hanging.
 */
class ScriptedServer {
  private script: ScriptedResponse[] = [];
  private server: Server;
  requestsSeen = 0;

  private constructor(server: Server, readonly baseUrl: string) {
    this.server = server;
  }

  static async start(): Promise<ScriptedServer> {
    let s: ScriptedServer;
    const server = createServer((req, res) => {
      s.requestsSeen += 1;
      const next = s.script.shift() ?? { status: 599, body: "SCRIPT EXHAUSTED" };
      // Drain the request body so keep-alive sockets stay well-behaved.
      req.resume();
      req.on("end", () => {
        res.writeHead(next.status, { "content-type": "application/json" });
        res.end(next.body);
      });
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const addr = server.address();
    if (addr === null || typeof addr === "string") throw new Error("no port");
    s = new ScriptedServer(server, `http://127.0.0.1:${String(addr.port)}`);
    return s;
  }

  respond(...responses: ScriptedResponse[]): void {
    this.script.push(...responses);
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.server.close(() => {
        resolve();
      });
    });
  }
}

/* ----------------------------------------------------------------- fixtures */

function oneItem(ids: SeqIds): BillItemPayload {
  return {
    id: ids.newId(),
    product_id: "prod-FE",
    line_no: 1,
    gross_weight: "10.000",
    tare_weight: "0.000",
    net_weight: "10.000",
    unit_price: "15.00",
    list_price: "15.00",
  };
}

function newBill(ids: SeqIds): LocalBill {
  return buildLocalBill(
    { clock: systemClock, ids },
    {
      seller_id: "sell-001",
      vehicle_no: "70-1234",
      items: [oneItem(ids)],
      total_amount: "150.00",
      master_as_of: null,
    },
  );
}

const GARBAGE_BODIES: readonly (readonly [string, ScriptedResponse])[] = [
  ["unparseable JSON", { status: 201, body: "not-json{{{" }],
  ["unparseable JSON on the duplicate status", { status: 200, body: "garbage" }],
  ["parseable body with no doc_no field", { status: 201, body: "{}" }],
  ["parseable body with doc_no explicitly null", { status: 201, body: '{"doc_no": null}' }],
];

/* ---------------------------------------------------------------------- D1 */

async function d1TransportClassification(stub: ScriptedServer): Promise<void> {
  header("D1: the real transport classifies a doc_no-less 2xx as RETRYABLE, reachable");

  const ids = new SeqIds("d1");
  const transport = new HttpTransport({
    baseUrl: stub.baseUrl,
    getToken: () => Promise.resolve("proof-token"),
  });

  for (const [label, scripted] of GARBAGE_BODIES) {
    stub.respond(scripted);
    const outcome = await transport.sendBill(newBill(ids));
    const reason = outcome.kind === "unavailable" ? outcome.reason : "";
    console.log(`  ${String(scripted.status)} + ${label}\n    -> ${outcome.kind}${reason ? `: ${reason}` : ""}`);
    check(
      `${label}: retryable, never a success`,
      outcome.kind === "unavailable",
      `kind=${outcome.kind}`,
    );
    check(
      `${label}: the server ANSWERED, so reachable stays true (poison, not offline)`,
      outcome.kind === "unavailable" && outcome.reachable === true,
    );
  }
}

/* ------------------------------------------------------------------- D2-D5 */

async function d2ToD5EngineAndStore(stub: ScriptedServer): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "prove-docno-"));
  const driver = NodeSqliteDriver.open(join(dir, "recycle.db"));
  try {
    const store = await SqliteLocalStore.open(driver);
    await signInProofDevice(driver);
    const ids = new SeqIds("d2");
    const transport = new HttpTransport({
      baseUrl: stub.baseUrl,
      getToken: () => Promise.resolve("proof-token"),
    });
    // backoffBaseMs 1: the awaits between passes outlast the first backoff, so
    // the second pass is due without faking a clock.
    const engine = new SyncEngine({ ...noSellerKind(),
      store,
      transport,
      clock: systemClock,
      backoffBaseMs: 1,
      backoffMaxMs: 5,
    });

    header("D2: a 201 with a broken body leaves the bill PENDING — the permanent null is unwritable");
    const bill = await createLocalBill(
      { clock: systemClock, ids, store },
      {
        seller_id: "sell-001",
        vehicle_no: "70-1234",
        items: [oneItem(ids)],
        total_amount: "150.00",
        master_as_of: null,
      },
      PROOF_OWNER,
    );
    stub.respond({ status: 201, body: "not-json{{{" });
    const run1 = await engine.runOnce();
    const after1 = await store.getBill(bill.id);
    console.log(
      `  pass 1: attempted=${String(run1.attempted)} retryable=${String(run1.retryable)}` +
        ` synced=${String(run1.synced)}; bill state=${String(after1?.sync_state)}` +
        ` doc_no=${String(after1?.doc_no)}`,
    );
    check("the send was attempted and bounced", run1.attempted === 1 && run1.retryable === 1);
    check(
      "the bill is NOT synced — the write the audit called permanent never happens",
      after1?.sync_state === "pending",
      `state=${String(after1?.sync_state)}`,
    );
    check("no doc_no was invented", after1?.doc_no === null);
    check(
      "the poison clock started: a reachable server kept answering unusably",
      after1?.first_server_error_at !== null && after1?.server_error_attempts === 1,
    );

    header("D3: the idempotent replay delivers the doc_no — recovery rides the ordinary queue");
    stub.respond({ status: 200, body: '{"doc_no": "B-2569-77"}' });
    const run2 = await engine.runOnce();
    const after2 = await store.getBill(bill.id);
    console.log(
      `  pass 2: synced=${String(run2.synced)}; bill state=${String(after2?.sync_state)}` +
        ` doc_no=${String(after2?.doc_no)}`,
    );
    check("the second pass synced it", run2.synced === 1);
    check(
      "the bill now carries the server's doc_no",
      after2?.sync_state === "synced" && after2?.doc_no === "B-2569-77",
      `state=${String(after2?.sync_state)} doc_no=${String(after2?.doc_no)}`,
    );
    check(
      "and the poison counters were cleared by the success",
      after2?.server_error_attempts === 0 && after2?.first_server_error_at === null,
    );

    header("D4: THE CONTROL — a 201 with a readable body still syncs first time");
    const control = await createLocalBill(
      { clock: systemClock, ids, store },
      {
        seller_id: "sell-001",
        vehicle_no: "70-1234",
        items: [oneItem(ids)],
        total_amount: "150.00",
        master_as_of: null,
      },
      PROOF_OWNER,
    );
    stub.respond({ status: 201, body: '{"doc_no": "B-2569-78"}' });
    const run3 = await engine.runOnce();
    const after3 = await store.getBill(control.id);
    console.log(
      `  control: synced=${String(run3.synced)} retryable=${String(run3.retryable)};` +
        ` state=${String(after3?.sync_state)} doc_no=${String(after3?.doc_no)}`,
    );
    check(
      "one attempt, synced, doc_no present — the fix did not make everything retryable",
      run3.synced === 1 &&
        run3.retryable === 0 &&
        after3?.sync_state === "synced" &&
        after3?.doc_no === "B-2569-78",
      `state=${String(after3?.sync_state)} doc_no=${String(after3?.doc_no)}`,
    );

    header("D5: the consequence the finding was about — a void of the recovered bill is OWED work");
    const took = await store.requestVoid(bill.id, "ทดสอบยกเลิก", systemClock.now());
    const owed = await store.listVoidsToApply(10);
    console.log(
      `  requestVoid=${String(took)}; listVoidsToApply -> [${owed.map((b) => String(b.doc_no)).join(", ")}]`,
    );
    check("the void request took", took);
    check(
      "listVoidsToApply selects the bill — the stranding this proof exists for is gone",
      owed.some((b) => b.id === bill.id),
      `selected=${String(owed.length)}`,
    );
  } finally {
    await driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------- D6-D7 */

interface IdRow {
  id: string;
}

/** The literal query the 2026-08-16 handset measurement ran — the axis (b) protects. */
function syncedNull(driver: NodeSqliteDriver): Promise<IdRow[]> {
  return driver.all<IdRow>(
    "SELECT id FROM local_bills WHERE sync_state = 'synced' AND doc_no IS NULL",
  );
}

async function syncedTotal(driver: NodeSqliteDriver): Promise<number> {
  const rows = await driver.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM local_bills WHERE sync_state = 'synced'",
  );
  return rows[0]?.n ?? -1;
}

function billInput(ids: SeqIds): Parameters<typeof createLocalBill>[1] {
  return {
    seller_id: "sell-001",
    vehicle_no: "70-1234",
    items: [oneItem(ids)],
    total_amount: "150.00",
    master_as_of: null,
  };
}

async function d6StoreGate(): Promise<void> {
  header("D6: the WRITE layer itself — markSynced, the only writer of 'synced', refuses the null");

  const dir = mkdtempSync(join(tmpdir(), "prove-docno-gate-"));
  const driver = NodeSqliteDriver.open(join(dir, "recycle.db"));
  try {
    const store = await SqliteLocalStore.open(driver);
    await signInProofDevice(driver);
    const ids = new SeqIds("d6");

    // THE AXIS IS CONSTRUCTED BEFORE IT IS MEASURED. The 2026-08-16 handset
    // SELECT returned zero over an EMPTY table — a zero indistinguishable
    // from the query finding nothing at all. So: first a synced row WITH a
    // doc_no, and every zero below is asserted beside the count proving the
    // axis had something on it.
    const good = await createLocalBill({ clock: systemClock, ids, store }, billInput(ids), PROOF_OWNER);
    await store.markSynced(good.id, "B-2569-90", 1, systemClock.now());
    const g = await store.getBill(good.id);
    check(
      "CONTROL, same run, before the refusal: a normal doc_no still writes synced",
      g?.sync_state === "synced" && g?.doc_no === "B-2569-90",
      `state=${String(g?.sync_state)} doc_no=${String(g?.doc_no)}`,
    );
    check(
      "the axis is populated: 1 synced row, 0 of them null",
      (await syncedTotal(driver)) === 1 && (await syncedNull(driver)).length === 0,
    );

    const victim = await createLocalBill({ clock: systemClock, ids, store }, billInput(ids), PROOF_OWNER);
    let refusal: string | null = null;
    try {
      await store.markSynced(victim.id, null, 1, systemClock.now());
    } catch (err) {
      refusal = err instanceof Error ? err.message : String(err);
    }
    console.log(
      `  markSynced(null) -> ${refusal === null ? "ACCEPTED (the gate is gone)" : `THREW: ${refusal}`}`,
    );
    check("markSynced(null) throws — the write is refused, not performed", refusal !== null);

    const v = await store.getBill(victim.id);
    check(
      "the refused row is untouched: pending, doc_no null, never synced",
      v?.sync_state === "pending" && v?.doc_no === null && v?.synced_at === null,
      `state=${String(v?.sync_state)} doc_no=${String(v?.doc_no)} synced_at=${String(v?.synced_at)}`,
    );
    check(
      "the handset query still finds nothing — measured on an axis that HAS a row",
      (await syncedNull(driver)).length === 0 && (await syncedTotal(driver)) === 1,
    );

    // The refusal is about the VALUE, not the row: the same bill syncs the
    // moment a readable doc_no arrives — which is exactly what the idempotent
    // replay delivers on the next pass.
    await store.markSynced(victim.id, "B-2569-91", 2, systemClock.now());
    const v2 = await store.getBill(victim.id);
    check(
      "the same refused row syncs with a real doc_no — the gate rejects values, not bills",
      v2?.sync_state === "synced" && v2?.doc_no === "B-2569-91",
      `state=${String(v2?.sync_state)} doc_no=${String(v2?.doc_no)}`,
    );
    check(
      "final state of the axis: 2 synced rows, none null",
      (await syncedTotal(driver)) === 2 && (await syncedNull(driver)).length === 0,
    );
  } finally {
    await driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function d7FakeMirror(): Promise<void> {
  header("D7: the proof fake's mirror — InMemoryStore refuses the identical write");

  const ids = new SeqIds("d7");
  const fake = new InMemoryStore();
  const bill = newBill(ids);
  await fake.putBill(bill, PROOF_OWNER);

  let refused = false;
  try {
    await fake.markSynced(bill.id, null, 1, systemClock.now());
  } catch {
    refused = true;
  }
  check(
    "InMemoryStore.markSynced(null) rejects — no engine proof can certify what the device refuses",
    refused,
  );
  const row = await fake.getBill(bill.id);
  check(
    "the fake's row is untouched too",
    row?.sync_state === "pending" && row?.doc_no === null,
  );
  await fake.markSynced(bill.id, "B-2569-92", 1, systemClock.now());
  const after = await fake.getBill(bill.id);
  check(
    "and a real doc_no still writes synced",
    after?.sync_state === "synced" && after?.doc_no === "B-2569-92",
  );
}

/* -------------------------------------------------------------------- main */

async function main(): Promise<number> {
  console.log("P1.8 — a 2xx that lost its doc_no is a retry, and one that kept it is a sync");
  console.log(`node ${process.version}`);

  const stub = await ScriptedServer.start();
  console.log(`scripted server: ${stub.baseUrl}`);
  try {
    await d1TransportClassification(stub);
    await d2ToD5EngineAndStore(stub);
  } finally {
    await stub.close();
  }
  console.log(`\nrequests answered by the script: ${String(stub.requestsSeen)}`);

  // The (b) half needs no scripted server: D6 is the store alone on its own
  // throwaway db, D7 is the fake alone in memory.
  await d6StoreGate();
  await d7FakeMirror();

  console.log("");
  console.log(failures === 0 ? "ALL DOC-NO CASES PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

const code = await main();
console.log(`DOCNO_EXIT=${String(code)}`);
process.exitCode = code;
