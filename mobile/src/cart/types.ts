/**
 * Cart / draft model. PURE TypeScript — no React Native, no Expo, no node.
 *
 * A DRAFT IS NOT A BILL. This is the central distinction of Phase 2c-3 and it
 * is structural, not a flag:
 *
 *  - a draft lives in its own tables (local_draft, local_draft_lines), so no
 *    query the sync engine runs can reach it;
 *  - it has NO bill UUID and NO idempotency_key — both are minted at the
 *    instant of promotion, so nothing is "consumed" while the yard is still
 *    typing;
 *  - it therefore cannot be sent, claimed, retried, or counted as a bill.
 *
 * Every weight and money field is a decimal STRING, as everywhere else.
 */

/** Raw, unvalidated text of the entry fields, exactly as the user left them. */
export interface DraftForm {
  product_id: string | null;
  /** Kept as typed — NOT parsed. Restoring must be faithful, including junk. */
  gross: string;
  tare: string;
  price: string;
}

export interface DraftLine {
  /** Stable UUID. Becomes the purchase_bill_items.id on promotion. */
  id: string;
  /**
   * Ordering key within the draft. Monotonic, NEVER reused, and deliberately
   * NOT the line_no: deleting a line leaves a hole here, which is harmless
   * because line_no is assigned 1..N at promotion (see toBillItems).
   */
  seq: number;
  product_id: string;
  /** Denormalised so a restored draft renders before master data is fetched. */
  product_code: string;
  product_name: string;
  uom_code: string;
  gross_weight: string;
  tare_weight: string;
  net_weight: string;
  unit_price: string;
  list_price: string;
  /** net x unit_price, HALF_UP to 2dp — the server's exact formula. */
  amount: string;
}

export interface Draft {
  /** Draft's own id. NOT a bill id; no bill id exists until promotion. */
  id: string;
  seller_id: string;
  vehicle_no: string | null;
  lines: DraftLine[];
  /** Next value for DraftLine.seq. Monotonic across deletes. */
  next_seq: number;
  form: DraftForm;
  updated_at: string;
}

export const emptyForm = (): DraftForm => ({
  product_id: null,
  gross: "",
  tare: "",
  price: "",
});
