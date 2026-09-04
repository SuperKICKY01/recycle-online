/**
 * Sync layer contracts. PURE TypeScript — no React Native, no Expo, no node
 * builtins. Everything the engine touches is an interface defined here, so the
 * engine runs identically on a device, in a node test, or anywhere else.
 *
 * Money and weight are decimal STRINGS end to end (project hard rule 1: never
 * float, anywhere — DB, API, or client math). The client never does arithmetic
 * on them; the server computes every amount.
 */

import type { RowOwner } from "../session/rowOwner.js";
import type { ResolvedSellerId } from "./resolvedSellerId.js";

export type { RowOwner };

export type SyncState = "pending" | "syncing" | "synced" | "failed";

export interface BillItemPayload {
  id: string;
  product_id: string;
  line_no: number;
  gross_weight: string;
  tare_weight: string;
  net_weight: string;
  unit_price: string;
  list_price: string;
}

/** Exactly the body POST /bills accepts (server contract, Phase 1c). */
export interface BillPayload {
  id: string;
  seller_id: string;
  vehicle_no: string | null;
  device_created_at: string;
  idempotency_key: string;
  items: BillItemPayload[];
  total_amount: string | null;
  /**
   * The yard this bill was written at (server migration 0018). OPTIONAL ON THE
   * WIRE AND OPTIONAL HERE, deliberately: every bill queued before branches
   * existed was stored as JSON without this key and is posted byte for byte
   * (httpTransport.sendBill), and the server resolves an absent branch for
   * itself. A required field here would type-check every old row as carrying
   * a branch it does not have, and the next refactor would send `undefined`
   * as a required key. Present only when the device had learned its branch
   * (SqliteShopStore.readBranch) at the moment the bill was built.
   */
  branch_id?: string;
}

export interface LocalBill {
  /** Client-generated UUID; the SAME id the server stores (hard rule 3). */
  id: string;
  /**
   * Generated ONCE at creation and never regenerated — not on retry, not after
   * a crash, not after a lost response. Regenerating it would defeat the
   * server's dedup and create a duplicate bill for real money. It is a random
   * value frozen at birth, never derived from payload contents, so nothing
   * about the bill can change it.
   */
  idempotency_key: string;
  payload: BillPayload;
  sync_state: SyncState;
  attempt_count: number;
  /** Text of the most recent failure. Cleared on success. Never hidden from the UI. */
  last_error: string | null;
  created_at: string;
  /**
   * When the load was WEIGHED, per the device clock. The send queue is ordered
   * by this so a backlog reaches the server in the order the loads were bought.
   *
   * Same value as payload.device_created_at; held here as its own field so it
   * can be indexed and sorted on. Note it is the DEVICE's clock and therefore
   * untrusted for anything but ordering our own queue — real skew of ~3s was
   * measured on the test iPhone. Reports key on server_received_at.
   */
  device_created_at: string;
  /** Earliest time this bill may be sent again (backoff gate). */
  next_attempt_at: string;
  /**
   * When this bill was FIRST attempted and bounced, for ANY reason (offline or
   * server error) — set once, on the first failed send, never moved after
   * (COALESCE, not assignment), cleared when the bill finally syncs. It measures
   * total time unable to send. `next_attempt_at` keeps sliding forward with
   * every backoff and `created_at` is the weighing time, so neither answers
   * "how long has this been unable to send"; this does. On its own, though, it
   * cannot tell a long outage from a poisoned bill — both bounce for minutes —
   * which is exactly why first_server_error_at exists alongside it.
   */
  first_attempt_at: string | null;
  /**
   * When the head last STARTED failing against a REACHABLE server — the server
   * answered (an HTTP status came back), the network is fine, yet the bill still
   * did not go. Stamped once with COALESCE while that holds, and RESET to null
   * the moment a bounce is transport-level instead (offline again). So it is
   * non-null exactly when "the server is reachable and has been refusing this
   * bill continuously since this instant" — both the fact and its duration, in
   * one field.
   *
   * This is the poison signal. A bill offline for hours never sets it (every
   * bounce is transport-level), so a long outage stays calm amber; a bill the
   * reachable server keeps erroring on sets it and, once it persists past
   * POISON_ALARM_MS, raises the loud red alarm. See sync/queueHealth.ts.
   */
  first_server_error_at: string | null;
  /**
   * How many times IN A ROW the reachable server has failed this bill.
   *
   * Incremented on a server-answered bounce, RESET TO 0 by a transport-level one
   * and by a successful send — the same discipline as first_server_error_at, so
   * "consecutive" really is consecutive and an offline spell cannot inflate it.
   *
   * Why this is not attempt_count: attempt_count counts every attempt of any
   * kind and never resets, so a bill that spent a night offline arrives at
   * morning with a large count and no server error at all. Using it to escalate
   * would fire the red alarm on every yard that lost signal — precisely the
   * cry-wolf failure queue-jam-must-be-visible.md warns about.
   *
   * This is a SECOND trigger for the existing red alarm, not a new
   * classification: whether a jam is offline or poisoned is still decided solely
   * by the reachability signal. See sync/queueHealth.ts.
   */
  server_error_attempts: number;
  /**
   * Non-null ⟺ PARKED WAITING ON MASTER DATA: the server refused this bill with
   * a resolvable reason and this is when. The bill is still `pending` — it is
   * still owed to the server and nothing may drop it — but it is excluded from
   * the head-of-line queue so it cannot dam the bills behind it.
   *
   * Modelled as a flag on `pending` rather than as a new SyncState value ON
   * PURPOSE: sync_state carries a CHECK constraint written into CREATE TABLE, and
   * SQLite cannot alter a CHECK without rebuilding the table — on a database that
   * already holds the shop's unsynced bills. A nullable column is the safe
   * migration and says the same thing.
   */
  master_data_missing_at: string | null;
  /** The server's machine-readable reason code, for the UI. Null when not parked. */
  master_data_code: string | null;
  /**
   * DEVICE-ONLY, NEVER SENT: the fetch time of the master data this bill's
   * prices were defaulted from — carried over from the draft, which stamps it
   * when the bill is started.
   *
   * It is on LocalBill and not on BillPayload because there is nowhere on the
   * server to put it and this phase forbids adding one. It is what makes "was
   * this bill priced from a stale cache" answerable on the device afterwards.
   * See master/freshness.ts, including what it would take to answer the same
   * question in the OFFICE, which this cannot do.
   *
   * Null on any bill written before Phase 2c-8, which reads as "unknown" and is
   * never rendered as "fresh".
   */
  master_as_of: string | null;

  /* ------------------------------ waiting on a seller this device made ---- */
  /*
   * A BILL CAN NAME A SELLER THE SERVER HAS NEVER SEEN, AND WITHOUT THESE TWO
   * IT IS TERMINALLY FAILED WITH THE CASH ALREADY PAID.
   *
   * `server/app/bills.py` classifies an unresolvable `seller_id` as 422 —
   * PERMANENT, terminal — on a premise it states in its own header: the device
   * got those ids from this tenant's own /sellers, so a miss means corruption
   * rather than a setup gap. Offline seller creation falsifies that premise and
   * edits nothing at either end. Left alone, the first offline walk-in produces
   * a terminally failed bill for money already out of the drawer, on a row hard
   * rule 5 forbids deleting
   * (`ROADMAP.md § P1.8` "A BILL CAN NAME A SELLER THE SERVER HAS NEVER SEEN").
   *
   * SO THE BILL IS PARKED ON THE DEVICE FROM THE MOMENT IT IS WEIGHED, and the
   * request the server would misclassify is never made. The repair is here and
   * NOT on the server, because that rule is still right for the corruption it
   * was written for.
   *
   * IT REUSES THE ORDERING EXEMPTION `local_bills` ALREADY HAS rather than
   * inventing a second one: a seller that does not exist yet IS master data
   * that is not set up, which is the one exception
   * `lessons/doc-no-is-arrival-order-not-event-time.md` permits — and that
   * lesson's bound holds, because this is that exemption's own case and not a
   * new skippable state.
   *
   * AND IT IS NOT A NEW `sync_state` VALUE, for the reason `schema.ts` gives at
   * the columns: the CHECK is baked into CREATE TABLE and SQLite cannot alter
   * one without rebuilding the table, on a database already holding a shop's
   * unsynced bills.
   */
  /**
   * ORIGIN — WHICH local seller this bill named when it was weighed. Written
   * once, never rewritten, and kept after the release: it is the record of
   * where the bill's seller came from, not of what it is waiting for.
   */
  local_seller_id: string | null;
  /**
   * Non-null ⟺ the bill is held OUT OF THE SENDABLE QUEUE waiting for that
   * seller to settle. Cleared by the seller kind's own writer, for every bill
   * behind that seller, WITHOUT an owner filter — a second person's bill
   * filtered out here is stranded for ever, because a seller settles once and
   * there is no second event to release it.
   *
   * The bill stays `pending` throughout: still owed, still counted, never
   * terminal.
   */
  local_seller_parked_at: string | null;

  /** Assigned by the server at sync time; null while the bill is offline. */
  doc_no: string | null;
  synced_at: string | null;

  /* ------------------------------------------------------------- void ---- */
  /*
   * Voiding is modelled as a DURABLE INTENT plus a separate confirmation,
   * exactly like the bill itself, and for the same reason: the owner may void a
   * bill that the server has never seen.
   *
   *   void_requested_at  the owner pressed confirm. Written once, NEVER
   *                      cleared, and it is what the UI shows as ยกเลิกแล้ว —
   *                      so the void is visible immediately, offline included.
   *   voided_at          the SERVER confirmed it. Until then the void is still
   *                      owed, and nothing may drop it.
   *
   * Keeping these two apart is what makes a crash survivable: the intent is on
   * disk before any network call, so a restart simply finds it again. There is
   * no state in which the owner voided a bill and the app has forgotten.
   */
  void_reason: string | null;
  void_requested_at: string | null;
  voided_at: string | null;
  void_attempts: number;
  void_last_error: string | null;
  /**
   * Non-null ⟺ THE SERVER REFUSED THE VOID BECAUSE OF WHO ASKED (403), and this
   * is when. The owner's intent stands — void_requested_at is never cleared —
   * but the reversal HAS NOT HAPPENED and will not happen by itself.
   *
   * It is a per-BILL column even though the refusal is a fact about the ACCOUNT,
   * which reverses the rule in lessons/401-is-about-the-caller-not-the-bill.md
   * ("session state is device-global and derived, never stamped on a row") on
   * purpose. The reason the two differ: an expired session says nothing about any
   * bill, whereas this row is CLAIMING SOMETHING FALSE about itself. Without a
   * durable mark the card goes on saying ยกเลิกแล้ว, struck through, for a bill
   * the server still holds as live money — across restarts, because nothing in
   * memory survives one. What is stamped here is not "this account lacks a role";
   * it is "the reversal this row promises did not happen".
   *
   * It also has to stop the retry. listVoidsToApply excludes a refused void, so
   * the void leaves the owed queue instead of being re-POSTed every pass forever
   * against a role that no device action can change.
   */
  void_refused_at: string | null;
  /** The server's machine-readable reason (admin_required). Null when not refused. */
  void_refused_code: string | null;
}

/** Parked waiting on master data the back office has not set up yet. */
export const isMasterDataBlocked = (bill: LocalBill): boolean =>
  bill.master_data_missing_at !== null;

/** Locally voided the moment the owner confirms, server round trip or not. */
export const isVoided = (bill: LocalBill): boolean => bill.void_requested_at !== null;

/** The void has been confirmed by the server and owes nothing further. */
export const isVoidSettled = (bill: LocalBill): boolean => bill.voided_at !== null;

/**
 * The server REFUSED to void this bill because of who asked. The owner's intent
 * stands and is still on the row; the bill is NOT cancelled in the system.
 *
 * Every place that renders "ยกเลิกแล้ว" from isVoided must consult this too, or
 * the screen tells the yard a purchase was reversed while the server still has it
 * live — the money going quiet, which is the one thing this state exists to stop.
 */
export const isVoidRefused = (bill: LocalBill): boolean => bill.void_refused_at !== null;

/**
 * The result of one send attempt.
 *
 * The split between `rejected` and `unavailable` is the whole point of this
 * type: a failure to REACH a verdict is not a negative verdict. `unavailable`
 * means we do not know whether the server committed — retry with the same
 * idempotency key. `rejected` means the server understood the bill and refused
 * it; retrying forever would never help, so it becomes visibly `failed`.
 *
 * Within `unavailable`, `reachable` records whether the SERVER ANSWERED at all:
 * true for an HTTP status we could not use (a 5xx — the network works, the
 * server erred), false for a transport-level failure (timeout, DNS, no
 * connection, no token — we never got a word back). Both retry forever; the flag
 * is not about retrying. It is what lets the UI tell an offline yard ("wait it
 * out", amber) apart from a head bill the reachable server keeps failing ("call
 * support", red). See sync/queueHealth.ts.
 *
 * TWO STATUSES HAVE LEFT `unavailable`, in two phases, and this paragraph is
 * kept because the list above USED TO NAME BOTH OF THEM as examples of
 * reachable-but-unusable. It went on naming 403 for a while after the member
 * below existed — a comment describing the classification it had just stopped
 * being, eighty lines above the one that replaced it. That is not cosmetic: a
 * comment that lies is read as a specification, and the reader who trusts it
 * fixes the code to match. Compare
 * lessons/a-defaulted-getattr-is-a-silent-dead-branch.md, where an accurate
 * comment about a dead branch would have ended a defect that lived from 1c.
 *
 * 401 (Phase 2c-7). As a reachable `unavailable` it was two lies at once: with
 * bills behind it the expired session accumulated server_error_attempts and
 * raised the POISON alarm ("call support"), and with one bill it merely bounced,
 * so the UI said ออฟไลน์ while the server was answering every request. Neither
 * names the fix, which is to sign in again.
 *
 * 403 (this phase). Same shape, different subject: the server answered
 * definitively that this ACCOUNT may not do this. Retrying cannot help, and the
 * poison counter it fed means "the reachable server refuses THIS BILL" — which a
 * role gate does not, because it refuses every bill equally.
 *
 * Both are their own members below.
 */
export type SendOutcome =
  | { kind: "accepted"; doc_no: string | null }
  | { kind: "duplicate"; doc_no: string | null }
  | { kind: "rejected"; reason: string }
  /**
   * The server understood the bill, refused it, and said the refusal is
   * RESOLVABLE: the payload is well-formed but master data it depends on has not
   * been set up (no price tier for the seller's grade, seller has no grade).
   *
   * Distinct from `rejected` because the two have opposite futures. A malformed
   * bill can never become valid, so it is terminal. This one becomes valid the
   * moment the back office adds the price — and if it were terminal, the yard
   * would have to re-weigh a load that has already been tipped into the pile.
   *
   * Distinct from `unavailable` because the server DID answer definitively. It
   * does not retry on a network backoff and it never sits invisibly in the send
   * queue; it parks in a named, operator-visible state and retries slowly or when
   * the operator asks.
   *
   * `code` is the server's machine-readable reason (product_price_unset,
   * seller_grade_unset). Carried so the UI can explain the fix without anyone
   * string-matching an error message.
   */
  | { kind: "rejected_resolvable"; reason: string; code: string }
  /**
   * THE SESSION ENDED. The server answered 401: the token is expired, revoked,
   * or names a user that no longer exists. Nothing is wrong with the bill, the
   * network, or the server.
   *
   * Distinct from `unavailable` because the outcome is NOT unknown — we know
   * exactly why the send did not happen and exactly what fixes it, and because
   * `unavailable`'s reachable flag would drive the poison alarm: an expired
   * session with three bills queued told the yard to call support.
   *
   * Distinct from `rejected` because the bill is untouched and perfectly valid.
   * Re-sending it after a sign-in is the whole fix; nothing is re-typed and the
   * idempotency key is unchanged, so the retry cannot duplicate.
   *
   * There is deliberately NO refresh token (Phase 2c-7 scope). Re-login is the
   * recovery, so the ONE thing this state must do is say so where the operator
   * can act on it.
   */
  | { kind: "session_expired"; reason: string }
  /**
   * FORBIDDEN. The server answered 403: the caller is authenticated, IS exactly
   * who they say they are, and their ROLE does not permit this operation.
   *
   * A FOURTH failure class rather than a fifth spelling of an existing one,
   * because the question lessons/401-is-about-the-caller-not-the-bill.md tells us
   * to ask — what is this failure ABOUT — has an answer none of the others carry.
   * The three classes of unavailable-is-not-rejected are all about the BILL, and
   * this bill is perfect. session_expired is about the caller, which is closer,
   * and still wrong on the axis that decides what the app DOES:
   *
   *   401  the caller is NOBODY. One tap fixes it, on this device, right now —
   *        which is why that class is defined by carrying a sign-in button.
   *   403  the caller is SOMEONE, and that someone may not do this. Signing in
   *        returns the same user with the same role, so the button is not merely
   *        useless here, it is a loop. A HUMAN ELSEWHERE has to change the role.
   *
   * Folding it into session_expired would also have it cleared by every path that
   * clears a session — App clears sessionEnded on any server answer at all — so
   * the refusal would evaporate on the next successful request and come straight
   * back on the next attempt, forever.
   *
   * `code` is the server's machine-readable reason (admin_required), never its
   * message: the UI derives its own sentence, exactly as it does for a 424.
   * Nothing here string-matches prose (server/app/auth.py names the kind for
   * precisely this reason).
   */
  | { kind: "forbidden"; code: string; reason: string }
  /**
   * THE BUILD IS TOO OLD. The server answered 426: this client's API-contract
   * version is below the floor the server now enforces (server/app/version_gate.py).
   *
   * A SIXTH class, and it is about neither the bill, the network, the session,
   * nor the account — it is about the BUILD. The bill is perfect and untouched;
   * it sends the moment the app is updated past the floor. Retrying THIS build
   * cannot help (every request answers 426), so it is not `unavailable`, and its
   * poison counter would fire on every bill equally, which is the same mistake
   * 401 and 403 were pulled out of `unavailable` to avoid.
   *
   * DISTINCT FROM 401, deliberately: signing in returns the SAME too-old build,
   * so the recovery is not a sign-in — it is an update, which is a new process.
   * The kind therefore halts (`halt_kind`), the row goes back to `pending`
   * untouched, and the operator is shown ONE calm "update to continue" state that
   * is device-global and never the sign-out path. `code` is not carried because a
   * 426 has only one meaning and the client branches on the status alone.
   */
  | { kind: "client_outdated"; reason: string }
  | { kind: "unavailable"; reason: string; reachable: boolean };

/**
 * The result of one void attempt. Same shape and same discipline as
 * SendOutcome — and `already_voided` is the void's `duplicate`.
 *
 * The server answers a repeat void with 409. That is SUCCESS, not an error:
 * the desired state (this bill is void) already holds. Treating it as a failure
 * would retry forever and surface a scary red state for a bill that is exactly
 * as the owner wanted it. This is the only thing that makes a lost void
 * response safe to retry.
 */
export type VoidOutcome =
  | { kind: "voided"; doc_no: string | null }
  | { kind: "already_voided"; doc_no: string | null }
  | { kind: "rejected"; reason: string }
  /**
   * Same meaning as SendOutcome.session_expired, and here for the same reason:
   * a bill whose only outstanding work is a void would otherwise hit an expired
   * session with nothing at all on the screen to say so. Fixing one path and
   * leaving the other is how a state comes back through the door nobody watched.
   */
  | { kind: "session_expired"; reason: string }
  /**
   * Same meaning as SendOutcome.forbidden, and THE PATH THAT ACTUALLY HAPPENS
   * TODAY: POST /bills/{id}/void is admin-only, POST /bills is not, so a staff
   * phone can weigh and save all day and is refused the moment it taps ยกเลิกบิล.
   *
   * What this member has to stop is specific and was measured, not assumed: as an
   * `unavailable` the void stayed in listVoidsToApply, which has NO backoff and no
   * time gate, so the device re-POSTed the void on every 4-second pass forever
   * while the card promised it would be handled automatically.
   */
  | { kind: "forbidden"; code: string; reason: string }
  /**
   * Same meaning as SendOutcome.client_outdated: the server answered 426, this
   * BUILD is too old. A void owed by a too-old client stays owed — a repeat is
   * idempotent (409 -> already_voided) — and the kind halts so it does not
   * re-POST every pass against a server that will 426 it until the app updates.
   */
  | { kind: "client_outdated"; reason: string }
  | { kind: "unavailable"; reason: string };

/**
 * The refusal code written when the SERVER REJECTED THE VOID ITSELF — 404, 400
 * or 422 — as opposed to refusing the caller.
 *
 * WHY A CODE AND NOT A NEW COLUMN. The row's STATE is already exactly right:
 * refused, no longer owed, the owner's request and reason preserved. Every
 * question a state has to answer — what the status strip counts, what startup
 * recovery touches, what the sign-out refusal counts, what the queue-health
 * alarm reads — already has an answer for a refused void, so a second column
 * would add a state that answers nothing new. What genuinely differs between a
 * 403 and a 404 is only WHY, and `void_refused_code` is already the field that
 * carries why.
 *
 * TWO THINGS DEPEND ON THIS EXACT VALUE, and both would fail silently if it
 * drifted:
 *   - SqliteLocalStore.clearVoidRefusals must NOT retract it. A 403 is retracted
 *     on sign-in because signing in can change who is asking; signing in cannot
 *     make a missing bill exist or an invalid payload valid, so retracting this
 *     one would restart the infinite retry at every sign-in.
 *   - parkedReason must give it its own sentence. The fallback for an unknown
 *     refusal code says the account lacks permission, which is FALSE here and
 *     would send the operator to the shop owner about a problem that does not
 *     exist.
 *
 * It is not a server code and never arrives over the wire — VoidOutcome's
 * `rejected` member carries no code, because the three statuses are one class
 * to this client and telling them apart would mean parsing the reason string.
 */
export const VOID_REJECTED_CODE = "void_rejected";

export interface Transport {
  /**
   * May reject (throw). A throw carries NO information about whether the
   * server committed, so the engine treats it as `unavailable`, never as a
   * rejection.
   */
  sendBill(bill: LocalBill): Promise<SendOutcome>;
  /**
   * Void an ALREADY-SYNCED bill. The engine never calls this for a bill with no
   * doc_no — an unsynced bill must reach the server first, so that the owner
   * can see it was created and then voided rather than having it vanish.
   */
  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome>;
}

export interface Clock {
  now(): Date;
  sleep(ms: number): Promise<void>;
}

/**
 * UUID source. Injected rather than calling crypto.randomUUID() directly: that
 * would tie the engine to whatever the JS runtime happens to provide, and which
 * UUID API exists under Hermes on a device is UNVERIFIED here (Phase 2b).
 * Injecting it also makes ids deterministic in the proof.
 */
export interface IdSource {
  newId(): string;
}

/** The bill at the front of the send queue, with what the UI needs to judge it. */
export interface QueueHead {
  id: string;
  doc_no: string | null;
  /** Failed send attempts so far. 0 means it has not been tried yet. */
  attempts: number;
  /** When it first failed for any reason; null if never attempted. Total-stuck clock. */
  first_attempt_at: string | null;
  /**
   * When the reachable server last started refusing it; null if the last bounce
   * was offline (or it never failed). Non-null ⟺ poisoned, and the poison clock.
   */
  first_server_error_at: string | null;
  /**
   * Consecutive failures against a REACHABLE server. The count-based trigger for
   * the red alarm, so a bill the server refuses rapidly is surfaced after N
   * refusals instead of waiting out the wall-clock threshold.
   */
  server_error_attempts: number;
  last_error: string | null;
}

/** A snapshot of the pending send queue for health assessment. */
/**
 * EVERY UNSENT BILL ON THE DEVICE, SPLIT BY WHAT IT IS WAITING FOR.
 *
 * Four counts over `local_bills`, `sync_state IN ('pending','syncing')`,
 * DISJOINT and COMPLETE **OVER THAT TABLE**: every unsent BILL is in exactly
 * one, and the four sum to the old undivided total. That is the property that
 * makes them safe to show side by side — a breakdown that double-counts or
 * drops a row would put a number on the strip that no arithmetic reconciles.
 *
 * ---------------------------------------------------------------------------
 * THE SCOPE OF "COMPLETE" WAS RE-DERIVED IN P1.8b, AND IT HAD TO BE NARROWED
 * ---------------------------------------------------------------------------
 * This paragraph said "every unsent row", with no table named. That was true
 * for as long as every unit of work the device owed the server was a row in
 * `local_bills` — which stopped being true at `1d7f638`, when `seller_create`
 * joined `OutboxKind` as the first kind whose rows are somewhere else
 * (`local_sellers`). The sentence did not change and nothing went red; it
 * simply began quantifying over a set it no longer covered.
 *
 * THE CLAIM IS RE-SCOPED RATHER THAN THE STATEMENT WIDENED, and the choice is
 * deliberate. Widening the SQL would mean one statement joining two tables with
 * different key spaces, different owner questions and different states, to
 * produce a number whose parts no longer reconcile with anything — and the
 * completeness this type owes its caller is exactly that the parts reconcile.
 * What the device owes ACROSS KINDS is `OwedByKind` in `sync/outbox.ts`,
 * produced by walking the registry, and that is what the sign-out gate and the
 * strip read. This type stays the bill store's own answer about the bill store,
 * and `bill_send`'s `owedCount` is `mine + mineBlocked` off it.
 *
 * SO NOTHING HERE MAY BE READ AS A STATEMENT ABOUT THE DEVICE'S WHOLE DEBT.
 * A caller that wants "is anything owed" must ask the registry; a caller that
 * asks these four gets bills, and only bills.
 *
 * THE SPLIT IS BY REMEDY, NOT BY STATE, and that is the whole reason it exists.
 * `ROADMAP.md` section P1.7: "One waits for a connection and the other waits for
 * a person. A combined total makes the operator wait for the wrong thing: they
 * see a number that looks like an outage, stand still expecting it to clear, and
 * it never will."
 */
export interface UnsentBreakdown {
  /**
   * MINE, and waiting on a CONNECTION. Goes down on its own, with nobody
   * acting.
   *
   * IT SAID "MINE AND SENDABLE" AND THAT WORD HAD TO GO. This count has never
   * been the sendable queue — it includes a `syncing` row, which is in flight
   * rather than sendable — and P1.8b added a second kind of row it holds that
   * `QUEUED` does not: a bill parked behind a seller this device created. Both
   * belong here rather than in `mineBlocked`, because the split is BY REMEDY
   * and the remedy for both is the same one: wait, and the network does it. A
   * bill waiting on its own seller is emphatically NOT waiting on the office,
   * and putting it in `mineBlocked` would send somebody to ring them.
   *
   * The field is what it always was; only the sentence describing it is now
   * true of the values it receives
   * (`lessons/README.md § Lessons` "a-docstring-that-states-a-filter-is-a-claim-about-its-caller.md — applies to every comment saying what a value EXCLU").
   */
  mine: number;
  /**
   * MINE, parked on master data the office has not set up. Waits on the OFFICE.
   * No amount of network drains it; somebody has to add a price or a grade.
   */
  mineBlocked: number;
  /**
   * Owned by a KNOWN person who is not signed in here. Waits on that PERSON to
   * sign in on this handset. Nothing the operator does releases it, and no
   * connection drains it — which is exactly why it must not sit inside `mine`.
   */
  otherAccount: number;
  /**
   * Owner UNKNOWN — both columns null. Waits on NOBODY.
   *
   * Separate from `otherAccount` because the two differ in the one way that
   * matters to the person reading the strip: another account's bill is released
   * when that person signs in, and this one is released by no sign-in that can
   * ever happen, because null matches no identity. Telling the operator to wait
   * for somebody would be a wrong instruction about a row nobody can claim.
   * Produced by an upgraded handset (rows written before the owner columns
   * existed) and by a save in the boot window before the identity store opened.
   * `OPEN_ITEMS.md` section Code debt carries the open question of disposal.
   */
  unknownOwner: number;
}

export interface QueueSnapshot {
  /**
   * Bills queued to send. EXCLUDES bills parked on missing master data — those
   * are not waiting their turn, they are waiting on the office, and counting them
   * here would report a queue depth that no amount of network will drain.
   */
  pendingCount: number;
  head: QueueHead | null;
  /** Bills parked waiting on master data. Reported separately and never as "behind". */
  masterDataBlockedCount: number;
}

export interface LocalStore {
  /**
   * Local-first write. Once this resolves, the bill is saved from the user's view.
   *
   * `owner` is REQUIRED and nullable. Required because a bill that gets no owner
   * by omission is the silent failure this whole step exists to prevent: the
   * design reads an absent owner as UNKNOWN rather than as mine, so the row is
   * excluded from the send queue and waits for the sign-in of whoever owns it —
   * and if nobody does, it waits for a person who does not exist while the cash
   * on it is already out of the drawer. Nullable because "this device does not
   * know" is a real answer an offline morning genuinely produces, and inventing
   * an identity there would manufacture provenance indistinguishable from a
   * true one.
   */
  putBill(bill: LocalBill, owner: RowOwner | null): Promise<void>;
  getBill(id: string): Promise<LocalBill | null>;
  listByState(state: SyncState): Promise<LocalBill[]>;
  /**
   * Pending bills whose backoff has elapsed, ordered by device_created_at —
   * WEIGHING order, so a backlog drains in the order the loads were bought and
   * the earlier bill takes the lower doc_no.
   */
  listReadyToSend(now: Date, limit: number): Promise<LocalBill[]>;
  /**
   * Clear the retry backoff on all pending bills; returns how many were freed.
   * Called once a send succeeds, because that success proves the server is
   * reachable and every outstanding backoff was computed against a stale view.
   */
  clearBackoffForPending(now: Date): Promise<number>;
  /**
   * ALL pending bills in weighing order, backoff ignored.
   *
   * The sender needs to see the bill it is NOT allowed to skip. Filtering by
   * backoff first hides exactly that bill, which is how a newer load overtook
   * an older one and took the lower doc_no.
   */
  listPendingOldestFirst(limit: number): Promise<LocalBill[]>;
  /**
   * Atomically move pending -> syncing. Returns false if the row was not
   * pending (someone else already claimed it). This is the durable in-flight
   * guard; an in-memory set alone dies with the process.
   */
  claimForSend(id: string, now: Date): Promise<boolean>;
  markSynced(id: string, docNo: string | null, attempt: number, now: Date): Promise<void>;
  markFailed(id: string, reason: string, attempt: number, now: Date): Promise<void>;
  /**
   * Park a bill the server refused for a RESOLVABLE reason. It stays `pending`
   * (still owed, never dropped) but leaves the head-of-line queue, so it cannot
   * block the bills behind it while the office sorts the price out.
   *
   * `retryAt` is a slow cadence, not a network backoff — nothing about retrying
   * sooner makes a price appear faster.
   */
  markMasterDataMissing(
    id: string,
    code: string,
    reason: string,
    attempt: number,
    retryAt: Date,
    now: Date,
  ): Promise<void>;
  /**
   * The send bounced because THE SESSION ENDED (401), not because anything is
   * wrong with the bill, the network or the server.
   *
   * A named transition rather than markPendingAgain(reachable: false), even
   * though the row ends up in a similar shape. `reachable` is documented as "did
   * the server ANSWER" — and for a 401 it did — so passing false there would
   * make the field lie about its own meaning, and the next person to read a
   * metric off it would get wrong numbers. What we actually want is stated here:
   * the bill goes back to pending, and the POISON counters are cleared so an
   * expired session can never raise the "call support" alarm.
   */
  markSessionExpired(
    id: string,
    reason: string,
    attempt: number,
    retryAt: Date,
    now: Date,
  ): Promise<void>;
  /**
   * The send bounced on a 403: this ACCOUNT may not submit bills. Back to
   * pending, poison counters cleared — the same row shape markSessionExpired
   * produces, and deliberately its own named transition all the same.
   *
   * IT TAKES NO retryAt, and that is the difference worth having a second method
   * for. A 401 is waiting for a sign-in the operator can perform in the next ten
   * seconds, so a backoff is a real schedule. Nothing on this device will change a
   * role, so a delay here would be theatre — a number written to make the row look
   * like it is waiting for something. next_attempt_at is set to `now`; what
   * actually stops the retry is the engine refusing to send while the refusal
   * stands, which is device-global and in memory (see SyncEngine.sendForbidden).
   */
  markSendForbidden(id: string, reason: string, attempt: number, now: Date): Promise<void>;
  /**
   * The send bounced on a 426: THIS BUILD is too old for the server. Same row
   * shape as markSendForbidden — back to `pending`, poison columns cleared,
   * next_attempt_at = now, no schedule — because a 426 also refuses every bill
   * from this build equally, so it carries none of the poison signal's meaning
   * and no delay can make an old app new. It is its OWN named transition rather
   * than a reuse of markSendForbidden, so the row's history does not read
   * "forbidden" for a version refusal; what actually stops the retry is the kind
   * halting on the runner and the device-global "update to continue" state.
   */
  markClientOutdated(id: string, reason: string, attempt: number, now: Date): Promise<void>;
  /** Every bill currently parked on master data, for the UI. */
  listMasterDataBlocked(limit: number): Promise<LocalBill[]>;
  /**
   * Un-park bills so the next pass tries them again. `all` = the operator pressed
   * retry (try everything now); otherwise only those whose slow retry is due.
   * Returns how many were released.
   */
  releaseMasterDataBlocked(now: Date, all: boolean): Promise<number>;
  markPendingAgain(
    id: string,
    reason: string,
    attempt: number,
    nextAttemptAt: Date,
    now: Date,
    /**
     * Did the server ANSWER this failed attempt? true stamps
     * first_server_error_at (reachable-but-refusing → the poison clock runs);
     * false clears it (offline → no poison clock). This is the one input that
     * lets the UI tell a poisoned head from a plain outage.
     */
    reachable: boolean,
  ): Promise<void>;
  /**
   * A cheap read of the send queue's health for the UI: how many bills are
   * pending and, if any, the head — the exact bill the engine will try next and
   * refuse to send past. Keyed on the SAME ordering the engine blocks on, so the
   * bill the UI marks as the blocker is the bill actually blocking.
   */
  pendingQueueSnapshot(): Promise<QueueSnapshot>;
  /**
   * Every unsent bill on the device, split by what it is waiting for — the
   * number the sign-out gate turns on (App.tsx's ownUnsentCount is
   * mine + mineBlocked).
   *
   * DECLARED HERE as of P1.18 stage 3, on the design's own finding: the method
   * existed only on the concrete SqliteLocalStore, so the value the gate reads
   * was supplied by a method the shared contract did not require and a second
   * store implementation owed nothing. It is also what the bill kind's
   * `owedCount` reads — the count deliberately WIDER than the sendable queue:
   * a claimed (syncing) bill and a parked bill are both outside `owed()` and
   * both still owed.
   */
  unsentBreakdown(): Promise<UnsentBreakdown>;
  /**
   * Startup recovery: every row stranded in `syncing` by a crash goes back to
   * pending. Returns the ids that were recovered. Never silent.
   */
  resetSyncingToPending(now: Date): Promise<string[]>;
  /**
   * THE SELLER SETTLED. Release every bill parked behind it, and give each one
   * the SERVER's seller id. Returns how many were released.
   *
   * ---------------------------------------------------------------------------
   * NO OWNER FILTER, AND THAT IS THE WHOLE DECISION
   * ---------------------------------------------------------------------------
   * `owed()` on the seller kind asks who CREATED the seller; this asks nothing
   * about who did anything. A bill weighed by a SECOND person against the same
   * local seller must be released too — a seller settles exactly ONCE and there
   * is no later event to release anything, so a bill filtered out here is
   * stranded FOR EVER, for cash already paid, on a row hard rule 5 forbids
   * deleting
   * (`ROADMAP.md § P1.8` "OWED-ASKS-WHO-CREATED-THE-SELLER, AND THE RELEASE DOES NOT").
   *
   * THE NEXT PERSON TO SWEEP THIS FILE FOR A MISSING OWNER PREDICATE WILL FIND
   * THIS STATEMENT AND BE WRONG. Every neighbouring statement here was
   * hand-repaired to ADD one in P1.7, so the shape of this method is exactly
   * what that sweep was looking for. It is written down here because the sweep
   * is a real thing this repository has run and will run again. The released
   * bill does NOT thereby become sendable under the wrong person: `QUEUED`
   * carries its own owner predicate, so B's bill enters B's queue and nobody
   * else's.
   *
   * ONE STATEMENT, the shape `clearBackoffForPending` already has. It rewrites
   * the payload's `seller_id` to the server's, because a bill released still
   * carrying the LOCAL id is a bill that reaches the server and is refused 422 —
   * which is the defect the park exists to prevent, arriving one step later.
   */
  releaseBillsParkedOnLocalSeller(
    localSellerId: string,
    serverSellerId: string,
    now: Date,
  ): Promise<number>;
  /**
   * THE SEND-TIME RESOLVER'S READ HALF. Every bill still parked behind a local
   * seller, as a bill id and the local seller id it waits on — never null,
   * because a parked bill always names the seller it parks behind.
   *
   * It is the SEND path's own read, distinct from the settle-time release
   * above: that one fires ONCE per seller, keyed on the seller that just
   * settled; this reads what is STILL parked so `resolveParkedBehindSettled`
   * can catch the bill weighed after its seller had already settled (the window
   * the release cannot see) and the bill left parked by a crash between the two
   * settle writes.
   */
  listBillsParkedOnLocalSeller(): Promise<
    { readonly id: string; readonly local_seller_id: string }[]
  >;
  /**
   * Un-park ONE bill and stamp the SERVER's seller id onto its payload — the
   * write half of the send-time resolver.
   *
   * The id is a `ResolvedSellerId`, not a string, ON PURPOSE: the only value of
   * that type anyone can construct is one minted from a seller that has settled
   * (`resolvedSellerId.ts`), so a raw or hardcoded id cannot reach this write.
   * A correct server id and a pasted one are the same bytes; the TYPE, not a
   * comparison, is what proves the id travelled the resolution path
   * (`lessons/a-value-comparison-cannot-prove-a-path.md`). Returns 1 if it
   * un-parked the row, 0 if it was already un-parked (idempotent).
   */
  applyResolvedSellerId(
    billId: string,
    resolved: ResolvedSellerId,
    now: Date,
  ): Promise<number>;

  /* ------------------------------------------------------------- void ---- */
  /**
   * Record the owner's intent to void. Returns false if this bill was already
   * void-requested, WITHOUT overwriting the original reason — the first reason
   * given is the true one, and a second press must not silently replace it.
   */
  requestVoid(id: string, reason: string, now: Date): Promise<boolean>;
  /**
   * Bills owing a void to the server: void requested, not yet confirmed, and
   * already synced so there is something on the server to void.
   */
  listVoidsToApply(limit: number): Promise<LocalBill[]>;
  /**
   * How many voids the CURRENT identity still owes: requested, not settled
   * (`voided_at` null), not refused (`void_refused_at` null), ordered by this
   * requester. DELIBERATELY WIDER than listVoidsToApply — no sync_state
   * clause, because a void on a bill that has not synced yet is owed work even
   * though it is not yet actionable, and a count sharing the actionable
   * predicate is a screen that goes quiet exactly while work is happening
   * (P1.18's owed/owedCount rule). The void kind's `owedCount` reads this.
   */
  countVoidsOwed(): Promise<number>;
  markVoidApplied(id: string, attempt: number, now: Date): Promise<void>;
  markVoidAttemptFailed(id: string, reason: string, attempt: number): Promise<void>;
  /**
   * The server REFUSED the void because of who asked (403). The request stays on
   * the row — void_requested_at and void_reason are never touched, so the owner's
   * intent and their words survive — and void_refused_at takes it OUT of
   * listVoidsToApply so nothing re-asks.
   *
   * Not markVoidAttemptFailed with a scary reason: that leaves the void owed, and
   * "owed" is exactly the claim that is false. The system will not perform this
   * void, and the card has to say so.
   */
  markVoidRefused(
    id: string,
    code: string,
    reason: string,
    attempt: number,
    now: Date,
  ): Promise<void>;
  /**
   * Someone signed in, so the caller may now be a DIFFERENT person. Clear every
   * void refusal and let those voids be owed again; returns how many.
   *
   * A sign-in is the only event on this device that can change the answer to "who
   * is asking", so it is the only thing allowed to retract the refusal. If the
   * same staff user signs back in, the one retry is refused again and lands right
   * back here — one request, not a loop.
   */
  clearVoidRefusals(now: Date): Promise<number>;
}
