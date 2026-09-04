/**
 * THE PERMISSION CACHE — what the server last said this USER may do, kept in the
 * local database so a cold start with the server unreachable gates its controls
 * on the freshest answer the device holds (server migration 0019, STRUCTURE.md
 * section 3.3).
 *
 * ---------------------------------------------------------------------------
 * WHY A CACHE WHEN THE TOKEN ALREADY CARRIES THE SET
 * ---------------------------------------------------------------------------
 * The token's `permissions` claim is frozen for the token's lifetime, an hour.
 * `/whoami` answers with the set the server resolved NOW, and the app asks it at
 * boot when online and whenever the account screen opens. This table is where
 * that fresher answer survives a relaunch: a grant revoked at 10:00 and learned
 * at 10:01 still hides the control at 10:05 after a force-stop, although the
 * token in the keystore still claims it until 11:00.
 *
 * ---------------------------------------------------------------------------
 * KEYED ON THE USER, NOT ONE ROW — the owner's decision 7, 2026-09-04
 * ---------------------------------------------------------------------------
 * Section 3.3 sketched `cached_permissions(permission TEXT PRIMARY KEY)`. A
 * crash between storing a NEW user's token and writing their set would then
 * leave the PREVIOUS user's set in place, and the next boot would read it for
 * the new user — the one way this design could show one operator another's
 * rights. So every row carries the user id the set was read for, `read` asks
 * for the id in the token, and a set stored for somebody else is simply absent
 * (which fails OPEN, the direction that costs one 403 and never a lockout).
 *
 * ---------------------------------------------------------------------------
 * ABSENT IS NULL, EMPTY IS A SET, AND THE TWO MUST NEVER BE CONFUSED
 * ---------------------------------------------------------------------------
 * Zero rows for this user means "never learned": `read` returns null and
 * `may()` offers everything. A role that genuinely holds nothing is written as
 * ONE sentinel row (EMPTY_MARK) so it reads back as an empty Set and hides
 * everything. Without the sentinel an empty set and no set would be the same
 * zero rows, and a user whose role was stripped of every grant would be offered
 * every control.
 *
 * `replace` is atomic: the old rows for that user go and the new ones land in
 * one transaction, so a reader never sees half a set. `clear` on sign-out
 * removes every user's rows — the device is nobody's until the next sign-in.
 */
import type { SqlDriver } from "./driver.js";
import type { Grants } from "../../session/deviceRole.js";

/** The one row that says "this user's set was read, and it is empty". */
const EMPTY_MARK = "__empty__";

interface PermissionRow {
  permission: string;
}

export class SqlitePermissionStore {
  constructor(private readonly db: SqlDriver) {}

  /**
   * The set last stored for `userId`, or null when none was ever stored for
   * that user (or when the caller has no user id to ask for).
   */
  async read(userId: string | null): Promise<Grants> {
    if (userId === null) return null;
    const rows = await this.db.all<PermissionRow>(
      "SELECT permission FROM cached_permissions WHERE user_id = ? ORDER BY permission",
      [userId],
    );
    if (rows.length === 0) return null;
    return new Set(rows.map((r) => r.permission).filter((p) => p !== EMPTY_MARK));
  }

  /** Replace `userId`'s set with `permissions`, atomically. An empty set is stored
   *  as the sentinel so it reads back empty, not absent. */
  async replace(userId: string, permissions: ReadonlySet<string>, now: Date = new Date()): Promise<void> {
    const stamp = now.toISOString();
    const values = permissions.size === 0 ? [EMPTY_MARK] : [...permissions].sort();
    await this.db.transaction(async (tx) => {
      await tx.run("DELETE FROM cached_permissions WHERE user_id = ?", [userId]);
      for (const p of values) {
        await tx.run(
          "INSERT INTO cached_permissions (user_id, permission, updated_at) VALUES (?, ?, ?)",
          [userId, p, stamp],
        );
      }
    });
  }

  /** Forget every user's set — a sign-out. */
  async clear(): Promise<void> {
    await this.db.run("DELETE FROM cached_permissions");
  }
}
