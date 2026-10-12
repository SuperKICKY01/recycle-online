/**
 * THE ORIGIN ELECTRON ACTUALLY SENDS (ADVISOR-DECIDED D-2: "MEASURE the Origin header Electron
 * actually sends before writing the allowlist; if it is `null`, STOP").
 *
 *   npm run prove:origin
 *
 * A local HTTP server records the Origin header of every request it receives. The built app is
 * launched with RECYCLE_PROOF_ORIGIN_URL pointing at it, and the PAGE (app://recycle) fetches it.
 *   O0 control: a request with no Origin (node's own fetch) is recorded as ABSENT -- the
 *      instrument distinguishes "no header" from any value
 *   O1 the page's fetch reached the server
 *   O2 its Origin header is exactly app://recycle -- the value src/main/origin.ts declares and
 *      the server's CORS allowlist must name
 *   O3 it is not "null" (the file:// value D-2 forbids allowing)
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { APP_ORIGIN } from "../main/origin";
import { check, finish, header, readLine, runElectron } from "./harness";

void finish("PROVE_ORIGIN", async () => {
  header("O the Origin header a renderer fetch carries, measured at a server");
  const seen: (string | undefined)[] = [];
  const server = createServer((req, res) => {
    seen.push(req.headers.origin);
    res.writeHead(200, {
      "content-type": "text/plain",
      // Answer the measured origin back so the page's fetch can read the body; this server
      // only MEASURES, it is not the API.
      "access-control-allow-origin": req.headers.origin ?? "*",
    });
    res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/origin-probe`;
  try {
    await fetch(url);
    check("O0 control: a request with no Origin is recorded as absent", seen.length === 1 && seen[0] === undefined,
      JSON.stringify(seen));
    const { code, out } = await runElectron({ RECYCLE_PROOF_ORIGIN_URL: url });
    const fetched = readLine(out, "DESKTOP_FETCH") as { ok?: boolean; status?: number } | null;
    const fromPage = seen.slice(1);
    check("O1 the page's fetch reached the server and resolved", code === 0 && fetched?.ok === true && fromPage.length >= 1,
      `exit=${String(code)} fetch=${JSON.stringify(fetched)} requests=${String(fromPage.length)}`);
    check(`O2 the Origin header is exactly ${APP_ORIGIN}`, fromPage.length >= 1 && fromPage.every((o) => o === APP_ORIGIN),
      `measured=${JSON.stringify(fromPage)}`);
    check("O3 the Origin is not \"null\"", fromPage.every((o) => o !== "null"), JSON.stringify(fromPage));
    console.log(`MEASURED_ORIGIN=${JSON.stringify(fromPage[0] ?? null)}`);
  } finally {
    server.close();
  }
});
