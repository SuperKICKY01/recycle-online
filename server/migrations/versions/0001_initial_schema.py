"""initial schema: tenants + master data + purchase bills, with RLS

Revision ID: 0001
Revises:
Create Date: 2026-07-20

Phase 1a. Everything is created with raw SQL (op.execute) so the exact
DDL — NUMERIC types, composite tenant-consistent FKs, partial unique
indexes, and row-level security — is visible and reviewable in one place.

Design notes
------------
* Money columns are NUMERIC(14,2); weight columns NUMERIC(14,3). No float
  anywhere.
* Every business table carries `tenant_id uuid NOT NULL` referencing
  tenants(id). `tenants` itself is keyed by its own `id`.
* purchase_bills.id and purchase_bill_items.id have NO default: they are
  client-generated UUIDs supplied by the mobile app. All other PKs default
  to gen_random_uuid() (core in Postgres 13+).
* doc_no is nullable (assigned by the server at sync time). Uniqueness is a
  PARTIAL unique index so multiple not-yet-synced bills (doc_no IS NULL) can
  coexist per tenant.

Tenant-consistent foreign keys (the important bit)
--------------------------------------------------
A plain FK like purchase_bills.seller_id -> sellers.id does NOT stop a bill
in tenant X from pointing at a seller in tenant Y. We prevent that
STRUCTURALLY with COMPOSITE foreign keys that include tenant_id:

    UNIQUE (tenant_id, id) on every table that is referenced, then
    FOREIGN KEY (tenant_id, <child_col>) REFERENCES parent (tenant_id, id)

Because the child's own tenant_id participates in the FK, the referenced
row is forced to share the SAME tenant_id. Cross-tenant references become
impossible at the constraint level. Referential-integrity checks in Postgres
bypass RLS, so this guarantee holds regardless of the session's tenant
context — it is not something a policy could be tricked into skipping.

Row-Level Security
------------------
Every table has ENABLE + FORCE ROW LEVEL SECURITY and a single policy keyed
on the session GUC `app.tenant_id`. FORCE makes even the table owner obey it.
The runtime role (recycle_app) is NOSUPERUSER + NOBYPASSRLS, so it cannot
escape the policy. The GUC is read defensively:

    NULLIF(current_setting('app.tenant_id', true), '')::uuid

`true` = don't error if unset (returns NULL); NULLIF maps an empty string to
NULL too. With no tenant set the predicate becomes `col = NULL` -> unknown ->
no rows. The system fails CLOSED.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Reusable predicate for the RLS policies.
_TENANT_MATCH = "NULLIF(current_setting('app.tenant_id', true), '')::uuid"

# Tables that carry a tenant_id column (everything except `tenants`, which is
# keyed by its own id). Used to attach the standard RLS policy.
_TENANT_ID_TABLES = [
    "users",
    "uoms",
    "product_categories",
    "products",
    "product_prices",
    "sellers",
    "purchase_bills",
    "purchase_bill_items",
]

_ALL_TABLES = ["tenants", *_TENANT_ID_TABLES]


def upgrade() -> None:
    # ----------------------------------------------------------------- tenants
    op.execute(
        """
        CREATE TABLE tenants (
            id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            name       text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
        )
        """
    )

    # ------------------------------------------------------------------- users
    op.execute(
        """
        CREATE TABLE users (
            id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id     uuid NOT NULL REFERENCES tenants (id),
            username      text NOT NULL,
            full_name     text NOT NULL,
            role          text NOT NULL CHECK (role IN ('admin', 'staff')),
            password_hash text NOT NULL,
            created_at    timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_users_tenant_id       UNIQUE (tenant_id, id),
            CONSTRAINT uq_users_tenant_username UNIQUE (tenant_id, username)
        )
        """
    )

    # -------------------------------------------------------------------- uoms
    op.execute(
        """
        CREATE TABLE uoms (
            id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES tenants (id),
            code      text NOT NULL,
            name      text NOT NULL,
            CONSTRAINT uq_uoms_tenant_id   UNIQUE (tenant_id, id),
            CONSTRAINT uq_uoms_tenant_code UNIQUE (tenant_id, code)
        )
        """
    )

    # ------------------------------------------------------- product_categories
    op.execute(
        """
        CREATE TABLE product_categories (
            id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES tenants (id),
            code      text NOT NULL,
            name      text NOT NULL,
            CONSTRAINT uq_pcat_tenant_id   UNIQUE (tenant_id, id),
            CONSTRAINT uq_pcat_tenant_code UNIQUE (tenant_id, code)
        )
        """
    )

    # ---------------------------------------------------------------- products
    # Composite FKs to category and uom keep both within the same tenant.
    op.execute(
        """
        CREATE TABLE products (
            id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id   uuid NOT NULL REFERENCES tenants (id),
            category_id uuid NOT NULL,
            uom_id      uuid NOT NULL,
            code        text NOT NULL,
            name        text NOT NULL,
            CONSTRAINT uq_products_tenant_id   UNIQUE (tenant_id, id),
            CONSTRAINT uq_products_tenant_code UNIQUE (tenant_id, code),
            CONSTRAINT fk_products_category
                FOREIGN KEY (tenant_id, category_id)
                REFERENCES product_categories (tenant_id, id),
            CONSTRAINT fk_products_uom
                FOREIGN KEY (tenant_id, uom_id)
                REFERENCES uoms (tenant_id, id)
        )
        """
    )

    # ---------------------------------------------------------- product_prices
    # Current price list per product per grade (A-D). Historical bills store
    # their own unit_price/list_price and never read back from here.
    op.execute(
        """
        CREATE TABLE product_prices (
            id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id  uuid NOT NULL REFERENCES tenants (id),
            product_id uuid NOT NULL,
            grade      text NOT NULL CHECK (grade IN ('A', 'B', 'C', 'D')),
            price      numeric(14, 2) NOT NULL CHECK (price >= 0),
            CONSTRAINT uq_prices_tenant_product_grade
                UNIQUE (tenant_id, product_id, grade),
            CONSTRAINT fk_prices_product
                FOREIGN KEY (tenant_id, product_id)
                REFERENCES products (tenant_id, id)
        )
        """
    )

    # ----------------------------------------------------------------- sellers
    op.execute(
        """
        CREATE TABLE sellers (
            id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES tenants (id),
            code      text NOT NULL,
            name      text NOT NULL,
            phone     text,
            CONSTRAINT uq_sellers_tenant_id   UNIQUE (tenant_id, id),
            CONSTRAINT uq_sellers_tenant_code UNIQUE (tenant_id, code)
        )
        """
    )

    # ---------------------------------------------------------- purchase_bills
    # id: client-generated UUID (NO default). doc_no: server-assigned at sync,
    # nullable until then. All three timestamps kept per the offline model.
    op.execute(
        """
        CREATE TABLE purchase_bills (
            id                 uuid PRIMARY KEY,
            tenant_id          uuid NOT NULL REFERENCES tenants (id),
            seller_id          uuid NOT NULL,
            doc_no             text,
            idempotency_key    text NOT NULL,
            total_amount       numeric(14, 2) NOT NULL DEFAULT 0
                                   CHECK (total_amount >= 0),
            device_created_at  timestamptz NOT NULL,
            server_received_at timestamptz NOT NULL DEFAULT now(),
            voided_at          timestamptz,
            voided_by          uuid,
            void_reason        text,
            CONSTRAINT uq_bills_tenant_id   UNIQUE (tenant_id, id),
            CONSTRAINT uq_bills_tenant_idem UNIQUE (tenant_id, idempotency_key),
            CONSTRAINT fk_bills_seller
                FOREIGN KEY (tenant_id, seller_id)
                REFERENCES sellers (tenant_id, id),
            CONSTRAINT fk_bills_voided_by
                FOREIGN KEY (tenant_id, voided_by)
                REFERENCES users (tenant_id, id),
            -- A bill is either live, or fully voided: the three void fields
            -- move together. (voided_by is NULL on a live bill, so the
            -- MATCH SIMPLE composite FK above is simply not checked then.)
            CONSTRAINT ck_bills_void_consistency CHECK (
                (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
                OR
                (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL)
            )
        )
        """
    )
    # doc_no unique PER TENANT, ignoring the not-yet-synced (NULL) bills.
    op.execute(
        """
        CREATE UNIQUE INDEX uq_bills_tenant_docno
            ON purchase_bills (tenant_id, doc_no)
            WHERE doc_no IS NOT NULL
        """
    )

    # ----------------------------------------------------- purchase_bill_items
    # id: client-generated UUID (NO default). All three weights and both
    # prices stored; amount stored on the row (never recomputed from current
    # prices). net = gross - tare enforced (NUMERIC is exact).
    op.execute(
        """
        CREATE TABLE purchase_bill_items (
            id           uuid PRIMARY KEY,
            tenant_id    uuid NOT NULL REFERENCES tenants (id),
            bill_id      uuid NOT NULL,
            product_id   uuid NOT NULL,
            line_no      integer NOT NULL CHECK (line_no > 0),
            grade        text NOT NULL CHECK (grade IN ('A', 'B', 'C', 'D')),
            gross_weight numeric(14, 3) NOT NULL CHECK (gross_weight >= 0),
            tare_weight  numeric(14, 3) NOT NULL DEFAULT 0 CHECK (tare_weight >= 0),
            net_weight   numeric(14, 3) NOT NULL CHECK (net_weight >= 0),
            unit_price   numeric(14, 2) NOT NULL CHECK (unit_price >= 0),
            list_price   numeric(14, 2) NOT NULL CHECK (list_price >= 0),
            amount       numeric(14, 2) NOT NULL CHECK (amount >= 0),
            CONSTRAINT uq_items_tenant_bill_line UNIQUE (tenant_id, bill_id, line_no),
            CONSTRAINT fk_items_bill
                FOREIGN KEY (tenant_id, bill_id)
                REFERENCES purchase_bills (tenant_id, id),
            CONSTRAINT fk_items_product
                FOREIGN KEY (tenant_id, product_id)
                REFERENCES products (tenant_id, id),
            CONSTRAINT ck_items_net CHECK (net_weight = gross_weight - tare_weight)
        )
        """
    )

    # -------------------------------------------------------------------- RLS
    # tenants is keyed on its own id; every other table on tenant_id. Each
    # statement is issued separately: asyncpg uses the extended query protocol,
    # which forbids multiple commands in a single prepared statement.
    rls_targets = [("tenants", "id")] + [(t, "tenant_id") for t in _TENANT_ID_TABLES]
    for table, key in rls_targets:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(
            f"CREATE POLICY tenant_isolation ON {table} "
            f"USING ({key} = {_TENANT_MATCH}) "
            f"WITH CHECK ({key} = {_TENANT_MATCH})"
        )

    # ------------------------------------------------------------------ grants
    # The app role gets DML only. No ownership, no DDL, no TRUNCATE, no
    # sequence grants needed (all PKs are UUID). RLS still governs every row.
    op.execute(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public "
        "TO recycle_app"
    )
    # alembic_version is Alembic's own bookkeeping, not tenant data. The blanket
    # grant above also touched it; take that back so the app role has no access
    # to migration state. (The version table already exists at this point.)
    op.execute("REVOKE ALL ON alembic_version FROM recycle_app")


def downgrade() -> None:
    for table in reversed(_ALL_TABLES):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")
