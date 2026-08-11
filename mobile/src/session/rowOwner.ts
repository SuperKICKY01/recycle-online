/**
 * WHOSE ROW IS THIS — the one read, and the one rule about its absence.
 *
 * PURE TypeScript, no React and no Expo, for the reason `signInIdentity.ts`,
 * `signOut.ts` and `statusNotice.ts` all moved here: files under `app/` are
 * unreachable by the node proof program (tsconfig.node.json has rootDir "src"),
 * so an ordering that lives there is outside the proven surface entirely. The
 * step this file holds is exactly that kind of ordering — READ the identity,
 * THEN write the row with what the read returned — and keeping it in `App.tsx`
 * would leave the only version of it unproven.
 *
 * ---------------------------------------------------------------------------
 * READ LIVE AT EVERY WRITE, NEVER CACHED
 * ---------------------------------------------------------------------------
 * The identity store is the only thing that knows who is signed in. A value
 * held in a variable beside it is a second copy that can disagree: stale across
 * a sign-in, or naming a person who has since been replaced. The cost of not
 * caching is one indexed single-row SELECT, on a connection the caller is about
 * to write to anyway.
 *
 * ---------------------------------------------------------------------------
 * ABSENCE IS AN ANSWER, AND IT IS THE ONE THAT MUST NOT BE IMPROVED ON
 * ---------------------------------------------------------------------------
 * Null means this device does not know whose row this is. Two real situations
 * produce it: no login has ever been recorded here, and the store is not open
 * yet during boot. Neither is an error and neither may be repaired by guessing.
 *
 * The tempting repair is "use the last person we saw", and it is the exact
 * failure the owner key exists to prevent: a guessed owner is indistinguishable
 * from a recorded one once it is in the column, so a wrong guess produces false
 * provenance that no later audit can detect — and on a handset nobody can open
 * (ARCHITECTURE.md section 11), no one will ever learn it happened. A null
 * parks the row and costs a delay, which is visible and recoverable.
 *
 * The other tempting repair is reading the identity out of the stored token.
 * That makes the client interpret claims the server signed and it cannot
 * verify, on the one field where being wrong is invisible, and the token may be
 * expired or revoked while the person at the scale is exactly who they were
 * yesterday. Ownership comes from what a login RECORDED and from nothing else.
 */

/**
 * The pair a row's ownership is keyed by. Structurally identical to
 * `LocalIdentity` in the sqlite adapter and to `SignedInIdentity` in
 * `signInIdentity.ts` — declared here rather than imported so this module stays
 * free of the adapter layer, the same way `signInIdentity.ts` declares its own.
 */
export interface RowOwner {
  tenant_id: string;
  user_id: string;
}

/**
 * The narrow slice of the identity store this needs. A `Pick`-shaped interface
 * rather than the concrete class, so a caller cannot reach `save()` or
 * `clear()` through this path by accident — this is a READ, and nothing about
 * writing a row may alter who is signed in.
 */
export interface OwnerReader {
  load(): Promise<RowOwner | null>;
}

/**
 * The owner to stamp on a row being created right now.
 *
 * `store` is nullable because during boot there genuinely is no store yet: the
 * driver is opened in an effect, and a write racing it must not throw and must
 * not invent an owner. Null in, null out — no login has been observed, so no
 * owner is known.
 */
export async function ownerForNewRow(store: OwnerReader | null): Promise<RowOwner | null> {
  if (store === null) return null;
  return store.load();
}
