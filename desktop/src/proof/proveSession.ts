/**
 * THE DESKTOP SESSION RULES, pure (B2): the ApiClient's classification and the Session's
 * one-401-ends-it rule, over a scripted fetch that COUNTS every request.
 *
 *   npm run prove:session
 *
 *   C1 the client classifies 200 / 401 / 403 / 404 / 426 / 422 / 503 / a thrown fetch into the
 *      closed outcome set, and sends the API-contract version header on every request
 *   N1 noticeFor: a 401 on LOGIN is the credentials sentence; on a SESSION call it is expiry
 *   L1 a 401 on an authenticated call ends the session: token cleared from the store, expiry
 *      sentence set
 *   L2 NO LOOP: after it, ten more authenticated calls send ZERO requests
 *   L3 a sign-in restores the session and the next call is sent again
 *   A1 normaliseApiBase accepts http(s)://host:port and refuses anything else
 */
import { ApiClient, CLIENT_API_VERSION_HEADER, type ApiOutcome } from "../shared/api";
import { normaliseApiBase, noticeFor, Session, SESSION_TEXT } from "../shared/session";
import { check, finish, header } from "./harness";

class ScriptedFetch {
  calls: { url: string; headers: Record<string, string> }[] = [];
  next: () => Response | Promise<Response> = () => new Response("{}", { status: 200 });
  fetch = (url: string, init: RequestInit): Promise<Response> => {
    this.calls.push({ url, headers: init.headers as Record<string, string> });
    return Promise.resolve(this.next());
  };
}

const json = (status: number, body: unknown) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

void finish("PROVE_SESSION", async () => {
  header("C1 the client's classification");
  const f = new ScriptedFetch();
  const api = new ApiClient("http://srv:8000/", f.fetch);
  const kinds: Record<string, string> = {};
  const cases: [string, () => Response | Promise<Response>][] = [
    ["200", json(200, { tenant_id: "t-1" })],
    ["401", json(401, { detail: "invalid credentials" })],
    ["403", json(403, { detail: { code: "permission_required", required_permission: "bills.void" } })],
    ["404", json(404, { detail: {} })],
    ["426", json(426, {})],
    ["422", json(422, { detail: { code: "x" } })],
    ["503", json(503, {})],
    ["throw", () => Promise.reject(new TypeError("Failed to fetch"))],
  ];
  for (const [name, resp] of cases) {
    f.next = resp;
    kinds[name] = (await api.resolveShopCode("ABCDEFGH")).kind;
  }
  check("C1 200 ok, 401 unauthorized, 403 forbidden, 404 not_found, 426 outdated, 422 invalid, 503 and a throw unavailable",
    JSON.stringify(kinds) === JSON.stringify({ "200": "ok", "401": "unauthorized", "403": "forbidden", "404": "not_found",
      "426": "outdated", "422": "invalid", "503": "unavailable", throw: "unavailable" }), JSON.stringify(kinds));
  check("C1 every request carried the API-contract version header and the base had no doubled slash",
    f.calls.every((c) => c.headers[CLIENT_API_VERSION_HEADER] === "1" && c.url === "http://srv:8000/auth/shop-code"),
    JSON.stringify(f.calls[0]));

  header("N1 the sentence follows the context");
  const u: ApiOutcome<never> = { kind: "unauthorized" };
  check("N1 401 on login -> credentials; on a session call -> expiry",
    noticeFor(u, "login") === SESSION_TEXT.badCredentials && noticeFor(u, "session") === SESSION_TEXT.expired);

  header("L the one-401-ends-it rule");
  const g = new ScriptedFetch();
  let cleared = 0;
  let saved = 0;
  const s = new Session(new ApiClient("http://srv:8000", g.fetch),
    { saveToken: () => { saved += 1; return Promise.resolve(); }, clearToken: () => { cleared += 1; return Promise.resolve(); } },
    "stored-token");
  g.next = json(401, { detail: "token expired" });
  const out = await s.authed((t) => new ApiClient("http://srv:8000", g.fetch).whoami(t));
  check("L1 a 401 ends the session: token cleared from the store once, expiry sentence set",
    out.kind === "unauthorized" && !s.signedIn && cleared === 1 && s.notice === SESSION_TEXT.expired,
    `cleared=${String(cleared)} notice=${String(s.notice)}`);
  const sentAt401 = g.calls.length;
  for (let i = 0; i < 10; i += 1) await s.authed((t) => new ApiClient("http://srv:8000", g.fetch).whoami(t));
  check("L2 ten more authenticated calls after it send ZERO requests", g.calls.length === sentAt401,
    `requests=${String(g.calls.length - sentAt401)}`);
  let step = 0;
  g.next = () => {
    step += 1;
    return step === 1
      ? new Response(JSON.stringify({ access_token: "new-token", token_type: "bearer" }), { status: 200 })
      : new Response(JSON.stringify({ tenant_id: "t", user_id: "u", username: "admin", role: "admin", permissions: [] }), { status: 200 });
  };
  const r = await s.signIn("t", "admin", "pw");
  const before = g.calls.length;
  await s.authed((t) => new ApiClient("http://srv:8000", g.fetch).whoami(t));
  check("L3 a sign-in restores the session (token saved once) and the next call is sent",
    r.ok && s.signedIn && saved === 1 && g.calls.length === before + 1, `saved=${String(saved)}`);

  header("A1 the server address");
  check("A1 http(s)://host:port is accepted and normalised; anything else refused",
    normaliseApiBase(" http://192.168.1.10:8000/ ") === "http://192.168.1.10:8000"
      && normaliseApiBase("https://shop.example") === "https://shop.example"
      && normaliseApiBase("ftp://x") === null && normaliseApiBase("192.168.1.10:8000") === null
      && normaliseApiBase("http://x:8000/api") === null);
});
