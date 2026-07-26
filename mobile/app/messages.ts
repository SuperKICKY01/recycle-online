/**
 * Thai UI text for the validation codes produced by src/money/money.ts.
 *
 * The money module returns codes, not sentences, so the arithmetic stays
 * testable headlessly and the wording lives with the UI.
 */
import type { FieldError } from "../src/money/money";

/** `no_product`, `zero_net` and `zero_amount` come from cart.buildLine. */
export type LineErrorCode = FieldError | "no_product" | "zero_net" | "zero_amount";

const TH: Record<LineErrorCode, string> = {
  empty: "กรุณากรอกตัวเลข",
  not_a_number: "ตัวเลขไม่ถูกต้อง (ห้ามติดลบ ห้ามมีตัวอักษร)",
  too_many_decimals: "ทศนิยมเกินกำหนด",
  too_large: "ตัวเลขใหญ่เกินไป",
  tare_exceeds_gross: "น้ำหนักภาชนะมากกว่าน้ำหนักรวม",
  no_product: "ยังไม่ได้เลือกสินค้า",
  zero_net: "น้ำหนักสุทธิเป็นศูนย์ — ตรวจสอบน้ำหนักรวมและน้ำหนักภาชนะ",
  zero_amount: "ยอดเงินเป็นศูนย์ — ตรวจสอบราคาต่อหน่วย",
};

export const messageFor = (e: LineErrorCode): string => TH[e];
