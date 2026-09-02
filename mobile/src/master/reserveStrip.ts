/**
 * THE CONTINUOUS RESERVE STRIP — what an always-on line tells the yard about its
 * holding of reserved seller codes, and when it says nothing.
 *
 * PURE TypeScript — no React Native, no Expo, no node — so the headless proof
 * drives exactly what the phone renders. The FOUR STATES and their sentences are
 * c4's (`master/reserveNotice.ts`); this module is the STRIP on top of them: it
 * decides which state to show given a holding whose TARGET may be stale, and it
 * stays silent when there is nothing to act on. A strip in `app/` draws whatever
 * this returns and decides nothing (`lessons/correct-classification-can-still-render-as-an-error.md`).
 *
 * ===========================================================================
 * WHAT IS LOCAL AND WHAT IS NOT — THE WHOLE REASON STALENESS ENTERS HERE
 * ===========================================================================
 * `spendable` and `held` are counts over this device's own `local_seller_codes`,
 * so they are CURRENT LOCAL FACTS. The TARGET is the shop's, and it arrives only
 * in a refill answer; a refill is a no-op when offline, so the persisted target
 * can be old. `target_at` is when it last arrived.
 *
 * The four levels split by which inputs they need:
 *
 *   never_provisioned (held === 0)  — LOCAL. Always exact.
 *   exhausted        (spendable === 0) — LOCAL. Always exact.
 *   low  (spendable < target)  — shows the COUNT, and its sentence claims no
 *                                sufficiency; the count is a current local fact.
 *   ample (spendable >= target) — the ONE state that asserts something ABOUT THE
 *                                 TARGET ("เพียงพอ", sufficient).
 *
 * So a stale target can invalidate exactly one claim — `ample`. The rule is
 * therefore: never assert `ample` from a target we cannot stand behind; show
 * `low` (the true count) instead. That is
 * `lessons/cached-master-data-is-a-price-claim.md`'s shape — do not DEFAULT a
 * judgment from stale data, show the current fact — applied to a level rather
 * than a price, and the operator's one actionable question (can I create a
 * seller offline?) is answered entirely by the LOCAL holding and is never stale.
 */
import { JUST_FETCHED_WINDOW_MS } from "./freshness.js";
import { instantMs, pastStampSuspect } from "../time/clockSanity.js";
import { reserveLevel } from "../sync/sellerRefill.js";
import type { ReserveLevel } from "../sync/sellerRefill.js";
import { reserveLevelNotice } from "./reserveNotice.js";

/**
 * PAST THIS AGE THE PERSISTED TARGET IS NO LONGER TRUSTED TO ASSERT SUFFICIENCY.
 *
 * ITS OWN CONSTANT, not `freshness.ts`'s `PRICE_DEFAULT_CUTOFF_MS` — that one is
 * MONEY-CRITICAL and the anti-conflation rule at its declaration forbids sharing
 * it. The reasoning is the same 12 hours, for the same reason: it is the shortest
 * window a working day cannot cross on its own, so a target this old means the
 * device was out of contact across a period in which the shop could have changed
 * the target. Unlike a stale price this is NOT money — it only decides `ample`
 * vs `low`, and the fallback (`low`) shows the true count — so the cost of the
 * cutoff is a conservative display, never a wrong number. A judgement, one
 * constant, named.
 */
export const RESERVE_TARGET_STALE_MS = 12 * 60 * 60 * 1000;

/**
 * What the strip needs. `spendable` and `held` are LOCAL counts; `target` and
 * `targetAt` are null together when no refill has ever succeeded (the device is
 * never provisioned); `now` is injected so the proof owns the clock.
 */
export interface ReserveStripState {
  readonly spendable: number;
  readonly held: number;
  readonly target: number | null;
  readonly targetAt: string | null;
  readonly now: string;
  /**
   * THE BUILD IS TOO OLD (426), device-global. REQUIRED: the strip's level lines
   * promise "…จะเติมเองเมื่อต่อเน็ต" / "…จนกว่าจะต่อเน็ต", and while the build is too
   * old the top-up 426s, so connecting refills nothing — only an update does. A
   * required field makes the call site a compile error until it passes the fact.
   */
  readonly appOutdated: boolean;
}

/** `info` is calm (the count); `red` is a state that needs a person now. */
export type ReserveStripTone = "info" | "red";

export interface ReserveStripNotice {
  readonly tone: ReserveStripTone;
  readonly lines: readonly string[];
}

/**
 * The target, but ONLY when it can be trusted to decide sufficiency: present,
 * parseable, not from a clock that has moved backwards, and not older than the
 * cutoff. Otherwise null, and the caller shows the count rather than claim
 * `ample`.
 */
function trustworthyTarget(state: ReserveStripState): number | null {
  if (state.target === null || state.targetAt === null) return null;
  const at = instantMs(state.targetAt);
  const now = instantMs(state.now);
  if (at === null || now === null) return null;
  // A stored stamp in the FUTURE means the device clock has moved backwards since
  // it was written — which understates every age and makes old data look fresh,
  // the dangerous direction (`cached-master-data-is-a-price-claim.md`, rule 2).
  // The tolerance is `freshness.ts`'s borrowed clock-jitter slack, the same use
  // its own comment records; retuning it there moves this line too.
  if (pastStampSuspect(at, now, JUST_FETCHED_WINDOW_MS)) return null;
  if (now - at > RESERVE_TARGET_STALE_MS) return null;
  return state.target;
}

/**
 * The level the strip will render, with the staleness rule folded in.
 *
 * With a trustworthy target, `reserveLevel` (c4) decides all four. Without one,
 * the two target-independent states are still exact from the LOCAL holding, and
 * everything else is `low` — the count — never `ample`.
 */
function effectiveLevel(state: ReserveStripState): ReserveLevel {
  const target = trustworthyTarget(state);
  if (target !== null) {
    return reserveLevel({ spendable: state.spendable, held: state.held, target });
  }
  if (state.held === 0) return "never_provisioned";
  if (state.spendable === 0) return "exhausted";
  return "low";
}

/**
 * The strip's notice, or null when there is nothing to show.
 *
 * `ample` RENDERS NOTHING, the same choice `MasterDataStrip` makes for freshly
 * fetched data: an always-on "you are fine" line is one nobody reads, and the
 * state that then goes unseen is the one that needs them. The other three each
 * carry a number worth showing (`low`) or a red state that needs a person
 * (`exhausted`, `never_provisioned`). The tone is c4's, mapped to the strip's
 * two — a `none`-tone level that reaches here is `low`, drawn calm (`info`); a
 * `red` one is drawn red.
 */
export function reserveStripNotice(state: ReserveStripState): ReserveStripNotice | null {
  const level = effectiveLevel(state);
  if (level === "ample") return null;
  if (state.appOutdated) {
    // THE BUILD IS TOO OLD: the top-up 426s, so the level lines' "…เมื่อต่อเน็ต"
    // promise is false — connecting refills nothing. One calm line naming the real
    // fix (an update), in the same register as the status strip's update state.
    return { tone: "info", lines: ["โควตารหัสผู้ขายจะเติมเองหลังอัปเดตแอป"] };
  }
  const notice = reserveLevelNotice(level, state.spendable);
  return { tone: notice.tone === "red" ? "red" : "info", lines: notice.lines };
}
