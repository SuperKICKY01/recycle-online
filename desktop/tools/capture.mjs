// Capture the built app's window to a PNG: `npm run capture -- <path.png>`.
// The main process does the capture itself (RECYCLE_CAPTURE, src/main/main.ts) and quits.
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];
if (!target) {
  console.error("usage: npm run capture -- <path.png>");
  process.exit(2);
}
const electronPath = createRequire(import.meta.url)("electron");
const child = spawn(electronPath, [root], {
  env: { ...process.env, RECYCLE_CAPTURE: resolve(target), ...(process.argv[3] ? { RECYCLE_CAPTURE_STATE: process.argv[3] } : {}) },
  stdio: "inherit",
});
child.on("close", (code) => process.exit(code ?? 1));
