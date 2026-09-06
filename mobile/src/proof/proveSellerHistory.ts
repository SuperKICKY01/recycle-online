/**
 * PROVE THE SELLER-HISTORY VIEW (P1.21 drawing half) — headless, pure.
 *
 * Runs under node: no screen, no handset, no network. Every cell is about the
 * SENTENCES, the money gate, the shop-date conversion, the empty case and the
 * fetch-failure branches `src/sellerHistory/sellerHistoryView.ts` produces from a
 * constructed response. `app/SellerHistorySheet.tsx` renders whatever the builder
 * returns and is not exercised here (it reaches expo through app/, which no node
 * proof can load — lessons/correct-classification-can-still-render-as-an-error.md).
 *
 * FOUR DISPROOFS, each a `--break=` mode applied through a WRAPPER, never a hook
 * inside the module under test (lessons/a-check-that-never-went-red-was-never-
 * observed.md). Each reddens EXACTLY one cell:
 *   money_when_hidden — flips the hidden fixture's money_included to true, so money
 *                       appears -> the MONEY-ABSENT cell reddens.
 *   empty_error       — a wrapper returns an error message for the empty case, so
 *                       the EMPTY-SENTENCE cell reddens.
 *   date_utc          — the proof's EXPECTED date is taken in UTC, so the
 *                       midnight-straddle SHOP-DATE cell reddens.
 *   accept_number     — the numeric-money fixture is stringified, so the builder
 *                       ACCEPTS it and the REFUSE-WHOLE-RESPONSE cell reddens.
 */
import {
  SELLER_NOT_FOUND,
  sellerHistoryScreen,
  type SellerHistoryScreen,
} from "../sellerHistory/sellerHistoryView.js";
import { shopDate } from "@recycle/shop-time";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const BREAK = (process.argv.find((a) => a.startsWith("--break=")) ?? "").split("=")[1] ?? "";
const BREAK_MODES: readonly string[] = [
  "money_when_hidden",
  "empty_error",
  "date_utc",
  "accept_number",
];
if (BREAK !== "" && !BREAK_MODES.includes(BREAK)) {
  console.log(`  [FAIL] unknown --break=${BREAK} — nothing was damaged and nothing was measured`);
  console.log(`         known breaks: ${BREAK_MODES.join(", ")}`);
  console.log("SELLER_HISTORY_EXIT=2");
  process.exit(2);
}

/* ---------------------------------------------------------------- fixtures -- */

const pad = (n: number): string => String(n).padStart(2, "0");

// 00:30 shop time on 2026-03-13 is 17:30 UTC on 2026-03-12: its UTC date and its
// SHOP date are different days. That is the midnight-straddle the shop conversion
// must get right.
const ISO_MIDNIGHT = "2026-03-12T17:30:00+00:00";
// 10:00 shop time on 2026-03-10 — an ordinary daytime instant.
const ISO_DAY = "2026-03-10T03:00:00+00:00";

type Obj = Record<string, unknown>;

function lineOf(
  product_id: string,
  product_name: string | null,
  net_weight: string,
  unit_price?: string,
): Obj {
  const l: Obj = { product_id, product_name, net_weight };
  if (unit_price !== undefined) l["unit_price"] = unit_price;
  return l;
}

function billOf(
  bill_id: string,
  doc_no: string | null,
  server_received_at: string,
  is_void: boolean,
  products: Obj[],
  total_amount?: string,
  paid_amount?: string,
  payment_status?: string,
): Obj {
  const b: Obj = { bill_id, doc_no, server_received_at, is_void, products };
  if (total_amount !== undefined) b["total_amount"] = total_amount;
  // The ledger's settlement rides the money gate with the total (0020). When money
  // is shown they are present; the reader refuses the whole response without them,
  // exactly as it does without the total, so a money-true fixture must carry them.
  if (paid_amount !== undefined) b["paid_amount"] = paid_amount;
  if (payment_status !== undefined) b["payment_status"] = payment_status;
  return b;
}

function bodyOf(seller_id: string, money_included: boolean, bills: Obj[]): Obj {
  return { seller_id, money_included, bills };
}

/** Recursively stringify every JSON number — the "reader accepted a number" defect
 *  applied to the INPUT, so a correct builder that refuses numbers is shown to
 *  refuse. Only active under --break=accept_number. */
function maybeStringifyMoney(body: Obj): Obj {
  if (BREAK !== "accept_number") return body;
  const fix = (o: unknown): unknown => {
    if (typeof o !== "object" || o === null) return o;
    if (Array.isArray(o)) return o.map(fix);
    const out: Obj = {};
    for (const [k, v] of Object.entries(o as Obj)) out[k] = typeof v === "number" ? String(v) : fix(v);
    return out;
  };
  return fix(body) as Obj;
}

/** The proof's EXPECTED date. UTC (the defect: read the raw instant) under the
 *  break, shop time (the same authority the builder uses) otherwise. */
function expectedDate(iso: string): string {
  if (BREAK === "date_utc") {
    const d = new Date(iso);
    return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear() + 543)}`;
  }
  return shopDate(iso);
}

function asHistory(s: SellerHistoryScreen): Extract<SellerHistoryScreen, { kind: "history" }> | null {
  return s.kind === "history" ? s : null;
}

/* -------------------------------------------------------------------- main -- */

function main(): number {
  // =====================================================================
  header("A — money_included TRUE: date, product, weight AND money, byte-for-byte");
  const onBody = bodyOf("s1", true, [
    // bm fully paid, b1 partial, bv voided (its automatic payment stands as the
    // seller's advance) — three distinct settlements, so section S below is a real
    // differential, not one repeated case.
    billOf("bm", "B-2569-9", ISO_MIDNIGHT, false, [lineOf("p1", "เหล็ก", "1.000", "20.00")], "20.00", "20.00", "paid"),
    billOf("b1", "B-2569-1", ISO_DAY, false, [
      lineOf("p1", "เหล็ก", "10.000", "16.00"),
      lineOf("p2", "อลูมิเนียม", "2.000", "45.00"),
    ], "250.00", "100.00", "partial"),
    // a voided bill, a null doc_no, and a null product_name — the awkward rows.
    billOf("bv", null, ISO_DAY, true, [lineOf("p3", null, "3.000", "14.00")], "42.00", "42.00", "paid"),
  ]);
  const on = sellerHistoryScreen({ kind: "ok", body: onBody });
  const onH = asHistory(on);
  check("money_included true -> a history screen", onH !== null, `kind=${on.kind}`);
  if (onH !== null) {
    check("moneyIncluded true and no money note", onH.moneyIncluded === true && onH.moneyNote === null);
    const byId = new Map(onH.bills.map((b) => [b.bill_id, b]));
    const bm = byId.get("bm");
    const b1 = byId.get("b1");
    const bv = byId.get("bv");
    check("all three bills present, order preserved",
      onH.bills.length === 3 && onH.bills[0]?.bill_id === "bm" && onH.bills[2]?.bill_id === "bv",
      onH.bills.map((b) => b.bill_id).join(","));
    check("bm: total and line price are the server strings, byte-for-byte",
      bm?.total === "20.00" && bm?.lines[0]?.unit_price === "20.00" && bm?.lines[0]?.net_weight === "1.000",
      `total=${bm?.total ?? "?"} price=${bm?.lines[0]?.unit_price ?? "?"}`);
    check("b1: two lines, each price/weight verbatim, total verbatim",
      b1?.total === "250.00" && b1?.lines.length === 2 &&
      b1?.lines[0]?.unit_price === "16.00" && b1?.lines[1]?.unit_price === "45.00" &&
      b1?.lines[0]?.net_weight === "10.000" && b1?.lines[1]?.net_weight === "2.000",
      `total=${b1?.total ?? "?"}`);
    check("b1: product names are the server names",
      b1?.lines[0]?.product === "เหล็ก" && b1?.lines[1]?.product === "อลูมิเนียม");
    check("bv: a null doc_no renders the 'no number yet' sentence",
      bv?.docNoLabel === "ยังไม่มีเลขที่บิล", bv?.docNoLabel ?? "?");
    check("bv: a null product_name renders '—', never blank",
      bv?.lines[0]?.product === "—", bv?.lines[0]?.product ?? "?");
    check("b1/bm: doc_no shown verbatim when present",
      b1?.docNoLabel === "B-2569-1" && bm?.docNoLabel === "B-2569-9");
  }

  // =====================================================================
  header("V — the voided bill is INCLUDED and marked with the settled term");
  if (onH !== null) {
    const bv = onH.bills.find((b) => b.bill_id === "bv");
    const live = onH.bills.filter((b) => b.bill_id !== "bv");
    check("the voided bill is present, is_void true, and labelled บิลที่ถูกยกเลิก",
      bv?.isVoid === true && bv?.voidLabel === "บิลที่ถูกยกเลิก",
      `isVoid=${String(bv?.isVoid)} label=${bv?.voidLabel ?? "null"}`);
    check("the live bills carry is_void false and no void label",
      live.every((b) => b.isVoid === false && b.voidLabel === null));
  }

  // =====================================================================
  header("S — the settlement badge (0020): unpaid/partial earn a marker, paid and voided none");
  {
    // A fresh, always-money-true unpaid fixture, so this section owns its unpaid
    // case and no break above can reach it.
    const unpaidBody = bodyOf("s1", true, [
      billOf("bu", "B-2569-7", ISO_DAY, false, [lineOf("p1", "เหล็ก", "8.000", "10.00")], "80.00", "0.00", "unpaid"),
    ]);
    const uH = asHistory(sellerHistoryScreen({ kind: "ok", body: unpaidBody }));
    check("an UNPAID bill shows ค้างจ่าย",
      uH?.bills[0]?.paymentLabel === "ค้างจ่าย", uH?.bills[0]?.paymentLabel ?? "null");
    if (onH !== null) {
      const bm = onH.bills.find((b) => b.bill_id === "bm");
      const b1 = onH.bills.find((b) => b.bill_id === "b1");
      const bv = onH.bills.find((b) => b.bill_id === "bv");
      check("a PARTIAL bill shows จ่ายบางส่วน",
        b1?.paymentLabel === "จ่ายบางส่วน", b1?.paymentLabel ?? "null");
      check("a fully PAID bill shows NO settlement badge (the unremarkable case)",
        bm?.paymentLabel === null, bm?.paymentLabel ?? "null");
      check("a VOIDED bill shows NO settlement badge — its void label stands and its payment is an advance",
        bv?.paymentLabel === null, bv?.paymentLabel ?? "null");
    }
  }

  // =====================================================================
  header("M — money_included FALSE: no total, no price, one calm note (money_when_hidden reddens this)");
  const showMoney = BREAK === "money_when_hidden"; // normally false = hidden
  const hiddenBody = bodyOf("s1", showMoney, [
    billOf("b1", "B-2569-1", ISO_DAY, false,
      [lineOf("p1", "เหล็ก", "10.000", showMoney ? "16.00" : undefined)],
      // Under money_when_hidden the whole money set appears (total AND the 0020
      // settlement), so the body READS and only the "should be hidden" cell
      // reddens -- not a parse failure that would redden two.
      showMoney ? "160.00" : undefined,
      showMoney ? "160.00" : undefined,
      showMoney ? "paid" : undefined),
  ]);
  const hidden = sellerHistoryScreen({ kind: "ok", body: hiddenBody });
  const hiddenH = asHistory(hidden);
  check(
    "money_included false: moneyIncluded false, a note is shown, and NO bill total, NO line price, NO settlement badge",
    hiddenH !== null && hiddenH.moneyIncluded === false && hiddenH.moneyNote !== null &&
      hiddenH.bills.every((b) => b.total === null && b.paymentLabel === null &&
        b.lines.every((l) => l.unit_price === null)),
    hiddenH === null ? `kind=${hidden.kind}` :
      `moneyIncluded=${String(hiddenH.moneyIncluded)} note=${hiddenH.moneyNote !== null ? "set" : "null"}`,
  );
  check("...and the non-money facts (date, product, weight) are still drawn",
    hiddenH !== null && hiddenH.bills.length === 1 &&
      hiddenH.bills[0]?.date !== "" && hiddenH.bills[0]?.lines[0]?.net_weight === "10.000",
    hiddenH?.bills[0]?.lines[0]?.net_weight ?? "");
  // The note WORDING is a separate claim (B1 vocabulary), checked on a fixture that
  // is ALWAYS money-hidden — so money_when_hidden reddens ONLY the money-absent cell.
  const noteScreen = asHistory(sellerHistoryScreen({ kind: "ok", body: bodyOf("s1", false, [
    billOf("bn", "B-2569-1", ISO_DAY, false, [lineOf("p1", "เหล็ก", "1.000")]),
  ]) }));
  check("the note names the shop owner and never says ขอสิทธิ์",
    noteScreen?.moneyNote?.includes("เจ้าของร้าน") === true &&
      noteScreen.moneyNote.includes("ขอสิทธิ์") === false,
    noteScreen?.moneyNote ?? "");

  // =====================================================================
  header("D — the midnight-straddle bill takes its SHOP day (date_utc reddens this)");
  if (onH !== null) {
    const bm = onH.bills.find((b) => b.bill_id === "bm");
    const shopD = shopDate(ISO_MIDNIGHT);
    const utcD = `${pad(new Date(ISO_MIDNIGHT).getUTCDate())}/${pad(new Date(ISO_MIDNIGHT).getUTCMonth() + 1)}/${String(new Date(ISO_MIDNIGHT).getUTCFullYear() + 543)}`;
    console.log(`      bm.date=${bm?.date ?? "?"}  shop=${shopD}  utc=${utcD}`);
    check("bm.date equals the SHOP-time expected date (date_utc reddens this)",
      bm?.date === expectedDate(ISO_MIDNIGHT), `got=${bm?.date ?? "?"} expected=${expectedDate(ISO_MIDNIGHT)}`);
    check("control: the instant straddles midnight — its shop day and UTC day differ",
      shopD !== utcD, `shop=${shopD} utc=${utcD}`);
  }

  // =====================================================================
  header("E — a seller with NO bills: a calm history with its own sentence (empty_error reddens this)");
  const emptyRaw = sellerHistoryScreen({ kind: "ok", body: bodyOf("s2", true, []) });
  const empty: SellerHistoryScreen =
    BREAK === "empty_error"
      ? { kind: "message", tone: "server", badge: "ผิดพลาด", lines: ["บิลนี้อ่านไม่ได้"], action: null }
      : emptyRaw;
  const emptyH = asHistory(empty);
  check("no bills -> a HISTORY screen (not an error message) with the empty sentence",
    emptyH !== null && emptyH.bills.length === 0 &&
      emptyH.emptyLine === "ยังไม่มีบิลก่อนหน้าของผู้ขายรายนี้ในระบบ",
    empty.kind === "history" ? `emptyLine=${empty.emptyLine ?? "null"}` : `kind=${empty.kind}`);

  // =====================================================================
  header("R — a money field arriving as a JSON NUMBER refuses the whole response (accept_number reddens this)");
  const numericBody = maybeStringifyMoney(bodyOf("s1", true, [
    billOf("bn", "B-2569-2", ISO_DAY, false, [lineNumber("p1", "เหล็ก", "1.000", 16)], "16.00", "16.00", "paid"),
  ]));
  const refused = sellerHistoryScreen({ kind: "ok", body: numericBody });
  check("a JSON-number unit_price refuses the WHOLE response — the calm 'cannot read' message, no number in it",
    refused.kind === "message" && refused.badge === "อ่านข้อมูลจากระบบไม่ได้" &&
      !/\d/.test(refused.lines.join(" ")),
    refused.kind === "message" ? refused.badge : `kind=${refused.kind}`);
  // A numeric NET_WEIGHT is refused too, always (weight is checked regardless of money).
  const numWeight = sellerHistoryScreen({ kind: "ok", body: bodyOf("s1", false, [
    { bill_id: "bw", doc_no: "B-2569-4", server_received_at: ISO_DAY, is_void: false,
      products: [{ product_id: "p1", product_name: "เหล็ก", net_weight: 1.0 }] },
  ]) });
  check("a JSON-number net_weight refuses the whole response, even with money hidden",
    numWeight.kind === "message", `kind=${numWeight.kind}`);

  // =====================================================================
  header("F — the fetch-failure branches, each its own tone and action");
  const noTok = sellerHistoryScreen({ kind: "no_token" });
  check("no_token -> session tone, sign-in offered",
    noTok.kind === "message" && noTok.tone === "session" && noTok.action?.kind === "sign_in",
    noTok.kind === "message" ? noTok.tone : noTok.kind);
  const offline = sellerHistoryScreen({ kind: "unreachable" });
  check("unreachable -> offline tone, retry ลองอีกครั้ง, and NO number",
    offline.kind === "message" && offline.tone === "offline" &&
      offline.action?.kind === "retry" && offline.action.label === "ลองอีกครั้ง" &&
      !/\d/.test(offline.lines.join(" ")),
    offline.kind === "message" ? offline.tone : offline.kind);
  const expired = sellerHistoryScreen({ kind: "http", status: 401, code: null });
  check("401 -> session tone, sign-in offered (never a retry that re-asks the dead token)",
    expired.kind === "message" && expired.tone === "session" && expired.action?.kind === "sign_in");
  const unknownSeller = sellerHistoryScreen({ kind: "http", status: 404, code: SELLER_NOT_FOUND });
  check("404 seller_not_found -> a CALM message (a local/unsynced seller), no error tone, no action",
    unknownSeller.kind === "message" && unknownSeller.tone === "calm" && unknownSeller.action === null,
    unknownSeller.kind === "message" ? unknownSeller.tone : unknownSeller.kind);
  const routeMissing = sellerHistoryScreen({ kind: "http", status: 404, code: null });
  check("404 with no seller_not_found code -> the route-missing (older server) message",
    routeMissing.kind === "message" && routeMissing.tone === "server" && routeMissing.action === null &&
      routeMissing.badge === "ระบบยังไม่มีหน้าประวัติผู้ขาย",
    routeMissing.kind === "message" ? routeMissing.badge : routeMissing.kind);
  const serverErr = sellerHistoryScreen({ kind: "http", status: 500, code: null });
  check("500 -> server tone with a retry",
    serverErr.kind === "message" && serverErr.tone === "server" && serverErr.action?.kind === "retry");

  return failures === 0 ? 0 : 1;
}

/** A wire line whose net_weight is a string but whose unit_price is a JSON NUMBER —
 *  the defect the refuse cell exists to catch. */
function lineNumber(product_id: string, product_name: string, net_weight: string, unit_price: number): Obj {
  return { product_id, product_name, net_weight, unit_price };
}

// PRESET RED, per lessons/a-default-exit-code-is-a-default-verdict.md: cleared to
// 0 only if every cell passes.
process.exitCode = 1;

try {
  const code = main();
  if (failures === 0) console.log("\nALL CELLS PASSED");
  console.log(`SELLER_HISTORY_EXIT=${String(code)}`);
  process.exitCode = code;
} catch (err: unknown) {
  console.log("");
  console.log(`  [FAIL] the run died: ${err instanceof Error ? err.message : String(err)}`);
  console.log("SELLER_HISTORY_EXIT=1");
  process.exitCode = 1;
}
