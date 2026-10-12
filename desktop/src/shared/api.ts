/**
 * THE DESKTOP'S API CLIENT — pure: no Electron, no DOM beyond `fetch`, an injectable fetch so a
 * proof drives exactly this. Every call is classified into ONE of a closed set of outcomes, and
 * the screen speaks from the outcome, never from a status code or a body
 * (lessons/correct-classification-can-still-render-as-an-error.md).
 *
 *   ok             the answer
 *   unauthorized   401 — ABOUT THE CALLER: the session is over (or the credentials are wrong on
 *                  the login route itself). Never retried (lessons/401-is-about-the-caller-not-the-bill.md).
 *   forbidden      403 — this account may not do this
 *   not_found      404
 *   outdated       426 — this program is older than the server accepts; only an update helps
 *   invalid        422 / other 4xx — the request itself is wrong
 *   unavailable    no answer, or a 5xx: the network or the server; asking again later may work
 *
 * Every request carries the API-contract version header (server/app/version_gate.py), the same
 * integer the phone sends (mobile/src/net/clientVersion.ts).
 */
export const CLIENT_API_VERSION = 1;
export const CLIENT_API_VERSION_HEADER = "x-client-api-version";

export type ApiOutcome<T> =
  | { kind: "ok"; value: T }
  | { kind: "unauthorized" }
  | { kind: "forbidden"; requiredPermission: string | null }
  | { kind: "not_found" }
  | { kind: "outdated" }
  | { kind: "invalid"; status: number; code: string | null }
  | { kind: "unavailable"; reason: string };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface WhoAmI {
  readonly tenant_id: string;
  readonly user_id: string;
  readonly username: string;
  readonly role: string;
  readonly permissions: readonly string[];
}

/** The server's own words for the refusal, read only to pick a CODE out of a structured detail. */
async function detailCode(res: Response): Promise<{ code: string | null; requiredPermission: string | null }> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    const d = body.detail;
    if (d !== null && typeof d === "object") {
      const o = d as Record<string, unknown>;
      return {
        code: typeof o["code"] === "string" ? o["code"] : null,
        requiredPermission: typeof o["required_permission"] === "string" ? o["required_permission"] : null,
      };
    }
  } catch {
    /* an unreadable body classifies by status alone */
  }
  return { code: null, requiredPermission: null };
}

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike,
    private readonly timeoutMs = 15_000,
  ) {}

  private async call<T>(
    method: string,
    path: string,
    opts: { token?: string; body?: unknown; read: (json: unknown) => T | null },
  ): Promise<ApiOutcome<T>> {
    const headers: Record<string, string> = { [CLIENT_API_VERSION_HEADER]: String(CLIENT_API_VERSION) };
    if (opts.token !== undefined) headers["authorization"] = `Bearer ${opts.token}`;
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl.replace(/\/+$/, "")}${path}`, {
        method,
        headers,
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        signal: controller.signal,
      });
    } catch (err) {
      return { kind: "unavailable", reason: err instanceof Error ? err.message : String(err) };
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401) return { kind: "unauthorized" };
    if (res.status === 426) return { kind: "outdated" };
    if (res.status === 404) return { kind: "not_found" };
    if (res.status === 403) {
      const d = await detailCode(res);
      return { kind: "forbidden", requiredPermission: d.requiredPermission };
    }
    if (res.status >= 500) return { kind: "unavailable", reason: `HTTP ${String(res.status)}` };
    if (res.status < 200 || res.status >= 300) {
      const d = await detailCode(res);
      return { kind: "invalid", status: res.status, code: d.code };
    }
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { kind: "unavailable", reason: "the answer was not readable" };
    }
    const value = opts.read(json);
    return value === null ? { kind: "unavailable", reason: "the answer had an unexpected shape" } : { kind: "ok", value };
  }

  resolveShopCode(code: string): Promise<ApiOutcome<string>> {
    return this.call("POST", "/auth/shop-code", {
      body: { code },
      read: (j) => {
        const t = (j as { tenant_id?: unknown }).tenant_id;
        return typeof t === "string" ? t : null;
      },
    });
  }

  login(tenantId: string, username: string, password: string): Promise<ApiOutcome<string>> {
    return this.call("POST", "/auth/login", {
      body: { tenant_id: tenantId, username, password },
      read: (j) => {
        const t = (j as { access_token?: unknown }).access_token;
        return typeof t === "string" && t !== "" ? t : null;
      },
    });
  }

  whoami(token: string): Promise<ApiOutcome<WhoAmI>> {
    return this.call("GET", "/whoami", {
      token,
      read: (j) => {
        const o = j as Record<string, unknown>;
        if (typeof o["username"] !== "string" || typeof o["role"] !== "string" || !Array.isArray(o["permissions"])) {
          return null;
        }
        return {
          tenant_id: String(o["tenant_id"]),
          user_id: String(o["user_id"]),
          username: o["username"],
          role: o["role"],
          permissions: (o["permissions"] as unknown[]).map(String),
        };
      },
    });
  }

  /** Any authenticated JSON read; the caller supplies the shape check. */
  get<T>(token: string, path: string, read: (json: unknown) => T | null): Promise<ApiOutcome<T>> {
    return this.call("GET", path, { token, read });
  }

  post<T>(token: string, path: string, body: unknown, read: (json: unknown) => T | null): Promise<ApiOutcome<T>> {
    return this.call("POST", path, { token, body, read });
  }
}
