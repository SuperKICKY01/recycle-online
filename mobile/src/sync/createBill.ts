/**
 * Local-first bill creation. Pure TypeScript.
 *
 * The bill is written to the LocalStore and is considered SAVED the moment it
 * is local. Nothing here talks to the network — syncing is a separate concern
 * that happens later, possibly much later, possibly after a restart.
 */
import type { BillItemPayload, Clock, IdSource, LocalBill, LocalStore, RowOwner } from "./types.js";

/** What building a bill needs. Deliberately no store — see buildLocalBill. */
export interface BuildBillDeps {
  clock: Clock;
  ids: IdSource;
}

export interface CreateBillDeps extends BuildBillDeps {
  store: LocalStore;
}

/**
 * WHICH SELLER THIS LOAD WAS BOUGHT FROM, AND WHETHER THE SERVER HAS EVER HEARD
 * OF THEM.
 *
 * ---------------------------------------------------------------------------
 * A UNION AND NOT A SECOND FIELD BESIDE `seller_id`, AND THE DIFFERENCE IS
 * MONEY
 * ---------------------------------------------------------------------------
 * The obvious shape is `seller_id: string` plus a required
 * `local_seller_id: string | null`. A required field guarantees the caller
 * ANSWERED; it guarantees nothing about the answer. The caller that passes a
 * LOCAL id as `seller_id` and `null` beside it compiles, saves, sends, and is
 * refused 422 — terminal, for cash already out of the drawer, on a row hard
 * rule 5 forbids deleting. That is the exact failure the park exists to
 * prevent, and a required field does not reach it.
 *
 * Written as a union the two cannot disagree, because there is only ever one
 * id: `buildLocalBill` derives BOTH the payload's `seller_id` and the park from
 * the same value. The leak is unrepresentable rather than merely discouraged,
 * which is the move `correct-classification-can-still-render-as-an-error.md`
 * prescribes — "a gate you have to remember is a bug you have not found yet".
 *
 * IT IS ALSO THE SWEEP. Every construction site in the tree is a compile error
 * until it says which kind of seller it names, and the phase that builds the
 * picker union (S10) meets one at the cart — which is the only place in the app
 * that can ever legitimately produce the `local` case.
 */
export type BillSeller =
  /**
   * A seller the SERVER already holds. The id came down in a `/sellers`
   * refresh, so `POST /bills` resolves it and nothing parks.
   */
  | { readonly kind: "server"; readonly seller_id: string }
  /**
   * Created on THIS DEVICE and not settled yet. The bill parks behind it and is
   * never offered to the send queue until the seller kind settles — see
   * `LocalBill.local_seller_parked_at`.
   */
  | { readonly kind: "local"; readonly local_seller_id: string };

/**
 * The id that goes on the wire, whichever kind of seller this is.
 *
 * AN EXHAUSTIVE SWITCH AND NOT A TERNARY. A third member of `BillSeller` would
 * fall silently into the `server` arm of `kind === "local" ? … : …` and produce
 * a bill that is not parked — the failure with the cash on it. The `never` arm
 * makes it a compile error instead.
 */
function sellerIdOf(seller: BillSeller): string {
  switch (seller.kind) {
    case "server":
      return seller.seller_id;
    case "local":
      return seller.local_seller_id;
  }
}

/** The local seller this bill waits on, or null when it waits on nobody. */
function localSellerOf(seller: BillSeller): string | null {
  switch (seller.kind) {
    case "server":
      return null;
    case "local":
      return seller.local_seller_id;
  }
}

export interface BillDraft {
  seller: BillSeller;
  vehicle_no: string | null;
  items: BillItemPayload[];
  /** Optional client-computed total. The server recomputes and rejects a mismatch. */
  total_amount: string | null;
  /**
   * Fetch time of the master data these prices were defaulted from, carried
   * over from the cart draft. Device-only; it does not enter the payload. Null
   * means unknown, never "fresh". See master/freshness.ts.
   */
  master_as_of: string | null;
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

  /*
   * BOTH DERIVED FROM ONE VALUE, which is the whole reason `BillSeller` is a
   * union. There is no arrangement of these two that names a local seller and
   * fails to park, or parks behind a seller the payload does not name.
   */
  const localSeller = localSellerOf(draft.seller);

  return {
    id,
    idempotency_key: idempotencyKey,
    payload: {
      id,
      seller_id: sellerIdOf(draft.seller),
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
    // The weighing time, denormalised out of the payload so the send queue can
    // be ordered by it. Same value, same instant — payload.device_created_at
    // is the copy that goes to the server.
    device_created_at: nowIso,
    next_attempt_at: nowIso,
    // Never attempted yet, so neither the total-stuck nor the poison clock has
    // started.
    first_attempt_at: null,
    first_server_error_at: null,
    server_error_attempts: 0,
    master_data_missing_at: null,
    master_data_code: null,
    /*
     * PARKED FROM THE MOMENT IT IS WEIGHED, not on the first refusal. The
     * design's words: no request is spent discovering what the device already
     * knows, and the server's 422 rule stays intact for the corruption it was
     * written for.
     *
     * The pair is set together and can only be set together, so "which local
     * seller" and "is it parked" cannot come apart. A bill against a server
     * seller gets null for both and is queued exactly as it always was.
     */
    local_seller_id: localSeller,
    local_seller_parked_at: localSeller === null ? null : nowIso,
    // Note where this is: OUTSIDE `payload`. It is a device record of what the
    // prices were defaulted from, and there is nothing on the wire to carry it.
    master_as_of: draft.master_as_of,
    doc_no: null,
    synced_at: null,
    void_reason: null,
    void_requested_at: null,
    voided_at: null,
    void_attempts: 0,
    void_last_error: null,
    void_refused_at: null,
    void_refused_code: null,
  };
}

/**
 * Build and persist in one step. `owner` is passed straight through to the
 * store and is required for the reason LocalStore.putBill gives: a bill that
 * takes no owner by omission is excluded from the send queue for ever.
 */
export async function createLocalBill(
  deps: CreateBillDeps,
  draft: BillDraft,
  owner: RowOwner | null,
): Promise<LocalBill> {
  const bill = buildLocalBill(deps, draft);
  await deps.store.putBill(bill, owner);
  return bill;
}
