/**
 * WHICH SHOP THIS DEVICE BELONGS TO, kept in the local database.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT PART OF SqliteIdentityStore
 * ---------------------------------------------------------------------------
 * The two rows are the same shape and answer different questions, and the
 * difference is LIFETIME — the same axis on which the identity store argued
 * itself out of the OS keystore, rather than a resemblance to it.
 *
 * The identity ends at a deliberate SIGN-OUT. A shift changes, a person goes
 * home, and the handset stays on the counter belonging to the same yard. The
 * shop ends only when the DEVICE LEAVES THE SHOP — a different event, far
 * rarer, and not built here.
 *
 * Fusing them would mean the sign-out clearing that P1.7 still owes takes the
 * shop with it, and the next person to pick up the handset is asked for a shop
 * code nobody gave them, before they can sign in to the yard they are standing
 * in. Separate rows now is what stops that being an unpicking job later.
 *
 * ---------------------------------------------------------------------------
 * WHY THE DATABASE AND NOT THE KEYSTORE — the same two reasons, both stronger
 * ---------------------------------------------------------------------------
 * LIFETIME: a sign-out DELETES the keystore entry, so a shop stored there would
 * be forgotten by the one event that must NOT forget it.
 * PROVABILITY: `src/device/secureTokenStore.ts` cannot run under node, so a
 * shop kept there could not be exercised before it shipped — and the first
 * evidence it was wrong would be a device asking a yard for a code.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DELIBERATELY DOES NOT HAVE
 * ---------------------------------------------------------------------------
 * NO `clear()`. Leaving a shop is a separate act with its own refusal — it must
 * not proceed while this shop's rows are still unsent, and nothing counts that
 * yet. Adding a bare clear now would give a future caller a way to strand every
 * queued bill on the device with one tap. When that act is built it clears this
 * table and nothing else.
 */
import type { SqlDriver } from "./driver.js";

/** The shop, as the server named it when a code was exchanged for it. */
export interface LocalShop {
  tenant_id: string;
}

interface ShopRow {
  tenant_id: string;
}

export class SqliteShopStore {
  constructor(private readonly db: SqlDriver) {}

  /**
   * The shop this device is set up for, or null when it never has been.
   *
   * MUST NOT THROW on absence. Null is the state every device is in before its
   * first setup, and the boot path reads it before anything else works.
   */
  async load(): Promise<LocalShop | null> {
    const rows = await this.db.all<ShopRow>(
      "SELECT tenant_id FROM local_shop WHERE only_row = 1",
    );
    const row = rows[0];
    return row === undefined ? null : { tenant_id: row.tenant_id };
  }

  /**
   * Record which shop this device belongs to. Called when a typed shop code has
   * been exchanged for a tenant BY THE SERVER, and nowhere else.
   *
   * The value is never derived here and never typed by a person: the operator
   * types a CODE, the server answers with the identifier, and only that answer
   * is stored. A device that guessed its own tenant would write every row it
   * ever produces under a shop nobody confirmed.
   *
   * An upsert on the fixed key rather than delete-then-insert, for the same
   * reason as the identity: the row must never be momentarily absent, because
   * absence is what "this device is not set up" means and a read in that window
   * would send the operator back to a setup screen mid-shift.
   */
  async save(shop: LocalShop, now: Date = new Date()): Promise<void> {
    await this.db.run(
      `INSERT INTO local_shop (only_row, tenant_id, updated_at)
       VALUES (1, ?, ?)
       ON CONFLICT(only_row) DO UPDATE SET
         tenant_id = excluded.tenant_id,
         updated_at = excluded.updated_at`,
      [shop.tenant_id, now.toISOString()],
    );
  }
}
