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
 */
import {
  billsQuery,
  LIST_CEILING,
  listCountText,
  mayVoid,
  readBillDetail,
  readBillList,
  voidReasonProblem,
} from "../shared/bills";
import { display, GROUP_SEPARATOR } from "../shared/money";
import { presetRange, shopDayLabel, shopToday } from "../shared/period";
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

  header("P a full page");
  const under = listCountText(LIST_CEILING - 1);
  const full = listCountText(LIST_CEILING);
  check("P1 199 rows is a count; 200 rows says 'may be more' and is flagged partial",
    LIST_CEILING === 200 && under.text === "199 บิล" && !under.partial && full.partial && full.text.includes("อาจมีมากกว่านี้"),
    JSON.stringify({ under, full }));
});
