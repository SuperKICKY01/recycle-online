/**
 * P1.7 proof: the VOID queue selects only voids ORDERED BY whoever is signed in.
 *
 * Run: npm run prove:voidowner
 *
 * THE VOID'S OWNER IS THE REQUESTER, NOT THE BILL'S OWNER, and this proof is
 * built around that distinction rather than assuming it. The server records
 * created_by for the sender and voided_by for the voider as two separate
 * columns because they are two separate acts; voiding is admin-only while
 * weighing is not, so keying this queue to the bill's owner would route an
 * admin's cancellation to the staff member who weighed the load, who cannot
 * perform it — the reversal would be refused for ever. W1 therefore includes a
 * void ordered by B on a bill owned by NOBODY, and requires it to go.
 *
 * IT REACHES NO CONCLUSION THROUGH A SEND ASSERTION. Bills are synced first
 * because listVoidsToApply requires it, but every assertion below is about the
 * void queue, the void attempt counts, or the void columns on the row. Nothing
 * here passes or fails on whether a bill sent.
 *
 * WHAT THIS DOES NOT ESTABLISH. node:sqlite, not the handset's expo-sqlite.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteIdentityStore } from "../adapters/sqlite/SqliteIdentityStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { createLocalBill } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import type { LocalBill, RowOwner, SendOutcome, Transport, VoidOutcome } from "../sync/types.js";
import {
  FakeClock,
  FakeServer,
  noSellerKind,
  OnlineTransport,
  SeqIds,
} from "./fakes.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/** One shop, two admins. The silent misattribution lives inside one tenant. */
const TENANT: string = "11111111-1111-4111-8111-111111111111";
const USER_A: string = "22222222-2222-4222-8222-222222222222";
const USER_B: string = "33333333-3333-4333-8333-333333333333";
const OWNER_A: RowOwner = { tenant_id: TENANT, user_id: USER_A };
const OWNER_B: RowOwner = { tenant_id: TENANT, user_id: USER_B };

const ITEM = {
  id: "item-1",
  product_id: "prod-1",
  line_no: 1,
  gross_weight: "10.000",
  tare_weight: "0.000",
  net_weight: "10.000",
  unit_price: "15.00",
  list_price: "15.00",
  amount: "150.00",
};

const PASSES = 4;

/** Counts every void request, and answers by id. */
class VoidCounter implements Transport {
  readonly calls = new Map<string, number>();

  constructor(private readonly rejected = new Set<string>()) {}

  count(id: string): number {
    return this.calls.get(id) ?? 0;
  }

  sendBill(): Promise<SendOutcome> {
    return Promise.resolve({ kind: "accepted", doc_no: "B-2569-1" });
  }

  voidBill(bill: LocalBill): Promise<VoidOutcome> {
    this.calls.set(bill.id, this.count(bill.id) + 1);
    if (this.rejected.has(bill.id)) {
      return Promise.resolve({ kind: "rejected", reason: "HTTP 404: bill not found" });
    }
    // Never confirms, so a bill that IS selected keeps being asked and its count
    // rises — which is what makes "zero" mean excluded rather than merely done.
    return Promise.resolve({ kind: "unavailable", reason: "network: unreachable" });
  }
}

interface Bench {
  dir: string;
  d: NodeSqliteDriver;
  store: SqliteLocalStore;
  identity: SqliteIdentityStore;
  clock: FakeClock;
  ids: SeqIds;
}

async function bench(name: string): Promise<Bench> {
  const dir = mkdtempSync(join(tmpdir(), `recycle-voidowner-${name}-`));
  const d = NodeSqliteDriver.open(join(dir, `${name}.db`));
  const store = await SqliteLocalStore.open(d);
  return {
    dir,
    d,
    store,
    identity: new SqliteIdentityStore(d),
    clock: new FakeClock(),
    ids: new SeqIds(name),
  };
}

async function teardown(x: Bench): Promise<void> {
  await x.d.close();
  rmSync(x.dir, { recursive: true, force: true });
}

/** A bill owned by `owner`, sent to a server so it has a doc_no. */
async function syncedBill(x: Bench, owner: RowOwner): Promise<string> {
  await x.identity.save(owner);
  const bill = await createLocalBill(
    { store: x.store, clock: x.clock, ids: x.ids },
    { seller_id: "s-1", vehicle_no: null, items: [ITEM], total_amount: "150.00", master_as_of: null },
    owner,
  );
  const e = new SyncEngine({ ...noSellerKind(),
    store: x.store,
    transport: new OnlineTransport(new FakeServer()),
    clock: x.clock,
  });
  await e.runUntilQuiescent(5);
  return bill.id;
}

/**
 * A bill with NO owner, forced to synced by hand.
 *
 * It cannot get there through the engine — the send queue excludes an unowned
 * row — and that is exactly the point: this models a bill synced before the
 * owner columns existed, which is the only way such a row occurs in the wild.
 */
async function stagedUnownedSyncedBill(x: Bench): Promise<string> {
  const bill = await createLocalBill(
    { store: x.store, clock: x.clock, ids: x.ids },
    { seller_id: "s-1", vehicle_no: null, items: [ITEM], total_amount: "150.00", master_as_of: null },
    null,
  );
  await x.d.run(
    "UPDATE local_bills SET sync_state = 'synced', doc_no = 'B-2569-U' WHERE id = ?",
    [bill.id],
  );
  return bill.id;
}

const voidCols = async (
  x: Bench,
  id: string,
): Promise<Record<string, string | null>> => {
  const r = await x.d.all<Record<string, string | null>>(
    `SELECT void_requested_at, void_requested_by_tenant_id, void_requested_by_user_id,
            void_refused_at, void_refused_code, voided_at
       FROM local_bills WHERE id = ?`,
    [id],
  );
  return r[0] ?? {};
};

/* ------------------------------------------------------------------ W1 ---- */

async function w1SelectionByRequester(): Promise<void> {
  header("W1 — signed in as B: B's voids are picked up, A's are not (3a, 3b)");
  const x = await bench("w1");

  /*
   * EVERY BILL IS CREATED BEFORE ANY VOID IS REQUESTED, and the ordering is
   * load-bearing rather than tidy. syncedBill runs a real SyncEngine to get a
   * doc_no, and runUntilQuiescent runs the VOID loop as well as the send loop —
   * against a throwaway FakeServer that has never heard of the other bills. A
   * void requested before that call is therefore pushed at a server that
   * answers not_found, which this client maps to `rejected` and now marks
   * PERMANENTLY REFUSED. Requesting first would poison the very rows under
   * test, and the case would report zero attempts for a reason that has nothing
   * to do with ownership.
   */
  const billA = await syncedBill(x, OWNER_A);
  const billB = await syncedBill(x, OWNER_B);
  const billX = await syncedBill(x, OWNER_B);
  const billU = await stagedUnownedSyncedBill(x);

  // A orders a cancellation of A's own bill.
  await x.identity.save(OWNER_A);
  check("CONTROL: A's void request was accepted", await x.store.requestVoid(billA, "A ยกเลิก", x.clock.now()));

  // B orders two: one on B's bill, one on the bill nobody owns.
  await x.identity.save(OWNER_B);
  check("CONTROL: B's void request was accepted", await x.store.requestVoid(billB, "B ยกเลิก", x.clock.now()));
  check(
    "CONTROL: B's void on the UNOWNED bill was accepted",
    await x.store.requestVoid(billU, "B ยกเลิก unowned", x.clock.now()),
  );

  // A void recorded with NO requester — an upgraded device's existing row.
  await x.d.run(
    `UPDATE local_bills SET void_reason = 'legacy', void_requested_at = ?,
        void_requested_by_tenant_id = NULL, void_requested_by_user_id = NULL
      WHERE id = ?`,
    [x.clock.now().toISOString(), billX],
  );

  const present = await x.d.all<{ n: number }>(
    "SELECT count(*) AS n FROM local_bills WHERE void_requested_at IS NOT NULL",
  );
  console.log(`  rows with a void requested, on disk: ${String(present[0]?.n ?? -1)} (expect 4)`);
  check("CONTROL: all four void requests are in the table", (present[0]?.n ?? -1) === 4);
  console.log(`  A's bill   : ${JSON.stringify(await voidCols(x, billA))}`);
  console.log(`  B's bill   : ${JSON.stringify(await voidCols(x, billB))}`);
  console.log(`  unowned    : ${JSON.stringify(await voidCols(x, billU))}`);
  console.log(`  no requester: ${JSON.stringify(await voidCols(x, billX))}`);

  const transport = new VoidCounter();
  const engine = new SyncEngine({ ...noSellerKind(), store: x.store, transport, clock: x.clock });
  for (let i = 0; i < PASSES; i += 1) await engine.runOnce();

  const a = transport.count(billA);
  const b = transport.count(billB);
  const u = transport.count(billU);
  const nx = transport.count(billX);
  console.log(`  void attempts over ${String(PASSES)} passes — A=${String(a)} B=${String(b)} unowned=${String(u)} no-requester=${String(nx)}`);

  // ---- 3a ----------------------------------------------------------------
  check("ZERO of A's voids were picked up", a === 0, `A=${String(a)}`);
  check(
    "a NON-ZERO count of B's were — the void loop has not simply stopped",
    b > 0,
    `B=${String(b)}`,
  );
  check("and B's rose once per pass", b === PASSES, `B=${String(b)} passes=${String(PASSES)}`);

  // ---- 3b: the choice STEP 1 made ----------------------------------------
  check(
    "3b: a void B ordered on a bill owned by NOBODY IS picked up — the void's owner is the requester",
    u === PASSES,
    `unowned=${String(u)}`,
  );
  check(
    "CONTROL: and that bill really has no owner, so it is not passing because it is B's",
    (
      await x.d.all<{ n: number }>(
        "SELECT count(*) AS n FROM local_bills WHERE id = ? AND owner_tenant_id IS NULL AND owner_user_id IS NULL",
        [billU],
      )
    )[0]?.n === 1,
  );
  check(
    "3b: a void with NO RECORDED REQUESTER is NOT picked up — unknown is not mine",
    nx === 0,
    `no-requester=${String(nx)}`,
  );
  check(
    "CONTROL: and that row IS in the table with a void requested",
    (await voidCols(x, billX)).void_requested_at !== null,
    JSON.stringify(await voidCols(x, billX)),
  );

  const queue = (await x.store.listVoidsToApply(10)).map((r) => r.id).sort().join(",");
  console.log(`  listVoidsToApply -> ${queue}`);
  check(
    "the queue holds exactly B's two and nothing else",
    queue === [billB, billU].sort().join(","),
    queue,
  );

  await teardown(x);
}

/* ------------------------------------------------------------------ W2 ---- */

/**
 * 3c. Ownership and permanent refusal filter the SAME statement. Neither may
 * swallow the other: a refused void must stay out even though its requester
 * matches, and an un-refused void of the same requester must still go.
 */
async function w2BothMechanismsAtOnce(): Promise<void> {
  header("W2 — ownership and permanent refusal act together, neither masking the other (3c)");
  const x = await bench("w2");

  const billRefused = await syncedBill(x, OWNER_B);
  const billOk = await syncedBill(x, OWNER_B);
  const billA = await syncedBill(x, OWNER_A);

  await x.identity.save(OWNER_A);
  await x.store.requestVoid(billA, "A ยกเลิก", x.clock.now());
  await x.identity.save(OWNER_B);
  await x.store.requestVoid(billRefused, "B ยกเลิก 1", x.clock.now());
  await x.store.requestVoid(billOk, "B ยกเลิก 2", x.clock.now());

  const transport = new VoidCounter(new Set([billRefused]));
  const engine = new SyncEngine({ ...noSellerKind(), store: x.store, transport, clock: x.clock });
  for (let i = 0; i < PASSES; i += 1) await engine.runOnce();

  const r = transport.count(billRefused);
  const o = transport.count(billOk);
  const a = transport.count(billA);
  console.log(`  attempts — B/permanently-refused=${String(r)}  B/ok=${String(o)}  A's=${String(a)}`);
  console.log(`  refused row: ${JSON.stringify(await voidCols(x, billRefused))}`);

  check("B's permanently refused void was asked ONCE and stopped", r === 1, `attempts=${String(r)}`);
  check(
    "DIRECTION: B's other void, same requester, is STILL being asked every pass",
    o === PASSES,
    `attempts=${String(o)} passes=${String(PASSES)}`,
  );
  check("A's void is still excluded by ownership throughout", a === 0, `attempts=${String(a)}`);
  check(
    "the refusal mechanism did not swallow the ownership one, nor the reverse",
    r === 1 && o === PASSES && a === 0,
    `refused=${String(r)} ok=${String(o)} A=${String(a)}`,
  );
  check(
    "the two exclusions are distinguishable ON THE ROW: refusal stamps a column, ownership does not",
    (await voidCols(x, billRefused)).void_refused_at !== null &&
      (await voidCols(x, billA)).void_refused_at === null,
    `refused=${JSON.stringify(await voidCols(x, billRefused))} A=${JSON.stringify(await voidCols(x, billA))}`,
  );

  await teardown(x);
}

/* ------------------------------------------------------------------ W3 ---- */

/**
 * 3d. resumeAfterSignIn retracts void refusals. It must retract only the ones
 * belonging to the person who just signed in — asserted on the columns, per
 * bill, not inferred from the queue.
 */
async function w3SignInDoesNotReleaseAnothersVoids(): Promise<void> {
  header("W3 — a sign-in retracts only the signer's own void refusals (3d)");
  const x = await bench("w3");

  const billA = await syncedBill(x, OWNER_A);
  const billB = await syncedBill(x, OWNER_B);

  await x.identity.save(OWNER_A);
  await x.store.requestVoid(billA, "A ยกเลิก", x.clock.now());
  await x.identity.save(OWNER_B);
  await x.store.requestVoid(billB, "B ยกเลิก", x.clock.now());

  // Both refused on IDENTITY grounds (403), which is the retractable kind.
  const now = x.clock.now();
  await x.store.markVoidRefused(billA, "admin_required", "HTTP 403", 1, now);
  await x.store.markVoidRefused(billB, "admin_required", "HTTP 403", 1, now);
  check(
    "CONTROL: both voids are refused before the sign-in",
    (await voidCols(x, billA)).void_refused_at !== null &&
      (await voidCols(x, billB)).void_refused_at !== null,
  );

  // B signs in.
  await x.identity.save(OWNER_B);
  const engine = new SyncEngine({ ...noSellerKind(),
    store: x.store,
    transport: new VoidCounter(),
    clock: x.clock,
  });
  const freed = await engine.resumeAfterSignIn();
  const aAfter = await voidCols(x, billA);
  const bAfter = await voidCols(x, billB);
  console.log(`  resumeAfterSignIn freed=${String(freed)}`);
  console.log(`  A's void after B signed in: ${JSON.stringify(aAfter)}`);
  console.log(`  B's void after B signed in: ${JSON.stringify(bAfter)}`);

  check(
    "A's refusal SURVIVES B's sign-in — it was never B's to retract",
    aAfter.void_refused_at !== null,
    JSON.stringify(aAfter),
  );
  check(
    "DIRECTION: B's own refusal WAS retracted, so the routine still does its job",
    bAfter.void_refused_at === null,
    JSON.stringify(bAfter),
  );
  check("and it reports retracting exactly one", freed === 1, `freed=${String(freed)}`);

  const queue = (await x.store.listVoidsToApply(10)).map((r) => r.id).join(",");
  console.log(`  listVoidsToApply after the sign-in -> ${queue}`);
  check("A's void was not handed back to the queue either", queue === billB, queue);

  await teardown(x);
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("P1.7 — the void queue selects only voids ordered by the signed-in person");
  console.log(`node ${process.version}, node:sqlite against real files in ${tmpdir()}`);

  await w1SelectionByRequester();
  await w2BothMechanismsAtOnce();
  await w3SignInDoesNotReleaseAnothersVoids();

  console.log("");
  console.log(failures === 0 ? "ALL VOID-OWNER CASES PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => {
    console.log(`VOIDOWNER_EXIT=${code}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("VOID-OWNER PROOF CRASHED:", err);
    process.exitCode = 1;
  });
