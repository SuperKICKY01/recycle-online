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

Traps specific to this machine — each has produced a WRONG DIAGNOSIS here.
Symptom + do-instead stay loaded; the why-it-lies prose, measurements and
refutation history moved to `EVIDENCE.md` (same titles) and the linked lessons
on 2026-08-28 — nothing weakened, only relocated.

- **Correct Thai reads as mojibake (`เธญเธฅเธน`) or `?????`.** This box's codepage
  is 874, so a locale-default decode re-reads UTF-8 as CP874, and the "fix" of
  rewriting the strings CREATES the corruption. Instead: verify in bytes at the
  source — hex from Postgres (`encode(convert_to(col,'UTF8'),'hex')`), codepoints
  from the file, `encoding="utf-8"` pinned; never judge Thai by eye out of a
  console. → `lessons/console-is-not-the-observation.md`
- **THE SAME CODEPAGE, THE OPPOSITE DIRECTION — this half LOSES NOTHING.** Python
  ENCODES stdout as CP874: a Thai name printed to a file/pipe is 22 bytes where
  UTF-8 needs 62 — no error, renders fine until decoded as UTF-8. Instead: never
  compare a name by what a program PRINTED — hex from the authority against a
  value fixed ONCE before the write, with an ASCII control down the same path.
  → `EVIDENCE.md § CP874 writer: the five-layer measurement`
- **A non-ASCII character in `.ps1` SOURCE breaks the program before it runs.**
  PowerShell 5.1 decodes a BOM-less `.ps1` as CP874, so a section mark stops
  matching every pattern while the script EXITS 0. Instead: keep `.ps1` ASCII and
  build the char from its codepoint (`[char]0x00A7`), or save WITH a BOM; and
  give any parser that can quietly stop matching a COUNT it must meet.
  → `lessons/a-check-that-never-went-red-was-never-observed.md`
- **An exit code that is not the command's.** A cygwin/Git-Bash `fork` can fail
  and the shell reports a status the program never produced. Instead: run
  typechecks and proofs BARE, one command per invocation, no chaining, and re-run
  once before believing any failure.
- **A pipe or `&&` hides a non-zero exit** — a pipeline's status is the LAST
  command's, so `tsc … | tail && echo CLEAN` prints CLEAN while `tsc` fails.
  Instead: run it bare and read its own exit (`; "EXIT=$LASTEXITCODE"`).
  → `lessons/correct-classification-can-still-render-as-an-error.md`
- **A child process's output arrives CRLF, and `$` under `re.MULTILINE` won't
  match before `\r`** — `^RECONCILE_EXIT=(\d+)$` matches nothing and blames the
  child. Instead: normalise on decode, `raw.decode("utf-8").replace("\r\n","\n")`
  (as `restore_db.py:87`), before any anchored pattern.
- **Multi-line text passed as a shell argument is mangled here** — quote-stripping
  (`python -c` → false `SyntaxError`) or pathspec/truncation (`git commit -m`), and
  the mechanism DIFFERS BY COMMAND, so "it worked last time" measures only the last
  command. Instead: write it to a file — `git commit -F <file>`, a `.py` script
  rather than `python -c`.
- **`core.autocrlf` is `true` here, and it does NOT decide the line endings** —
  `.gitattributes` `eol=lf` beats it at checkout, and working tree and blob are two
  objects with a filter between. Instead: measure the one you mean — working tree
  reads the file's bytes; blob is `git cat-file blob <sha>` counted as BYTES, never
  through PowerShell (which strips endings into an array). `lessons/README.md` is
  the one CRLF+BOM file, hence excluded from `all-lessons.md`; never let git's
  `git add` warning (it means a future CHECKOUT) be the observation.
  → `EVIDENCE.md § core.autocrlf: the measured table and its history`
- **`Measure-Object -Line` does not count blank lines, so it UNDERCOUNTS** — and
  `(Get-Content $p).Count` is off by one from `wc -l` when a file lacks a trailing
  newline (`OPEN_ITEMS.md`). Instead: count LF bytes or use `wc -l` (Bash tool),
  say which definition, and give any decision-bearing count a SECOND independent
  measurement. → `EVIDENCE.md § Measure-Object -Line: the measured undercounts`
- **`git commit -F <path>` exits 128 because the message was drafted in a REPLY and
  never written to the file** — the path is right; nothing was written there.
  Instead: WRITE THE FILE FIRST, then show it, then commit from it.
  → `EVIDENCE.md § git commit -F: the two occurrences`
- **An exit code cannot be read by a SEPARATE tool invocation on this box, and
  the attempt comes back EMPTY rather than failing** — shell state doesn't
  persist, so a lone `"EXIT=$LASTEXITCODE"` prints `EXIT=`. Instead: read it in the
  SAME invocation (`<command>; "EXIT=$LASTEXITCODE"`), and treat an ABSENT
  self-printed exit line as the failure signal, not output unread.
  → `EVIDENCE.md § Exit-line absence: the observed restores`
- **`powershell -File <s>.ps1 -Source A B C` binds the FIRST value and discards the
  rest, exiting 0 over sources it never opened** — the only tell is `SOURCES=1`.
  Instead: use the call operator so `[string[]]` binds —
  `& .\tools\verify_citations.ps1 -Source @('A.md','B.md')` — and read `SOURCES=`
  equals the count passed before reading `BROKEN`.
  → `lessons/a-check-that-never-went-red-was-never-observed.md`
  → `EVIDENCE.md § -Source binding: the measured run and the second hole`
- **PowerShell's `>` puts a BOM on the file it creates** (it is `Out-File`): only
  the FIRST line is affected, so a downstream set-compare finds one element silently
  unequal. Instead: write from the program that owns the data (`Path.write_bytes`,
  or `.encode("utf-8")` with `newline="\n"`); in a shell `Set-Content -Encoding
  utf8NoBOM` (7+) or `[System.IO.File]::WriteAllText($p,$s,(New-Object
  System.Text.UTF8Encoding $false))` (5.1); and CHECK the first bytes
  (`[System.BitConverter]::ToString([System.IO.File]::ReadAllBytes($p)[0..7])`) —
  the first must be your DATA, not `EF-BB-BF`/`FF-FE`.
  → `EVIDENCE.md § Out-File BOM: the incidents and the bounds`
- **`grep -i` TOGETHER WITH `-F` dies "Aborted", exit 134 — the locale decides, so
  two sessions get OPPOSITE answers and both are right.** Re-running cannot discover
  it, and under `2>/dev/null` piped to `wc -l` an abort looks like "not found".
  Instead: never combine `-i` with `-F` in a shell `grep` here (use one, or `rg`),
  and give any zero a POSITIVE CONTROL in the same invocation, read first.
  → `EVIDENCE.md § grep -iF Aborted: the locale split and the false zeros`

### Boot check — name the observable, don't assume the environment

Before judging any result, name the observation that proves the environment is
real — an assumed environment turns a green into a false pass and a red into a
wrong cause. Three incidents:
`EVIDENCE.md § Boot check: the incidents behind three observables`.

- **Both TypeScript programs must be run.** `mobile/` holds two DISJOINT programs —
  `npm run typecheck` (node: engine/adapters/proofs, excludes `src/device`) and
  `npm run typecheck:app` (the Expo app, excludes `src/proof`). Observable: two
  commands, each bare, each exit 0. One green program is not a green tree.
- **Postgres must be up before login is judged.** Observable: `docker ps` shows
  `recycle_pg` `(healthy)` on `5544->5432`; read the real traceback before naming a
  cause. → `lessons/diagnosis-must-precede-the-fix.md`
- **The phone can actually reach this box.** `mobile/app.json` `extra.apiBaseUrl` is
  a LAN address; a changed IP or uvicorn not on `0.0.0.0` looks exactly like being
  offline. Observable: the PHONE (not the box) gets a response from `/health` there.
- **WHICH BUNDLE THE HANDSET IS RUNNING** — Expo re-fetches JS from Metro each cold
  start, so force-quit/relaunch/reboot prove nothing (the transform cache survives
  all three). Observable: `npx expo start -c` AND a full reload, both BEFORE the
  staging that produces the reading; state the bundle in the observation itself.
- **WHICH CODE THE SERVER IS RUNNING** — without `--reload` a long-running server
  serves the code it IMPORTED AT STARTUP, and a clean `git status` says nothing
  about that (2026-08-17: `POST /sellers` answered 403 for ten hours after the fix
  committed). Observable, all three: start time postdates the commit, tree clean at
  it, AND a request through the changed path shows the changed behaviour.
- **`JWT_SECRET` is set in `server/.env`.** No default by design — a default value
  would be a default IDENTITY. → `lessons/config-defaults-must-fail-closed.md`

## Workflow (from the owner — do not violate)

- Work in phases. Stop at each phase boundary for review. Never continue past a
  phase on your own.
- Every phase brief carries an explicit `Prove:` block naming the observable, not
  the intention.
- Show a diff before editing any existing file.
- Do not commit until the owner confirms.
- applied ≠ verified: a change is done only when the real path has been run
  (server: an actual HTTP request; not "it should work").
- **WHEN THE WRITE CANNOT BE UNDONE, MEASURE WHAT YOU ARE ABOUT TO WRITE BEFORE
  WRITING IT** — a transaction (hard rule 5), an immutable shop code, or a row
  someone else will depend on cannot be corrected afterwards, so the measurement
  comes first or it is an autopsy.
  → `EVIDENCE.md § Measure-before-the-write: the provisioning argv check`
- Read actual files before stating numbers or facts. Never guess.
- **A REPORT IS A CLUE, NOT A SOURCE — INCLUDING ONE THIS SESSION WROTE ITSELF.** A
  subagent's findings, a prior reply, a phase record, an `OPEN_ITEMS.md` line all
  say where to LOOK and nothing more; a finding becomes a fact only by re-measuring
  against the artefact in the CURRENT pass, and the failure mode is promotion into a
  prompt. Order the sweep BEFORE the edit it authorises, and treat "never/always/
  first" as words that demand a search rather than a memory. For any claim that
  something does not exist, name the sentence relied on and the WORDS searched, and
  where nothing was found say "not found with these words", never "there is none".
  The residual is the measured argument for moving the advisor into a terminal.
  → `EVIDENCE.md § A-report-is-a-clue: the recorded instances`
- Fix root causes, not symptoms.
- For any debugging — device, build, or server misbehaviour — OPEN and follow
  `.claude/skills/debug-mantra/SKILL.md`; before asserting what the device or server
  did, OPEN and follow Kalāma in `.claude/skills/buddhist-method/SKILL.md`. Paths,
  not a summary — two copies drift, and both files are tracked so a diff sees them.
  → `EVIDENCE.md § Skills are paths: the paraphrase and the tripwire firing`
- If something doesn't work, say so plainly. Negative results are valuable.
- A RED-TEAM pass is defined in `RED_TEAM.md`: a session that reads
  BRIEFING/CLAUDE/lessons and the diff — and **NOT** the conversation that produced
  the code — whose job is to make the change fail. Never hand it the phase brief.
- At the start of every session, read `lessons/README.md` (and any lesson file
  relevant to the task at hand).
- Before finishing a phase, if a real mistake was made and fixed or a non-obvious
  constraint was found, write or update a lesson file (one per lesson) and its index
  line in `lessons/README.md`. Only for what would cause a real bug if forgotten.
- Write that lesson UNPROMPTED. Being asked is not the trigger — the mistake landing
  is. A phase is not finished until the lesson it produced is written.
- Two homes, one test — which thing would the forgetting break? A LESSON is for what
  this project would RELEARN; a MACHINE FOOTGUN is for what would cause a wrong
  DIAGNOSIS on this box. Environment traps go to footguns and do NOT also get a
  lesson; the footgun line does NOT move.
  → `EVIDENCE.md § Two homes: the widening`

### Shared checks — both roles, every session

Four checks both roles run on everything they produce, mirrored VERBATIM in
`ADVISOR.md § 5` and held identical by `tools/verify_shared_checks.py` (run at
every boundary). THIS copy is canonical; on any difference this file wins. The
duplication is licensed by that check — remove it and the licence dies.

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

- Python: async throughout (FastAPI), type hints required, Alembic for migrations.
- TypeScript: strict mode on.
- **PIN A CLAIM TO A COMMIT, OR EXPECT IT TO ROT.** A sentence anchored to a sha
  stays true forever; a present-tense claim about what EXISTS goes false the day the
  work lands, with nothing to announce it. The corollary that gets skipped: pin only
  once the work is committed — before that the nearest sha is HEAD, the commit that
  does NOT contain the work; write it unanchored and anchor it next pass. Where
  anchoring is impossible (a status file), supersede-and-date. Keep a citation on
  ONE line at BOTH ends — the target end is the harder one, a mid-phrase wrap being
  invisible in the rendered document.
  → `EVIDENCE.md § Pin-a-claim-to-a-commit: the measured evidence`
- Commit messages and code comments in English. UI text in Thai.
- **A CODING SESSION REPORTS IN ENGLISH** — its own prose, all of it: every reply,
  phase report, subagent finding, commit body, explanation of a diff. QUOTED
  MATERIAL IS EXEMPT and is NEVER translated — a Thai UI string, error message,
  document line or commit body is reproduced VERBATIM (a translated artefact is no
  longer evidence). The advising session is the only exempt role (it replies to the
  owner in Thai); its rule lives in `ADVISOR.md § 1. Role bounds` and is not restated
  here. The only mechanism is the `REPORTS IN:` field at the head of a dispatched
  brief.
- **THE `Co-Authored-By` TRAILER IS A BARE MODEL NAME** —
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`, the model and nothing in
  brackets. A harness default may add a parenthetical (`Claude Opus 5 (1M context)`)
  and nothing catches it, so read the log BARE before writing a message:
  `git log --format='%(trailers:key=Co-Authored-By,valueonly)'`.
  → `EVIDENCE.md § Co-Authored-By: the trailer census`
- Buddhist-era dates (พ.ศ.) in UI and printed slips only; store UTC ISO timestamps
  in the DB.

## Engineering conduct (both roles, every session)

The disposition these files assume — not new rules, but the stance beneath them.

- Every claim is MEASURED, UNMEASURED, or ASSUMED-BECAUSE — and says which. An
  unlabelled claim reads as measured whether or not it is.
- A finding is a clue, not proof — a subagent's, a prior reply, a queue line alike.
  Re-derive against the artefact before relying, and name the instrument; the full
  rule is the Workflow section above.
- Never guess a contract a schema or file can answer: `/openapi.json` for an API
  shape, the migration for a column, the source for a behaviour.
- Scope is a fence, not a suggestion. Stop where the brief stops; a missing part of
  a brief is asked for, never invented.
- A discovery outside the phase is RECORDED where it belongs (`OPEN_ITEMS.md` or the
  phase record), not turned into an unrequested fix.
- Neither optimism nor pessimism — evidence only. "It should work" is not a result;
  either the real path was run or it was not.
- When wrong, correct the RECORD before the code — a wrong claim left standing
  becomes the next session's premise.

## Where things live

- Status / what is built / device gaps — `PROJECT_STATUS.md` (read every session).
- Order of the outstanding work — `ROADMAP.md` (P-numbers issued here only).
- The queue, unranked — `OPEN_ITEMS.md`.
- Why a footgun/workflow/convention rule exists (incidents, measurements,
  refutation history) — `EVIDENCE.md`, sectioned by the rule it backs.
- Mistakes already paid for — `lessons/README.md` (open a lesson when its line hits).
- Architecture/invariants — `ARCHITECTURE.md`, `BRIEFING.md`; advisor — `ADVISOR.md`;
  red-team — `RED_TEAM.md`; spec — `docs/SRS.md` (via `SRS_MAP.md`).
