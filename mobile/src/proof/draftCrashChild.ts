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

  const store = await SqliteDraftStore.open(NodeSqliteDriver.open(dbFile));

  const now = "2026-07-26T09:00:00.000Z";
  let draft = setVehicleNo(newDraft(draftId, sellerId, now), vehicleNo, now);
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

  await store.save(draft);
  console.log(`CHILD: draft saved (seller=${sellerId} vehicle=${vehicleNo}); killing now`);
  die();
}

main().catch((err: unknown) => {
  console.error("CHILD ERROR:", err);
  process.exitCode = 98;
});
