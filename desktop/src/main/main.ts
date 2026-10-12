/**
 * THE DESKTOP'S MAIN PROCESS: one window, the renderer served from app://recycle.
 *
 * Security posture, each line a decision:
 *   - contextIsolation on, sandbox on, nodeIntegration off: the renderer is a web page that
 *     reaches the OS only through the preload's narrow bridge (src/preload/preload.ts).
 *   - The renderer is served from the privileged `app` scheme (src/main/origin.ts) and never
 *     from file:// -- see that file for why the origin matters to the server's CORS list.
 *   - Navigation away from app:// is refused and window.open is denied: a page that could
 *     navigate to an arbitrary origin would carry the session bridge with it.
 *
 * PROOF AND CAPTURE HOOKS, environment-gated and inert otherwise:
 *   RECYCLE_PROOF_WINDOW=1         print `DESKTOP_WINDOW=<json>` once loaded, then quit.
 *   RECYCLE_PROOF_ORIGIN_URL=<url> fetch <url> FROM THE PAGE, print `DESKTOP_FETCH=<json>`, quit.
 *   RECYCLE_CAPTURE=<path.png>     capture the window to <path.png> once loaded, then quit.
 */
import { app, BrowserWindow, net, protocol } from "electron";
import { writeFileSync } from "node:fs";
import { join, normalize, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { registerIpc } from "./ipc";
import { APP_HOST, APP_INDEX_URL, APP_ORIGIN, APP_SCHEME } from "./origin";

// A proof runs each launch in its own fresh userData (config.json and session.bin), never the
// operator's. Set before `ready`, as Electron requires for userData.
const proofUserData = process.env["RECYCLE_USER_DATA"];
if (proofUserData !== undefined && proofUserData !== "") app.setPath("userData", proofUserData);

protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const RENDERER_DIR = join(__dirname, "renderer");

/** Serve dist/renderer/<path> for app://recycle/<path>; anything outside it is a 404. */
function serveRenderer(request: Request): Promise<Response> | Response {
  const url = new URL(request.url);
  if (url.host !== APP_HOST) return new Response("not found", { status: 404 });
  const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  const file = normalize(join(RENDERER_DIR, rel));
  if (!file.startsWith(RENDERER_DIR + sep)) return new Response("not found", { status: 404 });
  return net.fetch(pathToFileURL(file).toString());
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: process.env["RECYCLE_PROOF_WINDOW"] === undefined && process.env["RECYCLE_PROOF_ORIGIN_URL"] === undefined,
    backgroundColor: "#f4f8fc",
    title: "Recycle Online",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on("will-navigate", (event, target) => {
    if (!target.startsWith(`${APP_ORIGIN}/`)) event.preventDefault();
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  return win;
}

async function proofHooks(win: BrowserWindow): Promise<void> {
  const wc = win.webContents;
  if (process.env["RECYCLE_PROOF_WINDOW"] !== undefined) {
    // The first screen depends on an async read of the stored config, so wait (up to 10 s) for
    // the first heading before reading the page.
    const report: unknown = await wc.executeJavaScript(
      `new Promise((resolve) => {
         const t0 = Date.now();
         const look = () => {
           const h1 = document.querySelector('h1');
           if (h1 === null && Date.now() - t0 < 10000) { setTimeout(look, 50); return; }
           resolve({ title: document.title, url: location.href, origin: location.origin,
             heading: h1 ? h1.textContent : null,
             shell: document.querySelector('[data-shell]')?.getAttribute('data-shell') ?? null,
             nav: Array.from(document.querySelectorAll('[data-nav]')).map((n) => n.textContent) });
         };
         look();
       })`,
    );
    process.stdout.write(`DESKTOP_WINDOW=${JSON.stringify(report)}\n`);
    app.quit();
    return;
  }
  const originUrl = process.env["RECYCLE_PROOF_ORIGIN_URL"];
  if (originUrl !== undefined) {
    const result: unknown = await wc.executeJavaScript(
      `fetch(${JSON.stringify(originUrl)}).then(
         (r) => r.text().then((body) => ({ ok: true, status: r.status, body })),
         (e) => ({ ok: false, error: String(e) }))`,
    );
    process.stdout.write(`DESKTOP_FETCH=${JSON.stringify(result)}\n`);
    app.quit();
    return;
  }
  const capture = process.env["RECYCLE_CAPTURE"];
  if (capture !== undefined) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    // capturePage failed ONCE on this box with UnknownVizError and, uncaught, left the window
    // open for ever (measured 2026-10-12, Electron 44.4.5; the retry succeeded). A capture
    // error is reported and the app quits either way.
    try {
      writeFileSync(capture, (await wc.capturePage()).toPNG());
      process.stdout.write(`DESKTOP_CAPTURE=${capture}\n`);
    } catch (err) {
      process.stdout.write(`DESKTOP_CAPTURE_FAILED=${String(err)}\n`);
      process.exitCode = 1;
    }
    app.quit();
  }
}

void app.whenReady().then(async () => {
  protocol.handle(APP_SCHEME, serveRenderer);
  registerIpc();
  const win = createWindow();
  win.webContents.once("did-finish-load", () => {
    void proofHooks(win);
  });
  await win.loadURL(APP_INDEX_URL);
});

app.on("window-all-closed", () => app.quit());
