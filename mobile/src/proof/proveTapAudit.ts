/**
 * NO TAP-FLOOR LITERAL SURVIVED THE THEME — proven over the real screen files.
 *
 *   npm run prove:tapaudit
 *   npm run prove:tapaudit -- --break=<inject|inject_layout>
 *
 * Reads the TEXT of `app/*.tsx` and `App.tsx` off disk and runs the pure
 * `scanTapLiterals` (src/ui/tapAudit.ts) over it. After the P1.23 item-3 sweep
 * there is not one raw `minHeight`/`minWidth` number and not one local `TAP_MIN`
 * or `KEY_H` left; every tappable takes its floor from `useTheme().tapMin`.
 *
 * WHY THIS RUNS UNDER NODE AGAINST SOURCE. `app/` is the Expo program and no
 * headless proof can import it, so this reads its TEXT — the same trick
 * `proveSheets.ts` uses. It measures the SOURCE, not a render; the scanner's own
 * docstring states what a text scan cannot see (a flex-sized control), and that
 * gap is exactly what the owner's handset pass covers.
 *
 * THE CONTROLS THIS FILE CANNOT DO WITHOUT (lessons/a-check-that-never-went-red):
 *   - the corpus is non-empty AND was actually read (a known-everywhere token is
 *     present in the bytes read), so "zero findings" is not "read nothing";
 *   - the scanner DOES fire on a planted raw `minHeight: 44` and on a planted
 *     `const TAP_MIN`, so the instrument is known to catch what it is looking for.
 *
 * THE DISPROOFS, applied here by a wrapper, never by editing a real file:
 *   inject         adds a synthetic file carrying `minHeight: 36` to the tap scan.
 *                  Reddens the "zero tap literals over the real files" cell only.
 *   inject_layout  adds a synthetic file carrying `padding: 20` to the scaffold's
 *                  LAYOUT scan (P1.23 item 3 phase C). Reddens the "scaffold draws
 *                  geometry from tokens" cell only.
 *   nocolor        adds a synthetic `<TextInput>` whose style sets no `color` to the
 *                  text-field scan (A3 item 1). Reddens the Ct1 "every TextInput sets
 *                  a text colour" cell only.
 *   noselected     adds a synthetic chip that draws a selection and does not announce it
 *                  (A3 item 4). Reddens the Ca1 "no control draws a selection without
 *                  announcing it" cell only.
 *
 * P1.23 item 3 phase C also added a LAYOUT scan (scanLayoutLiterals): the page-model
 * scaffold — App.tsx and the shared SheetHeader — must draw its margin/gap/radius from
 * tokens, the app-wide raw-geometry count is REPORTED (the rest is a follow-up unit), and
 * the API base URL is asserted to have left the operator's main screen for the settings
 * diagnostics (W3).
 *
 * main() prints `PROVE_TAPAUDIT_EXIT=<n>`; its ABSENCE is the signal
 * (lessons/a-default-exit-code-is-a-default-verdict.md).
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  scanInputColours,
  scanLayoutLiterals,
  scanSelectionAnnounced,
  scanTapLiterals,
  type ScannedFile,
} from "../ui/tapAudit.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const BREAK = (process.argv.find((a) => a.startsWith("--break=")) ?? "").split("=")[1] ?? "";
const BREAK_MODES: readonly string[] = ["inject", "inject_layout", "nocolor", "noselected"];
if (BREAK !== "" && !BREAK_MODES.includes(BREAK)) {
  console.log(`  [FAIL] unknown --break=${BREAK} — nothing was damaged and nothing was measured`);
  console.log(`         known breaks: ${BREAK_MODES.join(", ")}`);
  console.log("PROVE_TAPAUDIT_EXIT=2");
  process.exit(2);
}

const APP_TSX = fileURLToPath(new URL("../../App.tsx", import.meta.url));
const APP_DIR = fileURLToPath(new URL("../../app/", import.meta.url));

function readText(path: string): string {
  // utf-8 pinned: this box's locale default is cp874 and would re-read Thai as
  // mojibake (CLAUDE.md, machine footguns).
  return readFileSync(path, { encoding: "utf8" });
}

/** Every `app/*.tsx` plus `App.tsx`, as {path, text}. */
function realFiles(): ScannedFile[] {
  const names = readdirSync(APP_DIR).filter((f) => f.endsWith(".tsx"));
  const files: ScannedFile[] = names.map((f) => ({ path: `app/${f}`, text: readText(APP_DIR + f) }));
  files.push({ path: "App.tsx", text: readText(APP_TSX) });
  return files;
}

function main(): number {
  console.log("prove:tapaudit — no raw tap floor and no local tap constant in the screens");
  console.log(`node ${process.version}`);
  if (BREAK !== "") {
    console.log("");
    console.log(
      `  *** DISPROOF ACTIVE: --break=${BREAK} — a cell that stays green is not measuring what it claims ***`,
    );
  }

  const files = realFiles();

  header("C0 the instrument looked, and it catches what it hunts");
  check("the corpus is not empty", files.length > 0, `${String(files.length)} .tsx files`);
  const corpus = files.map((f) => f.text).join("");
  check(
    "the corpus was actually read (a known-everywhere token is present)",
    corpus.includes("StyleSheet") && corpus.includes("import "),
    `${String(corpus.length)} chars read`,
  );
  check(
    "control: the scanner FINDS a planted raw minHeight:44",
    scanTapLiterals([{ path: "(fixture)", text: "  saveBtn: { minHeight: 44 }," }]).length === 1,
    "one raw-min-size finding on the planted line",
  );
  check(
    "control: the scanner FINDS a planted local const TAP_MIN",
    scanTapLiterals([{ path: "(fixture)", text: "const TAP_MIN = 56;" }]).some(
      (fnd) => fnd.kind === "local-tap-const",
    ),
    "one local-tap-const finding on the planted line",
  );
  check(
    "control: the scanner does NOT fire on a themed minHeight or a bare dot height",
    scanTapLiterals([
      { path: "(fixture)", text: "  saveBtn: { minHeight: t.tapMin },\n  dot: { height: 12, width: 12 }," },
    ]).length === 0,
    "themed floor and a decorative dot are clean",
  );

  header("C1 zero tap-floor literals across the real screen files");
  const scanned: ScannedFile[] =
    BREAK === "inject"
      ? [...files, { path: "(injected)", text: "  action: { minHeight: 36 }," }]
      : files;
  const findings = scanTapLiterals(scanned);
  console.log(`  scanned ${String(scanned.length)} files`);
  if (findings.length > 0) {
    for (const fnd of findings) {
      console.log(`    ${fnd.path}:${String(fnd.line)} [${fnd.kind}] ${fnd.text}`);
    }
  }
  check(
    "no raw minHeight/minWidth and no local TAP_MIN/KEY_H in app/*.tsx or App.tsx",
    findings.length === 0,
    findings.length === 0
      ? `${String(files.length)} files clean`
      : `${String(findings.length)} findings`,
  );

  // ── the LAYOUT scan (P1.23 item 3 phase C) ──────────────────────────────────
  header("Cs0 the layout scanner catches what it hunts");
  check(
    "control: scanLayoutLiterals FINDS a planted padding:16",
    scanLayoutLiterals([{ path: "(fixture)", text: "  card: { padding: 16 }," }]).length === 1,
    "one raw-layout finding on the planted line",
  );
  check(
    "control: it does NOT fire on tokenised margin/padding/radius/gap",
    scanLayoutLiterals([
      {
        path: "(fixture)",
        text: "  card: { padding: t.space.x3, marginTop: t.layout.cardGap, borderRadius: t.radius.card, gap: t.space.md },",
      },
    ]).length === 0,
    "token-drawn geometry is clean",
  );

  header("Cs1 the page-model scaffold draws its geometry from tokens");
  // The scaffold is the main screen (App.tsx) and the shared sheet header — the two files
  // that define the page's outer margin, inter-card gap and card radius. They carry NO raw
  // geometry literal. The rest of app/ is REPORTED below, not yet asserted to zero (the
  // remaining screen bodies are a named follow-up unit).
  const scaffoldPaths = new Set(["App.tsx", "app/SheetHeader.tsx"]);
  const scaffold = files.filter((f) => scaffoldPaths.has(f.path));
  check("the scaffold is the two files it should be", scaffold.length === 2, scaffold.map((f) => f.path).join(", "));
  const scaffoldScan: ScannedFile[] =
    BREAK === "inject_layout"
      ? [...scaffold, { path: "(injected)", text: "  card: { padding: 20 }," }]
      : scaffold;
  const scaffoldFindings = scanLayoutLiterals(scaffoldScan);
  for (const f of scaffoldFindings) console.log(`    ${f.path}:${String(f.line)} ${f.text}`);
  check(
    "no raw margin/padding/gap/borderRadius in the page-model scaffold",
    scaffoldFindings.length === 0,
    scaffoldFindings.length === 0 ? "App.tsx + SheetHeader clean" : `${String(scaffoldFindings.length)} findings`,
  );

  header("Cs2 the app-wide layout-literal count (reported, the follow-up unit)");
  const appWide = scanLayoutLiterals(files);
  const byFile = new Map<string, number>();
  for (const f of appWide) byFile.set(f.path, (byFile.get(f.path) ?? 0) + 1);
  console.log(`  ${String(appWide.length)} raw layout literals across ${String(byFile.size)} files:`);
  for (const [p, n] of [...byFile.entries()].sort()) console.log(`    ${p}: ${String(n)}`);

  header("Cs3 the API base URL is diagnostic, not on the operator's main screen (W3)");
  const appText = files.find((f) => f.path === "App.tsx")?.text ?? "";
  const settingsText = files.find((f) => f.path === "app/SettingsScreen.tsx")?.text ?? "";
  check("control: App.tsx still references API_BASE_URL (the transports use it)", appText.includes("API_BASE_URL"));
  check(
    "App.tsx does NOT concatenate API_BASE_URL into the status line",
    !appText.includes("API_BASE_URL +") && !appText.includes("${API_BASE_URL}"),
    "no URL in the operator status",
  );
  check(
    "the diagnostic surface (SettingsScreen) DOES render API_BASE_URL",
    settingsText.includes("API_BASE_URL"),
    "the server address moved to settings",
  );

  // ── A3 item 5: the open bill is not buried under pinned chrome ─────────────────
  header("Cc the open bill: the last-bill card scrolls with it, and a product brings the weights into view");
  // Source, not a render (the walk's before/after screenshots are the render). Measured on the
  // A2/A3 walk: the pinned header plus the last-bill card took ~30% of the screen while weighing
  // and hid the น้ำหนักรวม label; choosing a product moved nothing on screen.
  const cartText = files.find((f) => f.path === "app/CartScreen.tsx")?.text ?? "";
  check("control: CartScreen.tsx was read", cartText.includes("export function CartScreen"));
  check(
    "App.tsx pins the last-bill card only with NO bill open, and hands it to the cart as topSlot",
    appText.includes("{draft === null ? latestCard : null}") && appText.includes("topSlot={latestCard}"),
  );
  // Cart milestone (2026-10-12): the slot moved from the TOP of the scroll to AFTER the bill's
  // lines, so the product list starts above the fold at font scale 1.0 and 1.3 (decision 2b).
  check(
    "CartScreen renders the slot (and the plate field) AFTER the bill's lines, inside the scroll",
    /\{lines\.map\([\s\S]*?ทะเบียนรถ \(ถ้ามี\)[\s\S]*?\{topSlot \? <View style=\{styles\.bottomSlot\}>\{topSlot\}<\/View> : null\}\s*<\/ScrollView>/.test(
      cartText,
    ),
  );
  check(
    "selecting a product activates gross and scrolls to the measured weight entry",
    /const selectProduct = [\s\S]*?setActive\("gross"\);[\s\S]*?scrollRef\.current\?\.scrollTo\(/.test(cartText) &&
      cartText.includes("grossY.current = e.nativeEvent.layout.y;"),
  );

  // ── A3 item 4: a drawn selection is an announced one ───────────────────────────
  header("Ca0 the selection scan catches what it hunts");
  const unannounced =
    "<Touchable\n  style={[styles.chip, on && styles.chipOn]}\n  onPress={() => pick(x)}\n>\n  <Text>x</Text>\n</Touchable>";
  const announced =
    "<Touchable style={[styles.chip, on ? styles.chipOn : null]} onPress={() => pick(x)} selected={on}>x</Touchable>\n" +
    "<Pressable style={[styles.row, cur && styles.rowCurrent]} accessibilityState={{ selected: cur }}>x</Pressable>";
  const plantedScan = scanSelectionAnnounced([{ path: "(fixture)", text: unannounced }]);
  check(
    "control: a chip drawn selected with no announcement is found (the arrow in onPress does not end the tag)",
    plantedScan.selectable === 1 && plantedScan.findings.length === 1,
    `${String(plantedScan.selectable)} selectable, ${String(plantedScan.findings.length)} finding(s)`,
  );
  const cleanScan = scanSelectionAnnounced([{ path: "(fixture)", text: announced }]);
  check(
    "control: a Touchable with selected= and a Pressable with accessibilityState selected are clean",
    cleanScan.selectable === 2 && cleanScan.findings.length === 0,
    `${String(cleanScan.selectable)} selectable, ${String(cleanScan.findings.length)} finding(s)`,
  );

  header("Ca1 every control that DRAWS a selection ANNOUNCES it (A3 item 4)");
  const pressText = files.find((f) => f.path === "app/Press.tsx")?.text ?? "";
  check(
    "Touchable forwards `selected` into accessibilityState (disabled alongside, as Pressable already announces it)",
    pressText.includes("accessibilityState={selected === undefined ? { disabled } : { disabled, selected }}"),
  );
  const selectionScan: ScannedFile[] =
    BREAK === "noselected"
      ? [...files, { path: "(injected)", text: "<Touchable style={[styles.seg, on && styles.segOn]} onPress={go}>x</Touchable>" }]
      : files;
  const sel = scanSelectionAnnounced(selectionScan);
  for (const f of sel.findings) console.log(`    ${f.path}:${String(f.line)} <${f.tag}> draws a selection it does not announce`);
  check("the scan found selectable controls to judge", sel.selectable >= 10, `${String(sel.selectable)} controls`);
  check(
    "no control draws a selection without announcing it",
    sel.findings.length === 0,
    sel.findings.length === 0 ? `${String(sel.selectable)} controls announce` : `${String(sel.findings.length)} findings`,
  );

  // ── cart milestone: the slim bill header (A2 item 5's second half) ─────────────
  header("Ch the slim bill header: only while the cart is on screen; เมนู opens the full header");
  check(
    "slim only while the CART is on screen (a draft, a token, no sign-in screen) and the menu is closed",
    appText.includes("const cartOnScreen = draft !== null && token !== null && !mustShowSignIn({ token, sessionEnded });") &&
      appText.includes("const slimHeader = cartOnScreen && !menuOpen;"),
  );
  check(
    "the nav row and the status line are not drawn when slim; เมนู is",
    appText.includes("{slimHeader ? null : (") && appText.includes('{status !== "" && !slimHeader ? (') &&
      /slimHeader \? \(\s*<Touchable style=\{styles\.menuToggle\} onPress=\{\(\) => setMenuOpen\(true\)\} accessibilityLabel="เมนู">/.test(appText),
  );

  // ── A3 item 1: every TextInput draws its text in a theme colour ────────────────
  header("Ct0 the text-field colour scan catches what it hunts");
  const plantedBad =
    "<TextInput\n  style={styles.box}\n  placeholder=\"x\"\n/>\nconst s = {\n  box: {\n    borderWidth: 1,\n  },\n};";
  const plantedGood =
    "<TextInput\n  style={[styles.box, null]}\n  placeholder=\"x\"\n  placeholderTextColor={t.color.placeholder}\n/>\nconst s = {\n  box: { borderColor: c, color: t.color.text },\n};";
  const bad = scanInputColours([{ path: "(fixture)", text: plantedBad }]).findings.map((f) => f.kind).sort();
  check(
    "control: a planted field with no colour and no placeholder colour is found twice",
    bad.join(",") === "no-placeholder-color,no-text-color",
    bad.join(",") || "(none)",
  );
  check(
    "control: a coloured field is clean (borderColor alone does not count as a text colour)",
    scanInputColours([{ path: "(fixture)", text: plantedGood }]).findings.length === 0,
  );

  header("Ct1 every TextInput in the real screen files sets a text colour");
  const inputScan: ScannedFile[] =
    BREAK === "nocolor"
      ? [...files, { path: "(injected)", text: "<TextInput style={styles.raw} />\n  raw: {\n    fontSize: 18,\n  },\n" }]
      : files;
  const inputs = scanInputColours(inputScan);
  const colourFindings = inputs.findings.filter((f) => f.kind !== "no-placeholder-color");
  for (const f of colourFindings) console.log(`    ${f.path}:${String(f.line)} [${f.kind}] ${f.style}`);
  check("the scan found text fields to judge", inputs.fields >= 10, `${String(inputs.fields)} TextInputs`);
  check(
    "every TextInput's style sets `color` (and every style it names resolves)",
    colourFindings.length === 0,
    colourFindings.length === 0 ? `${String(inputs.fields)} fields clean` : `${String(colourFindings.length)} findings`,
  );
  // REPORTED, not asserted: a placeholder left to the platform's grey. One of these is
  // A2 item 22 (the void-reason field), outside batch 1; the rest are the same shape.
  const placeholderFindings = inputs.findings.filter((f) => f.kind === "no-placeholder-color");
  console.log(`  ${String(placeholderFindings.length)} placeholder(s) with no placeholderTextColor (reported):`);
  for (const f of placeholderFindings) console.log(`    ${f.path}:${String(f.line)}`);

  console.log("");
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

// PRESET RED, per lessons/a-default-exit-code-is-a-default-verdict.md.
process.exitCode = 1;

try {
  const code = main();
  console.log(`PROVE_TAPAUDIT_EXIT=${String(code)}`);
  process.exitCode = code;
} catch (err: unknown) {
  console.log("");
  console.log(`  [FAIL] the run died: ${err instanceof Error ? err.message : String(err)}`);
  console.log("PROVE_TAPAUDIT_EXIT=1");
  process.exitCode = 1;
}
