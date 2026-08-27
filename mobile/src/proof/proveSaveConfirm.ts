/**
 * P1.23 commit 1: THE SAVE CONFIRMATION SAYS ONE THING ABOUT THE BILL'S FATE.
 *
 *   npm run prove:saveconfirm
 *
 * NO SERVER, NO DATABASE, NO NETWORK. `saveConfirmNotice` is a pure function of
 * one value — the seller's grade — and every case below CONSTRUCTS its input
 * directly. Read every result here as a statement about that function and about
 * nothing else.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS MEASURES
 * ---------------------------------------------------------------------------
 * `app/ConfirmSaveDialog.tsx` drew two boxes two centimetres apart. For a seller
 * with no grade the RED box said the bill would WAIT for the office before it
 * entered the system, while the AMBER box — a bare constant with no grade in it —
 * said UNCONDITIONALLY that once saved the bill entered the system IMMEDIATELY.
 * Both were internally correct; neither renderer knew the other existed. The
 * operator does not read a function, they read a card
 * (lessons/403-is-about-what-the-caller-may-do.md, "one card, two renderers";
 * lessons/correct-classification-can-still-render-as-an-error.md).
 *
 * ---------------------------------------------------------------------------
 * WHY THE ASSERTION IS THE CONCATENATION, IN DRAW ORDER, AND NEGATIVE
 * ---------------------------------------------------------------------------
 * A defect that lives BETWEEN two correct regions is invisible to any assertion
 * that reads either alone — 448 green cells could not see the 403 version of this
 * exact shape. So the cells below compose the two boxes in the order the dialog
 * draws them (park, then warn) and assert NEGATIVELY that the forbidden pairing —
 * a claim that the bill enters the system now AND a claim that it waits — never
 * appears in one card.
 *
 * A negative over an empty render is satisfied by silence
 * (lessons/a-check-that-never-went-red-was-never-observed.md, ninth mechanism),
 * so every negative carries a PRESENCE SIBLING in the same case, and the
 * predicate itself is controlled against the SHIPPED wording as a literal: after
 * the fix the live function can no longer produce the contradiction, so the only
 * input the instrument is known to catch is the old one, kept here
 * (lessons/correct-classification-can-still-render-as-an-error.md, P-GRADECARD:
 * "the positive control has to be a LITERAL here").
 *
 * THE DRAW ORDER HAS ONE ORTHOGONAL LINE BETWEEN THE TWO BOXES — the pricing
 * provenance line from `master/freshness.ts` — and it is omitted here on purpose:
 * it carries neither claim, it is a separate concern proven in its own place, and
 * importing it would couple this proof to it. The two boxes this module owns, in
 * their true relative order, are what carry the contradiction.
 *
 * ON THE OUTPUT. All Thai. MOJIBAKE IN THE CONSOLE IS THE CONSOLE — this box is
 * codepage 874 (lessons/console-is-not-the-observation.md). Every assertion below
 * compares JavaScript strings and never console bytes.
 *
 * THE EXIT LINE. main() prints `SAVECONFIRM_EXIT=<n>` from the same integer it
 * returns. That line is ABSENT if the script dies before the summary, and THE
 * ABSENCE IS THE SIGNAL.
 */
import { saveConfirmNotice } from "../master/saveConfirmNotice.js";
import type { SaveConfirmNotice } from "../master/saveConfirmNotice.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/* --------------------------------------------------------------- needles -- */

/** A claim the bill enters the system NOW. */
const ENTERS_NOW = "ส่งเข้าระบบทันที";
/** A claim the bill WAITS for the office. */
const WAITS = "รอสำนักงาน";
/** The grade-less park box's own presence sibling: it says NOT sent yet. */
const NOT_SENT_YET = "ยังไม่ส่งเข้าระบบ";
/** The irreversibility instruction, which must survive on EVERY save. */
const IRREVERSIBLE = "ยกเลิกบิลและออกใบใหม่";

const THAI = /[฀-๿]/;

/**
 * THE WHOLE NOTICE IN DRAW ORDER, as one string. The dialog draws the red park
 * box (when present) above the amber warn box, so this is the order the operator
 * reads them in.
 */
function drawn(n: SaveConfirmNotice): string {
  const parts = n.park !== null ? [n.park, n.warn] : [n.warn];
  return parts.join(" | ");
}

/** The contradiction, as a single predicate over the composed card. */
function contradicts(composed: string): boolean {
  return composed.includes(ENTERS_NOW) && composed.includes(WAITS);
}

/* --------------------------------------------- the shipped wording (control) -- */

/**
 * THE TWO BOXES AS THEY SHIPPED, kept as literals so the negative predicate has
 * an input it is known to catch. `contradicts()` is TRUE of this composition and
 * FALSE of every live one below — that pair is the evidence, not either half.
 */
const OLD_PARK =
  "ผู้ขายรายนี้ยังไม่มีเกรด — บันทึกได้ แต่บิลจะค้างรอสำนักงานกำหนดเกรดก่อนจึงจะส่งเข้าระบบ";
const OLD_WARN =
  "บันทึกแล้วจะส่งเข้าระบบทันที แก้ไขไม่ได้ — หากผิดต้องยกเลิกบิลและออกใบใหม่";

/* -------------------------------------------------------------------- S1 -- */

function s1GradeLess(): SaveConfirmNotice {
  header("S1 — a seller with NO grade: the bill waits, and the card never says it enters now");
  const n = saveConfirmNotice(null);
  const composed = drawn(n);
  console.log(`  park: ${n.park ?? "(none)"}`);
  console.log(`  warn: ${n.warn}`);
  console.log(`  card: ${composed}`);

  check("S1: STAGING — the red park box is drawn for a grade-less seller", n.park !== null, composed);
  check(
    "S1: PRESENCE — the card says the bill WAITS for the office, and is NOT sent yet",
    composed.includes(WAITS) && composed.includes(NOT_SENT_YET),
    composed,
  );
  check(
    "S1: NEGATIVE — the card does NOT claim the bill enters the system now",
    !composed.includes(ENTERS_NOW),
    composed,
  );
  check(
    "S1: THE PAIRING — enters-now and waits never appear together on one card",
    !contradicts(composed),
    composed,
  );
  check(
    "S1: and the irreversibility instruction survives the split",
    composed.includes(IRREVERSIBLE),
    composed,
  );
  return n;
}

/* -------------------------------------------------------------------- S2 -- */

function s2Graded(): SaveConfirmNotice {
  header("S2 — a graded seller: the bill enters the system now, and nothing says it waits");
  const n = saveConfirmNotice("A");
  const composed = drawn(n);
  console.log(`  park: ${n.park ?? "(none)"}`);
  console.log(`  warn: ${n.warn}`);
  console.log(`  card: ${composed}`);

  check("S2: STAGING — no park box is drawn for a graded seller", n.park === null, composed);
  check(
    "S2: PRESENCE — the card says the bill enters the system now",
    composed.includes(ENTERS_NOW),
    composed,
  );
  check(
    "S2: NEGATIVE — and it does NOT say the bill waits for the office",
    !composed.includes(WAITS),
    composed,
  );
  check(
    "S2: THE PAIRING — enters-now and waits never appear together on one card",
    !contradicts(composed),
    composed,
  );
  check(
    "S2: and the irreversibility instruction is present here too",
    composed.includes(IRREVERSIBLE),
    composed,
  );
  return n;
}

/* -------------------------------------------------------------------- S3 -- */

/**
 * THE DERIVATION IS REAL, AND THE INSTRUMENT CATCHES THE SHIPPED DEFECT.
 *
 * A sentence that is hardcoded and one that is derived look identical from one
 * input, so both grades are driven and the two cards must DIFFER (mechanism 1 of
 * a-green-cell-is-evidence: assert the direction of a difference). And the
 * `contradicts()` predicate is run against the shipped composition, where it must
 * fire — otherwise the two green negatives above are evidence about a predicate
 * that cannot go red.
 */
function s3DerivationAndControl(gradeless: SaveConfirmNotice, graded: SaveConfirmNotice): void {
  header("S3 — the fate is derived (the two cards differ), and the shipped card DID contradict");

  const a = drawn(gradeless);
  const b = drawn(graded);
  check(
    "S3: the grade-less card and the graded card are DIFFERENT — the fate is derived, not fixed",
    a !== b,
    a === b ? "IDENTICAL" : "different",
  );

  const shipped = [OLD_PARK, OLD_WARN].join(" | ");
  console.log(`  shipped card: ${shipped}`);
  check(
    "S3: CONTROL — the SHIPPED card DID contain the forbidden pairing (enters-now AND waits)",
    contradicts(shipped),
    `enters=${String(shipped.includes(ENTERS_NOW))} waits=${String(shipped.includes(WAITS))}`,
  );
  check(
    "S3: CONTROL — both live cards render Thai, so the absence cells are not satisfied by an empty screen",
    THAI.test(a) && THAI.test(b),
  );
}

/* ------------------------------------------------------------------ main -- */

function main(): number {
  console.log("P1.23 commit 1 — the save confirmation says one thing about the bill's fate");
  console.log(`node ${process.version}`);
  console.log("no server, no database, no network: both inputs below are CONSTRUCTED");

  const gradeless = s1GradeLess();
  const graded = s2Graded();
  s3DerivationAndControl(gradeless, graded);

  console.log("");
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

/*
 * PRESET TO RED, per lessons/a-default-exit-code-is-a-default-verdict.md. Even a
 * synchronous main is guarded: any exit other than main() completing leaves the
 * verdict at 1.
 */
process.exitCode = 1;

try {
  const code = main();
  console.log(`SAVECONFIRM_EXIT=${String(code)}`);
  process.exitCode = code;
} catch (err: unknown) {
  console.log("");
  console.log(`  [FAIL] the run died: ${err instanceof Error ? err.message : String(err)}`);
  console.log("SAVECONFIRM_EXIT=1");
  process.exitCode = 1;
}
