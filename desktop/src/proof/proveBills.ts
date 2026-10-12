/**
 * THE BILLS SCREEN'S PURE PARTS (B3).
 *
 *   npm run prove:bills
 *
 *   M1 money/weight grouping matches the phone's rule (mobile/src/money/format.ts) over the same
 *      inputs, and never changes a digit (stripping the separators gives the input back)
 *   T1 shopToday is the SHOP's day: 17:30 UTC on 12 Oct is already 13 Oct in the shop
 *   T2 the presets' ranges, and a shop-day label in the Buddhist era that comes from shop-time
 *   Q1 the list query carries the range, the seller and include_voided only when set
 *   V1 a void needs a reason a person can read: empty and spaces are refused, words are not
 *   R1 the readers refuse a malformed answer instead of rendering a guess
 *   P1 a full page (the route's ceiling) is never shown as the range's count
 *   M2 the desktop's grouping equals the PHONE's own function (mobile/src/money/format.ts, imported)
 *   K1 a reversed or incomplete range is refused before any request, with its sentence
 *   H1 the shell's top line: only an unreachable or outdated server is shown there; a 403/404/422
 *      the server answered leaves it alone (the screen words those)
 *   R2 a detail without paid_amount reads as MISSING (null), never as 0.00
 *   E1 entering a date: `12/10/2569` is the shop day 2026-10-12; a Christian-era year, an impossible
 *      day and an ISO string are each refused with their sentence; the calendar's month title is
 *      Thai and Buddhist-era, and its grid starts October 2026 on a Thursday
 */
import {
  billsQuery,
  LIST_CEILING,
  RANGE_TEXT,
  rangeProblem,
  listCountText,
  mayVoid,
  readBillDetail,
  readBillList,
  voidReasonProblem,
} from "../shared/bills";
import { display as phoneDisplay } from "../../../mobile/src/money/format";
import { display, GROUP_SEPARATOR } from "../shared/money";
import { SESSION_TEXT, shellNoticeFor } from "../shared/session";
import { DATE_ENTRY_TEXT, monthGrid, monthTitle, parseShopDay, presetRange, shopDayLabel, shopToday } from "../shared/period";
import { check, finish, header } from "./harness";

void finish("PROVE_BILLS", async () => {
  header("M1 money for the eye");
  // Expected outputs restated by hand from the phone's rule (a checker must not share the code).
  const table: [string, string][] = [
    ["0.00", "0.00"], ["999.99", "999.99"], ["1000.00", "1,000.00"], ["128400.00", "128,400.00"],
    ["1234567.89", "1,234,567.89"], ["-1500.50", "-1,500.50"], ["8420.000", "8,420.000"], ["12", "12"],
  ];
  const bad = table.filter(([i, o]) => display(i) !== o);
  check("M1 grouping matches the phone's rule on every input", bad.length === 0, JSON.stringify(bad.map(([i]) => [i, display(i)])));
  check("M1 no digit changes: stripping separators returns the input",
    table.every(([i]) => display(i).split(GROUP_SEPARATOR).join("") === i));
  const inputs = [...table.map(([i]) => i), "100", "1000000", "-0.50", "12345678901234.567"];
  const differ = inputs.filter((i) => display(i) !== phoneDisplay(i));
  check("M2 the desktop's display equals the phone's display over every input", differ.length === 0,
    JSON.stringify(differ.map((i) => [i, display(i), phoneDisplay(i)])));

  header("T shop days");
  check("T1 17:30 UTC on 2026-10-12 is 2026-10-13 in the shop; 16:59 UTC is still the 12th",
    shopToday(new Date("2026-10-12T17:30:00Z")) === "2026-10-13" && shopToday(new Date("2026-10-12T16:59:00Z")) === "2026-10-12");
  const now = new Date("2026-10-12T05:00:00Z");
  const week = presetRange("week", now);
  const yday = presetRange("yesterday", now);
  check("T2 presets: yesterday is one day, the week ends today and spans 7 days",
    yday.from === "2026-10-11" && yday.to === "2026-10-11" && week.from === "2026-10-06" && week.to === "2026-10-12",
    JSON.stringify({ yday, week }));
  check("T2 the label is day/month/Buddhist year", shopDayLabel("2026-10-12") === "12/10/2569", shopDayLabel("2026-10-12"));

  header("Q the list query");
  const q1 = billsQuery({ from: "2026-10-11", to: "2026-10-12", sellerId: null, includeVoided: false });
  const q2 = billsQuery({ from: "2026-10-11", to: "2026-10-12", sellerId: "s-1", includeVoided: true });
  check("Q1 range always; seller and include_voided only when set",
    q1 === "/bills?from_date=2026-10-11&to_date=2026-10-12&limit=200"
      && q2 === "/bills?from_date=2026-10-11&to_date=2026-10-12&limit=200&seller_id=s-1&include_voided=true", `${q1} | ${q2}`);

  header("V the void rule");
  check("V1 empty and spaces refused with the sentence; a real reason passes",
    voidReasonProblem("") === "ต้องระบุเหตุผลที่ยกเลิกบิล" && voidReasonProblem("   ") === "ต้องระบุเหตุผลที่ยกเลิกบิล"
      && voidReasonProblem("ชั่งผิด") === null);
  check("V1 the void control shows only for a holder of bills.void", mayVoid(["bills.void"]) && !mayVoid(["bills.read"]));

  header("R the readers");
  check("R1 a list without `bills`, or with a row missing its total, is refused",
    readBillList({}) === null && readBillList({ bills: [{ id: "x" }] }) === null
      && readBillList({ bills: [{ id: "x", total_amount: "1.00", status: "voided" }] })?.[0]?.status === "voided");
  check("R1 a detail without items is refused", readBillDetail({ id: "x", total_amount: "1.00" }) === null);

  header("K the range");
  check("K1 reversed -> its sentence; an emptied field -> its sentence; a real range -> null",
    rangeProblem({ from: "2026-10-12", to: "2026-10-05" }) === RANGE_TEXT.reversed
      && rangeProblem({ from: "", to: "2026-10-05" }) === RANGE_TEXT.incomplete
      && rangeProblem({ from: "2026-10-05", to: "2026-10-05" }) === null);

  header("E entering a date");
  const e = (t: string) => JSON.stringify(parseShopDay(t));
  check("E1 12/10/2569 -> 2026-10-12, 1.2.2569 -> 2026-02-01; 12/10/2026, 31/02/2569, 2026-10-12 refused with their sentences",
    e("12/10/2569") === JSON.stringify({ wire: "2026-10-12" }) && e("1.2.2569") === JSON.stringify({ wire: "2026-02-01" })
      && e("12/10/2026") === JSON.stringify({ problem: DATE_ENTRY_TEXT.gregorian })
      && e("31/02/2569") === JSON.stringify({ problem: DATE_ENTRY_TEXT.noSuchDay })
      && e("2026-10-12") === JSON.stringify({ problem: DATE_ENTRY_TEXT.shape }),
    [e("12/10/2569"), e("12/10/2026"), e("31/02/2569"), e("2026-10-12")].join(" "));
  const grid = monthGrid("2026-10-12");
  check("E1 the calendar: 'ตุลาคม 2569'; 1 Oct 2026 under Thursday (4 blanks); 31 days",
    monthTitle("2026-10-12") === "ตุลาคม 2569" && grid[0]?.slice(0, 4).every((c) => c === null) === true
      && grid[0]?.[4] === "2026-10-01" && grid.flat().filter((c) => c !== null).length === 31, monthTitle("2026-10-12"));

  header("H the shell's line");
  const h = (k: Parameters<typeof shellNoticeFor>[0]) => JSON.stringify(shellNoticeFor(k));
  check("H1 ok clears; unavailable and outdated show their sentences; forbidden, invalid, not_found leave it",
    h("ok") === JSON.stringify({ kind: "clear" })
      && h("unavailable") === JSON.stringify({ kind: "show", text: SESSION_TEXT.offline })
      && h("outdated") === JSON.stringify({ kind: "show", text: SESSION_TEXT.outdated })
      && ["forbidden", "invalid", "not_found", "unauthorized"].every((k) => h(k as Parameters<typeof shellNoticeFor>[0]) === JSON.stringify({ kind: "leave" })));

  header("R2 a missing paid amount");
  const noPaid = readBillDetail({ id: "x", total_amount: "1.00", items: [] });
  check("R2 a detail without paid_amount reads paid_amount null, not 0.00", noPaid !== null && noPaid.paid_amount === null,
    JSON.stringify(noPaid?.paid_amount));

  header("P a full page");
  const under = listCountText(LIST_CEILING - 1);
  const full = listCountText(LIST_CEILING);
  check("P1 199 rows is a count; 200 rows says 'may be more' and is flagged partial",
    LIST_CEILING === 200 && under.text === "199 บิล" && !under.partial && full.partial && full.text.includes("อาจมีมากกว่านี้"),
    JSON.stringify({ under, full }));
});
