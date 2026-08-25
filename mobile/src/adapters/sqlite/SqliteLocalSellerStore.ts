/**
 * The `LocalSellerStore` over SQLite — `local_sellers` and
 * `local_seller_codes`.
 *
 * ONE STATEMENT PER METHOD, with exactly one deliberate exception, which is the
 * same discipline `SqliteLocalStore` opens with and the same exception it names:
 * SQLite wraps every statement in an implicit transaction, so a single
 * conditional UPDATE is already atomic and the claim cannot half-happen. The
 * exception is `createLocalSeller`, which genuinely must bind a code and insert
 * a row indivisibly — see its own doc.
 *
 * ---------------------------------------------------------------------------
 * TWO TABLES, TWO OPPOSITE ANSWERS TO "DOES THIS CARRY AN OWNER PREDICATE"
 * ---------------------------------------------------------------------------
 * READ BOTH BEFORE EDITING EITHER, because a sweep that adds a missing owner
 * predicate to every statement in this file would be RIGHT about one table and
 * WRONG about the other — and the repository has run exactly that sweep before,
 * at the sites the send queue and the void list were hand-repaired at.
 *
 *   `local_sellers` CARRIES ONE. A seller may be created on the server only
 *   under the identity that created it locally, for the reason the send queue
 *   already gives: within one shop, sending under the wrong person SUCCEEDS and
 *   records the wrong creator, which nothing downstream can detect or correct.
 *
 *   `local_seller_codes` CARRIES NONE, AND MUST NOT. The holder is a DEVICE,
 *   not a user (src/session/deviceIdentity.ts). The codes live in this file,
 *   they must survive a sign-out, and an owner predicate would hide the
 *   device's own holding from the next person to sign in — losing it for ever,
 *   because nothing re-issues a reservation.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS NOT HERE
 * ---------------------------------------------------------------------------
 * Nothing touches `cached_sellers`, and nothing touches `saveSellers`'s
 * unconditional DELETE. The design's answer to the survey's first two bullets
 * is that an unsettled local seller never enters that table at all, so there is
 * no origin marker to carry and no refresh to weaken. `schema.ts` carries the
 * argument at `local_sellers`, including the third rewrite shape — delete and
 * re-insert — that no `DO UPDATE` list covers.
 */
import type {
  CreateLocalSellerResult,
  IssuedCode,
  LocalSeller,
  LocalSellerDraft,
  LocalSellerStore,
  ReservedCode,
  SellerSyncState,
} from "../../sync/localSeller.js";
import type { RowOwner } from "../../sync/types.js";
import { SEND_SCHEDULE_HORIZON_MS } from "../../time/clockSanity.js";
import type { SqlDriver, SqlTx, SqlValue } from "./driver.js";
import { OWNED_BY_CURRENT, ownerParams } from "./SqliteLocalStore.js";
import { SqliteIdentityStore } from "./SqliteIdentityStore.js";

interface SellerRow {
  id: string;
  code: string;
  reservation_token: string;
  name: string;
  phone: string | null;
  grade: string | null;
  id_number: string | null;
  address: string | null;
  vehicle_no: string | null;
  sync_state: string;
  attempt_count: number;
  last_error: string | null;
  created_at: string;
  next_attempt_at: string;
  server_seller_id: string | null;
  settled_at: string | null;
  needs_review_at: string | null;
  needs_review_code: string | null;
  owner_tenant_id: string | null;
  owner_user_id: string | null;
}

const SELLER_COLUMNS =
  "id, code, reservation_token, name, phone, grade, id_number, address," +
  " vehicle_no, sync_state, attempt_count, last_error, created_at," +
  " next_attempt_at, server_seller_id, settled_at, needs_review_at," +
  " needs_review_code, owner_tenant_id, owner_user_id";

/**
 * WHAT "OWED AND ACTIONABLE" MEANS, in ONE place, spliced by every statement
 * that defines the kind's queue — the same reasoning as `QUEUED` on the bill
 * store: ownership is part of the DEFINITION rather than a check somebody
 * remembers at each site, and it fails LOUD, because a statement that splices
 * this and forgets the two bound values gets a parameter-count error from the
 * driver rather than a silently wrong row set.
 *
 * `needs_review_at IS NULL` is here for the reason the bill queue excludes a
 * parked bill: a 409 is a question the server has already answered, and
 * re-asking it every pass is what that column exists to stop. The row is still
 * OWED — `countSellersOwed` sees it — it is simply not actionable.
 *
 * NULL NEEDS NO SPECIAL CASE. Three-valued logic does the whole job: a NULL
 * owner column compared to anything yields NULL, NULL is not TRUE, and the row
 * is excluded. One clause covers mine (selected), somebody else's (excluded),
 * UNOWNED (excluded), and no identity stored at all, where the bound values are
 * NULL and nothing is selected. That last case fails CLOSED, deliberately.
 */
const SELLER_ACTIONABLE =
  `sync_state = 'pending' AND needs_review_at IS NULL AND ${OWNED_BY_CURRENT}`;

/**
 * "The scheduled time has come, OR the schedule is not believable."
 *
 * TRANSCRIBED FROM `DUE_OR_UNBELIEVABLE` in SqliteLocalStore, not invented, and
 * it must stay the same rule for the same reason: a `next_attempt_at` further
 * out than any delay this app can write is a reading from a clock that has
 * since moved backwards, not a schedule. Fails OPEN — an early attempt is
 * harmless here because the reservation token is unchanged, so the server
 * recognises the repeat rather than creating a second person.
 *
 * NOT IMPORTED FROM THAT FILE because it is not exported there, and exporting
 * it would be a change to the bill store inside a commit whose whole claim is
 * that nothing existing changed. The duplication is named rather than hidden,
 * and both sites are two lines of arithmetic over the same constant — which is
 * the case a-checker-must-not-share-the-code-it-checks permits duplicating.
 */
const SELLER_DUE = "(next_attempt_at <= ? OR next_attempt_at > ?)";

/**
 * now, and the furthest out a real schedule could reach, as bound params.
 * `SEND_SCHEDULE_HORIZON_MS` is IMPORTED rather than restated so the SQL half
 * of the rule and the TypeScript half cannot drift apart.
 */
function dueParams(now: Date): [string, string] {
  return [now.toISOString(), new Date(now.getTime() + SEND_SCHEDULE_HORIZON_MS).toISOString()];
}

/**
 * A row as the database returned it, as the domain type.
 *
 * `sync_state` is narrowed by a CHECK the table declares, so the cast states a
 * fact the schema enforces rather than a hope. It is written as a cast and not
 * as a runtime parse for the reason `SqliteLocalStore` reads its own rows the
 * same way: the constraint is the check, and a second one here would be a
 * second opinion about what the table already refuses.
 */
function toSeller(row: SellerRow): LocalSeller {
  return {
    id: row.id,
    code: row.code,
    reservation_token: row.reservation_token,
    name: row.name,
    phone: row.phone,
    grade: row.grade,
    id_number: row.id_number,
    address: row.address,
    vehicle_no: row.vehicle_no,
    sync_state: row.sync_state as SellerSyncState,
    attempt_count: row.attempt_count,
    last_error: row.last_error,
    created_at: row.created_at,
    next_attempt_at: row.next_attempt_at,
    server_seller_id: row.server_seller_id,
    settled_at: row.settled_at,
    needs_review_at: row.needs_review_at,
    needs_review_code: row.needs_review_code,
    owner_tenant_id: row.owner_tenant_id,
    owner_user_id: row.owner_user_id,
  };
}

export class SqliteLocalSellerStore implements LocalSellerStore {
  private constructor(
    private readonly db: SqlDriver,
    private readonly identity: SqliteIdentityStore,
  ) {}

  /**
   * Opens the store over an ALREADY-INITIALISED connection.
   *
   * DELIBERATELY NOT `initConnection` A SECOND TIME. `SqliteLocalStore.open`
   * runs it, and it is idempotent, so a second run would be harmless — and it
   * would also make this class look like it owns a schema it does not. The
   * tables it reads are created by the same `SCHEMA_STATEMENTS` the bill store
   * brings up, on the same connection, because both stores share one file.
   *
   * The identity is read on the SAME driver, so the filtered statements below
   * can never see a different committed state than the identity they filter by.
   */
  static open(db: SqlDriver): SqliteLocalSellerStore {
    return new SqliteLocalSellerStore(db, new SqliteIdentityStore(db));
  }

  /**
   * WHO THIS DEVICE IS SIGNED IN AS, READ FRESH FOR EVERY FILTERED STATEMENT.
   *
   * Not cached, for the reason `SqliteLocalStore.currentOwner` gives: a value
   * captured at open() goes stale at exactly the moment that matters — the
   * operator signs in as somebody else, and the store keeps filtering for the
   * person who left.
   */
  private currentOwner(): Promise<RowOwner | null> {
    return this.identity.load();
  }

  /* --------------------------------------------------------- the codes -- */

  /**
   * ON CONFLICT DO NOTHING, WITH NO SET-LIST AT ALL, and that is the whole
   * content of this method.
   *
   * THE CLASSIFICATION, OUT LOUD, because this is the one place in the commit
   * where a `DO UPDATE` list could have been written:
   *
   *   `token` is ORIGIN — the server minted it WITH the code, and it never
   *   changes. A token that moved would be a create the server could no longer
   *   recognise as a replay, which is a second person for one seller.
   *
   *   `received_at` is ORIGIN — when THIS device first got the code.
   *
   *   `spent_on` is CONTENT, and it is LOCAL. The server knows nothing about
   *   it. The refill answers with the device's WHOLE holding on every call, so
   *   a set-list here would unbind a code this device has already attached to a
   *   local seller — and the next create would pick it again. Two sellers, one
   *   code, no error anywhere.
   *
   * So every column is either origin or local content the server cannot speak
   * about, and NONE of them may be rewritten from a refill's answer. `DO
   * NOTHING` is not laziness about the merge; it is the merge.
   *
   * A LOOP OF SINGLE INSERTS rather than one multi-row statement, matching
   * `saveSellers` and `saveProducts` next door: the driver's `run` takes a flat
   * parameter list, and a generated N-row VALUES clause is a placeholder count
   * that can disagree with its arguments.
   */
  async saveReservations(codes: readonly IssuedCode[], now: Date): Promise<number> {
    const stamp = now.toISOString();
    let added = 0;
    await this.db.transaction(async (tx) => {
      for (const c of codes) {
        const r = await tx.run(
          `INSERT INTO local_seller_codes (code, token, received_at, spent_on)
           VALUES (?, ?, ?, NULL)
           ON CONFLICT(code) DO NOTHING`,
          [c.code, c.token, stamp],
        );
        added += r.changes;
      }
    });
    return added;
  }

  async listReservations(): Promise<ReservedCode[]> {
    return this.db.all<ReservedCode>(
      "SELECT code, token, received_at, spent_on FROM local_seller_codes ORDER BY code",
    );
  }

  /**
   * The count the reserve level is derived from — and it is derived from the
   * HOLDING, never from the last refill's outcome. A device that has just been
   * refused by the network still holds every code it held a second ago, and a
   * level computed from the refusal would report `exhausted` over a full
   * SQLite table.
   */
  async spendableCount(): Promise<number> {
    const rows = await this.db.all<{ n: number }>(
      "SELECT COUNT(*) AS n FROM local_seller_codes WHERE spent_on IS NULL",
    );
    return rows[0]?.n ?? 0;
  }

  /* ------------------------------------------------------- the sellers -- */

  /**
   * THE ONE MULTI-STATEMENT METHOD IN THIS FILE, and the exception is real
   * rather than convenient.
   *
   * Picking a spendable code and inserting the row that spends it are two
   * writes that must not be separable. A crash between them leaves either a
   * code bound to a seller row that does not exist, or a seller row holding a
   * code the next create can still pick — and the second is two people on one
   * code, which is the defect this whole step exists to remove.
   *
   * THE PICK IS `LIMIT 1` OVER THE FREE CODES IN CODE ORDER, so a shop's paper
   * sequence is consumed in the order it was issued. Nothing depends on that
   * order for correctness; it is chosen so the gaps a lost handset leaves are
   * contiguous rather than scattered.
   *
   * NO CODE IS A REFUSAL AND NEVER AN INVENTED ONE. A device with an empty
   * holding cannot create a walk-in offline, full stop — minting a code here
   * would recreate the exact defect the reservation relation was introduced to
   * remove.
   *
   * THE OWNER PAIR IS WRITTEN AND NEVER REWRITTEN. It is ORIGIN: it records who
   * created this seller, and no later edit makes that untrue. There is no
   * statement in this class that touches those two columns after this INSERT.
   */
  async createLocalSeller(
    draft: LocalSellerDraft,
    owner: RowOwner | null,
    id: string,
    now: Date,
  ): Promise<CreateLocalSellerResult> {
    const stamp = now.toISOString();
    return this.db.transaction(async (tx: SqlTx): Promise<CreateLocalSellerResult> => {
      const free = await tx.all<{ code: string; token: string }>(
        "SELECT code, token FROM local_seller_codes" +
          " WHERE spent_on IS NULL ORDER BY code LIMIT 1",
      );
      const picked = free[0];
      if (picked === undefined) return { kind: "refused", refusal: { kind: "no_code" } };

      const params: SqlValue[] = [
        id,
        picked.code,
        picked.token,
        draft.name,
        draft.phone,
        draft.grade,
        draft.id_number,
        draft.address,
        draft.vehicle_no,
        "pending",
        0,
        null,
        stamp,
        stamp,
        null,
        null,
        null,
        null,
        // Expanded from the pair at ONE point, so the two columns can never
        // disagree about whether an owner is known.
        ...ownerParams(owner),
      ];
      await tx.run(
        `INSERT INTO local_sellers (${SELLER_COLUMNS}) VALUES (` +
          "?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params,
      );
      // The bind, in the same transaction. A code with `spent_on` set is out of
      // every later pick by the one predicate the whole file uses.
      await tx.run("UPDATE local_seller_codes SET spent_on = ? WHERE code = ?", [
        id,
        picked.code,
      ]);

      const rows = await tx.all<SellerRow>(
        `SELECT ${SELLER_COLUMNS} FROM local_sellers WHERE id = ?`,
        [id],
      );
      const row = rows[0];
      if (row === undefined) {
        // UNREACHABLE: the INSERT above is in this transaction and reported no
        // error. Refused rather than reconstructed from the arguments, because
        // a row built in memory would be a claim about the database that the
        // database has not made.
        throw new Error(`local_sellers ${id}: absent immediately after its own INSERT`);
      }
      return { kind: "created", seller: toSeller(row) };
    });
  }

  async getLocalSeller(id: string): Promise<LocalSeller | null> {
    const rows = await this.db.all<SellerRow>(
      `SELECT ${SELLER_COLUMNS} FROM local_sellers WHERE id = ?`,
      [id],
    );
    const row = rows[0];
    return row === undefined ? null : toSeller(row);
  }

  /**
   * The kind's `owed()` — actionable NOW, in creation order, mine.
   *
   * ORDER LIVES IN THE QUERY, not in the drain: a sort cannot order a row the
   * query did not return. Creation order rather than weighing order because a
   * seller has no `doc_no` and no arrival-ordered number of any kind — the
   * ordering here is a tie-break for readability, not a legal property, which
   * is exactly why this kind's `blocking` is `independent`.
   */
  async listSellersToCreate(now: Date, limit: number): Promise<LocalSeller[]> {
    const rows = await this.db.all<SellerRow>(
      `SELECT ${SELLER_COLUMNS} FROM local_sellers
       WHERE ${SELLER_ACTIONABLE} AND ${SELLER_DUE}
       ORDER BY created_at, id
       LIMIT ?`,
      [...ownerParams(await this.currentOwner()), ...dueParams(now), limit],
    );
    return rows.map(toSeller);
  }

  /**
   * WIDER THAN `listSellersToCreate` BY THREE WHOLE CLASSES OF ROW: a claimed
   * (syncing) row, a row held for review, and a row whose backoff has not
   * elapsed are all still OWED. A kind whose two methods share a predicate is a
   * screen that goes quiet exactly while work is happening.
   *
   * STILL OWNER-FILTERED, because the number answers "what do *I* still owe" —
   * the question a sign-out gate asks. A row belonging to somebody else is owed
   * by them, and counting it here would refuse a sign-out over work the person
   * standing there cannot drain.
   */
  async countSellersOwed(): Promise<number> {
    const rows = await this.db.all<{ n: number }>(
      `SELECT COUNT(*) AS n FROM local_sellers
       WHERE sync_state IN ('pending', 'syncing') AND ${OWNED_BY_CURRENT}`,
      ownerParams(await this.currentOwner()),
    );
    return rows[0]?.n ?? 0;
  }

  /**
   * The atomic claim. One conditional UPDATE; the winner sees changes === 1 and
   * every loser sees 0. There is no read-then-write window for a competing
   * claimer to slip into, in this process or any other.
   *
   * SPLICES `SELLER_ACTIONABLE`, not just the state: a row held for review must
   * not be claimable, or a concurrent pass could re-ask a question the server
   * has already refused.
   */
  async claimSellerCreate(id: string, now: Date): Promise<boolean> {
    const r = await this.db.run(
      `UPDATE local_sellers SET sync_state = 'syncing', next_attempt_at = ?
       WHERE id = ? AND ${SELLER_ACTIONABLE}`,
      [now.toISOString(), id, ...ownerParams(await this.currentOwner())],
    );
    return r.changes === 1;
  }

  /**
   * SETTLED. The server's id is written onto the local row, which is ORIGIN in
   * the strongest sense — which server row this local row BECAME — and there is
   * no statement anywhere that moves it afterwards.
   *
   * `last_error` is cleared: the row succeeded, and a stale error beside a
   * settled row is a screen saying two things at once. The attempt count is
   * KEPT, because how many tries it took is a fact about what happened.
   */
  async markSellerCreated(
    id: string,
    serverSellerId: string,
    attempt: number,
    now: Date,
  ): Promise<void> {
    await this.db.run(
      `UPDATE local_sellers
       SET sync_state = 'synced', server_seller_id = ?, settled_at = ?,
           attempt_count = ?, last_error = NULL
       WHERE id = ?`,
      [serverSellerId, now.toISOString(), attempt, id],
    );
  }

  /**
   * TERMINAL, and it RETURNS THE CODE to the spendable holding.
   *
   * WHY THE RETURN IS SAFE, as a property rather than a reassurance. A refusal
   * the device READ is definitive and on the payload's own merits, so no
   * `sellers` row carries that code; the server moves a reservation to `spent`
   * only inside the seller INSERT, and an INSERT that never happened spent
   * nothing. So the reservation is still `held`, still this device's, and the
   * two server-side guards mean nothing else can take it — a supplied reserved
   * code is refused, and a minted one is derived above the whole relation.
   *
   * A LOST REFUSAL IS NOT A REFUSAL. An unknown outcome is UNAVAILABLE and goes
   * to `markSellerCreateAttemptFailed` instead: the row stays owed, is retried
   * with the SAME code and the SAME token, and NOTHING is returned to the pool.
   * Only a refusal the device actually read may reach this method.
   *
   * TWO STATEMENTS, IN A TRANSACTION, for the reason `createLocalSeller` gives:
   * a code freed without the row going terminal is a code two creates can hold.
   */
  async markSellerCreateRefused(
    id: string,
    reason: string,
    attempt: number,
    now: Date,
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.run(
        `UPDATE local_sellers
         SET sync_state = 'failed', last_error = ?, attempt_count = ?, settled_at = ?
         WHERE id = ?`,
        [reason, attempt, now.toISOString(), id],
      );
      // Back into the spendable holding. The design: "THE CODE GOES BACK INTO
      // THE DEVICE'S SPENDABLE HOLDING — neither kept bound to the dead row nor
      // dropped." Kept bound over-counts what the yard can do; dropped leaves
      // the device one short against a server that still counts the code as
      // held, so the top-up computes a shortfall of zero and it never comes back.
      await tx.run("UPDATE local_seller_codes SET spent_on = NULL WHERE spent_on = ?", [id]);
    });
  }

  /**
   * A 409. The row stays `pending` — STILL OWED, and `countSellersOwed` still
   * sees it — while `needs_review_at` takes it out of the actionable set.
   *
   * NOT `failed`, AND THAT DISTINCTION IS THE WHOLE POINT. Terminal is the
   * cheapest way to satisfy any assertion phrased as "the row was not settled":
   * it also takes the row out of the queue, it also clears nothing, and from
   * outside it looks exactly like a correct refusal to settle. What separates
   * them is that `needs_review` leaves the row OWED, so the device does not
   * quietly stop owing a seller the yard has already handed cash to.
   *
   * THE CODE STAYS BOUND, unlike the refusal above. A 409 means the code is in
   * `sellers` and this reservation did not put it there — an unreachable state
   * the two server-side guards exist to prevent. Returning the code to the pool
   * would let this device spend a code that is provably already taken.
   */
  async markSellerCreateNeedsReview(
    id: string,
    code: string,
    reason: string,
    attempt: number,
    now: Date,
  ): Promise<void> {
    await this.db.run(
      `UPDATE local_sellers
       SET sync_state = 'pending', needs_review_at = ?, needs_review_code = ?,
           last_error = ?, attempt_count = ?
       WHERE id = ?`,
      [now.toISOString(), code, reason, attempt, id],
    );
  }

  /**
   * An unknown outcome: back to pending with a schedule. No attempt cap, ever —
   * a yard can be offline for days, and a seller marked failed for being
   * offline is a lie about a person the shop has already bought from.
   */
  async markSellerCreateAttemptFailed(
    id: string,
    reason: string,
    attempt: number,
    nextAttemptAt: Date,
  ): Promise<void> {
    await this.db.run(
      `UPDATE local_sellers
       SET sync_state = 'pending', last_error = ?, attempt_count = ?, next_attempt_at = ?
       WHERE id = ?`,
      [reason, attempt, nextAttemptAt.toISOString(), id],
    );
  }

  /**
   * The boot sweep. A REAL one — this kind has durable in-flight state, so a
   * row stranded `syncing` by a kill is visible to NOTHING until this runs:
   * `listSellersToCreate` returns only `pending` rows, which is exactly what
   * makes the claim work and exactly what strands the row.
   *
   * NO OWNER FILTER, DELIBERATELY. Recovery is about the DEVICE's state, not
   * about who is standing there: a row stranded by a crash under one identity
   * must be returned to the queue whoever reopens the app, or it waits for a
   * person who may never sign in on this handset again. The queue's own owner
   * predicate then decides whether it can be ATTEMPTED, which is a different
   * question and is asked at a different site.
   *
   * The ids are RETURNED so a boot that bypassed this kind is a visible empty
   * entry rather than a silence, and sorted so the result is comparable.
   */
  async resetSyncingSellersToPending(now: Date): Promise<string[]> {
    const rows = await this.db.all<{ id: string }>(
      `UPDATE local_sellers
       SET sync_state = 'pending', last_error = 'recovered from interrupted create',
           next_attempt_at = ?
       WHERE sync_state = 'syncing'
       RETURNING id`,
      [now.toISOString()],
    );
    return rows.map((r) => r.id).sort();
  }
}
