/**
 * M1 (ADVISOR-DECIDED 2026-10-24): THE LINE'S ARITHMETIC, PHONE HALF OF THE PARITY PROOF.
 *
 *   npm run prove:linerules
 *
 * Reads the SAME file the server's scripts/prove_line_rules.py reads, golden/line_rules_vectors.json
 * (hand-worked figures: every rounding rule, kg and percent deductions on and around the gram's tie,
 * piece and lump pricing, every refusal by its code), and runs every vector through
 * src/money/lineRules.ts computeLine -- the function the cart previews a line with. The server half
 * runs the same vectors through app/money_rules.py and Postgres's line_amount_rounded, so the phone's
 * preview equals the stored figure or one of the two suites is red. One perturbed figure reddens both;
 * the disproof is recorded in PROJECT_STATUS.
 *
 *   R1  the phone's rule lists equal the file's header and the server's lists, member by member (the
 *       server's are read from app/money_rules.py's SOURCE text, since this program cannot import Python).
 *   R2  every rounding rule is exercised by a passing vector.
 *   G1  every vector, value against value, refusals by code.
 *
 * main() prints `LINERULES_EXIT=<n>`; its ABSENCE is the signal.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  computeLine,
  DEDUCTION_SETTINGS,
  LINE_DEDUCTION_MODES,
  PRICING_BASES,
  ROUNDING_RULES,
} from "../money/lineRules.js";

interface Vector {
  id: string;
  in: {
    gross: string; tare: string; unit_price: string; basis: string; rule: string; mode: string;
    deduction_pct?: string; deduction_weight?: string; quantity?: string;
  };
  out?: { deduction_weight: string; net_weight: string; quantity: string; amount: string };
  error?: string;
}

let failures = 0;
let passes = 0;
function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  [${ok ? "OK  " : "FAIL"}] ${label}${detail ? ` — ${detail}` : ""}`);
  if (ok) passes += 1;
  else failures += 1;
}

/** The members of a Python `NAME: ... = ("a", "b", ...)` tuple, read from source text. */
function pyTuple(src: string, name: string): string[] {
  const m = new RegExp(`^${name}[^=]*=\\s*\\(([^)]*)\\)`, "m").exec(src);
  if (m === null) return [];
  return [...(m[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1] ?? "");
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && new Set(a).size === a.length && a.every((x) => b.includes(x));

function main(): number {
  const root = join(process.cwd(), "..");
  const file = join(root, "golden", "line_rules_vectors.json");
  const data = JSON.parse(readFileSync(file, "utf8")) as { rounding_rules: string[]; vectors: Vector[] };
  console.log(`  ${data.vectors.length} vectors from golden/line_rules_vectors.json`);
  check("E0 the vector file holds vectors", data.vectors.length > 0);

  console.log("\nR1 / R2 -- one list");
  const py = readFileSync(join(root, "server", "app", "money_rules.py"), "utf8");
  check("R1 rounding rules: phone = file header = server", sameSet(ROUNDING_RULES, data.rounding_rules)
    && sameSet(ROUNDING_RULES, pyTuple(py, "ROUNDING_RULES")), JSON.stringify(pyTuple(py, "ROUNDING_RULES")));
  check("R1 deduction settings: phone = server", sameSet(DEDUCTION_SETTINGS, pyTuple(py, "DEDUCTION_SETTINGS")));
  check("R1 line deduction modes: phone = server", sameSet(LINE_DEDUCTION_MODES, pyTuple(py, "LINE_DEDUCTION_MODES")));
  check("R1 pricing bases: phone = server", sameSet(PRICING_BASES, pyTuple(py, "PRICING_BASES")));
  const used = new Set(data.vectors.filter((v) => v.out !== undefined).map((v) => v.in.rule));
  check("R2 every rounding rule is exercised by a passing vector", ROUNDING_RULES.every((r) => used.has(r)));

  console.log("\nG1 -- src/money/lineRules.ts computeLine, every vector");
  for (const v of data.vectors) {
    const r = computeLine({
      gross: v.in.gross, tare: v.in.tare, unitPrice: v.in.unit_price, basis: v.in.basis, rule: v.in.rule,
      mode: v.in.mode, deductionPct: v.in.deduction_pct ?? null, deductionWeight: v.in.deduction_weight ?? null,
      quantity: v.in.quantity ?? null,
    });
    const got = r.ok
      ? { deduction_weight: r.value.deductionWeight, net_weight: r.value.netWeight, quantity: r.value.quantity, amount: r.value.amount }
      : { error: r.code };
    const want = v.out !== undefined ? v.out : { error: v.error };
    const ok = JSON.stringify(got) === JSON.stringify(want);
    check(`G1 ${v.id}`, ok, ok ? JSON.stringify(got) : `got ${JSON.stringify(got)} WANT ${JSON.stringify(want)}`);
  }

  console.log(`\n  passes=${passes}  failures=${failures}`);
  return failures === 0 ? 0 : 1;
}

const rc = main();
console.log(`LINERULES_EXIT=${rc}`);
process.exitCode = rc;
