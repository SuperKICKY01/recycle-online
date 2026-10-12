/**
 * THE TRANSACTION REPORT (B7, SRS 3.1) — pure: totals and the exported sheet, from the rows GET /bills
 * returned across ALL its pages (the keyset cursor, server/app/bills.py).
 *
 * A REPORT IS WHOLE OR IT IS NOT A REPORT. The screen reads every page; past MAX_REPORT_ROWS it stops
 * and says so, and an incomplete report cannot be exported -- a file that silently stops at a
 * ceiling is a wrong total someone files (B3's "a full page is not a count", applied to a file).
 *
 * The total is the exact sum of the server's strings (money.sumDecimal), over ACTIVE bills only; a
 * voided bill is listed, marked, and left out of the total, as it is everywhere else.
 */
import { shopDateTime } from "@recycle/shop-time";

import { PAYMENT_STATUS_TEXT, type BillRow } from "./bills";
import { sumDecimal } from "./money";
import { shopDayLabel } from "./period";
import type { Sheet } from "./xlsx";

export const MAX_REPORT_ROWS = 10_000;

export const REPORT_TEXT = {
  tooMany: `ช่วงนี้มีบิลมากกว่า ${MAX_REPORT_ROWS.toLocaleString("en-US")} ใบ — เลือกช่วงวันที่ให้สั้นลงหรือเลือกผู้ขาย รายงานที่ไม่ครบจะไม่ถูกส่งออก`,
  totalLabel: "รวม (ไม่นับบิลที่ยกเลิก)",
} as const;

export interface Totals {
  readonly activeCount: number;
  readonly voidedCount: number;
  /** null if any active total could not be read as a decimal (never a smaller number). */
  readonly activeTotal: string | null;
  readonly paidTotal: string | null;
}

export function reportTotals(rows: readonly BillRow[]): Totals {
  const active = rows.filter((r) => r.status === "active");
  return {
    activeCount: active.length,
    voidedCount: rows.length - active.length,
    activeTotal: sumDecimal(active.map((r) => r.total_amount)),
    // A missing paid amount makes the paid total unknown (null), never a smaller number.
    paidTotal: active.some((r) => r.paid_amount === null) ? null : sumDecimal(active.map((r) => r.paid_amount ?? "")),
  };
}

/** The workbook: one row per bill, then the total line. Money cells carry the server's strings. */
export function reportSheet(rows: readonly BillRow[], totals: Totals): Sheet {
  return {
    name: "รายการรับซื้อ",
    columns: [
      { header: "เลขที่บิล", kind: "text", width: 16 }, { header: "วันที่ เวลา", kind: "text", width: 18 },
      { header: "รหัสผู้ขาย", kind: "text", width: 11 }, { header: "ชื่อผู้ขาย", kind: "text", width: 26 },
      { header: "ทะเบียนรถ", kind: "text", width: 13 }, { header: "ยอดเงิน (บาท)", kind: "money", width: 15 },
      { header: "จ่ายแล้ว (บาท)", kind: "money", width: 15 }, { header: "การจ่าย", kind: "text", width: 12 },
      { header: "สถานะ", kind: "text", width: 10 }, { header: "เหตุผลที่ยกเลิก", kind: "text", width: 30 },
    ],
    rows: [
      ...rows.map((r) => [
        r.doc_no ?? "ยังไม่มีเลขที่", shopDateTime(r.server_received_at), r.seller_code, r.seller_name, r.vehicle_no,
        r.total_amount, r.paid_amount, PAYMENT_STATUS_TEXT[r.payment_status] ?? r.payment_status,
        r.status === "voided" ? "ยกเลิกแล้ว" : "ปกติ", r.void_reason,
      ]),
      [REPORT_TEXT.totalLabel, `${String(totals.activeCount)} บิล`, null, null, null, totals.activeTotal, totals.paidTotal, null, null, null],
    ],
  };
}

/** "รายการรับซื้อ 01-10-2569 ถึง 13-10-2569.xlsx" -- Buddhist era, no "/" (not allowed in a file name). */
export function reportFileName(from: string, to: string): string {
  const be = (w: string) => shopDayLabel(w).replace(/\//g, "-");
  return from === to ? `รายการรับซื้อ ${be(from)}.xlsx` : `รายการรับซื้อ ${be(from)} ถึง ${be(to)}.xlsx`;
}
