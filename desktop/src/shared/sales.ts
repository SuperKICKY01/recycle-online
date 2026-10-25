/**
 * SALES, BUYERS AND STOCK ON THE DESKTOP (M2, server migration 0029, SRS 1.5 / 2.2 / 3.2 / 3.3) -- pure: the wire
 * shapes and their readers, the bodies the screens send, the words they use, the sale slip, and the report sheets.
 *
 * THE SERVER IS THE ONLY ARITHMETIC. A sale line's net, amount and cost are the server's (POST /sales/quote before
 * saving, POST /sales to save); this module computes no figure and adds money only as exact decimal strings
 * (./money sumDecimal), never a float.
 *
 * GROSS PROFIT IS NAMED กำไรขั้นต้น, EVERYWHERE (ADVISOR-DECIDED 2026-10-25): it is sale amount minus the cost the
 * line stored, before any expense. The words กำไร alone or กำไรสุทธิ appear nowhere in this module or its screens
 * (prove:sales sweeps the source).
 */
import { shopDateTime } from "@recycle/shop-time";

import { display, sumDecimal } from "./money";
import type { SlipLine, ShopHeader } from "./slip";
import type { Sheet } from "./xlsx";

export const GROSS_PROFIT = "กำไรขั้นต้น";

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" ? (v as Record<string, unknown>) : null);
function arr<T>(v: unknown, one: (x: unknown) => T | null): T[] | null {
  if (!Array.isArray(v)) return null;
  const out = v.map(one);
  return out.every((x): x is T => x !== null) ? out : null;
}
const DEC = /^-?\d+(\.\d+)?$/;
const dec = (v: unknown): string | null => (typeof v === "string" && DEC.test(v) ? v : null);

// --- buyers ---------------------------------------------------------------------------------------

export interface Buyer {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly phone: string | null;
  readonly address: string | null;
  readonly tax_id: string | null;
  readonly note: string | null;
  readonly is_active: boolean;
}

export function readBuyer(v: unknown): Buyer | null {
  const o = obj(v);
  if (o === null || typeof o["id"] !== "string" || typeof o["code"] !== "string" || typeof o["name"] !== "string"
    || typeof o["is_active"] !== "boolean") return null;
  return { id: o["id"], code: o["code"], name: o["name"], phone: str(o["phone"]), address: str(o["address"]),
    tax_id: str(o["tax_id"]), note: str(o["note"]), is_active: o["is_active"] };
}
export const readBuyers = (j: unknown): Buyer[] | null => arr(obj(j)?.["buyers"], readBuyer);

export interface BuyerForm { code: string; name: string; phone: string; address: string; tax_id: string; note: string }

/** A taxpayer number is 13 digits or nothing. Never an ID card (ADVISOR-DECIDED 2026-10-25). */
export function buyerProblem(f: BuyerForm): string | null {
  if (f.name.trim() === "") return "กรอกชื่อผู้ซื้อ";
  if (f.name.trim().length > 200) return "ชื่อยาวเกิน 200 ตัวอักษร";
  if (f.tax_id.trim() !== "" && !/^\d{13}$/.test(f.tax_id.trim())) return "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก";
  return null;
}

/** Create: blank fields are left out (a blank code is the server's to assign). */
export function buyerCreate(f: BuyerForm): Record<string, string> {
  const out: Record<string, string> = { name: f.name.trim() };
  for (const k of ["code", "phone", "address", "tax_id", "note"] as const) if (f[k].trim() !== "") out[k] = f[k].trim();
  return out;
}

/** Edit: only what changed; an emptied optional field is an explicit null (it clears). The code never changes. */
export function buyerPatch(before: Buyer, f: BuyerForm): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (f.name.trim() !== before.name) out["name"] = f.name.trim();
  for (const k of ["phone", "address", "tax_id", "note"] as const) {
    const now = f[k].trim() === "" ? null : f[k].trim();
    if (now !== before[k]) out[k] = now;
  }
  return out;
}

// --- sales ----------------------------------------------------------------------------------------

export interface SaleLine {
  readonly id: string;
  readonly product_code: string | null;
  readonly product_name: string | null;
  readonly line_no: number;
  readonly gross_weight: string;
  readonly tare_weight: string;
  readonly deduction_mode: string;
  readonly deduction_weight: string;
  readonly deduction_pct: string | null;
  readonly deduction_reason: string | null;
  readonly net_weight: string;
  readonly pricing_basis: string;
  readonly quantity: string;
  readonly unit_price: string;
  readonly amount: string;
  readonly unit_name: string;
  /** Present only for a money.view_shop caller (the server omits the keys otherwise). */
  readonly cost_amount?: string;
  readonly gross_profit?: string;
}

export interface Sale {
  readonly id: string;
  readonly doc_no: string;
  readonly buyer_id: string;
  readonly buyer_code: string | null;
  readonly buyer_name: string | null;
  readonly total_amount: string;
  readonly received_amount: string;
  readonly outstanding_amount: string;
  readonly receipt_status: string;
  readonly status: "active" | "voided";
  readonly server_received_at: string;
  readonly void_reason?: string | null;
  readonly cost_amount?: string;
  readonly gross_profit?: string;
  readonly items?: readonly SaleLine[];
}

function readLine(v: unknown): SaleLine | null {
  const o = obj(v);
  if (o === null || typeof o["id"] !== "string" || typeof o["line_no"] !== "number") return null;
  const need = ["gross_weight", "tare_weight", "deduction_weight", "net_weight", "quantity", "unit_price", "amount"] as const;
  const vals = need.map((k) => dec(o[k]));
  if (vals.some((x) => x === null)) return null;
  const [gross, tare, ded, net, qty, price, amount] = vals as string[];
  return { id: o["id"], product_code: str(o["product_code"]), product_name: str(o["product_name"]), line_no: o["line_no"],
    gross_weight: gross ?? "", tare_weight: tare ?? "", deduction_mode: str(o["deduction_mode"]) ?? "none",
    deduction_weight: ded ?? "", deduction_pct: dec(o["deduction_pct"]), deduction_reason: str(o["deduction_reason"]),
    net_weight: net ?? "", pricing_basis: str(o["pricing_basis"]) ?? "weight", quantity: qty ?? "", unit_price: price ?? "",
    amount: amount ?? "", unit_name: str(o["unit_name"]) ?? "",
    ...(dec(o["cost_amount"]) !== null ? { cost_amount: dec(o["cost_amount"]) ?? "" } : {}),
    ...(dec(o["gross_profit"]) !== null ? { gross_profit: dec(o["gross_profit"]) ?? "" } : {}) };
}

export function readSale(v: unknown): Sale | null {
  const o = obj(v);
  if (o === null || typeof o["id"] !== "string" || typeof o["doc_no"] !== "string" || typeof o["buyer_id"] !== "string") return null;
  const total = dec(o["total_amount"]), received = dec(o["received_amount"]), outstanding = dec(o["outstanding_amount"]);
  if (total === null || received === null || outstanding === null) return null;
  const status = o["status"] === "voided" ? "voided" : o["status"] === "active" ? "active" : null;
  if (status === null || typeof o["server_received_at"] !== "string") return null;
  const items = o["items"] === undefined ? undefined : arr(o["items"], readLine);
  if (items === null) return null;
  return { id: o["id"], doc_no: o["doc_no"], buyer_id: o["buyer_id"], buyer_code: str(o["buyer_code"]), buyer_name: str(o["buyer_name"]),
    total_amount: total, received_amount: received, outstanding_amount: outstanding, receipt_status: str(o["receipt_status"]) ?? "",
    status, server_received_at: o["server_received_at"], void_reason: str(o["void_reason"]),
    ...(dec(o["cost_amount"]) !== null ? { cost_amount: dec(o["cost_amount"]) ?? "" } : {}),
    ...(dec(o["gross_profit"]) !== null ? { gross_profit: dec(o["gross_profit"]) ?? "" } : {}),
    ...(items !== undefined ? { items } : {}) };
}
export const readSales = (j: unknown): Sale[] | null => arr(obj(j)?.["sales"], readSale);

export const RECEIPT_STATUS_TEXT: Readonly<Record<string, string>> = { paid: "รับเงินครบ", partial: "รับบางส่วน", unpaid: "ยังไม่รับเงิน" };

export interface SalesFilter { from: string; to: string; buyerId: string | null; includeVoided: boolean }
export function salesQuery(f: SalesFilter): string {
  const q = new URLSearchParams({ from_date: f.from, to_date: f.to, limit: "200" });
  if (f.buyerId !== null) q.set("buyer_id", f.buyerId);
  if (f.includeVoided) q.set("include_voided", "true");
  return `/sales?${q.toString()}`;
}

// --- the new-sale form ----------------------------------------------------------------------------

/** What the sale form needs of a product: its unit, how it is priced, and the shop's default sell price. */
export interface ProductChoice {
  readonly id: string; readonly code: string; readonly name: string; readonly category_id: string;
  readonly unit_name: string; readonly pricing_basis: string; readonly sell_price: string | null;
}
export const readProductChoices = (j: unknown): ProductChoice[] | null => arr(obj(j)?.["products"], (x) => {
  const p = obj(x);
  if (p === null || typeof p["id"] !== "string" || typeof p["code"] !== "string" || typeof p["name"] !== "string") return null;
  return { id: p["id"], code: p["code"], name: p["name"], category_id: str(p["category_id"]) ?? "", unit_name: str(p["uom_name"]) ?? "",
    pricing_basis: str(p["pricing_basis"]) ?? "weight", sell_price: dec(p["sell_price"]) };
});

/** One line as typed: weights and price as the operator wrote them (strings), validated, never parsed to a number. */
export interface DraftLine { productId: string; gross: string; tare: string; price: string; pieces: string; basis: string }

const W3 = /^\d{1,11}(\.\d{1,3})?$/;
const M2 = /^\d{1,12}(\.\d{1,2})?$/;
const INT = /^[1-9]\d{0,8}$/;

export function lineProblem(l: DraftLine): string | null {
  if (l.productId === "") return "เลือกสินค้า";
  if (!M2.test(l.price.trim())) return "ราคาต่อหน่วยต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง";
  if (l.basis === "piece") return INT.test(l.pieces.trim()) ? null : "จำนวนชิ้นต้องเป็นจำนวนเต็มมากกว่าศูนย์";
  if (l.basis === "lump") return null;
  if (!W3.test(l.gross.trim())) return "น้ำหนักรวมต้องเป็นตัวเลข ทศนิยมไม่เกิน 3 ตำแหน่ง";
  if (l.tare.trim() !== "" && !W3.test(l.tare.trim())) return "น้ำหนักภาชนะต้องเป็นตัวเลข ทศนิยมไม่เกิน 3 ตำแหน่ง";
  return null;
}

/** The wire line. The NET is the server's to compute: the quote answers it, and the save sends the quote's net.
 *  `roundingRule` is the shop's (GET /shop), DECLARED on the line as a purchase line declares its rule -- a line
 *  that declared none would be computed on the server's default and flagged off-rule in any shop that set its own. */
export function lineBody(l: DraftLine, lineNo: number, id: string, net: string | null, roundingRule: string): Record<string, string | number> {
  const base: Record<string, string | number> = { id, product_id: l.productId, line_no: lineNo, unit_price: l.price.trim(),
    pricing_basis: l.basis, rounding_rule: roundingRule };
  if (l.basis === "piece") return { ...base, gross_weight: "0.000", tare_weight: "0.000", net_weight: "0.000", quantity: l.pieces.trim() };
  if (l.basis === "lump") return { ...base, gross_weight: "0.000", tare_weight: "0.000", net_weight: "0.000" };
  const gross = l.gross.trim();
  const tare = l.tare.trim() === "" ? "0" : l.tare.trim();
  return { ...base, gross_weight: gross, tare_weight: tare, net_weight: net ?? gross };
}

export interface Quote {
  readonly total_amount: string;
  readonly items: readonly { readonly line_no: number; readonly net_weight: string; readonly quantity: string; readonly amount: string }[];
}
export function readQuote(v: unknown): Quote | null {
  const o = obj(v);
  const total = dec(o?.["total_amount"]);
  const items = arr(o?.["items"], (x) => {
    const i = obj(x);
    if (i === null || typeof i["line_no"] !== "number") return null;
    const net = dec(i["net_weight"]), q = dec(i["quantity"]), a = dec(i["amount"]);
    return net === null || q === null || a === null ? null : { line_no: i["line_no"], net_weight: net, quantity: q, amount: a };
  });
  return total === null || items === null ? null : { total_amount: total, items };
}

/** Money received at the counter: blank (nothing), or an amount no more than the quoted total. */
export function receivedProblem(received: string, total: string | null): string | null {
  const r = received.trim();
  if (r === "") return null;
  if (!M2.test(r)) return "ยอดรับเงินต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง";
  if (total !== null && compareDecimal(r, total) > 0) return "ยอดรับเงินมากกว่ายอดขาย";
  return null;
}

/** Exact comparison of two non-negative decimal strings (no float): -1, 0, 1. */
export function compareDecimal(a: string, b: string): number {
  const [ai = "0", af = ""] = a.split(".");
  const [bi = "0", bf = ""] = b.split(".");
  const w = Math.max(af.length, bf.length);
  const x = BigInt(ai + af.padEnd(w, "0"));
  const y = BigInt(bi + bf.padEnd(w, "0"));
  return x === y ? 0 : x > y ? 1 : -1;
}

export function voidReasonProblem(reason: string): string | null {
  return reason.trim() === "" ? "ต้องระบุเหตุผลการยกเลิก" : reason.trim().length > 500 ? "เหตุผลยาวเกิน 500 ตัวอักษร" : null;
}

// --- the sale slip --------------------------------------------------------------------------------

/** A sale slip: the shop, ใบขายสินค้า, the doc_no, the buyer, each line, the total, received and outstanding.
 *  Cost and gross profit are NEVER printed -- a slip goes to the buyer. */
export function saleSlipLines(shop: ShopHeader, sale: Sale, printedAt: string): SlipLine[] {
  const out: SlipLine[] = [
    { kind: "text", text: shop.name, align: "center", bold: true, big: true },
    ...(shop.address !== null ? [{ kind: "text" as const, text: shop.address, align: "center" as const }] : []),
    ...(shop.phone !== null ? [{ kind: "text" as const, text: `โทร ${shop.phone}`, align: "center" as const }] : []),
    { kind: "rule" },
    { kind: "text", text: "ใบขายสินค้า", align: "center", bold: true },
    { kind: "pair", left: "เลขที่", right: sale.doc_no },
    { kind: "pair", left: "วันที่", right: shopDateTime(sale.server_received_at) },
    { kind: "pair", left: "ผู้ซื้อ", right: `${sale.buyer_code ?? ""} ${sale.buyer_name ?? ""}`.trim() },
    { kind: "rule" },
  ];
  for (const l of sale.items ?? []) {
    out.push({ kind: "text", text: `${l.product_code ?? ""} ${l.product_name ?? ""}`.trim(), align: "left", bold: true });
    if (l.pricing_basis === "weight") {
      out.push({ kind: "pair", left: "น้ำหนักรวม", right: `${display(l.gross_weight)} ${l.unit_name}` });
      if (l.tare_weight !== "0.000") out.push({ kind: "pair", left: "ภาชนะ", right: `${display(l.tare_weight)} ${l.unit_name}` });
      if (l.deduction_weight !== "0.000") out.push({ kind: "pair", left: "หักสิ่งเจือปน", right: `${display(l.deduction_weight)} ${l.unit_name}` });
      out.push({ kind: "pair", left: `สุทธิ x ${display(l.unit_price)}`, right: `${display(l.net_weight)} ${l.unit_name}` });
    } else if (l.pricing_basis === "piece") {
      out.push({ kind: "pair", left: `${display(l.quantity.replace(/\.0+$/, ""))} ${l.unit_name} x ${display(l.unit_price)}`, right: "" });
    } else {
      out.push({ kind: "pair", left: `เหมา 1 ${l.unit_name}`, right: "" });
    }
    out.push({ kind: "pair", left: "", right: display(l.amount) });
  }
  out.push({ kind: "rule" }, { kind: "pair", left: "รวมเงิน", right: display(sale.total_amount), bold: true },
    { kind: "pair", left: "รับเงินแล้ว", right: display(sale.received_amount) },
    { kind: "pair", left: "ค้างรับ", right: display(sale.outstanding_amount) },
    { kind: "blank" }, { kind: "text", text: `พิมพ์ ${shopDateTime(printedAt)}`, align: "center" });
  return out;
}

export function saleSlipRefusal(sale: Pick<Sale, "status">): string | null {
  return sale.status === "voided" ? "บิลขายนี้ถูกยกเลิกแล้ว จึงไม่พิมพ์สลิป" : null;
}

// --- stock ----------------------------------------------------------------------------------------

export interface StockItem {
  readonly product_id: string;
  readonly code: string;
  readonly name: string;
  readonly category_id: string;
  readonly unit_name: string;
  readonly quantity: string;
  readonly movements: number;
  readonly value?: string;
  readonly average_cost?: string | null;
}
export function readStock(j: unknown): { items: StockItem[]; total_value: string | null } | null {
  const o = obj(j);
  const items = arr(o?.["items"], (x) => {
    const i = obj(x);
    if (i === null || typeof i["product_id"] !== "string" || typeof i["code"] !== "string" || dec(i["quantity"]) === null) return null;
    return { product_id: i["product_id"], code: i["code"], name: str(i["name"]) ?? "", category_id: str(i["category_id"]) ?? "",
      unit_name: str(i["unit_name"]) ?? "", quantity: dec(i["quantity"]) ?? "", movements: typeof i["movements"] === "number" ? i["movements"] : 0,
      ...(dec(i["value"]) !== null ? { value: dec(i["value"]) ?? "" } : {}),
      ...("average_cost" in i ? { average_cost: dec(i["average_cost"]) } : {}) };
  });
  return items === null ? null : { items, total_value: dec(o?.["total_value"]) };
}

export interface Movement {
  readonly id: string; readonly kind: string; readonly quantity: string; readonly value?: string; readonly reason: string | null;
  readonly doc_no: string | null; readonly created_at: string; readonly balance_after: string; readonly recorded_by_migration: boolean;
}
export function readMovements(j: unknown): Movement[] | null {
  return arr(obj(j)?.["movements"], (x) => {
    const m = obj(x);
    if (m === null || typeof m["id"] !== "string" || typeof m["kind"] !== "string" || dec(m["quantity"]) === null
      || typeof m["created_at"] !== "string" || dec(m["balance_after"]) === null) return null;
    return { id: m["id"], kind: m["kind"], quantity: dec(m["quantity"]) ?? "", reason: str(m["reason"]), doc_no: str(m["doc_no"]),
      created_at: m["created_at"], balance_after: dec(m["balance_after"]) ?? "", recorded_by_migration: m["recorded_by_migration"] === true,
      ...(dec(m["value"]) !== null ? { value: dec(m["value"]) ?? "" } : {}) };
  });
}

export const MOVEMENT_TEXT: Readonly<Record<string, string>> = {
  purchase: "รับซื้อ", sale: "ขาย", adjust: "ปรับยอด", void_purchase: "ยกเลิกบิลรับซื้อ", void_sale: "ยกเลิกบิลขาย",
};

/** A counted correction: a signed quantity (never zero) and a reason (always). */
export function adjustmentProblem(quantity: string, reason: string): string | null {
  if (!/^-?\d{1,11}(\.\d{1,3})?$/.test(quantity.trim()) || /^-?0+(\.0+)?$/.test(quantity.trim())) {
    return "จำนวนที่ปรับต้องเป็นตัวเลขที่ไม่ใช่ศูนย์ (ติดลบเมื่อลดสต็อก) ทศนิยมไม่เกิน 3 ตำแหน่ง";
  }
  return reason.trim() === "" ? "ต้องระบุเหตุผลการปรับสต็อก" : null;
}

// --- reports --------------------------------------------------------------------------------------

export interface SalesReportRow { readonly key: string; readonly label: string; readonly bills: number; readonly amount: string;
  readonly cost: string; readonly gross_profit: string; readonly quantity?: string; readonly unit_code?: string }
export interface SalesReport { readonly by: string; readonly rows: readonly SalesReportRow[];
  readonly totals: { readonly bills: number; readonly amount: string; readonly cost: string; readonly gross_profit: string } }

export function readSalesReport(j: unknown): SalesReport | null {
  const o = obj(j);
  const fig = (x: Record<string, unknown> | null) => {
    if (x === null || typeof x["bills"] !== "number") return null;
    const a = dec(x["amount"]), c = dec(x["cost"]), g = dec(x["gross_profit"]);
    return a === null || c === null || g === null ? null : { bills: x["bills"], amount: a, cost: c, gross_profit: g };
  };
  const rows = arr(o?.["rows"], (x) => {
    const r = obj(x);
    const f = fig(r);
    if (r === null || f === null || typeof r["key"] !== "string") return null;
    return { key: r["key"], label: str(r["label"]) ?? r["key"], ...f,
      ...(dec(r["quantity"]) !== null ? { quantity: dec(r["quantity"]) ?? "", unit_code: str(r["unit_code"]) ?? "" } : {}) };
  });
  const totals = fig(obj(o?.["totals"]));
  return rows === null || totals === null || typeof o?.["by"] !== "string" ? null : { by: o["by"], rows, totals };
}

export const REPORT_BY_TEXT: Readonly<Record<string, string>> = { day: "วันที่", product: "สินค้า", buyer: "ผู้ซื้อ" };

/** The sales report as a sheet: one row per group, then the total -- the server's strings verbatim. */
export function salesReportSheet(r: SalesReport, title: string): Sheet {
  const product = r.by === "product";
  return {
    name: `ขาย ตาม${REPORT_BY_TEXT[r.by] ?? r.by}`,
    title,
    columns: [
      { header: REPORT_BY_TEXT[r.by] ?? r.by, kind: "text", width: 28 }, { header: "จำนวนบิล", kind: "text", width: 10 },
      ...(product ? [{ header: "ปริมาณ", kind: "weight" as const, width: 14 }, { header: "หน่วย", kind: "text" as const, width: 8 }] : []),
      { header: "ยอดขาย (บาท)", kind: "money", width: 16 }, { header: "ต้นทุน (บาท)", kind: "money", width: 16 },
      { header: `${GROSS_PROFIT} (บาท)`, kind: "money", width: 16 },
    ],
    rows: [
      ...r.rows.map((x) => [x.label, String(x.bills), ...(product ? [x.quantity ?? null, x.unit_code ?? null] : []), x.amount, x.cost, x.gross_profit]),
      ["รวม", String(r.totals.bills), ...(product ? [null, null] : []), r.totals.amount, r.totals.cost, r.totals.gross_profit],
    ],
  };
}

/** The stock balance as a sheet: one row per product, then the total value (SRS 3.3: ราคาเฉลี่ย | คงเหลือ | มูลค่า). */
export function stockSheet(items: readonly StockItem[], totalValue: string | null, title: string): Sheet {
  return {
    name: "สินค้าคงเหลือ",
    title,
    columns: [
      { header: "รหัส", kind: "text", width: 12 }, { header: "ชื่อสินค้า", kind: "text", width: 28 }, { header: "หน่วย", kind: "text", width: 8 },
      { header: "ราคาเฉลี่ย (บาท)", kind: "money", width: 16 }, { header: "คงเหลือ", kind: "weight", width: 14 },
      { header: "มูลค่า (บาท)", kind: "money", width: 16 },
    ],
    rows: [
      ...items.map((i) => [i.code, i.name, i.unit_name, i.average_cost ?? null, i.quantity, i.value ?? null]),
      ["รวมมูลค่าสต็อก", null, null, null, null, totalValue],
    ],
  };
}

/** The sale bills of a range as one sheet PER PRODUCT CATEGORY (SRS 3.2: "แยก Sheet ตามกลุ่มสินค้า"). A bill's lines
 *  land on the sheet of each line's category; lines with no known category on "ไม่มีหมวดหมู่". */
export function salesByCategorySheets(sales: readonly Sale[], categoryOf: (code: string | null) => string, title: string): Sheet[] {
  const by = new Map<string, (string | null)[][]>();
  for (const s of sales) {
    if (s.status !== "active") continue;
    for (const l of s.items ?? []) {
      const cat = categoryOf(l.product_code);
      const rows = by.get(cat) ?? [];
      rows.push([s.doc_no, shopDateTime(s.server_received_at), `${s.buyer_code ?? ""} ${s.buyer_name ?? ""}`.trim(),
        `${l.product_code ?? ""} ${l.product_name ?? ""}`.trim(), l.quantity, l.unit_name, l.unit_price, l.amount]);
      by.set(cat, rows);
    }
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b, "th")).map(([cat, rows]) => ({
    name: cat,
    title,
    columns: [
      { header: "เลขที่", kind: "text", width: 18 }, { header: "วันที่ เวลา", kind: "text", width: 18 }, { header: "ผู้ซื้อ", kind: "text", width: 24 },
      { header: "สินค้า", kind: "text", width: 26 }, { header: "ปริมาณ", kind: "weight", width: 12 }, { header: "หน่วย", kind: "text", width: 8 },
      { header: "ราคา", kind: "money", width: 12 }, { header: "ยอดเงิน (บาท)", kind: "money", width: 16 },
    ],
    rows: [...rows, ["รวม", null, null, null, null, null, null, sumDecimal(rows.map((r) => r[7] ?? ""))]],
  }));
}
