/**
 * WHAT THIS DEVICE MAY OFFER — the permission set of the session, and the role
 * code beside it, read out of the token and (since migration 0019) out of the
 * device's own cache of the server's last answer.
 *
 * PURE TypeScript: no React Native, no Expo, no node, no atob. Everything here
 * is arithmetic over the token string and a Set, so the headless proof
 * exercises exactly what the phone runs.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CLIENT MAY READ THIS AT ALL, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------
 * The server puts a `role` claim and a `permissions` claim in the JWT for
 * exactly one purpose, and says so in server/app/security.py: ADVISORY, so a
 * client can render with them. Neither is what the server authorises on —
 * get_principal reads the users -> roles -> role_permissions join under tenant
 * context on every single request, precisely so that a grant revoked in the
 * office stops working immediately instead of at the end of the token's hour.
 *
 * So the set here is one hour stale at worst (fresher after a /whoami, which
 * rewrites the cache) and the server is the authority, always. It is used for
 * ONE thing: not offering a button that cannot work. Every consequence of being
 * wrong is absorbed by the 403 path — the sync engine classifies the refusal, the
 * void stops being owed, and the card explains it.
 *
 * IT FAILS OPEN ON AN ABSENT SET, AND CLOSED ON A PRESENT ONE. `may(null, x)` is
 * true: an unparseable token, a token from an older build with no permissions
 * claim, an empty cache on a cold start — all read as "unknown", and unknown
 * OFFERS the control. That is the opposite of the rule in
 * lessons/config-defaults-must-fail-closed.md, and the difference is which side
 * of the wire the decision is on. That lesson is about a SERVER accepting an
 * identity it never verified — there, a default is a default identity. Here the
 * enforcement is elsewhere and untouched by anything in this file; failing
 * closed would only mean a real owner whose set we merely failed to read is
 * locked out of the one action that corrects a wrong bill, with no way to
 * appeal. A user who is wrongly offered a button gets a plain sentence back.
 * Those costs are not close.
 *
 * THE NARROWING, deliberate (STRUCTURE.md section 3.3). Before 0019 the five
 * predicates this file held read `role !== "staff"`: only a DEFINITE staff hid
 * a control, and an unrecognised role string fell open. Now a set that WAS read
 * is exact — a set lacking `bills.void` hides the void button even though the
 * role code beside it is one this build has never heard of. Only an ABSENT set
 * fails open. A role the shop minted with three permissions therefore sees
 * three controls, not every control.
 *
 * WHY NOT ASK /whoami INSTEAD. That answer is fresher — it is the same read the
 * gate performs — and the app DOES ask it, at boot when online and whenever the
 * account screen opens, rewriting `cached_permissions` each time. But the case
 * this has to survive is the cold start with the server unreachable (Phase
 * 2c-8): the token comes back from the keystore, the cache comes back from
 * SQLite, the yard opens the app, and there is nobody to ask. A claim already in
 * hand answers offline; the cache answers with whatever the server last said.
 *
 * WHY A HAND-WRITTEN DECODER. `atob` and `TextDecoder` under Hermes are
 * unverified here, in the same family as crypto.randomUUID and Intl's timeZone
 * option (see PROJECT_STATUS "Known device gaps"). A silently absent global would
 * throw on the login path. This is thirty lines of arithmetic that cannot be
 * absent, and it is provable headless against tokens the real server minted.
 */

/** "unknown" is `null`, and it is a first-class answer, not an error. */
export type DeviceRole = "owner" | "admin" | "staff" | null;

/**
 * The three SYSTEM role codes every shop is born with (server migration 0019,
 * S9). A shop may mint more; a code this build does not recognise reads as
 * unknown for DISPLAY (the label), and nothing is gated on it — gating is
 * `may()` over the permission set, whatever the role is called.
 */
const ROLES: readonly string[] = ["owner", "admin", "staff"];

/**
 * The permission catalogue, MIRRORED from server/app/permissions.py (13 codes).
 * A courtesy list for the call sites, so a typo at a gate is a compile error;
 * the SERVER's boot check is what keeps its catalogue equal to its code, and a
 * code the server adds later simply lands in the Set unnamed here until this
 * list is widened.
 */
export type Permission =
  | "bills.create"
  | "bills.read"
  | "bills.void"
  | "money.view_own"
  | "money.view_shop"
  | "master.write"
  | "prices.write"
  | "sellers.create"
  | "sellers.write"
  | "tiers.manage"
  | "users.manage"
  | "shop.settings.write"
  | "roles.manage";

/**
 * The session's permission set, or null when it is UNKNOWN (no readable claim,
 * no cache). Never an empty Set for "unknown": an empty Set is a real answer —
 * a role holding nothing — and it hides everything.
 */
export type Grants = ReadonlySet<string> | null;

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/**
 * base64url -> bytes. Returns null for anything that is not valid base64url,
 * INCLUDING the standard-alphabet `+` and `/`: a JWT segment is base64url by
 * specification, and quietly accepting a different alphabet would be inventing
 * bytes for a token this code does not actually understand.
 */
function base64UrlToBytes(segment: string): Uint8Array | null {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of segment) {
    const value = B64URL.indexOf(ch);
    if (value < 0) return null;
    acc = (acc << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  // Leftover bits are padding and must be zero. Anything else is a truncated
  // segment, which is not a token we should read a role out of.
  if (bits >= 6 || (acc & ((1 << bits) - 1)) !== 0) return null;
  return Uint8Array.from(out);
}

/**
 * UTF-8 bytes -> string. Written out rather than reached for, see the header.
 *
 * Only well-formed sequences are accepted; a malformed one returns null instead
 * of the usual replacement character, because the caller's next move is
 * JSON.parse and a silently corrupted claim set is worse than an unknown role.
 */
function utf8ToString(bytes: Uint8Array): string | null {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i] ?? 0;
    let cp: number;
    let extra: number;
    if (b0 < 0x80) {
      cp = b0;
      extra = 0;
    } else if ((b0 & 0xe0) === 0xc0) {
      cp = b0 & 0x1f;
      extra = 1;
    } else if ((b0 & 0xf0) === 0xe0) {
      cp = b0 & 0x0f;
      extra = 2;
    } else if ((b0 & 0xf8) === 0xf0) {
      cp = b0 & 0x07;
      extra = 3;
    } else {
      return null;
    }
    if (i + extra >= bytes.length) return null;
    for (let k = 1; k <= extra; k += 1) {
      const b = bytes[i + k] ?? 0;
      if ((b & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (b & 0x3f);
    }
    if (cp > 0x10ffff) return null;
    out += String.fromCodePoint(cp);
    i += extra + 1;
  }
  return out;
}

/**
 * The claims of a session token, or null when they cannot be read. NEVER
 * THROWS: called on the boot path over a token restored from the OS keystore
 * that may be anything at all, including a value written by an older build.
 *
 * The SIGNATURE IS NOT CHECKED and cannot be: the client has no secret, by
 * design. That is not a hole, because nothing is authorised on these values —
 * forging a claim here only changes whether a button is drawn, and pressing it
 * gets the same 403 the server would have given anyway.
 */
function readClaims(token: string | null): Record<string, unknown> | null {
  if (token === null) return null;
  const parts = token.split(".");
  // header.payload.signature. Not two, not four.
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (payload === undefined || payload.length === 0) return null;
  try {
    const bytes = base64UrlToBytes(payload);
    if (bytes === null) return null;
    const json = utf8ToString(bytes);
    if (json === null) return null;
    const claims: unknown = JSON.parse(json);
    if (typeof claims !== "object" || claims === null || Array.isArray(claims)) return null;
    return claims as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * The role CODE claimed by this session token, or null when it cannot be read
 * or is not one of the three system codes. DISPLAY ONLY (the account screen's
 * label and the roster's fallback); nothing is gated on it since 0019.
 */
export function readTokenRole(token: string | null): DeviceRole {
  const claims = readClaims(token);
  if (claims === null || !("role" in claims)) return null;
  const role = claims["role"];
  return typeof role === "string" && ROLES.includes(role) ? (role as DeviceRole) : null;
}

/**
 * The user id (`sub`) this session token was minted for, or null when it cannot be
 * read. Same decode as readTokenRole and the same NEVER-THROWS contract. It is a
 * COURTESY only — the roster uses it to mark the signed-in row and to keep its own
 * destructive actions off that row, and the permission cache is keyed on it — so a
 * null (a token this build cannot parse) simply marks no row as self, which the
 * server still backs: self-deactivation is refused (cannot_deactivate_self)
 * whatever the client believes.
 */
export function readTokenUserId(token: string | null): string | null {
  const claims = readClaims(token);
  if (claims === null || !("sub" in claims)) return null;
  const sub = claims["sub"];
  return typeof sub === "string" ? sub : null;
}

/**
 * The permission set claimed by this session token (server migration 0019), or
 * null when there is none to read: a token from before 0019 carries no
 * `permissions` claim at all, and a value that is not an array of strings is a
 * claim this build does not understand. Null is "unknown" and fails OPEN
 * (see the header); an EMPTY array is a real, empty set and fails closed.
 */
export function readTokenPermissions(token: string | null): Grants {
  const claims = readClaims(token);
  if (claims === null || !("permissions" in claims)) return null;
  const raw = claims["permissions"];
  if (!Array.isArray(raw) || !raw.every((p) => typeof p === "string")) return null;
  return new Set(raw as string[]);
}

/**
 * May this device OFFER the control that `permission` gates?
 *
 * THE ONE GATE on the client, replacing the five role predicates this file
 * carried until 0019 (mayVoid, mayEditPrices, mayEditShopSettings,
 * mayManageUsers, mayManageProducts — "the map of what to convert", in its
 * own words). An ABSENT set offers everything (fails open, the header's
 * argument); a PRESENT set is exact.
 *
 * The rule lives here, next to the reasoning, rather than as a `.has()` in a
 * view: it is consumed by canRequestVoid (sync/parkedReason.ts), the settings
 * entries, the price and product and user screens and the dashboard gate, so a
 * button and the sentence explaining its absence cannot drift apart, and so a
 * proof can hold them together.
 *
 * NOTHING IS AUTHORISED ON THIS VALUE. `require(permission)` is, on every
 * request, against the database row (server/app/auth.py).
 */
export function may(grants: Grants, permission: Permission): boolean {
  return grants === null ? true : grants.has(permission);
}
