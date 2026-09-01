/**
 * THE CLIENT HALF OF THE API VERSION CONTRACT, proven headless.
 *
 * The server half (server/scripts/prove_version_gate.py) proves the 426. This
 * proves what the CLIENT does with it, end to end and in ONE run — which is the
 * seam two-green-proofs-do-not-cover-the-seam is about: a 426, a 401 and an
 * outage must render THREE different screens, or the operator cannot tell
 * "update the app" from "sign in again" from "wait for signal".
 *
 * Five things, adversarially:
 *   A. THE HEADER IS ON EVERY REQUEST. The real HttpTransport, wired exactly as
 *      App wires it (withClientVersion around the fetch), stamps x-client-api-
 *      version on both the send and the void — and a control without the wrapper
 *      does NOT, so the assertion can fire.
 *   B. A 426 IS `client_outdated`, and a 401 is still `session_expired` — the
 *      transport seam.
 *   C. THE ENGINE. A 426 halts the kind, leaves the bill pending and untouched,
 *      starts no poison clock, sets `clientOutdated` and NOT `sessionExpired`
 *      (the 401 is the presence sibling), and reaches no server. On both stores,
 *      because markClientOutdated is a store transition.
 *   D. THE OWNER'S CELL. A bill queued BEFORE the 426 is still present and
 *      SENDABLE after the client is updated: a fresh engine (a new process, the
 *      updated build) against the SAME store drains it. The screen's promise —
 *      "the bills are safe" — proven, not asserted.
 *   E. THE SCREEN. `appOutdated` renders the calm update state, does NOT read as
 *      an error, carries no button and no store link, OUTRANKS the session, and
 *      differs from the 401 and offline strips (the seam).
 *
 * Run: npm run prove:version
 */
import { SyncEngine } from "../sync/engine.js";
import { createLocalBill } from "../sync/createBill.js";
import { HttpTransport } from "../adapters/httpTransport.js";
import { statusNotice } from "../sync/statusNotice.js";
import type { StatusInput } from "../sync/statusNotice.js";
import { NOTHING_OWED } from "../sync/outbox.js";
import { CLIENT_API_VERSION, CLIENT_API_VERSION_HEADER, withClientVersion } from "../net/clientVersion.js";
import type { BillItemPayload, LocalBill, SendOutcome, Transport, VoidOutcome } from "../sync/types.js";
import {
  ExpiredSessionTransport,
  FakeClock,
  FakeServer,
  noSellerKind,
  OnlineTransport,
  PROOF_OWNER,
  SeqIds,
} from "./fakes.js";
import type { StoreHarness, StoreSession } from "./harness.js";
import { memoryHarness, sqliteHarness } from "./harness.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/* ---------------------------------------------------------------- fakes -- */

/** A server that answers 426 to everything: this build is too old. */
class ClientOutdatedTransport implements Transport {
  readonly attemptedIds: string[] = [];
  sendBill(bill: LocalBill): Promise<SendOutcome> {
    this.attemptedIds.push(bill.id);
    return Promise.resolve({ kind: "client_outdated", reason: "HTTP 426: client too old" });
  }
  voidBill(): Promise<VoidOutcome> {
    return Promise.resolve({ kind: "client_outdated", reason: "HTTP 426: client too old" });
  }
}

interface Recorded {
  url: string;
  headers: Record<string, string>;
}

/** A fetch that records what it was handed and answers a fixed status/body. */
function recordingFetch(into: Recorded[], status: number, body: unknown): typeof globalThis.fetch {
  return (input, init) => {
    into.push({
      url: String(input),
      headers: { ...((init?.headers as Record<string, string> | undefined) ?? {}) },
    });
    const res = {
      status,
      ok: status >= 200 && status < 300,
      json: () => Promise.resolve(body),
    } as unknown as Response;
    return Promise.resolve(res);
  };
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

const openSessions: StoreSession[] = [];
async function disposeAll(): Promise<void> {
  for (const s of openSessions.splice(0).reverse()) await s.dispose();
}

interface Rig {
  clock: FakeClock;
  session: StoreSession;
  server: FakeServer;
  billIds: SeqIds;
  itemIds: SeqIds;
}

async function rig(harness: StoreHarness, prefix: string): Promise<Rig> {
  const session = await harness.open(prefix);
  openSessions.push(session);
  return {
    clock: new FakeClock(),
    session,
    server: new FakeServer(),
    billIds: new SeqIds(prefix),
    itemIds: new SeqIds(`${prefix}-item`),
  };
}

async function makeBill(r: Rig): Promise<LocalBill> {
  return createLocalBill(
    { store: r.session.store, clock: r.clock, ids: r.billIds },
    {
      seller: { kind: "server", seller_id: "sell-aaaa-0001" },
      vehicle_no: "1กก-1234",
      items: items(r.itemIds),
      total_amount: null,
      master_as_of: null,
    },
    PROOF_OWNER,
  );
}

/* --------------------------------------------------------- A. the header -- */

async function caseHeader(): Promise<void> {
  header("A: the version header is on every request the transport makes");
  const bill = {
    id: "bill-1",
    payload: { id: "bill-1" },
  } as unknown as LocalBill;

  const sent: Recorded[] = [];
  const wired = new HttpTransport({
    baseUrl: "http://x",
    getToken: () => Promise.resolve("tok"),
    // EXACTLY App's wiring: the version wrapper around the fetch.
    fetchImpl: withClientVersion(recordingFetch(sent, 201, { doc_no: "D-1" })),
  });
  await wired.sendBill(bill);
  await wired.voidBill(bill, "test");

  check(
    "every request carried x-client-api-version = the client's contract version",
    sent.length === 2 &&
      sent.every((r) => r.headers[CLIENT_API_VERSION_HEADER] === String(CLIENT_API_VERSION)),
    `n=${sent.length} values=${JSON.stringify(sent.map((r) => r.headers[CLIENT_API_VERSION_HEADER]))}`,
  );
  check(
    "the wrapper preserved each caller's own headers (content-type, authorization)",
    sent.every((r) => r.headers["content-type"] === "application/json" && r.headers.authorization === "Bearer tok"),
    `first=${JSON.stringify(sent[0]?.headers)}`,
  );

  // The CONTROL: without the wrapper, the header is absent — so the assertion
  // above is capable of failing (a-check-that-never-went-red).
  const bare: Recorded[] = [];
  const unwired = new HttpTransport({
    baseUrl: "http://x",
    getToken: () => Promise.resolve("tok"),
    fetchImpl: recordingFetch(bare, 201, { doc_no: "D-1" }),
  });
  await unwired.sendBill(bill);
  check(
    "control: an UNWRAPPED transport sends no version header — the check can fire",
    bare.length === 1 && bare[0]?.headers[CLIENT_API_VERSION_HEADER] === undefined,
    `header=${String(bare[0]?.headers[CLIENT_API_VERSION_HEADER])}`,
  );
}

/* --------------------------------------------- B. the transport seam ------ */

async function caseTransportSeam(): Promise<void> {
  header("B: a 426 classifies as client_outdated; a 401 is still session_expired");
  const bill = { id: "b", payload: { id: "b" } } as unknown as LocalBill;

  const on426 = new HttpTransport({
    baseUrl: "http://x",
    getToken: () => Promise.resolve("tok"),
    fetchImpl: recordingFetch([], 426, { detail: { kind: "client_outdated" } }),
  });
  const o426 = await on426.sendBill(bill);
  check("426 -> client_outdated", o426.kind === "client_outdated", `kind=${o426.kind}`);

  const on401 = new HttpTransport({
    baseUrl: "http://x",
    getToken: () => Promise.resolve("tok"),
    fetchImpl: recordingFetch([], 401, { detail: "Not authenticated" }),
  });
  const o401 = await on401.sendBill(bill);
  check(
    "401 is STILL session_expired, not client_outdated — the two are distinct",
    o401.kind === "session_expired",
    `kind=${o401.kind}`,
  );
}

/* ---------------------------------------------------- C + D. the engine --- */

async function caseEngine(harness: StoreHarness, tag: string): Promise<void> {
  header(`C: a 426 halts, leaves the bill pending, sets clientOutdated not sessionExpired (${tag})`);
  const r = await rig(harness, `ver-${tag}`);
  const bill = await makeBill(r);
  const store = r.session.store;

  const outdated = new ClientOutdatedTransport();
  const e1 = new SyncEngine({ ...noSellerKind(), store, transport: outdated, clock: r.clock, backoffBaseMs: 1000, backoffMaxMs: 5000 });
  const run1 = await e1.runOnce();
  const row1 = await store.getBill(bill.id);

  check(
    "the pass reports a BUILD problem (clientOutdated=1) and NOT a session one (sessionExpired=0)",
    run1.clientOutdated === 1 && run1.sessionExpired === 0 && run1.retryable === 0 && run1.synced === 0,
    `run=${JSON.stringify({ c: run1.clientOutdated, s: run1.sessionExpired, r: run1.retryable, y: run1.synced })}`,
  );
  check(
    "the bill is untouched and still queued — pending, no doc_no, nothing dropped",
    row1?.sync_state === "pending" && row1.doc_no === null,
    `state=${String(row1?.sync_state)} doc_no=${String(row1?.doc_no)}`,
  );
  check(
    "the POISON clocks never started — a 426 is not the server refusing this bill",
    row1?.first_server_error_at === null && row1.server_error_attempts === 0,
    `first_server_error_at=${String(row1?.first_server_error_at)} attempts=${String(row1?.server_error_attempts)}`,
  );
  check("nothing reached the server", r.server.billCount === 0);

  // NEGATIVE, with the 401 as the presence sibling: the SAME staged bill under a
  // 401 sets sessionExpired and NOT clientOutdated, so the engine really does
  // separate them rather than both counters happening to be right.
  const r2 = await rig(harness, `ver401-${tag}`);
  const bill2 = await makeBill(r2);
  const expired = new ExpiredSessionTransport(r2.server);
  const eS = new SyncEngine({ ...noSellerKind(), store: r2.session.store, transport: expired, clock: r2.clock, backoffBaseMs: 1000, backoffMaxMs: 5000 });
  const runS = await eS.runOnce();
  check(
    "presence sibling: a 401 sets sessionExpired=1 and clientOutdated=0 — the two paths are not the same",
    runS.sessionExpired === 1 && runS.clientOutdated === 0,
    `run=${JSON.stringify({ c: runS.clientOutdated, s: runS.sessionExpired })}`,
  );
  void bill2;

  header(`D: the queued bill survives the 426 and SENDS after the client is updated (${tag})`);
  // "Updated" = a NEW process: a fresh engine (fresh runner, no halt) against the
  // SAME store, speaking to a server that no longer 426s it (the new build's
  // version is now at/above the floor).
  const e2 = new SyncEngine({ ...noSellerKind(), store, transport: new OnlineTransport(r.server), clock: r.clock, backoffBaseMs: 1000, backoffMaxMs: 5000 });
  const run2 = await e2.runUntilQuiescent();
  const row2 = await store.getBill(bill.id);
  check(
    "after the update the SAME bill sends — synced, on the server, unchanged",
    run2.synced === 1 && row2?.sync_state === "synced" && r.server.distinctBillIds().has(bill.id),
    `synced=${run2.synced} state=${String(row2?.sync_state)} onServer=${r.server.billCount}`,
  );
}

/* -------------------------------------------------------- E. the screen --- */

function stripOf(over: Partial<StatusInput>): StatusInput {
  return {
    appOutdated: false,
    session: "active",
    account: "ok",
    voidsRefused: 0,
    online: true,
    pending: 1,
    parkedForAnother: 0,
    parkedUnknownOwner: 0,
    failed: 0,
    blocked: null,
    waitingOnMasterData: 0,
    masterDataCodes: [],
    owed: NOTHING_OWED,
    ...over,
  };
}

function caseScreen(): void {
  header("E: the strip renders the calm update state, outranks the session, and is its own seam");
  const outdated = statusNotice(stripOf({ appOutdated: true }));
  console.log(`  strip: ${outdated.message}`);

  check(
    "it names the update and reassures the bills are safe",
    outdated.message.includes("อัปเดต") && outdated.message.includes("ยังอยู่ครบ"),
    outdated.message,
  );
  check(
    "it does NOT read as an error: amber tone, and no error/JSON/support words",
    outdated.tone === "warn" &&
      !outdated.message.includes("ผิดพลาด") &&
      !/[{}]/.test(outdated.message) &&
      !outdated.message.includes("ฝ่ายสนับสนุน"),
    `tone=${outdated.tone}`,
  );
  check(
    "it offers no button — the update comes from outside the app and none is invented",
    outdated.action === null,
    `action=${JSON.stringify(outdated.action)}`,
  );

  // It OUTRANKS the session: a too-old build whose session ALSO expired still
  // says "update", because a 426 refuses the sign-in the session case offers.
  const bothWrong = statusNotice(stripOf({ appOutdated: true, session: "expired" }));
  check(
    "appOutdated outranks an expired session — the message is the update, not the sign-in",
    bothWrong.message === outdated.message && bothWrong.action === null,
    bothWrong.message,
  );

  // THE SEAM: 426 vs 401 vs offline must be three DIFFERENT screens.
  const expired = statusNotice(stripOf({ session: "expired", online: true }));
  const offline = statusNotice(stripOf({ online: false }));
  console.log(`  401  : ${expired.message}`);
  console.log(`  offl : ${offline.message}`);
  check(
    "the seam: the 426, 401 and offline strips are three DIFFERENT sentences",
    outdated.message !== expired.message &&
      outdated.message !== offline.message &&
      expired.message !== offline.message,
    "all three compared",
  );
  check(
    "the 401 still offers its sign-in button — the update state did not swallow it",
    expired.action?.kind === "sign_in",
    `action=${JSON.stringify(expired.action)}`,
  );
}

/* ------------------------------------------------------------------ main -- */

async function main(): Promise<number> {
  console.log(`prove:version — node ${process.version}`);
  await caseHeader();
  await caseTransportSeam();
  try {
    await caseEngine(memoryHarness, "mem");
    await caseEngine(sqliteHarness, "sqlite");
  } finally {
    await disposeAll();
  }
  caseScreen();

  console.log("");
  console.log(failures === 0 ? "ALL VERSION-CONTRACT CHECKS PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

// Preset RED: a run that dies before main()'s tally exits non-zero, never a
// default 0 (lessons/a-default-exit-code-is-a-default-verdict.md).
process.exitCode = 1;

main()
  .then((code) => {
    console.log(`PROVE_VERSION_EXIT=${code}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("PROOF CRASHED:", err);
    process.exitCode = 1;
  });
