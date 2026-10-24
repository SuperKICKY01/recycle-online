/**
 * SHOP AND PEOPLE ON THE DESKTOP (B6, SRS 1.9, 4.1) — pure: the shop's information, the staff
 * accounts, the permissions each role holds as ticks, and the cash drawer's shift.
 *
 * The server owns every rule (who may do what, the owner role being fixed, roles.manage being the
 * owner's alone, the escalation guard, the drawer figure frozen at close); this module reads its
 * answers, words each permission for a Thai office, and checks only what is plainly incomplete.
 * Money is the server's decimal string from the wire to the screen (hard rule 1).
 */
import { readShopMoney, type ShopMoney } from "./moneyRules";

export interface Shop {
  readonly name: string;
  readonly address: string | null;
  readonly phone: string | null;
  readonly default_grade: string | null;
  readonly branch_id: string | null;
  /** The shop's money rules (server migration 0027), or null from a server before them. */
  readonly money: ShopMoney | null;
}

export interface Policy {
  readonly branch_id: string | null;
  readonly separate_cashier: boolean | null;
  readonly shifts_enabled: boolean | null;
}

export interface User {
  readonly user_id: string;
  readonly username: string;
  readonly full_name: string;
  readonly role: string;
  readonly is_active: boolean;
}

export interface Role {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly is_system: boolean;
  readonly is_active: boolean;
  readonly permissions: readonly string[];
}

export interface Shift {
  readonly id: string;
  readonly status: "open" | "closed";
  readonly opened_at: string;
  readonly opening_float: string;
  readonly counted_cash: string | null;
  readonly expected_cash: string | null;
  readonly variance: string | null;
  readonly variance_reason: string | null;
  /** The running (or frozen) figure's parts; present only for a money.view_shop holder or at close. */
  readonly drawer: { opening_float: string; cash_in: string; cash_out: string; cash_payments: string; expected_cash: string } | null;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" ? (v as Record<string, unknown>) : null);

export function readShop(v: unknown): Shop | null {
  const o = obj(v);
  if (o === null || typeof o["name"] !== "string") return null;
  const branch = obj(o["branch"]);
  return { name: o["name"], address: str(o["address"]), phone: str(o["phone"]), default_grade: str(o["default_grade"]),
    branch_id: branch !== null ? str(branch["id"]) : null, money: readShopMoney(o) };
}

export function readPolicy(v: unknown): Policy | null {
  const o = obj(v);
  if (o === null) return null;
  const b = (k: string): boolean | null => (typeof o[k] === "boolean" ? (o[k] as boolean) : null);
  return { branch_id: str(o["branch_id"]), separate_cashier: b("separate_cashier"), shifts_enabled: b("shifts_enabled") };
}

function readUser(v: unknown): User | null {
  const o = obj(v);
  if (o === null || typeof o["user_id"] !== "string" || typeof o["username"] !== "string" || typeof o["role"] !== "string"
    || typeof o["is_active"] !== "boolean") return null;
  return { user_id: o["user_id"], username: o["username"], full_name: String(o["full_name"] ?? ""), role: o["role"], is_active: o["is_active"] };
}
export const readOneUser = (json: unknown): User | null => readUser(json);
export function readUsers(json: unknown): User[] | null {
  const a = obj(json)?.["users"];
  if (!Array.isArray(a)) return null;
  const u = a.map(readUser);
  return u.every((x): x is User => x !== null) ? u : null;
}

function readRole(v: unknown): Role | null {
  const o = obj(v);
  if (o === null || typeof o["id"] !== "string" || typeof o["code"] !== "string" || !Array.isArray(o["permissions"])) return null;
  return { id: o["id"], code: o["code"], name: String(o["name"] ?? o["code"]), is_system: o["is_system"] === true,
    is_active: o["is_active"] !== false, permissions: (o["permissions"] as unknown[]).map(String) };
}
export const readOneRole = (json: unknown): Role | null => readRole(json);
export function readRoles(json: unknown): { roles: Role[]; catalogue: string[] } | null {
  const o = obj(json);
  const a = o?.["roles"];
  const c = o?.["catalogue"];
  if (!Array.isArray(a) || !Array.isArray(c)) return null;
  const roles = a.map(readRole);
  if (!roles.every((x): x is Role => x !== null)) return null;
  return { roles, catalogue: c.map((x) => String(obj(x)?.["code"] ?? "")).filter((x) => x !== "") };
}

export function readShift(v: unknown): Shift | null {
  const o = obj(v);
  if (o === null || typeof o["id"] !== "string" || (o["status"] !== "open" && o["status"] !== "closed")
    || typeof o["opening_float"] !== "string" || typeof o["opened_at"] !== "string") return null;
  const d = obj(o["drawer"]);
  const money = (k: string) => (d !== null && typeof d[k] === "string" ? (d[k] as string) : null);
  const drawer = d === null ? null : {
    opening_float: money("opening_float") ?? "", cash_in: money("cash_in") ?? "", cash_out: money("cash_out") ?? "",
    cash_payments: money("cash_payments") ?? "", expected_cash: money("expected_cash") ?? "",
  };
  if (drawer !== null && Object.values(drawer).some((x) => x === "")) return null; // money only as strings
  return {
    id: o["id"], status: o["status"], opened_at: o["opened_at"], opening_float: o["opening_float"],
    counted_cash: str(o["counted_cash"]), expected_cash: str(o["expected_cash"]), variance: str(o["variance"]),
    variance_reason: str(o["variance_reason"]), drawer,
  };
}

// --- permissions as a Thai office reads them ------------------------------------------------------

/** Every catalogue code, worded. A code the server lists without a label here is SHOWN by its code. */
export const PERMISSION_TEXT: Readonly<Record<string, string>> = {
  "bills.create": "สร้างบิลรับซื้อ",
  "bills.read": "ดูบิลรับซื้อ",
  "bills.void": "ยกเลิกบิล",
  "money.view_own": "ดูยอดเงินในบิลที่ตนเองทำ",
  "money.view_shop": "ดูยอดเงินทั้งร้าน",
  "payments.record": "จ่ายเงินและดูรายการจ่าย",
  "shifts.manage": "เปิด-ปิดกะและลิ้นชักเงิน",
  "master.write": "แก้ไขสินค้า หมวดหมู่ และหน่วยนับ",
  "prices.write": "ตั้งราคารับซื้อ",
  "tiers.manage": "จัดการเกรด",
  "sellers.create": "เพิ่มผู้ขาย",
  "sellers.write": "แก้ไขและปิดใช้งานผู้ขาย",
  "sellers.read_personal": "ดูเลขบัตรและที่อยู่ผู้ขาย",
  "users.manage": "จัดการบัญชีพนักงาน (เจ้าของร้านและผู้ดูแลเท่านั้น)",
  "shop.settings.write": "แก้ไขข้อมูลและการตั้งค่าร้าน",
  "roles.manage": "กำหนดสิทธิ์ตามตำแหน่ง (เจ้าของร้านเท่านั้น)",
};

export const PERMISSION_GROUPS: readonly { title: string; codes: readonly string[] }[] = [
  { title: "บิล", codes: ["bills.create", "bills.read", "bills.void"] },
  { title: "เงิน", codes: ["money.view_own", "money.view_shop", "payments.record", "shifts.manage"] },
  { title: "ข้อมูลหลัก", codes: ["master.write", "prices.write", "tiers.manage"] },
  { title: "ผู้ขาย", codes: ["sellers.create", "sellers.write", "sellers.read_personal"] },
  { title: "ร้านและบัญชี", codes: ["users.manage", "shop.settings.write", "roles.manage"] },
];

/** The server's catalogue arranged by the groups above; codes no group names land in "อื่น ๆ". */
export function groupCatalogue(catalogue: readonly string[]): { title: string; codes: string[] }[] {
  const placed = new Set(PERMISSION_GROUPS.flatMap((g) => g.codes));
  const groups = PERMISSION_GROUPS.map((g) => ({ title: g.title, codes: g.codes.filter((c) => catalogue.includes(c)) }));
  const rest = catalogue.filter((c) => !placed.has(c));
  return [...groups, ...(rest.length > 0 ? [{ title: "อื่น ๆ", codes: [...rest] }] : [])].filter((g) => g.codes.length > 0);
}

export const ROLE_TEXT: Readonly<Record<string, string>> = { owner: "เจ้าของร้าน", admin: "ผู้ดูแล", staff: "พนักงาน" };
export const roleLabel = (r: { code: string; name: string }): string =>
  ROLE_TEXT[r.code] ?? (r.name.trim() !== "" ? r.name : r.code);

/**
 * Whether a tick may be changed on screen: never on the owner's role, never roles.manage, never
 * users.manage (the server refuses both directions, 422 users_manage_fixed -- who may take an account
 * over is not a tick; red team 2026-10-13).
 */
export const LOCKED_CODES: readonly string[] = ["roles.manage", "users.manage"];
export function tickEditable(role: Pick<Role, "code">, code: string, canManageRoles: boolean): boolean {
  return canManageRoles && role.code !== "owner" && !LOCKED_CODES.includes(code);
}

/**
 * NO ACCOUNT ACTION ON ANOTHER PERSON'S OWNER ROW (3a, widened 2026-10-19). The server refuses anyone
 * but that owner on every write to an owner's account -- deactivate, activate, unlock, sign out
 * everywhere, set password (403 owner_account_owner_only / owner_password_owner_only), a second owner
 * included -- so the panel offers none of them there and shows OWNER_ACCOUNT_NOTE instead. The
 * owner's own row is the self row and keeps its own rule.
 */
export function ownerAccountLocked(user: { user_id: string; role: string }, meId: string | null): boolean {
  return user.role === "owner" && user.user_id !== meId;
}
export const OWNER_ACCOUNT_NOTE =
  "บัญชีของเจ้าของร้านจัดการได้โดยเจ้าของร้านเองเท่านั้น — ปิดใช้งาน ปลดล็อก ออกจากระบบทุกเครื่อง และตั้งรหัสผ่านใหม่ ทำจากที่นี่ไม่ได้";

// --- the checks before a request ------------------------------------------------------------------

export const PEOPLE_TEXT = {
  username: "ชื่อผู้ใช้ใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และ . _ - (1-64 ตัว)",
  fullName: "ต้องกรอกชื่อ-นามสกุล",
  password: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร",
  role: "ต้องเลือกตำแหน่ง",
  money: "จำนวนเงินต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง เช่น 1500.00",
  reason: "ต้องระบุเหตุผลของส่วนต่าง",
} as const;

export function newUserProblems(f: { username: string; full_name: string; password: string; role: string }): Record<string, string | null> {
  return {
    username: /^[A-Za-z0-9._-]{1,64}$/.test(f.username.trim()) ? null : PEOPLE_TEXT.username,
    full_name: f.full_name.trim() === "" ? PEOPLE_TEXT.fullName : null,
    password: [...f.password].length >= 8 && [...f.password].length <= 128 ? null : PEOPLE_TEXT.password,
    role: f.role === "" ? PEOPLE_TEXT.role : null,
  };
}

/** A drawer amount as typed: text, at most two decimals, never negative, never a float on the way. */
export function moneyProblem(raw: string): string | null {
  return /^\d{1,12}(\.\d{1,2})?$/.test(raw.trim()) ? null : PEOPLE_TEXT.money;
}

/** The PATCH /shop body: only what changed; an emptied field is an explicit null (the server clears it). */
export function shopPatch(before: Shop, form: { address: string; phone: string; default_grade: string }): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const opt = (v: string): string | null => (v.trim() === "" ? null : v.trim());
  if (opt(form.address) !== before.address) out["address"] = opt(form.address);
  if (opt(form.phone) !== before.phone) out["phone"] = opt(form.phone);
  if (opt(form.default_grade) !== before.default_grade) out["default_grade"] = opt(form.default_grade);
  return out;
}

/** A variance is "nothing to explain" only when it is exactly zero, read from the server's string. */
export const isZeroMoney = (s: string | null): boolean => s !== null && /^-?0+(\.0+)?$/.test(s);
