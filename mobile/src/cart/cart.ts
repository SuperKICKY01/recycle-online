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

export function newDraft(id: string, sellerId: string, updatedAt: string): Draft {
  return {
    id,
    seller_id: sellerId,
    vehicle_no: null,
    lines: [],
    next_seq: 1,
    form: emptyForm(),
    updated_at: updatedAt,
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
