/**
 * SELLER SEARCH (C3) — every axis, the ranking insert, the reason line, and the cache — proven
 * headless.
 *
 *   npm run prove:sellersearch
 *
 * Seller search, ADVISOR-DECIDED 2026-10-12 (PRODUCT_BLUEPRINT 5.5, QR deferred). One search box
 * finds a seller by name, phone, plate (the usual truck AND the plates this device's bills
 * recorded), code, or the last four of the ID. Everything the picker decides lives in the pure
 * module src/cart/sellers.ts (searchSellers, sellerRowText, foldPhone, idLast4) and the cache in
 * SqliteMasterStore; this drives exactly those, the cache over node:sqlite.
 *
 * S0  the cache: id_last4 and vehicle_no survive save/close/reopen; an upgraded file gains the
 *     two columns and keeps its row; NO id_number column exists, and an id_number on the object
 *     handed to saveSellers is not stored.
 * S1  each axis: phone (+66, dashes, spaces), last four, usual-truck plate, bill plate, name
 *     (Thai substring), code (case-insensitive).
 * S2  the ranking insert: exact code, exact phone, exact last four, prefix, plate, substring —
 *     in that order; ties by code as before.
 * S3  the row's two lines: why it matched, and two same-name sellers told apart.
 *
 * Expectations are LITERAL Thai where a sentence is asserted (STRUCTURE.md invariant 12).
 * main() prints `SELLERSEARCH_EXIT=<n>`; its ABSENCE is the signal.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteMasterStore } from "../adapters/sqlite/SqliteMasterStore.js";
import {
  SELLER_SEARCH_HINT,
  SELLER_SEARCH_PLACEHOLDER,
  foldPhone,
  idLast4,
  searchSellers,
  sellerRowText,
  type SellerOption,
} from "../cart/sellers.js";
import type { MasterSeller } from "../master/types.js";
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

// Fake values in the walk fixture's pattern (phone 081-000-01NN, ID 9900000 + 6 digits).
const SOMCHAI_1: SellerOption = {
  id: "s-1", code: "WS01", name: "สมชาย ใจดี", grade: "A",
  phone: "081-000-0101", id_last4: "1137", vehicle_no: "1กก 1001",
};
const SOMCHAI_2: SellerOption = {
  id: "s-2", code: "WS02", name: "สมชาย ใจดี", grade: "B",
  phone: "081-000-0102", id_last4: "1274", vehicle_no: "70-2002",
};
const NO_ID: SellerOption = {
  id: "s-3", code: "WS03", name: "สมหญิง รักษ์ดี", grade: "B",
  phone: null, id_last4: null, vehicle_no: null,
};
const PLAIN: SellerOption = { id: "s-4", code: "S001", name: "ร้านเจริญ", grade: "A" };
const SELLERS = [SOMCHAI_1, SOMCHAI_2, NO_ID, PLAIN];
const BILL_PLATES = new Map<string, readonly string[]>([["s-3", ["9ฌฌ 7777"]]]);

const ids = (q: string, sellers: readonly SellerOption[] = SELLERS) =>
  searchSellers(sellers, q, BILL_PLATES).map((m) => m.seller.id);
const first = (q: string) => searchSellers(SELLERS, q, BILL_PLATES)[0];
/** A row's text, or an empty one when the query found nothing (the cell then FAILs, not throws). */
const textOf = (q: string) => {
  const m = first(q);
  return m === undefined ? { meta: "(no match)", reason: null } : sellerRowText(m);
};

/* ------------------------------------------------------------------ S0 ---- */

async function s0Cache(): Promise<void> {
  header("S0 the cache: last four and usual truck kept offline; NO full ID stored");
  const dir = mkdtempSync(join(tmpdir(), "recycle-sellersearch-"));
  try {
    const d1 = NodeSqliteDriver.open(join(dir, "fresh.db"));
    const m1 = await SqliteMasterStore.open(d1);
    await signInProofDevice(d1);
    // What GET /sellers hands an ADMIN since 0024: the full ID rides on the object.
    const fromWire = {
      id: "s-1", code: "WS01", name: "สมชาย ใจดี", phone: "081-000-0101", grade: "A",
      id_last4: "1137", vehicle_no: "1กก 1001", id_number: "9900000001137", address: "ที่อยู่",
    } as MasterSeller;
    await m1.saveSellers([fromWire], "2026-10-12T01:00:00.000Z");
    await d1.close();
    const d1b = NodeSqliteDriver.open(join(dir, "fresh.db"));
    const back = (await (await SqliteMasterStore.open(d1b)).load()).sellers;
    const row = back.find((s) => s.id === "s-1");
    check("S0a id_last4 and vehicle_no survive a save, a close and a reopen",
      row?.id_last4 === "1137" && row?.vehicle_no === "1กก 1001", JSON.stringify(row));
    const cols = (await d1b.all<{ name: string }>("PRAGMA table_info(cached_sellers)")).map((c) => c.name);
    check("S0b cached_sellers has NO id_number and NO address column",
      !cols.includes("id_number") && !cols.includes("address") && cols.includes("id_last4"), cols.join(","));
    check("S0c the read-back object carries no id_number, though the saved one did",
      row !== undefined && !("id_number" in row) && !("address" in row), JSON.stringify(row));
    await d1b.close();

    // AN UPGRADED PHONE: cached_sellers in its pre-search shape, with a row.
    const d2 = NodeSqliteDriver.open(join(dir, "upgraded.db"));
    await d2.exec(
      "CREATE TABLE cached_sellers (id TEXT NOT NULL PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL," +
        " phone TEXT, grade TEXT, owner_tenant_id TEXT) STRICT",
    );
    await d2.run(
      "INSERT INTO cached_sellers (id, code, name, phone, grade, owner_tenant_id)" +
        " VALUES ('s-old', 'S900', 'ผู้ขายเก่า', NULL, 'A', ?)",
      [PROOF_OWNER.tenant_id],
    );
    const m2 = await SqliteMasterStore.open(d2);
    await signInProofDevice(d2);
    const cols2 = (await d2.all<{ name: string }>("PRAGMA table_info(cached_sellers)")).map((c) => c.name);
    check("S0d the upgrade adds id_last4 and vehicle_no",
      cols2.includes("id_last4") && cols2.includes("vehicle_no"), cols2.join(","));
    let old: MasterSeller | undefined;
    let err = "";
    try {
      old = (await m2.load()).sellers.find((s) => s.code === "S900");
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    check("S0e the pre-existing row survives and reads with no last four and no truck",
      old !== undefined && old.id_last4 === null && old.vehicle_no === null,
      err !== "" ? `load threw: ${err}` : JSON.stringify(old));
    await d2.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/* ------------------------------------------------------------------ S1 ---- */

function s1Axes(): void {
  header("S1 each axis");
  check("S1a foldPhone: +66, dashes and spaces fold to the dialled 0 form",
    foldPhone("+66 81-000-0101") === "0810000101" && foldPhone("081 000 0101") === "0810000101"
      && foldPhone("(081) 000.0101") === "0810000101", foldPhone("+66 81-000-0101"));
  for (const q of ["+66 81-000-0101", "+66810000101", "081-000-0101", "081 000 0101", "0810000101"]) {
    const m = first(q);
    check(`S1b phone ${JSON.stringify(q)} -> WS01 first, via phone`,
      m?.seller.id === "s-1" && m.via === "phone", `${m?.seller.code} via ${m?.via}`);
  }
  const l4 = searchSellers(SELLERS, "1137", BILL_PLATES);
  check("S1c last four '1137' -> WS01 alone, via id", l4.length === 1 && l4[0]?.via === "id",
    l4.map((m) => `${m.seller.code}/${m.via}`).join(","));
  check("S1d a seller with NO last four is never matched by one", !ids("1274").includes("s-3")
    && ids("1274").join() === "s-2");
  const plate = first("1กก 1001");
  check("S1e the USUAL truck, typed with its space -> WS01, via plate, the hit is the stored plate",
    plate?.seller.id === "s-1" && plate.via === "plate" && plate.hit === "1กก 1001",
    `${plate?.seller.code} ${plate?.via} ${plate?.hit}`);
  check("S1f the usual truck written without the space or with a dash matches the same",
    ids("1กก1001").join() === "s-1" && ids("1กก-1001").join() === "s-1", ids("1กก1001").join());
  const bill = first("9ฌฌ7777");
  check("S1g a plate from this device's BILLS still matches (WS03 has no usual truck)",
    bill?.seller.id === "s-3" && bill.via === "plate" && bill.hit === "9ฌฌ 7777", `${bill?.seller.code}`);
  check("S1h name, Thai substring: 'ใจดี' -> both Somchais and nobody else",
    ids("ใจดี").sort().join() === "s-1,s-2", ids("ใจดี").join());
  const code = first("ws02");
  check("S1i code, case-insensitive: 'ws02' -> WS02 first, via code",
    code?.seller.id === "s-2" && code.via === "code", `${code?.seller.code} ${code?.via}`);
  check("S1j two tokens still split on a name + a truck: 'สมชาย 2002' -> WS02 alone",
    ids("สมชาย 2002").join() === "s-2", ids("สมชาย 2002").join());
  check("S1k idLast4 (the local-row rule) drops dashes and spaces, null under four",
    idLast4("1-2345-67890-12-3") === "0123" && idLast4("12") === null && idLast4(null) === null,
    String(idLast4("1-2345-67890-12-3")));
}

/* ------------------------------------------------------------------ S2 ---- */

function s2Ranking(): void {
  header("S2 the ranking insert: exact code, exact phone, exact last four, prefix, plate, substring");
  const rank: SellerOption[] = [
    { id: "r-contains", code: "Z9", name: "บ้าน 7070 ตลาด", grade: "A" },
    { id: "r-plate", code: "Z8", name: "รถ", grade: "A", vehicle_no: "1ขข 7070" },
    { id: "r-prefix", code: "7070X", name: "ก", grade: "A" },
    { id: "r-last4", code: "Z6", name: "ข", grade: "A", id_last4: "7070" },
    { id: "r-phone", code: "Z5", name: "ค", grade: "A", phone: "7070" },
    { id: "r-code", code: "7070", name: "ง", grade: "A" },
  ];
  const order = searchSellers(rank, "7070", new Map()).map((m) => m.seller.id);
  check("S2a '7070' orders code, phone, last four, prefix, plate, substring",
    order.join() === "r-code,r-phone,r-last4,r-prefix,r-plate,r-contains", order.join());
  const ties: SellerOption[] = [
    { id: "t-b", code: "B2", name: "x", grade: "A", id_last4: "5555" },
    { id: "t-a", code: "A1", name: "y", grade: "A", id_last4: "5555" },
  ];
  check("S2b two exact last-four hits tie, broken by code as today",
    searchSellers(ties, "5555", new Map()).map((m) => m.seller.code).join() === "A1,B2");
}

/* ------------------------------------------------------------------ S3 ---- */

function s3Lines(): void {
  header("S3 what the row says");
  check("S3a placeholder and hint (impeccable · clarify)",
    SELLER_SEARCH_PLACEHOLDER === "ค้นหา: ชื่อ / เบอร์ / ทะเบียน / รหัส"
      && SELLER_SEARCH_HINT === "หรือพิมพ์เลขบัตรประชาชน 4 ตัวท้าย");
  const byPhone = textOf("+66 81-000-0101");
  check("S3b a phone hit says ตรงกับ เบอร์ … and the meta does not repeat the phone",
    byPhone.reason === "ตรงกับ เบอร์ 081-000-0101" && byPhone.meta === "WS01 · ทะเบียน 1กก 1001",
    JSON.stringify(byPhone));
  const byId = textOf("1137");
  check("S3c a last-four hit says ตรงกับ บัตร …1137, and the ID appears only as its last four",
    byId.reason === "ตรงกับ บัตร …1137" && !byId.meta.includes("1137"), JSON.stringify(byId));
  const byPlate = textOf("1001");
  check("S3d a plate hit says ตรงกับ ทะเบียน …, and the meta does not repeat that plate",
    byPlate.reason === "ตรงกับ ทะเบียน 1กก 1001" && byPlate.meta === "WS01 · เบอร์ 081-000-0101",
    JSON.stringify(byPlate));
  const byName = searchSellers(SELLERS, "ใจดี", BILL_PLATES).map(sellerRowText);
  check("S3e two same-name sellers told apart: a name hit adds no reason, and each meta differs by phone and truck",
    byName.length === 2 && byName.every((t) => t.reason === null)
      && byName[0]!.meta === "WS01 · เบอร์ 081-000-0101 · ทะเบียน 1กก 1001"
      && byName[1]!.meta === "WS02 · เบอร์ 081-000-0102 · ทะเบียน 70-2002",
    JSON.stringify(byName));
  const plain = textOf("S001");
  check("S3f a seller with no phone and no truck shows its code alone, no reason",
    plain.meta === "S001" && plain.reason === null, JSON.stringify(plain));
}

async function main(): Promise<number> {
  await s0Cache();
  s1Axes();
  s2Ranking();
  s3Lines();
  console.log(`\n${passes} OK, ${failures} FAIL`);
  return failures === 0 ? 0 : 1;
}

main().then(
  (rc) => {
    console.log(`SELLERSEARCH_EXIT=${rc}`);
    process.exitCode = rc;
  },
  (err: unknown) => {
    console.error(err);
    console.log("SELLERSEARCH_EXIT=1");
    process.exitCode = 1;
  },
);
