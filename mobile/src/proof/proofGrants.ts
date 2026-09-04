/**
 * PERMISSION SETS FOR THE PROOFS — the three system roles as the server mints them
 * (server/app/permissions.py SYSTEM_ROLE_GRANTS, migration 0019), restated here BY
 * HAND rather than imported from anything the phone ships, so a proof's fixture
 * cannot agree with the code by construction
 * (lessons/a-checker-must-not-share-the-code-it-checks.md).
 *
 * Until 0019 every proof handed the screen builders a role literal ("admin",
 * "staff", null). The builders now take a permission SET, so the fixtures moved
 * here and the cells' ASSERTIONS did not: an ADMIN fixture still expects the
 * control, a STAFF fixture still expects its absence, and UNKNOWN (null, an
 * absent set) still fails open.
 */
import type { Grants } from "../session/deviceRole.js";

const ALL: readonly string[] = [
  "bills.create",
  "bills.read",
  "bills.void",
  "money.view_own",
  "money.view_shop",
  "master.write",
  "prices.write",
  "sellers.create",
  "sellers.write",
  "tiers.manage",
  "users.manage",
  "shop.settings.write",
  "roles.manage",
];

/** The owner: every permission. */
export const OWNER_GRANTS: ReadonlySet<string> = new Set(ALL);
/** The admin: everything but roles.manage. */
export const ADMIN_GRANTS: ReadonlySet<string> = new Set(ALL.filter((p) => p !== "roles.manage"));
/** The staff role at birth: weigh, read bills, create a seller. No money, no void. */
export const STAFF_GRANTS: ReadonlySet<string> = new Set(["bills.create", "bills.read", "sellers.create"]);
/** Staff plus the folded toggle: money on their own bills (the former staff_money_visible = true). */
export const STAFF_MONEY_GRANTS: ReadonlySet<string> = new Set([...STAFF_GRANTS, "money.view_own"]);
/** An ABSENT set: a token this build cannot read, no cache. Fails OPEN. */
export const UNKNOWN_GRANTS: Grants = null;
/** A set that was READ and holds NOTHING: fails closed everywhere. */
export const EMPTY_GRANTS: ReadonlySet<string> = new Set();

/**
 * The set a proof's ROLE LABEL stands for. The proofs' cells were written over
 * the three role labels ("admin", "staff", null); their fixtures now hand the
 * builders the corresponding born-with set, and the labels stay in the cell
 * text so every assertion reads exactly as it did.
 */
export function grantsOf(role: "owner" | "admin" | "staff" | null): Grants {
  if (role === "owner") return OWNER_GRANTS;
  if (role === "admin") return ADMIN_GRANTS;
  if (role === "staff") return STAFF_GRANTS;
  return UNKNOWN_GRANTS;
}
