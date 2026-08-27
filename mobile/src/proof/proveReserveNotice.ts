/**
 * P1.23 (commit c4) proof: THE-RESERVE-LEVEL-IS-REQUIRED-AND-EVERY-VALUE-HAS-ITS
 * -OWN-SENTENCE.
 *
 *   npm run prove:reservenotice
 *
 * Pure — no store, no server. It drives the wording directly over the four
 * levels AND drives `reserveSurface` over a device whose holding is set in turn
 * to each value's own precondition, which is the criterion's staging.
 *
 *   R2  TOTAL OVER THE VALUES — the union is iterated (a fifth value would force
 *       a key into EXPECTED_TONE and fail to compile), each render has its own
 *       distinctive text, and the holding-driven path produces the same notice.
 *   R3  `never_provisioned` IS NOT `exhausted` — by DIRECTION, both ways.
 *   R4  `exhausted` PROMISES NO WAIT, NAMES WHAT IS STILL POSSIBLE, offers no
 *       different seller; and the four tones are none, none, red, red.
 *
 * R1 IS THE COMPILE CELL, RUN BY HAND — like `proveSellerKind`'s outcome-union
 * cell. A value the reserve union cannot express cannot be constructed here to
 * watch both typecheck programs redden without writing into `src/` and shelling
 * out to `tsc`. Staged instead: `reserveLevelNotice("amber", 5)` in a `src/`
 * file. Under the correct `level: ReserveLevel` BOTH programs exit 2 (TS2345,
 * "amber" not assignable to ReserveLevel) naming the file and symbol; widen the
 * parameter to `string` and the SAME error DISAPPEARS — the closed union is what
 * makes the value uncompilable. Reported in the phase record with the two exit
 * codes.
 *
 * PRESET RED: `process.exitCode = 1` at entry, cleared only if every cell passes.
 */
import { reserveLevelNotice, reserveSurface } from "../master/reserveNotice.js";
import type { ReserveLevelNotice, ReserveTone } from "../master/reserveNotice.js";
import type { HoldingCounts, ReserveLevel } from "../sync/sellerRefill.js";

process.exitCode = 1;

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/** The whole content a reader sees, in draw order — what the negatives assert over. */
function concat(notice: ReserveLevelNotice): string {
  return notice.lines.join(" ");
}

/**
 * The tone the RULE gives each level, total over the union. It is the proof's
 * enumeration of the union (a fifth `ReserveLevel` would miss a key and fail to
 * compile) AND the expected side of the tone assertion: none, none, red, red.
 */
const EXPECTED_TONE: Record<ReserveLevel, ReserveTone> = {
  ample: "none",
  low: "none",
  exhausted: "red",
  never_provisioned: "red",
};

/** Each value's own precondition holding — the criterion's staging. `low` and
 * `exhausted` share a target so only spendable moves; `low`'s count is REAL. */
const HOLDING: Record<ReserveLevel, HoldingCounts> = {
  ample: { spendable: 20, held: 20, target: 20 },
  low: { spendable: 5, held: 20, target: 20 },
  exhausted: { spendable: 0, held: 20, target: 20 },
  never_provisioned: { spendable: 0, held: 0, target: 20 },
};

const LEVELS = Object.keys(EXPECTED_TONE) as ReserveLevel[];

/* ------------------------------------------------------------------ R2 --- */

function r2TotalOverValues(): void {
  header("R2: TOTAL OVER THE VALUES — a sentence per level, distinct, and the holding path agrees");

  const concats: string[] = [];
  for (const level of LEVELS) {
    const notice = reserveLevelNotice(level, HOLDING[level].spendable);
    concats.push(concat(notice));
    check(
      `R2. ${level} carries a non-empty sentence`,
      notice.lines.length > 0 && notice.lines.every((l) => l.length > 0),
      `lines=${String(notice.lines.length)}`,
    );
  }
  check(
    "R2. all four sentences are DISTINCT — no value borrows another's text",
    new Set(concats).size === 4,
    `distinct=${String(new Set(concats).size)} of 4`,
  );

  // The holding-driven path: reserveSurface derives the level from the holding
  // and produces the SAME notice, so the compile-cell call site and the wording
  // are one mapping. And `low` names a REAL count off the holding, not one this
  // proof invented.
  for (const level of LEVELS) {
    const viaHolding = reserveSurface(HOLDING[level]);
    const viaLevel = reserveLevelNotice(level, HOLDING[level].spendable);
    check(
      `R2. reserveSurface over the ${level} holding produces the ${level} notice`,
      concat(viaHolding) === concat(viaLevel) && viaHolding.tone === viaLevel.tone,
      `tone=${viaHolding.tone}`,
    );
  }
  check(
    "R2. `low` NAMES the real spendable count off the holding (5), never a default",
    concat(reserveSurface(HOLDING.low)).includes("5"),
    concat(reserveSurface(HOLDING.low)),
  );
}

/* ------------------------------------------------------------------ R3 --- */

function r3NeverProvisionedIsNotExhausted(): void {
  header("R3: `never_provisioned` IS NOT `exhausted` — asserted by DIRECTION, both ways");

  const exhausted = concat(reserveLevelNotice("exhausted", 0));
  const never = concat(reserveLevelNotice("never_provisioned", 0));

  check(
    "R3. exhausted names being USED UP (หมด) and does NOT claim the device never received a quota",
    exhausted.includes("หมด") && !exhausted.includes("ยังไม่เคยรับ"),
    exhausted,
  );
  check(
    "R3. never_provisioned names NEVER HAVING RECEIVED (ยังไม่เคยรับ) and does NOT say used up (หมด)",
    never.includes("ยังไม่เคยรับ") && !never.includes("หมด"),
    never,
  );
}

/* ------------------------------------------------------------------ R4 --- */

function r4Exhausted(): void {
  header("R4: `exhausted` — no wait, names what is still possible, no different seller; and the tones");

  const exhausted = concat(reserveLevelNotice("exhausted", 0));
  const low = concat(reserveLevelNotice("low", 5));

  // NEGATIVE: no passive-refill promise. The device is out of codes and may be
  // offline; "it will top itself up" asks for patience toward a condition that
  // may never arrive. CONTROL: `low` legitimately DOES carry that phrase (its
  // next online pass tops it up), so the instrument is known to catch it.
  check(
    "R4. exhausted PROMISES NO passive refill (no จะเติมเอง)",
    !exhausted.includes("จะเติมเอง"),
    exhausted,
  );
  check(
    "R4. CONTROL: `low` DOES carry จะเติมเอง — the ban above is not vacuous",
    low.includes("จะเติมเอง"),
    low,
  );

  // PRESENCE SIBLING: what the yard CAN still do — record against an existing
  // seller. Without this, the negatives are satisfied by an empty string.
  check(
    "R4. exhausted NAMES what is still possible — a bill against an existing seller (ผู้ขายที่มีอยู่)",
    exhausted.includes("ผู้ขายที่มีอยู่"),
    exhausted,
  );

  // NEGATIVE: it must NOT offer picking a DIFFERENT seller for this load — a
  // wrong seller on a cash purchase is the harm the whole step exists to prevent.
  check(
    "R4. exhausted does NOT offer a different seller for this load",
    !exhausted.includes("เลือกผู้ขายรายอื่น") && !exhausted.includes("เปลี่ยนผู้ขาย"),
    exhausted,
  );

  // THE TONE, asserted over ALL FOUR values — a mapping is total only if every
  // member is read. ample none, low none, exhausted red, never_provisioned red.
  for (const level of LEVELS) {
    const tone = reserveLevelNotice(level, HOLDING[level].spendable).tone;
    check(
      `R4. tone(${level}) === ${EXPECTED_TONE[level]}`,
      tone === EXPECTED_TONE[level],
      `got=${tone}`,
    );
  }
}

/* ----------------------------------------------------------------- main --- */

function main(): number {
  console.log("P1.23 (commit c4) — the four reserve-level sentences, their tone, and the compile cell");
  r2TotalOverValues();
  r3NeverProvisionedIsNotExhausted();
  r4Exhausted();
  console.log(
    `\n${failures === 0 ? "ALL RESERVE-NOTICE CASES PASSED" : `FAILED — ${String(failures)} check(s)`}`,
  );
  return failures === 0 ? 0 : 1;
}

const code = main();
process.exitCode = code;
console.log(`RESERVENOTICE_EXIT=${String(code)}`);
