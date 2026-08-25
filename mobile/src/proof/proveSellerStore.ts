/**
 * P1.8b MOBILE (commit 1) proof: the DEVICE IDENTITY, the LOCAL SCHEMA, and the
 * two tables a locally created seller lives in.
 *
 * Run: npm run prove:sellerstore
 *
 * REAL FILES ON DISK, node:sqlite, one temp directory per case. Nothing here is
 * an in-memory fake: every criterion this file carries is about what SQLite
 * actually does to a database an upgraded handset is holding, and a fake would
 * be a second opinion about the thing under test.
 *
 * Sections are named for the criteria they carry
 * (`ROADMAP.md § P1.8`, "THE SELLER-KIND CRITERIA, DERIVED FROM THE DESIGN
 * ABOVE"):
 *
 *   S1  THE-DEVICE-IDENTITY-OUTLIVES-A-SIGN-OUT (all three cells, plus the
 *       named red case run as a live control)
 *   S2  THE-LOCAL-SCHEMA-ADDS-AND-DOES-NOT-REBUILD (all three cells, plus the
 *       rebuild the design forbids, staged so cell 1 is seen to go RED)
 *   S3  THE-LOCAL-ROW-SURVIVES-A-REFRESH-THAT-DELETES, cells 1 and 2 only
 *   S4  the holding: bound atomically, one code one seller, no owner predicate
 *   S5  the owner predicate on the SELLERS table, and the fail-closed direction
 *   S6  the boot sweep is REAL, and the stranded row is invisible before it runs
 *   S7  a refusal RETURNS the code; a 409 does NOT, and stays owed
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT COVER, SAID BEFORE ANYONE READS IT AS COMPLETE
 * ---------------------------------------------------------------------------
 * S3 carries cells 1 and 2 of its criterion and NOT cells 3 and 4: those ask
 * what the PICKER offers, and the picker's union of the cache with the
 * unsettled local rows is not built in this commit. Nothing here is evidence
 * about it.
 *
 * The KIND — its outcome union, its policy, its handler, its refill, its boot
 * recovery THROUGH the registry — is commit 2 and is proven there. What this
 * file establishes is the storage those things stand on, at the layer where a
 * wrong answer is a wrong row rather than a wrong classification.
 *
 * MONEY IS ABSENT FROM EVERY ASSERTION HERE because a seller carries none.
 * Stated so the absence is not read as an oversight beside the bill proofs,
 * where the decimal-string round trip is the first thing checked.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteDeviceStore } from "../adapters/sqlite/SqliteDeviceStore.js";
import { SqliteIdentityStore } from "../adapters/sqlite/SqliteIdentityStore.js";
import { SqliteLocalSellerStore } from "../adapters/sqlite/SqliteLocalSellerStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { SqliteMasterStore } from "../adapters/sqlite/SqliteMasterStore.js";
import { initConnection } from "../adapters/sqlite/schema.js";
import type { DeviceId, DeviceIdentityStore } from "../session/deviceIdentity.js";
import { signOut } from "../session/signOut.js";
import { MemoryTokenStore } from "../session/tokenStore.js";
import type { LocalSellerDraft } from "../sync/localSeller.js";
import type { IdSource, RowOwner } from "../sync/types.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const NOW = new Date("2026-08-25T09:00:00.000Z");
const LATER = new Date("2026-08-25T10:00:00.000Z");

const OWNER_A: RowOwner = {
  tenant_id: "11111111-1111-4111-8111-111111111111",
  user_id: "22222222-2222-4222-8222-222222222222",
};
/** Same shop, different person — the sharper wrong-identity case. */
const OWNER_B: RowOwner = {
  tenant_id: OWNER_A.tenant_id,
  user_id: "33333333-3333-4333-8333-333333333333",
};

const DRAFT: LocalSellerDraft = {
  name: "สมชาย ใจดี",
  phone: null,
  grade: null,
  id_number: null,
  address: null,
  vehicle_no: null,
};

/**
 * A deterministic v4-SHAPED id source.
 *
 * THE SHAPE IS NOT DECORATION. The server's `ReservationTopUp` declares
 * `device_id: uuid.UUID` and refuses anything else at the edge, so a device
 * whose id is not a UUID can never obtain a code. A proof that minted
 * `dev-1` would be green about a value the wire rejects.
 */
class UuidIds implements IdSource {
  private n = 0;
  constructor(private readonly tag: string) {}
  newId(): string {
    this.n += 1;
    const h = `${this.tag}${String(this.n)}`.padEnd(12, "0").slice(0, 12);
    return `00000000-0000-4000-8000-${h}`;
  }
}

interface Rig {
  driver: NodeSqliteDriver;
  bills: SqliteLocalStore;
  sellers: SqliteLocalSellerStore;
  device: SqliteDeviceStore;
  identity: SqliteIdentityStore;
  file: string;
  dir: string;
}

async function openRig(name: string, ids: IdSource): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), `recycle-p18b-${name}-`));
  const file = join(dir, "bills.db");
  return reopen(file, dir, ids);
}

async function reopen(file: string, dir: string, ids: IdSource): Promise<Rig> {
  const driver = NodeSqliteDriver.open(file);
  const bills = await SqliteLocalStore.open(driver);
  return {
    driver,
    bills,
    sellers: SqliteLocalSellerStore.open(driver),
    device: new SqliteDeviceStore(driver, ids),
    identity: new SqliteIdentityStore(driver),
    file,
    dir,
  };
}

async function closeRig(r: Rig): Promise<void> {
  await r.driver.close();
}

function dispose(dir: string): void {
  // Windows refuses to remove a directory holding an open file, so every
  // caller closes its driver before reaching here.
  rmSync(dir, { recursive: true, force: true });
}

/** One reservation as the refill route hands it over. */
function issued(n: number): { code: string; token: string } {
  return { code: `S${String(100 + n)}`, token: `tok-${String(n)}-${"x".repeat(30)}` };
}

/* ------------------------------------------------------------------ S1 --- */

/**
 * The identity kept where the design says it must NOT be, so cell 1 has
 * something to be evidence AGAINST.
 *
 * `THE-DEVICE-IDENTITY-OUTLIVES-A-SIGN-OUT` names this red case: "the identity
 * kept beside the token in the keystore, which passes every reading taken
 * inside one signed-in session and loses the device's whole holding at the
 * first sign-out". Run here rather than described, because within a session the
 * two storages are indistinguishable and only the sign-out separates them.
 */
class KeystoreDeviceStore implements DeviceIdentityStore {
  constructor(
    private readonly tokens: MemoryTokenStore,
    private readonly ids: IdSource,
  ) {}
  async load(): Promise<DeviceId | null> {
    // Modelled exactly as the red case is written: the id lives beside the
    // token, so it is present iff the token is.
    return (await this.tokens.load()) === null ? null : this.minted;
  }
  private minted: string | null = null;
  async ensure(_now: Date): Promise<DeviceId> {
    if (this.minted === null) this.minted = this.ids.newId();
    await this.tokens.save("a-token");
    return this.minted;
  }
}

async function s1DeviceIdentityOutlivesSignOut(): Promise<void> {
  header("S1: THE-DEVICE-IDENTITY-OUTLIVES-A-SIGN-OUT");
  const r = await openRig("s1", new UuidIds("aa"));
  try {
    const before = await r.device.ensure(NOW);
    await r.sellers.saveReservations([issued(1), issued(2)], NOW);

    const tokens = new MemoryTokenStore("a-live-token");
    const outcome = await signOut({
      pending: 0,
      failed: 0,
      setSyncPaused: () => undefined,
      tokens,
      engine: null,
    });
    check("the sign-out actually completed (staging control)", outcome.kind === "signed_out",
      `kind=${outcome.kind}`);

    const after = await r.device.load();
    const keystoreAfter = await tokens.load();
    // CELL 1, WITH ITS PRESENCE SIBLING IN THE SAME RUN. "Equal before and
    // after" is satisfied by a sign-out that did nothing at all, so the entry
    // the sign-out DOES delete is read in the same breath.
    check(
      "1. the device identity is UNCHANGED across a sign-out",
      after !== null && after === before,
      `before=${before} after=${String(after)}`,
    );
    check(
      "1. presence sibling: the keystore entry the sign-out DOES delete is gone",
      keystoreAfter === null,
      `keystore=${String(keystoreAfter)}`,
    );

    // CELL 2 — the holding is still readable and still SPENDABLE. Readable
    // alone would be satisfied by rows nothing can use.
    const held = await r.sellers.listReservations();
    const spendable = await r.sellers.spendableCount();
    check(
      "2. the reserved codes are still readable after the sign-out",
      held.length === 2,
      `held=${String(held.length)}`,
    );
    check(
      "2. and still SPENDABLE",
      spendable === 2,
      `spendable=${String(spendable)}`,
    );

    // CELL 3 — minted ONCE. A genuine close-and-reopen of the same file, not a
    // second read on the same connection.
    await closeRig(r);
    const r2 = await reopen(r.file, r.dir, new UuidIds("bb"));
    const reread = await r2.device.ensure(LATER);
    const rows = await r2.driver.all<{ n: number }>("SELECT COUNT(*) AS n FROM local_device");
    check(
      "3. a second open of the same database returns the SAME identity",
      reread === before,
      `first=${before} second=${reread}`,
    );
    check(
      "3. and no second row exists",
      rows[0]?.n === 1,
      `rows=${String(rows[0]?.n)}`,
    );
    await closeRig(r2);

    /*
     * THE NAMED RED CASE, RUN. Same sign-out, same assertion, identity in the
     * keystore. The cell must go RED here or it is not measuring the storage
     * choice at all — it would be measuring that sign-out does not happen to
     * touch SQLite, which is a fact about a different file.
     */
    const redTokens = new MemoryTokenStore(null);
    const red = new KeystoreDeviceStore(redTokens, new UuidIds("cc"));
    const redBefore = await red.ensure(NOW);
    await signOut({
      pending: 0,
      failed: 0,
      setSyncPaused: () => undefined,
      tokens: redTokens,
      engine: null,
    });
    const redAfter = await red.load();
    check(
      "CONTROL: with the identity in the KEYSTORE, cell 1's assertion FAILS",
      redAfter === null,
      `before=${redBefore} after=${String(redAfter)} (null is the control PASSING)`,
    );
  } finally {
    dispose(r.dir);
  }
}

/* ------------------------------------------------------------------ S2 --- */

/**
 * `local_bills` EXACTLY as it shipped, before ANY of ADDED_BILL_COLUMNS
 * existed — transcribed from proveMigration's own staging, which is what an
 * upgraded handset actually holds.
 *
 * STAGED BY HAND RATHER THAN DERIVED FROM THE CURRENT SHAPE, and that is the
 * whole reason this cell is not vacuous. Producing the "before" by dropping the
 * two new columns from the "after" would make the CHECK identical BY
 * CONSTRUCTION, and the equality would then measure nothing.
 */
const OLD_BILLS_DDL = `CREATE TABLE local_bills (
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
   CHECK (sync_state IN ('pending', 'syncing', 'synced', 'failed'))
 ) STRICT`;

/**
 * The member set of a `CHECK (<column> IN (...))`, read out of whatever DDL
 * text it is handed.
 *
 * READ FROM `sqlite_master` AND NEVER FROM THE SOURCE FILE, which is the
 * criterion's own demand: the source is what the author intended and the live
 * schema is what the database is holding, and a rebuild changes the second
 * without touching the first.
 */
function checkMembers(sql: string, column: string): string[] {
  const clause = new RegExp(`CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([^)]*)\\)`, "i").exec(sql);
  const body = clause?.[1];
  if (body === undefined) return [];
  const out: string[] = [];
  for (const m of body.matchAll(/'([^']*)'/g)) {
    const v = m[1];
    if (v !== undefined) out.push(v);
  }
  return out.sort();
}

async function tableSql(driver: NodeSqliteDriver, name: string): Promise<string> {
  const rows = await driver.all<{ sql: string | null }>(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?",
    [name],
  );
  return rows[0]?.sql ?? "";
}

async function s2SchemaAddsAndDoesNotRebuild(): Promise<void> {
  header("S2: THE-LOCAL-SCHEMA-ADDS-AND-DOES-NOT-REBUILD");
  const dir = mkdtempSync(join(tmpdir(), "recycle-p18b-s2-"));
  const file = join(dir, "bills.db");
  const driver = NodeSqliteDriver.open(file);
  try {
    // STAGING: a database at the PREVIOUS schema version, holding unsynced
    // bills — the state an upgraded handset is actually in.
    await driver.exec("PRAGMA busy_timeout = 5000");
    await driver.exec(OLD_BILLS_DDL);
    for (const id of ["old-1", "old-2"]) {
      await driver.run(
        "INSERT INTO local_bills (id, idempotency_key, payload_json, sync_state," +
          " attempt_count, created_at, next_attempt_at)" +
          " VALUES (?, ?, ?, 'pending', 0, ?, ?)",
        [id, `key-${id}`, JSON.stringify({ id }), NOW.toISOString(), NOW.toISOString()],
      );
    }
    const membersBefore = checkMembers(await tableSql(driver, "local_bills"), "sync_state");
    check(
      "staging control: the OLD table really carries the four-member CHECK",
      membersBefore.length === 4,
      `before=${membersBefore.join(",")}`,
    );

    // THE UPGRADE, through the real migrator and nothing else.
    const added = await initConnection(driver);
    console.log(`  migrator added: ${added.join(", ")}`);

    // CELL 1 — EQUALITY, never containment. A rebuild that ADDED a state passes
    // a containment test and is exactly what the design forbids.
    const membersAfter = checkMembers(await tableSql(driver, "local_bills"), "sync_state");
    const equal =
      membersAfter.length === membersBefore.length &&
      membersAfter.every((m, i) => m === membersBefore[i]);
    check(
      "1. local_bills's CHECK member set is EQUAL before and after, read off the LIVE schema",
      equal,
      `before=[${membersBefore.join(",")}] after=[${membersAfter.join(",")}]`,
    );

    // CELL 2 — the rows survived, still owed, and the new columns are there and
    // null. Without the presence sibling, cell 2 is satisfied by a migration
    // that did nothing at all.
    const rows = await driver.all<{
      id: string;
      sync_state: string;
      local_seller_id: string | null;
      local_seller_parked_at: string | null;
    }>(
      "SELECT id, sync_state, local_seller_id, local_seller_parked_at" +
        " FROM local_bills ORDER BY id",
    );
    check(
      "2. the rows owed before the upgrade are still present and still owed",
      rows.length === 2 && rows.every((x) => x.sync_state === "pending"),
      `rows=${String(rows.length)} states=${rows.map((x) => x.sync_state).join(",")}`,
    );
    check(
      "2. presence sibling: the new park columns exist on those rows and are NULL",
      rows.every((x) => x.local_seller_id === null && x.local_seller_parked_at === null),
      `values=${rows.map((x) => `${String(x.local_seller_id)}/${String(x.local_seller_parked_at)}`).join(" ")}`,
    );

    // CELL 3 — the new table's own CHECK, asserted as a set.
    const sellerMembers = checkMembers(await tableSql(driver, "local_sellers"), "sync_state");
    check(
      "3. local_sellers carries its own CHECK, created WITH the table",
      sellerMembers.join(",") === "failed,pending,synced,syncing",
      `members=[${sellerMembers.join(",")}]`,
    );

    /*
     * THE NAMED RED CASE, STAGED SO CELL 1 IS SEEN TO GO RED. The design
     * forbids rebuilding local_bills to widen its CHECK; a rebuild that copies
     * rows correctly passes cell 2 completely, so cell 1's equality is the only
     * thing that can see it. NAMED BEFORE RUNNING: the cell read here is cell 1
     * and not the count of failures.
     */
    await driver.exec(
      "CREATE TABLE rebuilt_bills (" +
        " id TEXT NOT NULL PRIMARY KEY, sync_state TEXT NOT NULL," +
        " CHECK (sync_state IN ('pending', 'syncing', 'synced', 'failed', 'awaiting_seller'))" +
        ") STRICT",
    );
    const rebuiltMembers = checkMembers(await tableSql(driver, "rebuilt_bills"), "sync_state");
    const rebuiltEqual =
      rebuiltMembers.length === membersBefore.length &&
      rebuiltMembers.every((m, i) => m === membersBefore[i]);
    check(
      "CONTROL: against a table rebuilt with a WIDENED check, cell 1's equality FAILS",
      !rebuiltEqual,
      `widened=[${rebuiltMembers.join(",")}] (a FAILED equality is the control PASSING)`,
    );
    check(
      "CONTROL: and a CONTAINMENT test would have passed it — which is why cell 1 is equality",
      membersBefore.every((m) => rebuiltMembers.includes(m)),
      "every old member is present in the widened set",
    );
  } finally {
    await driver.close();
    dispose(dir);
  }
}

/* ------------------------------------------------------------------ S3 --- */

async function s3LocalRowSurvivesARefreshThatDeletes(): Promise<void> {
  header("S3: THE-LOCAL-ROW-SURVIVES-A-REFRESH-THAT-DELETES (cells 1 and 2)");
  const r = await openRig("s3", new UuidIds("dd"));
  try {
    await r.identity.save(OWNER_A, NOW);
    const master = await SqliteMasterStore.open(r.driver);
    await r.sellers.saveReservations([issued(1)], NOW);
    const made = await r.sellers.createLocalSeller(DRAFT, OWNER_A, "local-seller-1", NOW);
    check("staging: the local seller was created", made.kind === "created");

    // A DECOY straight into the cache, so cell 2 has something whose
    // disappearance proves the DELETE ran.
    await r.driver.run(
      "INSERT INTO cached_sellers (id, code, name, phone, grade, owner_tenant_id)" +
        " VALUES ('decoy', 'S900', 'decoy', NULL, NULL, ?)",
      [OWNER_A.tenant_id],
    );

    // The refresh, through the real store, with a payload containing NEITHER
    // the decoy nor the local row.
    await master.saveSellers(
      [{ id: "server-1", code: "S001", name: "จากเซิร์ฟเวอร์", phone: null, grade: "A" }],
      LATER.toISOString(),
    );

    // CELL 1
    const stillThere = await r.sellers.getLocalSeller("local-seller-1");
    const owed = await r.sellers.countSellersOwed();
    check(
      "1. the local row still exists after the refresh",
      stillThere !== null,
      `row=${stillThere === null ? "gone" : stillThere.id}`,
    );
    check("1. and is still OWED", owed === 1, `owed=${String(owed)}`);

    // CELL 2 — cell 1's presence sibling rather than a separate check: without
    // this pair, cell 1 is satisfied by a refresh that did nothing at all.
    const cached = await r.driver.all<{ id: string }>(
      "SELECT id FROM cached_sellers ORDER BY id",
    );
    const ids = cached.map((x) => x.id);
    check(
      "2. THE DELETE STILL RUNS: the decoy is GONE after the refresh",
      !ids.includes("decoy"),
      `cached=[${ids.join(",")}]`,
    );
    check(
      "2. and a seller that WAS in the payload is present, in the same read",
      ids.includes("server-1"),
      `cached=[${ids.join(",")}]`,
    );
    check(
      "2. the local row is NOT in cached_sellers at all — it never enters that table",
      !ids.includes("local-seller-1"),
      `cached=[${ids.join(",")}]`,
    );
  } finally {
    await closeRig(r);
    dispose(r.dir);
  }
}

/* ------------------------------------------------------------------ S4 --- */

async function s4TheHolding(): Promise<void> {
  header("S4: the holding — bound atomically, one code one seller, no owner predicate");
  const r = await openRig("s4", new UuidIds("ee"));
  try {
    await r.identity.save(OWNER_A, NOW);

    // A REPEATED REFILL ANSWER. The route returns the device's WHOLE holding on
    // every call, so the second save is the ordinary case and not an edge one.
    const first = await r.sellers.saveReservations([issued(1), issued(2)], NOW);
    const second = await r.sellers.saveReservations([issued(1), issued(2), issued(3)], LATER);
    check("a first refill answer stores every code", first === 2, `added=${String(first)}`);
    check(
      "a REPEAT answer adds only what is new — the rest is DO NOTHING",
      second === 1,
      `added=${String(second)}`,
    );

    const made = await r.sellers.createLocalSeller(DRAFT, OWNER_A, "ls-1", NOW);
    check("a create binds a code", made.kind === "created");
    const bound = made.kind === "created" ? made.seller.code : "";
    check(
      "the seller carries the code AND its token — the pair, never the code alone",
      made.kind === "created" &&
        made.seller.reservation_token.length > 0 &&
        made.seller.code.length > 0,
      made.kind === "created" ? `code=${made.seller.code}` : "not created",
    );
    check(
      "spendable dropped by exactly one",
      (await r.sellers.spendableCount()) === 2,
      `spendable=${String(await r.sellers.spendableCount())}`,
    );

    // THE BIND SURVIVES A REPEAT REFILL. This is the DO-NOTHING classification
    // being measured rather than asserted: a set-list on `spent_on` would
    // unbind this code and the next create would pick it again — two sellers,
    // one code, no error anywhere.
    await r.sellers.saveReservations([issued(1), issued(2), issued(3)], LATER);
    const afterRefill = await r.sellers.listReservations();
    const boundRow = afterRefill.find((c) => c.code === bound);
    check(
      "a later refill answer does NOT unbind a code already spent locally",
      boundRow?.spent_on === "ls-1",
      `spent_on=${String(boundRow?.spent_on)}`,
    );

    // ONE CODE, ONE SELLER — asserted by exhausting the holding rather than by
    // reading the index definition.
    await r.sellers.createLocalSeller(DRAFT, OWNER_A, "ls-2", NOW);
    await r.sellers.createLocalSeller(DRAFT, OWNER_A, "ls-3", NOW);
    const codes = await r.sellers.listReservations();
    const spentOn = codes.map((c) => c.spent_on).filter((x): x is string => x !== null);
    check(
      "three creates bound three DISTINCT codes",
      new Set(spentOn).size === 3 && spentOn.length === 3,
      `bound=[${spentOn.join(",")}]`,
    );

    // THE REFUSAL. A device with an empty holding cannot create a walk-in
    // offline, and it must not invent a code to get around that.
    const refused = await r.sellers.createLocalSeller(DRAFT, OWNER_A, "ls-4", NOW);
    check(
      "with the holding exhausted the create is REFUSED, by cause and not by null",
      refused.kind === "refused" && refused.refusal.kind === "no_code",
      `kind=${refused.kind}`,
    );
    check(
      "and NO fourth seller row was written",
      (await r.sellers.getLocalSeller("ls-4")) === null,
    );

    /*
     * NO OWNER PREDICATE ON THE CODES, and this is the cell that keeps a future
     * sweep from adding one. The holder is a DEVICE: sign in as somebody else
     * and the same holding must still be there and still spendable, because
     * nothing re-issues a reservation and a hidden code is a lost code.
     */
    await r.identity.save(OWNER_B, LATER);
    check(
      "under a DIFFERENT identity the device's holding is unchanged and still spendable",
      (await r.sellers.spendableCount()) === 0 && (await r.sellers.listReservations()).length === 3,
      `spendable=${String(await r.sellers.spendableCount())} held=${String((await r.sellers.listReservations()).length)}`,
    );
    await r.sellers.saveReservations([issued(9)], LATER);
    check(
      "presence sibling: a code received under B is spendable, so the count is not stuck at zero",
      (await r.sellers.spendableCount()) === 1,
      `spendable=${String(await r.sellers.spendableCount())}`,
    );
  } finally {
    await closeRig(r);
    dispose(r.dir);
  }
}

/* ------------------------------------------------------------------ S5 --- */

async function s5TheOwnerPredicateOnSellers(): Promise<void> {
  header("S5: OWED-ASKS-WHO-CREATED-THE-SELLER — the store half");
  const r = await openRig("s5", new UuidIds("ff"));
  try {
    await r.sellers.saveReservations([issued(1), issued(2)], NOW);

    await r.identity.save(OWNER_A, NOW);
    await r.sellers.createLocalSeller(DRAFT, OWNER_A, "by-a", NOW);
    await r.identity.save(OWNER_B, NOW);
    await r.sellers.createLocalSeller(DRAFT, OWNER_B, "by-b", NOW);

    // CELL 1 — an absence WITH its presence sibling in the same call. "A's
    // seller is returned" and "B's is not" are one read, so a query that
    // returned nothing could not satisfy both.
    await r.identity.save(OWNER_A, LATER);
    const forA = await r.sellers.listSellersToCreate(LATER, 10);
    const idsForA = forA.map((s) => s.id);
    check(
      "1. with A signed in, owed() returns A's seller and NOT B's",
      idsForA.includes("by-a") && !idsForA.includes("by-b"),
      `owed=[${idsForA.join(",")}]`,
    );
    check(
      "1. and the COUNT agrees with the list",
      (await r.sellers.countSellersOwed()) === 1,
      `count=${String(await r.sellers.countSellersOwed())}`,
    );

    // The other direction, so the filter is not merely "returns one row".
    await r.identity.save(OWNER_B, LATER);
    const forB = (await r.sellers.listSellersToCreate(LATER, 10)).map((s) => s.id);
    check(
      "1. with B signed in the answer is B's seller and not A's — the filter is directional",
      forB.includes("by-b") && !forB.includes("by-a"),
      `owed=[${forB.join(",")}]`,
    );

    // CELL 2 — the fail-closed direction.
    await r.identity.clear();
    const none = await r.sellers.listSellersToCreate(LATER, 10);
    check(
      "2. with NO identity stored, owed() is EMPTY — the fail-closed direction",
      none.length === 0,
      `owed=${String(none.length)}`,
    );
    check(
      "2. presence sibling: the two rows are still ON DISK, so the emptiness is the FILTER",
      (await r.driver.all<{ n: number }>("SELECT COUNT(*) AS n FROM local_sellers"))[0]?.n === 2,
      "unfiltered row count",
    );
  } finally {
    await closeRig(r);
    dispose(r.dir);
  }
}

/* ------------------------------------------------------------------ S6 --- */

async function s6TheBootSweepIsReal(): Promise<void> {
  header("S6: the boot sweep is REAL, and the stranded row is invisible before it runs");
  const r = await openRig("s6", new UuidIds("gg"));
  try {
    await r.identity.save(OWNER_A, NOW);
    await r.sellers.saveReservations([issued(1), issued(2)], NOW);
    await r.sellers.createLocalSeller(DRAFT, OWNER_A, "stranded", NOW);
    await r.sellers.createLocalSeller(DRAFT, OWNER_A, "untouched", NOW);

    const claimed = await r.sellers.claimSellerCreate("stranded", NOW);
    check("staging: the row was claimed, so its in-flight state is DURABLE", claimed);

    /*
     * THE HALF THE LESSON SAYS IS USUALLY MISSING. sync-state-needs-startup-
     * recovery: "assert that the stranded record is INVISIBLE to the sender
     * BEFORE recovery runs, not only that recovery works." A proof that only
     * checks recovery cannot tell a real sweep from a queue that would have
     * picked the row up anyway.
     */
    const beforeRecovery = (await r.sellers.listSellersToCreate(LATER, 10)).map((s) => s.id);
    check(
      "BEFORE recovery the stranded row is invisible to the queue — nothing else would ever see it",
      !beforeRecovery.includes("stranded"),
      `owed=[${beforeRecovery.join(",")}]`,
    );
    check(
      "BEFORE recovery it is nonetheless still OWED, so the device does not claim the work is done",
      (await r.sellers.countSellersOwed()) === 2,
      `owedCount=${String(await r.sellers.countSellersOwed())}`,
    );

    // A REAL restart: the connection is closed and the file reopened.
    await closeRig(r);
    const r2 = await reopen(r.file, r.dir, new UuidIds("hh"));
    const swept = await r2.sellers.resetSyncingSellersToPending(LATER);

    // EQUALITY, never containment. A sweep that returned every owed row rather
    // than the stranded ones passes containment and is wrong.
    check(
      "the swept id set EQUALS the set that was in flight",
      swept.length === 1 && swept[0] === "stranded",
      `swept=[${swept.join(",")}]`,
    );
    check(
      "presence sibling on the other side of that equality: the row that was NOT in flight is absent from the sweep",
      !swept.includes("untouched"),
      `swept=[${swept.join(",")}]`,
    );
    const afterRecovery = (await r2.sellers.listSellersToCreate(LATER, 10)).map((s) => s.id);
    check(
      "and the stranded row is attemptable again",
      afterRecovery.includes("stranded"),
      `owed=[${afterRecovery.join(",")}]`,
    );

    // THE NAMED RED CASE. `recover` returning an empty array is the void kind's
    // correct answer copied into a kind that has durable state; it satisfies a
    // key-set cell completely and leaves the row stranded for ever.
    check(
      "CONTROL: an EMPTY sweep would have left the row invisible — the two are distinguishable here",
      swept.length !== 0,
      "a non-empty sweep is what separates a real recover from a no-op",
    );
    await closeRig(r2);
  } finally {
    dispose(r.dir);
  }
}

/* ------------------------------------------------------------------ S7 --- */

async function s7RefusalReturnsTheCodeAnd409DoesNot(): Promise<void> {
  header("S7: a refusal RETURNS the code; a 409 does NOT, and stays owed");
  const r = await openRig("s7", new UuidIds("ii"));
  try {
    await r.identity.save(OWNER_A, NOW);
    await r.sellers.saveReservations([issued(1), issued(2), issued(3)], NOW);
    await r.sellers.createLocalSeller(DRAFT, OWNER_A, "refused", NOW);
    await r.sellers.createLocalSeller(DRAFT, OWNER_A, "reviewed", NOW);
    await r.sellers.createLocalSeller(DRAFT, OWNER_A, "settled", NOW);
    check(
      "staging: three codes bound, none spendable",
      (await r.sellers.spendableCount()) === 0,
      `spendable=${String(await r.sellers.spendableCount())}`,
    );

    // A refusal the device READ, on the payload's own merits.
    await r.sellers.markSellerCreateRefused("refused", "422 name too long", 1, LATER);
    check(
      "a terminally refused create RETURNS its code to the spendable holding",
      (await r.sellers.spendableCount()) === 1,
      `spendable=${String(await r.sellers.spendableCount())}`,
    );
    check(
      "and the row itself is terminal",
      (await r.sellers.getLocalSeller("refused"))?.sync_state === "failed",
      `state=${String((await r.sellers.getLocalSeller("refused"))?.sync_state)}`,
    );
    check(
      "and it is no longer owed",
      (await r.sellers.countSellersOwed()) === 2,
      `owed=${String(await r.sellers.countSellersOwed())}`,
    );

    // A 409 — an unreachable state that has been reached.
    await r.sellers.markSellerCreateNeedsReview("reviewed", "duplicate_code", "409", 1, LATER);
    check(
      "a 409 does NOT return its code — the server may hold a row under it",
      (await r.sellers.spendableCount()) === 1,
      `spendable=${String(await r.sellers.spendableCount())}`,
    );
    check(
      "the reviewed row is OUT of the actionable queue, so nothing re-asks a settled question",
      !(await r.sellers.listSellersToCreate(LATER, 10)).map((s) => s.id).includes("reviewed"),
    );
    check(
      "AND IT IS STILL OWED — the cell that separates needs_review from terminal",
      (await r.sellers.countSellersOwed()) === 2,
      `owed=${String(await r.sellers.countSellersOwed())}`,
    );
    check(
      "presence sibling: it carries NO server seller id",
      (await r.sellers.getLocalSeller("reviewed"))?.server_seller_id === null,
    );

    // A settle, as the third arm — so "still owed" above is not satisfied by a
    // store that never removes anything.
    await r.sellers.markSellerCreated("settled", "server-uuid-1", 1, LATER);
    check(
      "presence sibling for the pair above: a SETTLED create leaves the owed count",
      (await r.sellers.countSellersOwed()) === 1,
      `owed=${String(await r.sellers.countSellersOwed())}`,
    );
    check(
      "and carries the SERVER's id, which is what the local row BECAME",
      (await r.sellers.getLocalSeller("settled"))?.server_seller_id === "server-uuid-1",
    );
    check(
      "a settled create does NOT return its code",
      (await r.sellers.spendableCount()) === 1,
      `spendable=${String(await r.sellers.spendableCount())}`,
    );

    // An unknown outcome returns nothing and keeps the row owed — the third
    // class of unavailable-is-not-rejected, at the storage layer.
    await r.sellers.markSellerCreateAttemptFailed("reviewed", "offline", 2, LATER);
    check(
      "an UNKNOWN outcome returns no code either — only a refusal the device READ does",
      (await r.sellers.spendableCount()) === 1,
      `spendable=${String(await r.sellers.spendableCount())}`,
    );
  } finally {
    await closeRig(r);
    dispose(r.dir);
  }
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("P1.8b MOBILE (commit 1) — the device identity and the local schema");
  console.log(`node ${process.version}; node:sqlite, real files, one temp dir per case`);

  await s1DeviceIdentityOutlivesSignOut();
  await s2SchemaAddsAndDoesNotRebuild();
  await s3LocalRowSurvivesARefreshThatDeletes();
  await s4TheHolding();
  await s5TheOwnerPredicateOnSellers();
  await s6TheBootSweepIsReal();
  await s7RefusalReturnsTheCodeAnd409DoesNot();

  console.log("");
  console.log(
    failures === 0 ? "ALL SELLER-STORE CASES PASSED" : `FAILED — ${String(failures)} check(s)`,
  );
  return failures === 0 ? 0 : 1;
}

/*
 * PRESET TO RED, per lessons/a-default-exit-code-is-a-default-verdict.md. An
 * unsettled top-level await is not an error on node: the event loop drains and
 * the process exits with the DEFAULT code, which is 0 — so a run that stalls
 * mid-proof prints no exit line and reports GREEN. With the code preset, any
 * end other than main() completing exits 1, and the exit line's ABSENCE is
 * BACKED by a red status instead of contradicted by a green one.
 */
process.exitCode = 1;

main()
  .then((code) => {
    console.log(`SELLERSTORE_EXIT=${String(code)}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("SELLER-STORE PROOF CRASHED:", err);
    console.log("SELLERSTORE_EXIT=1");
    process.exitCode = 1;
  });
