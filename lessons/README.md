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
- sqlite-money-is-text.md — applies to any money/weight stored in SQLite: NUMERIC affinity silently converts decimal strings to floats and STRICT does not protect TEXT columns; the guarantee is the TypeScript type, not the DB.
- sqlite-busy-timeout-first.md — applies to every SQLite connection: PRAGMA busy_timeout must precede all other statements, including journal_mode, or setup itself throws "database is locked" intermittently.
- concurrency-tests-need-a-barrier.md — applies to any test asserting behaviour under concurrency: without a start barrier and printed overlap evidence, the workers ran sequentially and a green result proves nothing.
- metro-file-map-nesting.md — applies when a bundler/resolver claims a file is missing that exists on disk: ask its index, not the OS. Never nest npm packages; keep a run ledger, because one green run pinned the wrong cause.
- proof-must-run-twice.md — applies to every proof script: it must pass twice in a row against a live DB with no truncate between. Hardcoded idempotency keys and absolute doc_no assertions proved the environment, not the code.
- decimal-precision-for-domain-scale.md — applies wherever a decimal library does money math: its precision is per-operation and finite. NUMERIC(14,3) x NUMERIC(14,2) needs 28 significant digits; decimal.js defaults to 20 and silently zeroes the rest.
- wait-for-the-event-not-the-ticks.md — applies to any test that waits before observing: a fixed tick count bakes in the scheduler's shape and silently moves what moment you measure. Wait for the event, bounded, and print the cost.
- console-is-not-the-observation.md — applies before ever concluding "the data is corrupt": this box is codepage 874, so UTF-8 through a console or an unpinned pipe reads as mojibake. Verify with hex/codepoints at the source; the destructive fix is the phantom one.
- doc-no-is-arrival-order-not-event-time.md — applies to doc_no and to every report: doc_no is arrival order, so the send queue needs strict head-of-line ordering (a sort cannot order a row the backoff filter hides). Device clocks measured ~3s wrong, so aggregate on server_received_at, never device_created_at.
- queue-jam-must-be-visible.md — applies to any strict in-order queue with no-give-up retry: a deterministically failing item (5xx = unavailable, not rejected) retries forever and dams everything behind it silently. Don't skip the head (that breaks ordering silently); make the jam visible, and tell an offline backlog (stay amber) from a poisoned head (go red) by whether the SERVER ANSWERED — not by elapsed time, which cannot separate a long outage from a poison pill.
- diagnosis-must-precede-the-fix.md — applies the moment a failure gets a cause: read the REAL traceback and the REAL files (does migration 0005 even exist?) before naming it, and run the disproof first. An explanation that fits a fear you already hold is the easiest to believe and least checked. The inverse of the "passing result is not evidence" family — a failing result pinned on the wrong cause.
