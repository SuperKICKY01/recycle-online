/**
 * THE SHOP'S GRADE TIERS, AS THE OFFICE MANAGES THEM (S16 / P1.24).
 *
 * Every rendering, gating and validation decision for the tier CRUD, as pure
 * functions. No React Native, no Expo, no node, no fetch — so the headless proof
 * (`npm run prove:gradeTiers`) exercises exactly the sentences, exactly the
 * branches and exactly the role gate the phone runs. Same reason `shopSettings.ts`
 * and `priceEdit.ts` live under `src/`: files under `app/` are outside the proven
 * surface, and every operator-facing sentence that ever shipped wrong here was one
 * no proof could see (lessons/correct-classification-can-still-render-as-an-error.md).
 *
 * The tier ADMIN is a distinct concern from the /shop form (`shopSettings.ts`),
 * which reads the ACTIVE tiers only to build the default-grade options and decide
 * the F2 one-tier case. This module owns the LIST (all tiers, active and inactive)
 * and the writes: declare (F1: at least one, no maximum), rename the display name
 * (F3: the code is immutable, the name is the shop's own text), and DEACTIVATE
 * (F4: never delete; refused while active sellers still sit in the tier).
 *
 * ---------------------------------------------------------------------------
 * F1 AND THE SERVER GAP THIS MODULE GUARDS AROUND
 * ---------------------------------------------------------------------------
 * A shop must always hold at least one ACTIVE tier: the server seats an ungraded
 * walk-in in the sole active tier only when there is EXACTLY one (server
 * master._seat_seller_grade), so ZERO active tiers means every new seller is
 * ungraded and every bill parks — the shop cannot trade. As of P1.24 commit 1b the
 * server's deactivation path refuses only while sellers sit in the tier (F4); it
 * does NOT refuse deactivating the LAST active tier (recorded in OPEN_ITEMS as the
 * owed server guard). So this screen does not OFFER that deactivation — `mayDeactivate`
 * is false for the last active tier. The server remains the authority; this is a
 * usability guard in front of a hole, not a security boundary.
 */
import { may } from "../session/deviceRole.js";
import type { Grants } from "../session/deviceRole.js";

/* ==========================================================================
 * 1. THE WIRE — what GET/POST/PATCH /grade-tiers send, and what we read
 * ========================================================================== */

/** Bounds mirror the grade_tiers column CHECKs (server master.GradeCode/GradeName). */
export const GRADE_CODE_MAX_LENGTH = 32;
export const GRADE_NAME_MAX_LENGTH = 100;

/**
 * One tier as the ADMIN screen holds it — fuller than `MasterGradeTier` (the yard
 * cache): the admin needs `id` (the PATCH key) and `is_active` (it lists the
 * inactive tiers the yard cache never sees). `code` is immutable (the FK target);
 * `name` and `sort_order` and `is_active` are the editable fields.
 */
export interface AdminGradeTier {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
}

/**
 * A tier-endpoint transport outcome. Unlike the settings transports it KEEPS the
 * body on an http refusal, because the deactivation refusal carries a COUNT
 * (`sellers_in_tier`) the screen must show — a structured field, read like a code,
 * never the server's prose. `no_token` is the caller's case (App checks first).
 */
export type GradeTierFetch =
  | { kind: "ok"; body: unknown }
  | { kind: "http"; status: number; body: unknown }
  | { kind: "unreachable" }
  | { kind: "no_token" };

/** POST /grade-tiers body. `sort_order` is omitted — the server appends (F1/F3). */
export interface GradeTierCreateBody {
  code: string;
  name: string;
}

/** PATCH /grade-tiers/{id} body. `code` is absent on purpose: it is immutable. */
export interface GradeTierPatchBody {
  name?: string;
  is_active?: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const readStr = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * Parse GET /grade-tiers (?include_inactive) → the tiers, or null if the body is a
 * shape this build cannot read. Fatal-on-malformed, not skip-the-row: an admin
 * screen showing a PARTIAL tier list would let a shop deactivate its way to a state
 * the missing rows forbid. `id`/`code`/`name` must be strings, `sort_order` a
 * number, `is_active` a boolean — anything else fails the whole read.
 */
export function readGradeTiers(raw: unknown): AdminGradeTier[] | null {
  if (!isObj(raw)) return null;
  const arr = raw["grade_tiers"];
  if (!Array.isArray(arr)) return null;
  const out: AdminGradeTier[] = [];
  for (const row of arr) {
    if (!isObj(row)) return null;
    const id = readStr(row["id"]);
    const code = readStr(row["code"]);
    const name = readStr(row["name"]);
    const sort_order = row["sort_order"];
    const is_active = row["is_active"];
    if (
      id === null ||
      code === null ||
      name === null ||
      typeof sort_order !== "number" ||
      typeof is_active !== "boolean"
    ) {
      return null;
    }
    out.push({ id, code, name, sort_order, is_active });
  }
  return out;
}

/* ==========================================================================
 * 2. THE SCREEN — the tier list and what a session may do with it
 * ========================================================================== */

export interface TierAdminRow {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  /**
   * F1 client guard: false when deactivating this tier would leave the shop with
   * NO active tier (it is the last active one). The SERVER also refuses this (409
   * grade_tier_last_active, commit 3); two layers is correct, the server being the
   * authority. Always false for an already inactive row — it is not deactivatable,
   * it is reactivatable.
   */
  mayDeactivate: boolean;
  /** Move UP in the shop's order — false for the first active tier and every
   *  inactive one. Reorder is over the ACTIVE list only (F3). */
  canMoveUp: boolean;
  /** Move DOWN — false for the last active tier and every inactive one. */
  canMoveDown: boolean;
}

export interface TierAdminScreen {
  title: string;
  /** Admin only. A staff session sees the list, read-only — no add/rename/retire. */
  editable: boolean;
  /** All tiers, active first then inactive, each group in the shop's sort order. */
  rows: readonly TierAdminRow[];
  /** How many tiers are ACTIVE right now. F2 (== 1) and the F1 guard read this. */
  activeCount: number;
  codeMaxLength: number;
  nameMaxLength: number;
  /** The bounds sentence shown under the add form. */
  addHint: string;
  /** Shown to a staff session in place of the controls. */
  readOnlyNote: string;
}

const ADD_HINT = "รหัสเกรดคือรหัสอ้างอิงที่แก้ไม่ได้ภายหลัง ชื่อเกรดคือชื่อที่แสดงและแก้ได้";
const READ_ONLY_NOTE = "ดูได้อย่างเดียว — การจัดการเกรดทำได้เฉพาะบัญชีเจ้าของร้าน";

/**
 * THE TIER LIST, from the parsed tiers and the device's role. Active tiers first
 * (the ones in use), then inactive; each group already comes ordered by
 * sort_order, code from the server, and this preserves that order within each
 * group with a stable partition.
 */
export function tierAdminScreen(
  tiers: readonly AdminGradeTier[],
  grants: Grants,
): TierAdminScreen {
  // tiers.manage (server migration 0019) gates the three tier routes. Until
  // 0019 this borrowed mayEditShopSettings — the drift deviceRole.ts predicted,
  // now two permissions a shop may grant apart.
  const editable = may(grants, "tiers.manage");
  const active = tiers.filter((t) => t.is_active);
  const inactive = tiers.filter((t) => !t.is_active);
  const activeCount = active.length;
  // Active first, in the shop's order; move up/down is over this group only. An
  // active tier can move up unless it is first, down unless it is last.
  const activeRows: TierAdminRow[] = active.map((t, k) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    is_active: true,
    // Deactivatable only if not the last active tier (F1 guard; the server agrees).
    mayDeactivate: activeCount > 1,
    canMoveUp: k > 0,
    canMoveDown: k < activeCount - 1,
  }));
  const inactiveRows: TierAdminRow[] = inactive.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    is_active: false,
    mayDeactivate: false,
    canMoveUp: false,
    canMoveDown: false,
  }));
  const rows: TierAdminRow[] = [...activeRows, ...inactiveRows];
  return {
    title: "เกรดรับซื้อของร้าน",
    editable,
    rows,
    activeCount,
    codeMaxLength: GRADE_CODE_MAX_LENGTH,
    nameMaxLength: GRADE_NAME_MAX_LENGTH,
    addHint: ADD_HINT,
    readOnlyNote: READ_ONLY_NOTE,
  };
}

/**
 * THE SHOP'S NEW TIER ORDER after moving ONE active tier up or down (S16 / P1.24,
 * commit 3). Reorder is over the ACTIVE list only (F3); inactive tiers keep their
 * order after the active ones. Returns the FULL list of tier ids in the new order —
 * the whole set, because PUT /grade-tiers/order rewrites the ordering as ONE fact
 * and refuses a partial list. Returns null when the move is a no-op: the tier is not
 * active, or it is already at the edge of the active group (the view disables the
 * control there via canMoveUp / canMoveDown; this is the provable other half).
 */
export function moveActiveTier(
  rows: readonly { id: string; is_active: boolean }[],
  tierId: string,
  direction: "up" | "down",
): readonly string[] | null {
  const active = rows.filter((r) => r.is_active);
  const inactive = rows.filter((r) => !r.is_active);
  const i = active.findIndex((r) => r.id === tierId);
  if (i === -1) return null; // not an active tier
  const j = direction === "up" ? i - 1 : i + 1;
  if (j < 0 || j >= active.length) return null; // already at the edge
  const reordered = active.slice();
  const a = reordered[i];
  const b = reordered[j];
  if (a === undefined || b === undefined) return null;
  reordered[i] = b;
  reordered[j] = a;
  return [...reordered, ...inactive].map((r) => r.id);
}

/* ==========================================================================
 * 3. VALIDATION — refuse at the keypad what the server would refuse with a 422/409
 * ========================================================================== */

export type TierValidation =
  | { ok: true; body: GradeTierCreateBody }
  | { ok: false; message: string };

/**
 * A NEW tier, bounded by the column and checked for a duplicate code, BEFORE the
 * write. Not the only gate — the server's length CHECK and unique index are the
 * authority — but it turns a round trip into an immediate sentence. `code` and
 * `name` are trimmed: a leading space in the FK handle is almost always a slip and
 * would make an invisible second tier. A whitespace-only value reads as empty.
 */
export function validateNewTier(
  code: string,
  name: string,
  existing: readonly { code: string }[],
): TierValidation {
  const c = code.trim();
  const n = name.trim();
  if (c.length === 0) return { ok: false, message: "กรอกรหัสเกรด" };
  if (c.length > GRADE_CODE_MAX_LENGTH) {
    return { ok: false, message: `รหัสเกรดยาวเกิน ${String(GRADE_CODE_MAX_LENGTH)} ตัวอักษร` };
  }
  if (n.length === 0) return { ok: false, message: "กรอกชื่อเกรด" };
  if (n.length > GRADE_NAME_MAX_LENGTH) {
    return { ok: false, message: `ชื่อเกรดยาวเกิน ${String(GRADE_NAME_MAX_LENGTH)} ตัวอักษร` };
  }
  // Exact match: the server's uniqueness is a text index, so "A" and "a" differ.
  if (existing.some((t) => t.code === c)) {
    return { ok: false, message: `มีเกรดรหัส ${c} อยู่แล้ว` };
  }
  return { ok: true, body: { code: c, name: n } };
}

export type NameValidation =
  | { ok: true; name: string }
  | { ok: false; message: string };

/** A renamed tier's NAME, bounded like the add form. The code never changes (F3). */
export function validateRename(name: string): NameValidation {
  const n = name.trim();
  if (n.length === 0) return { ok: false, message: "กรอกชื่อเกรด" };
  if (n.length > GRADE_NAME_MAX_LENGTH) {
    return { ok: false, message: `ชื่อเกรดยาวเกิน ${String(GRADE_NAME_MAX_LENGTH)} ตัวอักษร` };
  }
  return { ok: true, name: n };
}

/* ==========================================================================
 * 4. THE OUTCOME — what one create/rename/deactivate produced
 * ========================================================================== */

export type TierActionOutcome =
  /** The write landed. The caller re-fetches the list (the server is authoritative). */
  | { kind: "ok" }
  /** 401 / no token — the session is over; the caller signs in again. */
  | { kind: "session" }
  /** A refusal or outage the operator must read: the deactivation count, a duplicate,
   *  an over-length value, an outage. Classified on the STATUS and the body's `code`
   *  (never its prose), with the count read as a structured field. */
  | { kind: "refused"; message: string };

const REFUSED_OFFLINE = "ยังติดต่อระบบไม่ได้ จึงยังไม่ได้บันทึกการเปลี่ยนแปลง — ลองอีกครั้ง";
const REFUSED_SERVER = "ระบบยังตอบเรื่องเกรดไม่ได้ในตอนนี้ — ลองอีกครั้ง";
const REFUSED_DUPLICATE = "มีเกรดรหัสนี้อยู่แล้ว ใช้รหัสอื่น";
const REFUSED_INVALID = "ระบบไม่รับค่าที่ส่งไป — ตรวจสอบรหัสและชื่อเกรดแล้วลองอีกครั้ง";
/** F1 (commit 3): the server refuses deactivating the shop's LAST active tier. The
 *  phone's canMove/mayDeactivate guards should keep an ordinary user from provoking
 *  it, so this is the belt-and-braces sentence for a stale-state race. */
const REFUSED_LAST_ACTIVE =
  "ร้านต้องมีเกรดที่เปิดใช้งานอย่างน้อยหนึ่งเกรด จึงปิดเกรดสุดท้ายไม่ได้ — เพิ่มเกรดใหม่ก่อน";

/**
 * The `detail.code` a FastAPI HTTPException nests, for CLASSIFICATION — never the
 * prose. Same read setProductPrice/dailyView make.
 */
function codeOf(body: unknown): string | null {
  if (isObj(body) && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (isObj(detail)) return readStr(detail["code"]);
  }
  return null;
}

/** The `sellers_in_tier` count the 409 grade_tier_in_use body carries — a string. */
function sellersInTier(body: unknown): string | null {
  if (isObj(body) && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (isObj(detail)) return readStr(detail["sellers_in_tier"]);
  }
  return null;
}

/**
 * THE DEACTIVATION REFUSAL, F4's count SAID OUT LOUD. Built from the structured
 * `sellers_in_tier` field, not from the server's Thai prose — the count is the
 * fact, and the phone owns the sentence around it. The fallback (count unreadable)
 * still refuses and still says to move sellers first.
 */
export function tierInUseMessage(count: string | null): string {
  if (count === null) {
    return "ยังมีผู้ขายอยู่ในเกรดนี้ ต้องย้ายผู้ขายไปเกรดอื่นก่อนจึงจะปิดเกรดนี้ได้";
  }
  return `ยังมีผู้ขาย ${count} รายอยู่ในเกรดนี้ ต้องย้ายผู้ขายไปเกรดอื่นก่อนจึงจะปิดเกรดนี้ได้`;
}

/**
 * WHAT ONE create/rename/deactivate/reactivate PRODUCED, classified on the STATUS
 * and `code`. A 409 is two different refusals kept apart by the code:
 * `grade_tier_in_use` is F4's count (deactivation blocked by sellers), and a
 * duplicate code is a fresh add colliding. Both are readable, neither ends the
 * session. A 401 does.
 */
export function tierActionOutcome(fetch: GradeTierFetch): TierActionOutcome {
  if (fetch.kind === "ok") return { kind: "ok" };
  if (fetch.kind === "no_token") return { kind: "session" };
  if (fetch.kind === "unreachable") return { kind: "refused", message: REFUSED_OFFLINE };
  // http
  if (fetch.status === 401) return { kind: "session" };
  if (fetch.status === 409) {
    const code = codeOf(fetch.body);
    if (code === "grade_tier_in_use") {
      return { kind: "refused", message: tierInUseMessage(sellersInTier(fetch.body)) };
    }
    if (code === "grade_tier_last_active") {
      return { kind: "refused", message: REFUSED_LAST_ACTIVE };
    }
    return { kind: "refused", message: REFUSED_DUPLICATE };
  }
  if (fetch.status === 422) return { kind: "refused", message: REFUSED_INVALID };
  return { kind: "refused", message: REFUSED_SERVER };
}

/**
 * The single created/updated tier a 2xx returns — so the caller could render the
 * witnessed row. Present for symmetry with shopSaveResult; the tier screen instead
 * re-fetches the whole list after any write, because a create shifts sort order and
 * a deactivate changes what may be deactivated next, and the list is the truth.
 */
export function readGradeTier(raw: unknown): AdminGradeTier | null {
  if (!isObj(raw)) return null;
  const id = readStr(raw["id"]);
  const code = readStr(raw["code"]);
  const name = readStr(raw["name"]);
  const sort_order = raw["sort_order"];
  const is_active = raw["is_active"];
  if (
    id === null ||
    code === null ||
    name === null ||
    typeof sort_order !== "number" ||
    typeof is_active !== "boolean"
  ) {
    return null;
  }
  return { id, code, name, sort_order, is_active };
}
