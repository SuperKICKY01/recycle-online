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
import { instantMs, pastStampSuspect } from "../time/clockSanity.js";
import { shopDateTime } from "../time/shopTime.js";

/* ------------------------------------------------------------ thresholds -- */

/*
 * ===========================================================================
 * TWO THRESHOLDS, AND THEY ARE NOT THE SAME KIND OF THING.
 * ===========================================================================
 * They used to be called `PRICE_DEFAULT_MAX_AGE_MS` and `FRESH_MAX_AGE_MS` — a
 * shared `_MAX_AGE_MS` suffix on two numbers three orders of magnitude apart,
 * one cosmetic and one money-critical. They were mixed up repeatedly, including
 * in a phase brief, and the failure mode is SILENT IN THE DANGEROUS DIRECTION:
 * reach for "the freshness constant", change the wrong one, and the staleness
 * banner goes quiet while the price gate stays exactly where it was. Nothing
 * fails, no proof goes red, and the yard keeps being handed a number the app
 * cannot stand behind.
 *
 * So neither is "the freshness constant" any more. One names the MONEY, the
 * other names the moment it describes.
 */

/**
 * ⚠ MONEY-CRITICAL. Past this age, the app STOPS VOLUNTEERING A PRICE into the
 * money field — the operator types the agreed number instead.
 *
 * See the whole argument above; this is the number it lands on. Twelve hours is
 * the shortest window a normal working day cannot cross on its own.
 *
 * NOT [[JUST_FETCHED_WINDOW_MS]], which is five minutes and decides only whether
 * a BANNER is drawn. CHANGING THIS ONE DOES NOT change when the operator is told
 * the data is old; it changes when cash stops being paid against a cached price.
 * Raising it means a staler price may be auto-filled and banked. Lowering it
 * means more hand-typed prices, which is safe but costs taps.
 */
export const PRICE_DEFAULT_CUTOFF_MS = 12 * 60 * 60 * 1000;

/**
 * Under this, the data counts as JUST fetched and nothing is said about it.
 * Presentation only — it decides whether a BANNER appears, nothing else.
 *
 * It is not zero because a refresh that completed ninety seconds ago is not
 * something an operator needs a banner about, and a banner that is always on
 * screen is a banner nobody reads. It is small enough that a cache from the
 * previous shift can never fall inside it.
 *
 * NOT [[PRICE_DEFAULT_CUTOFF_MS]], which is twelve hours and gates the money.
 * CHANGING THIS ONE DOES NOT change whether a price is auto-filled, and it
 * cannot make the app pay out on staler data. The worst it can do is make the
 * yard louder or quieter about an age it is already being shown.
 *
 * SECOND, BORROWED USE: it is also passed to `pastStampSuspect` as the tolerance
 * on "a stored stamp cannot be in the future". That is a genuine reuse of the
 * value and not of the meaning — see the call site, which says why the number
 * happens to suit both. If this is ever tuned for banner reasons, check that
 * call site before assuming nothing else moved.
 */
export const JUST_FETCHED_WINDOW_MS = 5 * 60 * 1000;

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
   * WHY the list is missing, when it is: the device holds one, and it belongs to
   * ANOTHER SHOP. Carried through untouched from the store, which is the only
   * layer that can know it.
   *
   * It changes the SENTENCE and never the STATE. A tenant mismatch is `empty`
   * exactly like a list that was never fetched — same block, same stopped
   * button — because the cash consequence is identical. What differs is the
   * remedy the operator is given, and telling them the wrong one at five in the
   * morning is the whole cost of folding these together.
   */
  productsNotThisShop: boolean;
  sellersNotThisShop: boolean;
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
  /**
   * From MasterSnapshot, unchanged. REQUIRED rather than optional-with-a-default:
   * a caller that forgets is a compile error, not a screen that silently reverts
   * to the never-fetched sentence on a device holding another shop's prices.
   */
  productsNotThisShop: boolean;
  sellersNotThisShop: boolean;
  /** Now, as an ISO instant. Injected so the proof owns the clock. */
  now: string;
}

/**
 * Parsing moved to time/clockSanity.ts so there is ONE definition of "this
 * string is not a usable instant" shared with the sync side. Unchanged
 * behaviour: unparseable is null, and null is treated exactly like missing.
 */
const msOf = instantMs;

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
  // Carried, never recomputed: only the store can know whose rows these are.
  const productsNotThisShop = input.productsNotThisShop;
  const sellersNotThisShop = input.sellersNotThisShop;

  if (p === null || s === null || now === null) {
    return {
      state: "empty",
      asOf: null,
      ageMs: null,
      mayDefaultPrice: false,
      haveProducts,
      haveSellers,
      productsNotThisShop,
      sellersNotThisShop,
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
   *
   * THE PREDICATE ITSELF now lives in time/clockSanity.ts, unchanged in meaning
   * — `now - newest < -TOL` is exactly `newest - now > TOL`. It moved because
   * the send queue needs the same rule against a different bound, and one rule
   * written twice is two behaviours waiting to drift. What stays HERE is the
   * REACTION, which is the opposite of the queue's: this fails CLOSED.
   *
   * THE TOLERANCE IS BORROWED, AND THIS IS THE ONE PLACE THAT MATTERS.
   * JUST_FETCHED_WINDOW_MS is a BANNER threshold everywhere else; here its VALUE
   * is reused as the slack on "a stored stamp cannot be in the future". Five
   * minutes suits both by coincidence of scale rather than by meaning: it is far
   * wider than any jitter between writing and reading a stamp with one device
   * clock, and far narrower than the smallest clock move worth reacting to (the
   * coarsest timezone step is 15 minutes).
   *
   * So if that constant is ever retuned FOR BANNER REASONS, this line moves with
   * it. Widening it to quieten the strip would also widen how far into the future
   * a stamp may sit before the app stops trusting its own ages — and that is the
   * direction that defaults a stale price. Give it its own constant before
   * tuning, rather than accepting the coupling silently.
   */
  const clockSuspect = pastStampSuspect(Math.max(p, s), now, JUST_FETCHED_WINDOW_MS);

  if (clockSuspect) {
    return {
      state: "stale",
      asOf,
      ageMs,
      mayDefaultPrice: false,
      haveProducts,
      haveSellers,
      productsNotThisShop,
      sellersNotThisShop,
      clockSuspect: true,
    };
  }
  if (ageMs > PRICE_DEFAULT_CUTOFF_MS) {
    return {
      state: "stale",
      asOf,
      ageMs,
      mayDefaultPrice: false,
      haveProducts,
      haveSellers,
      productsNotThisShop,
      sellersNotThisShop,
      clockSuspect: false,
    };
  }
  return {
    state: ageMs <= JUST_FETCHED_WINDOW_MS ? "fresh" : "aging",
    asOf,
    ageMs,
    mayDefaultPrice: true,
    haveProducts,
    haveSellers,
    productsNotThisShop,
    sellersNotThisShop,
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

/**
 * MAY A BILL BE STARTED AT ALL? The stop, and the only expression that decides it.
 *
 * A STOP AT THE POINT OF OPENING, NOT A FAILURE AT THE POINT OF SAVING. Without
 * a seller list there is nobody to file the bill to, and that is structural
 * rather than a policy: `local_draft.seller_id` is NOT NULL (schema.ts), so a
 * draft cannot even be created; `purchase_bills.seller_id` is NOT NULL with a
 * composite FK into the tenant's own sellers (migration 0001); and a bill naming
 * a seller this tenant cannot see comes back 422 — the one TERMINAL class on the
 * send path, so the load dies with the cash already out of the drawer. The
 * alternative to stopping here is the operator weighing a full truck with the
 * seller standing in front of them and being told at the END that none of it can
 * be recorded.
 *
 * EXTRACTED FROM App.tsx, and for the reason sessionStateOf and maySync were:
 * files under app/ are outside the node proof program entirely, so this
 * expression previously existed only at a render site no assertion could reach.
 * A gate proven against a COPY of itself is a claim about the copy.
 *
 * It reads `state` alone and deliberately not the two "not this shop" flags: a
 * tenant mismatch already produces `empty` in the store, and a second condition
 * here would be a second mechanism that could disagree with the first — a green
 * then being evidence about whichever still worked
 * (lessons/a-green-cell-is-evidence-about-the-assertion-not-the-claim.md, 3).
 */
export function mayStartBill(f: Pick<Freshness, "state">): boolean {
  return f.state !== "empty";
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
 * WHICH list is missing, as the noun phrase both empty-state sentences build on.
 *
 * "No data" sends someone hunting; "no seller list" tells the office exactly
 * what to check. Extracted so the two sentences below cannot drift into naming
 * different lists for the same state.
 */
function missingLists(f: Freshness): string {
  if (!f.haveProducts && !f.haveSellers) return "รายชื่อผู้ขายและรายการสินค้า";
  if (!f.haveSellers) return "รายชื่อผู้ขาย";
  return "รายการสินค้า";
}

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
    const what = missingLists(f);
    /*
     * TWO ABSENCES, TWO SENTENCES, ONE STOP.
     *
     * Both are `block` and both stop the same button. They are separated because
     * the REMEDIES are different and an operator acts on the remedy: a device
     * that never fetched needs a first sign-in, a device holding a list that is
     * not this shop's needs a fetch it can retry the moment the signal returns.
     *
     * THIS SENTENCE DELIBERATELY NEVER SAYS "เข้าสู่ระบบ", and that is a
     * requirement rather than a style choice. There is NO identity-based weighing
     * block in this app today — nothing anywhere refuses to start a bill for want
     * of a signed-in person; an absent identity parks ROWS, it does not stop the
     * scale. When one is written it will say "sign in", and the two must not be
     * confusable: one waits for a CONNECTION and the other waits for a PERSON,
     * and an operator sent to find the wrong one waits for something that is
     * never going to arrive. Whoever adds that block: keep it off this sentence,
     * and keep "ต่อเน็ต"/"ลองใหม่" off theirs.
     *
     * If ANY missing list is not this shop's, this wording wins even when the
     * other list was merely never fetched — its remedy (connect, fetch this
     * shop's data) resolves both, while CONNECT_ONCE's "sign in once" is simply
     * false about a device that is already signed in.
     */
    if (f.productsNotThisShop || f.sellersNotThisShop) {
      return {
        tone: "block",
        message:
          `${what}ที่เก็บไว้ในเครื่องนี้ไม่ใช่ของร้านนี้ จึงใช้ไม่ได้` +
          ` — ต้องต่อเน็ตเพื่อดึง${what}ของร้านนี้มาก่อน จึงจะเริ่มบันทึกบิลได้` +
          ` ลองใหม่ได้เมื่อเน็ตกลับมา`,
      };
    }
    return { tone: "block", message: `ยังไม่มี${what}ในเครื่องนี้ — ${CONNECT_ONCE}` };
  }

  if (f.state === "fresh") return null;

  const asOf = f.asOf === null ? "" : shopDateTime(f.asOf);
  const age = f.ageMs === null ? "" : thaiAge(f.ageMs);

  /*
   * WHICH HALF OF THIS SENTENCE IS A FACT.
   *
   * `asOf` is a STORED STAMP — the shop-time instant the fetch actually
   * completed. It is true whatever the clock has done since.
   *
   * `age` is `now - asOf`, DERIVED from the device clock, and a forward jump
   * makes it arbitrarily wrong: a 14h jump renders data fetched two minutes ago
   * as "เก่า 14 ชั่วโมง". That direction is not detectable from one stamp (an
   * ordinary 14h-old cache looks identical), so it cannot be gated away — see
   * time/clockSanity.ts on what a single stamp can and cannot bound.
   *
   * What CAN be fixed is the claim. The fetch time leads, and the age is
   * attributed to the device's clock instead of asserted as a fact about the
   * data. A banner that is occasionally absurd is a banner staff stop reading,
   * and the fetch time beside it is what lets someone see for themselves that
   * the age is nonsense. Same discipline as never rendering a diagnostic:
   * lessons/correct-classification-can-still-render-as-an-error.md.
   */
  if (f.state === "aging") {
    return {
      tone: "info",
      message:
        `ใช้ข้อมูลผู้ขายและราคาที่เก็บไว้ในเครื่อง` +
        ` อัปเดตล่าสุด ${asOf} (ตามเวลาในเครื่อง เก่า ${age})`,
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
      `ข้อมูลราคาในเครื่องอัปเดตล่าสุด ${asOf} (ตามเวลาในเครื่อง เก่า ${age} — เกิน 12 ชั่วโมง)` +
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

  /*
   * A NEGATIVE AGE IS NOT A FRESH BILL — IT IS A CLOCK THAT MOVED.
   *
   * master_as_of is stamped when the draft is STARTED and never moves after
   * (SqliteDraftStore.save excludes it from the DO UPDATE list), and
   * device_created_at is stamped when the bill is BUILT. So asOf <= made holds
   * by construction, and the largest gap the writer could have produced in the
   * other direction is zero: predicate 1, with no tolerance to allow, because
   * these two stamps are strictly ordered rather than concurrent.
   *
   * The old code computed `age = made - asOf` and returned null for anything
   * `<= JUST_FETCHED_WINDOW_MS`. A backwards clock jump between opening the cart and
   * saving makes that difference NEGATIVE, which sails through the same test —
   * so the marker vanished on exactly the bill most likely to have been priced
   * from a cache of unknowable age. A false negative on a money marker, which
   * is the direction that hides things (Rule 4,
   * lessons/cached-master-data-is-a-price-claim.md).
   *
   * It FAILS CLOSED: the line is shown, and it states the fetch time — which is
   * a stored fact — instead of an age it cannot compute. Naming the clock is
   * also the only honest thing to say, because "how old was this data" genuinely
   * has no answer once the clock has moved underneath it.
   */
  if (pastStampSuspect(asOf, made, 0)) {
    return (
      `ตอนบันทึกบิลนี้ ใช้ข้อมูลราคาที่เก็บไว้ในเครื่องเมื่อ ${shopDateTime(bill.master_as_of)}` +
      ` — เวลาในเครื่องเปลี่ยนระหว่างทำบิล จึงบอกไม่ได้ว่าข้อมูลเก่าแค่ไหน`
    );
  }

  const age = made - asOf;
  // Banner threshold again, not the money one: this decides whether the bill
  // card mentions its pricing provenance AFTER THE FACT. Whether the price was
  // auto-filled in the first place was decided at entry time by
  // PRICE_DEFAULT_CUTOFF_MS, twelve hours out — so a bill priced from data 30
  // minutes old is labelled here and was still auto-filled, correctly. Changing
  // this constant does not change what was paid; it changes what the card says
  // about it.
  if (age <= JUST_FETCHED_WINDOW_MS) return null;
  return (
    `ตอนบันทึกบิลนี้ ใช้ข้อมูลราคาที่เก็บไว้ในเครื่องเมื่อ ${shopDateTime(bill.master_as_of)}` +
    ` (ตามเวลาในเครื่อง เก่า ${thaiAge(age)} ณ ตอนบันทึก)`
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
