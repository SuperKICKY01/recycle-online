/**
 * THE CART'S PRODUCT PICKER — categories, search and the frequent row — proven headless.
 *
 *   npm run prove:productpicker
 *
 * Cart milestone, ADVISOR-DECIDED 2026-10-12 (plan: E:\recycle-shots\lane-a\cart\
 * cart_milestone_plan.md). SRS 2.1 asks for `เลือกกลุ่มสินค้า`; PRODUCT_BLUEPRINT 4.8 for
 * frequent products and search. Everything the cart decides lives in pure modules —
 * src/master/categories.ts and src/cart/productPicker.ts — and this drives exactly those, plus
 * the SQLite cache over node:sqlite (the same store class the phone runs).
 *
 * P0  categories: the device-side join, and the cache round trip (fresh and upgraded file).
 * P1  category browse and search (name, code, category name; active only; empty sentences).
 * P2  the frequent row: frequency order, tie by code, retired excluded, empty-history fallback,
 *     voided / other branch / window, and SAME-DAY STABILITY on the shop's day.
 *
 * Expectations are LITERAL Thai where a sentence is asserted (STRUCTURE.md invariant 12).
 * main() prints `PRODUCTPICKER_EXIT=<n>`; its ABSENCE is the signal.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteMasterStore } from "../adapters/sqlite/SqliteMasterStore.js";
import { joinCategories, type WireCategory, type WireProduct } from "../master/categories.js";
import type { MasterProduct } from "../master/types.js";
import {
  ALL_CATEGORIES,
  categoryChips,
  emptyListLine,
  filterProducts,
  frequentForDay,
  frequentProducts,
  frequentTilesFor,
  type FrequentInput,
} from "../cart/productPicker.js";
import type { LocalBill } from "../sync/types.js";
import { PROOF_OWNER } from "./fakes.js";
import { signInProofDevice } from "./proofDevice.js";

let failures = 0;
let passes = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (ok) passes += 1;
  else failures += 1;
}
function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const wire = (code: string, name: string, category_id: string | null): WireProduct => ({
  id: `p-${code}`, code, name, uom_code: "KG", uom_name: "Kilogram",
  prices: { A: "10.00" }, category_id,
});
const CATS: WireCategory[] = [
  { id: "c-fe", code: "WF-FE", name: "เหล็ก", is_active: true },
  { id: "c-cu", code: "WF-CU", name: "ทองแดงและทองเหลือง", is_active: true },
  { id: "c-old", code: "WF-OLD", name: "หมวดเก่า", is_active: false },
];

/* ------------------------------------------------------------------ P0 ---- */

async function p0Categories(): Promise<void> {
  header("P0 categories: joined on the device, cached, and an upgraded file keeps its rows");
  const joined = joinCategories(
    [
      wire("FE-HEAVY", "เหล็กหนา", "c-fe"),
      wire("CU-PIPE", "ท่อทองแดง", "c-cu"),
      wire("X-RETIRED", "ของในหมวดที่ปิด", "c-old"),
      wire("X-UNKNOWN", "หมวดที่เครื่องไม่รู้จัก", "c-nowhere"),
      wire("X-NONE", "ไม่มีหมวด", null),
    ],
    CATS,
  );
  const cat = (code: string) => joined.find((p) => p.code === code)?.category;
  check("an active category is joined by id: code and Thai name",
    cat("FE-HEAVY")?.code === "WF-FE" && cat("FE-HEAVY")?.name === "เหล็ก", JSON.stringify(cat("FE-HEAVY")));
  check("a RETIRED category joins to null (the product stays, under ทั้งหมด)",
    cat("X-RETIRED") === null && joined.some((p) => p.code === "X-RETIRED"));
  check("an id the category list does not hold joins to null", cat("X-UNKNOWN") === null);
  check("a product with no category joins to null", cat("X-NONE") === null);
  check("a FAILED category read (empty list) keeps every product, all null",
    joinCategories([wire("FE-HEAVY", "เหล็กหนา", "c-fe")], []).every((p) => p.category === null));
  check("the wire's category_id does not leak into the cached shape",
    joined.every((p) => !("category_id" in p)));

  // The cache round trip, on a real file.
  const dir = mkdtempSync(join(tmpdir(), "recycle-picker-"));
  try {
    const d1 = NodeSqliteDriver.open(join(dir, "fresh.db"));
    const m1 = await SqliteMasterStore.open(d1);
    await signInProofDevice(d1);
    await m1.saveProducts(joined, "2026-10-12T01:00:00.000Z");
    await d1.close();
    const d1b = NodeSqliteDriver.open(join(dir, "fresh.db"));
    const back = (await (await SqliteMasterStore.open(d1b)).load()).products;
    const backCat = (code: string) => back.find((p) => p.code === code)?.category;
    check("the category survives a save, a close and a reopen",
      backCat("CU-PIPE")?.id === "c-cu" && backCat("CU-PIPE")?.name === "ทองแดงและทองเหลือง",
      JSON.stringify(backCat("CU-PIPE")));
    check("a null category reads back null, not a half row", backCat("X-RETIRED") === null);
    await d1b.close();

    // AN UPGRADED PHONE: cached_products exists in the shape it had before this milestone, with
    // a row in it. Opening the store must add the three columns, keep the row, and read it as
    // "no category" — never drop it, never refuse to open.
    const d2 = NodeSqliteDriver.open(join(dir, "upgraded.db"));
    await d2.exec(
      "CREATE TABLE cached_products (id TEXT NOT NULL PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL," +
        " uom_code TEXT NOT NULL, uom_name TEXT NOT NULL, prices_json TEXT NOT NULL, owner_tenant_id TEXT) STRICT",
    );
    await d2.run(
      "INSERT INTO cached_products (id, code, name, uom_code, uom_name, prices_json, owner_tenant_id)" +
        " VALUES ('p-old', 'OLD-1', 'สินค้าเก่า', 'KG', 'Kilogram', '{\"A\":\"5.00\"}', ?)",
      [PROOF_OWNER.tenant_id],
    );
    const m2 = await SqliteMasterStore.open(d2);
    await signInProofDevice(d2);
    const cols = (await d2.all<{ name: string }>("PRAGMA table_info(cached_products)")).map((c) => c.name);
    check("the upgrade adds category_id, category_code and category_name",
      ["category_id", "category_code", "category_name"].every((c) => cols.includes(c)), cols.join(","));
    let old: Awaited<ReturnType<typeof m2.load>>["products"][number] | undefined;
    let loadError = "";
    try {
      old = (await m2.load()).products.find((p) => p.code === "OLD-1");
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
    }
    check("the pre-existing row survives the upgrade and reads as no category",
      old !== undefined && old.category === null && old.prices["A"] === "5.00",
      loadError !== "" ? `load threw: ${loadError}` : JSON.stringify(old));
    await d2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------- fixtures --- */

const ref = (id: string, code: string, name: string) => ({ id, code, name });
const FE = ref("c-fe", "WF-FE", "เหล็ก");
const CU = ref("c-cu", "WF-CU", "ทองแดงและทองเหลือง");
const PA = ref("c-pa", "WF-PAPER", "กระดาษ");
const prod = (code: string, name: string, category: ReturnType<typeof ref> | null, is_active = true): MasterProduct => ({
  id: `p-${code}`, code, name, uom_code: "KG", uom_name: "Kilogram", prices: { A: "10.00" }, category, is_active,
});
const CATALOGUE: MasterProduct[] = [
  prod("FE-HEAVY", "เหล็กหนา", FE),
  prod("FE-THIN", "เหล็กบาง", FE),
  prod("CU-PIPE", "ท่อทองแดง", CU),
  prod("BR-VALVE", "วาล์วทองเหลือง", CU),
  prod("PA-CARTON", "กระดาษลัง", PA),
  prod("PA-WHITE", "กระดาษขาวดำ", PA),
  prod("X-NOCAT", "ของไม่มีหมวด", null),
  prod("FE-RETIRED", "เหล็กเลิกรับซื้อ", FE, false),
];

/** A LocalBill carrying only what the derivation reads; the cast is here, once, on purpose. */
function bill(id: string, at: string, codes: string[], opts: { branch?: string; voided?: boolean } = {}): LocalBill {
  return {
    id,
    device_created_at: at,
    void_requested_at: opts.voided === true ? at : null,
    payload: {
      branch_id: opts.branch ?? "br-1",
      items: codes.map((c, i) => ({ id: `${id}-${String(i)}`, product_id: `p-${c}`, line_no: i + 1 })),
    },
  } as unknown as LocalBill;
}
// Shop time is UTC+7: 2026-10-12T05:00Z is 12:00 at the shop on 12 Oct.
const NOW = new Date("2026-10-12T05:00:00.000Z");
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * 86_400_000).toISOString();
const codesOf = (ids: readonly string[]): string => ids.map((i) => i.replace(/^p-/, "")).join(",");

/* ------------------------------------------------------------------ P1 ---- */

function p1SearchAndCategories(): void {
  header("P1 category browse and search: name, code, category name; active only; a sentence for nothing");
  const codes = (ps: MasterProduct[]): string => ps.map((p) => p.code).join(",");
  const chips = categoryChips(CATALOGUE);
  check("the chips are ทั้งหมด then the categories by code (WF-CU, WF-FE, WF-PAPER)",
    chips.map((c) => c.label).join("|") === "ทั้งหมด|ทองแดงและทองเหลือง|เหล็ก|กระดาษ", chips.map((c) => c.label).join("|"));
  check("a category chip lists only its products, in code order",
    codes(filterProducts(CATALOGUE, "c-fe", "")) === "FE-HEAVY,FE-THIN", codes(filterProducts(CATALOGUE, "c-fe", "")));
  check("ทั้งหมด lists every ACTIVE product, uncategorised last",
    codes(filterProducts(CATALOGUE, ALL_CATEGORIES, "")) === "BR-VALVE,CU-PIPE,FE-HEAVY,FE-THIN,PA-CARTON,PA-WHITE,X-NOCAT");
  check("NAME: a Thai substring of the name only finds it (`ท่อ` -> ท่อทองแดง)",
    codes(filterProducts(CATALOGUE, ALL_CATEGORIES, "ท่อ")) === "CU-PIPE", codes(filterProducts(CATALOGUE, ALL_CATEGORIES, "ท่อ")));
  check("CODE: case- and space-insensitive (` pa - white ` -> PA-WHITE)",
    codes(filterProducts(CATALOGUE, ALL_CATEGORIES, " pa - white ")) === "PA-WHITE");
  check("CATEGORY NAME: `ทองเหลือง` finds both products of ทองแดงและทองเหลือง",
    codes(filterProducts(CATALOGUE, ALL_CATEGORIES, "ทองเหลือง")) === "BR-VALVE,CU-PIPE",
    codes(filterProducts(CATALOGUE, ALL_CATEGORIES, "ทองเหลือง")));
  check("whitespace inside a Thai query is ignored (`กระดาษ ลัง` -> กระดาษลัง)",
    codes(filterProducts(CATALOGUE, ALL_CATEGORIES, "กระดาษ ลัง")) === "PA-CARTON");
  check("INACTIVE is never offered: not by name, not in its category, not in ทั้งหมด",
    filterProducts(CATALOGUE, ALL_CATEGORIES, "เลิกรับซื้อ").length === 0 &&
      !filterProducts(CATALOGUE, "c-fe", "").some((p) => p.code === "FE-RETIRED"));
  check("control: the same retired name IS found when the product is active",
    filterProducts([prod("FE-RETIRED", "เหล็กเลิกรับซื้อ", FE, true)], ALL_CATEGORIES, "เลิกรับซื้อ").length === 1);
  check("search and category combine (in เหล็ก, `ทองแดง` matches nothing)",
    filterProducts(CATALOGUE, "c-fe", "ทองแดง").length === 0);
  check("NO MATCH says so, quoting the query — literal Thai",
    filterProducts(CATALOGUE, ALL_CATEGORIES, "แมกนีเซียม").length === 0 &&
      emptyListLine(ALL_CATEGORIES, "แมกนีเซียม") === "ไม่พบสินค้าที่ตรงกับ “แมกนีเซียม”");
  check("an empty category says so (not the no-match sentence)", emptyListLine("c-fe", "  ") === "หมวดนี้ยังไม่มีสินค้า");
}

/* ------------------------------------------------------------------ P2 ---- */

function p2Frequent(): void {
  header("P2 the frequent row: derived from this device's bills, frozen for the shop day");
  const base = { products: CATALOGUE, branchId: "br-1", now: NOW };
  const freq = (bills: LocalBill[], extra: Partial<FrequentInput> = {}) => frequentProducts({ ...base, bills, ...extra });

  const history = [
    bill("b1", daysAgo(0), ["PA-CARTON", "PA-CARTON", "FE-HEAVY"]), // a bill counts once per product
    bill("b2", daysAgo(1), ["PA-CARTON"]),
    bill("b3", daysAgo(2), ["PA-CARTON", "CU-PIPE"]),
    bill("b4", daysAgo(3), ["FE-HEAVY", "CU-PIPE"]),
    bill("b5", daysAgo(4), ["BR-VALVE"]),
    bill("b6", daysAgo(5), ["FE-THIN"]),
  ];
  const r = freq(history);
  check("FREQUENCY ORDER: most bills first (PA-CARTON 3, then the 2s, then the 1s)",
    codesOf(r.productIds).startsWith("PA-CARTON,") && r.source === "history", codesOf(r.productIds));
  check("TIE BY CODE: equal counts order by product code ascending (CU-PIPE before FE-HEAVY; BR-VALVE before FE-THIN)",
    codesOf(r.productIds) === "PA-CARTON,CU-PIPE,FE-HEAVY,BR-VALVE,FE-THIN", codesOf(r.productIds));
  check("a bill counts ONCE per product however many lines (PA-CARTON is 3, not 4)",
    freq([bill("x", daysAgo(0), ["PA-CARTON", "PA-CARTON"])]).productIds.length === 1);
  check("at most 6", freq([...history, bill("b7", daysAgo(1), ["PA-WHITE"]), bill("b8", daysAgo(1), ["X-NOCAT"])]).productIds.length === 6);

  const retired = freq([...history, bill("r1", daysAgo(0), ["FE-RETIRED"]), bill("r2", daysAgo(0), ["FE-RETIRED"]),
    bill("r3", daysAgo(0), ["FE-RETIRED"]), bill("r4", daysAgo(0), ["FE-RETIRED"])]);
  check("RETIRED never appears, even as the most-bought product (4 bills)",
    !codesOf(retired.productIds).includes("FE-RETIRED"), codesOf(retired.productIds));
  check("control: the same product IS first when active",
    codesOf(frequentProducts({ ...base, products: [...CATALOGUE.filter((p) => p.code !== "FE-RETIRED"),
      prod("FE-RETIRED", "เหล็กเลิกรับซื้อ", FE, true)], bills: [bill("r1", daysAgo(0), ["FE-RETIRED"]),
      bill("r2", daysAgo(0), ["FE-RETIRED"])] }).productIds) === "FE-RETIRED");

  const fallback = freq([]);
  check("EMPTY HISTORY: falls back to the first products in category order, marked fallback",
    fallback.source === "fallback" && codesOf(fallback.productIds) === "BR-VALVE,CU-PIPE,FE-HEAVY,FE-THIN,PA-CARTON,PA-WHITE",
    `${fallback.source}: ${codesOf(fallback.productIds)}`);
  check("only voided / other-branch / out-of-window bills is ALSO empty history -> fallback",
    freq([bill("v", daysAgo(0), ["CU-PIPE"], { voided: true }), bill("o", daysAgo(0), ["CU-PIPE"], { branch: "br-2" }),
      bill("old", daysAgo(30), ["CU-PIPE"])]).source === "fallback");
  check("a VOIDED bill does not count", !codesOf(freq([bill("v", daysAgo(0), ["CU-PIPE"], { voided: true }),
    bill("k", daysAgo(0), ["FE-THIN"])]).productIds).includes("CU-PIPE"));
  check("ANOTHER BRANCH's bill does not count; with the branch unknown it does",
    !freq([bill("o", daysAgo(0), ["CU-PIPE"], { branch: "br-2" }), bill("k", daysAgo(0), ["FE-THIN"])]).productIds.includes("p-CU-PIPE") &&
      freq([bill("o", daysAgo(0), ["CU-PIPE"], { branch: "br-2" })], { branchId: null }).productIds.includes("p-CU-PIPE"));
  check("the WINDOW is 30 shop days: 29 days ago counts, 30 days ago does not",
    freq([bill("in", daysAgo(29), ["CU-PIPE"])]).source === "history" && freq([bill("out", daysAgo(30), ["CU-PIPE"])]).source === "fallback");

  // SAME-DAY STABILITY.
  let calls = 0;
  const compute = (bills: LocalBill[]) => (now: Date) => { calls += 1; return frequentProducts({ ...base, bills, now }); };
  const morning = frequentForDay(null, NOW, true, compute(history));
  const noonBills = [...history, ...Array.from({ length: 5 }, (_, i) => bill(`n${String(i)}`, daysAgo(0), ["X-NOCAT"]))];
  const noon = frequentForDay(morning, new Date(NOW.getTime() + 3 * 3_600_000), true, compute(noonBills));
  check("SAME DAY: later in the shop day the row is the SAME object, not recomputed, despite 5 new bills",
    noon === morning && calls === 1, `calls=${String(calls)} ${codesOf(noon?.productIds ?? [])}`);
  const tomorrow = frequentForDay(morning, new Date(NOW.getTime() + 24 * 3_600_000), true, compute(noonBills));
  check("NEXT SHOP DAY: recomputed, and the new bills now lead",
    tomorrow !== morning && codesOf(tomorrow?.productIds ?? []).startsWith("X-NOCAT") && calls === 2,
    codesOf(tomorrow?.productIds ?? []));
  check("never frozen before the catalogue is ready (ready=false keeps null)",
    frequentForDay(null, NOW, false, compute(history)) === null && calls === 2);
  // Shop midnight is 17:00Z: 16:59Z and 17:01Z are different shop days.
  const late = frequentForDay(null, new Date("2026-10-12T16:59:00.000Z"), true, compute(history));
  const after = frequentForDay(late, new Date("2026-10-12T17:01:00.000Z"), true, compute(history));
  check("the day is the SHOP's (UTC+7): 16:59Z and 17:01Z are different shop days",
    late?.day === "2026-10-12" && after?.day === "2026-10-13" && after !== late, `${String(late?.day)} -> ${String(after?.day)}`);
}

/* ------------------------------------------------------------------ P3 ---- */

/*
 * THE SCREENS RENDER THE PICKER, AND DECIDE NOTHING. app/ and App.tsx are outside the node program,
 * so their TEXT is read (as proveSheets.ts does). What a source scan cannot see — that the device
 * draws it — is the walk's before/after screenshots.
 */
function p3ScreensWireThePicker(): void {
  header("P3 the cart renders the picker's outputs; App derives the frequent row from EVERY bill");
  const cart = readFileSync(join(process.cwd(), "app", "CartScreen.tsx"), "utf8");
  const app = readFileSync(join(process.cwd(), "App.tsx"), "utf8");
  check("control: both sources were read", cart.includes("export function CartScreen") && app.includes("function AppInner"));
  check("the cart's list is filterProducts(products, categoryId, query) — no flat products.map left",
    cart.includes("filterProducts(products, categoryId, query)") && !/\{products\.map\(/.test(cart));
  check("the chips are categoryChips(products), each announcing selected",
    cart.includes("categoryChips(products)") && /onPress=\{\(\) => setCategoryId\(c\.id\)\}[\s\S]{0,80}selected=\{on\}/.test(cart));
  check("an empty list is worded by emptyListLine; the search placeholder is SEARCH_PLACEHOLDER",
    cart.includes("emptyListLine(categoryId, query)") && cart.includes("placeholder={SEARCH_PLACEHOLDER}"));
  check("the row heading is history -> FREQUENT_HEADING, fallback -> FALLBACK_HEADING",
    cart.includes('frequent?.source === "history" ? FREQUENT_HEADING : FALLBACK_HEADING'));
  check("ROW SIZE: 6 tiles at font scale 1.0, 3 above 1.15 (two lines would push the list below the fold at 1.3)",
    frequentTilesFor(1.0) === 6 && frequentTilesFor(1.15) === 6 && frequentTilesFor(1.3) === 3,
    `${String(frequentTilesFor(1.0))}/${String(frequentTilesFor(1.3))}`);
  check("the cart draws frequentTilesFor(fontScale) tiles, read from useWindowDimensions",
    cart.includes(".slice(0, frequentTilesFor(fontScale))") && cart.includes("const { fontScale } = useWindowDimensions();"));
  check("App derives the row in refresh() from ALL bills, held by frequentForDay (frozen for the shop day)",
    /setFrequent\(\(prev\) =>\s*frequentForDay\(prev, new Date\(\), productsRef\.current\.length > 0, \(now\) =>\s*frequentProducts\(\{ bills: all, products: productsRef\.current, branchId: branchRef\.current, now \}\)/.test(app));
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("prove:productpicker — categories, search and the frequent row, headless");
  await p0Categories();
  p1SearchAndCategories();
  p2Frequent();
  p3ScreensWireThePicker();
  console.log("");
  console.log(`  passes=${String(passes)}  failures=${String(failures)}`);
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

process.exitCode = 1;
main()
  .then((code) => {
    console.log(`PRODUCTPICKER_EXIT=${String(code)}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.log(`  [FAIL] the run died: ${err instanceof Error ? err.message : String(err)}`);
    console.log("PRODUCTPICKER_EXIT=1");
    process.exitCode = 1;
  });
