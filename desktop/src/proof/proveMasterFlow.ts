/**
 * MASTER DATA THROUGH THE REAL SCREENS (B5), against a scratch server.
 *
 *   npm run prove:masterflow
 *
 *   F1 a category, a unit and a product added through the screen exist over HTTP with those links
 *   F2 prices typed as `15.5` and `1234.50`: the PUT bodies carry STRINGS (captured off the wire),
 *      the server reads back "15.50" and "1234.50", and the list shows "15.50" and "1,234.50"
 *   F3 the product renamed, then retired: over HTTP it is inactive and STILL THERE; it leaves the
 *      default list and returns with "แสดงที่ปิดใช้งานแล้ว"; brought back, it is active
 *   F4 a new tier moved up one place: the server's order says so
 *   F5 a seller added with an ID number and address by an admin (who may read them); found by
 *      typing the phone without dashes
 *   F6 a STAFF account (no sellers.read_personal) opens that seller: no ID or address field, the
 *      last four shown, and neither value anywhere in the window's HTML
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { _electron, type ElectronApplication, type Page } from "playwright-core";

import { check, DESKTOP_ROOT, finish, header } from "./harness";
import { http, startScratchServer } from "./scratchServer";

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env["RECYCLE_SHOT_DIR"];
  if (dir !== undefined && dir !== "") await page.screenshot({ path: join(dir, `${name}.png`) });
}

async function signIn(page: Page, username: string, password: string): Promise<void> {
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', password);
  await page.click('button[type="submit"]');
  // The shell keeps the last screen across a sign-out, so wait for the USER, not for a screen.
  await page.waitForSelector(`[data-signed-in="${username}"]`, { timeout: 20_000 });
}

/** The open panel's own close button (a `text=ปิด` selector also matches "เปิดใช้งาน…" and "ปิดใช้งาน"). */
const closePanel = (page: Page) => page.click(".panel .panel-head button");

interface P { id: string; code: string; name: string; is_active: boolean; category_id: string; uom_id: string; prices: Record<string, string> }

void finish("PROVE_MASTERFLOW", async () => {
  header("F master data, screen to server");
  const userData = mkdtempSync(join(tmpdir(), "recycle-desktop-master-"));
  const server = await startScratchServer();
  const { info } = server;
  const run = randomUUID().slice(0, 6).toUpperCase();
  let app: ElectronApplication | null = null;
  try {
    const login = await http(info.base, "POST", "/auth/login", undefined, { tenant_id: info.tenant_id, username: info.username, password: info.password });
    const token = (login.json as { access_token: string }).access_token;
    const tiers = ((await http(info.base, "GET", "/grade-tiers", token)).json as { grade_tiers: { code: string }[] }).grade_tiers;
    const [t1, t2] = [tiers[0]?.code ?? "", tiers[1]?.code ?? ""];

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const executablePath = require("electron") as unknown as string;
    app = await _electron.launch({ executablePath, args: [DESKTOP_ROOT], env: { ...process.env, RECYCLE_USER_DATA: userData } as Record<string, string> });
    const page = await app.firstWindow();
    const priceBodies: string[] = [];
    page.on("request", (r) => { if (r.method() === "PUT" && r.url().includes("/prices/")) priceBodies.push(r.postData() ?? ""); });
    await page.fill('input[name="apiBase"]', info.base);
    await page.fill('input[name="shopCode"]', info.shop_code);
    await page.click('button[type="submit"]');
    await signIn(page, info.username, info.password);
    await page.click('[data-nav="master"]');
    await page.waitForSelector('[data-master="products"]', { timeout: 20_000 });

    const panel = (tab: string) => page.locator(`[data-panel="${tab}"]`);
    const addCodeName = async (tab: string, code: string, name: string) => {
      await page.click(`[data-tab="${tab}"]`);
      await page.click(`[data-add="${tab}"]`);
      await panel(tab).locator('input[name="code"]').fill(code);
      await panel(tab).locator('input[name="name"]').fill(name);
      await panel(tab).locator("button", { hasText: "บันทึก" }).click();
      await panel(tab).locator("[data-panel-saved]").waitFor({ timeout: 15_000 });
    };
    await addCodeName("categories", `CAT${run}`, `โลหะทดสอบ ${run}`);
    await addCodeName("uoms", `U${run}`, `กิโลทดสอบ ${run}`);
    await page.click('[data-tab="products"]');
    await page.click('[data-add="products"]');
    await panel("products").locator('input[name="code"]').fill(`PR${run}`);
    await panel("products").locator('input[name="name"]').fill(`ทองแดงทดสอบ ${run}`);
    await panel("products").locator('select[name="category"]').selectOption({ label: `CAT${run} · โลหะทดสอบ ${run}` });
    await panel("products").locator('select[name="uom"]').selectOption({ label: `U${run} · กิโลทดสอบ ${run}` });
    await panel("products").locator(".form-stack > .void-actions button", { hasText: "บันทึก" }).click();
    await panel("products").locator("[data-panel-saved]").waitFor({ timeout: 15_000 });
    const all = async (): Promise<P[]> => ((await http(info.base, "GET", "/products?include_inactive=true", token)).json as { products: P[] }).products;
    const cats = ((await http(info.base, "GET", "/product-categories", token)).json as { product_categories: { id: string; code: string }[] }).product_categories;
    const uoms = ((await http(info.base, "GET", "/uoms", token)).json as { uoms: { id: string; code: string }[] }).uoms;
    const made = (await all()).find((p) => p.code === `PR${run}`);
    check("F1 category, unit and product added on screen exist over HTTP, linked",
      made !== undefined && made.category_id === cats.find((c) => c.code === `CAT${run}`)?.id && made.uom_id === uoms.find((u) => u.code === `U${run}`)?.id,
      JSON.stringify(made));

    await panel("products").locator(`input[name="price-${t1}"]`).fill("15.5");
    await panel("products").locator(`input[name="price-${t2}"]`).fill("1234.50");
    await panel("products").locator(".price-table button", { hasText: "บันทึก" }).click();
    await panel("products").locator(".price-table [data-panel-saved]").waitFor({ timeout: 15_000 });
    const priced = (await all()).find((p) => p.code === `PR${run}`);
    const chip1 = await page.locator(`[data-price="PR${run}:${t1}"]`).innerText();
    const chip2 = await page.locator(`[data-price="PR${run}:${t2}"]`).innerText();
    const inputAfter = await panel("products").locator(`input[name="price-${t1}"]`).inputValue();
    const bodiesAreStrings = priceBodies.length === 2 && priceBodies.every((b) => typeof (JSON.parse(b) as { price: unknown }).price === "string");
    await shot(page, "b5_products");
    check("F2 prices go as STRINGS, read back as the server's decimals, shown grouped; the input shows the STORED 15.50",
      bodiesAreStrings && priced?.prices[t1] === "15.50" && priced.prices[t2] === "1234.50" && chip1.endsWith("15.50") && chip2.endsWith("1,234.50")
        && inputAfter === "15.50",
      JSON.stringify({ priceBodies, prices: priced?.prices, chip1, chip2, inputAfter }));

    await panel("products").locator('input[name="name"]').fill(`ทองแดงเปลี่ยนชื่อ ${run}`);
    await panel("products").locator(".form-stack > .void-actions button", { hasText: "บันทึก" }).click();
    await page.waitForFunction(() => document.querySelector("[data-panel-saved]")?.textContent === "บันทึกแล้ว", null, { timeout: 15_000 });
    await panel("products").locator("[data-toggle-active]").click();
    await page.waitForFunction(() => document.querySelector("[data-panel-saved]")?.textContent?.startsWith("ปิดใช้งานแล้ว") === true, null, { timeout: 15_000 });
    const retired = (await all()).find((p) => p.code === `PR${run}`);
    await closePanel(page);
    const hiddenByDefault = (await page.locator(`[data-row="PR${run}"]`).count()) === 0;
    await page.check('input[name="showInactive"]');
    const shownWithToggle = (await page.locator(`[data-row="PR${run}"]`).count()) === 1;
    await page.click(`[data-row="PR${run}"] button.link`);
    await panel("products").locator("[data-toggle-active]").click();
    await page.waitForFunction(() => document.querySelector("[data-panel-saved]")?.textContent === "เปิดใช้งานแล้ว", null, { timeout: 15_000 });
    const back = (await all()).find((p) => p.code === `PR${run}`);
    check("F3 renamed and retired: inactive yet present over HTTP; hidden by default, shown with the toggle; brought back active",
      retired?.is_active === false && retired.name === `ทองแดงเปลี่ยนชื่อ ${run}` && hiddenByDefault && shownWithToggle && back?.is_active === true,
      JSON.stringify({ retired: retired?.is_active, name: retired?.name, hiddenByDefault, shownWithToggle, back: back?.is_active }));
    await page.uncheck('input[name="showInactive"]');

    await addCodeName("tiers", `Z${run}`, `เกรดทดสอบ ${run}`);
    const orderOf = async () => ((await http(info.base, "GET", "/grade-tiers?include_inactive=true", token)).json as { grade_tiers: { code: string; sort_order: number }[] }).grade_tiers
      .sort((a, b) => a.sort_order - b.sort_order).map((t) => t.code);
    const beforeMove = await orderOf();
    await panel("tiers").locator("button", { hasText: "เลื่อนขึ้น" }).click();
    await page.waitForTimeout(1500);
    const afterMove = await orderOf();
    const i0 = beforeMove.indexOf(`Z${run}`);
    await shot(page, "b5_tiers");
    check("F4 the new tier moved up one place in the server's order",
      i0 > 0 && afterMove.indexOf(`Z${run}`) === i0 - 1 && afterMove.length === beforeMove.length, JSON.stringify({ beforeMove, afterMove }));

    const idNeedle = `31007${run.replace(/\D/g, "7").padEnd(8, "7")}`;
    const addrNeedle = `ที่อยู่ลับ ${run}`;
    await page.click('[data-tab="sellers"]');
    await page.click('[data-add="sellers"]');
    await panel("sellers").locator('input[name="name"]').fill(`ผู้ขายทดสอบ ${run}`);
    await panel("sellers").locator('input[name="phone"]').fill("089-555-0142");
    await panel("sellers").locator('input[name="id_number"]').fill(idNeedle);
    await panel("sellers").locator('textarea[name="address"]').fill(addrNeedle);
    await panel("sellers").locator("button", { hasText: "บันทึก" }).click();
    await panel("sellers").locator("[data-panel-saved]").waitFor({ timeout: 15_000 });
    await closePanel(page);
    await page.fill('input[name="masterSearch"]', "0895550142");
    const found = await page.locator('[data-master="sellers"] [data-row]').allInnerTexts();
    const stored = ((await http(info.base, "GET", "/sellers", token)).json as { sellers: { name: string; id_number?: string; address?: string; code: string }[] })
      .sellers.find((s) => s.name === `ผู้ขายทดสอบ ${run}`);
    await shot(page, "b5_sellers_admin");
    check("F5 the admin's seller is stored with ID and address, and found by the phone typed without dashes",
      stored?.id_number === idNeedle && stored.address === addrNeedle && found.length === 1 && (found[0] ?? "").includes(`ผู้ขายทดสอบ ${run}`),
      JSON.stringify({ found, stored: stored?.code }));

    const staffName = `staff-${run.toLowerCase()}`;
    const staffPw = `pw-${randomUUID()}`;
    const mk = await http(info.base, "POST", "/users", token, { username: staffName, full_name: "พนักงานทดสอบ", role: "staff", password: staffPw });
    await page.click("text=ออกจากระบบ");
    await page.waitForSelector('input[name="username"]', { timeout: 15_000 });
    await signIn(page, staffName, staffPw);
    await page.click('[data-nav="master"]');
    await page.click('[data-tab="sellers"]');
    await page.fill('input[name="masterSearch"]', `ผู้ขายทดสอบ ${run}`);
    await page.click(`[data-master="sellers"] [data-row="${stored?.code ?? ""}"] button.link`);
    await panel("sellers").waitFor({ timeout: 15_000 });
    const idFields = await panel("sellers").locator('input[name="id_number"], textarea[name="address"]').count();
    const hint = await panel("sellers").locator("[data-personal-hidden]").innerText().catch(() => "");
    const html = await page.content();
    await shot(page, "b5_sellers_staff");
    check("F6 staff: no ID or address field, the last four shown, and neither value anywhere in the window",
      mk.status === 201 && idFields === 0 && hint.includes(idNeedle.slice(-4)) && !html.includes(idNeedle) && !html.includes(addrNeedle),
      JSON.stringify({ mk: mk.status, idFields, hint }));
  } finally {
    // The window as it stood when the run ended (a red's first evidence), next to the other shots.
    const dir = process.env["RECYCLE_SHOT_DIR"];
    if (app !== null && dir !== undefined && dir !== "") {
      await (await app.firstWindow()).screenshot({ path: join(dir, "b5_last_state.png") }).catch(() => undefined);
    }
    if (app !== null) await app.close().catch(() => undefined);
    server.proc.kill();
    rmSync(userData, { recursive: true, force: true });
  }
});
