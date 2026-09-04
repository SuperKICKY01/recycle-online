/**
 * Branches on the phone (server migration 0018) — the SURVIVAL cell and the
 * cache that feeds a new bill's branch.
 *
 * Run: npm run prove:branch
 *
 * THE ONE THING THAT CAN LOSE A SHOP'S WORK. A bill sitting in this device's
 * outbox was built by a bundle that knows nothing of branches: its payload JSON
 * has no `branch_id` key, and the transport posts that JSON byte for byte
 * (httpTransport.sendBill). On the server a REQUIRED branch_id would answer it
 * 422, which this device classifies as terminal — sync_state='failed', never
 * retried, void withheld, cash already paid. The server therefore made the
 * field OPTIONAL and resolves it itself (migration 0018's docstring holds the
 * file:line chain). This proof is the PHONE half of that argument:
 *
 *   B1  a device at the previous local schema (a `local_shop` with no
 *       branch_id column) migrates ADDITIVELY: exactly `local_shop.branch_id`
 *       is added, the shop row keeps its tenant_id, a second run adds nothing.
 *   B2  THE SURVIVAL CELL: a bill built while no branch is known is stored and
 *       drained through the real SyncEngine, and the body the transport sent
 *       has NO `branch_id` key at all — the pre-0018 wire shape, unchanged —
 *       and the bill settles as synced with a doc_no.
 *   B3  the cache: readBranch is null until learned; saveBranch for a different
 *       tenant is a no-op; saveBranch for this tenant is read back; save() of
 *       the same shop keeps it; save() of a DIFFERENT shop drops it.
 *   B4  once a branch is cached, a new bill carries `branch_id` in its payload
 *       and the transport sends it — and a bill built with `branch_id: null`
 *       carries no key (null is never serialised onto the wire).
 *   B5  readShopBranch: the parser that feeds the cache from a /shop body —
 *       an object branch yields its id; a null branch yields null (clear the
 *       cache); an absent branch (pre-0018 server) yields null; a body with no
 *       string id, or a branch that is not an object, yields null (write
 *       nothing); a branch object with no string id yields null too.
 *
 * Every cell runs headless against node:sqlite and the in-process FakeServer;
 * the real server's half is server/scripts/prove_branches.py.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { initConnection } from "../adapters/sqlite/schema.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { SqliteShopStore } from "../adapters/sqlite/SqliteShopStore.js";
import { readShopBranch } from "../settings/shopSettings.js";
import { buildLocalBill } from "../sync/createBill.js";
import type { BillDraft } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import type {
  BillPayload,
  LocalBill,
  SendOutcome,
  Transport,
  VoidOutcome,
} from "../sync/types.js";
import {
  FakeClock,
  FakeServer,
  noSellerKind,
  OnlineTransport,
  PROOF_OWNER,
  SeqIds,
} from "./fakes.js";
import { signInProofDevice } from "./proofDevice.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function tempDir(name: string): string {
  return mkdtempSync(join(tmpdir(), `recycle-branch-${name}-`));
}

const ITEM = {
  id: "item-1",
  product_id: "prod-1",
  line_no: 1,
  gross_weight: "10.005",
  tare_weight: "0.002",
  net_weight: "10.003",
  unit_price: "15.00",
  list_price: "15.00",
};

const OTHER_TENANT = "00000000-0000-4000-8000-00000000cccc";
const BRANCH_MAIN = "11111111-2222-4333-8444-555555555555";
const BRANCH_TWO = "66666666-7777-4888-8999-000000000000";

/**
 * The wire body as the transport would post it: the fake server receives the
 * payload OBJECT, so this transport also records the JSON the HTTP transport
 * would have sent — `JSON.stringify(bill.payload)` (httpTransport.ts) — and it
 * is the JSON, not the object, that the cells read, because a key holding
 * `undefined` exists on the object and not on the wire.
 */
class RecordingTransport implements Transport {
  readonly sentJson: string[] = [];
  private readonly inner: OnlineTransport;

  constructor(server: FakeServer) {
    this.inner = new OnlineTransport(server);
  }

  sendBill(bill: LocalBill): Promise<SendOutcome> {
    this.sentJson.push(JSON.stringify(bill.payload));
    return this.inner.sendBill(bill);
  }

  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    return this.inner.voidBill(bill, reason);
  }
}

function draft(branch_id?: string | null): BillDraft {
  const d: BillDraft = {
    seller: { kind: "server", seller_id: "seller-1" },
    vehicle_no: null,
    items: [ITEM],
    total_amount: "150.05",
    master_as_of: null,
  };
  if (branch_id !== undefined) d.branch_id = branch_id;
  return d;
}

/* ------------------------------------------------------------------ B1 ---- */

async function b1AdditiveMigration(): Promise<{ dir: string; file: string }> {
  header("B1: a local_shop at the previous schema gains branch_id additively");
  const dir = tempDir("migrate");
  const file = join(dir, "old.db");

  // local_shop EXACTLY as it shipped before 0018: three columns, no branch.
  const pre = NodeSqliteDriver.open(file);
  await pre.exec("PRAGMA busy_timeout = 5000");
  await pre.exec(`CREATE TABLE local_shop (
     only_row   INTEGER NOT NULL PRIMARY KEY CHECK (only_row = 1),
     tenant_id  TEXT    NOT NULL,
     updated_at TEXT    NOT NULL
   ) STRICT`);
  await pre.run(
    "INSERT INTO local_shop (only_row, tenant_id, updated_at) VALUES (1, ?, ?)",
    [PROOF_OWNER.tenant_id, "2026-08-01T00:00:00.000Z"],
  );
  const before = await pre.all<{ name: string }>("PRAGMA table_info(local_shop)");
  await pre.close();
  console.log(`  before: local_shop has ${String(before.length)} columns`);

  const driver = NodeSqliteDriver.open(file);
  const added = await initConnection(driver);
  const after = await driver.all<{ name: string }>("PRAGMA table_info(local_shop)");
  console.log(`  migration added: ${JSON.stringify(added)}`);
  // local_bills is created FRESH here (this staged database never had one) and
  // three of its columns live only in ADDED_BILL_COLUMNS, so they are added on
  // every fresh install too -- the same shape proveVoid V0 asserts. What this
  // cell pins is that local_shop gained exactly its one column and that no
  // OTHER table was altered by surprise.
  check(
    "local_shop.branch_id was added, and nothing else outside local_bills",
    added.includes("local_shop.branch_id") &&
      added.every((c) => c === "local_shop.branch_id" || c.startsWith("local_bills.")),
    JSON.stringify(added),
  );
  check(
    "local_shop now has the branch_id column",
    after.some((c) => c.name === "branch_id") && after.length === before.length + 1,
    `${String(before.length)} -> ${String(after.length)} columns`,
  );
  const row = await driver.all<{ tenant_id: string; branch_id: string | null }>(
    "SELECT tenant_id, branch_id FROM local_shop WHERE only_row = 1",
  );
  check(
    "the shop row survived with its tenant_id, branch_id NULL (not yet learned)",
    row[0]?.tenant_id === PROOF_OWNER.tenant_id && row[0]?.branch_id === null,
    JSON.stringify(row),
  );
  const again = await initConnection(driver);
  check("re-running the migration adds nothing", again.length === 0, JSON.stringify(again));
  await driver.close();
  return { dir, file };
}

/* ------------------------------------------------------------------ B2 ---- */

async function b2Survival(file: string): Promise<void> {
  header("B2: THE SURVIVAL CELL — a bill with no branch drains unchanged and settles");
  const driver = NodeSqliteDriver.open(file);
  const store = await SqliteLocalStore.open(driver);
  await signInProofDevice(driver);
  const shopStore = new SqliteShopStore(driver);
  const branchBefore = await shopStore.readBranch(PROOF_OWNER.tenant_id);
  check("no branch is known on this device yet", branchBefore === null, String(branchBefore));

  // Built exactly as App.tsx builds one when readBranch answers null.
  const ids = new SeqIds("survive");
  const bill = buildLocalBill(
    { clock: new FakeClock("2026-09-03T08:00:00.000Z"), ids },
    draft(branchBefore),
  );
  check(
    "the stored payload has NO branch_id key (the pre-0018 shape)",
    !("branch_id" in bill.payload) && !JSON.stringify(bill.payload).includes("branch_id"),
    JSON.stringify(bill.payload),
  );
  await store.putBill(bill, PROOF_OWNER);

  const server = new FakeServer();
  const transport = new RecordingTransport(server);
  const clock = new FakeClock("2026-09-03T08:01:00.000Z");
  const engine = new SyncEngine({ ...noSellerKind(), store, transport, clock });
  const run = await engine.runOnce();
  const after = await store.getBill(bill.id);
  console.log(`  runOnce -> ${JSON.stringify(run)}  synced=${String(after?.sync_state)} doc_no=${String(after?.doc_no)}`);
  check("the engine sent it", run.attempted === 1 && transport.sentJson.length === 1);
  check(
    "the body on the wire carries NO branch_id key",
    transport.sentJson.length === 1 && !transport.sentJson[0]!.includes("branch_id"),
    transport.sentJson[0] ?? "(nothing sent)",
  );
  check(
    "the bill settled: synced, with the server's doc_no",
    after?.sync_state === "synced" && typeof after.doc_no === "string" && after.doc_no.length > 0,
    `state=${String(after?.sync_state)} doc_no=${String(after?.doc_no)}`,
  );
  check("nothing was marked failed", (await store.listByState("failed")).length === 0);
  await driver.close();
}

/* ------------------------------------------------------------------ B3 ---- */

async function b3Cache(file: string): Promise<void> {
  header("B3: the branch cache is keyed on the tenant it was learned under");
  const driver = NodeSqliteDriver.open(file);
  await initConnection(driver);
  const shop = new SqliteShopStore(driver);

  await shop.saveBranch(OTHER_TENANT, BRANCH_TWO);
  check(
    "saveBranch for a DIFFERENT tenant is a no-op",
    (await shop.readBranch(PROOF_OWNER.tenant_id)) === null &&
      (await shop.readBranch(OTHER_TENANT)) === null,
  );
  await shop.saveBranch(PROOF_OWNER.tenant_id, BRANCH_MAIN);
  check(
    "saveBranch for this tenant is read back for this tenant only",
    (await shop.readBranch(PROOF_OWNER.tenant_id)) === BRANCH_MAIN &&
      (await shop.readBranch(OTHER_TENANT)) === null,
  );
  await shop.save({ tenant_id: PROOF_OWNER.tenant_id });
  check(
    "re-saving the SAME shop keeps the cached branch",
    (await shop.readBranch(PROOF_OWNER.tenant_id)) === BRANCH_MAIN,
  );
  await shop.save({ tenant_id: OTHER_TENANT });
  check(
    "saving a DIFFERENT shop drops it (the branch belonged to the old shop)",
    (await shop.readBranch(OTHER_TENANT)) === null &&
      (await shop.readBranch(PROOF_OWNER.tenant_id)) === null,
  );
  await shop.saveBranch(OTHER_TENANT, BRANCH_TWO);
  await shop.saveBranch(OTHER_TENANT, null);
  check("saveBranch(null) clears it", (await shop.readBranch(OTHER_TENANT)) === null);
  // Put the device back on the proof shop, branch learned, for B4.
  await shop.save({ tenant_id: PROOF_OWNER.tenant_id });
  await shop.saveBranch(PROOF_OWNER.tenant_id, BRANCH_MAIN);
  await driver.close();
}

/* ------------------------------------------------------------------ B4 ---- */

async function b4CarriesBranch(file: string): Promise<void> {
  header("B4: once learned, a new bill carries branch_id on the wire; null never does");
  const driver = NodeSqliteDriver.open(file);
  const store = await SqliteLocalStore.open(driver);
  await signInProofDevice(driver);
  const shop = new SqliteShopStore(driver);
  const learned = await shop.readBranch(PROOF_OWNER.tenant_id);
  check("the branch is cached from B3", learned === BRANCH_MAIN, String(learned));

  const ids = new SeqIds("carry");
  const withBranch = buildLocalBill(
    { clock: new FakeClock("2026-09-03T09:00:00.000Z"), ids },
    draft(learned),
  );
  const withNull = buildLocalBill(
    { clock: new FakeClock("2026-09-03T09:00:01.000Z"), ids },
    draft(null),
  );
  check(
    "a bill built with the cached branch carries it in its payload",
    (withBranch.payload as BillPayload).branch_id === BRANCH_MAIN,
    JSON.stringify(withBranch.payload),
  );
  check(
    "a bill built with branch_id: null carries NO key (null is never serialised)",
    !("branch_id" in withNull.payload) && !JSON.stringify(withNull.payload).includes("branch_id"),
    JSON.stringify(withNull.payload),
  );
  await store.putBill(withBranch, PROOF_OWNER);
  await store.putBill(withNull, PROOF_OWNER);

  const server = new FakeServer();
  const transport = new RecordingTransport(server);
  const engine = new SyncEngine({
    ...noSellerKind(), store, transport, clock: new FakeClock("2026-09-03T09:02:00.000Z"),
  });
  const run = await engine.runOnce();
  console.log(`  runOnce -> ${JSON.stringify(run)}`);
  const sentWith = transport.sentJson.find((j) => j.includes(withBranch.id));
  const sentNull = transport.sentJson.find((j) => j.includes(withNull.id));
  check(
    "the wire body of the branch bill names the branch",
    sentWith !== undefined && sentWith.includes(`"branch_id":"${BRANCH_MAIN}"`),
    sentWith ?? "(not sent)",
  );
  check(
    "the wire body of the null bill has no branch_id key",
    sentNull !== undefined && !sentNull.includes("branch_id"),
    sentNull ?? "(not sent)",
  );
  check(
    "both settled as synced",
    (await store.getBill(withBranch.id))?.sync_state === "synced" &&
      (await store.getBill(withNull.id))?.sync_state === "synced",
  );
  await driver.close();
}

/* ------------------------------------------------------------------ B5 ---- */

function b5Parser(): void {
  header("B5: readShopBranch — what feeds the cache from a /shop body");
  const shopId = PROOF_OWNER.tenant_id;
  const full = {
    id: shopId, name: "x", default_grade: null, address: null, phone: null,
    staff_money_visible: false,
    branch: { id: BRANCH_MAIN, code: "MAIN", name: "x", doc_prefix: "B", is_active: true },
    branch_count: 1,
  };
  const r1 = readShopBranch(full);
  check("an object branch yields its id", r1?.shop_id === shopId && r1.branch_id === BRANCH_MAIN, JSON.stringify(r1));
  const r2 = readShopBranch({ ...full, branch: null, branch_count: 2 });
  check("a null branch yields branch_id null (clear the cache)", r2?.shop_id === shopId && r2.branch_id === null, JSON.stringify(r2));
  const { branch: _dropped, ...pre0018 } = full;
  void _dropped;
  const r3 = readShopBranch(pre0018);
  check("an ABSENT branch (a pre-0018 server) yields null (clear the cache)", r3?.shop_id === shopId && r3.branch_id === null, JSON.stringify(r3));
  check("a body with no string id yields null (write nothing)", readShopBranch({ ...full, id: 7 }) === null);
  check("a branch that is not an object yields null (write nothing)", readShopBranch({ ...full, branch: "MAIN" }) === null);
  check("a branch object with no string id yields null (write nothing)", readShopBranch({ ...full, branch: { code: "MAIN" } }) === null);
  check("a non-object body yields null", readShopBranch(null) === null && readShopBranch([full]) === null);
}

/* ---------------------------------------------------------------- main ---- */

async function main(): Promise<void> {
  const { dir, file } = await b1AdditiveMigration();
  try {
    await b2Survival(file);
    await b3Cache(file);
    await b4CarriesBranch(file);
    b5Parser();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n${failures === 0 ? "PROVE BRANCH OK" : `PROVE BRANCH FAILED — ${String(failures)} cell(s)`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exitCode = 1;
});
