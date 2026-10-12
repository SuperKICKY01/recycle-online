/**
 * AN ELECTRON WINDOW RENDERS FROM desktop/ (P1.13 DONE WHEN), served from app://recycle.
 *
 *   npm run prove:window
 *
 * Launches the BUILT app (dist/main.cjs) with RECYCLE_PROOF_WINDOW=1; the main process reads
 * the loaded page and prints `DESKTOP_WINDOW=<json>`, then quits.
 *   W1 the app exited by itself and printed its report
 *   W2 the page is app://recycle/index.html, origin app://recycle (never file://)
 *   W3 a FIRST run (fresh userData) opens the setup screen, in Thai — the shell itself is
 *      asserted after a real sign-in, by prove:signin S5
 *   W4 the window title is the program's
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { check, finish, header, readLine, runElectron } from "./harness";

interface WindowReport {
  title: string;
  url: string;
  origin: string;
  heading: string | null;
  shell: string | null;
  nav: string[];
}

void finish("PROVE_WINDOW", async () => {
  header("W the built app opens one window from app://recycle and renders the shell");
  const userData = mkdtempSync(join(tmpdir(), "recycle-desktop-window-"));
  const { code, out } = await runElectron({ RECYCLE_PROOF_WINDOW: "1", RECYCLE_USER_DATA: userData });
  rmSync(userData, { recursive: true, force: true });
  const report = readLine(out, "DESKTOP_WINDOW") as WindowReport | null;
  check("W1 Electron exited 0 after printing DESKTOP_WINDOW", code === 0 && report !== null,
    `exit=${String(code)} out=${out.slice(0, 300)}`);
  check("W2 the page is app://recycle/index.html with origin app://recycle",
    report?.url === "app://recycle/index.html" && report.origin === "app://recycle", JSON.stringify(report));
  check("W3 a first run opens the setup screen (ตั้งค่าเครื่องนี้)", report?.heading === "ตั้งค่าเครื่องนี้",
    String(report?.heading));
  check("W4 the window title is the program's", report?.title === "Recycle Online — สำนักงาน", String(report?.title));
});
