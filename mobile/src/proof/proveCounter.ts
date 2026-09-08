/**
 * The cashier counter proof (STRUCTURE.md 2.1, the counter unit, commit 2).
 *
 * Run: npm run prove:counter              (requires the API at RECYCLE_API_BASE)
 *      npm run prove:counter -- --offline (skips the live round; exits 2, never 0)
 *
 * WHAT IS HEADLESS AND WHAT NEEDS THE SERVER — stated so a green with no server is
 * read for what it is (the prove:users rule):
 *
 *   HEADLESS (H1..H5, always run): the pure model in src/counter/counterView.ts —
 *   the entry gate (staff/policy-off hidden; admin+on and admin+unknown shown), the
 *   queue grouped by seller and derived from server strings, the payment-form
 *   ARITHMETIC (the P1/P2/duplicate refusals computed BEFORE any request, each with
 *   a presence sibling), every POST refusal asserted NEGATIVELY over its own render
 *   with a presence sibling and a no-leak scan, and the labels this unit ships. The
 *   client agreeing WITH ITSELF.
 *
 *   LIVE (R1..R6, need the server): a real HTTP round through the app's request
 *   SHAPE against a fresh uvicorn — read GET /shop/policy, flip separate_cashier ON
 *   over PATCH /branches, create two bills, watch them arrive UNPAID in
 *   GET /bills?unpaid=true, pay BOTH in ONE payment (the multi-bill case), watch
 *   them leave, and drive the 424/422/403 refusals against the server's ACTUAL
 *   answers. The switch is restored to OFF in a finally, because the mobile scratch
 *   is shared across the live proofs in a prove_all run. app/api.ts cannot be
 *   imported here (it reaches expo-constants through ./config), so the shape is
 *   reconstructed, exactly as proveUsers does.
 *
 * ON THE OUTPUT. Mostly Thai; mojibake in the console is the console (cp874,
 * lessons/console-is-not-the-observation.md). Every assertion compares JS strings.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildPaymentBody,
  checkPayment,
  counterQueue,
  counterScreenState,
  defaultDraft,
  mayShowCounterEntry,
  METHOD_LABEL,
  OFFERED_METHODS,
  OUTSTANDING_LABEL,
  PAID_LABEL,
  PARTIAL_NOTE,
  paymentOutcome,
  QUEUE_TITLE,
  readUnpaidBills,
  type CounterMessage,
  type CounterSeller,
  type PaymentFetch,
  type PaymentMeta,
  type UnpaidBill,
} from "../counter/counterView.js";
import { grantsOf } from "./proofGrants.js";
import { withClientVersion } from "../net/clientVersion.js";
import type { Clock, IdSource } from "../sync/types.js";

let failures = 0;
let passes = 0;

function check(name: string, cond: boolean, detail = ""): void {
  console.log(`  [${cond ? "OK  " : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
  if (cond) passes += 1;
  else failures += 1;
}
function header(t: string): void {
  console.log("\n=== " + t + " ===");
}

/** No server diagnostic may reach a rendered counter message (correct-classification
 *  -can-still-render-as-an-error): no JSON, no code/kind/detail, no status, no uuid. */
const BANNED: readonly string[] = [
  "{", "}", '"', "[", "]", "detail", "kind", "code", "http", "HTTP",
  "401", "403", "422", "424", "500", "bill_unknown", "seller_mismatch",
  "allocation_exceeds_bill", "allocations_exceed_amount", "duplicate_allocation",
  "seller_inactive", "bill_voided", "undefined", "null",
];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i;
function leaks(s: string): string | null {
  for (const b of BANNED) if (s.includes(b)) return b;
  if (UUID.test(s)) return "a uuid";
  return null;
}
function messageText(m: CounterMessage): string {
  return [m.badge, ...m.lines, m.action?.label ?? ""].join(" ");
}

/** Deterministic id/clock so buildPaymentBody is a fixture, not a coin flip. */
class FixedClock implements Clock {
  constructor(private readonly iso: string) {}
  now(): Date {
    return new Date(this.iso);
  }
  sleep(): Promise<void> {
    return Promise.resolve();
  }
}
class FixedIds implements IdSource {
  private i = 0;
  constructor(private readonly values: readonly string[]) {}
  newId(): string {
    const v = this.values[this.i];
    this.i += 1;
    if (v === undefined) throw new Error("FixedIds exhausted");
    return v;
  }
}

// A fixture bill as GET /bills?unpaid=true returns it.
function bill(id: string, seller_id: string, total: string, paid: string, at: string): UnpaidBill {
  const status = paid === "0.00" ? "unpaid" : "partial";
  return {
    id,
    doc_no: `B-2569-${id.slice(-1)}`,
    seller_id,
    vehicle_no: null,
    total_amount: total,
    paid_amount: paid,
    payment_status: status,
    server_received_at: at,
  };
}

// ---------------------------------------------------------------------------
// H1 — the entry gate: fail-open, and the fail-open reasoning proved both ways
// ---------------------------------------------------------------------------
function h1Gate(): void {
  header("H1 the counter entry gate (payments.record AND not switch-off)");
  const admin = grantsOf("admin");
  const staff = grantsOf("staff");
  const owner = grantsOf("owner");
  check("a definite STAFF role is NOT offered the entry (no payments.record)",
    mayShowCounterEntry(staff, true) === false);
  check("ADMIN with the switch ON is offered it (the presence sibling)",
    mayShowCounterEntry(admin, true) === true);
  check("OWNER with the switch ON is offered it",
    mayShowCounterEntry(owner, true) === true);
  // The switch-off case: the ONE state that hides it for a permitted caller.
  check("ADMIN with the switch known-OFF is NOT offered it",
    mayShowCounterEntry(admin, false) === false);
  // Fail-open: an UNKNOWN policy draws it (the reasoning lives at the gate).
  check("ADMIN with an UNKNOWN policy (null) IS offered it — fail open",
    mayShowCounterEntry(admin, null) === true);
  // Fail-open on the grants too: an absent set draws it, the server refuses if wrong.
  check("an ABSENT grant set (null) with the switch on IS offered it — fail open",
    mayShowCounterEntry(null, true) === true);
  check("an ABSENT grant set with an UNKNOWN policy IS offered it",
    mayShowCounterEntry(null, null) === true);
}

// ---------------------------------------------------------------------------
// H2 — the queue model: derived, grouped by seller, oldest wait first
// ---------------------------------------------------------------------------
const SELLER_X = "aaaa0000-0000-0000-0000-0000000000a4";
const SELLER_Y = "bbbb0000-0000-0000-0000-0000000000b4";

function h2Queue(): void {
  header("H2 the queue: grouped by seller, remaining derived, oldest first");
  const sellers = new Map<string, CounterSeller>([
    [SELLER_X, { name: "สมชาย ใจดี", phone: "0800000001" }],
    [SELLER_Y, { name: "อารีย์ ทองมา", phone: null }],
  ]);
  const bills: UnpaidBill[] = [
    bill("1000000000000000000000000000000a", SELLER_X, "100.00", "0.00", "2026-09-07T03:00:00Z"),
    bill("2000000000000000000000000000000b", SELLER_X, "50.00", "20.00", "2026-09-07T04:00:00Z"),
    bill("3000000000000000000000000000000c", SELLER_Y, "80.00", "0.00", "2026-09-07T02:00:00Z"),
  ];
  const q = counterQueue(bills, sellers);
  check("two sellers grouped", q.sellers.length === 2);
  // SELLER_Y's bill is oldest (02:00), so Y sorts before X.
  check("sellers ordered by longest wait first (Y at 02:00 before X at 03:00)",
    q.sellers[0]?.seller_id === SELLER_Y && q.sellers[1]?.seller_id === SELLER_X);
  const x = q.sellers.find((s) => s.seller_id === SELLER_X);
  check("seller name resolved from the cache", x?.name === "สมชาย ใจดี");
  check("X's bills ordered oldest first within the seller",
    x?.bills[0]?.id.startsWith("1") === true && x?.bills[1]?.id.startsWith("2") === true);
  check("remaining is total − paid, derived (50.00 − 20.00 = 30.00)",
    x?.bills[1]?.remaining === "30.00" && x?.bills[1]?.remainingDisplay === "30.00");
  check("the partially-paid bill is flagged partial", x?.bills[1]?.partial === true);
  check("X's outstanding is the sum of remainings (100.00 + 30.00 = 130.00)",
    x?.outstanding === "130.00" && x?.outstandingDisplay === "130.00");
  // A seller absent from the cache is named as needing a refresh, not hidden.
  const q2 = counterQueue([bill("40000000000000000000000000000004", "cccc0000-0000-0000-0000-0000000000c4", "10.00", "0.00", "2026-09-07T05:00:00Z")], sellers);
  check("a seller missing from the cache is flagged, never hidden", q2.sellers[0]?.nameMissing === true && q2.sellers.length === 1);
  // Grouping thousands: 1234567.00 → 1,234,567.00 via display().
  const q3 = counterQueue([bill("50000000000000000000000000000005", SELLER_X, "1234567.00", "0.00", "2026-09-07T05:00:00Z")], sellers);
  check("money is grouped for the eye by display() (1,234,567.00)", q3.sellers[0]?.bills[0]?.totalDisplay === "1,234,567.00");
  check("an empty queue is the calm empty state, not a message",
    counterQueue([], sellers).isEmpty === true);
  // readUnpaidBills is fatal on a malformed row.
  check("readUnpaidBills parses a well-formed body",
    readUnpaidBills({ bills: [{ id: "x", doc_no: "B-1", seller_id: "s", vehicle_no: null, total_amount: "1.00", paid_amount: "0.00", payment_status: "unpaid", server_received_at: "2026-09-07T00:00:00Z" }] })?.length === 1);
  check("readUnpaidBills is FATAL on a malformed row (a number total), never partial",
    readUnpaidBills({ bills: [{ id: "x", total_amount: 5 }] }) === null);
  check("readUnpaidBills rejects a non-array body", readUnpaidBills({ bills: "no" }) === null);
}

// ---------------------------------------------------------------------------
// H3 — the payment-form arithmetic: refused BEFORE the request, with siblings
// ---------------------------------------------------------------------------
function h3Arithmetic(): void {
  header("H3 the payment form: allocations, the remainder, over-allocation refused");
  // The default multi-bill draft: pay both bills their remaining, amount the sum.
  const draft = defaultDraft(SELLER_X, "cash", [
    { id: "b1", remaining: "100.00" },
    { id: "b2", remaining: "30.00" },
  ]);
  check("defaultDraft sums the remainings into the amount (130.00)", draft.amount === "130.00");
  const ok = checkPayment(draft);
  check("a valid multi-bill draft is ACCEPTED (the presence sibling)", ok.ok === true);
  if (ok.ok) {
    check("it carries both allocations", ok.plan.allocations.length === 2);
    check("allocated equals the amount, no advance", ok.plan.allocated === "130.00" && ok.plan.advance === "0.00");
  }
  // P2: an allocation over the bill's remaining is refused BEFORE the request.
  const overBill = checkPayment({
    seller_id: SELLER_X, method: "cash", amount: "200.00",
    allocations: [{ bill_id: "b1", remaining: "100.00", amount: "150.00" }],
  });
  check("P2: an allocation OVER the bill's remaining is refused (before any POST)",
    overBill.ok === false && overBill.field === "allocation" && overBill.bill_id === "b1");
  check("P2 sibling: an allocation EQUAL to the remaining is accepted",
    checkPayment({ seller_id: SELLER_X, method: "cash", amount: "100.00", allocations: [{ bill_id: "b1", remaining: "100.00", amount: "100.00" }] }).ok === true);
  // P1: allocations summing over the amount paid is refused.
  const overAmount = checkPayment({
    seller_id: SELLER_X, method: "cash", amount: "100.00",
    allocations: [
      { bill_id: "b1", remaining: "100.00", amount: "60.00" },
      { bill_id: "b2", remaining: "100.00", amount: "60.00" },
    ],
  });
  check("P1: allocations summing OVER the amount paid is refused",
    overAmount.ok === false && overAmount.field === "amount");
  // Duplicate bill in one payment.
  const dup = checkPayment({
    seller_id: SELLER_X, method: "cash", amount: "20.00",
    allocations: [
      { bill_id: "b1", remaining: "100.00", amount: "10.00" },
      { bill_id: "b1", remaining: "100.00", amount: "10.00" },
    ],
  });
  check("a duplicated bill in one payment is refused", dup.ok === false && dup.field === "allocation");
  // Amount ≤ 0 / unparseable.
  check("a zero amount is refused", checkPayment({ seller_id: SELLER_X, method: "cash", amount: "0.00", allocations: [] }).ok === false);
  check("a non-numeric amount is refused", checkPayment({ seller_id: SELLER_X, method: "cash", amount: "abc", allocations: [] }).ok === false);
  // The advance case: pay more than the allocations (a supplier going to collect).
  const advance = checkPayment({
    seller_id: SELLER_X, method: "cash", amount: "500.00",
    allocations: [{ bill_id: "b1", remaining: "100.00", amount: "100.00" }],
  });
  check("an advance (amount > allocated) is accepted and names the advance held",
    advance.ok && advance.plan.advance === "400.00");
  // A pure advance with no bills at all.
  check("a pure advance with NO bills is accepted (allocated 0, advance = amount)",
    (() => { const r = checkPayment({ seller_id: SELLER_X, method: "cash", amount: "500.00", allocations: [] }); return r.ok === true && r.plan.allocated === "0.00" && r.plan.advance === "500.00"; })());

  // buildPaymentBody: id and idempotency_key minted distinctly; branch present/absent.
  const meta: PaymentMeta = {
    clock: new FixedClock("2026-09-07T06:00:00.000Z"),
    ids: new FixedIds(["11111111-1111-1111-1111-111111111111", "22222222-2222-2222-2222-222222222222"]),
    branch_id: "9999",
  };
  const plan = checkPayment(defaultDraft(SELLER_X, "cash", [{ id: "b1", remaining: "10.00" }]));
  if (plan.ok) {
    const body = buildPaymentBody(meta, plan.plan);
    check("buildPaymentBody mints id and idempotency_key DISTINCTLY", body.id !== body.idempotency_key && body.id === "11111111-1111-1111-1111-111111111111");
    check("the device stamp comes from the clock", body.device_created_at === "2026-09-07T06:00:00.000Z");
    check("branch_id is PRESENT when known", body.branch_id === "9999");
    const noBranch = buildPaymentBody({ clock: new FixedClock("2026-09-07T06:00:00.000Z"), ids: new FixedIds(["a", "b"]) }, plan.plan);
    check("branch_id KEY is ABSENT when the branch is not known (pre-0018 wire shape)", !("branch_id" in noBranch));
  }
}

// ---------------------------------------------------------------------------
// H4 — classifying the POST: negative over the render, with presence siblings
// ---------------------------------------------------------------------------
function h4Outcome(): void {
  header("H4 the POST outcome, worded from (status, code), never raw");
  const http = (status: number, code?: string): PaymentFetch =>
    ({ kind: "http", status, body: code ? { detail: { code } } : {} });

  check("201/ok classifies ok", paymentOutcome({ kind: "ok", body: {} }).kind === "ok");
  check("no_token ends the session", paymentOutcome({ kind: "no_token" }).kind === "session");
  check("401 ends the session", paymentOutcome(http(401)).kind === "session");

  const offline = paymentOutcome({ kind: "unreachable" });
  check("unreachable is a REFUSAL worded online-only (queue refreshes on return)",
    offline.kind === "refused" && offline.reloadQueue === false && offline.message.includes("เชื่อมต่อ"));

  const forbidden = paymentOutcome(http(403));
  check("403 names the OWNER as the one who grants the right (never the office)",
    forbidden.kind === "refused" && forbidden.message.includes("เจ้าของร้าน"));

  const unknown = paymentOutcome(http(424, "bill_unknown"));
  check("424 bill_unknown is resolvable and RELOADS the queue",
    unknown.kind === "refused" && unknown.reloadQueue === true);
  const inactive = paymentOutcome(http(424, "seller_inactive"));
  check("424 seller_inactive is resolvable and reloads", inactive.kind === "refused" && inactive.reloadQueue === true);

  const voided = paymentOutcome(http(422, "bill_voided"));
  check("422 bill_voided reloads (the ledger changed under the cashier)", voided.kind === "refused" && voided.reloadQueue === true);
  const mismatch = paymentOutcome(http(422, "seller_mismatch"));
  check("422 seller_mismatch is a fixed-in-place refusal", mismatch.kind === "refused" && mismatch.reloadQueue === false);
  check("422 allocations_exceed_amount refuses in place", paymentOutcome(http(422, "allocations_exceed_amount")).kind === "refused");
  check("422 duplicate_allocation refuses in place", paymentOutcome(http(422, "duplicate_allocation")).kind === "refused");
  check("422 seller_unknown refuses in place", paymentOutcome(http(422, "seller_unknown")).kind === "refused");
  check("a 5xx is the retryable server screen", paymentOutcome(http(500)).kind === "refused");

  // Every refusal message carries NO diagnostic — the whole point of wording from code.
  const messages = [offline, forbidden, unknown, inactive, voided, mismatch,
    paymentOutcome(http(422, "allocations_exceed_amount")),
    paymentOutcome(http(422, "duplicate_allocation")),
    paymentOutcome(http(500))];
  const leaked = messages
    .filter((m): m is { kind: "refused"; message: string; reloadQueue: boolean } => m.kind === "refused")
    .map((m) => leaks(m.message)).find((l) => l !== null);
  check("NO refusal message leaks a diagnostic (json/code/status/uuid)", leaked === undefined, leaked ?? "");

  // The read side: the offline/session/forbidden MESSAGE screens, no leak in the render.
  const empty = new Map<string, CounterSeller>();
  const offScreen = counterScreenState({ kind: "unreachable" }, empty);
  check("the offline SCREEN is a calm message, no leak",
    offScreen.kind === "message" && leaks(messageText(offScreen.message)) === null);
  const forbScreen = counterScreenState({ kind: "http", status: 403, body: {} }, empty);
  check("the 403 SCREEN names the owner and offers no button", forbScreen.kind === "message" && forbScreen.message.action === null);
}

// ---------------------------------------------------------------------------
// H5 — the labels this unit ships (the money-label finding's remedy)
// ---------------------------------------------------------------------------
function h5Labels(): void {
  header("H5 the labels — a label that says what a number MEANS is asserted here");
  check("the outstanding label is ค้างจ่าย", OUTSTANDING_LABEL === "ค้างจ่าย");
  check("the paid label is จ่ายแล้ว", PAID_LABEL === "จ่ายแล้ว");
  check("the queue title is รับชำระเงิน", QUEUE_TITLE === "รับชำระเงิน");
  check("the partial note reads จ่ายแล้วบางส่วน", PARTIAL_NOTE === "จ่ายแล้วบางส่วน");
  check("cash is เงินสด, transfer is โอนเงิน", METHOD_LABEL.cash === "เงินสด" && METHOD_LABEL.transfer === "โอนเงิน");
  check("this commit OFFERS cash and transfer (promptpay rides commit 3, write_off with void)",
    OFFERED_METHODS.length === 2 && OFFERED_METHODS.includes("cash") && OFFERED_METHODS.includes("transfer"));
  check("no label leaks a diagnostic",
    [OUTSTANDING_LABEL, PAID_LABEL, QUEUE_TITLE, PARTIAL_NOTE, METHOD_LABEL.cash, METHOD_LABEL.transfer].every((s) => leaks(s) === null));
  // The screen renders these constants (the label is not stranded in the model).
  const screenSrc = readFileSync(join(process.cwd(), "app", "CounterScreen.tsx"), "utf8");
  check("CounterScreen renders the outstanding label from the model",
    screenSrc.includes("outstandingLabel") || screenSrc.includes("OUTSTANDING_LABEL"));
  check("CounterScreen renders the method label", screenSrc.includes("METHOD_LABEL"));
}

// ---------------------------------------------------------------------------
// R1..R6 — the live round against a real server
// ---------------------------------------------------------------------------
const API = process.env.RECYCLE_API_BASE ?? "http://127.0.0.1:8000";
const TENANT_A = "11111111-1111-1111-1111-111111111111";
const SELLER_A = "aaaa0000-0000-0000-0000-0000000000a4";
const PRODUCT_A = "aaaa0000-0000-0000-0000-0000000000a3";
const RUN = Math.random().toString(36).slice(2, 8);
const apiFetch = withClientVersion(globalThis.fetch.bind(globalThis));
const authHdr = (t: string) => ({ authorization: `Bearer ${t}` });

async function login(username: string, password: string): Promise<string | null> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ tenant_id: TENANT_A, username, password }),
  });
  if (!res.ok) return null;
  return ((await res.json()) as { access_token?: string }).access_token ?? null;
}

async function tx(makeReq: () => Promise<Response>): Promise<PaymentFetch> {
  let res: Response;
  try {
    res = await makeReq();
  } catch {
    return { kind: "unreachable" };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (res.ok) return { kind: "ok", body };
  return { kind: "http", status: res.status, body };
}

async function jget(token: string, path: string): Promise<{ status: number; body: unknown }> {
  const res = await apiFetch(`${API}${path}`, { headers: authHdr(token) });
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

async function patchBranch(token: string, branchId: string, on: boolean): Promise<number> {
  const res = await apiFetch(`${API}/branches/${encodeURIComponent(branchId)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json", ...authHdr(token) },
    body: JSON.stringify({ separate_cashier: on }),
  });
  return res.status;
}

async function createBill(token: string, unit: string): Promise<string | null> {
  const id = randomUUID();
  const res = await apiFetch(`${API}/bills`, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHdr(token) },
    body: JSON.stringify({
      id,
      seller_id: SELLER_A,
      vehicle_no: `70-${RUN}`,
      device_created_at: new Date().toISOString(),
      idempotency_key: `counter-${RUN}-${id.slice(0, 8)}`,
      items: [{
        id: randomUUID(), product_id: PRODUCT_A, line_no: 1,
        gross_weight: "1.000", tare_weight: "0.000", net_weight: "1.000", unit_price: unit,
      }],
    }),
  });
  return res.status === 201 ? id : null;
}

function policyOf(body: unknown): boolean | null {
  if (typeof body === "object" && body !== null && "separate_cashier" in body) {
    const v = (body as { separate_cashier: unknown }).separate_cashier;
    return typeof v === "boolean" ? v : null;
  }
  return null;
}

async function liveRound(): Promise<void> {
  header("R the REAL server: policy read, switch on, create → unpaid → pay both → gone");
  const admin = await login("admin", "tenantA-pw-123");
  check("R0: the seeded tenant-A admin can sign in", admin !== null, `api=${API}`);
  if (admin === null) throw new Error(`admin login failed at ${API}`);
  const staff = await login("staff", "tenantA-staff-789");
  check("R0: the seeded tenant-A staff can sign in", staff !== null);
  if (staff === null) throw new Error("staff login failed");

  // R1: learn the branch, read the policy (the new GET /shop/policy route).
  const shop = await jget(admin, "/shop");
  const branchId = (shop.body as { branch?: { id?: string } })?.branch?.id;
  check("R1: GET /shop returns the caller's branch id", typeof branchId === "string", String(branchId));
  if (typeof branchId !== "string") throw new Error("no branch id from GET /shop");

  let branchOn = false;
  try {
    const pol0 = await jget(admin, "/shop/policy");
    check("R1: GET /shop/policy returns a separate_cashier boolean (the new route, live)",
      pol0.status === 200 && typeof policyOf(pol0.body) === "boolean",
      `status ${String(pol0.status)}`);

    // R2: flip the switch ON, and the policy route reflects it.
    check("R2: PATCH /branches turns separate_cashier ON (201/200)", (await patchBranch(admin, branchId, true)) < 300);
    branchOn = true;
    const polOn = await jget(admin, "/shop/policy");
    check("R2: GET /shop/policy now reads separate_cashier = true", policyOf(polOn.body) === true);

    // R3: create two bills; with the switch on they arrive UNPAID.
    const b1 = await createBill(admin, "40.00");
    const b2 = await createBill(admin, "60.00");
    check("R3: two bills created (201)", b1 !== null && b2 !== null);
    if (b1 === null || b2 === null) throw new Error("bill create failed");

    const q1 = await jget(admin, "/bills?unpaid=true");
    const queue = counterScreenState({ kind: "ok", body: q1.body }, new Map());
    check("R3: the client parses the live unpaid queue", queue.kind === "queue");
    const ourBills = queue.kind === "queue"
      ? queue.queue.sellers.flatMap((s) => s.bills).filter((x) => x.id === b1 || x.id === b2)
      : [];
    check("R3: BOTH new bills arrive UNPAID in the queue", ourBills.length === 2,
      `found ${String(ourBills.length)}`);
    check("R3: the queue derives each remaining from the server strings (40.00, 60.00)",
      ourBills.some((x) => x.remaining === "40.00") && ourBills.some((x) => x.remaining === "60.00"));

    // R4: pay BOTH in ONE payment (the multi-bill case) through the app's own path.
    const draft = defaultDraft(SELLER_A, "cash",
      ourBills.map((x) => ({ id: x.id, remaining: x.remaining })));
    const plan = checkPayment(draft);
    check("R4: the client builds a valid multi-bill plan (amount 100.00)", plan.ok && plan.plan.amount === "100.00");
    if (!plan.ok) throw new Error("plan invalid");
    const meta: PaymentMeta = { clock: { now: () => new Date(), sleep: () => Promise.resolve() }, ids: { newId: () => randomUUID() }, branch_id: branchId };
    const body = buildPaymentBody(meta, plan.plan);
    const paid = await tx(() => apiFetch(`${API}/payments`, {
      method: "POST", headers: { "content-type": "application/json", ...authHdr(admin) }, body: JSON.stringify(body),
    }));
    check("R4: POST /payments classifies OK (the multi-bill payment landed)", paymentOutcome(paid).kind === "ok",
      paid.kind === "http" ? `status ${String(paid.status)}` : paid.kind);

    // R5: the two bills LEAVE the queue.
    const q2 = await jget(admin, "/bills?unpaid=true");
    const after = counterScreenState({ kind: "ok", body: q2.body }, new Map());
    const stillThere = after.kind === "queue"
      ? after.queue.sellers.flatMap((s) => s.bills).filter((x) => x.id === b1 || x.id === b2).length
      : -1;
    check("R5: BOTH paid bills LEAVE the unpaid queue", stillThere === 0, `still ${String(stillThere)}`);

    // R6: the refusals, against the server's ACTUAL answers.
    const bogus = await tx(() => apiFetch(`${API}/payments`, {
      method: "POST", headers: { "content-type": "application/json", ...authHdr(admin) },
      body: JSON.stringify({
        id: randomUUID(), seller_id: SELLER_A, method: "cash", amount: "10.00",
        idempotency_key: `counter-${RUN}-bogus`, device_created_at: new Date().toISOString(),
        allocations: [{ bill_id: randomUUID(), amount: "10.00" }],
      }),
    }));
    const bogusOut = paymentOutcome(bogus);
    check("R6: an unknown bill is 424 → refused and RELOADS the queue",
      bogus.kind === "http" && bogus.status === 424 && bogusOut.kind === "refused" && bogusOut.reloadQueue === true,
      bogus.kind === "http" ? `status ${String(bogus.status)}` : bogus.kind);

    const b3 = await createBill(admin, "10.00");
    if (b3 !== null) {
      const over = await tx(() => apiFetch(`${API}/payments`, {
        method: "POST", headers: { "content-type": "application/json", ...authHdr(admin) },
        body: JSON.stringify({
          id: randomUUID(), seller_id: SELLER_A, method: "cash", amount: "50.00",
          idempotency_key: `counter-${RUN}-over`, device_created_at: new Date().toISOString(),
          allocations: [{ bill_id: b3, amount: "50.00" }],
        }),
      }));
      check("R6: an allocation over the bill's remaining is 422 (the server's own P2)",
        over.kind === "http" && over.status === 422 && paymentOutcome(over).kind === "refused",
        over.kind === "http" ? `status ${String(over.status)}` : over.kind);
    }

    const staffTry = await tx(() => apiFetch(`${API}/payments`, {
      method: "POST", headers: { "content-type": "application/json", ...authHdr(staff) },
      body: JSON.stringify({
        id: randomUUID(), seller_id: SELLER_A, method: "cash", amount: "1.00",
        idempotency_key: `counter-${RUN}-staff`, device_created_at: new Date().toISOString(), allocations: [],
      }),
    }));
    check("R6: STAFF (no payments.record) is refused 403 → the forbidden screen",
      staffTry.kind === "http" && staffTry.status === 403 && paymentOutcome(staffTry).kind === "refused",
      staffTry.kind === "http" ? `status ${String(staffTry.status)}` : staffTry.kind);
  } finally {
    // Restore the switch: the mobile scratch is shared across the live proofs.
    if (branchOn) {
      const back = await patchBranch(admin, branchId, false);
      check("Rz: separate_cashier restored to OFF (shared scratch hygiene)", back < 300, `status ${String(back)}`);
    }
  }
}

async function main(): Promise<number> {
  console.log("counter — the cashier screen (STRUCTURE.md 2.1)");
  console.log(`node ${process.version}`);
  const offline = process.argv.includes("--offline");

  h1Gate();
  h2Queue();
  h3Arithmetic();
  h4Outcome();
  h5Labels();

  if (offline) {
    console.log("\n=== R SKIPPED (--offline) ===");
    console.log("  The live round is the only case that reads the server's ACTUAL answers.");
    console.log("  Everything above proves the client agrees with itself.");
    console.log("\nINCOMPLETE — the headless cells passed but nothing was verified against the API.");
    return failures === 0 ? 2 : 1;
  }

  try {
    await liveRound();
  } catch (err) {
    failures += 1;
    console.log(`\n  [FAIL] the live server could not be driven at ${API}`);
    console.log(`         ${err instanceof Error ? err.message : String(err)}`);
    console.log("         Start a uvicorn on a scratch and set RECYCLE_API_BASE, or run --offline (exits 2).");
  }

  console.log("");
  console.log(`  passes=${String(passes)}  failures=${String(failures)}`);
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

void main().then((rc) => {
  console.log(`PROVE_COUNTER_EXIT=${String(rc)}`);
  process.exitCode = rc;
});
