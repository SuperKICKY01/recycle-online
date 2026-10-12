/**
 * THE SELLER PICKER'S UNION: the cached server list, plus the local sellers this
 * device created that the server has not yet sent back.
 *
 * PURE TypeScript — no React Native, no Expo, no node — so the headless proof
 * exercises exactly what the device runs.
 *
 * ---------------------------------------------------------------------------
 * RESOLVED AT READ TIME, AND A LOCAL ROW LEAVES THE PICKER ONLY ONCE THE SERVER
 * ROW HAS ARRIVED
 * ---------------------------------------------------------------------------
 * The design keeps `saveSellers`'s unconditional `DELETE FROM cached_sellers`:
 * a cache is content that follows a rewrite wholesale, and an unsettled local
 * seller lives in a table of its own, never in the cache. So there is nothing
 * local IN the cache to mark, and the union is computed here, at read time.
 *
 * A local row stops being offered ONLY once it has SETTLED **and** the server's
 * row has actually arrived in a refresh — never at settle alone. Dropping at
 * settle makes the seller vanish from the picker in the window between its
 * settle and the next refresh, while a truck is on the weighbridge
 * (`THE-LOCAL-ROW-SURVIVES-A-REFRESH-THAT-DELETES`, cell 4). A local row is
 * offered under its LOCAL id, so a bill weighed against it carries the local id
 * and the send path resolves it (`sync/resolveParkedSeller.ts`).
 *
 * The origin marker rides ALONGSIDE the options rather than as a column on a
 * cached row: the cache's rows have no origin to carry, and putting one on
 * `cached_sellers` is the RED CASE the criterion names — delete-and-reinsert
 * would destroy it. `localIds` is a fact about THIS read, recomputed each time.
 */

/**
 * The shape the picker offers — structurally `app/api.ts`'s `Seller`, spelled
 * out here WITHOUT importing it so this file stays runnable under bare node
 * (`app/` pulls in expo-constants through config.ts). `options` is this type so
 * the app can hand it straight to the picker's `sellers` prop and a local row is
 * indistinguishable in shape from a server one — the origin travels in
 * `localIds`, not on the row.
 */
export interface PickerServerSeller {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  grade: string | null;
  /** The server's minimised ID (seller search C2); for a local row, derived at read time. */
  id_last4?: string | null;
  /** The truck the seller usually arrives in (seller search C3). */
  vehicle_no?: string | null;
}

/** A local seller, with the one extra field the union's drop rule reads. */
export interface LocalPickerSeller extends PickerServerSeller {
  /** The server's id once settled; null until then. Decides representation. */
  server_seller_id: string | null;
}

export interface PickerSellers {
  /** The list the picker searches — the cache, then unrepresented local rows. */
  readonly options: PickerServerSeller[];
  /** Which of `options` are local rows the server has not sent back yet. */
  readonly localIds: ReadonlySet<string>;
}

/**
 * Merge the cached server sellers with the device's local ones. A local row
 * whose settled `server_seller_id` is already present in the cache is dropped —
 * the refresh has carried it down, so the seller is offered once, under the id
 * the server knows. Every other local row (unsettled, or settled but not yet
 * arrived) is offered under its LOCAL id and flagged in `localIds`.
 */
export function mergeSellersForPicker(
  cached: readonly PickerServerSeller[],
  local: readonly LocalPickerSeller[],
): PickerSellers {
  const cachedIds = new Set(cached.map((s) => s.id));
  const options: PickerServerSeller[] = [...cached];
  const localIds = new Set<string>();
  for (const s of local) {
    if (s.server_seller_id !== null && cachedIds.has(s.server_seller_id)) continue;
    options.push({
      id: s.id, code: s.code, name: s.name, phone: s.phone, grade: s.grade,
      id_last4: s.id_last4 ?? null, vehicle_no: s.vehicle_no ?? null,
    });
    localIds.add(s.id);
  }
  return { options, localIds };
}
