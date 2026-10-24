/**
 * THE THERMAL SLIP (B4, ROADMAP P1.17) — pure: what a slip says, laid out for a 58 or 80 mm paper
 * roll, and the ESC/POS bytes that print it. No DOM, no Electron, no clock: the caller passes the
 * moment of printing, so the same bill and the same moment always give the same bytes (the golden
 * files in src/proof/golden/ pin them).
 *
 * ONE SOURCE, TWO RENDERERS. `slipLines` decides the content; the screen's preview draws those lines
 * and `escposBytes` encodes the SAME lines, so the preview cannot show a slip the printer will not.
 *
 * THAI IS SENT AS TIS-620 BYTES under a printer code page selected with `ESC t n`. Which `n` a printer
 * calls Thai is the PRINTER's, not ours (Epson's table puts Thai at 20–26; other makers differ), so
 * it is a setting and `testPageLines` prints one line per candidate for the operator to choose by eye.
 * Above and below marks (ั ิ ี ึ ื ุ ู ฺ ็ ่ ้ ๊ ๋ ์ ํ ๎) take NO column: a Thai-capable printer composes
 * them onto the letter before them, and the column count below assumes it.
 *
 * Money and weights are the server's decimal strings, grouped for the eye only (./money); dates are
 * shop time in the Buddhist era from @recycle/shop-time. A slip carries the seller's code and name
 * and nothing more about them (never an ID number or an address).
 */
import { shopDateTime } from "@recycle/shop-time";

import type { BillDetail, BillLine } from "./bills";
import { display } from "./money";

export type PaperWidth = 58 | 80;

/** Font A is 12 dots wide; a 58 mm head prints 384 dots and an 80 mm head 576. */
export const COLUMNS: Readonly<Record<PaperWidth, number>> = { 58: 32, 80: 48 };

export interface ShopHeader {
  readonly name: string;
  readonly address: string | null;
  readonly phone: string | null;
}

export type SlipLine =
  | { readonly kind: "text"; readonly text: string; readonly align: "left" | "center"; readonly bold?: boolean; readonly big?: boolean }
  | { readonly kind: "pair"; readonly left: string; readonly right: string; readonly bold?: boolean }
  | { readonly kind: "rule" }
  | { readonly kind: "blank" };

// --- printability -------------------------------------------------------------------------------

export const SLIP_TEXT = {
  noDocNo: "บิลนี้ยังไม่มีเลขที่บิลจากเซิร์ฟเวอร์ จึงยังพิมพ์สลิปไม่ได้ — พิมพ์ได้เมื่อบิลซิงก์แล้ว",
  voided: "บิลนี้ถูกยกเลิกแล้ว จึงไม่พิมพ์สลิป",
} as const;

/**
 * What the screen says after a send. "Sent" is all the program can know -- a printer that took the
 * bytes may still be out of paper -- so the sentence asks the operator to look, never claims a print
 * (impeccable · clarify.md: say what happened and what to do next).
 */
export const SEND_TEXT: Readonly<Record<string, string>> = {
  sent: "ส่งสลิปออกไปแล้ว — ตรวจดูที่เครื่องพิมพ์ว่าสลิปออกมาครบ",
  refused: "เครื่องพิมพ์ไม่รับการเชื่อมต่อ — ตรวจว่าเปิดเครื่องอยู่ และที่อยู่กับพอร์ตถูกต้อง",
  unreachable: "ติดต่อเครื่องพิมพ์ไม่ได้ — ตรวจสายแลนหรือที่อยู่เครื่องพิมพ์",
  share_failed: "ส่งไปยังเครื่องพิมพ์ที่แชร์ไว้ไม่สำเร็จ — ตรวจชื่อเครื่องและชื่อที่แชร์",
  invalid_target: "การตั้งค่าเครื่องพิมพ์ไม่ถูกต้อง — แก้ที่เมนู เครื่องพิมพ์",
  not_configured: "ยังไม่ได้ตั้งค่าเครื่องพิมพ์ — ตั้งค่าที่เมนู เครื่องพิมพ์ ก่อน",
  failed: "ส่งสลิปไม่สำเร็จ — ลองอีกครั้ง",
};

export function sendText(kind: string): string {
  return SEND_TEXT[kind] ?? SEND_TEXT["failed"] ?? "";
}

/** Why this bill may not be printed, or null. A slip is a receipt: only a synced, live bill gets one. */
export function slipRefusal(bill: Pick<BillDetail, "doc_no" | "status">): string | null {
  if (bill.doc_no === null || bill.doc_no === "") return SLIP_TEXT.noDocNo;
  if (bill.status === "voided") return SLIP_TEXT.voided;
  return null;
}

// --- Thai columns -------------------------------------------------------------------------------

/** Thai marks written above or below the letter before them: they occupy no column. */
export function isZeroWidth(cp: number): boolean {
  return cp === 0x0e31 || (cp >= 0x0e34 && cp <= 0x0e3a) || (cp >= 0x0e47 && cp <= 0x0e4e);
}

/** How many printer columns a string takes. */
export function cells(s: string): number {
  let n = 0;
  for (const ch of s) if (!isZeroWidth(ch.codePointAt(0) ?? 0)) n += 1;
  return n;
}

/** Split into clusters: a base character with the marks that ride on it. Never split inside one. */
function clusters(s: string): string[] {
  const out: string[] = [];
  for (const ch of s) {
    if (out.length > 0 && isZeroWidth(ch.codePointAt(0) ?? 0)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

/** Wrap to `width` columns, at spaces where possible, never inside a cluster; a leading indent is kept on every line. */
export function wrap(text: string, width: number): string[] {
  const indent = /^ */.exec(text)?.[0] ?? "";
  if (indent.length > 0 && indent.length < width) return wrap(text.slice(indent.length), width - indent.length).map((l) => indent + l);
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter((w) => w !== "")) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (cells(candidate) <= width) {
      line = candidate;
      continue;
    }
    if (line !== "") lines.push(line);
    line = "";
    for (const c of clusters(word)) {
      if (cells(line + c) > width) {
        lines.push(line);
        line = c;
      } else line += c;
    }
  }
  if (line !== "" || lines.length === 0) lines.push(line);
  return lines;
}

/** The text of one line exactly as the printer lays it out, `width` columns or fewer. */
export function lineText(l: SlipLine, width: number): string[] {
  switch (l.kind) {
    case "rule":
      return ["-".repeat(width)];
    case "blank":
      return [""];
    case "text":
      return wrap(l.text, width).map((t) =>
        l.align === "center" ? " ".repeat(Math.floor((width - cells(t)) / 2)) + t : t);
    case "pair": {
      const room = width - cells(l.right) - 1;
      const left = wrap(l.left, Math.max(room, 1));
      const last = left.pop() ?? "";
      return [...left, last + " ".repeat(Math.max(width - cells(last) - cells(l.right), 1)) + l.right];
    }
  }
}

// --- what a slip says ---------------------------------------------------------------------------

/** The slip for one bill. `printedAt` is passed in so the bytes are a function of their inputs. */
/**
 * ONE BILL LINE ON PAPER, under its own rules (server migration 0027, M0's unit fix).
 *
 *   weight  the weighing (ชั่ง ... ภาชนะ ... <unit>), the impurity deduction and its reason when there
 *           is one, then สุทธิ <net> x <price> = amount
 *   piece   <pieces> <unit> x <price> = amount
 *   lump    ราคาเหมา = amount
 *
 * THE UNIT IS THE LINE'S OWN. Until 2026-10-24 every line printed "กก." whatever the product was
 * measured in; a product sold by the ลัง printed as kilograms. A server before 0027 sends no unit,
 * and only then does the old "กก." stand in -- the unit every such line was printed with.
 *
 * THE CONTAINER IS "ภาชนะ", NOT "หัก". The slip used to print the tare as หัก, which is exactly the
 * word an impurity deduction needs; two different subtractions under one word on the seller's
 * receipt is the confusion that ends at the counter. ภาชนะ is the word the phone and the desktop
 * bill already use for the tare (impeccable · clarify · "Keep the same noun and verb for the same
 * concept throughout the product.").
 */
export function itemLines(i: BillLine): SlipLine[] {
  const name = [i.product_code, i.product_name].filter((s) => s !== null && s !== "").join(" ");
  const unit = i.unit_name ?? "กก.";
  const out: SlipLine[] = [{ kind: "text", text: name, align: "left", bold: true }];
  if (i.pricing_basis === "piece") {
    out.push({ kind: "pair", left: `  ${(i.quantity ?? "").replace(/\.0+$/, "")} ${unit} x ${display(i.unit_price)}`, right: display(i.amount) });
    return out;
  }
  if (i.pricing_basis === "lump") {
    out.push({ kind: "pair", left: "  ราคาเหมา", right: display(i.amount) });
    return out;
  }
  out.push({ kind: "text", text: `  ชั่ง ${display(i.gross_weight)} ภาชนะ ${display(i.tare_weight)} ${unit}`, align: "left" });
  if ((i.deduction_mode === "kg" || i.deduction_mode === "percent") && i.deduction_weight !== null && i.deduction_weight !== undefined) {
    const pct = i.deduction_mode === "percent" && i.deduction_pct ? ` (${display(i.deduction_pct)}%)` : "";
    out.push({ kind: "text", text: `  หักสิ่งเจือปน ${display(i.deduction_weight)} ${unit}${pct}`, align: "left" });
    if (i.deduction_reason) out.push({ kind: "text", text: `  เหตุผล ${i.deduction_reason}`, align: "left" });
  }
  out.push({ kind: "pair", left: `  สุทธิ ${display(i.net_weight)} x ${display(i.unit_price)}`, right: display(i.amount) });
  return out;
}

export function slipLines(shop: ShopHeader, bill: BillDetail, printedAt: string): SlipLine[] {
  const lines: SlipLine[] = [{ kind: "text", text: shop.name, align: "center", bold: true, big: true }];
  if (shop.address !== null && shop.address !== "") lines.push({ kind: "text", text: shop.address, align: "center" });
  if (shop.phone !== null && shop.phone !== "") lines.push({ kind: "text", text: `โทร ${shop.phone}`, align: "center" });
  lines.push(
    { kind: "blank" },
    { kind: "text", text: "ใบรับซื้อสินค้า", align: "center", bold: true },
    { kind: "rule" },
    { kind: "pair", left: "เลขที่", right: bill.doc_no ?? "" },
    { kind: "pair", left: "วันที่", right: shopDateTime(bill.server_received_at) },
    { kind: "text", text: `ผู้ขาย ${[bill.seller_code, bill.seller_name].filter((s) => s !== null && s !== "").join(" ")}`, align: "left" },
  );
  if (bill.vehicle_no !== null && bill.vehicle_no !== "") lines.push({ kind: "pair", left: "ทะเบียนรถ", right: bill.vehicle_no });
  lines.push({ kind: "rule" });
  for (const i of bill.items) lines.push(...itemLines(i));
  lines.push(
    { kind: "rule" },
    { kind: "pair", left: "รวมเงิน (บาท)", right: display(bill.total_amount), bold: true },
    ...(bill.paid_amount !== null ? [{ kind: "pair", left: "จ่ายแล้ว", right: display(bill.paid_amount) } as const] : []),
    { kind: "rule" },
    { kind: "text", text: `พิมพ์เมื่อ ${shopDateTime(printedAt)}`, align: "center" },
  );
  return lines;
}

/** Candidate Thai code pages for the test page (Epson's Thai tables). The setting accepts 0–255. */
export const THAI_CODE_PAGE_CANDIDATES: readonly number[] = [20, 21, 22, 23, 24, 25, 26];
export const DEFAULT_THAI_CODE_PAGE = 21;
export const TEST_SENTENCE = "ก่อนเที่ยง น้ำแข็ง ฿1,234.50";

/** The test page: one line per code page, each printed under its own `ESC t n`. */
export function testPageLines(): { codePage: number | null; line: SlipLine }[] {
  return [
    { codePage: null, line: { kind: "text", text: "TEST / Thai code page", align: "left", bold: true } },
    ...THAI_CODE_PAGE_CANDIDATES.map((n) => ({ codePage: n, line: { kind: "text", text: `n=${String(n)} ${TEST_SENTENCE}`, align: "left" } as SlipLine })),
  ];
}

// --- bytes --------------------------------------------------------------------------------------

/**
 * TIS-620: ASCII stays itself; U+0E01..U+0E3A -> 0xA1..0xDA and U+0E3F..U+0E5B -> 0xDF..0xFB.
 * Anything else has no byte: it is sent as '?' and REPORTED, never silently dropped.
 */
export function tis620(s: string): { bytes: number[]; unencodable: string[] } {
  const bytes: number[] = [];
  const unencodable: string[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x20 && cp <= 0x7e) bytes.push(cp);
    else if ((cp >= 0x0e01 && cp <= 0x0e3a) || (cp >= 0x0e3f && cp <= 0x0e5b)) bytes.push(cp - 0x0e01 + 0xa1);
    else {
      bytes.push(0x3f);
      unencodable.push(ch);
    }
  }
  return { bytes, unencodable };
}

const ESC = 0x1b;
const GS = 0x1d;
const FS = 0x1c;
const LF = 0x0a;

export interface Encoded {
  readonly bytes: Uint8Array;
  /** Characters the printer has no byte for (sent as '?'). Empty on a correct slip. */
  readonly unencodable: readonly string[];
}

/** One line's bytes under its style; the style is switched back off after the line. */
function lineBytes(l: SlipLine, width: number, out: number[], bad: string[]): void {
  const bold = (l.kind === "text" || l.kind === "pair") && l.bold === true;
  const big = l.kind === "text" && l.big === true;
  if (bold) out.push(ESC, 0x45, 1);
  if (big) out.push(GS, 0x21, 0x01); // double HEIGHT only: the column count stays the same
  for (const t of lineText(l, width)) {
    const e = tis620(t);
    out.push(...e.bytes, LF);
    bad.push(...e.unencodable);
  }
  if (big) out.push(GS, 0x21, 0x00);
  if (bold) out.push(ESC, 0x45, 0);
}

/**
 * The bytes for a run of lines: ESC @ (reset), FS . (leave a Chinese printer's double-byte mode, so a
 * byte above 0x7F is one Thai letter), ESC t n (the Thai code page), the lines, then feed and cut.
 * A line may carry its own code page (the test page); otherwise `codePage` holds throughout.
 */
export function escposBytes(lines: readonly ({ codePage: number | null; line: SlipLine } | SlipLine)[], width: PaperWidth, codePage: number): Encoded {
  const cols = COLUMNS[width];
  const out: number[] = [ESC, 0x40, FS, 0x2e, ESC, 0x74, codePage];
  const bad: string[] = [];
  for (const item of lines) {
    if ("line" in item) {
      if (item.codePage !== null) out.push(ESC, 0x74, item.codePage);
      lineBytes(item.line, cols, out, bad);
    } else lineBytes(item, cols, out, bad);
  }
  out.push(ESC, 0x64, 4, GS, 0x56, 0x42, 0x00); // feed 4 lines, then feed-and-partial-cut
  return { bytes: Uint8Array.from(out), unencodable: bad };
}

export function isPaperWidth(n: unknown): n is PaperWidth {
  return n === 58 || n === 80;
}

export function isCodePage(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 255;
}
