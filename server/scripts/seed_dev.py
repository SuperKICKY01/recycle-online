"""Seed DEV fixtures: two tenants, each with an admin user (known password) and
master data (uom, category, product, seller). Runs as the app role under tenant
context (SET LOCAL), exactly like the runtime. Idempotent.

    python scripts/seed_dev.py      (from the server/ directory)
"""
from __future__ import annotations

import asyncio
import os
import sys
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text  # noqa: E402

from app.db import engine, tenant_connection  # noqa: E402
from app.security import hash_password  # noqa: E402
from app.seeddata import SEED  # noqa: E402


async def main() -> None:
    try:
        for s in SEED:
            pw_hash = await hash_password(s["password"])
            async with tenant_connection(s["tenant_id"]) as conn:
                await conn.execute(
                    text(
                        "INSERT INTO tenants (id, name) VALUES (:id, :name)"
                        " ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name"
                    ),
                    {"id": s["tenant_id"], "name": s["tenant_name"]},
                )
                await conn.execute(
                    text(
                        "INSERT INTO users (tenant_id, username, full_name, role, password_hash)"
                        " VALUES (:t, :u, :fn, 'admin', :ph)"
                        " ON CONFLICT (tenant_id, username)"
                        " DO UPDATE SET password_hash = EXCLUDED.password_hash,"
                        "               full_name = EXCLUDED.full_name"
                    ),
                    {"t": s["tenant_id"], "u": s["username"], "fn": s["full_name"], "ph": pw_hash},
                )
                await conn.execute(
                    text(
                        "INSERT INTO uoms (id, tenant_id, code, name)"
                        " VALUES (:id, :t, 'KG', 'Kilogram') ON CONFLICT (id) DO NOTHING"
                    ),
                    {"id": s["uom_id"], "t": s["tenant_id"]},
                )
                await conn.execute(
                    text(
                        "INSERT INTO product_categories (id, tenant_id, code, name)"
                        " VALUES (:id, :t, 'FERROUS', 'Ferrous metal') ON CONFLICT (id) DO NOTHING"
                    ),
                    {"id": s["category_id"], "t": s["tenant_id"]},
                )
                for p in s["products"]:
                    await conn.execute(
                        text(
                            "INSERT INTO products (id, tenant_id, category_id, uom_id, code, name)"
                            " VALUES (:id, :t, :c, :u, :code, :name)"
                            " ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code,"
                            "                                name = EXCLUDED.name"
                        ),
                        {"id": p["id"], "t": s["tenant_id"], "c": s["category_id"],
                         "u": s["uom_id"], "code": p["code"], "name": p["name"]},
                    )
                    for grade, price in p["prices"].items():
                        await conn.execute(
                            text(
                                "INSERT INTO product_prices (tenant_id, product_id, grade, price)"
                                " VALUES (:t, :p, :g, :price)"
                                " ON CONFLICT (tenant_id, product_id, grade)"
                                " DO UPDATE SET price = EXCLUDED.price"
                            ),
                            # Decimal, never float: price is NUMERIC(14,2).
                            {"t": s["tenant_id"], "p": p["id"], "g": grade,
                             "price": Decimal(price)},
                        )
                for sl in s["sellers"]:
                    await conn.execute(
                        text(
                            "INSERT INTO sellers (id, tenant_id, code, name, phone, grade)"
                            " VALUES (:id, :t, :code, :nm, :ph, :g)"
                            " ON CONFLICT (id) DO UPDATE SET code = EXCLUDED.code,"
                            "                                name = EXCLUDED.name,"
                            "                                phone = EXCLUDED.phone,"
                            "                                grade = EXCLUDED.grade"
                        ),
                        {"id": sl["id"], "t": s["tenant_id"], "code": sl["code"],
                         "nm": sl["name"], "ph": sl["phone"], "g": sl["grade"]},
                    )
            grades = ", ".join(str(sl["grade"] or "no grade") for sl in s["sellers"])
            print(
                f"seeded tenant {s['tenant_id']}: admin user, uom/category,"
                f" {len(s['products'])} products with A-D price tiers,"
                f" {len(s['sellers'])} sellers (grades: {grades})"
            )
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
