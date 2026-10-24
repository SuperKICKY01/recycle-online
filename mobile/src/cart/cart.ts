/**
 * Cart operations. PURE functions: Draft in, Draft out, no I/O, no clock, no
 * randomness. Persistence and id generation are the caller's job, which is what
 * lets the headless proof exercise exactly the code the device runs.
 *
 * All arithmetic goes through src/money — never a JS number.
 */
import { computeLine, DEFAULT_ROUNDING_RULE } from "../money/lineRules.js";
import type { LineDeductionMode, PricingBasis, RoundingRule } from "../money/lineRules.js";
import { netWeight, parseDecimal, parsePrice, parseWeight, sumAmounts } from "../money/money.js";
import type { FieldError } from "../money/money.js";
import type { BillItemPayload } from "../sync/types.js";
import { onSellerChange } from "./entry.js";
import type { Locks } from "./entry.js";
import type { EntryMode } from "./moneyRules.js";
import { cleanVehicleNo } from "./sellers.js";
import type { Draft, DraftForm, DraftLine, LineRules } from "./types.js";
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
  /*
   * THE SHOP'S MONEY RULES (server migration 0027, M1) -- ALL OPTIONAL. A caller that passes
   * `rule` applies the rules and gets a line that DECLARES them (`line.rules`); a caller that
   * passes none gets exactly the pre-0027 line -- weight-priced, nothing deducted, half-up to the
   * satang, no `rules` key -- the shape every older proof and every queued bill has.
   */
  basis?: PricingBasis;
  rule?: RoundingRule;
  /** The deduction entries the product offers (moneyRules.offeredModes); none when absent. */
  offered?: readonly EntryMode[];
  /** Which offered entry the operator chose; the first offered when unset or not offered. */
  deductionMode?: EntryMode;
  /** Raw keypad text: a weight in kg mode, a percent in percent mode. */
  deduction?: string;
  /** Free text; required when `reasonRequired` and something is deducted. */
  reason?: string;
  reasonRequired?: boolean;
  /** Raw keypad text: whole pieces, for a piece-priced product. */
  pieces?: string;
}

export type LineField = "product" | "gross" | "tare" | "price" | "deduction" | "reason" | "pieces";

export type LineError =
  | FieldError
  | "no_product"
  | "zero_net"
  | "zero_amount"
  | "deduction_exceeds_net"
  | "deduction_pct_out_of_range"
  | "reason_required"
  | "reason_too_long"
  | "piece_quantity_invalid";

/** A percent as typed: two places, at most three integer digits (100.00). */
export const PERCENT_DP = 2;
export const PERCENT_MAX_INT_DIGITS = 3;
/** The reason's bound, the server column's (ck_items_deduction_reason_len). */
export const REASON_MAX = 200;

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
  const basis: PricingBasis = input.basis ?? "weight";
  if (basis !== "weight") return buildCountedLine(input, basis);

  const g = parseWeight(input.gross);
  if (!g.ok) return { ok: false, field: "gross", error: g.error };
  const t = parseWeight(input.tare);
  if (!t.ok) return { ok: false, field: "tare", error: t.error };
  const p = parsePrice(input.price);
  if (!p.ok) return { ok: false, field: "price", error: p.error };

  const n = netWeight(g.value, t.value);
  if (!n.ok) return { ok: false, field: "tare", error: n.error };

  /*
   * THE IMPURITY DEDUCTION (0027). Read only when the product offers one and something was typed;
   * a typed zero is "nothing deducted", not a kg-mode line of zero (which the server refuses).
   * The arithmetic is lineRules.computeLine's -- the function the golden vectors hold to the
   * server's -- so what this previews is what the server stores.
   */
  const offered = input.offered ?? [];
  const typed = (input.deduction ?? "").trim();
  let mode: LineDeductionMode = "none";
  let pct: string | null = null;
  let dweight: string | null = null;
  if (offered.length > 0 && typed !== "") {
    const chosen = input.deductionMode !== undefined && offered.includes(input.deductionMode)
      ? input.deductionMode
      : (offered[0] ?? "kg");
    const d = chosen === "kg" ? parseWeight(typed) : parseDecimal(typed, PERCENT_DP, PERCENT_MAX_INT_DIGITS);
    if (!d.ok) return { ok: false, field: "deduction", error: d.error };
    if (!isZero(d.value)) {
      mode = chosen;
      if (chosen === "kg") dweight = d.value;
      else pct = d.value;
    }
  }
  const reason = (input.reason ?? "").trim();
  if (mode !== "none" && input.reasonRequired === true && reason === "") {
    return { ok: false, field: "reason", error: "reason_required" };
  }
  if (reason.length > REASON_MAX) return { ok: false, field: "reason", error: "reason_too_long" };

  const rule = input.rule ?? DEFAULT_ROUNDING_RULE;
  const r = computeLine({
    gross: g.value, tare: t.value, unitPrice: p.value, basis, rule, mode,
    deductionPct: pct, deductionWeight: dweight,
  });
  if (!r.ok) {
    if (r.code === "deduction_exceeds_net" || r.code === "deduction_pct_out_of_range") {
      return { ok: false, field: "deduction", error: r.code };
    }
    // Every other refusal is a rule this function already checked above.
    return { ok: false, field: "gross", error: "not_a_number" };
  }
  /*
   * Zero-value guard (Phase 2c-5). A zero line is not an arithmetic error -- the server would
   * accept it -- it is a BUSINESS one: a line that pays nothing is a mistyped weight or price, and
   * once it is on a printed slip nobody can tell which. Net and amount only, never the tare (loose
   * scrap tipped straight on the plate has none). A deduction that takes the whole net is the same
   * mistake, pointed at the deduction box.
   */
  if (isZero(r.value.netWeight)) {
    return { ok: false, field: mode === "none" ? "gross" : "deduction", error: "zero_net" };
  }
  if (isZero(r.value.amount)) return { ok: false, field: "price", error: "zero_amount" };
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
      net_weight: r.value.netWeight,
      unit_price: p.value,
      list_price: input.list_price,
      amount: r.value.amount,
      ...(input.rule === undefined
        ? {}
        : {
            rules: {
              pricing_basis: basis, rounding_rule: rule, deduction_mode: mode, deduction_pct: pct,
              deduction_weight: r.value.deductionWeight,
              deduction_reason: mode === "none" || reason === "" ? null : reason,
              quantity: r.value.quantity,
            } satisfies LineRules,
          }),
    },
  };
}

/**
 * A PIECE- OR LUMP-PRICED line (0027): the price multiplies whole pieces, or is the lump itself.
 * No weight is asked for and none is deducted -- a deduction applies to weight-priced lines only
 * (the server's CHECK says the same) -- so gross, tare and net are 0.000.
 */
function buildCountedLine(input: LineInput, basis: "piece" | "lump"): LineResult {
  const p = parsePrice(input.price);
  if (!p.ok) return { ok: false, field: "price", error: p.error };
  let quantity: string | null = null;
  if (basis === "piece") {
    const raw = (input.pieces ?? "").trim();
    if (raw === "") return { ok: false, field: "pieces", error: "empty" };
    if (!/^\d+$/.test(raw) || /^0+$/.test(raw)) return { ok: false, field: "pieces", error: "piece_quantity_invalid" };
    if (raw.replace(/^0+/, "").length > 11) return { ok: false, field: "pieces", error: "too_large" };
    quantity = raw;
  }
  const rule = input.rule ?? DEFAULT_ROUNDING_RULE;
  const r = computeLine({
    gross: "0.000", tare: "0.000", unitPrice: p.value, basis, rule, mode: "none", quantity,
  });
  if (!r.ok) return { ok: false, field: basis === "piece" ? "pieces" : "price", error: "piece_quantity_invalid" };
  if (isZero(r.value.amount)) return { ok: false, field: "price", error: "zero_amount" };
  return {
    ok: true,
    line: {
      id: input.id,
      product_id: input.product_id,
      product_code: input.product_code,
      product_name: input.product_name,
      uom_code: input.uom_code,
      gross_weight: "0.000",
      tare_weight: "0.000",
      net_weight: "0.000",
      unit_price: p.value,
      list_price: input.list_price,
      amount: r.value.amount,
      rules: {
        pricing_basis: basis, rounding_rule: rule, deduction_mode: "none", deduction_pct: null,
        deduction_weight: "0.000", deduction_reason: null, quantity: r.value.quantity,
      },
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

/**
 * EVERY DEDUCTION ON THE BILL, one sentence per deducting line, for the confirmation the seller is
 * shown before the cash is counted out (ADVISOR-DECIDED 2026-10-24 M1 b: "Shown to the seller on
 * the phone before confirm"). Per line, never summed: two lines may be in different units, and a
 * total of kilograms and pieces is a number that means nothing. Empty when nothing is deducted.
 */
export function deductionLines(draft: Draft): string[] {
  return orderedLines(draft).flatMap((l) => {
    const r = l.rules;
    if (r === undefined || r.deduction_mode === "none") return [];
    const pct = r.deduction_mode === "percent" && r.deduction_pct !== null ? ` (${r.deduction_pct}%)` : "";
    const why = r.deduction_reason !== null ? ` · ${r.deduction_reason}` : "";
    return [`${l.product_name}: หักสิ่งเจือปน ${r.deduction_weight} ${l.uom_code}${pct}${why}`];
  });
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
    ...(l.rules === undefined ? {} : rulesOnTheWire(l.rules)),
  }));
}

/**
 * THE RULES A LINE DECLARES (server migration 0027): the server re-derives every figure from these
 * and stores them as the line's snapshot. Only what the mode needs is sent -- a percent only in
 * percent mode, a deduction weight only when something was deducted, pieces only for a piece line
 * -- because the server refuses a value the mode does not explain (money_rules.py).
 */
function rulesOnTheWire(r: LineRules): Partial<BillItemPayload> {
  return {
    pricing_basis: r.pricing_basis,
    rounding_rule: r.rounding_rule,
    deduction_mode: r.deduction_mode,
    ...(r.deduction_mode === "percent" && r.deduction_pct !== null ? { deduction_pct: r.deduction_pct } : {}),
    ...(r.deduction_mode === "none" ? {} : { deduction_weight: r.deduction_weight }),
    ...(r.deduction_reason !== null ? { deduction_reason: r.deduction_reason } : {}),
    ...(r.pricing_basis === "piece" ? { quantity: r.quantity } : {}),
  };
}
