/**
 * Entry-screen safety rules. PURE TypeScript — no React Native, no Expo, no
 * node — so the headless proof exercises exactly what the device runs.
 *
 * Phase 2c-4. No data model changes: this module only decides what the entry
 * FIELDS should contain next. The bill payload, the draft tables, the sync path
 * and the money module are untouched.
 *
 * THE RULE THIS MODULE EXISTS FOR: a weight left over from the previous product
 * is the most expensive silent error in this app. It is plausible, it is not
 * flagged by any validation (it parses, it is positive, tare < gross), and it
 * produces a real payment for the wrong amount. So changing product clears the
 * weights — always for gross, and for tare unless the operator explicitly
 * locked it.
 */
import type { DraftForm } from "./types.js";

/**
 * The fields that may be locked. gross is ABSENT BY CONSTRUCTION.
 *
 * This is the structural enforcement the phase asks for: `Locks` has no `gross`
 * key, so `locks.gross` is not "disallowed" — it is unrepresentable, and
 * `toggleLock(locks, "gross")` is a compile error rather than a runtime check
 * someone can forget or a convention a reviewer has to notice. Adding gross
 * here would break the type everywhere it is consumed, which is the point:
 * the decision is enforced by the compiler, not by discipline.
 *
 * Why gross specifically: tare is a property of the container and unit_price a
 * property of the deal, so both legitimately repeat across weighings. Gross is
 * the one value that is different for every single line by definition — a
 * "sticky" gross is never correct, only undetected.
 */
export type LockableField = "tare" | "price";

export const LOCKABLE_FIELDS: readonly LockableField[] = ["tare", "price"];

export type Locks = Readonly<Record<LockableField, boolean>>;

export const NO_LOCKS: Locks = Object.freeze({ tare: false, price: false });

export interface ProductDefaults {
  productId: string;
  /** The new product's price for this seller's grade. */
  listPrice: string;
}

export function toggleLock(locks: Locks, field: LockableField): Locks {
  return { ...locks, [field]: !locks[field] };
}

/**
 * Locks are released wholesale. Their scope is one customer / one vehicle, so
 * they end when the bill does — see releaseOnSave / releaseOnClear, which are
 * distinct names on purpose so the call sites read as the rule they implement.
 *
 * THERE IS NO releaseOnSellerChange, and that is a decision, not an omission
 * (Phase 2c-6). One bill has exactly one seller, so changing the seller mid-bill
 * is never "the next customer has arrived" — it can only be a correction of who
 * the bill in progress belongs to. The container on the scale did not move when
 * the operator fixed the name, so a tare they deliberately pinned must not
 * silently clear; the next line would then be weighed with tare 0 and the shop
 * would pay for the container. A locked price is likewise an explicit override
 * and survives, but it is then flagged off-tier against the new grade by
 * priceIsOffTier, so the operator is told rather than left to notice.
 */
export const releaseOnSave = (): Locks => NO_LOCKS;
export const releaseOnClear = (): Locks => NO_LOCKS;

/**
 * The selected product changed.
 *
 * gross is cleared unconditionally — note it is not even compared against
 * `locks`, because there is no lock that could apply to it.
 */
export function onProductChange(
  form: DraftForm,
  locks: Locks,
  next: ProductDefaults,
): DraftForm {
  return {
    product_id: next.productId,
    gross: "",
    tare: locks.tare ? form.tare : "",
    price: locks.price ? form.price : next.listPrice,
  };
}

/**
 * The selected SELLER changed (Phase 2c-6).
 *
 * Deliberately NOT the same rule as onProductChange, and the difference is the
 * whole point:
 *
 *   product changed -> what is ON THE SCALE changed, so gross is definitionally
 *                      stale and tare probably is.
 *   seller  changed -> nothing physical moved. The same load is on the same
 *                      plate in the same container; only who it belongs to was
 *                      corrected. Clearing the weights here would destroy
 *                      measurements of scrap that may already be in the pile.
 *
 * So gross, tare and the selected product all survive, and exactly one field
 * moves: the price re-defaults to the NEW grade's tier, because the grade is
 * the only thing about a seller that prices anything.
 *
 * A null tier (grade-less seller, or no row for this grade) CLEARS the price
 * rather than leaving the previous grade's number in the box. A price belonging
 * to a grade this bill is not filed under is the stale-value error this whole
 * area exists to prevent — see sellers.ts on why no tier is invented.
 *
 * LOCKS ARE NOT AN ARGUMENT THIS FUNCTION CAN RELEASE. It takes `locks` and
 * returns only a form, so there is no way for a seller change to clear a lock;
 * that is the enforcement, not a comment. See the note on releaseOnSave.
 */
export function onSellerChange(
  form: DraftForm,
  locks: Locks,
  nextListPrice: string | null,
): DraftForm {
  if (locks.price) return form;
  return { ...form, price: nextListPrice ?? "" };
}

/**
 * A line was just added to the cart. Locked fields carry over to the next
 * line; everything else resets.
 */
export function afterLineCommitted(form: DraftForm, locks: Locks): DraftForm {
  return {
    product_id: null,
    gross: "",
    tare: locks.tare ? form.tare : "",
    price: locks.price ? form.price : "",
  };
}

/**
 * True when the entered price no longer matches the current product's grade
 * tier. Already true for a hand-edited price; it also catches the specific
 * hazard of a LOCKED price surviving a product change, where the operator did
 * not retype anything and so has no other cue that the price is now wrong for
 * what is on the scale.
 */
export function priceIsOffTier(price: string, listPrice: string | null): boolean {
  return listPrice !== null && price !== "" && price !== listPrice;
}

/* ----------------------------------------------------------- numeric pad -- */

export type NumKey =
  | "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"
  | "." | "back" | "clear";

/**
 * Applies one keypress to the field's STRING value.
 *
 * Strings in, strings out — there is no Number(), no parseFloat, no arithmetic
 * anywhere in this function. That is the same guarantee the rest of the money
 * path relies on (project hard rule 1): the value the operator sees is the
 * exact character sequence that reaches SQLite and the server.
 *
 * Over-typing is refused at the source rather than accepted and flagged later:
 * `dp` bounds the fraction and `maxIntDigits` the integer part, both matching
 * the NUMERIC scales the server declares.
 */
export function applyKey(
  value: string,
  key: NumKey,
  dp: number,
  maxIntDigits: number,
): string {
  if (key === "clear") return "";
  if (key === "back") return value.slice(0, -1);

  const dot = value.indexOf(".");

  if (key === ".") {
    if (dot >= 0) return value; // only one decimal point, ever
    return value === "" ? "0." : `${value}.`;
  }

  if (dot >= 0) {
    // Typing into the fraction.
    if (value.length - dot - 1 >= dp) return value;
    return value + key;
  }

  // Typing into the integer part.
  if (value.length >= maxIntDigits) return value;
  // A leading zero is replaced rather than extended, so "0" + "5" is "5".
  if (value === "0") return key;
  return value + key;
}
