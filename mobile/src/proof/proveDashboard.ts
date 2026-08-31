/**
 * THE DASHBOARD ON THE PHONE — period × dimension over GET /reports/summary, the
 * day's bill list absorbed as the today view, role/toggle-gated. P1.23 item 4, unit 3.
 *
 *   npm run prove:dashboard
 *   npm run prove:dashboard -- --break=<staff_entry_off|add_unsent|number_sort|utc_today|accept_number>
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS CANNOT PROVE, FIRST
 * ─────────────────────────────────────────────────────────────────────────────
 * It runs under node: there is no screen, no handset, no network. Every cell is a
 * statement about the pure builders in src/dashboard/ — the period arithmetic, the
 * money discipline, the sort, the role gate — and about NOTHING drawn. A green run
 * says the numbers and sentences are right; only the owner's device pass says the
 * dashboard is usable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE FIVE DISPROOFS, EACH A POSITIVE CONTROL APPLIED BY THIS SCRIPT
 * ─────────────────────────────────────────────────────────────────────────────
 * Every break is applied HERE, through a wrapper, never by a hook inside the module
 * under test (lessons/a-check-that-never-went-red-was-never-observed.md). Each
 * reddens EXACTLY one cell:
 *
 *   staff_entry_off  the header entry is drawn for staff while the toggle is OFF
 *                    (E2). Reddens the staff-off entry cell.
 *   add_unsent       the unsent amount is folded into the displayed total (E4).
 *                    Reddens the total-unchanged cell.
 *   number_sort      rows are ordered with Number() on a pair a double cannot tell
 *                    apart. Reddens the Decimal-sort cell.
 *   utc_today        "today" is bucketed in UTC, not shop time. Reddens the
 *                    midnight-straddle cell.
 *   accept_number    a JSON-number money field is stringified instead of refused.
 *                    Reddens the refuse-whole-response cell.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE EXIT LINE
 * ─────────────────────────────────────────────────────────────────────────────
 * main() prints `PROVE_DASHBOARD_EXIT=<n>` from the same integer it returns. That
 * line is ABSENT if the script dies before the summary; the absence is the signal
 * (lessons/a-default-exit-code-is-a-default-verdict.md).
 */
import { Decimal } from "decimal.js";

import {
  MAX_SPAN_DAYS,
  customRange,
  periodLabel,
  presetRange,
  selectCustom,
  selectPreset,
  shopToday,
  spanDays,
} from "../dashboard/period.js";
import {
  STAFF_MONEY_HIDDEN,
  readSummaryBody,
  sortByPaidDesc,
  summaryScreen,
} from "../dashboard/summaryView.js";
import type { SummaryReport, SummaryWireRow } from "../dashboard/summaryView.js";
import { unsentLine } from "../dashboard/unsentLine.js";
import {
  dashboardScreen,
  mayShowDashboardEntry,
  readMoneyVisible,
} from "../dashboard/dashboardView.js";
import type { DeviceRole } from "../session/deviceRole.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const BREAK = (process.argv.find((a) => a.startsWith("--break=")) ?? "").split("=")[1] ?? "";
const BREAK_MODES: readonly string[] = [
  "staff_entry_off",
  "add_unsent",
  "number_sort",
  "utc_today",
  "accept_number",
];
if (BREAK !== "" && !BREAK_MODES.includes(BREAK)) {
  console.log(`  [FAIL] unknown --break=${BREAK} — nothing was damaged and nothing was measured`);
  console.log(`         known breaks: ${BREAK_MODES.join(", ")}`);
  console.log("PROVE_DASHBOARD_EXIT=2");
  process.exit(2);
}

/* ------------------------------------------------------------ the wrappers -- */

/** The header entry gate, or the damaged one that draws it for staff+OFF (E2). */
function entryGate(role: DeviceRole, moneyVisible: boolean | null): boolean {
  if (BREAK === "staff_entry_off" && role === "staff" && moneyVisible === false) return true;
  return mayShowDashboardEntry(role, moneyVisible);
}

/** The displayed total, or the damaged one that folds the unsent amount in (E4). */
function shownTotal(report: SummaryReport, unsentAmount: string): string {
  if (BREAK === "add_unsent") {
    return new Decimal(report.totals.paid_total).plus(unsentAmount).toFixed(2);
  }
  return report.totals.paid_total;
}

/** The row sort, or the damaged one that orders by Number() (a double loses digits). */
function sortRows(rows: readonly SummaryWireRow[]): SummaryWireRow[] {
  if (BREAK === "number_sort") {
    return [...rows].sort((a, b) => Number(b.paid_total) - Number(a.paid_total));
  }
  return sortByPaidDesc(rows);
}

/** Shop today, or the damaged one that reads the UTC date (no offset). */
function todayOf(now: Date): string {
  if (BREAK === "utc_today") {
    const y = now.getUTCFullYear();
    const m = String(now.getUTCMonth() + 1).padStart(2, "0");
    const d = String(now.getUTCDate()).padStart(2, "0");
    return `${String(y)}-${m}-${d}`;
  }
  return shopToday(now);
}

/** A body, or the damaged version whose numeric money fields are stringified — the
 *  "reader accepted a number" defect, applied to the INPUT by this script. */
function maybeStringifyMoney(body: Record<string, unknown>): Record<string, unknown> {
  if (BREAK !== "accept_number") return body;
  const fix = (o: unknown): unknown => {
    if (typeof o !== "object" || o === null) return o;
    if (Array.isArray(o)) return o.map(fix);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      out[k] = typeof v === "number" && k !== "bill_count" ? String(v) : fix(v);
    }
    return out;
  };
  return fix(body) as Record<string, unknown>;
}

/* ------------------------------------------------------------- fixtures ---- */

/** A wire row, money as strings — the shape the server sends. */
function row(key: string, label: string, paid: string, list: string, weight: string, count: number): SummaryWireRow {
  return {
    key,
    label,
    bill_count: count,
    net_weight: weight,
    paid_total: paid,
    list_total: list,
    // list_total − paid_total, as the server computes it. Kept as a plain diff here.
    list_minus_paid: new Decimal(list).minus(new Decimal(paid)).toFixed(2),
  };
}

function totalsOf(rows: readonly SummaryWireRow[]): SummaryWireRow {
  const sum = (f: (r: SummaryWireRow) => string, dp: number): string =>
    rows.reduce((a, r) => a.plus(new Decimal(f(r))), new Decimal(0)).toFixed(dp);
  const paid = sum((r) => r.paid_total, 2);
  const list = sum((r) => r.list_total, 2);
  return {
    key: null,
    label: null,
    bill_count: rows.reduce((n, r) => n + r.bill_count, 0),
    net_weight: sum((r) => r.net_weight, 3),
    paid_total: paid,
    list_total: list,
    list_minus_paid: new Decimal(list).minus(new Decimal(paid)).toFixed(2),
  };
}

function summaryBodyOf(rows: readonly SummaryWireRow[], by = "product", state = "live"): Record<string, unknown> {
  const totals = totalsOf(rows);
  return {
    from_date: "2026-08-01",
    to_date: "2026-08-31",
    by,
    state,
    rows: rows.map((r) => ({ ...r })),
    totals: {
      key: null,
      label: null,
      bill_count: totals.bill_count,
      net_weight: totals.net_weight,
      paid_total: totals.paid_total,
      list_total: totals.list_total,
      list_minus_paid: totals.list_minus_paid,
    },
  };
}

/* ------------------------------------------------------------------ cells -- */

function pPeriod(): void {
  header("P0 the period — shop-local dates, one offset authority, BE after conversion");

  // Midnight straddle: two UTC instants one hour apart land on different shop days.
  const justAfter = new Date("2026-08-30T17:30:00Z"); // 2026-08-31 00:30 +07
  const justBefore = new Date("2026-08-30T16:30:00Z"); // 2026-08-30 23:30 +07
  console.log(`  17:30Z -> shop ${todayOf(justAfter)} ; 16:30Z -> shop ${todayOf(justBefore)}`);
  check(
    "00:30 and 23:30 shop time straddle midnight into different days (utc_today break reddens this)",
    todayOf(justAfter) === "2026-08-31" && todayOf(justBefore) === "2026-08-30" &&
      todayOf(justAfter) !== todayOf(justBefore),
    `after=${todayOf(justAfter)} before=${todayOf(justBefore)}`,
  );

  // BE year after conversion: a New-Year-eve instant that is already next year in shop time.
  const newYear = new Date("2026-12-31T17:30:00Z"); // 2027-01-01 00:30 +07
  const nyToday = shopToday(newYear);
  const nyLabel = periodLabel({ from_date: nyToday, to_date: nyToday });
  console.log(`  2026-12-31T17:30Z -> shop today ${nyToday} , label ${nyLabel}`);
  check(
    "the shop day is 2027-01-01, not the UTC 2026-12-31",
    nyToday === "2027-01-01",
    nyToday,
  );
  check(
    "the BE label reads 2570 (543 added AFTER the timezone conversion), never 2569",
    nyLabel.includes("2570") && !nyLabel.includes("2569") && nyLabel.startsWith("1 "),
    nyLabel,
  );

  // "this month": the 1st through today, calendar month. Two months, one 31-day, one Feb.
  const inAug = new Date("2026-08-20T05:00:00Z"); // 12:00 +07, 20 Aug
  const augMonth = presetRange("month", inAug);
  check(
    "this month starts on the 1st of the shop calendar month (31-day August)",
    augMonth.from_date === "2026-08-01" && augMonth.to_date === "2026-08-20",
    `${augMonth.from_date} .. ${augMonth.to_date}`,
  );
  const inFeb = new Date("2027-02-15T05:00:00Z"); // 12:00 +07, 15 Feb
  const febMonth = presetRange("month", inFeb);
  check(
    "this month works in February too (no fixed 30/31 assumption)",
    febMonth.from_date === "2027-02-01" && febMonth.to_date === "2027-02-15",
    `${febMonth.from_date} .. ${febMonth.to_date}`,
  );

  // "this week": Monday through today, across a month boundary.
  // 2026-09-02 is a Wednesday; its Monday is 2026-08-31 (previous month).
  const wed = new Date("2026-09-02T05:00:00Z"); // 12:00 +07, Wed 2 Sep
  const week = presetRange("week", wed);
  check(
    "this week starts on Monday even across a month boundary (Wed 2 Sep -> Mon 31 Aug)",
    week.from_date === "2026-08-31" && week.to_date === "2026-09-02",
    `${week.from_date} .. ${week.to_date}`,
  );

  // Custom span: 366 inclusive accepted, 367 refused with the bound named.
  const ok366 = customRange("2026-01-01", "2027-01-01"); // 366 inclusive
  const bad367 = customRange("2026-01-01", "2027-01-02"); // 367 inclusive
  check(
    `a ${String(MAX_SPAN_DAYS)}-day inclusive custom range is accepted`,
    !("kind" in ok366) && spanDays(ok366) === MAX_SPAN_DAYS,
    "kind" in ok366 ? ok366.reason : `span ${String(spanDays(ok366))}`,
  );
  check(
    "a 367-day custom range is refused with a sentence naming the bound",
    "kind" in bad367 && bad367.reason.includes(String(MAX_SPAN_DAYS)),
    "kind" in bad367 ? bad367.reason : "accepted (should not be)",
  );
  const inverted = customRange("2026-08-10", "2026-08-01");
  check(
    "an inverted range is refused before the too-wide check",
    "kind" in inverted && inverted.reason.includes("วันสิ้นสุด"),
    "kind" in inverted ? inverted.reason : "accepted",
  );
  const todaySel = selectPreset("today", inAug);
  check("only the today preset is marked isToday", todaySel.isToday && !selectPreset("week", inAug).isToday);
  const customToday = selectCustom(shopToday(inAug), shopToday(inAug), inAug);
  check(
    "a custom range that is exactly today is also isToday",
    !("kind" in customToday) && customToday.isToday,
  );
}

function pSummaryMoney(): void {
  header("P1 the summary — money is the server string, the sort and sums are Decimal");

  // A pair a double cannot tell apart: both Number() to 1e17, so a Number sort
  // leaves them in input order while Decimal orders them correctly.
  const rows = [
    row("B", "beta", "99999999999999999.99", "99999999999999999.99", "10.000", 1),
    row("C", "gamma", "100000000000000000.00", "100000000000000000.00", "20.000", 1),
    row("A", "alpha", "100.00", "150.00", "5.000", 2),
  ];
  const sorted = sortRows(rows);
  const keys = sorted.map((r) => r.key);
  console.log(`  Decimal-desc keys: ${keys.join(",")}  (Number sort would give B,C,A)`);
  check(
    "rows sort by paid_total DESC via Decimal — the 1e17 pair orders correctly (number_sort reddens this)",
    keys[0] === "C" && keys[1] === "B" && keys[2] === "A",
    keys.join(","),
  );

  // The screen renders each server row's money VERBATIM, and refuses a JSON number.
  const body = summaryBodyOf(rows);
  const screen = summaryScreen({ kind: "ok", body });
  check("a well-formed body renders a summary, not a message", screen.kind === "summary");
  if (screen.kind === "summary") {
    const rendered = screen.rows;
    let verbatim = 0;
    for (const r of rendered) {
      const src = rows.find((w) => w.key === r.key);
      if (src) {
        if (r.paid_total !== src.paid_total || r.list_total !== src.list_total || r.net_weight !== src.net_weight) {
          check(`row ${r.key} money is verbatim`, false, `${r.paid_total} vs ${src.paid_total}`);
        } else verbatim += 1;
      }
    }
    check("every displayed server row keeps its money byte-for-byte", verbatim === rows.length, `${String(verbatim)}/${String(rows.length)}`);
    // The 1e17 value survives — a formatter would print 100000000000000000.
    const big = rendered.find((r) => r.key === "B");
    check("a value no double can hold survives", big?.paid_total === "99999999999999999.99", big?.paid_total ?? "(missing)");
    // Bars: fraction 0..1, the largest is 1.0, money text is not a fraction.
    const maxRow = rendered.find((r) => r.key === "C");
    check("the largest paid_total has bar fraction 1", maxRow?.fraction === 1, String(maxRow?.fraction));
    check("every bar fraction is within [0,1]", rendered.every((r) => r.fraction >= 0 && r.fraction <= 1));
  }

  // A JSON NUMBER in a money field refuses the WHOLE response (accept_number reddens this).
  const numericBody: Record<string, unknown> = maybeStringifyMoney({
    from_date: "2026-08-01",
    to_date: "2026-08-31",
    by: "product",
    state: "live",
    rows: [
      { key: "B", label: "beta", bill_count: 1, net_weight: "10.000", paid_total: 123.45, list_total: "150.00", list_minus_paid: "26.55" },
      { key: "A", label: "alpha", bill_count: 2, net_weight: "5.000", paid_total: "100.00", list_total: "150.00", list_minus_paid: "50.00" },
    ],
    totals: { key: null, label: null, bill_count: 3, net_weight: "15.000", paid_total: "223.45", list_total: "300.00", list_minus_paid: "76.55" },
  });
  console.log(`  numeric-money body parses to: ${readSummaryBody(numericBody) === null ? "null (refused)" : "a body (accepted)"}`);
  const refused = summaryScreen({ kind: "ok", body: numericBody });
  check(
    "a money field arriving as a JSON number refuses the whole response",
    refused.kind === "message",
    `kind=${refused.kind}`,
  );

  // A negative list_minus_paid keeps its sign, verbatim (paid MORE than list).
  const overpaid = [row("X", "x", "200.00", "150.00", "1.000", 1)];
  const overScreen = summaryScreen({ kind: "ok", body: summaryBodyOf(overpaid) });
  if (overScreen.kind === "summary") {
    const x = overScreen.rows[0];
    check("a negative list_minus_paid keeps its minus sign, verbatim", x?.list_minus_paid === "-50.00", x?.list_minus_paid ?? "(missing)");
  } else check("overpaid renders a summary", false);
}

function pTopAndTotals(): void {
  header("P2 top-10 + อื่นๆ, and the totals it reconciles to");

  // 13 rows: top 10 kept verbatim, 3 folded into อื่นๆ whose fields are Decimal sums.
  const many: SummaryWireRow[] = [];
  for (let i = 0; i < 13; i += 1) {
    const paid = (1300 - i * 100).toFixed(2); // strictly descending so order is known
    many.push(row(`k${String(i)}`, `n${String(i)}`, paid, (Number(paid) + 10).toFixed(2), (i + 1).toFixed(3), i + 1));
  }
  const body = summaryBodyOf(many);
  const screen = summaryScreen({ kind: "ok", body });
  if (screen.kind !== "summary") { check("13-row body renders", false); return; }
  check("exactly 11 rows are shown: top 10 + one อื่นๆ", screen.rows.length === 11, String(screen.rows.length));
  const others = screen.rows[10];
  check("the last row is the อื่นๆ aggregate", others?.isOthers === true && others?.label === "อื่นๆ");

  // top-10 + others reconcile to the server totals, string-for-string, for money+weight.
  const dispPaid = screen.rows.reduce((a, r) => a.plus(new Decimal(r.paid_total)), new Decimal(0)).toFixed(2);
  const dispList = screen.rows.reduce((a, r) => a.plus(new Decimal(r.list_total)), new Decimal(0)).toFixed(2);
  const dispWeight = screen.rows.reduce((a, r) => a.plus(new Decimal(r.net_weight)), new Decimal(0)).toFixed(3);
  console.log(`  displayed paid ${dispPaid} vs server totals ${screen.totals.paid_total}`);
  check("top-10 + อื่นๆ paid_total equals the server totals, string-for-string", dispPaid === screen.totals.paid_total, `${dispPaid} vs ${screen.totals.paid_total}`);
  check("top-10 + อื่นๆ list_total equals the server totals", dispList === screen.totals.list_total);
  check("top-10 + อื่นๆ net_weight equals the server totals", dispWeight === screen.totals.net_weight);

  // The others row's own fields are the Decimal sums of the folded rows.
  const rest = sortByPaidDesc(many).slice(10);
  const restPaid = rest.reduce((a, r) => a.plus(new Decimal(r.paid_total)), new Decimal(0)).toFixed(2);
  check("the อื่นๆ paid_total is the Decimal sum of the rows it replaces", others?.paid_total === restPaid, `${others?.paid_total} vs ${restPaid}`);

  // Zero rows: no bars, a sentence, and the server totals shown as they came (0.00).
  const emptyBody = summaryBodyOf([]);
  const emptyScreen = summaryScreen({ kind: "ok", body: emptyBody });
  if (emptyScreen.kind === "summary") {
    check("0 rows -> the ไม่มีบิลในช่วงนี้ sentence", emptyScreen.emptyLine === "ไม่มีบิลในช่วงนี้", emptyScreen.emptyLine ?? "(null)");
    check("0 rows -> the server totals rendered as they came (0.00)", emptyScreen.totals.paid_total === "0.00" && emptyScreen.rows.length === 0);
  } else check("empty body renders a summary", false);

  // Chips: the selected one is flagged, and each names what it counts.
  const withChips = summaryScreen({ kind: "ok", body: summaryBodyOf(many, "seller", "void") });
  if (withChips.kind === "summary") {
    check("the selected by-chip is 'seller' and says ตามผู้ขาย", withChips.byChips.find((c) => c.value === "seller")?.selected === true && withChips.byChips.find((c) => c.value === "seller")?.label === "ตามผู้ขาย");
    check("the selected state-chip is 'void' and says บิลที่ถูกยกเลิก", withChips.stateChips.find((c) => c.value === "void")?.selected === true && withChips.stateChips.find((c) => c.value === "void")?.label === "บิลที่ถูกยกเลิก");
  } else check("chips body renders a summary", false);
}

function pUnsent(): void {
  header("P3 the unsent line (E4) — this device's own bills, never in any total");

  check("nothing unsent -> no line at all", unsentLine([]) === null);

  // Count and Decimal sum, over a pair Number would misadd.
  const line = unsentLine(["1000000000000.01", "1000000000000.02", "0.01"]);
  check("the count is the number of unsent bills", line?.count === 3, String(line?.count));
  check(
    "the amount is the exact Decimal sum (Number would drift on the big pair)",
    line?.amount === "2000000000000.04",
    line?.amount ?? "(null)",
  );
  check("the line names this device and the amount", (line?.text ?? "").startsWith("รอส่งจากเครื่องนี้ 3 ใบ · ยอด 2000000000000.04"));

  // A null amount is counted but named, never dropped (money-safety: no silent understatement).
  const withNull = unsentLine(["100.00", null]);
  check("a bill with no amount is counted but the line says the total may be higher", withNull?.count === 2 && withNull?.someUnknown === true && (withNull?.text ?? "").includes("ยอดจริงอาจมากกว่านี้"));

  // The unsent amount is NEVER folded into the summary total (add_unsent reddens this).
  const rows = [row("A", "a", "500.00", "500.00", "1.000", 1)];
  const screen = summaryScreen({ kind: "ok", body: summaryBodyOf(rows) });
  if (screen.kind === "summary") {
    const displayed = shownTotal(screen, "999.99");
    console.log(`  server total ${screen.totals.paid_total} ; displayed ${displayed}`);
    check(
      "the displayed total equals the server total exactly — the unsent amount is not added",
      displayed === screen.totals.paid_total,
      `${displayed} vs ${screen.totals.paid_total}`,
    );
  } else check("unsent-total body renders a summary", false);
}

function pDashboard(): void {
  header("P4 the shell — E1 title, E2 entry gate, the staff bill-list gap, offline");

  const rows = [row("A", "a", "500.00", "500.00", "1.000", 1)];
  const okSummary = summaryScreen({ kind: "ok", body: summaryBodyOf(rows) });
  const today = selectPreset("today", new Date("2026-08-20T05:00:00Z"));
  const week = selectPreset("week", new Date("2026-08-20T05:00:00Z"));

  // E1 — the title NAMES whose money it is.
  const adminModel = dashboardScreen({ role: "admin", selection: today, summary: okSummary, unsent: null });
  const staffModel = dashboardScreen({ role: "staff", selection: today, summary: okSummary, unsent: null });
  check("admin -> title ยอดร้าน, whoseMoney shop", adminModel.kind === "dashboard" && adminModel.title === "ยอดร้าน" && adminModel.whoseMoney === "shop");
  check("staff -> title ยอดของฉัน, whoseMoney own", staffModel.kind === "dashboard" && staffModel.title === "ยอดของฉัน" && staffModel.whoseMoney === "own");

  // The bill list: admin+today shows it; staff+today gets the unavailable sentence; week hides it.
  if (adminModel.kind === "dashboard") check("admin today -> bill list shown", adminModel.billList.kind === "show");
  if (staffModel.kind === "dashboard") check("staff today -> bill list is a sentence, not other people's bills", staffModel.billList.kind === "staff_unavailable" && staffModel.billList.note.includes("พนักงาน"));
  const adminWeek = dashboardScreen({ role: "admin", selection: week, summary: okSummary, unsent: null });
  if (adminWeek.kind === "dashboard") check("a non-today period hides the bill list", adminWeek.billList.kind === "hidden");

  // Offline / refused summary -> the whole dashboard is one calm message.
  const offline = dashboardScreen({ role: "admin", selection: today, summary: summaryScreen({ kind: "unreachable" }), unsent: null });
  check("offline -> the dashboard is the calm offline message, no chart, no fields", offline.kind === "message" && offline.tone === "offline");
  const staffHidden = dashboardScreen({ role: "staff", selection: today, summary: summaryScreen({ kind: "http", status: 403, code: STAFF_MONEY_HIDDEN }), unsent: null });
  check("a 403 staff_money_hidden -> a calm message naming the owner, no red", staffHidden.kind === "message" && staffHidden.tone === "forbidden" && staffHidden.lines[0]?.includes("เจ้าของร้าน") === true && staffHidden.action === null);

  // E2 — the entry gate (staff_entry_off reddens the staff-off cell only).
  check("admin: entry drawn regardless of the toggle", entryGate("admin", false) && entryGate("admin", true));
  check("unknown role: entry drawn (fails open)", entryGate(null, false) && entryGate(null, null));
  check("staff + toggle ON: entry drawn", entryGate("staff", true));
  check("staff + toggle OFF: entry NOT drawn (E2)", entryGate("staff", false) === false);
  check("staff + toggle unknown (offline): entry NOT drawn — treated as OFF", entryGate("staff", null) === false);

  // The toggle reader: a boolean is read, anything else is unknown (null).
  check("readMoneyVisible reads a boolean off /shop", readMoneyVisible({ staff_money_visible: true }) === true && readMoneyVisible({ staff_money_visible: false }) === false);
  check("readMoneyVisible is null when the field is absent or not a boolean", readMoneyVisible({}) === null && readMoneyVisible({ staff_money_visible: "yes" }) === null && readMoneyVisible(null) === null);
}

/* ------------------------------------------------------------------- main -- */

async function main(): Promise<number> {
  console.log("PROVE DASHBOARD — period × dimension over /reports/summary, role/toggle-gated");
  console.log("");
  console.log("  Runs under node: no screen, no handset, no network. Every cell is about the");
  console.log("  pure builders in src/dashboard/. Only the owner's device pass says it is usable.");
  if (BREAK !== "") {
    console.log("");
    console.log(`  *** NEGATIVE CONTROL ACTIVE: --break=${BREAK} ***`);
    console.log("      The model is damaged ON PURPOSE by this script, never by src/dashboard/.");
    console.log("      Exactly one cell must go red; a cell that stays green is not measuring what it claims.");
  }

  pPeriod();
  pSummaryMoney();
  pTopAndTotals();
  pUnsent();
  pDashboard();

  console.log("");
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

// Preset RED (lessons/a-default-exit-code-is-a-default-verdict.md): a run that ends
// before main()'s tally exits non-zero, not a default 0.
process.exitCode = 1;

const exitCode = await main().catch((err: unknown) => {
  console.log("");
  console.log(`  [FAIL] the run died: ${err instanceof Error ? err.message : String(err)}`);
  return 1;
});
console.log(`PROVE_DASHBOARD_EXIT=${String(exitCode)}`);
process.exitCode = exitCode;
