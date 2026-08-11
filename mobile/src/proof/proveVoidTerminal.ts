/**
 * P1.7 proof: a PERMANENTLY refused void stops being re-sent; a transient one
 * does not.
 *
 * Run: npm run prove:voidterminal
 *
 * THE OBSERVABLE IS AN ATTEMPT COUNT ACROSS CONSECUTIVE PASSES, not a state
 * flag and not a line of code. The defect this fixes is not "the wrong column
 * was written" — it is "the device POSTs the same doomed request every four
 * seconds for ever", and the only thing that shows that is the number of times
 * the transport was actually asked, pass after pass.
 *
 * WHY THREE BILLS AND NOT ONE. A fix that simply stopped the whole void path
 * would satisfy "the rejected void stops" perfectly, and would be far worse
 * than the defect: every void would stop, including the ones that deserve
 * another attempt and the ones that would have succeeded. So the run carries a
 * bill whose void is permanently REJECTED, one whose void is transiently
 * UNAVAILABLE, and one whose void SUCCEEDS, and asserts the direction of each.
 *
 * WHAT THIS DOES NOT ESTABLISH. node:sqlite, not the handset's expo-sqlite. And
 * nothing here is about ownership: the void queue has no owner filter as of this
 * commit, which is the next step and the reason this one exists first — an
 * attempt count on a line that never stops cannot show whether a filter
 * prevented a send or merely delayed one.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { createLocalBill } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import type { LocalBill, SendOutcome, Transport, VoidOutcome } from "../sync/types.js";
import { FakeClock, FakeServer, OnlineTransport, PROOF_OWNER, SeqIds } from "./fakes.js";
import { signInProofDevice } from "./proofDevice.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

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

/** How many passes to run. Enough that "rising" and "stopped" are unmistakable. */
const PASSES = 5;

/**
 * Sends everything happily; answers voids by bill id, and COUNTS every void
 * request it is asked to make.
 *
 * The count is the whole instrument. It is incremented on entry, before any
 * decision, so it records what the engine ASKED for rather than what this class
 * chose to do about it — a counter behind the branch would under-report exactly
 * the case under test.
 */
class VoidScriptTransport implements Transport {
  readonly voidCalls = new Map<string, number>();

  constructor(
    private readonly rejectedId: string,
    private readonly unavailableId: string,
  ) {}

  count(id: string): number {
    return this.voidCalls.get(id) ?? 0;
  }

  sendBill(): Promise<SendOutcome> {
    return Promise.resolve({ kind: "accepted", doc_no: "B-2569-1" });
  }

  voidBill(bill: LocalBill): Promise<VoidOutcome> {
    this.voidCalls.set(bill.id, this.count(bill.id) + 1);
    if (bill.id === this.rejectedId) {
      // What httpTransport returns for 404, 400 and 422 alike.
      return Promise.resolve({ kind: "rejected", reason: "HTTP 404: bill not found" });
    }
    if (bill.id === this.unavailableId) {
      return Promise.resolve({ kind: "unavailable", reason: "network: Network request failed" });
    }
    return Promise.resolve({ kind: "voided", doc_no: "B-2569-1" });
  }
}

interface Bench {
  dir: string;
  d: NodeSqliteDriver;
  store: SqliteLocalStore;
  clock: FakeClock;
  transport: VoidScriptTransport;
  engine: SyncEngine;
  rejected: string;
  unavailable: string;
  succeeds: string;
}

/**
 * Three bills, SYNCED first through an ordinary server so each has a doc_no —
 * listVoidsToApply requires it, so a bill that never synced would sit outside
 * the predicate and the case would prove nothing about retries.
 */
async function bench(): Promise<Bench> {
  const dir = mkdtempSync(join(tmpdir(), "recycle-voidterm-"));
  const d = NodeSqliteDriver.open(join(dir, "vt.db"));
  const store = await SqliteLocalStore.open(d);
  await signInProofDevice(d);
  const clock = new FakeClock();
  const ids = new SeqIds("vt");

  const made: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const bill = await createLocalBill(
      { store, clock, ids },
      {
        seller_id: "sell-1",
        vehicle_no: null,
        items: [ITEM],
        total_amount: "150.00",
        master_as_of: null,
      },
      PROOF_OWNER,
    );
    made.push(bill.id);
  }

  // Phase one: get them all onto the server so each has a doc_no.
  const syncEngine = new SyncEngine({
    store,
    transport: new OnlineTransport(new FakeServer()),
    clock,
  });
  await syncEngine.runUntilQuiescent(10);

  const [rejected, unavailable, succeeds] = made as [string, string, string];
  for (const id of made) await store.requestVoid(id, "ลูกค้าขอยกเลิก", clock.now());

  const transport = new VoidScriptTransport(rejected, unavailable);
  const engine = new SyncEngine({ store, transport, clock });
  return { dir, d, store, clock, transport, engine, rejected, unavailable, succeeds };
}

async function teardown(x: Bench): Promise<void> {
  await x.d.close();
  rmSync(x.dir, { recursive: true, force: true });
}

async function voidState(
  x: Bench,
  id: string,
): Promise<{ voided_at: string | null; void_refused_at: string | null; void_refused_code: string | null }> {
  const r = await x.d.all<{
    voided_at: string | null;
    void_refused_at: string | null;
    void_refused_code: string | null;
  }>("SELECT voided_at, void_refused_at, void_refused_code FROM local_bills WHERE id = ?", [id]);
  return r[0] ?? { voided_at: null, void_refused_at: null, void_refused_code: null };
}

/* ------------------------------------------------------------------ V1 ---- */

async function v1AttemptsAcrossPasses(): Promise<void> {
  header(`V1 — void attempts across ${String(PASSES)} consecutive passes, counted per bill`);
  const x = await bench();

  check(
    "CONTROL: all three bills synced and are eligible for a void",
    (await x.store.listVoidsToApply(10)).length === 3,
    `owed=${String((await x.store.listVoidsToApply(10)).length)}`,
  );

  const perPass: { pass: number; rejected: number; unavailable: number; succeeds: number }[] = [];
  for (let pass = 1; pass <= PASSES; pass += 1) {
    await x.engine.runOnce();
    perPass.push({
      pass,
      rejected: x.transport.count(x.rejected),
      unavailable: x.transport.count(x.unavailable),
      succeeds: x.transport.count(x.succeeds),
    });
  }

  console.log("  pass | REJECTED(perm) | UNAVAILABLE(transient) | SUCCEEDS");
  for (const r of perPass) {
    console.log(
      `    ${String(r.pass).padStart(2)} | ${String(r.rejected).padStart(14)} |` +
        ` ${String(r.unavailable).padStart(22)} | ${String(r.succeeds).padStart(8)}`,
    );
  }

  const last = perPass[perPass.length - 1]!;
  const first = perPass[0]!;

  // ---- 3b: the permanent one stops ---------------------------------------
  check(
    "the PERMANENTLY REJECTED void was attempted exactly ONCE and never again",
    last.rejected === 1,
    `attempts after ${String(PASSES)} passes = ${String(last.rejected)} (was ${String(first.rejected)} after pass 1)`,
  );
  check(
    "and its count did not move between the first pass and the last",
    first.rejected === last.rejected,
    `pass1=${String(first.rejected)} pass${String(PASSES)}=${String(last.rejected)}`,
  );

  // ---- 3c: the transient one keeps going, IN THIS SAME RUN ----------------
  check(
    "DIRECTION: the TRANSIENT failure is still being attempted, once per pass",
    last.unavailable === PASSES,
    `attempts=${String(last.unavailable)} passes=${String(PASSES)}`,
  );
  check(
    "and its count ROSE every single pass — not merely ended higher",
    perPass.every((r) => r.unavailable === r.pass),
    JSON.stringify(perPass.map((r) => r.unavailable)),
  );
  check(
    "so the fix did not simply stop the void path: one stopped, one did not",
    last.rejected < last.unavailable && last.rejected === 1 && last.unavailable === PASSES,
    `rejected=${String(last.rejected)} unavailable=${String(last.unavailable)}`,
  );

  // ---- 3d: the one that should succeed still does -------------------------
  const okState = await voidState(x, x.succeeds);
  console.log(`  the succeeding bill: ${JSON.stringify(okState)}`);
  check(
    "the void that SUCCEEDS still succeeds — voided_at is set",
    okState.voided_at !== null,
    JSON.stringify(okState),
  );
  check(
    "and it was asked exactly once, because success also leaves the queue",
    last.succeeds === 1,
    `attempts=${String(last.succeeds)}`,
  );

  // ---- the row the fix writes --------------------------------------------
  const rejState = await voidState(x, x.rejected);
  const unavState = await voidState(x, x.unavailable);
  console.log(`  rejected bill row   : ${JSON.stringify(rejState)}`);
  console.log(`  unavailable bill row: ${JSON.stringify(unavState)}`);
  check(
    "the rejected void is marked refused, so it has LEFT the selecting predicate",
    rejState.void_refused_at !== null,
    JSON.stringify(rejState),
  );
  check(
    "DIRECTION: the transient one is NOT marked, so it stays owed",
    unavState.void_refused_at === null,
    JSON.stringify(unavState),
  );
  check(
    "and the queue now holds only the transient one",
    (await x.store.listVoidsToApply(10)).map((b) => b.id).join(",") === x.unavailable,
    (await x.store.listVoidsToApply(10)).map((b) => b.id).join(","),
  );

  await teardown(x);
}

/* ------------------------------------------------------------------ V2 ---- */

/**
 * A sign-in retracts a 403 and must NOT retract a rejection.
 *
 * clearVoidRefusals runs on every sign-in (engine.resumeAfterSignIn). If it
 * retracted this one too, the infinite retry would simply resume at each
 * sign-in — stopped every four seconds, restarted every shift, which is still
 * for ever.
 */
async function v2SignInDoesNotRetractIt(): Promise<void> {
  header("V2 — a sign-in retracts a 403 but NOT a permanent rejection");
  const x = await bench();

  await x.engine.runOnce();
  const before = await voidState(x, x.rejected);
  check("CONTROL: the rejection really is recorded before the sign-in", before.void_refused_at !== null);
  const attemptsBefore = x.transport.count(x.rejected);

  const freed = await x.engine.resumeAfterSignIn();
  const after = await voidState(x, x.rejected);
  console.log(`  resumeAfterSignIn freed=${String(freed)}; rejected row after: ${JSON.stringify(after)}`);
  check(
    "the rejection SURVIVES the sign-in",
    after.void_refused_at !== null,
    JSON.stringify(after),
  );

  for (let i = 0; i < PASSES; i += 1) await x.engine.runOnce();
  const attemptsAfter = x.transport.count(x.rejected);
  console.log(`  attempts before sign-in=${String(attemptsBefore)} after ${String(PASSES)} more passes=${String(attemptsAfter)}`);
  check(
    "and it is STILL not re-attempted, however many passes follow the sign-in",
    attemptsAfter === attemptsBefore,
    `before=${String(attemptsBefore)} after=${String(attemptsAfter)}`,
  );
  check(
    "DIRECTION: the transient void is still being attempted in that same stretch",
    x.transport.count(x.unavailable) > 1,
    `unavailable attempts=${String(x.transport.count(x.unavailable))}`,
  );

  await teardown(x);
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("P1.7 — a permanently refused void stops; a transient one does not");
  console.log(`node ${process.version}, node:sqlite against real files in ${tmpdir()}`);

  await v1AttemptsAcrossPasses();
  await v2SignInDoesNotRetractIt();

  console.log("");
  console.log(failures === 0 ? "ALL VOID-TERMINAL CASES PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => {
    console.log(`VOIDTERMINAL_EXIT=${code}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("VOID-TERMINAL PROOF CRASHED:", err);
    process.exitCode = 1;
  });
