# A scratch proof must not import the app before it rebinds the database URL

**Context.** `prove_login_guard.py` restores a SCRATCH, rebinds `APP_DATABASE_URL`
onto it, starts a child uvicorn there, and then provisions its fixtures IN-PROCESS
through `app.db.tenant_connection`. The first draft imported a constant at the top
of the file — `from app.login_guard import FAILURE_THRESHOLD` — for tidiness. That
one import pulled in `app.db`, and `app.db` builds its engine at MODULE LOAD:
`engine = create_async_engine(APP_DATABASE_URL, ...)`. The import ran BEFORE the
rebind, so the in-process engine bound to the LIVE database while the child uvicorn
(a separate process, handed the rebound env) bound to the scratch. `provision()`
then wrote its throwaway tenants and users into LIVE, and every login the proof
made went to the scratch, which held none of them.

**The symptom pointed at the wrong thing.** The only red was `E1: the throwaway
admin can sign in` — a login failure. Read naively that accuses `/auth/login`, the
very code under test, when the login was correct and the FIXTURE was in another
database. Provisioning had even printed `provisioned MAIN=… OTHER=…` and raised
nothing, because writing to LIVE succeeds.

**Rule.** A proof that rebinds `APP_DATABASE_URL` (or `DIRECTORY_DATABASE_URL`)
onto a scratch must not import ANY `app.*` module until AFTER the rebind — because
`app.db` binds its engine at import, and every `app` module reaches `app.db`
eventually. Do the rebind first, then import lazily: inside `main()` after the
`os.environ[...] =` lines, or inside the helper that needs it (`prove_grade_tiers.py`
imports `from app.db import tenant_connection` INSIDE `provision()` for exactly this
reason, though it never says so). A top-of-file `from app.… import …` — even for a
plain constant — is the trap, because the cost is not the name you wanted but the
engine that comes with it.

**Why (the failure it prevents).** A proof that writes its fixtures into the LIVE
database while testing a scratch — or the reverse. It is silent in the dangerous
direction: the writes succeed, nothing raises, and the failure surfaces one step
later as a login/read that finds nothing, which reads as a bug in the code under
test rather than in the harness. On a proof that MUTATES money this would be worse
than a red: it would be a real write to the live database dressed as a test.

**How to catch it fast.** When a self-provisioned scratch proof reports that a
freshly created fixture is missing, suspect the DATABASE before the route: check
that no `app.*` import precedes the rebind, and confirm the process that WROTE the
fixture and the process that READS it point at the same database. Naming the
observable — which database each side used — separates "the code is wrong" from
"the two halves are in different databases".

**Where proven.** `prove_login_guard.py`, 2026-09-01: with the top-level
`from app.login_guard import FAILURE_THRESHOLD` the run reddened only `E1` while
`provision()` wrote to `recycle`; moving the import into `main()` after the
`os.environ` rebind turned the run green (32 cells), and re-running showed the
fixtures now in the scratch.

Sibling of [[a-proof-must-establish-what-it-is-talking-to]] — there the proof
reached a DIFFERENT SERVER than the one under test; here it reached a different
DATABASE than the one under test, and the same discipline applies: name what each
side is talking to before trusting any answer. Also of [[proof-must-run-twice]]
(the harness, not the code, decides a green) and [[config-defaults-must-fail-closed]]
(a value bound at import, before anything can correct it).
