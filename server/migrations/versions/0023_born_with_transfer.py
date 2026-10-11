r"""Born with cash AND transfer, an active transfer row for every branch that held none,
and two table comments corrected to what the schema now holds.

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-11

WHAT THIS IS
------------
Two ADVISOR-DECIDED items (OPEN_ITEMS.md, C1 of 2026-09-30, under the owner's
2026-09-26 delegation), and the comment debt the first of them was waiting for:

  born with transfer     branches_born_with_cash() is REPLACED so a new branch is born
                         with TWO active method rows, cash AND transfer. The owner's
                         reason, verbatim in OPEN_ITEMS.md C1: most sellers are paid by
                         scanning a QR, so a counter that offers only cash on day one
                         makes a shop hunt for a switch before it can pay the usual way
                         (R7 hides every inactive method, so the counter showed only
                         cash). The trigger and function keep their 0022 NAMES: 0022's
                         read-back, prove_drawer's RT2 and its born_trigger break key on
                         them, and renaming would move every one of those for no change
                         in behaviour. The function's own COMMENT says what it now does.
  every existing branch  with NO transfer row at all gains one, ACTIVE. A branch that
                         already holds a transfer row -- active or INACTIVE -- is NOT
                         touched: an inactive row is a shop's recorded choice, written
                         through the audited route, and a migration never overturns a
                         choice a shop made (ADVISOR-DECIDED 2026-10-11, correcting the
                         2026-09-30 wording "without an ACTIVE transfer row"). MEASURED on
                         dev before writing this (2026-10-11, head 0022): 4 tenants, 4
                         branches; Shop A held transfer INACTIVE (it stays inactive), the
                         other three held cash only (each gains an active transfer row).
  COMMENT ON TABLE shifts said "NOT audited" since 0021, and shifts IS audited: 0021
                         itself attached audit_capture to it (the owner's 2026-09-18
                         split, 0021's docstring). It also said no route writes it, false
                         since 0022's shift routes. Corrected, and the upgrade REFUSES
                         unless the audit trigger is really on shifts, so the corrected
                         sentence is a measured one.
  COMMENT ON TABLE branch_payment_methods said every branch is born with ONE cash row,
                         given by provision_shop.py -- false since 0022's trigger and
                         false again now. Corrected to the 0023 state.

THE PRE-STATE OF EACH COMMENT IS CHECKED, NOT ASSUMED
-----------------------------------------------------
The upgrade REFUSES unless both comments read back as EXACTLY 0021's text (restated here
as _SHIFTS_COMMENT_0021 / _BPM_COMMENT_0021; the equality check is what makes the
restatement safe): a comment it did not expect is one it did not write, and 0022's rule
is that a record which destroys another record is not a record. That check is also what
lets the downgrade put back "the previous comments" truthfully: the texts it restores are
the texts the upgrade read.

WHY FORCE IS LIFTED, AND WHERE THE ACTOR IS DECLARED
----------------------------------------------------
Migrations run as recycle_owner (NOBYPASSRLS); tenants, branches and
branch_payment_methods are FORCE ROW LEVEL SECURITY, so with no app.tenant_id the owner
reads ZERO rows (lessons/a-migration-reads-zero-under-force-rls.md). FORCE is lifted on
those three for the cross-tenant reads and restored afterwards. branch_payment_methods
is AUDITED, so every write to it runs PER TENANT under SET LOCAL app.tenant_id with the
reserved system actor declared as system:migration_0023 (the 0020/0022 shape).

THE MIGRATION MEASURES ITSELF
-----------------------------
Read-backs inside the one transaction (env.py), each a RuntimeError that rolls the whole
upgrade back to 0022: no branch holding no cash row and none holding no transfer row
(ANY row, never "an active row" -- a method a shop switched off is its choice, not a
hole); the branch_payment_methods row count rose by EXACTLY the number of branches that
held no transfer row before (so no other row was written); the born-with trigger still
attached; both comments read back as written.

WHAT THE DOWNGRADE DOES, AND WHY THE ROWS STAY
----------------------------------------------
It restores 0022's function body (born with cash only), clears the function comment, and
puts back both 0021 comment texts. It NEVER REFUSES, and that is deliberate (ADVISOR-
DECIDED 2026-10-11): a downgrade refuses to protect a shop's DATA, a catalogue comment is
not data, and nothing it does touches a row. It does NOT
remove or deactivate the transfer rows, and the reason is recorded so the omission is
not read as an oversight: from the moment they exist they are what each shop's counter
offers, a cashier may have paid by transfer against them, and branch_payment_methods
is master data a shop edits -- nothing in this migration can tell a row it wrote from a
row a shop has since chosen to keep. They are rows 0022 knows how to hold (0022's own
precedent: "the born-with trigger's rows stay"). Below 0022, 0021's downgrade refuses on
any method row beyond the pristine cash row, as it always has.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0023"
down_revision: Union[str, None] = "0022"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000"
_ACTOR_NAME = "system:migration_0023"
_BORN_METHODS = ("cash", "transfer")

# ASCII ONLY, no apostrophes, NO BRACES: embedded in SQL literals through f-strings and
# read back out of the catalogue on a codepage-874 box (0015..0022 convention).
# The 0021 texts, restated so the downgrade can put them back; the upgrade REFUSES
# unless the catalogue holds exactly these, so the restatement cannot drift silently.
_SHIFTS_COMMENT_0021 = (
    "A cash-drawer session (STRUCTURE.md 2.4, 3.5), migration 0021. Opened with a "
    "float and a cashier; closed with the counted cash, the server-frozen expected "
    "cash (hard rule 6), and the variance -- the close columns are ALL NULL (open) or "
    "ALL PRESENT (closed), ck_shifts_close_consistency. AT MOST ONE OPEN shift per "
    "branch, enforced in the schema by the partial unique index "
    "uq_shifts_one_open_per_branch. NOT audited: a transactional table carrying its "
    "author on the row (opened_by, closed_by). No route writes it in 0021; the close "
    "route and the day-close materialiser are commit 2."
)
_BPM_COMMENT_0021 = (
    "Which payment methods a branch accepts (STRUCTURE.md 1.6), migration 0021: a "
    "DERIVED switch, the control shown when the set holds more than the one cash row "
    "every branch is born with. method is CHECKed against the SAME fixed set as "
    "payments.method (the upgrade refuses if they differ). A method is DEACTIVATED, "
    "never deleted (no DELETE grant). Audited: master data a shop edits. A branch "
    "created after 0021 gets its cash row from provision_shop.py (server code, commit "
    "2); a branch with no method row refuses every payment once a route reads this."
)

_SHIFTS_COMMENT = (
    "A cash-drawer session (STRUCTURE.md 2.4, 3.5), migration 0021. Opened with a "
    "float and a cashier; closed with the counted cash, the server-frozen expected "
    "cash (hard rule 6), and the variance -- the close columns are ALL NULL (open) or "
    "ALL PRESENT (closed), ck_shifts_close_consistency. AT MOST ONE OPEN shift per "
    "branch, enforced in the schema by the partial unique index "
    "uq_shifts_one_open_per_branch. AUDITED (the 0017 audit_capture trigger, attached "
    "by 0021 itself -- the owner decision of 2026-09-18): the one drawer table updated "
    "in place on money columns, and every writer carries a principal. Written by the "
    "shift routes since 0022 (app/shifts.py); a closed row is frozen by the "
    "shifts_freeze_closed trigger (0022). Comment corrected by migration 0023."
)
_BPM_COMMENT = (
    "Which payment methods a branch accepts (STRUCTURE.md 1.6), migration 0021. Every "
    "branch is born with TWO active rows, cash and transfer (migration 0023; cash alone "
    "from 0021 to 0023), written by the branches_born_with_cash trigger on any path that "
    "inserts a branch. method is CHECKed against the SAME fixed set as payments.method "
    "(0021 refuses if they differ). A method is DEACTIVATED, never deleted (no DELETE "
    "grant). Audited: master data a shop edits. Comment corrected by migration 0023."
)
_FUNCTION_COMMENT = (
    "AFTER INSERT on branches: the new branch is born with an active cash row and an "
    "active transfer row in branch_payment_methods (migration 0023; cash only under "
    "0022). The name predates the transfer row and is kept: tests and read-backs key on it."
)

_FN_0022 = """
        CREATE OR REPLACE FUNCTION branches_born_with_cash() RETURNS trigger
            LANGUAGE plpgsql
            SET search_path = pg_catalog
        AS $fn$
        BEGIN
            INSERT INTO public.branch_payment_methods (tenant_id, branch_id, method, is_active)
            VALUES (NEW.tenant_id, NEW.id, 'cash', true);
            RETURN NULL;
        END
        $fn$
        """

_FN_0023 = """
        CREATE OR REPLACE FUNCTION branches_born_with_cash() RETURNS trigger
            LANGUAGE plpgsql
            SET search_path = pg_catalog
        AS $fn$
        BEGIN
            INSERT INTO public.branch_payment_methods (tenant_id, branch_id, method, is_active)
            VALUES (NEW.tenant_id, NEW.id, 'cash', true),
                   (NEW.tenant_id, NEW.id, 'transfer', true);
            RETURN NULL;
        END
        $fn$
        """

_LIFTED = ("tenants", "branches", "branch_payment_methods")


def _comment(bind, table: str) -> str | None:
    return bind.exec_driver_sql(
        f"SELECT obj_description('public.{table}'::regclass, 'pg_class')"
    ).scalar()


def _missing(bind, method: str) -> int:
    """Branches holding NO row for `method`, active or not. Never 'no ACTIVE row': a shop
    may have switched a method off, and that is its choice, not a hole."""
    return bind.exec_driver_sql(
        "SELECT count(*) FROM branches b WHERE NOT EXISTS (SELECT 1 FROM"
        " branch_payment_methods m WHERE m.tenant_id = b.tenant_id AND m.branch_id = b.id"
        f" AND m.method = '{method}')"
    ).scalar()


def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------ measure BEFORE any write (preflight)
    found = {"shifts": _comment(bind, "shifts"),
             "branch_payment_methods": _comment(bind, "branch_payment_methods")}
    expected = {"shifts": _SHIFTS_COMMENT_0021, "branch_payment_methods": _BPM_COMMENT_0021}
    unexpected = [t for t in expected if found[t] != expected[t]]
    if unexpected:
        raise RuntimeError(
            f"REFUSING 0023: the COMMENT on {unexpected} is not the text 0021 wrote, and"
            " 0023 will not overwrite a comment it did not expect. Found: "
            + "; ".join(f"{t}={(found[t] or '')[:160]!r}" for t in unexpected)
            + ". Nothing is committed."
        )
    fn_comment = bind.exec_driver_sql(
        "SELECT obj_description('public.branches_born_with_cash'::regproc, 'pg_proc')"
    ).scalar()
    if fn_comment is not None:
        raise RuntimeError(
            "REFUSING 0023: branches_born_with_cash() already carries a COMMENT, and the"
            " downgrade restores it to NONE (0022 wrote none). Found:"
            f" {fn_comment[:160]!r}. Nothing is committed."
        )
    audited = bind.exec_driver_sql(
        "SELECT count(*) FROM pg_trigger WHERE tgname = 'audit_capture'"
        " AND tgrelid = 'public.shifts'::regclass AND NOT tgisinternal"
    ).scalar()
    if audited != 1:
        raise RuntimeError(
            f"REFUSING 0023: the corrected shifts comment says AUDITED, and pg_trigger"
            f" shows {audited} audit_capture trigger(s) on shifts. Nothing is committed."
        )

    # ------------------------------------------------ the existing branches, per tenant
    for t in _LIFTED:
        op.execute(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")
    op.execute(f"SELECT set_config('app.actor_id', '{_SYSTEM_ACTOR}', true)")
    op.execute(f"SELECT set_config('app.actor_username', '{_ACTOR_NAME}', true)")
    tenant_ids = [str(r[0]) for r in bind.exec_driver_sql("SELECT id FROM tenants").fetchall()]
    rows_before = bind.exec_driver_sql("SELECT count(*) FROM branch_payment_methods").scalar()
    lacking = _missing(bind, "transfer")
    for tid in tenant_ids:
        op.execute(f"SELECT set_config('app.tenant_id', '{tid}', true)")
        op.execute(
            f"""
            INSERT INTO branch_payment_methods (tenant_id, branch_id, method, is_active)
            SELECT b.tenant_id, b.id, 'transfer', true
              FROM branches b
             WHERE b.tenant_id = '{tid}'
               AND NOT EXISTS (SELECT 1 FROM branch_payment_methods m
                                WHERE m.tenant_id = b.tenant_id AND m.branch_id = b.id
                                  AND m.method = 'transfer')
            """
        )
    op.execute("SELECT set_config('app.tenant_id', '', true)")

    short = {m: _missing(bind, m) for m in _BORN_METHODS}
    rows_after = bind.exec_driver_sql("SELECT count(*) FROM branch_payment_methods").scalar()
    if any(short.values()) or rows_after - rows_before != lacking:
        raise RuntimeError(
            f"REFUSING 0023: after the backfill, branches holding no row per born-with method:"
            f" {short}; method rows {rows_before} -> {rows_after}, expected a rise of exactly"
            f" {lacking} (the branches that held no transfer row). Nothing is committed."
        )
    for t in _LIFTED:
        op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")

    # --------------------------------------------------- born with cash AND transfer
    op.execute(_FN_0023)
    op.execute(f"COMMENT ON FUNCTION branches_born_with_cash() IS '{_FUNCTION_COMMENT}'")

    # ------------------------------------------------------------- the two comments
    op.execute(f"COMMENT ON TABLE shifts IS '{_SHIFTS_COMMENT}'")
    op.execute(f"COMMENT ON TABLE branch_payment_methods IS '{_BPM_COMMENT}'")

    # ------------------------------------------------------------------ read-backs
    trig = bind.exec_driver_sql(
        "SELECT count(*) FROM pg_trigger WHERE tgname = 'branches_born_with_cash'"
        " AND tgrelid = 'public.branches'::regclass AND NOT tgisinternal"
    ).scalar()
    if trig != 1:
        raise RuntimeError("REFUSING 0023: the born-with trigger is not attached to branches."
                           " Nothing is committed.")
    if _comment(bind, "shifts") != _SHIFTS_COMMENT or \
            _comment(bind, "branch_payment_methods") != _BPM_COMMENT:
        raise RuntimeError("REFUSING 0023: a corrected comment did not read back as written."
                           " Nothing is committed.")


def downgrade() -> None:
    # No refusal: nothing below touches a row (see the docstring).
    op.execute(_FN_0022)
    op.execute("COMMENT ON FUNCTION branches_born_with_cash() IS NULL")
    op.execute(f"COMMENT ON TABLE shifts IS '{_SHIFTS_COMMENT_0021}'")
    op.execute(f"COMMENT ON TABLE branch_payment_methods IS '{_BPM_COMMENT_0021}'")
