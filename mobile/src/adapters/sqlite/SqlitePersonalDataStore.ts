/**
 * WHAT A SIGN-OUT ERASES FROM THIS DEVICE (D1, ADVISOR-DECIDED 2026-10-23).
 *
 * A yard phone is shared and can be lost. Once the person signing out owes nothing, the device
 * keeps what the NEXT person needs to work offline and what OTHER people's queued work needs to be
 * sent, and lets go of the rest: who was signed in, and the sellers' contact data and ID numbers.
 *
 * TABLE BY TABLE, and the reason for each -- `npm run prove:signoutclear` asserts every line:
 *
 *   CLEARED
 *   local_identity      the row is deleted. The next sign-in writes the next person's.
 *   cached_sellers      phone -> NULL. Name, code, grade, last four and truck stay: they are what the
 *                       picker searches offline, and the next sign-in's refresh rewrites the table.
 *   local_sellers       in a SETTLED or REFUSED row: phone, address and id_number -> NULL (H3 already
 *                       drops a settled row's ID; a refused row still held the full ID as typed).
 *                       A REFUSED row is then DELETED unless a parked bill still names it or a code
 *                       is still bound to it -- either would be stranded by the delete.
 *   KEPT
 *   local_sellers       an OWED row (pending/syncing), whoever created it: its phone and ID are the
 *                       create the server has not received yet. The gate refuses while the person
 *                       signing out owes one; another person's stays for them.
 *   local_bills         every row. A bill carries a seller id and a truck plate, no phone, name or
 *                       ID (sync/types.ts BillPayload). Unsent and refused bills are money the server
 *                       has no record of and must never be lost; synced ones are the bill cards and
 *                       the rows an offline void is recorded against (SqliteLocalStore.requestVoid).
 *   local_draft(_lines) the open cart: a seller id, a plate and weighed lines, not yet a bill.
 *   local_shop, local_device, local_reserve, local_seller_codes   the DEVICE's, and they must
 *                       outlive a sign-out (schema.ts says why at each).
 *   master_cache, cached_products, cached_grade_tiers, cached_shop_policy   the shop's price data.
 *   cached_permissions  cleared, but by App.tsx's sign-out handler (SqlitePermissionStore.clear).
 *
 * ONE TRANSACTION: all of it or none of it. The checkpoint after it is H3's: secure_delete zeroes the
 * values in the pages these statements write, and TRUNCATE empties the WAL frames that still hold
 * the old ones (SqliteLocalSellerStore.markSellerCreated says why it runs outside the transaction).
 */
import type { ClearOutcome } from "../../session/tokenStore.js";
import type { SqlDriver } from "./driver.js";

export const CLEAR_PERSONAL_DATA: readonly string[] = [
  "DELETE FROM local_identity",
  "UPDATE cached_sellers SET phone = NULL WHERE phone IS NOT NULL",
  `UPDATE local_sellers SET phone = NULL, address = NULL, id_number = NULL
   WHERE sync_state IN ('synced', 'failed')
     AND (phone IS NOT NULL OR address IS NOT NULL OR id_number IS NOT NULL)`,
  `DELETE FROM local_sellers
   WHERE sync_state = 'failed'
     AND NOT EXISTS (SELECT 1 FROM local_bills b
                     WHERE b.local_seller_id = local_sellers.id AND b.local_seller_parked_at IS NOT NULL)
     AND NOT EXISTS (SELECT 1 FROM local_seller_codes c WHERE c.spent_on = local_sellers.id)`,
];

export class SqlitePersonalDataStore {
  constructor(private readonly db: SqlDriver) {}

  /** Reports rather than throws: signOut() decides what a failure means (session/signOut.ts). */
  async clear(): Promise<ClearOutcome> {
    try {
      await this.db.transaction(async (tx) => {
        for (const sql of CLEAR_PERSONAL_DATA) await tx.run(sql);
      });
    } catch (err) {
      return { kind: "failed", reason: err instanceof Error ? err.message : String(err) };
    }
    // After the commit the rows ARE cleared, so a checkpoint that cannot run does not turn this into
    // a failure: the old frames then leave the WAL at SQLite's next automatic checkpoint or the close.
    try {
      await this.db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    } catch {
      // see above
    }
    return { kind: "cleared" };
  }
}
