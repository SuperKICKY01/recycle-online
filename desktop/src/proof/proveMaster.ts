/**
 * MASTER DATA'S PURE PARTS (B5).
 *
 *   npm run prove:master
 *
 *   R1 readers: a price that arrives as a NUMBER is refused (hard rule 1); a seller's personal keys
 *      are absent (undefined) when the server omitted them, and present when it sent them
 *   S1 sellerPatch: only changed fields; an emptied optional field is an explicit null; and for a
 *      caller WITHOUT sellers.read_personal the body never carries id_number or address, whatever
 *      the form holds
 *   S2 sellerCreate: a blank code is left to the server; personal fields only with the permission
 *   P1 priceProblem: text with at most two decimals, never negative, never exponent notation
 *   M1 search: contains, case-insensitive; a phone typed without dashes finds one stored with them
 *   T1 moveTier: one place up or down, unchanged at an edge
 */
import { matches, priceProblem, readOneCodeName, readProduct, readSeller, readUnitMismatches, sellerCreate, sellerPatch, UOM_KIND_TEXT,
  type Seller } from "../shared/master";
import { moveTier } from "../shared/master";
import { check, finish, header } from "./harness";

void finish("PROVE_MASTER", async () => {
  header("R readers");
  const base = { id: "p", code: "FE", name: "เหล็ก", is_active: true, category_id: "c", uom_id: "u", uom_code: "KG", uom_name: "กิโลกรัม" };
  check("R1 a price as a string reads; a price as a NUMBER is refused",
    readProduct({ ...base, prices: { A: "15.50" } })?.prices["A"] === "15.50" && readProduct({ ...base, prices: { A: 15.5 } }) === null);
  const plain = readSeller({ id: "s", code: "S1", name: "สมชาย", is_active: true, phone: null, grade: null, vehicle_no: null, id_last4: "1234" });
  const full = readSeller({ id: "s", code: "S1", name: "สมชาย", is_active: true, phone: null, grade: null, vehicle_no: null, id_number: "3100700000019", address: "บ้าน", id_last4: "0019" });
  check("R1 personal keys absent stay absent (undefined, not empty); present when the server sent them",
    plain !== null && plain.id_number === undefined && plain.address === undefined && full?.id_number === "3100700000019",
    JSON.stringify({ plain, full: full?.id_number }));

  // Ruling R2 (server migration 0028): a unit's kind, a product's unit kind, the owner's mismatch list.
  const unit = readOneCodeName({ id: "u", code: "PC", name: "ชิ้น", is_active: true, kind: "count" });
  const undeclared = readOneCodeName({ id: "u2", code: "X", name: "x", is_active: true, kind: null });
  const category = readOneCodeName({ id: "c", code: "FE", name: "เหล็ก", is_active: true });
  check("R2 a unit's kind reads (count / null = undeclared); a category carries no kind key at all",
    unit?.kind === "count" && undeclared !== null && undeclared.kind === null && category !== null && !("kind" in category),
    JSON.stringify({ unit, undeclared, category }));
  check("R2 a product reads its unit's kind; an unknown kind reads as undeclared, never as weight",
    readProduct({ ...base, prices: {}, uom_kind: "weight" })?.uom_kind === "weight"
      && readProduct({ ...base, prices: {}, uom_kind: "litre" })?.uom_kind === null);
  const mm = readUnitMismatches({ products: [{ id: "p", code: "PC1", name: "ซิงก์", is_active: true, pricing_basis: "piece",
    uom_id: "u", uom_code: "KG", uom_name: "Kilogram", uom_kind: "weight" }] });
  check("R2 the mismatch list reads; a row with no basis is refused whole",
    mm?.[0]?.code === "PC1" && mm[0].pricing_basis === "piece" && mm[0].uom_kind === "weight"
      && readUnitMismatches({ products: [{ id: "p", code: "PC1", name: "x", is_active: true, uom_code: "KG", uom_name: "K" }] }) === null);
  check("R2 the kind words (literal Thai)", UOM_KIND_TEXT.count === "หน่วยนับ (เช่น ชิ้น ลัง เหมา)"
    && UOM_KIND_TEXT.undeclared === "ยังไม่ได้ระบุ");

  header("S the seller bodies");
  const before: Seller = { id: "s", code: "S1", name: "สมชาย", is_active: true, phone: "081-234-5678", grade: "A", vehicle_no: "1กข 1234",
    id_last4: "0019" };
  const form = { name: "สมชาย ", phone: "", grade: "A", vehicle_no: "1กข 1234", id_number: "", address: "" };
  const noPerm = sellerPatch(before, form, false);
  check("S1 without the permission: only the phone (cleared to null); no id_number or address key at all",
    JSON.stringify(noPerm) === JSON.stringify({ phone: null }), JSON.stringify(noPerm));
  const withPerm = sellerPatch({ ...before, id_number: "3100700000019", address: "บ้าน" }, { ...form, id_number: "3100700000019", address: "บ้านใหม่" }, true);
  check("S1 with the permission: the changed address is sent, the unchanged ID is not",
    JSON.stringify(withPerm) === JSON.stringify({ phone: null, address: "บ้านใหม่" }), JSON.stringify(withPerm));
  check("S1 nothing changed -> an empty body", JSON.stringify(sellerPatch(before, { name: "สมชาย", phone: "081-234-5678", grade: "A", vehicle_no: "1กข 1234", id_number: "x", address: "y" }, false)) === "{}");
  const c1 = sellerCreate(" ", { name: "สมหญิง", phone: "", grade: "", vehicle_no: "", id_number: "123", address: "ที่อยู่" }, false);
  const c2 = sellerCreate("S9", { name: "สมหญิง", phone: "", grade: "", vehicle_no: "", id_number: "123", address: "ที่อยู่" }, true);
  check("S2 a blank code is the server's to assign; personal fields only with the permission",
    JSON.stringify(c1) === JSON.stringify({ name: "สมหญิง" }) && JSON.stringify(c2) === JSON.stringify({ name: "สมหญิง", code: "S9", id_number: "123", address: "ที่อยู่" }),
    JSON.stringify({ c1, c2 }));

  header("P prices as text");
  const good = ["0", "15", "15.5", "15.50", "1234567.89"];
  const bad = ["", "-1", "1.234", "abc", "1e3", "15,50", " ", "1,000"];
  check("P1 digits with at most two decimals pass; negatives, three decimals, exponents and commas do not",
    good.every((g) => priceProblem(g) === null) && bad.every((b) => priceProblem(b) !== null),
    JSON.stringify({ good: good.map(priceProblem), bad: bad.map(priceProblem) }));

  header("M search");
  check("M1 contains, any case; '0812345678' finds '081-234-5678'; a name query does not match digits by accident",
    matches("som", ["Somchai"]) && matches("0812345678", ["081-234-5678"]) && matches("ใจดี", ["สมชาย ใจดี"])
      && !matches("สมหญิง", ["สมชาย ใจดี", "081-234-5678"]) && matches("", ["x"]));

  header("T tier order");
  check("T1 move up, move down, unchanged at either edge",
    JSON.stringify(moveTier(["a", "b", "c"], "b", -1)) === JSON.stringify(["b", "a", "c"])
      && JSON.stringify(moveTier(["a", "b", "c"], "b", 1)) === JSON.stringify(["a", "c", "b"])
      && JSON.stringify(moveTier(["a", "b", "c"], "a", -1)) === JSON.stringify(["a", "b", "c"])
      && JSON.stringify(moveTier(["a", "b", "c"], "c", 1)) === JSON.stringify(["a", "b", "c"]));
});
