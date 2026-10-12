/**
 * THE BILLS SCREEN'S MODEL (B3, SRS 2.1) — pure: the wire shapes, the list query, and the void
 * rule the screen enforces before it ever asks (a reason is required; hard rule 5: a wrong bill is
 * VOIDED with its reason and stays in history, never deleted).
 */
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
}

export interface BillDetail extends BillRow {
  /** null when the answer carries no paid amount: shown as missing, never invented as 0.00. */
  readonly paid_amount: string | null;
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
  };
}

export function readBillList(json: unknown): BillRow[] | null {
  const bills = (json as { bills?: unknown }).bills;
  if (!Array.isArray(bills)) return null;
  const rows = bills.map(readBillRow);
  return rows.every((r): r is BillRow => r !== null) ? rows : null;
}

export function readBillDetail(json: unknown): BillDetail | null {
  const row = readBillRow(json);
  const o = json as Record<string, unknown>;
  if (row === null || !Array.isArray(o["items"])) return null;
  return {
    ...row,
    paid_amount: str(o["paid_amount"]),
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
