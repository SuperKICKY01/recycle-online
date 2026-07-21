"""Purchase bill endpoints (Phase 1c): atomic create, read, list, void.

A bill is submitted whole — header + all items in ONE request, inserted in ONE
transaction. All-or-nothing: there is never a header without its items.

Money is computed server-side with Decimal and stored as NUMERIC; client-sent
totals are only ever used to REJECT on mismatch, never trusted.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncConnection

from .auth import Principal, get_principal
from .db import tenant_connection

router = APIRouter()

_BE_OFFSET = 543  # Gregorian year + 543 = Buddhist-era year


def _be_year(when: datetime) -> int:
    return when.year + _BE_OFFSET


def _line_amount(net_weight: Decimal, unit_price: Decimal) -> Decimal:
    return (net_weight * unit_price).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


class BillItemIn(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    line_no: int = Field(gt=0)
    gross_weight: Decimal
    tare_weight: Decimal
    net_weight: Decimal
    unit_price: Decimal
    list_price: Decimal


class BillCreate(BaseModel):
    id: uuid.UUID
    seller_id: uuid.UUID
    vehicle_no: str | None = None
    device_created_at: datetime
    idempotency_key: str = Field(min_length=1)
    items: list[BillItemIn] = Field(min_length=1)
    # Optional client-computed total. If present it must equal the server total,
    # otherwise the request is rejected. It is never used as the stored value.
    total_amount: Decimal | None = None


class VoidRequest(BaseModel):
    reason: str = Field(min_length=1)


async def _read_bill(conn: AsyncConnection, bill_id) -> dict | None:
    h = (
        await conn.execute(
            text(
                "SELECT id, doc_no, seller_id, vehicle_no, idempotency_key, total_amount,"
                " device_created_at, server_received_at, voided_at, voided_by, void_reason"
                " FROM purchase_bills WHERE id = :id"
            ),
            {"id": bill_id},
        )
    ).mappings().first()
    if h is None:
        return None
    items = (
        await conn.execute(
            text(
                "SELECT id, product_id, line_no, gross_weight, tare_weight,"
                " net_weight, unit_price, list_price, amount"
                " FROM purchase_bill_items WHERE bill_id = :id ORDER BY line_no"
            ),
            {"id": bill_id},
        )
    ).mappings().all()
    return {
        "id": str(h["id"]),
        "doc_no": h["doc_no"],
        "seller_id": str(h["seller_id"]),
        "vehicle_no": h["vehicle_no"],
        "idempotency_key": h["idempotency_key"],
        "total_amount": str(h["total_amount"]),
        "device_created_at": h["device_created_at"].isoformat(),
        "server_received_at": h["server_received_at"].isoformat(),
        "status": "voided" if h["voided_at"] is not None else "active",
        "voided_at": h["voided_at"].isoformat() if h["voided_at"] else None,
        "voided_by": str(h["voided_by"]) if h["voided_by"] else None,
        "void_reason": h["void_reason"],
        "items": [
            {
                "id": str(i["id"]),
                "product_id": str(i["product_id"]),
                "line_no": i["line_no"],
                "gross_weight": str(i["gross_weight"]),
                "tare_weight": str(i["tare_weight"]),
                "net_weight": str(i["net_weight"]),
                "unit_price": str(i["unit_price"]),
                "list_price": str(i["list_price"]),
                "amount": str(i["amount"]),
            }
            for i in items
        ],
    }


@router.post("/bills", status_code=status.HTTP_201_CREATED)
async def create_bill(
    body: BillCreate,
    response: Response,
    principal: Principal = Depends(get_principal),
) -> dict:
    # ---- validate + compute money server-side (exact Decimal arithmetic) ----
    line_nos = [it.line_no for it in body.items]
    if len(set(line_nos)) != len(line_nos):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "duplicate line_no within bill")

    item_amounts: list[Decimal] = []
    for it in body.items:
        if it.net_weight != it.gross_weight - it.tare_weight:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"line {it.line_no}: net_weight must equal gross_weight - tare_weight",
            )
        item_amounts.append(_line_amount(it.net_weight, it.unit_price))
    server_total = sum(item_amounts, Decimal("0.00"))

    if body.total_amount is not None and body.total_amount != server_total:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"total mismatch: client sent {body.total_amount}, server computed {server_total}",
        )

    try:
        async with tenant_connection(principal.tenant_id) as conn:
            # Idempotency: the same key returns the SAME bill, never a duplicate.
            existing = (
                await conn.execute(
                    text("SELECT id FROM purchase_bills WHERE idempotency_key = :k"),
                    {"k": body.idempotency_key},
                )
            ).scalar_one_or_none()
            if existing is not None:
                response.status_code = status.HTTP_200_OK
                return await _read_bill(conn, existing)

            # References must exist IN THIS TENANT. RLS hides other tenants' rows,
            # so a foreign seller/product is simply "not found" here; the composite
            # (tenant_id, id) FKs are the hard structural backstop at insert time.
            if (
                await conn.execute(
                    text("SELECT 1 FROM sellers WHERE id = :s"), {"s": body.seller_id}
                )
            ).first() is None:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_ENTITY,
                    "seller_id does not exist in this tenant",
                )
            for it in body.items:
                if (
                    await conn.execute(
                        text("SELECT 1 FROM products WHERE id = :p"), {"p": it.product_id}
                    )
                ).first() is None:
                    raise HTTPException(
                        status.HTTP_422_UNPROCESSABLE_ENTITY,
                        f"product_id {it.product_id} does not exist in this tenant",
                    )

            # Assign a GAP-FREE doc_no. The counter row is upserted then locked by
            # the UPDATE, in the SAME transaction as the insert: concurrent submits
            # serialize on the row lock (no collision) and a rolled-back submit
            # releases its increment (no gap). A native sequence could not do this.
            be_year = _be_year(datetime.now(tz=timezone.utc))
            await conn.execute(
                text(
                    "INSERT INTO doc_no_counters (tenant_id, be_year, last_seq)"
                    " VALUES (:t, :y, 0) ON CONFLICT (tenant_id, be_year) DO NOTHING"
                ),
                {"t": principal.tenant_id, "y": be_year},
            )
            seq = (
                await conn.execute(
                    text(
                        "UPDATE doc_no_counters SET last_seq = last_seq + 1"
                        " WHERE tenant_id = :t AND be_year = :y RETURNING last_seq"
                    ),
                    {"t": principal.tenant_id, "y": be_year},
                )
            ).scalar_one()
            doc_no = f"B-{be_year}-{seq}"

            await conn.execute(
                text(
                    "INSERT INTO purchase_bills (id, tenant_id, seller_id, doc_no,"
                    " idempotency_key, total_amount, device_created_at, vehicle_no)"
                    " VALUES (:id, :t, :s, :dn, :k, :tot, :dca, :vn)"
                ),
                {
                    "id": body.id, "t": principal.tenant_id, "s": body.seller_id,
                    "dn": doc_no, "k": body.idempotency_key, "tot": server_total,
                    "dca": body.device_created_at, "vn": body.vehicle_no,
                },
            )
            for it, amt in zip(body.items, item_amounts):
                await conn.execute(
                    text(
                        "INSERT INTO purchase_bill_items (id, tenant_id, bill_id, product_id,"
                        " line_no, gross_weight, tare_weight, net_weight, unit_price,"
                        " list_price, amount)"
                        " VALUES (:id, :t, :b, :p, :ln, :gw, :tw, :nw, :up, :lp, :amt)"
                    ),
                    {
                        "id": it.id, "t": principal.tenant_id, "b": body.id,
                        "p": it.product_id, "ln": it.line_no,
                        "gw": it.gross_weight, "tw": it.tare_weight, "nw": it.net_weight,
                        "up": it.unit_price, "lp": it.list_price, "amt": amt,
                    },
                )
            return await _read_bill(conn, body.id)
    except IntegrityError as e:
        # Concurrent duplicate idempotency_key: the unique index fired. Return the
        # winner's bill instead of surfacing an error.
        constraint = getattr(getattr(e, "orig", None), "constraint_name", "") or ""
        if "idem" in constraint:
            async with tenant_connection(principal.tenant_id) as conn:
                existing = (
                    await conn.execute(
                        text("SELECT id FROM purchase_bills WHERE idempotency_key = :k"),
                        {"k": body.idempotency_key},
                    )
                ).scalar_one_or_none()
                if existing is not None:
                    response.status_code = status.HTTP_200_OK
                    return await _read_bill(conn, existing)
        raise


@router.get("/bills")
async def list_bills(
    limit: int = Query(50, ge=1, le=200),
    principal: Principal = Depends(get_principal),
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (
            await conn.execute(
                text(
                    "SELECT id, doc_no, seller_id, vehicle_no, total_amount,"
                    " device_created_at, server_received_at"
                    " FROM purchase_bills WHERE voided_at IS NULL"
                    " ORDER BY server_received_at DESC, id DESC LIMIT :lim"
                ),
                {"lim": limit},
            )
        ).mappings().all()
    return {
        "bills": [
            {
                "id": str(r["id"]),
                "doc_no": r["doc_no"],
                "seller_id": str(r["seller_id"]),
                "vehicle_no": r["vehicle_no"],
                "total_amount": str(r["total_amount"]),
                "device_created_at": r["device_created_at"].isoformat(),
                "server_received_at": r["server_received_at"].isoformat(),
            }
            for r in rows
        ]
    }


@router.get("/bills/{bill_id}")
async def get_bill(
    bill_id: uuid.UUID, principal: Principal = Depends(get_principal)
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        bill = await _read_bill(conn, bill_id)
    if bill is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "bill not found")
    return bill


@router.post("/bills/{bill_id}/void")
async def void_bill(
    bill_id: uuid.UUID,
    body: VoidRequest,
    principal: Principal = Depends(get_principal),
) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        h = (
            await conn.execute(
                text("SELECT voided_at FROM purchase_bills WHERE id = :id"),
                {"id": bill_id},
            )
        ).mappings().first()
        if h is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "bill not found")
        if h["voided_at"] is not None:
            raise HTTPException(status.HTTP_409_CONFLICT, "bill already voided")
        # doc_no is left untouched -> a voided bill keeps its number, and the
        # counter is never decremented, so the number is never reused.
        await conn.execute(
            text(
                "UPDATE purchase_bills"
                " SET voided_at = now(), voided_by = :by, void_reason = :r"
                " WHERE id = :id"
            ),
            {"by": principal.user_id, "r": body.reason, "id": bill_id},
        )
        return await _read_bill(conn, bill_id)
