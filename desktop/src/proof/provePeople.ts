/**
 * SHOP AND PEOPLE'S PURE PARTS (B6).
 *
 *   npm run prove:people
 *
 *   L1 every one of the server's 16 permission codes (restated here by hand from app/permissions.py)
 *      has a Thai label, and the tick grid's groups place each exactly once; an unknown code is
 *      still shown, under "อื่น ๆ"
 *   T1 a tick may change only for a roles.manage holder, never on the owner's role, never roles.manage
 *   R1 the drawer reader refuses money that is not a string; a shift without a drawer reads drawer null
 *   U1 a new account: username shape, a name, an 8-character password, a role
 *   M1 a drawer amount: text, two decimals at most, never negative
 *   S1 PATCH /shop: only what changed; an emptied field is an explicit null
 *   Z1 a variance is "nothing to explain" only when the server's string is exactly zero
 */
import {
  groupCatalogue,
  isZeroMoney,
  moneyProblem,
  newUserProblems,
  PERMISSION_TEXT,
  readShift,
  shopPatch,
  tickEditable,
} from "../shared/people";
import { check, finish, header } from "./harness";

const SERVER_CODES = [
  "bills.create", "bills.read", "bills.void", "money.view_own", "money.view_shop", "master.write", "prices.write",
  "sellers.create", "sellers.write", "tiers.manage", "users.manage", "shop.settings.write", "roles.manage",
  "payments.record", "shifts.manage", "sellers.read_personal",
];

void finish("PROVE_PEOPLE", async () => {
  header("L labels");
  const unlabelled = SERVER_CODES.filter((c) => (PERMISSION_TEXT[c] ?? "") === "");
  const placed = groupCatalogue(SERVER_CODES).flatMap((g) => g.codes);
  check("L1 all 16 codes labelled; the groups place each exactly once",
    SERVER_CODES.length === 16 && unlabelled.length === 0 && placed.length === 16 && new Set(placed).size === 16,
    JSON.stringify({ unlabelled, placed: placed.length }));
  const withUnknown = groupCatalogue([...SERVER_CODES, "reports.export"]);
  check("L1 a code the client does not know is still shown, under อื่น ๆ",
    withUnknown.some((g) => g.title === "อื่น ๆ" && g.codes.includes("reports.export")));

  header("T ticks");
  check("T1 editable only for roles.manage, never the owner's role, never roles.manage or users.manage",
    tickEditable({ code: "staff" }, "bills.void", true) && !tickEditable({ code: "staff" }, "bills.void", false)
      && !tickEditable({ code: "owner" }, "bills.void", true) && !tickEditable({ code: "admin" }, "roles.manage", true)
      && !tickEditable({ code: "staff" }, "users.manage", true) && !tickEditable({ code: "admin" }, "users.manage", true));

  header("R the drawer reader");
  const shift = { id: "s", status: "open", opened_at: "2026-10-13T01:00:00Z", opening_float: "1500.00", counted_cash: null,
    expected_cash: null, variance: null, variance_reason: null };
  const fig = { opening_float: "1500.00", cash_in: "0.00", cash_out: "0.00", cash_payments: "0.00", expected_cash: "1500.00" };
  check("R1 strings read; a NUMBER in the drawer is refused; no drawer -> null",
    readShift({ ...shift, drawer: fig })?.drawer?.expected_cash === "1500.00"
      && readShift({ ...shift, drawer: { ...fig, expected_cash: 1500 } }) === null && readShift(shift)?.drawer === null);

  header("U accounts");
  const ok = newUserProblems({ username: "somchai.k", full_name: "สมชาย", password: "12345678", role: "staff" });
  const bad = newUserProblems({ username: "สมชาย", full_name: " ", password: "1234567", role: "" });
  check("U1 a good account has no problem; each bad field is named",
    Object.values(ok).every((x) => x === null) && Object.values(bad).every((x) => x !== null), JSON.stringify(bad));

  header("M amounts");
  check("M1 1500, 1500.5, 0.00 pass; -1, 1.234, 1e3, 1,500 do not",
    ["1500", "1500.5", "0.00"].every((x) => moneyProblem(x) === null) && ["-1", "1.234", "1e3", "1,500", ""].every((x) => moneyProblem(x) !== null));

  header("S the shop body");
  const before = { name: "ร้าน", address: "เดิม", phone: "081", default_grade: "A", branch_id: "b" };
  check("S1 only changes; emptied -> null; nothing changed -> {}",
    JSON.stringify(shopPatch(before, { address: "ใหม่", phone: "", default_grade: "A" })) === JSON.stringify({ address: "ใหม่", phone: null })
      && JSON.stringify(shopPatch(before, { address: "เดิม", phone: "081", default_grade: "A" })) === "{}");

  header("Z variance");
  check("Z1 0.00 and -0.00 are zero; -49.50 and 0.01 are not",
    isZeroMoney("0.00") && isZeroMoney("-0.00") && !isZeroMoney("-49.50") && !isZeroMoney("0.01") && !isZeroMoney(null));
});
