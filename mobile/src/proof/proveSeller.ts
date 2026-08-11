/**
 * Phase 2c-6 proof: per-bill seller selection.
 *
 * Run: npm run prove:seller
 *
 * S1-S5 are pure logic (no database, no device). S6 uses real SQLite files via
 * node:sqlite AND a real SIGKILL, because "the draft survives a force-quit" is
 * a claim about what reached the disk, and a graceful close would not test it.
 *
 * The invariant with money on it is S3: changing the seller must not move a
 * price the customer was already told. It is checked byte-for-byte rather than
 * field-by-field, so a future field added to DraftLine cannot slip through
 * unasserted.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteDraftStore } from "../adapters/sqlite/SqliteDraftStore.js";
import {
  addLine,
  buildLine,
  cartTotal,
  changeSeller,
  newDraft,
  normaliseVehicleNo,
  orderedLines,
  sameTierForBoth,
  setVehicleNo,
} from "../cart/cart.js";
import type { GradeTiers } from "../cart/cart.js";
import { NO_LOCKS, onProductChange, priceIsOffTier, releaseOnSave } from "../cart/entry.js";
import type { Locks } from "../cart/entry.js";
import {
  cleanVehicleNo,
  fold,
  gradePrice,
  indexPlates,
  searchSellers,
} from "../cart/sellers.js";
import type { SellerOption } from "../cart/sellers.js";
import type { Draft, DraftForm } from "../cart/types.js";
import {
  MASTER_DATA_CODES,
  billNotice,
  parkedReason,
  parkedSummary,
} from "../sync/parkedReason.js";
import type { NoticeInput } from "../sync/parkedReason.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { buildLocalBill } from "../sync/createBill.js";
import { FakeClock, PROOF_OWNER, SeqIds } from "./fakes.js";
import { signInProofDevice } from "./proofDevice.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const NOW = "2026-07-26T09:00:00.000Z";
const LATER = "2026-07-26T09:05:00.000Z";

/* ------------------------------------------------------------ fixtures ---- */

/** Mirrors the seeded tenant-A price list, so the numbers here are real. */
const PRICES: Record<string, Record<string, string>> = {
  "prod-FE": { A: "15.50", B: "15.00", C: "14.50", D: "14.00" },
  "prod-AL": { A: "45.00", B: "44.00", C: "43.00", D: "42.00" },
  // Deliberately incomplete: no C tier. This is the "product the office has not
  // priced for that grade" case, which the server answers with 424.
  "prod-CU": { A: "215.00", B: "212.50", D: "205.00" },
};

const SELLERS: SellerOption[] = [
  { id: "s-001", code: "S001", name: "สมชาย ใจดี", grade: "B" },
  { id: "s-002", code: "S002", name: "ร้านรับซื้อ พี่แดง", grade: "A" },
  { id: "s-003", code: "S003", name: "สมหญิง รุ่งเรือง", grade: "C" },
  { id: "s-004", code: "S004", name: "โรงงาน ทองไทย", grade: "D" },
  { id: "s-005", code: "S005", name: "ลูกค้าใหม่ ยังไม่จัดเกรด", grade: null },
];

const seller = (id: string): SellerOption => {
  const s = SELLERS.find((x) => x.id === id);
  if (s === undefined) throw new Error(`no fixture seller ${id}`);
  return s;
};

/**
 * The tier resolver the app builds from /products for a chosen seller.
 *
 * Phase 2c-8 split changeSeller's tier argument in two — the grade REFERENCE and
 * the value that may be DEFAULTED into the money field — because a cached price
 * list can be too old to default from. Every case in this file is about the
 * seller-change rules with current data, where the two answers are identical, so
 * they are bound together here rather than threaded through thirty call sites.
 * The split itself is proven in proveCold (C2), against a stale cache.
 */
const tierForGrade = (grade: string | null): GradeTiers =>
  sameTierForBoth((productId: string): string | null =>
    gradePrice(PRICES[productId] ?? {}, grade),
  );

const ALL_LOCK_STATES: Locks[] = [
  { tare: false, price: false },
  { tare: true, price: false },
  { tare: false, price: true },
  { tare: true, price: true },
];

const describeLocks = (l: Locks): string =>
  `{tare:${l.tare ? "LOCK" : "open"},price:${l.price ? "LOCK" : "open"}}`;

interface LineSpec {
  id: string;
  product: string;
  code: string;
  name: string;
  gross: string;
  tare: string;
  price: string;
}

/** A cart belonging to `sellerId`, priced at that seller's grade. */
function cartFor(sellerId: string, specs: LineSpec[]): Draft {
  const s = seller(sellerId);
  let d = newDraft("draft-0001", sellerId, NOW, NOW);
  for (const spec of specs) {
    const list = gradePrice(PRICES[spec.product] ?? {}, s.grade);
    const r = buildLine({
      id: spec.id,
      product_id: spec.product,
      product_code: spec.code,
      product_name: spec.name,
      uom_code: "KG",
      gross: spec.gross,
      tare: spec.tare,
      price: spec.price,
      list_price: list ?? spec.price,
    });
    if (!r.ok) throw new Error(`fixture line failed: ${spec.code} ${r.field}/${r.error}`);
    d = addLine(d, r.line, NOW);
  }
  return d;
}

const CART_SPECS: LineSpec[] = [
  { id: "l1", product: "prod-FE", code: "FE-STEEL", name: "เหล็กรวม", gross: "10.005", tare: "0.002", price: "15.00" },
  { id: "l2", product: "prod-AL", code: "AL-CAN", name: "กระป๋องอลูมิเนียม", gross: "3.500", tare: "0.100", price: "44.00" },
  { id: "l3", product: "prod-CU", code: "CU-WIRE", name: "สายทองแดง", gross: "1.250", tare: "0.000", price: "220.00" },
];

/* ------------------------------------------------------------------ S1 ---- */

function s1GradeDrivesTheTier(): void {
  header("S1: the seller's GRADE picks the tier — and a grade-less seller gets no price");

  for (const s of SELLERS) {
    const fe = gradePrice(PRICES["prod-FE"] ?? {}, s.grade);
    console.log(
      `  ${s.code} ${String(s.grade ?? "(no grade)").padEnd(10)} -> FE-STEEL ${fe ?? "(blank)"}`,
    );
  }

  check("grade B seller gets the B tier", gradePrice(PRICES["prod-FE"] ?? {}, "B") === "15.00");
  check("grade C seller gets the C tier", gradePrice(PRICES["prod-FE"] ?? {}, "C") === "14.50");
  check("grade A seller gets the A tier", gradePrice(PRICES["prod-FE"] ?? {}, "A") === "15.50");
  check("grade D seller gets the D tier", gradePrice(PRICES["prod-FE"] ?? {}, "D") === "14.00");

  // The regression this replaces: the old listPriceFor fell back to the first
  // tier present, so a seller with NO grade was quoted grade A — the HIGHEST
  // price — on a bill the server refuses anyway (424 seller_grade_unset). The
  // yard pays cash against the screen, so the fallback could not make the bill
  // valid, only make the shop overpay before finding out.
  const wouldHaveBeen = PRICES["prod-FE"]?.["A"];
  check(
    "a grade-less seller gets NO default price, not the first tier",
    gradePrice(PRICES["prod-FE"] ?? {}, null) === null,
    `the old fallback would have quoted ${String(wouldHaveBeen)} (grade A, the highest)`,
  );
  check(
    "a product with no row for that grade is also blank, never substituted",
    gradePrice(PRICES["prod-CU"] ?? {}, "C") === null,
    "CU-WIRE has A/B/D but no C — the server answers this with 424 product_price_unset",
  );
}

/* ------------------------------------------------------------------ S2 ---- */

function s2SellerChangeRedefaultsPendingPrice(): void {
  header("S2: changing seller re-defaults the price of the line NOT YET ADDED");

  // Mid-entry: product chosen, load on the scale, price defaulted from grade B.
  const pending: DraftForm = {
    product_id: "prod-FE",
    gross: "10.005",
    tare: "0.002",
    price: "15.00",
  };
  const base: Draft = { ...newDraft("d", "s-001", NOW, NOW), form: pending };

  for (const s of SELLERS) {
    const r = changeSeller(base, s.id, NO_LOCKS, tierForGrade(s.grade), LATER);
    console.log(
      `  -> ${s.code} grade ${String(s.grade ?? "-").padEnd(4)}` +
        ` price ${JSON.stringify(base.form.price)} => ${JSON.stringify(r.draft.form.price)}` +
        `  gross=${JSON.stringify(r.draft.form.gross)} tare=${JSON.stringify(r.draft.form.tare)}`,
    );
  }

  const toC = changeSeller(base, "s-003", NO_LOCKS, tierForGrade("C"), LATER);
  check("the pending price re-defaults to the new grade's tier", toC.draft.form.price === "14.50");
  check("and the draft now belongs to the new seller", toC.draft.seller_id === "s-003");

  // The difference from a PRODUCT change: nothing physical moved, so the
  // measurements survive. Clearing them would destroy weights for scrap that
  // may already be in the pile.
  check(
    "gross survives — the seller changed, the scale did not",
    toC.draft.form.gross === "10.005",
    `gross=${JSON.stringify(toC.draft.form.gross)}`,
  );
  check("tare survives for the same reason", toC.draft.form.tare === "0.002");
  check("the selected product survives", toC.draft.form.product_id === "prod-FE");
  // Contrast, so the asymmetry is on the record rather than assumed.
  const productChanged = onProductChange(pending, NO_LOCKS, {
    productId: "prod-AL",
    listPrice: "44.00",
  });
  check(
    "...whereas a PRODUCT change still clears gross, as it always did",
    productChanged.gross === "",
    "the two changes mean different things and behave differently",
  );

  const toNoGrade = changeSeller(base, "s-005", NO_LOCKS, tierForGrade(null), LATER);
  check(
    "changing to a grade-less seller CLEARS the price rather than leaving the old grade's",
    toNoGrade.draft.form.price === "",
    `price=${JSON.stringify(toNoGrade.draft.form.price)}`,
  );

  // A locked price is an explicit override and survives, in every lock state.
  for (const locks of ALL_LOCK_STATES) {
    const r = changeSeller(base, "s-003", locks, tierForGrade("C"), LATER);
    const held = r.draft.form.price === "15.00";
    check(
      `${describeLocks(locks).padEnd(28)} price ${locks.price ? "HELD at 15.00" : "re-defaulted to 14.50"}`,
      locks.price ? held : r.draft.form.price === "14.50",
      `price=${r.draft.form.price} impact.priceLockHeld=${String(r.impact.priceLockHeld)}`,
    );
  }
  const locked = changeSeller(base, "s-003", { tare: false, price: true }, tierForGrade("C"), LATER);
  check(
    "a held price is flagged off-tier against the NEW grade — the operator is told, not left to notice",
    priceIsOffTier(locked.draft.form.price, "14.50"),
    "same cue the locked-price-across-products case already uses",
  );
}

/* ------------------------------------------------------------------ S3 ---- */

function s3CartLinesKeepTheirPrices(): void {
  header("S3: lines already in the cart keep the prices they were entered at");

  const before = cartFor("s-001", CART_SPECS); // grade B
  const totalBefore = cartTotal(before);
  const after = changeSeller(before, "s-003", NO_LOCKS, tierForGrade("C"), LATER); // grade C
  const totalAfter = cartTotal(after.draft);

  for (const [b, a] of orderedLines(before).map(
    (l, i) => [l, orderedLines(after.draft)[i]] as const,
  )) {
    console.log(
      `  ${b.product_code.padEnd(9)} unit ${b.unit_price} -> ${a?.unit_price}` +
        `   amount ${b.amount} -> ${a?.amount}` +
        `   list(ref) ${b.list_price} -> ${a?.list_price}`,
    );
  }
  console.log(`  cart total ${totalBefore} -> ${totalAfter}`);

  // BYTE-FOR-BYTE on everything except the grade reference, so a field added to
  // DraftLine later cannot quietly start moving here.
  const stripRef = (d: Draft): string =>
    JSON.stringify(orderedLines(d).map(({ list_price: _ignored, ...rest }) => rest));
  check(
    "every line is byte-identical apart from list_price — no money moved",
    stripRef(before) === stripRef(after.draft),
  );
  check(
    "the cart total the customer was told is unchanged",
    totalBefore === totalAfter,
    `${totalBefore} == ${totalAfter}`,
  );
  check(
    "unit_price specifically was not re-priced to the new grade",
    orderedLines(after.draft).every(
      (l, i) => l.unit_price === orderedLines(before)[i]?.unit_price,
    ),
  );

  // The grade REFERENCE does move, and that is the point: the server stamps
  // list_price from product_prices at the seller's grade regardless of what the
  // client sends (bills.py), so a stale reference makes the device disagree with
  // the record AND hides the override.
  const lines = orderedLines(after.draft);
  check(
    "FE-STEEL's reference re-points to the C tier",
    lines[0]?.list_price === "14.50",
    `list_price=${String(lines[0]?.list_price)}`,
  );
  check(
    "AL-CAN's reference re-points to the C tier",
    lines[1]?.list_price === "43.00",
    `list_price=${String(lines[1]?.list_price)}`,
  );
  check(
    "CU-WIRE has no C tier, so its last known reference is KEPT, not invented over",
    lines[2]?.list_price === "212.50",
    `list_price=${String(lines[2]?.list_price)} (the B tier it was entered under)`,
  );
  check(
    "so the override is now visible: FE-STEEL paid 15.00 against a 14.50 list",
    lines[0] !== undefined && lines[0].unit_price !== lines[0].list_price,
    "with a stale reference this line would have looked perfectly ordinary",
  );

  console.log(
    `  impact = kept ${String(after.impact.keptLines)}` +
      ` re-referenced ${String(after.impact.rereferenced)}` +
      ` without-tier ${String(after.impact.withoutTier)}`,
  );
  check(
    "the impact reported to the operator matches what actually happened",
    after.impact.keptLines === 3 && after.impact.rereferenced === 2 && after.impact.withoutTier === 1,
  );

  // And the same change with an EMPTY cart is a no-op on lines.
  const empty = changeSeller(newDraft("d", "s-001", NOW, NOW), "s-003", NO_LOCKS, tierForGrade("C"), LATER);
  check(
    "an empty cart reports nothing kept, so the UI knows not to warn",
    empty.impact.keptLines === 0 && empty.draft.lines.length === 0,
  );
}

/* ------------------------------------------------------------------ S4 ---- */

function s4LocksSurviveASellerChange(): void {
  header("S4: a seller change does NOT release the field locks");

  const base = cartFor("s-001", CART_SPECS);

  // changeSeller takes locks and returns only a draft — there is no return path
  // by which it could clear one. What is checkable at runtime is that the locks
  // the caller holds still govern the form afterwards, in every state.
  for (const locks of ALL_LOCK_STATES) {
    const r = changeSeller(
      { ...base, form: { product_id: "prod-FE", gross: "10.005", tare: "0.002", price: "15.00" } },
      "s-003",
      locks,
      tierForGrade("C"),
      LATER,
    );
    const tareKept = r.draft.form.tare === "0.002";
    console.log(
      `  ${describeLocks(locks).padEnd(28)} tare=${JSON.stringify(r.draft.form.tare)}` +
        ` price=${JSON.stringify(r.draft.form.price)}`,
    );
    check(
      `${describeLocks(locks).padEnd(28)} the pinned tare is still there afterwards`,
      tareKept,
      "releasing it would weigh the next line with tare 0 — the shop pays for the container",
    );
  }

  check(
    "the seller-change result has no locks field at all — releasing one is unrepresentable",
    !Object.prototype.hasOwnProperty.call(
      changeSeller(base, "s-003", NO_LOCKS, tierForGrade("C"), LATER),
      "locks",
    ),
  );
  // The boundary that DOES release them is unchanged: one bill, one scope.
  check(
    "saving the bill still releases every lock",
    releaseOnSave().tare === false && releaseOnSave().price === false,
    "scope is one customer / one vehicle — and a seller change is neither",
  );
}

/* ------------------------------------------------------------------ S5 ---- */

function s5Search(): void {
  header("S5: the picker finds a seller by name, code, or a plate this device has seen");

  // Plates come from THIS DEVICE'S bills, newest first — sellers carry no plate.
  const plates = indexPlates([
    { seller_id: "s-003", vehicle_no: "70-1234" },
    { seller_id: "s-001", vehicle_no: "1กก 5678" },
    { seller_id: "s-003", vehicle_no: "70 1234" }, // same plate, written differently
    { seller_id: "s-004", vehicle_no: "  " }, // blank: not a plate
    { seller_id: "s-003", vehicle_no: "82-9999" },
  ]);
  console.log(`  plate index: ${JSON.stringify([...plates.entries()])}`);
  check(
    "the same plate written differently is not recorded twice",
    (plates.get("s-003") ?? []).length === 2,
    `s-003 plates = ${JSON.stringify(plates.get("s-003"))}`,
  );
  check("a blank vehicle_no is not a plate", !plates.has("s-004"));
  check(
    "the newest plate is first",
    (plates.get("s-003") ?? [])[0] === "70-1234",
  );

  const find = (q: string): string[] =>
    searchSellers(SELLERS, q, plates).map((m) => `${m.seller.code}${m.via ? `/${m.via}` : ""}`);

  for (const q of ["", "S003", "สมหญิง", "70-1234", "701234", "70 1234", "แดง", "zzz", "ส 82"]) {
    console.log(`  ${JSON.stringify(q).padEnd(12)} -> ${JSON.stringify(find(q))}`);
  }

  check("an empty query lists everyone, in code order", find("").join(",") === "S001,S002,S003,S004,S005");
  check("an exact code goes to the top", find("S003")[0] === "S003/code");
  check("a name substring matches", find("สมหญิง")[0] === "S003/name");
  check("a plate matches", find("70-1234")[0] === "S003/plate");
  check(
    "separators are ignored — the same plate typed three ways finds the same seller",
    find("701234")[0] === "S003/plate" && find("70 1234")[0] === "S003/plate",
    "though note '70 1234' is TWO tokens, both of which must hit",
  );
  check("a name fragment mid-string matches", find("แดง")[0] === "S002/name");
  check("no match returns nothing rather than everything", find("zzz").length === 0);
  // Two tokens across two DIFFERENT fields. S001's name also starts with "ส",
  // so it is the plate token that eliminates it — which is the whole reason the
  // plate is searchable at all.
  check(
    "every token must hit: 'ส 82' keeps only the seller whose name AND truck both match",
    find("ส 82").join(",") === "S003/name",
    `got ${JSON.stringify(find("ส 82"))} — S001 shares the name prefix but not the truck`,
  );
  check(
    "`via` reports the STRONGEST hit, so the row shows the most identifying reason",
    searchSellers(SELLERS, "ส 82", plates)[0]?.via === "name",
    "name-prefix outranks plate-contains; both were hit",
  );
  check("fold() is comparison-only and never mutates stored text", fold("70-1234") === "701234");
}

/* ------------------------------------------------------------------ S6 ---- */

async function s6DraftSurvivesForceQuit(): Promise<void> {
  header("S6: seller and vehicle_no survive a real SIGKILL, exactly as typed");

  const dir = mkdtempSync(join(tmpdir(), "recycle-2c6-draft-"));
  const file = join(dir, "bills.db");
  const child = fileURLToPath(new URL("./draftCrashChild.js", import.meta.url));

  // A plate with Thai characters, an internal space and a hyphen: the three
  // things most likely to be mangled by a normalise-on-keystroke or an encoding
  // slip (lessons/console-is-not-the-observation.md).
  const PLATE = "1กก 5678-ข";
  const SELLER = "s-003";

  const r = spawnSync(process.execPath, [child, file, "draft-force-quit", SELLER, PLATE], {
    encoding: "utf8",
  });
  for (const line of (r.stdout ?? "").trim().split("\n")) if (line) console.log(`  ${line}`);
  console.log(`  child exit: status=${String(r.status)} signal=${String(r.signal)}`);
  // Windows has no signals: node maps SIGKILL to TerminateProcess, so `signal`
  // comes back null and the exit code is 1. The kill is no less abrupt for it —
  // TerminateProcess runs no handlers and flushes no buffers — but the proof
  // must report what was OBSERVED, not the POSIX semantics it would have had
  // elsewhere. 98 would mean the child errored before ever reaching the kill,
  // 0 that it exited normally; either would make everything below meaningless.
  check(
    "the child really was terminated, not returned from",
    r.status !== 98 && r.status !== 0,
    `status=${String(r.status)} signal=${String(r.signal)}` +
      " — on win32 an abrupt TerminateProcess reports status=1, signal=null",
  );

  // A brand new connection to the file the dead process left behind.
  const driver = NodeSqliteDriver.open(file);
  const store = await SqliteDraftStore.open(driver);
  const restored = await store.load();
  console.log(
    `  restored: seller=${String(restored?.seller_id)}` +
      ` vehicle=${JSON.stringify(restored?.vehicle_no)}` +
      ` lines=${String(restored?.lines.length)}`,
  );

  check("a draft was found after the force-quit", restored !== null);
  check(
    "the chosen seller survived exactly",
    restored?.seller_id === SELLER,
    `seller_id=${String(restored?.seller_id)}`,
  );
  check(
    "the plate survived exactly — Thai characters, internal space and hyphen intact",
    restored?.vehicle_no === PLATE,
    `${JSON.stringify(restored?.vehicle_no)} === ${JSON.stringify(PLATE)}`,
  );
  check("and the line went with it", restored?.lines.length === 1);

  // Round-trip a change of both, then reopen the file again.
  if (restored !== null) {
    const moved = changeSeller(
      setVehicleNo(restored, "  82-9999  ", LATER),
      "s-002",
      NO_LOCKS,
      tierForGrade("A"),
      LATER,
    ).draft;
    await store.save(normaliseVehicleNo(moved, LATER), null);
  }
  await driver.close();

  const driver2 = NodeSqliteDriver.open(file);
  const reopened = await SqliteDraftStore.open(driver2);
  const again = await reopened.load();
  console.log(
    `  after change + reopen: seller=${String(again?.seller_id)} vehicle=${JSON.stringify(again?.vehicle_no)}`,
  );
  check("the changed seller persisted", again?.seller_id === "s-002");
  check(
    "the plate was trimmed at the edge, not on every keystroke",
    again?.vehicle_no === "82-9999",
    `${JSON.stringify(again?.vehicle_no)}`,
  );
  check("a blank plate stores as null, not as an empty string", cleanVehicleNo("   ") === null);
  check(
    "an internal space is never eaten — '70 1234' is typeable",
    cleanVehicleNo(" 70 1234 ") === "70 1234",
  );

  // Windows refuses to remove a directory that still holds an open file — the
  // same trap harness.ts documents. Both connections must be shut first.
  await driver2.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ S7 ---- */

/**
 * The on-device defect from the first 2c-6 device pass: a bill parked on a
 * grade-less seller rendered as
 *
 *   ผิดพลาด: HTTP 424: {"kind":"master_data_missing","code":"seller_grade_unset",
 *   "message":"...","seller_id":"aaaa0000-...-aa"}
 *
 * in red. This proves the three properties that were violated, and it proves
 * them over the EXACT string the transport builds, so a regression has to get
 * past the real diagnostic text rather than a sanitised stand-in.
 */
function s7ParkedIsNotAnError(): void {
  header("S7: a parked bill reads as WAITING, and the raw 424 body cannot reach the screen");

  // Byte-for-byte what httpTransport puts in last_error for the seeded S005 —
  // `HTTP 424: ${JSON.stringify(detail)}`.
  const RAW_LAST_ERROR =
    'HTTP 424: {"kind":"master_data_missing","code":"seller_grade_unset",' +
    '"message":"ผู้ขายรายนี้ยังไม่ได้กำหนดเกรด จึงยังไม่มีราคาตั้งต้น",' +
    '"seller_id":"aaaa0000-0000-0000-0000-0000000000aa"}';
  console.log(`  what used to be rendered, in red:\n    ผิดพลาด: ${RAW_LAST_ERROR}`);

  const forbidden = [
    ["JSON punctuation", '{"'],
    ["the `kind` field", "kind"],
    ["the word master_data_missing", "master_data_missing"],
    ["a raw code", "_unset"],
    ["the HTTP status", "424"],
    ["a UUID", "aaaa0000"],
    ["the word ผิดพลาด", "ผิดพลาด"],
    ["the transport's diagnostic verbatim", RAW_LAST_ERROR],
  ] as const;

  // Every code the server can emit, PLUS the degraded cases.
  const cases: (string | null)[] = [...MASTER_DATA_CODES, null, "some_future_code_2027"];
  for (const code of cases) {
    const r = parkedReason(code);
    console.log(
      `\n  code=${JSON.stringify(code)}${r.unknown ? "  (unrecognised)" : ""}` +
        `\n    badge: ${r.badge}\n    what:  ${r.what}\n    calm:  ${r.reassure}`,
    );

    // One check over ALL the forbidden fragments, naming only what actually
    // leaked. Reporting each needle separately printed "found ..." on lines that
    // had passed, which is a ledger that reads as its own opposite.
    const rendered = `${r.badge} ${r.what} ${r.reassure}`;
    const leaked = forbidden.filter(([, needle]) => rendered.includes(needle));
    check(
      `code=${String(code)}: no JSON, kind, code, status, UUID or ผิดพลาด reaches the screen`,
      leaked.length === 0,
      leaked.length === 0
        ? `${String(forbidden.length)} fragments checked, none present`
        : `LEAKED: ${leaked.map(([l]) => l).join(", ")}`,
    );
    check(
      `code=${String(code)}: every field is a non-empty Thai sentence`,
      r.badge.length > 0 && r.what.length > 0 && r.reassure.length > 0,
    );
    check(
      `code=${String(code)}: it says no action is needed at the yard`,
      r.reassure.includes("ไม่ต้องชั่งใหม่") && r.reassure.includes("ส่งเองอัตโนมัติ"),
      "requirement 4 — the operator must know nothing is owed by them",
    );
  }

  // parkedReason's ONLY input is the code — there is no parameter through which
  // a body could be passed even by mistake. Demonstrated by feeding it the raw
  // diagnostic AS a code: it degrades to the generic sentence and, critically,
  // does not echo what it was given.
  const abused = parkedReason(RAW_LAST_ERROR);
  check(
    "handed the raw body AS the code, it still does not echo it",
    !`${abused.badge} ${abused.what} ${abused.reassure}`.includes("seller_id"),
    "the function cannot launder a body into the UI",
  );
  check(
    "...and reports itself unknown, so the caller can show the code alone",
    abused.unknown,
  );

  // Each cause must name the RIGHT fix. This is the second defect: the status
  // strip hardcoded the price wording, so a grade-less seller was told to set a
  // price — which would never release the bill.
  const grade = parkedReason("seller_grade_unset");
  const price = parkedReason("product_price_unset");
  check(
    "seller_grade_unset tells the office to set the SELLER'S GRADE",
    grade.what.includes("เกรด") && grade.what.includes("ผู้ขาย"),
    grade.what,
  );
  check(
    "product_price_unset tells the office to set the PRODUCT PRICE",
    price.what.includes("ราคาสินค้า"),
    price.what,
  );
  check(
    "the two causes do not share wording — the wrong instruction is not reachable",
    grade.what !== price.what && grade.badge !== price.badge,
  );

  // The strip's one-liner, which must not pick a cause when there are two.
  console.log("");
  for (const [n, codes] of [
    [1, ["seller_grade_unset"]],
    [1, ["product_price_unset"]],
    [3, ["seller_grade_unset", "seller_grade_unset", "product_price_unset"]],
  ] as const) {
    console.log(`  strip(${String(n)}, ${JSON.stringify(codes)})\n    ${parkedSummary(n, codes)}`);
  }
  check(
    "one cause -> the strip names that cause's fix",
    parkedSummary(1, ["seller_grade_unset"]).includes("กำหนดเกรด"),
    parkedSummary(1, ["seller_grade_unset"]),
  );
  check(
    "mixed causes -> the strip names BOTH rather than guessing one",
    parkedSummary(3, ["seller_grade_unset", "product_price_unset"]).includes("ราคาสินค้า") &&
      parkedSummary(3, ["seller_grade_unset", "product_price_unset"]).includes("เกรดผู้ขาย"),
    parkedSummary(3, ["seller_grade_unset", "product_price_unset"]),
  );
  check(
    "the strip never says ผิดพลาด either",
    !parkedSummary(2, ["product_price_unset"]).includes("ผิดพลาด"),
  );
  check(
    "duplicate codes collapse — 3 bills of one cause is still one instruction",
    parkedSummary(3, ["seller_grade_unset", "seller_grade_unset", "seller_grade_unset"]) ===
      parkedSummary(3, ["seller_grade_unset"]),
  );
}

/* ------------------------------------------------------------------ S8 ---- */

/**
 * The narrow state S7 missed, found on device during (c): WHILE ส่งอีกครั้ง is
 * retrying a parked bill.
 *
 * releaseMasterDataBlocked cleared master_data_missing_at and master_data_code
 * but left last_error holding the 424 body, so for the length of the request the
 * row said "not parked" and "here is why it was parked" simultaneously — and the
 * red raw JSON came back.
 *
 * Run against the REAL SqliteLocalStore, through the REAL release path, because
 * the defect was in a SQL UPDATE. A fake would have proven the fake.
 */
async function s8RetryWindowLeaksNothing(): Promise<void> {
  header("S8: while a parked bill is RETRYING, nothing renderable leaks the 424 body");

  const dir = mkdtempSync(join(tmpdir(), "recycle-2c6-retry-"));
  const driver = NodeSqliteDriver.open(join(dir, "bills.db"));
  const store = await SqliteLocalStore.open(driver);
  await signInProofDevice(driver);

  // Byte-exact what httpTransport builds for the seeded grade-less seller.
  const RAW =
    'HTTP 424: {"kind":"master_data_missing","code":"seller_grade_unset",' +
    '"message":"ผู้ขายรายนี้ยังไม่ได้กำหนดเกรด จึงยังไม่มีราคาตั้งต้น",' +
    '"seller_id":"aaaa0000-0000-0000-0000-0000000000aa"}';

  /*
   * Fragments of the 424 BODY. Forbidden in EVERY state, unconditionally — this
   * is the invariant. Only markMasterDataMissing ever writes that text, so no
   * legitimate message can contain any of these.
   */
  const BODY_FRAGMENTS: readonly [string, string][] = [
    ["JSON punctuation", '{"'],
    ["the `kind` field", "kind"],
    ["master_data_missing", "master_data_missing"],
    ["a raw code", "_unset"],
    ["the HTTP status", "424"],
    ["a UUID", "aaaa0000"],
  ];

  /*
   * The word ผิดพลาด is NOT unconditionally forbidden, and asserting that it was
   * is a mistake this proof made first: a genuine 422 IS an error and must say
   * so, loudly. What must never happen is calling a RESOLVABLE refusal one. So
   * the word is permitted for tone "error" and banned for every other tone.
   */
  const ERROR_WORD = "ผิดพลาด";

  /*
   * PHASE 2c-7 NOTE, so this section is not read as stronger evidence than it
   * is. billNotice no longer TAKES last_error — the parameter is gone — so for
   * these six body fragments there is now no longer any input through which they
   * could arrive. These checks are therefore an invariant statement, not a live
   * test; the thing they were guarding is now unrepresentable rather than
   * merely avoided.
   *
   * What is still a live test here, and was the actual defect, is the STORE:
   * releaseMasterDataBlocked must clear last_error in the same statement that
   * retires the parked state. That runs against the real SqliteLocalStore below
   * and would still fail if someone dropped the clause. The live rendering
   * matrix (offline, session-ended, failed, every tone) is proveNotice.
   */
  /** Everything billNotice would put on the card, as one string. */
  const renderable = (b: NoticeInput): string => {
    const n = billNotice(b, "active", "ok");
    return `${n.badge ?? ""} ${n.lines.join(" ")}`;
  };

  const assertClean = (label: string, b: NoticeInput): void => {
    const tone = billNotice(b, "active", "ok").tone;
    const text = renderable(b);
    const leaked = BODY_FRAGMENTS.filter(([, needle]) => text.includes(needle)).map(([l]) => l);
    // Calling a resolvable refusal an error is the original defect, so the word
    // is a leak everywhere except on a genuine error.
    if (tone !== "error" && text.includes(ERROR_WORD)) leaked.push("the word ผิดพลาด");
    check(
      `${label} (tone=${tone})`,
      leaked.length === 0,
      leaked.length === 0
        ? `renders: ${text.trim().slice(0, 56)}…`
        : `LEAKED: ${leaked.join(", ")}`,
    );
  };

  const bill = buildLocalBill(
    { clock: new FakeClock(), ids: new SeqIds("retry") },
    {
      seller_id: "s-005",
      vehicle_no: "S005-TEST",
      total_amount: "150.05",
      master_as_of: null,
      items: [
        {
          id: "item-1", product_id: "prod-FE", line_no: 1,
          gross_weight: "10.005", tare_weight: "0.002", net_weight: "10.003",
          unit_price: "15.00", list_price: "15.00",
        },
      ],
    },
  );
  await store.putBill(bill, PROOF_OWNER);

  const now = new Date("2026-07-26T10:00:00.000Z");

  // ---- state 1: parked (what S7 already covered, re-checked through the store)
  await store.markMasterDataMissing(
    bill.id, "seller_grade_unset", RAW, 1, new Date(now.getTime() + 300_000), now,
  );
  const parked = await store.getBill(bill.id);
  console.log(`  parked      last_error=${parked?.last_error === null ? "null" : "SET (raw 424)"}` +
    `  parkedAt=${parked?.master_data_missing_at === null ? "null" : "set"}`);
  check(
    "the raw diagnostic IS still stored — it is the developer breadcrumb",
    parked?.last_error === RAW,
    "keeping it is deliberate; rendering it is the bug",
  );
  if (parked !== null) assertClean("parked: nothing leaks", parked);

  // ---- state 2: THE DEFECT — released, retry in flight, server has not answered
  const released = await store.releaseMasterDataBlocked(now, true);
  const retrying = await store.getBill(bill.id);
  console.log(
    `  retrying    released=${String(released)}` +
      `  state=${String(retrying?.sync_state)}` +
      `  parkedAt=${String(retrying?.master_data_missing_at)}` +
      `  last_error=${retrying?.last_error === null ? "null" : "SET (raw 424)"}`,
  );
  check("the operator's retry released the bill", released === 1);
  check(
    "it is back in the sendable queue, no longer parked",
    retrying?.sync_state === "pending" && retrying.master_data_missing_at === null,
  );
  check(
    "THE FIX: the stale 424 text did not survive the transition that retired it",
    retrying?.last_error === null,
    `last_error=${retrying?.last_error === null ? "null" : JSON.stringify(retrying?.last_error)}`,
  );
  if (retrying !== null) assertClean("RETRY WINDOW: nothing leaks", retrying);
  /*
   * AMENDED IN 2c-7. This used to assert tone === "none" for the retry window.
   * It is now "waiting": the bill has bounced once (attempt_count = 1, from the
   * 424) and is pending again, which is exactly the state the calm waiting
   * notice describes. What the window must never be is "error" — that was the
   * defect — and it must never carry a diagnostic, which assertClean checks
   * byte-wise on the line below.
   */
  const retryTone = retrying === null ? "?" : billNotice(retrying, "active", "ok").tone;
  check(
    "during the retry the card reads as WAITING, never as an error",
    retryTone === "waiting",
    `tone=${retryTone}`,
  );

  // ---- state 3: it is claimed and sent (syncing), still mid-flight
  await store.claimForSend(bill.id, now);
  const syncing = await store.getBill(bill.id);
  if (syncing !== null) assertClean("in flight (syncing): nothing leaks", syncing);

  // ---- state 4: the office had NOT fixed it, so it parks again
  await store.markMasterDataMissing(
    bill.id, "seller_grade_unset", RAW, 2, new Date(now.getTime() + 300_000), now,
  );
  const reparked = await store.getBill(bill.id);
  if (reparked !== null) assertClean("re-parked: nothing leaks", reparked);
  check(
    "re-parking restores the calm parked presentation",
    reparked !== null && billNotice(reparked, "active", "ok").tone === "parked",
  );

  // ---- state 5: the office fixed it and the bill syncs
  await store.releaseMasterDataBlocked(now, true);
  await store.claimForSend(bill.id, now);
  await store.markSynced(bill.id, "B-2569-105", 3, now);
  const synced = await store.getBill(bill.id);
  console.log(`  synced      doc_no=${String(synced?.doc_no)} last_error=${String(synced?.last_error)}`);
  if (synced !== null) assertClean("synced: nothing leaks", synced);
  check(
    "the bill released itself into a doc_no with nothing re-typed",
    synced?.sync_state === "synced" && synced.doc_no === "B-2569-105",
  );

  // ---- the invariant that replaces the gate, stated over EVERY combination.
  //
  // These are the STATE combinations the card can be in around parking. Note
  // that last_error does not appear: it is no longer an input to billNotice at
  // all (2c-7), which is what makes the leak unrepresentable rather than merely
  // absent. The exhaustive state matrix — offline, session-ended, failed, voided
  // and every tone — lives in proveNotice.
  console.log("");
  const parkedRow = (
    label: string,
    code: string | null,
    voided: boolean,
  ): { label: string; b: NoticeInput } => ({
    label,
    b: {
      sync_state: "pending",
      attempt_count: 1,
      master_data_missing_at: "t",
      master_data_code: code,
      void_requested_at: voided ? "t" : null,
      void_refused_at: null,
      void_refused_code: null,
    },
  });
  const combos: { label: string; b: NoticeInput }[] = [
    parkedRow("parked", "seller_grade_unset", false),
    parkedRow("parked + unknown code", "future_code", false),
    parkedRow("parked + null code", null, false),
    { label: "never attempted", b: { sync_state: "pending", attempt_count: 0, master_data_missing_at: null, master_data_code: null, void_requested_at: null, void_refused_at: null, void_refused_code: null } },
    { label: "terminally failed (422)", b: { sync_state: "failed", attempt_count: 1, master_data_missing_at: null, master_data_code: null, void_requested_at: null, void_refused_at: null, void_refused_code: null } },
    parkedRow("voided while parked", "seller_grade_unset", true),
  ];
  for (const { label, b } of combos) {
    const n = billNotice(b, "active", "ok");
    console.log(`  ${label.padEnd(28)} tone=${n.tone.padEnd(7)} ${n.lines.join(" / ").slice(0, 52)}`);
  }
  for (const { label, b } of combos) assertClean(`combo ${label}: nothing leaks`, b);
  check(
    "a genuine 422 still surfaces as a red error — parking did not silence real failures",
    billNotice(combos[4]!.b, "active", "ok").tone === "error",
    "the fix must not have made every failure calm",
  );
  check(
    "a bill voided while parked shows no send notice — the void region owns the card",
    billNotice(combos[5]!.b, "active", "ok").tone === "none",
  );

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("Phase 2c-6 — per-bill seller selection, headless proof");
  console.log(`node ${process.version}`);

  s1GradeDrivesTheTier();
  s2SellerChangeRedefaultsPendingPrice();
  s3CartLinesKeepTheirPrices();
  s4LocksSurviveASellerChange();
  s5Search();
  await s6DraftSurvivesForceQuit();
  s7ParkedIsNotAnError();
  await s8RetryWindowLeaksNothing();

  console.log("");
  console.log(failures === 0 ? "ALL SELLER CASES PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

const code = await main();
console.log(`SELLER_EXIT=${code}`);
process.exitCode = code;
