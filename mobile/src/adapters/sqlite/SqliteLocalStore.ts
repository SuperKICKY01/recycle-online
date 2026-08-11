/**
 * Production LocalStore over SQLite. Implements the exact interface the sync
 * engine already depends on — the engine was not changed to fit the database.
 *
 * EVERY method here is exactly ONE SQL statement. That is deliberate:
 *
 *  - SQLite wraps every statement in an implicit transaction, so a single
 *    conditional UPDATE is already atomic; the claim cannot half-happen.
 *  - Nothing in the bill lifecycle needs to span statements, so none of it
 *    depends on explicit transaction handling at all.
 *
 * The claim's atomicity therefore rests on one thing: UPDATE ... WHERE
 * sync_state = 'pending' reporting an exact rowcount. Proven under four real
 * OS threads on one database file in src/proof/sqliteProof.ts.
 *
 * AMENDED IN PHASE 2c-3. This header used to conclude "and no mutex is
 * needed". That was true only while every operation in the whole app was a
 * single statement. The cart's draft -> bill promotion is genuinely
 * multi-statement (insert the bill, clear the draft, indivisibly), so the
 * driver now serialises the connection and offers `transaction()`. The
 * statements below are unchanged and still need nothing from it — but the
 * blanket claim was no longer true and would have misled the next reader into
 * adding a second statement to one of these methods believing it was safe.
 * See adapters/sqlite/mutex.ts.
 */
import { SEND_SCHEDULE_HORIZON_MS } from "../../time/clockSanity.js";
import { VOID_REJECTED_CODE } from "../../sync/types.js";
import type { LocalBill, LocalStore, QueueSnapshot, RowOwner, SyncState } from "../../sync/types.js";
import type { SqlDriver, SqlValue } from "./driver.js";
import { SqliteIdentityStore } from "./SqliteIdentityStore.js";
import type { LocalIdentity } from "./SqliteIdentityStore.js";
import { initConnection } from "./schema.js";

interface BillRow {
  id: string;
  idempotency_key: string;
  payload_json: string;
  sync_state: string;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  device_created_at: string;
  next_attempt_at: string;
  doc_no: string | null;
  synced_at: string | null;
  void_reason: string | null;
  void_requested_at: string | null;
  voided_at: string | null;
  void_attempts: number;
  void_last_error: string | null;
  void_refused_at: string | null;
  void_refused_code: string | null;
  first_attempt_at: string | null;
  first_server_error_at: string | null;
  server_error_attempts: number;
  master_data_missing_at: string | null;
  master_data_code: string | null;
  master_as_of: string | null;
}

const COLUMNS =
  "id, idempotency_key, payload_json, sync_state, attempt_count, last_error," +
  " created_at, device_created_at, next_attempt_at, doc_no, synced_at," +
  " void_reason, void_requested_at, voided_at, void_attempts, void_last_error," +
  " void_refused_at, void_refused_code," +
  " first_attempt_at, first_server_error_at, server_error_attempts," +
  " master_data_missing_at, master_data_code, master_as_of";

/**
 * The head-of-line queue excludes parked bills, in ONE place, reused by every
 * query that defines "queued to send".
 *
 * This is the deliberate ordering trade, and it is the only place it happens:
 * a parked bill is passed by bills weighed after it, so it will take a HIGHER
 * doc_no when it finally syncs. That is a real weakening of weighing order — see
 * lessons/doc-no-is-arrival-order-not-event-time.md — accepted because the
 * alternative is one un-priced product stopping the whole yard from syncing, and
 * because the bill is parked VISIBLY rather than silently skipped, which is the
 * distinction lessons/queue-jam-must-be-visible.md actually draws.
 */
/*
 * THE OWNER HALF, ADDED HERE AND NOT AT THE SIX CALL SITES.
 *
 * A bill may be sent only under the identity that took the goods. Across shops
 * the wrong token is refused terminally (422) and the bill dies with the cash
 * already paid out; within one shop it SUCCEEDS (201) and records the wrong
 * person as the buyer, which nothing downstream can detect or correct. Both are
 * blocked by never sending under the wrong identity in the first place.
 *
 * WHY IT IS IN THE CONSTANT. `QUEUED` is the definition of "queued to send",
 * and ownership is now part of that definition rather than a check somebody
 * remembers at each query — the same reasoning as hard rule 2's "enforce at the
 * lowest layer". It also fails LOUD: a statement that uses this constant and
 * forgets the two bound values gets a parameter-count error from the driver,
 * not a silently wrong row set.
 *
 * NULL NEEDS NO SPECIAL CASE, and that is why the clause is written as a plain
 * comparison. SQL three-valued logic does the whole job: a NULL owner column
 * compared to anything yields NULL, NULL is not TRUE, and the row is excluded.
 * So one clause covers all four states — owned by me (selected), owned by
 * someone else (excluded), UNOWNED (excluded, which is what "null means UNKNOWN
 * and parks" cashes out to), and no identity stored on the device at all, where
 * the bound values are NULL and nothing is selected. That last case fails
 * CLOSED, deliberately: after an upgrade the keystore still holds a dead token
 * while no identity has ever been recorded, and ROADMAP.md section P1.7 says
 * those bills must stop sending rather than keep trying.
 */
const OWNED_BY_CURRENT = "owner_tenant_id = ? AND owner_user_id = ?";

/**
 * The two bound values, in the order the clause names them. Expanded from the
 * pair at one point, so the columns can never disagree about whether an owner
 * is known.
 */
function ownerParams(owner: RowOwner | null): SqlValue[] {
  return [owner === null ? null : owner.tenant_id, owner === null ? null : owner.user_id];
}

/*
 * THE VOID PATH HAS NO OWNER FILTER AS OF THIS COMMIT, AND EDITING THIS
 * CONSTANT DID NOT GIVE IT ONE. Read this before believing the work is done.
 *
 * `listVoidsToApply` draws on NEITHER shared constant — not this one, not
 * DUE_OR_UNBELIEVABLE. It carries its own predicate (void_requested_at IS NOT
 * NULL AND voided_at IS NULL AND void_refused_at IS NULL AND sync_state =
 * 'synced' AND doc_no IS NOT NULL), so a filter added here does not reach it by
 * any route. Whoever edits this line, runs the send proofs and sees green will
 * believe another person's bills can no longer leave the device. A VOID for
 * another person's bill still can.
 *
 * AND THIS CHANGE MAKES AN EXISTING HAZARD MORE LIKELY, WHICH IS THE PART THAT
 * IS NOT OBVIOUS. The void path has no backoff column and no device-global
 * gate, so a void the server refuses is re-POSTed on every pass — roughly every
 * four seconds, indefinitely. That hazard is already recorded; what changes
 * today is its RATE. A filter creates refusals that did not previously happen:
 * bills that used to send under whatever identity was present now park, and the
 * voids that follow them meet a server that has every reason to refuse. More
 * refusals means more rows sitting in a queue that retries for ever.
 *
 * The queued item is `OPEN_ITEMS.md § Code debt found and left in place`,
 * "A definitively refused void is re-sent on every pass". Someone reading this
 * code will not open that file, which is why the hazard is stated here and not
 * only pointed at.
 */
const QUEUED =
  `sync_state = 'pending' AND master_data_missing_at IS NULL AND ${OWNED_BY_CURRENT}`;

/**
 * "The scheduled time has come, OR the schedule is not believable."
 *
 * The SQL half of time/clockSanity.ts's `scheduledInstantIsDue`, and it must
 * stay the same rule: a next_attempt_at further out than any delay this app can
 * write is a reading from a clock that has since moved backwards, not a
 * schedule, and the bill is due now. Fails OPEN — a stranded bill is real money
 * on one phone with no server record, and an early send is harmless because the
 * idempotency_key is unchanged.
 *
 * WHY IT IS HERE AND NOT ONLY IN THE ENGINE. The engine no longer calls
 * listReadyToSend at all — it reads listPendingOldestFirst and gates in TS. But
 * five proof cases still read listReadyToSend (proveSync, proveCart,
 * sqliteProof), so a rule that landed only in the engine would leave those
 * asserting the pre-fix semantics: the suite would go green while proving the
 * old behaviour. Same reason the in-memory fake mirrors it statement for
 * statement.
 *
 * Timestamps are fixed-width toISOString() output, so lexicographic comparison
 * IS chronological comparison (see schema.ts).
 */
const DUE_OR_UNBELIEVABLE = "(next_attempt_at <= ? OR next_attempt_at > ?)";

/** now, and the furthest out a real schedule could reach, as bound params. */
function dueParams(now: Date): [string, string] {
  return [
    now.toISOString(),
    new Date(now.getTime() + SEND_SCHEDULE_HORIZON_MS).toISOString(),
  ];
}

/**
 * The bill INSERT, defined once and exported.
 *
 * SqliteDraftStore.promoteToBill has to perform this same insert inside its
 * transaction. Writing it out a second time there would be a column list free
 * to drift from this one — silently, since both would still compile and only
 * the promoted bills would be wrong. One definition, two call sites.
 *
 * THE OWNER COLUMNS ARE APPENDED HERE AND ARE DELIBERATELY NOT IN `COLUMNS`.
 * `COLUMNS` is the SELECT list every read in this file shares, so putting them
 * there would change what eight existing queries return in the same commit that
 * first writes them — and a wrong value could then not be told apart from a
 * wrong reader. They are WRITTEN now and READ in the commit that has a use for
 * them. Nothing between here and there may treat their absence from a read as
 * evidence the row has no owner.
 */
export const BILL_INSERT_SQL =
  `INSERT INTO local_bills (${COLUMNS}, owner_tenant_id, owner_user_id)` +
  " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

/**
 * `owner` is REQUIRED and nullable — never optional, and never two loose
 * strings. Both halves of that are load-bearing.
 *
 * Required, because a default would hand UNKNOWN ownership to any caller who
 * says nothing, and an unowned bill is the exact silent outcome this step
 * exists to prevent. Null is a legitimate answer with a precise meaning — this
 * device does not know whose row this is — and it is what an offline morning
 * before any sign-in genuinely produces.
 *
 * One nullable OBJECT rather than two nullable fields, so "tenant set, user
 * missing" is unrepresentable rather than merely discouraged. A half-owner
 * would pass a tenant check and fail a user check, which is the shape that
 * sends a bill under the wrong person inside the right shop.
 */
export function billInsertParams(bill: LocalBill, owner: LocalIdentity | null): SqlValue[] {
  return [
    bill.id,
    bill.idempotency_key,
    JSON.stringify(bill.payload),
    bill.sync_state,
    bill.attempt_count,
    bill.last_error,
    bill.created_at,
    bill.device_created_at,
    bill.next_attempt_at,
    bill.doc_no,
    bill.synced_at,
    bill.void_reason,
    bill.void_requested_at,
    bill.voided_at,
    bill.void_attempts,
    bill.void_last_error,
    bill.void_refused_at,
    bill.void_refused_code,
    bill.first_attempt_at,
    bill.first_server_error_at,
    bill.server_error_attempts,
    bill.master_data_missing_at,
    bill.master_data_code,
    bill.master_as_of,
    // Expanded from the pair at exactly ONE point in the codebase, which is why
    // the two columns can never disagree about whether an owner is known.
    owner === null ? null : owner.tenant_id,
    owner === null ? null : owner.user_id,
  ];
}

function toBill(row: BillRow): LocalBill {
  return {
    id: row.id,
    idempotency_key: row.idempotency_key,
    payload: JSON.parse(row.payload_json) as LocalBill["payload"],
    sync_state: row.sync_state as SyncState,
    attempt_count: row.attempt_count,
    last_error: row.last_error,
    created_at: row.created_at,
    // Backfilled rows can still be null if a legacy payload lacked the field;
    // fall back to created_at so ordering never sees a null and silently sorts
    // that bill to one end of the queue.
    device_created_at: row.device_created_at ?? row.created_at,
    next_attempt_at: row.next_attempt_at,
    doc_no: row.doc_no,
    synced_at: row.synced_at,
    void_reason: row.void_reason,
    void_requested_at: row.void_requested_at,
    voided_at: row.voided_at,
    void_attempts: row.void_attempts,
    void_last_error: row.void_last_error,
    void_refused_at: row.void_refused_at,
    void_refused_code: row.void_refused_code,
    first_attempt_at: row.first_attempt_at,
    first_server_error_at: row.first_server_error_at,
    server_error_attempts: row.server_error_attempts,
    master_data_missing_at: row.master_data_missing_at,
    master_data_code: row.master_data_code,
    master_as_of: row.master_as_of,
  };
}

export class SqliteLocalStore implements LocalStore {
  private constructor(
    private readonly db: SqlDriver,
    private readonly identity: SqliteIdentityStore,
  ) {}

  /**
   * WHO THIS DEVICE IS, READ FRESH FOR EVERY STATEMENT THAT FILTERS BY OWNER.
   *
   * Not cached on the instance, and the difference is the whole hazard. A value
   * captured at open() would be a second copy of something the identity store
   * already owns, and it goes stale at exactly the moment that matters: the
   * operator signs in as somebody else and the store keeps filtering for the
   * person who left, so the new person's bills park and the old person's send.
   * Nothing would make that update mandatory and no proof that never let it go
   * stale could catch it.
   *
   * The cost is one indexed single-row SELECT on a connection this call is
   * about to use anyway.
   */
  private currentOwner(): Promise<RowOwner | null> {
    return this.identity.load();
  }

  /** Opens (or reopens) the store and ensures the schema exists. */
  static async open(db: SqlDriver): Promise<SqliteLocalStore> {
    await initConnection(db);
    // The SAME driver, so the identity is read on the connection the filtered
    // statements run on — never a second connection that could see a different
    // committed state.
    return new SqliteLocalStore(db, new SqliteIdentityStore(db));
  }

  async close(): Promise<void> {
    await this.db.close();
  }

  async putBill(bill: LocalBill, owner: RowOwner | null): Promise<void> {
    // Plain INSERT, not INSERT OR REPLACE: a duplicate bill id is a bug that
    // must surface, never silently overwrite a bill that may already be synced.
    //
    // THE OWNER IS NOW A REQUIRED ARGUMENT rather than a null written here.
    // It had been null with a comment, on the measured ground that nothing in
    // production called this method; the signature was widened because "no
    // caller today" is a fact about today and the row it would write is
    // permanent. The cost was 3 call sites and a cascade of 23 through
    // createLocalBill, none of them production, none having to invent an
    // identity.
    //
    // WHAT PASSING null STILL MEANS, because it is a legitimate value and not a
    // placeholder: the bill is written with no owner, the design reads that as
    // UNKNOWN rather than as mine, and QUEUED therefore never selects it. It
    // stops being sent and waits for the sign-in of whoever owns it. If nobody
    // does, it waits for a person who does not exist, while the cash on it is
    // already out of the drawer — one handset, no server record, and nothing on
    // screen anyone can act on, because the release condition can never be met.
    // It fails where nothing catches it: an unowned bill is indistinguishable
    // from one weighed before anyone signed in, which this design deliberately
    // produces, so the parked count looks ordinary and no alarm has grounds to
    // fire.
    await this.db.run(BILL_INSERT_SQL, billInsertParams(bill, owner));
  }

  async getBill(id: string): Promise<LocalBill | null> {
    const rows = await this.db.all<BillRow>(
      `SELECT ${COLUMNS} FROM local_bills WHERE id = ?`,
      [id],
    );
    const row = rows[0];
    return row === undefined ? null : toBill(row);
  }

  async listByState(state: SyncState): Promise<LocalBill[]> {
    const rows = await this.db.all<BillRow>(
      `SELECT ${COLUMNS} FROM local_bills WHERE sync_state = ?
       ORDER BY created_at, id`,
      [state],
    );
    return rows.map(toBill);
  }

  /**
   * ORDER BY device_created_at: the bill weighed FIRST is sent first, so within
   * any backlog it receives the lower doc_no.
   *
   * Ordering by created_at (the row's own timestamp) looked equivalent — both
   * are written from the same clock in the same breath — but it is the wrong
   * field to name. The queue's contract is "weighing order", and
   * device_created_at is the field that means that; created_at only happens to
   * agree today. Ordering on the field that carries the meaning is what keeps
   * this correct if the two ever diverge.
   *
   * `id` remains the tiebreaker so the order is total, never arbitrary, when
   * two bills share a timestamp.
   *
   * ------------------------------------------------------------------------
   * NO PRODUCTION CALLER. Measured across the whole mobile tree in this commit:
   * every reference outside src/proof is either a COMMENT (engine.ts, schema.ts
   * twice, and this file's own header) or the LocalStore interface declaration
   * in sync/types.ts. The callers are proveSync, proveCart, sqliteProof and the
   * in-memory fake in src/proof/fakes.ts, and nothing else. The engine reads
   * listPendingOldestFirst and applies the due rule in TypeScript instead —
   * this file's header says so at the DUE_OR_UNBELIEVABLE constant.
   *
   * WHAT THAT MEANS FOR THE OWNER FILTER COMING NEXT. An owner clause added
   * here would be exercised by no code a handset runs. The proofs above would
   * go green over it, and that green would be about this statement only —
   * evidence for the semantics of a query the app never issues, and evidence
   * for nothing the operator's phone does. The statement the send loop actually
   * uses is listPendingOldestFirst; the filter has to be correct THERE, and a
   * suite passing here is not a substitute for measuring it there.
   * ------------------------------------------------------------------------
   */
  async listReadyToSend(now: Date, limit: number): Promise<LocalBill[]> {
    // Params follow the TEXTUAL order of the ? marks: QUEUED's owner pair sits
    // inside the WHERE, so it precedes DUE_OR_UNBELIEVABLE's pair, and LIMIT's
    // marker comes after the whole WHERE. Getting this order wrong compares a
    // uuid against a timestamp and silently selects nothing.
    const rows = await this.db.all<BillRow>(
      `SELECT ${COLUMNS} FROM local_bills
       WHERE ${QUEUED} AND ${DUE_OR_UNBELIEVABLE}
       ORDER BY device_created_at, created_at, id
       LIMIT ?`,
      [...ownerParams(await this.currentOwner()), ...dueParams(now), limit],
    );
    return rows.map(toBill);
  }

  /** Every pending bill in weighing order, INCLUDING ones still in backoff. */
  async listPendingOldestFirst(limit: number): Promise<LocalBill[]> {
    const rows = await this.db.all<BillRow>(
      `SELECT ${COLUMNS} FROM local_bills
       WHERE ${QUEUED}
       ORDER BY device_created_at, created_at, id
       LIMIT ?`,
      [...ownerParams(await this.currentOwner()), limit],
    );
    return rows.map(toBill);
  }

  /**
   * Drop the retry backoff on every pending bill.
   *
   * Called after a send SUCCEEDS. The backoff exists to stop us hammering a
   * server we cannot reach; the moment one bill gets through we have direct
   * evidence the server IS reachable, so every other bill's delay was computed
   * against a world that no longer exists.
   *
   * This is the other half of the ordering fix, and on real device evidence it
   * was the half that actually mattered: an older bill that had failed a few
   * times sat with next_attempt_at up to 30s out, so listReadyToSend could not
   * see it at all, while a bill weighed 73 seconds LATER was sent immediately
   * and took the lower number. Sorting cannot rescue a bill that is not in the
   * candidate set.
   */
  async clearBackoffForPending(now: Date): Promise<number> {
    const r = await this.db.run(
      // Parked bills are excluded: their next_attempt_at is a slow master-data
      // cadence, not a network backoff, and a reachable server says nothing about
      // whether the office has added the price yet.
      // The SET marker comes first, then QUEUED's owner pair inside the WHERE,
      // then the backoff comparison.
      `UPDATE local_bills SET next_attempt_at = ?
       WHERE ${QUEUED} AND next_attempt_at > ?`,
      [now.toISOString(), ...ownerParams(await this.currentOwner()), now.toISOString()],
    );
    return r.changes;
  }

  /**
   * The atomic claim. One conditional UPDATE; the winner sees changes === 1 and
   * every loser sees 0. There is no read-then-write window for a competing
   * claimer to slip into, in this process or any other.
   */
  async claimForSend(id: string, now: Date): Promise<boolean> {
    // QUEUED, not just 'pending': a bill parked on master data must not be
    // claimable, or a concurrent pass could send it while the UI shows it as
    // waiting on the office.
    const r = await this.db.run(
      `UPDATE local_bills SET sync_state = 'syncing', next_attempt_at = ?
       WHERE id = ? AND ${QUEUED}`,
      [now.toISOString(), id, ...ownerParams(await this.currentOwner())],
    );
    return r.changes === 1;
  }

  /* --------------------------------------------------- master-data park -- */

  /**
   * Park a bill the server refused for a RESOLVABLE reason.
   *
   * sync_state goes back to 'pending' — the bill is still owed and nothing may
   * drop it — but master_data_missing_at takes it out of the head-of-line queue.
   * The poison clocks are CLEARED: this is not a server fault and must never
   * raise the "call support" alarm. It is a "call the office" state.
   */
  async markMasterDataMissing(
    id: string,
    code: string,
    reason: string,
    attempt: number,
    retryAt: Date,
    now: Date,
  ): Promise<void> {
    await this.db.run(
      `UPDATE local_bills
       SET sync_state = 'pending', attempt_count = ?, last_error = ?,
           master_data_missing_at = ?, master_data_code = ?,
           next_attempt_at = ?,
           first_attempt_at = NULL, first_server_error_at = NULL,
           server_error_attempts = 0
       WHERE id = ?`,
      [attempt, reason, now.toISOString(), code, retryAt.toISOString(), id],
    );
  }

  /* -------------------------------------------------------- session end -- */

  /**
   * The send bounced on a 401. The session ended; the bill is untouched.
   *
   * sync_state goes back to 'pending' — still owed, still in the head-of-line
   * queue in weighing order, so nothing is reordered by an expiry — and the two
   * POISON columns are CLEARED. That is the whole point of this being its own
   * statement: while a 401 was classified `unavailable, reachable: true`, every
   * bounce stamped first_server_error_at and incremented server_error_attempts,
   * so an expired session with bills behind it reached POISON_ALARM_ATTEMPTS and
   * raised the red "ติดต่อฝ่ายสนับสนุน" alarm. There is nothing for support to do.
   *
   * first_attempt_at is still stamped with COALESCE: the bill genuinely has been
   * unable to send since then, which is what that clock measures. Only the
   * poison judgement is off the table.
   */
  async markSessionExpired(
    id: string,
    reason: string,
    attempt: number,
    retryAt: Date,
    now: Date,
  ): Promise<void> {
    await this.db.run(
      `UPDATE local_bills
       SET sync_state = 'pending', attempt_count = ?, last_error = ?,
           next_attempt_at = ?,
           first_attempt_at = COALESCE(first_attempt_at, ?),
           first_server_error_at = NULL, server_error_attempts = 0
       WHERE id = ?`,
      [attempt, reason, retryAt.toISOString(), now.toISOString(), id],
    );
  }

  /* --------------------------------------------------------- forbidden -- */

  /**
   * The send bounced on a 403: this ACCOUNT may not submit bills.
   *
   * The row ends up shaped like markSessionExpired's — pending, poison columns
   * cleared, because a 403 refuses EVERY bill from this account equally and so
   * carries none of the meaning first_server_error_at exists to carry (the same
   * argument as the 401 lesson's rule 3, one status along).
   *
   * WHAT IS DIFFERENT: next_attempt_at = now, no backoff. There is no schedule to
   * write. Nothing this device does at any hour makes a staff account an admin,
   * so a delay would be a number that pretends the row is waiting for time. The
   * retry is stopped by the engine instead, which is where a device-global fact
   * belongs.
   */
  async markSendForbidden(
    id: string,
    reason: string,
    attempt: number,
    now: Date,
  ): Promise<void> {
    const nowIso = now.toISOString();
    await this.db.run(
      `UPDATE local_bills
       SET sync_state = 'pending', attempt_count = ?, last_error = ?,
           next_attempt_at = ?,
           first_attempt_at = COALESCE(first_attempt_at, ?),
           first_server_error_at = NULL, server_error_attempts = 0
       WHERE id = ?`,
      [attempt, reason, nowIso, nowIso, id],
    );
  }

  /**
   * The parked bills themselves, oldest weighed first.
   *
   * NO PRODUCTION CALLER. Measured across the whole mobile tree in this commit:
   * the only references outside src/proof is the LocalStore interface
   * declaration in sync/types.ts — there is not even a comment elsewhere. Its
   * callers are proveSync and the in-memory fake in src/proof/fakes.ts, and
   * nothing else.
   *
   * The app reaches parked bills by two OTHER routes, which is why nothing has
   * missed this one: pendingQueueSnapshot returns masterDataBlockedCount from
   * its own COUNT (a separate statement with the same predicate), and App.tsx
   * lists bills through listByState and classifies them in TypeScript.
   *
   * WHAT THAT MEANS FOR THE OWNER FILTER COMING NEXT. Parking is the mechanism
   * a row belonging to someone else will be lifted out of the queue with, so
   * this method reads like the natural place to prove that behaviour — and it
   * is not one. An owner clause added here would be exercised by no code a
   * handset runs, and a proof driving it would establish the semantics of a
   * query the app never issues. The counts the operator actually sees come from
   * pendingQueueSnapshot and from listByState; those are where a parked-owner
   * count has to be correct, and where it has to be measured.
   */
  async listMasterDataBlocked(limit: number): Promise<LocalBill[]> {
    const rows = await this.db.all<BillRow>(
      `SELECT ${COLUMNS} FROM local_bills
       WHERE master_data_missing_at IS NOT NULL AND sync_state = 'pending'
       ORDER BY device_created_at, created_at, id
       LIMIT ?`,
      [limit],
    );
    return rows.map(toBill);
  }

  /**
   * Un-park. `all` is the operator pressing retry — try everything right now,
   * because they have just added the price and want to see it clear. Otherwise
   * only bills whose slow cadence is due.
   *
   * next_attempt_at is reset to now so a released bill is immediately eligible;
   * it rejoins the queue at its WEIGHING position, so if it is the oldest it goes
   * straight back to the head. If the price is still missing it simply parks
   * again on that attempt, without having blocked anything.
   *
   * last_error IS CLEARED HERE, and leaving it out was a real defect found on
   * device (Phase 2c-6). This statement retires the parked state, so the failure
   * text that state produced — `HTTP 424: {...json...}` — stops describing the
   * bill the instant it runs. Keeping it made this a HALF-UPDATE: for the length
   * of the retry the row said "not parked" and "here is why it was parked" at the
   * same time, and the UI, seeing no parked flag, fell back to rendering that raw
   * diagnostic in red. Compare markSynced below, which has always cleared
   * last_error alongside the columns that justified it. The rule is that no
   * transition may leave behind an error describing a state it just left.
   */
  async releaseMasterDataBlocked(now: Date, all: boolean): Promise<number> {
    const nowIso = now.toISOString();
    // Same clock rule as the send queue. The park cadence is the OTHER writer of
    // a future next_attempt_at (masterDataRetryMs), so a backwards clock jump
    // would otherwise defer a parked bill's automatic retry by the whole skew.
    // Bounded harm — parked bills block nothing and the operator's ส่งอีกครั้ง
    // passes all=true, which ignores the cadence entirely — but it is the same
    // defect, and fixing the instance instead of the class is what produced the
    // 2c-7 amendment.
    const due = all ? "" : ` AND ${DUE_OR_UNBELIEVABLE}`;
    const params: SqlValue[] = all ? [nowIso] : [nowIso, ...dueParams(now)];
    const r = await this.db.run(
      `UPDATE local_bills
       SET master_data_missing_at = NULL, master_data_code = NULL,
           last_error = NULL,
           next_attempt_at = ?
       WHERE master_data_missing_at IS NOT NULL AND sync_state = 'pending'${due}`,
      params,
    );
    return r.changes;
  }

  async markSynced(
    id: string,
    docNo: string | null,
    attempt: number,
    now: Date,
  ): Promise<void> {
    await this.db.run(
      `UPDATE local_bills
       SET sync_state = 'synced', doc_no = ?, attempt_count = ?,
           last_error = NULL, synced_at = ?,
           first_attempt_at = NULL, first_server_error_at = NULL,
           server_error_attempts = 0,
           master_data_missing_at = NULL, master_data_code = NULL
       WHERE id = ?`,
      [docNo, attempt, now.toISOString(), id],
    );
  }

  async markFailed(id: string, reason: string, attempt: number, now: Date): Promise<void> {
    await this.db.run(
      `UPDATE local_bills
       SET sync_state = 'failed', attempt_count = ?, last_error = ?,
           next_attempt_at = ?
       WHERE id = ?`,
      [attempt, reason, now.toISOString(), id],
    );
  }

  async markPendingAgain(
    id: string,
    reason: string,
    attempt: number,
    nextAttemptAt: Date,
    now: Date,
    reachable: boolean,
  ): Promise<void> {
    // first_attempt_at is stamped with COALESCE, so it records the FIRST bounce
    // of any kind and never moves — the total-stuck clock.
    //
    // first_server_error_at is the POISON clock and it is conditional: when the
    // server answered (reachable), COALESCE stamps it once and lets it run; when
    // the bounce was transport-level (offline), it is RESET to null. So it is
    // non-null exactly while the reachable server has been refusing this bill
    // continuously — an offline spell in the middle wipes it and the poison timer
    // starts fresh only if the server refuses again. That is what stops a long
    // outage (all transport-level) from ever tripping the red alarm.
    //
    // server_error_attempts moves on the SAME condition and for the same reason:
    // +1 while the server is answering-and-failing, reset to 0 the moment a
    // bounce is transport-level. It is the count-based trigger for the same red
    // alarm, so a server that refuses this bill quickly surfaces after N
    // refusals instead of waiting out the wall clock. Keeping both on one CASE
    // means they can never disagree about whether the server answered.
    const nowIso = now.toISOString();
    const reachableFlag = reachable ? 1 : 0;
    await this.db.run(
      `UPDATE local_bills
       SET sync_state = 'pending', attempt_count = ?, last_error = ?,
           next_attempt_at = ?,
           first_attempt_at = COALESCE(first_attempt_at, ?),
           first_server_error_at =
             CASE WHEN ? = 1 THEN COALESCE(first_server_error_at, ?) ELSE NULL END,
           server_error_attempts =
             CASE WHEN ? = 1 THEN server_error_attempts + 1 ELSE 0 END
       WHERE id = ?`,
      [
        attempt,
        reason,
        nextAttemptAt.toISOString(),
        nowIso,
        reachableFlag,
        nowIso,
        reachableFlag,
        id,
      ],
    );
  }

  /**
   * Two reads, no write: how many bills are pending and which one is the head.
   *
   * The head is chosen by the SAME order the engine sends in
   * (device_created_at, created_at, id), so the bill reported as the blocker is
   * exactly the bill the engine is stuck on — the UI cannot point at a different
   * row than the one actually holding up the queue.
   */
  async pendingQueueSnapshot(): Promise<QueueSnapshot> {
    // Read ONCE and used by both QUEUED statements below, so the count and the
    // head can never describe two different people's queues.
    const owner = ownerParams(await this.currentOwner());
    const counts = await this.db.all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM local_bills WHERE ${QUEUED}`,
      owner,
    );
    const pendingCount = counts[0]?.n ?? 0;
    // Parked bills are counted separately and NEVER as "behind": they are not
    // waiting their turn in a queue, they are waiting on the office, and folding
    // them into the queue depth would report a backlog no network can drain.
    const blocked = await this.db.all<{ n: number }>(
      "SELECT COUNT(*) AS n FROM local_bills" +
        " WHERE master_data_missing_at IS NOT NULL AND sync_state = 'pending'",
    );
    const rows = await this.db.all<BillRow>(
      `SELECT ${COLUMNS} FROM local_bills
       WHERE ${QUEUED}
       ORDER BY device_created_at, created_at, id
       LIMIT 1`,
      owner,
    );
    const head = rows[0];
    return {
      pendingCount,
      masterDataBlockedCount: blocked[0]?.n ?? 0,
      head:
        head === undefined
          ? null
          : {
              id: head.id,
              doc_no: head.doc_no,
              attempts: head.attempt_count,
              first_attempt_at: head.first_attempt_at,
              first_server_error_at: head.first_server_error_at,
              server_error_attempts: head.server_error_attempts,
              last_error: head.last_error,
            },
    };
  }

  /**
   * Startup sweep. RETURNING makes it one statement, so the set of recovered
   * ids is exactly the set that changed — no second SELECT that another writer
   * could invalidate in between.
   */
  /* ---------------------------------------------------------------- void -- */

  /**
   * Records the owner's intent, once.
   *
   * `WHERE void_requested_at IS NULL` is what makes a second press harmless:
   * the row changes zero times and the ORIGINAL reason survives. Without it a
   * double-tap would quietly rewrite the reason on a real-money reversal, and
   * the second reason might be blank-ish, hurried, or simply not what the owner
   * meant the first time.
   */
  async requestVoid(id: string, reason: string, now: Date): Promise<boolean> {
    const r = await this.db.run(
      `UPDATE local_bills SET void_reason = ?, void_requested_at = ?
       WHERE id = ? AND void_requested_at IS NULL`,
      [reason, now.toISOString(), id],
    );
    return r.changes === 1;
  }

  /**
   * Voids still owed to the server.
   *
   * `sync_state = 'synced'` is the sequencing rule in one clause: a bill the
   * server has never seen is NOT eligible, so it syncs through the normal path
   * first and acquires its doc_no. The void then applies to a bill that exists,
   * which is what lets the owner see it was created and then cancelled instead
   * of it silently never existing.
   *
   * ------------------------------------------------------------------------
   * THIS PREDICATE HAS NO OWNER FILTER AS OF THIS COMMIT, AND THAT IS THE NEXT
   * STEP, NOT AN OVERSIGHT. It draws on neither shared constant — not QUEUED,
   * not DUE_OR_UNBELIEVABLE — so the send queue's owner clause does not reach
   * it by any route. A void for another person's bill still leaves this device.
   *
   * WHY THAT STEP WAITED FOR THIS ONE. The observable for an owner filter is an
   * attempt count: zero attempts for another owner's void, a non-zero count for
   * your own. On a line that re-POSTs the same request every four seconds for
   * ever, that measurement cannot be made — a count that rises without bound
   * cannot distinguish "the filter prevented a send" from "the filter delayed
   * one", and a count that is still climbing when the proof ends says nothing
   * either way. Making a permanently refused void STOP is what turns this path
   * into something a filter can be measured on at all.
   * ------------------------------------------------------------------------
   */
  async listVoidsToApply(limit: number): Promise<LocalBill[]> {
    const rows = await this.db.all<BillRow>(
      // void_refused_at IS NULL: a void the server refused on identity grounds is
      // NOT owed work. Without this clause it stays here and is re-POSTed on every
      // pass — and unlike the send queue there is no backoff column on this path
      // at all, so "retry" means every 4 seconds, forever, against a role no
      // device action can change.
      `SELECT ${COLUMNS} FROM local_bills
       WHERE void_requested_at IS NOT NULL AND voided_at IS NULL
         AND void_refused_at IS NULL
         AND sync_state = 'synced' AND doc_no IS NOT NULL
       ORDER BY void_requested_at, id
       LIMIT ?`,
      [limit],
    );
    return rows.map(toBill);
  }

  async markVoidApplied(id: string, attempt: number, now: Date): Promise<void> {
    await this.db.run(
      // The refusal columns are cleared alongside: this transition retires the
      // refused state, so nothing may be left behind describing it. Reachable
      // whenever an admin signs in on a phone holding a refused void — the
      // refusal is retracted, the void applies, and a stale void_refused_code
      // would keep the card saying it did not. Same rule as
      // releaseMasterDataBlocked clearing last_error.
      `UPDATE local_bills
       SET voided_at = ?, void_attempts = ?, void_last_error = NULL,
           void_refused_at = NULL, void_refused_code = NULL
       WHERE id = ?`,
      [now.toISOString(), attempt, id],
    );
  }

  /**
   * The server refused the void because of WHO ASKED.
   *
   * void_requested_at and void_reason are untouched — the owner asked, and that
   * they asked is a fact that outlives any refusal. What changes is that the void
   * stops being owed: it leaves listVoidsToApply, so nothing retries, and the
   * card reads the refusal instead of promising an automatic cancel it will never
   * perform.
   */
  async markVoidRefused(
    id: string,
    code: string,
    reason: string,
    attempt: number,
    now: Date,
  ): Promise<void> {
    await this.db.run(
      `UPDATE local_bills
       SET void_refused_at = ?, void_refused_code = ?,
           void_attempts = ?, void_last_error = ?
       WHERE id = ?`,
      [now.toISOString(), code, attempt, reason, id],
    );
  }

  /**
   * Someone signed in. Retract every void refusal so those voids are owed again.
   *
   * void_last_error is cleared with them, for the reason
   * releaseMasterDataBlocked's comment gives: this statement retires the refused
   * state, so the text that state produced must not outlive it.
   */
  async clearVoidRefusals(_now: Date): Promise<number> {
    const r = await this.db.run(
      /*
       * A REJECTED VOID IS EXCLUDED, AND THIS IS THE HALF OF THE FIX THAT IS
       * EASY TO LEAVE OUT.
       *
       * A 403 is retracted here because a sign-in can change WHO IS ASKING, and
       * the next attempt may therefore get a different answer. A 404, 400 or 422
       * was the server refusing WHAT WAS ASKED: signing in as anybody at all
       * cannot make a missing bill exist or an invalid payload valid, and the
       * body is identical on every attempt (see the engine's `rejected` case).
       *
       * Without this clause the whole fix would degrade rather than fail —
       * stopped every four seconds, restarted at every sign-in, which is still
       * for ever and is harder to notice than the original because it only
       * misbehaves after somebody signs in.
       */
      `UPDATE local_bills
       SET void_refused_at = NULL, void_refused_code = NULL, void_last_error = NULL
       WHERE void_refused_at IS NOT NULL
         AND (void_refused_code IS NULL OR void_refused_code <> ?)`,
      [VOID_REJECTED_CODE],
    );
    return r.changes;
  }

  /**
   * A failed attempt. Note what is NOT written: void_requested_at is untouched,
   * so the void stays owed no matter how many attempts fail. There is no
   * attempt cap and no terminal "void failed" state that would drop it —
   * the same reasoning as an offline bill never being marked failed.
   */
  async markVoidAttemptFailed(id: string, reason: string, attempt: number): Promise<void> {
    await this.db.run(
      `UPDATE local_bills SET void_attempts = ?, void_last_error = ? WHERE id = ?`,
      [attempt, reason, id],
    );
  }

  async resetSyncingToPending(now: Date): Promise<string[]> {
    const rows = await this.db.all<{ id: string }>(
      `UPDATE local_bills
       SET sync_state = 'pending', last_error = 'recovered from interrupted send',
           next_attempt_at = ?
       WHERE sync_state = 'syncing'
       RETURNING id`,
      [now.toISOString()],
    );
    return rows.map((r) => r.id).sort();
  }
}
