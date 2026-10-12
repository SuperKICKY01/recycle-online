/**
 * DESKTOP SIGN-IN, AGAINST A REAL SERVER (B2, ROADMAP P1.14) — driven through the real screens.
 *
 *   npm run prove:signin
 *
 * Starts server/scripts/scratch_server.py (a fresh scratch, a per-run admin user, uvicorn with a
 * 30-second token lifetime) and drives the BUILT app with Playwright's Electron driver, typing
 * into the same fields a person types into. A fresh userData directory per run.
 *
 *   S1 first run: the setup screen
 *   S2 an unknown shop code is refused with the shop sentence
 *   S3 the real code: the sign-in screen names the shop
 *   S4 a wrong password: the one generic refusal sentence
 *   S5 the right password: the shell, with the user named in its footer
 *   S6 WHERE THE TOKEN IS (D-3): no key in localStorage or sessionStorage, no IndexedDB database;
 *      session.bin exists and holds no JWT text (no "eyJ"); config.json holds no JWT text
 *   S7 a relaunch lands straight in the shell (the token came back from the OS-backed store)
 *   S8 sign-out: the sign-in screen says so, and session.bin is gone
 *   S9 EXPIRY: sign in, let the 30 s token lapse, come back to the window -> the sign-in screen
 *      with the expiry sentence, and session.bin gone
 *   S10 NO LOOP: in the 12 s after that, the server logs no further 401 from this program
 *   S11 OFFLINE AT START-UP: signed in, closed, server stopped, relaunched -> the OFFLINE screen
 *       with the network sentence (not the sign-in screen), and session.bin KEPT
 *   (S5's menu, S6's encodings and S11 answer the red team of 2026-10-12, findings 4, 2 and 1.)
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { _electron, type ElectronApplication, type Page } from "playwright-core";

import { SESSION_TEXT } from "../shared/session";
import { check, DESKTOP_ROOT, finish, header } from "./harness";

const SERVER_DIR = join(DESKTOP_ROOT, "..", "server");
const TTL_SECONDS = 30;

interface ScratchInfo { base: string; shop_code: string; username: string; password: string; database: string }

function startScratchServer(): Promise<{ proc: ChildProcess; info: ScratchInfo; log: () => string }> {
  const python = join(SERVER_DIR, ".venv", "Scripts", "python.exe");
  const proc = spawn(python, ["scripts/scratch_server.py", "--ttl", String(TTL_SECONDS)], {
    cwd: SERVER_DIR, env: { ...process.env, PYTHONUTF8: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`scratch server gave no SCRATCH_SERVER line: ${out.slice(-600)}`)), 240_000);
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

async function launch(userData: string): Promise<{ app: ElectronApplication; page: Page }> {
  // In a node context `require("electron")` is the path to the Electron binary.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const executablePath = require("electron") as unknown as string;
  const app = await _electron.launch({
    executablePath, args: [DESKTOP_ROOT],
    env: { ...process.env, RECYCLE_USER_DATA: userData } as Record<string, string>,
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page };
}

async function text(page: Page): Promise<string> {
  return page.evaluate(() => document.body.innerText);
}

async function waitText(page: Page, needle: string, ms = 15_000): Promise<boolean> {
  try {
    await page.waitForFunction((n) => document.body.innerText.includes(n), needle, { timeout: ms });
    return true;
  } catch {
    return false;
  }
}

const count401 = (log: string): number => (log.match(/" 401 /g) ?? []).length;

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) out.push(...filesUnder(p));
    else out.push(p);
  }
  return out;
}

void finish("PROVE_SIGNIN", async () => {
  header("S a real sign-in, through the real screens, against a scratch server");
  const userData = mkdtempSync(join(tmpdir(), "recycle-desktop-proof-"));
  const server = await startScratchServer();
  const { info } = server;
  let app: ElectronApplication | null = null;
  try {
    let page: Page;
    ({ app, page } = await launch(userData));
    check("S1 first run shows the setup screen", await waitText(page, "ตั้งค่าเครื่องนี้"), (await text(page)).slice(0, 120));

    await page.fill('input[name="apiBase"]', info.base);
    await page.fill('input[name="shopCode"]', "ZZZZZZZZ");
    await page.click('button[type="submit"]');
    check("S2 an unknown shop code is refused with the shop sentence", await waitText(page, SESSION_TEXT.unknownShop));

    await page.fill('input[name="shopCode"]', info.shop_code);
    await page.click('button[type="submit"]');
    check("S3 the real code leads to sign-in, naming the shop", await waitText(page, `ร้านรหัส ${info.shop_code}`));

    await page.fill('input[name="username"]', info.username);
    await page.fill('input[name="password"]', `${info.password}-wrong`);
    await page.click('button[type="submit"]');
    check("S4 a wrong password shows the one generic sentence", await waitText(page, SESSION_TEXT.badCredentials));

    await page.fill('input[name="username"]', info.username);
    await page.fill('input[name="password"]', info.password);
    await page.click('button[type="submit"]');
    const signedIn = await page.waitForSelector(`[data-signed-in="${info.username}"]`, { timeout: 15_000 }).then(() => true, () => false);
    const shell = await page.evaluate(() => ({
      frame: document.querySelector("[data-shell]")?.getAttribute("data-shell") ?? null,
      nav: Array.from(document.querySelectorAll("[data-nav]")).map((n) => n.textContent),
    }));
    check("S5 the right password opens the shell with its Thai menu, the user named in its footer",
      signedIn && shell.frame === "nav-content" && shell.nav.includes("บิลรับซื้อ"), JSON.stringify(shell));

    const storage = await page.evaluate(async () => ({
      local: Object.keys(localStorage).length,
      session: Object.keys(sessionStorage).length,
      idb: (await indexedDB.databases()).length,
    }));
    const bin = join(userData, "session.bin");
    const binText = existsSync(bin) ? readFileSync(bin).toString("latin1") : "";
    const cfg = existsSync(join(userData, "config.json")) ? readFileSync(join(userData, "config.json"), "utf8") : "";
    check("S6 no web storage holds anything (localStorage, sessionStorage, IndexedDB)",
      storage.local === 0 && storage.session === 0 && storage.idb === 0, JSON.stringify(storage));
    // A JWT always begins with "eyJ" (base64url of '{"'). Searched for in EVERY file under the
    // whole userData directory, in three encodings a plain store could use -- UTF-8 text, UTF-16LE,
    // and hex -- and session.bin must carry Chromium's os_crypt ciphertext marker "v10". Read
    // AFTER the app closes: while it runs Chromium holds some of its own files locked (EBUSY,
    // measured), and a file that could not be read would be a file that was not checked.
    await app.close();
    const needles = [Buffer.from("eyJ", "utf8"), Buffer.from("eyJ", "utf16le"), Buffer.from(Buffer.from("eyJ").toString("hex"))];
    const scanned = filesUnder(userData);
    const leaks = scanned.filter((f) => {
      const b = readFileSync(f);
      return needles.some((n) => b.includes(n));
    });
    const head = existsSync(bin) ? readFileSync(bin).subarray(0, 3).toString("latin1") : "";
    check("S6 session.bin is os_crypt ciphertext (starts v10); no file under userData holds the token's text",
      head === "v10" && leaks.length === 0 && cfg.length > 0 && scanned.length > 2,
      `head=${JSON.stringify(head)} session.bin ${String(binText.length)} bytes; files scanned=${String(scanned.length)}; leaks=${JSON.stringify(leaks)}`);

    ({ app, page } = await launch(userData));
    const resumed = await page.waitForSelector(`[data-signed-in="${info.username}"]`, { timeout: 15_000 }).then(() => true, () => false);
    check("S7 a relaunch lands in the shell: the token came back from the OS-backed store", resumed);

    await page.click("text=ออกจากระบบ");
    check("S8 sign-out shows the sign-in screen with its sentence, and session.bin is gone",
      (await waitText(page, SESSION_TEXT.signedOut)) && !existsSync(bin));

    header("S9-S10 expiry, and no loop after it");
    await page.fill('input[name="username"]', info.username);
    await page.fill('input[name="password"]', info.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector(`[data-signed-in="${info.username}"]`, { timeout: 15_000 });
    await new Promise((r) => setTimeout(r, (TTL_SECONDS + 3) * 1000));
    const before = count401(server.log());
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const expired = await waitText(page, SESSION_TEXT.expired);
    check("S9 after the token lapses, coming back to the window shows the expiry sentence; session.bin gone",
      expired && !existsSync(bin), `on screen: ${(await text(page)).slice(0, 160)}`);
    const atExpiry = count401(server.log());
    await new Promise((r) => setTimeout(r, 12_000));
    const after = count401(server.log());
    check("S10 the expiry cost ONE 401, and the next 12 s brought none", atExpiry - before === 1 && after === atExpiry,
      `401s: before=${String(before)} at expiry=${String(atExpiry)} after 12 s=${String(after)}`);

    header("S11 offline at start-up");
    await page.fill('input[name="username"]', info.username);
    await page.fill('input[name="password"]', info.password);
    await page.click('button[type="submit"]');
    await page.waitForSelector(`[data-signed-in="${info.username}"]`, { timeout: 15_000 });
    await app.close();
    server.proc.kill();
    await new Promise((r) => setTimeout(r, 1500));
    ({ app, page } = await launch(userData));
    const offline = await waitText(page, SESSION_TEXT.offline);
    const onScreen = await text(page);
    check("S11 a relaunch with the server gone shows the OFFLINE screen and its sentence, not sign-in; session.bin kept",
      offline && onScreen.includes("ติดต่อเซิร์ฟเวอร์ไม่ได้") && !onScreen.includes("ชื่อผู้ใช้") && existsSync(bin),
      onScreen.slice(0, 200));
  } finally {
    if (app !== null) await app.close().catch(() => undefined);
    server.proc.kill();
    rmSync(userData, { recursive: true, force: true });
  }
});
