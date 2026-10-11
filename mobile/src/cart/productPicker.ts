/**
 * THE CART'S PRODUCT PICKER — category browse, search and the frequent row (cart milestone,
 * ADVISOR-DECIDED 2026-10-12). Pure TypeScript, no React Native: prove:productpicker drives
 * exactly these functions, and app/CartScreen.tsx renders what they return and decides nothing.
 *
 *   categories   SRS 2.1 `เลือกกลุ่มสินค้า -> เลือกสินค้า`.
 *   search       PRODUCT_BLUEPRINT 4.8: product name (Thai substring), product code and category
 *                name; whitespace- and case-insensitive; ACTIVE products only. Thai tone-mark-
 *                insensitive matching is NOT here (OPEN_ITEMS, a later line).
 *   frequent     PRODUCT_BLUEPRINT 4.8 `10 รายการประจำต้องอยู่หน้าแรก`, DERIVED, never stored: this
 *                branch's most frequent products, counted from the bills THIS DEVICE holds over the
 *                last 30 shop days; frozen for the shop day once computed.
 */
import { shopToday, spanDays } from "../dashboard/period.js";
import type { MasterProduct } from "../master/types.js";
import { isVoided, type LocalBill } from "../sync/types.js";

/* ------------------------------------------------------------ categories -- */

/** The id the `ทั้งหมด` chip carries. Not a real category id (those are UUIDs). */
export const ALL_CATEGORIES = "__all__";
export const ALL_CATEGORIES_LABEL = "ทั้งหมด";

export interface CategoryChip {
  readonly id: string;
  readonly label: string;
}

const isOffered = (p: MasterProduct): boolean => p.is_active !== false;

/**
 * Plain code-unit order, NOT localeCompare: ICU collation can ignore punctuation (`-`) and differs
 * by device locale, and an order that differs between two phones at one yard is a defect.
 */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** `ทั้งหมด`, then each category an ACTIVE product is in, by category code. */
export function categoryChips(products: readonly MasterProduct[]): CategoryChip[] {
  const seen = new Map<string, { code: string; name: string }>();
  for (const p of products) {
    if (!isOffered(p) || !p.category) continue;
    seen.set(p.category.id, { code: p.category.code, name: p.category.name });
  }
  const chips = [...seen.entries()]
    .sort((a, b) => cmp(a[1].code, b[1].code))
    .map(([id, c]) => ({ id, label: c.name }));
  return [{ id: ALL_CATEGORIES, label: ALL_CATEGORIES_LABEL }, ...chips];
}

/** Category code then product code; a product with no category sorts after every category. */
function catalogueOrder(a: MasterProduct, b: MasterProduct): number {
  const ca = a.category?.code ?? null;
  const cb = b.category?.code ?? null;
  if (ca !== cb) {
    if (ca === null) return 1;
    if (cb === null) return -1;
    return cmp(ca, cb);
  }
  return cmp(a.code, b.code);
}

/* ---------------------------------------------------------------- search -- */

/** Lower-case Latin, drop every whitespace character. Thai has no case; spaces are not meaning. */
export function normalizeQuery(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

/**
 * The products the list shows: ACTIVE only, in the chosen category (or all), matching the query
 * on name, code or category name. An empty query matches everything. Catalogue order.
 */
export function filterProducts(
  products: readonly MasterProduct[],
  categoryId: string,
  query: string,
): MasterProduct[] {
  const q = normalizeQuery(query);
  return products
    .filter(isOffered)
    .filter((p) => categoryId === ALL_CATEGORIES || p.category?.id === categoryId)
    .filter(
      (p) =>
        q === "" ||
        normalizeQuery(p.name).includes(q) ||
        normalizeQuery(p.code).includes(q) ||
        (p.category != null && normalizeQuery(p.category.name).includes(q)),
    )
    .sort(catalogueOrder);
}

/** The sentence the list shows when it is empty — once, here, so the screen writes none. */
export function emptyListLine(categoryId: string, query: string): string {
  const q = query.trim();
  if (q !== "") return `ไม่พบสินค้าที่ตรงกับ “${q}”`;
  return categoryId === ALL_CATEGORIES ? "ยังไม่มีสินค้าในเครื่องนี้" : "หมวดนี้ยังไม่มีสินค้า";
}

export const SEARCH_PLACEHOLDER = "ค้นหา: ชื่อ / รหัส / หมวด";

/* -------------------------------------------------------------- frequent -- */

export const FREQUENT_WINDOW_DAYS = 30;
export const FREQUENT_MAX = 6;

/**
 * HOW MANY TILES TO SHOW (ADVISOR-DECIDED 2026-10-12, decision 2b): up to 6 in two lines of 3, but
 * the product list must start above the fold at font scale 1.0 AND 1.3. At a large system font a
 * tile's Thai name takes two lines and the row would push the list below the fold (measured on the
 * walk device), so above 1.15 the row shows ONE line of 3. The frozen row still holds 6 ids; this
 * only decides how many of them are drawn.
 */
export const LARGE_FONT_SCALE = 1.15;
export function frequentTilesFor(fontScale: number): number {
  return fontScale > LARGE_FONT_SCALE ? 3 : FREQUENT_MAX;
}
export const FREQUENT_HEADING = "ใช้บ่อย";
/** The fallback row is NOT frequency, so it does not say it is. */
export const FALLBACK_HEADING = "สินค้าในร้าน";

export interface FrequentInput {
  readonly bills: readonly LocalBill[];
  readonly products: readonly MasterProduct[];
  /** The branch this device last learned; null = unknown, every bill counts. */
  readonly branchId: string | null;
  readonly now: Date;
  readonly limit?: number;
}

export interface FrequentRow {
  /** The shop day the row was computed for (`YYYY-MM-DD`, shop time). */
  readonly day: string;
  readonly productIds: readonly string[];
  readonly source: "history" | "fallback";
}

/**
 * THE FREQUENT ROW, computed. A bill counts ONCE per product it contains, however many lines;
 * a VOIDED bill does not count; only bills of THIS branch count when the branch is known (a bill
 * stamped with no branch counts only while the device's branch is unknown); only the last
 * FREQUENT_WINDOW_DAYS shop days, today included. Only ACTIVE products in the catalogue appear —
 * a retired product never does, whatever its history. Order: count descending, then product code
 * ascending. No counted product at all → the first products in catalogue order, as "fallback".
 */
export function frequentProducts(input: FrequentInput): FrequentRow {
  const limit = input.limit ?? FREQUENT_MAX;
  const today = shopToday(input.now);
  const offered = new Map(input.products.filter(isOffered).map((p) => [p.id, p]));
  const counts = new Map<string, number>();
  for (const b of input.bills) {
    if (isVoided(b)) continue;
    if (input.branchId !== null && b.payload.branch_id !== input.branchId) continue;
    const age = spanDays({ from_date: shopToday(new Date(b.device_created_at)), to_date: today });
    if (!(age >= 1 && age <= FREQUENT_WINDOW_DAYS)) continue;
    for (const id of new Set(b.payload.items.map((i) => i.product_id))) {
      if (offered.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  if (counts.size === 0) {
    const first = [...offered.values()].sort(catalogueOrder).slice(0, limit);
    return { day: today, productIds: first.map((p) => p.id), source: "fallback" };
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return cmp(offered.get(a[0])?.code ?? "", offered.get(b[0])?.code ?? "");
    })
    .slice(0, limit)
    .map(([id]) => id);
  return { day: today, productIds: ranked, source: "history" };
}

/**
 * STABLE FOR THE SHOP DAY. The row a weigher learns in the morning must not reshuffle under their
 * thumb at noon, so once computed for a shop day it is returned unchanged until the day changes.
 * `compute` is not called when the held row is today's. A row is never frozen before there is a
 * catalogue to compute it from (`ready` false returns `prev` as is).
 */
export function frequentForDay(
  prev: FrequentRow | null,
  now: Date,
  ready: boolean,
  // Handed the SAME instant this function judged the day by, so the row's `day` cannot be a
  // different day from the one it is held for.
  compute: (now: Date) => FrequentRow,
): FrequentRow | null {
  if (prev !== null && prev.day === shopToday(now)) return prev;
  if (!ready) return prev;
  return compute(now);
}
