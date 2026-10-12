/**
 * THE SLIP, THROUGH THE REAL SCREENS (B4, ROADMAP P1.17), against a scratch server and a FAKE
 * network printer on 127.0.0.1 that records every byte it is sent.
 *
 *   npm run prove:slipflow
 *
 *   F1 the printer screen saves 127.0.0.1:<port> and its test page arrives: ESC t for the default
 *      and each candidate code page
 *   F2 a bill's "พิมพ์สลิป" shows a preview carrying its doc_no and a Buddhist-era date (25xx)
 *   F3 "ส่งไปเครื่องพิมพ์": the printer receives the slip -- decoded independently (windows-874), its
 *      lines carry the doc_no, the same date, the seller and the total, and, spaces aside, they are
 *      the preview's lines in the same order
 *   F4 the screen says the slip was SENT (SEND_TEXT.sent), not that it printed
 *   F5 a voided bill: the slip view refuses with its sentence, offers no send, and the printer
 *      receives nothing
 *   F6 the printer switched off: the screen says the printer refused, and nothing claims success
 *
 * Not here: a bill with no doc_no (the server gives every bill one; prove:slip R1 holds the rule),
 * and paper -- a real print is the operator's.
 */
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type AddressInfo, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { _electron, type ElectronApplication, type Page } from "playwright-core";

import { SEND_TEXT } from "../shared/slip";
import { decode874, parseEscPos } from "./escposReader";
import { check, DESKTOP_ROOT, finish, header } from "./harness";
import { http, postBill, S001, startScratchServer } from "./scratchServer";

function fakePrinter(): Promise<{ server: Server; port: number; take: () => Buffer }> {
  let chunks: Buffer[] = [];
  const server = createServer((sock) => sock.on("data", (d: Buffer) => chunks.push(d)));
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({
    server, port: (server.address() as AddressInfo).port,
    take: () => { const b = Buffer.concat(chunks); chunks = []; return b; },
  })));
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const squash = (s: string): string => s.replace(/\s+/g, " ").trim();

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env["RECYCLE_SHOT_DIR"];
  if (dir !== undefined && dir !== "") await page.screenshot({ path: join(dir, `${name}.png`) });
}

async function openBill(page: Page, doc: string): Promise<void> {
  await page.waitForSelector(`[data-bill="${doc}"]`, { timeout: 20_000 });
  await page.click(`[data-bill="${doc}"] button.link`);
  await page.waitForSelector(`[data-detail="${doc}"]`, { timeout: 15_000 });
}

void finish("PROVE_SLIPFLOW", async () => {
  header("F the slip, screen to printer");
  const userData = mkdtempSync(join(tmpdir(), "recycle-desktop-slip-"));
  const printer = await fakePrinter();
  const server = await startScratchServer();
  const { info } = server;
  const run = randomUUID().slice(0, 8);
  let app: ElectronApplication | null = null;
  try {
    const login = await http(info.base, "POST", "/auth/login", undefined,
      { tenant_id: info.tenant_id, username: info.username, password: info.password });
    const token = (login.json as { access_token: string }).access_token;
    const live = await postBill(info.base, token, S001, "p1", run);
    const doomed = await postBill(info.base, token, S001, "p2", run);
    const docOf = async (id: string) => ((await http(info.base, "GET", `/bills/${id}`, token)).json as { doc_no: string }).doc_no;
    const docLive = await docOf(live);
    const docDoomed = await docOf(doomed);

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

    // F1: the printer screen
    await page.click('[data-nav="printer"]');
    await page.waitForSelector('[data-screen="printer"]', { timeout: 10_000 });
    await page.fill('input[name="printerHost"]', "127.0.0.1");
    await page.fill('input[name="printerPort"]', String(printer.port));
    await page.click("text=บันทึกและพิมพ์หน้าทดสอบ");
    await page.waitForSelector("[data-printer-result]", { timeout: 15_000 });
    await wait(300);
    const test = parseEscPos(new Uint8Array(printer.take()));
    const selects = test.commands.filter((c) => c.startsWith("1b 74")).length;
    await shot(page, "b4_printer");
    check("F1 settings saved; the test page arrived with 8 code-page selects (the default and 7 candidates)",
      selects === 8 && test.lines.map(decode874).some((l) => l.startsWith("n=26 ")), `selects=${String(selects)}`);

    // F2: the preview
    await page.click('[data-nav="bills"]');
    await openBill(page, docLive);
    await page.click("text=พิมพ์สลิป");
    await page.waitForSelector(`[data-slip="${docLive}"] .paper`, { timeout: 15_000 });
    const rows = await page.locator(`[data-slip="${docLive}"] .paper > div`).evaluateAll((els) => els.map((e) => (e as HTMLElement).innerText));
    const previewText = rows.join("\n");
    const dateMatch = /\d{2}\/\d{2}\/25\d{2} \d{2}:\d{2}/.exec(previewText);
    await shot(page, "b4_preview");
    check("F2 the preview carries the doc_no and a Buddhist-era date", previewText.includes(docLive) && dateMatch !== null,
      squash(previewText).slice(0, 160));

    // F3, F4: the send
    await page.click("text=ส่งไปเครื่องพิมพ์");
    await page.waitForSelector("[data-send-result]", { timeout: 15_000 });
    await wait(300);
    const sentBytes = new Uint8Array(printer.take());
    const lines = parseEscPos(sentBytes).lines.map(decode874);
    const decoded = lines.join("\n");
    const previewSquashed = rows.map(squash).filter((r) => r !== "" && !/^-+$/.test(r));
    const printedSquashed = lines.map(squash).filter((r) => r !== "" && !/^-+$/.test(r));
    // the preview wraps by the window, the printer by columns: compare the words in order
    const sameWords = squash(previewSquashed.join(" ")) === squash(printedSquashed.join(" "));
    check("F3 the printer received the slip: doc_no, the same date, seller, total -- and the preview's words in order",
      sentBytes.length > 100 && decoded.includes(docLive) && dateMatch !== null && decoded.includes(dateMatch[0])
        && decoded.includes("สมชาย ใจดี") && decoded.includes("18,000.00") && sameWords,
      JSON.stringify({ bytes: sentBytes.length, sameWords, first: printedSquashed.slice(0, 3) }));
    const said = await page.locator("[data-send-result]").innerText();
    await shot(page, "b4_sent");
    check("F4 the screen says sent, and asks the operator to look", said === SEND_TEXT["sent"], said);

    // F5: a voided bill
    const v = await http(info.base, "POST", `/bills/${doomed}/void`, token, { reason: `slip proof ${run}` });
    await page.click("text=กลับ");
    await page.click('[data-nav="printer"]');
    await page.click('[data-nav="bills"]');
    await page.check('input[name="includeVoided"]');
    await openBill(page, docDoomed);
    await page.click("text=พิมพ์สลิป");
    const refused = await page.waitForSelector("[data-slip-refused]", { timeout: 10_000 }).then(() => true, () => false);
    const sendButtons = await page.locator("text=ส่งไปเครื่องพิมพ์").count();
    await wait(300);
    const leaked = printer.take().length;
    await shot(page, "b4_voided_refused");
    check("F5 a voided bill: the refusal sentence, no send button, nothing reaches the printer",
      v.status === 200 && refused && sendButtons === 0 && leaked === 0, JSON.stringify({ void: v.status, refused, sendButtons, leaked }));

    // F6: the printer is off
    await new Promise((r) => printer.server.close(r));
    await page.click("text=กลับ");
    await openBill(page, docLive);
    await page.click("text=พิมพ์สลิป");
    await page.waitForSelector(`[data-slip="${docLive}"] .paper`, { timeout: 15_000 });
    await page.click("text=ส่งไปเครื่องพิมพ์");
    await page.waitForSelector("[data-send-result]", { timeout: 15_000 });
    const off = await page.locator("[data-send-result]").innerText();
    check("F6 the printer off: the screen says it refused, and does not say sent", off === SEND_TEXT["refused"], off);
  } finally {
    if (app !== null) await app.close().catch(() => undefined);
    server.proc.kill();
    printer.server.close();
    rmSync(userData, { recursive: true, force: true });
  }
});
