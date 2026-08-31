r"""grade_tiers: the per-tenant grade model (S16 / P1.24), replacing the letter
CHECK constraints with a table a shop configures for itself.

Revision ID: 0015
Revises: 0014
Create Date: 2026-08-31

WHAT THIS IS, AND WHY IT IS A TABLE AND NOT A COLUMN
----------------------------------------------------
Until now the grade set was the closed letters A-D, written into the schema as
three CHECK constraints (re-derived from information_schema, NOT from the
migration log -- see THE COUNT below): product_prices.grade, sellers.grade, and
tenants.default_grade. A shop could not declare its own tiers, could not name
them, and a shop that does not grade at all was forced through an office round
trip on every walk-in (OPEN_ITEMS "Blocking one real paying shop"). S16 settles
that the grade model becomes a PER-TENANT TABLE replacing a CHECK; this migration
is that table. F0-F4 (the owner's decisions, 2026-08-31) govern the shape:
maximum shop freedom, at least ONE tier, no product-imposed ceiling, tier NAMES
are the shop's own text, and a tier is DEACTIVATED, never deleted.

THE COUNT -- A LOG IS NOT A SCHEMA (lessons/a-migration-stack-is-a-log-not-a-
schema.md). 0010's docstring names FIVE sites encoding A-D and FOUR CHECKs, but
0003 DROPPED purchase_bill_items.grade, so the head schema holds exactly THREE
grade CHECKs. Re-derived from pg_constraint on dev 2026-08-31:
  product_prices_grade_check  (inline in 0001, auto-named)
  ck_sellers_grade            (0003)
  ck_tenants_default_grade    (0010)
This migration drops those three and re-points their columns at grade_tiers. The
Python `Grade = Literal["A","B","C","D"]` in server/app/master.py is a fifth,
compile-time site; it is not a database constraint and is handled by the routes
in the same commit, not here.

THE FOREIGN-KEY TARGET IS `code`, NOT `id`, AND THAT IS A DELIBERATE CHOICE
--------------------------------------------------------------------------
The re-point is a COMPOSITE FK (tenant_id, grade) -> grade_tiers (tenant_id,
code), not (tenant_id, grade_tier_id) -> (tenant_id, id). Three reasons:

  1. ARCHITECTURE 4 point 1's guarantee is TENANT-CONSISTENCY, and a composite FK
     on (tenant_id, code) carries tenant_id exactly as one on (tenant_id, id)
     does -- a price or seller in shop X cannot reference a tier in shop Y,
     because the child's own tenant_id participates in the FK and referential
     integrity bypasses RLS. Point 1 targets `id` only because id is the natural
     PK of the tables it discusses; here the meaningful key already present in
     the columns being re-pointed is the grade CODE, and grade_tiers carries
     uq_grade_tiers_tenant_code for it to target.

  2. Minimal blast radius. product_prices.grade and sellers.grade stay `text`
     columns holding a code; the existing uq_prices_tenant_product_grade
     UNIQUE (tenant_id, product_id, grade) stays meaningful; every server and
     phone path that treats a grade as a short string keeps working. Only the
     CHECK changes to an FK. Re-typing the columns to uuid would rewrite that
     unique, every grade read/write on two clients, and every proof.

  3. The backfill is then trivial and safe: code = the existing letter, so every
     existing product_prices/sellers/default_grade value already satisfies the FK
     the moment grade_tiers is populated (which happens BEFORE the FK is added).

  CAN A SHOP RENAME A CODE? No -- the code is the stable identifier a reference
  points at, so PATCH /grade-tiers changes name/sort_order/is_active and never
  code. F3's "tier NAMES are the shop's own text" maps to the `name` column,
  which is free to change because nothing references it; the `code` is the
  handle, exactly as uoms/product_categories/products/sellers pair a stable
  `code` with a renameable `name`. F4 ("changing the tier set never rewrites
  history") is satisfied: a bill carries its own prices (hard rule 6) and is
  never re-read from product_prices, so a rename or a deactivation reaches no
  historical bill.

ENGINEERING BOUNDS, NOT BUSINESS RULES (F1)
-------------------------------------------
F1: a shop declares AT LEAST ONE tier with NO product-imposed maximum. The only
bounds here are ones the wire/index requires, chosen generously and named as
engineering bounds:
  * ck_grade_tiers_code_len: char_length(code) BETWEEN 1 AND 32. The code is a
    UNIQUE key and an FK target embedded in product_prices/sellers; a short
    handle keeps those indexes sane. 32 UTF-8 chars is generous even for Thai.
    Lower bound 1 because an empty code is not a handle (the column is NOT NULL).
  * ck_grade_tiers_name_len: char_length(name) BETWEEN 1 AND 100. The name is a
    display label on a phone; 100 is far past any real tier name. These bounds
    equal the API model's max_length at the edge, so the column refuses exactly
    what the route refuses (lessons/edge-must-reject-what-the-column-rounds.md --
    text does not round, so the CHECK is the agreement, not a rounding guard).
  * sort_order is `integer`, the shop's ordering key, and carries NO CHECK: it is
    not a rank the code assigns meaning to, and any int is a valid order.

NO UNIQUE ON (tenant_id, sort_order), AND THE REASON IS RE-ORDERING. If it were
unique, moving one tier into a slot another tier holds -- the natural one-row
PATCH -- would violate it immediately, and honouring F3's "ordering is the
shop's" would need a DEFERRABLE constraint or a whole-set renumber in one
statement. sort_order is advisory; ties (two tiers sharing a number) are broken
by code at read time. So no unique is added, per the brief's own instruction.

THE BACKFILL, AND WHY IT RUNS WITH FORCE TEMPORARILY LIFTED
-----------------------------------------------------------
Migrations run as recycle_owner (env.py: MIGRATION_DATABASE_URL), which is
NOBYPASSRLS, and product_prices/sellers/tenants are FORCE ROW LEVEL SECURITY --
so FORCE binds the owner too. MEASURED on dev 2026-08-31: as recycle_owner with
no app.tenant_id set, `SELECT count(*) FROM product_prices` returns 0. A backfill
that read the source tables directly would therefore insert NOTHING. This is the
first migration in the project to read tenant data across all tenants, which is
why the mechanism is spelled out.

The fix is the standard idiom, and it exposes nothing: FORCE is lifted on the
three SOURCE tables for the duration of the backfill, the owner reads them, then
FORCE is restored. NO FORCE affects ONLY the table owner -- recycle_app is not
the owner and stays fully governed by the policy whether FORCE is on or off (also
MEASURED 2026-08-31: with FORCE lifted the owner read pp=24/sel=11/ten=4; a
rollback left relforcerowsecurity=t on all three). The whole thing is one atomic
migration transaction with no requests running, and reconcile.py's S3 re-checks
that FORCE is on afterwards, so a forgotten restore is caught. grade_tiers itself
is created WITHOUT RLS, backfilled, and only THEN given ENABLE+FORCE+policy, so
the backfill INSERT is not fighting its own WITH CHECK either.

Backfill rule, ONE rule not two:
  * For every tenant, one tier per DISTINCT grade code it actually uses across
    product_prices, sellers and default_grade. code = the existing letter, name =
    the letter (the shop renames it later; inventing a Thai name here would be
    lessons/fallback-default-is-a-wrong-number.md), sort_order = 0-based
    alphabetical, is_active = true.
  * A tenant with NO grade data ANYWHERE gets ONE tier: code 'A', name 'A',
    sort_order 0, active (F2 -- a shop that does not grade is a shop with one
    tier, not a nullable grade). 'A' is the programme's own neutral placeholder,
    NOT a Thai business claim, and it is never shown: F2 hides the grade control
    for a one-tier shop, so this tier surfaces only if the shop deliberately
    renames it. Using 'A' keeps the backfill a single rule -- a graded shop's
    tiers and a no-grade shop's one tier are minted the same way.
  MEASURED backfill input on dev 2026-08-31: Shop A and Shop B each {A,B,C,D};
  the two 2026-08-10 tenants (982d76af..., a45432ea...) have no grade data and
  take the single 'A' tier.

DOWNGRADE FAILS LOUDLY RATHER THAN DROPPING WHAT A SHOP INVENTED
---------------------------------------------------------------
The downgrade restores the three A-D CHECKs and drops grade_tiers, which is only
safe where nothing was declared beyond the pristine backfill. It REFUSES (the
shape 0009/0012 use) if any tier is non-trivial -- a code outside A-D, a renamed
name, or a deactivated tier -- or if any grade value in use falls outside A-D
(which would fail the restored CHECK anyway). Both counts are named in the
refusal so the operator knows what would be lost. A freshly-upgraded database is
entirely trivial, so the down-then-up path is provable on a scratch copy.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Reusable RLS predicate. The same expression 0001 uses on every tenant table and
# master.py writes with, so the value an INSERT writes and the value the policy
# tests are one thing.
_TENANT_MATCH = "NULLIF(current_setting('app.tenant_id', true), '')::uuid"

# ASCII ONLY, no apostrophes, NO BRACES: these strings are embedded in SQL literals
# through f-strings and are meant to be read back out of the catalogue on a
# codepage-874 box without needing hex to be believed
# (lessons/console-is-not-the-observation.md). A brace under an f prefix would be
# interpolated away with no error. Convention from 0006/0009/0011/0012/0013/0014.
_TABLE_COMMENT = (
    "A per-tenant grade tier: how a shop declares its price tiers. AT LEAST ONE "
    "per shop, NO product-imposed maximum (P1.24 / S16). A shop that does not "
    "grade is a shop with ONE tier, not a nullable grade. `code` is the stable "
    "handle a product_prices/sellers/default_grade row references by composite FK "
    "(tenant_id, code); `name` is the display text the shop owns and is free to "
    "change. A tier is DEACTIVATED (is_active=false), NEVER deleted: a bill "
    "carries its own prices (hard rule 6) so history is untouched, and a seller "
    "sitting in a tier must be moved before it can be deactivated. See migration "
    "0015."
)
_CODE_COMMENT = (
    "The stable identifier of the tier within the shop, and the FK target for "
    "product_prices.grade, sellers.grade and tenants.default_grade. It is the "
    "same namespace those columns held as letters before 0015. IMMUTABLE by "
    "design: rows reference it, so PATCH /grade-tiers never changes it -- the "
    "shop renames the `name`, not the code. Bounded 1..32 chars by "
    "ck_grade_tiers_code_len, an engineering bound (a short key kept small for "
    "the indexes it sits in), not a business rule."
)
_NAME_COMMENT = (
    "The display text of the tier, the words the shop owns (Thai or otherwise). Free to "
    "change because nothing references it. Backfilled equal to the code for "
    "existing shops; the shop renames it. Bounded 1..100 chars by "
    "ck_grade_tiers_name_len, matching the API edge, so the column refuses "
    "exactly what the route refuses."
)
_SORT_ORDER_COMMENT = (
    "The ordering key the shop sets for its tiers, advisory. NOT unique and NOT a rank "
    "the code assigns meaning to: a one-row re-order into an occupied slot must "
    "not be refused, so no unique constraint sits on it and ties are broken by "
    "code at read time. Backfilled 0-based alphabetical."
)
_IS_ACTIVE_COMMENT = (
    "Whether the tier is offered for new work. A tier is deactivated, never "
    "deleted (there is no DELETE grant); deactivation is refused while sellers "
    "still sit in the tier, and the refusal names how many. Row-level reads never "
    "filter on this, so a deactivated tier still resolves for a historical bill "
    "display -- the same retirement shape as is_active on the master-data tables."
)


def upgrade() -> None:
    # Each statement issued separately: asyncpg's extended query protocol forbids
    # multiple commands in one prepared statement (convention from 0001/0012).
    # Plain strings for the DDL; only the COMMENTs interpolate, and they are ASCII.

    # ----------------------------------------------------------------- the table
    # id uuid PK with the composite uq (tenant_id, id) kept per ARCHITECTURE 4
    # point 1 so a future relation can reference a tier by its stable id; the
    # ACTIVE re-point target is uq (tenant_id, code). Both cost one index each.
    op.execute(
        """
        CREATE TABLE grade_tiers (
            id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id  uuid        NOT NULL REFERENCES tenants (id),
            code       text        NOT NULL,
            name       text        NOT NULL,
            sort_order integer     NOT NULL,
            is_active  boolean     NOT NULL DEFAULT true,
            created_at timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_grade_tiers_tenant_id   UNIQUE (tenant_id, id),
            CONSTRAINT uq_grade_tiers_tenant_code UNIQUE (tenant_id, code),
            CONSTRAINT ck_grade_tiers_code_len
                CHECK (char_length(code) BETWEEN 1 AND 32),
            CONSTRAINT ck_grade_tiers_name_len
                CHECK (char_length(name) BETWEEN 1 AND 100)
        )
        """
    )
    op.execute(f"COMMENT ON TABLE  grade_tiers            IS '{_TABLE_COMMENT}'")
    op.execute(f"COMMENT ON COLUMN grade_tiers.code       IS '{_CODE_COMMENT}'")
    op.execute(f"COMMENT ON COLUMN grade_tiers.name       IS '{_NAME_COMMENT}'")
    op.execute(f"COMMENT ON COLUMN grade_tiers.sort_order IS '{_SORT_ORDER_COMMENT}'")
    op.execute(f"COMMENT ON COLUMN grade_tiers.is_active  IS '{_IS_ACTIVE_COMMENT}'")

    # ---------------------------------------------------------------- the backfill
    # FORCE lifted on the SOURCE tables ONLY, and ONLY for the owner (recycle_app
    # stays governed). See the docstring's FORCE section; measured on dev.
    op.execute("ALTER TABLE tenants        NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE product_prices NO FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE sellers        NO FORCE ROW LEVEL SECURITY")

    # One tier per distinct grade code a tenant actually uses. sort_order 0-based
    # alphabetical via row_number over a deterministic order (codes are distinct
    # per tenant after the UNION).
    op.execute(
        """
        INSERT INTO grade_tiers (tenant_id, code, name, sort_order, is_active)
        SELECT d.tenant_id,
               d.grade,
               d.grade,
               (row_number() OVER (PARTITION BY d.tenant_id ORDER BY d.grade))::int - 1,
               true
        FROM (
            SELECT tenant_id, grade        FROM product_prices WHERE grade IS NOT NULL
            UNION
            SELECT tenant_id, grade        FROM sellers        WHERE grade IS NOT NULL
            UNION
            SELECT id,        default_grade FROM tenants        WHERE default_grade IS NOT NULL
        ) AS d
        """
    )

    # Every tenant that got NO tier above (no grade data anywhere) gets ONE:
    # code 'A', name 'A', active. F2 -- one tier, not a nullable grade. 'A' is the
    # programme's neutral placeholder, never shown for a one-tier shop.
    op.execute(
        """
        INSERT INTO grade_tiers (tenant_id, code, name, sort_order, is_active)
        SELECT t.id, 'A', 'A', 0, true
        FROM tenants t
        WHERE NOT EXISTS (
            SELECT 1 FROM grade_tiers gt WHERE gt.tenant_id = t.id
        )
        """
    )

    # Restore FORCE. reconcile.py S3 re-checks this; a forgotten line goes red.
    op.execute("ALTER TABLE tenants        FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE product_prices FORCE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE sellers        FORCE ROW LEVEL SECURITY")

    # -------------------------------------------------------------------- RLS
    # Ordinary business data inside the isolation model. ENABLE + FORCE + one
    # policy keyed on app.tenant_id, exactly as 0001/0012 attach to every tenant
    # table. Enabled AFTER the backfill so the INSERT above is not subject to its
    # own WITH CHECK.
    op.execute("ALTER TABLE grade_tiers ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE grade_tiers FORCE ROW LEVEL SECURITY")
    op.execute(
        "CREATE POLICY tenant_isolation ON grade_tiers "
        f"USING (tenant_id = {_TENANT_MATCH}) "
        f"WITH CHECK (tenant_id = {_TENANT_MATCH})"
    )

    # ----------------------------------------------------------------- grants
    # Written for the reader; ALTER DEFAULT PRIVILEGES in 00_init_roles.sql has
    # already handed recycle_app arwd (0008/0012 measured this). The REVOKE is
    # what narrows: a tier is DEACTIVATED, never deleted (F4), so the app gets no
    # DELETE. SELECT/INSERT/UPDATE cover reading, creating and PATCHing a tier.
    op.execute("GRANT SELECT, INSERT, UPDATE ON grade_tiers TO recycle_app")
    op.execute("REVOKE DELETE ON grade_tiers FROM recycle_app")

    # ------------------------------------------------------------- the re-point
    # Drop the three letter CHECKs (re-derived from pg_constraint, NOT the log)
    # and replace each column's validation with a composite FK to grade_tiers by
    # code. product_prices.grade is NOT NULL, so its FK is always checked;
    # sellers.grade and tenants.default_grade are NULLABLE, so their composite FKs
    # are MATCH SIMPLE -- not checked while the column is NULL, the same mechanic
    # 0001 documents for voided_by. tenants is keyed on its own id, so its FK
    # leg is (id, default_grade).
    op.execute("ALTER TABLE product_prices DROP CONSTRAINT product_prices_grade_check")
    op.execute(
        "ALTER TABLE product_prices ADD CONSTRAINT fk_prices_grade_tier"
        " FOREIGN KEY (tenant_id, grade) REFERENCES grade_tiers (tenant_id, code)"
    )
    op.execute("ALTER TABLE sellers DROP CONSTRAINT ck_sellers_grade")
    op.execute(
        "ALTER TABLE sellers ADD CONSTRAINT fk_sellers_grade_tier"
        " FOREIGN KEY (tenant_id, grade) REFERENCES grade_tiers (tenant_id, code)"
    )
    op.execute("ALTER TABLE tenants DROP CONSTRAINT ck_tenants_default_grade")
    op.execute(
        "ALTER TABLE tenants ADD CONSTRAINT fk_tenants_default_grade_tier"
        " FOREIGN KEY (id, default_grade) REFERENCES grade_tiers (tenant_id, code)"
    )


def downgrade() -> None:
    # REFUSE if anything beyond the pristine A-D backfill exists, so the drop
    # cannot silently lose a shop's own tiers. The shape 0009/0012 established.
    # to_regclass returns NULL (not an error) when the table is absent, so this is
    # safe on a database where upgrade() never ran.
    bind = op.get_bind()
    if bind.exec_driver_sql(
        "SELECT to_regclass('public.grade_tiers')"
    ).scalar() is not None:
        # LIFT FORCE FIRST, or the guard reads nothing and defeats itself. This
        # runs as recycle_owner, and grade_tiers/product_prices/sellers/tenants
        # are FORCE RLS, so with no app.tenant_id set the owner sees 0 rows
        # (measured 2026-08-31) -- a silent count of zero that would let a
        # dangerous downgrade proceed, which is the exact failure this guard
        # exists to prevent. Lift FORCE (owner-only; recycle_app stays governed),
        # read, restore FORCE on the tables that survive. grade_tiers is dropped
        # below, so its FORCE state is moot; if the guard raises, the whole
        # transaction rolls back and every FORCE change with it.
        op.execute("ALTER TABLE grade_tiers    NO FORCE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE product_prices NO FORCE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE sellers        NO FORCE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE tenants        NO FORCE ROW LEVEL SECURITY")
        # A tier is "trivial" iff it is exactly what the backfill would mint:
        # a letter code, name equal to code, active. Anything else is a shop's
        # own declaration -- an invented code, a rename, or a deactivation.
        nontrivial = bind.exec_driver_sql(
            "SELECT count(*) FROM grade_tiers"
            " WHERE NOT (code IN ('A','B','C','D') AND name = code AND is_active)"
        ).scalar()
        # Grade values that would fail the A-D CHECK being restored. (The CHECK
        # re-add below would also fail loudly on these, since constraint
        # validation bypasses RLS; this pre-check just names them clearly.)
        out_of_range = bind.exec_driver_sql(
            "SELECT"
            " (SELECT count(*) FROM product_prices"
            "    WHERE grade NOT IN ('A','B','C','D'))"
            " + (SELECT count(*) FROM sellers"
            "    WHERE grade IS NOT NULL AND grade NOT IN ('A','B','C','D'))"
            " + (SELECT count(*) FROM tenants"
            "    WHERE default_grade IS NOT NULL"
            "      AND default_grade NOT IN ('A','B','C','D'))"
        ).scalar()
        # Restore FORCE on the tables that survive the downgrade (grade_tiers is
        # dropped below). Done before the raise so a refusal leaves a clean tree
        # even were the transaction not rolled back.
        op.execute("ALTER TABLE product_prices FORCE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE sellers        FORCE ROW LEVEL SECURITY")
        op.execute("ALTER TABLE tenants        FORCE ROW LEVEL SECURITY")
        if nontrivial or out_of_range:
            raise RuntimeError(
                "REFUSING to downgrade 0015: the grade model has moved past the"
                f" pristine A-D backfill. {nontrivial} tier(s) are a shop's own"
                f" (an invented code, a rename, or a deactivation), and"
                f" {out_of_range} grade value(s) in use fall outside A-D.\n"
                "\n"
                "WHY THAT IS NOT SAFE: this downgrade restores CHECK (grade IN"
                " 'A'..'D') on three columns and DROPS grade_tiers. Restoring the"
                " CHECK fails on any out-of-range value, and dropping the table"
                " destroys every tier name and every deactivation a shop"
                " declared -- silently losing the shop's own words.\n"
                "\n"
                "REMEDY: only downgrade a database still holding the trivial"
                " backfill. If you genuinely mean to discard the shop's tier"
                " configuration, move every grade back into A-D and remove the"
                " non-trivial tiers deliberately first.\n"
            )

    # Reverse order of upgrade(). Drop the composite FKs, restore the three letter
    # CHECKs exactly as 0001/0003/0010 had them (product_prices' was inline and
    # auto-named product_prices_grade_check), then drop the table. The policy,
    # grants, comments and both unique indexes die with the table.
    op.execute(
        "ALTER TABLE tenants DROP CONSTRAINT IF EXISTS fk_tenants_default_grade_tier"
    )
    op.execute("ALTER TABLE sellers DROP CONSTRAINT IF EXISTS fk_sellers_grade_tier")
    op.execute(
        "ALTER TABLE product_prices DROP CONSTRAINT IF EXISTS fk_prices_grade_tier"
    )
    op.execute(
        "ALTER TABLE product_prices ADD CONSTRAINT product_prices_grade_check"
        " CHECK (grade IN ('A', 'B', 'C', 'D'))"
    )
    op.execute(
        "ALTER TABLE sellers ADD CONSTRAINT ck_sellers_grade"
        " CHECK (grade IN ('A', 'B', 'C', 'D'))"
    )
    op.execute(
        "ALTER TABLE tenants ADD CONSTRAINT ck_tenants_default_grade"
        " CHECK (default_grade IN ('A', 'B', 'C', 'D'))"
    )
    op.execute("DROP TABLE IF EXISTS grade_tiers")
