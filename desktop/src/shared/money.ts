/**
 * MONEY AND WEIGHT FOR THE EYE (D-5): the server's decimal STRINGS, grouped by the phone's rule
 * (mobile/src/money/format.ts `display`) — pure string surgery, no `Number`, no `parseFloat`, no
 * `toFixed`, no `Intl`, so every digit the server sent survives in order (hard rule 1). The rule
 * is restated here rather than imported because the desktop is not a member of the mobile
 * program; prove:bills M1 IMPORTS mobile/src/money/format.ts and holds the two to the same outputs
 * over the same inputs, so a change to either side's grouping reddens it (red team 2026-10-12).
 */
export const GROUP_SEPARATOR = ",";

export function display(value: string): string {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const dot = unsigned.indexOf(".");
  const intDigits = dot === -1 ? unsigned : unsigned.slice(0, dot);
  const tail = dot === -1 ? "" : unsigned.slice(dot);
  const grouped = intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
  return (negative ? "-" : "") + grouped + tail;
}

/**
 * The exact sum of the server's decimal strings, as a decimal string (B7: a report's total). BigInt
 * over the largest scale present -- never a float, so 0.10 + 0.10 + 0.10 is "0.30", not
 * 0.30000000000000004 (hard rule 1). Null when any input is not a plain decimal: a total over a value
 * that could not be read would be a wrong number, not a smaller one.
 */
export function sumDecimal(values: readonly string[]): string | null {
  const shape = /^(-?)(\d+)(?:\.(\d+))?$/;
  let scale = 0;
  for (const v of values) {
    const m = shape.exec(v);
    if (m === null) return null;
    scale = Math.max(scale, (m[3] ?? "").length);
  }
  let total = 0n;
  for (const v of values) {
    const m = shape.exec(v) as RegExpExecArray;
    const frac = (m[3] ?? "").padEnd(scale, "0");
    const n = BigInt(`${m[2] ?? "0"}${frac}`);
    total += m[1] === "-" ? -n : n;
  }
  const neg = total < 0n;
  const digits = (neg ? -total : total).toString().padStart(scale + 1, "0");
  const whole = scale === 0 ? digits : digits.slice(0, digits.length - scale);
  const frac = scale === 0 ? "" : `.${digits.slice(digits.length - scale)}`;
  return `${neg ? "-" : ""}${whole}${frac}`;
}

