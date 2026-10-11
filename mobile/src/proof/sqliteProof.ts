/**
 * Phase 2b proof: the invariants that were FREE on a JS Map and are not free on
 * a database. Runs against a real SQLite file via node:sqlite.
 *
 * Run: npm run prove:sqlite
 */
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";

import type { SqlDriver, SqlRunResult, SqlTx, SqlValue } from "../adapters/sqlite/driver.js";
import { localDatabaseOnce, type LocalDatabase } from "../adapters/sqlite/localDatabase.js";
import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { createLocalBill } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import type { BillItemPayload, LocalBill } from "../sync/types.js";
import type { ClaimWorkerData, ClaimWorkerResult } from "./claimWorker.js";
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
  return mkdtempSync(join(tmpdir(), `recycle-2b-${name}-`));
}

/* ------------------------------------------------------------------ S1 ---- */

/**
 * The trap this phase had to avoid. SQLite has no NUMERIC type, only column
 * AFFINITY, and it applies silently.
 */
async function s1Affinity(): Promise<void> {
  header("S1: how SQLite mangles money, and why the column is TEXT");
  const dir = tempDir("affinity");
  const driver = NodeSqliteDriver.open(join(dir, "a.db"));
  await driver.exec("PRAGMA busy_timeout = 5000");

  await driver.exec("CREATE TABLE probe (as_text TEXT, as_numeric NUMERIC, as_real REAL)");
  await driver.run("INSERT INTO probe VALUES (?, ?, ?)", ["10.500", "10.500", "10.500"]);
  const row = (
    await driver.all<{ as_text: unknown; as_numeric: unknown; as_real: unknown }>(
      "SELECT as_text, as_numeric, as_real FROM probe",
    )
  )[0]!;
  const types = (
    await driver.all<{ t: string; n: string; r: string }>(
      "SELECT typeof(as_text) t, typeof(as_numeric) n, typeof(as_real) r FROM probe",
    )
  )[0]!;

  console.log(
    `  bound the string "10.500" to three columns ->` +
      ` TEXT=${JSON.stringify(row.as_text)} (${types.t}),` +
      ` NUMERIC=${JSON.stringify(row.as_numeric)} (${types.n}),` +
      ` REAL=${JSON.stringify(row.as_real)} (${types.r})`,
  );
  check(
    "a NUMERIC column silently converts the decimal string to a float",
    types.n === "real" && row.as_numeric === 10.5 && row.as_text === "10.500",
    "this is why no money column is declared NUMERIC",
  );

  const drift = (await driver.all<{ v: number }>("SELECT 0.1 + 0.2 AS v"))[0]!;
  check(
    "SQLite float arithmetic drifts exactly like every other IEEE-754",
    drift.v !== 0.3,
    `SELECT 0.1 + 0.2 = ${drift.v}`,
  );

  // A STRICT table sounds like it would catch a float bound where a decimal
  // string belongs. It does not, and this asserts the real behaviour so the
  // hazard is documented rather than assumed away.
  await driver.exec("CREATE TABLE strictprobe (t TEXT NOT NULL, i INTEGER NOT NULL) STRICT");
  const attempt = async (t: unknown, i: unknown): Promise<string> => {
    try {
      await driver.run("INSERT INTO strictprobe VALUES (?, ?)", [
        t as never,
        i as never,
      ]);
      return "accepted";
    } catch (err) {
      return `rejected: ${err instanceof Error ? err.message : String(err)}`;
    }
  };
  const floatIntoText = await attempt(0.3, 1);
  const intIntoText = await attempt(5, 1);
  const textIntoInt = await attempt("x", "not-a-number");
  const stored = await driver.all<{ t: string; tt: string }>(
    "SELECT t, typeof(t) tt FROM strictprobe",
  );
  console.log(`  STRICT: float->TEXT ${floatIntoText}; int->TEXT ${intIntoText};`);
  console.log(`  STRICT: text->INTEGER ${textIntoInt.split(":")[0]}`);
  console.log(`  values now in the TEXT column: ${JSON.stringify(stored.map((r) => r.t))}`);

  check(
    "STRICT does NOT protect a TEXT column: a bound number is accepted and stringified",
    floatIntoText === "accepted" && intIntoText === "accepted" && stored[1]?.t === "5.0",
    "the integer 5 lands as \"5.0\" — a float reaching here would be written as its decimal expansion, silently",
  );
  check(
    "STRICT does protect the INTEGER columns",
    textIntoInt.startsWith("rejected"),
    textIntoInt,
  );
  check(
    "so the money guarantee is the TypeScript `string` type, not the database",
    typeof HOSTILE_ITEM.unit_price === "string",
    "BillPayload declares every amount and weight as string; the store only binds JSON.stringify output",
  );

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ S2 ---- */

const HOSTILE_ITEM: BillItemPayload = {
  id: "item-0001",
  product_id: "prod-aaaa-0001",
  line_no: 1,
  // The classic float-drift values, plus a trailing zero that a numeric
  // conversion would eat ("10.500" -> 10.5) and a scale that must survive.
  gross_weight: "0.3",
  tare_weight: "0.1",
  net_weight: "0.2",
  unit_price: "0.10",
  list_price: "10.500",
};

async function s2DecimalRoundTrip(): Promise<void> {
  header("S2: money and weight survive the SQLite round-trip exactly");
  const dir = tempDir("decimal");
  const driver = NodeSqliteDriver.open(join(dir, "d.db"));
  const store = await SqliteLocalStore.open(driver);
  await signInProofDevice(driver);
  const clock = new FakeClock();

  const created = await createLocalBill(
    { store, clock, ids: new SeqIds("bill-dec") },
    {
      seller: { kind: "server", seller_id: "sell-aaaa-0001" },
      vehicle_no: "1กก-1234",
      items: [HOSTILE_ITEM],
      total_amount: "0.30",
      master_as_of: null,
    },
    PROOF_OWNER,
  );

  const read = await store.getBill(created.id);
  const item = read?.payload.items[0];
  const same =
    item?.gross_weight === "0.3" &&
    item.tare_weight === "0.1" &&
    item.net_weight === "0.2" &&
    item.unit_price === "0.10" &&
    item.list_price === "10.500" &&
    read?.payload.total_amount === "0.30";

  console.log(
    `  wrote  ${JSON.stringify([HOSTILE_ITEM.gross_weight, HOSTILE_ITEM.tare_weight, HOSTILE_ITEM.net_weight, HOSTILE_ITEM.unit_price, HOSTILE_ITEM.list_price, "0.30"])}`,
  );
  console.log(
    `  read   ${JSON.stringify([item?.gross_weight, item?.tare_weight, item?.net_weight, item?.unit_price, item?.list_price, read?.payload.total_amount])}`,
  );
  check("every decimal string round-trips byte-identical", same);
  check(
    "0.1 + 0.2 style values never became numbers",
    [item?.gross_weight, item?.unit_price, read?.payload.total_amount].every(
      (v) => typeof v === "string",
    ),
    "all still typeof string in JS",
  );

  const stored = (
    await driver.all<{ t: string }>("SELECT typeof(payload_json) t FROM local_bills")
  )[0]!;
  check("payload column is stored as SQLite text", stored.t === "text", `typeof() = ${stored.t}`);

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ S3 ---- */

async function s3ConcurrentClaims(workers: number, bills: number): Promise<void> {
  header(`S3: claimForSend is atomic — ${workers} OS threads racing on one file`);
  const dir = tempDir("claim");
  const file = join(dir, "race.db");
  const driver = NodeSqliteDriver.open(file);
  const store = await SqliteLocalStore.open(driver);
  await signInProofDevice(driver);
  const clock = new FakeClock();
  const ids = new SeqIds("bill-race");

  const created: LocalBill[] = [];
  for (let i = 0; i < bills; i += 1) {
    created.push(
      await createLocalBill(
        { store, clock, ids },
        {
          seller: { kind: "server", seller_id: "sell-aaaa-0001" },
          vehicle_no: null,
          items: [{ ...HOSTILE_ITEM, id: `item-${i}` }],
          total_amount: "0.30",
          master_as_of: null,
        },
    PROOF_OWNER,
  ),
    );
  }
  await driver.close(); // hand the file over to the workers entirely

  const billIds = created.map((b) => b.id);
  const sab = new SharedArrayBuffer(8);
  const ctl = new Int32Array(sab);

  const pending = Array.from(
    { length: workers },
    (_, w) =>
      new Promise<ClaimWorkerResult>((resolve, reject) => {
        const data: ClaimWorkerData = { file, ids: billIds, sab };
        const worker = new Worker(new URL("./claimWorker.js", import.meta.url), {
          workerData: data,
          name: `claimer-${w}`,
        });
        worker.on("message", resolve);
        worker.on("error", reject);
      }),
  );

  // Release every worker at once, so the claims genuinely overlap in time.
  while (Atomics.load(ctl, 1) < workers) await new Promise((r) => setTimeout(r, 5));
  Atomics.store(ctl, 0, 1);
  Atomics.notify(ctl, 0);
  const results = await Promise.all(pending);

  const verify = NodeSqliteDriver.open(file);
  await verify.exec("PRAGMA busy_timeout = 5000");
  const syncing = (
    await verify.all<{ c: number }>(
      "SELECT COUNT(*) c FROM local_bills WHERE sync_state = 'syncing'",
    )
  )[0]!.c;
  const other = (
    await verify.all<{ c: number }>(
      "SELECT COUNT(*) c FROM local_bills WHERE sync_state <> 'syncing'",
    )
  )[0]!.c;
  await verify.close();

  const wins = results.map((r) => r.wins);
  const totalWins = wins.reduce((a, b) => a + b, 0);
  const totalLosses = results.reduce((a, r) => a + r.losses, 0);
  const totalErrors = results.reduce((a, r) => a + r.errors, 0);
  const latestStart = Math.max(...results.map((r) => r.firstAt));
  const earliestEnd = Math.min(...results.map((r) => r.lastAt));

  console.log(`  per-worker wins: ${wins.join(" + ")} = ${totalWins}`);
  console.log(`  lost races (rowcount 0): ${totalLosses}   SQLITE_BUSY errors: ${totalErrors}`);
  console.log(
    `  overlap: last worker started at +${latestStart - Math.min(...results.map((r) => r.firstAt))}ms,` +
      ` first finished at +${earliestEnd - Math.min(...results.map((r) => r.firstAt))}ms`,
  );

  check(
    "the workers' claim windows really overlapped (not run one after another)",
    latestStart <= earliestEnd,
    latestStart <= earliestEnd ? "all threads were claiming at the same time" : "SERIALISED — the race proves nothing",
  );
  check(
    `exactly ${bills} claims succeeded in total`,
    totalWins === bills,
    `wins=${totalWins} expected=${bills}`,
  );
  check(
    "every bill was contested by every worker and lost by all but one",
    totalLosses === bills * (workers - 1),
    `losses=${totalLosses} expected=${bills * (workers - 1)}`,
  );
  check("no bill was claimed twice", syncing === bills && other === 0, `syncing=${syncing} other=${other}`);
  check("no claim errored out under contention", totalErrors === 0);

  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ S4 ---- */

async function s4DurabilityAcrossRestart(): Promise<void> {
  header("S4: state survives a real close + reopen of the database file");
  const dir = tempDir("durable");
  const file = join(dir, "durable.db");

  const driver1 = NodeSqliteDriver.open(file);
  const store1 = await SqliteLocalStore.open(driver1);
  await signInProofDevice(driver1);
  const clock = new FakeClock();
  const ids = new SeqIds("bill-dur");
  const server = new FakeServer();

  const mk = async (): Promise<LocalBill> =>
    createLocalBill(
      { store: store1, clock, ids },
      {
        seller: { kind: "server", seller_id: "sell-aaaa-0001" },
        vehicle_no: "1กก-1234",
        items: [HOSTILE_ITEM],
        total_amount: "0.30",
        master_as_of: null,
      },
    PROOF_OWNER,
  );

  const willStayPending = await mk();
  const willBeSyncing = await mk();
  const willBeSynced = await mk();
  const willFail = await mk();

  await store1.claimForSend(willBeSyncing.id, clock.now()); // left mid-flight
  await store1.markSynced(willBeSynced.id, "B-2569-77", 1, clock.now());
  await store1.markFailed(willFail.id, "HTTP 422: bad seller", 1, clock.now());

  await driver1.close();
  const bytes = statSync(file).size;
  console.log(`  closed the connection; ${file} is ${bytes} bytes on disk`);

  // A brand new connection to the same file — nothing carried over in memory.
  const driver2 = NodeSqliteDriver.open(file);
  const store2 = await SqliteLocalStore.open(driver2);
  await signInProofDevice(driver2);

  const after = {
    pending: (await store2.getBill(willStayPending.id))?.sync_state,
    syncing: (await store2.getBill(willBeSyncing.id))?.sync_state,
    synced: await store2.getBill(willBeSynced.id),
    failed: await store2.getBill(willFail.id),
  };

  check("pending survived", after.pending === "pending", `state=${String(after.pending)}`);
  check("syncing survived", after.syncing === "syncing", `state=${String(after.syncing)}`);
  check(
    "synced survived with its server doc_no",
    after.synced?.sync_state === "synced" && after.synced.doc_no === "B-2569-77",
    `state=${String(after.synced?.sync_state)} doc_no=${String(after.synced?.doc_no)}`,
  );
  check(
    "failed survived with its reason",
    after.failed?.sync_state === "failed" && after.failed.last_error === "HTTP 422: bad seller",
    `state=${String(after.failed?.sync_state)} last_error=${String(after.failed?.last_error)}`,
  );
  check(
    "money in the reopened payload is still exact",
    after.synced?.payload.items[0]?.list_price === "10.500",
    `list_price=${String(after.synced?.payload.items[0]?.list_price)}`,
  );

  // S5, on the same reopened file: the stranded bill is recovered and syncs.
  const engine = new SyncEngine({ ...noSellerKind(),
    store: store2,
    transport: new OnlineTransport(server),
    clock,
    backoffBaseMs: 1000,
  });
  const readyBeforeRecovery = await store2.listReadyToSend(clock.now(), 10);
  // A map keyed by kind since P1.18 stage 3 — the stranded send is reported
  // under bill_send, which is the one kind with durable in-flight state.
  const recovered = await engine.recoverInterrupted();
  const afterRecovery = await store2.getBill(willBeSyncing.id);

  check(
    "before recovery the stranded bill is invisible to the sender",
    !readyBeforeRecovery.some((b) => b.id === willBeSyncing.id),
    `ready=${JSON.stringify(readyBeforeRecovery.map((b) => b.id))}`,
  );
  check(
    "reopen + recovery returns exactly the stranded bill to pending",
    recovered.bill_send.length === 1 &&
      recovered.bill_send[0] === willBeSyncing.id &&
      afterRecovery?.sync_state === "pending",
    `recovered=${JSON.stringify(recovered)} state=${String(afterRecovery?.sync_state)}`,
  );

  const run = await engine.runOnce();
  const finalState = await store2.getBill(willBeSyncing.id);
  check(
    "it then syncs, and only the two eligible bills were sent",
    finalState?.sync_state === "synced" && server.billCount === 2,
    `run=${JSON.stringify(run)} billsOnServer=${server.billCount}`,
  );

  await driver2.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ S5 ---- */

const BREAK = (process.argv.find((a) => a.startsWith("--break=")) ?? "").split("=")[1] ?? "";

/** Delegates to a real driver and counts what the startup does to it. */
class CountingDriver implements SqlDriver {
  pragmas = 0;
  transactions = 0;
  constructor(private readonly inner: SqlDriver) {}
  exec(sql: string): Promise<void> {
    if (sql.startsWith("PRAGMA busy_timeout")) this.pragmas += 1;
    return this.inner.exec(sql);
  }
  run(sql: string, params?: readonly SqlValue[]): Promise<SqlRunResult> {
    return this.inner.run(sql, params);
  }
  all<T>(sql: string, params?: readonly SqlValue[]): Promise<T[]> {
    return this.inner.all<T>(sql, params);
  }
  transaction<T>(fn: (tx: SqlTx) => Promise<T>): Promise<T> {
    this.transactions += 1;
    return this.inner.transaction(fn);
  }
  close(): Promise<void> {
    return this.inner.close();
  }
}

/**
 * A3 batch 1b. An Android activity relaunch runs App.tsx's startup a SECOND time in the same JS
 * process. On the emulator that second startup failed two ways (localDatabase.ts carries the
 * measurement); the fix brings the database up once per process. These cells drive the very
 * function App.tsx calls — `localDatabaseOnce` — over node:sqlite, and count.
 * DISPROOF: `--break=noonce` gives each startup its own bring-up (the pre-fix behaviour).
 */
async function s5StartupOncePerProcess(): Promise<void> {
  header("S5 the startup brings the database up ONCE per process (a relaunch reuses it)");
  if (BREAK === "noonce") console.log("  *** DISPROOF ACTIVE: --break=noonce — every startup brings up its own ***");
  const dir = tempDir("once");
  let opens = 0;
  const drivers: CountingDriver[] = [];
  const opener = (name: string): Promise<SqlDriver> => {
    opens += 1;
    const d = new CountingDriver(NodeSqliteDriver.open(join(dir, `${name}.db`)));
    drivers.push(d);
    return Promise.resolve(d);
  };
  const process1 = localDatabaseOnce(opener);
  const startup = (): Promise<LocalDatabase> =>
    BREAK === "noonce" ? localDatabaseOnce(opener).open("recycle") : process1.open("recycle");

  // Two startups racing (the relaunched root mounts while the first bring-up is in flight),
  // then a third later (a second relaunch).
  // A rejection is RECORDED, not thrown: under the disproof two independent bring-ups race on
  // one file and the loser fails `database is locked` — the emulator's failure, reproduced here.
  const settled = await Promise.allSettled([startup(), startup()]);
  const later = await startup().then((v) => ({ ok: true as const, v }), (e: unknown) => ({ ok: false as const, e }));
  const rejected = [
    ...settled.filter((s): s is PromiseRejectedResult => s.status === "rejected").map((s) => String(s.reason)),
    ...(later.ok ? [] : [String(later.e)]),
  ];
  const got = [...settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : [])), ...(later.ok ? [later.v] : [])];
  const [a, b, c] = got;
  const first = drivers[0];
  check("every startup succeeded", rejected.length === 0, rejected.length === 0 ? "3 of 3" : rejected.join(" | "));
  check("three startups opened the database ONCE", opens === 1, `opens=${String(opens)}`);
  check(
    "every startup got the SAME driver and the SAME stores",
    a !== undefined && b !== undefined && c !== undefined &&
      a.driver === b.driver && b.driver === c.driver && a.billStore === c.billStore && a.draftStore === c.draftStore,
  );
  check(
    "the schema bring-up (busy_timeout pragma, exclusive transaction) ran for ONE startup only — three stores, once",
    first !== undefined && first.pragmas === 3 && first.transactions === 3 && drivers.length === 1,
    first === undefined ? "no driver" : `pragmas=${String(first.pragmas)} transactions=${String(first.transactions)} drivers=${String(drivers.length)}`,
  );
  // The reused stores still work: the handle a relaunched root gets is a live one.
  const lastGood = got[got.length - 1];
  const bills = lastGood === undefined ? null : await lastGood.billStore.listByState("pending");
  check("control: the reused bill store answers a query", Array.isArray(bills), `pending=${String(bills?.length ?? "none")}`);

  // A FAILED bring-up is not remembered: the next startup tries again.
  let flaky = 0;
  const failingOnce = localDatabaseOnce((name: string) => {
    flaky += 1;
    if (flaky === 1) return Promise.reject(new Error("first open fails"));
    return Promise.resolve(NodeSqliteDriver.open(join(dir, `${name}-retry.db`)));
  });
  const firstTry = await failingOnce.open("r").then(() => "opened", () => "rejected");
  const retried = await failingOnce.open("r").catch(() => null);
  const secondTry = retried === null ? "rejected" : "opened";
  if (retried !== null) await retried.driver.close();
  check("a rejected bring-up is not cached — the next startup opens for real",
    firstTry === "rejected" && secondTry === "opened" && flaky === 2, `${firstTry}, ${secondTry}, opens=${String(flaky)}`);

  // The cells above prove the function; this one proves the APP calls it. App.tsx is outside
  // the node program, so its TEXT is read (as proveSheets.ts does).
  const app = readFileSync(join(process.cwd(), "App.tsx"), "utf8");
  check(
    "App.tsx brings the database up through localDatabaseOnce at module scope, and opens nothing itself",
    app.includes("const LOCAL_DATABASE = localDatabaseOnce((name) => ExpoSqliteDriver.open(name));") &&
      app.includes("await LOCAL_DATABASE.open(\"recycle.db\")") &&
      !/await ExpoSqliteDriver\.open\(/.test(app) &&
      !/await Sqlite(LocalStore|DraftStore|MasterStore)\.open\(/.test(app),
  );

  for (const d of drivers) await d.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ S6 ---- */

/**
 * The DEVICE driver's transaction connection gets the main connection's busy_timeout (cart
 * milestone, 2026-10-12). expo-sqlite's withExclusiveTransactionAsync runs on a NEW connection
 * with a deferred BEGIN, so without this its first write failed at once with SQLITE_BUSY — on the
 * emulator the boot's product-cache save failed `database is locked` and the device kept old
 * products. src/device/ cannot run under node, so its TEXT is read: the pragma comes from
 * CONNECTION_PRAGMAS and is the FIRST statement of the transaction callback.
 */
function s6TransactionConnectionWaits(): void {
  header("S6 the device driver's transaction connection waits (busy_timeout) before its first write");
  const src = readFileSync(join(process.cwd(), "src", "device", "expoSqliteDriver.ts"), "utf8");
  check("control: expoSqliteDriver.ts was read", src.includes("withExclusiveTransactionAsync"));
  check(
    "the pragma is taken from CONNECTION_PRAGMAS, not retyped",
    /CONNECTION_PRAGMAS\.find\(\(s\) => s\.startsWith\("PRAGMA busy_timeout"\)\)/.test(src),
  );
  const body = /withExclusiveTransactionAsync\(async \(txn\) => \{([\s\S]*?)const tx: SqlTx/.exec(src)?.[1] ?? "";
  const firstStatement = body.split("\n").map((l) => l.trim()).find((l) => l !== "" && !l.startsWith("/*") && !l.startsWith("*"));
  check(
    "the FIRST statement of the transaction callback sets it",
    firstStatement === "await txn.execAsync(BUSY_TIMEOUT_PRAGMA);",
    JSON.stringify(firstStatement),
  );
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("Phase 2b — real SQLite storage adapter, headless proof");
  console.log(`node ${process.version}, node:sqlite against real files in ${tmpdir()}`);

  await s1Affinity();
  await s2DecimalRoundTrip();
  await s3ConcurrentClaims(4, 300);
  await s4DurabilityAcrossRestart();
  await s5StartupOncePerProcess();
  s6TransactionConnectionWaits();

  console.log("");
  console.log(failures === 0 ? "ALL SQLITE CASES PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

// Preset RED, per lessons/a-default-exit-code-is-a-default-verdict.md: a run
// that ends before main()'s tally completes exits non-zero, not a default 0.
process.exitCode = 1;

main()
  .then((code) => {
    console.log(`SQLITE_EXIT=${code}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("SQLITE PROOF CRASHED:", err);
    process.exitCode = 1;
  });
