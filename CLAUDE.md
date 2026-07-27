# Recycle Online

Management system for recycling/scrap-buying businesses. Sold as a
monthly-license SaaS to multiple shops (multi-tenant). This records
REAL MONEY transactions — data integrity beats everything else.

This file is STATIC INFRASTRUCTURE ONLY: architecture, hard rules,
machine traps, workflow, conventions. It must not say where the work
has got to. Current phase, what is built, what is deliberately not
built, and the known device gaps live in `PROJECT_STATUS.md`.

## Architecture (LOCKED — do not propose alternatives)

- `server/`  — FastAPI + PostgreSQL, cloud, single source of truth.
  All business rules live here (doc numbering, dedup, stock).
- `mobile/`  — React Native + Expo. Yard floor: create purchase
  bills, offline-first. Weight is typed by staff (no scale
  integration in MVP).
- `desktop/` — Electron + React + TypeScript. Back office: master
  data, view bills, thermal slip printing (ESC/POS, 58/80mm).

Mobile and desktop are both clients of the same API. Neither talks
to the database directly. Neither implements business rules.

## Hard rules (violating any of these = wrong, redo)

1. Money and weight columns are NUMERIC. Never float, anywhere —
   DB, API, or client math.
2. Every business-data table has `tenant_id`. Every query filters
   by it. Enforce at the lowest layer possible (RLS / repository),
   not by remembering in each handler.
3. Bill IDs are client-generated UUIDs. Human-readable `doc_no` is
   assigned by the server at sync time — offline bills have no
   doc_no yet, and the UI must show that state explicitly.
4. Every bill create carries an `idempotency_key`. Server must
   treat a repeated key as "already created", not as a new bill.
5. No hard deletes on transactions. Wrong bill = void
   (`voided_at/by/reason`) and reissue. History stays intact.
6. Store gross_weight, tare_weight, net_weight — all three. Store
   unit_price AND list_price. Store computed `amount` on the row;
   never recompute historical bills from current prices.
7. Timestamps: keep both `device_created_at` and
   `server_received_at`. Device clocks are untrusted.
8. Offline-first on mobile: write locally first, always. Sync
   state per record: pending / synced / failed. Failure must be
   visible, never silent.

## Scope and status

Both live in `PROJECT_STATUS.md` — read it at the start of every
session, before deciding anything is in or out of scope, and update
it at every phase boundary. Do not restate any of it here: two
copies drift, and a new session believes whichever it reads first.

## Machine footguns (this Windows box)

Traps specific to this machine. Each one has already produced a
WRONG DIAGNOSIS here. Symptom / why it lies / what to do instead.

- **Correct Thai reads as mojibake (`เธญเธฅเธน`) or as `?????`.**
  The machine's ANSI/OEM codepage is 874 (registry `ACP=874`,
  `OEMCP=874`), so anything decoding with the locale default
  re-reads UTF-8 as CP874 — Python's
  `locale.getpreferredencoding(False)` returns `cp874` here even
  when the console reports `chcp` 65001. It lies because the output
  looks like hard evidence of corrupt data, and the "fix" —
  rewriting the strings — would CREATE the corruption it thinks it
  found, in seed data every new tenant gets. Instead: verify at the
  source, in bytes. Hex from Postgres
  (`encode(convert_to(col,'UTF8'),'hex')`), codepoints from the
  file, `encoding="utf-8"` pinned on every read. Never judge Thai
  text by eye out of a console or an unpinned pipe.
  → `lessons/console-is-not-the-observation.md`

- **An exit code that is not the command's.** A cygwin/Git-Bash
  `fork` can fail (`fork: Resource temporarily unavailable`); the
  shell then reports a status the program never produced. It lies
  because a passing typecheck reads as a failure and gets "fixed" —
  a wrong cause attached to a real-looking red. Instead: run
  typechecks and proofs BARE, one command per invocation, no
  chaining, and re-run once before believing any failure.

- **A pipe or `&&` hides a non-zero exit.**
  `npm run typecheck:app 2>&1 | tail -3 && echo CLEAN` printed
  CLEAN while `tsc` was failing: a pipeline's status is the LAST
  command's, and `tail` exits 0. It lies in the dangerous
  direction — it manufactures a green. Never let a pipe or a chain
  decide whether a check passed; run it bare and read its own exit
  code (`; "EXIT=$LASTEXITCODE"`).
  → `lessons/correct-classification-can-still-render-as-an-error.md`
    (footnote: the shadowed `reason` this hid)

- **Multi-line text passed as a shell argument is mangled here.**
  Two DIFFERENT failures, and which one you get depends on the
  command:
  - *Quote stripping* — **OBSERVED 2026-07-27.** `python -c` with a
    here-string reached the interpreter with the double quotes
    REMOVED from the source, and died on `SyntaxError: invalid
    syntax` pointing at a line that is valid Python. It lies because
    the error accuses the code.
  - *Pathspec / truncation* — `git commit -m` with a multi-line
    message reports `error: pathspec '...' did not match any file(s)
    known to git`, or the message arrives as its first line only.
    **Not reproduced 2026-07-27** (a here-string survived as ONE
    argument to `git commit --dry-run` here), so treat it as
    host-dependent, not as absent. It lies because it presents as a
    git or repo problem. An indented closing `'@` is separately a
    PowerShell parse error, before the command runs at all.

  The rule is UNCONDITIONAL — not "usually fine here". The mangling
  is real on this box by at least one mechanism, and it DIFFERS BY
  COMMAND, so "it worked last time" only measures the last command
  tried. Never pass multi-line text as an argument: write it to a
  file. `git commit -F <file>`, and a `.py` script file rather than
  `python -c`.

### Boot check — name the observable, don't assume the environment

Before judging any result, name the observation that proves the
environment is real. An assumed environment turns a green run into a
false pass and a red run into a confidently wrong cause.

- **Both TypeScript programs must be run.** `mobile/` holds two
  DISJOINT programs: `npm run typecheck` (tsconfig.node.json —
  engine, adapters, proofs; excludes `src/device`) and
  `npm run typecheck:app` (tsconfig.json — the Expo app; excludes
  `src/proof` and the node driver). The app program has twice
  caught defects the node program cannot see: a shadowed `reason`
  that would have detached the void TextInput from its state, and a
  narrowing lost across a closure. Observable: two commands, each
  run bare, each exiting 0. One green program is not a green tree.
- **Postgres must be up before login is judged.** Observable:
  `docker ps` shows `recycle_pg` `(healthy)` on `5544->5432`. A 500
  from `/auth/login` with the container down has already been
  misdiagnosed once as a schema fault — blamed on a migration that
  did not exist. Check the container and read the real traceback
  before naming any cause.
  → `lessons/diagnosis-must-precede-the-fix.md`
- **The phone can actually reach this box.** `mobile/app.json`
  `extra.apiBaseUrl` is a LAN address. If the box's IP changed, or
  uvicorn is not bound on `0.0.0.0`, the device reports a transport
  error indistinguishable from being offline. Observable: the PHONE
  (not the box) gets a response from `/health` at that exact URL.
- **`JWT_SECRET` is set in `server/.env`.** It has no default by
  design and the API refuses to start without one; a default value
  would be a default IDENTITY.
  → `lessons/config-defaults-must-fail-closed.md`

## Workflow (from the owner — do not violate)

- Work in phases. Stop at each phase boundary for review. Never
  continue past a phase on your own.
- Show a diff before editing any existing file.
- applied ≠ verified: a change is done only when the real path has
  been run (server: actual HTTP request; not "it should work").
- Read actual files before stating numbers or facts. Never guess.
- Fix root causes, not symptoms.
- For any debugging — device, build, or server misbehaviour — follow
  debug-mantra: reproduce reliably before hypothesising, run the
  disproof first, keep a ledger across runs. buddhist-method's
  Kalāma: never assert what the device or server did from memory,
  only from an observed response.
- If something doesn't work, say so plainly. Negative results are
  valuable.
- At the start of every session, read `lessons/README.md` (and any
  lesson file relevant to the task at hand).
- Before finishing a phase, if a real mistake was made and fixed, or
  a non-obvious constraint was discovered, write or update a lesson
  file (one per lesson) and its index line in `lessons/README.md`.
  Lessons are only for things that would cause a real bug if
  forgotten — not general tips.
- Write that lesson UNPROMPTED. Being asked is not the trigger —
  the mistake landing is. A phase is not finished until the lesson
  it produced is written.
- Two homes, one test — which thing would the forgetting break? A
  LESSON is for what would cause a bug in the PRODUCT; a MACHINE
  FOOTGUN is for what would cause a wrong DIAGNOSIS on this box.
  Environment traps go to footguns and do NOT also get a lesson;
  writing both is ceremony, and it dilutes an index whose value is
  that every line in it bites.

## Conventions

- Python: async throughout (FastAPI), type hints required,
  Alembic for migrations.
- TypeScript: strict mode on.
- Commit messages and code comments in English. UI text in Thai.
- Buddhist-era dates (พ.ศ.) in UI and printed slips only; store
  UTC ISO timestamps in the DB.
