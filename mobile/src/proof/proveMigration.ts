/**
 * P1.7 proof: the schema migration is ATOMIC, the identity store outlives the
 * token, and a login records who signed in ONLY when the server accepted them.
 *
 * Run: npm run prove:migration
 *
 * M2 injects a REAL crash — a child process SIGKILLed part-way through
 * initConnection — because a half-migrated database is the failure mode this
 * whole step exists to prevent, and it is silent: the phone either opens or it
 * does not, and no one can look inside it to find out which statement stopped
 * (ARCHITECTURE.md section 11).
 *
 * WHAT THIS PROOF DOES NOT ESTABLISH. It runs against node:sqlite. The handset
 * runs expo-sqlite, whose transaction is a different mechanism on a different
 * connection (src/device/expoSqliteDriver.ts). THIS FILE proves atomicity for
 * the driver the proofs run and for no other, and that has not changed.
 *
 * WHAT NOW COVERS THE OTHER DRIVER, so this header is not read as the whole
 * story: a DEVICE pass on 2026-08-12, Android only, on this project's own debug
 * build (`9d2eb22`, applicationId `dev.chutipon.recycle`) on one handset — never
 * through Expo Go, which runs a third party's package. It force-stopped the app
 * twice inside a widened migration window and got the complete old shape both
 * times, rows intact. STILL UNPROVED THERE: iOS has never run it, no release
 * build exists, and the kill could not be aimed at a NAMED statement the way M2
 * aims here. The two are complements: M2 has statement-level precision on the
 * wrong driver, the device pass has the right driver at coarse resolution.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteIdentityStore } from "../adapters/sqlite/SqliteIdentityStore.js";
import { initConnection } from "../adapters/sqlite/schema.js";
import { signInAndRecord } from "../session/signInIdentity.js";
import type { SignInResult } from "../session/signInIdentity.js";
import { MemoryTokenStore } from "../session/tokenStore.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function tempDir(name: string): string {
  return mkdtempSync(join(tmpdir(), `recycle-p17-${name}-`));
}

const ISO = "2026-08-11T00:00:00.000Z";

/**
 * local_bills EXACTLY as it shipped, before any of the ADDED_BILL_COLUMNS
 * existed. This is what an upgraded handset actually holds, and staging it by
 * hand is the only way to make the migration do work: a fresh initConnection
 * creates the current shape and has nothing left to alter.
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

interface SeedRow {
  id: string;
  idempotency_key: string;
  sync_state: string;
  attempt_count: number;
  last_error: string | null;
  doc_no: string | null;
}

/** Recorded BEFORE the migration so "survived" is checked value by value. */
const SEED: readonly SeedRow[] = [
  {
    id: "bill-1",
    idempotency_key: "idem-1",
    sync_state: "pending",
    attempt_count: 3,
    last_error: "network: Network request failed",
    doc_no: null,
  },
  {
    id: "bill-2",
    idempotency_key: "idem-2",
    sync_state: "synced",
    attempt_count: 1,
    last_error: null,
    doc_no: "B-2569-7",
  },
];

const PAYLOAD = `{"id":"bill-1","seller_id":"seller-1","vehicle_no":"70-1234","device_created_at":"${ISO}","idempotency_key":"idem-1","items":[],"total_amount":"90.00"}`;

/** Stages an upgraded device's database: old-shape table, rows already in it. */
async function stageOldShape(file: string): Promise<void> {
  const d = NodeSqliteDriver.open(file);
  await d.exec("PRAGMA busy_timeout = 5000");
  await d.exec(OLD_BILLS_DDL);
  for (const r of SEED) {
    await d.run(
      `INSERT INTO local_bills (id, idempotency_key, payload_json, sync_state,
         attempt_count, last_error, created_at, next_attempt_at, doc_no)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [r.id, r.idempotency_key, PAYLOAD, r.sync_state, r.attempt_count, r.last_error, ISO, ISO, r.doc_no],
    );
  }
  await d.close();
}

interface Shape {
  tables: string[];
  indexes: string[];
  billColumns: string[];
  draftColumns: string[];
  cacheColumns: Record<string, string[]>;
  integrity: string;
}

async function readShape(file: string): Promise<Shape> {
  const d = NodeSqliteDriver.open(file);
  const objs = await d.all<{ name: string; type: string }>(
    "SELECT name, type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const cols = async (t: string): Promise<string[]> => {
    const rows = await d.all<{ name: string }>(`PRAGMA table_info(${t})`);
    return rows.map((r) => r.name);
  };
  const tables = objs.filter((o) => o.type === "table").map((o) => o.name);
  const cacheColumns: Record<string, string[]> = {};
  for (const t of ["master_cache", "cached_products", "cached_sellers"]) {
    cacheColumns[t] = tables.includes(t) ? await cols(t) : [];
  }
  const integrityRow = await d.all<{ integrity_check: string }>("PRAGMA integrity_check");
  const shape: Shape = {
    tables,
    indexes: objs.filter((o) => o.type === "index").map((o) => o.name),
    billColumns: tables.includes("local_bills") ? await cols("local_bills") : [],
    draftColumns: tables.includes("local_draft") ? await cols("local_draft") : [],
    cacheColumns,
    integrity: integrityRow[0]?.integrity_check ?? "(none)",
  };
  await d.close();
  return shape;
}

async function readRows(file: string): Promise<SeedRow[]> {
  const d = NodeSqliteDriver.open(file);
  const rows = await d.all<SeedRow>(
    `SELECT id, idempotency_key, sync_state, attempt_count, last_error, doc_no
       FROM local_bills ORDER BY id`,
  );
  await d.close();
  return rows;
}

function sameShape(a: Shape, b: Shape): boolean {
  return JSON.stringify({ ...a, integrity: "" }) === JSON.stringify({ ...b, integrity: "" });
}

function rowsIntact(after: readonly SeedRow[]): boolean {
  if (after.length !== SEED.length) return false;
  for (const want of SEED) {
    const got = after.find((r) => r.id === want.id);
    if (got === undefined) return false;
    for (const k of Object.keys(want) as (keyof SeedRow)[]) {
      if (got[k] !== want[k]) return false;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ M1 ---- */

/**
 * The migration on a POPULATED table: column list before and after, row values
 * field by field. Also produces the REFERENCE shape M2 compares against — taken
 * from a completed run of the code under test rather than duplicated here,
 * because M2's question is "did the kill leave something partial", not "is the
 * target shape right", and a hand-copied target would drift.
 */
async function m1MigrateAPopulatedTable(): Promise<{ ref: Shape; dir: string }> {
  header("M1 — the migration adds owner columns to a table that already holds rows");
  const dir = tempDir("m1");
  const file = join(dir, "m1.db");
  await stageOldShape(file);

  const before = await readShape(file);
  const rowsBefore = await readRows(file);
  console.log(`  columns BEFORE (${String(before.billColumns.length)}): ${before.billColumns.join(",")}`);
  console.log(`  rows BEFORE: ${JSON.stringify(rowsBefore)}`);

  const d = NodeSqliteDriver.open(file);
  const added = await initConnection(d);
  await d.close();
  console.log(`  initConnection added: ${JSON.stringify(added)}`);

  const after = await readShape(file);
  const rowsAfter = await readRows(file);
  console.log(`  columns AFTER  (${String(after.billColumns.length)}): ${after.billColumns.join(",")}`);
  console.log(`  rows AFTER : ${JSON.stringify(rowsAfter)}`);
  console.log(`  local_draft columns: ${after.draftColumns.join(",")}`);
  for (const [t, c] of Object.entries(after.cacheColumns)) console.log(`  ${t} columns: ${c.join(",")}`);

  check("local_bills gained owner_tenant_id", after.billColumns.includes("owner_tenant_id"));
  check("local_bills gained owner_user_id", after.billColumns.includes("owner_user_id"));
  check("local_draft carries owner_tenant_id", after.draftColumns.includes("owner_tenant_id"));
  check("local_draft carries owner_user_id", after.draftColumns.includes("owner_user_id"));
  for (const t of ["master_cache", "cached_products", "cached_sellers"]) {
    check(`${t} carries owner_tenant_id`, (after.cacheColumns[t] ?? []).includes("owner_tenant_id"));
    check(
      `${t} carries NO owner_user_id — the cache binds to the shop, not a person`,
      !(after.cacheColumns[t] ?? []).includes("owner_user_id"),
    );
  }
  check(
    "local_draft_lines gained NOTHING — it is reached only through its owned parent",
    !after.tables.includes("local_draft_lines") ||
      !(await (async () => {
        const dd = NodeSqliteDriver.open(file);
        const c = await dd.all<{ name: string }>("PRAGMA table_info(local_draft_lines)");
        await dd.close();
        return c.some((x) => x.name.startsWith("owner_"));
      })()),
  );

  // Nullable is not a preference: ADD COLUMN ... NOT NULL on a populated table
  // is an engine error, and null is the value that means UNKNOWN.
  const dn = NodeSqliteDriver.open(file);
  const info = await dn.all<{ name: string; notnull: number; dflt_value: string | null }>(
    "PRAGMA table_info(local_bills)",
  );
  await dn.close();
  const owner = info.filter((c) => c.name.startsWith("owner_"));
  console.log(`  owner column flags: ${JSON.stringify(owner)}`);
  check(
    "both owner columns are NULLABLE",
    owner.length === 2 && owner.every((c) => c.notnull === 0),
    JSON.stringify(owner),
  );

  check("every seeded row survived, value by value", rowsIntact(rowsAfter), JSON.stringify(rowsAfter));
  check("rows predating ownership have an UNKNOWN owner, not an assumed one", await (async () => {
    const dd = NodeSqliteDriver.open(file);
    const n = await dd.all<{ n: number }>(
      "SELECT count(*) AS n FROM local_bills WHERE owner_tenant_id IS NULL AND owner_user_id IS NULL",
    );
    await dd.close();
    return (n[0]?.n ?? -1) === SEED.length;
  })());

  return { ref: after, dir };
}

/* ------------------------------------------------------------------ M2 ---- */

async function m2KillMidMigration(ref: Shape, killAfter: number): Promise<void> {
  header(`M2 — SIGKILL part-way through the migration (after ${String(killAfter)} statement(s))`);
  const dir = tempDir(`m2-${String(killAfter)}`);
  const file = join(dir, "m2.db");
  await stageOldShape(file);
  const old = await readShape(file);

  const child = fileURLToPath(new URL("./migrationCrashChild.js", import.meta.url));
  const r = spawnSync(process.execPath, [child, file, String(killAfter)], { encoding: "utf8" });
  for (const line of (r.stdout || "").split("\n").filter(Boolean)) console.log(`  | ${line}`);
  if (r.stderr) for (const line of r.stderr.split("\n").filter(Boolean)) console.log(`  ! ${line}`);
  console.log(`  child exit: status=${String(r.status)} signal=${String(r.signal)}`);

  check(
    "the child really died abnormally (it never reached its own exit path)",
    r.status !== 99 && r.status !== 98 && r.status !== 0,
    `status=${String(r.status)} signal=${String(r.signal)} — 99 would mean the kill never fired, 98 an error before it`,
  );

  const now = await readShape(file);
  console.log(`  after reopen: tables=[${now.tables.join(",")}]`);
  console.log(`                indexes=[${now.indexes.join(",")}]`);
  console.log(`                local_bills columns (${String(now.billColumns.length)}): ${now.billColumns.join(",")}`);
  console.log(`  integrity_check = ${now.integrity}`);

  const isOld = sameShape(now, old);
  const isNew = sameShape(now, ref);

  check("the database is not corrupt after the kill", now.integrity === "ok");
  check(
    "the reopened database ANSWERS a query rather than throwing",
    (await readRows(file)).length >= 0,
  );
  check(
    "EXACTLY ONE of {complete old shape, complete new shape} — never a partial column set",
    isOld !== isNew,
    `old=${String(isOld)} new=${String(isNew)}` +
      (isOld || isNew
        ? ""
        : ` | columns=${String(now.billColumns.length)} tables=${String(now.tables.length)} indexes=${String(now.indexes.length)}`),
  );
  check(
    "no index exists that belongs only to the new schema",
    isNew || now.indexes.length === old.indexes.length,
    `indexes=[${now.indexes.join(",")}] old=[${old.indexes.join(",")}]`,
  );
  if (isOld) {
    check(
      "rolled back to the old shape with every row at its original value",
      rowsIntact(await readRows(file)),
    );
  }

  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ M3 ---- */

/**
 * The identity store. It must outlive the token: an expiry does not clear it, a
 * keystore clear does not clear it, only a deliberate sign-out does.
 */
async function m3IdentityOutlivesTheToken(): Promise<void> {
  header("M3 — the stored identity outlives the token");
  const dir = tempDir("m3");
  const file = join(dir, "m3.db");

  const d = NodeSqliteDriver.open(file);
  await initConnection(d);
  const identity = new SqliteIdentityStore(d);

  check("a fresh database reports NO identity rather than throwing", (await identity.load()) === null);

  await identity.save({ tenant_id: "tenant-A", user_id: "user-1" });
  const saved = await identity.load();
  console.log(`  after save: ${JSON.stringify(saved)}`);
  check(
    "the identity reads back exactly as written",
    saved?.tenant_id === "tenant-A" && saved.user_id === "user-1",
  );

  // The token and the identity are different things with different lifetimes.
  const tokens = new MemoryTokenStore("a-token");
  check("CONTROL: the token IS present before the clear", (await tokens.load()) === "a-token");
  const cleared = await tokens.clear();
  check("CONTROL: the token IS gone after the clear", (await tokens.load()) === null, cleared.kind);
  const afterTokenClear = await identity.load();
  check(
    "the identity survived the token being cleared",
    afterTokenClear?.tenant_id === "tenant-A" && afterTokenClear.user_id === "user-1",
    JSON.stringify(afterTokenClear),
  );
  await d.close();

  const d2 = NodeSqliteDriver.open(file);
  await initConnection(d2);
  const identity2 = new SqliteIdentityStore(d2);
  const afterReopen = await identity2.load();
  check(
    "the identity survived a reopen",
    afterReopen?.tenant_id === "tenant-A" && afterReopen.user_id === "user-1",
    JSON.stringify(afterReopen),
  );

  // Overwrite, then the only thing that removes it.
  await identity2.save({ tenant_id: "tenant-B", user_id: "user-2" });
  const replaced = await identity2.load();
  check(
    "a second save REPLACES rather than accumulating",
    replaced?.tenant_id === "tenant-B" && replaced.user_id === "user-2",
    JSON.stringify(replaced),
  );
  const rows = await d2.all<{ n: number }>("SELECT count(*) AS n FROM local_identity");
  check("exactly one identity row can exist", (rows[0]?.n ?? -1) === 1, JSON.stringify(rows));

  await identity2.clear();
  check("clear removes it, and a later read reports ABSENCE rather than throwing",
    (await identity2.load()) === null);
  await d2.close();

  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ M4 ---- */

/**
 * THE SIGN-IN ORDERING: the identity is recorded on success and ONLY on success.
 *
 * Driven through the REAL SqliteIdentityStore against a real file, so what is
 * checked is the row the device would actually hold — not a spy standing in for
 * one. The login itself is injected, because app/api.ts cannot run under node
 * (expo-constants), which is precisely why signInAndRecord takes the attempt as
 * an argument rather than importing it.
 *
 * The failure case has a CONTROL that is easy to omit and worthless without: an
 * identity is written BEFORE the failed attempt, so "untouched" is measured
 * against a stored value rather than against an empty store — where a store that
 * was never written and a store that was correctly left alone read identically.
 */
async function m4LoginRecordsOnlyOnSuccess(): Promise<void> {
  header("M4 — a successful login records the identity; a failed one leaves it alone");
  const dir = tempDir("m4");
  const file = join(dir, "m4.db");

  const d = NodeSqliteDriver.open(file);
  await initConnection(d);
  const identity = new SqliteIdentityStore(d);

  const TENANT = "11111111-1111-4111-8111-111111111111";
  const USER = "22222222-2222-4222-8222-222222222222";

  // ---- the success path ---------------------------------------------------
  check("CONTROL: nothing is stored before the first login", (await identity.load()) === null);

  const ok = (): Promise<SignInResult> =>
    Promise.resolve({ kind: "ok", accessToken: "header.payload.signature", userId: USER });
  const outcome = await signInAndRecord(ok, TENANT, identity);
  const stored = await identity.load();
  console.log(`  login returned: ${JSON.stringify(outcome)}`);
  console.log(`  stored        : ${JSON.stringify(stored)}`);

  check("CONTROL: the success path reported ok", outcome.kind === "ok", outcome.kind);
  const okOutcome = outcome.kind === "ok" ? outcome : null;
  check("a successful login WROTE an identity", stored !== null);
  check(
    "the stored user is the one the LOGIN RETURNED, not one derived locally",
    stored?.user_id === okOutcome?.userId,
    `stored=${String(stored?.user_id)} returned=${String(okOutcome?.userId)}`,
  );
  check(
    "the stored tenant is the one the login was made AGAINST",
    stored?.tenant_id === TENANT,
    `stored=${String(stored?.tenant_id)} sent=${TENANT}`,
  );
  check(
    "the token is handed back to the caller and NOT stored here",
    okOutcome?.accessToken === "header.payload.signature" &&
      !JSON.stringify(stored).includes("header.payload"),
  );

  // ---- the failure path, against a NON-EMPTY store ------------------------
  const before = await identity.load();
  check("CONTROL: an identity IS present before the failed attempt", before !== null);

  let attempts = 0;
  const refused = (): Promise<SignInResult> => {
    attempts += 1;
    // A THROWN failure. login() no longer throws on a refusal, but the throw
    // path is still reachable from anything the attempt does, and the guarantee
    // that nothing is recorded when it fires must keep holding.
    return Promise.reject(new Error("login -> HTTP 401"));
  };

  let threw = false;
  try {
    await signInAndRecord(refused, "33333333-3333-4333-8333-333333333333", identity);
  } catch {
    threw = true;
  }
  const after = await identity.load();
  console.log(`  after refusal : ${JSON.stringify(after)}`);

  check("CONTROL: the failing attempt really ran", attempts === 1, `attempts=${String(attempts)}`);
  check("the refusal PROPAGATES to the caller", threw);
  check(
    "the stored identity is byte-for-byte what it was before the refusal",
    JSON.stringify(after) === JSON.stringify(before),
    `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
  );
  check(
    "the refused tenant was NOT adopted",
    after?.tenant_id === TENANT,
    `tenant=${String(after?.tenant_id)}`,
  );

  /*
   * THE SAME GUARANTEE FOR A REFUSAL THAT DOES NOT THROW, which is what
   * login() now produces. The throw above is no longer the only way to fail, so
   * asserting only on it would leave the new and ordinary path unproven — the
   * seam two-green-proofs-do-not-cover-the-seam.md names.
   */
  let valueAttempts = 0;
  const refusedByValue = (): Promise<SignInResult> => {
    valueAttempts += 1;
    return Promise.resolve({ kind: "refused" });
  };
  const refusalResult = await signInAndRecord(
    refusedByValue,
    "66666666-6666-4666-8666-666666666666",
    identity,
  );
  const afterValue = await identity.load();
  check("CONTROL: the value-refusal attempt really ran", valueAttempts === 1);
  check(
    "a refusal RETURNED (not thrown) is handed back to the caller as refused",
    refusalResult.kind === "refused",
    refusalResult.kind,
  );
  check(
    "and it records NOTHING — the stored identity is byte-for-byte unchanged",
    JSON.stringify(afterValue) === JSON.stringify(after),
    `before=${JSON.stringify(after)} after=${JSON.stringify(afterValue)}`,
  );

  // ---- a second successful login REPLACES --------------------------------
  const USER2 = "44444444-4444-4444-8444-444444444444";
  const TENANT2 = "55555555-5555-4555-8555-555555555555";
  await signInAndRecord(
    () => Promise.resolve({ kind: "ok", accessToken: "t2", userId: USER2 }),
    TENANT2,
    identity,
  );
  const swapped = await identity.load();
  check(
    "a later successful login replaces the identity outright",
    swapped?.user_id === USER2 && swapped.tenant_id === TENANT2,
    JSON.stringify(swapped),
  );
  const n = await d.all<{ n: number }>("SELECT count(*) AS n FROM local_identity");
  check("still exactly one identity row", (n[0]?.n ?? -1) === 1, JSON.stringify(n));

  await d.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("P1.7 — atomic migration, the identity store, and the sign-in ordering");
  console.log(`node ${process.version}, node:sqlite against real files in ${tmpdir()}`);

  const { ref, dir } = await m1MigrateAPopulatedTable();
  // Several kill points, so the window is not one lucky statement: early
  // (inside the CREATE TABLE run), middle (inside the ALTERs) and late (inside
  // the post-migration indexes and backfill).
  for (const k of [2, 6, 12, 20]) await m2KillMidMigration(ref, k);
  rmSync(dir, { recursive: true, force: true });

  await m3IdentityOutlivesTheToken();
  await m4LoginRecordsOnlyOnSuccess();

  console.log("");
  console.log(failures === 0 ? "ALL MIGRATION CASES PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

// Preset RED, per lessons/a-default-exit-code-is-a-default-verdict.md: a run
// that ends before main()'s tally completes exits non-zero, not a default 0.
process.exitCode = 1;

main()
  .then((code) => {
    console.log(`MIGRATION_EXIT=${code}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("MIGRATION PROOF CRASHED:", err);
    process.exitCode = 1;
  });
