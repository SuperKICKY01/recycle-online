/**
 * THE NOTICE STACK RANKS, AND DROPS NOTHING — proven, not claimed (P1.23 item 3 phase C).
 *
 *   npm run prove:noticeStack
 *   npm run prove:noticeStack -- --break=<drop|inline|force_count|order|map|nav>
 *
 * The main screen used to stack four equal-weight bars. `src/ui/noticeStack.ts` now
 * arranges the three ALERT notices (session/sync, stale prices, seller-code reserve):
 * the single top-ranked BLOCKING notice stays inline, everything else collapses behind
 * a count. This proves the four properties the owner named:
 *   - COMPLETENESS: inline plus collapsed is exactly the active set — no notice dropped;
 *   - a TOTAL, DETERMINISTIC order (same inputs, same order, twice);
 *   - BLOCKING OUTRANKS INFORMING: a notice that blocks work is the one that stays inline;
 *   - the mappers translate each settled notice's tone to the right severity.
 *
 * THE DISPROOFS, each applied HERE by a wrapper, never by a hook in noticeStack.ts.
 * Each reddens EXACTLY one cell (lessons/a-check-that-never-went-red-was-never-observed):
 *   drop         the arrangement drops its last collapsed notice     -> N1 completeness only
 *   inline       a blocking notice is refused the inline slot        -> N3 the inline-rule cell only
 *   force_count  a LONE non-blocking notice is forced behind a count -> N3 the phase-C lone cell only
 *   order        the arrangement reverses its collapsed order        -> N2 total-order only
 *   map          masterEntry maps `block` to `info`, not `blocking`  -> N4 the master mapper only
 *   nav          the header nav model drops a destination            -> N5 nav completeness only
 *
 * N5 also guards the HEADER: the reference moved the destinations into a scroll row, and
 * a destination lost to that layout change is the same class of defect as a notice dropped
 * from the stack — so the nav model (src/ui/navRow.ts) is asserted to offer exactly the
 * destinations it should, with a presence sibling.
 *
 * main() prints `PROVE_NOTICESTACK_EXIT=<n>`; its ABSENCE is the signal
 * (lessons/a-default-exit-code-is-a-default-verdict.md).
 */
import {
  arrangeNotices,
  arrangedIds,
  blocks,
  compareNotices,
  masterEntry,
  NOTICE_IDS,
  reserveEntry,
  statusEntry,
  type NoticeArrangement,
  type NoticeEntry,
  type NoticeId,
} from "../ui/noticeStack.js";
import { type StatusTone } from "../sync/statusNotice.js";
import { type MasterNotice } from "../master/freshness.js";
import { type ReserveStripNotice } from "../master/reserveStrip.js";
import { NAV_DESTS, NAV_ITEMS, type NavItem } from "../ui/navRow.js";
import { SHEET_TRANSITION_NAMES } from "../ui/sheetStack.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}
function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const BREAK = (process.argv.find((a) => a.startsWith("--break=")) ?? "").split("=")[1] ?? "";
const BREAK_MODES: readonly string[] = ["drop", "inline", "force_count", "order", "map", "nav"];
if (BREAK !== "" && !BREAK_MODES.includes(BREAK)) {
  console.log(`  [FAIL] unknown --break=${BREAK} — nothing was damaged and nothing was measured`);
  console.log(`         known breaks: ${BREAK_MODES.join(", ")}`);
  console.log("PROVE_NOTICESTACK_EXIT=2");
  process.exit(2);
}

// ── disproof wrappers ────────────────────────────────────────────────────────────
/** The arrangement under test. Each break is a REAL violation of one property. */
function arrangeUnderTest(entries: readonly (NoticeEntry | null)[]): NoticeArrangement {
  const real = arrangeNotices(entries);
  const active = entries.filter((e): e is NoticeEntry => e !== null).slice().sort(compareNotices);
  if (BREAK === "drop" && real.collapsed.length > 0) {
    const collapsed = real.collapsed.slice(0, -1);
    return { inline: real.inline, collapsed, count: collapsed.length };
  }
  if (BREAK === "inline" && active.some(blocks)) {
    // when a notice BLOCKS, refuse to keep it inline — reddens the inline-rule cell only,
    // never the lone cell (which has no blocker) or the pinned boundary (which uses REAL).
    return { inline: null, collapsed: active, count: active.length };
  }
  if (BREAK === "force_count" && !active.some(blocks) && active.length === 1) {
    // force a LONE non-blocking notice behind a count instead of inline — the phase-C
    // change's disproof, reddening the lone cell only.
    return { inline: null, collapsed: active, count: active.length };
  }
  if (BREAK === "order" && real.collapsed.length > 1) {
    const collapsed = [...real.collapsed].reverse();
    return { inline: real.inline, collapsed, count: collapsed.length };
  }
  return real;
}
/** The master mapper under test — `block` mis-mapped to `info` for the map break. */
function masterEntryUnderTest(notice: MasterNotice | null): NoticeEntry | null {
  const r = masterEntry(notice);
  if (BREAK === "map" && r !== null && r.severity === "blocking") return { ...r, severity: "info" };
  return r;
}
/** The header nav model under test — a destination dropped for the nav break. */
function navItemsUnderTest(): readonly NavItem[] {
  return BREAK === "nav" && NAV_ITEMS.length > 0 ? NAV_ITEMS.slice(0, -1) : NAV_ITEMS;
}

// ── helpers ──────────────────────────────────────────────────────────────────────
function idSetEq(a: readonly NoticeId[], b: readonly NoticeId[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === a.length && sa.size === sb.size && [...sa].every((x) => sb.has(x));
}
function isSorted(entries: readonly NoticeEntry[]): boolean {
  for (let i = 1; i < entries.length; i += 1) {
    const prev = entries[i - 1];
    const cur = entries[i];
    if (prev === undefined || cur === undefined) return false;
    if (compareNotices(prev, cur) > 0) return false;
  }
  return true;
}
function fullSequence(a: NoticeArrangement): NoticeEntry[] {
  return [...(a.inline === null ? [] : [a.inline]), ...a.collapsed];
}

// The values each mapper can actually produce, for an exhaustive enumeration.
const SESSION_VALS: readonly (NoticeEntry | null)[] = [
  null,
  { id: "session", severity: "attention" },
  { id: "session", severity: "blocking" },
];
const PRICES_VALS: readonly (NoticeEntry | null)[] = [
  null,
  { id: "prices", severity: "info" },
  { id: "prices", severity: "attention" },
  { id: "prices", severity: "blocking" },
];
const RESERVE_VALS: readonly (NoticeEntry | null)[] = [
  null,
  { id: "reserve", severity: "info" },
  { id: "reserve", severity: "attention" },
];

function main(): number {
  console.log("prove:noticeStack — the three alert notices rank, and nothing is dropped");
  console.log(`node ${process.version}`);
  console.log("no server, no database, no network: pure arrangement over notice.ts entries");
  if (BREAK !== "") {
    console.log("");
    console.log(
      `  *** DISPROOF ACTIVE: --break=${BREAK} — a cell that stays green is not measuring what it claims ***`,
    );
  }

  // ── N0 controls: the arrangement behaves, on planted inputs, break-independent ──
  header("N0 the instrument behaves on known inputs");
  const empty = arrangeNotices([]);
  check(
    "empty in -> nothing inline, nothing collapsed, count 0",
    empty.inline === null && empty.collapsed.length === 0 && empty.count === 0,
    `inline=${String(empty.inline)}, count=${String(empty.count)}`,
  );
  const oneBlock = arrangeNotices([{ id: "session", severity: "blocking" }]);
  check(
    "one blocking in -> it is inline, count 0",
    oneBlock.inline?.id === "session" && oneBlock.count === 0,
    `inline=${String(oneBlock.inline?.id)}, count=${String(oneBlock.count)}`,
  );
  const mixed = arrangeNotices([
    { id: "reserve", severity: "info" },
    { id: "prices", severity: "blocking" },
    { id: "session", severity: "attention" },
  ]);
  check(
    "blocking + two others -> blocking inline, count 2, order kept",
    mixed.inline?.id === "prices" &&
      mixed.count === 2 &&
      arrangedIds(mixed).length === 3,
    `inline=${String(mixed.inline?.id)}, count=${String(mixed.count)}, ids=${arrangedIds(mixed).join(">")}`,
  );
  check(
    "an absent notice maps to null, never an entry",
    statusEntry("idle", false) === null &&
      statusEntry("good", false) === null &&
      masterEntry(null) === null &&
      reserveEntry(null) === null,
    "calm status / null master / null reserve are all absent",
  );
  check(
    "the three ids are the whole set and are distinct",
    NOTICE_IDS.length === 3 && new Set(NOTICE_IDS).size === 3,
    NOTICE_IDS.join(", "),
  );

  // ── N1 completeness over every combination ─────────────────────────────────────
  header("N1 no notice is ever dropped (every combination)");
  let combos = 0;
  let completeFailures = 0;
  for (const s of SESSION_VALS) {
    for (const p of PRICES_VALS) {
      for (const r of RESERVE_VALS) {
        combos += 1;
        const entries = [s, p, r];
        const activeIds = entries.filter((e): e is NoticeEntry => e !== null).map((e) => e.id);
        const arranged = arrangeUnderTest(entries);
        const ids = arrangedIds(arranged);
        const ok =
          ids.length === activeIds.length &&
          idSetEq(ids, activeIds) &&
          arranged.count === arranged.collapsed.length;
        if (!ok) completeFailures += 1;
      }
    }
  }
  check(
    "inline + collapsed is exactly the active set, over all combinations",
    completeFailures === 0,
    `${String(combos)} combinations, ${String(completeFailures)} with a dropped or duplicated notice`,
  );

  // ── N2 a total, deterministic order ────────────────────────────────────────────
  header("N2 the order is total and deterministic");
  const orderFixture: readonly (NoticeEntry | null)[] = [
    { id: "session", severity: "attention" },
    { id: "prices", severity: "info" },
    { id: "reserve", severity: "attention" },
  ];
  const twiceA = JSON.stringify(arrangeNotices(orderFixture));
  const twiceB = JSON.stringify(arrangeNotices(orderFixture));
  check("same inputs, same arrangement, twice", twiceA === twiceB);
  const seq = fullSequence(arrangeUnderTest(orderFixture));
  check(
    "the arranged sequence is sorted by the total order (>=2 collapsed here)",
    seq.length >= 2 && isSorted(seq),
    seq.map((e) => `${e.id}:${e.severity}`).join(" <= "),
  );

  // ── N3 the inline slot: the blocker, else a LONE non-blocking notice, else none ──
  header("N3 the inline slot: the blocker, else a lone non-blocking notice, else none");
  let ruleFailures = 0;
  let loneFailures = 0;
  for (const s of SESSION_VALS) {
    for (const p of PRICES_VALS) {
      for (const r of RESERVE_VALS) {
        const entries = [s, p, r];
        const active = entries.filter((e): e is NoticeEntry => e !== null);
        const anyBlocks = active.some(blocks);
        const a = arrangeUnderTest(entries);
        if (anyBlocks) {
          if (!(a.inline !== null && blocks(a.inline))) ruleFailures += 1;
        } else if (active.length === 1) {
          // THE PHASE-C CHANGE — a lone non-blocking notice is inline, nothing behind a count.
          if (!(a.inline !== null && !blocks(a.inline) && a.count === 0)) loneFailures += 1;
        } else if (a.inline !== null) {
          // no blocker, zero or two-plus: none is privileged, so none is inline.
          ruleFailures += 1;
        }
      }
    }
  }
  check(
    "blocker inline; and (no blocker) two-plus non-blocking -> none inline",
    ruleFailures === 0,
    `${String(ruleFailures)} combinations mis-ranked`,
  );
  check(
    "THE PHASE-C CHANGE: a LONE non-blocking notice is INLINE with count 0 (no count chip)",
    loneFailures === 0,
    `${String(loneFailures)} lone combinations put behind a count`,
  );
  // Pinned against the REAL arrangement so the boundary the new rule creates cannot rot.
  const boundary = arrangeNotices([
    { id: "session", severity: "blocking" },
    { id: "prices", severity: "info" },
    null,
  ]);
  check(
    "boundary (pinned): a blocker PLUS one other -> blocker inline, the other behind the count (count 1)",
    boundary.inline?.id === "session" && boundary.count === 1 && boundary.collapsed.length === 1,
    `inline=${String(boundary.inline?.id)}, count=${String(boundary.count)}`,
  );
  const sibling = arrangeNotices([
    null,
    { id: "prices", severity: "info" },
    { id: "reserve", severity: "info" },
  ]);
  check(
    "presence sibling (pinned): TWO non-blocking notices -> none inline, a count of 2",
    sibling.inline === null && sibling.count === 2,
    `inline=${String(sibling.inline)}, count=${String(sibling.count)}`,
  );

  // ── N4 the mappers translate each tone to the right severity ────────────────────
  header("N4 each settled notice maps to the right severity");
  const statusCases: readonly [StatusTone, boolean, string | null][] = [
    ["idle", false, null],
    ["good", false, null],
    ["busy", false, null],
    ["bad", false, "attention"],
    ["warn", false, "attention"],
    ["good", true, "blocking"],
    ["idle", true, "blocking"],
  ];
  check(
    "statusEntry: blocked session -> blocking; bad/warn -> attention; calm -> null",
    statusCases.every(([tone, sb, want]) => (statusEntry(tone, sb)?.severity ?? null) === want),
    "7 status cases",
  );
  const masterCases: readonly [MasterNotice | null, string | null][] = [
    [null, null],
    [{ tone: "block", message: "x" }, "blocking"],
    [{ tone: "warn", message: "x" }, "attention"],
    [{ tone: "info", message: "x" }, "info"],
  ];
  check(
    "masterEntry: block -> blocking; warn -> attention; info -> info; null -> null",
    masterCases.every(([n, want]) => (masterEntryUnderTest(n)?.severity ?? null) === want),
    "4 master cases",
  );
  const reserveCases: readonly [ReserveStripNotice | null, string | null][] = [
    [null, null],
    [{ tone: "red", lines: ["x"] }, "attention"],
    [{ tone: "info", lines: ["x"] }, "info"],
  ];
  check(
    "reserveEntry: red -> attention; info -> info; null -> null",
    reserveCases.every(([n, want]) => (reserveEntry(n)?.severity ?? null) === want),
    "3 reserve cases",
  );

  // ── N5 the header nav offers every destination, none lost to the layout ─────────
  header("N5 the header nav offers every destination, none lost to the layout");
  const items = navItemsUnderTest();
  const itemDests = items.map((i) => i.dest);
  const declared = new Set<string>(SHEET_TRANSITION_NAMES);
  check(
    "the nav model covers exactly NAV_DESTS — no destination dropped or duplicated",
    itemDests.length === NAV_DESTS.length &&
      new Set(itemDests).size === itemDests.length &&
      NAV_DESTS.every((d) => itemDests.includes(d)) &&
      itemDests.every((d) => (NAV_DESTS as readonly string[]).includes(d)),
    `${itemDests.join(", ")} vs ${NAV_DESTS.join(", ")}`,
  );
  check(
    "presence sibling: the nav model is non-empty and each item names a labelled destination",
    items.length > 0 && items.every((i) => i.label.length > 0),
    `${String(items.length)} items`,
  );
  check(
    "every nav destination dispatches a DECLARED sheet transition",
    items.every((i) => declared.has(i.transition)),
    items.map((i) => i.transition).join(", "),
  );

  console.log("");
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

// PRESET RED, per lessons/a-default-exit-code-is-a-default-verdict.md.
process.exitCode = 1;

try {
  const code = main();
  console.log(`PROVE_NOTICESTACK_EXIT=${String(code)}`);
  process.exitCode = code;
} catch (err: unknown) {
  console.log("");
  console.log(`  [FAIL] the run died: ${err instanceof Error ? err.message : String(err)}`);
  console.log("PROVE_NOTICESTACK_EXIT=1");
  process.exitCode = 1;
}
