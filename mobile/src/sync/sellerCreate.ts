/**
 * THE `seller_create` KIND'S OWN OUTCOME UNION, ITS TRANSPORT, AND ITS
 * CLASSIFICATION.
 *
 * PURE TypeScript — no React Native, no Expo, no node builtins — so `classify`
 * is drivable headlessly over every member with no server, which is what the
 * `OutboxHandler` contract requires of it.
 *
 * ===========================================================================
 * WHY THIS UNION IS THE KIND'S OWN
 * ===========================================================================
 * A `POST /sellers` from this kind always SPENDS A RESERVATION — a code the
 * server minted for this device, sent with its token — so its outcome union is
 * shaped for exactly that. A generic seller-create union, built for a screen
 * where a person types a code, would carry members this path can never reach:
 *
 *   "the server could not mint a code" REQUIRES THAT NO CODE WAS SUPPLIED, and
 *   this kind always supplies one, so that member would be unreachable here — a
 *   `switch` arm nothing can ever test.
 *
 *   "that code is taken, pick another" CHANGES MEANING. For a person who typed a
 *   code it is a retryable typo; here the code came from a reservation this
 *   device holds, and the server's two guards make a collision on it an
 *   INVARIANT VIOLATION rather than a re-pick.
 *
 * A KIND'S OUTCOME UNION IS THE KIND'S OWN. That is what keeps a 409 from
 * meaning one thing across two kinds.
 *
 * ===========================================================================
 * NOTHING HERE CARRIES A BODY, A `detail`, OR A STATUS NUMBER
 * ===========================================================================
 * A RULE THAT IS URGENT ON THIS ROUTE:
 * a 4xx body on `POST /sellers` can contain an ID CARD NUMBER, because that is
 * a field of the request. `reason` is a short diagnostic for a log and the row's
 * `last_error`; the transport below is what must not put a refused payload into
 * it. If the field does not exist, no screen can print it.
 *
 * AND THE RESERVATION TOKEN IS NEVER IN AN OUTCOME. It is a bearer secret for
 * one reservation. It goes ONTO the wire and never comes back off it into
 * anything a log or a crash report could hold.
 */

import type { LocalSeller } from "./localSeller.js";
import type { OutboxDisposition } from "./outbox.js";

/**
 * WHAT ONE ATTEMPT AT `POST /sellers` CAME BACK AS.
 *
 * Eight members, each a fact about what the SERVER did — never an instruction,
 * which is `classify`'s job one layer up.
 */
export type SellerCreateOutcome =
  /**
   * 201. The server created the row and this request is what created it.
   * Carries the SERVER's seller id, which is the whole point of the exchange.
   */
  | { kind: "created"; server_seller_id: string }
  /**
   * 200. THE REPLAY. The first attempt committed and its response was lost;
   * the server recognised the reservation token, created nothing, and handed
   * back the row the first attempt produced.
   *
   * THIS IS SUCCESS, exactly as `duplicate` is on the bill path — the server is
   * in the state the device asked for, which is the entire question. It is a
   * SEPARATE member from `created` rather than folded into it because the two
   * are different facts about the world, and a device that cannot tell them
   * apart cannot report how often responses are being lost.
   */
  | { kind: "already_created"; server_seller_id: string }
  /**
   * 400/422. The payload can never be valid as sent — a name the edge refuses,
   * a token this shop does not hold, a code that disagrees with the token.
   * PERMANENT: nothing anyone does makes THIS payload valid.
   */
  | { kind: "invalid"; reason: string }
  /**
   * 409. THE CODE IS IN `sellers` AND THIS RESERVATION DID NOT PUT IT THERE.
   *
   * The server's two guards — a supplied reserved code is refused, and a minted
   * one is derived above the whole reservation relation — make this
   * UNREACHABLE. So reaching it is an invariant violation, and the one thing
   * that must never happen to it is a settle: binding this device's local
   * seller to a row it did not create is the wrong-seller-on-a-cash-purchase
   * this entire step exists to prevent.
   */
  | { kind: "conflict"; code: string; reason: string }
  /** 401. About the CALLER, not the seller. One sign-in fixes it. */
  | { kind: "session_expired"; reason: string }
  /**
   * 403. The caller is authenticated and may not do this. It refuses every
   * seller equally, so retrying any of them re-asks a settled question — which
   * is what `halt_kind` is for.
   */
  | { kind: "forbidden"; code: string; reason: string }
  /**
   * 426. THIS BUILD is too old for the server. Refuses every seller equally and
   * is cleared only by an app update, so the kind halts, exactly as
   * SendOutcome/VoidOutcome.client_outdated. The row stays owed with its token,
   * so the create resends after the update.
   */
  | { kind: "client_outdated"; reason: string }
  /** No answer, or an answer nobody can use: transport failure, timeout, 5xx. */
  | { kind: "unavailable"; reason: string }
  /**
   * A 2xx WHOSE BODY COULD NOT BE READ AS A SELLER.
   *
   * ON A PATH WITH NO IDEMPOTENCY KEY THIS WOULD BE THE WORST CASE THERE IS:
   * `sellers` has no such column, so a lost 2xx could neither be retried nor
   * reported as done.
   *
   * HERE IT IS MERELY A RETRY, and the reason is the single most load-bearing
   * consequence of the reservation design: THIS REQUEST CARRIED A TOKEN. The
   * server recognises the repeat as the same create and answers 200 with the
   * row the first attempt produced. So the unreadable body costs one more
   * request and nothing else.
   *
   * IT KEEPS ITS OWN MEMBER RATHER THAN FOLDING INTO `unavailable` because the
   * two are different facts — one is "the server never answered", the other is
   * "the server answered and we could not read it" — and the day the token is
   * ever absent from this request, they stop having the same disposition.
   */
  | { kind: "ambiguous"; reason: string };

/**
 * What the kind needs of the network. ONE METHOD: the refill is deliberately
 * NOT here, because a refill is not outbox work — the outbox carries what the
 * device OWES the server, and a refill is what it WANTS from it. It lives in
 * ./sellerRefill.ts and has its own client.
 */
export interface SellerCreateTransport {
  /**
   * May reject (throw). A throw carries NO information about whether the
   * server committed, so the handler converts it to `unavailable` and never to
   * a refusal.
   */
  createSeller(row: LocalSeller): Promise<SellerCreateOutcome>;
}

/**
 * PURE. Drivable over every member with no store, no transport and no pass.
 *
 * THE ONE ARM THAT MATTERS MOST IS `conflict`, AND IT IS `needs_review`.
 * `NO-ARM-OF-THIS-KIND-SETTLES-A-409` is the criterion, and the trap it names
 * is not `settled` — that one is obvious. It is `terminal`, which is the
 * CHEAPEST way to satisfy any assertion phrased as "the row was not settled":
 * terminal also takes the row out of the queue, it also clears nothing, and
 * from outside it looks exactly like a correct refusal to settle. What
 * separates them is that `needs_review` leaves the row OWED, so the device does
 * not quietly stop owing a seller the yard has already handed cash to.
 *
 * `needs_review` was already in `OutboxDisposition` before this kind existed,
 * added for a neighbouring reason on this very route: a create with no
 * idempotency key whose response was lost. This kind is its first user.
 */
export function classifySellerCreate(o: SellerCreateOutcome): OutboxDisposition {
  switch (o.kind) {
    case "created":
    case "already_created":
      // "Already created" is success: the server holds the row this device
      // asked for. That is hard rule 4's shape, extended to this route by
      // decision and paid for by the reservation token.
      return { next: "settled" };
    case "invalid":
      // PERMANENT on the payload's own merits. The store's own writer returns
      // the reserved code to the spendable holding when it records this — the
      // reservation was never spent, because the server moves one to `spent`
      // only inside the seller INSERT.
      return { next: "terminal", reason: o.reason, code: "invalid" };
    case "conflict":
      // NEVER `settled`, and never `terminal` either. See the paragraph above.
      return { next: "needs_review", reason: o.reason, code: o.code };
    case "session_expired":
      return { next: "retry", reason: o.reason };
    case "forbidden":
      // A 403 refuses every seller equally: the KIND stops, durably, until a
      // sign-in or a sign-out retracts it.
      return { next: "halt_kind", reason: o.reason, code: o.code };
    case "client_outdated":
      // A 426 refuses every seller equally too, and no sign-in helps: the KIND
      // stops until the app is updated (a new process). Same disposition as 403;
      // the code is a fixed marker, since a 426 carries no server code.
      return { next: "halt_kind", reason: o.reason, code: "client_outdated" };
    case "unavailable":
    case "ambiguous":
      // BOTH RETRY, and only because the request carried the token. Without it
      // `ambiguous` would have to be `needs_review` — the server may have
      // committed and a repeat would not be safe.
      return { next: "retry", reason: o.reason };
  }
}
