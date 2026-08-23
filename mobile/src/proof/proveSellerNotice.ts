/**
 * P1.8a phase 3 proof: THE ADD-SELLER SCREEN, AND THE EIGHT THINGS IT CAN SAY.
 *
 *   npm run prove:sellernotice
 *
 * NO SERVER, NO DATABASE, NO NETWORK, and that is a claim about what is being
 * measured rather than a convenience. Two of the eight outcomes cannot be
 * produced by today's server at all — `forbidden`, because POST /sellers is
 * behind `get_principal` and no role is refused on it, and `invalid`, because
 * the honest way to reach a 422 is to violate `id_number` and that refusal body
 * is the one this route must never read. A message nobody can trigger is a
 * message that can be wrong with nobody knowing, which is this repository's
 * oldest failure shape.
 *
 * SO THE CLAIM IS SPLIT IN TWO. Whether the TRANSPORT can produce an outcome is
 * phase 2's measurement, taken against a real server, and nothing here adds to
 * it or subtracts from it. Whether the RENDERER handles one is a property of a
 * pure function, and every cell below CONSTRUCTS its input directly. Read every
 * result in this file as a statement about `sellerCreateNotice` and about
 * nothing else.
 *
 * WHAT IT DOES DRIVE THROUGH THE REAL CALLER: N7 and N8 put a stub `fetchImpl`
 * behind the REAL `SellerApi`, so the form -> draft -> classification -> sentence
 * seam is exercised end to end without a server. Two green proofs do not cover
 * the seam between them, and phase 2's proof has never heard of a form.
 *
 * ON THE OUTPUT. Almost all of it is Thai. MOJIBAKE IN THE CONSOLE IS THE
 * CONSOLE — this box is codepage 874 (lessons/console-is-not-the-observation.md,
 * and CLAUDE.md's two CP874 entries). Every assertion below compares JavaScript
 * strings and never console bytes. `--dump=<path>` writes the eight rendered
 * results as UTF-8 BYTES, straight from node, so the phase report can quote them
 * from an artefact instead of from a terminal.
 *
 * THE EXIT LINE. main() prints `SELLERNOTICE_EXIT=<n>` from the same integer it
 * returns. That line is ABSENT if the script dies before the summary. THE
 * ABSENCE IS THE SIGNAL: a reader scanning for a number and finding none has NOT
 * found a pass.
 *
 * THE NEGATIVE CONTROL. `--break=collapse` makes `code_assignment_failed` render
 * as `duplicate_code` — the exact conflation the server refuses to make.
 * `--break=fixed` makes every outcome render one sentence. Both are applied HERE,
 * by the proof, and never by a hook inside the module under test (the same rule
 * proveSellerCreate's C7 states). A check that has never gone red has not been
 * observed.
 */
import { writeFileSync } from "node:fs";

import { SellerApi } from "../master/createSeller.js";
import type { CreateSellerOutcome, CreatedSeller, SellerDraft } from "../master/createSeller.js";
import {
  BLANK_SELLER_FORM,
  pickableSeller,
  sellerDraftFrom,
  sellerFormReady,
} from "../master/sellerForm.js";
import type { SellerFormFields } from "../master/sellerForm.js";
import { sellerCreateNotice } from "../master/sellerCreateNotice.js";
import type { SellerCreateNotice, SellerCreateSite } from "../master/sellerCreateNotice.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const SITE: SellerCreateSite = "yard_add_seller";

const BREAK = (process.argv.find((a) => a.startsWith("--break=")) ?? "").split("=")[1] ?? "";
const DUMP = (process.argv.find((a) => a.startsWith("--dump=")) ?? "").split("=")[1] ?? "";

/**
 * EVERY BREAK THIS FILE IMPLEMENTS. A value not in here is REFUSED, at module
 * scope, before `main()` and before one character is printed.
 *
 * WHY: an unrecognised value used to leave `render()` returning the REAL
 * notice — the break silently not applied — while `main()` printed `***
 * NEGATIVE CONTROL ACTIVE: --break=<typo> ***` and every cell passed against
 * the undamaged renderer. The operator asked for a disproof, was TOLD one was
 * armed, and got an ordinary green. Validating inside `main()` would still let
 * a rejected value announce itself on the way out, so this sits above the first
 * `console.log`.
 *
 * EXIT 2, NOT 1: 1 means assertions failed and 2 means could-not-run, the same
 * 0/1/2 `prove:forbidden --offline` and `reconcile.py` use. A break that was
 * never applied measured nothing.
 *
 * FAILS CLOSED WHEN THE LIST ROTS: add a break below and forget it here and the
 * new name is refused BY NAME at exit 2, never silently ignored.
 *
 * `--dump=` IS NOT COVERED AND IS NOT THIS DEFECT. A mistyped dump selector
 * prints nothing extra and claims nothing; it announces no control, so it
 * cannot tell an operator a disproof ran. It is recorded here so the omission
 * reads as a decision rather than an oversight.
 */
const BREAK_MODES: readonly string[] = ["collapse", "fixed"];

if (BREAK !== "" && !BREAK_MODES.includes(BREAK)) {
  console.log(`  [FAIL] unknown --break=${BREAK} — nothing was damaged and nothing was measured`);
  console.log(`         known breaks: ${BREAK_MODES.join(", ")}`);
  console.log("SELLERNOTICE_EXIT=2");
  process.exit(2);
}

/**
 * THE RENDERER, OR A DELIBERATELY BROKEN ONE. Every cell below goes through
 * here, so a break reaches all of them and the report can name which cells
 * moved. Nothing in `src/master/` knows this exists.
 */
function render(outcome: CreateSellerOutcome): SellerCreateNotice {
  const real = sellerCreateNotice(outcome, SITE);
  if (BREAK === "collapse" && outcome.kind === "code_assignment_failed") {
    return sellerCreateNotice({ kind: "duplicate_code" }, SITE);
  }
  if (BREAK === "fixed") {
    return { tone: real.tone, headline: "เพิ่มผู้ขายไม่สำเร็จ", lines: [], action: null };
  }
  return real;
}

/**
 * THE WHOLE RENDERED STATE, IN DRAW ORDER — headline, then every line, then the
 * button's label.
 *
 * ASSERTED AS ONE STRING AND NEVER AS PARTS, because the defect this discipline
 * exists for was a card whose two regions were each internally correct and which
 * contradicted itself as a whole: a line promising the system would act
 * automatically, two lines above a box saying it had not, 448 green cells unable
 * to see it (lessons/403-is-about-what-the-caller-may-do.md).
 *
 * THE ORDER IS DUPLICATED between this function and `app/AddSellerSheet.tsx`,
 * and nothing mechanical ties them together — `app/` is unreachable from this
 * program (`tsconfig.node.json` has `rootDir: "src"`). That is a real limit and
 * it is stated rather than hidden: if the sheet is reordered and this is not,
 * these cells go on measuring the old order. Same honest gap as
 * `MASTER_DATA_CODES` against the server's raise sites.
 */
function drawn(notice: SellerCreateNotice): string {
  const parts = [notice.headline, ...notice.lines];
  if (notice.action !== null) parts.push(notice.action.label);
  return parts.filter((p) => p.length > 0).join(" | ");
}

/* --------------------------------------------------------------- fixtures -- */

/**
 * THE VALUES THAT MUST NOT REACH THE SCREEN, distinctive enough that their
 * absence is measurable. `CreatedSeller` carries all four, so the `created`
 * member is the ONE member where a PII assertion can actually fire — everywhere
 * else the union carries nothing at all and the absence is structural.
 */
const CREATED_ID = "7f3a1c2e-9b4d-4e6f-8a1b-2c3d4e5f6a7b";
const CREATED_ID_NUMBER = "1234567890123";
const CREATED_ADDRESS = "99/9 หมู่เก้า ถนนพิสูจน์";
const CREATED_VEHICLE = "กข-9999";
const CREATED_NAME = "ผู้ขายทดสอบ พิสูจน์";
const CREATED_CODE = "S57";

/** As the server returns one created from this form: no grade, all three PII. */
const CREATED_NO_GRADE: CreatedSeller = {
  id: CREATED_ID,
  code: CREATED_CODE,
  name: CREATED_NAME,
  phone: "0800000009",
  grade: null,
  id_number: CREATED_ID_NUMBER,
  address: CREATED_ADDRESS,
  vehicle_no: CREATED_VEHICLE,
  is_active: true,
};

/** The other branch of the created wording: a shop's own code, and a grade. */
const CREATED_WITH_GRADE: CreatedSeller = {
  ...CREATED_NO_GRADE,
  code: "P18C-A1",
  grade: "B",
};

/**
 * EVERY MEMBER, keyed by its own tag.
 *
 * A `Record` over `CreateSellerOutcome["kind"]` rather than an array: a ninth
 * member added to the union is a COMPILE ERROR here, so this proof cannot go on
 * reporting "eight of eight" over a union that has nine.
 */
const MEMBERS: Record<CreateSellerOutcome["kind"], CreateSellerOutcome> = {
  created: { kind: "created", seller: CREATED_NO_GRADE },
  duplicate_code: { kind: "duplicate_code" },
  code_assignment_failed: { kind: "code_assignment_failed" },
  session_expired: { kind: "session_expired" },
  forbidden: { kind: "forbidden", code: "admin_required" },
  invalid: { kind: "invalid" },
  unavailable: { kind: "unavailable" },
  ambiguous: { kind: "ambiguous" },
};

/**
 * The eight tags, WRITTEN OUT BY HAND HERE rather than read off the object
 * above, so the count this proof reports comes from somewhere other than the
 * thing it is counting (lessons/a-checker-must-not-share-the-code-it-checks.md).
 */
const ORDER: readonly CreateSellerOutcome["kind"][] = [
  "created",
  "duplicate_code",
  "code_assignment_failed",
  "session_expired",
  "forbidden",
  "invalid",
  "unavailable",
  "ambiguous",
];

/* ---------------------------------------------------------------- N0 ------ */

function n0Members(): void {
  header("N0: eight members, and the union has no ninth this proof cannot see");

  const keys = Object.keys(MEMBERS).sort();
  const expected = [...ORDER].sort();
  check(
    "N0: the constructed set has EIGHT members",
    keys.length === 8,
    `${String(keys.length)} constructed`,
  );
  check(
    "N0: and they are exactly the eight tags this proof was written against",
    keys.join(",") === expected.join(","),
    keys.join(","),
  );
}

/* ---------------------------------------------------------------- N1 ------ */

/**
 * P1: ALL EIGHT DRIVEN, and printed in full so a human can read what the
 * operator would read. Nothing is asserted here that is not asserted below; the
 * point of this cell is the OUTPUT.
 */
function n1Print(): readonly { kind: string; notice: SellerCreateNotice; text: string }[] {
  header("N1: every member rendered, in full");

  const rows = ORDER.map((kind) => {
    const notice = render(MEMBERS[kind]);
    return { kind, notice, text: drawn(notice) };
  });

  for (const r of rows) {
    console.log("");
    console.log(`  --- ${r.kind}   [tone: ${r.notice.tone}]`);
    console.log(`      หัวข้อ : ${r.notice.headline}`);
    for (const line of r.notice.lines) console.log(`      บรรทัด: ${line}`);
    console.log(`      ปุ่ม  : ${r.notice.action === null ? "(ไม่มีปุ่ม)" : r.notice.action.label}`);
  }

  console.log("");
  check("N1: eight results were produced", rows.length === 8, `${String(rows.length)}`);
  return rows;
}

/* ---------------------------------------------------------------- N2 ------ */

const THAI = /[\u0E00-\u0E7F]/;

function n2Concatenation(rows: readonly { kind: string; text: string }[]): void {
  header("N2: the whole rendered state per outcome, as ONE string in draw order");

  for (const r of rows) console.log(`  ${r.kind.padEnd(23)} ${r.text}`);
  console.log("");

  const empty = rows.filter((r) => r.text.trim().length === 0).map((r) => r.kind);
  check(
    "N2: every outcome renders something",
    empty.length === 0,
    empty.length === 0 ? `${String(rows.length)} non-empty` : `empty: ${empty.join(", ")}`,
  );

  // A CONTROL ON THE INSTRUMENT ITSELF: a renderer returning ASCII placeholders,
  // or nothing, would satisfy every NEGATIVE cell below. This is the cheapest
  // assertion that the output is operator-facing Thai at all.
  const notThai = rows.filter((r) => !THAI.test(r.text)).map((r) => r.kind);
  check(
    "N2: and renders THAI — without this every absence cell below is satisfied by an empty screen",
    notThai.length === 0,
    notThai.length === 0 ? "all eight carry Thai text" : `not Thai: ${notThai.join(", ")}`,
  );
}

/* ---------------------------------------------------------------- N3 ------ */

/**
 * P3: NEGATIVE ASSERTIONS, AS PATTERNS OVER THE CLASS.
 *
 * Not a list of remembered strings. A banned-substring list is context-dependent
 * and this repository has the measurement: `รวม 500 ใบ` on the money screen is a
 * legitimate count read as a leaked 5xx (the rider to the 2d amendment). A regex
 * over the SHAPE catches `418` and every other status nobody thought to
 * enumerate, and `[a-z]+_[a-z]+` catches every server code and every wire field
 * name at once rather than the four somebody recalled.
 */
const LEAK_PATTERNS: readonly (readonly [string, RegExp])[] = [
  ["JSON or bracket punctuation", /[{}[\]"\\]/],
  ["a UUID", /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
  ["a bare HTTP status", /\b[1-5]\d\d\b/],
  ["a snake_case identifier or wire field name", /[A-Za-z]+_[A-Za-z]+/],
];

/** Stricter still, and applicable to the seven members that embed NO server data. */
const ANY_ASCII_LETTER = /[A-Za-z]/;

function n3NoLeaks(rows: readonly { kind: string; text: string }[]): void {
  header("N3: nothing built for a bug report reaches the screen");

  const leaksOf = (text: string): string[] =>
    LEAK_PATTERNS.filter(([, re]) => re.test(text)).map(([name]) => name);

  const bad = rows.filter((r) => leaksOf(r.text).length > 0);
  check(
    "N3: no member leaks JSON, a uuid, an HTTP status or an identifier",
    bad.length === 0,
    bad.length === 0
      ? `${String(rows.length)} rendered states, four patterns each`
      : bad.map((r) => `${r.kind}: ${leaksOf(r.text).join("/")}`).join(" | "),
  );

  /*
   * THE SEVEN THAT CARRY NO SERVER DATA get the strongest form of the rule: not
   * one ASCII letter anywhere. `created` is excluded because it deliberately
   * prints the seller's NAME and the CODE THE SERVER ASSIGNED, and a shop's own
   * code is often ASCII — so its absence assertions are the four patterns above
   * plus N5's, which name the values directly.
   */
  const noData = rows.filter((r) => r.kind !== "created");
  const withAscii = noData.filter((r) => ANY_ASCII_LETTER.test(r.text)).map((r) => r.kind);
  check(
    "N3: and the seven that embed no server value contain NO ASCII letter at all",
    withAscii.length === 0,
    withAscii.length === 0
      ? `${String(noData.length)} members, Thai only`
      : `ASCII in: ${withAscii.join(", ")}`,
  );

  // CONTROL: the patterns fire on something. Without this, four zeroes are
  // indistinguishable from four regexes that cannot match.
  const decoy = 'ผิดพลาด: HTTP 424: {"kind":"master_data_missing","code":"seller_grade_unset",' +
    '"seller_id":"aaaa0000-0000-4000-8000-0000000000aa"}';
  check(
    "N3: CONTROL — the four patterns all fire on the byte-exact 2c-6 defect string",
    leaksOf(decoy).length === LEAK_PATTERNS.length,
    `${String(leaksOf(decoy).length)}/${String(LEAK_PATTERNS.length)} fired: ${leaksOf(decoy).join(", ")}`,
  );
  check(
    "N3: CONTROL — and the ASCII rule fires on it too",
    ANY_ASCII_LETTER.test(decoy),
  );
}

/* ---------------------------------------------------------------- N4 ------ */

/**
 * P4: EVERY MESSAGE DISTINCT. Eight situations with different fixes; two that
 * render alike are two the operator cannot tell apart. `duplicate_code` against
 * `code_assignment_failed` is the pair most likely to collapse, and it is the
 * one the server refuses to conflate in its own words.
 */
function n4Distinct(rows: readonly { kind: string; text: string }[]): void {
  header("N4: eight situations, eight different sentences");

  const texts = rows.map((r) => r.text);
  const distinct = new Set(texts);
  const collisions: string[] = [];
  for (const a of rows) {
    for (const b of rows) {
      if (a.kind < b.kind && a.text === b.text) collisions.push(`${a.kind}=${b.kind}`);
    }
  }
  check(
    "N4: no two outcomes render the same whole state",
    distinct.size === rows.length,
    distinct.size === rows.length
      ? `${String(distinct.size)} distinct of ${String(rows.length)}`
      : `collisions: ${collisions.join(", ")}`,
  );

  // Named separately because it is the pair with OPPOSITE instructions.
  const dup = rows.find((r) => r.kind === "duplicate_code")?.text ?? "";
  const assign = rows.find((r) => r.kind === "code_assignment_failed")?.text ?? "";
  check(
    "N4: the two 409 members specifically do not collapse onto one instruction",
    dup.length > 0 && assign.length > 0 && dup !== assign,
    dup === assign ? "IDENTICAL" : "different",
  );
}

/* ---------------------------------------------------------------- N5 ------ */

/**
 * THE ONE MEMBER THAT CARRIES A SELLER, and therefore the one where an absence
 * assertion can fire rather than being satisfied by a union with no fields.
 *
 * BOTH HALVES, IN THE SAME CELL. "The id_number is absent" is true of an empty
 * string, of a crashed renderer and of a member that carries nothing — so it is
 * asserted beside "the code and the name ARE present", which is the thing the
 * operator actually needs off this screen. Either half alone is worthless.
 */
function n5Created(): void {
  header("N5: the created member — what must be on screen, and what must not");

  const notice = render({ kind: "created", seller: CREATED_NO_GRADE });
  const text = drawn(notice);
  console.log(`  no grade  : ${text}`);

  check(
    "N5: CONTROL — the assigned code and the seller's name ARE on the screen",
    text.includes(CREATED_CODE) && text.includes(CREATED_NAME),
    `code=${String(text.includes(CREATED_CODE))} name=${String(text.includes(CREATED_NAME))}`,
  );
  check(
    "N5: and the id, the id_number, the address and the vehicle_no are NOT",
    !text.includes(CREATED_ID) &&
      !text.includes(CREATED_ID_NUMBER) &&
      !text.includes(CREATED_ADDRESS) &&
      !text.includes(CREATED_VEHICLE),
    `id=${String(text.includes(CREATED_ID))} id_number=${String(text.includes(CREATED_ID_NUMBER))}` +
      ` address=${String(text.includes(CREATED_ADDRESS))}` +
      ` vehicle_no=${String(text.includes(CREATED_VEHICLE))}`,
  );

  /*
   * THE GRADE SENTENCE IS DERIVED FROM THE VALUE, not from the fact that this
   * form never sends a grade. Both branches are driven, because a sentence that
   * is hardcoded and a sentence that is derived look identical from one input.
   */
  const graded = render({ kind: "created", seller: CREATED_WITH_GRADE });
  const gradedText = drawn(graded);
  console.log(`  with grade: ${gradedText}`);

  const GRADE_WARNING = "ยังไม่ได้จัดเกรด";
  check(
    "N5: a grade-less seller is told the bill will wait for the office",
    text.includes(GRADE_WARNING),
  );
  check(
    "N5: CONTROL — a seller WITH a grade is not, so the line is derived and not fixed",
    !gradedText.includes(GRADE_WARNING),
  );
  check(
    "N5: and the shop's own supplied code is shown as given",
    gradedText.includes("P18C-A1"),
  );
}

/* ---------------------------------------------------------------- N6 ------ */

/**
 * WHAT EACH SENTENCE MUST AND MUST NOT SAY, taken from the CAUSE.
 *
 * Every absence here has a sibling presence in the SAME sweep, because an
 * absence assertion over a renderer that returns nothing is satisfied by
 * everything (the ninth mechanism of
 * lessons/a-check-that-never-went-red-was-never-observed.md).
 */
function n6Meaning(rows: readonly { kind: string; notice: SellerCreateNotice; text: string }[]): void {
  header("N6: each sentence derived from its cause — the presences and the absences");

  const textOf = (kind: string): string => rows.find((r) => r.kind === kind)?.text ?? "";
  const noticeOf = (kind: string): SellerCreateNotice | undefined =>
    rows.find((r) => r.kind === kind)?.notice;

  /* ---- the not-created claim: six say it, two must not ---- */
  const NOT_CREATED = "ยังไม่ได้เพิ่มผู้ขายรายนี้";
  const mustSay = [
    "duplicate_code",
    "code_assignment_failed",
    "session_expired",
    "forbidden",
    "invalid",
    "unavailable",
  ];
  const saying = mustSay.filter((k) => textOf(k).includes(NOT_CREATED));
  check(
    "N6: CONTROL — the six outcomes that DID NOT create a seller all say so",
    saying.length === mustSay.length,
    `${String(saying.length)}/${String(mustSay.length)}: ${saying.join(", ")}`,
  );
  check(
    "N6: `created` does not claim the seller was not created",
    !textOf("created").includes(NOT_CREATED),
  );
  check(
    "N6: and `ambiguous` claims NEITHER — the server may or may not have created it",
    !textOf("ambiguous").includes(NOT_CREATED) &&
      !textOf("ambiguous").includes("เพิ่มผู้ขายแล้ว"),
    `notCreated=${String(textOf("ambiguous").includes(NOT_CREATED))}` +
      ` created=${String(textOf("ambiguous").includes("เพิ่มผู้ขายแล้ว"))}`,
  );
  check(
    "N6: `ambiguous` sends the operator to LOOK before adding again",
    textOf("ambiguous").includes("ค้นหา"),
  );

  /* ---- the sign-in exit belongs to exactly one member ---- */
  const withSignIn = rows.filter((r) => r.notice.action?.kind === "sign_in").map((r) => r.kind);
  check(
    "N6: exactly ONE member offers a sign-in, and it is `session_expired`",
    withSignIn.length === 1 && withSignIn[0] === "session_expired",
    withSignIn.join(", ") || "none",
  );

  /* ---- 403: someone, not nobody. No sign-in, no support, name the owner ---- */
  const forbidden = textOf("forbidden");
  check(
    "N6: CONTROL — `session_expired` names the sign-in, so the absence below is a real difference",
    textOf("session_expired").includes("เข้าสู่ระบบ"),
  );
  check(
    "N6: `forbidden` never invites a sign-in — the same account returns with the same role",
    !forbidden.includes("เข้าสู่ระบบ"),
  );
  check(
    "N6: `forbidden` names the shop OWNER, who can change a role",
    forbidden.includes("เจ้าของร้าน"),
  );
  check(
    "N6: and offers no button — no tap on this device grants a role",
    noticeOf("forbidden")?.action === null,
    String(noticeOf("forbidden")?.action?.kind ?? "null"),
  );

  /* ---- the two 409s: opposite instructions, and neither may borrow the other ---- */
  const TAKEN = "รหัสนี้ถูกใช้ไปแล้ว";
  check(
    "N6: CONTROL — `duplicate_code` says the code is taken",
    textOf("duplicate_code").includes(TAKEN),
  );
  check(
    "N6: `code_assignment_failed` does NOT — the caller supplied no code to be taken",
    !textOf("code_assignment_failed").includes(TAKEN),
  );
  check(
    "N6: and it asks for one to be typed instead",
    textOf("code_assignment_failed").includes("กรอกรหัส"),
  );

  /* ---- unavailable: no queue, so no promise about the future ---- */
  check(
    "N6: `unavailable` states that nothing is held to be sent later",
    textOf("unavailable").includes("ไม่ได้เก็บ") && textOf("unavailable").includes("ทีหลัง"),
  );

  /* ---- created: the button that carries on with the bill ---- */
  check(
    "N6: `created` offers the pick, so the truck on the weighbridge can be weighed",
    noticeOf("created")?.action?.kind === "pick_seller",
    String(noticeOf("created")?.action?.kind ?? "null"),
  );
}

/* ---------------------------------------------------------------- N7 ------ */

/** A stub transport, and the request body it was handed. */
interface Sent {
  body: string;
}

function stubFetch(sent: Sent, status: number, raw: string | null): typeof globalThis.fetch {
  return (_input, init) => {
    sent.body = typeof init?.body === "string" ? init.body : "";
    return Promise.resolve(
      new Response(raw, { status, headers: { "content-type": "application/json" } }),
    );
  };
}

function apiWith(fetchImpl: typeof globalThis.fetch): SellerApi {
  return new SellerApi({
    baseUrl: "http://proof.invalid",
    getToken: () => Promise.resolve("proof-token"),
    fetchImpl,
  });
}

const DRAFT: SellerDraft = { name: "ผู้ขายพิสูจน์" };

/**
 * THE 403's SERVER CODE BECOMES A SENTENCE, AND NEVER APPEARS ON THE SCREEN.
 *
 * Driven through the REAL `SellerApi` so the code really is extracted from a
 * real 403 body by the real `forbiddenCode`, not handed in. The control matters
 * more than the claim here: if the outcome did not actually carry the code, "the
 * code is not on the screen" would be true of a screen that was never given one.
 */
async function n7ForbiddenCodes(): Promise<void> {
  header("N7: a 403's code is mapped to a sentence, and the code itself never renders");

  const cases: readonly { label: string; body: string | null; expect: string }[] = [
    {
      label: "the code the server actually emits",
      body: JSON.stringify({ detail: { kind: "forbidden", code: "admin_required" } }),
      expect: "admin_required",
    },
    {
      label: "a code this build has never heard of",
      body: JSON.stringify({ detail: { kind: "forbidden", code: "seller_write_denied" } }),
      expect: "seller_write_denied",
    },
    {
      label: "a body that will not parse at all",
      body: "<html>gateway</html>",
      expect: "forbidden",
    },
  ];

  for (const c of cases) {
    const sent: Sent = { body: "" };
    const outcome = await apiWith(stubFetch(sent, 403, c.body)).createSeller(DRAFT);
    const text = outcome.kind === "forbidden" ? drawn(render(outcome)) : "";
    console.log(`  ${c.label}`);
    console.log(`      code carried: ${outcome.kind === "forbidden" ? outcome.code : "(not forbidden)"}`);
    console.log(`      on screen   : ${text}`);

    check(
      `N7: CONTROL — the caller classified it \`forbidden\` and carried \`${c.expect}\``,
      outcome.kind === "forbidden" && outcome.code === c.expect,
      outcome.kind === "forbidden" ? outcome.code : outcome.kind,
    );
    check(
      "N7: and the screen does not print that identifier",
      text.length > 0 && !text.includes(c.expect),
      text.length === 0 ? "nothing rendered — the cell above is the finding" : "absent",
    );
  }
}

/* ---------------------------------------------------------------- N8 ------ */

/**
 * THE SEAM: what was typed -> what goes on the wire -> which 409 -> which
 * sentence.
 *
 * ONE FIXTURE DIFFERENCE, and it is the code box. Both halves are here because
 * either alone is worthless: without the typed-code half, a renderer hardcoded
 * to "type a code yourself" passes; without the blank half there is nothing to
 * distinguish it from. That is proveSignOut S9's discipline, and the failure it
 * guards against is the one the server refuses to make in its own comment.
 */
async function n8FormSeam(): Promise<void> {
  header("N8: the code box decides which of two opposite sentences a 409 produces");

  const base: SellerFormFields = { ...BLANK_SELLER_FORM, name: "  ผู้ขายพิสูจน์  " };
  const cases: readonly { label: string; form: SellerFormFields; supplied: boolean }[] = [
    { label: "code left blank", form: base, supplied: false },
    { label: "code typed", form: { ...base, code: " P18C-DUP " }, supplied: true },
    { label: "code is three spaces", form: { ...base, code: "   " }, supplied: false },
  ];

  const rendered: Record<string, string> = {};

  for (const c of cases) {
    const draft = sellerDraftFrom(c.form);
    const sent: Sent = { body: "" };
    const outcome = await apiWith(
      stubFetch(sent, 409, JSON.stringify({ detail: { kind: "conflict", code: "whatever" } })),
    ).createSeller(draft);
    const text = drawn(render(outcome));
    rendered[c.label] = text;

    console.log("");
    console.log(`  ${c.label}`);
    console.log(`      draft.code : ${draft.code === undefined ? "(undefined)" : draft.code}`);
    console.log(`      wire body  : ${sent.body}`);
    console.log(`      outcome    : ${outcome.kind}`);
    console.log(`      on screen  : ${text}`);

    check(
      `N8: [${c.label}] the draft's code is ${c.supplied ? "supplied" : "ABSENT"}`,
      (draft.code !== undefined) === c.supplied,
      `code=${String(draft.code)}`,
    );
    check(
      `N8: [${c.label}] the 409 classifies as ${c.supplied ? "duplicate_code" : "code_assignment_failed"}`,
      outcome.kind === (c.supplied ? "duplicate_code" : "code_assignment_failed"),
      outcome.kind,
    );

    /*
     * WHAT ACTUALLY WENT ON THE WIRE, read off the request rather than inferred
     * from the draft. `grade` is the one that matters: this form has no grade
     * field at all, so the key cannot be present — ROADMAP D1, a yard phone must
     * not re-price. The `name` check is the control: a body with no keys would
     * satisfy both absences.
     */
    const body = JSON.parse(sent.body) as Record<string, unknown>;
    check(
      `N8: [${c.label}] CONTROL — the wire carries the trimmed name`,
      body["name"] === "ผู้ขายพิสูจน์",
      String(body["name"]),
    );
    check(
      `N8: [${c.label}] the wire carries NO grade — the form has no field to put one in`,
      !("grade" in body),
      Object.keys(body).join(","),
    );
    check(
      `N8: [${c.label}] and carries a code key only when one was typed`,
      ("code" in body) === c.supplied,
      Object.keys(body).join(","),
    );
  }

  console.log("");
  const blank = rendered["code left blank"] ?? "";
  const typed = rendered["code typed"] ?? "";
  const spaces = rendered["code is three spaces"] ?? "";
  check(
    "N8: THE PAIRING — the same 409 produces two DIFFERENT sentences, decided by the box",
    blank.length > 0 && typed.length > 0 && blank !== typed,
    blank === typed ? "IDENTICAL" : "different",
  );
  check(
    "N8: a code of three spaces is treated as blank, all the way to the sentence",
    spaces.length > 0 && spaces === blank,
    spaces === blank ? "same sentence as blank" : "DIFFERENT from blank",
  );

  /* ---- the readiness gate, which is why no ninth sentence exists ---- */
  check(
    "N8: a form with no name is not submittable, so the empty-name refusal never has to be worded",
    !sellerFormReady(BLANK_SELLER_FORM) && !sellerFormReady({ ...BLANK_SELLER_FORM, name: "   " }),
  );
  check(
    "N8: CONTROL — a form with a name is submittable",
    sellerFormReady(base),
  );
}

/* ---------------------------------------------------------------- N9 ------ */

/**
 * THE SECOND PATH INTO THE DEVICE'S SELLER LIST. proveSellerCreate's C6 proves
 * the REFRESH path cannot carry id_number, address or vehicle_no into
 * `cached_sellers`. Creating a seller opens a different door — the created row
 * goes straight into the picker's list — and structural typing would let all
 * three through it silently.
 */
function n9Pickable(): void {
  header("N9: the created seller, narrowed to what the device may hold");

  const row = pickableSeller(CREATED_NO_GRADE);
  const dump = JSON.stringify(row);
  console.log(`  keys: ${Object.keys(row).sort().join(",")}`);

  check(
    "N9: five fields and no fourth axis of identity",
    Object.keys(row).sort().join(",") === "code,grade,id,name,phone",
    Object.keys(row).sort().join(","),
  );
  check(
    "N9: CONTROL — the name and the code survived, so the absences below mean something",
    row.name === CREATED_NAME && row.code === CREATED_CODE,
  );
  check(
    "N9: and the id_number, the address and the vehicle_no did not",
    !dump.includes(CREATED_ID_NUMBER) &&
      !dump.includes(CREATED_ADDRESS) &&
      !dump.includes(CREATED_VEHICLE),
    `id_number=${String(dump.includes(CREATED_ID_NUMBER))}` +
      ` address=${String(dump.includes(CREATED_ADDRESS))}` +
      ` vehicle_no=${String(dump.includes(CREATED_VEHICLE))}`,
  );
  check(
    "N9: the grade comes through as the server gave it — null, for a seller created here",
    row.grade === null,
    String(row.grade),
  );
}

/* --------------------------------------------------------------- main ----- */

async function main(): Promise<number> {
  console.log("P1.8a phase 3 — the add-seller screen, and the eight things it can say");
  console.log(`node ${process.version}`);
  console.log("no server, no database, no network: every outcome below is CONSTRUCTED");

  if (BREAK !== "") {
    console.log("");
    console.log(`  *** NEGATIVE CONTROL ACTIVE: --break=${BREAK} ***`);
    console.log("      The renderer is broken ON PURPOSE by this script. Cells that measure what");
    console.log("      each outcome SAYS must go red. A cell that stays green here is a cell that");
    console.log("      is not measuring what it claims.");
  }

  n0Members();
  const rows = n1Print();
  n2Concatenation(rows);
  n3NoLeaks(rows);
  n4Distinct(rows);
  n5Created();
  n6Meaning(rows);
  await n7ForbiddenCodes();
  await n8FormSeam();
  n9Pickable();

  if (DUMP !== "") {
    /*
     * WRITTEN AS UTF-8 BYTES BY NODE ITSELF — never through a shell redirect,
     * which on this box is Out-File and prepends a BOM (CLAUDE.md, machine
     * footguns). This file is the artefact the phase report quotes from, so a
     * terminal never stands between the string and the reader.
     */
    const text = rows
      .map((r) => `${r.kind}\n  tone: ${r.notice.tone}\n  ${drawn(r.notice)}\n`)
      .join("\n");
    writeFileSync(DUMP, Buffer.from(text, "utf8"));
    console.log("");
    console.log(`  eight rendered results written as UTF-8 to ${DUMP}`);
  }

  console.log("");
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

const exitCode = await main().catch((err: unknown) => {
  console.log("");
  console.log(`  [FAIL] the run died: ${err instanceof Error ? err.message : String(err)}`);
  return 1;
});
console.log(`SELLERNOTICE_EXIT=${String(exitCode)}`);
process.exitCode = exitCode;
