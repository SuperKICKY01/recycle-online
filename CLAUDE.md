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

Route by the ask, not by a label: asked to build or change code, start
at `START_HERE.md`; asked to advise on sequence or soundness (no code),
read `ADVISOR.md` before answering; handed a diff to attack, `RED_TEAM.md`.

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
**Superseded 2026-08-16:** the R-numbers were closed as a log on
2026-08-07; forward steps are **P-numbers**, issued in
`ROADMAP.md § Numbering` and nowhere else.

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

  Instead: never compare a name by what a program PRINTED. Take hex
  from the authority — `encode(convert_to(col,'UTF8'),'hex')` computed
  server-side, or the dump read in binary — against an expected value
  fixed ONCE, before the write, from a source that never crossed a
  shell. Pair it with an ASCII control down the identical path: the
  ASCII name matched at every layer INCLUDING stdout, and that is the
  only reason the Thai mismatch there reads as a property of
  non-ASCII text rather than of a broken comparison.
  → `EVIDENCE.md § CP874 writer: the five-layer measurement`

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
  Blob: `git cat-file blob <sha>` captured as BYTES, and count there.
  Never let one stand as evidence for the other — and see the measured
  warning below before taking that count through PowerShell, which hands
  a native command's output back as an ARRAY OF LINES with every ending
  already stripped, so the number you get describes the writer and not
  the blob.

  Related, and load-bearing: **`lessons/README.md` is the one file in
  `lessons/` whose WORKING-TREE copy carries CRLF, and it carries a
  UTF-8 BOM in both objects.** Excluding it from `all-lessons.md` is
  therefore not only because it is the index rather than a lesson — it
  is also the only source that would drag a BOM and CRLF into the
  generated file, and a generator reads the working tree, which is the
  CRLF one. Both reasons are real; do not remove the exclusion on the
  strength of refuting one. **WHICH object is the whole difficulty here,
  and the line count moves every time a lesson is added, so no figure is
  quoted in this sentence.** The measured table, each object labelled with
  the commit it was taken at, is in
  `EVIDENCE.md § core.autocrlf: the measured table and its history`.

  **WHY THE TWO DIFFER, AND WHY NOTHING WILL EVER SHOW IT TO YOU.**
  `text=auto` normalises CRLF to LF on the way INTO the index, so every
  `git add` of this file has stored LF and the blob has never held a CR.
  `git status` then compares the working tree NORMALISED, so a CRLF working
  tree over an LF blob reads as CLEAN — measured clean at this commit, with
  no uncommitted change to the path. There is no diff to notice and no state
  in which the two agree. The working copy is CRLF because something other
  than a checkout last wrote it: `eol=lf` makes a checkout write LF, so the
  CRs arrived from an editor afterwards.

  **`git add` PRINTS a normalisation warning, and it is about the OTHER
  object.** Appending one index line raised `warning: in the working copy of
  'lessons/README.md', CRLF will be replaced by LF the next time Git touches
  it`, and that was read as a statement about what the commit was doing. It
  is not one. It says *working copy*, and it is about a future CHECKOUT —
  which `eol=lf` would indeed write as LF, and which nothing here has run.
  What `text=auto` does not do on its own is renormalise a path that is NOT
  being re-added; that needs an explicit `git add --renormalize`. It lies in
  the worst available direction for this section, because the reader is
  already thinking about line endings and the warning arrives looking like
  the answer to the question they are holding.

  **Never let git's warning be the observation.** Read the object itself:
  `git cat-file blob <sha>` AFTER the commit, count in BYTES, and say which
  of the two objects the number describes — which is the rule the paragraph
  above already gave, and which everyone who has edited this passage since
  has disregarded.

- **`Measure-Object -Line` does not count blank lines, so it UNDERCOUNTS every
  file with a blank line in it.** `-Line` counts the lines *inside* each input
  string, and `Get-Content` yields one string per line, so an EMPTY string
  contributes **zero**. **It lies in the direction that refutes a TRUE claim,
  which is the opposite of most entries here and is why it gets its own.**

  It also cannot be caught by agreement, because **both** natural PowerShell
  spellings share the flaw's neighbourhood: `(Get-Content $p).Count` is right for
  content lines but disagrees with `wc -l` by one whenever a file has no trailing
  newline (`OPEN_ITEMS.md` is exactly that: `wc -l` 603, content 604). Decide
  which of the two you mean before reading either.

  **Superseded 2026-08-17 — THE PROPERTY HOLDS, ONLY THE FIGURES ROTTED, and
  the two are worth separating because the figures are the disposable half.**
  `OPEN_ITEMS.md` still ends without a newline — last byte measured `0x20`,
  not `0x0A` — so the two spellings still disagree by exactly one, which is
  the whole of what the paragraph above rests on. The numbers are no longer
  603/604 and have not been for a long time: measured 2026-08-17, `wc -l`
  from the Bash tool reads **3428** and `(Get-Content $p).Count` reads
  **3429**. NO SHA IS GIVEN, deliberately — the work carrying this correction
  was uncommitted at the moment the sentence was written, so the only sha
  available is the one that does NOT contain it, which is the corollary a few
  sections down under the pin-a-claim convention. And these figures will rot
  in their turn: this file grows every phase, and it grew by more than fifty
  lines inside the very commit that corrected them.

  Instead: count LF bytes, or use `wc -l` from the Bash tool, and say which
  definition you used. And give any count you are about to rest a decision on a
  SECOND, independent measurement — the same rule the `.ps1` entry above gives,
  for the same reason: a checker that fails by finding LESS is indistinguishable
  from one that passed.
  → `EVIDENCE.md § Measure-Object -Line: the measured undercounts`

- **`git commit -F <path>` exits 128 because the message was drafted in a REPLY
  and never written to the file.** The text is `fatal: could not read log file
  '<path>': No such file or directory`, naming a path that looks correct —
  because it IS the intended path, and the only thing wrong with it is that
  nothing was ever written there. It lies by pointing at the filesystem when the
  fault is a skipped step: the message exists in full, in the conversation, so it
  was drafted, reviewed and approved, and every one of those passed. The absent
  artefact is the one thing nobody looked at.

  Instead: WRITE THE FILE FIRST, then show it, then commit from it. The file is
  the artefact and the reply is a copy of it, never the other way round — and a
  message shown from a file that already exists cannot disagree with the one
  that lands.
  → `EVIDENCE.md § git commit -F: the two occurrences`

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
  read.
  `prove_reconcile.py` already encodes the rule: its restore check reports
  `RESTORE_EXIT=none` when the pattern matches nothing, and treats the absence
  as the failure rather than as a missing field.
  → `EVIDENCE.md § Exit-line absence: the observed restores`

- **`powershell -File <script>.ps1 -Source A B C` binds the FIRST value and
  silently discards the rest, then exits 0 over the sources it never opened.**
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
  → `EVIDENCE.md § -Source binding: the measured run and the second hole`

- **PowerShell's `>` puts a BOM on the front of the file it creates, and
  everything that reads that file back gets bytes nobody put in the data.**
  The redirect is not a byte copy. It is `Out-File`: it serialises objects to
  TEXT, stamps the encoding's signature at the head, and terminates every line
  CRLF. Measured on this box 2026-08-10, PowerShell 5.1.26100.8875 — two short
  ASCII strings out, sixteen bytes on disk:

      EF BB BF 61 6C 70 68 61 0D 0A 62 65 74 61 0D 0A
      ^^^^^^^^ three bytes of signature, before the "a" of "alpha"

  IT FAILS SILENTLY AND IN THE DIRECTION THAT LOOKS LIKE A RESULT, which is
  what earns it an entry beside the codepage ones rather than a footnote in
  them. And only the FIRST line of the file is affected, so the file opens
  correctly in an editor, prints correctly, and agrees with expectation on
  every other line — the one line that disagrees is the one nobody thinks to
  inspect, because the failure looks like an answer about the DATA.

  Instead: do not capture through the redirect at all. Write the file from the
  program that owns the data — `Path.write_bytes`, or `.encode("utf-8")` with
  `newline="\n"`, the way `build_paste_set.py` already does on both sides of
  every comparison it makes. Where a shell must produce the file,
  `Set-Content -Encoding utf8NoBOM` on 7+, or on 5.1
  `[System.IO.File]::WriteAllText($p, $s, (New-Object System.Text.UTF8Encoding $false))`.

  AND CHECK IT, because a fix believed is not a fix measured. Print the first
  bytes and look at them:
  `[System.BitConverter]::ToString([System.IO.File]::ReadAllBytes($p)[0..7])`,
  and require the first byte to be the first byte of your DATA. `EF-BB-BF` or
  `FF-FE` at the head IS the defect, and there is nothing else to see — which
  is the whole reason this cannot be judged by eye.

  CHECKED AGAINST THE ENTRIES IT MUST NOT RESTATE, and it extends all four.
  The two codepage-874 entries are about 874 standing in for UTF-8 — the first
  a READER that visibly corrupts text, the second a WRITER that transcodes a
  whole payload and loses nothing; here nothing is transcoded and nothing is
  corrupt, three bytes are PREPENDED and the payload stays UTF-8. The `.ps1`
  SOURCE entry is the sharp one, because it points the OPPOSITE way: its remedy
  is to save the file WITH a BOM. Both are correct. The same three bytes that
  repair a program's source break a data file's first line, so "add a BOM" and
  "strip the BOM" are not in conflict — they are about different KINDS of file,
  and the question to ask is which of the two you are holding. The
  CRLF-from-a-child-process entry is about endings ARRIVING in something you
  read; this is about a signature and endings being WRITTEN into something you
  create.
  → `EVIDENCE.md § Out-File BOM: the incidents and the bounds`

### Boot check — name the observable, don't assume the environment

Before judging any result, name the observation that proves the
environment is real. An assumed environment turns a green run into a
false pass and a red run into a confidently wrong cause.
The incidents behind three of these observables are in
`EVIDENCE.md § Boot check: the incidents behind three observables`.

- **Both TypeScript programs must be run.** `mobile/` holds two
  DISJOINT programs: `npm run typecheck` (tsconfig.node.json —
  engine, adapters, proofs; excludes `src/device`) and
  `npm run typecheck:app` (tsconfig.json — the Expo app; excludes
  `src/proof` and the node driver). Observable: two commands, each
  run bare, each exiting 0. One green program is not a green tree.
- **Postgres must be up before login is judged.** Observable:
  `docker ps` shows `recycle_pg` `(healthy)` on `5544->5432`.
  Check the container and read the real traceback
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
  and every reading of it comes back innocent.
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
  → `EVIDENCE.md § Measure-before-the-write: the provisioning argv check`
- Read actual files before stating numbers or facts. Never guess.
- **A REPORT IS A CLUE, NOT A SOURCE — INCLUDING ONE THIS SESSION WROTE
  ITSELF.** The rule above says read the file; this says which things
  are NOT files, because that is where it keeps failing. A subagent's
  findings, a previous reply in this conversation, a phase record, a
  line in `OPEN_ITEMS.md` — all four have exactly the standing of an
  outstanding-queue line: they say where to LOOK, and they are evidence
  of nothing else. `OPEN_ITEMS.md` is the clearest case because it is a
  file and still is not a source: its whole content is claims about
  OTHER files, every one of which may have been fixed, moved, or been
  wrong when written. A finding is promoted to a fact by re-measuring it
  against the artefact in the CURRENT pass, and by no other route.
  **The failure mode is promotion into a prompt.** A report gets read,
  believed, and written into the next brief as a premise, and from then
  on nothing checks it — the brief is the authority and the artefact is
  never opened.
  **THE THIRD INSTANCE RAN FOR A FULL DAY AND STEERED REAL WORK, 2026-08-12.**
  It was caught only because the brief ordered a
  SWEEP BEFORE the edits it authorised — had the order been reversed, the
  word "first" would have gone into permanent files at twelve sites, and
  a wrong claim in a code comment does not rot visibly. **Order the sweep
  before the edit, and treat "never/always/first" as the words that
  demand a search rather than a memory.**
  **WHERE THE CHECKPOINT IS NOW.** A ninth item in the advising session's
  pre-send checklist: for any claim that something does not exist, has never
  been done, or is not supported — name the sentence relied on, name the WORDS
  searched for, and where nothing was found say **"not found with these words"**
  rather than "there is none". A search with the wrong word and an absent fact
  produce an identical result, and only the first phrasing keeps them apart.
  **THE LIMITATION, STATED RATHER THAN HIDDEN: that checklist lives in the
  advising chat's own instructions and NOT in this repository.** Nothing here
  enforces it, and nothing here can even see it. **A new advising chat opened
  without it has no checkpoint at all**, so whoever opens one must send the
  checklist with it. `START_HERE.md § 2` records that it exists and that the
  repo does not hold it; the gap itself is queued in
  `OPEN_ITEMS.md § Documentation`.
  **Superseded 2026-08-16 (`5ac22c3`), and half of it survives.** FALSE
  now: the checklist IS in this repository — all nine items, four
  advisor-only and the ninth-by-pointer in `ADVISOR.md`, four shared
  checks mirrored between that file and the Shared checks subsection
  below, held identical by `tools/verify_shared_checks.py` — so an
  advising chat no longer has "no checkpoint at all". STILL TRUE, and
  the more important half: the advisor gets them only when `ADVISOR.md`
  is actually loaded, and that file is ON-DEMAND — the same delivery
  mechanism measured unopened 56% of the time. The checkpoint now
  EXISTS but is CONDITIONAL on a read; it is not unconditional the way
  this file's own load is, and only the shared four ride that load.
  That residual is the MEASURED argument — not a preference — for
  moving the advisor into a terminal, where these files load the way a
  coding session's do; the on-demand risk on `ADVISOR.md` does not
  exist for an in-terminal advisor the way it does for a pasted-file
  one.
  **This is a WORKFLOW rule and not a lesson**, by the two-homes test
  above: nothing about it is a property of this box, and it would not be
  opened by an index line touching a task — it applies to every task.
  → `EVIDENCE.md § A-report-is-a-clue: the recorded instances`
- Fix root causes, not symptoms.
- For any debugging — device, build, or server misbehaviour — OPEN
  and follow `.claude/skills/debug-mantra/SKILL.md`.
  Before asserting what the device or server did, OPEN and follow
  Kalāma in `.claude/skills/buddhist-method/SKILL.md`.
  **Paths, not a summary, and that is the whole
  point of this entry.** Same rule as `Scope and status`
  above: two copies drift, and a session believes whichever it
  reads first. Both files are NOW TRACKED — `.gitignore` admits
  `.claude/agents/` and `.claude/skills/` — so a diff can finally
  see them change, which it could not when this entry was written.
  The byte counts are a second and cheaper tripwire, not a fact to
  rely on: if one differs, this line is the stale copy and the file
  wins.
  → `EVIDENCE.md § Skills are paths: the paraphrase and the tripwire firing`
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
  **The footgun line does NOT move.** A footgun is still only what is
  true of THIS BOX; widening one home is not licence to blur the
  other. An agent-layer finding that IS a property of this machine —
  ripgrep skipping a gitignored path when the search root is the
  parent directory — is still a footgun, and gets no lesson.
  → `EVIDENCE.md § Two homes: the widening`

### Shared checks — both roles, every session

Four checks the coding session AND the advising chat run on everything
they produce. The list is mirrored VERBATIM in `ADVISOR.md § 5`, and
`tools/verify_shared_checks.py` goes red the moment the two copies
differ — run it at every phase boundary (`START_HERE.md § 4`). THIS
copy is the canonical one: on any difference, this file wins and
`ADVISOR.md` holds the stale copy. The duplication is deliberate and
licensed by that check — a third file both roles must open is a file
that measurably goes unopened, and these four must not sit behind a
pointer. Remove the check and the licence dies with it.

<!-- shared-checks:begin -->
- Does every counting name its tool, and its definition of what it
  counts?
- Does every negative result carry a control — a case the instrument is
  known to catch — so "found nothing" is distinguishable from an
  instrument that never looked?
- Does the text contradict itself: its own declarations, its own MUST
  NOTs, its SCOPE against its TASK?
- Is a measurement being carried as a fact? A measurement is true at
  the moment it was taken and rots afterwards — re-measure it, or pin
  it to the commit it was taken at (the pin-a-claim convention in
  CLAUDE.md's Conventions).
<!-- shared-checks:end -->

## Conventions

- Python: async throughout (FastAPI), type hints required,
  Alembic for migrations.
- TypeScript: strict mode on.
- **PIN A CLAIM TO A COMMIT, OR EXPECT IT TO ROT.** A sentence anchored to a
  sha — "nothing here is built at `a73c264`" — stays true for ever, because it
  is a statement about a moment that has already happened. A sentence in the
  present tense — "there is no password-change route" — is false the day the
  work lands, and nothing announces that it turned. Write the anchored form
  wherever the claim is about what EXISTS.
  **THE COROLLARY, AND IT IS THE HALF THAT GETS SKIPPED: A CLAIM MAY BE PINNED
  TO A SHA ONLY ONCE THE WORK CARRYING IT IS COMMITTED.** Before that there is
  no sha that means what the sentence needs, and the temptation is to reach for
  the nearest one — which is HEAD, which is always the commit that does NOT
  contain the work. The result reads exactly like a correctly anchored claim,
  and it is worse than an unanchored one: it survives every later rewrite, and a
  reader who checks it finds a real commit and a real file, just not the pair
  the sentence asserts. So write the
  sentence unanchored and anchor it in the next pass, or leave the sha blank and
  fill it in after the commit. An unanchored sentence rots visibly; a wrongly
  anchored one does not rot at all.
  This is a rule about how the project WRITES, so it lives here beside the
  other writing conventions and NOT in Machine footguns, which is only for what
  is true of this box; and not as a lesson, because a lesson is opened when its
  index line touches the task, and "I am about to write a sentence about the
  present" touches no task anybody names.
  **Where the anchored form is impossible** — a status file's whole job is the
  present — the fallback is the one
  `ARCHITECTURE.md § 13. Corrections to THIS file`
  and `PROJECT_STATUS.md` already follow: supersede rather than rewrite, and
  date the supersession, so a reader can see the file was right when it was
  written. **Keep a citation on ONE line.** This bullet's first draft wrapped
  that handle across two and it resolved to nothing — the break was invisible
  because CLAUDE.md is not in the checker's source list, and was found only by
  pointing the checker at this file on purpose.
  → `EVIDENCE.md § Pin-a-claim-to-a-commit: the measured evidence`
- Commit messages and code comments in English. UI text in Thai.
- **A CODING SESSION REPORTS IN ENGLISH — its own prose, all of it.**
  Every reply, every phase report, every subagent's findings, every
  commit body, every explanation of a diff. The bullet above is not
  wrong, it is SILENT: it names three artefacts and a report to the
  owner is none of them, so this could not be inferred from it. It is
  written for the first time on 2026-08-17, the day a CLI coding
  session returned a survey written in Thai — the work was good, the
  language was wrong, and nothing in the tree said otherwise.
  **QUOTED MATERIAL IS EXEMPT, AND THAT IS NOT A SOFTENING.** The rule
  governs the session's OWN prose and never what the session is
  QUOTING. A Thai UI string, a Thai error message, a Thai line of a
  document, a Thai commit body: reproduce it VERBATIM, in Thai,
  unchanged. **NEVER TRANSLATE A QUOTED ARTEFACT.** A translated
  string is no longer evidence, and it is the one thing the reader
  needed; this project already treats Thai text as a measurement
  problem rather than a display one (Machine footguns above, the two
  codepage-874 entries). A report that renders `ยังไม่มีผู้ขายในระบบ` into
  English has destroyed the observation and kept an opinion about it.
  **THE ADVISING SESSION IS EXEMPT, AND IT IS THE ONLY EXEMPT ROLE.**
  It replies to the owner in Thai and writes in English everything it
  dispatches. That rule is NOT restated here — it lives in
  `ADVISOR.md § 1. Role bounds` "It replies to the owner in THAI", the
  file that role loads. Two copies drift; a pointer cannot. Do NOT
  mirror these two into the shared checks above: that duplication is
  licensed by a checker that reddens when its copies differ, and these
  two are MEANT to differ.
  **This bullet is prose, not a mechanism.** Nothing can grep a reply.
  The only mechanism is the `REPORTS IN:` field at the head of a
  dispatched brief, which travels with the work to the point of use.
- Buddhist-era dates (พ.ศ.) in UI and printed slips only; store
  UTC ISO timestamps in the DB.
