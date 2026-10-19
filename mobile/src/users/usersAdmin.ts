/**
 * USER MANAGEMENT — the shop's roster and what an admin may do with it, as PURE
 * functions (P3.7, shipped on the phone). No React Native, no Expo, no node, no
 * fetch — so the headless proof (`npm run prove:users`) exercises exactly the
 * sentences, the gates and the refusals the phone runs. `app/UsersScreen.tsx` and
 * `app/UserActionsSheet.tsx` render whatever this returns and decide nothing.
 *
 * THE SERVER IS THE AUTHORITY. Every gate here (`mayDeactivate`, the read-only
 * `editable`) is a courtesy that stops the app offering a button the server would
 * refuse; `require_admin` on every route, and the last-active-admin lock in
 * `server/app/users.py::deactivate_user`, are what actually enforce it. In
 * particular `mayDeactivate` NOT offering the last active admin is a SECOND layer,
 * the same relationship the grade-tier `mayDeactivate` has with
 * `grade_tier_last_active`: the server refuses it too (409 `last_active_admin`),
 * and `userWriteOutcome` words that refusal for the case a rooted client provokes
 * it. This computation must never become the only thing standing between a shop
 * and a lockout.
 */
import { roleLabelOf } from "../settings/roleLabel.js";
import { may } from "../session/deviceRole.js";
import type { Grants } from "../session/deviceRole.js";

/* ==========================================================================
 * 1. THE TRANSPORT SHAPE AND THE REQUEST BODIES
 * ========================================================================== */

/**
 * A user-endpoint transport outcome. Like the grade-tier transport it KEEPS the
 * body on an http refusal, because a 409 carries a `code` the screen must tell
 * apart (`last_active_admin` vs a duplicate username) — a structured field, read
 * like a code, never the server's prose. `no_token` is the caller's case (App
 * checks the token first).
 */
export type UserFetch =
  | { kind: "ok"; body: unknown }
  | { kind: "http"; status: number; body: unknown }
  | { kind: "unreachable" }
  | { kind: "no_token" };

/**
 * The two role CODES the add-user form OFFERS. Since server migration 0019 a role
 * is a code among the shop's own roles (owner, admin, staff at birth, plus any it
 * mints), and the server refuses a code above the caller's own grants
 * (`role_exceeds_caller`). This form still offers the two an admin can always
 * assign; listing the shop's roles needs a route this unit does not build
 * (filed with the role-management screen in OPEN_ITEMS).
 */
export type UserRole = "admin" | "staff";

/** POST /users body. The server assigns the id and token_version; the tenant is
 *  the caller's own (extra="forbid" refuses a tenant field). */
export interface UserCreateBody {
  username: string;
  full_name: string;
  role: UserRole;
  password: string;
}

/** The system role codes the roster's last-manager courtesy counts. A shop's own
 *  role holding users.manage is not counted here — the server's guard is the
 *  authority and words the refusal; this only decides whether to OFFER the button. */
const MANAGER_CODES: readonly string[] = ["owner", "admin"];

/** POST /users/{id}/password body (an admin resetting somebody else's). */
export interface UserResetBody {
  new_password: string;
}

/* ==========================================================================
 * 2. THE PASSWORD BOUND — THE SERVER'S, MIRRORED IN ONE CONSTANT
 * ========================================================================== */

/**
 * PASSWORD_MIN_LENGTH is the server's, read from `server/app/users.py`
 * (`PASSWORD_MIN_LENGTH = 8`, the value the create and reset routes constrain on).
 * It is mirrored HERE, in one place, so the add-user form refuses a short password
 * BEFORE the request and a 422 is never rendered raw
 * (a-refusal-hands-back-what-it-refused). This is the ONLY policy copied: D9 is "a
 * minimum length, and nothing else" — no character class, no dictionary, no reuse
 * history — so there is no second rule to invent here. If the server bound moves,
 * move this and nothing else. The maximum is a resource bound on argon2 (128 on
 * the server); the field caps input there so a paste cannot occupy a worker.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
/** server/app/users.py Username (1..64) and master.Name (1..200, whitespace-stripped). */
export const USERNAME_MAX_LENGTH = 64;
export const FULL_NAME_MAX_LENGTH = 200;

/* ==========================================================================
 * 3. THE SENTENCES — the client owns every one; the server owns the facts
 * ========================================================================== */

// Refusals, worded from the CAUSE (status + code), never the server's prose.
const REFUSED_OFFLINE =
  "ยังติดต่อระบบไม่ได้ จึงยังไม่ได้บันทึกการเปลี่ยนแปลง — ลองอีกครั้ง";
const REFUSED_SERVER = "ระบบยังตอบเรื่องผู้ใช้งานไม่ได้ในตอนนี้ — ลองอีกครั้ง";
const REFUSED_FORBIDDEN =
  "บัญชีนี้ไม่มีสิทธิ์จัดการผู้ใช้งาน ต้องให้เจ้าของร้านทำรายการนี้";
// 409 last_active_admin — worded to say what it PROTECTS, not what the caller did
// wrong. It is the rarest refusal in the app and the one most likely to be read as
// a bug, so it names the invariant: a shop must always keep one account that can
// manage it. The server's guard is the authority; this only words a refusal a
// rooted client could still provoke.
const REFUSED_LAST_ADMIN =
  "ร้านต้องมีบัญชีผู้ดูแลระบบที่ใช้งานได้อย่างน้อยหนึ่งบัญชีเสมอ " +
  "จึงปิดบัญชีผู้ดูแลระบบคนสุดท้ายไม่ได้ — สร้างบัญชีผู้ดูแลระบบอีกบัญชีก่อน";
// 403 cannot_deactivate_self — defensive: the screen does not OFFER deactivate on
// the signed-in row (its own row points at the account screen instead), so this is
// reachable only from a rooted client, and it is worded rather than left raw.
const REFUSED_SELF = "ปิดบัญชีของตัวเองไม่ได้";
// 403 owner_password_owner_only (3a, 2026-10-17) and owner_account_owner_only (widened
// 2026-10-19) — defensive like REFUSED_SELF: the screen offers NO action on another
// person's owner row (OWNER_ACCOUNT_NOTE says why).
const REFUSED_OWNER_PASSWORD = "รหัสผ่านของเจ้าของร้านเปลี่ยนได้โดยเจ้าของร้านเองเท่านั้น";
const REFUSED_OWNER_ACCOUNT = "บัญชีของเจ้าของร้านจัดการได้โดยเจ้าของร้านเองเท่านั้น";
const REFUSED_DUPLICATE = "ชื่อผู้ใช้นี้มีอยู่แล้ว ใช้ชื่ออื่น";
const REFUSED_NOT_FOUND = "ไม่พบผู้ใช้รายนี้แล้ว — โหลดรายชื่อใหม่";
const REFUSED_INVALID = "ระบบไม่รับค่าที่ส่งไป — ตรวจสอบข้อมูลแล้วลองอีกครั้ง";

// The add-user form's guiding sentences.
export const FIRST_PASSWORD_NOTE =
  "ตั้งรหัสผ่านแรกให้พนักงาน แล้วแจ้งรหัสนี้กับเขา — เขาเปลี่ยนเองได้ภายหลังในเมนูบัญชีของฉัน";
// Field-level validation messages.
const NEED_USERNAME = "กรอกชื่อผู้ใช้";
const NEED_FULL_NAME = "กรอกชื่อ-นามสกุล";
const PASSWORD_TOO_SHORT = `รหัสผ่านอย่างน้อย ${String(PASSWORD_MIN_LENGTH)} ตัวอักษร`;

// The action-sheet sentences (the consequences a destructive action carries).
export const DEACTIVATE_CONSEQUENCE =
  "การปิดบัญชีจะทำให้เครื่องของผู้ใช้คนนี้ออกจากระบบทันที และเข้าสู่ระบบไม่ได้จนกว่าจะเปิดบัญชีอีกครั้ง";
export const RESET_CONSEQUENCE =
  "การตั้งรหัสใหม่จะทำให้เครื่องของผู้ใช้คนนี้ออกจากระบบ และต้องใช้รหัสใหม่เข้าสู่ระบบ";
// The last active admin: why deactivate is NOT offered (the client second layer,
// stated so the absence reads as a protection rather than a missing button).
export const LAST_ADMIN_NOTE =
  "นี่คือบัญชีผู้ดูแลระบบที่ใช้งานได้เพียงบัญชีเดียว จึงปิดไม่ได้ — ร้านต้องมีผู้ดูแลระบบอย่างน้อยหนึ่งบัญชี";
// The signed-in row: it changes its own password elsewhere (the earlier ruling).
export const SELF_ROW_NOTE = "นี่คือบัญชีของคุณ เปลี่ยนรหัสผ่านของคุณเองได้ที่เมนูบัญชีของฉัน";
// An owner's row seen by anyone else (3a, widened 2026-10-19): NO action is offered —
// no reset, no deactivate, no reactivate — and the note says what the absence protects
// and where the owner acts on it. The server refuses anyone else on every one of them
// (403 owner_password_owner_only / owner_account_owner_only), admins included.
export const OWNER_ACCOUNT_NOTE =
  "บัญชีของเจ้าของร้านจัดการได้โดยเจ้าของร้านเองเท่านั้น — เจ้าของร้านเปลี่ยนรหัสผ่านได้ที่เมนูบัญชีของฉันในเครื่องของตัวเอง";

/* ==========================================================================
 * 4. PARSING GET /users
 * ========================================================================== */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const readStr = (v: unknown): string | null => (typeof v === "string" ? v : null);

const codeOf = (body: unknown): string | null => {
  if (isObj(body) && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (isObj(detail)) return readStr(detail["code"]);
  }
  return null;
};

export interface RosterUser {
  user_id: string;
  username: string;
  full_name: string;
  /** The role CODE (server migration 0019): owner, admin, staff, or one the shop minted. */
  role: string;
  is_active: boolean;
}

/**
 * Parse GET /users → the roster, or null if the body is a shape this build cannot
 * read. Fatal-on-malformed, not skip-the-row: a PARTIAL roster would hide an admin
 * and let the client's last-active-admin guard read the wrong count, which is
 * exactly the lockout the server guard exists to prevent. The five keys are
 * `_user_payload`'s (server/app/users.py): user_id, username, full_name, role,
 * is_active; role is any non-empty code since 0019 (a shop may mint its own).
 */
export function readUsers(raw: unknown): RosterUser[] | null {
  if (!isObj(raw)) return null;
  const arr = raw["users"];
  if (!Array.isArray(arr)) return null;
  const out: RosterUser[] = [];
  for (const row of arr) {
    if (!isObj(row)) return null;
    const user_id = readStr(row["user_id"]);
    const username = readStr(row["username"]);
    const full_name = readStr(row["full_name"]);
    const roleRaw = readStr(row["role"]);
    const is_active = row["is_active"];
    if (
      user_id === null ||
      username === null ||
      full_name === null ||
      roleRaw === null ||
      roleRaw.length === 0 ||
      typeof is_active !== "boolean"
    ) {
      return null;
    }
    out.push({ user_id, username, full_name, role: roleRaw, is_active });
  }
  return out;
}

/* ==========================================================================
 * 5. THE SCREEN MODEL — the roster and what a session may do with each row
 * ========================================================================== */

export interface UserRow {
  user_id: string;
  username: string;
  full_name: string;
  role: string;
  roleLabel: string;
  is_active: boolean;
  /** The signed-in account. Its row offers NO destructive action — it points at
   *  the account screen to change its own password (the earlier ruling). */
  isSelf: boolean;
  /** Offer deactivate: an active OTHER account that is not the last active admin.
   *  The server refuses self (cannot_deactivate_self) and the last active admin
   *  (last_active_admin); this is the second layer. */
  mayDeactivate: boolean;
  /** Offer reactivate: an inactive OTHER account. */
  mayReactivate: boolean;
  /** Offer a password reset: any OTHER account that is not an owner (own password
   *  is the account screen's job; an owner's is the owner's alone, 3a). */
  mayReset: boolean;
  /** An owner's row seen by someone else: EVERY action is withheld and OWNER_ACCOUNT_NOTE
   *  is shown instead (the server's owner_*_owner_only refusals are the authority). */
  ownerAccountLocked: boolean;
}

export interface UsersScreen {
  title: string;
  /** users.manage only. A session lacking it (which cannot reach the entry) would
   *  see the list read-only — fail-open on an absent set, like every may() gate. */
  editable: boolean;
  activeHeading: string;
  inactiveHeading: string;
  activeRows: readonly UserRow[];
  inactiveRows: readonly UserRow[];
  /** How many admins are active right now — what the last-active-admin guard reads. */
  activeAdmins: number;
}

/**
 * Build the roster screen. `selfUserId` marks the signed-in row; `grants` decides
 * whether the screen is editable (users.manage; fail-open on an absent set, exact
 * on a present one). The server returns ORDER BY username; this keeps that order
 * within each group and shows active accounts first, deactivated ones in their own
 * group below — visible, never hidden, and visibly separate.
 */
export function usersAdminScreen(
  users: readonly RosterUser[],
  grants: Grants,
  selfUserId: string | null,
): UsersScreen {
  const editable = may(grants, "users.manage");
  const isManager = (u: RosterUser): boolean => MANAGER_CODES.includes(u.role);
  const activeAdmins = users.filter((u) => isManager(u) && u.is_active).length;
  const toRow = (u: RosterUser): UserRow => {
    const isSelf = u.user_id === selfUserId;
    // The last active manager (owner or admin): this account is one AND it is
    // the only one. Deactivating it would leave zero, which the server refuses
    // (last_active_admin, generalised to users.manage by 0019); not offered.
    const isLastActiveAdmin = isManager(u) && u.is_active && activeAdmins <= 1;
    const ownerAccountLocked = u.role === "owner" && !isSelf;
    return {
      user_id: u.user_id,
      username: u.username,
      full_name: u.full_name,
      role: u.role,
      roleLabel: roleLabelOf(u.role),
      is_active: u.is_active,
      isSelf,
      mayDeactivate: editable && u.is_active && !isSelf && !isLastActiveAdmin && !ownerAccountLocked,
      mayReactivate: editable && !u.is_active && !isSelf && !ownerAccountLocked,
      mayReset: editable && !isSelf && !ownerAccountLocked,
      ownerAccountLocked,
    };
  };
  const rows = users.map(toRow);
  return {
    title: "จัดการผู้ใช้งาน",
    editable,
    activeHeading: "ผู้ใช้งาน",
    inactiveHeading: "บัญชีที่ปิดใช้งาน",
    activeRows: rows.filter((r) => r.is_active),
    inactiveRows: rows.filter((r) => !r.is_active),
    activeAdmins,
  };
}

/* ==========================================================================
 * 6. THE ADD-USER FORM
 * ========================================================================== */

export type NewUserCheck =
  | { ok: true; body: UserCreateBody }
  | { ok: false; field: "username" | "full_name" | "password"; message: string };

/**
 * Validate the add-user form to the SERVER's bounds, so a well-formed request is
 * the only one sent. The password is NOT trimmed — a space is a valid character and
 * the server does not strip it (server/app/users.py Password) — and its ONLY rule
 * is PASSWORD_MIN_LENGTH (D9). Username and full_name are trimmed, matching the
 * server's whitespace-stripping constraints.
 */
export function checkNewUser(input: {
  username: string;
  full_name: string;
  role: UserRole;
  password: string;
}): NewUserCheck {
  const username = input.username.trim();
  if (username.length === 0) return { ok: false, field: "username", message: NEED_USERNAME };
  const full_name = input.full_name.trim();
  if (full_name.length === 0) return { ok: false, field: "full_name", message: NEED_FULL_NAME };
  const pw = checkPassword(input.password);
  if (!pw.ok) return { ok: false, field: "password", message: pw.message };
  return { ok: true, body: { username, full_name, role: input.role, password: input.password } };
}

/**
 * The password rule, shared by the add-user form and the reset sheet: the ONE bound
 * (PASSWORD_MIN_LENGTH) and nothing else (D9). The password is never trimmed — a
 * space is a valid character the server keeps.
 */
export function checkPassword(password: string): { ok: true } | { ok: false; message: string } {
  if (password.length < PASSWORD_MIN_LENGTH) return { ok: false, message: PASSWORD_TOO_SHORT };
  return { ok: true };
}

/* ==========================================================================
 * 7. CLASSIFYING A WRITE — create, deactivate, activate, reset
 * ========================================================================== */

export type UserWriteOutcome =
  | { kind: "ok" }
  | { kind: "session" }
  | { kind: "refused"; message: string };

/**
 * WHAT ONE create/deactivate/activate/reset PRODUCED, classified on the STATUS and
 * `code` (never the prose). A 409 is two different refusals kept apart by the code:
 * `last_active_admin` (the shop's last usable admin) and a duplicate username. A
 * 403 is likewise two: `cannot_deactivate_self` (defensive — not offered) and the
 * caller lacking the admin role. A 401 or no token ends the session. Neither the
 * duplicate nor the last-admin refusal ends it.
 */
export function userWriteOutcome(fetch: UserFetch): UserWriteOutcome {
  if (fetch.kind === "ok") return { kind: "ok" };
  if (fetch.kind === "no_token") return { kind: "session" };
  if (fetch.kind === "unreachable") return { kind: "refused", message: REFUSED_OFFLINE };
  // http
  if (fetch.status === 401) return { kind: "session" };
  const code = codeOf(fetch.body);
  if (fetch.status === 403) {
    return {
      kind: "refused",
      message:
        code === "cannot_deactivate_self"
          ? REFUSED_SELF
          : code === "owner_password_owner_only"
            ? REFUSED_OWNER_PASSWORD
            : code === "owner_account_owner_only"
              ? REFUSED_OWNER_ACCOUNT
              : REFUSED_FORBIDDEN,
    };
  }
  if (fetch.status === 409) {
    return {
      kind: "refused",
      message: code === "last_active_admin" ? REFUSED_LAST_ADMIN : REFUSED_DUPLICATE,
    };
  }
  if (fetch.status === 404) return { kind: "refused", message: REFUSED_NOT_FOUND };
  if (fetch.status === 400 || fetch.status === 422)
    return { kind: "refused", message: REFUSED_INVALID };
  return { kind: "refused", message: REFUSED_SERVER };
}

/* ==========================================================================
 * 8. THE READ — the roster, or a message when it cannot be shown
 * ========================================================================== */

/** `tone` is a local union, mapped to a Kit tone by the screen; the pure module
 *  never imports the Kit (which would pull React Native in and break the proof). */
export interface UsersMessage {
  tone: "offline" | "session" | "error";
  badge: string;
  lines: readonly string[];
  action: { kind: "retry"; label: string } | { kind: "sign_in"; label: string } | null;
}

export type UsersScreenState =
  | { kind: "roster"; screen: UsersScreen }
  | { kind: "message"; message: UsersMessage };

const OFFLINE_MESSAGE: UsersMessage = {
  tone: "offline",
  badge: "ยังติดต่อระบบไม่ได้",
  lines: ["หน้าจัดการผู้ใช้งานต้องอ่านและบันทึกผ่านระบบ จึงต้องเชื่อมต่ออินเทอร์เน็ตก่อน"],
  action: { kind: "retry", label: "ลองอีกครั้ง" },
};
const SESSION_MESSAGE: UsersMessage = {
  tone: "session",
  badge: "หมดเวลาเข้าใช้งาน",
  lines: ["ต้องเข้าสู่ระบบใหม่เพื่อจัดการผู้ใช้งาน"],
  action: { kind: "sign_in", label: "เข้าสู่ระบบ" },
};
// 403: the caller is not an admin (a role changed server-side mid-session). No
// action the device can take clears it — only the owner can. So no button.
const FORBIDDEN_MESSAGE: UsersMessage = {
  tone: "error",
  badge: "ไม่มีสิทธิ์",
  lines: [REFUSED_FORBIDDEN],
  action: null,
};
const SERVER_MESSAGE: UsersMessage = {
  tone: "error",
  badge: "ระบบขัดข้อง",
  lines: ["ระบบยังตอบเรื่องผู้ใช้งานไม่ได้ในตอนนี้"],
  action: { kind: "retry", label: "ลองอีกครั้ง" },
};

/**
 * The whole roster screen from one GET /users, or the message to show instead.
 * `no_token`/401 end the session (sign in again); `unreachable` is offline; 403 is
 * a caller who is no longer an admin; a 200 whose body cannot be read, or a 5xx, is
 * the server screen. A partial roster is never shown — readUsers is fatal on a
 * malformed body, for the reason it states.
 */
export function usersScreenState(
  fetch: UserFetch,
  grants: Grants,
  selfUserId: string | null,
): UsersScreenState {
  if (fetch.kind === "ok") {
    const users = readUsers(fetch.body);
    if (users === null) return { kind: "message", message: SERVER_MESSAGE };
    return { kind: "roster", screen: usersAdminScreen(users, grants, selfUserId) };
  }
  if (fetch.kind === "no_token") return { kind: "message", message: SESSION_MESSAGE };
  if (fetch.kind === "unreachable") return { kind: "message", message: OFFLINE_MESSAGE };
  if (fetch.status === 401) return { kind: "message", message: SESSION_MESSAGE };
  if (fetch.status === 403) return { kind: "message", message: FORBIDDEN_MESSAGE };
  return { kind: "message", message: SERVER_MESSAGE };
}
