"""Sell bills (M2, SRS 2.2): create, read, list, void -- and money received from buyers.

  POST /sales                       sales.create   atomic create; idempotent replay returns the same bill
  GET  /sales                       sales.read     list, newest first; filters: from/to shop day, buyer, voided
  GET  /sales/{id}                  sales.read     one bill, its lines, received / outstanding
  POST /sales/{id}/void             sales.void     void with a reason; the stock comes back by compensation
  POST /sale-receipts               sales.receive  money in from a buyer, allocated to that buyer's bills
  GET  /sale-receipts               sales.receive  the receipts of one buyer

THE PURCHASE BILL'S GUARANTEES, EVERY ONE (bills.py says why each exists; the sale restates none of the
reasoning): client UUID; idempotency key unique per tenant, a repeat returns the first bill (200); doc_no
assigned here, gap-free per (branch, BE year) from sale_doc_no_counters, shape S-<prefix>-<year>-<seq>;
device_created_at AND server_received_at; voided never deleted; every line figure re-derived by
money_rules.compute_line from the rules the line declares (0027) and a figure that does not follow is a 422.

COST AND STOCK, in the same transaction as the lines: per line, under the product's lock, the ledger is read,
app/stock_cost.py prices the quantity going out, the line stores cost_per_unit and cost_amount, and a sale
movement (quantity -q, value -cost) is written. The shop's negative_stock setting decides a line that takes
the balance below zero: allow (the default) -> accepted and flagged negative_stock; refuse -> 409
insufficient_stock and nothing is written. A product never bought costs 0 and is flagged no_cost.

GROSS PROFIT is amount - cost_amount, per line and per bill, named กำไรขั้นต้น by every client; it is NOT
net profit (expenses arrive with M3), and no key here is called `profit`.

RECEIVED / OUTSTANDING are DERIVED (0020's invariant 3): received = sum of allocations from live receipts;
outstanding (ค้างรับ) = total - received; status unpaid | partial | paid. A sale may carry
`received_amount` -- the money handed over at the counter -- and the server writes ONE receipt for it in the
sale's own transaction (key 'auto-sale:<bill id>', so a replay cannot write a second).
"""
from __future__ import annotations

import datetime as dt
import logging
import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from .auth import Principal, require
from .bills import _be_year, _master_data_missing, _resolve_bill_branch, payment_status
from .db import tenant_connection
from .money_rules import DEFAULT_ROUNDING_RULE, LineIn, LineOut, LineRuleError, compute_line
from .permissions import Permission
from .policy import flag_if_off_rule
from .stock import flag, insert_movement, lock_product, read_ledger
from .stock_cost import cost_out

router = APIRouter()
logger = logging.getLogger("recycle.sales")

_M = Decimal("0.01")
_AUTO_RECEIPT_PREFIX = "auto-sale:"
INSUFFICIENT_STOCK_MESSAGE = "สินค้าคงเหลือไม่พอ — ร้านตั้งค่าไม่ให้ขายเกินสต็อก"


class SaleItemIn(BaseModel):
    """One sale line. The scale and sign bounds mirror the columns (bills.BillItemIn says why the edge
    must refuse what NUMERIC would silently round). The rule fields are optional and absent means the
    defaults, exactly as on a purchase line."""

    id: uuid.UUID
    product_id: uuid.UUID
    line_no: int = Field(gt=0)
    gross_weight: Decimal = Field(ge=0, max_digits=14, decimal_places=3)
    tare_weight: Decimal = Field(ge=0, max_digits=14, decimal_places=3)
    net_weight: Decimal = Field(ge=0, max_digits=14, decimal_places=3)
    unit_price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    pricing_basis: str | None = Field(default=None, min_length=1, max_length=16)
    quantity: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=3)
    rounding_rule: str | None = Field(default=None, min_length=1, max_length=16)
    deduction_mode: str | None = Field(default=None, min_length=1, max_length=16)
    deduction_pct: Decimal | None = Field(default=None, gt=0, le=100, max_digits=5, decimal_places=2)
    deduction_weight: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=3)
    deduction_reason: str | None = Field(default=None, max_length=200)


class SaleCreate(BaseModel):
    id: uuid.UUID
    buyer_id: uuid.UUID
    vehicle_no: str | None = Field(default=None, max_length=32)
    note: str | None = Field(default=None, max_length=500)
    device_created_at: datetime
    idempotency_key: str = Field(min_length=1, max_length=200)
    items: list[SaleItemIn] = Field(min_length=1)
    total_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    branch_id: uuid.UUID | None = None
    # The money the buyer handed over at the counter with this sale, if any (0 <= received <= total).
    received_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    received_method: Literal["cash", "promptpay", "transfer"] = "cash"


def _invalid(code: str, message: str, **ctx: Any) -> HTTPException:
    return HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, {"kind": "invalid", "code": code, "message": message, **ctx})


async def _received(conn: AsyncConnection, bill_id: Any) -> Decimal:
    return Decimal((await conn.execute(
        text("SELECT coalesce(sum(a.amount), 0) FROM sale_receipt_allocations a JOIN sale_receipts r ON r.id = a.receipt_id"
             " WHERE a.bill_id = :id AND r.voided_at IS NULL"), {"id": bill_id})).scalar_one()).quantize(_M)


async def read_sale(conn: AsyncConnection, bill_id: Any, *, with_cost: bool) -> dict | None:
    h = (await conn.execute(text(
        "SELECT s.id, s.doc_no, s.buyer_id, s.branch_id, s.vehicle_no, s.note, s.idempotency_key, s.total_amount,"
        " s.device_created_at, s.server_received_at, s.created_by, s.voided_at, s.voided_by, s.void_reason,"
        " b.code AS buyer_code, b.name AS buyer_name"
        " FROM sale_bills s LEFT JOIN buyers b ON b.id = s.buyer_id WHERE s.id = :id"), {"id": bill_id})).mappings().first()
    if h is None:
        return None
    items = (await conn.execute(text(
        "SELECT i.*, p.code AS product_code, p.name AS product_name FROM sale_bill_items i"
        " LEFT JOIN products p ON p.id = i.product_id WHERE i.bill_id = :id ORDER BY i.line_no"), {"id": bill_id})).mappings().all()
    received = await _received(conn, bill_id)
    total = h["total_amount"]
    cost_total = sum((i["cost_amount"] for i in items), Decimal("0.00"))
    out = {
        "id": str(h["id"]), "doc_no": h["doc_no"], "buyer_id": str(h["buyer_id"]), "buyer_code": h["buyer_code"],
        "buyer_name": h["buyer_name"], "branch_id": str(h["branch_id"]), "vehicle_no": h["vehicle_no"], "note": h["note"],
        "idempotency_key": h["idempotency_key"], "total_amount": str(total),
        "received_amount": str(received), "outstanding_amount": str((total - received).quantize(_M)),
        "receipt_status": payment_status(received, total),
        "device_created_at": h["device_created_at"].isoformat(), "server_received_at": h["server_received_at"].isoformat(),
        "created_by": str(h["created_by"]),
        "status": "voided" if h["voided_at"] is not None else "active",
        "voided_at": h["voided_at"].isoformat() if h["voided_at"] else None,
        "voided_by": str(h["voided_by"]) if h["voided_by"] else None, "void_reason": h["void_reason"],
        "items": [],
    }
    if with_cost:
        out["cost_amount"] = str(cost_total)
        out["gross_profit"] = str((total - cost_total).quantize(_M))
    for i in items:
        line = {
            "id": str(i["id"]), "product_id": str(i["product_id"]), "product_code": i["product_code"],
            "product_name": i["product_name"], "line_no": i["line_no"],
            "gross_weight": str(i["gross_weight"]), "tare_weight": str(i["tare_weight"]),
            "deduction_mode": i["deduction_mode"],
            "deduction_pct": None if i["deduction_pct"] is None else str(i["deduction_pct"]),
            "deduction_weight": str(i["deduction_weight"]), "deduction_reason": i["deduction_reason"],
            "net_weight": str(i["net_weight"]), "pricing_basis": i["pricing_basis"], "quantity": str(i["quantity"]),
            "unit_price": str(i["unit_price"]), "list_price": None if i["list_price"] is None else str(i["list_price"]),
            "rounding_rule": i["rounding_rule"], "amount": str(i["amount"]),
            "unit_code": i["unit_code"], "unit_name": i["unit_name"],
        }
        if with_cost:
            line["cost_per_unit"] = str(i["cost_per_unit"])
            line["cost_amount"] = str(i["cost_amount"])
            line["gross_profit"] = str((i["amount"] - i["cost_amount"]).quantize(_M))
        out["items"].append(line)
    return out


@router.post("/sales", status_code=status.HTTP_201_CREATED)
async def create_sale(body: SaleCreate, response: Response,
                      principal: Principal = Depends(require(Permission.SALES_CREATE))) -> dict:
    nos = [it.line_no for it in body.items]
    if len(set(nos)) != len(nos):
        raise _invalid("duplicate_line_no", "duplicate line_no within bill")
    computed: list[LineOut] = []
    reasons: list[str | None] = []
    for it in body.items:
        reason = (it.deduction_reason or "").strip() or None
        try:
            out = compute_line(LineIn(
                gross_weight=it.gross_weight, tare_weight=it.tare_weight, unit_price=it.unit_price,
                pricing_basis=it.pricing_basis or "weight", rounding_rule=it.rounding_rule or DEFAULT_ROUNDING_RULE,
                deduction_mode=it.deduction_mode or "none", deduction_pct=it.deduction_pct,
                deduction_weight=it.deduction_weight, quantity=it.quantity))
            if out.net_weight != it.net_weight:
                raise LineRuleError("net_mismatch", f"net_weight must equal gross_weight - tare_weight - deduction ({out.net_weight})")
            if reason is not None and (it.deduction_mode or "none") == "none":
                raise LineRuleError("reason_without_deduction", "a deduction_reason needs a deduction")
        except LineRuleError as e:
            raise _invalid(e.code, f"line {it.line_no}: {e}", line_no=it.line_no) from None
        computed.append(out)
        reasons.append(reason)
    total = sum((c.amount for c in computed), Decimal("0.00"))
    if body.total_amount is not None and body.total_amount != total:
        raise _invalid("total_mismatch", f"total mismatch: client sent {body.total_amount}, server computed {total}")
    if body.received_amount is not None and body.received_amount > total:
        raise _invalid("received_exceeds_total", "received_amount is more than the bill's total")

    try:
        async with tenant_connection(principal.tenant_id) as conn:
            existing = (await conn.execute(text("SELECT id FROM sale_bills WHERE idempotency_key = :k"),
                                           {"k": body.idempotency_key})).scalar_one_or_none()
            if existing is not None:
                response.status_code = status.HTTP_200_OK
                return await read_sale(conn, existing, with_cost=principal.has(Permission.MONEY_VIEW_SHOP))
            branch = await _resolve_bill_branch(conn, principal, body.branch_id)
            buyer = (await conn.execute(text("SELECT is_active FROM buyers WHERE id = :b"), {"b": body.buyer_id})).mappings().first()
            if buyer is None:
                raise _invalid("buyer_not_found", "buyer_id does not exist in this tenant")
            if not buyer["is_active"]:
                raise _master_data_missing("buyer_inactive", "ผู้ซื้อรายนี้ถูกปิดใช้งานแล้ว", buyer_id=str(body.buyer_id))
            refs: list[dict] = []
            for it in body.items:
                row = (await conn.execute(text(
                    "SELECT p.is_active, p.sell_price, u.code AS unit_code, u.name AS unit_name FROM products p"
                    " JOIN uoms u ON u.id = p.uom_id WHERE p.id = :p"), {"p": it.product_id})).mappings().first()
                if row is None:
                    raise _invalid("product_not_found", f"product_id {it.product_id} does not exist in this tenant")
                if not row["is_active"]:
                    raise _master_data_missing("product_inactive", "สินค้านี้ถูกปิดใช้งานแล้ว", product_id=str(it.product_id))
                refs.append(dict(row))
            policy = (await conn.execute(text("SELECT negative_stock FROM tenants"))).scalar_one()

            received_at = (await conn.execute(text("SELECT now()"))).scalar_one()
            be_year = _be_year(received_at)
            await conn.execute(text("INSERT INTO sale_doc_no_counters (tenant_id, branch_id, be_year, last_seq)"
                                    " VALUES (:t, :b, :y, 0) ON CONFLICT DO NOTHING"),
                               {"t": principal.tenant_id, "b": branch.id, "y": be_year})
            seq = (await conn.execute(text("UPDATE sale_doc_no_counters SET last_seq = last_seq + 1"
                                           " WHERE tenant_id = :t AND branch_id = :b AND be_year = :y RETURNING last_seq"),
                                      {"t": principal.tenant_id, "b": branch.id, "y": be_year})).scalar_one()
            doc_no = f"S-{branch.doc_prefix}-{be_year}-{seq}"
            await conn.execute(text(
                "INSERT INTO sale_bills (id, tenant_id, branch_id, buyer_id, doc_no, idempotency_key, total_amount,"
                " vehicle_no, note, device_created_at, server_received_at, created_by)"
                " VALUES (:id, :t, :br, :by, :dn, :k, :tot, :vn, :note, :dca, :sra, :cb)"),
                {"id": body.id, "t": principal.tenant_id, "br": branch.id, "by": body.buyer_id, "dn": doc_no,
                 "k": body.idempotency_key, "tot": total, "vn": body.vehicle_no, "note": body.note,
                 "dca": body.device_created_at, "sra": received_at, "cb": principal.user_id})

            for it, out, reason, ref in zip(body.items, computed, reasons, refs):
                mode = it.deduction_mode or "none"
                # THE COST, under the product's lock: the ledger read and this line's movement are one step.
                await lock_product(conn, branch.id, it.product_id)
                ledger = await read_ledger(conn, branch.id, it.product_id)
                cost = cost_out(ledger, out.quantity)
                if cost.balance_after < 0 and policy == "refuse":
                    raise HTTPException(status.HTTP_409_CONFLICT, {
                        "kind": "conflict", "code": "insufficient_stock", "message": INSUFFICIENT_STOCK_MESSAGE,
                        "line_no": it.line_no, "product_id": str(it.product_id),
                        "balance": str(ledger.quantity), "requested": str(out.quantity)})
                await conn.execute(text(
                    "INSERT INTO sale_bill_items (id, tenant_id, bill_id, product_id, line_no, gross_weight, tare_weight,"
                    " deduction_mode, deduction_pct, deduction_weight, deduction_reason, net_weight, pricing_basis, quantity,"
                    " unit_price, list_price, rounding_rule, amount, unit_code, unit_name, cost_per_unit, cost_amount)"
                    " VALUES (:id, :t, :b, :p, :ln, :gw, :tw, :dm, :dp, :dw, :dr, :nw, :pb, :q, :up, :lp, :rr, :amt, :uc,"
                    " :un, :cpu, :ca)"),
                    {"id": it.id, "t": principal.tenant_id, "b": body.id, "p": it.product_id, "ln": it.line_no,
                     "gw": it.gross_weight, "tw": it.tare_weight, "dm": mode,
                     "dp": it.deduction_pct if mode == "percent" else None, "dw": out.deduction_weight, "dr": reason,
                     "nw": out.net_weight, "pb": it.pricing_basis or "weight", "q": out.quantity, "up": it.unit_price,
                     "lp": ref["sell_price"], "rr": it.rounding_rule or DEFAULT_ROUNDING_RULE, "amt": out.amount,
                     "uc": ref["unit_code"], "un": ref["unit_name"], "cpu": cost.cost_per_unit, "ca": cost.cost_amount})
                mid = await insert_movement(conn, branch_id=branch.id, product_id=it.product_id, kind="sale",
                                            quantity=-out.quantity, value=-cost.cost_amount, sale_item_id=it.id,
                                            created_at=received_at)
                if cost.balance_after < 0:
                    await flag(conn, "negative_stock", branch.id, movement_id=mid, sale_item_id=it.id,
                               balance_after=cost.balance_after)
                if cost.basis == "none":
                    await flag(conn, "no_cost", branch.id, sale_item_id=it.id)
                await flag_if_off_rule(conn, branch_id=branch.id, product_id=it.product_id, item_column="sale_item_id",
                                       item_id=it.id, rounding_rule=it.rounding_rule or DEFAULT_ROUNDING_RULE,
                                       deduction_mode=mode, pricing_basis=it.pricing_basis or "weight",
                                       at=body.device_created_at)

            if body.received_amount is not None and body.received_amount > 0:
                rid = uuid.uuid4()
                await conn.execute(text(
                    "INSERT INTO sale_receipts (id, tenant_id, branch_id, buyer_id, method, amount, idempotency_key,"
                    " device_created_at, server_received_at, received_by) VALUES (:id, :t, :br, :by, :m, :amt, :k, :dca,"
                    " :sra, :rb)"),
                    {"id": rid, "t": principal.tenant_id, "br": branch.id, "by": body.buyer_id, "m": body.received_method,
                     "amt": body.received_amount, "k": f"{_AUTO_RECEIPT_PREFIX}{body.id}", "dca": body.device_created_at,
                     "sra": received_at, "rb": principal.user_id})
                await conn.execute(text("INSERT INTO sale_receipt_allocations (tenant_id, receipt_id, bill_id, amount)"
                                        " VALUES (:t, :r, :b, :amt)"),
                                   {"t": principal.tenant_id, "r": rid, "b": body.id, "amt": body.received_amount})
            return await read_sale(conn, body.id, with_cost=principal.has(Permission.MONEY_VIEW_SHOP))
    except IntegrityError:
        async with tenant_connection(principal.tenant_id) as conn:
            existing = (await conn.execute(text("SELECT id FROM sale_bills WHERE idempotency_key = :k"),
                                           {"k": body.idempotency_key})).scalar_one_or_none()
            if existing is not None:
                response.status_code = status.HTTP_200_OK
                return await read_sale(conn, existing, with_cost=principal.has(Permission.MONEY_VIEW_SHOP))
        raise


@router.get("/sales")
async def list_sales(
    limit: int = Query(50, ge=1, le=200),
    from_date: dt.date | None = Query(None), to_date: dt.date | None = Query(None),
    buyer_id: uuid.UUID | None = Query(None), include_voided: bool = Query(False),
    principal: Principal = Depends(require(Permission.SALES_READ)),
) -> dict:
    """Newest first. Dates are SHOP days (reports._day_window), over server_received_at. Money keys always;
    cost and gross profit only with money.view_shop."""
    from .reports import _day_window
    where, params = ["true"], {"lim": limit}
    if from_date is not None:
        where.append("s.server_received_at >= :f")
        params["f"] = _day_window(from_date)[0]
    if to_date is not None:
        where.append("s.server_received_at < :t")
        params["t"] = _day_window(to_date)[1]
    if buyer_id is not None:
        where.append("s.buyer_id = :b")
        params["b"] = buyer_id
    if not include_voided:
        where.append("s.voided_at IS NULL")
    with_cost = principal.has(Permission.MONEY_VIEW_SHOP)
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (await conn.execute(text(
            "SELECT s.id, s.doc_no, s.total_amount, s.server_received_at, s.device_created_at, s.voided_at,"
            " s.buyer_id, b.code AS buyer_code, b.name AS buyer_name,"
            " (SELECT coalesce(sum(i.cost_amount), 0) FROM sale_bill_items i WHERE i.bill_id = s.id) AS cost,"
            " (SELECT coalesce(sum(a.amount), 0) FROM sale_receipt_allocations a JOIN sale_receipts r ON r.id = a.receipt_id"
            "   WHERE a.bill_id = s.id AND r.voided_at IS NULL) AS received"
            f" FROM sale_bills s LEFT JOIN buyers b ON b.id = s.buyer_id WHERE {' AND '.join(where)}"
            " ORDER BY s.server_received_at DESC, s.id DESC LIMIT :lim"), params)).mappings().all()
    out = []
    for r in rows:
        received = Decimal(r["received"]).quantize(_M)
        item = {"id": str(r["id"]), "doc_no": r["doc_no"], "buyer_id": str(r["buyer_id"]), "buyer_code": r["buyer_code"],
                "buyer_name": r["buyer_name"], "total_amount": str(r["total_amount"]), "received_amount": str(received),
                "outstanding_amount": str((r["total_amount"] - received).quantize(_M)),
                "receipt_status": payment_status(received, r["total_amount"]),
                "server_received_at": r["server_received_at"].isoformat(),
                "device_created_at": r["device_created_at"].isoformat(),
                "status": "voided" if r["voided_at"] is not None else "active"}
        if with_cost:
            cost = Decimal(r["cost"]).quantize(_M)
            item["cost_amount"] = str(cost)
            item["gross_profit"] = str((r["total_amount"] - cost).quantize(_M))
        out.append(item)
    return {"sales": out}


@router.get("/sales/{sale_id}")
async def get_sale(sale_id: uuid.UUID, principal: Principal = Depends(require(Permission.SALES_READ))) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        s = await read_sale(conn, sale_id, with_cost=principal.has(Permission.MONEY_VIEW_SHOP))
    if s is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, {"kind": "not_found", "code": "sale_not_found",
                                                       "message": "ไม่พบบิลขายนี้"})
    return s


class SaleVoid(BaseModel):
    reason: str = Field(min_length=1, max_length=500)
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=200)


@router.post("/sales/{sale_id}/void")
async def void_sale(sale_id: uuid.UUID, body: SaleVoid,
                    principal: Principal = Depends(require(Permission.SALES_VOID))) -> dict:
    """Void, never delete (hard rule 5). The bill keeps every line, figure and cost; each line's stock comes
    back by a compensating movement naming the sale movement it reverses (never an edit of it). Receipts are
    NOT voided here: money already received stays a record of money received -- a refund is its own act (M3).
    A repeat with the same idempotency_key returns the voided bill; any other repeat is 409."""
    reason = body.reason.strip()
    if not reason:
        raise _invalid("reason_required", "ต้องระบุเหตุผลการยกเลิก")
    async with tenant_connection(principal.tenant_id) as conn:
        h = (await conn.execute(text("SELECT voided_at, void_idempotency_key, branch_id FROM sale_bills WHERE id = :id"
                                     " FOR UPDATE"), {"id": sale_id})).mappings().first()
        if h is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, {"kind": "not_found", "code": "sale_not_found",
                                                           "message": "ไม่พบบิลขายนี้"})
        if h["voided_at"] is not None:
            if body.idempotency_key is not None and body.idempotency_key == h["void_idempotency_key"]:
                return await read_sale(conn, sale_id, with_cost=principal.has(Permission.MONEY_VIEW_SHOP))
            raise HTTPException(status.HTTP_409_CONFLICT, {"kind": "conflict", "code": "sale_already_voided",
                                                          "message": "บิลขายนี้ถูกยกเลิกไปแล้ว"})
        now = (await conn.execute(text("SELECT now()"))).scalar_one()
        await conn.execute(text("UPDATE sale_bills SET voided_at = :at, voided_by = :by, void_reason = :r,"
                                " void_idempotency_key = :k WHERE id = :id"),
                           {"at": now, "by": principal.user_id, "r": reason, "k": body.idempotency_key, "id": sale_id})
        moves = (await conn.execute(text(
            "SELECT m.id, m.product_id, m.quantity, m.value, m.sale_item_id FROM stock_movements m"
            " JOIN sale_bill_items i ON i.id = m.sale_item_id WHERE i.bill_id = :b AND m.kind = 'sale' ORDER BY i.line_no"),
            {"b": sale_id})).mappings().all()
        for m in moves:
            await lock_product(conn, h["branch_id"], m["product_id"])
            await insert_movement(conn, branch_id=h["branch_id"], product_id=m["product_id"], kind="void_sale",
                                  quantity=-m["quantity"], value=-m["value"], sale_item_id=m["sale_item_id"],
                                  reverses_movement_id=m["id"], created_at=now)
        return await read_sale(conn, sale_id, with_cost=principal.has(Permission.MONEY_VIEW_SHOP))


class ReceiptAllocation(BaseModel):
    bill_id: uuid.UUID
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)


class ReceiptCreate(BaseModel):
    id: uuid.UUID
    buyer_id: uuid.UUID
    method: Literal["cash", "promptpay", "transfer"]
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    idempotency_key: str = Field(min_length=1, max_length=200)
    device_created_at: datetime
    note: str | None = Field(default=None, max_length=500)
    branch_id: uuid.UUID | None = None
    allocations: list[ReceiptAllocation] = Field(default_factory=list)


@router.post("/sale-receipts", status_code=status.HTTP_201_CREATED)
async def create_receipt(body: ReceiptCreate, response: Response,
                         principal: Principal = Depends(require(Permission.SALES_RECEIVE))) -> dict:
    """Money in from a buyer, allocated to that buyer's LIVE sale bills, each allocation no more than the bill's
    outstanding and their sum no more than the receipt. Unallocated money is the buyer's credit (an advance).
    Idempotent on the key."""
    ids = [a.bill_id for a in body.allocations]
    if len(set(ids)) != len(ids):
        raise _invalid("duplicate_bill", "a bill appears twice in one receipt")
    if sum((a.amount for a in body.allocations), Decimal("0")) > body.amount:
        raise _invalid("allocations_exceed_amount", "the allocations add up to more than the receipt")
    async with tenant_connection(principal.tenant_id) as conn:
        existing = (await conn.execute(text("SELECT id FROM sale_receipts WHERE idempotency_key = :k"),
                                       {"k": body.idempotency_key})).scalar_one_or_none()
        if existing is not None:
            response.status_code = status.HTTP_200_OK
            return await _read_receipt(conn, existing)
        branch = await _resolve_bill_branch(conn, principal, body.branch_id)
        if (await conn.execute(text("SELECT 1 FROM buyers WHERE id = :b"), {"b": body.buyer_id})).first() is None:
            raise _invalid("buyer_not_found", "buyer_id does not exist in this tenant")
        for a in body.allocations:
            s = (await conn.execute(text("SELECT buyer_id, voided_at, total_amount FROM sale_bills WHERE id = :id FOR UPDATE"),
                                    {"id": a.bill_id})).mappings().first()
            if s is None or s["buyer_id"] != body.buyer_id:
                raise _invalid("bill_not_this_buyers", "an allocated bill is not one of this buyer's sale bills",
                               bill_id=str(a.bill_id))
            if s["voided_at"] is not None:
                raise _invalid("bill_voided", "an allocated sale bill is voided", bill_id=str(a.bill_id))
            outstanding = s["total_amount"] - await _received(conn, a.bill_id)
            if a.amount > outstanding:
                raise _invalid("allocation_exceeds_outstanding", "an allocation is more than the bill still owes",
                               bill_id=str(a.bill_id), outstanding=str(outstanding))
        now = (await conn.execute(text("SELECT now()"))).scalar_one()
        await conn.execute(text(
            "INSERT INTO sale_receipts (id, tenant_id, branch_id, buyer_id, method, amount, idempotency_key,"
            " device_created_at, server_received_at, received_by, note) VALUES (:id, :t, :br, :by, :m, :amt, :k, :dca,"
            " :sra, :rb, :note)"),
            {"id": body.id, "t": principal.tenant_id, "br": branch.id, "by": body.buyer_id, "m": body.method,
             "amt": body.amount, "k": body.idempotency_key, "dca": body.device_created_at, "sra": now,
             "rb": principal.user_id, "note": (body.note or "").strip() or None})
        for a in body.allocations:
            await conn.execute(text("INSERT INTO sale_receipt_allocations (tenant_id, receipt_id, bill_id, amount)"
                                    " VALUES (:t, :r, :b, :amt)"),
                               {"t": principal.tenant_id, "r": body.id, "b": a.bill_id, "amt": a.amount})
        return await _read_receipt(conn, body.id)


async def _read_receipt(conn: AsyncConnection, rid: Any) -> dict:
    r = (await conn.execute(text("SELECT * FROM sale_receipts WHERE id = :id"), {"id": rid})).mappings().one()
    allocs = (await conn.execute(text("SELECT bill_id, amount FROM sale_receipt_allocations WHERE receipt_id = :id"
                                      " ORDER BY bill_id"), {"id": rid})).mappings().all()
    return {"id": str(r["id"]), "buyer_id": str(r["buyer_id"]), "method": r["method"], "amount": str(r["amount"]),
            "idempotency_key": r["idempotency_key"], "server_received_at": r["server_received_at"].isoformat(),
            "status": "voided" if r["voided_at"] is not None else "active",
            "allocations": [{"bill_id": str(a["bill_id"]), "amount": str(a["amount"])} for a in allocs]}


@router.get("/sale-receipts")
async def list_receipts(buyer_id: uuid.UUID = Query(...),
                        principal: Principal = Depends(require(Permission.SALES_RECEIVE))) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        ids = (await conn.execute(text("SELECT id FROM sale_receipts WHERE buyer_id = :b ORDER BY server_received_at DESC"),
                                  {"b": buyer_id})).scalars().all()
        return {"receipts": [await _read_receipt(conn, i) for i in ids]}
