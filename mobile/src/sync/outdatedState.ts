/**
 * THE DEVICE-GLOBAL "this build is too old" STATE, DERIVED FROM EACH PASS.
 *
 * PURE TypeScript, so a headless proof drives exactly what App applies. This is
 * the fix for the red-team's findings 4-5: `appOutdated` was a sticky latch with
 * no in-process clear, so a floor RAISED past this build's version and then
 * LOWERED again (a bad raise, rolled back) left the device wedged on the "update"
 * screen while the server would now accept it. Here the state is re-derived every
 * pass instead.
 *
 * THE CLEARING RULE, AND WHY ITS EVIDENCE CANNOT BE FORGED BY A STALE RESPONSE.
 * The server returns 426 to a gated request iff the client is below the floor, so:
 *   - a 426 THIS pass (`r.clientOutdated > 0`)  -> the build is (still) too old.
 *   - any OTHER definitive server answer this pass — a bill accepted, refused on
 *     its merits, parked, a session expiry, a role refusal, or any void outcome —
 *     is the server's CURRENT statement that this build's version is at or above
 *     the floor, so the build is acceptable again.
 *   - no answer at all (offline, nothing owed, or every kind still halted with
 *     nothing attempted) -> keep what we knew.
 * Every counter it reads is set by the engine ONLY when the server returned that
 * status on a request THIS pass made — a fresh round-trip, never a cached flag.
 * So the "acceptable again" conclusion rests on the server having just answered
 * without a 426, which a stale or replayed response cannot manufacture: there is
 * no client state that produces `r.synced > 0` without an actual accepted send.
 * (Transport security is out of scope today; even under a tampering transport the
 * safe direction holds — the app either sends successfully or is re-refused 426.)
 *
 * THE QUEUED WORK SURVIVES BOTH DIRECTIONS. A 426 leaves every row pending/owed
 * and untouched (markClientOutdated / markVoidAttemptFailed / the seller kind's
 * fail-transition); when the floor comes back down the same rows drain. Clearing
 * this flag never discards anything — it only stops the screen lying.
 *
 * THE HALT MUST BE RETRACTED TO RE-PROBE. A 426 halts every kind, so while the
 * flag holds a pass attempts nothing and this returns `was` for ever. App retracts
 * the halt before each pass while the flag is set (SyncEngine.retractOutdatedHalt),
 * so a pass RE-PROBES: it either re-halts (still 426 -> stays true) or drains
 * (accepted -> this returns false). That is what makes the recovery prompt.
 */
import type { SyncRunResult } from "./engine.js";

export function outdatedAfterPass(was: boolean, r: SyncRunResult): boolean {
  if (r.clientOutdated > 0) return true;
  if (
    r.synced > 0 ||
    r.rejected > 0 ||
    r.masterDataBlocked > 0 ||
    r.sessionExpired > 0 ||
    r.forbidden > 0 ||
    r.voidsApplied > 0 ||
    r.voidsRejected > 0 ||
    r.voidsForbidden > 0
  ) {
    return false;
  }
  return was;
}
