/**
 * THE BILLS SCREEN'S MODEL (B3, SRS 2.1) — pure: the wire shapes, the list query, and the void
 * rule the screen enforces before it ever asks (a reason is required; hard rule 5: a wrong bill is
 * VOIDED with its reason and stays in history, never deleted).
 */
import { display } from "./money";

export interface BillRow {
  readonly id: string;
  readonly doc_no: string | null;
  readonly seller_id: string;
  readonly seller_code: string | null;
  readonly seller_name: string | null;
  readonly vehicle_no: string | null;
  readonly total_amount: string;
  readonly payment_status: string;
  readonly server_received_at: string;
  readonly status: "active" | "voided";
  readonly void_reason: string | null;
  /** null when the answer carries no paid amount: shown as missing, never invented as 0.00. */
  readonly paid_amount: string | null;
}

export interface BillLine {
  readonly line_no: number;
  readonly product_code: string | null;
  readonly product_name: string | null;
  readonly gross_weight: string;
  readonly tare_weight: string;
  readonly net_weight: string;
  readonly unit_price: string;
  readonly amount: string;
  /**
   * The line's unit and money rules (server migration 0027). `unit_name` is the line's own (the
   * product's unit when it was received); on a line received before 0027 it is the product's unit
   * NOW and `rules_recorded` is false. OPTIONAL so a server before 0027 still reads: no unit then,
   * and the screens fall back to the old wording. A deduction is never derived here -- only shown.
   */
  readonly unit_name?: string | null;
  readonly rules_recorded?: boolean;
  readonly pricing_basis?: "weight" | "piece" | "lump" | null;
  readonly quantity?: string | null;
  readonly deduction_mode?: "none" | "kg" | "percent" | null;
  readonly deduction_pct?: string | null;
  readonly deduction_weight?: string | null;
  readonly deduction_reason?: string | null;
}

export interface BillDetail extends BillRow {
  readonly voided_at: string | null;
  readonly items: readonly BillLine[];
}

export interface SellerChoice {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

export interface BillFilter {
  readonly from: string;
  readonly to: string;
  /** null = every seller */
  readonly sellerId: string | null;
  readonly includeVoided: boolean;
}

/** GET /bills's ceiling (server/app/bills.py `limit: int = Query(50, ge=1, le=200)`). */
export const LIST_CEILING = 200;

/** GET /bills's query string for a filter; the limit is the route's ceiling. */
export function billsQuery(f: BillFilter): string {
  const q = new URLSearchParams({ from_date: f.from, to_date: f.to, limit: String(LIST_CEILING) });
  if (f.sellerId !== null) q.set("seller_id", f.sellerId);
  if (f.includeVoided) q.set("include_voided", "true");
  return `/bills?${q.toString()}`;
}

/**
 * The count beside the range. A full page (the ceiling) is NOT a count of the range: the route
 * returns the newest 200 and there may be more, so the screen says so instead of a false total.
 */
export function listCountText(n: number): { text: string; partial: boolean } {
  if (n >= LIST_CEILING) {
    return { text: `${String(LIST_CEILING)} บิลล่าสุด อาจมีมากกว่านี้ — เลือกช่วงวันที่ให้สั้นลงหรือเลือกผู้ขาย`, partial: true };
  }
  return { text: `${String(n)} บิล`, partial: false };
}

export const RANGE_TEXT = {
  incomplete: "เลือกวันที่ให้ครบทั้งสองช่อง",
  reversed: "วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น",
  failed: "โหลดบิลของช่วงนี้ไม่สำเร็จ — ไม่แสดงบิลของช่วงก่อนหน้าแทน ลองเลือกช่วงวันที่อีกครั้ง",
} as const;

/** Why this range cannot be asked for, or null. Checked BEFORE a request, so none is sent for it. */
export function rangeProblem(f: Pick<BillFilter, "from" | "to">): string | null {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (!day.test(f.from) || !day.test(f.to)) return RANGE_TEXT.incomplete;
  return f.from > f.to ? RANGE_TEXT.reversed : null;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function readBillRow(v: unknown): BillRow | null {
  const o = v as Record<string, unknown> | null;
  if (o === null || typeof o !== "object" || typeof o["id"] !== "string" || typeof o["total_amount"] !== "string") return null;
  return {
    id: o["id"],
    doc_no: str(o["doc_no"]),
    seller_id: String(o["seller_id"]),
    seller_code: str(o["seller_code"]),
    seller_name: str(o["seller_name"]),
    vehicle_no: str(o["vehicle_no"]),
    total_amount: o["total_amount"],
    payment_status: String(o["payment_status"] ?? ""),
    server_received_at: String(o["server_received_at"]),
    status: o["status"] === "voided" ? "voided" : "active",
    void_reason: str(o["void_reason"]),
    paid_amount: str(o["paid_amount"]),
  };
}

export function readBillList(json: unknown): BillRow[] | null {
  const bills = (json as { bills?: unknown }).bills;
  if (!Array.isArray(bills)) return null;
  const rows = bills.map(readBillRow);
  return rows.every((r): r is BillRow => r !== null) ? rows : null;
}

/** One page of GET /bills and the cursor for the next (null at the end). B7's report reads every page. */
export function readBillPage(json: unknown): { rows: BillRow[]; next: string | null } | null {
  const rows = readBillList(json);
  if (rows === null) return null;
  const n = (json as { next_cursor?: unknown }).next_cursor;
  return { rows, next: typeof n === "string" && n !== "" ? n : null };
}

/** The query for one page of a report: the filter's query, then the cursor when there is one. */
export function pageQuery(f: BillFilter, cursor: string | null): string {
  const q = billsQuery(f);
  return cursor === null ? q : `${q}&cursor=${encodeURIComponent(cursor)}`;
}

/**
 * A BILL LINE'S ARITHMETIC IN WORDS for the bill detail (server migration 0027): every term the
 * server used, in the line's own unit, and the deduction's reason on a line of its own. Only the
 * stored strings are shown -- nothing is recomputed. A line from a server before 0027 has no unit
 * and reads as it always did, in กก.
 */
export function lineCalc(i: BillLine): string[] {
  const unit = i.unit_name ?? "กก.";
  if (i.pricing_basis === "piece") {
    return [`${(i.quantity ?? "").replace(/\.0+$/, "")} ${unit} × ${display(i.unit_price)} บาท/${unit}`];
  }
  if (i.pricing_basis === "lump") return ["ราคาเหมา"];
  const deducted = (i.deduction_mode === "kg" || i.deduction_mode === "percent") && i.deduction_weight != null;
  const pct = i.deduction_mode === "percent" && i.deduction_pct ? ` (${display(i.deduction_pct)}%)` : "";
  const ded = deducted ? ` − หักสิ่งเจือปน ${display(i.deduction_weight ?? "")}${pct}` : "";
  const first = `ชั่งรวม ${display(i.gross_weight)} − ภาชนะ ${display(i.tare_weight)}${ded} = สุทธิ ${display(i.net_weight)} ${unit} × ${display(i.unit_price)} บาท/${unit}`;
  return deducted && i.deduction_reason ? [first, `เหตุผลที่หัก: ${i.deduction_reason}`] : [first];
}

/** A value from a closed set, or null -- a value this build does not know is never coerced. */
function oneOf<T extends string>(v: unknown, set: readonly T[]): T | null {
  return typeof v === "string" && (set as readonly string[]).includes(v) ? (v as T) : null;
}

export function readBillDetail(json: unknown): BillDetail | null {
  const row = readBillRow(json);
  const o = json as Record<string, unknown>;
  if (row === null || !Array.isArray(o["items"])) return null;
  return {
    ...row,
    voided_at: str(o["voided_at"]),
    items: (o["items"] as Record<string, unknown>[]).map((i) => ({
      line_no: Number(i["line_no"]),
      product_code: str(i["product_code"]),
      product_name: str(i["product_name"]),
      gross_weight: String(i["gross_weight"]),
      tare_weight: String(i["tare_weight"]),
      net_weight: String(i["net_weight"]),
      unit_price: String(i["unit_price"]),
      amount: String(i["amount"]),
      unit_name: str(i["unit_name"]),
      rules_recorded: i["rules_recorded"] === true,
      pricing_basis: oneOf(i["pricing_basis"], ["weight", "piece", "lump"] as const),
      quantity: str(i["quantity"]),
      deduction_mode: oneOf(i["deduction_mode"], ["none", "kg", "percent"] as const),
      deduction_pct: str(i["deduction_pct"]),
      deduction_weight: str(i["deduction_weight"]),
      deduction_reason: str(i["deduction_reason"]),
    })),
  };
}

export function readSellers(json: unknown): SellerChoice[] | null {
  const s = (json as { sellers?: unknown }).sellers;
  if (!Array.isArray(s)) return null;
  return s
    .map((x) => x as Record<string, unknown>)
    .filter((x) => typeof x["id"] === "string" && typeof x["code"] === "string" && typeof x["name"] === "string")
    .map((x) => ({ id: String(x["id"]), code: String(x["code"]), name: String(x["name"]) }));
}

/**
 * The sentence when the reason cannot be sent, or null when it can. The server's VoidRequest asks
 * only `min_length=1` (server/app/bills.py), so it would accept a reason of spaces; the desktop
 * asks for a reason a person can read (OPEN_ITEMS records the server's looser bound).
 */
export function voidReasonProblem(raw: string): string | null {
  return raw.trim() === "" ? "ต้องระบุเหตุผลที่ยกเลิกบิล" : null;
}

/** May this principal void? The server decides; this only hides a control that would be refused. */
export const mayVoid = (permissions: readonly string[]): boolean => permissions.includes("bills.void");

export const PAYMENT_STATUS_TEXT: Readonly<Record<string, string>> = {
  paid: "จ่ายแล้ว",
  partial: "จ่ายบางส่วน",
  unpaid: "ยังไม่จ่าย",
};
