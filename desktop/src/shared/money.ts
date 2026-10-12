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
