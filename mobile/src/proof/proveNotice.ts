/**
 * Phase 2c-7 proof: WHAT THE OPERATOR READS, in every state.
 *
 * Run: npm run prove:notice
 *
 * WHY THIS FILE EXISTS. Phase 2c-6 ended with every layer correct and the screen
 * still saying ผิดพลาด in red, and the reason no proof caught it was recorded at
 * the time: "not one of them asserted anything about what the operator reads"
 * (lessons/correct-classification-can-still-render-as-an-error.md). S7/S8 in
 * proveSeller then covered the PARKED case — the one that had just bitten. This
 * phase found the two states that fix did not cover:
 *
 *   - an OFFLINE bill, whose card read `ผิดพลาด: network: Network request failed`
 *     in red while the status strip, correctly, said ออฟไลน์;
 *   - an EXPIRED SESSION, reported as ออฟไลน์ with one bill queued and as a
 *     poisoned queue ("ติดต่อฝ่ายสนับสนุน") with several.
 *
 * Fixing the case that bit and leaving the neighbours is what produced both. So
 * this proof does not sample: it enumerates the FULL cross product of every
 * input the two rendering functions have, and asserts properties over all of it.
 *
 * THE MATRIX
 *   card   sync_state(4) x attempt_count(0,>0) x parked(2) x voided(2)
 *          x session(3)                                          =  96 cells
 *   void   sync_state(4) x doc_no(2) x void_requested(2) x settled(2) = 32 cells
 *   strip  session(3) x online(3) x pending(2) x failed(2)
 *          x blocked(2) x master-data(2)                         = 144 cells
 *
 * Some cells are unreachable in production (a 'synced' bill that is also parked
 * cannot exist — markSynced clears the parked columns). They are included
 * anyway: a rendering function that is only correct on the states someone
 * remembered is exactly what shipped twice now.
 *
 * ON THE OUTPUT. This proof is almost entirely Thai. If the console shows
 * mojibake that is the console — this box is codepage 874, see
 * lessons/console-is-not-the-observation.md. Every assertion below compares
 * JavaScript strings, which are unaffected by how the terminal draws them.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { createLocalBill } from "../sync/createBill.js";
import { SyncEngine } from "../sync/engine.js";
import {
  billNotice,
  canRequestVoid,
  voidProgressLine,
} from "../sync/parkedReason.js";
import type {
  NoticeInput,
  NoticeTone,
  SessionState,
  VoidProgressInput,
} from "../sync/parkedReason.js";
import { statusNotice } from "../sync/statusNotice.js";
import type { StatusInput } from "../sync/statusNotice.js";
import type { SyncState } from "../sync/types.js";
import { FakeClock, RejectingTransport, SeqIds } from "./fakes.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/**
 * One check over a whole sweep, naming the offenders rather than printing a
 * line per cell. A per-cell ledger of 96 OKs hides the one FAIL in the middle.
 */
function checkAll<T>(
  label: string,
  cells: readonly T[],
  ok: (cell: T) => boolean,
  describe: (cell: T) => string,
): void {
  const bad = cells.filter((c) => !ok(c));
  check(
    label,
    bad.length === 0,
    bad.length === 0
      ? `${String(cells.length)} cells, all clean`
      : `${String(bad.length)}/${String(cells.length)} FAILED: ${bad.slice(0, 4).map(describe).join(" | ")}`,
  );
}

/* ------------------------------------------------------- forbidden text ---- */

/**
 * Developer diagnostics. A bill card or a status strip containing ANY of these
 * is leaking something built for a bug report to someone with wet hands and a
 * queue — that is the whole distinction the 2c-6 lesson draws, and these are the
 * literal fragments the two real failures contained.
 *
 * `network` and `Network request failed` are what OfflineTransport produces and
 * what the yard actually saw on every card. `HTTP`, the status numbers and the
 * JSON punctuation are what the transport builds into last_error.
 */
const DIAGNOSTIC_FRAGMENTS: readonly (readonly [string, string])[] = [
  ["a network error string", "network"],
  ["the React Native transport message", "Network request failed"],
  ["an HTTP status line", "HTTP"],
  ["the 401 status", "401"],
  ["the 422 status", "422"],
  ["the 424 status", "424"],
  ["a 5xx status", "503"],
  ["JSON punctuation", '{"'],
  ["the `kind` field", "kind"],
  ["a raw reason code", "_unset"],
  ["a UUID", "aaaa0000"],
  ["a socket message", "socket"],
  ["the word fetch", "fetch"],
  ["a stringified null", "null"],
  ["a stringified undefined", "undefined"],
];

const leaks = (text: string): string[] =>
  DIAGNOSTIC_FRAGMENTS.filter(([, needle]) => text.includes(needle)).map(([l]) => l);

const ERROR_WORD = "ผิดพลาด";

/**
 * Promises that the bill will send itself. True of an outage, of a parked bill
 * and of an ended session — all three are WAITING, and all three do resolve
 * themselves once the network / the office / the sign-in happens.
 *
 * A terminally failed bill is the one case where the system cannot keep any of
 * them: nothing retries a `failed` row, ever. Saying it here would be the same
 * class of lie as "รอส่งบิลเข้าระบบก่อน แล้วจะยกเลิกให้อัตโนมัติ" on a bill that
 * can never be sent.
 */
const AUTO_SEND_PROMISES: readonly string[] = [
  "จะส่งให้เอง",
  "ส่งเองอัตโนมัติ",
  "อัตโนมัติ",
  "เมื่อเน็ตกลับมา",
  "เมื่อเชื่อมต่อได้",
];

const promises = (text: string): string[] =>
  AUTO_SEND_PROMISES.filter((p) => text.includes(p));

/* ------------------------------------------------------------------ N1 ---- */

const STATES: readonly SyncState[] = ["pending", "syncing", "synced", "failed"];
const ATTEMPTS: readonly number[] = [0, 3];
const SESSIONS: readonly SessionState[] = ["active", "expired", "signed_out"];
const BOOLS: readonly boolean[] = [false, true];

interface CardCell {
  sync_state: SyncState;
  attempts: number;
  parked: boolean;
  voided: boolean;
  session: SessionState;
}

const cardInput = (c: CardCell): NoticeInput => ({
  sync_state: c.sync_state,
  attempt_count: c.attempts,
  master_data_missing_at: c.parked ? "2026-07-27T02:00:00.000Z" : null,
  master_data_code: c.parked ? "seller_grade_unset" : null,
  void_requested_at: c.voided ? "2026-07-27T02:05:00.000Z" : null,
});

const cardText = (c: CardCell): string => {
  const n = billNotice(cardInput(c), c.session);
  return `${n.badge ?? ""} ${n.lines.join(" ")}`;
};

const cardTone = (c: CardCell): NoticeTone => billNotice(cardInput(c), c.session).tone;

const describeCard = (c: CardCell): string =>
  `${c.sync_state}/att${String(c.attempts)}/${c.parked ? "parked" : "free"}/` +
  `${c.voided ? "voided" : "live"}/${c.session}`;

/**
 * The precedence, restated independently of the implementation.
 *
 * Be honest about what this catches: it is a second statement of the same rule,
 * so it catches a REORDERING or a dropped branch, not a shared misunderstanding
 * of what the rule should be. The property assertions that follow are the ones
 * that do not depend on agreeing with the implementation about anything.
 */
function expectedTone(c: CardCell): NoticeTone {
  if (c.sync_state === "failed") return "error";
  if (c.voided) return "none";
  if (c.parked) return "parked";
  if (c.sync_state !== "pending" && c.sync_state !== "syncing") return "none";
  if (c.session !== "active") return "session";
  if (c.attempts > 0) return "waiting";
  return "none";
}

function n1CardMatrix(): CardCell[] {
  header("N1: the bill card, over all 96 states");

  const cells: CardCell[] = [];
  for (const sync_state of STATES) {
    for (const attempts of ATTEMPTS) {
      for (const parked of BOOLS) {
        for (const voided of BOOLS) {
          for (const session of SESSIONS) {
            cells.push({ sync_state, attempts, parked, voided, session });
          }
        }
      }
    }
  }

  // 32 rows, each showing the tone under all three session states.
  console.log("  state    att parked voided | active  expired signed_out");
  for (const sync_state of STATES) {
    for (const attempts of ATTEMPTS) {
      for (const parked of BOOLS) {
        for (const voided of BOOLS) {
          const tones = SESSIONS.map((session) =>
            cardTone({ sync_state, attempts, parked, voided, session }).padEnd(7),
          ).join(" ");
          console.log(
            `  ${sync_state.padEnd(8)} ${String(attempts).padEnd(3)}` +
              ` ${(parked ? "yes" : "no").padEnd(6)} ${(voided ? "yes" : "no").padEnd(6)} | ${tones}`,
          );
        }
      }
    }
  }

  checkAll(
    "every cell's tone matches the precedence rule",
    cells,
    (c) => cardTone(c) === expectedTone(c),
    (c) => `${describeCard(c)} got ${cardTone(c)} want ${expectedTone(c)}`,
  );

  // THE PROPERTY THAT WOULD HAVE CAUGHT DEFECT 1. Not one of these 96 cells may
  // contain a fragment of a transport diagnostic, in any tone, in any session.
  checkAll(
    "no cell contains a transport diagnostic, in ANY tone",
    cells,
    (c) => leaks(cardText(c)).length === 0,
    (c) => `${describeCard(c)} leaked ${leaks(cardText(c)).join(", ")}`,
  );

  // ผิดพลาด is not banned outright — a genuine terminal refusal IS an error and
  // must say so. It is banned everywhere else. Over-broad was the mistake S8
  // made first, and it pushes the fix toward silencing real failures.
  checkAll(
    "the word ผิดพลาด appears ONLY where tone is error",
    cells,
    (c) => !cardText(c).includes(ERROR_WORD) || cardTone(c) === "error",
    (c) => `${describeCard(c)} tone=${cardTone(c)} says ผิดพลาด`,
  );

  checkAll(
    "tone error holds if and only if the bill is terminally failed",
    cells,
    (c) => (cardTone(c) === "error") === (c.sync_state === "failed"),
    (c) => `${describeCard(c)} tone=${cardTone(c)}`,
  );

  // DEFECT 3's rule, over every failed cell: a bill that can never be sent must
  // never say it will send, cancel, or resolve itself.
  const failedCells = cells.filter((c) => c.sync_state === "failed");
  checkAll(
    "a terminally failed bill never promises it will send itself",
    failedCells,
    (c) => promises(cardText(c)).length === 0,
    (c) => `${describeCard(c)} promised ${promises(cardText(c)).join(", ")}`,
  );
  check(
    "...and that sweep was not empty",
    failedCells.length === 24,
    `${String(failedCells.length)} failed cells covered`,
  );

  checkAll(
    "a failed bill always names who must act (the office), whatever else is true of it",
    failedCells,
    (c) => cardText(c).includes("สำนักงาน"),
    (c) => `${describeCard(c)} says nothing about the office`,
  );

  checkAll(
    "every visible notice has at least one non-empty line, and 'none' has none",
    cells,
    (c) => {
      const n = billNotice(cardInput(c), c.session);
      return n.tone === "none"
        ? n.lines.length === 0 && n.badge === null
        : n.lines.length > 0 && n.lines.every((l) => l.trim().length > 0);
    },
    describeCard,
  );

  // A replacement badge exists only for the two states whose sync_state badge
  // would mislead: a parked bill and a bill with no session both read รอส่ง,
  // which is true and useless — nothing at the yard will make either send.
  checkAll(
    "a badge is replaced only for parked and session states",
    cells,
    (c) => {
      const badge = billNotice(cardInput(c), c.session).badge;
      const tone = cardTone(c);
      return badge === null ? tone !== "parked" && tone !== "session" : tone === "parked" || tone === "session";
    },
    (c) => `${describeCard(c)} tone=${cardTone(c)}`,
  );

  return cells;
}

/* ------------------------------------------------------------------ N2 ---- */

interface VoidCell {
  sync_state: SyncState;
  hasDocNo: boolean;
  requested: boolean;
  settled: boolean;
}

const voidInput = (c: VoidCell): VoidProgressInput => ({
  sync_state: c.sync_state,
  doc_no: c.hasDocNo ? "B-2569-105" : null,
  void_requested_at: c.requested ? "2026-07-27T02:05:00.000Z" : null,
  voided_at: c.settled ? "2026-07-27T02:06:00.000Z" : null,
});

const describeVoid = (c: VoidCell): string =>
  `${c.sync_state}/${c.hasDocNo ? "doc" : "nodoc"}/${c.requested ? "req" : "-"}/${c.settled ? "settled" : "-"}`;

function n2VoidMatrix(): void {
  header("N2: what a void promises, over all 32 states");

  const cells: VoidCell[] = [];
  for (const sync_state of STATES) {
    for (const hasDocNo of BOOLS) {
      for (const requested of BOOLS) {
        for (const settled of BOOLS) {
          cells.push({ sync_state, hasDocNo, requested, settled });
        }
      }
    }
  }

  for (const c of cells.filter((x) => x.requested && !x.settled)) {
    console.log(`  ${describeVoid(c).padEnd(28)} ${String(voidProgressLine(voidInput(c)))}`);
  }

  check(
    "no void requested -> no void region at all",
    cells.filter((c) => !c.requested).every((c) => voidProgressLine(voidInput(c)) === null),
  );
  check(
    "a void requested -> always a line, never a blank box",
    cells.filter((c) => c.requested).every((c) => (voidProgressLine(voidInput(c)) ?? "").length > 0),
  );

  /*
   * THE DEFECT. A terminally failed bill used to be told, via a doc_no ternary,
   * "รอส่งบิลเข้าระบบก่อน แล้วจะยกเลิกให้อัตโนมัติ" — wait for it to sync and it
   * will be cancelled automatically. listVoidsToApply requires sync_state
   * 'synced', and nothing moves a failed bill there, so that could never happen.
   * The cash was paid, the server has no record, and the card said "handled".
   */
  const failedOwed = cells.filter((c) => c.sync_state === "failed" && c.requested && !c.settled);
  checkAll(
    "a failed bill's void NEVER claims it will happen automatically",
    failedOwed,
    (c) => promises(voidProgressLine(voidInput(c)) ?? "").length === 0,
    (c) => `${describeVoid(c)} -> ${String(voidProgressLine(voidInput(c)))}`,
  );
  checkAll(
    "...it says the system never had the bill, and names the office",
    failedOwed,
    (c) => {
      const line = voidProgressLine(voidInput(c)) ?? "";
      return line.includes("ไม่เคยรับ") && line.includes("สำนักงาน");
    },
    (c) => `${describeVoid(c)} -> ${String(voidProgressLine(voidInput(c)))}`,
  );
  check(
    "...and that sweep was not empty",
    failedOwed.length === 2,
    `${String(failedOwed.length)} cells (doc_no present and absent)`,
  );

  // The promise is still MADE where it is true: a pending or parked bill really
  // does sync first and then void itself. The fix must not have silenced that.
  const pendingOwed = cells.filter(
    (c) => c.sync_state === "pending" && c.requested && !c.settled && !c.hasDocNo,
  );
  checkAll(
    "an unsynced but sendable bill still promises the automatic cancel — it is true there",
    pendingOwed,
    (c) => (voidProgressLine(voidInput(c)) ?? "").includes("อัตโนมัติ"),
    (c) => `${describeVoid(c)} -> ${String(voidProgressLine(voidInput(c)))}`,
  );

  checkAll(
    "no void line leaks a diagnostic",
    cells,
    (c) => leaks(voidProgressLine(voidInput(c)) ?? "").length === 0,
    describeVoid,
  );

  /*
   * The button and the sentence are decided by the same module, so they cannot
   * drift into offering an action the card has just explained is impossible.
   */
  checkAll(
    "voiding is offered exactly when the bill is live and the server could have it",
    cells,
    (c) => canRequestVoid(voidInput(c)) === (!c.requested && c.sync_state !== "failed"),
    describeVoid,
  );
  check(
    "a terminally failed bill is never offered a void — there is nothing to void",
    cells.filter((c) => c.sync_state === "failed").every((c) => !canRequestVoid(voidInput(c))),
  );
}

/* ------------------------------------------------------------------ N3 ---- */

interface StripCell {
  session: SessionState;
  online: boolean | null;
  pending: number;
  failed: number;
  blocked: boolean;
  masterData: number;
}

const stripInput = (c: StripCell): StatusInput => ({
  session: c.session,
  online: c.online,
  pending: c.pending,
  failed: c.failed,
  blocked: c.blocked ? { behind: 2, forMs: 120_000, attempts: 6 } : null,
  waitingOnMasterData: c.masterData,
  masterDataCodes: c.masterData > 0 ? ["seller_grade_unset", "seller_grade_unset"] : [],
});

const describeStrip = (c: StripCell): string =>
  `${c.session}/online=${String(c.online)}/pend${String(c.pending)}/fail${String(c.failed)}/` +
  `${c.blocked ? "blocked" : "-"}/md${String(c.masterData)}`;

function n3StripMatrix(): void {
  header("N3: the status strip, over all 144 states");

  const cells: StripCell[] = [];
  for (const session of SESSIONS) {
    for (const online of [null, true, false] as const) {
      for (const pending of [0, 2]) {
        for (const failed of [0, 1]) {
          for (const blocked of BOOLS) {
            for (const masterData of [0, 2]) {
              cells.push({ session, online, pending, failed, blocked, masterData });
            }
          }
        }
      }
    }
  }

  // One example per session state, with everything else at its worst, so the
  // ranking is visible rather than merely asserted.
  for (const session of SESSIONS) {
    const worst: StripCell = { session, online: false, pending: 2, failed: 1, blocked: true, masterData: 2 };
    const n = statusNotice(stripInput(worst));
    console.log(`  ${session.padEnd(11)} tone=${n.tone.padEnd(5)} action=${n.action?.kind ?? "-"}`);
    console.log(`    ${n.message}`);
  }

  const expired = cells.filter((c) => c.session !== "active");

  /*
   * DEFECT 2, stated as a property. With no usable session the strip must not
   * blame the network and must not send anyone to support — those were the two
   * things it actually said, depending only on how many bills happened to be
   * queued. It must name the sign-in, and carry it.
   */
  checkAll(
    "with no session the strip NEVER says ออฟไลน์",
    expired,
    (c) => !statusNotice(stripInput(c)).message.includes("ออฟไลน์"),
    describeStrip,
  );
  checkAll(
    "with no session the strip NEVER says call support",
    expired,
    (c) => !statusNotice(stripInput(c)).message.includes("ฝ่ายสนับสนุน"),
    describeStrip,
  );
  checkAll(
    "with no session the strip always names the sign-in",
    expired,
    (c) => statusNotice(stripInput(c)).message.includes("เข้าสู่ระบบ"),
    describeStrip,
  );
  checkAll(
    "with no session there is always a sign-in button — a message naming an action must carry it",
    expired,
    (c) => statusNotice(stripInput(c)).action?.kind === "sign_in",
    describeStrip,
  );
  check(
    "...and that sweep was not empty",
    expired.length === 96,
    `${String(expired.length)} of ${String(cells.length)} cells have no session`,
  );

  checkAll(
    "the sign-in button appears if and only if there is no session",
    cells,
    (c) => (statusNotice(stripInput(c)).action?.kind === "sign_in") === (c.session !== "active"),
    describeStrip,
  );
  checkAll(
    "with no session the queue count is still reported truthfully",
    expired.filter((c) => c.pending > 0),
    (c) => statusNotice(stripInput(c)).message.includes(String(c.pending)),
    describeStrip,
  );
  checkAll(
    "no strip message leaks a diagnostic",
    cells,
    (c) => leaks(statusNotice(stripInput(c)).message).length === 0,
    (c) => `${describeStrip(c)} leaked ${leaks(statusNotice(stripInput(c)).message).join(", ")}`,
  );
  checkAll(
    "every strip message is non-empty",
    cells,
    (c) => statusNotice(stripInput(c)).message.trim().length > 0,
    describeStrip,
  );
  // Red is reserved. An ended session is amber: it is a waiting state with a
  // known fix, like an outage and like parking.
  checkAll(
    "red is only ever a poisoned head or a bill the server refused",
    cells,
    (c) => {
      const n = statusNotice(stripInput(c));
      return n.tone !== "bad" || (c.session === "active" && (c.blocked || c.failed > 0));
    },
    describeStrip,
  );
}

/* ------------------------------------------------------------------ N4 ---- */

/**
 * THE DISPROOF. Every assertion above is worthless unless something could have
 * made it fail, so here is the code that did — the pre-fix renderers, kept
 * byte-accurate, fed the inputs the yard actually hit.
 */

/** app/BillsPanel.tsx as it stood before this phase, via the old billNotice. */
function preFixCard(lastError: string | null, parked: boolean, voided: boolean): string {
  if (voided) return "";
  if (parked) return "(parked — the 2c-6 fix handled this one)";
  if (lastError !== null) return `ผิดพลาด: ${lastError}`;
  return "";
}

/** app/StatusStrip.tsx as it stood before this phase: no session branch at all. */
function preFixStrip(c: StripCell): string {
  if (c.blocked) {
    return "บิล 1 ใบส่งไม่ผ่าน 6 ครั้งติด นาน 2 นาที ทั้งที่เชื่อมต่อเซิร์ฟเวอร์ได้" +
      " — ค้างหน้าคิวจนอีก 2 ใบส่งไม่ได้ ต้องติดต่อฝ่ายสนับสนุน";
  }
  if (c.masterData > 0) return "รอข้อมูลจากสำนักงาน";
  if (c.failed > 0) return "ส่งไม่สำเร็จ 1 ใบ — ต้องแก้ไข";
  if (c.online === false) {
    return c.pending > 0
      ? `ออฟไลน์ — เก็บไว้ในเครื่อง ${String(c.pending)} ใบ จะส่งให้เองเมื่อเน็ตกลับมา`
      : "ออฟไลน์ — บันทึกได้ตามปกติ";
  }
  if (c.pending > 0) return `กำลังส่ง ${String(c.pending)} ใบ`;
  return "พร้อมใช้งาน";
}

function n4Disproof(): void {
  header("N4: the disproof — what the pre-fix code produced for these same inputs");

  /* ---- DEFECT 1: the offline card. */
  const OFFLINE_ERROR = "network: Network request failed";
  const before = preFixCard(OFFLINE_ERROR, false, false);
  const afterCell: CardCell = {
    sync_state: "pending", attempts: 3, parked: false, voided: false, session: "active",
  };
  const after = cardText(afterCell);
  console.log(`  offline bill, BEFORE:\n    ${before}`);
  console.log(`  offline bill, AFTER:\n    ${after.trim()}`);

  check(
    "the pre-fix offline card DID leak the transport string — so N1's sweep is not vacuous",
    leaks(before).length >= 2,
    `leaked: ${leaks(before).join(", ")}`,
  );
  check(
    "the pre-fix offline card DID call a retryable bounce an error",
    before.includes(ERROR_WORD),
    before,
  );
  check(
    "the same bill now reads as WAITING, with nothing of the diagnostic left",
    cardTone(afterCell) === "waiting" && leaks(after).length === 0 && !after.includes(ERROR_WORD),
    `tone=${cardTone(afterCell)}`,
  );

  /* ---- DEFECT 2: the strip, both bill counts. */
  const oneBill: StripCell = {
    session: "expired", online: false, pending: 1, failed: 0, blocked: false, masterData: 0,
  };
  // With several bills the old 401 classification (unavailable, reachable:true)
  // ran the poison clock and the counter, so the alarm fired: blocked = true.
  const threeBills: StripCell = {
    session: "expired", online: true, pending: 3, failed: 0, blocked: true, masterData: 0,
  };

  for (const [label, cell] of [["1 queued bill", oneBill], ["3 queued bills", threeBills]] as const) {
    console.log(`\n  expired session, ${label}`);
    console.log(`    BEFORE: ${preFixStrip(cell)}`);
    console.log(`    AFTER:  ${statusNotice(stripInput(cell)).message}`);
    console.log(`    AFTER action: ${statusNotice(stripInput(cell)).action?.label ?? "(none)"}`);
  }

  check(
    "BEFORE, one queued bill blamed the network",
    preFixStrip(oneBill).includes("ออฟไลน์"),
    preFixStrip(oneBill),
  );
  check(
    "BEFORE, three queued bills sent the yard to support",
    preFixStrip(threeBills).includes("ฝ่ายสนับสนุน"),
  );
  check(
    "BEFORE, neither wording mentioned signing in — the one thing that fixes it",
    !preFixStrip(oneBill).includes("เข้าสู่ระบบ") && !preFixStrip(threeBills).includes("เข้าสู่ระบบ"),
  );
  check(
    "AFTER, both say the same true thing and offer the same button",
    statusNotice(stripInput(oneBill)).action?.kind === "sign_in" &&
      statusNotice(stripInput(threeBills)).action?.kind === "sign_in",
  );

  /* ---- DEFECT 3: the void promise. */
  const failedOwed: VoidProgressInput = {
    sync_state: "failed", doc_no: null,
    void_requested_at: "2026-07-27T02:05:00.000Z", voided_at: null,
  };
  const preFixVoidLine =
    failedOwed.doc_no === null
      ? "รอส่งบิลเข้าระบบก่อน แล้วจะยกเลิกให้อัตโนมัติ"
      : "รอแจ้งระบบ จะดำเนินการให้อัตโนมัติ";
  console.log(`\n  failed bill with a void requested, BEFORE:\n    ${preFixVoidLine}`);
  console.log(`  failed bill with a void requested, AFTER:\n    ${String(voidProgressLine(failedOwed))}`);
  check(
    "BEFORE, the failed bill was promised an automatic cancel that could never run",
    promises(preFixVoidLine).length > 0,
    `promised: ${promises(preFixVoidLine).join(", ")}`,
  );
  check(
    "AFTER, it says the system never had the bill",
    promises(voidProgressLine(failedOwed) ?? "").length === 0,
    String(voidProgressLine(failedOwed)),
  );
}

/* ------------------------------------------------------------------ N5 ---- */

/**
 * The failed state is not hypothetical. Drive a REAL SqliteLocalStore and the
 * REAL engine into it with a server that refuses the bill (422), then render the
 * card from the row that is actually on disk.
 *
 * The void is requested BEFORE the refusal, which is the ordering that made the
 * old card lie twice over: it showed ยกเลิกแล้ว, hid the failure behind it, and
 * promised an automatic cancel.
 */
async function n5ReachableAndRendered(): Promise<void> {
  header("N5: the failed state is REACHABLE, and renders correctly from a real row");

  const dir = mkdtempSync(join(tmpdir(), "recycle-2c7-notice-"));
  const driver = NodeSqliteDriver.open(join(dir, "bills.db"));
  const store = await SqliteLocalStore.open(driver);
  const clock = new FakeClock();
  const ids = new SeqIds("notice");

  const bill = await createLocalBill(
    { store, clock, ids },
    {
      seller_id: "s-001",
      vehicle_no: "70-1234",
      total_amount: "150.05",
      master_as_of: null,
      items: [
        {
          id: ids.newId(), product_id: "prod-FE", line_no: 1,
          gross_weight: "10.005", tare_weight: "0.002", net_weight: "10.003",
          unit_price: "15.00", list_price: "15.00",
        },
      ],
    },
  );

  // The owner cancels it while it is still unsent — a real sequence, and the one
  // that hides the failure if `voided` outranks `failed`.
  await store.requestVoid(bill.id, "ชั่งผิด", clock.now());

  const engine = new SyncEngine({
    store,
    transport: new RejectingTransport(),
    clock,
    backoffBaseMs: 1000,
  });
  const run = await engine.runOnce();
  const row = await store.getBill(bill.id);

  console.log(
    `  after one pass: rejected=${String(run.rejected)}` +
      ` state=${String(row?.sync_state)} doc_no=${String(row?.doc_no)}` +
      ` void_requested=${row?.void_requested_at === null ? "no" : "yes"}`,
  );
  check(
    "a 422 really does drive a real row to 'failed'",
    run.rejected === 1 && row?.sync_state === "failed",
    `state=${String(row?.sync_state)}`,
  );
  check(
    "the server has no doc_no for it — there is genuinely nothing on the server",
    row?.doc_no === null,
  );
  check(
    "the diagnostic IS still on the row for a bug report",
    row?.last_error !== null && (row?.last_error ?? "").includes("HTTP 422"),
    "keeping it is deliberate; rendering it is the bug",
  );

  if (row !== null) {
    const notice = billNotice(row, "active");
    const line = voidProgressLine(row);
    const text = `${notice.badge ?? ""} ${notice.lines.join(" ")}`;
    console.log(`  card tone: ${notice.tone}`);
    for (const l of notice.lines) console.log(`    ${l}`);
    console.log(`  void line: ${String(line)}`);

    check(
      "the card shows the failure even though a void was requested first",
      notice.tone === "error",
      `tone=${notice.tone} — voided must not outrank failed, or the money vanishes quietly`,
    );
    check("the rendered card leaks nothing", leaks(text).length === 0);
    check("the rendered card promises nothing it cannot do", promises(text).length === 0);
    check(
      "the void line tells the truth about a bill the server never had",
      (line ?? "").includes("ไม่เคยรับ") && promises(line ?? "").length === 0,
      String(line),
    );
    check(
      "and the void button is withdrawn — the action does not exist for this bill",
      !canRequestVoid(row),
    );
  }

  // The row is KEPT. This is the only record that cash left the drawer, so a
  // hard delete here would be the money disappearing silently (hard rule 5).
  const stillThere = await store.listByState("failed");
  check(
    "the bill is still on the device — the only evidence the purchase happened",
    stillThere.length === 1 && stillThere[0]?.id === bill.id,
    `${String(stillThere.length)} failed bill(s) retained`,
  );

  await driver.close();
  rmSync(dir, { recursive: true, force: true });
}

/* ---------------------------------------------------------------- main --- */

async function main(): Promise<number> {
  console.log("Phase 2c-7 — what the operator reads, in every state");
  console.log(`node ${process.version}`);

  const cards = n1CardMatrix();
  n2VoidMatrix();
  n3StripMatrix();
  n4Disproof();
  await n5ReachableAndRendered();

  console.log("");
  console.log(`states enumerated: ${String(cards.length)} card + 32 void + 144 strip`);
  console.log(failures === 0 ? "ALL NOTICE CASES PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

const code = await main();
console.log(`NOTICE_EXIT=${code}`);
process.exitCode = code;
