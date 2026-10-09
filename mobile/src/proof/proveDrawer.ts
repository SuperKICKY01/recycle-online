/**
 * THE CASH-DRAWER CELLS (the shifts unit, commit 3) — run by `npm run prove:counter`
 * as its second half, not as a proof of their own.
 *
 * WHY AN EXTENSION OF prove:counter AND NOT prove:drawer (the owner's answer,
 * 2026-09-29). tools/prove_all.py hands RECYCLE_API_BASE only to a HAND-KEPT set,
 * MOBILE_LIVE (tools/prove_all.py:142), and tools/ is outside this commit's fence. A
 * new `prove:drawer` would be enumerated from package.json and then run its live half
 * with NO base URL — against the default 127.0.0.1:8000, which is the DEV database if
 * a dev server is up (writing shifts there) and nothing if not. prove:counter is
 * already in MOBILE_LIVE, and it is the screen these cells extend.
 *
 * HEADLESS (D1..D9, always run): the pure model in src/counter/drawerView.ts and the
 * one seam it adds to counterView.ts (channel_id), each rule of the brief as cells,
 * every negative with a positive sibling in the same run. R2 is ALSO read off
 * app/CounterScreen.tsx: CloseCountForm's body must name no figure, with
 * ShiftPanelCard as the control that the same scanner finds one.
 *
 * LIVE (L0..L10, need the server): through the real routes on the app's request
 * SHAPE — policy switched on and read, the pay-gate closed, a shift opened, a float_in
 * and an expense, a bill paid in cash and one by transfer naming a channel, the close
 * with a different count, expected_cash and variance read from the response and
 * RE-DERIVED here in decimal, the reason set once and a second refused, masking over
 * the server's two real answers for one channel, and every shift route refused to
 * staff. Everything it switched is restored in a finally, and it closes the shift it
 * opened if a failure left it open. It never closes a shift it did not open.
 *
 * Expectations are LITERAL Thai (STRUCTURE.md invariant 12): a proof that imported
 * the wording would agree with it by construction.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Decimal } from "decimal.js";

import {
  buildPaymentBody,
  checkPayment,
  defaultDraft,
  DRAWER_ONLY_NOTE,
  mayShowCounterEntry,
  mayShowQueue,
  paymentOutcome,
  type PaymentFetch,
  type PaymentMeta,
} from "../counter/counterView.js";
import {
  buildMovementBody,
  buildOpenShiftBody,
  CASH_KINDS,
  CASH_KIND_LABEL,
  channelLine,
  channelPicker,
  checkChannelDraft,
  checkCountedCash,
  checkMovementAmount,
  checkOpeningFloat,
  checkReason,
  closeForm,
  closeResult,
  counterPolicy,
  drawerOutcome,
  drawerSettingsScreen,
  isReasonFrozen,
  mayShowDrawerSettings,
  mayShowShiftPanel,
  offeredMethods,
  panelGate,
  payGate,
  readChannel,
  readChannels,
  readClosedShift,
  readOpenShift,
  readShopPolicy,
  shiftPanel,
  shiftState,
  UNKNOWN_POLICY,
  type CounterPolicy,
  type ShiftPanel,
  type ShiftState,
  type ShopChannel,
} from "../counter/drawerView.js";
import { may } from "../session/deviceRole.js";
import { grantsOf, STAFF_GRANTS } from "./proofGrants.js";
import { withClientVersion } from "../net/clientVersion.js";

export interface Tally {
  check: (name: string, cond: boolean, detail?: string) => void;
  header: (t: string) => void;
}

/* ------------------------------------------------------------------ fixtures -- */

const http = (status: number, code?: string, message?: string): PaymentFetch => ({
  kind: "http",
  status,
  body: code ? { detail: { kind: "x", code, message: message ?? "SERVER-PROSE ข้อความจากเซิร์ฟเวอร์" } } : {},
});

const policy = (shifts: boolean | null, methods: readonly string[] | null = ["cash", "transfer"]): CounterPolicy => ({
  branchId: "b0000000-0000-0000-0000-000000000001",
  separateCashier: true,
  shiftsEnabled: shifts,
  activeMethods: methods,
});

const SELF = "5e1f0000-0000-0000-0000-000000000001";
const OTHER = "0de40000-0000-0000-0000-000000000002";

function openShiftBody(withDrawer: boolean, expected = "1234.50", openedBy = SELF): Record<string, unknown> {
  return {
    id: "a1000000-0000-0000-0000-000000000001",
    branch_id: "b0000000-0000-0000-0000-000000000001",
    status: "open",
    opened_at: "2026-09-29T00:30:00.123456+00:00",
    opened_by: openedBy,
    opening_float: "100.00",
    closed_at: null,
    closed_by: null,
    counted_cash: null,
    expected_cash: null,
    variance: null,
    variance_reason: null,
    ...(withDrawer
      ? {
          drawer: {
            opening_float: "100.00",
            cash_in: "0.00",
            cash_out: "0.00",
            cash_payments: "0.00",
            // DELIBERATELY not the sum of the parts: a panel showing 1,234.50 used the
            // server's figure; one showing 100.00 computed its own (R4).
            expected_cash: expected,
          },
        }
      : {}),
  };
}

const openState = (withDrawer: boolean, expected?: string, by?: string): ShiftState => {
  const s = readOpenShift(openShiftBody(withDrawer, expected, by));
  return s === null ? { kind: "unknown", why: "server" } : { kind: "open", shift: s };
};

function panelText(p: ShiftPanel): string {
  if (p.kind === "message") return [p.badge, p.line].join(" ");
  if (p.kind === "closed") return [p.badge, p.gateLine ?? "", p.floatLabel, p.floatHint, p.openLabel].join(" ");
  return [
    p.badge,
    p.openedAt.label, p.openedAt.value,
    p.openedBy?.label ?? "", p.openedBy?.value ?? "",
    p.figure?.label ?? "", p.figure?.value ?? "",
    ...p.breakdown.flatMap((l) => [l.label, l.value]),
    p.movementLabel, p.closeLabel,
  ].join(" ");
}

/** No server diagnostic in a rendered sentence (the counter's BANNED list's shape). */
const BANNED: readonly string[] = [
  "{", "}", '"', "detail", "kind", "code", "http", "HTTP", "401", "403", "404", "409", "422", "424", "500",
  "shift_", "channel_", "branch_", "no_open", "SERVER-PROSE", "undefined", "null",
];
function leaks(s: string): string | null {
  for (const b of BANNED) if (s.includes(b)) return b;
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(s)) return "a uuid";
  return null;
}

/** Does `text` carry any run of FIVE consecutive characters of `identifier`? A masked
 *  render may carry the last four and nothing more (channels.py `_last_four`). */
function carriesMoreThanFour(text: string, identifier: string): string | null {
  for (let i = 0; i + 5 <= identifier.length; i += 1) {
    const run = identifier.slice(i, i + 5);
    if (text.includes(run)) return run;
  }
  return null;
}

/* ============================================================== D1 — R1 ====== */

function d1PayGate(t: Tally): void {
  t.header("D1 R1 the pay-gate — closes ONLY on shifts ON and a DEFINITE no-open-shift");
  const none: ShiftState = { kind: "none" };
  t.check("R1: shifts ON + no open shift → pay NOT offered (shift_first)",
    payGate(policy(true), none).kind === "shift_first");
  const g = payGate(policy(true), none);
  t.check("R1: the gate's line tells the cashier to open a shift first (literal Thai)",
    g.kind === "shift_first" && g.line === "ร้านนี้ใช้ระบบกะ — เปิดกะก่อน แล้วจึงรับชำระเงินได้");
  t.check("R1 sibling: shifts ON + an OPEN shift → pay offered", payGate(policy(true), openState(true)).kind === "pay");
  t.check("R1: shifts OFF + no shift → pay offered exactly as today", payGate(policy(false), none).kind === "pay");
  t.check("R1: shifts UNKNOWN (policy unread) + no shift → pay offered", payGate(UNKNOWN_POLICY, none).kind === "pay");
  t.check("R1: shifts ON + shift state UNKNOWN (offline) → pay offered (a failed read is not 'no shift')",
    payGate(policy(true), { kind: "unknown", why: "offline" }).kind === "pay");
  t.check("R1: shifts ON + caller NOT PERMITTED to read shifts → pay offered (fail open, at the site)",
    payGate(policy(true), { kind: "unknown", why: "not_permitted" }).kind === "pay");

  // The classification under the gate: only 404 + no_open_shift is "none".
  t.check("shiftState: 404 no_open_shift → none (the one definite answer)",
    shiftState(http(404, "no_open_shift")).kind === "none");
  t.check("shiftState: a 404 with NO code (a server without the route) → unknown, NOT none",
    shiftState({ kind: "http", status: 404, body: { detail: "Not Found" } }).kind === "unknown");
  t.check("shiftState: a 404 with another code → unknown", shiftState(http(404, "branch_not_found")).kind === "unknown");
  t.check("shiftState: 403 → unknown/not_permitted",
    (() => { const s = shiftState(http(403, "permission_required")); return s.kind === "unknown" && s.why === "not_permitted"; })());
  t.check("shiftState: unreachable → unknown/offline",
    (() => { const s = shiftState({ kind: "unreachable" }); return s.kind === "unknown" && s.why === "offline"; })());
  t.check("shiftState: 200 with a readable open shift → open", shiftState({ kind: "ok", body: openShiftBody(true) }).kind === "open");
  t.check("shiftState: 200 with a malformed body → unknown (never a guessed shift)",
    shiftState({ kind: "ok", body: { id: 5 } }).kind === "unknown");
  t.check("shiftState: 200 carrying a CLOSED shift → unknown (not a current-shift answer)",
    shiftState({ kind: "ok", body: { ...openShiftBody(true), status: "closed" } }).kind === "unknown");

  // The policy read under the gate.
  t.check("readShopPolicy: a body without the commit-2 keys reads them as UNKNOWN (null), not false",
    (() => { const p = readShopPolicy({ branch_id: "b", separate_cashier: true }); return p !== null && p.shiftsEnabled === null && p.activeMethods === null; })());
  t.check("readShopPolicy: shifts_enabled of the wrong type → the whole read refused",
    readShopPolicy({ branch_id: "b", separate_cashier: true, shifts_enabled: "yes", payment_methods: [] }) === null);
  t.check("counterPolicy: an unreachable read → UNKNOWN_POLICY", counterPolicy({ kind: "unreachable" }) === UNKNOWN_POLICY);
  t.check("counterPolicy sibling: a readable body → its values",
    counterPolicy({ kind: "ok", body: { branch_id: "b", separate_cashier: false, shifts_enabled: true, payment_methods: ["cash"] } }).shiftsEnabled === true);
}

/* ============================================================== D2 — R2 ====== */

/** The text spans of the top-level function components of a .tsx file. */
function componentSpans(src: string): Map<string, readonly [number, number]> {
  const heads = [...src.matchAll(/^(?:export )?function (\w+)\(/gm)];
  const spans = new Map<string, readonly [number, number]>();
  heads.forEach((m, i) => {
    const start = m.index ?? 0;
    const end = i + 1 < heads.length ? (heads[i + 1]?.index ?? src.length) : src.length;
    spans.set(m[1] ?? "", [start, end] as const);
  });
  return spans;
}

/** The identifiers through which a drawer figure could reach a render. */
const FIGURE_NEEDLE = /drawer|figure|Figure|expected|breakdown|panel|running/;

function d2BlindCount(t: Tally): void {
  t.header("D2 R2 the count is BLIND — no expected or running figure on the close form");
  // The fixture's figure is VALUE-distinct: 1,234.50 appears nowhere else.
  const admin = grantsOf("admin");
  const state = openState(true, "1234.50");
  const gate = payGate(policy(true), state);
  const panel = shiftPanel(state, gate, SELF);
  const panelTxt = panelText(panel);
  // POSITIVE CONTROL first: the scanner finds the figure on the PANEL render.
  t.check("control: the SAME scanner finds the running figure (1,234.50) on the panel render",
    panelTxt.includes("1,234.50") && panelTxt.includes("100.00"), panelTxt.slice(0, 80));
  t.check("control: the principal holds money.view_shop (the figure is visible to them on the panel)",
    may(admin, "money.view_shop"));
  const form = closeForm();
  const formTxt = [form.heading, ...form.lines, form.countedLabel, form.confirmLabel, form.cancelLabel].join(" ");
  t.check("R2: the close FORM carries neither the expected nor the running figure BY VALUE",
    !formTxt.includes("1,234.50") && !formTxt.includes("1234.50") && !formTxt.includes("100.00"), formTxt);
  t.check("R2: closeForm takes NO argument — there is no route by which a figure reaches its model",
    closeForm.length === 0);
  t.check("R2: the form's heading and instruction (literal Thai)",
    form.heading === "ปิดกะ — นับเงินในลิ้นชัก" &&
      form.lines.includes("ระบบจะแสดงยอดที่ควรมีหลังบันทึกยอดนับแล้ว"));

  // The render, read off the screen source.
  const src = readFileSync(join(process.cwd(), "app", "CounterScreen.tsx"), "utf8");
  const spans = componentSpans(src);
  const form$ = spans.get("CloseCountForm");
  const panel$ = spans.get("ShiftPanelCard");
  t.check("control: both components exist in app/CounterScreen.tsx", form$ !== undefined && panel$ !== undefined);
  if (form$ && panel$) {
    const formSrc = src.slice(form$[0], form$[1]);
    const panelSrc = src.slice(panel$[0], panel$[1]);
    const hitPanel = panelSrc.match(FIGURE_NEEDLE);
    t.check("control: the SAME source scanner finds a figure identifier in ShiftPanelCard",
      hitPanel !== null && panelSrc.includes("panel.figure") && panelSrc.includes("<Figure"),
      hitPanel?.[0] ?? "none");
    const hitForm = formSrc.match(FIGURE_NEEDLE);
    t.check("R2: CloseCountForm's source names NO drawer, figure, expected or panel value",
      hitForm === null, hitForm === null ? `${String(formSrc.length)} chars clean` : `found "${hitForm[0]}"`);
    t.check("R2: the count form is rendered from closeForm() and nothing else",
      /<CloseCountForm\s+form=\{closeForm\(\)\}/.test(src));
    t.check("R2: the count mode REPLACES the panel before the figure is drawn (source order)",
      panelSrc.indexOf('mode === "count"') >= 0 &&
        panelSrc.indexOf('mode === "count"') < panelSrc.indexOf("panel.figure !== null"));
  }
  // After the close, from the RESPONSE: the figure appears for the first time.
  const closed = readClosedShift({ id: "a1", status: "closed", counted_cash: "1230.00", expected_cash: "1234.50", variance: "-4.50", variance_reason: null });
  const r = closed === null ? null : closeResult(closed);
  t.check("R2 sibling: the RESULT (after commit) shows the expected figure and the variance",
    r !== null && r.expected.value === "1,234.50" && r.variance.value === "4.50" && r.counted.value === "1,230.00");
}

/* ============================================================== D3 — R3 ====== */

function d3Reason(t: Tally): void {
  t.header("D3 R3 the reason — asked once on a non-zero variance, never on zero, shown if set");
  const mk = (variance: string, reason: string | null = null) =>
    readClosedShift({ id: "a1", status: "closed", counted_cash: "10.00", expected_cash: "10.00", variance, variance_reason: reason });
  const short = mk("-5.00");
  const over = mk("3.25");
  const exact = mk("0.00");
  const set = mk("-5.00", "นับเงินทอนผิด");
  t.check("control: the four fixtures parse", short !== null && over !== null && exact !== null && set !== null);
  if (!short || !over || !exact || !set) return;
  const rs = closeResult(short);
  t.check("R3: a SHORT variance with no reason ASKS", rs.reason.kind === "ask");
  t.check("R3: the prompt says it can be given once (literal Thai)",
    rs.reason.kind === "ask" && rs.reason.label === "เหตุผลของส่วนต่าง" && rs.reason.hint === "ระบุได้ครั้งเดียว บันทึกแล้วแก้ไขไม่ได้");
  t.check("R3: short is เงินขาด, shown as a magnitude (5.00)", rs.word === "เงินขาด" && rs.variance.value === "5.00" && rs.tone === "short");
  t.check("R3: an OVER variance asks too, and is เงินเกิน", closeResult(over).reason.kind === "ask" && closeResult(over).word === "เงินเกิน");
  t.check("R3: a ZERO variance asks NOTHING", closeResult(exact).reason.kind === "none" && closeResult(exact).word === "ตรงกับระบบ");
  const rset = closeResult(set);
  t.check("R3: a reason already set is SHOWN, not editable", rset.reason.kind === "shown" && rset.reason.text === "นับเงินทอนผิด");
  t.check("R3: a reason refused as frozen stops ASKING", closeResult(short, true).reason.kind === "frozen");
  t.check("R3: a blank reason is refused before the request", checkReason("   ").ok === false);
  t.check("R3 sibling: a reason is trimmed and accepted", (() => { const c = checkReason("  นับผิด  "); return c.ok && c.value === "นับผิด"; })());
  t.check("R3: a reason over the server's 500 bound is refused", checkReason("ก".repeat(501)).ok === false);
  t.check("R3 sibling: exactly 500 is accepted", checkReason("ก".repeat(500)).ok === true);
  t.check("isReasonFrozen: 409 shift_reason_frozen → true", isReasonFrozen(http(409, "shift_reason_frozen")));
  t.check("isReasonFrozen sibling: 409 shift_closed → false", !isReasonFrozen(http(409, "shift_closed")));
}

/* ============================================================== D4 — R4 ====== */

function d4RunningFigure(t: Tally): void {
  t.header("D4 R4 the running figure — shown only when the server sent it, never computed");
  const withFig = shiftPanel(openState(true, "1234.50"), { kind: "pay" }, SELF);
  t.check("R4: with the server's drawer, the panel shows THAT figure (1,234.50 — not the parts' sum 100.00)",
    withFig.kind === "open" && withFig.figure?.value === "1,234.50");
  t.check("R4: its label (literal Thai)", withFig.kind === "open" && withFig.figure?.label === "เงินในลิ้นชักตามระบบ");
  t.check("R4: the breakdown is the server's four parts",
    withFig.kind === "open" && withFig.breakdown.map((l) => l.label).join("|") === "เงินตั้งต้น|เงินเข้า|เงินออก|จ่ายเงินสด");
  const noFig = shiftPanel(openState(false), { kind: "pay" }, SELF);
  t.check("R4: WITHOUT a drawer key the panel shows NO figure (the float is known and is not turned into one)",
    noFig.kind === "open" && noFig.figure === null && noFig.breakdown.length === 0);
  t.check("R4: opened_at renders in SHOP time (00:30Z → 07:30 Bangkok, พ.ศ.)",
    withFig.kind === "open" && withFig.openedAt.value === "29/09/2569 07:30", withFig.kind === "open" ? withFig.openedAt.value : "");
  t.check("by whom: the session's own id reads คุณ", withFig.kind === "open" && withFig.openedBy?.value === "คุณ");
  const other = shiftPanel(openState(true, "1.00", OTHER), { kind: "pay" }, SELF);
  t.check("by whom sibling: another id reads บัญชีอื่น (no invented name)", other.kind === "open" && other.openedBy?.value === "บัญชีอื่น");
  t.check("by whom: an unreadable session id omits the row", (() => { const p = shiftPanel(openState(true), { kind: "pay" }, null); return p.kind === "open" && p.openedBy === null; })());
  const closedP = shiftPanel({ kind: "none" }, payGate(policy(true), { kind: "none" }), SELF);
  t.check("closed panel: offers the float and the open action; carries the gate line when gated",
    closedP.kind === "closed" && closedP.openLabel === "เปิดกะ" && closedP.gateLine !== null);
  const closedUngated = shiftPanel({ kind: "none" }, { kind: "pay" }, SELF);
  t.check("closed panel sibling: no gate line when shifts are not on", closedUngated.kind === "closed" && closedUngated.gateLine === null);

  // The panel gate (2(e)): shifts.manage.
  const admin = grantsOf("admin");
  t.check("2(e): a STAFF principal (no shifts.manage) is NOT shown the panel",
    !mayShowShiftPanel(STAFF_GRANTS, policy(true), { kind: "none" }));
  t.check("2(e) sibling: ADMIN with shifts ON is shown it", mayShowShiftPanel(admin, policy(true), { kind: "none" }));
  t.check("ADMIN with shifts OFF and no shift is NOT shown it", !mayShowShiftPanel(admin, policy(false), { kind: "none" }));
  t.check("ADMIN with shifts OFF but a shift still OPEN IS shown it (so it can be closed)",
    mayShowShiftPanel(admin, policy(false), openState(true)));
  t.check("an ABSENT grant set is shown it (fail open)", mayShowShiftPanel(null, policy(true), { kind: "none" }));
  t.check("the phone's Permission union names shifts.manage (admin holds it, staff does not)",
    may(admin, "shifts.manage") && !may(STAFF_GRANTS, "shifts.manage"));
}

/* ============================================================== D5 — R5 ====== */

function d5Movements(t: Tally): void {
  t.header("D5 R5 cash movements — four kinds, a positive two-decimal amount");
  t.check("R5: exactly the server's four kinds",
    [...CASH_KINDS].sort().join(",") === "deposit_to_bank,expense,float_in,float_out");
  const labels = CASH_KINDS.map((k) => CASH_KIND_LABEL[k]);
  t.check("R5: each kind has its own Thai label (four distinct)", new Set(labels).size === 4);
  t.check("R5: the labels (literal Thai)",
    CASH_KIND_LABEL.float_in === "เติมเงินเข้าลิ้นชัก" && CASH_KIND_LABEL.float_out === "นำเงินออกจากลิ้นชัก" &&
      CASH_KIND_LABEL.expense === "จ่ายค่าใช้จ่าย" && CASH_KIND_LABEL.deposit_to_bank === "นำเงินไปฝากธนาคาร");
  for (const bad of ["0", "0.00", "-5", "1.234", "abc", "", "1,000.00"]) {
    t.check(`R5: amount "${bad}" is refused before the request`, checkMovementAmount(bad).ok === false);
  }
  t.check('R5 sibling: "10" is accepted and normalised to "10.00"', (() => { const c = checkMovementAmount("10"); return c.ok && c.value === "10.00"; })());
  t.check('R5 sibling: "0.01" is accepted', checkMovementAmount("0.01").ok === true);
  t.check('the FLOAT accepts "0" (an empty drawer is a real start; server ge=0)', checkOpeningFloat("0").ok === true);
  t.check('the float refuses "1.234"', checkOpeningFloat("1.234").ok === false);
  t.check('the COUNT accepts "0" and refuses "-1"', checkCountedCash("0").ok === true && checkCountedCash("-1").ok === false);
  let n = 0;
  const ids = { newId: () => `id-${String((n += 1))}` };
  const clock = { now: () => new Date("2026-09-29T03:00:00.000Z"), sleep: () => Promise.resolve() };
  const body = buildMovementBody({ clock, ids }, "expense", "30.00", "   ");
  t.check("movement body: id and idempotency_key minted distinctly", body.id !== body.idempotency_key);
  t.check("movement body: a blank note is OMITTED, never sent as \"\"", !("note" in body));
  const withNote = buildMovementBody({ clock, ids }, "float_in", "100.00", "  เงินทอนจากเจ้าของ  ");
  t.check("movement body sibling: a note is trimmed and sent", withNote.note === "เงินทอนจากเจ้าของ");
  const open = buildOpenShiftBody(ids, "500.00");
  t.check("open body: the float is the model's string, the id minted once", open.opening_float === "500.00" && typeof open.id === "string");
}

/* ============================================================== D6 — R6 ====== */

const FULL_ID = "1234567890";

function d6Channels(t: Tally): void {
  t.header("D6 R6 the channel picker — non-cash, optional; and the masked display");
  const masked = readChannel({ id: "c1", branch_id: null, kind: "bank_account", label: "กสิกร หลัก", bank_code: "KBANK", account_name: "ร้าน", is_active: true, identifier_last4: "7890" });
  const full = readChannel({ id: "c1", branch_id: null, kind: "bank_account", label: "กสิกร หลัก", bank_code: "KBANK", account_name: "ร้าน", is_active: true, identifier_last4: "7890", promptpay_proxy: null, promptpay_proxy_type: null, account_no: FULL_ID, created_at: "2026-09-29T00:00:00+00:00" });
  const inactive = readChannel({ id: "c2", branch_id: null, kind: "promptpay", label: "เก่า", bank_code: null, account_name: null, is_active: false, identifier_last4: "1111" });
  t.check("control: the three channel fixtures parse", masked !== null && full !== null && inactive !== null);
  if (!masked || !full || !inactive) return;
  const list: ShopChannel[] = [masked, inactive];
  t.check("R6: CASH never shows the picker, even with an active channel", !channelPicker("cash", list).show);
  t.check("R6 sibling: TRANSFER with an active channel shows it", channelPicker("transfer", list).show);
  t.check("R6: only ACTIVE channels are options", channelPicker("transfer", list).options.map((o) => o.id).join() === "c1");
  t.check("R6: transfer with only an INACTIVE channel shows no picker", !channelPicker("transfer", [inactive]).show);
  t.check("R6: an unread channel list (null) shows no picker", !channelPicker("transfer", null).show);
  t.check("R6: 'none' is offered and labelled (literal Thai)", channelPicker("transfer", list).noneLabel === "ไม่ระบุ");

  // Masking, by VALUE: a masked render carries no 5-character run of the identifier.
  const fullTxt = channelLine(full);
  const maskedTxt = channelLine(masked);
  t.check("control: the SAME scanner finds the full identifier in the settings (full) render",
    carriesMoreThanFour(fullTxt, FULL_ID) !== null, fullTxt);
  t.check("MASK: the masked render carries no more than four characters of the identifier",
    carriesMoreThanFour(maskedTxt, FULL_ID) === null, maskedTxt);
  t.check("MASK sibling: it DOES carry the last four", maskedTxt.includes("7890"));
  t.check("MASK: the masked parse holds no identifier at all", masked.identifier === null);
  const tiny = readChannel({ id: "c3", branch_id: null, kind: "promptpay", label: "สั้น", bank_code: null, account_name: null, is_active: true, identifier_last4: null });
  t.check("MASK: an identifier of four or fewer (last4 null) renders the label alone", tiny !== null && channelLine(tiny) === "สั้น");

  // The seam into counterView: channel_id on the body.
  const meta: PaymentMeta = { clock: { now: () => new Date("2026-09-29T03:00:00.000Z"), sleep: () => Promise.resolve() }, ids: { newId: () => randomUUID() } };
  const cash = checkPayment({ ...defaultDraft("s", "cash", [{ id: "b1", remaining: "10.00" }]), channel_id: "c1" });
  t.check("R6: a CASH plan DROPS a carried channel", cash.ok && cash.plan.channel_id === null);
  t.check("R6: and the cash body carries no channel_id key", cash.ok && !("channel_id" in buildPaymentBody(meta, cash.plan)));
  const xfer = checkPayment({ ...defaultDraft("s", "transfer", [{ id: "b1", remaining: "10.00" }]), channel_id: "c1" });
  t.check("R6 sibling: a TRANSFER plan with a channel sends it", xfer.ok && buildPaymentBody(meta, xfer.plan).channel_id === "c1");
  const xferNone = checkPayment(defaultDraft("s", "transfer", [{ id: "b1", remaining: "10.00" }]));
  t.check("R6: a transfer with NO channel is valid and sends no key (optional)",
    xferNone.ok && !("channel_id" in buildPaymentBody(meta, xferNone.plan)));
  t.check("readChannels is FATAL on a malformed row", readChannels({ channels: [{ id: 1 }] }) === null);
}

/* ============================================================== D7 — R7 ====== */

function d7Methods(t: Tally): void {
  t.header("D7 R7 the methods — the branch's ACTIVE ones; fail OPEN only on an unread policy");
  t.check("R7: an UNKNOWN policy offers today's pair (fail open)", offeredMethods(UNKNOWN_POLICY).join() === "cash,transfer");
  t.check("R7: ['cash'] (every born-with branch) offers cash ONLY — transfer hidden",
    offeredMethods(policy(true, ["cash"])).join() === "cash");
  t.check("R7 sibling: ['cash','transfer'] offers both", offeredMethods(policy(true, ["cash", "transfer"])).join() === "cash,transfer");
  t.check("R7: ['transfer'] (cash switched off) offers transfer only", offeredMethods(policy(true, ["transfer"])).join() === "transfer");
  t.check("R7: [] offers NOTHING (a read policy is exact)", offeredMethods(policy(true, [])).length === 0);
  t.check("R7: ['promptpay'] offers nothing this build can take at the counter", offeredMethods(policy(true, ["promptpay"])).length === 0);
  t.check("R7: a failed policy READ is not an empty method set",
    offeredMethods(counterPolicy({ kind: "http", status: 500, body: null })).length === 2);
}

/* ============================================================== D8 — R8 ====== */

function d8Wording(t: Tally): void {
  t.header("D8 R8 refusals worded from (status, code); unknown → the generic; never the server's message");
  const cases: readonly [PaymentFetch, "shift" | "settings", string][] = [
    [http(409, "shift_already_open"), "shift", "สาขานี้มีกะที่เปิดอยู่แล้ว — โหลดใหม่เพื่อดูกะนั้น"],
    [http(409, "shift_closed"), "shift", "กะนี้ปิดไปแล้ว — โหลดใหม่"],
    [http(404, "no_open_shift"), "shift", "ไม่พบกะที่เปิดอยู่ — โหลดใหม่"],
    [http(404, "shift_not_found"), "shift", "ไม่พบกะที่เปิดอยู่ — โหลดใหม่"],
    [http(409, "shift_open"), "shift", "ยังไม่ได้ปิดกะ จึงยังระบุเหตุผลไม่ได้"],
    [http(409, "shift_reason_frozen"), "shift", "เหตุผลของกะนี้บันทึกไว้แล้ว แก้ไขไม่ได้"],
    [http(422, "channel_incoherent"), "settings", "ข้อมูลบัญชีไม่ครบตามประเภทที่เลือก"],
    [http(404, "channel_not_found"), "settings", "ไม่พบบัญชีนี้ — โหลดใหม่"],
    [http(404, "branch_not_found"), "settings", "ไม่พบสาขานี้ — โหลดใหม่"],
    [http(424, "branch_unresolved"), "shift", "ยังระบุสาขาของบัญชีนี้ไม่ได้ — ให้เจ้าของร้านตรวจสาขาของบัญชี"],
    [http(403, "permission_required"), "shift", "บัญชีนี้ไม่มีสิทธิ์จัดการกะและลิ้นชัก ต้องให้เจ้าของร้านมอบสิทธิ์"],
    [http(403, "permission_required"), "settings", "บัญชีนี้ไม่มีสิทธิ์แก้การตั้งค่าร้าน"],
  ];
  const generic = "ระบบยังทำรายการนี้ไม่ได้ในตอนนี้ — ลองอีกครั้ง";
  for (const [f, subj, want] of cases) {
    const o = drawerOutcome(f, subj);
    const code = f.kind === "http" ? String(codeOf(f.body)) : "";
    t.check(`R8: ${code} (${subj}) is worded by its code`, o.kind === "refused" && o.message === want,
      o.kind === "refused" ? o.message : o.kind);
    t.check(`R8 sibling: ${code} is NOT the generic sentence`, o.kind === "refused" && o.message !== generic);
  }
  const unknown = drawerOutcome(http(409, "some_code_from_a_later_server", "ข้อความใหม่จากเซิร์ฟเวอร์"), "shift");
  t.check("R8: a code this build does not know gets the GENERIC wording", unknown.kind === "refused" && unknown.message === generic);
  t.check("R8: …and never the server's message", unknown.kind === "refused" && !unknown.message.includes("ข้อความใหม่จากเซิร์ฟเวอร์"));
  t.check("R8: a 422 with no code (pydantic) gets the generic", (() => { const o = drawerOutcome({ kind: "http", status: 422, body: { detail: [{ loc: ["x"] }] } }, "settings"); return o.kind === "refused" && o.message === generic; })());
  t.check("R8: the drawer's generic is NOT the counter's payment sentence (a wrong instruction on a shift route)",
    (() => { const p = paymentOutcome({ kind: "http", status: 500, body: null }); return p.kind === "refused" && p.message !== generic; })());
  t.check("R8: 401 ends the session", drawerOutcome(http(401), "shift").kind === "session");
  t.check("R8: unreachable is the counter's online-only sentence",
    (() => { const o = drawerOutcome({ kind: "unreachable" }, "shift"); return o.kind === "refused" && o.message.includes("เชื่อมต่อ"); })());
  t.check("R8: a refusal that says the state moved RELOADS (shift_already_open)",
    (() => { const o = drawerOutcome(http(409, "shift_already_open"), "shift"); return o.kind === "refused" && o.reload; })());
  t.check("R8 sibling: shift_reason_frozen does not reload", (() => { const o = drawerOutcome(http(409, "shift_reason_frozen"), "shift"); return o.kind === "refused" && !o.reload; })());
  const all = [...cases.map(([f, s]) => drawerOutcome(f, s)), unknown];
  const leaked = all.map((o) => (o.kind === "refused" ? leaks(o.message) : null)).find((l) => l !== null);
  t.check("R8: NO refusal leaks a diagnostic (json/code/status/uuid/server prose)", leaked === undefined, leaked ?? "");
  t.check("control: the leak scanner fires on a planted server body", leaks('{"detail":{"code":"shift_closed"}}') !== null);
}

function codeOf(body: unknown): string | null {
  if (typeof body === "object" && body !== null && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "object" && d !== null && "code" in d) {
      const c = (d as { code: unknown }).code;
      return typeof c === "string" ? c : null;
    }
  }
  return null;
}

/* ====================================================== D9 — settings group == */

function d9Settings(t: Tally): void {
  t.header("D9 the settings group — shop.settings.write only; a message unless both reads land");
  t.check("2(d): STAFF is not shown the group", !mayShowDrawerSettings(STAFF_GRANTS));
  t.check("2(d) sibling: ADMIN is shown it", mayShowDrawerSettings(grantsOf("admin")));
  const pol: PaymentFetch = { kind: "ok", body: { branch_id: "b1", separate_cashier: false, shifts_enabled: false, payment_methods: ["cash"] } };
  const ch: PaymentFetch = { kind: "ok", body: { channels: [] } };
  const s = drawerSettingsScreen(pol, ch);
  t.check("both reads land → the form", s !== "session" && s.kind === "form");
  if (s !== "session" && s.kind === "form") {
    t.check("the methods switches: cash ON, transfer OFF (from ['cash'])",
      s.methods.map((m) => `${m.method}=${String(m.value)}`).join() === "cash=true,transfer=false");
    t.check("the shifts switch reads the server's value (off)", s.shifts.value === false && s.shifts.label === "ใช้ระบบกะและลิ้นชักเงินสด");
    t.check("the immutability note is there, not an edit control",
      s.immutableNote.startsWith("หมายเลขบัญชีและพร้อมเพย์แก้ไขไม่ได้หลังบันทึก"));
  }
  const failed = drawerSettingsScreen(pol, { kind: "unreachable" });
  t.check("a failed channel read → a MESSAGE, never a half form", failed !== "session" && failed.kind === "message");
  const noBranch = drawerSettingsScreen({ kind: "ok", body: { branch_id: null, separate_cashier: null, shifts_enabled: null, payment_methods: null } }, ch);
  t.check("no single branch → a message (no switch that writes nowhere)", noBranch !== "session" && noBranch.kind === "message");
  t.check("401 → session", drawerSettingsScreen(http(401), ch) === "session");
  const pp = checkChannelDraft({ kind: "promptpay", label: " ร้าน ", proxyType: "phone", proxy: "0812345678", bankCode: "KBANK", accountNo: "9", accountName: "x" });
  t.check("add promptpay: coherent body — no bank keys even when typed",
    pp.ok && pp.body.kind === "promptpay" && !("bank_code" in pp.body) && !("account_no" in pp.body) && pp.body.label === "ร้าน");
  const bank = checkChannelDraft({ kind: "bank_account", label: "หลัก", proxyType: "phone", proxy: "0812345678", bankCode: "KBANK", accountNo: "123", accountName: "ร้าน" });
  t.check("add bank: coherent body — no proxy keys", bank.ok && bank.body.kind === "bank_account" && !("promptpay_proxy" in bank.body));
  t.check("add: a blank label is refused", checkChannelDraft({ kind: "promptpay", label: " ", proxyType: "phone", proxy: "1", bankCode: "", accountNo: "", accountName: "" }).ok === false);
  t.check("add: a bank channel missing its account name is refused", checkChannelDraft({ kind: "bank_account", label: "x", proxyType: "phone", proxy: "", bankCode: "K", accountNo: "1", accountName: " " }).ok === false);
}

/* ===================================== A3 — the entry: counter OR drawer branch == */

/**
 * The closing turn's entry rule (ADVISOR-DECIDED 2026-09-30): the entry shows when
 * (a) separate_cashier is not off AND payments.record, OR (b) shifts_enabled is not
 * off AND shifts.manage; inside, the shift panel follows (b) and the queue follows (a).
 * The expectations are a LITERAL table typed by hand — computing them from the rule
 * would agree with the code by construction.
 */
function a3EntryMatrix(t: Tally): void {
  t.header("A3 the counter entry — the counter branch OR the drawer branch; panel and queue inside");
  const principals: Record<string, ReadonlySet<string>> = {
    both: grantsOf("admin") as ReadonlySet<string>,
    payOnly: new Set(["payments.record"]),
    shiftOnly: new Set(["shifts.manage"]),
    none: STAFF_GRANTS,
  };
  // [separate_cashier, shifts_enabled, principal, entry, panel, queue]
  const TABLE: readonly [boolean, boolean, string, boolean, boolean, boolean][] = [
    [true, true, "both", true, true, true],
    [true, true, "payOnly", true, false, true],
    [true, true, "shiftOnly", true, true, false],
    [true, true, "none", false, false, false],
    [true, false, "both", true, false, true],
    [true, false, "payOnly", true, false, true],
    [true, false, "shiftOnly", false, false, false],
    [true, false, "none", false, false, false],
    [false, true, "both", true, true, false],
    [false, true, "payOnly", false, false, false],
    [false, true, "shiftOnly", true, true, false],
    [false, true, "none", false, false, false],
    [false, false, "both", false, false, false],
    [false, false, "payOnly", false, false, false],
    [false, false, "shiftOnly", false, false, false],
    [false, false, "none", false, false, false],
  ];
  for (const [sc, se, who, wantEntry, wantPanel, wantQueue] of TABLE) {
    const g = principals[who] ?? null;
    const pol: CounterPolicy = { ...policy(se), separateCashier: sc };
    const tag = `cashier=${sc ? "on" : "off"} shifts=${se ? "on" : "off"} ${who}`;
    t.check(`A3 ${tag}: entry ${wantEntry ? "SHOWN" : "hidden"}`, mayShowCounterEntry(g, sc, se) === wantEntry);
    t.check(`A3 ${tag}: shift panel ${wantPanel ? "SHOWN" : "hidden"}`,
      mayShowShiftPanel(g, pol, { kind: "none" }) === wantPanel);
    t.check(`A3 ${tag}: queue ${wantQueue ? "SHOWN" : "hidden"}`, mayShowQueue(g, sc) === wantQueue);
  }
  // The drawer branch's fail-open: an UNKNOWN shifts_enabled (not in the device cache).
  t.check("A3 cashier=off shifts=UNKNOWN both: entry SHOWN (fail open, reasoning at the gate)",
    mayShowCounterEntry(principals.both ?? null, false, null) === true);
  t.check("A3 cashier=off shifts=UNKNOWN payOnly: entry hidden (the drawer branch needs shifts.manage)",
    mayShowCounterEntry(principals.payOnly ?? null, false, null) === false);
  t.check("A3 cashier=off shifts=UNKNOWN none: entry hidden", mayShowCounterEntry(STAFF_GRANTS, false, null) === false);
  // With no queue there is no pay action to gate: the panel must not claim one.
  const gated = payGate(policy(true), { kind: "none" });
  const noQueuePanel = shiftPanel({ kind: "none" }, panelGate(gated, false), SELF);
  const queuePanel = shiftPanel({ kind: "none" }, panelGate(gated, true), SELF);
  t.check("A3 no queue: the closed panel carries NO 'open a shift, then pay' line",
    noQueuePanel.kind === "closed" && noQueuePanel.gateLine === null);
  t.check("A3 sibling: WITH the queue the same state carries it",
    queuePanel.kind === "closed" && queuePanel.gateLine === "ร้านนี้ใช้ระบบกะ — เปิดกะก่อน แล้วจึงรับชำระเงินได้");
  // The drawer-only page reads as a drawer page, not as an empty counter.
  t.check("A3 the drawer-only note (literal Thai)",
    DRAWER_ONLY_NOTE === "ร้านนี้จ่ายเงินตอนบันทึกบิลที่ลานชั่ง — หน้านี้ใช้สำหรับกะและลิ้นชักเงินสด");
  const src = readFileSync(join(process.cwd(), "app", "CounterScreen.tsx"), "utf8");
  const start = src.indexOf("if (queue === null) {");
  const branch = start >= 0 ? src.slice(start, src.indexOf("if (paying !== null)", start)) : "";
  t.check("A3 the no-queue branch renders the note and the drawer",
    branch.includes("DRAWER_ONLY_NOTE") && branch.includes("<DrawerSection"));
  t.check("A3 …and never the empty-queue sentence (it would claim a queue exists and is empty)",
    branch.length > 0 && !branch.includes("ไม่มีบิลค้างจ่าย"));
}

export function drawerHeadless(t: Tally): void {
  a3EntryMatrix(t);
  d1PayGate(t);
  d2BlindCount(t);
  d3Reason(t);
  d4RunningFigure(t);
  d5Movements(t);
  d6Channels(t);
  d7Methods(t);
  d8Wording(t);
  d9Settings(t);
}

/* ================================================================ LIVE ======= */

const API = process.env.RECYCLE_API_BASE ?? "http://127.0.0.1:8000";
const TENANT_A = "11111111-1111-1111-1111-111111111111";
const SELLER_A = "aaaa0000-0000-0000-0000-0000000000a4";
const PRODUCT_A = "aaaa0000-0000-0000-0000-0000000000a3";
const RUN = Math.random().toString(36).slice(2, 8);
const apiFetch = withClientVersion(globalThis.fetch.bind(globalThis));

async function login(username: string, password: string): Promise<string | null> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenant_id: TENANT_A, username, password }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { access_token?: string }).access_token ?? null;
}

async function call(token: string, method: string, path: string, body?: unknown): Promise<PaymentFetch> {
  let res: Response;
  try {
    res = await apiFetch(`${API}${path}`, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    return { kind: "unreachable" };
  }
  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return res.ok ? { kind: "ok", body: parsed } : { kind: "http", status: res.status, body: parsed };
}

const statusOf = (f: PaymentFetch): string => (f.kind === "http" ? String(f.status) : f.kind);
const serverMessage = (f: PaymentFetch): string | null => {
  if (f.kind !== "http" || typeof f.body !== "object" || f.body === null || !("detail" in f.body)) return null;
  const d = (f.body as { detail: unknown }).detail;
  return typeof d === "object" && d !== null && "message" in d && typeof (d as { message: unknown }).message === "string"
    ? (d as { message: string }).message
    : null;
};

async function createBill(token: string, unit: string): Promise<string | null> {
  const id = randomUUID();
  const r = await call(token, "POST", "/bills", {
    id,
    seller_id: SELLER_A,
    vehicle_no: `71-${RUN}`,
    device_created_at: new Date().toISOString(),
    idempotency_key: `drawer-${RUN}-${id.slice(0, 8)}`,
    items: [{ id: randomUUID(), product_id: PRODUCT_A, line_no: 1, gross_weight: "1.000", tare_weight: "0.000", net_weight: "1.000", unit_price: unit }],
  });
  return r.kind === "ok" ? id : null;
}

export async function drawerLive(t: Tally): Promise<void> {
  t.header("L the REAL server: shifts on → gate closed → open → in/out → pay → blind close → reason once");
  const admin = await login("admin", "tenantA-pw-123");
  const staff = await login("staff", "tenantA-staff-789");
  t.check("L0: the seeded tenant-A admin and staff sign in", admin !== null && staff !== null, `api=${API}`);
  if (admin === null || staff === null) throw new Error(`login failed at ${API}`);

  const pol0 = counterPolicy(await call(admin, "GET", "/shop/policy"));
  const branchId = pol0.branchId;
  t.check("L0: GET /shop/policy names the branch and the commit-2 keys (live)",
    branchId !== null && pol0.shiftsEnabled !== null && pol0.activeMethods !== null);
  if (branchId === null || pol0.shiftsEnabled === null || pol0.activeMethods === null) throw new Error("policy unreadable");
  const entry = { shifts: pol0.shiftsEnabled, cashier: pol0.separateCashier, transfer: pol0.activeMethods.includes("transfer") };

  // PRECONDITION: no shift open on the branch. A shift open here is someone's drawer;
  // this proof never closes a shift it did not open (the lesson's SKIP-not-pass rule).
  const pre = shiftState(await call(admin, "GET", "/shifts/current"));
  t.check("L0: PRECONDITION — no shift is open on the branch at entry (a proof never closes a drawer it did not open)",
    pre.kind === "none", pre.kind === "open" ? `shift ${pre.shift.id} is OPEN — not touched` : pre.kind);
  if (pre.kind !== "none") return;

  let shiftId: string | null = null;
  let closed = false;
  let channelId: string | null = null;
  try {
    // L1: shifts ON, read back, the gate closes on the REAL answers.
    const p1 = await call(admin, "PATCH", `/branches/${branchId}`, { shifts_enabled: true, separate_cashier: true });
    t.check("L1: PATCH /branches turns shifts_enabled (and separate_cashier) ON", p1.kind === "ok", statusOf(p1));
    const pol1 = counterPolicy(await call(admin, "GET", "/shop/policy"));
    t.check("L1: GET /shop/policy now reads shifts_enabled = true", pol1.shiftsEnabled === true);
    const s1 = shiftState(await call(admin, "GET", "/shifts/current"));
    t.check("L1: R1 — over the server's real answers the pay-gate is CLOSED", payGate(pol1, s1).kind === "shift_first");

    // L2: open a shift through the app's own body builder.
    const openBody = buildOpenShiftBody({ newId: () => randomUUID() }, "500.00");
    const o = await call(admin, "POST", "/shifts", openBody);
    t.check("L2: POST /shifts opens (201)", o.kind === "ok", statusOf(o));
    if (o.kind === "ok") shiftId = openBody.id;
    const s2 = shiftState(await call(admin, "GET", "/shifts/current"));
    t.check("L2: the pay-gate OPENS once the shift is open", payGate(pol1, s2).kind === "pay");
    const again = await call(admin, "POST", "/shifts", buildOpenShiftBody({ newId: () => randomUUID() }, "1.00"));
    const againOut = drawerOutcome(again, "shift");
    t.check("L2: a SECOND open is refused 409 and worded (shift_already_open), never the server's prose",
      again.kind === "http" && again.status === 409 && againOut.kind === "refused" &&
        againOut.message === "สาขานี้มีกะที่เปิดอยู่แล้ว — โหลดใหม่เพื่อดูกะนั้น" &&
        (serverMessage(again) === null || !againOut.message.includes(serverMessage(again) ?? "")),
      statusOf(again));

    // L3: a float_in and an expense; the replay of a key is the same movement.
    const clock = { now: () => new Date(), sleep: () => Promise.resolve() };
    const ids = { newId: () => randomUUID() };
    const fin = buildMovementBody({ clock, ids }, "float_in", "100.00", "proof");
    const r1 = await call(admin, "POST", "/cash-movements", fin);
    const r1b = await call(admin, "POST", "/cash-movements", fin);
    const exp = await call(admin, "POST", "/cash-movements", buildMovementBody({ clock, ids }, "expense", "30.00", ""));
    t.check("L3: a float_in (100.00) and an expense (30.00) record (201)", r1.kind === "ok" && exp.kind === "ok", `${statusOf(r1)} ${statusOf(exp)}`);
    t.check("L3: replaying the float_in's key returns the SAME movement (idempotent)",
      r1b.kind === "ok" && (r1b.body as { id?: string }).id === fin.id);

    // L4: pay a bill in CASH through the app's own plan and body.
    const bCash = await createBill(admin, "40.00");
    const bXfer = await createBill(admin, "25.00");
    t.check("L4: two bills created unpaid (separate_cashier on)", bCash !== null && bXfer !== null);
    if (bCash === null || bXfer === null) throw new Error("bill create failed");
    const meta: PaymentMeta = { clock, ids, branch_id: branchId };
    const cashPlan = checkPayment(defaultDraft(SELLER_A, "cash", [{ id: bCash, remaining: "40.00" }]));
    const paidCash = cashPlan.ok ? await call(admin, "POST", "/payments", buildPaymentBody(meta, cashPlan.plan)) : null;
    t.check("L4: the cash payment lands (201)", paidCash !== null && paymentOutcome(paidCash).kind === "ok", paidCash ? statusOf(paidCash) : "no plan");

    // L5: a channel — created as admin, read back MASKED by staff and FULL by admin.
    // The account number is built ONLY from digits the label does not carry. It used to be
    // `99` + RUN's digits, while the label carried RUN itself: on 2026-10-09 RUN `b20852`
    // put `20852` in both, and the mask scanner found five characters of the account in
    // the LABEL of a correctly masked render (`proof-drawer-b20852 · ลงท้าย 2364`). The
    // prefix `proof-drawer-` holds no digit and RUN at most six, so at least four digits
    // are free; Date.now() is mapped onto them so the number still differs per run.
    const baseLabel = `proof-drawer-${RUN}`;
    const free = "0123456789".split("").filter((d) => !baseLabel.includes(d));
    const acct = String(Date.now()).padStart(12, "0").slice(-12).split("")
      .map((d) => free[Number(d) % free.length]).join("");
    const label = baseLabel;
    // The mask cell below scans the WHOLE render, label included; it can only mean
    // "the identifier leaked" if the label shares no 5-character run with the account.
    const preLabel = carriesMoreThanFour(label, acct);
    t.check("L5 precondition: the channel label shares no 5-character run with the account number",
      preLabel === null, `label ${label} · account ${acct}${preLabel ? ` · shared ${preLabel}` : ""}`);
    const add = checkChannelDraft({ kind: "bank_account", label, proxyType: "phone", proxy: "", bankCode: "KBANK", accountNo: acct, accountName: "ร้านทดสอบ" });
    const created = add.ok ? await call(admin, "POST", "/shop/payment-channels", add.body) : null;
    t.check("L5: POST /shop/payment-channels creates the shop's account (201)", created !== null && created.kind === "ok", created ? statusOf(created) : "draft refused");
    channelId = created !== null && created.kind === "ok" ? ((created.body as { id?: string }).id ?? null) : null;
    const staffList = await call(staff, "GET", "/shop/payment-channels");
    const adminList = await call(admin, "GET", "/shop/payment-channels");
    const mine = (f: PaymentFetch) => (f.kind === "ok" ? (readChannels(f.body) ?? []).find((c) => c.id === channelId) ?? null : null);
    const sMine = mine(staffList);
    const aMine = mine(adminList);
    t.check("L5: both principals read the channel", sMine !== null && aMine !== null);
    if (sMine && aMine) {
      // Both sides of the differential come from the REAL server (differential-control lesson).
      t.check("L5 control: the scanner finds the full account number in ADMIN's real render",
        carriesMoreThanFour(channelLine(aMine), acct) !== null, channelLine(aMine));
      if (preLabel === null) {
        t.check("L5 MASK: STAFF's real render carries no more than four characters of it",
          carriesMoreThanFour(channelLine(sMine), acct) === null, channelLine(sMine));
      } else {
        // NOT a pass: the precondition cell above is already red, so the run is red.
        console.log("  [NOT RUN] L5 MASK: STAFF's real render -- the label itself carries the account, so the scan would read the label");
      }
      t.check("L5 MASK: STAFF's response row holds no account_no KEY at all",
        staffList.kind === "ok" && !JSON.stringify(staffList.body).includes(acct));
      t.check("L5 MASK: STAFF sees the last four the server chose", sMine.last4 === acct.slice(-4));
    }

    // L6: transfer on (if it was not), pay by transfer naming the channel.
    if (!entry.transfer) {
      const m = await call(admin, "PUT", `/branches/${branchId}/payment-methods/transfer`, { is_active: true });
      t.check("L6: transfer switched ON for the branch (it was off)", m.kind === "ok", statusOf(m));
    }
    const pol6 = counterPolicy(await call(admin, "GET", "/shop/policy"));
    t.check("L6: R7 — over the real policy the form now offers transfer", offeredMethods(pol6).includes("transfer"));
    const adminChannels = adminList.kind === "ok" ? readChannels(adminList.body) : null;
    const picker = channelPicker("transfer", adminChannels);
    t.check("L6: R6 — the picker shows for transfer with the new active channel", picker.show && picker.options.some((o) => o.id === channelId));
    const xferPlan = checkPayment({ ...defaultDraft(SELLER_A, "transfer", [{ id: bXfer, remaining: "25.00" }]), channel_id: channelId });
    const xferBody = xferPlan.ok ? buildPaymentBody(meta, xferPlan.plan) : null;
    const paidX = xferBody ? await call(admin, "POST", "/payments", xferBody) : null;
    t.check("L6: the transfer payment naming the channel lands (201) and carries it back",
      paidX !== null && paidX.kind === "ok" && (paidX.body as { channel_id?: string }).channel_id === channelId,
      paidX ? statusOf(paidX) : "no plan");

    // L7: the running figure — the server's, re-derived here in DECIMAL, independently.
    const want = new Decimal("500.00").plus("100.00").minus("30.00").minus("40.00").toFixed(2);
    const s7 = shiftState(await call(admin, "GET", "/shifts/current"));
    const panel = shiftPanel(s7, { kind: "pay" }, null);
    t.check(`L7: R4 — the admin's panel shows the server's figure, and it equals float+in−out−cash = ${want} (transfer not in it)`,
      s7.kind === "open" && s7.shift.drawer?.expectedCash === want && panel.kind === "open" && panel.figure?.value === want,
      s7.kind === "open" ? String(s7.shift.drawer?.expectedCash) : s7.kind);

    // L8: the BLIND close — the count only; the figure comes back in the response.
    const counted = "525.00";
    const c = await call(admin, "POST", `/shifts/${shiftId ?? ""}/close`, { counted_cash: counted });
    const cs = c.kind === "ok" ? readClosedShift(c.body) : null;
    if (cs !== null) closed = true;
    const wantVar = new Decimal(counted).minus(want).toFixed(2);
    t.check(`L8: the close returns expected_cash ${want} and variance ${wantVar} (re-derived here)`,
      cs !== null && cs.expectedCash === want && cs.variance === wantVar && cs.countedCash === counted,
      cs ? `${cs.expectedCash} ${cs.variance}` : statusOf(c));
    const res = cs === null ? null : closeResult(cs);
    t.check("L8: R2/R3 — the result is short (เงินขาด 5.00) and ASKS for a reason",
      res !== null && res.tone === "short" && res.word === "เงินขาด" && res.variance.value === "5.00" && res.reason.kind === "ask");
    const s8 = shiftState(await call(admin, "GET", "/shifts/current"));
    t.check("L8: after the close there is no open shift, and the gate is closed again", s8.kind === "none" && payGate(pol6, s8).kind === "shift_first");

    // L9: the reason once; a second is refused by the SERVER and worded here.
    const why = `นับเงินทอนผิด (proof ${RUN})`;
    const r9 = await call(admin, "PATCH", `/shifts/${shiftId ?? ""}`, { variance_reason: why });
    const saved = r9.kind === "ok" ? readClosedShift(r9.body) : null;
    t.check("L9: R3 — the reason is saved once (200) and then SHOWN",
      saved !== null && saved.reason === why && closeResult(saved).reason.kind === "shown", statusOf(r9));
    const r9b = await call(admin, "PATCH", `/shifts/${shiftId ?? ""}`, { variance_reason: "อีกครั้ง" });
    const o9 = drawerOutcome(r9b, "shift");
    const srv = serverMessage(r9b);
    t.check("L9: a SECOND reason is refused 409 shift_reason_frozen", isReasonFrozen(r9b), statusOf(r9b));
    t.check("L9: …worded by the client, and the server's own message is NOT what is shown",
      o9.kind === "refused" && o9.message === "เหตุผลของกะนี้บันทึกไว้แล้ว แก้ไขไม่ได้" && srv !== null && !o9.message.includes(srv),
      `server said ${srv === null ? "nothing" : "a message"}`);
    t.check("control: the server DID send a message for that refusal (the no-leak cell had something to find)", srv !== null && srv.length > 0);

    // L10: staff — every shift route 403, worded.
    const fake = randomUUID();
    const staffCalls: readonly [string, Promise<PaymentFetch>][] = [
      ["POST /shifts", call(staff, "POST", "/shifts", { id: fake, opening_float: "1.00" })],
      ["GET /shifts/current", call(staff, "GET", "/shifts/current")],
      ["POST /shifts/{id}/close", call(staff, "POST", `/shifts/${fake}/close`, { counted_cash: "1.00" })],
      ["PATCH /shifts/{id}", call(staff, "PATCH", `/shifts/${fake}`, { variance_reason: "x" })],
      ["POST /cash-movements", call(staff, "POST", "/cash-movements", buildMovementBody({ clock, ids }, "expense", "1.00", ""))],
      ["GET /cash-movements", call(staff, "GET", `/cash-movements?shift_id=${fake}`)],
    ];
    for (const [name, p] of staffCalls) {
      const f = await p;
      const w = drawerOutcome(f, "shift");
      t.check(`L10: STAFF ${name} → 403, worded as the missing shift right`,
        f.kind === "http" && f.status === 403 && w.kind === "refused" &&
          w.message === "บัญชีนี้ไม่มีสิทธิ์จัดการกะและลิ้นชัก ต้องให้เจ้าของร้านมอบสิทธิ์",
        statusOf(f));
    }
  } finally {
    // Leave the shop as found. Each restore isolated so one failure cannot skip the rest.
    if (shiftId !== null && !closed) {
      const c = await call(admin, "POST", `/shifts/${shiftId}/close`, { counted_cash: "0.00" });
      t.check("Lz: the proof's OWN shift, left open by a failure, is closed", c.kind === "ok", statusOf(c));
    }
    if (channelId !== null) {
      const d = await call(admin, "PATCH", `/shop/payment-channels/${channelId}`, { is_active: false });
      t.check("Lz: the channel this run created is deactivated", d.kind === "ok", statusOf(d));
    }
    if (!entry.transfer) {
      const m = await call(admin, "PUT", `/branches/${branchId}/payment-methods/transfer`, { is_active: false });
      t.check("Lz: transfer restored to OFF (as found)", m.kind === "ok", statusOf(m));
    }
    const back = await call(admin, "PATCH", `/branches/${branchId}`, {
      shifts_enabled: entry.shifts,
      ...(entry.cashier === null ? {} : { separate_cashier: entry.cashier }),
    });
    t.check(`Lz: shifts_enabled restored to ${String(entry.shifts)} and separate_cashier to ${String(entry.cashier)} (as found)`,
      back.kind === "ok", statusOf(back));
    const after = shiftState(await call(admin, "GET", "/shifts/current"));
    t.check("Lz: no shift is left open by this run", after.kind === "none", after.kind);
  }
}
