/**
 * A bill line's arithmetic under the shop's money rules (server migration 0027, M1). PURE: decimal
 * strings in, decimal strings out, decimal.js throughout -- a JavaScript `number` never touches a
 * weight or an amount.
 *
 * THE SERVER'S TWIN, held to it by data, not by review: server/app/money_rules.py computes what POST
 * /bills stores, and both are run over ONE file of hand-worked golden vectors,
 * golden/line_rules_vectors.json (`npm run prove:linerules` here, scripts/prove_line_rules.py there).
 * The phone's preview of a line is therefore the server's stored figure, digit for digit, or a red.
 *
 * The line DECLARES the rule values it was computed under (rounding rule, pricing basis, deduction
 * mode and value) and the server re-derives every figure from them; it never substitutes the shop's
 * current setting, because a load weighed offline was paid under the rule the phone held then.
 */
import { Decimal } from "decimal.js";

import "./money.js"; // the shared decimal.js configuration (HALF_UP, precision 50)

export const ROUNDING_RULES = ["half_up_0.01", "down_0.01", "half_up_0.25", "down_0.25", "half_up_1", "down_1"] as const;
export type RoundingRule = (typeof ROUNDING_RULES)[number];
export const DEFAULT_ROUNDING_RULE: RoundingRule = "half_up_0.01";

/** What a shop or product allows; `both` lets the operator choose per line. */
export const DEDUCTION_SETTINGS = ["none", "kg", "percent", "both"] as const;
export type DeductionSetting = (typeof DEDUCTION_SETTINGS)[number];
/** How ONE line's deduction was entered. */
export const LINE_DEDUCTION_MODES = ["none", "kg", "percent"] as const;
export type LineDeductionMode = (typeof LINE_DEDUCTION_MODES)[number];

export const PRICING_BASES = ["weight", "piece", "lump"] as const;
export type PricingBasis = (typeof PRICING_BASES)[number];

const STEPS: Readonly<Record<RoundingRule, { step: string; mode: Decimal.Rounding }>> = {
  "half_up_0.01": { step: "0.01", mode: Decimal.ROUND_HALF_UP },
  "down_0.01": { step: "0.01", mode: Decimal.ROUND_DOWN },
  "half_up_0.25": { step: "0.25", mode: Decimal.ROUND_HALF_UP },
  "down_0.25": { step: "0.25", mode: Decimal.ROUND_DOWN },
  "half_up_1": { step: "1", mode: Decimal.ROUND_HALF_UP },
  "down_1": { step: "1", mode: Decimal.ROUND_DOWN },
};

export type LineRuleCode =
  | "pricing_basis_unknown"
  | "deduction_mode_unknown"
  | "rounding_rule_unknown"
  | "tare_exceeds_gross"
  | "deduction_without_mode"
  | "deduction_pct_in_kg_mode"
  | "deduction_weight_required"
  | "deduction_pct_out_of_range"
  | "deduction_weight_mismatch"
  | "deduction_exceeds_net"
  | "quantity_mismatch"
  | "deduction_not_by_weight"
  | "piece_quantity_invalid";

export interface LineRulesIn {
  gross: string;
  tare: string;
  unitPrice: string;
  basis: string;
  rule: string;
  mode: string;
  deductionPct?: string | null;
  deductionWeight?: string | null;
  /** piece: the count typed; weight and lump: absent (derived). */
  quantity?: string | null;
}

export interface LineRulesOut {
  deductionWeight: string;
  netWeight: string;
  quantity: string;
  amount: string;
}

export type LineRulesResult = { ok: true; value: LineRulesOut } | { ok: false; code: LineRuleCode };

const isOneOf = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

/** `rule` applied to an exact, non-negative product, counted in whole steps (0.25 rounds to quarters). */
export function roundAmount(raw: Decimal, rule: RoundingRule): string {
  const { step, mode } = STEPS[rule];
  const s = new Decimal(step);
  return raw.div(s).toDecimalPlaces(0, mode).times(s).toFixed(2);
}

/** The weight a percent deduction removes: (gross - tare) x pct / 100, half-up to the gram. */
export function percentWeight(gross: string, tare: string, pct: string): string {
  return new Decimal(gross).minus(new Decimal(tare)).times(new Decimal(pct)).div(100)
    .toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed(3);
}

const fail = (code: LineRuleCode): LineRulesResult => ({ ok: false, code });

export function computeLine(input: LineRulesIn): LineRulesResult {
  if (!isOneOf(PRICING_BASES, input.basis)) return fail("pricing_basis_unknown");
  if (!isOneOf(LINE_DEDUCTION_MODES, input.mode)) return fail("deduction_mode_unknown");
  if (!isOneOf(ROUNDING_RULES, input.rule)) return fail("rounding_rule_unknown");
  const gross = new Decimal(input.gross);
  const tare = new Decimal(input.tare);
  const base = gross.minus(tare);
  if (base.isNegative()) return fail("tare_exceeds_gross");
  const pctIn = input.deductionPct ?? null;
  const weightIn = input.deductionWeight ?? null;

  let deduction: Decimal;
  if (input.mode === "none") {
    if (pctIn !== null || (weightIn !== null && !new Decimal(weightIn).isZero())) return fail("deduction_without_mode");
    deduction = new Decimal(0);
  } else if (input.mode === "kg") {
    if (pctIn !== null) return fail("deduction_pct_in_kg_mode");
    if (weightIn === null || new Decimal(weightIn).lte(0)) return fail("deduction_weight_required");
    deduction = new Decimal(weightIn);
  } else {
    if (pctIn === null || new Decimal(pctIn).lte(0) || new Decimal(pctIn).gt(100)) return fail("deduction_pct_out_of_range");
    deduction = new Decimal(percentWeight(input.gross, input.tare, pctIn));
    if (weightIn !== null && !new Decimal(weightIn).eq(deduction)) return fail("deduction_weight_mismatch");
  }
  if (deduction.gt(base)) return fail("deduction_exceeds_net");
  const net = base.minus(deduction);

  let quantity: Decimal;
  const qIn = input.quantity ?? null;
  if (input.basis === "weight") {
    if (qIn !== null && !new Decimal(qIn).eq(net)) return fail("quantity_mismatch");
    quantity = net;
  } else if (input.basis === "piece") {
    if (input.mode !== "none") return fail("deduction_not_by_weight");
    if (qIn === null) return fail("piece_quantity_invalid");
    const q = new Decimal(qIn);
    if (q.lte(0) || !q.isInteger()) return fail("piece_quantity_invalid");
    quantity = q;
  } else {
    if (input.mode !== "none") return fail("deduction_not_by_weight");
    if (qIn !== null && !new Decimal(qIn).eq(1)) return fail("quantity_mismatch");
    quantity = new Decimal(1);
  }

  return {
    ok: true,
    value: {
      deductionWeight: deduction.toFixed(3),
      netWeight: net.toFixed(3),
      quantity: quantity.toFixed(3),
      amount: roundAmount(quantity.times(new Decimal(input.unitPrice)), input.rule),
    },
  };
}
