/**
 * Shop-local date and time formatting. The ONE place a timezone is defined on
 * the client, and the ONE way a timestamp becomes something a human reads.
 *
 * Pure TypeScript — no React Native, no Expo, no Intl — so the headless proof
 * exercises exactly the code the device runs.
 *
 * WHY THE SHOP'S TIMEZONE AND NOT THE DEVICE'S
 * --------------------------------------------
 * A business day belongs to the SHOP, not to whichever handset is in someone's
 * pocket. Formatting in device-local time means a phone left on the wrong
 * timezone, or carried across a border, silently relabels which day a load was
 * bought on — and the SRS 3.3 daily totals would then differ depending on who
 * opened the screen. Timestamps are stored as UTC instants (hard rule 7); this
 * module is the only thing that turns one into a wall clock.
 *
 * NOTHING ELSE MAY FORMAT A TIMESTAMP. No `getHours()`, no `toLocaleString()`,
 * no slicing an ISO string — every one of those reads either the device's
 * timezone or UTC, and both are wrong answers to "when did the shop buy this".
 * Slicing was the actual defect: `created_at.slice(11, 16)` printed the UTC
 * clock verbatim, so a load weighed 15:16 in Bangkok displayed as 08:16.
 *
 * TEMPORARY SHAPE: one constant for all tenants. This BECOMES A PER-TENANT
 * SETTING once there is a shop outside Thailand; this value is then the default,
 * not the answer. The server holds the matching constant in app/config.py and
 * the two must agree.
 *
 * WHY A FIXED OFFSET rather than Intl with a timeZone: Thailand has observed
 * UTC+7 with no daylight saving since 1920, so the two are identical here, and
 * this needs no ICU data. Whether Hermes on a real device supports the
 * `timeZone` option with full tz data is UNVERIFIED, and a silently-ignored
 * timeZone would put us straight back to displaying UTC — the very bug this
 * module exists to fix. When this becomes per-tenant, a zone that observes
 * daylight saving CANNOT be a fixed offset, and that change must be verified on
 * a device before it ships.
 */

/*
 * OUTSTANDING, deliberately NOT done in this pass: CLAUDE.md specifies
 * Buddhist-era (พ.ศ.) dates in the UI and on printed slips. shopDate() returns a
 * Gregorian ISO date. That is a real spec item, but it is a separate change from
 * a timezone fix and mixing the two would make both harder to review — a wrong
 * year and a wrong offset look identical in a screenshot. When it is done it
 * belongs HERE, in this module, so there is still exactly one formatter.
 */

/** IANA name, for the day this becomes a real per-tenant zone. */
export const SHOP_TIMEZONE_NAME = "Asia/Bangkok";

/** The operative constant. Asia/Bangkok is UTC+7 year-round. */
export const SHOP_UTC_OFFSET_MINUTES = 7 * 60;

/** Shown when a timestamp is missing or unparseable, so a bad row cannot crash a list. */
const UNKNOWN = "—";

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * The shop's wall clock for a UTC instant.
 *
 * Shifting the instant by the offset and then reading its UTC fields gives the
 * shop's wall-clock fields. Reading LOCAL fields here would reintroduce the
 * device dependency this module exists to remove.
 */
function shopWallClock(iso: string): Date | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + SHOP_UTC_OFFSET_MINUTES * 60_000);
}

/** "2026-07-27" in the shop's timezone. */
export function shopDate(iso: string): string {
  const d = shopWallClock(iso);
  if (d === null) return UNKNOWN;
  return `${String(d.getUTCFullYear())}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** "15:16" in the shop's timezone. */
export function shopTime(iso: string): string {
  const d = shopWallClock(iso);
  if (d === null) return UNKNOWN;
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "2026-07-27 15:16" in the shop's timezone. */
export function shopDateTime(iso: string): string {
  const d = shopWallClock(iso);
  if (d === null) return UNKNOWN;
  return `${shopDate(iso)} ${shopTime(iso)}`;
}
