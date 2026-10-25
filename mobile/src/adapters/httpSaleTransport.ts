/**
 * The sale kind's transport over fetch (M2): POST /sales, mapped to the bill send's own `SendOutcome` by the SAME
 * status rules `httpTransport.sendBill` documents, plus the one status a sale has that a bill does not:
 *
 *   201 -> created (accepted)        200 -> the key was already seen, the same sale returned (duplicate)
 *   201/200 with no readable doc_no -> retry (unavailable, reachable) -- the replay delivers it, as for a bill
 *   400/422 -> refused on its merits (rejected: terminal, shown)
 *   409 insufficient_stock -> the shop refuses selling below zero and this branch holds too little NOW
 *       (rejected_resolvable, parked): a purchase not yet synced -- often weighed on this very phone -- changes
 *       the answer, so it is neither terminal nor an ordinary retry. Any OTHER 409 is unforeseen (unavailable).
 *   424 -> master data not set up (rejected_resolvable)    401 -> session ended    403 -> forbidden
 *   426 -> this build is too old                            5xx -> reachable, unusable
 *   timeout / network / no token -> no answer (unavailable, not reachable)
 *
 * Plain TS, so the headless proof points it at a real scratch server. The client-version header the 426 gate reads
 * is added by the `fetchImpl` the app passes, exactly as for the bill transport.
 */
import type { LocalSale, SaleTransport } from "../sync/localSale.js";
import type { SendOutcome } from "../sync/types.js";
import type { HttpTransportConfig } from "./httpTransport.js";

/** httpTransport.ts's `describe`, which that file does not export: three lines, named here as a copy. */
function describe(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (detail === undefined) return "no detail";
  return JSON.stringify(detail);
}

/** The refusal body's machine code, or the fallback; the classification never depends on the body. */
function refusalCode(detail: unknown, fallback: string): string {
  return typeof detail === "object" && detail !== null && "code" in detail
    ? String((detail as { code: unknown }).code)
    : fallback;
}

export class HttpSaleTransport implements SaleTransport {
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

  async sendSale(sale: LocalSale): Promise<SendOutcome> {
    const token = await this.getToken();
    if (token === null) return { kind: "unavailable", reason: "no session token", reachable: false };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/sales`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(sale.payload),
        signal: controller.signal,
      });
    } catch (err) {
      return { kind: "unavailable", reason: `network: ${err instanceof Error ? err.message : String(err)}`, reachable: false };
    } finally {
      clearTimeout(timer);
    }
    let body: { doc_no?: unknown; detail?: unknown } = {};
    try {
      body = (await response.json()) as { doc_no?: unknown; detail?: unknown };
    } catch {
      body = {};
    }
    const docNo = typeof body.doc_no === "string" ? body.doc_no : null;
    const s = response.status;
    if ((s === 201 || s === 200) && docNo === null) {
      return { kind: "unavailable", reason: `HTTP ${String(s)}: the sale landed but no readable doc_no — retrying for the replay`, reachable: true };
    }
    if (s === 201) return { kind: "accepted", doc_no: docNo };
    if (s === 200) return { kind: "duplicate", doc_no: docNo };
    if (s === 400 || s === 422) return { kind: "rejected", reason: `HTTP ${String(s)}: ${describe(body.detail)}` };
    if (s === 401) return { kind: "session_expired", reason: `HTTP 401: ${describe(body.detail)}` };
    if (s === 403) return { kind: "forbidden", code: refusalCode(body.detail, "forbidden"), reason: `HTTP 403: ${describe(body.detail)}` };
    if (s === 409 && refusalCode(body.detail, "") === "insufficient_stock") {
      return { kind: "rejected_resolvable", reason: `HTTP 409: ${describe(body.detail)}`, code: "insufficient_stock" };
    }
    if (s === 424) {
      return { kind: "rejected_resolvable", reason: `HTTP 424: ${describe(body.detail)}`, code: refusalCode(body.detail, "master_data_missing") };
    }
    if (s === 426) return { kind: "client_outdated", reason: `HTTP 426: ${describe(body.detail)}` };
    return { kind: "unavailable", reason: `HTTP ${String(s)}: ${describe(body.detail)}`, reachable: true };
  }
}
