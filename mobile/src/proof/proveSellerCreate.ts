/**
 * P1.8a phase 2 proof: A CLIENT CAN CREATE A SELLER, AND THE RESULT COMES BACK
 * CLASSIFIED.
 *
 *   npm run prove:sellercreate
 *
 * IT REQUIRES A REAL SERVER, and it requires to be TOLD which one:
 *
 *   RECYCLE_API_BASE            e.g. http://127.0.0.1:53812   (no default)
 *   RECYCLE_BINDING_SENTINEL    the code of a seller row that exists ONLY in
 *                               the scratch database, written directly into it
 *                               BEFORE the server started
 *
 * NEITHER HAS A DEFAULT, and that is the point. A default of :8000 would quietly
 * drive every cell below into whatever server happens to be running there — and
 * on this box that is the DEV database. An API process is bound to its database
 * AT STARTUP, so a proof pointed at scratch while the server runs against dev
 * writes into dev and reports a scratch run. This script cannot move a running
 * server, so it does the one thing it can: it REFUSES to run until something
 * tells it what it is talking to, and then C0 MEASURES the answer instead of
 * believing it.
 *
 * THIS SCRIPT WRITES SELLERS THROUGH THE REAL PATH. `is_active` retires a seller
 * and does not remove one, so every run leaves permanent rows in whatever
 * database it is pointed at. DEV IS NOT SCRATCH.
 *
 * REPEATABLE. Run it twice with no reseed and it passes twice
 * (lessons/proof-must-run-twice.md). Every code it supplies is scoped to a
 * per-run uuid, and the one value it cannot choose — the code the SERVER
 * assigns — is asserted RELATIVE to the maximum read out of the server's own
 * roster immediately before the call, never against a fixed string.
 *
 * ON THE OUTPUT. Some of it is Thai. Mojibake in the console is the console —
 * this box is codepage 874, see lessons/console-is-not-the-observation.md. Every
 * assertion compares JavaScript strings, never console bytes.
 *
 * WHAT IS NEVER PRINTED: the body of a 422. FastAPI's validation refusal
 * serialises the value it rejected, and on this route that value can be an ID
 * CARD NUMBER (lessons/a-refusal-hands-back-what-it-refused.md). No cell below
 * reads a refusal body, and no failure message quotes one.
 *
 * THE EXIT LINE. main() prints `SELLERCREATE_EXIT=<n>` from the same integer it
 * returns. That line is ABSENT if the script dies before the summary. THE
 * ABSENCE IS THE SIGNAL: a reader scanning for a number and finding none has NOT
 * found a pass.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteMasterStore } from "../adapters/sqlite/SqliteMasterStore.js";
import { SellerApi } from "../master/createSeller.js";
import type { CreateSellerOutcome, SellerDraft } from "../master/createSeller.js";
import type { MasterSeller } from "../master/types.js";
import { signInProofDevice } from "./proofDevice.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/* ------------------------------------------------------------ environment -- */

const RUN = crypto.randomUUID().slice(0, 8);
const TENANT_A = "11111111-1111-1111-1111-111111111111";

/**
 * The seeded accounts. Held in the FILE and never on a command line: every shell
 * command on this box is logged verbatim to .claude/hooks/*.log. Same literals
 * proveForbidden.ts already carries.
 */
const STAFF = { username: "staff", password: "tenantA-staff-789" };
const ADMIN = { username: "admin", password: "tenantA-pw-123" };

const API = process.env["RECYCLE_API_BASE"] ?? "";
const SENTINEL = process.env["RECYCLE_BINDING_SENTINEL"] ?? "";

/**
 * C7's break, applied by the PROOF and never by a hook inside the module under
 * test. `--break=path` points the caller at a prefix the server does not serve,
 * so its requests are answered 404 by a server that is otherwise healthy.
 */
const BREAK = (process.argv.find((a) => a.startsWith("--break=")) ?? "").split("=")[1] ?? "";

/** The baseUrl the CALLER gets. Every roster read below uses API directly. */
const CALLER_BASE = BREAK === "path" ? `${API}/__no_such_prefix` : API;

interface RawSeller {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  grade: string | null;
  id_number?: string | null;
  address?: string | null;
  vehicle_no?: string | null;
}

async function login(who: { username: string; password: string }): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenant_id: TENANT_A, username: who.username, password: who.password }),
  });
  if (!res.ok) throw new Error(`login ${who.username} -> HTTP ${String(res.status)}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

/** The server's roster, read with a plain fetch — never through the caller. */
async function roster(token: string): Promise<RawSeller[]> {
  const res = await fetch(`${API}/sellers?include_inactive=true`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`GET /sellers -> HTTP ${String(res.status)}`);
  return ((await res.json()) as { sellers: RawSeller[] }).sellers;
}

/**
 * The highest `S<n>` the server currently holds for this tenant, 0 if none.
 *
 * READ FROM THE SERVER, because the number it is about to assign is a function
 * of the database's state and not of anything this script chose. The shape is
 * written out here rather than imported from the server, so the checker does not
 * share the constant it checks
 * (lessons/a-checker-must-not-share-the-code-it-checks.md).
 */
const ASSIGNED = /^S(\d+)$/;

function maxAssigned(sellers: readonly RawSeller[]): number {
  let max = 0;
  for (const s of sellers) {
    const m = ASSIGNED.exec(s.code);
    if (m !== null) max = Math.max(max, Number(m[1]));
  }
  return max;
}

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A caller wired to a token that is fixed for the call. */
function apiFor(token: string | null): SellerApi {
  return new SellerApi({ baseUrl: CALLER_BASE, getToken: () => Promise.resolve(token) });
}

/** The kind, and NOTHING else — no failure message may quote a body. */
const kindOf = (o: CreateSellerOutcome): string => o.kind;

/* ---------------------------------------------------------------- C0 ------ */

/**
 * WHICH DATABASE THE SERVER IS BOUND TO, measured rather than intended.
 *
 * The sentinel is a seller row written DIRECTLY into the scratch database before
 * this server process existed, carrying a uuid minted for this session. No other
 * database on this cluster can hold it. A server bound to dev would answer every
 * request below perfectly well — the route is declared in both — and fail here.
 *
 * THE NON-EMPTY CHECK COMES FIRST, and it is not decoration: a membership test
 * over an empty list is satisfied by a broken roster, a dropped table and a
 * reader that always returns nothing.
 */
async function c0Binding(adminToken: string): Promise<void> {
  header("C0: WHICH DATABASE THE SERVER IS BOUND TO");

  const sellers = await roster(adminToken);
  const codes = new Set(sellers.map((s) => s.code));
  console.log(`  api base          : ${API}`);
  console.log(`  caller base       : ${CALLER_BASE}${BREAK ? "   <-- BROKEN ON PURPOSE" : ""}`);
  console.log(`  sellers on roster : ${String(sellers.length)}`);
  console.log(`  sentinel expected : ${SENTINEL}`);

  check(
    "C0: the roster came back NON-EMPTY — without this the next cell is vacuous",
    sellers.length > 0,
    `${String(sellers.length)} sellers`,
  );
  check(
    "C0: the server returned the binding sentinel, which exists only in the scratch database",
    codes.has(SENTINEL),
    codes.has(SENTINEL) ? "observed, not intended" : `${SENTINEL} NOT in the roster`,
  );
}

/* ---------------------------------------------------------------- C1 ------ */

/**
 * THE ROUTE, NOT THE VALUE.
 *
 * The claim of this phase is that a request TRAVELLED. Every assertion available
 * is about a value, and if the value is one the client already had, no
 * comparison can tell you it went anywhere — a stub returning its own input
 * would pass (lessons/a-value-comparison-cannot-prove-a-path.md).
 *
 * So this cell asserts on the two things IN THE RESPONSE THAT THE CLIENT COULD
 * NOT HAVE PRODUCED:
 *
 *   the ASSIGNED CODE  no code was sent at all, and the value is not a constant:
 *                      it is one past a maximum read out of the server moments
 *                      earlier, which moves every run.
 *   the SERVER-MINTED ID  a uuid absent from the roster read before the call,
 *                      and PRESENT in the roster read after it. That second half
 *                      is the provenance: a fabricated uuid cannot make the
 *                      server's own list contain it.
 *
 * What would this run do differently if the expected values were pasted in by
 * hand? The code would have to be guessed against a maximum that changes between
 * runs, and the id would have to appear in a list this script does not write.
 */
async function c1AssignedCode(staffToken: string): Promise<void> {
  header("C1: STAFF creates a seller with NO code — the SERVER assigns one");

  const before = await roster(staffToken);
  const beforeIds = new Set(before.map((s) => s.id));
  const beforeMax = maxAssigned(before);

  const draft: SellerDraft = { name: `ผู้ขายใหม่ ${RUN}`, grade: "B" };
  check("C1: the draft carries NO code", draft.code === undefined);

  const outcome = await apiFor(staffToken).createSeller(draft);
  console.log(`  outcome           : ${kindOf(outcome)}`);
  check("C1: the outcome is `created`", outcome.kind === "created", kindOf(outcome));
  if (outcome.kind !== "created") return;

  const seller = outcome.seller;
  const m = ASSIGNED.exec(seller.code);
  console.log(`  max S<n> before   : ${String(beforeMax)}`);
  console.log(`  assigned code     : ${seller.code}`);
  console.log(`  assigned id       : ${seller.id}`);

  check(
    "C1: the code has the shape THIS server assigns, and is one past the maximum read before the call",
    m !== null && Number(m[1]) === beforeMax + 1,
    `S${String(beforeMax + 1)} expected, got ${seller.code}`,
  );
  check(
    "C1: the id is a uuid, and it was NOT on the roster before the call",
    UUID_SHAPE.test(seller.id) && !beforeIds.has(seller.id),
    `uuid=${String(UUID_SHAPE.test(seller.id))} wasPresent=${String(beforeIds.has(seller.id))}`,
  );
  check("C1: the name is the one that was sent", seller.name === draft.name);

  // PROVENANCE. The server's own list must now contain that id, under that code.
  const after = await roster(staffToken);
  const found = after.find((s) => s.id === seller.id);
  check(
    "C1: the server's roster now holds that id, under that same code — the response was not invented",
    found !== undefined && found.code === seller.code && found.name === draft.name,
    found === undefined ? "id absent from the roster after the call" : `code=${found.code}`,
  );
}

/* ---------------------------------------------------------------- C2 ------ */

/** A shop with its own paper code keeps it, EXACTLY as typed. */
async function c2SuppliedCode(staffToken: string): Promise<string | null> {
  header("C2: STAFF creates a seller WITH a code — the server takes it as given");

  const code = `P18B-${RUN}`;
  const draft: SellerDraft = { name: `ร้านรับซื้อ ${RUN}`, code, grade: "A" };
  const outcome = await apiFor(staffToken).createSeller(draft);
  console.log(`  supplied code     : ${code}`);
  console.log(`  outcome           : ${kindOf(outcome)}`);

  check("C2: the outcome is `created`", outcome.kind === "created", kindOf(outcome));
  if (outcome.kind !== "created") return null;

  check("C2: the code is the one that was sent, not one the server minted",
    outcome.seller.code === code, `got ${outcome.seller.code}`);
  check("C2: and it is NOT of the assigned shape — the assigner did not overwrite it",
    ASSIGNED.exec(outcome.seller.code) === null);

  const after = await roster(staffToken);
  check(
    "C2: the server's roster holds exactly ONE seller with that code",
    after.filter((s) => s.code === code).length === 1,
    `${String(after.filter((s) => s.code === code).length)} rows`,
  );
  return code;
}

/* ---------------------------------------------------------------- C3 ------ */

/**
 * THE DUPLICATE, AND THE ASSERTION IS ON WHICH MEMBER.
 *
 * "It failed" is satisfied by a 500, by an outage, by a route that does not
 * exist. The claim is that the caller told phase 3 the ONE thing a screen can
 * act on: this code is taken, type another.
 */
async function c3Duplicate(staffToken: string, code: string): Promise<void> {
  header("C3: the SAME supplied code again — duplicate_code, not a generic refusal");

  const beforeRows = (await roster(staffToken)).filter((s) => s.code === code).length;
  const outcome = await apiFor(staffToken).createSeller({ name: `ซ้ำ ${RUN}`, code });
  const afterRows = (await roster(staffToken)).filter((s) => s.code === code).length;

  console.log(`  outcome           : ${kindOf(outcome)}`);
  console.log(`  rows with ${code}: before=${String(beforeRows)} after=${String(afterRows)}`);

  check(
    "C3: the outcome is `duplicate_code` — not `invalid`, not `unavailable`, not `ambiguous`",
    outcome.kind === "duplicate_code",
    kindOf(outcome),
  );
  check(
    "C3: and nothing was created — the count either side is unchanged at 1",
    beforeRows === 1 && afterRows === 1,
    `before=${String(beforeRows)} after=${String(afterRows)}`,
  );
}

/* ---------------------------------------------------------------- C4 ------ */

/**
 * A REFUSAL ABOUT THE CALLER, kept apart from every refusal about the seller.
 *
 * Both halves are here because they are different mechanisms with one exit. The
 * first never reaches the network at all, and the fetch counter is what proves
 * that rather than asserting it: a caller that posted a seller with no token
 * would have written a row before deciding it was not signed in.
 */
async function c4NotSignedIn(): Promise<void> {
  header("C4: no token, and a bad token — both are `session_expired`, about the CALLER");

  /* ---- (a) no token at all: the request is never sent ---- */
  let calls = 0;
  const counting: typeof globalThis.fetch = (input, init) => {
    calls += 1;
    return globalThis.fetch(input, init);
  };
  const noToken = new SellerApi({
    baseUrl: CALLER_BASE,
    getToken: () => Promise.resolve(null),
    fetchImpl: counting,
  });
  const a = await noToken.createSeller({ name: `ไม่มีโทเคน ${RUN}` });
  console.log(`  (a) no token      : ${kindOf(a)}   fetch calls=${String(calls)}`);
  check("C4a: no token classifies as `session_expired`", a.kind === "session_expired", kindOf(a));
  check(
    "C4a: and the server was never asked — nothing was created before that was decided",
    calls === 0,
    `${String(calls)} fetch calls`,
  );

  /* ---- (b) a token the server rejects: a REAL 401 ---- */
  const bogus = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJub2JvZHkifQ.not-a-signature";
  console.log(`  (b) bad token len : ${String(bogus.length)}`);
  const b = await apiFor(bogus).createSeller({ name: `โทเคนผิด ${RUN}` });
  console.log(`  (b) bad token     : ${kindOf(b)}`);
  check("C4b: a real 401 classifies as `session_expired`", b.kind === "session_expired", kindOf(b));
  check(
    "C4b: and it is a DIFFERENT member from C3's — a screen can route one to sign-in and one to the form",
    b.kind !== "duplicate_code",
    kindOf(b),
  );
}

/* ---------------------------------------------------------------- C5 ------ */

/**
 * EXHAUSTIVENESS. The `never` arm is the mechanism, and this switch is the
 * instance of it that gets compiled.
 *
 * Removing any one `case` below makes `outcome` non-`never` at the default arm
 * and `npm run typecheck` fails. That is stated as a compiler error in the phase
 * report, measured, and not asserted here in prose — a proof cannot observe its
 * own compilation.
 */
function describe(outcome: CreateSellerOutcome): string {
  switch (outcome.kind) {
    case "created":
      return `created ${outcome.seller.code}`;
    case "duplicate_code":
      return "that code is taken";
    case "code_assignment_failed":
      return "the server could not mint a code — type one";
    case "session_expired":
      return "sign in again";
    case "forbidden":
      return `not permitted: ${outcome.code}`;
    case "invalid":
      return "the form cannot be sent as it is";
    case "unavailable":
      return "no usable answer — try again";
    case "ambiguous":
      return "it may have been created — refresh and look";
    default: {
      const never: never = outcome;
      throw new Error(`unhandled create-seller outcome: ${JSON.stringify(never)}`);
    }
  }
}

function c5Exhaustive(): void {
  header("C5: every member of the union is handled, and the switch has a `never` arm");

  const members: CreateSellerOutcome[] = [
    {
      kind: "created",
      seller: {
        id: "00000000-0000-4000-8000-000000000001",
        code: "S999",
        name: "x",
        phone: null,
        grade: null,
        id_number: null,
        address: null,
        vehicle_no: null,
        is_active: true,
      },
    },
    { kind: "duplicate_code" },
    { kind: "code_assignment_failed" },
    { kind: "session_expired" },
    { kind: "forbidden", code: "admin_required" },
    { kind: "invalid" },
    { kind: "unavailable" },
    { kind: "ambiguous" },
  ];

  const labels = members.map((m) => describe(m));
  for (const [i, m] of members.entries()) console.log(`  ${m.kind.padEnd(23)} -> ${labels[i] ?? ""}`);

  check("C5: eight members, every one reaching a case arm", members.length === 8, `${String(members.length)}`);
  check(
    "C5: each produces a distinct, non-empty sentence — no two collapse onto one instruction",
    new Set(labels).size === members.length && labels.every((l) => l.length > 0),
    `${String(new Set(labels).size)} distinct of ${String(members.length)}`,
  );

  /*
   * THE UNION CARRIES NO DIAGNOSTIC. Not "must not be rendered" — must not
   * EXIST. Serialising every member and looking for the field names is the
   * cheap, structural form of that claim: if a `detail` were added tomorrow,
   * this cell goes red before any screen has a chance to print it.
   */
  const banned = ["detail", "message", "status", "reason", "body", "input"];
  const serialised = JSON.stringify(members);
  const present = banned.filter((f) => serialised.includes(`"${f}"`));
  check(
    "C5: no member carries a detail, a message, a status, a reason, a body or an input",
    present.length === 0,
    present.length === 0 ? "checked by name against a serialised instance of every member" : present.join(", "),
  );
}

/* ---------------------------------------------------------------- C6 ------ */

/**
 * THE PII BOUNDARY, WITH BOTH CONTROLS IT NEEDS.
 *
 * The claim is that id_number, address and vehicle_no never reach the device's
 * cache. "Absent" is satisfied by an empty cache, a failed refresh, a table that
 * was never written and a server that never held the values — so an absence
 * assertion is worth nothing without siblings that fire:
 *
 *   the SERVER really stored all three   (else "absent" measures the server)
 *   name and code ARE in the cache row   (else "absent" measures an empty table)
 *   the row was ABSENT before the refresh (else it measures nothing at all —
 *                                          saveSellers DELETEs unconditionally,
 *                                          so the seller appears only after one)
 *
 * The refresh hands `saveSellers` the RAW objects the server sent, which is
 * exactly what App.tsx:521-523 does: `fetchSellers` -> `store.saveSellers(ss)`,
 * no mapping in between. The protection is the writer's column list and a STRICT
 * table with no such columns — not a transformation somebody remembered.
 */
async function c6PiiBoundary(staffToken: string): Promise<void> {
  header("C6: the three PII fields reach the SERVER and never reach the device cache");

  const idNumber = `1${RUN.replace(/\D/g, "0").padEnd(12, "7").slice(0, 12)}`;
  const address = `123/45 ถนนทดสอบ ${RUN}`;
  const vehicle = `70-${RUN.slice(0, 4)}`;
  const code = `P18B-PII-${RUN}`;

  const outcome = await apiFor(staffToken).createSeller({
    name: `ผู้ขายมีข้อมูล ${RUN}`,
    code,
    grade: "B",
    id_number: idNumber,
    address,
    vehicle_no: vehicle,
  });
  console.log(`  outcome           : ${kindOf(outcome)}`);
  check("C6: the seller was created", outcome.kind === "created", kindOf(outcome));
  if (outcome.kind !== "created") return;
  const created = outcome.seller;

  console.log(
    `  sent lengths      : id_number=${String(idNumber.length)}` +
      ` address=${String(address.length)} vehicle_no=${String(vehicle.length)}`,
  );

  /* ---- CONTROL 1: the server really has all three ---- */
  check(
    "C6: the CREATE RESPONSE carries all three back — so the values existed to leak",
    created.id_number === idNumber && created.address === address && created.vehicle_no === vehicle,
    `id_number=${String(created.id_number !== null)} address=${String(created.address !== null)}` +
      ` vehicle_no=${String(created.vehicle_no !== null)}`,
  );

  const sellers = await roster(staffToken);
  const onServer = sellers.find((s) => s.id === created.id);
  check(
    "C6: and GET /sellers carries them too — the refresh the device performs is handed the real values",
    onServer !== undefined &&
      onServer.id_number === idNumber &&
      onServer.address === address &&
      onServer.vehicle_no === vehicle,
    onServer === undefined ? "seller absent from the roster" : "all three present on the wire",
  );

  /* ---- the device ---- */
  const dir = mkdtempSync(join(tmpdir(), `recycle-p18a-${RUN}-`));
  const driver = NodeSqliteDriver.open(join(dir, "device.db"));
  try {
    const master = await SqliteMasterStore.open(driver);
    await signInProofDevice(driver);

    /* CONTROL 3: the row is not there BEFORE the refresh. saveSellers DELETEs
     * the whole table first, so this decoy also proves the sequencing. */
    const decoy: MasterSeller = {
      id: "00000000-0000-4000-8000-0000000000de",
      code: "DECOY",
      name: "ก่อนรีเฟรช",
      phone: null,
      grade: null,
    };
    await master.saveSellers([decoy], new Date().toISOString());
    const beforeRows = await driver.all<Record<string, unknown>>("SELECT * FROM cached_sellers");
    check(
      "C6: BEFORE the refresh the new seller is not in the cache at all",
      beforeRows.length === 1 && !JSON.stringify(beforeRows).includes(created.id),
      `${String(beforeRows.length)} row(s), decoy only`,
    );

    /* THE REFRESH, exactly as App.tsx does it: the raw server objects, unmapped. */
    await master.saveSellers(sellers, new Date().toISOString());

    const columns = await driver.all<{ name: string }>("PRAGMA table_info(cached_sellers)");
    const columnNames = columns.map((c) => c.name);
    console.log(`  cached_sellers    : ${columnNames.join(", ")}`);
    check(
      "C6: the table has NO id_number, address or vehicle_no column — the leak is unrepresentable",
      !columnNames.includes("id_number") &&
        !columnNames.includes("address") &&
        !columnNames.includes("vehicle_no"),
      columnNames.join(","),
    );

    const rows = await driver.all<Record<string, unknown>>("SELECT * FROM cached_sellers");
    const dump = JSON.stringify(rows);
    const cachedRow = rows.find((r) => r["id"] === created.id);

    console.log(`  rows after refresh: ${String(rows.length)}   decoy gone=${String(!dump.includes("DECOY"))}`);

    /* ---- CONTROL 2: the seller IS there, by name and code ---- */
    check(
      "C6: CONTROL — that seller's row IS on disk, carrying its name and its code",
      cachedRow !== undefined && cachedRow["code"] === code && cachedRow["name"] === created.name,
      cachedRow === undefined ? "row absent — the absence assertions below would be vacuous" : "present",
    );

    /* ---- THE CLAIM ---- */
    check(
      "C6: none of the three values appears ANYWHERE in cached_sellers",
      !dump.includes(idNumber) && !dump.includes(address) && !dump.includes(vehicle),
      `id_number=${String(dump.includes(idNumber))} address=${String(dump.includes(address))}` +
        ` vehicle_no=${String(dump.includes(vehicle))}`,
    );

    const snapshot = await master.load();
    const loaded = snapshot.sellers.find((s) => s.id === created.id);
    check(
      "C6: and the reader hands the screen a seller with five fields and no fourth axis of identity",
      loaded !== undefined && Object.keys(loaded).sort().join(",") === "code,grade,id,name,phone",
      loaded === undefined ? "not returned by load()" : Object.keys(loaded).sort().join(","),
    );
  } finally {
    await driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

/* --------------------------------------------------------------- main ----- */

async function main(): Promise<number> {
  console.log("P1.8a phase 2 — a client creates a seller, and the result comes back classified");
  console.log(`node ${process.version}`);
  console.log(`run tag ${RUN}`);

  if (API === "" || SENTINEL === "") {
    console.log("");
    console.log("  [FAIL] REFUSED: RECYCLE_API_BASE and RECYCLE_BINDING_SENTINEL are both required.");
    console.log("         This script creates sellers through the real path and they cannot be");
    console.log("         removed. Neither variable has a default, because a default would point");
    console.log("         it at whatever is listening on :8000 — which on this box is bound to the");
    console.log("         DEV database. Start a server against the scratch database and pass both.");
    console.log("SELLERCREATE_EXIT=2");
    return 2;
  }

  if (BREAK !== "") {
    console.log("");
    console.log(`  *** C7 NEGATIVE CONTROL ACTIVE: --break=${BREAK} ***`);
    console.log("      The caller is pointed at a prefix the server does not serve. The cells that");
    console.log("      measure the route MUST go red. A cell that stays green here is a cell that");
    console.log("      is not measuring what it claims.");
  }

  const staffToken = await login(STAFF);
  const adminToken = await login(ADMIN);
  console.log(`token lengths: staff=${String(staffToken.length)} admin=${String(adminToken.length)}`);

  await c0Binding(adminToken);
  await c1AssignedCode(staffToken);
  const code = await c2SuppliedCode(staffToken);
  if (code !== null) await c3Duplicate(staffToken, code);
  else check("C3: skipped — C2 did not create a code to duplicate", false);
  await c4NotSignedIn();
  c5Exhaustive();
  await c6PiiBoundary(staffToken);

  console.log("");
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

const exitCode = await main().catch((err: unknown) => {
  console.log("");
  console.log(`  [FAIL] the run died: ${err instanceof Error ? err.message : String(err)}`);
  return 1;
});
console.log(`SELLERCREATE_EXIT=${String(exitCode)}`);
process.exitCode = exitCode;
