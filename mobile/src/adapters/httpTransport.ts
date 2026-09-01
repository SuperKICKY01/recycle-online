/**
 * Production Transport over fetch. Plain JS/TS — no React Native, no Expo — so
 * it can be pointed at a real server from node as easily as from a device.
 *
 * The status mapping mirrors the server contract proven in Phase 1c:
 *   201 -> created                                          (accepted)
 *   200 -> idempotency key already seen, same bill returned (duplicate)
 *   201/200 with no readable doc_no -> retry it   (unavailable, reachable: true)
 *   400/422 -> validation refusal                           (rejected: terminal)
 *   424     -> master data not set up yet                  (rejected_resolvable)
 *   401     -> the session ended, sign in again            (session_expired)
 *   403     -> this ACCOUNT may not do this                (forbidden)
 *   426     -> this BUILD is too old for the server        (client_outdated)
 *   5xx     -> server answered but unusably      (unavailable, reachable: true)
 *   timeout / network / no token -> no answer    (unavailable, reachable: false)
 *
 * `reachable` is the poison signal: a retry that keeps hitting a 5xx is a
 * reachable server refusing this bill, which the UI escalates to a loud alarm,
 * unlike a yard that is simply offline. See sync/queueHealth.ts.
 *
 * TWO STATUSES HAVE LEFT THAT LAST LINE, for the same reason and in two phases.
 *
 * 401, in 2c-7. An expired token is not an unknown outcome and it is not this
 * bill's fault: it made three queued bills look like a poisoned queue ("call
 * support") and one queued bill look like a dead spot ("ออฟไลน์").
 *
 * 403, HERE. This comment used to say "403 stays — the server has no permission
 * model in the MVP, so a 403 here would be a genuine server-side surprise". That
 * became false the day POST /bills/{id}/void and every master-data write became
 * admin-only (server/app/auth.py require_admin), and the consequence was not
 * hypothetical: a STAFF phone tapping ยกเลิกบิล was answered 403, the void stayed
 * in listVoidsToApply — which has no backoff at all — and the device re-POSTed it
 * every four seconds, forever, while the card said the cancellation was on its
 * way. On the SEND path the same mapping ran the poison counter to
 * POISON_ALARM_ATTEMPTS and produced the red "ติดต่อฝ่ายสนับสนุน" alarm over a
 * permission no support desk can grant.
 *
 * The refusal is read off the STATUS, not the body: 403 is not 401, not 422, not
 * 424, not 5xx, and that axis survives a body that fails to parse. The body's
 * `code` is carried for the UI's wording only — nothing here string-matches a
 * message, which is exactly why the server names its own kind.
 *
 * NOT VERIFIED against the running server in Phase 2a. See the note at the end
 * of the proof output.
 */
import type { LocalBill, SendOutcome, Transport, VoidOutcome } from "../sync/types.js";

export interface HttpTransportConfig {
  baseUrl: string;
  /** Bearer token for the current session, or null when not logged in. */
  getToken: () => Promise<string | null>;
  timeoutMs?: number;
  fetchImpl?: typeof globalThis.fetch;
}

interface BillResponseBody {
  doc_no?: string | null;
  detail?: unknown;
}

/**
 * The `code` out of a refusal body, or a safe stand-in.
 *
 * Shared by the 403 and 424 paths because they have the same contract and the
 * same hazard: the code is a machine-readable reason the UI turns into its own
 * sentence, and NOTHING may fall through to rendering the server's prose or the
 * body itself (lessons/correct-classification-can-still-render-as-an-error.md).
 * A body we could not parse yields the fallback, so the classification never
 * depends on the body at all — only the status does.
 */
function refusalCode(detail: unknown, fallback: string): string {
  return typeof detail === "object" && detail !== null && "code" in detail
    ? String((detail as { code: unknown }).code)
    : fallback;
}

export class HttpTransport implements Transport {
  private readonly baseUrl: string;
  private readonly getToken: () => Promise<string | null>;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(config: HttpTransportConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.getToken = config.getToken;
    this.timeoutMs = config.timeoutMs ?? 20_000;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  async sendBill(bill: LocalBill): Promise<SendOutcome> {
    const token = await this.getToken();
    if (token === null) {
      // Not a rejection of the bill — we never asked the server anything, so it
      // is not reachable evidence either.
      return { kind: "unavailable", reason: "no session token", reachable: false };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/bills`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(bill.payload),
        signal: controller.signal,
      });
    } catch (err) {
      // fetch threw: timeout, DNS, no route — we never reached the server.
      const reason = err instanceof Error ? err.message : String(err);
      return { kind: "unavailable", reason: `network: ${reason}`, reachable: false };
    } finally {
      clearTimeout(timer);
    }

    // A body we cannot parse must not invent a doc_no; null means "unknown".
    // What "unknown" MEANS on a success status changed — see the guard below.
    let body: BillResponseBody = {};
    try {
      body = (await response.json()) as BillResponseBody;
    } catch {
      body = {};
    }
    const docNo = typeof body.doc_no === "string" ? body.doc_no : null;

    /*
     * A 2xx WHOSE BODY LOST THE doc_no IS A RETRY, NEVER A SUCCESS.
     *
     * This used to fall through to accepted/duplicate with doc_no null, and
     * markSynced wrote that null PERMANENTLY: nothing in the app re-fetches a
     * doc_no after sync, and listVoidsToApply requires `doc_no IS NOT NULL`,
     * so a later void of that bill was never sent, never refused and never
     * retried — while voidProgressLine promised it would happen automatically.
     * The server, meanwhile, holds the bill WITH its doc_no (assigned in the
     * same transaction that created it), so money the owner cancelled stayed
     * live. The trigger is ordinary: a connection that died after the status
     * line but before the body finished.
     *
     * Retrying converges BY THE SERVER'S OWN CONTRACT (hard rule 4): the
     * re-POST carries the same idempotency_key, the server answers 200 with
     * the same bill, and that response's doc_no lands here as a string.
     * reachable: true because the server answered — and if something between
     * us mangles every body forever, the poison alarm escalating is the
     * correct outcome, not a silently stranded cancellation.
     */
    if ((response.status === 201 || response.status === 200) && docNo === null) {
      return {
        kind: "unavailable",
        reason:
          `HTTP ${String(response.status)}: the bill landed but the response` +
          " carried no readable doc_no — retrying so the idempotent replay can deliver it",
        reachable: true,
      };
    }

    if (response.status === 201) return { kind: "accepted", doc_no: docNo };
    if (response.status === 200) return { kind: "duplicate", doc_no: docNo };
    if (response.status === 400 || response.status === 422) {
      return { kind: "rejected", reason: `HTTP ${response.status}: ${describe(body.detail)}` };
    }
    if (response.status === 401) {
      // The token expired, was revoked, or names a user that no longer exists
      // (server/app/auth.py answers all three with 401). The bill is fine and
      // stays queued; only a sign-in unblocks it.
      return { kind: "session_expired", reason: `HTTP 401: ${describe(body.detail)}` };
    }
    if (response.status === 403) {
      // FORBIDDEN. The caller is authenticated and is not permitted. Nothing is
      // wrong with the bill, the network, the server or the session — only with
      // what this account may do, and only a human elsewhere changes that.
      return {
        kind: "forbidden",
        code: refusalCode(body.detail, "forbidden"),
        reason: `HTTP 403: ${describe(body.detail)}`,
      };
    }
    if (response.status === 424) {
      // RESOLVABLE: well-formed bill, master data not set up yet. The status code
      // carries the classification so it survives a body we cannot parse; the
      // code inside the body is for the UI. Nothing here string-matches a
      // message — that is the whole point of the server naming the kind.
      return {
        kind: "rejected_resolvable",
        reason: `HTTP 424: ${describe(body.detail)}`,
        code: refusalCode(body.detail, "master_data_missing"),
      };
    }
    if (response.status === 426) {
      // THE BUILD IS TOO OLD. The server refused this client's API-contract
      // version (server/app/version_gate.py). Nothing is wrong with the bill,
      // the network, the session or the account — the bill stays queued and goes
      // the moment the app is updated. Read off the STATUS, which survives a body
      // that fails to parse; a 426 carries no code the client branches on.
      return { kind: "client_outdated", reason: `HTTP 426: ${describe(body.detail)}` };
    }
    // A status we could not use (5xx, or anything unforeseen). The server
    // ANSWERED, so the network is usable and this is reachable-but-refusing:
    // reachable: true.
    return {
      kind: "unavailable",
      reason: `HTTP ${response.status}: ${describe(body.detail)}`,
      reachable: true,
    };
  }

  /**
   * POST /bills/{id}/void — the Phase 1c endpoint, unchanged and not rebuilt.
   *
   *   200 -> voided now
   *   409 -> already voided. SUCCESS: the bill is in the state the owner asked
   *          for. This is the case that makes a lost response safe — we retry,
   *          the server says "already", and we settle. Treating 409 as an error
   *          would retry forever over a bill that is already correct.
   *   404 -> the server does not have this bill under this tenant. A definite
   *          answer, so terminal, not a retry.
   *   401 -> the session ended. Still owed, retried after a sign-in.
   *   403 -> THIS ACCOUNT MAY NOT VOID. Since the role gate landed, this is the
   *          one a yard actually meets: creating bills is open to staff and
   *          unwinding one is not, so a staff phone works all day and is refused
   *          the moment it taps ยกเลิกบิล. Not owed, not retried — the void
   *          stops being pending work and the card says the bill was NOT
   *          cancelled, because the server still holds it as live money.
   *   anything else / network -> unknown, retry.
   */
  async voidBill(bill: LocalBill, reason: string): Promise<VoidOutcome> {
    const token = await this.getToken();
    if (token === null) return { kind: "unavailable", reason: "no session token" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/bills/${bill.id}/void`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason }),
        signal: controller.signal,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { kind: "unavailable", reason: `network: ${message}` };
    } finally {
      clearTimeout(timer);
    }

    let body: BillResponseBody = {};
    try {
      body = (await response.json()) as BillResponseBody;
    } catch {
      body = {};
    }
    const docNo = typeof body.doc_no === "string" ? body.doc_no : null;

    if (response.status === 200) return { kind: "voided", doc_no: docNo };
    if (response.status === 409) return { kind: "already_voided", doc_no: docNo };
    // Same reasoning as sendBill: a void owed by a device whose session ended is
    // not an outage. Without this, a bill that is synced and only owes a void
    // would meet an expired session with nothing on the screen explaining it.
    if (response.status === 401) {
      return { kind: "session_expired", reason: `HTTP 401: ${describe(body.detail)}` };
    }
    // Checked BEFORE 404, mirroring the server: require_admin runs as a dependency,
    // so a staff caller is refused before void_bill ever looks the bill up. A 403
    // here therefore says nothing about whether the bill exists — and must not be
    // read as if it did.
    if (response.status === 403) {
      return {
        kind: "forbidden",
        code: refusalCode(body.detail, "forbidden"),
        reason: `HTTP 403: ${describe(body.detail)}`,
      };
    }
    if (response.status === 404 || response.status === 400 || response.status === 422) {
      return { kind: "rejected", reason: `HTTP ${response.status}: ${describe(body.detail)}` };
    }
    if (response.status === 426) {
      // THIS BUILD is too old (server/app/version_gate.py). Same as sendBill's
      // 426: the void stays owed and applies after the app is updated.
      return { kind: "client_outdated", reason: `HTTP 426: ${describe(body.detail)}` };
    }
    return { kind: "unavailable", reason: `HTTP ${response.status}: ${describe(body.detail)}` };
  }
}

function describe(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (detail === undefined) return "no detail";
  return JSON.stringify(detail);
}
