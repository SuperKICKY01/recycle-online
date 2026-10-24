/**
 * Thai UI text for the validation codes produced by src/money/money.ts.
 *
 * The money module returns codes, not sentences, so the arithmetic stays
 * testable headlessly and the wording lives with the UI.
 */
import type { FieldError } from "../src/money/money";

/** Every code after FieldError comes from cart.buildLine (the 0027 ones from its money rules). */
export type LineErrorCode =
  | FieldError
  | "no_product"
  | "zero_net"
  | "zero_amount"
  | "deduction_exceeds_net"
  | "deduction_pct_out_of_range"
  | "reason_required"
  | "reason_too_long"
  | "piece_quantity_invalid";

const TH: Record<LineErrorCode, string> = {
  empty: "กรุณากรอกตัวเลข",
  not_a_number: "ตัวเลขไม่ถูกต้อง (ห้ามติดลบ ห้ามมีตัวอักษร)",
  too_many_decimals: "ทศนิยมเกินกำหนด",
  too_large: "ตัวเลขใหญ่เกินไป",
  tare_exceeds_gross: "น้ำหนักภาชนะมากกว่าน้ำหนักรวม",
  no_product: "ยังไม่ได้เลือกสินค้า",
  zero_net: "น้ำหนักสุทธิเป็นศูนย์ — ตรวจสอบน้ำหนักรวมและน้ำหนักภาชนะ",
  zero_amount: "ยอดเงินเป็นศูนย์ — ตรวจสอบราคาต่อหน่วย",
  // impeccable · clarify · "Validation says what needs attention and how to correct it without
  // blaming the user." One noun for the concept everywhere: หักสิ่งเจือปน (never a bare หัก,
  // which the slip used for the container).
  deduction_exceeds_net: "หักสิ่งเจือปนมากกว่าน้ำหนักหลังหักภาชนะ — ลดค่าที่หัก",
  deduction_pct_out_of_range: "เปอร์เซ็นต์ที่หักต้องมากกว่า 0 และไม่เกิน 100",
  reason_required: "ร้านกำหนดให้ระบุเหตุผลทุกครั้งที่หักสิ่งเจือปน",
  reason_too_long: "เหตุผลยาวเกิน 200 ตัวอักษร",
  piece_quantity_invalid: "จำนวนต้องเป็นจำนวนเต็มมากกว่า 0",
};

export const messageFor = (e: LineErrorCode): string => TH[e];
