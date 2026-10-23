/**
 * Local bill schema.
 *
 * MONEY AND WEIGHT ARE TEXT. This is not a style choice.
 *
 * SQLite has no NUMERIC type — it has column *affinity*, and a column declared
 * NUMERIC silently converts a bound decimal string into an IEEE-754 float:
 * '0.10' is stored as 0.1 and '10.500' as 10.5, with typeof() reporting 'real'.
 * That is project hard rule 1 ("never float, anywhere") violated invisibly, at
 * the storage layer, on data that already looked like a safe string.
 *
 * So every amount and weight lives inside payload_json, a TEXT column, exactly
 * as the decimal string the server will receive. The client never does
 * arithmetic on them; the server computes every amount.
 *
 * The table is STRICT (SQLite 3.37+), but do NOT read that as protection for
 * money. Verified in Phase 2b, against the assumption: STRICT rejects a text
 * value in an INTEGER column, yet a TEXT column silently ACCEPTS a bound
 * number and stringifies it — 0.3 is stored as "0.3", and the integer 5 is
 * stored as "5.0". So a JS float that reached this layer would be written as
 * whatever its decimal expansion happens to be ("0.30000000000000004"), with
 * no error anywhere.
 *
 * The real guarantee is therefore upstream and it is the type system: every
 * money and weight field on BillPayload is declared `string`, the client never
 * computes with them, and the store only ever binds JSON.stringify output.
 * STRICT is kept because it does protect the INTEGER columns and rejects
 * unknown types, not because it makes money safe.
 */
import { idLast4 } from "../../cart/sellers.js";
import type { SqlDriver, SqlTx } from "./driver.js";

export const SCHEMA_STATEMENTS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS local_bills (
     id              TEXT    NOT NULL PRIMARY KEY,
     idempotency_key TEXT    NOT NULL UNIQUE,
     payload_json    TEXT    NOT NULL,
     sync_state      TEXT    NOT NULL,
     attempt_count   INTEGER NOT NULL DEFAULT 0,
     last_error      TEXT,
     created_at      TEXT    NOT NULL,
     next_attempt_at TEXT    NOT NULL,
     doc_no          TEXT,
     synced_at       TEXT,
     /*
      * A REAL COLUMN, not read out of payload_json, because the send queue is
      * ordered by it. Ordering is the one thing that decides which bill gets
      * the lower doc_no, so it must be indexable and it must be the actual
      * weighing time — see ix_local_bills_ready_dev.
      */
     device_created_at TEXT,
     void_reason       TEXT,
     void_requested_at TEXT,
     /* WHO ORDERED THE REVERSAL — and deliberately NOT the same question as the
        owner columns below, which record whose GOODS these were.

        The server models the two separately: created_by is the principal who
        sent the bill, voided_by is the principal who sent the void
        (server/app/bills.py). A void is a separate act by a separate person, so
        keying it to the bill's owner would route it to whoever weighed the
        load — and voiding is admin-only (require_admin) while weighing is not,
        so in the ordinary shop that is a staff member who structurally cannot
        perform it. The cancellation would be refused for ever.

        NULL means the requester is unknown: a void recorded before this column
        existed, or one requested with no identity stored. Those park, for the
        same reason an unowned bill parks — nobody knows who ordered money to
        move back, and a guess would be indistinguishable from a record. */
     void_requested_by_tenant_id TEXT,
     void_requested_by_user_id   TEXT,
     voided_at         TEXT,
     void_attempts     INTEGER NOT NULL DEFAULT 0,
     void_last_error   TEXT,
     /* Non-null ⟺ the server REFUSED this void on identity grounds (403). The
        request itself stays on the row; this takes it out of listVoidsToApply so
        nothing re-asks, and tells the card to stop claiming the bill is
        cancelled when the server still holds it live. */
     void_refused_at   TEXT,
     void_refused_code TEXT,
     /* When the bill first failed to send, for any reason. Set once, on the
        first bounce; never moved. The total-stuck clock. */
     first_attempt_at  TEXT,
     /* When the REACHABLE server last started refusing it (offline bounces reset
        it to null). Non-null ⟺ poisoned; the clock the red alarm is measured
        from, so a plain outage never trips it. See sync/queueHealth.ts. */
     first_server_error_at TEXT,
     /* Consecutive failures against a REACHABLE server: +1 on a server-answered
        bounce, reset to 0 by a transport-level one or a success. The COUNT
        trigger for the same red alarm, so a server refusing this bill quickly is
        surfaced after N refusals rather than only after the wall-clock
        threshold. Deliberately NOT attempt_count, which includes offline
        bounces and never resets. */
     server_error_attempts INTEGER NOT NULL DEFAULT 0,
     /* Non-null ⟺ parked waiting on master data the office has not set up. The
        bill stays 'pending' (still owed) but is excluded from the head-of-line
        queue so it cannot dam the bills behind it. Deliberately NOT a new
        sync_state value: the CHECK below is baked into CREATE TABLE and SQLite
        cannot alter a CHECK without rebuilding the table — on a database already
        holding the shop's unsynced bills. */
     master_data_missing_at TEXT,
     master_data_code       TEXT,
     /* WHOSE BILL THIS IS: the pair, and both NULLABLE.
        Nullable is not a preference. ALTER TABLE ADD COLUMN ... NOT NULL with no
        default is a hard engine error on a table that already holds rows, which
        every upgraded handset does — and NULL is the value that means UNKNOWN,
        which rows written before ownership existed must be able to carry. An
        unknown owner is treated as a MISMATCH and parks; it is never assumed to
        belong to whoever is signed in, because a guess here manufactures false
        provenance that reads exactly like true provenance. */
     owner_tenant_id TEXT,
     owner_user_id   TEXT,
     CHECK (sync_state IN ('pending', 'syncing', 'synced', 'failed'))
   ) STRICT`,

  // Drives listReadyToSend. Timestamps are ISO-8601 UTC from toISOString(), a
  // fixed-width format, so lexicographic ordering IS chronological ordering.
  `CREATE INDEX IF NOT EXISTS ix_local_bills_ready
     ON local_bills (sync_state, next_attempt_at, created_at)`,

  /*
   * THE CART DRAFT (Phase 2c-3). Separate tables on purpose.
   *
   * A draft is not a bill in a different state — it is a different thing. By
   * living outside local_bills it is unreachable by every query the sync engine
   * runs (listReadyToSend, listByState, claimForSend all name local_bills), so
   * "the engine must never send a draft" is a structural fact rather than a
   * condition someone has to keep remembering in a WHERE clause.
   *
   * There is no id and no idempotency_key here: both are minted at the moment
   * of promotion. Nothing is consumed while the yard is still typing.
   */
  `CREATE TABLE IF NOT EXISTS local_draft (
     id          TEXT    NOT NULL PRIMARY KEY,
     seller_id   TEXT    NOT NULL,
     vehicle_no  TEXT,
     next_seq    INTEGER NOT NULL,
     form_json   TEXT    NOT NULL,
     updated_at  TEXT    NOT NULL,
     /* Fetch time of the master data available when this draft was STARTED —
        the oldest data any line on it could have been priced from. Carried to
        the bill at promotion. See master/freshness.ts. */
     master_as_of TEXT,
     /* THE SAME PAIR AS local_bills, and for a reason that is not symmetry.
        SUPERSEDED — this comment previously read that a draft BECOMES a bill
        through promoteToBill, so a draft carrying no owner produces a bill
        carrying none. THE BILL DOES NOT INHERIT THIS PAIR. It is stamped from
        the identity read live at the moment of saving, because the pair here
        records who OPENED the cart and a bill must be owned by whoever CLOSED
        it and handed over the cash — across a shift change those are different
        people, and the server records the sender as a bill's creator.
        What these two columns are for is therefore the draft in its own right:
        a cart abandoned half-typed still says whose it was. Nullable for the
        same two reasons as on local_bills. See SqliteDraftStore.promoteToBill. */
     owner_tenant_id TEXT,
     owner_user_id   TEXT
   ) STRICT`,

  // Money and weight are TEXT here for the same reason as in local_bills: a
  // NUMERIC column would silently convert '10.500' to the float 10.5.
  `CREATE TABLE IF NOT EXISTS local_draft_lines (
     id            TEXT    NOT NULL PRIMARY KEY,
     draft_id      TEXT    NOT NULL REFERENCES local_draft(id) ON DELETE CASCADE,
     seq           INTEGER NOT NULL,
     product_id    TEXT    NOT NULL,
     product_code  TEXT    NOT NULL,
     product_name  TEXT    NOT NULL,
     uom_code      TEXT    NOT NULL,
     gross_weight  TEXT    NOT NULL,
     tare_weight   TEXT    NOT NULL,
     net_weight    TEXT    NOT NULL,
     unit_price    TEXT    NOT NULL,
     list_price    TEXT    NOT NULL,
     amount        TEXT    NOT NULL,
     UNIQUE (draft_id, seq)
   ) STRICT`,

  `CREATE INDEX IF NOT EXISTS ix_draft_lines_draft
     ON local_draft_lines (draft_id, seq)`,

  /*
   * THE MASTER-DATA CACHE (Phase 2c-8). Products and sellers, so the yard can
   * open the app with the server unreachable and still pick a customer, weigh,
   * and save.
   *
   * WHEN each list was fetched, kept per KIND rather than as one row. A refresh
   * is two requests over one connection and the second can fail on its own; a
   * shared timestamp would then claim the seller list had been re-read when only
   * the product list had. The price default is gated on the OLDER of the two
   * (master/freshness.ts), which only means anything if they can differ.
   */
  /*
   * THE CACHE BINDS TO THE TENANT ONLY, NEVER TO A PERSON. Prices and the
   * shop's people belong to the SHOP; two staff at one yard price identically,
   * and keying this to a user would drop a perfectly good price list every time
   * the phone changed hands.
   *
   * The reading rule that goes with the column, and it does not follow from the
   * column: a tenant MISMATCH must read as ABSENT, not as STALE. freshness.ts
   * already teaches the operator that stale data is usable — that is its whole
   * job — and this is the one case where it is not, because another shop's
   * price is not an old price, it is a wrong one, and the cash is paid against
   * it. Wiring that rule into the readers is NOT this pass.
   */
  `CREATE TABLE IF NOT EXISTS master_cache (
     kind       TEXT NOT NULL PRIMARY KEY,
     fetched_at TEXT NOT NULL,
     owner_tenant_id TEXT
   ) STRICT`,

  /*
   * PRICES ARE TEXT, and this is the same rule as local_bills.payload_json, for
   * the same reason: a column declared NUMERIC silently converts a bound decimal
   * string into an IEEE-754 float, so '15.50' would come back 15.5 and '10.500'
   * as 10.5, with hard rule 1 violated invisibly at the storage layer. The whole
   * tier map is one JSON TEXT column holding the server's decimal strings
   * verbatim. See lessons/sqlite-money-is-text.md.
   */
  `CREATE TABLE IF NOT EXISTS cached_products (
     id          TEXT NOT NULL PRIMARY KEY,
     code        TEXT NOT NULL,
     name        TEXT NOT NULL,
     uom_code    TEXT NOT NULL,
     uom_name    TEXT NOT NULL,
     prices_json TEXT NOT NULL,
     /* Tenant only. See the note above master_cache. */
     owner_tenant_id TEXT,
     /* The product's ACTIVE category, joined on the device at fetch time (cart milestone,
        2026-10-12; src/master/categories.ts). All three NULL when retired, unknown or not
        fetched -- the product is then listed under ทั้งหมด only. Also in
        ADDED_PRODUCT_CATEGORY_COLUMNS for a device that cached products before them. */
     category_id   TEXT,
     category_code TEXT,
     category_name TEXT
   ) STRICT`,

  `CREATE TABLE IF NOT EXISTS cached_sellers (
     id    TEXT NOT NULL PRIMARY KEY,
     code  TEXT NOT NULL,
     name  TEXT NOT NULL,
     phone TEXT,
     grade TEXT,
     /* Tenant only. See the note above master_cache. */
     owner_tenant_id TEXT,
     /* Seller search (2026-10-12): the server's MINIMISED ID -- its last four characters,
        never the full number -- and the truck the seller usually arrives in. Searched
        offline. ADDED_SELLER_SEARCH_COLUMNS for a device that cached sellers before them. */
     id_last4   TEXT,
     vehicle_no TEXT
   ) STRICT`,

  /*
   * THE SHOP'S GRADE TIERS (S16 / P1.24), a THIRD master list beside products and
   * sellers. The set that used to be the hardcoded GRADES A-D; per-tenant now, so
   * it is fetched (GET /grade-tiers, active only) and cached here — the price
   * screen must be able to list a tier nobody has priced yet, which GET /products
   * cannot show. `code` is the price-map key and the FK handle; `name` is the
   * shop's display text; `sort_order` is the shop's draw order.
   *
   * NEEDS NO MIGRATION LIST ENTRY, and NOT in CACHE_TABLES: a table that never
   * existed is created by this statement on an upgraded device exactly as on a
   * fresh one, and it is BORN with owner_tenant_id in its CREATE — so there is no
   * pre-existing shape for ADDED_CACHE_TENANT_COLUMN to retrofit. Same reasoning
   * the three "needs no migration list entry" notes elsewhere in this file give.
   *
   * NO CHECK ON `code` OR `name`, and no length here: the value is the server's,
   * validated against grade_tiers at the source (F3 makes the set the shop's), and
   * a client CHECK could only be a fifth copy of a bound this table does not own.
   */
  `CREATE TABLE IF NOT EXISTS cached_grade_tiers (
     code       TEXT    NOT NULL,
     name       TEXT    NOT NULL,
     sort_order INTEGER NOT NULL,
     /* Tenant only. See the note above master_cache. */
     owner_tenant_id TEXT
   ) STRICT`,

  /*
   * WHO THIS DEVICE IS SIGNED IN AS — one row, and deliberately NOT the OS
   * keystore.
   *
   * It has to outlive the token. A token expires within the hour and is
   * deliberately KEPT in the keystore when it does (App.tsx says why), and a
   * sign-out DELETES the keystore entry. So keystore presence is already not a
   * proxy for "signed in", and an identity living there would share the token's
   * lifetime — which is the opposite of what ownership needs.
   *
   * There is no point at which this is reconciled against the token, and there
   * must not be: it is written when a login succeeds, read when a row is
   * written, and removed only by a deliberate sign-out.
   */
  `CREATE TABLE IF NOT EXISTS local_identity (
     only_row   INTEGER NOT NULL PRIMARY KEY CHECK (only_row = 1),
     tenant_id  TEXT    NOT NULL,
     user_id    TEXT    NOT NULL,
     updated_at TEXT    NOT NULL
   ) STRICT`,

  /*
   * WHICH SHOP THIS DEVICE BELONGS TO — set once at setup, from a typed code.
   *
   * A SEPARATE TABLE FROM local_identity, AND NOT A COLUMN ON IT. The two look
   * alike and their LIFETIMES are the argument, which is the same argument
   * local_identity uses against the keystore rather than a resemblance to it.
   *
   * The identity's lifetime ends at a deliberate SIGN-OUT: a person leaves, the
   * device stays. The shop's lifetime ends when the DEVICE LEAVES THE SHOP,
   * which is a different event, happens far more rarely, and is not built at
   * all yet. Sharing a row would fuse them, so the sign-out clearing that P1.7
   * still owes would take the shop with it — and the next person would be asked
   * for a shop code they were never given, at five in the morning, to sign in to
   * the yard they are standing in.
   *
   * CONFIRMED ON A HANDSET 2026-08-12, and this is the sentence above being
   * measured rather than argued. Android only, on this project's own DEBUG build
   * (`9d2eb22`, `dev.chutipon.recycle`), one vivo 1938, never Expo Go. After a
   * real sign-out performed on the device and a force-stop and cold start,
   * `local_shop` still held its ONE row and `LoginScreen` drew the USERNAME AND
   * PASSWORD state — not `ตั้งค่าเครื่องนี้`. Nobody was asked for a shop code.
   * `local_identity` also still held its row, which is the other half of this
   * design and is stated at App.tsx's onSignOut. The database was byte-identical
   * across the sign-out: it wrote to the keystore and to nothing else.
   * NOT confirmed on iOS, which has never been asked, and no release build
   * exists on either platform.
   *
   * NO `local_shop` CLEAR EXISTS, deliberately. Leaving a shop is its own act
   * with its own refusal — it must not proceed while rows belonging to this shop
   * are unsent, and nothing counts that yet. When it is written it clears THIS
   * table and not local_identity; the two are already separate so that change
   * unpicks nothing.
   *
   * Needs no migration list entry: a table that never existed is created by this
   * statement on an upgraded device exactly as on a fresh one.
   */
  `CREATE TABLE IF NOT EXISTS local_shop (
     only_row   INTEGER NOT NULL PRIMARY KEY CHECK (only_row = 1),
     tenant_id  TEXT    NOT NULL,
     updated_at TEXT    NOT NULL,
     branch_id  TEXT
   ) STRICT`,

  /*
   * WHAT THIS USER MAY DO, as the server last said it (server migration 0019,
   * STRUCTURE.md section 3.3). One row per (user, permission), written at
   * sign-in from the token's advisory claim and rewritten from every /whoami;
   * read on a cold start so the controls gate on the freshest answer the device
   * holds without a network. KEYED ON THE USER so a crash between a new user's
   * token landing and their set being written can never show them the previous
   * user's rights (SqlitePermissionStore.ts says why). Cleared on sign-out.
   *
   * Needs no migration list entry: a table that never existed is created by this
   * statement on an upgraded device exactly as on a fresh one.
   */
  `CREATE TABLE IF NOT EXISTS cached_permissions (
     user_id    TEXT NOT NULL,
     permission TEXT NOT NULL,
     updated_at TEXT NOT NULL,
     PRIMARY KEY (user_id, permission)
   ) STRICT`,

  /*
   * THE SHOP'S COUNTER POLICY (STRUCTURE.md 1.4, the cashier-counter unit). One
   * row, refreshed from GET /shop/policy in the same refreshMaster pass that
   * refreshes products, sellers and tiers, so the counter entry can decide
   * OFFLINE whether to draw itself. Today it carries one policy, separate_cashier;
   * a future switch is another column, which is the whole reason a POLICY TABLE
   * was chosen over widening GET /shop's branch payload (the owner's ruling 1).
   *
   * DISPLAY-ONLY, READ AT ANY AGE, FAILS OPEN. separate_cashier supplies no value
   * the yard pays against -- it only decides WHO writes the payment row (the
   * server, or the cashier from this screen; invariant 1) -- so it is NOT a price
   * claim under the 12-hour rule (STRUCTURE.md 1.4, the owner's ruling 2). There
   * is deliberately no freshness gate on it: with the switch OFF the unpaid queue
   * is empty by construction (bills.py list_bills), so a stale "on" costs an empty
   * list and a stale "off" costs a cashier who cannot pay a seller standing at the
   * counter -- both directions favour showing, so an absent or stale row reads as
   * UNKNOWN and the entry is drawn.
   *
   * separate_cashier is INTEGER (SQLite has no boolean): 0/1, or NULL when the
   * caller has no single branch (an unscoped owner) -- which the reader treats as
   * unknown, exactly as an absent row.
   *
   * TENANT-STAMPED, and the read predicate carries it: a tenant MISMATCH reads as
   * UNKNOWN, never as another shop's policy -- the master_cache rule, one table on.
   * Born with tenant_id in its CREATE, so it needs no CACHE_TABLES entry and no
   * migration list entry (cached_grade_tiers' reason).
   */
  `CREATE TABLE IF NOT EXISTS cached_shop_policy (
     only_row         INTEGER NOT NULL PRIMARY KEY CHECK (only_row = 1),
     tenant_id        TEXT    NOT NULL,
     separate_cashier INTEGER,
     fetched_at       TEXT    NOT NULL
   ) STRICT`,

  /*
   * WHAT THIS INSTALLATION IS — the holder a reserved seller code belongs to.
   *
   * A THIRD one-row table, and the same argument that already separated the two
   * above it: local_identity's lifetime ends at a SIGN-OUT, local_shop's ends
   * when the device leaves the shop, and this one ends when the INSTALL is
   * removed. Three events, three tables. Fusing this into either would give the
   * device a new identity at an event that has nothing to do with the install —
   * and a device that re-mints does not get a duplicate, it becomes a SECOND
   * HOLDER: the codes it was already carrying stay `held` on the server under a
   * name it no longer answers to, and nothing re-issues them.
   *
   * NOT THE KEYSTORE, for the reason local_identity gives one paragraph up and
   * with a sharper cost. A sign-out DELETES the keystore entry
   * (session/signOut.ts calls tokens.clear() and touches nothing else), and the
   * design puts reserved codes on the far side of a sign-out because the device
   * is still holding them. The whole argument is at src/session/deviceIdentity.ts.
   *
   * MINTED ONCE BY THE SCHEMA, NOT BY THE CALLER REMEMBERING. only_row is the
   * primary key with CHECK (only_row = 1), and SqliteDeviceStore writes it with
   * ON CONFLICT DO NOTHING — so two concurrent boots race into ONE row and the
   * loser reads the winner's value rather than replacing it. A second identity
   * is unrepresentable rather than merely unwritten, exactly as a second
   * local_identity is.
   *
   * Needs no migration list entry, for local_shop's reason: a table that never
   * existed is created by this statement on an upgraded device exactly as on a
   * fresh one.
   */
  `CREATE TABLE IF NOT EXISTS local_device (
     only_row  INTEGER NOT NULL PRIMARY KEY CHECK (only_row = 1),
     device_id TEXT    NOT NULL,
     minted_at TEXT    NOT NULL
   ) STRICT`,

  /*
   * THE SHOP'S TARGET FOR THIS DEVICE'S RESERVED-CODE HOLDING — the one fact the
   * reserve level needs that the device cannot know locally.
   *
   * `spendable` and `held` are counts over `local_seller_codes`, both LOCAL. The
   * TARGET is the shop's, and it arrives ONLY in a refill answer
   * (`sync/sellerRefill.ts` `ReservationHolding.target`); a refill is a no-op when
   * offline, so this value CAN BE STALE. `target_at` records when it was last
   * received, so the strip can refuse to present a stale target as a fresh
   * sufficiency claim (`src/master/reserveStrip.ts`, the age-and-clock rule that
   * `lessons/cached-master-data-is-a-price-claim.md` prescribes).
   *
   * A ONE-ROW TABLE keyed `only_row = 1`, the same shape as local_device /
   * local_shop / local_identity, and with NO OWNER COLUMN for
   * `local_seller_codes`' reason: the holding this measures belongs to the
   * DEVICE, not a person, and must survive a sign-out.
   *
   * Needs no migration list entry, for local_shop's reason: a table that never
   * existed is created by this statement on an upgraded device exactly as on a
   * fresh one. The value is not backfilled and must not be invented — a device
   * with no row here has NEVER been provisioned, which is a real state the strip
   * renders as such rather than defaulting a target
   * (`lessons/fallback-default-is-a-wrong-number.md`).
   */
  `CREATE TABLE IF NOT EXISTS local_reserve (
     only_row  INTEGER NOT NULL PRIMARY KEY CHECK (only_row = 1),
     target    INTEGER NOT NULL,
     target_at TEXT    NOT NULL
   ) STRICT`,

  /*
   * A SELLER THIS DEVICE CREATED THAT THE SERVER HAS NOT SEEN YET.
   *
   * ---------------------------------------------------------------------------
   * WHY IT IS A NEW TABLE AND NOT A COLUMN ON cached_sellers
   * ---------------------------------------------------------------------------
   * `ROADMAP.md § P1.8` "AN UNSETTLED LOCAL SELLER NEVER ENTERS `cached_sellers`".
   * The design dissolves the survey's first two bullets rather than patching
   * them, and BOTH halves matter:
   *
   *   cached_sellers needs NO ORIGIN MARKER, because nothing local is in there
   *   to mark. It stays what it is — a copy of the server's list.
   *
   *   saveSellers's unconditional `DELETE FROM cached_sellers` DOES NOT CHANGE.
   *   A cache is content that follows a rewrite wholesale, and weakening the
   *   refresh to protect a local row would be the wrong repair to the wrong
   *   statement.
   *
   * AND AN ORIGIN MARKER ON THAT TABLE WOULD HAVE FAILED IN A THIRD WAY THAT NO
   * `DO UPDATE` LIST COVERS, which is worth knowing before somebody proposes it
   * again: cached_sellers is DELETEd and re-INSERTed, never upserted, so a
   * marker there is DESTROYED rather than wrongly carried forward.
   * lessons/a-column-that-describes-content-must-follow-a-rewrite.md names two
   * failure directions; delete-and-reinsert is a third rewrite shape and neither
   * of them reaches it.
   *
   * ---------------------------------------------------------------------------
   * OWED WORK LIVES BESIDE local_bills, AND ITS CHECK IS ITS OWN
   * ---------------------------------------------------------------------------
   * This table is created WITH the CHECK it needs, so local_bills's CHECK is not
   * altered and the question of what happens to rows in flight during a rebuild
   * never arises. That is one of the design's stated reasons for a new table
   * over a widened one, on a database that is already holding a shop's unsynced
   * bills.
   *
   * THE STATE NAMES ARE local_bills's, DELIBERATELY. 'synced' is this table's
   * word for the design's "settled" — one vocabulary across both tables, so a
   * reader does not have to learn which of two spellings a given table uses.
   *
   * `needs_review_at` IS A COLUMN AND NOT A FIFTH STATE, for exactly the reason
   * master_data_missing_at is one on local_bills: the CHECK is baked into CREATE
   * TABLE and SQLite cannot alter one without rebuilding. It also has to behave
   * like the park rather than like a terminal: a 409 leaves the row STILL OWED
   * and operator-visible (`NO-ARM-OF-THIS-KIND-SETTLES-A-409`), so it takes the
   * row out of the ACTIONABLE set while leaving it inside the owed COUNT.
   *
   * MONEY AND WEIGHT DO NOT APPEAR HERE AT ALL. A seller carries no amounts, so
   * the TEXT rule this file opens with has nothing to bite on — stated because
   * its ABSENCE from a new table in this file would otherwise read as an
   * oversight.
   *
   * THE OWNER PAIR IS ORIGIN. It records who CREATED this seller, and no later
   * edit makes that untrue — so it must never appear in a rewrite of the row,
   * exactly as local_draft's owner pair does not. Nullable for local_bills's two
   * reasons: an unknown owner is a real answer, and a guess here manufactures
   * provenance indistinguishable from a record.
   *
   * server_seller_id IS ORIGIN TOO, and of the strongest kind — WHICH SERVER ROW
   * THIS LOCAL ROW BECAME. Written once, at settle, by id; it is in no upsert
   * anywhere and there is no statement that could move it.
   */
  `CREATE TABLE IF NOT EXISTS local_sellers (
     id                TEXT    NOT NULL PRIMARY KEY,
     /* The reserved code being spent, and the token that proves this device
        holds it. UNIQUE on the code because one code produces one seller: a
        second local row on the same code is the wrong-seller binding this whole
        step exists to prevent, and the index refuses it rather than a rule
        somebody remembers. */
     code              TEXT    NOT NULL UNIQUE,
     reservation_token TEXT    NOT NULL,
     name              TEXT    NOT NULL,
     phone             TEXT,
     grade             TEXT,
     /* The ID its creator typed -- held ONLY until the server has the seller. At settle it
        is NULLed in the same UPDATE that marks the row synced, and id_last4 keeps the
        minimised form (H3, ADVISOR-DECIDED 2026-10-23). */
     id_number         TEXT,
     id_last4          TEXT,
     address           TEXT,
     vehicle_no        TEXT,
     sync_state        TEXT    NOT NULL,
     attempt_count     INTEGER NOT NULL DEFAULT 0,
     last_error        TEXT,
     created_at        TEXT    NOT NULL,
     next_attempt_at   TEXT    NOT NULL,
     /* ORIGIN. Which server row this local row became. Written once at settle. */
     server_seller_id  TEXT,
     settled_at        TEXT,
     /* Non-null ⟺ the server answered 409 — a state the two server-side guards
        make unreachable, so reaching it is an invariant violation and never a
        settle. The row stays 'pending' and stays owed; this takes it out of the
        actionable set so nothing re-asks a settled question. */
     needs_review_at   TEXT,
     needs_review_code TEXT,
     /* ORIGIN — who created this seller. Never in a rewrite. */
     owner_tenant_id   TEXT,
     owner_user_id     TEXT,
     CHECK (sync_state IN ('pending', 'syncing', 'synced', 'failed'))
   ) STRICT`,

  // Drives listSellersToCreate. Same column order and same reasoning as
  // ix_local_bills_ready: state first, then the schedule, then creation order.
  `CREATE INDEX IF NOT EXISTS ix_local_sellers_owed
     ON local_sellers (sync_state, next_attempt_at, created_at)`,

  /*
   * THE CODES THIS DEVICE IS HOLDING — one row per reservation the server
   * minted for it.
   *
   * NO OWNER COLUMNS, AND THAT IS A DECISION RATHER THAN AN OMISSION. The
   * holder is a DEVICE (src/session/deviceIdentity.ts): the codes physically
   * live in this SQLite file, they must outlive a sign-out, and an owner
   * predicate here would hide a device's own holding from the next person to
   * sign in — losing it for ever, because nothing re-issues a reservation.
   * Every other owed-work table in this file carries the pair; this one must
   * not, and a sweep adding predicates to statements that lack one would be
   * wrong here.
   *
   * `spent_on` IS CONTENT, AND IT IS LOCAL. It says what the code is attached
   * to NOW, which is why a refill's answer must never rewrite it: the server
   * re-sends the device's WHOLE holding on every top-up, including codes this
   * device has already bound to a local seller, and the server knows nothing
   * about that binding. SqliteLocalSellerStore therefore writes reservations
   * with ON CONFLICT DO NOTHING and no set-list at all.
   *
   * `token` IS ORIGIN — the server minted it WITH the code and it never changes.
   * Same DO NOTHING covers it, and for the stronger reason: a token that moved
   * would be a create the server could no longer recognise as a replay.
   *
   * SPENDABLE IS `spent_on IS NULL`, ONE PREDICATE. That is a deliberate
   * simplification of the design's sentence, which reads "codes this device
   * holds that are not bound to a create that has SETTLED or is IN FLIGHT" and
   * is ambiguous about a create that is merely OWED. Taken literally it would
   * make an owed create's code spendable again — two sellers on one code, the
   * exact harm the mechanism exists to prevent — so it is not taken literally.
   * Instead the code is UNBOUND by a write when its create goes terminal, which
   * is what the design's amendment asks for ("THE CODE GOES BACK INTO THE
   * DEVICE'S SPENDABLE HOLDING"), and the count then needs no case analysis.
   *
   * The FK is what makes `spent_on` unable to name a seller row that is not
   * there; PRAGMA foreign_keys = ON in CONNECTION_PRAGMAS is what enforces it.
   * local_sellers is created ABOVE this statement for that reason.
   */
  `CREATE TABLE IF NOT EXISTS local_seller_codes (
     code        TEXT NOT NULL PRIMARY KEY,
     token       TEXT NOT NULL UNIQUE,
     received_at TEXT NOT NULL,
     spent_on    TEXT REFERENCES local_sellers(id)
   ) STRICT`,

  // Drives the spendable count and the pick. Partial on purpose: the question
  // asked of this table is almost always "what is still free".
  `CREATE INDEX IF NOT EXISTS ix_local_seller_codes_free
     ON local_seller_codes (code) WHERE spent_on IS NULL`,
];

/**
 * Statements that depend on the migrated columns, so they must run AFTER
 * migrateBillColumns and never alongside SCHEMA_STATEMENTS.
 *
 * This index sat in SCHEMA_STATEMENTS for about a minute during Phase 2c-5 and
 * would have thrown on any UPGRADED device — a fresh install has the columns
 * from CREATE TABLE, so it works there and only there. Ordering is the whole
 * content of this constant's existence.
 */
const POST_MIGRATION_STATEMENTS: readonly string[] = [
  // Drives listVoidsToApply: voids still owed to the server.
  `CREATE INDEX IF NOT EXISTS ix_local_bills_void_owed
     ON local_bills (void_requested_at, voided_at, sync_state)`,

  /*
   * Backfill for bills written before device_created_at was a column. The value
   * has always been in the payload — it is what the server stores — so nothing
   * is invented here, it is only lifted somewhere it can be ordered by.
   * Idempotent: after the first run there is nothing left NULL to update.
   */
  `UPDATE local_bills
     SET device_created_at = json_extract(payload_json, '$.device_created_at')
   WHERE device_created_at IS NULL`,

  // Drives listReadyToSend. device_created_at leads the sort so a backlog
  // drains in weighing order.
  `CREATE INDEX IF NOT EXISTS ix_local_bills_ready_dev
     ON local_bills (sync_state, next_attempt_at, device_created_at)`,
];

/**
 * Columns added to local_bills AFTER the table first shipped.
 *
 * CREATE TABLE IF NOT EXISTS does nothing to a table that already exists, so a
 * device upgraded from Phase 2c-4 would keep the old five-column-shorter
 * local_bills and every void query would fail at runtime — on a database that
 * already holds the shop's unsynced bills. Fresh installs get these from the
 * CREATE above; existing ones get them from here. Both paths must end at the
 * same shape, which is what proveVoid V0 checks.
 */
const ADDED_BILL_COLUMNS: readonly { name: string; ddl: string }[] = [
  { name: "device_created_at", ddl: "device_created_at TEXT" },
  { name: "void_reason", ddl: "void_reason TEXT" },
  { name: "void_requested_at", ddl: "void_requested_at TEXT" },
  { name: "voided_at", ddl: "voided_at TEXT" },
  { name: "void_attempts", ddl: "void_attempts INTEGER NOT NULL DEFAULT 0" },
  { name: "void_last_error", ddl: "void_last_error TEXT" },
  { name: "first_attempt_at", ddl: "first_attempt_at TEXT" },
  { name: "first_server_error_at", ddl: "first_server_error_at TEXT" },
  {
    name: "server_error_attempts",
    ddl: "server_error_attempts INTEGER NOT NULL DEFAULT 0",
  },
  { name: "master_data_missing_at", ddl: "master_data_missing_at TEXT" },
  { name: "master_data_code", ddl: "master_data_code TEXT" },
  { name: "master_as_of", ddl: "master_as_of TEXT" },
  // Phase 2c-9: the void the server refused on identity grounds. An upgraded
  // device must gain these too — listVoidsToApply filters on void_refused_at, so
  // without them the void queue itself would fail to read on a database that
  // already holds the shop's bills, including ones with a void owed.
  { name: "void_refused_at", ddl: "void_refused_at TEXT" },
  { name: "void_refused_code", ddl: "void_refused_code TEXT" },
  // P1.7: who ORDERED the reversal. An upgraded handset must gain these for the
  // same reason as void_refused_at — listVoidsToApply now filters on them, so a
  // database that already holds the shop's bills would fail to read its own void
  // queue without them. Every existing row gets NULL, which means "nobody knows
  // who asked" and parks the void rather than sending it under whoever happens
  // to be signed in next.
  { name: "void_requested_by_tenant_id", ddl: "void_requested_by_tenant_id TEXT" },
  { name: "void_requested_by_user_id", ddl: "void_requested_by_user_id TEXT" },
  // P1.7: whose bill this is. NULLABLE, and it must stay so — see the CREATE
  // TABLE above. On an upgraded handset every existing row gets NULL, which
  // means UNKNOWN and parks; nothing is attributed to whoever is signed in.
  { name: "owner_tenant_id", ddl: "owner_tenant_id TEXT" },
  { name: "owner_user_id", ddl: "owner_user_id TEXT" },
  /*
   * P1.8b: THE BILL IS WAITING ON A SELLER THIS DEVICE CREATED.
   *
   * A NULLABLE PAIR AND EMPHATICALLY NOT A NEW sync_state VALUE. The CHECK on
   * local_bills is baked into CREATE TABLE and SQLite cannot alter one without
   * rebuilding the table — on a database already holding the shop's unsynced
   * bills. That is the same argument master_data_missing_at gives above, and
   * `THE-LOCAL-SCHEMA-ADDS-AND-DOES-NOT-REBUILD` is the criterion that measures
   * it: local_bills's CHECK member set must be EQUAL to the set it held before,
   * not merely a superset, because a rebuild that ADDED a state passes a
   * containment test and is exactly what the design refuses to do.
   *
   * ADDITIVE, so it needs no rebuild at all: the migrator asks PRAGMA
   * table_info what the table already has, and every existing row gets NULL.
   *
   * WHAT READS THEM TODAY: NOTHING, and that is deliberate rather than an
   * oversight. The park's BEHAVIOUR — a bill held out of the sendable queue and
   * released when its seller settles — is the surfaces phase, and it is not
   * built here. These two columns are the storage half, landed with the rest of
   * the schema so an upgraded handset gains them in one migration instead of
   * two. Nothing between here and there may read their absence as evidence a
   * bill has no local seller, which is the rule the owner pair already states
   * one entry up.
   */
  { name: "local_seller_id", ddl: "local_seller_id TEXT" },
  { name: "local_seller_parked_at", ddl: "local_seller_parked_at TEXT" },
];

/**
 * Columns added to local_draft after IT first shipped.
 *
 * local_draft has never needed one before, which is exactly why this list is
 * being created rather than the column being quietly appended to the CREATE
 * TABLE above: CREATE TABLE IF NOT EXISTS does nothing to a table that already
 * exists, so on a device upgraded from Phase 2c-7 the column would simply not be
 * there and every draft save would throw — on a phone with a cart open.
 */
const ADDED_DRAFT_COLUMNS: readonly { name: string; ddl: string }[] = [
  { name: "master_as_of", ddl: "master_as_of TEXT" },
  { name: "owner_tenant_id", ddl: "owner_tenant_id TEXT" },
  { name: "owner_user_id", ddl: "owner_user_id TEXT" },
];

/**
 * Columns added to the three master-data cache tables.
 *
 * TENANT ONLY — no user column, on any of them. Prices belong to the shop.
 *
 * `local_draft_lines` is deliberately ABSENT from this file's migration lists
 * and gains nothing. Every line is reachable only through `draft_id`, which is
 * `REFERENCES local_draft(id) ON DELETE CASCADE` in the CREATE TABLE above with
 * `PRAGMA foreign_keys = ON` in CONNECTION_PRAGMAS below — so a line cannot
 * outlive its owned parent or be reached apart from it, and a second copy of
 * the owner could only ever disagree with the first.
 */
const ADDED_CACHE_TENANT_COLUMN: readonly { name: string; ddl: string }[] = [
  { name: "owner_tenant_id", ddl: "owner_tenant_id TEXT" },
];

/** The three tables that take the tenant column and nothing else. */
const CACHE_TABLES: readonly string[] = ["master_cache", "cached_products", "cached_sellers"];

/**
 * The product's category (cart milestone, 2026-10-12), added to cached_products after it
 * shipped. NULLABLE: a row cached before them reads as "no category" and is listed under
 * ทั้งหมด until the next refresh rewrites the table. No backfill — the next fetch is the
 * backfill, and until then the only consequence is a product missing from one chip.
 */
const ADDED_PRODUCT_CATEGORY_COLUMNS: readonly { name: string; ddl: string }[] = [
  { name: "category_id", ddl: "category_id TEXT" },
  { name: "category_code", ddl: "category_code TEXT" },
  { name: "category_name", ddl: "category_name TEXT" },
];

/**
 * The seller-search columns (seller search C3, 2026-10-12), added to cached_sellers after it
 * shipped. NULLABLE: a row cached before them is simply not findable by last four or usual
 * truck until the next refresh rewrites the table -- no backfill, the next fetch is the
 * backfill. `id_last4` is the server's minimised form; the full ID has no column here and
 * must never get one (ADVISOR-DECIDED: "Cache a full ID on the phone" is forbidden).
 */
const ADDED_SELLER_SEARCH_COLUMNS: readonly { name: string; ddl: string }[] = [
  { name: "id_last4", ddl: "id_last4 TEXT" },
  { name: "vehicle_no", ddl: "vehicle_no TEXT" },
];

/**
 * The minimised ID on a LOCAL seller (H3, ADVISOR-DECIDED 2026-10-23: "no phone keeps a full ID
 * number after its seller has synced"), added to local_sellers after it shipped. NULLABLE: a row
 * still owed keeps the full id_number and has no last four stored; a settled row keeps ONLY this.
 * The backfill is `minimiseSettledSellerIds` below, in the same transaction as the column.
 */
const ADDED_LOCAL_SELLER_COLUMNS: readonly { name: string; ddl: string }[] = [
  { name: "id_last4", ddl: "id_last4 TEXT" },
];

/**
 * A device that settled sellers BEFORE the settle learned to drop the ID still holds each full ID.
 * Every open re-runs this; after the first it touches nothing (`id_number IS NOT NULL` on a synced
 * row is the only thing it matches, and it removes exactly that).
 *
 * THE RULE IS THE TYPESCRIPT ONE (`idLast4`, the server's `_id_last4` transcribed), applied row by
 * row, NOT a SQL expression: `replace()` knows the characters it is told, and the rule drops ALL
 * whitespace, so a SQL copy would minimise an ID carrying a no-break space differently from the
 * settle path. Inside initConnection's transaction, so the column and its backfill land together.
 *
 * ONLY `synced`. A pending, syncing or held-for-review row is still owed and needs its ID to be
 * created; a `failed` row was refused and never reached the server -- its ID stays with it, and
 * what a refused row should keep is not this sweep's question (OPEN_ITEMS).
 */
async function minimiseSettledSellerIds(tx: SqlTx): Promise<number> {
  const rows = await tx.all<{ id: string; id_number: string }>(
    "SELECT id, id_number FROM local_sellers WHERE sync_state = 'synced' AND id_number IS NOT NULL",
  );
  for (const r of rows) {
    await tx.run(
      "UPDATE local_sellers SET id_last4 = ?, id_number = NULL WHERE id = ? AND sync_state = 'synced'",
      [idLast4(r.id_number), r.id],
    );
  }
  return rows.length;
}

/**
 * Columns added to local_shop after IT first shipped.
 *
 * `branch_id` (server migration 0018): the yard this device's caller works at,
 * as GET /shop reported it, cached so a new bill can carry it. NULLABLE and
 * ADDITIVE for the reason every entry above gives -- CREATE TABLE IF NOT EXISTS
 * does nothing to a table that already exists, and a rebuild is refused on a
 * database holding unsent bills. An upgraded handset gets NULL here, which means
 * "not yet learned", and a bill built while it is NULL simply carries no
 * branch_id -- the exact shape every bill queued before 0018 already has, and
 * one the server resolves for itself. Nothing may read this column's absence or
 * NULL as a reason to refuse or park a bill.
 */
const ADDED_SHOP_COLUMNS: readonly { name: string; ddl: string }[] = [
  { name: "branch_id", ddl: "branch_id TEXT" },
];

/**
 * Adds any missing column, by asking the database what it actually has.
 *
 * Deliberately driven by PRAGMA table_info rather than by running ALTER TABLE
 * and swallowing the "duplicate column name" error: a blanket catch would hide
 * a REAL failure (disk full, locked, STRICT rejecting the type) behind the same
 * silence as the benign case, on the one operation that decides whether the
 * shop's existing bills remain readable.
 */
async function migrateColumns(
  tx: SqlTx,
  table: string,
  columns: readonly { name: string; ddl: string }[],
): Promise<string[]> {
  const existing = await tx.all<{ name: string }>(`PRAGMA table_info(${table})`);
  const have = new Set(existing.map((c) => c.name));
  const added: string[] = [];
  for (const col of columns) {
    if (have.has(col.name)) continue;
    // tx.run, not exec: SqlTx deliberately has no exec (driver.ts), because a
    // statement inside a transaction must not re-enter the connection lock the
    // transaction already holds.
    await tx.run(`ALTER TABLE ${table} ADD COLUMN ${col.ddl}`);
    added.push(`${table}.${col.name}`);
  }
  return added;
}

/**
 * Connection pragmas. ORDER MATTERS — busy_timeout MUST be first.
 *
 * Every later statement can need a lock, including the journal_mode switch
 * itself. With the default timeout of 0 a connection does not wait, it fails
 * immediately with SQLITE_BUSY, and on a WAL database that recovery contention
 * surfaces as errcode 261 (SQLITE_BUSY_RECOVERY). Proven the hard way in
 * Phase 2b: the WAL pragma ran before busy_timeout and threw "database is
 * locked" on 2 of 3 runs.
 */
export const CONNECTION_PRAGMAS: readonly string[] = [
  "PRAGMA busy_timeout = 5000",
  "PRAGMA journal_mode = WAL",
  "PRAGMA foreign_keys = ON",
  // H3 (ADVISOR-DECIDED 2026-10-23): a value NULLed or deleted is OVERWRITTEN, not left in the
  // page's free space. Measured on node:sqlite: without it a settled seller's dropped ID was still
  // readable in the file's bytes after its row said NULL (proveSellerIdLocal S6).
  "PRAGMA secure_delete = ON",
];

/**
 * Brings a fresh connection up: pragmas in order, then the schema and every
 * migration AS ONE TRANSACTION.
 *
 * Both stores share one connection and either may be opened first, so this is
 * idempotent (every statement is IF NOT EXISTS or a pragma) and lives in one
 * place — two copies of the pragma loop would be two chances to get the
 * busy_timeout ordering wrong.
 *
 * ---------------------------------------------------------------------------
 * WHY THE TRANSACTION, AND WHAT IT COSTS TO NOT HAVE ONE
 * ---------------------------------------------------------------------------
 * This ran as three bare loops of `exec` until P1.7 step 3. A process death
 * part-way through therefore left a HALF-MIGRATED database on disk that the
 * next launch resumed from wherever it had stopped — measured, not argued: a
 * SIGKILL after the 12th statement left seven tables, two indexes and thirteen
 * of twenty-six columns (proveMigration M2, which was written first and run
 * against this function BEFORE the wrapper was added, precisely so the red was
 * seen).
 *
 * On this box that is a bad afternoon. On the shop's handset it is unobservable:
 * the only signal is somebody saying the app will not open, and which statement
 * stopped it, which columns went in and which rows were backfilled cannot be
 * read by anyone — see ARCHITECTURE.md section 11. The requirement is therefore
 * a migration that CANNOT stop half-done, not one that can be repaired
 * afterwards, because there is no afterwards in which anyone knows.
 *
 * THE PRAGMAS STAY OUTSIDE IT, and that is not an oversight. `journal_mode`
 * cannot be changed inside a transaction at all, and `busy_timeout` must be in
 * force before anything can need a lock — including the BEGIN itself.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS PROVED, AND ON WHICH DRIVER — READ THIS BEFORE TRUSTING IT
 * ---------------------------------------------------------------------------
 * Atomicity here is proved at `a471dc2` AGAINST node:sqlite ONLY, by
 * proveMigration's M2: a child process SIGKILLed at four points inside this
 * function, the database reopened, and asserted to hold either the complete old
 * shape with every row at its original value or the complete new shape, never a
 * partial column set.
 *
 * THE SHA ABOVE READ `7b4f22d` UNTIL P1.7's login pass, and it was wrong — kept
 * here because the way it was wrong is the instructive part. `7b4f22d` is the
 * DOCS commit that designed this ownership scheme; it touched neither this file
 * nor the proof (`git show --stat 7b4f22d -- <either path>` is empty), so the
 * sentence pinned a measurement to a commit at which nothing had been measured.
 * It was written while the work was still uncommitted, when the only sha to hand
 * was the previous one. A claim can be pinned to a sha only AFTER the work
 * carrying it lands — before that there is no sha that means what the sentence
 * needs, and the nearest one is always the one that does not contain the work.
 *
 * THE HANDSET IS NOT COVERED BY THAT PROOF. `src/device/expoSqliteDriver.ts`
 * gets its transaction from `withExclusiveTransactionAsync`, which its own
 * header records as running on a SEPARATE CONNECTION isolated by SQLite's file
 * lock rather than by the JS mutex — a different mechanism, and that file cannot
 * run under node at all, so no proof on this box reaches it. That sentence is
 * about the PROOFS and is still true. What changed is below.
 *
 * SUPERSEDED 2026-08-12. The paragraph that stood here said the gap was
 * ACCEPTED "because the project has no route to a device pass today", and that
 * what was owed was a way to exercise this kill-and-reopen against the expo
 * driver on real hardware. Both were true when written and are now false. The
 * wording is recorded rather than deleted, because that owed thing is the entire
 * reason this project has a native build at all.
 *
 * PROVED ON — Android only. THIS PROJECT'S OWN DEBUG BUILD, the artefact built
 * at `9d2eb22` with applicationId `dev.chutipon.recycle`, on ONE handset (vivo
 * 1938). NOT through Expo Go, which could not have answered this: Expo Go is a
 * third-party release-signed app, so it runs neither our package nor a private
 * storage anything can read.
 *
 * HOW — a database seeded into the app's own storage in the pre-P1.7 shape
 * (local_bills at its original 10 columns, no local_identity, no local_shop, no
 * indexes) carrying 150,000 rows, so the O(N) statements INSIDE this transaction
 * — three index builds and the json_extract backfill — take tens of seconds and
 * open a window wide enough to aim at. The process was force-stopped TWICE, at
 * 4.5 MB and at 64.7 MB of WAL. A WAL only grows past its 32-byte header when a
 * transaction writes, so both kills were provably after BEGIN; the second landed
 * about four seconds before the commit that a no-kill control had timed. BOTH
 * reopens gave the COMPLETE OLD SHAPE — 6 tables, 0 indexes, 10 columns — with
 * all 150,000 rows at their original values, compared by SHA256 over
 * (id, payload_json, sync_state) fixed before the file ever left the box. The
 * no-kill control proved the same seed migrates fully, and a killed database
 * relaunched reached a file byte-identical to that control's.
 *
 * STILL NOT PROVED, and this half is not a formality:
 *   iOS HAS NEVER RUN THIS. A different SQLite build on a different filesystem,
 *     and no iOS pass has ever killed a migration. Nothing above reaches it.
 *   NO RELEASE BUILD EXISTS, so none of this is a statement about the artefact a
 *     shop would install.
 *   Two kill points in one window is not M2's four-point statement-level sweep,
 *     and `am force-stop` is not a SIGKILL between two named statements: WHICH
 *     statement was executing was never controlled, only that one was.
 */
export async function initConnection(db: SqlDriver): Promise<string[]> {
  for (const pragma of CONNECTION_PRAGMAS) await db.exec(pragma);
  return db.transaction(async (tx) => {
    for (const ddl of SCHEMA_STATEMENTS) await tx.run(ddl);
    const added = [
      ...(await migrateColumns(tx, "local_bills", ADDED_BILL_COLUMNS)),
      ...(await migrateColumns(tx, "local_draft", ADDED_DRAFT_COLUMNS)),
      ...(await migrateColumns(tx, "local_shop", ADDED_SHOP_COLUMNS)),
    ];
    for (const t of CACHE_TABLES) {
      added.push(...(await migrateColumns(tx, t, ADDED_CACHE_TENANT_COLUMN)));
    }
    added.push(...(await migrateColumns(tx, "cached_products", ADDED_PRODUCT_CATEGORY_COLUMNS)));
    added.push(...(await migrateColumns(tx, "cached_sellers", ADDED_SELLER_SEARCH_COLUMNS)));
    added.push(...(await migrateColumns(tx, "local_sellers", ADDED_LOCAL_SELLER_COLUMNS)));
    for (const ddl of POST_MIGRATION_STATEMENTS) await tx.run(ddl);
    await minimiseSettledSellerIds(tx);
    return added;
  });
}
