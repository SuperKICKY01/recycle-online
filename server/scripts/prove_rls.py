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
from contextlib import AsyncExitStack, asynccontextmanager
from decimal import Decimal

from dotenv import load_dotenv
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import create_async_engine

load_dotenv()

# app.permissions.seed_system_roles is the application's OWN provisioning of a
# tenant's three system roles (migration 0019), imported so this fixture cannot
# drift from provision_shop.py. server/ (the parent directory) holds `app`.
import sys  # noqa: E402

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.permissions import seed_system_roles  # noqa: E402

APP_URL = os.environ["APP_DATABASE_URL"]

# tenants is keyed on `id`; the others on `tenant_id`. grade_tiers (0015) is
# included so a tier this proof seeds is counted by the straggler check, and
# branches (0018) for the same reason -- the born-with branch this proof seeds
# is a row of the tenant's graph.
ALL_TABLES = [
    "tenants", "users", "uoms", "product_categories", "products",
    "product_prices", "sellers", "grade_tiers", "branches",
    "purchase_bills", "purchase_bill_items",
    # roles and role_permissions (0019): the three system roles and their grants
    # this proof seeds are rows of the tenant's graph.
    "roles", "role_permissions",
]


# Teardown order: children before parents, so no composite FK is ever violated.
# grade_tiers sits AFTER product_prices and sellers (both FK to it) and BEFORE
# tenants (it FKs to tenants) -- migration 0015.
_TEARDOWN_ORDER = [
    "purchase_bill_items", "purchase_bills", "product_prices", "products",
    "sellers", "grade_tiers", "product_categories", "uoms", "users",
    # branches (0018) AFTER purchase_bills and users (both FK to it) and BEFORE
    # tenants (it FKs to tenants).
    "branches",
    # role_permissions then roles (0019): AFTER users (users.role_id FKs to
    # roles) and BEFORE tenants. roles is deleted by the OWNER, like a tier.
    "role_permissions", "roles", "tenants",
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
        # Audited-table writes (the seed INSERTs and the teardown DELETEs) need an
        # actor (0017); this proof is a system writer. Set for the same transaction.
        await conn.execute(
            text("SELECT set_config('app.actor_id', :a, true)"),
            {"a": "00000000-0000-0000-0000-000000000000"})
        await conn.execute(
            text("SELECT set_config('app.actor_username', :u, true)"),
            {"u": "system:prove_rls"})
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
           ("user", "uom", "cat", "product", "price", "seller", "bill", "item", "branch")}
    await conn.execute(
        text("INSERT INTO tenants (id, name) VALUES (:id, :name)"),
        {"id": tid, "name": f"Shop {label}"})
    # THE BORN-WITH BRANCH (0018): purchase_bills.branch_id is NOT NULL with a
    # composite FK to branches, so a tenant this proof mints by SQL must be
    # provisioned with its branch exactly as provision_shop.py provisions one --
    # the same conscription 0015 applied for the tier above. The bill below
    # lands in it.
    await conn.execute(
        text("INSERT INTO branches (id, tenant_id, code, name, doc_prefix, is_active)"
             " VALUES (:id, :t, 'MAIN', :name, 'B', true)"),
        {"id": ids["branch"], "t": tid, "name": f"Shop {label}"})
    # THE THREE SYSTEM ROLES (0019): users.role_id is NOT NULL with a composite
    # FK to roles, so the tenant is provisioned with its roles first, as
    # provision_shop.py provisions them. app.tenant_id == tid, so this exercises
    # the RLS WITH CHECK on roles and role_permissions too.
    roles = await seed_system_roles(conn, tid)
    await conn.execute(
        text("INSERT INTO users (id, tenant_id, username, full_name, role_id, password_hash)"
             " VALUES (:id, :t, 'admin', :fn, :role_id, 'x')"),
        {"id": ids["user"], "t": tid, "fn": f"Admin {label}", "role_id": roles["admin"]})
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
    # grade_tiers FIRST (0015): product_prices.grade is a composite FK to
    # grade_tiers (tenant_id, code), so tier 'A' must exist before the price row
    # below references it. app.tenant_id == tid, so this exercises the RLS WITH
    # CHECK on grade_tiers too.
    await conn.execute(
        text("INSERT INTO grade_tiers (tenant_id, code, name, sort_order, is_active)"
             " VALUES (:t, 'A', 'A', 0, true)"),
        {"t": tid})
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
             " (id, tenant_id, seller_id, idempotency_key, total_amount, device_created_at,"
             "  branch_id)"
             " VALUES (:id, :t, :s, :idem, :amt, now(), :br)"),
        {"id": ids["bill"], "t": tid, "s": ids["seller"],
         "idem": f"idem-{label}-0001", "amt": Decimal("105.00"), "br": ids["branch"]})
    await conn.execute(
        text("INSERT INTO purchase_bill_items"
             " (id, tenant_id, bill_id, product_id, line_no,"
             "  gross_weight, tare_weight, net_weight, unit_price, list_price, amount)"
             " VALUES (:id, :t, :b, :p, 1, :gw, :tw, :nw, :up, :lp, :amt)"),
        {"id": ids["item"], "t": tid, "b": ids["bill"], "p": ids["product"],
         "gw": Decimal("10.500"), "tw": Decimal("0.500"), "nw": Decimal("10.000"),
         "up": Decimal("10.50"), "lp": Decimal("10.50"), "amt": Decimal("105.00")})
    return ids


async def drop_tenant(conn, owner_conn, tid) -> tuple[int, list[str]]:
    """Delete one THROWAWAY tenant's entire graph. Returns (rows, errors).

    WHY DELETING IS RIGHT HERE, AND ONLY HERE. Hard rule 5 forbids hard-deleting
    a transaction because a bill is a receipt for real money that must stay
    readable for years. It was never about a tenant this script invented with
    uuid4() eight seconds earlier, whose bills are decoration for an isolation
    test. Leaving them behind cost 44 undeletable NULL-doc_no bills across 44
    husk tenants, found by the first run of scripts/reconcile.py — a permanent
    red on a checker, over rows the product cannot produce. See
    lessons/a-proof-fixture-must-be-a-row-the-product-could-produce.md.

    NOTE THERE IS NO `WHERE tenant_id` ANYWHERE. Each DELETE runs inside this
    tenant's own context, so RLS scopes it — the same policy the rest of this
    script exists to prove. That is what makes an unqualified DELETE safe: with
    no context the predicate matches nothing and it removes ZERO rows (fails
    closed), and under a context it cannot reach past that tenant even in
    principle. A hand-written predicate would be the version that can be wrong.

    Each statement gets its OWN transaction so a failure on one table cannot
    skip the tables after it (lessons/proof-must-run-twice.md, third amendment).
    """
    removed, errors = 0, []
    for table in _TEARDOWN_ORDER:
        # grade_tiers is deleted by the OWNER: F4 REVOKEs DELETE from recycle_app,
        # so the app role cannot remove a tier. The owner is FORCE-RLS-bound too,
        # so with the tenant context set the DELETE is still scoped to this one
        # tenant -- the same isolation, one privileged role over. branches
        # (0018) is the same case: a branch is deactivated, never deleted, so
        # the app role holds no DELETE on it either.
        # roles (0019) is the same case again: deactivated, never deleted.
        dc = owner_conn if table in ("grade_tiers", "branches", "roles") else conn
        try:
            async with tenant_tx(dc, tid):
                removed += (await dc.execute(text(f"DELETE FROM {table}"))).rowcount
        except Exception as e:  # noqa: BLE001 - report every one, skip none
            errors.append(f"{table}: {type(e).__name__}: {str(e).splitlines()[0]}")
    return removed, errors


async def teardown(conn, owner_conn, tenant_a, tenant_b, failures: list[str]) -> None:
    """Remove both throwaway tenants, and ASSERT that nothing was left behind.

    "It passed" and "it cleaned up" are separate claims and this makes the second
    one an assertion rather than a hope — otherwise the day the teardown silently
    stops working is the day the debris starts accumulating again, invisibly.
    """
    banner("TEARDOWN - remove the two throwaway tenants this run invented")
    for label, tid in (("A", tenant_a), ("B", tenant_b)):
        removed, errors = await drop_tenant(conn, owner_conn, tid)
        print(f"  tenant {label} {tid}: {removed} rows removed")
        for e in errors:
            print(f"    !!! {e}")
            failures.append(f"teardown of tenant {label} failed on {e}")

    # Read back through the SAME RLS path: with the tenant gone, its context sees
    # nothing. A non-empty answer here means rows survived.
    for label, tid in (("A", tenant_a), ("B", tenant_b)):
        async with tenant_tx(conn, tid):
            left = {t: (await conn.execute(text(f"SELECT count(*) FROM {t}"))).scalar_one()
                    for t in ALL_TABLES}
        stragglers = {t: n for t, n in left.items() if n}
        if stragglers:
            print(f"  !!! tenant {label} still holds rows: {stragglers}")
            failures.append(f"teardown left rows behind for tenant {label}: {stragglers}")
        else:
            print(f"  tenant {label}: nothing left in any of the {len(ALL_TABLES)} tables")


async def count_all(conn) -> dict:
    out = {}
    for t in ALL_TABLES:
        out[t] = (await conn.execute(text(f"SELECT count(*) FROM {t}"))).scalar_one()
    return out


async def main() -> int:
    engine = create_async_engine(APP_URL)
    # A SECOND engine as the OWNER, used ONLY to delete grade_tiers in teardown.
    # F4 REVOKEs DELETE on grade_tiers from recycle_app (a tier is deactivated,
    # never deleted), so a throwaway tenant's tier cannot be removed by the app
    # role, and its tenant then cannot be dropped either (grade_tiers FKs to
    # tenants). The owner CAN delete it, and is FORCE-RLS-bound too, so with the
    # tenant context set the DELETE is still scoped to that one tenant.
    owner_engine = create_async_engine(os.environ["MIGRATION_DATABASE_URL"])
    failures: list[str] = []
    tenant_a, tenant_b = uuid.uuid4(), uuid.uuid4()

    # ONE connection for the whole run. Step 6 reuses it deliberately, to prove
    # the LOCAL tenant context did not leak out of its transaction.
    async with AsyncExitStack() as stack:
        conn = await stack.enter_async_context(engine.connect())
        owner_conn = await stack.enter_async_context(owner_engine.connect())
        # Teardown is registered HERE, before a single fixture row exists, so it
        # runs on EVERY exit path — including an unexpected exception halfway
        # through a step. Callbacks unwind LIFO, so it fires while the connection
        # is still open and before it is returned to the pool.
        stack.push_async_callback(teardown, conn, owner_conn, tenant_a, tenant_b, failures)

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
        # branch_id is A's OWN born-with branch here, on purpose: since 0018 the
        # column is NOT NULL, and leaving it out would have this INSERT refused
        # for a reason that is not the seller FK -- a red for the wrong cause
        # (lessons/correct-classification-can-still-render-as-an-error.md).
        try:
            async with tenant_tx(conn, tenant_a):
                await conn.execute(
                    text("INSERT INTO purchase_bills"
                         " (id, tenant_id, seller_id, idempotency_key,"
                         "  total_amount, device_created_at, branch_id)"
                         " VALUES (:id, :t, :s, :idem, 0, now(), :br)"),
                    {"id": uuid.uuid4(), "t": tenant_a, "s": ids_b["seller"],
                     "idem": "idem-A-fk-seller", "br": ids_a["branch"]})
            print("    !!! bill(A) -> seller(B) INSERT SUCCEEDED - THIS IS A FAILURE !!!")
            failures.append("a bill in A referenced a seller in B")
        except DBAPIError as e:
            first = str(e.orig).splitlines()[0] if e.orig else str(e).splitlines()[0]
            print(f"    bill(A) with seller_id = <B's seller pk>  -> rejected: {first}")

        # THE BRANCH LEG (0018): a bill in A naming B's branch. Seller is A's own,
        # tenant_id is A, so the ONLY thing that can refuse it is fk_bills_branch
        # (tenant_id, branch_id) -> branches (tenant_id, id). This is the
        # structural half of "a bill naming another tenant's branch is
        # unrepresentable"; the handler half (422 under RLS) is
        # prove_branches.py's.
        try:
            async with tenant_tx(conn, tenant_a):
                await conn.execute(
                    text("INSERT INTO purchase_bills"
                         " (id, tenant_id, seller_id, idempotency_key,"
                         "  total_amount, device_created_at, branch_id)"
                         " VALUES (:id, :t, :s, :idem, 0, now(), :br)"),
                    {"id": uuid.uuid4(), "t": tenant_a, "s": ids_a["seller"],
                     "idem": "idem-A-fk-branch", "br": ids_b["branch"]})
            print("    !!! bill(A) -> branch(B) INSERT SUCCEEDED - THIS IS A FAILURE !!!")
            failures.append("a bill in A referenced a branch in B")
        except DBAPIError as e:
            first = str(e.orig).splitlines()[0] if e.orig else str(e).splitlines()[0]
            if "fk_bills_branch" not in first:
                failures.append(
                    f"bill(A) -> branch(B) was refused, but not by fk_bills_branch: {first}")
            print(f"    bill(A) with branch_id = <B's branch pk>  -> rejected: {first}")

        try:
            async with tenant_tx(conn, tenant_a):
                await conn.execute(
                    text("INSERT INTO purchase_bill_items"
                         " (id, tenant_id, bill_id, product_id, line_no,"
                         "  gross_weight, tare_weight, net_weight,"
                         "  unit_price, list_price, amount)"
                         " VALUES (:id, :t, :b, :p, 2,"
                         "  1.000, 0.000, 1.000, 1.00, 1.00, 1.00)"),
                    {"id": uuid.uuid4(), "t": tenant_a,
                     "b": ids_a["bill"], "p": ids_b["product"]})
            print("    !!! item(A) -> product(B) INSERT SUCCEEDED - THIS IS A FAILURE !!!")
            failures.append("an item in A referenced a product in B")
        except DBAPIError as e:
            first = str(e.orig).splitlines()[0] if e.orig else str(e).splitlines()[0]
            print(f"    item(A) with product_id = <B's product pk> -> rejected: {first}")

    await engine.dispose()
    await owner_engine.dispose()

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
