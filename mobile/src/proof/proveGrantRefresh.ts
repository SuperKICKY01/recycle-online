/**
 * 3b proof (ADVISOR-DECIDED 2026-10-17): AFTER A "NO PERMISSION" REFUSAL THE PHONE RE-READS
 * /whoami ON APP FOREGROUND AND ON ลองอีกครั้ง, AND RESUMES WHEN THE GRANT IS BACK — NO SIGN-OUT.
 *
 * Run: npm run prove:grantrefresh        (headless; no server)
 *
 * Real SyncEngine + SqliteLocalStore, with the suite's ForbiddenTransport standing in for the
 * server's 403 and its grantAdmin() for the owner putting the permission back. /whoami is the
 * `readGrants` the controller is given — counted, so "no refusal, no request" is observable.
 *
 *   G1  nothing refused: neither trigger reads /whoami
 *   G2  the foreground trigger fires only on a move INTO "active"
 *   G3  SEND refused, FOREGROUND trigger: grant still missing -> nothing resumes, no send; grant
 *       back -> resumed, the bill reaches the server once, and no sign-in or sign-out ran
 *   G4  SEND refused, ลองอีกครั้ง trigger: the same, through onRetryPress
 *   G5  VOID refused, both triggers: the void applies with the reason first typed
 *   G6  partial: only bills.void back -> the void resumes, the send halt stays (no send attempt)
 *   G7  /whoami unreadable -> "unread", nothing lifted
 *   G8  the strip: the refusal notice carries ลองอีกครั้ง (recheck_grants), never a sign-in, and
 *       its handler is the recheck — not the master-data retry the old two-way choice gave it
 *
 * THE DISPROOF, RUN BY HAND (2026-10-19): make grantsRestored() answer "nothing restored" —
 * G3, G4, G5 and G6 go red; G1, G2, G7, G8 stay green.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import {
  becameActive,
  createGrantRecheck,
  grantsRestored,
  recheckStatusLine,
  type GrantRecheck,
  type RecheckOutcome,
} from "../session/grantRecheck.js";
import { createLocalBill } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import { statusActionHandler, statusNotice } from "../sync/statusNotice.js";
import type { StatusInput } from "../sync/statusNotice.js";
import { NOTHING_OWED } from "../sync/outbox.js";
import type { LocalBill, LocalStore } from "../sync/types.js";
import { isVoidRefused } from "../sync/types.js";
import { FakeClock, FakeServer, ForbiddenTransport, noSellerKind, PROOF_OWNER, SeqIds } from "./fakes.js";
import { signInProofDevice } from "./proofDevice.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const ITEM = {
  product_id: "prod-1",
  line_no: 1,
  gross_weight: "10.005",
  tare_weight: "0.002",
  net_weight: "10.003",
  unit_price: "15.00",
  list_price: "15.00",
};

async function makeBill(store: LocalStore, clock: FakeClock, ids: SeqIds): Promise<LocalBill> {
  return createLocalBill(
    { store, clock, ids },
    {
      seller: { kind: "server", seller_id: "sell-1" },
      vehicle_no: null,
      items: [{ ...ITEM, id: ids.newId() }],
      total_amount: "150.05",
      master_as_of: null,
    },
    PROOF_OWNER,
  );
}

const NO_GRANTS: ReadonlySet<string> = new Set(["bills.read"]);
const ALL_GRANTS: ReadonlySet<string> = new Set(["bills.read", "bills.create", "bills.void"]);

interface Rig {
  dir: string;
  driver: NodeSqliteDriver;
  store: SqliteLocalStore;
  clock: FakeClock;
  server: FakeServer;
  transport: ForbiddenTransport;
  engine: SyncEngine;
  whoamiReads: number;
  grants: ReadonlySet<string> | null;
  submitRefused: boolean;
  signIns: number;
  signOuts: number;
  ctl: GrantRecheck;
}

async function rig(name: string, gate: { sends: boolean; voids: boolean }): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), `recycle-3b-${name}-`));
  const driver = NodeSqliteDriver.open(join(dir, "g.db"));
  const store = await SqliteLocalStore.open(driver);
  await signInProofDevice(driver);
  const clock = new FakeClock();
  const server = new FakeServer();
  const transport = new ForbiddenTransport(server, gate);
  const engine = new SyncEngine({ ...noSellerKind(), store, transport, clock, backoffBaseMs: 1000 });
  const r = { dir, driver, store, clock, server, transport, engine, whoamiReads: 0, grants: NO_GRANTS,
    submitRefused: false, signIns: 0, signOuts: 0 } as unknown as Rig;
  // "No sign-out": the two session events are counted, and must stay at zero.
  const origIn = engine.resumeAfterSignIn.bind(engine);
  engine.resumeAfterSignIn = async () => { r.signIns += 1; return origIn(); };
  const origOut = engine.resetAfterSignOut.bind(engine);
  engine.resetAfterSignOut = () => { r.signOuts += 1; origOut(); };
  r.ctl = createGrantRecheck(
    {
      refusal: () => ({ submitRefused: r.submitRefused, voidsRefused: 0 }),
      readGrants: () => {
        r.whoamiReads += 1;
        return Promise.resolve(r.grants);
      },
      resume: async (restored) => {
        await engine.resumeAfterGrantRestored(restored);
        if (restored.submit) r.submitRefused = false;
      },
    },
    "active",
  );
  return r;
}

/** How many of these bills hold a refused void — what App counts over every bill it holds. */
async function voidsRefusedOn(r: Rig, ids: readonly string[]): Promise<number> {
  let n = 0;
  for (const id of ids) {
    const b = await r.store.getBill(id);
    if (b !== null && isVoidRefused(b)) n += 1;
  }
  return n;
}

async function rigWithVoidCount(name: string, gate: { sends: boolean; voids: boolean }, ids: string[]): Promise<Rig> {
  const r = await rig(name, gate);
  let voids = 0;
  r.ctl = createGrantRecheck(
    {
      refusal: () => ({ submitRefused: r.submitRefused, voidsRefused: voids }),
      readGrants: () => {
        r.whoamiReads += 1;
        return Promise.resolve(r.grants);
      },
      resume: async (restored) => {
        await r.engine.resumeAfterGrantRestored(restored);
        if (restored.submit) r.submitRefused = false;
      },
    },
    "active",
  );
  (r as unknown as { refreshVoids: () => Promise<void> }).refreshVoids = async () => {
    voids = await voidsRefusedOn(r, ids);
  };
  return r;
}

async function fire(r: Rig, trigger: "foreground" | "retry"): Promise<RecheckOutcome | null> {
  if (trigger === "retry") return r.ctl.onRetryPress();
  // A real foreground: the app goes to the background, then comes back.
  const away = await r.ctl.onAppState("background");
  if (away !== null) check("moving to the background re-reads nothing", false, JSON.stringify(away));
  return r.ctl.onAppState("active");
}

async function close(r: Rig): Promise<void> {
  await r.driver.close();
  rmSync(r.dir, { recursive: true, force: true });
}

/* ---------------------------------------------------------------- G1, G2 -- */

async function g1NothingRefused(): Promise<void> {
  header("G1 nothing refused: neither trigger reads /whoami");
  const r = await rig("g1", { sends: false, voids: false });
  const a = await fire(r, "foreground");
  const b = await fire(r, "retry");
  check("both triggers answer nothing_refused", a?.kind === "nothing_refused" && b?.kind === "nothing_refused",
    `${String(a?.kind)} / ${String(b?.kind)}`);
  check("and /whoami was read ZERO times — no refusal, no request", r.whoamiReads === 0, String(r.whoamiReads));
  await close(r);
}

function g2Foreground(): void {
  header("G2 the foreground trigger fires only on a move INTO active");
  check("background -> active fires", becameActive("background", "active"));
  check("inactive -> active fires", becameActive("inactive", "active"));
  check("active -> active does not", !becameActive("active", "active"));
  check("active -> background does not", !becameActive("active", "background"));
  check("an unknown first state does not (no move was observed)", !becameActive(null, "active"));
}

/* ---------------------------------------------------------------- G3, G4 -- */

async function sendScenario(trigger: "foreground" | "retry"): Promise<void> {
  header(`${trigger === "foreground" ? "G3" : "G4"} SEND refused, resumed by ${trigger === "foreground" ? "the app coming to the foreground" : "ลองอีกครั้ง"}`);
  const r = await rig(`send-${trigger}`, { sends: true, voids: false });
  await makeBill(r.store, r.clock, new SeqIds(`s-${trigger}`));
  const first = await r.engine.runOnce();
  r.submitRefused = first.forbidden > 0;
  check("precondition: the send was refused (403) and halted", r.submitRefused && r.server.billCount === 0,
    `forbidden=${String(first.forbidden)}`);

  // The owner has NOT put the permission back yet.
  const early = await fire(r, trigger);
  const callsBefore = r.transport.sendCalls;
  await r.engine.runOnce();
  check("grant still missing: the outcome is still_refused and /whoami was read once",
    early?.kind === "still_refused" && r.whoamiReads === 1, `${String(early?.kind)} reads=${String(r.whoamiReads)}`);
  check("and nothing was re-sent — the halt holds", r.transport.sendCalls === callsBefore && r.server.billCount === 0,
    `sendCalls ${String(callsBefore)} -> ${String(r.transport.sendCalls)}`);

  // The owner puts it back; the phone is still signed in as the same person.
  r.transport.grantAdmin();
  r.grants = ALL_GRANTS;
  const back = await fire(r, trigger);
  check("grant back: the outcome is resumed {submit}", back?.kind === "resumed" && back.restored.submit,
    JSON.stringify(back));
  await r.engine.runUntilQuiescent();
  check("the bill reaches the server, exactly once", r.server.billCount === 1, String(r.server.billCount));
  check("NO sign-in and NO sign-out ran", r.signIns === 0 && r.signOuts === 0,
    `signIns=${String(r.signIns)} signOuts=${String(r.signOuts)}`);
  check("the device-global refusal is lifted", r.submitRefused === false);
  await close(r);
}

/* -------------------------------------------------------------------- G5 -- */

async function voidScenario(trigger: "foreground" | "retry"): Promise<void> {
  header(`G5 VOID refused, resumed by ${trigger === "foreground" ? "the foreground" : "ลองอีกครั้ง"}`);
  const ids: string[] = [];
  const r = await rigWithVoidCount(`void-${trigger}`, { sends: false, voids: true }, ids);
  const refreshVoids = (r as unknown as { refreshVoids: () => Promise<void> }).refreshVoids;
  const bill = await makeBill(r.store, r.clock, new SeqIds(`v-${trigger}`));
  ids.push(bill.id);
  await r.engine.runUntilQuiescent();
  await r.store.requestVoid(bill.id, "ลูกค้าเปลี่ยนใจ", r.clock.now());
  await r.engine.runOnce();
  await refreshVoids();
  check("precondition: the void was refused", (await voidsRefusedOn(r, ids)) === 1);
  const early = await fire(r, trigger);
  check("grant still missing: still_refused", early?.kind === "still_refused", String(early?.kind));
  r.transport.grantAdmin();
  r.grants = ALL_GRANTS;
  const back = await fire(r, trigger);
  check("grant back: resumed {voids}", back?.kind === "resumed" && back.restored.voids, JSON.stringify(back));
  const run = await r.engine.runUntilQuiescent();
  const onServer = r.server.findById(bill.id);
  check("the void applies, with the reason typed the first time",
    run.voidsApplied === 1 && onServer?.void_reason === "ลูกค้าเปลี่ยนใจ", String(onServer?.void_reason));
  check("NO sign-in and NO sign-out ran", r.signIns === 0 && r.signOuts === 0);
  await close(r);
}

/* -------------------------------------------------------------------- G6 -- */

async function g6Partial(): Promise<void> {
  header("G6 partial: only bills.void back -> the void resumes, the send halt stays");
  check("pure: void back, create absent -> {submit:false, voids:true}",
    JSON.stringify(grantsRestored({ submitRefused: true, voidsRefused: 1 }, new Set(["bills.void"]))) ===
      JSON.stringify({ submit: false, voids: true }));
  const r = await rig("partial", { sends: true, voids: false });
  await makeBill(r.store, r.clock, new SeqIds("p"));
  await r.engine.runOnce();
  const calls = r.transport.sendCalls;
  r.transport.grantAdmin(); // the server would now accept — but the device must not ask yet
  await r.engine.resumeAfterGrantRestored({ submit: false, voids: true });
  await r.engine.runOnce();
  check("with only voids restored, the halted send is NOT re-attempted", r.transport.sendCalls === calls,
    `sendCalls ${String(calls)} -> ${String(r.transport.sendCalls)}`);
  await close(r);
}

/* -------------------------------------------------------------------- G7 -- */

async function g7Unread(): Promise<void> {
  header("G7 /whoami unreadable -> unread, nothing lifted");
  const r = await rig("unread", { sends: true, voids: false });
  await makeBill(r.store, r.clock, new SeqIds("u"));
  r.submitRefused = (await r.engine.runOnce()).forbidden > 0;
  r.grants = null;
  const calls = r.transport.sendCalls;
  const o = await fire(r, "retry");
  await r.engine.runOnce();
  check("the outcome is unread", o?.kind === "unread", String(o?.kind));
  check("the refusal stands and nothing was re-sent", r.submitRefused && r.transport.sendCalls === calls);
  await close(r);
}

/* -------------------------------------------------------------------- G8 -- */

function g8Strip(): void {
  header("G8 the strip: ลองอีกครั้ง on the refusal, routed to the recheck");
  const base: StatusInput = {
    appOutdated: false, session: "active", account: "submit_refused", voidsRefused: 0, online: true, pending: 2,
    parkedForAnother: 0, parkedUnknownOwner: 0, failed: 0, blocked: null, waitingOnMasterData: 0,
    masterDataCodes: [], owed: NOTHING_OWED,
  } as StatusInput;
  for (const [label, input] of [
    ["submit refused", base],
    ["voids refused", { ...base, account: "ok", voidsRefused: 2 } as StatusInput],
  ] as const) {
    const n = statusNotice(input);
    check(`${label}: the button is ลองอีกครั้ง (recheck_grants)`,
      n.action?.kind === "recheck_grants" && n.action.label === "ลองอีกครั้ง", JSON.stringify(n.action));
    check(`${label}: the sentence never invites a sign-in and still names the owner`,
      !n.message.includes("เข้าสู่ระบบ") && n.message.includes("เจ้าของร้าน"), n.message);
  }
  const hits = { retry_master_data: 0, sign_in: 0, recheck_grants: 0 };
  const h = statusActionHandler(statusNotice(base).action, {
    retry_master_data: () => { hits.retry_master_data += 1; },
    sign_in: () => { hits.sign_in += 1; },
    recheck_grants: () => { hits.recheck_grants += 1; },
  });
  h?.();
  check("pressing it runs the RECHECK and nothing else",
    hits.recheck_grants === 1 && hits.retry_master_data === 0 && hits.sign_in === 0, JSON.stringify(hits));
  for (const o of [
    { kind: "resumed", trigger: "retry", restored: { submit: true, voids: false } },
    { kind: "still_refused", trigger: "retry" },
    { kind: "unread", trigger: "retry" },
    { kind: "nothing_refused", trigger: "retry" },
  ] as const) {
    const line = recheckStatusLine(o);
    check(`the ${o.kind} line is Thai and leaks nothing`, /[฀-๿]/.test(line) && !/HTTP|403|whoami|null|undefined/.test(line), line);
  }
}

async function main(): Promise<void> {
  await g1NothingRefused();
  g2Foreground();
  await sendScenario("foreground");
  await sendScenario("retry");
  await voidScenario("foreground");
  await voidScenario("retry");
  await g6Partial();
  await g7Unread();
  g8Strip();
  console.log(`\n${failures === 0 ? "ALL CLAIMS HOLD" : `THESE CLAIMS DID NOT HOLD: ${String(failures)}`}`);
  console.log(`PROVE_GRANTREFRESH_EXIT=${failures === 0 ? 0 : 1}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

void main();
