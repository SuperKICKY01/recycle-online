/**
 * Production Transport over fetch. Plain JS/TS — no React Native, no Expo — so
 * it can be pointed at a real server from node as easily as from a device.
 *
 * The status mapping mirrors the server contract proven in Phase 1c:
 *   201 -> created                                          (accepted)
 *   200 -> idempotency key already seen, same bill returned (duplicate)
 *   400/422 -> validation refusal                           (rejected: terminal)
 *   401/403/5xx -> server answered but unusable  (unavailable, reachable: true)
 *   timeout / network / no token -> no answer    (unavailable, reachable: false)
 *
 * `reachable` is the poison signal: a retry that keeps hitting 401/403/5xx is a
 * reachable server refusing this bill, which the UI escalates to a loud alarm,
 * unlike a yard that is simply offline. See sync/queueHealth.ts.
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

    // A body we cannot parse must not invent a doc_no; null means "unknown",
    // and the status still tells us whether the bill landed.
    let body: BillResponseBody = {};
    try {
      body = (await response.json()) as BillResponseBody;
    } catch {
      body = {};
    }
    const docNo = typeof body.doc_no === "string" ? body.doc_no : null;

    if (response.status === 201) return { kind: "accepted", doc_no: docNo };
    if (response.status === 200) return { kind: "duplicate", doc_no: docNo };
    if (response.status === 400 || response.status === 422) {
      return { kind: "rejected", reason: `HTTP ${response.status}: ${describe(body.detail)}` };
    }
    // A status we could not use (401/403/5xx). The server ANSWERED, so the
    // network is usable and this is reachable-but-refusing: reachable: true.
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
    if (response.status === 404 || response.status === 400 || response.status === 422) {
      return { kind: "rejected", reason: `HTTP ${response.status}: ${describe(body.detail)}` };
    }
    return { kind: "unavailable", reason: `HTTP ${response.status}: ${describe(body.detail)}` };
  }
}

function describe(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (detail === undefined) return "no detail";
  return JSON.stringify(detail);
}
