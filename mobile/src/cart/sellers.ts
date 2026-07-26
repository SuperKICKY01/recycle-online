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

/** Why a row matched, so the picker can show the operator what it hit on. */
export type MatchVia = "code" | "name" | "plate";

export interface SellerMatch {
  seller: SellerOption;
  /** Plates this device has recorded for them, newest first. May be empty. */
  plates: readonly string[];
  /** Null when the query was empty — everything matches and nothing was hit. */
  via: MatchVia | null;
}

/** Lower is better. Exact code beats a prefix beats a plate beats a substring. */
const RANK_EXACT_CODE = 0;
const RANK_PREFIX = 1;
const RANK_PLATE = 2;
const RANK_CONTAINS = 3;
const RANK_NONE = 9;

interface Scored {
  rank: number;
  via: MatchVia | null;
}

/** Best (lowest) rank this ONE token achieves against this seller. */
function scoreToken(
  token: string,
  code: string,
  name: string,
  plates: readonly string[],
): Scored {
  if (code === token) return { rank: RANK_EXACT_CODE, via: "code" };
  if (code.startsWith(token)) return { rank: RANK_PREFIX, via: "code" };
  if (name.startsWith(token)) return { rank: RANK_PREFIX, via: "name" };
  if (plates.some((p) => p.includes(token))) return { rank: RANK_PLATE, via: "plate" };
  if (name.includes(token)) return { rank: RANK_CONTAINS, via: "name" };
  if (code.includes(token)) return { rank: RANK_CONTAINS, via: "code" };
  return { rank: RANK_NONE, via: null };
}

/**
 * Sellers matching `query`, best first.
 *
 * EVERY token must hit something — typing more narrows, it never widens — but a
 * token may hit any of name, code or a recorded plate. That is what makes
 * "ส 70" work: one token lands on the name, the other on the truck.
 *
 * An empty query returns everything in code order, so the picker opens on the
 * full list rather than on nothing.
 */
export function searchSellers(
  sellers: readonly SellerOption[],
  query: string,
  platesBySeller: ReadonlyMap<string, readonly string[]>,
): SellerMatch[] {
  const tokens = query
    .trim()
    .split(/\s+/)
    .map(fold)
    .filter((t) => t !== "");

  const rows: { m: SellerMatch; rank: number }[] = [];

  for (const seller of sellers) {
    const plates = platesBySeller.get(seller.id) ?? [];
    if (tokens.length === 0) {
      rows.push({ m: { seller, plates, via: null }, rank: RANK_NONE });
      continue;
    }

    const code = fold(seller.code);
    const name = fold(seller.name);
    const folded = plates.map(fold);

    let worst = RANK_EXACT_CODE;
    let best: Scored = { rank: RANK_NONE, via: null };
    let all = true;
    for (const t of tokens) {
      const s = scoreToken(t, code, name, folded);
      if (s.rank === RANK_NONE) {
        all = false;
        break;
      }
      if (s.rank > worst) worst = s.rank;
      if (s.rank < best.rank) best = s;
    }
    if (!all) continue;
    rows.push({ m: { seller, plates, via: best.via }, rank: worst });
  }

  // Rank first, then code — a stable, predictable order rather than whatever
  // the server happened to return.
  rows.sort((a, b) =>
    a.rank !== b.rank ? a.rank - b.rank : a.m.seller.code.localeCompare(b.m.seller.code),
  );
  return rows.map((r) => r.m);
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
