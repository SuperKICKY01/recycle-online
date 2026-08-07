# Recycle Online

Management system for recycling/scrap-buying businesses. Sold as a
monthly-license SaaS to multiple shops (multi-tenant). This records
REAL MONEY transactions — data integrity beats everything else.

This file is STATIC INFRASTRUCTURE ONLY: architecture, hard rules,
machine traps, workflow, conventions. It must not say where the work
has got to. Current phase, what is built, what is deliberately not
built, and the known device gaps live in `PROJECT_STATUS.md`.

New session: `START_HERE.md` holds the reading order, the role split,
the phase-brief shape, and the done-checklist as observables.

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

`BRIEFING.md` is the handoff for a session that will NOT read the
codebase — what this is, the architecture with its reasons, the
invariants in plain language, and the lessons compressed to their
recurring shapes. Update it when ARCHITECTURE or a HARD RULE changes;
NOT at every phase. It carries no progress claims by design — status
stays in `PROJECT_STATUS.md`, the outstanding queue in
`OPEN_ITEMS.md`, and the ORDER of that queue in `ROADMAP.md`.

Phase numbering: **A-numbers are a closed log** in `PROJECT_STATUS.md`
and no new one is issued. Forward steps are **R-numbers**, defined in
`ROADMAP.md` and nowhere else.

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

- **A non-ASCII character in `.ps1` SOURCE breaks the program before
  it runs, and the 874 entry above does NOT cover this.** That one is
  about DATA — Thai read through a console or an unpinned pipe. This
  is the program text itself: Windows PowerShell 5.1 decodes a
  BOM-less `.ps1` with the ANSI codepage, 874 here, so a section mark
  typed literally into the source is no longer U+00A7 by the time the
  regex is built from it, and every pattern carrying that character
  matches NOTHING. It lies more quietly than anything else in this
  section, because there is no error to read and no red to chase: on
  its first run from its committed home `tools/verify_citations.ps1`
  printed `CITATIONS=3` where 36 were present — the 3 being exactly
  the citations that carry no section mark — and **exited 0**. A
  checker that had parsed 3 of 36 reported success.
  `Get-Content -Encoding UTF8` cannot save it: that pins how the
  CHECKED file is decoded, and the damage is already in the checker.
  Instead: keep `.ps1` source ASCII-only and build the character from
  its codepoint (`[char]0x00A7`), or save the file WITH a BOM. And
  give any parser that can quietly stop matching a COUNT it must
  meet — otherwise it fails by finding LESS, which is
  indistinguishable from a pass.
  → `lessons/a-check-that-never-went-red-was-never-observed.md`

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

- **A child process's output arrives CRLF, and `$` under `re.MULTILINE`
  does not match before `\r`.** A Python script reading another script's
  stdout through a pipe on this box gets `RECONCILE_EXIT=1\r\n`, so
  `re.compile(r"^RECONCILE_EXIT=(\d+)$", re.M)` matches NOTHING. It lies
  because the accusation lands on the child: `prove_reconcile.py` failed
  with "reconcile.py printed no RECONCILE_EXIT line" while that exact
  line was sitting in the captured output, which sends you to debug a
  working program's exit path. Every anchored pattern over subprocess
  output is affected at once, so the symptom is "all my regexes broke".
  Instead: normalise on decode — `raw.decode("utf-8").replace("\r\n",
  "\n")` — the way `restore_db.py:87` already does for psql. Never parse
  subprocess bytes with anchored patterns before that.

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

- **`core.autocrlf` is `true` here, and it does NOT decide the line
  endings.** `.gitattributes` line 1 is `* text=auto eol=lf`, and
  `eol=lf` beats `core.autocrlf` at checkout. The working tree is LF
  and the committed blob is LF. It lies in BOTH directions, and they
  are different mistakes. Reading `core.autocrlf=true` and concluding
  the files were committed with CRLF is wrong — that is the config
  that lost. And counting CR bytes on disk, finding zero, and calling
  the BLOB clean is also wrong: the working tree and the blob are two
  different objects, and a checkout filter sits between them. Measure
  the one you actually mean. Working tree: read the file's bytes.
  Blob: `git show HEAD:<path>` or `git cat-file -p`, and count there.
  Never let one stand as evidence for the other.

  Related, and load-bearing: **`lessons/README.md` is the one file in
  `lessons/` that carries CRLF (41 of 41 lines, re-measured 2026-08-07;
  it said 39 of 39 and the file had grown) AND a UTF-8 BOM.**
  Excluding it from `all-lessons.md` is therefore not only because it
  is the index rather than a lesson — it is also the only source that
  would drag a BOM and CRLF into the generated file. Both reasons are
  real; do not remove the exclusion on the strength of refuting one.

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
- **WHICH BUNDLE THE HANDSET IS RUNNING — establish it before any
  device observation is believed.** Under Expo the JS is fetched from
  Metro at every cold start, so force-quitting the app, relaunching it,
  or rebooting the phone proves NOTHING about the code being executed:
  they all re-fetch from the same Metro, and the exposure is Metro's
  TRANSFORM CACHE, which survives all three. It lies in the most
  expensive direction available — the screen becomes evidence about
  source that is not running, so the diagnosis is aimed at correct code
  and every reading of it comes back innocent. It has already cost two
  days here: a sync-strip defect was hunted through `engine.ts`,
  `queueHealth.ts` and `statusNotice.ts`, all three correct, and the
  `ออฟไลน์` that started it did not reproduce once the bundle was
  current. Worse, the phantom was written down as an observation in a
  lessons file and in `PROJECT_STATUS.md` before anyone doubted it.
  Observable: `npx expo start -c` (`-c` clears the transform cache) AND
  a full reload on the handset, both done BEFORE the staging that
  produces the reading — not afterwards to check, because by then the
  reading is already in the notes. State the bundle in the observation
  itself, the way a proof states its commit.
- **`JWT_SECRET` is set in `server/.env`.** It has no default by
  design and the API refuses to start without one; a default value
  would be a default IDENTITY.
  → `lessons/config-defaults-must-fail-closed.md`

## Workflow (from the owner — do not violate)

- Work in phases. Stop at each phase boundary for review. Never
  continue past a phase on your own.
- Every phase brief carries an explicit `Prove:` block naming the
  observable, not the intention.
- Show a diff before editing any existing file.
- Do not commit until the owner confirms.
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
- A RED-TEAM pass is defined in `RED_TEAM.md`: a session that reads
  BRIEFING/CLAUDE/lessons and the diff — and **NOT** the conversation
  that produced the code — whose job is to make the change fail. It
  hunts three shapes first: a proof green without measuring anything, a
  screen contradicting the state behind it, a constant tuned until it
  looked right. Never hand it the phase brief; that is the whole point.
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
