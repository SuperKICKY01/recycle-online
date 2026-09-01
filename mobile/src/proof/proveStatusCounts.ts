/**
 * P1.7 step 7: THE NUMBERS ON THE STRIP ARE TRUE, AND THERE ARE THREE OF THEM.
 *
 * Run: npm run prove:statuscounts
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------
 * The operator read `listByState('pending') + listByState('syncing')`, which
 * carries its own `sync_state = ?` predicate and never gained the owner filter
 * the send queue did. So the count included bills belonging to somebody else:
 * a number that could not go down however long they waited, because nothing they
 * could do released another person's rows and no connection drained them. It
 * reads as a bad signal or a stuck queue. The SIGN-OUT REFUSAL read the same
 * number, so a device could refuse to be handed over because of bills the person
 * holding it neither owned nor could send.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE NUMBERS MEAN, AND WHAT AN OPERATOR DOES ABOUT EACH
 * ---------------------------------------------------------------------------
 *   mine          waits on a CONNECTION. It goes down by itself. Do nothing.
 *   mineBlocked   waits on the OFFICE — a price or a grade is missing. Ring the
 *                 office; the strip already has its own line and retry for this.
 *   otherAccount  waits on a PERSON who exists: the owner signing in HERE.
 *                 Nothing the current operator can do, and no connection helps.
 *   unknownOwner  waits on NOBODY. No sign-in releases it, because null matches
 *                 no identity. It needs a decision that does not exist yet
 *                 (OPEN_ITEMS.md section Code debt). Tell the shop owner.
 *
 * A number nobody can act on trains people to stop reading the strip, which is
 * why the last two are worded as different waits rather than summed into one
 * "not sent" figure — ROADMAP.md section P1.7: "A combined total makes the
 * operator wait for the wrong thing."
 *
 * WHAT THIS DOES NOT ESTABLISH: App.tsx is outside this program, so which value
 * it hands to which renderer is a call site here and not a proven link.
 *
 * SUPERSEDED 2026-08-25 — the sentence above said "it passes `ownUnsentCount`
 * to signOut and `pendingCount` to the strip", and that pair was the DEFECT
 * rather than the arrangement: the sign-out SHEET was handed `pendingCount`
 * while the GATE was handed `ownUnsentCount`, so one bill parked on master data
 * drew a confirmation card over a gate that refused. `ownUnsentCount` no longer
 * exists; the gate and the sheet take one `OwedByKind` off the registry, and
 * `pendingCount` reaches the strip alone. The limitation is unchanged and is why
 * the sentence is corrected rather than deleted: nothing in this program can see
 * App.tsx, so the pairing is asserted in proveOwedSurfaces over the renderers
 * themselves and remains a call site here.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteIdentityStore } from "../adapters/sqlite/SqliteIdentityStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { signOut } from "../session/signOut.js";
import type { SignOutOutcome } from "../session/signOut.js";
import { MemoryTokenStore } from "../session/tokenStore.js";
import { createLocalBill } from "../sync/createBill.js";
import { NOTHING_OWED } from "../sync/outbox.js";
import { owedWith } from "./fakes.js";
import { statusNotice } from "../sync/statusNotice.js";
import type { Clock, IdSource, LocalBill, RowOwner, UnsentBreakdown } from "../sync/types.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/** `: string` keeps C0's control a runtime measurement — see proveOwner.ts:70. */
const TENANT: string = "11111111-1111-4111-8111-111111111111";
const USER_A: string = "22222222-2222-4222-8222-222222222222";
const USER_B: string = "33333333-3333-4333-8333-333333333333";
const A: RowOwner = { tenant_id: TENANT, user_id: USER_A };
const B: RowOwner = { tenant_id: TENANT, user_id: USER_B };

const clock: Clock = { now: () => new Date(), sleep: () => Promise.resolve() };

class SeqIds implements IdSource {
  private n = 0;
  constructor(private readonly p: string) {}
  newId(): string {
    this.n += 1;
    return `${this.p}-${String(this.n)}`;
  }
}

const ITEM = {
  id: "item-1",
  product_id: "prod-1",
  line_no: 1,
  gross_weight: "10.000",
  tare_weight: "0.000",
  net_weight: "10.000",
  unit_price: "15.00",
  list_price: "15.00",
};

interface Bench {
  dir: string;
  d: NodeSqliteDriver;
  store: SqliteLocalStore;
  identity: SqliteIdentityStore;
  ids: SeqIds;
}

async function bench(name: string): Promise<Bench> {
  const dir = mkdtempSync(join(tmpdir(), `recycle-statuscounts-${name}-`));
  const d = NodeSqliteDriver.open(join(dir, `${name}.db`));
  return {
    dir,
    d,
    store: await SqliteLocalStore.open(d),
    identity: new SqliteIdentityStore(d),
    ids: new SeqIds(name),
  };
}

async function teardown(b: Bench): Promise<void> {
  await b.d.close();
  rmSync(b.dir, { recursive: true, force: true });
}

async function makeBill(b: Bench, owner: RowOwner | null): Promise<LocalBill> {
  return createLocalBill(
    { store: b.store, clock, ids: b.ids },
    {
      seller: { kind: "server", seller_id: "sell-1" },
      vehicle_no: null,
      items: [{ ...ITEM, id: b.ids.newId() }],
      total_amount: "150.00",
      master_as_of: null,
    },
    owner,
  );
}

/** Unsent rows physically on disk, whatever the breakdown thinks. */
async function unsentOnDisk(b: Bench): Promise<number> {
  const r = await b.d.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM local_bills WHERE sync_state IN ('pending','syncing')",
  );
  return r[0]?.n ?? 0;
}

function show(what: string, u: UnsentBreakdown): void {
  console.log(
    `  ${what}: mine=${String(u.mine)} mineBlocked=${String(u.mineBlocked)}` +
      ` otherAccount=${String(u.otherAccount)} unknownOwner=${String(u.unknownOwner)}`,
  );
}

/**
 * COMPLETENESS — the property the four counts owe their caller.
 *
 * A breakdown shown side by side gets added up by whoever reads it, so a row in
 * no category is a strip whose parts do not reconcile with the device. This is
 * also the cell that catches the three-valued-logic mistake the prediction named
 * as most likely: an identity of null makes `NOT (col = ?)` NULL, which would
 * drop every known-owner row out of all four counts silently.
 */
async function checkComplete(b: Bench, u: UnsentBreakdown, where: string): Promise<void> {
  const disk = await unsentOnDisk(b);
  const sum = u.mine + u.mineBlocked + u.otherAccount + u.unknownOwner;
  check(
    `COMPLETENESS (${where}): the four counts sum to the unsent rows on disk`,
    sum === disk,
    `sum=${String(sum)} disk=${String(disk)}`,
  );
}

/* -------------------------------------------------------------------- C0 -- */

function c0(): void {
  header("C0 — the fixture's two people are genuinely two");
  check(
    "CONTROL: A and B differ, in one shop",
    USER_A !== USER_B && A.tenant_id === B.tenant_id,
    `A=${USER_A} B=${USER_B}`,
  );
}

/* --------------------------------------------------------------- 4a + 4b -- */

/**
 * 4a AND 4b IN ONE RUN, ON ONE DEVICE. Either alone is satisfied by a method
 * that returns one big number and one zero; only the pair shows the two move
 * INDEPENDENTLY.
 */
async function s4abTwoNumbersMoveApart(): Promise<void> {
  header("4a + 4b — A's bills parked, then B's own waiting: the two numbers move apart");
  const b = await bench("ab");

  // A's shift: two unsent bills. Then A goes home and B signs in.
  await b.identity.save(A);
  await makeBill(b, A);
  await makeBill(b, A);
  await b.identity.save(B);

  const before = await b.store.unsentBreakdown();
  show("4a as B, before B does anything", before);
  await checkComplete(b, before, "4a");
  check("4a: the parked-for-another number is NON-ZERO", before.otherAccount === 2,
    String(before.otherAccount));
  check("4a: the waiting-on-a-connection number is ZERO", before.mine === 0,
    String(before.mine));
  check("4a: nothing is miscounted as unknown-owner", before.unknownOwner === 0,
    String(before.unknownOwner));

  // 4b — B weighs a load and the server cannot be reached. Nothing about A's
  // bills changed, and the proof asserts BOTH halves of that.
  await makeBill(b, B);
  const after = await b.store.unsentBreakdown();
  show("4b after B saves one bill", after);
  await checkComplete(b, after, "4b");
  check("4b: B's own waiting number is now NON-ZERO", after.mine === 1, String(after.mine));
  check(
    "4b: and the parked-for-another number is UNCHANGED",
    after.otherAccount === before.otherAccount,
    `before=${String(before.otherAccount)} after=${String(after.otherAccount)}`,
  );
  check(
    "4b: THE TWO MOVED APART — one changed and the other did not, in one run",
    after.mine !== before.mine && after.otherAccount === before.otherAccount,
    `mine ${String(before.mine)}->${String(after.mine)},` +
      ` other ${String(before.otherAccount)}->${String(after.otherAccount)}`,
  );

  // What the operator actually reads.
  const notice = statusNotice({
    appOutdated: false,
    session: "active",
    account: "ok",
    voidsRefused: 0,
    online: false,
    pending: after.mine,
    parkedForAnother: after.otherAccount,
    parkedUnknownOwner: after.unknownOwner,
    failed: 0,
    blocked: null,
    waitingOnMasterData: after.mineBlocked,
    masterDataCodes: [],
    // This file is about the BILL breakdown. The strip does not read this map
    // for `bill_send` — `pending` and `waitingOnMasterData` above are its lines
    // — so a zero map neither adds a sentence nor removes one here. The owed
    // branch is driven in proveOwedSurfaces.
    owed: NOTHING_OWED,
  });
  console.log(`  the strip reads: ${notice.message}`);
  check(
    "the sentence names B's OWN number, not the device total of three",
    notice.message.includes("1") && !notice.message.includes("3"),
    notice.message,
  );
  await teardown(b);
}

/* -------------------------------------------------------------------- 4c -- */

async function s4cUnknownOwner(): Promise<void> {
  header("4c — rows with an unknown owner are their own number, and wait for nobody");
  const b = await bench("c");

  // Written with no identity: an upgraded handset, or a save in the boot window.
  await makeBill(b, null);
  await makeBill(b, null);
  await b.identity.save(A);
  await makeBill(b, A);

  const rows = await b.d.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM local_bills WHERE owner_tenant_id IS NULL",
  );
  console.log(`  CONTROL rows physically on disk with a null owner: ${String(rows[0]?.n)}`);
  check("CONTROL: the null-owner rows ARE present", (rows[0]?.n ?? 0) === 2, String(rows[0]?.n));

  const u = await b.store.unsentBreakdown();
  show("4c as A", u);
  await checkComplete(b, u, "4c");
  check("4c: they are counted as unknown-owner", u.unknownOwner === 2, String(u.unknownOwner));
  check(
    "4c: and NOT as A's own — an unknown owner is never adopted by whoever is signed in",
    u.mine === 1,
    String(u.mine),
  );
  check("4c: and NOT as another account's — nobody can be told to sign in for them",
    u.otherAccount === 0, String(u.otherAccount));

  // The sentence must not promise a release that cannot happen.
  const notice = statusNotice({
    appOutdated: false,
    session: "active", account: "ok", voidsRefused: 0, online: true,
    pending: 0, parkedForAnother: 0, parkedUnknownOwner: u.unknownOwner,
    failed: 0, blocked: null, waitingOnMasterData: 0, masterDataCodes: [],
    // Bills only in this file; the strip reads no `bill_send` line off this map.
    owed: NOTHING_OWED,
  });
  console.log(`  the strip reads: ${notice.message}`);
  check(
    "4c: the sentence says signing in does NOT help",
    notice.message.includes("การเข้าสู่ระบบไม่ช่วย"),
    notice.message,
  );

  /*
   * THE OTHER HALF OF THE NULL RULE, and the case the prediction named as most
   * likely to be wrong: with NO identity stored, a known-owner row must still be
   * counted — as another account's — rather than falling out of every category.
   */
  await b.identity.clear();
  const none = await b.store.unsentBreakdown();
  show("4c with NO identity at all", none);
  await checkComplete(b, none, "4c/no-identity");
  check(
    "4c: with no identity, A's row counts as ANOTHER ACCOUNT'S rather than vanishing",
    none.otherAccount === 1 && none.mine === 0,
    `other=${String(none.otherAccount)} mine=${String(none.mine)}`,
  );
  check(
    "4c: and the null-owner rows are still unknown-owner, not 'mine'",
    none.unknownOwner === 2,
    String(none.unknownOwner),
  );
  await teardown(b);
}

/* -------------------------------------------------------------------- 4d -- */

/**
 * THE PAIR THAT SHOWS THE REFUSAL CHANGED WHAT IT COUNTS RATHER THAN STOPPING
 * REFUSING — both halves in one run, on one device.
 *
 * The `pending` argument is DERIVED FROM unsentBreakdown here, the way App.tsx
 * derives it, and not computed by this file. signOut() is pure and takes the
 * number as an argument, so a proof that did its own arithmetic would be testing
 * the gate — which never changed — instead of the fix, which is which number
 * reaches it.
 */
async function s4dSignOut(): Promise<void> {
  header("4d — B can sign out over A's parked bills, and CANNOT over their own");
  const b = await bench("d");

  await b.identity.save(A);
  await makeBill(b, A);
  await makeBill(b, A);
  await b.identity.save(B);

  const asB = await b.store.unsentBreakdown();
  show("B, with only A's bills unsent", asB);
  const ownB = asB.mine + asB.mineBlocked;
  console.log(`  the number the refusal reads (B's OWN unsent) = ${String(ownB)}`);
  console.log(`  the old, unfiltered number would have been     = ${String(await unsentOnDisk(b))}`);

  const canOut: SignOutOutcome = await signOut({
    owed: owedWith({ bill_send: ownB }),
    failed: 0,
    setSyncPaused: () => undefined,
    tokens: new MemoryTokenStore("a-token"),
    engine: { resetAfterSignOut: () => undefined },
  });
  check(
    "4d: B CAN sign out — the device is not stuck over bills B cannot send",
    canOut.kind === "signed_out",
    canOut.kind,
  );
  check(
    "4d: CONTROL — the old number was non-zero, so this is a change and not an empty device",
    (await unsentOnDisk(b)) === 2,
    String(await unsentOnDisk(b)),
  );

  // CONTROL: B's OWN unsent bill still refuses. Same device, same run.
  await makeBill(b, B);
  const asB2 = await b.store.unsentBreakdown();
  show("B, now with one of their own unsent", asB2);
  const ownB2 = asB2.mine + asB2.mineBlocked;
  const refused: SignOutOutcome = await signOut({
    owed: owedWith({ bill_send: ownB2 }),
    failed: 0,
    setSyncPaused: () => undefined,
    tokens: new MemoryTokenStore("a-token"),
    engine: { resetAfterSignOut: () => undefined },
  });
  check(
    "4d: CONTROL — with a bill of THEIR OWN unsent, B is REFUSED",
    refused.kind === "refused_pending",
    refused.kind,
  );
  check(
    "4d: THE PAIR — the same device answers differently, that way round",
    canOut.kind === "signed_out" && refused.kind === "refused_pending",
    `${canOut.kind} then ${refused.kind}`,
  );
  await teardown(b);
}

/* -------------------------------------------------------------------- 4e -- */

async function s4eNothing(): Promise<void> {
  header("4e — CONTROL: nothing unsent, nothing parked, nothing said");
  const b = await bench("e");
  await b.identity.save(B);
  const u = await b.store.unsentBreakdown();
  show("empty device", u);
  await checkComplete(b, u, "4e");
  check(
    "every count is zero",
    u.mine === 0 && u.mineBlocked === 0 && u.otherAccount === 0 && u.unknownOwner === 0,
    JSON.stringify(u),
  );
  const notice = statusNotice({
    appOutdated: false,
    session: "active", account: "ok", voidsRefused: 0, online: true,
    pending: 0, parkedForAnother: 0, parkedUnknownOwner: 0,
    failed: 0, blocked: null, waitingOnMasterData: 0, masterDataCodes: [],
    // Bills only in this file; the strip reads no `bill_send` line off this map.
    owed: NOTHING_OWED,
  });
  console.log(`  the strip reads: ${notice.message}`);
  check(
    "and the strip says nothing about parked bills",
    !notice.message.includes("บัญชีอื่น") && !notice.message.includes("ไม่ทราบ"),
    notice.message,
  );
  await teardown(b);
}

/* ------------------------------------------------------------------ main -- */

async function main(): Promise<number> {
  console.log("P1.7 step 7 — the numbers on the strip are true, and there are three");
  c0();
  await s4abTwoNumbersMoveApart();
  await s4cUnknownOwner();
  await s4dSignOut();
  await s4eNothing();
  console.log(`\n${failures === 0 ? "ALL GREEN" : `${String(failures)} FAILED`}`);
  return failures === 0 ? 0 : 1;
}

// Preset RED, per lessons/a-default-exit-code-is-a-default-verdict.md: a run
// that ends before main()'s tally completes exits non-zero, not a default 0.
process.exitCode = 1;

process.exitCode = await main();
