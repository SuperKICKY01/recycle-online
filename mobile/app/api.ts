/**
 * Thin HTTP client for the reads the form needs. Bill submission does NOT go
 * through here — that is the sync engine's job, offline-first.
 *
 * Every price arrives as a decimal STRING and stays one. Nothing in this file
 * parses money into a number.
 */
import type { DailyFetch } from "../src/reports/dailyView";
import { exchangeShopCode } from "../src/session/shopCode";
import type { ShopCodeResult } from "../src/session/shopCode";
import { attemptLogin, isUnauthorizedStatus } from "../src/session/signInIdentity";
import type { SignInResult } from "../src/session/signInIdentity";
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
 * — the compiler's half of the guarantee that proveSellerCreate's C6 proves at
 * the cache layer. Widen this and only the runtime proof is left.
 *
 * A form sends those three through `SellerDraft` in `src/master/createSeller.ts`,
 * which has them. Nothing on the app side needs them back.
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
