/**
 * A TEXT SCAN FOR TAP-FLOOR LITERALS THAT ESCAPED THE THEME.
 *
 * After P1.23 item 3 every tappable control takes its minimum size from
 * `TAP_MIN` (via `useTheme().tapMin`), and no screen declares its own tap
 * constant. This function is how a proof asserts that stayed true: it reads the
 * TEXT of the screen files and reports every place a raw tap-floor number or a
 * local tap constant survived.
 *
 * PURE — it is handed file contents, not paths, so it runs under the node proof
 * with no React Native and no filesystem of its own. `proveTapAudit.ts` reads
 * `app/*.tsx` and `App.tsx` off disk and feeds them here.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IT CATCHES, AND — SAID PLAINLY — WHAT IT CANNOT
 * ─────────────────────────────────────────────────────────────────────────────
 * It reads TEXT, not layout. So:
 *
 *   CAUGHT
 *     - `minHeight: <number>` / `minWidth: <number>` — a raw tap floor. These are
 *       tap-target minimums by convention in this app; after the sweep every one
 *       reads `minHeight: t.tapMin`, whose value is a name, not a digit.
 *     - a local tap constant: `const TAP_MIN = …` (the six copies the sweep
 *       deleted) or `const KEY_H = …` (the numpad's own copy). A control sized by
 *       a private constant is a control free to drift from the shared floor.
 *
 *   NOT CAUGHT — and this is the honest boundary, not a bug:
 *     - a control sized by FLEX alone, or by padding with no minimum. Whether its
 *       rendered height clears 56 is a question about layout on a real screen,
 *       which only the owner's handset pass answers.
 *     - bare `height:` / `width:` numbers. A text scan cannot tell a Pressable's
 *       height from a decorative 12×12 dot's, so flagging them would be noise. The
 *       one tappable this app sized by a bare `height` (the numpad key) used the
 *       `KEY_H` constant, which IS caught by the constant rule above.
 *     - a tap constant under a NEW name. The two names this codebase used are
 *       matched by literal; a third would need adding here (the keyword-vs-alias
 *       trap, lessons/a-gate-that-matches-a-keyword-misses-its-aliases.md — stated,
 *       not solved, because a text scan has no authority on what a constant is
 *       named).
 *
 * The proof pairs this with a POSITIVE CONTROL (a fixture that DOES contain a raw
 * `minHeight: 44`), so a green "zero findings" is told apart from a scan that read
 * nothing.
 */

/** The two names this codebase used for a per-file tap floor. */
const LOCAL_TAP_CONST_NAMES: readonly string[] = ["TAP_MIN", "KEY_H"];

export type TapFindingKind = "raw-min-size" | "local-tap-const";

export interface TapFinding {
  readonly path: string;
  readonly line: number; // 1-based
  readonly kind: TapFindingKind;
  readonly text: string; // the trimmed offending line
}

export interface ScannedFile {
  readonly path: string;
  readonly text: string;
}

// `minHeight: 44` / `minWidth:56` — a digit immediately after the colon is a raw
// literal; `minHeight: t.tapMin` or `minHeight: TAP_MIN` has a letter and is not
// matched.
const RAW_MIN_SIZE = /\b(minHeight|minWidth)\s*:\s*\d/;

// `const TAP_MIN = 56` / `const KEY_H = 56` — a local declaration, not a use and
// not an import (`import { TAP_MIN }` has no `const … =`).
const LOCAL_TAP_CONST = new RegExp(
  `\\bconst\\s+(?:${LOCAL_TAP_CONST_NAMES.join("|")})\\b\\s*=`,
);

/**
 * Scan the given file texts. Returns one finding per offending LINE, in file then
 * line order. A line that trips both rules yields one finding of each kind.
 */
export function scanTapLiterals(files: readonly ScannedFile[]): TapFinding[] {
  const findings: TapFinding[] = [];
  for (const { path, text } of files) {
    const lines = text.split("\n");
    lines.forEach((raw, i) => {
      const line = i + 1;
      if (LOCAL_TAP_CONST.test(raw)) {
        findings.push({ path, line, kind: "local-tap-const", text: raw.trim() });
      }
      if (RAW_MIN_SIZE.test(raw)) {
        findings.push({ path, line, kind: "raw-min-size", text: raw.trim() });
      }
    });
  }
  return findings;
}
