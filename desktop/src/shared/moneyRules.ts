/**
 * THE SHOP'S MONEY RULES ON THE DESKTOP (server migration 0027, M1) — pure: the closed sets, the
 * shop's words for each value, and the PATCH bodies. The server owns every rule (who may change
 * one: the OWNER alone, app/policy.py; what a change reaches: new bills only); this module words
 * them and builds only what changed.
 *
 * The words are the phone's (mobile/src/cart/moneyRules.ts), restated here because the two are
 * separate programs: impeccable · clarify · "Keep the same noun and verb for the same concept
 * throughout the product." prove:people holds this copy to its literal Thai.
 */
export const ROUNDING_RULES = ["half_up_0.01", "down_0.01", "half_up_0.25", "down_0.25", "half_up_1", "down_1"] as const;
export type RoundingRule = (typeof ROUNDING_RULES)[number];
export const DEDUCTION_SETTINGS = ["none", "kg", "percent", "both"] as const;
export type DeductionSetting = (typeof DEDUCTION_SETTINGS)[number];
export const PRICING_BASES = ["weight", "piece", "lump"] as const;
export type PricingBasis = (typeof PRICING_BASES)[number];

export const ROUNDING_TEXT: Readonly<Record<RoundingRule, string>> = {
  "half_up_0.01": "ถึงสตางค์ ปัดครึ่งขึ้น (แบบเดิม)",
  "down_0.01": "ถึงสตางค์ ตัดเศษทิ้ง",
  "half_up_0.25": "ทีละ 25 สตางค์ ปัดครึ่งขึ้น",
  "down_0.25": "ทีละ 25 สตางค์ ตัดเศษทิ้ง",
  "half_up_1": "เต็มบาท ปัดครึ่งขึ้น",
  "down_1": "เต็มบาท ตัดเศษทิ้ง",
};

export const DEDUCTION_TEXT: Readonly<Record<DeductionSetting, string>> = {
  none: "ไม่หัก",
  kg: "หักเป็นน้ำหนัก",
  percent: "หักเป็นเปอร์เซ็นต์",
  both: "เลือกได้ทั้งน้ำหนักและเปอร์เซ็นต์",
};

export const BASIS_TEXT: Readonly<Record<PricingBasis, string>> = {
  weight: "ตามน้ำหนัก",
  piece: "ต่อหน่วย (นับจำนวน)",
  lump: "ราคาเหมา",
};

export const MONEY_TEXT = {
  title: "การคิดเงิน",
  ownerNote: "แก้ได้โดยเจ้าของร้านเท่านั้น มีผลกับบิลใหม่ บิลเดิมไม่เปลี่ยน",
  rounding: "การปัดเศษยอดเงินแต่ละรายการ",
  deduction: "การหักสิ่งเจือปน",
  reason: "ต้องระบุเหตุผลทุกครั้งที่หักสิ่งเจือปน",
  saved: "บันทึกกติกาการคิดเงินแล้ว — ใช้กับบิลที่ชั่งหลังจากนี้ บิลเดิมคิดตามกติกาเดิม",
  productTitle: "การคิดเงินของสินค้านี้",
  basis: "วิธีคิดราคา",
  productDeduction: "การหักสิ่งเจือปนของสินค้านี้",
  followShop: "ตามที่ร้านตั้ง",
} as const;

export interface ShopMoney {
  readonly rounding_rule: RoundingRule;
  readonly deduction_mode: DeductionSetting;
  readonly deduction_reason_required: boolean;
}

const oneOf = <T extends string>(v: unknown, set: readonly T[]): T | null =>
  typeof v === "string" && (set as readonly string[]).includes(v) ? (v as T) : null;

/** The shop's money rules off a GET /shop body, or null from a server before 0027. */
export function readShopMoney(o: Record<string, unknown>): ShopMoney | null {
  const rule = oneOf(o["rounding_rule"], ROUNDING_RULES);
  const mode = oneOf(o["deduction_mode"], DEDUCTION_SETTINGS);
  const req = o["deduction_reason_required"];
  if (rule === null || mode === null || typeof req !== "boolean") return null;
  return { rounding_rule: rule, deduction_mode: mode, deduction_reason_required: req };
}

/** Only the rules that changed; empty means nothing to send. */
export function moneyPatch(before: ShopMoney, after: ShopMoney): Partial<ShopMoney> {
  const out: { -readonly [K in keyof ShopMoney]?: ShopMoney[K] } = {};
  if (after.rounding_rule !== before.rounding_rule) out.rounding_rule = after.rounding_rule;
  if (after.deduction_mode !== before.deduction_mode) out.deduction_mode = after.deduction_mode;
  if (after.deduction_reason_required !== before.deduction_reason_required) {
    out.deduction_reason_required = after.deduction_reason_required;
  }
  return out;
}

/** May this session change a money rule? The token's role is advisory -- the server decides. */
export const isOwner = (me: { role: string } | null): boolean => me?.role === "owner";

/** A product's rules for its PATCH: only what changed; deduction null = follow the shop. */
export function productRulesPatch(
  before: { pricing_basis: PricingBasis; deduction_mode: DeductionSetting | null },
  after: { pricing_basis: PricingBasis; deduction_mode: DeductionSetting | null },
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (after.pricing_basis !== before.pricing_basis) out["pricing_basis"] = after.pricing_basis;
  if (after.deduction_mode !== before.deduction_mode) out["deduction_mode"] = after.deduction_mode;
  return out;
}

export { oneOf };
