/**
 * Thin HTTP client for the reads the form needs. Bill submission does NOT go
 * through here — that is the sync engine's job, offline-first.
 *
 * Every price arrives as a decimal STRING and stays one. Nothing in this file
 * parses money into a number.
 */
import type { DailyFetch } from "../src/reports/dailyView";
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

/** The caller is no longer anyone. Nothing to do with the network. */
export const isUnauthorized = (err: unknown): boolean =>
  err instanceof HttpStatusError && err.status === 401;

async function getJson<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new HttpStatusError(res.status, `GET ${path} -> HTTP ${String(res.status)}`);
  }
  return (await res.json()) as T;
}

export async function login(
  tenantId: string,
  username: string,
  password: string,
): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenant_id: tenantId, username, password }),
  });
  if (!res.ok) throw new HttpStatusError(res.status, `login -> HTTP ${String(res.status)}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
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
