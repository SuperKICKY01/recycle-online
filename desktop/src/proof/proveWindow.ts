/**
 * AN ELECTRON WINDOW RENDERS FROM desktop/ (P1.13 DONE WHEN), served from app://recycle.
 *
 *   npm run prove:window
 *
 * Launches the BUILT app (dist/main.cjs) with RECYCLE_PROOF_WINDOW=1; the main process reads
 * the loaded page and prints `DESKTOP_WINDOW=<json>`, then quits.
 *   W1 the app exited by itself and printed its report
 *   W2 the page is app://recycle/index.html, origin app://recycle (never file://)
 *   W3 the shell rendered (data-shell="nav-content") with its navigation, in Thai
 *   W4 the window title is the program's
 */
import { check, finish, header, readLine, runElectron } from "./harness";

interface WindowReport {
  title: string;
  url: string;
  origin: string;
  shell: string | null;
  nav: string[];
}

void finish("PROVE_WINDOW", async () => {
  header("W the built app opens one window from app://recycle and renders the shell");
  const { code, out } = await runElectron({ RECYCLE_PROOF_WINDOW: "1" });
  const report = readLine(out, "DESKTOP_WINDOW") as WindowReport | null;
  check("W1 Electron exited 0 after printing DESKTOP_WINDOW", code === 0 && report !== null,
    `exit=${String(code)} out=${out.slice(0, 300)}`);
  check("W2 the page is app://recycle/index.html with origin app://recycle",
    report?.url === "app://recycle/index.html" && report.origin === "app://recycle", JSON.stringify(report));
  check("W3 the shell rendered with its Thai navigation",
    report?.shell === "nav-content" && (report.nav ?? []).includes("บิลรับซื้อ"), JSON.stringify(report?.nav));
  check("W4 the window title is the program's", report?.title === "Recycle Online — สำนักงาน", String(report?.title));
});
