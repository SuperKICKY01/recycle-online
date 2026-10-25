r"""M2 (ADVISOR-DECIDED 2026-10-25): buyers, sell bills, receipts, the stock ledger, cost.

A shop records sales to buyers on phone and desktop; stock per product moves with every purchase, sale,
adjustment and void; each sale line stores its cost at the moment the server records it; the owner sees
stock and GROSS profit (กำไรขั้นต้น), never net.

THE TABLES
  buyers                  per-shop master like sellers (code, name, phone, address, optional tax id,
                          note); NO id-card data. Deactivated, never deleted. Audited (master data).
  products.sell_price     the default sell price (NULL = none set). A sale line stores the price USED
                          (unit_price) and this default at the moment (list_price) -- hard rule 6.
  tenants.negative_stock  allow | refuse (default allow): whether a sale or a negative adjustment may take
                          a product's balance below zero. A MONEY setting (owner only).
  sale_bills / sale_bill_items
                          the purchase bill's eight guarantees: client UUID, idempotency key unique per
                          tenant, server doc_no, void (never delete) under the all-or-none CHECK, both
                          timestamps, gross/tare/deduction/net and 0027's per-line snapshot under the SAME
                          CHECKs (line_amount_rounded). The snapshot is NOT NULL here: a sale line has no
                          pre-0027 past. Each line also stores cost_per_unit and cost_amount, frozen.
  sale_doc_no_counters    the sale series, per (tenant, branch, BE year), gap-free like doc_no_counters.
                          doc_no = 'S-' || branch prefix || '-' || BE year || '-' || seq (S-B-2569-1). The
                          purchase shape ^[A-Z]{1,4}-YYYY-N has three parts and this one four, so the two
                          series can never be read as each other, whatever prefix a branch holds.
  sale_receipts / sale_receipt_allocations
                          money IN from a buyer, payments' shape mirrored (client id, idempotency, void,
                          allocations append-only). NOT payments itself: payments.seller_id is NOT NULL,
                          payment_allocations.bill_id references purchase_bills, and reconcile P1..P4 are
                          stated for money OUT -- reusing them needs a direction column, a nullable seller
                          and a polymorphic reference, each a constraint weakened that holds today.
                          Outstanding (ค้างรับ) = total - sum(allocations of live receipts), derived, stored
                          nowhere (0020's invariant 3).
  stock_movements         APPEND-ONLY (SELECT, INSERT). One row per purchase line (in), per sale line
                          (out), per adjustment (+/-, reason, author) and per void (a compensating row
                          naming the row it reverses, at most once). quantity in the product's unit
                          (the line's quantity: net weight, pieces, or 1 lot), value in money (the
                          purchase amount in; the stored cost out). Balance = sum(quantity), stock value =
                          sum(value), per (branch, product). No cache.
  owner_flags (widened)   kinds negative_stock, no_cost, late_purchase join off_rule; off_rule may name a
                          sale line.

THE BACKFILL, MARKED (0020's precedent): every existing purchase line gets its purchase movement (quantity =
its stored quantity, else its net weight -- a pre-0027 line was weight-priced; value = its stored amount),
and every line of a voided bill its void movement, all with recorded_by_migration = true so a reader tells a
reconstruction from a record. No purchase row is touched; the migration measures its own digest of them.

PERMISSIONS (six). Each is granted to every role holding the code it mirrors, so a shop's own roles follow:
  sales.create <- bills.create   sales.read <- bills.read   sales.void <- bills.void
  sales.receive <- payments.record   buyers.write <- sellers.write   stock.adjust <- master.write
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0029"
down_revision: Union[str, None] = "0028"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TENANT_MATCH = "NULLIF(current_setting('app.tenant_id', true), '')::uuid"
_SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000"
_ACTOR_NAME = "system:migration_0029"

# Restated from migration 0027 / app/money_rules.py (a migration is not a library).
ROUNDING_RULES = ("half_up_0.01", "down_0.01", "half_up_0.25", "down_0.25", "half_up_1", "down_1")
LINE_DEDUCTION_MODES = ("none", "kg", "percent")
PRICING_BASES = ("weight", "piece", "lump")
RECEIPT_METHODS = ("cash", "promptpay", "transfer")
MOVEMENT_KINDS = ("purchase", "sale", "adjust", "void_purchase", "void_sale")
FLAG_KINDS = ("off_rule", "negative_stock", "no_cost", "late_purchase")
OFF_RULE_KEYS = ("rounding_rule", "deduction_mode", "pricing_basis")

# (code, mirrors, description) -- ASCII, no quotes, no braces. Restated by hand in app/permissions.py; the
# boot check holds the two equal.
PERMISSIONS = (
    ("sales.create", "bills.create", "create a sell bill: POST /sales"),
    ("sales.read", "bills.read", "read the shop sell bills: GET /sales, GET /sales/id"),
    ("sales.void", "bills.void", "void a sell bill: POST /sales/id/void"),
    ("sales.receive", "payments.record", "record money received from a buyer: POST /sale-receipts, GET /sale-receipts"),
    ("buyers.write", "sellers.write", "create, edit, retire and reactivate a buyer: POST /buyers, PATCH /buyers/id,"
                                      " POST /buyers/id/deactivate and /activate"),
    ("stock.adjust", "master.write", "record a stock adjustment with a reason: POST /stock/adjustments"),
)
_CATALOGUE_BEFORE = 16
_CATALOGUE_AFTER = 22

_NEW = ("buyers", "sale_doc_no_counters", "sale_bills", "sale_bill_items", "sale_receipts",
        "sale_receipt_allocations", "stock_movements")
_LIFTED = ("tenants", "roles", "role_permissions", "purchase_bills", "purchase_bill_items", "owner_flags")
_OLD_ITEM_COLUMNS = ("id", "tenant_id", "bill_id", "product_id", "line_no", "gross_weight", "tare_weight",
                     "net_weight", "unit_price", "list_price", "amount", "quantity", "rounding_rule")


def _in(values: Sequence[str]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def _purchase_digest(bind) -> tuple[int, str]:
    cols = ", ".join(f"i.{c}" for c in _OLD_ITEM_COLUMNS)
    row = bind.exec_driver_sql(
        f"SELECT count(*), coalesce(md5(string_agg(row({cols}, b.voided_at, b.total_amount)::text, '|'"
        " ORDER BY i.id)), '') FROM purchase_bill_items i JOIN purchase_bills b ON b.id = i.bill_id"
    ).one()
    return int(row[0]), str(row[1])


def _snapshot_checks(table: str, prefix: str) -> list[str]:
    """0027's line CHECKs, restated for the sale line, whose snapshot is NOT NULL (no pre-0027 past)."""
    return [
        f"ALTER TABLE {table} ADD CONSTRAINT ck_{prefix}_net CHECK (net_weight = gross_weight - tare_weight - deduction_weight)",
        f"ALTER TABLE {table} ADD CONSTRAINT ck_{prefix}_deduction CHECK ("
        " (deduction_mode = 'none' AND deduction_pct IS NULL AND deduction_weight = 0 AND deduction_reason IS NULL)"
        " OR (deduction_mode = 'kg' AND deduction_pct IS NULL AND deduction_weight > 0)"
        " OR (deduction_mode = 'percent' AND deduction_pct > 0 AND deduction_pct <= 100"
        "     AND deduction_weight = round((gross_weight - tare_weight) * deduction_pct / 100, 3)))",
        f"ALTER TABLE {table} ADD CONSTRAINT ck_{prefix}_quantity CHECK ("
        " (pricing_basis = 'weight' AND quantity = net_weight)"
        " OR (pricing_basis = 'piece' AND quantity > 0 AND quantity = trunc(quantity) AND deduction_mode = 'none')"
        " OR (pricing_basis = 'lump' AND quantity = 1 AND deduction_mode = 'none'))",
        f"ALTER TABLE {table} ADD CONSTRAINT ck_{prefix}_amount CHECK"
        " ((amount = public.line_amount_rounded(quantity, unit_price, rounding_rule)) IS TRUE)",
    ]


def upgrade() -> None:
    bind = op.get_bind()
    n0 = bind.exec_driver_sql("SELECT count(*) FROM permissions").scalar()
    if n0 != _CATALOGUE_BEFORE:
        raise RuntimeError(f"REFUSING 0029: {n0} catalogue rows before, expected {_CATALOGUE_BEFORE}. Nothing is committed.")
    for t in _LIFTED:
        op.execute(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")
    try:
        before = _purchase_digest(bind)

        # ------------------------------------------------------------------ settings
        op.execute("ALTER TABLE tenants ADD COLUMN negative_stock text NOT NULL DEFAULT 'allow'")
        op.execute("ALTER TABLE tenants ADD CONSTRAINT ck_tenants_negative_stock CHECK (negative_stock IN ('allow', 'refuse'))")
        op.execute("ALTER TABLE products ADD COLUMN sell_price numeric(14, 2)")
        op.execute("ALTER TABLE products ADD CONSTRAINT ck_products_sell_price CHECK (sell_price IS NULL OR sell_price >= 0)")

        # ------------------------------------------------------------------ buyers
        op.execute(
            """
            CREATE TABLE buyers (
                id          uuid        PRIMARY KEY,
                tenant_id   uuid        NOT NULL REFERENCES tenants (id),
                code        text        NOT NULL,
                name        text        NOT NULL,
                phone       text,
                address     text,
                tax_id      text,
                note        text,
                is_active   boolean     NOT NULL DEFAULT true,
                created_by  uuid        NOT NULL,
                created_at  timestamptz NOT NULL DEFAULT now(),
                CONSTRAINT uq_buyers_tenant_id   UNIQUE (tenant_id, id),
                CONSTRAINT uq_buyers_tenant_code UNIQUE (tenant_id, code),
                CONSTRAINT fk_buyers_created_by FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id),
                CONSTRAINT ck_buyers_code_len    CHECK (char_length(code) BETWEEN 1 AND 64),
                CONSTRAINT ck_buyers_name_len    CHECK (char_length(name) BETWEEN 1 AND 200),
                CONSTRAINT ck_buyers_phone_len   CHECK (phone IS NULL OR char_length(phone) BETWEEN 1 AND 32),
                CONSTRAINT ck_buyers_address_len CHECK (address IS NULL OR char_length(address) BETWEEN 1 AND 500),
                CONSTRAINT ck_buyers_tax_id      CHECK (tax_id IS NULL OR tax_id ~ '^[0-9]{13}$'),
                CONSTRAINT ck_buyers_note_len    CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500)
            )
            """
        )

        # ------------------------------------------------------------- the series
        op.execute(
            """
            CREATE TABLE sale_doc_no_counters (
                tenant_id uuid    NOT NULL REFERENCES tenants (id),
                branch_id uuid    NOT NULL,
                be_year   integer NOT NULL,
                last_seq  integer NOT NULL,
                CONSTRAINT pk_sale_doc_no_counters PRIMARY KEY (tenant_id, branch_id, be_year),
                CONSTRAINT fk_sale_counters_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id),
                CONSTRAINT ck_sale_counters_seq CHECK (last_seq >= 0)
            )
            """
        )

        # ---------------------------------------------------------------- the bill
        op.execute(
            """
            CREATE TABLE sale_bills (
                id                    uuid           PRIMARY KEY,
                tenant_id             uuid           NOT NULL REFERENCES tenants (id),
                branch_id             uuid           NOT NULL,
                buyer_id              uuid           NOT NULL,
                doc_no                text           NOT NULL,
                idempotency_key       text           NOT NULL,
                total_amount          numeric(14, 2) NOT NULL,
                vehicle_no            text,
                note                  text,
                device_created_at     timestamptz    NOT NULL,
                server_received_at    timestamptz    NOT NULL DEFAULT now(),
                created_by            uuid           NOT NULL,
                voided_at             timestamptz,
                voided_by             uuid,
                void_reason           text,
                void_idempotency_key  text,
                CONSTRAINT uq_sale_bills_tenant_id   UNIQUE (tenant_id, id),
                CONSTRAINT uq_sale_bills_tenant_idem UNIQUE (tenant_id, idempotency_key),
                CONSTRAINT uq_sale_bills_tenant_doc  UNIQUE (tenant_id, doc_no),
                CONSTRAINT uq_sale_bills_void_idem   UNIQUE (tenant_id, void_idempotency_key),
                CONSTRAINT fk_sale_bills_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id),
                CONSTRAINT fk_sale_bills_buyer  FOREIGN KEY (tenant_id, buyer_id)  REFERENCES buyers (tenant_id, id),
                CONSTRAINT fk_sale_bills_created_by FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id),
                CONSTRAINT fk_sale_bills_voided_by  FOREIGN KEY (tenant_id, voided_by)  REFERENCES users (tenant_id, id),
                CONSTRAINT ck_sale_bills_total   CHECK (total_amount >= 0),
                CONSTRAINT ck_sale_bills_doc_no  CHECK (doc_no ~ '^S-[A-Z]{1,4}-[0-9]{4}-[1-9][0-9]*$'),
                CONSTRAINT ck_sale_bills_idem_len CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
                CONSTRAINT ck_sale_bills_note_len CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
                CONSTRAINT ck_sale_bills_void_consistency CHECK (
                    (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL AND void_idempotency_key IS NULL)
                    OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL
                        AND char_length(void_reason) BETWEEN 1 AND 500))
            )
            """
        )

        # ---------------------------------------------------------------- the line
        op.execute(
            f"""
            CREATE TABLE sale_bill_items (
                id                uuid           PRIMARY KEY,
                tenant_id         uuid           NOT NULL REFERENCES tenants (id),
                bill_id           uuid           NOT NULL,
                product_id        uuid           NOT NULL,
                line_no           integer        NOT NULL,
                gross_weight      numeric(14, 3) NOT NULL,
                tare_weight       numeric(14, 3) NOT NULL,
                deduction_mode    text           NOT NULL,
                deduction_pct     numeric(5, 2),
                deduction_weight  numeric(14, 3) NOT NULL,
                deduction_reason  text,
                net_weight        numeric(14, 3) NOT NULL,
                pricing_basis     text           NOT NULL,
                quantity          numeric(14, 3) NOT NULL,
                unit_price        numeric(14, 2) NOT NULL,
                list_price        numeric(14, 2),
                rounding_rule     text           NOT NULL,
                amount            numeric(14, 2) NOT NULL,
                unit_code         text           NOT NULL,
                unit_name         text           NOT NULL,
                cost_per_unit     numeric(14, 4) NOT NULL,
                cost_amount       numeric(14, 2) NOT NULL,
                CONSTRAINT uq_sale_items_tenant_id   UNIQUE (tenant_id, id),
                CONSTRAINT uq_sale_items_bill_line   UNIQUE (tenant_id, bill_id, line_no),
                CONSTRAINT fk_sale_items_bill    FOREIGN KEY (tenant_id, bill_id)    REFERENCES sale_bills (tenant_id, id),
                CONSTRAINT fk_sale_items_product FOREIGN KEY (tenant_id, product_id) REFERENCES products (tenant_id, id),
                CONSTRAINT ck_sale_items_line_no CHECK (line_no > 0),
                CONSTRAINT ck_sale_items_nonneg  CHECK (gross_weight >= 0 AND tare_weight >= 0 AND net_weight >= 0
                                                        AND deduction_weight >= 0 AND unit_price >= 0
                                                        AND (list_price IS NULL OR list_price >= 0)),
                CONSTRAINT ck_sale_items_deduction_mode CHECK (deduction_mode IN ({_in(LINE_DEDUCTION_MODES)})),
                CONSTRAINT ck_sale_items_pricing_basis  CHECK (pricing_basis IN ({_in(PRICING_BASES)})),
                CONSTRAINT ck_sale_items_rounding_rule  CHECK (rounding_rule IN ({_in(ROUNDING_RULES)})),
                CONSTRAINT ck_sale_items_reason_len CHECK (deduction_reason IS NULL OR char_length(deduction_reason) BETWEEN 1 AND 200),
                CONSTRAINT ck_sale_items_cost CHECK (cost_per_unit >= 0 AND cost_amount >= 0
                                                     AND cost_amount = round(quantity * cost_per_unit, 2))
            )
            """
        )
        for stmt in _snapshot_checks("sale_bill_items", "sale_items"):
            op.execute(stmt)

        # -------------------------------------------------------------- receipts
        op.execute(
            f"""
            CREATE TABLE sale_receipts (
                id                 uuid           PRIMARY KEY,
                tenant_id          uuid           NOT NULL REFERENCES tenants (id),
                branch_id          uuid           NOT NULL,
                buyer_id           uuid           NOT NULL,
                method             text           NOT NULL,
                amount             numeric(14, 2) NOT NULL,
                idempotency_key    text           NOT NULL,
                device_created_at  timestamptz    NOT NULL,
                server_received_at timestamptz    NOT NULL DEFAULT now(),
                received_by        uuid           NOT NULL,
                note               text,
                voided_at          timestamptz,
                voided_by          uuid,
                void_reason        text,
                CONSTRAINT uq_sale_receipts_tenant_id   UNIQUE (tenant_id, id),
                CONSTRAINT uq_sale_receipts_tenant_idem UNIQUE (tenant_id, idempotency_key),
                CONSTRAINT fk_sale_receipts_branch FOREIGN KEY (tenant_id, branch_id) REFERENCES branches (tenant_id, id),
                CONSTRAINT fk_sale_receipts_buyer  FOREIGN KEY (tenant_id, buyer_id)  REFERENCES buyers (tenant_id, id),
                CONSTRAINT fk_sale_receipts_by     FOREIGN KEY (tenant_id, received_by) REFERENCES users (tenant_id, id),
                CONSTRAINT fk_sale_receipts_voided_by FOREIGN KEY (tenant_id, voided_by) REFERENCES users (tenant_id, id),
                CONSTRAINT ck_sale_receipts_method CHECK (method IN ({_in(RECEIPT_METHODS)})),
                CONSTRAINT ck_sale_receipts_amount CHECK (amount > 0),
                CONSTRAINT ck_sale_receipts_note_len CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
                CONSTRAINT ck_sale_receipts_void_consistency CHECK (
                    (voided_at IS NULL AND voided_by IS NULL AND void_reason IS NULL)
                    OR (voided_at IS NOT NULL AND voided_by IS NOT NULL AND void_reason IS NOT NULL))
            )
            """
        )
        op.execute(
            """
            CREATE TABLE sale_receipt_allocations (
                tenant_id  uuid           NOT NULL REFERENCES tenants (id),
                receipt_id uuid           NOT NULL,
                bill_id    uuid           NOT NULL,
                amount     numeric(14, 2) NOT NULL,
                CONSTRAINT pk_sale_receipt_allocations PRIMARY KEY (tenant_id, receipt_id, bill_id),
                CONSTRAINT fk_sale_alloc_receipt FOREIGN KEY (tenant_id, receipt_id) REFERENCES sale_receipts (tenant_id, id),
                CONSTRAINT fk_sale_alloc_bill    FOREIGN KEY (tenant_id, bill_id)    REFERENCES sale_bills (tenant_id, id),
                CONSTRAINT ck_sale_alloc_amount  CHECK (amount > 0)
            )
            """
        )

        # -------------------------------------------------------------- the ledger
        op.execute(
            f"""
            CREATE TABLE stock_movements (
                id                    uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
                tenant_id             uuid           NOT NULL REFERENCES tenants (id),
                branch_id             uuid           NOT NULL,
                product_id            uuid           NOT NULL,
                kind                  text           NOT NULL,
                quantity              numeric(14, 3) NOT NULL,
                value                 numeric(14, 2) NOT NULL,
                purchase_item_id      uuid,
                sale_item_id          uuid,
                reverses_movement_id  uuid,
                reason                text,
                created_by            uuid,
                device_created_at     timestamptz,
                idempotency_key       text,
                recorded_by_migration boolean        NOT NULL DEFAULT false,
                created_at            timestamptz    NOT NULL DEFAULT now(),
                CONSTRAINT uq_movements_tenant_id UNIQUE (tenant_id, id),
                CONSTRAINT uq_movements_idem UNIQUE (tenant_id, idempotency_key),
                CONSTRAINT fk_movements_branch  FOREIGN KEY (tenant_id, branch_id)  REFERENCES branches (tenant_id, id),
                CONSTRAINT fk_movements_product FOREIGN KEY (tenant_id, product_id) REFERENCES products (tenant_id, id),
                CONSTRAINT fk_movements_purchase_item FOREIGN KEY (tenant_id, purchase_item_id)
                    REFERENCES purchase_bill_items (tenant_id, id),
                CONSTRAINT fk_movements_sale_item FOREIGN KEY (tenant_id, sale_item_id) REFERENCES sale_bill_items (tenant_id, id),
                CONSTRAINT fk_movements_reverses FOREIGN KEY (tenant_id, reverses_movement_id)
                    REFERENCES stock_movements (tenant_id, id),
                CONSTRAINT fk_movements_created_by FOREIGN KEY (tenant_id, created_by) REFERENCES users (tenant_id, id),
                CONSTRAINT ck_movements_kind CHECK (kind IN ({_in(MOVEMENT_KINDS)})),
                CONSTRAINT ck_movements_reason_len CHECK (reason IS NULL OR char_length(reason) BETWEEN 1 AND 500),
                CONSTRAINT ck_movements_shape CHECK (
                    (kind = 'purchase' AND purchase_item_id IS NOT NULL AND sale_item_id IS NULL
                        AND reverses_movement_id IS NULL AND quantity >= 0 AND value >= 0)
                    OR (kind = 'sale' AND sale_item_id IS NOT NULL AND purchase_item_id IS NULL
                        AND reverses_movement_id IS NULL AND quantity <= 0 AND value <= 0)
                    OR (kind = 'adjust' AND purchase_item_id IS NULL AND sale_item_id IS NULL
                        AND reverses_movement_id IS NULL AND quantity <> 0 AND reason IS NOT NULL
                        AND created_by IS NOT NULL AND idempotency_key IS NOT NULL AND device_created_at IS NOT NULL
                        AND sign(value) IN (0, sign(quantity)))
                    OR (kind = 'void_purchase' AND purchase_item_id IS NOT NULL AND reverses_movement_id IS NOT NULL
                        AND sale_item_id IS NULL AND quantity <= 0 AND value <= 0)
                    OR (kind = 'void_sale' AND sale_item_id IS NOT NULL AND reverses_movement_id IS NOT NULL
                        AND purchase_item_id IS NULL AND quantity >= 0 AND value >= 0))
            )
            """
        )
        # One movement per line; a movement is reversed at most once.
        op.execute("CREATE UNIQUE INDEX uq_movements_purchase_line ON stock_movements (tenant_id, purchase_item_id)"
                   " WHERE kind = 'purchase'")
        op.execute("CREATE UNIQUE INDEX uq_movements_sale_line ON stock_movements (tenant_id, sale_item_id)"
                   " WHERE kind = 'sale'")
        op.execute("CREATE UNIQUE INDEX uq_movements_reverses ON stock_movements (tenant_id, reverses_movement_id)"
                   " WHERE reverses_movement_id IS NOT NULL")
        op.execute("CREATE INDEX ix_movements_stock ON stock_movements (tenant_id, branch_id, product_id, created_at)")

        # --------------------------------------------------------------- the flags
        op.execute("ALTER TABLE owner_flags ADD COLUMN sale_item_id uuid, ADD COLUMN cause_purchase_item_id uuid,"
                   " ADD COLUMN movement_id uuid, ADD COLUMN balance_after numeric(14, 3)")
        op.execute("ALTER TABLE owner_flags ADD CONSTRAINT fk_owner_flags_sale_item FOREIGN KEY (tenant_id, sale_item_id)"
                   " REFERENCES sale_bill_items (tenant_id, id)")
        op.execute("ALTER TABLE owner_flags ADD CONSTRAINT fk_owner_flags_cause FOREIGN KEY (tenant_id, cause_purchase_item_id)"
                   " REFERENCES purchase_bill_items (tenant_id, id)")
        op.execute("ALTER TABLE owner_flags ADD CONSTRAINT fk_owner_flags_movement FOREIGN KEY (tenant_id, movement_id)"
                   " REFERENCES stock_movements (tenant_id, id)")
        op.execute("ALTER TABLE owner_flags DROP CONSTRAINT ck_owner_flags_kind, DROP CONSTRAINT ck_owner_flags_off_rule")
        op.execute(f"ALTER TABLE owner_flags ADD CONSTRAINT ck_owner_flags_kind CHECK (kind IN ({_in(FLAG_KINDS)}))")
        keys = f"ARRAY[{_in(OFF_RULE_KEYS)}]::text[]"
        op.execute(
            "ALTER TABLE owner_flags ADD CONSTRAINT ck_owner_flags_shape CHECK ("
            " (kind = 'off_rule' AND num_nonnulls(purchase_item_id, sale_item_id) = 1"
            "   AND cause_purchase_item_id IS NULL AND movement_id IS NULL AND balance_after IS NULL"
            f"  AND off_rule_keys IS NOT NULL AND cardinality(off_rule_keys) > 0 AND off_rule_keys <@ {keys}"
            "   AND declared_rounding_rule IS NOT NULL AND effective_rounding_rule IS NOT NULL"
            "   AND declared_deduction_mode IS NOT NULL AND effective_deduction_mode IS NOT NULL"
            "   AND declared_pricing_basis IS NOT NULL AND effective_pricing_basis IS NOT NULL AND effective_at IS NOT NULL)"
            " OR (kind = 'negative_stock' AND movement_id IS NOT NULL AND balance_after IS NOT NULL AND balance_after < 0"
            "   AND purchase_item_id IS NULL AND off_rule_keys IS NULL)"
            " OR (kind = 'no_cost' AND sale_item_id IS NOT NULL AND purchase_item_id IS NULL AND off_rule_keys IS NULL)"
            " OR (kind = 'late_purchase' AND sale_item_id IS NOT NULL AND cause_purchase_item_id IS NOT NULL"
            "   AND purchase_item_id IS NULL AND off_rule_keys IS NULL))"
        )
        op.execute("CREATE UNIQUE INDEX uq_owner_flags_sale_item ON owner_flags (tenant_id, kind, sale_item_id)"
                   " WHERE sale_item_id IS NOT NULL AND kind IN ('off_rule', 'no_cost')")
        op.execute("CREATE UNIQUE INDEX uq_owner_flags_late ON owner_flags (tenant_id, sale_item_id, cause_purchase_item_id)"
                   " WHERE kind = 'late_purchase'")
        op.execute("CREATE UNIQUE INDEX uq_owner_flags_movement ON owner_flags (tenant_id, movement_id)"
                   " WHERE kind = 'negative_stock'")

        # ----------------------------------------------------------- the backfill
        # Every existing purchase line moves stock in; every line of a voided bill moves it back out. Marked.
        op.execute(
            """
            INSERT INTO stock_movements (tenant_id, branch_id, product_id, kind, quantity, value, purchase_item_id,
                                         recorded_by_migration, created_at)
            SELECT i.tenant_id, b.branch_id, i.product_id, 'purchase', coalesce(i.quantity, i.net_weight), i.amount,
                   i.id, true, b.server_received_at
              FROM purchase_bill_items i JOIN purchase_bills b ON b.id = i.bill_id
            """
        )
        op.execute(
            """
            INSERT INTO stock_movements (tenant_id, branch_id, product_id, kind, quantity, value, purchase_item_id,
                                         reverses_movement_id, recorded_by_migration, created_at)
            SELECT m.tenant_id, m.branch_id, m.product_id, 'void_purchase', -m.quantity, -m.value, m.purchase_item_id,
                   m.id, true, b.voided_at
              FROM stock_movements m
              JOIN purchase_bill_items i ON i.id = m.purchase_item_id
              JOIN purchase_bills b ON b.id = i.bill_id
             WHERE m.kind = 'purchase' AND b.voided_at IS NOT NULL
            """
        )

        # ------------------------------------------------------------ permissions
        for code, _mirror, desc in PERMISSIONS:
            op.execute(f"INSERT INTO permissions (code, description) VALUES ('{code}', '{desc}')")
        op.execute(f"SELECT set_config('app.actor_id', '{_SYSTEM_ACTOR}', true)")
        op.execute(f"SELECT set_config('app.actor_username', '{_ACTOR_NAME}', true)")
        for (tid,) in bind.exec_driver_sql("SELECT id FROM tenants").fetchall():
            op.execute(f"SELECT set_config('app.tenant_id', '{tid}', true)")
            for code, mirror, _desc in PERMISSIONS:
                op.execute(f"INSERT INTO role_permissions (tenant_id, role_id, permission)"
                           f" SELECT tenant_id, role_id, '{code}' FROM role_permissions"
                           f" WHERE tenant_id = '{tid}' AND permission = '{mirror}'")
        op.execute("SELECT set_config('app.tenant_id', '', true)")

        # ------------------------------------------------------------ read-backs
        after = _purchase_digest(bind)
        if after != before:
            raise RuntimeError(f"REFUSING 0029: purchase lines changed under the migration ({before} -> {after}).")
        n1 = bind.exec_driver_sql("SELECT count(*) FROM permissions").scalar()
        if n1 != _CATALOGUE_AFTER:
            raise RuntimeError(f"REFUSING 0029: {n1} catalogue rows after, expected {_CATALOGUE_AFTER}.")
        for code, mirror, _desc in PERMISSIONS:
            got = {r[0] for r in bind.exec_driver_sql(f"SELECT role_id FROM role_permissions WHERE permission = '{code}'")}
            want = {r[0] for r in bind.exec_driver_sql(f"SELECT role_id FROM role_permissions WHERE permission = '{mirror}'")}
            if got != want:
                raise RuntimeError(f"REFUSING 0029: {code} granted to {len(got)} roles, {mirror} held by {len(want)}.")
        lines = bind.exec_driver_sql("SELECT count(*) FROM purchase_bill_items").scalar()
        voided = bind.exec_driver_sql("SELECT count(*) FROM purchase_bill_items i JOIN purchase_bills b ON b.id = i.bill_id"
                                      " WHERE b.voided_at IS NOT NULL").scalar()
        moves = dict(bind.exec_driver_sql("SELECT kind, count(*) FROM stock_movements GROUP BY kind").fetchall())
        if moves.get("purchase", 0) != lines or moves.get("void_purchase", 0) != voided or set(moves) - {"purchase", "void_purchase"}:
            raise RuntimeError(f"REFUSING 0029: movements {moves} for {lines} purchase line(s), {voided} voided.")
        unbalanced = bind.exec_driver_sql(
            "SELECT count(*) FROM (SELECT i.id FROM purchase_bill_items i JOIN purchase_bills b ON b.id = i.bill_id"
            " JOIN stock_movements m ON m.purchase_item_id = i.id"
            " GROUP BY i.id, b.voided_at HAVING sum(m.quantity) <> CASE WHEN b.voided_at IS NULL"
            " THEN max(coalesce(i.quantity, i.net_weight)) ELSE 0 END) x").scalar()
        if unbalanced:
            raise RuntimeError(f"REFUSING 0029: {unbalanced} purchase line(s) whose movements do not net to the line.")

        # ---------------------------------------------------------- RLS and grants
        # LAST, after every read-back: FORCE binds the owner too, and a read-back under it with no tenant
        # context counts ZERO movements (measured on the first rehearsal: `movements {}` for 3707 lines;
        # lessons/a-migration-reads-zero-under-force-rls.md).
        for t in _NEW:
            op.execute(f"ALTER TABLE {t} ENABLE ROW LEVEL SECURITY")
            op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")
            op.execute(f"CREATE POLICY tenant_isolation ON {t} USING (tenant_id = {_TENANT_MATCH})"
                       f" WITH CHECK (tenant_id = {_TENANT_MATCH})")
        # Nothing here is ever DELETEd. Append-only (no UPDATE): the ledger and the allocations, as 0020's.
        op.execute("GRANT SELECT, INSERT, UPDATE ON buyers, sale_doc_no_counters, sale_bills, sale_receipts TO recycle_app")
        op.execute("REVOKE DELETE ON buyers, sale_doc_no_counters, sale_bills, sale_receipts FROM recycle_app")
        op.execute("GRANT SELECT, INSERT ON sale_bill_items, sale_receipt_allocations, stock_movements TO recycle_app")
        op.execute("REVOKE UPDATE, DELETE ON sale_bill_items, sale_receipt_allocations, stock_movements FROM recycle_app")
        op.execute("CREATE TRIGGER audit_capture AFTER INSERT OR UPDATE OR DELETE ON buyers"
                   " FOR EACH ROW EXECUTE FUNCTION audit_capture()")
    finally:
        for t in _LIFTED:
            op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")


def downgrade() -> None:
    bind = op.get_bind()
    for t in (*_LIFTED, *_NEW):
        op.execute(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")
    held = bind.exec_driver_sql(
        "SELECT (SELECT count(*) FROM buyers), (SELECT count(*) FROM sale_bills), (SELECT count(*) FROM sale_receipts),"
        " (SELECT count(*) FROM stock_movements WHERE NOT recorded_by_migration),"
        " (SELECT count(*) FROM owner_flags WHERE kind <> 'off_rule' OR sale_item_id IS NOT NULL),"
        " (SELECT count(*) FROM tenants WHERE negative_stock <> 'allow'),"
        " (SELECT count(*) FROM products WHERE sell_price IS NOT NULL)"
    ).one()
    if any(held):
        for t in _LIFTED:
            op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")
        raise RuntimeError(
            "REFUSING to downgrade 0029: it would destroy sale records, stock movements or a shop's declaration --"
            f" buyers={held[0]}, sale bills={held[1]}, receipts={held[2]}, movements recorded by the app={held[3]},"
            f" sale/stock flags={held[4]}, tenants with a negative-stock rule={held[5]}, products with a sell price={held[6]}."
            " Nothing is changed."
        )
    op.execute(f"SELECT set_config('app.actor_id', '{_SYSTEM_ACTOR}', true)")
    op.execute(f"SELECT set_config('app.actor_username', '{_ACTOR_NAME}', true)")
    codes = _in([c for c, _m, _d in PERMISSIONS])
    for (tid,) in bind.exec_driver_sql("SELECT id FROM tenants").fetchall():
        op.execute(f"SELECT set_config('app.tenant_id', '{tid}', true)")
        op.execute(f"DELETE FROM role_permissions WHERE tenant_id = '{tid}' AND permission IN ({codes})")
    op.execute("SELECT set_config('app.tenant_id', '', true)")
    op.execute(f"DELETE FROM permissions WHERE code IN ({codes})")
    op.execute("DROP INDEX uq_owner_flags_sale_item, uq_owner_flags_late, uq_owner_flags_movement")
    op.execute("ALTER TABLE owner_flags DROP CONSTRAINT ck_owner_flags_shape, DROP CONSTRAINT ck_owner_flags_kind")
    op.execute("ALTER TABLE owner_flags DROP CONSTRAINT fk_owner_flags_sale_item, DROP CONSTRAINT fk_owner_flags_cause,"
               " DROP CONSTRAINT fk_owner_flags_movement")
    op.execute("ALTER TABLE owner_flags DROP COLUMN sale_item_id, DROP COLUMN cause_purchase_item_id,"
               " DROP COLUMN movement_id, DROP COLUMN balance_after")
    keys = f"ARRAY[{_in(OFF_RULE_KEYS)}]::text[]"
    op.execute("ALTER TABLE owner_flags ADD CONSTRAINT ck_owner_flags_kind CHECK (kind IN ('off_rule'))")
    op.execute(
        "ALTER TABLE owner_flags ADD CONSTRAINT ck_owner_flags_off_rule CHECK (kind <> 'off_rule' OR ("
        " purchase_item_id IS NOT NULL AND off_rule_keys IS NOT NULL AND cardinality(off_rule_keys) > 0"
        f" AND off_rule_keys <@ {keys}"
        " AND declared_rounding_rule IS NOT NULL AND effective_rounding_rule IS NOT NULL"
        " AND declared_deduction_mode IS NOT NULL AND effective_deduction_mode IS NOT NULL"
        " AND declared_pricing_basis IS NOT NULL AND effective_pricing_basis IS NOT NULL AND effective_at IS NOT NULL))"
    )
    op.execute("DROP TRIGGER IF EXISTS audit_capture ON buyers")
    for t in ("stock_movements", "sale_receipt_allocations", "sale_receipts", "sale_bill_items", "sale_bills",
              "sale_doc_no_counters", "buyers"):
        op.execute(f"DROP TABLE {t}")
    op.execute("ALTER TABLE products DROP CONSTRAINT ck_products_sell_price, DROP COLUMN sell_price")
    op.execute("ALTER TABLE tenants DROP CONSTRAINT ck_tenants_negative_stock, DROP COLUMN negative_stock")
    for t in _LIFTED:
        op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")
