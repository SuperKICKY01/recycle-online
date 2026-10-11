/**
 * PRODUCTS, JOINED TO THEIR CATEGORIES ON THE DEVICE (cart milestone, 2026-10-12).
 *
 * `GET /products` carries each product's `category_id` but not its name; `GET
 * /product-categories` (ACTIVE categories, readable by any signed-in user) carries the names.
 * The join happens here, once, at fetch time, and the cache stores the result — so category
 * browse and search work offline exactly as the price list does.
 *
 * A product whose category is not in the active list (retired, or the category fetch failed)
 * gets `category: null`: it is listed under `ทั้งหมด` and found by name or code, never dropped.
 * Pure: no React Native, no fetch — the node proof drives exactly this.
 */
import type { MasterCategoryRef, MasterProduct } from "./types.js";

/** A product exactly as `GET /products` sends it (the fields this join reads). */
export interface WireProduct extends Omit<MasterProduct, "category"> {
  category_id?: string | null;
}

/** A category exactly as `GET /product-categories` sends it. */
export interface WireCategory {
  id: string;
  code: string;
  name: string;
  is_active?: boolean;
}

export function joinCategories(
  products: readonly WireProduct[],
  categories: readonly WireCategory[],
): MasterProduct[] {
  const byId = new Map<string, MasterCategoryRef>();
  for (const c of categories) {
    if (c.is_active === false) continue;
    byId.set(c.id, { id: c.id, code: c.code, name: c.name });
  }
  return products.map((p) => {
    const { category_id, ...rest } = p;
    const ref = category_id == null ? undefined : byId.get(category_id);
    return { ...rest, category: ref ?? null };
  });
}
