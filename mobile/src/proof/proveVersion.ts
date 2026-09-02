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
import { attemptLogin, signInNotice } from "../session/signInIdentity.js";
import { exchangeShopCode, shopCodeNotice } from "../session/shopCode.js";
import { signOutCard, signOutCardText } from "../session/signOutNotice.js";
import { reserveStripNotice } from "../master/reserveStrip.js";
import { outdatedAfterPass } from "../sync/outdatedState.js";
import type { OwedByKind } from "../sync/outbox.js";
import type { BillItemPayload, LocalBill, SendOutcome, Transport, VoidOutcome } from "../sync/types.js";
import type { LocalSeller } from "../sync/localSeller.js";
import type { SellerCreateOutcome, SellerCreateTransport } from "../sync/sellerCreate.js";
import type { ReservationTransport, RefillOutcome } from "../sync/sellerRefill.js";
import {
  EmptySellerStore,
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

/**
 * A server that answers 426 to everything — until `lowerFloor()`, which models an
 * operator LOWERING the floor after a bad raise. After that it accepts, via the
 * FakeServer, so the recovery case can re-probe in ONE process.
 */
class ClientOutdatedTransport implements Transport {
  readonly attemptedIds: string[] = [];
  private lowered = false;
  constructor(private readonly server: FakeServer | null = null) {}
  lowerFloor(): void {
    this.lowered = true;
  }
  sendBill(bill: LocalBill): Promise<SendOutcome> {
    this.attemptedIds.push(bill.id);
    if (!this.lowered) {
      return Promise.resolve({ kind: "client_outdated", reason: "HTTP 426: client too old" });
    }
    const r = this.server!.submit(bill.payload);
    return Promise.resolve({ kind: r.kind, doc_no: r.bill.doc_no });
  }
  voidBill(): Promise<VoidOutcome> {
    return this.lowered
      ? Promise.resolve({ kind: "unavailable", reason: "not exercised after lowering" })
      : Promise.resolve({ kind: "client_outdated", reason: "HTTP 426: client too old" });
  }
}

/** A seller store holding ONE pending seller-create, recording the fail-transition. */
class OneSellerStore extends EmptySellerStore {
  readonly failedIds: string[] = [];
  constructor(private readonly seller: LocalSeller) {
    super();
  }
  override listSellersToCreate(): Promise<LocalSeller[]> {
    return Promise.resolve([this.seller]);
  }
  override countSellersOwed(): Promise<number> {
    return Promise.resolve(1);
  }
  override claimSellerCreate(): Promise<boolean> {
    return Promise.resolve(true);
  }
  // `id?` (not `id`) so it stays assignable to the base's no-arg signature under
  // noImplicitOverride; the runner calls it with the row id, which is what we record.
  override markSellerCreateAttemptFailed(id?: string): Promise<void> {
    if (id !== undefined) this.failedIds.push(id);
    return Promise.resolve();
  }
}

/** A seller transport that answers 426 to the create; the top-up throws, which
 *  refillOnce catches, so the pass's reservation top-up is a no-op. */
class ClientOutdatedSellerTransport implements SellerCreateTransport, ReservationTransport {
  createSeller(): Promise<SellerCreateOutcome> {
    return Promise.resolve({ kind: "client_outdated", reason: "HTTP 426: client too old" });
  }
  topUp(): Promise<RefillOutcome> {
    return Promise.reject(new Error("HTTP 426: client too old"));
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

  header(`C-void: a 426 on the VOID path sets clientOutdated (the bill_void arm) (${tag})`);
  // The bill is now synced; request a void and meet a 426 on the void path.
  // clientOutdated must come from the bill_VOID arm this time, and the void must
  // stay OWED (void_requested_at kept, voided_at null) so it applies after the
  // update. This is the cell finding 6 named: without it, deleting the counter
  // from the void arm leaves prove:version green.
  await store.requestVoid(bill.id, "แก้ไข", r.clock.now());
  const eV = new SyncEngine({ ...noSellerKind(), store, transport: new ClientOutdatedTransport(), clock: r.clock, backoffBaseMs: 1000, backoffMaxMs: 5000 });
  const runV = await eV.runOnce();
  const rowV = await store.getBill(bill.id);
  check(
    "a 426 on the VOID path sets clientOutdated (bill_void arm) and leaves the void OWED",
    runV.clientOutdated === 1 && rowV?.void_requested_at !== null && rowV?.voided_at === null,
    `clientOutdated=${runV.clientOutdated} requested=${String(rowV?.void_requested_at !== null)} settled=${String(rowV?.voided_at !== null)}`,
  );
}

async function caseSellerEngine(harness: StoreHarness): Promise<void> {
  header("C-seller: a 426 on the SELLER-CREATE path sets clientOutdated (the deliberate rule-break)");
  const r = await rig(harness, "ver-seller");
  const seller = {
    id: "seller-1",
    attempt_count: 0,
    next_attempt_at: new Date(0).toISOString(),
  } as unknown as LocalSeller;
  const sellerStore = new OneSellerStore(seller);
  const e = new SyncEngine({
    ...noSellerKind(),
    store: r.session.store, // no bills owed — only the seller kind fires
    transport: new OnlineTransport(r.server),
    sellerStore,
    sellerTransport: new ClientOutdatedSellerTransport(),
    clock: r.clock,
    backoffBaseMs: 1000,
    backoffMaxMs: 5000,
  });
  const run = await e.runOnce();
  check(
    "a 426 on the seller-create path sets clientOutdated (seller_create arm) and leaves the seller OWED — the device-global build fact shows even on a seller-only device",
    run.clientOutdated === 1 && sellerStore.failedIds.includes("seller-1"),
    `clientOutdated=${run.clientOutdated} failed=${JSON.stringify(sellerStore.failedIds)}`,
  );
}

/* ------------------------- F1-3: the other refusal surfaces (repair) ------ */

async function caseSurfaces(): Promise<void> {
  header("F1: login and shop-code on a 426 say UPDATE, not 'tell the shop owner'");
  const r426 = { ok: false, status: 426, json: () => Promise.resolve({}) };
  const r500 = { ok: false, status: 500, json: () => Promise.resolve({}) };

  const login = await attemptLogin(() => Promise.resolve(r426));
  const loginMsg = signInNotice(login) ?? "";
  check(
    "login: a 426 is client_outdated and its message names the UPDATE, not the shop owner",
    login.kind === "client_outdated" && loginMsg.includes("อัปเดต") && !loginMsg.includes("แจ้งเจ้าของร้าน"),
    `kind=${login.kind} msg=${loginMsg}`,
  );
  const login5 = await attemptLogin(() => Promise.resolve(r500));
  check(
    "control: a 500 is STILL server_fault ('แจ้งเจ้าของร้าน') — the 426 arm is distinct, not swallowing all",
    login5.kind === "server_fault" && (signInNotice(login5) ?? "").includes("แจ้งเจ้าของร้าน"),
    `kind=${login5.kind}`,
  );
  const shop = await exchangeShopCode(() => Promise.resolve(r426));
  const shopMsg = shopCodeNotice(shop) ?? "";
  check(
    "shop-code: a 426 is client_outdated and its message names the UPDATE, not the shop owner",
    shop.kind === "client_outdated" && shopMsg.includes("อัปเดต") && !shopMsg.includes("แจ้งเจ้าของร้าน"),
    `kind=${shop.kind} msg=${shopMsg}`,
  );

  header("F2: the sign-out sheet on a too-old build says UPDATE, not 'wait for a send'");
  const owed1: OwedByKind = { bill_send: 2, bill_void: 0, seller_create: 0 };
  const outdatedSheet = signOutCardText(
    signOutCard({ owed: owed1, failed: 0, failure: null, session: "active", appOutdated: true }),
  );
  const normalSheet = signOutCardText(
    signOutCard({ owed: owed1, failed: 0, failure: null, session: "active", appOutdated: false }),
  );
  check(
    "sign-out (appOutdated): names the UPDATE and does NOT promise a wait that cannot happen",
    outdatedSheet.includes("อัปเดต") && !outdatedSheet.includes("รอให้ส่งครบ") && !outdatedSheet.includes("เมื่อเชื่อมต่อ"),
    outdatedSheet,
  );
  check(
    "control: the SAME owed queue on a CURRENT build DOES show the wait wording — the appOutdated arm is what changes it",
    normalSheet.includes("รอให้ส่งครบ") && !normalSheet.includes("อัปเดต"),
    normalSheet,
  );

  header("F3: the reserve strip on a too-old build says UPDATE, not 'connect to refill'");
  const base = {
    spendable: 2,
    held: 8,
    target: 8,
    targetAt: "2026-09-01T00:00:00.000Z",
    now: "2026-09-01T00:01:00.000Z",
  };
  const outLines = (reserveStripNotice({ ...base, appOutdated: true })?.lines ?? []).join(" ");
  const normLines = (reserveStripNotice({ ...base, appOutdated: false })?.lines ?? []).join(" ");
  check(
    "reserve strip (appOutdated): names the UPDATE and does NOT promise 'ต่อเน็ต'",
    outLines.includes("อัปเดต") && !outLines.includes("ต่อเน็ต"),
    outLines,
  );
  check(
    "control: the SAME holding on a CURRENT build DOES promise 'ต่อเน็ต' — the appOutdated arm is what changes it",
    normLines.includes("ต่อเน็ต") && !normLines.includes("อัปเดต"),
    normLines,
  );
}

/* ------------------------- F4-5: the wedge and its clearing (repair) ------ */

async function caseRecovery(harness: StoreHarness): Promise<void> {
  header("F4-5: the flag is DERIVED per pass, and a lowered floor clears the wedge");
  const r = await rig(harness, "ver-recover");
  const bill = await makeBill(r);
  const store = r.session.store;
  const t = new ClientOutdatedTransport(r.server);
  const e = new SyncEngine({ ...noSellerKind(), store, transport: t, clock: r.clock, backoffBaseMs: 1000, backoffMaxMs: 5000 });

  const run1 = await e.runOnce();
  check(
    "a 426 pass sets the flag — outdatedAfterPass(false, run1) === true",
    run1.clientOutdated === 1 && outdatedAfterPass(false, run1) === true,
    `clientOutdated=${run1.clientOutdated}`,
  );
  // The wedge WITHOUT a retract: the kind is halted, so a plain pass observes
  // nothing and the flag is KEPT — this is exactly why App must re-probe.
  const runHalted = await e.runOnce();
  check(
    "while halted a pass observes nothing and the flag is KEPT (not cleared) — the wedge a retract must break",
    runHalted.clientOutdated === 0 && runHalted.synced === 0 && outdatedAfterPass(true, runHalted) === true,
    `run=${JSON.stringify({ c: runHalted.clientOutdated, y: runHalted.synced })}`,
  );

  // THE OPERATOR LOWERS THE FLOOR (a bad raise, rolled back). App's re-probe
  // retracts the halt; the next pass DRAINS and outdatedAfterPass CLEARS.
  t.lowerFloor();
  e.retractOutdatedHalt();
  const run2 = await e.runOnce();
  const row2 = await store.getBill(bill.id);
  check(
    "after the floor is lowered the re-probe DRAINS and clears the flag — outdatedAfterPass(true, run2) === false",
    run2.synced === 1 && outdatedAfterPass(true, run2) === false && row2?.sync_state === "synced",
    `synced=${run2.synced} state=${String(row2?.sync_state)}`,
  );
  check(
    "the queued bill survived the wedge and its rollback — same bill, now on the server",
    r.server.distinctBillIds().has(bill.id),
    `onServer=${r.server.billCount}`,
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
    await caseSellerEngine(memoryHarness);
    await caseRecovery(memoryHarness);
  } finally {
    await disposeAll();
  }
  await caseSurfaces();
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
