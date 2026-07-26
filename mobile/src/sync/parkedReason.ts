/**
 * What a PARKED bill says to the yard. PURE TypeScript — no React Native, no
 * Expo, no node — so the headless proof exercises exactly what the device runs.
 *
 * WHY THIS IS NOT IN app/messages.ts WITH THE OTHER THAI TEXT. Everything here
 * is a safety rule, not wording:
 *
 *   - a resolvable refusal is NOT an error, so it must never be worded or
 *     coloured as one;
 *   - the server's raw body must never reach the screen;
 *   - an unrecognised code must still produce a readable sentence.
 *
 * All three can regress silently, so they are proven (proveSeller S7). The Thai
 * strings live with them because a mapping that returns a code the caller then
 * has to turn into a sentence is a mapping that can be bypassed.
 *
 * THE DEFECT THIS FILE EXISTS FOR, found on-device in Phase 2c-6: a bill parked
 * on a grade-less seller rendered as
 *
 *   ผิดพลาด: HTTP 424: {"kind":"master_data_missing","code":"seller_grade_unset",
 *   "message":"...","seller_id":"aaaa0000-0000-0000-0000-0000000000aa"}
 *
 * in red. Three separate things wrong at once: it called a resolvable refusal an
 * error, it printed the transport's diagnostic string, and it told the operator
 * nothing they could act on. `last_error` keeps holding that raw text — it is
 * the developer's breadcrumb and pairs with the server's BILL_POISON_CANDIDATE
 * log line — but it is not operator-facing and nothing may render it for a
 * parked bill.
 */

/** The codes the server currently emits. See server/app/bills.py. */
export const MASTER_DATA_CODES = ["seller_grade_unset", "product_price_unset"] as const;

export type MasterDataCode = (typeof MASTER_DATA_CODES)[number];

export interface ParkedReason {
  /**
   * Short badge text. Deliberately not "ผิดพลาด" and not a state name: it names
   * WHO the bill is waiting for, because that is the only thing that decides
   * whether anyone at the yard needs to do something.
   */
  badge: string;
  /** What is missing and who fixes it — one sentence, no jargon. */
  what: string;
  /**
   * That the bill is safe and will send itself. Constant across codes on
   * purpose: it is true of parking in general, and the operator needs it more
   * than they need the distinction.
   */
  reassure: string;
  /** True when the code was not recognised, so the UI can append it verbatim. */
  unknown: boolean;
}

const REASSURE =
  "บิลถูกเก็บไว้ครบแล้ว ไม่ต้องชั่งใหม่และไม่ต้องทำอะไรที่หน้าลาน" +
  " เมื่อสำนักงานแก้ให้แล้ว ระบบจะส่งเองอัตโนมัติ";

const BY_CODE: Record<MasterDataCode, { badge: string; what: string }> = {
  seller_grade_unset: {
    badge: "รอสำนักงานกำหนดเกรดผู้ขาย",
    what: "ผู้ขายรายนี้ยังไม่ได้กำหนดเกรด จึงยังไม่มีราคาตามเกรด — ให้สำนักงานกำหนดเกรดของผู้ขายรายนี้",
  },
  product_price_unset: {
    badge: "รอสำนักงานตั้งราคาสินค้า",
    what: "ยังไม่ได้ตั้งราคาสินค้าสำหรับเกรดของผู้ขายรายนี้ — ให้สำนักงานตั้งราคาสินค้าตามเกรดนั้น",
  },
};

const isKnown = (code: string): code is MasterDataCode =>
  (MASTER_DATA_CODES as readonly string[]).includes(code);

/**
 * The operator-facing reason a bill is parked.
 *
 * Takes the server's `code` ONLY — never the response body, never `last_error`.
 * That is the guarantee: there is no parameter through which raw JSON, a UUID,
 * or an HTTP status could reach the screen.
 *
 * A null or unrecognised code still returns a usable sentence. A future server
 * release naming a new cause must degrade to "the office must set something up,
 * and the bill is safe" — which is the actionable part anyway — rather than to a
 * blank card or a stack of punctuation.
 */
export function parkedReason(code: string | null): ParkedReason {
  if (code !== null && isKnown(code)) {
    return { ...BY_CODE[code], reassure: REASSURE, unknown: false };
  }
  return {
    badge: "รอข้อมูลจากสำนักงาน",
    what: "บิลนี้ต้องรอสำนักงานตั้งข้อมูลหลักให้ก่อน (ราคาสินค้าหรือเกรดผู้ขาย)",
    reassure: REASSURE,
    unknown: true,
  };
}

/* ------------------------------------------------- what the card shows ---- */

/**
 * The notice region of a bill card: the one place operator-facing failure text
 * is decided.
 *
 * WHY THIS IS A FUNCTION AND NOT A CONDITION IN THE VIEW. The first fix for the
 * on-device defect was a gate — render the raw error only when `!parked`. It was
 * correct for every state I thought of, and wrong for the one I did not: while
 * ส่งอีกครั้ง retried a parked bill, the parked flag was already cleared and the
 * stale 424 text was not, so the red JSON came back for the length of the
 * request. Hand-enumerating states is what failed. So the view no longer sees
 * `last_error` at all — it renders whatever this returns, and the proof
 * enumerates states over this instead of over a screen.
 *
 * The remaining guarantee is an invariant, not a gate: `last_error` can only
 * hold a 424 body while `master_data_missing_at` is set, because
 * markMasterDataMissing is the only writer of that text and every other
 * transition either overwrites last_error with its own reason
 * (markFailed/markPendingAgain) or clears it (markSynced,
 * releaseMasterDataBlocked). So "tone: error" can never carry a 424 body.
 */
export type NoticeTone = "none" | "parked" | "error";

export interface BillNotice {
  tone: NoticeTone;
  /** Replacement badge text, or null to use the plain sync-state badge. */
  badge: string | null;
  /** Lines to show, already operator-ready. Empty when there is nothing to say. */
  lines: string[];
}

/** Just the fields the notice depends on, so the proof needs no whole LocalBill. */
export interface NoticeInput {
  last_error: string | null;
  master_data_missing_at: string | null;
  master_data_code: string | null;
  void_requested_at: string | null;
}

const NO_NOTICE: BillNotice = { tone: "none", badge: null, lines: [] };

export function billNotice(bill: NoticeInput): BillNotice {
  // A voided bill has its own region (the reason the owner gave). Nothing about
  // a send failure is worth saying about a bill that has been reversed.
  if (bill.void_requested_at !== null) return NO_NOTICE;

  if (bill.master_data_missing_at !== null) {
    const r = parkedReason(bill.master_data_code);
    const lines = [r.what, r.reassure];
    // An unrecognised code is named ALONE — never the body it arrived in.
    if (r.unknown && bill.master_data_code !== null) {
      lines.push(`รหัส: ${bill.master_data_code}`);
    }
    return { tone: "parked", badge: r.badge, lines };
  }

  if (bill.last_error !== null) {
    return { tone: "error", badge: null, lines: [`ผิดพลาด: ${bill.last_error}`] };
  }

  return NO_NOTICE;
}

/**
 * One line for the status strip, covering EVERY parked bill at once.
 *
 * Codes are passed in rather than a count, because the two causes need different
 * actions from the office and the strip previously hardcoded the price wording —
 * so a bill parked on a missing seller GRADE told the office to go and set a
 * price, which is not the thing that would release it. Mixed causes fall back to
 * the neutral sentence rather than picking one and being wrong about the other.
 */
export function parkedSummary(count: number, codes: readonly string[]): string {
  const distinct = [...new Set(codes)];
  const head = `${String(count)} ใบรอข้อมูลจากสำนักงาน`;
  const only = distinct.length === 1 ? distinct[0] : undefined;
  if (only !== undefined) return `${head} — ${parkedReason(only).what}`;
  return `${head} — ต้องให้สำนักงานตั้งราคาสินค้าและกำหนดเกรดผู้ขายให้ครบก่อน`;
}
