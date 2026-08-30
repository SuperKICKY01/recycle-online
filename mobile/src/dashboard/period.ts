/**
 * THE PERIOD THE DASHBOARD IS ASKING ABOUT — presets and a bounded custom range,
 * turned into the two shop-local wire dates `GET /reports/summary` takes.
 *
 * Pure TypeScript: no React Native, no Expo, no node, no fetch — so the headless
 * proof (`npm run prove:dashboard`) exercises exactly the date arithmetic the phone
 * runs. `dashboardView.ts` and `app/DashboardScreen.tsx` consume this; neither
 * computes a date of its own.
 *
 * ---------------------------------------------------------------------------
 * ONE TIMEZONE AUTHORITY, AND IT IS THE SAME ONE THE DAILY VIEW USES
 * ---------------------------------------------------------------------------
 * Every shop-local date here is derived from `SHOP_UTC_OFFSET_MINUTES`
 * (@recycle/shop-time) and from nowhere else — the ONE offset constant
 * `dailyView.shopWireDate` uses (dailyView.ts imports the same symbol). A second
 * `+ 7 * 60` anywhere would be a second timezone on the client, free to drift at
 * exactly the midnight boundary neither author tested
 * (lessons/render-in-shop-time-not-device-time.md).
 *
 * WHY THE CLIENT COMPUTES "TODAY" AT ALL, when the daily route deliberately does
 * not (it passes `date=null` and lets the server decide). The summary route takes
 * an explicit `from_date`/`to_date`, so a preset like "this month" is a range the
 * client must name. The handset clock is the only clock here, and it is used ONLY
 * to pick the window — a wrong clock shifts which days are summed, and the ~3 s of
 * skew measured on this hardware crosses a shop-day boundary only in the last/first
 * seconds of a day. The BE label is derived AFTER the conversion, never before
 * (lessons/be-year-comes-after-the-timezone.md).
 *
 * ---------------------------------------------------------------------------
 * THE WIRE DATE IS `YYYY-MM-DD` AND MUST NEVER BE DISPLAYED
 * ---------------------------------------------------------------------------
 * `from_date`/`to_date` are Gregorian ISO calendar strings — a machine contract
 * with the server, the same shape `shopWireDate` produces for `?date=`. Everything
 * a human reads goes through `periodLabel` (พ.ศ., day-first). A `2569-…` wire value
 * would invite the exact `slice`/`new Date` that shopTime.ts exists to kill.
 */
import { BE_YEAR_OFFSET, SHOP_UTC_OFFSET_MINUTES } from "@recycle/shop-time";

/**
 * THE DEVICE'S COPY OF THE ROUTE'S SPAN CEILING. `server/app/reports.py`
 * `_SUMMARY_MAX_SPAN_DAYS = 366` refuses a wider range with a named 422
 * (`date_range_too_wide`). The device mirrors it and refuses a too-long custom
 * range with a sentence naming the bound, so an ordinary user never provokes that
 * 422. The span is INCLUSIVE: from and to on the same day is 1 day; a year plus a
 * day of slack is 366. If the server's constant moves, this one follows.
 */
export const MAX_SPAN_DAYS = 366;

export type PresetKind = "today" | "week" | "month" | "custom";

export interface PeriodRange {
  /** Shop-local calendar start, YYYY-MM-DD. Machine contract, never displayed. */
  from_date: string;
  /** Shop-local calendar end, YYYY-MM-DD, inclusive. */
  to_date: string;
}

export interface PeriodSelection extends PeriodRange {
  preset: PresetKind;
  /**
   * True only when the range is exactly the shop's today (a single day == today).
   * The today view is the one that keeps the per-bill list beside the totals (E3);
   * every other period shows aggregates only.
   */
  isToday: boolean;
  /** พ.ศ., day-first, derived AFTER the timezone conversion. For the screen. */
  label: string;
}

/** A custom range that could not be used, with the sentence saying why. */
export interface PeriodRefusal {
  kind: "refused";
  reason: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const pad2 = (n: number): string => String(n).padStart(2, "0");

/** Abbreviated Thai months, index 0 = January. UI text; reproduced verbatim. */
const TH_MONTHS_ABBR: readonly string[] = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/** The shop-local calendar fields of an instant. Month is 1-based. */
interface ShopYMD {
  year: number;
  month: number;
  day: number;
}

/**
 * The shop's wall-clock calendar for an instant. Shift by the offset and read the
 * UTC fields — the same move shopTime.shopWallClock makes — so the fields ARE the
 * shop-local date. Reading LOCAL fields would reintroduce the device dependency
 * this whole module exists to remove.
 */
function shopYMD(now: Date): ShopYMD {
  const wall = new Date(now.getTime() + SHOP_UTC_OFFSET_MINUTES * 60_000);
  return { year: wall.getUTCFullYear(), month: wall.getUTCMonth() + 1, day: wall.getUTCDate() };
}

const wireOf = (y: number, m: number, d: number): string => `${String(y)}-${pad2(m)}-${pad2(d)}`;
const wireOfYMD = (ymd: ShopYMD): string => wireOf(ymd.year, ymd.month, ymd.day);

/** The shop-local weekday of an instant, Monday = 0 .. Sunday = 6. */
function shopMondayIndex(now: Date): number {
  const wall = new Date(now.getTime() + SHOP_UTC_OFFSET_MINUTES * 60_000);
  // getUTCDay: Sunday = 0 .. Saturday = 6. Shift so Monday = 0.
  return (wall.getUTCDay() + 6) % 7;
}

/** Today, as the shop reckons it. `YYYY-MM-DD`. */
export function shopToday(now: Date): string {
  return wireOfYMD(shopYMD(now));
}

/**
 * The wire range for a NON-custom preset. Every one ends on the shop's today.
 *
 *   today  — today alone.
 *   week   — Monday of this shop week through today (Monday-based; a week that
 *            crosses a month boundary still starts on its Monday).
 *   month  — the 1st of this shop calendar month through today.
 */
export function presetRange(preset: Exclude<PresetKind, "custom">, now: Date): PeriodRange {
  const today = shopYMD(now);
  const to = wireOfYMD(today);
  if (preset === "today") return { from_date: to, to_date: to };
  if (preset === "month") return { from_date: wireOf(today.year, today.month, 1), to_date: to };
  // week: subtract whole days from the SHIFTED instant, then read its UTC fields —
  // the subtraction stays on the shop clock because the shift is already applied.
  const shifted = now.getTime() + SHOP_UTC_OFFSET_MINUTES * 60_000;
  const monday = new Date(shifted - shopMondayIndex(now) * DAY_MS);
  return {
    from_date: wireOf(monday.getUTCFullYear(), monday.getUTCMonth() + 1, monday.getUTCDate()),
    to_date: to,
  };
}

/** A wire date as UTC-midnight epoch ms, or NaN if it is not `YYYY-MM-DD`. */
function wireMidnightMs(wire: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wire);
  if (m === null) return Number.NaN;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return Number.NaN;
  return Date.UTC(y, mo - 1, d);
}

/**
 * The INCLUSIVE number of shop days in a range: from and to on the same day is 1.
 * NaN if either bound is not a wire date. Computed on UTC-midnight of each wire
 * date, which is offset arithmetic on a fixed offset — no timezone is consulted.
 */
export function spanDays(range: PeriodRange): number {
  const a = wireMidnightMs(range.from_date);
  const b = wireMidnightMs(range.to_date);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / DAY_MS) + 1;
}

/**
 * A custom range, validated against the SAME two rules the route enforces, in the
 * same order — so the device refuses before the request and the route's 422 is
 * never provoked by an ordinary user. Inverted first (the route checks it first),
 * then the inclusive span ceiling.
 */
export function customRange(from_date: string, to_date: string): PeriodRange | PeriodRefusal {
  const span = spanDays({ from_date, to_date });
  if (Number.isNaN(span)) {
    return { kind: "refused", reason: "รูปแบบวันที่ไม่ถูกต้อง" };
  }
  if (span <= 0) {
    return { kind: "refused", reason: "วันสิ้นสุดต้องไม่มาก่อนวันเริ่มต้น" };
  }
  if (span > MAX_SPAN_DAYS) {
    return {
      kind: "refused",
      reason: `ช่วงวันที่ยาวเกินไป เลือกได้ไม่เกิน ${String(MAX_SPAN_DAYS)} วัน`,
    };
  }
  return { from_date, to_date };
}

/** พ.ศ. year of a wire date. The `+ 543` is shopTime's; here it lands on a date
 *  ALREADY in shop-local calendar terms (the wire date was built from shopYMD). */
const beYearOfWire = (wire: string): number => Number(wire.slice(0, 4)) + BE_YEAR_OFFSET;

/** "30 ส.ค. 2569" — one shop-local wire date as a พ.ศ., day-first label. */
function labelOne(wire: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(wire);
  if (m === null) return wire;
  const day = Number(m[3]);
  const month = Number(m[2]);
  return `${String(day)} ${TH_MONTHS_ABBR[month - 1] ?? m[2]} ${String(beYearOfWire(wire))}`;
}

/**
 * The range as a พ.ศ. label. A single day is one date; a range within one month is
 * "D–D MMM BBBB"; anything wider spells both ends. Derived from the wire dates,
 * which are already shop-local, so the year is right by construction — the +543 is
 * shopTime's BE_YEAR_OFFSET applied after the conversion, never before it.
 */
export function periodLabel(range: PeriodRange): string {
  if (range.from_date === range.to_date) return labelOne(range.from_date);
  const sameMonth = range.from_date.slice(0, 7) === range.to_date.slice(0, 7);
  if (sameMonth) {
    const fromDay = Number(range.from_date.slice(8, 10));
    return `${String(fromDay)}–${labelOne(range.to_date)}`;
  }
  return `${labelOne(range.from_date)} – ${labelOne(range.to_date)}`;
}

/**
 * A full selection for a NON-custom preset. The one entry point the app uses when
 * a preset chip is tapped; `isToday` is set here (only the today preset is today),
 * and it is what gates the per-bill list in the today view.
 */
export function selectPreset(preset: Exclude<PresetKind, "custom">, now: Date): PeriodSelection {
  const range = presetRange(preset, now);
  return {
    ...range,
    preset,
    isToday: preset === "today",
    label: periodLabel(range),
  };
}

/**
 * A full selection for a validated custom range, or the refusal. `isToday` is true
 * only when the custom range happens to be exactly the shop's today (a single day
 * that equals today), so a custom "today" gets the bill list too.
 */
export function selectCustom(
  from_date: string,
  to_date: string,
  now: Date,
): PeriodSelection | PeriodRefusal {
  const range = customRange(from_date, to_date);
  if ("kind" in range) return range;
  const today = shopToday(now);
  return {
    ...range,
    preset: "custom",
    isToday: range.from_date === today && range.to_date === today,
    label: periodLabel(range),
  };
}

/** The chip labels, in draw order. Static UI text; the sub-note says what "week"
 *  and "month" actually span so neither is a guess. */
export const PRESET_CHIPS: readonly { preset: PresetKind; label: string; note: string | null }[] = [
  { preset: "today", label: "วันนี้", note: null },
  { preset: "week", label: "สัปดาห์นี้", note: "จันทร์–วันนี้" },
  { preset: "month", label: "เดือนนี้", note: "ตั้งแต่วันที่ 1" },
  { preset: "custom", label: "กำหนดเอง", note: null },
];
