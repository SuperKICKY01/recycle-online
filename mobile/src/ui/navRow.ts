/**
 * THE HEADER'S NAVIGATION DESTINATIONS, AS DATA (P1.23 item 3 phase C).
 *
 * Before phase C the header crammed a title and up to five chips into one
 * non-wrapping row, so the title was overlapped and the last chip clipped at the
 * frame. Phase C moves the destinations into a horizontal SCROLL row below a fixed
 * top bar. This is the model that row is built from — so a destination cannot be
 * silently lost to the layout change (the owner's condition, and the same class of
 * defect as a notice dropped from the stack).
 *
 * ORDER IS DELIBERATE: `dashboard` (ยอดวันนี้) is FIRST because it is the day's-takings
 * glance, the most-frequent destination at the yard, and the scroll row shows its first
 * item at rest — so the most-used destination is always visible without scrolling.
 *
 * `ออกจากระบบ` (sign out) is NOT here: it is a destructive action and sits alone in the
 * top bar's trailing zone, spatially separated from ordinary navigation.
 *
 * COMPLETENESS IS CHECKED: `NAV_DESTS` is written SEPARATELY from `NAV_ITEMS`, so a proof
 * that compares them catches a drop in either — the header must offer exactly these.
 */
import { type SheetTransition } from "./sheetStack.js";

/** The four navigation destinations the header offers. */
export type NavDest = "dashboard" | "prices" | "settings" | "account";

/**
 * Which condition must hold for a destination to be drawn. A key, not a predicate, so
 * this module stays pure — App.tsx maps each key to the real gate (role/token).
 */
export type NavGate = "dashboard_entry" | "edit_prices" | "signed_in";

export interface NavItem {
  readonly dest: NavDest;
  /** The chip's Thai label, moved verbatim from the old header chip. */
  readonly label: string;
  /** The sheet transition App.tsx dispatches when the chip is pressed. */
  readonly transition: SheetTransition;
  readonly gate: NavGate;
}

/** The destinations, in scroll-row order (most-used first). */
export const NAV_ITEMS: readonly NavItem[] = [
  { dest: "dashboard", label: "ยอดวันนี้ ›", transition: "open_dashboard", gate: "dashboard_entry" },
  { dest: "prices", label: "ราคารับซื้อ ›", transition: "open_prices", gate: "edit_prices" },
  { dest: "settings", label: "ตั้งค่าร้าน ›", transition: "open_settings", gate: "signed_in" },
  { dest: "account", label: "บัญชีของฉัน ›", transition: "open_account", gate: "signed_in" },
];

/** The complete destination set, written by hand so a proof can catch a drop in
 *  either this or NAV_ITEMS — none may be lost to the new layout. */
export const NAV_DESTS: readonly NavDest[] = ["dashboard", "prices", "settings", "account"] as const;
