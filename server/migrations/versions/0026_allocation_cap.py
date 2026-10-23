r"""The allocation cap in the DATABASE: no write may leave a bill's live allocations above its total.

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-23

WHAT THIS IS
------------
ADVISOR-DECIDED 2026-10-23 (H4). Invariant P2 of migration 0020 -- for every bill, the sum of
allocations from LIVE payments is at most its total_amount -- was enforced only by the route:
payments.py create_payment reads the bill FOR NO KEY UPDATE, sums, and refuses past the remainder.
Measured on a scratch (prove_money_faults RB, 2026-10-23): with that lock removed, two concurrent
60.00 payments against a 100.00 bill were BOTH accepted in 4 of 5 rounds, and nothing in the schema
refused it. Money is guarded at the lowest layer (hard rule 2's principle), so the cap moves into
the database, and the route's lock STAYS (it words the refusal with the remaining figure, and it is
the first line).

THE WRITES THAT CAN RAISE A BILL'S LIVE SUM, each with a trigger, all calling ONE check:
  payment_allocations  AFTER INSERT OR UPDATE      a new or changed allocation (the app role holds
                                                   INSERT only; UPDATE is covered for any other role)
  payments             AFTER UPDATE OF voided_at   a voided payment made live again (no route does it)
  purchase_bills       AFTER UPDATE OF total_amount a bill's total lowered (no route does it)
A void LOWERS the live sum and a DELETE is not granted; neither can break the cap.

THE CHECK, AND WHY IT HOLDS UNDER CONCURRENCY -- the locking shape, justified:
  1. lock the bill row FOR NO KEY UPDATE -- the SAME mode the route takes. Two writers allocating to
     one bill therefore serialise on that row; nothing else waits (an INSERT's FK check takes FOR
     KEY SHARE, which this mode does not block: lessons/a-lock-is-proven-by-what-waits-not-by-a-
     race.md, its table). A route that already holds the lock re-takes it for free.
  2. THEN sum the bill's live allocations, in a NEW statement. Under READ COMMITTED every statement
     of a volatile plpgsql function takes a fresh snapshot, so a writer that waited at step 1 sees
     the allocation the first writer committed. The trigger runs AFTER the row is written, so the
     sum includes the caller's own row: the comparison is simply `live > total`.
  3. refuse with SQLSTATE RA001 naming the bill, its total and the live sum.
  Of two concurrent writers the second to reach step 1 waits for the first's COMMIT, then counts
  it: exactly one of two over-cap allocations survives, whichever interleaving.

REPEATABLE READ IS REFUSED (RA002), and that is part of the shape, not decoration: there a
transaction keeps ONE snapshot, so step 2 would not see an allocation committed while step 1
waited, and the cap would pass a second over-cap write. No writer of these tables uses it (the app's
write paths are READ COMMITTED; tenant_connection's isolation_level serves read-only reports), so the
refusal costs nothing today and fails closed for the one that would. SERIALIZABLE is allowed: SSI
aborts the pair that step 2 cannot see.

SECURITY INVOKER with search_path pinned, like 0022's freeze. The reads therefore run under the
writer's RLS: a writer with no tenant context sees no bill, and that is REFUSED (RA001, "bill not
visible") rather than passed -- a cap that cannot read the bill must not wave the write through.

THE MIGRATION MEASURES ITSELF: the function, the three triggers, and NO bill already over its cap
(an existing violation would make the first touch of that bill fail; it is counted and the upgrade
refuses rather than install over it). Downgrade drops the triggers and the functions and reads back
that none remains. It refuses nothing: removing a guard deletes no row and no shop's declaration --
the 0025 precedent refuses only where a drop would destroy evidence.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "0026"
down_revision: Union[str, None] = "0025"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The refusal codes, restated by hand in app/payments.py (a migration is not a library).
_CAP_SQLSTATE = "RA001"
_ISOLATION_SQLSTATE = "RA002"
_TRIGGERS = (
    ("allocation_cap_on_allocation", "payment_allocations"),
    ("allocation_cap_on_unvoid", "payments"),
    ("allocation_cap_on_total", "purchase_bills"),
)
_FUNCTIONS = ("allocation_cap_check(uuid, uuid)", "allocation_cap_on_allocation()",
              "allocation_cap_on_unvoid()", "allocation_cap_on_total()")
_LIFTED = ("purchase_bills", "payments", "payment_allocations")


def upgrade() -> None:
    bind = op.get_bind()

    # ------------------------------------------------ no bill already over its cap
    # FORCE RLS hides every row from the owner (lessons/a-migration-reads-zero-under-force-rls.md):
    # lifted for this one read, restored in the same transaction.
    for t in _LIFTED:
        op.execute(f"ALTER TABLE {t} NO FORCE ROW LEVEL SECURITY")
    try:
        over = bind.exec_driver_sql(
            """
            SELECT count(*) FROM (
              SELECT b.id FROM purchase_bills b
                JOIN payment_allocations a ON a.tenant_id = b.tenant_id AND a.bill_id = b.id
                JOIN payments p ON p.tenant_id = a.tenant_id AND p.id = a.payment_id
               WHERE p.voided_at IS NULL
               GROUP BY b.id, b.total_amount
              HAVING sum(a.amount) > b.total_amount) x
            """
        ).scalar()
    finally:
        for t in _LIFTED:
            op.execute(f"ALTER TABLE {t} FORCE ROW LEVEL SECURITY")
    if over:
        raise RuntimeError(
            f"REFUSING 0026: {over} bill(s) already carry live allocations above their total"
            " (reconcile.py P2 names them). Installing the cap over them would make the next write"
            " to each fail. Nothing is committed."
        )

    # ------------------------------------------------------------------ the check
    op.execute(
        f"""
        CREATE FUNCTION allocation_cap_check(p_tenant uuid, p_bill uuid) RETURNS void
            LANGUAGE plpgsql
            SET search_path = pg_catalog
        AS $fn$
        DECLARE
            v_total numeric(14, 2);
            v_live  numeric;
        BEGIN
            IF current_setting('transaction_isolation') = 'repeatable read' THEN
                RAISE EXCEPTION
                    'allocation_cap_isolation: a write to bill % under REPEATABLE READ cannot see a'
                    ' concurrent allocation; allocate under READ COMMITTED or SERIALIZABLE', p_bill
                  USING ERRCODE = '{_ISOLATION_SQLSTATE}';
            END IF;
            -- 1. the bill row, in the route's own mode: concurrent allocators serialise here.
            SELECT b.total_amount INTO v_total FROM public.purchase_bills b
             WHERE b.tenant_id = p_tenant AND b.id = p_bill
               FOR NO KEY UPDATE;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'allocation_exceeds_bill: bill % is not visible to this writer', p_bill
                  USING ERRCODE = '{_CAP_SQLSTATE}';
            END IF;
            -- 2. a NEW statement, so a fresh snapshot: it sees what a writer we waited for committed.
            SELECT coalesce(sum(a.amount), 0) INTO v_live
              FROM public.payment_allocations a
              JOIN public.payments p ON p.tenant_id = a.tenant_id AND p.id = a.payment_id
             WHERE a.tenant_id = p_tenant AND a.bill_id = p_bill AND p.voided_at IS NULL;
            IF v_live > v_total THEN
                RAISE EXCEPTION 'allocation_exceeds_bill: bill % total % live allocations %',
                    p_bill, v_total, v_live
                  USING ERRCODE = '{_CAP_SQLSTATE}',
                        HINT = 'a bill''s live allocations may not exceed its total (invariant P2)';
            END IF;
        END
        $fn$
        """
    )
    op.execute(
        """
        CREATE FUNCTION allocation_cap_on_allocation() RETURNS trigger
            LANGUAGE plpgsql
            SET search_path = pg_catalog
        AS $fn$
        BEGIN
            PERFORM public.allocation_cap_check(NEW.tenant_id, NEW.bill_id);
            RETURN NULL;
        END
        $fn$
        """
    )
    op.execute(
        """
        CREATE FUNCTION allocation_cap_on_unvoid() RETURNS trigger
            LANGUAGE plpgsql
            SET search_path = pg_catalog
        AS $fn$
        DECLARE
            r record;
        BEGIN
            FOR r IN SELECT a.bill_id FROM public.payment_allocations a
                      WHERE a.tenant_id = NEW.tenant_id AND a.payment_id = NEW.id
                      ORDER BY a.bill_id
            LOOP
                PERFORM public.allocation_cap_check(NEW.tenant_id, r.bill_id);
            END LOOP;
            RETURN NULL;
        END
        $fn$
        """
    )
    op.execute(
        """
        CREATE FUNCTION allocation_cap_on_total() RETURNS trigger
            LANGUAGE plpgsql
            SET search_path = pg_catalog
        AS $fn$
        BEGIN
            PERFORM public.allocation_cap_check(NEW.tenant_id, NEW.id);
            RETURN NULL;
        END
        $fn$
        """
    )
    op.execute(
        "CREATE TRIGGER allocation_cap_on_allocation AFTER INSERT OR UPDATE ON payment_allocations"
        " FOR EACH ROW EXECUTE FUNCTION allocation_cap_on_allocation()"
    )
    op.execute(
        "CREATE TRIGGER allocation_cap_on_unvoid AFTER UPDATE OF voided_at ON payments"
        " FOR EACH ROW WHEN (OLD.voided_at IS NOT NULL AND NEW.voided_at IS NULL)"
        " EXECUTE FUNCTION allocation_cap_on_unvoid()"
    )
    op.execute(
        "CREATE TRIGGER allocation_cap_on_total AFTER UPDATE OF total_amount ON purchase_bills"
        " FOR EACH ROW WHEN (NEW.total_amount < OLD.total_amount)"
        " EXECUTE FUNCTION allocation_cap_on_total()"
    )

    # ------------------------------------------------------------- the read-back
    names = ", ".join(f"'{n}'" for n, _ in _TRIGGERS)
    triggers = bind.exec_driver_sql(
        f"SELECT count(*) FROM pg_trigger WHERE tgname IN ({names}) AND NOT tgisinternal"
    ).scalar()
    funcs = bind.exec_driver_sql(
        "SELECT count(*) FROM pg_proc WHERE proname IN ('allocation_cap_check',"
        " 'allocation_cap_on_allocation', 'allocation_cap_on_unvoid', 'allocation_cap_on_total')"
    ).scalar()
    if triggers != 3 or funcs != 4:
        raise RuntimeError(
            f"REFUSING 0026: triggers={triggers} (want 3), functions={funcs} (want 4). Nothing is committed."
        )


def downgrade() -> None:
    bind = op.get_bind()
    for name, table in _TRIGGERS:
        op.execute(f"DROP TRIGGER IF EXISTS {name} ON {table}")
    for fn in _FUNCTIONS:
        op.execute(f"DROP FUNCTION IF EXISTS {fn}")
    left = bind.exec_driver_sql(
        "SELECT (SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'allocation_cap_%')"
        " + (SELECT count(*) FROM pg_proc WHERE proname LIKE 'allocation_cap_%')"
    ).scalar()
    if left:
        raise RuntimeError(f"REFUSING to finish downgrading 0026: {left} allocation_cap object(s) remain.")
