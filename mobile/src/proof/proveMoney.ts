/**
 * Phase 2c-2 proof: the client's decimal math, headless.
 *
 * The expected values in AGREE_WITH_SERVER were not written by hand. They were
 * produced by running the SERVER's own formula in Python:
 *
 *   net = (Decimal(g) - Decimal(t)).quantize(Decimal("0.001"), ROUND_HALF_UP)
 *   amt = (net * Decimal(p)).quantize(Decimal("0.01"), ROUND_HALF_UP)
 *
 * so this asserts device == server at the arithmetic level, before any HTTP is
 * involved. The server independently recomputes and rejects a mismatched total,
 * so any disagreement here becomes a bill that will not sync.
 *
 * Run: npm run prove:money
 */
import {
  lineAmount,
  netWeight,
  parsePrice,
  parseWeight,
  sumAmounts,
} from "../money/money.js";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

function header(title: string): void {
  console.log(`\n=== ${title} ===`);
}

/** gross, tare, price, expected net, expected amount — all from Python. */
const AGREE_WITH_SERVER: readonly [string, string, string, string, string][] = [
  ["10.005", "0.002", "15.00", "10.003", "150.05"],
  ["10.500", "0.500", "10.50", "10.000", "105.00"],
  ["0.300", "0.100", "1.00", "0.200", "0.20"],
  ["1.005", "0.000", "1.00", "1.005", "1.01"],
  ["10.003", "0.000", "15.00", "10.003", "150.05"],
  ["2.225", "0.000", "2.00", "2.225", "4.45"],
  ["99.999", "0.001", "0.07", "99.998", "7.00"],
  ["0.001", "0.000", "0.01", "0.001", "0.00"],
];

function caseAgreement(): void {
  header("M1: device arithmetic equals the server's, digit for digit");
  for (const [g, t, p, expNet, expAmt] of AGREE_WITH_SERVER) {
    const net = netWeight(g, t);
    if (!net.ok) {
      check(`${g} - ${t}`, false, `unexpected rejection: ${net.error}`);
      continue;
    }
    const amt = lineAmount(net.value, p);
    check(
      `gross ${g} tare ${t} @ ${p}`,
      net.value === expNet && amt === expAmt,
      `net=${net.value} (want ${expNet})  amount=${amt} (want ${expAmt})`,
    );
  }
}

function caseFloatTrap(): void {
  header("M2: the float trap never appears");
  const jsFloat = 0.1 + 0.2;
  console.log(`  for reference, JavaScript says 0.1 + 0.2 = ${String(jsFloat)}`);

  const net = netWeight("0.300", "0.100");
  const amt = net.ok ? lineAmount(net.value, "1.00") : "?";
  check("0.3 - 0.1 is exactly 0.200", net.ok && net.value === "0.200", `got ${net.ok ? net.value : net.error}`);
  check("its amount at 1.00 is exactly 0.20", amt === "0.20", `got ${amt}`);

  // The real question is not one case but whether any float artefact can reach
  // a string we store or send.
  const suspicious: string[] = [];
  for (const [g, t, p] of AGREE_WITH_SERVER) {
    const n = netWeight(g, t);
    if (!n.ok) continue;
    for (const s of [n.value, lineAmount(n.value, p)]) {
      if (/\d{6,}$/.test(s.replace(".", "")) || s.includes("e") || s.includes("E")) {
        suspicious.push(s);
      }
    }
  }
  check(
    "no long-tail or exponent artefacts in any produced string",
    suspicious.length === 0,
    suspicious.length === 0 ? "every value is a clean fixed-scale decimal" : suspicious.join(", "),
  );

  check("weights always carry exactly 3 decimals", parseWeight("10.5").ok && (parseWeight("10.5") as { value: string }).value === "10.500");
  check("prices always carry exactly 2 decimals", parsePrice("7").ok && (parsePrice("7") as { value: string }).value === "7.00");
}

function caseRounding(): void {
  header("M3: HALF_UP, not banker's rounding");
  // 10.003 x 15.00 = 150.045 exactly. HALF_UP -> 150.05, HALF_EVEN -> 150.04.
  const amt = lineAmount("10.003", "15.00");
  check(
    "150.045 rounds to 150.05 (HALF_EVEN would give 150.04)",
    amt === "150.05",
    `got ${amt}`,
  );
  check("1.005 x 1.00 -> 1.01", lineAmount("1.005", "1.00") === "1.01", lineAmount("1.005", "1.00"));
  check("0.001 x 0.01 -> 0.00", lineAmount("0.001", "0.01") === "0.00", lineAmount("0.001", "0.01"));
  check("single-line total equals the line amount", sumAmounts(["150.05"]) === "150.05");
}

function caseValidation(): void {
  header("M4: invalid input cannot become a bill");
  const rejects: [string, string][] = [
    ["", "empty"],
    ["   ", "empty"],
    ["abc", "not_a_number"],
    ["-1.5", "not_a_number"],
    ["1,5", "not_a_number"],
    ["1e3", "not_a_number"],
    ["1.2.3", "not_a_number"],
    ["10.0005", "too_many_decimals"],
    ["999999999999.000", "too_large"],
  ];
  for (const [input, expected] of rejects) {
    const r = parseWeight(input);
    check(
      `weight ${JSON.stringify(input)} rejected as ${expected}`,
      !r.ok && r.error === expected,
      r.ok ? `WRONGLY ACCEPTED as ${r.value}` : `error=${r.error}`,
    );
  }

  const accepts = ["0", "0.000", "10", "10.5", "10.500", "0.001"];
  for (const input of accepts) {
    const r = parseWeight(input);
    check(`weight ${JSON.stringify(input)} accepted`, r.ok, r.ok ? `-> ${r.value}` : `error=${r.error}`);
  }

  const negative = netWeight("1.000", "2.000");
  check(
    "tare greater than gross is rejected (net can never be negative)",
    !negative.ok && negative.error === "tare_exceeds_gross",
    negative.ok ? `WRONGLY ACCEPTED as ${negative.value}` : `error=${negative.error}`,
  );
  const zero = netWeight("1.000", "1.000");
  check(
    "tare equal to gross is allowed (server permits net = 0)",
    zero.ok && zero.value === "0.000",
    zero.ok ? zero.value : zero.error,
  );

  check("price 2.555 rejected: too many decimals", !parsePrice("2.555").ok);
  check("price 0 accepted", parsePrice("0").ok);
}

function main(): number {
  console.log("Phase 2c-2 — client decimal math, headless proof");
  console.log("decimal.js, ROUND_HALF_UP, strings only — no JS number touches money");

  caseAgreement();
  caseFloatTrap();
  caseRounding();
  caseValidation();

  console.log("");
  console.log(failures === 0 ? "ALL MONEY CASES PASSED" : `FAILED — ${failures} check(s)`);
  return failures === 0 ? 0 : 1;
}

const code = main();
console.log(`MONEY_EXIT=${code}`);
process.exitCode = code;
