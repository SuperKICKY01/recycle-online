/**
 * Thin HTTP client for the reads the form needs. Bill submission does NOT go
 * through here — that is the sync engine's job, offline-first.
 *
 * Every price arrives as a decimal STRING and stays one. Nothing in this file
 * parses money into a number.
 */
import type { PriceWrite } from "../src/master/priceEdit";
import type { WireCategory, WireProduct } from "../src/master/categories";
import type { DailyFetch } from "../src/reports/dailyView";
import { exchangeShopCode } from "../src/session/shopCode";
import type { ShopCodeResult } from "../src/session/shopCode";
import { attemptLogin, isUnauthorizedStatus } from "../src/session/signInIdentity";
import type { SignInResult } from "../src/session/signInIdentity";
import type { ShopFetch, ShopPatch } from "../src/settings/shopSettings";
import type {
  GradeTierCreateBody,
  GradeTierFetch,
  GradeTierPatchBody,
} from "../src/settings/gradeTierAdmin";
import type { UserCreateBody, UserFetch, UserResetBody } from "../src/users/usersAdmin";
import type { PaymentCreateBody, PaymentFetch, PaymentMethod } from "../src/counter/counterView";
import type { CashMovementBody, ChannelCreateBody, ShiftOpenBody } from "../src/counter/drawerView";
import type {
  EntityCreateBody,
  EntityRenameBody,
  ProductCreateBody,
  ProductFetch,
  ProductPatchBody,
} from "../src/products/productsAdmin";
import type { PasswordChangeRequest, PasswordFetch } from "../src/settings/account";
import type { SummaryFetch } from "../src/dashboard/summaryView";
import type { SellerHistoryFetch } from "../src/sellerHistory/sellerHistoryView";
import { API_BASE_URL } from "./config";
import { withClientVersion } from "../src/net/clientVersion";

/**
 * THE ONE TRANSPORT THIS FILE NOW OWNS. Every request below goes through it, so
 * the API-contract version header is on all of them and no call site has to
 * remember it — the header-on-every-request half of the version contract. The
 * version wrapper adds the header and preserves each caller's content-type and
 * authorization; `.bind` keeps `fetch`'s own receiver.
 */
const apiFetch = withClientVersion(globalThis.fetch.bind(globalThis));

export interface Product {
  id: string;
  code: string;
  name: string;
  uom_code: string;
  uom_name: string;
  /** grade -> price, e.g. { A: "15.50", B: "15.00" }. Strings, always. */
  prices: Record<string, string>;
  /** Joined on the device from GET /product-categories (src/master/categories.ts). */
  category?: { id: string; code: string; name: string } | null;
  is_active?: boolean;
}

/**
 * FIVE FIELDS, AND THE WIRE NOW CARRIES NINE. THE OMISSION IS DELIBERATE.
 *
 * `GET /sellers` returns `id_number`, `address` and `vehicle_no` as well. They
 * are left out of this type on purpose, and this is NOT an inaccuracy waiting
 * to be tidied: a structural type describing a subset is a NARROWING, and here
 * the narrowing is a SECURITY PROPERTY. With no `id_number` on the type, no
 * screen can render one and no code can hand one to `saveSellers` by accident
 * — the compiler's half of the guarantee. The runtime half is the store's fixed
 * INSERT column list (below); widen this type and only that half is left.
 *
 * The add-seller form still holds those three — it sends them through the LOCAL
 * seller draft (`src/sync/localSeller.ts`, `LocalSellerDraft`), which has them.
 * Nothing on the app side needs them back.
 *
 * ---------------------------------------------------------------------------
 * SUPERSEDED 2026-08-17 — HALF OF THE PARAGRAPH ABOVE IS FALSE, AND IT IS THE
 * HALF THAT GUARDS THE WRITE. The original is kept rather than corrected in
 * place: it is the only evidence of how long it stood and of what somebody
 * believed while writing code next to it. It landed at `55b58e9` and was false
 * on the day it landed — this is not a claim that rotted.
 * ---------------------------------------------------------------------------
 * WHICH HALF SURVIVES: "no screen can render one". Reading the field off a
 * value typed as the narrow type is refused — `TS2339: Property 'id_number'
 * does not exist on type 'MasterSeller'`. A screen cannot render what it
 * cannot name, and that much the compiler really does enforce.
 *
 * WHICH HALF IS FALSE: "no code can hand one to `saveSellers` by accident".
 * A wider object IS assignable to a narrower parameter — that is what
 * structural typing MEANS — and excess-property checking bites only on FRESH
 * OBJECT LITERALS. Measured with `tsc -p tsconfig.node.json --noEmit` over one
 * line per way of moving a nine-field server-seller object into a five-field
 * position (the probe used `MasterSeller`, which is these same five fields —
 * `src/master/types.ts` says the two satisfy each other structurally):
 *
 *     const a: MasterSeller = created            COMPILES
 *     const b: MasterSeller = { ...created }     COMPILES
 *     saveSellers([created], "x")                COMPILES
 *     a.id_number                                TS2339
 *     { id, code, name, phone, grade, id_number } TS2353
 *
 * The two the compiler refuses are the two nobody writes by accident. The
 * three it permits are the three an ordinary author reaches for: take what the
 * server returned, put it in the list, hand the list to the store.
 *
 * WHERE THE GUARANTEE ACTUALLY LIVES, and it is one layer down from where this
 * paragraph put it: `SqliteMasterStore.saveSellers` writes a fixed INSERT
 * column list into a table that has no `id_number`, `address` or `vehicle_no`
 * column at all. That is a RUNTIME guarantee, enforced at the cache layer where
 * the server's `/sellers` refresh is written. The security property is real. The
 * compiler is not what enforces it.
 *
 * AND THE PART THAT IS NOT ABOUT THIS COMMENT: a sentence in a file about what
 * OTHER code cannot do is a claim nothing executes, nothing typechecks and no
 * proof drives. It is believed rather than measured — and believed by exactly
 * the reader who is about to write the code it is wrong about.
 *
 * → `lessons/a-narrowing-type-is-not-a-barrier-to-the-object.md`, indexed at
 *   `lessons/README.md § Lessons` "one word apart in English".
 *
 * SUPERSEDED AGAIN 2026-10-12 (seller search C1, migration 0024): "`GET /sellers`
 * returns `id_number`, `address`" is now true only for a caller holding
 * `sellers.read_personal` (owner and admin at birth). For every other caller the
 * server omits both keys, so a staff phone never receives them at all. The phone
 * still caches neither, whoever is signed in.
 *
 * NO SHA ON THIS SUPERSESSION, deliberately: it is written before the commit
 * that carries it, so the only sha available names the tree without it
 * (CLAUDE.md § Conventions, the pin-a-claim corollary). The date stands
 * instead. THE INTERFACE BELOW IS UNCHANGED — the narrowing stays and is still
 * worth having for the half that holds; only the account of what enforces it
 * is corrected.
 */
export interface Seller {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  /** Selects which product price tier applies (SRS 1.6). May be null. */
  grade: string | null;
}

/**
 * A refusal the server ANSWERED, carrying the status.
 *
 * Phase 2c-8 needs this because master data is now fetched with a RESTORED
 * token, which may already be expired — and "the server said 401" and "there is
 * no network" have opposite fixes and opposite screens. Without the status the
 * caller can only string-match a message, which is exactly what
 * lessons/unavailable-is-not-rejected.md and the 401 lesson both forbid: the
 * classification has to come from the status code, not from prose.
 *
 * A thrown fetch (no answer at all) stays a plain Error, so `instanceof` is the
 * whole test. See isUnauthorized below.
 */
export class HttpStatusError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "HttpStatusError";
  }
}

/**
 * The caller is no longer anyone. Nothing to do with the network.
 *
 * The `401` itself is NOT written here: `isUnauthorizedStatus` in
 * src/session/signInIdentity.ts is the single statement of that rule, and this
 * is the entry point for callers holding a caught ERROR rather than a response.
 * One definition, two doors — a second `=== 401` in the tree is how the two
 * would come to disagree.
 */
export const isUnauthorized = (err: unknown): boolean =>
  err instanceof HttpStatusError && isUnauthorizedStatus(err.status);


async function getJson<T>(path: string, token: string): Promise<T> {
  const res = await apiFetch(`${API_BASE_URL}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new HttpStatusError(res.status, `GET ${path} -> HTTP ${String(res.status)}`);
  }
  return (await res.json()) as T;
}

/**
 * TRANSPORT ONLY. It returns every outcome as a VALUE and throws nothing.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS REPLACED, AND WHAT THAT COST THE PERSON AT THE SCALE
 * ---------------------------------------------------------------------------
 * Until this commit the body of this function was four lines: throw
 * `HttpStatusError` on any non-2xx, and cast the parsed body. Two defects came
 * out of it and both reached the operator.
 *
 * EVERY FAILURE ARRIVED AS ONE BRANCH. A thrown status and a thrown fetch are
 * both just exceptions, and `App.tsx`'s single `catch` set `online = false` for
 * all of them. A WRONG PASSWORD therefore rendered the device offline — the
 * server had answered in milliseconds — and at five in the morning that sends
 * somebody to the router while the fix is to type the password again. The
 * reverse cost the same: a genuine outage read as a failed login, and a correct
 * password retyped at a server that was never going to answer.
 *
 * A 200 WITH NO TOKEN WAS A SUCCESS. `as { access_token: string }` is a cast,
 * not a check, so an absent field became `undefined` typed as `string`, and the
 * app entered a signed-in state holding no token: `sessionStateOf` reads
 * `token === null`, which `undefined` is not, so the screen said active. The
 * operator could weigh a full truck against a session incapable of sending one
 * bill. lessons/a-defaulted-getattr-is-a-silent-dead-branch.md is the shape —
 * an absent field read as a confident value.
 *
 * NOTHING IS CLASSIFIED HERE. The mapping lives in
 * src/session/signInIdentity.ts, which a headless proof can load; this file
 * cannot be (it reaches expo-constants through ./config), and a classification
 * no proof can drive is one no assertion can redden. Same rule, and the same
 * reason, as fetchDailyReport below.
 *
 * "Until this commit" is deliberately not a sha. This paragraph ships in the
 * commit that removes what it describes, so no sha yet means what it would need
 * to mean and HEAD would name the commit that still HAS the defect —
 * CLAUDE.md section Conventions "PIN A CLAIM TO A COMMIT". Written 2026-08-11.
 */
/**
 * STEP ONE OF SETUP: a typed shop code for the shop's identifier. Transport
 * only; every outcome is a value and the classification lives in
 * src/session/shopCode.ts for the reason login's does.
 *
 * UNAUTHENTICATED, and the only request this app makes before any principal
 * exists — see server/app/directory.py, which explains why its single refusal
 * covers unknown, malformed and over-long alike.
 */
export function resolveShopCode(code: string): Promise<ShopCodeResult> {
  return exchangeShopCode(() =>
    apiFetch(`${API_BASE_URL}/auth/shop-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    }),
  );
}

export function login(
  tenantId: string,
  username: string,
  password: string,
): Promise<SignInResult> {
  return attemptLogin(() =>
    apiFetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId, username, password }),
    }),
  );
}

export const fetchProducts = (token: string): Promise<WireProduct[]> =>
  getJson<{ products: WireProduct[] }>("/products", token).then((b) => b.products);

/**
 * GET /product-categories — the ACTIVE categories, for the cart's category browse (cart
 * milestone). Any signed-in user may read it (server master.py list_categories). THROWS on a
 * non-2xx like fetchProducts; refreshMaster treats a failure as "no names" and still saves the
 * products, so a product is then listed under ทั้งหมด only.
 */
export const fetchProductCategories = (token: string): Promise<WireCategory[]> =>
  getJson<{ product_categories: WireCategory[] }>("/product-categories", token).then(
    (b) => b.product_categories,
  );

/**
 * PUT /products/{id}/prices/{grade} — TRANSPORT ONLY. P1.9.
 *
 * It does NOT use `getJson` above and it throws nothing. Every outcome comes
 * back as a value, including a body that will not parse, for the reason
 * `fetchDailyReport` gives below: a thrown error has to be classified by the
 * caller, and `instanceof` plus a status number is how a screen ends up
 * branching on transport internals. The classification lives in
 * `src/master/priceEdit.ts`, where a headless proof can enumerate it; this file
 * cannot be reached by the proofs (it pulls in expo-constants through ./config).
 *
 * ONE TIER PER REQUEST, because that is what the route is: `grade` is a PATH
 * parameter and the body carries a single `price`. Editing four tiers is four
 * writes with four outcomes, and this function deliberately does not hide that
 * behind a loop — a partial success is a real state the operator has to be told
 * about, and a helper that returned one answer for four writes would have to
 * invent which one.
 *
 * THE PRICE IS A STRING AND STAYS ONE. It is placed on the wire exactly as the
 * keypad produced it and this file never parses it — hard rule 1, and the same
 * discipline the header of this file states for every price arriving the other
 * way. `JSON.stringify` of a string emits a JSON string, so `numeric(14,2)`
 * receives the digits that were typed and not a double's idea of them.
 */
export async function setProductPrice(
  token: string,
  productId: string,
  grade: string,
  price: string,
): Promise<PriceWrite> {
  /*
   * A TIMEOUT, like the daily report and unlike the master-data reads. Somebody
   * is standing in front of this screen having just typed a price; a fetch that
   * hangs leaves them unable to tell a slow server from a changed price. An
   * abort lands in the `unreachable` branch, which says plainly that NOTHING
   * was changed — which is true, because a request that never completed cannot
   * have been answered, and this path never queues.
   */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await apiFetch(
      `${API_BASE_URL}/products/${encodeURIComponent(productId)}/prices/${encodeURIComponent(grade)}`,
      {
        method: "PUT",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ price }),
        signal: controller.signal,
      },
    );
  } catch {
    return { kind: "unreachable" };
  } finally {
    clearTimeout(timer);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (res.ok) return { kind: "ok", body };

  /*
   * The server's `code` is read from FastAPI's nested `detail` for the UI's
   * WORDING only; the class is decided on the STATUS, which survives a body
   * that fails to parse entirely. Same rule as fetchDailyReport and
   * httpTransport's 403/424 path.
   */
  let code: string | null = null;
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "object" && detail !== null && "code" in detail) {
      const raw = (detail as { code: unknown }).code;
      if (typeof raw === "string") code = raw;
    }
  }
  return { kind: "http", status: res.status, code };
}

export const fetchSellers = (token: string): Promise<Seller[]> =>
  getJson<{ sellers: Seller[] }>("/sellers", token).then((b) => b.sellers);

/**
 * ONE OF THE SHOP'S GRADE TIERS ON THE WIRE (S16 / P1.24).
 *
 * THREE FIELDS, AND THE WIRE CARRIES FIVE — a deliberate narrowing like `Seller`
 * above. `GET /grade-tiers` also returns `id` and `is_active`; the yard cache
 * needs neither (`id` is the settings PATCH's key, and the default fetch is
 * active-only), so they are left off the type. `code` is the FK handle and the
 * price-map key; `name` is the shop's display text; `sort_order` is its order.
 *
 * NOT `GradeTiers`: src/cart/cart.ts owns THAT name for an unrelated price
 * resolver, and leaving it alone was decided rather than overlooked. This is the
 * singular, wire-shaped row — a different thing with a one-letter-apart name, the
 * exact shape lessons/a-label-is-a-reference-with-no-checker.md is about. It
 * satisfies `MasterGradeTier` (src/master/types.ts) structurally, as `Seller`
 * does `MasterSeller`.
 */
export interface GradeTier {
  code: string;
  name: string;
  sort_order: number;
}

/**
 * GET /grade-tiers — the shop's ACTIVE tiers, in the shop's order. A master-data
 * read, so it uses `getJson` and THROWS on a non-2xx exactly as fetchProducts and
 * fetchSellers do; refreshMaster catches it per-list. The default (active only) is
 * what the yard prices and draws with — the settings screen asks for the inactive
 * ones separately, and never through the cache.
 */
export const fetchGradeTiers = (token: string): Promise<GradeTier[]> =>
  getJson<{ grade_tiers: GradeTier[] }>("/grade-tiers", token).then((b) => b.grade_tiers);

/* ------------------------------------------------- the daily money view ---- */

/**
 * GET /reports/daily — TRANSPORT ONLY. No meaning is attached here.
 *
 * It returns a DailyFetch and nothing else: a status, a machine-readable code, or
 * "no answer". Every decision about what any of that MEANS — which are calm, which
 * offer a sign-in, which may show a number — lives in src/reports/dailyView.ts,
 * where a headless proof can enumerate it. This file cannot be reached by the
 * proofs (it imports expo-constants through ./config), and that is exactly why
 * nothing that decides anything may live in it.
 *
 * It does NOT throw and it does not use getJson above. A thrown error would have
 * to be classified by the caller, and `instanceof` plus a status number is how a
 * screen ends up branching on transport internals. Every outcome, including a
 * body that will not parse, comes back as a value.
 *
 * THE CODE COMES FROM THE BODY AND THE CLASSIFICATION DOES NOT. FastAPI nests its
 * HTTPException detail under `detail`, so the server's `code` is read from there
 * for the UI's WORDING only — the class is decided on the status, which survives a
 * body that fails to parse entirely. Same rule as httpTransport's 403/424 path.
 */
export async function fetchDailyReport(
  token: string,
  date: string | null,
): Promise<DailyFetch> {
  const query = date === null ? "" : `?date=${encodeURIComponent(date)}`;
  /*
   * A TIMEOUT, unlike the master-data reads above. This is a screen someone is
   * standing in front of at closing time: a fetch that hangs leaves a spinner
   * with no end and no explanation, whereas an abort lands in the calm
   * "cannot reach the server" branch with a retry button. The endpoint is a
   * sequential scan over the tenant's bill history (no index on the day
   * predicate — a recorded, deliberate limit), so the budget is generous.
   */
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await apiFetch(`${API_BASE_URL}/reports/daily${query}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
  } catch {
    // Timeout, DNS, no route, aeroplane mode — we never reached the server.
    return { kind: "unreachable" };
  } finally {
    clearTimeout(timer);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (res.ok) return { kind: "ok", body };

  let code: string | null = null;
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "object" && detail !== null && "code" in detail) {
      const raw = (detail as { code: unknown }).code;
      if (typeof raw === "string") code = raw;
    }
  }
  return { kind: "http", status: res.status, code };
}

/*
 * listPriceFor USED TO LIVE HERE. It is now gradePrice in src/cart/sellers.ts,
 * for two reasons.
 *
 * It had to become provable: the grade -> tier rule is the thing Phase 2c-6
 * turns into a per-bill decision, and a function in app/ cannot be reached by a
 * headless proof (this file pulls in expo-constants through ./config).
 *
 * And it had to lose its fallback. It used to return the first tier present
 * when the seller had no grade "so the field is never blank" — which quoted
 * grade A, the HIGHEST tier, for exactly the sellers whose bills the server
 * refuses (424 seller_grade_unset). The yard pays cash against that number, so
 * the fallback could never make the bill valid, only make the shop overpay
 * before finding out. gradePrice returns null instead and the picker says which
 * sellers are in that state.
 */

/* ------------------------------------------------- the shop's own settings ---- */

/**
 * The `detail.code` a FastAPI HTTPException nests, for the UI's WORDING only —
 * the class is decided on the STATUS, which survives a body that fails to parse.
 * Same rule setProductPrice and fetchDailyReport follow inline; shared here for the
 * settings/account transports below.
 */
function codeFrom(body: unknown): string | null {
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "object" && detail !== null && "code" in detail) {
      const raw = (detail as { code: unknown }).code;
      if (typeof raw === "string") return raw;
    }
  }
  return null;
}

/**
 * TRANSPORT ONLY. Every outcome is a VALUE and nothing is thrown — the same shape
 * setProductPrice and fetchDailyReport use, and for the same reason: a thrown
 * error would be classified by `instanceof` at a screen, and the classification
 * belongs in src/ where a headless proof can enumerate it, not in this file (it
 * reaches expo-constants through ./config and cannot be loaded by the proofs). A
 * 20 s timeout, because these are screens someone is standing in front of; an
 * abort lands in `unreachable`, which never queues because settings has no outbox.
 */
async function transportJson(
  makeRequest: (signal: AbortSignal) => Promise<Response>,
): Promise<
  | { kind: "ok"; body: unknown }
  | { kind: "http"; status: number; code: string | null }
  | { kind: "unreachable" }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await makeRequest(controller.signal);
  } catch {
    return { kind: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok) return { kind: "ok", body };
  return { kind: "http", status: res.status, code: codeFrom(body) };
}

/** GET /whoami — the caller's own identity, server-resolved (username + the role
 *  the server read from the row this request, not the token's stale claim).
 *  Transport only; the account screen parses it (src/settings/account.readWhoAmI). */
export function fetchWhoAmI(token: string): Promise<PasswordFetch> {
  return transportJson((signal) =>
    apiFetch(`${API_BASE_URL}/whoami`, {
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/** GET /shop — the shop's own settings. Staff-readable; the classification is in
 *  src/settings/shopSettings.ts. Returns a value, never throws. */
export function fetchShop(token: string): Promise<ShopFetch> {
  return transportJson((signal) =>
    apiFetch(`${API_BASE_URL}/shop`, {
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/**
 * GET /sellers/{seller_id}/history — a seller's recent bills at the weighbridge
 * (P1.21). TRANSPORT ONLY; the classification (money gate, shop-date, empty and
 * failure branches) lives in src/sellerHistory/sellerHistoryView.ts, where a
 * headless proof can enumerate it. Returns a value, never throws. `no_token` is
 * the caller's case (App checks the token first, as the summary and daily reads
 * do), so this returns ok/http/unreachable — a strict subset of
 * SellerHistoryFetch. The limit is the server's default (the picker wants the
 * last few loads); seller_id is a path parameter, encoded like setProductPrice's.
 */
export function fetchSellerHistory(token: string, sellerId: string): Promise<SellerHistoryFetch> {
  return transportJson((signal) =>
    apiFetch(`${API_BASE_URL}/sellers/${encodeURIComponent(sellerId)}/history`, {
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/* -------------------------------------------------- the cashier counter (2.1) ---- */

type PaymentFetchNoToken = Exclude<PaymentFetch, { kind: "no_token" }>;

/**
 * GET /bills?unpaid=true — the cashier's unpaid queue (bills.py list_bills).
 * TRANSPORT ONLY; counterScreenState (src/counter/counterView.ts) classifies it,
 * where a headless proof reaches the classification. Body-keeping so the shape is
 * the counter's PaymentFetch; `no_token` is App's case (it checks the token first,
 * the counter being online-only). Returns a value, never throws.
 */
export function fetchUnpaidBills(token: string): Promise<PaymentFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/bills?unpaid=true`, {
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/**
 * POST /payments — record money leaving the drawer (payments.py). TRANSPORT ONLY;
 * paymentOutcome classifies it and NEEDS the body kept, because the 424/422 split
 * turns on the refusal's `code`. The amount and every allocation are STRINGS placed
 * on the wire exactly as the model produced them (hard rule 1); this file parses no
 * money. Returns a value, never throws.
 */
export function postPayment(token: string, body: PaymentCreateBody): Promise<PaymentFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/payments`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    }),
  );
}

/**
 * GET /shop/policy — the caller's branch counter policy (master.py, the counter
 * unit's read route). THROWS on a non-2xx like fetchProducts, so refreshMaster's
 * 401 handling ends the session; a 200 gives {separate_cashier, branch_id}, which
 * SqliteShopPolicyStore caches for the offline entry gate (STRUCTURE.md 1.4).
 */
export function fetchShopPolicy(
  token: string,
): Promise<{ separate_cashier: boolean | null; branch_id: string | null; shifts_enabled?: boolean | null }> {
  // shifts_enabled arrived with the shifts unit's commit 2 and is OPTIONAL here: a
  // server from before it does not send the key, and absent reads as unknown.
  return getJson<{ separate_cashier: boolean | null; branch_id: string | null; shifts_enabled?: boolean | null }>(
    "/shop/policy",
    token,
  );
}

/* ------------------------------------ the cash drawer and its settings (2.4) ---- */

/*
 * THE SHIFTS UNIT, commit 3. TRANSPORT ONLY, body-keeping, never throwing — the
 * counter's shape, and for its reason: every classification (the pay-gate, the shift
 * state, the (status, code) wording) lives in src/counter/drawerView.ts where a
 * headless proof reaches it. Money is a STRING on the wire exactly as the model built
 * it; nothing here parses an amount. `no_token` is App's case: it checks first.
 */

const jsonHeaders = (token: string) => ({
  "content-type": "application/json",
  authorization: `Bearer ${token}`,
});

/** GET /shop/policy as a VALUE (the counter reads it LIVE on open: R7 needs the
 *  branch's active methods and shifts_enabled, and a failure must be classifiable
 *  as UNKNOWN rather than thrown — fetchShopPolicy above throws for refreshMaster). */
export function fetchShopPolicyValue(token: string): Promise<PaymentFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/shop/policy`, { headers: { authorization: `Bearer ${token}` }, signal }),
  );
}

/** GET /shifts/current — 404 no_open_shift is an ANSWER, classified by shiftState. */
export function fetchCurrentShift(token: string): Promise<PaymentFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/shifts/current`, { headers: { authorization: `Bearer ${token}` }, signal }),
  );
}

/** POST /shifts — open with the float the cashier counted. */
export function postOpenShift(token: string, body: ShiftOpenBody): Promise<PaymentFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/shifts`, {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify(body),
      signal,
    }),
  );
}

/** POST /shifts/{id}/close — the COUNT only (R2). The reason is never sent here: it
 *  is written after the cashier has seen the variance (PATCH below, R3). */
export function postCloseShift(token: string, shiftId: string, countedCash: string): Promise<PaymentFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/shifts/${encodeURIComponent(shiftId)}/close`, {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify({ counted_cash: countedCash }),
      signal,
    }),
  );
}

/** PATCH /shifts/{id} — the variance reason, once (a second is 409 by the trigger). */
export function patchShiftReason(token: string, shiftId: string, reason: string): Promise<PaymentFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/shifts/${encodeURIComponent(shiftId)}`, {
      method: "PATCH",
      headers: jsonHeaders(token),
      body: JSON.stringify({ variance_reason: reason }),
      signal,
    }),
  );
}

/** POST /cash-movements — a float in/out, an expense, a deposit to the bank. */
export function postCashMovement(token: string, body: CashMovementBody): Promise<PaymentFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/cash-movements`, {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify(body),
      signal,
    }),
  );
}

/** GET /shop/payment-channels — masked by the SERVER below shop.settings.write. */
export function fetchPaymentChannels(token: string): Promise<PaymentFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/shop/payment-channels`, { headers: { authorization: `Bearer ${token}` }, signal }),
  );
}

/** POST /shop/payment-channels — one of the shop's own accounts. */
export function postPaymentChannel(token: string, body: ChannelCreateBody): Promise<PaymentFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/shop/payment-channels`, {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify(body),
      signal,
    }),
  );
}

/** PATCH /shop/payment-channels/{id} — only is_active is ever sent from the phone
 *  (the identifying fields are immutable server-side, and the label is not edited here). */
export function deactivatePaymentChannel(token: string, channelId: string): Promise<PaymentFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/shop/payment-channels/${encodeURIComponent(channelId)}`, {
      method: "PATCH",
      headers: jsonHeaders(token),
      body: JSON.stringify({ is_active: false }),
      signal,
    }),
  );
}

/** PATCH /branches/{id} with shifts_enabled ONLY (separate_cashier is not touched). */
export function patchBranchShiftsEnabled(token: string, branchId: string, on: boolean): Promise<PaymentFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/branches/${encodeURIComponent(branchId)}`, {
      method: "PATCH",
      headers: jsonHeaders(token),
      body: JSON.stringify({ shifts_enabled: on }),
      signal,
    }),
  );
}

/** PUT /branches/{id}/payment-methods/{method} — switch one method on or off. */
export function putBranchMethod(
  token: string,
  branchId: string,
  method: PaymentMethod,
  on: boolean,
): Promise<PaymentFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(
      `${API_BASE_URL}/branches/${encodeURIComponent(branchId)}/payment-methods/${encodeURIComponent(method)}`,
      { method: "PUT", headers: jsonHeaders(token), body: JSON.stringify({ is_active: on }), signal },
    ),
  );
}

/** PATCH /shop — admin-only on the server. `patch` carries ONLY the changed
 *  fields; an empty patch is never sent (shopPatchBody/patchIsEmpty decide that). */
export function patchShop(token: string, patch: ShopPatch): Promise<ShopFetch> {
  return transportJson((signal) =>
    apiFetch(`${API_BASE_URL}/shop`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
      signal,
    }),
  );
}

/* ---------------------------------------------- the shop's grade tiers (S16) ---- */

/**
 * TRANSPORT ONLY, BUT KEEPING THE BODY ON A REFUSAL. The grade-tier admin needs the
 * body an http error carries — the deactivation refusal's `sellers_in_tier` count
 * (F4) — so this differs from `transportJson` in exactly that: it returns the body
 * on `http` instead of pre-reading a `code`. Everything else is the same: every
 * outcome is a VALUE, nothing is thrown, and a 20 s timeout lands in `unreachable`,
 * which never queues (tier admin is not offline work). The classification still
 * lives in src/settings/gradeTierAdmin.ts, where a headless proof can reach it.
 */
async function transportJsonKeepingBody(
  makeRequest: (signal: AbortSignal) => Promise<Response>,
): Promise<Exclude<GradeTierFetch, { kind: "no_token" }>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let res: Response;
  try {
    res = await makeRequest(controller.signal);
  } catch {
    return { kind: "unreachable" };
  } finally {
    clearTimeout(timer);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok) return { kind: "ok", body };
  return { kind: "http", status: res.status, body };
}

/** GET /grade-tiers?include_inactive — the shop's tiers for the settings admin
 *  (active AND inactive; the yard cache holds only the active ones). Staff-readable;
 *  the CRUD below is admin-only on the server. Returns a value, never throws. */
export function fetchGradeTiersAdmin(token: string): Promise<GradeTierFetch> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/grade-tiers?include_inactive=true`, {
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/** POST /grade-tiers — declare a tier. Admin-only on the server; a duplicate code
 *  is a 409 the caller words. The server appends it (sort_order = max + 1). */
export function createGradeTier(
  token: string,
  body: GradeTierCreateBody,
): Promise<GradeTierFetch> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/grade-tiers`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    }),
  );
}

/** PATCH /grade-tiers/{id} — rename or (de)activate a tier. Admin-only. `code` is
 *  never sent (immutable). Deactivation is refused with a 409 whose body carries the
 *  `sellers_in_tier` count (F4), or `grade_tier_last_active` when it is the shop's
 *  last active tier (F1). */
export function patchGradeTier(
  token: string,
  tierId: string,
  patch: GradeTierPatchBody,
): Promise<GradeTierFetch> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/grade-tiers/${encodeURIComponent(tierId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
      signal,
    }),
  );
}

/** PUT /grade-tiers/order — rewrite the shop's WHOLE tier order in ONE write.
 *  Admin-only. `order` lists every tier id in the intended order; the server rewrites
 *  sort_order from position in one transaction. A partial or foreign list is a 422
 *  (grade_tier_order_invalid). An ordering is a single fact about the set, so it
 *  moves as one PUT, never a sequence of per-tier writes that could half-apply. */
export function reorderGradeTiers(
  token: string,
  order: readonly string[],
): Promise<GradeTierFetch> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/grade-tiers/order`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ order }),
      signal,
    }),
  );
}

/* ------------------------------------------------ the shop's people (P3.7) ---- */

/**
 * The user routes, all admin-only on the server, all keeping the body on a refusal
 * (a 409 carries the `code` that tells `last_active_admin` from a duplicate
 * username). The classification lives in src/users/usersAdmin.ts; `no_token` is the
 * caller's case (App checks the token first), so these return the ok/http/
 * unreachable subset. Every outcome is a VALUE, nothing is thrown, nothing queues —
 * user management is not offline work.
 */
type UserFetchNoToken = Exclude<UserFetch, { kind: "no_token" }>;

/** GET /users?include_inactive — the roster for the admin (active AND inactive; the
 *  yard never reads this). A staff caller is refused 403 on the server. */
export function fetchUsers(token: string): Promise<UserFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/users?include_inactive=true`, {
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/** POST /users — bring an account into existence, its first password included. A
 *  duplicate username is a 409 the caller words. */
export function createUser(token: string, body: UserCreateBody): Promise<UserFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/users`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    }),
  );
}

/** POST /users/{id}/deactivate — lock an account; its live sessions end now.
 *  Refused 409 last_active_admin when it is the shop's last active admin. No body. */
export function deactivateUser(token: string, userId: string): Promise<UserFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/deactivate`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/** POST /users/{id}/activate — unlock an account. Idempotent. No body. */
export function activateUser(token: string, userId: string): Promise<UserFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/activate`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/** POST /users/{id}/password — an admin sets another user's password; the target's
 *  sessions end, the caller's do not. */
export function resetUserPassword(
  token: string,
  userId: string,
  body: UserResetBody,
): Promise<UserFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/users/${encodeURIComponent(userId)}/password`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    }),
  );
}

/* ------------------------------------------- product master data (P1.15) ---- */

/**
 * The product / category / unit ADMIN routes, all admin-only on the server, all
 * keeping the body on a refusal (a 409 carries `duplicate_code`, the one code these
 * routes raise). The classification lives in src/products/productsAdmin.ts;
 * `no_token` is the caller's case (App checks the token first), so these return the
 * ok/http/unreachable subset. Every outcome is a VALUE, nothing is thrown, nothing
 * queues — product management is not offline work. The reads ask for
 * `?include_inactive=true`: this screen must see retired rows to filter and
 * reactivate them, which the yard cache (active only) deliberately cannot answer.
 */
type ProductFetchNoToken = Exclude<ProductFetch, { kind: "no_token" }>;

/** GET /products?include_inactive — every product (active AND retired), for the
 *  admin. A staff caller is not refused the READ (the yard reads /products to price
 *  bills), but the ENTRY is admin-only, so a staff session never calls this. */
export function fetchProductsAdmin(token: string): Promise<ProductFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/products?include_inactive=true`, {
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/** POST /products — bring a product into existence. A duplicate code is a 409 the
 *  caller words; a foreign/retired category or unit is a 422. No price tiers yet —
 *  that is the correct state (server create_product's note). */
export function createProduct(token: string, body: ProductCreateBody): Promise<ProductFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/products`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    }),
  );
}

/** PATCH /products/{id} — edit name / category / unit. `code` is never sent
 *  (immutable). A retired category or unit is a 422 (category_inactive / uom_inactive). */
export function patchProduct(
  token: string,
  productId: string,
  body: ProductPatchBody,
): Promise<ProductFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/products/${encodeURIComponent(productId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    }),
  );
}

/** POST /products/{id}/deactivate — retire a product. It KEEPS answering for every
 *  bill that references it (server/app/bills.py); only new bills against it are
 *  refused (424 product_inactive, resolvable). No body. */
export function deactivateProduct(token: string, productId: string): Promise<ProductFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/products/${encodeURIComponent(productId)}/deactivate`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/** POST /products/{id}/activate — un-retire a product. Idempotent. No body. */
export function activateProduct(token: string, productId: string): Promise<ProductFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/products/${encodeURIComponent(productId)}/activate`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/** GET /product-categories?include_inactive — every category, for the grouping and
 *  the add-product form's picker (which offers the active ones only). */
export function fetchCategoriesAdmin(token: string): Promise<ProductFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/product-categories?include_inactive=true`, {
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/** POST /product-categories — declare a category. Duplicate code is a 409. */
export function createCategory(token: string, body: EntityCreateBody): Promise<ProductFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/product-categories`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    }),
  );
}

/** PATCH /product-categories/{id} — rename (the server accepts only `name`). */
export function renameCategory(
  token: string,
  categoryId: string,
  body: EntityRenameBody,
): Promise<ProductFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/product-categories/${encodeURIComponent(categoryId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    }),
  );
}

/** POST /product-categories/{id}/deactivate — retire a category (never cascades;
 *  existing products keep it, only NEW ones are refused it). No body. */
export function deactivateCategory(token: string, categoryId: string): Promise<ProductFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/product-categories/${encodeURIComponent(categoryId)}/deactivate`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/** POST /product-categories/{id}/activate — un-retire a category. Idempotent. No body. */
export function activateCategory(token: string, categoryId: string): Promise<ProductFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/product-categories/${encodeURIComponent(categoryId)}/activate`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/** GET /uoms?include_inactive — every unit, for the add-product form's picker. */
export function fetchUomsAdmin(token: string): Promise<ProductFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/uoms?include_inactive=true`, {
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/** POST /uoms — declare a unit. Duplicate code is a 409. */
export function createUom(token: string, body: EntityCreateBody): Promise<ProductFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/uoms`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    }),
  );
}

/** PATCH /uoms/{id} — rename (the server accepts only `name`). A retired unit still
 *  renders on every product measured in it (server _PRODUCT_SELECT's note). */
export function renameUom(
  token: string,
  uomId: string,
  body: EntityRenameBody,
): Promise<ProductFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/uoms/${encodeURIComponent(uomId)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal,
    }),
  );
}

/** POST /uoms/{id}/deactivate — retire a unit (never cascades). No body. */
export function deactivateUom(token: string, uomId: string): Promise<ProductFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/uoms/${encodeURIComponent(uomId)}/deactivate`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/** POST /uoms/{id}/activate — un-retire a unit. Idempotent. No body. */
export function activateUom(token: string, uomId: string): Promise<ProductFetchNoToken> {
  return transportJsonKeepingBody((signal) =>
    apiFetch(`${API_BASE_URL}/uoms/${encodeURIComponent(uomId)}/activate`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/**
 * GET /reports/summary — the dashboard's period aggregation. TRANSPORT ONLY; the
 * classification lives in src/dashboard/summaryView.ts, where a headless proof can
 * enumerate it. Returns a value, never throws. `no_token` is the caller's case (App
 * checks the token first, as it does for the daily report), so this returns only
 * ok/http/unreachable — a strict subset of SummaryFetch.
 *
 * The query is built by hand with encodeURIComponent rather than URLSearchParams:
 * that global is unverified under Hermes here, in the same family as atob and
 * crypto.randomUUID (deviceRole.ts, shopTime.ts). `by`/`state` are validated device
 * strings and the device also bounds the date span (period.ts), so the route's 422s
 * are never provoked by an ordinary user.
 */
export function fetchSummary(
  token: string,
  params: { from_date: string; to_date: string; by: string; state: string },
): Promise<SummaryFetch> {
  const query =
    `?from_date=${encodeURIComponent(params.from_date)}` +
    `&to_date=${encodeURIComponent(params.to_date)}` +
    `&by=${encodeURIComponent(params.by)}` +
    `&state=${encodeURIComponent(params.state)}`;
  return transportJson((signal) =>
    apiFetch(`${API_BASE_URL}/reports/summary${query}`, {
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/**
 * POST /users/me/password — change THIS account's own password. On success the
 * server bumps token_version and this token dies; the caller (src/settings/
 * account.ts) treats that as a session end. The body is validated on the device
 * first (checkPasswordForm), so an ordinary user never provokes the route's 422.
 */
export function changeOwnPassword(
  token: string,
  request: PasswordChangeRequest,
): Promise<PasswordFetch> {
  return transportJson((signal) =>
    apiFetch(`${API_BASE_URL}/users/me/password`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(request),
      signal,
    }),
  );
}
