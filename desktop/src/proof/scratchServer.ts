/**
 * Shared by the proofs that drive the real screens against a real server (not a proof itself):
 * server/scripts/scratch_server.py serves a fresh scratch with a per-run admin, and `http` is a
 * plain request helper for the proof's own fixture and read-backs.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { DESKTOP_ROOT } from "./harness";

const SERVER_DIR = join(DESKTOP_ROOT, "..", "server");

export interface ScratchInfo { base: string; shop_code: string; tenant_id: string; username: string; password: string }

export function startScratchServer(): Promise<{ proc: ChildProcess; info: ScratchInfo; log: () => string }> {
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

export async function http(base: string, method: string, path: string, token?: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== undefined) headers["authorization"] = `Bearer ${token}`;
  const r = await fetch(`${base}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, json: await r.json().catch(() => null) };
}

export const S001 = "aaaa0000-0000-0000-0000-0000000000a4";
export const S002 = "aaaa0000-0000-0000-0000-0000000000a7";
const PRODUCT = "aaaa0000-0000-0000-0000-0000000000a3";

/** One bill through the REAL POST /bills (1,200 kg net at 15.00 = 18,000.00). Returns its id. */
export async function postBill(base: string, token: string, seller: string, tag: string, run: string): Promise<string> {
  const id = randomUUID();
  const r = await http(base, "POST", "/bills", token, {
    id, seller_id: seller, vehicle_no: `FLOW-${tag}`, device_created_at: new Date().toISOString(),
    idempotency_key: `flow-${run}-${tag}`,
    items: [{ id: randomUUID(), product_id: PRODUCT, line_no: 1, gross_weight: "1250.000", tare_weight: "50.000",
      net_weight: "1200.000", unit_price: "15.00" }],
  });
  if (r.status !== 201) throw new Error(`POST /bills ${tag} -> ${String(r.status)} ${JSON.stringify(r.json)}`);
  return id;
}
