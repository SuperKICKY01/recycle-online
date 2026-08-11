/**
 * A proof device that somebody has signed in on.
 *
 * The send queue filters by owner, so a store whose database holds no identity
 * selects nothing at all. That is correct behaviour — it is what an upgraded
 * handset with a dead token and no recorded login must do — but it is not the
 * state any proof about sending, backoff, voids, clocks or cold starts means to
 * be in. Those cases are about a working device with a person signed in on it,
 * and without this they would all go green-to-red at once for a reason that has
 * nothing to do with what they test.
 *
 * WHY A HELPER RATHER THAN LETTING SqliteLocalStore.open SEED ITSELF. Seeding
 * inside open() would put test setup in production code, and worse, it would
 * make the "no identity stored" state unreachable — the exact state the filter
 * exists to handle, and the one proveOwner has to be able to produce.
 *
 * `PROOF_OWNER` is the same pair the in-memory harness uses, so a case running
 * on both stores is the same device on both.
 */
import type { SqlDriver } from "../adapters/sqlite/driver.js";
import { SqliteIdentityStore } from "../adapters/sqlite/SqliteIdentityStore.js";
import { PROOF_OWNER } from "./fakes.js";

/**
 * Record the standard proof identity on this driver's database.
 *
 * Idempotent: the identity row has a fixed single-row key, so calling this
 * after a reopen is not merely harmless but required — a reopened file is a
 * reopened device, and it is still signed in.
 */
export async function signInProofDevice(driver: SqlDriver): Promise<void> {
  await new SqliteIdentityStore(driver).save(PROOF_OWNER);
}
