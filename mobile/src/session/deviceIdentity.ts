/**
 * WHAT THIS INSTALLATION IS — the device identity a reserved seller code is
 * held BY.
 *
 * PURE TypeScript, no React and no Expo, for the reason `rowOwner.ts`,
 * `signOut.ts` and `signInIdentity.ts` all give: files under `app/` are
 * unreachable by the node proof program (tsconfig.node.json has rootDir
 * "src"), so a rule that lives there is outside the proven surface entirely.
 * The rule this file holds — READ first, mint ONLY on absence, never twice —
 * is exactly that kind of rule.
 *
 * ---------------------------------------------------------------------------
 * WHY A DEVICE AND NOT A TENANT OR A USER
 * ---------------------------------------------------------------------------
 * `ROADMAP.md § P1.8` "THE HOLDER IS A DEVICE. Not a tenant, and not a user."
 * A tenant-scoped pool is two handsets in one shop drawing from one set of
 * codes, which is the defect the owner's decision was taken to remove. A user
 * is wrong in both directions at once: the codes physically live in ONE
 * device's SQLite, so a person who signs out on handset A and in on handset B
 * does not take the holding with them, while the server would believe B holds
 * what A is carrying.
 *
 * ---------------------------------------------------------------------------
 * WHY SQLITE AND NEVER THE KEYSTORE — MEASURED, NOT PREFERRED
 * ---------------------------------------------------------------------------
 * A SIGN-OUT DELETES THE KEYSTORE ENTRY. `session/signOut.ts` step 3 calls
 * `tokens.clear()` and the keystore is the only store it touches;
 * `adapters/sqlite/SqliteIdentityStore.ts` states the same fact in its own
 * header, and `schema.ts` states it again at `local_identity`. An identity
 * kept beside the token would therefore be destroyed by an ordinary shift
 * change.
 *
 * AND WHAT IS DESTROYED WITH IT IS UNRECOVERABLE, which is why this is not a
 * matter of taste. Nothing re-issues a reservation — the design takes that
 * decision deliberately and states its cost — so a device that loses its
 * identity loses its whole holding for ever, and the shop gets a gap in the
 * printed code sequence for every code it was carrying. There is no repair
 * path, on the server or here.
 *
 * SECOND REASON, and it is `SqliteIdentityStore`'s deciding one repeated:
 * `src/device/secureTokenStore.ts` cannot run under node at all, so an
 * identity kept there could not be exercised before it shipped. The local
 * database is what every headless proof already drives.
 *
 * ---------------------------------------------------------------------------
 * MINTED ONCE, AND THE SCHEMA IS WHAT ENFORCES IT
 * ---------------------------------------------------------------------------
 * `local_device` is keyed `only_row INTEGER PRIMARY KEY CHECK (only_row = 1)`,
 * and the write is an INSERT that does NOTHING on conflict. So "minted once"
 * is a property of the table rather than of this module remembering to check
 * first: two concurrent boots race into one row, and the loser reads the
 * winner's value instead of overwriting it.
 *
 * A SECOND VALUE WOULD NOT BE A DUPLICATE, IT WOULD BE A SECOND HOLDER. The
 * server keys a reservation on `(tenant_id, code)` and records the device that
 * holds it; a handset that re-minted would ask for a fresh block under a new
 * identity, leave its old block `held` in a name it no longer answers to, and
 * be unable to spend a single code it was already carrying.
 */

/**
 * The device's own id. A v4 UUID, because the server's `ReservationTopUp`
 * declares `device_id: uuid.UUID` and refuses anything else at the edge — so
 * the shape is a wire contract, not a local convention.
 *
 * Structurally a plain string, declared as an alias so a reader meeting it in
 * a signature can see WHICH id is meant: a bill id, a local seller id and this
 * all come from the same generator and are three different things.
 */
export type DeviceId = string;

/**
 * The narrow slice callers need. A `Pick`-shaped interface rather than the
 * concrete class, the way `rowOwner.ts`'s `OwnerReader` is, so nothing on a
 * read path can reach a writer through it.
 *
 * `ensure` is the ONLY writer and it is deliberately not called `save`: there
 * is no value to hand it. A caller cannot set the device id, only ask that one
 * exist, which makes "somebody wrote the wrong id here" unrepresentable rather
 * than merely unlikely.
 */
export interface DeviceIdentityStore {
  /** The stored id, or null when this device has never minted one. */
  load(): Promise<DeviceId | null>;
  /**
   * The device's id, minting one on first call and returning the SAME value
   * for ever after. Idempotent by construction — see the header.
   */
  ensure(now: Date): Promise<DeviceId>;
}
