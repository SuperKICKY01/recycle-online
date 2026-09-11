/**
 * The PromptPay payload proof (STRUCTURE.md 2.4, the counter unit, commit 3).
 *
 * Run: npm run prove:promptpay
 *
 * PURE. No server, no database, no filesystem, no clock, no randomness — so there
 * is no fixture to reseed and running it twice in a row is trivially identical
 * (proof-must-run-twice: stated, not implied). Every cell is over the pure function
 * in @recycle/promptpay.
 *
 * WHAT THIS PROVES, AND WHAT IT DOES NOT.
 *   - The CRC ALGORITHM is VERIFIED against its own published check value:
 *     CRC-16/CCITT-FALSE (a.k.a. CRC-16/IBM-3740), check 0x29B1 over the ASCII
 *     input "123456789". Reference: the CRC RevEng catalogue of parametrised CRC
 *     algorithms (Greg Cook), width=16 poly=0x1021 init=0xffff refin=false
 *     refout=false xorout=0x0000 check=0x29b1. This is the ONE expectation that
 *     comes from OUTSIDE this repository.
 *   - The payload is SELF-CONSISTENT: an INDEPENDENT parser (written here, never
 *     imported from the package) walks it, every declared length equals its
 *     value's length, the whole string is consumed, and the CRC recomputes with an
 *     INDEPENDENT CRC (table-driven here; the package is bitwise — the same spec
 *     reached twice, a-checker-must-not-share-the-code-it-checks).
 *   - SELF-CONSISTENT IS NOT CORRECT. A payload that parses cleanly by this
 *     script's own parser has not been confirmed against a real banking
 *     application. The payload FORMAT (tag numbers, the PromptPay AID, the
 *     mobile-proxy shape, that the CRC covers "...6304") is DERIVED from the
 *     EMVCo / Bank of Thailand QR standard as understood here, NOT from a
 *     bank-issued vector. The last layer is a human scanning a sample.
 *
 * ON OUTPUT: ASCII throughout (the payload is all digits and uppercase letters).
 * Every assertion compares JS strings.
 */
import { promptPayPhonePayload, type PromptPayResult } from "@recycle/promptpay";

// a-default-exit-code-is-a-default-verdict: preset the verdict to RED at entry, so
// a throw or a drained event loop before the final tally exits non-zero with no
// green to contradict the absent exit line. Cleared only by a completed run below.
process.exitCode = 1;

let failures = 0;
let passes = 0;

function check(name: string, cond: boolean, detail = ""): void {
  console.log(`  [${cond ? "OK  " : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
  if (cond) passes += 1;
  else failures += 1;
}
function header(t: string): void {
  console.log("\n=== " + t + " ===");
}

// ---------------------------------------------------------------------------
// INDEPENDENT INSTRUMENTS — none imported from the package under test.
// ---------------------------------------------------------------------------

/**
 * CRC-16/CCITT-FALSE, TABLE-DRIVEN. A second implementation of the same spec
 * (poly 0x1021, init 0xFFFF, no reflection, no final XOR), reached the other way
 * from the package's bitwise loop. If both are correct they agree — which is the
 * point: importing the package's CRC would only prove the code equals itself.
 */
function crcRef(input: string): string {
  const table: number[] = [];
  for (let n = 0; n < 256; n += 1) {
    let c = (n << 8) & 0xffff;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 0x8000) !== 0 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    }
    table[n] = c;
  }
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    const idx = ((crc >> 8) ^ (input.charCodeAt(i) & 0xff)) & 0xff;
    const t = table[idx];
    if (t === undefined) throw new Error("crc table gap"); // unreachable: idx in 0..255
    crc = ((crc << 8) ^ t) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

interface TlvField {
  readonly id: string;
  readonly len: number;
  readonly value: string;
  readonly start: number;
}
type ParseResult =
  | { readonly ok: true; readonly fields: readonly TlvField[] }
  | { readonly ok: false; readonly error: string; readonly pos: number };

/**
 * An INDEPENDENT EMVCo TLV walk: read id(2), length(2), value(length), repeat,
 * and require the whole string to be consumed exactly. Reports the position of the
 * first structural fault. Not imported from the package.
 */
function parseTlv(s: string): ParseResult {
  const fields: TlvField[] = [];
  let i = 0;
  while (i < s.length) {
    if (i + 4 > s.length) return { ok: false, error: "truncated tag/length header", pos: i };
    const id = s.slice(i, i + 2);
    const lenStr = s.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(lenStr)) return { ok: false, error: "non-numeric length", pos: i + 2 };
    const len = Number(lenStr);
    const valStart = i + 4;
    if (valStart + len > s.length) return { ok: false, error: "declared length exceeds remainder", pos: i + 2 };
    fields.push({ id, len, value: s.slice(valStart, valStart + len), start: i });
    i = valStart + len;
  }
  return { ok: true, fields };
}

function fieldValue(p: ParseResult, id: string): string | null {
  if (!p.ok) return null;
  const f = p.fields.find((x) => x.id === id);
  return f ? f.value : null;
}

/** Every declared length equals the length of the value it introduces. Vacuously
 *  true on an empty field list, so callers pair it with a consumed/parsed check. */
function lengthsConsistent(p: ParseResult): boolean {
  return p.ok && p.fields.every((f) => f.value.length === f.len);
}

/**
 * A payload-fragment scanner for the no-leak assertion. Returns the first fragment
 * of a real payload it finds, or null. Given a positive control below (it MUST
 * find these in a real payload) so a null over a refusal is a measurement, not a
 * scanner that never looked.
 */
const PAYLOAD_FRAGMENTS: readonly string[] = [
  "payload", // the success key itself
  "A000000677010111", // the PromptPay AID
  "6304", // the CRC tag+length
  "5802TH", // country
  "5303764", // currency
  "0066", // the mobile-proxy prefix
  "000201", // the payload format indicator
];
function leakScan(s: string): string | null {
  for (const frag of PAYLOAD_FRAGMENTS) if (s.includes(frag)) return frag;
  return null;
}

// The canonical sample the round trip is built on. A clearly-marked TEST number,
// never a seed row's phone (no real payee is scanned by this proof).
const SAMPLE_PHONE = "0812345678";
const SAMPLE_AMOUNT = "195.00";
// The mobile proxy DERIVED here from the spec (drop the leading 0, prepend "0066"),
// independent of the package's own mobileProxy — the expected value comes from the
// specification, not from the function under test (tdd: an independent source).
const EXPECTED_PROXY = "0066" + SAMPLE_PHONE.slice(1);
const PROMPTPAY_AID = "A000000677010111";

function payloadOf(phone: string, amount: string): string {
  const r = promptPayPhonePayload({ phone, amount });
  if (!r.ok) throw new Error(`expected a payload for ${phone}/${amount}, got refusal ${r.code}`);
  return r.payload;
}

// ---------------------------------------------------------------------------
// A — the CRC algorithm, against its published check value (the only external
//     expectation), plus a sensitivity control so the instrument is not a constant.
// ---------------------------------------------------------------------------
function aCrcAlgorithm(): void {
  header("A the CRC algorithm — VERIFIED against CRC-16/CCITT-FALSE published check 0x29B1");
  check('A1: crcRef("123456789") === "29B1" (CRC RevEng catalogue check value)',
    crcRef("123456789") === "29B1", crcRef("123456789"));
  // Sensitivity: a one-character change moves the CRC, so A1 is not a constant.
  check('A2 control: one-char change moves the CRC ("123456789" vs "123456780")',
    crcRef("123456789") !== crcRef("123456780"));
  check('A2 control: the empty string CRCs to the init value FFFF (no bytes folded)',
    crcRef("") === "FFFF");
}

// ---------------------------------------------------------------------------
// B — the structural round trip: parse what the function emitted, lengths match,
//     fully consumed, CRC recomputes, the payee proxy and amount are what the spec
//     says. Negative controls: a corrupted length is caught and named; a one-char
//     body change breaks the CRC.
// ---------------------------------------------------------------------------
function bRoundTrip(): void {
  header("B the structural round trip — SELF-CONSISTENT (a different claim from CORRECT)");
  const payload = payloadOf(SAMPLE_PHONE, SAMPLE_AMOUNT);
  const p = parseTlv(payload);
  check("B1: the emitted payload parses and is fully consumed (nothing left over)", p.ok, p.ok ? "" : `${p.error} @${String(p.pos)}`);
  check("B2: every declared length equals the length of its value", lengthsConsistent(p));

  // B3: the expected tags in ascending order, ending at the CRC.
  const ids = p.ok ? p.fields.map((f) => f.id).join(",") : "";
  check("B3: tags are 00,01,29,53,54,58,63 in order", ids === "00,01,29,53,54,58,63", ids);
  check("B3: PoI is dynamic (tag 01 = 12) because an amount is present", fieldValue(p, "01") === "12");
  check("B3: currency is THB numeric 764 (tag 53)", fieldValue(p, "53") === "764");
  check("B3: country is TH (tag 58)", fieldValue(p, "58") === "TH");
  check("B3: format indicator is 01 (tag 00)", fieldValue(p, "00") === "01");

  // B4: the payee proxy — the money-critical field — matches the spec-derived value.
  const tag29 = fieldValue(p, "29");
  const inner = tag29 === null ? { ok: false as const, error: "no tag 29", pos: 0 } : parseTlv(tag29);
  check("B4: tag 29 (merchant account info) parses and is fully consumed", inner.ok);
  check("B4: tag 29 sub-00 is the PromptPay AID A000000677010111", fieldValue(inner, "00") === PROMPTPAY_AID, String(fieldValue(inner, "00")));
  check(`B4: tag 29 sub-01 is the mobile proxy ${EXPECTED_PROXY} (0066 + national number)`,
    fieldValue(inner, "01") === EXPECTED_PROXY, String(fieldValue(inner, "01")));
  check("B4: the mobile proxy is 13 digits", (fieldValue(inner, "01") ?? "").length === 13);

  // B5: the amount is the ledger string, verbatim — never recomputed, never grouped.
  check(`B5: tag 54 is the amount verbatim (${SAMPLE_AMOUNT})`, fieldValue(p, "54") === SAMPLE_AMOUNT);

  // B6: the CRC recomputes with the INDEPENDENT crcRef over the body incl. "6304".
  const body = payload.slice(0, -4);
  const emittedCrc = payload.slice(-4);
  check("B6: the emitted CRC equals an independent recompute over the body incl. 6304",
    crcRef(body) === emittedCrc, `emitted=${emittedCrc} recomputed=${crcRef(body)}`);
  check("B6: tag 63 (the CRC field) carries exactly those last four characters", fieldValue(p, "63") === emittedCrc);

  // --- negative controls (each proves the round-trip checks are not vacuous) ---
  // A corrupted length must be caught and its position named.
  const corrupt = payload.replace("5802TH", "5899TH");
  check("B-neg1 control: the corruption actually changed the string", corrupt !== payload);
  const pc = parseTlv(corrupt);
  check("B-neg1: a corrupted length declaration is REJECTED by the parser, position named",
    !pc.ok && typeof (pc as { pos: number }).pos === "number",
    pc.ok ? "parser accepted a corrupt payload" : `${pc.error} @${String(pc.pos)}`);

  // A one-character change to the body must break the CRC (P3 negative control).
  const altered = payload.replace("195.00", "195.01");
  check("B-neg2 control: the one-char body change actually changed the string", altered !== payload);
  const alteredBody = altered.slice(0, -4);
  check("B-neg2: a one-char body change moves the recomputed CRC away from the original",
    crcRef(alteredBody) !== emittedCrc);
  check("B-neg2: the altered payload's embedded CRC no longer matches a recompute (rejected)",
    crcRef(alteredBody) !== altered.slice(-4));
}

// ---------------------------------------------------------------------------
// C — the no-separator property: a four-digit amount carries no thousands comma.
// ---------------------------------------------------------------------------
function cNoSeparator(): void {
  header("C the amount is never grouped — a four-digit amount has no thousands separator");
  const payload = payloadOf(SAMPLE_PHONE, "1144.00");
  check("C1: the four-digit amount payload contains no comma", !payload.includes(","));
  check("C1: tag 54 is exactly 1144.00 (not 1,144.00)", fieldValue(parseTlv(payload), "54") === "1144.00");
  const payload1 = payloadOf(SAMPLE_PHONE, "1.00");
  check("C2: the smallest sample (1.00) round-trips as tag 54 = 1.00", fieldValue(parseTlv(payload1), "54") === "1.00");
}

// ---------------------------------------------------------------------------
// D — the refusals: each a distinct code, each with a positive sibling, each
//     carrying NO payload fragment (the no-leak scan, controlled below).
// ---------------------------------------------------------------------------
function refused(r: PromptPayResult): { code: string; noLeak: boolean; noPayloadKey: boolean } {
  if (r.ok) return { code: "(a payload was returned)", noLeak: false, noPayloadKey: false };
  return { code: r.code, noLeak: leakScan(JSON.stringify(r)) === null, noPayloadKey: !("payload" in r) };
}

function dRefusals(): void {
  header("D the refusals — distinct codes, positive siblings, and no payload fragment leaks");

  // The scanner's positive control: it MUST find fragments in a real payload, or a
  // null over a refusal proves nothing (a-check-that-never-went-red).
  const okResult = promptPayPhonePayload({ phone: SAMPLE_PHONE, amount: SAMPLE_AMOUNT });
  check("D0 control: a VALID request returns ok with a payload (the presence sibling)", okResult.ok === true);
  check("D0 control: the leak scanner DOES find a fragment in a real payload",
    leakScan(JSON.stringify(okResult)) !== null, String(leakScan(JSON.stringify(okResult))));

  // payee_missing — null / undefined / empty phone, with a valid amount.
  for (const phone of [null, undefined, ""]) {
    const r = refused(promptPayPhonePayload({ phone, amount: SAMPLE_AMOUNT }));
    check(`D1 payee_missing for phone=${JSON.stringify(phone)}`, r.code === "payee_missing" && r.noPayloadKey && r.noLeak, r.code);
  }

  // bad_phone — a phone was given but is not a canonical Thai mobile number.
  for (const phone of ["081-234-5678", "+66812345678", "0812345", "081234567", "08123456789", "812345678", "0812345678 ", " 0812345678", "08a2345678"]) {
    const r = refused(promptPayPhonePayload({ phone, amount: SAMPLE_AMOUNT }));
    check(`D2 bad_phone for phone=${JSON.stringify(phone)} (refused, not stripped)`, r.code === "bad_phone" && r.noPayloadKey && r.noLeak, r.code);
  }

  // bad_amount_shape — missing, grouped, wrong scale, non-numeric, leading zero.
  for (const amount of [null, undefined, "", "1,144.00", "195", "195.0", "195.000", "abc", "0195.00", "195.00 ", ".00", "-1.00", "195,00"]) {
    const r = refused(promptPayPhonePayload({ phone: SAMPLE_PHONE, amount }));
    check(`D3 bad_amount_shape for amount=${JSON.stringify(amount)} (refused, not cleaned)`, r.code === "bad_amount_shape" && r.noPayloadKey && r.noLeak, r.code);
  }

  // amount_not_positive — the right shape, but zero.
  const zero = refused(promptPayPhonePayload({ phone: SAMPLE_PHONE, amount: "0.00" }));
  check("D4 amount_not_positive for amount=0.00", zero.code === "amount_not_positive" && zero.noPayloadKey && zero.noLeak, zero.code);
  // Positive sibling: the smallest positive amount is accepted.
  check("D4 sibling: amount=0.01 (smallest positive) is ACCEPTED",
    promptPayPhonePayload({ phone: SAMPLE_PHONE, amount: "0.01" }).ok === true);

  // Precedence sibling: with BOTH a bad phone and a bad amount, the phone is
  // reported first (a deterministic order, so a caller can rely on it).
  const both = promptPayPhonePayload({ phone: "nope", amount: "abc" });
  check("D5: a bad phone AND a bad amount reports bad_phone first (deterministic order)",
    both.ok === false && both.code === "bad_phone");
}

function main(): number {
  console.log("promptpay — the PromptPay QR payload (STRUCTURE.md 2.4, unit 4 commit 3)");
  console.log(`node ${process.version}`);
  console.log("PURE: no server, no fixture, no reseed — twice in a row is identical by construction.");

  aCrcAlgorithm();
  bRoundTrip();
  cNoSeparator();
  dRefusals();

  console.log("");
  console.log(`  passes=${String(passes)}  failures=${String(failures)}`);
  console.log(failures === 0 ? "ALL CELLS PASSED" : `FAILED — ${String(failures)} check(s)`);
  console.log("NOTE: the payload is SELF-CONSISTENT, not VERIFIED against a real bank. The CRC");
  console.log("      ALGORITHM is verified against its published check value (A1).");
  return failures === 0 ? 0 : 1;
}

const rc = main();
console.log(`PROVE_PROMPTPAY_EXIT=${String(rc)}`);
process.exitCode = rc;
