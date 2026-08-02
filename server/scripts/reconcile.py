"""Reconcile a live database against the invariants the money rests on.

    python scripts/reconcile.py                       (from the server/ directory)
    python scripts/reconcile.py --database recycle_recon_scratch
    python scripts/reconcile.py --tenant 1111...      (one tenant; X2 cannot run)
    python scripts/reconcile.py --verbose --max-rows 0

Exit codes:  0 every check clean · 1 at least one VIOLATION · 2 the checker
could not run (no connection, a missing table, a check that errored). 1 and 2
are deliberately different: "the money is wrong" and "nobody looked" are not the
same news, and anything that treats them the same will one day report a silent
green because the database was unreachable.

WHY THIS EXISTS
---------------
Today the money is correct because the code is correct. Nothing checks it, and
nothing would say the day that stopped being true. Every rule below is one the
CODE currently keeps: doc_no is gap-free because create_bill increments a locked
counter row in the same transaction as the insert; total_amount equals its lines
because the server recomputes it and ignores the client's; a bill cannot point
at another shop's seller because a composite foreign key forbids it. This is not
a second opinion on that code — it is the instrument that notices when a
migration, a hand-run UPDATE, a restore, or some future write path quietly stops
keeping one of them. Nothing here is expected to fire. A check that fires is the
finding.

HOW IT READS — three lenses, deliberately
-----------------------------------------
1. THE APP'S OWN LENS. Every per-tenant check runs through `app.db.
   tenant_connection`, the same primitive every request uses, under `SET LOCAL
   app.tenant_id`. Not one hand-written `WHERE tenant_id` appears in this file
   (hard rule 2). So these checks see exactly what a report served to that shop
   would see: an invariant that holds in a superuser's view but not in the app's
   is still a broken number on somebody's screen.
2. AN RLS-BYPASSING LENS. It reads NO tenant data except through counts. It is
   needed because listing the tenants requires it — RLS makes `tenants`
   invisible without a context, so the sweep cannot enumerate itself, and both
   roles in this system are NOBYPASSRLS by design with FORCE RLS binding the
   table owner too. Beyond the tenant list it does exactly three things: the
   global row counts behind X2 and X3, the cross-tenant row comparison X1 (the
   only lens that can see BOTH tenant_ids of a bad reference), and the catalogue
   reads for S1-S5. The catalogue is world-readable and does not need the
   privilege; it is on this connection because it is a property of the whole
   database rather than of any one tenant.
3. NO LENS AT ALL — the app role with no tenant context, which must see nothing
   (B1/B2). That is the fail-closed guarantee, checked as behaviour rather than
   assumed from the policy text.

X2 is what makes lens 1 trustworthy: the per-tenant row counts must SUM to the
global count. If RLS ever hid a row from every tenant, all the per-tenant checks
would pass over data nobody examined, and the report would be a confident green
about rows it never read.

ONE SNAPSHOT FOR THE WHOLE SWEEP
--------------------------------
The entire app-role sweep runs inside ONE REPEATABLE READ transaction, with the
tenant context re-set per tenant — `set_config(..., is_local => true)` is
transaction-scoped, so it can be changed within the transaction and still cannot
outlive it or reach a pooled peer. Under READ COMMITTED every statement takes a
fresh snapshot, so a bill committing mid-sweep is counted by one check and not
the next: a violation that is not a violation, in a window too narrow to ever
reproduce. That is the trap `lessons/a-report-is-many-reads-that-must-agree.md`
records for the daily report, and a reconciler is the last thing that should cry
wolf. A read-only REPEATABLE READ transaction cannot raise 40001, so this costs
nothing but the snapshot it holds open for the length of the run.

Because the context is re-set inside a shared transaction rather than
established once per connection, T0 asserts on every tenant that the context
actually moved and that exactly one `tenants` row is visible. A sweep that
silently re-checked tenant A forty-six times would otherwise print forty-six
greens.

WHAT IT REFUSES TO DUPLICATE, AND WHAT IT DUPLICATES ON PURPOSE
---------------------------------------------------------------
T7's Buddhist-era year comes from `bills._be_year`, imported — the ONE authority
doc_no itself uses. A second `+ 543` written here would be correct-by-luck for
most of the day and wrong across Bangkok midnight, which is the subject of
`lessons/be-year-comes-after-the-timezone.md`, whose amendment is about exactly
this case: a rule applied to production and never swept through the code that
checks it.

T2's arithmetic is the opposite call and duplicates on purpose. `round(net *
price, 2)` is evaluated by Postgres in NUMERIC — an implementation independent of
the `Decimal.quantize(ROUND_HALF_UP)` in `bills._line_amount`. Both round ties
away from zero, and every value here is non-negative by CHECK, so the two must
agree. A checker that imported `_line_amount` would agree with a bug in
`_line_amount`.

The rule that separates them: DUPLICATE ARITHMETIC, NEVER DUPLICATE A
CONVENTION. Arithmetic has one right answer that two implementations must reach.
A convention — which timezone, which offset, which prefix — has no right answer
to re-derive, only a choice to copy, and copies drift at the boundary neither
author tested. The one convention this file does restate is doc_no's
`B-{year}-{seq}` shape (T6), because bills.py builds it inline with no helper to
import; that restatement is named here so it is not mistaken for an independent
check.

NO NAMES ARE PRINTED, ONLY IDS AND CODES
----------------------------------------
Tenant, seller and product names are Thai, and this box's console is codepage
874 (the CLAUDE.md footgun). A reconciliation report whose reader cannot tell a
rendering artefact from corrupt data is worse than one with a column missing, so
violations identify rows by uuid, doc_no, line_no and code — never by name.

WHAT THIS CANNOT SEE is printed at the end of every run rather than left in a
document. The boundary of a check is part of its result.
"""
from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import os
import re
import sys
import uuid as uuidlib
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Mapping, Sequence

SERVER_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, SERVER_DIR)

import asyncpg  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

load_dotenv()  # BEFORE app.config, which reads the environment at import.

# A violation must survive being printed. errors="replace" so a stray character
# in some future column cannot kill the run at the exact moment it has something
# to say; utf-8 so the bytes leaving this process are right whatever the console
# then does with them.
try:  # pragma: no cover - depends on how stdout was attached
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, OSError):
    pass


class App:
    """The application's own modules, bound late.

    `app.db` builds its engine at IMPORT time from APP_DATABASE_URL, so pointing
    this checker at a restored copy has to happen before that import — which is
    why these are attributes filled in by bind(), not module-level imports.
    """

    shop_tz: Any = None
    shop_tz_name: str = ""
    be_year: Any = None
    tenant_connection: Any = None
    sql: Any = None


APP = App()


def bind(database: str | None) -> Any:
    from sqlalchemy import text
    from sqlalchemy.engine import make_url

    url = make_url(os.environ["APP_DATABASE_URL"])
    if database:
        url = url.set(database=database)
        os.environ["APP_DATABASE_URL"] = url.render_as_string(hide_password=False)

    from app.bills import _be_year          # the ONE BE-year authority
    from app.config import SHOP_TIMEZONE, SHOP_TIMEZONE_NAME
    from app.db import tenant_connection

    APP.shop_tz = SHOP_TIMEZONE
    APP.shop_tz_name = SHOP_TIMEZONE_NAME
    APP.be_year = _be_year
    APP.tenant_connection = tenant_connection
    APP.sql = text
    return url


# ---------------------------------------------------------------------------
# Result plumbing
# ---------------------------------------------------------------------------
OK, FAIL, SKIP, ERR = "OK  ", "FAIL", "SKIP", "ERR "


@dataclass
class Result:
    """One check, run once, over one named scope."""

    id: str
    title: str
    examined: str = ""
    rows: list[str] = field(default_factory=list)
    total: int = 0          # violations found; rows[] may be truncated
    skipped: str = ""       # it did not run — NOT a pass
    error: str = ""         # it tried to run and could not — NOT a pass

    @property
    def status(self) -> str:
        if self.error:
            return ERR
        if self.skipped:
            return SKIP
        return FAIL if self.total else OK


class Report:
    def __init__(self, verbose: bool) -> None:
        self.verbose = verbose
        self.results: list[tuple[str, Result]] = []   # (scope label, result)

    def add(self, scope: str, r: Result, *, quiet: bool = False) -> Result:
        self.results.append((scope, r))
        if self.verbose or not quiet or r.status != OK:
            self.emit(r)
        return r

    def emit(self, r: Result) -> None:
        tail = f"   [{r.examined}]" if r.examined else ""
        print(f"  [{r.status}] {r.id:<3} {r.title}{tail}")
        if r.skipped:
            print(f"           SKIPPED: {r.skipped}")
        if r.error:
            print(f"           COULD NOT RUN: {r.error}")
        if r.total:
            shown = len(r.rows)
            more = f", showing {shown}" if shown < r.total else ""
            print(f"           {r.total} violation(s){more}:")
            for line in r.rows:
                print(f"             {line}")

    @property
    def violations(self) -> int:
        return sum(r.total for _, r in self.results if not r.skipped and not r.error)

    @property
    def errors(self) -> int:
        return sum(1 for _, r in self.results if r.error)

    @property
    def skips(self) -> int:
        return sum(1 for _, r in self.results if r.skipped)

    @property
    def ran(self) -> int:
        return sum(1 for _, r in self.results if not r.skipped and not r.error)

    def failing_ids(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for _, r in self.results:
            if r.total and not r.skipped and not r.error:
                out[r.id] = out.get(r.id, 0) + r.total
        return out


def fmt(v: Any) -> str:
    """One value, rendered so it cannot be misread.

    Decimal through str() — exact, never a float. Instants in SHOP time, because
    a reconciliation read against a paper slip is read in shop time and nothing
    else (lessons/render-in-shop-time-not-device-time.md).
    """
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, dt.datetime):
        return v.astimezone(APP.shop_tz).isoformat()
    return str(v)


def render(row: Mapping[str, Any]) -> str:
    return "  ".join(f"{k}={fmt(v)}" for k, v in row.items())


def cut(rows: list[str], max_rows: int) -> list[str]:
    return rows if max_rows == 0 else rows[:max_rows]


# ---------------------------------------------------------------------------
# The doc_no shape. RESTATED from bills.py's f"B-{be_year}-{seq}" — there is no
# helper to import. Four-digit BE year; sequence from 1 with no leading zeros,
# because "B-2569-007" and "B-2569-7" would be two different strings naming one
# number and the partial unique index would not stop it.
# ---------------------------------------------------------------------------
DOC_NO_RE = re.compile(r"^B-(\d{4})-([1-9]\d*)$")

# Business tables. `tenants` is keyed on its own id, the rest on tenant_id;
# alembic_version is Alembic's bookkeeping and is REVOKEd from the app role.
TENANT_TABLES = [
    "users", "uoms", "product_categories", "products", "product_prices",
    "sellers", "purchase_bills", "purchase_bill_items", "doc_no_counters",
]
ALL_RLS_TABLES = ["tenants", *TENANT_TABLES]

# Named constraints and indexes the row checks lean on. If one is missing, the
# row checks may still pass while the guarantee that MADE them true is gone — a
# green report over an unlocked door. Names read out of migrations 0001 / 0002.
REQUIRED_CONSTRAINTS = {
    "purchase_bills": [
        "uq_bills_tenant_id", "uq_bills_tenant_idem", "fk_bills_seller",
        "fk_bills_voided_by", "ck_bills_void_consistency",
    ],
    "purchase_bill_items": [
        "uq_items_tenant_bill_line", "fk_items_bill", "fk_items_product",
        "ck_items_net",
    ],
    "products": [
        "uq_products_tenant_id", "uq_products_tenant_code",
        "fk_products_category", "fk_products_uom",
    ],
    "product_prices": ["uq_prices_tenant_product_grade", "fk_prices_product"],
    "sellers": ["uq_sellers_tenant_id", "uq_sellers_tenant_code"],
    "users": ["uq_users_tenant_id", "uq_users_tenant_username"],
    "uoms": ["uq_uoms_tenant_id", "uq_uoms_tenant_code"],
    "product_categories": ["uq_pcat_tenant_id", "uq_pcat_tenant_code"],
}
REQUIRED_INDEXES = {
    # doc_no is unique per tenant through a PARTIAL unique index, so that many
    # not-yet-synced (NULL) bills can coexist. An index, not a constraint —
    # pg_constraint does not list it.
    "purchase_bills": ["uq_bills_tenant_docno"],
}

# Every composite (tenant_id, x) -> parent (tenant_id, id) reference in the
# schema. X1 reads these WITHOUT RLS, which is the only lens that can compare
# the two tenant_ids directly.
CROSS_TENANT_PAIRS = [
    ("purchase_bills.seller_id -> sellers", "purchase_bills", "sellers", "seller_id"),
    ("purchase_bills.voided_by -> users", "purchase_bills", "users", "voided_by"),
    ("purchase_bill_items.bill_id -> purchase_bills", "purchase_bill_items",
     "purchase_bills", "bill_id"),
    ("purchase_bill_items.product_id -> products", "purchase_bill_items",
     "products", "product_id"),
    ("products.category_id -> product_categories", "products",
     "product_categories", "category_id"),
    ("products.uom_id -> uoms", "products", "uoms", "uom_id"),
    ("product_prices.product_id -> products", "product_prices", "products", "product_id"),
]


# ---------------------------------------------------------------------------
# Per-tenant SQL checks. Every one runs under SET LOCAL app.tenant_id, so no
# query here names tenant_id at all: RLS scopes it. `scope` picks which counted
# thing is reported as examined — a check must say what it looked at, or a green
# line is indistinguishable from a green line over nothing.
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class SqlCheck:
    id: str
    title: str
    scope: str
    sql: str


SQL_CHECKS: list[SqlCheck] = [
    SqlCheck(
        "T1", "bill total_amount = sum of its items' amount", "bills",
        """
        SELECT b.doc_no, b.id AS bill_id, b.total_amount AS stored_total,
               COALESCE(SUM(i.amount), 0) AS items_sum,
               b.total_amount - COALESCE(SUM(i.amount), 0) AS difference
          FROM purchase_bills b
          LEFT JOIN purchase_bill_items i ON i.bill_id = b.id
         GROUP BY b.id, b.doc_no, b.total_amount
        HAVING b.total_amount <> COALESCE(SUM(i.amount), 0)
         ORDER BY b.doc_no
        """,
    ),
    SqlCheck(
        "T2", "item amount = net_weight x unit_price, NUMERIC, half-up at 2dp", "items",
        """
        SELECT b.doc_no, i.line_no, i.id AS item_id,
               i.net_weight, i.unit_price, i.amount AS stored_amount,
               round(i.net_weight * i.unit_price, 2) AS expected_amount,
               i.amount - round(i.net_weight * i.unit_price, 2) AS difference
          FROM purchase_bill_items i
          JOIN purchase_bills b ON b.id = i.bill_id
         WHERE i.amount <> round(i.net_weight * i.unit_price, 2)
         ORDER BY b.doc_no, i.line_no
        """,
    ),
    SqlCheck(
        "T3", "item net_weight = gross_weight - tare_weight", "items",
        """
        SELECT b.doc_no, i.line_no, i.id AS item_id,
               i.gross_weight, i.tare_weight, i.net_weight AS stored_net,
               i.gross_weight - i.tare_weight AS expected_net
          FROM purchase_bill_items i
          JOIN purchase_bills b ON b.id = i.bill_id
         WHERE i.net_weight <> i.gross_weight - i.tare_weight
         ORDER BY b.doc_no, i.line_no
        """,
    ),
    SqlCheck(
        "T4", "every bill has at least one item", "bills",
        """
        SELECT b.doc_no, b.id AS bill_id, b.total_amount, b.server_received_at
          FROM purchase_bills b
         WHERE NOT EXISTS (SELECT 1 FROM purchase_bill_items i WHERE i.bill_id = b.id)
         ORDER BY b.doc_no
        """,
    ),
    SqlCheck(
        # The column is nullable BY DESIGN — hard rule 3: an offline bill has no
        # doc_no yet. But a bill only reaches this database through create_bill,
        # which assigns one in the same transaction as the insert. A NULL here is
        # a row that arrived by some other path entirely.
        "T5", "every persisted bill has a doc_no (nullable by design, never NULL here)",
        "bills",
        """
        SELECT b.id AS bill_id, b.total_amount, length(b.idempotency_key) AS key_length,
               b.device_created_at, b.server_received_at
          FROM purchase_bills b
         WHERE b.doc_no IS NULL
         ORDER BY b.server_received_at
        """,
    ),
    SqlCheck(
        "T6", "doc_no has the shape B-<be_year>-<seq>, seq >= 1, no leading zeros", "bills",
        """
        SELECT b.doc_no, b.id AS bill_id, b.server_received_at
          FROM purchase_bills b
         WHERE b.doc_no IS NOT NULL
           AND b.doc_no !~ '^B-[0-9]{4}-[1-9][0-9]*$'
         ORDER BY b.doc_no
        """,
    ),
    SqlCheck(
        "T10", "every reference resolves under this tenant's own context", "bills",
        """
        SELECT 'bill -> seller' AS reference, b.doc_no AS holder,
               b.seller_id::text AS unresolved_id
          FROM purchase_bills b
          LEFT JOIN sellers s ON s.id = b.seller_id
         WHERE s.id IS NULL
        UNION ALL
        SELECT 'bill -> voided_by user', b.doc_no, b.voided_by::text
          FROM purchase_bills b
          LEFT JOIN users u ON u.id = b.voided_by
         WHERE b.voided_by IS NOT NULL AND u.id IS NULL
        UNION ALL
        SELECT 'item -> bill', i.id::text, i.bill_id::text
          FROM purchase_bill_items i
          LEFT JOIN purchase_bills b ON b.id = i.bill_id
         WHERE b.id IS NULL
        UNION ALL
        SELECT 'item -> product', i.id::text, i.product_id::text
          FROM purchase_bill_items i
          LEFT JOIN products p ON p.id = i.product_id
         WHERE p.id IS NULL
        UNION ALL
        SELECT 'product -> category', p.code, p.category_id::text
          FROM products p
          LEFT JOIN product_categories c ON c.id = p.category_id
         WHERE c.id IS NULL
        UNION ALL
        SELECT 'product -> uom', p.code, p.uom_id::text
          FROM products p
          LEFT JOIN uoms m ON m.id = p.uom_id
         WHERE m.id IS NULL
        UNION ALL
        SELECT 'price -> product', pp.id::text, pp.product_id::text
          FROM product_prices pp
          LEFT JOIN products p2 ON p2.id = pp.product_id
         WHERE p2.id IS NULL
        """,
    ),
    SqlCheck(
        "T11", "a voided bill has all three void columns set, or none", "bills",
        """
        SELECT b.doc_no, b.id AS bill_id,
               (b.voided_at IS NOT NULL)   AS has_voided_at,
               (b.voided_by IS NOT NULL)   AS has_voided_by,
               (b.void_reason IS NOT NULL) AS has_void_reason
          FROM purchase_bills b
         WHERE ((b.voided_at IS NULL)::int + (b.voided_by IS NULL)::int
                + (b.void_reason IS NULL)::int) NOT IN (0, 3)
         ORDER BY b.doc_no
        """,
    ),
    SqlCheck(
        # Both stamps come from the SERVER's clock (server_received_at DEFAULT
        # now(); voided_at set by void_bill), so unlike device_created_at they
        # are comparable, and a void preceding the arrival is impossible.
        "T12", "no bill was voided before it arrived", "bills",
        """
        SELECT b.doc_no, b.id AS bill_id, b.server_received_at, b.voided_at,
               b.voided_at - b.server_received_at AS voided_after
          FROM purchase_bills b
         WHERE b.voided_at IS NOT NULL AND b.voided_at < b.server_received_at
         ORDER BY b.doc_no
        """,
    ),
    SqlCheck(
        # The edge requires min_length=1; the column is plain text. A blank
        # reason is a void with no audit trail, which is the entire reason a
        # wrong bill is voided rather than deleted (hard rule 5). LENGTH only —
        # the text is Thai and is deliberately not printed.
        "T13", "a void carries a non-blank reason", "bills",
        """
        SELECT b.doc_no, b.id AS bill_id, length(b.void_reason) AS reason_length
          FROM purchase_bills b
         WHERE b.voided_at IS NOT NULL AND btrim(b.void_reason) = ''
         ORDER BY b.doc_no
        """,
    ),
    SqlCheck(
        # Hard rule 4. A blank key is unique exactly once per tenant, so the
        # SECOND bill submitted with one would be refused as a duplicate of an
        # unrelated bill — and the first would answer "already created" to a
        # retry of anything at all.
        "T14", "every bill carries a non-blank idempotency_key", "bills",
        """
        SELECT b.doc_no, b.id AS bill_id, length(b.idempotency_key) AS key_length
          FROM purchase_bills b
         WHERE btrim(b.idempotency_key) = ''
         ORDER BY b.doc_no
        """,
    ),
    SqlCheck(
        # The client assigns line_no 1..N at promotion (cart.ts toBillItems) and
        # the server stores what it is given. A hole means a line went missing
        # between the yard and here — and nothing else would notice, because the
        # total is recomputed from the lines that DID arrive.
        "T15", "line_no is 1..N per bill, contiguous and unique", "bills",
        """
        SELECT b.doc_no, i.bill_id, count(*) AS lines,
               min(i.line_no) AS min_line, max(i.line_no) AS max_line,
               count(DISTINCT i.line_no) AS distinct_lines
          FROM purchase_bill_items i
          JOIN purchase_bills b ON b.id = i.bill_id
         GROUP BY b.doc_no, i.bill_id
        HAVING min(i.line_no) <> 1
            OR max(i.line_no) <> count(*)
            OR count(DISTINCT i.line_no) <> count(*)
         ORDER BY b.doc_no
        """,
    ),
    SqlCheck(
        "T16", "doc_no is unique within the tenant", "bills",
        """
        SELECT b.doc_no, count(*) AS bills, string_agg(b.id::text, ' ') AS bill_ids
          FROM purchase_bills b
         WHERE b.doc_no IS NOT NULL
         GROUP BY b.doc_no
        HAVING count(*) > 1
         ORDER BY b.doc_no
        """,
    ),
]

SCOPE_SQL = """
SELECT (SELECT count(*) FROM purchase_bills)                              AS bills,
       (SELECT count(*) FROM purchase_bills WHERE voided_at IS NOT NULL)  AS voided,
       (SELECT count(*) FROM purchase_bill_items)                         AS items,
       (SELECT count(*) FROM sellers)                                     AS sellers,
       (SELECT count(*) FROM products)                                    AS products,
       (SELECT count(*) FROM product_prices)                              AS prices,
       (SELECT count(*) FROM product_categories)                          AS categories,
       (SELECT count(*) FROM uoms)                                        AS uoms,
       (SELECT count(*) FROM users)                                       AS users,
       (SELECT count(*) FROM doc_no_counters)                             AS counters
"""

# Which SCOPE_SQL column feeds each table's running total for X2.
SCOPE_COLUMN = {
    "purchase_bills": "bills", "purchase_bill_items": "items", "sellers": "sellers",
    "products": "products", "product_prices": "prices",
    "product_categories": "categories", "uoms": "uoms", "users": "users",
    "doc_no_counters": "counters",
}

CHECKS_PER_TENANT = len(SQL_CHECKS) + 4      # T0 + the SQL checks + T7/T8/T9


# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    ap = argparse.ArgumentParser(
        description="Check the money invariants against a live database.")
    ap.add_argument("--database", default=None,
                    help="database to check (default: the one in APP_DATABASE_URL). "
                         "Point it at a RESTORED COPY to break things safely.")
    ap.add_argument("--tenant", default=None,
                    help="check one tenant only (uuid). X2 cannot run in this mode.")
    ap.add_argument("--max-rows", type=int, default=20,
                    help="violating rows printed per check; 0 = all (default: 20)")
    ap.add_argument("--verbose", action="store_true",
                    help="print every check, including tenants that hold no rows")
    ap.add_argument("--admin-dsn", default=os.environ.get("RECON_ADMIN_DSN", ""),
                    help="RLS-bypassing DSN, used ONLY to list tenants and count rows "
                         "globally (default: postgres/postgres on the app URL's host)")
    return ap.parse_args()


async def main() -> int:
    args = parse_args()
    url = bind(args.database)

    admin_dsn = args.admin_dsn or (
        f"postgresql://postgres:postgres@{url.host}:{url.port}/{url.database}")

    started = dt.datetime.now(dt.timezone.utc)
    rep = Report(verbose=args.verbose)

    print("=== reconcile ===")
    print(f"  database        : {url.database} @ {url.host}:{url.port}")
    print(f"  app role        : {url.username} (RLS-bound), one REPEATABLE READ snapshot")
    print(f"  shop timezone   : {APP.shop_tz_name} = {APP.shop_tz}")
    print(f"  started (UTC)   : {started.isoformat()}")
    if args.tenant:
        print(f"  !! ONE TENANT   : {args.tenant} — this is not a full sweep")

    try:
        admin = await asyncpg.connect(admin_dsn)
    except Exception as e:  # noqa: BLE001 — any failure here means nobody looked
        print(f"\nCOULD NOT CONNECT with the RLS-bypassing DSN: {type(e).__name__}: {e}")
        print("  It is needed to LIST the tenants: RLS hides `tenants` without a context,"
              "\n  and recycle_owner and recycle_app are both NOBYPASSRLS by design."
              "\n  Set RECON_ADMIN_DSN or pass --admin-dsn.")
        return 2

    tenants: list[uuidlib.UUID] = []
    try:
        if await admin.fetchval("SELECT current_setting('is_superuser')") != "on":
            print("\nThe --admin-dsn role is not a superuser, so it cannot see across"
                  "\ntenants and the sweep could not be shown to be complete.")
            return 2

        before = await table_fingerprint(admin)
        tenants = await list_tenants(admin, args.tenant)
        if not tenants:
            print("\nNO TENANTS FOUND. A sweep over nothing is not a pass.")
            return 2

        await structure_checks(rep, admin)

        print("\n=== blind read (app role, NO tenant context) ===")
        await blind_read(rep, "B1", "cold connection: every table returns zero rows")

        seen = await sweep(rep, tenants, args.max_rows, args.verbose)

        print("\n=== blind read again ===")
        await blind_read(rep, "B2",
                         "on a pool that HAS held tenant contexts: SET LOCAL did not leak")

        print("\n=== across tenants, and the sweep itself (RLS-bypassing lens) ===")
        await cross_tenant_check(rep, admin, args.max_rows)
        await sweep_completeness(rep, admin, seen, bool(args.tenant))
        await did_it_move(rep, admin, before)
    finally:
        await admin.close()

    return summarise(rep, tenants, started, bool(args.tenant))


# ---------------------------------------------------------------------------
# lens 2 — the RLS-bypassing reads. Two things only: who the tenants are, and
# how many rows there are in total.
# ---------------------------------------------------------------------------
async def list_tenants(admin: asyncpg.Connection, only: str | None) -> list[uuidlib.UUID]:
    if only:
        rows = await admin.fetch("SELECT id FROM tenants WHERE id = $1", uuidlib.UUID(only))
    else:
        rows = await admin.fetch("SELECT id FROM tenants ORDER BY created_at, id")
    return [r["id"] for r in rows]


async def table_fingerprint(admin: asyncpg.Connection) -> dict[str, int]:
    sql = " UNION ALL ".join(
        f"SELECT '{t}' AS t, count(*) AS n FROM {t}" for t in ALL_RLS_TABLES)
    return {r["t"]: r["n"] for r in await admin.fetch(sql)}


async def cross_tenant_check(rep: Report, admin: asyncpg.Connection, max_rows: int) -> None:
    """X1 — no row points at a row belonging to another tenant.

    Read WITHOUT RLS on purpose. Under a tenant context a cross-tenant reference
    is INVISIBLE, so T10 sees only a reference that does not resolve and cannot
    say where it actually points; this lens can name both tenants.

    Every pair is protected by a composite FOREIGN KEY (tenant_id, x) -> parent
    (tenant_id, id), so a hit means a constraint is gone. S5 checks the
    constraints; this checks the ROWS, because a constraint re-added after bad
    data has landed does not clean up behind itself.
    """
    sql = " UNION ALL ".join(
        f"SELECT '{label}' AS reference, c.id::text AS row_id,"
        f" c.tenant_id::text AS holder_tenant, p.tenant_id::text AS pointed_at_tenant"
        f"  FROM {child} c JOIN {parent} p ON p.id = c.{col}"
        f" WHERE p.tenant_id <> c.tenant_id"
        for label, child, parent, col in CROSS_TENANT_PAIRS)
    r = Result("X1", "no row references a row belonging to another tenant")
    try:
        rows = await admin.fetch(sql)
        r.total = len(rows)
        r.rows = cut([render(dict(x)) for x in rows], max_rows)
        r.examined = f"{len(CROSS_TENANT_PAIRS)} reference pairs, all tenants"
    except Exception as e:  # noqa: BLE001
        r.error = f"{type(e).__name__}: {e}"
    rep.add("global", r)


async def sweep_completeness(rep: Report, admin: asyncpg.Connection,
                             seen: dict[str, int], single_tenant: bool) -> None:
    """X2 — the per-tenant sweep saw every row there is.

    Without this, every T-check could pass over a database whose rows RLS hides
    from all of the contexts, and the report would be a confident green about
    rows nobody read. It is what makes lens 1's greens mean something.
    """
    r = Result("X2", "per-tenant row counts sum to the global row count")
    if single_tenant:
        r.skipped = "--tenant was given; one tenant cannot account for the whole database"
        rep.add("global", r)
        return
    try:
        rows = await admin.fetch(" UNION ALL ".join(
            f"SELECT '{t}' AS t, count(*) AS n FROM {t}" for t in TENANT_TABLES))
        totals = {x["t"]: x["n"] for x in rows}
        bad = [(t, seen.get(t, 0), n) for t, n in sorted(totals.items())
               if seen.get(t, 0) != n]
        r.examined = " ".join(f"{t}={n}" for t, n in sorted(totals.items()))
        r.total = len(bad)
        r.rows = [f"table={t}  seen_by_the_sweep={s}  actually_present={n}  unseen={n - s}"
                  for t, s, n in bad]
    except Exception as e:  # noqa: BLE001
        r.error = f"{type(e).__name__}: {e}"
    rep.add("global", r)


async def did_it_move(rep: Report, admin: asyncpg.Connection,
                      before: dict[str, int]) -> None:
    """X3 — did the database change under the checker while it ran?

    Not an invariant about the data; a statement about the RESULT. The sweep is
    one snapshot, so it is internally consistent either way, but if rows landed
    during the run then a violation could be a bill mid-flight rather than a
    defect — and the reader deserves to be told that before acting on it.
    """
    r = Result("X3", "the database did not move under the checker while it ran")
    try:
        after = await table_fingerprint(admin)
        drift = [(t, before.get(t), after.get(t))
                 for t in sorted(set(before) | set(after))
                 if before.get(t) != after.get(t)]
        r.examined = f"{len(after)} tables"
        r.total = len(drift)
        r.rows = [f"table={t}  rows_at_start={a}  rows_at_end={b}" for t, a, b in drift]
    except Exception as e:  # noqa: BLE001
        r.error = f"{type(e).__name__}: {e}"
    rep.add("global", r)


# ---------------------------------------------------------------------------
# lens 3 — no context at all
# ---------------------------------------------------------------------------
async def blind_read(rep: Report, ident: str, title: str) -> None:
    """Every table must return zero rows to the app role with no tenant set.

    Behaviour, not policy text. Each table is counted in its OWN transaction:
    `alembic_version` is REVOKEd from the app role, and a permission error
    aborts the transaction it happens in — one shared transaction would leave
    every table after it unchecked while still printing a pass.

    A refusal is a STRONGER no than zero rows and is reported as such, never
    folded silently into the green.
    """
    r = Result(ident, title)
    visible: list[str] = []
    denied: list[str] = []
    try:
        for t in [*ALL_RLS_TABLES, "alembic_version"]:
            async with APP.tenant_connection(None) as conn:
                if t == ALL_RLS_TABLES[0]:
                    ctx = (await conn.execute(APP.sql(
                        "SELECT current_setting('app.tenant_id', true) AS c"))).scalar_one()
                    if ctx not in (None, ""):
                        visible.append("app.tenant_id is SET on a connection that asked"
                                       f" for no context: {ctx!r}")
                try:
                    n = (await conn.execute(
                        APP.sql(f"SELECT count(*) FROM {t}"))).scalar_one()
                except Exception as e:  # noqa: BLE001 — a refusal IS the pass here
                    if "permission denied" in str(e).lower():
                        denied.append(t)
                        continue
                    raise
                if n:
                    visible.append(f"table={t}  rows_visible_with_no_tenant_context={n}")
        r.total = len(visible)
        r.rows = visible
        r.examined = (f"{len(ALL_RLS_TABLES) + 1} tables"
                      + (f"; refused outright: {', '.join(denied)}" if denied else ""))
    except Exception as e:  # noqa: BLE001
        r.error = f"{type(e).__name__}: {e}"
    rep.add("global", r)


# ---------------------------------------------------------------------------
# structural checks — is the schema still promising what the row checks assume?
# ---------------------------------------------------------------------------
async def structure_checks(rep: Report, admin: asyncpg.Connection) -> None:
    print("\n=== structure (does the schema still promise what the checks assume?) ===")
    present = [x["t"] for x in await admin.fetch(
        "SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace"
        " WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1")]

    # S1 — a table with no tenant_id is a table with no isolation.
    r = Result("S1", "every business table carries tenant_id (tenants is keyed on its id)",
               examined=f"{len(present)} tables in public")
    rows = await admin.fetch(
        """
        SELECT c.relname AS table_name
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r'
           AND c.relname NOT IN ('alembic_version', 'tenants')
           AND NOT EXISTS (SELECT 1 FROM pg_attribute a
                            WHERE a.attrelid = c.oid AND a.attname = 'tenant_id'
                              AND NOT a.attisdropped)
         ORDER BY 1
        """)
    r.total = len(rows)
    r.rows = [f"table={x['table_name']}  HAS NO tenant_id COLUMN" for x in rows]
    rep.add("global", r)

    # S2 — a table this checker has never heard of is covered by nothing above.
    r = Result("S2", "no table exists that this checker does not know about",
               examined=f"{len(present)} tables")
    unknown = [t for t in present if t not in [*ALL_RLS_TABLES, "alembic_version"]]
    r.total = len(unknown)
    r.rows = [f"table={t}  — add it to ALL_RLS_TABLES and give it checks" for t in unknown]
    rep.add("global", r)

    # S3 — RLS enabled AND forced, with a policy keyed on the GUC.
    r = Result("S3", "RLS ENABLED and FORCED on every business table, with a tenant policy")
    rows = await admin.fetch(
        """
        SELECT c.relname AS table_name, c.relrowsecurity AS enabled,
               c.relforcerowsecurity AS forced,
               (SELECT count(*) FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies,
               (SELECT string_agg(coalesce(p.qual, '') || ' ' || coalesce(p.with_check, ''),
                                  ' | ')
                  FROM pg_policies p
                 WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_expr
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])
         ORDER BY 1
        """, ALL_RLS_TABLES)
    bad: list[str] = []
    for x in rows:
        key = "id" if x["table_name"] == "tenants" else "tenant_id"
        problems = []
        if not x["enabled"]:
            problems.append("RLS NOT ENABLED")
        if not x["forced"]:
            problems.append("RLS NOT FORCED — the table owner escapes it")
        if x["policies"] != 1:
            problems.append(f"{x['policies']} policies, expected exactly 1")
        expr = x["policy_expr"] or ""
        if "app.tenant_id" not in expr:
            problems.append("the policy does not read current_setting('app.tenant_id')")
        elif key not in expr:
            problems.append(f"the policy is not keyed on {key}")
        if problems:
            bad.append(f"table={x['table_name']}  " + "; ".join(problems))
    bad += [f"table={t}  DOES NOT EXIST" for t in ALL_RLS_TABLES
            if t not in {x["table_name"] for x in rows}]
    r.examined = f"{len(rows)} of {len(ALL_RLS_TABLES)} tables"
    r.total = len(bad)
    r.rows = bad
    rep.add("global", r)

    # S4 — the runtime role cannot step around any of it.
    r = Result("S4", "recycle_app is NOSUPERUSER + NOBYPASSRLS, and so is the owner")
    rows = await admin.fetch(
        "SELECT rolname, rolsuper, rolbypassrls FROM pg_roles"
        " WHERE rolname IN ('recycle_app', 'recycle_owner') ORDER BY 1")
    bad = [f"role={x['rolname']}  superuser={x['rolsuper']}  bypassrls={x['rolbypassrls']}"
           for x in rows if x["rolsuper"] or x["rolbypassrls"]]
    bad += [f"role={n}  DOES NOT EXIST" for n in ("recycle_app", "recycle_owner")
            if n not in {x["rolname"] for x in rows}]
    r.examined = f"{len(rows)} roles"
    r.total = len(bad)
    r.rows = bad
    rep.add("global", r)

    # S5 — the constraints and indexes the row checks lean on.
    r = Result("S5", "the constraints and indexes the invariants lean on are all present")
    have_con = {(x["t"], x["c"]) for x in await admin.fetch(
        "SELECT rel.relname AS t, con.conname AS c FROM pg_constraint con"
        " JOIN pg_class rel ON rel.oid = con.conrelid"
        " JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE n.nspname = 'public'")}
    have_idx = {(x["tablename"], x["indexname"]) for x in await admin.fetch(
        "SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public'")}
    wanted = [(t, c) for t, cs in REQUIRED_CONSTRAINTS.items() for c in cs]
    wanted_idx = [(t, i) for t, xs in REQUIRED_INDEXES.items() for i in xs]
    bad = [f"table={t}  constraint={c}  MISSING" for t, c in wanted if (t, c) not in have_con]
    bad += [f"table={t}  index={i}  MISSING" for t, i in wanted_idx if (t, i) not in have_idx]
    r.examined = f"{len(wanted)} constraints, {len(wanted_idx)} indexes"
    r.total = len(bad)
    r.rows = bad
    rep.add("global", r)


# ---------------------------------------------------------------------------
# lens 1 — the sweep, per tenant, through the app's own primitive
# ---------------------------------------------------------------------------
async def sweep(rep: Report, tenants: Sequence[uuidlib.UUID],
                max_rows: int, verbose: bool) -> dict[str, int]:
    """Every per-tenant check, in ONE snapshot, context re-set per tenant."""
    print(f"\n=== per tenant ({len(tenants)} tenants, one REPEATABLE READ snapshot) ===")
    seen: dict[str, int] = {t: 0 for t in TENANT_TABLES}
    empty = 0

    async with APP.tenant_connection(tenants[0], isolation_level="REPEATABLE READ") as conn:
        iso = (await conn.execute(APP.sql("SHOW transaction_isolation"))).scalar_one()
        if iso != "repeatable read":
            print(f"  !! transaction_isolation is {iso!r}, not 'repeatable read'. The checks"
                  "\n     below are NOT reading one snapshot and may disagree with each other.")

        for tid in tenants:
            # SET LOCAL again inside the same transaction. is_local => true, so
            # it still cannot outlive the transaction or reach a pooled peer.
            await conn.execute(APP.sql("SELECT set_config('app.tenant_id', :t, true)"),
                               {"t": str(tid)})

            results = [await context_check(conn, tid)]
            scope = (await conn.execute(APP.sql(SCOPE_SQL))).mappings().one()
            for table, col in SCOPE_COLUMN.items():
                seen[table] += scope[col]

            for chk in SQL_CHECKS:
                r = Result(chk.id, chk.title, examined=f"{scope[chk.scope]} {chk.scope}")
                try:
                    rows = (await conn.execute(APP.sql(chk.sql))).mappings().all()
                    r.total = len(rows)
                    r.rows = cut([render(x) for x in rows], max_rows)
                except Exception as e:  # noqa: BLE001
                    r.error = f"{type(e).__name__}: {e}"
                results.append(r)

            results += await docno_checks(conn, max_rows)

            has_rows = any(scope[c] for c in
                           ("bills", "items", "sellers", "products", "prices", "counters"))
            failed = [r for r in results if r.status != OK]
            if not has_rows:
                empty += 1

            if verbose or has_rows or failed:
                print(f"\n  --- tenant {tid} ---")
                print(f"      scope: {scope['bills']} bills ({scope['voided']} voided),"
                      f" {scope['items']} items, {scope['sellers']} sellers,"
                      f" {scope['products']} products, {scope['prices']} prices,"
                      f" {scope['counters']} counter rows, {scope['users']} users")
            for r in results:
                rep.add(str(tid), r, quiet=True)
            if (verbose or has_rows or failed) and not failed and not verbose:
                print(f"      {len(results)} checks, all clean")

    if empty:
        print(f"\n  {empty} tenant(s) hold no business rows at all. Their"
              f" {CHECKS_PER_TENANT} checks each ran and were vacuous.")
    return seen


async def context_check(conn: Any, tid: uuidlib.UUID) -> Result:
    """T0 — the context moved to THIS tenant and scopes `tenants` itself.

    The sweep re-sets the context inside one shared transaction. If a set_config
    were ever missed, every check after it would silently re-examine the previous
    tenant and print a green for a tenant nobody read.
    """
    r = Result("T0", "the tenant context is this tenant, and it is all that is visible",
               examined="1 tenant row")
    row = (await conn.execute(APP.sql(
        "SELECT current_setting('app.tenant_id', true) AS ctx,"
        " (SELECT count(*) FROM tenants) AS visible,"
        # min(uuid) has no aggregate in Postgres; cast first.
        " (SELECT min(id::text) FROM tenants) AS which"))).mappings().one()
    problems = []
    if row["ctx"] != str(tid):
        problems.append(f"context is {row['ctx']!r}, expected {tid}")
    if row["visible"] != 1:
        problems.append(f"{row['visible']} tenants visible under this context, expected 1")
    if row["which"] != str(tid):
        problems.append(f"the visible tenant is {row['which']}, expected {tid}")
    r.total = len(problems)
    r.rows = problems
    return r


async def docno_checks(conn: Any, max_rows: int) -> list[Result]:
    """T7 / T8 / T9 — the doc_no series, checked in Python.

    In Python and not in SQL because the Buddhist-era year MUST come from
    `bills._be_year` (see the module docstring). Writing `extract(year from x AT
    TIME ZONE '+07') + 543` here would be a second derivation of a convention
    this project has already been bitten by once, and a checker carrying its own
    copy would go green on the very defect it exists to catch.

    Reads every numbered bill for the tenant — bounded by one shop's history. At
    a size where holding that in memory stops being sensible, these become
    per-be_year aggregates with _be_year applied to the year boundaries instead
    of to each row.
    """
    rows = (await conn.execute(APP.sql(
        "SELECT doc_no, id, server_received_at FROM purchase_bills"
        " WHERE doc_no IS NOT NULL ORDER BY doc_no"))).mappings().all()
    counters = {c["be_year"]: c["last_seq"] for c in (await conn.execute(APP.sql(
        "SELECT be_year, last_seq FROM doc_no_counters"))).mappings().all()}

    by_year: dict[int, dict[int, list[str]]] = {}
    mismatched: list[str] = []
    for x in rows:
        m = DOC_NO_RE.match(x["doc_no"])
        if not m:
            continue  # T6 owns a malformed doc_no; T8 will see the hole it leaves
        year, seq = int(m.group(1)), int(m.group(2))
        arrived_in = APP.be_year(x["server_received_at"])
        if year != arrived_in:
            mismatched.append(
                f"doc_no={x['doc_no']}  bill_id={x['id']}"
                f"  server_received_at={fmt(x['server_received_at'])}"
                f"  be_year_in_doc_no={year}  be_year_of_arrival={arrived_in}")
        by_year.setdefault(year, {}).setdefault(seq, []).append(str(x["id"]))

    t7 = Result("T7", "doc_no's BE year is the BE year that bill ARRIVED in, in shop time",
                examined=f"{len(rows)} numbered bills")
    t7.total = len(mismatched)
    t7.rows = cut(mismatched, max_rows)

    t8 = Result("T8", "doc_no per (tenant, be_year) runs 1..N — no gap, no duplicate,"
                      " voided bills included",
                examined=f"{len(rows)} numbered bills over {len(by_year)} be_year(s)")
    gaps: list[str] = []
    for year in sorted(by_year):
        seqs = by_year[year]
        top = max(seqs)
        missing = [n for n in range(1, top + 1) if n not in seqs]
        if missing:
            shown = missing if max_rows == 0 else missing[:50]
            gaps.append(f"be_year={year}  issued={len(seqs)}  highest={top}"
                        f"  MISSING seq={shown}"
                        + ("" if len(shown) == len(missing) else f" (+{len(missing) - len(shown)} more)"))
        for n, ids in sorted(seqs.items()):
            if len(ids) > 1:
                gaps.append(f"be_year={year}  seq={n}  DUPLICATED by {' '.join(ids)}")
    t8.total = len(gaps)
    t8.rows = cut(gaps, max_rows)

    t9 = Result("T9", "the doc_no counter equals the highest doc_no issued for its year",
                examined=f"{len(counters)} counter row(s)")
    bad: list[str] = []
    for year in sorted(set(counters) | set(by_year)):
        top = max(by_year[year]) if year in by_year else None
        last = counters.get(year)
        if last is None:
            bad.append(f"be_year={year}  highest_doc_no={top}  NO COUNTER ROW"
                       " — the next bill of this year would be issued seq 1")
        elif top is None:
            if last != 0:
                bad.append(f"be_year={year}  counter_last_seq={last}  but NO BILL carries"
                           " this year — numbers were issued to bills that are not here")
        elif last != top:
            bad.append(f"be_year={year}  counter_last_seq={last}  highest_doc_no={top}"
                       f"  difference={last - top}")
    t9.total = len(bad)
    t9.rows = cut(bad, max_rows)

    return [t7, t8, t9]


# ---------------------------------------------------------------------------
# the closing report
# ---------------------------------------------------------------------------
CANNOT_SEE = [
    "BILLS STILL ON A PHONE. Offline-first means the true takings are the"
    " server's rows PLUS whatever is queued on handsets, and this database holds"
    " no device registry, no heartbeat and no device column. Every total here is"
    " a floor. It is the same gap the daily report labels"
    " understatement_possible, and it is structural, not a missing feature.",

    "ANYTHING THE SCHEMA WOULD HAVE REJECTED ANYWAY. net = gross - tare"
    " (ck_items_net), the all-or-nothing void columns"
    " (ck_bills_void_consistency), doc_no unique per tenant"
    " (uq_bills_tenant_docno), cross-tenant references (the composite FKs),"
    " non-negative money and the NUMERIC scales are all enforced by Postgres."
    " T3 / T11 / T16 / X1 cannot fire unless a constraint was dropped first —"
    " which is why S5 checks that they are still there, and why those row checks"
    " are kept rather than deleted as redundant.",

    "ANY VALUE THAT WAS WRONG WHEN IT WAS WRITTEN. A unit_price that is not what"
    " the yard actually paid in cash, a weight typed 105 instead of 10.5, a bill"
    " raised against the wrong seller: all internally consistent, all invisible"
    " here. This proves the arithmetic and the numbering hold, not that the"
    " facts are true.",

    "HISTORY. There is no audit log of UPDATEs, so a total_amount edited by hand"
    " with its items edited to match reconciles perfectly. What actually defends"
    " against that is that nothing but create_bill and void_bill writes these"
    " tables — an assumption this checker cannot verify from inside the"
    " database.",

    "WHETHER doc_no ORDER MATCHES ARRIVAL ORDER. It legitimately does not."
    " server_received_at defaults to now(), which is TRANSACTION START, while"
    " the doc_no counter is taken later under a row lock — so a submit that"
    " started earlier and waited on the lock takes a LATER doc_no with an"
    " EARLIER server_received_at. Correct, and deliberately not checked.",

    "device_created_at AGAINST ANYTHING. Device clocks are untrusted by design"
    " (hard rule 7) and ~3s of real skew has been measured on this hardware, so"
    " no ordering or bound involving it is an invariant.",

    "A POINT IN TIME. The sweep is ONE snapshot, so it is internally consistent"
    " — but it is a snapshot of the moment it started and says nothing about the"
    " moment you read it. X3 reports whether rows landed during the run; if they"
    " did, a violation could be a bill mid-flight rather than a defect.",

    "NOTHING ABOUT T7 ANY MORE — and this entry is kept to say so. Until"
    " 2026-08-02 there was one honest T7: server_received_at came from Postgres'"
    " transaction-start now() while doc_no's be_year came from a separate Python"
    " datetime.now() read later in the same transaction, so a submit straddling"
    " the Buddhist new year could take next year's number on last year's stamp."
    " create_bill now reads the arrival instant ONCE and derives both from it"
    " (scripts/prove_docno_clock.py lies to Python's clock and shows the code"
    " unmoved). There is no longer any moment at which a T7 hit can be honest:"
    " every one is either a row this product did not write, or a defect.",
]


def summarise(rep: Report, tenants: Sequence[uuidlib.UUID], started: dt.datetime,
              single_tenant: bool) -> int:
    print("\n=== what this checker CANNOT see ===")
    for line in CANNOT_SEE:
        print(f"  - {line}")

    print("\n=== summary ===")
    print(f"  tenants swept   : {len(tenants)}")
    print(f"  checks run      : {rep.ran}"
          f"  ({CHECKS_PER_TENANT} per tenant x {len(tenants)},"
          f" plus 5 structural, 2 blind, 3 global)")
    print(f"  skipped         : {rep.skips}")
    print(f"  could not run   : {rep.errors}")
    print(f"  VIOLATIONS      : {rep.violations}")
    for cid, n in sorted(rep.failing_ids().items()):
        print(f"      {cid}: {n}")
    print(f"  elapsed         : "
          f"{(dt.datetime.now(dt.timezone.utc) - started).total_seconds():.1f}s")

    if rep.errors:
        print("\nRECONCILE INCONCLUSIVE: a check could not run. This is not a pass.")
        return 2
    if rep.violations:
        print(f"\nRECONCILE FAILED: {rep.violations} violation(s)."
              " Read the rows above; do not repair anything from here.")
        return 1
    if single_tenant:
        print("\nRECONCILE OK for the named tenant. This was NOT a full sweep.")
        return 0
    print("\nRECONCILE OK: every invariant held, on every tenant.")
    return 0


if __name__ == "__main__":
    try:
        code = asyncio.run(main())
    except Exception as exc:  # noqa: BLE001 — an unfinished run is never a pass
        import traceback

        traceback.print_exc()
        print(f"\nRECONCILE INCONCLUSIVE: the checker itself failed ({type(exc).__name__}).")
        code = 2
    print(f"RECONCILE_EXIT={code}")
    sys.exit(code)
