/**
 * P1.7 proof: the SEND queue selects only rows owned by whoever is signed in.
 *
 * Run: npm run prove:sendowner
 *
 * A AND B SHARE A TENANT AND DIFFER ONLY BY USER, deliberately. Across shops the
 * wrong token is refused terminally and the bill dies loudly; within one shop
 * the same send returns 201 and records the wrong person as the buyer, and
 * nothing downstream can detect or correct it. The silent half is the one worth
 * proving, and a fixture whose two identities differed by tenant would pass a
 * filter that only ever compared tenants — which is exactly the mutation D1
 * applies below.
 *
 * WHAT EACH CASE IS FOR
 *   E1  the queue, and the engine's real send: zero of A's bills, non-zero of
 *       B's, both counts printed. A case containing only A's bills goes green
 *       because nothing sends at all, which is indistinguishable from an engine
 *       that has stopped working — so B's non-zero count is not decoration.
 *   E2  unowned rows are not selected, with a control that they are PRESENT.
 *   E3  resumeAfterSignIn, asserted directly rather than inferred from E1.
 *
 * NOT ROUTED THROUGH listReadyToSend OR listMasterDataBlocked. Both were
 * measured to have no production caller, and a green over a query the app never
 * issues is evidence about nothing a handset does. Every selection below is read
 * through listPendingOldestFirst, claimForSend, pendingQueueSnapshot or the
 * engine itself.
 *
 * WHAT THIS DOES NOT ESTABLISH. node:sqlite, not the handset's expo-sqlite. And
 * the VOID queue is untouched by this filter and by this proof — see the note on
 * the QUEUED constant in SqliteLocalStore.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteIdentityStore } from "../adapters/sqlite/SqliteIdentityStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { createLocalBill } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import type { LocalBill, RowOwner } from "../sync/types.js";
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

/** One shop. Two people in it. The silent failure lives in this shape. */
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

interface Bench {
  dir: string;
  d: NodeSqliteDriver;
  store: SqliteLocalStore;
  identity: SqliteIdentityStore;
  clock: FakeClock;
  server: FakeServer;
  engine: SyncEngine;
  a: string[];
  b: string[];
  none: string[];
}

/**
 * Two bills for A, three for B, two owned by nobody — on one real file.
 *
 * The counts are uneven on purpose: if selection ever returned a fixed number
 * the asymmetry shows it, where 2/2/2 would not.
 */
async function bench(name: string): Promise<Bench> {
  const dir = mkdtempSync(join(tmpdir(), `recycle-sendowner-${name}-`));
  const d = NodeSqliteDriver.open(join(dir, `${name}.db`));
  const store = await SqliteLocalStore.open(d);
  const identity = new SqliteIdentityStore(d);
  const clock = new FakeClock();
  const ids = new SeqIds(name);
  const server = new FakeServer();
  const engine = new SyncEngine({ ...noSellerKind(),
    store,
    transport: new OnlineTransport(server),
    clock,
    backoffBaseMs: 1000,
  });

  const make = async (owner: RowOwner | null, n: number): Promise<string[]> => {
    const out: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const bill: LocalBill = await createLocalBill(
        { store, clock, ids },
        {
          seller: { kind: "server", seller_id: "sell-1" },
          vehicle_no: null,
          items: [ITEM],
          total_amount: "150.00",
          master_as_of: null,
        },
        owner,
      );
      out.push(bill.id);
    }
    return out;
  };

  const a = await make(OWNER_A, 2);
  const b = await make(OWNER_B, 3);
  const none = await make(null, 2);
  return { dir, d, store, identity, clock, server, engine, a, b, none };
}

async function teardown(x: Bench): Promise<void> {
  await x.d.close();
  rmSync(x.dir, { recursive: true, force: true });
}

/** How many rows are physically in the table, whatever the queue thinks. */
async function rowsOnDisk(x: Bench): Promise<{ total: number; unowned: number }> {
  const t = await x.d.all<{ n: number }>("SELECT count(*) AS n FROM local_bills");
  const u = await x.d.all<{ n: number }>(
    "SELECT count(*) AS n FROM local_bills WHERE owner_tenant_id IS NULL AND owner_user_id IS NULL",
  );
  return { total: t[0]?.n ?? -1, unowned: u[0]?.n ?? -1 };
}

const countIn = (ids: readonly string[], got: readonly string[]): number =>
  ids.filter((id) => got.includes(id)).length;

/* ------------------------------------------------------------------ E1 ---- */

async function e1QueueAndSend(): Promise<void> {
  header("E1 — signed in as B: none of A's bills are selected, and B's ARE (5a)");
  const x = await bench("e1");
  await x.identity.save(OWNER_B);

  const signedIn = await x.identity.load();
  check(
    "CONTROL: the device really is signed in as B, and B is not A",
    signedIn?.user_id === USER_B && USER_A !== USER_B && signedIn.tenant_id === TENANT,
    JSON.stringify(signedIn),
  );

  const disk = await rowsOnDisk(x);
  console.log(`  rows on disk: total=${String(disk.total)} (A=2, B=3, unowned=2)`);
  check("CONTROL: all seven bills are actually in the table", disk.total === 7, JSON.stringify(disk));

  const queue = await x.store.listPendingOldestFirst(100);
  const gotIds = queue.map((b) => b.id);
  const aSelected = countIn(x.a, gotIds);
  const bSelected = countIn(x.b, gotIds);
  const noneSelected = countIn(x.none, gotIds);
  console.log(`  listPendingOldestFirst -> A=${String(aSelected)} B=${String(bSelected)} unowned=${String(noneSelected)} total=${String(queue.length)}`);

  check("ZERO of A's bills are selected for sending", aSelected === 0, `A=${String(aSelected)}`);
  check(
    "a NON-ZERO count of B's bills are selected — the engine has not simply stopped",
    bSelected > 0,
    `B=${String(bSelected)}`,
  );
  check("and it is ALL of B's, not merely some", bSelected === x.b.length, `B=${String(bSelected)}/${String(x.b.length)}`);
  check("the queue holds nothing else at all", queue.length === bSelected, `total=${String(queue.length)}`);

  // The snapshot the UI reads must agree with the queue the engine sends from.
  const snap = await x.store.pendingQueueSnapshot();
  console.log(`  pendingQueueSnapshot -> pendingCount=${String(snap.pendingCount)} head=${String(snap.head?.id)}`);
  check("the snapshot counts B's bills only", snap.pendingCount === x.b.length, JSON.stringify(snap.pendingCount));
  check(
    "the head is one of B's, never A's — the UI cannot point at a bill the engine will not send",
    snap.head !== null && x.b.includes(snap.head.id),
    String(snap.head?.id),
  );

  // The claim is the durable gate, so it is asserted in BOTH directions.
  check("claimForSend REFUSES one of A's bills", (await x.store.claimForSend(x.a[0]!, x.clock.now())) === false);
  check("claimForSend ACCEPTS one of B's bills", (await x.store.claimForSend(x.b[0]!, x.clock.now())) === true);

  // And the real path: run the engine and read the server.
  const run = await x.engine.runOnce();
  const onServer = x.server.distinctBillIds();
  const aOnServer = x.a.filter((id) => onServer.has(id)).length;
  const bOnServer = x.b.filter((id) => onServer.has(id)).length;
  const noneOnServer = x.none.filter((id) => onServer.has(id)).length;
  console.log(`  runOnce -> synced=${String(run.synced)}  server holds A=${String(aOnServer)} B=${String(bOnServer)} unowned=${String(noneOnServer)}`);

  check("NOT ONE of A's bills reached the server", aOnServer === 0, `A=${String(aOnServer)}`);
  check("not one unowned bill reached the server", noneOnServer === 0, `unowned=${String(noneOnServer)}`);
  check(
    "B's bills DID reach the server — a non-zero count, so the send path is alive",
    bOnServer > 0,
    `B=${String(bOnServer)}/${String(x.b.length)}`,
  );

  await teardown(x);
}

/* ------------------------------------------------------------------ E2 ---- */

async function e2UnownedNotSelected(): Promise<void> {
  header("E2 — rows with NO owner are not selected, and they are on disk (5b)");
  const x = await bench("e2");
  await x.identity.save(OWNER_B);

  const disk = await rowsOnDisk(x);
  console.log(`  unowned rows physically present: ${String(disk.unowned)} of ${String(disk.total)}`);
  check(
    "CONTROL: the unowned rows ARE in the table — this is exclusion, not absence",
    disk.unowned === x.none.length,
    JSON.stringify(disk),
  );
  // Read one back by id, so "present" is a row and not only a count.
  const one = await x.store.getBill(x.none[0]!);
  check(
    "CONTROL: and one of them reads back as a real pending bill",
    one !== null && one.sync_state === "pending",
    `id=${String(one?.id)} state=${String(one?.sync_state)}`,
  );

  const gotIds = (await x.store.listPendingOldestFirst(100)).map((b) => b.id);
  const noneSelected = countIn(x.none, gotIds);
  console.log(`  of those ${String(disk.unowned)} unowned rows, ${String(noneSelected)} were selected`);
  check("NONE of the unowned rows is selected for sending", noneSelected === 0, `unowned selected=${String(noneSelected)}`);
  check(
    "DIRECTION: while B's owned rows in the same table ARE selected",
    countIn(x.b, gotIds) === x.b.length,
    `B=${String(countIn(x.b, gotIds))}/${String(x.b.length)}`,
  );
  check("claimForSend refuses an unowned bill", (await x.store.claimForSend(x.none[0]!, x.clock.now())) === false);

  await teardown(x);
}

/* ------------------------------------------------------------------ E3 ---- */

/**
 * resumeAfterSignIn releases the queue after a sign-in, and with a filter in
 * place it is the likeliest way another person's rows escape. Asserted on the
 * COLUMN it writes, per bill, rather than inferred from a count.
 */
async function e3ResumeAfterSignIn(): Promise<void> {
  header("E3 — resumeAfterSignIn releases only the signed-in owner's rows (5c)");
  const x = await bench("e3");
  await x.identity.save(OWNER_B);

  // Put every bill into backoff, so all seven are candidates for release.
  const future = new Date(x.clock.now().getTime() + 60_000).toISOString();
  await x.d.run("UPDATE local_bills SET next_attempt_at = ?", [future]);

  const readAt = async (ids: readonly string[]): Promise<string[]> => {
    const out: string[] = [];
    for (const id of ids) {
      const r = await x.d.all<{ next_attempt_at: string }>(
        "SELECT next_attempt_at FROM local_bills WHERE id = ?",
        [id],
      );
      out.push(r[0]?.next_attempt_at ?? "(missing)");
    }
    return out;
  };

  const aBefore = await readAt(x.a);
  const bBefore = await readAt(x.b);
  const noneBefore = await readAt(x.none);
  check(
    "CONTROL: every bill really is in backoff before the release",
    [...aBefore, ...bBefore, ...noneBefore].every((t) => t === future),
    `future=${future}`,
  );

  const freed = await x.engine.resumeAfterSignIn();
  const aAfter = await readAt(x.a);
  const bAfter = await readAt(x.b);
  const noneAfter = await readAt(x.none);
  console.log(`  resumeAfterSignIn freed=${String(freed)}`);
  console.log(`  A  next_attempt_at: ${JSON.stringify(aBefore)} -> ${JSON.stringify(aAfter)}`);
  console.log(`  B  next_attempt_at: ${JSON.stringify(bBefore)} -> ${JSON.stringify(bAfter)}`);
  console.log(`  -- next_attempt_at: ${JSON.stringify(noneBefore)} -> ${JSON.stringify(noneAfter)}`);

  check(
    "A's rows were NOT released — every one still holds its original backoff",
    aAfter.every((t, i) => t === aBefore[i]),
    JSON.stringify(aAfter),
  );
  check(
    "the unowned rows were NOT released either",
    noneAfter.every((t, i) => t === noneBefore[i]),
    JSON.stringify(noneAfter),
  );
  check(
    "DIRECTION: B's rows WERE released — every one moved off its backoff",
    bAfter.every((t, i) => t !== bBefore[i]),
    JSON.stringify(bAfter),
  );
  check(
    "and the count it reports is B's rows only",
    freed === x.b.length,
    `freed=${String(freed)} expected=${String(x.b.length)}`,
  );

  await teardown(x);
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("P1.7 — the send queue selects only the signed-in owner's rows");
  console.log(`node ${process.version}, node:sqlite against real files in ${tmpdir()}`);

  await e1QueueAndSend();
  await e2UnownedNotSelected();
  await e3ResumeAfterSignIn();

  console.log("");
  console.log(failures === 0 ? "ALL SEND-OWNER CASES PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => {
    console.log(`SENDOWNER_EXIT=${code}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("SEND-OWNER PROOF CRASHED:", err);
    process.exitCode = 1;
  });
