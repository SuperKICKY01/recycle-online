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

  **THE SAME CODEPAGE, THE OPPOSITE DIRECTION — and this half LOSES
  NOTHING, which is exactly why it is harder to see.** The paragraph
  above is about a READER decoding UTF-8 as CP874: visible mojibake,
  and it accuses the data. This half is about a WRITER. Python on this
  box ENCODES its output as CP874 — measured 2026-08-10,
  `sys.stdout.encoding=cp874` and
  `locale.getpreferredencoding(False)=cp874` on a redirected non-tty
  stream — so a Thai name printed by a script and captured to a file
  or a pipe arrives as **22 bytes where UTF-8 needs 62**, hexing as
  `bad2a7a1cda1…` and not `e0b89ae0b8b2…`. **CP874 represents every
  character in that name, so nothing is lost**: no error, no `?????`,
  no mojibake, and it renders perfectly wherever you look at it. It
  breaks only when something downstream decodes that stream as UTF-8.

  IT LIES BY BEING CORRECT ON THE ONE LAYER ANYONE INSPECTS. Measured
  across five layers of the provisioning path the same day — the
  command-line argv hop, the row written to and read back from
  Postgres, the `COPY` block inside the `pg_dump` body, and that row
  again after a restore — **all four layers that PERSIST the name were
  byte-exact UTF-8, and the only layer that re-encoded was stdout.**
  The layer that mangles is the one a person checks by eye; the four
  that matter are ones nobody sees. Judging by the console would have
  given the opposite of the truth in BOTH directions: the output
  looked right, and there would have been no reason to check the four
  that were.

  Instead: never compare a name by what a program PRINTED. Take hex
  from the authority — `encode(convert_to(col,'UTF8'),'hex')` computed
  server-side, or the dump read in binary — against an expected value
  fixed ONCE, before the write, from a source that never crossed a
  shell. Pair it with an ASCII control down the identical path: the
  ASCII name matched at every layer INCLUDING stdout, and that is the
  only reason the Thai mismatch there reads as a property of
  non-ASCII text rather than of a broken comparison. Two bounds, so
  the measurement is not over-trusted: the stdout figure is a PROXY,
  the same interpreter writing the same string to a redirected stream
  rather than the captured bytes of the original run, which cannot be
  recovered from where the reader sits; and the name carried
  above-line vowels and a thanthakhat but NO below-line vowel, so that
  class is untested.

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

  **A CORRECTION WAS APPENDED HERE IN `9f929ad` AND WAS ITSELF WRONG.** It
  claimed the blob committed by that commit would be LF, so the paragraph
  above had gone half-false. **It did not, and the paragraph above is
  correct and always was:** the blob at `9f929ad` is CRLF, 42 of 42. The
  false version is not preserved — a wrong footgun misleads every session
  that reads it — but what produced it is, because it is a new trap and a
  sharp one.

  **`git add` PRINTS a normalisation warning that it does not act on.**
  Appending one index line raised `warning: in the working copy of
  'lessons/README.md', CRLF will be replaced by LF the next time Git touches
  it`, and that was read as a statement about what the commit was doing.
  It is not one. **`text=auto` does NOT renormalise a path already committed
  with CRLF** — that needs an explicit `git add --renormalize` — so git
  warns, converts nothing, and the blob keeps every CR it had. It lies in
  the worst available direction for this section, because the reader is
  already thinking about line endings and the warning arrives looking like
  the answer to the question they are holding. Note also that the warning
  says *working copy*, not blob: it is about a future CHECKOUT, which
  `eol=lf` would indeed write as LF, and which nothing here has run.

  Measured at four points, all agreeing with the paragraph above: blob at
  `62cee25` CRLF 41/41, working tree at `62cee25` CRLF 41/41, blob at
  `9f929ad` CRLF 42/42, working tree CRLF 42/42 — BOM `efbbbf` on all four.
  Both reasons for the exclusion therefore still stand, unrefuted. **Never
  let git's warning be the observation.** `git show HEAD:<path>` AFTER the
  commit, and count — which is the rule the paragraph above already gave,
  disregarded by the person who appended to it.

- **`Measure-Object -Line` does not count blank lines, so it UNDERCOUNTS every
  file with a blank line in it.** `-Line` counts the lines *inside* each input
  string, and `Get-Content` yields one string per line, so an EMPTY string
  contributes **zero**. `Get-Content -Encoding UTF8 PROJECT_STATUS.md |
  Measure-Object -Line` returned **1823** where `wc -l` and a raw LF-byte count
  both return **2053** — 230 blank lines silently dropped. `lessons/README.md`
  came back 40 against an actual 42, by the same mechanism.

  **It lies in the direction that refutes a TRUE claim, which is the opposite of
  most entries here and is why it gets its own.** The number it produced was not
  merely wrong, it was wrong across a THRESHOLD: `PROJECT_STATUS.md` sets its own
  split-review trigger at "Revisit at 2000 lines" in its own text, so 1823 reads
  as comfortably under while the file is 53 lines past it. A stale reference that
  had been correctly identified would have been dismissed as already fixed, and
  nothing would have looked wrong — there is no error, no red, and the command is
  the obvious PowerShell one to reach for.

  It also cannot be caught by agreement, because **both** natural PowerShell
  spellings share the flaw's neighbourhood: `(Get-Content $p).Count` is right for
  content lines but disagrees with `wc -l` by one whenever a file has no trailing
  newline (`OPEN_ITEMS.md` is exactly that: `wc -l` 603, content 604). Decide
  which of the two you mean before reading either.

  Instead: count LF bytes, or use `wc -l` from the Bash tool, and say which
  definition you used. And give any count you are about to rest a decision on a
  SECOND, independent measurement — the same rule the `.ps1` entry above gives,
  for the same reason: a checker that fails by finding LESS is indistinguishable
  from one that passed.

- **`git commit -F <path>` exits 128 because the message was drafted in a REPLY
  and never written to the file.** The text is `fatal: could not read log file
  '<path>': No such file or directory`, naming a path that looks correct —
  because it IS the intended path, and the only thing wrong with it is that
  nothing was ever written there. It lies by pointing at the filesystem when the
  fault is a skipped step: the message exists in full, in the conversation, so it
  was drafted, reviewed and approved, and every one of those passed. The absent
  artefact is the one thing nobody looked at.

  **It has happened TWICE in one session** — before `12d16a2` and again before
  `fc9cd5c`, the second time after the first had already been noticed and
  reported out loud, which is what makes it a footgun and not a slip. Nothing is
  committed and the staged tree survives, so the cost is a wasted round trip
  rather than a bad commit. The real cost is subtler: the recovery is to write
  the file and re-run, and the reply then has to claim the message is "verbatim
  as drafted" with nothing checking that it is.

  Instead: WRITE THE FILE FIRST, then show it, then commit from it. The file is
  the artefact and the reply is a copy of it, never the other way round — and a
  message shown from a file that already exists cannot disagree with the one
  that lands.

- **An exit code cannot be read by a SEPARATE tool invocation on this box, and
  the attempt comes back EMPTY rather than failing.** Shell state does not
  persist between invocations of either shell tool. An invocation containing
  only `"EXIT=$LASTEXITCODE"`, issued immediately after a `restore_db.py` run
  that had just exited 0, printed `EXIT=` — no digit, no error, exit 0. The
  WORKING DIRECTORY does persist, which is exactly what makes the assumption
  reasonable and wrong: one kind of state survives and the other does not, so
  a session that has watched `cd` hold across calls has evidence for the
  opposite of what is true here.

  It lies about as quietly as the `.ps1` entry above, and in the same
  direction. There is no error to read and nothing goes red, because nothing
  ran: an empty string sitting beside a command that plainly succeeded reads
  as a formatting slip, and the report then carries a step as observed whose
  observation is a blank. A brief that asks for the status "as a separate
  command" is asking for something this harness cannot do — say so, rather
  than printing the blank and moving on.

  Instead: read the status in the SAME invocation —
  `<command>; "EXIT=$LASTEXITCODE"`. `;` is a SEQUENCE, not a pipe: it cannot
  take the preceding command's status away, which is the distinction the
  `A pipe or &&` entry above turns on, and `.claude/hooks/pipe_gate.py` states
  it in its own refusal text.

  AND KNOW WHICH PATH SUPPRESSES A SCRIPT'S OWN EXIT LINE, because several
  scripts here print their status themselves — `BACKUP_EXIT=`,
  `RESTORE_EXIT=`, `PROVE_RECONCILE_EXIT=` — and that line is written by the
  `__main__` block from the same integer it hands to `sys.exit()`, so it is
  trustworthy WHEN PRESENT. It is not always present. `restore_db.py`'s
  `fail()` calls `sys.exit(1)` directly and never reaches the print, so a
  FAILED restore emits no exit line at all. THE ABSENCE IS THE SIGNAL, and it
  is the one an eye scanning for a number does not register — a reader looking
  for `RESTORE_EXIT=1` finds nothing and can take that for output not yet
  read. Observed twice on 2026-08-09, both runs exit 1 with no exit line.
  `prove_reconcile.py` already encodes the rule: its restore check reports
  `RESTORE_EXIT=none` when the pattern matches nothing, and treats the absence
  as the failure rather than as a missing field.

- **`powershell -File <script>.ps1 -Source A B C` binds the FIRST value and
  silently discards the rest, then exits 0 over the sources it never opened.**
  Measured 2026-08-09, six sources named on one command line:

      powershell -File tools\verify_citations.ps1 -Source START_HERE.md
        ARCHITECTURE.md ROADMAP.md OPEN_ITEMS.md SRS_MAP.md PROJECT_STATUS.md

      SOURCES=1  CITATIONS=42  BROKEN=0          EXIT=0

  One file was read. Five were named and never opened, and nothing said so.
  The mechanism is PowerShell's, not the script's: a non-advanced script binds
  the first positional value to `[string[]]$Source` and swallows the remaining
  arguments into `$args`, where nothing looks at them. Both of the script's
  positive controls printed OK — truthfully, about the one file it read.

  IT FAILS BY MEASURING LESS, WITH NO SIGNAL, which is this repository's oldest
  failure shape and the reason it gets an entry rather than a footnote. There
  is no error, no red, and no missing output; the only tell is `SOURCES=1`,
  sitting beside two numbers that look healthy, in a line whose reader is
  looking at `BROKEN`. **The entry directly above is the other half of the same
  family** — one instrument reports a status it never took, this one reports a
  result over a corpus it never read, and both leave the reader believing more
  was observed than was.

  AND THIS IS THE SECOND HOLE OF THIS KIND IN ONE TOOL. The first is already
  recorded: `verify_citations.ps1` once hardcoded `START_HERE.md` as its only
  source and printed `BROKEN=0` over `ARCHITECTURE.md`'s 37 citations without
  opening the file — a green structurally incapable of turning red, written up
  at
  `lessons/a-check-that-never-went-red-was-never-observed.md § a fifth mechanism`.
  That hole was closed by adding `-Source`; this one is in `-Source` itself.
  **Two holes, one tool, both ending in exit 0.** The `§ a sixth mechanism`
  amendment in the same file already records that the tool's DEFAULT source
  list is stale, so a session choosing between "type the sources by hand" and
  "run it bare" has now been wrong in three different ways.

  THE SAFE-FAILURE CONTRAST, and it is the reason this went unnoticed. The
  COMMA spelling — `-Source A,B,C` — degrades into a single filename, takes the
  `SOURCE MISSING` branch and exits 1 (measured the same day:
  `SOURCES=1  CITATIONS=0  BROKEN=1`, `EXIT=1`). That failure is loud, is
  already documented in that lesson's sixth mechanism as harmless BECAUSE it is
  red, and it pushes the reader toward the SPACE spelling, which is the silent
  one. A trap reached by fleeing a documented trap.

  Instead: invoke the script directly with the call operator so `[string[]]`
  binds — `& .\tools\verify_citations.ps1 -Source @('A.md','B.md','C.md')` —
  and then READ `SOURCES=` and confirm it equals the number you passed, before
  reading `BROKEN`. A count you did not check is a corpus you did not check.
  → `lessons/a-check-that-never-went-red-was-never-observed.md`

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
- **WHEN THE WRITE CANNOT BE UNDONE, MEASURE WHAT YOU ARE ABOUT TO
  WRITE BEFORE WRITING IT — not afterwards.** Afterwards is the
  normal order and it is right almost everywhere, because almost
  everything can be corrected. Some things cannot: hard rule 5 forbids
  deleting a transaction, a shop code is immutable once issued because
  it lives on printed slips this system never sees again, and a row
  written into a database somebody else is about to depend on is not
  yours to take back. For those, a wrong value is permanent, so the
  measurement has to come first or it is only an autopsy.
  EARNED 2026-08-10: the shop name for the pilot is Thai, and the
  command-line hop into the script was measured — argv hexed and
  compared against an expected value fixed from a file — BEFORE the
  provisioning ran. It matched, so nothing came of it. Had it not, the
  alternative was a permanently mangled name in a row that cannot be
  deleted, discovered by the check that would otherwise have run one
  command later. The cost of measuring first is one command; the cost
  of measuring second is the whole row.
- Read actual files before stating numbers or facts. Never guess.
- Fix root causes, not symptoms.
- For any debugging — device, build, or server misbehaviour — OPEN
  and follow `.claude/skills/debug-mantra/SKILL.md` (6,337 bytes).
  Before asserting what the device or server did, OPEN and follow
  Kalāma in `.claude/skills/buddhist-method/SKILL.md`
  (13,096 bytes). **Paths, not a summary, and that is the whole
  point of this entry.** Five lines of paraphrase stood here in
  place of both bodies; a measured session made 204 tool calls and
  opened neither file, so the paraphrase is what got acted on — and
  it omitted the step ordering, the escalation inside step 2, and
  five of the six principles. Same rule as `Scope and status`
  above: two copies drift, and a session believes whichever it
  reads first. Both files are NOW TRACKED — `.gitignore` admits
  `.claude/agents/` and `.claude/skills/` — so a diff can finally
  see them change, which it could not when this entry was written.
  The byte counts are a second and cheaper tripwire, not a fact to
  rely on: if one differs, this line is the stale copy and the file
  wins. **Know which kind of number you are holding.** These are RAW
  bytes of the working-tree file, and both files are CR=0 today — so
  raw and LF-normalised sizes are IDENTICAL, and no measurement taken
  now can tell you which definition this line used. That makes the
  numbers worth less than ones whose definition can be checked; they
  diverge by exactly 90 and 161 the moment either file carries CRLF
  again, which is what tracking normalised away. The check HAS been
  seen to fire: on 2026-08-08 one byte appended to debug-mantra
  reddened that file's cell alone while its neighbour stayed green,
  and restoring returned the committed blob byte for byte.
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
  LESSON is for what this project would otherwise RELEARN; a MACHINE
  FOOTGUN is for what would cause a wrong DIAGNOSIS on this box.
  Environment traps go to footguns and do NOT also get a lesson;
  writing both is ceremony, and it dilutes an index whose value is
  that every line in it bites.
  **WIDENED 2026-08-08, and the wording it replaces is the reason.**
  This read "a LESSON is for what would cause a bug in the PRODUCT",
  which was true of every lesson in the index — until that date a
  product bug was the only thing this project operated on. It now
  operates on a SECOND thing: an agent layer under `.claude/` that it
  writes, dispatches, and believes the output of. A finding about how
  we run our own instruments — a scan that read its own command, a
  gate that logged the search into the medium being searched, a role
  definition asserting something the files refute — costs the same to
  relearn as a product bug, and is a LESSON. Under the old wording it
  was homeless: not a product bug, and not a property of this box.
  **The footgun line does NOT move.** A footgun is still only what is
  true of THIS BOX; widening one home is not licence to blur the
  other. An agent-layer finding that IS a property of this machine —
  ripgrep skipping a gitignored path when the search root is the
  parent directory — is still a footgun, and gets no lesson.

## Conventions

- Python: async throughout (FastAPI), type hints required,
  Alembic for migrations.
- TypeScript: strict mode on.
- Commit messages and code comments in English. UI text in Thai.
- Buddhist-era dates (พ.ศ.) in UI and printed slips only; store
  UTC ISO timestamps in the DB.
