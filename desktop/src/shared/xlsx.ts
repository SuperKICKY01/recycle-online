/**
 * ONE SHEET, WRITTEN AS AN .xlsx (B7) — pure, no library, no clock: the same input gives the same
 * bytes. An .xlsx is a ZIP of XML parts; this writes the smallest set Excel requires (content types,
 * the package and workbook relationships, the workbook, styles, one worksheet), STORED (no
 * compression), so every byte is ours to state. No dependency enters desktop/'s lockfile (D-1).
 *
 * MONEY STAYS THE SERVER'S STRING TO THE FILE (hard rule 1): a money or weight cell is a NUMBER cell
 * whose `<v>` is the server's decimal string VERBATIM — never parsed into a float on the way — with
 * a number format ("#,##0.00" / "#,##0.000") so Excel shows it grouped and can still add it up. A
 * value that is not a plain decimal is written as TEXT instead, never coerced. Text (Thai included)
 * is an inline string, XML-escaped; dates arrive already formatted (Buddhist era, shop time) as text.
 */
export type ColumnKind = "text" | "money" | "weight";

export interface Sheet {
  readonly name: string;
  /** M2 (SRS 3: "มีหัวกระดาษเป็นชื่อกิจการ"): a title line above the header, e.g. the shop's name and the range.
   *  Absent, the header is row 1 exactly as before. */
  readonly title?: string;
  readonly columns: readonly { readonly header: string; readonly kind: ColumnKind; readonly width?: number }[];
  readonly rows: readonly (readonly (string | null)[])[];
}

const enc = new TextEncoder();

/** XML text: escaped, and with the characters XML 1.0 forbids removed rather than producing a corrupt part. */
export function xmlText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** "A", "B", … "Z", "AA" … for a 0-based column. */
export function columnName(i: number): string {
  let n = i + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

const DECIMAL = /^-?\d+(\.\d+)?$/;

function cell(ref: string, value: string | null, kind: ColumnKind | "header"): string {
  if (value === null || value === "") return "";
  if ((kind === "money" || kind === "weight") && DECIMAL.test(value)) {
    return `<c r="${ref}" s="${kind === "money" ? 1 : 2}"><v>${value}</v></c>`;
  }
  const style = kind === "header" ? ' s="3"' : "";
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${xmlText(value)}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const cols = sheet.columns.map((c, i) => `<col min="${String(i + 1)}" max="${String(i + 1)}" width="${String(c.width ?? 16)}" customWidth="1"/>`).join("");
  const top = sheet.title !== undefined ? 1 : 0;
  const titleRow = sheet.title !== undefined ? `<row r="1">${cell("A1", sheet.title, "header")}</row>` : "";
  const hr = top + 1;
  const head = `${titleRow}<row r="${String(hr)}">${sheet.columns.map((c, i) => cell(`${columnName(i)}${String(hr)}`, c.header, "header")).join("")}</row>`;
  const body = sheet.rows.map((r, ri) => {
    const n = ri + hr + 1;
    return `<row r="${String(n)}">${sheet.columns.map((c, ci) => cell(`${columnName(ci)}${String(n)}`, r[ci] ?? null, c.kind)).join("")}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${head}${body}</sheetData></worksheet>`;
}

const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0.00"/><numFmt numFmtId="165" formatCode="#,##0.000"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Tahoma"/></font><font><b/><sz val="11"/><name val="Tahoma"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/** A sheet name Excel accepts: at most 31 characters, none of \ / ? * [ ] :, and unique in the workbook. */
function sheetNames(sheets: readonly Sheet[]): string[] {
  const seen = new Set<string>();
  return sheets.map((s, i) => {
    let base = s.name.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || `Sheet${String(i + 1)}`;
    let name = base;
    for (let n = 2; seen.has(name.toLowerCase()); n += 1) {
      const suffix = ` (${String(n)})`;
      base = base.slice(0, 31 - suffix.length);
      name = base + suffix;
    }
    seen.add(name.toLowerCase());
    return name;
  });
}

function parts(sheets: readonly Sheet[]): [string, string][] {
  const names = sheetNames(sheets);
  const overrides = sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${String(i + 1)}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("");
  const sheetTags = names.map((n, i) => `<sheet name="${xmlText(n)}" sheetId="${String(i + 1)}" r:id="rId${String(i + 1)}"/>`).join("");
  const rels = sheets.map((_, i) => `<Relationship Id="rId${String(i + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${String(i + 1)}.xml"/>`).join("");
  return [
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}<Relationship Id="rId${String(sheets.length + 1)}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", STYLES],
    ...sheets.map((s, i): [string, string] => [`xl/worksheets/sheet${String(i + 1)}.xml`, sheetXml(s)]),
  ];
}

// --- the ZIP container (STORED entries) -------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A fixed DOS timestamp (1980-01-01 00:00): the file's bytes depend on its content alone. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** One sheet or several (M2: one per product category). A workbook needs at least one sheet; an empty list
 *  gets one empty sheet named "ว่าง" rather than a file Excel refuses to open. */
export function buildXlsx(sheetOrSheets: Sheet | readonly Sheet[]): Uint8Array {
  const out: number[] = [];
  const central: number[] = [];
  const u16 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff);
  const u32 = (a: number[], v: number) => a.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  const list: readonly Sheet[] = Array.isArray(sheetOrSheets) ? sheetOrSheets : [sheetOrSheets as Sheet];
  const entries = parts(list.length > 0 ? list : [{ name: "ว่าง", columns: [], rows: [] }]);
  for (const [name, text] of entries) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(text);
    const crc = crc32(data);
    const offset = out.length;
    u32(out, 0x04034b50); u16(out, 20); u16(out, 0x0800); u16(out, 0); u16(out, DOS_TIME); u16(out, DOS_DATE);
    u32(out, crc); u32(out, data.length); u32(out, data.length); u16(out, nameBytes.length); u16(out, 0);
    out.push(...nameBytes);
    for (const b of data) out.push(b);
    u32(central, 0x02014b50); u16(central, 20); u16(central, 20); u16(central, 0x0800); u16(central, 0); u16(central, DOS_TIME); u16(central, DOS_DATE);
    u32(central, crc); u32(central, data.length); u32(central, data.length); u16(central, nameBytes.length); u16(central, 0); u16(central, 0);
    u16(central, 0); u16(central, 0); u32(central, 0); u32(central, offset);
    central.push(...nameBytes);
  }
  const cdOffset = out.length;
  out.push(...central);
  u32(out, 0x06054b50); u16(out, 0); u16(out, 0); u16(out, entries.length); u16(out, entries.length);
  u32(out, central.length); u32(out, cdOffset); u16(out, 0);
  return Uint8Array.from(out);
}
