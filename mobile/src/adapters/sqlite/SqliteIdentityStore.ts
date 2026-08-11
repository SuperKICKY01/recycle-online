/**
 * WHO THIS DEVICE IS SIGNED IN AS, kept in the local database.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT THE KEYSTORE, WHICH IS WHERE THE TOKEN LIVES
 * ---------------------------------------------------------------------------
 * Two reasons, and the second is the one that decided it.
 *
 * LIFETIME. The identity has to outlive the token. A token expires within the
 * hour and is deliberately KEPT in the keystore when it does — App.tsx states
 * that choice and its reason — while a sign-out DELETES the keystore entry
 * (session/signOut.ts). So keystore presence is already not a proxy for "signed
 * in", and an identity stored beside the token would inherit the token's
 * lifetime, which is the opposite of what ownership needs.
 *
 * PROVABILITY, and this is the deciding one. `src/device/secureTokenStore.ts`
 * cannot run under node at all — expo-secure-store is a native module, no proof
 * reaches it, and its own header says so. An identity kept there could not be
 * exercised before it shipped: the first evidence it worked would be a shop's
 * bills carrying the wrong owner, on a device nobody can open to check
 * (ARCHITECTURE.md section 11). The local database is what every headless proof
 * already drives, so an identity here is provable on this box today.
 *
 * ---------------------------------------------------------------------------
 * NOTHING RECONCILES THIS AGAINST THE TOKEN, AND NOTHING MAY
 * ---------------------------------------------------------------------------
 * It is WRITTEN when a login succeeds, READ when a row is written, and REMOVED
 * only by a deliberate sign-out. There is no third operation and no comparison
 * with the token anywhere. A reconciliation point would reintroduce exactly the
 * coupling this store exists to remove: an expired token would start meaning
 * "no owner", and a bill weighed on an offline morning would take an unknown
 * owner and park for a reason that has nothing to do with who wrote it.
 *
 * ONE ROW, ENFORCED BY THE SCHEMA rather than by this class remembering: the
 * table's primary key is `only_row` with `CHECK (only_row = 1)`, so a second
 * identity is unrepresentable rather than merely unwritten.
 */
import type { SqlDriver } from "./driver.js";

/**
 * The pair a bill's ownership is keyed by. Both are the SERVER's identifiers,
 * copied from a successful login — never derived, never parsed out of a token
 * this client cannot verify.
 */
export interface LocalIdentity {
  tenant_id: string;
  user_id: string;
}

interface IdentityRow {
  tenant_id: string;
  user_id: string;
}

export class SqliteIdentityStore {
  constructor(private readonly db: SqlDriver) {}

  /**
   * The stored identity, or null when this device has never signed in.
   *
   * MUST NOT THROW on absence. Null is a first-class answer — it is the state
   * every device is in before its first login and after a sign-out, and a boot
   * path cannot fail on it.
   */
  async load(): Promise<LocalIdentity | null> {
    const rows = await this.db.all<IdentityRow>(
      "SELECT tenant_id, user_id FROM local_identity WHERE only_row = 1",
    );
    const row = rows[0];
    return row === undefined ? null : { tenant_id: row.tenant_id, user_id: row.user_id };
  }

  /**
   * Record who is signed in. Called on a successful login and nowhere else.
   *
   * An upsert on the fixed key rather than delete-then-insert: the row must
   * never be momentarily absent, because absence is what "unknown owner" means
   * and a bill written in that window would park for no reason.
   */
  async save(identity: LocalIdentity, now: Date = new Date()): Promise<void> {
    await this.db.run(
      `INSERT INTO local_identity (only_row, tenant_id, user_id, updated_at)
       VALUES (1, ?, ?, ?)
       ON CONFLICT(only_row) DO UPDATE SET
         tenant_id = excluded.tenant_id,
         user_id = excluded.user_id,
         updated_at = excluded.updated_at`,
      [identity.tenant_id, identity.user_id, now.toISOString()],
    );
  }

  /**
   * Forget who is signed in. THE ONLY thing that removes it, and it belongs to
   * a deliberate sign-out — not to an expiry, not to a keystore clear, not to a
   * refused request.
   */
  async clear(): Promise<void> {
    await this.db.run("DELETE FROM local_identity WHERE only_row = 1");
  }
}
