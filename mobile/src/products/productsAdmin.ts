/**
 * PRODUCT MASTER DATA — the shop's own products, categories and units, as the
 * office manages them, as PURE functions. Homed on the PHONE (the advisor's call;
 * the owner may veto), and it does NOT close P1.15: the desktop half stays open,
 * recorded in OPEN_ITEMS § Decisions open. No React Native, no Expo, no node, no
 * fetch — so `npm run prove:products` exercises exactly the sentences, gates,
 * grouping, search, filter and refusals the phone runs; ProductsScreen.tsx and
 * ProductActionsSheet.tsx render whatever this returns and decide nothing. Same
 * move and reason as usersAdmin.ts and gradeTierAdmin.ts.
 *
 * ONLINE ONLY, BY CONSTRUCTION — NOT BY OMISSION. This screen must show what the
 * yard cache deliberately EXCLUDES: the shop's INACTIVE products/categories/units,
 * so an admin can filter to them and reactivate one. `cached_products`
 * (SqliteMasterStore) holds ACTIVE rows only, because the yard must never be
 * offered a retired product — so the cache cannot answer the question this screen
 * asks. It therefore reads live `?include_inactive=true`, admin-only, exactly like
 * the users and grade-tier admin; offline it says so and draws no list. The search
 * and filter run ON THE DEVICE over the set the last read fetched.
 *
 * WHAT refreshMaster DOES, AND WHAT IT DOES NOT. A create/edit here re-reads THIS
 * screen's admin list, and (App.tsx, mirroring the price-save flow) refreshes THIS
 * device's yard cache so its cart reflects the new product at once. It does NOTHING
 * for ANOTHER phone: a shop with two handsets sees the new product on device B only
 * at B's next refreshMaster — its boot, its sign-in, or its own next price write —
 * never the instant A wrote it. There is no push.
 *
 * THE SERVER IS THE AUTHORITY. Every gate here (`editable`, `mayDeactivate`) is a
 * courtesy that stops the app offering a button the server would refuse;
 * `require_admin` on every write route in server/app/master.py is what enforces it,
 * and the server re-reads the role on every request. `code` is UNIQUE per shop (409
 * duplicate_code) and IMMUTABLE — set once at create, and a wrong one is fixed by a
 * new product with the old one retired, never a rename, because the code is what a
 * printed slip and a historical bill read (server ProductUpdate's note). `name` is
 * NOT unique. A product with no price is a CORRECT state, not an error — the yard
 * renders it `ยังไม่ได้ตั้งราคา` and the 424 product_price_unset path parks a bill
 * until the office sets one (lessons/fallback-default-is-a-wrong-number.md). And
 * DEACTIVATE IS NEVER DELETE: a retired product still reads on every historical bill
 * (server/app/bills.py — the product join has no is_active predicate), so nothing
 * this screen does can make a product vanish from money already recorded.
 */
import { may } from "../session/deviceRole.js";
import type { Grants } from "../session/deviceRole.js";

/* ==========================================================================
 * 1. THE WIRE — what GET/POST/PATCH send, and what we read back
 * ========================================================================== */

/** Bounds mirror server/app/master.py Code (1..64) and Name (1..200), the ONE
 *  place they are copied, so the form refuses before the request and a 422 is never
 *  rendered raw (lessons/a-refusal-hands-back-what-it-refused.md). Move the server
 *  bound and move these, nothing else. */
export const PRODUCT_CODE_MAX_LENGTH = 64;
export const PRODUCT_NAME_MAX_LENGTH = 200;

/**
 * A product/category/uom transport outcome. It KEEPS the body on an http refusal so
 * the screen can classify on the STATUS and the body's `detail.code`
 * (`duplicate_code`) — a structured field, never the server's prose. `no_token` is
 * the caller's case (App checks the token first). The same shape gradeTierAdmin and
 * usersAdmin use, so api.ts's `transportJsonKeepingBody` returns it structurally.
 */
export type ProductFetch =
  | { kind: "ok"; body: unknown }
  | { kind: "http"; status: number; body: unknown }
  | { kind: "unreachable" }
  | { kind: "no_token" };

/** POST /products body. category_id/uom_id are the shop's own active rows. */
export interface ProductCreateBody {
  code: string;
  name: string;
  category_id: string;
  uom_id: string;
}

/** PATCH /products/{id} body. `code` is absent on purpose: it is IMMUTABLE. The
 *  edit form always sends all three, so the body is never empty (no `no_changes`
 *  422) and a field left unchanged is written back to its own value. */
export interface ProductPatchBody {
  name: string;
  category_id: string;
  uom_id: string;
}

/** What a unit measures (server migration 0028, ruling R2). */
export type UomKind = "weight" | "count";
export const UOM_KIND_LABEL: Readonly<Record<UomKind, string>> = { weight: "วัดน้ำหนัก", count: "นับจำนวน" };

/** POST /product-categories and POST /uoms share this body; `kind` is a unit's only, and the phone
 *  always sends it for a new unit (a unit made here is never left undeclared). */
export interface EntityCreateBody {
  code: string;
  name: string;
  kind?: UomKind;
}

/** PATCH /product-categories/{id} and PATCH /uoms/{id} — the server accepts ONLY
 *  `name` on these (CategoryUpdate/UomUpdate); the code is immutable like a product's. */
export interface EntityRenameBody {
  name: string;
}

/** One product as the ADMIN screen holds it — fuller than the yard cache's
 *  `MasterProduct`: `category_id`/`uom_id` (the edit form's current values and the
 *  grouping key) and `is_active` (it lists the inactive ones the cache never sees).
 *  `prices` is grade→price string, `{}` for an unpriced product. */
export interface AdminProduct {
  id: string;
  code: string;
  name: string;
  category_id: string;
  uom_id: string;
  uom_code: string;
  uom_name: string;
  is_active: boolean;
  prices: Record<string, string>;
}

/** A category or a unit — the same shape (server _category_payload / _uom_payload). */
export interface AdminEntity {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const readStr = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** A grade→price map, or null if the shape is not a string→string object. An
 *  absent/empty map is a valid unpriced product, so `{}` is returned, not null. */
function readPrices(v: unknown): Record<string, string> | null {
  if (v === undefined || v === null) return {};
  if (!isObj(v)) return null;
  const out: Record<string, string> = {};
  for (const [grade, price] of Object.entries(v)) {
    if (typeof price !== "string") return null;
    out[grade] = price;
  }
  return out;
}

/**
 * Parse GET /products (?include_inactive) → the products, or null if the body is a
 * shape this build cannot read. Fatal-on-malformed, not skip-the-row: a PARTIAL
 * product list would hide a product an admin then re-creates, colliding on its code
 * — the same reasoning readUsers/readGradeTiers give. The keys are
 * server _product_payload's.
 */
export function readProducts(raw: unknown): AdminProduct[] | null {
  if (!isObj(raw)) return null;
  const arr = raw["products"];
  if (!Array.isArray(arr)) return null;
  const out: AdminProduct[] = [];
  for (const row of arr) {
    if (!isObj(row)) return null;
    const id = readStr(row["id"]);
    const code = readStr(row["code"]);
    const name = readStr(row["name"]);
    const category_id = readStr(row["category_id"]);
    const uom_id = readStr(row["uom_id"]);
    const uom_code = readStr(row["uom_code"]);
    const uom_name = readStr(row["uom_name"]);
    const is_active = row["is_active"];
    const prices = readPrices(row["prices"]);
    if (
      id === null ||
      code === null ||
      name === null ||
      category_id === null ||
      uom_id === null ||
      uom_code === null ||
      uom_name === null ||
      typeof is_active !== "boolean" ||
      prices === null
    ) {
      return null;
    }
    out.push({ id, code, name, category_id, uom_id, uom_code, uom_name, is_active, prices });
  }
  return out;
}

/** Parse a category/unit list under `key` (product_categories | uoms) →
 *  the entities, or null on any malformed row (fatal, the reason readProducts gives). */
export function readEntities(raw: unknown, key: "product_categories" | "uoms"): AdminEntity[] | null {
  if (!isObj(raw)) return null;
  const arr = raw[key];
  if (!Array.isArray(arr)) return null;
  const out: AdminEntity[] = [];
  for (const row of arr) {
    if (!isObj(row)) return null;
    const id = readStr(row["id"]);
    const code = readStr(row["code"]);
    const name = readStr(row["name"]);
    const is_active = row["is_active"];
    if (id === null || code === null || name === null || typeof is_active !== "boolean") {
      return null;
    }
    out.push({ id, code, name, is_active });
  }
  return out;
}

/* ==========================================================================
 * 2. THE LIST MODEL — grouped by category, searched and filtered ON THE DEVICE
 * ========================================================================== */

export type ProductTab = "products" | "categories" | "units";
export type ActivityFilter = "all" | "active" | "inactive";

/** The device-side query. `query` matches name and code (case-insensitive
 *  substring); `categoryId` null means every category; `activity` filters retired
 *  rows in or out. */
export interface ProductFilter {
  query: string;
  categoryId: string | null;
  activity: ActivityFilter;
}

export const NO_FILTER: ProductFilter = { query: "", categoryId: null, activity: "all" };

export interface ProductListRow {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  /** The unit's display name (uom_name), shown beside the code. */
  unitLabel: string;
  is_active: boolean;
  /** The price status, in the prices surface's own vocabulary: `ยังไม่ได้ตั้งราคา`
   *  for an unpriced product (the state that parks a bill), else the tier count. */
  priceLine: string;
}

export interface ProductSection {
  /** categoryId for an active group, or the sentinel for the retired group. */
  key: string;
  title: string;
  /** True for the one group of DEACTIVATED products, drawn last and apart. */
  inactive: boolean;
  rows: readonly ProductListRow[];
}

export type ProductEmpty =
  | { kind: "no_products" }
  | { kind: "no_match"; query: string };

export interface ProductListModel {
  sections: readonly ProductSection[];
  /** Products in the shop, all of them, whatever the filter. */
  total: number;
  /** Products passing the search AND the filter — 0 means an empty state. */
  matched: number;
  empty: ProductEmpty | null;
  /** The calm sentence to show when `matched` is 0 (never a raw dash). */
  emptyLine: string | null;
}

const UNPRICED = "ยังไม่ได้ตั้งราคา";
const INACTIVE_GROUP = "สินค้าที่ปิดใช้งาน";
const UNKNOWN_CATEGORY = "ไม่ระบุหมวดหมู่";
// The no-collection sentence, the seller picker's shape ("ยังไม่มีผู้ขายในระบบ — …"):
const NO_PRODUCTS_LINE = "ยังไม่มีสินค้าในร้าน — เพิ่มสินค้าใหม่ได้ที่แท็บ หมวดหมู่/หน่วยนับ แล้วมาเพิ่มสินค้า";
// The no-match sentence, the seller picker's shape (`ไม่พบผู้ขายที่ตรงกับ "…"`):
const NO_MATCH_FILTER_LINE = "ไม่พบสินค้าที่ตรงกับตัวกรองที่เลือก";

const priceLineOf = (prices: Record<string, string>): string => {
  const n = Object.keys(prices).length;
  return n === 0 ? UNPRICED : `${String(n)} ราคา`;
};

const matchesQuery = (p: AdminProduct, q: string): boolean =>
  q === "" || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q);

/**
 * THE GROUPED LIST, from the parsed products and categories and the device filter.
 * Active products first, grouped by category under the category's own name in code
 * order; then ONE group of retired products, visible and visibly apart, never
 * hidden. `matched` is 0 exactly when the empty state shows, and the sentence
 * distinguishes a shop with no products at all from a search that found nothing —
 * the seller picker's two-empties distinction, which needs opposite sentences.
 */
export function productListModel(
  products: readonly AdminProduct[],
  categories: readonly AdminEntity[],
  filter: ProductFilter,
): ProductListModel {
  const q = filter.query.trim().toLowerCase();
  const nameOf = new Map(categories.map((c) => [c.id, c.name]));
  // The category order the sections follow: by code, the server's own order.
  const catOrder = [...categories].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

  const passes = (p: AdminProduct): boolean => {
    if (filter.activity === "active" && !p.is_active) return false;
    if (filter.activity === "inactive" && p.is_active) return false;
    if (filter.categoryId !== null && p.category_id !== filter.categoryId) return false;
    return matchesQuery(p, q);
  };
  const kept = products.filter(passes);

  const toRow = (p: AdminProduct): ProductListRow => ({
    id: p.id,
    code: p.code,
    name: p.name,
    categoryId: p.category_id,
    unitLabel: p.uom_name,
    is_active: p.is_active,
    priceLine: priceLineOf(p.prices),
  });

  const sections: ProductSection[] = [];
  const activeKept = kept.filter((p) => p.is_active).map(toRow);
  for (const cat of catOrder) {
    const rows = activeKept.filter((r) => r.categoryId === cat.id);
    if (rows.length > 0) sections.push({ key: cat.id, title: cat.name, inactive: false, rows });
  }
  // Active products whose category is not in the list at all (should not happen —
  // categories are fetched include_inactive too — but never drop a row silently).
  const orphans = activeKept.filter((r) => !nameOf.has(r.categoryId));
  if (orphans.length > 0) {
    sections.push({ key: "__orphan__", title: UNKNOWN_CATEGORY, inactive: false, rows: orphans });
  }
  const inactiveRows = kept.filter((p) => !p.is_active).map(toRow);
  if (inactiveRows.length > 0) {
    sections.push({ key: "__inactive__", title: INACTIVE_GROUP, inactive: true, rows: inactiveRows });
  }

  const matched = kept.length;
  let empty: ProductEmpty | null = null;
  let emptyLine: string | null = null;
  if (matched === 0) {
    if (products.length === 0) {
      empty = { kind: "no_products" };
      emptyLine = NO_PRODUCTS_LINE;
    } else {
      empty = { kind: "no_match", query: filter.query };
      emptyLine =
        filter.query.trim() !== "" ? `ไม่พบสินค้าที่ตรงกับ “${filter.query.trim()}”` : NO_MATCH_FILTER_LINE;
    }
  }

  return { sections, total: products.length, matched, empty, emptyLine };
}

/* ==========================================================================
 * 3. THE CATEGORY / UNIT LIST — minimal: list, add, rename, deactivate
 * ========================================================================== */

export interface EntityRow {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
  /** Offer deactivate: an active row (the server allows it, and it never cascades —
   *  existing products keep a retired category/unit; only NEW ones are refused it).
   *  No last-active guard: zero categories cannot bill or park anything, it only
   *  blocks CREATING a product, which is recoverable by reactivating one. */
  mayDeactivate: boolean;
  mayReactivate: boolean;
}

export interface EntityListModel {
  editable: boolean;
  activeRows: readonly EntityRow[];
  inactiveRows: readonly EntityRow[];
  codeMaxLength: number;
  nameMaxLength: number;
}

export function entityListModel(entities: readonly AdminEntity[], editable: boolean): EntityListModel {
  const toRow = (e: AdminEntity): EntityRow => ({
    id: e.id,
    code: e.code,
    name: e.name,
    is_active: e.is_active,
    mayDeactivate: editable && e.is_active,
    mayReactivate: editable && !e.is_active,
  });
  const rows = entities.map(toRow);
  return {
    editable,
    activeRows: rows.filter((r) => r.is_active),
    inactiveRows: rows.filter((r) => !r.is_active),
    codeMaxLength: PRODUCT_CODE_MAX_LENGTH,
    nameMaxLength: PRODUCT_NAME_MAX_LENGTH,
  };
}

/* ==========================================================================
 * 4. VALIDATION — refuse at the keypad what the server would 422/409
 * ========================================================================== */

export type ProductFormField = "code" | "name" | "category" | "unit";

export type NewProductCheck =
  | { ok: true; body: ProductCreateBody }
  | { ok: false; field: ProductFormField; message: string };

const NEED_CODE = "กรอกรหัสสินค้า";
const NEED_NAME = "กรอกชื่อสินค้า";
const NEED_CATEGORY = "เลือกหมวดหมู่";
const NEED_UNIT = "เลือกหน่วยนับ";
const CODE_TOO_LONG = `รหัสยาวเกิน ${String(PRODUCT_CODE_MAX_LENGTH)} ตัวอักษร`;
const NAME_TOO_LONG = `ชื่อยาวเกิน ${String(PRODUCT_NAME_MAX_LENGTH)} ตัวอักษร`;

/** A NEW product, bounded and checked for a duplicate code BEFORE the write. `code`
 *  and `name` are trimmed (a leading space in the FK-like handle is a slip); the
 *  server's unique index is the authority, this only turns a round trip into a
 *  sentence. A duplicate is exact-match: the server's uniqueness is a text index. */
export function checkNewProduct(input: {
  code: string;
  name: string;
  categoryId: string | null;
  uomId: string | null;
  existing: readonly { code: string }[];
}): NewProductCheck {
  const code = input.code.trim();
  const name = input.name.trim();
  if (code.length === 0) return { ok: false, field: "code", message: NEED_CODE };
  if (code.length > PRODUCT_CODE_MAX_LENGTH) return { ok: false, field: "code", message: CODE_TOO_LONG };
  if (name.length === 0) return { ok: false, field: "name", message: NEED_NAME };
  if (name.length > PRODUCT_NAME_MAX_LENGTH) return { ok: false, field: "name", message: NAME_TOO_LONG };
  if (input.existing.some((p) => p.code === code)) {
    return { ok: false, field: "code", message: `มีสินค้ารหัส ${code} อยู่แล้ว` };
  }
  if (input.categoryId === null) return { ok: false, field: "category", message: NEED_CATEGORY };
  if (input.uomId === null) return { ok: false, field: "unit", message: NEED_UNIT };
  return { ok: true, body: { code, name, category_id: input.categoryId, uom_id: input.uomId } };
}

export type EditProductCheck =
  | { ok: true; body: ProductPatchBody }
  | { ok: false; field: ProductFormField; message: string };

/** An edited product: name/category/unit (the code is immutable, never in the
 *  patch). All three are always sent, so the body is never empty and an unchanged
 *  field is written to its own value. */
export function checkEditProduct(input: {
  name: string;
  categoryId: string | null;
  uomId: string | null;
}): EditProductCheck {
  const name = input.name.trim();
  if (name.length === 0) return { ok: false, field: "name", message: NEED_NAME };
  if (name.length > PRODUCT_NAME_MAX_LENGTH) return { ok: false, field: "name", message: NAME_TOO_LONG };
  if (input.categoryId === null) return { ok: false, field: "category", message: NEED_CATEGORY };
  if (input.uomId === null) return { ok: false, field: "unit", message: NEED_UNIT };
  return { ok: true, body: { name, category_id: input.categoryId, uom_id: input.uomId } };
}

export type EntityKind = "category" | "unit";

export type NewEntityCheck =
  | { ok: true; body: EntityCreateBody }
  | { ok: false; field: "code" | "name" | "kind"; message: string };

export const NEED_UOM_KIND = "เลือกว่าหน่วยนี้วัดน้ำหนักหรือนับจำนวน";

const ENTITY_WORD: Record<EntityKind, string> = { category: "หมวดหมู่", unit: "หน่วยนับ" };

/** A NEW category or unit, bounded and duplicate-checked. Same bounds as a product
 *  code/name (server Code/Name are shared across master.py). */
export function checkNewEntity(input: {
  code: string;
  name: string;
  kind: EntityKind;
  existing: readonly { code: string }[];
  /** A unit's kind (ruling R2); required for a unit, ignored for a category. */
  uomKind?: UomKind | null;
}): NewEntityCheck {
  const code = input.code.trim();
  const name = input.name.trim();
  const word = ENTITY_WORD[input.kind];
  if (code.length === 0) return { ok: false, field: "code", message: `กรอกรหัส${word}` };
  if (code.length > PRODUCT_CODE_MAX_LENGTH) return { ok: false, field: "code", message: CODE_TOO_LONG };
  if (name.length === 0) return { ok: false, field: "name", message: `กรอกชื่อ${word}` };
  if (name.length > PRODUCT_NAME_MAX_LENGTH) return { ok: false, field: "name", message: NAME_TOO_LONG };
  if (input.existing.some((e) => e.code === code)) {
    return { ok: false, field: "code", message: `มี${word}รหัส ${code} อยู่แล้ว` };
  }
  if (input.kind === "unit") {
    if (input.uomKind == null) return { ok: false, field: "kind", message: NEED_UOM_KIND };
    return { ok: true, body: { code, name, kind: input.uomKind } };
  }
  return { ok: true, body: { code, name } };
}

export type RenameCheck = { ok: true; name: string } | { ok: false; message: string };

/** A renamed category/unit's NAME (the code never changes). */
export function checkRenameEntity(name: string, kind: EntityKind): RenameCheck {
  const n = name.trim();
  const word = ENTITY_WORD[kind];
  if (n.length === 0) return { ok: false, message: `กรอกชื่อ${word}` };
  if (n.length > PRODUCT_NAME_MAX_LENGTH) return { ok: false, message: NAME_TOO_LONG };
  return { ok: true, name: n };
}

/* ==========================================================================
 * 5. THE OUTCOME — what one create/edit/deactivate produced
 * ========================================================================== */

export type ProductWriteOutcome =
  | { kind: "ok" }
  | { kind: "session" }
  | { kind: "refused"; message: string };

const REFUSED_OFFLINE = "ยังติดต่อระบบไม่ได้ จึงยังไม่ได้บันทึกการเปลี่ยนแปลง — ลองอีกครั้ง";
const REFUSED_SERVER = "ระบบยังตอบเรื่องสินค้าไม่ได้ในตอนนี้ — ลองอีกครั้ง";
// 403: the account is not an admin (a role changed server-side mid-session). No
// action the device can take clears it — only the owner can. Names the owner, not
// support, the 403 lesson's rule (lessons/403-is-about-what-the-caller-may-do.md).
const REFUSED_FORBIDDEN = "บัญชีนี้ไม่มีสิทธิ์จัดการสินค้า ต้องให้เจ้าของร้านทำรายการนี้";
// 409 duplicate_code — the one 409 these routes raise, for products, categories and
// units alike. Says the code is taken (never the server's prose).
const REFUSED_DUPLICATE = "รหัสนี้ถูกใช้ไปแล้ว ใช้รหัสอื่น";
const REFUSED_NOT_FOUND = "ไม่พบรายการนี้แล้ว — โหลดรายการใหม่";
// 400/422 — an over-scale/foreign value, or a category/unit deactivated out from
// under the form (category_inactive / uom_inactive). Never rendered raw.
const REFUSED_INVALID = "ระบบไม่รับค่าที่ส่งไป — ตรวจสอบข้อมูลแล้วลองอีกครั้ง";
// 422 unit_not_counting (ruling R2): a product counted per piece or lump moved onto a unit that is not a
// counting unit. Names the fix, never the server's prose.
export const REFUSED_UNIT_NOT_COUNTING = "สินค้านี้คิดราคาเป็นชิ้นหรือเหมา จึงต้องใช้หน่วยนับ — เลือกหน่วยนับแทน";

function detailCode(body: unknown): string | null {
  const d = typeof body === "object" && body !== null ? (body as { detail?: unknown }).detail : null;
  return typeof d === "object" && d !== null && typeof (d as { code?: unknown }).code === "string"
    ? (d as { code: string }).code : null;
}

/**
 * WHAT ONE create/edit/deactivate/activate PRODUCED, classified on the STATUS and
 * the body's `code`. 409 is always `duplicate_code` on these routes (products,
 * categories, units share `_raise_for_integrity`), so it words the duplicate. 403 is
 * the caller lacking the admin role; a 401 or no token ends the session. Neither a
 * duplicate nor an outage ends it.
 */
export function productWriteOutcome(fetch: ProductFetch): ProductWriteOutcome {
  if (fetch.kind === "ok") return { kind: "ok" };
  if (fetch.kind === "no_token") return { kind: "session" };
  if (fetch.kind === "unreachable") return { kind: "refused", message: REFUSED_OFFLINE };
  // http
  if (fetch.status === 401) return { kind: "session" };
  if (fetch.status === 403) return { kind: "refused", message: REFUSED_FORBIDDEN };
  if (fetch.status === 409) return { kind: "refused", message: REFUSED_DUPLICATE };
  if (fetch.status === 404) return { kind: "refused", message: REFUSED_NOT_FOUND };
  if (fetch.status === 422 && detailCode(fetch.body) === "unit_not_counting") {
    return { kind: "refused", message: REFUSED_UNIT_NOT_COUNTING };
  }
  if (fetch.status === 400 || fetch.status === 422) return { kind: "refused", message: REFUSED_INVALID };
  return { kind: "refused", message: REFUSED_SERVER };
}

/* ==========================================================================
 * 6. THE READ — the three lists, or a message to show instead
 * ========================================================================== */

/** `tone` is a local union the screen maps to a Kit tone; the pure module never
 *  imports the Kit (which would pull React Native in and break the proof). */
export interface ProductsMessage {
  tone: "offline" | "session" | "error";
  badge: string;
  lines: readonly string[];
  action: { kind: "retry"; label: string } | { kind: "sign_in"; label: string } | null;
}

export type ProductsScreenState =
  | {
      kind: "ready";
      editable: boolean;
      products: readonly AdminProduct[];
      categories: readonly AdminEntity[];
      units: readonly AdminEntity[];
    }
  | { kind: "message"; message: ProductsMessage };

const OFFLINE_MESSAGE: ProductsMessage = {
  tone: "offline",
  badge: "ยังติดต่อระบบไม่ได้",
  lines: [
    "หน้าจัดการสินค้าต้องอ่านและบันทึกผ่านระบบ (รวมถึงสินค้าที่ปิดใช้งาน ซึ่งเครื่องนี้ไม่ได้เก็บไว้) จึงต้องเชื่อมต่ออินเทอร์เน็ตก่อน",
  ],
  action: { kind: "retry", label: "ลองอีกครั้ง" },
};
const SESSION_MESSAGE: ProductsMessage = {
  tone: "session",
  badge: "หมดเวลาเข้าใช้งาน",
  lines: ["ต้องเข้าสู่ระบบใหม่เพื่อจัดการสินค้า"],
  action: { kind: "sign_in", label: "เข้าสู่ระบบ" },
};
// 403: the caller is no longer an admin. No button — only the owner can clear it.
const FORBIDDEN_MESSAGE: ProductsMessage = {
  tone: "error",
  badge: "ไม่มีสิทธิ์",
  lines: [REFUSED_FORBIDDEN],
  action: null,
};
const SERVER_MESSAGE: ProductsMessage = {
  tone: "error",
  badge: "ระบบขัดข้อง",
  lines: ["ระบบยังตอบเรื่องสินค้าไม่ได้ในตอนนี้"],
  action: { kind: "retry", label: "ลองอีกครั้ง" },
};

/** One fetch → the message it governs, or null when it landed and parsed. */
function messageFor(fetch: ProductFetch, parsedNull: boolean): ProductsMessage | null {
  if (fetch.kind === "no_token") return SESSION_MESSAGE;
  if (fetch.kind === "unreachable") return OFFLINE_MESSAGE;
  if (fetch.kind === "http") {
    if (fetch.status === 401) return SESSION_MESSAGE;
    if (fetch.status === 403) return FORBIDDEN_MESSAGE;
    return SERVER_MESSAGE;
  }
  // ok, but a body this build cannot read is the server screen (like readUsers).
  return parsedNull ? SERVER_MESSAGE : null;
}

/**
 * THE WHOLE SCREEN from the three reads. Like settings' two-read rule: the screen is
 * a MESSAGE unless ALL THREE land and parse, because a product list without its
 * categories cannot be grouped and its add form cannot offer a category or unit. A
 * partial screen is a claim the data cannot back. The governing failure is the
 * FIRST that fails, products then categories then units, so offline/session/403
 * outrank a later read that never ran.
 */
export function productsScreenState(
  productsFetch: ProductFetch,
  categoriesFetch: ProductFetch,
  unitsFetch: ProductFetch,
  grants: Grants,
): ProductsScreenState {
  const products = productsFetch.kind === "ok" ? readProducts(productsFetch.body) : null;
  const categories =
    categoriesFetch.kind === "ok" ? readEntities(categoriesFetch.body, "product_categories") : null;
  const units = unitsFetch.kind === "ok" ? readEntities(unitsFetch.body, "uoms") : null;

  const governing =
    messageFor(productsFetch, products === null) ??
    messageFor(categoriesFetch, categories === null) ??
    messageFor(unitsFetch, units === null);
  if (governing !== null) return { kind: "message", message: governing };

  // All three landed and parsed (the three nulls are impossible here, but the
  // compiler needs the guard, and a defensive server message is cheaper than a throw).
  if (products === null || categories === null || units === null) {
    return { kind: "message", message: SERVER_MESSAGE };
  }
  // master.write (server migration 0019) gates every product/category/unit write.
  return { kind: "ready", editable: may(grants, "master.write"), products, categories, units };
}
