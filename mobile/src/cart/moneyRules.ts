/**
 * THE SHOP'S MONEY RULES AS THE CART APPLIES THEM (server migration 0027, M1). PURE: no React
 * Native, no Expo, no node -- the headless proof drives exactly what the phone runs.
 *
 * WHERE THEY COME FROM. GET /shop/policy (the server's ONE reader, app/policy.py) gives the
 * effective rounding rule for this caller's branch, the shop's deduction rule and whether a
 * deduction needs a reason; GET /products gives each product's pricing basis and its EFFECTIVE
 * deduction rule (the server resolves product over shop, so the phone never re-implements the
 * precedence). Both are cached (SqliteShopPolicyStore, cached_products) so the yard prices offline.
 *
 * READ AT ANY AGE; ABSENT MEANS THE PRE-0027 RULE. The line DECLARES the rule it was computed
 * under and the server re-derives every figure from it (money_rules.py), so a rule the phone holds
 * from yesterday is recorded as yesterday's rule -- visible on the line, never a wrong total. A
 * device that has never fetched the policy (an upgraded handset before its first refresh) prices
 * exactly as every build before 0027 did: half-up to the satang, by weight, nothing deducted --
 * DEFAULT_MONEY_RULES, which is also every shop's default until its owner changes one. That is
 * not an invented value: it is the rule a shop that has not chosen is under.
 */
import type { DeductionSetting, PricingBasis, RoundingRule } from "../money/lineRules.js";
import { DEDUCTION_SETTINGS, DEFAULT_ROUNDING_RULE, ROUNDING_RULES } from "../money/lineRules.js";

export interface MoneyRules {
  rounding_rule: RoundingRule;
  deduction_mode: DeductionSetting;
  deduction_reason_required: boolean;
}

export const DEFAULT_MONEY_RULES: MoneyRules = Object.freeze({
  rounding_rule: DEFAULT_ROUNDING_RULE,
  deduction_mode: "none",
  deduction_reason_required: false,
});

/**
 * The money rules in a GET /shop/policy body, or null when the body carries none this build can
 * read (a server before 0027, or a value outside the known sets): null keeps whatever the device
 * already cached rather than overwriting it with a guess.
 */
export function moneyRulesFromPolicy(body: {
  rounding_rule?: unknown;
  deduction_mode?: unknown;
  deduction_reason_required?: unknown;
}): MoneyRules | null {
  const rule = body.rounding_rule;
  const mode = body.deduction_mode;
  const req = body.deduction_reason_required;
  if (typeof rule !== "string" || !(ROUNDING_RULES as readonly string[]).includes(rule)) return null;
  if (typeof mode !== "string" || !(DEDUCTION_SETTINGS as readonly string[]).includes(mode)) return null;
  if (typeof req !== "boolean") return null;
  return { rounding_rule: rule as RoundingRule, deduction_mode: mode as DeductionSetting, deduction_reason_required: req };
}

/** A product's deduction rule as the cart applies it: the server's effective rule, else none. */
export function productDeduction(p: { deduction_mode_effective?: DeductionSetting }): DeductionSetting {
  return p.deduction_mode_effective ?? "none";
}

/** The deduction entries a product offers: none, one, or both (the operator picks per line). */
export type EntryMode = "kg" | "percent";

export function offeredModes(setting: DeductionSetting): readonly EntryMode[] {
  if (setting === "kg") return ["kg"];
  if (setting === "percent") return ["percent"];
  if (setting === "both") return ["kg", "percent"];
  return [];
}

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
  piece: "ต่อหน่วย",
  lump: "ราคาเหมา",
};
