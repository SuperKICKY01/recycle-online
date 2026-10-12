/**
 * MONEY AND WEIGHT FOR THE EYE (D-5): the server's decimal STRINGS, grouped by the phone's rule
 * (mobile/src/money/format.ts `display`) — pure string surgery, no `Number`, no `parseFloat`, no
 * `toFixed`, no `Intl`, so every digit the server sent survives in order (hard rule 1). The rule
 * is restated here rather than imported because the desktop is not a member of the mobile
 * program; prove:bills M1 holds the two to the same outputs over the same inputs.
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
