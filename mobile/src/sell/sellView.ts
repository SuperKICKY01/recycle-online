/**
 * THE SELL SCREEN'S PURE CORE (M2). Everything the screen shows or sends is computed here, headless: a line's
 * figures through the SHARED line rule (`money/lineRules.ts`, the golden vectors both suites run -- the server
 * re-derives every one and refuses a line that does not follow), the total, the payload POST /sales takes, and the
 * words each sale's sync state reads as. The screen draws; it does no arithmetic of its own.
 *
 * Money and weight are decimal STRINGS throughout (hard rule 1). A sale's line declares the shop's rounding rule
 * and its product's pricing basis, as a purchase line does; the deduction is `none` (the sell form offers none).
 */

import { computeLine } from "../money/lineRules.js";
import { compareMoney, parsePrice, parseWeight, sumAmounts } from "../money/money.js";
import type { LocalSale, SaleItemPayload, SalePayload } from "../sync/localSale.js";

/** What the sell screen needs of a cached product. */
export interface SellProduct {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly uom_name: string;
  readonly pricing_basis?: "weight" | "piece" | "lump";
}

/** One line as typed. Weight lines use gross/tare; piece lines the count; lump lines the price alone. */
export interface SellDraftLine {
  readonly productId: string;
  readonly gross: string;
  readonly tare: string;
  readonly pieces: string;
  readonly price: string;
}

export interface SellLineFigures {
  readonly netWeight: string;
  readonly quantity: string;
  readonly amount: string;
}

export type SellLineResult = { ok: true; figures: SellLineFigures } | { ok: false; problem: string };

const basisOf = (p: SellProduct | undefined): "weight" | "piece" | "lump" => p?.pricing_basis ?? "weight";

/** A line's figures under the shop's rule, or the one thing to fix, in Thai. */
export function sellLine(line: SellDraftLine, product: SellProduct | undefined, roundingRule: string): SellLineResult {
  if (product === undefined) return { ok: false, problem: "เลือกสินค้า" };
  const price = parsePrice(line.price);
  if (!price.ok) return { ok: false, problem: "กรอกราคาขายต่อหน่วยเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง" };
  const basis = basisOf(product);
  let gross = "0.000";
  let tare = "0.000";
  let quantity: string | null = null;
  if (basis === "weight") {
    const g = parseWeight(line.gross);
    if (!g.ok) return { ok: false, problem: "กรอกน้ำหนักรวมเป็นตัวเลข ทศนิยมไม่เกิน 3 ตำแหน่ง" };
    const t = line.tare.trim() === "" ? ({ ok: true, value: "0.000" } as const) : parseWeight(line.tare);
    if (!t.ok) return { ok: false, problem: "กรอกน้ำหนักภาชนะเป็นตัวเลข ทศนิยมไม่เกิน 3 ตำแหน่ง" };
    if (compareMoney(t.value, g.value) > 0) return { ok: false, problem: "น้ำหนักภาชนะมากกว่าน้ำหนักรวม" };
    gross = g.value;
    tare = t.value;
  } else if (basis === "piece") {
    if (!/^[1-9]\d{0,8}$/.test(line.pieces.trim())) return { ok: false, problem: "กรอกจำนวนชิ้นเป็นจำนวนเต็มมากกว่าศูนย์" };
    quantity = line.pieces.trim();
  }
  const out = computeLine({ gross, tare, unitPrice: price.value, basis, rule: roundingRule, mode: "none", quantity });
  if (!out.ok) return { ok: false, problem: `คำนวณรายการไม่ได้ (${out.code})` };
  return { ok: true, figures: { netWeight: out.value.netWeight, quantity: out.value.quantity, amount: out.value.amount } };
}

/** The sum of the lines' amounts, or null while any line is not yet valid (no partial total is shown as a total). */
export function sellTotal(results: readonly SellLineResult[]): string | null {
  if (results.length === 0 || results.some((r) => !r.ok)) return null;
  return sumAmounts(results.map((r) => (r.ok ? r.figures.amount : "0.00")));
}

/** Money taken now: blank (none), or an amount no more than the total. */
export function receivedProblem(received: string, total: string | null): string | null {
  if (received.trim() === "") return null;
  const r = parsePrice(received);
  if (!r.ok) return "กรอกยอดรับเงินเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง";
  if (total !== null && compareMoney(r.value, total) > 0) return "ยอดรับเงินมากกว่ายอดขาย";
  return null;
}

/**
 * The body POST /sales takes, from lines already proven valid. The id and key are minted ONCE by the caller and
 * passed in (hard rules 3 and 4) -- never derived here, so nothing about the sale can change them.
 */
export function buildSalePayload(input: {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly buyerId: string;
  readonly deviceCreatedAt: string;
  readonly lines: readonly { readonly id: string; readonly draft: SellDraftLine; readonly product: SellProduct; readonly figures: SellLineFigures }[];
  readonly roundingRule: string;
  readonly total: string;
  readonly received: string;
  readonly branchId?: string;
}): SalePayload {
  const items: SaleItemPayload[] = input.lines.map((l, i) => {
    const basis = basisOf(l.product);
    const weighed = basis === "weight";
    return {
      id: l.id,
      product_id: l.product.id,
      line_no: i + 1,
      gross_weight: weighed ? must(parseWeight(l.draft.gross), "gross") : "0.000",
      tare_weight: weighed && l.draft.tare.trim() !== "" ? must(parseWeight(l.draft.tare), "tare") : "0.000",
      net_weight: l.figures.netWeight,
      unit_price: must(parsePrice(l.draft.price), "price"),
      pricing_basis: basis,
      rounding_rule: input.roundingRule,
      ...(basis === "piece" ? { quantity: l.figures.quantity } : {}),
    };
  });
  const received = input.received.trim();
  return {
    id: input.id,
    buyer_id: input.buyerId,
    device_created_at: input.deviceCreatedAt,
    idempotency_key: input.idempotencyKey,
    items,
    total_amount: input.total,
    ...(received !== "" ? { received_amount: must(parsePrice(received), "received"), received_method: "cash" as const } : {}),
    ...(input.branchId !== undefined ? { branch_id: input.branchId } : {}),
  };
}

/** Lines reach the payload only after `sellLine` proved them; a parse failure here is a CALLER defect, loud. */
function must(p: { ok: true; value: string } | { ok: false; error: string }, field: string): string {
  if (!p.ok) throw new Error(`buildSalePayload: ${field} was not validated before the payload (${p.error})`);
  return p.value;
}

export type SaleStateTone = "positive" | "neutral" | "warning" | "danger";

/** The words and tone a sale's sync state reads as on the list. Failure is never silent (hard rule 8). */
export function saleStateLine(sale: Pick<LocalSale, "sync_state" | "doc_no" | "parked_code" | "last_error">): { text: string; tone: SaleStateTone } {
  if (sale.sync_state === "synced") return { text: `ส่งแล้ว · ${sale.doc_no ?? "ไม่ทราบเลขที่"}`, tone: "positive" };
  if (sale.sync_state === "failed") return { text: `เซิร์ฟเวอร์ไม่รับบิลนี้ — ${sale.last_error ?? "ไม่ทราบสาเหตุ"}`, tone: "danger" };
  if (sale.parked_code === "insufficient_stock") return { text: "รอสต็อก — ร้านตั้งไม่ให้ขายเกินสต็อก จะลองส่งใหม่เอง", tone: "warning" };
  if (sale.parked_code !== null) return { text: "รอข้อมูลหลักจากสำนักงาน — จะลองส่งใหม่เอง", tone: "warning" };
  if (sale.sync_state === "syncing") return { text: "กำลังส่ง…", tone: "neutral" };
  return { text: "ยังไม่ได้ส่ง — ยังไม่มีเลขที่", tone: "neutral" };
}
