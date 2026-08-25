/**
 * THE REFILL — how a device tops its holding of reserved seller codes back up
 * to the shop's target — AND THE RESERVE LEVEL derived from what it holds.
 *
 * PURE TypeScript. The HTTP client that implements `ReservationTransport` is
 * in `adapters/httpSellerTransport.ts`; nothing here knows what a status code
 * is.
 *
 * ===========================================================================
 * A REFILL IS NOT OUTBOX WORK, AND THAT IS A DECISION WITH A CONSEQUENCE
 * ===========================================================================
 * The outbox carries what the device OWES the server; a refill is what the
 * device WANTS from it. Making it a kind would put a failed refill into the
 * owed counts, where it would refuse a sign-out and colour the strip over work
 * NOBODY IS WAITING FOR.
 *
 * So this is a plain function called by the pass, not an `OutboxHandler`, and
 * it writes no attempt column and no error column anywhere. A bounce leaves
 * exactly one trace: the holding did not grow.
 *
 * ===========================================================================
 * THE ROUTE IS A TOP-UP TO A TARGET, NOT AN ISSUE OF N
 * ===========================================================================
 * Re-derived from `server/app/master.py`'s own route rather than carried:
 * `ReservationTopUp` has ONE field, `device_id`, with `extra="forbid"`. NO
 * quantity, NO idempotency key.
 *
 *   THE THING BEING ASKED FOR IS A LEVEL AND NOT AN EVENT, and a level is
 *   idempotent by construction: *make this device hold its target*, asked
 *   twice, is the same sentence as asked once.
 *
 *   THE SERVER COMPUTES THE SHORTFALL and never trusts a number from the wire.
 *
 *   IT ANSWERS WITH THE DEVICE'S WHOLE HOLDING, never only what was just
 *   minted — the load-bearing half. A repeat after a lost response finds the
 *   holding already at target, mints ZERO, and hands back the same set, so the
 *   device is repaired from the server's own view instead of asking for ever.
 *   The opposite design — answer with only the new block — replies to a repeat
 *   with an EMPTY set, the device's holding never grows, and a full block sits
 *   `held` in its name that no reclaim will ever return.
 *
 * ===========================================================================
 * THE THREE-WAY RULE COLLAPSES TO ONE CLASS HERE, AND THAT IS THE ANSWER
 * ===========================================================================
 * `lessons/unavailable-is-not-rejected.md` splits every send outcome three
 * ways: UNAVAILABLE retries for ever, REJECTED-PERMANENT is terminal,
 * REJECTED-RESOLVABLE parks. Asked of a refill, the design answers that it is
 * always the first, and the argument is that the other two have no referent:
 *
 *   THERE IS NO PAYLOAD TO BE PERMANENTLY WRONG. The request is one device id.
 *   A body the server refuses would mean this device's own identity is
 *   malformed, which is a bug on this device and not a fact about the world —
 *   and marking it terminal would permanently stop a handset from ever
 *   obtaining a code again, with no operator action that could undo it.
 *
 *   THERE IS NO MASTER DATA FOR AN OFFICE TO FIX, so nothing can be parked
 *   waiting on a human. Parking has a cadence and a release event; this has
 *   neither.
 *
 * So every non-answer is `unavailable`: asked again next pass, for ever, with
 * NO ATTEMPT CAP. A yard can be offline for days, and a device that gave up
 * asking is a device that silently stops being able to buy from walk-ins.
 *
 * STATING IT AS "one class" RATHER THAN OMITTING THE OTHER TWO IS THE POINT.
 * A reader who meets only `unavailable` cannot tell whether the split was
 * considered; the classification IS that the other two are unreachable, and
 * the reasons are above so a later change can be checked against them.
 */

import type { IssuedCode } from "./localSeller.js";

/**
 * The refill route's answer: the device's WHOLE holding and the target it is
 * measured against.
 *
 * `target` is carried so the device does not hold a second copy of a number the
 * shop can change — the level below is computed against whatever the server
 * last said, never against a constant compiled into this app.
 */
export interface ReservationHolding {
  target: number;
  reservations: readonly IssuedCode[];
}

/**
 * ONE MEMBER BESIDE SUCCESS, deliberately — see the header. A union rather
 * than a nullable so the caller cannot render one sentence over two causes.
 */
export type RefillOutcome =
  | { kind: "holding"; holding: ReservationHolding }
  | { kind: "unavailable"; reason: string };

export interface ReservationTransport {
  /**
   * May reject (throw). A throw is `unavailable` like every other non-answer;
   * asking again is always safe because the route is a top-up.
   */
  topUp(deviceId: string): Promise<RefillOutcome>;
}

/**
 * WHAT THE YARD CAN STILL DO, AS A DEVICE-GLOBAL STATE WITH FOUR VALUES.
 *
 * `never_provisioned` IS NOT `exhausted`, and collapsing them would ship a
 * FALSE SENTENCE. A device fresh out of the box has spent nothing; telling its
 * operator they have used up their codes is a confident lie about something
 * they never did. The instruction differs too — one is *connect once to get
 * started*, the other is *you have used them all*.
 */
export type ReserveLevel = "ample" | "low" | "exhausted" | "never_provisioned";

/**
 * The three numbers the level is derived from. All THREE come from the
 * device's own storage; none of them comes from the last refill's outcome.
 */
export interface HoldingCounts {
  /** Codes bound to nothing — what a create can actually spend right now. */
  spendable: number;
  /** Every reservation row this device has ever received, spent or not. */
  held: number;
  /** The shop's target, as the server last stated it. */
  target: number;
}

/**
 * THE LEVEL, DERIVED FROM THE HOLDING AND NEVER FROM THE LAST OUTCOME.
 *
 * That distinction is a criterion of its own and it is not academic: a level
 * computed from the last refill's success reports `exhausted` on a device with
 * a full table of codes the moment its network drops — telling a yard it cannot
 * buy from a walk-in while it perfectly well can. The two implementations show
 * the same red badge to an operator who has lost the network, and only this one
 * lets them keep trading.
 *
 * TOTAL, AND IT TAKES THE COUNTS ALONE. No diagnostic, no last-error, no
 * outcome — so a sentence derived from it cannot be derived from the common
 * cause instead of the actual one.
 *
 * `held === 0` IS WHAT SEPARATES never_provisioned FROM exhausted, and it is
 * the honest discriminator rather than a flag somebody sets: a device that has
 * ever been topped up has rows, spent or not, because nothing deletes them. A
 * device that has never reached the server has none.
 */
export function reserveLevel(c: HoldingCounts): ReserveLevel {
  if (c.held === 0) return "never_provisioned";
  if (c.spendable === 0) return "exhausted";
  return c.spendable >= c.target ? "ample" : "low";
}

/**
 * What this device needs to ask for, and what to do with the answer.
 *
 * IT ASKS ON EVERY PASS WHILE ONLINE, WITH NO THRESHOLD. The design refuses a
 * low-water mark explicitly, as a second unmeasured constant, and refuses
 * on-exhaustion as too late by definition. So "a refill that fires on every
 * pass" is not a wrong behaviour to be caught — it IS the design, and there is
 * nothing on the wire for a quantity to be wrong about.
 *
 * THE STORE WRITE IS `saveReservations`, WHICH IS DO-NOTHING ON CONFLICT. That
 * is what makes asking every pass free: the answer is almost entirely codes
 * this device already has, and re-storing them must not disturb which of them
 * are already bound to a local seller.
 */
export interface RefillDeps {
  readonly transport: ReservationTransport;
  /** Only the two members a refill needs. A `Pick` so this path cannot write a seller. */
  readonly store: {
    saveReservations(codes: readonly IssuedCode[], now: Date): Promise<number>;
  };
}

/** What one refill attempt did, for the pass to report and for a proof to read. */
export interface RefillResult {
  readonly outcome: RefillOutcome;
  /** Rows the store actually added. Zero on a repeat, and zero on a failure. */
  readonly added: number;
}

/**
 * One refill attempt.
 *
 * A THROW IS `unavailable`, NEVER A REFUSAL — the rule every sync path in this
 * repository already follows: a throw carries no information about whether the
 * server committed. Here it carries even less consequence than usual, because
 * the route is a top-up and asking again cannot duplicate anything.
 *
 * AND IT COSTS NOTHING ELSE WHEN IT FAILS. No queue entry, no attempt column,
 * no error column, no counter on the pass result. The design's rule is that a
 * refill failure never blocks, parks or fails any other unit of work, and the
 * way that is guaranteed here is that this function touches nothing but the
 * reservation table on the success path.
 */
export async function refillOnce(deps: RefillDeps, deviceId: string, now: Date): Promise<RefillResult> {
  let outcome: RefillOutcome;
  try {
    outcome = await deps.transport.topUp(deviceId);
  } catch (err) {
    outcome = {
      kind: "unavailable",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
  if (outcome.kind === "unavailable") return { outcome, added: 0 };
  const added = await deps.store.saveReservations(outcome.holding.reservations, now);
  return { outcome, added };
}
