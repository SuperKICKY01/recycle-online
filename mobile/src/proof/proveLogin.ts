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
 *
 * ---------------------------------------------------------------------------
 * THE FIXTURE, AND WHY IT EXISTS (2026-09-06)
 * ---------------------------------------------------------------------------
 * Every wrong-password cell below is a REAL failed login, and the server
 * (migration 0016, app/login_guard.py) counts those: FAILURE_THRESHOLD=5 within
 * LOCKOUT_WINDOW=15 minutes per (tenant, username), derived from the append-only
 * failed_login_attempts table. This proof makes exactly TWO per run (L1, L3).
 * MEASURED 2026-09-06 against a clean scratch with the fixture absent: run 1
 * green, run 2 green, run 3 red — 7 FAILED, every correct-password cell refused
 * with the wrong-password sentence, the table holding 5 `failed` rows. So a
 * proof that survives exactly two runs and fails the third is what stood here,
 * and lessons/proof-must-run-twice.md is satisfied by accident, not by design.
 *
 * THE RESET IS THE PRODUCT'S OWN PATH, not a DELETE: POST /users/{id}/unlock-login
 * appends an `unlocked_by_admin` marker and the count ignores everything at or
 * before it. Two accounts are used ON PURPOSE. STAFF takes every failure this
 * proof causes; ADMIN never sends a wrong password here and performs the reset —
 * so the account that can unlock is never the account that is locked, and the
 * fixture recovers from any LOCKOUT state a previous run left, a crash mid-run
 * included (not from a deactivated staff row -- that is is_active, a different lock).
 * Had admin taken the failures and reset itself, a locked admin could not sign
 * in to perform its own unlock, and the proof would wait out the window.
 *
 * The reset runs at the START (the precondition is CREATED, not trusted to the
 * previous run's cleanup — proof-must-run-twice's fourth amendment) and again
 * at the END (the scratch is left with a zero budget for whatever runs next).
 * Each reset is a cell, so a fixture that could not be established reddens
 * visibly instead of letting the credential cells fail for an unrelated reason.
 * BOUND: if some OTHER actor has locked the admin itself, the start fixture
 * reddens at its sign-in cell — named, not hidden — and nothing here can clear
 * that; the admin unlock route exists to unlock STAFF, never its own caller.
 *
 * THIS IS NEITHER OF THE TWO OPTIONS THE BRIEF OFFERED, AND IT IS BETTER THAN BOTH
 * (the advisor said so, 2026-09-06). "Reset the failed-attempt rows" by the same
 * account cannot recover an account that is already locked; "a distinct account per
 * run" leaves a permanent user row per run and drives POST /users, which this proof
 * is not about. Splitting the roles — the unlocking account is never the locked one —
 * keeps the reset AND the recovery.
 */
import { createServer } from "node:net";

import {
  attemptLogin,
  signInAndRecord,
  signInNotice,
} from "../session/signInIdentity.js";
import type { LoginHttpResponse, SignInResult } from "../session/signInIdentity.js";

let failures = 0;
/** Every wrong-password login this run makes, counted where it is made, so the END
 *  reset can assert the unlock's EFFECT: it must report exactly this many cleared.
 *  A 200 with a number is not evidence the counter was reset (a deleted
 *  clear_lockout would still answer 200); "cleared == what THIS run caused" is,
 *  because with no reset at the start the count would carry the previous runs. */
let wrongAttempts = 0;

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
/** ADMIN performs the fixture's reset and never sends a wrong password here. */
const ADMIN = "admin";
const ADMIN_PASSWORD = "tenantA-pw-123";
/** STAFF takes every failed login this proof causes (server/app/seeddata.py). */
const STAFF = "staff";
const GOOD_PASSWORD = "tenantA-staff-789";
const WRONG_PASSWORD = "tenantA-staff-789-WRONG";

/** The real login call, exactly as app/api.ts composes it. */
function realLogin(username: string, password: string, base = API) {
  if (password === WRONG_PASSWORD) wrongAttempts += 1;
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

  const refused = await attemptLogin(realLogin(STAFF, WRONG_PASSWORD));
  show("wrong password, server running", refused);

  const port = await deadPort();
  const dead = `http://127.0.0.1:${String(port)}`;
  console.log(`  dead address: ${dead} (bound to obtain the port, then closed)`);
  const unreachable = await attemptLogin(realLogin(STAFF, GOOD_PASSWORD, dead));
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
    () => attemptLogin(realLogin(STAFF, WRONG_PASSWORD)),
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
    () => attemptLogin(realLogin(STAFF, GOOD_PASSWORD)),
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
  const result = await attemptLogin(realLogin(STAFF, GOOD_PASSWORD));
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

/* --------------------------------------------------------------- fixture -- */

/**
 * Reset the STAFF account's failed-attempt budget through the product's own
 * admin route (see the header). Three cells, so a fixture that could not be
 * established is a named red rather than a credential cell failing for an
 * unrelated reason.
 */
async function resetStaffFailureBudget(when: "start" | "end"): Promise<void> {
  header(`FIXTURE (${when}) — the staff failed-attempt budget is reset by the admin`);
  const admin = await attemptLogin(realLogin(ADMIN, ADMIN_PASSWORD));
  check(
    "fixture: the ADMIN signs in to perform the reset (red = the admin itself is locked, or the seed is absent)",
    admin.kind === "ok",
    admin.kind,
  );
  if (admin.kind !== "ok") return;
  const headers = { authorization: `Bearer ${admin.accessToken}` };

  const rosterRes = await fetch(`${API}/users`, { headers });
  const roster = (await rosterRes.json()) as { users?: { user_id: string; username: string }[] };
  const staffRow = roster.users?.find((u) => u.username === STAFF);
  check(
    "fixture: GET /users names the staff account",
    rosterRes.status === 200 && staffRow !== undefined,
    `status=${String(rosterRes.status)} staff=${staffRow === undefined ? "absent" : staffRow.user_id}`,
  );
  if (staffRow === undefined) return;

  const unlockRes = await fetch(`${API}/users/${staffRow.user_id}/unlock-login`, {
    method: "POST",
    headers,
  });
  const unlock = (await unlockRes.json()) as {
    failed_attempts_cleared?: number;
    was_locked?: boolean;
  };
  console.log(
    `  unlock-login -> ${String(unlockRes.status)} cleared=${String(unlock.failed_attempts_cleared)}` +
      ` was_locked=${String(unlock.was_locked)}`,
  );
  check(
    "fixture: POST /users/{id}/unlock-login answers 200 and reports the count it cleared",
    unlockRes.status === 200 && typeof unlock.failed_attempts_cleared === "number",
    `status=${String(unlockRes.status)}`,
  );
  if (when === "end") {
    // THE EFFECT, not the response: exactly the failures THIS run caused were
    // counted, which holds only if the start reset really moved the floor.
    check(
      "fixture: the END reset cleared exactly the wrong-password logins this run made",
      unlock.failed_attempts_cleared === wrongAttempts,
      `cleared=${String(unlock.failed_attempts_cleared)} made=${String(wrongAttempts)}`,
    );
  }
}

/* ------------------------------------------------------------------ main -- */

async function main(): Promise<number> {
  console.log(`P1.7 — the login path answers four questions, not one   (API=${API})`);
  await l0Reachable();
  await resetStaffFailureBudget("start");
  try {
    await l1RefusedVersusUnreachable();
    await l2TokenRequired();
    await l3NothingRecordedOnFailure();
    await l4EndToEnd();
  } finally {
    await resetStaffFailureBudget("end");
  }
  console.log(`\n${failures === 0 ? "ALL GREEN" : `${String(failures)} FAILED`}`);
  return failures === 0 ? 0 : 1;
}

// Preset RED, per lessons/a-default-exit-code-is-a-default-verdict.md: a run
// that ends before main()'s tally completes exits non-zero, not a default 0.
process.exitCode = 1;

process.exitCode = await main();
