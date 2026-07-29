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
import { mayVoid } from "../session/deviceRole.js";
import type { DeviceRole } from "../session/deviceRole.js";
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
/* ---------------------------------------------- what a 403 says to the yard */

/**
 * The codes the server currently emits with a 403. See server/app/auth.py.
 *
 * There is exactly one today and the list exists anyway, for the same reason
 * MASTER_DATA_CODES does: the fallback below has to be reached by something, and
 * a mapping with no unknown case is a blank card the first time the server names
 * a cause this build has not heard of.
 */
export const FORBIDDEN_CODES = ["admin_required"] as const;

export type ForbiddenCode = (typeof FORBIDDEN_CODES)[number];

const isKnownForbidden = (code: string): code is ForbiddenCode =>
  (FORBIDDEN_CODES as readonly string[]).includes(code);

/**
 * WHAT THE SERVER REFUSED THIS ACCOUNT, and what has to happen next.
 *
 * Written to three rules, all of them things the wrong wording would cost real
 * money or real trust:
 *
 *  1. It never says "error". Nothing is broken. The app, the bill, the network
 *     and the server are all working exactly as designed — this account simply
 *     may not do this, which is a decision somebody made on purpose.
 *  2. It never invites a sign-in. Signing in returns the SAME user with the SAME
 *     role, so "try signing in again" is a loop with a person in it. This is the
 *     one thing that separates the wording here from the session wording, and
 *     getting it wrong would be worse than saying nothing.
 *  3. It names WHO can fix it, and that person is not support and not the
 *     office's data — it is the shop owner, because what has to change is a
 *     permission, not a price.
 */
export interface ForbiddenReason {
  badge: string;
  /** What was refused and who to tell. One sentence. */
  what: string;
  /** True when the code was not recognised. */
  unknown: boolean;
}

const ASK_THE_OWNER = "ต้องแจ้งเจ้าของร้าน";

const FORBIDDEN_BY_CODE: Record<ForbiddenCode, { badge: string; what: string }> = {
  admin_required: {
    badge: "ไม่มีสิทธิ์ยกเลิกบิล",
    what: `บัญชีนี้ไม่มีสิทธิ์ยกเลิกบิล ระบบจึงยังไม่ได้ยกเลิกบิลใบนี้ — ${ASK_THE_OWNER}`,
  },
};

export function forbiddenReason(code: string | null): ForbiddenReason {
  if (code !== null && isKnownForbidden(code)) {
    return { ...FORBIDDEN_BY_CODE[code], unknown: false };
  }
  return {
    badge: "ไม่มีสิทธิ์ทำรายการนี้",
    what: `บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้ ระบบจึงยังไม่ได้ทำให้ — ${ASK_THE_OWNER}`,
    unknown: true,
  };
}

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
 *   error     ⟺ sync_state === 'failed'. markFailed is its only writer and only
 *               a PERMANENT rejection (422) reaches it, so this really is the
 *               terminal case — something a human must act on now.
 *   parked    ⟺ master_data_missing_at set. The office owes something.
 *   forbidden ⟺ the server refused THIS ACCOUNT (403). Only the shop owner can
 *               change it, and no waiting and no signing in will.
 *   session   ⟺ there is no usable session. Sign in; nothing else will help.
 *   waiting   ⟺ pending/syncing and it has actually bounced. Retries forever.
 *   none        nothing worth saying.
 *
 * `forbidden` is its own tone and not a shade of `error` or of `session`, for
 * the same reason it is its own SendOutcome member: a tone is a STATE here, not
 * a colour, and every one of them names a different owner of the next action.
 * Rendering two of them alike is a decision the view may make in one place; a
 * state that has no tone of its own cannot be told apart anywhere.
 */
export type NoticeTone = "none" | "waiting" | "session" | "parked" | "forbidden" | "error";

/**
 * Whether the device can talk to the server AS SOMEONE at all.
 *
 * Device-global and deliberately NOT stored per bill: a per-bill "session
 * expired" flag would outlive its own truth, because signing in fixes every bill
 * at once while the flags would keep telling the operator to sign in until each
 * was next attempted. Derived state cannot go stale — the same failure mode as
 * the half-updated parked row, avoided by construction.
 *
 * PHASE 2c-8 NOTE, because this paragraph used to lean on a premise that has
 * changed: the supporting argument was "the token lives in memory only, so a
 * restart is signed out anyway". It no longer does — the token is restored from
 * the OS keystore at boot (src/session/tokenStore.ts). The rule above is
 * unaffected: it never depended on the token being volatile, only on this being
 * one fact about the DEVICE rather than N copies on rows.
 */
export type SessionState = "active" | "expired" | "signed_out";

/**
 * WHAT THE SERVER HAS REFUSED THIS ACCOUNT — device-global, derived, and read
 * off the server's last answer, exactly like SessionState above.
 *
 * "submit_refused" means a 403 came back from POST /bills: this account may not
 * submit bills at all. It is device-global rather than per-bill because a role
 * gate refuses EVERY bill identically — the 401 lesson's rule 3 — so N copies on
 * N rows would be N things to retract, each outliving its own truth the moment
 * the role changed.
 *
 * A REFUSED VOID IS NOT IN HERE, and the asymmetry is deliberate. That one is
 * stamped on the bill (void_refused_at), because the row is making a false claim
 * about ITSELF — the card says ยกเลิกแล้ว for a bill the server still holds live
 * — and that claim has to be corrected on the row, durably, across a restart.
 * This type is about what the device may do next; that column is about what
 * already did not happen.
 */
export type AccountState = "ok" | "submit_refused";

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
  /** Set ⟺ the server refused to void this bill because of who asked (403). */
  void_refused_at: string | null;
  void_refused_code: string | null;
}

const NO_NOTICE: BillNotice = { tone: "none", badge: null, lines: [] };

/** True of parking, of an outage and of an ended session alike. */
const NOTHING_OWED_BY_YOU =
  "บิลถูกเก็บไว้ในเครื่องครบแล้ว ไม่ต้องชั่งใหม่และไม่ต้องกรอกใหม่";

/**
 * The second line of a refused void, and the only reason that state is worth
 * modelling at all: the purchase STANDS. Said plainly, in money terms, because
 * the operator has just been shown a card they had every reason to read as
 * cancelled — and because the bill is still countable at the end of the day.
 */
const VOID_REFUSED_STILL_LIVE =
  "บิลใบนี้ยังอยู่ในระบบตามเดิม ยังไม่ถูกยกเลิก";

const SUBMIT_REFUSED = {
  badge: "ไม่มีสิทธิ์ส่งบิล",
  what: `บัญชีนี้ไม่มีสิทธิ์ส่งบิลเข้าระบบ — ${ASK_THE_OWNER}ให้เปิดสิทธิ์`,
};

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

export function billNotice(
  bill: NoticeInput,
  session: SessionState,
  account: AccountState,
): BillNotice {
  // FIRST, ahead of the void branch. A terminally failed bill needs a human
  // whether or not someone has since pressed ยกเลิก — and if it were ranked
  // below, a void request would HIDE it behind a calm ยกเลิกแล้ว card while the
  // server still has no record of the money. That state is reachable: void an
  // unsynced bill, then let the send be refused.
  if (bill.sync_state === "failed") {
    return { tone: "error", badge: null, lines: [...FAILED_LINES] };
  }

  /*
   * A VOID THE SERVER REFUSED — above the void branch below, and that ordering is
   * the whole point of this branch existing.
   *
   * Every refused void also has void_requested_at set, so ranked the other way it
   * would fall into "voided, nothing more to say" and the card would go on
   * showing ยกเลิกแล้ว with the total struck through — for a bill the server
   * still holds as LIVE MONEY. The yard would believe a purchase was reversed
   * while the office's totals say it stands, and nothing anywhere would disagree.
   * That is the money going quiet, and it is the failure this state exists to
   * make impossible.
   */
  if (bill.void_refused_at !== null) {
    const r = forbiddenReason(bill.void_refused_code);
    const lines = [r.what, VOID_REFUSED_STILL_LIVE];
    // An unrecognised code is named ALONE — never the body it arrived in.
    if (r.unknown && bill.void_refused_code !== null) {
      lines.push(`รหัส: ${bill.void_refused_code}`);
    }
    return { tone: "forbidden", badge: r.badge, lines };
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

  /*
   * THIS ACCOUNT MAY NOT SUBMIT BILLS. Ranked below session (with no session
   * nothing works at all, so that is the first thing to fix) and ABOVE waiting,
   * which is the branch it exists to displace: "ระบบจะส่งให้เองเมื่อเชื่อมต่อได้"
   * is a promise the system cannot keep here, and it would be shown on every card
   * in the yard while the bills quietly never went anywhere.
   */
  if (account === "submit_refused") {
    return {
      tone: "forbidden",
      badge: SUBMIT_REFUSED.badge,
      lines: [SUBMIT_REFUSED.what, NOTHING_OWED_BY_YOU],
    };
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
  /** Set ⟺ the server refused this void because of who asked (403). */
  void_refused_at: string | null;
  void_refused_code: string | null;
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
 *
 * THE SAME DEFECT, FOUND AGAIN IN THIS PHASE and worth writing down because it
 * was not found by thinking harder — it was found by reading the two regions of
 * one card together. billNotice had already been taught the refusal, so the
 * notice box said "ระบบจึงยังไม่ได้ยกเลิกบิลใบนี้" while this function, two
 * lines above it on the same card, still said "รอแจ้งระบบ จะดำเนินการให้
 * อัตโนมัติ". One card, two opposite claims, and the reassuring one is the one an
 * operator with wet hands and a queue behind them will believe. Teaching one
 * renderer about a new state and not its neighbour is exactly the shape of
 * [[correct-classification-can-still-render-as-an-error]]'s 2c-7 amendment.
 */
export function voidProgressLine(bill: VoidProgressInput): string | null {
  if (bill.void_requested_at === null) return null;
  if (bill.voided_at !== null) return "แจ้งระบบแล้ว";
  /*
   * REFUSED, ranked directly under "settled" — above the failed and doc_no
   * branches, because it is the most recent DEFINITE answer the server has given
   * about this void and it contradicts everything below it.
   *
   * Short on purpose: the notice box carries why and what to do (billNotice's
   * forbidden branch). What this line owes the operator is the single fact the
   * rest of the card's shape argues against — it did NOT happen — plus who can
   * make it happen. No "อัตโนมัติ", ever: nothing on this device or on the server
   * will perform this void, and a promise nobody can keep is how a cancelled
   * purchase quietly stays on the books.
   */
  if (bill.void_refused_at !== null) return "ระบบไม่ได้ยกเลิกให้ — ต้องแจ้งเจ้าของร้าน";
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
 * And no for a device signed in as STAFF, which is the courtesy half of this
 * phase: the server refuses the void with a 403 (server/app/auth.py
 * require_admin), so offering the button only produces a refusal the operator
 * then has to be talked out of. `mayVoid` FAILS OPEN on an unreadable or
 * unknown token — see src/session/deviceRole.ts for why that is the right
 * direction here: hiding the button from an admin whose token we merely failed
 * to parse would remove the only way to correct a wrong bill, while offering it
 * to a staff user costs one refused request and one plain sentence.
 *
 * The SERVER REMAINS THE AUTHORITY in both directions. It re-reads the role from
 * the users row on every request, so a demoted admin is refused here whatever
 * their token still claims — which is precisely why the 403 path exists and is
 * proven, rather than this gate being trusted to prevent anything.
 *
 * Here rather than in the view so the rule and the sentence explaining it cannot
 * drift apart, and so a proof can hold them together.
 */
export function canRequestVoid(bill: VoidProgressInput, role: DeviceRole): boolean {
  return bill.void_requested_at === null && bill.sync_state !== "failed" && mayVoid(role);
}

/**
 * The line that REPLACES the button when the role is what hid it, or null.
 *
 * Silence would have been cheaper and is the wrong answer: a button that was
 * there yesterday and is gone today reads as a broken app, and the operator's
 * next move is to hunt for it or to ring someone about the wrong thing. It says
 * who can do it instead — and it is deliberately NOT shown for the other reason
 * the button can be absent (a terminally failed bill), which has three sentences
 * of its own in FAILED_LINES and does not need a fourth contradicting them.
 */
export function voidRoleNote(bill: VoidProgressInput, role: DeviceRole): string | null {
  if (mayVoid(role)) return null;
  // Only where the button would otherwise have been offered. On a failed or
  // already-voided bill nobody is being denied anything.
  if (bill.void_requested_at !== null || bill.sync_state === "failed") return null;
  return "ยกเลิกบิลได้เฉพาะบัญชีเจ้าของร้าน";
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
