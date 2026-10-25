"""M2's SCHEMA holds its own guarantees (migration 0029), on a scratch restored from dev and upgraded to head.

    uv run python scripts/prove_m2_schema.py                 (self-restores a scratch from a live dump)
    uv run python scripts/prove_m2_schema.py --break <name>  (DISPROOF: drop one constraint first)

No server: every cell is the DATABASE refusing or accepting a row, as the superuser inside a transaction that
is rolled back (nothing a cell writes survives), or a read of the catalogue. buddhist-method: what Postgres
stores, never what a route says.

  B1  THE BACKFILL: one purchase movement per purchase line (quantity = its quantity, else its net; value = its
      amount) and one reversal per line of a voided bill -- counted against the lines, not against a literal.
  B2  every movement marked recorded_by_migration is a purchase movement or its reversal (0029's and 0030's
      backfills), and there is at least one.
  P1  six new codes in the catalogue (22 in all), each granted to exactly the roles holding the code it mirrors.
  G1  APPEND-ONLY: recycle_app holds no UPDATE or DELETE on stock_movements, sale_bill_items or
      sale_receipt_allocations, and no DELETE on buyers, sale_bills, sale_receipts.
  R1  RLS ENABLE + FORCE + one tenant_isolation policy on every new table (7).
  K1  a sale line whose cost_amount is not round(quantity x cost_per_unit, 2) -> ck_sale_items_cost
  K2  a sale line whose amount is off its rule by one satang -> ck_sale_items_amount
  K3  a sale line whose net ignores its deduction -> ck_sale_items_net
  K4  a sale movement with a POSITIVE quantity -> ck_movements_shape
  K5  an adjustment with no reason -> ck_movements_shape
  K6  a second reversal of one movement -> uq_movements_reverses
  K7  a sale doc_no in the purchase shape (B-2569-1) -> ck_sale_bills_doc_no
  K8  a receipt of 0.00 -> ck_sale_receipts_amount
  K9  CONTROL: a well-formed sale bill, line, movement and receipt in one transaction are ACCEPTED.
  D0  precondition: the copy holds nothing else 0029's downgrade guard counts (sales, buyers, adjustments, ...).
  D1  an adjustment (a movement only the app holds) -> `downgrade 0028` REFUSES, head unchanged, FORCE kept.
  D2  a purchase movement written by the app (recorded_by_migration = false) -> `downgrade 0028` PROCEEDS: a
      purchase movement is derived from its line, whoever wrote it (gate _prove_all/20261025T095430Z refused here).
  D3  `upgrade head` rebuilds it: one equal purchase movement per purchase line again.

DISPROOFS: --break ck_sale_items_cost | ck_sale_items_amount | ck_sale_items_net | ck_sale_bills_doc_no |
           ck_sale_receipts_amount   (its K cell must redden; the control K9 stays green)
"""
from __future__ import annotations

import argparse
import asyncio
import os
import subprocess
import sys
import uuid
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import asyncpg  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from lane import scratch_name  # noqa: E402
from prove_money_rules import restore_scratch  # noqa: E402

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRATCH_DB = scratch_name("recycle_m2_schema_scratch")
SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000"
BREAKS = {
    "ck_sale_items_cost": "sale_bill_items", "ck_sale_items_amount": "sale_bill_items",
    "ck_sale_items_net": "sale_bill_items", "ck_sale_bills_doc_no": "sale_bills",
    "ck_sale_receipts_amount": "sale_receipts",
}
NEW_TABLES = ("buyers", "sale_doc_no_counters", "sale_bills", "sale_bill_items", "sale_receipts",
              "sale_receipt_allocations", "stock_movements")
MIRRORS = {"sales.create": "bills.create", "sales.read": "bills.read", "sales.void": "bills.void",
           "sales.receive": "payments.record", "buyers.write": "sellers.write", "stock.adjust": "master.write"}

failures: list[str] = []
passes: list[str] = []


def check(cond: bool, claim: str) -> None:
    print(f"  [{'OK  ' if cond else 'RED '}] {claim}")
    (passes if cond else failures).append(claim)


async def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--break", dest="brk", choices=sorted(BREAKS), default=None)
    args = ap.parse_args()
    live = make_url(os.environ["APP_DATABASE_URL"])
    if SCRATCH_DB == live.database:
        print("REFUSED: the scratch name equals the live database")
        return 2
    print(f"  restoring {SCRATCH_DB} from a dump of {live.database}...")
    restore_scratch(live.database, SCRATCH_DB)
    env = dict(os.environ)
    env["MIGRATION_DATABASE_URL"] = make_url(os.environ["MIGRATION_DATABASE_URL"]).set(database=SCRATCH_DB).render_as_string(
        hide_password=False)
    cp = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=SERVER_DIR, env=env, capture_output=True)
    c = await asyncpg.connect(host=live.host, port=live.port, user="postgres", password="postgres", database=SCRATCH_DB)
    try:
        rev = await c.fetchval("SELECT version_num FROM alembic_version")
        print(f"  scratch at {rev} (alembic exit {cp.returncode})")
        if cp.returncode != 0 or rev is None or rev < "0029":
            print("UNFIT: " + cp.stderr.decode("utf-8", "replace")[-800:])
            return 2
        if args.brk:
            await c.execute(f"ALTER TABLE {BREAKS[args.brk]} DROP CONSTRAINT {args.brk}")
            print(f"  DISPROOF: dropped {args.brk}")

        print("\n== B / P / G / R  what the migration left ==")
        lines = await c.fetchval("SELECT count(*) FROM purchase_bill_items")
        voided = await c.fetchval("SELECT count(*) FROM purchase_bill_items i JOIN purchase_bills b ON b.id = i.bill_id"
                                  " WHERE b.voided_at IS NOT NULL")
        ins = await c.fetchval("SELECT count(*) FROM stock_movements m JOIN purchase_bill_items i ON i.id = m.purchase_item_id"
                               " WHERE m.kind = 'purchase' AND m.quantity = coalesce(i.quantity, i.net_weight)"
                               " AND m.value = i.amount")
        outs = await c.fetchval("SELECT count(*) FROM stock_movements v JOIN stock_movements o ON o.id = v.reverses_movement_id"
                                " WHERE v.kind = 'void_purchase' AND v.quantity = -o.quantity AND v.value = -o.value")
        check(lines > 0 and ins == lines and outs == voided,
              f"B1 one equal purchase movement per line ({ins}/{lines}) and one exact reversal per voided line ({outs}/{voided})")
        # The reconstruction is only ever a purchase movement or its reversal; whatever the app writes later is not
        # marked. (Until 2026-10-25 this asserted total == lines + voided, which stops holding the moment the app
        # writes its own movements -- gate _prove_all/20261025T085702Z.)
        marked = dict(await c.fetch("SELECT kind, count(*) FROM stock_movements WHERE recorded_by_migration GROUP BY kind"))
        check(set(marked) <= {"purchase", "void_purchase"} and marked.get("purchase", 0) > 0,
              f"B2 movements marked recorded_by_migration are purchase/void_purchase only: {marked}")
        n = await c.fetchval("SELECT count(*) FROM permissions")
        ok = n == 22
        detail = []
        for code, mirror in MIRRORS.items():
            got = {r[0] for r in await c.fetch("SELECT role_id FROM role_permissions WHERE permission = $1", code)}
            want = {r[0] for r in await c.fetch("SELECT role_id FROM role_permissions WHERE permission = $1", mirror)}
            ok = ok and got == want and len(want) > 0
            detail.append(f"{code}={len(got)}/{len(want)}")
        check(ok, f"P1 catalogue {n} codes; each new code granted exactly where its mirror is: {detail}")
        bad = []
        for t, privs in (("stock_movements", ("UPDATE", "DELETE")), ("sale_bill_items", ("UPDATE", "DELETE")),
                         ("sale_receipt_allocations", ("UPDATE", "DELETE")), ("buyers", ("DELETE",)),
                         ("sale_bills", ("DELETE",)), ("sale_receipts", ("DELETE",))):
            for p in privs:
                if await c.fetchval("SELECT has_table_privilege('recycle_app', $1, $2)", t, p):
                    bad.append(f"{t}.{p}")
        held = await c.fetchval("SELECT has_table_privilege('recycle_app', 'stock_movements', 'INSERT')")
        check(not bad and held, f"G1 append-only grants (forbidden held: {bad}; control: INSERT held {held})")
        rls = await c.fetch("SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,"
                            " (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS pol"
                            " FROM pg_class c WHERE c.relname = ANY($1::text[])", list(NEW_TABLES))
        good = [r["relname"] for r in rls if r["relrowsecurity"] and r["relforcerowsecurity"] and r["pol"] == 1]
        check(sorted(good) == sorted(NEW_TABLES), f"R1 RLS ENABLE+FORCE+1 policy on {len(good)}/{len(NEW_TABLES)} new tables")

        print("\n== K  the database refuses what the rules do not produce (rolled back) ==")
        tid = await c.fetchval("SELECT tenant_id FROM purchase_bills ORDER BY server_received_at LIMIT 1")
        br = await c.fetchval("SELECT id FROM branches WHERE tenant_id = $1 ORDER BY code LIMIT 1", tid)
        prod = await c.fetchval("SELECT id FROM products WHERE tenant_id = $1 LIMIT 1", tid)
        user = await c.fetchval("SELECT id FROM users WHERE tenant_id = $1 LIMIT 1", tid)
        mv = await c.fetchval("SELECT id FROM stock_movements WHERE tenant_id = $1 AND kind = 'void_purchase' LIMIT 1", tid)
        orig = await c.fetchval("SELECT reverses_movement_id FROM stock_movements WHERE id = $1", mv) if mv else None

        async def attempt(steps: list) -> str:
            tr = c.transaction()
            await tr.start()
            try:
                await c.execute("SELECT set_config('app.actor_id', $1, true), set_config('app.actor_username', $2, true),"
                                " set_config('app.tenant_id', $3, true)", SYSTEM_ACTOR, "system:prove_m2_schema", str(tid))
                for sql, *a in steps:
                    await c.execute(sql, *a)
                return "ACCEPTED"
            except (asyncpg.CheckViolationError, asyncpg.UniqueViolationError) as e:
                return e.constraint_name or type(e).__name__
            except asyncpg.PostgresError as e:
                return f"{type(e).__name__}: {str(e)[:120]}"
            finally:
                await tr.rollback()

        buyer, bill, item, rcp = uuid.uuid4(), uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
        mk_buyer = ("INSERT INTO buyers (id, tenant_id, code, name, created_by) VALUES ($1, $2, 'BY-PROOF', 'ผู้ซื้อ', $3)",
                    buyer, tid, user)
        def mk_bill(doc: str = "S-B-2569-1"):
            return ("INSERT INTO sale_bills (id, tenant_id, branch_id, buyer_id, doc_no, idempotency_key, total_amount,"
                    " device_created_at, created_by) VALUES ($1, $2, $3, $4, $5, $6, 150.05, now(), $7)",
                    bill, tid, br, buyer, doc, f"proof-{bill}", user)
        # 10.003 kg x 15.00 = 150.045 -> 150.05 (half_up_0.01); cost 10.003 x 11.0000 = 110.033 -> 110.03
        line = {"gw": Decimal("10.003"), "nw": Decimal("10.003"), "q": Decimal("10.003"), "amt": Decimal("150.05"),
                "cpu": Decimal("11.0000"), "ca": Decimal("110.03")}
        def mk_line(**o):
            v = {**line, **o}
            return ("INSERT INTO sale_bill_items (id, tenant_id, bill_id, product_id, line_no, gross_weight, tare_weight,"
                    " deduction_mode, deduction_weight, net_weight, pricing_basis, quantity, unit_price, rounding_rule,"
                    " amount, unit_code, unit_name, cost_per_unit, cost_amount) VALUES ($1, $2, $3, $4, 1, $5, 0, 'none', 0,"
                    " $6, 'weight', $7, 15.00, 'half_up_0.01', $8, 'KG', 'กก.', $9, $10)",
                    item, tid, bill, prod, v["gw"], v["nw"], v["q"], v["amt"], v["cpu"], v["ca"])
        def mk_move(q: Decimal = Decimal("-10.003")):
            return ("INSERT INTO stock_movements (tenant_id, branch_id, product_id, kind, quantity, value, sale_item_id)"
                    " VALUES ($1, $2, $3, 'sale', $4, -110.03, $5)", tid, br, prod, q, item)
        def mk_receipt(amt: Decimal = Decimal("100.00")):
            return ("INSERT INTO sale_receipts (id, tenant_id, branch_id, buyer_id, method, amount, idempotency_key,"
                    " device_created_at, received_by) VALUES ($1, $2, $3, $4, 'cash', $5, $6, now(), $7)",
                    rcp, tid, br, buyer, amt, f"r-{rcp}", user)

        cases = [
            ("K1", "ck_sale_items_cost", [mk_buyer, mk_bill(), mk_line(ca=Decimal("110.04"))]),
            ("K2", "ck_sale_items_amount", [mk_buyer, mk_bill(), mk_line(amt=Decimal("150.06"))]),
            ("K3", "ck_sale_items_net", [mk_buyer, mk_bill(), mk_line(nw=Decimal("9.003"), q=Decimal("9.003"),
                                                                       amt=Decimal("135.05"), ca=Decimal("99.03"))]),
            ("K4", "ck_movements_shape", [mk_buyer, mk_bill(), mk_line(), mk_move(Decimal("10.003"))]),
            ("K5", "ck_movements_shape", [("INSERT INTO stock_movements (tenant_id, branch_id, product_id, kind, quantity,"
                                          " value, created_by, idempotency_key, device_created_at) VALUES ($1, $2, $3,"
                                          " 'adjust', 1, 0, $4, 'adj-proof', now())", tid, br, prod, user)]),
            ("K6", "uq_movements_reverses", [("INSERT INTO stock_movements (tenant_id, branch_id, product_id, kind,"
                                             " quantity, value, purchase_item_id, reverses_movement_id) SELECT tenant_id,"
                                             " branch_id, product_id, 'void_purchase', -quantity, -value, purchase_item_id,"
                                             " id FROM stock_movements WHERE id = $1", orig)]),
            ("K7", "ck_sale_bills_doc_no", [mk_buyer, mk_bill("B-2569-1")]),
            ("K8", "ck_sale_receipts_amount", [mk_buyer, mk_receipt(Decimal("0.00"))]),
        ]
        for cell, want, steps in cases:
            got = await attempt(steps)
            note = " (dropped by --break)" if args.brk == want else ""
            check(got == want, f"{cell} refused by {want}: got {got}{note}")
        got = await attempt([mk_buyer, mk_bill(), mk_line(), mk_move(), mk_receipt()])
        check(got == "ACCEPTED", f"K9 CONTROL a well-formed sale, line, movement and receipt: {got}")

        print("\n== D  0029's downgrade holds what only the app records, and lets go of what upgrade() rebuilds ==")
        def alembic(*a: str) -> subprocess.CompletedProcess:
            return subprocess.run([sys.executable, "-m", "alembic", *a], cwd=SERVER_DIR, env=env, capture_output=True)
        force_q = "SELECT relforcerowsecurity FROM pg_class WHERE oid = 'stock_movements'::regclass"
        equal_q = ("SELECT count(*) FROM stock_movements m JOIN purchase_bill_items i ON i.id = m.purchase_item_id"
                   " WHERE m.kind = 'purchase' AND m.quantity = coalesce(i.quantity, i.net_weight) AND m.value = i.amount")
        others = await c.fetchrow(
            "SELECT (SELECT count(*) FROM buyers) AS buyers, (SELECT count(*) FROM sale_bills) AS sales,"
            " (SELECT count(*) FROM sale_receipts) AS receipts,"
            " (SELECT count(*) FROM stock_movements WHERE kind NOT IN ('purchase', 'void_purchase')) AS app_only,"
            " (SELECT count(*) FROM owner_flags WHERE kind <> 'off_rule' OR sale_item_id IS NOT NULL) AS flags,"
            " (SELECT count(*) FROM tenants WHERE negative_stock <> 'allow') AS refusing,"
            " (SELECT count(*) FROM products WHERE sell_price IS NOT NULL) AS priced")
        check(not any(others.values()),
              f"D0 precondition: the copy holds nothing else the guard counts, so D1/D2 move on ONE planted row ({dict(others)})")
        # D1: a movement only the app holds -- an adjustment -- and the downgrade refuses, changing nothing.
        adj_key = f"adj-d1-{uuid.uuid4()}"
        await c.execute("INSERT INTO stock_movements (tenant_id, branch_id, product_id, kind, quantity, value, reason, created_by,"
                        " idempotency_key, device_created_at) VALUES ($1, $2, $3, 'adjust', 1.000, 0, 'นับสต็อก D1', $4, $5, now())",
                        tid, br, prod, user, adj_key)
        d1 = alembic("downgrade", "0028")
        d1_rev = await c.fetchval("SELECT version_num FROM alembic_version")
        d1_err = d1.stderr.decode("utf-8", "replace")
        check(d1.returncode != 0 and d1_rev == rev and "sale/adjustment movements=1" in d1_err and await c.fetchval(force_q),
              f"D1 an app adjustment holds the downgrade: exit {d1.returncode}, head {d1_rev}, refusal names it"
              f" {'sale/adjustment movements=1' in d1_err}, FORCE kept")
        if d1_rev != rev:
            # The guard let it through (D1 is red): put the copy back at head so D2/D3 still read something.
            alembic("upgrade", "head")
        else:
            await c.execute("DELETE FROM stock_movements WHERE idempotency_key = $1", adj_key)   # this scratch only
        # D2: a purchase movement the APP wrote (recorded_by_migration = false, as POST /bills writes it) does NOT hold
        # the downgrade -- upgrade() rebuilds it -- and D3 shows the rebuild, line for line.
        lines = await c.fetchval("SELECT count(*) FROM purchase_bill_items")
        app_written = await c.fetchval("UPDATE stock_movements SET recorded_by_migration = false WHERE id ="
                                       " (SELECT id FROM stock_movements WHERE kind = 'purchase' LIMIT 1) RETURNING id")
        d2 = alembic("downgrade", "0028")
        d2_rev = await c.fetchval("SELECT version_num FROM alembic_version")
        gone = await c.fetchval("SELECT to_regclass('public.stock_movements') IS NULL")
        check(app_written is not None and d2.returncode == 0 and d2_rev == "0028" and gone,
              f"D2 an app-written purchase movement does not hold it: exit {d2.returncode}, head {d2_rev}, ledger dropped {gone}"
              + ("" if d2.returncode == 0 else f" -- {d2.stderr.decode('utf-8', 'replace')[-300:]}"))
        d3 = alembic("upgrade", "head")
        d3_rev = await c.fetchval("SELECT version_num FROM alembic_version")
        rebuilt = await c.fetchval(equal_q) if d3.returncode == 0 else -1
        check(d3.returncode == 0 and d3_rev == rev and rebuilt == lines,
              f"D3 upgrade() rebuilds it: exit {d3.returncode}, head {d3_rev}, equal purchase movements {rebuilt}/{lines}")
    finally:
        await c.close()
    print(f"\n  passes={len(passes)}  failures={len(failures)}")
    for f in failures:
        print(f"    RED: {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    rc = asyncio.run(main())
    print(f"PROVE_M2_SCHEMA_EXIT={rc}")
    sys.exit(rc)
