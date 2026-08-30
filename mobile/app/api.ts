/**
 * Thin HTTP client for the reads the form needs. Bill submission does NOT go
 * through here — that is the sync engine's job, offline-first.
 *
 * Every price arrives as a decimal STRING and stays one. Nothing in this file
 * parses money into a number.
 */
import type { PriceWrite } from "../src/master/priceEdit";
import type { DailyFetch } from "../src/reports/dailyView";
import { exchangeShopCode } from "../src/session/shopCode";
import type { ShopCodeResult } from "../src/session/shopCode";
import { attemptLogin, isUnauthorizedStatus } from "../src/session/signInIdentity";
import type { SignInResult } from "../src/session/signInIdentity";
import type { ShopFetch, ShopPatch } from "../src/settings/shopSettings";
import type { PasswordChangeRequest, PasswordFetch } from "../src/settings/account";
import { API_BASE_URL } from "./config";

export interface Product {
  id: string;
  code: string;
  name: string;
  uom_code: string;
  uom_name: string;
  /** grade -> price, e.g. { A: "15.50", B: "15.00" }. Strings, always. */
  prices: Record<string, string>;
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
  const res = await fetch(`${API_BASE_URL}${path}`, {
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
    fetch(`${API_BASE_URL}/auth/shop-code`, {
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
    fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId, username, password }),
    }),
  );
}

export const fetchProducts = (token: string): Promise<Product[]> =>
  getJson<{ products: Product[] }>("/products", token).then((b) => b.products);

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
    res = await fetch(
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
    res = await fetch(`${API_BASE_URL}/reports/daily${query}`, {
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
    fetch(`${API_BASE_URL}/whoami`, {
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/** GET /shop — the shop's own settings. Staff-readable; the classification is in
 *  src/settings/shopSettings.ts. Returns a value, never throws. */
export function fetchShop(token: string): Promise<ShopFetch> {
  return transportJson((signal) =>
    fetch(`${API_BASE_URL}/shop`, {
      headers: { authorization: `Bearer ${token}` },
      signal,
    }),
  );
}

/** PATCH /shop — admin-only on the server. `patch` carries ONLY the changed
 *  fields; an empty patch is never sent (shopPatchBody/patchIsEmpty decide that). */
export function patchShop(token: string, patch: ShopPatch): Promise<ShopFetch> {
  return transportJson((signal) =>
    fetch(`${API_BASE_URL}/shop`, {
      method: "PATCH",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
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
    fetch(`${API_BASE_URL}/users/me/password`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(request),
      signal,
    }),
  );
}
