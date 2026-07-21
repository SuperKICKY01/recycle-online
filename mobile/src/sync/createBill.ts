/**
 * Local-first bill creation. Pure TypeScript.
 *
 * The bill is written to the LocalStore and is considered SAVED the moment it
 * is local. Nothing here talks to the network — syncing is a separate concern
 * that happens later, possibly much later, possibly after a restart.
 */
import type { BillItemPayload, Clock, IdSource, LocalBill, LocalStore } from "./types.js";

export interface CreateBillDeps {
  store: LocalStore;
  clock: Clock;
  ids: IdSource;
}

export interface BillDraft {
  seller_id: string;
  vehicle_no: string | null;
  items: BillItemPayload[];
  /** Optional client-computed total. The server recomputes and rejects a mismatch. */
  total_amount: string | null;
}

export async function createLocalBill(
  deps: CreateBillDeps,
  draft: BillDraft,
): Promise<LocalBill> {
  const now = deps.clock.now();
  const nowIso = now.toISOString();
  const id = deps.ids.newId();

  // Generated exactly here, exactly once, for the lifetime of this bill.
  const idempotencyKey = deps.ids.newId();

  const bill: LocalBill = {
    id,
    idempotency_key: idempotencyKey,
    payload: {
      id,
      seller_id: draft.seller_id,
      vehicle_no: draft.vehicle_no,
      device_created_at: nowIso,
      idempotency_key: idempotencyKey,
      items: draft.items,
      total_amount: draft.total_amount,
    },
    sync_state: "pending",
    attempt_count: 0,
    last_error: null,
    created_at: nowIso,
    next_attempt_at: nowIso,
    doc_no: null,
    synced_at: null,
  };

  await deps.store.putBill(bill);
  return bill;
}
