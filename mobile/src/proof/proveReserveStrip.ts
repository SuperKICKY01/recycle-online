/**
 * THE CONTINUOUS RESERVE STRIP — the four states it shows, the calm one it
 * suppresses, and its refusal to present a stale target as fresh. Proven over
 * the pure `reserveStripNotice`, plus ONE integration cell that drives a real
 * `SyncEngine.runOnce` to prove the engine persists the target.
 *
 *   npm run prove:reservestrip
 *   npm run prove:reservestrip -- --break=<amplenull|truststale>
 *
 * ---------------------------------------------------------------------------
 * WHAT THE PURE CELLS CANNOT SEE, AND WHAT THE INTEGRATION CELL ADDS
 * ---------------------------------------------------------------------------
 * The pure cells drive `reserveStripNotice` directly, so a green there says the
 * DECISION is right, not that the strip draws it (`app/ReserveStrip.tsx` is
 * outside `tsconfig.node.json`). They assert the CONCATENATION in draw order,
 * the strongest thing a headless proof holds about a card of regions.
 *
 * The integration cell closes the seam the commit-1 confusion lived in: NO proof
 * drove `SyncEngine.runOnce` (the refill call site), so nothing had ever run
 * `topUpReservations`. This does — a real store, a real engine, a refill answer
 * with a target — and asserts the target is persisted and read back, and that an
 * offline pass leaves the last-known one (`two-green-proofs-do-not-cover-the-seam`).
 *
 * PRESET RED, and two breaks armed by `--break`, each damaging the render in this
 * file and never in `src/master`
 * (`lessons/a-check-that-never-went-red-was-never-observed.md`).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteLocalSellerStore } from "../adapters/sqlite/SqliteLocalSellerStore.js";
import { SqliteLocalStore } from "../adapters/sqlite/SqliteLocalStore.js";
import { reserveLevelNotice } from "../master/reserveNotice.js";
import { reserveStripNotice } from "../master/reserveStrip.js";
import type { ReserveStripNotice, ReserveStripState } from "../master/reserveStrip.js";
import { SyncEngine } from "../sync/engine.js";
import type { SellerCreateOutcome } from "../sync/sellerCreate.js";
import type { RefillOutcome } from "../sync/sellerRefill.js";
import type { LocalSeller } from "../sync/localSeller.js";
import { FakeClock, FixedDeviceStore, OfflineTransport } from "./fakes.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const BREAK = (process.argv.find((a) => a.startsWith("--break=")) ?? "").split("=")[1] ?? "";

const BREAK_MODES: readonly string[] = ["amplenull", "truststale"];

if (BREAK !== "" && !BREAK_MODES.includes(BREAK)) {
  console.log(`  [FAIL] unknown --break=${BREAK} — nothing was damaged and nothing was measured`);
  console.log(`         known breaks: ${BREAK_MODES.join(", ")}`);
  console.log("RESERVESTRIP_EXIT=2");
  process.exit(2);
}

// PRESET RED: cleared to 0 only if every cell passes.
process.exitCode = 1;

const NOW = "2026-08-28T12:00:00.000Z";
const FRESH_AT = "2026-08-28T11:59:00.000Z"; // 1 min old — trusted
const STALE_AT = "2026-08-27T23:00:00.000Z"; // 13 h old — past the 12h cutoff
const FUTURE_AT = "2026-08-28T12:10:00.000Z"; // 10 min ahead — clock moved back

/** A reserve state with sensible defaults; override the field a cell is about. */
function state(over: Partial<ReserveStripState>): ReserveStripState {
  return { spendable: 5, held: 10, target: 10, targetAt: FRESH_AT, now: NOW, ...over };
}

/** The strip as it is drawn: every line, in order. */
function drawn(notice: ReserveStripNotice | null): string {
  return notice === null ? "" : notice.lines.join("\n");
}

/**
 * The render under test, with the break wrappers INSIDE it.
 *
 *   truststale — pretend every target is as fresh as `now`, so a stale or
 *                clock-suspect one is trusted. C5 and C6 must redden.
 *   amplenull  — draw the ample state instead of suppressing it. C1 must redden.
 */
function render(s: ReserveStripState): ReserveStripNotice | null {
  if (BREAK === "truststale") {
    return reserveStripNotice({ ...s, targetAt: s.now });
  }
  const n = reserveStripNotice(s);
  if (BREAK === "amplenull" && n === null) {
    return { tone: "info", lines: reserveLevelNotice("ample", s.spendable).lines };
  }
  return n;
}

const HAS_THAI = /[฀-๿]/;
/** A uuid or a JSON delimiter — neither belongs on this strip. */
const DIAGNOSTIC = /[0-9a-f]{8}-[0-9a-f]{4}|[{}"]/;

function c1AmpleSuppressed(): void {
  header("C1 ample renders NOTHING — the calm state nobody needs a line about");
  const notice = render(state({ spendable: 10, held: 10, target: 10, targetAt: FRESH_AT }));
  check("C1: a fresh, at-target holding suppresses the strip (null)", notice === null, drawn(notice));
}

function c2LowShowsCount(): void {
  header("C2 low shows the true spendable COUNT, calm");
  const notice = render(state({ spendable: 3, held: 10, target: 10, targetAt: FRESH_AT }));
  const text = drawn(notice);
  check("C2: below target renders a strip", notice !== null);
  check("C2: tone is info (calm)", notice?.tone === "info", String(notice?.tone));
  check("C2: it names the real spendable count (3)", text.includes("3"));
  check("C2: it promises the top-up happens WHEN online, not now", text.includes("จะเติมเองเมื่อต่อเน็ต"));
  check("C2: renders Thai", HAS_THAI.test(text));
  check("C2: no diagnostic (uuid/JSON) on the strip", !DIAGNOSTIC.test(text), text);
}

function c3Exhausted(): void {
  header("C3 exhausted — codes once held, now all spent — needs a person");
  const notice = render(state({ spendable: 0, held: 10 }));
  const text = drawn(notice);
  check("C3: tone is red", notice?.tone === "red", String(notice?.tone));
  check("C3: it names being USED UP", text.includes("หมด"));
  check("C3: it does NOT claim the device never received a quota", !text.includes("ยังไม่เคยรับ"));
  check("C3: it names what is still possible — a bill against an existing seller", text.includes("ผู้ขายที่มีอยู่"));
  check("C3: no diagnostic on the strip", !DIAGNOSTIC.test(text), text);
}

function c4NeverProvisionedNoNumber(): void {
  header("C4 never provisioned — and it shows NO NUMBER, because it has none");
  const notice = render(state({ spendable: 0, held: 0, target: null, targetAt: null }));
  const text = drawn(notice);
  check("C4: tone is red", notice?.tone === "red", String(notice?.tone));
  check("C4: it names NEVER HAVING RECEIVED a quota", text.includes("ยังไม่เคยรับ"));
  check("C4: it does NOT say the codes were used up (หมด)", !text.includes("หมด"));
  // THE never_provisioned-NOT-A-NUMBER CASE: a device that has spent nothing has
  // no count to show, and inventing a 0 would be a number an operator reads.
  check("C4: the sentence carries NO DIGIT — a count is never defaulted", !/\d/.test(text), text);
}

function c5StaleTargetDegradesToLow(): void {
  header("C5 a STALE target is not presented as fresh — ample degrades to the count");
  // Fresh, this holding is ample and suppressed.
  const fresh = render(state({ spendable: 10, held: 10, target: 10, targetAt: FRESH_AT }));
  check("C5: with a FRESH target, an at-target holding is ample (suppressed, null)", fresh === null, drawn(fresh));
  // The SAME holding with a 13h-old target must not claim sufficiency — it shows
  // the count instead (low).
  const stale = render(state({ spendable: 10, held: 10, target: 10, targetAt: STALE_AT }));
  const text = drawn(stale);
  check("C5: with a STALE target, it does NOT suppress — it shows a strip", stale !== null);
  check("C5: ...and it is the count, not a sufficiency claim", stale?.tone === "info" && text.includes("10"), text);
  check("C5: THE DIFFERENTIAL — the same holding renders differently by target age alone", drawn(fresh) !== text);
}

function c6ClockSuspectDegrades(): void {
  header("C6 a target dated in the FUTURE is a moved clock — not trusted");
  // Fresh baseline is ample/null; a future target_at (beyond the jitter window)
  // means the clock moved back, so the target is not trusted and the count shows.
  const suspect = render(state({ spendable: 10, held: 10, target: 10, targetAt: FUTURE_AT }));
  check("C6: a future-dated target is NOT trusted — the strip shows the count", suspect !== null, drawn(suspect));
  check("C6: ...calm, since spendable is not zero", suspect?.tone === "info", String(suspect?.tone));
}

/* --------------------------------------------- the engine seam (real SQLite) */

/** A transport that only tops up: it never creates a seller in this proof. */
class RefillOnlyTransport {
  online = true;
  constructor(private readonly target: number) {}
  createSeller(_row: LocalSeller): Promise<SellerCreateOutcome> {
    return Promise.reject(new Error("proveReserveStrip: no seller creates in this cell"));
  }
  topUp(_deviceId: string): Promise<RefillOutcome> {
    if (!this.online) return Promise.resolve({ kind: "unavailable", reason: "offline" });
    const reservations = Array.from({ length: this.target }, (_v, i) => ({
      code: `S${String(900 + i)}`,
      token: `tok-S${String(900 + i)}-${"z".repeat(30)}`,
    }));
    return Promise.resolve({ kind: "holding", holding: { target: this.target, reservations } });
  }
}

async function i1EnginePersistsTarget(): Promise<void> {
  header("I1: SyncEngine.runOnce persists the refill's target, and an offline pass leaves it");
  const dir = mkdtempSync(join(tmpdir(), "recycle-p18b-reservestrip-"));
  let driver: NodeSqliteDriver | null = null;
  try {
    driver = NodeSqliteDriver.open(join(dir, "reserve.db"));
    const bills = await SqliteLocalStore.open(driver); // runs initConnection (creates local_reserve)
    const sellers = SqliteLocalSellerStore.open(driver);
    const clock = new FakeClock(NOW);
    const transport = new RefillOnlyTransport(5);
    const engine = new SyncEngine({
      store: bills,
      transport: new OfflineTransport(),
      clock,
      sellerStore: sellers,
      sellerTransport: transport,
      deviceStore: new FixedDeviceStore("00000000-0000-4000-8000-00000000dev1"),
    });

    // Before any pass: never provisioned.
    check("I1: before any pass loadReserveTarget is null (never provisioned)", (await sellers.loadReserveTarget()) === null);
    const before = render({
      spendable: await sellers.spendableCount(),
      held: (await sellers.listReservations()).length,
      target: null,
      targetAt: null,
      now: clock.now().toISOString(),
    });
    check("I1: ...and the strip renders never_provisioned, not a defaulted target", drawn(before).includes("ยังไม่เคยรับ"), drawn(before));

    await engine.runOnce();

    const persisted = await sellers.loadReserveTarget();
    check("I1: runOnce persisted the target from the refill answer", persisted?.target === 5, `target=${String(persisted?.target)}`);
    check("I1: ...and target_at is the pass's clock, so the strip can age it", persisted?.target_at === clock.now().toISOString(), String(persisted?.target_at));
    check("I1: ...and the codes were stored (5 spendable)", (await sellers.spendableCount()) === 5, `spendable=${String(await sellers.spendableCount())}`);

    // The read-back state: 5 spendable, 5 held, target 5, fresh -> ample -> null.
    const afterState: ReserveStripState = {
      spendable: await sellers.spendableCount(),
      held: (await sellers.listReservations()).length,
      target: persisted?.target ?? null,
      targetAt: persisted?.target_at ?? null,
      now: clock.now().toISOString(),
    };
    check("I1: the persisted state reads as ample and the strip suppresses it", render(afterState) === null, drawn(render(afterState)));

    // An OFFLINE pass writes no new target — the last-known one stands.
    transport.online = false;
    await engine.runOnce();
    const after = await sellers.loadReserveTarget();
    check(
      "I1: an offline pass wrote no new target — the last one is untouched",
      after?.target === 5 && after?.target_at === persisted?.target_at,
      `target=${String(after?.target)} at=${String(after?.target_at)}`,
    );
  } finally {
    // Close the connection BEFORE deleting the dir — Windows refuses to unlink a
    // file SQLite still holds open (the .db and its -wal), which is EPERM here.
    if (driver !== null) await driver.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main(): Promise<number> {
  console.log("PROVE RESERVE STRIP — four states, one suppressed, and no stale target sold as fresh");
  if (BREAK !== "") {
    console.log("");
    console.log(`  *** NEGATIVE CONTROL ACTIVE: --break=${BREAK} ***`);
    console.log("      The render is damaged ON PURPOSE by this script. A cell that stays green");
    console.log("      here is a cell that is not measuring what it claims.");
  }

  c1AmpleSuppressed();
  c2LowShowsCount();
  c3Exhausted();
  c4NeverProvisionedNoNumber();
  c5StaleTargetDegradesToLow();
  c6ClockSuspectDegrades();
  await i1EnginePersistsTarget();

  console.log("");
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

const exitCode = await main().catch((err: unknown) => {
  console.log("");
  console.log(`  [FAIL] the run died: ${err instanceof Error ? err.message : String(err)}`);
  return 1;
});
console.log(`RESERVESTRIP_EXIT=${String(exitCode)}`);
process.exitCode = exitCode;
