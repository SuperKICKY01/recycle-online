"""Seed DEV fixtures: two tenants, each with an admin user (known password) and
master data (uom, category, product, seller). Runs as the app role under tenant
context (SET LOCAL), exactly like the runtime. Idempotent.

    python scripts/seed_dev.py      (from the server/ directory)
"""
from __future__ import annotations

import asyncio
import os
import sys

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
                await conn.execute(
                    text(
                        "INSERT INTO products (id, tenant_id, category_id, uom_id, code, name)"
                        " VALUES (:id, :t, :c, :u, 'FE-STEEL', 'Steel scrap')"
                        " ON CONFLICT (id) DO NOTHING"
                    ),
                    {"id": s["product_id"], "t": s["tenant_id"],
                     "c": s["category_id"], "u": s["uom_id"]},
                )
                await conn.execute(
                    text(
                        "INSERT INTO sellers (id, tenant_id, code, name, phone)"
                        " VALUES (:id, :t, 'S001', :nm, '0800000000') ON CONFLICT (id) DO NOTHING"
                    ),
                    {"id": s["seller_id"], "t": s["tenant_id"],
                     "nm": f"Seller of {s['tenant_name']}"},
                )
            print(f"seeded tenant {s['tenant_id']}: admin user + uom/category/product/seller")
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
