/**
 * REPORTS THROUGH THE REAL SCREENS (B7), against a scratch server (a copy of dev, which holds hundreds
 * of bills from the week's proof runs -- the report must read past the 200-row page).
 *
 *   npm run prove:reportsflow
 *
 *   F1 the week's report: the screen's bill count equals this proof's OWN count, paged over HTTP with
 *      the cursor; the screen says how many pages it read, and that is more than one
 *   F2 the screen's total equals the SERVER's /reports/summary paid_total for the same days (an
 *      oracle independent of the client's exact sum)
 *   F3 the exported .xlsx, read by Python's own zip and XML readers: one row per bill plus the header
 *      and the total; a known bill's money cell holds the SERVER's string verbatim under "#,##0.00";
 *      its status cell says ยกเลิกแล้ว; the seller's Thai name intact; the total row holds the screen's total
 *   F4 the sellers list for printing carries no ID number or address (a seller with both, made here);
 *      the saved PDF is a PDF with a page; in print media the navigation is hidden and the list shown
 */
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { _electron, type ElectronApplication, type Page } from "playwright-core";

import { check, DESKTOP_ROOT, finish, header } from "./harness";
import { http, postBill, startScratchServer } from "./scratchServer";
import { formatOf, readXlsx } from "./xlsxReader";

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env["RECYCLE_SHOT_DIR"];
  if (dir !== undefined && dir !== "") await page.screenshot({ path: join(dir, `${name}.png`), fullPage: false });
}

interface Row { id: string; doc_no: string | null; status: string; total_amount: string; seller_name: string | null }

void finish("PROVE_REPORTSFLOW", async () => {
  header("F reports, screen to file");
  const userData = mkdtempSync(join(tmpdir(), "recycle-desktop-reports-"));
  const saveDir = mkdtempSync(join(tmpdir(), "recycle-desktop-saves-"));
  const server = await startScratchServer();
  const { info } = server;
  const run = randomUUID().slice(0, 6);
  let app: ElectronApplication | null = null;
  try {
    const login = await http(info.base, "POST", "/auth/login", undefined, { tenant_id: info.tenant_id, username: info.username, password: info.password });
    const token = (login.json as { access_token: string }).access_token;
    const idNeedle = `3100${run.replace(/\D/g, "5").padEnd(9, "5")}`;
    const addrNeedle = `บ้านลับ ${run}`;
    const seller = await http(info.base, "POST", "/sellers", token, { name: `ผู้ขายรายงาน ${run}`, grade: "B", id_number: idNeedle, address: addrNeedle });
    const sellerId = (seller.json as { id: string }).id;
    const kept = await postBill(info.base, token, sellerId, "r1", run);
    const voided = await postBill(info.base, token, sellerId, "r2", run);
    await http(info.base, "POST", `/bills/${voided}/void`, token, { reason: `รายงานทดสอบ ${run}` });
    const voidedDoc = ((await http(info.base, "GET", `/bills/${voided}`, token)).json as { doc_no: string; total_amount: string });

    // The week the screen opens on (its default preset), computed here in shop time.
    const shopNow = new Date(Date.now() + 7 * 3600_000);
    const day = (d: Date) => d.toISOString().slice(0, 10);
    const to = day(shopNow);
    const from = day(new Date(shopNow.getTime() - 6 * 86_400_000));
    const mine: Row[] = [];
    let cur: string | null = null;
    let myPages = 0;
    for (;;) {
      const q = `/bills?from_date=${from}&to_date=${to}&limit=200&include_voided=true${cur !== null ? `&cursor=${encodeURIComponent(cur)}` : ""}`;
      const r = (await http(info.base, "GET", q, token)).json as { bills: Row[]; next_cursor: string | null };
      mine.push(...r.bills);
      myPages += 1;
      cur = r.next_cursor;
      if (cur === null) break;
    }
    const activeMine = mine.filter((r) => r.status === "active").length;

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
    await page.click('[data-nav="reports"]');
    await page.click("[data-run-report]");
    await page.waitForSelector("[data-totals]", { timeout: 120_000 });
    const count = Number(await page.locator("[data-count]").getAttribute("data-count"));
    const pages = Number(await page.locator("[data-pages]").getAttribute("data-pages"));
    const total = (await page.locator("[data-total]").getAttribute("data-total")) ?? "";
    await shot(page, "b7_report");
    check("F1 the screen's count equals this proof's own paged count, read over more than one page",
      count === activeMine && pages === myPages && pages > 1, JSON.stringify({ count, activeMine, rows: mine.length, pages, myPages }));

    const summary = (await http(info.base, "GET", `/reports/summary?from_date=${from}&to_date=${to}&by=day&state=live`, token)).json as { totals: { paid_total: string; bill_count: number } };
    check("F2 the screen's total equals the server's /reports/summary paid_total for the same days",
      total === summary.totals.paid_total && count === summary.totals.bill_count, JSON.stringify({ total, server: summary.totals }));

    await page.click("[data-export]");
    await page.waitForSelector("[data-report-notice]", { timeout: 30_000 });
    const note = await page.locator("[data-report-notice]").innerText();
    const path = note.replace(/^บันทึกไฟล์แล้ว: /, "").trim();
    const x = existsSync(path) ? readXlsx(path) : null;
    const rowsInFile = x === null ? 0 : Object.keys(x.cells).filter((r) => /^A\d+$/.test(r)).length;
    const ref = x === null ? "" : Object.keys(x.cells).find((r) => /^A\d+$/.test(r) && x.cells[r]?.text === voidedDoc.doc_no) ?? "";
    const n = ref.slice(1);
    const money = x?.cells[`F${n}`];
    const lastRow = String(rowsInFile);
    check("F3 the file: every bill + header + total; the voided bill's money is the server's string under #,##0.00, marked ยกเลิกแล้ว, Thai name intact; the total row holds the screen's total",
      x !== null && x.zip_ok && rowsInFile === mine.length + 2 && money?.text === voidedDoc.total_amount && formatOf(x, money.style) === "#,##0.00"
        && x.cells[`I${n}`]?.text === "ยกเลิกแล้ว" && x.cells[`D${n}`]?.text === `ผู้ขายรายงาน ${run}` && x.cells[`F${lastRow}`]?.text === total,
      JSON.stringify({ path: path.slice(-60), rowsInFile, expected: mine.length + 2, money, total: x?.cells[`F${lastRow}`]?.text }));

    await page.click('[data-tab="print"]');
    await page.click('[data-list="sellers"]');
    await page.waitForSelector('[data-print-area="sellers"]', { timeout: 20_000 });
    const printed = await page.locator("[data-print-area]").innerText();
    await page.emulateMedia({ media: "print" });
    const navHidden = await page.evaluate(() => getComputedStyle(document.querySelector(".shell-nav") as Element).display === "none");
    const areaShown = await page.evaluate(() => getComputedStyle(document.querySelector("[data-print-area]") as Element).display !== "none");
    await shot(page, "b7_print_media");
    await page.emulateMedia({ media: "screen" });
    await page.click("[data-save-pdf]");
    await page.waitForSelector("[data-print-notice]", { timeout: 60_000 });
    const pdfPath = (await page.locator("[data-print-notice]").innerText()).replace(/^บันทึกไฟล์แล้ว: /, "").trim();
    const pdf = existsSync(pdfPath) ? readFileSync(pdfPath) : Buffer.alloc(0);
    const pageObjs = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    await shot(page, "b7_print");
    check("F4 the sellers list has the seller and no ID or address; the PDF is a PDF with a page; print media hides the nav",
      printed.includes(`ผู้ขายรายงาน ${run}`) && !printed.includes(idNeedle) && !printed.includes(addrNeedle)
        && pdf.subarray(0, 5).toString("latin1") === "%PDF-" && pdf.length > 2000 && pageObjs >= 1 && navHidden && areaShown,
      JSON.stringify({ pdf: pdf.length, pageObjs, navHidden, areaShown, kept: kept.slice(0, 8) }));
  } finally {
    const dir = process.env["RECYCLE_SHOT_DIR"];
    if (app !== null && dir !== undefined && dir !== "") await (await app.firstWindow()).screenshot({ path: join(dir, "b7_last_state.png") }).catch(() => undefined);
    if (app !== null) await app.close().catch(() => undefined);
    server.proc.kill();
    rmSync(userData, { recursive: true, force: true });
    rmSync(saveDir, { recursive: true, force: true });
  }
});
