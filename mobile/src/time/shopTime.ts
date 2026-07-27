/**
 * Shop-local date and time formatting. The ONE place a timezone is defined on
 * the client, the ONE place a year is computed, and the ONE way a timestamp
 * becomes something a human reads.
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
 *
 * DISPLAY LAYER ONLY
 * ------------------
 * Storage and the wire are UTC ISO and are not touched by anything in here.
 * Nothing formatted by this module may be stored, sent, parsed, compared or
 * sorted. The one sort in the app (App.tsx) orders bills on the raw
 * `created_at`, never on output from here, and it must stay that way.
 *
 * NEXT CONSUMER: the desktop thermal slip. `desktop/` is empty today, so the
 * printed slip does not exist yet — but CLAUDE.md requires พ.ศ. on it too, and
 * a slip is the artifact a seller keeps. When it is built it needs THIS logic,
 * not its own: a second `+ 543` somewhere in Electron is a second behaviour, and
 * the two would drift at exactly the boundary neither author tested. Port the
 * module (offset constant, brand, and the ordering rule) rather than the output
 * format.
 */

/** IANA name, for the day this becomes a real per-tenant zone. */
export const SHOP_TIMEZONE_NAME = "Asia/Bangkok";

/** The operative constant. Asia/Bangkok is UTC+7 year-round. */
export const SHOP_UTC_OFFSET_MINUTES = 7 * 60;

/**
 * Gregorian year + 543 = Buddhist-era year (พ.ศ.), per CLAUDE.md: BE dates in
 * the UI and on printed slips, UTC ISO in the DB.
 *
 * The server holds the same number as `_BE_OFFSET` in `app/bills.py`, where it
 * produces the `be_year` inside `doc_no` (`B-2569-105`) and the
 * `doc_no_counters` key. The two MUST agree: a bill card shows the doc_no and
 * the date side by side and one person reads both, so `2026-07-26` next to
 * `B-2569-105` is a card contradicting itself — which is what was reported.
 */
export const BE_YEAR_OFFSET = 543;

/*
 * ORDER: CONVERT TO SHOP TIME FIRST, THEN ADD 543. NEVER THE OTHER WAY.
 * --------------------------------------------------------------------
 * Taking the year off the raw instant and adding 543 to it is RIGHT for most of
 * the day and WRONG for the seven hours of every Bangkok morning that are still
 * yesterday in UTC — and on new year's eve that lands on the year itself:
 *
 *     stored 2026-12-31T17:30Z  =  2027-01-01 00:30 Bangkok
 *       convert then +543  ->  01/01/2570   correct
 *       +543 then convert  ->  31/12/2569   wrong year AND wrong day
 *
 * 2569 there is not a cosmetic slip. The server stamps be_year 2570 on that
 * bill's doc_no and keys doc_no_counters on it, so the screen would name a
 * different business year than the legal document number does — and the wrong
 * one would look entirely plausible for the seven hours it is wrong.
 *
 * This is not left to whoever edits the file next. `beYear` takes a
 * `ShopWallClock`, a branded type that ONLY `shopWallClock()` can produce, so
 * handing it a raw instant does not compile. The module boundary carries the
 * rule (same discipline as lessons/unavailable-is-not-rejected.md).
 */

/** Shown when a timestamp is missing or unparseable, so a bad row cannot crash a list. */
const UNKNOWN = "—";

const pad = (n: number): string => String(n).padStart(2, "0");

/**
 * A Date whose UTC fields have ALREADY been shifted to read as the shop's wall
 * clock. The brand is the enforcement described above: it is unforgeable by
 * accident, so `beYear` cannot be reached without the timezone conversion
 * having happened first.
 */
type ShopWallClock = Date & { readonly __brand: "shop wall clock" };

/**
 * The shop's wall clock for a UTC instant. STEP ONE, always.
 *
 * Shifting the instant by the offset and then reading its UTC fields gives the
 * shop's wall-clock fields. Reading LOCAL fields here would reintroduce the
 * device dependency this module exists to remove.
 */
function shopWallClock(iso: string): ShopWallClock | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t + SHOP_UTC_OFFSET_MINUTES * 60_000) as ShopWallClock;
}

/**
 * The Buddhist-era year of a shop wall clock. STEP TWO, and the ONLY
 * `+ BE_YEAR_OFFSET` on the client — nothing else may compute a year.
 *
 * It cannot see the raw instant: its argument is already shop-local by type.
 */
function beYear(wall: ShopWallClock): number {
  return wall.getUTCFullYear() + BE_YEAR_OFFSET;
}

/**
 * The พ.ศ. year of a UTC instant as the shop reckons it, or null if unparseable.
 *
 * Exported so the thermal slip (desktop/, the next consumer of this module) and
 * any future report boundary derive the year from HERE rather than doing their
 * own `+ 543`, and so the proof can assert it against the be_year the server
 * puts in doc_no.
 */
export function shopBEYear(iso: string): number | null {
  const wall = shopWallClock(iso);
  if (wall === null) return null;
  return beYear(wall);
}

/**
 * "27/07/2569" — the shop's date, Buddhist era, day first.
 *
 * WHY DD/MM/BBBB and not ISO-shaped 2569-07-26: `2569-07-26` is byte-for-byte
 * the shape of a Gregorian ISO date, so it invites the exact operation this
 * module exists to kill — a later `slice(0, 4)` or `new Date(s)` — and would
 * then yield a year wrong by 543 with no visible symptom. Day-first cannot be
 * mistaken for a machine-readable instant by a human or by code. Nothing sorts
 * on this string (the one sort orders raw `created_at`), so ISO's lexical
 * ordering buys nothing here. Never abbreviated to 69.
 */
export function shopDate(iso: string): string {
  const wall = shopWallClock(iso);
  if (wall === null) return UNKNOWN;
  return `${pad(wall.getUTCDate())}/${pad(wall.getUTCMonth() + 1)}/${String(beYear(wall))}`;
}

/** "15:16" in the shop's timezone. */
export function shopTime(iso: string): string {
  const d = shopWallClock(iso);
  if (d === null) return UNKNOWN;
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/**
 * "27/07/2569 15:16" in the shop's timezone.
 *
 * Composed from the two above rather than reformatted, so the list and the
 * status strip cannot drift apart: there is one date formatter and one clock
 * formatter, and this is their concatenation.
 */
export function shopDateTime(iso: string): string {
  const d = shopWallClock(iso);
  if (d === null) return UNKNOWN;
  return `${shopDate(iso)} ${shopTime(iso)}`;
}
