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
 *
 * RECYCLE_SHOT_DIR set: the window is saved there as PNGs at the list, the detail and after the void
 * (for the milestone report; the proof's verdict never reads them).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { _electron, type ElectronApplication, type Page } from "playwright-core";

import { check, DESKTOP_ROOT, finish, header } from "./harness";

const SERVER_DIR = join(DESKTOP_ROOT, "..", "server");

interface ScratchInfo { base: string; shop_code: string; tenant_id: string; username: string; password: string }

function startScratchServer(): Promise<{ proc: ChildProcess; info: ScratchInfo; log: () => string }> {
  const python = join(SERVER_DIR, ".venv", "Scripts", "python.exe");
  const proc = spawn(python, ["scripts/scratch_server.py"], {
    cwd: SERVER_DIR, env: { ...process.env, PYTHONUTF8: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no SCRATCH_SERVER line: ${out.slice(-600)}`)), 240_000);
    const onData = (d: Buffer) => {
      out += d.toString("utf8");
      const line = out.split(/\r?\n/).find((l) => l.startsWith("SCRATCH_SERVER="));
      if (line !== undefined && out.includes("Uvicorn running")) {
        clearTimeout(timer);
        resolve({ proc, info: JSON.parse(line.slice("SCRATCH_SERVER=".length)) as ScratchInfo, log: () => out });
      }
    };
    proc.stdout?.on("data", onData);
    proc.stderr?.on("data", onData);
    proc.on("exit", (code) => { clearTimeout(timer); reject(new Error(`scratch server exited ${String(code)}: ${out.slice(-600)}`)); });
  });
}

async function http(base: string, method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== undefined) headers["authorization"] = `Bearer ${token}`;
  const r = await fetch(`${base}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, json: await r.json().catch(() => null) };
}

const S001 = "aaaa0000-0000-0000-0000-0000000000a4";
const S002 = "aaaa0000-0000-0000-0000-0000000000a7";
const PRODUCT = "aaaa0000-0000-0000-0000-0000000000a3";

async function postBill(base: string, token: string, seller: string, tag: string, run: string): Promise<string> {
  const id = randomUUID();
  const r = await http(base, "POST", "/bills", token, {
    id, seller_id: seller, vehicle_no: `FLOW-${tag}`, device_created_at: new Date().toISOString(),
    idempotency_key: `billsflow-${run}-${tag}`,
    items: [{ id: randomUUID(), product_id: PRODUCT, line_no: 1, gross_weight: "1250.000", tare_weight: "50.000",
      net_weight: "1200.000", unit_price: "15.00" }],
  });
  if (r.status !== 201) throw new Error(`POST /bills ${tag} -> ${String(r.status)} ${JSON.stringify(r.json)}`);
  return id;
}

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
    await page.waitForSelector(`[data-bill="${docA1}"]`, { state: "detached", timeout: 15_000 });
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
  } finally {
    if (app !== null) await app.close().catch(() => undefined);
    server.proc.kill();
    rmSync(userData, { recursive: true, force: true });
  }
});
