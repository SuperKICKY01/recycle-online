/**
 * THE PALETTE READS, AND THE SCALE HAS A FLOOR — proven, not claimed.
 *
 *   npm run prove:theme
 *   npm run prove:theme -- --break=<contrast|tapmin|floor>
 *
 * Every (text, background) pair the screens actually put on screen clears WCAG
 * 2.1 contrast 4.5:1, in BOTH themes; the notice accents clear 3:1 on the tints
 * they sit on; the type scale is eight ascending steps with nothing below the
 * 13px body floor; `TAP_MIN` is 56; and `resolveTheme` maps preference × OS
 * scheme to the right tokens. The ratios are computed HERE, by this file's own
 * luminance function — `theme.ts` carries no contrast code to borrow, which is
 * the point (lessons/a-checker-must-not-share-the-code-it-checks.md).
 *
 * WHAT THIS CANNOT PROVE. That a handset renders these colours, that a thumb
 * lands inside a control, or that the sweep actually routed a given screen
 * through the theme — the last is `proveTapAudit.ts`'s job, and the render is
 * the owner's device pass. This is a statement about the numbers in `theme.ts`.
 *
 * THE DISPROOFS, each applied HERE by a wrapper, never by a hook in theme.ts.
 * Each reddens EXACTLY one cell:
 *   contrast  drops the light dangerFg onto its own background (ratio 1). Reddens
 *             the "dangerFg on dangerBg (light)" cell only.
 *   tapmin    returns 44 for the tap floor. Reddens the "TAP_MIN is 56" cell.
 *   floor     drops the body step to 12 (below the 13 floor), keeping eight
 *             ascending steps. Reddens the "smallest step is the 13px floor" cell
 *             only — the count and monotonic cells stay green, which is what makes
 *             the floor cell the one that carries the claim.
 *   fill      collapses the light onPrimaryFill onto the fill (ratio 1). Reddens
 *             the "onPrimaryFill on primaryFill (light)" cell only.
 *
 * main() prints `PROVE_THEME_EXIT=<n>` from the integer it returns; the line is
 * ABSENT if the run dies before the summary, and the absence is the signal
 * (lessons/a-default-exit-code-is-a-default-verdict.md).
 */
import {
  resolveTheme,
  TAP_MIN,
  TYPE,
  TYPE_BODY_FLOOR,
  THEME_PREFS,
  type Palette,
  type ThemeTokens,
} from "../ui/theme.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const BREAK = (process.argv.find((a) => a.startsWith("--break=")) ?? "").split("=")[1] ?? "";
const BREAK_MODES: readonly string[] = ["contrast", "tapmin", "floor", "fill"];
if (BREAK !== "" && !BREAK_MODES.includes(BREAK)) {
  console.log(`  [FAIL] unknown --break=${BREAK} — nothing was damaged and nothing was measured`);
  console.log(`         known breaks: ${BREAK_MODES.join(", ")}`);
  console.log("PROVE_THEME_EXIT=2");
  process.exit(2);
}

// ── this file's OWN contrast maths (WCAG 2.1) ────────────────────────────────
function channel(cs: number): number {
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function contrast(fg: string, bg: string): number {
  const a = luminance(fg);
  const b = luminance(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

// ── the disproof wrappers ────────────────────────────────────────────────────
/** The palette under test — damaged for the contrast break on the light scheme. */
function paletteOf(t: ThemeTokens): Palette {
  if (BREAK === "contrast" && t.scheme === "light") {
    return { ...t.color, dangerFg: t.color.dangerBg };
  }
  if (BREAK === "fill" && t.scheme === "light") {
    return { ...t.color, onPrimaryFill: t.color.primaryFill };
  }
  return t.color;
}
/** The tap floor under test. */
function tapMinUnderTest(): number {
  return BREAK === "tapmin" ? 44 : TAP_MIN;
}
/** The type scale under test — body dropped to 12 for the floor break. */
function scaleUnderTest(): number[] {
  const v = Object.values(TYPE);
  return BREAK === "floor" ? v.map((n) => (n === TYPE.body ? 12 : n)) : v;
}

// ── the pairs the screens actually use ───────────────────────────────────────
// [fg token, bg token, floor]. Enumerated from the screens' base styling and
// their tone→colour maps, NOT "all pairs" — a pair the app never draws is not a
// legibility claim.
type Key = keyof Palette;
const TEXT_PAIRS: readonly (readonly [Key, Key, number])[] = [
  ["text", "background", 4.5],
  ["text", "surface", 4.5],
  ["text", "surfaceAlt", 4.5],
  ["textMuted", "surface", 4.5],
  ["textMuted", "background", 4.5],
  ["textSubtle", "surface", 4.5],
  ["textSubtle", "background", 4.5],
  ["placeholder", "surface", 4.5],
  ["neutralFg", "surface", 4.5],
  ["neutralFg", "surfaceAlt", 4.5],
  ["textMuted", "surfaceAlt", 4.5], // the segmented control's unselected label on its track
  ["primary", "surface", 4.5], // primary as TEXT — the change/history row affordances and links
  ["primary", "background", 4.5],
  // DESTRUCTIVE TEXT ON THE PAGE GROUND ITSELF (P1.23 item 3 phase D). The sign-out
  // control, and the deactivate action in the tier menu, are red on `surface`/`background`,
  // NOT on a danger tint. New pairs, their own cells, ratios printed. If either
  // drops under 4.5:1 the destructive red changes — never this floor, never the rule.
  ["danger", "surface", 4.5],
  ["danger", "background", 4.5],
  ["onPrimary", "primary", 4.5], // white-on-accent label (badge / legacy path)
  ["onPrimaryFill", "primaryFill", 4.5], // TEXT-ON-FILL legibility (the 4.5 rule): the CTA label on the CTA fill, BOTH themes
  // notice tint text
  ["dangerFg", "dangerBg", 4.5],
  ["warningFg", "warningBg", 4.5],
  ["infoFg", "infoBg", 4.5],
  ["infoAltFg", "infoAltBg", 4.5],
  ["busyFg", "busyBg", 4.5],
  ["neutralFg", "neutralBg", 4.5],
  ["successFg", "successBg", 4.5],
  ["successAltFg", "successAltBg", 4.5],
  ["cyanFg", "cyanBg", 4.5],
];
// white/on-accent label on a badge whose background is a saturated accent (≥4.5).
const BADGE_PAIRS: readonly (readonly [Key, Key, number])[] = [
  ["onPrimary", "danger", 4.5],
  ["onPrimary", "warning", 4.5],
  ["onPrimary", "success", 4.5],
  ["onPrimary", "successStrong", 4.5],
  ["onPrimary", "info", 4.5],
  ["onPrimary", "infoStrong", 4.5],
  ["onPrimary", "cyan", 4.5],
];
// accent dot/bar on the tint it sits on (≥3).
const ACCENT_PAIRS: readonly (readonly [Key, Key, number])[] = [
  ["danger", "dangerBg", 3],
  ["warning", "warningBg", 3],
  ["info", "infoBg", 3],
  ["infoStrong", "infoAltBg", 3],
  ["infoStrong", "busyBg", 3],
  ["success", "successBg", 3],
  ["successStrong", "successAltBg", 3],
  ["cyan", "cyanBg", 3],
];

function pairCells(schemeName: string, t: ThemeTokens): void {
  const p = paletteOf(t);
  const all = [...TEXT_PAIRS, ...BADGE_PAIRS, ...ACCENT_PAIRS];
  for (const [fg, bg, floor] of all) {
    const fgv = p[fg];
    const bgv = p[bg];
    const r = contrast(fgv, bgv);
    check(
      `${fg} on ${bg} reads (${schemeName})`,
      r >= floor,
      `${r.toFixed(2)}:1 (>=${String(floor)}) ${fgv}/${bgv}`,
    );
  }
}

function main(): number {
  console.log("prove:theme — the palette, the scale, the tap floor");
  console.log(`node ${process.version}`);
  console.log("no server, no database, no network: every value below is from theme.ts");
  if (BREAK !== "") {
    console.log("");
    console.log(
      `  *** DISPROOF ACTIVE: --break=${BREAK} — a cell that stays green is not measuring what it claims ***`,
    );
  }

  const light = resolveTheme("light", "light");
  const dark = resolveTheme("dark", "dark");

  header("P1 contrast — light");
  pairCells("light", light);

  header("P2 contrast — dark");
  pairCells("dark", dark);

  header("P3 the type scale");
  const steps = scaleUnderTest();
  const orig = Object.values(TYPE);
  check("the type scale has exactly 8 steps", orig.length === 8, `${String(orig.length)} steps`);
  check(
    "the type scale is strictly ascending",
    steps.every((n, i) => i === 0 || n > (steps[i - 1] ?? -Infinity)),
    steps.join(", "),
  );
  check(
    "the smallest step is the 13px body floor, and nothing is below it",
    Math.min(...steps) === TYPE_BODY_FLOOR && TYPE_BODY_FLOOR === 13,
    `min ${String(Math.min(...steps))}, floor ${String(TYPE_BODY_FLOOR)}`,
  );

  header("P4 the tap floor");
  check("TAP_MIN is 56", tapMinUnderTest() === 56, String(tapMinUnderTest()));
  check(
    "the light and dark tokens both carry TAP_MIN",
    light.tapMin === TAP_MIN && dark.tapMin === TAP_MIN,
    `${String(light.tapMin)} / ${String(dark.tapMin)}`,
  );

  header("P5 resolveTheme");
  check("light pref -> light, ignoring the OS", resolveTheme("light", "dark").scheme === "light");
  check("dark pref -> dark, ignoring the OS", resolveTheme("dark", "light").scheme === "dark");
  check("system + OS dark -> dark", resolveTheme("system", "dark").scheme === "dark");
  check("system + OS light -> light", resolveTheme("system", "light").scheme === "light");
  check(
    "system + no OS signal -> light (the safe daylight default)",
    resolveTheme("system", undefined).scheme === "light" &&
      resolveTheme("system", null).scheme === "light",
  );
  check(
    "the two schemes are distinct token objects",
    resolveTheme("light", "light") !== resolveTheme("dark", "dark"),
  );
  check(
    "resolveTheme returns a STABLE reference per scheme (so useMemo can key on it)",
    resolveTheme("light", "light") === resolveTheme("light", null) &&
      resolveTheme("dark", "dark") === resolveTheme("dark", "light"),
  );

  header("P6 the preference set");
  check("exactly three preferences", THEME_PREFS.length === 3, THEME_PREFS.join(", "));
  check(
    "the three are light, dark, system",
    THEME_PREFS.includes("light") && THEME_PREFS.includes("dark") && THEME_PREFS.includes("system"),
  );

  // P7 — the CTA fill's PROMINENCE against its ground (owner correction 1). THIS IS
  // NOT A LEGIBILITY CELL: a fill-against-ground ratio has NO 4.5 threshold — the 4.5
  // rule governs TEXT on its own background only. The CTA LABEL's legibility is the
  // `onPrimaryFill on primaryFill` cell (>=4.5, in P1/P2), and the control's edge is
  // `primary` (a proven >=4.5 text/border pair). This section reports the pop so the
  // CTA can be SHOWN to be the brightest/most-saturated thing on its screen. A
  // pale-ground bright accent has LOW pop by nature (that low light figure IS the
  // modern look); a HIGH light pop would be the teal-700 slab that was rejected. So
  // light asserts an UPPER bound (bright, not a slab), dark a LOWER bound (pops on dark).
  header("P7 the CTA fill's PROMINENCE vs its ground (fill-vs-ground, NOT a legibility floor)");
  const lightPopSurf = contrast(light.color.primaryFill, light.color.surface);
  const lightPopBg = contrast(light.color.primaryFill, light.color.background);
  const darkPopSurf = contrast(dark.color.primaryFill, dark.color.surface);
  const darkPopBg = contrast(dark.color.primaryFill, dark.color.background);
  check(
    "light CTA fill-vs-ground PROMINENCE (no 4.5 rule): a bright accent, not a slab (< 3.5)",
    lightPopSurf < 3.5,
    `fill-vs-ground ${lightPopSurf.toFixed(2)}:1 vs surface / ${lightPopBg.toFixed(2)}:1 vs background — prominence only, no legibility threshold; ${light.color.primaryFill}`,
  );
  check(
    "dark CTA fill-vs-ground PROMINENCE (no 4.5 rule): pops on the dark ground (>= 3)",
    darkPopBg >= 3,
    `fill-vs-ground ${darkPopBg.toFixed(2)}:1 vs background / ${darkPopSurf.toFixed(2)}:1 vs surface — prominence only, no legibility threshold; ${dark.color.primaryFill}`,
  );

  console.log("");
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

// PRESET RED, per lessons/a-default-exit-code-is-a-default-verdict.md.
process.exitCode = 1;

try {
  const code = main();
  console.log(`PROVE_THEME_EXIT=${String(code)}`);
  process.exitCode = code;
} catch (err: unknown) {
  console.log("");
  console.log(`  [FAIL] the run died: ${err instanceof Error ? err.message : String(err)}`);
  console.log("PROVE_THEME_EXIT=1");
  process.exitCode = 1;
}
