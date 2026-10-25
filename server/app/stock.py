"""The stock ledger (migration 0029): every movement a purchase, a sale, an adjustment or a void makes.

THE LEDGER IS THE ONLY STOCK. A product's balance at a branch is the sum of its movements' quantities and its
stock value the sum of their values; nothing caches either (cache only if measured necessary -- it is not yet).
stock_movements is APPEND-ONLY at the grant level: a mistake is answered by a compensating movement, never an
edit, and a void writes the exact reverse of the movement it undoes, naming it (at most once, a unique index).

SERIALISED PER PRODUCT. Reading the ledger and writing a movement happen under a transaction-scoped advisory
lock on (tenant, branch, product), so two sales of one product never cost against the same balance and a sale
never interleaves with the purchase that changes its average. The lock is released by the transaction's end.

COST is app/stock_cost.py's rule; this module only reads the ledger for it and writes what it returns.
"""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import text

from .auth import Principal, get_principal, require
from .branches import Branch, read_branch, read_caller_branch
from .db import tenant_connection
from .permissions import Permission
from .stock_cost import Cost, Ledger, cost_out, unit_cost

router = APIRouter()
_M = Decimal("0.01")


async def lock_product(conn: Any, branch_id: uuid.UUID, product_id: uuid.UUID) -> None:
    await conn.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended('stock:' || current_setting('app.tenant_id', true)"
             " || ':' || :b || ':' || :p, 0))"),
        {"b": str(branch_id), "p": str(product_id)},
    )


async def read_ledger(conn: Any, branch_id: uuid.UUID, product_id: uuid.UUID) -> Ledger:
    row = (
        await conn.execute(
            text("SELECT coalesce(sum(quantity), 0) AS q, coalesce(sum(value), 0) AS v FROM stock_movements"
                 " WHERE branch_id = :b AND product_id = :p"),
            {"b": branch_id, "p": product_id},
        )
    ).mappings().one()
    last = (
        await conn.execute(
            text("SELECT value, quantity FROM stock_movements WHERE branch_id = :b AND product_id = :p"
                 " AND kind = 'purchase' AND quantity > 0"
                 " AND NOT EXISTS (SELECT 1 FROM stock_movements r WHERE r.reverses_movement_id = stock_movements.id)"
                 " ORDER BY created_at DESC, id DESC LIMIT 1"),
            {"b": branch_id, "p": product_id},
        )
    ).mappings().first()
    return Ledger(quantity=Decimal(row["q"]), value=Decimal(row["v"]),
                  last_unit_cost=None if last is None else Decimal(last["value"]) / Decimal(last["quantity"]))


async def insert_movement(conn: Any, **cols: Any) -> uuid.UUID:
    mid = uuid.uuid4()
    names = ["id", "tenant_id", *cols]
    values = [":id", "NULLIF(current_setting('app.tenant_id', true), '')::uuid", *(f":{k}" for k in cols)]
    await conn.execute(text(f"INSERT INTO stock_movements ({', '.join(names)}) VALUES ({', '.join(values)})"),
                       {"id": mid, **cols})
    return mid


async def flag(conn: Any, kind: str, branch_id: uuid.UUID, **cols: Any) -> None:
    names = ["tenant_id", "branch_id", "kind", *cols]
    values = ["NULLIF(current_setting('app.tenant_id', true), '')::uuid", ":branch_id", ":kind", *(f":{k}" for k in cols)]
    await conn.execute(text(f"INSERT INTO owner_flags ({', '.join(names)}) VALUES ({', '.join(values)})"
                            " ON CONFLICT DO NOTHING"),
                       {"branch_id": branch_id, "kind": kind, **cols})


async def flag_late_sales(conn: Any, *, branch_id: uuid.UUID, product_id: uuid.UUID, purchase_item_id: uuid.UUID,
                          weighed_at: datetime) -> int:
    """A purchase arriving now that was WEIGHED (device_created_at) before a sale already recorded for the same
    product at the same branch: that sale was costed without it. The sale line is never re-costed (hard rule 6);
    one late_purchase flag names the sale line and this purchase line. Live sales only. Returns the flags written."""
    rows = (await conn.execute(text(
        "SELECT i.id FROM sale_bill_items i JOIN sale_bills s ON s.id = i.bill_id"
        " WHERE s.branch_id = :b AND i.product_id = :p AND s.voided_at IS NULL AND s.device_created_at > :w"),
        {"b": branch_id, "p": product_id, "w": weighed_at})).scalars().all()
    for sid in rows:
        await flag(conn, "late_purchase", branch_id, sale_item_id=sid, cause_purchase_item_id=purchase_item_id)
    return len(rows)


async def _branch_or_caller(conn: Any, principal: Principal, branch_id: uuid.UUID | None) -> Branch:
    """The branch a stock read or adjustment is about: the one named (404 when not this shop's), else the caller's
    own, else the shop's single active branch; a shop with several and an unscoped caller must name one (422)."""
    if branch_id is not None:
        b = await read_branch(conn, branch_id)
        if b is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND,
                                {"kind": "not_found", "code": "branch_not_found", "message": "ไม่พบสาขานี้"})
        return b
    caller = await read_caller_branch(conn, principal.user_id)
    if caller.branch is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            {"kind": "invalid", "code": "branch_required", "message": "ร้านนี้มีหลายสาขา -- ระบุสาขา",
                             "active_branches": str(caller.active_count)})
    return caller.branch


# ---------------------------------------------------------------------------
# routes
# ---------------------------------------------------------------------------
_M4 = Decimal("0.0001")
REASON_REQUIRED = "ต้องระบุเหตุผลการปรับสต็อก"
INSUFFICIENT_STOCK_MESSAGE = "สินค้าคงเหลือไม่พอ — ร้านตั้งค่าไม่ให้ขายหรือปรับลดเกินสต็อก"


@router.get("/stock")
async def stock_balances(branch_id: uuid.UUID | None = Query(None), include_inactive: bool = Query(False),
                         principal: Principal = Depends(get_principal)) -> dict:
    """Balance and stock value per product at one branch: the sums of the ledger, nothing cached. The average
    cost (value / balance, 4 dp) is shown only where the balance is positive. Value and average are MONEY:
    present only for money.view_shop; a yard account sees quantities."""
    money = principal.has(Permission.MONEY_VIEW_SHOP)
    async with tenant_connection(principal.tenant_id) as conn:
        branch = await _branch_or_caller(conn, principal, branch_id)
        rows = (await conn.execute(text(
            "SELECT p.id, p.code, p.name, p.is_active, p.category_id, u.code AS unit_code, u.name AS unit_name,"
            " coalesce(sum(m.quantity), 0) AS q, coalesce(sum(m.value), 0) AS v, count(m.id) AS moves"
            " FROM products p JOIN uoms u ON u.id = p.uom_id"
            " LEFT JOIN stock_movements m ON m.product_id = p.id AND m.branch_id = :b"
            + ("" if include_inactive else " WHERE p.is_active") +
            " GROUP BY p.id, p.code, p.name, p.is_active, p.category_id, u.code, u.name ORDER BY p.code"),
            {"b": branch.id})).mappings().all()
    items, total = [], Decimal("0.00")
    for r in rows:
        q, v = Decimal(r["q"]).quantize(Decimal("0.001")), Decimal(r["v"]).quantize(_M)
        it = {"product_id": str(r["id"]), "code": r["code"], "name": r["name"], "is_active": r["is_active"],
              "category_id": str(r["category_id"]), "unit_code": r["unit_code"], "unit_name": r["unit_name"],
              "quantity": str(q), "movements": int(r["moves"])}
        if money:
            it["value"] = str(v)
            it["average_cost"] = str((v / q).quantize(_M4, rounding=ROUND_HALF_UP)) if q > 0 else None
            total += v
        items.append(it)
    out = {"branch_id": str(branch.id), "items": items}
    if money:
        out["total_value"] = str(total)
    return out


@router.get("/stock/movements")
async def stock_movements(product_id: uuid.UUID = Query(...), branch_id: uuid.UUID | None = Query(None),
                          from_date: dt.date | None = Query(None), to_date: dt.date | None = Query(None),
                          limit: int = Query(200, ge=1, le=1000),
                          principal: Principal = Depends(get_principal)) -> dict:
    """One product's movements at one branch, newest first, each with the document it came from and the running
    balance AFTER it (computed over the whole ledger, so a date filter never shifts it)."""
    from .reports import _day_window
    money = principal.has(Permission.MONEY_VIEW_SHOP)
    async with tenant_connection(principal.tenant_id) as conn:
        branch = await _branch_or_caller(conn, principal, branch_id)
        where, params = ["x.product_id = :p", "x.branch_id = :b"], {"p": product_id, "b": branch.id, "lim": limit}
        if from_date is not None:
            where.append("x.created_at >= :f")
            params["f"] = _day_window(from_date)[0]
        if to_date is not None:
            where.append("x.created_at < :t")
            params["t"] = _day_window(to_date)[1]
        rows = (await conn.execute(text(
            "SELECT * FROM (SELECT m.id, m.product_id, m.branch_id, m.kind, m.quantity, m.value, m.reason, m.created_at,"
            " m.recorded_by_migration, coalesce(pb.doc_no, sb.doc_no) AS doc_no,"
            " sum(m.quantity) OVER (ORDER BY m.created_at, m.id) AS balance_after"
            " FROM stock_movements m"
            " LEFT JOIN purchase_bill_items pi ON pi.id = m.purchase_item_id LEFT JOIN purchase_bills pb ON pb.id = pi.bill_id"
            " LEFT JOIN sale_bill_items si ON si.id = m.sale_item_id LEFT JOIN sale_bills sb ON sb.id = si.bill_id"
            " WHERE m.product_id = :p AND m.branch_id = :b) x"
            f" WHERE {' AND '.join(where)} ORDER BY x.created_at DESC, x.id DESC LIMIT :lim"), params)).mappings().all()
    return {"product_id": str(product_id), "branch_id": str(branch.id), "movements": [
        {"id": str(r["id"]), "kind": r["kind"], "quantity": str(r["quantity"]),
         **({"value": str(r["value"])} if money else {}),
         "reason": r["reason"], "doc_no": r["doc_no"], "created_at": r["created_at"].isoformat(),
         "recorded_by_migration": r["recorded_by_migration"], "balance_after": str(r["balance_after"])}
        for r in rows]}


class AdjustmentIn(BaseModel):
    product_id: uuid.UUID
    quantity: Decimal = Field(max_digits=14, decimal_places=3)
    reason: str = Field(min_length=1, max_length=500)
    idempotency_key: str = Field(min_length=1, max_length=200)
    device_created_at: datetime
    branch_id: uuid.UUID | None = None


@router.post("/stock/adjustments", status_code=status.HTTP_201_CREATED)
async def adjust_stock(body: AdjustmentIn, response: Response,
                       principal: Principal = Depends(require(Permission.STOCK_ADJUST))) -> dict:
    """A counted correction: +quantity found, -quantity lost. Reason REQUIRED (blank after trimming is 422).
    Valued at the product's current unit cost (stock_cost.unit_cost), so it never moves the average. A minus that
    takes the balance below zero follows the shop's negative_stock rule exactly as a sale does. Idempotent."""
    reason = body.reason.strip()
    if not reason:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            {"kind": "invalid", "code": "reason_required", "message": REASON_REQUIRED})
    if body.quantity == 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            {"kind": "invalid", "code": "quantity_zero", "message": "จำนวนที่ปรับต้องไม่เป็นศูนย์"})
    async with tenant_connection(principal.tenant_id) as conn:
        prior = (await conn.execute(text("SELECT id FROM stock_movements WHERE idempotency_key = :k"),
                                    {"k": body.idempotency_key})).scalar_one_or_none()
        if prior is not None:
            response.status_code = status.HTTP_200_OK
            return await _read_movement(conn, prior)
        branch = await _branch_or_caller(conn, principal, body.branch_id)
        if (await conn.execute(text("SELECT 1 FROM products WHERE id = :p"), {"p": body.product_id})).first() is None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                {"kind": "invalid", "code": "product_not_found", "message": "ไม่พบสินค้านี้ในร้าน"})
        policy = (await conn.execute(text("SELECT negative_stock FROM tenants"))).scalar_one()
        await lock_product(conn, branch.id, body.product_id)
        ledger = await read_ledger(conn, branch.id, body.product_id)
        cpu, _basis = unit_cost(ledger)
        value = (abs(body.quantity) * cpu).quantize(_M, rounding=ROUND_HALF_UP) * (1 if body.quantity > 0 else -1)
        after = ledger.quantity + body.quantity
        if body.quantity < 0 and after < 0 and policy == "refuse":
            raise HTTPException(status.HTTP_409_CONFLICT, {
                "kind": "conflict", "code": "insufficient_stock", "message": INSUFFICIENT_STOCK_MESSAGE,
                "balance": str(ledger.quantity), "requested": str(-body.quantity)})
        mid = await insert_movement(conn, branch_id=branch.id, product_id=body.product_id, kind="adjust",
                                    quantity=body.quantity, value=value, reason=reason, created_by=principal.user_id,
                                    device_created_at=body.device_created_at, idempotency_key=body.idempotency_key)
        if body.quantity < 0 and after < 0:
            await flag(conn, "negative_stock", branch.id, movement_id=mid, balance_after=after)
        return await _read_movement(conn, mid)


async def _read_movement(conn: Any, mid: Any) -> dict:
    r = (await conn.execute(text("SELECT * FROM stock_movements WHERE id = :id"), {"id": mid})).mappings().one()
    return {"id": str(r["id"]), "kind": r["kind"], "product_id": str(r["product_id"]), "branch_id": str(r["branch_id"]),
            "quantity": str(r["quantity"]), "value": str(r["value"]), "reason": r["reason"],
            "idempotency_key": r["idempotency_key"], "created_at": r["created_at"].isoformat()}
