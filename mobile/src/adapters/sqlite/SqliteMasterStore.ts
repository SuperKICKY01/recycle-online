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
import type { SqlDriver, SqlTx } from "./driver.js";
import { initConnection } from "./schema.js";
import { SqliteIdentityStore } from "./SqliteIdentityStore.js";

/** The two keys in master_cache. Not a free string at the call sites. */
const PRODUCTS = "products";
const SELLERS = "sellers";

/**
 * The row-selection clause every cache READ carries. Tenant only — prices belong
 * to the shop and not to a person, so there is deliberately no user half here
 * and no equivalent of local_bills' OWNED_BY_CURRENT pair.
 *
 * A NULL TENANT IS A MISMATCH, and SQL's three-valued logic is what makes that
 * true without a special case — exactly the argument SqliteLocalStore makes for
 * OWNED_BY_CURRENT. `owner_tenant_id = NULL` is NULL, NULL is not TRUE, and the
 * row is not selected. So all four states fall out of one clause: this shop's
 * row (selected), another shop's row (excluded), a row written before the column
 * existed (excluded), and no identity on the device at all, where the bound
 * value is NULL and nothing is selected. That last case fails CLOSED.
 */
const CACHE_TENANT_MATCHES = "owner_tenant_id = ?";

interface StampRow {
  kind: string;
  fetched_at: string;
  owner_tenant_id: string | null;
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

/**
 * DOES THIS ROW BELONG TO THE SHOP THAT IS SIGNED IN?
 *
 * The TypeScript half of `CACHE_TENANT_MATCHES`, and it must mean exactly what
 * the SQL means — including for NULL, where `===` alone would get it backwards.
 * Two unknown tenants are NOT the same tenant: `null === null` is true in
 * JavaScript and would make a device with no identity match every row written
 * before the column existed, which is the one comparison this whole change
 * exists to refuse. Both sides must be KNOWN and equal.
 *
 * Written out rather than inlined because it is a CONVENTION, not arithmetic —
 * a second author given only "the tenant must match" could reasonably write
 * `a === b` and be wrong only in the null case, which is the case that ships.
 * lessons/a-checker-must-not-share-the-code-it-checks.md.
 */
function sameTenant(rowTenant: string | null, current: string | null): boolean {
  return rowTenant !== null && current !== null && rowTenant === current;
}

/** What one kind's fetch stamp says, once the tenant has been taken into account. */
interface StampReading {
  /** Null means ABSENT — never fetched, or not confirmed to be this shop's. */
  fetchedAt: string | null;
  /** Which of those two absences this is. See MasterSnapshot on the naming. */
  notThisShop: boolean;
}

/**
 * ABSENT, NOT STALE — THE ONE PLACE THAT RULE IS APPLIED.
 *
 * A tenant mismatch returns `fetchedAt: null`, which every reader downstream
 * already treats as NEVER FETCHED: `assessFreshness` maps it to `empty`,
 * `masterNotice` draws the `block` tone, and App.tsx disables the start-bill
 * button on that state. So the stop is INHERITED from machinery that already
 * exists and is already proven, rather than being a second gate that could
 * disagree with the first.
 *
 * Returning an old timestamp instead would route the same rows through the
 * STALE path, which says "usable, just old" and lets the bill be written — and
 * another shop's price is not an old price, it is a wrong one, paid in cash
 * against the screen (ROADMAP.md section P1.7, "THE CACHE IS THE HEAVIEST HALF").
 *
 * The stamps are read UNFILTERED so this can tell the two absences apart at all:
 * a filtered read returns nothing in both cases and cannot say which happened.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS COSTS ON AN UPGRADED HANDSET — THE FIRST OFFLINE MORNING CANNOT TRADE
 * ---------------------------------------------------------------------------
 * A device whose cache was written before the tenant column existed carries
 * NULL on every cached row. NULL is not this shop's — that is the rule, not an
 * edge case — so every one of those rows reads as ABSENT, and the yard CANNOT
 * WEIGH until a refresh succeeds. A refresh needs a connection. So the first
 * morning after an upgrade, with no signal, the shop cannot trade at all: not a
 * degraded mode, not stale prices, no bills.
 *
 * That is the decided rule doing exactly what it says, and it is not to be
 * softened here. The opposite direction is the reason: treating an unknown
 * tenant as OURS would hand the person at the scale another shop's price list
 * to pay cash against, on a handset nobody can open afterwards
 * (ARCHITECTURE.md section 11) — the wrong money leaves the drawer and no audit
 * ever finds it. A morning of lost trading is visible and recoverable; a
 * mispriced load is neither. Whoever is tempted to relax this must move the
 * DECISION in ROADMAP.md section P1.7 first, not this function.
 *
 * DELIBERATELY NOT PINNED TO A SHA. This paragraph ships in the same commit as
 * the behaviour it describes, so there is no sha yet that means what it would
 * need to mean, and HEAD would name the commit that does NOT contain it —
 * CLAUDE.md section Conventions "PIN A CLAIM TO A COMMIT". Decided 2026-08-11;
 * anchor it in a later pass.
 */
function readStamp(
  stamps: readonly StampRow[],
  kind: string,
  tenant: string | null,
): StampReading {
  const row = stamps.find((s) => s.kind === kind);
  if (row === undefined) return { fetchedAt: null, notThisShop: false };
  if (!sameTenant(row.owner_tenant_id, tenant)) {
    return { fetchedAt: null, notThisShop: true };
  }
  return { fetchedAt: row.fetched_at, notThisShop: false };
}

export class SqliteMasterStore implements MasterStore {
  private constructor(
    private readonly db: SqlDriver,
    private readonly identity: SqliteIdentityStore,
  ) {}

  /**
   * WHICH SHOP THIS DEVICE IS SIGNED IN TO, READ FRESH FOR EVERY CACHE
   * STATEMENT. Mirrors SqliteLocalStore.currentOwner and for the same reason: a
   * value captured at open() is a second copy that goes stale at exactly the
   * moment that matters, when the handset changes shops.
   *
   * ONLY THE TENANT IS TAKEN. The user half of the identity is deliberately
   * dropped here — prices belong to the shop, and keying the cache to a person
   * would throw away a perfectly good price list every time the phone changed
   * hands between two staff at one yard.
   *
   * READ OUTSIDE ANY TRANSACTION, ALWAYS. This goes through `this.db`, and
   * driver.ts states that a statement issued on the driver from inside a
   * transaction body re-enters the connection lock and DEADLOCKS. Every caller
   * below therefore reads the tenant BEFORE opening its transaction, which also
   * gives the write a single value for the whole save — so rows and stamp can
   * never disagree about which shop they describe.
   */
  private async currentTenant(): Promise<string | null> {
    return (await this.identity.load())?.tenant_id ?? null;
  }

  static async open(db: SqlDriver): Promise<SqliteMasterStore> {
    await initConnection(db);
    // The SAME driver, so the identity is read on the connection the filtered
    // statements run on — never a second connection with a different view.
    return new SqliteMasterStore(db, new SqliteIdentityStore(db));
  }

  async load(): Promise<MasterSnapshot> {
    const tenant = await this.currentTenant();
    // UNFILTERED on purpose — see readStamp. The tenant is applied in TypeScript
    // here so the two KINDS of absence stay distinguishable.
    const stamps = await this.db.all<StampRow>(
      "SELECT kind, fetched_at, owner_tenant_id FROM master_cache",
    );
    const productStamp = readStamp(stamps, PRODUCTS, tenant);
    const sellerStamp = readStamp(stamps, SELLERS, tenant);

    // FILTERED IN SQL, which is a SECOND mechanism and not a redundant one: it
    // means another shop's rows cannot reach the screen even if the stamp were
    // wrong or missing. The two are asserted separately in proveCacheTenant —
    // two mechanisms guarding one observable make a green about whichever still
    // works (lessons/a-green-cell-is-evidence-about-the-assertion-not-the-claim.md).
    const products = await this.db.all<ProductRow>(
      "SELECT id, code, name, uom_code, uom_name, prices_json FROM cached_products" +
        ` WHERE ${CACHE_TENANT_MATCHES} ORDER BY code, id`,
      [tenant],
    );
    const sellers = await this.db.all<SellerRow>(
      "SELECT id, code, name, phone, grade FROM cached_sellers" +
        ` WHERE ${CACHE_TENANT_MATCHES} ORDER BY code, id`,
      [tenant],
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
      productsFetchedAt: productStamp.fetchedAt,
      sellersFetchedAt: sellerStamp.fetchedAt,
      productsNotThisShop: productStamp.notThisShop,
      sellersNotThisShop: sellerStamp.notThisShop,
    };
  }

  /**
   * `owner_tenant_id` is stamped from the identity, or NULL when this device has
   * never recorded a login. NEVER A GUESS: a tenant invented here is
   * indistinguishable from a recorded one afterwards, and it would put another
   * shop's prices on screen wearing this shop's name — the exact failure the
   * column exists to make impossible. NULL reads as a mismatch and the cache
   * reads ABSENT, which stops weighing; that is the fail-closed direction.
   *
   * THE DELETE STAYS UNCONDITIONAL. Scoping it to the current tenant would be
   * the obvious symmetry and it is wrong: the other shop's rows would then sit
   * on the device for ever, invisible to every read and waiting for the day
   * somebody widens a predicate. A refresh is authoritative and clears the table.
   */
  async saveProducts(products: readonly MasterProduct[], fetchedAt: string): Promise<void> {
    const tenant = await this.currentTenant();
    await this.db.transaction(async (tx) => {
      await tx.run("DELETE FROM cached_products");
      for (const p of products) {
        await tx.run(
          "INSERT INTO cached_products" +
            " (id, code, name, uom_code, uom_name, prices_json, owner_tenant_id)" +
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
          [p.id, p.code, p.name, p.uom_code, p.uom_name, JSON.stringify(p.prices), tenant],
        );
      }
      await stamp(tx, PRODUCTS, fetchedAt, tenant);
    });
  }

  async saveSellers(sellers: readonly MasterSeller[], fetchedAt: string): Promise<void> {
    const tenant = await this.currentTenant();
    await this.db.transaction(async (tx) => {
      await tx.run("DELETE FROM cached_sellers");
      for (const s of sellers) {
        await tx.run(
          "INSERT INTO cached_sellers (id, code, name, phone, grade, owner_tenant_id)" +
            " VALUES (?, ?, ?, ?, ?, ?)",
          [s.id, s.code, s.name, s.phone, s.grade, tenant],
        );
      }
      await stamp(tx, SELLERS, fetchedAt, tenant);
    });
  }
}

/**
 * The timestamp AND the shop it describes, written inside the caller's
 * transaction and never outside it.
 *
 * ---------------------------------------------------------------------------
 * TWO UPSERTS THAT LOOK ALIKE AND NEED OPPOSITE ANSWERS. READ BOTH BEFORE
 * EDITING EITHER.
 * ---------------------------------------------------------------------------
 * THIS ONE — `INSERT INTO master_cache ... ON CONFLICT (kind) DO UPDATE` —
 * MUST carry `owner_tenant_id` forward in its DO UPDATE set.
 * THE OTHER — `INSERT INTO local_draft ... ON CONFLICT (id) DO UPDATE` in
 * `SqliteDraftStore.save` — MUST NOT carry `owner_tenant_id`/`owner_user_id`,
 * and says so at its own site.
 *
 * They are the same construct, on adjacent tables, with the same column name,
 * and copying either onto the other produces a silent money-shaped defect. The
 * reasons are not symmetrical, and the reason is the whole distinction:
 *
 *   HERE the row is keyed on `kind` and DESCRIBES WHATEVER WAS LAST FETCHED. A
 *   device that changes shops updates the existing 'products' row rather than
 *   inserting one. Setting only `fetched_at` would leave the OLD shop's tenant
 *   on a stamp describing the NEW shop's rows, and the reader would report a
 *   successful, current refresh as ABSENT — stopping a yard whose data is
 *   perfectly good. The column must move with the rows it describes, or it
 *   describes rows that no longer exist.
 *
 *   THERE the pair RECORDS WHO CREATED THAT ROW. A draft is keyed on its own
 *   id and every save after the first happens on a keystroke, so listing the
 *   owner would mean the next character typed at a shift change silently
 *   reattributes the cart to whoever is signed in now — erasing the fact that
 *   somebody else opened it, with nothing on the device ever showing it. The
 *   column must NOT follow whoever touches the row next.
 *
 * The test that separates them: does this column describe the ROW'S CONTENT, or
 * the ROW'S ORIGIN? Content follows a rewrite; origin never does.
 *
 * DELIBERATELY NOT PINNED TO A SHA, for the reason given at `readStamp` above:
 * this ships in the commit it describes. Written 2026-08-11.
 */
async function stamp(
  tx: SqlTx,
  kind: string,
  fetchedAt: string,
  tenant: string | null,
): Promise<void> {
  await tx.run(
    "INSERT INTO master_cache (kind, fetched_at, owner_tenant_id) VALUES (?, ?, ?)" +
      " ON CONFLICT (kind) DO UPDATE SET fetched_at = excluded.fetched_at," +
      " owner_tenant_id = excluded.owner_tenant_id",
    [kind, fetchedAt, tenant],
  );
}
