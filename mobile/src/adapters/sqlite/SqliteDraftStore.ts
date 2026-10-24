/**
 * Persistence for the cart draft, and the one genuinely transactional
 * operation in the app: promoting a draft into a pending bill.
 *
 * Shares the connection with SqliteLocalStore. Every money and weight column
 * is TEXT, holding the decimal string verbatim.
 */
import type { Draft, DraftForm, DraftLine, LineRules } from "../../cart/types.js";
import type { LocalBill } from "../../sync/types.js";
import type { SqlDriver } from "./driver.js";
import { initConnection } from "./schema.js";
import { SqliteIdentityStore } from "./SqliteIdentityStore.js";
import type { LocalIdentity } from "./SqliteIdentityStore.js";
import {
  BILL_INSERT_SQL,
  billInsertParams,
  OWNED_BY_CURRENT,
  ownerParams,
} from "./SqliteLocalStore.js";

interface DraftRow {
  id: string;
  seller_id: string;
  vehicle_no: string | null;
  next_seq: number;
  form_json: string;
  updated_at: string;
  /** Null on a draft written before Phase 2c-8 added the column. */
  master_as_of: string | null;
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
  /** The line's money rules as JSON (0027), or NULL on a line written before them. */
  rules_json: string | null;
}

const LINE_COLUMNS =
  "id, draft_id, seq, product_id, product_code, product_name, uom_code," +
  " gross_weight, tare_weight, net_weight, unit_price, list_price, amount, rules_json";

/**
 * A line's rules read back from disk, defended like parsePrices in SqliteMasterStore: a corrupt or
 * absent value is NO RULES -- the line then goes out in the pre-0027 shape, which the server
 * re-derives from its own figures and refuses if they do not follow -- never a throw that takes the
 * restored cart with it. Every value inside is a string (hard rule 1: no number reaches money).
 */
function parseRules(json: string | null): LineRules | undefined {
  if (json === null) return undefined;
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (typeof raw !== "object" || raw === null) return undefined;
  const o = raw as Record<string, unknown>;
  const s = (k: string): string | null => (typeof o[k] === "string" ? (o[k] as string) : null);
  const basis = s("pricing_basis");
  const rule = s("rounding_rule");
  const mode = s("deduction_mode");
  const weight = s("deduction_weight");
  const quantity = s("quantity");
  if (basis === null || rule === null || mode === null || weight === null || quantity === null) return undefined;
  return {
    pricing_basis: basis as LineRules["pricing_basis"],
    rounding_rule: rule as LineRules["rounding_rule"],
    deduction_mode: mode as LineRules["deduction_mode"],
    deduction_pct: s("deduction_pct"),
    deduction_weight: weight,
    deduction_reason: s("deduction_reason"),
    quantity,
  };
}

/**
 * What a load found: the draft this person may continue, and how many were kept
 * back from them.
 *
 * `withheld` is a COUNT and never the rows. The operator is told that unfinished
 * work exists and is being kept; they are not shown whose it is or what is on
 * it, for the same reason ROADMAP.md section P1.7 gives about parked bills —
 * "Not whose, and not their contents."
 */
export interface DraftLoad {
  draft: Draft | null;
  withheld: number;
}

export class SqliteDraftStore {
  private constructor(
    private readonly db: SqlDriver,
    private readonly identity: SqliteIdentityStore,
  ) {}

  /**
   * Who this device is signed in as, read fresh for the statement that filters.
   * Mirrors SqliteLocalStore.currentOwner and SqliteMasterStore.currentTenant,
   * and is not cached for the same reason: a value captured at open() goes stale
   * at the one moment that matters, when somebody else signs in.
   *
   * SAFE HERE BECAUSE `load` OPENS NO TRANSACTION. driver.ts states that a
   * statement issued on the driver from inside a transaction body re-enters the
   * connection lock and deadlocks — so this must never be called from within
   * `save` or `promoteToBill`, which are transactional and take their owner as
   * an argument from the caller instead.
   */
  private currentOwner(): Promise<LocalIdentity | null> {
    return this.identity.load();
  }

  static async open(db: SqlDriver): Promise<SqliteDraftStore> {
    await initConnection(db);
    // The SAME driver, so the identity is read on the connection the filtered
    // statement runs on.
    return new SqliteDraftStore(db, new SqliteIdentityStore(db));
  }

  /**
   * Writes the whole draft as one transaction: header upserted, lines replaced.
   *
   * Rewriting all lines rather than patching individual ones keeps the stored
   * draft an exact image of what is on screen, with no incremental-update paths
   * to drift. The transaction means a crash mid-save rolls back to the PREVIOUS
   * complete draft — never a half-written cart with a line missing.
   */
  /**
   * `owner` is who is signed in AT THIS MOMENT, or null when the device does not
   * know. It is recorded only if this call INSERTS — see the DO UPDATE note
   * below — so on every later save of the same draft it is read and discarded,
   * which is correct and is not a wasted read: the caller cannot know which of
   * the two this call will be.
   */
  async save(draft: Draft, owner: LocalIdentity | null): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.run(
        `INSERT INTO local_draft
           (id, seller_id, vehicle_no, next_seq, form_json, updated_at, master_as_of,
            owner_tenant_id, owner_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
           seller_id = excluded.seller_id,
           vehicle_no = excluded.vehicle_no,
           next_seq = excluded.next_seq,
           form_json = excluded.form_json,
           updated_at = excluded.updated_at`,
        // master_as_of is deliberately ABSENT from the DO UPDATE list: it is
        // written when the draft is created and must never move afterwards. A
        // refresh that lands mid-cart would otherwise overwrite the age of the
        // data the lines were actually priced from — the false negative that
        // makes the marker worthless. See master/freshness.ts.
        //
        // THE OWNER COLUMNS ARE ABSENT FROM IT FOR A DIFFERENT REASON, and the
        // two must not be collapsed into one rule. master_as_of must not move
        // because a later value would be WRONG. The owner must not move because
        // a later value would be RIGHT ABOUT THE WRONG QUESTION: this pair
        // records who STARTED the cart, and every save after the first happens
        // on a keystroke. Listing them here would mean that at a shift change
        // the next character typed silently reattributes the cart to whoever is
        // signed in now, erasing the fact that somebody else opened it — and
        // nothing on the device would ever show that it happened.
        [
          draft.id,
          draft.seller_id,
          draft.vehicle_no,
          draft.next_seq,
          JSON.stringify(draft.form),
          draft.updated_at,
          draft.master_as_of,
          owner === null ? null : owner.tenant_id,
          owner === null ? null : owner.user_id,
        ],
      );
      await tx.run("DELETE FROM local_draft_lines WHERE draft_id = ?", [draft.id]);
      for (const l of draft.lines) {
        await tx.run(
          `INSERT INTO local_draft_lines (${LINE_COLUMNS})
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            l.id, draft.id, l.seq, l.product_id, l.product_code, l.product_name,
            l.uom_code, l.gross_weight, l.tare_weight, l.net_weight,
            l.unit_price, l.list_price, l.amount,
            l.rules === undefined ? null : JSON.stringify(l.rules),
          ],
        );
      }
    });
  }

  /**
   * The active draft THIS PERSON MAY CONTINUE, plus a count of the ones kept
   * back. Lines come back in seq order.
   *
   * ---------------------------------------------------------------------------
   * A DRAFT IS WITHHELD FOR TWO DISTINCT REASONS, DOWN ONE CODE PATH
   * ---------------------------------------------------------------------------
   * The predicate treats them identically and they are not the same situation:
   *
   *   A DIFFERENT OWNER. Somebody else started this cart. It returns to them the
   *   moment they sign in on this handset, and to nobody else.
   *
   *   AN UNKNOWN OWNER (both columns NULL). A cart written before the owner
   *   columns existed, or one saved in the boot window before the identity store
   *   was open. On an upgraded handset this is PROBABLY THE SHOP'S OWN WORK —
   *   very likely the work of the person now standing at the scale — and it is
   *   still withheld, because "probably" is exactly the guess that manufactures
   *   false provenance (ROADMAP.md section P1.7, "a guess would manufacture false
   *   provenance that reads exactly like true provenance"). Unlike the first
   *   case, NO sign-in will ever release it: null matches nobody, so it waits for
   *   a person who does not exist.
   *
   * WHAT A READER SHOULD LOOK AT FIRST when a draft does not appear: the ROW'S
   * OWNER COLUMNS beside the local_identity row —
   *   SELECT owner_tenant_id, owner_user_id FROM local_draft;
   *   SELECT tenant_id, user_id FROM local_identity WHERE only_row = 1;
   * Two NULLs is the second case; two different values is the first; no identity
   * row at all withholds EVERYTHING and is a device that has not signed in. Do
   * not start from the loader or the screen — an empty start screen looks
   * identical on an ordinary morning, and `withheld` is the only thing that
   * separates them.
   *
   * On why the owner clause is part of the SELECT rather than a check on its
   * result, see the note at the statement itself — it is a hazard, not a
   * stylistic preference, and it is recorded where the change would be made.
   */
  async load(): Promise<DraftLoad> {
    const owner = await this.currentOwner();
    /*
     * THE OWNER CLAUSE IS PART OF THIS SELECT. DO NOT LIFT IT OUT AND CHECK THE
     * RESULT INSTEAD — THAT LOSES THE OPERATOR'S OWN WORK.
     *
     * The tempting simplification is to keep the old statement and reject
     * afterwards: read `ORDER BY updated_at DESC LIMIT 1`, compare the row's
     * owner, return null if it is not this person's. It reads as the same rule
     * expressed more plainly. It is not the same rule.
     *
     * TWO DRAFT ROWS SIDE BY SIDE IS THE ORDINARY STATE THIS CHANGE PRODUCES,
     * not an edge case to be discounted. A withheld cart is deliberately KEPT on
     * disk, and the operator then starts their own — so from the first shift
     * change onward the table normally holds one row for each of them. Reject-
     * after-the-fact then finds the OTHER person's row whenever theirs is the
     * newer one, refuses it, and reports NOTHING: the operator's own unfinished
     * cart is sitting on disk, was never in question, and is invisible behind a
     * row they are not allowed to see. They lose a cart to a bug whose whole
     * purpose was to protect one. Filtering inside the selection cannot produce
     * that, because `LIMIT 1` is then applied to rows that are already theirs.
     *
     * WHAT WATCHES FOR IT: `proveDraftOwner.ts` case C4, "B's own draft is not
     * hidden behind A's NEWER one" — which exists for this and nothing else, and
     * whose control asserts that theirs really is the newer row, since with the
     * timestamps the other way round the case would pass under both forms and
     * measure nothing. Measured under the reject-after-the-fact mutation: C4
     * returns `draft-c4-theirs` where it must return `draft-c4-mine`.
     *
     * Not pinned to a sha: this ships in the commit that introduces it, and HEAD
     * would name the commit that does not contain it — CLAUDE.md section
     * Conventions "PIN A CLAIM TO A COMMIT". Written 2026-08-11.
     */
    const heads = await this.db.all<DraftRow>(
      "SELECT id, seller_id, vehicle_no, next_seq, form_json, updated_at, master_as_of" +
        ` FROM local_draft WHERE ${OWNED_BY_CURRENT} ORDER BY updated_at DESC LIMIT 1`,
      ownerParams(owner),
    );

    /*
     * THE COUNT OF WHAT WAS KEPT BACK, in ONE statement with the selection's own
     * predicate, so the two can never describe different moments or disagree
     * about what "mine" means.
     *
     * CASE WHEN, not `NOT (...)`. The complement of this predicate cannot be
     * written by negating it: `NOT (owner_tenant_id = ? AND ...)` is NULL for a
     * null-owner row, NULL is not TRUE, and the rows most needing to be counted
     * would be counted as zero — the same three-valued-logic trap that makes the
     * positive form correct, sprung in the opposite direction. CASE WHEN sends a
     * NULL condition to ELSE, which is the answer wanted here.
     */
    const totals = await this.db.all<{ total: number; owned: number }>(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN ${OWNED_BY_CURRENT} THEN 1 ELSE 0 END), 0) AS owned
         FROM local_draft`,
      ownerParams(owner),
    );
    const withheld = (totals[0]?.total ?? 0) - (totals[0]?.owned ?? 0);

    const head = heads[0];
    if (head === undefined) return { draft: null, withheld };

    const rows = await this.db.all<LineRow>(
      `SELECT id, seq, product_id, product_code, product_name, uom_code,
              gross_weight, tare_weight, net_weight, unit_price, list_price, amount, rules_json
       FROM local_draft_lines WHERE draft_id = ? ORDER BY seq`,
      [head.id],
    );

    const draft: Draft = {
      id: head.id,
      seller_id: head.seller_id,
      vehicle_no: head.vehicle_no,
      next_seq: head.next_seq,
      form: JSON.parse(head.form_json) as DraftForm,
      updated_at: head.updated_at,
      master_as_of: head.master_as_of,
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
          ...(parseRules(r.rules_json) === undefined ? {} : { rules: parseRules(r.rules_json) as LineRules }),
        }),
      ),
    };
    return { draft, withheld };
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
  /**
   * `owner` is read LIVE at the moment of saving and is NOT inherited from the
   * draft row, which carries an owner of its own. That is the decision, not an
   * oversight: the draft's pair records who opened the cart, and this one
   * records who closed it and handed over the cash. Across a shift change they
   * differ, and the bill must carry the second — the server records the
   * principal who SENDS a bill as its creator and the client cannot override
   * that, so gating the send on whoever merely picked the seller would post the
   * money under a person who never touched it.
   */
  async promoteToBill(
    draft: Draft,
    bill: LocalBill,
    owner: LocalIdentity | null,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.run(BILL_INSERT_SQL, billInsertParams(bill, owner));
      await tx.run("DELETE FROM local_draft_lines WHERE draft_id = ?", [draft.id]);
      await tx.run("DELETE FROM local_draft WHERE id = ?", [draft.id]);
    });
  }
}
