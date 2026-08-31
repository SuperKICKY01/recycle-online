/**
 * P1.7 proof: THE MASTER-DATA CACHE IS BOUND TO A TENANT, and a list that is not
 * this shop's reads as ABSENT rather than as STALE.
 *
 * Run: npm run prove:cachetenant
 *
 * WHY "ABSENT" IS THE WHOLE CLAIM. Prices are per tenant. A handset that changes
 * shops and keeps the old shop's list shows numbers that look entirely ordinary,
 * and the yard pays cash against them; the bill that follows sends successfully
 * and carries a master_as_of pointing at the old shop's fetch, so the evidence
 * agrees with itself and no later audit finds anything out of place. On a device
 * nobody can open (ARCHITECTURE.md section 11) nobody ever learns it happened.
 * The freshness strip already teaches the operator that STALE data is usable —
 * that is its job — so routing a tenant mismatch through the stale path would
 * hand them the one message that says "carry on". It must be the empty path.
 *
 * WHAT EACH CASE IS EVIDENCE ABOUT, named here because a green cell is evidence
 * about its own sentence and nothing more:
 *
 *   C1  the reader returns rows to the RIGHT tenant       (without it, C2 is
 *                                                          satisfied by a reader
 *                                                          that returns nothing
 *                                                          to anybody)
 *   C2  the reader returns NOTHING to the wrong tenant, by BOTH mechanisms
 *       asserted separately: the SQL predicate, and the stamp reading
 *   C3  the half-refresh: per list, and the refusal to start a bill
 *   C4  a NULL tenant is a mismatch, not a match
 *   C5  the two block sentences are DIFFERENT, in the right direction
 *   C6  the invariant that ties them together
 *
 * WHAT THIS DOES NOT ESTABLISH.
 *   - node:sqlite, not the handset's expo-sqlite (a different driver on a
 *     different connection, src/device/expoSqliteDriver.ts).
 *   - App.tsx is unreachable from here (tsconfig.node.json rootDir is "src").
 *     `mayStartBill` was extracted into src/ so the GATE itself is driven; that
 *     App.tsx calls it, and that refreshMaster clears the per-list flags, are
 *     one-line call sites and are the unproven links in the chain.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteIdentityStore } from "../adapters/sqlite/SqliteIdentityStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { SqliteMasterStore } from "../adapters/sqlite/SqliteMasterStore.js";
import { assessFreshness, masterNotice, mayStartBill } from "../master/freshness.js";
import type { Freshness } from "../master/freshness.js";
import type { MasterProduct, MasterSeller, MasterSnapshot } from "../master/types.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/**
 * THE `: string` ANNOTATIONS ARE LOAD-BEARING — the same trap proveOwner records.
 * Without them TypeScript narrows each to its own literal type and C0's control
 * that the two shops genuinely differ becomes TS2367, a compile error rather than
 * a measurement taken during the run. The natural repair is to delete the
 * control, which leaves every case below passing against a fixture whose two
 * shops are one value.
 */
const SHOP_A: string = "11111111-1111-4111-8111-111111111111";
const SHOP_B: string = "33333333-3333-4333-8333-333333333333";
const USER_A: string = "22222222-2222-4222-8222-222222222222";
const USER_B: string = "44444444-4444-4444-8444-444444444444";

const AT_A = "2026-08-11T02:00:00.000Z";
const AT_B = "2026-08-11T02:30:00.000Z";
/** Minutes after the writes, so nothing here is near the 12h price cutoff. */
const NOW = "2026-08-11T03:00:00.000Z";

const PRODUCTS: readonly MasterProduct[] = [
  { id: "p-1", code: "AL-CAN", name: "อะลูมิเนียมกระป๋อง", uom_code: "KG", uom_name: "กก.", prices: { A: "45.00" } },
  { id: "p-2", code: "CU-1", name: "ทองแดงเบอร์ 1", uom_code: "KG", uom_name: "กก.", prices: { A: "290.00" } },
];

const SELLERS: readonly MasterSeller[] = [
  { id: "s-1", code: "S001", name: "ร้านเจริญ", phone: null, grade: "A" },
  { id: "s-2", code: "S002", name: "ร้านสมชาย", phone: null, grade: "A" },
];

interface Bench {
  dir: string;
  d: NodeSqliteDriver;
  master: SqliteMasterStore;
  identity: SqliteIdentityStore;
}

async function bench(name: string): Promise<Bench> {
  const dir = mkdtempSync(join(tmpdir(), `recycle-cachetenant-${name}-`));
  const d = NodeSqliteDriver.open(join(dir, `${name}.db`));
  // Opening the bill store runs initConnection, which creates every table.
  await SqliteLocalStore.open(d);
  const master = await SqliteMasterStore.open(d);
  return { dir, d, master, identity: new SqliteIdentityStore(d) };
}

async function teardown(b: Bench): Promise<void> {
  await b.d.close();
  rmSync(b.dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------- instruments */

/**
 * ROWS PHYSICALLY ON DISK, with no tenant predicate anywhere.
 *
 * THIS IS THE CONTROL THE WHOLE FILE TURNS ON. "The reader returned nothing" is
 * satisfied by an empty table, by a broken writer, by a dropped table and by a
 * reader that always returns nothing — every one of which would make the cells
 * below green while proving the opposite of the claim. Counting the rows raw, in
 * the SAME run, is what separates "filtered out" from "not there".
 */
async function rawCount(b: Bench, table: string): Promise<number> {
  const rows = await b.d.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`);
  return rows[0]?.n ?? 0;
}

/** The tenant stamped on the rows, distinct values, so a mixed table is visible. */
async function rawTenants(b: Bench, table: string): Promise<string[]> {
  const rows = await b.d.all<{ t: string | null }>(
    `SELECT DISTINCT owner_tenant_id AS t FROM ${table} ORDER BY t`,
  );
  return rows.map((r) => (r.t === null ? "NULL" : r.t));
}

/**
 * The SQL half ON ITS OWN — the predicate, with no stamp reading involved.
 *
 * Kept separate from the snapshot because two mechanisms guard one observable
 * here (the WHERE clause, and readStamp clearing the timestamp), and a green on
 * the snapshot alone would be evidence about whichever of the two still worked.
 */
async function filteredCount(b: Bench, table: string, tenant: string | null): Promise<number> {
  const rows = await b.d.all<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${table} WHERE owner_tenant_id = ?`,
    [tenant],
  );
  return rows[0]?.n ?? 0;
}

async function signIn(b: Bench, tenant: string, user: string): Promise<void> {
  await b.identity.save({ tenant_id: tenant, user_id: user });
}

function freshnessOf(snap: MasterSnapshot): Freshness {
  return assessFreshness({
    productsFetchedAt: snap.productsFetchedAt,
    sellersFetchedAt: snap.sellersFetchedAt,
    productsNotThisShop: snap.productsNotThisShop,
    sellersNotThisShop: snap.sellersNotThisShop,
    now: NOW,
  });
}

function showSnap(what: string, snap: MasterSnapshot): void {
  console.log(
    `  ${what}: products=${String(snap.products.length)} sellers=${String(snap.sellers.length)}` +
      ` productsFetchedAt=${String(snap.productsFetchedAt)}` +
      ` sellersFetchedAt=${String(snap.sellersFetchedAt)}` +
      ` productsNotThisShop=${String(snap.productsNotThisShop)}` +
      ` sellersNotThisShop=${String(snap.sellersNotThisShop)}`,
  );
}

/** Every reading taken in this run, for the invariant swept at the end. */
const readings: { where: string; snap: MasterSnapshot }[] = [];

async function readAs(b: Bench, where: string): Promise<MasterSnapshot> {
  const snap = await b.master.load();
  readings.push({ where, snap });
  showSnap(where, snap);
  return snap;
}

/* -------------------------------------------------------------------- C0 -- */

function c0Controls(): void {
  header("C0 — the fixture's two shops are genuinely two");
  check(
    "CONTROL: SHOP_A and SHOP_B differ, and so do the two users",
    SHOP_A !== SHOP_B && USER_A !== USER_B,
    `A=${SHOP_A} B=${SHOP_B}`,
  );
  check(
    "CONTROL: the fixture has rows to lose — both lists are non-empty",
    PRODUCTS.length > 0 && SELLERS.length > 0,
    `products=${String(PRODUCTS.length)} sellers=${String(SELLERS.length)}`,
  );
}

/* -------------------------------------------------------------------- C1 -- */

/** 5b. Written under A, read under A: the rows come back. */
async function c1SameShopReturnsRows(): Promise<void> {
  header("C1 (5b) — cache written under shop A, identity A: the reader RETURNS the rows");
  const b = await bench("c1");
  await signIn(b, SHOP_A, USER_A);
  await b.master.saveProducts(PRODUCTS, AT_A);
  await b.master.saveSellers(SELLERS, AT_A);

  console.log(`  rows on disk: cached_products=${String(await rawCount(b, "cached_products"))}` +
    ` cached_sellers=${String(await rawCount(b, "cached_sellers"))}`);
  console.log(`  tenants stamped on cached_products: ${(await rawTenants(b, "cached_products")).join(",")}`);
  check(
    "the WRITER stamped shop A on the product rows — not null, and not something else",
    (await rawTenants(b, "cached_products")).join(",") === SHOP_A,
    (await rawTenants(b, "cached_products")).join(","),
  );
  check(
    "the WRITER stamped shop A on the seller rows",
    (await rawTenants(b, "cached_sellers")).join(",") === SHOP_A,
    (await rawTenants(b, "cached_sellers")).join(","),
  );
  check(
    "the WRITER stamped shop A on the fetch stamps in master_cache",
    (await rawTenants(b, "master_cache")).join(",") === SHOP_A,
    (await rawTenants(b, "master_cache")).join(","),
  );

  const snap = await readAs(b, "read as A (the shop that wrote it)");
  check(
    "products come back — the count matches what was written",
    snap.products.length === PRODUCTS.length,
    `${String(snap.products.length)} of ${String(PRODUCTS.length)}`,
  );
  check(
    "sellers come back — the count matches what was written",
    snap.sellers.length === SELLERS.length,
    `${String(snap.sellers.length)} of ${String(SELLERS.length)}`,
  );
  check("the product fetch stamp is REPORTED, not cleared", snap.productsFetchedAt === AT_A,
    `${String(snap.productsFetchedAt)}`);
  check("the seller fetch stamp is REPORTED, not cleared", snap.sellersFetchedAt === AT_A,
    `${String(snap.sellersFetchedAt)}`);
  check("neither list is flagged as not-this-shop",
    !snap.productsNotThisShop && !snap.sellersNotThisShop);

  const f = freshnessOf(snap);
  check(
    "a bill MAY be started — the direction that proves the gate is not simply stuck shut",
    mayStartBill(f),
    `state=${f.state}`,
  );
  await teardown(b);
}

/* -------------------------------------------------------------------- C2 -- */

/** 5a. Written under A, read under B: ABSENT, while the rows are still there. */
async function c2OtherShopReadsAbsent(): Promise<void> {
  header("C2 (5a) — cache written under shop A, identity B: the reader reports ABSENT");
  const b = await bench("c2");
  await signIn(b, SHOP_A, USER_A);
  await b.master.saveProducts(PRODUCTS, AT_A);
  await b.master.saveSellers(SELLERS, AT_A);

  // The shift change: a different shop's account signs in on this handset.
  await signIn(b, SHOP_B, USER_B);

  const productsOnDisk = await rawCount(b, "cached_products");
  const sellersOnDisk = await rawCount(b, "cached_sellers");
  console.log(`  CONTROL rows physically on disk: cached_products=${String(productsOnDisk)}` +
    ` cached_sellers=${String(sellersOnDisk)}`);
  check(
    "CONTROL: the rows ARE still in the table — this is a filter, not an empty database",
    productsOnDisk === PRODUCTS.length && sellersOnDisk === SELLERS.length,
    `products=${String(productsOnDisk)} sellers=${String(sellersOnDisk)}`,
  );

  // MECHANISM 1, alone: the SQL predicate.
  const filteredProducts = await filteredCount(b, "cached_products", SHOP_B);
  const filteredAsA = await filteredCount(b, "cached_products", SHOP_A);
  check(
    "MECHANISM 1 (the WHERE clause): 0 product rows select under B, while 2 select under A",
    filteredProducts === 0 && filteredAsA === PRODUCTS.length,
    `underB=${String(filteredProducts)} underA=${String(filteredAsA)}`,
  );

  // MECHANISM 2, alone: the stamp reading.
  const snap = await readAs(b, "read as B (a different shop)");
  check(
    "MECHANISM 2 (the stamp): the product fetch time reads NULL — never fetched, not fetched-long-ago",
    snap.productsFetchedAt === null,
    `${String(snap.productsFetchedAt)}`,
  );
  check(
    "MECHANISM 2 (the stamp): the seller fetch time reads NULL",
    snap.sellersFetchedAt === null,
    `${String(snap.sellersFetchedAt)}`,
  );
  check("no products are handed to the screen", snap.products.length === 0,
    String(snap.products.length));
  check("no sellers are handed to the screen", snap.sellers.length === 0,
    String(snap.sellers.length));
  check("both lists are flagged NOT THIS SHOP — the cause, not just the absence",
    snap.productsNotThisShop && snap.sellersNotThisShop);

  const f = freshnessOf(snap);
  check("the freshness state is EMPTY (absent), and NOT stale", f.state === "empty", `state=${f.state}`);
  check("a bill may NOT be started", !mayStartBill(f), `state=${f.state}`);

  const notice = masterNotice(f);
  console.log(`  notice: ${notice === null ? "(none)" : `${notice.tone} — ${notice.message}`}`);
  check("the operator is BLOCKED, not merely warned", notice?.tone === "block", String(notice?.tone));
  await teardown(b);
}

/* -------------------------------------------------------------------- C3 -- */

/**
 * 5c. THE HALF-REFRESH, measured as reachable at 1b94a0c: refreshMaster wraps
 * each list in its own try/catch and each save clears only its own table, so one
 * failed request after a shop change leaves the NEW shop's products beside the
 * OLD shop's sellers, each under its own honest timestamp.
 */
async function c3HalfRefresh(): Promise<void> {
  header("C3 (5c) — half refresh: products under the new shop, sellers still the old one's");
  const b = await bench("c3");
  await signIn(b, SHOP_A, USER_A);
  await b.master.saveProducts(PRODUCTS, AT_A);
  await b.master.saveSellers(SELLERS, AT_A);

  await signIn(b, SHOP_B, USER_B);
  // The products request answered; the sellers request did not. saveSellers is
  // therefore never called — which is exactly what refreshMaster's inner catch
  // does, and why the old shop's seller rows survive.
  await b.master.saveProducts(PRODUCTS, AT_B);

  const productTenants = await rawTenants(b, "cached_products");
  const sellerTenants = await rawTenants(b, "cached_sellers");
  console.log(`  on disk: cached_products tenants=[${productTenants.join(",")}]` +
    ` cached_sellers tenants=[${sellerTenants.join(",")}]`);
  check(
    "CONTROL: the table really is mixed — products now B, sellers still A",
    productTenants.join(",") === SHOP_B && sellerTenants.join(",") === SHOP_A,
    `products=[${productTenants.join(",")}] sellers=[${sellerTenants.join(",")}]`,
  );
  check(
    "CONTROL: the old shop's seller rows are still physically present",
    (await rawCount(b, "cached_sellers")) === SELLERS.length,
    String(await rawCount(b, "cached_sellers")),
  );

  const snap = await readAs(b, "read as B after the half refresh");

  // PER LIST, and the two answers must be OPPOSITE. Asserting only that they
  // differ would be satisfied by getting both of them the wrong way round.
  check(
    "THE REFRESHED LIST: products are returned, with their new stamp",
    snap.products.length === PRODUCTS.length && snap.productsFetchedAt === AT_B,
    `count=${String(snap.products.length)} at=${String(snap.productsFetchedAt)}`,
  );
  check(
    "THE REFRESHED LIST: products are NOT flagged not-this-shop",
    !snap.productsNotThisShop,
  );
  check(
    "THE STALE-SHOP LIST: sellers are ABSENT — no rows, no stamp",
    snap.sellers.length === 0 && snap.sellersFetchedAt === null,
    `count=${String(snap.sellers.length)} at=${String(snap.sellersFetchedAt)}`,
  );
  check(
    "THE STALE-SHOP LIST: sellers ARE flagged not-this-shop",
    snap.sellersNotThisShop,
  );
  check(
    "the two lists genuinely DISAGREE, in the right direction: products present, sellers absent",
    snap.productsFetchedAt !== null && snap.sellersFetchedAt === null,
    `products=${String(snap.productsFetchedAt)} sellers=${String(snap.sellersFetchedAt)}`,
  );

  const f = freshnessOf(snap);
  check("one absent list is enough: the state is EMPTY", f.state === "empty", `state=${f.state}`);
  check("WEIGHING IS REFUSED", !mayStartBill(f), `mayStartBill=${String(mayStartBill(f))}`);

  const notice = masterNotice(f);
  const msg = notice?.message ?? "";
  console.log(`  notice: ${notice === null ? "(none)" : `${notice.tone} — ${notice.message}`}`);
  check("the refusal is a BLOCK", notice?.tone === "block", String(notice?.tone));
  check(
    "the message NAMES the list that is missing — the seller list",
    msg.includes("รายชื่อผู้ขาย"),
    msg,
  );
  check(
    "the message does NOT name the product list, which arrived fine",
    !msg.includes("รายการสินค้า"),
    msg,
  );
  check(
    "the message says it can be RETRIED",
    msg.includes("ลองอีกครั้ง"),
    msg,
  );
  check(
    "the message points at the CONNECTION as the remedy",
    msg.includes("ต่อเน็ต"),
    msg,
  );
  await teardown(b);
}

/* -------------------------------------------------------------------- C4 -- */

/** 5d. A null tenant is a MISMATCH — the case `null === null` would get backwards. */
async function c4NullTenantIsAbsent(): Promise<void> {
  header("C4 (5d) — rows written with NO identity carry a null tenant and read as ABSENT");
  const b = await bench("c4");
  // No sign-in at all: this is a device that cached master data before anyone
  // signed in, and an upgraded handset whose rows predate the column.
  await b.master.saveProducts(PRODUCTS, AT_A);
  await b.master.saveSellers(SELLERS, AT_A);

  const tenants = await rawTenants(b, "cached_products");
  console.log(`  tenants stamped with no identity: [${tenants.join(",")}]`);
  check(
    "the writer wrote NULL rather than inventing a shop",
    tenants.join(",") === "NULL",
    tenants.join(","),
  );
  check(
    "CONTROL: the rows ARE present — null-tenant, not absent",
    (await rawCount(b, "cached_products")) === PRODUCTS.length &&
      (await rawCount(b, "cached_sellers")) === SELLERS.length,
    `products=${String(await rawCount(b, "cached_products"))}` +
      ` sellers=${String(await rawCount(b, "cached_sellers"))}`,
  );

  // Somebody now signs in. The null rows must NOT become theirs.
  await signIn(b, SHOP_A, USER_A);
  const snap = await readAs(b, "read as A over null-tenant rows");
  check("the product stamp reads NULL — absent", snap.productsFetchedAt === null,
    String(snap.productsFetchedAt));
  check("the seller stamp reads NULL — absent", snap.sellersFetchedAt === null,
    String(snap.sellersFetchedAt));
  check("no rows are handed to the screen",
    snap.products.length === 0 && snap.sellers.length === 0,
    `products=${String(snap.products.length)} sellers=${String(snap.sellers.length)}`);
  check("both are flagged not-this-shop", snap.productsNotThisShop && snap.sellersNotThisShop);
  check("a bill may NOT be started", !mayStartBill(freshnessOf(snap)));

  // THE OTHER HALF OF THE NULL RULE, and the one a `null === null` reader passes:
  // with NO identity stored either, the null rows must STILL not match.
  await b.identity.clear();
  const snapNoOne = await readAs(b, "read with NO identity at all, over null-tenant rows");
  check(
    "null rows do not match a null identity — two unknowns are not the same shop",
    snapNoOne.productsFetchedAt === null && snapNoOne.products.length === 0,
    `at=${String(snapNoOne.productsFetchedAt)} count=${String(snapNoOne.products.length)}`,
  );
  check(
    "CONTROL: the rows are STILL on disk for that reading too",
    (await rawCount(b, "cached_products")) === PRODUCTS.length,
    String(await rawCount(b, "cached_products")),
  );
  await teardown(b);
}

/* -------------------------------------------------------------------- C5 -- */

/**
 * THE TWO BLOCK SENTENCES, IN ONE RUN, ASSERTED AS A PAIR.
 *
 * A never-fetched device and a wrong-shop device are both stopped, so the STOP
 * cannot tell them apart — only the sentence can, and the sentence is the thing
 * the operator acts on at five in the morning. Asserting each in isolation would
 * be satisfied by one message used for both.
 */
async function c5MessagesAreDistinct(): Promise<void> {
  header("C5 — the never-fetched sentence and the not-this-shop sentence are DIFFERENT");

  const neverFetched = masterNotice(
    assessFreshness({
      productsFetchedAt: null,
      sellersFetchedAt: null,
      productsNotThisShop: false,
      sellersNotThisShop: false,
      now: NOW,
    }),
  );
  const notThisShop = masterNotice(
    assessFreshness({
      productsFetchedAt: null,
      sellersFetchedAt: null,
      productsNotThisShop: true,
      sellersNotThisShop: true,
      now: NOW,
    }),
  );
  console.log(`  never fetched : ${String(neverFetched?.message)}`);
  console.log(`  not this shop : ${String(notThisShop?.message)}`);

  check("both are blocks", neverFetched?.tone === "block" && notThisShop?.tone === "block");
  check(
    "the two messages are not the same sentence",
    neverFetched?.message !== notThisShop?.message,
  );
  // DIRECTION, not difference. Which way round they differ is the whole point:
  // the sign-in instruction must sit on the never-fetched one and nowhere else,
  // because the other device is already signed in and would wait for a person
  // who is standing right there.
  check(
    "the NEVER-FETCHED message tells them to sign in",
    neverFetched?.message.includes("เข้าสู่ระบบ") === true,
    String(neverFetched?.message),
  );
  check(
    "the NOT-THIS-SHOP message does NOT tell them to sign in",
    notThisShop?.message.includes("เข้าสู่ระบบ") === false,
    String(notThisShop?.message),
  );
  check(
    "the NOT-THIS-SHOP message offers a retry",
    notThisShop?.message.includes("ลองอีกครั้ง") === true,
    String(notThisShop?.message),
  );
  check(
    "and it does not claim the data belongs to a named other shop — only that it is not this one",
    notThisShop?.message.includes("ไม่ใช่ของร้านนี้") === true,
    String(notThisShop?.message),
  );
  // THERE IS NO IDENTITY-BASED WEIGHING BLOCK AT 1b94a0c. Nothing in this app
  // refuses to start a bill for want of a signed-in person — an absent identity
  // parks ROWS. When one is written, this cell is where the collision surfaces:
  // it must keep "sign in" off the connection message.
  check(
    "neither block message mentions a retry AND a sign-in together, which would fuse the two remedies",
    !(
      (neverFetched?.message.includes("ลองอีกครั้ง") ?? false) &&
      (neverFetched?.message.includes("เข้าสู่ระบบ") ?? false)
    ),
    String(neverFetched?.message),
  );
}

/* -------------------------------------------------------------------- C6 -- */

/** The invariant every case above depends on, swept over every reading taken. */
function c6Invariant(): void {
  header("C6 — invariant: 'not this shop' never appears beside a usable fetch stamp");
  /*
   * THE COUNT IS THE CONTROL. A sweep over an empty list reports zero violations
   * and is indistinguishable from a sweep that found none — the oldest failure
   * shape in this repository, and this cell exists only to tell those apart.
   *
   * FIVE, derived rather than remembered: C1 reads once, C2 once, C3 once and C4
   * twice (signed in, then with the identity cleared). C5 takes none — it builds
   * its inputs directly rather than through the store. Written as an equality so
   * that ADDING a reading and forgetting this line is a red cell, not a silently
   * weaker check; the first draft said `>= 6` and went red here, which is the
   * only reason the number above is measured instead of assumed.
   */
  check(
    "CONTROL: every expected reading was collected — an empty or short sweep passes vacuously",
    readings.length === 5,
    `${String(readings.length)} readings: ${readings.map((r) => r.where).join(" | ")}`,
  );
  let violations = 0;
  for (const r of readings) {
    const bad =
      (r.snap.productsNotThisShop && r.snap.productsFetchedAt !== null) ||
      (r.snap.sellersNotThisShop && r.snap.sellersFetchedAt !== null);
    if (bad) {
      violations += 1;
      console.log(`  VIOLATION at "${r.where}"`);
    }
  }
  check("no reading carried both", violations === 0, `${String(violations)} violations`);
}

/* ------------------------------------------------------------------ main -- */

async function main(): Promise<number> {
  console.log("P1.7 — the master-data cache is bound to a tenant; a mismatch is ABSENT");
  c0Controls();
  await c1SameShopReturnsRows();
  await c2OtherShopReadsAbsent();
  await c3HalfRefresh();
  await c4NullTenantIsAbsent();
  await c5MessagesAreDistinct();
  c6Invariant();
  console.log(`\n${failures === 0 ? "ALL GREEN" : `${String(failures)} FAILED`}`);
  return failures === 0 ? 0 : 1;
}

// Preset RED, per lessons/a-default-exit-code-is-a-default-verdict.md: a run
// that ends before main()'s tally completes exits non-zero, not a default 0.
process.exitCode = 1;

process.exitCode = await main();
