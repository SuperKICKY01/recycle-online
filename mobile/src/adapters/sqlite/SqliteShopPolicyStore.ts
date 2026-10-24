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
import { DEFAULT_MONEY_RULES } from "../../cart/moneyRules.js";
import type { MoneyRules } from "../../cart/moneyRules.js";
import { DEDUCTION_SETTINGS, ROUNDING_RULES } from "../../money/lineRules.js";
import type { DeductionSetting, RoundingRule } from "../../money/lineRules.js";
import type { SqlDriver } from "./driver.js";

interface MoneyRow {
  rounding_rule: string | null;
  deduction_mode: string | null;
  deduction_reason_required: number | null;
}

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
  /**
   * THE SHOP'S MONEY RULES for THIS tenant (server migration 0027), or the pre-0027 rule when none
   * is known: no row, another tenant's row, or a row refreshed before the columns existed. That
   * default is not invented -- it is the rule every shop is under until its owner changes one, and
   * the rule every build before 0027 priced with -- and the line DECLARES whichever rule it used,
   * so the server records it exactly (src/cart/moneyRules.ts says why any age is acceptable). A
   * value outside the known sets is treated as unknown, never coerced.
   */
  async readMoneyRules(tenantId: string): Promise<MoneyRules> {
    const rows = await this.db.all<MoneyRow>(
      "SELECT rounding_rule, deduction_mode, deduction_reason_required FROM cached_shop_policy" +
        " WHERE only_row = 1 AND tenant_id = ?",
      [tenantId],
    );
    const r = rows[0];
    if (r === undefined) return DEFAULT_MONEY_RULES;
    const rule = r.rounding_rule;
    const mode = r.deduction_mode;
    if (rule === null || !(ROUNDING_RULES as readonly string[]).includes(rule)) return DEFAULT_MONEY_RULES;
    if (mode === null || !(DEDUCTION_SETTINGS as readonly string[]).includes(mode)) return DEFAULT_MONEY_RULES;
    return {
      rounding_rule: rule as RoundingRule,
      deduction_mode: mode as DeductionSetting,
      deduction_reason_required: r.deduction_reason_required === 1,
    };
  }

  /**
   * Record the money rules from the SAME GET /shop/policy answer, after save() has written the row
   * for this tenant. An UPDATE keyed on the tenant, so a row belonging to another shop is never
   * given this shop's rules; nothing is written when the server sent none (an older server).
   */
  async saveMoneyRules(tenantId: string, rules: MoneyRules | null): Promise<void> {
    if (rules === null) return;
    await this.db.run(
      "UPDATE cached_shop_policy SET rounding_rule = ?, deduction_mode = ?, deduction_reason_required = ?" +
        " WHERE only_row = 1 AND tenant_id = ?",
      [rules.rounding_rule, rules.deduction_mode, rules.deduction_reason_required ? 1 : 0, tenantId],
    );
  }

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
         -- 0027: another shop's money rules must not survive under this shop's id. Kept only when
         -- the tenant is unchanged; saveMoneyRules writes this shop's next.
         rounding_rule = CASE WHEN cached_shop_policy.tenant_id = excluded.tenant_id
                              THEN cached_shop_policy.rounding_rule END,
         deduction_mode = CASE WHEN cached_shop_policy.tenant_id = excluded.tenant_id
                               THEN cached_shop_policy.deduction_mode END,
         deduction_reason_required = CASE WHEN cached_shop_policy.tenant_id = excluded.tenant_id
                                          THEN cached_shop_policy.deduction_reason_required END,
         tenant_id = excluded.tenant_id,
         separate_cashier = excluded.separate_cashier,
         fetched_at = excluded.fetched_at`,
      [tenantId, value, now.toISOString()],
    );
  }
}
