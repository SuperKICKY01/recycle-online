/**
 * M1 (ADVISOR-DECIDED 2026-10-24): THE SHOP'S MONEY RULES IN THE CART, headless.
 *
 *   npm run prove:moneyrules
 *
 * src/money/lineRules.ts is held to the server by the golden vectors (prove:linerules). This proves
 * the CART around it: what the operator types becomes the line the server stores, the line declares
 * its rules on the wire, a draft keeps them across a restart, the device caches the shop's rules
 * per shop, and the settings screen gives money rules to the owner alone.
 *
 *   B1  a kg deduction: 100.000 - 5.000 - 2.500 at 10.00 -> net 92.500, amount 925.00, rules recorded.
 *   B2  a percent deduction: 3% of 95.000 -> 2.850, net 92.150, 921.50.
 *   B3  BOTH offered: the operator's choice (percent) is used; a choice the product does not offer
 *       falls back to the first offered.
 *   B4  REASON REQUIRED: a deducting line without a reason is refused on the reason field; with one it
 *       builds; with nothing deducted no reason is needed.
 *   B5  a product that offers no deduction ignores typed deduction text (nothing deducted).
 *   B6  piece: 3 pieces at 45.50 -> 136.50, weights 0.000; "0" and "" refused on the pieces field.
 *   B7  lump under half-up baht -> 1235.00.
 *   B8  THE CART PATH AGAINST THE GOLDEN FILE: every passing weight-priced vector, typed into
 *       buildLine as the operator would, gives the vector's net and amount.
 *   B9  a caller with no rules (every pre-0027 path) gets the pre-0027 line: no `rules` key.
 *   B10 zero guards: a deduction taking the whole net is zero_net on the deduction field.
 *   T1  toBillItems: each mode sends exactly the keys it needs (and a legacy line none of them).
 *   D1  a draft with rule-bearing and legacy lines saved and reloaded (node:sqlite): value-equal.
 *   P1  the policy cache: absent -> the pre-0027 rule; saved -> read back; another shop's row ->
 *       the default; and a save() for ANOTHER shop clears the previous shop's money rules.
 *   P2  moneyRulesFromPolicy refuses a body it cannot read (older server, unknown value) with null.
 *   S1  the settings form: owner -> money editable; admin -> money AND default grade read-only;
 *       unknown role -> editable (fails open onto the server's 403); an older server -> no group.
 *   S2  a money change makes a patch that patchChangesMoney sees; the 403 money_rule_owner_only is
 *       worded as owner-only, not as a missing admin role.
 *   C1  deductionLines: one sentence per deducting line, none for the rest.
 *   H1  a seller's history names each line in its own unit (pieces, ราคาเหมา), and a line from a
 *       server before 0027 reads as it always did.
 *
 * DISPROVED 2026-10-24 (by hand, files restored byte-identical): the reason-required check in
 * cart.buildLine removed -> B4 red; the cross-shop clear in SqliteShopPolicyStore.save removed ->
 * P1 red (the previous shop's down_1 survived under the new shop's id).
 *
 * Literal Thai where a sentence is asserted (STRUCTURE invariant 12). main() prints
 * `MONEYRULES_EXIT=<n>`; its ABSENCE is the signal.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NodeSqliteDriver } from "../adapters/sqlite/nodeDriver.js";
import { SqliteDraftStore } from "../adapters/sqlite/SqliteDraftStore.js";
import { SqliteShopPolicyStore } from "../adapters/sqlite/SqliteShopPolicyStore.js";
import { buildLine, deductionLines, toBillItems } from "../cart/cart.js";
import type { LineInput, LineResult } from "../cart/cart.js";
import { DEFAULT_MONEY_RULES, moneyRulesFromPolicy } from "../cart/moneyRules.js";
import type { Draft, DraftLine } from "../cart/types.js";
import { emptyForm } from "../cart/types.js";
import {
  formScreen,
  patchChangesMoney,
  shopPatchBody,
  shopSaveResult,
} from "../settings/shopSettings.js";
import type { ShopSettings } from "../settings/shopSettings.js";
import { sellerHistoryScreen } from "../sellerHistory/sellerHistoryView.js";
import { PROOF_OWNER } from "./fakes.js";
import { signInProofDevice } from "./proofDevice.js";

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (ok) passes += 1;
  else failures += 1;
}
function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const BASE: LineInput = {
  id: "l1", product_id: "p1", product_code: "FE01", product_name: "เหล็กหนา", uom_code: "KG",
  gross: "100.000", tare: "5.000", price: "10.00", list_price: "10.00", basis: "weight", rule: "half_up_0.01",
};
/** BASE with no rule keys at all: what every pre-0027 caller passes. */
const { basis: _b, rule: _r, ...LEGACY } = BASE;
const lineOf = (r: LineResult): DraftLine | null => (r.ok ? { ...r.line, seq: 1 } : null);
/** Value equality that ignores key ORDER (a reloaded row lists its columns in table order). */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x: unknown) =>
  x !== null && typeof x === "object" && !Array.isArray(x)
    ? Object.fromEntries(Object.entries(x as Record<string, unknown>).sort(([p], [q]) => p.localeCompare(q)))
    : x);
const errOf = (r: LineResult): string => (r.ok ? "ok" : `${r.field}:${r.error}`);

function cart(): void {
  header("B -- buildLine under the shop's rules");
  const kg = buildLine({ ...BASE, offered: ["kg"], deduction: "2.500", reason: "ดินติด" });
  check("B1 kg deduction: net 92.500, amount 925.00, rules recorded",
    kg.ok && kg.line.net_weight === "92.500" && kg.line.amount === "925.00"
      && kg.line.rules?.deduction_mode === "kg" && kg.line.rules.deduction_weight === "2.500"
      && kg.line.rules.deduction_reason === "ดินติด" && kg.line.rules.quantity === "92.500",
    JSON.stringify(kg.ok ? kg.line.rules : errOf(kg)));

  const pct = buildLine({ ...BASE, offered: ["percent"], deduction: "3" });
  check("B2 percent deduction: 2.850 off, net 92.150, amount 921.50",
    pct.ok && pct.line.net_weight === "92.150" && pct.line.amount === "921.50"
      && pct.line.rules?.deduction_pct === "3.00" && pct.line.rules.deduction_weight === "2.850",
    JSON.stringify(pct.ok ? pct.line.rules : errOf(pct)));

  const both = buildLine({ ...BASE, offered: ["kg", "percent"], deductionMode: "percent", deduction: "3" });
  const fallback = buildLine({ ...BASE, offered: ["kg"], deductionMode: "percent", deduction: "2.5" });
  check("B3 both offered: the chosen percent is used; an unoffered choice falls back to the first offered",
    both.ok && both.line.rules?.deduction_mode === "percent" && fallback.ok
      && fallback.line.rules?.deduction_mode === "kg" && fallback.line.rules.deduction_weight === "2.500");

  const noReason = buildLine({ ...BASE, offered: ["kg"], deduction: "2.5", reasonRequired: true });
  const withReason = buildLine({ ...BASE, offered: ["kg"], deduction: "2.5", reason: "เปียก", reasonRequired: true });
  const nothing = buildLine({ ...BASE, offered: ["kg"], deduction: "", reasonRequired: true });
  check("B4 reason required: refused on the reason field without one; built with one; not needed when nothing is deducted",
    errOf(noReason) === "reason:reason_required" && withReason.ok && nothing.ok
      && nothing.line.rules?.deduction_mode === "none", `${errOf(noReason)} ${errOf(withReason)} ${errOf(nothing)}`);

  const ignored = buildLine({ ...BASE, offered: [], deduction: "2.5" });
  check("B5 a product offering no deduction ignores the typed text", ignored.ok
    && ignored.line.net_weight === "95.000" && ignored.line.rules?.deduction_mode === "none");

  const piece = buildLine({ ...BASE, basis: "piece", gross: "", tare: "", price: "45.50", pieces: "3" });
  const zeroP = buildLine({ ...BASE, basis: "piece", price: "45.50", pieces: "0" });
  const emptyP = buildLine({ ...BASE, basis: "piece", price: "45.50", pieces: "" });
  check("B6 piece: 3 x 45.50 = 136.50 with weights 0.000; 0 and empty refused on pieces",
    piece.ok && piece.line.amount === "136.50" && piece.line.gross_weight === "0.000"
      && piece.line.rules?.quantity === "3.000" && errOf(zeroP) === "pieces:piece_quantity_invalid"
      && errOf(emptyP) === "pieces:empty", `${errOf(zeroP)} ${errOf(emptyP)}`);

  const lump = buildLine({ ...BASE, basis: "lump", rule: "half_up_1", price: "1234.56" });
  check("B7 lump under half-up baht: 1235.00", lump.ok && lump.line.amount === "1235.00"
    && lump.line.rules?.quantity === "1.000");

  // B8: the CART path, not lineRules alone, over the golden file.
  const data = JSON.parse(readFileSync(join(process.cwd(), "..", "golden", "line_rules_vectors.json"), "utf8")) as {
    vectors: { id: string; in: Record<string, string>; out?: Record<string, string> }[];
  };
  let typed = 0;
  let agree = 0;
  const bad: string[] = [];
  for (const v of data.vectors) {
    const i = v.in;
    if (v.out === undefined || i["basis"] !== "weight") continue;
    if (v.out["net_weight"] === "0.000") continue; // the cart refuses a zero line by design (B10)
    typed += 1;
    const mode = i["mode"];
    const r = buildLine({
      ...BASE, gross: i["gross"] ?? "", tare: i["tare"] ?? "", price: i["unit_price"] ?? "",
      rule: i["rule"] as NonNullable<LineInput["rule"]>,
      offered: mode === "none" ? [] : [mode as "kg" | "percent"],
      deduction: mode === "kg" ? (i["deduction_weight"] ?? "") : mode === "percent" ? (i["deduction_pct"] ?? "") : "",
    });
    if (r.ok && r.line.net_weight === v.out["net_weight"] && r.line.amount === v.out["amount"]) agree += 1;
    else bad.push(`${v.id}: ${r.ok ? `${r.line.net_weight}/${r.line.amount}` : errOf(r)}`);
  }
  check(`B8 the cart, typed as the operator types, gives the golden figure for every weight vector (${String(agree)}/${String(typed)})`,
    typed > 0 && agree === typed, bad.join("; "));

  const legacy = buildLine({ ...LEGACY });
  check("B9 a caller with no rules gets the pre-0027 line (no `rules` key, 950.00)",
    legacy.ok && !("rules" in legacy.line) && legacy.line.amount === "950.00");

  const whole = buildLine({ ...BASE, offered: ["percent"], deduction: "100" });
  check("B10 a deduction that takes the whole net is zero_net on the deduction field", errOf(whole) === "deduction:zero_net",
    errOf(whole));
}

function wire(): void {
  header("T -- the rules each line declares on the wire");
  const lines = [
    buildLine({ ...BASE, id: "a", offered: ["kg"], deduction: "2.5", reason: "ดินติด" }),
    buildLine({ ...BASE, id: "b", offered: ["percent"], deduction: "3" }),
    buildLine({ ...BASE, id: "c", basis: "piece", price: "45.50", pieces: "3" }),
    buildLine({ ...LEGACY, id: "d" }),
  ].map(lineOf);
  const draft: Draft = { id: "dr", seller_id: "s", vehicle_no: null, next_seq: 5, form: emptyForm(), updated_at: "x",
    master_as_of: null, lines: lines.map((l, i) => ({ ...(l as DraftLine), seq: i + 1 })) };
  const [a, b, c, d] = toBillItems(draft);
  const keys = (o: object | undefined) => Object.keys(o ?? {}).sort().join(",");
  check("T1 kg: mode + weight + reason, no percent, no quantity",
    a?.deduction_mode === "kg" && a.deduction_weight === "2.500" && a.deduction_reason === "ดินติด"
      && a.deduction_pct === undefined && a.quantity === undefined, keys(a));
  check("T1 percent: mode + pct + derived weight", b?.deduction_mode === "percent" && b.deduction_pct === "3.00"
    && b.deduction_weight === "2.850", keys(b));
  check("T1 piece: basis + quantity, no deduction weight", c?.pricing_basis === "piece" && c.quantity === "3.000"
    && c.deduction_weight === undefined, keys(c));
  check("T1 a legacy line sends none of the rule keys", d !== undefined && d.pricing_basis === undefined
    && d.rounding_rule === undefined && d.deduction_mode === undefined, keys(d));

  header("C -- what the seller is shown before confirm");
  check("C1 one sentence per deducting line, none for the others", JSON.stringify(deductionLines(draft)) === JSON.stringify([
    "เหล็กหนา: หักสิ่งเจือปน 2.500 KG · ดินติด", "เหล็กหนา: หักสิ่งเจือปน 2.850 KG (3.00%)"]),
    JSON.stringify(deductionLines(draft)));
}

async function stores(dir: string): Promise<void> {
  header("D / P -- the draft and the policy cache on node:sqlite");
  const driver = NodeSqliteDriver.open(join(dir, "moneyrules.db"));
  const drafts = await SqliteDraftStore.open(driver);
  await signInProofDevice(driver);
  const built = [
    buildLine({ ...BASE, id: "x1", offered: ["kg", "percent"], deductionMode: "percent", deduction: "3", reason: "ชื้น" }),
    buildLine({ ...BASE, id: "x2", basis: "lump", rule: "down_0.25", price: "1234.56" }),
    buildLine({ ...LEGACY, id: "x3" }),
  ].map(lineOf);
  const draft: Draft = { id: "draft-mr", seller_id: "s", vehicle_no: null, next_seq: 4,
    form: { ...emptyForm(), deduction: "3", deduction_mode: "percent", reason: "ชื้น" }, updated_at: "2026-10-24T05:00:00.000Z",
    master_as_of: null, lines: built.map((l, i) => ({ ...(l as DraftLine), seq: i + 1 })) };
  await drafts.save(draft, PROOF_OWNER);
  const back = (await drafts.load()).draft;
  check("D1 rule-bearing and legacy lines and the form's entries reload value-equal",
    back !== null && canon(back.lines) === canon(draft.lines) && canon(back.form) === canon(draft.form) && !("rules" in (back.lines[2] ?? {})),
    back === null ? "no draft" : JSON.stringify(back.lines.map((l) => l.rules ?? null)));

  const store = new SqliteShopPolicyStore(driver);
  const A = PROOF_OWNER.tenant_id;
  const B = "22222222-2222-2222-2222-222222222222";
  check("P1 nothing cached -> the pre-0027 rule", JSON.stringify(await store.readMoneyRules(A)) === JSON.stringify(DEFAULT_MONEY_RULES));
  await store.save(A, false);
  const rules = { rounding_rule: "down_1", deduction_mode: "both", deduction_reason_required: true } as const;
  await store.saveMoneyRules(A, rules);
  check("P1 saved -> read back value-equal", JSON.stringify(await store.readMoneyRules(A)) === JSON.stringify(rules));
  check("P1 another shop reads the default, never this shop's rules",
    JSON.stringify(await store.readMoneyRules(B)) === JSON.stringify(DEFAULT_MONEY_RULES));
  await store.save(B, null);
  const raw = await driver.all<{ rounding_rule: string | null }>("SELECT rounding_rule FROM cached_shop_policy");
  check("P1 a save() for ANOTHER shop clears the previous shop's money rules off the one row",
    raw[0]?.rounding_rule === null && JSON.stringify(await store.readMoneyRules(B)) === JSON.stringify(DEFAULT_MONEY_RULES),
    JSON.stringify(raw));
  await driver.close();

  check("P2 an older server's body (no rule keys) reads as null", moneyRulesFromPolicy({}) === null);
  check("P2 an unknown rounding value reads as null", moneyRulesFromPolicy({ rounding_rule: "half_even_0.01",
    deduction_mode: "none", deduction_reason_required: false }) === null);
  check("P2 a full body reads as its rules", JSON.stringify(moneyRulesFromPolicy(rules)) === JSON.stringify(rules));
}

function settings(): void {
  header("S -- the settings screen: money rules are the owner's");
  const shop: ShopSettings = { id: "t", name: "ร้าน", default_grade: "A", address: null, phone: null,
    money: { rounding_rule: "half_up_0.01", deduction_mode: "none", deduction_reason_required: false } };
  const grants = new Set(["shop.settings.write"]);
  const tiers = [{ code: "A", name: "เกรด A" }, { code: "B", name: "เกรด B" }];
  const owner = formScreen(shop, grants, tiers, "owner");
  const admin = formScreen(shop, grants, tiers, "admin");
  const unknown = formScreen(shop, grants, tiers, null);
  const older = formScreen({ ...shop, money: null }, grants, tiers, "owner");
  check("S1 owner: money group editable, default grade editable", owner.money?.readOnly === false && !owner.gradeReadOnly);
  check("S1 admin: money group AND default grade read-only, address still editable",
    admin.money?.readOnly === true && admin.gradeReadOnly && !admin.readOnly);
  check("S1 unknown role fails open (the server's 403 decides)", unknown.money?.readOnly === false);
  check("S1 an older server sends no rules: no money group is drawn", older.money === null);
  check("S1 the owner note says whose and what it reaches",
    owner.money?.ownerNote === "แก้ได้โดยเจ้าของร้านเท่านั้น มีผลกับบิลใหม่ บิลเดิมไม่เปลี่ยน");

  const patch = shopPatchBody(shop, { default_grade: "A", address: "", phone: "",
    money: { rounding_rule: "down_1", deduction_mode: "kg", deduction_reason_required: false } });
  check("S2 a money change patches exactly the changed rules", JSON.stringify(patch)
    === JSON.stringify({ rounding_rule: "down_1", deduction_mode: "kg" }) && patchChangesMoney(patch), JSON.stringify(patch));
  const refused = shopSaveResult({ kind: "http", status: 403, code: "money_rule_owner_only" });
  check("S2 the owner-only 403 is worded as the owner's, and says nothing was saved",
    refused.kind === "message" && refused.screen.badge === "เจ้าของร้านเท่านั้น"
      && (refused.screen.lines[0] ?? "").endsWith("ยังไม่ได้บันทึกอะไร"),
    refused.kind === "message" ? refused.screen.lines.join(" ") : refused.kind);
}

function history(): void {
  header("H -- a seller's history names each line in its own unit");
  const line = (extra: Record<string, unknown>) => ({ product_id: "p", product_name: "สินค้า", net_weight: "12.500", ...extra });
  const screen = sellerHistoryScreen({ kind: "ok", body: { seller_id: "s", money_included: false, bills: [{
    bill_id: "b", doc_no: "B-2569-1", server_received_at: "2026-10-24T10:00:00+07:00", received_date: "2026-10-24",
    is_void: false, products: [
      line({ quantity: "12.500", pricing_basis: "weight", unit_name: "ลัง" }),
      line({ net_weight: "0.000", quantity: "3.000", pricing_basis: "piece", unit_name: "ชิ้น" }),
      line({ net_weight: "0.000", quantity: "1.000", pricing_basis: "lump", unit_name: "เหมา" }),
      line({}),
    ] }] } });
  const got = screen.kind === "history" ? (screen.bills[0]?.lines ?? []).map((l) => l.quantity) : [];
  check("H1 weight in its unit, pieces, lump, and a pre-0027 line as it always read",
    JSON.stringify(got) === JSON.stringify(["12.500 ลัง", "3 ชิ้น", "ราคาเหมา", "12.500 กก."]), JSON.stringify(got));
}

async function main(): Promise<number> {
  const dir = mkdtempSync(join(tmpdir(), "prove-moneyrules-"));
  try {
    cart();
    wire();
    await stores(dir);
    settings();
    history();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n  passes=${String(passes)}  failures=${String(failures)}`);
  return failures === 0 ? 0 : 1;
}

void main().then((rc) => {
  console.log(`MONEYRULES_EXIT=${String(rc)}`);
  process.exitCode = rc;
});
