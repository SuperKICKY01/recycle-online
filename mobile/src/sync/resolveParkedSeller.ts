/**
 * THE ONE RESOLVER, REACHED FROM TWO ENTRY POINTS.
 *
 * PURE apart from the two store interfaces it is handed, so the headless proof
 * drives exactly what the phone runs.
 *
 * ---------------------------------------------------------------------------
 * THE TWO WINDOWS IT CLOSES, AND WHY IT IS ONE FUNCTION
 * ---------------------------------------------------------------------------
 * A bill weighed against a local seller parks (`createBill.ts`) and is released
 * when that seller settles — the seller kind's `record` calls
 * `releaseBillsParkedOnLocalSeller`, ONCE, on the settle. Two bills escape that
 * single event:
 *
 *   - FINDING 1, the settle-to-refresh window: a bill weighed AFTER the seller
 *     has settled but before a refresh has carried the server row down. Its
 *     seller is already `synced`, so the settle has already happened and there
 *     is no second event to release it. Parked for ever, otherwise, carrying an
 *     id `POST /bills` answers 422 — the exact defect the park exists to prevent.
 *   - FINDING 2, the crash window: the settle writes the server id onto the
 *     local seller and releases its bills in two statements to two tables; a
 *     kill between them leaves a `synced` seller with its bills still parked and
 *     nothing to release them, because a seller settles once.
 *
 * The owner's repair (B1) is to RESOLVE THE ID AT SEND TIME. This function is
 * that resolver, and it is ONE function so the two windows cannot be closed by
 * two mechanisms free to drift:
 *
 *   - `bill_send`'s `owed()` calls it on every drain — the per-pass evaluation
 *     point the runner already has (`outboxRunner.ts`, `h.owed(this.batchLimit)`),
 *     so it adds no new loop. By the time it runs, `seller_create` has drained
 *     first in the same pass (registry order — `outboxRunner.ts`,
 *     "`seller_create` therefore settles before `bill_send` reads its owed
 *     rows"), so a seller settled this pass is already `synced` here.
 *   - `bill_send`'s `recover()` calls it at boot — finding 2's authorised
 *     startup sweep, reached through `recoverAll`'s `bill_send` arm.
 *
 * It touches ONLY bills whose local seller has SETTLED: a bill behind an
 * unsettled seller stays parked, waiting for the settle exactly as before, so
 * the existing park and its settle-time release are unchanged. The server id it
 * writes is a `ResolvedSellerId` — the branded value the write demands, minted
 * only here, from the settled seller — so a local id can never be un-parked onto
 * the wire (`resolvedSellerId.ts`).
 */
import type { LocalStore } from "./types.js";
import type { LocalSellerStore } from "./localSeller.js";
import { ResolvedSellerId } from "./resolvedSellerId.js";

/**
 * Un-park every bill whose local seller has settled, giving each the server's
 * id, and return the ids it resolved. Idempotent: a second call finds the bills
 * it already un-parked no longer parked and does nothing — which is why calling
 * it on every `owed()` (`rereadAfterEach` re-reads included) is correct and not
 * a cost that compounds.
 */
export async function resolveParkedBehindSettled(
  store: LocalStore,
  sellerStore: LocalSellerStore,
  now: Date,
): Promise<string[]> {
  const parked = await store.listBillsParkedOnLocalSeller();
  const resolved: string[] = [];
  for (const bill of parked) {
    const seller = await sellerStore.getLocalSeller(bill.local_seller_id);
    if (seller === null) continue;
    const id = ResolvedSellerId.fromSettledSeller(seller);
    if (id === null) continue; // not settled yet — leave it parked
    await store.applyResolvedSellerId(bill.id, id, now);
    resolved.push(bill.id);
  }
  return resolved;
}
