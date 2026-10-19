/**
 * RE-READ THE GRANTS AFTER A "NO PERMISSION" REFUSAL, AND RESUME WHEN THEY ARE BACK — with no
 * sign-out (ADVISOR-DECIDED 2026-10-17, 3b).
 *
 * Until this, a 403 halted the refused work until the next SIGN-IN (engine.resumeAfterSignIn),
 * on the premise that a 403 changes only when WHO is asking. That premise was wrong in one
 * direction the role screen made real: the owner takes a permission away and puts it back, and
 * the same person, still signed in, may submit again. The phone could not see it, so the role
 * screen told the owner to make the yard sign out and in.
 *
 * Now two events re-ask the server, through GET /whoami, what this session holds:
 *   - the app coming back to the FOREGROUND (`onAppState`, wired to React Native's AppState);
 *   - the operator pressing ลองอีกครั้ง on the refusal notice (`onRetryPress`).
 * Either reads /whoami ONLY while something is refused — no refusal, no request — and resumes
 * exactly the refused work whose permission the answer shows back: `bills.create` lifts the
 * submit refusal, `bills.void` lifts the refused voids. A grant still missing changes nothing.
 * Nothing here signs anyone out, and nothing here is authority: the next send is re-judged by
 * the server, which re-reads the grants on every request.
 *
 * No poll and no timer, for the reason engine.resumeAfterSignIn gives: a request that exists to
 * make the app feel responsive rather than to answer a question someone asked. Both triggers
 * are someone asking.
 */

/** What the device currently holds refused, as App derives it. */
export interface RefusalState {
  /** The SEND refusal (a 403 on POST /bills) — device-global. */
  readonly submitRefused: boolean;
  /** How many bills hold a refused VOID (a 403 on POST /bills/{id}/void). */
  readonly voidsRefused: number;
}

/** Which refused work the grants just read allow again. */
export interface Restored {
  readonly submit: boolean;
  readonly voids: boolean;
}

export type RecheckTrigger = "foreground" | "retry";

export type RecheckOutcome =
  /** Nothing is refused: no request was made. */
  | { readonly kind: "nothing_refused"; readonly trigger: RecheckTrigger }
  /** /whoami could not be read (offline, 401, a body without a permission set): nothing changed. */
  | { readonly kind: "unread"; readonly trigger: RecheckTrigger }
  /** Read, and the refused permission is still absent: nothing changed. */
  | { readonly kind: "still_refused"; readonly trigger: RecheckTrigger }
  /** Read, and at least one refused permission is back: that work was resumed. */
  | { readonly kind: "resumed"; readonly trigger: RecheckTrigger; readonly restored: Restored };

export interface GrantRecheckDeps {
  /** The refusal state NOW (read at the moment of the trigger, never captured earlier). */
  readonly refusal: () => RefusalState;
  /** GET /whoami's permission set for this session; null when it could not be read. */
  readonly readGrants: () => Promise<ReadonlySet<string> | null>;
  /** Lift exactly the restored refusals and let the next pass re-send. */
  readonly resume: (restored: Restored) => Promise<void>;
}

/** The permission each refused act needs on the server (server/app/permissions.py). */
export const SUBMIT_PERMISSION = "bills.create";
export const VOID_PERMISSION = "bills.void";

/** Pure: which refused work the grants allow again. */
export function grantsRestored(refusal: RefusalState, grants: ReadonlySet<string>): Restored {
  return {
    submit: refusal.submitRefused && grants.has(SUBMIT_PERMISSION),
    voids: refusal.voidsRefused > 0 && grants.has(VOID_PERMISSION),
  };
}

/** True for a transition INTO the foreground (React Native's "active"), from anything else. */
export function becameActive(previous: string | null, next: string): boolean {
  return next === "active" && previous !== null && previous !== "active";
}

export async function recheckGrants(trigger: RecheckTrigger, deps: GrantRecheckDeps): Promise<RecheckOutcome> {
  const refusal = deps.refusal();
  if (!refusal.submitRefused && refusal.voidsRefused === 0) return { kind: "nothing_refused", trigger };
  const grants = await deps.readGrants();
  if (grants === null) return { kind: "unread", trigger };
  const restored = grantsRestored(refusal, grants);
  if (!restored.submit && !restored.voids) return { kind: "still_refused", trigger };
  await deps.resume(restored);
  return { kind: "resumed", trigger, restored };
}

/**
 * The one line the app shows after ลองอีกครั้ง — each outcome says what happened and what
 * to do next, and none promises what the server has not yet accepted.
 */
export function recheckStatusLine(o: RecheckOutcome): string {
  switch (o.kind) {
    case "resumed":
      return "ได้สิทธิ์คืนแล้ว — กำลังส่งรายการที่ค้างอยู่";
    case "still_refused":
      return "บัญชีนี้ยังไม่มีสิทธิ์ — แจ้งเจ้าของร้านให้คืนสิทธิ์ก่อน แล้วกด ลองอีกครั้ง";
    case "unread":
      return "ยังตรวจสิทธิ์กับระบบไม่ได้ — ตรวจการเชื่อมต่อ แล้วกด ลองอีกครั้ง";
    case "nothing_refused":
      return "ไม่มีรายการที่ติดเรื่องสิทธิ์";
    default: {
      const never: never = o;
      return String(never);
    }
  }
}

export interface GrantRecheck {
  /** Wire to AppState's "change" event. Re-checks only on a move INTO the foreground. */
  onAppState(next: string): Promise<RecheckOutcome | null>;
  /** Wire to the ลองอีกครั้ง control on the refusal notice. */
  onRetryPress(): Promise<RecheckOutcome>;
}

/** The two triggers over one recheck. `initial` is AppState.currentState at wiring time. */
export function createGrantRecheck(deps: GrantRecheckDeps, initial: string | null): GrantRecheck {
  let previous = initial;
  return {
    async onAppState(next: string): Promise<RecheckOutcome | null> {
      const fire = becameActive(previous, next);
      previous = next;
      return fire ? recheckGrants("foreground", deps) : null;
    },
    onRetryPress(): Promise<RecheckOutcome> {
      return recheckGrants("retry", deps);
    },
  };
}
