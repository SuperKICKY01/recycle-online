/**
 * THE SALE KIND, HEADLESS (M2): `sale_send` on a REAL SQLite file (node driver), drained by a REAL SyncEngine, with
 * a scripted transport for the outcomes and a scripted fetch for the HTTP mapping.
 *
 *   npm run prove:salesend
 *
 *   W1  write-first: a saved sale is on the device, pending, numberless (and SAYS so), owed 1 -- the sign-out sheet
 *       names it as a SALE (บิลขาย), not a purchase
 *   W2  offline: the pass leaves it pending, attempt 1, a backoff scheduled, counted retryable; nothing lost
 *   W3  online: accepted -> synced with the server's doc_no, owed 0; the bill counters did not move
 *   W4  a lost response: the replay answers duplicate -> synced with the doc_no; the key sent both times is the same
 *   W5  refused on its merits -> failed, shown in red, no longer owed (hard rule 8: visible, never silent)
 *   W6  insufficient_stock -> parked: still owed, out of the queue until its slow retry is due, then back in it
 *   W7  head of line: the first sale cannot go, so the second is NOT attempted in that pass (doc_no order)
 *   W8  owner: a sale written by someone else on this handset is neither sent nor shown nor counted
 *   W9  registry order: a purchase drained in the SAME pass before the parked sale is asked again
 *   W10 a crash mid-send: the stranded `syncing` sale is swept back to pending at boot, key unchanged
 *   W11 the pure core: a weight line and a piece line by the shared rule under down_1; received > total refused;
 *       the payload declares the rule, carries strings only, and the id/key are the caller's
 *   W12 the HTTP mapping, by status, over a scripted fetch: 201, 200, 2xx-without-doc_no, 409 insufficient_stock,
 *       409 other, 422, 424, 401, 403, 426, 500, a thrown fetch
 *
 * DISPROOF (named before running): move `sale_send` BEFORE `bill_send` in buildOutboxRegistry -> W9 goes red.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HttpSaleTransport } from "../adapters/httpSaleTransport.js";
import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteIdentityStore } from "../adapters/sqlite/SqliteIdentityStore.js";
import { SqliteLocalSaleStore } from "../adapters/sqlite/SqliteLocalSaleStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { signOutCard, signOutCardText } from "../session/signOutNotice.js";
import { buildSalePayload, receivedProblem, saleStateLine, sellLine, sellTotal } from "../sell/sellView.js";
import type { SellProduct } from "../sell/sellView.js";
import { createLocalBill } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import { saleDocLabel } from "../sync/localSale.js";
import type { LocalSale, SalePayload, SaleTransport } from "../sync/localSale.js";
import type { RowOwner, SendOutcome } from "../sync/types.js";
import { FakeClock, FakeServer, noSellerKind, OfflineTransport, OnlineTransport, PROOF_OWNER, SeqIds } from "./fakes.js";

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const OTHER: RowOwner = { tenant_id: PROOF_OWNER.tenant_id, user_id: "00000000-0000-4000-8000-00000000eeee" };

/** A transport whose answers are SCRIPTED, in order, and which records each sale it was handed. */
class ScriptedSaleTransport implements SaleTransport {
  readonly sent: SalePayload[] = [];
  constructor(private readonly answers: (SendOutcome | "throw")[]) {}
  sendSale(sale: LocalSale): Promise<SendOutcome> {
    this.sent.push(sale.payload);
    const a = this.answers.shift() ?? { kind: "unavailable", reason: "script exhausted", reachable: false };
    if (a === "throw") return Promise.reject(new Error("socket hang up"));
    return Promise.resolve(a);
  }
}

/** Every leaf path whose value is not a string (hard rule 1: money and weight are never a float on the wire). */
function leavesNotString(v: unknown, path = ""): string[] {
  if (typeof v === "string") return [];
  if (v !== null && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>).flatMap(([k, x]) => leavesNotString(x, path === "" ? k : `${path}.${k}`));
  }
  return [path];
}

function payload(n: number, at: string): SalePayload {
  return {
    id: `sale-${String(n)}`, buyer_id: "buyer-1", device_created_at: at, idempotency_key: `key-sale-${String(n)}`,
    items: [{ id: `line-${String(n)}`, product_id: "prod-1", line_no: 1, gross_weight: "10.000", tare_weight: "0.000",
      net_weight: "10.000", unit_price: "12.50", pricing_basis: "weight", rounding_rule: "half_up_0.01" }],
    total_amount: "125.00",
  };
}

/** `transport` may be a factory over the rig's own purchase server, so a sale's answer can depend on what the
 *  PURCHASE kind delivered -- built at construction, never patched into the engine afterwards. */
async function rig(name: string, transport: SaleTransport | ((server: FakeServer) => SaleTransport), billsOnline = false) {
  const dir = mkdtempSync(join(tmpdir(), `recycle-m2-sale-${name}-`));
  const driver = NodeSqliteDriver.open(join(dir, "device.db"));
  const bills = await SqliteLocalStore.open(driver);
  await new SqliteIdentityStore(driver).save(PROOF_OWNER);
  const sales = SqliteLocalSaleStore.open(driver);
  const clock = new FakeClock();
  const server = new FakeServer();
  const saleTransport = typeof transport === "function" ? transport(server) : transport;
  const engine = new SyncEngine({
    ...noSellerKind(),
    store: bills,
    transport: billsOnline ? new OnlineTransport(server) : new OfflineTransport(),
    clock,
    saleStore: sales,
    saleTransport,
    backoffBaseMs: 1000,
    backoffMaxMs: 30_000,
    masterDataRetryMs: 300_000,
  });
  const close = async () => {
    await driver.close();
    rmSync(dir, { recursive: true, force: true });
  };
  return { driver, bills, sales, clock, server, engine, close };
}

async function main(): Promise<number> {
  header("W1-W3 write first; offline; online");
  {
    const t = new ScriptedSaleTransport([{ kind: "unavailable", reason: "offline", reachable: false },
      { kind: "accepted", doc_no: "S-B-2569-1" }]);
    const r = await rig("w1", t);
    await r.sales.createSale({ payload: payload(1, r.clock.now().toISOString()), buyer_label: "C001 โรงหล่อ", owner: PROOF_OWNER, now: r.clock.now() });
    const [s0] = await r.sales.listSalesForScreen(10);
    const owed0 = await r.engine.owedByKind();
    const sheet = signOutCardText(signOutCard({ owed: owed0, failed: 0, failure: null, session: "active", appOutdated: false }));
    check("W1 written FIRST: pending, no doc_no, the label says so, owed sale_send 1, the sign-out sheet names a SALE",
      s0?.sync_state === "pending" && s0.doc_no === null && saleDocLabel(s0) === "ยังไม่มีเลขที่ — รอส่ง"
        && owed0.sale_send === 1 && owed0.bill_send === 0 && sheet.includes("มีบิลขายรอส่ง 1 ใบ") && !sheet.includes("มีบิลรอส่ง"),
      JSON.stringify({ state: s0?.sync_state, owed: owed0, sheet: sheet.slice(0, 120) }));
    const p1 = await r.engine.runOnce();
    const [s1] = await r.sales.listSalesForScreen(10);
    check("W2 offline: still pending, attempt 1, a backoff scheduled, retryable 1 -- the sale is not lost",
      s1?.sync_state === "pending" && s1.attempt_count === 1 && s1.next_attempt_at > r.clock.now().toISOString()
        && p1.salesRetryable === 1 && p1.salesSynced === 0 && (await r.sales.countSalesOwed()) === 1,
      JSON.stringify({ s: s1?.sync_state, a: s1?.attempt_count, next: s1?.next_attempt_at, p1 }));
    r.clock.advance(60_000);
    const p2 = await r.engine.runOnce();
    const [s2] = await r.sales.listSalesForScreen(10);
    const owed2 = await r.engine.owedByKind();
    check("W3 online: synced with the server's doc_no, owed 0; the PURCHASE counters did not move",
      s2?.sync_state === "synced" && s2.doc_no === "S-B-2569-1" && owed2.sale_send === 0 && p2.salesSynced === 1
        && p2.attempted === 0 && p2.synced === 0 && saleStateLine(s2).tone === "positive",
      JSON.stringify({ s: s2?.sync_state, doc: s2?.doc_no, p2 }));
    await r.close();
  }

  header("W4 a lost response, replayed");
  {
    const t = new ScriptedSaleTransport(["throw", { kind: "duplicate", doc_no: "S-B-2569-4" }]);
    const r = await rig("w4", t);
    await r.sales.createSale({ payload: payload(4, r.clock.now().toISOString()), buyer_label: "C001", owner: PROOF_OWNER, now: r.clock.now() });
    await r.engine.runOnce();
    r.clock.advance(60_000);
    await r.engine.runOnce();
    const [s] = await r.sales.listSalesForScreen(10);
    check("W4 a thrown send retries; the replay answers duplicate -> synced with its doc_no; the SAME key both times",
      s?.sync_state === "synced" && s.doc_no === "S-B-2569-4" && t.sent.length === 2
        && t.sent[0]?.idempotency_key === "key-sale-4" && t.sent[1]?.idempotency_key === "key-sale-4" && t.sent[0]?.id === t.sent[1]?.id,
      JSON.stringify({ s: s?.sync_state, doc: s?.doc_no, keys: t.sent.map((x) => x.idempotency_key) }));
    await r.close();
  }

  header("W5 refused on its merits");
  {
    const t = new ScriptedSaleTransport([{ kind: "rejected", reason: "HTTP 422: buyer_not_found" }]);
    const r = await rig("w5", t);
    await r.sales.createSale({ payload: payload(5, r.clock.now().toISOString()), buyer_label: "C001", owner: PROOF_OWNER, now: r.clock.now() });
    const p = await r.engine.runOnce();
    const [s] = await r.sales.listSalesForScreen(10);
    const line = s === undefined ? null : saleStateLine(s);
    check("W5 failed, SHOWN in red with the reason, no longer owed (visible, never silent)",
      s?.sync_state === "failed" && line?.tone === "danger" && (line.text.includes("buyer_not_found")) && p.salesRejected === 1
        && (await r.sales.countSalesOwed()) === 0 && saleDocLabel(s) === "ไม่ได้เลขที่ — เซิร์ฟเวอร์ไม่รับบิลนี้",
      JSON.stringify({ s: s?.sync_state, line }));
    await r.close();
  }

  header("W6 parked on insufficient_stock");
  {
    const t = new ScriptedSaleTransport([{ kind: "rejected_resolvable", reason: "HTTP 409", code: "insufficient_stock" },
      { kind: "accepted", doc_no: "S-B-2569-6" }]);
    const r = await rig("w6", t);
    await r.sales.createSale({ payload: payload(6, r.clock.now().toISOString()), buyer_label: "C001", owner: PROOF_OWNER, now: r.clock.now() });
    const p = await r.engine.runOnce();
    const [s] = await r.sales.listSalesForScreen(10);
    const queuedNow = await r.sales.listSalesToSend(10, r.clock.now());
    r.clock.advance(300_001);
    const queuedLater = await r.sales.listSalesToSend(10, r.clock.now());
    check("W6 parked: still owed (pending, parked_code), OUT of the queue until its slow retry, then back IN it; the list says why",
      s?.sync_state === "pending" && s.parked_code === "insufficient_stock" && p.salesParked === 1 && queuedNow.length === 0
        && queuedLater.length === 1 && (await r.sales.countSalesOwed()) === 1 && saleStateLine(s).tone === "warning",
      JSON.stringify({ code: s?.parked_code, now: queuedNow.length, later: queuedLater.length }));
    await r.close();
  }

  header("W7 head of line");
  {
    const t = new ScriptedSaleTransport([{ kind: "unavailable", reason: "HTTP 500", reachable: true }]);
    const r = await rig("w7", t);
    const at = r.clock.now();
    await r.sales.createSale({ payload: payload(71, new Date(at.getTime() - 2000).toISOString()), buyer_label: "C001", owner: PROOF_OWNER, now: at });
    await r.sales.createSale({ payload: payload(72, new Date(at.getTime() - 1000).toISOString()), buyer_label: "C001", owner: PROOF_OWNER, now: at });
    await r.engine.runOnce();
    check("W7 the first sale (written first) could not go, so the second was NOT attempted that pass (numbering order)",
      t.sent.length === 1 && t.sent[0]?.id === "sale-71", JSON.stringify(t.sent.map((x) => x.id)));
    await r.close();
  }

  header("W8 owner");
  {
    const t = new ScriptedSaleTransport([{ kind: "accepted", doc_no: "S-B-2569-8" }]);
    const r = await rig("w8", t);
    await r.sales.createSale({ payload: payload(8, r.clock.now().toISOString()), buyer_label: "C001", owner: OTHER, now: r.clock.now() });
    await r.engine.runOnce();
    check("W8 another person's sale on this handset: not sent, not shown, not counted",
      t.sent.length === 0 && (await r.sales.listSalesForScreen(10)).length === 0 && (await r.sales.countSalesOwed()) === 0,
      JSON.stringify({ sent: t.sent.length }));
    await r.close();
  }

  header("W9 registry order: a purchase first in the same pass");
  {
    // The sale's transport answers by whether the PURCHASE is already on the server: stock exists only once it is.
    const order: string[] = [];
    const r = await rig("w9", (server) => ({
      sendSale: (sale: LocalSale): Promise<SendOutcome> => {
        order.push(`sale:${sale.id}@purchases=${String(server.submits)}`);
        return Promise.resolve(server.submits > 0
          ? { kind: "accepted", doc_no: "S-B-2569-9" }
          : { kind: "rejected_resolvable", reason: "HTTP 409", code: "insufficient_stock" });
      },
    }), true);
    await createLocalBill({ store: r.bills, ids: new SeqIds("w9"), clock: r.clock }, {
      seller: { kind: "server", seller_id: "sell-1" }, vehicle_no: null, total_amount: null, master_as_of: null,
      items: [{ id: "item-9", product_id: "prod-1", line_no: 1, gross_weight: "10.000", tare_weight: "0.000",
        net_weight: "10.000", unit_price: "10.00", list_price: "10.00" }],
    }, PROOF_OWNER);
    await r.sales.createSale({ payload: payload(9, r.clock.now().toISOString()), buyer_label: "C001", owner: PROOF_OWNER, now: r.clock.now() });
    await r.engine.runOnce();
    const [s] = await r.sales.listSalesForScreen(10);
    check("W9 the purchase reached the server BEFORE the sale was asked in the same pass, so the sale went first time",
      s?.sync_state === "synced" && order.length === 1 && r.server.submits === 1, JSON.stringify({ s: s?.sync_state, order }));
    await r.close();
  }

  header("W10 a crash mid-send");
  {
    const r = await rig("w10", new ScriptedSaleTransport([]));
    await r.sales.createSale({ payload: payload(10, r.clock.now().toISOString()), buyer_label: "C001", owner: PROOF_OWNER, now: r.clock.now() });
    const claimed = await r.sales.claimSaleSend("sale-10", r.clock.now());
    const recovered = await r.engine.recoverInterrupted();
    const [s] = await r.sales.listSalesForScreen(10);
    check("W10 a claimed (syncing) sale is swept back to pending at boot, payload and key unchanged",
      claimed && recovered.sale_send.includes("sale-10") && s?.sync_state === "pending" && s.idempotency_key === "key-sale-10",
      JSON.stringify({ claimed, swept: recovered.sale_send, s: s?.sync_state }));
    await r.close();
  }

  header("W11 the pure core");
  {
    const steel: SellProduct = { id: "p-w", code: "FE", name: "เหล็ก", uom_name: "กก.", pricing_basis: "weight" };
    const pipe: SellProduct = { id: "p-c", code: "PIPE", name: "ท่อ", uom_name: "ชิ้น", pricing_basis: "piece" };
    // By hand: (120.500 - 0.500) x 8.77 = 1052.40 -> down_1 -> 1052.00; 7 x 185.55 = 1298.85 -> down_1 -> 1298.00.
    const w = sellLine({ productId: "p-w", gross: "120.5", tare: "0.5", pieces: "", price: "8.77" }, steel, "down_1");
    const pc = sellLine({ productId: "p-c", gross: "", tare: "", pieces: "7", price: "185.55" }, pipe, "down_1");
    const total = sellTotal([w, pc]);
    check("W11 weight 120.000 -> 1052.00 and piece 7 -> 1298.00 under down_1; total 2350.00",
      w.ok && w.figures.netWeight === "120.000" && w.figures.amount === "1052.00" && pc.ok && pc.figures.amount === "1298.00" && total === "2350.00",
      JSON.stringify({ w, pc, total }));
    check("W11 received more than the total is refused; exactly the total and blank are fine",
      receivedProblem("2350.01", "2350.00") === "ยอดรับเงินมากกว่ายอดขาย" && receivedProblem("2350.00", "2350.00") === null && receivedProblem("", "2350.00") === null);
    const bad = sellLine({ productId: "p-w", gross: "5", tare: "6", pieces: "", price: "1" }, steel, "down_1");
    check("W11 tare above gross is refused before any figure", !bad.ok && bad.problem === "น้ำหนักภาชนะมากกว่าน้ำหนักรวม");
    if (w.ok && pc.ok && total !== null) {
      const body = buildSalePayload({ id: "sid", idempotencyKey: "skey", buyerId: "b1", deviceCreatedAt: "2026-10-25T00:00:00.000Z",
        lines: [{ id: "l1", draft: { productId: "p-w", gross: "120.5", tare: "0.5", pieces: "", price: "8.77" }, product: steel, figures: w.figures },
          { id: "l2", draft: { productId: "p-c", gross: "", tare: "", pieces: "7", price: "185.55" }, product: pipe, figures: pc.figures }],
        roundingRule: "down_1", total, received: "500" });
      const nonStrings = leavesNotString(body);
      check("W11 the payload: the caller's id and key, every line declares down_1, weights fixed to 3 places, and NO value but line_no is anything other than a string",
        body.id === "sid" && body.idempotency_key === "skey" && body.items.every((i) => i.rounding_rule === "down_1")
          // the count as the line rule normalises it (3 places; SaleItemIn.quantity takes decimal_places=3)
          && body.items[0]?.gross_weight === "120.500" && body.items[0]?.tare_weight === "0.500" && body.items[1]?.quantity === "7.000"
          && body.received_amount === "500.00" && body.total_amount === "2350.00"
          && JSON.stringify(nonStrings) === JSON.stringify(["items.0.line_no", "items.1.line_no"]),
        JSON.stringify({ nonStrings, q: body.items[1]?.quantity, g: body.items[0]?.gross_weight, t: body.items[0]?.tare_weight,
          rcv: body.received_amount, tot: body.total_amount }));
      check("W11 CONTROL: the walk finds a planted number", JSON.stringify(leavesNotString({ a: "x", b: 1.5 })) === JSON.stringify(["b"]));
    }
  }

  header("W12 the HTTP mapping");
  {
    const cases: [string, () => Promise<Response>, string][] = [
      ["201", () => Promise.resolve(new Response(JSON.stringify({ doc_no: "S-B-2569-1" }), { status: 201 })), "accepted"],
      ["200", () => Promise.resolve(new Response(JSON.stringify({ doc_no: "S-B-2569-1" }), { status: 200 })), "duplicate"],
      ["201 no doc_no", () => Promise.resolve(new Response("{}", { status: 201 })), "unavailable"],
      ["409 insufficient_stock", () => Promise.resolve(new Response(JSON.stringify({ detail: { code: "insufficient_stock" } }), { status: 409 })), "rejected_resolvable"],
      ["409 other", () => Promise.resolve(new Response(JSON.stringify({ detail: { code: "sale_already_voided" } }), { status: 409 })), "unavailable"],
      ["422", () => Promise.resolve(new Response(JSON.stringify({ detail: { code: "total_mismatch" } }), { status: 422 })), "rejected"],
      ["424", () => Promise.resolve(new Response(JSON.stringify({ detail: { code: "product_inactive" } }), { status: 424 })), "rejected_resolvable"],
      ["401", () => Promise.resolve(new Response("{}", { status: 401 })), "session_expired"],
      ["403", () => Promise.resolve(new Response(JSON.stringify({ detail: { code: "permission_required" } }), { status: 403 })), "forbidden"],
      ["426", () => Promise.resolve(new Response("{}", { status: 426 })), "client_outdated"],
      ["500", () => Promise.resolve(new Response("oops", { status: 500 })), "unavailable"],
      ["throw", () => Promise.reject(new Error("ECONNRESET")), "unavailable"],
    ];
    const got: string[] = [];
    let bodyOk = true;
    for (const [name, answer, want] of cases) {
      let seen = "";
      const tr = new HttpSaleTransport({ baseUrl: "http://x", getToken: () => Promise.resolve("tok"),
        fetchImpl: ((_u: unknown, init?: RequestInit) => { seen = String(init?.body ?? ""); return answer(); }) as typeof fetch });
      const o = await tr.sendSale({ payload: payload(12, "2026-10-25T00:00:00.000Z") } as LocalSale);
      got.push(`${name}=${o.kind}`);
      if (o.kind !== want) bodyOk = false;
      if (name === "409 insufficient_stock" && !(o.kind === "rejected_resolvable" && o.code === "insufficient_stock")) bodyOk = false;
      if (name === "201" && JSON.parse(seen).idempotency_key !== "key-sale-12") bodyOk = false;
    }
    check("W12 every status maps to its outcome; the body sent is the payload byte for byte", bodyOk, got.join(" "));
  }

  console.log(`\n${failures === 0 ? "ALL OK" : `${String(failures)} FAILED`}`);
  return failures === 0 ? 0 : 1;
}

process.exitCode = 1;
main()
  .then((code) => {
    console.log(`PROVE_SALESEND_EXIT=${String(code)}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("SALE-SEND PROOF CRASHED:", err);
    console.log("PROVE_SALESEND_EXIT=1");
    process.exitCode = 1;
  });
