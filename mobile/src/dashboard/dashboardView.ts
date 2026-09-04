/**
 * THE DASHBOARD SHELL — who may see it, whose money it names, and which views it
 * offers. The gating (E1, E2) and the composition, as pure functions.
 *
 * No React Native, no Expo, no node, no fetch. `app/DashboardScreen.tsx` renders
 * what this returns and decides nothing itself. The summary rows and bars live in
 * `summaryView.ts`, the period in `period.ts`, the unsent line in `unsentLine.ts`;
 * this file is the frame around them and the permission gate on the whole thing.
 *
 * ---------------------------------------------------------------------------
 * THE TWO GATES, AND WHERE EACH IS ENFORCED
 * ---------------------------------------------------------------------------
 * E1 — WHOSE MONEY. A session holding `money.view_shop` sees the shop's figures;
 * one holding only `money.view_own` sees ONLY their own, and the SERVER enforces
 * it (`created_by = self`, reports.py). The client's job is to NAME whose money it
 * is so the number is not misread: the title is "ยอดร้าน" for shop money and
 * "ยอดของฉัน" for own money.
 *
 * E2 — WHETHER THE ENTRY IS DRAWN. A control a session would only be refused is
 * never drawn (P1.9's rule, the same one every `may()` call site follows).
 * `mayShowDashboardEntry` draws the header entry when the set holds EITHER money
 * permission. It FAILS OPEN on an ABSENT set, exactly like every other gate
 * (src/session/deviceRole.ts): the server re-reads the grants every request and a
 * wrongly-offered entry gets a calm 403 (`permission_required`), so failing closed
 * would only lock a real owner out of their own takings over a set this build
 * merely failed to read. A set that WAS read and holds neither hides the entry.
 *
 * UNTIL SERVER MIGRATION 0019 this gate read the shop's `staff_money_visible`
 * toggle off GET /shop. That column is gone, folded into the staff role's grants
 * as `money.view_own`; the phone now gates on its own permission set (the token
 * claim, /whoami, and the cached_permissions table), and `readMoneyVisible` went
 * with the column.
 *
 * ---------------------------------------------------------------------------
 * THE BILL LIST IS THE TODAY VIEW'S, AND OWN-MONEY SESSIONS DO NOT GET IT (yet)
 * ---------------------------------------------------------------------------
 * The per-bill list is `GET /reports/daily`, which returns the whole shop's day and
 * has NO own-bills variant. So it can be shown to a shop-money session, on the
 * today view only; for an own-money session it would leak other people's bills,
 * so it is replaced by one sentence. The gap (`/reports/daily` has no
 * `created_by=self` mode) is recorded in OPEN_ITEMS for the owner to decide —
 * nothing is built for it here.
 */
import { may } from "../session/deviceRole.js";
import type { Grants } from "../session/deviceRole.js";
import type { PeriodSelection, PresetKind } from "./period.js";
import { PRESET_CHIPS } from "./period.js";
import type { SummaryMessage, SummaryReport, SummaryScreen } from "./summaryView.js";
import type { UnsentLine } from "./unsentLine.js";

const STAFF_NO_BILL_LIST =
  "รายการบิลรายใบยังไม่รองรับสำหรับบัญชีพนักงานในเวอร์ชันนี้ — แสดงเฉพาะยอดรวมของคุณ";

/** The header entry gate (E2). True to DRAW the ยอดวันนี้/dashboard entry. */
export function mayShowDashboardEntry(grants: Grants): boolean {
  // Either money permission draws it; an absent set draws it (fail open, as every
  // other gate on this client); a set holding neither hides it.
  return may(grants, "money.view_shop") || may(grants, "money.view_own");
}

/** Whether this session sees the SHOP's money (true) or only its OWN (false). */
export function seesShopMoney(grants: Grants): boolean {
  return may(grants, "money.view_shop");
}

/** Where the today view's per-bill list stands for this session. */
export type BillListSlot =
  /** Not the today view (week/month/custom): no per-bill list at all. */
  | { kind: "hidden" }
  /** Own-money only: the daily route has no own-bills variant, so one sentence instead. */
  | { kind: "staff_unavailable"; note: string }
  /** Shop money (or unknown) on the today view: draw the daily bills (from the `daily` prop). */
  | { kind: "show" };

export interface DashboardPresetChip {
  preset: PresetKind;
  label: string;
  note: string | null;
  selected: boolean;
}

export interface DashboardReport {
  kind: "dashboard";
  /** "ยอดร้าน" (shop money) or "ยอดของฉัน" (own money) — the title NAMES whose money it is. */
  title: string;
  whoseMoney: "shop" | "own";
  /** พ.ศ. label of the selected range, derived after the timezone conversion. */
  periodLabel: string;
  presetChips: readonly DashboardPresetChip[];
  /** The summary section proper — always a report here (the message case is above). */
  report: SummaryReport;
  unsent: UnsentLine | null;
  billList: BillListSlot;
}

/** The whole dashboard, or the one calm message when the summary could not load. */
export type DashboardScreenModel = DashboardReport | SummaryMessage;

export interface DashboardInput {
  grants: Grants;
  selection: PeriodSelection;
  summary: SummaryScreen;
  unsent: UnsentLine | null;
}

function billListSlot(grants: Grants, selection: PeriodSelection): BillListSlot {
  if (!selection.isToday) return { kind: "hidden" };
  if (!seesShopMoney(grants)) return { kind: "staff_unavailable", note: STAFF_NO_BILL_LIST };
  return { kind: "show" };
}

function presetChips(selected: PresetKind): readonly DashboardPresetChip[] {
  return PRESET_CHIPS.map((c) => ({ ...c, selected: c.preset === selected }));
}

/**
 * THE DASHBOARD MODEL, from the permission set, the period, the summary and the
 * unsent line. THE only entry point the screen uses for the body.
 *
 * When the summary is a MESSAGE (offline, refused, session), the whole screen is
 * that message — no chips, no chart, no fields, no unsent line — the settings-screen
 * pattern: a surface that cannot reach the server shows one calm sentence and
 * nothing that looks like data.
 */
export function dashboardScreen(input: DashboardInput): DashboardScreenModel {
  if (input.summary.kind === "message") return input.summary;

  const shop = seesShopMoney(input.grants);
  return {
    kind: "dashboard",
    title: shop ? "ยอดร้าน" : "ยอดของฉัน",
    whoseMoney: shop ? "shop" : "own",
    periodLabel: input.selection.label,
    presetChips: presetChips(input.selection.preset),
    report: input.summary,
    unsent: input.unsent,
    billList: billListSlot(input.grants, input.selection),
  };
}
