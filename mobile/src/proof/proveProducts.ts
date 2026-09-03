/**
 * P1.15 proof — product master data on the phone (products, categories, units).
 *
 * Run: npm run prove:products              (requires the API running at RECYCLE_API_BASE)
 *      npm run prove:products -- --offline (skips the live round; exits 2, never 0)
 *
 * WHAT IS HEADLESS AND WHAT NEEDS THE SERVER — stated so a green without a server is
 * read for what it is (the owner's requirement, following prove:users):
 *
 *   HEADLESS (H1..H7, always run): the pure builders in src/products/productsAdmin.ts
 *   — the admin-only entry gate, the grouped-by-category list model, the device-side
 *   SEARCH and FILTER over a 224-product fixture (name, code, category, active,
 *   inactive, and the NO-MATCH empty state — each its own cell), the two calm empty
 *   states, every refusal asserted NEGATIVELY over its render with a presence sibling,
 *   the validation, and the category/unit management model. These prove the client
 *   agrees WITH ITSELF, and one of them TIMES the pure search/filter (device render is
 *   unobserved — see H3t).
 *
 *   LIVE (R1..R5, need the server): a real HTTP round through the app's own request
 *   SHAPE against a fresh uvicorn — create a category, unit and product; prove a
 *   DUPLICATE code is a 409 on products AND categories AND units (an assertion the
 *   server proofs never made — prove_master_write.py:481 asserts duplicate_code for
 *   SELLERS only, so this closes an unproven uniqueness refusal); edit; deactivate and
 *   prove the retired product STILL READS ON A BILL that references it (the invariant
 *   this phase must not break); reactivate. app/api.ts cannot be imported here (it
 *   reaches expo-constants through ./config), so the transport shape is reconstructed,
 *   exactly as prove:users and prove:forbidden do.
 *
 * ON THE OUTPUT. Mostly Thai; mojibake in the console is the console (cp874,
 * lessons/console-is-not-the-observation.md). Every assertion compares JS strings.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  checkNewEntity,
  checkNewProduct,
  checkRenameEntity,
  entityListModel,
  productListModel,
  productsScreenState,
  productWriteOutcome,
  PRODUCT_CODE_MAX_LENGTH,
  PRODUCT_NAME_MAX_LENGTH,
  type AdminEntity,
  type AdminProduct,
  type ProductFetch,
  type ProductFilter,
  type ProductsMessage,
} from "../products/productsAdmin.js";
import { mayManageProducts } from "../session/deviceRole.js";
import { withClientVersion } from "../net/clientVersion.js";

let failures = 0;
let passes = 0;

function check(name: string, cond: boolean, detail = ""): void {
  console.log(`  [${cond ? "OK  " : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
  if (cond) passes += 1;
  else failures += 1;
}
function header(t: string): void {
  console.log("\n=== " + t + " ===");
}

/**
 * NO SERVER DIAGNOSTIC MAY REACH THE SCREEN. A rendered refusal must carry no JSON,
 * no `kind`/`code`/`detail`, no status number, no server code, no id. Checked over
 * the whole rendered string, in draw order.
 */
const BANNED: readonly string[] = [
  "{", "}", '"', "[", "]", "detail", "kind", "code", "http", "HTTP", "_unset",
  "400", "401", "403", "404", "409", "422", "500", "duplicate_code",
  "category_inactive", "uom_inactive", "product_inactive", "admin_required",
  "undefined", "null",
];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i;

function leaks(s: string): string | null {
  for (const b of BANNED) if (s.includes(b)) return b;
  if (UUID.test(s)) return "a uuid";
  return null;
}
function messageText(m: ProductsMessage): string {
  return [m.badge, ...m.lines, m.action?.label ?? ""].join(" ");
}
const okBody = (b: unknown): ProductFetch => ({ kind: "ok", body: b });

/* ==========================================================================
 * THE 224-PRODUCT FIXTURE — 8 active categories × (25 active + 3 retired), so
 * every count a cell asserts is recomputed from these arrays, never hardcoded.
 * ========================================================================== */
const CAT_COUNT = 8;
const ACTIVE_PER_CAT = 25;
const INACTIVE_PER_CAT = 3;

function makeCategories(): AdminEntity[] {
  const cats: AdminEntity[] = [];
  for (let i = 0; i < CAT_COUNT; i += 1) {
    cats.push({ id: `cat-${String(i)}`, code: `C${String(i).padStart(2, "0")}`, name: `หมวด ${String(i)}`, is_active: true });
  }
  // One retired category, to prove a product can still be grouped under it.
  cats.push({ id: "cat-off", code: "COFF", name: "หมวดปิด", is_active: false });
  return cats;
}
const UNITS: AdminEntity[] = [
  { id: "uom-kg", code: "KG", name: "กิโลกรัม", is_active: true },
  { id: "uom-pc", code: "PC", name: "ชิ้น", is_active: true },
  { id: "uom-off", code: "OLD", name: "หน่วยเก่า", is_active: false },
];

// One distinctive product to search by name and by code, planted at a known place.
const NEEDLE_NAME = "ทองแดงเบอร์หนึ่งพิเศษ";
const NEEDLE_CODE = "CU-SPECIAL-137";

function makeProducts(): AdminProduct[] {
  const out: AdminProduct[] = [];
  let n = 0;
  for (let c = 0; c < CAT_COUNT; c += 1) {
    for (let k = 0; k < ACTIVE_PER_CAT; k += 1) {
      out.push(product(n, `cat-${String(c)}`, true));
      n += 1;
    }
    for (let k = 0; k < INACTIVE_PER_CAT; k += 1) {
      out.push(product(n, `cat-${String(c)}`, false));
      n += 1;
    }
  }
  // Plant the needle in an active product in cat-3, and price half the products so
  // the unpriced sentence and the priced count both appear.
  const needle = out.find((p) => p.is_active && p.category_id === "cat-3");
  if (needle !== undefined) {
    needle.name = NEEDLE_NAME;
    needle.code = NEEDLE_CODE;
  }
  return out;
}
function product(n: number, categoryId: string, active: boolean): AdminProduct {
  const priced = n % 2 === 0;
  return {
    id: `prod-${String(n)}`,
    code: `PRD-${String(n).padStart(4, "0")}`,
    name: `สินค้า ${String(n)}`,
    category_id: categoryId,
    uom_id: n % 2 === 0 ? "uom-kg" : "uom-pc",
    uom_code: n % 2 === 0 ? "KG" : "PC",
    uom_name: n % 2 === 0 ? "กิโลกรัม" : "ชิ้น",
    is_active: active,
    prices: priced ? { A: "10.00", B: "9.50" } : {},
  };
}

const CATEGORIES = makeCategories();
const PRODUCTS = makeProducts();
const filterOf = (over: Partial<ProductFilter>): ProductFilter => ({
  query: "",
  categoryId: null,
  activity: "all",
  ...over,
});
const flatRows = (sections: ReturnType<typeof productListModel>["sections"]) =>
  sections.flatMap((s) => s.rows);

// ---------------------------------------------------------------------------
// H1 — the admin-only entry gate (staff sees nothing; admin/null are the siblings)
// ---------------------------------------------------------------------------
function h1EntryGate(): void {
  header("H1 the จัดการสินค้า entry is admin-only (staff sees nothing)");
  check("a definite STAFF role is NOT offered the entry", mayManageProducts("staff") === false,
    "mayManageProducts('staff') === false");
  check("PRESENCE SIBLING: an ADMIN role IS offered it — the absence above is a gate, not a broken function",
    mayManageProducts("admin") === true, "mayManageProducts('admin') === true");
  check("an unknown role (null) fails OPEN and is offered it too", mayManageProducts(null) === true,
    "the server's require_admin is the authority");
}

// ---------------------------------------------------------------------------
// H2 — the grouped list model: by category, active first, then retired, apart
// ---------------------------------------------------------------------------
function h2Grouped(): void {
  header("H2 the grouped model — by category, active first, retired apart, price shown");
  const m = productListModel(PRODUCTS, CATEGORIES, filterOf({}));
  check("every product is accounted for (matched == total with no filter)",
    m.matched === PRODUCTS.length && m.total === PRODUCTS.length, `matched=${String(m.matched)} total=${String(m.total)}`);

  const activeSections = m.sections.filter((s) => !s.inactive);
  const inactiveSections = m.sections.filter((s) => s.inactive);
  check("the active products are grouped under their category names (muted headings)",
    activeSections.length === CAT_COUNT && activeSections.every((s) => s.title.startsWith("หมวด")),
    `${String(activeSections.length)} active category sections`);
  check("the retired products are in ONE group, drawn last and apart — visible, not hidden",
    inactiveSections.length === 1 && m.sections[m.sections.length - 1]?.inactive === true,
    m.sections[m.sections.length - 1]?.title ?? "?");
  check("that retired group holds every retired product",
    (inactiveSections[0]?.rows.length ?? 0) === CAT_COUNT * INACTIVE_PER_CAT,
    `retired=${String(inactiveSections[0]?.rows.length ?? 0)}`);

  // Price shown per the prices surface's vocabulary: unpriced says so, priced counts.
  const rows = flatRows(m.sections);
  const unpriced = rows.find((r) => r.priceLine === "ยังไม่ได้ตั้งราคา");
  const priced = rows.find((r) => /ราคา$/.test(r.priceLine) && r.priceLine !== "ยังไม่ได้ตั้งราคา");
  check("an unpriced product shows `ยังไม่ได้ตั้งราคา` (the prices surface's own word), never a dash or zero",
    unpriced !== undefined, unpriced?.priceLine ?? "none");
  check("a priced product shows its tier count", priced?.priceLine === "2 ราคา", priced?.priceLine ?? "none");
  check("each row carries its code and unit for the code · unit line",
    rows.every((r) => r.code.length > 0 && r.unitLabel.length > 0));
}

// ---------------------------------------------------------------------------
// H3 — SEARCH AND FILTER over 224 products, each dimension its own cell
// ---------------------------------------------------------------------------
function matchedCodes(f: ProductFilter): string[] {
  return flatRows(productListModel(PRODUCTS, CATEGORIES, f).sections).map((r) => r.code);
}
function h3SearchFilter(): void {
  header("H3 search and filter over 224 products (name, code, category, active, inactive, no-match)");

  // NAME match — the distinctive planted name finds exactly its product.
  const byName = matchedCodes(filterOf({ query: "ทองแดงเบอร์หนึ่ง" }));
  check("SEARCH BY NAME finds exactly the one product with that name", byName.length === 1 && byName[0] === NEEDLE_CODE,
    `matched ${String(byName.length)}: ${byName.join(",")}`);

  // CODE match — searching the code finds it (case-insensitive).
  const byCode = matchedCodes(filterOf({ query: "cu-special-137" }));
  check("SEARCH BY CODE (case-insensitive) finds exactly that product", byCode.length === 1 && byCode[0] === NEEDLE_CODE,
    `matched ${String(byCode.length)}`);

  // CATEGORY filter — every matched product is in the chosen category, and the count
  // is recomputed from the fixture (not hardcoded), so a wrong filter reddens this.
  const cat3All = productListModel(PRODUCTS, CATEGORIES, filterOf({ categoryId: "cat-3" }));
  const cat3Rows = flatRows(cat3All.sections);
  const expectCat3 = PRODUCTS.filter((p) => p.category_id === "cat-3").length;
  check("FILTER BY CATEGORY keeps only that category, and the count matches the fixture",
    cat3Rows.length === expectCat3 && cat3All.sections.filter((s) => !s.inactive).every((s) => s.key === "cat-3"),
    `matched=${String(cat3Rows.length)} expected=${String(expectCat3)}`);

  // ACTIVE filter — no retired product survives it.
  const activeOnly = productListModel(PRODUCTS, CATEGORIES, filterOf({ activity: "active" }));
  const expectActive = PRODUCTS.filter((p) => p.is_active).length;
  check("FILTER BY ACTIVE drops every retired product",
    activeOnly.matched === expectActive && activeOnly.sections.every((s) => !s.inactive),
    `matched=${String(activeOnly.matched)} expected=${String(expectActive)}`);

  // INACTIVE filter — only retired products, in the one retired group.
  const inactiveOnly = productListModel(PRODUCTS, CATEGORIES, filterOf({ activity: "inactive" }));
  const expectInactive = PRODUCTS.filter((p) => !p.is_active).length;
  check("FILTER BY INACTIVE keeps only retired products, in one group",
    inactiveOnly.matched === expectInactive && inactiveOnly.sections.length === 1 && inactiveOnly.sections[0]?.inactive === true,
    `matched=${String(inactiveOnly.matched)} expected=${String(expectInactive)}`);

  // NO MATCH — a real search that finds nothing is a CELL, not an afterthought.
  const none = productListModel(PRODUCTS, CATEGORIES, filterOf({ query: "ไม่มีสินค้าชื่อนี้แน่นอน" }));
  check("NO MATCH: matched is 0 and it is the no_match empty (there ARE products)",
    none.matched === 0 && none.empty?.kind === "no_match" && none.sections.length === 0,
    `empty=${none.empty?.kind ?? "none"}`);
  check("NO MATCH: the empty sentence names the search and leaks nothing",
    none.emptyLine !== null && none.emptyLine.includes("ไม่พบ") && leaks(none.emptyLine ?? "") === null,
    none.emptyLine ?? "none");

  // A filter that matches nothing (no query) has its OWN calm sentence.
  const filterNone = productListModel(PRODUCTS, CATEGORIES, filterOf({ categoryId: "cat-off", activity: "active" }));
  check("a FILTER with no query and no match has the calm filter sentence (not the query one)",
    filterNone.matched === 0 && filterNone.emptyLine === "ไม่พบสินค้าที่ตรงกับตัวกรองที่เลือก",
    filterNone.emptyLine ?? "none");
}

// H3t — TIMING the pure search/filter over the fixture. The pure function only;
// the on-device render over hundreds of rows is UNOBSERVED here (the handset pass
// owns that, and this screen uses a virtualized SectionList precisely for it).
function h3Timing(): void {
  header("H3t the pure search+filter is fast over 224 products (device render UNOBSERVED)");
  const ITER = 2000;
  const start = process.hrtime.bigint();
  let sink = 0;
  for (let i = 0; i < ITER; i += 1) {
    const q = i % 2 === 0 ? "ทองแดง" : "PRD-1";
    const m = productListModel(PRODUCTS, CATEGORIES, filterOf({ query: q, activity: i % 3 === 0 ? "active" : "all" }));
    sink += m.matched;
  }
  const ns = Number(process.hrtime.bigint() - start);
  const perCallUs = ns / ITER / 1000;
  console.log(`  ${String(ITER)} search+filter passes over ${String(PRODUCTS.length)} products: ` +
    `${(ns / 1e6).toFixed(1)} ms total, ${perCallUs.toFixed(1)} µs/call (sink=${String(sink)})`);
  console.log("  This is the PURE function. The React/SectionList render on a real handset is UNOBSERVED —");
  console.log("  named as a device gap; the list is virtualized so an unfiltered view need not mount every row.");
  // A soft bound, so a future O(n^2) regression that made this milliseconds reddens.
  check("a search+filter pass is well under a millisecond (no accidental quadratic)", perCallUs < 500,
    `${perCallUs.toFixed(1)} µs/call`);
}

// ---------------------------------------------------------------------------
// H4 — the two empty states, each its own calm sentence
// ---------------------------------------------------------------------------
function h4Empty(): void {
  header("H4 the empty states: a shop with no products vs a search that found nothing");
  const noProducts = productListModel([], CATEGORIES, filterOf({}));
  check("no products at all: the no_products empty, its own sentence, leaking nothing",
    noProducts.matched === 0 && noProducts.empty?.kind === "no_products" &&
      (noProducts.emptyLine ?? "").includes("ยังไม่มีสินค้า") && leaks(noProducts.emptyLine ?? "") === null,
    noProducts.emptyLine ?? "none");
  const noMatch = productListModel(PRODUCTS, CATEGORIES, filterOf({ query: "zzz" }));
  check("PRESENCE SIBLING: with products present the SAME zero is no_match, a different sentence",
    noMatch.empty?.kind === "no_match" && noMatch.emptyLine !== noProducts.emptyLine,
    `${noMatch.empty?.kind ?? "?"} vs ${noProducts.empty?.kind ?? "?"}`);
}

// ---------------------------------------------------------------------------
// H5 — validation and every refusal, worded from the cause, leaking nothing
// ---------------------------------------------------------------------------
function refused(fetch: ProductFetch): string {
  const o = productWriteOutcome(fetch);
  return o.kind === "refused" ? o.message : `<${o.kind}>`;
}
function h5Validation(): void {
  header("H5 validation refuses at the keypad, and refusals leak nothing with a presence sibling");

  // Validation — the edge that stops a 422 being rendered raw.
  const dup = checkNewProduct({ code: "PRD-0000", name: "ซ้ำ", categoryId: "cat-0", uomId: "uom-kg", existing: PRODUCTS });
  check("a duplicate product code is refused at the edge, on the code field",
    dup.ok === false && dup.field === "code" && dup.message.includes("มีสินค้ารหัส"), dup.ok ? "accepted" : dup.message);
  const longName = checkNewProduct({ code: "NEW-1", name: "x".repeat(PRODUCT_NAME_MAX_LENGTH + 1), categoryId: "cat-0", uomId: "uom-kg", existing: [] });
  check("an over-length name is refused (mirrors the server bound)", longName.ok === false && longName.field === "name");
  const longCode = checkNewProduct({ code: "x".repeat(PRODUCT_CODE_MAX_LENGTH + 1), name: "ดี", categoryId: "cat-0", uomId: "uom-kg", existing: [] });
  check("an over-length code is refused (mirrors the server bound)", longCode.ok === false && longCode.field === "code");
  const noCat = checkNewProduct({ code: "NEW-2", name: "ดี", categoryId: null, uomId: "uom-kg", existing: [] });
  check("a product with no category chosen is refused", noCat.ok === false && noCat.field === "category");
  const good = checkNewProduct({ code: "  new-3  ", name: "  เหล็กเส้น  ", categoryId: "cat-0", uomId: "uom-kg", existing: [] });
  check("a valid product trims its code and name and carries the four fields",
    good.ok === true && good.ok && good.body.code === "new-3" && good.body.name === "เหล็กเส้น");
  const dupCat = checkNewEntity({ code: "C00", name: "ซ้ำ", kind: "category", existing: CATEGORIES });
  check("a duplicate CATEGORY code is refused at the edge", dupCat.ok === false && dupCat.field === "code");
  const rename = checkRenameEntity("  ชื่อใหม่  ", "unit");
  check("a rename trims and accepts a non-empty name", rename.ok === true && rename.ok && rename.name === "ชื่อใหม่");
  const emptyRename = checkRenameEntity("   ", "category");
  check("a rename refuses an empty name", emptyRename.ok === false);

  // Refusals — worded from status/code, over the whole sentence, with a sibling.
  const dupWrite = refused({ kind: "http", status: 409, body: { detail: { code: "duplicate_code", conflicting_code: "PRD-0000" } } });
  check("409 duplicate_code: no diagnostic leaks and no echoed code", leaks(dupWrite) === null && !dupWrite.includes("PRD-0000"), dupWrite);
  check("409 duplicate_code: PRESENCE SIBLING — it says the code is taken (duplicate code says so)",
    dupWrite.includes("ถูกใช้ไปแล้ว"), dupWrite);
  const forbidden = refused({ kind: "http", status: 403, body: { detail: { code: "admin_required" } } });
  check("403: no diagnostic leaks", leaks(forbidden) === null, forbidden);
  check("403: PRESENCE SIBLING — it names the shop owner, not a status", forbidden.includes("เจ้าของร้าน"), forbidden);
  const invalid = refused({ kind: "http", status: 422, body: { detail: [{ msg: "raw pydantic" }] } });
  check("422: PRESENCE SIBLING and no raw body", invalid.includes("ตรวจสอบ") && leaks(invalid) === null, invalid);
  const offline = refused({ kind: "unreachable" });
  check("offline: PRESENCE SIBLING and no leak", offline.includes("ลองอีกครั้ง") && leaks(offline) === null, offline);
  check("401 is the session, not a list refusal", productWriteOutcome({ kind: "http", status: 401, body: null }).kind === "session");
  check("no token is the session too", productWriteOutcome({ kind: "no_token" }).kind === "session");

  // The READ-failure MESSAGES leak nothing over the whole card, each a real screen.
  header("H5b the read-failure MESSAGES leak nothing over the whole card");
  const cases: readonly [string, ProductFetch, ProductFetch, ProductFetch, string][] = [
    ["offline", { kind: "unreachable" }, okBody({ product_categories: [] }), okBody({ uoms: [] }), "ลองอีกครั้ง"],
    ["session", { kind: "http", status: 401, body: null }, okBody({ product_categories: [] }), okBody({ uoms: [] }), "เข้าสู่ระบบ"],
    ["forbidden", { kind: "http", status: 403, body: { detail: { code: "admin_required" } } }, okBody({ product_categories: [] }), okBody({ uoms: [] }), "เจ้าของร้าน"],
    ["server", { kind: "http", status: 500, body: null }, okBody({ product_categories: [] }), okBody({ uoms: [] }), "ลองอีกครั้ง"],
    ["unreadable-200", okBody({}), okBody({ product_categories: [] }), okBody({ uoms: [] }), "ลองอีกครั้ง"],
  ];
  for (const [name, pf, cf, uf, sibling] of cases) {
    const st = productsScreenState(pf, cf, uf, "admin");
    if (st.kind !== "message") {
      check(`${name}: is a message screen`, false);
      continue;
    }
    const whole = messageText(st.message);
    check(`${name}: no diagnostic over the whole card, and the presence sibling is there`,
      leaks(whole) === null && whole.includes(sibling), whole);
  }
  // The offline message says WHY it is online-only (the retired rows the cache lacks).
  const offlineState = productsScreenState({ kind: "unreachable" }, { kind: "unreachable" }, { kind: "unreachable" }, "admin");
  check("the offline message explains it needs the network (retired rows the cache excludes)",
    offlineState.kind === "message" && offlineState.message.lines.join(" ").includes("ปิดใช้งาน"));

  // All three reads must land: a good products read with a failed categories read is
  // still a MESSAGE, never a half screen.
  const partial = productsScreenState(okBody({ products: [] }), { kind: "unreachable" }, okBody({ uoms: [] }), "admin");
  check("a partial read (categories offline) is a MESSAGE, never a half screen", partial.kind === "message");
}

// ---------------------------------------------------------------------------
// H6 — the category / unit management model, and the screens leak nothing
// ---------------------------------------------------------------------------
function h6Entities(): void {
  header("H6 the category/unit model, and the screens carry no console diagnostic");
  const m = entityListModel(CATEGORIES, "admin");
  check("active categories are one group, the retired one apart",
    m.activeRows.length === CAT_COUNT && m.inactiveRows.length === 1);
  check("an active category may be deactivated; a retired one may be reactivated (not deactivated)",
    m.activeRows.every((r) => r.mayDeactivate && !r.mayReactivate) &&
      m.inactiveRows.every((r) => r.mayReactivate && !r.mayDeactivate));
  const staffModel = entityListModel(CATEGORIES, "staff");
  check("PRESENCE SIBLING: a staff model offers no management (editable false) — the gate, not a dead model",
    staffModel.editable === false && staffModel.activeRows.every((r) => !r.mayDeactivate));
  const um = entityListModel(UNITS, "admin");
  check("the unit model separates active and retired the same way", um.activeRows.length === 2 && um.inactiveRows.length === 1);

  const screenSrc = readFileSync(join(process.cwd(), "app", "ProductsScreen.tsx"), "utf8");
  const sheetSrc = readFileSync(join(process.cwd(), "app", "ProductActionsSheet.tsx"), "utf8");
  check("ProductsScreen logs NOTHING (no console.*)", !screenSrc.includes("console."));
  check("ProductActionsSheet logs NOTHING (no console.*)", !sheetSrc.includes("console."));
  check("the deactivate confirmation says old bills are not affected (the invariant said out loud)",
    sheetSrc.includes("บิลเก่า") && sheetSrc.includes("ไม่กระทบ"));
  check("the code field is shown READ-ONLY in the edit form (immutable), a control the sheet does not offer to change",
    screenSrc.includes("fixedCode") && sheetSrc.includes("showCode={false}"));
}

/* ==========================================================================
 * R1..R5 — the live round against a real server
 * ========================================================================== */
const API = process.env.RECYCLE_API_BASE ?? "http://127.0.0.1:8000";
const TENANT_A = "11111111-1111-1111-1111-111111111111";
const RUN = Math.random().toString(36).slice(2, 8);
const apiFetch = withClientVersion(globalThis.fetch.bind(globalThis));

async function login(username: string, password: string): Promise<string | null> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenant_id: TENANT_A, username, password }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { access_token?: string }).access_token ?? null;
}
async function tx(makeReq: () => Promise<Response>): Promise<ProductFetch> {
  let res: Response;
  try {
    res = await makeReq();
  } catch {
    return { kind: "unreachable" };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok) return { kind: "ok", body };
  return { kind: "http", status: res.status, body };
}
const authHdr = (token: string) => ({ authorization: `Bearer ${token}` });
const jsonHdr = (token: string) => ({ "content-type": "application/json", ...authHdr(token) });
const idOf = (f: ProductFetch): string | null =>
  f.kind === "ok" && typeof f.body === "object" && f.body !== null && typeof (f.body as { id?: unknown }).id === "string"
    ? (f.body as { id: string }).id
    : null;

async function liveRound(): Promise<void> {
  header("R the REAL server: create, DUPLICATE 409, edit, deactivate → still reads on a bill, reactivate");
  const token = await login("admin", "tenantA-pw-123");
  check("R0: the seeded tenant-A admin can sign in against the real API", token !== null, `api=${API}`);
  if (token === null) throw new Error(`admin login failed at ${API}`);

  // R1 — create a category, a unit, and a product under them.
  const cat = await tx(() => apiFetch(`${API}/product-categories`, { method: "POST", headers: jsonHdr(token), body: JSON.stringify({ code: `CAT-${RUN}`, name: "หมวดทดสอบ" }) }));
  const uom = await tx(() => apiFetch(`${API}/uoms`, { method: "POST", headers: jsonHdr(token), body: JSON.stringify({ code: `UOM-${RUN}`, name: "หน่วยทดสอบ" }) }));
  check("R1: category and unit create classify ok", productWriteOutcome(cat).kind === "ok" && productWriteOutcome(uom).kind === "ok");
  const catId = idOf(cat);
  const uomId = idOf(uom);
  if (catId === null || uomId === null) throw new Error("no id from category/unit create");
  const prodCode = `PRD-${RUN}`;
  const created = await tx(() => apiFetch(`${API}/products`, { method: "POST", headers: jsonHdr(token), body: JSON.stringify({ code: prodCode, name: "สินค้าทดสอบ", category_id: catId, uom_id: uomId }) }));
  check("R1: product create classifies ok", productWriteOutcome(created).kind === "ok",
    created.kind === "http" ? `status ${String(created.status)}` : created.kind);
  const prodId = idOf(created);
  if (prodId === null) throw new Error("no id from product create");
  const createdPrices = created.kind === "ok" ? (created.body as { prices?: unknown }).prices : undefined;
  check("R1: a brand-new product has NO price tiers (the correct state, never invented)",
    JSON.stringify(createdPrices) === "{}", JSON.stringify(createdPrices));

  // R2 — DUPLICATE code on ALL THREE routes → 409. prove_master_write.py:481 asserts
  // this for sellers only, so this is the first proof of it for products/categories/units.
  const dupProd = await tx(() => apiFetch(`${API}/products`, { method: "POST", headers: jsonHdr(token), body: JSON.stringify({ code: prodCode, name: "ซ้ำ", category_id: catId, uom_id: uomId }) }));
  const dupCat = await tx(() => apiFetch(`${API}/product-categories`, { method: "POST", headers: jsonHdr(token), body: JSON.stringify({ code: `CAT-${RUN}`, name: "ซ้ำ" }) }));
  const dupUom = await tx(() => apiFetch(`${API}/uoms`, { method: "POST", headers: jsonHdr(token), body: JSON.stringify({ code: `UOM-${RUN}`, name: "ซ้ำ" }) }));
  const is409 = (f: ProductFetch) => f.kind === "http" && f.status === 409;
  check("R2: a duplicate PRODUCT code is a 409 the client words as a taken code",
    is409(dupProd) && refused(dupProd).includes("ถูกใช้ไปแล้ว"), dupProd.kind === "http" ? String(dupProd.status) : dupProd.kind);
  check("R2: a duplicate CATEGORY code is a 409 (unproven until now)", is409(dupCat), dupCat.kind === "http" ? String(dupCat.status) : dupCat.kind);
  check("R2: a duplicate UNIT code is a 409 (unproven until now)", is409(dupUom), dupUom.kind === "http" ? String(dupUom.status) : dupUom.kind);

  // R3 — edit the product's name; read it back (include_inactive).
  const edited = await tx(() => apiFetch(`${API}/products/${encodeURIComponent(prodId)}`, { method: "PATCH", headers: jsonHdr(token), body: JSON.stringify({ name: "สินค้าทดสอบแก้แล้ว", category_id: catId, uom_id: uomId }) }));
  check("R3: edit classifies ok", productWriteOutcome(edited).kind === "ok");
  check("R3: the edited name reads back", edited.kind === "ok" && (edited.body as { name?: unknown }).name === "สินค้าทดสอบแก้แล้ว");

  // R4 — THE INVARIANT: a bill referencing the product, then deactivate the product,
  // and the retired product STILL READS its code and name on that bill.
  const sellersRes = await fetch(`${API}/sellers`, { headers: authHdr(token) });
  const sellers = (await sellersRes.json()) as { sellers: { id: string; grade: string | null }[] };
  const graded = sellers.sellers.find((s) => s.grade !== null);
  if (graded === undefined || graded.grade === null) throw new Error("no seeded seller with a grade to bill against");
  const priceSet = await tx(() => apiFetch(`${API}/products/${encodeURIComponent(prodId)}/prices/${encodeURIComponent(graded.grade!)}`, { method: "PUT", headers: jsonHdr(token), body: JSON.stringify({ price: "10.00" }) }));
  check("R4: a price for the seller's grade is set on the new product", productWriteOutcome(priceSet).kind === "ok",
    priceSet.kind === "http" ? String(priceSet.status) : priceSet.kind);
  const billId = randomUUID();
  const billRes = await apiFetch(`${API}/bills`, {
    method: "POST",
    headers: jsonHdr(token),
    body: JSON.stringify({
      id: billId,
      seller_id: graded.id,
      device_created_at: new Date().toISOString(),
      idempotency_key: `p115-${RUN}`,
      items: [{ id: randomUUID(), product_id: prodId, line_no: 1, gross_weight: "1.000", tare_weight: "0.000", net_weight: "1.000", unit_price: "10.00" }],
    }),
  });
  check("R4: a bill referencing the new product is created (201)", billRes.status === 201, `status ${String(billRes.status)}`);

  const deact = await tx(() => apiFetch(`${API}/products/${encodeURIComponent(prodId)}/deactivate`, { method: "POST", headers: authHdr(token) }));
  check("R4: deactivate classifies ok", productWriteOutcome(deact).kind === "ok");

  const billBack = await fetch(`${API}/bills/${encodeURIComponent(billId)}`, { headers: authHdr(token) });
  const billBody = (await billBack.json()) as { items: { product_id: string; product_code: string | null; product_name: string | null }[] };
  const line = billBody.items.find((it) => it.product_id === prodId);
  check("R4: THE RETIRED PRODUCT STILL READS ITS CODE AND NAME ON THE OLD BILL (deactivate ≠ delete)",
    line?.product_code === prodCode && line?.product_name === "สินค้าทดสอบแก้แล้ว",
    `code=${line?.product_code ?? "null"} name=${line?.product_name ?? "null"}`);

  // And it left the active picker but is still resolvable with its full identity.
  const activeList = await tx(() => apiFetch(`${API}/products`, { headers: authHdr(token) }));
  const inactiveList = await tx(() => apiFetch(`${API}/products?include_inactive=true`, { headers: authHdr(token) }));
  const inActive = (f: ProductFetch) => (f.kind === "ok" ? ((f.body as { products: { id: string }[] }).products.some((p) => p.id === prodId)) : false);
  const rowIn = (f: ProductFetch) => (f.kind === "ok" ? (f.body as { products: AdminProduct[] }).products.find((p) => p.id === prodId) : undefined);
  check("R4: the retired product is GONE from the active picker (GET /products)", !inActive(activeList));
  const retired = rowIn(inactiveList);
  check("R4: but it is present in include_inactive with is_active false and its identity intact",
    retired?.is_active === false && retired.code === prodCode, `is_active=${String(retired?.is_active)}`);

  // R5 — reactivate; it returns to the active picker.
  const react = await tx(() => apiFetch(`${API}/products/${encodeURIComponent(prodId)}/activate`, { method: "POST", headers: authHdr(token) }));
  check("R5: reactivate classifies ok", productWriteOutcome(react).kind === "ok");
  const backList = await tx(() => apiFetch(`${API}/products`, { headers: authHdr(token) }));
  check("R5: the reactivated product is offered again", inActive(backList));
}

async function main(): Promise<number> {
  console.log("P1.15 — product master data on the phone");
  console.log(`node ${process.version}`);
  const offline = process.argv.includes("--offline");

  h1EntryGate();
  h2Grouped();
  h3SearchFilter();
  h3Timing();
  h4Empty();
  h5Validation();
  h6Entities();

  if (offline) {
    console.log("\n=== R SKIPPED (--offline) ===");
    console.log("  The live round is the only case that reads the server's ACTUAL answers.");
    console.log("  Everything above proves the client agrees with itself.");
    console.log("\nINCOMPLETE — the headless cells passed but nothing was verified against the API.");
    return failures === 0 ? 2 : 1;
  }

  try {
    await liveRound();
  } catch (err) {
    failures += 1;
    console.log(`\n  [FAIL] the live server could not be driven at ${API}`);
    console.log(`         ${err instanceof Error ? err.message : String(err)}`);
    console.log("         Start a uvicorn on a scratch and set RECYCLE_API_BASE, or run --offline (exits 2).");
  }

  console.log("");
  console.log(`  passes=${String(passes)}  failures=${String(failures)}`);
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

void main().then((rc) => {
  console.log(`PROVE_PRODUCTS_EXIT=${String(rc)}`);
  process.exitCode = rc;
});
