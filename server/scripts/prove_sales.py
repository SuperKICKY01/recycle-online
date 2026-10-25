"""M2 (ADVISOR-DECIDED 2026-10-25): SALES, MONEY IN, THE STOCK LEDGER AND COST, over real HTTP on a scratch.

    uv run python scripts/prove_sales.py

Restores a scratch from a live dump (upgraded to head on the scratch if live is behind), starts a child uvicorn,
provisions ONE throwaway shop by SQL (owner, admin, staff), builds its master data as the owner. Every expected
figure is FIXED FROM THIS PROOF'S INPUTS before the write -- worked by hand, never by calling app/stock_cost --
and read back from Postgres as the superuser (buddhist-method: what Postgres stored).

THE WORKED EXAMPLE (product STEEL, one branch):
  buy 100.000 kg @ 10.00 = 1000.00        Q 100.000  V 1000.00
  buy  50.000 kg @ 13.00 =  650.00        Q 150.000  V 1650.00   average 11.0000
  SELL 30.000 kg @ 15.00 =  450.00        cost 30 x 11.0000 = 330.00, gross profit 120.00; Q 120.000 V 1320.00
  adjust -2.000 kg "เสียหาย"               value -22.00 (at 11.0000);                       Q 118.000 V 1298.00
  VOID the sale                            +30.000, +330.00 (the exact reverse);           Q 148.000 V 1628.00

THE CELLS
  SC1  create: 201, doc_no S-B-<BE year>-1, the line's quantity/amount/cost_per_unit/cost_amount stored as worked,
       one sale movement (-30.000, -330.00); GET /sales/{id} reads gross_profit 120.00 and NO key named `profit`.
  SC2  idempotent replay: the same body again -> 200, the same id and doc_no, still ONE bill, ONE line, ONE movement.
  SC3  money in: created with received_amount 100.00 -> received 100.00, outstanding 350.00, partial; a receipt of
       400.00 allocating 350.00 -> paid, outstanding 0.00; an allocation above outstanding -> 422, nothing written.
  SC4  adjustment: a blank reason -> 422 reason_required; -2.000 "เสียหาย" -> 201, value -22.00.
  SC5  void: 200, the bill row kept with its lines and costs unchanged, ONE void_sale movement reversing the sale
       movement exactly; a second void -> 409; the balance table after every step equals the hand table above.
  SC6  late purchase: a sale weighed at T2 is costed; a purchase weighed at T1 < T2 arrives later -> the sale line's
       cost_per_unit and cost_amount are byte-identical before and after, and ONE late_purchase flag names both lines.
  SC7  negative stock, ALLOW (default): selling 200.000 of COPPER (balance 10.000) -> 201, flagged negative_stock with
       balance_after -190.000. REFUSE (owner sets it): the same sale -> 409 insufficient_stock, no bill, no movement.
  SC8  never bought: a sale of a product with no purchase -> cost 0.0000 / 0.00, flagged no_cost.
  SC9  the sell side's golden vectors (golden/line_rules_vectors.json, ids S*), each posted as a sale line:
       the stored amount, net and quantity equal the vector.
  SC10 permissions: STAFF creates a sale (201) and reads it WITHOUT cost or gross_profit keys; STAFF void -> 403;
       ADMIN reads the cost; STAFF adjust -> 403.
  SC11 reports: GET /reports/sales by product (by day: SC14.5) -- amount, cost and gross_profit equal the stored lines'
       sums, voided bills excluded; GET /stock reads the balance and value of the hand table.
  SC12 reconcile.py over the whole scratch: RECONCILE_EXIT=0 (S1..S5 restate the ledger independently).
  SC13 the quote (POST /sales/quote, the desktop form's): STAFF quotes 30.500 - 0.500 kg x 15.33 under a DECLARED
       down_1 with a WRONG net -> 200, net 30.000, amount and total 459.00 (by hand), and the tenant's bills, lines,
       movements and flags unchanged. CONTROL: the same body to POST /sales -> 422 net_mismatch; a product of no
       tenant -> the quote refuses product_not_found. (Runs before SC12, so the reconcile covers it.)
  SC14 the red team's six (2026-10-25), each fixed by hand: (1) stock opened by adjustment on a never-bought product
       is valued 0.00 and its sale, costed 0.0000 by the AVERAGE arm, is still flagged no_cost; (2) negative_stock
       REFUSE judged from a POSITIVE balance: an overdrawing sale and adjustment are refused, ones within it accepted;
       (3) /reports/sales opens REPEATABLE READ (its own source; CONTROL the summary route); (4) GET /stock's unit cost
       is the one the next sale is charged, over a ledger with quantity > 0 and value < 0; (5) the sales day is the
       fixed offset, no named zone; (6) retiring a product holding stock leaves total_value at the whole ledger.
"""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

import httpx  # noqa: E402
from sqlalchemy.engine import make_url  # noqa: E402

from lane import scratch_name  # noqa: E402
from prove_money_rules import Db, Shop, auth, code_of, free_port, provision, restore_scratch  # noqa: E402

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOLDEN = Path(SERVER_DIR).parent / "golden" / "line_rules_vectors.json"
SCRATCH_DB = scratch_name("recycle_sales_scratch")
RUN = uuid.uuid4().hex[:8]

failures: list[str] = []
passes: list[str] = []


def check(cond: bool, claim: str) -> None:
    print(f"  [{'OK  ' if cond else 'RED '}] {claim}")
    (passes if cond else failures).append(claim)


def header(title: str) -> None:
    print("\n" + "=" * 72 + f"\n{title}\n" + "=" * 72)


def iso(dt_: datetime) -> str:
    return dt_.isoformat()


class Fx:
    def __init__(self, c: httpx.AsyncClient, shop: Shop) -> None:
        self.c, self.shop, self.s = c, shop, shop.ids

    async def call(self, method: str, path: str, body: Any = None, who: str = "owner",
                   want: tuple[int, ...] = (200, 201)) -> Any:
        r = await self.c.request(method, path, headers=auth(self.shop.tok[who]), json=body)
        if r.status_code not in want:
            raise RuntimeError(f"fixture: {method} {path} -> {r.status_code} {r.text[:300]}")
        return r.json()

    async def buy(self, product: str, qty: str, price: str, at: datetime | None = None) -> dict:
        body = {"id": str(uuid.uuid4()), "seller_id": self.s["seller"], "device_created_at": iso(at or datetime.now(timezone.utc)),
                "idempotency_key": f"buy-{uuid.uuid4()}",
                "items": [{"id": str(uuid.uuid4()), "product_id": self.s[product], "line_no": 1, "gross_weight": qty,
                           "tare_weight": "0.000", "net_weight": qty, "unit_price": price}]}
        await self.call("POST", "/bills", body)
        return body

    def sale_body(self, product: str, qty: str, price: str, at: datetime | None = None, **extra: Any) -> dict:
        return {"id": str(uuid.uuid4()), "buyer_id": self.s["buyer"], "device_created_at": iso(at or datetime.now(timezone.utc)),
                "idempotency_key": f"sale-{uuid.uuid4()}",
                "items": [{"id": str(uuid.uuid4()), "product_id": self.s[product], "line_no": 1, "gross_weight": qty,
                           "tare_weight": "0.000", "net_weight": qty, "unit_price": price}], **extra}


async def build(fx: Fx) -> None:
    s = fx.s
    s["branch"] = (await fx.call("GET", "/shop"))["branch"]["id"]
    await fx.call("POST", "/grade-tiers", {"code": "A", "name": "เกรด A"})
    s["kg"] = (await fx.call("POST", "/uoms", {"code": "KG", "name": "กก.", "kind": "weight"}))["id"]
    s["pc"] = (await fx.call("POST", "/uoms", {"code": "PC", "name": "ชิ้น", "kind": "count"}))["id"]
    s["lot"] = (await fx.call("POST", "/uoms", {"code": "LOT", "name": "เหมา", "kind": "count"}))["id"]
    s["cat"] = (await fx.call("POST", "/product-categories", {"code": "FE", "name": "เหล็ก"}))["id"]
    for key, code, uom, basis in (("steel", "STEEL", "kg", "weight"), ("copper", "CU", "kg", "weight"),
                                  ("late", "LATE", "kg", "weight"), ("never", "NEVER", "kg", "weight"),
                                  ("gw", "GW", "kg", "weight"), ("gp", "GP", "pc", "piece"), ("gl", "GL", "lot", "lump"),
                                  # SC14's (red team 2026-10-25): never bought, opened by adjustment; refuse from a
                                  # positive balance; a ledger driven to quantity > 0 with value < 0; retired holding stock.
                                  ("opening", "OPEN", "kg", "weight"), ("pos", "POS", "kg", "weight"),
                                  ("neg", "NEG", "kg", "weight"), ("ret", "RET", "kg", "weight")):
        s[key] = (await fx.call("POST", "/products", {"code": code, "name": f"สินค้า {code}", "category_id": s["cat"],
                                                        "uom_id": s[uom], "pricing_basis": basis}))["id"]
        await fx.call("PUT", f"/products/{s[key]}/prices/A", {"price": "10.00"})
    await fx.call("PUT", f"/products/{s['steel']}/sell-price", {"price": "15.00"})
    s["seller"] = (await fx.call("POST", "/sellers", {"name": f"ผู้ขาย {RUN}", "grade": "A"}))["id"]
    s["buyer"] = (await fx.call("POST", "/buyers", {"name": f"โรงหล่อ {RUN}", "phone": "081-000-0000"}))["id"]


async def balance(db: Db, fx: Fx, product: str) -> tuple[str, str]:
    r = await db.fetchrow("SELECT coalesce(sum(quantity), 0)::numeric(14,3)::text AS q, coalesce(sum(value), 0)::numeric(14,2)::text AS v"
                          " FROM stock_movements WHERE product_id = $1", uuid.UUID(fx.s[product]))
    return r["q"], r["v"]


def has_key(obj: Any, key: str) -> bool:
    if isinstance(obj, dict):
        return key in obj or any(has_key(v, key) for v in obj.values())
    if isinstance(obj, list):
        return any(has_key(v, key) for v in obj)
    return False


async def cells(fx: Fx, db: Db) -> None:
    s = fx.s
    header("SC1-SC5  the worked example, step by step against the hand table")
    await fx.buy("steel", "100.000", "10.00")
    await fx.buy("steel", "50.000", "13.00")
    t0 = await balance(db, fx, "steel")
    body = fx.sale_body("steel", "30.000", "15.00", received_amount="100.00")
    r = await fx.c.post("/sales", headers=auth(fx.shop.tok["owner"]), json=body)
    sale = r.json() if r.status_code == 201 else {}
    line = await db.fetchrow("SELECT quantity::text, amount::text, cost_per_unit::text, cost_amount::text, list_price::text"
                             " FROM sale_bill_items WHERE bill_id = $1", uuid.UUID(body["id"]))
    mv = await db.fetch("SELECT quantity::text, value::text FROM stock_movements WHERE sale_item_id = $1",
                        uuid.UUID(body["items"][0]["id"]))
    import re as _re
    check(t0 == ("150.000", "1650.00") and r.status_code == 201
          and _re.match(r"^S-B-\d{4}-1$", sale.get("doc_no", "")) is not None
          and tuple(line) == ("30.000", "450.00", "11.0000", "330.00", "15.00")
          and [tuple(m) for m in mv] == [("-30.000", "-330.00")]
          and sale.get("gross_profit") == "120.00" and not has_key(sale, "profit"),
          f"SC1 create: {r.status_code} {sale.get('doc_no')}; before {t0}; line {tuple(line) if line else None};"
          f" movement {[tuple(m) for m in mv]}; gross_profit {sale.get('gross_profit')}; a `profit` key: {has_key(sale, 'profit')}")
    t1 = await balance(db, fx, "steel")

    r2 = await fx.c.post("/sales", headers=auth(fx.shop.tok["owner"]), json=body)
    nb = await db.fetchval("SELECT count(*) FROM sale_bills WHERE idempotency_key = $1", body["idempotency_key"])
    nm = await db.fetchval("SELECT count(*) FROM stock_movements WHERE sale_item_id = $1", uuid.UUID(body["items"][0]["id"]))
    check(r2.status_code == 200 and r2.json().get("id") == body["id"] and r2.json().get("doc_no") == sale.get("doc_no")
          and nb == 1 and nm == 1 and t1 == ("120.000", "1320.00"),
          f"SC2 replay: {r2.status_code}, bills {nb}, movements {nm}; balance {t1}")

    st = (sale.get("received_amount"), sale.get("outstanding_amount"), sale.get("receipt_status"))
    over = await fx.c.post("/sale-receipts", headers=auth(fx.shop.tok["owner"]), json={
        "id": str(uuid.uuid4()), "buyer_id": s["buyer"], "method": "cash", "amount": "400.00",
        "idempotency_key": f"rc-{uuid.uuid4()}", "device_created_at": iso(datetime.now(timezone.utc)),
        "allocations": [{"bill_id": body["id"], "amount": "350.01"}]})
    nr0 = await db.fetchval("SELECT count(*) FROM sale_receipts WHERE buyer_id = $1", uuid.UUID(s["buyer"]))
    ok = await fx.c.post("/sale-receipts", headers=auth(fx.shop.tok["owner"]), json={
        "id": str(uuid.uuid4()), "buyer_id": s["buyer"], "method": "transfer", "amount": "400.00",
        "idempotency_key": f"rc-{uuid.uuid4()}", "device_created_at": iso(datetime.now(timezone.utc)),
        "allocations": [{"bill_id": body["id"], "amount": "350.00"}]})
    after = (await fx.call("GET", f"/sales/{body['id']}"))
    check(st == ("100.00", "350.00", "partial") and over.status_code == 422
          and code_of(over) == "allocation_exceeds_outstanding" and nr0 == 1 and ok.status_code == 201
          and (after["received_amount"], after["outstanding_amount"], after["receipt_status"]) == ("450.00", "0.00", "paid"),
          f"SC3 money in: at create {st}; over-allocation {over.status_code} {code_of(over)} (receipts still {nr0});"
          f" then {ok.status_code} -> {after['received_amount']} / {after['outstanding_amount']} {after['receipt_status']}")

    blank = await fx.c.post("/stock/adjustments", headers=auth(fx.shop.tok["owner"]), json={
        "product_id": s["steel"], "quantity": "-2.000", "reason": "   ", "idempotency_key": f"adj-{uuid.uuid4()}",
        "device_created_at": iso(datetime.now(timezone.utc))})
    adj = await fx.c.post("/stock/adjustments", headers=auth(fx.shop.tok["owner"]), json={
        "product_id": s["steel"], "quantity": "-2.000", "reason": "เสียหาย", "idempotency_key": f"adj-{uuid.uuid4()}",
        "device_created_at": iso(datetime.now(timezone.utc))})
    t2 = await balance(db, fx, "steel")
    check(blank.status_code == 422 and code_of(blank) == "reason_required" and adj.status_code == 201
          and adj.json().get("value") == "-22.00" and t2 == ("118.000", "1298.00"),
          f"SC4 adjustment: blank reason {blank.status_code} {code_of(blank)}; -2.000 {adj.status_code}"
          f" value {adj.json().get('value') if adj.status_code == 201 else None}; balance {t2}")

    lines_before = await db.fetch("SELECT row_to_json(x)::text FROM sale_bill_items x WHERE bill_id = $1", uuid.UUID(body["id"]))
    v = await fx.c.post(f"/sales/{body['id']}/void", headers=auth(fx.shop.tok["owner"]), json={"reason": "ผู้ซื้อยกเลิก"})
    v2 = await fx.c.post(f"/sales/{body['id']}/void", headers=auth(fx.shop.tok["owner"]), json={"reason": "อีกครั้ง"})
    lines_after = await db.fetch("SELECT row_to_json(x)::text FROM sale_bill_items x WHERE bill_id = $1", uuid.UUID(body["id"]))
    rev = await db.fetch("SELECT v.quantity::text, v.value::text, (v.reverses_movement_id = o.id) AS names_it"
                         " FROM stock_movements v JOIN stock_movements o ON o.sale_item_id = v.sale_item_id AND o.kind = 'sale'"
                         " WHERE v.kind = 'void_sale' AND v.sale_item_id = $1", uuid.UUID(body["items"][0]["id"]))
    kept = await db.fetchval("SELECT voided_at IS NOT NULL FROM sale_bills WHERE id = $1", uuid.UUID(body["id"]))
    t3 = await balance(db, fx, "steel")
    check(v.status_code == 200 and v2.status_code == 409 and kept is True and lines_before == lines_after
          and [tuple(x) for x in rev] == [("30.000", "330.00", True)] and t3 == ("148.000", "1628.00"),
          f"SC5 void: {v.status_code}, again {v2.status_code}; row kept voided {kept}; lines unchanged"
          f" {lines_before == lines_after}; reversal {[tuple(x) for x in rev]}; balance {t3}")

    header("SC6  a purchase that syncs late leaves the sale's cost alone, and is flagged")
    now = datetime.now(timezone.utc)
    await fx.buy("late", "10.000", "10.00", at=now - timedelta(hours=3))
    sb = fx.sale_body("late", "5.000", "20.00", at=now - timedelta(hours=1))
    await fx.call("POST", "/sales", sb)
    q = "SELECT cost_per_unit::text, cost_amount::text FROM sale_bill_items WHERE id = $1"
    c0 = tuple(await db.fetchrow(q, uuid.UUID(sb["items"][0]["id"])))
    late = await fx.buy("late", "10.000", "30.00", at=now - timedelta(hours=2))
    c1 = tuple(await db.fetchrow(q, uuid.UUID(sb["items"][0]["id"])))
    flags = await db.fetch("SELECT cause_purchase_item_id FROM owner_flags WHERE kind = 'late_purchase' AND sale_item_id = $1",
                           uuid.UUID(sb["items"][0]["id"]))
    check(c0 == ("10.0000", "50.00") and c1 == c0 and [str(f[0]) for f in flags] == [late["items"][0]["id"]],
          f"SC6 cost before {c0}, after the late purchase {c1}; late_purchase flags naming it {len(flags)}")

    header("SC7 / SC8  negative stock (allow, then refuse) and a product never bought")
    await fx.buy("copper", "10.000", "100.00")
    neg = fx.sale_body("copper", "200.000", "120.00")
    rn = await fx.c.post("/sales", headers=auth(fx.shop.tok["owner"]), json=neg)
    nf = await db.fetch("SELECT balance_after::text FROM owner_flags WHERE kind = 'negative_stock' AND sale_item_id = $1",
                        uuid.UUID(neg["items"][0]["id"]))
    await fx.call("PATCH", "/shop", {"negative_stock": "refuse"})
    ref = fx.sale_body("copper", "1.000", "120.00")
    rr = await fx.c.post("/sales", headers=auth(fx.shop.tok["owner"]), json=ref)
    nbill = await db.fetchval("SELECT count(*) FROM sale_bills WHERE id = $1", uuid.UUID(ref["id"]))
    q0, _ = await balance(db, fx, "copper")
    await fx.call("PATCH", "/shop", {"negative_stock": "allow"})
    check(rn.status_code == 201 and [f[0] for f in nf] == ["-190.000"] and rr.status_code == 409
          and code_of(rr) == "insufficient_stock" and nbill == 0 and q0 == "-190.000",
          f"SC7 allow: {rn.status_code} flagged {[f[0] for f in nf]}; refuse: {rr.status_code} {code_of(rr)}, bill rows"
          f" {nbill}, balance still {q0}")
    nv = fx.sale_body("never", "5.000", "10.00")
    rv = await fx.c.post("/sales", headers=auth(fx.shop.tok["owner"]), json=nv)
    nc = await db.fetchrow("SELECT cost_per_unit::text, cost_amount::text FROM sale_bill_items WHERE id = $1",
                           uuid.UUID(nv["items"][0]["id"]))
    nfl = await db.fetchval("SELECT count(*) FROM owner_flags WHERE kind = 'no_cost' AND sale_item_id = $1",
                            uuid.UUID(nv["items"][0]["id"]))
    check(rv.status_code == 201 and nc is not None and tuple(nc) == ("0.0000", "0.00") and nfl == 1,
          f"SC8 never bought: {rv.status_code} cost {tuple(nc) if nc else None}, no_cost flags {nfl}")

    header("SC9  the sell side's golden vectors, each posted as a sale")
    vecs = [v for v in json.loads(GOLDEN.read_text(encoding="utf-8"))["vectors"] if v["id"].startswith("S") and "out" in v]
    prod = {"weight": "gw", "piece": "gp", "lump": "gl"}
    bad = []
    for v in vecs:
        i = v["in"]
        item = {"id": str(uuid.uuid4()), "product_id": s[prod[i["basis"]]], "line_no": 1, "gross_weight": i["gross"],
                "tare_weight": i["tare"], "net_weight": v["out"]["net_weight"], "unit_price": i["unit_price"],
                "pricing_basis": i["basis"], "rounding_rule": i["rule"], "deduction_mode": i["mode"]}
        for k_in, k_out in (("deduction_pct", "deduction_pct"), ("deduction_weight", "deduction_weight"), ("quantity", "quantity")):
            if k_in in i:
                item[k_out] = i[k_in]
        b = {"id": str(uuid.uuid4()), "buyer_id": s["buyer"], "device_created_at": iso(datetime.now(timezone.utc)),
             "idempotency_key": f"gv-{uuid.uuid4()}", "items": [item]}
        rg = await fx.c.post("/sales", headers=auth(fx.shop.tok["owner"]), json=b)
        got = await db.fetchrow("SELECT amount::text, net_weight::text, quantity::text, deduction_weight::text"
                                " FROM sale_bill_items WHERE id = $1", uuid.UUID(item["id"]))
        want = (v["out"]["amount"], v["out"]["net_weight"], v["out"]["quantity"], v["out"]["deduction_weight"])
        if rg.status_code != 201 or got is None or tuple(got) != want:
            bad.append((v["id"][:3], rg.status_code, tuple(got) if got else None, want))
    check(len(vecs) >= 6 and not bad, f"SC9 {len(vecs)} sell-side vectors stored exactly as the file says; mismatches {bad}")

    header("SC10  who sees cost, who may void and adjust")
    sv = fx.sale_body("steel", "1.000", "15.00")
    rs = await fx.c.post("/sales", headers=auth(fx.shop.tok["staff"]), json=sv)
    sread = await fx.c.get(f"/sales/{sv['id']}", headers=auth(fx.shop.tok["staff"]))
    aread = await fx.c.get(f"/sales/{sv['id']}", headers=auth(fx.shop.tok["admin"]))
    svoid = await fx.c.post(f"/sales/{sv['id']}/void", headers=auth(fx.shop.tok["staff"]), json={"reason": "x"})
    sadj = await fx.c.post("/stock/adjustments", headers=auth(fx.shop.tok["staff"]), json={
        "product_id": s["steel"], "quantity": "1.000", "reason": "x", "idempotency_key": f"adj-{uuid.uuid4()}",
        "device_created_at": iso(datetime.now(timezone.utc))})
    check(rs.status_code == 201 and sread.status_code == 200 and not has_key(sread.json(), "cost_amount")
          and not has_key(sread.json(), "gross_profit") and aread.status_code == 200
          and aread.json().get("cost_amount") is not None and svoid.status_code == 403 and sadj.status_code == 403,
          f"SC10 staff creates {rs.status_code}, reads without cost {not has_key(sread.json(), 'cost_amount')};"
          f" admin reads cost {aread.json().get('cost_amount')}; staff void {svoid.status_code}, adjust {sadj.status_code}")

    header("SC11  reports and the stock screen read what was stored")
    # The report's range is in SHOP days (UTC+7, BRIEFING section 7). A UTC date here asked for the wrong days for the
    # seven hours a day the two calendars differ (17:00-24:00 UTC): gate _prove_all/20261025T191356Z ran at 19:14 UTC,
    # every sale fell on shop day 26 Oct, and this cell asked for 24-25 Oct -> 0 bills, red. Same derivation as SC14.5.
    shop_today = (datetime.now(timezone.utc) + timedelta(hours=7)).date()
    today = shop_today.isoformat()
    yesterday = (shop_today - timedelta(days=1)).isoformat()
    rep = await fx.call("GET", f"/reports/sales?from_date={yesterday}&to_date={today}&by=product")
    sums = await db.fetchrow(
        "SELECT sum(i.amount)::text AS a, sum(i.cost_amount)::text AS c, (sum(i.amount) - sum(i.cost_amount))::text AS g"
        " FROM sale_bill_items i JOIN sale_bills b ON b.id = i.bill_id WHERE b.tenant_id = $1 AND b.voided_at IS NULL", fx.shop.id)
    stock = await fx.call("GET", "/stock")
    steel = next(x for x in stock["items"] if x["product_id"] == s["steel"])
    q_s, v_s = await balance(db, fx, "steel")
    check((rep["totals"]["amount"], rep["totals"]["cost"], rep["totals"]["gross_profit"]) == (sums["a"], sums["c"], sums["g"])
          and not has_key(rep, "profit") and (steel["quantity"], steel["value"]) == (q_s, v_s),
          f"SC11 report totals {rep['totals']} == stored {dict(sums)}; stock STEEL {steel['quantity']} / {steel['value']}"
          f" == ledger {q_s} / {v_s}")

    header("SC13  the quote: the line rule's figures under the DECLARED rule, and nothing written")
    count_q = ("SELECT (SELECT count(*) FROM sale_bills WHERE tenant_id = $1) || '/' || (SELECT count(*) FROM sale_bill_items"
               " WHERE tenant_id = $1) || '/' || (SELECT count(*) FROM stock_movements WHERE tenant_id = $1) || '/' ||"
               " (SELECT count(*) FROM owner_flags WHERE tenant_id = $1)")
    before = await db.fetchval(count_q, fx.shop.id)
    # By hand: (30.500 - 0.500) x 15.33 = 459.90 -> down_1 -> 459.00. The net sent is WRONG on purpose: the quote is
    # how a client learns the net, so it must not check one.
    qb = fx.sale_body("steel", "30.500", "15.33")
    qb["items"][0].update({"tare_weight": "0.500", "net_weight": "999.000", "rounding_rule": "down_1"})
    rq = await fx.c.post("/sales/quote", headers=auth(fx.shop.tok["staff"]), json=qb)
    after = await db.fetchval(count_q, fx.shop.id)
    j = rq.json() if rq.status_code == 200 else {}
    it = (j.get("items") or [{}])[0]
    check(rq.status_code == 200 and (it.get("net_weight"), it.get("quantity"), it.get("amount"), j.get("total_amount"))
          == ("30.000", "30.000", "459.00", "459.00") and after == before,
          f"SC13 STAFF quote: {rq.status_code} net/qty/amount/total {(it.get('net_weight'), it.get('quantity'), it.get('amount'), j.get('total_amount'))}"
          f" == 30.000/30.000/459.00/459.00; bills/lines/movements/flags {before} -> {after} (nothing written)")
    rc = await fx.c.post("/sales", headers=auth(fx.shop.tok["staff"]), json=qb)
    qf = fx.sale_body("steel", "1.000", "1.00")
    qf["items"][0]["product_id"] = str(uuid.uuid4())
    rf = await fx.c.post("/sales/quote", headers=auth(fx.shop.tok["staff"]), json=qf)
    after2 = await db.fetchval(count_q, fx.shop.id)
    check(rc.status_code == 422 and code_of(rc) == "net_mismatch" and rf.status_code == 422 and code_of(rf) == "product_not_found"
          and after2 == before,
          f"SC13 CONTROL: the same body to POST /sales -> {rc.status_code} {code_of(rc)} (the create still checks the net);"
          f" a product of no tenant -> quote {rf.status_code} {code_of(rf)}; counts {after2}")

    header("SC14  the red team's six (2026-10-25): every figure fixed by hand before the write")
    owner = auth(fx.shop.tok["owner"])
    now = lambda: iso(datetime.now(timezone.utc))  # noqa: E731

    # (1) OPEN, never bought: +100.000 by adjustment is valued 0.00 (no cost known); a sale of 50.000 is then costed
    # 0.0000 -- by the AVERAGE arm (Q 100, V 0.00), not the none arm -- and must still be flagged no_cost.
    ra = await fx.c.post("/stock/adjustments", headers=owner, json={
        "product_id": s["opening"], "quantity": "100.000", "reason": "ยกยอดมา", "idempotency_key": f"open-{uuid.uuid4()}",
        "device_created_at": now()})
    so = fx.sale_body("opening", "50.000", "30.00")
    rso = await fx.c.post("/sales", headers=owner, json=so)
    oline = await db.fetchrow("SELECT cost_per_unit::text AS cpu, cost_amount::text AS ca FROM sale_bill_items WHERE id = $1",
                              uuid.UUID(so["items"][0]["id"]))
    onc = await db.fetchval("SELECT count(*) FROM owner_flags WHERE kind = 'no_cost' AND sale_item_id = $1",
                            uuid.UUID(so["items"][0]["id"]))
    check(ra.status_code == 201 and ra.json().get("value") == "0.00" and rso.status_code == 201
          and oline is not None and (oline["cpu"], oline["ca"]) == ("0.0000", "0.00") and onc == 1,
          f"SC14.1 stock opened by adjustment at 0.00, then sold: cost {tuple(oline) if oline else None}, no_cost flags {onc}"
          " (want 0.0000 / 0.00 and ONE flag)")

    # (2) POS: REFUSE judged from a POSITIVE balance. Buy 10.000; under refuse a sale of 20.000 would overdraw -> 409,
    # no bill; 5.000 is within -> 201 (control); the adjustment arm: -20.000 -> 409, -1.000 -> 201 (control).
    # Balance by hand: 10.000 - 5.000 - 1.000 = 4.000.
    await fx.buy("pos", "10.000", "10.00")
    await fx.call("PATCH", "/shop", {"negative_stock": "refuse"})
    over = fx.sale_body("pos", "20.000", "12.00")
    rover = await fx.c.post("/sales", headers=owner, json=over)
    nover = await db.fetchval("SELECT count(*) FROM sale_bills WHERE id = $1", uuid.UUID(over["id"]))
    rwithin = await fx.c.post("/sales", headers=owner, json=fx.sale_body("pos", "5.000", "12.00"))
    radj_over = await fx.c.post("/stock/adjustments", headers=owner, json={
        "product_id": s["pos"], "quantity": "-20.000", "reason": "หาย", "idempotency_key": f"pos-{uuid.uuid4()}",
        "device_created_at": now()})
    radj_ok = await fx.c.post("/stock/adjustments", headers=owner, json={
        "product_id": s["pos"], "quantity": "-1.000", "reason": "หาย", "idempotency_key": f"pos-{uuid.uuid4()}",
        "device_created_at": now()})
    q_pos, _ = await balance(db, fx, "pos")
    await fx.call("PATCH", "/shop", {"negative_stock": "allow"})
    check(rover.status_code == 409 and code_of(rover) == "insufficient_stock" and nover == 0
          and rwithin.status_code == 201 and radj_over.status_code == 409 and code_of(radj_over) == "insufficient_stock"
          and radj_ok.status_code == 201 and q_pos == "4.000",
          f"SC14.2 refuse from a POSITIVE balance (10.000): sell 20 -> {rover.status_code} {code_of(rover)} (bill rows {nover});"
          f" sell 5 -> {rwithin.status_code}; adjust -20 -> {radj_over.status_code} {code_of(radj_over)}; adjust -1 ->"
          f" {radj_ok.status_code}; balance {q_pos} (want 4.000)")

    # (4) NEG: buy 10.000 @ 1.00 (Q 10, V 10.00); sell 1000.000 under allow at avg 1.0000 (Q -990, V -990.00); buy
    # 2000.000 @ 0.01 = 20.00 (Q 1010, V -970.00). Value is negative with quantity positive, so the rule's average
    # arm is closed and the next sale is costed at the newest purchase: 20.00 / 2000.000 = 0.0100. GET /stock must
    # show THAT, the cost the sale is then charged.
    await fx.buy("neg", "10.000", "1.00")
    await fx.call("POST", "/sales", fx.sale_body("neg", "1000.000", "2.00"))
    await fx.buy("neg", "2000.000", "0.01")
    nrow = next(i for i in (await fx.call("GET", "/stock"))["items"] if i["product_id"] == s["neg"])
    probe = fx.sale_body("neg", "1.000", "2.00")
    await fx.call("POST", "/sales", probe)
    ncpu = await db.fetchval("SELECT cost_per_unit::text FROM sale_bill_items WHERE id = $1", uuid.UUID(probe["items"][0]["id"]))
    check((nrow["quantity"], nrow["value"], nrow.get("average_cost"), nrow.get("cost_basis")) == ("1010.000", "-970.00", "0.0100", "last_purchase")
          and ncpu == "0.0100",
          f"SC14.4 one cost rule: GET /stock {nrow['quantity']} / {nrow['value']} unit cost {nrow.get('average_cost')}"
          f" ({nrow.get('cost_basis')}); the next sale is costed {ncpu} (want 1010.000 / -970.00, 0.0100 last_purchase, 0.0100)")

    # (6) RET: buy 100.000 @ 10.00 = 1000.00, then retire the product. The branch's stock value is the WHOLE ledger:
    # unchanged by the retirement, and equal to the ledger's own sum read by the superuser.
    await fx.buy("ret", "100.000", "10.00")
    tv_before = (await fx.call("GET", "/stock"))["total_value"]
    await fx.call("POST", f"/products/{s['ret']}/deactivate")
    after_st = await fx.call("GET", "/stock")
    listed = any(i["product_id"] == s["ret"] for i in after_st["items"])
    led = await db.fetchval("SELECT coalesce(sum(value), 0)::numeric(14,2)::text FROM stock_movements WHERE branch_id = $1",
                            uuid.UUID(s["branch"]))
    check(not listed and after_st["total_value"] == tv_before == led,
          f"SC14.6 retiring RET (holding 1000.00): listed {listed}; total {tv_before} -> {after_st['total_value']}; ledger {led}")

    # (3) /reports/sales reads rows and totals in ONE snapshot: its OWN source opens REPEATABLE READ. The route, not
    # the connection option (prove_daily_report R proves the option; it stays green for a route that never passes it).
    # CONTROL: summary_report, sliced the same way, carries it -- so the slicer reads a route.
    rsrc = (Path(SERVER_DIR) / "app" / "reports.py").read_text(encoding="utf-8")
    def body_of(fn: str) -> str:
        start = rsrc.index(f"async def {fn}(")
        nxt = rsrc.find("\n@router.", start)
        return rsrc[start:nxt if nxt != -1 else len(rsrc)]
    rr = 'isolation_level="REPEATABLE READ"'
    check(rr in body_of("sales_report") and rr in body_of("summary_report"),
          f"SC14.3 /reports/sales opens its reads REPEATABLE READ: {rr in body_of('sales_report')}"
          f" (CONTROL summary_report: {rr in body_of('summary_report')})")

    # (5) the by=day bucket is the FIXED shop offset, the purchase report's own expression, and no named zone.
    sday = body_of("sales_report") + rsrc[rsrc.index("_SALE_DAY ="):rsrc.index("_SALES_GROUPS = {")]
    check("make_interval(secs => :shop_offset_secs)" in sday and "AT TIME ZONE :tz" not in rsrc,
          "SC14.5 the sales report's day is the fixed offset (make_interval), and no route names a zone with :tz")
    # ...and the by=day query RUNS and agrees: every row is a shop day inside the requested range, and its totals are
    # by=product's over the same bills (one set, two groupings). SC11 checks by=product only; this is the day path.
    today_shop = (datetime.now(timezone.utc) + timedelta(hours=7)).date()
    d_from, d_to = (today_shop - timedelta(days=1)).isoformat(), today_shop.isoformat()
    rday = await fx.call("GET", f"/reports/sales?from_date={d_from}&to_date={d_to}&by=day")
    rprod = await fx.call("GET", f"/reports/sales?from_date={d_from}&to_date={d_to}&by=product")
    day_keys = sorted(r["key"] for r in rday["rows"])
    check(rday["totals"] == rprod["totals"] and day_keys and all(d_from <= k <= d_to for k in day_keys)
          and today_shop.isoformat() in day_keys,
          f"SC14.5 by=day runs: days {day_keys} within {d_from}..{d_to}, today's shop day present; totals {rday['totals']}"
          f" == by=product {rprod['totals']}")


def reconcile(scratch: str) -> None:
    header("SC12  reconcile.py over the whole scratch")
    cp = subprocess.run([sys.executable, os.path.join("scripts", "reconcile.py"), "--database", scratch],
                        cwd=SERVER_DIR, capture_output=True, timeout=600)
    out = (cp.stdout + cp.stderr).decode("utf-8", "replace").replace("\r\n", "\n")
    lines_ = [x for x in out.split("\n") if x.startswith("RECONCILE_EXIT=")]
    reds = [x.strip()[:160] for x in out.split("\n") if "[FAIL]" in x][:6]
    check(lines_ == ["RECONCILE_EXIT=0"], f"SC12 {lines_} {reds}")


async def main() -> int:
    app_live = make_url(os.environ["APP_DATABASE_URL"])
    dir_live = make_url(os.environ["DIRECTORY_DATABASE_URL"])
    if SCRATCH_DB == app_live.database:
        print("REFUSED: the scratch name equals the live database")
        return 2
    print(f"  restoring scratch {SCRATCH_DB!r} from a live dump of {app_live.database!r}...")
    try:
        restore_scratch(app_live.database, SCRATCH_DB)
    except Exception as exc:  # noqa: BLE001
        print(f"REFUSED: could not restore the scratch: {exc}")
        return 2
    os.environ["APP_DATABASE_URL"] = app_live.set(database=SCRATCH_DB).render_as_string(hide_password=False)
    os.environ["DIRECTORY_DATABASE_URL"] = dir_live.set(database=SCRATCH_DB).render_as_string(hide_password=False)
    env = dict(os.environ)
    env["MIGRATION_DATABASE_URL"] = make_url(os.environ["MIGRATION_DATABASE_URL"]).set(database=SCRATCH_DB).render_as_string(
        hide_password=False)
    cp = subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], cwd=SERVER_DIR, env=env, capture_output=True)
    db = Db(os.environ["APP_DATABASE_URL"], SCRATCH_DB)
    rev = await db.fetchval("SELECT version_num FROM alembic_version")
    if cp.returncode != 0 or rev is None or rev < "0029":
        print(f"UNFIT: scratch at {rev}: {cp.stderr.decode('utf-8', 'replace')[-600:]}")
        return 2
    shop = Shop()
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    log = tempfile.NamedTemporaryFile(mode="w", suffix=".log", prefix="prove_sales_", delete=False, encoding="utf-8")
    proc = subprocess.Popen([sys.executable, "-u", "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(port),
                             "--log-level", "warning"], cwd=SERVER_DIR, env=dict(os.environ), stdout=log, stderr=subprocess.STDOUT)
    try:
        deadline, up = time.time() + 40, False
        while time.time() < deadline and proc.poll() is None and not up:
            try:
                up = httpx.get(f"{base}/health", timeout=2.0).status_code == 200
            except httpx.HTTPError:
                time.sleep(0.25)
        check(up, "E0 the child server answers /health")
        if not up:
            return 1
        await provision(shop)
        async with httpx.AsyncClient(base_url=base, timeout=60.0) as c:
            for who in shop.uid:
                r = await c.post("/auth/login", json={"tenant_id": str(shop.id), "username": shop.names[who],
                                                     "password": shop.pw[who]})
                shop.tok[who] = r.json().get("access_token", "") if r.status_code == 200 else ""
            check(all(shop.tok.values()), "E0 owner, admin and staff sign in")
            fx = Fx(c, shop)
            try:
                await build(fx)
            except Exception as exc:  # noqa: BLE001
                print(f"UNFIT: {exc}")
                return 2
            await cells(fx, db)
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                proc.kill()
        log.close()
        tail = open(log.name, encoding="utf-8", errors="replace").read()[-2500:]
        if failures and tail.strip():
            print("\n--- server log tail ---\n" + tail)
        try:
            os.unlink(log.name)
        except OSError:
            pass
    reconcile(SCRATCH_DB)
    print(f"\n  passes={len(passes)}  failures={len(failures)}")
    for f in failures:
        print(f"    RED: {f}")
    return 1 if failures else 0


if __name__ == "__main__":
    rc = asyncio.run(main())
    print(f"PROVE_SALES_EXIT={rc}")
    sys.exit(rc)
