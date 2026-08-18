/**
 * THE DAY'S MONEY, AS THE OWNER READS IT.
 *
 * Every rendering decision for `GET /reports/daily`, as pure functions. No React
 * Native, no Expo, no node, no fetch — so the headless proof exercises exactly
 * the sentences and exactly the branches the phone runs. Same reason billNotice
 * and statusNotice live under src/ rather than app/: files under app/ are outside
 * the proven surface, and every operator-facing sentence that ever shipped wrong
 * was one no proof could see
 * (lessons/correct-classification-can-still-render-as-an-error.md).
 *
 * The view renders whatever this returns and decides nothing itself.
 *
 * ---------------------------------------------------------------------------
 * WHO THIS SCREEN IS FOR, AND WHY THAT CHANGES THE RULES
 * ---------------------------------------------------------------------------
 * This is the first screen built for the OWNER rather than the yard. The reader
 * is standing at the cash box at closing time with the day's takings in their
 * hand, comparing two numbers. That makes two things true that are not true of
 * any other screen in this app:
 *
 *   1. THE NUMBER IS THE SCREEN. Everything else is context for it.
 *   2. A NUMBER THAT IS WRONG IN THE LOW DIRECTION IS THE DANGEROUS ONE. If the
 *      screen says less than the drawer holds, the honest conclusion is "some
 *      bills have not arrived yet" and the dishonest one is "someone is short".
 *      The whole understatement section below exists so the first conclusion is
 *      the one on the screen, permanently, before anybody has to reach it.
 *
 * ---------------------------------------------------------------------------
 * MONEY IS NEVER A NUMBER HERE. NOT ONCE.
 * ---------------------------------------------------------------------------
 * Every money value on this screen is the STRING the server sent, copied
 * through byte for byte. There is no parse, no `Number()`, no `toFixed`, no
 * grouping, no rounding and no currency formatter anywhere in this file, and the
 * proof asserts identity on every money field rather than merely "looks right".
 *
 * `readMoney` therefore REFUSES a JSON number. A money field arriving as `1234.5`
 * instead of `"1234.50"` means a float reached the wire, which is the exact drift
 * project hard rule 1 forbids — and the client must not be the layer that quietly
 * renders it as though nothing happened. A refused value is reported, never shown.
 *
 * NO THOUSANDS SEPARATORS, and this is a deliberate reading of "no reformatting"
 * rather than an oversight: inserting them means splitting the string, which is
 * one edit away from someone splitting it into numbers. `128400.00` is harder to
 * read than `128,400.00` and that cost is real — it is the owner's call to make,
 * and it can be made later in ONE place (a pure string regroup with a proof that
 * the digits are unchanged). It is not made unilaterally here.
 *
 * ---------------------------------------------------------------------------
 * TIME: shopTime, ALWAYS, AND NEVER A DEVICE CLOCK
 * ---------------------------------------------------------------------------
 * Every instant on this screen goes through @recycle/shop-time, the one client
 * formatter. The response's timestamps already carry the shop's `+07:00` offset
 * (server/app/reports.py deliberately returns shop-offset ISO rather than UTC),
 * and passing them through shopDate/shopTime is still correct AND still
 * required: an offset in the string is a real instant, so the conversion is a
 * no-op in value and the single-formatter rule is what stops the next edit from
 * slicing it.
 *
 * `device_created_at` APPEARS NOWHERE ON THIS SCREEN, and cannot: the endpoint
 * does not return it, so there is no field here to render it from. That is not a
 * limitation being worked around, it is the guarantee. Two phones have been
 * observed stamping bills 125 ms apart in the order OPPOSITE to their arrival
 * (PROJECT_STATUS 2026-07-29), and ~3 s of real skew has been measured on this
 * hardware. doc_no is arrival order and the day is arrival order, and they agree
 * with each other precisely because neither one asks a handset what time it is.
 * lessons/doc-no-is-arrival-order-not-event-time.md.
 *
 * THE CONSEQUENCE OF THAT IS ON THE SCREEN, not only in the API docs, because a
 * report is read by someone who will never open either. See DAY_BOUNDARY below.
 *
 * ---------------------------------------------------------------------------
 * THE SENTENCES ARE THE CLIENT'S, THE FACTS ARE THE SERVER'S
 * ---------------------------------------------------------------------------
 * The response carries `basis.consequence_th` and `completeness.
 * understatement_reason_th` — ready-made Thai for both warnings. They are NOT
 * rendered. Operator-facing prose is written here, where it is asserted, and the
 * client keys on the MACHINE-READABLE field beside it (`basis.aggregated_on`).
 *
 * That is not ceremony, and the difference is visible: if a future server ever
 * aggregated on something else, echoing its prose would print a confident
 * sentence about a total computed some other way, while keying on the field
 * makes the client say it does not recognise the basis (see `basisWarning`). The
 * client refuses to print a claim it cannot back. Same rule as reading the 403
 * off the STATUS and never off the body.
 */
import { forbiddenReason } from "../sync/parkedReason.js";
import { SHOP_UTC_OFFSET_MINUTES, shopDate, shopDateTime, shopTime } from "@recycle/shop-time";

/* ==========================================================================
 * 1. THE WIRE — what the server sends, and what we refuse to read
 * ========================================================================== */

/** Fields of `day`. Every one of them is decided by the SERVER's clock. */
export interface DailyDay {
  date: string;
  date_be: string;
  starts_at: string;
  is_today: boolean;
  requested: boolean;
  server_now: string;
  shop_today: string;
}

export interface DailyTotals {
  active_bill_count: number;
  active_total: string;
  voided_bill_count: number;
  voided_total: string;
  off_list_bill_count: number;
  off_list_line_count: number;
  off_list_variance: string;
  first_doc_no: string | null;
  last_doc_no: string | null;
}

export interface DailyVoid {
  doc_no: string | null;
  total_amount: string;
  seller_name: string | null;
  reason: string | null;
  voided_by_username: string | null;
  voided_by_name: string | null;
  voided_at: string | null;
  /** When the BILL arrived — a real instant, and what its own day is rendered from. */
  received_at: string | null;
  from_earlier_day: boolean;
}

export interface DailyBillLine {
  doc_no: string | null;
  received_at: string | null;
  seller_name: string | null;
  item_count: number;
  total_amount: string;
  off_list: boolean;
}

export interface DailyReportBody {
  day: DailyDay;
  /** Which column the day was aggregated on. Machine-readable, and checked. */
  aggregated_on: string;
  totals: DailyTotals;
  /** Bills RECEIVED this day that are now void. */
  voided: DailyVoid[];
  voided_truncated: boolean;
  /** Voids PERFORMED this day, whatever day the bill belongs to. */
  voids_applied: DailyVoid[];
  bills_total: number;
  bills_returned: number;
  bills_truncated: boolean;
  lines: DailyBillLine[];
  /** Rows dropped because a money field was not an exact decimal string. */
  unreadable_rows: number;
  as_of: string;
}

/**
 * What a fetch of the report produced. TRANSPORT ONLY — no meaning is attached
 * here, so the whole status-to-sentence mapping below is provable headless
 * without a server. app/api.ts builds one of these and nothing else.
 */
export type DailyFetch =
  /** 2xx. The body is `unknown` on purpose: it is validated here, not there. */
  | { kind: "ok"; body: unknown }
  /** The server ANSWERED and refused. `code` is the body's code, never its prose. */
  | { kind: "http"; status: number; code: string | null }
  /** No answer at all: timeout, DNS, no route, aeroplane mode. */
  | { kind: "unreachable" }
  /** There is no session token on this device, so nothing was asked. */
  | { kind: "no_token" };

/* ---------------------------------------------------- reading the body ---- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const readStr = (v: unknown): string | null => (typeof v === "string" ? v : null);

const readOptStr = (v: unknown): string | null | undefined =>
  v === null || v === undefined ? null : typeof v === "string" ? v : undefined;

const readInt = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) ? v : null;

const readBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

/**
 * A money field. STRING OR NOTHING.
 *
 * A JSON number here means a float travelled on the wire, and the value on the
 * screen would then be whatever the double happened to round to — silently,
 * plausibly, and on the one screen being balanced against cash. The client is not
 * the place to absorb that. Refusing costs a visible "could not read", which is
 * the correct outcome for a number nobody can vouch for.
 */
const readMoney = (v: unknown): string | null => (typeof v === "string" ? v : null);

function readDay(v: unknown): DailyDay | null {
  if (!isObj(v)) return null;
  const date = readStr(v["date"]);
  const date_be = readStr(v["date_be"]);
  const starts_at = readStr(v["starts_at"]);
  const is_today = readBool(v["is_today"]);
  const requested = readBool(v["requested"]);
  const server_now = readStr(v["server_now"]);
  const shop_today = readStr(v["shop_today"]);
  if (
    date === null || date_be === null || starts_at === null || is_today === null ||
    requested === null || server_now === null || shop_today === null
  ) {
    return null;
  }
  return { date, date_be, starts_at, is_today, requested, server_now, shop_today };
}

function readTotals(v: unknown): DailyTotals | null {
  if (!isObj(v)) return null;
  const active_bill_count = readInt(v["active_bill_count"]);
  const active_total = readMoney(v["active_total"]);
  const voided_bill_count = readInt(v["voided_bill_count"]);
  const voided_total = readMoney(v["voided_total"]);
  const off_list_bill_count = readInt(v["off_list_bill_count"]);
  const off_list_line_count = readInt(v["off_list_line_count"]);
  const off_list_variance = readMoney(v["off_list_variance"]);
  const first_doc_no = readOptStr(v["first_doc_no"]);
  const last_doc_no = readOptStr(v["last_doc_no"]);
  if (
    active_bill_count === null || active_total === null || voided_bill_count === null ||
    voided_total === null || off_list_bill_count === null || off_list_line_count === null ||
    off_list_variance === null || first_doc_no === undefined || last_doc_no === undefined
  ) {
    return null;
  }
  return {
    active_bill_count, active_total, voided_bill_count, voided_total,
    off_list_bill_count, off_list_line_count, off_list_variance,
    first_doc_no, last_doc_no,
  };
}

function readVoid(v: unknown): DailyVoid | null {
  if (!isObj(v)) return null;
  const total_amount = readMoney(v["total_amount"]);
  const from_earlier_day = readBool(v["from_earlier_day"]);
  const doc_no = readOptStr(v["doc_no"]);
  const seller_name = readOptStr(v["seller_name"]);
  const reason = readOptStr(v["reason"]);
  const voided_by_username = readOptStr(v["voided_by_username"]);
  const voided_by_name = readOptStr(v["voided_by_name"]);
  const voided_at = readOptStr(v["voided_at"]);
  const received_at = readOptStr(v["received_at"]);
  if (
    total_amount === null || from_earlier_day === null ||
    doc_no === undefined || seller_name === undefined || reason === undefined ||
    voided_by_username === undefined || voided_by_name === undefined ||
    voided_at === undefined || received_at === undefined
  ) {
    return null;
  }
  return {
    doc_no, total_amount, seller_name, reason, voided_by_username,
    voided_by_name, voided_at, received_at, from_earlier_day,
  };
}

function readLine(v: unknown): DailyBillLine | null {
  if (!isObj(v)) return null;
  const total_amount = readMoney(v["total_amount"]);
  const item_count = readInt(v["item_count"]);
  const off_list = readBool(v["off_list"]);
  const doc_no = readOptStr(v["doc_no"]);
  const received_at = readOptStr(v["received_at"]);
  const seller_name = readOptStr(v["seller_name"]);
  if (
    total_amount === null || item_count === null || off_list === null ||
    doc_no === undefined || received_at === undefined || seller_name === undefined
  ) {
    return null;
  }
  return { doc_no, received_at, seller_name, item_count, total_amount, off_list };
}

/**
 * The response, or null if it cannot be read.
 *
 * WHAT IS FATAL AND WHAT IS NOT, and the split is the report lesson applied one
 * layer up (lessons/a-report-is-many-reads-that-must-agree.md). The day label and
 * the four DAY-WIDE money figures are fatal: without them there is no screen, and
 * a screen missing its headline is not a degraded screen, it is a wrong one.
 *
 * A single bad ROW is not fatal. Every total on this screen is a SQL aggregate
 * over the whole day, computed independently of the list — so dropping an
 * unreadable row leaves the totals exactly correct, and the alternative (refusing
 * the whole day over one row) hides the number the owner came for. The count of
 * dropped rows is carried out and SAID, because a list that silently disagrees
 * with the total above it is the one thing this screen may never be.
 */
export function readDailyBody(raw: unknown): DailyReportBody | null {
  if (!isObj(raw)) return null;
  const day = readDay(raw["day"]);
  const totals = readTotals(raw["totals"]);
  const completeness = raw["completeness"];
  const basisBlock = raw["basis"];
  const billsBlock = raw["bills"];
  const as_of = isObj(completeness) ? readStr(completeness["as_of"]) : null;
  const basis = isObj(basisBlock) ? readStr(basisBlock["aggregated_on"]) : null;
  if (day === null || totals === null || as_of === null || basis === null || !isObj(billsBlock)) {
    return null;
  }
  const bills_total = readInt(billsBlock["total"]);
  const rawLines = billsBlock["lines"];
  const rawVoided = raw["voided"];
  const rawApplied = raw["voids_applied"];
  if (bills_total === null || !Array.isArray(rawLines) || !Array.isArray(rawVoided) ||
      !Array.isArray(rawApplied)) {
    return null;
  }

  let unreadable = 0;
  const keep = <T>(rows: unknown[], read: (v: unknown) => T | null): T[] => {
    const out: T[] = [];
    for (const r of rows) {
      const parsed = read(r);
      if (parsed === null) unreadable += 1;
      else out.push(parsed);
    }
    return out;
  };

  const lines = keep(rawLines, readLine);
  const voided = keep(rawVoided, readVoid);
  const voids_applied = keep(rawApplied, readVoid);

  return {
    day,
    aggregated_on: basis,
    totals,
    voided,
    voided_truncated: readBool(raw["voided_truncated"]) ?? false,
    voids_applied,
    bills_total,
    bills_returned: lines.length,
    bills_truncated: readBool(billsBlock["truncated"]) ?? false,
    lines,
    unreadable_rows: unreadable,
    as_of,
  };
}

/* ==========================================================================
 * 2. THE SCREEN — one shape per outcome
 * ========================================================================== */

export type DailyMessageTone = "forbidden" | "session" | "offline" | "server" | "invalid";

/** The KIND selects the handler; the LABEL travels with it, exactly like
 *  StatusAction — so the view cannot wire "ลองอีกครั้ง" to the sign-in. */
export type DailyAction =
  | { kind: "sign_in"; label: string }
  | { kind: "retry"; label: string }
  | { kind: "go_today"; label: string }
  | null;

export interface DailyMessageScreen {
  kind: "message";
  tone: DailyMessageTone;
  badge: string;
  lines: string[];
  action: DailyAction;
}

export interface MoneyHeadline {
  caption: string;
  /** VERBATIM from the server. Never parsed, never reformatted. */
  amount: string;
  unit: string;
  countLine: string;
}

export interface VoidRow {
  docNo: string;
  /** VERBATIM. */
  amount: string;
  reason: string;
  who: string;
  when: string;
  seller: string;
  /** Non-null when the bill belongs to an EARLIER day than the one on screen. */
  fromDayNote: string | null;
}

export interface BillRow {
  docNo: string;
  seller: string;
  itemLine: string;
  /** VERBATIM. */
  amount: string;
  time: string;
  offList: boolean;
  offListNote: string | null;
}

export interface VoidSection {
  heading: string;
  intro: string;
  rows: VoidRow[];
  /** Shown instead of rows when there are none. Never null — silence reads as
   *  "not checked", and this is the one list whose emptiness is a finding. */
  emptyLine: string | null;
  totalLine: string | null;
  truncatedNote: string | null;
}

export interface OffListSection {
  heading: string;
  summary: string;
  varianceLine: string | null;
  /** Why this is not an accusation. Always present when there is anything here. */
  explain: string;
  docNos: string[];
  /** Set when the day has more off-list bills than this page can name. */
  incompleteNote: string | null;
  emptyLine: string | null;
}

export interface BillsSection {
  heading: string;
  rows: BillRow[];
  emptyLine: string | null;
  moreNote: string | null;
  unreadableNote: string | null;
}

export interface DailyReportScreen {
  kind: "report";
  /** DD/MM/BBBB, through shopDate. */
  dayLabel: string;
  dayHeading: string;
  isToday: boolean;
  /** Non-null when the screen is showing a day that is not today. */
  pastDayNote: string | null;
  headline: MoneyHeadline;
  /** ALWAYS non-empty. The first thing under the number, never a footnote. */
  understatement: string[];
  /** The 23:50 / 00:05 consequence. ALWAYS present. */
  dayBoundary: string;
  /** Non-null when the server aggregated on something this build cannot vouch for. */
  basisWarning: string | null;
  voided: VoidSection;
  earlierVoids: VoidSection;
  offList: OffListSection;
  bills: BillsSection;
  docNoLine: string | null;
  asOf: string;
  /** The wire date for the previous shop day, or null if it cannot be derived. */
  stepBackTo: string | null;
  /** The wire date for the next shop day, or null when already on shop today. */
  stepForwardTo: string | null;
}

export type DailyScreen = DailyReportScreen | DailyMessageScreen;

/* ==========================================================================
 * 3. THE SENTENCES
 * ========================================================================== */

const ASK_THE_OWNER = "ต้องแจ้งเจ้าของร้าน";

/**
 * THE UNDERSTATEMENT. Two lines, always, directly beneath the number.
 *
 * The server ships `completeness.understatement_possible` as a CONSTANT `true`,
 * and it is constant by construction rather than by laziness: there is no device
 * registry, no heartbeat and no device column on purchase_bills, so the server has
 * no evidence with which to ever say otherwise. This client renders the warning
 * UNCONDITIONALLY and does not read that flag, for the matching reason — a client
 * that hid the line the day a server started claiming completeness would be
 * trusting a guarantee it has no way to check. If device check-in is ever built,
 * suppressing this line is a decision to be taken deliberately, here, with a
 * proof — not inherited from a boolean flipping.
 *
 * TONE. Calm, and in this order. The first line says what the number counts, in
 * money terms. The second says WHY, so it reads as the design working rather than
 * as something going wrong — this is the normal state at 17:00 on every trading
 * day, and a warning that looks like an error at closing time on every closing
 * time is a warning nobody reads by the end of the week.
 *
 * It never says ผิดพลาด, never says "ตรวจสอบ", and never suggests an action,
 * because there is none: nobody at the office can make a phone in a truck report
 * in sooner.
 */
const UNDERSTATEMENT: readonly string[] = [
  "ยอดนี้นับเฉพาะบิลที่ส่งถึงระบบแล้ว — บิลที่ยังค้างอยู่ในเครื่องที่หน้าลานยังไม่ถูกนับ ยอดจริงจึงอาจมากกว่าที่เห็น",
  "เป็นเรื่องปกติ เครื่องหน้าลานบันทึกบิลลงเครื่องก่อนแล้วจึงส่งเข้าระบบเมื่อเชื่อมต่อได้ ระบบจึงไม่มีทางรู้ว่าตอนนี้มีบิลค้างอยู่ในเครื่องกี่ใบ",
];

/**
 * THE DAY BOUNDARY, in the owner's own words and on the owner's own screen.
 *
 * server/app/reports.py states this consequence in the response because "a report
 * is read by someone who never opens this file". The same argument applies one
 * step further out: it is read by someone who never opens the response either. So
 * it is on the screen, permanently, next to the number it qualifies.
 *
 * Concrete times, not "the boundary is server-side". An owner who finds one bill
 * missing at 00:10 needs to recognise the case, and 23:50 / 00:05 is the case.
 */
const DAY_BOUNDARY =
  "บิลนับตามเวลาที่ส่งถึงระบบ ไม่ใช่เวลาที่ชั่ง — บิลที่ชั่งเวลา 23:50 แต่ส่งถึงระบบเวลา 00:05 จะไปอยู่ในยอดของวันถัดไป";

/**
 * Off-list is INFORMATION, not an allegation. Paying off the price list is
 * legitimate every day — a negotiated load, a price that moved this morning, a
 * regular customer. What was missing until now was any way to SEE it.
 *
 * The wording matters because this is a number one person reads about another
 * person's decisions. It says what happened and nothing about why.
 */
const OFF_LIST_EXPLAIN =
  "จ่ายไม่ตรงราคาตามรายการเป็นเรื่องที่เกิดได้ตามปกติ เช่น ตกลงราคากันหน้าลาน หรือราคาเพิ่งเปลี่ยน — ตรงนี้เป็นเพียงรายการให้เห็น ไม่ได้แปลว่ามีอะไรผิด";

const NO_MONEY_SHOWN =
  "ยังไม่ได้ตัวเลขจากระบบ จึงยังไม่แสดงยอด — ไม่ได้แปลว่าวันนี้ไม่มีการซื้อขาย บิลที่บันทึกไว้ยังอยู่ครบทุกใบ";

/* ==========================================================================
 * 4. DAY STEPPING — a machine date for the query string, never for display
 * ========================================================================== */

const DAY_MS = 24 * 60 * 60 * 1000;
const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * The shop calendar date `shiftDays` away from a day-start instant, as
 * `YYYY-MM-DD` for the `?date=` parameter.
 *
 * THIS IS A WIRE VALUE AND MUST NEVER BE DISPLAYED. It is Gregorian and
 * ISO-shaped, which is exactly the form shopTime.ts refuses to produce for a
 * human — `2569-08-01` invites being read or parsed as a Gregorian date, and
 * `2026-08-01` shown to a Thai owner is the wrong era. Everything on screen goes
 * through shopDate; this exists solely because the SERVER's parameter is
 * Gregorian ISO, which is a machine contract and not a rendering.
 *
 * It lives here rather than in shopTime.ts on purpose: that module's contract is
 * "nothing it produces may be stored, sent, parsed, compared or sorted", and
 * adding a wire formatter to it would be the first exception to a rule whose
 * whole value is having none. It uses shopTime's OFFSET CONSTANT, so there is
 * still exactly one timezone authority on the client.
 *
 * ±24h is exact arithmetic here because Asia/Bangkok is a fixed offset with no
 * daylight saving. A zone that observes DST cannot use this, and the day that
 * becomes per-tenant this function must be revisited with the rest of shopTime.
 */
function shopWireDate(instantIso: string, shiftDays: number): string | null {
  const t = new Date(instantIso).getTime();
  if (Number.isNaN(t)) return null;
  const wall = new Date(t + shiftDays * DAY_MS + SHOP_UTC_OFFSET_MINUTES * 60_000);
  return `${String(wall.getUTCFullYear())}-${pad2(wall.getUTCMonth() + 1)}-${pad2(wall.getUTCDate())}`;
}

/**
 * The day before the one on screen. Always available: an earlier day always
 * exists, and a day with no trade is a legitimate answer rather than an error.
 */
export const previousShopDay = (day: DailyDay): string | null =>
  shopWireDate(day.starts_at, -1);

/**
 * The day after, or null when the screen is already on the shop's today.
 *
 * BOUNDED BY THE SERVER'S OWN `shop_today`, compared as ISO strings — which is
 * sound precisely because both values come from the server and ISO dates sort
 * lexically. Nothing here asks this handset what day it is. A phone running fast
 * would otherwise walk the owner into tomorrow, and the server answers that with
 * 422 `day_in_the_future` (deliberately, because a believable "the shop took
 * nothing today" is the one wrong-clock answer that reads as a fact).
 */
export const nextShopDay = (day: DailyDay): string | null =>
  day.date >= day.shop_today ? null : shopWireDate(day.starts_at, 1);

/* ==========================================================================
 * 5. THE SCREEN ITSELF
 * ========================================================================== */

const money = (s: string): string => s; // identity, and named so it cannot become one

const namedOrUnknown = (
  primary: string | null,
  secondary: string | null,
  fallback: string,
): string => {
  const first = primary !== null && primary.trim().length > 0 ? primary.trim() : null;
  if (first !== null) return first;
  const second = secondary !== null && secondary.trim().length > 0 ? secondary.trim() : null;
  return second ?? fallback;
};

const NO_DOC_NO = "ยังไม่มีเลขที่บิล";
const NO_SELLER = "ไม่ทราบผู้ขาย";

function voidRow(v: DailyVoid): VoidRow {
  return {
    docNo: v.doc_no ?? NO_DOC_NO,
    amount: money(v.total_amount),
    // Free text the owner typed at the time. The only record of WHY real money
    // was reversed, so it is shown as written and never summarised away.
    reason: namedOrUnknown(v.reason, null, "ไม่ได้ระบุเหตุผล"),
    // The person, never the id. A UUID on this screen would be a developer
    // diagnostic in front of an owner, which is the 2c-6 mistake in a new place.
    who: namedOrUnknown(v.voided_by_name, v.voided_by_username, "ไม่ทราบผู้ทำรายการ"),
    when: v.voided_at === null ? "—" : shopDateTime(v.voided_at),
    seller: namedOrUnknown(v.seller_name, null, NO_SELLER),
    /*
     * The bill's OWN day, rendered from its arrival INSTANT rather than from the
     * server's `bill_date` string. Both name the same day, and the instant is the
     * one that goes through shopDate as a real instant instead of relying on how
     * a bare `YYYY-MM-DD` happens to parse — which is correct for a positive
     * offset and silently a day early for a negative one, i.e. correct until the
     * day this stops being Asia/Bangkok.
     */
    fromDayNote:
      v.from_earlier_day && v.received_at !== null
        ? `บิลของวันที่ ${shopDate(v.received_at)}`
        : v.from_earlier_day
          ? "บิลของวันก่อนหน้า"
          : null,
  };
}

function billRow(l: DailyBillLine): BillRow {
  return {
    docNo: l.doc_no ?? NO_DOC_NO,
    seller: namedOrUnknown(l.seller_name, null, NO_SELLER),
    itemLine: `${String(l.item_count)} รายการ`,
    amount: money(l.total_amount),
    time: l.received_at === null ? "—" : shopTime(l.received_at),
    offList: l.off_list,
    offListNote: l.off_list ? "จ่ายไม่ตรงราคาตามรายการ" : null,
  };
}

/**
 * The whole screen, from one fetch result. THE only entry point the view uses.
 */
export function dailyScreen(fetch: DailyFetch): DailyScreen {
  if (fetch.kind === "no_token") {
    return {
      kind: "message",
      tone: "session",
      badge: "ยังไม่ได้เข้าสู่ระบบ",
      lines: ["ต้องเข้าสู่ระบบก่อนจึงจะดูยอดประจำวันได้", NO_MONEY_SHOWN],
      action: { kind: "sign_in", label: "เข้าสู่ระบบ" },
    };
  }

  if (fetch.kind === "unreachable") {
    /*
     * OFFLINE. This screen is the ONE screen in the app that genuinely needs the
     * server: the day's total is a sum over every device's bills and this handset
     * holds only its own. Saying so plainly is the whole job.
     *
     * WHAT IT MUST NEVER DO is show a number. Not 0.00, not "—" in the money
     * slot, not a cached total from earlier. An owner at the cash box reading a
     * zero would conclude the day took nothing, and there is no wording anywhere
     * that reliably undoes a large number already read. So the message screen has
     * no money field at all — the leak is unrepresentable rather than guarded.
     */
    return {
      kind: "message",
      tone: "offline",
      badge: "ยังติดต่อระบบไม่ได้",
      lines: [
        "หน้ายอดประจำวันต้องอ่านตัวเลขจากระบบ เพราะต้องรวมบิลจากทุกเครื่องในร้าน ไม่ใช่เฉพาะเครื่องนี้",
        NO_MONEY_SHOWN,
      ],
      action: { kind: "retry", label: "ลองอีกครั้ง" },
    };
  }

  if (fetch.kind === "http") {
    return httpMessage(fetch.status, fetch.code);
  }

  const body = readDailyBody(fetch.body);
  if (body === null) {
    /*
     * The server answered 200 with something this build cannot read — an older or
     * newer API, or a money field that arrived as a JSON number (see readMoney).
     * Calm, and no number, for the same reason as the offline branch.
     */
    return {
      kind: "message",
      tone: "server",
      badge: "อ่านข้อมูลจากระบบไม่ได้",
      lines: [
        "ระบบตอบกลับมาในรูปแบบที่แอปรุ่นนี้อ่านไม่ได้ จึงยังแสดงยอดไม่ได้",
        NO_MONEY_SHOWN,
        ASK_THE_OWNER,
      ],
      action: { kind: "retry", label: "ลองอีกครั้ง" },
    };
  }

  return reportScreen(body);
}

/**
 * A refusal the server ANSWERED. Classified on the STATUS, never on the body:
 * that axis survives a body that failed to parse, and it is the same rule
 * httpTransport follows for the sync path.
 */
function httpMessage(status: number, code: string | null): DailyMessageScreen {
  if (status === 401) {
    /*
     * The caller is no longer anyone. A sign-in fixes it and nothing else does,
     * so this is the ONE branch on this screen that offers one — the mirror of
     * the rule that a 403 must never offer one.
     * lessons/401-is-about-the-caller-not-the-bill.md.
     */
    return {
      kind: "message",
      tone: "session",
      badge: "ต้องเข้าสู่ระบบใหม่",
      lines: ["หมดเวลาเข้าใช้งาน ต้องเข้าสู่ระบบใหม่ก่อนจึงจะดูยอดประจำวันได้", NO_MONEY_SHOWN],
      action: { kind: "sign_in", label: "เข้าสู่ระบบ" },
    };
  }

  if (status === 403) {
    /*
     * ADMIN ONLY, and the wording comes from the SAME table the refused-void card
     * uses, keyed on this action — so the three rules are enforced in one place:
     * never "error", never a sign-in (the same account returns with the same
     * role), and always the shop owner rather than support or the office, neither
     * of whom can grant a role. lessons/403-is-about-what-the-caller-may-do.md.
     *
     * NO ACTION BUTTON. The only move is a conversation, and an action the app
     * cannot perform must never be dressed as one it can.
     */
    const r = forbiddenReason(code, "daily_report");
    const lines = [r.what];
    // An unrecognised code is named ALONE, never the body it arrived in.
    if (r.unknown && code !== null) lines.push(`รหัส: ${code}`);
    return { kind: "message", tone: "forbidden", badge: r.badge, lines, action: null };
  }

  if (status === 422) {
    /*
     * The only 422 a client can currently produce here is `day_in_the_future`,
     * and it exists because a fast phone asking for tomorrow would otherwise be
     * told the shop took nothing. Day stepping is already bounded by the server's
     * own shop_today, so reaching this means the clocks disagree — say what to do
     * (go back to today) rather than what went wrong.
     */
    if (code === "day_in_the_future") {
      return {
        kind: "message",
        tone: "invalid",
        badge: "ยังไม่ถึงวันที่เลือก",
        lines: ["ยังไม่ถึงวันที่เลือก จึงยังไม่มียอดของวันนั้น"],
        action: { kind: "go_today", label: "ดูยอดวันนี้" },
      };
    }
    return {
      kind: "message",
      tone: "invalid",
      badge: "ขอข้อมูลวันนี้ไม่ได้",
      lines: ["ระบบไม่รับคำขอนี้ จึงยังแสดงยอดไม่ได้", NO_MONEY_SHOWN],
      action: { kind: "go_today", label: "ดูยอดวันนี้" },
    };
  }

  if (status === 404) {
    /*
     * The endpoint is not there. A shop pointed at an older server would otherwise
     * retry a "server error" forever, so this names the real cause instead.
     */
    return {
      kind: "message",
      tone: "server",
      badge: "ระบบยังไม่มีหน้ายอดประจำวัน",
      lines: [`เซิร์ฟเวอร์ที่เครื่องนี้ต่ออยู่ยังไม่มีหน้ายอดประจำวัน — ${ASK_THE_OWNER}`, NO_MONEY_SHOWN],
      action: null,
    };
  }

  return {
    kind: "message",
    tone: "server",
    badge: "ระบบยังตอบไม่ได้",
    lines: ["ระบบยังคำนวณยอดของวันนี้ให้ไม่ได้ในตอนนี้", NO_MONEY_SHOWN],
    action: { kind: "retry", label: "ลองอีกครั้ง" },
  };
}

function reportScreen(b: DailyReportBody): DailyReportScreen {
  /*
   * THE DAY LABEL, derived on the client through shopDate from the day's own
   * START INSTANT — not from `day.date` (a bare calendar string, which would have
   * to be parsed) and not from `day.date_be` (the server's ready-made label).
   *
   * Both would print the same characters today. The reason to compute it is that
   * `date_be` and the พ.ศ. year inside every doc_no on this screen come from the
   * server's one authority (bills._be_year) while this comes from the client's
   * (shopTime.beYear), and rendering the server's label would mean the screen
   * could never disagree — which sounds like a feature and is actually the loss
   * of the only place the two authorities are ever compared.
   * lessons/be-year-comes-after-the-timezone.md exists because those two
   * derivations drift at exactly the boundary neither author tested.
   */
  const dayLabel = shopDate(b.day.starts_at);
  const isToday = b.day.is_today;

  const activeCount = b.totals.active_bill_count;
  const headline: MoneyHeadline = {
    caption: isToday ? "ยอดซื้อวันนี้" : `ยอดซื้อวันที่ ${dayLabel}`,
    amount: money(b.totals.active_total),
    unit: "บาท",
    countLine:
      activeCount === 0
        ? "ยังไม่มีบิลที่ส่งถึงระบบในวันนี้"
        : `จากบิล ${String(activeCount)} ใบ`,
  };

  /*
   * A DAY THAT IS NOT TODAY has to say so where the number is, not in a corner.
   * The failure it prevents is small and total: an owner who stepped back a day,
   * got distracted, and balanced the drawer against Tuesday.
   */
  const pastDayNote = isToday
    ? null
    : `กำลังดูยอดของวันที่ ${dayLabel} ไม่ใช่ยอดของวันนี้`;

  /*
   * The client keys on the machine-readable basis and refuses to print the
   * boundary sentence as fact if the server ever answers something else. See the
   * module header: this is the reason `consequence_th` is not echoed.
   */
  const basisWarning =
    b.aggregated_on === "server_received_at"
      ? null
      : `ระบบรวมยอดวันนี้ด้วยวิธีที่แอปรุ่นนี้ไม่รู้จัก ยอดอาจไม่ตรงกับที่เคยเห็น — ${ASK_THE_OWNER}`;

  /* ---- voids: the only place a reversal of real money becomes visible ---- */

  const voidedRows = b.voided.map(voidRow);
  const voided: VoidSection = {
    heading: "บิลที่ถูกยกเลิก",
    intro: "เงินของบิลเหล่านี้ไม่ได้ถูกนับรวมในยอดด้านบน",
    rows: voidedRows,
    emptyLine: voidedRows.length === 0 ? "วันนี้ไม่มีบิลที่ถูกยกเลิก" : null,
    totalLine:
      b.totals.voided_bill_count === 0
        ? null
        : `รวม ${String(b.totals.voided_bill_count)} ใบ เป็นเงิน ${money(b.totals.voided_total)} บาท`,
    truncatedNote: b.voided_truncated
      ? "รายการยาวเกินกว่าที่ระบบจะส่งมาได้ทั้งหมด — แสดงเท่าที่ส่งมา"
      : null,
  };

  /*
   * VOIDS PERFORMED TODAY AGAINST AN OLDER BILL — its own section, and the reason
   * the endpoint answers two void questions instead of one. A bill from last
   * Tuesday voided today appears in NO day anyone opens: not today's, because it
   * was not received today, and not Tuesday's, because nobody reopens a closed
   * day. That is the unwatched void, and it is the one that costs money
   * (server/app/reports.py, _VOIDS_APPLIED_SQL).
   *
   * Only the from_earlier_day entries are taken. A bill received today and voided
   * today is in BOTH server lists, and listing it twice on one screen would make
   * an owner count one reversal as two.
   */
  const earlierRows = b.voids_applied.filter((v) => v.from_earlier_day).map(voidRow);
  const earlierVoids: VoidSection = {
    heading: "วันนี้มีการยกเลิกบิลของวันก่อนหน้า",
    intro: "บิลเหล่านี้เป็นของวันอื่น แต่ถูกยกเลิกในวันนี้ จึงไม่ปรากฏในยอดของวันไหนเลยถ้าไม่ดูตรงนี้",
    rows: earlierRows,
    // Nothing is shown when the list is empty: an absent section is the normal
    // day, whereas the section above is a fact about today that must be stated
    // either way. Two lists, two different questions, two different silences.
    emptyLine: null,
    totalLine: null,
    truncatedNote: null,
  };

  /* ---- off list: which bills paid off the price list ---- */

  const offListDocNos = b.lines.filter((l) => l.off_list).map((l) => l.doc_no ?? NO_DOC_NO);
  const offCount = b.totals.off_list_bill_count;
  /*
   * THE COUNT IS THE WHOLE DAY; THE NAMES ARE THIS PAGE. The count is a SQL
   * aggregate over every bill of the day, while the doc_nos can only come from
   * the returned page — so on a truncated day they genuinely disagree, and a
   * screen that showed "8 bills" above a list of 5 without saying why is the
   * unreconcilable answer this project refuses to produce on a reconciling
   * screen. lessons/a-report-is-many-reads-that-must-agree.md.
   */
  const namedShort = offCount > offListDocNos.length;
  const offList: OffListSection = {
    heading: "บิลที่จ่ายไม่ตรงราคาตามรายการ",
    summary:
      offCount === 0
        ? ""
        : `${String(offCount)} ใบ (${String(b.totals.off_list_line_count)} รายการ)`,
    varianceLine:
      offCount === 0
        ? null
        : `ต่างจากราคาตามรายการ ${money(b.totals.off_list_variance)} บาท (บวกคือจ่ายสูงกว่าราคาตามรายการ)`,
    explain: OFF_LIST_EXPLAIN,
    docNos: offListDocNos,
    incompleteNote: namedShort
      ? `แสดงเลขที่บิลได้ ${String(offListDocNos.length)} ใบจาก ${String(offCount)} ใบ เพราะรายการบิลด้านล่างยังไม่ครบทั้งวัน`
      : null,
    emptyLine: offCount === 0 ? "ทุกบิลวันนี้จ่ายตรงราคาตามรายการ" : null,
  };

  /* ---- the bill list: enough to find a bill, not the whole detail ---- */

  const bills: BillsSection = {
    heading: "บิลของวันนี้",
    rows: b.lines.map(billRow),
    emptyLine: b.lines.length === 0 ? "ยังไม่มีบิลที่ส่งถึงระบบในวันนี้" : null,
    /*
     * The list is paged and the totals above are not. Saying so is what keeps the
     * two reconcilable: an owner adding up the rows and getting less than the
     * headline must be able to see that the list is short, not conclude the
     * headline is wrong.
     */
    moreNote: b.bills_truncated
      ? `แสดง ${String(b.bills_returned)} ใบจากทั้งหมด ${String(b.bills_total)} ใบ — ยอดด้านบนรวมครบทุกใบแล้ว`
      : null,
    unreadableNote:
      b.unreadable_rows > 0
        ? `มี ${String(b.unreadable_rows)} รายการที่แอปรุ่นนี้อ่านไม่ได้ จึงไม่ได้แสดง — ยอดด้านบนยังรวมครบทุกใบ`
        : null,
  };

  const docNoLine =
    b.totals.first_doc_no !== null && b.totals.last_doc_no !== null
      ? `เลขที่บิล ${b.totals.first_doc_no} ถึง ${b.totals.last_doc_no}`
      : null;

  return {
    kind: "report",
    dayLabel,
    dayHeading: isToday ? `ยอดวันนี้ ${dayLabel}` : `ยอดวันที่ ${dayLabel}`,
    isToday,
    pastDayNote,
    headline,
    understatement: [...UNDERSTATEMENT],
    dayBoundary: DAY_BOUNDARY,
    basisWarning,
    voided,
    earlierVoids,
    offList,
    bills,
    docNoLine,
    // `as_of` is the snapshot instant of the whole response — one repeatable-read
    // transaction, so every number above is true of this one moment together.
    asOf: `ข้อมูล ณ ${shopTime(b.as_of)} น. (เวลาร้าน)`,
    stepBackTo: previousShopDay(b.day),
    stepForwardTo: nextShopDay(b.day),
  };
}
