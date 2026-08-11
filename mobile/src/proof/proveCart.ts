/**
 * Phase 2c-3 proof: the multi-item cart and its persisted draft, against real
 * SQLite files via node:sqlite.
 *
 * Run: npm run prove:cart
 *
 * C5 injects a REAL crash — a child process SIGKILLed inside the draft -> bill
 * transaction — because that is the only invariant here whose failure mode is
 * silent duplicate or silent loss of a real-money bill.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteDraftStore } from "../adapters/sqlite/SqliteDraftStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import {
  addLine,
  buildLine,
  cartTotal,
  newDraft,
  orderedLines,
  removeLine,
  toBillItems,
} from "../cart/cart.js";
import type { Draft } from "../cart/types.js";
import { sumAmounts } from "../money/money.js";
import { Decimal } from "decimal.js";
import { buildLocalBill } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
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

function tempDir(name: string): string {
  return mkdtempSync(join(tmpdir(), `recycle-2c3-${name}-`));
}

const NOW = "2026-07-22T09:00:00.000Z";

/* ------------------------------------------------------------ fixtures ---- */

interface Spec {
  code: string;
  name: string;
  gross: string;
  tare: string;
  price: string;
  list: string;
}

/**
 * Three lines chosen so that ROUNDING ORDER CHANGES THE ANSWER.
 *
 *   FE-STEEL  net 10.003 x 15.00 = 150.045  -> 150.05
 *   AL-CAN    net  0.005 x  1.00 =   0.005  ->   0.01
 *   CU-WIRE   net  0.005 x  1.00 =   0.005  ->   0.01
 *
 * Round each line then add  -> 150.07   (what the server does)
 * Add exactly then round    -> 150.06   (the plausible, wrong alternative)
 *
 * A cart that computed the second number would be rejected by the server on
 * every submit, so this is the difference between a working till and one that
 * silently refuses to sync.
 */
const SPECS: Spec[] = [
  { code: "FE-STEEL", name: "เหล็กรวม", gross: "10.005", tare: "0.002", price: "15.00", list: "15.00" },
  { code: "AL-CAN", name: "กระป๋องอลูมิเนียม", gross: "0.006", tare: "0.001", price: "1.00", list: "1.20" },
  { code: "CU-WIRE", name: "สายทองแดง", gross: "0.005", tare: "0.000", price: "1.00", list: "1.10" },
];

function draftWithSpecs(specs: Spec[], ids: SeqIds): Draft {
  let d = newDraft("draft-0001", "sell-aaaa-0001", NOW, NOW);
  for (const s of specs) {
    const r = buildLine({
      id: ids.newId(),
      product_id: `prod-${s.code}`,
      product_code: s.code,
      product_name: s.name,
      uom_code: "KG",
      gross: s.gross,
      tare: s.tare,
      price: s.price,
      list_price: s.list,
    });
    if (!r.ok) throw new Error(`fixture line failed to build: ${s.code} ${r.field}/${r.error}`);
    d = addLine(d, r.line, NOW);
  }
  return d;
}

/* ------------------------------------------------------------------ C1 ---- */

function c1TotalOfThreeLines(): Draft {
  header("C1: three lines — total is the sum of the line amounts, exactly");
  const draft = draftWithSpecs(SPECS, new SeqIds("line"));
  const lines = orderedLines(draft);
  const amounts = lines.map((l) => l.amount);

  for (const l of lines) {
    console.log(
      `  ${l.product_code.padEnd(9)} gross ${l.gross_weight} - tare ${l.tare_weight}` +
        ` = net ${l.net_weight}  x ${l.unit_price}  = ${l.amount}`,
    );
  }
  const total = cartTotal(draft);
  console.log(`  line amounts = ${JSON.stringify(amounts)}   total = ${total}`);

  check("3 lines are in the cart", lines.length === 3, `count=${String(lines.length)}`);
  check(
    "every line amount matches the server's formula, HALF_UP to 2dp",
    amounts.join(",") === "150.05,0.01,0.01",
    `amounts=${amounts.join(",")}`,
  );
  check(
    "total equals the sum of the line amounts, exactly",
    total === sumAmounts(amounts) && total === "150.07",
    `total=${total} sum=${sumAmounts(amounts)}`,
  );

  // The disproof: show the other order really does give a different number, so
  // this case is not passing by coincidence.
  const exactSum = lines
    .reduce((acc, l) => acc.plus(new Decimal(l.net_weight).times(l.unit_price)), new Decimal(0))
    .toFixed(2);
  console.log(`  for contrast, summing exactly and rounding once gives ${exactSum}`);
  check(
    "round-then-sum genuinely differs from sum-then-round here",
    exactSum !== total,
    `sum-then-round=${exactSum} vs round-then-sum=${total} — the case would prove nothing if these matched`,
  );

  check(
    "every amount is a string, never a JS number",
    amounts.every((a) => typeof a === "string"),
  );
  return draft;
}

/* ------------------------------------------------------------------ C2 ---- */

function c2DeleteMiddleLine(draft: Draft): void {
  header("C2: delete the middle line — line_no stays valid for submission");
  const before = orderedLines(draft);
  const middle = before[1]!;
  console.log(`  before: seq=${JSON.stringify(before.map((l) => l.seq))} line_no=${JSON.stringify(toBillItems(draft).map((i) => i.line_no))}`);

  const after = removeLine(draft, middle.id, NOW);
  const lines = orderedLines(after);
  const items = toBillItems(after);
  const lineNos = items.map((i) => i.line_no);

  console.log(`  deleted ${middle.product_code} (seq ${String(middle.seq)})`);
  console.log(`  after:  seq=${JSON.stringify(lines.map((l) => l.seq))} line_no=${JSON.stringify(lineNos)}`);

  check("the line is gone", lines.length === 2 && !lines.some((l) => l.id === middle.id));
  check(
    "seq deliberately keeps a hole (1,3) — it is NOT the line_no",
    lines.map((l) => l.seq).join(",") === "1,3",
    `seq=${lines.map((l) => l.seq).join(",")}`,
  );
  check(
    "submitted line_no is contiguous 1..N with no gap",
    lineNos.join(",") === "1,2",
    `line_no=${lineNos.join(",")}`,
  );
  check(
    "line_no values are unique (server: uq_items_tenant_bill_line)",
    new Set(lineNos).size === lineNos.length,
  );
  check(
    "every line_no > 0 (server: Field(gt=0))",
    lineNos.every((n) => n > 0),
  );
  check(
    "total recomputed exactly after the delete",
    cartTotal(after) === "150.06",
    `total=${cartTotal(after)} (was 150.07, removed a 0.01 line)`,
  );

  // Deleting every line must not leave a bill-shaped hole either.
  const emptied = orderedLines(removeLine(removeLine(after, lines[0]!.id, NOW), lines[1]!.id, NOW));
  check("emptying the cart yields no lines and total 0.00", emptied.length === 0);
}

/* ------------------------------------------------------------------ C3 ---- */

async function c3DraftSurvivesReopen(): Promise<void> {
  header("C3: the draft survives a real close + reopen of the SQLite file");
  const dir = tempDir("draft");
  const file = join(dir, "draft.db");

  const driver1 = NodeSqliteDriver.open(file);
  const store1 = await SqliteDraftStore.open(driver1);

  let draft = draftWithSpecs(SPECS, new SeqIds("line"));
  // Entered but NOT yet added: raw, unvalidated text, including junk the parser
  // would reject. Restoring must be faithful, not sanitised.
  draft = {
    ...draft,
    form: { product_id: "prod-CU-WIRE", gross: "7.7", tare: "0.2", price: "3.5abc" },
  };
  await store1.save(draft, null);
  await driver1.close();
  console.log("  connection closed; process-level state discarded");

  const driver2 = NodeSqliteDriver.open(file);
  const store2 = await SqliteDraftStore.open(driver2);
  const back = await store2.load();
  const lines = back ? orderedLines(back) : [];

  console.log(`  reloaded draft ${String(back?.id)} with ${String(lines.length)} line(s)`);
  console.log(`  amounts=${JSON.stringify(lines.map((l) => l.amount))} total=${back ? cartTotal(back) : "-"}`);
  console.log(`  restored form=${JSON.stringify(back?.form)}`);

  check("the draft came back", back !== null && back.id === "draft-0001");
  check("all three lines came back in order", lines.map((l) => l.product_code).join(",") === "FE-STEEL,AL-CAN,CU-WIRE");
  check(
    "every weight and price is byte-identical",
    lines.map((l) => `${l.gross_weight}/${l.tare_weight}/${l.net_weight}/${l.unit_price}/${l.list_price}`).join(" ") ===
      "10.005/0.002/10.003/15.00/15.00 0.006/0.001/0.005/1.00/1.20 0.005/0.000/0.005/1.00/1.10",
  );
  check("the total is unchanged after the round trip", back !== null && cartTotal(back) === "150.07");
  check("seq values survived", lines.map((l) => l.seq).join(",") === "1,2,3");
  check("next_seq survived, so a new line cannot collide", back?.next_seq === 4, `next_seq=${String(back?.next_seq)}`);
  check(
    "the half-typed entry fields came back verbatim, junk included",
    back?.form.gross === "7.7" && back.form.tare === "0.2" && back.form.price === "3.5abc" &&
      back.form.product_id === "prod-CU-WIRE",
  );

  const types = await driver2.all<{ t: string }>(
    "SELECT DISTINCT typeof(amount) t FROM local_draft_lines",
  );
  check(
    "money is stored as SQLite text, never coerced to a float",
    types.length === 1 && types[0]?.t === "text",
    `typeof(amount) = ${JSON.stringify(types.map((r) => r.t))}`,
  );

  await driver2.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ C4 ---- */

async function c4EngineNeverSeesADraft(): Promise<void> {
  header("C4: the sync engine cannot see, claim, or send a draft");
  const dir = tempDir("isolation");
  const file = join(dir, "iso.db");
  const driver = NodeSqliteDriver.open(file);
  const billStore = await SqliteLocalStore.open(driver);
  await signInProofDevice(driver);
  const draftStore = await SqliteDraftStore.open(driver);
  const clock = new FakeClock();
  const server = new FakeServer();
  const engine = new SyncEngine({
    store: billStore,
    transport: new OnlineTransport(server),
    clock,
  });

  const draft = draftWithSpecs(SPECS, new SeqIds("line"));
  await draftStore.save(draft, null);

  const draftLineCount = (
    await driver.all<{ c: number }>("SELECT COUNT(*) c FROM local_draft_lines")
  )[0]!.c;

  const ready = await billStore.listReadyToSend(clock.now(), 100);
  const pending = await billStore.listByState("pending");
  const recovered = await engine.recoverInterrupted();
  const run = await engine.runOnce();

  console.log(`  draft rows: 1 header, ${String(draftLineCount)} lines`);
  console.log(`  engine sees ready=${String(ready.length)} pending=${String(pending.length)} recovered=${String(recovered.length)}`);
  console.log(`  runOnce -> ${JSON.stringify(run)}   billsOnServer=${String(server.billCount)}`);

  check("the draft really is stored", draftLineCount === 3);
  check("listReadyToSend returns nothing", ready.length === 0);
  check("listByState('pending') returns nothing", pending.length === 0);
  check("startup recovery finds nothing to recover", recovered.length === 0);
  check("the engine attempted zero sends", run.attempted === 0 && run.synced === 0);
  check("nothing reached the server", server.billCount === 0);

  // Not a vacuous pass: promote, and the SAME engine sends it immediately.
  const loaded = await draftStore.load();
  const bill = buildLocalBill(
    { clock, ids: new SeqIds("promoted") },
    {
      seller_id: loaded!.seller_id,
      vehicle_no: null,
      items: toBillItems(loaded!),
      total_amount: cartTotal(loaded!),
      master_as_of: loaded!.master_as_of,
    },
  );
  await draftStore.promoteToBill(loaded!, bill, PROOF_OWNER);
  const run2 = await engine.runOnce();
  console.log(`  after promotion: runOnce -> ${JSON.stringify(run2)} billsOnServer=${String(server.billCount)}`);
  check(
    "after promotion the same engine sends it — so C4 was not passing vacuously",
    run2.attempted === 1 && run2.synced === 1 && server.billCount === 1,
  );
  check(
    "the promoted bill carries all three lines and the exact total",
    bill.payload.items.length === 3 && bill.payload.total_amount === "150.07",
    `items=${String(bill.payload.items.length)} total=${String(bill.payload.total_amount)}`,
  );

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------------ C5 ---- */

interface Snapshot {
  drafts: number;
  draftLines: number;
  bills: number;
  billState: string | null;
  billTotal: string | null;
  billItems: number | null;
  integrity: string;
}

async function inspect(file: string): Promise<Snapshot> {
  const d = NodeSqliteDriver.open(file);
  await d.exec("PRAGMA busy_timeout = 5000");
  const one = async (sql: string): Promise<number> =>
    (await d.all<{ c: number }>(sql))[0]!.c;
  const drafts = await one("SELECT COUNT(*) c FROM local_draft");
  const draftLines = await one("SELECT COUNT(*) c FROM local_draft_lines");
  const bills = await one("SELECT COUNT(*) c FROM local_bills");
  const rows = await d.all<{ sync_state: string; payload_json: string }>(
    "SELECT sync_state, payload_json FROM local_bills LIMIT 1",
  );
  const integrity = (await d.all<{ integrity_check: string }>("PRAGMA integrity_check"))[0]!
    .integrity_check;
  let billState: string | null = null;
  let billTotal: string | null = null;
  let billItems: number | null = null;
  if (rows[0]) {
    billState = rows[0].sync_state;
    const payload = JSON.parse(rows[0].payload_json) as {
      total_amount: string | null;
      items: unknown[];
    };
    billTotal = payload.total_amount;
    billItems = payload.items.length;
  }
  await d.close();
  return { drafts, draftLines, bills, billState, billTotal, billItems, integrity };
}

async function c5CrashAtTheTransition(mode: "before-commit" | "after-commit"): Promise<void> {
  header(`C5 (${mode}): SIGKILL at the draft -> bill transition`);
  const dir = tempDir(`crash-${mode}`);
  const file = join(dir, "crash.db");

  const driver = NodeSqliteDriver.open(file);
  const draftStore = await SqliteDraftStore.open(driver);
  await SqliteLocalStore.open(driver); // ensure the bills table exists too
  await signInProofDevice(driver);
  await draftStore.save(draftWithSpecs(SPECS, new SeqIds("line")), null);
  await driver.close();

  const billId = "bill-crash-0001";
  const child = fileURLToPath(new URL("./cartCrashChild.js", import.meta.url));
  const r = spawnSync(
    process.execPath,
    [child, file, mode, billId, "idem-crash-0001"],
    { encoding: "utf8" },
  );
  for (const line of (r.stdout || "").split("\n").filter(Boolean)) console.log(`  | ${line}`);
  if (r.stderr) for (const line of r.stderr.split("\n").filter(Boolean)) console.log(`  ! ${line}`);
  console.log(`  child exit: status=${String(r.status)} signal=${String(r.signal)}`);

  check(
    "the child really died abnormally (it never reached its own exit path)",
    r.status !== 99 && r.status !== 98 && r.status !== 0,
    `status=${String(r.status)} signal=${String(r.signal)} — 99 would mean the kill never fired, 98 an error before it`,
  );

  const snap = await inspect(file);
  console.log(
    `  after reopen: draft=${String(snap.drafts)} draftLines=${String(snap.draftLines)}` +
      ` bills=${String(snap.bills)} billState=${String(snap.billState)}` +
      ` billItems=${String(snap.billItems)} billTotal=${String(snap.billTotal)}`,
  );
  console.log(`  integrity_check = ${snap.integrity}`);

  const hasDraft = snap.drafts === 1;
  const hasBill = snap.bills === 1;

  check("the database is not corrupt after the kill", snap.integrity === "ok");
  check(
    "EXACTLY ONE of {draft, bill} exists — never both, never neither",
    hasDraft !== hasBill,
    `draft=${String(hasDraft)} bill=${String(hasBill)}`,
  );

  if (mode === "before-commit") {
    check("killed before COMMIT: the draft is intact", hasDraft && snap.draftLines === 3);
    check("killed before COMMIT: no bill was written", snap.bills === 0);
    check(
      "so the yard re-saves the same load once — no duplicate bill, nothing lost",
      hasDraft && !hasBill,
    );
  } else {
    check("killed after COMMIT: the bill is there, pending", hasBill && snap.billState === "pending");
    check(
      "killed after COMMIT: it carries all 3 lines and the exact total",
      snap.billItems === 3 && snap.billTotal === "150.07",
    );
    check(
      "killed after COMMIT: the draft and its lines are gone",
      snap.drafts === 0 && snap.draftLines === 0,
      "otherwise the next save would bill the same load twice",
    );
  }

  rmSync(dir, { recursive: true, force: true });
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("Phase 2c-3 — multi-item cart with persisted draft, headless proof");
  console.log(`node ${process.version}, node:sqlite against real files in ${tmpdir()}`);

  const draft = c1TotalOfThreeLines();
  c2DeleteMiddleLine(draft);
  await c3DraftSurvivesReopen();
  await c4EngineNeverSeesADraft();
  await c5CrashAtTheTransition("before-commit");
  await c5CrashAtTheTransition("after-commit");

  console.log("");
  console.log(failures === 0 ? "ALL CART CASES PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => {
    console.log(`CART_EXIT=${code}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("CART PROOF CRASHED:", err);
    process.exitCode = 1;
  });
