/**
 * Phase 2c-7 — shop-timezone display, headless proof.
 *
 * The defect: the bill list sliced the stored ISO string
 * (`created_at.slice(11, 16)`), which prints the UTC clock verbatim. A load
 * weighed 15:16 in Bangkok displayed as 08:16 — exactly the UTC offset — and for
 * anything weighed before 07:00 the DATE was a day behind as well.
 *
 * What is proven here:
 *   T1  the three reported instants render as the yard actually saw them
 *   T2  the midnight boundary — a Bangkok date that is still YESTERDAY in UTC
 *   T3  independence from the process/device timezone (the whole policy)
 *   T4  the year boundary, which is what makes doc_no's BE year a legal matter
 *   T5  one code path: the status strip's formatter IS the list's formatter
 *   T6  a bad value degrades visibly instead of rendering NaN
 *
 * T3 is the load-bearing one. This file is run TWICE by the verification step,
 * under TZ=Asia/Bangkok and TZ=UTC, and must produce identical output. A helper
 * that reads the device clock passes under one and fails under the other.
 */
import { shopDate, shopDateTime, shopTime, SHOP_TIMEZONE_NAME } from "../time/shopTime.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(text: string): void {
  console.log(`\n=== ${text} ===`);
}

/**
 * Build the UTC instant for a Bangkok wall-clock reading, INDEPENDENTLY of the
 * code under test — an explicit "+07:00" offset parsed by the runtime. If the
 * expectation were computed with the same helper being tested, the case would
 * agree with itself no matter how wrong it was.
 */
const atBangkok = (wall: string): string => new Date(`${wall}+07:00`).toISOString();

function main(): number {
  console.log("Phase 2c-7 — shop-timezone display, headless proof");
  console.log(
    `process TZ=${process.env.TZ ?? "(unset)"}  ` +
      `resolved=${Intl.DateTimeFormat().resolvedOptions().timeZone}  ` +
      `shop=${SHOP_TIMEZONE_NAME}`,
  );

  /* ------------------------------------------------------------------ T1 -- */
  header("T1: the three instants reported from the device render as the yard saw them");
  const reported: [string, string][] = [
    ["2026-07-26T15:16:00", "15:16"],
    ["2026-07-26T15:19:00", "15:19"],
    ["2026-07-26T15:20:00", "15:20"],
  ];
  for (const [wall, expect] of reported) {
    const iso = atBangkok(wall);
    const got = shopTime(iso);
    check(
      `weighed ${wall.slice(11)} Bangkok displays ${expect}`,
      got === expect,
      `stored ${iso} -> "${got}" (the old slice(11,16) gave "${iso.slice(11, 16)}")`,
    );
  }

  /* ------------------------------------------------------------------ T2 -- */
  header("T2: the midnight boundary — Bangkok date that is still YESTERDAY in UTC");
  const boundary: [string, string, string][] = [
    // Bangkok wall clock          expected date   expected time
    ["2026-07-27T00:30:00", "2026-07-27", "00:30"],
    ["2026-07-27T06:59:00", "2026-07-27", "06:59"],
    ["2026-07-27T07:00:00", "2026-07-27", "07:00"],
    ["2026-07-26T23:59:00", "2026-07-26", "23:59"],
  ];
  for (const [wall, expDate, expTime] of boundary) {
    const iso = atBangkok(wall);
    const gotDate = shopDate(iso);
    const gotTime = shopTime(iso);
    const utcDate = iso.slice(0, 10);
    check(
      `${wall.replace("T", " ")} Bangkok -> ${expDate} ${expTime}`,
      gotDate === expDate && gotTime === expTime,
      `stored ${iso} (UTC date ${utcDate}${utcDate !== expDate ? " ← A DIFFERENT DAY" : ""}) -> ${gotDate} ${gotTime}`,
    );
  }

  /* ------------------------------------------------------------------ T3 -- */
  header("T3: the answer does not depend on the device/process timezone");
  // These are the exact strings the other TZ run must also produce. Hardcoded on
  // purpose: comparing the two runs' outputs is done by running this file twice.
  const anchor = atBangkok("2026-07-27T00:30:00");
  check(
    "a fixed instant renders identically whatever TZ this process runs under",
    shopDateTime(anchor) === "2026-07-27 00:30",
    `TZ=${process.env.TZ ?? "(unset)"} -> "${shopDateTime(anchor)}" (must be "2026-07-27 00:30" under every TZ)`,
  );
  // The disproof: device-local formatting WOULD move with TZ. Show what the old
  // code path would have produced right here, so the difference is visible.
  const deviceLocal = `${String(new Date(anchor).getHours()).padStart(2, "0")}:${String(
    new Date(anchor).getMinutes(),
  ).padStart(2, "0")}`;
  console.log(
    `  for contrast, device-local getHours() here gives "${deviceLocal}" ` +
      `and raw UTC slice gives "${anchor.slice(11, 16)}" — both move or mislead; shopTime does not`,
  );

  /* ------------------------------------------------------------------ T4 -- */
  header("T4: the year boundary — what makes doc_no's BE year a legal matter");
  const ny = atBangkok("2027-01-01T00:30:00");
  check(
    "2027-01-01 00:30 Bangkok is 2026-12-31 in UTC, and displays as 2027-01-01",
    shopDate(ny) === "2027-01-01" && ny.slice(0, 10) === "2026-12-31",
    `stored ${ny} -> ${shopDate(ny)}`,
  );

  /* ------------------------------------------------------------------ T5 -- */
  header("T5: one code path — the status strip and the bill list agree by construction");
  const sample = atBangkok("2026-07-27T00:30:00");
  check(
    "shopDateTime ends with exactly what shopTime returns",
    shopDateTime(sample) === `${shopDate(sample)} ${shopTime(sample)}`,
    `"${shopDateTime(sample)}" = "${shopDate(sample)}" + "${shopTime(sample)}"`,
  );

  /* ------------------------------------------------------------------ T6 -- */
  header("T6: an unparseable timestamp degrades visibly, never as NaN");
  check(
    "garbage in gives a placeholder, not NaN:NaN",
    shopTime("not-a-date") === "—" && shopDate("") === "—" && shopDateTime("x") === "—",
    `-> "${shopTime("not-a-date")}" / "${shopDate("")}" / "${shopDateTime("x")}"`,
  );

  console.log("");
  if (failures > 0) {
    console.log(`FAILED — ${String(failures)} check(s)`);
    return 1;
  }
  console.log("  ALL CASES PASSED — display is shop-local, and independent of the handset.");
  return 0;
}

const code = main();
console.log(`TIME_EXIT=${String(code)}`);
process.exit(code);
