/**
 * All weight and money arithmetic for the client. Pure TypeScript — no React
 * Native, no Expo, no node — so the headless proofs exercise the exact code the
 * device runs.
 *
 * DECIMAL APPROACH: decimal.js, configured ROUND_HALF_UP, strings in and
 * strings out. A JavaScript `number` never touches a weight or an amount at any
 * point. Rationale:
 *
 *  - It matches the server exactly. FastAPI computes
 *    `(net * unit_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)`.
 *    decimal.js with ROUND_HALF_UP is the same operation, so device and server
 *    agree digit for digit — and the server REJECTS a mismatched total, so
 *    "close enough" would mean bills that refuse to sync.
 *  - Banker's rounding would silently disagree: 10.003 x 15.00 = 150.045 is
 *    150.05 under HALF_UP and 150.04 under HALF_EVEN. One satang, every time,
 *    on real money.
 *  - It is pure JS, so it runs under Hermes with no native module.
 *
 * The alternative considered was integer minor units. Rejected: the products
 * involved overflow Number.MAX_SAFE_INTEGER at NUMERIC(14,3) x NUMERIC(14,2)
 * scale, so it would need BigInt plus hand-rolled half-up rounding — more code
 * to get wrong, for no gain over a library that already matches Python.
 *
 * PRECISION: decimal.js rounds every operation to `precision` significant
 * digits. NUMERIC(14,3) x NUMERIC(14,2) can reach ~28 significant digits, so
 * the default of 20 would round in the middle of a multiply. Set to 50.
 */
import { Decimal } from "decimal.js";

Decimal.set({ rounding: Decimal.ROUND_HALF_UP, precision: 50 });

export const WEIGHT_DP = 3;
export const MONEY_DP = 2;

/** numeric(14,3) holds at most 11 integer digits; numeric(14,2) at most 12. */
const WEIGHT_MAX_INT_DIGITS = 11;
const MONEY_MAX_INT_DIGITS = 12;

export type FieldError =
  | "empty"
  | "not_a_number"
  | "too_many_decimals"
  | "too_large"
  | "tare_exceeds_gross";

export type Parsed =
  | { ok: true; value: string }
  | { ok: false; error: FieldError };

/**
 * Accepts a plain, unsigned decimal string only. Deliberately strict: no
 * leading "+"/"-", no exponent, no thousands separator, no whitespace inside.
 * Anything a numeric keypad cannot legitimately produce is rejected rather than
 * coerced, because coercion is how a wrong weight becomes a real payment.
 */
export function parseDecimal(raw: string, dp: number, maxIntDigits: number): Parsed {
  const s = raw.trim();
  if (s === "") return { ok: false, error: "empty" };
  if (!/^\d+(\.\d+)?$/.test(s)) return { ok: false, error: "not_a_number" };

  const [intPart = "", fracPart = ""] = s.split(".");
  if (fracPart.length > dp) return { ok: false, error: "too_many_decimals" };
  if (intPart.replace(/^0+(?=\d)/, "").length > maxIntDigits) {
    return { ok: false, error: "too_large" };
  }
  // Normalise to fixed scale so "10.5" and "10.500" are the same value on the
  // wire and in SQLite.
  return { ok: true, value: new Decimal(s).toFixed(dp) };
}

export const parseWeight = (raw: string): Parsed =>
  parseDecimal(raw, WEIGHT_DP, WEIGHT_MAX_INT_DIGITS);

export const parsePrice = (raw: string): Parsed =>
  parseDecimal(raw, MONEY_DP, MONEY_MAX_INT_DIGITS);

/**
 * net = gross - tare, exact. The server stores all three and the database
 * enforces `net_weight = gross_weight - tare_weight`, so this subtraction must
 * be exact, not approximate.
 */
export function netWeight(gross: string, tare: string): Parsed {
  const net = new Decimal(gross).minus(new Decimal(tare));
  if (net.isNegative()) return { ok: false, error: "tare_exceeds_gross" };
  return { ok: true, value: net.toFixed(WEIGHT_DP) };
}

/** amount = net x unit_price, rounded HALF_UP to 2dp — the server's formula. */
export function lineAmount(net: string, unitPrice: string): string {
  return new Decimal(net).times(new Decimal(unitPrice)).toFixed(MONEY_DP);
}

/** Sum of already-computed line amounts. One line this phase; still exact. */
export function sumAmounts(amounts: readonly string[]): string {
  return amounts
    .reduce((acc, a) => acc.plus(new Decimal(a)), new Decimal("0"))
    .toFixed(MONEY_DP);
}
