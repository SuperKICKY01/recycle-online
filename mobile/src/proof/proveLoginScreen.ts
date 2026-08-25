/**
 * P1.7 step 6: TWO REAL ACCOUNTS IN ONE SHOP, on one device.
 *
 * Run: npm run prove:loginscreen
 *   RECYCLE_API_BASE — the API to drive. Must NOT be the live one.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS THE FIRST TIME ANY OF IT IS EXERCISED
 * ---------------------------------------------------------------------------
 * Every ownership mechanism built in this phase — the send filter, the void
 * filter, the cache tenant, the draft loader — has until now been driven by
 * identities INVENTED by a proof: uuid literals handed to `identity.save()`.
 * That proves the predicates. It does not prove that a person typing a username
 * and a password produces an identity those predicates then treat correctly,
 * because until `acea1ac` no person could: `app/config.ts` held one shop and one
 * account, so every device in every run was the same person.
 *
 * Here both identities come from REAL LOGINS against a REAL server: two seeded
 * accounts, SAME tenant, whose user_ids this file never writes down. The
 * same-shop-different-person case is the silent one — across shops a bill dies
 * loudly with a 422, within a shop it syncs under the wrong person and looks
 * ordinary for ever — and it is the case that has never been driven end to end.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS REAL HERE AND WHAT IS NOT
 * ---------------------------------------------------------------------------
 * REAL: the shop-code exchange, both logins, the identities, the local database,
 * and the send in G — a bill posted over HTTP to a running server, which answers
 * with a doc_no.
 * NOT REAL: nothing is run on a handset, and `App.tsx` is outside this program
 * (tsconfig.node.json rootDir "src"). What is proven is the stores, the engine
 * and the classifications; that the SCREEN routes them is a call site.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { HttpTransport } from "../adapters/httpTransport.js";
import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteDraftStore } from "../adapters/sqlite/SqliteDraftStore.js";
import { SqliteIdentityStore } from "../adapters/sqlite/SqliteIdentityStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { SqliteMasterStore } from "../adapters/sqlite/SqliteMasterStore.js";
import { SqliteShopStore } from "../adapters/sqlite/SqliteShopStore.js";
import { newDraft } from "../cart/cart.js";
import type { Draft } from "../cart/types.js";
import { exchangeShopCode, shopCodeNotice } from "../session/shopCode.js";
import { mustShowSignIn } from "../session/signOut.js";
import { attemptLogin } from "../session/signInIdentity.js";
import type { LoginHttpResponse } from "../session/signInIdentity.js";
import { createLocalBill } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import { systemClock } from "../sync/systemClock.js";
import type { Clock, IdSource, RowOwner } from "../sync/types.js";
import { noSellerKind } from "./fakes.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const API = process.env.RECYCLE_API_BASE ?? "http://127.0.0.1:8231";

/** Seeded into the throwaway directory relation by this pass's GATE 0. */
const GOOD_CODE = "K7M2P9QB";
/** Valid SHAPE, no row. The server answers 404 exactly as for a malformed one. */
const ABSENT_CODE = "B3N4R6TC";

/** Two seeded accounts in ONE shop — server/app/seeddata.py. */
const A_USER = "admin";
const A_PASS = "tenantA-pw-123";
const B_USER = "staff";
const B_PASS = "tenantA-staff-789";

/**
 * REAL UUIDs, because the server requires them and the app mints them.
 *
 * The first version of this file used readable sequence ids (`shift-1`), and 4g
 * failed with `uuid_parsing` on both `body.id` and `body.items[0].id` — hard
 * rule 3 is that bill ids are client-generated UUIDs, and `app/ids.ts` produces
 * them on the handset. A readable id is a row the product cannot produce, so the
 * failure was the FIXTURE and not ownership
 * (lessons/a-proof-fixture-must-be-a-row-the-product-could-produce.md). Left
 * written down because the prediction for 4g named this exact cause before the
 * run, and the run agreed.
 */
class UuidIds implements IdSource {
  newId(): string {
    return randomUUID();
  }
}

const clock: Clock = { now: () => new Date(), sleep: () => Promise.resolve() };

function shopFetch(code: string, base = API) {
  return (): Promise<LoginHttpResponse> =>
    fetch(`${base}/auth/shop-code`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
}

function loginFetch(tenantId: string, username: string, password: string) {
  return (): Promise<LoginHttpResponse> =>
    fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenant_id: tenantId, username, password }),
    });
}

interface Bench {
  dir: string;
  d: NodeSqliteDriver;
  bills: SqliteLocalStore;
  drafts: SqliteDraftStore;
  master: SqliteMasterStore;
  identity: SqliteIdentityStore;
  shop: SqliteShopStore;
}

async function bench(name: string): Promise<Bench> {
  const dir = mkdtempSync(join(tmpdir(), `recycle-loginscreen-${name}-`));
  const d = NodeSqliteDriver.open(join(dir, `${name}.db`));
  const bills = await SqliteLocalStore.open(d);
  return {
    dir,
    d,
    bills,
    drafts: await SqliteDraftStore.open(d),
    master: await SqliteMasterStore.open(d),
    identity: new SqliteIdentityStore(d),
    shop: new SqliteShopStore(d),
  };
}

async function teardown(b: Bench): Promise<void> {
  await b.d.close();
  rmSync(b.dir, { recursive: true, force: true });
}

const ITEM = {
  id: randomUUID(),
  product_id: "prod-1",
  line_no: 1,
  gross_weight: "10.000",
  tare_weight: "0.000",
  net_weight: "10.000",
  unit_price: "15.00",
  list_price: "15.00",
  amount: "150.00",
};

/** Owner columns straight off the row. No store, no mapper. */
async function ownerOf(
  b: Bench,
  table: "local_bills" | "local_draft",
  id: string,
): Promise<{ owner_tenant_id: string | null; owner_user_id: string | null } | null> {
  const r = await b.d.all<{ owner_tenant_id: string | null; owner_user_id: string | null }>(
    `SELECT owner_tenant_id, owner_user_id FROM ${table} WHERE id = ?`,
    [id],
  );
  return r[0] ?? null;
}

/* ------------------------------------------------------------- the shared -- */

interface Shop {
  tenantId: string;
  a: RowOwner;
  b: RowOwner;
  aToken: string;
}

/**
 * The whole real chain, once: a code for a shop, then two people signing in.
 * Every identifier below is the SERVER'S — nothing here invents one.
 */
async function realShopAndTwoPeople(): Promise<Shop | null> {
  const resolved = await exchangeShopCode(shopFetch(GOOD_CODE));
  if (resolved.kind !== "ok") {
    check("PRECONDITION: the shop code resolved", false, resolved.kind);
    return null;
  }
  const inA = await attemptLogin(loginFetch(resolved.tenant_id, A_USER, A_PASS));
  const inB = await attemptLogin(loginFetch(resolved.tenant_id, B_USER, B_PASS));
  if (inA.kind !== "ok" || inB.kind !== "ok") {
    check("PRECONDITION: both accounts signed in", false, `${inA.kind}/${inB.kind}`);
    return null;
  }
  return {
    tenantId: resolved.tenant_id,
    a: { tenant_id: resolved.tenant_id, user_id: inA.userId },
    b: { tenant_id: resolved.tenant_id, user_id: inB.userId },
    aToken: inA.accessToken,
  };
}

/* -------------------------------------------------------------------- 4a -- */

async function s4aSetup(): Promise<void> {
  header("4a — setup: a valid shop code succeeds, an absent one names THE CODE");

  const good = await exchangeShopCode(shopFetch(GOOD_CODE));
  const bad = await exchangeShopCode(shopFetch(ABSENT_CODE));
  console.log(`  valid code  -> ${good.kind}${good.kind === "ok" ? ` tenant=${good.tenant_id}` : ""}`);
  console.log(`  absent code -> ${bad.kind}\n      operator reads: ${String(shopCodeNotice(bad))}`);

  check("a valid code RESOLVES to a shop", good.kind === "ok", good.kind);
  check(
    "and the shop is the server's identifier, not something typed",
    good.kind === "ok" && good.tenant_id.length === 36,
    good.kind === "ok" ? good.tenant_id : "(not ok)",
  );
  check("an absent code is UNKNOWN_CODE", bad.kind === "unknown_code", bad.kind);
  check(
    "the two DIFFER — one branch cannot produce both",
    good.kind !== bad.kind,
    `${good.kind} vs ${bad.kind}`,
  );

  // DIRECTION: the refusal must name the CODE and must not mention a password.
  // At setup no account has been named, so a credentials word would be about
  // something the operator has not been asked for.
  const msg = shopCodeNotice(bad) ?? "";
  check("the refusal names the shop code", msg.includes("รหัสร้าน"), msg);
  check("and says NOTHING about a password", !msg.includes("รหัสผ่าน"), msg);
  check("nothing is said on success", shopCodeNotice(good) === null);

  // A device that stores it is set up; one that does not is not.
  const b = await bench("s4a");
  check("CONTROL: a fresh device knows no shop", (await b.shop.load()) === null);
  if (good.kind === "ok") await b.shop.save({ tenant_id: good.tenant_id });
  const stored = await b.shop.load();
  console.log(`  local_shop after setup: ${JSON.stringify(stored)}`);
  check(
    "the shop is remembered, and it is the resolved one",
    good.kind === "ok" && stored?.tenant_id === good.tenant_id,
    JSON.stringify(stored),
  );
  await teardown(b);
}

/* ------------------------------------------------- 4b, 4c, 4d, 4e, 4f, 4g -- */

/**
 * ONE RUN, ONE DEVICE, TWO REAL PEOPLE. 4b, 4c, 4d, 4e and 4g share this bench
 * deliberately: each is only meaningful beside the others, and asserting them on
 * separate devices would let a filter be right about one and wrong about the
 * rest.
 */
async function s4Shift(): Promise<void> {
  header("4b-4g — A works, B takes the handset, and only the right things move");
  const shop = await realShopAndTwoPeople();
  if (shop === null) return;
  const b = await bench("shift");
  const ids = new UuidIds();

  /*
   * REAL SELLER AND PRODUCT IDS, fetched under A's token. 4g posts a bill to the
   * real server, and the server resolves the seller UNDER RLS and stamps
   * list_price from the seller's grade — so a made-up seller_id is a 422 and a
   * grade-less seller is a 424. Placeholder ids would make 4g fail for a reason
   * that has nothing to do with ownership, which is the fixture failure
   * a-proof-fixture-must-be-a-row-the-product-could-produce.md describes.
   */
  const auth = { authorization: `Bearer ${shop.aToken}` };
  const sellersBody = (await (await fetch(`${API}/sellers`, { headers: auth })).json()) as {
    sellers: { id: string; grade: string | null }[];
  };
  const productsBody = (await (await fetch(`${API}/products`, { headers: auth })).json()) as {
    products: { id: string; prices: Record<string, string> }[];
  };
  const seller = sellersBody.sellers.find((s) => s.grade !== null);
  const product = productsBody.products[0];
  check(
    "CONTROL: the shop has a graded seller and a product to weigh — the fixture is the server's own",
    seller !== undefined && product !== undefined,
    `sellers=${String(sellersBody.sellers.length)} products=${String(productsBody.products.length)}`,
  );
  if (seller === undefined || product === undefined) {
    await teardown(b);
    return;
  }
  const realItem = (): typeof ITEM => ({ ...ITEM, id: randomUUID(), product_id: product.id });

  check(
    "CONTROL: two DIFFERENT people in the SAME shop, both server-issued",
    shop.a.user_id !== shop.b.user_id && shop.a.tenant_id === shop.b.tenant_id,
    `A=${shop.a.user_id} B=${shop.b.user_id} tenant=${shop.tenantId}`,
  );

  await b.shop.save({ tenant_id: shop.tenantId });

  /* ---- A's shift: one bill, one draft, and the shop's price list ---------- */
  await b.identity.save(shop.a);
  const aBill = await createLocalBill(
    { store: b.bills, clock, ids },
    { seller: { kind: "server", seller_id: seller.id }, vehicle_no: null, items: [realItem()], total_amount: "150.00", master_as_of: null },
    shop.a,
  );
  const aDraft: Draft = newDraft(ids.newId(), seller.id, new Date().toISOString(), null);
  await b.drafts.save(aDraft, shop.a);
  await b.master.saveProducts(
    [{ id: product.id, code: "AL", name: "อะลูมิเนียม", uom_code: "KG", uom_name: "กก.", prices: { A: "45.00" } }],
    new Date().toISOString(),
  );
  await b.master.saveSellers(
    [{ id: seller.id, code: "S1", name: "ร้านเจริญ", phone: null, grade: seller.grade }],
    new Date().toISOString(),
  );

  /* ---- the shift change -------------------------------------------------- */
  await b.identity.save(shop.b);
  const signedIn = await b.identity.load();
  check(
    "CONTROL: the device is now signed in as B",
    signedIn?.user_id === shop.b.user_id,
    JSON.stringify(signedIn),
  );

  // 4b ---------------------------------------------------------------------
  const bBill = await createLocalBill(
    { store: b.bills, clock, ids },
    { seller: { kind: "server", seller_id: seller.id }, vehicle_no: null, items: [realItem()], total_amount: "150.00", master_as_of: null },
    shop.b,
  );
  const queue = await b.bills.listPendingOldestFirst(100);
  const queued = queue.map((x) => x.id);
  const aSelected = queued.includes(aBill.id) ? 1 : 0;
  const bSelected = queued.includes(bBill.id) ? 1 : 0;
  console.log(`  4b queue as B: A's bills selected=${String(aSelected)} B's=${String(bSelected)} total=${String(queue.length)}`);
  check("4b: A's bill is NOT selected for sending", aSelected === 0, `${String(aSelected)}`);
  check("4b: B's bill IS selected", bSelected === 1, `${String(bSelected)}`);
  check(
    "4b: and the two counts DIFFER, that way round",
    aSelected === 0 && bSelected === 1,
    `A=${String(aSelected)} B=${String(bSelected)}`,
  );

  // 4c ---------------------------------------------------------------------
  const loaded = await b.drafts.load();
  const aDraftOwner = await ownerOf(b, "local_draft", aDraft.id);
  console.log(`  4c draft as B: ${loaded.draft === null ? "null" : loaded.draft.id} withheld=${String(loaded.withheld)}`);
  console.log(`  4c A's draft row still: ${JSON.stringify(aDraftOwner)}`);
  check("4c: B does NOT receive A's draft", loaded.draft === null, String(loaded.draft));
  check("4c: it is reported withheld", loaded.withheld === 1, String(loaded.withheld));
  check(
    "4c: A's draft still EXISTS with its owner unchanged",
    aDraftOwner?.owner_user_id === shop.a.user_id && aDraftOwner.owner_tenant_id === shop.tenantId,
    JSON.stringify(aDraftOwner),
  );

  // 4d — CONTROL AGAINST OVER-BLOCKING --------------------------------------
  const snap = await b.master.load();
  console.log(`  4d cache as B: products=${String(snap.products.length)} sellers=${String(snap.sellers.length)}` +
    ` notThisShop=${String(snap.productsNotThisShop)}/${String(snap.sellersNotThisShop)}`);
  check(
    "4d: the price list is STILL USABLE to B — same shop, so nothing is withheld",
    snap.products.length === 1 && snap.sellers.length === 1,
    `products=${String(snap.products.length)} sellers=${String(snap.sellers.length)}`,
  );
  check(
    "4d: and neither list is flagged as another shop's",
    !snap.productsNotThisShop && !snap.sellersNotThisShop,
  );

  /*
   * 4e — TWO NUMBERS, AND THEY MUST NOT BE ONE.
   *
   * ===========================================================================
   * NO PRODUCTION CODE PRODUCES THE PARKED COUNT. THIS PROOF COMPUTES IT.
   * ===========================================================================
   * `parkedForAnother` below is arithmetic done HERE — the unfiltered
   * `listByState` total minus the filtered `pendingQueueSnapshot` — and nothing
   * in the app performs it. There is no store method that returns it, no state
   * that holds it, and no screen that shows it. So this case establishes that
   * the two numbers CAN be told apart from what the store already offers. It
   * does NOT establish that anything tells them apart, and a later reader must
   * not cite it as coverage of the operator being able to see the difference.
   *
   * WHAT THE OPERATOR ACTUALLY SEES TODAY is the UNFILTERED total: `App.tsx`
   * feeds the status strip and the sign-out refusal from `listByState`, which
   * counts every account's bills. So a bill parked for somebody who has gone
   * home sits inside a number that reads as an ordinary backlog and will not go
   * down however long they wait.
   *
   * OWED BY P1.7 STEP 7, THE STATUS STRIP, which is the step that decides what
   * the operator is told and splits the parked-for-another-account count from
   * the ordinary unsent one. ROADMAP.md section P1.7 already argues why they
   * must be separate: "One waits for a connection and the other waits for a
   * person. A combined total makes the operator wait for the wrong thing."
   *
   * RECORDED RATHER THAN ASSUMED WORKING, and the only reason it is: the
   * prediction for this case was written and printed BEFORE the first run, and
   * it said this cell would be green without a mechanism behind it. It was. Had
   * the prediction been written afterwards, an all-green run would have read as
   * seven working mechanisms instead of six and a sum.
   */
  const allPending = await b.bills.listByState("pending");
  const mineSendable = await b.bills.pendingQueueSnapshot();
  const parkedForAnother = allPending.length - mineSendable.pendingCount;
  console.log(`  4e waiting-on-a-connection (B's own, sendable) = ${String(mineSendable.pendingCount)}`);
  console.log(`  4e parked-for-another-account                  = ${String(parkedForAnother)}`);
  check(
    "4e: the parked-for-another-account count is 1 (A's bill)",
    parkedForAnother === 1,
    String(parkedForAnother),
  );
  check(
    "4e: the waiting-on-a-connection count is 1 (B's own)",
    mineSendable.pendingCount === 1,
    String(mineSendable.pendingCount),
  );
  check(
    "4e: they are DIFFERENT numbers — a single total would read as a poor signal",
    parkedForAnother !== allPending.length,
    `parked=${String(parkedForAnother)} total=${String(allPending.length)}`,
  );

  // 4f — resumeAfterSignIn must not release A's rows -------------------------
  /*
   * ASSERTED ON `next_attempt_at`, WHICH IS THE COLUMN THIS CODE ACTUALLY
   * WRITES — and the first draft of this case got that wrong in the way the
   * brief predicted. resumeAfterSignIn calls clearBackoffForPending, whose
   * statement is `UPDATE local_bills SET next_attempt_at = ? WHERE <QUEUED>`;
   * it never touches owner_tenant_id or owner_user_id. So a cell asserting the
   * OWNER columns are unchanged is true whatever the filter does, and would have
   * been green with the WHERE clause deleted. The owner columns are the wrong
   * evidence for this claim even though they are the subject of the phase.
   *
   * Both bills are given a real backoff first, through the store's own
   * markPendingAgain — the state a bounced send produces — so the release has
   * something to release and "unchanged" is a measurement rather than a
   * coincidence of there being nothing to move.
   */
  const future = new Date(Date.now() + 25_000);
  const bounceAt = new Date();
  await b.bills.markPendingAgain(aBill.id, "bounced", 1, future, bounceAt, false);
  await b.bills.markPendingAgain(bBill.id, "bounced", 1, future, bounceAt, false);
  const aBefore = (await b.bills.getBill(aBill.id))?.next_attempt_at ?? null;
  const bBefore = (await b.bills.getBill(bBill.id))?.next_attempt_at ?? null;
  check(
    "CONTROL: both bills really are backed off into the future before the resume",
    aBefore !== null && bBefore !== null && aBefore > bounceAt.toISOString(),
    `A=${String(aBefore)} B=${String(bBefore)}`,
  );

  const engine = new SyncEngine({ ...noSellerKind(),
    store: b.bills,
    transport: new HttpTransport({
      baseUrl: API,
      getToken: () => Promise.resolve(null),
      fetchImpl: (input, init) => fetch(input, init),
    }),
    clock: systemClock,
    backoffBaseMs: 1000,
  });
  const freed = await engine.resumeAfterSignIn();
  const aAfterResume = (await b.bills.getBill(aBill.id))?.next_attempt_at ?? null;
  const bAfterResume = (await b.bills.getBill(bBill.id))?.next_attempt_at ?? null;
  console.log(`  4f resumeAfterSignIn as B freed=${String(freed)}`);
  console.log(`  4f A's next_attempt_at ${String(aBefore)} -> ${String(aAfterResume)}`);
  console.log(`  4f B's next_attempt_at ${String(bBefore)} -> ${String(bAfterResume)}`);
  check(
    "4f: A's row was NOT released — its next_attempt_at is untouched",
    aAfterResume === aBefore,
    `before=${String(aBefore)} after=${String(aAfterResume)}`,
  );
  check(
    "4f: B's OWN row WAS released — the direction that proves the release runs at all",
    bAfterResume !== null && bBefore !== null && bAfterResume < bBefore,
    `before=${String(bBefore)} after=${String(bAfterResume)}`,
  );
  check(
    "4f: exactly one row was freed",
    freed === 1,
    String(freed),
  );
  // The owner columns are checked too, but as a SEPARATE and weaker claim: they
  // must not have moved either. This cell is not evidence about the filter.
  const aOwnerAfter = await ownerOf(b, "local_bills", aBill.id);
  check(
    "4f: and A's owner columns are still A's (a weaker claim, stated as one)",
    aOwnerAfter?.owner_user_id === shop.a.user_id,
    JSON.stringify(aOwnerAfter),
  );

  // 4g — CONTROL FOR THE WHOLE PASS: A signs back in and A's bill SENDS -------
  await b.identity.save(shop.a);
  const sender = new SyncEngine({ ...noSellerKind(),
    store: b.bills,
    transport: new HttpTransport({
      baseUrl: API,
      getToken: () => Promise.resolve(shop.aToken),
      fetchImpl: (input, init) => fetch(input, init),
    }),
    clock: systemClock,
    backoffBaseMs: 1000,
  });
  await sender.resumeAfterSignIn();
  const run = await sender.runOnce();
  const aAfter = await b.bills.getBill(aBill.id);
  console.log(`  4g run: attempted=${String(run.attempted)} synced=${String(run.synced)}` +
    ` rejected=${String(run.rejected)} sessionExpired=${String(run.sessionExpired)}`);
  console.log(`  4g A's bill: state=${String(aAfter?.sync_state)} doc_no=${String(aAfter?.doc_no)}`);
  check(
    "4g: with A signed back in, A's own bill SENDS — the whole pass is not a device that sends nothing",
    aAfter?.sync_state === "synced",
    `state=${String(aAfter?.sync_state)} last_error=${String(aAfter?.last_error)}`,
  );
  check(
    "4g: and the server gave it a doc_no",
    (aAfter?.doc_no ?? "").length > 0,
    String(aAfter?.doc_no),
  );

  await teardown(b);
}

/* ------------------------------------------------------------------ main -- */

/* -------------------------------------------------------------------- 4h -- */

/**
 * THE SCREEN RENDERS ON NO USABLE SESSION, NOT ON AN ABSENT TOKEN.
 *
 * The expired case is the whole point: a token that EXISTS and has expired is
 * not null, so the old `token === null` test left the cart on screen over a
 * session the server would refuse, with no way to sign in again.
 */
function s4hRenderCondition(): void {
  header("4h — the login screen appears on every state except an active session");

  const signedOut = mustShowSignIn({ token: null, sessionEnded: false });
  const expired = mustShowSignIn({ token: "a.b.c", sessionEnded: true });
  const active = mustShowSignIn({ token: "a.b.c", sessionEnded: false });
  console.log(`  signed_out -> ${String(signedOut)}   expired -> ${String(expired)}   active -> ${String(active)}`);

  check("no token at all: the screen is shown", signedOut);
  check(
    "AN EXPIRED TOKEN: the screen is shown — the case `token === null` got wrong",
    expired,
    `token is non-null and the session is unusable`,
  );
  check(
    "CONTROL: an ACTIVE session does NOT show it — otherwise nobody can ever work",
    !active,
  );
  check(
    "the expired and active answers DIFFER, that way round",
    expired && !active,
    `expired=${String(expired)} active=${String(active)}`,
  );
}

async function main(): Promise<number> {
  console.log(`P1.7 step 6 — two real accounts in one shop   (API=${API})`);
  await s4aSetup();
  s4hRenderCondition();
  await s4Shift();
  console.log(`\n${failures === 0 ? "ALL GREEN" : `${String(failures)} FAILED`}`);
  return failures === 0 ? 0 : 1;
}

process.exitCode = await main();
