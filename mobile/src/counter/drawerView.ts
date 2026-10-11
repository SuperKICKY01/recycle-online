/**
 * THE CASH DRAWER AT THE COUNTER — shifts, the pay-gate, the blind count, cash
 * movements, the shop's own channels and their settings group, as PURE functions
 * (STRUCTURE.md 2.4, the shifts unit, commit 3). No React Native, no Expo, no node,
 * no fetch — `npm run prove:counter` runs exactly the gates, wording and arithmetic
 * the phone runs. `app/CounterScreen.tsx` and `app/SettingsScreen.tsx` render what
 * this returns and decide nothing.
 *
 * WHY A FILE BESIDE counterView.ts AND NOT INSIDE IT. counterView owns the queue and
 * one payment; this owns a different object with its own reads (GET /shop/policy,
 * GET /shifts/current, GET /shop/payment-channels) and its own writes. The two meet
 * at exactly three seams, and each is named where it is used: the pay-gate (R1)
 * decides whether counterView's pay action is drawn, the method set (R7) decides
 * which of counterView's methods are offered, and the channel picker (R6) adds one
 * optional field to counterView's payment draft.
 *
 * ONLINE ONLY, like the counter (the owner's ruling 3). Nothing here is cached and
 * nothing is an outbox kind: the drawer figure is computed by the server under a
 * lock, and a phone cannot compute it against a stale cache.
 *
 * NOTHING HERE IS AN ACCEPTANCE TEST (STRUCTURE.md invariant 1). The server records a
 * payment whatever shifts_enabled or the method rows say. Every gate below is a
 * DISPLAY rule — it decides what is drawn, and the server is the authority on what is
 * recorded.
 */
import { shopDateTime } from "@recycle/shop-time";

import { may } from "../session/deviceRole.js";
import type { Grants } from "../session/deviceRole.js";
import { display } from "../money/format.js";
import { compareMoney, parsePrice } from "../money/money.js";
import type { Clock, IdSource } from "../sync/types.js";
import {
  METHOD_LABEL,
  OFFERED_METHODS,
  REFUSED_OFFLINE,
  type PaymentFetch,
  type PaymentMethod,
} from "./counterView.js";

/* ==========================================================================
 * 0. SHARED READERS
 * ========================================================================== */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const readStr = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** A money STRING as the server serialises it (`_money`: two decimals, may be
 *  negative for a figure). Anything else is a body this build cannot read. */
const MONEY = /^-?\d+\.\d{2}$/;
const readMoney = (v: unknown): string | null =>
  typeof v === "string" && MONEY.test(v) ? v : null;

const codeOf = (body: unknown): string | null => {
  if (isObj(body) && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (isObj(detail)) return readStr(detail["code"]);
  }
  return null;
};

/** The money unit every figure here is shown with. */
export const BAHT = "บาท";

/* ==========================================================================
 * 1. THE POLICY — GET /shop/policy, read LIVE when the counter opens (R7)
 * ========================================================================== */

/**
 * The branch's counter policy as GET /shop/policy returned it. Each field is null
 * for UNKNOWN: the read failed, the caller has no single branch (an unscoped owner
 * of a multi-yard shop — the server sends null), or an older server did not send
 * the key. Null is a first-class answer and every consumer below says what it does
 * with it.
 */
export interface CounterPolicy {
  branchId: string | null;
  separateCashier: boolean | null;
  shiftsEnabled: boolean | null;
  /** The branch's ACTIVE methods, as codes the server sent, or null for unknown. */
  activeMethods: readonly string[] | null;
}

export const UNKNOWN_POLICY: CounterPolicy = {
  branchId: null,
  separateCashier: null,
  shiftsEnabled: null,
  activeMethods: null,
};

const readBoolOrNull = (v: unknown): boolean | null | undefined =>
  v === null || v === undefined ? null : typeof v === "boolean" ? v : undefined;

/**
 * Parse GET /shop/policy, or null for a body this build cannot read. A key that is
 * ABSENT reads as null (unknown): `shifts_enabled` and `payment_methods` arrived
 * with the shifts unit's commit 2, and a server from before it simply does not send
 * them. A key PRESENT with the wrong type is a malformed body, and the whole read is
 * refused rather than half-believed.
 */
export function readShopPolicy(raw: unknown): CounterPolicy | null {
  if (!isObj(raw)) return null;
  const branchRaw = raw["branch_id"];
  const branchId = branchRaw === null || branchRaw === undefined ? null : readStr(branchRaw);
  if (branchRaw !== null && branchRaw !== undefined && branchId === null) return null;
  const separateCashier = readBoolOrNull(raw["separate_cashier"]);
  const shiftsEnabled = readBoolOrNull(raw["shifts_enabled"]);
  if (separateCashier === undefined || shiftsEnabled === undefined) return null;
  const methodsRaw = raw["payment_methods"];
  let activeMethods: string[] | null = null;
  if (methodsRaw !== null && methodsRaw !== undefined) {
    if (!Array.isArray(methodsRaw) || !methodsRaw.every((m) => typeof m === "string")) return null;
    activeMethods = [...(methodsRaw as string[])];
  }
  return { branchId, separateCashier, shiftsEnabled, activeMethods };
}

/**
 * The policy the counter draws from. A failed or unreadable read is UNKNOWN — never
 * "shifts off" and never "no methods": a failure to read is not a negative answer
 * (defensive-coding § 1). Each consumer below decides what unknown draws.
 */
export function counterPolicy(fetch: PaymentFetch): CounterPolicy {
  if (fetch.kind !== "ok") return UNKNOWN_POLICY;
  return readShopPolicy(fetch.body) ?? UNKNOWN_POLICY;
}

/**
 * R7 — THE METHODS THE PAYMENT FORM OFFERS: the branch's ACTIVE methods, intersected
 * with what this build can take at the counter (cash and transfer; promptpay waits
 * for the QR the owner has not bank-verified, write_off for void).
 *
 * FAILS OPEN to today's cash/transfer pair when the policy is UNKNOWN, and the
 * reasoning is the counter's own (mayShowCounterEntry): a method row is a DISPLAY
 * rule the server does not enforce (channels.py: POST /payments reads no method
 * row), so wrongly SHOWING transfer costs one payment recorded under a method the
 * shop switched off — accepted, and visible in the ledger — while wrongly HIDING
 * every method costs a seller standing at the counter who cannot be paid. A policy
 * that WAS read is exact: a branch that switched transfer off does not see it, and
 * a branch that switched everything off sees no method at all (noMethodLine).
 */
export function offeredMethods(policy: CounterPolicy): readonly PaymentMethod[] {
  const active = policy.activeMethods;
  if (active === null) return OFFERED_METHODS;
  return OFFERED_METHODS.filter((m) => active.includes(m));
}

/** What the pay panel says when the read policy leaves no method it can offer. */
export const NO_METHOD_LINE =
  "ร้านปิดวิธีจ่ายที่หน้านี้รองรับไว้ทั้งหมด — เปิดวิธีจ่ายได้ที่ ตั้งค่าร้าน";

/* ==========================================================================
 * 2. THE SHIFT — GET /shifts/current, classified
 * ========================================================================== */

/** The drawer figure's parts, exactly as the server computed them (shifts.py
 *  `_drawer_figure`). RAW strings; the phone never adds them up (R4). */
export interface DrawerFigure {
  openingFloat: string;
  cashIn: string;
  cashOut: string;
  cashPayments: string;
  expectedCash: string;
}

export interface OpenShift {
  id: string;
  openedAt: string;
  openedBy: string;
  openingFloat: string;
  /** Present ONLY when the server sent it — GET /shifts/current includes the
   *  running figure for a principal holding money.view_shop and omits the key for
   *  everyone else (shifts.py current_shift). The phone never computes one (R4). */
  drawer: DrawerFigure | null;
}

export type ShiftState =
  | { kind: "open"; shift: OpenShift }
  /** DEFINITE: the server answered 404 no_open_shift. */
  | { kind: "none" }
  /** A failure to read is not an answer (defensive-coding § 1). */
  | { kind: "unknown"; why: "not_permitted" | "offline" | "session" | "server" };

function readDrawer(raw: unknown): DrawerFigure | null | undefined {
  if (raw === undefined) return null; // absent: the server withheld it (R4)
  if (!isObj(raw)) return undefined;
  const openingFloat = readMoney(raw["opening_float"]);
  const cashIn = readMoney(raw["cash_in"]);
  const cashOut = readMoney(raw["cash_out"]);
  const cashPayments = readMoney(raw["cash_payments"]);
  const expectedCash = readMoney(raw["expected_cash"]);
  if (!openingFloat || !cashIn || !cashOut || !cashPayments || !expectedCash) return undefined;
  return { openingFloat, cashIn, cashOut, cashPayments, expectedCash };
}

/** One OPEN shift as GET /shifts/current returns it, or null if unreadable. */
export function readOpenShift(raw: unknown): OpenShift | null {
  if (!isObj(raw)) return null;
  const id = readStr(raw["id"]);
  const status = readStr(raw["status"]);
  const openedAt = readStr(raw["opened_at"]);
  const openedBy = readStr(raw["opened_by"]);
  const openingFloat = readMoney(raw["opening_float"]);
  const drawer = readDrawer(raw["drawer"]);
  if (id === null || status !== "open" || openedAt === null || openedBy === null) return null;
  if (openingFloat === null || drawer === undefined) return null;
  return { id, openedAt, openedBy, openingFloat, drawer };
}

/**
 * WHAT GET /shifts/current PRODUCED. Only a 404 carrying `no_open_shift` is "none":
 * a 404 with any other code (or none — a server without the route) is a read that
 * did not answer the question, so it is UNKNOWN. Treating it as "no shift" would
 * close the pay-gate on a failure, which is a failure recorded as a verdict.
 */
export function shiftState(fetch: PaymentFetch): ShiftState {
  if (fetch.kind === "ok") {
    const shift = readOpenShift(fetch.body);
    return shift === null ? { kind: "unknown", why: "server" } : { kind: "open", shift };
  }
  if (fetch.kind === "no_token") return { kind: "unknown", why: "session" };
  if (fetch.kind === "unreachable") return { kind: "unknown", why: "offline" };
  if (fetch.status === 401) return { kind: "unknown", why: "session" };
  if (fetch.status === 403) return { kind: "unknown", why: "not_permitted" };
  if (fetch.status === 404 && codeOf(fetch.body) === "no_open_shift") return { kind: "none" };
  return { kind: "unknown", why: "server" };
}

/** The state for a caller whose read grant set lacks shifts.manage: the app does
 *  not ask a question the server would refuse (GET /shifts/current is gated). */
export const SHIFT_NOT_PERMITTED: ShiftState = { kind: "unknown", why: "not_permitted" };

/* ==========================================================================
 * 3. R1 — THE PAY-GATE
 * ========================================================================== */

export type PayGate = { kind: "pay" } | { kind: "shift_first"; line: string };

export const SHIFT_FIRST_LINE = "ร้านนี้ใช้ระบบกะ — เปิดกะก่อน แล้วจึงจ่ายเงินได้";

/**
 * R1: `shifts_enabled` ON and DEFINITELY no open shift → the pay action is not
 * offered; the screen offers "open a shift" in its place. Everything else offers
 * payment exactly as before this commit.
 *
 * WHY ONLY A DEFINITE "none" CLOSES IT — and a later session must not "harden" this
 * into a lockout. The gate exists so cash does not leave the drawer outside any
 * drawer figure (OPEN_ITEMS.md, the unstamped-cash gap). It closes only on what the
 * server SAID: shifts on, and 404 no_open_shift. An UNKNOWN shift state — the read
 * failed, or the caller lacks shifts.manage and so cannot ask — leaves the pay action
 * drawn: wrongly SHOWING it costs one cash payment stamped to no shift, which the
 * server accepts (invariant 1) and the owner-facing unstamped-cash report surfaces;
 * wrongly HIDING it costs a seller at the counter who cannot be paid by a cashier
 * who has no way to open a shift. An unknown `shifts_enabled` is today's behaviour.
 * THE SERVER REFUSES NOTHING HERE (STRUCTURE.md 1.3): this is a display rule.
 */
export function payGate(policy: CounterPolicy, shift: ShiftState): PayGate {
  if (policy.shiftsEnabled !== true) return { kind: "pay" };
  if (shift.kind === "none") return { kind: "shift_first", line: SHIFT_FIRST_LINE };
  return { kind: "pay" };
}

/**
 * The gate the SHIFT PANEL words itself by. On a screen that shows no queue (a shop
 * that reached the counter through the drawer branch alone — the weigher pays at the
 * yard, POST /bills writes the cash payment) there is no pay action here to gate, and
 * the yard pays whether a shift is open or not, so the panel must not say "open a
 * shift, THEN you can pay": that sentence would claim a gate that does not exist.
 * Observed on the emulator, 2026-09-30.
 */
export function panelGate(gate: PayGate, queueShown: boolean): PayGate {
  return queueShown ? gate : { kind: "pay" };
}

/* ==========================================================================
 * 4. THE SHIFT PANEL (R4)
 * ========================================================================== */

/**
 * Draw the shift panel? Only for a principal holding shifts.manage (fail-open on an
 * absent set, like every may() gate — the server refuses every shift route anyway).
 * An OPEN shift is always drawn, so a shift left open after the switch was turned
 * off can still be counted and closed; otherwise a branch that switched shifts OFF
 * is not shown a panel it does not use. An unknown switch draws it.
 */
export function mayShowShiftPanel(grants: Grants, policy: CounterPolicy, shift: ShiftState): boolean {
  if (!may(grants, "shifts.manage")) return false;
  if (shift.kind === "open") return true;
  return policy.shiftsEnabled !== false;
}

export const PANEL_HEADING = "ลิ้นชักเงินสด";
export const SHIFT_CLOSED_BADGE = "ยังไม่เปิดกะ";
export const SHIFT_OPEN_BADGE = "เปิดกะอยู่";
export const FLOAT_LABEL = "เงินตั้งต้นในลิ้นชัก";
export const FLOAT_HINT = "นับเงินที่อยู่ในลิ้นชักตอนเริ่มกะ";
export const OPEN_SHIFT_LABEL = "เปิดกะ";
export const OPENED_AT_LABEL = "เปิดเมื่อ";
export const OPENED_BY_LABEL = "เปิดโดย";
export const OPENED_BY_SELF = "คุณ";
export const OPENED_BY_OTHER = "บัญชีอื่น";
export const RUNNING_FIGURE_LABEL = "เงินในลิ้นชักตามระบบ";
export const FIGURE_PART_LABEL = {
  openingFloat: "เงินตั้งต้น",
  cashIn: "เงินเข้า",
  cashOut: "เงินออก",
  cashPayments: "จ่ายเงินสด",
} as const;
export const MOVEMENT_ENTRY_LABEL = "บันทึกเงินเข้า-ออก";
export const CLOSE_ENTRY_LABEL = "ปิดกะ";

export interface FigureLine {
  label: string;
  /** display()-grouped; the screen appends the unit. */
  value: string;
}

export type ShiftPanel =
  | {
      kind: "closed";
      badge: string;
      /** Present when the pay-gate is closed: why nothing can be paid yet. */
      gateLine: string | null;
      floatLabel: string;
      floatHint: string;
      openLabel: string;
    }
  | {
      kind: "open";
      shiftId: string;
      badge: string;
      openedAt: FigureLine;
      /** null when this build cannot read the session's own user id. */
      openedBy: FigureLine | null;
      /** R4: present ONLY when the server sent the running figure. */
      figure: FigureLine | null;
      breakdown: readonly FigureLine[];
      movementLabel: string;
      closeLabel: string;
    }
  | { kind: "message"; badge: string; line: string; retry: boolean };

const PANEL_OFFLINE: ShiftPanel = {
  kind: "message",
  badge: "ยังติดต่อระบบไม่ได้",
  line: "อ่านสถานะกะไม่ได้ เพราะยังติดต่อระบบไม่ได้",
  retry: true,
};
const PANEL_SERVER: ShiftPanel = {
  kind: "message",
  badge: "อ่านสถานะกะไม่ได้",
  line: "ระบบยังตอบเรื่องกะไม่ได้ในตอนนี้",
  retry: true,
};
const REFUSED_SHIFT_FORBIDDEN =
  "บัญชีนี้ไม่มีสิทธิ์จัดการกะและลิ้นชัก ต้องให้เจ้าของร้านมอบสิทธิ์";
const PANEL_FORBIDDEN: ShiftPanel = {
  kind: "message",
  badge: "ไม่มีสิทธิ์",
  line: REFUSED_SHIFT_FORBIDDEN,
  retry: false,
};

/**
 * The panel for one shift state. `selfUserId` is the session's own user id
 * (readTokenUserId) — the server returns `opened_by` as an id and no name, so the
 * panel says "you" or "another account" and invents no name.
 *
 * R4: the running figure and its parts are drawn from `shift.drawer` and ONLY from
 * it. There is no arithmetic here — a figure the server withheld is absent, not
 * computed from the float.
 */
export function shiftPanel(state: ShiftState, gate: PayGate, selfUserId: string | null): ShiftPanel {
  if (state.kind === "unknown") {
    if (state.why === "offline") return PANEL_OFFLINE;
    if (state.why === "not_permitted") return PANEL_FORBIDDEN;
    return PANEL_SERVER; // session: the app ends the session; server: retryable
  }
  if (state.kind === "none") {
    return {
      kind: "closed",
      badge: SHIFT_CLOSED_BADGE,
      gateLine: gate.kind === "shift_first" ? gate.line : null,
      floatLabel: FLOAT_LABEL,
      floatHint: FLOAT_HINT,
      openLabel: OPEN_SHIFT_LABEL,
    };
  }
  const s = state.shift;
  const d = s.drawer;
  return {
    kind: "open",
    shiftId: s.id,
    badge: SHIFT_OPEN_BADGE,
    openedAt: { label: OPENED_AT_LABEL, value: shopDateTime(s.openedAt) },
    openedBy:
      selfUserId === null
        ? null
        : { label: OPENED_BY_LABEL, value: s.openedBy === selfUserId ? OPENED_BY_SELF : OPENED_BY_OTHER },
    figure: d === null ? null : { label: RUNNING_FIGURE_LABEL, value: display(d.expectedCash) },
    breakdown:
      d === null
        ? []
        : [
            { label: FIGURE_PART_LABEL.openingFloat, value: display(d.openingFloat) },
            { label: FIGURE_PART_LABEL.cashIn, value: display(d.cashIn) },
            { label: FIGURE_PART_LABEL.cashOut, value: display(d.cashOut) },
            { label: FIGURE_PART_LABEL.cashPayments, value: display(d.cashPayments) },
          ],
    movementLabel: MOVEMENT_ENTRY_LABEL,
    closeLabel: CLOSE_ENTRY_LABEL,
  };
}

/* ==========================================================================
 * 5. OPENING A SHIFT
 * ========================================================================== */

export type AmountCheck = { ok: true; value: string } | { ok: false; message: string };

const NEED_FLOAT = "ใส่เงินตั้งต้นให้ถูกต้อง (ใส่ 0 ได้ถ้าลิ้นชักว่าง)";
const NEED_AMOUNT = "ใส่จำนวนเงินให้ถูกต้อง";
const NEED_COUNT = "ใส่ยอดที่นับได้ให้ถูกต้อง";

/** The opening float: a two-decimal amount, zero allowed (an empty drawer is a
 *  real start; the server's own rule is `ge=0`). Refused BEFORE the request. */
export function checkOpeningFloat(raw: string): AmountCheck {
  const p = parsePrice(raw);
  if (!p.ok) return { ok: false, message: NEED_FLOAT };
  return { ok: true, value: p.value };
}

export interface ShiftOpenBody {
  id: string;
  opening_float: string;
}

/** POST /shifts. The client-minted id IS the idempotency key (shifts.py ShiftOpen:
 *  a replay of the id returns the same shift), minted here exactly once per tap.
 *  branch_id is omitted: the server resolves the caller's branch, the payment shape. */
export function buildOpenShiftBody(ids: IdSource, openingFloat: string): ShiftOpenBody {
  return { id: ids.newId(), opening_float: openingFloat };
}

/* ==========================================================================
 * 6. R5 — CASH MOVEMENTS
 * ========================================================================== */

export type CashKind = "float_in" | "float_out" | "expense" | "deposit_to_bank";

/** The four kinds the server's CHECK admits (shifts.py CashKind), in screen order. */
export const CASH_KINDS: readonly CashKind[] = ["float_in", "float_out", "expense", "deposit_to_bank"];

export const CASH_KIND_LABEL: { readonly [K in CashKind]: string } = {
  float_in: "เติมเงินเข้าลิ้นชัก",
  float_out: "นำเงินออกจากลิ้นชัก",
  expense: "จ่ายค่าใช้จ่าย",
  deposit_to_bank: "นำเงินไปฝากธนาคาร",
};

export const MOVEMENT_HEADING = "บันทึกเงินเข้า-ออกลิ้นชัก";
export const MOVEMENT_AMOUNT_LABEL = "จำนวนเงิน";
export const MOVEMENT_NOTE_LABEL = "หมายเหตุ (ไม่บังคับ)";
export const MOVEMENT_SAVE_LABEL = "บันทึก";
export const CANCEL_LABEL = "ยกเลิก";
/** The server's note bound (shifts.py CashMovementCreate.note max_length). */
export const NOTE_MAX = 500;

/**
 * R5: a movement amount is a POSITIVE two-decimal string, refused before the
 * request — the counter's P1/P2 style. Zero is refused here although the float
 * accepts it: the server's own rule is `gt=0` for a movement, `ge=0` for a float.
 */
export function checkMovementAmount(raw: string): AmountCheck {
  const p = parsePrice(raw);
  if (!p.ok || compareMoney(p.value, "0.00") <= 0) return { ok: false, message: NEED_AMOUNT };
  return { ok: true, value: p.value };
}

export interface CashMovementBody {
  id: string;
  kind: CashKind;
  amount: string;
  idempotency_key: string;
  device_created_at: string;
  note?: string;
}

/** POST /cash-movements. id and key minted once here (buildPaymentBody's rule); an
 *  empty note is omitted, never sent as "". */
export function buildMovementBody(
  meta: { clock: Clock; ids: IdSource },
  kind: CashKind,
  amount: string,
  note: string,
): CashMovementBody {
  const trimmed = note.trim().slice(0, NOTE_MAX);
  return {
    id: meta.ids.newId(),
    kind,
    amount,
    idempotency_key: meta.ids.newId(),
    device_created_at: meta.clock.now().toISOString(),
    ...(trimmed.length > 0 ? { note: trimmed } : {}),
  };
}

/* ==========================================================================
 * 7. R2 / R3 — THE BLIND COUNT, THE RESULT, THE REASON
 * ========================================================================== */

/**
 * R2 — THE COUNT FORM IS BLIND. It asks for the counted cash WITHOUT showing
 * expected_cash or the running drawer figure, for anyone, including a principal
 * holding money.view_shop. A cashier who sees the figure first counts TOWARD it and
 * the variance stops measuring anything.
 *
 * This function takes NO ARGUMENT, on purpose: there is no parameter through which a
 * figure could reach the form's model. The screen's CloseCountForm renders this and
 * nothing else — prove:counter reads that component's source and requires it to
 * name no drawer, figure or expected value, with the panel as its positive control.
 */
export interface CloseForm {
  heading: string;
  lines: readonly string[];
  countedLabel: string;
  confirmLabel: string;
  cancelLabel: string;
}

export function closeForm(): CloseForm {
  return {
    heading: "ปิดกะ — นับเงินในลิ้นชัก",
    lines: [
      "นับเงินสดที่อยู่ในลิ้นชักจริง แล้วใส่ยอดที่นับได้",
      "ระบบจะแสดงยอดที่ควรมีหลังบันทึกยอดนับแล้ว",
    ],
    countedLabel: "ยอดที่นับได้",
    confirmLabel: "ยืนยันปิดกะ",
    cancelLabel: CANCEL_LABEL,
  };
}

/** The counted cash: two decimals, zero allowed (an empty drawer is a real count). */
export function checkCountedCash(raw: string): AmountCheck {
  const p = parsePrice(raw);
  if (!p.ok) return { ok: false, message: NEED_COUNT };
  return { ok: true, value: p.value };
}

/** A CLOSED shift as POST /shifts/{id}/close and PATCH /shifts/{id} return it. */
export interface ClosedShift {
  id: string;
  countedCash: string;
  expectedCash: string;
  variance: string;
  reason: string | null;
}

/** Parse a closed-shift payload, or null. The three close figures must be present
 *  money strings — they come from the server's frozen row, never from here. */
export function readClosedShift(raw: unknown): ClosedShift | null {
  if (!isObj(raw)) return null;
  const id = readStr(raw["id"]);
  const status = readStr(raw["status"]);
  const countedCash = readMoney(raw["counted_cash"]);
  const expectedCash = readMoney(raw["expected_cash"]);
  const variance = readMoney(raw["variance"]);
  const reasonRaw = raw["variance_reason"];
  const reason = reasonRaw === null || reasonRaw === undefined ? null : readStr(reasonRaw);
  if (id === null || status !== "closed" || !countedCash || !expectedCash || !variance) return null;
  if (reasonRaw !== null && reasonRaw !== undefined && reason === null) return null;
  return { id, countedCash, expectedCash, variance, reason };
}

export const CLOSED_BADGE = "ปิดกะแล้ว";
export const COUNTED_LABEL = "ยอดที่นับได้";
export const EXPECTED_LABEL = "ยอดที่ควรมี";
export const VARIANCE_LABEL = "ส่วนต่าง";
export const VARIANCE_WORD = { exact: "ตรงกับระบบ", over: "เงินเกิน", short: "เงินขาด" } as const;
export const REASON_LABEL = "เหตุผลของส่วนต่าง";
export const REASON_HINT = "ระบุได้ครั้งเดียว บันทึกแล้วแก้ไขไม่ได้";
export const REASON_SUBMIT = "บันทึกเหตุผล";
export const REASON_SHOWN_LABEL = "เหตุผล";
export const REASON_FROZEN_LINE = "ระบุเหตุผลของกะนี้ไว้แล้ว";
export const DONE_LABEL = "เสร็จสิ้น";
/** The server's reason bound (shifts.py ShiftReason max_length). */
export const REASON_MAX = 500;

export type ReasonState =
  | { kind: "none" }
  | { kind: "ask"; label: string; hint: string; submitLabel: string }
  | { kind: "shown"; label: string; text: string }
  /** The server refused a second reason (409 shift_reason_frozen) and this device
   *  does not hold the text that was saved — say so, offer no input. */
  | { kind: "frozen"; line: string };

export interface CloseResult {
  shiftId: string;
  badge: string;
  counted: FigureLine;
  expected: FigureLine;
  variance: FigureLine;
  tone: "exact" | "over" | "short";
  /** VARIANCE_WORD for the tone. */
  word: string;
  reason: ReasonState;
  doneLabel: string;
}

/** The magnitude of a signed money STRING, by string surgery — no arithmetic. */
const unsigned = (s: string): string => (s.startsWith("-") ? s.slice(1) : s);

/**
 * R2/R3 — the result, shown only AFTER the close committed, from the server's
 * response. The expected figure and the variance appear here for the first time.
 * R3: a non-zero variance with no reason ASKS, once; a zero variance asks nothing;
 * a reason already set is SHOWN and not editable. `reasonFrozen` is set by the app
 * when a reason write came back 409 shift_reason_frozen.
 */
export function closeResult(shift: ClosedShift, reasonFrozen = false): CloseResult {
  const sign = compareMoney(shift.variance, "0.00");
  const tone = sign === 0 ? "exact" : sign > 0 ? "over" : "short";
  let reason: ReasonState;
  if (shift.reason !== null) reason = { kind: "shown", label: REASON_SHOWN_LABEL, text: shift.reason };
  else if (tone === "exact") reason = { kind: "none" };
  else if (reasonFrozen) reason = { kind: "frozen", line: REASON_FROZEN_LINE };
  else reason = { kind: "ask", label: REASON_LABEL, hint: REASON_HINT, submitLabel: REASON_SUBMIT };
  return {
    shiftId: shift.id,
    badge: CLOSED_BADGE,
    counted: { label: COUNTED_LABEL, value: display(shift.countedCash) },
    expected: { label: EXPECTED_LABEL, value: display(shift.expectedCash) },
    variance: { label: VARIANCE_LABEL, value: display(unsigned(shift.variance)) },
    tone,
    word: VARIANCE_WORD[tone],
    reason,
    doneLabel: DONE_LABEL,
  };
}

/**
 * A close that COMMITTED (2xx) but whose body this build cannot read. Not a retry
 * instruction — the shift is closed and a second close is refused 409 — and not
 * the figure, which the phone does not have. It names what happened.
 */
export const CLOSE_RESULT_UNREADABLE = "ปิดกะแล้ว แต่อ่านยอดสรุปไม่ได้ — เจ้าของร้านตรวจยอดของกะนี้ได้ในระบบ";

/** Did a reason write come back 409 shift_reason_frozen? The app uses it to stop
 *  asking (ReasonState "frozen"); the refusal itself is worded by drawerOutcome. */
export function isReasonFrozen(fetch: PaymentFetch): boolean {
  return fetch.kind === "http" && fetch.status === 409 && codeOf(fetch.body) === "shift_reason_frozen";
}

const NEED_REASON = "ใส่เหตุผลของส่วนต่าง";
const REASON_TOO_LONG = "เหตุผลยาวเกินกำหนด";

/** R3: a reason is non-blank and within the server's bound, refused before the
 *  request (the server refuses a blank one too — shifts.py `_not_blank`). */
export function checkReason(raw: string): AmountCheck {
  const t = raw.trim();
  if (t.length === 0) return { ok: false, message: NEED_REASON };
  if (t.length > REASON_MAX) return { ok: false, message: REASON_TOO_LONG };
  return { ok: true, value: t };
}

/* ==========================================================================
 * 8. R8 — WHAT A DRAWER OR SETTINGS WRITE PRODUCED, worded from (status, code)
 * ========================================================================== */

/**
 * The generic sentence for a refusal this build cannot name. It is NOT the
 * counter's REFUSED_SERVER, whose words are "the system cannot take a payment now":
 * on a shift or settings route that is a confidently wrong instruction
 * (correct-classification-can-still-render-as-an-error.md: a wrong message makes
 * someone act). Same role, same rule — the server's `message` is never shown.
 */
export const REFUSED_DRAWER_GENERIC = "ระบบยังทำรายการนี้ไม่ได้ในตอนนี้ — ลองอีกครั้ง";
const REFUSED_SETTINGS_FORBIDDEN = "บัญชีนี้ไม่มีสิทธิ์แก้การตั้งค่าร้าน";
const REFUSED_SHIFT_ALREADY_OPEN = "สาขานี้มีกะที่เปิดอยู่แล้ว — โหลดใหม่เพื่อดูกะนั้น";
const REFUSED_SHIFT_CLOSED = "กะนี้ปิดไปแล้ว — โหลดใหม่";
const REFUSED_NO_OPEN_SHIFT = "ไม่พบกะที่เปิดอยู่ — โหลดใหม่";
const REFUSED_SHIFT_STILL_OPEN = "ยังไม่ได้ปิดกะ จึงยังระบุเหตุผลไม่ได้";
// Worded apart from the server's own message for this code (shifts.py), so the
// no-leak scan can tell the client's sentence from the server's prose.
const REFUSED_REASON_FROZEN = "เหตุผลของกะนี้บันทึกไว้แล้ว แก้ไขไม่ได้";
const REFUSED_CHANNEL_INCOHERENT = "ข้อมูลบัญชีไม่ครบตามประเภทที่เลือก";
const REFUSED_CHANNEL_NOT_FOUND = "ไม่พบบัญชีนี้ — โหลดใหม่";
const REFUSED_BRANCH_NOT_FOUND = "ไม่พบสาขานี้ — โหลดใหม่";
const REFUSED_BRANCH_UNRESOLVED = "ยังระบุสาขาของบัญชีนี้ไม่ได้ — ให้เจ้าของร้านตรวจสาขาของบัญชี";

export type DrawerSubject = "shift" | "settings";

export type DrawerOutcome =
  | { kind: "ok"; body: unknown }
  | { kind: "session" }
  /** `reload`: the state the screen drew from moved under it — re-read it. */
  | { kind: "refused"; message: string; reload: boolean };

/**
 * R8 — every refusal from the drawer and settings routes, classified on the STATUS
 * and the `code`, never the prose (the counter's paymentOutcome shape). A code this
 * build does not know gets REFUSED_DRAWER_GENERIC. `subject` only picks which
 * permission a 403 names — a shift route's missing right is not a settings one.
 */
export function drawerOutcome(fetch: PaymentFetch, subject: DrawerSubject): DrawerOutcome {
  if (fetch.kind === "ok") return { kind: "ok", body: fetch.body };
  if (fetch.kind === "no_token") return { kind: "session" };
  if (fetch.kind === "unreachable") return { kind: "refused", message: REFUSED_OFFLINE, reload: false };
  if (fetch.status === 401) return { kind: "session" };
  if (fetch.status === 403) {
    return {
      kind: "refused",
      message: subject === "shift" ? REFUSED_SHIFT_FORBIDDEN : REFUSED_SETTINGS_FORBIDDEN,
      reload: false,
    };
  }
  const code = codeOf(fetch.body);
  if (fetch.status === 424) return { kind: "refused", message: REFUSED_BRANCH_UNRESOLVED, reload: false };
  switch (code) {
    case "shift_already_open":
      return { kind: "refused", message: REFUSED_SHIFT_ALREADY_OPEN, reload: true };
    case "shift_closed":
      return { kind: "refused", message: REFUSED_SHIFT_CLOSED, reload: true };
    case "no_open_shift":
    case "shift_not_found":
      return { kind: "refused", message: REFUSED_NO_OPEN_SHIFT, reload: true };
    case "shift_open":
      return { kind: "refused", message: REFUSED_SHIFT_STILL_OPEN, reload: false };
    case "shift_reason_frozen":
      return { kind: "refused", message: REFUSED_REASON_FROZEN, reload: false };
    case "channel_incoherent":
      return { kind: "refused", message: REFUSED_CHANNEL_INCOHERENT, reload: false };
    case "channel_not_found":
      return { kind: "refused", message: REFUSED_CHANNEL_NOT_FOUND, reload: true };
    case "branch_not_found":
      return { kind: "refused", message: REFUSED_BRANCH_NOT_FOUND, reload: true };
    default:
      return { kind: "refused", message: REFUSED_DRAWER_GENERIC, reload: false };
  }
}

/* ==========================================================================
 * 9. R6 — THE SHOP'S OWN CHANNELS, and the masked display
 * ========================================================================== */

export type ChannelKind = "promptpay" | "bank_account";
export type ProxyType = "phone" | "national_id" | "ewallet";

export interface ShopChannel {
  id: string;
  kind: ChannelKind;
  label: string;
  isActive: boolean;
  bankCode: string | null;
  accountName: string | null;
  /** The server's masked tail, or null when the identifier is four characters or
   *  fewer (channels.py `_last_four`: then the tail would be the whole value). */
  last4: string | null;
  /** The FULL identifier — present ONLY when the server sent it (a principal
   *  holding shop.settings.write). The client never has it otherwise, and nothing
   *  here reconstructs it (channels.py: the masking is done in serialisation). */
  identifier: string | null;
}

/**
 * Parse GET /shop/payment-channels (or one channel from a POST/PATCH), fatal on a
 * malformed row — a partial list would hide an account the shop pays from. The full
 * identifier is read from `promptpay_proxy` / `account_no` only when that KEY is
 * present; the masked shape carries no such key at all.
 */
export function readChannel(row: unknown): ShopChannel | null {
  if (!isObj(row)) return null;
  const id = readStr(row["id"]);
  const kind = readStr(row["kind"]);
  const label = readStr(row["label"]);
  const isActive = row["is_active"];
  if (id === null || label === null || typeof isActive !== "boolean") return null;
  if (kind !== "promptpay" && kind !== "bank_account") return null;
  const nullableStr = (v: unknown): string | null | undefined =>
    v === null || v === undefined ? null : typeof v === "string" ? v : undefined;
  const bankCode = nullableStr(row["bank_code"]);
  const accountName = nullableStr(row["account_name"]);
  const last4 = nullableStr(row["identifier_last4"]);
  const idKey = kind === "promptpay" ? "promptpay_proxy" : "account_no";
  const identifier = idKey in row ? nullableStr(row[idKey]) : null;
  if (bankCode === undefined || accountName === undefined || last4 === undefined || identifier === undefined) {
    return null;
  }
  return { id, kind, label, isActive, bankCode, accountName, last4, identifier };
}

export function readChannels(raw: unknown): ShopChannel[] | null {
  if (!isObj(raw) || !Array.isArray(raw["channels"])) return null;
  const out: ShopChannel[] = [];
  for (const row of raw["channels"] as unknown[]) {
    const c = readChannel(row);
    if (c === null) return null;
    out.push(c);
  }
  return out;
}

export const CHANNEL_KIND_LABEL: { readonly [K in ChannelKind]: string } = {
  promptpay: "พร้อมเพย์",
  bank_account: "บัญชีธนาคาร",
};
const TAIL_WORD = "ลงท้าย";

/**
 * The line a channel is shown as: its label, then the FULL identifier if the server
 * sent it, else "ลงท้าย" and the masked tail, else the label alone. The display can
 * carry no more of the identifier than the response did — it has nothing else.
 */
export function channelLine(c: ShopChannel): string {
  if (c.identifier !== null) return `${c.label} · ${c.identifier}`;
  if (c.last4 !== null) return `${c.label} · ${TAIL_WORD} ${c.last4}`;
  return c.label;
}

export const PICKER_LABEL = "โอนจากบัญชีของร้าน (ไม่บังคับ)";
export const PICKER_NONE = "ไม่ระบุ";

export interface ChannelPicker {
  show: boolean;
  label: string;
  noneLabel: string;
  options: readonly { id: string; line: string }[];
}

/**
 * R6 — the picker appears for a NON-CASH method when the shop has at least one
 * ACTIVE channel, and it is OPTIONAL: "none" is a valid payment (the server takes
 * channel_id as optional and requires it never). Cash never shows it — cash leaves
 * the drawer, not an account. An unread list (null) shows no picker: the payment is
 * still valid without one, so a failed channel read costs only the optional detail.
 */
export function channelPicker(method: PaymentMethod, channels: readonly ShopChannel[] | null): ChannelPicker {
  const active = method === "cash" || channels === null ? [] : channels.filter((c) => c.isActive);
  return {
    show: active.length > 0,
    label: PICKER_LABEL,
    noneLabel: PICKER_NONE,
    options: active.map((c) => ({ id: c.id, line: channelLine(c) })),
  };
}

/* ==========================================================================
 * 10. THE SETTINGS GROUP — shifts switch, methods, channels (Task 2(d))
 * ========================================================================== */

/** The group is drawn only for a principal holding shop.settings.write — every
 *  write in it is gated on that permission (master.py, channels.py). Fails open on
 *  an absent set, like every may() gate; the server refuses regardless. */
export function mayShowDrawerSettings(grants: Grants): boolean {
  return may(grants, "shop.settings.write");
}

export const SETTINGS_HEADING = "การจ่ายเงิน";
export const SHIFTS_SWITCH_LABEL = "ใช้ระบบกะและลิ้นชักเงินสด";
export const SHIFTS_SWITCH_NOTE = "เมื่อเปิด ต้องเปิดกะก่อนจึงจะจ่ายเงินที่เคาน์เตอร์ได้";
export const METHODS_HEADING = "วิธีจ่ายที่เคาน์เตอร์";
export const METHODS_NOTE = "วิธีที่ปิดไว้จะไม่แสดงที่หน้าเคาน์เตอร์จ่ายเงิน";
export const CHANNELS_HEADING = "บัญชีของร้าน";
export const CHANNELS_EMPTY = "ยังไม่มีบัญชีของร้าน — เพิ่มได้ด้านล่าง";
export const CHANNELS_IMMUTABLE_NOTE =
  "หมายเลขบัญชีและพร้อมเพย์แก้ไขไม่ได้หลังบันทึก — ถ้าเปลี่ยนบัญชี ให้เพิ่มบัญชีใหม่แล้วปิดใช้งานบัญชีเดิม";
export const CHANNEL_INACTIVE_BADGE = "ปิดใช้งาน";
export const CHANNEL_DEACTIVATE_LABEL = "ปิดใช้งานบัญชีนี้";
export const ADD_CHANNEL_HEADING = "เพิ่มบัญชีของร้าน";
export const ADD_CHANNEL_LABEL = "เพิ่มบัญชี";
export const PROXY_TYPE_LABEL: { readonly [K in ProxyType]: string } = {
  phone: "เบอร์โทร",
  national_id: "เลขบัตรประชาชน",
  ewallet: "e-Wallet",
};
export const CHANNEL_FIELD_LABEL = {
  label: "ชื่อที่แสดง",
  proxy: "หมายเลขพร้อมเพย์",
  bankCode: "รหัสธนาคาร",
  accountNo: "เลขที่บัญชี",
  accountName: "ชื่อบัญชี",
} as const;
export const BANK_CODE_HINT = "เช่น KBANK";

/** The methods the settings group switches: exactly the ones the counter can offer.
 *  A switch for promptpay would be a control that changes nothing a cashier sees. */
export const SETTINGS_METHODS: readonly PaymentMethod[] = OFFERED_METHODS;

export interface SettingsChannelRow {
  id: string;
  line: string;
  kindLabel: string;
  isActive: boolean;
}

export type DrawerSettingsScreen =
  | { kind: "message"; badge: string; line: string; retry: boolean }
  | {
      kind: "form";
      branchId: string;
      heading: string;
      shifts: { label: string; note: string; value: boolean };
      methodsHeading: string;
      methodsNote: string;
      methods: readonly { method: PaymentMethod; label: string; value: boolean }[];
      channelsHeading: string;
      channels: readonly SettingsChannelRow[];
      emptyLine: string;
      immutableNote: string;
      inactiveBadge: string;
      deactivateLabel: string;
    };

const SETTINGS_OFFLINE: DrawerSettingsScreen = {
  kind: "message",
  badge: "ยังติดต่อระบบไม่ได้",
  line: "การตั้งค่าการจ่ายเงินต้องเชื่อมต่อระบบ",
  retry: true,
};
const SETTINGS_SERVER: DrawerSettingsScreen = {
  kind: "message",
  badge: "อ่านการตั้งค่าไม่ได้",
  line: "ระบบยังตอบเรื่องการจ่ายเงินไม่ได้ในตอนนี้",
  retry: true,
};
const SETTINGS_FORBIDDEN: DrawerSettingsScreen = {
  kind: "message",
  badge: "ไม่มีสิทธิ์",
  line: REFUSED_SETTINGS_FORBIDDEN,
  retry: false,
};
const SETTINGS_NO_BRANCH: DrawerSettingsScreen = {
  kind: "message",
  badge: "ยังไม่ผูกกับสาขา",
  line: "ส่วนนี้ตั้งค่าได้จากบัญชีที่ผูกกับสาขาเท่านั้น",
  retry: false,
};

function failedRead(f: PaymentFetch): DrawerSettingsScreen | "session" {
  if (f.kind === "no_token") return "session";
  if (f.kind === "unreachable") return SETTINGS_OFFLINE;
  if (f.kind === "http" && f.status === 401) return "session";
  if (f.kind === "http" && f.status === 403) return SETTINGS_FORBIDDEN;
  return SETTINGS_SERVER;
}

/**
 * The settings group from its two reads. A MESSAGE unless BOTH land and both parse
 * (the settings screen's own rule: a partial screen is a claim the data cannot
 * back). `"session"` tells the app to end the session. A caller with no single
 * branch (policy branch_id null) gets a message, not a switch that writes nowhere.
 */
export function drawerSettingsScreen(
  policyFetch: PaymentFetch,
  channelsFetch: PaymentFetch,
): DrawerSettingsScreen | "session" {
  if (policyFetch.kind !== "ok") return failedRead(policyFetch);
  if (channelsFetch.kind !== "ok") return failedRead(channelsFetch);
  const policy = readShopPolicy(policyFetch.body);
  const channels = readChannels(channelsFetch.body);
  if (policy === null || channels === null) return SETTINGS_SERVER;
  if (policy.branchId === null || policy.shiftsEnabled === null || policy.activeMethods === null) {
    return SETTINGS_NO_BRANCH;
  }
  const active = policy.activeMethods;
  return {
    kind: "form",
    branchId: policy.branchId,
    heading: SETTINGS_HEADING,
    shifts: { label: SHIFTS_SWITCH_LABEL, note: SHIFTS_SWITCH_NOTE, value: policy.shiftsEnabled },
    methodsHeading: METHODS_HEADING,
    methodsNote: METHODS_NOTE,
    methods: SETTINGS_METHODS.map((m) => ({ method: m, label: METHOD_LABEL[m], value: active.includes(m) })),
    channelsHeading: CHANNELS_HEADING,
    channels: channels.map((c) => ({
      id: c.id,
      line: channelLine(c),
      kindLabel: CHANNEL_KIND_LABEL[c.kind],
      isActive: c.isActive,
    })),
    emptyLine: CHANNELS_EMPTY,
    immutableNote: CHANNELS_IMMUTABLE_NOTE,
    inactiveBadge: CHANNEL_INACTIVE_BADGE,
    deactivateLabel: CHANNEL_DEACTIVATE_LABEL,
  };
}

/** What the add form holds. */
export interface ChannelDraft {
  kind: ChannelKind;
  label: string;
  proxyType: ProxyType;
  proxy: string;
  bankCode: string;
  accountNo: string;
  accountName: string;
}

/** POST /shop/payment-channels — coherent for its kind: only that kind's keys. */
export type ChannelCreateBody =
  | { kind: "promptpay"; label: string; promptpay_proxy: string; promptpay_proxy_type: ProxyType }
  | { kind: "bank_account"; label: string; bank_code: string; account_no: string; account_name: string };

export type ChannelCheck = { ok: true; body: ChannelCreateBody } | { ok: false; message: string };

/** The server's bounds (channels.py ChannelCreate). Declared once, used by the
 *  inputs' maxLength and by the check, so the two cannot drift. */
export const CHANNEL_MAX = { label: 100, proxy: 64, bankCode: 16, accountNo: 64, accountName: 200 } as const;

const NEED_LABEL = "ใส่ชื่อที่แสดงของบัญชี";
const NEED_PROXY = "ใส่หมายเลขพร้อมเพย์";
const NEED_BANK = "ใส่รหัสธนาคาร เลขที่บัญชี และชื่อบัญชีให้ครบ";
const TOO_LONG = "ข้อมูลยาวเกินกำหนด";

/**
 * The add form, refused before the request: non-blank after trimming, within the
 * server's bounds, and ONLY the keys of the chosen kind (the server refuses an
 * incoherent body 422 channel_incoherent; the edge words it first). Nothing is
 * reformatted — an account number is sent as typed, trimmed at the ends only.
 */
export function checkChannelDraft(d: ChannelDraft): ChannelCheck {
  const label = d.label.trim();
  if (label.length === 0) return { ok: false, message: NEED_LABEL };
  if (label.length > CHANNEL_MAX.label) return { ok: false, message: TOO_LONG };
  if (d.kind === "promptpay") {
    const proxy = d.proxy.trim();
    if (proxy.length === 0) return { ok: false, message: NEED_PROXY };
    if (proxy.length > CHANNEL_MAX.proxy) return { ok: false, message: TOO_LONG };
    return { ok: true, body: { kind: "promptpay", label, promptpay_proxy: proxy, promptpay_proxy_type: d.proxyType } };
  }
  const bankCode = d.bankCode.trim();
  const accountNo = d.accountNo.trim();
  const accountName = d.accountName.trim();
  if (bankCode.length === 0 || accountNo.length === 0 || accountName.length === 0) {
    return { ok: false, message: NEED_BANK };
  }
  if (
    bankCode.length > CHANNEL_MAX.bankCode ||
    accountNo.length > CHANNEL_MAX.accountNo ||
    accountName.length > CHANNEL_MAX.accountName
  ) {
    return { ok: false, message: TOO_LONG };
  }
  return {
    ok: true,
    body: { kind: "bank_account", label, bank_code: bankCode, account_no: accountNo, account_name: accountName },
  };
}
