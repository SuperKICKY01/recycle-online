/**
 * P1.23 (commit c3) proof: THE PICKER UNION AND SEND-TIME ID RESOLUTION.
 *
 *   npm run prove:pickerseller
 *
 * Two headless concerns, one file:
 *
 *   U   THE-LOCAL-ROW-SURVIVES-A-REFRESH-THAT-DELETES cells 3-4 — the picker
 *       union, driven PURE over `mergeSellersForPicker`. Cell 3: an unsettled
 *       local row is offered. Cell 4 (THE WINDOW): a settled-but-not-arrived row
 *       is STILL offered, and drops only once the server row reaches the cache.
 *
 *   R   the send-time resolver, over a REAL `SqliteLocalStore` +
 *       `SqliteLocalSellerStore`: the branded provenance type, and the ONE
 *       resolver reached from BOTH entry points in one run — `bill_send.owed()`
 *       (finding 1, the settle-to-refresh window) and `bill_send.recover()`
 *       (finding 2, the crash/boot sweep). Two green callers are not a proven
 *       composition (`lessons/two-green-proofs-do-not-cover-the-seam.md`), so
 *       both are driven here, and the seam grep is recorded in the phase report.
 *
 * THE COMPILE CELL (the route half of `a-value-comparison-cannot-prove-a-path`)
 * IS RUN BY HAND, like `proveSellerKind`'s: a node proof cannot construct a
 * `ResolvedSellerId` from a hardcoded string to watch both typecheck programs
 * redden without writing into `src/` and shelling out to `tsc` twice. It is
 * staged as a disproof and reported with the two exit codes; see the note at R.
 *
 * PRESET RED: `process.exitCode = 1` at entry, cleared only if every cell passes.
 * OWN FIXTURE: each rig is a fresh temp database; nothing is reseeded.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteIdentityStore } from "../adapters/sqlite/SqliteIdentityStore.js";
import { SqliteLocalSellerStore } from "../adapters/sqlite/SqliteLocalSellerStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { mergeSellersForPicker } from "../cart/pickerSellers.js";
import type { LocalPickerSeller, PickerServerSeller } from "../cart/pickerSellers.js";
import { createLocalBill } from "../sync/createBill.js";
import type { BillDraft } from "../sync/createBill.js";
import { billSendHandler } from "../sync/outboxHandlers.js";
import type { OutboxDeps } from "../sync/outboxHandlers.js";
import { ResolvedSellerId } from "../sync/resolvedSellerId.js";
import type { LocalSeller, LocalSellerDraft, IssuedCode } from "../sync/localSeller.js";
import type { SellerCreateOutcome, SellerCreateTransport } from "../sync/sellerCreate.js";
import type { LocalBill } from "../sync/types.js";
import { FakeClock, OfflineTransport, PROOF_OWNER, SeqIds } from "./fakes.js";

process.exitCode = 1;

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/**
 * This proof settles sellers by writing the store directly (`markSellerCreated`),
 * never through the create path, so the create transport is never called.
 */
class NoSellerTransport implements SellerCreateTransport {
  createSeller(): Promise<SellerCreateOutcome> {
    return Promise.reject(new Error("provePickerSeller: seller create is not driven here"));
  }
}

const DRAFT: LocalSellerDraft = {
  name: "สมชาย เก็บของเก่า",
  phone: null,
  grade: null,
  id_number: null,
  address: null,
  vehicle_no: null,
};

/* ------------------------------------------------------------------ rig --- */

interface Rig {
  driver: NodeSqliteDriver;
  bills: SqliteLocalStore;
  sellers: SqliteLocalSellerStore;
  clock: FakeClock;
  ids: SeqIds;
  deps: OutboxDeps;
  dir: string;
}

async function openRig(name: string): Promise<Rig> {
  const dir = mkdtempSync(join(tmpdir(), `recycle-p123-picker-${name}-`));
  const driver = NodeSqliteDriver.open(join(dir, "bills.db"));
  const bills = await SqliteLocalStore.open(driver);
  const sellers = SqliteLocalSellerStore.open(driver);
  await new SqliteIdentityStore(driver).save(PROOF_OWNER);
  const clock = new FakeClock();
  const deps: OutboxDeps = {
    store: bills,
    transport: new OfflineTransport(),
    clock,
    backoffBaseMs: 1000,
    backoffMaxMs: 30_000,
    masterDataRetryMs: 300_000,
    sellerStore: sellers,
    sellerTransport: new NoSellerTransport(),
  };
  return { driver, bills, sellers, clock, ids: new SeqIds(name), deps, dir };
}

async function closeRig(r: Rig): Promise<void> {
  await r.driver.close();
  rmSync(r.dir, { recursive: true, force: true });
}

async function stock(r: Rig, n: number): Promise<void> {
  const codes: IssuedCode[] = [];
  for (let i = 1; i <= n; i += 1) {
    codes.push({ code: `S${String(400 + i)}`, token: `tok-${String(i)}-${"z".repeat(30)}` });
  }
  await r.sellers.saveReservations(codes, r.clock.now());
}

async function newSeller(r: Rig, id: string): Promise<LocalSeller> {
  const made = await r.sellers.createLocalSeller(DRAFT, PROOF_OWNER, id, r.clock.now());
  if (made.kind !== "created") throw new Error(`fixture: could not create ${id}`);
  return made.seller;
}

/** Settle a local seller — write the server's id onto it, exactly as a settle does. */
async function settle(r: Rig, sellerId: string, serverId: string): Promise<void> {
  await r.sellers.markSellerCreated(sellerId, serverId, 1, r.clock.now());
}

/** Weigh a bill against a local seller. `buildLocalBill` parks it. Returns the row. */
async function parkBillBehind(r: Rig, sellerId: string): Promise<LocalBill> {
  const draft: BillDraft = {
    seller: { kind: "local", local_seller_id: sellerId },
    vehicle_no: null,
    items: [
      {
        id: r.ids.newId(),
        product_id: "prod-1",
        line_no: 1,
        gross_weight: "10.005",
        tare_weight: "0.002",
        net_weight: "10.003",
        unit_price: "15.00",
        list_price: "15.00",
      },
    ],
    total_amount: "150.05",
    master_as_of: null,
  };
  return createLocalBill({ clock: r.clock, ids: r.ids, store: r.bills }, draft, PROOF_OWNER);
}

/** The bill as it stands now — parked bills are `pending`, so this finds both. */
async function reread(r: Rig, id: string): Promise<LocalBill | null> {
  const rows = await r.bills.listByState("pending");
  return rows.find((b) => b.id === id) ?? null;
}

/* -------------------------------------------------------------------- U --- */

function unionCells(): void {
  header("U: THE-LOCAL-ROW-SURVIVES-A-REFRESH-THAT-DELETES cells 3-4 — the picker union");

  const cached: PickerServerSeller[] = [
    { id: "srv-1", code: "C001", name: "ร้านเก่า", phone: null, grade: "A" },
  ];
  const unsettled: LocalPickerSeller = {
    id: "loc-1", code: "S401", name: "คนใหม่", phone: null, grade: null, server_seller_id: null,
  };
  const windowRow: LocalPickerSeller = {
    id: "loc-2", code: "S402", name: "คนกลางทาง", phone: null, grade: null, server_seller_id: "srv-2",
  };

  // Cell 3 — an unsettled local row is offered, under its local id.
  const m3 = mergeSellersForPicker(cached, [unsettled]);
  check(
    "U3. the picker offers the unsettled local seller alongside the cache",
    m3.options.some((o) => o.id === "loc-1") &&
      m3.localIds.has("loc-1") &&
      m3.options.some((o) => o.id === "srv-1"),
    `options=[${m3.options.map((o) => o.id).join(",")}] localIds=[${[...m3.localIds].join(",")}]`,
  );
  const m3refresh = mergeSellersForPicker(cached, [unsettled]);
  check(
    "U3. a refresh that does not contain it leaves it offered — the DELETE of the cache never touched it",
    m3refresh.options.some((o) => o.id === "loc-1"),
    `options=[${m3refresh.options.map((o) => o.id).join(",")}]`,
  );

  // Cell 4 — THE WINDOW. A settled row whose server row has NOT arrived is still
  // offered; once it arrives in the cache, it drops.
  const m4window = mergeSellersForPicker(cached, [windowRow]);
  check(
    "U4. THE WINDOW: a SETTLED local row whose server row has not arrived is still offered, under its LOCAL id",
    m4window.options.some((o) => o.id === "loc-2") && m4window.localIds.has("loc-2"),
    `options=[${m4window.options.map((o) => o.id).join(",")}]`,
  );
  const cachedAfter: PickerServerSeller[] = [
    ...cached,
    { id: "srv-2", code: "C002", name: "ร้านใหม่บนระบบ", phone: null, grade: "B" },
  ];
  const m4arrived = mergeSellersForPicker(cachedAfter, [windowRow]);
  check(
    "U4. once the server row ARRIVES in the cache, the local row is dropped — offered once, under the server id",
    !m4arrived.options.some((o) => o.id === "loc-2") &&
      m4arrived.options.some((o) => o.id === "srv-2") &&
      !m4arrived.localIds.has("loc-2"),
    `options=[${m4arrived.options.map((o) => o.id).join(",")}] localIds=[${[...m4arrived.localIds].join(",")}]`,
  );

  // RED CASE — TWO, named. (1) drop-at-settle: the window row above must NOT be
  // dropped while the server row is absent — an implementation that dropped at
  // settle fails the WINDOW cell (m4window), which is the discriminator, because
  // only a refresh-free interval separates drop-at-settle from drop-at-arrival.
  check(
    "U4. RED CASE (drop-at-settle): the settled-not-arrived row is KEPT — dropping at settle makes the seller vanish mid-weigh",
    m4window.options.some((o) => o.id === "loc-2"),
    "kept: the server row has not arrived, so the local row is still the only way to name this seller",
  );
  // (2) an origin marker on a CACHED row: `localIds` never names a server row —
  // the cache holds nothing local to mark (delete-and-reinsert would destroy it).
  check(
    "U. RED CASE (origin marker on the cache): localIds never names a cached server row",
    !m3.localIds.has("srv-1") && !m4arrived.localIds.has("srv-1") && !m4arrived.localIds.has("srv-2"),
    `localIds over the cache=[${[...m4arrived.localIds].filter((id) => id.startsWith("srv")).join(",")}]`,
  );
}

/* -------------------------------------------------------------------- R --- */

/**
 * THE COMPILE CELL, RUN BY HAND — the route half of
 * `a-value-comparison-cannot-prove-a-path`. `ResolvedSellerId` has a PRIVATE
 * constructor and its one factory takes a settled seller, so a hardcoded id
 * cannot be minted into the type and cannot reach `applyResolvedSellerId`. To
 * watch that redden, stage EITHER of these in `resolveParkedSeller.ts` and run
 * both typecheck programs:
 *
 *   const id = new ResolvedSellerId("srv-hardcoded");          // private ctor
 *   await store.applyResolvedSellerId(bill.id, "srv-hardcoded", now); // string
 *
 * Both are compile errors in BOTH programs; removing them restores exit 0. The
 * result is recorded in the phase report with the two exit codes. A correct
 * final id proves nothing about the path it took; the TYPE is what does.
 */
async function brandedType(): Promise<void> {
  header("R1: the provenance type — a ResolvedSellerId comes only from a SETTLED seller");
  const r = await openRig("branded");
  try {
    await stock(r, 2);
    const settled = await newSeller(r, "loc-branded-1");
    await settle(r, settled.id, "srv-branded-1");
    const settledRow = await r.sellers.getLocalSeller(settled.id);
    const unsettledRow = await newSeller(r, "loc-branded-2");

    const fromSettled = settledRow === null ? null : ResolvedSellerId.fromSettledSeller(settledRow);
    const fromUnsettled = ResolvedSellerId.fromSettledSeller(unsettledRow);

    check(
      "R1. a SETTLED seller yields a ResolvedSellerId carrying the server id",
      fromSettled instanceof ResolvedSellerId && fromSettled.value === "srv-branded-1",
      `instance=${String(fromSettled instanceof ResolvedSellerId)} value=${String(fromSettled?.value)}`,
    );
    check(
      "R1. an UNSETTLED seller yields null — no bill behind it can be handed a resolved id (asserted by DIRECTION)",
      fromUnsettled === null,
      `got=${String(fromUnsettled)}`,
    );
  } finally {
    await closeRig(r);
  }
}

async function resolverComposition(): Promise<void> {
  header("R2-R4: the ONE resolver, reached from bill_send.owed() AND bill_send.recover()");

  // R2 — FINDING 1: a bill weighed after its seller SETTLED (the window). owed()
  // un-parks it and stamps the server id, so it never reaches POST /bills with a
  // local id.
  {
    const r = await openRig("owed");
    try {
      await stock(r, 2);
      const s = await newSeller(r, "loc-owed");
      await settle(r, s.id, "srv-owed");
      const bill = await parkBillBehind(r, s.id);
      const before = await reread(r, bill.id);
      check(
        "R2. CONTROL: the bill is parked, behind an already-settled seller, carrying the LOCAL id (the window)",
        before?.local_seller_parked_at !== null &&
          before?.local_seller_id === s.id &&
          before?.payload.seller_id === s.id,
        `parked=${String(before?.local_seller_parked_at)} payload.seller_id=${String(before?.payload.seller_id)}`,
      );
      const owed = await billSendHandler(r.deps).owed(100);
      const after = await reread(r, bill.id);
      check(
        "R2. bill_send.owed() UN-PARKS the window bill and stamps the SERVER id",
        after?.local_seller_parked_at === null && after?.payload.seller_id === "srv-owed",
        `parked=${String(after?.local_seller_parked_at)} payload.seller_id=${String(after?.payload.seller_id)}`,
      );
      check(
        "R2. ...and it is now in the sendable queue owed() returned",
        owed.some((b) => b.id === bill.id),
        `queue=[${owed.map((b) => b.id).join(",")}]`,
      );
    } finally {
      await closeRig(r);
    }
  }

  // R3 — FINDING 2: the SAME resolver at boot. A bill left parked by a crash
  // between the settle and the release is recovered by recover(), which names it.
  {
    const r = await openRig("recover");
    try {
      await stock(r, 2);
      const s = await newSeller(r, "loc-rec");
      await settle(r, s.id, "srv-rec");
      const bill = await parkBillBehind(r, s.id);
      const swept = await billSendHandler(r.deps).recover(r.clock.now());
      const after = await reread(r, bill.id);
      check(
        "R3. bill_send.recover() (the boot sweep) UN-PARKS the crash-stranded bill and stamps the SERVER id",
        after?.local_seller_parked_at === null && after?.payload.seller_id === "srv-rec",
        `parked=${String(after?.local_seller_parked_at)} payload.seller_id=${String(after?.payload.seller_id)}`,
      );
      check(
        "R3. ...and recover() names it among the ids it swept — the boot's only observable",
        swept.includes(bill.id),
        `swept=[${swept.join(",")}]`,
      );
    } finally {
      await closeRig(r);
    }
  }

  // R4 — THE ROUTE'S NEGATIVE, under BOTH callers: a bill behind an UNSETTLED
  // seller is left parked. The resolver gates on settle-state, not on the caller.
  {
    const r = await openRig("unsettled");
    try {
      await stock(r, 2);
      const s = await newSeller(r, "loc-uns");
      const bill = await parkBillBehind(r, s.id);
      const owed = await billSendHandler(r.deps).owed(100);
      const afterOwed = await reread(r, bill.id);
      check(
        "R4. owed() leaves a bill behind an UNSETTLED seller PARKED, still carrying its local id, and out of the queue",
        afterOwed?.local_seller_parked_at !== null &&
          afterOwed?.payload.seller_id === s.id &&
          !owed.some((b) => b.id === bill.id),
        `parked=${String(afterOwed?.local_seller_parked_at)} inQueue=${String(owed.some((b) => b.id === bill.id))}`,
      );
      const swept = await billSendHandler(r.deps).recover(r.clock.now());
      const afterRec = await reread(r, bill.id);
      check(
        "R4. recover() leaves it parked too, and does not name it — the settle, not the entry point, is the gate",
        afterRec?.local_seller_parked_at !== null && !swept.includes(bill.id),
        `parked=${String(afterRec?.local_seller_parked_at)} named=${String(swept.includes(bill.id))}`,
      );
    } finally {
      await closeRig(r);
    }
  }
}

/* ----------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("P1.23 (commit c3) — the picker union and send-time id resolution");
  unionCells();
  await brandedType();
  await resolverComposition();
  console.log(
    `\n${failures === 0 ? "ALL PICKER-SELLER CASES PASSED" : `FAILED — ${String(failures)} check(s)`}`,
  );
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => {
    process.exitCode = code;
    console.log(`PICKERSELLER_EXIT=${String(code)}`);
  })
  .catch((err: unknown) => {
    console.error("PICKER-SELLER PROOF CRASHED:", err);
    process.exitCode = 1;
    console.log("PICKERSELLER_EXIT=1");
  });
