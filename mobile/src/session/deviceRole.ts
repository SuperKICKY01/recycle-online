/**
 * WHAT ROLE THIS DEVICE IS SIGNED IN AS — read out of the session token.
 *
 * PURE TypeScript: no React Native, no Expo, no node, no atob. Everything here
 * is arithmetic over the token string, so the headless proof exercises exactly
 * what the phone runs.
 *
 * ---------------------------------------------------------------------------
 * WHY THE CLIENT MAY READ THIS AT ALL, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------
 * The server puts a `role` claim in the JWT for exactly one purpose, and says so
 * in server/app/security.py: ADVISORY, so a client can render with it. It is NOT
 * what the server authorises on — get_principal re-reads the role from the users
 * row under tenant context on every single request, precisely so that an admin
 * demoted in the back office stops being an admin immediately instead of at the
 * end of their token's hour.
 *
 * So this value is one hour stale at worst and the server is the authority,
 * always. It is used here for ONE thing: not offering a button that cannot work.
 * Every consequence of being wrong is absorbed by the 403 path — the sync engine
 * classifies the refusal, the void stops being owed, and the card explains it.
 *
 * IT FAILS OPEN. An unparseable token, a missing claim, an unrecognised value:
 * all of them read as "unknown", and unknown offers the button. That is the
 * opposite of the rule in lessons/config-defaults-must-fail-closed.md, and the
 * difference is which side of the wire the decision is on. That lesson is about
 * a SERVER accepting an identity it never verified — there, a default is a
 * default identity. Here the enforcement is elsewhere and untouched by anything
 * in this file; failing closed would only mean a real admin whose token we merely
 * failed to parse is locked out of the one action that corrects a wrong bill,
 * with no way to appeal. A staff user who is wrongly offered the button gets a
 * plain sentence back. Those costs are not close.
 *
 * WHY NOT ASK /whoami INSTEAD. That answer is fresher — it is the same read the
 * gate performs. But it needs a network round trip, and the case this has to
 * survive is the cold start with the server unreachable (Phase 2c-8): the token
 * comes back from the keystore, the yard opens the app, and there is nobody to
 * ask. A claim already in hand answers offline. Nothing stops /whoami being used
 * as well later; it would refine this, not replace it.
 *
 * WHY A HAND-WRITTEN DECODER. `atob` and `TextDecoder` under Hermes are
 * unverified here, in the same family as crypto.randomUUID and Intl's timeZone
 * option (see PROJECT_STATUS "Known device gaps"). A silently absent global would
 * throw on the login path. This is thirty lines of arithmetic that cannot be
 * absent, and it is provable headless against tokens the real server minted.
 */

/** "unknown" is `null`, and it is a first-class answer, not an error. */
export type DeviceRole = "admin" | "staff" | null;

/**
 * The only two roles there are. users.role carries a CHECK constraint to exactly
 * these (migration 0001), so anything else in a token is a token we do not
 * understand, and the honest reading of that is "unknown" rather than a guess.
 */
const ROLES: readonly string[] = ["admin", "staff"];

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
 * The role claimed by this session token, or null when it cannot be read.
 *
 * NEVER THROWS. It is called on the boot path, on a token restored from the OS
 * keystore that may be anything at all — including a value written by an older
 * build. A launch must not fail on it.
 *
 * The SIGNATURE IS NOT CHECKED and cannot be: the client has no secret, by
 * design. That is not a hole, because nothing is authorised on this value —
 * forging a role here only changes whether a button is drawn, and pressing it
 * gets the same 403 the server would have given anyway.
 */
export function readTokenRole(token: string | null): DeviceRole {
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
    if (typeof claims !== "object" || claims === null || !("role" in claims)) return null;
    const role = (claims as { role: unknown }).role;
    return typeof role === "string" && ROLES.includes(role) ? (role as DeviceRole) : null;
  } catch {
    return null;
  }
}

/**
 * The user id (`sub`) this session token was minted for, or null when it cannot be
 * read. Same decode as readTokenRole and the same NEVER-THROWS contract. It is a
 * COURTESY only — the roster uses it to mark the signed-in row and to keep its own
 * destructive actions off that row — so a null (a token this build cannot parse)
 * simply marks no row as self, which the server still backs: self-deactivation is
 * refused (cannot_deactivate_self) whatever the client believes.
 */
export function readTokenUserId(token: string | null): string | null {
  if (token === null) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (payload === undefined || payload.length === 0) return null;
  try {
    const bytes = base64UrlToBytes(payload);
    if (bytes === null) return null;
    const json = utf8ToString(bytes);
    if (json === null) return null;
    const claims: unknown = JSON.parse(json);
    if (typeof claims !== "object" || claims === null || !("sub" in claims)) return null;
    const sub = (claims as { sub: unknown }).sub;
    return typeof sub === "string" ? sub : null;
  } catch {
    return null;
  }
}

/**
 * May this device OFFER the void button?
 *
 * Only a definite "staff" hides it. Unknown shows it — see the header on why
 * this fails open — and so does "admin", obviously.
 *
 * The rule lives here, next to the reasoning, rather than as a `!== "staff"` in
 * a view: it is consumed by canRequestVoid (sync/parkedReason.ts) so the button
 * and the sentence explaining its absence cannot drift apart, and so a proof can
 * hold them together.
 */
export function mayVoid(role: DeviceRole): boolean {
  return role !== "staff";
}

/**
 * May this device OFFER to change a price?
 *
 * P1.9. The same rule as `mayVoid` and, deliberately, a SEPARATE function
 * rather than a shared `isNotStaff`: these are two product decisions that
 * happen to agree today, and collapsing them would mean the day one moves the
 * other moves silently with it. The server gates them on two different
 * dependencies and could diverge without anyone editing this file.
 *
 * WHY IT MATCHES `mayVoid` RATHER THAN THE ยอดวันนี้ BUTTON, which is the other
 * precedent in this app and points the other way. That button is offered to
 * everybody because opening a read-only report costs one refused GET and one
 * plain sentence. A price WRITE is an ACTION: a staff session pressing save
 * gets a 403 from `require_admin`, and finding out that way is finding out
 * after deciding a price was changed. So the control is not drawn.
 *
 * IT FAILS OPEN, exactly as the header of this file argues and for the same
 * reason: only a DEFINITE "staff" hides the control. An unparseable token, an
 * absent claim, or a role this build does not recognise all read as unknown,
 * and unknown offers it. The claim is up to an hour stale while the server
 * re-reads the role from the users row on every request — so an owner promoted
 * this morning is admin to the server and still `staff` in their token, and
 * failing closed would lock a real shop owner out of their own prices, with a
 * metal market moving, until the token expired. The cost the other way is one
 * refused write and one plain sentence, which `priceSaveScreen`'s 403 branch
 * draws.
 *
 * NOTHING IS AUTHORISED ON THIS VALUE. `require_admin` is, on every request,
 * against the database row.
 */
export function mayEditPrices(role: DeviceRole): boolean {
  return role !== "staff";
}

/**
 * May this device OFFER to edit the shop's settings?
 *
 * P1.23. A SEPARATE function from `mayEditPrices` and `mayVoid`, deliberately, and
 * for the reason `mayEditPrices` already gives: these are distinct product
 * decisions that happen to agree today. The server gates PATCH /shop on
 * `require_admin` and GET /shop on nothing — the same asymmetry the price routes
 * have — but they are two different endpoints and could diverge without anyone
 * editing this file, so collapsing them into one `isNotStaff` would move one the
 * day the other moved.
 *
 * IT FAILS OPEN, exactly as the two above and for the same reason (see this
 * file's header): only a DEFINITE "staff" hides the edit controls. An unparseable
 * token, an absent claim, or a role this build does not recognise all read as
 * unknown, and unknown OFFERS the controls. The claim is up to an hour stale
 * while the server re-reads the role every request, so an owner promoted this
 * morning is admin to the server and still `staff` in their token; failing closed
 * would lock a real owner out of their own shop settings until the token expired.
 * The cost the other way is one refused PATCH and one plain sentence, which the
 * settings screen's 403 branch draws (src/settings/shopSettings.ts).
 *
 * NOTHING IS AUTHORISED ON THIS VALUE. `require_admin` is, on every PATCH /shop,
 * against the database row. Staff read the screen; only admin may write it.
 */
export function mayEditShopSettings(role: DeviceRole): boolean {
  return role !== "staff";
}

/**
 * May this device OFFER the "จัดการผู้ใช้งาน" entry inside settings (P3.7)?
 *
 * A SEPARATE function from the three above, deliberately, and for the same reason
 * mayEditPrices gives: these are distinct product decisions that happen to agree
 * today. Every user route is `require_admin` on the server; this only decides
 * whether the ENTRY is drawn, so a staff session does not see a screen whose every
 * action the server refuses (the P1.9 rule, the same shape as the dashboard entry
 * gate).
 *
 * IT FAILS OPEN, exactly as the three above and for the same reason (see this
 * file's header): only a DEFINITE "staff" hides the entry. An unparseable token, an
 * absent claim, or an unrecognised role all read as unknown, and unknown OFFERS the
 * entry. The claim is up to an hour stale while the server re-reads the role every
 * request, so an owner promoted this morning is admin to the server and still
 * `staff` in their token; failing closed would hide the one screen that manages the
 * shop's people. The cost the other way is a 403 the roster words, never a lockout.
 *
 * NOTHING IS AUTHORISED ON THIS VALUE. `require_admin` is, on GET /users and every
 * write, against the database row.
 */
export function mayManageUsers(role: DeviceRole): boolean {
  return role !== "staff";
}
