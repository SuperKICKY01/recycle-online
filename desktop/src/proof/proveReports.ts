/**
 * THE REPORT'S PURE PARTS (B7): the exact total, and the .xlsx file read back by an INDEPENDENT
 * reader (Python's own zipfile and XML parser, desktop/tools/read_xlsx.py).
 *
 *   npm run prove:reports
 *
 *   S1 sumDecimal: 0.10 x 3 = "0.30" (a float says 0.30000000000000004); mixed scales; negatives; one
 *      unreadable value -> null, never a smaller total
 *   X1 the workbook opens as a ZIP with no bad CRC, declares its parts, and names its sheet
 *   X2 a money cell's stored text is the server's string VERBATIM ("1234567.89"), as a number cell
 *      formatted "#,##0.00"; a weight's is "8420.000" under "#,##0.000"
 *   X3 Thai text and the XML specials (& < > ") come back exactly; a forbidden control character is
 *      dropped rather than corrupting the part
 *   X4 a "money" value that is not a plain decimal is written as TEXT, never coerced into a number
 *   X5 the same input gives the same bytes (no clock in the file)
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { sumDecimal } from "../shared/money";
import { buildXlsx, type Sheet } from "../shared/xlsx";
import { check, finish, header } from "./harness";
import { formatOf, readXlsx } from "./xlsxReader";

void finish("PROVE_REPORTS", async () => {
  header("S the exact total");
  check("S1 0.10+0.10+0.10 = 0.30; 1.5 + 2.25 = 3.75; -1.00 + 0.50 = -0.50; 'abc' -> null",
    sumDecimal(["0.10", "0.10", "0.10"]) === "0.30" && sumDecimal(["1.5", "2.25"]) === "3.75"
      && sumDecimal(["-1.00", "0.50"]) === "-0.50" && sumDecimal(["1.00", "abc"]) === null && sumDecimal([]) === "0"
      && sumDecimal(["999999999999.99", "0.01"]) === "1000000000000.00",
    JSON.stringify([sumDecimal(["0.10", "0.10", "0.10"]), 0.1 + 0.1 + 0.1]));

  header("X the workbook, read by Python");
  const sheet: Sheet = {
    name: "รายการรับซื้อ",
    columns: [{ header: "เลขที่บิล", kind: "text" }, { header: "ผู้ขาย", kind: "text" }, { header: "ยอดเงิน", kind: "money" }, { header: "น้ำหนัก", kind: "weight" }],
    rows: [
      ["B-2569-0001", "สมชาย ใจดี & ลูก <หจก.> \"ทดสอบ\"", "1234567.89", "8420.000"],
      ["B-2569-0002", "ห้ามมีอักขระ\u0001ควบคุม", "not-a-number", null],
    ],
  };
  const dir = mkdtempSync(join(tmpdir(), "recycle-xlsx-"));
  try {
    const bytes = buildXlsx(sheet);
    const file = join(dir, "report.xlsx");
    writeFileSync(file, bytes);
    const x = readXlsx(file);
    check("X1 a valid ZIP, every part declared, the sheet named",
      x.zip_ok && x.content_ok && x.sheet_name === "รายการรับซื้อ" && x.parts.includes("xl/worksheets/sheet1.xml"), JSON.stringify(x.parts));
    const c2 = x.cells["C2"];
    const d2 = x.cells["D2"];
    const fmt = (style: string | null | undefined) => formatOf(x, style);
    check("X2 money stored as the server's string, a number cell under #,##0.00; weight under #,##0.000",
      c2?.type === "n" && c2.text === "1234567.89" && fmt(c2.style) === "#,##0.00" && d2?.text === "8420.000" && fmt(d2.style) === "#,##0.000",
      JSON.stringify({ c2, d2 }));
    check("X3 Thai and & < > \" come back exactly; a control character is dropped",
      x.cells["B2"]?.text === "สมชาย ใจดี & ลูก <หจก.> \"ทดสอบ\"" && x.cells["B3"]?.text === "ห้ามมีอักขระควบคุม" && x.cells["A1"]?.text === "เลขที่บิล",
      JSON.stringify([x.cells["B2"], x.cells["B3"]]));
    check("X4 a money value that is not a decimal is TEXT, not a number", x.cells["C3"]?.type === "inlineStr" && x.cells["C3"].text === "not-a-number",
      JSON.stringify(x.cells["C3"]));
    check("X5 the same input gives the same bytes", Buffer.from(buildXlsx(sheet)).equals(Buffer.from(bytes)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
