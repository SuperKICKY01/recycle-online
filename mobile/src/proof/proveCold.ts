/**
 * Phase 2c-8 proof: THE APP FROM A COLD START, AND WHAT IT IS WILLING TO CLAIM
 * ABOUT A PRICE.
 *
 * Run: npm run prove:cold
 *
 * Two questions, and the second is the one that costs money.
 *
 *   1. With the server unreachable and nothing in memory, can the yard still
 *      pick a seller, weigh, save and queue? C8 answers it against a REAL TCP
 *      port with nothing listening — not a fake transport — because "offline"
 *      that is simulated by a class that returns a rejected promise proves the
 *      engine's branch and says nothing about fetch, the URL, or the timeout.
 *
 *   2. When the price on the screen came out of a cache, what does the app say,
 *      and when does it stop volunteering a number? C1/C2/C5 answer that, and
 *      C2 carries the disproof: the same inputs through the pre-2c-8 behaviour,
 *      with the money it costs printed in baht.
 *
 * ON THE OUTPUT. Mostly Thai. If the console shows mojibake that is the console
 * — this box is codepage 874, see lessons/console-is-not-the-observation.md.
 * Every assertion compares JavaScript strings, unaffected by how a terminal
 * draws them.
 */
import { createServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HttpTransport } from "../adapters/httpTransport.js";
import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteDraftStore } from "../adapters/sqlite/SqliteDraftStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { SqliteMasterStore } from "../adapters/sqlite/SqliteMasterStore.js";
import {
  addLine,
  buildLine,
  cartTotal,
  changeSeller,
  newDraft,
  toBillItems,
} from "../cart/cart.js";
import type { GradeTiers } from "../cart/cart.js";
import { NO_LOCKS, onProductChange } from "../cart/entry.js";
import { gradePrice } from "../cart/sellers.js";
import type { Draft } from "../cart/types.js";
import {
  assessFreshness,
  defaultUnitPrice,
  FRESH_MAX_AGE_MS,
  masterNotice,
  PRICE_DEFAULT_MAX_AGE_MS,
  pricingProvenanceLine,
  stalePriceHint,
  thaiAge,
} from "../master/freshness.js";
import type { Freshness } from "../master/freshness.js";
import type { MasterProduct, MasterSeller } from "../master/types.js";
import { MemoryTokenStore } from "../session/tokenStore.js";
import { buildLocalBill } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import { statusNotice } from "../sync/statusNotice.js";
import { systemClock } from "../sync/systemClock.js";
import { FakeClock, RejectingTransport, SeqIds } from "./fakes.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/** One check over a whole sweep, naming offenders instead of printing per cell. */
function checkAll<T>(
  label: string,
  cells: readonly T[],
  ok: (cell: T) => boolean,
  describe: (cell: T) => string,
): void {
  const bad = cells.filter((c) => !ok(c));
  check(
    label,
    bad.length === 0,
    bad.length === 0
      ? `${String(cells.length)} cells, all clean`
      : `${String(bad.length)}/${String(cells.length)} FAILED: ${bad.slice(0, 4).map(describe).join(" | ")}`,
  );
}

/* ------------------------------------------------------- forbidden text ---- */

/**
 * Nothing the operator reads may contain a developer diagnostic. Same list and
 * same reasoning as proveNotice — the 2c-6 defect was a raw transport string
 * rendered in red — extended with what a cold start can now produce: a refused
 * TCP connection and a keystore.
 */
const DIAGNOSTIC_FRAGMENTS: readonly (readonly [string, string])[] = [
  ["a network error string", "network"],
  ["the React Native transport message", "Network request failed"],
  ["an HTTP status line", "HTTP"],
  ["the 401 status", "401"],
  ["a refused connection", "ECONNREFUSED"],
  ["the word fetch", "fetch"],
  ["JSON punctuation", '{"'],
  ["a stringified null", "null"],
  ["a stringified undefined", "undefined"],
  ["a UUID", "0000-0000"],
  ["the word cache", "cache"],
  ["the word token", "token"],
  ["an ISO-shaped date", "T0"],
];

const leaks = (text: string): string[] =>
  DIAGNOSTIC_FRAGMENTS.filter(([, needle]) => text.includes(needle)).map(([l]) => l);

/* ------------------------------------------------------------- fixtures --- */

const HOUR = 60 * 60 * 1000;
const NOW = "2026-07-27T02:00:00.000Z"; // 09:00 Bangkok — a yard opening
const nowMs = new Date(NOW).getTime();
const ago = (ms: number): string => new Date(nowMs - ms).toISOString();

/**
 * The office raised the steel price overnight: 15.00 -> 16.50 at grade B.
 * The device's cache still holds the old number. Every money figure in this
 * proof comes from this one pair.
 */
const CACHED_FE_B = "15.00";
const TODAY_FE_B = "16.50";

const PRODUCTS: MasterProduct[] = [
  {
    id: "prod-FE",
    code: "FE-STEEL",
    name: "เหล็กรวม",
    uom_code: "KG",
    uom_name: "กิโลกรัม",
    // Trailing zeros and a 3dp-looking value on purpose: a NUMERIC column would
    // eat them, which is the whole reason prices_json is TEXT.
    prices: { A: "15.50", B: CACHED_FE_B, C: "14.50", D: "14.00" },
  },
  {
    id: "prod-CU",
    code: "CU-WIRE",
    name: "สายทองแดง",
    uom_code: "KG",
    uom_name: "กิโลกรัม",
    prices: { A: "210.00", B: "205.500" },
  },
];

const SELLERS: MasterSeller[] = [
  { id: "sell-001", code: "S-001", name: "สมชาย", phone: "0812345678", grade: "B" },
  { id: "sell-002", code: "S-002", name: "สมหญิง", phone: null, grade: null },
];

const freshnessAt = (productsAgeMs: number | null, sellersAgeMs: number | null): Freshness =>
  assessFreshness({
    productsFetchedAt: productsAgeMs === null ? null : ago(productsAgeMs),
    sellersFetchedAt: sellersAgeMs === null ? null : ago(sellersAgeMs),
    now: NOW,
  });

/** The GradeTiers the app builds — reference from the cache, default gated. */
function tiersFor(
  products: readonly MasterProduct[],
  grade: string | null,
  f: Freshness,
): GradeTiers {
  const reference = (productId: string): string | null => {
    const p = products.find((x) => x.id === productId);
    return p === undefined ? null : gradePrice(p.prices, grade);
  };
  return { reference, pendingDefault: (id) => defaultUnitPrice(reference(id), f) };
}

/* ------------------------------------------------------------------ C1 ---- */

interface Cell {
  productsAge: number | null;
  sellersAge: number | null;
}

const describeCell = (c: Cell): string =>
  `products=${c.productsAge === null ? "never" : thaiAge(c.productsAge)}` +
  `/sellers=${c.sellersAge === null ? "never" : thaiAge(c.sellersAge)}`;

function c1FreshnessMatrix(): void {
  header("C1: how old is the data, over every combination of the two caches");

  /*
   * The ages include both sides of both thresholds AND the FUTURE, because a
   * device clock that has moved backwards is the case that would otherwise
   * render as "0 minutes old" and unlock a price default (hard rule 7: device
   * clocks are untrusted).
   */
  const AGES: (number | null)[] = [
    null,
    -2 * HOUR, // dated in the future — the clock moved
    0,
    FRESH_MAX_AGE_MS - 60_000,
    FRESH_MAX_AGE_MS + 60_000,
    3 * HOUR,
    PRICE_DEFAULT_MAX_AGE_MS - 60_000,
    PRICE_DEFAULT_MAX_AGE_MS + 60_000,
    14 * HOUR,
    5 * 24 * HOUR,
  ];

  const cells: Cell[] = [];
  for (const productsAge of AGES) {
    for (const sellersAge of AGES) cells.push({ productsAge, sellersAge });
  }
  const f = (c: Cell): Freshness => freshnessAt(c.productsAge, c.sellersAge);

  console.log("  products      sellers       | state  default? message");
  for (const c of cells.filter((x) => x.sellersAge === 3 * HOUR || x.productsAge === null)) {
    const r = f(c);
    const n = masterNotice(r);
    console.log(
      `  ${(c.productsAge === null ? "never" : thaiAge(c.productsAge)).padEnd(13)}` +
        ` ${(c.sellersAge === null ? "never" : thaiAge(c.sellersAge)).padEnd(13)}` +
        ` | ${r.state.padEnd(6)} ${(r.mayDefaultPrice ? "yes" : "NO ").padEnd(8)}` +
        ` ${n === null ? "(nothing to say)" : n.message.slice(0, 60)}`,
    );
  }

  checkAll(
    "a price is defaulted ONLY when both lists exist and neither is past the cutoff",
    cells,
    (c) => {
      const r = f(c);
      const worst = Math.max(c.productsAge ?? Infinity, c.sellersAge ?? Infinity);
      const inFuture = Math.min(c.productsAge ?? 0, c.sellersAge ?? 0) < -FRESH_MAX_AGE_MS;
      const expected =
        c.productsAge !== null &&
        c.sellersAge !== null &&
        !inFuture &&
        worst <= PRICE_DEFAULT_MAX_AGE_MS;
      return r.mayDefaultPrice === expected;
    },
    describeCell,
  );

  /*
   * THE PROPERTY THE asOf DESIGN EXISTS FOR. A product list fetched one second
   * ago does not make a week-old seller GRADE current, and the grade is what
   * selects the tier — so the pair is only as good as its older half.
   */
  const mixed = cells.filter(
    (c) =>
      (c.productsAge === 0 && c.sellersAge !== null && c.sellersAge > PRICE_DEFAULT_MAX_AGE_MS) ||
      (c.sellersAge === 0 && c.productsAge !== null && c.productsAge > PRICE_DEFAULT_MAX_AGE_MS),
  );
  checkAll(
    "one list being seconds old does NOT rescue the other — the older half bounds it",
    mixed,
    (c) => !f(c).mayDefaultPrice,
    describeCell,
  );
  check("...and that sweep was not empty", mixed.length === 6, `${String(mixed.length)} mixed cells`);

  const future = cells.filter(
    (c) => (c.productsAge ?? 0) < -FRESH_MAX_AGE_MS || (c.sellersAge ?? 0) < -FRESH_MAX_AGE_MS,
  );
  checkAll(
    "a fetch dated in the FUTURE fails closed — an unknowable age never defaults a price",
    future.filter((c) => c.productsAge !== null && c.sellersAge !== null),
    (c) => !f(c).mayDefaultPrice && f(c).clockSuspect,
    describeCell,
  );

  checkAll(
    "the strip says nothing only when the data is genuinely just-fetched",
    cells,
    (c) => (masterNotice(f(c)) === null) === (f(c).state === "fresh"),
    describeCell,
  );
  checkAll(
    "the BLOCKING tone appears only when a list has never been fetched",
    cells,
    (c) => (masterNotice(f(c))?.tone === "block") === (f(c).state === "empty"),
    describeCell,
  );
  checkAll(
    "no message leaks a diagnostic",
    cells,
    (c) => leaks(masterNotice(f(c))?.message ?? "").length === 0,
    (c) => `${describeCell(c)} leaked ${leaks(masterNotice(f(c))?.message ?? "").join(", ")}`,
  );
  checkAll(
    "every message that exists is non-empty and names a date or a fix",
    cells,
    (c) => {
      const m = masterNotice(f(c));
      return m === null || (m.message.trim().length > 20 && m.message.includes("เครื่อง"));
    },
    describeCell,
  );

  /*
   * A STALE cache must never say the yard cannot work — it can, and telling it
   * otherwise would cost a shift for a warning. An EMPTY one must never promise
   * that it can, because it cannot.
   */
  const staleCells = cells.filter((c) => f(c).state === "stale");
  checkAll(
    "stale says bills can still be saved as normal",
    staleCells,
    (c) => (masterNotice(f(c))?.message ?? "").includes("บันทึกบิลได้ตามปกติ"),
    describeCell,
  );
  const emptyCells = cells.filter((c) => f(c).state === "empty");
  checkAll(
    "empty never claims a bill can be saved, and always says what unblocks it",
    emptyCells,
    (c) => {
      const m = masterNotice(f(c))?.message ?? "";
      return !m.includes("บันทึกบิลได้ตามปกติ") && m.includes("เข้าสู่ระบบ");
    },
    describeCell,
  );
  check(
    "...and both sweeps were not empty",
    staleCells.length > 0 && emptyCells.length > 0,
    `${String(staleCells.length)} stale, ${String(emptyCells.length)} empty`,
  );
}

/* ------------------------------------------------------------------ C2 ---- */

/**
 * THE DISPROOF, in baht.
 *
 * Every assertion in C1 is worthless unless something could have made it fail.
 * This is that something: the pre-2c-8 expression, which defaulted from the
 * cache unconditionally because there was no cache and therefore no age to
 * consider. Run against the overnight price change, on a real load.
 */
function c2TheGateAndTheMoney(): void {
  header("C2: what the gate is worth — the overnight price change, in baht");

  const stale = freshnessAt(14 * HOUR, 14 * HOUR);
  const fresh = freshnessAt(60_000, 60_000);
  const tier = gradePrice(PRODUCTS[0]!.prices, "B");

  /** app/CartScreen.tsx before this phase: the tier went straight into the box. */
  const preFixDefault = (): string | null => tier;

  const NET_KG = "2000.000";
  const cachedPay = Number(CACHED_FE_B) * 2000;
  const todayPay = Number(TODAY_FE_B) * 2000;

  console.log(`  overnight: grade B steel ${CACHED_FE_B} -> ${TODAY_FE_B} บาท/kg`);
  console.log(`  a ${NET_KG} kg load:`);
  console.log(`    at the cached price: ${String(cachedPay)} บาท`);
  console.log(`    at today's price:    ${String(todayPay)} บาท`);
  console.log(`    difference the yard would underpay: ${String(todayPay - cachedPay)} บาท`);
  console.log(`  BEFORE (14h-old cache): the price box was pre-filled with ${String(preFixDefault())}`);
  console.log(`  AFTER  (14h-old cache): the price box is ${JSON.stringify(defaultUnitPrice(tier, stale))}`);
  console.log(`  AFTER  (1m-old cache):  the price box is ${JSON.stringify(defaultUnitPrice(tier, fresh))}`);

  check(
    "BEFORE, a 14-hour-old cached price really was written into the money field",
    preFixDefault() === CACHED_FE_B,
    "so C1's sweep is not vacuous",
  );
  check(
    "AFTER, it is not defaulted — the operator enters the agreed price",
    defaultUnitPrice(tier, stale) === null,
  );
  check(
    "AFTER, a current cache still defaults normally — the gate is not a ban on defaults",
    defaultUnitPrice(tier, fresh) === CACHED_FE_B,
  );

  /*
   * THE SPLIT. Withholding the default must not throw the cached number away:
   * it is the only price information the device holds, and the operator needs it
   * beside the empty box. Reference and default are different questions.
   */
  const tiers = tiersFor(PRODUCTS, "B", stale);
  check(
    "the grade REFERENCE survives staleness — it is a comparison value, not an assertion",
    tiers.reference("prod-FE") === CACHED_FE_B,
  );
  check(
    "...while the same product's DEFAULT is withheld",
    tiers.pendingDefault("prod-FE") === null,
  );

  const hint = stalePriceHint(tier, stale) ?? "";
  console.log(`  the line under the empty box:\n    ${hint}`);
  check("the hint names the cached number so it is evidence, not a secret", hint.includes(CACHED_FE_B));
  check("the hint says why the box is empty", hint.includes("ไม่ได้กรอกราคาให้"));
  check("the hint leaks nothing", leaks(hint).length === 0);
  check(
    "and there is no hint at all when the data is current",
    stalePriceHint(tier, fresh) === null,
  );

  /*
   * THE NEIGHBOUR. Fixing the product-selection default and leaving the
   * seller-change default is precisely the mistake
   * lessons/correct-classification-can-still-render-as-an-error.md was amended
   * for, so it is asserted rather than assumed.
   */
  const startedFresh = onProductChange(
    { product_id: null, gross: "", tare: "", price: "" },
    NO_LOCKS,
    { productId: "prod-FE", listPrice: defaultUnitPrice(tier, stale) ?? "" },
  );
  check(
    "picking a product with a stale cache leaves the price box empty",
    startedFresh.price === "",
  );

  const d: Draft = {
    ...newDraft("d-1", "sell-002", NOW, ago(14 * HOUR)),
    form: { product_id: "prod-FE", gross: "10.000", tare: "0.000", price: "" },
  };
  const changed = changeSeller(d, "sell-001", NO_LOCKS, tiers, NOW);
  check(
    "changing the seller with a stale cache ALSO leaves it empty — the same rule through the other door",
    changed.draft.form.price === "",
    `price=${JSON.stringify(changed.draft.form.price)}`,
  );
  const changedFresh = changeSeller(d, "sell-001", NO_LOCKS, tiersFor(PRODUCTS, "B", fresh), NOW);
  check(
    "...and with a current cache the seller change still re-defaults, as it always did",
    changedFresh.draft.form.price === CACHED_FE_B,
  );
}

/* ------------------------------------------------------------------ C3 ---- */

async function c3CacheOnDisk(): Promise<void> {
  header("C3: the cache is on a real file, survives a real restart, and money stays TEXT");

  const dir = mkdtempSync(join(tmpdir(), "recycle-2c8-cache-"));
  const file = join(dir, "recycle.db");
  let driver = NodeSqliteDriver.open(file);
  let master = await SqliteMasterStore.open(driver);

  await master.saveProducts(PRODUCTS, ago(3 * HOUR));
  await master.saveSellers(SELLERS, ago(90 * 60 * 1000));

  // A GENUINE restart: the connection is closed and the file reopened.
  await driver.close();
  driver = NodeSqliteDriver.open(file);
  master = await SqliteMasterStore.open(driver);
  const snap = await master.load();

  console.log(
    `  reopened: ${String(snap.products.length)} products, ${String(snap.sellers.length)} sellers`,
  );
  console.log(`  products fetched_at ${String(snap.productsFetchedAt)}`);
  console.log(`  sellers  fetched_at ${String(snap.sellersFetchedAt)}`);

  check(
    "both lists come back whole",
    snap.products.length === 2 && snap.sellers.length === 2,
  );
  check(
    "the two timestamps are independent — they were written by separate saves",
    snap.productsFetchedAt === ago(3 * HOUR) &&
      snap.sellersFetchedAt === ago(90 * 60 * 1000) &&
      snap.productsFetchedAt !== snap.sellersFetchedAt,
  );
  check(
    "every price survives byte-identical, trailing zeros included",
    snap.products.find((p) => p.id === "prod-FE")?.prices["B"] === CACHED_FE_B &&
      snap.products.find((p) => p.id === "prod-CU")?.prices["B"] === "205.500",
    `CU grade B = ${JSON.stringify(snap.products.find((p) => p.id === "prod-CU")?.prices["B"])}`,
  );
  check(
    "every price is still a JS string — nothing became a number on the way through",
    snap.products.every((p) => Object.values(p.prices).every((v) => typeof v === "string")),
  );
  const affinity = await driver.all<{ t: string }>(
    "SELECT typeof(prices_json) t FROM cached_products",
  );
  check(
    "and SQLite is storing them as text, not real",
    affinity.every((r) => r.t === "text"),
    `typeof() = ${affinity.map((r) => r.t).join(",")}`,
  );
  check(
    "a null grade round-trips as null, not as the string \"null\"",
    snap.sellers.find((s) => s.id === "sell-002")?.grade === null,
  );

  /*
   * ATOMICITY. A refresh is delete-all + insert-all + stamp. If that were not
   * one transaction, a failure in the middle would leave HALF a list wearing a
   * FRESH timestamp — strictly worse than no cache, because the operator would
   * be told it is current. Forced here with a duplicate primary key, which is a
   * real constraint violation and not a stubbed throw.
   */
  const poisoned = [...PRODUCTS, { ...PRODUCTS[0]!, code: "DUPLICATE" }];
  let threw = false;
  try {
    await master.saveProducts(poisoned, NOW);
  } catch {
    threw = true;
  }
  const after = await master.load();
  check("a save that fails part-way does throw rather than half-succeed", threw);
  check(
    "the PREVIOUS list is still intact — nothing was left half-written",
    after.products.length === 2 &&
      after.products.find((p) => p.id === "prod-FE")?.code === "FE-STEEL",
    `${String(after.products.length)} products, first code=${String(after.products[0]?.code)}`,
  );
  check(
    "and the timestamp did NOT move — a failed refresh must not claim freshness",
    after.productsFetchedAt === ago(3 * HOUR),
    `fetched_at = ${String(after.productsFetchedAt)}`,
  );

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ C4 ---- */

async function c4ColdStartEmpty(): Promise<void> {
  header("C4: cold start with an EMPTY cache — what does the operator actually see?");

  const dir = mkdtempSync(join(tmpdir(), "recycle-2c8-empty-"));
  const driver = NodeSqliteDriver.open(join(dir, "recycle.db"));
  const master = await SqliteMasterStore.open(driver);
  const tokens = new MemoryTokenStore(); // never signed in

  const snap = await master.load();
  const token = await tokens.load();
  const f = assessFreshness({
    productsFetchedAt: snap.productsFetchedAt,
    sellersFetchedAt: snap.sellersFetchedAt,
    now: NOW,
  });
  const notice = masterNotice(f);

  console.log(`  restored token: ${token === null ? "(none)" : "yes"}`);
  console.log(`  products: ${String(snap.products.length)}  sellers: ${String(snap.sellers.length)}`);
  console.log(`  the strip reads:\n    ${notice?.message ?? "(nothing)"}`);
  console.log(`  the start-a-bill button is: ${f.state === "empty" ? "DISABLED" : "enabled"}`);

  check("a fresh install genuinely has nothing", snap.products.length === 0 && snap.sellers.length === 0);
  check("...and no token", token === null);
  check("the state is 'empty', not 'stale' — never fetched is not the same as old", f.state === "empty");
  check("no price may be defaulted from nothing", !f.mayDefaultPrice);
  check(
    "the message names BOTH missing lists, so nobody hunts for the wrong problem",
    (notice?.message ?? "").includes("รายชื่อผู้ขายและรายการสินค้า"),
  );
  check(
    "it says what unblocks it, and does not pretend a bill can be written",
    (notice?.message ?? "").includes("ต้องต่อเน็ตและเข้าสู่ระบบ") &&
      !(notice?.message ?? "").includes("บันทึกบิลได้ตามปกติ"),
  );
  check("it is the blocking tone", notice?.tone === "block");
  check("and it leaks nothing", leaks(notice?.message ?? "").length === 0);

  // Only ONE list missing must name only that list. Same screen, different fix.
  await master.saveProducts(PRODUCTS, ago(HOUR));
  const half = await master.load();
  const hf = assessFreshness({
    productsFetchedAt: half.productsFetchedAt,
    sellersFetchedAt: half.sellersFetchedAt,
    now: NOW,
  });
  const hm = masterNotice(hf);
  console.log(`  with products only:\n    ${hm?.message ?? "(nothing)"}`);
  check(
    "with only the seller list missing, the message names the seller list alone",
    (hm?.message ?? "").includes("รายชื่อผู้ขาย") && !(hm?.message ?? "").includes("รายการสินค้า"),
  );
  check("and it is still blocking — half the data cannot start a bill", hf.state === "empty");

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ C5 ---- */

async function c5ColdStartStale(): Promise<void> {
  header("C5: cold start with a STALE cache — the yard works, the app stops guessing prices");

  const dir = mkdtempSync(join(tmpdir(), "recycle-2c8-stale-"));
  const file = join(dir, "recycle.db");
  let driver = NodeSqliteDriver.open(file);
  let master = await SqliteMasterStore.open(driver);

  // Yesterday evening, 17:00 Bangkok. The yard opens at 09:00 with no server.
  const lastNight = ago(16 * HOUR);
  await master.saveProducts(PRODUCTS, lastNight);
  await master.saveSellers(SELLERS, lastNight);
  await driver.close();

  driver = NodeSqliteDriver.open(file);
  master = await SqliteMasterStore.open(driver);
  const snap = await master.load();
  const f = assessFreshness({
    productsFetchedAt: snap.productsFetchedAt,
    sellersFetchedAt: snap.sellersFetchedAt,
    now: NOW,
  });
  const notice = masterNotice(f);

  console.log(`  cache age: ${thaiAge(f.ageMs ?? 0)}   state: ${f.state}`);
  console.log(`  the strip reads:\n    ${notice?.message ?? "(nothing)"}`);

  check("the seller list is still fully usable", snap.sellers.length === 2);
  check("the product list is still fully usable", snap.products.length === 2);
  check("but no price is defaulted", !f.mayDefaultPrice);
  check("the message states the age", (notice?.message ?? "").includes("16 ชั่วโมง"));
  check(
    "the message is amber, not blocking — this yard can work",
    notice?.tone === "warn" && (notice.message).includes("บันทึกบิลได้ตามปกติ"),
  );
  check(
    "it tells the operator what to do instead of just what is wrong",
    (notice?.message ?? "").includes("ต้องกรอกราคาที่ตกลงกับผู้ขายเอง"),
  );

  // A bill is still perfectly writable — with the price entered by hand.
  const tiers = tiersFor(snap.products, "B", f);
  let d = newDraft("d-stale", "sell-001", NOW, f.asOf);
  const typed = "16.50"; // what the operator was told this morning
  const line = buildLine({
    id: "line-1",
    product_id: "prod-FE",
    product_code: "FE-STEEL",
    product_name: "เหล็กรวม",
    uom_code: "KG",
    gross: "2000.000",
    tare: "0.000",
    price: typed,
    list_price: tiers.reference("prod-FE") ?? typed,
  });
  check("a hand-priced line still validates and computes", line.ok);
  if (line.ok) {
    d = addLine(d, line.line, NOW);
    console.log(`  hand-priced line: ${line.line.net_weight} kg x ${line.line.unit_price} = ${line.line.amount}`);
    check("the money is the operator's number, not the cached one", line.line.unit_price === TODAY_FE_B);
    check(
      "the cached tier is still recorded as the reference, so the difference is visible",
      line.line.list_price === CACHED_FE_B,
    );
    check("the cart totals normally", cartTotal(d) === "33000.00", cartTotal(d));
  }
  check("and the draft carries WHICH data it was priced against", d.master_as_of === lastNight);

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ C6 ---- */

async function c6RefetchReplaces(): Promise<void> {
  header("C6: refetch-on-open replaces the list, and a row that has gone away fails closed");

  const dir = mkdtempSync(join(tmpdir(), "recycle-2c8-refetch-"));
  const driver = NodeSqliteDriver.open(join(dir, "recycle.db"));
  const master = await SqliteMasterStore.open(driver);

  await master.saveSellers(SELLERS, ago(3 * HOUR));
  await master.saveProducts(PRODUCTS, ago(3 * HOUR));

  // The operator opens the picker; the office has since ADDED a seller and
  // DELETED another. This is the round trip the picker fires on open.
  const ADDED: MasterSeller = {
    id: "sell-003", code: "S-003", name: "ร้านเก่ง", phone: null, grade: "A",
  };
  const serverNow: MasterSeller[] = [SELLERS[0]!, ADDED];
  await master.saveSellers(serverNow, NOW);
  const after = await master.load();

  console.log(`  after refetch: ${after.sellers.map((s) => s.code).join(", ")}`);
  check(
    "a seller added at the office appears without a force-quit",
    after.sellers.some((s) => s.id === "sell-003"),
  );
  check(
    "a seller deleted at the office DISAPPEARS — the cache is replaced, not merged",
    !after.sellers.some((s) => s.id === "sell-002"),
  );
  check(
    "the product list is untouched by a seller refresh",
    after.products.length === 2 && after.productsFetchedAt === ago(3 * HOUR),
  );

  /*
   * A DRAFT ALREADY FILED TO THE DELETED SELLER. The bill in progress belongs to
   * someone this device can no longer identify. CartScreen resolves seller from
   * draft.seller_id against the list and blocks entry AND saving when it is
   * null (Phase 2c-6); what is asserted here is that the CACHE really does
   * produce that null rather than keeping a ghost alive.
   */
  const orphan = newDraft("d-orphan", "sell-002", NOW, ago(3 * HOUR));
  const resolved = after.sellers.find((s) => s.id === orphan.seller_id) ?? null;
  check(
    "a draft filed to the deleted seller no longer resolves — the screen's 'cannot save' state",
    resolved === null,
  );

  /*
   * A PRODUCT THAT HAS GONE AWAY, and the defect the 2c-8 CartScreen fix closes.
   *
   * HONEST ABOUT WHAT THIS IS: CartScreen cannot be imported by a proof (app/
   * reaches expo-constants), so both expressions are reproduced here verbatim
   * and run against the same cache. That catches the rule going wrong; it does
   * not catch someone editing the screen to stop using it.
   */
  await master.saveProducts([PRODUCTS[1]!], NOW); // prod-FE deleted at the office
  const now2 = await master.load();
  const formProductId = "prod-FE"; // still in the open draft's form
  const resolvedProduct = now2.products.find((p) => p.id === formProductId) ?? null;

  const mkLine = (productId: string) =>
    buildLine({
      id: "line-x",
      product_id: productId,
      product_code: resolvedProduct?.code ?? "",
      product_name: resolvedProduct?.name ?? "",
      uom_code: resolvedProduct?.uom_code ?? "",
      gross: "2000.000",
      tare: "0.000",
      price: "15.00",
      list_price: "15.00",
    });

  const before = mkLine(formProductId); // pre-fix: the raw form value
  const nowResult = mkLine(resolvedProduct?.id ?? ""); // after: the resolved one

  console.log(`  pre-fix  -> ok=${String(before.ok)}${before.ok ? ` code=${JSON.stringify(before.line.product_code)} amount=${before.line.amount}` : ""}`);
  console.log(`  post-fix -> ok=${String(nowResult.ok)}${nowResult.ok ? "" : ` field=${nowResult.field} error=${nowResult.error}`}`);

  check(
    "BEFORE, a deleted product still committed a line — blank name, real money",
    before.ok && before.line.product_code === "" && before.line.amount === "30000.00",
    "the server would then refuse the whole bill, after the cash was paid",
  );
  check(
    "AFTER, it fails closed as 'no product chosen' — which the form already refuses",
    !nowResult.ok && nowResult.field === "product" && nowResult.error === "no_product",
  );

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ C7 ---- */

async function c7DeletedSellerFailsVisibly(): Promise<void> {
  header("C7: a bill filed to a seller the server no longer has fails VISIBLY, not quietly");

  const dir = mkdtempSync(join(tmpdir(), "recycle-2c8-gone-"));
  const driver = NodeSqliteDriver.open(join(dir, "recycle.db"));
  const store = await SqliteLocalStore.open(driver);
  const ids = new SeqIds("gone");

  const bill = buildLocalBill(
    { clock: systemClock, ids },
    {
      seller_id: "sell-002", // deleted at the office while the yard was offline
      vehicle_no: "70-1234",
      total_amount: "30000.00",
      items: [
        {
          id: ids.newId(), product_id: "prod-FE", line_no: 1,
          gross_weight: "2000.000", tare_weight: "0.000", net_weight: "2000.000",
          unit_price: "15.00", list_price: "15.00",
        },
      ],
      master_as_of: ago(16 * HOUR),
    },
  );
  await store.putBill(bill);

  const engine = new SyncEngine({
    store,
    // 422: "seller_id does not exist in this tenant" — the real server answer.
    transport: new RejectingTransport(),
    clock: systemClock,
    backoffBaseMs: 1000,
  });
  const run = await engine.runOnce();
  const row = await store.getBill(bill.id);

  console.log(`  one pass: rejected=${String(run.rejected)} state=${String(row?.sync_state)}`);
  check(
    "the server refuses it terminally — the device does not retry forever",
    run.rejected === 1 && row?.sync_state === "failed",
  );
  check(
    "the bill is KEPT — it is the only record that cash left the drawer (hard rule 5)",
    (await store.listByState("failed")).length === 1,
  );
  check(
    "no price was ever invented for it — unit_price is what was entered",
    row?.payload.items[0]?.unit_price === "15.00",
  );
  check(
    "and it still records which master data it was priced from",
    row?.master_as_of === ago(16 * HOUR),
  );

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ C8 ---- */

/** A TCP port with nothing on it: bound to get a free one, then released. */
async function deadPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      if (addr === null || typeof addr === "string") {
        reject(new Error("no port"));
        return;
      }
      const port = addr.port;
      s.close(() => resolve(port));
    });
  });
}

/**
 * THE WHOLE PHASE, END TO END, WITH THE SERVER GENUINELY UNREACHABLE.
 *
 * Not OfflineTransport. A fake that returns a rejected promise proves the
 * ENGINE's branch and nothing about fetch, the URL, the abort timeout, or how a
 * refused connection actually surfaces. This talks to a real address on the
 * loopback with nothing listening, through the production HttpTransport and the
 * runtime's own fetch.
 */
async function c8ColdStartNoServer(): Promise<void> {
  header("C8: cold start, server GENUINELY unreachable — the yard writes a bill anyway");

  const port = await deadPort();
  const baseUrl = `http://127.0.0.1:${String(port)}`;
  console.log(`  server address: ${baseUrl} (bound to obtain the port, then closed)`);

  const dir = mkdtempSync(join(tmpdir(), "recycle-2c8-cold-"));
  const file = join(dir, "recycle.db");

  /* ---- yesterday: the device was online once, and everything was cached. */
  {
    const d = NodeSqliteDriver.open(file);
    const m = await SqliteMasterStore.open(d);
    await m.saveProducts(PRODUCTS, ago(16 * HOUR));
    await m.saveSellers(SELLERS, ago(16 * HOUR));
    await d.close();
  }
  const tokens = new MemoryTokenStore("eyJ-a-token-saved-yesterday");

  /* ---- this morning: a genuine cold start. New process, new connection. */
  const driver = NodeSqliteDriver.open(file);
  const billStore = await SqliteLocalStore.open(driver);
  const draftStore = await SqliteDraftStore.open(driver);
  const masterStore = await SqliteMasterStore.open(driver);

  const snap = await masterStore.load();
  const token = await tokens.load();
  const f = assessFreshness({
    productsFetchedAt: snap.productsFetchedAt,
    sellersFetchedAt: snap.sellersFetchedAt,
    now: NOW,
  });

  console.log(`  boot: token=${token === null ? "none" : "restored"}` +
    ` products=${String(snap.products.length)} sellers=${String(snap.sellers.length)}` +
    ` freshness=${f.state}`);
  check("the token came back without the network", token !== null);
  check("so did the master data", snap.products.length === 2 && snap.sellers.length === 2);
  check("and the app knows the data is stale", f.state === "stale" && !f.mayDefaultPrice);

  /* ---- the refresh attempt fails, and changes nothing. */
  const transport = new HttpTransport({
    baseUrl,
    getToken: () => Promise.resolve(token),
    fetchImpl: (input, init) => fetch(input, init),
    timeoutMs: 4000,
  });

  let fetchFailed = false;
  let fetchError = "";
  try {
    await fetch(`${baseUrl}/products`, { headers: { authorization: `Bearer ${token ?? ""}` } });
  } catch (err) {
    fetchFailed = true;
    fetchError = err instanceof Error ? err.message : String(err);
  }
  console.log(`  GET /products -> ${fetchFailed ? `threw: ${fetchError}` : "ANSWERED (!!)"}`);
  check(
    "the server really is unreachable — a real fetch to it really does fail",
    fetchFailed,
    "if this passes trivially the rest of the case proves nothing",
  );
  const afterFailedRefresh = await masterStore.load();
  check(
    "a failed refresh leaves the cache exactly as it was",
    afterFailedRefresh.products.length === 2 &&
      afterFailedRefresh.productsFetchedAt === snap.productsFetchedAt,
  );

  /* ---- pick a seller, weigh, save. */
  const chosen = snap.sellers.find((s) => s.id === "sell-001");
  check("a seller can be picked from the cache", chosen !== undefined);
  const ids = new SeqIds("cold");
  let draft = newDraft(ids.newId(), "sell-001", NOW, f.asOf);
  await draftStore.save(draft);

  const tiers = tiersFor(snap.products, chosen?.grade ?? null, f);
  check("no price is offered for it", tiers.pendingDefault("prod-FE") === null);

  const line = buildLine({
    id: ids.newId(),
    product_id: "prod-FE",
    product_code: "FE-STEEL",
    product_name: "เหล็กรวม",
    uom_code: "KG",
    gross: "2000.000",
    tare: "0.000",
    price: TODAY_FE_B, // typed by the operator
    list_price: tiers.reference("prod-FE") ?? TODAY_FE_B,
  });
  if (!line.ok) throw new Error("the cold-start line must build");
  draft = addLine(draft, line.line, NOW);
  await draftStore.save(draft);

  const bill = buildLocalBill(
    { clock: systemClock, ids },
    {
      seller_id: draft.seller_id,
      vehicle_no: "70-1234",
      total_amount: cartTotal(draft),
      items: toBillItems(draft),
      master_as_of: draft.master_as_of,
    },
  );
  await draftStore.promoteToBill(draft, bill);

  const saved = await billStore.getBill(bill.id);
  console.log(`  saved offline: ${String(saved?.payload.total_amount)} บาท, state=${String(saved?.sync_state)}, doc_no=${String(saved?.doc_no)}`);
  check("the bill is on disk, with no server involved at any point", saved !== null);
  check("it is queued to send", saved?.sync_state === "pending");
  check(
    "it has no doc_no yet, and the UI must say so (hard rule 3)",
    saved?.doc_no === null,
  );
  check("the draft is gone — exactly one of {draft, bill} exists", (await draftStore.load()) === null);

  /* ---- the engine tries, against the dead port. */
  const engine = new SyncEngine({
    store: billStore,
    transport,
    clock: systemClock,
    backoffBaseMs: 1000,
    backoffMaxMs: 5000,
  });
  const run = await engine.runOnce();
  const afterSend = await billStore.getBill(bill.id);
  console.log(
    `  one send pass: attempted=${String(run.attempted)} retryable=${String(run.retryable)}` +
      ` rejected=${String(run.rejected)} sessionExpired=${String(run.sessionExpired)}`,
  );
  console.log(`  bill after: state=${String(afterSend?.sync_state)} attempts=${String(afterSend?.attempt_count)}`);

  check("the send was attempted and bounced", run.attempted === 1 && run.retryable === 1);
  check("nothing was rejected — an unreachable server is not a verdict", run.rejected === 0);
  check(
    "and it was not mistaken for an expired session either",
    run.sessionExpired === 0,
  );
  check("the bill is back to pending — still owed, forever", afterSend?.sync_state === "pending");
  check(
    "the POISON clock did NOT start: an unreachable server is not a server refusing this bill",
    afterSend?.first_server_error_at === null && afterSend?.server_error_attempts === 0,
    "otherwise a morning outage would tell the yard to ring support",
  );

  /* ---- what the two strips say to the operator, right now. */
  const strip = statusNotice({
    session: "active", // a restored token is treated as usable until a 401 says otherwise
    online: false,
    pending: 1,
    failed: 0,
    blocked: null,
    waitingOnMasterData: 0,
    masterDataCodes: [],
  });
  const master = masterNotice(f);
  console.log(`  status strip: ${strip.message}`);
  console.log(`  data strip:   ${master?.message ?? "(nothing)"}`);
  check("the status strip says offline and that the bill is held, not lost", strip.message.includes("ออฟไลน์") && strip.message.includes("1"));
  check("it does not tell them to sign in — the token is restored and untested", strip.action === null);
  check("the data strip is the one that talks about prices", (master?.message ?? "").includes("ราคา"));
  check("neither strip leaks a diagnostic", leaks(strip.message).length === 0 && leaks(master?.message ?? "").length === 0);

  /* ---- restart again, still offline. Nothing may be lost. */
  await driver.close();
  const driver2 = NodeSqliteDriver.open(file);
  const billStore2 = await SqliteLocalStore.open(driver2);
  const masterStore2 = await SqliteMasterStore.open(driver2);
  const survivor = await billStore2.getBill(bill.id);
  const snap2 = await masterStore2.load();
  check(
    "after a second cold start the bill is still queued and still whole",
    survivor?.sync_state === "pending" &&
      survivor.payload.total_amount === "33000.00" &&
      survivor.payload.items.length === 1,
  );
  check("and the cache is still there to write the next one", snap2.sellers.length === 2);

  await driver2.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ C9 ---- */

async function c9ProvenanceSurvives(): Promise<void> {
  header("C9: a bill priced from stale data is distinguishable afterwards");

  const dir = mkdtempSync(join(tmpdir(), "recycle-2c8-prov-"));
  const file = join(dir, "recycle.db");
  let driver = NodeSqliteDriver.open(file);
  let draftStore = await SqliteDraftStore.open(driver);
  let billStore = await SqliteLocalStore.open(driver);

  const lastNight = ago(16 * HOUR);
  const ids = new SeqIds("prov");
  let draft = newDraft(ids.newId(), "sell-001", NOW, lastNight);
  const line = buildLine({
    id: ids.newId(), product_id: "prod-FE", product_code: "FE-STEEL",
    product_name: "เหล็กรวม", uom_code: "KG",
    gross: "2000.000", tare: "0.000", price: CACHED_FE_B, list_price: CACHED_FE_B,
  });
  if (!line.ok) throw new Error("line must build");
  draft = addLine(draft, line.line, NOW);
  await draftStore.save(draft);

  // A real restart before promotion: the stamp has to be on DISK, not in a
  // React state that a force-quit takes with it.
  await driver.close();
  driver = NodeSqliteDriver.open(file);
  draftStore = await SqliteDraftStore.open(driver);
  billStore = await SqliteLocalStore.open(driver);
  const restored = await draftStore.load();
  check("the draft's stamp survives a restart", restored?.master_as_of === lastNight);

  /*
   * A REFRESH LANDS MID-CART. The cache is now current — and the stamp must NOT
   * move, because the lines already in the cart were priced before it. Moving it
   * is the false negative that would make this marker worthless.
   */
  const masterStore = await SqliteMasterStore.open(driver);
  await masterStore.saveProducts(PRODUCTS, NOW);
  await masterStore.saveSellers(SELLERS, NOW);
  if (restored !== null) await draftStore.save({ ...restored, updated_at: NOW });
  const afterRefresh = await draftStore.load();
  check(
    "a refresh mid-cart does NOT move it — the lines were priced before that",
    afterRefresh?.master_as_of === lastNight,
    `stamp = ${String(afterRefresh?.master_as_of)}`,
  );

  // A FIXED clock, not systemClock: this case asserts a rendered AGE, which is
  // device_created_at minus master_as_of. With the real wall clock the sentence
  // would read differently every day the proof is run — the assertion would be
  // measuring when someone typed `npm run prove:cold`.
  const bill = buildLocalBill(
    { clock: new FakeClock(NOW), ids },
    {
      seller_id: "sell-001", vehicle_no: null,
      total_amount: cartTotal(afterRefresh!),
      items: toBillItems(afterRefresh!),
      master_as_of: afterRefresh!.master_as_of,
    },
  );
  await draftStore.promoteToBill(afterRefresh!, bill);
  const row = await billStore.getBill(bill.id);

  check("the stamp is carried onto the bill", row?.master_as_of === lastNight);
  check(
    "and it is NOT on the wire — there is nowhere on the server to put it",
    !Object.prototype.hasOwnProperty.call(row?.payload ?? {}, "master_as_of") &&
      !JSON.stringify(row?.payload).includes("master_as_of"),
  );

  const line1 = pricingProvenanceLine(row!);
  console.log(`  the bill card reads:\n    ${String(line1)}`);
  check("the card says the prices came from old data", line1 !== null);
  check("...and names when, and how old", (line1 ?? "").includes("16 ชั่วโมง"));
  check("...without leaking anything", leaks(line1 ?? "").length === 0);

  // The overpayment shape this exists to explain: the server stamps TODAY's list
  // price, so the row arrives looking like a deliberate override.
  console.log(
    `  on the server this row will read unit_price=${CACHED_FE_B} list_price=${TODAY_FE_B}` +
      ` — identical in shape to a staff override`,
  );

  // A bill priced from CURRENT data says nothing, and a legacy bill does not
  // pretend to know.
  check(
    "a bill priced from current data says nothing at all",
    pricingProvenanceLine({ master_as_of: NOW, device_created_at: NOW }) === null,
  );
  check(
    "a bill written before this existed says nothing rather than guessing 'fresh'",
    pricingProvenanceLine({ master_as_of: null, device_created_at: NOW }) === null,
  );

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ----------------------------------------------------------------- C10 ---- */

async function c10TokenContract(): Promise<void> {
  header("C10: the token store contract (and what this canNOT prove)");

  const store = new MemoryTokenStore();
  check("a device that has never signed in has no token", (await store.load()) === null);
  await store.save("token-A");
  check("a saved token comes back", (await store.load()) === "token-A");
  await store.save("token-B");
  check("a second sign-in replaces it rather than adding one", (await store.load()) === "token-B");
  await store.clear();
  check("clearing really clears", (await store.load()) === null);

  console.log("");
  console.log("  NOT PROVEN HERE, and it must be checked on the phone:");
  console.log("    expo-secure-store is a native module and cannot run under node, so");
  console.log("    src/device/secureTokenStore.ts is UNVERIFIED. What node can show is");
  console.log("    that the app only ever uses the contract above — that the value");
  console.log("    survives a real process death is the device step.");
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("Phase 2c-8 — cold start, the master-data cache, and what a price may claim");
  console.log(`node ${process.version}`);
  console.log(
    `thresholds: fresh <= ${thaiAge(FRESH_MAX_AGE_MS)},` +
      ` price default withdrawn past ${thaiAge(PRICE_DEFAULT_MAX_AGE_MS)}`,
  );

  c1FreshnessMatrix();
  c2TheGateAndTheMoney();
  await c3CacheOnDisk();
  await c4ColdStartEmpty();
  await c5ColdStartStale();
  await c6RefetchReplaces();
  await c7DeletedSellerFailsVisibly();
  await c8ColdStartNoServer();
  await c9ProvenanceSurvives();
  await c10TokenContract();

  console.log("");
  console.log(failures === 0 ? "ALL COLD-START CASES PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

const code = await main();
console.log(`COLD_EXIT=${code}`);
process.exitCode = code;
