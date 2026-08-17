/**
 * POST /sellers — the client half of P1.8a. Plain JS/TS: no React Native, no
 * Expo, no node, so a headless proof drives exactly what the phone runs, and it
 * is reachable from `app/` the way SellerPicker already reaches
 * `../src/cart/sellers`.
 *
 * Shaped like adapters/httpTransport.ts on purpose — a `baseUrl`, an injected
 * `getToken`, an injected `fetchImpl`, a timeout — because that is the shape a
 * proof can point at a real server or at a fake without the module knowing.
 *
 * ===========================================================================
 * IT RETURNS AN OUTCOME. IT NEVER THROWS, AND IT NEVER HANDS BACK A BODY.
 * ===========================================================================
 * The whole deliverable of this file is `CreateSellerOutcome`, not the request.
 * A screen renders from it and must not have to DECIDE anything: no status
 * numbers to compare, no `detail` to inspect, no message to string-match. That
 * is the rule lessons/correct-classification-can-still-render-as-an-error.md
 * arrived at the hard way — its repair was to remove the diagnostic from the
 * parameter list rather than gate on it, because a view-level gate is a bug you
 * have not found yet. So no member of this union carries a raw body, a
 * `detail`, a `message` or a status number. If the field does not exist, no
 * screen can print it.
 *
 * A SPECIFIC REASON THAT IS URGENT ON THIS ROUTE. FastAPI's default validation
 * handler serialises the value it refused, and on this route that value can be
 * an ID CARD NUMBER (lessons/a-refusal-hands-back-what-it-refused.md — the same
 * mechanism handed back a password). server/app/main.py's
 * validation_error_handler strips pydantic's `input` API-wide, so the echo is
 * gone at the server; this file does not rely on that. IT NEVER READS A 4xx
 * BODY AT ALL, with exactly one bounded exception: a 403, from which a single
 * string `code` is taken and nothing else. There is therefore no path by which
 * a refused id_number can reach a caller of this function, whatever the server
 * decides to put in a refusal tomorrow.
 *
 * THE CLASSIFICATION COMES FROM THE STATUS, plus ONE FACT THIS CLIENT OWNS:
 * whether the caller supplied a code. The server answers 409 for two different
 * things — `duplicate_code` when a supplied code collides, and
 * `code_assignment_failed` when it could not mint one — and it says in its own
 * comment why they must not be conflated: "the caller supplied no code, so
 * naming one as taken would be a confident lie about a value they never sent".
 * Reading the body to tell them apart would put the classification back inside
 * a body that may not parse. The draft is the better discriminator: it is known
 * before the request is sent and it cannot be wrong.
 */

/**
 * What a person at the weighbridge has typed. `name` is the only required
 * field, which is the server's own decision and not a relaxation invented here.
 *
 * ---------------------------------------------------------------------------
 * THE OPTIONALITY, UNDER `exactOptionalPropertyTypes: true`
 * ---------------------------------------------------------------------------
 * Every optional field is `?: string | undefined` and NOT `?: string`. Under
 * that flag the two are different types: `?: string` permits the property to be
 * ABSENT but forbids it being present-and-undefined, so a form holding an empty
 * field would have to be assembled by conditional spreads
 * (`...(v ? { id_number: v } : {})`) at every call site. `?: string | undefined`
 * lets a screen write `id_number: v.trim() || undefined`, which is what a form
 * actually does, and the two spellings put the SAME bytes on the wire because
 * JSON.stringify drops undefined values.
 *
 * `code`, `phone` and `grade` take the same form, for the same reason.
 *
 * NOTHING HERE IS NORMALISED. An empty string is sent as an empty string and
 * refused by the server's min_length=1, rather than being silently dropped: a
 * client that quietly discards what somebody typed is a client whose screen and
 * whose request disagree.
 */
export interface SellerDraft {
  name: string;
  /**
   * ABSENT MEANS "THE SERVER ASSIGNS ONE" — it does not mean "no code". Both
   * halves are real: a shop with a paper code system supplies its own and keeps
   * it exactly as typed, a shop without one never has to invent a unique string
   * with a truck on the weighbridge (server/app/master.py, SellerCreate).
   */
  code?: string | undefined;
  phone?: string | undefined;
  /** "A" | "B" | "C" | "D" on the server. Absent is legal and common. */
  grade?: string | undefined;
  /**
   * SRS 1.6, all three optional, and the server records why: "a yard weighs a
   * walk-in's scrap and pays cash long before it has their address", so
   * refusing the seller row would refuse the purchase.
   *
   * NOTE this vehicle_no is the one the seller USUALLY arrives in.
   * purchase_bills.vehicle_no is the truck that turned up that day. Two facts;
   * do not collapse them.
   */
  id_number?: string | undefined;
  address?: string | undefined;
  vehicle_no?: string | undefined;
}

/**
 * The row the server created, as the server describes it.
 *
 * PRESENT-AND-NULLABLE, not optional, and that is a claim about the wire rather
 * than a style choice: `_seller_payload` emits all nine keys unconditionally,
 * with null where a column is unset. Declaring them optional would say the key
 * may be missing, which is false, and would let a reader treat "absent" and
 * "null" as the same thing when only one of them ever happens.
 */
export interface CreatedSeller {
  id: string;
  /** Server-assigned when the draft carried none; the draft's own when it did. */
  code: string;
  name: string;
  phone: string | null;
  grade: string | null;
  id_number: string | null;
  address: string | null;
  vehicle_no: string | null;
  is_active: boolean;
}

/**
 * ===========================================================================
 * THE OUTCOME. Eight members, each with ONE instruction behind it.
 * ===========================================================================
 * Every switch over this union must end in a `never` guard — the way
 * SendOutcome and VoidOutcome do in sync/engine.ts — so that a member added
 * later is a COMPILE ERROR at every renderer rather than a silent
 * fall-through. A green button that does nothing is a worse defect than the one
 * being fixed (lessons/correct-classification-can-still-render-as-an-error.md,
 * the R2b amendment).
 *
 * NAMES. `session_expired` and `forbidden` are spelled exactly as SendOutcome
 * and VoidOutcome spell them, because a screen switching over all three unions
 * with two names for one condition is how they come to disagree. `invalid` is
 * deliberately NOT httpTransport's `rejected`: that member carries a `reason`
 * built for a bug report, and reusing the name is how the field comes back.
 */
export type CreateSellerOutcome =
  /** 2xx, and the body really was a seller. Carries the server's own code. */
  | { kind: "created"; seller: CreatedSeller }
  /**
   * 409 on a code the CALLER supplied. The instruction is "that code is taken,
   * pick another" and it is addressed to the person who typed it.
   */
  | { kind: "duplicate_code" }
  /**
   * 409 with NO code supplied: the server tried and could not mint one. The
   * instruction is the opposite of the member above — "type a code yourself" —
   * and telling this caller their code was taken would name a value they never
   * sent.
   */
  | { kind: "code_assignment_failed" }
  /**
   * 401, or no token at all. THIS IS ABOUT THE CALLER, NOT THE SELLER: a screen
   * routes it to a sign-in and must not render it as a problem with what was
   * typed (lessons/401-is-about-the-caller-not-the-bill).
   *
   * A NULL TOKEN LANDS HERE TOO, and that differs from httpTransport, which
   * reports a null token as `unavailable, reachable: false`. The difference is
   * the queue: a bill with no token is owed work that a later sign-in drains by
   * itself, so "wait" is true of it. Creating a seller is an interactive act
   * with somebody standing at the scale and nothing behind it to retry — "wait
   * and it will finish" would be a promise about a future that cannot arrive,
   * which is the defect the R2b amendment of
   * correct-classification-can-still-render-as-an-error.md is about. The exit
   * is a sign-in in both cases, so the outcome names it.
   */
  | { kind: "session_expired" }
  /**
   * 403. The caller is authenticated and is not permitted, and only a human
   * elsewhere changes that. `code` is the server's machine-readable reason —
   * the ONLY value this module ever takes out of a refusal body — and a screen
   * derives its own sentence from it. NOT reachable on today's server, where
   * POST /sellers is behind get_principal; kept because the gate is one line
   * and this union is what phase 3 exhausts.
   */
  | { kind: "forbidden"; code: string }
  /**
   * 400/422: the payload can never be valid as sent. Carries NOTHING — see the
   * header. A screen says so in its own words.
   */
  | { kind: "invalid" }
  /** No answer, or an answer nobody can use: transport failure, timeout, 5xx. */
  | { kind: "unavailable" }
  /**
   * A 2xx WHOSE BODY COULD NOT BE READ AS A SELLER.
   *
   * NOT a success and NOT a failure. THE SERVER MAY HAVE CREATED THE SELLER —
   * the status line said so — and there is no idempotency_key on this route to
   * recover with: `sellers` has no such column. So this cannot be retried
   * safely and it cannot be reported as done. Its meaning is exactly "refresh
   * the list and look".
   *
   * This project has shipped the defect this member exists to prevent. On the
   * void path a 201 whose body lost its doc_no fell through to success,
   * markSynced wrote the null permanently, and a bill the owner later cancelled
   * stayed live on the server for ever (adapters/httpTransport.ts, the guard
   * above the 201 branch). Falling through to `created` with an empty code
   * would be the same shape: a seller row on the phone that no slip can name.
   */
  | { kind: "ambiguous" };

export interface CreateSellerConfig {
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

/** `string | null` where the KEY MUST BE PRESENT — absent is not null. */
function nullable(body: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in body)) return undefined;
  const value = body[key];
  if (value === null) return null;
  return typeof value === "string" ? value : undefined;
}

/**
 * The 2xx body as a seller, or null meaning AMBIGUOUS.
 *
 * Strict on purpose. A cast would turn an absent field into `undefined` typed
 * as `string` and let a seller with no code onto a screen —
 * lessons/a-defaulted-getattr-is-a-silent-dead-branch.md is that shape, and
 * app/api.ts's own header records the login route shipping it. Extra keys are
 * ignored; only a KNOWN key that is missing or of the wrong type is a refusal.
 */
function readSeller(body: unknown): CreatedSeller | null {
  if (typeof body !== "object" || body === null) return null;
  const raw = body as Record<string, unknown>;

  const id = str(raw["id"]);
  const code = str(raw["code"]);
  const name = str(raw["name"]);
  if (id === null || code === null || name === null) return null;
  if (typeof raw["is_active"] !== "boolean") return null;

  const phone = nullable(raw, "phone");
  const grade = nullable(raw, "grade");
  const idNumber = nullable(raw, "id_number");
  const address = nullable(raw, "address");
  const vehicleNo = nullable(raw, "vehicle_no");
  if (
    phone === undefined ||
    grade === undefined ||
    idNumber === undefined ||
    address === undefined ||
    vehicleNo === undefined
  ) {
    return null;
  }

  return {
    id,
    code,
    name,
    phone,
    grade,
    id_number: idNumber,
    address,
    vehicle_no: vehicleNo,
    is_active: raw["is_active"],
  };
}

/**
 * The server's `code` out of a 403 body, or a safe stand-in.
 *
 * THE ONLY VALUE THIS MODULE TAKES OUT OF ANY REFUSAL. Same contract and same
 * hazard as httpTransport's refusalCode: a machine-readable reason the UI turns
 * into its own sentence, and nothing may fall through to the server's prose or
 * to the body itself. A body that will not parse yields the fallback, so the
 * classification never depends on the body — only the status does.
 */
function forbiddenCode(body: unknown): string {
  if (typeof body !== "object" || body === null) return "forbidden";
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail !== "object" || detail === null) return "forbidden";
  return str((detail as { code?: unknown }).code) ?? "forbidden";
}

/** The request body: every undefined field omitted, so the wire is minimal. */
function requestBody(draft: SellerDraft): Record<string, string> {
  const out: Record<string, string> = { name: draft.name };
  if (draft.code !== undefined) out["code"] = draft.code;
  if (draft.phone !== undefined) out["phone"] = draft.phone;
  if (draft.grade !== undefined) out["grade"] = draft.grade;
  if (draft.id_number !== undefined) out["id_number"] = draft.id_number;
  if (draft.address !== undefined) out["address"] = draft.address;
  if (draft.vehicle_no !== undefined) out["vehicle_no"] = draft.vehicle_no;
  return out;
}

export class SellerApi {
  private readonly baseUrl: string;
  private readonly getToken: () => Promise<string | null>;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof globalThis.fetch;

  constructor(config: CreateSellerConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.getToken = config.getToken;
    this.timeoutMs = config.timeoutMs ?? 20_000;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  async createSeller(draft: SellerDraft): Promise<CreateSellerOutcome> {
    /*
     * A CODE WAS SUPPLIED — read once, HERE, from the draft rather than from
     * anything the server sends back. It is what separates the two 409s below,
     * and taking it from the request is what makes that separation impossible
     * to get wrong: no body has to parse for it to be right.
     */
    const suppliedCode = draft.code !== undefined;

    let token: string | null;
    try {
      token = await this.getToken();
    } catch {
      // A keystore that will not open is not a session. Same exit as a 401.
      return { kind: "session_expired" };
    }
    if (token === null) return { kind: "session_expired" };

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
        body: JSON.stringify(requestBody(draft)),
        signal: controller.signal,
      });
    } catch {
      // Timeout, DNS, no route, aeroplane mode: the server was never reached.
      // The error is NOT captured — nothing downstream may render it, so
      // nothing here may carry it.
      return { kind: "unavailable" };
    } finally {
      clearTimeout(timer);
    }

    const status = response.status;

    /*
     * THE 2xx PATH, AND THE ONLY PLACE A SUCCESS BODY IS READ. A body that
     * throws, a body that is not JSON, a body that is JSON but not a seller:
     * all three are the same fact — the server said it created something and
     * this client cannot say what. See the `ambiguous` member.
     */
    if (status >= 200 && status < 300) {
      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { kind: "ambiguous" };
      }
      const seller = readSeller(body);
      return seller === null ? { kind: "ambiguous" } : { kind: "created", seller };
    }

    /*
     * EVERY REFUSAL BELOW IS CLASSIFIED ON THE STATUS ALONE. The body is read
     * in exactly one branch, for exactly one string. Note there is no `detail`,
     * no `message` and no status number in anything returned from here.
     */
    if (status === 401) return { kind: "session_expired" };
    if (status === 403) {
      let body: unknown = null;
      try {
        body = await response.json();
      } catch {
        body = null;
      }
      return { kind: "forbidden", code: forbiddenCode(body) };
    }
    if (status === 409) {
      return suppliedCode ? { kind: "duplicate_code" } : { kind: "code_assignment_failed" };
    }
    if (status === 400 || status === 422) return { kind: "invalid" };

    /*
     * 404, 405, 5xx, anything unforeseen. The server answered and the answer is
     * unusable, which for an interactive create is the same instruction as no
     * answer at all: try again.
     *
     * A NOTE ON ONE 422 THIS COLLAPSES, stated rather than hidden.
     * `code_assignment_overflow` is a server-named 422 whose real instruction
     * is "supply a code yourself", and it lands in `invalid` above. Telling the
     * two apart needs the body, and the body of a 422 on this route is the one
     * that can echo an id_number. It is reachable only if a shop has typed an
     * S-code longer than 64 characters by hand — the server's own comment says
     * so — and a wrong-but-generic sentence in that case is the price of a
     * union that cannot leak.
     */
    return { kind: "unavailable" };
  }
}
