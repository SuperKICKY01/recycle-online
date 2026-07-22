/**
 * Thai UI text for the validation codes produced by src/money/money.ts.
 *
 * The money module returns codes, not sentences, so the arithmetic stays
 * testable headlessly and the wording lives with the UI.
 */
import type { FieldError } from "../src/money/money";

/** `no_product` comes from cart.buildLine, not from the money parser. */
export type LineErrorCode = FieldError | "no_product";

const TH: Record<LineErrorCode, string> = {
  empty: "กรุณากรอกตัวเลข",
  not_a_number: "ตัวเลขไม่ถูกต้อง (ห้ามติดลบ ห้ามมีตัวอักษร)",
  too_many_decimals: "ทศนิยมเกินกำหนด",
  too_large: "ตัวเลขใหญ่เกินไป",
  tare_exceeds_gross: "น้ำหนักภาชนะมากกว่าน้ำหนักรวม",
  no_product: "ยังไม่ได้เลือกสินค้า",
};

export const messageFor = (e: LineErrorCode): string => TH[e];
