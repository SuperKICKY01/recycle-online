/**
 * D1 (ADVISOR-DECIDED 2026-10-23): SIGN-OUT ERASES THE DEVICE'S PERSONAL DATA AND THE IDENTITY, AND IS
 * REFUSED WHILE THE PERSON STILL OWES WORK -- run by `npm run prove:signoutclear`.
 *
 * WHAT THIS DRIVES: the production signOut() with the production SqlitePersonalDataStore, on a real
 * SQLite file (node driver), its gate fed by a real SyncEngine's owedByKind() over the production
 * stores -- the value App.tsx hands it -- and the production sheet and status wording. Every table is
 * read back by RAW SQL, never off a store's own return.
 *
 * THE FIXTURE, one device: the signed-in person (PROOF_OWNER) and another person of the same shop.
 *   sellers created here  ls-settled (mine, synced: phone, address, last four)
 *                         ls-refused (mine, refused: the full ID as typed -- nothing references it)
 *                         ls-refused-held (other's, refused, and the seller a parked bill waits on)
 *                         ls-owed (other's, pending: the create not yet sent, phone and full ID)
 *   cached_sellers        two, with phones
 *   bills                 mine synced, mine refused (failed), other's pending, other's parked
 *   draft, permissions, shop, device, reserve, codes, products cache
 *
 *   R1-R3  REFUSED WITH PENDING: one more bill of MINE, unsent. The gate reads bill_send 1 off the
 *          real engine, signOut answers refused_pending, the token stays, and EVERY table of the file
 *          is value-equal before and after. The sheet says why and names the count.
 *   C1-C9  CLEARED WHEN EMPTY: that bill synced, so I owe nothing (the other person still does).
 *          Table by table: what was cleared, what was kept, and that every kept table is value-equal.
 *   B1     THE BYTES: the refused seller's full ID and a cached phone are FOUND in the file before
 *          the sign-out (control) and absent from the file and its WAL after.
 *   F1     A KEYSTORE THAT REFUSES: nothing in the file changes -- the clear runs only after the token.
 *
 * THE DISPROOFS, RUN BY HAND (2026-10-23) -- recorded in the commit body.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteDraftStore } from "../adapters/sqlite/SqliteDraftStore.js";
import { SqliteLocalSellerStore } from "../adapters/sqlite/SqliteLocalSellerStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { SqliteMasterStore } from "../adapters/sqlite/SqliteMasterStore.js";
import { SqlitePermissionStore } from "../adapters/sqlite/SqlitePermissionStore.js";
import { SqlitePersonalDataStore } from "../adapters/sqlite/SqlitePersonalDataStore.js";
import { emptyForm } from "../cart/types.js";
import { signOut } from "../session/signOut.js";
import { signedOutStatus, signOutCard, signOutCardText } from "../session/signOutNotice.js";
import type { RowOwner } from "../session/rowOwner.js";
import { MemoryTokenStore } from "../session/tokenStore.js";
import { buildLocalBill } from "../sync/createBill.js";
import type { BillSeller } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import type { LocalSellerDraft } from "../sync/localSeller.js";
import { systemClock } from "../sync/systemClock.js";
import { noSellerKind, OfflineTransport, PROOF_OWNER } from "./fakes.js";
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
const OTHER: RowOwner = { tenant_id: PROOF_OWNER.tenant_id, user_id: "00000000-0000-4000-8000-00000000cccc" };
const REFUSED_ID = "2-2222-22222-22-2";
const OWED_ID = "4-4444-44444-44-4";
const CACHED_PHONE = "0899990001";

interface Device {
  file: string;
  driver: NodeSqliteDriver;
  bills: SqliteLocalStore;
  sellers: SqliteLocalSellerStore;
  engine: SyncEngine;
}

let billSeq = 0;

function bill(seller: BillSeller): ReturnType<typeof buildLocalBill> {
  billSeq += 1;
  const n = String(billSeq);
  return buildLocalBill({ clock: systemClock, ids: { newId: () => `b${n}-${String(Math.random()).slice(2, 10)}` } }, {
    seller, vehicle_no: "70-2222",
    items: [{ id: `item-${n}`, product_id: "p-1", line_no: 1, gross_weight: "1.000", tare_weight: "0.000",
      net_weight: "1.000", unit_price: "10.00", list_price: "10.00" }],
    total_amount: null, master_as_of: null,
  });
}

function sellerDraft(name: string, phone: string, idNumber: string | null): LocalSellerDraft {
  return { name, phone, grade: null, id_number: idNumber, address: `บ้าน ${name}`, vehicle_no: null };
}

async function create(d: Device, id: string, name: string, phone: string, idNumber: string | null,
  owner: RowOwner): Promise<void> {
  const r = await d.sellers.createLocalSeller(sellerDraft(name, phone, idNumber), owner, id, NOW);
  if (r.kind !== "created") throw new Error(`createLocalSeller ${id}: ${r.kind}`);
}

/** The device every cell starts from. `mineUnsent` adds one unsent bill of the signed-in person. */
async function device(dir: string, name: string): Promise<Device & { mineUnsentId: string }> {
  const file = join(dir, `${name}.db`);
  const driver = NodeSqliteDriver.open(file);
  const bills = await SqliteLocalStore.open(driver);
  await signInProofDevice(driver);
  const sellers = SqliteLocalSellerStore.open(driver);
  await sellers.saveReservations(
    Array.from({ length: 8 }, (_, i) => ({ code: `S7${String(10 + i)}`, token: `tok-${name}-${String(i)}` })), NOW);
  await driver.run("INSERT INTO local_shop (only_row, tenant_id, updated_at) VALUES (1, ?, ?)",
    [PROOF_OWNER.tenant_id, NOW.toISOString()]);
  const engine = new SyncEngine({ ...noSellerKind(), sellerStore: sellers, store: bills,
    transport: new OfflineTransport(), clock: systemClock });
  const d = { file, driver, bills, sellers, engine };

  await create(d, "ls-settled", "ผู้ขายยืนยัน", "0811110001", "1-1111-11111-11-1", PROOF_OWNER);
  await sellers.claimSellerCreate("ls-settled", NOW);
  await sellers.markSellerCreated("ls-settled", "srv-settled", 1, NOW);
  await create(d, "ls-refused", "ผู้ขายถูกปฏิเสธ", "0811110002", REFUSED_ID, PROOF_OWNER);
  await sellers.claimSellerCreate("ls-refused", NOW);
  await sellers.markSellerCreateRefused("ls-refused", "HTTP 422", 1, NOW);
  await create(d, "ls-refused-held", "ผู้ขายรอบิล", "0811110003", "3-3333-33333-33-3", OTHER);
  await sellers.claimSellerCreate("ls-refused-held", NOW);
  await sellers.markSellerCreateRefused("ls-refused-held", "HTTP 422", 1, NOW);
  await create(d, "ls-owed", "ผู้ขายค้างส่ง", "0811110004", OWED_ID, OTHER);

  const master = await SqliteMasterStore.open(driver);
  await master.saveSellers([
    { id: "srv-settled", code: "S710", name: "ผู้ขายยืนยัน", phone: "0811110001", grade: "A", id_last4: "1111", vehicle_no: "70-1111" },
    { id: "srv-x", code: "S001", name: "ผู้ขายแคช", phone: CACHED_PHONE, grade: "A", id_last4: "9999", vehicle_no: null },
  ], NOW.toISOString());
  await new SqlitePermissionStore(driver).replace(PROOF_OWNER.user_id, new Set(["bills.create"]), NOW);

  const synced = bill({ kind: "server", seller_id: "srv-x" });
  await bills.putBill(synced, PROOF_OWNER);
  await bills.claimForSend(synced.id, NOW);
  await bills.markSynced(synced.id, "B-2569-1", 1, NOW);
  const refused = bill({ kind: "server", seller_id: "srv-x" });
  await bills.putBill(refused, PROOF_OWNER);
  await bills.claimForSend(refused.id, NOW);
  await bills.markFailed(refused.id, "HTTP 422", 1, NOW);
  await bills.putBill(bill({ kind: "server", seller_id: "srv-x" }), OTHER);
  await bills.putBill(bill({ kind: "local", local_seller_id: "ls-refused-held" }), OTHER);
  const mineUnsent = bill({ kind: "server", seller_id: "srv-settled" });
  await bills.putBill(mineUnsent, PROOF_OWNER);

  const drafts = await SqliteDraftStore.open(driver);
  await drafts.save({ id: "draft-1", seller_id: "srv-x", vehicle_no: "70-3333", lines: [], next_seq: 1,
    form: emptyForm(), updated_at: NOW.toISOString(), master_as_of: null }, PROOF_OWNER);
  return { ...d, mineUnsentId: mineUnsent.id };
}

async function tables(d: Device): Promise<string[]> {
  return (await d.driver.all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")).map((r) => r.name);
}

/** Every row of every table, as text -- value against value. */
async function snapshot(d: Device): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const t of await tables(d)) {
    out.set(t, JSON.stringify(await d.driver.all(`SELECT * FROM ${t} ORDER BY rowid`)));
  }
  return out;
}

async function count(d: Device, sql: string): Promise<number> {
  return (await d.driver.all<{ n: number }>(sql))[0]?.n ?? 0;
}

function fileHas(file: string, needle: string): boolean {
  const bytes = Buffer.from(needle, "utf8");
  return [file, `${file}-wal`].some((f) => existsSync(f) && readFileSync(f).includes(bytes));
}

async function runSignOut(d: Device, tokens: MemoryTokenStore | { clear: () => Promise<{ kind: "failed"; reason: string }> }) {
  return signOut({
    owed: await d.engine.owedByKind(),
    failed: (await d.bills.listByState("failed")).length,
    setSyncPaused: () => undefined,
    tokens,
    personalData: new SqlitePersonalDataStore(d.driver),
    engine: d.engine,
  });
}

async function refused(dir: string): Promise<void> {
  header("R  REFUSED WITH PENDING: one unsent bill of mine");
  const d = await device(dir, "refused");
  const owed = await d.engine.owedByKind();
  check("R1: the real engine counts my one unsent bill (and not the other person's)", owed.bill_send === 1,
    JSON.stringify(owed));
  const tokens = new MemoryTokenStore("a-token");
  const before = await snapshot(d);
  const out = await runSignOut(d, tokens);
  const after = await snapshot(d);
  const changed = [...before.keys()].filter((t) => before.get(t) !== after.get(t));
  check("R2: refused_pending, the token still held", out.kind === "refused_pending" && (await tokens.load()) === "a-token",
    out.kind);
  check(`R2: every one of the file's ${String(before.size)} tables is value-equal before and after`,
    before.size >= 15 && changed.length === 0, `changed: ${JSON.stringify(changed)}`);
  check("R2: control -- the snapshot holds the rows a clear would take (identity, a full ID, a phone)",
    (before.get("local_identity") ?? "").includes(PROOF_OWNER.user_id) && (before.get("local_sellers") ?? "").includes(REFUSED_ID)
      && (before.get("cached_sellers") ?? "").includes(CACHED_PHONE));
  const sheet = signOutCardText(signOutCard({ owed, failed: 1, failure: null, session: "active", appOutdated: false }));
  console.log(`  sheet: ${sheet}`);
  check("R3: the sheet refuses in words and names the count",
    sheet.startsWith("ยังออกจากระบบไม่ได้") && sheet.includes("มีบิลรอส่ง 1 ใบ")
      && sheet.includes("รอให้ส่งครบก่อน แล้วจึงออกจากระบบได้") && !sheet.includes("ข้อมูลผู้ขาย"));
  check("R3: the refused bill is named without a second ruling that contradicts the title",
    sheet.includes("มีบิลที่ระบบไม่รับ 1 ใบค้างอยู่ในเครื่อง — ต้องแจ้งสำนักงาน") && !sheet.includes("ออกจากระบบได้ แต่"));
  await d.driver.close();
}

const CLEARED_TABLES = new Set(["local_identity", "cached_sellers", "local_sellers", "cached_permissions"]);

async function cleared(dir: string): Promise<void> {
  header("C  CLEARED WHEN EMPTY: my bill synced, so I owe nothing");
  const d = await device(dir, "cleared");
  await d.bills.claimForSend(d.mineUnsentId, NOW);
  await d.bills.markSynced(d.mineUnsentId, "B-2569-2", 1, NOW);
  const owed = await d.engine.owedByKind();
  check("C1: I owe nothing (the other person's pending bill, parked bill and owed seller are theirs)",
    owed.bill_send === 0 && owed.bill_void === 0 && owed.seller_create === 0, JSON.stringify(owed));
  const sheet = signOutCardText(signOutCard({ owed, failed: 1, failure: null, session: "active", appOutdated: false }));
  console.log(`  sheet: ${sheet}`);
  check("C1: the sheet asks, says what is erased and what stays",
    sheet.startsWith("ออกจากระบบ?")
      && sheet.includes("เบอร์โทร ที่อยู่ และเลขบัตรประชาชนหรือเลขที่เอกสารของผู้ขาย จะถูกลบออกจากเครื่องนี้")
      && sheet.includes("รายชื่อผู้ขาย สินค้า และบิล ยังอยู่ในเครื่อง"));

  const idBefore = fileHas(d.file, REFUSED_ID);
  const phoneBefore = fileHas(d.file, CACHED_PHONE);
  const owedIdBefore = fileHas(d.file, OWED_ID);
  const before = await snapshot(d);
  const billsBefore = await count(d, "SELECT COUNT(*) AS n FROM local_bills");
  const tokens = new MemoryTokenStore("a-token");
  const out = await runSignOut(d, tokens);
  // App.tsx's handler clears the permission cache beside it.
  if (out.kind === "signed_out") await new SqlitePermissionStore(d.driver).clear();
  const after = await snapshot(d);

  check("C2: signed_out, personal data cleared, the token gone",
    out.kind === "signed_out" && out.personalData === "cleared" && (await tokens.load()) === null, JSON.stringify(out));
  console.log(`  status: ${out.kind === "signed_out" ? signedOutStatus(out.personalData) : "-"}`);
  check("C3 local_identity: CLEARED -- no row", (await count(d, "SELECT COUNT(*) AS n FROM local_identity")) === 0);
  const cs = await d.driver.all<{ id: string; name: string; phone: string | null; id_last4: string | null }>(
    "SELECT id, name, phone, id_last4 FROM cached_sellers ORDER BY id");
  check("C4 cached_sellers: phones CLEARED, both rows kept with name and last four",
    cs.length === 2 && cs.every((r) => r.phone === null && r.name.length > 0 && r.id_last4 !== null), JSON.stringify(cs));
  const ls = await d.driver.all<{ id: string; sync_state: string; phone: string | null; address: string | null; id_number: string | null; owner_user_id: string | null }>(
    "SELECT id, sync_state, phone, address, id_number, owner_user_id FROM local_sellers ORDER BY id");
  const by = new Map(ls.map((r) => [r.id, r]));
  console.log(`  local_sellers after: ${JSON.stringify(ls)}`);
  check("C5 local_sellers: my refused seller's row DELETED (it held the full ID)", !by.has("ls-refused"));
  check("C5 local_sellers: my settled seller KEPT, phone and address CLEARED",
    by.get("ls-settled")?.phone === null && by.get("ls-settled")?.address === null && by.get("ls-settled")?.id_number === null);
  check("C5 local_sellers: a refused seller a parked bill still waits on is KEPT (not stranded), its phone, address, ID CLEARED",
    by.get("ls-refused-held")?.sync_state === "failed" && by.get("ls-refused-held")?.phone === null
      && by.get("ls-refused-held")?.address === null && by.get("ls-refused-held")?.id_number === null);
  check("C5 local_sellers: the other person's OWED create is untouched -- its phone and full ID are what it will send",
    by.get("ls-owed")?.sync_state === "pending" && by.get("ls-owed")?.phone === "0811110004"
      && by.get("ls-owed")?.id_number === OWED_ID && by.get("ls-owed")?.owner_user_id === OTHER.user_id);
  check("C6 cached_permissions: CLEARED (App.tsx's handler)",
    (await count(d, "SELECT COUNT(*) AS n FROM cached_permissions")) === 0);
  const keptChanged = [...before.keys()].filter((t) => !CLEARED_TABLES.has(t) && before.get(t) !== after.get(t));
  const kept = [...before.keys()].filter((t) => !CLEARED_TABLES.has(t));
  console.log(`  kept, value-equal: ${kept.join(", ")}`);
  check(`C7 every other table (${String(kept.length)}) is value-equal -- bills, draft, shop, device, reserve, codes, caches`,
    kept.length >= 11 && keptChanged.length === 0 && kept.includes("local_bills") && kept.includes("local_draft")
      && kept.includes("local_seller_codes"), `changed: ${JSON.stringify(keptChanged)}`);
  check(`C8 local_bills: all ${String(billsBefore)} rows kept -- my synced and refused, the other person's pending and parked`,
    billsBefore === 5 && (await count(d, "SELECT COUNT(*) AS n FROM local_bills")) === 5
      && (await count(d, "SELECT COUNT(*) AS n FROM local_bills WHERE sync_state = 'failed'")) === 1);
  const owedAfter = await d.engine.owedByKind();
  check("C9 the other person's work is still owed after the clear (their pending bill is still unsent)",
    (await count(d, "SELECT COUNT(*) AS n FROM local_bills WHERE sync_state = 'pending'")) === 2
      && (await count(d, "SELECT COUNT(*) AS n FROM local_bills WHERE local_seller_parked_at IS NOT NULL")) === 1,
    `owedByKind with no identity: ${JSON.stringify(owedAfter)}`);

  const idAfter = fileHas(d.file, REFUSED_ID);
  const phoneAfter = fileHas(d.file, CACHED_PHONE);
  const owedIdAfter = fileHas(d.file, OWED_ID);
  await d.driver.close();
  const idClosed = fileHas(d.file, REFUSED_ID);
  const phoneClosed = fileHas(d.file, CACHED_PHONE);
  console.log(`  bytes before: refused ID ${idBefore ? "FOUND" : "absent"}; cached phone ${phoneBefore ? "FOUND" : "absent"}; owed ID ${owedIdBefore ? "FOUND" : "absent"}`);
  console.log(`  bytes after (open): refused ID ${idAfter ? "FOUND" : "absent"}; cached phone ${phoneAfter ? "FOUND" : "absent"}; owed ID ${owedIdAfter ? "FOUND" : "absent"}`);
  console.log(`  bytes after (closed): refused ID ${idClosed ? "FOUND" : "absent"}; cached phone ${phoneClosed ? "FOUND" : "absent"}`);
  check("B1: control -- before, the byte search FINDS the refused ID and the cached phone", idBefore && phoneBefore);
  check("B1: control -- after, it still FINDS the owed seller's ID, which was kept", owedIdAfter);
  check("B1: after, neither the refused ID nor the cached phone is in the file or its WAL (open, then closed)",
    !idAfter && !phoneAfter && !idClosed && !phoneClosed);
}

async function keystoreRefuses(dir: string): Promise<void> {
  header("F  THE KEYSTORE REFUSES: nothing in the file changes");
  const d = await device(dir, "keystore");
  await d.bills.claimForSend(d.mineUnsentId, NOW);
  await d.bills.markSynced(d.mineUnsentId, "B-2569-3", 1, NOW);
  const before = await snapshot(d);
  const out = await runSignOut(d, { clear: () => Promise.resolve({ kind: "failed", reason: "keystore said no" }) });
  const after = await snapshot(d);
  const changed = [...before.keys()].filter((t) => before.get(t) !== after.get(t));
  check("F1: failed, and every table value-equal -- the clear runs only after the token is gone",
    out.kind === "failed" && changed.length === 0, `${out.kind} changed: ${JSON.stringify(changed)}`);
  await d.driver.close();
  check("F1: the status a failed clear would show still says signed out, and that the data stayed",
    signedOutStatus("failed").startsWith("ออกจากระบบแล้ว แต่ลบ") && signedOutStatus("failed").includes("ไม่สำเร็จ"));
}

async function main(): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "prove-signoutclear-"));
  try {
    await refused(dir);
    await cleared(dir);
    await keystoreRefuses(dir);
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      console.log(`  (left behind: ${dir})`);
    }
  }
  console.log(`\n${failures === 0 ? "ALL SIGN-OUT CLEAR CASES PASSED" : `FAILED — ${String(failures)} check(s)`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err: unknown) => {
    console.error("SIGNOUTCLEAR PROOF CRASHED:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    console.log(`PROVE_SIGNOUTCLEAR_EXIT=${String(process.exitCode ?? 0)}`);
  });
