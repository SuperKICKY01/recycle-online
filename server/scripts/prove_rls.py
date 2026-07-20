"""Phase 1a deliverable: PROVE tenant isolation via PostgreSQL RLS.

Connects AS THE APPLICATION ROLE (recycle_app) -- a non-superuser, non-owner,
NOBYPASSRLS role -- and proves, against a real database, that tenant data
cannot leak or be mutated across tenants.

Tenant context is applied with `SET LOCAL app.tenant_id` INSIDE a transaction
(set_config(..., is_local=True)). Being transaction-scoped, it is discarded on
commit/rollback and therefore CANNOT leak across pooled connections. A
session-level SET would leak: the same physical connection, handed back by the
pool, would still carry the previous tenant's id. Step 6 relies on this: it
reuses the very same connection as steps 1-5, opens a fresh transaction with no
context, and must see nothing.

Run from the server/ directory, db up and migrations applied:
    python scripts/prove_rls.py
"""
from __future__ import annotations

import asyncio
import os
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine

load_dotenv()

APP_URL = os.environ["APP_DATABASE_URL"]

# tenants is keyed on `id`; the other eight on `tenant_id`.
ALL_TABLES = [
    "tenants", "users", "uoms", "product_categories", "products",
    "product_prices", "sellers", "purchase_bills", "purchase_bill_items",
]


def banner(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


@asynccontextmanager
async def tenant_tx(conn, tid):
    """A transaction with app.tenant_id set LOCAL to it (transaction-scoped)."""
    async with conn.begin():
        await conn.execute(
            text("SELECT set_config('app.tenant_id', :v, true)"), {"v": str(tid)})
        yield


@asynccontextmanager
async def no_context_tx(conn):
    """A transaction with NO tenant context set at all."""
    async with conn.begin():
        yield


async def seed_tenant(conn, tid, label: str) -> dict:
    """Insert one complete tenant graph. app.tenant_id is already == tid, so
    this ALSO exercises the RLS WITH CHECK on every INSERT."""
    ids = {k: uuid.uuid4() for k in
           ("user", "uom", "cat", "product", "price", "seller", "bill", "item")}
    await conn.execute(
        text("INSERT INTO tenants (id, name) VALUES (:id, :name)"),
        {"id": tid, "name": f"Shop {label}"})
    await conn.execute(
        text("INSERT INTO users (id, tenant_id, username, full_name, role, password_hash)"
             " VALUES (:id, :t, 'admin', :fn, 'admin', 'x')"),
        {"id": ids["user"], "t": tid, "fn": f"Admin {label}"})
    await conn.execute(
        text("INSERT INTO uoms (id, tenant_id, code, name)"
             " VALUES (:id, :t, 'KG', 'Kilogram')"),
        {"id": ids["uom"], "t": tid})
    await conn.execute(
        text("INSERT INTO product_categories (id, tenant_id, code, name)"
             " VALUES (:id, :t, 'FERROUS', 'Ferrous metal')"),
        {"id": ids["cat"], "t": tid})
    await conn.execute(
        text("INSERT INTO products (id, tenant_id, category_id, uom_id, code, name)"
             " VALUES (:id, :t, :cat, :uom, 'FE-STEEL', 'Steel scrap')"),
        {"id": ids["product"], "t": tid, "cat": ids["cat"], "uom": ids["uom"]})
    await conn.execute(
        text("INSERT INTO product_prices (id, tenant_id, product_id, grade, price)"
             " VALUES (:id, :t, :p, 'A', :price)"),
        {"id": ids["price"], "t": tid, "p": ids["product"], "price": Decimal("10.50")})
    await conn.execute(
        text("INSERT INTO sellers (id, tenant_id, code, name, phone)"
             " VALUES (:id, :t, 'S001', :name, '0800000000')"),
        {"id": ids["seller"], "t": tid, "name": f"Seller {label}"})
    await conn.execute(
        text("INSERT INTO purchase_bills"
             " (id, tenant_id, seller_id, idempotency_key, total_amount, device_created_at)"
             " VALUES (:id, :t, :s, :idem, :amt, now())"),
        {"id": ids["bill"], "t": tid, "s": ids["seller"],
         "idem": f"idem-{label}-0001", "amt": Decimal("105.00")})
    await conn.execute(
        text("INSERT INTO purchase_bill_items"
             " (id, tenant_id, bill_id, product_id, line_no, grade,"
             "  gross_weight, tare_weight, net_weight, unit_price, list_price, amount)"
             " VALUES (:id, :t, :b, :p, 1, 'A', :gw, :tw, :nw, :up, :lp, :amt)"),
        {"id": ids["item"], "t": tid, "b": ids["bill"], "p": ids["product"],
         "gw": Decimal("10.500"), "tw": Decimal("0.500"), "nw": Decimal("10.000"),
         "up": Decimal("10.50"), "lp": Decimal("10.50"), "amt": Decimal("105.00")})
    return ids


async def count_all(conn) -> dict:
    out = {}
    for t in ALL_TABLES:
        out[t] = (await conn.execute(text(f"SELECT count(*) FROM {t}"))).scalar_one()
    return out


async def main() -> int:
    engine = create_async_engine(APP_URL)
    failures: list[str] = []
    tenant_a, tenant_b = uuid.uuid4(), uuid.uuid4()

    # ONE connection for the whole run. Step 6 reuses it deliberately, to prove
    # the LOCAL tenant context did not leak out of its transaction.
    async with engine.connect() as conn:
        banner("ROLE / PRIVILEGE PROOF  (this is who the queries run as)")
        async with conn.begin():
            row = (await conn.execute(text(
                "SELECT current_user AS u,"
                " current_setting('is_superuser') AS is_superuser,"
                " (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls"
            ))).mappings().one()
        print(f"  current_user   = {row['u']}")
        print(f"  is_superuser   = {row['is_superuser']}")
        print(f"  can bypass RLS = {row['bypassrls']}")
        if row["u"] != "recycle_app" or row["is_superuser"] != "off" or row["bypassrls"]:
            failures.append("connected role is not a plain, RLS-bound app role")

        banner("STEP 1 - seed two tenants with OVERLAPPING data (as the app role)")
        async with tenant_tx(conn, tenant_a):
            ids_a = await seed_tenant(conn, tenant_a, "A")
        async with tenant_tx(conn, tenant_b):
            ids_b = await seed_tenant(conn, tenant_b, "B")
        print(f"  tenant A = {tenant_a}")
        print(f"  tenant B = {tenant_b}")
        print("  both have uom 'KG', category 'FERROUS', product 'FE-STEEL',")
        print("  seller 'S001', user 'admin' -> identical natural keys, different tenants.")

        banner("STEP 2 - context = A: SELECT every table -> only A's rows")
        async with tenant_tx(conn, tenant_a):
            counts_a = await count_all(conn)
            for t in ALL_TABLES:
                key = "id" if t == "tenants" else "tenant_id"
                bad = (await conn.execute(
                    text(f"SELECT count(*) FROM {t} WHERE {key} <> :a"), {"a": tenant_a}
                )).scalar_one()
                if bad:
                    failures.append(f"{t}: {bad} row(s) not belonging to A were visible")
        for t, c in counts_a.items():
            print(f"    {t:22} rows visible = {c}")
        if any(c == 0 for c in counts_a.values()):
            failures.append("A saw 0 rows in some table it should own")
        print("    -> rows visible to A that are NOT A's: NONE")
        async with tenant_tx(conn, tenant_b):
            counts_b = await count_all(conn)
        print(f"    cross-check: seller rows visible to B = {counts_b['sellers']} "
              f"(so A's view is isolation, not an empty database)")

        banner("STEP 3 - context = A: fetch B's rows by EXACT primary key -> 0 rows")
        async with tenant_tx(conn, tenant_a):
            for t, pk in [("tenants", tenant_b), ("sellers", ids_b["seller"]),
                          ("purchase_bills", ids_b["bill"])]:
                n = (await conn.execute(
                    text(f"SELECT count(*) FROM {t} WHERE id = :pk"), {"pk": pk}
                )).scalar_one()
                print(f"    SELECT {t:16} WHERE id = <B's exact pk> -> {n} row(s)")
                if n != 0:
                    failures.append(f"{t}: B's row was fetchable by pk under A's context")

        banner("STEP 4 - context = A: UPDATE / DELETE B's seller -> 0 rows affected")
        async with tenant_tx(conn, tenant_a):
            ru = await conn.execute(
                text("UPDATE sellers SET name = 'HACKED' WHERE id = :pk"),
                {"pk": ids_b["seller"]})
            rd = await conn.execute(
                text("DELETE FROM sellers WHERE id = :pk"), {"pk": ids_b["seller"]})
            rc_update, rc_delete = ru.rowcount, rd.rowcount
        print(f"    UPDATE B's seller -> rowcount = {rc_update}")
        print(f"    DELETE B's seller -> rowcount = {rc_delete}")
        if rc_update != 0:
            failures.append("UPDATE crossed tenant boundary")
        if rc_delete != 0:
            failures.append("DELETE crossed tenant boundary")
        async with tenant_tx(conn, tenant_b):
            nm = (await conn.execute(
                text("SELECT name FROM sellers WHERE id = :pk"), {"pk": ids_b["seller"]}
            )).scalar_one_or_none()
        print(f"    B's seller name afterwards (checked as B) = {nm!r}")
        if nm != "Seller B":
            failures.append("B's seller was mutated/removed by A")

        banner("STEP 5 - context = A: INSERT a row with tenant_id = B -> rejected")
        try:
            async with tenant_tx(conn, tenant_a):
                await conn.execute(
                    text("INSERT INTO sellers (id, tenant_id, code, name)"
                         " VALUES (:id, :t, 'HACK', 'cross-tenant insert')"),
                    {"id": uuid.uuid4(), "t": tenant_b})
            print("    !!! INSERT SUCCEEDED - THIS IS A FAILURE !!!")
            failures.append("cross-tenant INSERT was allowed")
        except DBAPIError as e:
            first = str(e.orig).splitlines()[0] if e.orig else str(e).splitlines()[0]
            print(f"    INSERT rejected as expected: {first}")

        banner("STEP 6 - SAME connection, fresh tx, NO tenant context -> fail closed")
        async with no_context_tx(conn):
            setting = (await conn.execute(
                text("SELECT current_setting('app.tenant_id', true)"))).scalar_one_or_none()
            counts = await count_all(conn)
        print(f"    current_setting('app.tenant_id', true) = {setting!r}  "
              f"(LOCAL context from earlier tx did NOT leak)")
        for t, c in counts.items():
            print(f"    {t:22} rows visible = {c}")
        if any(c != 0 for c in counts.values()):
            failures.append("rows were visible with NO tenant context set")

        banner("STEP 7 - context = A: cross-tenant FOREIGN KEY references are rejected")
        # Both INSERTs satisfy the RLS WITH CHECK (their tenant_id = A), so the
        # ONLY thing that can stop them is the composite (tenant_id, x) foreign
        # keys, which force the referenced row into the SAME tenant.
        try:
            async with tenant_tx(conn, tenant_a):
                await conn.execute(
                    text("INSERT INTO purchase_bills"
                         " (id, tenant_id, seller_id, idempotency_key,"
                         "  total_amount, device_created_at)"
                         " VALUES (:id, :t, :s, :idem, 0, now())"),
                    {"id": uuid.uuid4(), "t": tenant_a, "s": ids_b["seller"],
                     "idem": "idem-A-fk-seller"})
            print("    !!! bill(A) -> seller(B) INSERT SUCCEEDED - THIS IS A FAILURE !!!")
            failures.append("a bill in A referenced a seller in B")
        except DBAPIError as e:
            first = str(e.orig).splitlines()[0] if e.orig else str(e).splitlines()[0]
            print(f"    bill(A) with seller_id = <B's seller pk>  -> rejected: {first}")

        try:
            async with tenant_tx(conn, tenant_a):
                await conn.execute(
                    text("INSERT INTO purchase_bill_items"
                         " (id, tenant_id, bill_id, product_id, line_no, grade,"
                         "  gross_weight, tare_weight, net_weight,"
                         "  unit_price, list_price, amount)"
                         " VALUES (:id, :t, :b, :p, 2, 'A',"
                         "  1.000, 0.000, 1.000, 1.00, 1.00, 1.00)"),
                    {"id": uuid.uuid4(), "t": tenant_a,
                     "b": ids_a["bill"], "p": ids_b["product"]})
            print("    !!! item(A) -> product(B) INSERT SUCCEEDED - THIS IS A FAILURE !!!")
            failures.append("an item in A referenced a product in B")
        except DBAPIError as e:
            first = str(e.orig).splitlines()[0] if e.orig else str(e).splitlines()[0]
            print(f"    item(A) with product_id = <B's product pk> -> rejected: {first}")

    await engine.dispose()

    banner("RESULT")
    if failures:
        print("  FAILED:")
        for f in failures:
            print(f"    - {f}")
        return 1
    print("  ALL CASES PASSED - tenant isolation holds for the app role.")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
