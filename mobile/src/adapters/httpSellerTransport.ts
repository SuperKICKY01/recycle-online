/**
 * THE TWO SELLER ROUTES OVER HTTP: `POST /sellers` carrying a reservation, and
 * `POST /seller-code-reservations` to top the holding up.
 *
 * Shaped like `adapters/httpTransport.ts` — a `baseUrl`, an injected
 * `getToken`, an injected `fetchImpl`, a timeout —
 * because that is the shape a proof can point at a real server OR at a
 * recording fake without the module knowing which. That matters more here than
 * usual: `THE-TOKEN-IS-ON-THE-WIRE` is measured by READING THE REQUEST THIS
 * CLASS MAKES, so what is proven is the thing that ships rather than a
 * hand-built request that resembles it.
 *
 * ===========================================================================
 * IT RETURNS AN OUTCOME. IT NEVER THROWS, AND IT NEVER HANDS BACK A BODY.
 * ===========================================================================
 * THE RULE AND ITS SPECIFIC HAZARD, on this route: FastAPI's default validation
 * handler serialises the value it
 * refused, and ON THIS ROUTE THAT VALUE CAN BE AN ID CARD NUMBER. The server
 * strips pydantic's `input` API-wide; this file does not rely on that. It reads
 * a 4xx body in exactly ONE branch, for exactly ONE short string — a 403's
 * machine-readable `code` — and nowhere else.
 *
 * SO NO `reason` RETURNED FROM HERE IS EVER TAKEN FROM A REFUSAL BODY. Each is
 * a fixed diagnostic written in this file, naming the status and nothing about
 * the payload. `reason` reaches `local_sellers.last_error`, and a column that
 * could hold a refused id number is a column that has published one.
 *
 * ===========================================================================
 * THE RESERVATION TOKEN GOES OUT AND NEVER COMES BACK IN
 * ===========================================================================
 * It is a bearer secret for one reservation. It is written into the request
 * body and is never read out of a response, never put into an outcome, never
 * logged, and never included in an error message. The server observes the same
 * rule from its side — its refusal bodies name neither the token nor the code.
 */

import type { LocalSeller } from "../sync/localSeller.js";
import type { SellerCreateOutcome, SellerCreateTransport } from "../sync/sellerCreate.js";
import type {
  RefillOutcome,
  ReservationTransport,
  ReservationHolding,
} from "../sync/sellerRefill.js";
import type { IssuedCode } from "../sync/localSeller.js";

export interface SellerHttpConfig {
  baseUrl: string;
  /** Bearer token for the current session, or null when not logged in. */
  getToken: () => Promise<string | null>;
  timeoutMs?: number;
  fetchImpl?: typeof globalThis.fetch;
}

/** A non-empty string, or null. Never a coercion, never a default. */
function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * The server's `code` out of a 403 body, or a safe stand-in.
 *
 * THE ONLY VALUE THIS MODULE TAKES OUT OF ANY REFUSAL, and the same contract
 * `httpTransport.refusalCode` and `createSeller.forbiddenCode` both keep: a
 * machine-readable reason the UI turns into its own sentence. A body that will
 * not parse yields the fallback, so the classification never depends on the
 * body — only the status does.
 */
function forbiddenCode(body: unknown): string {
  if (typeof body !== "object" || body === null) return "forbidden";
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail !== "object" || detail === null) return "forbidden";
  return str((detail as { code?: unknown }).code) ?? "forbidden";
}

/**
 * The created row's SERVER id out of a 2xx body, or null meaning AMBIGUOUS.
 *
 * STRICT ON PURPOSE. A cast would turn an absent field into `undefined` typed
 * as `string` and write it onto the local row as the server's id — a local
 * seller permanently bound to a row that does not exist, with no error
 * anywhere. Strict for the reason the void path already paid: `adapters/httpTransport.ts`'s
 * own guard above its 201 branch, where a 2xx whose body lost its doc_no once
 * fell through to success and markSynced wrote the null permanently.
 *
 * ONLY THE ID IS TAKEN. The online path reads nine fields because a screen
 * renders them; nothing here renders anything, and every other field is already
 * on the local row.
 */
function readServerId(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  return str((body as Record<string, unknown>)["id"]);
}

/** The device's whole holding out of a 200 body, or null meaning unreadable. */
function readHolding(body: unknown): ReservationHolding | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = body as Record<string, unknown>;
  const target = raw["target_holding"];
  if (typeof target !== "number" || !Number.isInteger(target) || target < 0) return null;
  const list = raw["reservations"];
  if (!Array.isArray(list)) return null;
  const out: IssuedCode[] = [];
  for (const item of list) {
    if (typeof item !== "object" || item === null) return null;
    const code = str((item as Record<string, unknown>)["code"]);
    const token = str((item as Record<string, unknown>)["token"]);
    // A PARTIAL HOLDING IS NOT A HOLDING. One unreadable entry refuses the
    // whole answer rather than storing the rest: a code stored without its
    // token is a code this device can never spend, and it would sit in the
    // spendable count telling the yard it can create a walk-in it cannot.
    if (code === null || token === null) return null;
    out.push({ code, token });
  }
  return { target, reservations: out };
}

/**
 * The create body.
 *
 * `code` AND `reservation_token` TOGETHER, ALWAYS. The server refuses a token
 * without a code — `reservation_token_without_code`, a 422 — because a token
 * names exactly one code and a request carrying the secret but not the value it
 * unlocks cannot be completed by guessing. This kind always has both, because
 * `createLocalSeller` binds them to the row in one transaction.
 *
 * NO `id`. `SellerCreate` sets `extra="forbid"` and declares none: `sellers.id`
 * carries `DEFAULT gen_random_uuid()` where `purchase_bills.id` has no default,
 * because the offline boundary was drawn at the BILL on purpose (hard rule 3).
 * Sending the local id would be refused outright.
 *
 * EVERY NULL FIELD IS OMITTED rather than sent as null. The server's optional
 * fields are `X | None = None`, so an absent key and a null key mean the same
 * thing to it — and an omitted key cannot be the one that trips a length
 * constraint on an empty string.
 */
function createBody(row: LocalSeller): Record<string, string> {
  const out: Record<string, string> = {
    code: row.code,
    reservation_token: row.reservation_token,
    name: row.name,
  };
  if (row.phone !== null) out["phone"] = row.phone;
  if (row.grade !== null) out["grade"] = row.grade;
  if (row.id_number !== null) out["id_number"] = row.id_number;
  if (row.address !== null) out["address"] = row.address;
  if (row.vehicle_no !== null) out["vehicle_no"] = row.vehicle_no;
  return out;
}

export class HttpSellerTransport implements SellerCreateTransport, ReservationTransport {
  private readonly baseUrl: string;
  private readonly getToken: () => Promise<string | null>;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(config: SellerHttpConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.getToken = config.getToken;
    this.timeoutMs = config.timeoutMs ?? 20_000;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  /**
   * `POST /sellers`, spending the row's reservation.
   *
   * 201 IS `created` AND 200 IS `already_created`, and telling them apart is
   * the whole reason the server distinguishes them: the route answers 200 when
   * it recognised the token and created nothing. Both are success and both
   * carry the server's id, so a device that lost a response is repaired by
   * asking again rather than by creating a second person.
   */
  async createSeller(row: LocalSeller): Promise<SellerCreateOutcome> {
    let token: string | null;
    try {
      token = await this.getToken();
    } catch {
      // A keystore that will not open is not an answer about the seller. It is
      // unknown-outcome shaped, and this row is owed work a later sign-in
      // drains by itself — so `unavailable`, never a refusal.
      return { kind: "unavailable", reason: "no session available" };
    }
    if (token === null) return { kind: "session_expired", reason: "no token" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/sellers`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(createBody(row)),
        signal: controller.signal,
      });
    } catch {
      // Timeout, DNS, no route, aeroplane mode: the server was never reached.
      // The error is NOT captured — nothing downstream may render it.
      return { kind: "unavailable", reason: "transport failure" };
    } finally {
      clearTimeout(timer);
    }

    const status = response.status;

    if (status >= 200 && status < 300) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { kind: "ambiguous", reason: "2xx body unreadable" };
      }
      const id = readServerId(body);
      if (id === null) return { kind: "ambiguous", reason: "2xx body carried no seller id" };
      // 200 means the server recognised the reservation token and created
      // nothing this time; 201 means this request is what created the row.
      return status === 200
        ? { kind: "already_created", server_seller_id: id }
        : { kind: "created", server_seller_id: id };
    }

    if (status === 401) return { kind: "session_expired", reason: "401" };
    if (status === 403) {
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      return { kind: "forbidden", code: forbiddenCode(body), reason: "403" };
    }
    if (status === 409) {
      // THE UNREACHABLE STATE. The body is NOT read: the two server-side guards
      // make this impossible, so what matters is that it happened, not which
      // sentence the server chose. `needs_review` is the disposition, and no
      // arm of this kind settles it.
      return { kind: "conflict", code: "conflict", reason: "409" };
    }
    if (status === 400 || status === 422) {
      // PERMANENT on the payload's own merits. The body is NOT read — this is
      // the status whose body can echo an id number.
      return { kind: "invalid", reason: `${String(status)} refused on the payload` };
    }
    if (status === 426) {
      // THIS BUILD is too old (server/app/version_gate.py). The body is NOT read
      // — like every refusal on this route, its body can echo an id number. The
      // create stays owed with its token and resends after the app is updated.
      return { kind: "client_outdated", reason: "426" };
    }
    // 404, 405, 5xx, anything unforeseen: the server answered and the answer is
    // unusable, which for owed work is the same instruction as no answer.
    return { kind: "unavailable", reason: `unusable status ${String(status)}` };
  }

  /**
   * `POST /seller-code-reservations` — make this device hold its target.
   *
   * EVERY NON-ANSWER IS `unavailable`, INCLUDING A 4xx. That is not laziness
   * about classification; it is the classification, argued in
   * `sync/sellerRefill.ts`: there is no payload here to be permanently wrong
   * about and no master data for an office to fix, so the other two classes of
   * the three-way rule have no referent. Marking a refill terminal would
   * permanently stop a handset from ever obtaining a code again, with no
   * operator action able to undo it.
   *
   * ONE FIELD ON THE WIRE. No quantity and no idempotency key: the thing being
   * asked for is a LEVEL, and a level asked for twice is the same sentence as
   * asked once. `ReservationTopUp` sets `extra="forbid"`, so a client that sent
   * a quantity would be refused loudly rather than have it silently ignored.
   */
  async topUp(deviceId: string): Promise<RefillOutcome> {
    let token: string | null;
    try {
      token = await this.getToken();
    } catch {
      return { kind: "unavailable", reason: "no session available" };
    }
    if (token === null) return { kind: "unavailable", reason: "no token" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/seller-code-reservations`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ device_id: deviceId }),
        signal: controller.signal,
      });
    } catch {
      return { kind: "unavailable", reason: "transport failure" };
    } finally {
      clearTimeout(timer);
    }

    // A 401 IS ABOUT THE CALLER, not the network (amended 2026-10-12; sync/sellerRefill.ts
    // RefillOutcome): the engine reports it and stops asking until the operator signs in.
    if (response.status === 401) return { kind: "session_expired", reason: "401" };
    if (response.status !== 200) {
      // 200 AND NEVER 201, including on the call that mints a whole block —
      // the route's own docstring says so, because the response describes a
      // STATE and a status that alternated with the number of rows written
      // would put the quantity back on the wire.
      return { kind: "unavailable", reason: `unusable status ${String(response.status)}` };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { kind: "unavailable", reason: "200 body unreadable" };
    }
    const holding = readHolding(body);
    if (holding === null) return { kind: "unavailable", reason: "200 body was not a holding" };
    return { kind: "holding", holding };
  }
}
