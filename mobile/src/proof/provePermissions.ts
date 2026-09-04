/**
 * PROVE THE PHONE'S HALF OF THE PERMISSION MODEL (server migration 0019,
 * STRUCTURE.md section 3.3): the claim reader, the one gate `may()`, the SQLite
 * cache keyed on the user, and the wording that keeps the pre-0019 code alive
 * for rows that still carry it.
 *
 *   npm run prove:permissions
 *
 * Headless, pure node: a real SQLite file for the cache, hand-built tokens for
 * the claims. Nothing here talks to a server; the server half is
 * server/scripts/prove_permissions.py.
 *
 * THE CELLS, and the disproof each stands against:
 *
 *   C   readTokenPermissions: an array claim reads as a Set; an ABSENT claim (a
 *       pre-0019 token) reads as null, not as an empty Set; a non-array claim is
 *       null; an EMPTY array is an empty Set. Disproof: reading absent as empty
 *       would hide every control from every phone holding an old token.
 *   G   may(): an absent set OFFERS everything (fails open, the file's argument);
 *       a present set is EXACT — it offers what it holds and hides what it lacks;
 *       an empty set hides everything. This is the 0019 NARROWING: a set that was
 *       read and lacks bills.void hides the button even though the role code
 *       beside it is unknown. Disproof: `may(new Set(), x)` reading true.
 *   K   the cache is KEYED ON THE USER: a set stored for user A is absent for
 *       user B; replace is whole-set; an empty set stored reads back EMPTY (the
 *       sentinel), never absent; clear forgets everyone. Disproof: the sketch's
 *       one-row table, which would hand user B user A's set after a crash between
 *       the keystore write and the cache write (the owner's decision 7).
 *   W   the wording: `permission_required` (the 0019 code) and `admin_required`
 *       (the pre-0019 code, PERSISTED on rows refused before the deploy) both
 *       render the same known sentence for void_bill and for daily_report, never
 *       the unknown fallback; the summary's 403 with either code names the owner.
 *       Disproof: deleting the legacy key drops every old row to the unknown text.
 *   A   readWhoAmI: `permissions` rides as a Set; absent is null; `owner` is a
 *       role this build knows and labels เจ้าของร้าน.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { initConnection } from "../adapters/sqlite/schema.js";
import { SqlitePermissionStore } from "../adapters/sqlite/SqlitePermissionStore.js";
import { summaryScreen } from "../dashboard/summaryView.js";
import { may, readTokenPermissions, readTokenRole, readTokenUserId } from "../session/deviceRole.js";
import { readWhoAmI } from "../settings/account.js";
import { roleLabelOf } from "../settings/roleLabel.js";
import { forbiddenReason } from "../sync/parkedReason.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/** base64url with no padding, as a JWT segment is. */
function b64url(json: string): string {
  return Buffer.from(json, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function token(claims: Record<string, unknown>): string {
  return `aa.${b64url(JSON.stringify(claims))}.cc`;
}

const same = (a: ReadonlySet<string> | null, b: readonly string[]): boolean =>
  a !== null && a.size === b.length && b.every((p) => a.has(p));

/* -------------------------------------------------------------------- C -- */

function cClaims(): void {
  header("C — readTokenPermissions: absent is null, empty is empty, an array is a Set");
  const withClaim = token({ sub: "u1", role: "staff", permissions: ["bills.create", "bills.read"] });
  check("an array claim reads as the Set of its strings", same(readTokenPermissions(withClaim), ["bills.create", "bills.read"]));
  const preDeploy = token({ sub: "u1", role: "staff" });
  check("an ABSENT claim (a pre-0019 token) reads as null, NOT as an empty Set", readTokenPermissions(preDeploy) === null);
  check("a non-array claim reads as null", readTokenPermissions(token({ permissions: "bills.create" })) === null);
  check("an array holding a non-string reads as null", readTokenPermissions(token({ permissions: ["bills.create", 7] })) === null);
  const empty = readTokenPermissions(token({ permissions: [] }));
  check("an EMPTY array reads as an empty Set (read, not unknown)", empty !== null && empty.size === 0);
  check("a null token, a non-JWT and a broken segment are all null, never a crash",
    readTokenPermissions(null) === null && readTokenPermissions("hello") === null && readTokenPermissions("aa.!!!.cc") === null);
  check("the role reader now knows owner (the third system role)", readTokenRole(token({ role: "owner" })) === "owner");
  check("a role code this build does not know reads as null for DISPLAY, and nothing is gated on it",
    readTokenRole(token({ role: "cashier", permissions: ["bills.read"] })) === null &&
      same(readTokenPermissions(token({ role: "cashier", permissions: ["bills.read"] })), ["bills.read"]));
  check("readTokenUserId still reads sub", readTokenUserId(withClaim) === "u1");
}

/* -------------------------------------------------------------------- G -- */

function gGate(): void {
  header("G — may(): absent offers everything; present is exact; empty hides everything");
  check("an ABSENT set offers the void button (fails open)", may(null, "bills.void"));
  check("an ABSENT set offers every control", may(null, "prices.write") && may(null, "users.manage") && may(null, "roles.manage"));
  const staff = new Set(["bills.create", "bills.read", "sellers.create"]);
  check("a present set OFFERS what it holds", may(staff, "bills.create") && may(staff, "sellers.create"));
  check("a present set HIDES what it lacks — the 0019 narrowing", !may(staff, "bills.void") && !may(staff, "prices.write") && !may(staff, "users.manage"));
  check("an EMPTY set hides everything (read, not unknown)", !may(new Set(), "bills.create") && !may(new Set(), "bills.void"));
  check("PRESENCE SIBLING: the same empty Set is not null, so the absence above is the gate, not a null slipping through",
    new Set().size === 0 && !may(new Set(), "bills.read"));
}

/* -------------------------------------------------------------------- K -- */

async function kCache(): Promise<void> {
  header("K — the cache is keyed on the user, replaced whole, empty stays empty, cleared on sign-out");
  const dir = mkdtempSync(join(tmpdir(), "prove-permissions-"));
  const file = join(dir, "recycle.db");
  const driver = NodeSqliteDriver.open(file);
  try {
    await initConnection(driver);
    const store = new SqlitePermissionStore(driver);
    check("K: a caller with no user id reads null", (await store.read(null)) === null);
    check("K: a user never stored reads null (absent, fails open)", (await store.read("user-a")) === null);
    await store.replace("user-a", new Set(["bills.create", "bills.void"]));
    check("K: the stored set reads back exactly", same(await store.read("user-a"), ["bills.create", "bills.void"]));
    check("K: ANOTHER user reads null — a set is never handed to the wrong person", (await store.read("user-b")) === null);
    await store.replace("user-a", new Set(["bills.create"]));
    check("K: replace is WHOLE-SET — the revoked permission is gone, not merged", same(await store.read("user-a"), ["bills.create"]));
    await store.replace("user-a", new Set());
    const emptyBack = await store.read("user-a");
    check("K: an EMPTY set stored reads back EMPTY, never absent (the sentinel)", emptyBack !== null && emptyBack.size === 0);
    await store.replace("user-b", new Set(["users.manage"]));
    check("K: two users hold two sets side by side", same(await store.read("user-b"), ["users.manage"]) && (await store.read("user-a"))?.size === 0);
    await store.clear();
    check("K: clear forgets every user (sign-out)", (await store.read("user-a")) === null && (await store.read("user-b")) === null);
    // The sentinel never leaks as a permission.
    await store.replace("user-c", new Set());
    const c = await store.read("user-c");
    check("K: the sentinel row is not a permission — an empty set has size 0 after read", c !== null && c.size === 0 && !c.has("__empty__"));
  } finally {
    await driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/* -------------------------------------------------------------------- W -- */

function wWording(): void {
  header("W — permission_required and the LEGACY admin_required both render the known sentence");
  const v = forbiddenReason("permission_required", "void_bill");
  const vOld = forbiddenReason("admin_required", "void_bill");
  check("W: void_bill + permission_required is a KNOWN refusal naming the owner", !v.unknown && v.badge === "ไม่มีสิทธิ์ยกเลิกบิล" && v.what.includes("เจ้าของร้าน"));
  check("W: void_bill + admin_required (a row refused before the deploy) renders the SAME sentence", !vOld.unknown && vOld.badge === v.badge && vOld.what === v.what);
  const d = forbiddenReason("permission_required", "daily_report");
  const dOld = forbiddenReason("admin_required", "daily_report");
  check("W: daily_report + permission_required is known and names the owner", !d.unknown && d.badge === "ไม่มีสิทธิ์ดูยอดประจำวัน" && d.what.includes("เจ้าของร้าน"));
  check("W: daily_report + admin_required renders the SAME sentence", !dOld.unknown && dOld.badge === d.badge && dOld.what === d.what);
  check("W: PRESENCE SIBLING — a code nobody knows still falls to the unknown text", forbiddenReason("no_such_code", "void_bill").unknown);
  const s = summaryScreen({ kind: "http", status: 403, code: "permission_required" });
  const sOld = summaryScreen({ kind: "http", status: 403, code: "staff_money_hidden" });
  const sText = s.kind === "message" ? s.lines.join("") : "";
  const sOldText = sOld.kind === "message" ? sOld.lines.join("") : "";
  check("W: the summary's 403 permission_required is the calm owner message, no action", s.kind === "message" && s.tone === "forbidden" && s.action === null && sText.includes("เจ้าของร้าน"));
  check("W: the summary's legacy staff_money_hidden renders the same message", sOld.kind === "message" && sOld.tone === "forbidden" && sOldText.length > 0 && sOldText === sText);
}

/* -------------------------------------------------------------------- A -- */

function aWhoAmI(): void {
  header("A — readWhoAmI carries the permission set, and owner is a labelled role");
  const who = readWhoAmI({ username: "somchai", role: "owner", permissions: ["bills.void", "roles.manage"] });
  check("A: permissions ride as a Set", who !== null && same(who.permissions, ["bills.void", "roles.manage"]));
  check("A: owner is read as owner and labelled เจ้าของร้าน", who?.role === "owner" && roleLabelOf(who.role) === "เจ้าของร้าน");
  const pre = readWhoAmI({ username: "somchai", role: "admin" });
  check("A: a pre-0019 answer with no permissions key reads null (unknown), not empty", pre !== null && pre.permissions === null);
  const bad = readWhoAmI({ username: "somchai", role: "admin", permissions: "all" });
  check("A: a permissions value that is not an array of strings reads null", bad !== null && bad.permissions === null);
  check("A: a code the build does not know is shown as itself, null as ไม่ทราบสิทธิ์", roleLabelOf("cashier") === "cashier" && roleLabelOf(null) === "ไม่ทราบสิทธิ์");
}

async function main(): Promise<void> {
  cClaims();
  gGate();
  await kCache();
  wWording();
  aWhoAmI();
  console.log(failures === 0 ? "\nALL CELLS PASSED" : `\n${String(failures)} CELL(S) FAILED`);
  console.log(`PROVE_PERMISSIONS_EXIT=${failures === 0 ? 0 : 1}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

void main();
