/**
 * Master data as the DEVICE holds it. PURE TypeScript — no React Native, no
 * Expo, no node — so the headless proof exercises exactly what the phone runs.
 *
 * WHY THESE TYPES EXIST WHEN app/api.ts ALREADY HAS Product AND Seller.
 * Same reason as SellerOption in cart/sellers.ts: app/api.ts reaches
 * expo-constants through ./config, so anything typed against it is unreachable
 * by a proof. These are the shapes the CACHE stores and the rules operate on,
 * and app/api.ts's types satisfy them structurally — there is no conversion.
 *
 * Every price is a decimal STRING and stays one, here and in the database.
 * Nothing in the master-data path parses money into a number.
 */

export interface MasterProduct {
  id: string;
  code: string;
  name: string;
  uom_code: string;
  uom_name: string;
  /** grade -> price, e.g. { A: "15.50", B: "15.00" }. Strings, always. */
  prices: Record<string, string>;
}

export interface MasterSeller {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  /** Selects which product price tier applies (SRS 1.6). May be null. */
  grade: string | null;
}

/**
 * What the device knows right now, and WHEN it learned it.
 *
 * The two timestamps are separate and that is the point. A refresh can succeed
 * for one list and fail for the other — different requests, one connection that
 * may die between them — and stamping a shared "last refreshed" would then
 * claim freshness for data that was never re-read. The price default is gated on
 * the OLDER of the two (see freshness.ts), because a price default needs BOTH: a
 * product's tier list and the seller's grade to pick a tier from it.
 *
 * Null means NEVER FETCHED, not "fetched long ago". A device that has never
 * spoken to the server cannot start a bill at all, and that is a different
 * sentence to the operator than "your prices are old".
 */
export interface MasterSnapshot {
  products: MasterProduct[];
  sellers: MasterSeller[];
  productsFetchedAt: string | null;
  sellersFetchedAt: string | null;
  /**
   * THE LIST IS ABSENT *BECAUSE IT IS NOT THIS SHOP'S* — not because it was
   * never fetched. Both are absences and both stop a bill; they are separated
   * only so the operator can be told which one they are in, because the remedies
   * differ (fetch this shop's list, versus fetch a list at all).
   *
   * NOT NAMED "fromOtherShop", and the difference is a claim the screen makes.
   * It covers two rows: one stamped with a DIFFERENT tenant, and one stamped with
   * NO tenant — a list cached before the column existed, on an upgraded handset.
   * The second is probably this shop's own data; we simply cannot confirm it. So
   * the honest predicate, and the one the operator is told, is "not confirmed to
   * be this shop's", never "belongs to somebody else".
   *
   * INVARIANT, and the proof asserts it: this is never true beside a non-null
   * fetch stamp. A tenant mismatch clears the stamp — that IS the absent rule —
   * so "not this shop's" and "we have a usable list" cannot both hold.
   */
  productsNotThisShop: boolean;
  sellersNotThisShop: boolean;
}

/**
 * Durable master-data cache.
 *
 * The two saves are separate for the reason above. Each one must be ATOMIC —
 * rows and the timestamp together — or a crash mid-write leaves a partial list
 * wearing a fresh timestamp, which is worse than no cache at all: the operator
 * would be told the data is current while half of it is missing.
 */
export interface MasterStore {
  load(): Promise<MasterSnapshot>;
  saveProducts(products: readonly MasterProduct[], fetchedAt: string): Promise<void>;
  saveSellers(sellers: readonly MasterSeller[], fetchedAt: string): Promise<void>;
}
