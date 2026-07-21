# Lessons

Hard-won rules that would cause a real bug if forgotten. One file per lesson.
Read these at the start of a session; add/update one before finishing a phase
whenever a real mistake was made and fixed, or a non-obvious constraint was
found. Not for general tips — only for things that bite.

- set-local-per-request.md — applies whenever code sets tenant/RLS context: use SET LOCAL inside the request transaction, never session SET; unset = no context (fail closed), never all-tenants.
- revoke-in-migration.md — applies to any privilege GRANT/REVOKE or DB permission change: put it in the migration, never run it live once.
- login-resolves-under-tenant.md — applies to auth/login and any per-tenant identity lookup: resolve the user inside tenant context; return one generic error for both unknown-user and bad-password.
- schema-audit.md — applies before committing any migration: read it field-by-field against the agreed schema; green proofs do not prove the schema is right.
- sync-state-needs-startup-recovery.md — applies to any "in progress" state (syncing, claimed, locked): nothing polls it, so a crash strands the record forever unless startup sweeps it back to retryable.
- unavailable-is-not-rejected.md — applies to every sync/retry path: unknown outcome (offline, timeout, lost response) stays pending and retries forever; a server refusal (422) goes terminally failed. Conflating them loses bills or hides them.
