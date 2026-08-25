/**
 * R1b proof: ENDING A SESSION ON THIS DEVICE.
 *
 * Run: npm run prove:signout
 *
 * WHY A NEW FILE RATHER THAN AN EXTENSION.
 * Each proof in this directory is named for one subject and this is a new one —
 * a lifecycle EVENT that spans four layers at once (the token store contract,
 * the sync engine's device-global gate, the SQLite draft, and what the operator
 * reads). The three candidates to extend all fit worse: proveNotice is pure
 * rendering and opens no database; proveCold is about a COLD START, the opposite
 * end of the same lifecycle; proveSync is the engine's own behaviour and knows
 * nothing about a keystore. Folding sign-out into any of them would put its
 * failures under a heading that does not name them, which is how a red result
 * gets attributed to the wrong thing.
 *
 * WHAT THIS PROOF CANNOT DO, STATED FIRST SO IT IS NOT READ AS COVERED:
 * SecureTokenStore.clear() — the platform delete itself — CANNOT RUN HERE.
 * expo-secure-store is `requireNativeModule('ExpoSecureStore')` and exists only
 * inside an Expo runtime. Everything below exercises the CONTRACT through
 * MemoryTokenStore and a throwing fake. When this proof is green, the real
 * delete is untouched by it. That remains true and is why this block is first.
 *
 * THE DEVICE PASS THIS BLOCK ONCE NAMED AS OWED HAS BEEN RUN. The sentence here
 * read "R1b is NOT done: it is done after a device pass — sign out, force-quit,
 * cold start, and the login screen is what appears". That is now a description
 * of something executed, not of something owed:
 *   iOS 2026-08-06, real iPhone (R1b) — evidence read off the SCREEN.
 *   Android 2026-08-12, one vivo 1938, on this project's own DEBUG BUILD
 *     (`9d2eb22`, applicationId `dev.chutipon.recycle`) and never through Expo
 *     Go — sign out, force-stop, cold start, login screen; plus the stored entry
 *     itself counted 1 before and 0 after, which the iOS pass never looked at.
 *
 * STILL NOT COVERED ANYWHERE: the FAILING delete. S3 below is the only thing
 * that exercises it, and it does so with a throwing fake — no real keystore has
 * ever been made to refuse, on either platform. And no release build exists.
 *
 * THE CASES
 *   S1  a non-empty queue refuses the sign-out, and the count is on the screen
 *   S2  an empty queue signs out: clear() called, every session value reset
 *   S3  clear() FAILS -> still signed in, token still held, and the sheet says so
 *   S4  after a sign-out the tick issues ZERO requests, and nothing says expired
 *   S4b a pass ALREADY IN FLIGHT at the tap — what actually happens, not a fix
 *   S5  the draft AND the shop's master cache are still in SQLite — read back out
 *   S6  the whole sheet as ONE string in draw order (the N2b discipline)
 *   S9  R2b — a queue that CANNOT drain behind a 401, and the sheet that says
 *       why: the count is MEASURED off the store and the session is DERIVED
 *       from the pass, on both halves
 *   S7  the disproof: which branch, removed, turns this red
 *
 * ON THE OUTPUT. Mostly Thai. Mojibake in the console is the console — this box
 * is codepage 874 (lessons/console-is-not-the-observation.md). Every assertion
 * compares JavaScript strings, which are unaffected by how a terminal draws them.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteDraftStore } from "../adapters/sqlite/SqliteDraftStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { SqliteMasterStore } from "../adapters/sqlite/SqliteMasterStore.js";
import {
  applyClearedSession,
  CLEARED_SESSION,
  maySync,
  sessionEndedAfterPass,
  sessionStateOf,
  signOut,
} from "../session/signOut.js";
import type {
  ClearedSession,
  SignOutFailure,
  SignOutOutcome,
} from "../session/signOut.js";
import { signOutCard, signOutCardText } from "../session/signOutNotice.js";
import type { SignOutCardInput } from "../session/signOutNotice.js";
import { MemoryTokenStore } from "../session/tokenStore.js";
import type { ClearOutcome, TokenStore } from "../session/tokenStore.js";
import { createLocalBill } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import type { Draft } from "../cart/types.js";
import {
  ExpiredSessionTransport,
  FakeClock,
  FakeServer,
  noSellerKind,
  OfflineTransport,
  owedWith,
  PROOF_OWNER,
  SeqIds,
} from "./fakes.js";
import { signInProofDevice } from "./proofDevice.js";
import type { LocalBill, SendOutcome, Transport, VoidOutcome } from "../sync/types.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/* ----------------------------------------------------------------- fakes ---- */

/**
 * A keystore whose delete FAILS. The whole of S3 rests on this, and it is the
 * closest a node process can get to a Keychain that refuses — which is not very
 * close, and is why the device pass is not optional.
 */
class FailingTokenStore implements TokenStore {
  cleared = 0;
  constructor(private token: string | null = "a-token") {}
  load(): Promise<string | null> {
    return Promise.resolve(this.token);
  }
  save(token: string): Promise<void> {
    this.token = token;
    return Promise.resolve();
  }
  clear(): Promise<ClearOutcome> {
    this.cleared += 1;
    // The token is deliberately NOT dropped: a failed delete means it is still
    // there, which is the state S3 reads back.
    return Promise.resolve({ kind: "failed", reason: "keychain unavailable (errSecIO)" });
  }
}

/** Counts every request the engine would put on the wire. */
class CountingTransport implements Transport {
  sends = 0;
  voids = 0;
  sendBill(_bill: LocalBill): Promise<SendOutcome> {
    this.sends += 1;
    return Promise.resolve({ kind: "accepted", doc_no: "B-2569-1" });
  }
  voidBill(_bill: LocalBill, _reason: string): Promise<VoidOutcome> {
    this.voids += 1;
    return Promise.resolve({ kind: "voided", doc_no: "B-2569-1" });
  }
}

/*
 * THERE IS NO SECOND LIST HERE, AND THAT IS DELIBERATE.
 *
 * This file used to hold a hand-written LIVE_SESSION beside src/'s
 * CLEARED_SESSION and compare their key sets — two hand-written lists, which is
 * the duplication lessons/a-checker-must-not-share-the-code-it-checks.md
 * forbids: it could only ever prove that the proof agreed with itself.
 *
 * S2 now drives the REAL applier (applyClearedSession) with spy setters built
 * from the one list in src/, so what is asserted is that the code App.tsx calls
 * writes every key exactly once, with the value src/ says it should.
 *
 * WHAT THIS STILL CANNOT SEE, stated rather than implied: a new useState added
 * to App.tsx and never added to ClearedSession. App holds its session as ten
 * independent atoms, so no assertion here can reach them. See OPEN_ITEMS.md.
 */

/* ------------------------------------------------------------------ S1 ------ */

async function s1RefusedWhilePending(): Promise<void> {
  header("S1: a non-empty send queue refuses the sign-out, and says how many");

  const tokens = new MemoryTokenStore("a-token");
  let paused = false;
  const outcome = await signOut({
    owed: owedWith({ bill_send: 3 }),
    failed: 0,
    setSyncPaused: (p) => {
      paused = p;
    },
    tokens,
    engine: null,
  });

  check("the sign-out is refused", outcome.kind === "refused_pending", outcome.kind);
  check(
    "the token was NOT cleared — a refusal changes nothing",
    (await tokens.load()) === "a-token",
  );
  check("the sync tick was never paused", paused === false, `paused=${String(paused)}`);

  const text = signOutCardText(
    signOutCard({ owed: owedWith({ bill_send: 3 }), failed: 0, failure: null, session: "active" }),
  );
  console.log(`  sheet: ${text}`);
  check(
    "the rendered sheet names the COUNT, inside the sentence that carries it",
    text.includes("มีบิลรอส่งขึ้นระบบ 3 ใบ"),
    text.slice(0, 60),
  );
  // The count must come FROM the input. `includes("3")` passed on any sentence
  // holding that digit; a sentence with the count baked into it would still
  // satisfy the check above. A second, different count cannot be hardcoded.
  check(
    "...and the count is the input's, not a digit fixed in the wording",
    signOutCardText(
      signOutCard({ owed: owedWith({ bill_send: 7 }), failed: 0, failure: null, session: "active" }),
    ).includes(
      "มีบิลรอส่งขึ้นระบบ 7 ใบ",
    ),
  );
  check(
    "...and gives the reason the wait is short, not just a refusal",
    text.includes("ไม่กี่วินาที"),
  );
  check("...and does not offer a sign-out button", !text.includes("ออกจากระบบ?"));

  // FAILED bills must NOT block: they never drain, so blocking would make
  // sign-out impossible forever on a device holding one.
  const withFailed = await signOut({
    owed: owedWith({ bill_send: 0 }),
    failed: 2,
    setSyncPaused: () => undefined,
    tokens: new MemoryTokenStore("a-token"),
    engine: null,
  });
  check(
    "a FAILED bill does not block the sign-out",
    withFailed.kind === "signed_out",
    withFailed.kind,
  );
  const failedText = signOutCardText(
    signOutCard({ owed: owedWith({ bill_send: 0 }), failed: 2, failure: null, session: "active" }),
  );
  console.log(`  sheet: ${failedText}`);
  check(
    "...but its count is named on the screen, inside its own sentence",
    failedText.includes("มีบิลที่ระบบไม่รับ 2 ใบค้างอยู่"),
    failedText.slice(0, 60),
  );
  check(
    "...and that count is the input's too",
    signOutCardText(
      signOutCard({ owed: owedWith({ bill_send: 0 }), failed: 5, failure: null, session: "active" }),
    ).includes(
      "มีบิลที่ระบบไม่รับ 5 ใบค้างอยู่",
    ),
  );
  check("...and the office is named as the actor", failedText.includes("สำนักงาน"));
}

/* ------------------------------------------------------------------ S2 ------ */

async function s2SignedOut(): Promise<void> {
  header("S2: an empty queue signs out, and every session value is reset");

  const tokens = new MemoryTokenStore("a-token");
  const engine = { cleared: 0, resetAfterSignOut(): void { this.cleared += 1; } };
  const paused: boolean[] = [];

  const outcome = await signOut({
    owed: owedWith({ bill_send: 0 }),
    failed: 0,
    setSyncPaused: (p) => paused.push(p),
    tokens,
    engine,
  });

  check("the outcome is signed_out", outcome.kind === "signed_out", outcome.kind);
  check("the token store was cleared", (await tokens.load()) === null);
  check("the engine's device-global send gate was reset", engine.cleared === 1);
  check(
    "the sync tick was paused BEFORE the keystore was touched, and left paused",
    paused.length === 1 && paused[0] === true,
    JSON.stringify(paused),
  );

  /*
   * DRIVE THE REAL APPLIER. Spy setters record what App.tsx's call would write.
   * A live session is seeded first so "cleared" is a CHANGE, not a coincidence
   * of the values already being null.
   */
  const clearedAsMap = CLEARED_SESSION as unknown as Record<string, unknown>;
  const keys = Object.keys(clearedAsMap);
  const wrote: Record<string, unknown[]> = {};
  const spy =
    (name: string) =>
    (v: unknown): void => {
      (wrote[name] ??= []).push(v);
    };
  applyClearedSession({
    token: spy("token") as (v: null) => void,
    role: spy("role") as (v: null) => void,
    sessionEnded: spy("sessionEnded") as (v: false) => void,
    submitRefused: spy("submitRefused") as (v: false) => void,
    online: spy("online") as (v: null) => void,
    lastSyncedAt: spy("lastSyncedAt") as (v: null) => void,
    health: spy("health") as (v: null) => void,
    daily: spy("daily") as (v: null) => void,
    dailyDate: spy("dailyDate") as (v: null) => void,
    dailyOpen: spy("dailyOpen") as (v: false) => void,
  });

  const missed = keys.filter((k) => (wrote[k]?.length ?? 0) !== 1);
  check(
    "the real applier writes EVERY value in the list, exactly once",
    missed.length === 0 && Object.keys(wrote).length === keys.length,
    missed.length === 0
      ? `${String(keys.length)} values written`
      : `not written exactly once: ${missed.join(",")}`,
  );
  /*
   * THE VALUES, AS LITERALS IN THIS FILE.
   *
   * This used to compare what the applier wrote against CLEARED_SESSION itself,
   * which proves PASS-THROUGH and nothing more: the applier reads that same
   * object, so the two agree by construction and every cell stays green whatever
   * the constant is changed to. Eight of the ten values were unpinned in exactly
   * that way — only token (through sessionStateOf, below) and online (=== null)
   * had an assertion that could fail.
   *
   * Each literal below carries WHERE src/ says the value should be that. Three
   * rest on prose that argues the value; the rest rest on the LITERAL TYPE in
   * ClearedSession.
   *
   * WHAT THAT IS WORTH, MEASURED 2026-08-06 rather than reasoned about. All
   * eight were mutated in CLEARED_SESSION, one field per run, to a wrong-but-
   * plausible value: sessionEnded true, submitRefused true, role "staff",
   * lastSyncedAt an ISO instant, health and daily objects, dailyDate a date
   * string, dailyOpen true. EVERY ONE IS A COMPILE ERROR — TS2322 at
   * signOut.ts, "Type 'true' is not assignable to type 'false'" and "not
   * assignable to type 'null'" — so the build stopped and this proof never ran.
   * NOT ONE of the eight literals below fired. All eight are held by tsc's
   * literal types; none is held by NEITHER, so there is no unguarded value in
   * the list. What this table adds is the one case tsc cannot see — the
   * interface literal and the constant widened TOGETHER — and the Omit<> above,
   * which makes an ELEVENTH value a compile error here until its expected value
   * is written down.
   *
   * Typed as Omit<ClearedSession, ...> on purpose: an ELEVENTH value added to
   * ClearedSession is a COMPILE ERROR here until its expected value is written
   * down, rather than a value that silently joins the unpinned set.
   */
  const EXPECTED: Omit<ClearedSession, "token" | "online"> = {
    // "a forgotten value here is the previous user's ROLE ... still on screen
    // under the next user's session" (signOut.ts:107), and null is the
    // no-readable-role value (session/deviceRole.ts:129). Type: `role: null`.
    role: null,
    // PROSE: "signed_out, NEVER expired ... leaving sessionEnded true would be
    // harmless today and would become a contradiction the moment that
    // expression is reordered" (signOut.ts:177-182).
    sessionEnded: false,
    // "... PERMISSION REFUSAL ... still on screen under the next user's
    // session" (signOut.ts:107). Type: `submitRefused: false`.
    submitRefused: false,
    // PROSE: "these two lines become the ONLY thing stopping the strip from
    // showing the previous user's sync time and queue health to the next user"
    // (signOut.ts:189-207) — the reason they must not be deleted as redundant.
    lastSyncedAt: null,
    health: null,
    // "... or TAKINGS still on screen under the next user's session"
    // (signOut.ts:107). Type: `daily: null`, `dailyDate: null`.
    daily: null,
    dailyDate: null,
    // NO PROSE IN src/ NAMES THIS ONE. The only statement of its value is the
    // literal type `dailyOpen: false` (signOut.ts:132). Recorded as the weakest
    // cell in this table rather than given an intent it does not have.
    dailyOpen: false,
  };
  const expectedAsMap = EXPECTED as unknown as Record<string, unknown>;
  // token and online are NOT in the table: each has its own assertion below,
  // which is a stronger pin than a literal in a map. Listing them is what makes
  // their absence deliberate rather than an omission.
  const pinnedByTheirOwnCheck = ["token", "online"];
  const unpinned = keys.filter(
    (k) => !(k in expectedAsMap) && !pinnedByTheirOwnCheck.includes(k),
  );
  check(
    "every value in the list is pinned — by a literal above, or by its own check",
    unpinned.length === 0,
    unpinned.join(",") ||
      `${String(Object.keys(expectedAsMap).length)} by literal` +
        ` + ${String(pinnedByTheirOwnCheck.length)} by their own check`,
  );
  const wrongValue = Object.keys(expectedAsMap).filter(
    (k) => wrote[k]?.[0] !== expectedAsMap[k],
  );
  check(
    "...and each is the value src/ says it should be — against the literal HERE," +
      " not against CLEARED_SESSION",
    wrongValue.length === 0,
    wrongValue.length === 0
      ? `${String(Object.keys(expectedAsMap).length)} match the literals in this file`
      : wrongValue
          .map((k) => `${k}=${String(wrote[k]?.[0])} want ${String(expectedAsMap[k])}`)
          .join(","),
  );

  check(
    "the derived session state is signed_out, NOT expired",
    sessionStateOf({
      token: CLEARED_SESSION.token,
      sessionEnded: CLEARED_SESSION.sessionEnded,
    }) === "signed_out",
  );
  console.log(
    `  online=${String(CLEARED_SESSION.online)} (null, not false — no session to have answers about)`,
  );
  check("online is null rather than false", CLEARED_SESSION.online === null);
}

/* ------------------------------------------------------------------ S3 ------ */

async function s3ClearFails(): Promise<void> {
  header("S3: the keystore refuses to forget the token — the app must NOT lie");

  const tokens = new FailingTokenStore("a-token");
  const engine = { cleared: 0, resetAfterSignOut(): void { this.cleared += 1; } };
  const paused: boolean[] = [];

  const outcome: SignOutOutcome = await signOut({
    owed: owedWith({ bill_send: 0 }),
    failed: 0,
    setSyncPaused: (p) => paused.push(p),
    tokens,
    engine,
  });

  check("the outcome is NOT signed_out", outcome.kind !== "signed_out", outcome.kind);
  check("the outcome names the failure", outcome.kind === "failed", outcome.kind);
  check("the delete really was attempted", tokens.cleared === 1);
  check(
    "THE TOKEN IS STILL HELD — the app must not act as if it is gone",
    (await tokens.load()) === "a-token",
  );
  check(
    "the engine gate was NOT reset — the session did not end",
    engine.cleared === 0,
  );
  check(
    "the sync tick was paused and then PUT BACK — a failed sign-out must not also stop syncing",
    paused.length === 2 && paused[0] === true && paused[1] === false,
    JSON.stringify(paused),
  );

  /*
   * NO FALLBACK. This used to read
   *   outcome.kind === "failed" ? outcome.failure : { kind: "clear_failed", reason: "" }
   * which meant the sheet below was rendered from an object THE PROOF invented
   * whenever the orchestration was broken — so these cells could never go red
   * from an orchestration defect, and the disproof left them green while the app
   * was signing people out over a keystore that had refused.
   *
   * Two lessons, both already paid for:
   * a-proof-fixture-must-be-a-row-the-product-could-produce (a fixture the
   * product did not produce proves something about the fixture) and
   * a-defaulted-getattr-is-a-silent-dead-branch (a default makes ABSENT
   * indistinguishable from a confident answer). It is the second one exactly:
   * `?:` cannot fail, so "signOut returned a failure" was never asserted here.
   *
   * Now it STOPS HARD. Everything below renders from the object signOut()
   * actually returned, so an orchestration defect takes the wording cells with
   * it rather than leaving them as false comfort.
   */
  if (outcome.kind !== "failed") {
    check(
      "S3 CANNOT CONTINUE: signOut() did not report a failure, so there is no"
        + " failure object to render — every wording check below is UNRUN, not passed",
      false,
      `outcome=${outcome.kind}`,
    );
    return;
  }
  const failure: SignOutFailure = outcome.failure;
  const text = signOutCardText(
    signOutCard({ owed: owedWith({ bill_send: 0 }), failed: 0, failure, session: "active" }),
  );
  console.log(`  sheet: ${text}`);
  check(
    "the sheet says the device is STILL SIGNED IN",
    text.includes("ยังเข้าสู่ระบบด้วยบัญชีเดิมอยู่"),
  );
  check("...and that it did not sign out", text.includes("ยังไม่ได้ออกจากระบบ"));
  check("...and offers a retry", text.includes("ลองอีกครั้ง"));
  check(
    "...and names the shop owner, never a support desk",
    text.includes("เจ้าของร้าน") && !text.includes("ฝ่ายสนับสนุน"),
  );
  check(
    "the keystore's diagnostic NEVER reaches the screen",
    !text.includes("errSecIO") && !text.includes("keychain"),
    failure.reason,
  );

  // The session state the app would still be in: signed in, not signed out.
  check(
    "the device's session state is unchanged (still active)",
    sessionStateOf({ token: "a-token", sessionEnded: false }) === "active",
  );
}

/* ------------------------------------------------------------------ S4 ------ */

async function s4NoRequestsAfterwards(): Promise<void> {
  header("S4: after a sign-out the tick issues ZERO requests, and nothing says expired");

  const dir = mkdtempSync(join(tmpdir(), "prove-signout-s4-"));
  const driver = await NodeSqliteDriver.open(join(dir, "recycle.db"));
  try {
    const store = await SqliteLocalStore.open(driver);
    await signInProofDevice(driver);
    const transport = new CountingTransport();
    const clock = new FakeClock("2026-08-06T01:00:00.000Z");
    const engine = new SyncEngine({ ...noSellerKind(), store, transport, clock });

    // A bill that then DRAINS, so the queue is empty and the gate lets us out.
    await createLocalBill(
      { clock, ids: new SeqIds("s4"), store },
      {
        seller: { kind: "server", seller_id: "seller-1" },
        vehicle_no: null,
        items: [],
        total_amount: "0.00",
        master_as_of: null,
      },
    PROOF_OWNER,
  );
    await engine.runOnce();
    check("the fixture drained before the sign-out", transport.sends === 1, `sends=${String(transport.sends)}`);

    const tokens = new MemoryTokenStore("a-token");
    let paused = false;
    const outcome = await signOut({
      owed: owedWith({ bill_send: 0 }),
      failed: 0,
      setSyncPaused: (p) => {
        paused = p;
      },
      tokens,
      engine,
    });
    check("signed out", outcome.kind === "signed_out", outcome.kind);

    // THE TICK, through the same predicate App.tsx calls.
    const token = CLEARED_SESSION.token;
    const before = transport.sends + transport.voids;
    let ticks = 0;
    for (let i = 0; i < 5; i += 1) {
      if (!maySync({ paused, token })) continue;
      ticks += 1;
      await engine.runOnce();
    }
    check("maySync refused every tick", ticks === 0, `${String(ticks)} ticks ran`);
    check(
      "ZERO requests were issued after the sign-out",
      transport.sends + transport.voids === before,
      `before=${String(before)} after=${String(transport.sends + transport.voids)}`,
    );

    // And the guard holds on each condition ALONE, so neither is carrying the
    // other: a paused tick with a token, and an unpaused tick with none.
    check("paused alone refuses a tick", !maySync({ paused: true, token: "a-token" }));
    check("no token alone refuses a tick", !maySync({ paused: false, token: null }));
    check("both clear allows a tick", maySync({ paused: false, token: "a-token" }));

    check(
      "the session renders signed_out, never expired",
      sessionStateOf({ token, sessionEnded: CLEARED_SESSION.sessionEnded }) === "signed_out",
    );
  } finally {
    await driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ----------------------------------------------------------------- S4b ------ */

/**
 * A PASS ALREADY IN FLIGHT WHEN THE OPERATOR TAPS.
 *
 * setSyncPaused gates the ENTRY of the next tick and nothing else — App.tsx:579
 * checks maySync, and App.tsx:581 then awaits engine.runOnce() to completion.
 * Nothing cancels or drains a pass that is already past that line.
 *
 * This case does not assert that the behaviour is right. It establishes WHAT
 * HAPPENS, because the answer decides whether anything needs to change, and a
 * race argued from reading the code is a race nobody has seen.
 */
async function s4bInFlightPass(): Promise<void> {
  header("S4b: a send already in flight when the user taps — what actually happens");

  const dir = mkdtempSync(join(tmpdir(), "prove-signout-s4b-"));
  const driver = await NodeSqliteDriver.open(join(dir, "recycle.db"));
  try {
    const store = await SqliteLocalStore.open(driver);
    await signInProofDevice(driver);
    const clock = new FakeClock("2026-08-06T02:00:00.000Z");

    // A transport whose send hangs until we let it go — a request on the wire
    // at the moment of the tap.
    let release: (() => void) | null = null;
    let started = 0;
    const transport: Transport = {
      sendBill: (): Promise<SendOutcome> => {
        started += 1;
        return new Promise<SendOutcome>((resolve) => {
          release = () => {
            resolve({ kind: "accepted", doc_no: "B-2569-99" });
          };
        });
      },
      voidBill: (): Promise<VoidOutcome> =>
        Promise.resolve({ kind: "voided", doc_no: "B-2569-99" }),
    };
    const engine = new SyncEngine({ ...noSellerKind(), store, transport, clock });

    await createLocalBill(
      { clock, ids: new SeqIds("s4b"), store },
      {
        seller: { kind: "server", seller_id: "seller-1" },
        vehicle_no: null,
        items: [],
        total_amount: "0.00",
        master_as_of: null,
      },
    PROOF_OWNER,
  );

    // The tick fires and reaches the wire. NOT awaited — this is the pass that
    // is in flight.
    const inFlight = engine.runOnce();
    for (let i = 0; i < 50 && started === 0; i += 1) await Promise.resolve();
    check("a send is genuinely on the wire before the tap", started === 1, `started=${String(started)}`);

    // THE TAP.
    const order: string[] = [];
    let paused = false;
    const outcome = await signOut({
      owed: owedWith({ bill_send: 0 }),
      failed: 0,
      setSyncPaused: (p) => {
        paused = p;
      },
      tokens: new MemoryTokenStore("a-token"),
      engine,
    });
    order.push(`signOut:${outcome.kind}`);
    check("the sign-out completes", outcome.kind === "signed_out", outcome.kind);
    check("the tick is paused", paused, `paused=${String(paused)}`);
    check(
      "the in-flight send is STILL UNRESOLVED — pausing did not cancel it",
      release !== null,
    );

    // The server answers, after the session has already ended on this device.
    (release as unknown as () => void)();
    const r = await inFlight;
    order.push("inFlight:resolved");

    console.log(`  order: ${order.join(" -> ")}`);
    check(
      "the pass RESOLVED AFTER the sign-out had completed",
      order[0] === "signOut:signed_out" && order[1] === "inFlight:resolved",
      order.join(" -> "),
    );
    check(
      "...and it reports a successful send — the input App feeds to setOnline/refresh",
      r.synced === 1,
      `synced=${String(r.synced)} attempted=${String(r.attempted)}`,
    );

    // And it really did write. lastSyncedAt is read out of THIS column by
    // refresh(), so a screen that says signed out would show a sync time from
    // after the sign-out.
    const synced = await store.listByState("synced");
    check(
      "the bill was marked synced in SQLite after the sign-out",
      synced.length === 1 && synced[0]?.synced_at !== null,
      `${String(synced.length)} synced, at=${synced[0]?.synced_at ?? "null"}`,
    );

    /*
     * AND NOW THE GUARD. App.tsx re-checks maySync AFTER the await, before it
     * writes anything, and drops the result when the session has gone. Modelled
     * here by calling the SAME predicate with the same post-sign-out inputs —
     * the predicate is shared code; only its placement lives in App.tsx.
     */
    const stillOurs = maySync({ paused, token: CLEARED_SESSION.token });
    check(
      "the post-await guard REFUSES this result — nothing in the strip moves",
      !stillOurs,
      `maySync=${String(stillOurs)}`,
    );

    // What the strip would have been given if the guard were absent. Recorded so
    // the cost of removing it is a number, not an adjective.
    console.log(
      `  had the guard been absent, the strip would have taken:` +
        ` online=true sessionEnded=false submitRefused=false` +
        ` (synced=${String(r.synced)} attempted=${String(r.attempted)})`,
    );

    check(
      "...while the SHOP'S DATA written inside runOnce STAYS — the bill really did send",
      synced.length === 1 && synced[0]?.doc_no === "B-2569-99",
      `doc_no=${synced[0]?.doc_no ?? "null"}`,
    );
  } finally {
    await driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ S8 ------ */

/**
 * sendForbidden, ON THE REAL ENGINE, BEHAVIOURALLY.
 *
 * S2 asserts that resetAfterSignOut() was CALLED, on a stub. That is an
 * assertion about the fixture: if the real reset forgot `sendForbidden`, nothing
 * there goes red — and the cost of that is the next user's bills silently
 * refusing to send, with no cause anywhere on the screen, because the gate is a
 * private field in memory and nothing renders it.
 *
 * So this case never mentions the field. It drives a genuine 403 through a real
 * SyncEngine until sends stop being attempted, signs out, and asserts a send is
 * attempted again — the only evidence that survives someone rewriting the
 * internals.
 */
async function s8SendForbiddenCleared(): Promise<void> {
  header("S8: a 403 gates the send loop; a sign-out un-gates it — on the REAL engine");

  const dir = mkdtempSync(join(tmpdir(), "prove-signout-s8-"));
  const driver = await NodeSqliteDriver.open(join(dir, "recycle.db"));
  try {
    const store = await SqliteLocalStore.open(driver);
    await signInProofDevice(driver);
    const clock = new FakeClock("2026-08-06T03:00:00.000Z");

    let attempts = 0;
    const transport: Transport = {
      sendBill: (): Promise<SendOutcome> => {
        attempts += 1;
        return Promise.resolve({
          kind: "forbidden",
          code: "admin_required",
          reason: "HTTP 403",
        });
      },
      voidBill: (): Promise<VoidOutcome> =>
        Promise.resolve({ kind: "voided", doc_no: "B-2569-1" }),
    };
    const engine = new SyncEngine({ ...noSellerKind(), store, transport, clock });

    const make = async (tag: string): Promise<void> => {
      await createLocalBill(
        { clock, ids: new SeqIds(tag), store },
        {
          seller: { kind: "server", seller_id: "seller-1" },
          vehicle_no: null,
          items: [],
          total_amount: "0.00",
          master_as_of: null,
        },
    PROOF_OWNER,
  );
    };

    await make("s8a");
    const r1 = await engine.runOnce();
    check(
      "the first bill IS attempted, and the server refuses this account",
      attempts === 1 && r1.forbidden === 1,
      `attempts=${String(attempts)} forbidden=${String(r1.forbidden)}`,
    );

    // A second bill, and time moved on, so nothing but the gate can hold it back.
    await make("s8b");
    clock.advance(60_000);
    const before = attempts;
    await engine.runOnce();
    await engine.runOnce();
    check(
      "with the gate up, NO further send is attempted — two whole passes, zero requests",
      attempts === before,
      `attempts ${String(before)} -> ${String(attempts)}`,
    );

    // THE SIGN-OUT.
    const outcome = await signOut({
      owed: owedWith({ bill_send: 0 }),
      failed: 0,
      setSyncPaused: () => undefined,
      tokens: new MemoryTokenStore("a-token"),
      engine,
    });
    check("signed out", outcome.kind === "signed_out", outcome.kind);

    clock.advance(60_000);
    await engine.runOnce();
    check(
      "AFTER the sign-out a send IS attempted again — the gate is down",
      attempts > before,
      `attempts ${String(before)} -> ${String(attempts)}`,
    );
    console.log(
      "  (nothing above names sendForbidden: the claim is what the engine DOES," +
        " so it survives the field being renamed or moved)",
    );
  } finally {
    await driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ S5 ------ */

async function s5DraftSurvives(): Promise<void> {
  header("S5: the draft AND the shop's master cache are STILL IN SQLITE — read back out");

  const dir = mkdtempSync(join(tmpdir(), "prove-signout-s5-"));
  const driver = await NodeSqliteDriver.open(join(dir, "recycle.db"));
  try {
    const drafts = await SqliteDraftStore.open(driver);
    const master = await SqliteMasterStore.open(driver);

    /*
     * SIGNED IN FIRST, because this case builds its own driver rather than
     * taking the shared harness's — the known shape recorded in OPEN_ITEMS.md,
     * met here for the first time on the MASTER store. Since P1.7 the cache is
     * stamped with the signed-in tenant, so a list saved with no identity
     * carries NULL and reads back as not-this-shop: this case would then be
     * asserting that sign-out preserved a cache that was never readable, which
     * is a green about the wrong thing.
     *
     * It also makes the case HARDER rather than easier. The sign-out under test
     * must now leave BOTH the rows and the identity that makes them legible —
     * and the identity is deliberately not cleared on sign-out today, which is
     * exactly the property the assertions below depend on.
     */
    await signInProofDevice(driver);

    /*
     * THE SHOP'S MASTER DATA. This is the direction that strands an offline
     * morning: a device that signs out and loses its products and sellers cannot
     * weigh anything at 07:00 with the server unreachable, and signing in — the
     * only way to get them back — needs the network it does not have.
     *
     * "We told it not to clear them" is not evidence that it did not. Every
     * assertion below reads the rows BACK OUT of SQLite after the sign-out, and
     * compares against values captured before it.
     */
    await master.saveProducts(
      [
        {
          id: "p-1",
          code: "FE-STEEL",
          name: "Steel scrap",
          uom_code: "KG",
          uom_name: "กิโลกรัม",
          prices: { A: "15.50", B: "15.00", C: "14.50", D: "14.00" },
        },
        {
          id: "p-2",
          code: "AL-CAN",
          name: "อลูมิเนียมกระป๋อง",
          uom_code: "KG",
          uom_name: "กิโลกรัม",
          prices: { A: "45.00", B: "44.00", C: "43.00", D: "42.00" },
        },
      ],
      "2026-08-06T00:30:00.000Z",
    );
    await master.saveSellers(
      [
        { id: "seller-1", code: "S001", name: "สมชาย ใจดี", phone: "0800000001", grade: "B" },
        { id: "seller-2", code: "S002", name: "ร้านรับซื้อ พี่แดง", phone: null, grade: "A" },
      ],
      "2026-08-06T00:31:00.000Z",
    );

    // Raw row counts, straight off the tables the sign-out must not touch —
    // not the store's own view of them.
    const rawCount = async (table: string): Promise<number> => {
      const rows = await driver.all<{ n: number }>(`SELECT count(*) AS n FROM ${table}`);
      return rows[0]?.n ?? -1;
    };
    const before = {
      products: await rawCount("cached_products"),
      sellers: await rawCount("cached_sellers"),
      stamps: await rawCount("master_cache"),
      snapshot: await master.load(),
    };
    console.log(
      `  before: cached_products=${String(before.products)}` +
        ` cached_sellers=${String(before.sellers)} master_cache=${String(before.stamps)}`,
    );
    const draft: Draft = {
      id: "d-s5",
      seller_id: "seller-1",
      vehicle_no: "กท 1234",
      next_seq: 2,
      lines: [
        {
          id: "l-1",
          seq: 1,
          product_id: "p-1",
          product_code: "FE-STEEL",
          product_name: "Steel scrap",
          uom_code: "KG",
          gross_weight: "10.000",
          tare_weight: "0.000",
          net_weight: "10.000",
          unit_price: "15.00",
          list_price: "15.00",
          amount: "150.00",
        },
      ],
      form: { product_id: null, gross: "", tare: "", price: "" },
      updated_at: "2026-08-06T01:00:00.000Z",
      master_as_of: null,
    };
    await drafts.save(draft, PROOF_OWNER);

    const outcome = await signOut({
      owed: owedWith({ bill_send: 0 }),
      failed: 0,
      setSyncPaused: () => undefined,
      tokens: new MemoryTokenStore("a-token"),
      engine: null,
    });
    check("signed out", outcome.kind === "signed_out", outcome.kind);

    // Read it BACK OUT of the database. Not "we did not call delete" — the row.
    const after = (await drafts.load()).draft;
    check("a draft is still there", after !== null);
    check("it is the SAME draft", after?.id === "d-s5", after?.id ?? "null");
    check("with its line intact", after?.lines.length === 1, String(after?.lines.length));
    check(
      "and the weight and money untouched, digit for digit",
      after?.lines[0]?.net_weight === "10.000" && after?.lines[0]?.amount === "150.00",
      `${after?.lines[0]?.net_weight ?? "?"} / ${after?.lines[0]?.amount ?? "?"}`,
    );
    console.log("  (a draft surviving a change of USER is R5's question — see OPEN_ITEMS.md)");

    /* ---- the shop's master cache, read back out of the three tables ---- */
    const afterRows = {
      products: await rawCount("cached_products"),
      sellers: await rawCount("cached_sellers"),
      stamps: await rawCount("master_cache"),
    };
    console.log(
      `  after : cached_products=${String(afterRows.products)}` +
        ` cached_sellers=${String(afterRows.sellers)} master_cache=${String(afterRows.stamps)}`,
    );

    check(
      "cached_products still holds every row",
      afterRows.products === before.products && afterRows.products === 2,
      `${String(before.products)} -> ${String(afterRows.products)}`,
    );
    check(
      "cached_sellers still holds every row",
      afterRows.sellers === before.sellers && afterRows.sellers === 2,
      `${String(before.sellers)} -> ${String(afterRows.sellers)}`,
    );
    check(
      "master_cache still holds both fetch stamps",
      afterRows.stamps === before.stamps && afterRows.stamps === 2,
      `${String(before.stamps)} -> ${String(afterRows.stamps)}`,
    );

    const snap = await master.load();
    /*
     * BY CODE, NOT BY POSITION. The first draft of these two checks indexed
     * products[0] and products[1] and went RED on values that were in fact
     * byte-identical (before=44.00 after=44.00), because
     * SqliteMasterStore.load() sorts `ORDER BY code, id` — so index 0 is AL-CAN,
     * not the FE-STEEL that was written first. A positional assertion was
     * measuring the sort order, which is the same shape as the count assertions
     * lessons/proof-must-run-twice.md is about.
     */
    const priceOf = (
      s: { products: readonly { code: string; prices: Record<string, string> }[] },
      code: string,
      grade: string,
    ): string | undefined => s.products.find((p) => p.code === code)?.prices[grade];

    check(
      "a PRICE is byte-identical before and after — the tier map survived intact",
      priceOf(snap, "FE-STEEL", "B") === "15.00" &&
        priceOf(snap, "FE-STEEL", "B") === priceOf(before.snapshot, "FE-STEEL", "B"),
      `FE-STEEL/B before=${priceOf(before.snapshot, "FE-STEEL", "B") ?? "?"}` +
        ` after=${priceOf(snap, "FE-STEEL", "B") ?? "?"}`,
    );
    check(
      "...and so is a second product's, so this is not one lucky row",
      priceOf(snap, "AL-CAN", "A") === "45.00" &&
        priceOf(snap, "AL-CAN", "A") === priceOf(before.snapshot, "AL-CAN", "A"),
      `AL-CAN/A before=${priceOf(before.snapshot, "AL-CAN", "A") ?? "?"}` +
        ` after=${priceOf(snap, "AL-CAN", "A") ?? "?"}`,
    );
    check(
      "every product's WHOLE tier map is unchanged, not just the two spot-checked",
      JSON.stringify(snap.products) === JSON.stringify(before.snapshot.products),
      `${String(snap.products.length)} products compared whole`,
    );
    check(
      "the sellers came back whole, grades included",
      JSON.stringify(snap.sellers) === JSON.stringify(before.snapshot.sellers) &&
        snap.sellers.find((s) => s.code === "S001")?.grade === "B",
      `${String(snap.sellers.length)} sellers, S001 grade=` +
        `${snap.sellers.find((s) => s.code === "S001")?.grade ?? "?"}`,
    );
    check(
      "the FETCH STAMPS did not move — the cache is not silently 'never fetched'",
      snap.productsFetchedAt === "2026-08-06T00:30:00.000Z" &&
        snap.sellersFetchedAt === "2026-08-06T00:31:00.000Z",
      `${snap.productsFetchedAt ?? "null"} / ${snap.sellersFetchedAt ?? "null"}`,
    );
    console.log(
      "  (a stamp reset to null would read as 'never fetched' and block the price default —" +
        " the offline morning failing quietly rather than loudly)",
    );
  } finally {
    await driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ S6 ------ */

/**
 * THE WHOLE SHEET, TOP TO BOTTOM, AS ONE STRING.
 *
 * The N2b discipline. Every other check above reads one property of one card;
 * this one reads what the operator's eye actually travels over, in the order the
 * view draws it — title, then every line, then every button label. A sheet whose
 * parts are each correct and which contradicts itself as a whole is a failure
 * this project has already shipped once.
 */
function s6WholeSheet(): void {
  header("S6: the whole sheet as ONE string, in draw order");

  // Annotated with the REAL input type rather than inferred: a field added to
  // SignOutCardInput is then a compile error in this list too, instead of these
  // cells quietly measuring a card built from fewer inputs than the screen's.
  const cells: readonly {
    name: string;
    input: SignOutCardInput;
    /**
     * DOES THIS CELL'S SHEET SAY THE SESSION RAN OUT? Stated per cell, in both
     * directions, rather than re-derived from the branch conditions here — a
     * checker that recomputes the rule it is checking can only prove the code
     * equals itself (lessons/a-checker-must-not-share-the-code-it-checks.md).
     *
     * It is THREE-WAY and not "expired or not": หมดเวลา is true of an expired
     * session, false of a device that has never signed in this launch (that one
     * says ยังไม่ได้เข้าสู่ระบบ), and false of a working one. It is also false
     * whenever a higher-ranked branch owns the card — a failed clear outranks
     * everything, and an empty queue is the confirmation.
     */
    saysExpired: boolean;
  }[] = [
    {
      name: "confirm, clean queue",
      input: { owed: owedWith({ bill_send: 0 }), failed: 0, failure: null, session: "active" },
      saysExpired: false,
    },
    {
      name: "confirm, failed bills",
      input: { owed: owedWith({ bill_send: 0 }), failed: 2, failure: null, session: "active" },
      saysExpired: false,
    },
    {
      name: "refused, pending",
      input: { owed: owedWith({ bill_send: 3 }), failed: 0, failure: null, session: "active" },
      saysExpired: false,
    },
    {
      name: "refused, pending+failed",
      input: { owed: owedWith({ bill_send: 3 }), failed: 2, failure: null, session: "active" },
      saysExpired: false,
    },
    {
      name: "clear failed",
      input: {
        owed: owedWith({ bill_send: 0 }),
        failed: 0,
        failure: { kind: "clear_failed", reason: "errSecIO" } as SignOutFailure,
        session: "active",
      },
      saysExpired: false,
    },
    {
      name: "clear failed, with a queue that grew meanwhile",
      input: {
        owed: owedWith({ bill_send: 3 }),
        failed: 1,
        failure: { kind: "clear_failed", reason: "errSecIO" } as SignOutFailure,
        session: "active",
      },
      saysExpired: false,
    },
    /* ---- R2b. The session is now an input, so the matrix has a second axis. -- */
    {
      name: "refused, pending, session EXPIRED",
      input: { owed: owedWith({ bill_send: 3 }), failed: 0, failure: null, session: "expired" },
      saysExpired: true,
    },
    {
      name: "refused, pending+failed, session EXPIRED",
      input: { owed: owedWith({ bill_send: 3 }), failed: 2, failure: null, session: "expired" },
      saysExpired: true,
    },
    {
      // NOT reachable with this sheet open (App.tsx offers the button only while
      // `token !== null`) and written anyway, because the wording differs: a
      // device that never signed in has not run out of time.
      name: "refused, pending, session SIGNED OUT",
      input: { owed: owedWith({ bill_send: 3 }), failed: 0, failure: null, session: "signed_out" },
      saysExpired: false,
    },
    {
      // The RANKING under a dead session: a failed clear still outranks it, so
      // this card must say nothing about an expiry at all.
      name: "clear failed WHILE the session is expired",
      input: {
        owed: owedWith({ bill_send: 3 }),
        failed: 0,
        failure: { kind: "clear_failed", reason: "errSecIO" } as SignOutFailure,
        session: "expired",
      },
      saysExpired: false,
    },
    {
      // An expired session with an EMPTY queue is the confirmation branch: there
      // is nothing owed, so signing out is allowed and the expiry is not the
      // operator's problem on this screen.
      name: "confirm, clean queue, session EXPIRED",
      input: { owed: owedWith({ bill_send: 0 }), failed: 0, failure: null, session: "expired" },
      saysExpired: false,
    },
  ];

  for (const c of cells) {
    const card = signOutCard(c.input);
    const text = signOutCardText(card);
    console.log(`  [${c.name}]\n    ${text}`);

    check(
      `${c.name}: no card promises a sign-out AND says it did not happen`,
      !(text.includes("ยังไม่ได้ออกจากระบบ") && text.includes("ออกจากระบบ?")),
      text,
    );
    check(
      `${c.name}: no diagnostic leaks`,
      !/errSecIO|keychain|HTTP|undefined|null|\{|\}/.test(text),
      text,
    );
    /*
     * SCOPED PER CELL, NEVER DELETED. This was `!text.includes("หมดเวลา")` on
     * every cell, and it was right while the sheet had no session input: the
     * card could not know about an expiry, so claiming one was always false.
     * Now that it CAN know, the check must not be dropped — it is the only
     * thing stopping the ACTIVE branch from claiming an expiry that has not
     * happened, which is the defect this phase removes pointed the other way.
     * So it asserts the cell's own expectation, in both directions.
     */
    check(
      `${c.name}: says the session ran out exactly when this cell's did`,
      text.includes("หมดเวลา") === c.saysExpired,
      `expected=${String(c.saysExpired)} text=${text}`,
    );
    check(
      `${c.name}: never sends anyone to a support desk`,
      !text.includes("ฝ่ายสนับสนุน"),
      text,
    );
    check(`${c.name}: the sheet is not empty`, card.lines.length > 0 && text.length > 20);
  }

  // The one sentence that must be on the sheet BEFORE the tap, on every path
  // where a sign-out can actually be started from.
  const confirm = signOutCardText(
    signOutCard({ owed: owedWith({ bill_send: 0 }), failed: 0, failure: null, session: "active" }),
  );
  check(
    "the CONFIRMATION warns that signing back in needs a connection, before the tap",
    confirm.includes("ต้องใช้อินเทอร์เน็ต"),
    confirm,
  );
  check(
    "...and that the shop's product and seller lists stay on the device",
    confirm.includes("ยังอยู่ในเครื่อง"),
  );
  // A failure card must outrank a queue count: the operator has already tapped.
  const both = signOutCard({
    owed: owedWith({ bill_send: 3 }),
    failed: 0,
    failure: { kind: "clear_failed", reason: "x" },
    session: "active",
  });
  check(
    "a failed attempt outranks a queue count on the same sheet",
    both.title === "ออกจากระบบไม่สำเร็จ",
    both.title,
  );

  /*
   * THE THIRD WAY, asserted positively rather than left as the absence checked
   * above. "never signed in" and "signed in, then it ran out" are different
   * facts to an operator mid-shift, and statusNotice.ts already draws them with
   * different words; a sheet that said neither, or said the same one for both,
   * would pass a check that only bans the wrong word.
   */
  const neverSignedIn = signOutCardText(
    signOutCard({ owed: owedWith({ bill_send: 3 }), failed: 0, failure: null, session: "signed_out" }),
  );
  check(
    "a device that never signed in is told THAT, not that its time ran out",
    neverSignedIn.includes("ยังไม่ได้เข้าสู่ระบบ") && !neverSignedIn.includes("หมดเวลา"),
    neverSignedIn,
  );
  /*
   * THE NEEDLE MOVED IN P1.8b AND THE CLAIM DID NOT, which is the only reason
   * it is edited rather than argued with.
   *
   * The sentence read `บิลยังอยู่ครบ` and now reads `งานที่ค้างอยู่ยังอยู่ครบ`.
   * It has no count and it is drawn under the per-kind lines, so once the gate
   * could refuse over a SELLER it was naming the wrong subject — the refusal
   * might be about no bill at all. `ยังอยู่ครบ` is the word `signOutNotice.ts`
   * shares with the strip, and it is unchanged; the strip keeps `บิล N ใบ`
   * because its input really is bills.
   */
  check(
    "...and it is still told the owed work is intact and what releases it",
    neverSignedIn.includes("งานที่ค้างอยู่ยังอยู่ครบ") &&
      neverSignedIn.includes("ด้วยบัญชีเดิม"),
    neverSignedIn,
  );
}

/* ------------------------------------------------------------------ S9 ------ */

/**
 * R2b: THE SHEET READS THE SESSION, AND THE COUNT IS MEASURED RATHER THAN PASSED.
 *
 * WHY THIS IS NOT MORE ASSERTIONS INSIDE S1. S1 hands signOut() `pending: 3`
 * with `engine: null`. That proves the gate refuses a NUMBER; it cannot prove
 * the number is UNCLEARABLE, because nothing in S1 can make it move — which is
 * what lessons/a-check-that-never-went-red-was-never-observed.md records against
 * this file by name. And the defect exists only in a COMPOSITION no proof owned:
 * proveSync case 11 drives a real 401 and never mentions sign-out, S1 drives
 * sign-out and never mentions 401, so the queue-that-cannot-drain under a sheet
 * telling the operator to wait was invisible to both while both were green
 * (lessons/two-green-proofs-do-not-cover-the-seam.md). It is driven here in ONE
 * run, against the real SyncEngine and a real SqliteLocalStore.
 *
 * BOTH DIRECTIONS, FROM THE SAME MEASURED COUNT, and that pairing is the whole
 * design. A dead session and a plain outage leave the identical `pending`, so
 * the count cannot be what selects the wording. Hardcoding the new sentences
 * into both branches turns the active half red; deleting the active half would
 * make the dead half unfalsifiable.
 *
 * AND THE SESSION IS NOW DERIVED TOO, WHICH IT WAS NOT WHEN THIS CASE LANDED.
 * `pending` was measured off a real store from the first version; `session` was
 * typed in as "expired" and "active", so the one link R2b created — the sheet
 * depending on session state — was exercised by nothing, and the label 100 lines
 * below claiming "the halves differ in the ENGINE, not only in what is passed to
 * the card" was the claim not established. Both halves now go
 * run -> sessionEndedAfterPass -> sessionStateOf -> signOutCard, through the same
 * two functions App.tsx calls, so a wrong fold reaches the sheet instead of
 * being papered over by a literal that agreed with it.
 *
 * WHAT THIS STILL DOES NOT COVER: HttpTransport's own 401 -> session_expired
 * mapping (proveSync owns it), and the handset. Green here is not the device.
 */
async function s9SessionDrivesTheSheet(): Promise<void> {
  header("S9: a queue that CANNOT drain, and the sheet that says why (R2b)");

  const deadDir = mkdtempSync(join(tmpdir(), "prove-signout-s9d-"));
  const liveDir = mkdtempSync(join(tmpdir(), "prove-signout-s9a-"));
  const deadDriver = await NodeSqliteDriver.open(join(deadDir, "recycle.db"));
  const liveDriver = await NodeSqliteDriver.open(join(liveDir, "recycle.db"));

  try {
    /* ---- THE DEAD HALF: the server answers, and refuses the caller ---- */

    const store = await SqliteLocalStore.open(deadDriver);
    await signInProofDevice(deadDriver);
    const server = new FakeServer();
    const transport = new ExpiredSessionTransport(server);
    const clock = new FakeClock("2026-08-07T04:16:00.000Z");
    const engine = new SyncEngine({ ...noSellerKind(), store, transport, clock });

    const ids = new SeqIds("s9d");
    const queued: string[] = [];
    for (let i = 0; i < 2; i += 1) {
      const bill = await createLocalBill(
        { clock, ids, store },
        {
          seller: { kind: "server", seller_id: "seller-1" },
          vehicle_no: null,
          items: [],
          total_amount: "880.00",
          master_as_of: null,
        },
    PROOF_OWNER,
  );
      queued.push(bill.id);
    }

    const run = await engine.runOnce();
    const snap = await store.pendingQueueSnapshot();
    console.log(
      `  401 pass -> sessionExpired=${String(run.sessionExpired)} synced=${String(run.synced)}` +
        ` onServer=${String(server.billCount)} pendingCount=${String(snap.pendingCount)}`,
    );

    check(
      "the pass reports a SESSION problem — not an outage, not a rejection",
      run.sessionExpired >= 1 && run.synced === 0 && run.rejected === 0,
      `run=${JSON.stringify(run)}`,
    );
    check(
      "NOTHING reached the server — the queue is demonstrably undrainable, not assumed so",
      server.billCount === 0,
      `onServer=${String(server.billCount)}`,
    );
    check(
      "both bills are still queued, and the count is READ from the store",
      snap.pendingCount === 2,
      `pendingCount=${String(snap.pendingCount)}`,
    );

    /*
     * THE MEASURED COUNT. Every assertion below is driven by this value and
     * never by a literal — that difference from S1 is the point of the case.
     */
    const pending = snap.pendingCount;

    const tokens = new MemoryTokenStore("a-token");
    let paused = false;
    const refused = await signOut({
      owed: owedWith({ bill_send: pending }),
      failed: 0,
      setSyncPaused: (p) => {
        paused = p;
      },
      tokens,
      engine,
    });
    check(
      "the gate refuses the sign-out on the MEASURED count",
      refused.kind === "refused_pending",
      refused.kind,
    );
    check(
      "...and a refusal still changes nothing: token held, tick never paused",
      (await tokens.load()) === "a-token" && paused === false,
      `paused=${String(paused)}`,
    );

    /*
     * THE SESSION, DERIVED FROM THIS PASS — not typed in beside a measured
     * count. `token` stays a literal deliberately: it is the same value asserted
     * at "token held" above, and WHO the caller is was never the hand-typed
     * input this case was missing. What was missing is the fold from the run.
     */
    const deadSession = sessionStateOf({
      token: "a-token",
      sessionEnded: sessionEndedAfterPass(false, run),
    });
    check(
      "the session the sheet is given is DERIVED from the 401 pass, and it is expired",
      deadSession === "expired",
      deadSession,
    );

    const deadCard = signOutCard({
      owed: owedWith({ bill_send: pending }),
      failed: 0,
      failure: null,
      session: deadSession,
    });
    const deadText = signOutCardText(deadCard);
    console.log(`  sheet (expired): ${deadText}`);

    check(
      "the sheet does NOT tell the operator to wait for the queue to finish",
      !deadText.includes("รอให้ส่งครบก่อน"),
      deadText,
    );
    check(
      "...and does NOT promise the bills go by themselves in seconds",
      !deadText.includes("ไม่กี่วินาที"),
      deadText,
    );
    check("...it names the expiry, in statusNotice's word", deadText.includes("หมดเวลา"), deadText);
    check(
      "...and names the account that releases them",
      deadText.includes("ด้วยบัญชีเดิม"),
      deadText,
    );
    check(
      "...and carries the sign-in button, which is the only exit that exists",
      deadCard.actions.some((a) => a.kind === "sign_in"),
      deadCard.actions.map((a) => a.kind).join(","),
    );
    check(
      "...and the count it prints is the one the STORE reported, not a literal",
      deadText.includes(`มีบิลรอส่งขึ้นระบบ ${String(pending)} ใบ`),
      deadText,
    );

    /* ---- THE SHEET'S CLAIM, MEASURED rather than asserted about itself ---- */

    transport.signIn();
    // The real path: App.tsx's signIn() calls resumeAfterSignIn before the next
    // pass, because every backoff on this queue was computed while there was no
    // usable session. Advancing the clock instead would prove something else.
    const freed = await engine.resumeAfterSignIn();
    const drained = await engine.runUntilQuiescent();
    const after = await Promise.all(queued.map((id) => store.getBill(id)));
    const snapAfter = await store.pendingQueueSnapshot();
    console.log(
      `  after sign-in -> freed=${String(freed)} synced=${String(drained.synced)}` +
        ` onServer=${String(server.billCount)} pendingCount=${String(snapAfter.pendingCount)}`,
    );

    check("signing in freed the backoff the 401 had set", freed >= 1, `freed=${String(freed)}`);
    check(
      "THE SAME bills then drain — so the sentence the sheet prints is true",
      after.every((b) => b?.sync_state === "synced") &&
        server.billCount === 2 &&
        snapAfter.pendingCount === 0,
      `states=${JSON.stringify(after.map((b) => b?.sync_state ?? "gone"))} onServer=${String(server.billCount)}`,
    );
    check(
      "...and every bill the server holds is one this device queued BEFORE the sign-in",
      queued.every((id) => server.hasBillId(id)),
      queued.join(","),
    );
    const nowAllowed = await signOut({
      owed: owedWith({ bill_send: snapAfter.pendingCount }),
      failed: 0,
      setSyncPaused: () => undefined,
      tokens: new MemoryTokenStore("a-token"),
      engine,
    });
    check(
      "and the sign-out the sheet refused is now permitted — the loop it describes closes",
      nowAllowed.kind === "signed_out",
      nowAllowed.kind,
    );

    /* ---- THE ACTIVE HALF: same rig, a phone that is merely offline ---- */

    const liveStore = await SqliteLocalStore.open(liveDriver);
    await signInProofDevice(liveDriver);
    const liveClock = new FakeClock("2026-08-07T04:16:00.000Z");
    const liveEngine = new SyncEngine({ ...noSellerKind(),
      store: liveStore,
      transport: new OfflineTransport(),
      clock: liveClock,
    });
    const liveIds = new SeqIds("s9a");
    for (let i = 0; i < 2; i += 1) {
      await createLocalBill(
        { clock: liveClock, ids: liveIds, store: liveStore },
        {
          seller: { kind: "server", seller_id: "seller-1" },
          vehicle_no: null,
          items: [],
          total_amount: "880.00",
          master_as_of: null,
        },
    PROOF_OWNER,
  );
    }

    const liveRun = await liveEngine.runOnce();
    const liveSnap = await liveStore.pendingQueueSnapshot();
    console.log(
      `  offline pass -> retryable=${String(liveRun.retryable)}` +
        ` sessionExpired=${String(liveRun.sessionExpired)} pendingCount=${String(liveSnap.pendingCount)}`,
    );

    check(
      "this pass is an OUTAGE, not a session problem — the halves differ in the ENGINE, not only in what is passed to the card",
      liveRun.retryable >= 1 && liveRun.sessionExpired === 0,
      `run=${JSON.stringify(liveRun)}`,
    );
    check(
      "...and it leaves the SAME measured count the dead half left",
      liveSnap.pendingCount === pending,
      `offline=${String(liveSnap.pendingCount)} dead=${String(pending)}`,
    );

    /*
     * DERIVED THE SAME WAY, and this half is the one that pins the THIRD arm.
     * An outage tells the fold nothing about the caller, so it returns the
     * belief it was handed — which is why `wasEnded` is a parameter at all, and
     * why both directions of it are asserted below rather than one.
     */
    const liveSession = sessionStateOf({
      token: "a-token",
      sessionEnded: sessionEndedAfterPass(false, liveRun),
    });
    check(
      "the OUTAGE pass derives an ACTIVE session — it did not invent an expiry",
      liveSession === "active",
      liveSession,
    );
    check(
      "...and the same pass cannot CLEAR one either: handed an expired belief, it keeps it",
      sessionEndedAfterPass(true, liveRun) === true,
      `sessionEndedAfterPass(true, liveRun)=${String(sessionEndedAfterPass(true, liveRun))}`,
    );

    const liveCard = signOutCard({
      owed: owedWith({ bill_send: liveSnap.pendingCount }),
      failed: 0,
      failure: null,
      session: liveSession,
    });
    const liveText = signOutCardText(liveCard);
    console.log(`  sheet (active) : ${liveText}`);

    check(
      "with a WORKING session the wait sentence is correct, and stays",
      liveText.includes("รอให้ส่งครบก่อน"),
      liveText,
    );
    check("...with the reason the wait is short", liveText.includes("ไม่กี่วินาที"), liveText);
    check("...it does NOT claim the session expired", !liveText.includes("หมดเวลา"), liveText);
    check(
      "...and offers NO sign-in: signing in fixes nothing here, and the button would be a wrong instruction",
      !liveCard.actions.some((a) => a.kind === "sign_in"),
      liveCard.actions.map((a) => a.kind).join(","),
    );

    /*
     * THE CONTROL THAT MAKES BOTH HALVES MEAN SOMETHING. Identical measured
     * count, opposite sheets. A sentence hardcoded into both branches — the way
     * the offline sentence WAS in both until R2b — cannot survive this line.
     */
    check(
      "the two sheets DIFFER although the measured count is identical, so the count is not what chose the wording",
      deadText !== liveText,
      `pending=${String(pending)} on both`,
    );
  } finally {
    await deadDriver.close();
    await liveDriver.close();
    rmSync(deadDir, { recursive: true, force: true });
    rmSync(liveDir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ S7 ------ */

/**
 * PRINTED TEXT, NOT ASSERTIONS, AND IT MUST NOT BECOME ASSERTIONS. This records
 * a manual experiment. Rewriting it as check() calls would claim the deletion is
 * re-run on every pass, which it is not — the same lie as the runbook this
 * replaced, in the opposite direction. It is dated because it decays: it
 * describes the code as it stood that day.
 */
function s7Disproof(): void {
  header("S7: THE DISPROOF — MEASURED on 2026-08-06, not a runbook");

  console.log(`  What was deleted, from src/session/signOut.ts in signOut():

      if (outcome.kind === "failed") {
        deps.setSyncPaused(false);
        return { kind: "failed", failure: { kind: "clear_failed", reason: outcome.reason } };
      }

  Without it a keystore that refused to delete the token falls through to
  signed_out, the app applies CLEARED_SESSION, and the yard is shown the login
  screen while the Keychain still holds a working credential — which the next
  cold start's load() would restore, signing the DEPARTED user back in.

  IT TOOK THREE EDITS, NOT ONE — THE COMPILER FORCED THE OTHER TWO. Deleting the
  branch alone does not build; the proof never ran:
    src/session/signOut.ts(268,9): error TS6133: 'outcome' is declared but its
    value is never read.
  Dropping the now-unused binding does not build either:
    src/session/signOut.ts(40,15): error TS6196: 'ClearOutcome' is declared but
    never used.
  Only with the type import dropped as well does the removal compile. So
  noUnusedLocals is a real first gate here: a HALF-deleted branch cannot produce
  a binary at all. The version of this text that stood before the measurement
  said "delete that branch and S3 must go RED" — describing a removal that does
  not compile.

  WITH ALL THREE EDITS APPLIED: exit 1, 5 CHECK(S) FAILED, ALL FIVE IN S3.

    [FAIL] the outcome is NOT signed_out — signed_out
    [FAIL] the outcome names the failure — signed_out
    [FAIL] the engine gate was NOT reset — the session did not end
    [FAIL] the sync tick was paused and then PUT BACK — [true]
    [FAIL] S3 CANNOT CONTINUE: signOut() did not report a failure ...
           and the six wording cells under it did NOT run, which is the hard
           stop doing its job rather than leaving them green on an invented
           failure object.

  TWO S3 CELLS STAYED GREEN, and neither is evidence about this branch: "the
  delete really was attempted" (clear() is called either way) and "THE TOKEN IS
  STILL HELD" (FailingTokenStore never drops it, whatever signOut concludes).
  Neither sits downstream of the branch, so neither could have moved.

  S1, S2, S4, S4b, S8, S5 and S6 all stayed GREEN — none exercises a failing
  keystore. That split is the point: this proof says WHICH guard is missing, not
  merely that something is wrong.

  signOut.ts was then restored by copy from a backup outside the repo tree and
  verified byte-identical (SHA-256 7A04CE36...F65516, 13773 bytes), after which
  this proof was green twice bare and both typecheck programs exited 0.`);
}

/* ----------------------------------------------------------------- main ----- */

async function main(): Promise<number> {
  await s1RefusedWhilePending();
  await s2SignedOut();
  await s3ClearFails();
  await s4NoRequestsAfterwards();
  await s4bInFlightPass();
  await s8SendForbiddenCleared();
  await s5DraftSurvives();
  s6WholeSheet();
  await s9SessionDrivesTheSheet();
  s7Disproof();

  header("RESULT");
  console.log(
    "  NOT PROVEN HERE: SecureTokenStore.clear() itself. expo-secure-store cannot",
  );
  console.log(
    "  run under node, so the real delete is exercised only by a DEVICE pass.",
  );
  console.log(
    "  THAT PASS HAS BEEN RUN, on both platforms, and this proof is unchanged by",
  );
  console.log(
    "  it: iOS 2026-08-06 (real iPhone, R1b, evidence off the screen); Android",
  );
  console.log(
    "  2026-08-12 (one vivo 1938, this project's DEBUG build at 9d2eb22, NOT Expo",
  );
  console.log(
    "  Go) — the stored entry counted 1 then 0, then a cold start drew the login",
  );
  console.log(
    "  screen. STILL UNPROVEN EVERYWHERE: a keystore that REFUSES to delete. S3",
  );
  console.log(
    "  above uses a throwing fake; no real store has been made to fail, on either",
  );
  console.log(
    "  platform, and no release build of this app exists on either.",
  );
  if (failures > 0) {
    console.log(`\n  ${String(failures)} CHECK(S) FAILED`);
    return 1;
  }
  console.log("\n  ALL CASES PASSED");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
