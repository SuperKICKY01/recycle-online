/**
 * P1.7 proof: the owner pair is STAMPED ONTO THE ROW at creation.
 *
 * Run: npm run prove:owner
 *
 * WHAT THIS PROVES BY READING THE ROW, NOT BY WATCHING THE CALL. Every check
 * below issues its own SELECT against the real database file and prints the two
 * column values it got back. A proof that asserted "the writer was called with
 * X" would pass just as happily if the INSERT named the wrong column, bound the
 * parameters in the wrong order, or listed the owner in the ON CONFLICT DO
 * UPDATE set — and every one of those produces a row that is wrong in a way
 * nobody can see afterwards, on a handset nobody can open (ARCHITECTURE.md
 * section 11).
 *
 * THE CONTROL IS THE HALF THAT MATTERS. A stamp that writes nothing at all
 * satisfies "the columns are null when nobody is signed in" perfectly. So O2's
 * nulls are worth nothing on their own, and O3 exists to require that O1 and O2
 * DISAGREE — measured from the values the two cases actually read back, not
 * asserted separately in each.
 *
 * WHAT THIS PROOF DOES NOT ESTABLISH.
 *   - It runs against node:sqlite. The handset runs expo-sqlite, a different
 *     driver on a different connection (src/device/expoSqliteDriver.ts).
 *   - `App.tsx` is unreachable from here (tsconfig.node.json rootDir is "src"),
 *     so what is driven is `ownerForNewRow` — the same function App.tsx's
 *     `currentOwner` calls, which is why that step was moved into src/. That
 *     App.tsx passes its result to the store is NOT proven here; it is a
 *     one-line call site, and it is the only unproven link in the chain.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteDraftStore } from "../adapters/sqlite/SqliteDraftStore.js";
import { SqliteIdentityStore } from "../adapters/sqlite/SqliteIdentityStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { newDraft } from "../cart/cart.js";
import type { Draft } from "../cart/types.js";
import { ownerForNewRow } from "../session/rowOwner.js";
import { signInAndRecord } from "../session/signInIdentity.js";
import type { SignInResult } from "../session/signInIdentity.js";
import { buildLocalBill } from "../sync/createBill.js";
import type { Clock, IdSource, LocalBill } from "../sync/types.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const ISO = "2026-08-11T03:15:00.000Z";
const clock: Clock = { now: () => new Date(ISO), sleep: () => Promise.resolve() };

class SeqIds implements IdSource {
  private n = 0;
  constructor(private readonly prefix: string) {}
  newId(): string {
    this.n += 1;
    return `${this.prefix}-${String(this.n)}`;
  }
}

/**
 * THE `: string` ANNOTATIONS ARE LOAD-BEARING — do not remove them as noise.
 *
 * Without them TypeScript narrows each to its own literal type, and O4's
 * control that A and B genuinely differ becomes a comparison between two types
 * with no overlap: TS2367, a compile error rather than a runtime check. The
 * annotation is what keeps that control a MEASUREMENT taken during the run
 * instead of a fact the compiler asserts and the proof never tests.
 */
const TENANT_A: string = "11111111-1111-4111-8111-111111111111";
const USER_A: string = "22222222-2222-4222-8222-222222222222";
const TENANT_B: string = "33333333-3333-4333-8333-333333333333";
const USER_B: string = "44444444-4444-4444-8444-444444444444";

/** The two columns as they sit on disk. `undefined` means no such row. */
interface OwnerCols {
  owner_tenant_id: string | null;
  owner_user_id: string | null;
}

function tempDir(name: string): string {
  return mkdtempSync(join(tmpdir(), `recycle-owner-${name}-`));
}

/** Reads the owner columns straight out of the table. No store, no mapper. */
async function ownerOf(
  d: NodeSqliteDriver,
  table: "local_bills" | "local_draft",
  id: string,
): Promise<OwnerCols | null> {
  const rows = await d.all<OwnerCols>(
    `SELECT owner_tenant_id, owner_user_id FROM ${table} WHERE id = ?`,
    [id],
  );
  return rows[0] ?? null;
}

function show(what: string, cols: OwnerCols | null): void {
  console.log(`  ${what}: ${cols === null ? "(no such row)" : JSON.stringify(cols)}`);
}

function isOwnedBy(cols: OwnerCols | null, tenant: string, user: string): boolean {
  return cols !== null && cols.owner_tenant_id === tenant && cols.owner_user_id === user;
}

function isUnowned(cols: OwnerCols | null): boolean {
  return cols !== null && cols.owner_tenant_id === null && cols.owner_user_id === null;
}

/**
 * A login the server accepted. Only the USER comes back on the wire — the
 * tenant is the one the request was made under, which is why signInAndRecord
 * takes it separately and this helper does not carry it.
 */
function login(user: string): () => Promise<SignInResult> {
  return () =>
    Promise.resolve({ kind: "ok", accessToken: `token-for-${user}`, userId: user });
}

interface Bench {
  dir: string;
  file: string;
  d: NodeSqliteDriver;
  drafts: SqliteDraftStore;
  identity: SqliteIdentityStore;
  ids: SeqIds;
}

/** A real file, the real schema, and the three real stores over one driver. */
async function bench(name: string): Promise<Bench> {
  const dir = tempDir(name);
  const file = join(dir, `${name}.db`);
  const d = NodeSqliteDriver.open(file);
  // Opening the bill store runs initConnection, which creates every table.
  await SqliteLocalStore.open(d);
  const drafts = await SqliteDraftStore.open(d);
  return { dir, file, d, drafts, identity: new SqliteIdentityStore(d), ids: new SeqIds(name) };
}

async function teardown(b: Bench): Promise<void> {
  await b.d.close();
  rmSync(b.dir, { recursive: true, force: true });
}

function billFor(b: Bench, draft: Draft): LocalBill {
  return buildLocalBill(
    { clock, ids: b.ids },
    {
      seller_id: draft.seller_id,
      vehicle_no: "70-1234",
      items: [],
      total_amount: "90.00",
      master_as_of: draft.master_as_of,
    },
  );
}

/* ------------------------------------------------------------------ O1 ---- */

/**
 * The signed-in path, both rows, read back out of the table.
 *
 * The draft is read BEFORE the promotion because promoteToBill deletes it —
 * that ordering is not incidental, it is the only window in which the draft row
 * exists to be looked at.
 */
async function o1SignedIn(): Promise<{ draft: OwnerCols | null; bill: OwnerCols | null }> {
  header("O1 — signed in: the draft row and the bill row each carry the pair (3a, 3b)");
  const b = await bench("o1");

  check("CONTROL: nothing is stored before the login", (await b.identity.load()) === null);
  await signInAndRecord(login(USER_A), TENANT_A, b.identity);
  const signedIn = await b.identity.load();
  console.log(`  identity after login: ${JSON.stringify(signedIn)}`);
  check(
    "CONTROL: the login really recorded an identity to stamp FROM",
    signedIn?.tenant_id === TENANT_A && signedIn.user_id === USER_A,
    JSON.stringify(signedIn),
  );

  // ---- 3b: the draft ------------------------------------------------------
  const owner = await ownerForNewRow(b.identity);
  const draft = newDraft(b.ids.newId(), "seller-1", ISO, ISO);
  await b.drafts.save(draft, owner);
  const draftCols = await ownerOf(b.d, "local_draft", draft.id);
  show("local_draft row as read back", draftCols);
  check(
    "3b: the draft row's owner_tenant_id is the tenant that signed in",
    draftCols?.owner_tenant_id === TENANT_A,
    `got=${String(draftCols?.owner_tenant_id)} want=${TENANT_A}`,
  );
  check(
    "3b: the draft row's owner_user_id is the user that signed in",
    draftCols?.owner_user_id === USER_A,
    `got=${String(draftCols?.owner_user_id)} want=${USER_A}`,
  );

  // ---- 3a: the bill, through the ONLY production insert path --------------
  const bill = billFor(b, draft);
  await b.drafts.promoteToBill(draft, bill, await ownerForNewRow(b.identity));
  const billCols = await ownerOf(b.d, "local_bills", bill.id);
  show("local_bills row as read back", billCols);
  check(
    "3a: the bill row's owner_tenant_id is the tenant that signed in",
    billCols?.owner_tenant_id === TENANT_A,
    `got=${String(billCols?.owner_tenant_id)} want=${TENANT_A}`,
  );
  check(
    "3a: the bill row's owner_user_id is the user that signed in",
    billCols?.owner_user_id === USER_A,
    `got=${String(billCols?.owner_user_id)} want=${USER_A}`,
  );
  check(
    "the two columns are not the same value — a tenant written into both would satisfy every check above",
    billCols?.owner_tenant_id !== billCols?.owner_user_id,
    JSON.stringify(billCols),
  );
  check(
    "the draft it came from is gone, so the bill row is the promoted one",
    (await ownerOf(b.d, "local_draft", draft.id)) === null,
  );

  await teardown(b);
  return { draft: draftCols, bill: billCols };
}

/* ------------------------------------------------------------------ O2 ---- */

/**
 * 3c. No identity, and the ABSENCE IS MEASURED rather than arranged: the store
 * is read in this same run and reports null before either row is written. A
 * cleared variable would look identical from inside the writer.
 */
async function o2NoIdentity(): Promise<{ draft: OwnerCols | null; bill: OwnerCols | null }> {
  header("O2 — CONTROL: no identity stored, both rows take null (3c)");
  const b = await bench("o2");

  const stored = await b.identity.load();
  console.log(`  identity store reads: ${JSON.stringify(stored)}`);
  check(
    "3c: the identity store is READ and reports ABSENCE — not assumed empty",
    stored === null,
    `load() returned ${JSON.stringify(stored)}`,
  );
  const owner = await ownerForNewRow(b.identity);
  check(
    "3c: and the owner the writer would use is therefore null",
    owner === null,
    JSON.stringify(owner),
  );

  const draft = newDraft(b.ids.newId(), "seller-1", ISO, ISO);
  await b.drafts.save(draft, owner);
  const draftCols = await ownerOf(b.d, "local_draft", draft.id);
  show("local_draft row as read back", draftCols);
  check("3c: the draft row's owner columns are both null", isUnowned(draftCols), JSON.stringify(draftCols));

  const bill = billFor(b, draft);
  await b.drafts.promoteToBill(draft, bill, await ownerForNewRow(b.identity));
  const billCols = await ownerOf(b.d, "local_bills", bill.id);
  show("local_bills row as read back", billCols);
  check("3c: the bill row's owner columns are both null", isUnowned(billCols), JSON.stringify(billCols));
  check(
    "the row EXISTS — null columns because the owner is unknown, not because nothing was written",
    billCols !== null,
  );

  await teardown(b);
  return { draft: draftCols, bill: billCols };
}

/* ------------------------------------------------------------------ O3 ---- */

/**
 * 3d. The two cases must DISAGREE. A writer that binds nothing produces null in
 * both, which passes O2 and fails only here — this is the check that makes O2
 * worth running.
 */
function o3TheyDiffer(
  signedIn: { draft: OwnerCols | null; bill: OwnerCols | null },
  anon: { draft: OwnerCols | null; bill: OwnerCols | null },
): void {
  header("O3 — CONTROL FOR A STAMP THAT WRITES NOTHING: O1 and O2 must differ (3d)");
  console.log(`  O1 bill : ${JSON.stringify(signedIn.bill)}`);
  console.log(`  O2 bill : ${JSON.stringify(anon.bill)}`);
  console.log(`  O1 draft: ${JSON.stringify(signedIn.draft)}`);
  console.log(`  O2 draft: ${JSON.stringify(anon.draft)}`);

  check(
    "3d: the bill rows differ between signed-in and no-identity",
    JSON.stringify(signedIn.bill) !== JSON.stringify(anon.bill),
  );
  check(
    "3d: the draft rows differ between signed-in and no-identity",
    JSON.stringify(signedIn.draft) !== JSON.stringify(anon.draft),
  );
  check(
    "3d: and the difference is the right way round — O1 owned, O2 unowned",
    isOwnedBy(signedIn.bill, TENANT_A, USER_A) && isUnowned(anon.bill),
  );
}

/* ------------------------------------------------------------------ O4 ---- */

/**
 * THE SHIFT CHANGE, which is the decision this step actually turns on.
 *
 * A opens a cart. B signs in. B types one more character — an ordinary save on
 * the same draft — and then saves the bill. The draft must still say A, because
 * A opened it; the bill must say B, because B handed over the cash and B's
 * token is what the send will go under.
 *
 * The draft half is what the ON CONFLICT DO UPDATE list decides. Adding the two
 * owner columns to it would make this case reattribute A's cart to B on a
 * keystroke, silently, and nothing on the device would ever show it.
 */
async function o4ShiftChange(): Promise<void> {
  header("O4 — a shift change mid-cart: the draft keeps who OPENED it, the bill takes who CLOSED it");
  const b = await bench("o4");

  // CONTROL, BEFORE ANYTHING ELSE: the two identities must actually be two.
  // Every check below compares a row against A or against B, and EVERY ONE OF
  // THEM WOULD PASS with A and B the same value — the case would run, print two
  // rows, and establish nothing whatever about which moment was read. Asserted
  // here rather than left to how the constants at the top happen to be written.
  check(
    "CONTROL: the two identities genuinely differ, in BOTH halves of the pair",
    TENANT_A !== TENANT_B && USER_A !== USER_B,
    `A=${TENANT_A}/${USER_A}  B=${TENANT_B}/${USER_B}`,
  );

  await signInAndRecord(login(USER_A), TENANT_A, b.identity);
  const openerOwner = await ownerForNewRow(b.identity);
  console.log(`  store returned before the draft was STARTED: ${JSON.stringify(openerOwner)}`);
  check(
    "CONTROL: the store returns A at the moment the cart opens",
    openerOwner?.tenant_id === TENANT_A && openerOwner.user_id === USER_A,
    JSON.stringify(openerOwner),
  );
  const draft = newDraft(b.ids.newId(), "seller-1", ISO, ISO);
  await b.drafts.save(draft, openerOwner);
  const asOpened = await ownerOf(b.d, "local_draft", draft.id);
  show("draft after A opened it", asOpened);
  check("CONTROL: A really owns the draft to begin with", isOwnedBy(asOpened, TENANT_A, USER_A));

  // B signs in on the same handset.
  await signInAndRecord(login(USER_B), TENANT_B, b.identity);
  const nowSignedIn = await b.identity.load();
  check(
    "CONTROL: the identity really changed to B",
    nowSignedIn?.tenant_id === TENANT_B && nowSignedIn.user_id === USER_B,
    JSON.stringify(nowSignedIn),
  );

  // An ordinary edit: same draft id, saved again, under B.
  const edited: Draft = { ...draft, vehicle_no: "70-9999", updated_at: ISO };
  const editOwner = await ownerForNewRow(b.identity);
  check(
    "CONTROL: the edit is HANDED B — so the column not moving is a property of the STATEMENT, not of the argument",
    editOwner?.tenant_id === TENANT_B && editOwner.user_id === USER_B,
    JSON.stringify(editOwner),
  );
  await b.drafts.save(edited, editOwner);
  const afterEdit = await ownerOf(b.d, "local_draft", draft.id);
  show("draft after B edited it", afterEdit);
  check(
    "the draft STILL records A — a later save does not reattribute the cart",
    isOwnedBy(afterEdit, TENANT_A, USER_A),
    JSON.stringify(afterEdit),
  );
  check(
    "CONTROL: the edit really landed, so 'unchanged owner' is not 'unchanged row'",
    (
      await b.d.all<{ vehicle_no: string | null }>(
        "SELECT vehicle_no FROM local_draft WHERE id = ?",
        [draft.id],
      )
    )[0]?.vehicle_no === "70-9999",
  );

  const bill = billFor(b, edited);
  // THE READ THAT DECIDES THE BILL, taken and SHOWN immediately before the save
  // rather than passed inline. This is the observation the whole design choice
  // rests on: at the moment of saving the store returns B, and B is therefore
  // what the row must end up carrying. Inline, it was never printed and never
  // checked, so the case could not distinguish "read at save time" from "read
  // at some earlier moment that happened to give the same answer".
  const saverOwner = await ownerForNewRow(b.identity);
  console.log(`  store returned before the bill was SAVED  : ${JSON.stringify(saverOwner)}`);
  check(
    "CONTROL: the store returns B at the moment of saving, and it is NOT the opener",
    saverOwner?.tenant_id === TENANT_B &&
      saverOwner.user_id === USER_B &&
      saverOwner.user_id !== openerOwner?.user_id,
    `saver=${JSON.stringify(saverOwner)} opener=${JSON.stringify(openerOwner)}`,
  );
  await b.drafts.promoteToBill(edited, bill, saverOwner);
  const billCols = await ownerOf(b.d, "local_bills", bill.id);
  show("bill after B saved it", billCols);
  check(
    "the bill records B — whoever closed the cart and handed over the cash",
    isOwnedBy(billCols, TENANT_B, USER_B),
    JSON.stringify(billCols),
  );
  check(
    "the bill did NOT inherit the draft's owner",
    billCols?.owner_user_id !== USER_A,
    `bill user=${String(billCols?.owner_user_id)} draft user=${USER_A}`,
  );
  check(
    "the two rows DISAGREE — which is the entire reason the identity is read at both moments",
    JSON.stringify(asOpened) !== JSON.stringify(billCols),
    `draft=${JSON.stringify(asOpened)} bill=${JSON.stringify(billCols)}`,
  );

  await teardown(b);
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("P1.7 — the owner pair is stamped onto local rows at creation");
  console.log(`node ${process.version}, node:sqlite against real files in ${tmpdir()}`);

  const signedIn = await o1SignedIn();
  const anon = await o2NoIdentity();
  o3TheyDiffer(signedIn, anon);
  await o4ShiftChange();

  console.log("");
  console.log(failures === 0 ? "ALL OWNER CASES PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

main()
  .then((code) => {
    console.log(`OWNER_EXIT=${code}`);
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error("OWNER PROOF CRASHED:", err);
    process.exitCode = 1;
  });
