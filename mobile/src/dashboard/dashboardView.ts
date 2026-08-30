/**
 * THE DASHBOARD SHELL — who may see it, whose money it names, and which views it
 * offers. The gating (E1, E2) and the composition, as pure functions.
 *
 * No React Native, no Expo, no node, no fetch. `app/DashboardScreen.tsx` renders
 * what this returns and decides nothing itself. The summary rows and bars live in
 * `summaryView.ts`, the period in `period.ts`, the unsent line in `unsentLine.ts`;
 * this file is the frame around them and the role gate on the whole thing.
 *
 * ---------------------------------------------------------------------------
 * THE TWO GATES, AND WHERE EACH IS ENFORCED
 * ---------------------------------------------------------------------------
 * E1 — WHOSE MONEY. Admin sees the shop's figures; a staff caller (with the toggle
 * on) sees ONLY their own, and the SERVER enforces it (`created_by = self`,
 * reports.py). The client's job is to NAME whose money it is so the number is not
 * misread: the title is "ยอดร้าน" for admin and "ยอดของฉัน" for staff.
 *
 * E2 — WHETHER THE ENTRY IS DRAWN. A control a session would only be refused is
 * never drawn (P1.9's rule, the same one `mayEditPrices` follows). `mayShowDashboardEntry`
 * hides the header entry from a definite `staff` role while the shop's
 * `staff_money_visible` is off. It FAILS OPEN on an unknown role, exactly like
 * `mayVoid`/`mayEditPrices`/`mayEditShopSettings` (src/session/deviceRole.ts): the
 * server re-reads the role every request and a wrongly-offered entry gets a calm 403
 * (`staff_money_hidden`), so failing closed would only lock a real owner out of their
 * own takings over a token this build merely failed to parse.
 *
 * NOTHING IS AUTHORISED ON THE TOGGLE READ HERE. `staff_money_visible` is read off
 * `GET /shop` (staff-readable) for the ENTRY decision only; the authority is the
 * route's own check, on every request, against the row. Offline, the flag is
 * unknown and a staff entry is not drawn — treated as OFF, because a dashboard that
 * cannot reach the server cannot show a number anyway.
 *
 * ---------------------------------------------------------------------------
 * THE BILL LIST IS THE TODAY VIEW'S, AND STAFF DO NOT GET IT (yet)
 * ---------------------------------------------------------------------------
 * The per-bill list is `GET /reports/daily`, which returns the whole shop's day and
 * has NO own-bills variant. So it can be shown to admin, on the today view only;
 * for a staff caller it would leak other people's bills, so it is replaced by one
 * sentence. The gap (`/reports/daily` has no `created_by=self` mode) is recorded in
 * OPEN_ITEMS for the owner to decide — nothing is built for it here.
 */
import type { DeviceRole } from "../session/deviceRole.js";
import type { PeriodSelection, PresetKind } from "./period.js";
import { PRESET_CHIPS } from "./period.js";
import type { SummaryMessage, SummaryReport, SummaryScreen } from "./summaryView.js";
import type { UnsentLine } from "./unsentLine.js";

const STAFF_NO_BILL_LIST =
  "รายการบิลรายใบยังไม่รองรับสำหรับบัญชีพนักงานในเวอร์ชันนี้ — แสดงเฉพาะยอดรวมของคุณ";

/** The header entry gate (E2). True to DRAW the ยอดวันนี้/dashboard entry. */
export function mayShowDashboardEntry(role: DeviceRole, moneyVisible: boolean | null): boolean {
  // Admin and unknown: offered (fail open, as every other gate on this client).
  if (role !== "staff") return true;
  // Definite staff: only once the shop owner has turned money on. Offline/unknown
  // flag reads false here, so the entry stays hidden until a real `true` arrives.
  return moneyVisible === true;
}

/**
 * Read `staff_money_visible` off a `GET /shop` body, WITHOUT going through
 * `readShopSettings` — that reader (src/settings/shopSettings.ts) is a fixed
 * four-field set a proof pins, and widening it would move `prove:settings`. This is
 * the dashboard's own one-field read; a missing or non-boolean value is null
 * (unknown), which `mayShowDashboardEntry` treats as OFF for staff.
 */
export function readMoneyVisible(body: unknown): boolean | null {
  if (typeof body !== "object" || body === null) return null;
  const v = (body as Record<string, unknown>)["staff_money_visible"];
  return typeof v === "boolean" ? v : null;
}

/** Where the today view's per-bill list stands for this session. */
export type BillListSlot =
  /** Not the today view (week/month/custom): no per-bill list at all. */
  | { kind: "hidden" }
  /** Staff: the daily route has no own-bills variant, so one sentence instead. */
  | { kind: "staff_unavailable"; note: string }
  /** Admin/unknown on the today view: draw the daily bills (from the `daily` prop). */
  | { kind: "show" };

export interface DashboardPresetChip {
  preset: PresetKind;
  label: string;
  note: string | null;
  selected: boolean;
}

export interface DashboardReport {
  kind: "dashboard";
  /** "ยอดร้าน" (admin) or "ยอดของฉัน" (staff) — the title NAMES whose money it is. */
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
  role: DeviceRole;
  selection: PeriodSelection;
  summary: SummaryScreen;
  unsent: UnsentLine | null;
}

function billListSlot(role: DeviceRole, selection: PeriodSelection): BillListSlot {
  if (!selection.isToday) return { kind: "hidden" };
  if (role === "staff") return { kind: "staff_unavailable", note: STAFF_NO_BILL_LIST };
  return { kind: "show" };
}

function presetChips(selected: PresetKind): readonly DashboardPresetChip[] {
  return PRESET_CHIPS.map((c) => ({ ...c, selected: c.preset === selected }));
}

/**
 * THE DASHBOARD MODEL, from the role, the period, the summary and the unsent line.
 * THE only entry point the screen uses for the body.
 *
 * When the summary is a MESSAGE (offline, refused, session), the whole screen is
 * that message — no chips, no chart, no fields, no unsent line — the settings-screen
 * pattern: a surface that cannot reach the server shows one calm sentence and
 * nothing that looks like data.
 */
export function dashboardScreen(input: DashboardInput): DashboardScreenModel {
  if (input.summary.kind === "message") return input.summary;

  const isStaff = input.role === "staff";
  return {
    kind: "dashboard",
    title: isStaff ? "ยอดของฉัน" : "ยอดร้าน",
    whoseMoney: isStaff ? "own" : "shop",
    periodLabel: input.selection.label,
    presetChips: presetChips(input.selection.preset),
    report: input.summary,
    unsent: input.unsent,
    billList: billListSlot(input.role, input.selection),
  };
}
