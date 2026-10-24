"""M1 (ADVISOR-DECIDED 2026-10-24): THE LINE'S ARITHMETIC, SERVER HALF OF THE PARITY PROOF.

    uv run python scripts/prove_line_rules.py

ONE DATA FILE, golden/line_rules_vectors.json, holds every vector -- every rounding rule, kg and percent
deductions on and around the gram's tie, piece and lump pricing, and every refusal by its code. Each
figure in it was worked by hand from the rule. This proof runs EVERY vector through:
  G1  app/money_rules.compute_line (what POST /bills stores), value against value, and every refusal by
      its code;
  G2  Postgres's line_amount_rounded(quantity, unit_price, rule) -- the function migration 0027's
      ck_items_amount holds every recorded line to -- on an empty scratch built at head;
and the phone's `npm run prove:linerules` runs the SAME file through src/money/lineRules.ts. One
perturbed figure in the file therefore reddens both suites; that disproof is recorded in
PROJECT_STATUS.

  R1  THE RULE LIST IS ONE LIST in four places that cannot import each other: migration 0027's
      ROUNDING_RULES, app/money_rules.py, master.py's RoundingRule Literal, and the vector file's
      header -- compared MEMBER BY MEMBER, never by count. Likewise the deduction settings and the
      pricing bases (migration, money_rules, master Literals).
  R2  every rule on the list is exercised by at least one vector (a rule nobody tests is a rule
      nobody watched round).
"""
from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import sys
import typing
from decimal import Decimal
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER_DIR))
sys.path.insert(0, str(SERVER_DIR / "scripts"))
os.chdir(SERVER_DIR)

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import asyncpg  # noqa: E402

from lane import scratch_name  # noqa: E402

VECTORS = SERVER_DIR.parent / "golden" / "line_rules_vectors.json"
SCRATCH = scratch_name("recycle_line_rules")

failures: list[str] = []
passes: list[str] = []


def check(cond: bool, claim: str) -> None:
    print(f"  [{'OK  ' if cond else 'RED '}] {claim}")
    (passes if cond else failures).append(claim)


def dec(v: str | None) -> Decimal | None:
    return None if v is None else Decimal(v)


def migration_module():
    spec = importlib.util.spec_from_file_location("m0027", SERVER_DIR / "migrations" / "versions" / "0027_money_rules.py")
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


async def main() -> int:
    from app import master, money_rules
    from app.money_rules import LineIn, LineRuleError, compute_line

    data = json.loads(VECTORS.read_text(encoding="utf-8"))
    vectors = data["vectors"]
    print(f"  {len(vectors)} vectors from {VECTORS.relative_to(SERVER_DIR.parent)}")
    check(len(vectors) > 0, "E0 the vector file holds vectors")

    print("\nR1 / R2 -- one list, four places")
    mig = migration_module()
    lit = lambda t: tuple(typing.get_args(t))  # noqa: E731
    for label, places in (
        ("rounding rules", [mig.ROUNDING_RULES, money_rules.ROUNDING_RULES, lit(master.RoundingRule),
                            tuple(data["rounding_rules"])]),
        ("deduction settings", [mig.DEDUCTION_SETTINGS, money_rules.DEDUCTION_SETTINGS, lit(master.DeductionSetting)]),
        ("line deduction modes", [mig.LINE_DEDUCTION_MODES, money_rules.LINE_DEDUCTION_MODES]),
        ("pricing bases", [mig.PRICING_BASES, money_rules.PRICING_BASES, lit(master.PricingBasis)]),
    ):
        first = set(places[0])
        check(all(set(p) == first for p in places) and len(first) == len(places[0]),
              f"R1 {label}: the same members in every place {sorted(first)}")
    used = {v["in"]["rule"] for v in vectors if "out" in v}
    check(set(money_rules.ROUNDING_RULES) <= used,
          f"R2 every rounding rule is exercised by a passing vector (missing: {sorted(set(money_rules.ROUNDING_RULES) - used)})")

    print("\nG1 -- app/money_rules.compute_line, every vector")
    for v in vectors:
        i = v["in"]
        line = LineIn(gross_weight=Decimal(i["gross"]), tare_weight=Decimal(i["tare"]),
                      unit_price=Decimal(i["unit_price"]), pricing_basis=i["basis"], rounding_rule=i["rule"],
                      deduction_mode=i["mode"], deduction_pct=dec(i.get("deduction_pct")),
                      deduction_weight=dec(i.get("deduction_weight")), quantity=dec(i.get("quantity")))
        try:
            out = compute_line(line)
            got = {"deduction_weight": str(out.deduction_weight), "net_weight": str(out.net_weight),
                   "quantity": str(out.quantity), "amount": str(out.amount)}
        except LineRuleError as e:
            got = {"error": e.code}
        want = v["out"] if "out" in v else {"error": v["error"]}
        check(got == want, f"G1 {v['id']} -> {got}" + ("" if got == want else f" WANT {want}"))

    print("\nG2 -- Postgres line_amount_rounded, every passing vector (empty scratch at head)")
    import prove_shifts
    await prove_shifts.build_empty_scratch(SCRATCH, "head")
    u = prove_shifts._APP_URL
    c = await asyncpg.connect(host=u.host, port=u.port, user="postgres", password="postgres", database=SCRATCH)
    try:
        rev = await c.fetchval("SELECT version_num FROM alembic_version")
        check(rev is not None and rev >= "0027", f"G2 the scratch is at 0027 or later ({rev})")
        for v in vectors:
            if "out" not in v:
                continue
            got = await c.fetchval("SELECT public.line_amount_rounded($1::numeric, $2::numeric, $3)::text",
                                   v["out"]["quantity"], v["in"]["unit_price"], v["in"]["rule"])
            want = v["out"]["amount"]
            check(got is not None and Decimal(got) == Decimal(want),
                  f"G2 {v['id']} -> {got}" + ("" if got is not None and Decimal(got) == Decimal(want) else f" WANT {want}"))
        unknown = await c.fetchval("SELECT public.line_amount_rounded(1, 1, 'half_even_0.01') IS NULL")
        check(bool(unknown), "G2 a rule off the list yields NULL (ck_items_amount's IS TRUE turns that into a refusal)")
    finally:
        await c.close()
        c2 = await asyncpg.connect(host=u.host, port=u.port, user="postgres", password="postgres", database="postgres")
        try:
            await c2.execute(f'DROP DATABASE IF EXISTS "{SCRATCH}" WITH (FORCE)')
        finally:
            await c2.close()

    print("\n" + "=" * 72)
    print(f"  passes={len(passes)}  failures={len(failures)}")
    for f in failures:
        print(f"    RED: {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    rc = asyncio.run(main())
    print(f"PROVE_LINE_RULES_EXIT={rc}")
    sys.exit(rc)
