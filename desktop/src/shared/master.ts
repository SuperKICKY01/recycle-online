/**
 * MASTER DATA ON THE DESKTOP (B5, SRS 1.1–1.6) — pure: the wire shapes, the field rules the screen
 * checks before asking, search, and the seller PATCH body.
 *
 * The server owns every rule (codes unique and immutable, a retired category not offered for a new
 * product, a tier not retired while sellers sit in it, who may write what); this module only
 * refuses what is plainly incomplete before a request, and words nothing the server words itself.
 *
 * NOTHING IS DELETED: every entity is retired (deactivate) and brought back (activate).
 *
 * PERSONAL DATA (migration 0024): a seller's `id_number` and `address` arrive only for a caller
 * holding `sellers.read_personal`. Absent keys are NOT empty values -- `sellerPatch` never sends
 * either key for a caller without the permission, so an edit by such a caller cannot erase them.
 */
import { DEDUCTION_SETTINGS, oneOf, PRICING_BASES, type DeductionSetting, type PricingBasis } from "./moneyRules";

export interface CodeName {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly is_active: boolean;
}

export interface Product extends CodeName {
  readonly category_id: string;
  readonly uom_id: string;
  readonly uom_code: string;
  readonly uom_name: string;
  /** tier code -> price, the server's decimal strings */
  readonly prices: Readonly<Record<string, string>>;
  /** Server migration 0027: what the price multiplies, the product's OWN deduction rule (null =
   *  follow the shop), and the rule in force as the server resolves it. Weight / null / none from a
   *  server before 0027. */
  readonly pricing_basis: PricingBasis;
  readonly deduction_mode: DeductionSetting | null;
  readonly deduction_mode_effective: DeductionSetting;
}

export interface Tier extends CodeName {
  readonly sort_order: number;
}

export interface Seller extends CodeName {
  readonly phone: string | null;
  readonly grade: string | null;
  readonly vehicle_no: string | null;
  /** Present only for a sellers.read_personal holder (undefined = not shown to this caller). */
  readonly id_number?: string | null;
  readonly address?: string | null;
  readonly id_last4: string | null;
}

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

function readCodeName(v: unknown): CodeName | null {
  const o = v as Record<string, unknown> | null;
  if (o === null || typeof o !== "object") return null;
  if (typeof o["id"] !== "string" || typeof o["code"] !== "string" || typeof o["name"] !== "string" || typeof o["is_active"] !== "boolean") return null;
  return { id: o["id"], code: o["code"], name: o["name"], is_active: o["is_active"] };
}

function readArray<T>(json: unknown, key: string, one: (v: unknown) => T | null): T[] | null {
  const a = (json as Record<string, unknown> | null)?.[key];
  if (!Array.isArray(a)) return null;
  const out = a.map(one);
  return out.every((x): x is T => x !== null) ? out : null;
}

export const readCodeNames = (key: string) => (json: unknown): CodeName[] | null => readArray(json, key, readCodeName);
export const readOneCodeName = (json: unknown): CodeName | null => readCodeName(json);

export function readProduct(v: unknown): Product | null {
  const base = readCodeName(v);
  const o = v as Record<string, unknown>;
  if (base === null || typeof o["category_id"] !== "string" || typeof o["uom_id"] !== "string") return null;
  const prices = o["prices"];
  if (prices === null || typeof prices !== "object") return null;
  const p: Record<string, string> = {};
  for (const [k, val] of Object.entries(prices as Record<string, unknown>)) {
    if (typeof val !== "string") return null; // a price is a decimal STRING, never a number (hard rule 1)
    p[k] = val;
  }
  return { ...base, category_id: o["category_id"], uom_id: o["uom_id"], uom_code: String(o["uom_code"] ?? ""), uom_name: String(o["uom_name"] ?? ""), prices: p,
    pricing_basis: oneOf(o["pricing_basis"], PRICING_BASES) ?? "weight",
    deduction_mode: oneOf(o["deduction_mode"], DEDUCTION_SETTINGS),
    deduction_mode_effective: oneOf(o["deduction_mode_effective"], DEDUCTION_SETTINGS) ?? "none" };
}
export const readProducts = (json: unknown): Product[] | null => readArray(json, "products", readProduct);

export function readTier(v: unknown): Tier | null {
  const base = readCodeName(v);
  const o = v as Record<string, unknown>;
  if (base === null || typeof o["sort_order"] !== "number") return null;
  return { ...base, sort_order: o["sort_order"] };
}
export const readTiers = (json: unknown): Tier[] | null => readArray(json, "grade_tiers", readTier);

export function readSeller(v: unknown): Seller | null {
  const base = readCodeName(v);
  if (base === null) return null;
  const o = v as Record<string, unknown>;
  const s: Seller = {
    ...base, phone: str(o["phone"]), grade: str(o["grade"]), vehicle_no: str(o["vehicle_no"]), id_last4: str(o["id_last4"]),
    ...("id_number" in o ? { id_number: str(o["id_number"]) } : {}),
    ...("address" in o ? { address: str(o["address"]) } : {}),
  };
  return s;
}
export const readSellers = (json: unknown): Seller[] | null => readArray(json, "sellers", readSeller);

// --- who may do what (the server decides; these only hide a control it would refuse) ------------

export const PERM = {
  master: "master.write",
  prices: "prices.write",
  tiers: "tiers.manage",
  sellerCreate: "sellers.create",
  sellerWrite: "sellers.write",
  personal: "sellers.read_personal",
} as const;

export const may = (permissions: readonly string[], p: string): boolean => permissions.includes(p);

// --- field rules before a request ----------------------------------------------------------------

export const FIELD_TEXT = {
  required: "ต้องกรอกช่องนี้",
  tooLong: (n: number) => `ยาวได้ไม่เกิน ${String(n)} ตัวอักษร`,
  price: "ราคาต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง เช่น 12.50",
  pick: "ต้องเลือกรายการ",
} as const;

export function textProblem(raw: string, max: number, required: boolean): string | null {
  const t = raw.trim();
  if (t === "") return required ? FIELD_TEXT.required : null;
  return [...t].length > max ? FIELD_TEXT.tooLong(max) : null;
}

/**
 * A price as the operator typed it, checked as TEXT and sent as text: digits, at most two decimals,
 * never negative, never parsed into a float on the way (hard rule 1; the server's Price is
 * Decimal ge=0, 2 places, 14 digits).
 */
export function priceProblem(raw: string): string | null {
  return /^\d{1,12}(\.\d{1,2})?$/.test(raw.trim()) ? null : FIELD_TEXT.price;
}

// --- search --------------------------------------------------------------------------------------

/** Case-insensitive contains over the given texts; a phone-like query also matches digits only. */
export function matches(query: string, texts: readonly (string | null | undefined)[]): boolean {
  const q = query.trim().toLowerCase();
  if (q === "") return true;
  const digits = q.replace(/\D/g, "");
  return texts.some((t) => {
    if (t === null || t === undefined) return false;
    const low = t.toLowerCase();
    if (low.includes(q)) return true;
    return digits.length >= 3 && digits.length === q.replace(/[\s-]/g, "").length && t.replace(/\D/g, "").includes(digits);
  });
}

// --- the seller PATCH body -----------------------------------------------------------------------

export interface SellerForm {
  readonly name: string;
  readonly phone: string;
  readonly grade: string; // "" = the shop's default grade
  readonly vehicle_no: string;
  readonly id_number: string;
  readonly address: string;
}

/**
 * Only what changed. An emptied optional field is an explicit null (clear it); `name` is never
 * null. `id_number` and `address` are sent ONLY by a caller who may read them -- for anyone else
 * the keys are absent from the body, so the stored values cannot be overwritten or erased.
 */
export function sellerPatch(before: Seller, form: SellerForm, mayPersonal: boolean): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const opt = (v: string): string | null => (v.trim() === "" ? null : v.trim());
  if (form.name.trim() !== before.name) out["name"] = form.name.trim();
  for (const k of ["phone", "grade", "vehicle_no"] as const) {
    if (opt(form[k]) !== (before[k] ?? null)) out[k] = opt(form[k]);
  }
  if (mayPersonal) {
    for (const k of ["id_number", "address"] as const) {
      if (opt(form[k]) !== (before[k] ?? null)) out[k] = opt(form[k]);
    }
  }
  return out;
}

/** The POST body for a new seller (code optional: absent -> the server assigns one). */
export function sellerCreate(code: string, form: SellerForm, mayPersonal: boolean): Record<string, string> {
  const out: Record<string, string> = { name: form.name.trim() };
  if (code.trim() !== "") out["code"] = code.trim();
  for (const k of ["phone", "grade", "vehicle_no"] as const) if (form[k].trim() !== "") out[k] = form[k].trim();
  if (mayPersonal) for (const k of ["id_number", "address"] as const) if (form[k].trim() !== "") out[k] = form[k].trim();
  return out;
}

/** The whole tier order with `id` moved one place up (-1) or down (+1); unchanged at an edge. */
export function moveTier(order: readonly string[], id: string, delta: -1 | 1): string[] {
  const i = order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return [...order];
  const out = [...order];
  [out[i], out[j]] = [out[j] as string, out[i] as string];
  return out;
}
