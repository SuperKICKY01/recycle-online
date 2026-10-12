/**
 * SENDING TO A PRINTER (B4) — src/main/printer.ts over real sockets and a real command, no printer.
 *
 *   npm run prove:printer
 *
 *   N1 a fake network printer on 127.0.0.1 receives EXACTLY the bytes sent, and the outcome counts them
 *   N2 a port nobody listens on -> "refused"; an address that never answers -> "unreachable" in time
 *   N3 a host that is not a host is refused BEFORE any connection (the fake printer sees none)
 *   N4 the validator: real share and host forms pass; separators, quotes, colons, shell characters,
 *      a trailing space or dot, and out-of-range or non-integer ports do not
 *   N5 a Windows share that does not exist -> "share_failed" from the real `copy /b`, and the temp
 *      file is removed
 *
 * A real thermal printer is NOT here: whether paper comes out, and whether its Thai is legible, is
 * the operator's observation (ROADMAP P1.17's DONE WHEN is a photograph).
 */
import { createHash, randomUUID } from "node:crypto";
import { readdirSync } from "node:fs";
import { createServer, type AddressInfo, type Server } from "node:net";
import { tmpdir } from "node:os";

import { sendToPrinter } from "../main/printer";
import { targetProblem } from "../shared/printerTarget";
import { check, finish, header } from "./harness";

function fakePrinter(): Promise<{ server: Server; port: number; received: () => Buffer; connections: () => number }> {
  let chunks: Buffer[] = [];
  let connections = 0;
  const server = createServer((sock) => {
    connections += 1;
    sock.on("data", (d: Buffer) => chunks.push(d));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server, port: (server.address() as AddressInfo).port,
        received: () => { const b = Buffer.concat(chunks); chunks = []; return b; },
        connections: () => connections,
      });
    });
  });
}

const sha = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex").slice(0, 16);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const slipTemps = (): number => readdirSync(tmpdir()).filter((n) => n.startsWith("recycle-slip-")).length;

void finish("PROVE_PRINTER", async () => {
  header("N network printer");
  const fake = await fakePrinter();
  try {
    const bytes = Uint8Array.from({ length: 3000 }, (_, i) => (i * 7 + 3) % 256);
    const out = await sendToPrinter({ kind: "tcp", host: "127.0.0.1", port: fake.port }, bytes);
    await wait(300);
    const got = fake.received();
    check("N1 the fake printer received exactly the bytes sent, and the outcome counts them",
      out.kind === "sent" && out.bytes === 3000 && got.length === 3000 && sha(got) === sha(bytes),
      JSON.stringify({ out, got: got.length, same: sha(got) === sha(bytes) }));

    const closed = createServer();
    const closedPort = await new Promise<number>((r) => closed.listen(0, "127.0.0.1", () => r((closed.address() as AddressInfo).port)));
    await new Promise((r) => closed.close(r));
    const refused = await sendToPrinter({ kind: "tcp", host: "127.0.0.1", port: closedPort }, bytes);
    check("N2 a port nobody listens on -> refused", refused.kind === "refused", JSON.stringify(refused));
    const started = Date.now();
    const blackhole = await sendToPrinter({ kind: "tcp", host: "10.255.255.1", port: 9100 }, bytes, 1500);
    const took = Date.now() - started;
    check("N2 an address that never answers -> unreachable, within the timeout", blackhole.kind === "unreachable" && took < 5000,
      `${JSON.stringify(blackhole)} after ${String(took)} ms`);

    const before = fake.connections();
    const bad = await Promise.all(["evil;calc", "a b", "-x", "", "127.0.0.1:9100", "host/../x"].map((h) =>
      sendToPrinter({ kind: "tcp", host: h, port: fake.port }, bytes)));
    await wait(200);
    check("N3 a host that is not a host is refused before any connection",
      bad.every((o) => o.kind === "invalid_target") && fake.connections() === before,
      JSON.stringify({ kinds: bad.map((o) => o.kind), newConnections: fake.connections() - before }));
  } finally {
    await new Promise((r) => fake.server.close(r));
  }

  header("N the validator");
  const ok = [
    { kind: "share", path: "\\\\SHOP-PC\\XP58" }, { kind: "share", path: "\\\\192.168.1.5\\Thermal 80" },
    { kind: "tcp", host: "192.168.1.50", port: 9100 }, { kind: "tcp", host: "printer.local", port: 1 },
  ];
  const no = [
    { kind: "share", path: "\\\\a\\b\\c" }, { kind: "share", path: "\\\\a\\b\" & calc" }, { kind: "share", path: "\\\\a\\b:c" },
    { kind: "share", path: "C:\\x" }, { kind: "share", path: "\\\\a\\" }, { kind: "share", path: "\\\\a\\b " },
    { kind: "share", path: "\\\\a\\b." }, { kind: "share", path: "\\\\a\\b|c" },
    { kind: "tcp", host: "192.168.1.50", port: 0 }, { kind: "tcp", host: "192.168.1.50", port: 65536 },
    { kind: "tcp", host: "192.168.1.50", port: 1.5 }, { kind: "tcp", host: "192.168.1.50", port: "9100" },
    { kind: "usb", path: "x" }, null,
  ];
  const wronglyRefused = ok.filter((t) => targetProblem(t) !== null);
  const wronglyAccepted = no.filter((t) => targetProblem(t) === null);
  check("N4 real share and host forms pass; every malformed one is refused",
    wronglyRefused.length === 0 && wronglyAccepted.length === 0, JSON.stringify({ wronglyRefused, wronglyAccepted }));

  header("N Windows share");
  const tempsBefore = slipTemps();
  const share = await sendToPrinter({ kind: "share", path: `\\\\127.0.0.1\\recycle-no-share-${randomUUID().slice(0, 8)}` }, Uint8Array.from([0x1b, 0x40]), 30_000);
  check("N5 a share that does not exist -> share_failed from the real copy, temp file removed",
    share.kind === "share_failed" && slipTemps() === tempsBefore, JSON.stringify({ share, tempsBefore, after: slipTemps() }));
});
