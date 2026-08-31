/**
 * P1.24: THE SHOP'S GRADE TIERS — declare, rename, retire; the F1/F4 guards; and
 * the offline one-tier seller stays unpriced until the server seats it.
 *
 *   npm run prove:gradeTiers
 *   npm run prove:gradeTiers -- --break=<deactivate_last|hide_last_tier|drop_count>
 *
 * NO SERVER, NO DATABASE, NO NETWORK. `src/settings/gradeTierAdmin.ts` and
 * `src/cart/sellers.ts` are pure functions, and every case below CONSTRUCTS its
 * input directly — so this runs twice with no reseed by construction, and every
 * assertion is about those functions and nothing else. The tier CRUD's ROUTES are
 * the server's; that they refuse a duplicate or a deactivation-in-use is proved
 * over real HTTP in server/scripts/prove_grade_tiers.py, not here — this program
 * has no server, and it says so rather than claiming a round trip it never made.
 *
 * THREE DISPROOFS, EACH APPLIED BY A WRAPPER, never by a hook inside the module
 * under test (lessons/a-check-that-never-went-red-was-never-observed.md):
 *
 *   --break=deactivate_last  offers to deactivate the LAST active tier. G2's F1
 *                            guard — a shop must keep one active tier — goes red.
 *   --break=hide_last_tier   returns NO rows for a one-tier shop. G3's "the list is
 *                            never hidden" goes red (a one-tier shop could not add
 *                            its second tier).
 *   --break=drop_count       strips the seller COUNT from the deactivation refusal.
 *                            G5's F4 "the refusal says how many" goes red.
 *
 * ON THE OUTPUT. Mostly Thai. Mojibake in the console is the console — codepage 874
 * (lessons/console-is-not-the-observation.md). Every assertion compares JavaScript
 * strings. The exit line GRADE_TIERS_EXIT=<n> is ABSENT if the run dies before the
 * summary, and THE ABSENCE IS THE SIGNAL.
 */
import {
  GRADE_CODE_MAX_LENGTH,
  GRADE_NAME_MAX_LENGTH,
  moveActiveTier,
  readGradeTiers,
  tierActionOutcome,
  tierAdminScreen,
  validateNewTier,
  validateRename,
} from "../settings/gradeTierAdmin.js";
import type {
  AdminGradeTier,
  GradeTierFetch,
  TierActionOutcome,
  TierAdminScreen,
} from "../settings/gradeTierAdmin.js";
import { gradePrice, tierName } from "../cart/sellers.js";
import { saveConfirmNotice } from "../master/saveConfirmNotice.js";
import type { DeviceRole } from "../session/deviceRole.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const BREAK = (process.argv.find((a) => a.startsWith("--break=")) ?? "").split("=")[1] ?? "";
const BREAK_MODES: readonly string[] = ["deactivate_last", "hide_last_tier", "drop_count"];

if (BREAK !== "" && !BREAK_MODES.includes(BREAK)) {
  console.log(`  [FAIL] unknown --break=${BREAK} — nothing was damaged and nothing was measured`);
  console.log(`         known breaks: ${BREAK_MODES.join(", ")}`);
  console.log("GRADE_TIERS_EXIT=2");
  process.exit(2);
}

/* ------------------------------------------------------------ the wrappers -- */

/** The tier list, or the OLD/wrong design's answer under a break. */
function adminScreen(tiers: readonly AdminGradeTier[], role: DeviceRole): TierAdminScreen {
  const screen = tierAdminScreen(tiers, role);
  if (BREAK === "deactivate_last") {
    // The defect: every active tier is deactivatable, including the last one —
    // which would let a shop deactivate its way to ZERO active tiers, where every
    // walk-in is ungraded and every bill parks.
    return { ...screen, rows: screen.rows.map((r) => ({ ...r, mayDeactivate: r.is_active })) };
  }
  if (BREAK === "hide_last_tier" && screen.activeCount === 1) {
    // The defect: a one-tier shop is shown NO tiers, so it can neither see its one
    // tier nor add a second — the list must never be hidden.
    return { ...screen, rows: [] };
  }
  return screen;
}

/** The action outcome, or one that has lost the count under a break. */
function actionOutcome(fetch: GradeTierFetch): TierActionOutcome {
  const outcome = tierActionOutcome(fetch);
  if (BREAK === "drop_count" && outcome.kind === "refused") {
    // The defect: F4 says the refusal SAYS HOW MANY. This strips the digits, so the
    // operator is told to move sellers but not how many are in the way.
    return { kind: "refused", message: outcome.message.replace(/[0-9๐-๙]+/g, "") };
  }
  return outcome;
}

/* ---------------------------------------------------------------- fixtures -- */

const TIERS_MANY: readonly AdminGradeTier[] = [
  { id: "t-a", code: "A", name: "เกรดเอ", sort_order: 0, is_active: true },
  { id: "t-b", code: "B", name: "เกรดบี", sort_order: 1, is_active: true },
  { id: "t-x", code: "X", name: "เกรดที่ปิดแล้ว", sort_order: 2, is_active: false },
];
const TIERS_ONE: readonly AdminGradeTier[] = [
  { id: "t-a", code: "A", name: "เกรดเดียว", sort_order: 0, is_active: true },
];
const THAI = /[฀-๿]/;

/* -------------------------------------------------------------------- G0 -- */

function g0Reading(): void {
  header("G0 — GET /grade-tiers parses, and a malformed row fails the WHOLE read");
  const good = readGradeTiers({
    grade_tiers: [{ id: "t-a", code: "A", name: "เกรดเอ", sort_order: 0, is_active: true }],
  });
  check("G0: CONTROL — a well-formed body parses", good !== null && good.length === 1, `${good === null ? "null" : String(good.length)}`);
  check("G0: the parsed row carries code, name and is_active", good !== null && good[0]?.code === "A" && good[0]?.name === "เกรดเอ" && good[0]?.is_active === true);
  // Malformed → null (fatal), never a skipped row: a partial list would let a shop
  // deactivate past a tier it cannot see.
  check("G0: a wrong-typed sort_order fails the read", readGradeTiers({ grade_tiers: [{ id: "t", code: "A", name: "n", sort_order: "x", is_active: true }] }) === null);
  check("G0: a missing field fails the read", readGradeTiers({ grade_tiers: [{ id: "t", code: "A", is_active: true }] }) === null);
  check("G0: a body with no grade_tiers array fails the read", readGradeTiers({}) === null);
}

/* -------------------------------------------------------------------- G1 -- */

function g1TheList(): void {
  header("G1 — the list: active first, the count, and the staff read-only gate");
  const admin = adminScreen(TIERS_MANY, "admin");
  const staff = adminScreen(TIERS_MANY, "staff");

  check("G1: the active count is right", admin.activeCount === 2, `${String(admin.activeCount)}`);
  check("G1: active tiers are listed before inactive", admin.rows.length === 3 && admin.rows[0]?.is_active === true && admin.rows[1]?.is_active === true && admin.rows[2]?.is_active === false, admin.rows.map((r) => `${r.code}:${String(r.is_active)}`).join(","));
  // PRESENCE / NEGATIVE for the role gate.
  check("G1: PRESENCE — an admin session may edit the tiers", admin.editable === true, `editable=${String(admin.editable)}`);
  check("G1: NEGATIVE — a staff session sees the list read-only", staff.editable === false, `editable=${String(staff.editable)}`);
}

/* -------------------------------------------------------------------- G2 -- */

function g2F1Guard(): void {
  header("G2 — F1: the LAST active tier may not be deactivated (the shop needs one)");
  const many = adminScreen(TIERS_MANY, "admin");
  const one = adminScreen(TIERS_ONE, "admin");

  const activeInMany = many.rows.filter((r) => r.is_active);
  const inactiveInMany = many.rows.filter((r) => !r.is_active);
  const activeInOne = one.rows.filter((r) => r.is_active);
  // PRESENCE — with two active tiers, an active tier CAN be deactivated.
  check("G2: PRESENCE — with two active tiers, each active tier may be deactivated", activeInMany.length === 2 && activeInMany.every((r) => r.mayDeactivate), activeInMany.map((r) => `${r.code}:${String(r.mayDeactivate)}`).join(","));
  // NEGATIVE — the disproof --break=deactivate_last reddens exactly this. Read as a
  // SET over the active tiers (not one.rows[0]) so that --break=hide_last_tier,
  // whose target is G3, leaves this vacuously true rather than reddening it too:
  // the F1 guard is "no active tier is deactivatable when it is the last", and an
  // empty list has none. In the real run `one` has one active tier, so it is not
  // vacuous here.
  check("G2: NEGATIVE — no active tier in a one-tier shop may be deactivated (F1)", activeInOne.every((r) => r.mayDeactivate === false), activeInOne.map((r) => `${r.code}:${String(r.mayDeactivate)}`).join(",") || "(no active rows)");
  // An already-inactive tier is not deactivatable — it is reactivatable.
  check("G2: an inactive tier is never offered deactivation", inactiveInMany.every((r) => !r.mayDeactivate), inactiveInMany.map((r) => `${r.code}:${String(r.mayDeactivate)}`).join(","));
}

/* -------------------------------------------------------------------- G3 -- */

function g3ListNeverHidden(): void {
  header("G3 — the tier LIST is never hidden, even for a one-tier shop (it must add a second)");
  const one = adminScreen(TIERS_ONE, "admin");
  // The disproof --break=hide_last_tier reddens exactly this. F2 hides the /shop
  // default-grade CONTROL (proved in proveSettings S6), NOT this list.
  check("G3: a one-tier shop still sees its tier in the list", one.rows.length === 1 && one.rows[0]?.code === "A", `${String(one.rows.length)} row(s)`);
  check("G3: PRESENCE — the one-tier list is still editable, so a second tier can be added", one.editable === true, `editable=${String(one.editable)}`);
}

/* -------------------------------------------------------------------- G4 -- */

function g4Validation(): void {
  header("G4 — a new tier and a rename are bounded by the column and checked for a duplicate");
  const longCode = "c".repeat(GRADE_CODE_MAX_LENGTH + 1);
  const longName = "n".repeat(GRADE_NAME_MAX_LENGTH + 1);

  check("G4: CONTROL — a valid new tier is accepted", validateNewTier("G1", "เกรดหนึ่ง", TIERS_MANY).ok === true);
  check("G4: an empty code is refused", validateNewTier("  ", "ชื่อ", TIERS_MANY).ok === false);
  check("G4: an empty name is refused", validateNewTier("G1", "  ", TIERS_MANY).ok === false);
  check("G4: an over-length code is refused", validateNewTier(longCode, "ชื่อ", TIERS_MANY).ok === false);
  check("G4: an over-length name is refused", validateNewTier("G1", longName, TIERS_MANY).ok === false);
  check("G4: a duplicate code is refused BEFORE the write", validateNewTier("A", "อีกชื่อ", TIERS_MANY).ok === false);
  // The accepted body is trimmed — a leading space in the FK handle is a slip.
  const trimmed = validateNewTier("  G2  ", "  เกรดสอง  ", TIERS_MANY);
  check("G4: the accepted body is trimmed", trimmed.ok === true && trimmed.body.code === "G2" && trimmed.body.name === "เกรดสอง", trimmed.ok ? `${trimmed.body.code}/${trimmed.body.name}` : "refused");

  check("G4: CONTROL — a valid rename is accepted", validateRename("ชื่อใหม่").ok === true);
  check("G4: an empty rename is refused", validateRename("   ").ok === false);
  check("G4: an over-length rename is refused", validateRename(longName).ok === false);
}

/* -------------------------------------------------------------------- G5 -- */

function g5TheOutcome(): void {
  header("G5 — F4: the deactivation refusal SAYS HOW MANY sellers are in the tier");
  const inUse: GradeTierFetch = {
    kind: "http",
    status: 409,
    body: { detail: { code: "grade_tier_in_use", sellers_in_tier: "3", message: "..." } },
  };
  const dup: GradeTierFetch = { kind: "http", status: 409, body: { detail: { code: "grade_tier" } } };
  const unauthorized: GradeTierFetch = { kind: "http", status: 401, body: {} };
  const offline: GradeTierFetch = { kind: "unreachable" };
  const ok: GradeTierFetch = { kind: "ok", body: {} };

  const inUseOut = actionOutcome(inUse);
  console.log(`  in-use refusal: ${inUseOut.kind === "refused" ? inUseOut.message : inUseOut.kind}`);
  // THE CELL — F4's count. The disproof --break=drop_count reddens exactly this.
  check(
    "G5: the in-use refusal carries the seller count (3)",
    inUseOut.kind === "refused" && inUseOut.message.includes("3") && THAI.test(inUseOut.message),
    inUseOut.kind === "refused" ? inUseOut.message : inUseOut.kind,
  );
  // CONTROL: a DIFFERENT 409 (a duplicate) is refused too but is NOT the count path.
  check("G5: CONTROL — a duplicate 409 refuses without claiming a count", dup.kind === "http" && actionOutcome(dup).kind === "refused");
  // F1 (commit 3): the last-active 409 is its OWN readable refusal, not the duplicate one.
  const lastActive: GradeTierFetch = {
    kind: "http",
    status: 409,
    body: { detail: { code: "grade_tier_last_active", active_tiers: "1" } },
  };
  const laOut = actionOutcome(lastActive);
  check(
    "G5: F1 — the last-active 409 is its own readable refusal (commit 3)",
    laOut.kind === "refused" && laOut.message.includes("อย่างน้อยหนึ่งเกรด"),
    laOut.kind === "refused" ? laOut.message : laOut.kind,
  );
  check("G5: a 401 ends the session (not a plain refusal)", actionOutcome(unauthorized).kind === "session");
  check("G5: an outage refuses without ending the session", actionOutcome(offline).kind === "refused");
  check("G5: a 2xx is 'ok' (the caller re-reads the list)", actionOutcome(ok).kind === "ok");
}

/* -------------------------------------------------------------------- G6 -- */

function g6OfflineOneTier(): void {
  header("G6 — F2: an offline one-tier seller is UNPRICED until the server seats it");
  const prices: Readonly<Record<string, string>> = { A: "62.50" };
  const tiers = [{ code: "A", name: "เกรดเดียว" }];

  // OFFLINE, NOT YET SEATED. A seller created offline in a one-tier shop carries a
  // NULL grade until it syncs; the server seats it, this device does not. So it has
  // NO default price (the operator types what was agreed) and the confirm card says
  // the bill parks — the settled ungraded wording.
  const unpriced = gradePrice(prices, null);
  const parkNotice = saveConfirmNotice(null);
  check("G6: the offline null-grade seller has NO default price", unpriced === null, `${String(unpriced)}`);
  check(
    "G6: and the confirm card says the bill waits for the office (ungraded wording)",
    parkNotice.park !== null && parkNotice.park.includes("ยังไม่ได้จัดเกรด") && !parkNotice.warn.includes("ส่งเข้าระบบทันที"),
    parkNotice.park ?? "(no park line)",
  );

  // THE PRESENCE SIBLING — once synced and SEATED, the seller carries the tier
  // code: it is priced from that tier, the confirm card says it enters the system,
  // and the surfaces show the tier's NAME (F3), not its code.
  const seatedPrice = gradePrice(prices, "A");
  const seatedNotice = saveConfirmNotice("A");
  check("G6: PRESENCE — a seated seller (grade A) IS priced from its tier", seatedPrice === "62.50", `${String(seatedPrice)}`);
  check("G6: PRESENCE — the seated seller's bill enters the system now (no park)", seatedNotice.park === null && seatedNotice.warn.includes("ส่งเข้าระบบทันที"));
  check("G6: PRESENCE — the seated grade shows as its NAME, not its code", tierName(tiers, "A") === "เกรดเดียว", tierName(tiers, "A"));
}

/* -------------------------------------------------------------------- G7 -- */

function g7Reorder(): void {
  header("G7 — reorder (commit 3): the full order, the edges, and the move flags");
  const rows = tierAdminScreen(TIERS_MANY, "admin").rows;
  const byCode = (c: string): (typeof rows)[number] => {
    const r = rows.find((x) => x.code === c);
    if (r === undefined) throw new Error(`the fixture has no tier ${c}`);
    return r;
  };
  const a = byCode("A"); // first active
  const b = byCode("B"); // last active
  const x = byCode("X"); // inactive

  // The flags the view disables its buttons on.
  check("G7: the FIRST active tier cannot move up (but can move down)", a.canMoveUp === false && a.canMoveDown === true, `up=${String(a.canMoveUp)} down=${String(a.canMoveDown)}`);
  check("G7: the LAST active tier cannot move down (but can move up)", b.canMoveDown === false && b.canMoveUp === true, `up=${String(b.canMoveUp)} down=${String(b.canMoveDown)}`);
  check("G7: an INACTIVE tier can move NEITHER way", x.canMoveUp === false && x.canMoveDown === false);

  // moveActiveTier emits the FULL order (active reordered, inactive after) -- the
  // PUT /grade-tiers/order body, which must cover every tier exactly once.
  const up = moveActiveTier(rows, b.id, "up");
  check(
    "G7: moving the second active tier UP yields [B, A, X] — active reordered, inactive last",
    up !== null && up.length === 3 && up[0] === b.id && up[1] === a.id && up[2] === x.id,
    up === null ? "null" : up.join(","),
  );
  check(
    "G7: CONTROL — the emitted order covers every tier id EXACTLY once (the PUT's contract)",
    up !== null && new Set(up).size === rows.length && rows.every((r) => up.includes(r.id)),
    up === null ? "null" : `${String(new Set(up).size)}/${String(rows.length)}`,
  );
  // The edges and the inactive tier are no-ops (null) -- the provable other half of
  // the canMove flags, which the view itself (in app/) cannot be proved to honour.
  check("G7: moving the FIRST active tier up is a no-op (null)", moveActiveTier(rows, a.id, "up") === null);
  check("G7: moving the LAST active tier down is a no-op (null)", moveActiveTier(rows, b.id, "down") === null);
  check("G7: moving an INACTIVE tier is a no-op (null)", moveActiveTier(rows, x.id, "up") === null);
}

/* ------------------------------------------------------------------ main -- */

function main(): number {
  console.log("P1.24 — the shop's grade tiers, driven for real (pure modules, no server)");
  console.log(`node ${process.version}`);
  console.log("no server, no database, no network: every input below is CONSTRUCTED");
  if (BREAK !== "") {
    console.log("");
    console.log(`  *** DISPROOF ACTIVE: --break=${BREAK} — a cell that stays green is not measuring what it claims ***`);
  }

  g0Reading();
  g1TheList();
  g2F1Guard();
  g3ListNeverHidden();
  g4Validation();
  g5TheOutcome();
  g6OfflineOneTier();
  g7Reorder();

  console.log("");
  console.log(failures === 0 ? "ALL GRADE-TIER CASES PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

// PRESET RED, per lessons/a-default-exit-code-is-a-default-verdict.md: cleared to
// 0 only if every cell passes.
process.exitCode = 1;

try {
  const code = main();
  console.log(`GRADE_TIERS_EXIT=${String(code)}`);
  process.exitCode = code;
} catch (err: unknown) {
  console.log("");
  console.log(`  [FAIL] the run died: ${err instanceof Error ? err.message : String(err)}`);
  console.log("GRADE_TIERS_EXIT=1");
  process.exitCode = 1;
}
