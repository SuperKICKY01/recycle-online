/**
 * P1.8b GATES (commit 2) proof: A BILL WAITING ON A SELLER THIS DEVICE MADE.
 *
 * Run: npm run prove:parkedbill
 *
 * ---------------------------------------------------------------------------
 * THE CRITERION THAT COSTS REAL MONEY IF IT REGRESSES
 * ---------------------------------------------------------------------------
 * `POST /bills` classifies an unresolvable `seller_id` as 422 — PERMANENT,
 * terminal — on a premise stated in its own header: the device got those ids
 * from this tenant's own `/sellers`, so a miss means corruption. Offline seller
 * creation falsifies that premise and edits nothing at either end. Left alone,
 * the first offline walk-in is a terminally failed bill for cash already out of
 * the drawer, on a row hard rule 5 forbids deleting
 * (`ROADMAP.md § P1.8` "A BILL CAN NAME A SELLER THE SERVER HAS NEVER SEEN").
 *
 * REAL SQLITE, REAL STORES, REAL RUNNER, REAL ENGINE. The transports are
 * doubles and nothing else is. Every pass goes through the registry
 * `buildOutboxRegistry` produces, so what is measured is the thing that ships.
 *
 * Sections are named for the criteria they carry
 * (`ROADMAP.md § P1.8`, "THE SELLER-KIND CRITERIA, DERIVED FROM THE DESIGN
 * ABOVE"):
 *
 *   P1  A-BILL-BEHIND-AN-UNCREATED-SELLER-IS-NEVER-OFFERED — its six cells over
 *       ONE staging, plus all THREE named red cases
 *   P2  THE-PARKED-SENTENCE-SENDS-NOBODY-TO-THE-OFFICE — three cells
 *   P3  OWED-ASKS-WHO-CREATED-THE-SELLER, AND THE RELEASE DOES NOT — cells 3
 *       and 4, the half no single-identity fixture reaches
 *   P4  THIS-KIND-DRAINS-BEFORE-BILLS-IN-ONE-PASS — with the bill that WAITS on
 *       the seller, which is the staging the member order needs
 *   P5  the refill's CALL SITE, driven through `SyncEngine.runOnce`
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT COVER, SAID BEFORE ANYONE READS IT AS COMPLETE
 * ---------------------------------------------------------------------------
 * THE SERVER HALF OF CELL 6. The criterion is *(HEADLESS, plus SERVER for the
 * release)*, and the SERVER half — the released bill actually reaching
 * `POST /bills` and the `doc_no_counters` row MOVING — is NOT RUN here. Driving
 * it needs a settled seller on a real server, which needs a real reservation,
 * and NOTHING RE-ISSUES A RESERVATION: every run would burn a block of the
 * shop's seller-code sequence permanently, into slips this system never sees
 * again. What is asserted instead is that the released bill is in the sendable
 * queue carrying the SERVER's id and is handed to the transport — the last step
 * before the wire.
 *
 * `json_set` IS MEASURED ON node:sqlite AND NOT ON THE HANDSET. Same bound every
 * SQLite claim in this tree carries: expo-sqlite is a different build and no
 * proof here can run it.
 *
 * THE PICKER. Nothing in the app can weigh a bill against a local seller yet —
 * the union of the cache with the unsettled local rows is S10's rework. The park
 * is exercised by this file and by nothing else, which is stated so a reader
 * does not take a green here for a path a yard has walked.
 *
 * ON THE OUTPUT. Mostly Thai. Mojibake in the console is the console — this box
 * is codepage 874, `lessons/console-is-not-the-observation.md`.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteDeviceStore } from "../adapters/sqlite/SqliteDeviceStore.js";
import { SqliteIdentityStore } from "../adapters/sqlite/SqliteIdentityStore.js";
import { SqliteLocalSellerStore } from "../adapters/sqlite/SqliteLocalSellerStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { createLocalBill } from "../sync/createBill.js";
import type { BillDraft } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import type { IssuedCode, LocalSeller, LocalSellerDraft } from "../sync/localSeller.js";
import {
  billNotice,
  LOCAL_SELLER_PENDING_CODE,
  localSellerParkReason,
  MASTER_DATA_CODES,
  parkedReason,
} from "../sync/parkedReason.js";
import type { NoticeInput } from "../sync/parkedReason.js";
import { buildOutboxRegistry } from "../sync/outboxHandlers.js";
import type { OutboxDeps } from "../sync/outboxHandlers.js";
import { OutboxRunner } from "../sync/outboxRunner.js";
import type { SellerCreateOutcome, SellerCreateTransport } from "../sync/sellerCreate.js";
import type { RefillOutcome, ReservationTransport } from "../sync/sellerRefill.js";
import type {
  LocalBill,
  RowOwner,
  SendOutcome,
  Transport,
  VoidOutcome,
} from "../sync/types.js";
import {
  FakeClock,
  FakeServer,
  OfflineTransport,
  OnlineTransport,
  PROOF_OWNER,
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

/* ------------------------------------------------------------ fixtures --- */

const OWNER_A: RowOwner = PROOF_OWNER;
/** Same shop, different person — the case the release must cross. */
const OWNER_B: RowOwner = {
  tenant_id: OWNER_A.tenant_id,
  user_id: "00000000-0000-4000-8000-00000000cccc",
};

const SERVER_SELLER = "sell-known-to-the-server";
const SERVER_SELLER_ID_FROM_CREATE = "00000000-0000-4000-8000-0000000000ff";

const SELLER_DRAFT: LocalSellerDraft = {
  name: "สมหญิง ขายเก่ง",
  phone: null,
  grade: null,
  id_number: null,
  address: null,
  vehicle_no: null,
};

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

/** A bill against a seller the SERVER already holds. */
function serverBill(itemId: string): BillDraft {
  return {
    seller: { kind: "server", seller_id: SERVER_SELLER },
    vehicle_no: null,
    items: [{ ...ITEM, id: itemId }],
    total_amount: "150.05",
    master_as_of: null,
  };
}

/** A bill against a seller THIS DEVICE created and has not sent yet. */
function localBill(localSellerId: string, itemId: string): BillDraft {
  return {
    seller: { kind: "local", local_seller_id: localSellerId },
    vehicle_no: null,
    items: [{ ...ITEM, id: itemId }],
    total_amount: "150.05",
    master_as_of: null,
  };
}

/* ------------------------------------------------------------- doubles --- */

/** Answers every create the same way, and records which rows it was handed. */
class FixedSellerTransport implements SellerCreateTransport, ReservationTransport {
  readonly created: string[] = [];
  readonly topUps: string[] = [];
  constructor(
    private readonly outcome: SellerCreateOutcome,
    private readonly refill: RefillOutcome = {
      kind: "unavailable",
      reason: "no reservation route in this case",
    },
  ) {}
  createSeller(row: LocalSeller): Promise<SellerCreateOutcome> {
    this.created.push(row.id);
    return Promise.resolve(this.outcome);
  }
  topUp(deviceId: string): Promise<RefillOutcome> {
    this.topUps.push(deviceId);
    return Promise.resolve(this.refill);
  }
}

/**
 * `OnlineTransport` WITH THE ONE THING IT DOES NOT EXPOSE: which bills it was
 * asked to send.
 *
 * A WRAPPER AND NOT AN EDIT TO THE SHARED DOUBLE. `OnlineTransport` records into
 * a private counter that no caller can read, and widening it would touch every
 * proof in the suite for the benefit of this one. What cell 2 needs is a list,
 * and the list is what a wrapper can add without changing what anything else
 * sees.
 *
 * READING THE TRANSPORT IS THE POINT. "The bill was not sent" asserted from the
 * bill's own state is satisfied by a send that happened and failed; only the
 * REQUEST LIST separates a bill that was never offered from one that was offered
 * and refused, and the criterion's own words are that no request is spent
 * discovering what the device already knows.
 */
class RecordingTransport implements Transport {
  readonly sent: string[] = [];
  constructor(private readonly inner: Transport) {}
  sendBill(bill: LocalBill): Promise<SendOutcome> {
    this.sent.push(bill.id);
    return this.inner.sendBill(bill);
  }
  voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    return this.inner.voidBill(bill, reason);
  }
}

/* ----------------------------------------------------------------- rig --- */

interface Rig {
  driver: NodeSqliteDriver;
  bills: SqliteLocalStore;
  sellers: SqliteLocalSellerStore;
  device: SqliteDeviceStore;
  identity: SqliteIdentityStore;
  clock: FakeClock;
  server: FakeServer;
  transport: RecordingTransport;
  sellerTransport: FixedSellerTransport;
  runner: OutboxRunner;
  engine: SyncEngine;
  ids: SeqIds;
  dir: string;
}

async function openRig(name: string, sellerTransport?: FixedSellerTransport): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), `recycle-p18b-p-${name}-`));
  const driver = NodeSqliteDriver.open(join(dir, "bills.db"));
  const bills = await SqliteLocalStore.open(driver);
  const sellers = SqliteLocalSellerStore.open(driver);
  const identity = new SqliteIdentityStore(driver);
  await identity.save(OWNER_A);
  const ids = new SeqIds(name);
  const device = new SqliteDeviceStore(driver, {
    /*
     * v4-SHAPED on purpose: the server's `ReservationTopUp` declares
     * `device_id: uuid.UUID` and refuses anything else at the edge, so a proof
     * minting `dev-1` would be green about a value the wire rejects.
     *
     * THE FIRST VERSION OF THIS LINE BROKE ITS OWN RULE and the proof was green
     * over it. It spliced the case name straight in, so case `p5` minted
     * `…-p50000000000` — and `p` is not a hex digit, so that id is not a UUID
     * and `uuid.UUID` would refuse it. It was caught by READING THE PRINTED
     * VALUE, not by any assertion, which is why there is now a cell below that
     * asserts the shape. A fixture whose comment states a contract it does not
     * meet is worse than one with no comment.
     */
    newId: () =>
      `00000000-0000-4000-8000-${Array.from(name)
        .map((c) => c.charCodeAt(0).toString(16))
        .join("")
        .padEnd(12, "0")
        .slice(0, 12)}`,
  });
  const clock = new FakeClock();
  const server = new FakeServer();
  const transport = new RecordingTransport(new OnlineTransport(server));
  const st =
    sellerTransport ??
    new FixedSellerTransport({
      kind: "created",
      server_seller_id: SERVER_SELLER_ID_FROM_CREATE,
    });
  const deps: OutboxDeps = {
    store: bills,
    transport,
    clock,
    backoffBaseMs: 1000,
    backoffMaxMs: 30_000,
    masterDataRetryMs: 300_000,
    sellerStore: sellers,
    sellerTransport: st,
  };
  return {
    driver,
    bills,
    sellers,
    device,
    identity,
    clock,
    server,
    transport,
    sellerTransport: st,
    runner: new OutboxRunner({ registry: buildOutboxRegistry(deps), clock }),
    engine: new SyncEngine({
      store: bills,
      transport,
      clock,
      sellerStore: sellers,
      sellerTransport: st,
      deviceStore: device,
      backoffBaseMs: 1000,
      backoffMaxMs: 30_000,
      masterDataRetryMs: 300_000,
    }),
    ids,
    dir,
  };
}

async function closeRig(r: Rig): Promise<void> {
  await r.driver.close();
  rmSync(r.dir, { recursive: true, force: true });
}

/** Give the device spendable codes without going near a network. */
async function stock(r: Rig, n: number): Promise<void> {
  const codes: IssuedCode[] = [];
  for (let i = 1; i <= n; i += 1) {
    codes.push({ code: `S${String(500 + i)}`, token: `tok-${String(i)}-${"q".repeat(30)}` });
  }
  await r.sellers.saveReservations(codes, r.clock.now());
}

async function newLocalSeller(r: Rig, owner: RowOwner): Promise<LocalSeller> {
  const made = await r.sellers.createLocalSeller(SELLER_DRAFT, owner, r.ids.newId(), r.clock.now());
  if (made.kind !== "created") throw new Error(`fixture: ${made.refusal.kind}`);
  return made.seller;
}

/** The bill as the store holds it, never as the fixture remembers it. */
async function reread(r: Rig, id: string): Promise<LocalBill> {
  const b = await r.bills.getBill(id);
  if (b === null) throw new Error(`fixture: bill ${id} vanished`);
  return b;
}

/* ------------------------------------------------------------------ P1 --- */

/**
 * A-BILL-BEHIND-AN-UNCREATED-SELLER-IS-NEVER-OFFERED, over its own staging: a
 * local seller still owed, a bill `X` weighed against it, a bill `Y` weighed
 * against a seller the server already knows, ONE pass.
 *
 * `Y` IS THE PRESENCE SIBLING FOR THE FIRST TWO CELLS. A queue holding one row
 * makes "it dams nothing" vacuously true, and a transport that made no calls at
 * all satisfies "no request was made for X" completely.
 */
async function p1NeverOffered(): Promise<void> {
  header("P1: A-BILL-BEHIND-AN-UNCREATED-SELLER-IS-NEVER-OFFERED — one staging, six cells");
  // The seller create BOUNCES, so the seller stays owed for the whole of this
  // case and the release cannot fire early and hide the park.
  const bouncing = new FixedSellerTransport({ kind: "unavailable", reason: "offline" });
  const r = await openRig("p1", bouncing);
  try {
    await stock(r, 1);
    const seller = await newLocalSeller(r, OWNER_A);
    const x = await createLocalBill(
      { store: r.bills, clock: r.clock, ids: r.ids },
      localBill(seller.id, "item-x"),
      OWNER_A,
    );
    const y = await createLocalBill(
      { store: r.bills, clock: r.clock, ids: r.ids },
      serverBill("item-y"),
      OWNER_A,
    );
    check(
      "STAGING: X names the local seller and Y names a server seller",
      (await reread(r, x.id)).local_seller_id === seller.id &&
        (await reread(r, y.id)).local_seller_id === null,
      `${seller.id}`,
    );

    // CELL 1 — absent from the sendable queue, WITH Y present in the same read.
    const queue = await r.bills.listPendingOldestFirst(50);
    const ids = queue.map((b) => b.id);
    console.log(`  sendable queue: ${ids.join(", ")}`);
    check(
      "1. X is ABSENT from the sendable queue — and Y is PRESENT in the same read",
      !ids.includes(x.id) && ids.includes(y.id),
      ids.join(", "),
    );

    // CELL 2 — no request for X, and one for Y, in the same pass.
    const report = await r.runner.runPass();
    console.log(`  performed: ${JSON.stringify(report.performed)}`);
    console.log(`  bills the transport was handed: ${r.transport.sent.join(", ")}`);
    check(
      "2. NO request was made for X in that pass — and one WAS made for Y",
      !r.transport.sent.includes(x.id) && r.transport.sent.includes(y.id),
      r.transport.sent.join(", "),
    );

    // CELL 3 — pending, not failed, and inside the CHECK the table already has.
    const xAfter = await reread(r, x.id);
    check(
      "3. X is still `pending` — not `failed`, and not a state outside local_bills's CHECK",
      xAfter.sync_state === "pending",
      `sync_state=${xAfter.sync_state}`,
    );
    const states = await r.driver.all<{ s: string }>(
      "SELECT DISTINCT sync_state AS s FROM local_bills",
    );
    check(
      "3. ...and the live schema still admits exactly the four states it always did",
      states.every((row) => ["pending", "syncing", "synced", "failed"].includes(row.s)),
      states.map((row) => row.s).join(", "),
    );

    // CELL 4 — counted in the owed count. Nothing on the device says the work is done.
    const owed = await r.runner.owedCountByKind();
    console.log(`  owed: ${JSON.stringify(owed)}`);
    check(
      "4. X IS counted in the owed count — out of the queue is not out of the debt",
      owed.bill_send >= 1,
      JSON.stringify(owed),
    );
    const unsent = await r.bills.unsentBreakdown();
    check(
      "4. ...and it is in `mine` and NOT in `mineBlocked` — it waits on nobody, not on the office",
      unsent.mine >= 1 && unsent.mineBlocked === 0,
      JSON.stringify(unsent),
    );

    // CELL 5 — the parked-release cadences that exist TODAY run, and X stays out.
    // This is the "by nothing else" half, which no assertion about the settle
    // can reach: the master-data release is a different release for a different
    // park, and it must not touch this one.
    const releasedNow = await r.bills.releaseMasterDataBlocked(r.clock.now(), true);
    const viaEngine = await r.engine.retryMasterDataNow();
    const queue5 = (await r.bills.listPendingOldestFirst(50)).map((b) => b.id);
    check(
      "5. the operator's explicit master-data retry releases NOTHING here",
      releasedNow === 0 && viaEngine === 0,
      `direct=${String(releasedNow)} engine=${String(viaEngine)}`,
    );
    check(
      "5. ...and X is STILL out of the sendable queue while its seller is owed",
      !queue5.includes(x.id),
      queue5.join(", "),
    );
    check(
      "5. CONTROL: the seller really is still owed, so cell 5 is not measuring an empty case",
      (await r.sellers.getLocalSeller(seller.id))?.sync_state === "pending",
      `created=${String(bouncing.created.length)} attempts`,
    );

    /*
     * CELL 6 — the settle releases it.
     *
     * THE BILL TRANSPORT IS OFFLINE FOR THIS PASS, and that is a correction to
     * this cell rather than a convenience. Read with the ONLINE transport the
     * queue is EMPTY afterwards and the cell goes red — because the release
     * fires before `bill_send` reads its owed rows and the bill goes in the SAME
     * pass, which is exactly the property P4 asserts as correct. "X is in the
     * sendable queue" is true at a MOMENT, and an offline send is what holds the
     * bill at that moment so it can be read there.
     */
    const settling = new FixedSellerTransport({
      kind: "created",
      server_seller_id: SERVER_SELLER_ID_FROM_CREATE,
    });
    const offlineBills = new RecordingTransport(new OfflineTransport());
    const deps2: OutboxDeps = {
      store: r.bills,
      transport: offlineBills,
      clock: r.clock,
      backoffBaseMs: 1000,
      backoffMaxMs: 30_000,
      masterDataRetryMs: 300_000,
      sellerStore: r.sellers,
      sellerTransport: settling,
    };
    const runner2 = new OutboxRunner({ registry: buildOutboxRegistry(deps2), clock: r.clock });
    // The seller's backoff was set by its bounce; move past it so the settle can
    // be attempted in this pass rather than in an imaginary later one.
    r.clock.advance(60_000);
    await runner2.runPass();

    const xReleased = await reread(r, x.id);
    const queue6 = (await r.bills.listPendingOldestFirst(50)).map((b) => b.id);
    check(
      "6. after the seller settles, X is in the sendable queue",
      queue6.includes(x.id),
      queue6.join(", "),
    );
    check(
      "6. ...carrying the SERVER's seller id on its local row, not the local one",
      xReleased.payload.seller_id === SERVER_SELLER_ID_FROM_CREATE,
      `payload.seller_id=${xReleased.payload.seller_id}`,
    );
    check(
      "6. ...with the park cleared and the ORIGIN kept",
      xReleased.local_seller_parked_at === null && xReleased.local_seller_id === seller.id,
      `parked=${String(xReleased.local_seller_parked_at)} origin=${String(xReleased.local_seller_id)}`,
    );
    check(
      "6. ...and it was OFFERED in that pass — a request it never got while parked",
      offlineBills.sent.includes(x.id) && !r.transport.sent.includes(x.id),
      `offered=${offlineBills.sent.join(",")} earlier=${r.transport.sent.join(",")}`,
    );
    /*
     * ...AND IT SENDS. The SERVER half — the real POST and the `doc_no_counters`
     * row MOVING — is not run here and the header says why; what is asserted is
     * a doc_no coming back through the shipping path, which is the last thing
     * before the wire.
     */
    const deps3: OutboxDeps = { ...deps2, transport: r.transport };
    const runner3 = new OutboxRunner({ registry: buildOutboxRegistry(deps3), clock: r.clock });
    r.clock.advance(60_000);
    await runner3.runPass();
    const xSent = await reread(r, x.id);
    /*
     * THIS LABEL SAID "which it could never have done carrying the local id" AND
     * THAT WAS AN OVERCLAIM, found by the disproof that removed the payload
     * rewrite: the bill sent ANYWAY, with `payload.seller_id` still the local
     * one, and came back with `B-2569-2`. `FakeServer` accepts any seller_id —
     * it has no `/sellers` to resolve against — so nothing in this file can
     * observe what a real `POST /bills` would do with an id it cannot find.
     *
     * What this cell measures is that the released bill reaches the transport
     * and is accepted, which is the last step before the wire. What separates a
     * correct release from the half-implementation is the PAYLOAD cell above,
     * and that is why it is asserted separately rather than inferred from a
     * successful send
     * (`lessons/README.md § Lessons` "a-green-cell-is-evidence-about-the-assertion-not-the-claim.md — applies to every assertion you are about to cite").
     */
    check(
      "6. ...and it SENDS — reaching the transport and coming back with a doc_no",
      xSent.sync_state === "synced" && xSent.doc_no !== null,
      `state=${xSent.sync_state} doc_no=${String(xSent.doc_no)}`,
    );
  } finally {
    await closeRig(r);
  }
}

/* ---------------------------------------------------------------- P1r --- */

/**
 * THE THREE NAMED RED CASES, run rather than described.
 *
 * The criterion names them: the bill left in the queue and refused 422; the
 * bill excluded by a NEW `sync_state` value; and — THE DISCRIMINATING ONE — the
 * bill parked using the EXISTING master-data park and one of the codes already
 * in `MASTER_DATA_CODES`, which satisfies cells 1, 2, 4 and 6 exactly and is
 * wrong in the one place no queue reading looks.
 */
async function p1RedCases(): Promise<void> {
  header("P1r: the three RED CASES the criterion names");
  const r = await openRig("p1r");
  try {
    await stock(r, 1);
    const seller = await newLocalSeller(r, OWNER_A);

    /* RED 1 — the bill left in the queue. Reproduced by weighing it as a
       `server` bill against the LOCAL seller's id, which is exactly what a
       build with no park does, and driving the real send path. */
    const doomed = await createLocalBill(
      { store: r.bills, clock: r.clock, ids: r.ids },
      {
        seller: { kind: "server", seller_id: seller.id },
        vehicle_no: null,
        items: [{ ...ITEM, id: "item-red1" }],
        total_amount: "150.05",
        master_as_of: null,
      },
      OWNER_A,
    );
    const inQueue = (await r.bills.listPendingOldestFirst(50)).map((b) => b.id);
    check(
      "RED 1: with no park the bill IS in the sendable queue — the defect reproduced",
      inQueue.includes(doomed.id),
      inQueue.join(", "),
    );
    // The server's own rule, applied: an id it cannot resolve is 422, terminal.
    await r.bills.markFailed(doomed.id, "HTTP 422: seller not found", 1, r.clock.now());
    const dead = await reread(r, doomed.id);
    check(
      "RED 1: ...and the server's 422 makes it TERMINAL, for cash already paid",
      dead.sync_state === "failed",
      `sync_state=${dead.sync_state}`,
    );
    check(
      "RED 1: ...on a row nothing may delete — it is still on the device, and still the only record",
      (await r.bills.getBill(doomed.id)) !== null,
    );

    /* RED 2 — the NEW sync_state value. It is refused by the DATABASE, which is
       the design's whole reason for a column pair: the CHECK is baked into
       CREATE TABLE and SQLite cannot alter one without rebuilding the table. */
    let rebuildRefused = "";
    try {
      await r.driver.run("UPDATE local_bills SET sync_state = 'seller_pending' WHERE id = ?", [
        doomed.id,
      ]);
    } catch (err) {
      rebuildRefused = err instanceof Error ? err.message : String(err);
    }
    console.log(`  the database's answer: ${rebuildRefused}`);
    check(
      "RED 2: a NEW sync_state value is REFUSED by the live CHECK, with no rebuild attempted",
      rebuildRefused !== "",
      rebuildRefused.slice(0, 60),
    );
    check(
      "RED 2: ...and the row is untouched by the attempt",
      (await reread(r, doomed.id)).sync_state === "failed",
    );

    /* RED 3 — THE DISCRIMINATING ONE. The existing master-data park, with a code
       already in the known list. Every queue reading agrees with a correct
       build; only the SENTENCE separates them. */
    const x = await createLocalBill(
      { store: r.bills, clock: r.clock, ids: r.ids },
      localBill(seller.id, "item-red3"),
      OWNER_A,
    );
    const correct = billNotice(await reread(r, x.id), "active", "ok");
    const wrong = billNotice(
      { ...(await reread(r, x.id)), local_seller_parked_at: null,
        master_data_missing_at: "2026-08-25T09:00:00.000Z",
        master_data_code: "seller_grade_unset" },
      "active",
      "ok",
    );
    const correctText = [correct.badge, ...correct.lines].join(" ");
    const wrongText = [wrong.badge, ...wrong.lines].join(" ");
    console.log(`  CORRECT: ${correctText}`);
    console.log(`  RED 3  : ${wrongText}`);
    check(
      "RED 3: the existing park sends the yard to the OFFICE about a bill the office cannot move",
      wrongText.includes("สำนักงาน"),
      wrongText.slice(0, 60),
    );
    check(
      "RED 3: ...and the correct one does NOT — which is the only place the two differ",
      !correctText.includes("สำนักงาน"),
      correctText.slice(0, 60),
    );
    check(
      "RED 3: THE DISCRIMINATOR — both are `parked`, so no tone reading separates them",
      correct.tone === "parked" && wrong.tone === "parked",
      `${correct.tone} / ${wrong.tone}`,
    );
  } finally {
    await closeRig(r);
  }
}

/* ------------------------------------------------------------------ P2 --- */

/**
 * THE-PARKED-SENTENCE-SENDS-NOBODY-TO-THE-OFFICE.
 *
 * Staged through the wording function AND through `billNotice`, so what is
 * asserted is the CONCATENATION the card draws and not one line of it.
 */
function p2TheSentence(): void {
  header("P2: THE-PARKED-SENTENCE-SENDS-NOBODY-TO-THE-OFFICE — three cells");

  const parkedOnSeller: NoticeInput = {
    sync_state: "pending",
    attempt_count: 0,
    master_data_missing_at: null,
    master_data_code: null,
    local_seller_parked_at: "2026-08-25T09:00:00.000Z",
    void_requested_at: null,
    void_refused_at: null,
    void_refused_code: null,
  };
  const parkedOnMasterData: NoticeInput = {
    ...parkedOnSeller,
    local_seller_parked_at: null,
    master_data_missing_at: "2026-08-25T09:00:00.000Z",
    master_data_code: "seller_grade_unset",
  };

  const draw = (b: NoticeInput): string => {
    const n = billNotice(b, "active", "ok");
    // DRAW ORDER: the badge sits above the lines on the card, so the assertion
    // is over the whole region rather than over `lines` alone.
    return [n.badge ?? "", ...n.lines].join(" ");
  };
  const mine = draw(parkedOnSeller);
  const office = draw(parkedOnMasterData);
  console.log(`  local-seller park: ${mine}`);
  console.log(`  master-data park : ${office}`);

  // CELL 1 — no instruction to contact the office, over the WHOLE render, with
  // the presence sibling in the same string.
  check(
    "1. the whole render contains NO instruction to contact the office",
    !mine.includes("สำนักงาน") && !mine.includes("แจ้ง" + "สำนักงาน"),
    mine,
  );
  check(
    "1. PRESENCE SIBLING: and it says what is ACTUALLY happening — an absence over silence is nothing",
    mine.includes("ผู้ขาย") && mine.includes("ระบบยังไม่มีผู้ขายรายนี้"),
    mine,
  );

  // CELL 2 — the two renders differ BY DIRECTION, both ways. Two wrong strings
  // also differ, so inequality is not the assertion.
  check(
    "2. the office-owed render CONTAINS the office phrase; the new one does NOT",
    office.includes("สำนักงาน") && !mine.includes("สำนักงาน"),
  );
  check(
    "2. the new render carries its OWN distinctive phrase; the office-owed one does NOT",
    mine.includes("เพิ่งเพิ่มใหม่ในเครื่องนี้") && !office.includes("เพิ่งเพิ่มใหม่ในเครื่องนี้"),
  );

  // CELL 3 — NOT the unknown-code fallback. The fallback is cause-neutral by
  // design, so it avoids naming the office's REMEDY and would satisfy cell 1
  // completely; only a positive assertion on the new text separates them.
  const fallback = parkedReason(LOCAL_SELLER_PENDING_CODE);
  const fallbackText = [fallback.badge, fallback.what, fallback.reassure].join(" ");
  console.log(`  RED CASE (the new code with no entry in the known list): ${fallbackText}`);
  check(
    "3. the new render is NOT the unknown-code fallback — it carries its own text",
    mine.includes(localSellerParkReason().what) &&
      !mine.includes(fallback.what),
    mine.slice(0, 60),
  );
  check(
    "3. RED CASE: routing the new state through parkedReason DOES reach the fallback",
    fallback.unknown,
    `unknown=${String(fallback.unknown)}`,
  );
  check(
    "3. ...and that fallback sends the yard to the office, which is the wrong actor",
    fallbackText.includes("สำนักงาน"),
    fallbackText.slice(0, 60),
  );
  // AND THE CODE MUST NEVER JOIN THE KNOWN LIST: every entry there names the
  // office, and REASSURE promises the bill goes once the office has acted.
  check(
    "3. the new code is deliberately NOT in MASTER_DATA_CODES",
    !(MASTER_DATA_CODES as readonly string[]).includes(LOCAL_SELLER_PENDING_CODE),
    MASTER_DATA_CODES.join(", "),
  );
  check(
    "3. CONTROL: the instrument does find a code that IS in that list",
    (MASTER_DATA_CODES as readonly string[]).includes("seller_grade_unset"),
  );
}

/* ------------------------------------------------------------------ P3 --- */

/**
 * OWED-ASKS-WHO-CREATED-THE-SELLER, AND THE RELEASE DOES NOT — cells 3 and 4.
 *
 * THE HALF NO SINGLE-IDENTITY FIXTURE REACHES. With one identity a filtered and
 * an unfiltered release are indistinguishable. With two, the filtered release
 * strands B's bill FOR EVER — a seller settles exactly once and there is no
 * second event — for cash already paid.
 */
async function p3TheReleaseCrossesTheOwnerFilter(): Promise<void> {
  header("P3: OWED-ASKS-WHO-CREATED-THE-SELLER, AND THE RELEASE DOES NOT — cells 3 and 4");
  const r = await openRig("p3");
  try {
    await stock(r, 2);
    // A creates a seller; A weighs a bill against it; B weighs one against the
    // SAME local seller; B creates a second local seller of their own.
    const sellerA = await newLocalSeller(r, OWNER_A);
    const billA = await createLocalBill(
      { store: r.bills, clock: r.clock, ids: r.ids },
      localBill(sellerA.id, "item-a"),
      OWNER_A,
    );
    await r.identity.save(OWNER_B);
    const billB = await createLocalBill(
      { store: r.bills, clock: r.clock, ids: r.ids },
      localBill(sellerA.id, "item-b"),
      OWNER_B,
    );
    const sellerB = await newLocalSeller(r, OWNER_B);
    await r.identity.save(OWNER_A);

    check(
      "STAGING: two identities, one shop, and both bills name A's seller",
      (await reread(r, billA.id)).local_seller_id === sellerA.id &&
        (await reread(r, billB.id)).local_seller_id === sellerA.id,
    );

    // A signs in and drains. Only A's seller is owed to A.
    await r.runner.runPass();

    // CELL 3 — BOTH bills lose their park and BOTH carry the server's id.
    const a = await reread(r, billA.id);
    const b = await reread(r, billB.id);
    check(
      "3. A's settle releases A's bill",
      a.local_seller_parked_at === null &&
        a.payload.seller_id === SERVER_SELLER_ID_FROM_CREATE,
      `parked=${String(a.local_seller_parked_at)} seller=${a.payload.seller_id}`,
    );
    check(
      "3. ...AND B's bill, which no owner filter would have released",
      b.local_seller_parked_at === null &&
        b.payload.seller_id === SERVER_SELLER_ID_FROM_CREATE,
      `parked=${String(b.local_seller_parked_at)} seller=${b.payload.seller_id}`,
    );
    // ...and B's bill is STILL absent from A's queue, because the QUEUE's own
    // owner predicate holds it. The release crossing the filter does not put a
    // bill under the wrong person.
    const asA = (await r.bills.listPendingOldestFirst(50)).map((x) => x.id);
    check(
      "3. ...and B's bill is still ABSENT from A's sendable queue — the queue's filter still holds",
      !asA.includes(billB.id),
      `A's queue: [${asA.join(", ")}]`,
    );
    /*
     * THE PRESENCE SIBLING, AND IT IS NOT "A's BILL IS IN A's QUEUE".
     *
     * That is what this cell asserted first and it went red, correctly: A's bill
     * was RELEASED and then SENT in the same pass, because the release fires
     * before `bill_send` reads its owed rows. So A's queue is empty by the time
     * it is read, and an absence over an empty queue is satisfied by silence.
     * What separates "the filter held" from "the queue was empty" is that B's
     * bill still EXISTS and is still owed while A's has gone.
     */
    check(
      "3. PRESENCE SIBLING: B's bill exists and is still owed, while A's has already gone",
      (await reread(r, billB.id)).sync_state === "pending" &&
        (await reread(r, billA.id)).sync_state === "synced",
      `B=${(await reread(r, billB.id)).sync_state} A=${(await reread(r, billA.id)).sync_state}`,
    );
    await r.identity.save(OWNER_B);
    const asB = (await r.bills.listPendingOldestFirst(50)).map((x) => x.id);
    check(
      "3. ...and it ENTERS that queue when B signs in — released, not stranded",
      asB.includes(billB.id),
      asB.join(", "),
    );

    // CELL 4 — the presence sibling: B's OWN seller is untouched and still owed.
    const bSeller = await r.sellers.getLocalSeller(sellerB.id);
    check(
      "4. PRESENCE SIBLING: B's own seller is untouched and still owed",
      bSeller?.sync_state === "pending" && bSeller.server_seller_id === null,
      `state=${String(bSeller?.sync_state)}`,
    );
    check(
      "4. ...and A's pass performed A's seller only — owed() IS owner-filtered",
      r.sellerTransport.created.length === 1 && r.sellerTransport.created[0] === sellerA.id,
      r.sellerTransport.created.join(", "),
    );
  } finally {
    await closeRig(r);
  }
}

/* ------------------------------------------------------------------ P4 --- */

/**
 * THIS-KIND-DRAINS-BEFORE-BILLS-IN-ONE-PASS, with the staging the criterion
 * actually names: a bill WAITING on the seller.
 *
 * `proveSellerKind` K8 carries what the member order alone can show and says at
 * the cell that under the staging available there the bill would have sent
 * under either order. This is the staging that separates them, and it needs the
 * park — so it could not exist before this commit.
 *
 * EXACTLY ONE PASS, by construction. Over two passes both orders reach the same
 * end state and every assertion on the final queue is green under both.
 */
async function p4OnePass(): Promise<void> {
  header("P4: THIS-KIND-DRAINS-BEFORE-BILLS-IN-ONE-PASS — one pass, with the bill that waits");
  const r = await openRig("p4");
  try {
    await stock(r, 1);
    const seller = await newLocalSeller(r, OWNER_A);
    const bill = await createLocalBill(
      { store: r.bills, clock: r.clock, ids: r.ids },
      localBill(seller.id, "item-p4"),
      OWNER_A,
    );

    const report = await r.runner.runPass();
    console.log(`  ONE pass performed: ${JSON.stringify(report.performed)}`);

    const settled = await r.sellers.getLocalSeller(seller.id);
    const sent = await reread(r, bill.id);
    check(
      "at the end of that single pass the seller is SETTLED",
      settled?.sync_state === "synced" &&
        settled.server_seller_id === SERVER_SELLER_ID_FROM_CREATE,
      `state=${String(settled?.sync_state)}`,
    );
    check(
      "...and the bill carries a doc_no — both in ONE pass, which only this order produces",
      sent.doc_no !== null && sent.sync_state === "synced",
      `doc_no=${String(sent.doc_no)} state=${sent.sync_state}`,
    );
    check(
      "PRESENCE SIBLING, in the same pass report: one seller performed and one bill performed",
      report.performed.seller_create === 1 && report.performed.bill_send === 1,
      JSON.stringify(report.performed),
    );
    check(
      "...and the seller went FIRST — the bill was invisible to the send kind until it settled",
      r.sellerTransport.created.length === 1 && r.transport.sent.includes(bill.id),
      `created=${r.sellerTransport.created.join(",")} sent=${r.transport.sent.join(",")}`,
    );
  } finally {
    await closeRig(r);
  }
}

/* ------------------------------------------------------------------ P5 --- */

/**
 * THE REFILL'S CALL SITE — driven through `SyncEngine.runOnce`, which is the
 * thing that ships.
 *
 * `proveSellerKind` K6/K7 drive `refillOnce` DIRECTLY, so every cell there is
 * evidence about the function and none of it about whether anything CALLS it.
 * That gap was deliberate and is what this section closes: at `1d7f638` a
 * tree-wide search for a call site outside its own proof returned none.
 */
async function p5TheRefillHasACallSite(): Promise<void> {
  header("P5: the refill's CALL SITE, through SyncEngine.runOnce");
  const holding = new FixedSellerTransport(
    { kind: "created", server_seller_id: SERVER_SELLER_ID_FROM_CREATE },
    {
      kind: "holding",
      holding: {
        target: 2,
        reservations: [
          { code: "S901", token: `t1-${"w".repeat(30)}` },
          { code: "S902", token: `t2-${"w".repeat(30)}` },
        ],
      },
    },
  );
  const r = await openRig("p5", holding);
  try {
    check(
      "STAGING: the device holds nothing and can create nobody",
      (await r.sellers.spendableCount()) === 0,
    );
    check(
      "STAGING: and it has not minted a device identity yet — the pass is what asks",
      (await r.device.load()) === null,
    );

    await r.engine.runOnce();

    check(
      "ONE pass asks for a top-up — the function is no longer callerless",
      holding.topUps.length === 1,
      `topUps=${String(holding.topUps.length)}`,
    );
    check(
      "...under THIS DEVICE's identity, which the pass minted on the way",
      holding.topUps[0] !== undefined && holding.topUps[0] === (await r.device.load()),
      `${String(holding.topUps[0])}`,
    );
    /*
     * ...AND THAT IDENTITY IS A UUID, which is a WIRE CONTRACT and not a local
     * convention: `ReservationTopUp` declares `device_id: uuid.UUID` and refuses
     * anything else at the edge. Asserted because the fixture above got this
     * wrong once and every cell stayed green — the id had a `p` in it, which no
     * reading here could see and the server would have rejected on the first
     * real call.
     */
    const minted = holding.topUps[0] ?? "";
    check(
      "...and that identity is a v4-shaped UUID, which is what the route accepts",
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(minted),
      minted,
    );
    check(
      "CONTROL: and the pattern does reject the shape that fooled it",
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
        "00000000-0000-4000-8000-p50000000000",
      ),
    );
    check(
      "...and the answer is STORED, so the yard can create a walk-in",
      (await r.sellers.spendableCount()) === 2,
      `spendable=${String(await r.sellers.spendableCount())}`,
    );

    // NO CAP, and the count is the number of passes the staging ran rather than
    // a number written here.
    const passes = 4;
    for (let i = 0; i < passes; i += 1) await r.engine.runOnce();
    check(
      "the refill is attempted in the LAST pass as well as the first — no cap",
      holding.topUps.length === 1 + passes,
      `topUps=${String(holding.topUps.length)} passes=${String(1 + passes)}`,
    );
    check(
      "...and re-storing the SAME holding adds nothing — asking every pass is free",
      (await r.sellers.spendableCount()) === 2,
      `spendable=${String(await r.sellers.spendableCount())}`,
    );
  } finally {
    await closeRig(r);
  }

  // AND A REFUSED REFILL COSTS NOTHING ELSE — driven through the same call site
  // rather than through the function, which is the half K7 could not reach.
  const refusing = new FixedSellerTransport({
    kind: "created",
    server_seller_id: SERVER_SELLER_ID_FROM_CREATE,
  });
  const r2 = await openRig("p5b", refusing);
  try {
    const bill = await createLocalBill(
      { store: r2.bills, clock: r2.clock, ids: r2.ids },
      serverBill("item-p5"),
      OWNER_A,
    );
    const owedBefore = await r2.runner.owedCountByKind();
    await r2.engine.runOnce();
    const owedAfter = await r2.runner.owedCountByKind();
    console.log(`  owed before: ${JSON.stringify(owedBefore)}  after: ${JSON.stringify(owedAfter)}`);
    check(
      "a REFUSED refill was attempted in that pass",
      refusing.topUps.length === 1,
      `topUps=${String(refusing.topUps.length)}`,
    );
    check(
      "...and the queued bill reached the server in the SAME pass",
      (await reread(r2, bill.id)).sync_state === "synced",
      `state=${(await reread(r2, bill.id)).sync_state}`,
    );
    check(
      "...and it added NOTHING to the owed counts — a refill is not owed work",
      owedAfter.seller_create === 0 && owedAfter.bill_void === 0,
      JSON.stringify(owedAfter),
    );
    check(
      "PRESENCE SIBLING: the owed count DOES move when real work is queued, in the same run",
      owedBefore.bill_send === 1 && owedAfter.bill_send === 0,
      `${String(owedBefore.bill_send)} -> ${String(owedAfter.bill_send)}`,
    );
    check(
      "...and the holding is unchanged — a bounce leaves exactly one trace, and that is it",
      (await r2.sellers.spendableCount()) === 0,
    );
  } finally {
    await closeRig(r2);
  }
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("P1.8b GATES (commit 2) — the parked bill, the release, and the refill's call site");
  console.log(`node ${process.version}; node:sqlite, real files, one temp dir per case`);

  await p1NeverOffered();
  await p1RedCases();
  p2TheSentence();
  await p3TheReleaseCrossesTheOwnerFilter();
  await p4OnePass();
  await p5TheRefillHasACallSite();

  console.log("");
  console.log(
    failures === 0 ? "ALL PARKED-BILL CASES PASSED" : `FAILED — ${String(failures)} check(s)`,
  );
  return failures === 0 ? 0 : 1;
}

/*
 * PRESET TO RED, per lessons/a-default-exit-code-is-a-default-verdict.md. An
 * unsettled top-level await is not an error on node: the event loop drains and
 * the process exits with the DEFAULT code, which is 0 — so a run that stalls
 * mid-proof prints no exit line and reports GREEN.
 */
process.exitCode = 1;

main()
  .then((code) => {
    console.log(`PARKEDBILL_EXIT=${String(code)}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("PARKED-BILL PROOF CRASHED:", err);
    console.log("PARKEDBILL_EXIT=1");
    process.exitCode = 1;
  });
