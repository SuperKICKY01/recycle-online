"""Read-only master data for the mobile client (Phase 2c-2).

Only what the bill form needs: the tenant's products with their unit and price
tiers, and the tenant's sellers. No writes — master-data CRUD belongs to the
desktop back office, not the yard app.

Tenant scoping is not spelled out in any query here. Each handler opens the
connection through tenant_connection(principal.tenant_id), which issues
SET LOCAL app.tenant_id inside the request transaction from the TOKEN's tenant;
RLS then makes every other tenant's rows invisible. There is no tenant_id
parameter to get wrong and no WHERE clause to forget — the same shape bills.py
uses.

Money is returned as STRINGS. Serialising NUMERIC through a JSON float is
precisely the drift this project forbids.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text

from .auth import Principal, get_principal
from .db import tenant_connection

router = APIRouter()


@router.get("/products")
async def list_products(principal: Principal = Depends(get_principal)) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (
            await conn.execute(
                text(
                    "SELECT p.id, p.code, p.name, u.code AS uom_code, u.name AS uom_name"
                    " FROM products p JOIN uoms u ON u.id = p.uom_id"
                    " ORDER BY p.code"
                )
            )
        ).mappings().all()
        prices = (
            await conn.execute(
                text(
                    "SELECT product_id, grade, price FROM product_prices"
                    " ORDER BY product_id, grade"
                )
            )
        ).mappings().all()

    by_product: dict[str, dict[str, str]] = {}
    for pr in prices:
        by_product.setdefault(str(pr["product_id"]), {})[pr["grade"]] = str(pr["price"])

    return {
        "products": [
            {
                "id": str(r["id"]),
                "code": r["code"],
                "name": r["name"],
                "uom_code": r["uom_code"],
                "uom_name": r["uom_name"],
                # {"A": "12.50", "B": "12.00", ...} — strings, never floats.
                "prices": by_product.get(str(r["id"]), {}),
            }
            for r in rows
        ]
    }


@router.get("/sellers")
async def list_sellers(principal: Principal = Depends(get_principal)) -> dict:
    async with tenant_connection(principal.tenant_id) as conn:
        rows = (
            await conn.execute(
                text("SELECT id, code, name, phone, grade FROM sellers ORDER BY code")
            )
        ).mappings().all()

    return {
        "sellers": [
            {
                "id": str(r["id"]),
                "code": r["code"],
                "name": r["name"],
                "phone": r["phone"],
                # Seller grade selects which product_prices tier applies (SRS 1.6).
                "grade": r["grade"],
            }
            for r in rows
        ]
    }
