/**
 * RECORDING WHO SIGNED IN — the ordering, and nothing else.
 *
 * PURE TypeScript, no React and no Expo, for the reason `signOut.ts`,
 * `statusNotice.ts` and `billNotice` all moved here: files under `app/` are
 * unreachable by the node proof program (tsconfig.node.json has rootDir "src"),
 * so an ordering that lives there is outside the proven surface entirely.
 *
 * ---------------------------------------------------------------------------
 * THE ORDERING IS THE WHOLE CONTENT
 * ---------------------------------------------------------------------------
 * The identity is written ONLY after the server has accepted the credentials.
 * That is not a style preference — it is the difference between a device that
 * knows whose rows it is writing and one that has adopted an identity nobody
 * confirmed. `attempt()` throws on every refusal (see app/api.ts), so the save
 * below is unreachable on any failed login, and a failed attempt therefore
 * leaves whatever identity was already stored exactly as it was.
 *
 * WHY THE TENANT COMES FROM THE REQUEST AND THE USER FROM THE RESPONSE. The
 * server resolves the account UNDER the submitted tenant context and RLS makes
 * another shop's users invisible while it does — so a login that succeeds
 * proves the user belongs to the tenant that was sent. The USER id has no such
 * derivation available to the client, which is why the server now returns it.
 *
 * WHAT THIS DOES NOT DO, and both absences are deliberate:
 *   - it does not CLEAR anything. Sign-out must not clear the identity yet: the
 *     refusal that has to guard that clearing does not exist, and clearing now
 *     would strand the very rows the owner key exists to protect.
 *   - it does not STAMP an owner on any row. Nothing reads this value yet.
 */

/** The identity, as the server names it. Both are server-issued identifiers. */
export interface SignedInIdentity {
  tenant_id: string;
  user_id: string;
}

/** What a successful login attempt yields. Mirrors app/api.ts LoginResult. */
export interface SignInOutcome {
  accessToken: string;
  userId: string;
}

/**
 * The narrow slice of the identity store this needs. A `Pick`-shaped interface
 * rather than the concrete class, so the proof can drive the real store and a
 * caller cannot reach `clear()` through this path by accident.
 */
export interface IdentityWriter {
  save(identity: SignedInIdentity): Promise<void>;
}

/**
 * Run a login attempt and, ONLY if it succeeds, record who signed in.
 *
 * `attempt` is injected rather than imported: `app/api.ts` pulls in
 * expo-constants through `./config` and cannot run under node, so importing it
 * here would put this ordering back outside the proofs — which is the one thing
 * this module exists to prevent.
 */
export async function signInAndRecord(
  attempt: () => Promise<SignInOutcome>,
  tenantId: string,
  identity: IdentityWriter,
): Promise<SignInOutcome> {
  // Throws on any refusal. Nothing below runs, so nothing is recorded.
  const outcome = await attempt();
  await identity.save({ tenant_id: tenantId, user_id: outcome.userId });
  return outcome;
}
