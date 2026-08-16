# Start here

For a session that has just booted with no context. This file POINTS; it is
not a home for rules. It owns four things and nothing else: the reading
order below, the roles in §2, the brief shape in §3, and the checklist in
§4. Everything else is cited as `file § Section` "handle" — search for the
handle, never a line number, because these files grow.
**Editing this file: keep every handle ASCII, and on ONE line** — this box
is codepage 874, so a handle carrying Thai or `≠` may not survive the
reader's own grep; and a handle wrapped across two lines here is a string
that exists on no line of the file it points at.

## 1. Reading order

In this order. Each line says what that file OWNS.

1. **`CLAUDE.md`** — architecture, the eight hard rules, this box's machine
   footguns, the workflow, conventions.
2. **`lessons/README.md`** — the index of mistakes already paid for. Open
   an individual lesson only when its index line touches the task.
   (`CLAUDE.md § Workflow` "At the start of every session")
3. **`PROJECT_STATUS.md`** — where the work has got to, and the dated
   observation behind every claim of it. **5034 lines at `c5eca4f` — measured
   2026-08-12 evening by `wc -l` and a raw LF-byte count that agree, CR=0, on
   a clean tree, so the count names the committed blob. Budget several reads,
   not two.** This said **5031** for part of that same day — three lines stale
   within hours — and **1940** before that, stale by a factor of two and a
   half, with nothing to announce it: **a line count in a file that grows every
   phase rots silently, so read this as an order of magnitude and never as a
   fact.** Whether it belongs here at all is the owner's call.
   **Superseded 2026-08-17: 5111 lines**, measured by `wc -l` from the Bash
   tool, agreeing with `(Get-Content).Count` because this file DOES end in a
   newline. No sha, deliberately: the edit carrying the figure was final but
   UNCOMMITTED when it was written, so the only sha available is the commit
   that does not contain it. The bullet above is right about what to do with
   this number, and nothing about that changed — it read 5034, the advising
   session measured 5065 immediately before this phase (its figure, not one
   re-taken here), and this phase's own edit to that file took it to 5111.
   Three values inside five days. Order of magnitude, never a fact.
   Start at `PROJECT_STATUS.md § Current phase`.
   (`CLAUDE.md § Scope and status` "Both live in")
4. **`ROADMAP.md`** — the ORDER of what is not done, and the argument for
   that order. R-numbers are defined here and nowhere else.
   **Superseded 2026-08-16:** the R-numbers are a closed log since 2026-08-07;
   forward steps are P-numbers, defined in `ROADMAP.md § Numbering` and
   nowhere else.
   (`CLAUDE.md § Scope and status` "Phase numbering")
5. **`OPEN_ITEMS.md`** — the queue: everything outstanding, one line each,
   unranked.

Not in the boot path. Open when the task reaches them:

- **`BRIEFING.md`** — the advisor's handoff. Written for a reader who never
  opens the code; you are not that reader (see §2).
- **`RED_TEAM.md`** — the definition of a red-team pass. Read it only when
  running one. (`CLAUDE.md § Workflow` "A RED-TEAM pass is defined")
- **`.claude/`** — nine skills, four agent roles, two gate hooks, and a
  permission file. Skill and agent descriptions enter every session on this
  box. **Superseded 2026-08-12:** this bullet said "their contents are NOT
  reviewed, and git cannot see them" — false since `79b1e75` (2026-08-08),
  which tracked `agents/`, `skills/`, `hooks/` and `settings.json`:
  `git ls-files .claude` returns 21 files, so diffs and blame reach them.
  Only the gate logs and `settings.local.json` stay outside git, and the
  contents were surveyed against this repo's rules on 2026-08-07/08.
  (`OPEN_ITEMS.md § Decisions open` "holds nine skills")
- **`server/README.md`** — local server setup and the DB role table.
- **`server/scripts/BACKUP.md`** — the backup/restore runbook.

## 2. Who writes what

- **The owner** sets the phase, reviews at every boundary, and is the only
  one who confirms a commit — `CLAUDE.md § Workflow`. Items under
  `OPEN_ITEMS.md § Decisions open` are not yours to settle.
- **The advising chat** is a separate conversation that reads `BRIEFING.md`
  and the paste set, and NOT the codebase. **Its rules live in `ADVISOR.md`
  and nowhere else** — the role bounds, the two unprompted duties, the
  brief-header conventions, and the pre-send checklist, one home so two
  copies cannot drift. Of that checklist the repo has seen only the NINTH
  item; the other eight are an owner-pastes-here placeholder in
  `ADVISOR.md`, and an advising chat opened without them still has one
  checkpoint, not nine. The gap stays queued at
  `OPEN_ITEMS.md § Documentation`.
  **Superseded 2026-08-16 (`5ac22c3`):** the checklist is complete in
  the repo — four advisor-only items, four shared checks mirrored with
  `CLAUDE.md § Shared checks` under `tools/verify_shared_checks.py`,
  and the ninth by pointer: 4+4+1. The placeholder is gone, and the
  queue entry carries its own dated closure.
- **You, this session, write the production code**, run the proofs, and
  report what was observed.
- **A red-team session** is a fourth role, run separately, and is never
  handed the phase brief.
  (`CLAUDE.md § Workflow` "A RED-TEAM pass is defined";
  `RED_TEAM.md § How to run one` "Do NOT give it the conversation")

## 3. The phase brief

Five parts. **Check the brief you were given against this list before
starting.** If a part is missing, ask for it; do not infer it.

1. **PHASE** — a name, and a boundary you stop at.
   (`CLAUDE.md § Workflow` "Work in phases")
2. **SCOPE** — what to change.
3. **`Prove:`** — the observables that decide the phase: things that can be
   RUN and read.
   Required by `CLAUDE.md § Workflow` "Every phase brief carries".
4. **OUT OF BOUNDS** — files not to touch, decisions already settled.
5. **STOP** — where review happens, and whether a commit is expected (it is
   not, until confirmed: `CLAUDE.md § Workflow` "Do not commit until").

**A brief with no `Prove:` block is malformed. Say so and ask for one
before writing anything.** These are also malformed, and look like the
real thing:

- `Prove: verify it works` / `confirm the fix` — names no observable.
- `Prove: the proof should pass` — a prediction, not a measurement.
- `Prove: the code is correct` — names no command, no exit code, no file.

A well-formed `Prove:` line names a command and the exit code it must
produce, or a file and the line to be read back, or a request and the
response observed.

## 4. Done — the observables

Run every command BARE — `CLAUDE.md § Machine footguns` "An exit code that
is not the command's", and `CLAUDE.md § Machine footguns` "hides a non-zero
exit".

**Before any result is believed**

| check | pointer |
|---|---|
| `docker ps` shows `recycle_pg` `(healthy)` on `5544->5432` | `CLAUDE.md § Boot check` "Postgres must be up" |
| `JWT_SECRET` is set in `server/.env` | `CLAUDE.md § Boot check` "JWT_SECRET" |
| the API base URL is set explicitly, per script | `PROJECT_STATUS.md § Baseline observations` "Set the base URL" |
| the phone got a response from `/health` at `mobile/app.json`'s `extra.apiBaseUrl` | `CLAUDE.md § Boot check` "The phone can actually reach" |

**Commands**

| command (cwd) | green is | a green here does NOT cover |
|---|---|---|
| `npm run typecheck` (`mobile/`) | exit 0 | the Expo app program — `app/`, `App.tsx`, `src/device` (`CLAUDE.md § Boot check` "Both TypeScript programs") |
| `npm run typecheck:app` (`mobile/`) | exit 0 | `src/proof` and the node driver |
| `npm run prove:<name>` (`mobile/`); names in `mobile/package.json` "scripts" | exit 0 **twice in a row, no reseed between** (`lessons/proof-must-run-twice.md`) | anything under `app/`; `prove:forbidden --offline` exits **2**, never 0 (`PROJECT_STATUS.md § What is built` "skips that case and exits") |
| `uv run python scripts/prove_<name>.py` (`server/`); scripts in `server/scripts/` | exit 0 twice in a row, no reseed | `prove_reconcile.py` and `prove_docno_clock.py` refuse the live database — pass `--database <scratch>` (`PROJECT_STATUS.md § What is built` "require a SCRATCH DATABASE") |
| `uv run python scripts/reconcile.py` (`server/`) | exit 0; 1 = violations, 2 = could not run (`PROJECT_STATUS.md § What is built` "clean / violations / could-not-run") | the limits it prints as What this checker CANNOT see, on every run |
| `node dist/proof/<name>.js` run by hand | **not a green** — a red build still writes `dist/` (`OPEN_ITEMS.md § Code debt` "A red build still overwrites") | use the `npm run prove:*` script instead |
| `server\.venv\Scripts\python.exe tools\verify_shared_checks.py` (repo root) | exit 0 | the checks' CONTENT — it proves the two copies identical, not that either role ran them (`CLAUDE.md § Shared checks`) |

**Before the phase closes**

| check | pointer |
|---|---|
| the real path was RUN, not reasoned about | `CLAUDE.md § Workflow` "a change is done only when the real path" |
| everything unobserved is reported as unproven, plainly | `CLAUDE.md § Workflow` "say so plainly", and `PROJECT_STATUS.md` "not been OBSERVED" |
| asked, and answered in writing: **is a lesson owed?** If yes, it is written and indexed before the phase closes | `CLAUDE.md § Workflow` "Before finishing a phase", then `CLAUDE.md § Workflow` "Write that lesson UNPROMPTED" |
| lesson, or machine footgun? | `CLAUDE.md § Workflow` "Two homes, one test" |
| `PROJECT_STATUS.md` updated at the boundary | `CLAUDE.md § Scope and status` "Both live in" |
| stop for review; do not commit until confirmed | `CLAUDE.md § Workflow` "Work in phases", and `CLAUDE.md § Workflow` "Do not commit until" |
