/**
 * Thin HTTP client for the reads the form needs. Bill submission does NOT go
 * through here — that is the sync engine's job, offline-first.
 *
 * Every price arrives as a decimal STRING and stays one. Nothing in this file
 * parses money into a number.
 */
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

async function getJson<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET ${path} -> HTTP ${String(res.status)}`);
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
  if (!res.ok) throw new Error(`login -> HTTP ${String(res.status)}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

export const fetchProducts = (token: string): Promise<Product[]> =>
  getJson<{ products: Product[] }>("/products", token).then((b) => b.products);

export const fetchSellers = (token: string): Promise<Seller[]> =>
  getJson<{ sellers: Seller[] }>("/sellers", token).then((b) => b.sellers);

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
