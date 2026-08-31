/**
 * P1.8b GATES (commit 1) proof: THE SEAM BETWEEN THE OUTBOX AND THE SURFACES.
 *
 * Run: npm run prove:owedsurfaces
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS AT ALL, AND WHY IT IS NOT A SECTION IN ONE OF THE OTHERS
 * ---------------------------------------------------------------------------
 * `proveSellerKind` knows everything about the `seller_create` kind and has
 * never heard of a sign-out. `proveSignOut` knows everything about the sign-out
 * gate and has never heard of a kind. Measured with `git grep -c` against the
 * COMMITTED BLOBS at `0aed50f`, so the figures name an object and not a working
 * tree, both directions, each with a positive control in the same pass:
 *
 *     "signOut"    in proveSellerKind.ts  ->  0   (no match, status 1)
 *     "OutboxKind" in proveSignOut.ts     ->  0   (no match, status 1)
 *     CONTROL "OutboxKind" in proveSellerKind.ts ->  2
 *     CONTROL "SyncEngine" in proveSignOut.ts    ->  8
 *
 * The two controls are what make the two zeros evidence about the FILES rather
 * than about an instrument that never looked: the same command, in the same
 * pass, finds both needles where they live.
 *
 * Zero both ways is an unproven seam, and it is the SAME measurement, on the
 * same pair of files, that
 * `lessons/two-green-proofs-do-not-cover-the-seam.md` records as the strongest
 * instance this repository has. The defect it names lived exactly here: two
 * correct halves composing into a screen that lies. So this file has no
 * component of its own — it drives the REAL registry, the REAL runner, the REAL
 * SQLite stores, the REAL gate and all three renderers IN ONE RUN, and asserts
 * what the operator ends up looking at.
 *
 * A test that has no obvious file is the test most likely never to exist. This
 * is that file, and compositions are what it owns.
 *
 * Sections are named for the criteria they carry
 * (`ROADMAP.md § P1.8`, "THE SELLER-KIND CRITERIA, DERIVED FROM THE DESIGN
 * ABOVE"):
 *
 *   W0  the owed map's key set EQUALS the registry's member set
 *   W1  EVERY-SURFACE-SEES-A-KIND-THAT-IS-NOT-A-BILL — the HEADLESS parts of
 *       its one staging: the gate, the sheet, the strip, the control staging,
 *       the gate/sheet equality, and the re-scoped completeness claim
 *   W2  its RED CASE, NAMED: the bill-only statement used unchanged
 *   W3  the gate and the sheet disagreeing, which SHIPPED — one parked bill
 *   W4  a void that can never be applied does not hold the gate shut, and one
 *       that can does
 *   W5  the seam driven end to end: owed, refused, one pass, permitted
 *   W6  every registry member has its OWN sentence, enumerated from the
 *       registry rather than from a list somebody wrote
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT COVER, SAID BEFORE ANYONE READS IT AS COMPLETE
 * ---------------------------------------------------------------------------
 * THE HANDSET HALF. `EVERY-SURFACE-SEES-A-KIND-THAT-IS-NOT-A-BILL` is labelled
 * *(HANDSET, plus HEADLESS for the contract)*, and its parts (2) and (3) ask for
 * the sheet and the strip to be READ ON THE HANDSET and reported verbatim. What
 * is asserted here is the pure renderer's output, byte for byte, from state
 * reached through the real stores. That is the contract half. **No device pass
 * is claimed by this file**, and until one is run, nothing here is evidence
 * about what a phone draws — `CLAUDE.md § Boot check` "WHICH BUNDLE THE HANDSET IS RUNNING".
 *
 * THE BILL PARK. Nothing here stages a bill waiting on an uncreated seller;
 * that is the next commit, and `A-BILL-BEHIND-AN-UNCREATED-SELLER-IS-NEVER-OFFERED`
 * is not asserted in any weaker form.
 *
 * THE RESERVE LEVEL ON SCREEN, the tone, and the picker union are S10's rework
 * and are not touched.
 *
 * ON THE OUTPUT. Mostly Thai. Mojibake in the console is the console — this box
 * is codepage 874, `lessons/console-is-not-the-observation.md`. Every assertion
 * compares JavaScript strings.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteIdentityStore } from "../adapters/sqlite/SqliteIdentityStore.js";
import { SqliteLocalSellerStore } from "../adapters/sqlite/SqliteLocalSellerStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { signOut } from "../session/signOut.js";
import { signOutCard, signOutCardText } from "../session/signOutNotice.js";
import type { SignOutCardInput } from "../session/signOutNotice.js";
import { MemoryTokenStore } from "../session/tokenStore.js";
import { createLocalBill } from "../sync/createBill.js";
import type { BillDraft } from "../sync/createBill.js";
import type { IssuedCode, LocalSeller, LocalSellerDraft } from "../sync/localSeller.js";
import { NOTHING_OWED, totalOwed } from "../sync/outbox.js";
import type { OutboxKind, OutboxRegistry, OwedByKind } from "../sync/outbox.js";
import { buildOutboxRegistry } from "../sync/outboxHandlers.js";
import type { OutboxDeps } from "../sync/outboxHandlers.js";
import { OutboxRunner } from "../sync/outboxRunner.js";
import type { SellerCreateOutcome, SellerCreateTransport } from "../sync/sellerCreate.js";
import { statusNotice } from "../sync/statusNotice.js";
import type { StatusInput } from "../sync/statusNotice.js";
import { FakeClock, FakeServer, OnlineTransport, owedWith, PROOF_OWNER, SeqIds } from "./fakes.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/* -------------------------------------------------------- the sentences -- */

/**
 * THE THREE SENTENCES THIS PHASE IS ABOUT, as literals, because they are what a
 * yard reads.
 *
 * `ALL_SENT_SHEET` and `ALL_SENT_STRIP` are claims that the device owes the
 * server nothing. `OWED_SELLER` is the presence sibling — an absence over an
 * empty render is satisfied by silence
 * (`lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md — applies to every assertion").
 */
const ALL_SENT_SHEET = "บิลทั้งหมดส่งครบแล้ว";
const ALL_SENT_STRIP = "ส่งครบแล้ว";
const OWED_SELLER = "ผู้ขายที่เพิ่มใหม่";
const OWED_BILL = "มีบิลรอส่ง";
/**
 * `รอแจ้งยกเลิก` and not `ยกเลิกบิล`: the sheet reads `มีบิลรอแจ้งยกเลิก N ใบ`
 * and the strip `รอแจ้งยกเลิก บิล N ใบ`-shaped, so the two words are in the
 * other order and `ยกเลิกบิล` matches NEITHER. Caught by this cell going red on
 * its first run, which is the reason a needle is a measurement and not a guess.
 */
const OWED_VOID = "รอแจ้งยกเลิก";

/* ------------------------------------------------------------ fixtures --- */

const OWNER = PROOF_OWNER;

const DRAFT: LocalSellerDraft = {
  name: "สมหญิง ขายเก่ง",
  phone: null,
  grade: null,
  id_number: null,
  address: null,
  vehicle_no: null,
};

const BILL_DRAFT: BillDraft = {
  seller: { kind: "server", seller_id: "sell-1" },
  vehicle_no: null,
  items: [
    {
      id: "item-1",
      product_id: "prod-1",
      line_no: 1,
      gross_weight: "10.005",
      tare_weight: "0.002",
      net_weight: "10.003",
      unit_price: "15.00",
      list_price: "15.00",
    },
  ],
  total_amount: "150.05",
  master_as_of: null,
};

/** Answers every create the same way. The transport is the ONLY double here. */
class FixedSellerTransport implements SellerCreateTransport {
  readonly seen: string[] = [];
  constructor(private readonly outcome: SellerCreateOutcome) {}
  createSeller(row: LocalSeller): Promise<SellerCreateOutcome> {
    this.seen.push(row.id);
    return Promise.resolve(this.outcome);
  }
}

interface Rig {
  driver: NodeSqliteDriver;
  bills: SqliteLocalStore;
  sellers: SqliteLocalSellerStore;
  clock: FakeClock;
  server: FakeServer;
  registry: OutboxRegistry;
  runner: OutboxRunner;
  ids: SeqIds;
  dir: string;
}

async function openRig(name: string, sellerTransport?: SellerCreateTransport): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), `recycle-p18b-w-${name}-`));
  const driver = NodeSqliteDriver.open(join(dir, "bills.db"));
  const bills = await SqliteLocalStore.open(driver);
  const sellers = SqliteLocalSellerStore.open(driver);
  await new SqliteIdentityStore(driver).save(OWNER);
  const clock = new FakeClock();
  const server = new FakeServer();
  const deps: OutboxDeps = {
    store: bills,
    transport: new OnlineTransport(server),
    clock,
    backoffBaseMs: 1000,
    backoffMaxMs: 30_000,
    masterDataRetryMs: 300_000,
    sellerStore: sellers,
    sellerTransport:
      sellerTransport ??
      new FixedSellerTransport({ kind: "created", server_seller_id: "srv-not-used" }),
  };
  const registry = buildOutboxRegistry(deps);
  return {
    driver,
    bills,
    sellers,
    clock,
    server,
    registry,
    runner: new OutboxRunner({ registry, clock }),
    ids: new SeqIds(name),
    dir,
  };
}

async function closeRig(r: Rig): Promise<void> {
  await r.driver.close();
  // Windows refuses to remove a directory holding an open file, so the driver
  // is closed first, always.
  rmSync(r.dir, { recursive: true, force: true });
}

/** Give the device spendable codes without going near a network. */
async function stock(r: Rig, n: number): Promise<void> {
  const codes: IssuedCode[] = [];
  for (let i = 1; i <= n; i += 1) {
    codes.push({ code: `S${String(400 + i)}`, token: `tok-${String(i)}-${"z".repeat(30)}` });
  }
  await r.sellers.saveReservations(codes, r.clock.now());
}

async function newLocalSeller(r: Rig): Promise<LocalSeller> {
  const made = await r.sellers.createLocalSeller(DRAFT, OWNER, r.ids.newId(), r.clock.now());
  if (made.kind !== "created") throw new Error(`fixture: ${made.refusal.kind}`);
  return made.seller;
}

/* --------------------------------------------- the three surfaces, once -- */

/**
 * THE SHEET AND THE STRIP FROM ONE `OwedByKind`, so a case cannot hand them
 * two different values by accident — which is the defect W3 reproduces.
 *
 * The sheet is read through `signOutCardText`, which is the view's own draw
 * order (title, lines, buttons): assert the CONCATENATION, never a line
 * (`lessons/correct-classification-can-still-render-as-an-error.md`).
 */
function sheetInputOf(owed: OwedByKind, failed = 0): SignOutCardInput {
  return { owed, failed, failure: null, session: "active" };
}

function sheetOf(owed: OwedByKind, failed = 0): string {
  return signOutCardText(signOutCard(sheetInputOf(owed, failed)));
}

/** The quiet strip — nothing wrong anywhere — so the only variable is `owed`. */
function stripInputOf(owed: OwedByKind, over: Partial<StatusInput> = {}): StatusInput {
  return {
    session: "active",
    account: "ok",
    voidsRefused: 0,
    online: true,
    pending: 0,
    parkedForAnother: 0,
    parkedUnknownOwner: 0,
    failed: 0,
    blocked: null,
    waitingOnMasterData: 0,
    masterDataCodes: [],
    owed,
    ...over,
  };
}

function stripOf(owed: OwedByKind, over: Partial<StatusInput> = {}): string {
  return statusNotice(stripInputOf(owed, over)).message;
}

/** The gate, with nothing else able to influence it. */
async function gate(owed: OwedByKind, failed = 0): Promise<string> {
  const outcome = await signOut({
    owed,
    failed,
    setSyncPaused: () => undefined,
    tokens: new MemoryTokenStore("a-token"),
    engine: { resetAfterSignOut: () => undefined },
  });
  return outcome.kind;
}

/* ------------------------------------------------------------------ W0 --- */

/**
 * THE MAP THE GATE READS HAS AN ENTRY FOR EVERY KIND, ASSERTED AS AN EQUALITY.
 *
 * Containment answers what is PRESENT and only equality answers what is
 * MISSING — the distinction
 * `lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md — applies to every assertion"
 * records as its fourteenth mechanism, and the one that matters here: a gate
 * built from a hand-written sum has a key set that is a strict SUBSET of the
 * registry's, and every containment test passes over it.
 *
 * BOTH SETS ARE ASSERTED NON-EMPTY in the same read, because two empty sets are
 * equal.
 */
async function w0KeySetEqualsMemberSet(): Promise<void> {
  header("W0: the owed map's key set EQUALS the registry's member set");
  const r = await openRig("w0");
  try {
    const owed = await r.runner.owedCountByKind();
    const fromMap = Object.keys(owed).sort();
    const fromRegistry = Object.keys(r.registry).sort();
    console.log(`  map:      ${fromMap.join(", ")}`);
    console.log(`  registry: ${fromRegistry.join(", ")}`);
    check(
      "the two sets are EQUAL, not merely one contained in the other",
      fromMap.length === fromRegistry.length &&
        fromMap.every((k, i) => k === fromRegistry[i]),
      `${String(fromMap.length)} vs ${String(fromRegistry.length)}`,
    );
    check(
      "CONTROL: neither set is empty — two empty sets are equal",
      fromMap.length > 0 && fromRegistry.length > 0,
      `${String(fromMap.length)} kinds`,
    );
    // The value the gate reads is DECLARED, not found on a concrete class: every
    // member of the registry answers `owedCount`, and the registry's own type is
    // total over the union. This is the runtime half of that; the compile half
    // is that `OutboxRegistry` is a mapped type.
    const declared = (Object.keys(r.registry) as OutboxKind[]).every(
      (k) => typeof r.registry[k].owedCount === "function",
    );
    check("every registry member DECLARES owedCount — the gate reads a contract", declared);
  } finally {
    await closeRig(r);
  }
}

/* ------------------------------------------------------------------ W1 --- */

/**
 * EVERY-SURFACE-SEES-A-KIND-THAT-IS-NOT-A-BILL, over its own staging: one local
 * seller owed, NO bill pending, no terminally failed bill.
 *
 * ALL IN ONE RUN over that one staging, because a defect living between two
 * correct renderers is invisible to either alone.
 */
async function w1EverySurfaceSeesANonBillKind(): Promise<void> {
  header("W1: EVERY-SURFACE-SEES-A-KIND-THAT-IS-NOT-A-BILL — one staging, six parts");
  const r = await openRig("w1");
  try {
    await stock(r, 2);
    const seller = await newLocalSeller(r);

    const owed = await r.runner.owedCountByKind();
    console.log(`  owed: ${JSON.stringify(owed)}`);
    // THE STAGING IS WHAT THE CRITERION NAMES, asserted rather than assumed: a
    // staging that quietly also owed a bill would make every part below pass
    // for the wrong reason.
    check(
      "STAGING: one seller owed, no bill owed, nothing failed",
      owed.seller_create === 1 &&
        owed.bill_send === 0 &&
        owed.bill_void === 0 &&
        (await r.bills.listByState("failed")).length === 0,
      JSON.stringify(owed),
    );
    check("STAGING CONTROL: the local seller row is really there and unsettled",
      seller.sync_state === "pending" && seller.server_seller_id === null,
      `${seller.id} state=${seller.sync_state}`);

    // (1) THE GATE REFUSES.
    check("1. the gate REFUSES the sign-out", (await gate(owed)) === "refused_pending");

    // (2) THE SHEET.
    const sheet = sheetOf(owed);
    console.log(`  sheet: ${sheet}`);
    check(
      `2. the sheet does NOT say "${ALL_SENT_SHEET}"`,
      !sheet.includes(ALL_SENT_SHEET),
      sheet,
    );
    check(
      "2. PRESENCE SIBLING: the same concatenation NAMES the owed seller, with its count",
      sheet.includes(OWED_SELLER) && sheet.includes(`${String(owed.seller_create)} ราย`),
      sheet,
    );

    // (3) THE STRIP, same staging, same value.
    const strip = stripOf(owed);
    console.log(`  strip: ${strip}`);
    check(`3. the strip does NOT say "${ALL_SENT_STRIP}"`, !strip.includes(ALL_SENT_STRIP), strip);
    check(
      "3. PRESENCE SIBLING: the strip NAMES the owed seller, with its count",
      strip.includes(OWED_SELLER) && strip.includes(String(owed.seller_create)),
      strip,
    );

    // (4) THE PRESENCE SIBLING'S OWN CONTROL. Without this, a line added
    // unconditionally to every card satisfies (2) and (3) everywhere, including
    // where the surfaces are right.
    const quietSheet = sheetOf(NOTHING_OWED);
    const quietStrip = stripOf(NOTHING_OWED);
    console.log(`  quiet sheet: ${quietSheet}`);
    console.log(`  quiet strip: ${quietStrip}`);
    check(
      "4. CONTROL: with nothing owed, NEITHER surface names a seller",
      !quietSheet.includes(OWED_SELLER) && !quietStrip.includes(OWED_SELLER),
      `${quietSheet} | ${quietStrip}`,
    );
    check(
      "4. CONTROL: and both DO say the work is sent — so the two negatives above are not vacuous",
      quietSheet.includes(ALL_SENT_SHEET) && quietStrip.includes(ALL_SENT_STRIP),
      `${quietSheet} | ${quietStrip}`,
    );

    // (5) THE GATE AND THE SHEET READ THE SAME VALUE. Asserted as an equality
    // between the TWO INPUTS in one render — not as agreement between two
    // outputs, which two wrong values would also produce.
    const sheetInput = sheetInputOf(owed);
    const gateOwed = owed;
    check(
      "5. the gate's input and the sheet's input are the SAME object",
      sheetInput.owed === gateOwed,
    );
    check(
      "5. ...and equal member by member, enumerated rather than named",
      (Object.keys(gateOwed) as OutboxKind[]).every((k) => sheetInput.owed[k] === gateOwed[k]),
      JSON.stringify(sheetInput.owed),
    );

    // (6) THE COMPLETENESS CLAIM, RE-DERIVED. `UnsentBreakdown` is complete over
    // `local_bills` and over nothing else, which is what its own text now says.
    const unsent = await r.bills.unsentBreakdown();
    const onDisk = await r.driver.all<{ n: number }>(
      "SELECT COUNT(*) AS n FROM local_bills WHERE sync_state IN ('pending','syncing')",
    );
    const sum = unsent.mine + unsent.mineBlocked + unsent.otherAccount + unsent.unknownOwner;
    check(
      "6. the four counts still sum to the unsent BILL rows on disk — complete over local_bills",
      sum === (onDisk[0]?.n ?? -1),
      `sum=${String(sum)} disk=${String(onDisk[0]?.n)}`,
    );
    check(
      "6. ...and the owed SELLER is in none of them — which is why the claim is scoped",
      sum === 0 && owed.seller_create === 1,
      `sum=${String(sum)} seller_create=${String(owed.seller_create)}`,
    );
  } finally {
    await closeRig(r);
  }
}

/* ------------------------------------------------------------------ W2 --- */

/**
 * THE RED CASE, NAMED, RUN: the bill-only statement used unchanged.
 *
 * The criterion writes it out — "the strip says the work is sent, the gate
 * permits the sign-out, and the seller create drains later under whoever signs
 * in next". It is staged by feeding the surfaces the value the OLD code
 * produced: `unsentBreakdown().mine + .mineBlocked`, in the `bill_send` slot
 * and nowhere else. That is precisely the old input, over the same staging, so
 * what separates the two runs is the VALUE and not a rewritten renderer.
 */
async function w2TheBillOnlyStatement(): Promise<void> {
  header("W2: the RED CASE — the bill-only statement used unchanged");
  const r = await openRig("w2");
  try {
    await stock(r, 1);
    await newLocalSeller(r);

    const owedNow = await r.runner.owedCountByKind();
    const unsent = await r.bills.unsentBreakdown();
    // The old number, reproduced exactly: one statement over local_bills.
    const owedThen = owedWith({ bill_send: unsent.mine + unsent.mineBlocked });
    console.log(`  the OLD number (bills only) = ${String(totalOwed(owedThen))}`);
    console.log(`  the NEW number (every kind) = ${String(totalOwed(owedNow))}`);

    check(
      "the seller really is owed — otherwise this whole case is about an empty device",
      owedNow.seller_create === 1,
      JSON.stringify(owedNow),
    );
    check("RED: under the bill-only number the gate PERMITS the sign-out",
      (await gate(owedThen)) === "signed_out");
    const redSheet = sheetOf(owedThen);
    const redStrip = stripOf(owedThen);
    console.log(`  RED sheet: ${redSheet}`);
    console.log(`  RED strip: ${redStrip}`);
    check(`RED: the sheet says "${ALL_SENT_SHEET}"`, redSheet.includes(ALL_SENT_SHEET));
    check(`RED: the strip says "${ALL_SENT_STRIP}"`, redStrip.includes(ALL_SENT_STRIP));
    check(
      "THE PAIR: the same staging, the two numbers, and the gate answers DIFFERENTLY that way round",
      (await gate(owedThen)) === "signed_out" && (await gate(owedNow)) === "refused_pending",
    );
  } finally {
    await closeRig(r);
  }
}

/* ------------------------------------------------------------------ W3 --- */

/**
 * THE GATE AND THE SHEET DISAGREEING — AND THIS ONE SHIPPED, ON BILLS ALONE.
 *
 * `App.tsx` handed `signOut()` `mine + mineBlocked` and `signOutCard()` `mine`.
 * One bill parked on missing master data makes those two numbers differ, so the
 * sheet drew the CONFIRMATION card, with a working-looking ออกจากระบบ button,
 * over a gate that answered `refused_pending` — which the handler swallows with
 * a bare return. A green button that does nothing.
 *
 * BOTH HALVES ARE RUN. Without the old pairing there is nothing to distinguish;
 * without the new one there is no fix to show.
 */
async function w3TheGateAndTheSheetDisagreed(): Promise<void> {
  header("W3: one parked bill — the gate and the sheet, then and now");
  const r = await openRig("w3");
  try {
    const bill = await createLocalBill(
      { store: r.bills, clock: r.clock, ids: r.ids },
      BILL_DRAFT,
      OWNER,
    );
    await r.bills.markMasterDataMissing(
      bill.id,
      "seller_grade_unset",
      "HTTP 424",
      1,
      new Date(r.clock.now().getTime() + 300_000),
      r.clock.now(),
    );

    const unsent = await r.bills.unsentBreakdown();
    console.log(`  mine=${String(unsent.mine)} mineBlocked=${String(unsent.mineBlocked)}`);
    check(
      "STAGING: the bill is parked — mine is 0 and mineBlocked is 1, which is what made the two numbers differ",
      unsent.mine === 0 && unsent.mineBlocked === 1,
      JSON.stringify(unsent),
    );

    // THEN: two different numbers, one decision.
    const thenGate = owedWith({ bill_send: unsent.mine + unsent.mineBlocked });
    const thenSheetValue = owedWith({ bill_send: unsent.mine });
    const thenSheet = signOutCard(sheetInputOf(thenSheetValue));
    console.log(`  THEN sheet: ${signOutCardText(thenSheet)}`);
    check(
      "THEN: the gate REFUSED",
      (await gate(thenGate)) === "refused_pending",
    );
    check(
      "THEN: ...while the sheet drew the CONFIRMATION and offered the button",
      thenSheet.actions.some((a) => a.kind === "confirm_sign_out"),
      thenSheet.actions.map((a) => a.kind).join(", "),
    );

    // NOW: one value, both renderers.
    const owed = await r.runner.owedCountByKind();
    const nowSheet = signOutCard(sheetInputOf(owed));
    console.log(`  NOW  sheet: ${signOutCardText(nowSheet)}`);
    check("NOW: the gate still REFUSES", (await gate(owed)) === "refused_pending");
    check(
      "NOW: ...and the sheet offers NO sign-out button",
      !nowSheet.actions.some((a) => a.kind === "confirm_sign_out"),
      nowSheet.actions.map((a) => a.kind).join(", "),
    );
    check(
      "NOW: ...and it names the bill that is holding the sign-out",
      signOutCardText(nowSheet).includes(`${OWED_BILL} 1 ใบ`),
      signOutCardText(nowSheet),
    );
    check(
      "THE PAIR: the button was offered THEN and is not offered NOW, from the same store",
      thenSheet.actions.some((a) => a.kind === "confirm_sign_out") &&
        !nowSheet.actions.some((a) => a.kind === "confirm_sign_out"),
    );
  } finally {
    await closeRig(r);
  }
}

/* ------------------------------------------------------------------ W4 --- */

/**
 * A VOID THAT CAN NEVER BE APPLIED MUST NOT HOLD THE GATE SHUT, AND ONE THAT
 * CAN MUST.
 *
 * `signOut.ts` has refused to block on terminal rows since R1b: failed bills
 * never drain, so blocking on them would make sign-out impossible for ever on a
 * device holding one. Widening the gate to every kind is what made that rule
 * reach `countVoidsOwed`, which had no `failed` clause — `listVoidsToApply`
 * requires `synced`, `markFailed` does not clear `void_requested_at`, and
 * nothing moves a failed bill to synced.
 *
 * THE PAIR IS THE EVIDENCE. A store that simply stopped counting voids would
 * pass the first cell and fail the second.
 */
async function w4AVoidThatCanNeverBeApplied(): Promise<void> {
  header("W4: a void on a FAILED bill does not hold the gate shut; one on a live bill does");
  const r = await openRig("w4");
  try {
    // A: a bill the server accepted, then a void requested. Owed, and DOABLE.
    const live = await createLocalBill(
      { store: r.bills, clock: r.clock, ids: r.ids },
      BILL_DRAFT,
      OWNER,
    );
    await r.bills.markSynced(live.id, "B-2569-1", 1, r.clock.now());
    await r.bills.requestVoid(live.id, "ชั่งผิด", r.clock.now());

    const withLive = await r.runner.owedCountByKind();
    console.log(`  with a doable void: ${JSON.stringify(withLive)}`);
    check(
      "PRESENCE SIBLING: a void the device CAN still apply is owed, and the gate refuses",
      withLive.bill_void === 1 && (await gate(withLive)) === "refused_pending",
      JSON.stringify(withLive),
    );
    // ...and it really is actionable, so "owed" is not a claim about a row
    // nothing would ever pick up.
    const actionable = await r.bills.listVoidsToApply(10);
    check(
      "...and the drain would actually pick it up — owed AND actionable",
      actionable.length === 1 && actionable[0]?.id === live.id,
      `${String(actionable.length)} actionable`,
    );

    // Settle it so the device owes nothing, then stage the other half.
    await r.bills.markVoidApplied(live.id, 1, r.clock.now());
    const quiet = await r.runner.owedCountByKind();
    check("CONTROL: with the void applied the device owes nothing", totalOwed(quiet) === 0,
      JSON.stringify(quiet));

    // B: a bill voided while it was still pending, which the server then
    // permanently refused. The void is owed for ever and can never be applied.
    const doomed = await createLocalBill(
      { store: r.bills, clock: r.clock, ids: r.ids },
      BILL_DRAFT,
      OWNER,
    );
    await r.bills.requestVoid(doomed.id, "ยกเลิก", r.clock.now());
    await r.bills.markFailed(doomed.id, "422", 1, r.clock.now());

    const after = await r.bills.getBill(doomed.id);
    check(
      "STAGING: the row really is failed AND still carries the void request",
      after?.sync_state === "failed" && after.void_requested_at !== null,
      `state=${String(after?.sync_state)} requested=${String(after?.void_requested_at)}`,
    );
    const stillActionable = await r.bills.listVoidsToApply(10);
    check(
      "THE DISCRIMINATOR: nothing will ever attempt it — listVoidsToApply requires 'synced'",
      stillActionable.length === 0,
      `${String(stillActionable.length)} actionable`,
    );

    const owed = await r.runner.owedCountByKind();
    console.log(`  with an unappliable void: ${JSON.stringify(owed)}`);
    check(
      "the unappliable void is NOT counted as owed",
      owed.bill_void === 0,
      JSON.stringify(owed),
    );
    check(
      "...so the device can still be handed over",
      (await gate(owed, 1)) === "signed_out",
    );
    // AND THE WORK IS NOT HIDDEN, which is the whole test of the change.
    const sheet = sheetOf(owed, (await r.bills.listByState("failed")).length);
    console.log(`  sheet: ${sheet}`);
    check(
      "...and the failed bill is still NAMED on the sheet, with the office as the actor",
      sheet.includes("มีบิลที่ระบบไม่รับ 1 ใบ") && sheet.includes("สำนักงาน"),
      sheet,
    );
  } finally {
    await closeRig(r);
  }
}

/* ------------------------------------------------------------------ W5 --- */

/**
 * THE SEAM, DRIVEN END TO END IN ONE RUN.
 *
 * Everything above hands the surfaces a value read off the runner at one
 * moment. This case makes the QUEUE move — one real pass, through the real
 * registry, with the seller kind settling — and reads the gate on both sides of
 * it. That is the composition the two green proofs could not reach: the store
 * transition, the registry enumeration, the gate and the sheet, in one run.
 */
async function w5TheSeamEndToEnd(): Promise<void> {
  header("W5: owed -> refused -> ONE pass -> permitted, through the real runner");
  const transport = new FixedSellerTransport({
    kind: "created",
    server_seller_id: "00000000-0000-4000-8000-0000000000ff",
  });
  const r = await openRig("w5", transport);
  try {
    await stock(r, 1);
    const seller = await newLocalSeller(r);

    const before = await r.runner.owedCountByKind();
    const sheetBefore = sheetOf(before);
    const stripBefore = stripOf(before);
    console.log(`  BEFORE sheet: ${sheetBefore}`);
    console.log(`  BEFORE strip: ${stripBefore}`);
    check("BEFORE: the gate refuses", (await gate(before)) === "refused_pending");
    check("BEFORE: the sheet names the seller", sheetBefore.includes(OWED_SELLER), sheetBefore);
    check("BEFORE: the strip names the seller", stripBefore.includes(OWED_SELLER), stripBefore);

    // ONE pass. Not runUntilQuiescent: a single pass is what proves the kind
    // settled here rather than eventually.
    const report = await r.runner.runPass();
    console.log(`  pass performed: ${JSON.stringify(report.performed)}`);
    check(
      "the pass really performed the seller create — the queue moved, it did not go quiet",
      report.performed.seller_create === 1 && transport.seen.includes(seller.id),
      JSON.stringify(report.performed),
    );

    const settled = await r.sellers.getLocalSeller(seller.id);
    check(
      "the row settled and carries the SERVER's id",
      settled?.sync_state === "synced" &&
        settled.server_seller_id === "00000000-0000-4000-8000-0000000000ff",
      `state=${String(settled?.sync_state)} server=${String(settled?.server_seller_id)}`,
    );

    const after = await r.runner.owedCountByKind();
    const sheetAfter = sheetOf(after);
    const stripAfter = stripOf(after);
    console.log(`  AFTER  sheet: ${sheetAfter}`);
    console.log(`  AFTER  strip: ${stripAfter}`);
    check("AFTER: the gate permits", (await gate(after)) === "signed_out");
    check(
      "AFTER: the sheet no longer names a seller, and says the work is sent",
      !sheetAfter.includes(OWED_SELLER) && sheetAfter.includes(ALL_SENT_SHEET),
      sheetAfter,
    );
    check(
      "AFTER: the strip no longer names a seller, and says the work is sent",
      !stripAfter.includes(OWED_SELLER) && stripAfter.includes(ALL_SENT_STRIP),
      stripAfter,
    );
    check(
      "THE PAIR: one device, one run, and the three surfaces changed together",
      (await gate(before)) === "refused_pending" && (await gate(after)) === "signed_out",
    );
  } finally {
    await closeRig(r);
  }
}

/* ------------------------------------------------------------------ W6 --- */

/**
 * EVERY REGISTRY MEMBER HAS ITS OWN SENTENCE, AND THE SWEEP IS THE REGISTRY.
 *
 * Iterating `Object.keys(registry)` rather than a list written here is the
 * point: a fourth kind joins this cell the day it joins the outbox, with no
 * edit. It is the same shape as the two cells in `proveOutbox` that began
 * covering `seller_create` for free
 * (`lessons/README.md § Lessons` "a-quantified-sentence-names-no-member.md — applies the moment you ADD to or REMOVE from any set").
 *
 * ASSERTED BY DIRECTION, both ways, because two wrong sentences also differ:
 * each kind's render carries its own phrase and does NOT carry another kind's.
 */
async function w6EveryKindHasItsOwnSentence(): Promise<void> {
  header("W6: every registry member gets its own sentence, swept from the registry");
  const r = await openRig("w6");
  try {
    const kinds = Object.keys(r.registry) as OutboxKind[];
    const rendered = new Map<OutboxKind, string>();
    for (const kind of kinds) {
      const text = sheetOf(owedWith({ [kind]: 1 } as Partial<OwedByKind>));
      rendered.set(kind, text);
      console.log(`  ${kind.padEnd(14)} ${text}`);
    }
    check(
      "every kind, alone, REFUSES the sign-out",
      (
        await Promise.all(
          kinds.map(async (k) => gate(owedWith({ [k]: 1 } as Partial<OwedByKind>))),
        )
      ).every((o) => o === "refused_pending"),
    );
    // Pairwise DISTINCT: no kind inherits another's sentence, which is what a
    // lookup with a fallback would produce for the member nobody wrote.
    let clashes = 0;
    for (const a of kinds) {
      for (const b of kinds) {
        if (a !== b && rendered.get(a) === rendered.get(b)) clashes += 1;
      }
    }
    check(
      "no two kinds render the SAME sheet — none inherits another's sentence",
      clashes === 0,
      `${String(clashes)} clashing pairs over ${String(kinds.length)} kinds`,
    );
    check(
      "CONTROL: the sweep was not empty and covered the whole registry",
      kinds.length === Object.keys(r.registry).length && kinds.length > 1,
      `${String(kinds.length)} kinds`,
    );
    // And the three sentences this phase names are each reachable, by direction.
    check(
      "bill_send names บิล and neither of the others' subjects",
      (rendered.get("bill_send") ?? "").includes(OWED_BILL) &&
        !(rendered.get("bill_send") ?? "").includes(OWED_SELLER),
      rendered.get("bill_send"),
    );
    check(
      "seller_create names the seller and NOT the bill-send sentence",
      (rendered.get("seller_create") ?? "").includes(OWED_SELLER) &&
        !(rendered.get("seller_create") ?? "").includes(OWED_BILL),
      rendered.get("seller_create"),
    );
    check(
      "bill_void names the cancellation and NOT the bill-send sentence",
      (rendered.get("bill_void") ?? "").includes(OWED_VOID) &&
        !(rendered.get("bill_void") ?? "").includes(OWED_BILL),
      rendered.get("bill_void"),
    );
  } finally {
    await closeRig(r);
  }
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("P1.8b GATES (commit 1) — the seam between the outbox and the surfaces");
  console.log(`node ${process.version}; node:sqlite, real files, one temp dir per case`);

  await w0KeySetEqualsMemberSet();
  await w1EverySurfaceSeesANonBillKind();
  await w2TheBillOnlyStatement();
  await w3TheGateAndTheSheetDisagreed();
  await w4AVoidThatCanNeverBeApplied();
  await w5TheSeamEndToEnd();
  await w6EveryKindHasItsOwnSentence();

  console.log("");
  console.log(
    failures === 0 ? "ALL OWED-SURFACE CASES PASSED" : `FAILED — ${String(failures)} check(s)`,
  );
  return failures === 0 ? 0 : 1;
}

/*
 * PRESET TO RED, per lessons/a-default-exit-code-is-a-default-verdict.md. An
 * unsettled top-level await is not an error on node: the event loop drains and
 * the process exits with the DEFAULT code, which is 0 — so a run that stalls
 * mid-proof prints no exit line and reports GREEN. With the code preset, any
 * end other than main() completing exits 1.
 */
process.exitCode = 1;

main()
  .then((code) => {
    console.log(`OWEDSURFACES_EXIT=${String(code)}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("OWED-SURFACES PROOF CRASHED:", err);
    console.log("OWEDSURFACES_EXIT=1");
    process.exitCode = 1;
  });
