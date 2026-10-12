/**
 * The desktop proofs' shared harness (ADVISOR-DECIDED D-6): PRESET RED, one line per cell, and
 * a self-printed `<NAME>_EXIT=<n>` whose ABSENCE is the failure signal (tools/prove_all.py reads
 * it). Every proof is run twice by the gate.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";

process.exitCode = 1; // PRESET RED: only a completed, all-green run clears it.

let failures = 0;
let passes = 0;

export function check(label: string, ok: boolean, detail = ""): boolean {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (ok) passes += 1;
  else failures += 1;
  return ok;
}

export function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

export async function finish(name: string, body: () => Promise<void>): Promise<void> {
  try {
    await body();
  } catch (err) {
    check(`the run completed`, false, err instanceof Error ? err.stack ?? err.message : String(err));
  }
  console.log(`\n${String(passes)} OK, ${String(failures)} FAIL`);
  const code = failures === 0 && passes > 0 ? 0 : 1;
  console.log(`${name}_EXIT=${String(code)}`);
  process.exitCode = code;
}

/** desktop/ — proofs run from dist/proof/, two levels down. */
export const DESKTOP_ROOT = join(__dirname, "..", "..");

/**
 * Run the built Electron app once with `env` added, and return what it printed. The app quits
 * itself after its proof hook; `timeoutMs` kills it otherwise and the caller's cell goes red.
 */
export function runElectron(env: Record<string, string>, timeoutMs = 60_000): Promise<{ code: number | null; out: string }> {
  // In a node context `require("electron")` is the path to the Electron binary.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const electronPath = require("electron") as unknown as string;
  return new Promise((resolve) => {
    const child = spawn(electronPath, [DESKTOP_ROOT], {
      env: { ...process.env, ...env, ELECTRON_ENABLE_LOGGING: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d: Buffer) => { out += d.toString("utf8"); });
    child.stderr.on("data", (d: Buffer) => { out += d.toString("utf8"); });
    const timer = setTimeout(() => { child.kill(); }, timeoutMs);
    child.on("close", (code) => { clearTimeout(timer); resolve({ code, out }); });
  });
}

/** The JSON after `KEY=` on its own line, or null. */
export function readLine(out: string, key: string): unknown {
  const line = out.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  if (line === undefined) return null;
  try {
    return JSON.parse(line.slice(key.length + 1)) as unknown;
  } catch {
    return null;
  }
}
