/**
 * The master-data cache on disk: products with their price tiers, and sellers.
 *
 * Shares the connection with SqliteLocalStore and SqliteDraftStore. Every price
 * is a decimal STRING inside prices_json, a TEXT column — see schema.ts on why a
 * NUMERIC column would silently float them.
 *
 * WHY EACH SAVE IS ONE TRANSACTION. A refresh REPLACES a list: the rows that
 * came back are the whole truth, so a seller the office deleted has to
 * disappear. That is delete-all-then-insert-all, which is three or three hundred
 * statements, and a crash in the middle of it would leave the device holding
 * half a seller list. The timestamp is written inside the SAME transaction, so
 * the age can never describe data other than the data that is actually there —
 * a partial list wearing a fresh stamp is strictly worse than no cache, because
 * the operator would be told it is current.
 *
 * Deliberately NOT an upsert-and-leave-the-rest: that keeps deleted rows forever
 * and there is no tombstone in the API to learn about them from. A seller who
 * has been removed must stop being pickable, and a bill already filed to them is
 * a separate problem the server answers (422) rather than one the cache hides.
 */
import type { MasterProduct, MasterSeller, MasterSnapshot, MasterStore } from "../../master/types.js";
import type { SqlDriver } from "./driver.js";
import { initConnection } from "./schema.js";

/** The two keys in master_cache. Not a free string at the call sites. */
const PRODUCTS = "products";
const SELLERS = "sellers";

interface StampRow {
  kind: string;
  fetched_at: string;
}

interface ProductRow {
  id: string;
  code: string;
  name: string;
  uom_code: string;
  uom_name: string;
  prices_json: string;
}

interface SellerRow {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  grade: string | null;
}

/**
 * A tier map read back from disk, defended against a row that is not what we
 * wrote. A corrupt prices_json must degrade to "this product has no tiers" —
 * which fails BLANK at the price field, the same as a grade with no row — and
 * never to a throw that takes the whole cache load (and therefore the boot) with
 * it. Non-string values are dropped rather than coerced: a number here would be
 * a float that had already lost precision, and putting it back into a money path
 * is the exact thing hard rule 1 forbids.
 */
function parsePrices(json: string): Record<string, string> {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [grade, price] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof price === "string") out[grade] = price;
  }
  return out;
}

export class SqliteMasterStore implements MasterStore {
  private constructor(private readonly db: SqlDriver) {}

  static async open(db: SqlDriver): Promise<SqliteMasterStore> {
    await initConnection(db);
    return new SqliteMasterStore(db);
  }

  async load(): Promise<MasterSnapshot> {
    const stamps = await this.db.all<StampRow>("SELECT kind, fetched_at FROM master_cache");
    const at = (kind: string): string | null =>
      stamps.find((s) => s.kind === kind)?.fetched_at ?? null;

    const products = await this.db.all<ProductRow>(
      "SELECT id, code, name, uom_code, uom_name, prices_json FROM cached_products ORDER BY code, id",
    );
    const sellers = await this.db.all<SellerRow>(
      "SELECT id, code, name, phone, grade FROM cached_sellers ORDER BY code, id",
    );

    return {
      products: products.map(
        (r): MasterProduct => ({
          id: r.id,
          code: r.code,
          name: r.name,
          uom_code: r.uom_code,
          uom_name: r.uom_name,
          prices: parsePrices(r.prices_json),
        }),
      ),
      sellers: sellers.map(
        (r): MasterSeller => ({
          id: r.id,
          code: r.code,
          name: r.name,
          phone: r.phone,
          grade: r.grade,
        }),
      ),
      productsFetchedAt: at(PRODUCTS),
      sellersFetchedAt: at(SELLERS),
    };
  }

  async saveProducts(products: readonly MasterProduct[], fetchedAt: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.run("DELETE FROM cached_products");
      for (const p of products) {
        await tx.run(
          "INSERT INTO cached_products (id, code, name, uom_code, uom_name, prices_json)" +
            " VALUES (?, ?, ?, ?, ?, ?)",
          [p.id, p.code, p.name, p.uom_code, p.uom_name, JSON.stringify(p.prices)],
        );
      }
      await stamp(tx, PRODUCTS, fetchedAt);
    });
  }

  async saveSellers(sellers: readonly MasterSeller[], fetchedAt: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.run("DELETE FROM cached_sellers");
      for (const s of sellers) {
        await tx.run(
          "INSERT INTO cached_sellers (id, code, name, phone, grade) VALUES (?, ?, ?, ?, ?)",
          [s.id, s.code, s.name, s.phone, s.grade],
        );
      }
      await stamp(tx, SELLERS, fetchedAt);
    });
  }
}

/** The timestamp, written inside the caller's transaction and never outside it. */
async function stamp(
  tx: { run: (sql: string, params?: readonly (string | number | null)[]) => Promise<unknown> },
  kind: string,
  fetchedAt: string,
): Promise<void> {
  await tx.run(
    "INSERT INTO master_cache (kind, fetched_at) VALUES (?, ?)" +
      " ON CONFLICT (kind) DO UPDATE SET fetched_at = excluded.fetched_at",
    [kind, fetchedAt],
  );
}
