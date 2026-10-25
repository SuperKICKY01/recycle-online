"""Read an .xlsx with Python's OWN zip and XML readers and print what it holds, as JSON.

    python read_xlsx.py <file.xlsx>

The desktop's proofs use this as an INDEPENDENT reader of the workbook src/shared/xlsx.ts writes:
nothing here shares code with the writer (standard library only: zipfile, xml.etree). Printed:
  zip_ok       zipfile.testzip() found no bad CRC
  parts        the part names
  content_ok   every part the workbook needs is declared in [Content_Types].xml
  sheet_name   the workbook's sheet name
  numfmts      numFmtId -> formatCode
  xf_numfmt    cellXfs index -> numFmtId
  cells        ref -> {"type": "n"|"inlineStr", "text": the cell's text exactly as stored, "style": index}
  sheets       M2: EVERY sheet, in workbook order, as {"name", "part", "declared", "cells"} -- the part the
               workbook's relationship names, whether [Content_Types].xml declares it, and its cells as above.
               sheet_name / cells stay the FIRST sheet's, so every earlier reader is unchanged.
"""
import json
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
      "ct": "http://schemas.openxmlformats.org/package/2006/content-types"}


def read_cells(sh) -> dict:
    cells = {}
    for c in sh.iter(f"{{{NS['m']}}}c"):
        t = c.get("t", "n")
        if t == "inlineStr":
            node = c.find("m:is/m:t", NS)
            text = node.text if node is not None else ""
        else:
            node = c.find("m:v", NS)
            text = node.text if node is not None else ""
        cells[c.get("r")] = {"type": t, "text": text, "style": c.get("s")}
    return cells


RELNS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKGREL = "http://schemas.openxmlformats.org/package/2006/relationships"


def main(path: str) -> int:
    with zipfile.ZipFile(path) as z:
        bad = z.testzip()
        parts = z.namelist()
        ct = ET.fromstring(z.read("[Content_Types].xml"))
        overrides = {o.get("PartName") for o in ct.findall("ct:Override", NS)}
        content_ok = {"/xl/workbook.xml", "/xl/worksheets/sheet1.xml", "/xl/styles.xml"} <= overrides
        wb = ET.fromstring(z.read("xl/workbook.xml"))
        sheet_name = wb.find("m:sheets/m:sheet", NS).get("name")
        st = ET.fromstring(z.read("xl/styles.xml"))
        numfmts = {f.get("numFmtId"): f.get("formatCode") for f in st.findall("m:numFmts/m:numFmt", NS)}
        xf = [x.get("numFmtId") for x in st.findall("m:cellXfs/m:xf", NS)]
        sh = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
        cells = {}
        for c in sh.iter(f"{{{NS['m']}}}c"):
            t = c.get("t", "n")
            if t == "inlineStr":
                node = c.find("m:is/m:t", NS)
                text = node.text if node is not None else ""
            else:
                node = c.find("m:v", NS)
                text = node.text if node is not None else ""
            cells[c.get("r")] = {"type": t, "text": text, "style": c.get("s")}
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        target = {r.get("Id"): r.get("Target") for r in rels.findall(f"{{{PKGREL}}}Relationship")}
        sheets = []
        for s in wb.findall("m:sheets/m:sheet", NS):
            part = "xl/" + target.get(s.get(f"{{{RELNS}}}id"), "")
            sheets.append({"name": s.get("name"), "part": part, "declared": "/" + part in overrides,
                           "cells": read_cells(ET.fromstring(z.read(part))) if part in parts else {}})
    out = {"zip_ok": bad is None, "parts": parts, "content_ok": content_ok, "sheet_name": sheet_name,
           "numfmts": numfmts, "xf_numfmt": xf, "cells": cells, "sheets": sheets}
    sys.stdout.buffer.write(json.dumps(out, ensure_ascii=False).encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
