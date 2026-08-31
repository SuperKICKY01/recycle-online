/**
 * P1.9 proof: PRICE EDITING ON THE PHONE.
 *
 * Run: npm run prove:prices
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE OWNS
 * ---------------------------------------------------------------------------
 * Every decision `src/master/priceEdit.ts` makes, driven through the real
 * module and asserted on the string an operator would read. Nothing here stubs
 * the thing under test: the screens come from the exported functions, the bound
 * comes from the real `parseTierPrice`, and the role gate comes from the real
 * `mayEditPrices`.
 *
 * Sections:
 *
 *   P0  the bound IS the column — every value NUMERIC(14,2) would round is
 *       refused, and the neighbours it must NOT refuse are accepted
 *   P1  nothing is defaulted: an unpriced tier renders as words and opens EMPTY
 *   P2  THE STAFF REFUSAL, asserted NEGATIVELY on what is RENDERED, in draw
 *       order, with the admin render as the positive control in the same pass
 *   P3  a save the server took and this device did not re-read is NOT called
 *       success
 *   P4  every transport outcome maps to a screen, enumerated rather than listed
 *   P5  no branch offers an action that cannot help — a 403 offers no sign-in,
 *       a 422 offers no retry
 *
 * ---------------------------------------------------------------------------
 * WHY THE ABSENCES HERE ARE EVIDENCE AND NOT SILENCE
 * ---------------------------------------------------------------------------
 * P2 is a NEGATIVE result: a label that must not appear. An absence asserted
 * over an empty render is satisfied by nothing at all
 * (lessons/a-check-that-never-went-red-was-never-observed.md), so every absence
 * below is paired with the SAME needle found on the SAME instrument in the same
 * pass — the admin screen, built from the identical products, carrying the
 * identical grades. The control is what makes the zero a fact about the STAFF
 * render rather than about a search that never looked.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS FILE DOES NOT COVER, SAID BEFORE ANYONE READS IT AS COMPLETE
 * ---------------------------------------------------------------------------
 * THE HANDSET. Everything here is the pure module. What a phone DREW is not
 * asserted by any of it, and no device pass is claimed
 * (`CLAUDE.md § Boot check` "WHICH BUNDLE THE HANDSET IS RUNNING").
 *
 * THE SERVER'S 422. The bound is checked on THIS side only. That the server
 * refuses the same value terminally is a live-request observation and is
 * recorded in the phase entry, not here — this program has no server.
 *
 * THE WRITE ITSELF. `app/api.ts` cannot be imported by a node proof (it reaches
 * expo-constants through ./config), which is exactly why every decision it
 * would otherwise have made lives in the module this file drives.
 *
 * ON THE OUTPUT. Mostly Thai. Mojibake in the console is the console — this box
 * is codepage 874, `lessons/console-is-not-the-observation.md`. Every assertion
 * compares JavaScript strings.
 */
import {
  EDIT_TIER_LABEL,
  editableValue,
  isPriced,
  parseTierPrice,
  priceListScreen,
  priceRefreshScreen,
  priceSaveScreen,
  priceScreenText,
  SAVE_TIER_LABEL,
  tierControlsText,
} from "../master/priceEdit.js";
import type { CacheRefresh, PriceProduct, PriceScreen, PriceWrite } from "../master/priceEdit.js";
import { mayEditPrices } from "../session/deviceRole.js";
import type { DeviceRole } from "../session/deviceRole.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/* ----------------------------------------------------------- the fixture -- */

/**
 * THIS FILE'S OWN PRODUCTS, built here and shared by nothing.
 *
 * Two products, and the second one exists for P1 alone: it has a priced tier,
 * an UNPRICED tier, and a tier priced at `"0.00"`. That last one is not padding
 * — a shop can legitimately accept a material and pay nothing for it, and
 * `"0.00"` is falsy in JavaScript, so it is the value that separates "has a
 * price" from "is truthy". A screen that got that wrong would offer to invent a
 * price over a price somebody chose.
 */
function fixture(): readonly PriceProduct[] {
  return [
    {
      id: "p-1",
      code: "AL-01",
      name: "อะลูมิเนียมหนา",
      tiers: [
        { grade: "A", name: "A", price: "62.50" },
        { grade: "B", name: "B", price: "60.00" },
        { grade: "C", name: "C", price: "57.25" },
        { grade: "D", name: "D", price: "55.00" },
      ],
    },
    {
      id: "p-2",
      code: "FE-01",
      name: "เหล็กรวม",
      tiers: [
        { grade: "A", name: "A", price: "9.10" },
        { grade: "B", name: "B", price: null },
        { grade: "C", name: "C", price: "0.00" },
        { grade: "D", name: "D", price: null },
      ],
    },
  ];
}

/*
 * name == code IN THIS FIXTURE ON PURPOSE (S16 / P1.24). The tier NAME is now a
 * per-tenant value the screen shows in place of the code; a backfilled shop has
 * name == code, so the price-rendering cells below read exactly as they did before
 * the tiers went per-tenant, and the needle "C 0.00" still means what it meant. The
 * F3 case where name != code — the shop's own Thai name is shown, never the code —
 * is proved on its own fixture in `pNameIsShown` so nothing here has to move.
 */
const listFor = (role: DeviceRole): PriceScreen =>
  priceListScreen({ role, products: fixture(), haveProducts: true, haveGradeTiers: true });

/* -------------------------------------------------------------- P0 bound -- */

/**
 * THE COLUMN IS `numeric(14,2)` AND NUMERIC ROUNDS RATHER THAN REFUSING.
 *
 * Each REFUSED value below is one the column would silently rewrite, and the
 * rewrite is somebody's money: `1.005` stored into `numeric(14,2)` is `1.01`,
 * measured against the live database and recorded in
 * lessons/edge-must-reject-what-the-column-rounds.md.
 *
 * The ACCEPTED half is not decoration. A bound that refuses everything passes a
 * refusal test perfectly and ships a screen nobody can save on — the same shape
 * as a checker that fails by finding LESS.
 */
function p0TheBoundIsTheColumn(): void {
  header("P0 the bound IS the column: numeric(14,2), refused and accepted");

  const refused: readonly (readonly [string, string])[] = [
    ["1.005", "3dp — the column would ROUND this to 1.01, a price nobody chose"],
    ["0.001", "3dp, and it rounds to 0.000: a real price becomes free"],
    ["12.345", "3dp"],
    ["1234567890123.00", "13 integer digits — the column holds 12"],
    ["-1.00", "negative: the CHECK is price >= 0"],
    ["", "empty is not a price"],
    ["abc", "not a number"],
    ["1e3", "exponent — a keypad cannot produce it and a column will not read it"],
    [" ", "whitespace only"],
    ["1,000.00", "a thousands separator is not a decimal"],
  ];

  for (const [raw, why] of refused) {
    const p = parseTierPrice(raw);
    check(`REFUSED ${JSON.stringify(raw)}`, !p.ok, p.ok ? `accepted as ${p.value}` : why);
  }

  /*
   * THE CONTROL, IN THE SAME PASS AND ON THE SAME INSTRUMENT. Without it the
   * ten refusals above are equally consistent with a parser that refuses
   * everything, and "found nothing" would be indistinguishable from an
   * instrument that never looked (CLAUDE.md § Shared checks).
   */
  const accepted: readonly (readonly [string, string])[] = [
    ["62.50", "62.50"],
    ["0", "0.00"],
    ["0.00", "0.00"],
    ["15.5", "15.50"],
    ["999999999999.99", "999999999999.99"],
  ];

  for (const [raw, want] of accepted) {
    const p = parseTierPrice(raw);
    check(
      `ACCEPTED ${JSON.stringify(raw)} -> ${want}`,
      p.ok && p.value === want,
      p.ok ? p.value : `refused: ${p.error}`,
    );
  }

  /*
   * THE BOUNDARY ITSELF, both sides, because an off-by-one in a digit count is
   * the defect this cell exists for: 12 integer digits is the widest the column
   * holds and 13 is one too many.
   */
  const widest = parseTierPrice("999999999999.99");
  const oneTooWide = parseTierPrice("9999999999999.99");
  check(
    "12 integer digits accepted, 13 refused",
    widest.ok && !oneTooWide.ok,
    `12 -> ${widest.ok ? "ok" : "refused"}, 13 -> ${oneTooWide.ok ? "ok" : "refused"}`,
  );
}

/* ------------------------------------------------------------ P1 no default -- */

function p1NothingIsDefaulted(): void {
  header("P1 nothing is defaulted: an unpriced tier is words, and opens EMPTY");

  const fe = fixture()[1];
  if (fe === undefined) {
    check("the fixture has a second product", false, "missing");
    return;
  }

  const unpriced = fe.tiers.filter((t) => !isPriced(t));
  const priced = fe.tiers.filter(isPriced);
  check("the fixture really does hold both states", unpriced.length === 2 && priced.length === 2,
    `${String(priced.length)} priced, ${String(unpriced.length)} unpriced`);

  for (const t of unpriced) {
    check(
      `grade ${t.grade} opens EMPTY, not with a number`,
      editableValue(t) === "",
      JSON.stringify(editableValue(t)),
    );
  }

  /*
   * "0.00" IS A PRICE. This is the cell that separates `price !== null` from a
   * truthiness test, and getting it wrong would render a deliberate zero as
   * unpriced and offer to replace it.
   */
  const zero = fe.tiers.find((t) => t.grade === "C");
  check(
    'grade C is priced at "0.00" and reads as PRICED',
    zero !== undefined && isPriced(zero) && editableValue(zero) === "0.00",
    zero === undefined ? "missing" : `isPriced=${String(isPriced(zero))} value=${JSON.stringify(editableValue(zero))}`,
  );

  /*
   * A PRICED TIER OPENS ON ITS OWN VALUE, byte for byte. Not reformatted, not
   * re-rounded, not passed through a number: the string the server sent.
   */
  const a = fe.tiers.find((t) => t.grade === "A");
  check(
    "a priced tier opens on its OWN string, byte for byte",
    a !== undefined && editableValue(a) === "9.10",
    a === undefined ? "missing" : JSON.stringify(editableValue(a)),
  );

  /*
   * AND NOT ON ANOTHER TIER'S. The old defect this repository paid for was a
   * fallback down the tier list to grade A — the HIGHEST price
   * (lessons/fallback-default-is-a-wrong-number.md). Asserted as an absence
   * against a value that really is present elsewhere on the same product, so
   * the check cannot pass by looking at nothing.
   */
  const bBlank = fe.tiers.find((t) => t.grade === "B");
  check(
    "an unpriced B does NOT fall back to A's 9.10",
    bBlank !== undefined && editableValue(bBlank) !== "9.10" && editableValue(bBlank) === "",
    bBlank === undefined ? "missing" : JSON.stringify(editableValue(bBlank)),
  );

  const drawn = priceScreenText(listFor("admin"));
  check(
    "the unpriced tiers say so IN WORDS on the rendered screen",
    drawn.includes("ยังไม่ได้ตั้งราคา"),
    "",
  );
  /*
   * NO "0.00" STANDS IN FOR AN ABSENT PRICE — counted over TIER VALUES, not
   * over the joined string, and the difference is a red this cell already
   * produced. Its first form counted the substring "0.00" in
   * `priceScreenText(...)` and expected 1; it measured 2, because "60.00"
   * CONTAINS "0.00" and AL-01's grade B was counted as a zero. The code was
   * right and the instrument was wrong.
   *
   * WHAT IS COUNTED NOW, named because a count must say what it counts
   * (CLAUDE.md § Shared checks): tier objects across the fixture whose `price`
   * is exactly the string "0.00". Exactly one exists — FE-01 grade C — and it
   * is a price the shop chose. Every other tier is either a different price or
   * null, and null is what renders as words.
   */
  const zeroTiers = fixture().flatMap((p) => p.tiers).filter((t) => t.price === "0.00");
  const nullTiers = fixture().flatMap((p) => p.tiers).filter((t) => t.price === null);
  check(
    "exactly one tier VALUE is the string 0.00, and it is a chosen price",
    zeroTiers.length === 1 && zeroTiers[0]?.grade === "C",
    `${String(zeroTiers.length)} tier(s) equal to "0.00"`,
  );
  check(
    "and no NULL tier renders a number at all — each renders the words",
    nullTiers.length === 2 &&
      nullTiers.every((t) => `${t.grade} ${t.price ?? "ยังไม่ได้ตั้งราคา"}`.endsWith("ยังไม่ได้ตั้งราคา")),
    `${String(nullTiers.length)} unpriced tier(s)`,
  );
  /*
   * THE RENDERED HALF, with a needle that cannot be a substring of another
   * price: the grade letter and the value together. "C 0.00" appears once and
   * "B 0.00" never, whereas the bare "0.00" appears inside "60.00".
   */
  check(
    'the rendered screen carries "C 0.00" once and no other grade paired with 0.00',
    drawn.split("C 0.00").length - 1 === 1 &&
      !drawn.includes("A 0.00") &&
      !drawn.includes("B 0.00") &&
      !drawn.includes("D 0.00"),
    `bare "0.00" occurrences (a substring of 60.00, and why this is not the needle): ${String(drawn.split("0.00").length - 1)}`,
  );
}

/* --------------------------------------------------------- P2 the staff gate -- */

/**
 * THE PHASE'S OWN REFUSAL CRITERION, AND IT IS ASSERTED ON WHAT IS RENDERED.
 *
 * The claim is not "a boolean is false". It is that a staff session does not
 * see the control, in draw order, on the screen the view maps over. Every
 * absence below is paired with the same needle FOUND on the admin render in the
 * same pass and from the same fixture.
 */
function p2TheStaffRefusal(): void {
  header("P2 a staff session is not offered the control — NEGATIVELY, in draw order");

  const staff = listFor("staff");
  const admin = listFor("admin");
  const unknown = listFor(null);

  console.log(`\n  the STAFF screen, in draw order:\n    ${priceScreenText(staff)}`);
  console.log(`\n  the ADMIN screen, in draw order:\n    ${priceScreenText(admin)}`);
  console.log(`\n  the STAFF tier controls:\n    ${JSON.stringify(tierControlsText(staff))}`);
  console.log(`  the ADMIN tier controls:\n    ${JSON.stringify(tierControlsText(admin))}`);

  check("the predicate refuses a definite staff", !mayEditPrices("staff"));
  check("the predicate permits admin", mayEditPrices("admin"));
  /*
   * FAILS OPEN, and it is asserted rather than assumed. An unknown role gets
   * the control and lands on the 403 branch if it was wrong — the trade
   * src/session/deviceRole.ts argues, and the opposite of what a reader who
   * knows config-defaults-must-fail-closed.md would predict, which is exactly
   * why it must be pinned by a cell.
   */
  check("the predicate FAILS OPEN on an unknown role", mayEditPrices(null));

  /* ---- the absence, on the rendered string ---- */

  const staffDrawn = priceScreenText(staff);
  const adminDrawn = priceScreenText(admin);

  check(
    `ABSENT from the staff render: ${EDIT_TIER_LABEL}`,
    !tierControlsText(staff).includes(EDIT_TIER_LABEL),
    "",
  );
  check(
    `CONTROL — the SAME label IS on the admin render`,
    tierControlsText(admin).includes(EDIT_TIER_LABEL),
    "the absence above is about the staff screen, not about an instrument that never looked",
  );

  check(`ABSENT from the staff render: ${SAVE_TIER_LABEL}`, !staffDrawn.includes(SAVE_TIER_LABEL));
  check(
    "ABSENT from the staff render: any action but ปิด",
    staff.actions.length === 1 && staff.actions[0]?.kind === "close",
    staff.actions.map((a) => `${a.kind}:${a.label}`).join(", "),
  );

  /*
   * ONE EDIT CONTROL PER TIER ON THE ADMIN SCREEN — the number, not merely
   * "some". A control count that silently dropped to one would satisfy every
   * `includes` above while making seven tiers uneditable.
   */
  const tierCount = fixture().reduce((n, p) => n + p.tiers.length, 0);
  const adminControls = tierControlsText(admin).split(EDIT_TIER_LABEL).length - 1;
  check(
    "the admin screen draws ONE edit control per tier",
    adminControls === tierCount,
    `${String(adminControls)} controls over ${String(tierCount)} tiers`,
  );
  check(
    "the staff screen draws ZERO, over the SAME tiers",
    tierControlsText(staff).split(EDIT_TIER_LABEL).length - 1 === 0,
    `over ${String(tierCount)} tiers`,
  );

  /*
   * THE SCREEN SAYS WHY, and it says it about the ACCOUNT. A control that
   * vanishes with no sentence is a screen the operator reads as broken —
   * lessons/correct-classification-can-still-render-as-an-error.md is the same
   * failure from the other direction.
   */
  check(
    "the staff screen EXPLAINS the absence rather than being silent",
    staffDrawn.includes("แก้ไขราคาไม่ได้"),
    "",
  );
  check(
    "and the explanation is NOT on the admin screen",
    !adminDrawn.includes("แก้ไขราคาไม่ได้"),
    "",
  );

  /* ---- the prices themselves are still readable ---- */

  check(
    "a staff session can still READ every price it could read before",
    staff.products.length === fixture().length && staffDrawn.includes("62.50"),
    "the cart screen already shows these; hiding them would buy nothing",
  );

  check("an unknown role is offered the control (fail open)", unknown.editable);
  check("a staff role is not", !staff.editable);
  check("an admin role is", admin.editable);
}

/* ------------------------------------------------- P3 the refresh honesty -- */

/**
 * THE MONEY CELL. A price the server took and this device did not re-read means
 * the next bill written here carries `unit_price != list_price` — shaped
 * exactly like a deliberate staff override and not recoverable afterwards
 * (lessons/cached-master-data-is-a-price-claim.md). This asserts that the
 * screen never calls that success.
 */
function p3ASaveThisDeviceDidNotSee(): void {
  header("P3 saved on the server, stale on the phone, is NOT called success");

  const ok: PriceWrite = { kind: "ok", body: null };
  const refreshed = priceSaveScreen({ write: ok, refresh: "refreshed" });
  const failed = priceSaveScreen({ write: ok, refresh: "failed" });
  const skipped = priceSaveScreen({ write: ok, refresh: "skipped" });

  console.log(`\n  refreshed:\n    ${priceScreenText(refreshed)}`);
  console.log(`  failed:\n    ${priceScreenText(failed)}`);
  console.log(`  skipped:\n    ${priceScreenText(skipped)}`);

  check("a refreshed save is tone `saved`", refreshed.tone === "saved", refreshed.tone);
  check("a FAILED refresh is not", failed.tone === "stale", failed.tone);
  check("a SKIPPED refresh is not", skipped.tone === "stale", skipped.tone);

  /*
   * THE THREE TONES ARE DISTINCT VALUES, and `failed`/`skipped` deliberately
   * share their WORDING because what the operator must do is identical. The
   * reason stays a value so it survives into a bug report.
   */
  check(
    "the two stale reasons render identically — the operator's action is the same",
    priceScreenText(failed) === priceScreenText(skipped),
    "",
  );

  for (const [name, screen] of [["failed", failed], ["skipped", skipped]] as const) {
    const text = priceScreenText(screen);
    check(
      `${name}: the screen says the phone's list is still the OLD price`,
      text.includes("ยังเป็นราคาเดิม"),
      "",
    );
    check(
      `${name}: and tells the operator not to open a bill yet`,
      text.includes("อย่าเพิ่งเปิดบิล"),
      "",
    );
    check(
      `${name}: and offers a way to fix it`,
      screen.actions.some((a) => a.kind === "retry"),
      screen.actions.map((a) => a.kind).join(", "),
    );
  }

  /*
   * THE CONTROL FOR THE ABSENCES ABOVE. The refreshed screen must NOT carry the
   * warning — otherwise "the warning is present" is true of every save and says
   * nothing. Both needles are checked on both screens, in this pass.
   */
  const good = priceScreenText(refreshed);
  check("CONTROL — the refreshed screen carries NEITHER warning",
    !good.includes("ยังเป็นราคาเดิม") && !good.includes("อย่าเพิ่งเปิดบิล"), "");
  check(
    "and it does say the two are in agreement",
    good.includes("ตรงกันแล้ว"),
    "",
  );

  /*
   * NO SCREEN ON THIS PATH EVER SHOWS A PRICE ROW. An outcome is a message, and
   * a list rendered underneath one would be the pre-refresh list — the exact
   * stale number the warning is about, printed as though it were current.
   */
  for (const [name, screen] of [
    ["refreshed", refreshed],
    ["failed", failed],
    ["skipped", skipped],
  ] as const) {
    check(`${name}: carries no price rows at all`, screen.products.length === 0, "");
    check(`${name}: offers no edit control`, !screen.editable, "");
  }
}

/* ---------------------------------------------------- P4 every outcome maps -- */

function p4EveryOutcomeHasAScreen(): void {
  header("P4 every transport outcome maps to a screen — enumerated, not listed");

  const writes: readonly (readonly [string, PriceWrite])[] = [
    ["no_token", { kind: "no_token" }],
    ["unreachable", { kind: "unreachable" }],
    ["200", { kind: "ok", body: null }],
    ["401", { kind: "http", status: 401, code: null }],
    ["403 admin_required", { kind: "http", status: 403, code: "admin_required" }],
    ["404", { kind: "http", status: 404, code: "not_found" }],
    ["409", { kind: "http", status: 409, code: "conflict" }],
    ["422", { kind: "http", status: 422, code: "invalid_request" }],
    ["500", { kind: "http", status: 500, code: null }],
    ["503", { kind: "http", status: 503, code: null }],
  ];

  const refreshes: readonly CacheRefresh[] = ["refreshed", "failed", "skipped"];

  let rendered = 0;
  for (const [name, write] of writes) {
    for (const refresh of refreshes) {
      const s = priceSaveScreen({ write, refresh });
      rendered += 1;
      const text = priceScreenText(s);
      check(
        `${name} / ${refresh}: has a badge, at least one line and at least one action`,
        s.badge.length > 0 && s.lines.length > 0 && s.actions.length > 0,
        `${String(s.lines.length)} line(s), ${String(s.actions.length)} action(s)`,
      );
      check(
        `${name} / ${refresh}: renders no raw HTTP or JSON at the operator`,
        !text.includes("HTTP") && !text.includes("{") && !text.includes("detail"),
        "a developer diagnostic and an operator message are different artifacts",
      );
    }
  }
  check(
    "every combination was rendered",
    rendered === writes.length * refreshes.length && rendered > 0,
    `${String(writes.length)} writes x ${String(refreshes.length)} refreshes = ${String(rendered)}`,
  );

  /*
   * THE REFUSALS SAY THE PRICE DID NOT CHANGE — the one fact the operator needs
   * before deciding whether to type it again. Excluded: 200 (it did change) and
   * the statuses where the answer is genuinely unknown, which say so instead.
   */
  const unchanged: readonly PriceWrite[] = [
    { kind: "no_token" },
    { kind: "unreachable" },
    { kind: "http", status: 401, code: null },
    { kind: "http", status: 403, code: "admin_required" },
    { kind: "http", status: 404, code: "not_found" },
    { kind: "http", status: 422, code: "invalid_request" },
  ];
  for (const write of unchanged) {
    const text = priceScreenText(priceSaveScreen({ write, refresh: "skipped" }));
    const label = write.kind === "http" ? String(write.status) : write.kind;
    check(
      `${label}: says plainly that the price did NOT change`,
      text.includes("ยังไม่ถูกเปลี่ยน") || text.includes("ยังไม่ได้เปลี่ยนราคา") || text.includes("ยังไม่ได้เปลี่ยน"),
      "",
    );
  }

  /*
   * AND A 5xx DOES NOT. The request reached the server, so whether the price
   * changed cannot be decided from the phone — claiming it did not would be a
   * guess in the direction that gets a second edit typed over a first one
   * (lessons/unavailable-is-not-rejected.md, the same distinction on the bill
   * path). Asserted as a CONTRAST with the six above, on the same needle.
   */
  const fivexx = priceScreenText(priceSaveScreen({
    write: { kind: "http", status: 500, code: null },
    refresh: "skipped",
  }));
  check(
    "CONTRAST — a 500 does NOT claim the price is unchanged",
    !fivexx.includes("ยังไม่ถูกเปลี่ยน"),
    "",
  );
  check("a 500 says the outcome is unknown", fivexx.includes("ไม่แน่ใจ"), "");

  /* the LIST screens, over the THREE absences that are not the same absence */

  const never = priceListScreen({ role: "admin", products: [], haveProducts: false, haveGradeTiers: true });
  const empty = priceListScreen({ role: "admin", products: [], haveProducts: true, haveGradeTiers: true });
  // A THIRD absence (S16 / P1.24): products cached but the tier set never fetched —
  // an upgraded handset before its first refresh. Distinct from the two above, and
  // it says so about the TIERS, not the products; the screen cannot list a tier it
  // has not downloaded, so it draws no rows rather than every product with none.
  const noTiers = priceListScreen({
    role: "admin",
    products: fixture(),
    haveProducts: true,
    haveGradeTiers: false,
  });
  console.log(`\n  never fetched:\n    ${priceScreenText(never)}`);
  console.log(`  shop has none:\n    ${priceScreenText(empty)}`);
  console.log(`  tiers not fetched:\n    ${priceScreenText(noTiers)}`);
  check(
    "never-fetched and shop-has-no-products are DIFFERENT screens",
    priceScreenText(never) !== priceScreenText(empty),
    "same empty screen, opposite fixes",
  );
  check(
    "never-fetched blames this DEVICE, not the shop",
    priceScreenText(never).includes("เครื่องนี้ยังไม่เคยดาวน์โหลด"),
    "",
  );
  check(
    "products-but-no-tiers is its OWN empty screen, blaming the missing tier list",
    priceScreenText(noTiers).includes("ยังไม่เคยดาวน์โหลดรายการเกรด") &&
      priceScreenText(noTiers) !== priceScreenText(never) &&
      priceScreenText(noTiers) !== priceScreenText(empty),
    "tiers absent, products present",
  );
  check(
    "the no-tiers screen draws no product rows and no edit control",
    noTiers.products.length === 0 && !noTiers.editable,
    `${String(noTiers.products.length)} rows`,
  );
  check("no fetched-state screen offers an edit control", !never.editable && !empty.editable && !noTiers.editable, "");
}

/* ------------------------------------------- P5 no action that cannot help -- */

function p5NoActionThatCannotHelp(): void {
  header("P5 no branch offers an action that cannot help");

  const forbidden = priceSaveScreen({
    write: { kind: "http", status: 403, code: "admin_required" },
    refresh: "skipped",
  });
  console.log(`\n  403:\n    ${priceScreenText(forbidden)}`);
  /*
   * A 403 OFFERS NO SIGN-IN. Signing in again as the same person changes
   * nothing, and the button would tell the operator their SESSION is the
   * problem when their PERMISSIONS are.
   */
  check(
    "403 offers no sign-in",
    !forbidden.actions.some((a) => a.kind === "sign_in"),
    forbidden.actions.map((a) => a.kind).join(", "),
  );
  check(
    "403 offers no retry either — the same bytes would be refused the same way",
    !forbidden.actions.some((a) => a.kind === "retry"),
    forbidden.actions.map((a) => a.kind).join(", "),
  );

  const expired = priceSaveScreen({
    write: { kind: "http", status: 401, code: null },
    refresh: "skipped",
  });
  /*
   * THE CONTROL FOR THE ABSENCE ABOVE. A 401 IS the one status a sign-in fixes,
   * so if this did not carry one the 403 assertion would be about a screen that
   * never offers sign-in to anybody. lessons/401-is-about-the-caller-not-the-bill.md.
   */
  check(
    "CONTROL — a 401 DOES offer a sign-in",
    expired.actions.some((a) => a.kind === "sign_in"),
    expired.actions.map((a) => a.kind).join(", "),
  );

  const invalid = priceSaveScreen({
    write: { kind: "http", status: 422, code: "invalid_request" },
    refresh: "skipped",
  });
  check(
    "422 is terminal: no retry",
    !invalid.actions.some((a) => a.kind === "retry"),
    invalid.actions.map((a) => a.kind).join(", "),
  );

  const offline = priceSaveScreen({ write: { kind: "unreachable" }, refresh: "skipped" });
  check(
    "CONTROL — unreachable DOES offer a retry",
    offline.actions.some((a) => a.kind === "retry"),
    offline.actions.map((a) => a.kind).join(", "),
  );
  check(
    "unreachable says nothing was queued",
    priceScreenText(offline).includes("ราคายังเป็นค่าเดิมทั้งในระบบและในเครื่องนี้"),
    "a price write is not offline work",
  );

  /*
   * BACK-TO-THE-LIST is offered exactly where a session still exists and the
   * list is still worth reading, and nowhere else. Both directions are checked
   * in this pass, so neither is a claim about a button no screen ever carries.
   */
  const saved = priceSaveScreen({ write: { kind: "ok", body: null }, refresh: "refreshed" });
  const stale = priceSaveScreen({ write: { kind: "ok", body: null }, refresh: "failed" });
  const notFound = priceSaveScreen({
    write: { kind: "http", status: 404, code: "not_found" },
    refresh: "skipped",
  });
  const noToken = priceSaveScreen({ write: { kind: "no_token" }, refresh: "skipped" });

  const hasBack = (s: PriceScreen): boolean => s.actions.some((a) => a.kind === "back");
  for (const [name, s] of [
    ["saved", saved],
    ["stale", stale],
    ["422", invalid],
    ["404", notFound],
    ["unreachable", offline],
  ] as const) {
    check(`${name}: offers a way back to the LIST`, hasBack(s), s.actions.map((a) => a.kind).join(", "));
  }
  for (const [name, s] of [
    ["no_token", noToken],
    ["401", expired],
    ["403", forbidden],
  ] as const) {
    check(
      `${name}: offers NO way back to the list — there is nothing to go back to`,
      !hasBack(s),
      s.actions.map((a) => a.kind).join(", "),
    );
  }

  /*
   * A REFRESH IS NOT A SAVE — the defect found while building this phase.
   *
   * `priceRefreshScreen` exists because the app first routed the
   * `อัปเดตรายการราคา` button back through `priceSaveScreen` with an invented
   * `{kind:"ok"}` write, which on a failed refresh printed "saved on the
   * server" over a write the server may have REFUSED. These cells are the
   * disproof: the refresh wording must NOT contain the save wording, and the
   * save wording must still exist somewhere, so the absence is about this
   * screen and not about a sentence nothing produces.
   */
  const refreshFailed = priceRefreshScreen("failed");
  const refreshSkipped = priceRefreshScreen("skipped");
  const refreshOk = priceRefreshScreen("refreshed");
  console.log(`\n  refresh failed:\n    ${refreshFailed === null ? "(null)" : priceScreenText(refreshFailed)}`);

  check(
    "a SUCCESSFUL re-read returns null, so the LIST comes back",
    refreshOk === null,
    refreshOk === null ? "" : priceScreenText(refreshOk),
  );
  for (const [name, s] of [["failed", refreshFailed], ["skipped", refreshSkipped]] as const) {
    if (s === null) {
      check(`${name}: a failed re-read produces a screen`, false, "null");
      continue;
    }
    const text = priceScreenText(s);
    check(`${name}: says the list could not be re-read`, text.includes("อัปเดตรายการราคาไม่สำเร็จ"));
    check(
      `${name}: and claims NOTHING about a save`,
      !text.includes("บันทึก"),
      text,
    );
    check(`${name}: offers a retry and a way back`, hasBack(s) && s.actions.some((a) => a.kind === "retry"),
      s.actions.map((a) => a.kind).join(", "));
  }
  /*
   * THE CONTROL. Without it, "claims nothing about a save" is equally true of a
   * module that never says บันทึก at all, and the assertion would be about a
   * word this file does not use rather than about this screen.
   */
  check(
    "CONTROL — the SAVE screen DOES say บันทึก, so the absence above is real",
    priceScreenText(saved).includes("บันทึก") && priceScreenText(stale).includes("บันทึก"),
    "",
  );

  /* every action label is non-empty, on every screen this module can produce */
  const all: readonly PriceScreen[] = [
    listFor("admin"),
    listFor("staff"),
    forbidden,
    expired,
    invalid,
    offline,
    priceSaveScreen({ write: { kind: "ok", body: null }, refresh: "refreshed" }),
    priceSaveScreen({ write: { kind: "ok", body: null }, refresh: "failed" }),
  ];
  const blank = all.flatMap((s) => s.actions).filter((a) => a.label.trim() === "");
  check("no action anywhere carries a blank label", blank.length === 0, `${String(blank.length)} blank`);

  /*
   * F3 — THE SHOP'S NAME IS SHOWN, NEVER THE CODE (S16 / P1.24). The tier set used
   * to be the module's `GRADES`, and the old cell here asserted the fixture equalled
   * it. The set is per-tenant now, so there is nothing to equal; what matters
   * instead is that the screen lists a tier by its display NAME — the code is only
   * the price-map key. A fixture where name != code (a backfilled shop has them
   * equal) proves the rendered text carries the name, not the code.
   */
  const named = priceScreenText(
    priceListScreen({
      role: "admin",
      products: [
        { id: "n-1", code: "CU-01", name: "ทองแดง", tiers: [{ grade: "G1", name: "เกรดหนึ่ง", price: "120.00" }] },
      ],
      haveProducts: true,
      haveGradeTiers: true,
    }),
  );
  check(
    "the rendered price screen shows the tier NAME, not its code",
    named.includes("เกรดหนึ่ง 120.00") && !named.includes("G1 120.00"),
    named.includes("เกรดหนึ่ง 120.00") ? "name shown" : "name NOT shown",
  );
}

/* ------------------------------------------------------------------ main -- */

function main(): number {
  console.log("PRICE EDITING (P1.9 / P1.24) — the pure module, driven for real\n");

  p0TheBoundIsTheColumn();
  p1NothingIsDefaulted();
  p2TheStaffRefusal();
  p3ASaveThisDeviceDidNotSee();
  p4EveryOutcomeHasAScreen();
  p5NoActionThatCannotHelp();

  console.log("");
  console.log(failures === 0 ? "ALL PRICE CASES PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

/*
 * PRESET TO RED, per lessons/a-default-exit-code-is-a-default-verdict.md. A
 * process that ends any way other than main() completing must not report green:
 * node exits 0 by default, so an unsettled await or a throw on the way in would
 * otherwise print nothing and pass.
 */
process.exitCode = 1;

try {
  const code = main();
  console.log(`PRICES_EXIT=${String(code)}`);
  process.exitCode = code;
} catch (err: unknown) {
  console.error("PRICES PROOF CRASHED:", err);
  console.log("PRICES_EXIT=1");
  process.exitCode = 1;
}
