# PRAGMA busy_timeout must be the FIRST statement on a SQLite connection

**Context.** Opening a SQLite connection normally means running a few setup
pragmas — `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout`. The order
looks like a matter of taste. It is not.

**Rule.** `PRAGMA busy_timeout` goes first, before every other statement,
including `journal_mode`. Only then does the connection have permission to wait
for a lock.

**Why (the failure it prevents).** A connection's default busy timeout is 0: it
does not wait at all, it fails immediately with SQLITE_BUSY. Every statement
after opening can need a lock — and the `journal_mode = WAL` switch itself needs
one, because it may have to recover the WAL left by another connection. With
`busy_timeout` set *after* it, that switch runs with zero patience and throws
"database is locked" (errcode 261, SQLITE_BUSY_RECOVERY) whenever another
connection is active. It is intermittent, which is worse: on a device it looks
like a random unexplained crash on app start, most likely when a previous run
did not shut down cleanly — exactly when the user's unsynced bills are at stake.

**Where proven.** Phase 2b, empirically: with `journal_mode` before
`busy_timeout`, a 4-thread claim probe threw "database is locked" on 2 of 3
runs; with the order corrected, 5 of 5 runs passed and no run has failed since.
The shipped order lives in `mobile/src/adapters/sqlite/schema.ts`
(`CONNECTION_PRAGMAS`).
