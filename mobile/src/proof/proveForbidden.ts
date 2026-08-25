/**
 * Phase 2c-9 proof: A 403 IS ABOUT WHAT THE CALLER MAY DO.
 *
 * Run: npm run prove:forbidden        (requires the API to be running)
 *      npm run prove:forbidden -- --offline    (skips F6; exits 2, never 0)
 *
 * WHAT THIS IS FOR. Since the role gate landed, POST /bills/{id}/void is
 * admin-only and POST /bills is not. A STAFF phone therefore works all day and is
 * refused the moment someone taps ยกเลิกบิล — and until this phase the transport
 * mapped that 403 into `unavailable, reachable: true`, the catch-all for "the
 * server answered but unusably". Two different failures came out of that, one per
 * path, and F5 reproduces both rather than describing them:
 *
 *   VOID  the void stayed in listVoidsToApply, which has no backoff column and no
 *         time gate, so the device re-POSTed it on EVERY pass — every four
 *         seconds, forever — while the card promised "จะดำเนินการให้อัตโนมัติ"
 *         about a reversal that was never going to happen, and showed ยกเลิกแล้ว
 *         with the total struck through for a bill the server still held live.
 *   SEND  `reachable: true` ran first_server_error_at and server_error_attempts to
 *         POISON_ALARM_ATTEMPTS, so the strip escalated to the red
 *         "ติดต่อฝ่ายสนับสนุน" alarm over a permission no support desk can grant.
 *
 * F6 IS THE ONE THAT MATTERS MOST and it is why this proof needs a server: every
 * case above runs against a fake that returns what we BELIEVE the server sends.
 * F6 logs in as the real seeded staff user, calls the real HttpTransport against
 * the real API, and reads the real 403 — including the `code` the wording is
 * derived from. Without it this file proves the client agrees with itself.
 *
 * ON THE OUTPUT. Mostly Thai. Mojibake in the console is the console — this box
 * is codepage 874, see lessons/console-is-not-the-observation.md. Every assertion
 * compares JavaScript strings.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HttpTransport } from "../adapters/httpTransport.js";
import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { readTokenRole } from "../session/deviceRole.js";
import { createLocalBill } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import { billNotice, canRequestVoid, voidProgressLine } from "../sync/parkedReason.js";
import { POISON_ALARM_ATTEMPTS, assessQueue } from "../sync/queueHealth.js";
import { NOTHING_OWED } from "../sync/outbox.js";
import { statusNotice } from "../sync/statusNotice.js";
import type { StatusInput } from "../sync/statusNotice.js";
import type { LocalBill, LocalStore } from "../sync/types.js";
import { isVoidRefused, isVoided } from "../sync/types.js";
import {
  FakeClock,
  FakeServer,
  ForbiddenTransport,
  LegacyForbiddenTransport,
  noSellerKind,
  OnlineTransport,
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

/**
 * Fragments built for a bug report, never for a person with wet hands and a
 * queue. Same list as proveNotice, plus the two the 403 body carries: a leaked
 * `actual_role` or `required_role` would be this phase's own version of the 424
 * JSON that shipped in 2c-6.
 */
const DIAGNOSTICS: readonly string[] = [
  "HTTP",
  "403",
  '{"',
  "kind",
  "forbidden",
  "admin_required",
  "required_role",
  "actual_role",
  "network",
  "null",
  "undefined",
];

const leaks = (text: string): string[] => DIAGNOSTICS.filter((d) => text.includes(d));

/** Anything that claims the system will do it by itself. */
const PROMISES: readonly string[] = [
  "จะส่งให้เอง",
  "ส่งเองอัตโนมัติ",
  "อัตโนมัติ",
  "เมื่อเน็ตกลับมา",
  "เมื่อเชื่อมต่อได้",
];

const promises = (text: string): string[] => PROMISES.filter((p) => text.includes(p));

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

function tempDir(name: string): string {
  return mkdtempSync(join(tmpdir(), `recycle-2c9-${name}-`));
}

async function makeBill(
  store: LocalStore,
  clock: FakeClock,
  ids: SeqIds,
): Promise<LocalBill> {
  return createLocalBill(
    { store, clock, ids },
    {
      seller_id: "sell-1",
      vehicle_no: null,
      items: [{ ...ITEM, id: ids.newId() }],
      total_amount: "150.05",
      master_as_of: null,
    },
    PROOF_OWNER,
  );
}

/** The strip inputs App derives, so the assertions run on what the yard sees. */
function strip(over: Partial<StatusInput>): string {
  return statusNotice({
    session: "active",
    account: "ok",
    voidsRefused: 0,
    online: true,
    pending: 0,
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
    ...over,
  }).message;
}

/* ------------------------------------------------------------------ F1 ---- */

/**
 * The path a real yard takes: a synced bill, a staff phone, ยกเลิกบิล.
 *
 * Run over MANY passes on purpose. One pass would prove nothing about retrying —
 * the whole defect was that the void came back every four seconds forever, so the
 * measurement has to be "how many times did the server hear about it".
 */
async function f1VoidRefused(): Promise<void> {
  header("F1: a staff phone voids a bill — refused once, and never asked again");

  const dir = tempDir("void");
  const driver = NodeSqliteDriver.open(join(dir, "f1.db"));
  const store = await SqliteLocalStore.open(driver);
  await signInProofDevice(driver);
  const clock = new FakeClock();
  const server = new FakeServer();

  // The bill itself goes through: staff may create bills. This is what makes the
  // refusal specific rather than "the phone cannot talk to the server".
  const transport = new ForbiddenTransport(server, { sends: false, voids: true });
  const engine = new SyncEngine({ ...noSellerKind(), store, transport, clock, backoffBaseMs: 1000 });

  const bill = await makeBill(store, clock, new SeqIds("f1"));
  await engine.runUntilQuiescent();
  const synced = await store.getBill(bill.id);
  console.log(`  bill synced as ${String(synced?.doc_no)} (staff may create bills)`);
  check(
    "the bill reached the server under the SAME token that will be refused the void",
    synced?.sync_state === "synced" && synced.doc_no !== null && server.billCount === 1,
    `state=${String(synced?.sync_state)} doc_no=${String(synced?.doc_no)}`,
  );

  await store.requestVoid(bill.id, "ชั่งผิด", clock.now());
  const run = await engine.runOnce();
  const after = await store.getBill(bill.id);

  console.log(
    `  runOnce -> voidsForbidden=${String(run.voidsForbidden)}` +
      ` voidsRetryable=${String(run.voidsRetryable)} voidsRejected=${String(run.voidsRejected)}`,
  );
  console.log(
    `  row: void_requested_at=${after?.void_requested_at === null ? "null" : "set"}` +
      ` void_refused_at=${after?.void_refused_at === null ? "null" : "set"}` +
      ` code=${String(after?.void_refused_code)} voided_at=${String(after?.voided_at)}`,
  );

  check(
    "the pass reports a FORBIDDEN void — not retryable, not rejected",
    run.voidsForbidden === 1 && run.voidsRetryable === 0 && run.voidsRejected === 0,
    `run=${JSON.stringify({ f: run.voidsForbidden, r: run.voidsRetryable, x: run.voidsRejected })}`,
  );
  check(
    "the server's code is on the row, for the wording to be derived from",
    after?.void_refused_code === "admin_required",
    `code=${String(after?.void_refused_code)}`,
  );

  /* ---- NEVER RETRIES. The measurement, not the intention. ---- */
  const callsAfterFirst = transport.voidCalls;
  for (let i = 0; i < 25; i += 1) {
    clock.advance(60_000);
    await engine.runOnce();
  }
  console.log(
    `  after 25 further passes over 25 minutes: voidCalls=${String(transport.voidCalls)}`,
  );
  check(
    "the void is asked EXACTLY ONCE, ever — 25 more passes add nothing",
    transport.voidCalls === 1 && callsAfterFirst === 1,
    `voidCalls=${String(transport.voidCalls)} (the old mapping asked once per pass, forever)`,
  );
  check(
    "and it has left the owed queue, which is what makes that structural",
    (await store.listVoidsToApply(10)).length === 0,
  );

  /* ---- THE POISON MACHINERY IS UNTOUCHED. ---- */
  const health = assessQueue(await store.pendingQueueSnapshot(), clock.now());
  const row = await store.getBill(bill.id);
  console.log(
    `  poison: first_server_error_at=${String(row?.first_server_error_at)}` +
      ` server_error_attempts=${String(row?.server_error_attempts)}` +
      ` alarm=${String(health.alarm)}`,
  );
  check(
    "the poison counter stays 0 and no alarm is raised",
    row?.server_error_attempts === 0 &&
      row.first_server_error_at === null &&
      health.alarm === false &&
      health.blockerId === null,
    `attempts=${String(row?.server_error_attempts)} alarm=${String(health.alarm)}`,
  );
  check(
    "the strip does not send anyone to support",
    !strip({ voidsRefused: 1 }).includes("ฝ่ายสนับสนุน"),
    strip({ voidsRefused: 1 }),
  );

  /* ---- THE BILL IS UNTOUCHED. ---- */
  const onServer = server.findById(bill.id);
  check(
    "the bill is still on the server, ACTIVE — the money fact the operator must not be lied to about",
    onServer !== undefined && onServer.voided_at === null,
    `voided_at=${String(onServer?.voided_at)}`,
  );
  check(
    "locally it is still synced, with its doc_no, its payload and its money intact",
    row?.sync_state === "synced" &&
      row.doc_no === synced?.doc_no &&
      row.payload.items[0]?.gross_weight === "10.005" &&
      row.payload.total_amount === "150.05",
    `state=${String(row?.sync_state)} doc_no=${String(row?.doc_no)}`,
  );
  check(
    "the owner's request and their exact words survived the refusal",
    row !== null && isVoided(row) && row.void_reason === "ชั่งผิด",
    `reason=${String(row?.void_reason)}`,
  );
  check(
    "and the row says the reversal did NOT happen",
    row !== null && isVoidRefused(row) && row.voided_at === null,
  );

  /* ---- WHAT THE OPERATOR READS. Both regions of the card, together. ---- */
  if (row !== null) {
    const notice = billNotice(row, "active", "ok");
    const voidLine = voidProgressLine(row) ?? "";
    const whole = `${voidLine} | ${notice.badge ?? ""} ${notice.lines.join(" ")}`;
    console.log(`  card tone: ${notice.tone}`);
    console.log(`  void line: ${voidLine}`);
    console.log(`  badge    : ${String(notice.badge)}`);
    for (const l of notice.lines) console.log(`    ${l}`);
    console.log(`  strip    : ${strip({ voidsRefused: 1 })}`);

    check("the card reads as a permission refusal, not an error", notice.tone === "forbidden");
    check(
      "NO region of the card promises the cancel will happen",
      promises(whole).length === 0,
      `promised: ${promises(whole).join(", ")}`,
    );
    check(
      "it says plainly that the system did not cancel it",
      voidLine.includes("ไม่ได้ยกเลิก") && whole.includes("ยังอยู่ในระบบ"),
      voidLine,
    );
    check(
      "it names the shop owner, and not the office or support",
      whole.includes("เจ้าของร้าน") &&
        !whole.includes("สำนักงาน") &&
        !whole.includes("ฝ่ายสนับสนุน"),
      whole,
    );
    check(
      "it never invites a sign-in — the same account would come back with the same role",
      !whole.includes("เข้าสู่ระบบ") && !strip({ voidsRefused: 1 }).includes("เข้าสู่ระบบ"),
    );
    check("nothing on the card is a diagnostic", leaks(whole).length === 0, leaks(whole).join(", "));
    check(
      "the badge is non-null, so the card cannot fall back to ยกเลิกแล้ว",
      (notice.badge ?? "").length > 0,
      `badge=${String(notice.badge)} — the view ranks notice.badge above the void badge`,
    );
    check(
      "the diagnostic IS still on the row for a bug report",
      (row.void_last_error ?? "").includes("403"),
      "keeping it is deliberate; rendering it is the bug",
    );
  }

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ F2 ---- */

/** The retraction: a sign-in is the one event that can change who is asking. */
async function f2SignInRetracts(): Promise<void> {
  header("F2: an admin signs in on the same phone — the SAME void applies, untouched");

  const dir = tempDir("signin");
  const driver = NodeSqliteDriver.open(join(dir, "f2.db"));
  const store = await SqliteLocalStore.open(driver);
  await signInProofDevice(driver);
  const clock = new FakeClock();
  const server = new FakeServer();
  const transport = new ForbiddenTransport(server, { sends: false, voids: true });
  const engine = new SyncEngine({ ...noSellerKind(), store, transport, clock, backoffBaseMs: 1000 });

  const bill = await makeBill(store, clock, new SeqIds("f2"));
  await engine.runUntilQuiescent();
  await store.requestVoid(bill.id, "ลูกค้าเปลี่ยนใจ", clock.now());
  await engine.runOnce();
  const refused = await store.getBill(bill.id);
  check("precondition: the void was refused", refused?.void_refused_at !== null);

  // The owner fixes the role; someone signs in again.
  transport.grantAdmin();
  const freed = await engine.resumeAfterSignIn();
  const owed = await store.listVoidsToApply(10);
  console.log(`  after sign-in: freed=${String(freed)} owed voids=${String(owed.length)}`);
  check(
    "the refusal is retracted and the void is owed again",
    freed >= 1 && owed.length === 1,
    `freed=${String(freed)}`,
  );

  const run = await engine.runUntilQuiescent();
  const final = await store.getBill(bill.id);
  const onServer = server.findById(bill.id);
  console.log(
    `  -> voidsApplied=${String(run.voidsApplied)} serverVoided=${String(onServer?.voided_at)}`,
  );
  check(
    "the void applies, with the reason the owner typed the first time",
    run.voidsApplied === 1 &&
      onServer?.voided_at !== null &&
      onServer?.void_reason === "ลูกค้าเปลี่ยนใจ",
    `reason=${String(onServer?.void_reason)}`,
  );
  check(
    "and the row is settled with no refusal left describing a state it has left",
    final?.voided_at !== null &&
      final?.void_refused_at === null &&
      final?.void_refused_code === null &&
      final?.void_last_error === null,
  );
  check("still exactly one bill, never duplicated", server.billCount === 1);
  check(
    "the card reads as an ordinary completed void again",
    final !== null && voidProgressLine(final) === "แจ้งระบบแล้ว",
    String(final === null ? "" : voidProgressLine(final)),
  );

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ F3 ---- */

/**
 * The SEND path. Unreachable on today's server (POST /bills is open to staff),
 * proven anyway: the transport maps 403 on both endpoints, and leaving one of
 * them on the old classification is how the 2c-7 amendment says this family of
 * defect keeps coming back.
 */
async function f3SendRefused(): Promise<void> {
  header("F3: an account that may not SUBMIT — one attempt, no poison, no alarm");

  const dir = tempDir("send");
  const driver = NodeSqliteDriver.open(join(dir, "f3.db"));
  const store = await SqliteLocalStore.open(driver);
  await signInProofDevice(driver);
  const clock = new FakeClock();
  const server = new FakeServer();
  const transport = new ForbiddenTransport(server, { sends: true, voids: true });
  const engine = new SyncEngine({ ...noSellerKind(),
    store, transport, clock, backoffBaseMs: 1000, backoffMaxMs: 30_000, batchLimit: 50,
  });

  const ids = new SeqIds("f3");
  const bills: LocalBill[] = [];
  for (let i = 0; i < 3; i += 1) {
    bills.push(await makeBill(store, clock, ids));
    clock.advance(60_000); // weighed a minute apart, so order is unambiguous
  }

  const first = await engine.runOnce();
  console.log(`  first pass -> forbidden=${String(first.forbidden)} attempted=${String(first.attempted)}`);
  check("the pass reports a forbidden SEND", first.forbidden === 1);

  // Past both alarm triggers' worth of passes, so neither can be said to have
  // simply not been reached yet.
  const passes = POISON_ALARM_ATTEMPTS + 5;
  for (let i = 0; i < passes; i += 1) {
    clock.advance(30_000);
    await engine.runOnce();
  }
  const snap = await store.pendingQueueSnapshot();
  const health = assessQueue(snap, clock.now());
  console.log(
    `  after ${String(passes)} further passes: sendCalls=${String(transport.sendCalls)}` +
      ` head.attempts=${String(snap.head?.attempts)}` +
      ` serverErrorAttempts=${String(snap.head?.server_error_attempts)}` +
      ` alarm=${String(health.alarm)}`,
  );

  check(
    "the server was asked EXACTLY ONCE — the engine stops sending while the refusal stands",
    transport.sendCalls === 1,
    `sendCalls=${String(transport.sendCalls)}`,
  );
  check(
    "the poison counter is 0 and the clock never started",
    snap.head?.server_error_attempts === 0 && snap.head.first_server_error_at === null,
    `attempts=${String(snap.head?.server_error_attempts)}`,
  );
  check(
    "no poison, no red alarm, no blocker",
    health.poisoned === false && health.alarm === false && health.blockerId === null,
  );
  check(
    "all three bills are still queued in weighing order, nothing failed, nothing dropped",
    snap.pendingCount === 3 && (await store.listByState("failed")).length === 0,
    `pending=${String(snap.pendingCount)}`,
  );
  check("and nothing reached the server", server.billCount === 0);

  const head = await store.getBill(bills[0]!.id);
  const notice = head === null ? null : billNotice(head, "active", "submit_refused");
  const text = notice === null ? "" : `${notice.badge ?? ""} ${notice.lines.join(" ")}`;
  const stripMsg = strip({ account: "submit_refused", pending: 3, online: false });
  console.log(`  card : ${text}`);
  console.log(`  strip: ${stripMsg}`);
  check(
    "the card does NOT promise it will send itself when the network returns",
    promises(text).length === 0,
    `promised: ${promises(text).join(", ")}`,
  );
  check(
    "the strip outranks ออฟไลน์ even with online=false — waiting fixes nothing here",
    !stripMsg.includes("ออฟไลน์") && stripMsg.includes("เจ้าของร้าน"),
    stripMsg,
  );
  check(
    "the strip reports the bills held, so nobody thinks they were lost",
    stripMsg.includes("3"),
    stripMsg,
  );
  check("neither leaks a diagnostic", leaks(text).length === 0 && leaks(stripMsg).length === 0);

  /* The retraction, same rule as the void. */
  transport.grantAdmin();
  await engine.resumeAfterSignIn();
  const drained = await engine.runUntilQuiescent();
  console.log(`  after sign-in -> synced=${String(drained.synced)}`);
  check(
    "after a sign-in the same three bills drain, unchanged",
    drained.synced === 3 && server.billCount === 3,
    `synced=${String(drained.synced)}`,
  );
  const finals = await Promise.all(bills.map((b) => store.getBill(b.id)));
  check(
    "with the idempotency keys they were born with — nothing was re-typed",
    finals.every((b, i) => b?.idempotency_key === bills[i]?.idempotency_key),
  );
  const docSeq = finals.map((b) => Number(b?.doc_no?.split("-").pop()));
  check(
    "and in weighing order — a refusal did not reorder the queue",
    docSeq.every((n, i) => i === 0 || n > (docSeq[i - 1] ?? -1)),
    docSeq.join(" < "),
  );

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ F4 ---- */

/** The role gate on the button. Courtesy, and it must fail OPEN. */
function f4RoleGate(): void {
  header("F4: the button is not offered to a role that cannot use it");

  const live = {
    sync_state: "synced" as const,
    doc_no: "B-2569-105",
    void_requested_at: null,
    voided_at: null,
    void_refused_at: null,
    void_refused_code: null,
  };

  for (const role of ["admin", "staff", null] as const) {
    console.log(
      `  role=${String(role).padEnd(6)} offered=${String(canRequestVoid(live, role))}`,
    );
  }
  check("an admin is offered it", canRequestVoid(live, "admin"));
  check("a staff device is not", !canRequestVoid(live, "staff"));
  check(
    "an UNREADABLE token still is — the client gate fails open",
    canRequestVoid(live, null),
    "hiding it from an admin whose token we failed to parse removes the only way to fix a bill",
  );

  /*
   * The role comes out of the token's own claims, so a cold start with the server
   * unreachable still knows. Signature is not checked and cannot be — nothing is
   * authorised on this value. F6 runs the same reader over tokens the REAL server
   * minted, which is the only check that matters.
   */
  const cases: readonly [string, string, ReturnType<typeof readTokenRole>][] = [
    ["not a JWT", "hello", null],
    ["two segments", "aa.bb", null],
    ["empty payload", "aa..cc", null],
    ["not base64url", "aa.!!!!.cc", null],
    ["valid JSON, no role", `aa.${b64url('{"sub":"x"}')}.cc`, null],
    ["a role we do not know", `aa.${b64url('{"role":"superuser"}')}.cc`, null],
    ["staff", `aa.${b64url('{"role":"staff"}')}.cc`, "staff"],
    ["admin", `aa.${b64url('{"role":"admin","username":"admin"}')}.cc`, "admin"],
    // Thai in a neighbouring claim: the decoder must not fall over on multi-byte
    // UTF-8, and must not need a global that Hermes may not have.
    ["admin with a Thai username", `aa.${b64url('{"role":"admin","username":"เจ้าของร้าน"}')}.cc`, "admin"],
  ];
  for (const [label, token, want] of cases) {
    const got = readTokenRole(token);
    check(`token: ${label} -> ${String(want)}`, got === want, `got ${String(got)}`);
  }
  check("a null token is unknown, not a crash", readTokenRole(null) === null);
}

/** base64url with no padding, as a JWT segment is. */
function b64url(json: string): string {
  return Buffer.from(json, "utf8").toString("base64url");
}

/* ------------------------------------------------------------------ F5 ---- */

/**
 * THE DISPROOF. Every assertion above is worthless unless something could have
 * made it fail, so here is the code that did: the SAME scenarios under the
 * classification the transport used until this phase, which differs in nothing
 * but the union member it returns.
 */
async function f5Disproof(): Promise<void> {
  header("F5: DISPROOF — the same two refusals under the OLD 403 mapping");

  /* ---- the void: unbounded retry, and a promise nothing keeps ---- */
  const dirV = tempDir("legacy-void");
  const driverV = NodeSqliteDriver.open(join(dirV, "f5v.db"));
  const storeV = await SqliteLocalStore.open(driverV);
  await signInProofDevice(driverV);
  const clockV = new FakeClock();
  const serverV = new FakeServer();
  const legacyV = new LegacyForbiddenTransport();

  // Sync the bill with a working transport first, then swap in the legacy 403 —
  // the old mapping refused the VOID, not the send.
  const setup = new SyncEngine({ ...noSellerKind(),
    store: storeV, transport: new OnlineTransport(serverV), clock: clockV, backoffBaseMs: 1,
  });
  const billV = await makeBill(storeV, clockV, new SeqIds("f5v"));
  await setup.runUntilQuiescent();
  await storeV.requestVoid(billV.id, "ชั่งผิด", clockV.now());

  const legacyEngine = new SyncEngine({ ...noSellerKind(),
    store: storeV, transport: legacyV, clock: clockV, backoffBaseMs: 1000,
  });
  const PASSES = 20;
  for (let i = 0; i < PASSES; i += 1) {
    clockV.advance(4000); // App's real poll interval
    await legacyEngine.runOnce();
  }
  const legacyRow = await storeV.getBill(billV.id);
  const legacyVoidLine = legacyRow === null ? "" : voidProgressLine(legacyRow) ?? "";
  console.log(
    `  BEFORE: ${String(PASSES)} passes over ${String((PASSES * 4000) / 1000)}s ->` +
      ` voidCalls=${String(legacyV.voidCalls)} still owed=${String((await storeV.listVoidsToApply(5)).length)}`,
  );
  console.log(`  BEFORE, the void line: ${legacyVoidLine}`);

  check(
    "DISPROOF: the old mapping re-asked on EVERY pass — no backoff exists on this path",
    legacyV.voidCalls === PASSES,
    `voidCalls=${String(legacyV.voidCalls)} of ${String(PASSES)} passes (the new mapping asks once)`,
  );
  check(
    "DISPROOF: and the card promised the cancel would happen by itself",
    promises(legacyVoidLine).length > 0,
    `promised: ${promises(legacyVoidLine).join(", ")}`,
  );
  check(
    "DISPROOF: while the server still had the bill ACTIVE",
    serverV.findById(billV.id)?.voided_at === null,
  );
  check(
    "DISPROOF: and nothing on the row said the reversal had not happened",
    legacyRow?.void_refused_at === null && legacyRow !== null && isVoided(legacyRow),
    "so the view drew ยกเลิกแล้ว with the total struck through",
  );

  await driverV.close();
  rmSync(dirV, { recursive: true, force: true });

  /* ---- the send: the red support alarm ---- */
  const dirS = tempDir("legacy-send");
  const driverS = NodeSqliteDriver.open(join(dirS, "f5s.db"));
  const storeS = await SqliteLocalStore.open(driverS);
  await signInProofDevice(driverS);
  const clockS = new FakeClock();
  const legacyS = new LegacyForbiddenTransport();
  const engineS = new SyncEngine({ ...noSellerKind(),
    store: storeS, transport: legacyS, clock: clockS,
    backoffBaseMs: 1000, backoffMaxMs: 5000, batchLimit: 50,
  });

  const idsS = new SeqIds("f5s");
  for (let i = 0; i < 3; i += 1) {
    await makeBill(storeS, clockS, idsS);
    clockS.advance(60_000);
  }
  for (let i = 0; i < POISON_ALARM_ATTEMPTS + 3; i += 1) {
    clockS.advance(15_000);
    await engineS.runOnce();
  }
  const snapS = await storeS.pendingQueueSnapshot();
  const healthS = assessQueue(snapS, clockS.now());
  const legacyStrip = statusNotice({
    session: "active",
    account: "ok", // App had no such state: a 403 set nothing at all
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
    blocked: healthS.alarm
      ? {
          behind: healthS.behind,
          forMs: healthS.poisonedForMs,
          attempts: healthS.serverErrorAttempts,
        }
      : null,
    waitingOnMasterData: 0,
    masterDataCodes: [],
  }).message;

  console.log(
    `  BEFORE: sendCalls=${String(legacyS.sendCalls)}` +
      ` serverErrorAttempts=${String(snapS.head?.server_error_attempts)}` +
      ` poisoned=${String(healthS.poisoned)} alarm=${String(healthS.alarm)}`,
  );
  console.log(`  BEFORE, the strip: ${legacyStrip}`);

  check(
    "DISPROOF: the old mapping DID run the poison counter past the alarm threshold",
    (snapS.head?.server_error_attempts ?? 0) >= POISON_ALARM_ATTEMPTS &&
      healthS.poisoned &&
      healthS.alarm,
    `serverErrorAttempts=${String(snapS.head?.server_error_attempts)} alarm=${String(healthS.alarm)}`,
  );
  check(
    "DISPROOF: and the yard was told to ring support about a permission",
    legacyStrip.includes("ฝ่ายสนับสนุน"),
    legacyStrip,
  );
  check(
    "DISPROOF: while hammering the server once per pass",
    legacyS.sendCalls >= POISON_ALARM_ATTEMPTS,
    `sendCalls=${String(legacyS.sendCalls)}`,
  );

  await driverS.close();
  rmSync(dirS, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ F6 ---- */

const API = process.env.RECYCLE_API_BASE ?? "http://127.0.0.1:8000";
const TENANT_A = "11111111-1111-1111-1111-111111111111";
const SELLER_A = "aaaa0000-0000-0000-0000-0000000000a4";
const PRODUCT_A = "aaaa0000-0000-0000-0000-0000000000a3";

async function login(username: string, password: string): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenant_id: TENANT_A, username, password }),
  });
  if (!res.ok) throw new Error(`login ${username} -> HTTP ${String(res.status)}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/**
 * THE REAL PATH. Everything above runs against a fake that returns what we
 * BELIEVE the server sends; this runs the real HttpTransport against the real API
 * with the real seeded staff account, which is the only thing that can prove the
 * classification matches the server's actual answer.
 *
 * It creates ONE bill per run and voids it. That bill is permanent — hard rule 5
 * forbids deleting a transaction — which is the same footprint prove_bills.py
 * leaves and the reason ids are minted fresh per run rather than hardcoded
 * (lessons/proof-must-run-twice.md).
 */
async function f6LiveServer(): Promise<void> {
  header("F6: the REAL server, a REAL staff token, the REAL transport");

  const staffToken = await login("staff", "tenantA-staff-789");
  const adminToken = await login("admin", "tenantA-pw-123");
  console.log(`  api: ${API}`);
  console.log(
    `  roles read from the REAL tokens: staff=${String(readTokenRole(staffToken))}` +
      ` admin=${String(readTokenRole(adminToken))}`,
  );
  check(
    "the hand-written claim reader agrees with the server on both real tokens",
    readTokenRole(staffToken) === "staff" && readTokenRole(adminToken) === "admin",
    "no atob, no TextDecoder — neither is verified under Hermes",
  );

  // A real bill, created by the STAFF token: staff may create bills, and that is
  // what makes the refusal below about the operation and not about the account.
  const billId = crypto.randomUUID();
  const bill: LocalBill = {
    id: billId,
    idempotency_key: crypto.randomUUID(),
    payload: {
      id: billId,
      seller_id: SELLER_A,
      vehicle_no: "70-1234",
      device_created_at: new Date().toISOString(),
      idempotency_key: "",
      items: [
        {
          id: crypto.randomUUID(),
          product_id: PRODUCT_A,
          line_no: 1,
          gross_weight: "10.005",
          tare_weight: "0.002",
          net_weight: "10.003",
          unit_price: "15.00",
          list_price: "15.00",
        },
      ],
      total_amount: null,
    },
    sync_state: "pending",
    attempt_count: 0,
    last_error: null,
    created_at: new Date().toISOString(),
    device_created_at: new Date().toISOString(),
    next_attempt_at: new Date().toISOString(),
    first_attempt_at: null,
    first_server_error_at: null,
    server_error_attempts: 0,
    master_data_missing_at: null,
    master_data_code: null,
    master_as_of: null,
    doc_no: null,
    synced_at: null,
    void_reason: null,
    void_requested_at: null,
    voided_at: null,
    void_attempts: 0,
    void_last_error: null,
    void_refused_at: null,
    void_refused_code: null,
  };
  bill.payload.idempotency_key = bill.idempotency_key;

  const staffTransport = new HttpTransport({
    baseUrl: API,
    getToken: () => Promise.resolve(staffToken),
  });
  const adminTransport = new HttpTransport({
    baseUrl: API,
    getToken: () => Promise.resolve(adminToken),
  });

  const sent = await staffTransport.sendBill(bill);
  console.log(`  staff POST /bills -> ${sent.kind}`);
  check(
    "a STAFF token creates a bill normally — the gate is on voiding, not on the account",
    sent.kind === "accepted",
    `kind=${sent.kind}${sent.kind === "rejected" || sent.kind === "unavailable" ? ` reason=${sent.reason}` : ""}`,
  );
  if (sent.kind !== "accepted") return;
  const docNo = sent.doc_no;
  bill.doc_no = docNo;
  bill.sync_state = "synced";
  console.log(`  created ${String(docNo)}`);

  /* ---- THE MEASUREMENT: a staff void against the real endpoint. ---- */
  const refused = await staffTransport.voidBill(bill, "ชั่งผิด");
  console.log(`  staff POST /bills/{id}/void -> ${refused.kind}`);
  check(
    "the real 403 classifies as FORBIDDEN — not unavailable, not rejected, not session_expired",
    refused.kind === "forbidden",
    `kind=${refused.kind}`,
  );
  if (refused.kind === "forbidden") {
    console.log(`  code: ${refused.code}`);
    console.log(`  reason (developer-only, never rendered): ${refused.reason}`);
    check(
      "carrying the server's own code, which is what the Thai wording is derived from",
      refused.code === "admin_required",
      `code=${refused.code}`,
    );
    check(
      "and the reason really does contain the body — so the leak checks above are not vacuous",
      leaks(refused.reason).length > 3,
      `${String(leaks(refused.reason).length)} diagnostic fragments present in last_error`,
    );
  }

  /* ---- THE BILL IS UNTOUCHED, read back from the server itself. ---- */
  const readBack = await fetch(`${API}/bills/${billId}`, {
    headers: { authorization: `Bearer ${staffToken}` },
  });
  const body = (await readBack.json()) as {
    doc_no?: string;
    voided_at?: string | null;
    total_amount?: string;
    items?: { gross_weight: string; net_weight: string; amount: string }[];
  };
  console.log(
    `  GET /bills/{id} -> ${String(readBack.status)} doc_no=${String(body.doc_no)}` +
      ` voided_at=${String(body.voided_at)} total=${String(body.total_amount)}`,
  );
  check(
    "the server still holds the bill ACTIVE, with its number and its money unchanged",
    readBack.status === 200 &&
      body.voided_at === null &&
      body.doc_no === docNo &&
      body.items?.[0]?.gross_weight === "10.005",
    `voided_at=${String(body.voided_at)}`,
  );

  /* ---- THE CONTROL: the same bill, the same request, an ADMIN token. ---- */
  const allowed = await adminTransport.voidBill(bill, "ชั่งผิด");
  console.log(`  admin POST /bills/{id}/void -> ${allowed.kind}`);
  check(
    "the SAME void on the SAME bill succeeds as an admin — the refusal was about the CALLER",
    allowed.kind === "voided",
    `kind=${allowed.kind}`,
  );
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("Phase 2c-9 — a 403 is about what the caller may do");
  console.log(`node ${process.version}`);

  const offline = process.argv.includes("--offline");

  await f1VoidRefused();
  await f2SignInRetracts();
  await f3SendRefused();
  f4RoleGate();
  await f5Disproof();

  if (offline) {
    console.log("");
    console.log("=== F6 SKIPPED (--offline) ===");
    console.log(
      "  The live path is the only case that reads the server's ACTUAL 403." +
        " Everything above proves the client agrees with itself.",
    );
    console.log("");
    console.log("INCOMPLETE — the headless cases passed but nothing was verified against the API.");
    // Exit 2, never 0. A proof that skipped its own subject must not read as
    // green: lessons/a-backup-is-a-claim-until-it-is-restored.md.
    return failures === 0 ? 2 : 1;
  }

  try {
    await f6LiveServer();
  } catch (err) {
    failures += 1;
    console.log("");
    console.log(`  [FAIL] the live server could not be reached at ${API}`);
    console.log(`         ${err instanceof Error ? err.message : String(err)}`);
    console.log("         Start it: docker ps (recycle_pg healthy), then from server/:");
    console.log("         uv run uvicorn app.main:app --host 0.0.0.0 --port 8000");
    console.log("         Or run with --offline to skip it (exits 2, never 0).");
  }

  console.log("");
  console.log(failures === 0 ? "ALL FORBIDDEN CASES PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

const code = await main();
console.log(`FORBIDDEN_EXIT=${code}`);
process.exitCode = code;
