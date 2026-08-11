/**
 * P1.7 proof: A REFUSED PASSWORD AND AN UNREACHABLE SERVER ARE DIFFERENT
 * ANSWERS, and a 200 carrying no token is not a session.
 *
 * Run: npm run prove:login
 *   RECYCLE_API_BASE — the API to drive. Must NOT be the live one.
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS WRONG, AND WHY IT SURVIVED
 * ---------------------------------------------------------------------------
 * `login()` threw on every non-2xx and `App.tsx` caught all of it in one place
 * that set `online = false`. A wrong password — answered by the server in
 * milliseconds — put the device in its offline state and said so, which at five
 * in the morning sends the operator to the router instead of the keyboard. And
 * a 200 with no `access_token` was a CAST, not a check, so the app entered a
 * signed-in state holding `undefined`: `sessionStateOf` reads `token === null`,
 * which `undefined` is not, so the screen said active and the yard could weigh
 * against a session that cannot send one bill.
 *
 * It survived because the classification lived in `app/api.ts`, which reaches
 * expo-constants through `./config` and cannot be loaded by this program at all.
 * A decision no proof can reach is a decision no assertion can ever redden.
 * `attemptLogin` now lives in src/ and takes its fetch as an argument, so every
 * branch below — the outage included — is the SAME code the handset runs.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DRIVES
 * ---------------------------------------------------------------------------
 * A REAL server, over REAL HTTP, with an account provisioned through the real
 * seed path — and, for the outage, a REAL TCP port with nothing listening,
 * obtained by binding and closing, never a fake transport that returns a
 * rejected promise. A simulated outage proves the branch and says nothing about
 * fetch, the URL, or what a connection refusal actually looks like.
 *
 * NOT PROVEN HERE: that `App.tsx` routes these four kinds to four screens. That
 * file is outside this program; what is proven is the classification and the
 * sentence, which is where the defect was.
 */
import { createServer } from "node:net";

import {
  attemptLogin,
  signInAndRecord,
  signInNotice,
} from "../session/signInIdentity.js";
import type { LoginHttpResponse, SignInResult } from "../session/signInIdentity.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const API = process.env.RECYCLE_API_BASE ?? "http://127.0.0.1:8211";

/** Seeded tenant A, from server/app/seeddata.py. */
const TENANT_A = "11111111-1111-1111-1111-111111111111";
const ADMIN = "admin";
const GOOD_PASSWORD = "tenantA-pw-123";
const WRONG_PASSWORD = "tenantA-pw-123-WRONG";

/** The real login call, exactly as app/api.ts composes it. */
function realLogin(username: string, password: string, base = API) {
  return (): Promise<LoginHttpResponse> =>
    fetch(`${base}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenant_id: TENANT_A, username, password }),
    });
}

/** A port that was bound and then closed, so nothing is listening on it. */
async function deadPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr === null || typeof addr === "string") {
        reject(new Error("no port"));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

function show(what: string, r: SignInResult): void {
  console.log(`  ${what}: kind=${r.kind}` +
    (r.kind === "server_fault" ? ` status=${String(r.status)} detail=${r.detail}` : "") +
    `\n      the operator reads: ${String(signInNotice(r))}`);
}

/** A store that records every save, so "nothing was recorded" is measurable. */
function recorder() {
  const saved: { tenant_id: string; user_id: string }[] = [];
  return {
    saved,
    save: (identity: { tenant_id: string; user_id: string }): Promise<void> => {
      saved.push(identity);
      return Promise.resolve();
    },
  };
}

/* -------------------------------------------------------------------- L0 -- */

async function l0Reachable(): Promise<void> {
  header("L0 — CONTROL: the server under test is actually there");
  let status = 0;
  try {
    const res = await fetch(`${API}/health`);
    status = res.status;
  } catch {
    status = 0;
  }
  console.log(`  ${API}/health -> ${String(status)}`);
  check(
    "the API answers /health — every refusal below is about credentials, not absence",
    status === 200,
    `status=${String(status)}`,
  );
}

/* ---------------------------------------------------------------- L1, L2 -- */

/**
 * 3a AND 3b IN ONE RUN. Asserting either alone cannot show the two were
 * SEPARATED — only that some wording changed.
 */
async function l1RefusedVersusUnreachable(): Promise<void> {
  header("L1 (3a + 3b) — a refused password and an unreachable server, in one run");

  const refused = await attemptLogin(realLogin(ADMIN, WRONG_PASSWORD));
  show("wrong password, server running", refused);

  const port = await deadPort();
  const dead = `http://127.0.0.1:${String(port)}`;
  console.log(`  dead address: ${dead} (bound to obtain the port, then closed)`);
  const unreachable = await attemptLogin(realLogin(ADMIN, GOOD_PASSWORD, dead));
  show("correct password, nothing listening", unreachable);

  // DIRECTION, not difference. "They differ" is satisfied by getting both of
  // them the wrong way round, which is precisely the defect being removed.
  check(
    "the WRONG PASSWORD is reported as refused",
    refused.kind === "refused",
    refused.kind,
  );
  check(
    "the UNREACHABLE SERVER is reported as unreachable",
    unreachable.kind === "unreachable",
    unreachable.kind,
  );
  check(
    "the two kinds DIFFER — one branch cannot produce both",
    refused.kind !== unreachable.kind,
    `${refused.kind} vs ${unreachable.kind}`,
  );

  const rMsg = signInNotice(refused) ?? "";
  const uMsg = signInNotice(unreachable) ?? "";
  check("the two SENTENCES differ", rMsg !== uMsg);
  check(
    "the refusal names the PASSWORD and never the network",
    rMsg.includes("รหัสผ่าน") && !rMsg.includes("เน็ต"),
    rMsg,
  );
  check(
    "the outage names the CONNECTION, and says the password is not the problem",
    uMsg.includes("เน็ต") && uMsg.includes("ไม่ใช่เรื่องรหัสผ่าน"),
    uMsg,
  );
}

/* ---------------------------------------------------------------- L3, L4 -- */

/**
 * 3c AND ITS CONTROL 3d, in one run. Without 3d, rejecting every 200 is green
 * and nobody can sign in at all.
 */
async function l2TokenRequired(): Promise<void> {
  header("L2 (3c + 3d) — a 200 with no token is not a session; a 200 with one is");

  const noToken = await attemptLogin(() =>
    Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ user_id: "u-1" }) }),
  );
  show("200, body carries no access_token", noToken);

  const emptyToken = await attemptLogin(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: "", user_id: "u-1" }),
    }),
  );
  show("200, access_token is the empty string", emptyToken);

  const withToken = await attemptLogin(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: "a.b.c", user_id: "u-1" }),
    }),
  );
  show("200, body carries a token", withToken);

  check(
    "a 200 with NO token is refused as a server fault",
    noToken.kind === "server_fault",
    noToken.kind,
  );
  check(
    "and it says WHICH fault — the discriminating field, not the shared kind",
    noToken.kind === "server_fault" && noToken.detail === "no_token",
    noToken.kind === "server_fault" ? noToken.detail : "(not a fault)",
  );
  check(
    "an EMPTY token is treated as absent, not as a session",
    emptyToken.kind === "server_fault",
    emptyToken.kind,
  );
  check(
    "CONTROL (3d): a 200 WITH a token is accepted",
    withToken.kind === "ok",
    withToken.kind,
  );
  check(
    "CONTROL (3d): and the token is handed back intact",
    withToken.kind === "ok" && withToken.accessToken === "a.b.c",
    withToken.kind === "ok" ? withToken.accessToken : "(not ok)",
  );
  check(
    "the two 200s DISAGREE — so this is a check on the BODY, not a blanket refusal",
    noToken.kind !== withToken.kind,
    `${noToken.kind} vs ${withToken.kind}`,
  );
}

/* -------------------------------------------------------------------- L3 -- */

/** No failed attempt of any kind may record an identity. */
async function l3NothingRecordedOnFailure(): Promise<void> {
  header("L3 — no failed attempt writes an identity, and the good one does");

  const onRefusal = recorder();
  const r1 = await signInAndRecord(
    () => attemptLogin(realLogin(ADMIN, WRONG_PASSWORD)),
    TENANT_A,
    onRefusal,
  );
  check("a refused login records NOTHING", onRefusal.saved.length === 0,
    JSON.stringify(onRefusal.saved));
  check("  ...and reports refused", r1.kind === "refused", r1.kind);

  const onFault = recorder();
  const r2 = await signInAndRecord(
    () =>
      attemptLogin(() =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) }),
      ),
    TENANT_A,
    onFault,
  );
  check("a 200 with no token records NOTHING", onFault.saved.length === 0,
    JSON.stringify(onFault.saved));
  check("  ...and reports a server fault", r2.kind === "server_fault", r2.kind);

  // CONTROL: the recorder is capable of recording. Without this every cell
  // above passes against a store that silently drops everything.
  const onSuccess = recorder();
  const r3 = await signInAndRecord(
    () => attemptLogin(realLogin(ADMIN, GOOD_PASSWORD)),
    TENANT_A,
    onSuccess,
  );
  check(
    "CONTROL: a SUCCESSFUL login does record one identity",
    onSuccess.saved.length === 1,
    JSON.stringify(onSuccess.saved),
  );
  check(
    "CONTROL: and it is the tenant the login was made against",
    onSuccess.saved[0]?.tenant_id === TENANT_A,
    String(onSuccess.saved[0]?.tenant_id),
  );
  check("  ...and reports ok", r3.kind === "ok", r3.kind);
}

/* -------------------------------------------------------------------- L4 -- */

/** 3e — the whole path, end to end, against the real server. */
async function l4EndToEnd(): Promise<void> {
  header("L4 (3e) — a correct password against the running server succeeds");
  const result = await attemptLogin(realLogin(ADMIN, GOOD_PASSWORD));
  show("correct password, server running", result);
  check("it is ok", result.kind === "ok", result.kind);
  check(
    "a non-empty access token came back",
    result.kind === "ok" && result.accessToken.length > 0,
    result.kind === "ok" ? `len=${String(result.accessToken.length)}` : "(not ok)",
  );
  check(
    "a user id came back, and it is the SERVER'S — not derived here",
    result.kind === "ok" && result.userId.length > 0,
    result.kind === "ok" ? result.userId : "(not ok)",
  );
  check(
    "the operator is told nothing on success",
    signInNotice(result) === null,
    String(signInNotice(result)),
  );
}

/* ------------------------------------------------------------------ main -- */

async function main(): Promise<number> {
  console.log(`P1.7 — the login path answers four questions, not one   (API=${API})`);
  await l0Reachable();
  await l1RefusedVersusUnreachable();
  await l2TokenRequired();
  await l3NothingRecordedOnFailure();
  await l4EndToEnd();
  console.log(`\n${failures === 0 ? "ALL GREEN" : `${String(failures)} FAILED`}`);
  return failures === 0 ? 0 : 1;
}

process.exitCode = await main();
