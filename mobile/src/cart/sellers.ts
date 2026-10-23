/**
 * Seller selection: finding the right seller, and what their GRADE means for
 * price. PURE TypeScript — no React Native, no Expo, no node — so the headless
 * proof exercises exactly what the device runs.
 *
 * Phase 2c-6. The seller was fetched but FIXED until now; a bill could only ever
 * belong to whoever came back first from /sellers. This module is the half of
 * making it a per-bill choice that has rules worth proving.
 *
 * THE RULE THIS MODULE EXISTS FOR: a grade-less seller gets NO default price.
 *
 * The previous implementation fell back to the first tier present (A, then B,
 * then C, then D) "so the field is never blank". That is the most expensive
 * silent default in the app. Grade A is the HIGHEST price tier, the yard pays
 * cash against the number on the screen, and the server will refuse the bill
 * anyway (424 seller_grade_unset) — so the fallback cannot make the bill valid,
 * it can only make the shop overpay before finding that out. A blank price the
 * operator has to fill in deliberately is the honest state, and the picker says
 * out loud which sellers are in it.
 */

/**
 * The shape the picker needs. Structurally satisfied by app/api.ts's `Seller`,
 * deliberately WITHOUT importing it: app/ pulls in expo-constants through
 * config.ts, and this file has to stay runnable under bare node.
 */
export interface SellerOption {
  id: string;
  code: string;
  name: string;
  /** Selects which product_prices tier applies (SRS 1.6). May be null. */
  grade: string | null;
  /** Searchable (seller search C3). Optional so older fixtures still satisfy the shape. */
  phone?: string | null;
  /**
   * The server's MINIMISED form of the seller's ID (C2): its last four characters. The phone
   * never holds a full server ID; this is all it ever caches of one.
   */
  id_last4?: string | null;
  /** The truck this seller USUALLY arrives in (sellers.vehicle_no) -- not a bill's plate. */
  vehicle_no?: string | null;
}

/**
 * The price tier for a seller's grade, or null when there is no price to
 * default from — an unknown/absent grade, or a product with no row for it.
 *
 * Null is a real answer here, not a failure: the caller must show a blank field
 * rather than invent a number. See the header.
 */
export function gradePrice(
  prices: Readonly<Record<string, string>>,
  grade: string | null,
): string | null {
  if (grade === null) return null;
  return prices[grade] ?? null;
}

/**
 * A tier as a NAME lookup needs it — structurally satisfied by MasterGradeTier
 * (src/master/types.ts), imported by neither for the reason SellerOption gives.
 */
export interface NamedTier {
  code: string;
  name: string;
}

/**
 * THE SHOP'S OWN NAME FOR A SELLER'S GRADE (S16 / P1.24, F3). Given the shop's
 * cached tiers and a grade CODE, returns the tier's display NAME — the text the
 * shop set. Falls back to the CODE when no tier matches: a seller in a tier since
 * deactivated (not in the active cache), or a cache not yet fetched. The code is an
 * honest last resort — it is what the seller actually carries — and this never
 * invents a name.
 *
 * A NULL grade is the caller's case, not this one: a seller with no grade is shown
 * "ไม่มีเกรด" by the surface, a different sentence from a named tier, so this takes
 * a non-null code only.
 */
export function tierName(tiers: readonly NamedTier[], code: string): string {
  return tiers.find((t) => t.code === code)?.name ?? code;
}

/* ------------------------------------------------------------- searching -- */

/**
 * The comparison form of a piece of text: lower-cased, with the separators
 * people write plates and codes with removed.
 *
 * FOR COMPARISON ONLY — never for storage. A plate is recorded exactly as the
 * operator typed it; this only decides whether a query matches it, so that
 * "70-1234", "70 1234" and "701234" are the same search.
 *
 * The character class is spelled out rather than using \p{L}/\p{N}: Unicode
 * property escapes under Hermes are UNVERIFIED on this project (same caution as
 * Intl in lessons/render-in-shop-time-not-device-time.md), and toLowerCase on
 * Thai text is a no-op, so nothing here depends on either.
 */
export function fold(text: string): string {
  return text.replace(/[\s\-._/\\()]+/g, "").toLowerCase();
}

/**
 * Which plates this device has seen for each seller, newest first.
 *
 * Derived from THIS DEVICE'S OWN BILLS, because sellers carry no plate: the
 * plate is a property of the bill (SRS 1.6), not of the customer, and a customer
 * may arrive in a different truck. So this is a memory, not a master-data
 * lookup, and a fresh install legitimately knows nothing — which the picker has
 * to say rather than silently return no matches.
 *
 * Bills must be passed newest-first; the order is preserved so the most recent
 * plate is the one shown.
 */
export function indexPlates(
  bills: readonly { seller_id: string; vehicle_no: string | null }[],
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const b of bills) {
    const plate = (b.vehicle_no ?? "").trim();
    if (plate === "") continue;
    const seen = out.get(b.seller_id);
    if (seen === undefined) {
      out.set(b.seller_id, [plate]);
      continue;
    }
    // Same plate written differently is the same plate.
    if (!seen.some((p) => fold(p) === fold(plate))) seen.push(plate);
  }
  return out;
}

/**
 * THE COMPARISON FORM OF A PHONE NUMBER (seller search C3, ADVISOR-DECIDED 2026-10-12):
 * spaces, dashes, dots and brackets dropped, and a leading +66 (Thailand's country code)
 * written as the 0 a Thai number is dialled with -- so `+66 81-000-0101`, `081 000 0101`
 * and `0810000101` are one search. For comparison only, never for storage.
 */
export function foldPhone(text: string): string {
  const compact = text.replace(/[\s\-.()]+/g, "");
  return compact.startsWith("+66") ? "0" + compact.slice(3) : compact;
}

/** Why a row matched, so the picker can show the operator what it hit on. */
export type MatchVia = "code" | "name" | "plate" | "phone" | "id";

export interface SellerMatch {
  seller: SellerOption;
  /** Plates this device has recorded for them, newest first. May be empty. */
  plates: readonly string[];
  /** Null when the query was empty — everything matches and nothing was hit. */
  via: MatchVia | null;
  /** The stored value the best token hit on, as stored (a plate, a phone); null otherwise. */
  hit: string | null;
}

/**
 * Lower is better. Exact code, then exact phone, then exact last four of the ID (the three
 * a weigher types when they KNOW who it is), then a prefix, then a plate, then a substring.
 */
const RANK_EXACT_CODE = 0;
const RANK_EXACT_PHONE = 1;
const RANK_EXACT_LAST4 = 2;
const RANK_PREFIX = 3;
const RANK_PLATE = 4;
const RANK_CONTAINS = 5;
const RANK_NONE = 9;

interface Scored {
  rank: number;
  via: MatchVia | null;
  hit: string | null;
}

interface Fields {
  code: string;
  name: string;
  /** foldPhone(phone), "" when none. */
  phone: string;
  rawPhone: string | null;
  /** fold(id_last4), "" when none. */
  last4: string;
  rawLast4: string | null;
  /** The usual truck first, then this device's bill plates; each [folded, as stored]. */
  plates: readonly (readonly [string, string])[];
}

/** Best (lowest) rank this ONE token achieves against this seller. */
function scoreToken(token: string, phoneToken: string, f: Fields): Scored {
  if (f.code === token) return { rank: RANK_EXACT_CODE, via: "code", hit: null };
  if (f.phone !== "" && f.phone === phoneToken)
    return { rank: RANK_EXACT_PHONE, via: "phone", hit: f.rawPhone };
  if (f.last4 !== "" && f.last4 === token) return { rank: RANK_EXACT_LAST4, via: "id", hit: f.rawLast4 };
  if (f.code.startsWith(token)) return { rank: RANK_PREFIX, via: "code", hit: null };
  if (f.name.startsWith(token)) return { rank: RANK_PREFIX, via: "name", hit: null };
  if (f.phone !== "" && phoneToken !== "" && f.phone.startsWith(phoneToken))
    return { rank: RANK_PREFIX, via: "phone", hit: f.rawPhone };
  const plate = f.plates.find(([p]) => p.includes(token));
  if (plate !== undefined) return { rank: RANK_PLATE, via: "plate", hit: plate[1] };
  if (f.name.includes(token)) return { rank: RANK_CONTAINS, via: "name", hit: null };
  if (f.code.includes(token)) return { rank: RANK_CONTAINS, via: "code", hit: null };
  if (f.phone !== "" && phoneToken !== "" && f.phone.includes(phoneToken))
    return { rank: RANK_CONTAINS, via: "phone", hit: f.rawPhone };
  return { rank: RANK_NONE, via: null, hit: null };
}

/**
 * A query that is a PHONE NUMBER as people write one -- digits with spaces, dashes, dots or
 * brackets, optionally led by +66 -- is ONE token, not several: `081 000 0101` must not be
 * three tokens each required to hit something. Anything with a letter in it splits on
 * whitespace as before, so `ส 70` still lands one token on the name and one on the truck.
 */
function tokensOf(query: string): string[] {
  const q = query.trim();
  if (q === "") return [];
  if (/^\+?[\d\s\-.()]+$/.test(q)) return [fold(foldPhone(q))];
  return q.split(/\s+/).map(fold).filter((t) => t !== "");
}

/**
 * Sellers matching `query`, best first.
 *
 * EVERY token must hit something — typing more narrows, it never widens — but a
 * token may hit any of name, code, phone, the ID's last four, the usual truck or a
 * plate this device recorded on a bill. That is what makes "ส 70" work: one token
 * lands on the name, the other on the truck.
 *
 * An empty query returns everything in code order, so the picker opens on the
 * full list rather than on nothing.
 */
export function searchSellers(
  sellers: readonly SellerOption[],
  query: string,
  platesBySeller: ReadonlyMap<string, readonly string[]>,
): SellerMatch[] {
  const tokens = tokensOf(query);

  const rows: { m: SellerMatch; rank: number }[] = [];

  for (const seller of sellers) {
    const plates = platesBySeller.get(seller.id) ?? [];
    if (tokens.length === 0) {
      rows.push({ m: { seller, plates, via: null, hit: null }, rank: RANK_NONE });
      continue;
    }

    const usual = (seller.vehicle_no ?? "").trim();
    const allPlates = usual === "" ? plates : [usual, ...plates.filter((p) => fold(p) !== fold(usual))];
    const f: Fields = {
      code: fold(seller.code),
      name: fold(seller.name),
      phone: seller.phone ? fold(foldPhone(seller.phone)) : "",
      rawPhone: seller.phone ?? null,
      last4: seller.id_last4 ? fold(seller.id_last4) : "",
      rawLast4: seller.id_last4 ?? null,
      plates: allPlates.map((p) => [fold(p), p] as const),
    };

    let worst = RANK_EXACT_CODE;
    let best: Scored = { rank: RANK_NONE, via: null, hit: null };
    let all = true;
    for (const t of tokens) {
      const s = scoreToken(t, fold(foldPhone(t)), f);
      if (s.rank === RANK_NONE) {
        all = false;
        break;
      }
      if (s.rank > worst) worst = s.rank;
      if (s.rank < best.rank) best = s;
    }
    if (!all) continue;
    rows.push({ m: { seller, plates, via: best.via, hit: best.hit }, rank: worst });
  }

  // Rank first, then code — a stable, predictable order rather than whatever
  // the server happened to return.
  rows.sort((a, b) =>
    a.rank !== b.rank ? a.rank - b.rank : a.m.seller.code.localeCompare(b.m.seller.code),
  );
  return rows.map((r) => r.m);
}

/* ------------------------------------------------------- what a row says -- */

/** The search box's placeholder and the line under it (impeccable · clarify). */
export const SELLER_SEARCH_PLACEHOLDER = "ค้นหา: ชื่อ / เบอร์ / ทะเบียน / รหัส";
export const SELLER_SEARCH_HINT = "หรือพิมพ์เลขบัตรประชาชน 4 ตัวท้าย";

export interface SellerRowText {
  /** Always shown: code, then phone and truck where the seller has them. */
  readonly meta: string;
  /** WHY this row matched, when the hit is not already visible (name and code are). */
  readonly reason: string | null;
}

/**
 * THE ROW'S TWO LINES, decided here so the screen writes no Thai of its own and a proof can
 * read exactly what the weigher reads.
 *
 * The META line tells two sellers with ONE NAME apart at a glance -- code, phone, truck --
 * whatever was typed. The REASON line says which field the search hit when that is not the
 * name or the code the row already shows: `ตรงกับ เบอร์ …`, `ตรงกับ บัตร …1234`,
 * `ตรงกับ ทะเบียน …`. The field the reason names is left out of the meta line, so nothing is
 * said twice. The ID appears ONLY as its last four, and only when the search hit it.
 */
export function sellerRowText(m: SellerMatch): SellerRowText {
  const s = m.seller;
  const usual = (s.vehicle_no ?? "").trim();
  const truck = usual !== "" ? usual : (m.plates[0] ?? "");
  const parts = [s.code];
  if (s.phone && m.via !== "phone") parts.push(`เบอร์ ${s.phone}`);
  if (truck !== "" && !(m.via === "plate" && m.hit === truck)) parts.push(`ทะเบียน ${truck}`);
  let reason: string | null = null;
  if (m.via === "phone" && m.hit) reason = `ตรงกับ เบอร์ ${m.hit}`;
  else if (m.via === "id" && m.hit) reason = `ตรงกับ บัตร …${m.hit}`;
  else if (m.via === "plate" && m.hit) reason = `ตรงกับ ทะเบียน ${m.hit}`;
  return { meta: parts.join(" · "), reason };
}

/**
 * The minimised ID for a LOCAL seller (one this device created): the same rule as the server's
 * master._id_last4 -- whitespace and dashes dropped, the last four characters, null under four.
 * Two callers: the picker, for a row still owed (which holds the ID its creator typed), and the
 * settle, which STORES this in local_sellers.id_last4 and drops the full ID in the same UPDATE
 * (H3, ADVISOR-DECIDED 2026-10-23) -- as does the open-time sweep of rows settled before that.
 */
export function idLast4(idNumber: string | null | undefined): string | null {
  if (idNumber == null) return null;
  const compact = idNumber.replace(/[\s-]+/g, "");
  return compact.length >= 4 ? compact.slice(-4) : null;
}

/* --------------------------------------------------------- vehicle_no ----- */

/**
 * The storable form of a typed plate: trimmed, and blank becomes null.
 *
 * Applied at the EDGES (field blur, bill build) and never on every keystroke —
 * trimming as the operator types makes an internal space impossible to enter,
 * so "70 1234" could never be written.
 */
export function cleanVehicleNo(raw: string | null): string | null {
  const t = (raw ?? "").trim();
  return t === "" ? null : t;
}
