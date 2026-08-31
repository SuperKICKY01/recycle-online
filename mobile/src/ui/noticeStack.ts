/**
 * WHICH NOTICES SHOW, AND WHICH ONE STAYS INLINE — the presentation arrangement,
 * pure, so a node proof can drive it (P1.23 item 3 phase C).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE DEFECT THIS EXISTS TO REMOVE
 * ─────────────────────────────────────────────────────────────────────────────
 * The main screen stacked FOUR full-bleed bars of equal weight (session/sync,
 * stale prices, seller-code reserve, and the last-bill strip). "The reader cannot
 * tell which matters" — the owner, 2026-08-31. The reference app's answer, adopted
 * here: at most ONE notice stays inline — the blocker if there is one, else a LONE
 * non-blocking notice (one line is no stack, not worth a tap behind a count); two or
 * more non-blocking notices defer to a single count control that opens a sheet.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT THIS MODULE DOES AND DELIBERATELY DOES NOT
 * ─────────────────────────────────────────────────────────────────────────────
 * It ARRANGES notices that have already been decided elsewhere. It NEVER decides
 * WHICH notice applies or WHAT it says — `statusNotice`, `freshness.masterNotice`
 * and `reserveStripNotice` own that, unchanged. This module maps each already-built
 * notice to a lightweight presentation ENTRY (id + severity) and ranks the set. The
 * full text of a collapsed notice is rendered by the sheet from the source value,
 * keyed by id — so no wording lives here and none is re-decided.
 *
 * THE LAST-BILL STRIP IS NOT HERE. It is navigation (open/void the latest bill),
 * not an alert, and phase C makes it its own card on the page. Only the three ALERT
 * notices are arranged.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPLETENESS IS BY CONSTRUCTION, NOT BY A HAND-KEPT COUNT
 * ─────────────────────────────────────────────────────────────────────────────
 * `arrangeNotices` filters and partitions the input it is given, so `inline` plus
 * `collapsed` is exactly the active input set — no notice can be dropped by a count
 * that drifts (lessons/a-quantified-sentence-names-no-member.md: enumerate at run
 * time, never sum members by hand). `blocks` is DERIVED from the severity, never a
 * second field that could disagree.
 */
import { type StatusTone } from "../sync/statusNotice.js";
import { type MasterNotice } from "../master/freshness.js";
import { type ReserveStripNotice } from "../master/reserveStrip.js";

/** The three alert notices, by identity. The last-bill card is not one of these. */
export type NoticeId = "session" | "prices" | "reserve";

/** The whole set, so a proof can enumerate it rather than restate the members. */
export const NOTICE_IDS: readonly NoticeId[] = ["session", "prices", "reserve"] as const;

/**
 * Presentation severity, in a TOTAL order: a notice that blocks work outranks one
 * that asks for attention, which outranks one that merely informs. There is no
 * "none" member — an absent notice is `null`, never an entry.
 */
export type NoticeSeverity = "blocking" | "attention" | "info";

/** One notice's place in the arrangement. The text is rendered from the source. */
export interface NoticeEntry {
  readonly id: NoticeId;
  readonly severity: NoticeSeverity;
}

/**
 * Does this notice block work? DERIVED from severity, never stored — a second field
 * would be free to drift from the severity it is supposed to mirror.
 */
export function blocks(entry: NoticeEntry): boolean {
  return entry.severity === "blocking";
}

// ── the mappers: an already-decided notice → its entry, or null when absent ──────
// None of these decides WHICH notice applies; each translates a settled notice's
// tone into a presentation severity and nothing more.

/**
 * The session / sync line. `sessionBlocks` is the app's own `mustShowSignIn` signal
 * (session !== "active"): a dead session blocks every action, so it is the one
 * status condition that is `blocking`. A calm connection (busy / good / idle) is NOT
 * a notice — offline-first surfaces problems, not "everything is fine".
 */
export function statusEntry(tone: StatusTone, sessionBlocks: boolean): NoticeEntry | null {
  if (sessionBlocks) return { id: "session", severity: "blocking" };
  if (tone === "bad" || tone === "warn") return { id: "session", severity: "attention" };
  return null;
}

/**
 * The master-data line. `block` (empty, never fetched) cannot start a bill, so it is
 * `blocking`; `warn` (stale prices) withdraws only the auto-fill and is `attention`;
 * `info` merely informs. `null` is absence.
 */
export function masterEntry(notice: MasterNotice | null): NoticeEntry | null {
  if (notice === null) return null;
  if (notice.tone === "block") return { id: "prices", severity: "blocking" };
  if (notice.tone === "warn") return { id: "prices", severity: "attention" };
  return { id: "prices", severity: "info" };
}

/**
 * The seller-code reserve line. `red` (exhausted / never provisioned) needs a person
 * but does NOT gate a bill on this screen, so it is `attention`, never `blocking`;
 * `info` (a low count) informs. `null` is absence (the reserve is ample).
 */
export function reserveEntry(notice: ReserveStripNotice | null): NoticeEntry | null {
  if (notice === null) return null;
  return { id: "reserve", severity: notice.tone === "red" ? "attention" : "info" };
}

// ── the arrangement ─────────────────────────────────────────────────────────────
const SEVERITY_RANK: Record<NoticeSeverity, number> = { blocking: 0, attention: 1, info: 2 };
const ID_RANK: Record<NoticeId, number> = { session: 0, prices: 1, reserve: 2 };

/**
 * A TOTAL order over entries: severity first (blocking before attention before info),
 * then a fixed id order to break ties deterministically. Same inputs, same order,
 * every time.
 */
export function compareNotices(a: NoticeEntry, b: NoticeEntry): number {
  const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  return bySeverity !== 0 ? bySeverity : ID_RANK[a.id] - ID_RANK[b.id];
}

export interface NoticeArrangement {
  /** At most one: the blocker if any, else a LONE non-blocking notice, else `null`. */
  readonly inline: NoticeEntry | null;
  /** Everything else, in total order — reachable behind the count. */
  readonly collapsed: readonly NoticeEntry[];
  /** `collapsed.length` — what the count control shows. */
  readonly count: number;
}

/**
 * Arrange the active notices. The blocker stays inline (or, with no blocker, a lone
 * notice); everything else collapses behind the count. `null`s are filtered first, so `inline`
 * plus `collapsed` is EXACTLY the active input set — nothing is dropped.
 */
export function arrangeNotices(entries: readonly (NoticeEntry | null)[]): NoticeArrangement {
  const active = entries.filter((e): e is NoticeEntry => e !== null);
  const sorted = [...active].sort(compareNotices);
  const blocker = sorted.find(blocks) ?? null;
  // THE INLINE SLOT IS THE BLOCKER'S. If nothing blocks, a LONE notice may still use the free
  // slot — the count exists to stop a stack from burying the work, and one notice is no stack,
  // so hiding it behind a "1" a wet hand must tap costs a tap and saves no space. But TWO OR
  // MORE non-blocking notices all defer to the count, since none is privileged. So the count
  // appears only when a blocker leaves others behind, or two-plus non-blocking notices remain.
  const inline = blocker !== null ? blocker : sorted.length === 1 ? (sorted[0] ?? null) : null;
  const collapsed = inline === null ? sorted : sorted.filter((e) => e !== inline);
  return { inline, collapsed, count: collapsed.length };
}

/**
 * The ids present in an arrangement — inline plus collapsed, in that order. For the
 * completeness proof: this must equal the ids of the active input, none dropped and
 * none duplicated.
 */
export function arrangedIds(a: NoticeArrangement): readonly NoticeId[] {
  return [...(a.inline === null ? [] : [a.inline.id]), ...a.collapsed.map((e) => e.id)];
}
