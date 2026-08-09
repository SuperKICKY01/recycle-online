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

**What the rule does NOT cover, and that is a boundary rather than a defect.**
The GUC is set by the application role for ITSELF, so this covers a handler that
forgets a filter COMPLETELY, and it is NOT a defence against anything able to
execute SQL as that role — such a thing can set the GUC to another shop's id and
read that shop's rows, one tenant at a time. MEASURED on the live cluster: one
`recycle_app` connection returned 376 bills for tenant A and 9 for tenant B,
changing only `app.tenant_id`; with no context set it returned 0. Two controls on
that same connection were REFUSED — `SET log_min_messages` and
`SET session_replication_role` both raised `permission denied to set parameter` —
so this is a property of that one parameter and not of the role being able to set
anything it likes. What covers SQL execution is parameterised queries, not RLS.
Write the rule down with its boundary: a guarantee stated without its scope gets
read as covering the case it does not.

**Why (the failure it prevents).** A session-level SET survives on the pooled
connection after the request ends; the next request — possibly another tenant —
inherits the stale context and reads/writes the wrong tenant's data. In a
real-money system that is a cross-tenant breach. A "default to all if unset"
fallback is the same breach by omission.

**Where proven.** Phase 1a `server/scripts/prove_rls.py` (step 6 first FAILED
with a session-level SET leaking across the pool, then passed once switched to
SET LOCAL). Phase 1b `server/app/db.py` `tenant_connection()` and
`server/scripts/prove_auth.py` (whoami reads back `current_setting` per request).
