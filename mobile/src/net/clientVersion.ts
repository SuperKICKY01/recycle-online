/**
 * THE CLIENT'S HALF OF THE API VERSION CONTRACT.
 *
 * PURE TypeScript — no React Native, no Expo, no node builtins — so both the
 * constant and the wrapper are drivable by a headless proof. The SERVER half
 * (server/app/version_gate.py) refuses a client below a floor with 426; this is
 * what makes this client identify itself and what a 426 is classified as lives
 * one layer up, in the sync engine's outcome unions (types.ts, sellerCreate.ts).
 *
 * WHAT THE NUMBER MEANS, and it is NOT app.json's "1.0.0". This is the API
 * CONTRACT version this build was written against — a single integer the server
 * compares to its floor. It rises by one ONLY when the server makes a change to a
 * contract this client depends on that an OLD build could not survive (the
 * server module states the rule and a worked example). It carries NOTHING that
 * identifies a person or a device: it is not analytics, it is a compatibility
 * claim.
 *
 * ONE PLACE, ONE VALUE. Bump this when — and only when — a server change requires
 * every field build to be updated before the floor is raised past it. The floor
 * on the server is what actually enforces it; this is the client saying which
 * contract it speaks.
 */
export const CLIENT_API_VERSION = 1;

/** The header carrying the integer above, on every request. Lower-case because
 *  HTTP header names are case-insensitive and this is the casing the server
 *  reads; nothing depends on it. */
export const CLIENT_API_VERSION_HEADER = "x-client-api-version";

/**
 * THE ONE STATEMENT of the status the server uses to refuse a too-old build (426
 * Upgrade Required). Every surface that classifies a refusal reads it from here,
 * the way `signInIdentity.UNAUTHORIZED_STATUS` is the one statement of 401 — so a
 * 426 is recognised identically at the login screen, the shop-code screen and the
 * three sync transports, and the number lives in exactly one place.
 */
export const CLIENT_OUTDATED_STATUS = 426;

/**
 * WRAP A fetch SO EVERY REQUEST THROUGH IT CARRIES THE VERSION HEADER.
 *
 * The app has no single transport chokepoint — `app/api.ts` and the two sync
 * adapters each build their own requests — so this wrapper is injected at each
 * of the three, and every request they make is stamped without any call site
 * having to remember. A caller's own headers (content-type, authorization) are
 * preserved; the version header is added, and it wins if a caller ever set it,
 * because the contract version is not the caller's to choose.
 *
 * The header objects this app builds are always plain objects (never a `Headers`
 * instance or an array), so a shallow spread is exact here.
 */
export function withClientVersion(fetchImpl: typeof globalThis.fetch): typeof globalThis.fetch {
  return (input, init) => {
    const existing = (init?.headers ?? {}) as Record<string, string>;
    const headers: Record<string, string> = {
      ...existing,
      [CLIENT_API_VERSION_HEADER]: String(CLIENT_API_VERSION),
    };
    return fetchImpl(input, { ...init, headers });
  };
}
