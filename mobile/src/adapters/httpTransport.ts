/**
 * Production Transport over fetch. Plain JS/TS — no React Native, no Expo — so
 * it can be pointed at a real server from node as easily as from a device.
 *
 * The status mapping mirrors the server contract proven in Phase 1c:
 *   201 -> created            (accepted)
 *   200 -> idempotency key already seen, same bill returned  (duplicate)
 *   422 -> validation refusal (rejected: terminal)
 *   401/403/5xx/network -> outcome unknown or unreachable (unavailable: retry)
 *
 * NOT VERIFIED against the running server in Phase 2a. See the note at the end
 * of the proof output.
 */
import type { LocalBill, SendOutcome, Transport } from "../sync/types.js";

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
      // Not a rejection of the bill — we never asked the server anything.
      return { kind: "unavailable", reason: "no session token" };
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
      const reason = err instanceof Error ? err.message : String(err);
      return { kind: "unavailable", reason: `network: ${reason}` };
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
    return {
      kind: "unavailable",
      reason: `HTTP ${response.status}: ${describe(body.detail)}`,
    };
  }
}

function describe(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (detail === undefined) return "no detail";
  return JSON.stringify(detail);
}
