/**
 * Persistence for the cart draft, and the one genuinely transactional
 * operation in the app: promoting a draft into a pending bill.
 *
 * Shares the connection with SqliteLocalStore. Every money and weight column
 * is TEXT, holding the decimal string verbatim.
 */
import type { Draft, DraftForm, DraftLine } from "../../cart/types.js";
import type { LocalBill } from "../../sync/types.js";
import type { SqlDriver } from "./driver.js";
import { initConnection } from "./schema.js";
import { BILL_INSERT_SQL, billInsertParams } from "./SqliteLocalStore.js";

interface DraftRow {
  id: string;
  seller_id: string;
  vehicle_no: string | null;
  next_seq: number;
  form_json: string;
  updated_at: string;
}

interface LineRow {
  id: string;
  seq: number;
  product_id: string;
  product_code: string;
  product_name: string;
  uom_code: string;
  gross_weight: string;
  tare_weight: string;
  net_weight: string;
  unit_price: string;
  list_price: string;
  amount: string;
}

const LINE_COLUMNS =
  "id, draft_id, seq, product_id, product_code, product_name, uom_code," +
  " gross_weight, tare_weight, net_weight, unit_price, list_price, amount";

export class SqliteDraftStore {
  private constructor(private readonly db: SqlDriver) {}

  static async open(db: SqlDriver): Promise<SqliteDraftStore> {
    await initConnection(db);
    return new SqliteDraftStore(db);
  }

  /**
   * Writes the whole draft as one transaction: header upserted, lines replaced.
   *
   * Rewriting all lines rather than patching individual ones keeps the stored
   * draft an exact image of what is on screen, with no incremental-update paths
   * to drift. The transaction means a crash mid-save rolls back to the PREVIOUS
   * complete draft — never a half-written cart with a line missing.
   */
  async save(draft: Draft): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO local_draft (id, seller_id, vehicle_no, next_seq, form_json, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           seller_id = excluded.seller_id,
           vehicle_no = excluded.vehicle_no,
           next_seq = excluded.next_seq,
           form_json = excluded.form_json,
           updated_at = excluded.updated_at`,
        [
          draft.id,
          draft.seller_id,
          draft.vehicle_no,
          draft.next_seq,
          JSON.stringify(draft.form),
          draft.updated_at,
        ],
      );
      await tx.run("DELETE FROM local_draft_lines WHERE draft_id = ?", [draft.id]);
      for (const l of draft.lines) {
        await tx.run(
          `INSERT INTO local_draft_lines (${LINE_COLUMNS})
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            l.id, draft.id, l.seq, l.product_id, l.product_code, l.product_name,
            l.uom_code, l.gross_weight, l.tare_weight, l.net_weight,
            l.unit_price, l.list_price, l.amount,
          ],
        );
      }
    });
  }

  /** The single active draft, or null. Lines come back in seq order. */
  async load(): Promise<Draft | null> {
    const heads = await this.db.all<DraftRow>(
      "SELECT id, seller_id, vehicle_no, next_seq, form_json, updated_at" +
        " FROM local_draft ORDER BY updated_at DESC LIMIT 1",
    );
    const head = heads[0];
    if (head === undefined) return null;

    const rows = await this.db.all<LineRow>(
      `SELECT id, seq, product_id, product_code, product_name, uom_code,
              gross_weight, tare_weight, net_weight, unit_price, list_price, amount
       FROM local_draft_lines WHERE draft_id = ? ORDER BY seq`,
      [head.id],
    );

    return {
      id: head.id,
      seller_id: head.seller_id,
      vehicle_no: head.vehicle_no,
      next_seq: head.next_seq,
      form: JSON.parse(head.form_json) as DraftForm,
      updated_at: head.updated_at,
      lines: rows.map(
        (r): DraftLine => ({
          id: r.id,
          seq: r.seq,
          product_id: r.product_id,
          product_code: r.product_code,
          product_name: r.product_name,
          uom_code: r.uom_code,
          gross_weight: r.gross_weight,
          tare_weight: r.tare_weight,
          net_weight: r.net_weight,
          unit_price: r.unit_price,
          list_price: r.list_price,
          amount: r.amount,
        }),
      ),
    };
  }

  async deleteDraft(id: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.run("DELETE FROM local_draft_lines WHERE draft_id = ?", [id]);
      await tx.run("DELETE FROM local_draft WHERE id = ?", [id]);
    });
  }

  /**
   * THE transition. Draft becomes a pending bill, atomically.
   *
   * Three statements, one transaction, and the ordering inside it is
   * irrelevant precisely BECAUSE it is a transaction — that is the point. The
   * two ways to get this wrong are both silent and both cost real money:
   *
   *   insert bill, crash, draft still there  -> the yard re-saves it and the
   *                                             load is billed TWICE (two bill
   *                                             ids, two idempotency keys, so
   *                                             server dedup cannot save us);
   *   clear draft, crash, bill never written -> the load is billed ZERO times
   *                                             and the evidence is gone.
   *
   * SQLite gives all-or-nothing here, so after any crash a reopen sees exactly
   * one of {draft, bill}. Proven against a real process kill on both sides of
   * the COMMIT in src/proof/proveCart.ts C5.
   */
  async promoteToBill(draft: Draft, bill: LocalBill): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.run(BILL_INSERT_SQL, billInsertParams(bill));
      await tx.run("DELETE FROM local_draft_lines WHERE draft_id = ?", [draft.id]);
      await tx.run("DELETE FROM local_draft WHERE id = ?", [draft.id]);
    });
  }
}
