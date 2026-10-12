/**
 * SHOP DAYS ON THE DESKTOP — the date filter's wire values (`YYYY-MM-DD`, shop-local) and their
 * Buddhist-era labels (D-5).
 *
 * THE OFFSET IS IMPORTED, NEVER WRITTEN: `SHOP_UTC_OFFSET_MINUTES` from @recycle/shop-time is the
 * one timezone constant every client uses (mobile/src/dashboard/period.ts does the same). The
 * Buddhist-era YEAR is never computed here either — a label goes through shop-time's
 * `shopDate`, so the +543 stays in packages/shop-time alone (prove:boundary B5).
 */
import { SHOP_UTC_OFFSET_MINUTES, shopDate } from "@recycle/shop-time";

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
  const ms = Date.parse(`${wire}T12:00:00Z`);
  if (Number.isNaN(ms)) return wire;
  return shopDate(new Date(ms - SHOP_UTC_OFFSET_MINUTES * 60_000).toISOString());
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
