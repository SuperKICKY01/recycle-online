/**
 * SHOP DAYS ON THE DESKTOP — the date filter's wire values (`YYYY-MM-DD`, shop-local) and their
 * Buddhist-era labels (D-5).
 *
 * THE OFFSET IS IMPORTED, NEVER WRITTEN: `SHOP_UTC_OFFSET_MINUTES` from @recycle/shop-time is the
 * one timezone constant every client uses (mobile/src/dashboard/period.ts does the same). The
 * Buddhist-era YEAR is never computed here either — a label goes through shop-time's
 * `shopDate`, so the Buddhist-era offset stays in packages/shop-time alone (prove:boundary B5).
 */
import { BE_YEAR_OFFSET, SHOP_UTC_OFFSET_MINUTES, shopBEYear, shopDate } from "@recycle/shop-time";

const DAY_MS = 86_400_000;
const pad2 = (n: number): string => String(n).padStart(2, "0");

function wireOf(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCFullYear())}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** Today as the SHOP reckons it, `YYYY-MM-DD` — never the PC's local date. */
export function shopToday(now: Date): string {
  return wireOf(now.getTime() + SHOP_UTC_OFFSET_MINUTES * 60_000);
}

/** The shop day `days` before `wire` (a `YYYY-MM-DD`), or null if `wire` is not one. */
export function shopDaysBefore(wire: string, days: number): string | null {
  const ms = Date.parse(`${wire}T00:00:00Z`);
  if (Number.isNaN(ms) || !/^\d{4}-\d{2}-\d{2}$/.test(wire)) return null;
  return wireOf(ms - days * DAY_MS);
}

/**
 * The Buddhist-era label of a shop day: `12/10/2569`. Built by asking shop-time for the date of
 * that day's shop-local noon, so the year comes from shopDate and from nowhere else.
 */
export function shopDayLabel(wire: string): string {
  const noon = shopNoonIso(wire);
  return noon === null ? wire : shopDate(noon);
}

/** The UTC instant of a shop day's local noon, or null for a value that is not a day. */
function shopNoonIso(wire: string): string | null {
  const ms = Date.parse(`${wire}T12:00:00Z`);
  if (Number.isNaN(ms) || !/^\d{4}-\d{2}-\d{2}$/.test(wire)) return null;
  return new Date(ms - SHOP_UTC_OFFSET_MINUTES * 60_000).toISOString();
}

/** The Buddhist-era year of a shop day, from shop-time (never a local `+` of our own). */
export function shopDayBEYear(wire: string): number | null {
  const noon = shopNoonIso(wire);
  return noon === null ? null : shopBEYear(noon);
}

// --- entering a shop day (D-5: Buddhist era, day/month/year, everywhere) ----------------------

export const DATE_ENTRY_TEXT = {
  shape: "ใส่วันที่เป็น วัน/เดือน/ปี พ.ศ. เช่น 12/10/2569",
  gregorian: "ใส่ปีเป็น พ.ศ. เช่น 2569 ไม่ใช่ ค.ศ.",
  noSuchDay: "ไม่มีวันที่นี้ในปฏิทิน",
} as const;

/**
 * What the operator typed, as a shop day: `12/10/2569` (also `.`, `-` or spaces between) becomes
 * `2026-10-12`. Only a four-digit Buddhist-era year is accepted; a Christian-era year is REFUSED
 * with its own sentence rather than silently read as a year five centuries away.
 */
export function parseShopDay(text: string): { wire: string } | { problem: string } {
  const m = /^\s*(\d{1,2})\s*[/.\- ]\s*(\d{1,2})\s*[/.\- ]\s*(\d{4})\s*$/.exec(text);
  if (m === null) return { problem: DATE_ENTRY_TEXT.shape };
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const gregorian = year - BE_YEAR_OFFSET;
  if (gregorian < 1800) return { problem: DATE_ENTRY_TEXT.gregorian };
  const t = Date.UTC(gregorian, month - 1, day);
  const d = new Date(t);
  if (month < 1 || month > 12 || d.getUTCDate() !== day || d.getUTCMonth() !== month - 1) return { problem: DATE_ENTRY_TEXT.noSuchDay };
  return { wire: `${String(gregorian)}-${pad2(month)}-${pad2(day)}` };
}

export const THAI_MONTHS: readonly string[] = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
export const THAI_WEEKDAYS: readonly string[] = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/** "ตุลาคม 2569" for the month holding `wire`. */
export function monthTitle(wire: string): string {
  const month = Number(wire.slice(5, 7));
  return `${THAI_MONTHS[month - 1] ?? ""} ${String(shopDayBEYear(wire) ?? "")}`;
}

/** The first day of the month `delta` months from the one holding `wire`. */
export function shiftMonth(wire: string, delta: number): string {
  const d = new Date(Date.UTC(Number(wire.slice(0, 4)), Number(wire.slice(5, 7)) - 1 + delta, 1));
  return `${String(d.getUTCFullYear())}-${pad2(d.getUTCMonth() + 1)}-01`;
}

/** The month holding `wire` as weeks (Sunday first) of shop days, blanks as null. */
export function monthGrid(wire: string): (string | null)[][] {
  const y = Number(wire.slice(0, 4));
  const m = Number(wire.slice(5, 7)) - 1;
  const first = new Date(Date.UTC(y, m, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: first }, () => null);
  for (let d = 1; d <= days; d += 1) cells.push(`${String(y)}-${pad2(m + 1)}-${pad2(d)}`);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export type PresetId = "today" | "yesterday" | "week";

export const PRESETS: readonly { id: PresetId; label: string }[] = [
  { id: "today", label: "วันนี้" },
  { id: "yesterday", label: "เมื่อวาน" },
  { id: "week", label: "7 วันล่าสุด" },
];

/** A preset's inclusive shop-day range. */
export function presetRange(id: PresetId, now: Date): { from: string; to: string } {
  const today = shopToday(now);
  if (id === "today") return { from: today, to: today };
  if (id === "yesterday") {
    const y = shopDaysBefore(today, 1) ?? today;
    return { from: y, to: y };
  }
  return { from: shopDaysBefore(today, 6) ?? today, to: today };
}
