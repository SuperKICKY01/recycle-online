/**
 * PROVENANCE FOR THE SELLER ID THAT REACHES `POST /bills`, CARRIED IN A TYPE.
 *
 * PURE TypeScript — no React Native, no Expo, no node — so the headless proof
 * drives exactly what the phone runs.
 *
 * ---------------------------------------------------------------------------
 * WHY A TYPE AND NOT A CHECK ON THE VALUE
 * ---------------------------------------------------------------------------
 * A bill weighed against a seller this device created carries the LOCAL id (the
 * server has never seen it). The window between that seller SETTLING and the
 * refresh that carries its server row down is the one this class exists for: a
 * bill weighed there must have its `seller_id` swapped for the server's before
 * it is sent, or `POST /bills` answers 422 — PERMANENT, terminal, for cash
 * already paid.
 *
 * The correct SERVER id and a hardcoded one are the same bytes, and no
 * comparison of values can tell you the id TRAVELLED the resolution path rather
 * than being pasted in (`lessons/a-value-comparison-cannot-prove-a-path.md`).
 * So the id the send path is allowed to write is a `ResolvedSellerId`, and the
 * ONLY way to make one is from a seller that has SETTLED. A raw string cannot be
 * handed to the write, and a hardcode cannot be minted into this type: both are
 * compile errors, which is the route-proof this repository asks for. The limit
 * that lesson names travels with it — this catches the accidental and lazy break
 * a regression looks like, not an author who edits this file to forge one.
 */
import type { LocalSeller } from "./localSeller.js";

export class ResolvedSellerId {
  /**
   * PRIVATE — the class IS the brand. The only `ResolvedSellerId` anyone can
   * obtain is one this file minted, and it mints one ONLY from a settled seller
   * (below). `new ResolvedSellerId("…")` outside this file is a compile error,
   * and `"…" as ResolvedSellerId` is one too — a string is not an instance of a
   * class — so a hardcoded id cannot become one and cannot reach the write that
   * demands this type.
   */
  private constructor(readonly value: string) {}

  /**
   * THE ONE CONSTRUCTOR. A seller whose `server_seller_id` is null has NOT
   * settled, so it yields `null` and no bill behind it can be handed a resolved
   * id — which is exactly the guarantee that keeps a local id off the wire. The
   * settle-state, not the caller, decides whether an id exists to resolve to.
   */
  static fromSettledSeller(seller: LocalSeller): ResolvedSellerId | null {
    return seller.server_seller_id === null
      ? null
      : new ResolvedSellerId(seller.server_seller_id);
  }
}
