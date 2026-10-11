/**
 * THE CASHIER COUNTER — the unpaid queue, the payment form, and what one payment
 * PRODUCED, as PURE functions (STRUCTURE.md 2.1, the counter unit). No React
 * Native, no Expo, no node, no fetch — so `npm run prove:counter` exercises exactly
 * the arithmetic, the gates and the refusals the phone runs. `app/CounterScreen.tsx`
 * and its payment sheet render whatever this returns and decide nothing.
 *
 * WHO THIS IS FOR, and it is the first screen whose user is not the person weighing:
 * a cashier at a counter with a seller standing in front of them. Speed and
 * unambiguity beat completeness, and a wrong tap pays the wrong person — so every
 * money figure is a SERVER string rendered byte-for-byte (money/format.display), the
 * form shows what WILL be paid before it commits, and a refusal is worded from its
 * (status, code), never raw.
 *
 * ONLINE-ONLY (the owner's ruling 3). POST /payments reconciles against the LIVE
 * ledger under a row lock before it admits an allocation (payments.py FOR NO KEY
 * UPDATE), and no phone can do that against a stale cache — so this screen does not
 * write to the outbox and is not offline-first. An unreachable queue read is a calm
 * amber message worded from the transport failure (never a red diagnostic), and the
 * queue refreshes when the line returns. Recording a payment offline is a future
 * outbox kind at the measured per-kind cost (STRUCTURE.md 2.5); it is not built here.
 *
 * THE SERVER IS THE AUTHORITY. Every check here (the over-allocation refusals, the
 * entry gate) is a courtesy that stops the app sending a request the server would
 * refuse; POST /payments enforces P1/P2/P3 against the ledger, and payments.record
 * gates it. This computation must never become the only thing between the drawer and
 * a wrong payment.
 */
import { may } from "../session/deviceRole.js";
import type { Grants } from "../session/deviceRole.js";
import { display } from "../money/format.js";
import { compareMoney, parsePrice, subtractMoney, sumAmounts } from "../money/money.js";
import type { Clock, IdSource } from "../sync/types.js";

/* ==========================================================================
 * 1. METHODS — what the server accepts, and what this commit OFFERS
 * ========================================================================== */

/** The four the server's CHECK admits (payments.py PaymentMethod). */
export type PaymentMethod = "cash" | "promptpay" | "transfer" | "write_off";

/**
 * The methods the counter OFFERS in this commit. `promptpay` rides commit 3 with
 * the QR that makes it usable (a method with no QR to show is a dead choice), and
 * `write_off` — forgiving a debt rather than paying it — is a correction deferred
 * with payments.void. The classify/build functions below still handle all four, so
 * a payload the server accepts is never mishandled here.
 */
export const OFFERED_METHODS: readonly PaymentMethod[] = ["cash", "transfer"];

/** The label a method shows, keyed on the code. Asserted in prove:counter. */
export const METHOD_LABEL: { readonly [M in PaymentMethod]: string } = {
  cash: "เงินสด",
  transfer: "โอนเงิน",
  promptpay: "พร้อมเพย์",
  write_off: "ตัดหนี้",
};

/* ==========================================================================
 * 2. THE LABELS — the client owns every sentence (asserted in prove:counter)
 * ========================================================================== */

// The queue's column meanings. A label that tells the cashier what a number MEANS
// is guarded by nothing unless a proof asserts it (the dashboard finding, OPEN_ITEMS).
export const OUTSTANDING_LABEL = "ค้างจ่าย";
export const PAID_LABEL = "จ่ายแล้ว";
// The counter's name, on its header AND on the entry that opens it (navRow.ts). The shop
// PAYS sellers here, so "รับชำระเงิน" (receiving payment) read in the wrong direction
// (ADVISOR-DECIDED 2026-09-30, OPEN_ITEMS.md); เคาน์เตอร์เงินสด was declined because the
// counter also pays by transfer.
export const QUEUE_TITLE = "เคาน์เตอร์จ่ายเงิน";
export const QUEUE_EMPTY = "ไม่มีบิลค้างจ่าย";
export const PARTIAL_NOTE = "จ่ายแล้วบางส่วน";

// The pre-request refusals (worded from the cashier's own input, before any POST).
const NEED_AMOUNT = "ใส่ยอดจ่ายให้ถูกต้อง";
const DUP_BILL = "บิลเดียวกันถูกเลือกซ้ำ";
const ALLOCATED_OVER_AMOUNT = "ยอดบิลที่เลือกรวมกันเกินยอดจ่าย";
const allocationOverRemaining = (remainingDisplay: string): string =>
  `ยอดของบิลนี้เกินยอดค้าง (ค้าง ${remainingDisplay} บาท)`;

// The POST refusals, worded from (status, code) — never the server's prose.
// REFUSED_OFFLINE is exported for the drawer (drawerView.ts): the shift panel lives on
// this same online-only screen, so an unreachable shift route says the same sentence.
export const REFUSED_OFFLINE =
  "ยังติดต่อระบบไม่ได้ หน้าเคาน์เตอร์จ่ายเงินต้องเชื่อมต่อระบบ — เมื่อกลับมาออนไลน์ รายการจะรีเฟรชเอง";
const REFUSED_FORBIDDEN =
  "บัญชีนี้ไม่มีสิทธิ์รับชำระเงินที่เคาน์เตอร์ ต้องให้เจ้าของร้านมอบสิทธิ์";
const REFUSED_BILL_UNKNOWN = "บิลนี้ยังส่งไม่ถึงระบบ — รีเฟรชรายการแล้วลองใหม่";
const REFUSED_SELLER_INACTIVE = "ผู้ขายรายนี้ถูกปิดใช้งานแล้ว";
const REFUSED_BILL_VOIDED = "บิลนี้ถูกยกเลิกแล้ว — โหลดรายการใหม่";
const REFUSED_SELLER_MISMATCH = "บิลนี้ไม่ใช่ของผู้ขายรายที่จ่ายเงินให้";
const REFUSED_ALLOCATION_OVER_BILL = "ยอดที่จัดสรรเกินยอดค้างของบิล — โหลดรายการใหม่แล้วลองอีกครั้ง";
const REFUSED_ALLOCATIONS_OVER_AMOUNT = "ยอดที่จัดสรรให้บิลรวมกันเกินยอดจ่าย";
const REFUSED_DUPLICATE = "บิลเดียวกันถูกจัดสรรซ้ำในรายการจ่ายเดียว";
const REFUSED_SELLER_UNKNOWN = "ไม่พบผู้ขายรายนี้ — โหลดรายชื่อใหม่";
const REFUSED_SERVER = "ระบบยังรับชำระเงินไม่ได้ในตอนนี้ — ลองอีกครั้ง";

/* ==========================================================================
 * 3. THE ENTRY GATE (E2 of the dashboard pattern), and the fail-open reasoning
 * ========================================================================== */

/**
 * Draw the counter entry? Gated on `payments.record` (P1.9: a control the server
 * would refuse is never drawn), fail-OPEN on an absent set like every may() gate;
 * AND the branch's `separate_cashier` must not be known-OFF.
 *
 * `separateCashier` is what SqliteShopPolicyStore.read returned: `true`/`false`, or
 * `null` for UNKNOWN (never refreshed, another tenant's row, or an unscoped owner
 * with no single branch). UNKNOWN DRAWS THE ENTRY, and the reasoning belongs HERE
 * so a later session meeting the fail-open does not "harden" it into a lockout:
 * with the switch OFF the unpaid queue is empty BY CONSTRUCTION (bills.py
 * list_bills auto-pays every bill), so wrongly SHOWING the counter costs an empty
 * list, while wrongly HIDING it costs a cashier who cannot pay a seller standing in
 * front of them. Both directions favour showing (the owner's ruling 2). Only a row
 * for THIS tenant that says the switch is OFF hides it.
 *
 * THE SECOND BRANCH (the shifts unit, commit 3's closing turn, ADVISOR-DECIDED
 * 2026-09-30): the entry is ALSO drawn when `shifts_enabled` is not known-OFF and the
 * principal holds `shifts.manage` — the shift panel lives on this screen, and a shop
 * that runs shifts WITHOUT a separate cashier (the weigher pays; POST /bills writes the
 * cash payment and stamps it to the OPEN shift) must be able to open one, or every
 * such payment is stamped to no drawer. `shiftsEnabled` is the live GET /shop/policy
 * answer (it is NOT in the device cache), so after a cold OFFLINE start it is null.
 * UNKNOWN DRAWS THE ENTRY for a shifts.manage holder, by the same weighing: wrongly
 * SHOWING it costs a screen whose shift panel stays hidden (the panel re-reads the
 * policy live) above an empty queue, while wrongly HIDING it costs a shop that cannot
 * open the shift its drawer count depends on. Only a policy that was read and says
 * shifts are OFF — or a read grant set lacking shifts.manage — closes this branch.
 * The parameter has no default on purpose: a call site that does not name the shift
 * policy must not be given a meaning for it.
 */
export function mayShowCounterEntry(
  grants: Grants,
  separateCashier: boolean | null,
  shiftsEnabled: boolean | null,
): boolean {
  const counterBranch = may(grants, "payments.record") && separateCashier !== false;
  const drawerBranch = may(grants, "shifts.manage") && shiftsEnabled !== false;
  return counterBranch || drawerBranch;
}

/**
 * Inside the screen: the unpaid QUEUE and the pay panel belong to the counter branch
 * of the entry and to nothing else — `payments.record` and a separate cashier not
 * known-off. A shop that reached this screen through the drawer branch alone sees the
 * shift panel and no queue (and the queue is not even read, since a principal without
 * payments.record would only get a 403 in its place).
 */
export function mayShowQueue(grants: Grants, separateCashier: boolean | null): boolean {
  return may(grants, "payments.record") && separateCashier !== false;
}

/** What the screen says under the shift panel when it shows no queue, so the page
 *  reads as a drawer page and not as a counter with nothing in it. */
export const DRAWER_ONLY_NOTE =
  "ร้านนี้จ่ายเงินตอนบันทึกบิลที่ลานชั่ง — หน้านี้ใช้สำหรับกะและลิ้นชักเงินสด";

/* ==========================================================================
 * 4. PARSING GET /bills?unpaid=true — fatal on a malformed row
 * ========================================================================== */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const readStr = (v: unknown): string | null => (typeof v === "string" ? v : null);

const codeOf = (body: unknown): string | null => {
  if (isObj(body) && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (isObj(detail)) return readStr(detail["code"]);
  }
  return null;
};

/** One unpaid bill as GET /bills returns it (bills.py list_bills). */
export interface UnpaidBill {
  id: string;
  /** Server-assigned once synced; a bill in this queue has reached the server, so
   *  it is present. Kept nullable defensively and rendered as a placeholder. */
  doc_no: string | null;
  seller_id: string;
  vehicle_no: string | null;
  total_amount: string;
  paid_amount: string;
  payment_status: string;
  server_received_at: string;
}

/**
 * Parse GET /bills?unpaid=true → the unpaid bills, or null if the body is a shape
 * this build cannot read. Fatal-on-malformed, not skip-the-row (readUsers' reason):
 * a partial queue would hide a debt the shop owes a seller, and the cashier would
 * pay from a list that is quietly short. The keys are list_bills': id, doc_no,
 * seller_id, vehicle_no, total_amount, paid_amount, payment_status,
 * server_received_at (device_created_at and branch_id are also present and unread).
 */
export function readUnpaidBills(raw: unknown): UnpaidBill[] | null {
  if (!isObj(raw)) return null;
  const arr = raw["bills"];
  if (!Array.isArray(arr)) return null;
  const out: UnpaidBill[] = [];
  for (const row of arr) {
    if (!isObj(row)) return null;
    const id = readStr(row["id"]);
    const seller_id = readStr(row["seller_id"]);
    const total_amount = readStr(row["total_amount"]);
    const paid_amount = readStr(row["paid_amount"]);
    const payment_status = readStr(row["payment_status"]);
    const server_received_at = readStr(row["server_received_at"]);
    // doc_no and vehicle_no are legitimately null; a wrong TYPE (a number) is still
    // a malformed body and fails the whole read.
    const docRaw = row["doc_no"];
    const vehRaw = row["vehicle_no"];
    const doc_no = docRaw === null ? null : readStr(docRaw);
    const vehicle_no = vehRaw === null ? null : readStr(vehRaw);
    if (
      id === null ||
      seller_id === null ||
      total_amount === null ||
      paid_amount === null ||
      payment_status === null ||
      server_received_at === null ||
      (docRaw !== null && doc_no === null) ||
      (vehRaw !== null && vehicle_no === null)
    ) {
      return null;
    }
    out.push({
      id,
      doc_no,
      seller_id,
      vehicle_no,
      total_amount,
      paid_amount,
      payment_status,
      server_received_at,
    });
  }
  return out;
}

/* ==========================================================================
 * 5. THE QUEUE MODEL — grouped by seller, longest wait first
 * ========================================================================== */

/** The seller identity the cache supplies for a queue row (name, phone). */
export interface CounterSeller {
  name: string;
  phone: string | null;
}

export interface QueueBill {
  id: string;
  doc_no: string | null;
  vehicle_no: string | null;
  /** Raw server strings, kept for the payment draft. */
  total: string;
  paid: string;
  remaining: string;
  /** display() renderings for the eye; the raw strings above go on the wire. */
  totalDisplay: string;
  paidDisplay: string;
  remainingDisplay: string;
  partial: boolean;
  server_received_at: string;
}

export interface QueueSeller {
  seller_id: string;
  /** From the cache; a fallback sentence when the seller is not cached. */
  name: string;
  phone: string | null;
  /** True when the seller's name could not be resolved from the cache. */
  nameMissing: boolean;
  bills: readonly QueueBill[];
  /** Σ remaining across this seller's unpaid bills — raw and rendered. */
  outstanding: string;
  outstandingDisplay: string;
  /** The oldest unpaid bill's arrival instant: the screen renders "waited …". */
  waitingSince: string;
}

export interface CounterQueue {
  title: string;
  outstandingLabel: string;
  sellers: readonly QueueSeller[];
  /** True when nothing is owed — the calm empty state, not a message. */
  isEmpty: boolean;
}

const SELLER_UNKNOWN_NAME = "ผู้ขาย (โหลดรายชื่อใหม่)";

function toQueueBill(b: UnpaidBill): QueueBill {
  const remaining = subtractMoney(b.total_amount, b.paid_amount);
  return {
    id: b.id,
    doc_no: b.doc_no,
    vehicle_no: b.vehicle_no,
    total: b.total_amount,
    paid: b.paid_amount,
    remaining,
    totalDisplay: display(b.total_amount),
    paidDisplay: display(b.paid_amount),
    remainingDisplay: display(remaining),
    partial: b.payment_status === "partial",
    server_received_at: b.server_received_at,
  };
}

/**
 * Group the unpaid bills by seller — which mirrors the payment rule (a payment is
 * one seller, P3) — and order the sellers by their OLDEST unpaid bill first, so the
 * person who has waited longest is at the top of the cashier's glance. Within a
 * seller the bills are oldest-first too.
 */
export function counterQueue(
  bills: readonly UnpaidBill[],
  sellers: ReadonlyMap<string, CounterSeller>,
): CounterQueue {
  const bySeller = new Map<string, QueueBill[]>();
  for (const b of bills) {
    const list = bySeller.get(b.seller_id) ?? [];
    list.push(toQueueBill(b));
    bySeller.set(b.seller_id, list);
  }
  const sellerRows: QueueSeller[] = [];
  for (const [seller_id, list] of bySeller) {
    list.sort((a, z) => a.server_received_at.localeCompare(z.server_received_at));
    const outstanding = sumAmounts(list.map((b) => b.remaining));
    const cached = sellers.get(seller_id);
    const first = list[0];
    sellerRows.push({
      seller_id,
      name: cached?.name ?? SELLER_UNKNOWN_NAME,
      phone: cached?.phone ?? null,
      nameMissing: cached === undefined,
      bills: list,
      outstanding,
      outstandingDisplay: display(outstanding),
      // A seller row only exists because it has a bill, so `first` is defined; the
      // fallback keeps the type honest without inventing an instant.
      waitingSince: first?.server_received_at ?? "",
    });
  }
  sellerRows.sort((a, z) => a.waitingSince.localeCompare(z.waitingSince));
  return {
    title: QUEUE_TITLE,
    outstandingLabel: OUTSTANDING_LABEL,
    sellers: sellerRows,
    isEmpty: sellerRows.length === 0,
  };
}

/* ==========================================================================
 * 6. THE PAYMENT FORM — the arithmetic, refused BEFORE the request
 * ========================================================================== */

/** One bill the cashier is paying, with the amount allocated to it (raw strings). */
export interface AllocationDraft {
  bill_id: string;
  /** The bill's remaining, from the queue — the ceiling this allocation must not
   *  exceed (P2). Raw server-scale decimal string. */
  remaining: string;
  /** The cashier's chosen allocation to this bill. Defaults to `remaining`. */
  amount: string;
}

export interface PaymentDraft {
  seller_id: string;
  method: PaymentMethod;
  /** The total that will leave the drawer. Defaults to Σ allocations. */
  amount: string;
  allocations: readonly AllocationDraft[];
  /** Which of the shop's OWN accounts a non-cash payment left from (R6, the shifts
   *  unit commit 3), or absent/null for "not stated" — optional on the wire and
   *  never required (payments.py PaymentCreate.channel_id). */
  channel_id?: string | null;
}

/** The wire body for POST /payments (payments.py PaymentCreate). id, key and stamp
 *  are minted by buildPaymentBody, never carried in the draft. */
export interface PaymentCreateBody {
  id: string;
  seller_id: string;
  method: PaymentMethod;
  amount: string;
  idempotency_key: string;
  device_created_at: string;
  allocations: { bill_id: string; amount: string }[];
  branch_id?: string | null;
  channel_id?: string;
}

export interface PaymentPlan {
  seller_id: string;
  method: PaymentMethod;
  /** Present only for a non-cash method with a channel chosen (checkPayment). */
  channel_id: string | null;
  amount: string;
  amountDisplay: string;
  allocations: readonly { bill_id: string; amount: string }[];
  allocated: string;
  allocatedDisplay: string;
  /** amount − allocated: an advance the shop hands the seller against no bill. */
  advance: string;
  advanceDisplay: string;
}

export type PaymentCheck =
  | { ok: true; plan: PaymentPlan }
  | { ok: false; field: "amount" | "allocation"; message: string; bill_id?: string };

/**
 * Build a default draft: pay every selected bill its full remaining, the total the
 * sum of them, method as chosen. The yard's common case — several loads, one bundle
 * of cash — is this and nothing more (STRUCTURE.md 2.1: multi-bill is first-class,
 * not an advanced mode).
 */
export function defaultDraft(
  seller_id: string,
  method: PaymentMethod,
  bills: readonly { id: string; remaining: string }[],
): PaymentDraft {
  const allocations = bills.map((b) => ({ bill_id: b.id, remaining: b.remaining, amount: b.remaining }));
  return { seller_id, method, amount: sumAmounts(allocations.map((a) => a.amount)), allocations };
}

/**
 * Validate a draft to the SERVER's own rules, so the only request sent is one the
 * ledger will accept. These are the exact comparisons POST /payments makes (P1:
 * Σalloc ≤ amount; P2: alloc ≤ remaining; no duplicate bill), computed in decimal
 * (money.ts), never a float. A refusal names the field and, for a bill, its id — so
 * the screen can point at the row rather than the whole form.
 */
export function checkPayment(draft: PaymentDraft): PaymentCheck {
  const amount = parsePrice(draft.amount);
  if (!amount.ok || compareMoney(amount.value, "0.00") <= 0) {
    return { ok: false, field: "amount", message: NEED_AMOUNT };
  }
  const seen = new Set<string>();
  const allocations: { bill_id: string; amount: string }[] = [];
  for (const a of draft.allocations) {
    if (seen.has(a.bill_id)) {
      return { ok: false, field: "allocation", message: DUP_BILL, bill_id: a.bill_id };
    }
    seen.add(a.bill_id);
    const alloc = parsePrice(a.amount);
    if (!alloc.ok || compareMoney(alloc.value, "0.00") <= 0) {
      return { ok: false, field: "allocation", message: NEED_AMOUNT, bill_id: a.bill_id };
    }
    // P2 at the edge: this allocation must not exceed the bill's remaining.
    if (compareMoney(alloc.value, a.remaining) > 0) {
      return {
        ok: false,
        field: "allocation",
        message: allocationOverRemaining(display(a.remaining)),
        bill_id: a.bill_id,
      };
    }
    allocations.push({ bill_id: a.bill_id, amount: alloc.value });
  }
  const allocated = sumAmounts(allocations.map((a) => a.amount));
  // P1 at the edge: the allocations sum to at most the amount paid.
  if (compareMoney(allocated, amount.value) > 0) {
    return { ok: false, field: "amount", message: ALLOCATED_OVER_AMOUNT };
  }
  const advance = subtractMoney(amount.value, allocated);
  return {
    ok: true,
    plan: {
      seller_id: draft.seller_id,
      method: draft.method,
      // Cash leaves the drawer, not an account: a channel carried over from a
      // non-cash selection is DROPPED here, so a cash body can never name one.
      channel_id: draft.method === "cash" ? null : (draft.channel_id ?? null),
      amount: amount.value,
      amountDisplay: display(amount.value),
      allocations,
      allocated,
      allocatedDisplay: display(allocated),
      advance,
      advanceDisplay: display(advance),
    },
  };
}

/** What one commit needs to mint an id, an idempotency key and the device stamp. */
export interface PaymentMeta {
  clock: Clock;
  ids: IdSource;
  /** The caller's branch, if known. OPTIONAL on the wire for the reason a bill's is
   *  (createBill.ts): the server resolves it, and a queued-before shape carries none. */
  branch_id?: string | null;
}

/**
 * Turn a validated plan into the wire body. The id and the idempotency key are
 * minted HERE, exactly once (buildLocalBill's discipline), so a re-tap that rebuilds
 * the body mints a NEW key — which is correct for the counter, because the operator
 * has not committed until the POST is sent; the body is built at send time. The
 * branch_id key is PRESENT only when a branch is known, matching every pre-0018
 * payload the server resolves for itself.
 */
export function buildPaymentBody(meta: PaymentMeta, plan: PaymentPlan): PaymentCreateBody {
  const id = meta.ids.newId();
  return {
    id,
    seller_id: plan.seller_id,
    method: plan.method,
    amount: plan.amount,
    idempotency_key: meta.ids.newId(),
    device_created_at: meta.clock.now().toISOString(),
    allocations: plan.allocations.map((a) => ({ bill_id: a.bill_id, amount: a.amount })),
    ...(meta.branch_id ? { branch_id: meta.branch_id } : {}),
    // The key is PRESENT only when a channel was chosen, the branch_id rule: a
    // payment with no channel sends the shape every earlier build sent.
    ...(plan.channel_id !== null ? { channel_id: plan.channel_id } : {}),
  };
}

/* ==========================================================================
 * 7. CLASSIFYING THE POST — what one payment produced
 * ========================================================================== */

export type PaymentFetch =
  | { kind: "ok"; body: unknown }
  | { kind: "http"; status: number; body: unknown }
  | { kind: "unreachable" }
  | { kind: "no_token" };

export type PaymentOutcome =
  | { kind: "ok" }
  | { kind: "session" }
  /** The queue is out of date (a bill voided/paid elsewhere, or not yet arrived):
   *  the screen refreshes the queue rather than only showing the sentence. */
  | { kind: "refused"; message: string; reloadQueue: boolean };

/**
 * WHAT ONE POST /payments PRODUCED, classified on the STATUS and `code` (never the
 * prose). The line between 424 and 422 is the server's (payments.py): a 424 is
 * RESOLVABLE — the bill may still be in a device's queue, or the seller was just
 * deactivated — so it reloads the queue; a 422 is a fact about the payload against
 * the ledger as it stands. A 401 or no token ends the session; unreachable is the
 * online-only offline state. The over-allocation 422s are defensive here — the form
 * refuses them before the request — but a race (a payment recorded elsewhere between
 * the queue read and this POST) can still produce one, so it is worded and reloads.
 */
export function paymentOutcome(fetch: PaymentFetch): PaymentOutcome {
  if (fetch.kind === "ok") return { kind: "ok" };
  if (fetch.kind === "no_token") return { kind: "session" };
  if (fetch.kind === "unreachable") {
    return { kind: "refused", message: REFUSED_OFFLINE, reloadQueue: false };
  }
  if (fetch.status === 401) return { kind: "session" };
  if (fetch.status === 403) {
    return { kind: "refused", message: REFUSED_FORBIDDEN, reloadQueue: false };
  }
  const code = codeOf(fetch.body);
  if (fetch.status === 424) {
    // bill_unknown or seller_inactive — both resolvable, both reload the queue.
    return {
      kind: "refused",
      message: code === "seller_inactive" ? REFUSED_SELLER_INACTIVE : REFUSED_BILL_UNKNOWN,
      reloadQueue: true,
    };
  }
  if (fetch.status === 422) {
    return { kind: "refused", message: message422(code), reloadQueue: reload422(code) };
  }
  // 400, 5xx, or a 200 whose body could not be read: the server screen, retryable.
  return { kind: "refused", message: REFUSED_SERVER, reloadQueue: false };
}

function message422(code: string | null): string {
  switch (code) {
    case "bill_voided":
      return REFUSED_BILL_VOIDED;
    case "seller_mismatch":
      return REFUSED_SELLER_MISMATCH;
    case "allocation_exceeds_bill":
      return REFUSED_ALLOCATION_OVER_BILL;
    case "allocations_exceed_amount":
      return REFUSED_ALLOCATIONS_OVER_AMOUNT;
    case "duplicate_allocation":
      return REFUSED_DUPLICATE;
    case "seller_unknown":
      return REFUSED_SELLER_UNKNOWN;
    default:
      return REFUSED_SERVER;
  }
}

/** Which 422s mean the queue moved under the cashier (reload it) vs a payload the
 *  cashier can fix in place. bill_voided and allocation_exceeds_bill are the ledger
 *  having changed; the rest are the request itself. */
function reload422(code: string | null): boolean {
  return code === "bill_voided" || code === "allocation_exceeds_bill";
}

/* ==========================================================================
 * 8. THE READ — the queue, or a calm message when it cannot be shown
 * ========================================================================== */

export interface CounterMessage {
  tone: "offline" | "session" | "error";
  badge: string;
  lines: readonly string[];
  action: { kind: "retry"; label: string } | { kind: "sign_in"; label: string } | null;
}

export type CounterScreenState =
  | { kind: "queue"; queue: CounterQueue }
  | { kind: "message"; message: CounterMessage };

const OFFLINE_MESSAGE: CounterMessage = {
  tone: "offline",
  badge: "ยังติดต่อระบบไม่ได้",
  lines: [REFUSED_OFFLINE],
  action: { kind: "retry", label: "ลองอีกครั้ง" },
};
const SESSION_MESSAGE: CounterMessage = {
  tone: "session",
  badge: "หมดเวลาเข้าใช้งาน",
  lines: ["ต้องเข้าสู่ระบบใหม่เพื่อรับชำระเงิน"],
  action: { kind: "sign_in", label: "เข้าสู่ระบบ" },
};
const FORBIDDEN_MESSAGE: CounterMessage = {
  tone: "error",
  badge: "ไม่มีสิทธิ์",
  lines: [REFUSED_FORBIDDEN],
  action: null,
};
const SERVER_MESSAGE: CounterMessage = {
  tone: "error",
  badge: "ระบบขัดข้อง",
  lines: ["ระบบยังตอบเรื่องการรับชำระเงินไม่ได้ในตอนนี้"],
  action: { kind: "retry", label: "ลองอีกครั้ง" },
};

/**
 * The whole counter screen from one GET /bills?unpaid=true, or the message to show
 * instead. `no_token`/401 end the session; `unreachable` is the online-only offline
 * state; 403 is a caller who lacks payments.record (a role changed server-side); a
 * 200 whose body cannot be read, or a 5xx, is the server screen. A partial queue is
 * never shown — readUnpaidBills is fatal on a malformed body.
 */
export function counterScreenState(
  fetch: PaymentFetch,
  sellers: ReadonlyMap<string, CounterSeller>,
): CounterScreenState {
  if (fetch.kind === "ok") {
    const bills = readUnpaidBills(fetch.body);
    if (bills === null) return { kind: "message", message: SERVER_MESSAGE };
    return { kind: "queue", queue: counterQueue(bills, sellers) };
  }
  if (fetch.kind === "no_token") return { kind: "message", message: SESSION_MESSAGE };
  if (fetch.kind === "unreachable") return { kind: "message", message: OFFLINE_MESSAGE };
  if (fetch.status === 401) return { kind: "message", message: SESSION_MESSAGE };
  if (fetch.status === 403) return { kind: "message", message: FORBIDDEN_MESSAGE };
  return { kind: "message", message: SERVER_MESSAGE };
}
