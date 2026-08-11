/**
 * Force-quit injection for proveSeller S6. Run as a separate OS process and
 * killed with SIGKILL the instant save() returns, so the "force-quit" is a real
 * process death — no unwinding, no finally blocks, no chance for anything to
 * flush. What the parent finds afterwards is whatever SQLite actually put on
 * disk, not what a graceful close would have tidied up.
 *
 * argv: <dbFile> <draftId> <sellerId> <vehicleNo>
 *
 * The draft is written through the REAL SqliteDraftStore, not a copy of its
 * statements: a copy could drift from production and would then prove nothing
 * about it.
 */
import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteDraftStore } from "../adapters/sqlite/SqliteDraftStore.js";
import { addLine, buildLine, newDraft, setVehicleNo } from "../cart/cart.js";
import { PROOF_OWNER } from "./fakes.js";
import { signInProofDevice } from "./proofDevice.js";

/** Dies instantly and unconditionally. SIGKILL cannot be caught or deferred. */
function die(): never {
  process.kill(process.pid, "SIGKILL");
  throw new Error("SIGKILL did not terminate the process");
}

async function main(): Promise<void> {
  const [dbFile, draftId, sellerId, vehicleNo] = process.argv.slice(2);
  if (
    dbFile === undefined ||
    draftId === undefined ||
    sellerId === undefined ||
    vehicleNo === undefined
  ) {
    throw new Error("usage: draftCrashChild <dbFile> <draftId> <sellerId> <vehicleNo>");
  }

  const driver = NodeSqliteDriver.open(dbFile);
  const store = await SqliteDraftStore.open(driver);

  const now = "2026-07-26T09:00:00.000Z";
  // The master data this draft was priced against. Any fixed instant does;
  // what the case checks is that it SURVIVES the crash like every other field.
  const MASTER_AS_OF = "2026-07-26T08:00:00.000Z";
  let draft = setVehicleNo(newDraft(draftId, sellerId, now, MASTER_AS_OF), vehicleNo, now);
  const line = buildLine({
    id: "line-crash-1",
    product_id: "prod-FE",
    product_code: "FE-STEEL",
    product_name: "เหล็กรวม",
    uom_code: "KG",
    gross: "10.005",
    tare: "0.002",
    price: "15.00",
    list_price: "15.00",
  });
  if (!line.ok) throw new Error(`child: fixture line failed: ${line.field}/${line.error}`);
  draft = addLine(draft, line.line, now);

  /*
   * SIGNED IN, AND THE DRAFT IS OWNED. This child stands in for the app, and the
   * app cannot write a cart without somebody signed in — the identity is
   * recorded at login and read live at every save. Since P1.7 the loader hands
   * back only the draft the current person owns, so a null owner here would make
   * the PARENT's crash-survival case find nothing and read as a lost draft: a
   * tenancy result wearing a crash-safety label.
   *
   * The identity goes into the same FILE, so the parent reopening it is the same
   * device with the same person still signed in — which is what a force-quit
   * leaves behind.
   */
  await signInProofDevice(driver);
  await store.save(draft, PROOF_OWNER);
  console.log(`CHILD: draft saved (seller=${sellerId} vehicle=${vehicleNo}); killing now`);
  die();
}

main().catch((err: unknown) => {
  console.error("CHILD ERROR:", err);
  process.exitCode = 98;
});
