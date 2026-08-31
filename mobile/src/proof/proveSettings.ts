/**
 * P1.23: THE SHOP-SETTINGS SCREEN DECIDES ONE THING PER OUTCOME, AND STAFF CANNOT
 * EDIT IT.
 *
 *   npm run prove:settings
 *   npm run prove:settings -- --break=<staff_save|hardcode_grades|echo_request>
 *
 * NO SERVER, NO DATABASE, NO NETWORK. `src/settings/shopSettings.ts` is pure
 * functions of a fetch outcome and a role, and every case below CONSTRUCTS its
 * input directly — so this runs twice with no reseed by construction, and every
 * assertion is about those functions and nothing else.
 *
 * THREE DISPROOFS, EACH APPLIED HERE BY A WRAPPER, never by a hook inside the
 * module under test (a check that has never gone red has not been observed —
 * lessons/a-check-that-never-went-red-was-never-observed.md):
 *
 *   --break=staff_save      draws the save control for a staff (read-only) render.
 *                           S1's negative — "no save control for staff" — goes red.
 *   --break=hardcode_grades replaces the grade options with a WRONG hardcoded list.
 *                           S2's "options equal the shop's active tiers" goes red.
 *   --break=echo_request    renders the value that was SENT instead of the server's
 *                           re-read. S4's witnessed-state cell goes red.
 *
 * ON THE OUTPUT. All Thai. MOJIBAKE IN THE CONSOLE IS THE CONSOLE — this box is
 * codepage 874 (lessons/console-is-not-the-observation.md). Every assertion
 * compares JavaScript strings, never console bytes.
 *
 * THE EXIT LINE. main() prints `SETTINGS_EXIT=<n>` from the same integer it
 * returns. That line is ABSENT if the script dies before the summary, and THE
 * ABSENCE IS THE SIGNAL.
 */
import {
  defaultGradeChangeConfirmation,
  patchChangesGrade,
  patchIsEmpty,
  readShopSettings,
  shopPatchBody,
  shopSaveResult,
  shopSettingsScreen,
} from "../settings/shopSettings.js";
import type {
  ActiveTier,
  ShopFetch,
  ShopFormScreen,
  ShopGradeOption,
  ShopPatch,
  ShopSaveResult,
  ShopSettings,
  ShopSettingsScreen,
} from "../settings/shopSettings.js";
import type { DeviceRole } from "../session/deviceRole.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const BREAK = (process.argv.find((a) => a.startsWith("--break=")) ?? "").split("=")[1] ?? "";
const BREAK_MODES: readonly string[] = ["staff_save", "hardcode_grades", "echo_request"];

if (BREAK !== "" && !BREAK_MODES.includes(BREAK)) {
  console.log(`  [FAIL] unknown --break=${BREAK} — nothing was damaged and nothing was measured`);
  console.log(`         known breaks: ${BREAK_MODES.join(", ")}`);
  console.log("SETTINGS_EXIT=2");
  process.exit(2);
}

/* ------------------------------------------------------------ the wrappers -- */

/** The screen, or the OLD design's answer under a break. The active tiers default
 *  to the three-tier fixture; the F2 case passes ONE_TIER explicitly. */
function renderSettings(
  fetch: ShopFetch,
  role: DeviceRole,
  tiers: readonly ActiveTier[] = TIERS,
): ShopSettingsScreen {
  const screen = shopSettingsScreen(fetch, role, tiers);
  if (BREAK === "staff_save" && screen.kind === "form" && screen.readOnly) {
    // The defect: draw the save control (and mark editable) for a session that is
    // meant to be read-only. A staff phone would then be offered a write the
    // server refuses with a 403.
    return { ...screen, readOnly: false, saveLabel: "บันทึก" };
  }
  return screen;
}

/** The grade options, or a wrong hardcoded list under a break. */
function optionsOf(form: ShopFormScreen): readonly ShopGradeOption[] {
  if (BREAK === "hardcode_grades") {
    // The defect: a grade list hardcoded in the view instead of built from the
    // shop's tiers — here a WRONG one (fewer, and labelled by code not name), so
    // the options stop tracking the shop's grade set and a shop that renamed or
    // re-tiered would be shown a stale list.
    return [
      { value: null, label: "ไม่กำหนด" },
      { value: "A", label: "A" },
      { value: "B", label: "B" },
    ];
  }
  return form.gradeOptions;
}

/** A save's result, or one that renders the SENT value under a break. */
function renderSave(fetch: ShopFetch, request: ShopPatch): ShopSaveResult {
  if (BREAK === "echo_request" && fetch.kind === "ok") {
    // The defect: report what was SENT rather than the server's re-read. A save
    // the server normalised or rejected-in-part would then be misreported as
    // whatever the device typed.
    const base = readShopSettings(fetch.body);
    if (base !== null) {
      return { kind: "saved", shop: { ...base, address: request.address ?? base.address } };
    }
  }
  return shopSaveResult(fetch);
}

/* ---------------------------------------------------------------- fixtures -- */

const SHOP: ShopSettings = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "ร้านรับซื้อของเก่าทดสอบ",
  default_grade: "B",
  address: "123 ถนนทดสอบ ตำบลทดสอบ",
  phone: "0812345678",
};
/**
 * THE SHOP'S ACTIVE TIERS (S16 / P1.24). Names differ from codes ON PURPOSE, so
 * the options prove they carry the NAME (F3) and not the code. SHOP.default_grade
 * ("B") is one of these codes.
 */
const TIERS: readonly ActiveTier[] = [
  { code: "A", name: "เกรดเอ" },
  { code: "B", name: "เกรดบี" },
  { code: "C", name: "เกรดซี" },
];
/** F2: a shop that does not grade — exactly one active tier. */
const ONE_TIER: readonly ActiveTier[] = [{ code: "A", name: "เกรดเดียว" }];
const ok = (body: unknown): ShopFetch => ({ kind: "ok", body });
const THAI = /[฀-๿]/;

/* -------------------------------------------------------------------- S1 -- */

function s1RoleGate(): void {
  header("S1 — staff READ the settings; only admin sees an edit control");
  const adminScreen = renderSettings(ok(SHOP), "admin");
  const staffScreen = renderSettings(ok(SHOP), "staff");

  check("S1: STAGING — admin gets a form", adminScreen.kind === "form", adminScreen.kind);
  check("S1: STAGING — staff gets a form (a read of the same values)", staffScreen.kind === "form", staffScreen.kind);
  if (adminScreen.kind !== "form" || staffScreen.kind !== "form") return;

  console.log(`  admin.saveLabel: ${String(adminScreen.saveLabel)}`);
  console.log(`  staff.saveLabel: ${String(staffScreen.saveLabel)}`);

  // THE NEGATIVE — the disproof --break=staff_save reddens exactly this.
  check(
    "S1: NEGATIVE — a staff render draws NO save control at all",
    staffScreen.readOnly === true && staffScreen.saveLabel === null,
    `readOnly=${String(staffScreen.readOnly)} saveLabel=${String(staffScreen.saveLabel)}`,
  );
  // THE PRESENCE SIBLING — so the negative is not satisfied by an empty screen.
  check(
    "S1: PRESENCE — an admin render DOES draw a save control",
    adminScreen.readOnly === false && adminScreen.saveLabel !== null,
    `readOnly=${String(adminScreen.readOnly)} saveLabel=${String(adminScreen.saveLabel)}`,
  );
  // Read-only is not blank: staff still sees the values.
  check(
    "S1: staff still SEES the shop's values (name + stored address)",
    staffScreen.name === SHOP.name && staffScreen.address === SHOP.address,
    `${staffScreen.name} / ${String(staffScreen.address)}`,
  );
}

/* -------------------------------------------------------------------- S2 -- */

function s2GradeOptions(): void {
  header("S2 — the grade options ARE the shop's active tiers (by name), plus 'no default'");
  const form = renderSettings(ok(SHOP), "admin");
  if (form.kind !== "form") {
    check("S2: STAGING — admin gets a form", false, form.kind);
    return;
  }
  const options = optionsOf(form);
  const values = options.map((o) => o.value);
  const codes = values.filter((v): v is string => v !== null);
  console.log(`  options: ${options.map((o) => `${String(o.value)}=${o.label}`).join(", ")}`);
  console.log(`  tiers  : ${TIERS.map((t) => `${t.code}=${t.name}`).join(", ")}`);

  // Positive control: the shop has active tiers, so the equality below is not vacuous.
  check("S2: CONTROL — the shop has active tiers", TIERS.length > 0, `${String(TIERS.length)} tiers`);
  // THE CELL — the disproof --break=hardcode_grades reddens exactly this.
  check(
    "S2: the option VALUES equal the active tier CODES, in order",
    codes.length === TIERS.length && codes.every((c, i) => c === TIERS[i]?.code),
    `${codes.join(",")} vs ${TIERS.map((t) => t.code).join(",")}`,
  );
  // F3 — the LABEL is the shop's own NAME, not the code. --break=hardcode_grades
  // (labels are codes) reddens this too, which is the point.
  check(
    "S2: each option LABEL is the tier's NAME (F3), not its code",
    TIERS.every((t) => options.some((o) => o.value === t.code && o.label === t.name)),
    options.map((o) => o.label).join(","),
  );
  check(
    "S2: there is exactly one explicit 'no default' (null) option, drawn first",
    values.filter((v) => v === null).length === 1 && values[0] === null,
    `${values.map((v) => String(v)).join(",")}`,
  );
  check(
    "S2: the 'no default' note explains what null means (the office grades the seller)",
    form.gradeNoneNote.includes("เกรด") && THAI.test(form.gradeNoneNote),
    form.gradeNoneNote,
  );
}

/* -------------------------------------------------------------------- S6 -- */

function s6F2SingleTier(): void {
  header("S6 — F2: one active tier HIDES the default-grade control; two or more SHOW it");
  const many = renderSettings(ok(SHOP), "admin", TIERS);
  // A one-tier shop has no default to hold, so the fixture clears it too.
  const one = renderSettings(ok({ ...SHOP, default_grade: null }), "admin", ONE_TIER);
  check("S6: STAGING — both are forms", many.kind === "form" && one.kind === "form", `${many.kind}/${one.kind}`);
  if (many.kind !== "form" || one.kind !== "form") return;

  console.log(`  showGrade with ${String(TIERS.length)} active tiers: ${String(many.showGrade)}`);
  console.log(`  showGrade with 1 active tier: ${String(one.showGrade)}`);

  // THE TRANSITION the brief asks for: a shop that deactivates its way down to one
  // active tier crosses from SHOW to HIDE. The two renders are the two sides of it.
  check(
    "S6: two or more active tiers SHOW the control (showGrade true)",
    many.showGrade === true,
    `showGrade=${String(many.showGrade)}`,
  );
  check(
    "S6: exactly one active tier HIDES the control (F2, showGrade false)",
    one.showGrade === false,
    `showGrade=${String(one.showGrade)}`,
  );
  // The hidden case still explains itself — a note takes the control's place.
  check(
    "S6: the one-tier form carries the note that replaces the hidden control",
    one.gradeSingleTierNote.length > 0 && THAI.test(one.gradeSingleTierNote),
    one.gradeSingleTierNote,
  );
}

/* -------------------------------------------------------------------- S3 -- */

function s3Refusals(): void {
  header("S3 — each outcome is worded from its cause, and 403 never invites a sign-in");
  const forbidden = renderSettings({ kind: "http", status: 403, code: "admin_required" }, "staff");
  const session = renderSettings({ kind: "http", status: 401, code: null }, "admin");
  const offline = renderSettings({ kind: "unreachable" }, "admin");

  check("S3: STAGING — 403 is a message, not a form", forbidden.kind === "message", forbidden.kind);
  check("S3: STAGING — 401 is a message", session.kind === "message", session.kind);
  check("S3: STAGING — offline is a message with NO fields", offline.kind === "message", offline.kind);
  if (forbidden.kind !== "message" || session.kind !== "message" || offline.kind !== "message") return;

  const forbiddenText = [forbidden.badge, ...forbidden.lines].join(" ");
  console.log(`  403: ${forbiddenText}`);
  // PRESENCE — the 403 names the owner AND the admin role.
  check(
    "S3: PRESENCE — the 403 names the shop owner and the admin role",
    forbiddenText.includes("เจ้าของร้าน") && forbiddenText.includes("ผู้ดูแลระบบ"),
    forbiddenText,
  );
  // NEGATIVE — it never invites a sign-in and offers no action.
  check(
    "S3: NEGATIVE — the 403 never says 'sign in' and offers no action button",
    !forbiddenText.includes("เข้าสู่ระบบ") && forbidden.action === null,
    `action=${String(forbidden.action)}`,
  );
  // 401 is the ONE that offers a sign-in — the mirror of the 403 rule.
  check(
    "S3: the 401 DOES offer a sign-in (the mirror of the 403 rule)",
    session.action !== null && session.action.kind === "sign_in",
    `action=${String(session.action?.kind)}`,
  );
  // Offline: a calm sentence, no field, retry offered.
  check(
    "S3: offline says settings need a connection and offers a retry",
    offline.lines.join(" ").includes("เชื่อมต่อ") &&
      offline.action !== null &&
      offline.action.kind === "retry",
    offline.lines.join(" "),
  );
  // Control: the messages render Thai, so the absence cells are not empty-string wins.
  check(
    "S3: CONTROL — the refusal messages render Thai",
    THAI.test(forbiddenText) && THAI.test(session.lines.join(" ")),
  );
}

/* -------------------------------------------------------------------- S4 -- */

function s4WitnessedState(): void {
  header("S4 — a save renders what the server RE-READ, never what was sent");
  // The response the server returns after the PATCH differs from the request: the
  // cell must follow the RESPONSE.
  const request: ShopPatch = { address: "ที่อยู่ที่เพิ่งพิมพ์" };
  const responseBody: ShopSettings = { ...SHOP, address: "ที่อยู่ที่เซิร์ฟเวอร์เก็บไว้" };

  // Positive control: the two genuinely differ, so the cell below is not vacuous.
  check(
    "S4: CONTROL — the request and the server's re-read differ",
    request.address !== responseBody.address,
    `${String(request.address)} vs ${responseBody.address}`,
  );

  const result = renderSave(ok(responseBody), request);
  check("S4: STAGING — a successful save is 'saved'", result.kind === "saved", result.kind);
  if (result.kind !== "saved") return;
  console.log(`  rendered address after save: ${String(result.shop.address)}`);

  // THE CELL — the disproof --break=echo_request reddens exactly this.
  check(
    "S4: the form shows the server's re-read, NOT the value sent",
    result.shop.address === responseBody.address && result.shop.address !== request.address,
    `${String(result.shop.address)}`,
  );
}

/* -------------------------------------------------------------------- S5 -- */

function s5PatchAndConfirm(): void {
  header("S5 — the PATCH carries only what changed, clears with null, and a grade change is confirmed");

  // Nothing changed -> empty patch, never sent.
  const noChange = shopPatchBody(SHOP, {
    default_grade: SHOP.default_grade,
    address: SHOP.address ?? "",
    phone: SHOP.phone ?? "",
  });
  check("S5: an unchanged form yields an EMPTY patch (never sent)", patchIsEmpty(noChange), JSON.stringify(noChange));

  // Clearing the address: empty string -> null, and only that field.
  const cleared = shopPatchBody(SHOP, {
    default_grade: SHOP.default_grade,
    address: "",
    phone: SHOP.phone ?? "",
  });
  check(
    "S5: emptying a field sends null (a clear), and only the changed field",
    cleared.address === null && !("phone" in cleared) && !("default_grade" in cleared),
    JSON.stringify(cleared),
  );

  // Changing the grade: flagged for confirmation.
  const gradeChange = shopPatchBody(SHOP, {
    default_grade: "C",
    address: SHOP.address ?? "",
    phone: SHOP.phone ?? "",
  });
  check(
    "S5: a default-grade change is present in the patch and flagged for confirmation",
    gradeChange.default_grade === "C" && patchChangesGrade(gradeChange),
    JSON.stringify(gradeChange),
  );
  const confirmSet = defaultGradeChangeConfirmation("C");
  const confirmClear = defaultGradeChangeConfirmation(null);
  console.log(`  confirm(set C): ${confirmSet}`);
  console.log(`  confirm(clear): ${confirmClear}`);
  check(
    "S5: the confirmation names the re-pricing consequence, and set/clear differ",
    confirmSet.includes("ราคา") && confirmSet !== confirmClear && THAI.test(confirmSet),
    `${String(confirmSet !== confirmClear)}`,
  );

  // The 422 message names the bounds and NOTHING typed.
  const overBound = shopSaveResult({ kind: "http", status: 422, code: null });
  check("S5: STAGING — a 422 is a message", overBound.kind === "message", overBound.kind);
  if (overBound.kind === "message") {
    const text = overBound.screen.lines.join(" ");
    console.log(`  422: ${text}`);
    check(
      "S5: the 422 names the length bounds (500/32) and no typed value",
      text.includes("500") && text.includes("32"),
      text,
    );
  }
}

/* ------------------------------------------------------------------ main -- */

function main(): number {
  console.log("P1.23 item 4, phase 2 — the shop-settings screen decides one thing per outcome");
  console.log(`node ${process.version}`);
  console.log("no server, no database, no network: every input below is CONSTRUCTED");
  if (BREAK !== "") {
    console.log("");
    console.log(`  *** DISPROOF ACTIVE: --break=${BREAK} — a cell that stays green is not measuring what it claims ***`);
  }

  s1RoleGate();
  s2GradeOptions();
  s3Refusals();
  s4WitnessedState();
  s5PatchAndConfirm();
  s6F2SingleTier();

  console.log("");
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

// PRESET RED, per lessons/a-default-exit-code-is-a-default-verdict.md: cleared to
// 0 only if every cell passes.
process.exitCode = 1;

try {
  const code = main();
  console.log(`SETTINGS_EXIT=${String(code)}`);
  process.exitCode = code;
} catch (err: unknown) {
  console.log("");
  console.log(`  [FAIL] the run died: ${err instanceof Error ? err.message : String(err)}`);
  console.log("SETTINGS_EXIT=1");
  process.exitCode = 1;
}
