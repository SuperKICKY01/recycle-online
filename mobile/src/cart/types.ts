/**
 * Cart / draft model. PURE TypeScript — no React Native, no Expo, no node.
 *
 * A DRAFT IS NOT A BILL. This is the central distinction of Phase 2c-3 and it
 * is structural, not a flag:
 *
 *  - a draft lives in its own tables (local_draft, local_draft_lines), so no
 *    query the sync engine runs can reach it;
 *  - it has NO bill UUID and NO idempotency_key — both are minted at the
 *    instant of promotion, so nothing is "consumed" while the yard is still
 *    typing;
 *  - it therefore cannot be sent, claimed, retried, or counted as a bill.
 *
 * Every weight and money field is a decimal STRING, as everywhere else.
 */
import type { LineDeductionMode, PricingBasis, RoundingRule } from "../money/lineRules.js";

/** Raw, unvalidated text of the entry fields, exactly as the user left them. */
export interface DraftForm {
  product_id: string | null;
  /** Kept as typed — NOT parsed. Restoring must be faithful, including junk. */
  gross: string;
  tare: string;
  price: string;
  /*
   * THE MONEY-RULE ENTRIES (server migration 0027, M1). OPTIONAL so a form restored from a draft
   * saved before them still reads (form_json is JSON); absent reads as empty. Every one is cleared
   * when the product changes and when a line is committed (entry.ts): a deduction belongs to the
   * load on the scale, never to the next one.
   */
  /** The impurity deduction as typed: a weight, or a percent when `deduction_mode` is percent. */
  deduction?: string;
  /** Which entry the operator chose when the product offers both. */
  deduction_mode?: "kg" | "percent";
  /** The reason for the deduction, free text. */
  reason?: string;
  /** Whole pieces, for a piece-priced product. */
  pieces?: string;
}

/**
 * THE RULE VALUES A LINE WAS COMPUTED UNDER (server migration 0027): what the line declares on the
 * wire and what the server re-derives every figure from. Present on every line the cart builds with
 * the shop's rules; ABSENT on a line restored from a draft saved before them, which goes out in the
 * pre-0027 shape (weight, nothing deducted, half-up to the satang -- exactly how it was priced).
 */
export interface LineRules {
  pricing_basis: PricingBasis;
  rounding_rule: RoundingRule;
  deduction_mode: LineDeductionMode;
  /** The percent typed, in percent mode; null otherwise. */
  deduction_pct: string | null;
  /** The weight deducted (typed, or derived from the percent); "0.000" when none. */
  deduction_weight: string;
  deduction_reason: string | null;
  /** What the price multiplied: the net, the pieces, or 1 for a lump. */
  quantity: string;
}

export interface DraftLine {
  /** Stable UUID. Becomes the purchase_bill_items.id on promotion. */
  id: string;
  /**
   * Ordering key within the draft. Monotonic, NEVER reused, and deliberately
   * NOT the line_no: deleting a line leaves a hole here, which is harmless
   * because line_no is assigned 1..N at promotion (see toBillItems).
   */
  seq: number;
  product_id: string;
  /** Denormalised so a restored draft renders before master data is fetched. */
  product_code: string;
  product_name: string;
  uom_code: string;
  gross_weight: string;
  tare_weight: string;
  net_weight: string;
  unit_price: string;
  list_price: string;
  /** quantity x unit_price under the line's rounding rule — the server's exact formula. */
  amount: string;
  /** The rules it was priced under; absent on a pre-0027 draft line (see LineRules). */
  rules?: LineRules;
}

export interface Draft {
  /** Draft's own id. NOT a bill id; no bill id exists until promotion. */
  id: string;
  seller_id: string;
  vehicle_no: string | null;
  lines: DraftLine[];
  /** Next value for DraftLine.seq. Monotonic across deletes. */
  next_seq: number;
  form: DraftForm;
  updated_at: string;
  /**
   * Fetch time of the master data available when this draft was STARTED, or
   * null on a draft restored from before the field existed.
   *
   * Written once and never moved. The cache can only get NEWER while a bill is
   * open, so the value at the start is the oldest data any line on this bill
   * could have been priced from — see master/freshness.ts on why the false
   * positive (a draft whose data refreshed mid-cart) is the safe direction and
   * stamping at save time is not.
   */
  master_as_of: string | null;
}

export const emptyForm = (): DraftForm => ({
  product_id: null,
  gross: "",
  tare: "",
  price: "",
});
