# Privilege changes live in the migration, not in a live one-off

**Context.** During Phase 1a a blanket `GRANT ... ON ALL TABLES` accidentally
also granted the app role access to Alembic's `alembic_version` table; it had
to be taken back with a `REVOKE`.

**Rule.** Any GRANT/REVOKE or permission change must be written INTO the
migration, so every database — including a brand-new customer's — reaches the
same privilege state by replaying migrations. Never fix privileges by running a
statement against one live database once.

**Why (the failure it prevents).** A REVOKE (or GRANT) applied only to the
current dev DB is invisible to `alembic upgrade`. The next fresh database
provisioned for a new customer silently skips it and reopens the exact hole you
thought you closed — with no diff to notice, because the migration files never
changed.

**Where proven.** Phase 1a migration `0001_initial_schema.py` (the
`REVOKE ALL ON alembic_version FROM recycle_app` lives in the migration; the DB
was rebuilt from scratch with `docker compose down -v` + `alembic upgrade head`
to prove the revoke is produced by replay, not by a live patch).
