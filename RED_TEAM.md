# Red team

A review pass whose job is to **make a change fail**. Not to assess its quality, not
to improve it, not to like it. If it cannot be made to fail, that is the result and
it gets said plainly.

This exists because three specific defects reached the owner on a device rather than
being caught in review, and all three had already passed a careful reader. The three
shapes below are those three. They are hunted first because they are the ones this
project is demonstrably bad at seeing from the inside.

## How to run one

Give a session the diff and these four things, and **nothing else**:

- `BRIEFING.md` — what the product is, the architecture, the invariants
- `CLAUDE.md` — hard rules, machine footguns, workflow
- `lessons/README.md` — the index (individual lesson files on demand)
- the diff under review, plus any file it touches, read in full

**Do NOT give it the conversation, phase brief, plan or commit message that produced
the code.** This is the one rule that makes the pass worth running. Those artifacts
contain the author's reasons, and a reviewer who reads them inherits the author's
model of why the code is correct. Every defect below survived review by someone
holding exactly that model. Not having it is the red team's only advantage, and it is
given away by a single paragraph of context.

The session may read the repository freely — it *should*, since a diff cannot be
judged from a diff. What it must not read is the argument for the change.

**AND THOSE TWO SENTENCES CAN CONTRADICT EACH OTHER, WHICH THEY COULD NOT WHEN
THIS FILE WAS WRITTEN.** The prohibition above names a conversation, a phase
brief, a plan and a commit message — four things that all live OUTSIDE the tree,
so "read the repository freely" never reached any of them. That stopped being
true on 2026-08-17. `ROADMAP.md § P1.18 — One outbox, several kinds of work` now
carries the argument for its own step IN FULL: the measurement of the two drains
in `mobile/src/sync/engine.ts`, the device incident behind the ordering, and a
sentence telling the reader in advance which design would be a misreading. **A
session told to read the repository freely reads that and inherits the author's
model wholesale** — which is the one thing this pass exists to avoid, arriving
through the permission rather than around it.

**So the dispatch must name what is EXCLUDED, not only what is included**, and it
must do so whenever the step's reasoning has been written into a tracked file.
State the exclusions beside the four inputs: the phase brief, and the named
sections that argue for the change. Scope the reading to where the diff lives —
for a change under `mobile/`, that is `mobile/` — and say so explicitly, because
a reviewer who has not been told a file is off limits will open it and will be
right to.

**This is a permission that has to be re-scoped per pass, not a list that can be
maintained here.** Which sections argue for a change depends on the change, and
a fixed exclusion list in this file would rot in the way this repository already
documents. The obligation is on whoever dispatches: before sending, ask which
tracked file now contains the reasoning, and exclude it by name.

## The stance

Assume the change is wrong and go looking for the case that proves it. The
question is never "is this good code" but **"what input, state or sequence makes this
produce a wrong number, a lost row, a false statement on a screen, or the wrong
person's name on a bill?"**

Two disciplines the repository already uses, applied here:

- **Run the disproof first** (`debug-mantra`). Do not build the case for a bug and
  then look for support. Take the claim the change makes and try to break it.
- **Never assert what the code did from reading it** (`buddhist-method`, Kalāma).
  If a claim can be checked by running something — a proof, a request, a query — the
  finding is worth more with the observation attached and should say so when it has
  none.

## The three shapes, hunted first

### 1. A proof that is green without measuring anything

**What it looks like.** An assertion whose subject is the fixture rather than the
behaviour. A count (`len(x) == n + 1`). A proof that FINDS its fixture instead of
creating it. A "normalisation" step run as setup. A new proof that has never been
observed red.

**The questions that expose it.**

- *If the behaviour under test were deleted, what would this assertion do?* If the
  answer is not "go red", it measures nothing.
- *What did this assertion measure on the SECOND run, with no reseed?* A proof that
  normalises its own fixture as setup reports `DELETE 0, UPDATE 0` under a green
  tick — it is measuring its previous run.
- *Could `POST /bills` have produced this fixture row?* If not, it is not a fixture.
  An assertion over a hand-built row exercises the row, not the code that would have
  built it.

**What it has already cost here.** `prove_master_write` asserted
`len(with_inactive) == len(default_list) + 1`, assuming its own product was the
tenant's only retired row; a bill from a previous run pinned another one forever
(hard rule 5), and `+ 1` was simply false — the third time that assertion shape had
bitten. Separately, `prove_rls` wrote bills with a NULL `doc_no`, a row the API
cannot produce, and the reconciler's first ever run was red with 84 violations, none
of them product defects.

**A finding here must name the mutation** — the specific thing you could break in the
production code while leaving this proof green.

→ `proof-must-run-twice.md`,
`a-proof-fixture-must-be-a-row-the-product-could-produce.md`

### 2. A screen that contradicts the state behind it

**What it looks like.** A card assembled by more than one renderer. Wording hardcoded
to the only caller that exists today. A developer diagnostic on a path an operator
can reach. A state whose *neighbours* were never enumerated — the retry window, the
offline variant, the transitional moment between two correct states.

**The questions that expose it.**

- *Read the screen top to bottom as ONE STRING.* Does it contradict itself?
- *Does it contradict the row in the database at that moment?*
- *Does it promise an action the system will not perform?*
- *Is this wording a function of the CAUSE, or of the one call site that exists?*

**What it has already cost here.** `voidProgressLine` promised
`จะดำเนินการให้อัตโนมัติ` two lines above a notice box stating the system had NOT
cancelled the bill. Both renderers were internally correct. Both were separately
asserted, across hundreds of green cells, none of which asserted the concatenation in
draw order. Separately: one `require_admin` answers `admin_required` for every admin
path, so wording hardcoded to its only caller told an owner opening a *report* that a
bill had not been cancelled.

**A finding here must quote the rendered text** and name the state it contradicts.
"The message is unclear" is not this shape; "the message says X while the row says
not-X" is.

→ `correct-classification-can-still-render-as-an-error.md`,
`403-is-about-what-the-caller-may-do.md`, `fallback-default-is-a-wrong-number.md`

### 3. A constant tuned until it looked right

**What it looks like.** A number that has moved more than once. A number with no
written reason. A number duplicated in two files. A number serving two unrelated
meanings. A number derived from two other numbers that themselves have no reason.

**The questions that expose it.**

- *How many times has this value moved, and what was OBSERVED each time?* Check the
  trial ledger in `PROJECT_STATUS.md`; a change to a value in that table is a TRIAL
  and owes a row. A threshold nudged until the complaints stop is fitted to noise —
  each nudge looks like a fix because the thing being measured is somebody's
  patience.
- *Is this value duplicated?* Two copies are free to drift.
- *Does it serve two meanings?* Then tuning it for one silently moves the other.
- *What is derived FROM it?* Changing an input changes every value computed from it,
  and the derived one usually has no ledger row.

**What it has already cost here.** `TAP_MIN` is a stated standard, duplicated in two
files, and undercut by raw `minHeight` literals of 36 and 44 elsewhere.
`JUST_FETCHED_WINDOW_MS` is both a banner threshold and the tolerance on "a stored
stamp cannot be in the future" — tuning it for banner reasons widens how far into the
future a stamp may sit before the app stops trusting its own ages, which is the
direction that defaults a stale price onto a bill. `MAX_ATTEMPT_CYCLE_MS` is derived
from two values that have no recorded reason between them.

**A finding here must name the ledger row that is missing, or the second thing that
moves with the number.** A value being a judgement is not a defect; a value being
unaccountable, duplicated or double-purposed is.

## What counts as a finding

A finding names a **concrete failure**. All four of these, or it is not one:

1. **Specific inputs or state → a specific wrong outcome.** Not a category of risk. A
   case.
2. **The outcome matters**: money is wrong, a row is lost or corrupted, an action is
   attributed to the wrong person, a false statement reaches an operator, or one
   shop's data becomes visible to another.
3. **It is reachable through the real path** — a client request, a device action, a
   sync retry, a scheduled run. Not only by editing the code to make it happen.
4. **It survives the author's likely first answer.** If the answer is "that is
   handled at X", the finding says why X does not cover this case.

Rank each one: **CONFIRMED** (the path was traced end to end, or observed running) or
**PLAUSIBLE** (could not be fully traced — and then say exactly what was not traced).

**Report format**, most severe first. One block each, no prose around them:

```
[CONFIRMED|PLAUSIBLE]  <one-sentence claim>
  where:    <file:line>
  failure:  <inputs or state> -> <wrong outcome>
  why now:  <what in this diff makes it reachable>
  shape:    <1 | 2 | 3 | other>
```

## What is a nitpick — do not report these

The output must not be a style list. Excluded, whatever their merit:

- naming, formatting, file layout, comment density, import order
- "this could be simpler" with no failure attached
- missing tests in the abstract. A missing test is a finding only when you can name
  the failure it would have caught — at which point report the failure, not the test
- hypothetical scale the repo has already documented with a wake condition (the
  missing day-predicate index, the reconciler's per-tenant memory bound). Arguing
  the condition is wrong is a different report, and a fair one — but say so
- anything the code documents as a deliberate trade-off **with a stated condition**
- anything already in `OPEN_ITEMS.md` or `PROJECT_STATUS.md`'s *Known device gaps*.
  Check before reporting; if it is there, say "already recorded" in one line and move
  on. Re-finding a known gap is not a finding

## What it must NOT do

1. **Do not propose architecture changes.** The three-program split, the API as the
   only writer, RLS at the lowest layer, NUMERIC money, server-assigned `doc_no` —
   all LOCKED. A session that reopens them spends itself on a settled question and
   returns nothing anyone can act on.
2. **Do not relitigate the decided facts in `BRIEFING.md` §2.** Each carries its
   reason. **"This code violates the rule you locked" is the single most valuable
   finding available** — hunt that. "The rule is wrong" is not this job.
3. **Do not rewrite code.** Name the failure, not the patch. The moment a reviewer
   authors the fix they own it, and the independence that makes this pass worth
   running is gone. A one-line sketch of a direction is acceptable where the failure
   is otherwise hard to state; a diff is not.
4. **Do not manufacture a finding.** If nothing can be made to fail, say so and list
   what could NOT be checked and why — device paths, timing windows, anything needing
   hardware or volume that was not available. **An empty report is a real result.**
   The characteristic failure of a red team is inventing something to justify the
   session, and a fabricated finding costs more than a missed one because it spends
   the reader's trust in every future report.

## After a finding lands

A finding that is accepted and fixed **produces a lesson** — that is the standing
rule in `CLAUDE.md`, and being asked is not the trigger; the mistake landing is. The
red-team session should say which of the four shapes in `BRIEFING.md` §5 the finding
belongs to, or argue that it is a new one. An environment trap goes to the machine
footguns in `CLAUDE.md` instead, and does not also get a lesson.
