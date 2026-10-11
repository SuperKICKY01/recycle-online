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

/**
 * A SCAN FOR RAW SPACING/RADIUS GEOMETRY THAT ESCAPED THE TOKENS (P1.23 item 3 phase C).
 *
 * The phase-C reference reads as current because content lives on inset cards with a
 * consistent outer margin, a consistent gap, and one corner radius — a PAGE MODEL, not a
 * literal repeated per screen. This flags a raw geometry number (`padding: 16`,
 * `marginTop: 18`, `borderRadius: 16`, `gap: 8`) where a token (`t.layout.*`, `t.space.*`,
 * `t.radius.*`) should stand. It is DELIBERATELY SEPARATE from `scanTapLiterals`: the tap
 * proof asserts zero tap-floor literals over the whole app, and folding a spacing rule
 * into it would redden that unrelated cell over every screen not yet tokenised.
 *
 * A NUMBER immediately after the colon is a raw literal; `padding: t.layout.cardPad` has a
 * letter and is not matched. Same honest boundary as the tap scan: it reads TEXT, so a
 * literal inside a comment matches too, and a value merged in at a call site is invisible.
 */
export type LayoutFindingKind = "raw-layout";

export interface LayoutFinding {
  readonly path: string;
  readonly line: number; // 1-based
  readonly kind: LayoutFindingKind;
  readonly text: string; // the trimmed offending line
}

// `padding: 16` / `marginTop:18` / `gap: 8` / `borderRadius: 5` — a spacing, margin,
// gap or corner-radius key with a digit immediately after the colon. A token
// (`t.space.md`, `t.layout.cardGap`, `t.radius.card`) has a letter and is not matched.
const RAW_LAYOUT =
  /\b(?:(?:margin|padding)(?:Top|Bottom|Left|Right|Horizontal|Vertical|Start|End)?|gap|rowGap|columnGap|border(?:Top|Bottom)?(?:Left|Right)?Radius)\s*:\s*-?\d/;

/**
 * Scan for raw layout geometry. One finding per offending LINE, in file then line
 * order. Handed file contents, not paths — pure, like `scanTapLiterals`.
 */
export function scanLayoutLiterals(files: readonly ScannedFile[]): LayoutFinding[] {
  const findings: LayoutFinding[] = [];
  for (const { path, text } of files) {
    text.split("\n").forEach((raw, i) => {
      if (RAW_LAYOUT.test(raw)) {
        findings.push({ path, line: i + 1, kind: "raw-layout", text: raw.trim() });
      }
    });
  }
  return findings;
}

/**
 * EVERY TEXT FIELD DRAWS ITS TEXT IN A THEME COLOUR (A3 item 1, 2026-10-11).
 *
 * A `TextInput` whose style sets no `color` draws the typed value in the platform
 * default — near-black — which on the dark theme is unreadable. The price editor was
 * the one field in the app that did this, and a price nobody can read is a price
 * nobody can check before it lands on every next bill.
 *
 * For each `<TextInput … />` the scan reads its `style={…}`, takes the BASE style (the
 * first `styles.<name>` / `s.<name>`) and every ARM of a ternary, and brace-matches each
 * one's style block in the same file; each must contain `color:`. A `cond && styles.x`
 * modifier layered on a coloured base is not required to repeat the colour. A field whose style cannot be
 * resolved is itself a finding (fail closed): an unresolvable style is one this scan
 * cannot vouch for. A `placeholder=` with no `placeholderTextColor=` is reported as its
 * own kind; the proof REPORTS that kind and does not yet assert it to zero (A2 item 22). Same honest boundary as the other scans —
 * it reads TEXT, so a colour merged in at runtime from elsewhere is invisible.
 */
export type InputFindingKind = "no-text-color" | "no-placeholder-color" | "style-unresolved";

export interface InputFinding {
  readonly path: string;
  readonly line: number; // 1-based, the `<TextInput` line
  readonly kind: InputFindingKind;
  readonly style: string;
}

function styleBlock(text: string, name: string): string | null {
  const m = new RegExp(`\\n\\s+${name}:\\s*\\{`).exec(text);
  if (m === null) return null;
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < text.length; i++) {
    if (text[i] === "{") depth += 1;
    else if (text[i] === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(m.index + m[0].length, i);
    }
  }
  return null;
}

/**
 * A DRAWN SELECTION IS ALSO AN ANNOUNCED ONE (A3 item 4, 2026-10-11).
 *
 * A uiautomator dump of the dashboard read `selected=false` on every filter chip, the one
 * drawn as chosen included: the state existed only as colour. For every `<Touchable …>` /
 * `<Pressable …>` opening tag whose `style` switches on a SELECTION style — `cond && styles.xOn`
 * or `cond ? styles.xOn : …`, the suffix On / Active / Current / Selected — the tag must pass
 * `selected={…}` (Touchable) or an `accessibilityState={{ … selected … }}` (Pressable).
 * Text-level: a selection drawn some other way (an icon only) is invisible to it.
 */
export interface SelectionFinding {
  readonly path: string;
  readonly line: number;
  readonly tag: string;
}

/** The opening tag's attribute text, brace-aware so `onPress={() => …}` does not end it. */
function openingTag(text: string, from: number): string {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0) return text.slice(from, i);
  }
  return text.slice(from);
}

const SELECTION_STYLE = /\b\w+\s*(?:&&|\?)\s*styles\.\w+(?:On|Active|Current|Selected)\b/;
const ANNOUNCES_SELECTION = /\bselected=\{|accessibilityState=\{\{[^}]*\bselected\b/;

export function scanSelectionAnnounced(files: readonly ScannedFile[]): {
  selectable: number;
  findings: SelectionFinding[];
} {
  const findings: SelectionFinding[] = [];
  let selectable = 0;
  for (const { path, text } of files) {
    for (const m of text.matchAll(/<(Touchable|Pressable)\b/g)) {
      const attrs = openingTag(text, (m.index ?? 0) + m[0].length);
      if (!SELECTION_STYLE.test(styleAttr(attrs))) continue;
      selectable += 1;
      if (!ANNOUNCES_SELECTION.test(attrs)) {
        findings.push({ path, line: text.slice(0, m.index).split("\n").length, tag: m[1] ?? "" });
      }
    }
  }
  return { selectable, findings };
}

/** The text inside `style={…}` (brace-matched), or "" when the field has no style. */
function styleAttr(attrs: string): string {
  const at = attrs.search(/\bstyle=\{/);
  if (at < 0) return "";
  let depth = 0;
  const start = attrs.indexOf("{", at);
  for (let i = start; i < attrs.length; i++) {
    if (attrs[i] === "{") depth += 1;
    else if (attrs[i] === "}") {
      depth -= 1;
      if (depth === 0) return attrs.slice(start + 1, i);
    }
  }
  return "";
}

export function scanInputColours(files: readonly ScannedFile[]): {
  fields: number;
  findings: InputFinding[];
} {
  const findings: InputFinding[] = [];
  let fields = 0;
  for (const { path, text } of files) {
    for (const m of text.matchAll(/<TextInput\b([\s\S]*?)\/>/g)) {
      fields += 1;
      const attrs = m[1] ?? "";
      const line = text.slice(0, m.index).split("\n").length;
      const sattr = styleAttr(attrs);
      const names = [...sattr.matchAll(/\b(?:styles|s)\.(\w+)/g)].map((n) => n[1] ?? "");
      // The BASE (first name) and every TERNARY ARM must colour the text; a `cond && styles.x`
      // modifier layered on a coloured base need not (AddSellerSheet's inputTall).
      const arms = [...sattr.matchAll(/[?:]\s*(?:styles|s)\.(\w+)/g)].map((n) => n[1] ?? "");
      const mustColour = [...new Set([...names.slice(0, 1), ...arms])];
      if (names.length === 0) findings.push({ path, line, kind: "style-unresolved", style: "(none)" });
      for (const style of mustColour) {
        const block = styleBlock(text, style);
        if (block === null) findings.push({ path, line, kind: "style-unresolved", style });
        else if (!/\bcolor\s*:/.test(block)) findings.push({ path, line, kind: "no-text-color", style });
      }
      if (/\bplaceholder=/.test(attrs) && !/\bplaceholderTextColor=/.test(attrs)) {
        findings.push({ path, line, kind: "no-placeholder-color", style: names.join("|") });
      }
    }
  }
  return { fields, findings };
}
