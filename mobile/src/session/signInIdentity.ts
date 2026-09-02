/**
 * RECORDING WHO SIGNED IN — the ordering, and nothing else.
 *
 * PURE TypeScript, no React and no Expo, for the reason `signOut.ts`,
 * `statusNotice.ts` and `billNotice` all moved here: files under `app/` are
 * unreachable by the node proof program (tsconfig.node.json has rootDir "src"),
 * so an ordering that lives there is outside the proven surface entirely.
 *
 * ---------------------------------------------------------------------------
 * THE ORDERING IS THE WHOLE CONTENT
 * ---------------------------------------------------------------------------
 * The identity is written ONLY after the server has accepted the credentials.
 * That is not a style preference — it is the difference between a device that
 * knows whose rows it is writing and one that has adopted an identity nobody
 * confirmed. `attempt()` throws on every refusal (see app/api.ts), so the save
 * below is unreachable on any failed login, and a failed attempt therefore
 * leaves whatever identity was already stored exactly as it was.
 *
 * WHY THE TENANT COMES FROM THE REQUEST AND THE USER FROM THE RESPONSE. The
 * server resolves the account UNDER the submitted tenant context and RLS makes
 * another shop's users invisible while it does — so a login that succeeds
 * proves the user belongs to the tenant that was sent. The USER id has no such
 * derivation available to the client, which is why the server now returns it.
 *
 * WHAT THIS DOES NOT DO, and both absences are deliberate:
 *   - it does not CLEAR anything. Sign-out must not clear the identity yet: the
 *     refusal that has to guard that clearing does not exist, and clearing now
 *     would strand the very rows the owner key exists to protect.
 *   - it does not STAMP an owner on any row. Nothing reads this value yet.
 */

import { CLIENT_OUTDATED_STATUS } from "../net/clientVersion.js";

/** The identity, as the server names it. Both are server-issued identifiers. */
export interface SignedInIdentity {
  tenant_id: string;
  user_id: string;
}

/** What a successful login attempt yields. */
export interface SignInOutcome {
  accessToken: string;
  userId: string;
}

/**
 * THE ONE PLACE THAT SAYS WHAT 401 MEANS.
 *
 * `app/api.ts`'s `isUnauthorized` is defined in terms of this rather than
 * carrying its own `=== 401`, so the tree holds exactly one statement of the
 * rule. Two entry points because the two callers hold different things: a
 * RESPONSE has a status, a caught ERROR has one wrapped inside it.
 */
export const UNAUTHORIZED_STATUS = 401;
export const isUnauthorizedStatus = (status: number): boolean =>
  status === UNAUTHORIZED_STATUS;

/**
 * WHAT A LOGIN ATTEMPT PRODUCED — every outcome, as a VALUE.
 *
 * ---------------------------------------------------------------------------
 * THESE WERE ONE BRANCH UNTIL THIS COMMIT, AND IT COST THE OPERATOR THE ONE
 * THING THEY NEEDED TO KNOW
 * ---------------------------------------------------------------------------
 * `login()` threw on every non-2xx and the caller caught all of it in one
 * `catch`, which set `online = false` and printed the raw error. So a WRONG
 * PASSWORD — a request the server answered in milliseconds — put the device
 * into its offline state and told the operator so. At five in the morning with
 * a truck on the weighbridge, that sends them to look at the router while the
 * fix is to type the password again. The reverse cost the same: a real outage
 * rendered as a failed login has them retyping a correct password.
 *
 * The classification lives HERE and not in `app/api.ts` because that file
 * reaches expo-constants through `./config` and no headless proof can load it.
 * A classification no proof can drive is one no assertion can ever redden,
 * which is how the collapsed branch survived this long.
 *
 * FOUR MEMBERS, and the two that must never merge are `refused` and
 * `unreachable`:
 *
 *   ok           — accepted, and a usable token came back.
 *   refused      — the server ANSWERED and rejected these credentials (401).
 *                  Type the password again. Nothing about the network.
 *   unreachable  — no answer at all: DNS, no route, aeroplane mode, connection
 *                  refused. The password is not in question.
 *   server_fault — the server answered and what it said cannot be used. Neither
 *                  retyping nor checking the router helps.
 *
 * WHY `server_fault` IS ITS OWN CLASS AND NOT FOLDED INTO `refused`. Every
 * non-2xx that is not 401 lands here, and the reason is
 * lessons/unavailable-is-not-rejected.md's question — can anything make this
 * attempt valid later? A 503 clears on its own; a 401 never does without a
 * different password. The sharpest case is real: `app/main.py`'s clock guard
 * refuses EVERY path including `/auth/login` with **503** when the host clock is
 * wrong, and recovery needs database credentials and shell access. Telling that
 * operator "wrong password" is a wrong instruction, and a wrong instruction is
 * worse than a vague one (lessons/correct-classification-can-still-render-as-an
 * -error.md: a message naming an action must be DERIVED from the cause).
 *
 * `detail` DISCRIMINATES the two ways to get here — an unusable status, and a
 * 2xx carrying no token — because a proof asserting only the kind cannot tell
 * which arm fired, and the two are reached by different code. They share wording
 * today because the operator's action is identical; if that ever stops being
 * true, this field is already the thing to branch on.
 */
export type SignInResult =
  | ({ kind: "ok" } & SignInOutcome)
  | { kind: "refused" }
  | { kind: "unreachable" }
  /**
   * THE BUILD IS TOO OLD (426). Its own member, NOT `server_fault`, because the
   * two have opposite instructions: `server_fault` says "the server responded
   * abnormally, tell the shop owner" — a person who cannot change an app version —
   * while this says "update the app". A signed-out or freshly-installed old build
   * meets the version floor HERE, at login, before any sync pass exists to set the
   * device-global `appOutdated`, so this screen must carry the fact itself.
   */
  | { kind: "client_outdated" }
  | { kind: "server_fault"; status: number; detail: "unexpected_status" | "no_token" };

/**
 * The slice of an HTTP response this needs. Structural, so both the browser's
 * `Response` and node's satisfy it and this module stays free of DOM types —
 * the same reason it takes the fetch as a function rather than importing one.
 */
export interface LoginHttpResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

/**
 * A field the server was supposed to send, or null.
 *
 * An EMPTY string counts as ABSENT. `accessToken: ""` typechecks, survives every
 * `!== null` guard, and goes out as `Bearer ` on every request afterwards — a
 * session that looks present at each layer and is refused by the server for
 * ever, which is the same defect as the missing field wearing a different shape.
 */
function readString(body: unknown, key: string): string | null {
  if (typeof body !== "object" || body === null || !(key in body)) return null;
  const raw = (body as Record<string, unknown>)[key];
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * RUN A LOGIN ATTEMPT AND SAY WHAT HAPPENED. Every outcome is a value; nothing
 * throws for a refusal, an outage or a bad body.
 *
 * THE FETCH IS INJECTED, and that is what makes this provable. `app/api.ts`
 * cannot be loaded by the node proof program, so a version of this living there
 * would put the whole classification — including the branch that decides
 * "offline" — outside every assertion, which is exactly how a refused password
 * came to render as an outage. Here a proof can drive it against a REAL server
 * over REAL HTTP, and against an address where nothing is listening, and get the
 * production answer for both.
 */
export async function attemptLogin(
  doFetch: () => Promise<LoginHttpResponse>,
): Promise<SignInResult> {
  let res: LoginHttpResponse;
  try {
    res = await doFetch();
  } catch {
    // No answer at all — DNS, no route, aeroplane mode, connection refused.
    // The credentials were never judged, so nothing here is about them.
    return { kind: "unreachable" };
  }

  if (!res.ok) {
    if (res.status === CLIENT_OUTDATED_STATUS) return { kind: "client_outdated" };
    return isUnauthorizedStatus(res.status)
      ? { kind: "refused" }
      : { kind: "server_fault", status: res.status, detail: "unexpected_status" };
  }

  // A 2xx IS NOT YET A SESSION. The body has to carry one.
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const accessToken = readString(body, "access_token");
  const userId = readString(body, "user_id");
  if (accessToken === null || userId === null) {
    return { kind: "server_fault", status: res.status, detail: "no_token" };
  }
  return { kind: "ok", accessToken, userId };
}

/**
 * The narrow slice of the identity store this needs. A `Pick`-shaped interface
 * rather than the concrete class, so the proof can drive the real store and a
 * caller cannot reach `clear()` through this path by accident.
 */
export interface IdentityWriter {
  save(identity: SignedInIdentity): Promise<void>;
}

/**
 * Run a login attempt and, ONLY if it succeeds, record who signed in.
 *
 * `attempt` is injected rather than imported: `app/api.ts` pulls in
 * expo-constants through `./config` and cannot run under node, so importing it
 * here would put this ordering back outside the proofs — which is the one thing
 * this module exists to prevent.
 */
export async function signInAndRecord(
  attempt: () => Promise<SignInResult>,
  tenantId: string,
  identity: IdentityWriter,
): Promise<SignInResult> {
  /*
   * TWO WAYS AN ATTEMPT CAN FAIL AND NEITHER RECORDS ANYTHING.
   *
   * A THROW still propagates untouched — nothing below runs — which is the
   * guarantee this module has always carried and which proveMigration drives
   * directly. What is new is that a refusal no longer HAS to throw to be safe:
   * `login()` now reports one as a value, and the guard is this explicit branch
   * rather than the absence of a line. The identity is written on `ok` and on
   * nothing else, so a refused, unreachable or faulty attempt leaves whatever
   * was already stored exactly as it was.
   */
  const result = await attempt();
  if (result.kind !== "ok") return result;
  await identity.save({ tenant_id: tenantId, user_id: result.userId });
  return result;
}

/**
 * WHAT THE OPERATOR IS TOLD, derived from the cause and never from a status.
 *
 * Here rather than in `App.tsx` for the reason every other sentence moved into
 * `src/`: a message written under `app/` is one no proof can assert on, and
 * every operator-facing sentence that shipped wrong was one of those.
 *
 * THE TWO THAT MUST READ DIFFERENTLY: `refused` names the password and says
 * nothing about the network; `unreachable` names the connection and says
 * nothing about the password. Neither borrows the other's remedy.
 */
export function signInNotice(result: SignInResult): string | null {
  switch (result.kind) {
    case "ok":
      return null;
    case "refused":
      return "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง — ลองพิมพ์อีกครั้ง";
    case "unreachable":
      return "ติดต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจสอบการเชื่อมต่อเน็ต แล้วลองอีกครั้ง (ไม่ใช่เรื่องรหัสผ่าน)";
    case "client_outdated":
      return "แอปเวอร์ชันนี้เก่าเกินไป — ต้องอัปเดตแอปก่อนจึงจะเข้าสู่ระบบได้ (ไม่ใช่เรื่องรหัสผ่าน)";
    case "server_fault":
      return "เซิร์ฟเวอร์ตอบกลับผิดปกติ จึงเข้าสู่ระบบไม่ได้ — รหัสผ่านไม่ใช่ปัญหา แจ้งเจ้าของร้าน";
  }
}
