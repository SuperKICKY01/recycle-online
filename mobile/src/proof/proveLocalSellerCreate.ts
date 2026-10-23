/**
 * WHAT THE ADD-SELLER SHEET SAYS AFTER A LOCAL-FIRST CREATE — proven over the
 * pure `localSellerCreateNotice`, with no server, no database and no network.
 *
 *   npm run prove:localsellercreate
 *   npm run prove:localsellercreate -- --break=<collapse|leak>
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS CANNOT SEE, SAID FIRST
 * ---------------------------------------------------------------------------
 * It cannot see the SHEET. `app/AddSellerSheet.tsx` is outside
 * `tsconfig.node.json`, so a green here says the pure decision is right, not
 * that the screen draws it. It asserts the CONCATENATION in draw order, which
 * is the strongest thing a headless proof can hold about a card assembled from
 * regions (`lessons/403-is-about-what-the-caller-may-do.md`).
 *
 * ---------------------------------------------------------------------------
 * PRESET RED
 * ---------------------------------------------------------------------------
 * `process.exitCode = 1` at entry, cleared only if every cell passes
 * (`lessons/a-default-exit-code-is-a-default-verdict.md`). Two negative controls
 * are armed by `--break`, each damaging the render ON PURPOSE in this file and
 * never in `src/master`, so a cell that stays green under a break is a cell that
 * is not measuring what it claims
 * (`lessons/a-check-that-never-went-red-was-never-observed.md`).
 */
import type { CreateLocalSellerResult, LocalSeller } from "../sync/localSeller.js";
import { localSellerCreateNotice } from "../master/localSellerCreateNotice.js";
import type { LocalSellerCreateNotice } from "../master/localSellerCreateNotice.js";
import { reserveLevelNotice } from "../master/reserveNotice.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

const BREAK = (process.argv.find((a) => a.startsWith("--break=")) ?? "").split("=")[1] ?? "";

/**
 * EVERY BREAK THIS FILE IMPLEMENTS, refused at MODULE SCOPE before the first
 * line of output — a rejected value must not announce itself as an armed
 * control on the way out (`proveSheets.ts`, the `--break=coexsit` incident).
 * Exit 2, never 1: a break this file cannot apply measured nothing.
 */
const BREAK_MODES: readonly string[] = ["collapse", "leak"];

if (BREAK !== "" && !BREAK_MODES.includes(BREAK)) {
  console.log(`  [FAIL] unknown --break=${BREAK} — nothing was damaged and nothing was measured`);
  console.log(`         known breaks: ${BREAK_MODES.join(", ")}`);
  console.log("LOCALSELLERCREATE_EXIT=2");
  process.exit(2);
}

// PRESET RED: cleared to 0 only if every cell passes, so a death before the
// summary stays red (`lessons/a-default-exit-code-is-a-default-verdict.md`).
process.exitCode = 1;

/**
 * A LOCAL SELLER as the store hands one back — every field populated with a
 * DISTINCTIVE value so a leak of any private one is detectable, and the two the
 * card is allowed to show (name, code) set apart from the rest.
 */
function localSeller(over: Partial<LocalSeller>): LocalSeller {
  return {
    id: "local-uuid-must-not-show",
    code: "S007",
    reservation_token: "tok-secret-must-not-show",
    name: "ผู้ขายพิสูจน์",
    phone: null,
    grade: null,
    id_number: "1234567890123-must-not-show",
    id_last4: "last4-must-not-show",
    address: "addr-secret-must-not-show",
    vehicle_no: "veh-secret-must-not-show",
    sync_state: "pending",
    attempt_count: 0,
    last_error: null,
    created_at: "2026-08-28T00:00:00.000Z",
    next_attempt_at: "2026-08-28T00:00:00.000Z",
    server_seller_id: null,
    settled_at: null,
    needs_review_at: null,
    needs_review_code: null,
    owner_tenant_id: "tenant-secret-must-not-show",
    owner_user_id: "user-secret-must-not-show",
    ...over,
  };
}

const CREATED_NO_GRADE: CreateLocalSellerResult = { kind: "created", seller: localSeller({}) };
const CREATED_WITH_GRADE: CreateLocalSellerResult = {
  kind: "created",
  seller: localSeller({ grade: "B" }),
};
const REFUSED: CreateLocalSellerResult = { kind: "refused", refusal: { kind: "no_code" } };

/** The card as the sheet draws it: headline, then every line, then the button. */
function drawn(notice: LocalSellerCreateNotice): string {
  return [notice.headline, ...notice.lines, notice.action?.label ?? ""].join("\n");
}

/**
 * The render under test, with the break wrappers INSIDE it so a damaged card is
 * this script's doing and never `src/master`'s.
 *
 *   collapse — a `never_provisioned` device (held 0) is rendered as `exhausted`,
 *              the FALSE-SENTENCE the design forbids. C4's direction cell reddens.
 *   leak     — the reservation TOKEN, a bearer secret, is appended to a created
 *              card. C1's no-leak cell reddens.
 */
function render(result: CreateLocalSellerResult, held: number): LocalSellerCreateNotice {
  if (BREAK === "collapse" && result.kind === "refused") {
    return localSellerCreateNotice(result, Math.max(1, held));
  }
  if (BREAK === "leak" && result.kind === "created") {
    const real = localSellerCreateNotice(result, held);
    return { ...real, lines: [...real.lines, result.seller.reservation_token] };
  }
  return localSellerCreateNotice(result, held);
}

const HAS_THAI = /[฀-๿]/;
/** A uuid, a JSON delimiter, or an HTTP status shape — none belongs on this card. */
const DIAGNOSTIC = /[0-9a-f]{8}-[0-9a-f]{4}|[{}"]|\b[45]\d\d\b/;

/** The private values that must never reach the card, from the fixture above. */
const SECRETS = [
  "local-uuid-must-not-show",
  "tok-secret-must-not-show",
  "1234567890123-must-not-show",
  "addr-secret-must-not-show",
  "veh-secret-must-not-show",
  "tenant-secret-must-not-show",
  "user-secret-must-not-show",
];

function c1Created(): void {
  header("C1 a seller written locally, with no grade");
  const notice = render(CREATED_NO_GRADE, 5);
  const text = drawn(notice);
  check("C1: tone is created", notice.tone === "created", notice.tone);
  check("C1: the reserved code is shown (it goes on the shop's paper)", text.includes("S007"));
  check("C1: the seller's name is shown", text.includes("ผู้ขายพิสูจน์"));
  check(
    "C1: it PROMISES the seller will be sent — the queue makes that true",
    text.includes("จะส่งเข้าระบบให้อัตโนมัติ"),
  );
  check(
    "C1: it warns the seller has no grade so its bill will wait for the office",
    text.includes("ยังไม่ได้จัดเกรด"),
  );
  check(
    "C1: the one action is the pick, with its own label",
    notice.action?.kind === "pick" && notice.action.label === "เลือกผู้ขายรายนี้",
    JSON.stringify(notice.action),
  );
  const leaked = SECRETS.filter((s) => text.includes(s));
  check(
    "C1: no private value off the seller reaches the card — not the id, token, id number, address, plate or owner",
    leaked.length === 0,
    leaked.length === 0 ? "clean" : `LEAKED: ${leaked.join(", ")}`,
  );
  check("C1: no diagnostic shape (uuid, JSON, status) on the card", !DIAGNOSTIC.test(text), text);
  check("C1: the card renders Thai — without this every absence above is vacuous", HAS_THAI.test(text));
}

function c2GradeDerived(): void {
  header("C2 the grade warning is DERIVED from the grade, not fixed");
  const notice = render(CREATED_WITH_GRADE, 5);
  const text = drawn(notice);
  check(
    "C2: a seller WITH a grade is NOT told its bill waits for a grade",
    !text.includes("ยังไม่ได้จัดเกรด"),
  );
  // CONTROL: without this the absence above is satisfied by any empty render.
  check(
    "C2: CONTROL — the name and code are still shown, so C2 measures the grade line and not an empty card",
    text.includes("ผู้ขายพิสูจน์") && text.includes("S007"),
  );
}

function c3Exhausted(): void {
  header("C3 refused with codes once held but now spent — EXHAUSTED");
  const notice = render(REFUSED, 5);
  const text = drawn(notice);
  check("C3: tone is blocked", notice.tone === "blocked", notice.tone);
  check("C3: no button — nothing on this sheet fixes it", notice.action === null);
  check("C3: it names being USED UP", text.includes("หมด"));
  check(
    "C3: it does NOT claim the device never received a quota",
    !text.includes("ยังไม่เคยรับ"),
  );
  check(
    "C3: it names what is still possible — a bill against an existing seller",
    text.includes("ผู้ขายที่มีอยู่"),
  );
  // CONTROL: the ban on a passive-refill promise is not vacuous — `low`
  // legitimately carries จะเติมเอง, and exhausted must not.
  check("C3: it PROMISES no passive refill (no จะเติมเอง)", !text.includes("จะเติมเอง"));
  check(
    "C3: CONTROL — reserveLevelNotice(low) DOES carry จะเติมเอง, so the ban above is real",
    reserveLevelNotice("low", 3).lines.join("\n").includes("จะเติมเอง"),
  );
  check("C3: renders Thai", HAS_THAI.test(text));
}

function c4NeverProvisioned(): void {
  header("C4 refused on a device that has NEVER received a quota — NEVER_PROVISIONED");
  const notice = render(REFUSED, 0);
  const text = drawn(notice);
  check("C4: tone is blocked", notice.tone === "blocked", notice.tone);
  check("C4: it names NEVER HAVING RECEIVED a quota", text.includes("ยังไม่เคยรับ"));
  check("C4: it does NOT say the codes were used up (หมด)", !text.includes("หมด"));
  check("C4: renders Thai", HAS_THAI.test(text));
}

function c5ByCause(): void {
  header("C5 the two refusals are DIFFERENT — the cause (held) decides, by direction");
  const exhausted = drawn(render(REFUSED, 5));
  const neverProv = drawn(render(REFUSED, 0));
  check(
    "C5: exhausted and never_provisioned are different whole cards — the same refusal is not one sentence over two causes",
    exhausted !== neverProv,
  );
  check(
    "C5: each names its own state and not the other's (the direction)",
    exhausted.includes("หมด") &&
      !exhausted.includes("ยังไม่เคยรับ") &&
      neverProv.includes("ยังไม่เคยรับ") &&
      !neverProv.includes("หมด"),
  );
}

function c6WordingIsC4(): void {
  header("C6 the refusal wording is c4's own — reserveNotice, not a second copy");
  const exhausted = render(REFUSED, 5).lines.join("\n");
  const neverProv = render(REFUSED, 0).lines.join("\n");
  check(
    "C6: the exhausted lines EQUAL reserveLevelNotice('exhausted', 0) — one account, not two that drift",
    exhausted === reserveLevelNotice("exhausted", 0).lines.join("\n"),
  );
  check(
    "C6: the never_provisioned lines EQUAL reserveLevelNotice('never_provisioned', 0)",
    neverProv === reserveLevelNotice("never_provisioned", 0).lines.join("\n"),
  );
}

async function main(): Promise<number> {
  console.log("PROVE LOCAL SELLER CREATE — the confirmation, and the two refusals by cause");
  if (BREAK !== "") {
    console.log("");
    console.log(`  *** NEGATIVE CONTROL ACTIVE: --break=${BREAK} ***`);
    console.log("      The render is damaged ON PURPOSE by this script. A cell that stays green");
    console.log("      here is a cell that is not measuring what it claims.");
  }

  c1Created();
  c2GradeDerived();
  c3Exhausted();
  c4NeverProvisioned();
  c5ByCause();
  c6WordingIsC4();

  console.log("");
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  return failures === 0 ? 0 : 1;
}

/*
 * THE COMPILE CELL, run by hand and quoted in the phase report because a proof
 * cannot observe its own compilation. `localSellerCreateNotice` switches over
 * `CreateLocalSellerResult` and its refusal union with `never` arms, so a third
 * result member or a second refusal kind is a COMPILE ERROR at that switch —
 * `npm run typecheck` fails — rather than a card that renders nothing.
 */
const exitCode = await main().catch((err: unknown) => {
  console.log("");
  console.log(`  [FAIL] the run died: ${err instanceof Error ? err.message : String(err)}`);
  return 1;
});
console.log(`LOCALSELLERCREATE_EXIT=${String(exitCode)}`);
process.exitCode = exitCode === 0 ? 0 : 1;
