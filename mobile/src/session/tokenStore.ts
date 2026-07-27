/**
 * WHERE THE SESSION TOKEN LIVES ACROSS A RESTART.
 *
 * PURE TypeScript — the interface and an in-memory implementation only. The real
 * one is src/device/secureTokenStore.ts (expo-secure-store), which cannot run
 * under node for the same reason ExpoSqliteDriver cannot.
 *
 * ---------------------------------------------------------------------------
 * THIS REVERSES AN EARLIER DECISION, ON PURPOSE
 * ---------------------------------------------------------------------------
 * Until Phase 2c-8 the token was held in a React ref and nothing else, and an
 * audit praised that: a stolen phone gives up nothing, because there is nothing
 * on disk to give up. That reasoning was sound and the conclusion was still
 * wrong, because it weighed only one of the two risks.
 *
 * The other one: a token that dies with the process means every launch starts
 * signed out, and signing in needs the server. A yard that opens at 07:00 with
 * the server unreachable therefore has no token, no products, no sellers, and a
 * login button that cannot succeed — it cannot write a single bill. That is hard
 * rule 8 ("offline-first: write locally first, always") failing at the first
 * step, on the shift where it matters most.
 *
 * The trade, stated plainly so it can be argued with rather than inherited:
 *
 *   "cannot work this morning"  — possible EVERY day the network is bad, costs
 *                                 the shop a shift of paper bills or lost trade.
 *   "phone stolen"              — rare, and recoverable: change the password and
 *                                 the token stops being accepted (JWT_TTL is one
 *                                 hour and there is no refresh token, so a
 *                                 stolen token is worthless within the hour in
 *                                 any case).
 *
 * The daily certainty outweighs the rare recoverable one. Hence the OS keystore
 * rather than SQLite: the bill database is an ordinary file, and putting a
 * credential in it would give the stolen-phone case a much larger surface than
 * the one we accepted.
 *
 * A RESTORED TOKEN MAY ALREADY BE EXPIRED and, offline, that is unknowable —
 * there is nothing to ask. That is fine and is not worked around: the app treats
 * it as usable, bills queue behind it, and the first send that reaches a server
 * gets a 401 and lands in the session-ended path built in Phase 2c-7
 * (lessons/401-is-about-the-caller-not-the-bill.md). Nothing is lost either way;
 * the only difference is when the operator is asked to sign in again.
 */

export interface TokenStore {
  /** The stored token, or null. MUST NOT throw — a boot cannot fail on this. */
  load(): Promise<string | null>;
  save(token: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Non-persistent implementation.
 *
 * Two uses, both real: the headless proof (expo-secure-store cannot run under
 * node), and any platform where the keystore is unavailable — where degrading to
 * "you will have to sign in again" is correct, and crashing is not.
 */
export class MemoryTokenStore implements TokenStore {
  private token: string | null;

  constructor(initial: string | null = null) {
    this.token = initial;
  }

  load(): Promise<string | null> {
    return Promise.resolve(this.token);
  }

  save(token: string): Promise<void> {
    this.token = token;
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.token = null;
    return Promise.resolve();
  }
}
