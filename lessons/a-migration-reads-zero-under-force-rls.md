# A migration reading tenant data sees zero rows under FORCE RLS

**Context.** P1.24's migration `0015` backfills `grade_tiers` from `product_prices`,
`sellers` and `tenants.default_grade` across every tenant, and its downgrade guard
counts how many tiers a shop declared beyond the pristine A-D backfill before it
will drop the table. Migrations run as `recycle_owner`
(`server/migrations/env.py`: `MIGRATION_DATABASE_URL`), which is `NOBYPASSRLS`, and
those tables are `FORCE ROW LEVEL SECURITY` — so FORCE binds the owner too. A
migration sets no `app.tenant_id`, so the RLS predicate
`tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid` is
`tenant_id = NULL` → unknown → NO ROWS. The owner reads ZERO. The first draft of
the guard read its counts directly and would have judged every database pristine —
dropping `grade_tiers` and silently losing every tier name and deactivation a shop
declared, exiting green.

**Rule.** Any statement that reads tenant data while running AS THE TABLE OWNER — a
migration backfill, a downgrade guard, an in-migration audit — sees ZERO rows under
FORCE RLS unless a tenant context is set, and a migration sets none. **A count of
zero from such a read is not "no rows"; it is "no context",** and the two are
indistinguishable at the call site. To read across ALL tenants inside a migration,
temporarily `ALTER TABLE <t> NO FORCE ROW LEVEL SECURITY` — this exempts ONLY the
owner, so a non-owner role such as `recycle_app` stays fully governed and nothing is
exposed — do the read or the backfill, then `ALTER TABLE <t> FORCE ROW LEVEL
SECURITY`, all inside the one migration transaction. Enable RLS on a NEW table only
AFTER its backfill, so the INSERT is not fighting its own `WITH CHECK`. `reconcile.py`
S3 re-checks FORCE afterwards, so a forgotten restore is caught — but the read that
runs while it is lifted is not, so the lift-and-restore must be exact.

**Why (the failure it prevents).** A silent false-negative that reads exactly like
success. A backfill that reads zero inserts nothing — and its own read-back, run the
same way, also reads zero, so the two "agree" and the migration looks done. A guard
that reads zero lets a destructive downgrade through. Neither raises and neither
reddens: there is no error state for a control to be about, because the query is
valid and its answer (`0`) is a legal value. FORCE RLS is the thing that empties the
instrument while leaving the green.

**Where proven.** Measured on dev `recycle` and scratch `recycle_grade_scratch`
2026-08-31, each read printed in the same command as its exit.
(1) *The mechanism.* As `recycle_owner` with FORCE in place and no context,
`count(*)` over `product_prices`/`sellers`/`tenants` read `0/0/0`; the same reads
with those three tables `NO FORCE` (inside a rolled-back transaction) read
`24/11/4`, and the rollback left `relforcerowsecurity = t` on all three.
(2) *The guard disproof.* On a scratch holding ONE renamed tier (a shop's own word),
the guard's own `count(*) … WHERE NOT (code IN ('A','B','C','D') AND name = code AND
is_active)` read `1` as the superuser and `0` as `recycle_owner` under FORCE — so the
first-draft guard would have proceeded and dropped the table.
(3) *The fix.* With the `NO FORCE` lift added to the guard, the same downgrade against
that scratch REFUSED: exit 1, `REFUSING to downgrade 0015: … 1 tier(s) are a shop's
own …`.

**Sibling of `a-backup-is-a-claim-until-it-is-restored.md`, one layer over.** That
lesson records the same mechanism from the DUMP side: FORCE RLS means a dump by an
RLS-bound role captures ZERO rows, and `--enable-row-security` turns the error into a
green empty backup. Here it is a migration READ rather than a dump, and the remedy is
to lift FORCE for the owner rather than to count rows in the dump file — but the trap
is identical: FORCE RLS silently empties a read, and a zero is read as absence. Also
a sibling of `set-local-per-request.md` (the tenant-context mechanism whose ABSENCE
this is) and of `a-check-that-never-went-red-was-never-observed.md` (a zero from an
instrument that never looked).
