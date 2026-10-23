/**
 * H3 (ADVISOR-DECIDED 2026-10-23): NO PHONE KEEPS A FULL ID NUMBER AFTER ITS SELLER HAS SYNCED —
 * run by `npm run prove:sellerid`.
 *
 * WHAT THIS DRIVES: the production SqliteLocalSellerStore and initConnection on a real SQLite file
 * (node driver), the production picker mapping (src/cart/pickerSellers.ts localPickerSeller) and the
 * production signOut(). Every value is read back by RAW SQL from the file, never off the store's
 * own return.
 *
 *   S1  SETTLE DROPS IT: a seller created with ID `1-2345-67890-12-3` holds it while owed; the settle
 *       (markSellerCreated) leaves `synced`, id_number NULL and id_last4 `0123` -- one UPDATE.
 *   S2  NOT SYNCED, NOT DROPPED: the ID survives every state that is not a settle -- pending, a
 *       claim (syncing), a failed attempt, a boot recovery of a stranded claim, a 409 held for
 *       review, a refusal (failed). Then that same row settles and loses it.
 *   S3  AN ID TOO SHORT TO MINIMISE (`12`) is still dropped at settle; id_last4 stays NULL.
 *   S4  THE PICKER never carries a full ID: a settled row offers the stored last four, an owed row
 *       the derived one, and the merged list's JSON holds neither full ID.
 *   S5  A DEVICE THAT SETTLED BEFORE THIS CHANGE: a file built in the SHIPPED shape (local_sellers
 *       without id_last4, as at bb49048) holding a synced row with its ID, a pending one and a
 *       refused one. Opening it adds the column and minimises ONLY the synced row; a second open
 *       changes nothing.
 *   S6  THE BYTES OF THE FILE: after a settle and close, the dropped ID's bytes are searched for in
 *       the database file (and any -wal), with a control -- an owed seller's ID in the same file
 *       must be FOUND by the same search.
 *   S7  SIGN-OUT, MEASURED NOT CHANGED: signOut() plus the App's permission clear over a device
 *       holding a settled seller, a refused seller, cached sellers and a synced bill -- what each
 *       table still holds afterwards is printed, and pinned as today's behaviour.
 *
 * THE DISPROOFS, RUN BY HAND (2026-10-23):
 *   - markSellerCreated no longer sets `id_number = NULL` -> S1, S2's settle, S3 and both S6 cells
 *     red (S4 stays green: the picker mapping never copies id_number, so it cannot see the drop).
 *   - `PRAGMA secure_delete = ON` removed -> S6 red open AND closed: the NULLed value's bytes stay in
 *     the page's free space.
 *   - the post-settle `wal_checkpoint(TRUNCATE)` removed -> S6 red while OPEN only: the frames
 *     written while the row was owed hold the ID in the live WAL until a close checkpoints them.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteLocalSellerStore } from "../adapters/sqlite/SqliteLocalSellerStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { SqliteMasterStore } from "../adapters/sqlite/SqliteMasterStore.js";
import { SqlitePermissionStore } from "../adapters/sqlite/SqlitePermissionStore.js";
import { localPickerSeller, mergeSellersForPicker } from "../cart/pickerSellers.js";
import { signOut } from "../session/signOut.js";
import { buildLocalBill } from "../sync/createBill.js";
import { NOTHING_OWED } from "../sync/outbox.js";
import type { LocalSellerDraft } from "../sync/localSeller.js";
import { systemClock } from "../sync/systemClock.js";
import { PROOF_OWNER } from "./fakes.js";
import { signInProofDevice } from "./proofDevice.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const NOW = new Date("2026-10-23T03:00:00.000Z");
const LATER = new Date("2026-10-23T03:05:00.000Z");

interface Device {
  file: string;
  driver: NodeSqliteDriver;
  sellers: SqliteLocalSellerStore;
}

async function device(dir: string, name: string): Promise<Device> {
  const file = join(dir, `${name}.db`);
  const driver = NodeSqliteDriver.open(file);
  await SqliteLocalStore.open(driver);
  await signInProofDevice(driver);
  const sellers = SqliteLocalSellerStore.open(driver);
  const codes = Array.from({ length: 8 }, (_, i) => ({ code: `S9${String(10 + i)}`, token: `tok-${name}-${String(i)}` }));
  await sellers.saveReservations(codes, NOW);
  return { file, driver, sellers };
}

function draft(name: string, id: string | null): LocalSellerDraft {
  return { name, phone: "0810000000", grade: null, id_number: id, address: `บ้าน ${name}`, vehicle_no: null };
}

interface RawSeller { sync_state: string; id_number: string | null; id_last4: string | null; server_seller_id: string | null }

async function raw(d: Device, id: string): Promise<RawSeller | undefined> {
  const rows = await d.driver.all<RawSeller>(
    "SELECT sync_state, id_number, id_last4, server_seller_id FROM local_sellers WHERE id = ?", [id]);
  return rows[0];
}

async function create(d: Device, id: string, name: string, idNumber: string | null): Promise<void> {
  const r = await d.sellers.createLocalSeller(draft(name, idNumber), PROOF_OWNER, id, NOW);
  if (r.kind !== "created") throw new Error(`createLocalSeller ${id}: ${r.kind}`);
}

async function s1(d: Device): Promise<void> {
  header("S1  SETTLE DROPS THE FULL ID, KEEPS THE LAST FOUR");
  await create(d, "loc-1", "ผู้ขายหนึ่ง", "1-2345-67890-12-3");
  const before = await raw(d, "loc-1");
  check("S1: while owed the row holds the ID as typed, no last four stored",
    before?.sync_state === "pending" && before.id_number === "1-2345-67890-12-3" && before.id_last4 === null,
    JSON.stringify(before));
  const claimed = await d.sellers.claimSellerCreate("loc-1", NOW);
  await d.sellers.markSellerCreated("loc-1", "srv-1", 1, LATER);
  const after = await raw(d, "loc-1");
  check("S1: after the settle: synced, server id written, id_number NULL, id_last4 0123",
    claimed && after?.sync_state === "synced" && after.server_seller_id === "srv-1"
      && after.id_number === null && after.id_last4 === "0123",
    JSON.stringify(after));
}

async function s2(d: Device): Promise<void> {
  header("S2  A SELLER WHOSE SYNC HAS NOT SUCCEEDED KEEPS THE ID, IN EVERY STATE THAT IS NOT A SETTLE");
  const ID = "AB 12-34 567";
  await create(d, "loc-2", "ผู้ขายสอง", ID);
  const seen: string[] = [];
  const keeps = async (label: string, id: string, want: string, idNumber = ID): Promise<void> => {
    const r = await raw(d, id);
    seen.push(`${label}=${String(r?.sync_state)}`);
    check(`S2: ${label} -> ${want}, id_number kept, nothing stored as last four`,
      r?.sync_state === want && r.id_number === idNumber && r.id_last4 === null, JSON.stringify(r));
  };
  await keeps("created", "loc-2", "pending");
  await d.sellers.claimSellerCreate("loc-2", NOW);
  await keeps("claimed", "loc-2", "syncing");
  await d.sellers.markSellerCreateAttemptFailed("loc-2", "network: offline", 1, NOW);
  await keeps("a failed attempt", "loc-2", "pending");
  await d.sellers.claimSellerCreate("loc-2", NOW);
  await d.sellers.resetSyncingSellersToPending(NOW);
  await keeps("a boot recovery of the stranded claim", "loc-2", "pending");
  await create(d, "loc-3", "ผู้ขายสาม", "3333333333333");
  await d.sellers.claimSellerCreate("loc-3", NOW);
  await d.sellers.markSellerCreateNeedsReview("loc-3", "S912", "HTTP 409", 1, NOW);
  await keeps("a 409 held for review", "loc-3", "pending", "3333333333333");
  // On a device of its OWN: a refusal returns its code to the pool while the refused row keeps it,
  // so the next create on that device picks the code and meets local_sellers.code UNIQUE
  // (OPEN_ITEMS, found by this proof's first run) -- not this proof's subject.
  const r = await device(dirname(d.file), "refused");
  await create(r, "loc-4", "ผู้ขายสี่", "4444444444444");
  await r.sellers.claimSellerCreate("loc-4", NOW);
  await r.sellers.markSellerCreateRefused("loc-4", "HTTP 422", 1, NOW);
  const refused = await raw(r, "loc-4");
  check("S2: a refusal (terminal) -> failed, id_number kept, nothing stored as last four",
    refused?.sync_state === "failed" && refused.id_number === "4444444444444" && refused.id_last4 === null,
    JSON.stringify(refused));
  await r.driver.close();
  await d.sellers.claimSellerCreate("loc-2", NOW);
  await d.sellers.markSellerCreated("loc-2", "srv-2", 3, LATER);
  const settled = await raw(d, "loc-2");
  check("S2: the same row, once it SETTLES, drops the ID and keeps 4567",
    settled?.sync_state === "synced" && settled.id_number === null && settled.id_last4 === "4567", JSON.stringify(settled));
}

async function s3(d: Device): Promise<void> {
  header("S3  AN ID TOO SHORT TO MINIMISE IS STILL DROPPED");
  await create(d, "loc-5", "ผู้ขายห้า", "12");
  await d.sellers.claimSellerCreate("loc-5", NOW);
  await d.sellers.markSellerCreated("loc-5", "srv-5", 1, LATER);
  const r = await raw(d, "loc-5");
  check("S3: `12` settles to id_number NULL and id_last4 NULL (two characters have no last four)",
    r?.sync_state === "synced" && r.id_number === null && r.id_last4 === null, JSON.stringify(r));
}

async function s4(d: Device): Promise<void> {
  header("S4  THE PICKER NEVER CARRIES A FULL ID");
  await create(d, "loc-6", "ผู้ขายหก", "6-6666-66666-66-6");
  const settled = await d.sellers.getLocalSeller("loc-1");
  const owed = await d.sellers.getLocalSeller("loc-6");
  if (settled === null || owed === null) throw new Error("S4: fixture rows missing");
  const a = localPickerSeller(settled);
  const b = localPickerSeller(owed);
  check("S4: a SETTLED row offers the last four stored at settle (0123)", a.id_last4 === "0123", JSON.stringify(a));
  check("S4: an OWED row offers the last four derived from the ID it still holds (6666)", b.id_last4 === "6666");
  const merged = JSON.stringify(mergeSellersForPicker([], [a, b]).options);
  check("S4: the merged picker list holds neither full ID and no id_number key",
    !merged.includes("1-2345-67890-12-3") && !merged.includes("6-6666-66666-66-6") && !merged.includes("id_number"));
  check("S4: control -- the owed row's own record DOES hold its full ID (what the picker withheld)",
    owed.id_number === "6-6666-66666-66-6");
}

// The local_sellers DDL AS SHIPPED at bb49048 (before H3): every column but id_last4.
const SHIPPED_LOCAL_SELLERS = `CREATE TABLE local_sellers (
  id TEXT NOT NULL PRIMARY KEY, code TEXT NOT NULL UNIQUE, reservation_token TEXT NOT NULL,
  name TEXT NOT NULL, phone TEXT, grade TEXT, id_number TEXT, address TEXT, vehicle_no TEXT,
  sync_state TEXT NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0, last_error TEXT,
  created_at TEXT NOT NULL, next_attempt_at TEXT NOT NULL, server_seller_id TEXT, settled_at TEXT,
  needs_review_at TEXT, needs_review_code TEXT, owner_tenant_id TEXT, owner_user_id TEXT,
  CHECK (sync_state IN ('pending', 'syncing', 'synced', 'failed'))
) STRICT`;

async function s5(dir: string): Promise<void> {
  header("S5  A DEVICE THAT SETTLED SELLERS BEFORE THIS CHANGE: the open minimises them");
  const file = join(dir, "shipped.db");
  const old = NodeSqliteDriver.open(file);
  await old.exec(SHIPPED_LOCAL_SELLERS);
  const ins = (id: string, code: string, state: string, idn: string, srv: string | null) => old.run(
    "INSERT INTO local_sellers (id, code, reservation_token, name, id_number, sync_state, created_at, next_attempt_at,"
      + " server_seller_id) VALUES (?, ?, 't', ?, ?, ?, ?, ?, ?)",
    [id, code, `ผู้ขาย ${id}`, idn, state, NOW.toISOString(), NOW.toISOString(), srv]);
  await ins("old-synced", "S801", "synced", "5-5555-55555-55-5", "srv-old");
  await ins("old-pending", "S802", "pending", "7-7777-77777-77-7", null);
  await ins("old-failed", "S803", "failed", "8-8888-88888-88-8", null);
  const cols = await old.all<{ name: string }>("PRAGMA table_info(local_sellers)");
  check("S5: the fixture is the SHIPPED shape -- no id_last4 column", !cols.some((c) => c.name === "id_last4"));
  await old.close();

  const read = async (drv: NodeSqliteDriver) => drv.all<{ id: string; sync_state: string; id_number: string | null; id_last4: string | null }>(
    "SELECT id, sync_state, id_number, id_last4 FROM local_sellers ORDER BY id");
  const d1 = NodeSqliteDriver.open(file);
  await SqliteLocalStore.open(d1);
  const first = await read(d1);
  await d1.close();
  const by = new Map(first.map((r) => [r.id, r]));
  check("S5: the synced row is minimised on open: id_number NULL, id_last4 5555",
    by.get("old-synced")?.id_number === null && by.get("old-synced")?.id_last4 === "5555", JSON.stringify(by.get("old-synced")));
  check("S5: the pending row keeps its ID (still owed)", by.get("old-pending")?.id_number === "7-7777-77777-77-7"
    && by.get("old-pending")?.id_last4 === null);
  check("S5: the refused row keeps its ID (never reached the server)", by.get("old-failed")?.id_number === "8-8888-88888-88-8");
  const d2 = NodeSqliteDriver.open(file);
  await SqliteLocalStore.open(d2);
  const second = await read(d2);
  await d2.close();
  check("S5: a second open changes nothing", JSON.stringify(second) === JSON.stringify(first));
}

function fileHas(file: string, needle: string): boolean {
  const bytes = Buffer.from(needle, "utf8");
  return [file, `${file}-wal`].some((f) => existsSync(f) && readFileSync(f).includes(bytes));
}

async function s6(dir: string): Promise<void> {
  header("S6  THE BYTES OF THE FILE after a settle and a close");
  const d = await device(dir, "bytes");
  await create(d, "b-settled", "ผู้ขายไบต์", "9-1111-22222-33-4");
  await create(d, "b-owed", "ผู้ขายค้าง", "9-5555-66666-77-8");
  await d.sellers.claimSellerCreate("b-settled", NOW);
  await d.sellers.markSellerCreated("b-settled", "srv-b", 1, LATER);
  // WHILE THE APP RUNS (connection open, the WAL live), and again after a close.
  const openSettled = fileHas(d.file, "9-1111-22222-33-4");
  const openOwed = fileHas(d.file, "9-5555-66666-77-8");
  await d.driver.close();
  const settledFound = fileHas(d.file, "9-1111-22222-33-4");
  const owedFound = fileHas(d.file, "9-5555-66666-77-8");
  console.log(`  bytes, connection open: settled ID ${openSettled ? "FOUND" : "absent"}; owed ID ${openOwed ? "FOUND" : "absent"}`);
  console.log(`  bytes, after close:     settled ID ${settledFound ? "FOUND" : "absent"}; owed ID ${owedFound ? "FOUND" : "absent"}`);
  check("S6: control -- the byte search FINDS the ID an owed seller still holds, open and closed", openOwed && owedFound);
  check("S6: the settled seller's ID appears NOWHERE in the database file or its WAL -- while open",
    !openSettled);
  check("S6: and after the close", !settledFound);
}

async function s7(dir: string): Promise<void> {
  header("S7  SIGN-OUT, MEASURED (not changed): what the device still holds afterwards");
  const d = await device(dir, "signout");
  await create(d, "so-settled", "ผู้ขายยืนยัน", "1-0000-00000-00-1");
  await d.sellers.claimSellerCreate("so-settled", NOW);
  await d.sellers.markSellerCreated("so-settled", "srv-so", 1, LATER);
  await create(d, "so-refused", "ผู้ขายถูกปฏิเสธ", "2-0000-00000-00-2");
  await d.sellers.claimSellerCreate("so-refused", NOW);
  await d.sellers.markSellerCreateRefused("so-refused", "HTTP 422", 1, NOW);
  const master = await SqliteMasterStore.open(d.driver);
  await master.saveSellers([
    { id: "srv-so", code: "S910", name: "ผู้ขายยืนยัน", phone: "0811111111", grade: "A", id_last4: "0001", vehicle_no: "70-1111" },
    { id: "srv-x", code: "S001", name: "ผู้ขายแคช", phone: "0822222222", grade: "A", id_last4: "9999", vehicle_no: null },
  ], NOW.toISOString());
  const bills = await SqliteLocalStore.open(d.driver);
  const bill = buildLocalBill({ clock: systemClock, ids: { newId: () => `bill-${String(Math.random()).slice(2, 10)}` } }, {
    seller: { kind: "server", seller_id: "srv-x" }, vehicle_no: "70-2222",
    items: [{ id: "item-1", product_id: "p", line_no: 1, gross_weight: "1.000", tare_weight: "0.000",
      net_weight: "1.000", unit_price: "10.00", list_price: "10.00" }],
    total_amount: null, master_as_of: null,
  });
  await bills.putBill(bill, PROOF_OWNER);
  await bills.claimForSend(bill.id, NOW);
  await bills.markSynced(bill.id, "B-2569-1", 1, NOW);
  const perms = new SqlitePermissionStore(d.driver);
  await perms.replace(PROOF_OWNER.user_id, new Set(["bills.create"]), NOW);

  const census = async () => {
    const one = async (sql: string) => (await d.driver.all<{ n: number }>(sql))[0]?.n ?? 0;
    return {
      local_sellers: await one("SELECT COUNT(*) AS n FROM local_sellers"),
      local_sellers_with_full_id: await one("SELECT COUNT(*) AS n FROM local_sellers WHERE id_number IS NOT NULL"),
      local_sellers_with_address: await one("SELECT COUNT(*) AS n FROM local_sellers WHERE address IS NOT NULL"),
      local_sellers_with_phone: await one("SELECT COUNT(*) AS n FROM local_sellers WHERE phone IS NOT NULL"),
      cached_sellers: await one("SELECT COUNT(*) AS n FROM cached_sellers"),
      cached_sellers_with_phone: await one("SELECT COUNT(*) AS n FROM cached_sellers WHERE phone IS NOT NULL"),
      local_bills: await one("SELECT COUNT(*) AS n FROM local_bills"),
      local_identity: await one("SELECT COUNT(*) AS n FROM local_identity"),
      cached_permissions: await one("SELECT COUNT(*) AS n FROM cached_permissions"),
    };
  };
  const before = await census();
  let cleared = 0;
  const out = await signOut({
    owed: NOTHING_OWED, failed: 0, setSyncPaused: () => undefined,
    tokens: { clear: () => { cleared += 1; return Promise.resolve({ kind: "cleared" as const }); } },
    engine: null,
  });
  // App.tsx's sign-out handler then clears the permission cache beside the session (App.tsx onSignOut).
  if (out.kind === "signed_out") await perms.clear();
  const after = await census();
  console.log("  table                          before  after");
  for (const k of Object.keys(before) as (keyof typeof before)[]) {
    console.log(`  ${k.padEnd(30)} ${String(before[k]).padStart(6)}  ${String(after[k]).padStart(5)}`);
  }
  check("S7: the measurement saw the device's data before sign-out (the census is not empty)",
    before.local_sellers === 2 && before.cached_sellers === 2 && before.local_bills === 1 && before.cached_permissions === 1);
  check("S7: sign-out ran and cleared the keystore once", out.kind === "signed_out" && cleared === 1);
  check("S7 TODAY: sign-out clears the permission cache and NOTHING else on this list -- sellers (one refused row"
    + " still holding a full ID and both addresses), cached sellers with phones, bills and the identity all stay",
    after.cached_permissions === 0 && after.local_sellers === 2 && after.local_sellers_with_full_id === 1
      && after.local_sellers_with_address === 2 && after.cached_sellers_with_phone === 2 && after.local_bills === 1
      && after.local_identity === 1,
    JSON.stringify(after));
  await d.driver.close();
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "prove-sellerid-"));
  try {
    const d = await device(dir, "main");
    await s1(d);
    await s2(d);
    await s3(d);
    await s4(d);
    await d.driver.close();
    await s5(dir);
    await s6(dir);
    await s7(dir);
  } finally {
    // Best effort: a cell that threw leaves its file open, and Windows refuses to remove an open
    // file -- that refusal must not replace the error that actually ended the run.
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      console.log(`  (left behind: ${dir})`);
    }
  }
  console.log(`\n${failures === 0 ? "ALL SELLER-ID CASES PASSED" : `FAILED — ${String(failures)} check(s)`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err: unknown) => {
    console.error("SELLERID PROOF CRASHED:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    console.log(`PROVE_SELLERID_EXIT=${String(process.exitCode ?? 0)}`);
  });
