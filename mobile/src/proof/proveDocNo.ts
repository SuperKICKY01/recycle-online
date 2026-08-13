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
import { PROOF_OWNER, SeqIds } from "./fakes.js";
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
    const engine = new SyncEngine({
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

  console.log("");
  console.log(failures === 0 ? "ALL DOC-NO CASES PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

const code = await main();
console.log(`DOCNO_EXIT=${String(code)}`);
process.exitCode = code;
