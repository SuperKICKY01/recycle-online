/**
 * THE ONE PRESENTATION VOCABULARY: colours, type, spacing, radius and the
 * tap-target floor, in one place, for both themes.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * Before P1.23 item 3 every screen in `app/` carried its own `StyleSheet` with
 * hard-coded hex, its own font-size literals, and — in six of them — its own
 * `const TAP_MIN = 56`, free to drift from the other five. This module is the
 * single source those screens now read, so a colour, a size or the tap floor is
 * defined ONCE and a second theme is possible at all.
 *
 * PURE TypeScript — no React Native, no Expo, no node. That is deliberate and
 * load-bearing: this file is compiled by BOTH the node program
 * (`tsconfig.node.json`, which excludes only `src/device`) and the Expo app
 * program, so `src/proof/proveTheme.ts` can drive `resolveTheme` and assert the
 * palette's contrast without a device. The React glue that reads the OS scheme
 * and the stored preference lives in `app/theme.tsx`, which imports from here;
 * nothing React-Native may enter this file or the node typecheck breaks
 * (`tsconfig.node.json`'s own comment: pulling RN globals in redefines URL).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LEGIBILITY IS ASSERTED, NOT CLAIMED
 * ─────────────────────────────────────────────────────────────────────────────
 * Every (text-colour, background-colour) pair the screens actually put on screen
 * clears WCAG 2.1 contrast 4.5:1 in BOTH themes; the notice accents clear 3:1 on
 * their surfaces. That is not an opinion in this comment — `proveTheme.ts`
 * computes each ratio from the hex below with its own luminance function and
 * reddens if any pair drops under its floor. Change a value here and the proof is
 * the authority on whether it still reads at arm's length in the sun (the B1
 * bar).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DARK PALETTE IS NOT INVERTED, IT IS DESIGNED
 * ─────────────────────────────────────────────────────────────────────────────
 * Light values are the exact hex the app already shipped (P1.23 item 3 relocated
 * them; it did not recolour them). Dark values are hand-chosen per hue family: a
 * deep tinted surface behind a light tinted text, the accent bright enough to
 * carry on the dark surface. Both are proven, not assumed.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE STORED PREFERENCE — ONE STRING, ON THE DEVICE, NEVER ON THE SERVER
 * ─────────────────────────────────────────────────────────────────────────────
 * A theme choice is a DEVICE preference, not a shop setting (a person may want
 * dark on their own phone; it says nothing about the shop). It is stored in the
 * one per-device value store the app already uses — Expo SecureStore — under the
 * key `THEME_PREF_KEY`, as one of the three strings in `THEME_PREFS`. No new
 * dependency, no schema, no server column. The read/write lives in
 * `app/theme.tsx`; the profile of what is stored is fixed HERE so both ends agree.
 */

/** Light, dark, or "follow the operating system". Default is `system`. */
export type ThemePref = "light" | "dark" | "system";

/** The three, in menu order, so a control cannot invent a fourth. */
export const THEME_PREFS: readonly ThemePref[] = ["light", "dark", "system"] as const;

/**
 * What `useColorScheme()` returns on this react-native resolution path. The name
 * `ColorSchemeName` is NOT exported on the `types` branch this project resolves
 * (only on the `react-native-strict-api` branch, which `expo/tsconfig.base.json`
 * does not enable), so the type is written out here rather than imported.
 */
export type SystemScheme = "light" | "dark" | null | undefined;

/** The two resolved schemes. `system` is resolved to one of these before use. */
export type ThemeScheme = "light" | "dark";

/** The SecureStore key the theme preference is stored under, on the device. */
export const THEME_PREF_KEY = "recycle.pref.theme";

/**
 * THE WET-HAND TAP FLOOR. Every tappable control is at least this tall.
 *
 * 56, and the reason is the owner's B1 bar (2026-08-27, `ROADMAP.md § P1.23`):
 * a 5am scrap yard, a thumb that is wet or gloved, a person who cannot miss.
 * 56 exceeds both platform minimums (iOS 44 pt, Android 48 dp) on purpose —
 * the floor is the yard's, not the platform's. This is the ONE definition; the
 * six per-screen copies it replaced were each free to drift from the others.
 */
export const TAP_MIN = 56;

/**
 * THE TYPE SCALE — eight steps, monotonic, and nothing below the body floor.
 *
 * `body` is 13: the smallest size any running text is allowed to be, chosen so a
 * line still reads held at arm's length in daylight (the B1 bar). The app used
 * to ship 10, 11 and 12 px labels; those are raised to this floor. Every other
 * step is a fixed rung a screen rounds to, so two screens cannot land one pixel
 * apart by accident. `hero` (44) is the money total on the save dialog — the one
 * number a person reads across a counter.
 *
 * `proveTheme.ts` asserts: exactly eight steps, strictly ascending, `body` the
 * smallest, and no rung below `body`.
 */
export const TYPE = {
  body: 13,
  bodyLg: 15,
  subhead: 17,
  title: 20,
  titleLg: 24,
  headline: 28,
  display: 32,
  hero: 44,
} as const;

/** The named body floor, so the proof and the screens agree what "smallest" is. */
export const TYPE_BODY_FLOOR = TYPE.body;

/**
 * Spacing rungs. The screens' padding and margin round to these so the layout is
 * one rhythm rather than a hundred independent numbers. Values preserve what the
 * app already used at the common steps; this is a rename, not a reflow.
 */
export const SPACE = {
  xs: 4,
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  xxl: 14,
  x3: 16,
  x4: 20,
  x5: 28,
} as const;

/** Corner radii. `card` (16) is P1.23 item 3 phase C — the reference's inset-card
 *  corner; the pre-C dialogs that hard-coded `borderRadius: 16` name this rung now.
 *  RADIUS is not the 8-step type scale (only that step count is fixed), so a rung is
 *  free to be added; `proveTheme` asserts TYPE, TAP_MIN and the palette, never RADIUS. */
export const RADIUS = {
  sm: 6,
  md: 8,
  lg: 10,
  xl: 12,
  pill: 14,
  card: 16,
} as const;

/**
 * STRUCTURAL LAYOUT CONSTANTS — the page's rhythm in ONE place (P1.23 item 3 phase C).
 *
 * Before phase C the main screen was full-bleed: every element a box abutting the next,
 * no outer margin, no gap. The reference the owner set reads as current because content
 * lives on INSET CARDS with a consistent outer margin and a consistent gap. Those two
 * decisions are `screenPad` and `cardGap`, drawn from `SPACE` so a card page reads a
 * NAME, not a literal repeated per screen — which is what the phase-C tap-audit's
 * layout-literal scan asserts for the page model.
 *
 * `sheetTopInset` is the status-bar clearance a sheet needs: sheets render inside the
 * single `<Modal>` host (`SheetHost`), which is OUTSIDE `App.tsx`'s `SafeAreaView`, so a
 * sheet header cannot inherit the inset and names this constant instead. It replaces the
 * seven hand-rolled `paddingTop: 56` copies the sheet `head` blocks each carried.
 */
export const LAYOUT = {
  /** Outer margin from the screen edge to a card. */
  screenPad: SPACE.x3, // 16
  /** Gap between stacked cards on a page. */
  cardGap: SPACE.xl, // 12
  /** Padding inside a card. */
  cardPad: SPACE.x3, // 16
  /** Vertical rhythm between sections inside a card. */
  sectionGap: SPACE.x4, // 20
  /** Bottom clearance under a scroll body so the last row clears the frame. */
  scrollGutter: 48,
  /** Status-bar clearance for a sheet header rendered inside the Modal host. */
  sheetTopInset: 56,
} as const;

/**
 * ONE ELEVATION STEP for a card, per scheme.
 *
 * Separation on this app comes FIRST from the surface/background colour difference (both
 * proven ≥4.5:1 for their text) and a hairline border; the shadow is a subtle
 * reinforcement, kept low on purpose — a 5am sunlit yard flattens shadow to nothing (the
 * B1 bar) and Android over-renders a heavy one. Dark leans on the border, not the shadow.
 * Adapted (not copied) from ui-ux-pro-max's dimensional-layering level-1 elevation.
 */
export interface Elevation {
  readonly shadowColor: string;
  readonly shadowOpacity: number;
  readonly shadowRadius: number;
  readonly shadowOffset: { readonly width: number; readonly height: number };
  /** Android's own elevation channel — RN does not derive it from the iOS shadow. */
  readonly elevation: number;
}
const LIGHT_CARD_ELEVATION: Elevation = {
  shadowColor: "#0f172a",
  shadowOpacity: 0.06,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};
const DARK_CARD_ELEVATION: Elevation = {
  shadowColor: "#000000",
  shadowOpacity: 0.35,
  shadowRadius: 3,
  shadowOffset: { width: 0, height: 1 },
  elevation: 1,
};

/** One colour role, resolved to a hex (or rgba) string for the active scheme. */
export interface Palette {
  // Text, darkest to faintest. Every one is proven ≥4.5:1 on the surfaces it
  // is drawn on.
  readonly text: string;
  readonly textMuted: string;
  readonly textSubtle: string;
  /** Placeholder / hint text. Proven ≥4.5:1 on `surface` — raised from the
   *  slate-400 the app used, which did not clear the floor on white. */
  readonly placeholder: string;

  // Surfaces and lines.
  readonly background: string;
  readonly surface: string;
  readonly surfaceAlt: string;
  readonly border: string;
  readonly borderSoft: string;
  readonly divider: string;

  // Brand.
  readonly primary: string;
  readonly onPrimary: string;
  /** The modal backdrop. rgba on purpose — it dims what is behind the sheet. */
  readonly overlay: string;

  // Accents: dots, bars, badges, borders on notices — the single colour that
  // stands for a state. Proven ≥3:1 on the surface they sit on.
  readonly danger: string;
  readonly warning: string;
  readonly success: string;
  readonly successStrong: string;
  readonly info: string;
  readonly infoStrong: string;
  readonly cyan: string;

  // Notice tints: a tinted background with the text colour that reads on it.
  // Every bg/fg pair here is proven ≥4.5:1. The families are the ones the
  // screens' tone maps resolve to; a screen keeps its own tone→family mapping
  // and reads the colours from here.
  readonly dangerBg: string;
  readonly dangerFg: string;
  readonly warningBg: string;
  readonly warningFg: string;
  readonly infoBg: string;
  readonly infoFg: string;
  readonly infoAltBg: string;
  readonly infoAltFg: string;
  readonly busyBg: string;
  readonly busyFg: string;
  readonly neutralBg: string;
  readonly neutralFg: string;
  readonly successBg: string;
  readonly successFg: string;
  readonly successAltBg: string;
  readonly successAltFg: string;
  readonly cyanBg: string;
  readonly cyanFg: string;
  readonly cyanBorder: string;

  // Soft one-off tints kept because a screen depends on the exact shade.
  readonly dangerSoftBg: string;
  readonly warningSoftBg: string;
  readonly tealSoft: string;
  readonly tealFaint: string;
  readonly tealBg: string;
  readonly greenSoft: string;
}

/**
 * LIGHT — the exact hex the app shipped before this pass, given a name. The one
 * genuine change is `placeholder`: the slate-400 (`#94a3b8`) the app used as
 * hint text did not clear 4.5:1 on white, so it is darkened to slate-500.
 */
const LIGHT: Palette = {
  text: "#0f172a",
  textMuted: "#475569",
  textSubtle: "#64748b",
  placeholder: "#64748b",

  background: "#f8fafc",
  surface: "#ffffff",
  surfaceAlt: "#f1f5f9",
  border: "#cbd5e1",
  borderSoft: "#e2e8f0",
  divider: "#f1f5f9",

  primary: "#0f766e",
  onPrimary: "#ffffff",
  overlay: "rgba(15,23,42,0.6)",

  danger: "#b91c1c",
  warning: "#b45309",
  success: "#15803d",
  successStrong: "#047857",
  info: "#0369a1",
  infoStrong: "#1d4ed8",
  // Cyan-700, not the cyan-600 (#0891b2) the account notice badge shipped: white
  // on #0891b2 is 3.68:1, under the floor. Darkened so the badge label reads.
  cyan: "#0e7490",

  dangerBg: "#fee2e2",
  dangerFg: "#7f1d1d",
  warningBg: "#fef3c7",
  warningFg: "#78350f",
  infoBg: "#e0f2fe",
  infoFg: "#0c4a6e",
  infoAltBg: "#eff6ff",
  infoAltFg: "#1e3a5f",
  busyBg: "#dbeafe",
  busyFg: "#1e3a8a",
  neutralBg: "#f1f5f9",
  neutralFg: "#334155",
  successBg: "#dcfce7",
  successFg: "#14532d",
  successAltBg: "#ecfdf5",
  successAltFg: "#065f46",
  cyanBg: "#ecfeff",
  cyanFg: "#0e7490",
  cyanBorder: "#67e8f9",

  dangerSoftBg: "#fef2f2",
  warningSoftBg: "#fffbeb",
  tealSoft: "#5eead4",
  tealFaint: "#ccfbf1",
  tealBg: "#f0fdfa",
  greenSoft: "#d1fae5",
};

/**
 * DARK — designed per hue family, not inverted. Deep tinted surfaces, light
 * tinted text, bright accents. Every readable pair is proven in `proveTheme.ts`.
 */
const DARK: Palette = {
  text: "#f1f5f9",
  textMuted: "#cbd5e1",
  textSubtle: "#94a3b8",
  placeholder: "#94a3b8",

  background: "#0b1220",
  surface: "#1e293b",
  surfaceAlt: "#0f172a",
  border: "#334155",
  borderSoft: "#293548",
  divider: "#293548",

  primary: "#2dd4bf",
  onPrimary: "#062925",
  overlay: "rgba(0,0,0,0.66)",

  danger: "#f87171",
  warning: "#fbbf24",
  success: "#4ade80",
  successStrong: "#34d399",
  info: "#38bdf8",
  infoStrong: "#60a5fa",
  cyan: "#22d3ee",

  dangerBg: "#450a0a",
  dangerFg: "#fecaca",
  warningBg: "#451a03",
  warningFg: "#fde68a",
  infoBg: "#082f49",
  infoFg: "#bae6fd",
  infoAltBg: "#0b1e3b",
  infoAltFg: "#bfdbfe",
  busyBg: "#0b1e3b",
  busyFg: "#bfdbfe",
  neutralBg: "#0f172a",
  neutralFg: "#cbd5e1",
  successBg: "#052e16",
  successFg: "#bbf7d0",
  successAltBg: "#052e2a",
  successAltFg: "#a7f3d0",
  cyanBg: "#083344",
  cyanFg: "#a5f3fc",
  cyanBorder: "#155e75",

  dangerSoftBg: "#3f1414",
  warningSoftBg: "#3a2a08",
  tealSoft: "#5eead4",
  tealFaint: "#134e4a",
  tealBg: "#0c2b28",
  greenSoft: "#14532d",
};

/** Everything a screen reads from `useTheme()`, for the active scheme. */
export interface ThemeTokens {
  readonly scheme: ThemeScheme;
  readonly color: Palette;
  readonly type: typeof TYPE;
  readonly space: typeof SPACE;
  readonly radius: typeof RADIUS;
  /** Structural layout constants (scheme-independent). */
  readonly layout: typeof LAYOUT;
  /** The one card elevation step for THIS scheme. */
  readonly elevation: Elevation;
  readonly tapMin: number;
  /** For `<StatusBar style=…>` — dark glyphs on the light theme, light on dark. */
  readonly statusBar: "dark" | "light";
}

const LIGHT_TOKENS: ThemeTokens = {
  scheme: "light",
  color: LIGHT,
  type: TYPE,
  space: SPACE,
  radius: RADIUS,
  layout: LAYOUT,
  elevation: LIGHT_CARD_ELEVATION,
  tapMin: TAP_MIN,
  statusBar: "dark",
};

const DARK_TOKENS: ThemeTokens = {
  scheme: "dark",
  color: DARK,
  type: TYPE,
  space: SPACE,
  radius: RADIUS,
  layout: LAYOUT,
  elevation: DARK_CARD_ELEVATION,
  tapMin: TAP_MIN,
  statusBar: "light",
};

/**
 * Resolve a preference and the OS scheme to one token object.
 *
 * `system` with no signal from the OS (`null`/`undefined`, which happens before
 * the first read and on a platform that does not report one) resolves to LIGHT,
 * deliberately: the app's whole history is a light daylight tool, so the safe
 * default when the OS says nothing is the one that has always been on screen.
 * An explicit `light`/`dark` ignores the OS entirely.
 *
 * Returns a STABLE reference per scheme (the two module-level token objects), so
 * a consumer can `useMemo(() => makeStyles(t), [t])` and rebuild styles only when
 * the scheme actually changes.
 */
export function resolveTheme(pref: ThemePref, systemScheme: SystemScheme): ThemeTokens {
  const scheme: ThemeScheme =
    pref === "system" ? (systemScheme === "dark" ? "dark" : "light") : pref;
  return scheme === "dark" ? DARK_TOKENS : LIGHT_TOKENS;
}
