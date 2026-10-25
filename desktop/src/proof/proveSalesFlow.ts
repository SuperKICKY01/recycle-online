/**
 * SALES, BUYERS AND STOCK THROUGH THE REAL SCREENS (M2), against a scratch server, signed in as a
 * per-run OWNER (the seat that sees cost and gross profit).
 *
 *   npm run prove:salesflow
 *
 *   F1 a buyer added on Master › ผู้ซื้อ with a blank code reads back over HTTP with a server-assigned
 *      code and its taxpayer number; the form offers no ID-card field
 *   F2 a sale drafted on Sales › ขายสินค้า, in a shop whose rounding rule is down_1 (set over HTTP first): the
 *      quote the screen draws equals POST /sales/quote for the same line under that rule, and the saved sale
 *      (GET /sales/{id}) carries that total, the typed partial receipt, and the rule declared on its line --
 *      hand-computed: (120.500 - 0.500) x 8.77 = 1052.40 -> down_1 -> 1052.00, received 300.00, outstanding
 *      752.00 (a form that declared no rule would be computed on the server's default and differ)
 *   F3 a further receipt on the detail panel: received 550.00, outstanding 502.00 over HTTP; the panel
 *      labels the margin กำไรขั้นต้น and shows the server's figure verbatim
 *   F4 the slip preview prints the doc_no and ค้างรับ 502.00, and never the cost or the margin
 *   F5 Reports › ขายและกำไรขั้นต้น: the screen's total margin equals GET /reports/sales; the category
 *      export, read by Python's own reader, has one sheet per category of the week's active lines
 *   F6 Stock: the row's balance equals GET /stock; an adjustment saved on screen is a movement over HTTP
 *      (kind adjust, the typed reason, the signed quantity)
 *   F7 the sale voided on screen: GET /sales/{id} is voided with the reason, and the ledger holds a
 *      void_sale movement reversing the sale's own movement (nothing deleted)
 *
 * RECYCLE_SHOT_DIR collects screenshots.
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { _electron, type ElectronApplication, type Page } from "playwright-core";

import { check, DESKTOP_ROOT, finish, header } from "./harness";
import { http, startScratchServer } from "./scratchServer";
import { readXlsx } from "./xlsxReader";

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env["RECYCLE_SHOT_DIR"];
  if (dir !== undefined && dir !== "") await page.screenshot({ path: join(dir, `${name}.png`) });
}

const PRODUCT = "aaaa0000-0000-0000-0000-0000000000a3";
type J = Record<string, unknown>;

void finish("PROVE_SALESFLOW", async () => {
  header("F sales, buyers and stock, screen to server and back");
  const userData = mkdtempSync(join(tmpdir(), "recycle-desktop-sales-"));
  const saveDir = mkdtempSync(join(tmpdir(), "recycle-desktop-sales-save-"));
  const server = await startScratchServer("owner");
  const { info } = server;
  const run = randomUUID().slice(0, 6).toLowerCase();
  let app: ElectronApplication | null = null;
  try {
    const login = await http(info.base, "POST", "/auth/login", undefined,
      { tenant_id: info.tenant_id, username: info.username, password: info.password });
    const token = (login.json as { access_token: string }).access_token;
    const get = async (path: string): Promise<J> => (await http(info.base, "GET", path, token)).json as J;
    // A shop rule that is NOT the server's default, so F2 can tell a declared rule from a defaulted one.
    const ruled = await http(info.base, "PATCH", "/shop", token, { rounding_rule: "down_1" });
    if (ruled.status !== 200) throw new Error(`PATCH /shop rounding_rule -> ${String(ruled.status)}`);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const executablePath = require("electron") as unknown as string;
    app = await _electron.launch({ executablePath, args: [DESKTOP_ROOT],
      env: { ...process.env, RECYCLE_USER_DATA: userData, RECYCLE_SAVE_DIR: saveDir } as Record<string, string> });
    const page = await app.firstWindow();
    await page.fill('input[name="apiBase"]', info.base);
    await page.fill('input[name="shopCode"]', info.shop_code);
    await page.click('button[type="submit"]');
    await page.fill('input[name="username"]', info.username);
    await page.fill('input[name="password"]', info.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector(`[data-signed-in="${info.username}"]`, { timeout: 20_000 });

    // F1 -- a buyer, code left blank
    const buyerName = `โรงหล่อทดสอบ ${run}`;
    await page.click('[data-nav="master"]');
    await page.click('[data-tab="buyers"]');
    await page.click('[data-add="buyers"]');
    await page.fill('input[name="name"]', buyerName);
    await page.fill('input[name="tax_id"]', "0105556123456");
    const idCardField = await page.locator('input[name="id_card"], input[name="national_id"], input[name="citizen_id"]').count();
    await shot(page, "f1_buyer_form");
    await page.locator(".form-stack .btn-primary").first().click();
    await page.waitForFunction((n) => document.body.textContent?.includes("เพิ่มผู้ซื้อแล้ว") === true || document.body.textContent?.includes(n) === true,
      buyerName, { timeout: 15_000 });
    const buyers = ((await get("/buyers")).buyers as J[]);
    const buyer = buyers.find((b) => b["name"] === buyerName);
    await shot(page, "f1_buyer_saved");
    check("F1 the buyer saved on screen reads back with a server-assigned code and its taxpayer number; no ID-card field",
      buyer !== undefined && /^C\d{3,}$/.test(String(buyer["code"])) && buyer["tax_id"] === "0105556123456" && idCardField === 0
        && !("id_card" in buyer) && !("national_id" in buyer),
      JSON.stringify({ buyer, idCardField }));
    const buyerId = String(buyer?.["id"] ?? "");

    // F2 -- a sale drafted, quoted and saved on screen
    await page.click('[data-nav="sales"]');
    await page.click('[data-tab="sales-new"]');
    await page.waitForSelector("[data-new-sale]", { timeout: 15_000 });
    await page.waitForFunction((id) => document.querySelector(`select[name="saleBuyer"] option[value="${id}"]`) !== null, buyerId, { timeout: 15_000 });
    await page.selectOption('select[name="saleBuyer"]', buyerId);
    await page.selectOption('select[name="product-1"]', PRODUCT);
    await page.fill('input[name="gross-1"]', "120.500");
    await page.fill('input[name="tare-1"]', "0.500");
    await page.fill('input[name="price-1"]', "8.77");
    await page.click("[data-quote]");
    await page.waitForFunction(() => /\d/.test(document.querySelector("[data-quote-total]")?.textContent ?? ""), undefined, { timeout: 15_000 });
    const screenNet = (await page.locator('[data-sale-form-line="1"] [data-quote-net]').innerText()).trim();
    const screenAmount = (await page.locator('[data-sale-form-line="1"] [data-quote-amount]').innerText()).trim();
    const screenTotal = (await page.locator("[data-quote-total]").innerText()).trim();
    const apiQuote = await http(info.base, "POST", "/sales/quote", token, {
      id: randomUUID(), buyer_id: buyerId, device_created_at: new Date().toISOString(), idempotency_key: `quote-${run}`,
      items: [{ id: randomUUID(), product_id: PRODUCT, line_no: 1, gross_weight: "120.500", tare_weight: "0.500", net_weight: "120.500",
        unit_price: "8.77", pricing_basis: "weight", rounding_rule: "down_1" }],
    });
    const defaulted = await http(info.base, "POST", "/sales/quote", token, {
      items: [{ id: randomUUID(), product_id: PRODUCT, line_no: 1, gross_weight: "120.500", tare_weight: "0.500", net_weight: "120.500",
        unit_price: "8.77", pricing_basis: "weight" }],
    });
    const q = apiQuote.json as { total_amount?: string; items?: { net_weight: string; amount: string }[] } | null;
    await page.fill('input[name="received"]', "300.00");
    await shot(page, "f2_sale_quoted");
    await page.click("[data-save-sale]");
    await page.waitForSelector("[data-sale-detail]", { timeout: 20_000 });
    const doc = (await page.locator("[data-sale-detail]").getAttribute("data-sale-detail")) ?? "";
    const listed = ((await get(`/sales?buyer_id=${buyerId}`)).sales as J[]);
    const saleId = String(listed.find((s) => s["doc_no"] === doc)?.["id"] ?? "");
    const sale = await get(`/sales/${saleId}`);
    await shot(page, "f2_sale_saved");
    const saleLine = ((sale["items"] as J[] | undefined) ?? [])[0];
    const defaultTotal = (defaulted.json as { total_amount?: string } | null)?.total_amount;
    check("F2 the screen's quote equals POST /sales/quote under the shop's down_1, and the saved sale carries it and declares it:"
      + " 1052.00, received 300.00, outstanding 752.00",
      apiQuote.status === 200 && q?.total_amount === "1052.00" && q.items?.[0]?.net_weight === "120.000"
        && screenNet === "120.000" && screenAmount === "1,052.00" && screenTotal === "1,052.00"
        && /^S-/.test(doc) && sale["total_amount"] === "1052.00" && sale["received_amount"] === "300.00"
        && sale["outstanding_amount"] === "752.00" && sale["receipt_status"] === "partial" && saleLine?.["rounding_rule"] === "down_1",
      JSON.stringify({ quote: apiQuote.status, q, screenNet, screenAmount, screenTotal, doc, total: sale["total_amount"],
        received: sale["received_amount"], outstanding: sale["outstanding_amount"], status: sale["receipt_status"],
        rule: saleLine?.["rounding_rule"] }));
    check("F2 CONTROL: the same line quoted with NO rule declared differs (the server's default is not down_1) -- so F2 can see a dropped rule",
      defaulted.status === 200 && typeof defaultTotal === "string" && defaultTotal !== "1052.00",
      JSON.stringify({ status: defaulted.status, defaultTotal }));

    // F3 -- a further receipt on the panel
    await page.fill('input[name="receiveAmount"]', "250.00");
    await page.click("[data-receive-save]");
    await page.waitForFunction(() => document.querySelector("[data-outstanding]")?.textContent?.trim() === "502.00", undefined, { timeout: 15_000 })
      .catch(() => undefined);
    const after = await get(`/sales/${saleId}`);
    const shownOutstanding = (await page.locator("[data-outstanding]").innerText()).trim();
    const figures = await page.locator("[data-sale-figures]").innerText();
    const shownMargin = (await page.locator("[data-gross-profit]").innerText()).trim();
    await shot(page, "f3_sale_receipt");
    check("F3 a receipt on the panel: received 550.00, outstanding 502.00 over HTTP and on screen; the margin is กำไรขั้นต้น, the server's figure",
      after["received_amount"] === "550.00" && after["outstanding_amount"] === "502.00" && shownOutstanding === "502.00"
        && figures.includes("กำไรขั้นต้น") && !/กำไรสุทธิ/.test(figures)
        && typeof after["gross_profit"] === "string" && shownMargin.replace(/,/g, "") === after["gross_profit"],
      JSON.stringify({ received: after["received_amount"], outstanding: after["outstanding_amount"], shownOutstanding, shownMargin, gp: after["gross_profit"] }));

    // F4 -- the slip
    await page.click("[data-print]");
    await page.waitForSelector(`[data-sale-slip="${doc}"] .paper`, { timeout: 15_000 });
    const paper = (await page.locator(`[data-sale-slip="${doc}"] .paper > div`).allInnerTexts()).join("\n");
    await shot(page, "f4_sale_slip");
    // The cost, grouped as the slip would print it (a cost of 0.00 is indistinguishable from other zeros, so it is not looked for).
    const cost = typeof after["cost_amount"] === "string" ? after["cost_amount"] : "0.00";
    const costShown = cost !== "0.00" && paper.includes(cost.replace(/\B(?=(\d{3})+\.)/g, ","));
    check("F4 the slip prints the doc_no, the buyer and ค้างรับ 502.00 -- and neither ต้นทุน nor กำไร",
      paper.includes(doc) && paper.includes(buyerName) && /ค้างรับ\s*502\.00/.test(paper) && !paper.includes("ต้นทุน") && !paper.includes("กำไร") && !costShown,
      paper.replace(/\s+/g, " ").slice(0, 300));
    await page.keyboard.press("Escape").catch(() => undefined);

    // F5 -- the report and the category export
    const shopNow = new Date(Date.now() + 7 * 3600_000);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const to = day(shopNow);
    const from = day(new Date(shopNow.getTime() - 6 * 86_400_000));
    await page.click('[data-nav="reports"]');
    await page.click('[data-tab="sales-report"]');
    await page.click('[data-by="product"]');
    await page.click("[data-run-sales-report]");
    await page.waitForSelector("[data-total-gross-profit]", { timeout: 20_000 });
    const screenGp = (await page.locator("[data-total-gross-profit]").getAttribute("data-total-gross-profit")) ?? "";
    const tabText = await page.locator('[data-tab="sales-report"]').innerText();
    const rep = await get(`/reports/sales?from_date=${from}&to_date=${to}&by=product`);
    await shot(page, "f5_sales_report");
    check("F5 the report's total กำไรขั้นต้น equals GET /reports/sales for the same week",
      screenGp === (rep["totals"] as J | undefined)?.["gross_profit"] && tabText.includes("กำไรขั้นต้น"),
      JSON.stringify({ screenGp, api: rep["totals"], tabText }));
    await page.click("[data-export-sales-category]");
    await page.waitForFunction(() => (document.querySelector("[data-sales-report-notice]")?.textContent ?? "").startsWith("บันทึกไฟล์แล้ว"),
      undefined, { timeout: 30_000 }).catch(() => undefined);
    const note = (await page.locator("[data-sales-report-notice]").innerText().catch(() => "")).trim();
    const path = note.replace(/^บันทึกไฟล์แล้ว: /, "").trim();
    const x = path !== "" && existsSync(path) ? readXlsx(path) : null;
    // The expected sheets, from the server: the categories of the week's active sale lines.
    const prods = ((await get("/products?include_inactive=true")).products as J[]);
    const cats = ((await get("/product-categories?include_inactive=true")).product_categories as J[]);
    const week = ((await get(`/sales?from_date=${from}&to_date=${to}&limit=200`)).sales as J[]);
    const expected = new Set<string>();
    for (const s of week) {
      for (const l of ((await get(`/sales/${String(s["id"])}`)).items as J[] | undefined) ?? []) {
        const p = prods.find((pp) => pp["code"] === l["product_code"]);
        expected.add(String(cats.find((c) => c["id"] === p?.["category_id"])?.["name"] ?? "ไม่มีหมวดหมู่"));
      }
    }
    const sheetNames = (x?.sheets ?? []).map((s) => s.name).sort();
    const docRow = x?.sheets.flatMap((s) => Object.entries(s.cells)).find(([, c]) => c.text === doc);
    check("F5 the category export: one declared sheet per category of the week's active lines, titled, the sale's doc_no on a row",
      x !== null && x.zip_ok && x.sheets.every((s) => s.declared && (s.cells["A1"]?.text ?? "").includes("รายการขาย"))
        && JSON.stringify(sheetNames) === JSON.stringify([...expected].sort()) && docRow !== undefined,
      JSON.stringify({ note, sheetNames, expected: [...expected].sort(), docRow: docRow?.[0] }));

    // F6 -- stock, and an adjustment
    await page.click('[data-nav="stock"]');
    await page.waitForSelector("[data-stock]", { timeout: 20_000 });
    const products = ((await get("/products")).products as J[]);
    const code = String(products.find((p) => p["id"] === PRODUCT)?.["code"] ?? "");
    const stockBefore = ((await get("/stock")).items as J[]).find((i) => i["product_id"] === PRODUCT);
    const rowQty = (await page.locator(`[data-stock-row="${code}"] [data-stock-qty]`).innerText()).trim();
    await page.click(`[data-stock-row="${code}"] button.link`);
    await page.waitForSelector(`[data-movements="${code}"]`, { timeout: 15_000 });
    const reason = `นับสต็อกจริง ${run}`;
    await page.fill('input[name="adjustQty"]', "-1.500");
    await page.fill('input[name="adjustReason"]', reason);
    await page.click("[data-adjust-save]");
    await page.waitForSelector("[data-adjust-notice]", { timeout: 15_000 });
    const moves = ((await get(`/stock/movements?product_id=${PRODUCT}`)).movements as J[]);
    const adj = moves.find((m) => m["kind"] === "adjust" && m["reason"] === reason);
    const listedAdj = await page.locator('[data-movement-list] [data-movement="adjust"]').count();
    await shot(page, "f6_stock_adjust");
    const display = (s: string) => s.replace(/^(-?)(\d+)/, (_, sg: string, n: string) => sg + n.replace(/\B(?=(\d{3})+$)/g, ","));
    check("F6 the stock row reads GET /stock's balance; the adjustment saved on screen is a movement (adjust, -1.500, the typed reason)",
      stockBefore !== undefined && rowQty.startsWith(display(String(stockBefore["quantity"]))) && adj?.["quantity"] === "-1.500" && listedAdj >= 1,
      JSON.stringify({ rowQty, api: stockBefore?.["quantity"], adj, listedAdj }));

    // F7 -- void on screen
    await page.click('[data-nav="sales"]');
    await page.click('[data-tab="sales-list"]');
    await page.waitForSelector(`[data-sale="${doc}"]`, { timeout: 20_000 });
    await page.click(`[data-sale="${doc}"] button.link`);
    await page.waitForSelector(`[data-sale-detail="${doc}"]`, { timeout: 15_000 });
    await page.click("[data-void-start]");
    const voidReason = `ผู้ซื้อยกเลิก ${run}`;
    await page.fill('textarea[name="voidReason"]', voidReason);
    await page.click("[data-void-confirm-yes]");
    await page.waitForSelector("[data-voided]", { timeout: 15_000 });
    const voided = await get(`/sales/${saleId}`);
    const ledger = ((await get(`/stock/movements?product_id=${PRODUCT}`)).movements as J[]);
    const saleMove = ledger.find((m) => m["kind"] === "sale" && m["doc_no"] === doc);
    const reversal = ledger.find((m) => m["kind"] === "void_sale" && m["doc_no"] === doc);
    await shot(page, "f7_sale_voided");
    check("F7 the sale voided on screen: voided with its reason over HTTP; the ledger keeps the sale movement and adds its reversal",
      voided["status"] === "voided" && voided["void_reason"] === voidReason && saleMove?.["quantity"] === "-120.000"
        && reversal?.["quantity"] === "120.000",
      JSON.stringify({ status: voided["status"], reason: voided["void_reason"], saleMove, reversal }));
  } finally {
    if (app !== null) await app.close().catch(() => undefined);
    server.proc.kill();
    rmSync(userData, { recursive: true, force: true });
    rmSync(saveDir, { recursive: true, force: true });
  }
});
