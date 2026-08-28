/**
 * A SELLER CREATED AT THE WEIGHBRIDGE WITH NO NETWORK — the row, the reserved
 * code it spends, and the store contract over both.
 *
 * PURE TypeScript, the same discipline `sync/types.ts` opens with: no React
 * Native, no Expo, no node builtins, so the headless proof drives exactly what
 * the phone runs.
 *
 * ---------------------------------------------------------------------------
 * A SEPARATE CONTRACT FROM `LocalStore`, AND WHY
 * ---------------------------------------------------------------------------
 * `LocalStore` is the BILL store — every one of its members names `local_bills`
 * or a void on one. This is a different table with a different key space and a
 * different owner question, and the repository already keeps one contract per
 * concern: the master store, the draft store, `SqliteIdentityStore` and now
 * `DeviceIdentityStore` are all separate for the same reason. Folding these
 * members into `LocalStore` would make every implementation of the bill store
 * owe seller methods it has no table for.
 *
 * WHAT THAT COSTS, STATED RATHER THAN GLOSSED: the sign-out gate reads a count
 * off `LocalStore`, and this kind's owed rows are not in it. That is the
 * surfaces criterion `EVERY-SURFACE-SEES-A-KIND-THAT-IS-NOT-A-BILL`; it is a
 * REAL gap the moment this kind ships, and it is NOT closed here — the phase
 * that draws the surfaces closes it, and that criterion says which value has to
 * end up declared on which contract.
 *
 * ---------------------------------------------------------------------------
 * MONEY DOES NOT APPEAR IN THIS FILE
 * ---------------------------------------------------------------------------
 * A seller carries no amounts and no weights, so hard rule 1 has nothing to
 * bite on here. Said out loud because the absence of a decimal-string
 * declaration in a new sync-layer type would otherwise read as an oversight
 * beside `BillPayload`, where every such field is `string` on purpose.
 */

import type { RowOwner } from "../session/rowOwner.js";

/**
 * ONE CODE THIS DEVICE IS HOLDING, exactly as the server minted it.
 *
 * The pair is inseparable and that is the point of the type. The CODE is what a
 * printed slip will carry; the TOKEN is what makes a repeat of the create
 * recognisable BY THE SERVER as the same create, and it is the only reason this
 * kind may declare `resendIsIdempotent: true` at all — `sellers` has no
 * idempotency key column. A code carried without its token is a create that
 * duplicates a person on a lost response.
 */
export interface ReservedCode {
  /** The human-readable seller code. Unique per tenant, for ever. */
  code: string;
  /**
   * The server's opaque secret naming this reservation. NEVER derived, never
   * parsed, never rendered: it is a bearer secret for one reservation, and
   * anything that puts it on a screen or in a log has published it.
   */
  token: string;
  /** When this device received it. Local bookkeeping; the server does not care. */
  received_at: string;
  /**
   * The local seller this code is bound to, or null while it is SPENDABLE.
   *
   * CONTENT, and LOCAL — see `local_seller_codes` in schema.ts. A refill's
   * answer re-sends the device's whole holding, including codes already bound,
   * and must never rewrite this.
   */
  spent_on: string | null;
}

/**
 * The four states a local seller row can be in — deliberately the SAME NAMES
 * `local_bills` uses, so the device has one state vocabulary rather than two.
 *
 * `synced` IS the design's "settled": the server holds a `sellers` row this
 * local row produced, and `server_seller_id` names it.
 */
export type SellerSyncState = "pending" | "syncing" | "synced" | "failed";

/**
 * THE ROW — the kind's own descriptor, and it carries its own payload.
 *
 * The design permits that here and refuses it for the seller PHOTOGRAPH kind,
 * and the distinction is size and nothing else: this is a handful of short
 * strings and a batch of them in memory costs nothing. That argument does not
 * transfer to a payload measured in megabytes.
 */
export interface LocalSeller {
  /**
   * The LOCAL id. A bill weighed against this seller carries this in its
   * `seller_id`, and the server has never seen it.
   *
   * IT IS NOT SENT AND IT NEVER BECOMES THE SERVER'S ID. `SellerCreate` sets
   * `extra="forbid"` and declares no `id`, and `sellers.id` carries
   * `DEFAULT gen_random_uuid()` where `purchase_bills.id` has none — the
   * offline boundary was drawn at the BILL on purpose (hard rule 3), and moving
   * it would be a server change. The server's id arrives at settle and is
   * written to `server_seller_id` beside this one.
   */
  id: string;
  /** The reserved code being spent, and the token that proves this device holds it. */
  code: string;
  reservation_token: string;
  name: string;
  phone: string | null;
  grade: string | null;
  id_number: string | null;
  address: string | null;
  vehicle_no: string | null;
  sync_state: SellerSyncState;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  /** The kind's own schedule. Real backoff on retry, unlike the void kind. */
  next_attempt_at: string;
  /** The SERVER's seller id, written once at settle. Null until then. */
  server_seller_id: string | null;
  settled_at: string | null;
  /**
   * Non-null means the server answered 409 on this create. The two server-side
   * guards make that unreachable, so reaching it is an invariant violation: the
   * row stays OWED and operator-visible and is never settled on.
   */
  needs_review_at: string | null;
  needs_review_code: string | null;
  /** ORIGIN — who CREATED this seller. Null means UNKNOWN, never "mine". */
  owner_tenant_id: string | null;
  owner_user_id: string | null;
}

/**
 * What a person at the weighbridge typed, before a code has been attached.
 *
 * IT CARRIES NO `code` FIELD, and that absence is the point of a distinct type.
 * This path always SPENDS A RESERVATION — a code the server minted for this
 * device — so there is never a code for a person to supply. A draft type with an
 * optional code, meaning "the server assigns one", would put a field here whose
 * meaning is the opposite of what this path can do.
 */
export interface LocalSellerDraft {
  name: string;
  phone: string | null;
  grade: string | null;
  id_number: string | null;
  address: string | null;
  vehicle_no: string | null;
}

/**
 * Why a local seller could not be created on this device. A union rather than a
 * null, so the caller cannot render one sentence over two different causes —
 * lessons/correct-classification-can-still-render-as-an-error.md, whose repair
 * was to derive the message from the cause and never from the common case.
 */
export type CreateLocalSellerRefusal =
  /**
   * No spendable code. The yard CANNOT create a walk-in offline until this
   * device reaches the server, and no amount of waiting on this screen helps.
   */
  { kind: "no_code" };

export type CreateLocalSellerResult =
  | { kind: "created"; seller: LocalSeller }
  | { kind: "refused"; refusal: CreateLocalSellerRefusal };

/**
 * THE STORE. Every member is a statement about `local_sellers` or
 * `local_seller_codes`, and the split between `listSellersToCreate` and
 * `countSellersOwed` is the outbox design's owed/owedCount rule rather than a
 * duplication: one is filtered by what can be ATTEMPTED, the other only by what
 * is SETTLED.
 */
export interface LocalSellerStore {
  /* --------------------------------------------------------- the codes -- */

  /**
   * Record everything the server says this device holds.
   *
   * IDEMPOTENT, AND IT MUST NOT REWRITE WHAT IT ALREADY HAS. The refill route
   * answers with the device's WHOLE holding on every call — that is the
   * design's load-bearing half, the thing that repairs a device whose first
   * answer was lost — so almost every code in a typical answer is one this
   * device already stored, and some of them are already bound to a local
   * seller. Returns how many rows were NEW.
   */
  saveReservations(codes: readonly IssuedCode[], now: Date): Promise<number>;
  /** Every code this device holds, bound or not. Ordered by code. */
  listReservations(): Promise<ReservedCode[]>;
  /**
   * How many codes the yard can still SPEND — the rows whose `spent_on` is null.
   *
   * THE ONE NUMBER THE RESERVE LEVEL IS DERIVED FROM. It is a count of what the
   * device can still DO, never of what the server has issued: a code on a
   * settled create is not counted, a code on a create in flight is not counted,
   * and a code returned by a terminally refused create IS counted, because the
   * refusal unbound it.
   */
  spendableCount(): Promise<number>;

  /* -------------------------------------------------- the reserve target -- */

  /**
   * THE SHOP'S TARGET FOR THIS DEVICE'S HOLDING, and when it last arrived — or
   * null when no refill has ever succeeded.
   *
   * `spendable` and `held` are LOCAL counts; the target is the one input the
   * reserve level needs that this device cannot know on its own, so it is
   * persisted from a refill answer and read here. NULL IS A FIRST-CLASS ANSWER
   * and means NEVER PROVISIONED — it must never be papered over with a zero or a
   * default, which would be a target the strip renders a sufficiency claim
   * against (`lessons/fallback-default-is-a-wrong-number.md`).
   */
  loadReserveTarget(): Promise<ReserveTarget | null>;
  /**
   * Persist the target a refill answered with, overwriting the single row.
   *
   * `now` is stamped as `target_at` so a reader can tell how old the target is:
   * a refill is a no-op when offline, so this value can go stale, and the strip
   * refuses to present a stale target as fresh
   * (`lessons/cached-master-data-is-a-price-claim.md`). A later refill's target
   * is the current one; there is no history to keep.
   */
  saveReserveTarget(target: number, now: Date): Promise<void>;

  /* ------------------------------------------------------- the sellers -- */

  /**
   * Create a local seller, binding one spendable code to it ATOMICALLY.
   *
   * ONE TRANSACTION, and it is the only multi-statement method here. Picking a
   * code and inserting the row are two writes that must not be separable: a
   * crash between them either leaves a code bound to a seller that does not
   * exist, or a seller holding a code another create can still pick. The second
   * is two people on one code.
   *
   * `owner` is REQUIRED and nullable, exactly as `putBill`'s is and for the
   * same two reasons: required so a row cannot get UNKNOWN ownership by
   * omission, nullable because "this device does not know" is a real answer an
   * offline morning produces and inventing one manufactures provenance.
   */
  createLocalSeller(
    draft: LocalSellerDraft,
    owner: RowOwner | null,
    id: string,
    now: Date,
  ): Promise<CreateLocalSellerResult>;
  getLocalSeller(id: string): Promise<LocalSeller | null>;
  /**
   * THE LOCAL ROWS THE SELLER PICKER MAY OFFER, filtered to the current
   * identity, in creation order.
   *
   * A DIFFERENT QUESTION FROM `listSellersToCreate`, WHICH IS WHY IT IS ITS OWN
   * METHOD. That one is the send queue — actionable, due, not held for review.
   * This is what a person may WEIGH A BILL AGAINST: a seller still owed
   * (`pending`/`syncing`) and one that has SETTLED but whose server row a
   * refresh has not yet carried down (`synced`). It excludes `failed` (the
   * server refused the create, so a bill against it is refused too) and rows
   * held for review (a 409, a settled question). The picker's union
   * (`cart/pickerSellers.ts`) drops the settled rows the cache already holds; a
   * row this returns is offered under its LOCAL id, so a bill weighed against it
   * carries that id and the send path resolves it.
   */
  listForPicker(): Promise<LocalSeller[]>;
  /**
   * Rows owed AND ACTIONABLE NOW, in creation order, filtered to the current
   * identity — the kind's `owed()`.
   *
   * THE OWNER QUESTION IS THIS KIND'S OWN, AND IT IS A THIRD ONE. `bill_send`
   * filters on who WEIGHED the bill and `bill_void` on who ORDERED THE
   * REVERSAL; this filters on **who CREATED the seller**. Three questions,
   * three filters, each written by hand at its own site.
   *
   * Excludes rows held for review: a 409 is a settled question, and re-asking
   * it every pass is what `needs_review` exists to stop.
   */
  listSellersToCreate(now: Date, limit: number): Promise<LocalSeller[]>;
  /**
   * How many local sellers are still owed — DELIBERATELY WIDER than
   * `listSellersToCreate`: in-flight rows and rows held for review are both
   * still owed, and a count sharing the actionable predicate is a screen that
   * goes quiet exactly while work is happening.
   */
  countSellersOwed(): Promise<number>;
  /**
   * Atomically move pending to syncing. False if the row was not claimable.
   * The DURABLE in-flight guard — this kind has one, unlike the void kind.
   */
  claimSellerCreate(id: string, now: Date): Promise<boolean>;
  /** The server created it (or recognised the replay). Writes the SERVER's id. */
  markSellerCreated(
    id: string,
    serverSellerId: string,
    attempt: number,
    now: Date,
  ): Promise<void>;
  /**
   * The server refused the payload on its own merits. TERMINAL, and it RETURNS
   * THE CODE to the device's spendable holding — the reservation was never
   * spent, because the server moves a reservation to `spent` only inside the
   * seller INSERT, and an INSERT that never happened spent nothing.
   */
  markSellerCreateRefused(id: string, reason: string, attempt: number, now: Date): Promise<void>;
  /**
   * A 409 — an unreachable state that has been reached. STILL OWED, out of the
   * actionable set, operator-visible. The code stays BOUND: the server may hold
   * a row under it and this device must not spend it a second time.
   */
  markSellerCreateNeedsReview(
    id: string,
    code: string,
    reason: string,
    attempt: number,
    now: Date,
  ): Promise<void>;
  /** An unknown outcome. Still pending, still owed, scheduled for another go. */
  markSellerCreateAttemptFailed(
    id: string,
    reason: string,
    attempt: number,
    nextAttemptAt: Date,
  ): Promise<void>;
  /**
   * Startup recovery: every row stranded `syncing` by a crash goes back to
   * pending. Returns the ids it swept.
   *
   * A REAL SWEEP, unlike the void kind's correct no-op. This kind's in-flight
   * state is DURABLE — `claimSellerCreate` writes it — so nothing else would
   * ever look at a stranded row again: `listSellersToCreate` returns only
   * `pending` rows, which is precisely what makes the claim work.
   */
  resetSyncingSellersToPending(now: Date): Promise<string[]>;
}

/**
 * One reservation as the SERVER hands it over — the code and its token, and
 * nothing else.
 *
 * A SEPARATE TYPE FROM `ReservedCode` ON PURPOSE. `spent_on` and `received_at`
 * are facts this DEVICE owns, and a wire type carrying them would invite a
 * writer to take them from the response, where the first is always absent and
 * the second would be the server's clock rather than this one's.
 */
export interface IssuedCode {
  code: string;
  token: string;
}

/**
 * The shop's target for this device's holding, as last received from a refill,
 * with the device-time instant it arrived. Both are needed by the reserve strip:
 * the target to classify `ample` vs `low`, and `target_at` to decide whether the
 * target is fresh enough to make that classification (`master/reserveStrip.ts`).
 */
export interface ReserveTarget {
  target: number;
  target_at: string;
}
