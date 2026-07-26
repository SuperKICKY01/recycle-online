# Diagnose before you fix: read the real error and the real files first

A failing result is evidence that something is wrong. It is NOT evidence of WHAT
is wrong. Naming the cause is a separate act — and it is the one most easily
skipped, because a plausible story is usually already waiting.

## What happened

A login started returning HTTP 500. A ready-made story was at hand: a column,
`first_server_error_at`, had just been added in a mobile migration, and it *felt*
like exactly the kind of thing that leaks into the server schema and breaks an
INSERT. The cause was named straight from that story — "a server migration (0005)
leaked a mobile-local column into Postgres" — and a fix was designed to match: a
new migration to drop the column. Both the human and the assistant carried this.

Two things were true that no one had checked before naming the cause:

1. **There was no migration 0005 and no such column on the server.** The server
   had only migrations `0001`–`0003`; `grep` for the column across `server/`
   returned nothing; the live Postgres schema (`information_schema`,
   `alembic_version`) held no such column on any table, including `users`. The
   file the fix would have edited did not exist — both parties were about to
   "fix" it anyway.
2. **The real cause was mundane:** the database container (`recycle_pg`) was
   simply DOWN when login ran, so the connection failed and surfaced as a 500 —
   on every request, independent of any column.

The story was wrong, and wrong in the most convincing way: it fit a fear already
held (schema leakage — see [[schema-audit]]) and pattern-matched a lesson already
written. An explanation that fits a fear you already hold is the easiest to
believe and the least checked.

## The rule

Before naming a cause:

- **Reproduce it and read the ACTUAL error** — the real traceback, response body,
  or log line, not a remembered or imagined one. "A 500 on login" is a symptom;
  the stack trace is what says whether it was a dropped DB connection, a bad
  query, or a column.
- **Read the ACTUAL files the story implicates.** If the theory is "migration
  0005 did it," `ls` the migrations and open 0005 *before* proposing to edit it.
  A cause that names a file, column, or migration is checkable in seconds — so
  check it. A fix to a file that does not exist is the tell that no one looked.
- **Only then name the cause, and run its disproof first.** The cheapest question
  is "what single observation would prove this wrong?" — here, `ls versions/` and
  one `information_schema` query, either of which ended the theory instantly.

Confidence — the human's or the assistant's — is not a substitute for looking. An
explanation that arrives before the evidence is a hypothesis wearing a
conclusion's clothes.

## Family

This is the INVERSE of the "a passing result is not evidence" lessons
([[proof-must-run-twice]], [[console-is-not-the-observation]],
[[concurrency-tests-need-a-barrier]]). There, a GREEN result was trusted without
checking what it actually measured. Here, a RED result was trusted to mean what
the story said it meant. Both skip the same step — observing the real thing that
produced the result — in opposite directions. A result, pass or fail, only means
something once you have read what actually produced it.
