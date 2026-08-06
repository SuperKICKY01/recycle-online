/**
 * ENDING A SESSION ON THIS DEVICE. R1b — the client half of R1.
 *
 * PURE TypeScript, no React and no Expo, for the reason billNotice and
 * statusNotice moved here: files under app/ are unreachable by the node proof
 * program (tsconfig.node.json has rootDir "src"), so a decision living there is
 * outside the proven surface entirely. The screen renders what this returns and
 * decides nothing.
 *
 * ---------------------------------------------------------------------------
 * WHAT SIGN-OUT IS, AND WHAT IT IS NOT
 * ---------------------------------------------------------------------------
 * It is a CLIENT-SIDE CLEAR. It does not call the server's revoke endpoint —
 * that exists for a deactivation or a password change, not for an ordinary shift
 * change, and firing it here would end every OTHER session that user has.
 *
 * The server half (R1a) is what makes this honest rather than cosmetic: a token
 * this device forgets is still a valid bearer credential until it expires, and
 * only token_version can refuse one early. Neither half is worth much alone.
 *
 * ---------------------------------------------------------------------------
 * THE ORDER IS THE DESIGN
 * ---------------------------------------------------------------------------
 *   1. refuse outright if bills are still queued (see the gate below);
 *   2. STOP THE SYNC LOOP — before anything else changes, so no pass can be
 *      mid-flight with a token that is about to be forgotten;
 *   3. CLEAR THE KEYSTORE, and read the answer;
 *   4. only if that succeeded, clear the in-memory session state;
 *   5. only then does the screen render signed out.
 *
 * Step 3 is where this used to be able to lie. `SecureTokenStore.clear()`
 * swallowed a failed delete under the comment "nothing depends on it having
 * happened" — true while nothing called it, false the moment this file did. A
 * swallowed failure renders the login screen over a keystore that still holds a
 * working token, and the next cold start's load() signs the DEPARTED user back
 * in. The contract now reports (session/tokenStore.ts ClearOutcome), and a
 * failure leaves the operator SIGNED IN and says so.
 */
import type { SessionState } from "../sync/parkedReason.js";
import type { ClearOutcome, TokenStore } from "./tokenStore.js";

/**
 * The device's session state, from the two values it is derived from.
 *
 * EXTRACTED FROM App.tsx SO IT CAN BE PROVEN. The expression itself is
 * unchanged; what changed is that the proof now runs the SAME code the screen
 * does, instead of a copy of it written in a test file — which is the failure
 * mode lessons/a-checker-must-not-share-the-code-it-checks.md calls duplicating
 * a convention. There is no independent way to "recompute" what signed-out
 * means; there is only one right answer and it must have one home.
 *
 * ORDER MATTERS AND IS THE WHOLE CONTENT: no token outranks a stale
 * sessionEnded flag, so a deliberate sign-out renders "ยังไม่ได้เข้าสู่ระบบ" and
 * never "หมดเวลาเข้าใช้งาน". The two read differently to an operator — one never
 * worked, the other stopped working — and after a sign-out only the first is
 * true. CLEARED_SESSION sets sessionEnded false as well, so the two cannot
 * disagree even if this order were ever changed.
 */
export function sessionStateOf(s: {
  token: string | null;
  sessionEnded: boolean;
}): SessionState {
  return s.token === null ? "signed_out" : s.sessionEnded ? "expired" : "active";
}

/**
 * May the sync tick issue a request right now?
 *
 * ALSO EXTRACTED FROM App.tsx, and for a sharper reason than the above: "after a
 * sign-out, no request may be issued" is a SECURITY claim, and a claim proven
 * against a copy of the guard is a claim about the copy. App.tsx's syncOnce
 * calls this; so does the proof.
 *
 * Two conditions, and each has its own moment. `paused` covers the window
 * during the sign-out itself, when the token is still present because the
 * keystore has not answered yet. `token === null` covers every moment after a
 * successful one.
 */
export function maySync(s: { paused: boolean; token: string | null }): boolean {
  return !s.paused && s.token !== null;
}

/**
 * Why a sign-out could not be completed. A UNION with one member today, and a
 * union on purpose: the wording is derived from the cause
 * (lessons/correct-classification-can-still-render-as-an-error.md — a message
 * naming an action must come from the cause, never be hardcoded to the only
 * caller that existed at the time). A second failure cause added later is a
 * compile error at the switch in signOutCard, not a sentence that quietly
 * inherits this one's.
 */
export type SignOutFailure = { kind: "clear_failed"; reason: string };

export type SignOutOutcome =
  /** The queue is not empty. Nothing was touched — the session is unchanged. */
  | { kind: "refused_pending"; pending: number; failed: number }
  /** The keystore refused to forget the token. STILL SIGNED IN. */
  | { kind: "failed"; failure: SignOutFailure }
  /** Done. The caller must now apply CLEARED_SESSION. */
  | { kind: "signed_out"; failed: number };

/**
 * EVERY SESSION-DERIVED VALUE, AND WHAT IT BECOMES.
 *
 * One object rather than ten setter calls scattered through a handler, because
 * the failure this guards against is FORGETTING ONE — and a forgotten value here
 * is the previous user's role, permission refusal or takings still on screen
 * under the next user's session. The proof asserts over this constant, so "what
 * sign-out clears" is a thing that can be read, and be wrong, in one place.
 *
 * WHAT IS DELIBERATELY ABSENT: products, sellers, prices and the master cache.
 * That is SHOP data, not user data — it describes the tenant, not the person —
 * and dropping it would strand the next offline morning with no products and no
 * sellers, which is exactly the reasoning App.tsx already gives for keeping an
 * expired token rather than deleting it. The open cart draft is absent for the
 * same kind of reason and a separate one: see OPEN_ITEMS.md, a draft surviving a
 * change of user is R5's question, not R1b's.
 *
 * `sendForbidden` is not here because it is not App state — it lives inside the
 * SyncEngine and is cleared through resetAfterSignOut().
 */
export interface ClearedSession {
  token: null;
  role: null;
  sessionEnded: false;
  submitRefused: false;
  online: null;
  lastSyncedAt: null;
  health: null;
  daily: null;
  dailyDate: null;
  dailyOpen: false;
}

/**
 * One setter per value in ClearedSession. A MAPPED TYPE, not a hand-written
 * interface, so it cannot fall out of step with the list above.
 */
export type SessionSetters = {
  [K in keyof ClearedSession]: (value: ClearedSession[K]) => void;
};

/**
 * Apply CLEARED_SESSION through the caller's setters — every key, exactly once.
 *
 * WHY THIS EXISTS RATHER THAN TEN SETTER CALLS IN THE HANDLER. The failure being
 * guarded against is forgetting one, and a forgotten value is the departed
 * user's role, permission refusal or takings still on screen under the next
 * user's session. With the list here and `SessionSetters` mapped off it, a value
 * ADDED to ClearedSession is a COMPILE ERROR at App.tsx's call site until a
 * setter is supplied for it.
 *
 * KNOWN LIMIT, and it is the honest half: this catches the list growing, not the
 * APP growing. A new useState added to App.tsx and never added to ClearedSession
 * is invisible to both the compiler and the proof, because App holds its session
 * as ten independent atoms rather than as this object. Closing that direction
 * means App.tsx holding ONE session state value — 45 setter sites and ~88 read
 * sites — which is not a change to make inside a security phase. Recorded in
 * OPEN_ITEMS.md rather than left as a comment nobody meets.
 */
export function applyClearedSession(setters: SessionSetters): void {
  setters.token(CLEARED_SESSION.token);
  setters.role(CLEARED_SESSION.role);
  setters.sessionEnded(CLEARED_SESSION.sessionEnded);
  setters.submitRefused(CLEARED_SESSION.submitRefused);
  setters.online(CLEARED_SESSION.online);
  setters.lastSyncedAt(CLEARED_SESSION.lastSyncedAt);
  setters.health(CLEARED_SESSION.health);
  setters.daily(CLEARED_SESSION.daily);
  setters.dailyDate(CLEARED_SESSION.dailyDate);
  setters.dailyOpen(CLEARED_SESSION.dailyOpen);
}

export const CLEARED_SESSION: ClearedSession = {
  token: null,
  role: null,
  // signed_out, NEVER expired. App derives `session` as
  // token === null ? "signed_out" : sessionEnded ? "expired" : "active",
  // so leaving sessionEnded true would be harmless today and would become a
  // contradiction the moment that expression is reordered. The two states exist
  // separately and mean different things to an operator: one never worked, the
  // other stopped working. A deliberate sign-out is the first.
  sessionEnded: false,
  submitRefused: false,
  // null, not false. `online` is a fact about the last answer, and after a
  // sign-out there is no session to have answers about — false would render
  // ออฟไลน์ over a working network.
  online: null,
  /*
   * THESE TWO LOOK REDUNDANT AND MUST NOT BE DELETED FOR THAT REASON.
   *
   * lastSyncedAt and health are re-read from the local bill store by refresh(),
   * which App.tsx runs on an UNCONDITIONAL 400 ms interval (App.tsx:560-569).
   * So clearing them here is reverted within 400 ms and today changes nothing
   * anyone can see. That is a true observation and the wrong conclusion.
   *
   * It is true only because that ticker is not gated on the session. Gating it
   * — `if (session !== "active") return;`, a change that will look obviously
   * right to whoever makes it, and probably arrives as a battery or a
   * correctness fix — removes the thing that was covering for their absence. At
   * that moment these two lines become the ONLY thing stopping the strip from
   * showing the previous user's sync time and queue health to the next user.
   *
   * So the redundancy is a property of a ticker somewhere else, not of these
   * values. Whoever gates that ticker inherits this; whoever deletes these lines
   * first makes the gating a silent regression.
   */
  lastSyncedAt: null,
  health: null,
  daily: null,
  dailyDate: null,
  dailyOpen: false,
};

export interface SignOutDeps {
  /** Bills queued to send (pending + syncing). The gate. */
  pending: number;
  /** Terminally failed bills. NAMED on screen, never a blocker — see the gate. */
  failed: number;
  /** Pause/resume the 4-second sync tick. Called with true BEFORE the clear. */
  setSyncPaused: (paused: boolean) => void;
  tokens: Pick<TokenStore, "clear">;
  /** Null before the engine has been constructed (a boot that has not finished). */
  engine: { resetAfterSignOut: () => void } | null;
}

/**
 * THE GATE: a non-empty send queue refuses the sign-out.
 *
 * An unsynced bill is a load already tipped on the pile and cash already out of
 * the till. The queue carries no identity of its own — HttpTransport resolves
 * the token from a device-global ref at SEND time (App.tsx, `getToken`) — so a
 * bill weighed by one user drains under whoever is signed in when it goes.
 *
 * WHY THAT GATE COSTS THE YARD NOTHING. Signing back IN requires the network:
 * there is no offline login path, `signIn()` calls the server. So sign-out is
 * only useful while online, and while online the queue drains in seconds. The
 * gate therefore refuses only in the state where the sign-out was not going to
 * be completable anyway.
 *
 * WHAT THIS GATE IS NOT PROVEN PROTECTION AGAINST, and a future reader must not
 * read it as such: a bill draining under a DIFFERENT user. That hazard is NOT
 * REACHABLE TODAY, because signIn() uses the hardcoded DEMO credentials in
 * app/config.ts — signing out and back in returns the same account, and there is
 * no login form to type another. It becomes reachable when R5 introduces real
 * per-shop accounts. At that point the worse case is a different TENANT: the
 * queued bill's seller_id and product_id are invisible under the new tenant's
 * RLS context, so POST /bills answers 422, which the engine maps to markFailed —
 * TERMINAL, never retried, a paid-for load permanently stuck. This gate happens
 * to prevent that, but it has never been exercised against it and must not be
 * cited as evidence about it.
 *
 * FAILED bills do NOT block. They never drain, so blocking on them would make
 * sign-out permanently impossible on a device holding one. Their count is put on
 * the screen instead.
 */
export async function signOut(deps: SignOutDeps): Promise<SignOutOutcome> {
  if (deps.pending > 0) {
    // NOTHING has been touched at this point — not the loop, not the keystore.
    // A refusal must leave the session exactly as it found it.
    return { kind: "refused_pending", pending: deps.pending, failed: deps.failed };
  }

  // STEP 2, before the keystore: no pass may be in flight with a token that is
  // about to be forgotten.
  deps.setSyncPaused(true);

  const outcome: ClearOutcome = await deps.tokens.clear();
  if (outcome.kind === "failed") {
    // STILL SIGNED IN. Put the loop back — a failed sign-out must not also cost
    // the yard its sync, which would turn a keystore problem into bills silently
    // not being sent.
    deps.setSyncPaused(false);
    return { kind: "failed", failure: { kind: "clear_failed", reason: outcome.reason } };
  }

  // In-memory state last, and only now. The engine's send gate is device-global
  // and belongs to the departing account.
  deps.engine?.resetAfterSignOut();
  return { kind: "signed_out", failed: deps.failed };
}
