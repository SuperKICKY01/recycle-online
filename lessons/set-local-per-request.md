# Tenant context = SET LOCAL, per request, fail closed

**Context.** Multi-tenant isolation is enforced by Postgres RLS keyed on the
GUC `app.tenant_id`. Something has to set that GUC for each unit of work.

**Rule.** Set it with `SET LOCAL app.tenant_id = <tenant>` (i.e.
`set_config('app.tenant_id', tid, true)`) INSIDE the transaction that does the
work. Never a session-level `SET`. If a request has no valid tenant, run with
NO context set — the RLS policy reads
`NULLIF(current_setting('app.tenant_id', true), '')::uuid`, so unset matches
nothing and the request sees zero rows. There is no "unset means all tenants"
path, ever.

**Why (the failure it prevents).** A session-level SET survives on the pooled
connection after the request ends; the next request — possibly another tenant —
inherits the stale context and reads/writes the wrong tenant's data. In a
real-money system that is a cross-tenant breach. A "default to all if unset"
fallback is the same breach by omission.

**Where proven.** Phase 1a `server/scripts/prove_rls.py` (step 6 first FAILED
with a session-level SET leaking across the pool, then passed once switched to
SET LOCAL). Phase 1b `server/app/db.py` `tenant_connection()` and
`server/scripts/prove_auth.py` (whoami reads back `current_setting` per request).
