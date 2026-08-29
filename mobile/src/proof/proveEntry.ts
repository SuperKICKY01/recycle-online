/**
 * Phase 2c-4 proof: entry-screen safety rules.
 *
 * Run: npm run prove:entry
 *
 * Pure logic, so no database and no device is needed — but the rules proven
 * here are the ones that decide whether a stale weight can reach a real
 * payment, so they are proven exhaustively rather than by example: every case
 * that quantifies over lock state enumerates ALL four combinations.
 */
import {
  LOCKABLE_FIELDS,
  NO_LOCKS,
  afterLineCommitted,
  applyKey,
  onProductChange,
  priceIsOffTier,
  releaseOnClear,
  releaseOnSave,
  toggleLock,
} from "../cart/entry.js";
import type { Locks, NumKey } from "../cart/entry.js";
import type { DraftForm } from "../cart/types.js";
import { parsePrice, parseWeight } from "../money/money.js";
import { mulberry32 } from "./fakes.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/** All four lock states, so nothing is proven on a lucky combination. */
const ALL_LOCK_STATES: Locks[] = [
  { tare: false, price: false },
  { tare: true, price: false },
  { tare: false, price: true },
  { tare: true, price: true },
];

const describeLocks = (l: Locks): string =>
  `{tare:${l.tare ? "LOCK" : "open"},price:${l.price ? "LOCK" : "open"}}`;

/** A filled-in form for the OLD product, ready for a product switch. */
const filled = (): DraftForm => ({
  product_id: "prod-OLD",
  gross: "10.005",
  tare: "0.002",
  price: "15.00",
});

const NEW_PRODUCT = { productId: "prod-NEW", listPrice: "44.00" };

/* ------------------------------------------------------------------ E1 ---- */

function e1GrossIsNotLockable(): void {
  header("E1: gross_weight is not lockable — structurally, not by convention");

  console.log(`  LOCKABLE_FIELDS = ${JSON.stringify(LOCKABLE_FIELDS)}`);
  console.log(`  keys of a Locks value = ${JSON.stringify(Object.keys(NO_LOCKS))}`);
  check(
    "gross is absent from the lockable set",
    !(LOCKABLE_FIELDS as readonly string[]).includes("gross"),
  );
  check(
    "a Locks value has no gross key at all — the state is unrepresentable",
    !Object.prototype.hasOwnProperty.call(NO_LOCKS, "gross") &&
      Object.keys(NO_LOCKS).length === 2,
  );
  // The compile-time half cannot be asserted at runtime: toggleLock's parameter
  // is LockableField, so toggleLock(locks, "gross") does not typecheck. What IS
  // checkable here is the behaviour, for EVERY lock state that can exist.
  const survived = ALL_LOCK_STATES.filter(
    (locks) => onProductChange(filled(), locks, NEW_PRODUCT).gross !== "",
  );
  check(
    "across all 4 lock states, a product change NEVER preserves gross",
    survived.length === 0,
    `states where gross survived: ${String(survived.length)}/4`,
  );
  const survivedAdd = ALL_LOCK_STATES.filter(
    (locks) => afterLineCommitted(filled(), locks).gross !== "",
  );
  check(
    "across all 4 lock states, adding a line NEVER preserves gross",
    survivedAdd.length === 0,
    `states where gross survived: ${String(survivedAdd.length)}/4`,
  );
}

/* ------------------------------------------------------------------ E2 ---- */

function e2ProductChangeClearsWeights(): void {
  header("E2: changing product clears the stale weights");

  for (const locks of ALL_LOCK_STATES) {
    const out = onProductChange(filled(), locks, NEW_PRODUCT);
    console.log(
      `  ${describeLocks(locks).padEnd(28)} -> gross=${JSON.stringify(out.gross)}` +
        ` tare=${JSON.stringify(out.tare)} price=${JSON.stringify(out.price)}`,
    );
  }

  const open = onProductChange(filled(), NO_LOCKS, NEW_PRODUCT);
  check("with nothing locked, gross is cleared", open.gross === "");
  check("with nothing locked, tare is cleared", open.tare === "");
  check(
    "with nothing locked, price re-defaults to the NEW product's tier",
    open.price === "44.00",
    `price=${open.price}`,
  );
  check("the new product is selected", open.product_id === "prod-NEW");

  const tareLocked = onProductChange(filled(), { tare: true, price: false }, NEW_PRODUCT);
  check("a LOCKED tare survives the product change", tareLocked.tare === "0.002");
  check("...while gross is still cleared alongside it", tareLocked.gross === "");

  const priceLocked = onProductChange(filled(), { tare: false, price: true }, NEW_PRODUCT);
  check("a LOCKED price survives instead of re-defaulting", priceLocked.price === "15.00");
  check(
    "a locked price that no longer matches the new tier is flagged off-tier",
    priceIsOffTier(priceLocked.price, "44.00"),
    "this is the cue the operator gets when they did not retype anything",
  );
  check(
    "an unlocked price that re-defaulted is NOT flagged",
    !priceIsOffTier(open.price, "44.00"),
    "otherwise the warning would cry wolf on every product change",
  );
}

/* ------------------------------------------------------------------ E3 ---- */

function e3AddToCartKeepsLocksOnly(): void {
  header("E3: after adding a line, only locked fields carry over");

  const both = afterLineCommitted(filled(), { tare: true, price: true });
  check("locked tare carries to the next line", both.tare === "0.002");
  check("locked price carries to the next line", both.price === "15.00");
  check("gross does not", both.gross === "");

  const none = afterLineCommitted(filled(), NO_LOCKS);
  check(
    "with nothing locked, every field resets",
    none.gross === "" && none.tare === "" && none.price === "" && none.product_id === null,
    `form=${JSON.stringify(none)}`,
  );
}

/* ------------------------------------------------------------------ E4 ---- */

function e4LocksReleaseAtBillBoundary(): void {
  header("E4: locks are released when the bill ends");

  const held: Locks = { tare: true, price: true };
  console.log(`  before: ${describeLocks(held)}`);
  console.log(`  after save:  ${describeLocks(releaseOnSave())}`);
  console.log(`  after clear: ${describeLocks(releaseOnClear())}`);

  check(
    "saving a bill releases every lock (scope = one customer / one vehicle)",
    releaseOnSave().tare === false && releaseOnSave().price === false,
  );
  check(
    "clearing the cart releases every lock",
    releaseOnClear().tare === false && releaseOnClear().price === false,
  );
  check(
    "toggling is per-field and does not disturb the other",
    toggleLock(NO_LOCKS, "tare").tare && !toggleLock(NO_LOCKS, "tare").price,
  );
  check(
    "toggling twice returns to open",
    toggleLock(toggleLock(NO_LOCKS, "price"), "price").price === false,
  );

  // The dangerous direction is a lock that OUTLIVES the bill: the next
  // customer's tare silently applies to this one's load.
  const nextCustomer = onProductChange(filled(), releaseOnSave(), NEW_PRODUCT);
  check(
    "so the next bill starts with no carried-over tare",
    nextCustomer.tare === "" && nextCustomer.gross === "",
    `tare=${JSON.stringify(nextCustomer.tare)}`,
  );
}

/* ------------------------------------------------------------------ E5 ---- */

function e5NumpadIsStringOnly(): void {
  header("E5: the numpad edits strings and never touches a JS number");

  const type = (keys: string, dp: number, maxInt: number): string =>
    keys.split(" ").reduce((v, k) => applyKey(v, k as NumKey, dp, maxInt), "");

  const cases: [string, number, number, string][] = [
    ["1 0 . 0 0 5", 3, 11, "10.005"],
    [". 5", 3, 11, "0.5"],
    ["0 5", 3, 11, "5"],
    ["1 . 2 . 3", 3, 11, "1.23"],
    ["1 . 0 0 0 5", 3, 11, "1.000"],
    ["2 . 5 5 5", 2, 12, "2.55"],
    ["1 2 3 back back", 3, 11, "1"],
    ["9 9 . 9 clear", 3, 11, ""],
    ["back", 3, 11, ""],
  ];
  for (const [keys, dp, maxInt, want] of cases) {
    const got = type(keys, dp, maxInt);
    check(`"${keys}" (dp=${String(dp)}) -> "${want}"`, got === want, `got "${got}"`);
  }

  check(
    "the integer part is capped at the column's width",
    type("1 1 1 1 1 1 1 1 1 1 1 1 1 1", 3, 11) === "11111111111",
    `got "${type("1 1 1 1 1 1 1 1 1 1 1 1 1 1", 3, 11)}"`,
  );

  // Fuzz: whatever is typed, the value stays a plain decimal string. No
  // exponent, no sign, no second dot, no over-long fraction — so nothing the
  // pad can produce needs a JS number to be understood.
  const keys: NumKey[] = ["0","1","2","3","4","5","6","7","8","9",".","back","clear"];
  const rand = mulberry32(20260722);
  let value = "";
  let worstFrac = 0;
  let bad: string | null = null;
  for (let i = 0; i < 20000; i += 1) {
    value = applyKey(value, keys[Math.floor(rand() * keys.length)]!, 3, 11);
    if (!/^(\d*)(\.\d*)?$/.test(value)) { bad = value; break; }
    const d = value.indexOf(".");
    if (d >= 0) worstFrac = Math.max(worstFrac, value.length - d - 1);
    if (typeof value !== "string") { bad = String(value); break; }
  }
  console.log(`  fuzzed 20000 keypresses; deepest fraction seen = ${String(worstFrac)}`);
  check("every intermediate value is a plain decimal string", bad === null, bad ?? "");
  check("the fraction never exceeded dp=3", worstFrac <= 3, `worst=${String(worstFrac)}`);

  // And a completed value is something the money module accepts.
  check(
    "a typed weight parses exactly, with no float artefact",
    (() => {
      const r = parseWeight(type("1 0 . 0 0 5", 3, 11));
      return r.ok && r.value === "10.005";
    })(),
  );
  check(
    "a typed price parses exactly",
    (() => {
      const r = parsePrice(type("2 1 2 . 5", 2, 12));
      return r.ok && r.value === "212.50";
    })(),
  );
}

/* ---------------------------------------------------------------- main --- */

function main(): number {
  console.log("Phase 2c-4 — entry-screen safety rules, headless proof");
  console.log(`node ${process.version}, pure logic (no database, no device)`);

  e1GrossIsNotLockable();
  e2ProductChangeClearsWeights();
  e3AddToCartKeepsLocksOnly();
  e4LocksReleaseAtBillBoundary();
  e5NumpadIsStringOnly();

  console.log("");
  console.log(failures === 0 ? "ALL ENTRY CASES PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

// Preset RED, per lessons/a-default-exit-code-is-a-default-verdict.md: a run
// that ends before main()'s tally completes exits non-zero, not a default 0.
process.exitCode = 1;

const code = main();
console.log(`ENTRY_EXIT=${code}`);
process.exitCode = code;
