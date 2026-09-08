/**
 * THE SHOP'S COUNTER POLICY ON DISK — one row, refreshed like master data
 * (STRUCTURE.md 1.4, the cashier-counter unit).
 *
 * A SEPARATE STORE FROM SqliteShopStore, and the same argument that store makes
 * against SqliteIdentityStore: same shape, different LIFETIME. `local_shop` is
 * set once when a shop code is exchanged and outlives every sign-out; this row is
 * REFRESHED on the same schedule as products, sellers and tiers (App.tsx's
 * refreshMaster), and a stale one is a display concern, never an identity one. It
 * sits with the refresh cache, not with the device's identity.
 *
 * WHAT IT IS FOR. The counter entry must decide OFFLINE whether to draw itself,
 * and `separate_cashier` is not on GET /shop's branch payload (branch_payload
 * pins five identity keys, branches.py). So it arrives through GET /shop/policy
 * and lands here, and the entry reads it with no network.
 *
 * DISPLAY-ONLY, FAILS OPEN (the owner's ruling 2). Three states collapse to one
 * "unknown", and all three DRAW the entry: no row (never refreshed), a row for a
 * DIFFERENT tenant (the read predicate carries tenant_id, so a mismatch is unknown
 * and never another shop's policy — the master_cache rule), and a row whose
 * separate_cashier is NULL (an unscoped owner with no single branch). Only a row
 * for THIS tenant that says the switch is OFF hides the entry — and even a wrong
 * "off" costs at most an empty queue, because with the switch off the unpaid queue
 * is empty by construction (bills.py list_bills). There is NO freshness gate on
 * purpose: separate_cashier supplies no value the yard pays against, so it is not a
 * price claim under the 12-hour rule (cached-master-data-is-a-price-claim.md).
 */
import type { SqlDriver } from "./driver.js";

/** The counter policy as this device last learned it. `null` from read() means
 *  UNKNOWN (absent, another tenant, or no single branch) — the entry fails open. */
export interface ShopPolicy {
  separate_cashier: boolean;
}

interface PolicyRow {
  separate_cashier: number | null;
}

export class SqliteShopPolicyStore {
  constructor(private readonly db: SqlDriver) {}

  /**
   * The counter policy for THIS tenant, or null when it is unknown. Null is the
   * fail-open state and MUST NOT THROW on absence — the boot path and the entry
   * gate both read it before a network is available.
   *
   * A row exists but separate_cashier is NULL → null (unknown): an unscoped owner
   * of a multi-yard shop has no single branch, so the server sent no policy.
   */
  async read(tenantId: string): Promise<ShopPolicy | null> {
    const rows = await this.db.all<PolicyRow>(
      "SELECT separate_cashier FROM cached_shop_policy WHERE only_row = 1 AND tenant_id = ?",
      [tenantId],
    );
    const row = rows[0];
    if (row === undefined || row.separate_cashier === null) return null;
    return { separate_cashier: row.separate_cashier !== 0 };
  }

  /**
   * Record the counter policy for THIS tenant, from a GET /shop/policy answer.
   * `separateCashier` null (the server had no single branch for the caller) is
   * stored as NULL, which read() surfaces as unknown. An upsert on the fixed key,
   * so the previous shop's policy is overwritten wholesale when the device changes
   * shop rather than lingering under a stale tenant_id.
   */
  async save(
    tenantId: string,
    separateCashier: boolean | null,
    now: Date = new Date(),
  ): Promise<void> {
    const value = separateCashier === null ? null : separateCashier ? 1 : 0;
    await this.db.run(
      `INSERT INTO cached_shop_policy (only_row, tenant_id, separate_cashier, fetched_at)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(only_row) DO UPDATE SET
         tenant_id = excluded.tenant_id,
         separate_cashier = excluded.separate_cashier,
         fetched_at = excluded.fetched_at`,
      [tenantId, value, now.toISOString()],
    );
  }
}
