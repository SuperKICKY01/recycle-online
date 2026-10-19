/**
 * P3.7 proof — user management on the phone.
 *
 * Run: npm run prove:users              (requires the API running at RECYCLE_API_BASE)
 *      npm run prove:users -- --offline (skips the live round; exits 2, never 0)
 *
 * WHAT IS HEADLESS AND WHAT NEEDS THE SERVER — stated so a green without a server
 * is read for what it is (the owner's requirement):
 *
 *   HEADLESS (H1..H5, always run): the pure builders in src/users/usersAdmin.ts —
 *   the admin-only entry gate, the roster model including deactivated users, every
 *   refusal sentence asserted NEGATIVELY over its own render with a presence
 *   sibling, the first-password note (shown once, never logged, cleared on submit),
 *   and the deactivate confirmation that names what it does to the person's phone.
 *   These prove the client agrees WITH ITSELF.
 *
 *   LIVE (R1..R4, need the server): a real HTTP round through the app's own request
 *   SHAPE (withClientVersion(fetch), the version header on every call) against a
 *   fresh uvicorn — create a user, deactivate, prove the deactivated user's token is
 *   REFUSED, reactivate, reset a password — the only thing that proves the
 *   classification matches the server's actual answer. app/api.ts itself cannot be
 *   imported here (it reaches expo-constants through ./config), so the shape is
 *   reconstructed, exactly as proveForbidden reconstructs the transport.
 *
 * ON THE OUTPUT. Mostly Thai; mojibake in the console is the console (cp874,
 * lessons/console-is-not-the-observation.md). Every assertion compares JS strings.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  checkNewUser,
  DEACTIVATE_CONSEQUENCE,
  FIRST_PASSWORD_NOTE,
  LAST_ADMIN_NOTE,
  RESET_CONSEQUENCE,
  SELF_ROW_NOTE,
  userWriteOutcome,
  usersScreenState,
  type RosterUser,
  type UserFetch,
  type UsersMessage,
} from "../users/usersAdmin.js";
import { may } from "../session/deviceRole.js";
import { grantsOf } from "./proofGrants.js";
import { withClientVersion } from "../net/clientVersion.js";

let failures = 0;
let passes = 0;

function check(name: string, cond: boolean, detail = ""): void {
  console.log(`  [${cond ? "OK  " : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
  if (cond) passes += 1;
  else failures += 1;
}
function header(t: string): void {
  console.log("\n=== " + t + " ===");
}

/**
 * NO SERVER DIAGNOSTIC MAY REACH THE SCREEN. A rendered refusal must carry no JSON,
 * no `kind`/`code`/`detail`, no status number, no server code, no id. Checked over
 * the whole rendered string, in draw order — the concatenation, not one region.
 */
const BANNED: readonly string[] = [
  "{", "}", '"', "[", "]", "detail", "kind", "code", "http", "HTTP", "_unset",
  "401", "403", "409", "422", "500", "last_active_admin", "duplicate_code",
  "admin_required", "cannot_deactivate_self", "undefined", "null",
];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i;

function leaks(s: string): string | null {
  for (const b of BANNED) if (s.includes(b)) return b;
  if (UUID.test(s)) return "a uuid";
  return null;
}

function messageText(m: UsersMessage): string {
  // The whole render, in draw order: badge, then the lines, then the action label.
  return [m.badge, ...m.lines, m.action?.label ?? ""].join(" ");
}

// ---------------------------------------------------------------------------
// H1 — the admin-only entry gate (staff sees nothing; admin is the presence sibling)
// ---------------------------------------------------------------------------
function h1EntryGate(): void {
  header("H1 the จัดการผู้ใช้งาน entry is admin-only (staff sees nothing)");
  check(
    "a definite STAFF role is NOT offered the entry",
    may(grantsOf("staff"), "users.manage") === false,
    "may(STAFF, 'users.manage') === false",
  );
  check(
    "PRESENCE SIBLING: an ADMIN role IS offered it — the absence above is a gate, not a broken function",
    may(grantsOf("admin"), "users.manage") === true,
    "may(ADMIN, 'users.manage') === true",
  );
  check(
    "an unknown role (null) fails OPEN and is offered it too",
    may(grantsOf(null), "users.manage") === true,
    "may(null, 'users.manage') === true — the server's users.manage gate is the authority",
  );
}

// ---------------------------------------------------------------------------
// H2 — the roster model, including deactivated users and the last-admin guard
// ---------------------------------------------------------------------------
function h2Roster(): void {
  header("H2 the roster model — active, inactive, self, and the last-admin guard");
  const SELF = "11111111-0000-0000-0000-000000000001";
  const roster: RosterUser[] = [
    { user_id: SELF, username: "owner", full_name: "เจ้าของร้าน หนึ่ง", role: "admin", is_active: true },
    { user_id: "id-admin-2", username: "owner2", full_name: "ผู้ดูแล สอง", role: "admin", is_active: true },
    { user_id: "id-staff-1", username: "somchai", full_name: "สมชาย ยอดขาย", role: "staff", is_active: true },
    { user_id: "id-staff-off", username: "retired", full_name: "อดีต พนักงาน", role: "staff", is_active: false },
  ];

  // Two active admins: neither is the last, so each OTHER admin is deactivatable,
  // and the self row never is.
  const twoAdmins = usersScreenState({ kind: "ok", body: { users: roster } }, grantsOf("admin"), SELF);
  check("a well-formed roster yields the roster screen (not a message)", twoAdmins.kind === "roster");
  if (twoAdmins.kind !== "roster") return;
  const s = twoAdmins.screen;

  check(
    "the DEACTIVATED user is present, in the inactive group — visible, not hidden",
    s.inactiveRows.length === 1 && s.inactiveRows[0]?.username === "retired",
    `active=${String(s.activeRows.length)} inactive=${String(s.inactiveRows.length)}`,
  );
  check("the active group holds the three active accounts", s.activeRows.length === 3);

  const self = s.activeRows.find((r) => r.user_id === SELF);
  const otherAdmin = s.activeRows.find((r) => r.user_id === "id-admin-2");
  const staff = s.activeRows.find((r) => r.user_id === "id-staff-1");
  const retired = s.inactiveRows[0];

  check("the signed-in row is marked isSelf", self?.isSelf === true);
  check("the signed-in row offers NO deactivate (self) and NO reset (own password is elsewhere)",
    self?.mayDeactivate === false && self?.mayReset === false);
  check("another active admin IS deactivatable when two admins are active",
    otherAdmin?.mayDeactivate === true, `activeAdmins=${String(s.activeAdmins)}`);
  check("a staff account is deactivatable and resettable", staff?.mayDeactivate === true && staff?.mayReset === true);
  check("the deactivated user is reactivatable, and not deactivatable", retired?.mayReactivate === true && retired?.mayDeactivate === false);
  check("roles are labelled in Thai", self?.roleLabel === "ผู้ดูแลระบบ" && staff?.roleLabel === "พนักงาน");

  // ONE active admin: that admin is the LAST, so the client does not offer to
  // deactivate it — the SECOND layer (the server refuses it too). Here the sole
  // admin is NOT self, to reach the guard without the self-check masking it.
  const oneAdmin: RosterUser[] = [
    { user_id: "sole-admin", username: "onlyowner", full_name: "เจ้าของ เดียว", role: "admin", is_active: true },
    { user_id: "a-staff", username: "clerk", full_name: "เสมียน หนึ่ง", role: "staff", is_active: true },
  ];
  const lone = usersScreenState({ kind: "ok", body: { users: oneAdmin } }, grantsOf("admin"), "a-staff");
  if (lone.kind !== "roster") {
    check("the one-admin roster builds", false);
    return;
  }
  const soleAdminRow = lone.screen.activeRows.find((r) => r.user_id === "sole-admin");
  check(
    "the LAST active admin is NOT offered deactivate (the client second layer)",
    soleAdminRow?.mayDeactivate === false,
    `activeAdmins=${String(lone.screen.activeAdmins)}`,
  );
  check(
    "PRESENCE SIBLING: with two admins that same admin WAS deactivatable — the false above is the guard, not a row that never deactivates",
    otherAdmin?.mayDeactivate === true,
  );

  // 3a (2026-10-17): an OWNER's row seen by an admin offers no reset — only the owner
  // sets the owner's password (the server's owner_password_owner_only) — and says why.
  const withOwner: RosterUser[] = [
    { user_id: "the-owner", username: "boss", full_name: "เจ้าของ ร้าน", role: "owner", is_active: true },
    { user_id: "an-admin", username: "adm", full_name: "ผู้ดูแล หนึ่ง", role: "admin", is_active: true },
    { user_id: "a-clerk", username: "clerk2", full_name: "เสมียน สอง", role: "staff", is_active: true },
  ];
  const asAdmin = usersScreenState({ kind: "ok", body: { users: withOwner } }, grantsOf("admin"), "an-admin");
  const asOwner = usersScreenState({ kind: "ok", body: { users: withOwner } }, grantsOf("owner"), "the-owner");
  if (asAdmin.kind !== "roster" || asOwner.kind !== "roster") {
    check("the owner rosters build", false);
    return;
  }
  const ownerRow = asAdmin.screen.activeRows.find((r) => r.user_id === "the-owner");
  const clerkRow = asAdmin.screen.activeRows.find((r) => r.user_id === "a-clerk");
  check("3a: an admin is NOT offered a reset on the OWNER's row, and the row says why",
    ownerRow?.mayReset === false && ownerRow?.ownerPasswordLocked === true,
    `mayReset=${String(ownerRow?.mayReset)} locked=${String(ownerRow?.ownerPasswordLocked)}`);
  check("3a: PRESENCE SIBLING — the same admin IS offered a reset on a staff row",
    clerkRow?.mayReset === true && clerkRow?.ownerPasswordLocked === false);
  const ownSelf = asOwner.screen.activeRows.find((r) => r.user_id === "the-owner");
  check("3a: the owner's own row is the self row, not the locked one (own password is the account screen's)",
    ownSelf?.isSelf === true && ownSelf?.ownerPasswordLocked === false);

  // A malformed body is FATAL, not a partial roster (which would hide an admin and
  // miscount the guard).
  const bad = usersScreenState({ kind: "ok", body: { users: [{ user_id: "x" }] } }, grantsOf("admin"), null);
  check("a malformed roster row is a MESSAGE, never a partial list", bad.kind === "message");
}

// ---------------------------------------------------------------------------
// H3 — every refusal, worded from the cause, leaking nothing, with a presence sibling
// ---------------------------------------------------------------------------
function refused(fetch: UserFetch): string {
  const o = userWriteOutcome(fetch);
  return o.kind === "refused" ? o.message : `<${o.kind}>`;
}

function h3Refusals(): void {
  header("H3 refusals: worded from the cause, no diagnostic, with a presence sibling");

  // The last-active-admin refusal — the one most likely read as a bug. It must say
  // what it PROTECTS and leak nothing.
  const lastAdmin = refused({
    kind: "http",
    status: 409,
    body: { detail: { code: "last_active_admin", active_admins: "1" } },
  });
  check("last_active_admin: no diagnostic leaks into the sentence", leaks(lastAdmin) === null, lastAdmin);
  check(
    "last_active_admin: PRESENCE SIBLING — it names what it protects (an admin the shop must keep)",
    lastAdmin.includes("ผู้ดูแลระบบ") && lastAdmin.includes("อย่างน้อยหนึ่ง"),
    lastAdmin,
  );

  // A 403 (the caller is no longer an admin) names the owner, not a status.
  const forbidden = refused({ kind: "http", status: 403, body: { detail: { code: "admin_required" } } });
  check("403: no diagnostic leaks", leaks(forbidden) === null, forbidden);
  check("403: PRESENCE SIBLING — it names the shop owner", forbidden.includes("เจ้าของร้าน"), forbidden);
  // 3a: the owner's password refused to anyone else is worded as that rule, not as
  // "this account cannot manage users" (the caller CAN manage users).
  const ownerOnly = refused({ kind: "http", status: 403, body: { detail: { code: "owner_password_owner_only" } } });
  check("owner_password_owner_only: no diagnostic leaks", leaks(ownerOnly) === null, ownerOnly);
  check("owner_password_owner_only: it says only the owner sets it, and differs from the generic 403",
    ownerOnly.includes("เจ้าของร้านเองเท่านั้น") && ownerOnly !== forbidden, ownerOnly);

  // A duplicate username says so WITHOUT echoing the name that was taken.
  const dup = refused({
    kind: "http",
    status: 409,
    body: { detail: { code: "duplicate_code", conflicting_code: "somchai" } },
  });
  check("409 duplicate: no diagnostic and no echoed username", leaks(dup) === null && !dup.includes("somchai"), dup);
  check("409 duplicate: PRESENCE SIBLING — it says the name is taken", dup.includes("มีอยู่แล้ว"), dup);

  // Offline / server / invalid all word cleanly.
  const offline = refused({ kind: "unreachable" });
  check("offline: PRESENCE SIBLING and no leak", offline.includes("ลองอีกครั้ง") && leaks(offline) === null, offline);
  const server = refused({ kind: "http", status: 500, body: null });
  check("5xx: PRESENCE SIBLING and no leak", server.includes("ลองอีกครั้ง") && leaks(server) === null, server);
  const invalid = refused({ kind: "http", status: 422, body: { detail: [{ msg: "x" }] } });
  check("422: PRESENCE SIBLING and no leak (never the raw pydantic body)", invalid.includes("ตรวจสอบ") && leaks(invalid) === null, invalid);

  // A 401 / no token ends the session — NOT a refusal sentence on the list.
  check("401 is the session, not a list refusal", userWriteOutcome({ kind: "http", status: 401, body: null }).kind === "session");
  check("no token is the session too", userWriteOutcome({ kind: "no_token" }).kind === "session");

  // The READ messages (usersScreenState) leak nothing either, over the whole card.
  header("H3b the read-failure MESSAGES leak nothing over the whole card");
  const cases: readonly [string, UserFetch, string][] = [
    ["offline", { kind: "unreachable" }, "ลองอีกครั้ง"],
    ["session", { kind: "http", status: 401, body: null }, "เข้าสู่ระบบ"],
    ["forbidden", { kind: "http", status: 403, body: { detail: { code: "admin_required" } } }, "เจ้าของร้าน"],
    ["server", { kind: "http", status: 500, body: null }, "ลองอีกครั้ง"],
    ["unreadable-200", { kind: "ok", body: {} }, "ลองอีกครั้ง"],
  ];
  for (const [name, fetch, sibling] of cases) {
    const st = usersScreenState(fetch, grantsOf("admin"), null);
    if (st.kind !== "message") {
      check(`${name}: is a message screen`, false);
      continue;
    }
    const whole = messageText(st.message);
    check(`${name}: no diagnostic over the whole card, and the presence sibling is there`,
      leaks(whole) === null && whole.includes(sibling), whole);
  }
}

// ---------------------------------------------------------------------------
// H4 — the first password: shown once, never logged, cleared, held only in the body
// ---------------------------------------------------------------------------
function h4FirstPassword(): void {
  header("H4 the first password: shown once, never logged, held only in the POST body");
  const usersSrc = readFileSync(join(process.cwd(), "app", "UsersScreen.tsx"), "utf8");
  const actionsSrc = readFileSync(join(process.cwd(), "app", "UserActionsSheet.tsx"), "utf8");

  const rendered = (usersSrc.match(/\{FIRST_PASSWORD_NOTE\}/g) ?? []).length;
  check("the first-password note is RENDERED exactly once", rendered === 1, `rendered ${String(rendered)}x`);
  check(
    "CONTROL: the identifier is present at all (the scan can fire)",
    usersSrc.includes("FIRST_PASSWORD_NOTE"),
  );
  check(
    "the note is a clean sentence pointing at where the person changes it themselves",
    FIRST_PASSWORD_NOTE.length > 0 && leaks(FIRST_PASSWORD_NOTE) === null && FIRST_PASSWORD_NOTE.includes("บัญชีของฉัน"),
    FIRST_PASSWORD_NOTE,
  );

  // Nothing logs. Neither screen calls console.* at all, so the typed password
  // cannot reach a log; and the add buffer is cleared the instant a create submits.
  check("UsersScreen logs NOTHING (no console.*)", !usersSrc.includes("console."), "no console. in the roster screen");
  check("UserActionsSheet logs NOTHING (no console.*)", !actionsSrc.includes("console."), "no console. in the actions sheet");
  check("the add-user password buffer is cleared on submit", usersSrc.includes('setPassword("")'));

  // checkNewUser carries the password ONLY in the body it hands to the POST — no
  // other field, and it is not trimmed (a space is a valid character).
  const withSpace = "  hunter22 ";
  const ok = checkNewUser({ username: " somsak ", full_name: " สมศักดิ์ ", role: "staff", password: withSpace });
  check("checkNewUser accepts a valid form", ok.ok === true);
  if (ok.ok) {
    check("the password is passed THROUGH untrimmed (a space is a valid character)", ok.body.password === withSpace);
    check("username and full_name ARE trimmed (the server strips them)",
      ok.body.username === "somsak" && ok.body.full_name === "สมศักดิ์");
    const bodyJson = JSON.stringify(ok.body);
    const fieldsCarryingPw = [ok.body.username, ok.body.full_name, ok.body.role, ok.body.password].filter(
      (v) => v === withSpace,
    );
    check("the password is carried in EXACTLY one body field (the password), nowhere else",
      bodyJson.includes(withSpace) && fieldsCarryingPw.length === 1);
  }
  const short = checkNewUser({ username: "u", full_name: "n", role: "staff", password: "sevench" });
  check("a short password is refused at the edge (a 422 is never rendered raw)",
    short.ok === false && short.field === "password");
}

// ---------------------------------------------------------------------------
// H5 — the destructive confirmations name their consequence
// ---------------------------------------------------------------------------
function h5Confirmations(): void {
  header("H5 the destructive confirmations name what they do to the person's phone");
  const actionsSrc = readFileSync(join(process.cwd(), "app", "UserActionsSheet.tsx"), "utf8");

  check(
    "the deactivate confirmation says the person's DEVICE signs out",
    DEACTIVATE_CONSEQUENCE.includes("เครื่อง") && DEACTIVATE_CONSEQUENCE.includes("ออกจากระบบ"),
    DEACTIVATE_CONSEQUENCE,
  );
  check(
    "the reset confirmation says the person's device signs out and needs the new password",
    RESET_CONSEQUENCE.includes("ออกจากระบบ"),
    RESET_CONSEQUENCE,
  );
  check(
    "the last-admin note (the client second layer) says what the absence protects",
    LAST_ADMIN_NOTE.includes("ผู้ดูแลระบบ") && LAST_ADMIN_NOTE.includes("อย่างน้อยหนึ่ง"),
    LAST_ADMIN_NOTE,
  );
  check("the self row points at the account screen for its own password", SELF_ROW_NOTE.includes("บัญชีของฉัน"));
  check("the deactivate confirmation is rendered by the actions sheet", actionsSrc.includes("DEACTIVATE_CONSEQUENCE"));
  check("no leak in any of the four sentences",
    leaks(DEACTIVATE_CONSEQUENCE) === null && leaks(RESET_CONSEQUENCE) === null
      && leaks(LAST_ADMIN_NOTE) === null && leaks(SELF_ROW_NOTE) === null);
}

// ---------------------------------------------------------------------------
// R1..R4 — the live round: the app's request SHAPE against a real server
// ---------------------------------------------------------------------------
const API = process.env.RECYCLE_API_BASE ?? "http://127.0.0.1:8000";
const TENANT_A = "11111111-1111-1111-1111-111111111111";
const RUN = Math.random().toString(36).slice(2, 8);
const apiFetch = withClientVersion(globalThis.fetch.bind(globalThis));

async function login(username: string, password: string): Promise<string | null> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenant_id: TENANT_A, username, password }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { access_token?: string }).access_token ?? null;
}

/** The app's request shape (withClientVersion on every call), reconstructed because
 *  app/api.ts cannot be imported here. Returns a UserFetch, like the app's transport. */
async function tx(makeReq: () => Promise<Response>): Promise<UserFetch> {
  let res: Response;
  try {
    res = await makeReq();
  } catch {
    return { kind: "unreachable" };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok) return { kind: "ok", body };
  return { kind: "http", status: res.status, body };
}
const authHdr = (token: string) => ({ authorization: `Bearer ${token}` });

async function liveRound(): Promise<void> {
  header("R the REAL server: create, deactivate, prove the token is refused, reactivate, reset");
  const adminToken = await login("admin", "tenantA-pw-123");
  check("R0: the seeded tenant-A admin can sign in against the real API", adminToken !== null, `api=${API}`);
  if (adminToken === null) throw new Error(`admin login failed at ${API}`);

  // R1: create a user through the app's shape.
  const username = `p37-${RUN}`;
  const password = `first-pw-${RUN}-xyz`;
  const created = await tx(() =>
    apiFetch(`${API}/users`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHdr(adminToken) },
      body: JSON.stringify({ username, full_name: "P3.7 live user", role: "staff", password }),
    }),
  );
  check("R1: POST /users classifies as ok (created)", userWriteOutcome(created).kind === "ok",
    created.kind === "http" ? `status ${String(created.status)}` : created.kind);
  const newId =
    created.kind === "ok" && typeof created.body === "object" && created.body !== null
      ? (created.body as { user_id?: unknown }).user_id
      : undefined;
  check("R1: the create returned the new user's id", typeof newId === "string", String(newId));
  if (typeof newId !== "string") throw new Error("no user_id from POST /users");

  // R2: the created user can sign in NOW; after an admin deactivates them, that
  // same token is REFUSED — the heart of "removed the employee".
  const userToken = await login(username, password);
  check("R2a: the new user can sign in with the first password", userToken !== null);
  if (userToken === null) throw new Error("new user could not sign in");
  const whoBefore = await fetch(`${API}/whoami`, { headers: authHdr(userToken) });
  check("R2a: and their token reaches an authenticated endpoint (200 before)", whoBefore.status === 200,
    `status ${String(whoBefore.status)}`);

  const deact = await tx(() =>
    apiFetch(`${API}/users/${encodeURIComponent(newId)}/deactivate`, { method: "POST", headers: authHdr(adminToken) }),
  );
  check("R2b: POST deactivate classifies ok", userWriteOutcome(deact).kind === "ok",
    deact.kind === "http" ? `status ${String(deact.status)}` : deact.kind);
  const whoAfter = await fetch(`${API}/whoami`, { headers: authHdr(userToken) });
  check("R2c: THE DEACTIVATED USER'S EXISTING TOKEN IS NOW REFUSED (401) — removal is real",
    whoAfter.status === 401, `status ${String(whoAfter.status)}`);
  const reloginBlocked = await login(username, password);
  check("R2d: and they cannot sign in again while deactivated", reloginBlocked === null);

  // R3: reactivate — they can sign in again.
  const react = await tx(() =>
    apiFetch(`${API}/users/${encodeURIComponent(newId)}/activate`, { method: "POST", headers: authHdr(adminToken) }),
  );
  check("R3: POST activate classifies ok", userWriteOutcome(react).kind === "ok");
  const reloginOk = await login(username, password);
  check("R3: the reactivated user can sign in again", reloginOk !== null);

  // R4: an admin resets their password — the old one stops working, the new one works.
  const newPassword = `reset-pw-${RUN}-abc`;
  const reset = await tx(() =>
    apiFetch(`${API}/users/${encodeURIComponent(newId)}/password`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHdr(adminToken) },
      body: JSON.stringify({ new_password: newPassword }),
    }),
  );
  check("R4: POST reset password classifies ok", userWriteOutcome(reset).kind === "ok");
  const oldPw = await login(username, password);
  const newPw = await login(username, newPassword);
  check("R4: the OLD password no longer signs in, the NEW one does", oldPw === null && newPw !== null);
}

async function main(): Promise<number> {
  console.log("P3.7 — user management on the phone");
  console.log(`node ${process.version}`);
  const offline = process.argv.includes("--offline");

  h1EntryGate();
  h2Roster();
  h3Refusals();
  h4FirstPassword();
  h5Confirmations();

  if (offline) {
    console.log("\n=== R SKIPPED (--offline) ===");
    console.log("  The live round is the only case that reads the server's ACTUAL answers.");
    console.log("  Everything above proves the client agrees with itself.");
    console.log("\nINCOMPLETE — the headless cells passed but nothing was verified against the API.");
    // Exit 2, never 0: a proof that skipped its own subject must not read as green.
    return failures === 0 ? 2 : 1;
  }

  try {
    await liveRound();
  } catch (err) {
    failures += 1;
    console.log(`\n  [FAIL] the live server could not be driven at ${API}`);
    console.log(`         ${err instanceof Error ? err.message : String(err)}`);
    console.log("         Start a uvicorn on a scratch and set RECYCLE_API_BASE, or run --offline (exits 2).");
  }

  console.log("");
  console.log(`  passes=${String(passes)}  failures=${String(failures)}`);
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

void main().then((rc) => {
  console.log(`PROVE_USERS_EXIT=${String(rc)}`);
  process.exitCode = rc;
});
