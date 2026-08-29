/**
 * P1.7 proof: A DRAFT IS NOT HANDED TO SOMEBODY IT DOES NOT BELONG TO — and it
 * is not adopted, and it is not destroyed.
 *
 * Run: npm run prove:draftowner
 *
 * WHY THIS FILE EXISTS WHEN proveOwner ALREADY DRIVES A SHIFT CHANGE.
 * proveOwner's O4 covers the WRITE side: it saves under A, signs in B, saves
 * again, and asserts the draft row still records A. Measured before this work
 * began — `grep "\.load()" proveOwner.ts` returns four hits and all four are
 * `identity.load()` — IT NEVER CALLS THE DRAFT LOADER. So the row was proven
 * correct while the function that hands the row to a person was unexamined, and
 * that function was the whole defect: it returned the newest draft to whoever
 * asked. A proof that asserted only what O4 asserts would go green on the half
 * that already worked (two-green-proofs-do-not-cover-the-seam.md).
 *
 * EVERY CASE HERE REACHES ITS CONCLUSION THROUGH A REAL `SqliteDraftStore.load()`
 * ON A REAL FILE. There is no path in this file that inspects the row and calls
 * that an answer: `loadAs()` below is the ONLY way a case obtains a verdict, it
 * calls the production loader, and the raw-SQL helpers exist solely as CONTROLS
 * showing what is on disk while the loader is refusing it. If a case could reach
 * its conclusion without the loader, it would be proving the predicate rather
 * than the hand-over.
 *
 * WHAT THIS DOES NOT ESTABLISH.
 *   - node:sqlite, not the handset's expo-sqlite.
 *   - App.tsx is unreachable from here (tsconfig.node.json rootDir "src"). What
 *     is driven is the loader and `withheldDraftNotice`; that App.tsx renders
 *     the one from the other is a one-line call site and is the unproven link.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteDraftStore } from "../adapters/sqlite/SqliteDraftStore.js";
import type { DraftLoad } from "../adapters/sqlite/SqliteDraftStore.js";
import { SqliteIdentityStore } from "../adapters/sqlite/SqliteIdentityStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { newDraft } from "../cart/cart.js";
import { withheldDraftNotice } from "../cart/draftNotice.js";
import type { Draft } from "../cart/types.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/**
 * THE `: string` ANNOTATIONS ARE LOAD-BEARING. Without them TypeScript narrows
 * each to its own literal type and C0's control that A and B genuinely differ is
 * TS2367 — a compile error rather than a measurement, whose natural repair is to
 * delete the control and leave every case below passing against a fixture whose
 * two people are one value. Recorded at proveOwner.ts:70 for the same reason.
 */
const TENANT_A: string = "11111111-1111-4111-8111-111111111111";
const USER_A: string = "22222222-2222-4222-8222-222222222222";
const TENANT_B: string = "33333333-3333-4333-8333-333333333333";
const USER_B: string = "44444444-4444-4444-8444-444444444444";

const ISO = "2026-08-11T03:15:00.000Z";

/** The owner columns exactly as they sit on disk. `null` means no such row. */
interface OwnerCols {
  owner_tenant_id: string | null;
  owner_user_id: string | null;
}

interface Bench {
  dir: string;
  d: NodeSqliteDriver;
  drafts: SqliteDraftStore;
  identity: SqliteIdentityStore;
}

async function bench(name: string): Promise<Bench> {
  const dir = mkdtempSync(join(tmpdir(), `recycle-draftowner-${name}-`));
  const d = NodeSqliteDriver.open(join(dir, `${name}.db`));
  await SqliteLocalStore.open(d); // runs initConnection, creating every table
  const drafts = await SqliteDraftStore.open(d);
  return { dir, d, drafts, identity: new SqliteIdentityStore(d) };
}

async function teardown(b: Bench): Promise<void> {
  await b.d.close();
  rmSync(b.dir, { recursive: true, force: true });
}

/* ------------------------------------------------------------- instruments */

/**
 * THE ONLY SOURCE OF A VERDICT IN THIS FILE — the production loader, called on a
 * real file, with whatever identity is currently stored. Every case goes through
 * here; nothing below decides anything by reading a row.
 */
async function loadAs(b: Bench, where: string): Promise<DraftLoad> {
  const got = await b.drafts.load();
  console.log(
    `  loader as ${where}: draft=${got.draft === null ? "null" : got.draft.id}` +
      ` withheld=${String(got.withheld)}`,
  );
  return got;
}

/**
 * RAW SQL, NO STORE — the control side. "The loader returned nothing" is
 * satisfied by an empty table, a deleted row and a broken writer alike, so every
 * refusal below is printed beside the row it is refusing.
 */
async function rowsOnDisk(b: Bench): Promise<number> {
  const r = await b.d.all<{ n: number }>("SELECT COUNT(*) AS n FROM local_draft");
  return r[0]?.n ?? 0;
}

async function ownerOf(b: Bench, id: string): Promise<OwnerCols | null> {
  const r = await b.d.all<OwnerCols>(
    "SELECT owner_tenant_id, owner_user_id FROM local_draft WHERE id = ?",
    [id],
  );
  return r[0] ?? null;
}

async function lineCount(b: Bench, id: string): Promise<number> {
  const r = await b.d.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM local_draft_lines WHERE draft_id = ?",
    [id],
  );
  return r[0]?.n ?? 0;
}

function show(what: string, cols: OwnerCols | null): void {
  console.log(`  ${what}: ${cols === null ? "(no such row)" : JSON.stringify(cols)}`);
}

async function signIn(b: Bench, tenant: string, user: string): Promise<void> {
  await b.identity.save({ tenant_id: tenant, user_id: user });
}

/**
 * A draft carrying ONE REAL LINE.
 *
 * The line is not decoration. `local_draft_lines.draft_id` is
 * `REFERENCES local_draft(id) ON DELETE CASCADE` with `foreign_keys` ON, so a
 * refusal that deleted the header would take the lines with it silently — and a
 * fixture with no lines makes the cell asserting they survive read "0 of 0",
 * which passes whatever happens. A control has to contain the thing it claims
 * to check (lessons/a-control-must-contain-what-fooled-you.md).
 */
function draftWith(id: string): Draft {
  const base = newDraft(id, "seller-1", ISO, ISO);
  return {
    ...base,
    next_seq: 2,
    lines: [
      {
        id: `${id}-line-1`,
        seq: 1,
        product_id: "prod-1",
        product_code: "AL-CAN",
        product_name: "อะลูมิเนียมกระป๋อง",
        uom_code: "KG",
        gross_weight: "120.500",
        tare_weight: "20.500",
        net_weight: "100.000",
        unit_price: "45.00",
        list_price: "45.00",
        amount: "4500.00",
      },
    ],
  };
}

/* -------------------------------------------------------------------- C0 -- */

function c0Controls(): void {
  header("C0 — the fixture's two people are genuinely two");
  check(
    "CONTROL: A and B differ in BOTH halves of the pair",
    TENANT_A !== TENANT_B && USER_A !== USER_B,
    `A=${TENANT_A}/${USER_A} B=${TENANT_B}/${USER_B}`,
  );
}

/* -------------------------------------------------------------------- C1 -- */

/** 3b. Written under A, read under A: handed back unchanged. */
async function c1OwnGetsItBack(): Promise<void> {
  header("C1 (3b) — a draft written under A, identity A: the loader HANDS IT BACK");
  const b = await bench("c1");
  await signIn(b, TENANT_A, USER_A);
  const draft = draftWith("draft-c1");
  await b.drafts.save(draft, { tenant_id: TENANT_A, user_id: USER_A });

  const got = await loadAs(b, "A (the person who started it)");
  check("the draft comes back at all", got.draft !== null);
  check(
    "it is THE SAME draft — the id matches the row that was written",
    got.draft?.id === draft.id,
    `${String(got.draft?.id)} want ${draft.id}`,
  );
  check(
    "it comes back UNCHANGED — seller, vehicle and next_seq as written",
    got.draft?.seller_id === draft.seller_id &&
      got.draft.vehicle_no === draft.vehicle_no &&
      got.draft.next_seq === draft.next_seq,
    JSON.stringify({
      seller_id: got.draft?.seller_id,
      vehicle_no: got.draft?.vehicle_no,
      next_seq: got.draft?.next_seq,
    }),
  );
  check("nothing is reported withheld", got.withheld === 0, String(got.withheld));
  check(
    "and the operator is told NOTHING — no notice on an ordinary morning",
    withheldDraftNotice(got.withheld) === null,
    String(withheldDraftNotice(got.withheld)),
  );
  await teardown(b);
}

/* -------------------------------------------------------------------- C2 -- */

/** 3a + 3d. Written under A, identity is B: withheld, kept, not adopted. */
async function c2OtherPersonIsRefused(): Promise<void> {
  header("C2 (3a, 3d) — a draft written under A, identity B: NOT handed over, and NOT touched");
  const b = await bench("c2");
  await signIn(b, TENANT_A, USER_A);
  const draft = draftWith("draft-c2");
  await b.drafts.save(draft, { tenant_id: TENANT_A, user_id: USER_A });

  const before = await ownerOf(b, draft.id);
  const linesBefore = await lineCount(b, draft.id);
  show("owner columns as A left them", before);
  check(
    "CONTROL: the draft HAS a line to lose — otherwise 'its lines survive' is 0 of 0",
    linesBefore === 1,
    `${String(linesBefore)} line(s)`,
  );

  // The shift change.
  await signIn(b, TENANT_B, USER_B);
  const got = await loadAs(b, "B (a different person)");

  check("the loader does NOT hand it over", got.draft === null, String(got.draft));
  check("it is reported as withheld, and counted", got.withheld === 1, String(got.withheld));

  // CONTROL: the row is physically present WHILE the loader is refusing it.
  const during = await rowsOnDisk(b);
  console.log(`  CONTROL rows physically in local_draft at this moment: ${String(during)}`);
  check(
    "CONTROL: the row IS on disk — this is a refusal, not an empty table",
    during === 1,
    String(during),
  );

  // 3d: not adopted, not destroyed.
  const after = await ownerOf(b, draft.id);
  show("owner columns after B's load", after);
  check(
    "the row SURVIVES the refusal",
    after !== null,
    JSON.stringify(after),
  );
  check(
    "it was NOT ADOPTED — the owner is still A, not B",
    after?.owner_tenant_id === TENANT_A && after.owner_user_id === USER_A,
    JSON.stringify(after),
  );
  check(
    "the owner columns are byte-identical to before the refusal",
    JSON.stringify(after) === JSON.stringify(before),
    `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
  );
  check(
    "its LINES survive too — nothing cascaded",
    (await lineCount(b, draft.id)) === linesBefore,
    `${String(await lineCount(b, draft.id))} of ${String(linesBefore)}`,
  );

  const notice = withheldDraftNotice(got.withheld);
  console.log(`  notice: ${String(notice)}`);
  check("the operator IS told something is being kept", notice !== null);
  check(
    "the notice says it was NOT deleted",
    notice?.includes("ไม่ได้ลบ") === true,
    String(notice),
  );
  check(
    "the notice does NOT call it another ACCOUNT'S — the count covers unknown owners too",
    notice?.includes("ไม่ใช่ของบัญชีนี้") === true && notice.includes("ของบัญชีอื่น") === false,
    String(notice),
  );
  await teardown(b);
}

/* -------------------------------------------------------------------- C3 -- */

/** 3c + 3d. A null owner gets the same treatment, and is not adopted. */
async function c3NullOwnerIsRefused(): Promise<void> {
  header("C3 (3c, 3d) — a draft with a NULL owner: same refusal, and still not adopted");
  const b = await bench("c3");
  // Saved with NO identity: the boot window before the store is open, and every
  // draft on a handset upgraded across a471dc2.
  const draft = draftWith("draft-c3");
  await b.drafts.save(draft, null);

  const before = await ownerOf(b, draft.id);
  show("owner columns as written with no identity", before);
  check(
    "CONTROL: the row is present AND its owner columns are both null",
    before !== null && before.owner_tenant_id === null && before.owner_user_id === null,
    JSON.stringify(before),
  );
  check(
    "CONTROL: it really is on disk",
    (await rowsOnDisk(b)) === 1,
    String(await rowsOnDisk(b)),
  );

  // Somebody signs in. The unknown row must not become theirs.
  await signIn(b, TENANT_A, USER_A);
  const got = await loadAs(b, "A over a null-owner draft");
  check("the loader does NOT hand it over", got.draft === null, String(got.draft));
  check("it is counted as withheld", got.withheld === 1, String(got.withheld));

  const after = await ownerOf(b, draft.id);
  show("owner columns after the refusal", after);
  check(
    "NOT ADOPTED — the columns are still null, not A's",
    after?.owner_tenant_id === null && after.owner_user_id === null,
    JSON.stringify(after),
  );
  check(
    "the row still exists — an unknown owner is not a reason to destroy work",
    (await rowsOnDisk(b)) === 1,
    String(await rowsOnDisk(b)),
  );

  /*
   * THE OTHER HALF OF THE NULL RULE, and the one a `null === null` predicate
   * passes: with NO identity stored either, the null row must STILL be withheld.
   * Two unknowns are not the same person.
   */
  await b.identity.clear();
  const noOne = await loadAs(b, "nobody at all, over a null-owner draft");
  check(
    "a null owner does not match a null identity",
    noOne.draft === null && noOne.withheld === 1,
    `draft=${String(noOne.draft)} withheld=${String(noOne.withheld)}`,
  );
  check(
    "CONTROL: the row is STILL on disk for that reading too",
    (await rowsOnDisk(b)) === 1,
    String(await rowsOnDisk(b)),
  );
  await teardown(b);
}

/* -------------------------------------------------------------------- C4 -- */

/**
 * THE CASE THE OBVIOUS IMPLEMENTATION GETS WRONG, and the reason the filter is
 * inside the selection rather than a rejection after it.
 *
 * A withheld draft stays on disk, so the operator starts their own — and now two
 * rows exist. "Newest, then reject if not mine" reads A's newer row, refuses it,
 * and reports nothing, so B loses their OWN cart to a row they may not see.
 */
async function c4MineIsNotHiddenBehindTheirs(): Promise<void> {
  header("C4 — B's own draft is not hidden behind A's NEWER one");
  const b = await bench("c4");

  await signIn(b, TENANT_B, USER_B);
  const mine = { ...draftWith("draft-c4-mine"), updated_at: "2026-08-11T01:00:00.000Z" };
  await b.drafts.save(mine, { tenant_id: TENANT_B, user_id: USER_B });

  await signIn(b, TENANT_A, USER_A);
  const theirs = { ...draftWith("draft-c4-theirs"), updated_at: "2026-08-11T09:00:00.000Z" };
  await b.drafts.save(theirs, { tenant_id: TENANT_A, user_id: USER_A });

  check(
    "CONTROL: theirs really is the NEWER row — otherwise this case tests nothing",
    theirs.updated_at > mine.updated_at,
    `theirs=${theirs.updated_at} mine=${mine.updated_at}`,
  );
  check("CONTROL: both rows are on disk", (await rowsOnDisk(b)) === 2, String(await rowsOnDisk(b)));

  await signIn(b, TENANT_B, USER_B);
  const got = await loadAs(b, "B, with A's newer draft also on disk");
  check(
    "B gets B's OWN draft — not null, and not A's",
    got.draft?.id === mine.id,
    `${String(got.draft?.id)} want ${mine.id}`,
  );
  check(
    "and A's is counted as withheld",
    got.withheld === 1,
    String(got.withheld),
  );
  check(
    "A's row is untouched by B's load",
    (await ownerOf(b, theirs.id))?.owner_user_id === USER_A,
    JSON.stringify(await ownerOf(b, theirs.id)),
  );
  await teardown(b);
}

/* -------------------------------------------------------------------- C5 -- */

/** 3a and 3b in ONE run, from the SAME row, differing in the right direction. */
async function c5SameRowBothWays(): Promise<void> {
  header("C5 — the SAME row, read by its owner and by somebody else, in one run");
  const b = await bench("c5");
  await signIn(b, TENANT_A, USER_A);
  const draft = draftWith("draft-c5");
  await b.drafts.save(draft, { tenant_id: TENANT_A, user_id: USER_A });

  const asOwner = await loadAs(b, "A");
  await signIn(b, TENANT_B, USER_B);
  const asOther = await loadAs(b, "B");
  await signIn(b, TENANT_A, USER_A);
  const asOwnerAgain = await loadAs(b, "A again");

  // DIRECTION, not difference. "They differ" is satisfied by getting both of
  // them the wrong way round.
  check(
    "the OWNER gets the row and the OTHER PERSON does not — that way round",
    asOwner.draft?.id === draft.id && asOther.draft === null,
    `owner=${String(asOwner.draft?.id)} other=${String(asOther.draft)}`,
  );
  check(
    "and the withheld counts move oppositely: 0 for the owner, 1 for the other",
    asOwner.withheld === 0 && asOther.withheld === 1,
    `owner=${String(asOwner.withheld)} other=${String(asOther.withheld)}`,
  );
  check(
    "the refusal is not one-way damage — A still gets it back afterwards",
    asOwnerAgain.draft?.id === draft.id,
    String(asOwnerAgain.draft?.id),
  );
  check(
    "CONTROL: one row served all three readings",
    (await rowsOnDisk(b)) === 1,
    String(await rowsOnDisk(b)),
  );
  await teardown(b);
}

/* ------------------------------------------------------------------ main -- */

async function main(): Promise<number> {
  console.log("P1.7 — a draft is not handed to somebody it does not belong to");
  c0Controls();
  await c1OwnGetsItBack();
  await c2OtherPersonIsRefused();
  await c3NullOwnerIsRefused();
  await c4MineIsNotHiddenBehindTheirs();
  await c5SameRowBothWays();
  console.log(`\n${failures === 0 ? "ALL GREEN" : `${String(failures)} FAILED`}`);
  return failures === 0 ? 0 : 1;
}

// Preset RED, per lessons/a-default-exit-code-is-a-default-verdict.md: a run
// that ends before main()'s tally completes exits non-zero, not a default 0.
process.exitCode = 1;

process.exitCode = await main();
