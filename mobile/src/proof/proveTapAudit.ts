/**
 * NO TAP-FLOOR LITERAL SURVIVED THE THEME — proven over the real screen files.
 *
 *   npm run prove:tapaudit
 *   npm run prove:tapaudit -- --break=inject
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
 * THE DISPROOF, applied here by a wrapper, never by editing a real file:
 *   inject  adds one synthetic file carrying `minHeight: 36` to the scanned set.
 *           Reddens the "zero findings over the real files" cell only.
 *
 * main() prints `PROVE_TAPAUDIT_EXIT=<n>`; its ABSENCE is the signal
 * (lessons/a-default-exit-code-is-a-default-verdict.md).
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { scanTapLiterals, type ScannedFile } from "../ui/tapAudit.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const BREAK = (process.argv.find((a) => a.startsWith("--break=")) ?? "").split("=")[1] ?? "";
const BREAK_MODES: readonly string[] = ["inject"];
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
