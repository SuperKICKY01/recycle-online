/**
 * THE SHOP'S OWN SETTINGS, AS THE OFFICE READS AND EDITS THEM.
 *
 * Every rendering and gating decision for `GET /shop` and `PATCH /shop`, as pure
 * functions. No React Native, no Expo, no node, no fetch — so the headless proof
 * (`npm run prove:settings`) exercises exactly the sentences, exactly the branches
 * and exactly the role gate the phone runs. Same reason `dailyView.ts`,
 * `statusNotice.ts` and `saveConfirmNotice.ts` live under `src/` rather than
 * `app/`: files under `app/` are outside the proven surface, and every
 * operator-facing sentence that ever shipped wrong on this project was one no
 * proof could see (lessons/correct-classification-can-still-render-as-an-error.md).
 *
 * `SettingsScreen.tsx` renders whatever this returns and decides nothing itself.
 *
 * ---------------------------------------------------------------------------
 * WHO READS, WHO WRITES
 * ---------------------------------------------------------------------------
 * GET /shop is staff-readable; PATCH /shop is admin-only (server require_admin).
 * So the READ is for both roles and the WRITE for one, and the screen must not
 * draw a control a staff session would only be refused — the same rule
 * `mayEditPrices` states for the price list. STAFF sees the values, read-only,
 * with no edit control drawn at all; ADMIN sees editable fields and a save button.
 * The gate is `may(grants, "shop.settings.write")` (src/session/deviceRole.ts), which FAILS
 * OPEN on an unknown token for the reason that file gives, and the server's
 * require_admin is the authority regardless — a wrongly-offered save gets a 403
 * this screen words (never a sign-in, never support).
 *
 * ---------------------------------------------------------------------------
 * THE GRADE SET IS THE SHOP'S OWN, AND IT ARRIVES FROM THE SERVER (S16 / P1.24)
 * ---------------------------------------------------------------------------
 * `default_grade` is one of the shop's ACTIVE tier codes, or none. The set used
 * to be the hardcoded `GRADES` A-D; it is per-tenant now, so the options are built
 * from the tiers the caller passes in (fetched from GET /grade-tiers), not from a
 * constant here. The server's `_validate_grade(must_be_active=True)` is the
 * authority on PATCH /shop default_grade — a code the shop has not declared, or a
 * deactivated one, is a readable 422; this module offers only active tiers, so an
 * ordinary user never provokes it. The tier CRUD itself lives in
 * `gradeTierAdmin.ts`, a separate module with its own proof.
 *
 * F2 — A ONE-TIER SHOP HIDES THE CONTROL. A shop with exactly one active tier does
 * not grade: every seller sits in that tier (the server seats them on sync), so
 * there is no default to choose and the control is not drawn (`showGrade` false).
 * The tier LIST is a different surface and is never hidden — a one-tier shop must
 * be able to add its second tier.
 *
 * ---------------------------------------------------------------------------
 * ONLINE ONLY, AND NO INVENTED VALUE
 * ---------------------------------------------------------------------------
 * Settings is not an outbox kind (a kind is the whole registry — P1.18); there is
 * no offline write. Offline, the screen says one calm sentence that settings need
 * a connection and draws NO fields, because a value shown without a fetch is a
 * claim about a cache this screen does not own. And no field is ever pre-filled
 * with an invented value: an empty server value renders empty with a sentence,
 * never a placeholder that looks like data.
 *
 * ---------------------------------------------------------------------------
 * A SAVE REPORTS A WITNESSED STATE
 * ---------------------------------------------------------------------------
 * PATCH /shop returns the re-read row, so a successful save renders what came
 * BACK, not what was sent (lessons/a-value-comparison-cannot-prove-a-path.md: the
 * screen reports a state the server witnessed). `shopSaveResult` parses the
 * RESPONSE and hands the form that; the request is never rendered.
 */
import { may } from "../session/deviceRole.js";
import type { Grants } from "../session/deviceRole.js";

/**
 * The two fields of an active tier this screen needs to build the default-grade
 * options — a structural narrowing so this module takes no dependency on
 * gradeTierAdmin's fuller `AdminGradeTier`. The caller passes the ACTIVE tiers,
 * already filtered, in the shop's order.
 */
export interface ActiveTier {
  code: string;
  name: string;
}

/* ==========================================================================
 * 1. THE WIRE — what GET/PATCH /shop send, and what we refuse to read
 * ========================================================================== */

/** The shop row, exactly as `master._read_shop` returns it. */
export interface ShopSettings {
  id: string;
  name: string;
  /** One of the shop's active tier codes, or null when the shop has set no default. */
  default_grade: string | null;
  address: string | null;
  phone: string | null;
}

/**
 * What a fetch of /shop produced. TRANSPORT ONLY — no meaning is attached here,
 * so the whole mapping below is provable headless without a server. `app/api.ts`
 * builds one of these and nothing else. The same shape carries a PATCH outcome.
 */
export type ShopFetch =
  /** 2xx. The body is `unknown` on purpose: it is validated here, not there. */
  | { kind: "ok"; body: unknown }
  /** The server ANSWERED and refused. `code` is the body's code, never its prose. */
  | { kind: "http"; status: number; code: string | null }
  /** No answer at all: timeout, DNS, no route, aeroplane mode. */
  | { kind: "unreachable" }
  /** There is no session token on this device, so nothing was asked. */
  | { kind: "no_token" };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const readStr = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** null/absent -> null; a string -> the string; anything else -> undefined (fatal). */
const readOptStr = (v: unknown): string | null | undefined =>
  v === null || v === undefined ? null : typeof v === "string" ? v : undefined;

/**
 * The shop row, or null if it cannot be read. `id` and `name` are fatal — a
 * settings screen with no name is not a degraded screen, it is a wrong one — while
 * the three nullable fields are read through `readOptStr`, so a real null is kept
 * and only a wrong TYPE (a number where a string belongs) is fatal.
 */
export function readShopSettings(raw: unknown): ShopSettings | null {
  if (!isObj(raw)) return null;
  const id = readStr(raw["id"]);
  const name = readStr(raw["name"]);
  const default_grade = readOptStr(raw["default_grade"]);
  const address = readOptStr(raw["address"]);
  const phone = readOptStr(raw["phone"]);
  if (
    id === null ||
    name === null ||
    default_grade === undefined ||
    address === undefined ||
    phone === undefined
  ) {
    return null;
  }
  return { id, name, default_grade, address, phone };
}

/**
 * THE CALLER'S BRANCH off a /shop body (server migration 0018), for the cache
 * `SqliteShopStore.saveBranch` keeps beside the shop row.
 *
 * Three outcomes, and the difference between the last two is the whole point:
 *   - `{ shop_id, branch_id: "<uuid>" }` — the server named the caller's yard;
 *   - `{ shop_id, branch_id: null }`     — the server ANSWERED that there is no
 *     single one (an unscoped owner of a multi-yard shop). The cache is CLEARED,
 *     because a branch cached from before the second yard opened would stamp
 *     every bill on a yard the owner did not choose;
 *   - `null`                              — the body is not a /shop body (no
 *     string `id`, a `branch` that is neither null nor an object with a string
 *     `id`). NOTHING is written: an unreadable body is not evidence that the
 *     branch went away.
 *
 * A pre-0018 server sends no `branch` key at all; that reads as "no single
 * branch" and clears the cache, which is right — such a server resolves every
 * bill itself and a cached branch would be a claim about a yard it cannot see.
 */
export function readShopBranch(raw: unknown): { shop_id: string; branch_id: string | null } | null {
  if (!isObj(raw)) return null;
  const shop_id = readStr(raw["id"]);
  if (shop_id === null) return null;
  const branch = raw["branch"];
  if (branch === null || branch === undefined) return { shop_id, branch_id: null };
  if (!isObj(branch)) return null;
  const branch_id = readStr(branch["id"]);
  return branch_id === null ? null : { shop_id, branch_id };
}

/* ==========================================================================
 * 2. THE SCREEN — one shape per outcome
 * ========================================================================== */

export type ShopMessageTone = "forbidden" | "session" | "offline" | "server" | "invalid";

/** The KIND selects the handler; the LABEL travels with it, like DailyAction. */
export type ShopAction =
  | { kind: "sign_in"; label: string }
  | { kind: "retry"; label: string }
  | null;

export interface ShopMessageScreen {
  kind: "message";
  tone: ShopMessageTone;
  badge: string;
  lines: string[];
  action: ShopAction;
}

export interface ShopGradeOption {
  /** null is the explicit "no default" choice, and it is a first-class option. */
  value: string | null;
  label: string;
}

export interface ShopFormScreen {
  kind: "form";
  title: string;
  /** true for staff: no edit control and no save button is drawn. */
  readOnly: boolean;
  nameLabel: string;
  /** The shop name, read-only for BOTH roles — it is on printed slips (D4). */
  name: string;
  nameNote: string;
  /**
   * F2: FALSE when the shop has exactly one active tier — the whole default-grade
   * control (label, chips/value, notes) is not drawn, because a one-tier shop does
   * not grade and has no default to choose. The tier list below is unaffected.
   */
  showGrade: boolean;
  gradeLabel: string;
  /** Current default grade, or null for "no default". */
  grade: string | null;
  /** [ the null "no default" option, then one per ACTIVE tier, by name ]. */
  gradeOptions: readonly ShopGradeOption[];
  /** What choosing "no default" (null) means for the yard. */
  gradeNoneNote: string;
  /** Shown in place of the control when `showGrade` is false (the F2 one-tier shop). */
  gradeSingleTierNote: string;
  addressLabel: string;
  address: string | null;
  /** Shown when address is null — an empty field with a sentence, not a fake value. */
  addressEmptyNote: string;
  addressMaxLength: number;
  phoneLabel: string;
  phone: string | null;
  phoneEmptyNote: string;
  phoneMaxLength: number;
  /** The save control's label, or null when the screen is read-only (staff). */
  saveLabel: string | null;
}

export type ShopSettingsScreen = ShopFormScreen | ShopMessageScreen;

/* ==========================================================================
 * 3. THE SENTENCES
 * ========================================================================== */

const ASK_THE_OWNER = "ต้องแจ้งเจ้าของร้าน";
/** The server's own word for the admin role (auth.require_admin's message). */
const ADMIN_ROLE_TH = "ผู้ดูแลระบบ";

/** The bounds mirror the server model exactly (master.ShopAddress/ShopPhone). */
export const ADDRESS_MAX_LENGTH = 500;
export const PHONE_MAX_LENGTH = 32;

const NAME_NOTE = "ชื่อร้านแก้ไขที่นี่ไม่ได้ — เป็นชื่อที่พิมพ์บนบิล";
const GRADE_NONE_NOTE =
  "ถ้าไม่กำหนดเกรดเริ่มต้น ผู้ขายที่ยังไม่ได้จัดเกรดจะยังซื้อขายไม่ได้จนกว่าสำนักงานจะกำหนดเกรดให้";
/**
 * F2: SHOWN INSTEAD OF THE CONTROL when the shop has one active tier. A shop that
 * does not grade needs no default — every seller sits in its single tier. To grade
 * by tier, the shop adds a second tier in the list below.
 */
const GRADE_SINGLE_TIER_NOTE =
  "ร้านนี้มีเกรดเดียว ผู้ขายทุกรายจึงอยู่ในเกรดนั้นโดยอัตโนมัติ ไม่ต้องกำหนดเกรดเริ่มต้น — ถ้าต้องการแยกเกรด ให้เพิ่มเกรดในรายการด้านล่าง";
const ADDRESS_EMPTY_NOTE = "ยังไม่ได้กรอกที่อยู่";
const PHONE_EMPTY_NOTE = "ยังไม่ได้กรอกเบอร์โทร";

/**
 * THE OFFLINE SENTENCE. Settings is the one surface here that has no offline
 * write and no cache of its own to read, so it says so and draws no field — a
 * value shown without a fetch is a claim about data this screen does not hold.
 */
const OFFLINE_LINE =
  "หน้าตั้งค่าร้านต้องอ่านและบันทึกผ่านระบบ จึงต้องเชื่อมต่ออินเทอร์เน็ตก่อน — ข้อมูลเดิมไม่ได้หายไปไหน";

/**
 * THE 403. Named the shop OWNER and the admin ROLE, never a sign-in (the same
 * account returns with the same role) and never support (who cannot grant a
 * role). Same three rules as parkedReason.SUBMIT_REFUSED.
 */
const FORBIDDEN_LINE = `บัญชีนี้ไม่มีสิทธิ์แก้ไขการตั้งค่าร้าน — ${ASK_THE_OWNER}ให้ตั้งบัญชีนี้เป็น${ADMIN_ROLE_TH}`;

/**
 * The default-grade options, in draw order: "no default" first, then one per
 * ACTIVE tier in the shop's order, labelled by the tier's NAME (F3). The value is
 * the tier CODE (what PATCH /shop default_grade validates and stores); the label
 * is the name the shop reads.
 */
export function gradeOptions(activeTiers: readonly ActiveTier[]): readonly ShopGradeOption[] {
  return [
    { value: null, label: "ไม่กำหนดเกรดเริ่มต้น" },
    ...activeTiers.map((t) => ({ value: t.code, label: t.name })),
  ];
}

function sessionMessage(): ShopMessageScreen {
  return {
    kind: "message",
    tone: "session",
    badge: "ต้องเข้าสู่ระบบใหม่",
    lines: ["หมดเวลาเข้าใช้งาน ต้องเข้าสู่ระบบใหม่ก่อนจึงจะดูหรือแก้ไขการตั้งค่าร้านได้"],
    action: { kind: "sign_in", label: "เข้าสู่ระบบ" },
  };
}

function offlineMessage(): ShopMessageScreen {
  return {
    kind: "message",
    tone: "offline",
    badge: "ยังติดต่อระบบไม่ได้",
    lines: [OFFLINE_LINE],
    action: { kind: "retry", label: "ลองอีกครั้ง" },
  };
}

function forbiddenMessage(): ShopMessageScreen {
  return {
    kind: "message",
    tone: "forbidden",
    badge: "ไม่มีสิทธิ์แก้ไขการตั้งค่า",
    lines: [FORBIDDEN_LINE],
    // NO action. The only move is a conversation, and an action the app cannot
    // perform must never be dressed as one it can.
    action: null,
  };
}

/**
 * OVER-BOUND. Names the bounded fields and their limits, and NOTHING the caller
 * typed — the value that was refused never reaches this sentence. The screen also
 * caps its inputs at these lengths, so an ordinary user cannot provoke this; it is
 * the fallback for a future server bound.
 */
function tooLongMessage(): ShopMessageScreen {
  return {
    kind: "message",
    tone: "invalid",
    badge: "ข้อมูลยาวเกินกำหนด",
    lines: [
      `ข้อมูลที่กรอกยาวเกินที่ระบบรับได้ — ที่อยู่ไม่เกิน ${String(ADDRESS_MAX_LENGTH)} ตัวอักษร` +
        ` และเบอร์โทรไม่เกิน ${String(PHONE_MAX_LENGTH)} ตัวอักษร แก้ให้สั้นลงแล้วบันทึกอีกครั้ง`,
    ],
    action: null,
  };
}

function serverMessage(): ShopMessageScreen {
  return {
    kind: "message",
    tone: "server",
    badge: "ระบบยังตอบไม่ได้",
    lines: [`ระบบยังตอบเรื่องการตั้งค่าร้านไม่ได้ในตอนนี้ — ${ASK_THE_OWNER}`],
    action: { kind: "retry", label: "ลองอีกครั้ง" },
  };
}

/**
 * A refusal/outage the transport produced, classified on the STATUS, never on the
 * body — the same rule httpTransport and dailyView follow. Called only for a
 * non-`ok` fetch, so it always returns a screen.
 */
function shopMessage(fetch: Exclude<ShopFetch, { kind: "ok" }>): ShopMessageScreen {
  if (fetch.kind === "no_token") return sessionMessage();
  if (fetch.kind === "unreachable") return offlineMessage();
  if (fetch.status === 401) return sessionMessage();
  if (fetch.status === 403) return forbiddenMessage();
  if (fetch.status === 422) return tooLongMessage();
  return serverMessage();
}

/**
 * THE SETTINGS SCREEN, from one GET /shop result, the shop's ACTIVE tiers, and the
 * device's role. The only entry point the view uses for the READ. The active tiers
 * come from the same fetch that feeds the tier-admin section (GET /grade-tiers),
 * already filtered and ordered by the caller — the form needs them for the
 * default-grade options and for the F2 one-tier decision.
 */
export function shopSettingsScreen(
  fetch: ShopFetch,
  grants: Grants,
  activeTiers: readonly ActiveTier[],
): ShopSettingsScreen {
  if (fetch.kind !== "ok") return shopMessage(fetch);

  const shop = readShopSettings(fetch.body);
  if (shop === null) {
    // 200 with a body this build cannot read — an older or newer API.
    return unreadableSettingsScreen();
  }

  return formScreen(shop, grants, activeTiers);
}

/**
 * A 200 whose body this build cannot read — an older or newer API. Exported so the
 * settings flow can show it for an unreadable GRADE-TIER body too: either read being
 * unreadable means the settings screen cannot be drawn honestly, and one wording
 * covers both.
 */
export function unreadableSettingsScreen(): ShopMessageScreen {
  return {
    kind: "message",
    tone: "server",
    badge: "อ่านข้อมูลจากระบบไม่ได้",
    lines: [`ระบบตอบกลับมาในรูปแบบที่แอปรุ่นนี้อ่านไม่ได้ จึงยังแสดงการตั้งค่าไม่ได้ — ${ASK_THE_OWNER}`],
    action: { kind: "retry", label: "ลองอีกครั้ง" },
  };
}

/** The form itself, from a read shop row and the shop's active tiers. Shared by the
 *  read and by a save's re-read. */
export function formScreen(
  shop: ShopSettings,
  grants: Grants,
  activeTiers: readonly ActiveTier[],
): ShopFormScreen {
  // shop.settings.write (server migration 0019) gates PATCH /shop; a set that
  // lacks it renders read-only, an absent set fails open onto the 403 branch.
  const readOnly = !may(grants, "shop.settings.write");
  return {
    kind: "form",
    title: "ตั้งค่าร้าน",
    readOnly,
    nameLabel: "ชื่อร้าน",
    name: shop.name,
    nameNote: NAME_NOTE,
    // F2: exactly one active tier means the shop does not grade — hide the control.
    // 0 or 2+ show it (0 is the deactivated-to-nothing state the tier list flags).
    showGrade: activeTiers.length !== 1,
    gradeLabel: "เกรดเริ่มต้นของร้าน",
    grade: shop.default_grade,
    gradeOptions: gradeOptions(activeTiers),
    gradeNoneNote: GRADE_NONE_NOTE,
    gradeSingleTierNote: GRADE_SINGLE_TIER_NOTE,
    addressLabel: "ที่อยู่ร้าน",
    address: shop.address,
    addressEmptyNote: ADDRESS_EMPTY_NOTE,
    addressMaxLength: ADDRESS_MAX_LENGTH,
    phoneLabel: "เบอร์โทรร้าน",
    phone: shop.phone,
    phoneEmptyNote: PHONE_EMPTY_NOTE,
    phoneMaxLength: PHONE_MAX_LENGTH,
    // THE control a staff session would be refused is never drawn.
    saveLabel: readOnly ? null : "บันทึก",
  };
}

/* ==========================================================================
 * 4. THE EDIT — what changed, and the confirmation a grade change earns
 * ========================================================================== */

/**
 * The office's edit buffer. `address`/`phone` are the input strings; an empty
 * string means the field was cleared (and is sent as null — the server clears on
 * null, and "" is never overloaded to mean clear). Nothing is stripped: a space
 * is a character the field may hold, exactly as the server model allows.
 */
export interface ShopEdits {
  default_grade: string | null;
  address: string;
  phone: string;
}

/** Only the fields that CHANGED. A key present with `null` clears; absent = untouched. */
export interface ShopPatch {
  default_grade?: string | null;
  address?: string | null;
  phone?: string | null;
}

const emptyToNull = (s: string): string | null => (s.length === 0 ? null : s);

/**
 * The PATCH body: only the fields whose value differs from the shop row read from
 * the server. An emptied text field becomes null (a clear), never "".
 */
export function shopPatchBody(original: ShopSettings, edits: ShopEdits): ShopPatch {
  const patch: ShopPatch = {};
  if (edits.default_grade !== original.default_grade) patch.default_grade = edits.default_grade;
  const address = emptyToNull(edits.address);
  if (address !== original.address) patch.address = address;
  const phone = emptyToNull(edits.phone);
  if (phone !== original.phone) patch.phone = phone;
  return patch;
}

/** Nothing changed — the screen must NOT send an empty PATCH (the server has no SET). */
export function patchIsEmpty(patch: ShopPatch): boolean {
  return Object.keys(patch).length === 0;
}

/** Does this pending save move the default grade? Then it earns a confirmation. */
export function patchChangesGrade(patch: ShopPatch): boolean {
  return Object.prototype.hasOwnProperty.call(patch, "default_grade");
}

/**
 * THE CONFIRMATION A DEFAULT-GRADE CHANGE EARNS — measure-before-the-write applied
 * to a human. The default grade decides how every future ungraded walk-in is
 * priced for the whole shop, and a purchase cannot be un-priced, so the change is
 * confirmed before it is written. Derived from the new value: setting a grade and
 * clearing it have opposite consequences and must not share one sentence.
 */
export function defaultGradeChangeConfirmation(newGrade: string | null): string {
  if (newGrade === null) {
    return (
      "การล้างเกรดเริ่มต้นของร้าน จะทำให้บิลของผู้ขายที่ยังไม่ได้จัดเกรดกลับไปค้างรอสำนักงานกำหนดเกรดก่อนเหมือนเดิม" +
      " — ตรวจสอบก่อนบันทึก"
    );
  }
  return (
    `การกำหนดเกรดเริ่มต้นของร้านเป็นเกรด ${newGrade} จะเปลี่ยนวิธีคิดราคาของผู้ขายที่ยังไม่ได้จัดเกรดทุกรายในอนาคต` +
    " — ตรวจสอบก่อนบันทึก"
  );
}

/* ==========================================================================
 * 5. THE SAVE — a witnessed state, or a refusal
 * ========================================================================== */

export type ShopSaveResult =
  /** The server re-read the row and returned it; render THIS, never the request. */
  | { kind: "saved"; shop: ShopSettings }
  /** A refusal or outage — worded exactly as the read side words the same status. */
  | { kind: "message"; screen: ShopMessageScreen };

/**
 * The outcome of a PATCH /shop, for the screen. On success it parses the RESPONSE
 * (the server's re-read row) and hands that back — so what the form shows after a
 * save is a state the server witnessed, not the value the device sent.
 */
export function shopSaveResult(fetch: ShopFetch): ShopSaveResult {
  if (fetch.kind === "ok") {
    const shop = readShopSettings(fetch.body);
    if (shop === null) return { kind: "message", screen: serverMessage() };
    return { kind: "saved", shop };
  }
  return { kind: "message", screen: shopMessage(fetch) };
}
