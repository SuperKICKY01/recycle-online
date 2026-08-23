/**
 * THE MODAL PRESENTATION CLASS: the app cannot ask for two sheets at once.
 *
 *   npm run prove:sheets
 *   npm run prove:sheets -- --break=<coexist|two_hosts|always_push|pop_all|scan>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS CANNOT PROVE, SAID FIRST BECAUSE IT IS THE MOST IMPORTANT LINE
 * ─────────────────────────────────────────────────────────────────────────────
 * IT CANNOT SEE THE DEFECT. The bug was iOS refusing to present a second modal
 * view controller from one parent. That is native presentation behaviour and
 * every cell below runs under node, where there is no UIKit, no view controller
 * and no screen. A green run here is NOT evidence that the add-seller button
 * works. Only a handset can say that.
 *
 * What IS provable is the STATE INVARIANT: that the app cannot ask for two
 * sheets, and that no transition it has both dismisses and presents. Read every
 * cell as a statement about `src/ui/sheetStack.ts` and about the text of
 * `App.tsx` — and about nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE TWO SHAPES, AND A NEGATIVE CONTROL FOR EACH
 * ─────────────────────────────────────────────────────────────────────────────
 * The old design had seven sibling Modals with seven `visible` booleans, and it
 * failed in two different ways that look like one:
 *
 *   OVERLAP      two booleans true in one committed render. `--break=coexist`
 *                reproduces it: the on-screen test becomes `includes` instead of
 *                `top ===`, and S2 must go red on the one two-deep stack.
 *   SAME-COMMIT  one false and another true in the SAME render, so the platform
 *   SWAP         is asked to dismiss and present in one turn. `--break=two_hosts`
 *                reproduces it: each sheet gets its own presentation identity
 *                again, and S6 must go red on every sheet-to-sheet transition.
 *
 * Both breaks are applied HERE, by this script, through wrappers — never by a
 * hook inside the module under test. A check that has never gone red has not
 * been observed (lessons/a-check-that-never-went-red-was-never-observed.md).
 *
 * `--break=always_push` damages the reducer so `open` stacks a duplicate: S7 and
 * S8 go red. `--break=pop_all` makes `close` empty the stack, so the add-seller
 * form's ปิด lands on the cart instead of on the picker's search box: S4, S5 and
 * S6's move count go red. `--break=scan` points S9's needle at something present
 * in every file, so the "exactly one file" cell has been watched failing too
 * while both of its controls stayed green.
 *
 * MEASURED, and it is written down because it contradicted a prediction: NEITHER
 * reducer break changes the reachable SET. S1's two-walk comparison is therefore
 * not asserted under those two, and says so in the run. See the comment on that
 * cell for why `from` hides the damage from a set comparison.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE EXIT LINE
 * ─────────────────────────────────────────────────────────────────────────────
 * main() prints `PROVE_SHEETS_EXIT=<n>` from the same integer it returns. That
 * line is ABSENT if the script dies before the summary. THE ABSENCE IS THE
 * SIGNAL: a reader scanning for a number and finding none has NOT found a pass.
 */
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  NO_SHEETS,
  reachableSheetStacks,
  reduceSheets,
  SHEET_KINDS,
  SHEET_TRANSITION_NAMES,
  sheetTransition,
  sheetOnScreen,
  sheetStackValid,
  stackKey,
  topSheet,
} from "../ui/sheetStack.js";
import type { SheetKind, SheetStack, SheetTransition } from "../ui/sheetStack.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const BREAK = (process.argv.find((a) => a.startsWith("--break=")) ?? "").split("=")[1] ?? "";

/**
 * EVERY BREAK THIS FILE IMPLEMENTS. A value not in here is REFUSED, and the
 * refusal happens HERE — at module scope, before `main()` and before this
 * program has printed one character.
 *
 * WHY THE PLACEMENT IS THE FIX AND NOT A TIDINESS. `--break=coexsit` used to set
 * `BREAK` to a string no wrapper matches, so the model stayed UNDAMAGED while
 * the banner in `main()` printed `*** NEGATIVE CONTROL ACTIVE: --break=coexsit
 * ***` and every cell passed: `ALL CELLS PASSED`, `PROVE_SHEETS_EXIT=0`, exit 0.
 * The operator asked for a disproof, was TOLD one was armed, and got a clean
 * run of the undamaged model. Validating inside `main()` would still let a
 * rejected value announce itself on the way out, which is why this sits above
 * the first `console.log` rather than beside the banner it disarms.
 *
 * EXIT 2, NOT 1. In this suite 1 means assertions FAILED and 2 means the check
 * COULD NOT RUN — `prove:forbidden --offline` exits 2, `SELLERCREATE_EXIT=2`
 * marks a missing environment, and `reconcile.py` uses the same 0/1/2. A break
 * this file cannot apply is a could-not-run: nothing was measured, so 1 would
 * claim a measurement that never happened.
 *
 * FAILS CLOSED WHEN THE LIST ROTS. Add a `BREAK === "x"` wrapper below and
 * forget this list and `--break=x` is REFUSED BY NAME at exit 2 — loud, and in
 * the direction that cannot be mistaken for a pass.
 */
const BREAK_MODES: readonly string[] = ["coexist", "two_hosts", "always_push", "pop_all", "scan"];

if (BREAK !== "" && !BREAK_MODES.includes(BREAK)) {
  console.log(`  [FAIL] unknown --break=${BREAK} — nothing was damaged and nothing was measured`);
  console.log(`         known breaks: ${BREAK_MODES.join(", ")}`);
  console.log("PROVE_SHEETS_EXIT=2");
  process.exit(2);
}

/* ------------------------------------------------------------ the wrappers -- */

/**
 * IS THIS SHEET ON SCREEN — the real function, or the OLD design's answer.
 *
 * `--break=coexist` is not an invented failure: it is what seven independent
 * `visible` booleans computed. A stack of two exists on purpose (the add-seller
 * form over the picker) and only its top is rendered, so the difference between
 * `top ===` and `includes` IS the difference between the fix and the defect.
 */
function onScreen(stack: SheetStack, kind: SheetKind): boolean {
  if (BREAK === "coexist") return stack.includes(kind);
  return sheetOnScreen(stack, kind);
}

/**
 * WHICH PRESENTATION IS ON SCREEN, by identity.
 *
 * One host means one identity for every sheet, so changing sheets changes the
 * host's CHILDREN and never dismisses or presents anything. `--break=two_hosts`
 * restores the old design, where each sheet was its own presentation — and where
 * moving from one to another was a dismiss and a present in a single commit,
 * which is what iOS does not complete.
 */
function presentedHost(stack: SheetStack): string | null {
  const top = topSheet(stack);
  if (top === null) return null;
  return BREAK === "two_hosts" ? `host:${top}` : "host:sheet_host";
}

/** The reducer, or a damaged one. Nothing in `src/ui/` knows this exists. */
function step(stack: SheetStack, name: SheetTransition): SheetStack {
  const action = sheetTransition(name).action;
  if (BREAK === "always_push" && action.kind === "open") {
    // Push unconditionally: the duplicate the real `open` refuses to make.
    return [...stack, action.sheet];
  }
  if (BREAK === "pop_all" && action.kind === "close") {
    // Close everything instead of one: the add-seller form's ปิด would land on
    // the cart instead of on the picker's search box.
    return NO_SHEETS;
  }
  return reduceSheets(stack, action);
}

/* --------------------------------------------------------- the reachability -- */

/**
 * EVERY STACK THE APP CAN REACH, walked HERE rather than by the module, so the
 * break wrappers above are inside the walk. The module's own
 * `reachableSheetStacks()` is compared against this in S1: two independent walks
 * of one table, and if they disagree one of them is wrong.
 */
function walk(): { readonly stacks: readonly SheetStack[]; readonly keys: readonly string[] } {
  const seen = new Map<string, SheetStack>();
  const queue: SheetStack[] = [NO_SHEETS];
  seen.set(stackKey(NO_SHEETS), NO_SHEETS);
  while (queue.length > 0) {
    const stack = queue.shift();
    if (stack === undefined) break;
    const top = topSheet(stack);
    for (const name of SHEET_TRANSITION_NAMES) {
      if (!sheetTransition(name).from.includes(top)) continue;
      const next = step(stack, name);
      const key = stackKey(next);
      if (seen.has(key)) continue;
      seen.set(key, next);
      queue.push(next);
    }
  }
  const keys = [...seen.keys()].sort();
  return { stacks: keys.map((k) => seen.get(k) ?? NO_SHEETS), keys };
}

/**
 * WHAT THE APP CAN REACH, WRITTEN BY HAND, with the reason for each line.
 *
 * Hand-written on purpose: an expectation computed from the thing under test
 * agrees with it by construction. This is the list a person read off App.tsx's
 * controls, and if the walk disagrees, one of the two is a finding.
 *
 *   -                          nothing over the app: the cart, or the login screen
 *   bills                      the บิลล่าสุด strip, in the body
 *   confirm_save               CartScreen's save button, in the body
 *   confirm_seller_change      a different seller for a cart with lines. ALONE,
 *                              because it REPLACES: cancelling returns to the
 *                              cart, not to the picker
 *   daily                      the ยอดวันนี้ button, in the header
 *   seller_picker              the start-bill button, or CartScreen's change-seller
 *   seller_picker>add_seller   `+ เพิ่มผู้ขาย`, INSIDE the picker. The one two-deep
 *                              stack in the app, and the pair observed broken
 *   sign_out                   the ออกจากระบบ button, in the header
 *
 * NOT REACHABLE, and each absence is a claim: no stack holds two dialogs, none
 * is three deep, and nothing sits over `confirm_save`, `daily`, `bills`,
 * `sign_out` or `confirm_seller_change` — every control that opens a sheet is
 * either in the body, which a sheet covers, or in the picker.
 */
const EXPECTED_REACHABLE: readonly string[] = [
  "-",
  "bills",
  "confirm_save",
  "confirm_seller_change",
  "daily",
  "seller_picker",
  "seller_picker>add_seller",
  "sign_out",
];

/** What closing the top one lands on. The product decision, per stack. */
const EXPECTED_CLOSE: readonly (readonly [string, string, string])[] = [
  ["-", "-", "closing nothing is not an error: a stale handler after a close is normal"],
  ["bills", "-", "back to the cart"],
  ["confirm_save", "-", "back to the cart with the bill unsaved"],
  [
    "confirm_seller_change",
    "-",
    "BACK TO THE CART, not the picker: the operator already picked somebody, and ยกเลิก means keep the seller the bill had",
  ],
  ["daily", "-", "back to the cart"],
  ["seller_picker", "-", "back to the cart with no pick made"],
  [
    "seller_picker>add_seller",
    "seller_picker",
    "BACK TO THE PICKER, where the search box is, so the operator can LOOK before adding again",
  ],
  ["sign_out", "-", "back to the cart, still signed in"],
];

/* ------------------------------------------------------------------ cells -- */

function s0Members(): void {
  header("S0 the sheets, and no orphan among them");
  console.log(`  kinds: ${SHEET_KINDS.join(", ")}`);
  console.log(`  transitions: ${SHEET_TRANSITION_NAMES.join(", ")}`);
  check(
    "every kind is distinct",
    new Set(SHEET_KINDS).size === SHEET_KINDS.length,
    `${String(SHEET_KINDS.length)} kinds, ${String(new Set(SHEET_KINDS).size)} distinct`,
  );

  /*
   * AN ORPHAN KIND IS A SCREEN NOTHING CAN OPEN. Derived from the table rather
   * than counted against a literal, so adding a kind and forgetting its
   * transition reddens this instead of passing quietly.
   */
  const openable = new Set<string>();
  for (const name of SHEET_TRANSITION_NAMES) {
    const action = sheetTransition(name).action;
    if (action.kind === "open" || action.kind === "replace") openable.add(action.sheet);
  }
  const orphans = SHEET_KINDS.filter((k) => !openable.has(k));
  check(
    "every kind has a transition that opens it",
    orphans.length === 0,
    orphans.length === 0 ? `${String(openable.size)} openable` : `orphans: ${orphans.join(", ")}`,
  );

  const unreachableFrom = SHEET_TRANSITION_NAMES.filter(
    (name) => sheetTransition(name).from.length === 0,
  );
  check(
    "no transition is declared reachable from nowhere",
    unreachableFrom.length === 0,
    unreachableFrom.join(", "),
  );
}

function s1Reachable(keys: readonly string[]): void {
  header("S1 every stack the app can reach");
  for (const k of keys) console.log(`  ${k}`);
  check(
    "the reachable set is exactly the eight stacks written down",
    keys.length === EXPECTED_REACHABLE.length && keys.every((k, i) => k === EXPECTED_REACHABLE[i]),
    `walked ${String(keys.length)}, expected ${String(EXPECTED_REACHABLE.length)}`,
  );

  /*
   * TWO INDEPENDENT WALKS OF ONE TABLE. `reachableSheetStacks()` is the module's
   * own breadth-first walk; `walk()` above is this script's, with the break
   * wrappers inside it. Undamaged they must agree, which is the cell.
   *
   * NOT ASSERTED UNDER A REDUCER BREAK, and the reason is a measurement that
   * corrected a wrong prediction rather than a convenience. This cell first read
   * "the walks must DISAGREE under --break=always_push|pop_all", on the reasoning
   * that a damaged reducer must move differently. It went red under both, saying
   * `module walked 8, this script 8`: the reachable SET is unchanged by either
   * damage, because `from` keeps the damaged transitions off the frontier where
   * they would differ. `always_push` can only push `add_seller` onto
   * `[seller_picker]`, which is where the real `open` puts it anyway; `pop_all`
   * makes `close_top` from `[picker>add]` land on `-` instead of `[picker]`, and
   * `[picker]` is still reached from `-` by `open_seller_picker`. A set is not a
   * transition table, and the difference is exactly what S4 and S5 measure — both
   * of which DID go red under `pop_all`.
   */
  const fromModule = [...reachableSheetStacks()].sort();
  const agree = fromModule.length === keys.length && fromModule.every((k, i) => k === keys[i]);
  if (BREAK === "always_push" || BREAK === "pop_all") {
    console.log(
      `  [skip] the two walks are not compared under --break=${BREAK}: a damaged reducer` +
        ` may reach the same SET (module ${String(fromModule.length)}, here ${String(keys.length)}).` +
        ` The damage shows in S4, S5, S7 and S8.`,
    );
  } else {
    check(
      "the module's own walk agrees with this script's",
      agree,
      `module walked ${String(fromModule.length)}, this script ${String(keys.length)}`,
    );
  }
}

function s2AtMostOne(stacks: readonly SheetStack[]): void {
  header("S2 at most one sheet is ever asked for");
  let asked = 0;
  for (const stack of stacks) {
    const on = SHEET_KINDS.filter((k) => onScreen(stack, k));
    if (on.length > 0) asked += 1;
    check(
      `${stackKey(stack)} asks for ${String(on.length)}`,
      on.length === (stack.length === 0 ? 0 : 1),
      on.length === 0 ? "nothing on screen" : on.join(" + "),
    );
  }
  // Without this the eight cells above could all be measuring empty stacks.
  check(
    "and at least one stack DID put a sheet on screen",
    asked >= 7,
    `${String(asked)} of ${String(stacks.length)} stacks show a sheet`,
  );
}

function s3Valid(stacks: readonly SheetStack[]): void {
  header("S3 no stack holds a sheet twice, and none holds anything unknown");
  for (const stack of stacks) {
    check(`${stackKey(stack)} is a valid stack`, sheetStackValid(stack));
  }
  const deepest = stacks.reduce((m, s) => Math.max(m, s.length), 0);
  check("nothing is more than two deep", deepest <= 2, `deepest = ${String(deepest)}`);
}

function s4Close(stacks: readonly SheetStack[]): void {
  header("S4 what closing the top one returns to");
  const byKey = new Map(stacks.map((s) => [stackKey(s), s]));
  for (const [from, to, why] of EXPECTED_CLOSE) {
    const stack = byKey.get(from);
    if (stack === undefined) {
      check(`${from} is reachable so its close can be measured`, false, "not in the walk");
      continue;
    }
    const landed = stackKey(step(stack, "close_top"));
    check(`${from} -> ${landed}`, landed === to, `${why} (expected ${to})`);
  }
}

function s5CloseUndoesOpen(stacks: readonly SheetStack[]): void {
  header("S5 closing a sheet returns to exactly what was under it");
  let pairs = 0;
  for (const stack of stacks) {
    const top = topSheet(stack);
    for (const name of SHEET_TRANSITION_NAMES) {
      const spec = sheetTransition(name);
      if (spec.action.kind !== "open") continue;
      if (!spec.from.includes(top)) continue;
      if (stack.includes(spec.action.sheet)) continue; // already open: nothing pushed
      const opened = step(stack, name);
      const back = step(opened, "close_top");
      pairs += 1;
      check(
        `${stackKey(stack)} --${name}--> ${stackKey(opened)} --close--> ${stackKey(back)}`,
        stackKey(back) === stackKey(stack),
        `must land back on ${stackKey(stack)}`,
      );
    }
  }
  // A count that came FROM the walk: with no push/close pairs found, every cell
  // above is vacuous and the loop above would print nothing at all.
  check("and there were push/close pairs to measure", pairs >= 6, `${String(pairs)} pairs`);
}

function s6NoDismissAndPresent(stacks: readonly SheetStack[]): void {
  header("S6 changing sheets never dismisses and presents in one commit");
  let changes = 0;
  for (const stack of stacks) {
    const top = topSheet(stack);
    for (const name of SHEET_TRANSITION_NAMES) {
      if (!sheetTransition(name).from.includes(top)) continue;
      const next = step(stack, name);
      const before = topSheet(stack);
      const after = topSheet(next);
      // Only sheet-to-DIFFERENT-sheet moves. Opening from nothing and closing to
      // nothing are a present and a dismiss, and they are supposed to be.
      if (before === null || after === null || before === after) continue;
      changes += 1;
      check(
        `${stackKey(stack)} --${name}--> ${stackKey(next)} keeps one presentation`,
        presentedHost(stack) === presentedHost(next),
        `${String(presentedHost(stack))} -> ${String(presentedHost(next))}`,
      );
    }
  }
  /*
   * THE COUNT IS THE CELL. With zero sheet-to-sheet moves found, the loop above
   * prints nothing and a reader sees a clean section — the ninth mechanism in
   * lessons/a-check-that-never-went-red-was-never-observed.md, an empty haystack
   * satisfying every assertion over it. Four are known: picker -> add-seller,
   * picker -> seller-change, add-seller -> seller-change, add-seller -> picker.
   */
  check(
    "and there were sheet-to-sheet moves to measure",
    changes >= 4,
    `${String(changes)} moves (picker->add, picker->change, add->change, add->picker)`,
  );
}

function s7Totality(stacks: readonly SheetStack[]): void {
  header("S7 the invariant does not depend on the `from` table being right");
  /*
   * EVERY REACHABLE STACK CROSSED WITH EVERY TRANSITION, `from` IGNORED.
   *
   * `from` is a hand-written claim about WHERE App.tsx dispatches each
   * transition, and nothing in this program can check it — App.tsx is not in
   * tsconfig.node.json. So this cell assumes it is wrong: if a future call site
   * dispatches `open_add_seller` from the sign-out sheet, or `ask_seller_change`
   * from the daily report, the result must STILL be a valid stack with one sheet
   * on it.
   */
  let pairs = 0;
  let bad = 0;
  for (const stack of stacks) {
    for (const name of SHEET_TRANSITION_NAMES) {
      const next = step(stack, name);
      pairs += 1;
      const on = SHEET_KINDS.filter((k) => onScreen(next, k)).length;
      if (!sheetStackValid(next) || on > 1) {
        bad += 1;
        console.log(
          `    ${stackKey(stack)} --${name}--> ${stackKey(next)} valid=${String(
            sheetStackValid(next),
          )} onScreen=${String(on)}`,
        );
      }
    }
  }
  check(
    "no pair produces a duplicate or two sheets on screen",
    bad === 0,
    `${String(pairs)} pairs checked, ${String(bad)} bad`,
  );
  check(
    "and the cross product was not empty",
    pairs === stacks.length * SHEET_TRANSITION_NAMES.length && pairs > 0,
    `${String(stacks.length)} stacks x ${String(SHEET_TRANSITION_NAMES.length)} transitions`,
  );
}

function s8Idempotent(): void {
  header("S8 opening what is already open cannot stack a second copy");
  const deep: SheetStack = ["seller_picker", "add_seller"];
  const again = step(deep, "open_add_seller");
  check(
    "open_add_seller on [picker>add] stays [picker>add]",
    stackKey(again) === "seller_picker>add_seller",
    `got ${stackKey(again)}`,
  );
  const down = step(deep, "open_seller_picker");
  check(
    "open_seller_picker on [picker>add] comes back DOWN to [picker]",
    stackKey(down) === "seller_picker",
    `got ${stackKey(down)} — a second copy would make close return to the sheet it just closed`,
  );
  const replaced = step(deep, "ask_seller_change");
  check(
    "ask_seller_change from [picker>add] leaves the dialog ALONE",
    stackKey(replaced) === "confirm_seller_change",
    `got ${stackKey(replaced)} — both sheets underneath are finished, not suspended`,
  );
}

/* ------------------------------------------------------------ the app text -- */

const APP_TSX = fileURLToPath(new URL("../../App.tsx", import.meta.url));
const APP_DIR = fileURLToPath(new URL("../../app/", import.meta.url));

function readText(path: string): string {
  // utf-8 pinned on every read: this box's locale default is cp874 and would
  // re-read Thai as mojibake (CLAUDE.md, machine footguns).
  return readFileSync(path, { encoding: "utf8" });
}

function s9OneModalInTheTree(): void {
  header("S9 exactly one Modal element in the app's source");
  /*
   * THE STRUCTURAL CLAIM, MEASURED. "Could a future component reintroduce this
   * by being added the obvious way" has two answers, and only one of them can be
   * a proof cell:
   *
   *   a new KIND — a compile error at App.tsx's exhaustive switch, which this
   *     program cannot see, and which does not need a cell because it cannot
   *     build
   *   a new MODAL — no compile error anywhere, and exactly the mistake that
   *     produced the defect. THIS cell is the only thing standing in front of it
   *
   * `--break=scan` points the needle at something present in every file, so the
   * "exactly one" cell has been watched going red.
   */
  const needle = BREAK === "scan" ? "<View" : "<Modal";
  const files = readdirSync(APP_DIR).filter((f) => f.endsWith(".tsx"));
  check("the corpus is not empty", files.length > 0, `${String(files.length)} .tsx files in app/`);

  const scanned: string[] = [];
  const hits: string[] = [];
  for (const f of files) {
    scanned.push(`app/${f}`);
    if (readText(APP_DIR + f).includes(needle)) hits.push(`app/${f}`);
  }
  scanned.push("App.tsx");
  if (readText(APP_TSX).includes(needle)) hits.push("App.tsx");

  console.log(`  needle: ${needle}`);
  console.log(`  scanned ${String(scanned.length)}: ${scanned.join(", ")}`);
  console.log(`  hits ${String(hits.length)}: ${hits.length === 0 ? "(none)" : hits.join(", ")}`);

  /*
   * CONTROL, in the same run. Without it, "one hit" is indistinguishable from a
   * scanner that reads no files: `0 violations` covers clean and never-looked.
   * `import ` is in every one of these files, so a scanner that works finds it
   * in more than one — and if this comes back at 1, the loop above is broken and
   * nothing else in this section means anything.
   */
  let controlHits = 0;
  for (const f of files) if (readText(APP_DIR + f).includes("import ")) controlHits += 1;
  if (readText(APP_TSX).includes("import ")) controlHits += 1;
  check(
    "control: the scanner finds a known-everywhere needle in more than one file",
    controlHits === scanned.length && controlHits > 1,
    `import  in ${String(controlHits)} of ${String(scanned.length)}`,
  );
  check(
    "control: SheetHost carries the needle",
    readText(`${APP_DIR}SheetHost.tsx`).includes("<Modal"),
    "the one file that is supposed to",
  );

  check(
    "app/SheetHost.tsx is the ONLY file with a Modal element",
    hits.length === 1 && hits[0] === "app/SheetHost.tsx",
    hits.length === 1
      ? "one host, as designed"
      : `a second Modal presents from the same parent view controller and iOS refuses it: ${hits.join(", ")}`,
  );
  check(
    "App.tsx renders that host exactly once",
    readText(APP_TSX).split("<SheetHost").length - 1 === 1,
    `${String(readText(APP_TSX).split("<SheetHost").length - 1)} occurrences of <SheetHost`,
  );
}

function s10AppDispatchesDeclaredTransitionsOnly(): void {
  header("S10 App.tsx dispatches the declared transitions, and only those");
  const src = readText(APP_TSX);
  const used = new Set<string>();
  const re = /\bsheet\("([a-z_]+)"\)/g;
  let m: RegExpExecArray | null = re.exec(src);
  while (m !== null) {
    const name = m[1];
    if (name !== undefined) used.add(name);
    m = re.exec(src);
  }
  const declared = new Set<string>(SHEET_TRANSITION_NAMES);
  const undeclared = [...used].filter((n) => !declared.has(n));
  const unused = [...declared].filter((n) => !used.has(n));

  console.log(`  dispatched in App.tsx: ${[...used].sort().join(", ")}`);
  // The needle must find something, or both set comparisons below are vacuous.
  check("the scan found dispatch sites at all", used.size > 0, `${String(used.size)} distinct names`);
  check(
    "every name App.tsx dispatches is declared in sheetStack.ts",
    undeclared.length === 0,
    undeclared.length === 0 ? "nothing invented at a call site" : `undeclared: ${undeclared.join(", ")}`,
  );
  check(
    "every declared transition is actually dispatched",
    unused.length === 0,
    unused.length === 0 ? "no dead transitions" : `declared but never used: ${unused.join(", ")}`,
  );
  check(
    "no `visible=` prop is handed to a sheet any more",
    !/visible=\{/.test(src),
    "the seven booleans are gone; the stack decides",
  );
}

/* ------------------------------------------------------------------- main -- */

async function main(): Promise<number> {
  console.log("PROVE SHEETS — one sheet on screen, one presentation, no dismiss-and-present");
  console.log("");
  console.log("  THIS PROOF CANNOT SEE THE DEFECT IT WAS WRITTEN FOR. The bug is iOS refusing");
  console.log("  a second modal presentation from one parent; node has no UIKit. A green here");
  console.log("  says the app cannot ASK for two sheets. Only a handset can say the button");
  console.log("  works.");
  if (BREAK !== "") {
    console.log("");
    console.log(`  *** NEGATIVE CONTROL ACTIVE: --break=${BREAK} ***`);
    console.log("      The model is damaged ON PURPOSE by this script, never by src/ui/. Cells");
    console.log("      that measure the invariant must go red. A cell that stays green here is");
    console.log("      a cell that is not measuring what it claims.");
  }

  const { stacks, keys } = walk();

  s0Members();
  s1Reachable(keys);
  s2AtMostOne(stacks);
  s3Valid(stacks);
  s4Close(stacks);
  s5CloseUndoesOpen(stacks);
  s6NoDismissAndPresent(stacks);
  s7Totality(stacks);
  s8Idempotent();
  s9OneModalInTheTree();
  s10AppDispatchesDeclaredTransitionsOnly();

  console.log("");
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

const exitCode = await main().catch((err: unknown) => {
  console.log("");
  console.log(`  [FAIL] the run died: ${err instanceof Error ? err.message : String(err)}`);
  return 1;
});
console.log(`PROVE_SHEETS_EXIT=${String(exitCode)}`);
process.exitCode = exitCode;
