/**
 * Cart operations. PURE functions: Draft in, Draft out, no I/O, no clock, no
 * randomness. Persistence and id generation are the caller's job, which is what
 * lets the headless proof exercise exactly the code the device runs.
 *
 * All arithmetic goes through src/money — never a JS number.
 */
import { lineAmount, netWeight, parsePrice, parseWeight, sumAmounts } from "../money/money.js";
import type { FieldError } from "../money/money.js";
import type { BillItemPayload } from "../sync/types.js";
import { onSellerChange } from "./entry.js";
import type { Locks } from "./entry.js";
import { cleanVehicleNo } from "./sellers.js";
import type { Draft, DraftForm, DraftLine } from "./types.js";
import { emptyForm } from "./types.js";

export interface LineInput {
  id: string;
  product_id: string;
  product_code: string;
  product_name: string;
  uom_code: string;
  /** Raw text from the keypad. */
  gross: string;
  tare: string;
  price: string;
  list_price: string;
}

export type LineField = "product" | "gross" | "tare" | "price";

export type LineError = FieldError | "no_product" | "zero_net" | "zero_amount";

export type LineResult =
  | { ok: true; line: Omit<DraftLine, "seq"> }
  | { ok: false; field: LineField; error: LineError };

/** True for "0", "0.0", "0.00", "0.000" — any spelling of nothing. */
const isZero = (decimal: string): boolean => /^0(\.0*)?$/.test(decimal);

/**
 * A bill starts here.
 *
 * `masterAsOf` is the fetch time of the master data the operator is about to
 * price against — required, not optional, so a caller has to have an answer.
 * Null is a legitimate one (the device has never fetched), and is the state the
 * bill card reports as "unknown" rather than inventing freshness for.
 */
export function newDraft(
  id: string,
  sellerId: string,
  updatedAt: string,
  masterAsOf: string | null,
): Draft {
  return {
    id,
    seller_id: sellerId,
    vehicle_no: null,
    lines: [],
    next_seq: 1,
    form: emptyForm(),
    updated_at: updatedAt,
    master_as_of: masterAsOf,
  };
}

/**
 * Validates one line and computes its money. The ONLY way a line is built.
 *
 * Returns the first offending field rather than a boolean, so the UI can point
 * at it. A line that does not validate cannot enter the cart, so an invalid
 * bill cannot exist even transiently — the same guarantee 2c-2 gave the
 * single-line form, now enforced per line.
 */
export function buildLine(input: LineInput): LineResult {
  if (input.product_id === "") return { ok: false, field: "product", error: "no_product" };

  const g = parseWeight(input.gross);
  if (!g.ok) return { ok: false, field: "gross", error: g.error };
  const t = parseWeight(input.tare);
  if (!t.ok) return { ok: false, field: "tare", error: t.error };
  const p = parsePrice(input.price);
  if (!p.ok) return { ok: false, field: "price", error: p.error };

  const n = netWeight(g.value, t.value);
  if (!n.ok) return { ok: false, field: "tare", error: n.error };

  /*
   * Zero-value guard (Phase 2c-5).
   *
   * A zero line is not a validation error in the arithmetic sense — the money
   * module computes it correctly and the server would accept it. It is a
   * BUSINESS error: a line that pays nothing is either a mistyped weight or a
   * mistyped price, and once it is on a printed slip nobody can tell which.
   * So the guard lives here, in the cart, and money.ts keeps permitting net = 0
   * because that is arithmetically true.
   *
   * Note the asymmetry the phase calls for: a tare of 0.000 is perfectly
   * normal — loose scrap tipped straight onto the plate has no container — so
   * only the NET and the AMOUNT are checked, never the tare itself.
   */
  if (isZero(n.value)) return { ok: false, field: "gross", error: "zero_net" };

  const amount = lineAmount(n.value, p.value);
  // Reachable with a non-zero net AND a non-zero price: 0.001 x 0.01 rounds to
  // 0.00. So this is a separate check, not a restatement of the one above.
  if (isZero(amount)) return { ok: false, field: "price", error: "zero_amount" };

  return {
    ok: true,
    line: {
      id: input.id,
      product_id: input.product_id,
      product_code: input.product_code,
      product_name: input.product_name,
      uom_code: input.uom_code,
      gross_weight: g.value,
      tare_weight: t.value,
      net_weight: n.value,
      unit_price: p.value,
      list_price: input.list_price,
      amount,
    },
  };
}

/** Appends a line and consumes one seq. The form is cleared for the next entry. */
export function addLine(draft: Draft, line: Omit<DraftLine, "seq">, updatedAt: string): Draft {
  return {
    ...draft,
    lines: [...draft.lines, { ...line, seq: draft.next_seq }],
    next_seq: draft.next_seq + 1,
    form: emptyForm(),
    updated_at: updatedAt,
  };
}

/** Replaces a line in place, keeping its id and its seq — so order is stable. */
export function replaceLine(
  draft: Draft,
  lineId: string,
  line: Omit<DraftLine, "seq">,
  updatedAt: string,
): Draft {
  return {
    ...draft,
    lines: draft.lines.map((l) => (l.id === lineId ? { ...line, id: l.id, seq: l.seq } : l)),
    updated_at: updatedAt,
  };
}

/**
 * Removes a line. The survivors keep their seq values — the hole is deliberate.
 * Renumbering here would be the bug: it would either collide with a UNIQUE
 * (draft_id, seq) index mid-update or silently change the identity of lines the
 * user is looking at. line_no is derived at promotion instead.
 */
export function removeLine(draft: Draft, lineId: string, updatedAt: string): Draft {
  return {
    ...draft,
    lines: draft.lines.filter((l) => l.id !== lineId),
    updated_at: updatedAt,
  };
}

/** Undo of removeLine: puts the line back at its original position via seq. */
export function restoreLine(draft: Draft, line: DraftLine, updatedAt: string): Draft {
  if (draft.lines.some((l) => l.id === line.id)) return draft;
  return {
    ...draft,
    lines: [...draft.lines, line].sort((a, b) => a.seq - b.seq),
    updated_at: updatedAt,
  };
}

export function clearLines(draft: Draft, updatedAt: string): Draft {
  return { ...draft, lines: [], form: emptyForm(), updated_at: updatedAt };
}

export function setForm(draft: Draft, form: DraftForm, updatedAt: string): Draft {
  return { ...draft, form, updated_at: updatedAt };
}

/**
 * The plate, as typed. NOT normalised here — see cleanVehicleNo. Storing the
 * raw keystrokes is what lets "70 1234" be typed at all.
 */
export function setVehicleNo(draft: Draft, raw: string, updatedAt: string): Draft {
  return { ...draft, vehicle_no: raw === "" ? null : raw, updated_at: updatedAt };
}

/** Trim the plate down to its storable form. Applied on blur and at save. */
export function normaliseVehicleNo(draft: Draft, updatedAt: string): Draft {
  const cleaned = cleanVehicleNo(draft.vehicle_no);
  if (cleaned === draft.vehicle_no) return draft;
  return { ...draft, vehicle_no: cleaned, updated_at: updatedAt };
}

/** What a seller change did, so the operator can be told the truth about it. */
export interface SellerChangeImpact {
  /** Lines already in the cart. Their money is untouched — see changeSeller. */
  keptLines: number;
  /** Lines whose grade REFERENCE price moved to the new tier. */
  rereferenced: number;
  /** Lines with no tier under the new grade; their reference was left alone. */
  withoutTier: number;
  /** True when a price lock stopped the pending price from re-defaulting. */
  priceLockHeld: boolean;
  pendingPriceWas: string;
  pendingPriceNow: string;
}

export interface SellerChangeResult {
  draft: Draft;
  impact: SellerChangeImpact;
}

/**
 * THIS BILL BELONGS TO SOMEONE ELSE (Phase 2c-6).
 *
 * The decision the phase asks for, and why it is not "block the change":
 *
 * Blocking leaves the operator two ways out, and both cost more than the
 * problem. Clearing the cart destroys weights for loads that have already been
 * tipped onto the pile and can no longer be re-measured. Saving to the wrong
 * seller and voiding puts a wrong-money bill and a reversal on a permanent
 * record that never forgets (hard rule 5) — for a mis-tap. Meanwhile the change
 * itself is always benign in the one way that matters: one bill has exactly one
 * seller, so this can only ever be a CORRECTION of who the bill in progress
 * belongs to, never a second customer arriving mid-bill.
 *
 * So the change is allowed, and the rule is:
 *
 *   unit_price, amount and the cart total of existing lines DO NOT MOVE.
 *     Those are what the customer was told and, for lines already handed cash
 *     for, what was actually paid. Re-pricing them to the new grade would edit
 *     an agreed number after the fact — the one silent rewrite the phase
 *     forbids. Proven byte-identical in proveSeller S3.
 *
 *   list_price — the grade REFERENCE, not the money — is re-pointed to the new
 *     grade's tier where one exists. It is not the client's value in any case:
 *     the server discards it and stamps its own from product_prices at the
 *     seller's grade (bills.py). Leaving the old grade's number would make the
 *     device disagree with the record and, worse, would hide the override —
 *     the "paid off list" badge compares the two, so against a stale reference
 *     a line priced at grade B under a grade-C bill looks perfectly ordinary.
 *     Where the new grade has no tier at all, the last known reference is kept
 *     rather than invented over, and the count is reported.
 *
 * Locks are an input, never an output: this function cannot release one. See
 * entry.ts on why a seller change must not.
 */
/**
 * The two DIFFERENT questions a grade answers about a product's price.
 *
 * They were one function until Phase 2c-8, and they had to split the moment the
 * tier could come out of a cache that is hours old:
 *
 *   reference — "what does the device believe this grade's list price is". Used
 *               for line.list_price and for the off-tier badge. A cached answer
 *               is fine: it is a comparison value, shown as information, and the
 *               server discards the client's list_price and stamps its own.
 *   pendingDefault — "what may be WRITTEN INTO THE MONEY FIELD without anyone
 *               deciding". Null once the cache is too old to stand behind, so
 *               the box stays empty and the operator types the agreed price.
 *
 * Passing the same function for both is the correct thing to do when the data is
 * current, and it is what the freshness assessment produces. The type exists so
 * that "which of the two is this" is answered at the call site rather than
 * assumed here.
 */
export interface GradeTiers {
  reference: (productId: string) => string | null;
  pendingDefault: (productId: string) => string | null;
}

/** Both questions with the same answer — current data, nothing withheld. */
export const sameTierForBoth = (
  tierFor: (productId: string) => string | null,
): GradeTiers => ({ reference: tierFor, pendingDefault: tierFor });

export function changeSeller(
  draft: Draft,
  sellerId: string,
  locks: Locks,
  /** The new seller's tiers — see GradeTiers on why this is two functions. */
  tiers: GradeTiers,
  updatedAt: string,
): SellerChangeResult {
  let rereferenced = 0;
  let withoutTier = 0;

  const lines = draft.lines.map((l) => {
    const tier = tiers.reference(l.product_id);
    if (tier === null) {
      withoutTier += 1;
      return l;
    }
    if (tier === l.list_price) return l;
    rereferenced += 1;
    // Only list_price. gross/tare/net/unit_price/amount are carried verbatim.
    return { ...l, list_price: tier };
  });

  // The PENDING price field takes the default resolver, never the reference
  // one. With a stale cache these differ, and using the reference here would put
  // a price the app has just told the operator not to trust straight back into
  // the money box — through the seller-change door, which is exactly the kind of
  // neighbour that gets missed when only the case that bit is fixed.
  const pendingTier =
    draft.form.product_id === null ? null : tiers.pendingDefault(draft.form.product_id);
  const form = onSellerChange(draft.form, locks, pendingTier);

  return {
    draft: { ...draft, seller_id: sellerId, lines, form, updated_at: updatedAt },
    impact: {
      keptLines: draft.lines.length,
      rereferenced,
      withoutTier,
      priceLockHeld: locks.price,
      pendingPriceWas: draft.form.price,
      pendingPriceNow: form.price,
    },
  };
}

/**
 * Running total: the sum of the ALREADY-ROUNDED line amounts.
 *
 * This ordering is not cosmetic. The server computes
 * `sum(quantize(net * price) for each line)` — it rounds each line, then adds.
 * Rounding the sum instead would disagree whenever two lines each land on a
 * half-satang boundary, and the server REJECTS a mismatched total, so the bill
 * would refuse to sync. Round-then-sum, never sum-then-round.
 */
export function cartTotal(draft: Draft): string {
  return sumAmounts(orderedLines(draft).map((l) => l.amount));
}

/** Lines in stable display order. */
export function orderedLines(draft: Draft): DraftLine[] {
  return [...draft.lines].sort((a, b) => a.seq - b.seq);
}

/**
 * Draft lines -> the server's item payloads.
 *
 * line_no is assigned HERE, 1..N over the ordered lines, and nowhere else. That
 * is what makes the server's `uq_items_tenant_bill_line` unsatisfiable to
 * violate: whatever was added, edited, deleted or undone during entry, the
 * submitted set is always exactly 1..N — contiguous, unique, and every value
 * > 0 as the server requires. The draft's seq holes never reach the wire.
 */
export function toBillItems(draft: Draft): BillItemPayload[] {
  return orderedLines(draft).map((l, i) => ({
    id: l.id,
    product_id: l.product_id,
    line_no: i + 1,
    gross_weight: l.gross_weight,
    tare_weight: l.tare_weight,
    net_weight: l.net_weight,
    unit_price: l.unit_price,
    list_price: l.list_price,
  }));
}
