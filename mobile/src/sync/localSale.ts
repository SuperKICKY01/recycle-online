/**
 * A SALE WRITTEN AT THE YARD (M2) -- the row the phone keeps, the store contract over it, and the transport.
 *
 * PURE TypeScript, the discipline `sync/types.ts` and `sync/localSeller.ts` open with: no React Native, no Expo, no
 * node builtins, so the headless proof drives exactly what the phone runs.
 *
 * OFFLINE-FIRST (hard rule 8). A sale is written to `local_sales` BEFORE anything is sent; it carries a
 * client-generated id (hard rule 3) and an idempotency key frozen at birth (hard rule 4); its doc_no is the
 * server's, assigned at sync, and is null until then -- every screen shows that state (`saleDocLabel`).
 *
 * A SEPARATE CONTRACT FROM `LocalStore`, for the reason `localSeller.ts` gives: `LocalStore` is the PURCHASE bill
 * store, and a sale is a different table with a different counterpart (a buyer, not a seller). The outbox's
 * owed count reaches it through the registry (`OutboxRunner.owedCountByKind` walks every kind), so the sign-out
 * gate sees an unsent sale without this contract being folded into the bill store's.
 *
 * THE OUTCOME IS `SendOutcome`, REUSED. Every answer POST /sales can give is one POST /bills already gives --
 * created, replayed, refused on its merits, refused for a reason that can resolve (424 master data; and 409
 * insufficient_stock under a shop's negative_stock=refuse, which resolves when a purchase syncs), session ended,
 * forbidden, outdated build, unavailable. A second union with the same members would be free to drift from the
 * first, and the classification (`classifySend`) is shared for the same reason.
 *
 * MONEY IS STRINGS. Every amount and weight below is a decimal string (hard rule 1); the line figures are the
 * shared line rule's (`money/lineRules.ts`, golden vectors in both suites), and the server re-derives each one.
 */

import type { RowOwner } from "../session/rowOwner.js";
import type { SendOutcome, SyncState } from "./types.js";

/** One line exactly as POST /sales accepts it (server app/sales.py SaleItemIn). */
export interface SaleItemPayload {
  id: string;
  product_id: string;
  line_no: number;
  gross_weight: string;
  tare_weight: string;
  net_weight: string;
  unit_price: string;
  pricing_basis: string;
  rounding_rule: string;
  quantity?: string;
}

/** Exactly the body POST /sales accepts (server app/sales.py SaleCreate). */
export interface SalePayload {
  id: string;
  buyer_id: string;
  device_created_at: string;
  idempotency_key: string;
  items: SaleItemPayload[];
  total_amount: string;
  /** Money taken at the counter with the sale, or absent (the server records the receipt with the sale). */
  received_amount?: string;
  received_method?: "cash" | "transfer" | "promptpay";
  branch_id?: string;
}

/** The row. The same state vocabulary as `local_bills` and `local_sellers`: one device, one set of names. */
export interface LocalSale {
  id: string;
  idempotency_key: string;
  payload: SalePayload;
  sync_state: SyncState;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  device_created_at: string;
  next_attempt_at: string;
  /** The server's number, written once at sync. NULL until then, and the screen says so. */
  doc_no: string | null;
  /** The server's machine reason a resolvable refusal parked this sale on (insufficient_stock, ...), or null. */
  parked_code: string | null;
  /** For the list: who it was sold to, as the device knew the buyer when the sale was written. */
  buyer_label: string;
  owner_tenant_id: string | null;
  owner_user_id: string | null;
}

/** What `createSale` needs: the payload and the label; everything else is the store's to set. */
export interface NewLocalSale {
  payload: SalePayload;
  buyer_label: string;
  owner: RowOwner;
  now: Date;
}

export interface LocalSaleStore {
  /** WRITE FIRST: the sale exists on the device before any request is made. */
  createSale(sale: NewLocalSale): Promise<void>;
  /**
   * Owed AND actionable, mine only, oldest written first (the server numbers sales in arrival order). The retry
   * backoff is NOT applied here -- the drain applies `dueAt`, and a head-of-line sender has to SEE the sale it may
   * not skip (the bill send's rule). `now` serves one purpose: a PARKED sale (a resolvable refusal) stays out of
   * the queue until its slow retry comes due, as a parked bill does.
   */
  listSalesToSend(limit: number, now: Date): Promise<LocalSale[]>;
  /** Owed, whatever the schedule: pending, syncing, or parked. Never filtered by what can be attempted. */
  countSalesOwed(): Promise<number>;
  /** The durable claim: pending -> syncing, conditionally. False is not an outcome. */
  claimSaleSend(id: string, now: Date): Promise<boolean>;
  markSaleSynced(id: string, docNo: string | null, attempt: number, now: Date): Promise<void>;
  /** Terminal: the server refused the sale on its merits. Visible, never silent (hard rule 8). */
  markSaleFailed(id: string, reason: string, attempt: number, now: Date): Promise<void>;
  /** Still owed: back to pending with a schedule (retry, parked, session ended, forbidden, outdated). */
  markSalePending(id: string, reason: string, parkedCode: string | null, attempt: number, next: Date, now: Date): Promise<void>;
  /** Boot sweep: a sale stranded `syncing` by a crash goes back to pending (the key is unchanged). */
  resetSyncingSalesToPending(now: Date): Promise<string[]>;
  /** The screen's list: mine, newest first, every state. */
  listSalesForScreen(limit: number): Promise<LocalSale[]>;
  /** Replace the SIGNED-IN SHOP's cached buyers with GET /buyers' answer (one transaction). */
  saveBuyers(buyers: readonly CachedBuyer[]): Promise<void>;
  /** The signed-in shop's cached buyers; another shop's rows read as none. */
  listBuyers(): Promise<CachedBuyer[]>;
}

/** A buyer as the phone caches it: identity and name only -- never an ID-card number (M2). */
export interface CachedBuyer {
  id: string;
  code: string;
  name: string;
}

export interface SaleTransport {
  sendSale(sale: LocalSale): Promise<SendOutcome>;
}

/** The doc_no a screen shows: the server's, or the plain statement that there is none yet (hard rule 3). */
export function saleDocLabel(sale: Pick<LocalSale, "doc_no" | "sync_state">): string {
  if (sale.doc_no !== null) return sale.doc_no;
  return sale.sync_state === "failed" ? "ไม่ได้เลขที่ — เซิร์ฟเวอร์ไม่รับบิลนี้" : "ยังไม่มีเลขที่ — รอส่ง";
}
