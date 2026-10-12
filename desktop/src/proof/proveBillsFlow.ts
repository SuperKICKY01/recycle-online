/**
 * THE BILLS SCREEN AGAINST A REAL SERVER (B3), driven through the real screen.
 *
 *   npm run prove:billsflow
 *
 * server/scripts/scratch_server.py serves a fresh scratch with a per-run admin; this proof posts
 * three bills through the REAL POST /bills (two for S001, one for S002), then signs in through the
 * app and works the bills screen as a person would.
 *
 *   B1 today's list shows the three fixture bills, with seller code and name and grouped money
 *   B2 the seller filter (S002) leaves exactly its one fixture bill
 *   B3 opening a bill shows its seller's name and its lines
 *   B4 confirming a void with an EMPTY reason shows the sentence and sends NO void request
 *   B5 a void with a reason: the panel shows ยกเลิกแล้ว and the reason, and the void form is GONE
 *      (no confirm button left on a voided bill -- the first build kept it open)
 *   B6 READ BACK OVER HTTP: GET /bills/{id} says voided with that reason, and the list with
 *      include_voided still has the row (hard rule 5: voided, never deleted)
 *   B7 the default list no longer shows it; "แสดงบิลที่ยกเลิกแล้ว" brings it back, struck through
 *   B8 a reversed range typed into the date fields: the screen's own sentence, NO request sent, and
 *      the shell does not call it a network fault (red team 2026-10-12, finding 1)
 *   B9 the server gone: a new range shows NO bills and NO count from the range before it, and says
 *      the load failed (finding 2)
 *   B10 someone else voids the bill while its void form is open: the confirm is refused (409), the
 *      panel says so and shows THEIR reason; over HTTP the bill still carries their reason
 *      (ADVISOR-DECIDED 2026-10-12: a void record is never overwritten)
 * B4's request counter has a POSITIVE CONTROL: the real void in B5 must move it by exactly one.
 *
 * RECYCLE_SHOT_DIR set: the window is saved there as PNGs at the list, the detail and after the void
 * (for the milestone report; the proof's verdict never reads them).
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { _electron, type ElectronApplication, type Page } from "playwright-core";

import { check, DESKTOP_ROOT, finish, header } from "./harness";
import { http, postBill, S001, S002, startScratchServer } from "./scratchServer";

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env["RECYCLE_SHOT_DIR"];
  if (dir !== undefined && dir !== "") await page.screenshot({ path: join(dir, `${name}.png`) });
}

async function textOf(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

void finish("PROVE_BILLSFLOW", async () => {
  header("B the bills screen, against a scratch server");
  const userData = mkdtempSync(join(tmpdir(), "recycle-desktop-bills-"));
  const server = await startScratchServer();
  const { info } = server;
  const run = randomUUID().slice(0, 8);
  let app: ElectronApplication | null = null;
  try {
    const login = await http(info.base, "POST", "/auth/login", undefined,
      { tenant_id: info.tenant_id, username: info.username, password: info.password });
    const token = (login.json as { access_token: string }).access_token;
    const a1 = await postBill(info.base, token, S001, "a1", run);
    const a2 = await postBill(info.base, token, S001, "a2", run);
    const b1 = await postBill(info.base, token, S002, "b1", run);
    const docs = await Promise.all([a1, a2, b1].map(async (id) =>
      ((await http(info.base, "GET", `/bills/${id}`, token)).json as { doc_no: string }).doc_no));
    const [docA1, docA2, docB1] = docs as [string, string, string];

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const executablePath = require("electron") as unknown as string;
    app = await _electron.launch({ executablePath, args: [DESKTOP_ROOT],
      env: { ...process.env, RECYCLE_USER_DATA: userData } as Record<string, string> });
    const page = await app.firstWindow();
    await page.fill('input[name="apiBase"]', info.base);
    await page.fill('input[name="shopCode"]', info.shop_code);
    await page.click('button[type="submit"]');
    await page.fill('input[name="username"]', info.username);
    await page.fill('input[name="password"]', info.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector('[data-screen="bills"]', { timeout: 20_000 });
    await page.waitForSelector(`[data-bill="${docB1}"]`, { timeout: 20_000 });

    const rowText = async (doc: string) => page.locator(`[data-bill="${doc}"]`).innerText();
    await shot(page, "b3_list");
    const rowA1 = await rowText(docA1);
    check("B1 today's list shows the three fixture bills with seller code, name and grouped money",
      (await page.locator(`[data-bill="${docA2}"]`).count()) === 1 && rowA1.includes("S001") && rowA1.includes("สมชาย ใจดี")
        && rowA1.includes("18,000.00"), rowA1.replace(/\s+/g, " "));

    await page.selectOption('select[name="seller"]', S002);
    // The table empties while the filtered list loads (rows belong to their own query), so wait for
    // the ANSWER -- the S002 bill present -- not merely for the S001 rows to go.
    await page.waitForSelector(`[data-bill="${docB1}"]`, { timeout: 15_000 });
    const afterFilter = await page.locator("[data-bill]").evaluateAll((els) => els.map((e) => e.getAttribute("data-bill")));
    check("B2 the seller filter S002 leaves exactly its fixture bill (no S001 bill)",
      afterFilter.includes(docB1) && !afterFilter.includes(docA1) && !afterFilter.includes(docA2), JSON.stringify(afterFilter));
    await page.selectOption('select[name="seller"]', "");
    await page.waitForSelector(`[data-bill="${docA1}"]`, { timeout: 15_000 });

    await page.click(`[data-bill="${docA2}"] button.link`);
    await page.waitForSelector(`[data-detail="${docA2}"]`, { timeout: 15_000 });
    await shot(page, "b3_detail");
    const detail = await page.locator(`[data-detail="${docA2}"]`).innerText();
    check("B3 the detail shows the seller's name and the bill's line", detail.includes("สมชาย ใจดี") && detail.includes("1,200.000"),
      detail.replace(/\s+/g, " ").slice(0, 200));

    const voidPosts = (): number => (server.log().match(/POST \/bills\/[^ ]+\/void/g) ?? []).length;
    await page.click("text=ยกเลิกบิลนี้");
    const beforeEmpty = voidPosts();
    await page.click("text=ยืนยันยกเลิกบิล");
    const refused = await page.waitForSelector("text=ต้องระบุเหตุผลที่ยกเลิกบิล", { timeout: 5_000 }).then(() => true, () => false);
    await new Promise((r) => setTimeout(r, 1000));
    await shot(page, "b3_void_empty_reason");
    check("B4 an empty reason shows the sentence and sends no void request", refused && voidPosts() === beforeEmpty,
      `void POSTs before=${String(beforeEmpty)} after=${String(voidPosts())}`);

    const reason = `ชั่งผิดรายการ ${run}`;
    await page.fill('textarea[name="voidReason"]', reason);
    await page.click("text=ยืนยันยกเลิกบิล");
    const shown = await page.waitForSelector(`[data-void-reason="${reason}"]`, { timeout: 15_000 }).then(() => true, () => false);
    await shot(page, "b3_voided");
    const confirmsLeft = await page.locator("text=ยืนยันยกเลิกบิล").count();
    check("B5 the panel shows ยกเลิกแล้ว with the reason, and no void form remains",
      shown && (await textOf(page)).includes("ยกเลิกแล้ว") && confirmsLeft === 0, `confirm buttons left: ${String(confirmsLeft)}`);
    check("B4 control: the counter SEES a void request -- the real void moved it by exactly one",
      voidPosts() === beforeEmpty + 1, `void POSTs: ${String(beforeEmpty)} -> ${String(voidPosts())}`);

    const back = await http(info.base, "GET", `/bills/${a2}`, token);
    const bj = back.json as { status?: string; void_reason?: string };
    const today = (await page.locator("[data-range]").getAttribute("data-range"))?.split("..")[0] ?? "";
    const listV = await http(info.base, "GET", `/bills?from_date=${today}&to_date=${today}&include_voided=true&limit=200`, token);
    const stillRow = ((listV.json as { bills: { id: string; status: string; void_reason: string | null }[] }).bills).find((b) => b.id === a2);
    check("B6 over HTTP: the bill reads back voided with the reason, and the row is still listed with include_voided",
      back.status === 200 && bj.status === "voided" && bj.void_reason === reason && stillRow?.status === "voided"
        && stillRow.void_reason === reason, JSON.stringify({ status: bj.status, reason: bj.void_reason, listed: stillRow?.status }));

    await page.waitForSelector(`[data-bill="${docA2}"]`, { state: "detached", timeout: 15_000 });
    const goneByDefault = (await page.locator(`[data-bill="${docA2}"]`).count()) === 0;
    await page.check('input[name="includeVoided"]');
    await page.waitForSelector(`[data-bill="${docA2}"]`, { timeout: 15_000 });
    const struck = await page.locator(`[data-bill="${docA2}"]`).getAttribute("class");
    check("B7 gone from the default list; the voided toggle brings it back, struck through",
      goneByDefault && struck === "row-voided", `class=${String(struck)}`);

    // B10: voided elsewhere while the form is open
    await page.click(`[data-bill="${docB1}"] button.link`);
    await page.waitForSelector(`[data-detail="${docB1}"]`, { timeout: 15_000 });
    await page.click("text=ยกเลิกบิลนี้");
    const theirs = `ยกเลิกจากโทรศัพท์ ${run}`;
    const elsewhere = await http(info.base, "POST", `/bills/${b1}/void`, token, { reason: theirs });
    await page.fill('textarea[name="voidReason"]', `เหตุผลจากเดสก์ท็อป ${run}`);
    await page.click("text=ยืนยันยกเลิกบิล");
    const told = await page.waitForSelector("[data-void-already]", { timeout: 15_000 }).then(() => true, () => false);
    const shownReason = await page.locator(`[data-detail="${docB1}"] [data-void-reason]`).getAttribute("data-void-reason").catch(() => null);
    const stored = (await http(info.base, "GET", `/bills/${b1}`, token)).json as { void_reason?: string };
    await shot(page, "b3_voided_elsewhere");
    check("B10 voided elsewhere first: the screen says so and shows THEIR reason; the stored reason is theirs",
      elsewhere.status === 200 && told && shownReason === theirs && stored.void_reason === theirs,
      JSON.stringify({ elsewhere: elsewhere.status, told, shownReason, stored: stored.void_reason }));

    const listGets = (): number => (server.log().match(/GET \/bills\?[^ ]*from_date/g) ?? []).length;
    const before8 = listGets();
    const shell8 = await page.locator(".shell-notice").count();
    await page.fill('input[name="from"]', "2026-10-20");
    await page.fill('input[name="to"]', "2026-10-05");
    const said8 = await page.waitForSelector("text=วันที่สิ้นสุดต้องไม่ก่อนวันที่เริ่มต้น", { timeout: 5_000 }).then(() => true, () => false);
    await new Promise((r) => setTimeout(r, 1000));
    const offline8 = (await textOf(page)).includes("ติดต่อเซิร์ฟเวอร์ไม่ได้");
    await shot(page, "b3_reversed_range");
    check("B8 a reversed range: the screen's sentence, no list request for it, no network line in the shell",
      said8 && !offline8 && (await page.locator("[data-bill]").count()) === 0 && listGets() === before8 && shell8 === 0,
      JSON.stringify({ said8, offline8, gets: listGets() - before8 }));

    await page.click("text=วันนี้");
    await page.waitForSelector(`[data-bill="${docA1}"]`, { timeout: 15_000 });
    server.proc.kill();
    await new Promise((r) => setTimeout(r, 1500));
    await page.click("text=เมื่อวาน");
    const failed = await page.waitForSelector('[data-list-state="failed"]', { timeout: 20_000 }).then(() => true, () => false);
    const staleRows = await page.locator("[data-bill]").count();
    const label = await page.locator("[data-range]").innerText();
    await shot(page, "b3_load_failed");
    check("B9 server gone: the new range shows no bills and no count from the old one, and says the load failed",
      failed && staleRows === 0 && !label.includes("บิล"), JSON.stringify({ failed, staleRows, label }));
  } finally {
    if (app !== null) await app.close().catch(() => undefined);
    server.proc.kill();
    rmSync(userData, { recursive: true, force: true });
  }
});
