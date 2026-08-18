/**
 * Phase 2c-7 / 2c-8 — shop-timezone display and Buddhist-era dates, headless proof.
 *
 * 2c-7's defect: the bill list sliced the stored ISO string
 * (`created_at.slice(11, 16)`), which prints the UTC clock verbatim. A load
 * weighed 15:16 in Bangkok displayed as 08:16 — exactly the UTC offset — and for
 * anything weighed before 07:00 the DATE was a day behind as well.
 *
 * 2c-8's defect: the date was Gregorian. A card read `2026-07-26` directly
 * beneath `B-2569-105`, so the card contradicted itself about which business
 * year the load belonged to. CLAUDE.md specifies พ.ศ. in the UI.
 *
 * What is proven here:
 *   T1   the three reported instants render as the yard actually saw them
 *   T2   the midnight boundary — a Bangkok date that is still YESTERDAY in UTC
 *   T3   independence from the process/device timezone (the whole policy)
 *   T4   the year boundary, which is what makes doc_no's BE year a legal matter
 *   T5   one code path: the status strip's formatter IS the list's formatter
 *   T6   a bad value degrades visibly instead of rendering NaN
 *   T7   the reported card renders in the chosen BE format
 *   T8   ORDER: shop time first, then +543 — with the wrong order's output shown
 *   T9   the UI's BE year and the server's be_year in doc_no AGREE
 *   T10  negative: no ค.ศ. year survives anywhere, and no 2-digit year
 *
 * T3 is the load-bearing one for the timezone. This file is run TWICE by the
 * verification step, under TZ=Asia/Bangkok and TZ=UTC, and must produce
 * identical output. A helper that reads the device clock passes under one and
 * fails under the other.
 *
 * T8 is the load-bearing one for the era. A +543 that happens before the
 * timezone conversion is right for most of the day, so it cannot be proven by
 * spot-checking an afternoon — it has to be shown wrong at the boundary, and
 * shown to be indistinguishable away from it.
 */
import {
  BE_YEAR_OFFSET,
  shopBEYear,
  shopDate,
  shopDateTime,
  shopTime,
  SHOP_TIMEZONE_NAME,
} from "@recycle/shop-time";

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

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * THE WRONG ORDER, implemented so it can be shown rather than asserted about.
 *
 * "+543 before converting" means: take the year the instant already has — its
 * UTC year — add 543, and render. There is no "and convert afterwards", because
 * once 543 has been added the value is no longer an instant and no timezone can
 * be applied to it. That is precisely why the order is not a matter of taste.
 * Slicing the ISO string and adding 543 to `slice(0, 4)` collapses to this same
 * function.
 */
const beDateWrongOrder = (iso: string): string => {
  const d = new Date(iso);
  return `${pad2(d.getUTCDate())}/${pad2(d.getUTCMonth() + 1)}/${String(
    d.getUTCFullYear() + BE_YEAR_OFFSET,
  )}`;
};

/** The date as 2c-7 left it: shop-local, but Gregorian. The reported symptom. */
const gregorianYearOf = (iso: string): number =>
  new Date(new Date(iso).getTime() + 7 * 60 * 60_000).getUTCFullYear();

/**
 * The BE year the SERVER stamped, read back out of doc_no.
 * Mirrors `doc_no = f"B-{be_year}-{seq}"` in server/app/bills.py.
 */
const beYearInDocNo = (docNo: string): number | null => {
  const m = /^B-(\d{4})-\d+$/.exec(docNo);
  const y = m?.[1];
  return y === undefined ? null : Number(y);
};

function main(): number {
  console.log("Phase 2c-7/2c-8 — shop-timezone + Buddhist-era display, headless proof");
  console.log(
    `process TZ=${process.env.TZ ?? "(unset)"}  ` +
      `resolved=${Intl.DateTimeFormat().resolvedOptions().timeZone}  ` +
      `shop=${SHOP_TIMEZONE_NAME}  BE offset=+${String(BE_YEAR_OFFSET)}`,
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
    // Bangkok wall clock          expected BE date  expected time
    ["2026-07-27T00:30:00", "27/07/2569", "00:30"],
    ["2026-07-27T06:59:00", "27/07/2569", "06:59"],
    ["2026-07-27T07:00:00", "27/07/2569", "07:00"],
    ["2026-07-26T23:59:00", "26/07/2569", "23:59"],
  ];
  for (const [wall, expDate, expTime] of boundary) {
    const iso = atBangkok(wall);
    const gotDate = shopDate(iso);
    const gotTime = shopTime(iso);
    const utcDate = iso.slice(0, 10);
    const differentDay = utcDate !== `2026-${expDate.slice(3, 5)}-${expDate.slice(0, 2)}`;
    check(
      `${wall.replace("T", " ")} Bangkok -> ${expDate} ${expTime}`,
      gotDate === expDate && gotTime === expTime,
      `stored ${iso} (UTC date ${utcDate}${differentDay ? " ← A DIFFERENT DAY" : ""}) -> ${gotDate} ${gotTime}`,
    );
  }

  /* ------------------------------------------------------------------ T3 -- */
  header("T3: the answer does not depend on the device/process timezone");
  // These are the exact strings the other TZ run must also produce. Hardcoded on
  // purpose: comparing the two runs' outputs is done by running this file twice.
  const anchor = atBangkok("2026-07-27T00:30:00");
  check(
    "a fixed instant renders identically whatever TZ this process runs under",
    shopDateTime(anchor) === "27/07/2569 00:30",
    `TZ=${process.env.TZ ?? "(unset)"} -> "${shopDateTime(anchor)}" (must be "27/07/2569 00:30" under every TZ)`,
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
    "2027-01-01 00:30 Bangkok is 2026-12-31 in UTC, and displays as 01/01/2570",
    shopDate(ny) === "01/01/2570" && ny.slice(0, 10) === "2026-12-31",
    `stored ${ny} -> ${shopDate(ny)}`,
  );
  check(
    "shopBEYear agrees with the year inside the formatted date (one year source)",
    shopBEYear(ny) === 2570 && shopDate(ny).endsWith(String(shopBEYear(ny))),
    `shopBEYear=${String(shopBEYear(ny))} date="${shopDate(ny)}"`,
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
  check(
    "shopBEYear returns null rather than NaN for garbage",
    shopBEYear("not-a-date") === null && shopBEYear("") === null,
    `-> ${String(shopBEYear("not-a-date"))} / ${String(shopBEYear(""))}`,
  );

  /* ------------------------------------------------------------------ T7 -- */
  header("T7: the reported card — 2026-07-26 22:09 Bangkok, in the chosen BE format");
  const cardIso = atBangkok("2026-07-26T22:09:00");
  check(
    "22:09 on 26 July 2026 in Bangkok renders as 26/07/2569 22:09",
    shopDateTime(cardIso) === "26/07/2569 22:09",
    `stored ${cardIso} -> "${shopDateTime(cardIso)}" (was "2026-07-26 22:09")`,
  );
  check(
    "the year is four digits, DD/MM/BBBB, never abbreviated to 69",
    /^\d{2}\/\d{2}\/\d{4}$/.test(shopDate(cardIso)) && !shopDate(cardIso).endsWith("/69"),
    `"${shopDate(cardIso)}"`,
  );

  /* ------------------------------------------------------------------ T8 -- */
  header("T8: ORDER — convert to shop time FIRST, then +543 (the wrong order, shown)");
  console.log(
    "  wrong order = take the year the instant already has (its UTC year), add 543.\n" +
      "  There is no converting afterwards: 2569 is not an instant.",
  );
  // shouldDiffer=false is the "correct by luck" case and is asserted EQUAL on
  // purpose — that is the claim being proven, not an omission.
  const orderCases: [string, string, boolean, string][] = [
    // Bangkok wall clock       correct BE date  wrong order differs?  note
    ["2026-07-26T22:09:00", "26/07/2569", false, "an ordinary evening — the two AGREE, which is why spot-checks miss this"],
    ["2026-07-27T00:30:00", "27/07/2569", true, "00:30 Bangkok — still 26 July in UTC"],
    ["2026-07-27T06:59:00", "27/07/2569", true, "06:59 Bangkok — last minute UTC is a day behind"],
    ["2027-01-01T00:30:00", "01/01/2570", true, "new year — the YEAR itself is wrong"],
  ];
  for (const [wall, expDate, shouldDiffer, note] of orderCases) {
    const iso = atBangkok(wall);
    const right = shopDate(iso);
    const wrong = beDateWrongOrder(iso);
    check(
      `${wall.replace("T", " ")} Bangkok -> ${expDate} (${note})`,
      right === expDate && (right !== wrong) === shouldDiffer,
      `stored ${iso}: convert-then-+543 = "${right}"  |  +543-then-convert = "${wrong}"` +
        (shouldDiffer ? "  ← WRONG ORDER IS WRONG HERE" : "  ← identical: correct by luck"),
    );
  }
  // The new-year case again, on the YEAR alone, because that is the one that
  // reaches a legal document number.
  const wrongNyYear = Number(beDateWrongOrder(ny).slice(-4));
  check(
    "at new year the wrong order is off by a whole BE year, not just a day",
    shopBEYear(ny) === 2570 && wrongNyYear === 2569,
    `correct=${String(shopBEYear(ny))} wrong-order=${String(wrongNyYear)} (differ by ${String(
      2570 - wrongNyYear,
    )} year)`,
  );

  /* ------------------------------------------------------------------ T9 -- */
  header("T9: the UI's BE year and the SERVER's be_year in doc_no agree");
  console.log(
    "  server side: _be_year() converts to Asia/Bangkok then +543, and\n" +
      "  server/scripts/prove_shop_time.py proves both the value (S1/S2) and that it\n" +
      "  reaches doc_no and the doc_no_counters key over real HTTP (S3).",
  );
  // The card as reported: doc_no B-2569-105 beside a load weighed that evening.
  const cardDoc = "B-2569-105";
  check(
    "the reported card now agrees with itself: date year == doc_no year",
    shopBEYear(cardIso) === beYearInDocNo(cardDoc),
    `date "${shopDate(cardIso)}" (${String(shopBEYear(cardIso))}) vs doc_no ${cardDoc} (${String(
      beYearInDocNo(cardDoc),
    )})`,
  );
  check(
    "and the shipped Gregorian year did NOT agree — the contradiction was real",
    gregorianYearOf(cardIso) !== beYearInDocNo(cardDoc),
    `old card read "2026-07-26" beside ${cardDoc}: ${String(gregorianYearOf(cardIso))} != ${String(
      beYearInDocNo(cardDoc),
    )}`,
  );
  // The boundary case, where agreement is the entire point: a bill received
  // 2026-12-31T17:30Z takes be_year 2570 (prove_shop_time.py S1), so doc_no is
  // B-2570-<seq>. The UI must say 2570 for the same instant.
  const nyDoc = "B-2570-1";
  check(
    "at 2027-01-01 00:30 Bangkok the UI year matches the be_year the server stamps",
    shopBEYear(ny) === beYearInDocNo(nyDoc),
    `UI ${String(shopBEYear(ny))} == server ${String(beYearInDocNo(nyDoc))} (doc_no ${nyDoc})`,
  );
  check(
    "and the WRONG order would have disagreed with the server — the check discriminates",
    wrongNyYear !== beYearInDocNo(nyDoc),
    `wrong-order UI ${String(wrongNyYear)} != server ${String(beYearInDocNo(nyDoc))}` +
      " — the screen would have named a different business year than the document",
  );
  console.log(
    "  BOUND, stated rather than glossed: created_at is the WEIGHING instant and\n" +
      "  be_year comes from server_received_at (doc_no is arrival order —\n" +
      "  lessons/doc-no-is-arrival-order-not-event-time.md). The two years agree when a\n" +
      "  bill is received in the shop year it was weighed in. A bill weighed 23:59 on 31\n" +
      "  Dec and synced after midnight legitimately shows 31/12/2569 beside B-2570-n;\n" +
      "  that is an offline queue crossing new year, not an era bug.",
  );

  /* ----------------------------------------------------------------- T10 -- */
  header("T10: negative — no ค.ศ. year survives into anything the operator reads");
  const rendered = [cardIso, anchor, ny, atBangkok("2026-07-26T23:59:00")].map((iso) =>
    shopDateTime(iso),
  );
  const leaked = rendered.filter((s) => /\b(19|20)\d{2}\b/.test(s));
  check(
    "no rendered date contains a Gregorian-looking year",
    leaked.length === 0,
    leaked.length === 0 ? `checked ${JSON.stringify(rendered)}` : `LEAKED: ${JSON.stringify(leaked)}`,
  );
  const badShape = rendered.filter((s) => !/^\d{2}\/\d{2}\/2[56]\d{2} \d{2}:\d{2}$/.test(s));
  check(
    "every rendered value is DD/MM/BBBB HH:MM with a 4-digit BE year",
    badShape.length === 0,
    badShape.length === 0 ? "all four match" : `BAD: ${JSON.stringify(badShape)}`,
  );

  console.log("");
  if (failures > 0) {
    console.log(`FAILED — ${String(failures)} check(s)`);
    return 1;
  }
  console.log(
    "  ALL CASES PASSED — display is shop-local, Buddhist-era, independent of the\n" +
      "  handset, and its year agrees with the one the server puts on doc_no.",
  );
  return 0;
}

const code = main();
console.log(`TIME_EXIT=${String(code)}`);
process.exit(code);
