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
 *   R1 resume() against an UNREACHABLE server keeps the session (not the sign-in screen's case)
 *   R2 resume() on a 401 ends it
 *   F5 a store that cannot DELETE: sign-out still ends the session and says so (never throws)
 *   F6 a store that cannot WRITE: sign-in still succeeds for this run and says so (never throws)
 *   P1 isOurPage: only app://recycle pages pass; look-alikes and substrings do not
 *   (R1, F5, F6 and P1 answer the red team of 2026-10-12, findings 1, 5, 6 and 3.)
 */
import { ApiClient, CLIENT_API_VERSION_HEADER, type ApiOutcome } from "../shared/api";
import { isOurPage } from "../main/origin";
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

  header("R resume() tells an ended session from an unreachable server");
  const h = new ScriptedFetch();
  let hCleared = 0;
  const kept = new Session(new ApiClient("http://srv:8000", h.fetch),
    { saveToken: () => Promise.resolve(), clearToken: () => { hCleared += 1; return Promise.resolve(); } }, "tok");
  h.next = json(503, {});
  const r1 = await kept.resume();
  check("R1 a 503 at resume -> 'unavailable', the session KEPT (signed in, nothing cleared, no notice)",
    r1 === "unavailable" && kept.signedIn && hCleared === 0 && kept.notice === null,
    `kind=${r1} signedIn=${String(kept.signedIn)} cleared=${String(hCleared)}`);
  h.next = json(401, {});
  const r2 = await kept.resume();
  check("R2 a 401 at resume -> 'unauthorized', the session ENDED with the expiry sentence",
    r2 === "unauthorized" && !kept.signedIn && hCleared === 1 && kept.notice === SESSION_TEXT.expired);

  header("F a store that fails is said, never thrown");
  const k = new ScriptedFetch();
  const failing = new Session(new ApiClient("http://srv:8000", k.fetch),
    { saveToken: () => Promise.reject(new Error("EPERM")), clearToken: () => Promise.reject(new Error("EBUSY")) }, "tok");
  let threw = false;
  try {
    await failing.signOut();
  } catch {
    threw = true;
  }
  check("F5 sign-out with a failing delete resolves, ends the session, and says the disk copy may remain",
    !threw && !failing.signedIn && failing.notice === SESSION_TEXT.clearFailed, String(failing.notice));
  let kStep = 0;
  k.next = () => {
    kStep += 1;
    return kStep === 1
      ? new Response(JSON.stringify({ access_token: "t2" }), { status: 200 })
      : new Response(JSON.stringify({ tenant_id: "t", user_id: "u", username: "admin", role: "admin", permissions: [] }), { status: 200 });
  };
  let threw2 = false;
  let res: Awaited<ReturnType<Session["signIn"]>> | null = null;
  try {
    res = await failing.signIn("t", "admin", "pw");
  } catch {
    threw2 = true;
  }
  check("F6 sign-in with a failing write resolves OK for this run, with the 'not remembered' sentence",
    !threw2 && res?.ok === true && res.notice === SESSION_TEXT.saveFailed && failing.signedIn, JSON.stringify(res));

  header("P1 isOurPage");
  const yes = ["app://recycle/index.html", "app://recycle/"];
  const no = ["", "app://recycle.evil/index.html", "app://recyclex/", "app://recycle:1234/", "http://x/app://recycle/",
    "file:///C:/app/recycle/index.html", "app://user:pw@recycle/", "https://recycle/"];
  check("P1 app://recycle pages pass", yes.every(isOurPage), JSON.stringify(yes.map(isOurPage)));
  check("P1 look-alikes, substrings, other schemes and credentials do not", no.every((u) => !isOurPage(u)),
    JSON.stringify(no.filter(isOurPage)));
});
