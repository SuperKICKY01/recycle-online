/**
 * PRICE EDITING ON THE PHONE — every decision, as pure functions.
 *
 * P1.9. No React Native, no Expo, no node, no fetch, so the headless proof runs
 * exactly the sentences and exactly the branches the handset runs. Same rule,
 * and the same reason, as dailyView.ts and signOutNotice.ts: files under `app/`
 * are outside the proven surface, and every operator-facing sentence that ever
 * shipped wrong was one no proof could see
 * (lessons/correct-classification-can-still-render-as-an-error.md).
 *
 * The view renders what this returns and decides nothing.
 *
 * ---------------------------------------------------------------------------
 * WHO THIS SCREEN IS FOR, AND WHAT MAKES IT DIFFERENT FROM EVERY OTHER ONE
 * ---------------------------------------------------------------------------
 * Every other screen in this app SPENDS the price list. This one MOVES it. A
 * mistake here is not one wrong bill, it is every bill written afterwards until
 * somebody notices — and the yard pays cash against the number, so "notices"
 * means after the money has gone.
 *
 * Three consequences run through the whole file:
 *
 *   NOTHING IS DEFAULTED. A tier with no row renders EMPTY and says so. A tier
 *   that has one renders that exact string. There is no third case and no
 *   fallback (lessons/fallback-default-is-a-wrong-number.md — a default price
 *   is a default AMOUNT OF MONEY).
 *
 *   THE INPUT IS BOUNDED BY THE COLUMN, not by what looks sensible.
 *   `product_prices.price` is `numeric(14,2)` and NUMERIC ROUNDS an over-scale
 *   value rather than refusing it, so a bound declared anywhere short of the
 *   column is a silent rewrite of somebody's money
 *   (lessons/edge-must-reject-what-the-column-rounds.md).
 *
 *   A SAVE THAT DID NOT REACH THIS PHONE'S OWN LIST IS SAID OUT LOUD. The
 *   server stamps `list_price` from the CURRENT list at sync time, so a bill
 *   priced off a stale cache arrives shaped exactly like a deliberate staff
 *   override and is indistinguishable afterwards
 *   (lessons/cached-master-data-is-a-price-claim.md). "Saved" and "this device
 *   now knows" are two facts, and this file refuses to print the first as
 *   though it were the second.
 */
import { MONEY_DP, MONEY_MAX_INT_DIGITS, parseDecimal } from "../money/money.js";
import type { Parsed } from "../money/money.js";
import { mayEditPrices } from "../session/deviceRole.js";
import type { DeviceRole } from "../session/deviceRole.js";

/* ----------------------------------------------------------- the grades -- */

/**
 * THE TIER SET THIS SCREEN LISTS — AND IT IS A FIFTH COPY OF A CLOSED SET, SAID
 * OUT LOUD BECAUSE THE OTHER FOUR ARE COUNTED SOMEWHERE.
 *
 * `OPEN_ITEMS.md § Decisions open` records the grade set as closed in FOUR
 * places, all server-side: the `product_prices.grade` and
 * `purchase_bill_items.grade` CHECKs in `0001_initial_schema.py`,
 * `ck_sellers_grade` in `0003_move_grade_to_sellers.py`, and
 * `Grade = Literal["A","B","C","D"]` in `server/app/master.py`. S16 — the
 * per-tenant grade model — opens all four. This is the FIFTH, it is the first
 * one on a client, and S16 opens it too.
 *
 * WHY IT CANNOT BE AVOIDED TODAY, which is the part that makes it a finding and
 * not a shortcut. `GET /products` returns `prices` as a map of the tiers that
 * HAVE ROWS, so an unpriced tier is not on the wire at all. Deriving the list
 * from those keys would mean a grade the shop has never priced could never be
 * SEEN and therefore never be SET — the screen would be unable to fix the one
 * state it exists to fix, and `424 product_price_unset` would be unreachable
 * from the phone for ever. Nothing else in the API enumerates the tier space:
 * `GET /sellers` carries the grades sellers happen to have, and `GET /shop`
 * carries one default. **The API does not expose the grade set, so a price
 * editor has to carry one.**
 *
 * WHAT S16 MUST DO WITH THIS, so a later reader does not merely delete it: the
 * set becomes a per-tenant value, which means it arrives from the server, which
 * means this constant is replaced by a field on the cached shop row — not
 * widened, and not made longer.
 */
export const GRADES: readonly string[] = ["A", "B", "C", "D"];

/* ------------------------------------------------------------ the input -- */

/**
 * A typed tier price, BOUNDED BY THE COLUMN AND NOT BY TASTE.
 *
 * `parseDecimal(raw, 2, 12)` is `numeric(14,2)` exactly: 12 integer digits plus
 * 2 decimal places is 14 digits, and `server/app/master.py` declares the same
 * bound at its own edge as `Field(ge=0, max_digits=14, decimal_places=2)`.
 *
 * WRITTEN AS A CALL AND NOT AS A COPY OF 12 AND 2. The two constants come from
 * `src/money/money.ts`, which exports them for exactly this reason — the numpad
 * already refuses over-long input against them, and a second literal here would
 * be free to drift the day a migration widens the column. Three readers of one
 * fact, no third copy.
 *
 * THIS IS NOT THE ONLY GATE AND MUST NOT BE THE ONLY GATE. The server refuses
 * the same value with a 422, and that refusal is what actually protects the
 * column — a rooted device or a future build can send anything. What this buys
 * is that the operator finds out at the keypad instead of after a round trip,
 * and that a 422 on this path is a defect rather than an ordinary Tuesday.
 */
export const parseTierPrice = (raw: string): Parsed =>
  parseDecimal(raw, MONEY_DP, MONEY_MAX_INT_DIGITS);

/**
 * What a WRITE of one tier produced. TRANSPORT ONLY — no meaning is attached
 * here, so the whole mapping below is provable headless with no server.
 * `app/api.ts` builds one of these and nothing else.
 *
 * Deliberately the same four-member shape as `DailyFetch` in
 * src/reports/dailyView.ts. Two transports that classify the same axes should
 * not describe them differently; a reader who has learnt one has learnt this.
 */
export type PriceWrite =
  /** 2xx. The body is `unknown` on purpose: it is validated where it is used. */
  | { kind: "ok"; body: unknown }
  /** The server ANSWERED and refused. `code` is the body's code, never prose. */
  | { kind: "http"; status: number; code: string | null }
  /** No answer at all: timeout, DNS, no route, aeroplane mode. */
  | { kind: "unreachable" }
  /** There is no session token on this device, so nothing was asked. */
  | { kind: "no_token" };

/**
 * DID THIS PHONE'S OWN PRICE LIST ACTUALLY GET RE-READ AFTER THE WRITE?
 *
 * A third value, not a boolean, because "we did not try" and "we tried and it
 * failed" read the same to a boolean and lead to different sentences. `skipped`
 * is the real case the app produces: `refreshMaster` returns immediately when a
 * refresh is already in flight, so a save landing during one gets no re-read at
 * all — silently, and with nothing on screen to say the list is behind.
 */
export type CacheRefresh = "refreshed" | "failed" | "skipped";

/* ------------------------------------------------------------ the model -- */

/** One tier as the cache holds it. `price` is null when there is NO row. */
export interface TierPrice {
  readonly grade: string;
  /**
   * The cached price string, byte for byte, or null for a tier the shop has
   * never priced. NEVER 0, never another tier's value, never "-".
   */
  readonly price: string | null;
}

/** One product with its tiers, as the prices screen lists it. */
export interface PriceProduct {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly tiers: readonly TierPrice[];
}

/**
 * EVERY BUTTON A PRICE SCREEN CAN CARRY, and the list is deliberately short.
 *
 * `edit`, `save` and `cancel` are NOT members. They belong to a TIER and to the
 * editor, not to the screen, and their labels are the three constants at the
 * foot of this file — an earlier draft declared them here and no branch ever
 * produced one, which is a union that describes intentions rather than
 * behaviour. A kind here is a button the operator can actually be shown.
 */
export type PriceActionKind = "back" | "retry" | "sign_in" | "close";

export interface PriceAction {
  readonly kind: PriceActionKind;
  readonly label: string;
}

export type PriceTone = "ready" | "readonly" | "empty" | "session" | "forbidden" | "offline" | "server" | "saved" | "stale";

/**
 * THE WHOLE PRICES SCREEN, as one value. `lines` IS the draw order; the view
 * maps over it and adds nothing of its own, which is what lets a proof read
 * what the operator reads.
 */
export interface PriceScreen {
  readonly tone: PriceTone;
  readonly badge: string;
  readonly lines: readonly string[];
  /** The rows to draw. EMPTY on every message tone — there is nothing to list. */
  readonly products: readonly PriceProduct[];
  /**
   * MAY THIS SESSION CHANGE A PRICE AT ALL. The view draws no per-row edit
   * control when this is false, and `actions` carries none either — the two
   * cannot disagree because they are decided in one place, here.
   */
  readonly editable: boolean;
  /** Buttons, in draw order. */
  readonly actions: readonly PriceAction[];
}

/* ---------------------------------------------------------- the wording -- */

const TITLE = "ราคารับซื้อ";
const CLOSE: PriceAction = { kind: "close", label: "ปิด" };
/**
 * BACK TO THE LIST — offered on every outcome where there is still a session
 * and the list is still worth reading, so an owner changing four tiers is not
 * made to close and reopen the screen between each one.
 *
 * NOT offered where a session is the thing that is missing (no_token, 401):
 * there is no list to go back to. NOT offered on a 403 either — the account may
 * not edit, so returning to the list only offers the same refusal again.
 */
const BACK: PriceAction = { kind: "back", label: "กลับไปหน้ารายการราคา" };
const NO_PRICE = "ยังไม่ได้ตั้งราคา";

/**
 * SAID ON THE READ-ONLY SCREEN, and it is a statement about the ACCOUNT rather
 * than about this phone or this moment. It must not read as a fault or as
 * something a retry fixes.
 */
const STAFF_MAY_NOT_EDIT = "บัญชีนี้ดูราคาได้ แต่แก้ไขราคาไม่ได้ ต้องให้เจ้าของร้านเป็นผู้แก้";

const ASK_THE_OWNER = "หากราคาไม่ถูกต้อง ให้แจ้งเจ้าของร้าน";

/**
 * THE SENTENCE THIS WHOLE PHASE TURNS ON. A price that reached the server but
 * not this handset's own list means the next bill written HERE is priced from
 * the old number, and the server will stamp `list_price` from the NEW one — so
 * the row lands with `unit_price != list_price`, which is byte-identical to a
 * deliberate override and is not recoverable from afterwards
 * (lessons/cached-master-data-is-a-price-claim.md).
 *
 * It therefore does not say "saved" and stop. It says what is true of the
 * device, and it tells the operator the one thing that protects the money:
 * do not open a bill yet.
 */
const SAVED_BUT_STALE_1 = "บันทึกราคาใหม่ขึ้นระบบแล้ว แต่รายการราคาในเครื่องนี้ยังเป็นราคาเดิม";
const SAVED_BUT_STALE_2 = "อย่าเพิ่งเปิดบิลด้วยราคานี้ จนกว่ารายการราคาในเครื่องจะอัปเดต";

/* ------------------------------------------------------------ the gate -- */

/**
 * IS A TIER PRICED. Written out because "has a price" and "is truthy" differ on
 * the one value that matters: `"0.00"` is a real, deliberate price a shop can
 * set — a product it will accept but not pay for — and it is falsy in
 * JavaScript. A `!row.price` here would render a set price as unpriced and
 * offer to invent one.
 */
export const isPriced = (tier: TierPrice): boolean => tier.price !== null;

/**
 * THE PRICE TO PUT IN THE BOX WHEN THE OPERATOR OPENS ONE TIER.
 *
 * The CURRENT value, exactly as cached, or the EMPTY STRING for a tier with no
 * row. Empty is not a worse experience than wrong; it is the only state that
 * makes the person make the decision the system cannot make for them
 * (lessons/fallback-default-is-a-wrong-number.md).
 *
 * There is no branch here that consults another grade, another product, or a
 * zero, and there must never be one: every one of those would put a number in
 * front of somebody that no one in the shop chose.
 */
export const editableValue = (tier: TierPrice): string => tier.price ?? "";

/* ---------------------------------------------------------- the screens -- */

export interface PriceListInput {
  /** The role claimed by the session token. Advisory and up to an hour stale. */
  readonly role: DeviceRole;
  /** The cached products, already sorted by whatever the caller sorts by. */
  readonly products: readonly PriceProduct[];
  /** False when this device has never successfully downloaded a product list. */
  readonly haveProducts: boolean;
}

/**
 * THE LIST, BEFORE ANY EDIT. The entry point the sheet renders.
 *
 * ---------------------------------------------------------------------------
 * WHY THE READ IS OFFERED TO STAFF AND THE WRITE IS NOT
 * ---------------------------------------------------------------------------
 * These are two decisions and this repository has already made both, in
 * opposite directions, for reasons that do not generalise from one to the
 * other. The rule that separates them is in App.tsx beside the ยอดวันนี้ button:
 * opening a read-only view costs one refused GET and one plain sentence, while
 * pressing a control that performs an ACTION the server will refuse leaves the
 * operator believing something happened that did not.
 *
 * A price READ is not even a request — the tiers are already on this device,
 * cached, and the cart screen shows them at every weighing. Hiding a list the
 * yard can already see would buy nothing. `GET /products` is `get_principal`
 * and staff-readable on purpose (server/app/master.py), for the same reason.
 *
 * A price WRITE is `require_admin`, and a staff session pressing save would get
 * a 403 — which is exactly how this brief says they must NOT find out. So the
 * control is not drawn, and the sentence explaining its absence is drawn
 * instead, in the same value, so the two cannot drift.
 */
export function priceListScreen(input: PriceListInput): PriceScreen {
  const editable = mayEditPrices(input.role);

  if (!input.haveProducts) {
    /*
     * NEVER FETCHED, which is not the same as a shop with no products. The
     * device has nothing to show and no way to know what the shop sells; saying
     * "no products" would be a claim about the SHOP made from a fact about this
     * HANDSET. Same distinction the seller picker draws with `neverFetched`.
     */
    return {
      tone: "empty",
      badge: "ยังไม่มีรายการสินค้าในเครื่องนี้",
      lines: [
        "เครื่องนี้ยังไม่เคยดาวน์โหลดรายการสินค้า จึงยังไม่มีราคาให้ดูหรือแก้ไข",
        "ต่อเน็ตแล้วเปิดหน้านี้อีกครั้ง",
      ],
      products: [],
      editable: false,
      actions: [CLOSE],
    };
  }

  if (input.products.length === 0) {
    return {
      tone: "empty",
      badge: "ร้านนี้ยังไม่มีสินค้า",
      lines: ["ยังไม่มีสินค้าในระบบของร้านนี้ จึงยังไม่มีราคาให้ตั้ง"],
      products: [],
      editable: false,
      actions: [CLOSE],
    };
  }

  if (!editable) {
    return {
      tone: "readonly",
      badge: TITLE,
      lines: [STAFF_MAY_NOT_EDIT, ASK_THE_OWNER],
      products: input.products,
      editable: false,
      /*
       * CLOSE AND NOTHING ELSE. No edit, no save, and no retry — there is
       * nothing to retry, because nothing failed. A retry button here would
       * invite the press that produces the 403.
       */
      actions: [CLOSE],
    };
  }

  return {
    tone: "ready",
    badge: TITLE,
    lines: [
      "แตะที่ราคาเพื่อแก้ไข ราคาที่แก้จะใช้กับบิลใบถัดไป ไม่ย้อนหลังกับบิลเดิม",
    ],
    products: input.products,
    editable: true,
    actions: [CLOSE],
  };
}

export interface PriceSaveInput {
  /** What the write produced. */
  readonly write: PriceWrite;
  /** What happened to this device's own list afterwards. */
  readonly refresh: CacheRefresh;
}

/**
 * WHAT THE OPERATOR IS TOLD AFTER PRESSING SAVE.
 *
 * Classified on the STATUS and never on the body's prose — the same rule
 * dailyView's `httpMessage` and httpTransport both follow, and for the same
 * reason: the status survives a body that failed to parse entirely.
 */
export function priceSaveScreen(input: PriceSaveInput): PriceScreen {
  const { write, refresh } = input;

  if (write.kind === "no_token") {
    return message("session", "ยังไม่ได้เข้าสู่ระบบ", [
      "ต้องเข้าสู่ระบบก่อนจึงจะแก้ไขราคาได้",
      "ราคายังไม่ถูกเปลี่ยน",
    ], [{ kind: "sign_in", label: "เข้าสู่ระบบ" }, CLOSE]);
  }

  if (write.kind === "unreachable") {
    /*
     * NOTHING WAS SAVED, and this branch has to say so without ambiguity. A
     * price write is NOT queued and must never be: the outbox exists for money
     * already promised at a weighbridge, and a price change that lands hours
     * later — after bills have been written at the old number — is worse than
     * one that did not land at all. So the honest report is "unchanged, try
     * again", and the retry is the operator's.
     */
    return message("offline", "ยังติดต่อระบบไม่ได้", [
      "ยังไม่ได้เปลี่ยนราคา เพราะติดต่อระบบไม่ได้",
      "ราคายังเป็นค่าเดิมทั้งในระบบและในเครื่องนี้",
    ], [{ kind: "retry", label: "ลองอีกครั้ง" }, BACK, CLOSE]);
  }

  if (write.kind === "http") return httpMessage(write.status, write.code);

  /* -------- 2xx from here down: the server has the new price. ------------ */

  if (refresh === "refreshed") {
    return message("saved", "บันทึกราคาใหม่แล้ว", [
      "ระบบและเครื่องนี้ใช้ราคาใหม่ตรงกันแล้ว",
      "ราคาใหม่จะใช้กับบิลใบถัดไป บิลเดิมไม่เปลี่ยน",
    ], [BACK, CLOSE]);
  }

  /*
   * SAVED, AND THIS DEVICE IS BEHIND. The tone is `stale` and not `saved`,
   * because the two states are different in the only way that costs money and a
   * screen that shows them alike is the defect
   * lessons/correct-classification-can-still-render-as-an-error.md names.
   *
   * `skipped` and `failed` get the SAME two sentences deliberately: what the
   * operator must do is identical, and splitting the wording would tell them
   * about an internal that changes nothing they can act on. They stay two
   * distinct VALUES so the reason survives into a bug report.
   */
  return message("stale", "บันทึกแล้ว แต่เครื่องนี้ยังไม่อัปเดต", [
    SAVED_BUT_STALE_1,
    SAVED_BUT_STALE_2,
  ], [{ kind: "retry", label: "อัปเดตรายการราคา" }, BACK, CLOSE]);
}

/**
 * A RE-READ OF THE LIST ON ITS OWN — NOT A SAVE, AND NOT REPORTED AS ONE.
 *
 * ---------------------------------------------------------------------------
 * THE DEFECT THIS EXISTS TO REMOVE, FOUND WHILE BUILDING P1.9 AND BEFORE ANY
 * DEVICE PASS
 * ---------------------------------------------------------------------------
 * Every refusal screen above offers `อัปเดตรายการราคา`, and the app first wired
 * that button back through `priceSaveScreen({ write: {kind:"ok"}, ... })` —
 * because a refresh has no `PriceWrite` of its own and `ok` was the nearest
 * value to hand. On the REFRESHED path that is invisible, which is why it
 * survived reading. On any other path it is a lie about money: press it on a
 * 404, have the refresh fail, and the screen says
 * `บันทึกราคาใหม่ขึ้นระบบแล้ว` — SAVED — about a write the server REFUSED.
 * The owner would then believe the shop is buying at a price nobody set.
 *
 * The shape is the one this project keeps paying for: a value invented to fill
 * a required field, which is then read as a fact. It is recorded as the P1.9
 * amendment to lessons/correct-classification-can-still-render-as-an-error.md —
 * the FLOOR of that file's series, where the caller had no cause AT ALL rather
 * than too little of one, and where 2d's and R2b's repair inverts: there is
 * nothing to make a required parameter, because no `PriceWrite` means "I did
 * not write". A refresh is a different act from a save and needs its own
 * screen, not a save's screen holding a placeholder.
 *
 * `refreshed` returns null: there is nothing to say, and the caller shows the
 * LIST — which is the honest answer to "what is the price now".
 */
export function priceRefreshScreen(refresh: CacheRefresh): PriceScreen | null {
  if (refresh === "refreshed") return null;
  return message("stale", "อัปเดตรายการราคาไม่สำเร็จ", [
    "ยังอ่านรายการราคาล่าสุดจากระบบไม่ได้ รายการในเครื่องนี้จึงยังเป็นของเดิม",
    // NOTHING IS CLAIMED ABOUT ANY SAVE. This screen is reachable from a
    // refusal, from a success and from a plain re-read, and it cannot know
    // which — so it says only what it does know, which is about the list.
    "ราคาที่แสดงอาจไม่ใช่ราคาปัจจุบัน",
  ], [{ kind: "retry", label: "ลองอีกครั้ง" }, BACK, CLOSE]);
}

function message(
  tone: PriceTone,
  badge: string,
  lines: readonly string[],
  actions: readonly PriceAction[],
): PriceScreen {
  return { tone, badge, lines, products: [], editable: false, actions };
}

/**
 * A refusal the server ANSWERED.
 *
 * THE 403 BRANCH IS THE ONE THIS PHASE CARES ABOUT, and it is reached only when
 * the token's role was WRONG — unknown, or stale across a demotion. A staff
 * session that read as staff never got a save control to press. So this is the
 * fail-open path's landing, and it has to be a plain sentence rather than a red
 * error: nothing is broken, the account simply may not do this.
 *
 * IT OFFERS NO SIGN-IN. Signing in again as the same person changes nothing,
 * and a sign-in button on a 403 tells the operator their session is the problem
 * when their PERMISSIONS are (lessons/401-is-about-the-caller-not-the-bill.md
 * draws the same line from the other side).
 */
function httpMessage(status: number, code: string | null): PriceScreen {
  if (status === 401) {
    return message("session", "เซสชันหมดอายุ", [
      "ต้องเข้าสู่ระบบใหม่จึงจะแก้ไขราคาได้",
      "ราคายังไม่ถูกเปลี่ยน",
    ], [{ kind: "sign_in", label: "เข้าสู่ระบบ" }, CLOSE]);
  }

  if (status === 403) {
    return message("forbidden", "บัญชีนี้แก้ไขราคาไม่ได้", [
      STAFF_MAY_NOT_EDIT,
      "ราคายังไม่ถูกเปลี่ยน",
    ], [CLOSE]);
  }

  if (status === 422) {
    /*
     * TERMINAL, AND A DEFECT RATHER THAN A TYPO. `parseTierPrice` refuses on
     * this device everything the column would round, so a 422 arriving here
     * means the two bounds have come apart — a widened column, an older build,
     * a payload this screen did not construct. Retrying sends the same bytes,
     * so no retry is offered.
     */
    return message("server", "ระบบไม่รับราคานี้", [
      "ระบบปฏิเสธราคาที่ส่งไป จึงยังไม่ได้เปลี่ยนราคา",
      ASK_THE_OWNER,
    ], [BACK, CLOSE]);
  }

  if (status === 404) {
    /*
     * THE PRODUCT IS GONE FROM THE SERVER but is still in this device's cache —
     * exactly what a refresh resolves, and the reason the action is a refresh
     * rather than a retry of the write.
     */
    return message("server", "ไม่พบสินค้านี้ในระบบ", [
      "สินค้านี้ไม่มีอยู่ในระบบแล้ว รายการในเครื่องนี้อาจเก่า",
      "ราคายังไม่ถูกเปลี่ยน",
    ], [{ kind: "retry", label: "อัปเดตรายการราคา" }, BACK, CLOSE]);
  }

  /*
   * ANYTHING ELSE THE SERVER ANSWERED, 5xx included. UNKNOWN, and said as
   * unknown: the request reached the server, so whether the price changed
   * cannot be decided from here (lessons/unavailable-is-not-rejected.md is the
   * same distinction on the bill path). Telling the operator it did not change
   * would be a guess in the direction that gets a second edit typed over a
   * first one.
   */
  return message("server", "ระบบขัดข้อง", [
    `ระบบตอบกลับผิดปกติ (${String(status)}${code === null ? "" : ` ${code}`})`,
    "ไม่แน่ใจว่าราคาเปลี่ยนแล้วหรือยัง ให้เปิดหน้านี้ใหม่เพื่อดูราคาปัจจุบัน",
  ], [{ kind: "retry", label: "อัปเดตรายการราคา" }, BACK, CLOSE]);
}

/* ------------------------------------------------------------- reading -- */

/**
 * THE WHOLE SCREEN AS ONE STRING, IN DRAW ORDER: badge, lines, then the tier
 * text of every product, then the action labels.
 *
 * Exported because the PROOF must read what the operator reads rather than what
 * a renderer returns in isolation, and because a helper both sides share cannot
 * drift from the order the view uses — the same argument `signOutCardText`
 * makes, and the reason an ABSENCE asserted over this string is evidence.
 */
export function priceScreenText(screen: PriceScreen): string {
  const rows = screen.products.flatMap((p) => [
    p.code,
    p.name,
    ...p.tiers.map((t) => `${t.grade} ${t.price ?? NO_PRICE}`),
  ]);
  return [screen.badge, ...screen.lines, ...rows, ...screen.actions.map((a) => a.label)].join(" ");
}

/** The label the view draws on a per-tier edit control. One definition. */
export const EDIT_TIER_LABEL = "แก้ไขราคา";

/** The label on the save control. Absent from the staff render, by `editable`. */
export const SAVE_TIER_LABEL = "บันทึกราคา";

/**
 * THE PER-ROW CONTROLS, IN DRAW ORDER, FOR ONE SCREEN.
 *
 * Separate from `priceScreenText` on purpose, and it is the whole staff
 * assertion: an edit control is drawn PER TIER, so it never appears in the
 * screen-level `actions`, and an absence asserted only over `priceScreenText`
 * would be satisfied by a screen that draws an edit button on every row. This
 * is where that absence is real.
 */
export function tierControlsText(screen: PriceScreen): string {
  if (!screen.editable) return "";
  return screen.products
    .flatMap((p) => p.tiers.map(() => EDIT_TIER_LABEL))
    .join(" ");
}
