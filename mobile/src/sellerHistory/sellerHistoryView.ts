/**
 * SELLER HISTORY AT THE WEIGHBRIDGE, AS THE STAFF READS IT (P1.21, drawing half)
 * — every rendering decision for `GET /sellers/{seller_id}/history`, as pure
 * functions.
 *
 * No React Native, no Expo, no node, no fetch — so the headless proof
 * (`npm run prove:sellerhistory`) exercises exactly the sentences, the money
 * gate, the shop-date conversion and the empty/failure branches the phone runs.
 * `app/SellerHistorySheet.tsx` renders whatever this returns and decides nothing
 * itself. Same reason `dailyView.ts` and `summaryView.ts` live under `src/`:
 * files under `app/` are outside the proven surface
 * (lessons/correct-classification-can-still-render-as-an-error.md).
 *
 * ---------------------------------------------------------------------------
 * MONEY IS NEVER A NUMBER HERE, AND IT IS SHOWN ONLY WHEN THE SERVER SAYS SO
 * ---------------------------------------------------------------------------
 * `money_included` is the SERVER's authority (master.py's route, G2): the bill
 * total and each line's unit_price are present ONLY when it is true — admin, or a
 * staff caller whose shop has turned `staff_money_visible` on. When it is false
 * the keys are ABSENT on the wire, and this builder never invents them: it renders
 * date, product and weight (what recognises a seller), and one calm sentence that
 * prices are the shop owner's to open. The phone NEVER infers money-visibility
 * from its own state — the response carries the answer (App.tsx's `moneyVisible`
 * is unreliable here: null offline, and false ≠ no-money for an admin).
 *
 * `readMoney` REFUSES a JSON number. A money/weight field arriving as `1234.5`
 * instead of `"1234.50"` means a float reached the wire (hard rule 1), and the
 * WHOLE response is refused rather than partially rendered — the summaryView.ts:120
 * rule (that copy is module-private and its file is out of bounds, so the rule is
 * re-stated here and `prove:sellerhistory` asserts it). A weight is checked always;
 * a price/total only when `money_included`, because otherwise the key is absent.
 *
 * ---------------------------------------------------------------------------
 * DATES ARE SHOP TIME, BE AFTER THE CONVERSION, THROUGH THE ONE FORMATTER
 * ---------------------------------------------------------------------------
 * The bill date is `shopDate(server_received_at)` — @recycle/shop-time, the ONE
 * place a timezone is defined and a year computed on the client. It converts to
 * shop time FIRST and adds 543 AFTER, and it ignores the instant's own offset, so
 * a load weighed 00:30 shop time (still yesterday in UTC) reads on its shop day.
 * Nothing here slices an ISO string (lessons/render-in-shop-time-not-device-time.md,
 * be-year-comes-after-the-timezone.md).
 *
 * ---------------------------------------------------------------------------
 * ONLINE ONLY
 * ---------------------------------------------------------------------------
 * There is no local seller-history store — a bill list per seller across every
 * device is the server's, and building a local one is a sync-engine change out of
 * this phase's bounds. Offline, the screen says one calm sentence and draws no
 * rows; a transport failure offers ลองอีกครั้ง and never a number and never a red.
 */
import { shopDate } from "@recycle/shop-time";

/* ==========================================================================
 * 1. THE WIRE — what the server sends, and what we refuse to read
 * ========================================================================== */

export type SellerHistoryFetch =
  | { kind: "ok"; body: unknown }
  | { kind: "http"; status: number; code: string | null }
  | { kind: "unreachable" }
  | { kind: "no_token" };

/** The 404 detail.code that means "no such seller in this shop" — as opposed to a
 *  bare 404, which means the server predates this route. A locally-created seller
 *  the server has not sent back yet resolves to this. */
export const SELLER_NOT_FOUND = "seller_not_found";

interface WireLine {
  product_id: string;
  product_name: string | null;
  net_weight: string;
  unit_price: string | null; // read only when money_included; null otherwise
}

interface WireBill {
  bill_id: string;
  doc_no: string | null;
  server_received_at: string;
  is_void: boolean;
  products: WireLine[];
  total_amount: string | null; // read only when money_included; null otherwise
}

interface HistoryBody {
  seller_id: string;
  money_included: boolean;
  bills: WireBill[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const readStr = (v: unknown): string | null => (typeof v === "string" ? v : null);
const readOptStr = (v: unknown): string | null | undefined =>
  v === null || v === undefined ? null : typeof v === "string" ? v : undefined;
const readBool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);

// STRING OR NOTHING — a JSON number means a float travelled on the wire, and
// refusing costs a visible "could not read", the right outcome for a number nobody
// can vouch for. Identical to summaryView.ts:120 (re-stated; that copy is private).
const readMoney = (v: unknown): string | null => (typeof v === "string" ? v : null);

function readLine(v: unknown, moneyIncluded: boolean): WireLine | null {
  if (!isObj(v)) return null;
  const product_id = readStr(v["product_id"]);
  const product_name = readOptStr(v["product_name"]);
  const net_weight = readMoney(v["net_weight"]);
  if (product_id === null || product_name === undefined || net_weight === null) return null;
  let unit_price: string | null = null;
  if (moneyIncluded) {
    // The key MUST be present and a string when money is included; a number here is
    // a float on the wire and refuses the whole response (readMoney -> null).
    unit_price = readMoney(v["unit_price"]);
    if (unit_price === null) return null;
  }
  return { product_id, product_name, net_weight, unit_price };
}

function readBill(v: unknown, moneyIncluded: boolean): WireBill | null {
  if (!isObj(v)) return null;
  const bill_id = readStr(v["bill_id"]);
  const doc_no = readOptStr(v["doc_no"]);
  const server_received_at = readStr(v["server_received_at"]);
  const is_void = readBool(v["is_void"]);
  const rawProducts = v["products"];
  if (
    bill_id === null || doc_no === undefined || server_received_at === null ||
    is_void === null || !Array.isArray(rawProducts)
  ) {
    return null;
  }
  const products: WireLine[] = [];
  for (const p of rawProducts) {
    const line = readLine(p, moneyIncluded);
    if (line === null) return null; // one unreadable line refuses the whole response
    products.push(line);
  }
  let total_amount: string | null = null;
  if (moneyIncluded) {
    total_amount = readMoney(v["total_amount"]);
    if (total_amount === null) return null;
  }
  return { bill_id, doc_no, server_received_at, is_void, products, total_amount };
}

/**
 * The response, or null if it cannot be read. ONE bad line or bill refuses the
 * WHOLE body — a per-seller history that silently dropped a load would misstate
 * what the yard bought from this person, the very thing the surface exists to show.
 */
export function readHistoryBody(raw: unknown): HistoryBody | null {
  if (!isObj(raw)) return null;
  const seller_id = readStr(raw["seller_id"]);
  const money_included = readBool(raw["money_included"]);
  const rawBills = raw["bills"];
  if (seller_id === null || money_included === null || !Array.isArray(rawBills)) return null;
  const bills: WireBill[] = [];
  for (const b of rawBills) {
    const bill = readBill(b, money_included);
    if (bill === null) return null;
    bills.push(bill);
  }
  return { seller_id, money_included, bills };
}

/* ==========================================================================
 * 2. THE SCREEN — one shape per outcome
 * ========================================================================== */

/** No `forbidden` and no `invalid`: this route admits any signed-in caller (money
 *  is gated by absent keys, never a 403) and the phone sends no out-of-range limit,
 *  so those message shapes cannot occur. `calm` is the new-or-unknown seller. */
export type HistoryTone = "session" | "offline" | "server" | "calm";

export type HistoryAction =
  | { kind: "sign_in"; label: string }
  | { kind: "retry"; label: string }
  | null;

export interface HistoryMessage {
  kind: "message";
  tone: HistoryTone;
  badge: string;
  lines: string[];
  action: HistoryAction;
}

/** One bill line, ready to draw. Money is the server string, or null when hidden. */
export interface HistoryLineView {
  product: string;
  net_weight: string;
  /** unit_price VERBATIM, or null when money is not included. */
  unit_price: string | null;
}

export interface HistoryBillView {
  bill_id: string;
  /** doc_no if the server assigned one, else the "no number yet" sentence. */
  docNoLabel: string;
  /** DD/MM/BBBB in shop time, BE after conversion. */
  date: string;
  isVoid: boolean;
  /** The settled voided-bill term, or null on a live bill. */
  voidLabel: string | null;
  lines: HistoryLineView[];
  /** total_amount VERBATIM, or null when money is not included. */
  total: string | null;
}

export interface HistoryReport {
  kind: "history";
  moneyIncluded: boolean;
  /** Why prices are absent, when they are — the owner decides. Null when shown. */
  moneyNote: string | null;
  bills: HistoryBillView[];
  /** Non-null (its own calm sentence) when the seller has no prior bills. */
  emptyLine: string | null;
  /** The weight unit, so the component draws no bare number. */
  weightUnit: string;
}

export type SellerHistoryScreen = HistoryReport | HistoryMessage;

/* ==========================================================================
 * 3. THE SENTENCES — settled vocabulary (P1.23 phase B, 2026-08-31)
 * ========================================================================== */

const ASK_THE_OWNER = "ต้องแจ้งเจ้าของร้าน";
const NO_DOC_NO = "ยังไม่มีเลขที่บิล";
const VOID_LABEL = "บิลที่ถูกยกเลิก";
const WEIGHT_UNIT = "กก.";
/** When money_included is false. Names the shop OWNER as the decider (B1), never a
 *  sign-in and never ขอสิทธิ์ — the same rule summaryView's staff_money_hidden line
 *  follows (lessons/403-is-about-what-the-caller-may-do.md). */
const MONEY_HIDDEN_NOTE =
  "ยังไม่เปิดให้บัญชีนี้เห็นราคา — การเปิดให้เห็นเป็นสิทธิ์ของเจ้าของร้าน";
/** The seller exists but has traded nothing here yet. Calm, never an error tone. */
const NO_BILLS_LINE = "ยังไม่มีบิลก่อนหน้าของผู้ขายรายนี้ในระบบ";

function messageFor(fetch: Exclude<SellerHistoryFetch, { kind: "ok" }>): HistoryMessage {
  if (fetch.kind === "no_token") {
    return {
      kind: "message",
      tone: "session",
      badge: "ยังไม่ได้เข้าสู่ระบบ",
      lines: ["ต้องเข้าสู่ระบบก่อนจึงจะดูประวัติผู้ขายได้"],
      action: { kind: "sign_in", label: "เข้าสู่ระบบ" },
    };
  }
  if (fetch.kind === "unreachable") {
    // ONLINE ONLY: a per-seller history across every device is the server's, and
    // this device holds no local copy. Say so plainly; draw no rows and no number.
    return {
      kind: "message",
      tone: "offline",
      badge: "ยังติดต่อระบบไม่ได้",
      lines: ["ประวัติผู้ขายต้องอ่านจากระบบ จึงต้องเชื่อมต่ออินเทอร์เน็ตก่อน"],
      action: { kind: "retry", label: "ลองอีกครั้ง" },
    };
  }
  if (fetch.status === 401) {
    return {
      kind: "message",
      tone: "session",
      badge: "ต้องเข้าสู่ระบบใหม่",
      lines: ["หมดเวลาเข้าใช้งาน ต้องเข้าสู่ระบบใหม่ก่อนจึงจะดูประวัติผู้ขายได้"],
      action: { kind: "sign_in", label: "เข้าสู่ระบบ" },
    };
  }
  if (fetch.status === 404) {
    if (fetch.code === SELLER_NOT_FOUND) {
      // The seller id is not one the server knows in this shop — most often a seller
      // just added on this device that has not synced yet. Calm, not an error.
      return {
        kind: "message",
        tone: "calm",
        badge: "ยังไม่มีประวัติผู้ขายรายนี้",
        lines: [
          "ยังไม่พบผู้ขายรายนี้ในระบบ จึงยังไม่มีประวัติ" +
            " — อาจเป็นผู้ขายที่เพิ่งเพิ่มจากเครื่องนี้และยังไม่ขึ้นระบบ",
        ],
        action: null,
      };
    }
    // A bare 404: the server this device is pointed at predates the route.
    return {
      kind: "message",
      tone: "server",
      badge: "ระบบยังไม่มีหน้าประวัติผู้ขาย",
      lines: [`เซิร์ฟเวอร์ที่เครื่องนี้ต่ออยู่ยังไม่มีหน้าประวัติผู้ขาย — ${ASK_THE_OWNER}`],
      action: null,
    };
  }
  return {
    kind: "message",
    tone: "server",
    badge: "ระบบยังตอบไม่ได้",
    lines: ["ระบบยังแสดงประวัติผู้ขายให้ไม่ได้ในตอนนี้"],
    action: { kind: "retry", label: "ลองอีกครั้ง" },
  };
}

/* ==========================================================================
 * 4. THE ONLY ENTRY POINT
 * ========================================================================== */

function billView(bill: WireBill): HistoryBillView {
  return {
    bill_id: bill.bill_id,
    docNoLabel: bill.doc_no ?? NO_DOC_NO,
    date: shopDate(bill.server_received_at),
    isVoid: bill.is_void,
    voidLabel: bill.is_void ? VOID_LABEL : null,
    lines: bill.products.map((p) => ({
      product: p.product_name ?? "—",
      net_weight: p.net_weight,
      unit_price: p.unit_price,
    })),
    total: bill.total_amount,
  };
}

/**
 * THE SELLER-HISTORY SCREEN, from one fetch. THE only entry point the panel uses.
 */
export function sellerHistoryScreen(fetch: SellerHistoryFetch): SellerHistoryScreen {
  if (fetch.kind !== "ok") return messageFor(fetch);

  const body = readHistoryBody(fetch.body);
  if (body === null) {
    // 200 with a body this build cannot read — an older/newer API, or a money field
    // that arrived as a JSON number. Calm, and no number.
    return {
      kind: "message",
      tone: "server",
      badge: "อ่านข้อมูลจากระบบไม่ได้",
      lines: [`ระบบตอบกลับมาในรูปแบบที่แอปรุ่นนี้อ่านไม่ได้ จึงยังแสดงประวัติไม่ได้ — ${ASK_THE_OWNER}`],
      action: { kind: "retry", label: "ลองอีกครั้ง" },
    };
  }

  return {
    kind: "history",
    moneyIncluded: body.money_included,
    moneyNote: body.money_included ? null : MONEY_HIDDEN_NOTE,
    bills: body.bills.map(billView),
    emptyLine: body.bills.length === 0 ? NO_BILLS_LINE : null,
    weightUnit: WEIGHT_UNIT,
  };
}
