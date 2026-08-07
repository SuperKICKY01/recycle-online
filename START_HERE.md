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
   observation behind every claim of it. **1903 lines: budget two reads.**
   Start at `PROJECT_STATUS.md § Current phase`.
   (`CLAUDE.md § Scope and status` "Both live in")
4. **`ROADMAP.md`** — the ORDER of what is not done, and the argument for
   that order. R-numbers are defined here and nowhere else.
   (`CLAUDE.md § Scope and status` "Phase numbering")
5. **`OPEN_ITEMS.md`** — the queue: everything outstanding, one line each,
   unranked.

Not in the boot path. Open when the task reaches them:

- **`BRIEFING.md`** — the advisor's handoff. Written for a reader who never
  opens the code; you are not that reader (see §2).
- **`RED_TEAM.md`** — the definition of a red-team pass. Read it only when
  running one. (`CLAUDE.md § Workflow` "A RED-TEAM pass is defined")
- **`.claude/`** — nine Claude skills and a permission file. Their
  descriptions enter every session on this box; their contents are NOT
  reviewed, and git cannot see them.
  (`OPEN_ITEMS.md § Decisions open` "holds nine skills")
- **`server/README.md`** — local server setup and the DB role table.
- **`server/scripts/BACKUP.md`** — the backup/restore runbook.

## 2. Who writes what

- **The owner** sets the phase, reviews at every boundary, and is the only
  one who confirms a commit — `CLAUDE.md § Workflow`. Items under
  `OPEN_ITEMS.md § Decisions open` are not yours to settle.
- **The advising chat** is a separate conversation that reads `BRIEFING.md`
  and NOT the codebase (`BRIEFING.md` "Who this is for"). It advises on
  sequence and on whether an argument is sound. **It does not write
  production code.** What arrives from it is an argument, never an
  observation — `CLAUDE.md § Workflow` "Read actual files before stating"
  and `CLAUDE.md § Workflow` "For any debugging" apply to it unchanged.
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

**Before the phase closes**

| check | pointer |
|---|---|
| the real path was RUN, not reasoned about | `CLAUDE.md § Workflow` "a change is done only when the real path" |
| everything unobserved is reported as unproven, plainly | `CLAUDE.md § Workflow` "say so plainly", and `PROJECT_STATUS.md` "not been OBSERVED" |
| asked, and answered in writing: **is a lesson owed?** If yes, it is written and indexed before the phase closes | `CLAUDE.md § Workflow` "Before finishing a phase", then `CLAUDE.md § Workflow` "Write that lesson UNPROMPTED" |
| lesson, or machine footgun? | `CLAUDE.md § Workflow` "Two homes, one test" |
| `PROJECT_STATUS.md` updated at the boundary | `CLAUDE.md § Scope and status` "Both live in" |
| stop for review; do not commit until confirmed | `CLAUDE.md § Workflow` "Work in phases", and `CLAUDE.md § Workflow` "Do not commit until" |
