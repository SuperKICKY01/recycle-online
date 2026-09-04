# A trigger that REFUSES a write without new context conscripts every writer of that table

**Applies** the moment you add a trigger (or a NOT NULL column, a CHECK, an RLS
policy) that DEMANDS something a write did not have to carry before — here migration
0017's `audit_capture` refuses any write to an audited table when `app.actor_id` is
unset. The rule you are really writing is not "the app now records an actor"; it is
"**every** writer of this table, forever, must now supply the actor, or its write is
refused." The set of writers is far larger than the handlers, and most of it is
invisible from `app/`.

**Rule.** Before adding a fail-closed obligation to a table, ENUMERATE every path
that writes it and make each one declare the new context — do not stop at the
request handlers. The paths this phase had to fix, none of them a handler:

- **Provisioning and seeding** (`provision_shop.py`, `seed_dev.py`) write master
  data directly through `tenant_connection`. They have no human principal, so they
  declare a reserved SYSTEM actor (`db.SYSTEM_ACTOR_ID`). Fail-closed "cannot be
  absolute" precisely because of these; the answer is *declare*, not *exempt*.
- **~16 proof scripts** do direct `asyncpg`/SQLAlchemy setup/teardown writes to
  audited tables (a `_in_tenant` helper, a session-level `set_config`, a
  `tenant_connection` in a `provision()`). Each measured RED with
  `RaiseError: audit_capture: no actor in context` until it declared a system
  actor. The fail-closed trigger is working; the proof is a writer like any other.
- **A restore** is SAFE ONLY BY ORDER, not by intent: a plain `pg_dump` emits
  `CREATE TRIGGER` in the POST-DATA section, after the `COPY`, so on restore the
  rows load before the trigger exists and no audit row is manufactured. Verify this
  (`prove_backup_restore` ran green with the triggers present); a DATA-ONLY restore,
  or one under `session_replication_role=replica`, would fire or skip differently.
- **A SERVER FROM AN OLDER COMMIT** — a git-worktree server a disproof stands up at
  a pre-feature commit (`prove_seller_code_guards`) — runs code that predates the
  actor mechanism and CANNOT set `app.actor_id`. On a scratch copied from a now-0017
  live database its seller INSERT returned 500. It cannot be edited (it is history),
  so the SCRATCH declares the actor for it, DATABASE-SCOPED
  (`ALTER DATABASE <scratch> SET app.actor_id = …`), never role-scoped — roles are
  cluster-wide and an `ALTER ROLE` would reach the LIVE database
  (`a-grant-boundary-belongs-to-a-database-not-a-role.md`); and it needs a superuser,
  because `ALTER DATABASE SET` of a custom placeholder GUC refuses `recycle_owner`.

**Why (the failure it prevents).** The blast radius is the whole set of writers, and
it fails in BOTH directions: loudly (a 500 / `RaiseError`) for a live path, and
LATENTLY for a path whose input changes vintage — a proof that restores a scratch was
GREEN while the backup was pre-0017 and RED the day a post-0017 backup made the scratch
carry the trigger. A fixture is an input, and the schema version of a restored copy is
an input nobody re-reads. So "I updated the handlers and the proofs pass" is not the
finish line; the finish line is "every writer, including the ones outside `app/` and
the ones that time-travel, declares the context — measured by running each on a copy
AT THE NEW VERSION."

**Two corollaries measured the same day, each nearly its own lesson:**

- **An append-only forensic log OUTLIVES the rows it names, so its per-tenant
  completeness is not a tenant-isolation invariant.** The first draft put `audit_log`
  in `reconcile.py`'s X2 completeness sum, claiming "every audit row carries a real,
  swept tenant." X2 disproved it on the first restored copy: `seen=188 present=220`,
  32 rows for tenants a proof had CREATED AND DELETED, whose audit rows (append-only,
  no cascade) survived them. A row whose tenant names no CURRENT shop is EXPECTED for
  such a log — the `failed_login_attempts` boundary, but reached NOW rather than at a
  future internet move. It stays in `ALL_RLS_TABLES` (S1/S2/S3/B1 + the new S6
  trigger-existence check) and is EXCLUDED from X2. Ask of any table you add to a
  completeness check: can a row here outlive the tenant it names?

- **`to_jsonb` preserves NUMERIC money exactly, but `json.loads` in Python floats
  it.** The trigger stores the whole row as `jsonb`; money survives byte-identical
  (`12.30`, `100.00`, `0.10` measured). But `json.loads(row)["price"]` returns
  `7.55` the FLOAT, which `== '7.55'` is False — the reformatting hard rule 1 forbids,
  reintroduced in the READER. Read money out of jsonb with SQL `->>` (the numeric's
  exact text), never by parsing the object in Python.

## AMENDED (migration 0019, 2026-09-04): a MIGRATION that writes an already-audited table is a writer too — and it is conscripted TWICE

The list above has provisioning, proofs, a restore and an old-commit server. It
does not have the plainest writer of all: **the next migration.** 0019 fills
`users.role_id` with one `UPDATE users … FROM roles`, and `users` has carried the
audit trigger since 0017. Two refusals, both measured on the first scratch runs,
each rolling the whole migration back to 0018 (which is the atomicity the migration
claims, observed for free):

1. `audit_capture: no actor in context (app.actor_id unset) for UPDATE on users` —
   the trigger's own refusal. The migration must DECLARE the system actor for its
   transaction, exactly as `provision_shop.py` does:
   `SELECT set_config('app.actor_id', '00000000-…', true)` and a username naming the
   revision (`system:migration_0019`), so every re-keyed user is recorded under it.
2. `new row violates row-level security policy for table "audit_log"` — the audit
   ROW, not the trigger. The trigger writes `tenant_id = app.tenant_id` into a
   FORCE-RLS table whose `tenant_id` is NOT NULL and whose WITH CHECK compares it,
   and a migration sets NO tenant context; one cross-tenant statement can never
   satisfy it. So a migration that writes an audited table must run that write
   **PER TENANT under `SET LOCAL app.tenant_id`**, the shape every request and every
   provisioner already uses, and reset the GUC afterwards.

**The rule the amendment adds.** "Enumerate every path that writes it" includes the
migrations NOT YET WRITTEN. A table that is audited (or FORCE-RLS with a tenant
WITH CHECK, or NOT NULL on a context column) has a write contract that a later
migration's backfill must meet: declare the actor, iterate tenants, restore FORCE.
0018 did not meet it and did not need to — it wrote `branches` before attaching the
trigger and touched `users` only by `ADD COLUMN` (DDL fires no row trigger). The
difference between 0018 and 0019 is one `UPDATE`, and it is the difference between
a green first run and two refused ones.

**Where proven (this amendment).** `0019_permissions.py` upgrade() and downgrade()
(the actor block and the per-tenant loop, each commented with the refusal it
answers); the two scratch runs of 2026-09-04 whose tracebacks are quoted above,
the schema at 0018 read back intact after each (the atomicity cell of the
permission-model record in `PROJECT_STATUS.md § Current phase`).

**Where proven.** Migration `0017_audit_log.py`; the mechanism measured on dev
`recycle` 2026-09-02 (a `SECURITY DEFINER` owner trigger writes into a FORCE-RLS
`audit_log` under the app role's context, while the app role holds no INSERT).
`prove_audit.py` (disproof `Da`: no actor → refused; `Dc`: SECURITY INVOKER → the
app-role write fails, so DEFINER is load-bearing; `Db`: dropped trigger → no record).
`reconcile.py` S6 + the X2 exclusion; `prove_reconcile.py`'s S6 injection.
Sibling of `a-migration-reads-zero-under-force-rls.md` (the READ side of FORCE RLS;
this is the WRITE side) and of `config-defaults-must-fail-closed.md` (a default actor
would be a default IDENTITY, which is why the reserved system actor is EXPLICIT and
per-writer, never a silent fallback).
