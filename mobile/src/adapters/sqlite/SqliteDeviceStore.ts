/**
 * THE DEVICE'S OWN ID, kept in the local database.
 *
 * The WHY — why a device rather than a user, why SQLite rather than the
 * keystore, and why a second value would be a second HOLDER rather than a
 * duplicate — is at `src/session/deviceIdentity.ts` and at `local_device` in
 * `schema.ts`. It is not repeated here: two copies drift, and a reader who
 * meets this file first is one import away from the argument.
 *
 * WHAT IS HERE is the one thing that is a property of the STATEMENTS: the mint
 * is `INSERT ... ON CONFLICT(only_row) DO NOTHING` followed by a read, and the
 * read is what the caller gets. Never `DO UPDATE`, never a read-then-write, and
 * never a value returned from the INSERT's own RETURNING clause.
 *
 * WHY NOT RETURNING. `INSERT ... ON CONFLICT DO NOTHING RETURNING device_id`
 * returns NO ROW when the conflict fires, so a caller reading it would get
 * undefined on every boot after the first — the one branch that is taken almost
 * always. It reads like the tidier statement and it is the one that fails on
 * the common path.
 *
 * WHY NOT READ-THEN-WRITE. A `load()` that returns null followed by an INSERT
 * is two statements with a window between them, and two boots (or a boot and a
 * refill) racing through it both mint. The conflict clause closes the window in
 * the engine rather than in a rule this class has to keep.
 *
 * THE ID SOURCE IS INJECTED, for `IdSource`'s own stated reason: which UUID API
 * exists under Hermes is unverified, and the app supplies `app/ids.ts`
 * (expo-crypto, RFC4122 v4) while a proof supplies its own. The SERVER refuses
 * anything that is not a UUID — `ReservationTopUp.device_id` is typed
 * `uuid.UUID` — so a source that returns some other shape produces a device
 * that can never obtain a code. That is a wire contract; it is stated here
 * because this is where the value is chosen.
 */
import type { DeviceId, DeviceIdentityStore } from "../../session/deviceIdentity.js";
import type { IdSource } from "../../sync/types.js";
import type { SqlDriver } from "./driver.js";

interface DeviceRow {
  device_id: string;
}

export class SqliteDeviceStore implements DeviceIdentityStore {
  constructor(
    private readonly db: SqlDriver,
    private readonly ids: IdSource,
  ) {}

  /**
   * The stored id, or null when this device has never minted one.
   *
   * MUST NOT THROW on absence and MUST NOT MINT, which is the difference from
   * `ensure` and the reason both exist. Null is a first-class answer: it is the
   * state of every device before its first boot completes, and a caller that
   * merely wants to know whether an identity exists must not create one by
   * asking.
   */
  async load(): Promise<DeviceId | null> {
    const rows = await this.db.all<DeviceRow>(
      "SELECT device_id FROM local_device WHERE only_row = 1",
    );
    return rows[0]?.device_id ?? null;
  }

  /**
   * The device's id, minted on the first call and identical for ever after.
   *
   * The INSERT proposes; the row that is already there wins. So the value a
   * caller receives is always the value on disk, whether this call wrote it or
   * found it — which is what makes two concurrent boots produce one identity
   * instead of two.
   *
   * The read afterwards is not defensive tidying: it is the ONLY thing that
   * reports the winner. See the header on why RETURNING cannot do this job.
   */
  async ensure(now: Date): Promise<DeviceId> {
    await this.db.run(
      `INSERT INTO local_device (only_row, device_id, minted_at)
       VALUES (1, ?, ?)
       ON CONFLICT(only_row) DO NOTHING`,
      [this.ids.newId(), now.toISOString()],
    );
    const id = await this.load();
    if (id === null) {
      // UNREACHABLE, and refused rather than papered over with a re-mint. The
      // INSERT either wrote the row or found one; a null here means the write
      // was silently lost, and minting again in that state is how a device ends
      // up with two identities and one holding it can no longer spend.
      throw new Error(
        "local_device: the identity is absent immediately after an insert that" +
          " reported no error. Refusing to mint a second one.",
      );
    }
    return id;
  }
}
