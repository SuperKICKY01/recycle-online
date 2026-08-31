/**
 * THE PERIOD SUMMARY, AS THE OWNER READS IT — every rendering decision for
 * `GET /reports/summary`, as pure functions.
 *
 * No React Native, no Expo, no node, no fetch — so the headless proof
 * (`npm run prove:dashboard`) exercises exactly the sentences, the sort, the
 * aggregation and the money discipline the phone runs. `app/DashboardScreen.tsx`
 * renders whatever this returns and decides nothing itself. Same reason
 * `dailyView.ts` and `shopSettings.ts` live under `src/`: files under `app/` are
 * outside the proven surface (lessons/correct-classification-can-still-render-as-an-error.md).
 *
 * ---------------------------------------------------------------------------
 * MONEY IS NEVER A NUMBER HERE — AND THE ONE NUMBER THAT IS, IS NOT MONEY
 * ---------------------------------------------------------------------------
 * Every money and weight VALUE on this screen is the STRING the server sent,
 * copied through byte for byte. There is no parse, no `Number()`, no `toFixed` and
 * no formatter on any figure that is DISPLAYED as a server row's value. The ONE
 * exception is the "อื่นๆ" aggregate row, whose fields are DECIMAL sums of the rows
 * it stands in for — an aggregate the server did not send, computed with decimal.js
 * exactly as the server would, and quantised to the column's scale.
 *
 * The bar width is a `number` and is the ONLY number this file produces: it is a
 * LAYOUT fraction (paid_total ÷ the largest paid_total), never rendered as text.
 * The money beside a bar is always the string; the bar is how long it is drawn.
 *
 * `readMoney` REFUSES a JSON number. A money/weight field arriving as `1234.5`
 * instead of `"1234.50"` means a float reached the wire (hard rule 1), and the
 * whole response is refused rather than partially rendered — IDENTICAL to
 * `dailyView.ts:197` (that copy is module-private and its file is out of bounds this
 * unit, so the rule is re-stated here and the proof asserts it, as `proveDaily` D12
 * does for the daily route). `bill_count` is a real count, so it stays an integer.
 *
 * ---------------------------------------------------------------------------
 * THE SORT AND THE SUMS ARE DECIMAL, NEVER Number
 * ---------------------------------------------------------------------------
 * Rows are ordered by `paid_total` DESC using `Decimal.comparedTo`, never
 * `Number(a) - Number(b)` — two totals that a double cannot tell apart
 * ("1000000000000.01" vs "1000000000000.02") order correctly here. The "อื่นๆ" sums
 * are `Decimal.plus` at precision 50, the same config `money.ts` sets, so a run of
 * this module in isolation is not silently on decimal.js's default of 20
 * (lessons/decimal-precision-for-domain-scale.md).
 */
import { Decimal } from "decimal.js";

import { MONEY_DP, WEIGHT_DP } from "../money/money.js";

// The SAME configuration money.ts sets. Set here too so a proof (or any consumer)
// that loads THIS module without money.ts is not on decimal.js's default precision
// of 20, which would round in the middle of a 28-digit NUMERIC(14,3)×(14,2) sum.
// Idempotent — a global on the Decimal class, set once by whichever loads first.
Decimal.set({ rounding: Decimal.ROUND_HALF_UP, precision: 50 });

/** The 403 detail.code that means "staff, and the shop has not opened money to
 *  staff". App reads it off the raw fetch to drop the entry on the next menu draw;
 *  exported so there is no magic string at the call site. */
export const STAFF_MONEY_HIDDEN = "staff_money_hidden";

/** The four dimensions and three states, each with the Thai that says what it
 *  counts — never a bare `by`/`state` on screen. */
export const BY_LABELS: Record<string, string> = {
  product: "ตามสินค้า",
  seller: "ตามผู้ขาย",
  user: "ตามผู้บันทึก",
  day: "ตามวัน",
};
export const STATE_LABELS: Record<string, string> = {
  live: "บิลที่ใช้ได้",
  void: "บิลที่ถูกยกเลิก",
  all: "ทั้งหมด",
};

/** Kept short and deliberate: the "อื่นๆ" row after the top ones, and the ceiling. */
const TOP_ROWS = 10;
const OTHERS_LABEL = "อื่นๆ";

/* ==========================================================================
 * 1. THE WIRE — what the server sends, and what we refuse to read
 * ========================================================================== */

export interface SummaryFigures {
  bill_count: number;
  net_weight: string;
  paid_total: string;
  list_total: string;
  list_minus_paid: string;
}

export interface SummaryWireRow extends SummaryFigures {
  key: string | null;
  label: string | null;
}

export interface SummaryBody {
  from_date: string;
  to_date: string;
  by: string;
  state: string;
  rows: SummaryWireRow[];
  totals: SummaryFigures;
}

export type SummaryFetch =
  | { kind: "ok"; body: unknown }
  | { kind: "http"; status: number; code: string | null }
  | { kind: "unreachable" }
  | { kind: "no_token" };

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const readStr = (v: unknown): string | null => (typeof v === "string" ? v : null);
const readOptStr = (v: unknown): string | null | undefined =>
  v === null || v === undefined ? null : typeof v === "string" ? v : undefined;
const readInt = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) ? v : null;

// IDENTICAL to dailyView.ts:197. STRING OR NOTHING — a JSON number means a float
// travelled on the wire, and refusing costs a visible "could not read", which is
// the correct outcome for a number nobody can vouch for.
const readMoney = (v: unknown): string | null => (typeof v === "string" ? v : null);

function readFigures(v: unknown): SummaryFigures | null {
  if (!isObj(v)) return null;
  const bill_count = readInt(v["bill_count"]);
  const net_weight = readMoney(v["net_weight"]);
  const paid_total = readMoney(v["paid_total"]);
  const list_total = readMoney(v["list_total"]);
  const list_minus_paid = readMoney(v["list_minus_paid"]);
  if (
    bill_count === null || net_weight === null || paid_total === null ||
    list_total === null || list_minus_paid === null
  ) {
    return null;
  }
  return { bill_count, net_weight, paid_total, list_total, list_minus_paid };
}

function readRow(v: unknown): SummaryWireRow | null {
  const figures = readFigures(v);
  if (figures === null || !isObj(v)) return null;
  const key = readOptStr(v["key"]);
  const label = readOptStr(v["label"]);
  if (key === undefined || label === undefined) return null;
  return { ...figures, key, label };
}

/**
 * The response, or null if it cannot be read. Unlike the daily route, ONE bad row
 * refuses the WHOLE body here: the totals are what reconciles the rows, and a screen
 * that dropped a row while keeping the totals would show a breakdown that no longer
 * sums to the number above it (lessons/a-report-is-many-reads-that-must-agree.md).
 * A money field arriving as a JSON number is exactly such a bad row.
 */
export function readSummaryBody(raw: unknown): SummaryBody | null {
  if (!isObj(raw)) return null;
  const from_date = readStr(raw["from_date"]);
  const to_date = readStr(raw["to_date"]);
  const by = readStr(raw["by"]);
  const state = readStr(raw["state"]);
  const totals = readFigures(raw["totals"]);
  const rawRows = raw["rows"];
  if (
    from_date === null || to_date === null || by === null || state === null ||
    totals === null || !Array.isArray(rawRows)
  ) {
    return null;
  }
  const rows: SummaryWireRow[] = [];
  for (const r of rawRows) {
    const row = readRow(r);
    if (row === null) return null; // one unreadable row refuses the whole response
    rows.push(row);
  }
  return { from_date, to_date, by, state, rows, totals };
}

/* ==========================================================================
 * 2. THE SCREEN — one shape per outcome
 * ========================================================================== */

export type SummaryTone = "forbidden" | "session" | "offline" | "server" | "invalid";

export type SummaryAction =
  | { kind: "sign_in"; label: string }
  | { kind: "retry"; label: string }
  | null;

export interface SummaryMessage {
  kind: "message";
  tone: SummaryTone;
  badge: string;
  lines: string[];
  action: SummaryAction;
}

/** One row of the breakdown, ready to draw. Money is the server string (or a
 *  Decimal sum, for the "อื่นๆ" row); `fraction` is layout only. */
export interface SummaryBarRow {
  key: string;
  label: string;
  bill_count: number;
  /** VERBATIM server string, or the Decimal sum for the "อื่นๆ" row. Never a number. */
  net_weight: string;
  paid_total: string;
  list_total: string;
  /** list_total − paid_total; the sign is the server's (or the sum's). Neutral. */
  list_minus_paid: string;
  /** paid_total ÷ largest paid_total, 0..1. A LAYOUT number — never rendered as text. */
  fraction: number;
  isOthers: boolean;
}

export interface SummaryChip<T extends string> {
  value: T;
  label: string;
  selected: boolean;
}

export interface SummaryReport {
  kind: "summary";
  from_date: string;
  to_date: string;
  by: string;
  state: string;
  /** Top rows plus at most one "อื่นๆ". Empty when the period had no bills. */
  rows: SummaryBarRow[];
  /** The server totals, VERBATIM. The rows reconcile to this. */
  totals: SummaryFigures;
  /** The neutral labels for the four figures, so no bare field name shows. */
  figureLabels: { paid: string; list: string; diff: string; weight: string; count: string };
  /** Why list_minus_paid can be negative, stated once — the money keeps its sign. */
  diffExplain: string;
  byChips: readonly SummaryChip<string>[];
  stateChips: readonly SummaryChip<string>[];
  /** Non-null when there were no bills at all. The totals are still shown (0.00). */
  emptyLine: string | null;
}

export type SummaryScreen = SummaryReport | SummaryMessage;

/* ==========================================================================
 * 3. THE SENTENCES
 * ========================================================================== */

const ASK_THE_OWNER = "ต้องแจ้งเจ้าของร้าน";
const NO_BILLS_LINE = "ไม่มีบิลในช่วงนี้";
const DIFF_EXPLAIN =
  "ส่วนต่าง = ยอดตามราคาประกาศ ลบ ยอดที่จ่ายจริง — ค่าติดลบคือจ่ายสูงกว่าราคาประกาศ ไม่ได้แปลว่ามีอะไรผิด";

function forbiddenMessage(code: string | null): SummaryMessage {
  if (code === STAFF_MONEY_HIDDEN) {
    // NAMED the shop OWNER as the decider, never a sign-in (the same account
    // returns with the same role) and never support (who cannot grant it). No
    // action button: the only move is a conversation. Same three rules as
    // dailyView's 403 (lessons/403-is-about-what-the-caller-may-do.md).
    return {
      kind: "message",
      tone: "forbidden",
      badge: "ยังไม่เปิดให้พนักงานดูยอด",
      lines: [`บัญชีพนักงานยังดูยอดของร้านไม่ได้ — การเปิดให้เห็นเป็นสิทธิ์ของเจ้าของร้าน`],
      action: null,
    };
  }
  return {
    kind: "message",
    tone: "forbidden",
    badge: "ไม่มีสิทธิ์ดูข้อมูลนี้",
    lines: [`บัญชีนี้ดูข้อมูลนี้ไม่ได้ — ${ASK_THE_OWNER}`],
    action: null,
  };
}

function summaryMessage(fetch: Exclude<SummaryFetch, { kind: "ok" }>): SummaryMessage {
  if (fetch.kind === "no_token") {
    return {
      kind: "message",
      tone: "session",
      badge: "ยังไม่ได้เข้าสู่ระบบ",
      lines: ["ต้องเข้าสู่ระบบก่อนจึงจะดูยอดได้"],
      action: { kind: "sign_in", label: "เข้าสู่ระบบ" },
    };
  }
  if (fetch.kind === "unreachable") {
    // OFFLINE. This screen sums bills across every device in the shop, so it
    // genuinely needs the server; it must NEVER show a number offline (an owner
    // reading 0 would conclude the period took nothing). The message has no money
    // field at all — the leak is unrepresentable, as on the daily screen.
    return {
      kind: "message",
      tone: "offline",
      badge: "ยังติดต่อระบบไม่ได้",
      lines: [
        "หน้ายอดต้องอ่านตัวเลขจากระบบ เพราะต้องรวมบิลจากทุกเครื่องในร้าน ไม่ใช่เฉพาะเครื่องนี้",
      ],
      action: { kind: "retry", label: "ลองอีกครั้ง" },
    };
  }
  if (fetch.status === 401) {
    return {
      kind: "message",
      tone: "session",
      badge: "ต้องเข้าสู่ระบบใหม่",
      lines: ["หมดเวลาเข้าใช้งาน ต้องเข้าสู่ระบบใหม่ก่อนจึงจะดูยอดได้"],
      action: { kind: "sign_in", label: "เข้าสู่ระบบ" },
    };
  }
  if (fetch.status === 403) return forbiddenMessage(fetch.code);
  if (fetch.status === 422) {
    // The device bounds the custom range (period.ts), so an ordinary user never
    // reaches this; it is the fallback for a future server bound.
    return {
      kind: "message",
      tone: "invalid",
      badge: "ช่วงวันที่ไม่ถูกต้อง",
      lines: ["ระบบไม่รับช่วงวันที่นี้ ลองเลือกช่วงที่แคบลงแล้วดูใหม่"],
      action: { kind: "retry", label: "ลองอีกครั้ง" },
    };
  }
  if (fetch.status === 404) {
    return {
      kind: "message",
      tone: "server",
      badge: "ระบบยังไม่มีหน้ายอดสรุป",
      lines: [`เซิร์ฟเวอร์ที่เครื่องนี้ต่ออยู่ยังไม่มีหน้ายอดสรุป — ${ASK_THE_OWNER}`],
      action: null,
    };
  }
  return {
    kind: "message",
    tone: "server",
    badge: "ระบบยังตอบไม่ได้",
    lines: ["ระบบยังคำนวณยอดในช่วงนี้ให้ไม่ได้ในตอนนี้"],
    action: { kind: "retry", label: "ลองอีกครั้ง" },
  };
}

/* ==========================================================================
 * 4. THE AGGREGATION — Decimal, never Number
 * ========================================================================== */

const D = (s: string): Decimal => new Decimal(s);

/** Sum a run of money strings to a 2dp string; Decimal throughout. */
function sumMoney(values: readonly string[]): string {
  return values.reduce((acc, v) => acc.plus(D(v)), new Decimal(0)).toFixed(MONEY_DP);
}
/** Sum a run of weight strings to a 3dp string; Decimal throughout. */
function sumWeight(values: readonly string[]): string {
  return values.reduce((acc, v) => acc.plus(D(v)), new Decimal(0)).toFixed(WEIGHT_DP);
}

/**
 * Rows, DESCENDING by paid_total. `Decimal.comparedTo`, never Number — a pair a
 * double rounds together must still order. Ties broken by key ascending so the
 * order is deterministic (two products with the same takings do not swap between
 * renders). Returns a new array; the input is untouched.
 */
export function sortByPaidDesc(rows: readonly SummaryWireRow[]): SummaryWireRow[] {
  return [...rows].sort((a, b) => {
    const byPaid = D(b.paid_total).comparedTo(D(a.paid_total));
    if (byPaid !== 0) return byPaid;
    return (a.key ?? "").localeCompare(b.key ?? "");
  });
}

/** The "อื่นๆ" row: the Decimal sums of the rows it replaces. bill_count is an
 *  integer sum (a real count). This is the only aggregate this file computes. */
function othersRow(rest: readonly SummaryWireRow[]): SummaryWireRow {
  return {
    key: "__others__",
    label: OTHERS_LABEL,
    bill_count: rest.reduce((n, r) => n + r.bill_count, 0),
    net_weight: sumWeight(rest.map((r) => r.net_weight)),
    paid_total: sumMoney(rest.map((r) => r.paid_total)),
    list_total: sumMoney(rest.map((r) => r.list_total)),
    list_minus_paid: sumMoney(rest.map((r) => r.list_minus_paid)),
  };
}

/** The largest paid_total among displayed rows, as a Decimal. Zero if all zero. */
function maxPaid(rows: readonly SummaryWireRow[]): Decimal {
  return rows.reduce((m, r) => {
    const p = D(r.paid_total);
    return p.greaterThan(m) ? p : m;
  }, new Decimal(0));
}

function barRow(row: SummaryWireRow, max: Decimal, isOthers: boolean): SummaryBarRow {
  // The fraction is layout only. Money text stays the string on the row.
  const fraction = max.isZero() ? 0 : D(row.paid_total).div(max).toNumber();
  return {
    key: row.key ?? row.label ?? "—",
    label: row.label ?? (row.key ?? "ไม่ทราบ"),
    bill_count: row.bill_count,
    net_weight: row.net_weight,
    paid_total: row.paid_total,
    list_total: row.list_total,
    list_minus_paid: row.list_minus_paid,
    fraction,
    isOthers,
  };
}

function chips<T extends string>(
  labels: Record<string, string>,
  order: readonly T[],
  selected: string,
): readonly SummaryChip<T>[] {
  return order.map((v) => ({ value: v, label: labels[v] ?? v, selected: v === selected }));
}

/**
 * THE SUMMARY SCREEN, from one fetch. THE only entry point the dashboard uses.
 */
export function summaryScreen(fetch: SummaryFetch): SummaryScreen {
  if (fetch.kind !== "ok") return summaryMessage(fetch);

  const body = readSummaryBody(fetch.body);
  if (body === null) {
    // 200 with a body this build cannot read — an older/newer API, or a money field
    // that arrived as a JSON number. Calm, and no number.
    return {
      kind: "message",
      tone: "server",
      badge: "อ่านข้อมูลจากระบบไม่ได้",
      lines: [`ระบบตอบกลับมาในรูปแบบที่แอปรุ่นนี้อ่านไม่ได้ จึงยังแสดงยอดไม่ได้ — ${ASK_THE_OWNER}`],
      action: { kind: "retry", label: "ลองอีกครั้ง" },
    };
  }

  const sorted = sortByPaidDesc(body.rows);
  const top = sorted.slice(0, TOP_ROWS);
  const rest = sorted.slice(TOP_ROWS);
  const displayed: SummaryWireRow[] = rest.length > 0 ? [...top, othersRow(rest)] : top;
  const max = maxPaid(displayed);
  const rows = displayed.map((r) => barRow(r, max, r.key === "__others__" && rest.length > 0));

  return {
    kind: "summary",
    from_date: body.from_date,
    to_date: body.to_date,
    by: body.by,
    state: body.state,
    rows,
    totals: body.totals,
    figureLabels: {
      paid: "ยอดที่จ่ายจริง",
      list: "ยอดตามราคาประกาศ",
      diff: "ส่วนต่างจากราคาประกาศ",
      weight: "น้ำหนักรวม",
      count: "จำนวนบิล",
    },
    diffExplain: DIFF_EXPLAIN,
    byChips: chips(BY_LABELS, ["product", "seller", "user", "day"], body.by),
    stateChips: chips(STATE_LABELS, ["live", "void", "all"], body.state),
    emptyLine: body.rows.length === 0 ? NO_BILLS_LINE : null,
  };
}
