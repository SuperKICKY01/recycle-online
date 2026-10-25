/**
 * SALES, BUYERS AND STOCK -- THE PURE PARTS (M2).
 *
 *   npm run prove:sales
 *
 *   R  readers: a sale's money as a NUMBER is refused (hard rule 1); cost and gross profit are ABSENT (not empty)
 *      when the server omitted them; a stock row without value reads without it.
 *   B  buyers: a 13-digit taxpayer number or nothing; create leaves blanks out; edit sends only what changed, an
 *      emptied optional field as an explicit null, and never a code.
 *   L  a sale line's wire shape per basis; the NET is the quote's (never computed here); every line declares the
 *      shop's rounding rule.
 *   D  compareDecimal is exact past a float's precision; receivedProblem refuses more than the total.
 *   S  the sale slip prints the doc_no, the buyer and the lines -- and NEVER the cost or gross profit.
 *   X  the category export: one sheet per category, read back by Python's own reader (desktop/tools/read_xlsx.py):
 *      every sheet declared, named, titled with the shop, its money cells the server's strings verbatim.
 *   W  the words: no source file of the sales screens or the reports says กำไร except as กำไรขั้นต้น, and none
 *      says กำไรสุทธิ (control: the sweep finds a planted line).
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buyerCreate,
  buyerPatch,
  buyerProblem,
  compareDecimal,
  GROSS_PROFIT,
  lineBody,
  readSale,
  readStock,
  receivedProblem,
  saleSlipLines,
  salesByCategorySheets,
  type Buyer,
  type Sale,
} from "../shared/sales";
import { buildXlsx } from "../shared/xlsx";
import { check, DESKTOP_ROOT, finish, header } from "./harness";
import { readXlsx } from "./xlsxReader";

const SALE = {
  id: "s1", doc_no: "S-B-2569-7", buyer_id: "b1", buyer_code: "C001", buyer_name: "โรงหล่อสยาม",
  total_amount: "21441.88", received_amount: "1000.00", outstanding_amount: "20441.88", receipt_status: "partial",
  status: "active", server_received_at: "2026-10-25T03:00:00+00:00", void_reason: null,
  items: [{ id: "i1", product_code: "FE01", product_name: "เหล็กหนา", line_no: 1, gross_weight: "2450.500", tare_weight: "0.000",
    deduction_mode: "none", deduction_weight: "0.000", deduction_pct: null, deduction_reason: null, net_weight: "2450.500",
    pricing_basis: "weight", quantity: "2450.500", unit_price: "8.75", amount: "21441.88", unit_name: "กก." }],
};

void finish("PROVE_SALES", async () => {
  header("R readers");
  const plain = readSale(SALE);
  const withCost = readSale({ ...SALE, cost_amount: "15000.00", gross_profit: "6441.88",
    items: [{ ...SALE.items[0], cost_amount: "15000.00", gross_profit: "6441.88" }] });
  check("R1 a sale reads; money as a NUMBER is refused whole",
    plain !== null && plain.total_amount === "21441.88" && readSale({ ...SALE, total_amount: 21441.88 }) === null);
  check("R2 cost and gross profit are ABSENT when the server omitted them, present when it sent them",
    plain !== null && !("cost_amount" in plain) && !("gross_profit" in plain) && !("cost_amount" in (plain.items?.[0] ?? {}))
      && withCost?.gross_profit === "6441.88" && withCost.items?.[0]?.cost_amount === "15000.00");
  const st = readStock({ items: [{ product_id: "p", code: "FE", name: "x", quantity: "-5.000", movements: 3 }] });
  check("R3 a stock row without value reads without it (a yard account); a negative balance reads as written",
    st !== null && st.items[0]?.quantity === "-5.000" && !("value" in (st.items[0] ?? {})) && st.total_value === null);

  header("B buyers");
  check("B1 taxpayer number: 13 digits or nothing; a name is required",
    buyerProblem({ code: "", name: "ก", phone: "", address: "", tax_id: "0105556123456", note: "" }) === null
      && buyerProblem({ code: "", name: "ก", phone: "", address: "", tax_id: "12345", note: "" }) !== null
      && buyerProblem({ code: "", name: " ", phone: "", address: "", tax_id: "", note: "" }) === "กรอกชื่อผู้ซื้อ");
  check("B2 create leaves blank fields out (a blank code is the server's to assign)",
    JSON.stringify(buyerCreate({ code: " ", name: " โรงหล่อ ", phone: "", address: "", tax_id: "", note: "" })) === JSON.stringify({ name: "โรงหล่อ" }));
  const before: Buyer = { id: "b", code: "C001", name: "โรงหล่อ", phone: "02-111", address: null, tax_id: null, note: "x", is_active: true };
  const patch = buyerPatch(before, { code: "ZZZ", name: "โรงหล่อ", phone: "", address: "ถนน", tax_id: "", note: "x" });
  check("B3 edit: only changes; an emptied phone is an explicit null; never the code",
    JSON.stringify(patch) === JSON.stringify({ phone: null, address: "ถนน" }), JSON.stringify(patch));

  header("L line bodies");
  const w = lineBody({ productId: "p", gross: " 100.5 ", tare: "", price: "8.75", pieces: "", basis: "weight" }, 1, "l1", "100.500", "down_1");
  const pc = lineBody({ productId: "p", gross: "9", tare: "9", price: "185.00", pieces: "7", basis: "piece" }, 2, "l2", null, "down_1");
  const lump = lineBody({ productId: "p", gross: "9", tare: "", price: "5250.13", pieces: "", basis: "lump" }, 3, "l3", null, "down_1");
  check("L1 weight: the typed gross, tare 0 when blank, the QUOTE's net, and the shop's rounding rule DECLARED",
    w["gross_weight"] === "100.5" && w["tare_weight"] === "0" && w["net_weight"] === "100.500" && w["pricing_basis"] === "weight"
      && w["rounding_rule"] === "down_1");
  check("L2 piece: weights zero, the count as quantity; lump: weights zero, no quantity; both declare the rule",
    pc["quantity"] === "7" && pc["gross_weight"] === "0.000" && lump["net_weight"] === "0.000" && !("quantity" in lump)
      && pc["rounding_rule"] === "down_1" && lump["rounding_rule"] === "down_1");

  header("D decimals");
  check("D1 compareDecimal is exact past a float's precision (9007199254740993.01 > 9007199254740993.00)",
    compareDecimal("9007199254740993.01", "9007199254740993.00") === 1 && compareDecimal("1.10", "1.1") === 0 && compareDecimal("0.99", "1") === -1);
  check("D2 received: blank is fine; more than the total is refused; exactly the total is fine",
    receivedProblem("", "10.00") === null && receivedProblem("10.01", "10.00") === "ยอดรับเงินมากกว่ายอดขาย" && receivedProblem("10.00", "10.00") === null);

  header("S the sale slip");
  const lines = saleSlipLines({ name: "ร้านรีไซเคิล", address: null, phone: null }, withCost as Sale, "2026-10-25T03:05:00Z");
  const text = lines.map((l) => (l.kind === "text" ? l.text : l.kind === "pair" ? `${l.left} ${l.right}` : "")).join("\n");
  check("S1 the slip carries the doc_no, the buyer, the line and the total, outstanding included",
    text.includes("S-B-2569-7") && text.includes("C001 โรงหล่อสยาม") && text.includes("21,441.88") && text.includes("ค้างรับ 20,441.88"));
  check("S2 the slip NEVER prints the cost or the gross profit, even when the sale carries them",
    !text.includes("15,000.00") && !text.includes("6,441.88") && !text.includes(GROSS_PROFIT) && !text.includes("ต้นทุน"));

  header("X the category export");
  const two = readSale({ ...SALE, id: "s2", doc_no: "S-B-2569-8", items: [{ ...SALE.items[0], id: "i2", product_code: "CU01", product_name: "ทองแดง",
    quantity: "10.000", amount: "2500.00", unit_price: "250.00", net_weight: "10.000", gross_weight: "10.000" }] }) as Sale;
  const sheets = salesByCategorySheets([withCost as Sale, two], (code) => (code === "CU01" ? "ทองแดง" : "เหล็ก"), "ร้านรีไซเคิล · รายการขาย");
  const dir = mkdtempSync(join(tmpdir(), "recycle-prove-sales-"));
  try {
    const path = join(dir, "sales.xlsx");
    writeFileSync(path, buildXlsx(sheets));
    const x = readXlsx(path);
    const names = x.sheets.map((s) => s.name);
    const fe = x.sheets.find((s) => s.name === "เหล็ก");
    check("X1 two categories -> two sheets, each declared in [Content_Types].xml, the zip's CRCs good",
      x.zip_ok && x.sheets.length === 2 && x.sheets.every((s) => s.declared) && names.includes("เหล็ก") && names.includes("ทองแดง"),
      JSON.stringify(names));
    check("X2 row 1 is the title (the shop), row 2 the header, the money cell the server's string verbatim",
      fe?.cells["A1"]?.text === "ร้านรีไซเคิล · รายการขาย" && fe.cells["A2"]?.text === "เลขที่" && fe.cells["H3"]?.text === "21441.88"
        && fe.cells["H3"]?.type === "n", JSON.stringify({ a1: fe?.cells["A1"], h3: fe?.cells["H3"] }));
    const single = join(dir, "one.xlsx");
    writeFileSync(single, buildXlsx({ name: "x", columns: [{ header: "h", kind: "text" }], rows: [["v"]] }));
    const y = readXlsx(single);
    check("X3 CONTROL: a single sheet with no title still writes its header on row 1 (the B7 file unchanged)",
      y.sheets.length === 1 && y.cells["A1"]?.text === "h" && y.cells["A2"]?.text === "v");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  header("W the words");
  const files = ["src/shared/sales.ts", "src/renderer/Sales.tsx", "src/renderer/Stock.tsx", "src/renderer/Reports.tsx"];
  const bad = (src: string) => src.split(/\r?\n/).filter((l) => /กำไรสุทธิ/.test(l) || /กำไร(?!ขั้นต้น)/.test(l.replace(/GROSS_PROFIT/g, "")))
    .filter((l) => !/^\s*\*|^\s*\/\//.test(l));
  const hits = files.flatMap((f) => bad(readFileSync(join(DESKTOP_ROOT, f), "utf8")).map((l) => `${f}: ${l.trim().slice(0, 60)}`));
  check("W1 no screen or report line says กำไร alone or กำไรสุทธิ -- only กำไรขั้นต้น", hits.length === 0, hits.join(" | "));
  check("W1 CONTROL: the sweep finds a planted กำไรสุทธิ and a planted bare กำไร",
    bad('const x = "กำไรสุทธิ";').length === 1 && bad('const y = "กำไร";').length === 1 && bad('const z = "กำไรขั้นต้น";').length === 0);
});
