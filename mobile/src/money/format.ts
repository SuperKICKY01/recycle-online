/**
 * Reading-grouping for money and weight, applied ONLY at render sites.
 *
 * `display` inserts thousands separators into the integer part of a decimal
 * STRING by pure string surgery — no arithmetic, no rounding, no `Number()`, no
 * `toFixed`, no `Intl`/locale. Every digit of the input survives in the same
 * order, so `stripSeparators(display(x)) === x` for every string the app
 * renders (proven in proveMoney M5). The builders and the wire never see a
 * grouped string: they pass and store the raw decimal string exactly as
 * `src/money/money.ts` and the server produced it. This honours hard rule 1 —
 * a figure is never parsed back into a number to be reformatted; it is only
 * regrouped for the eye, at the last moment before it becomes pixels.
 *
 * Grouping money AND weight is deliberate: both are decimal strings a person
 * reads at arm's length in a 5am yard, and `8,420.00 กก.` is as prone to a
 * misread as `128,400.00 บาท`. One function, one separator, one place.
 */
export const GROUP_SEPARATOR = ",";

/**
 * Insert thousands separators into the integer part. The sign, the decimal
 * point, and every digit are preserved in order; only separators are added.
 */
export function display(value: string): string {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const dot = unsigned.indexOf(".");
  const intDigits = dot === -1 ? unsigned : unsigned.slice(0, dot);
  // `tail` keeps the "." and every fractional digit exactly as given.
  const tail = dot === -1 ? "" : unsigned.slice(dot);
  const grouped = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
  return (negative ? "-" : "") + grouped + tail;
}

/** Remove every separator `display` could have inserted — its exact inverse. */
export function stripSeparators(value: string): string {
  return value.split(GROUP_SEPARATOR).join("");
}
