/**
 * THE SLIP'S BYTES (B4, ROADMAP P1.17) — pure, no printer.
 *
 *   npm run prove:slip
 *
 * One fixed bill, one fixed shop, one fixed moment of printing; the bytes for 58 and 80 mm are
 * pinned in src/proof/golden/ (written ONCE by RECYCLE_WRITE_GOLDEN=1 after the 58 mm text below was
 * read line by line, and never rewritten to make a red go away). REWRITTEN ONCE, DELIBERATELY,
 * 2026-10-24 (M0/M1): the slip's format changed -- each line's own unit instead of a fixed กก., the
 * container printed as ภาชนะ, the impurity deduction and its reason, a piece-priced line. The new
 * 58 mm lines below were typed by hand FIRST and D1 read them green against the program's bytes
 * before the golden files were written; the old goldens' G1/G2 red was the format change, nothing else.
 *
 *   G1/G2 the 58 / 80 mm bytes equal their golden files
 *   D1    the 58 mm slip, decoded by Node's OWN windows-874 decoder through a command parser written
 *         here, reads exactly the lines typed below by hand
 *   D2    the 80 mm slip: no line wider than 48 columns, every two-sided line exactly 48
 *   E1    framing: ESC @, FS ., ESC t n first; feed and cut last
 *   E2    TIS-620 bytes restated by hand from the standard; a character with no byte is sent as '?'
 *         and REPORTED
 *   E3    every Thai code point survives encode -> Node's windows-874 decode
 *   W1/W2 columns: above/below marks take none, SARA AM takes one; wrapping never splits a letter
 *         from its marks
 *   R1    a bill with no doc_no, or a voided bill, is refused with its sentence
 *   T1    the test page selects each candidate code page before its own line
 *   S1    every send outcome has a sentence, and "sent" never claims the slip PRINTED
 *   P1    a seller's ID number or address handed in with the bill never reaches the bytes
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { BillDetail } from "../shared/bills";
import {
  cells,
  escposBytes,
  SEND_TEXT,
  SLIP_TEXT,
  slipLines,
  slipRefusal,
  testPageLines,
  THAI_CODE_PAGE_CANDIDATES,
  tis620,
  wrap,
  type ShopHeader,
} from "../shared/slip";
import { cols, decode874, parseEscPos } from "./escposReader";
import { check, DESKTOP_ROOT, finish, header } from "./harness";

const GOLDEN = join(DESKTOP_ROOT, "src", "proof", "golden");

const SHOP: ShopHeader = { name: "ร้านรับซื้อของเก่า ทดสอบ", address: "99/1 ม.2 ต.บ้านใหม่ อ.เมือง จ.นนทบุรี 11000", phone: "081-234-5678" };
const BILL: BillDetail = {
  id: "11111111-2222-3333-4444-555555555555", doc_no: "B-2569-0042", seller_id: "s", seller_code: "S001",
  seller_name: "สมชาย ใจดี", vehicle_no: "1กข 1234", total_amount: "13064.00", payment_status: "paid",
  server_received_at: "2026-10-12T03:15:00Z", status: "active", void_reason: null, paid_amount: "13064.00",
  voided_at: null,
  // REWRITTEN 2026-10-24 (server migration 0027, M0/M1): line 1 carries a kg impurity deduction and
  // its reason, and line 3 is piece-priced in its own unit, so the slip's three line shapes are all
  // on the paper this proof reads. The arithmetic is the server's, restated: 1250 - 50 - 25 = 1175 x
  // 8.50 = 9,987.50; 3 x 45.50 = 136.50; 9,987.50 + 2,940.00 + 136.50 = 13,064.00.
  items: [
    { line_no: 1, product_code: "FE-01", product_name: "เหล็กหนา", gross_weight: "1250.000", tare_weight: "50.000",
      net_weight: "1175.000", unit_price: "8.50", amount: "9987.50", unit_name: "กก.", rules_recorded: true,
      pricing_basis: "weight", quantity: "1175.000", deduction_mode: "kg", deduction_pct: null,
      deduction_weight: "25.000", deduction_reason: "ดินติด" },
    { line_no: 2, product_code: "CU-02", product_name: "ทองแดงปอกสาย", gross_weight: "12.500", tare_weight: "0.500",
      net_weight: "12.000", unit_price: "245.00", amount: "2940.00", unit_name: "กก.", rules_recorded: true,
      pricing_basis: "weight", quantity: "12.000", deduction_mode: "none", deduction_pct: null,
      deduction_weight: "0.000", deduction_reason: null },
    { line_no: 3, product_code: "BT-03", product_name: "แบตเตอรี่", gross_weight: "0.000", tare_weight: "0.000",
      net_weight: "0.000", unit_price: "45.50", amount: "136.50", unit_name: "ชิ้น", rules_recorded: true,
      pricing_basis: "piece", quantity: "3.000", deduction_mode: "none", deduction_pct: null,
      deduction_weight: "0.000", deduction_reason: null },
  ],
};
const PRINTED_AT = "2026-10-12T03:20:00Z";

// The 58 mm slip as the printer lays it out, typed by hand: 32 columns, Thai above/below marks take
// none. Each space run is COUNTED here from the columns of its own line (e.g. เลขที่ = 4 columns,
// B-2569-0042 = 11, so 32 - 15 = 17 spaces), not copied from the program's output.
const sp = (n: number): string => " ".repeat(n);
const EXPECTED_58 = [
  `${sp(6)}ร้านรับซื้อของเก่า ทดสอบ`,           // 19 columns, (32 - 19) / 2 = 6
  "99/1 ม.2 ต.บ้านใหม่ อ.เมือง จ.นนทบุรี",       // exactly 32: the wrap point
  `${sp(13)}11000`,                             // (32 - 5) / 2 = 13
  `${sp(8)}โทร 081-234-5678`,                   // 16 columns
  "",
  `${sp(11)}ใบรับซื้อสินค้า`,                     // 10 columns
  "-".repeat(32),
  `เลขที่${sp(17)}B-2569-0042`,
  `วันที่${sp(13)}12/10/2569 10:15`,              // 03:15 UTC + 7 h; 2026 in the Buddhist era
  "ผู้ขาย S001 สมชาย ใจดี",
  `ทะเบียนรถ${sp(16)}1กข 1234`,
  "-".repeat(32),
  "FE-01 เหล็กหนา",
  "  ชั่ง 1,250.000 ภาชนะ 50.000 กก.",            // the container is ภาชนะ, never หัก (2026-10-24)
  "  หักสิ่งเจือปน 25.000 กก.",
  "  เหตุผล ดินติด",
  `  สุทธิ 1,175.000 x 8.50${sp(2)}9,987.50`,    // 22 + 8 = 30
  "CU-02 ทองแดงปอกสาย",
  "  ชั่ง 12.500 ภาชนะ 0.500 กก.",
  `  สุทธิ 12.000 x 245.00${sp(3)}2,940.00`,     // 21 + 8 = 29
  "BT-03 แบตเตอรี่",
  `  3 ชิ้น x 45.50${sp(12)}136.50`,              // 14 + 6 = 20: the line's OWN unit, not กก.
  "-".repeat(32),
  `รวมเงิน (บาท)${sp(11)}13,064.00`,             // 12 + 9 = 21
  `จ่ายแล้ว${sp(17)}13,064.00`,                   // 6 + 9 = 15
  "-".repeat(32),
  `${sp(4)}พิมพ์เมื่อ 12/10/2569 10:20`,         // 23 columns
];

void finish("PROVE_SLIP", async () => {
  const s58 = escposBytes(slipLines(SHOP, BILL, PRINTED_AT), 58, 21);
  const s80 = escposBytes(slipLines(SHOP, BILL, PRINTED_AT), 80, 21);

  if (process.env["RECYCLE_WRITE_GOLDEN"] === "1") {
    mkdirSync(GOLDEN, { recursive: true });
    writeFileSync(join(GOLDEN, "slip58.bin"), s58.bytes);
    writeFileSync(join(GOLDEN, "slip80.bin"), s80.bytes);
    console.log("golden files written");
  }

  header("G the golden files");
  for (const [cell, w, got] of [["G1", 58, s58.bytes], ["G2", 80, s80.bytes]] as const) {
    const p = join(GOLDEN, `slip${String(w)}.bin`);
    const want = existsSync(p) ? new Uint8Array(readFileSync(p)) : new Uint8Array(0);
    let at = -1;
    for (let i = 0; i < Math.max(want.length, got.length); i += 1) if (want[i] !== got[i]) { at = i; break; }
    check(`${cell} the ${String(w)} mm bytes equal src/proof/golden/slip${String(w)}.bin`, want.length > 0 && at === -1,
      `${String(got.length)} bytes vs golden ${String(want.length)}; first difference at ${String(at)}`);
  }

  header("D decoded independently");
  const lines58 = parseEscPos(s58.bytes).lines.map(decode874);
  const firstBad = EXPECTED_58.findIndex((l, i) => lines58[i] !== l);
  check("D1 the 58 mm slip reads exactly the hand-typed lines", firstBad === -1 && lines58.length === EXPECTED_58.length,
    firstBad === -1 ? `${String(lines58.length)} lines` : `line ${String(firstBad)}: got ${JSON.stringify(lines58[firstBad])} want ${JSON.stringify(EXPECTED_58[firstBad])}`);
  if (process.env["RECYCLE_DUMP_SLIP"] === "1") for (const l of lines58) console.log(`DUMP ${String(cols(l)).padStart(2)} |${l}|`);
  check("D1 no unencodable character in the fixture slip", s58.unencodable.length === 0 && s80.unencodable.length === 0,
    JSON.stringify(s58.unencodable));
  const lines80 = parseEscPos(s80.bytes).lines.map(decode874);
  const labels = ["เลขที่", "วันที่", "ทะเบียนรถ", "  สุทธิ", "รวมเงิน", "จ่ายแล้ว"];
  const pairs80 = lines80.filter((l) => labels.some((p) => l.startsWith(p)));
  check("D2 80 mm: no line wider than 48, the seven two-sided lines exactly 48, rules 48 dashes",
    lines80.every((l) => cols(l) <= 48) && pairs80.length === 7 && pairs80.every((l) => cols(l) === 48)
      && lines80.filter((l) => /^-+$/.test(l)).every((l) => l.length === 48),
    JSON.stringify({ widest: Math.max(...lines80.map(cols)), pairs: pairs80.map(cols) }));

  header("E encoding");
  const head = Array.from(s58.bytes.slice(0, 7));
  const tail = Array.from(s58.bytes.slice(-7));
  check("E1 starts ESC @, FS ., ESC t 21; ends ESC d 4, GS V 66 0",
    JSON.stringify(head) === JSON.stringify([0x1b, 0x40, 0x1c, 0x2e, 0x1b, 0x74, 21])
      && JSON.stringify(tail) === JSON.stringify([0x1b, 0x64, 4, 0x1d, 0x56, 0x42, 0]), JSON.stringify({ head, tail }));
  const table: [string, number][] = [["ก", 0xa1], ["ฮ", 0xce], ["ะ", 0xd0], ["ั", 0xd1], ["ฺ", 0xda], ["฿", 0xdf],
    ["เ", 0xe0], ["ๆ", 0xe6], ["็", 0xe7], ["์", 0xec], ["๐", 0xf0], ["๙", 0xf9], ["๛", 0xfb], ["A", 0x41], ["~", 0x7e]];
  const wrong = table.filter(([c, b]) => JSON.stringify(tis620(c).bytes) !== JSON.stringify([b]));
  check("E2 TIS-620 bytes match the standard's table", wrong.length === 0, JSON.stringify(wrong));
  const bad = tis620("ก·×é");
  check("E2 a character with no byte goes as '?' and is reported", JSON.stringify(bad.bytes) === JSON.stringify([0xa1, 0x3f, 0x3f, 0x3f])
    && JSON.stringify(bad.unencodable) === JSON.stringify(["·", "×", "é"]), JSON.stringify(bad));
  let thai = "";
  for (let cp = 0x0e01; cp <= 0x0e5b; cp += 1) if (cp <= 0x0e3a || cp >= 0x0e3f) thai += String.fromCodePoint(cp);
  const round = decode874(Uint8Array.from(tis620(thai).bytes));
  check("E3 all 87 Thai code points survive encode -> windows-874 decode", round === thai && [...thai].length === 87,
    `${String([...thai].length)} code points`);

  header("W columns");
  check("W1 สมชาย 5, ใจดี 3, ที่ 1, น้ำ 2 (SARA AM takes a column)",
    cells("สมชาย") === 5 && cells("ใจดี") === 3 && cells("ที่") === 1 && cells("น้ำ") === 2,
    JSON.stringify([cells("สมชาย"), cells("ใจดี"), cells("ที่"), cells("น้ำ")]));
  check("W2 wrapping never parts a letter from its marks", JSON.stringify(wrap("ที่ที่ที่", 2)) === JSON.stringify(["ที่ที่", "ที่"]),
    JSON.stringify(wrap("ที่ที่ที่", 2)));

  header("R refusals");
  check("R1 no doc_no -> the not-synced sentence; voided -> the voided sentence; a live synced bill -> null",
    slipRefusal({ doc_no: null, status: "active" }) === SLIP_TEXT.noDocNo
      && slipRefusal({ doc_no: "B-1", status: "voided" }) === SLIP_TEXT.voided
      && slipRefusal({ doc_no: "B-1", status: "active" }) === null);

  header("T the test page");
  const tp = parseEscPos(escposBytes(testPageLines(), 58, 21).bytes);
  const selects = tp.commands.filter((c) => c.startsWith("1b 74")).map((c) => parseInt(c.split(" ")[2] ?? "", 16));
  const tpText = tp.lines.map(decode874);
  check("T1 ESC t for the default, then one per candidate, each before a line naming it",
    JSON.stringify(selects) === JSON.stringify([21, ...THAI_CODE_PAGE_CANDIDATES])
      && THAI_CODE_PAGE_CANDIDATES.every((n) => tpText.some((l) => l.startsWith(`n=${String(n)} `))), JSON.stringify(selects));

  header("S send sentences");
  const kinds = ["sent", "refused", "unreachable", "share_failed", "invalid_target", "not_configured", "failed"];
  check("S1 every outcome has a sentence; 'sent' never says the slip printed",
    kinds.every((k) => (SEND_TEXT[k] ?? "") !== "") && !(SEND_TEXT["sent"] ?? "").includes("พิมพ์แล้ว")
      && !(SEND_TEXT["sent"] ?? "").includes("พิมพ์เสร็จ"), SEND_TEXT["sent"]);

  header("P personal data");
  const leaky = { ...BILL, id_number: "3100700000001", address: "บ้านเลขที่ลับ 77" } as BillDetail;
  const text = parseEscPos(escposBytes(slipLines(SHOP, leaky, PRINTED_AT), 80, 21).bytes).lines.map(decode874).join("\n");
  check("P1 an ID number or address passed in with the bill is not on the slip",
    !text.includes("3100700000001") && !text.includes("บ้านเลขที่ลับ") && text.includes("สมชาย ใจดี"));
});
