/**
 * P1.23: THE ACCOUNT SCREEN — the password is checked on the device first, its
 * refusal body is never rendered, and a success ends the session while keeping the
 * owed work.
 *
 *   npm run prove:account
 *   npm run prove:account -- --break=echo422
 *
 * NO SERVER, NO DATABASE, NO NETWORK. `src/settings/account.ts` is pure functions
 * of a form and a fetch outcome, and every case CONSTRUCTS its input — so this runs
 * twice with no reseed by construction.
 *
 * THE ONE DISPROOF, applied HERE by a wrapper and never by a hook inside the module
 * (lessons/a-check-that-never-went-red-was-never-observed.md):
 *
 *   --break=echo422  quotes the refused password back into the 422 message, exactly
 *                    the FastAPI-default behaviour a-refusal-hands-back-what-it-
 *                    refused.md is about. S4's no-echo cell must go red.
 *
 * THE EXIT LINE. main() prints `ACCOUNT_EXIT=<n>`. Its ABSENCE is the signal.
 */
import {
  accountProfile,
  checkPasswordForm,
  passwordChangeResult,
  readWhoAmI,
  PASSWORD_MIN_LENGTH,
} from "../settings/account.js";
import type { PasswordChangeOutcome, PasswordFetch, PasswordForm } from "../settings/account.js";
import { roleLabelOf } from "../settings/roleLabel.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const BREAK = (process.argv.find((a) => a.startsWith("--break=")) ?? "").split("=")[1] ?? "";
const BREAK_MODES: readonly string[] = ["echo422"];

if (BREAK !== "" && !BREAK_MODES.includes(BREAK)) {
  console.log(`  [FAIL] unknown --break=${BREAK} — nothing was damaged and nothing was measured`);
  console.log(`         known breaks: ${BREAK_MODES.join(", ")}`);
  console.log("ACCOUNT_EXIT=2");
  process.exit(2);
}

const THAI = /[฀-๿]/;

/** A password-change outcome, or one that echoes the refused value under a break. */
function renderOutcome(
  fetch: PasswordFetch,
  submitted: string,
  owedCount: number,
): PasswordChangeOutcome {
  const outcome = passwordChangeResult(fetch, owedCount);
  if (BREAK === "echo422" && fetch.kind === "http" && fetch.status === 422 && outcome.kind === "server") {
    // The defect: quote the refused password back to the caller — the FastAPI
    // 422 default the server now redacts, and which the client must never render.
    return { ...outcome, message: `${outcome.message} (${submitted})` };
  }
  return outcome;
}

/* -------------------------------------------------------------------- S1 -- */

function s1DeviceValidation(): void {
  header("S1 — the mismatch and the length bound are caught on the device, before any request");

  const good: PasswordForm = { current: "oldpassword", next: "brandnew1", repeat: "brandnew1" };
  const okr = checkPasswordForm(good);
  check("S1: a valid form passes and yields the request body", okr.ok, JSON.stringify(okr));
  if (okr.ok) {
    check(
      "S1: the request carries current + new, exactly SelfPasswordChange's fields",
      okr.request.current_password === "oldpassword" && okr.request.new_password === "brandnew1",
      JSON.stringify(okr.request),
    );
  }

  const short = checkPasswordForm({ current: "x", next: "abc", repeat: "abc" });
  check(
    "S1: a too-short new password is refused, naming the minimum (8)",
    !short.ok && short.message.includes(String(PASSWORD_MIN_LENGTH)),
    short.ok ? "accepted!" : short.message,
  );

  const mismatch = checkPasswordForm({ current: "x", next: "brandnew1", repeat: "brandnew2" });
  check(
    "S1: a mismatch is refused (the two new fields differ)",
    !mismatch.ok && THAI.test(mismatch.message),
    mismatch.ok ? "accepted!" : mismatch.message,
  );

  const noCurrent = checkPasswordForm({ current: "", next: "brandnew1", repeat: "brandnew1" });
  check("S1: an empty current password is refused", !noCurrent.ok, noCurrent.ok ? "accepted!" : noCurrent.message);

  // CONTROL: the exact boundary — 8 passes, 7 fails — so the bound is measured, not guessed.
  const at = checkPasswordForm({ current: "x", next: "abcdefgh", repeat: "abcdefgh" });
  const under = checkPasswordForm({ current: "x", next: "abcdefg", repeat: "abcdefg" });
  check(
    "S1: CONTROL — exactly 8 passes and 7 fails",
    at.ok && !under.ok,
    `8=${String(at.ok)} 7=${String(under.ok)}`,
  );
}

/* -------------------------------------------------------------------- S2 -- */

function s2SuccessEndsSessionAndKeepsWork(): void {
  header("S2 — a success ends the session, refuses nothing, and NAMES the kept work");

  // No owed work.
  const clean = passwordChangeResult({ kind: "ok", body: { user_id: "u", username: "somchai", token_version: 3 } }, 0);
  check("S2: STAGING — a 200 is a 'changed' outcome (the session ends)", clean.kind === "changed", clean.kind);
  if (clean.kind === "changed") {
    const text = clean.lines.join(" ");
    check(
      "S2: it says the device signs out and a new sign-in is needed, with the exit drawn",
      text.includes("ต้องเข้าสู่ระบบใหม่") && clean.signInLabel === "เข้าสู่ระบบ" && THAI.test(text),
      `${text} | ${clean.signInLabel}`,
    );
    check(
      "S2: NEGATIVE — with NO owed work, no kept-work line is drawn",
      clean.lines.length === 1,
      `${String(clean.lines.length)} lines`,
    );
  }

  // THE SEAM: a pending bill AND a successful change in one composition.
  const owed = passwordChangeResult({ kind: "ok", body: { user_id: "u", username: "somchai", token_version: 3 } }, 2);
  check("S2: STAGING — with owed work, still a 'changed' outcome (nothing is refused)", owed.kind === "changed", owed.kind);
  if (owed.kind === "changed") {
    const text = owed.lines.join(" ");
    console.log(`  changed (owed 2): ${text}`);
    // gate refuses nothing (kind changed), sheet NAMES the kept work, sign-in drawn.
    check(
      "S2: THE SEAM — owed work is named as KEPT, and the sign-in exit is still drawn",
      owed.lines.length === 2 && text.includes("ค้างอยู่") && owed.signInLabel === "เข้าสู่ระบบ",
      text,
    );
  }
}

/* -------------------------------------------------------------------- S3 -- */

function s3WrongCurrent(): void {
  header("S3 — a wrong current password is a plain 400, not a rejection of the payload");
  const wrong = passwordChangeResult(
    { kind: "http", status: 400, code: "current_password_incorrect" },
    0,
  );
  check("S3: a 400 current_password_incorrect is 'rejected'", wrong.kind === "rejected", wrong.kind);
  if (wrong.kind === "rejected") {
    console.log(`  400: ${wrong.message}`);
    check(
      "S3: the sentence names the current password plainly, in Thai",
      wrong.message.includes("รหัสผ่านปัจจุบัน") && THAI.test(wrong.message),
      wrong.message,
    );
  }
}

/* -------------------------------------------------------------------- S4 -- */

function s4NoEcho(): void {
  header("S4 — a 422 body is NEVER rendered: the refused password does not appear");
  const submitted = "S3cr3tP@ssw0rd-unmistakable";
  const outcome = renderOutcome({ kind: "http", status: 422, code: null }, submitted, 0);
  check("S4: STAGING — a 422 is a 'server' outcome", outcome.kind === "server", outcome.kind);
  if (outcome.kind !== "server") return;
  console.log(`  422: ${outcome.message}`);

  // CONTROL: the detector can catch an echo — a literal containing the password
  // returns true, so the negative below is not a broken `includes`.
  check(
    "S4: CONTROL — the detector catches an echo in a literal",
    `x ${submitted} y`.includes(submitted),
  );
  // THE CELL — the disproof --break=echo422 reddens exactly this.
  check(
    "S4: NEGATIVE — the rendered 422 message does NOT contain the submitted password",
    !outcome.message.includes(submitted),
    outcome.message,
  );
  // PRESENCE — the message still says something useful (names the min length).
  check(
    "S4: PRESENCE — it still names the rule (the minimum length)",
    outcome.message.includes(String(PASSWORD_MIN_LENGTH)) && THAI.test(outcome.message),
    outcome.message,
  );
}

/* -------------------------------------------------------------------- S5 -- */

function s5Profile(): void {
  header("S5 — the profile is read-only, names the role from one place, and reads /whoami");
  const who = readWhoAmI({ username: "somchai", role: "admin", tenant_id: "t", user_id: "u" });
  check("S5: STAGING — /whoami parses to a username and role", who !== null, JSON.stringify(who));
  if (who === null) return;
  check("S5: the username is read", who.username === "somchai", who.username);
  check("S5: the role is normalised to a DeviceRole", who.role === "admin", String(who.role));

  const profile = accountProfile(who, "ร้านทดสอบ");
  console.log(`  role label: ${profile.role} · shop: ${profile.shopName}`);
  check(
    "S5: the role label is the SERVER's own word for admin (ผู้ดูแลระบบ)",
    profile.role === "ผู้ดูแลระบบ" && profile.role === roleLabelOf("admin"),
    profile.role,
  );
  check("S5: the shop name is shown", profile.shopName === "ร้านทดสอบ", profile.shopName);
  check(
    "S5: the profile note says username/role cannot be edited here (D7)",
    profile.note.includes("แก้ไข") && THAI.test(profile.note),
    profile.note,
  );
  // The three role labels are distinct, so no two roles read alike.
  check(
    "S5: CONTROL — admin, staff and unknown labels are all distinct",
    new Set([roleLabelOf("admin"), roleLabelOf("staff"), roleLabelOf(null)]).size === 3,
    `${roleLabelOf("admin")} / ${roleLabelOf("staff")} / ${roleLabelOf(null)}`,
  );
}

/* ------------------------------------------------------------------ main -- */

function main(): number {
  console.log("P1.23 item 4, phase 2 — the account screen: device-first validation, no echoed refusal, session hand-off");
  console.log(`node ${process.version}`);
  console.log("no server, no database, no network: every input below is CONSTRUCTED");
  if (BREAK !== "") {
    console.log("");
    console.log(`  *** DISPROOF ACTIVE: --break=${BREAK} — a cell that stays green is not measuring what it claims ***`);
  }

  s1DeviceValidation();
  s2SuccessEndsSessionAndKeepsWork();
  s3WrongCurrent();
  s4NoEcho();
  s5Profile();

  console.log("");
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

// PRESET RED, per lessons/a-default-exit-code-is-a-default-verdict.md.
process.exitCode = 1;

try {
  const code = main();
  console.log(`ACCOUNT_EXIT=${String(code)}`);
  process.exitCode = code;
} catch (err: unknown) {
  console.log("");
  console.log(`  [FAIL] the run died: ${err instanceof Error ? err.message : String(err)}`);
  console.log("ACCOUNT_EXIT=1");
  process.exitCode = 1;
}
