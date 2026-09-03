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
    # Migration 0012. Added the day the relation landed, because S2 goes red on
    # a table it has never heard of and its own row says to add it here — that
    # red is the checker working, not a regression, and this is the repair it
    # prescribes. Being in this list is NOT a bookkeeping entry: it is what puts
    # the relation under S1's tenant_id check, S3's RLS check, B1's blind read
    # and X2's completeness sum. It carries no per-tenant SQL check yet; the
    # invariant worth one spans `sellers` and this table and cannot be true
    # until the create path spends a reservation.
    #
    # ITS CONSTRAINTS AND ITS INDEX ARE DELIBERATELY NOT IN REQUIRED_CONSTRAINTS
    # OR REQUIRED_INDEXES, the same decision 0005, 0006 and 0011 recorded for
    # theirs: prove_reconcile.py restores a COPY from a dump, and a dump taken
    # before 0012 has neither, so S5 would go red on every such copy for a reason
    # that has nothing to do with money. Wake condition, the same as its three
    # twins: a dump taken AFTER 0012 becoming the oldest one anyone restores
    # from.
    "seller_code_reservations",
    # Migration 0015. Added the day grade_tiers landed, for the reason 0012 gives
    # above: S2 goes red on a table it has never heard of, and this list is what
    # puts grade_tiers under S1's tenant_id check, S3's RLS check, B1's blind read
    # and X2's completeness sum. Its per-tenant integrity check is T10 (a grade
    # must resolve to a tier IN THIS TENANT), NOT X1: the re-point FK is keyed on
    # (tenant_id, code), and `code` is unique only WITHIN a tenant, so X1's
    # id-keyed cross-tenant join would false-match every tenant's same-letter tier;
    # the composite FK already forbids a cross-tenant reference structurally
    # (referential integrity carries tenant_id), so T10's resolve-under-own-context
    # lens is the right and only one.
    #
    # ITS CONSTRAINTS ARE DELIBERATELY NOT IN REQUIRED_CONSTRAINTS, and neither are
    # the three FKs on product_prices/sellers/tenants that 0015 re-points at it,
    # the same decision 0012 records above: a dump taken before 0015 has none of
    # them, so S5 would go red on such a copy for a reason unrelated to money.
    "grade_tiers",
    # Migration 0016. Added the day the relation landed, for the reason 0012 and
    # 0015 give above: S2 goes red on a table it has never heard of, and this list
    # is what puts failed_login_attempts under S1's no-context read, S3's RLS
    # check, B1's blind read and X2's completeness sum. It carries no per-tenant
    # SQL check: it holds no money and no cross-tenant reference to reconcile.
    #
    # ITS CONSTRAINTS AND ITS INDEX ARE DELIBERATELY NOT IN REQUIRED_CONSTRAINTS
    # OR REQUIRED_INDEXES, the same decision 0005/0006/0011/0012/0015 recorded:
    # prove_reconcile.py restores a COPY from a dump, and a dump taken before 0016
    # has neither, so S5 would go red on such a copy for a reason unrelated to
    # money. Wake condition, the same as its twins: a dump taken AFTER 0016
    # becoming the oldest one anyone restores from.
    #
    # THE ONE BOUNDARY THIS TABLE ADDS is recorded in CANNOT_SEE below: its
    # tenant_id is an UNVERIFIED submitted claim with no FK, so a row can carry a
    # tenant_id that names no shop, and X2's per-tenant sum cannot attribute it.
    # No such row exists on this LAN-only database and none is written by any
    # proof, so X2 is green today.
    "failed_login_attempts",
]
# audit_log (migration 0017) is in ALL_RLS_TABLES but DELIBERATELY NOT in
# TENANT_TABLES, so it is NOT in X2's per-tenant completeness sum. WHY, and it was
# MEASURED, not reasoned: it is a FORENSIC log that retains a record after the tenant
# it names is deleted (a proof's throwaway tenant today; any tenant delete later), so
# a row whose tenant_id names no CURRENT shop is EXPECTED. On a restored dev copy X2
# read audit_log seen=188 present=220 -- 32 rows for tenants a proof had since
# removed -- a red about isolation that is really about a deleted tenant. This is the
# failed_login_attempts X2 boundary, but REACHED NOW on any copy where a tenant was
# ever deleted rather than a future one, which is why audit_log is EXCLUDED outright
# instead of only documented. (The first draft put it in TENANT_TABLES claiming "no
# boundary here"; X2 disproved that on the first restored copy, the checker working.)
#
# It STAYS in ALL_RLS_TABLES below, so S1 (tenant_id), S2 (known table), S3
# (RLS+FORCE, one policy) and B1 (blind read) all still cover it, and S6 checks its
# triggers. Only the completeness SUM, whose invariant it cannot satisfy, drops it.
# APPEND-ONLY at the grant level, the SECURITY DEFINER trigger its sole writer
# (recycle_app holds SELECT only). Its constraints/index are DELIBERATELY NOT in
# REQUIRED_CONSTRAINTS/REQUIRED_INDEXES, the same decision 0005..0016 recorded: a
# dump taken before 0017 has neither, so S5 would go red on such a copy for a reason
# unrelated to money. Wake condition: a dump taken AFTER 0017 is the oldest restored.
ALL_RLS_TABLES = ["tenants", *TENANT_TABLES, "audit_log"]

# The tables migration 0017 attaches the audit_capture trigger to. S6 reads the
# trigger set back out of pg_trigger and requires it to EQUAL this set -- a
# containment check would pass over a dropped trigger, and only equality also
# catches a trigger on a table this set forgot (the excess half). Restated from
# 0017's _AUDITED_TABLES rather than imported (a migration is not a library); S6
# is gated on audit_log's existence, so a pre-0017 restored copy simply skips it.
AUDITED_TABLES = frozenset({
    "uoms", "product_categories", "products", "product_prices",
    "sellers", "grade_tiers", "users", "tenants",
})

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

# The cluster roles this database's isolation rests on, and the rolconfig
# settings each one must carry. An EMPTY dict means: this role must exist and
# must be NOSUPERUSER + NOBYPASSRLS, and nothing is asserted about its rolconfig.
#
# ONE DECLARATION, THREE READERS — S4's title, its SQL and its missing-role arm.
# Those were three separate spellings of this set until 2026-08-09, and they
# failed in OPPOSITE directions, which is why they could not simply be kept in
# step by hand: a name in the SQL alone was checked but never required to EXIST
# (fail-open); a name in the tuple alone was reported DOES NOT EXIST even when it
# existed, because membership was tested against rows the SQL had never fetched
# (fail-closed, and false); and a name in the title alone changed no result at
# all while the report claimed the coverage.
#
# `search_path=directory` IS A RESTATEMENT, NOT AN INDEPENDENT DERIVATION, and it
# is named as one here for exactly the reason this module's docstring gives about
# doc_no's `B-{year}-{seq}` shape. db/init/00_init_roles.sql:87 sets it in SQL at
# cluster bootstrap; there is no helper to import. Reading the expected value out
# of that file, or out of pg_namespace, would make the two sides agree BY
# CONSTRUCTION (lessons/a-checker-must-not-share-the-code-it-checks.md) and would
# destroy the only disproof this check has. It is written here by hand and must
# be MAINTAINED here by hand.
#
# WHAT THIS ASSERTS, AND WHAT IT DELIBERATELY DOES NOT. It compares the CLUSTER's
# rolconfig against the literal below. It does NOT check that a schema of that
# name exists: on a database at 0008 it genuinely does not, BY DESIGN
# (db/init/00_init_roles.sql:78-86 records the observation), so a check that
# reddened there would be red for being correct. That boundary is owed a
# CANNOT_SEE entry and does not have one yet.
REQUIRED_ROLES: dict[str, dict[str, str]] = {
    "recycle_app": {},
    "recycle_owner": {},
    "recycle_directory": {"search_path": "directory"},
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
        UNION ALL
        -- grade_tiers references (0015). Joined on `code`, not id: the FK is
        -- (tenant_id, grade) -> (tenant_id, code). Under this tenant's RLS
        -- context, grade_tiers holds only this tenant's tiers and code is unique
        -- within it, so a resolvable tier is necessarily the SAME tenant's --
        -- "exists" and "in the same tenant" are one condition here.
        SELECT 'price -> grade tier', pp.id::text, pp.grade
          FROM product_prices pp
          LEFT JOIN grade_tiers gt ON gt.code = pp.grade
         WHERE gt.code IS NULL
        UNION ALL
        SELECT 'seller -> grade tier', s.code, s.grade
          FROM sellers s
          LEFT JOIN grade_tiers gt ON gt.code = s.grade
         WHERE s.grade IS NOT NULL AND gt.code IS NULL
        UNION ALL
        SELECT 'shop default -> grade tier', t.id::text, t.default_grade
          FROM tenants t
          LEFT JOIN grade_tiers gt ON gt.code = t.default_grade
         WHERE t.default_grade IS NOT NULL AND gt.code IS NULL
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
       (SELECT count(*) FROM doc_no_counters)                             AS counters,
       (SELECT count(*) FROM seller_code_reservations)                    AS reservations,
       (SELECT count(*) FROM grade_tiers)                                  AS grade_tiers,
       (SELECT count(*) FROM failed_login_attempts)                        AS failed_logins
"""

# Which SCOPE_SQL column feeds each table's running total for X2.
#
# EVERY TABLE IN TENANT_TABLES MUST HAVE AN ENTRY HERE, and the failure of
# forgetting one is silent in the direction that reads as a defect: X2 sums the
# per-tenant sweep against the global count, so a table listed above with no
# column here contributes 0 to `seen` and reports every row it holds as UNSEEN —
# a red about tenant isolation raised by a missing dictionary key.
SCOPE_COLUMN = {
    "purchase_bills": "bills", "purchase_bill_items": "items", "sellers": "sellers",
    "products": "products", "product_prices": "prices",
    "product_categories": "categories", "uoms": "uoms", "users": "users",
    "doc_no_counters": "counters",
    "seller_code_reservations": "reservations",
    "grade_tiers": "grade_tiers",
    "failed_login_attempts": "failed_logins",
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
def rolconfig_setting(rolconfig: Sequence[str] | None,
                      name: str) -> tuple[str, str | None]:
    """One setting's value out of a `pg_roles.rolconfig` array. PURE, no I/O.

    `rolconfig` is `text[]` of `name=value` entries, or NULL for a role that
    carries none. Returns (state, value):

        ("absent",     None)   no entry for `name`
        ("present",    value)  exactly one entry
        ("duplicated", None)   more than one entry for `name`

    PER SETTING NAME, NEVER THE ARRAY WHOLE. A role may legitimately carry
    unrelated entries — `statement_timeout`, `lock_timeout` — and S4 has no
    opinion on them, so comparing the whole array would redden for a setting
    nothing here asked about.

    SPLIT ON THE FIRST `=` ONLY. A search_path value carries commas and quotes
    (`search_path="$user", public`) and a quoted identifier may carry the
    separator itself (`search_path="a=b", public`) — that SECOND example is the
    one this rule exists for, and the first does not exercise it at all.

    `duplicated` fails CLOSED rather than taking the first entry. Postgres is not
    expected to produce two entries for one name; a checker that ASSUMES it
    cannot is asserting a fact about its own input, which is the shape
    lessons/a-check-that-never-went-red-was-never-observed.md exists for.

    Module-level and pure so it can be driven directly with inputs written by
    hand — see prove_reconcile.py's `prove_rolconfig_parse`, which explains why
    that is an exception to how everything else in that file asserts.
    """
    prefix = f"{name}="
    hits = [entry[len(prefix):] for entry in (rolconfig or [])
            if entry.startswith(prefix)]
    if not hits:
        return "absent", None
    if len(hits) > 1:
        return "duplicated", None
    return "present", hits[0]


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
           -- server_clock_watermark holds ONE timestamp about this MACHINE and
           -- no shop data at all, so it has no tenant_id and cannot have one.
           -- Excluded for the same reason as alembic_version. See 0008 and the
           -- CANNOT_SEE entry, which carries the prohibition that makes it safe.
           AND c.relname NOT IN ('alembic_version', 'tenants',
                                 'server_clock_watermark')
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
    unknown = [t for t in present
               if t not in [*ALL_RLS_TABLES, "alembic_version",
                            "server_clock_watermark"]]
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

    # S4 — the runtime roles cannot step around any of it, and the directory
    # reader still names the schema its migration creates.
    #
    # EVERY ROW BELOW PRINTS BOTH SIDES — the value read from pg_roles and the
    # value expected. A row saying only MISMATCH would be printed identically by
    # a checker that never queried anything, so it would be evidence of nothing.
    #
    # The role set, the SQL and the missing-role arm all read REQUIRED_ROLES; the
    # title names no role, so there is no fourth copy to drift. `= ANY($1::text[])`
    # rather than an IN literal, the same shape S3 already uses for ALL_RLS_TABLES.
    r = Result("S4", "every required role exists, is NOSUPERUSER + NOBYPASSRLS,"
                     " and carries the rolconfig settings declared for it")
    rows = await admin.fetch(
        "SELECT rolname, rolsuper, rolbypassrls, rolconfig FROM pg_roles"
        " WHERE rolname = ANY($1::text[]) ORDER BY 1", list(REQUIRED_ROLES))
    found = {x["rolname"]: x for x in rows}
    bad = [f"role={x['rolname']}  superuser={x['rolsuper']}  bypassrls={x['rolbypassrls']}"
           for x in rows if x["rolsuper"] or x["rolbypassrls"]]
    bad += [f"role={n}  DOES NOT EXIST" for n in REQUIRED_ROLES if n not in found]

    declared = sum(len(s) for s in REQUIRED_ROLES.values())
    compared = 0
    for role, settings in REQUIRED_ROLES.items():
        row = found.get(role)
        if row is None:
            continue          # already reported DOES NOT EXIST, above
        for setting, want in settings.items():
            compared += 1
            state, got = rolconfig_setting(row["rolconfig"], setting)
            if state == "present" and got == want:
                continue
            if state == "duplicated":
                bad.append(f"role={role}  setting={setting}  is=DUPLICATED"
                           f"  expected={want!r}"
                           f"  rolconfig={list(row['rolconfig'] or [])}")
            else:
                bad.append(f"role={role}  setting={setting}"
                           f"  is={'ABSENT' if state == 'absent' else repr(got)}"
                           f"  expected={want!r}")

    # THE FLOOR, on both dimensions, and the arm that makes the settings half of
    # it enforceable rather than decorative. `examined` used to be len(rows) — a
    # count of what was FOUND, with nothing requiring it to be what was WANTED, so
    # a role vanishing from the cluster shortened the number and nothing objected.
    # A declared setting that went uncompared while its role was PRESENT is a
    # defect in THIS check rather than in the cluster, and it says which.
    unreachable = declared - compared - sum(
        len(s) for n, s in REQUIRED_ROLES.items() if n not in found)
    if unreachable:
        bad.append(f"CHECKER DEFECT: {unreachable} declared setting(s) were never"
                   " compared although the role carrying them is present")
    r.examined = (f"{len(rows)} of {len(REQUIRED_ROLES)} roles"
                  f" ({', '.join(sorted(REQUIRED_ROLES))});"
                  f" {compared} of {declared} declared setting(s) compared")
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

    # S6 — the audit triggers are all present (migration 0017). A silently dropped
    # trigger means a master-data write leaves NO record — the worst failure this
    # design can have, and it moves no count, no exit code and no other check — so
    # reconcile is where production notices it. Gated on audit_log's existence: a
    # dump taken before 0017 has neither the table nor the triggers, and S6 must
    # not red on such a restored copy (the same wake condition S5 gives the 0017
    # constraints). EQUALITY, not containment: a MISSING trigger and an UNEXPECTED
    # one both matter, and only checking both catches a set that drifted either way.
    r = Result("S6", "every audited table carries its audit_capture trigger,"
                     " and the trigger function is SECURITY DEFINER")
    if "audit_log" not in present:
        r.skipped = ("audit_log is absent (a database from before migration 0017);"
                     " the audit triggers do not exist here yet")
        rep.add("global", r)
    else:
        # tgenabled is the internal "char" type; asyncpg hands it back as BYTES,
        # not str, so `x != 'O'` is true of a perfectly enabled trigger (measured:
        # every trigger read as DISABLED). Compute the "does it fire" boolean in
        # SQL instead -- 'O' fires in origin mode, 'A' fires always; 'D'/'R' do not.
        trg = await admin.fetch(
            "SELECT c.relname AS table_name, (t.tgenabled IN ('O','A')) AS fires"
            "  FROM pg_trigger t"
            "  JOIN pg_class c ON c.oid = t.tgrelid"
            "  JOIN pg_namespace n ON n.oid = c.relnamespace"
            " WHERE n.nspname = 'public' AND t.tgname = 'audit_capture'"
            "   AND NOT t.tgisinternal")
        have = {x["table_name"] for x in trg}
        disabled = {x["table_name"] for x in trg if not x["fires"]}
        fn = await admin.fetchrow(
            "SELECT prosecdef FROM pg_proc WHERE proname = 'audit_capture'")
        problems: list[str] = []
        for miss in sorted(AUDITED_TABLES - have):
            problems.append(f"table={miss}  HAS NO audit_capture TRIGGER"
                            " — a write to it would leave no audit record")
        for extra in sorted(have - AUDITED_TABLES):
            problems.append(f"table={extra}  carries an audit_capture trigger this"
                            " checker did not expect — update AUDITED_TABLES")
        for off in sorted(disabled):
            problems.append(f"table={off}  audit_capture trigger is DISABLED"
                            " (tgenabled not in O/A), so it does not fire")
        if fn is None:
            problems.append("the audit_capture FUNCTION does not exist")
        elif not fn["prosecdef"]:
            problems.append("audit_capture is NOT SECURITY DEFINER — the app role"
                            " cannot write audit_log, so every audited write fails")
        r.examined = f"{len(have)} of {len(AUDITED_TABLES)} audited tables have the trigger"
        r.total = len(problems)
        r.rows = problems
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
                      f" {scope['counters']} counter rows, {scope['users']} users,"
                      f" {scope['reservations']} code reservations")
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

    "HISTORY. audit_log (0017) records every master-data write, but NOT the"
    " transactional tables (purchase_bills / purchase_bill_items are deliberately"
    " not audited), so a total_amount edited by hand with its items edited to match"
    " reconciles perfectly. What actually defends against that is that nothing but"
    " create_bill and void_bill writes these"
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

    "WHETHER THE SERVER'S OWN CLOCK IS RIGHT — and T7 above is the reason this"
    " entry exists. T7 compares the be_year parsed from doc_no against"
    " _be_year(server_received_at), but create_bill derives BOTH from ONE"
    " now(), so T7 is _be_year(X) against _be_year(X) and cannot disagree"
    " however wrong X was. T8 and T9 take no time input at all. T12 is the only"
    " check here that compares two clock readings taken at different moments,"
    " and it needs the bill to have been VOIDED, so it catches a backward jump"
    " only by accident. Nothing in this sweep disbelieves now().",

    "server_clock_watermark IS NOT CHECKED HERE, AND IS EXCLUDED FROM S1 AND S2"
    " ON PURPOSE. It holds ONE timestamp — the highest now() this server has"
    " ever observed — and no shop data of any kind. It has no tenant_id and sits"
    " OUTSIDE RLS because the guard that reads it runs at STARTUP, before any"
    " request and therefore before any tenant context exists;"
    " tenant_connection(None) fails closed, so an RLS-protected watermark would"
    " be unreadable exactly when it must be read. That makes it the second table"
    " the app role can read with no tenant context, after alembic_version —"
    " which the app role cannot read at all. NOTHING TENANT-SCOPED MAY EVER BE"
    " ADDED TO THIS TABLE: that prohibition is the whole reason a table outside"
    " the isolation model is acceptable, and if it is ever broken S1 and S2 will"
    " NOT catch it, because they have been told to skip this table.",

    "A failed_login_attempts ROW WHOSE tenant_id NAMES NO SHOP. That table's"
    " tenant_id is the SUBMITTED login claim (migration 0016), with no FK to"
    " tenants on purpose, so a guesser who posts a tenant_id that matches no shop"
    " writes a row X2 cannot attribute: the per-tenant sweep iterates the tenants"
    " that EXIST, so such a row is counted in the global total and in no tenant's"
    " sweep, and X2 would report it UNSEEN — a red about isolation that is really"
    " about an unverified claim. It is in ALL_RLS_TABLES for S1/S3 (its RLS is"
    " real and worth checking) but this boundary on X2 is why a future X2 red on"
    " this table alone is read here first. No such row exists on a LAN-only"
    " database and none is written by any proof; the boundary becomes reachable at"
    " the P1.2 internet move, and the fix then is to exclude this table from X2,"
    " not to engineer the checker now.",

    "THAT THE CLOCK WATERMARK ONLY EVER MOVES FORWARD. app/clock_guard.py"
    " advances it with GREATEST(highest_seen, now()), so no code path in the"
    " application lowers it — but UPDATE is granted to recycle_app, so a"
    " hand-written statement as the app role CAN lower it, and nothing in the"
    " database refuses. Only INSERT and DELETE are refused at the grant level."
    " Forward-only is an application property, not a schema one. Closing it"
    " needs a BEFORE UPDATE trigger, which this schema does not have anywhere.",

    "WHETHER A doc_no's BE YEAR IS THE YEAR IT SHOULD HAVE BEEN. The year gate"
    " in create_bill refuses a NEW (tenant_id, be_year) counter that is not"
    " max+1, but it cannot see a jump of exactly +1 year — that is identical to"
    " a real new year given only this server's clock — and it is silent for a"
    " tenant's FIRST counter, which has no predecessor to compare against. A"
    " shop onboarded under a wrong clock takes a wrong first year and neither"
    " the gate nor T7 nor anything here will say so.",

    "S4's SUBJECT IS THE CLUSTER, NOT THE DATABASE UNDER TEST. pg_roles is shared"
    " by every database in the cluster, so S4 returns the SAME answer whatever"
    " --database is given, and that cuts both ways. A green S4 beside a restored"
    " scratch copy is therefore a statement about the LIVE money database too,"
    " which is stronger than anything else in this report. And S4 cannot be made"
    " to differ by restoring a different copy: no dump can move it, no fixture can"
    " exercise it, and it is the one structural check here that is not about the"
    " database it was pointed at.",

    "S4 CHECKS THE VALUE OF A ROLE'S search_path AND NEVER THAT THE SCHEMA EXISTS."
    " Three things follow that it cannot see. (1) It cannot tell a cluster that"
    " has NEVER run migration 0009 from one DOWNGRADED away from it: rolconfig"
    " survives `alembic downgrade`, so both show a role naming a schema that is"
    " not there — which is the DESIGNED state before 0009"
    " (db/init/00_init_roles.sql:78-86) and a broken one after it."
    " (2) It cannot see a COORDINATED RENAME IN SOURCE. Rename the schema in 0009"
    " and the path in 00_init_roles.sql together and the cluster still agrees with"
    " the literal in REQUIRED_ROLES while the link is gone: this check binds the"
    " CLUSTER to the checker, not one source file to another."
    " (3) IT CANNOT SEE A PER-DATABASE OVERRIDE, and this one was MEASURED rather"
    " than reasoned. `ALTER ROLE ... IN DATABASE ... SET search_path` writes"
    " pg_db_role_setting and does NOT touch pg_roles.rolconfig. On a throwaway"
    " cluster built from db/init/00_init_roles.sql, after that statement rolconfig"
    " still read {search_path=directory} — so S4 is GREEN — while a session as"
    " that role INTO THAT DATABASE returned `something_else`, and the same role"
    " into another database still returned `directory`. The role-wide value S4"
    " reads can be contradicted, in the one database it is about, without S4"
    " moving.",
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
          f" plus 6 structural, 2 blind, 3 global)")
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
