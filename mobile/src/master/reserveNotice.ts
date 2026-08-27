/**
 * WHAT THE YARD IS TOLD ABOUT ITS RESERVE OF SELLER CODES — one sentence per
 * level, and the tone each carries.
 *
 * PURE TypeScript — no React Native, no Expo, no node — so the headless proof
 * drives exactly what the phone renders. The DECISION (the four sentences and
 * the tone) lives here; a strip or sheet in `app/` draws `reserveSurface`'s
 * output. The level itself is `sellerRefill.ts`'s `reserveLevel`, built and
 * proven at P1.8b MOBILE; this only says what each of its four values MEANS to a
 * person at a weighbridge.
 *
 * ---------------------------------------------------------------------------
 * DERIVED FROM THE CAUSE, AND A DIAGNOSTIC CANNOT BE PASSED IN
 * ---------------------------------------------------------------------------
 * The mapping takes the LEVEL and a COUNT and nothing else. A count is not a
 * diagnostic: `last_error`, a server body, a code — none is assignable to
 * `ReserveLevel` (four string literals) or to `number`, so the compiler refuses
 * a diagnostic at the argument position, not merely refuses to name one. That is
 * the real guarantee here, stated precisely because a narrowing type usually
 * stops a field being NAMED and not an object being PASSED
 * (`lessons/a-narrowing-type-is-not-a-barrier-to-the-object.md`) — here neither
 * parameter's type admits a diagnostic value at all, so the sentence for a state
 * can only be derived from the state.
 *
 * ---------------------------------------------------------------------------
 * TONE IS DERIVED FROM THE LEVEL BY ONE QUESTION, AND THERE IS NO AMBER
 * ---------------------------------------------------------------------------
 * *Does this state need a person to do something NOW?* `ample` no. `low` no — the
 * next online pass tops it up and nothing a person does helps. `exhausted` yes —
 * an offline walk-in is impossible until the device reaches the network.
 * `never_provisioned` yes — the device has never been provisioned and a person
 * must connect it once. So the four tones are none, none, red, red: an amber that
 * fired on `low`, the NORMAL state of a working device, would be a red its reader
 * is trained to ignore, and the state that then goes unseen is the one that needs
 * them. `low`'s legibility is a NUMBER, not a colour — the codes it still holds.
 */
import { reserveLevel } from "../sync/sellerRefill.js";
import type { HoldingCounts, ReserveLevel } from "../sync/sellerRefill.js";

/** Red is for a state that needs a person now; none for one that clears itself. */
export type ReserveTone = "none" | "red";

/**
 * A finished notice: the tone, and the Thai lines in DRAW ORDER. The lines are
 * the whole content — a caller renders the tone and joins the lines; the
 * composition a proof asserts over is exactly this concatenation.
 */
export interface ReserveLevelNotice {
  readonly tone: ReserveTone;
  readonly lines: readonly string[];
}

/**
 * Tone from the level alone, by the one question above. A total switch, so a
 * fifth level cannot arrive without a tone and no tone can be chosen for a reason
 * the level does not carry.
 */
function reserveTone(level: ReserveLevel): ReserveTone {
  switch (level) {
    case "ample":
    case "low":
      return "none";
    case "exhausted":
    case "never_provisioned":
      return "red";
  }
}

/**
 * The lines for a level, in draw order. `remaining` is the count of codes the
 * device can still spend — a REAL number from the holding, shown only by `low`,
 * never invented (`lessons/fallback-default-is-a-wrong-number.md`): a count that
 * cannot be true is worse than no count.
 */
function reserveLines(level: ReserveLevel, remaining: number): readonly string[] {
  switch (level) {
    case "ample":
      // Nothing to act on; the device holds enough to buy from walk-ins offline.
      return ["โควตารหัสผู้ขายเพียงพอ — เพิ่มผู้ขายใหม่จากหน้าลานได้ตามปกติ"];
    case "low":
      // Still able, below target. The legibility is the number, not a colour.
      return [`โควตารหัสผู้ขายเหลือ ${String(remaining)} รหัส — ยังเพิ่มผู้ขายใหม่จากหน้าลานได้ และจะเติมเองเมื่อต่อเน็ต`];
    case "exhausted":
      // Line 1: the state, no promise that waiting fixes it. Line 2 (the presence
      // sibling): what the yard CAN still do — record against an existing seller,
      // and create a new one from the counter once online. It must NOT offer
      // picking a different seller for THIS load, which is a wrong seller on a
      // cash purchase.
      return [
        "โควตารหัสผู้ขายในเครื่องหมด — เพิ่มผู้ขายใหม่จากหน้าลานไม่ได้จนกว่าจะต่อเน็ต",
        "ยังบันทึกบิลกับผู้ขายที่มีอยู่ได้ และเพิ่มผู้ขายใหม่ได้ที่เคาน์เตอร์เมื่อต่อเน็ต",
      ];
    case "never_provisioned":
      // Distinct from exhausted: the device has spent nothing, it has never been
      // provisioned. Telling this operator they used up their codes is a lie about
      // something they never did. The instruction is to connect once, not to wait.
      return [
        "เครื่องนี้ยังไม่เคยรับโควตารหัสผู้ขาย — ต้องต่อเน็ตและเข้าสู่ระบบสักครั้งก่อน จึงจะเพิ่มผู้ขายจากหน้าลานได้",
      ];
  }
}

/**
 * The sentence and tone for a level. REQUIRED level, never optional with a
 * default: a default would leave every call site compiling clean while rendering
 * the wrong sentence, which is the defect the design names in its own words. The
 * level is a closed union, so a value it cannot express — a fifth state, or the
 * tone `amber` mistaken for a level — fails to compile at every call site.
 */
export function reserveLevelNotice(level: ReserveLevel, remaining: number): ReserveLevelNotice {
  return { tone: reserveTone(level), lines: reserveLines(level, remaining) };
}

/**
 * THE RENDER COMPOSITION — the call site a strip or sheet uses, and the one the
 * compile cell targets. It derives the level from the HOLDING (never from a
 * refill's outcome) and shows the spendable count where `low` names it. Given a
 * holding, there is exactly one notice; nothing here reads the network.
 */
export function reserveSurface(holding: HoldingCounts): ReserveLevelNotice {
  return reserveLevelNotice(reserveLevel(holding), holding.spendable);
}
