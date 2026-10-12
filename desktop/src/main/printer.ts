/**
 * SENDING SLIP BYTES TO A PRINTER (B4). Node only, no Electron import, so a proof can drive it.
 *
 * Two ways a shop's printer is reached, neither needing a native module (D-1 forbids adding one):
 *   - "tcp"   a network printer's raw port (9100 by convention): the bytes are written to a socket.
 *   - "share" a USB printer SHARED by Windows (`\\PC-NAME\ShareName`): the bytes are copied to the
 *             share with `copy /b`, which hands them to the spooler as RAW. The share name is
 *             validated before it reaches the command line, and passed as an argument, never parsed
 *             by a shell string.
 *
 * "SENT" IS ALL THIS CAN KNOW. A printer that accepts bytes may still be out of paper; the screen
 * says the slip was sent, never that it printed. A real print is the operator's observation.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { targetProblem, type PrinterTarget } from "../shared/printerTarget";

export type { PrinterTarget };

export type SendOutcome =
  | { readonly kind: "sent"; readonly bytes: number }
  | { readonly kind: "refused" }       // nothing listening there
  | { readonly kind: "unreachable" }   // no route, unknown host, or no answer in time
  | { readonly kind: "share_failed"; readonly detail: string }
  | { readonly kind: "invalid_target" };

function sendTcp(host: string, port: number, bytes: Uint8Array, timeoutMs: number): Promise<SendOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (o: SendOutcome) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(o);
    };
    const socket = connect({ host, port });
    socket.setTimeout(timeoutMs, () => done({ kind: "unreachable" }));
    socket.on("error", (e: NodeJS.ErrnoException) => done(e.code === "ECONNREFUSED" ? { kind: "refused" } : { kind: "unreachable" }));
    socket.on("connect", () => {
      socket.end(Buffer.from(bytes), () => done({ kind: "sent", bytes: bytes.length }));
    });
  });
}

function sendShare(path: string, bytes: Uint8Array, timeoutMs: number): Promise<SendOutcome> {
  const dir = mkdtempSync(join(tmpdir(), "recycle-slip-"));
  const file = join(dir, "slip.bin");
  writeFileSync(file, bytes);
  return new Promise((resolve) => {
    execFile("cmd.exe", ["/d", "/c", "copy", "/b", file, path], { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      rmSync(dir, { recursive: true, force: true });
      if (err === null) resolve({ kind: "sent", bytes: bytes.length });
      else resolve({ kind: "share_failed", detail: `${stdout}${stderr}`.trim().slice(0, 200) || err.message.slice(0, 200) });
    });
  });
}

export async function sendToPrinter(target: PrinterTarget, bytes: Uint8Array, timeoutMs = 8000): Promise<SendOutcome> {
  if (targetProblem(target) !== null) return { kind: "invalid_target" };
  return target.kind === "tcp" ? sendTcp(target.host, target.port, bytes, timeoutMs) : sendShare(target.path, bytes, timeoutMs);
}
