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
import { may } from "../session/deviceRole.js";
import type { Grants } from "../session/deviceRole.js";
import { VOID_REJECTED_CODE } from "./types.js";
import type { SyncState } from "./types.js";

/**
 * The codes the server currently emits — one per `_master_data_missing` call
 * site in server/app/bills.py (four sites as of P1.7). Nothing mechanical ties
 * this list to that file: a code added there and not here reaches the yard
 * through the unknown fallback below, which cannot name the fix. That already
 * happened once — `seller_inactive` and `product_inactive` shipped server-side
 * with retirement and this list stayed at two, so a bill parked on a retired
 * seller told the office to set a price or a grade, neither of which would
 * have released it.
 */
export const MASTER_DATA_CODES = [
  "seller_grade_unset",
  "product_price_unset",
  "seller_inactive",
  "product_inactive",
] as const;

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
  /*
   * TWO REMEDIES, AND THE SENTENCE NAMES BOTH. bills.py now falls back to the
   * shop's own default_grade when the seller has none, so this code is raised
   * only when BOTH are unset — and setting EITHER releases the same bill,
   * unchanged, with nothing re-typed at the yard.
   *
   * THE OLD SENTENCE WAS NEVER FALSE. This card is drawn only after the server
   * has already refused, so "this seller has no grade" is true every time it
   * appears. What was wrong is its SHAPE: it named the remedy that has to be
   * repeated for every walk-in and never the one that fixes the shop once —
   * which is the remedy a yard that grades nobody actually needs, and the shop
   * shape the fallback was added for. A wrong-shaped instruction is acted on
   * exactly like a wrong one.
   *
   * NEITHER IS ASSERTED TO BE THE ONE THAT APPLIES, because the device cannot
   * know and must not pretend to: nothing in this client reads the shop's
   * settings, and the same code can arrive from a server build that has no
   * shop default at all. It offers both and lets the office choose.
   *
   * THE BADGE IS DELIBERATELY UNCHANGED. Its job, stated on the field above, is
   * to name WHO the bill is waiting for — and WHO has not moved: it is still
   * the office. The badge is also never drawn without this sentence beside it
   * (app/BillsPanel.tsx renders notice.badge and then notice.lines), and the
   * status strip uses this sentence with no badge at all.
   */
  seller_grade_unset: {
    badge: "รอสำนักงานกำหนดเกรดผู้ขาย",
    what:
      "ผู้ขายรายนี้ยังไม่ได้จัดเกรด จึงยังไม่มีราคาตามเกรด —" +
      " ให้สำนักงานกำหนดเกรดของผู้ขายรายนี้ หรือกำหนดเกรดเริ่มต้นของร้าน",
  },
  product_price_unset: {
    badge: "รอสำนักงานตั้งราคาสินค้า",
    what: "ยังไม่ได้ตั้งราคาสินค้าสำหรับเกรดของผู้ขายรายนี้ — ให้สำนักงานตั้งราคาสินค้าตามเกรดนั้น",
  },
  /*
   * The two retirement causes. The fix is one reactivate click at the office —
   * NOT a price and NOT a grade, and the server says so itself (bills.py: a
   * grade set on a retired seller "would not let the bill through anyway"). So
   * these sentences must not mention price or grade at all: that was the exact
   * wrong instruction the office received while these codes were unmapped.
   */
  seller_inactive: {
    badge: "รอสำนักงานเปิดใช้งานผู้ขาย",
    what: "ผู้ขายรายนี้ถูกปิดใช้งานไว้ — ให้สำนักงานเปิดใช้งานผู้ขายรายนี้อีกครั้ง",
  },
  product_inactive: {
    badge: "รอสำนักงานเปิดใช้งานสินค้า",
    what: "สินค้าในบิลนี้ถูกปิดใช้งานไว้ — ให้สำนักงานเปิดใช้งานสินค้านั้นอีกครั้ง",
  },
};

const isKnown = (code: string): code is MasterDataCode =>
  (MASTER_DATA_CODES as readonly string[]).includes(code);

/* ------------------------------ waiting on a seller this device made ------ */

/**
 * THE NAME OF THE SECOND PARK, AND IT IS DELIBERATELY NOT IN
 * `MASTER_DATA_CODES`.
 *
 * A bill parked behind a seller this device created has no server code, because
 * no request was made — the device parked it before asking. The name exists
 * anyway, for two reasons: a state a proof can only refer to by its column is a
 * state nobody can talk about, and the RED CASE this wording has to survive is
 * precisely somebody routing the new state through `parkedReason(THIS_CODE)`
 * and getting the cause-neutral office fallback.
 *
 * IF IT EVER JOINS `MASTER_DATA_CODES` THE SENTENCE BECOMES A LIE. Everything
 * in that table says the OFFICE must act, and `REASSURE` says so again — and
 * here nobody must. A proof asserts the absence.
 */
export const LOCAL_SELLER_PENDING_CODE = "local_seller_pending";

/**
 * WHAT THE YARD IS TOLD ABOUT A BILL WAITING ON ITS OWN SELLER.
 *
 * ---------------------------------------------------------------------------
 * IT MUST NOT BORROW THE MASTER-DATA WORDING, AND THE REASON IS NOT STYLE
 * ---------------------------------------------------------------------------
 * Every sentence in `BY_CODE` names the office, and `REASSURE` promises the
 * bill goes "เมื่อสำนักงานแก้ให้แล้ว" — once the office has fixed it. On this
 * state nobody at the office has anything to fix: the bill resolves itself the
 * moment this device reaches the server, which is the same event that was
 * already going to happen. Telling a yard to ring the office about a bill that
 * needs no call is the confidently-wrong instruction
 * `lessons/correct-classification-can-still-render-as-an-error.md` has already
 * been paid for twice — and worse here than there, because the office would
 * look, find nothing wrong, and learn to ignore the next one.
 *
 * IT ALSO PROMISES NOTHING IT CANNOT PERFORM. The bill really does send itself,
 * with no operator action and no office action, as soon as the seller reaches
 * the server. That is a wait the system can keep, unlike the one on a failed
 * bill's card — and the sentence says WHY it is waiting, so the wait is
 * auditable rather than merely requested.
 *
 * `ราย` FOR THE SELLER AND `ใบ` FOR THE BILL, because they are a person and a
 * document.
 */
/**
 * NOT ONE OF THESE THREE STRINGS CONTAINS THE WORD สำนักงาน, and the first
 * draft did — as a NEGATION, "ไม่ต้องแจ้งสำนักงาน", which reads as helpful and
 * is the wrong call.
 *
 * The reasoning that lost: pre-empting the habit is worth a mention. The
 * reasoning that won, and it is the criterion's own: the assertion here is
 * NEGATIVE over the whole concatenation, and a banned-substring check cannot
 * tell a negated mention from an instruction — which is the rider
 * `correct-classification-can-still-render-as-an-error.md` already carries
 * about `รวม 500 ใบ` being read as a leaked 5xx. Weakening the check to allow
 * the negation would weaken it for every future sentence too. And the product
 * argument agrees: a card is READ AT A GLANCE with wet hands, the noun is what
 * a glance catches, and the sentence loses nothing by naming only what the
 * SYSTEM will do.
 */
const LOCAL_SELLER_PARK: ParkedReason = {
  badge: "รอส่งผู้ขายรายใหม่ขึ้นระบบ",
  what: "บิลนี้เป็นของผู้ขายที่เพิ่งเพิ่มใหม่ในเครื่องนี้ ระบบยังไม่มีผู้ขายรายนี้",
  reassure:
    "บิลถูกเก็บไว้ครบแล้ว ไม่ต้องชั่งใหม่และไม่ต้องทำอะไรที่หน้าลาน" +
    " เมื่อเครื่องนี้เชื่อมต่อได้ ระบบจะส่งผู้ขายและบิลให้เองตามลำดับ",
  unknown: false,
};

/**
 * The sentence for a bill parked behind an uncreated local seller.
 *
 * TAKES NOTHING, and that is the guarantee. `parkedReason` takes a code because
 * the server names the cause; here the device already knows it, so there is no
 * parameter through which a code, a body or an id could reach the screen — and
 * no way for a caller to route this state through the office wording by passing
 * the wrong argument.
 */
export function localSellerParkReason(): ParkedReason {
  return { ...LOCAL_SELLER_PARK };
}

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
/*
 * VOID_REJECTED_CODE IS IN THIS LIST AND IS NOT A 403, WHICH IS DELIBERATE AND
 * IS THE ONE THING TO UNDERSTAND BEFORE EDITING IT.
 *
 * This table's job is not "what did a 403 say" — it is "what does a refused
 * void say to the yard", which is what `void_refused_at` records and what
 * billNotice routes through forbiddenReason. A void the SERVER rejected (404,
 * 400, 422) sets the same column and reaches the same branch, so it needs an
 * entry here or it lands on the unknown fallback.
 *
 * AND THAT FALLBACK WOULD BE A LIE. It says this account lacks permission and
 * to ask the shop owner. For a rejected void that is false twice over: the
 * account's permissions are not the problem, and the shop owner cannot fix it
 * either. The operator would be sent to the wrong person about a problem that
 * does not exist, on a bill the server still holds as live money.
 */
/*
 * `permission_required` is what every gated route answers since server migration
 * 0019 (one code for every permission refusal; the permission itself rides in
 * the body's `required_permission`, which nothing here reads -- the ACTION names
 * the sentence). `admin_required` is what those routes answered BEFORE 0019 and
 * NO ROUTE ANSWERS IT ANY MORE. IT STAYS IN THIS LIST ON PURPOSE AND MUST NOT BE
 * DELETED AS DEAD: `void_refused_code` is PERSISTED on the bill row
 * (sync/types.ts), so a bill refused before that deploy still carries the old
 * code on this device and must still render its sentence rather than fall to
 * the unknown wording. The two share one entry per action below.
 */
export const FORBIDDEN_CODES = ["permission_required", "admin_required", VOID_REJECTED_CODE] as const;

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

/**
 * WHAT WAS REFUSED — and why this is a required parameter rather than a default.
 *
 * The server answers `admin_required` for EVERY admin-only path (auth.py's one
 * require_admin), so the code alone does not say what the caller was trying to
 * do. While voiding was the only admin action a phone could reach, the wording
 * below could hardcode it and be right. Phase 2d adds the second one — the daily
 * money view — and the same code now arrives from a screen where "บัญชีนี้ไม่มี
 * สิทธิ์ยกเลิกบิล ระบบจึงยังไม่ได้ยกเลิกบิลใบนี้" is simply false: nothing was
 * being cancelled, and the sentence would send an owner looking for a bill that
 * does not exist.
 *
 * lessons/correct-classification-can-still-render-as-an-error.md: a wrong
 * instruction is worse than a vague one, because it gets acted on. So the ACTION
 * is a required argument — adding a third admin-only path is a compile error at
 * this table until someone writes the sentence for it, rather than a silently
 * inherited one about bills.
 *
 * The three rules the wording is written to are unchanged and hold for every
 * action: never "error", never an invitation to sign in, and always the shop
 * OWNER (never support, never the office, neither of whom can grant a role).
 */
export type ForbiddenAction = "void_bill" | "daily_report";

interface ForbiddenText {
  badge: string;
  what: string;
}

/*
 * `known` is PARTIAL, and that changed when a code arrived that belongs to one
 * action only. A code is not a property of the whole API: void_rejected can
 * happen when cancelling a bill and cannot happen when reading the day's total,
 * and requiring every action to carry every code would force daily_report to
 * invent a sentence for a situation it has no way of reaching. An invented
 * sentence is exactly the wrong instruction this table exists to prevent.
 *
 * The cost is that a missing entry no longer fails to compile, so it falls to
 * the action's own `unknown` text — which is the correct behaviour for a code
 * that action cannot produce, and is the same path an unrecognised server code
 * takes. forbiddenReason below reports `unknown: true` for it either way, so
 * the card still names the raw code rather than pretending to explain it.
 */
const FORBIDDEN_BY_ACTION: Record<
  ForbiddenAction,
  { known: Partial<Record<ForbiddenCode, ForbiddenText>>; unknown: ForbiddenText }
> = {
  void_bill: {
    known: {
      permission_required: {
        badge: "ไม่มีสิทธิ์ยกเลิกบิล",
        what: `บัญชีนี้ไม่มีสิทธิ์ยกเลิกบิล ระบบจึงยังไม่ได้ยกเลิกบิลใบนี้ — ${ASK_THE_OWNER}`,
      },
      // LEGACY: the pre-0019 code, still on rows refused before that deploy.
      admin_required: {
        badge: "ไม่มีสิทธิ์ยกเลิกบิล",
        what: `บัญชีนี้ไม่มีสิทธิ์ยกเลิกบิล ระบบจึงยังไม่ได้ยกเลิกบิลใบนี้ — ${ASK_THE_OWNER}`,
      },
      /*
       * The server refused the CANCELLATION, not the account. So this sentence
       * must not mention permission and must not tell the operator to sign in
       * or wait — neither would change the answer, and both would be an
       * instruction that cannot work. It says what is true and who can act:
       * the system did not cancel it, and the office has to.
       */
      [VOID_REJECTED_CODE]: {
        badge: "ยกเลิกไม่สำเร็จ",
        what: `ระบบไม่รับคำสั่งยกเลิกบิลใบนี้ และจะไม่ลองอีกครั้งให้ — ${ASK_THE_OWNER}`,
      },
    },
    unknown: {
      badge: "ไม่มีสิทธิ์ทำรายการนี้",
      what: `บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้ ระบบจึงยังไม่ได้ทำให้ — ${ASK_THE_OWNER}`,
    },
  },
  /*
   * READING the day's money, not doing anything to it. So the sentence says only
   * that this account may not see it — there is no bill, no cancellation and no
   * consequence to report, and inventing one would be the wrong instruction this
   * whole table exists to prevent. It also does not apologise or suggest the
   * screen is broken: admin-only is a decision somebody made on purpose
   * (server/app/reports.py section 4), and the owner is the one who can change it.
   */
  daily_report: {
    known: {
      permission_required: {
        badge: "ไม่มีสิทธิ์ดูยอดประจำวัน",
        what: `บัญชีนี้ดูยอดเงินประจำวันของร้านไม่ได้ — ${ASK_THE_OWNER}`,
      },
      // LEGACY: the pre-0019 code (see FORBIDDEN_CODES).
      admin_required: {
        badge: "ไม่มีสิทธิ์ดูยอดประจำวัน",
        what: `บัญชีนี้ดูยอดเงินประจำวันของร้านไม่ได้ — ${ASK_THE_OWNER}`,
      },
    },
    unknown: {
      badge: "ไม่มีสิทธิ์ดูข้อมูลนี้",
      what: `บัญชีนี้ดูข้อมูลนี้ไม่ได้ — ${ASK_THE_OWNER}`,
    },
  },
};

export function forbiddenReason(code: string | null, action: ForbiddenAction): ForbiddenReason {
  const texts = FORBIDDEN_BY_ACTION[action];
  if (code !== null && isKnownForbidden(code)) {
    // A code this ACTION has no text for is treated as unrecognised rather than
    // rendered blank: `known` is partial because a code can belong to one action
    // and be unreachable from another.
    const text = texts.known[code];
    if (text !== undefined) return { ...text, unknown: false };
  }
  return { ...texts.unknown, unknown: true };
}

export function parkedReason(code: string | null): ParkedReason {
  if (code !== null && isKnown(code)) {
    return { ...BY_CODE[code], reassure: REASSURE, unknown: false };
  }
  // CAUSE-NEUTRAL on purpose: this branch is only reached by a code this build
  // has never heard of, so any named fix ("a price or a grade" stood here) is a
  // guess that reads as an instruction. Say who owns it and nothing more.
  return {
    badge: "รอข้อมูลจากสำนักงาน",
    what: "บิลนี้ต้องรอสำนักงานแก้ไขข้อมูลหลักให้ก่อน",
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
  /**
   * Set ⟺ the bill is waiting on a seller THIS DEVICE created. A different park
   * with a different actor: the master-data one waits on the office, this one
   * waits on nobody.
   *
   * REQUIRED, never optional — an optional field would leave every existing
   * call site compiling clean while a parked bill rendered whatever the branch
   * below it happens to say, which for a never-attempted bill is NOTHING AT ALL:
   * a card with no notice on a bill that is not going anywhere.
   */
  local_seller_parked_at: string | null;
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

/*
 * NAMES THE ROLE, NOT A PERMISSION TO OPEN. The role schema is two values —
 * `users_role_check` is admin/staff, not a permission system — so the owner's
 * only move is making the account an admin (`ผู้ดูแลระบบ`, the server's own word
 * for it). This said `ให้เปิดสิทธิ์`, promising a permission the schema has no
 * verb for, and a wrong instruction the office ACTS ON is worse than a vague one
 * (lessons/403-is-about-what-the-caller-may-do.md;
 * lessons/correct-classification-can-still-render-as-an-error.md). This is the
 * send path's refusal card; name the role, never a permission. The status
 * strip's own
 * submit-refused sentence (`statusNotice.ts`) never carried the false promise —
 * it already ended `— ต้องแจ้งเจ้าของร้าน` — so only this card changes.
 */
const SUBMIT_REFUSED = {
  badge: "ไม่มีสิทธิ์ส่งบิล",
  what: `บัญชีนี้ไม่มีสิทธิ์ส่งบิลเข้าระบบ — ${ASK_THE_OWNER}ให้ตั้งบัญชีนี้เป็นผู้ดูแลระบบ`,
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
    const r = forbiddenReason(bill.void_refused_code, "void_bill");
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

  /*
   * WAITING ON A SELLER THIS DEVICE CREATED — ABOVE the master-data park.
   *
   * The two cannot both be set on one row today and the ranking is stated
   * rather than assumed: a bill parked here never reaches the server, so it can
   * never collect a 424, and a bill released from here that then gets one has
   * had this column cleared by the release. If they ever were both set, THIS is
   * the one holding the bill out of the queue, and naming the other would send
   * the yard to the office over a bill the office cannot move.
   */
  if (bill.local_seller_parked_at !== null) {
    const r = localSellerParkReason();
    return { tone: "parked", badge: r.badge, lines: [r.what, r.reassure] };
  }

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
 * And no for a session whose permission set LACKS `bills.void`, which is the
 * courtesy half of this phase: the server refuses the void with a 403
 * (server/app/auth.py require(Permission.BILLS_VOID)), so offering the button
 * only produces a refusal the operator then has to be talked out of. `may`
 * FAILS OPEN on an ABSENT set — see src/session/deviceRole.ts for why that is
 * the right direction here: hiding the button from an owner whose set we merely
 * failed to read would remove the only way to correct a wrong bill, while
 * offering it to a staff user costs one refused request and one plain sentence.
 * A set that WAS read is exact (the 0019 narrowing, deliberate).
 *
 * The SERVER REMAINS THE AUTHORITY in both directions. It re-reads the grants
 * from the users -> roles -> role_permissions join on every request, so a revoked
 * grant is refused here whatever the token still claims — which is precisely why
 * the 403 path exists and is proven, rather than this gate being trusted to
 * prevent anything.
 *
 * Here rather than in the view so the rule and the sentence explaining it cannot
 * drift apart, and so a proof can hold them together.
 */
export function canRequestVoid(bill: VoidProgressInput, grants: Grants): boolean {
  return (
    bill.void_requested_at === null && bill.sync_state !== "failed" && may(grants, "bills.void")
  );
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
export function voidRoleNote(bill: VoidProgressInput, grants: Grants): string | null {
  if (may(grants, "bills.void")) return null;
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
  // Mixed causes: CAUSE-NEUTRAL, same rule as parkedReason's unknown branch.
  // This sentence used to enumerate "prices and grades" — right while those
  // were the only two causes, wrong the day a retirement code joined the mix.
  return `${head} — ต้องให้สำนักงานแก้ไขข้อมูลหลักให้ครบทุกรายการก่อน`;
}
