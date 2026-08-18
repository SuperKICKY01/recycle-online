/**
 * Phase 2d proof: THE DAY'S MONEY, AS THE OWNER READS IT.
 *
 * Run: npm run prove:daily
 *
 * Same shape and same reason as proveNotice: this screen is decided by pure
 * functions in src/reports/dailyView.ts, so the whole rendering surface can be
 * enumerated rather than sampled. Nothing here needs a server — that is the
 * point. The live endpoint was proven last phase (server/scripts/
 * prove_daily_report.py, 63 checks); what is unproven until now is what a human
 * reads when it answers, and what they read when it does NOT.
 *
 * THE FIVE CLAIMS THIS PHASE MAKES, and each has its own section:
 *
 *   D2  money passes through untouched — no JS number ever sees it
 *   D3  the understatement line is ALWAYS present, on every report, calmly
 *   D5  a 403 renders calmly: no diagnostic, no sign-in, names the owner
 *   D6  an unreachable server is DISTINGUISHABLE from a zero day, in both
 *       directions, and neither one can be read as the other
 *   D7  every instant renders through shopTime, and device time is not merely
 *       absent — it is unrepresentable
 *
 * ON THE OUTPUT. This proof is almost entirely Thai. If the console shows
 * mojibake that is the console — this box is codepage 874, see
 * lessons/console-is-not-the-observation.md. Every assertion below compares
 * JavaScript strings, which are unaffected by how the terminal draws them.
 */
import {
  dailyScreen,
  nextShopDay,
  previousShopDay,
  readDailyBody,
} from "../reports/dailyView.js";
import type {
  DailyFetch,
  DailyReportScreen,
  DailyScreen,
} from "../reports/dailyView.js";
import { shopDate, shopTime } from "@recycle/shop-time";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

function checkAll<T>(
  label: string,
  cells: readonly T[],
  ok: (cell: T) => boolean,
  describe: (cell: T) => string,
): void {
  const bad = cells.filter((c) => !ok(c));
  check(
    label,
    bad.length === 0,
    bad.length === 0
      ? `${String(cells.length)} cells, all clean`
      : `${String(bad.length)}/${String(cells.length)} FAILED: ${bad.slice(0, 4).map(describe).join(" | ")}`,
  );
}

/* ==========================================================================
 * Fixtures — shaped exactly like server/app/reports.py's response
 * ========================================================================== */

const DAY = "2026-08-01";
const STARTS = "2026-08-01T00:00:00+07:00";
/* Six fractional digits, because Postgres timestamptz is microsecond
 * resolution and `_shop_iso` emits all of them. This is the first screen in the
 * app to render a SERVER-produced instant; every earlier one came from
 * `new Date().toISOString()` on the device, which is always exactly three. */
const AS_OF = "2026-08-01T17:32:11.123456+07:00";

interface VoidOpts {
  doc_no?: string | null;
  total_amount?: unknown;
  seller_name?: string | null;
  reason?: string | null;
  voided_by_name?: string | null;
  voided_by_username?: string | null;
  voided_at?: string | null;
  received_at?: string | null;
  from_earlier_day?: boolean;
}

const rawVoid = (o: VoidOpts = {}): unknown => ({
  id: "aaaa0000-0000-0000-0000-0000000000aa",
  doc_no: o.doc_no === undefined ? "B-2569-231" : o.doc_no,
  total_amount: o.total_amount === undefined ? "220.00" : o.total_amount,
  seller_name: o.seller_name === undefined ? "ร้านสมชาย" : o.seller_name,
  reason: o.reason === undefined ? "ชั่งผิด" : o.reason,
  voided_by: "bbbb0000-0000-0000-0000-0000000000bb",
  voided_by_username: o.voided_by_username === undefined ? "admin" : o.voided_by_username,
  voided_by_name: o.voided_by_name === undefined ? "สมศรี เจ้าของร้าน" : o.voided_by_name,
  voided_at: o.voided_at === undefined ? "2026-08-01T16:04:02.551211+07:00" : o.voided_at,
  received_at: o.received_at === undefined ? "2026-08-01T09:14:00.100200+07:00" : o.received_at,
  bill_date: DAY,
  from_earlier_day: o.from_earlier_day ?? false,
});

interface LineOpts {
  doc_no?: string | null;
  total_amount?: unknown;
  seller_name?: string | null;
  item_count?: number;
  off_list?: boolean;
  received_at?: string | null;
}

const rawLine = (o: LineOpts = {}): unknown => ({
  id: "cccc0000-0000-0000-0000-0000000000cc",
  doc_no: o.doc_no === undefined ? "B-2569-230" : o.doc_no,
  received_at: o.received_at === undefined ? "2026-08-01T09:14:00.100200+07:00" : o.received_at,
  seller_code: "SELL-001",
  seller_name: o.seller_name === undefined ? "ร้านสมชาย" : o.seller_name,
  vehicle_no: "70-1234",
  item_count: o.item_count ?? 3,
  total_amount: o.total_amount === undefined ? "1075.00" : o.total_amount,
  off_list: o.off_list ?? false,
  off_list_line_count: o.off_list === true ? 1 : 0,
});

interface BodyOpts {
  date?: string;
  date_be?: string;
  starts_at?: string;
  is_today?: boolean;
  shop_today?: string;
  aggregated_on?: string;
  active_bill_count?: number;
  active_total?: unknown;
  voided_bill_count?: number;
  voided_total?: unknown;
  off_list_bill_count?: number;
  off_list_line_count?: number;
  off_list_variance?: unknown;
  first_doc_no?: string | null;
  last_doc_no?: string | null;
  voided?: unknown[];
  voided_truncated?: boolean;
  voids_applied?: unknown[];
  lines?: unknown[];
  bills_total?: number;
  bills_truncated?: boolean;
  understatement_possible?: boolean;
  as_of?: string;
}

function rawBody(o: BodyOpts = {}): unknown {
  const lines = o.lines ?? [rawLine()];
  return {
    day: {
      date: o.date ?? DAY,
      date_be: o.date_be ?? "01/08/2569",
      timezone: "Asia/Bangkok",
      starts_at: o.starts_at ?? STARTS,
      ends_at: "2026-08-02T00:00:00+07:00",
      is_today: o.is_today ?? true,
      requested: false,
      server_now: AS_OF,
      shop_today: o.shop_today ?? DAY,
    },
    basis: {
      aggregated_on: o.aggregated_on ?? "server_received_at",
      boundary: "half-open [start, end) in shop time",
      not_aggregated_on: "device_created_at",
      why_en: "device clocks are untrusted and measurably wrong",
      consequence_en: "a bill weighed at 23:50 and synced at 00:05 counts in the NEXT day",
      consequence_th: "บิลที่ชั่งเวลา 23:50 แต่ส่งถึงระบบเวลา 00:05 จะถูกนับเป็นยอดของวันถัดไป",
    },
    totals: {
      active_bill_count: o.active_bill_count ?? 12,
      active_total: o.active_total === undefined ? "128400.00" : o.active_total,
      voided_bill_count: o.voided_bill_count ?? 0,
      voided_total: o.voided_total === undefined ? "0.00" : o.voided_total,
      off_list_bill_count: o.off_list_bill_count ?? 0,
      off_list_line_count: o.off_list_line_count ?? 0,
      off_list_variance: o.off_list_variance === undefined ? "0.00" : o.off_list_variance,
      first_doc_no: o.first_doc_no === undefined ? "B-2569-219" : o.first_doc_no,
      last_doc_no: o.last_doc_no === undefined ? "B-2569-230" : o.last_doc_no,
      doc_no_span: 12,
      doc_no_contiguous: true,
      first_received_at: "2026-08-01T08:02:00.000000+07:00",
      last_received_at: "2026-08-01T17:01:00.000000+07:00",
    },
    voided: o.voided ?? [],
    voided_truncated: o.voided_truncated ?? false,
    voids_applied: o.voids_applied ?? [],
    voids_applied_truncated: false,
    bills: {
      limit: 200,
      offset: 0,
      returned: lines.length,
      total: o.bills_total ?? lines.length,
      truncated: o.bills_truncated ?? false,
      next_offset: null,
      lines,
    },
    completeness: {
      as_of: o.as_of ?? AS_OF,
      snapshot: "one repeatable-read transaction",
      understatement_possible: o.understatement_possible ?? true,
      understatement_reason_th: "บิลถูกบันทึกในเครื่องก่อนแล้วจึงส่งเข้าระบบ",
      cannot_know: ["how many bills are still unsynced on a phone"],
      quiet_for_seconds: 31.2,
      quiet_for_seconds_note: "NOT a sync check",
    },
  };
}

const ok = (o: BodyOpts = {}): DailyFetch => ({ kind: "ok", body: rawBody(o) });

/** Every string the screen puts in front of a human, in one blob. */
function allText(s: DailyScreen): string {
  if (s.kind === "message") {
    return `${s.badge} ${s.lines.join(" ")} ${s.action?.label ?? ""}`;
  }
  const sections = [s.voided, s.earlierVoids].flatMap((v) => [
    v.heading, v.intro, v.emptyLine ?? "", v.totalLine ?? "", v.truncatedNote ?? "",
    ...v.rows.flatMap((r) => [r.docNo, r.amount, r.reason, r.who, r.when, r.seller, r.fromDayNote ?? ""]),
  ]);
  return [
    s.dayLabel, s.dayHeading, s.pastDayNote ?? "",
    s.headline.caption, s.headline.amount, s.headline.unit, s.headline.countLine,
    ...s.understatement, s.dayBoundary, s.basisWarning ?? "",
    ...sections,
    s.offList.heading, s.offList.summary, s.offList.varianceLine ?? "", s.offList.explain,
    ...s.offList.docNos, s.offList.incompleteNote ?? "", s.offList.emptyLine ?? "",
    s.bills.heading, s.bills.emptyLine ?? "", s.bills.moreNote ?? "", s.bills.unreadableNote ?? "",
    ...s.bills.rows.flatMap((r) => [r.docNo, r.seller, r.itemLine, r.amount, r.time, r.offListNote ?? ""]),
    s.docNoLine ?? "", s.asOf,
  ].join(" ");
}

const asReport = (s: DailyScreen): DailyReportScreen => {
  if (s.kind !== "report") throw new Error(`expected a report screen, got ${s.kind}`);
  return s;
};

/* ------------------------------------------------------- forbidden text ---- */

/**
 * Developer diagnostics, the same list proveNotice bans, plus what only this
 * screen could leak: a raw ISO instant and a UUID out of the response body.
 */
const DIAGNOSTIC_FRAGMENTS: readonly (readonly [string, string])[] = [
  ["an HTTP status line", "HTTP"],
  ["JSON punctuation", '{"'],
  ["the `kind` field", "kind"],
  ["a UUID", "aaaa0000"],
  ["a second UUID", "cccc0000"],
  ["a network error string", "network"],
  ["the word fetch", "fetch"],
  ["an English column name", "server_received_at"],
  ["a stringified null", "null"],
  ["a stringified undefined", "undefined"],
  ["a raw ISO date-time separator", "T00:00"],
  ["a raw UTC marker", "Z "],
  ["a raw offset", "+07:00"],
];

const leaks = (text: string): string[] =>
  DIAGNOSTIC_FRAGMENTS.filter(([, needle]) => text.includes(needle)).map(([l]) => l);

/**
 * ANYTHING SHAPED LIKE AN HTTP STATUS, applied only to the NON-REPORT screens.
 *
 * proveNotice bans the bare strings "401", "422", "503" outright, and copying
 * that list here was a real false positive rather than a judgement call: a day
 * with 500 voided bills renders "รวม 500 ใบ", and the sweep called it a leaked
 * 5xx. On a bill card no number is legitimate, so a bare status there can only
 * have come from a transport string. On a MONEY report every section is counts
 * and amounts, and the same test means nothing.
 *
 * So the check moves to where it is still true — the message screens, which
 * carry no counts and no money at all. That is also STRICTER than the list it
 * replaces: it catches 418, and every other status nobody thought to enumerate.
 */
const STATUS_SHAPED = (text: string): boolean => /\b[45]\d\d\b/.test(text);

const ERROR_WORD = "ผิดพลาด";
const THE_OWNER = "เจ้าของร้าน";
const SIGN_IN = "เข้าสู่ระบบ";
const SUPPORT = "ฝ่ายสนับสนุน";

/* ==========================================================================
 * D1 — the report screen, over the states an owner actually meets
 * ========================================================================== */

interface Named {
  name: string;
  fetch: DailyFetch;
}

/**
 * Every REPORT body worth rendering. Not a cross product — these are days, and a
 * day is a coherent thing rather than a set of independent flags. What matters is
 * that each shape below is reachable in a real shop, including the empty one.
 */
function reportCases(): Named[] {
  return [
    { name: "ordinary busy day", fetch: ok() },
    {
      name: "a day that took nothing yet",
      fetch: ok({
        active_bill_count: 0, active_total: "0.00", lines: [], bills_total: 0,
        first_doc_no: null, last_doc_no: null,
      }),
    },
    {
      name: "a day with one void",
      fetch: ok({
        voided_bill_count: 1, voided_total: "220.00",
        voided: [rawVoid()], voids_applied: [rawVoid()],
      }),
    },
    {
      name: "a void today against a bill from an earlier day",
      fetch: ok({
        voids_applied: [
          rawVoid({
            doc_no: "B-2569-118", from_earlier_day: true,
            received_at: "2026-07-28T10:00:00.000000+07:00",
            reason: "ลูกค้าคืนของ", voided_by_name: "สมศรี เจ้าของร้าน",
          }),
        ],
      }),
    },
    {
      name: "off-list bills",
      fetch: ok({
        off_list_bill_count: 2, off_list_line_count: 3, off_list_variance: "137.50",
        lines: [
          rawLine({ doc_no: "B-2569-228", off_list: true }),
          rawLine({ doc_no: "B-2569-229", off_list: true }),
          rawLine({ doc_no: "B-2569-230" }),
        ],
      }),
    },
    {
      name: "off-list count exceeds the returned page",
      fetch: ok({
        off_list_bill_count: 8, off_list_line_count: 11, off_list_variance: "-42.00",
        bills_total: 300, bills_truncated: true,
        lines: [rawLine({ doc_no: "B-2569-228", off_list: true })],
      }),
    },
    {
      name: "a past day",
      fetch: ok({
        date: "2026-07-31", date_be: "31/07/2569", is_today: false,
        starts_at: "2026-07-31T00:00:00+07:00", shop_today: DAY,
      }),
    },
    {
      name: "a truncated void list",
      fetch: ok({ voided: [rawVoid()], voided_bill_count: 500, voided_truncated: true }),
    },
    {
      name: "a bill with no doc_no and no seller name",
      fetch: ok({ lines: [rawLine({ doc_no: null, seller_name: null })] }),
    },
    {
      name: "a void with no reason and no name for who did it",
      fetch: ok({
        voided_bill_count: 1, voided_total: "220.00",
        voided: [rawVoid({ reason: null, voided_by_name: null, voided_by_username: null })],
      }),
    },
    {
      name: "the server claims completeness (a future server; today it cannot)",
      fetch: ok({ understatement_possible: false }),
    },
  ];
}

function d1Reports(): Named[] {
  header("D1: the report screen, over every day shape a shop produces");
  const cases = reportCases();

  const first = asReport(dailyScreen(cases[0]!.fetch));
  console.log(`  ${first.dayHeading}`);
  console.log(`    ${first.headline.caption}: ${first.headline.amount} ${first.headline.unit}  ${first.headline.countLine}`);
  for (const l of first.understatement) console.log(`    · ${l}`);
  console.log(`    · ${first.dayBoundary}`);
  console.log(`    ${first.asOf}`);

  checkAll(
    "every one of them renders a report, not a message",
    cases,
    (c) => dailyScreen(c.fetch).kind === "report",
    (c) => c.name,
  );
  checkAll(
    "no report screen leaks a diagnostic, a UUID or a raw ISO instant",
    cases,
    (c) => leaks(allText(dailyScreen(c.fetch))).length === 0,
    (c) => `${c.name} leaked ${leaks(allText(dailyScreen(c.fetch))).join(", ")}`,
  );
  checkAll(
    "the word ผิดพลาด appears on no report screen at all",
    cases,
    (c) => !allText(dailyScreen(c.fetch)).includes(ERROR_WORD),
    (c) => c.name,
  );
  checkAll(
    "no report screen invites a sign-in — the session is working, that is why there is a number",
    cases,
    (c) => !allText(dailyScreen(c.fetch)).includes(SIGN_IN),
    (c) => c.name,
  );
  checkAll(
    "every visible line is non-empty — no blank rows, no stray punctuation",
    cases,
    (c) => {
      const s = asReport(dailyScreen(c.fetch));
      const optional = [s.pastDayNote, s.basisWarning, s.docNoLine, s.bills.moreNote,
        s.offList.incompleteNote, s.voided.emptyLine, s.voided.totalLine];
      return (
        s.dayLabel.trim().length > 0 &&
        s.headline.amount.trim().length > 0 &&
        s.headline.countLine.trim().length > 0 &&
        s.asOf.trim().length > 0 &&
        optional.every((l) => l === null || l.trim().length > 0)
      );
    },
    (c) => c.name,
  );
  return cases;
}

/* ==========================================================================
 * D2 — MONEY PASSES THROUGH UNTOUCHED
 * ========================================================================== */

/**
 * The rule is not "the money looks right", it is that no JavaScript number ever
 * touches it. Those are different claims and only the second one is checkable:
 * a value can survive a float round trip and still have been through one.
 *
 * So this section is built on values a double CANNOT represent, plus identity
 * assertions on every field. A rendering that parsed would be caught by the
 * first and a rendering that reformatted by the second.
 */
function d2Money(cases: readonly Named[]): void {
  header("D2: money is the server's string, byte for byte");

  /* Every money field of a report, paired with what the server sent. */
  const pairs = (c: Named): [string, string][] => {
    const s = asReport(dailyScreen(c.fetch));
    const out: [string, string][] = [["headline", s.headline.amount]];
    for (const r of s.bills.rows) out.push(["bill row", r.amount]);
    for (const r of [...s.voided.rows, ...s.earlierVoids.rows]) out.push(["void row", r.amount]);
    return out;
  };

  check(
    "the headline is the server's active_total, identical",
    asReport(dailyScreen(ok())).headline.amount === "128400.00",
    asReport(dailyScreen(ok())).headline.amount,
  );

  /*
   * TRAILING ZEROES SURVIVE. "0.10" through Number() and back is "0.1" — the same
   * quantity and a different STRING, and this is a screen where a person compares
   * strings against a printed slip. It is also the cheapest possible detector of
   * a parse that someone added later.
   */
  const dime = asReport(dailyScreen(ok({ active_total: "0.10" })));
  check(
    "a trailing zero survives — '0.10' does not become '0.1'",
    dime.headline.amount === "0.10",
    dime.headline.amount,
  );

  /*
   * A VALUE A DOUBLE CANNOT HOLD. Number("99999999999999999.99") is
   * 100000000000000000, so a parse anywhere on the path shows a different number
   * — not a differently formatted one, a DIFFERENT NUMBER, larger by a baht and
   * change. NUMERIC(14,2) means the server cannot currently produce this, which
   * is exactly why it is the right probe: it can only appear here if this code
   * put it there.
   */
  const huge = "99999999999999999.99";
  const floatForm = String(Number(huge));
  const big = asReport(dailyScreen(ok({ active_total: huge })));
  console.log(`  server sent ${huge}`);
  console.log(`  a float would render ${floatForm}`);
  console.log(`  the screen renders  ${big.headline.amount}`);
  check("the exact digits survive a value no double can hold", big.headline.amount === huge);
  check(
    "and the float form appears NOWHERE on the screen",
    !allText(big).includes(floatForm),
    `looked for ${floatForm}`,
  );
  check(
    "...and that disproof is real: the two strings do differ",
    floatForm !== huge,
    `${floatForm} !== ${huge}`,
  );

  /* A negative variance is money too, and its sign must not be lost or moved. */
  const neg = asReport(dailyScreen(ok({ off_list_bill_count: 1, off_list_variance: "-42.00" })));
  check(
    "a negative off-list variance keeps its sign, verbatim",
    (neg.offList.varianceLine ?? "").includes("-42.00"),
    String(neg.offList.varianceLine),
  );

  /* And identity across every row of every case, not just the headline. */
  const all = cases.flatMap(pairs);
  checkAll(
    "every money value on every screen is a string that came from the response",
    all,
    ([, v]) => typeof v === "string" && /^-?\d+\.\d{2}$/.test(v),
    ([where, v]) => `${where}: ${v}`,
  );
  check("...and that sweep was not empty", all.length >= 15, `${String(all.length)} money values`);

  /*
   * A JSON FLOAT IS REFUSED, NOT RENDERED. If a money field ever arrives as a
   * number the client must not be the layer that quietly shows whatever the
   * double rounded to. The whole day is refused with a calm message and no
   * number at all — see readMoney in dailyView.ts.
   */
  const floated = dailyScreen(ok({ active_total: 128400.0 as unknown as string }));
  check(
    "a money field arriving as a JSON NUMBER refuses the whole day",
    floated.kind === "message" && floated.tone === "server",
    `kind=${floated.kind}`,
  );
  check(
    "...and shows no number of any kind while doing so",
    !/\d/.test(allText(floated)),
    allText(floated),
  );

  /*
   * A ROW with a floated amount is DROPPED rather than taking the day down with
   * it — the totals are SQL aggregates computed independently of the list, so
   * they stay exactly right, and the count of dropped rows is said out loud.
   */
  const badRow = asReport(
    dailyScreen(ok({ lines: [rawLine(), rawLine({ total_amount: 1075.0 })] })),
  );
  check(
    "one unreadable ROW does not take the day's headline down with it",
    badRow.headline.amount === "128400.00" && badRow.bills.rows.length === 1,
    `${String(badRow.bills.rows.length)} row(s) shown`,
  );
  check(
    "...and the screen SAYS a row is missing, so the list cannot silently disagree with the total",
    (badRow.bills.unreadableNote ?? "").includes("1"),
    String(badRow.bills.unreadableNote),
  );
}

/* ==========================================================================
 * D3 — THE UNDERSTATEMENT LINE IS ALWAYS THERE
 * ========================================================================== */

function d3Understatement(cases: readonly Named[]): void {
  header("D3: the understatement warning — always visible, never alarming");

  checkAll(
    "EVERY report screen carries it, in every day shape",
    cases,
    (c) => asReport(dailyScreen(c.fetch)).understatement.length >= 2,
    (c) => c.name,
  );
  checkAll(
    "it says the real total may be HIGHER — never that it may be wrong",
    cases,
    (c) => {
      const u = asReport(dailyScreen(c.fetch)).understatement.join(" ");
      return u.includes("อาจมากกว่า") && !u.includes(ERROR_WORD);
    },
    (c) => c.name,
  );
  checkAll(
    "it says WHY, so it reads as the design working rather than a fault",
    cases,
    (c) => asReport(dailyScreen(c.fetch)).understatement.join(" ").includes("เป็นเรื่องปกติ"),
    (c) => c.name,
  );
  checkAll(
    "it demands nothing of anyone — nobody can make a phone in a truck report in sooner",
    cases,
    (c) => {
      const u = asReport(dailyScreen(c.fetch)).understatement.join(" ");
      return !u.includes("ต้องแจ้ง") && !u.includes("ตรวจสอบ") && !u.includes(SUPPORT);
    },
    (c) => c.name,
  );

  /*
   * THE CASE THAT WOULD HAVE MADE IT DISAPPEAR. `understatement_possible` is a
   * CONSTANT true on today's server, by construction — no device registry, no
   * heartbeat, no device column, so the server has no evidence with which to ever
   * say otherwise. A client that gated the line on that flag would look correct
   * forever and go silent the day a future server started computing it. The
   * client renders it unconditionally and does not read the flag.
   */
  const claimsComplete = asReport(dailyScreen(ok({ understatement_possible: false })));
  check(
    "a server CLAIMING completeness does not silence the line",
    claimsComplete.understatement.length >= 2,
    "the client cannot verify that claim, so it does not act on it",
  );

  /* It is not a footnote: it sits with the number, above every list. */
  const zero = asReport(
    dailyScreen(ok({ active_bill_count: 0, active_total: "0.00", lines: [], bills_total: 0 })),
  );
  check(
    "a ZERO day carries it too — that is the day it matters most",
    zero.understatement.length >= 2 && zero.headline.amount === "0.00",
    "a zero with no caveat reads as 'the shop took nothing'",
  );

  /* And the day boundary consequence, on the same terms. */
  checkAll(
    "the day-boundary consequence is on every report, with the concrete times",
    cases,
    (c) => {
      const d = asReport(dailyScreen(c.fetch)).dayBoundary;
      return d.includes("23:50") && d.includes("00:05") && d.includes("วันถัดไป");
    },
    (c) => c.name,
  );
  console.log(`  ${asReport(dailyScreen(ok())).dayBoundary}`);
}

/* ==========================================================================
 * D4 — the status mapping, and D5 — a 403 in particular
 * ========================================================================== */

const MESSAGE_CASES: readonly Named[] = [
  { name: "no token on this device", fetch: { kind: "no_token" } },
  { name: "401 session expired", fetch: { kind: "http", status: 401, code: null } },
  { name: "403 admin only", fetch: { kind: "http", status: 403, code: "admin_required" } },
  { name: "403 with an unknown code", fetch: { kind: "http", status: 403, code: "shop_suspended" } },
  { name: "403 with no code at all", fetch: { kind: "http", status: 403, code: null } },
  { name: "422 day in the future", fetch: { kind: "http", status: 422, code: "day_in_the_future" } },
  { name: "422 something else", fetch: { kind: "http", status: 422, code: "bad_date" } },
  { name: "404 no such endpoint", fetch: { kind: "http", status: 404, code: null } },
  { name: "500", fetch: { kind: "http", status: 500, code: null } },
  { name: "503", fetch: { kind: "http", status: 503, code: null } },
  { name: "418, unforeseen", fetch: { kind: "http", status: 418, code: null } },
  { name: "unreachable", fetch: { kind: "unreachable" } },
  { name: "a body this build cannot read", fetch: { kind: "ok", body: { day: "nope" } } },
];

function d4Statuses(): void {
  header("D4: every answer the server can give, and every one it cannot");

  for (const c of MESSAGE_CASES) {
    const s = dailyScreen(c.fetch);
    if (s.kind !== "message") continue;
    console.log(`  ${c.name.padEnd(34)} tone=${s.tone.padEnd(9)} action=${s.action?.kind ?? "-"}`);
    console.log(`    ${s.badge}: ${s.lines[0] ?? ""}`);
  }

  checkAll(
    "not one of them produces a report screen",
    MESSAGE_CASES,
    (c) => dailyScreen(c.fetch).kind === "message",
    (c) => c.name,
  );
  checkAll(
    "every one has a badge and at least one line — never a blank screen",
    MESSAGE_CASES,
    (c) => {
      const s = dailyScreen(c.fetch);
      return s.kind === "message" && s.badge.trim().length > 0 &&
        s.lines.length > 0 && s.lines.every((l) => l.trim().length > 0);
    },
    (c) => c.name,
  );
  checkAll(
    "none of them leaks a JSON body, a UUID or an English field name",
    MESSAGE_CASES,
    (c) => leaks(allText(dailyScreen(c.fetch))).length === 0,
    (c) => `${c.name} leaked ${leaks(allText(dailyScreen(c.fetch))).join(", ")}`,
  );
  /*
   * NO STATUS CODE REACHES ANY OF THEM. These screens carry no counts and no
   * money, so anything shaped like a 4xx/5xx on one of them came from the number
   * the client was classifying on — including 418, which no hand-written list
   * would have contained.
   */
  checkAll(
    "and no status code of any kind reaches the screen — not even the unforeseen one",
    MESSAGE_CASES,
    (c) => !STATUS_SHAPED(allText(dailyScreen(c.fetch))),
    (c) => `${c.name} -> ${allText(dailyScreen(c.fetch))}`,
  );
  checkAll(
    "none of them says ผิดพลาด — nothing here is broken",
    MESSAGE_CASES,
    (c) => !allText(dailyScreen(c.fetch)).includes(ERROR_WORD),
    (c) => c.name,
  );
  checkAll(
    "none of them sends anyone to support, who cannot help with any of these",
    MESSAGE_CASES,
    (c) => !allText(dailyScreen(c.fetch)).includes(SUPPORT),
    (c) => c.name,
  );

  /*
   * THE SIGN-IN BUTTON APPEARS IF AND ONLY IF A SIGN-IN WOULD FIX IT. That is
   * the one line separating a 401 from the 403 it is otherwise closest to: the
   * same account signing back in returns with the same role, which is a loop with
   * a person in it. lessons/403-is-about-what-the-caller-may-do.md.
   */
  const SIGN_IN_FIXES: readonly string[] = ["no token on this device", "401 session expired"];
  checkAll(
    "the sign-in button appears exactly where a sign-in is the fix",
    MESSAGE_CASES,
    (c) => {
      const s = dailyScreen(c.fetch);
      return (s.kind === "message" && s.action?.kind === "sign_in") === SIGN_IN_FIXES.includes(c.name);
    },
    (c) => c.name,
  );

  /* ------------------------------------------------------------- D5 ---- */
  header("D5: a 403 renders calmly — the last phase's classification, on a new screen");

  const forbidden = MESSAGE_CASES.filter((c) => c.name.startsWith("403"));
  for (const c of forbidden) {
    const s = dailyScreen(c.fetch);
    if (s.kind !== "message") continue;
    console.log(`  ${c.name}`);
    console.log(`    badge: ${s.badge}`);
    for (const l of s.lines) console.log(`    ${l}`);
  }

  checkAll(
    "all three land in the forbidden tone, not in an error and not in a session",
    forbidden,
    (c) => {
      const s = dailyScreen(c.fetch);
      return s.kind === "message" && s.tone === "forbidden";
    },
    (c) => c.name,
  );
  checkAll(
    "each names the shop OWNER — the only person who can change a role",
    forbidden,
    (c) => allText(dailyScreen(c.fetch)).includes(THE_OWNER),
    (c) => `${c.name} -> ${allText(dailyScreen(c.fetch))}`,
  );
  checkAll(
    "none says สำนักงาน — the office sets prices and grades, not permissions",
    forbidden,
    (c) => !allText(dailyScreen(c.fetch)).includes("สำนักงาน"),
    (c) => c.name,
  );
  checkAll(
    "none invites a sign-in, and none offers a button at all",
    forbidden,
    (c) => {
      const s = dailyScreen(c.fetch);
      return s.kind === "message" && !allText(s).includes(SIGN_IN) && s.action === null;
    },
    (c) => c.name,
  );
  /*
   * THE DEFECT THIS PHASE PREVENTED. forbiddenReason's wording was written when
   * voiding was the only admin-only action a phone could reach, so the code
   * `admin_required` — which the server answers for EVERY admin path — carried
   * "บัญชีนี้ไม่มีสิทธิ์ยกเลิกบิล ระบบจึงยังไม่ได้ยกเลิกบิลใบนี้". On this screen
   * nothing is being cancelled, and that sentence would send an owner looking for
   * a bill that does not exist. The action is now a required argument.
   */
  checkAll(
    "and NONE of them mentions cancelling a bill — nothing here was being cancelled",
    forbidden,
    (c) => !allText(dailyScreen(c.fetch)).includes("ยกเลิก"),
    (c) => `${c.name} -> ${allText(dailyScreen(c.fetch))}`,
  );
  const known = dailyScreen({ kind: "http", status: 403, code: "admin_required" });
  check(
    "the known code says what was actually refused: seeing the day's money",
    known.kind === "message" && known.lines.join(" ").includes("ยอดเงินประจำวัน"),
    known.kind === "message" ? known.lines.join(" ") : "",
  );
  const unknownCode = dailyScreen({ kind: "http", status: 403, code: "shop_suspended" });
  check(
    "an unrecognised code is still a readable sentence, with the code named ALONE",
    unknownCode.kind === "message" &&
      unknownCode.lines.some((l) => l.includes("รหัส: shop_suspended")) &&
      unknownCode.lines[0] !== undefined && !unknownCode.lines[0].includes("shop_suspended"),
    unknownCode.kind === "message" ? unknownCode.lines.join(" | ") : "",
  );
}

/* ==========================================================================
 * D6 — AN UNREACHABLE SERVER IS NOT A ZERO DAY
 * ========================================================================== */

/**
 * The two screens that must never be mistaken for each other, and the mistake is
 * expensive in both directions:
 *
 *   an outage read as a zero day  -> the owner concludes the shop took nothing,
 *                                    or that the day's cash is unaccounted for;
 *   a zero day read as an outage  -> the owner keeps waiting for a number that
 *                                    has already arrived and is correct.
 *
 * The guarantee is structural rather than careful: a message screen has NO money
 * field, so there is nothing on it a number could be rendered from.
 */
function d6OfflineVsZero(): void {
  header("D6: an unreachable server and a day with no takings, side by side");

  const offline = dailyScreen({ kind: "unreachable" });
  const zero = asReport(
    dailyScreen(ok({
      active_bill_count: 0, active_total: "0.00", lines: [], bills_total: 0,
      first_doc_no: null, last_doc_no: null,
    })),
  );

  console.log("  UNREACHABLE:");
  if (offline.kind === "message") {
    console.log(`    ${offline.badge}`);
    for (const l of offline.lines) console.log(`    ${l}`);
    console.log(`    button: ${offline.action?.label ?? "(none)"}`);
  }
  console.log("  ZERO DAY:");
  console.log(`    ${zero.headline.caption}: ${zero.headline.amount} ${zero.headline.unit}`);
  console.log(`    ${zero.headline.countLine}`);

  check(
    "the unreachable screen shows NO money field — the leak is unrepresentable",
    offline.kind === "message",
    "a message screen has no amount to render",
  );
  check(
    "it contains no 0.00 and no digits that could be read as a total",
    !allText(offline).includes("0.00") && !/\d+\.\d\d/.test(allText(offline)),
    allText(offline),
  );
  check(
    "it says explicitly that this does NOT mean the day had no takings",
    allText(offline).includes("ไม่ได้แปลว่าวันนี้ไม่มีการซื้อขาย"),
    allText(offline),
  );
  check(
    "it says why this screen needs the server: it sums every device, not this one",
    allText(offline).includes("ทุกเครื่อง"),
  );
  check(
    "it offers a retry, because trying again is the whole of what can be done",
    offline.kind === "message" && offline.action?.kind === "retry",
  );
  check(
    "the zero day, by contrast, shows a real 0.00 from the server",
    zero.headline.amount === "0.00",
  );
  check(
    "...and states positively that no bill has ARRIVED yet — not that none exists",
    zero.headline.countLine.includes("ส่งถึงระบบ"),
    zero.headline.countLine,
  );
  check(
    "the two screens share no sentence at all",
    zero.headline.countLine !== "" && !allText(offline).includes(zero.headline.countLine),
  );

  /*
   * The 5xx neighbour: the server ANSWERED but unusably. Different sentence from
   * "cannot reach the server", same absolute rule about numbers.
   */
  const serverErr = dailyScreen({ kind: "http", status: 500, code: null });
  check(
    "a 5xx also shows no number, and does not claim the network is down",
    serverErr.kind === "message" && !/\d+\.\d\d/.test(allText(serverErr)) &&
      !allText(serverErr).includes("ทุกเครื่อง"),
    allText(serverErr),
  );
}

/* ==========================================================================
 * D7 — EVERY INSTANT THROUGH shopTime; DEVICE TIME UNREPRESENTABLE
 * ========================================================================== */

function d7Time(cases: readonly Named[]): void {
  header("D7: shop time everywhere, device time nowhere");

  const s = asReport(dailyScreen(ok({
    voided_bill_count: 1, voided_total: "220.00", voided: [rawVoid()],
  })));

  console.log(`  day label   ${s.dayLabel}   (server also said 01/08/2569)`);
  console.log(`  as of       ${s.asOf}`);
  console.log(`  a bill      ${s.bills.rows[0]?.time ?? "-"}`);
  console.log(`  a void      ${s.voided.rows[0]?.when ?? "-"}`);

  check(
    "the day label is DD/MM/BBBB, computed on the CLIENT through shopDate",
    s.dayLabel === shopDate(STARTS) && /^\d{2}\/\d{2}\/25\d{2}$/.test(s.dayLabel),
    s.dayLabel,
  );
  /*
   * AND IT AGREES WITH THE SERVER'S OWN LABEL — which is the reason to compute it
   * rather than echo `date_be`. The two come from two independent authorities
   * (shopTime.beYear here, bills._be_year there) and this is the only place they
   * are ever compared. Echoing the server's would make disagreement impossible to
   * detect, which is not the same as impossible.
   * lessons/be-year-comes-after-the-timezone.md.
   */
  const serverLabel = (
    (rawBody() as { day: { date_be: string } }).day
  ).date_be;
  check(
    "...and it agrees with the server's independently-derived date_be",
    s.dayLabel === serverLabel,
    `client ${s.dayLabel} / server ${serverLabel} — two BE-year authorities, one answer`,
  );
  check(
    "the as-of clock is shopTime of the server's snapshot instant",
    s.asOf.includes(shopTime(AS_OF)) && shopTime(AS_OF) === "17:32",
    `${s.asOf} vs shopTime=${shopTime(AS_OF)}`,
  );
  check(
    "a bill's time is shopTime of its ARRIVAL instant",
    s.bills.rows[0]?.time === shopTime("2026-08-01T09:14:00.100200+07:00"),
    String(s.bills.rows[0]?.time),
  );

  /*
   * MICROSECONDS. Postgres timestamptz is microsecond resolution and _shop_iso
   * emits all six digits, while the ECMAScript Date Time String Format specifies
   * exactly three. V8 truncates; Hermes is UNVERIFIED, in the same family as Intl
   * with a timeZone option. shopWallClock now trims before parsing, so the result
   * does not depend on an implementation-defined extension.
   */
  check(
    "a six-digit microsecond stamp parses, and to the same instant as three digits",
    shopTime(AS_OF) === shopTime("2026-08-01T17:32:11.123+07:00") && shopTime(AS_OF) === "17:32",
    `${shopTime(AS_OF)} / ${shopTime("2026-08-01T17:32:11.123+07:00")}`,
  );
  check(
    "...and no rendered time is the '—' that an unparseable instant produces",
    s.bills.rows.every((r) => r.time !== "—") && !s.asOf.includes("—"),
  );

  /*
   * THE DISPROOF for the whole family. A naive slice of the ISO string is what
   * this module exists to prevent — and on THIS endpoint it happens to be right,
   * because reports.py returns shop-offset ISO precisely so a naive client gets
   * the shop clock rather than UTC. That makes the slice a WEAK disproof here, so
   * the strong one is against a UTC-shaped instant, which is what GET /bills
   * returns and what the next screen to be built will meet.
   */
  const utcInstant = "2026-08-01T08:16:00.000Z";
  const naiveSlice = utcInstant.slice(11, 16);
  console.log(`  a UTC instant ${utcInstant}`);
  console.log(`    naive slice: ${naiveSlice}   shopTime: ${shopTime(utcInstant)}`);
  check(
    "a UTC instant sliced reads 08:16; through shopTime it reads 15:16",
    naiveSlice === "08:16" && shopTime(utcInstant) === "15:16",
    "the 2c-5 defect, still disproven",
  );

  /* Nothing anywhere renders a raw instant. */
  checkAll(
    "no screen contains an ISO fragment — no offset, no 'T' separator",
    cases,
    (c) => {
      const t = allText(dailyScreen(c.fetch));
      return !t.includes("+07:00") && !t.includes("T00:00") && !t.includes("T09:14");
    },
    (c) => c.name,
  );

  /*
   * DEVICE TIME IS NOT MERELY ABSENT, IT IS UNREPRESENTABLE. The endpoint does
   * not return device_created_at at all, so there is no field on this screen it
   * could come from. Proven by putting one in the body and finding it nowhere:
   * readDailyBody constructs its result field by field and never spreads the raw
   * object, so an unknown key cannot ride through.
   */
  const withDeviceTime = rawBody() as Record<string, unknown>;
  const lines = (withDeviceTime["bills"] as Record<string, unknown>)["lines"] as Record<string, unknown>[];
  lines[0]!["device_created_at"] = "2026-07-31T23:59:58.000000+07:00";
  const parsed = readDailyBody(withDeviceTime);
  check(
    "a device_created_at planted in the body is not carried into the parsed row",
    parsed !== null && !Object.prototype.hasOwnProperty.call(parsed.lines[0] ?? {}, "device_created_at"),
    "readDailyBody builds each row field by field; it never spreads the wire object",
  );
  check(
    "...and it appears nowhere on the rendered screen",
    !allText(dailyScreen({ kind: "ok", body: withDeviceTime })).includes("23:59"),
    "a bill weighed 23:59:58 yesterday still renders under its ARRIVAL time",
  );
}

/* ==========================================================================
 * D8 — voids: the only place a reversal of real money becomes visible
 * ========================================================================== */

function d8Voids(): void {
  header("D8: voided bills — doc_no, amount, reason, who");

  const s = asReport(dailyScreen(ok({
    voided_bill_count: 1, voided_total: "220.00",
    voided: [rawVoid()], voids_applied: [rawVoid()],
  })));
  const row = s.voided.rows[0];
  console.log(`  ${s.voided.heading}: ${s.voided.totalLine ?? ""}`);
  console.log(`    ${row?.docNo} ${row?.amount} · ${row?.reason} · ${row?.who} · ${row?.when}`);

  check("the doc_no is shown", row?.docNo === "B-2569-231", String(row?.docNo));
  check("the amount is the server's string", row?.amount === "220.00", String(row?.amount));
  check("the reason is shown as the owner typed it", row?.reason === "ชั่งผิด", String(row?.reason));
  check("who did it is a PERSON, never an id", row?.who === "สมศรี เจ้าของร้าน", String(row?.who));
  check("when, through shopTime", row?.when.includes("01/08/2569") === true, String(row?.when));
  check(
    "the section says this money is NOT in the total above",
    s.voided.intro.includes("ไม่ได้ถูกนับรวม"),
    s.voided.intro,
  );

  /*
   * NOT LISTED TWICE. A bill received today and voided today is in BOTH server
   * lists (`voided` = received this day and now void; `voids_applied` = voided
   * this day). Rendering both would show one reversal as two, and an owner
   * reconciling would double-count a correction to real money.
   */
  check(
    "a bill received today and voided today appears exactly once",
    s.voided.rows.length === 1 && s.earlierVoids.rows.length === 0,
    `${String(s.voided.rows.length)} + ${String(s.earlierVoids.rows.length)}`,
  );

  /*
   * THE UNWATCHED VOID. A bill from last Tuesday voided today is in NO day anyone
   * opens: not today's (it was not received today) and not Tuesday's (nobody
   * reopens a closed day). It gets its own section, and that section is why the
   * endpoint answers two void questions instead of one.
   */
  const earlier = asReport(dailyScreen(ok({
    voids_applied: [
      rawVoid({
        doc_no: "B-2569-118", from_earlier_day: true,
        received_at: "2026-07-28T10:00:00.000000+07:00", reason: "ลูกค้าคืนของ",
      }),
    ],
  })));
  console.log(`  ${earlier.earlierVoids.heading}`);
  console.log(`    ${earlier.earlierVoids.rows[0]?.docNo} ${earlier.earlierVoids.rows[0]?.fromDayNote ?? ""}`);
  check(
    "a void applied today against an older bill gets its own section",
    earlier.earlierVoids.rows.length === 1 && earlier.voided.rows.length === 0,
  );
  check(
    "...and it names which day that bill belongs to, through shopDate",
    earlier.earlierVoids.rows[0]?.fromDayNote === `บิลของวันที่ ${shopDate("2026-07-28T10:00:00.000000+07:00")}`,
    String(earlier.earlierVoids.rows[0]?.fromDayNote),
  );
  check(
    "...and says why looking at it here is the only way to see it",
    earlier.earlierVoids.intro.includes("ไม่ปรากฏในยอดของวันไหน"),
    earlier.earlierVoids.intro,
  );

  /*
   * AN EMPTY VOID LIST IS A STATEMENT, NOT A BLANK. "No bills were cancelled
   * today" is a fact the owner came to check; silence there is indistinguishable
   * from a section that failed to load.
   */
  const clean = asReport(dailyScreen(ok()));
  check(
    "a day with no voids SAYS so, rather than showing nothing",
    clean.voided.emptyLine === "วันนี้ไม่มีบิลที่ถูกยกเลิก",
    String(clean.voided.emptyLine),
  );

  /*
   * THE CAPPED LIST. The server caps the void lists at 500 and flags them rather
   * than paging, because truncating the fraud-surveillance list is exactly the
   * wrong thing to truncate — a day that reaches the cap is itself the finding.
   * The count above the list is the whole day and the rows are what fitted, so
   * the screen must say the rows are short. Otherwise "รวม 500 ใบ" over a shorter
   * list is one more unreconcilable pair on a reconciling screen.
   */
  const capped = asReport(dailyScreen(ok({
    voided: [rawVoid()], voided_bill_count: 500, voided_total: "110000.00",
    voided_truncated: true,
  })));
  console.log(`  capped: ${String(capped.voided.totalLine)} / rows shown ${String(capped.voided.rows.length)}`);
  console.log(`    ${capped.voided.truncatedNote ?? "(nothing said!)"}`);
  check(
    "a capped void list says the rows are short, so the count above cannot mislead",
    capped.voided.truncatedNote !== null && capped.voided.truncatedNote.includes("ทั้งหมด"),
    String(capped.voided.truncatedNote),
  );
  check(
    "...and the count of 500 is a BILL COUNT on screen, never mistakable for a status",
    (capped.voided.totalLine ?? "").includes("500 ใบ"),
    String(capped.voided.totalLine),
  );
  check(
    "...while the earlier-day section is simply absent when empty, being the abnormal case",
    clean.earlierVoids.rows.length === 0 && clean.earlierVoids.emptyLine === null,
  );

  /* A void with nothing filled in still renders a complete row. */
  const bare = asReport(dailyScreen(ok({
    voided_bill_count: 1, voided_total: "220.00",
    voided: [rawVoid({ doc_no: null, reason: null, voided_by_name: null, voided_by_username: null, seller_name: null })],
  })));
  const bareRow = bare.voided.rows[0];
  check(
    "a void with no reason, no name and no doc_no still renders every field readably",
    bareRow !== undefined && [bareRow.docNo, bareRow.reason, bareRow.who, bareRow.seller]
      .every((f) => f.trim().length > 0 && !f.includes("null")),
    `${String(bareRow?.docNo)} / ${String(bareRow?.reason)} / ${String(bareRow?.who)}`,
  );
  check(
    "a missing name falls back to the username before giving up",
    (asReport(dailyScreen(ok({
      voided_bill_count: 1, voided: [rawVoid({ voided_by_name: null })],
    }))).voided.rows[0]?.who) === "admin",
  );
}

/* ==========================================================================
 * D9 — off-list, and the count that can outrun the page
 * ========================================================================== */

function d9OffList(): void {
  header("D9: off-list bills — the count, and WHICH");

  const s = asReport(dailyScreen(ok({
    off_list_bill_count: 2, off_list_line_count: 3, off_list_variance: "137.50",
    lines: [
      rawLine({ doc_no: "B-2569-228", off_list: true }),
      rawLine({ doc_no: "B-2569-229", off_list: true }),
      rawLine({ doc_no: "B-2569-230" }),
    ],
  })));
  console.log(`  ${s.offList.heading}: ${s.offList.summary}`);
  console.log(`    ${s.offList.varianceLine ?? ""}`);
  console.log(`    ${s.offList.docNos.join(", ")}`);

  check("the count is stated", s.offList.summary.includes("2 ใบ"), s.offList.summary);
  check(
    "the variance is the server's string, and says which direction is which",
    (s.offList.varianceLine ?? "").includes("137.50") && (s.offList.varianceLine ?? "").includes("บวกคือ"),
    String(s.offList.varianceLine),
  );
  check(
    "WHICH bills — by doc_no, and only the off-list ones",
    s.offList.docNos.length === 2 && s.offList.docNos.includes("B-2569-228") &&
      !s.offList.docNos.includes("B-2569-230"),
    s.offList.docNos.join(","),
  );
  check(
    "the bill rows carry the flag too, so it is findable in the list",
    s.bills.rows.filter((r) => r.offList).length === 2,
  );
  /*
   * IT DOES NOT ACCUSE. Paying off list is legitimate every day. What was missing
   * until now is that nobody could SEE it, and there is a real difference between
   * surfacing a number and alleging something about the person behind it.
   */
  check(
    "it says plainly that this is normal and not a finding against anyone",
    s.offList.explain.includes("เป็นเรื่องที่เกิดได้ตามปกติ") &&
      !s.offList.explain.includes(ERROR_WORD) && !s.offList.explain.includes("ตรวจสอบ"),
    s.offList.explain,
  );

  /*
   * THE COUNT IS THE WHOLE DAY AND THE NAMES ARE THIS PAGE, so on a truncated day
   * they genuinely disagree. A screen showing "8 ใบ" above five doc_nos with no
   * explanation is the unreconcilable answer that
   * lessons/a-report-is-many-reads-that-must-agree.md is about — this time
   * between two parts of one RESPONSE the owner is comparing by eye.
   */
  const short = asReport(dailyScreen(ok({
    off_list_bill_count: 8, off_list_line_count: 11, off_list_variance: "-42.00",
    bills_total: 300, bills_truncated: true,
    lines: [rawLine({ doc_no: "B-2569-228", off_list: true })],
  })));
  console.log(`  truncated day: ${short.offList.summary} but named ${String(short.offList.docNos.length)}`);
  console.log(`    ${short.offList.incompleteNote ?? "(nothing said!)"}`);
  check(
    "when the count outruns the page, the screen SAYS so rather than letting them disagree",
    (short.offList.incompleteNote ?? "").includes("1") && (short.offList.incompleteNote ?? "").includes("8"),
    String(short.offList.incompleteNote),
  );
  check(
    "and the bill list says the headline still counts every bill",
    (short.bills.moreNote ?? "").includes("ยอดด้านบนรวมครบ"),
    String(short.bills.moreNote),
  );
  check(
    "a day with no off-list bills says that positively",
    asReport(dailyScreen(ok())).offList.emptyLine === "ทุกบิลวันนี้จ่ายตรงราคาตามรายการ",
  );
}

/* ==========================================================================
 * D10 — picking a past day
 * ========================================================================== */

function d10DayStepping(): void {
  header("D10: stepping to an earlier day, bounded by the SERVER's today");

  const today = asReport(dailyScreen(ok()));
  console.log(`  on ${today.dayLabel}: back -> ${String(today.stepBackTo)}, forward -> ${String(today.stepForwardTo)}`);
  check("from today, stepping back offers the previous day", today.stepBackTo === "2026-07-31");
  check(
    "and stepping FORWARD is not offered at all",
    today.stepForwardTo === null,
    "the server refuses a future day 422; the client does not walk into it",
  );

  const past = asReport(dailyScreen(ok({
    date: "2026-07-30", date_be: "30/07/2569", is_today: false,
    starts_at: "2026-07-30T00:00:00+07:00", shop_today: DAY,
  })));
  console.log(`  on ${past.dayLabel}: back -> ${String(past.stepBackTo)}, forward -> ${String(past.stepForwardTo)}`);
  check("from a past day, both directions are available", past.stepBackTo === "2026-07-29" && past.stepForwardTo === "2026-07-31");
  check(
    "a past day SAYS it is not today, next to the number",
    past.pastDayNote !== null && past.pastDayNote.includes("ไม่ใช่ยอดของวันนี้") &&
      past.headline.caption.includes("30/07/2569"),
    `${String(past.pastDayNote)} / ${past.headline.caption}`,
  );

  /*
   * THE BOUND COMES FROM THE SERVER, NOT FROM THIS HANDSET. Both `day.date` and
   * `day.shop_today` are the server's, compared as ISO strings — sound because
   * ISO dates sort lexically. Nothing here asks the phone what day it is, which
   * is the whole reason a phone 14 h fast (measured, on this hardware) cannot
   * walk an owner into tomorrow.
   */
  const fastClock = asReport(dailyScreen(ok({ shop_today: DAY, date: DAY })));
  check(
    "the forward bound is the server's shop_today and nothing else",
    fastClock.stepForwardTo === null,
    "device clock is not consulted anywhere in this decision",
  );

  /* The month and year boundaries, where ±24h arithmetic would be wrong if it
   * were done on the label rather than on the instant. */
  const newYear = asReport(dailyScreen(ok({
    date: "2027-01-01", date_be: "01/01/2570", is_today: true,
    starts_at: "2027-01-01T00:00:00+07:00", shop_today: "2027-01-01",
    first_doc_no: "B-2570-1", last_doc_no: "B-2570-4",
  })));
  console.log(`  new year: ${newYear.dayLabel}, back -> ${String(newYear.stepBackTo)}`);
  check(
    "the พ.ศ. year rolls at Bangkok midnight, not at UTC midnight",
    newYear.dayLabel === "01/01/2570",
    newYear.dayLabel,
  );
  check("...and stepping back crosses into the previous year correctly", newYear.stepBackTo === "2026-12-31");
  /*
   * TWO DATE FORMATS, AND THEY MUST NEVER SWAP. The `?date=` parameter is
   * Gregorian ISO because that is the SERVER's contract; the label is พ.ศ.
   * DD/MM/BBBB because that is what a Thai owner reads, and because an
   * ISO-shaped `2570-01-01` invites being parsed as Gregorian — a year wrong by
   * 543 with no visible symptom. lessons/be-year-comes-after-the-timezone.md.
   */
  check(
    "the wire date is Gregorian ISO, the SCREEN date is พ.ศ. day-first — never swapped",
    /^\d{4}-\d{2}-\d{2}$/.test(newYear.stepBackTo ?? "") &&
      /^\d{2}\/\d{2}\/2570$/.test(newYear.dayLabel),
    `wire ${String(newYear.stepBackTo)} / screen ${newYear.dayLabel}`,
  );
  check(
    "...and no Gregorian year ever reaches the screen",
    !allText(newYear).includes("2027") && !allText(newYear).includes("2026"),
    "the label, the doc_no range and every timestamp are all shop-era",
  );

  /* And directly: previousShopDay/nextShopDay on the day object itself. */
  const day = {
    date: "2026-03-01", date_be: "01/03/2569", starts_at: "2026-03-01T00:00:00+07:00",
    is_today: false, requested: true, server_now: AS_OF, shop_today: DAY,
  };
  check("across a month boundary, backwards", previousShopDay(day) === "2026-02-28");
  check("across a month boundary, forwards", nextShopDay(day) === "2026-03-02");
}

/* ==========================================================================
 * D11 — the basis: the client refuses to vouch for a total it does not recognise
 * ========================================================================== */

function d11Basis(): void {
  header("D11: the day is counted on arrival time, and the client checks that");

  const good = asReport(dailyScreen(ok()));
  check(
    "the ordinary case warns about nothing",
    good.basisWarning === null,
    "aggregated_on = server_received_at",
  );

  /*
   * The response also ships ready-made Thai for this (`basis.consequence_th`), and
   * it is deliberately NOT rendered. Echoing it would print a confident sentence
   * about a total computed some other way; keying on the machine-readable field
   * beside it makes the client say it does not recognise the basis. Same rule as
   * reading a 403 off the STATUS and never off the body.
   */
  const wrong = asReport(dailyScreen(ok({ aggregated_on: "device_created_at" })));
  console.log(`  aggregated_on=device_created_at -> ${String(wrong.basisWarning)}`);
  check(
    "a server aggregating on anything else is FLAGGED, not silently believed",
    wrong.basisWarning !== null && wrong.basisWarning.includes(THE_OWNER),
    String(wrong.basisWarning),
  );
  check(
    "...and the warning does not leak the column name it saw",
    !allText(wrong).includes("device_created_at"),
    "operator-facing text names no database column",
  );
  check(
    "the boundary consequence is still shown — it is a fact about the design, not about this response",
    wrong.dayBoundary.includes("23:50"),
  );
}

/* ==========================================================================
 * D12 — the disproof: what a plausible first draft would have produced
 * ========================================================================== */

/**
 * Every assertion above is worthless unless something could have made it fail.
 * These are the four shortcuts a first version of this screen would obviously
 * take, each written out and each fed the same inputs.
 */
function d12Disproof(): void {
  header("D12: the disproof — four plausible drafts, and what each one shows");

  /* ---- 1. Money through a number formatter. */
  const huge = "99999999999999999.99";
  const naiveMoney = (s: string): string => Number(s).toFixed(2);
  console.log(`  money: server ${huge}`);
  console.log(`    a formatter: ${naiveMoney(huge)}`);
  console.log(`    this screen: ${asReport(dailyScreen(ok({ active_total: huge }))).headline.amount}`);
  check(
    "a toFixed(2) round trip DOES change the number — so D2 is not vacuous",
    naiveMoney(huge) !== huge,
    `${naiveMoney(huge)} !== ${huge}`,
  );
  check(
    "and '0.10' loses its trailing zero through the same formatter... ",
    Number("0.10").toString() === "0.1",
    "0.10 -> 0.1",
  );

  /* ---- 2. The understatement line as a footnote gated on the server's flag.
   *         This is the obvious first draft — the flag is right there in the
   *         response and reads like it was put there to be branched on. It looks
   *         correct forever, because today's server hardcodes `true`, and goes
   *         silent the day a future one computes it. */
  const real = asReport(dailyScreen(ok())).understatement;
  const gated = (understatementPossible: boolean): readonly string[] =>
    understatementPossible ? real : [];
  const serverClaimsComplete = asReport(dailyScreen(ok({ understatement_possible: false })));
  console.log(`  understatement, gated on the flag, server claiming completeness: ${String(gated(false).length)} line(s)`);
  console.log(`  understatement, this screen, same response:                     ${String(serverClaimsComplete.understatement.length)} line(s)`);
  check(
    "a flag-gated version WOULD go silent on that response",
    gated(false).length === 0 && gated(true).length >= 2,
  );
  check(
    "...and this screen does not, because it never reads the flag",
    serverClaimsComplete.understatement.length >= 2,
  );

  /* ---- 3. A 403 rendered through the void wording, which is what existed. */
  const voidWording = "บัญชีนี้ไม่มีสิทธิ์ยกเลิกบิล ระบบจึงยังไม่ได้ยกเลิกบิลใบนี้ — ต้องแจ้งเจ้าของร้าน";
  const nowSays = dailyScreen({ kind: "http", status: 403, code: "admin_required" });
  console.log(`  403 BEFORE (the only wording admin_required had): ${voidWording}`);
  console.log(`  403 AFTER:  ${nowSays.kind === "message" ? nowSays.lines.join(" ") : ""}`);
  check(
    "the pre-existing wording DID talk about cancelling a bill",
    voidWording.includes("ยกเลิกบิล"),
    "and nothing was being cancelled on this screen",
  );
  check(
    "the report's 403 does not, while keeping every rule the void one follows",
    nowSays.kind === "message" && !allText(nowSays).includes("ยกเลิก") &&
      allText(nowSays).includes(THE_OWNER) && !allText(nowSays).includes(SIGN_IN),
  );

  /* ---- 4. An outage rendered as a zero day, which is the default if a screen
   *         simply has a total field and nothing to put in it. */
  const naiveOffline = { total: "0.00", count: 0 };
  console.log(`  offline, a screen with a total field: ${naiveOffline.total} (${String(naiveOffline.count)} ใบ)`);
  const offlineNow = dailyScreen({ kind: "unreachable" });
  console.log(`  offline, this screen: ${offlineNow.kind === "message" ? offlineNow.badge : ""}`);
  check(
    "a screen with a total field would show 0.00 during an outage",
    naiveOffline.total === "0.00",
    "which reads as 'the shop took nothing today'",
  );
  check(
    "this one cannot: the offline outcome has no money field to render",
    offlineNow.kind === "message" && !allText(offlineNow).includes("0.00"),
  );
}

/* ---------------------------------------------------------------- main --- */

function main(): number {
  console.log("Phase 2d — the daily money view, as the owner reads it");
  console.log(`node ${process.version}`);

  const cases = d1Reports();
  d2Money(cases);
  d3Understatement(cases);
  d4Statuses();
  d6OfflineVsZero();
  d7Time(cases);
  d8Voids();
  d9OffList();
  d10DayStepping();
  d11Basis();
  d12Disproof();

  console.log("");
  console.log(
    `screens rendered: ${String(cases.length)} report shapes + ${String(MESSAGE_CASES.length)} non-report outcomes`,
  );
  console.log(failures === 0 ? "ALL DAILY VIEW CASES PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

const code = main();
console.log(`DAILY_EXIT=${code}`);
process.exitCode = code;
