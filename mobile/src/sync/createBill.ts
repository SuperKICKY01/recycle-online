/**
 * Local-first bill creation. Pure TypeScript.
 *
 * The bill is written to the LocalStore and is considered SAVED the moment it
 * is local. Nothing here talks to the network — syncing is a separate concern
 * that happens later, possibly much later, possibly after a restart.
 */
import type { BillItemPayload, Clock, IdSource, LocalBill, LocalStore } from "./types.js";

/** What building a bill needs. Deliberately no store — see buildLocalBill. */
export interface BuildBillDeps {
  clock: Clock;
  ids: IdSource;
}

export interface CreateBillDeps extends BuildBillDeps {
  store: LocalStore;
}

export interface BillDraft {
  seller_id: string;
  vehicle_no: string | null;
  items: BillItemPayload[];
  /** Optional client-computed total. The server recomputes and rejects a mismatch. */
  total_amount: string | null;
}

/**
 * Builds the bill WITHOUT persisting it. Pure apart from the injected clock
 * and id source.
 *
 * Split out in Phase 2c-3 so the cart can mint a bill and insert it inside the
 * same transaction that clears the draft. Promotion cannot call
 * createLocalBill: that would write the bill in its own statement, and a crash
 * before the draft was cleared would leave BOTH — the duplicate the whole
 * transaction exists to prevent.
 *
 * Note what is minted here and nowhere earlier: the bill id and the
 * idempotency_key. A draft carries neither, so nothing is consumed until the
 * user actually commits the bill.
 */
export function buildLocalBill(deps: BuildBillDeps, draft: BillDraft): LocalBill {
  const now = deps.clock.now();
  const nowIso = now.toISOString();
  const id = deps.ids.newId();

  // Generated exactly here, exactly once, for the lifetime of this bill.
  const idempotencyKey = deps.ids.newId();

  return {
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
}

export async function createLocalBill(
  deps: CreateBillDeps,
  draft: BillDraft,
): Promise<LocalBill> {
  const bill = buildLocalBill(deps, draft);
  await deps.store.putBill(bill);
  return bill;
}
