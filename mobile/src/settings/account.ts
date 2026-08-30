/**
 * THIS DEVICE'S OWN ACCOUNT — the profile it reads and the password it may change.
 *
 * Every decision for the account screen, as pure functions. No React Native, no
 * Expo, no node, no fetch — so the headless proof (`npm run prove:account`)
 * exercises exactly the validation, the refusal wording and the session hand-off
 * the phone runs. `AccountScreen.tsx` renders whatever this returns and decides
 * nothing itself. Same reason as `shopSettings.ts` and `dailyView.ts`.
 *
 * ---------------------------------------------------------------------------
 * PROFILE IS READ-ONLY, AND THE USERNAME HAS NO EDIT CONTROL AT ALL
 * ---------------------------------------------------------------------------
 * The profile shows username, role and shop name — username and role from
 * `/whoami` (the role there is the one the SERVER resolved this request, not the
 * token's stale claim), the shop name from `GET /shop`. None of it is editable
 * here: D7 splits account provisioning into admin routes and a self-password
 * route, and there is no self-username route, so a username edit control would be
 * a control with no endpoint behind it.
 *
 * ---------------------------------------------------------------------------
 * THE PASSWORD RULE IS CHECKED ON THE DEVICE FIRST, SO THE 422 IS NEVER PROVOKED
 * ---------------------------------------------------------------------------
 * `POST /users/me/password` refuses a new password shorter than the server's
 * minimum with a 422, and a 422 is the response whose body historically HANDS BACK
 * THE VALUE IT REFUSED (lessons/a-refusal-hands-back-what-it-refused.md — the
 * server now redacts `input`, but the client must still never render a refusal
 * body). So the mismatch and the length bound are checked HERE, before the
 * request, and the request is only sent when it cannot 422 for length. If a 422
 * arrives anyway (a future server bound), its body is NEVER rendered — the message
 * is a constant that names the rule and nothing the caller typed.
 *
 * THE LENGTH BOUND IS A CONSTANT WHOSE COMMENT NAMES THE SERVER MODEL, because the
 * app does not fetch `/openapi.json` for constraints. `PASSWORD_MIN_LENGTH` mirrors
 * `server/app/users.py::PASSWORD_MIN_LENGTH` (8, ARCHITECTURE D9). If the two ever
 * drift, the device rejects a password the server accepts (harmless: one retype)
 * or lets one through that the server 422s (caught by the no-echo branch below).
 *
 * ---------------------------------------------------------------------------
 * A SUCCESSFUL CHANGE ENDS THIS SESSION — AND REUSES THE EXISTING PATH
 * ---------------------------------------------------------------------------
 * The route bumps `token_version` in the same statement as the hash, so this
 * device's token is dead the instant the change lands and the response carries no
 * fresh one. That is the SAME state a 401 produces: the app sets `sessionEnded`
 * true (src/session/signOut.ts's `sessionStateOf` then reads "expired") and the
 * existing sign-in path takes over. NO new state, and the sign-out GATE is not
 * involved — queued work is KEPT (hard rule 8), not drained and not refused; it
 * will send under the account that signs in next, exactly as an expiry leaves it.
 * The one thing added is a sentence: the password changed, sign in again, and if
 * work is owed it is kept and will send after sign-in.
 */
import { roleLabelOf } from "./roleLabel.js";
import type { DeviceRole } from "../session/deviceRole.js";

/* ==========================================================================
 * 1. THE WIRE
 * ========================================================================== */

/** Fields of `/whoami` this screen reads. The rest of the response is ignored. */
export interface WhoAmI {
  username: string;
  role: DeviceRole;
}

export type PasswordFetch =
  | { kind: "ok"; body: unknown }
  | { kind: "http"; status: number; code: string | null }
  | { kind: "unreachable" }
  | { kind: "no_token" };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const readStr = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Parse `/whoami`. `username` is required; `role` is normalised to a DeviceRole,
 * with anything the build does not recognise read as null (unknown) — the same
 * fail-open reading `readTokenRole` gives, since nothing is authorised on it.
 */
export function readWhoAmI(raw: unknown): WhoAmI | null {
  if (!isObj(raw)) return null;
  const username = readStr(raw["username"]);
  if (username === null) return null;
  const roleRaw = raw["role"];
  const role: DeviceRole = roleRaw === "admin" ? "admin" : roleRaw === "staff" ? "staff" : null;
  return { username, role };
}

/* ==========================================================================
 * 2. THE PROFILE
 * ========================================================================== */

export interface AccountProfile {
  usernameLabel: string;
  username: string;
  roleLabel: string;
  role: string;
  shopLabel: string;
  /** The shop name, or a note when it could not be read this launch. */
  shopName: string;
  note: string;
}

/**
 * The profile block. `shopName` is `string | null`: null renders a note rather
 * than a blank, because a missing name is a fetch that did not complete, not a
 * shop with no name.
 */
export function accountProfile(who: WhoAmI, shopName: string | null): AccountProfile {
  return {
    usernameLabel: "ชื่อผู้ใช้",
    username: who.username,
    roleLabel: "สิทธิ์การใช้งาน",
    role: roleLabelOf(who.role),
    shopLabel: "ร้าน",
    shopName: shopName ?? "ยังอ่านชื่อร้านไม่ได้",
    note: "ชื่อผู้ใช้และสิทธิ์แก้ไขที่นี่ไม่ได้ — ต้องให้เจ้าของร้านแก้ในระบบ",
  };
}

/* ==========================================================================
 * 3. THE PASSWORD CHANGE — checked on the device first
 * ========================================================================== */

/**
 * Mirrors `server/app/users.py::PASSWORD_MIN_LENGTH` (8, ARCHITECTURE D9) and
 * `PASSWORD_MAX_LENGTH` (128, an argon2 resource bound, not a password rule). The
 * app has no /openapi.json fetch, so these are the stated home of the bound — say
 * which: a constant, named to the server model.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** What the caller typed. Nothing is stripped: a space is a character a password may hold. */
export interface PasswordForm {
  current: string;
  next: string;
  repeat: string;
}

/** The request body when the form is valid — exactly `SelfPasswordChange`'s fields. */
export interface PasswordChangeRequest {
  current_password: string;
  new_password: string;
}

export type PasswordFormCheck =
  | { ok: true; request: PasswordChangeRequest }
  | { ok: false; message: string };

/**
 * VALIDATE ON THE DEVICE, so the server's 422 is never provoked by an ordinary
 * user. Checks, in the order the operator would fix them: a current password is
 * present, the new one meets the bound, and the two new fields match. Each message
 * names the RULE and nothing typed.
 */
export function checkPasswordForm(form: PasswordForm): PasswordFormCheck {
  if (form.current.length === 0) {
    return { ok: false, message: "กรอกรหัสผ่านปัจจุบันก่อน" };
  }
  if (form.next.length < PASSWORD_MIN_LENGTH) {
    return {
      ok: false,
      message: `รหัสผ่านใหม่ต้องมีอย่างน้อย ${String(PASSWORD_MIN_LENGTH)} ตัวอักษร`,
    };
  }
  if (form.next.length > PASSWORD_MAX_LENGTH) {
    return {
      ok: false,
      message: `รหัสผ่านใหม่ต้องไม่เกิน ${String(PASSWORD_MAX_LENGTH)} ตัวอักษร`,
    };
  }
  if (form.next !== form.repeat) {
    return { ok: false, message: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน" };
  }
  return { ok: true, request: { current_password: form.current, new_password: form.next } };
}

/* ==========================================================================
 * 4. THE OUTCOME
 * ========================================================================== */

/** The server's 400 code for a wrong current password (users._bad_request). */
const CURRENT_PASSWORD_INCORRECT = "current_password_incorrect";

export type PasswordChangeOutcome =
  /**
   * The session ended on purpose. The app sets `sessionEnded` true and the login
   * path takes over; `lines` is what the operator reads first, `signInLabel` the
   * exit. Owed work is named when there is any, and kept regardless.
   */
  | { kind: "changed"; lines: readonly string[]; signInLabel: string }
  /** 400: a value in the request was wrong (the current password). A plain sentence. */
  | { kind: "rejected"; message: string }
  /** 401: the caller is no longer anyone. Sign in. */
  | { kind: "session"; message: string; signInLabel: string }
  /** No answer at all. Retry. */
  | { kind: "offline"; message: string; retryLabel: string }
  /** 422 or 5xx: worded WITHOUT the response body, ever. */
  | { kind: "server"; message: string };

/**
 * A wrong current password is a plain 400. Nothing is disclosed — the caller holds
 * a token for this exact account — so no timing disguise and no vague wording:
 * say the current password is wrong.
 */
const WRONG_CURRENT = "รหัสผ่านปัจจุบันไม่ถูกต้อง — ลองพิมพ์อีกครั้ง";

/**
 * The 422 fallback. Constant on purpose: it names the rule and NOTHING the caller
 * typed, so the refused value cannot reach the screen through it. Reachable only
 * if a future server bound differs from `PASSWORD_MIN_LENGTH` above; an ordinary
 * user is stopped by `checkPasswordForm` before the request.
 */
const REJECTED_BY_SERVER =
  `รหัสผ่านใหม่ไม่ผ่านเงื่อนไขของระบบ — ต้องมีอย่างน้อย ${String(PASSWORD_MIN_LENGTH)} ตัวอักษร`;

/**
 * WHAT A PASSWORD-CHANGE RESULT SAYS. `owedCount` is the total units of work this
 * device still owes the server (the screen passes `totalOwed(owed)`); when it is
 * positive, the success notice names that the work is kept and will send after
 * sign-in. Classified on the STATUS, never the body — the same rule as everywhere
 * else, and the 400 code is read only to word the plain rejection.
 */
export function passwordChangeResult(
  fetch: PasswordFetch,
  owedCount: number,
): PasswordChangeOutcome {
  if (fetch.kind === "ok") {
    const lines = [
      "เปลี่ยนรหัสผ่านแล้ว — เครื่องนี้ออกจากระบบโดยอัตโนมัติ ต้องเข้าสู่ระบบใหม่ด้วยรหัสผ่านใหม่",
    ];
    if (owedCount > 0) {
      lines.push("งานที่ค้างอยู่ในเครื่องยังอยู่ครบ จะส่งให้เองหลังเข้าสู่ระบบใหม่");
    }
    return { kind: "changed", lines, signInLabel: "เข้าสู่ระบบ" };
  }
  if (fetch.kind === "no_token") {
    return { kind: "session", message: "หมดเวลาเข้าใช้งาน ต้องเข้าสู่ระบบใหม่ก่อน", signInLabel: "เข้าสู่ระบบ" };
  }
  if (fetch.kind === "unreachable") {
    return {
      kind: "offline",
      message: "ยังติดต่อระบบไม่ได้ — ยังไม่ได้เปลี่ยนรหัสผ่าน ลองอีกครั้งเมื่อเชื่อมต่อได้",
      retryLabel: "ลองอีกครั้ง",
    };
  }
  // fetch.kind === "http"
  if (fetch.status === 400 && fetch.code === CURRENT_PASSWORD_INCORRECT) {
    return { kind: "rejected", message: WRONG_CURRENT };
  }
  if (fetch.status === 400) {
    // Some other 400 this build does not name — still a plain rejection, no body.
    return { kind: "rejected", message: "ระบบไม่รับคำขอเปลี่ยนรหัสผ่านนี้ — ลองอีกครั้ง" };
  }
  if (fetch.status === 401) {
    return { kind: "session", message: "หมดเวลาเข้าใช้งาน ต้องเข้าสู่ระบบใหม่ก่อน", signInLabel: "เข้าสู่ระบบ" };
  }
  if (fetch.status === 422) {
    return { kind: "server", message: REJECTED_BY_SERVER };
  }
  return { kind: "server", message: "ระบบยังเปลี่ยนรหัสผ่านให้ไม่ได้ในตอนนี้ ลองอีกครั้ง" };
}
