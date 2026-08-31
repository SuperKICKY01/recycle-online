/**
 * WHAT THIS DEVICE HAS NOT SENT YET — the concrete form of the daily view's
 * understatement (E4). One line, under the totals, that NEVER enters any total.
 *
 * Pure TypeScript, headless-provable. `dashboardView.ts` places it and
 * `app/DashboardScreen.tsx` draws it; neither computes the sum.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS, AND WHY IT IS A SEPARATE LINE
 * ---------------------------------------------------------------------------
 * The server total sums bills that have ARRIVED. Bills still queued on this handset
 * are not in it — that is the daily view's understatement, and the whole reason
 * that screen carries a permanent caveat. Here the app can be CONCRETE: it knows
 * exactly how many bills it holds unsent and what they are worth. So instead of a
 * generic "the real total may be higher", the owner reads "this device has N unsent
 * bills worth X".
 *
 * IT IS NEVER ADDED INTO THE TOTAL ABOVE. The summary total is the server's string,
 * byte for byte; this is a separate line the owner reads BESIDE it. Folding the two
 * would put a number on screen that reconciles with neither the server nor the
 * queue — and a total that silently included local, unsynced bills is exactly the
 * kind of number this project refuses to produce on a money screen. `dashboardView`
 * keeps them apart and `proveDashboard` asserts the total is unchanged, with a
 * positive control that adds it on purpose and goes red.
 *
 * ---------------------------------------------------------------------------
 * THE COUNT AND THE SUM COME FROM ONE SET, OVER ONE PREDICATE
 * ---------------------------------------------------------------------------
 * The caller passes the `total_amount` of every local bill in
 * `sync_state IN ('pending','syncing')` — the SAME predicate `unsentBreakdown`
 * partitions (src/sync/types.ts), not a new count. count is the number of those
 * bills; the sum is over the same list, so the two reconcile by construction.
 *
 * A bill's `total_amount` is `string | null` (src/sync/types.ts): a saved bill
 * always has one, but the type allows null, and if one is null the sum would
 * UNDERSTATE — the dangerous direction on a money screen. So a null is counted in
 * the bill count but named in the line ("ยอดจริงอาจมากกว่านี้"), never dropped
 * silently (lessons/fallback-default-is-a-wrong-number.md — do not show a number
 * as complete when it is not).
 */
import { Decimal } from "decimal.js";

import { MONEY_DP } from "../money/money.js";

// The same config money.ts sets; set here so a proof loading this module alone is
// not on decimal.js's default precision (lessons/decimal-precision-for-domain-scale.md).
Decimal.set({ rounding: Decimal.ROUND_HALF_UP, precision: 50 });

export interface UnsentLine {
  count: number;
  /** Decimal sum of the KNOWN amounts, 2dp string. A floor when `someUnknown`. */
  amount: string;
  /** True when at least one unsent bill had a null amount — the sum is then a floor. */
  someUnknown: boolean;
  /** The rendered line. "รอส่งจากเครื่องนี้ N ใบ · ยอด X บาท". */
  text: string;
}

/**
 * The unsent line, or null when nothing is unsent (no line drawn at all).
 *
 * `amounts` is the `total_amount` of every pending/syncing bill on this device.
 * count is `amounts.length`; the sum is over the non-null ones. Decimal throughout,
 * so "1000000000000.01" + "1000000000000.02" is exact where Number would not be.
 */
export function unsentLine(amounts: readonly (string | null)[]): UnsentLine | null {
  if (amounts.length === 0) return null;
  const known = amounts.filter((a): a is string => a !== null);
  const amount = known
    .reduce((acc, a) => acc.plus(new Decimal(a)), new Decimal(0))
    .toFixed(MONEY_DP);
  const someUnknown = known.length !== amounts.length;
  const count = amounts.length;
  const base = `รอส่งจากเครื่องนี้ ${String(count)} ใบ · ยอด ${amount} บาท`;
  const text = someUnknown
    ? `${base} (บางใบยังไม่มียอด ยอดจริงอาจมากกว่านี้)`
    : base;
  return { count, amount, someUnknown, text };
}
