/**
 * THE SHOP'S MONEY RULES THROUGH THE REAL SCREENS (server migration 0027, M1), against a scratch
 * server, signed in as a per-run OWNER -- the only seat that may change a money rule.
 *
 *   npm run prove:moneyflow
 *
 *   M1 the shop tab draws "การคิดเงิน" editable for the owner; rounding, deduction and reason saved
 *      on screen read back over HTTP (GET /shop), value against value
 *   M2 a product's rules saved on screen (pricing basis, its own deduction rule) read back over HTTP
 *   M3 a bill with an impurity deduction and a reason (POST /bills, the line declaring its rules):
 *      the bill detail reads the deduction, its reason and the line's OWN unit (never a fixed กก.),
 *      and the slip preview prints ภาชนะ for the container and หักสิ่งเจือปน for the deduction
 *
 * What an ADMIN is refused is the server's to prove (scripts/prove_money_rules.py O1-O4, over HTTP);
 * the screens draw nothing editable for one (prove:people $3). RECYCLE_SHOT_DIR collects screenshots.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { _electron, type ElectronApplication, type Page } from "playwright-core";

import { check, DESKTOP_ROOT, finish, header } from "./harness";
import { http, S001, startScratchServer } from "./scratchServer";

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env["RECYCLE_SHOT_DIR"];
  if (dir !== undefined && dir !== "") await page.screenshot({ path: join(dir, `${name}.png`) });
}

const PRODUCT = "aaaa0000-0000-0000-0000-0000000000a3";

void finish("PROVE_MONEYFLOW", async () => {
  header("M the money rules, screen to server and back");
  const userData = mkdtempSync(join(tmpdir(), "recycle-desktop-money-"));
  const server = await startScratchServer("owner");
  const { info } = server;
  const run = randomUUID().slice(0, 6).toLowerCase();
  let app: ElectronApplication | null = null;
  try {
    const login = await http(info.base, "POST", "/auth/login", undefined,
      { tenant_id: info.tenant_id, username: info.username, password: info.password });
    const token = (login.json as { access_token: string }).access_token;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const executablePath = require("electron") as unknown as string;
    app = await _electron.launch({ executablePath, args: [DESKTOP_ROOT], env: { ...process.env, RECYCLE_USER_DATA: userData } as Record<string, string> });
    const page = await app.firstWindow();
    await page.fill('input[name="apiBase"]', info.base);
    await page.fill('input[name="shopCode"]', info.shop_code);
    await page.click('button[type="submit"]');
    await page.fill('input[name="username"]', info.username);
    await page.fill('input[name="password"]', info.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector(`[data-signed-in="${info.username}"]`, { timeout: 20_000 });

    // M1 -- the shop's rules
    await page.click('[data-nav="people"]');
    await page.waitForSelector("[data-money-rules]", { timeout: 20_000 });
    const enabled = await page.locator('select[name="roundingRule"]').isEnabled();
    await page.selectOption('select[name="roundingRule"]', "down_1");
    await page.selectOption('select[name="deductionMode"]', "both");
    await page.check('input[name="reasonRequired"]');
    await shot(page, "m1_money_rules_edit");
    await page.click("[data-save-money]");
    await page.waitForSelector("[data-panel-saved]", { timeout: 15_000 });
    const saved = await page.locator("[data-panel-saved]").innerText();
    const shop = (await http(info.base, "GET", "/shop", token)).json as Record<string, unknown>;
    await shot(page, "m1_money_rules_saved");
    check("M1 the owner's money section is editable, and what was saved reads back over HTTP",
      enabled && shop["rounding_rule"] === "down_1" && shop["deduction_mode"] === "both" && shop["deduction_reason_required"] === true
        && saved.startsWith("บันทึกกติกาการคิดเงินแล้ว"),
      JSON.stringify({ enabled, rounding: shop["rounding_rule"], mode: shop["deduction_mode"], req: shop["deduction_reason_required"], saved }));

    // M2 -- a product's rules
    const products = ((await http(info.base, "GET", "/products", token)).json as { products: { id: string; code: string; uom_name: string }[] }).products;
    const product = products.find((p) => p.id === PRODUCT);
    await page.click('[data-nav="master"]');
    await page.click('[data-tab="products"]');
    await page.click(`[data-row="${product?.code ?? ""}"]`);
    await page.waitForSelector("[data-product-rules]", { timeout: 15_000 });
    await page.selectOption('select[name="productDeduction"]', "percent");
    await page.locator("[data-product-rules] .btn-primary").click();
    await page.waitForFunction(() => document.querySelector("[data-product-rules]")?.textContent?.includes("บันทึกกติกาการคิดเงินแล้ว") === true,
      undefined, { timeout: 15_000 }).catch(() => undefined);
    const after = ((await http(info.base, "GET", "/products", token)).json as { products: Record<string, unknown>[] }).products
      .find((p) => p["id"] === PRODUCT);
    await shot(page, "m2_product_rules");
    check("M2 the product's own deduction rule saved on screen reads back over HTTP (and its effective rule follows)",
      after?.["deduction_mode"] === "percent" && after["deduction_mode_effective"] === "percent" && after["pricing_basis"] === "weight",
      JSON.stringify({ own: after?.["deduction_mode"], eff: after?.["deduction_mode_effective"], basis: after?.["pricing_basis"] }));

    // M3 -- a deducting bill on the detail and the slip
    const id = randomUUID();
    const posted = await http(info.base, "POST", "/bills", token, {
      id, seller_id: S001, vehicle_no: `MONEY-${run}`, device_created_at: new Date().toISOString(),
      idempotency_key: `money-${run}`,
      items: [{ id: randomUUID(), product_id: PRODUCT, line_no: 1, gross_weight: "1250.000", tare_weight: "50.000",
        net_weight: "1175.000", unit_price: "15.00", pricing_basis: "weight", rounding_rule: "down_1",
        deduction_mode: "kg", deduction_weight: "25.000", deduction_reason: "ดินติด" }],
    });
    const doc = (posted.json as { doc_no?: string; total_amount?: string } | null)?.doc_no ?? "";
    await page.click('[data-nav="bills"]');
    await page.waitForSelector(`[data-bill="${doc}"]`, { timeout: 20_000 });
    await page.click(`[data-bill="${doc}"] button.link`);
    await page.waitForSelector(`[data-detail="${doc}"]`, { timeout: 15_000 });
    const calc = await page.locator(`[data-detail="${doc}"] .line-calc`).allInnerTexts();
    await shot(page, "m3_bill_detail");
    const unit = product?.uom_name ?? "";
    check("M3 the bill detail reads the deduction, its reason and the line's own unit",
      posted.status === 201 && (posted.json as { total_amount?: string }).total_amount === "17625.00"
        && calc.length === 2 && (calc[0] ?? "").includes("− หักสิ่งเจือปน 25.000") && (calc[0] ?? "").includes(`สุทธิ 1,175.000 ${unit}`)
        && calc[1] === "เหตุผลที่หัก: ดินติด",
      JSON.stringify({ status: posted.status, total: (posted.json as { total_amount?: string }).total_amount, unit, calc }));
    await page.click("text=พิมพ์สลิป");
    await page.waitForSelector(`[data-slip="${doc}"] .paper`, { timeout: 15_000 });
    const paper = (await page.locator(`[data-slip="${doc}"] .paper > div`).allInnerTexts()).join("\n");
    await shot(page, "m3_slip_preview");
    check("M3 the slip preview prints ภาชนะ for the container, the deduction and its reason, in the line's unit",
      paper.includes(`ภาชนะ 50.000 ${unit}`) && paper.includes(`หักสิ่งเจือปน 25.000 ${unit}`) && paper.includes("เหตุผล ดินติด")
        && !paper.includes(" หัก 50.000"),
      paper.replace(/\s+/g, " ").slice(0, 300));
  } finally {
    if (app !== null) await app.close().catch(() => undefined);
    server.proc.kill();
    rmSync(userData, { recursive: true, force: true });
  }
});
