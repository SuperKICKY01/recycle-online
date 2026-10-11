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
 *
 * Expectations are LITERAL Thai where a sentence is asserted (STRUCTURE.md invariant 12).
 * main() prints `PRODUCTPICKER_EXIT=<n>`; its ABSENCE is the signal.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteMasterStore } from "../adapters/sqlite/SqliteMasterStore.js";
import { joinCategories, type WireCategory, type WireProduct } from "../master/categories.js";
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

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("prove:productpicker — categories, search and the frequent row, headless");
  await p0Categories();
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
