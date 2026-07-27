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
 *
 * PHASE 2c-7 WIDENED THAT LAST SENTENCE to "…and nothing may render it, full
 * stop". See billNotice below: `last_error` is not a parameter of anything in
 * this file any more.
 */
import type { SyncState } from "./types.js";

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
 * PHASE 2c-7 CLOSED THE HOLE THAT LEFT. The previous version kept an invariant
 * argument — "last_error can only hold a 424 body while the bill is parked, so
 * tone: error can never carry one" — which was true and beside the point,
 * because EVERY OTHER last_error was still rendered raw and red. An offline bill
 * showed `ผิดพลาด: network: Network request failed` on every card in the yard
 * while the status strip, correctly, said ออฟไลน์. The bill was not in error: it
 * was waiting, exactly like a parked one, and saying otherwise sends staff to
 * re-weigh a load or ring the office about a bill that needs neither.
 *
 * So `last_error` is no longer a PARAMETER. There is now no value this function
 * could render a diagnostic from, which is a stronger guarantee than any
 * invariant about who writes that column — it is the [[correct-classification-
 * can-still-render-as-an-error]] rule applied one level up: prefer a shape where
 * the leak is unrepresentable.
 *
 * The tone is derived from STATE, never from the text of a failure:
 *
 *   error   ⟺ sync_state === 'failed'. markFailed is its only writer and only a
 *             PERMANENT rejection (422) reaches it, so this really is the
 *             terminal case — something a human must act on now.
 *   parked  ⟺ master_data_missing_at set. The office owes something.
 *   session ⟺ there is no usable session. Sign in; nothing else will help.
 *   waiting ⟺ pending/syncing and it has actually bounced. Retries forever.
 *   none      nothing worth saying.
 */
export type NoticeTone = "none" | "waiting" | "session" | "parked" | "error";

/**
 * Whether the device can talk to the server AS SOMEONE at all.
 *
 * Device-global and deliberately NOT stored per bill. The token lives in memory
 * only, so a per-bill "session expired" flag would outlive its own truth: sign
 * in, and every bill still carrying the flag keeps telling the operator to sign
 * in until it is next attempted. Derived state cannot go stale — that is the
 * same failure mode as the half-updated parked row, avoided by construction.
 */
export type SessionState = "active" | "expired" | "signed_out";

export interface BillNotice {
  tone: NoticeTone;
  /** Replacement badge text, or null to use the plain sync-state badge. */
  badge: string | null;
  /** Lines to show, already operator-ready. Empty when there is nothing to say. */
  lines: string[];
}

/** Just the fields the notice depends on, so the proof needs no whole LocalBill. */
export interface NoticeInput {
  sync_state: SyncState;
  /** Failed send attempts. 0 means it has not been tried yet, which is not news. */
  attempt_count: number;
  master_data_missing_at: string | null;
  master_data_code: string | null;
  void_requested_at: string | null;
}

const NO_NOTICE: BillNotice = { tone: "none", badge: null, lines: [] };

/** True of parking, of an outage and of an ended session alike. */
const NOTHING_OWED_BY_YOU =
  "บิลถูกเก็บไว้ในเครื่องครบแล้ว ไม่ต้องชั่งใหม่และไม่ต้องกรอกใหม่";

const SESSION_TEXT: Record<Exclude<SessionState, "active">, { badge: string; what: string }> = {
  expired: {
    badge: "ต้องเข้าสู่ระบบใหม่",
    what: "หมดเวลาเข้าใช้งาน ต้องเข้าสู่ระบบใหม่ก่อน บิลจึงจะส่งเข้าระบบได้",
  },
  signed_out: {
    badge: "ยังไม่ได้เข้าสู่ระบบ",
    what: "ยังไม่ได้เข้าสู่ระบบ บิลจึงยังส่งเข้าระบบไม่ได้",
  },
};

/**
 * A bill the server refused PERMANENTLY (422). Three sentences, in this order,
 * because the operator needs three different things:
 *
 *   1. what happened — and that it will not fix itself, so nobody waits for it;
 *   2. why there is no ยกเลิก button on this card. The card used to offer one
 *      and promise "รอส่งบิลเข้าระบบก่อน แล้วจะยกเลิกให้อัตโนมัติ", which could
 *      never happen: listVoidsToApply requires sync_state='synced', and nothing
 *      moves a failed bill there. A void of a bill the server has never seen is
 *      not a void of anything;
 *   3. what to actually do. Cash left the drawer and the server has no record of
 *      it, so this row is the ONLY evidence the purchase happened. That is why
 *      the bill is kept and shown rather than discarded: a hard delete here is
 *      the money silently disappearing (project hard rule 5).
 */
const FAILED_LINES: readonly string[] = [
  "ระบบไม่รับบิลใบนี้ และจะไม่รับเองในภายหลัง",
  "ระบบยังไม่มีบิลใบนี้เลย จึงไม่มีอะไรให้ยกเลิกในระบบ",
  "จ่ายเงินไปแล้วแต่ระบบไม่มีบิลใบนี้ — ต้องแจ้งสำนักงานให้บันทึกให้ ข้อมูลบิลนี้อยู่ในเครื่องนี้ที่เดียว",
];

export function billNotice(bill: NoticeInput, session: SessionState): BillNotice {
  // FIRST, ahead of the void branch. A terminally failed bill needs a human
  // whether or not someone has since pressed ยกเลิก — and if it were ranked
  // below, a void request would HIDE it behind a calm ยกเลิกแล้ว card while the
  // server still has no record of the money. That state is reachable: void an
  // unsynced bill, then let the send be refused.
  if (bill.sync_state === "failed") {
    return { tone: "error", badge: null, lines: [...FAILED_LINES] };
  }

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

  // Nothing below applies to a bill that is already on the server.
  if (bill.sync_state !== "pending" && bill.sync_state !== "syncing") return NO_NOTICE;

  // Ranked BELOW parked: a parked bill is waiting on the office, and that stays
  // the more specific and more useful thing to say even while signed out.
  if (session !== "active") {
    const s = SESSION_TEXT[session];
    return { tone: "session", badge: s.badge, lines: [s.what, NOTHING_OWED_BY_YOU] };
  }

  // It has bounced at least once and is still owed. Whether that was a dead
  // spot, a timeout or a 5xx is a DIAGNOSTIC distinction, not an operator one —
  // in every case the answer is "nothing, it sends itself". A head bill the
  // reachable server keeps refusing is escalated separately and loudly, by
  // queueHealth into the status strip and the card's blocker banner; that is the
  // one place the difference changes what anyone should do.
  if (bill.attempt_count > 0) {
    return {
      tone: "waiting",
      badge: null,
      lines: ["ยังส่งเข้าระบบไม่ได้ตอนนี้ ระบบจะส่งให้เองเมื่อเชื่อมต่อได้", NOTHING_OWED_BY_YOU],
    };
  }

  return NO_NOTICE;
}

/* -------------------------------------------------- what a void promises ---- */

/** The fields the void region depends on. */
export interface VoidProgressInput {
  sync_state: SyncState;
  doc_no: string | null;
  void_requested_at: string | null;
  voided_at: string | null;
}

/**
 * What the void region says, or null when there is no void to report.
 *
 * THE DEFECT THIS EXISTS FOR (Phase 2c-7). The line was chosen in the view by
 * `doc_no === null ? "รอส่งบิลเข้าระบบก่อน แล้วจะยกเลิกให้อัตโนมัติ" : …`. For a
 * pending or parked bill that promise is true — it syncs, then the void applies.
 * For a TERMINALLY FAILED bill it is a promise the system cannot keep: nothing
 * retries a failed bill, so it never becomes synced, so listVoidsToApply never
 * returns it, so the void never happens. Meanwhile cash has been paid and the
 * server has no record of the bill at all, and nothing anywhere said so.
 *
 * doc_no was the wrong thing to branch on. "Has it got a number yet" answers a
 * different question from "can it ever get one".
 */
export function voidProgressLine(bill: VoidProgressInput): string | null {
  if (bill.void_requested_at === null) return null;
  if (bill.voided_at !== null) return "แจ้งระบบแล้ว";
  if (bill.sync_state === "failed") {
    return "ระบบไม่เคยรับบิลใบนี้ จึงไม่มีอะไรให้ยกเลิกในระบบ — ต้องแจ้งสำนักงาน";
  }
  if (bill.doc_no === null) return "รอส่งบิลเข้าระบบก่อน แล้วจะยกเลิกให้อัตโนมัติ";
  return "รอแจ้งระบบ จะดำเนินการให้อัตโนมัติ";
}

/**
 * May the operator ask to void this bill?
 *
 * No for a terminally failed one. Voiding means "the server has this bill and
 * must reverse it", and the server has never had this bill — so the button was
 * offering an action the system cannot perform, which is the promise itself.
 * What replaces it is not silence: the card says the bill never reached the
 * system and that the office must be told (FAILED_LINES above).
 *
 * Here rather than in the view so the rule and the sentence explaining it cannot
 * drift apart, and so a proof can hold them together.
 */
export function canRequestVoid(bill: VoidProgressInput): boolean {
  return bill.void_requested_at === null && bill.sync_state !== "failed";
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
