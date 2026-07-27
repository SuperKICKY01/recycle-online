/**
 * HOW OLD IS THE PRICE ON THE SCREEN, AND MAY THE APP FILL IT IN FOR YOU?
 *
 * PURE TypeScript — no React Native, no Expo, no node — so the headless proof
 * exercises exactly the sentences and exactly the gate the device runs. Wording
 * lives here rather than in app/ for the reason recorded in
 * lessons/correct-classification-can-still-render-as-an-error.md: files under
 * app/ are outside the proven surface, and every operator-facing sentence that
 * ever shipped wrong was one no proof could see.
 *
 * ---------------------------------------------------------------------------
 * THE PROBLEM THIS MODULE IS THE ANSWER TO
 * ---------------------------------------------------------------------------
 * Phase 2c-8 makes the yard able to work with the server unreachable, which
 * means products and their price tiers now come out of a local cache. A cache
 * goes stale. If the office raises a price overnight and the yard is offline at
 * 07:00, staff pay cash against yesterday's number.
 *
 * That is not a display bug, it is a money bug with a disguise. The server
 * stamps `list_price` from the CURRENT list at sync time (server/app/bills.py,
 * and it discards whatever the client sent). So a bill priced from a stale cache
 * arrives with unit_price != list_price — which is exactly the shape of a
 * deliberate staff override. The overpayment is real, banked, and looks routine.
 *
 * ---------------------------------------------------------------------------
 * IS THERE AN AGE PAST WHICH THE APP SHOULD REFUSE TO DEFAULT A PRICE?
 * The decision, with the case against it stated first and honestly.
 * ---------------------------------------------------------------------------
 *
 * AGAINST a cutoff — warn, but always default:
 *
 *   1. lessons/fallback-default-is-a-wrong-number.md does NOT reach this case,
 *      and it would be sloppy to claim it does. That rule is "a default that
 *      cannot make the operation succeed is not a convenience". A stale price
 *      CAN succeed: the server accepts whatever unit_price it is given. So this
 *      is a different question and has to be argued on its own.
 *   2. Prices move rarely. On most days the cached number is simply correct, and
 *      a cutoff punishes every one of those days for the sake of the few.
 *   3. A blank field does not produce silence, it produces a TYPED number. That
 *      number can be wrong too, and typing is where fat-finger errors enter
 *      money — a field the operator never touched cannot be mistyped.
 *   4. The cliff is arbitrary. 11h59m defaults, 12h01m does not, while the
 *      underlying risk changes smoothly. A threshold pretends to know something
 *      it does not.
 *   5. It bites hardest exactly when the app is under most strain — the offline
 *      morning this whole phase exists to rescue. Blanking every price on the
 *      first shift after an outage is a real cost to a real yard.
 *
 * FOR a cutoff:
 *
 *   1. A banner is read on day one and invisible by day five. A blank field is
 *      not something you can stop noticing; it is the only state that makes the
 *      operator make the decision the system cannot make for them.
 *   2. The blank does not route to nothing, it routes to a BETTER source: the
 *      person standing in the yard, who knows today's board price. The cache is
 *      the only party in the room that cannot have heard about a change.
 *   3. It makes the record honest. Either way the bill may land with
 *      unit_price != list_price — but a hand-entered price makes that row a TRUE
 *      override, whereas a defaulted one makes it a lie the office will act on.
 *   4. The asymmetry is enormous. Retyping a price costs three taps on the pad.
 *      Paying a withdrawn price on a two-tonne load costs thousands of baht, and
 *      the shop finds out weeks later, if ever.
 *
 * CHOSEN: yes, a cutoff, at 12 HOURS — and note what makes that survivable,
 * because the cutoff alone would be a bad idea. Passing it does NOT block
 * anything. The seller can be picked, the load weighed, the bill saved, queued
 * and synced. The ONLY thing withdrawn is the app volunteering a number it
 * cannot stand behind. The cached number is still shown, clearly labelled as
 * old, right next to the empty field — so the operator is informed, not blinded.
 *
 * WHY 12 AND NOT 24 OR 6: 12 hours is the shortest window that a normal working
 * day cannot cross on its own. A device used all day refreshes constantly, so a
 * 12-hour-old cache means the device has been out of contact across a period
 * when the yard was CLOSED and the office was open — which is precisely when
 * prices are changed. Six hours would trip during a long afternoon with poor
 * signal, for data nobody could have changed. Twenty-four would sail straight
 * through the overnight case that is the entire reason for the rule.
 *
 * This number is a judgement, not a measurement. It is one constant, in one
 * place, named, and the proof prints what it costs on both sides.
 */
import { shopDateTime } from "../time/shopTime.js";

/* ------------------------------------------------------------ thresholds -- */

/**
 * Past this, the app stops defaulting a price into the money field. See the
 * whole argument above; this is the number it lands on.
 */
export const PRICE_DEFAULT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Under this, the data counts as JUST fetched and nothing is said about it.
 *
 * It is not zero because a refresh that completed ninety seconds ago is not
 * something an operator needs a banner about, and a banner that is always on
 * screen is a banner nobody reads. It is small enough that a cache from the
 * previous shift can never fall inside it.
 */
export const FRESH_MAX_AGE_MS = 5 * 60 * 1000;

/* ------------------------------------------------------------- the state -- */

/**
 * empty  — one of the two lists has NEVER been fetched. No bill can be started.
 * fresh  — refreshed within the last few minutes. Nothing to say.
 * aging  — cached, usable, and the operator is told how old it is.
 * stale  — past the cutoff (or the device clock makes the age unknowable).
 *          Prices are not defaulted; everything else still works.
 */
export type MasterState = "empty" | "fresh" | "aging" | "stale";

export interface Freshness {
  state: MasterState;
  /**
   * The OLDER of the two fetch times — what actually bounds a price default.
   *
   * A default needs both halves: the product's tier list AND the seller's grade
   * to select a tier with. Trusting the fresher of the two would let a grade
   * cached last week pick a tier out of a list fetched a second ago and call the
   * result current. Null when either list has never been fetched.
   */
  asOf: string | null;
  /** Age of `asOf` in ms, clamped at 0. Null when there is nothing cached. */
  ageMs: number | null;
  /** May a tier price be written into the money field as a default? */
  mayDefaultPrice: boolean;
  haveProducts: boolean;
  haveSellers: boolean;
  /**
   * The last fetch is dated in the FUTURE by more than the fresh window, so the
   * device clock has moved and the age cannot be believed. Device clocks are
   * untrusted (hard rule 7); the money answer is to fail closed, not to render a
   * negative age as "0 minutes old" and default from it.
   */
  clockSuspect: boolean;
}

export interface FreshnessInput {
  productsFetchedAt: string | null;
  sellersFetchedAt: string | null;
  /** Now, as an ISO instant. Injected so the proof owns the clock. */
  now: string;
}

const msOf = (iso: string): number | null => {
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
};

/**
 * What the device knows and how much it may act on it.
 *
 * An UNPARSEABLE timestamp is treated exactly like a missing one — never like a
 * fresh one. A corrupt row must not be the thing that unlocks a price default.
 */
export function assessFreshness(input: FreshnessInput): Freshness {
  const now = msOf(input.now);
  const p = input.productsFetchedAt === null ? null : msOf(input.productsFetchedAt);
  const s = input.sellersFetchedAt === null ? null : msOf(input.sellersFetchedAt);
  const haveProducts = p !== null;
  const haveSellers = s !== null;

  if (p === null || s === null || now === null) {
    return {
      state: "empty",
      asOf: null,
      ageMs: null,
      mayDefaultPrice: false,
      haveProducts,
      haveSellers,
      clockSuspect: false,
    };
  }

  // The older fetch wins — see Freshness.asOf.
  const asOfMs = Math.min(p, s);
  const asOf = new Date(asOfMs).toISOString();
  const ageMs = Math.max(0, now - asOfMs);

  /*
   * THE CLOCK CHECK READS THE NEWEST FETCH, NOT THE ONE WE REPORT.
   *
   * Found by the C1 sweep, and it is worth stating because the first version was
   * wrong in the dangerous direction. A stored timestamp in the future can only
   * mean the device clock has moved BACKWARDS since it was written — and a
   * backwards clock makes `now - stored` smaller, so every age is UNDERSTATED
   * and old data looks fresh. That is the direction that defaults a stale price.
   *
   * Checking `asOf` (the oldest) missed it whenever only one of the two lists
   * was affected: the min silently picked the other, still-plausible timestamp
   * and the assessment carried on as if nothing had happened. Any timestamp in
   * the future condemns BOTH ages, so the test is on the newest one.
   */
  const clockSuspect = now - Math.max(p, s) < -FRESH_MAX_AGE_MS;

  if (clockSuspect) {
    return {
      state: "stale",
      asOf,
      ageMs,
      mayDefaultPrice: false,
      haveProducts,
      haveSellers,
      clockSuspect: true,
    };
  }
  if (ageMs > PRICE_DEFAULT_MAX_AGE_MS) {
    return {
      state: "stale",
      asOf,
      ageMs,
      mayDefaultPrice: false,
      haveProducts,
      haveSellers,
      clockSuspect: false,
    };
  }
  return {
    state: ageMs <= FRESH_MAX_AGE_MS ? "fresh" : "aging",
    asOf,
    ageMs,
    mayDefaultPrice: true,
    haveProducts,
    haveSellers,
    clockSuspect: false,
  };
}

/* --------------------------------------------------------------- the gate */

/**
 * THE ONE PLACE a tier price becomes a DEFAULT.
 *
 * Takes the whole freshness rather than a bare boolean so a call site cannot
 * pass `true` out of habit — the value has to come from an assessment. This is
 * deliberately NOT folded into gradePrice(): that function answers "what is this
 * grade's tier", which the screen still needs in order to SHOW the cached number
 * beside the empty box. Reference and default are two different questions and
 * conflating them is how the cached price would either vanish entirely or leak
 * back into the money field.
 */
export function defaultUnitPrice(
  tier: string | null,
  freshness: Pick<Freshness, "mayDefaultPrice">,
): string | null {
  return freshness.mayDefaultPrice ? tier : null;
}

/* -------------------------------------------------------------- wording -- */

/**
 * An age a person reads, in Thai. Whole units only — "เก่า 14 ชั่วโมง" is the
 * useful fact; "14 ชั่วโมง 22 นาที" is precision nobody acts on.
 */
export function thaiAge(ms: number): string {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "ไม่ถึง 1 นาที";
  if (mins < 60) return `${String(mins)} นาที`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${String(hours)} ชั่วโมง`;
  return `${String(Math.floor(hours / 24))} วัน`;
}

export type MasterTone = "block" | "warn" | "info";

export interface MasterNotice {
  tone: MasterTone;
  message: string;
}

const CONNECT_ONCE =
  "ต้องต่อเน็ตและเข้าสู่ระบบสักครั้งก่อน จึงจะเริ่มบันทึกบิลได้";

/**
 * What the operator reads about the data underneath them, or null when there is
 * nothing worth saying.
 *
 * `block` is the only tone that means "you cannot work". `stale` is amber and
 * says what the app will NOT do — it never claims the bill cannot be written,
 * because it can, and promising less than the system does is its own kind of
 * lie (the mirror of the promise-too-much rule in
 * lessons/correct-classification-can-still-render-as-an-error.md).
 */
export function masterNotice(f: Freshness): MasterNotice | null {
  if (f.state === "empty") {
    // Name WHICH list is missing. "No data" sends someone hunting; "no seller
    // list" tells the office exactly what to check.
    const what =
      !f.haveProducts && !f.haveSellers
        ? "ยังไม่มีรายชื่อผู้ขายและรายการสินค้าในเครื่องนี้"
        : !f.haveSellers
          ? "ยังไม่มีรายชื่อผู้ขายในเครื่องนี้"
          : "ยังไม่มีรายการสินค้าในเครื่องนี้";
    return { tone: "block", message: `${what} — ${CONNECT_ONCE}` };
  }

  if (f.state === "fresh") return null;

  const asOf = f.asOf === null ? "" : shopDateTime(f.asOf);
  const age = f.ageMs === null ? "" : thaiAge(f.ageMs);

  if (f.state === "aging") {
    return {
      tone: "info",
      message:
        `ใช้ข้อมูลผู้ขายและราคาที่เก็บไว้ในเครื่อง` +
        ` อัปเดตล่าสุด ${asOf} (เก่า ${age})`,
    };
  }

  if (f.clockSuspect) {
    return {
      tone: "warn",
      message:
        "เวลาในเครื่องไม่ตรงกับเวลาที่ดึงข้อมูลครั้งล่าสุด จึงบอกไม่ได้ว่าราคาที่เก็บไว้เก่าแค่ไหน" +
        " — ระบบจะไม่กรอกราคาให้ ต้องกรอกราคาที่ตกลงกับผู้ขายเอง บันทึกบิลได้ตามปกติ",
    };
  }

  return {
    tone: "warn",
    message:
      `ราคาที่เก็บไว้ในเครื่องเก่าเกิน 12 ชั่วโมง (อัปเดตล่าสุด ${asOf} — เก่า ${age})` +
      " — ระบบจะไม่กรอกราคาให้ ต้องกรอกราคาที่ตกลงกับผู้ขายเอง บันทึกบิลได้ตามปกติ",
  };
}

/**
 * The line under the price field: why the box is empty, and what the device
 * last knew the price to be.
 *
 * The cached number is SHOWN rather than hidden. Withholding it would not make
 * anyone safer — the operator would type a remembered number with no idea it
 * differs from what the shop last published — and it is the one piece of
 * information the device actually holds. Labelled as old, beside an empty box,
 * it is evidence. Inside the box it would be an assertion.
 */
export function stalePriceHint(tier: string | null, f: Freshness): string | null {
  if (f.mayDefaultPrice || f.state === "empty") return null;
  const when = f.asOf === null ? "" : shopDateTime(f.asOf);
  if (tier === null) {
    return "ไม่ได้กรอกราคาให้ เพราะข้อมูลราคาในเครื่องเก่าเกินไป — กรอกราคาที่ตกลงกันเอง";
  }
  return (
    `ไม่ได้กรอกราคาให้ เพราะข้อมูลราคาในเครื่องเก่าเกินไป` +
    ` — ราคาตามเกรดที่เครื่องเก็บไว้ล่าสุดคือ ${tier} บาท (เมื่อ ${when})`
  );
}

/* ------------------------------------------- what the bill records, after -- */

/**
 * HOW A BILL PRICED FROM STALE DATA IS TOLD APART AFTERWARDS.
 *
 * The bill carries `master_as_of`: the fetch time of the master data that was
 * available when the draft was started. It is raw evidence, not a verdict — the
 * age is computed against the bill's own device_created_at, so a reader can
 * apply whatever threshold they like later without the row having baked one in.
 *
 * WHY THE DRAFT'S START AND NOT THE SAVE. The cache can only ever get NEWER
 * while a bill is open, so the value at the start is the oldest data any line on
 * this bill could have been priced from. Stamping at save time would report a
 * refresh that arrived after the prices were already typed — a false negative on
 * a money marker, which is the direction that hides things. The start time can
 * overstate staleness for a bill whose data refreshed mid-cart; a false positive
 * costs someone a glance.
 *
 * KNOWN LIMIT, stated rather than discovered later: this is PER BILL, not per
 * line, and it is on the DEVICE ONLY. It is not sent and there is nowhere on the
 * server to put it — see the note at the end of this file.
 */
export interface PricingProvenance {
  master_as_of: string | null;
  device_created_at: string;
}

export function pricingProvenanceLine(bill: PricingProvenance): string | null {
  if (bill.master_as_of === null) return null;
  const asOf = msOf(bill.master_as_of);
  const made = msOf(bill.device_created_at);
  if (asOf === null || made === null) return null;
  const age = made - asOf;
  if (age <= FRESH_MAX_AGE_MS) return null;
  return (
    `ตอนบันทึกบิลนี้ ใช้ข้อมูลราคาที่เก็บไว้ในเครื่องเมื่อ ${shopDateTime(bill.master_as_of)}` +
    ` (เก่า ${thaiAge(age)} ณ ตอนบันทึก)`
  );
}

/*
 * ---------------------------------------------------------------------------
 * WHAT THIS CANNOT DO, AND WHAT IT WOULD TAKE — READ BEFORE ASSUMING IT IS DONE
 * ---------------------------------------------------------------------------
 * `master_as_of` lives on the device and nowhere else. The device can therefore
 * always answer "was this bill priced from old data", and the bill card does.
 *
 * THE OFFICE CANNOT. Reconciliation happens on the server, where the only
 * visible symptom is unit_price != list_price — indistinguishable from a
 * deliberate override, which is the exact confusion this phase set out to
 * remove. Closing that would need a SERVER FIELD, and this phase forbids adding
 * one, so it is named here and stopped:
 *
 *   purchase_bill_items.client_list_price  NUMERIC(14,2) NULL
 *     — what the DEVICE believed the list price was. The client already sends
 *       list_price on every item and bills.py deliberately discards it
 *       (BillItemIn does not declare the field). Keeping it alongside the
 *       server's own stamp turns "did the yard override the price, or was it
 *       working from an old list" into a comparison of two stored numbers.
 *   purchase_bills.device_master_as_of     TIMESTAMPTZ NULL
 *     — this module's value, so the age is auditable rather than inferred.
 *
 * Neither is added. Owner's call.
 */
