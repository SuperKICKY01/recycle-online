---
name: delivery-workflow
description: Phased delivery, deployment verification, release gates, and knowledge capture for multi-step engineering work. Use when planning phases of work, deploying config or code changes to running systems, deciding what blocks a release, maintaining project docs or lesson files, running experiment programs, or handing work over. Trigger on deploy, release, rollout, handover, phase, checklist, postmortem, lesson learned, project status.
---

# Delivery Workflow

The first three rules come from the same failure family — "descriptive
without being escalatable" — independently confirmed across multiple
incidents. They lead for a reason.

## Battle-tested core

### 1. A warning written as prose is a TODO — escalate it

When a doc describes a failure mode in present-tense descriptive prose
("without this guard, X produces N duplicates"), it is *predicting a
bug*. Promote it to an open issue, an assertion that fails loudly, or a
test that exercises the scenario. Descriptive prose decays the moment a
reader skims past it.

Example: a production failure was predicted, in writing, in two reference
passages — and still hit, because both read as historical context rather
than action items. The team then spent investigation time "discovering"
what its own docs had already documented.

### 2. An out-of-scope item tagged "required for production" is a release-blocker

Deferring work is fine; deferring it into a passive TODO list is not. Any
deferred item whose own description says "required to make X work in
production" blocks the release of X: either close it, or add an explicit
gate ("do not deploy until Y is closed") in the project status doc — an
artifact someone must consciously override, not a note someone must
happen to reread.

Example: an item tagged "required to make the feature work in production"
sat in an out-of-scope queue for days and was almost still sitting there
at deploy time; only a pre-deploy audit re-surfaced it. Same failure
shape as rule 1, one layer up: a description of a dependency is not an
escalation of it.

### 3. Capture lessons cheaply; promote them stingily

After any non-trivial bug or feature, write a dated lesson file with four
sections: **Symptom / Root cause / Fix / Generalizable rule.** Then decide
promotion separately and deliberately: only rules that will apply six
months from now to a *different* problem get promoted into the
always-loaded playbook — with explicit approval, never auto-edited.

The promotion bar, applied repeatedly in practice: **one example is a
pattern, two is a rule.** Hold a candidate rule until a second independent
incident confirms it. Diary entries are cheap; polluting the always-on
context is not — a short playbook that always applies beats a long one
that half-applies.

## Deploying to running systems

### 4. A running process does not see file edits

Config values and class-level constants load at import/start. Deploying a
change means: restart the specific process, then verify the first
post-restart output actually reflects the new value. Diagnostic: if tests
(which re-import per run) behave per the file but the live system doesn't,
the live system is running stale code — restart it.

Example: a threshold edited in the source at 17:06 had no effect on a
process started at 10:26; a transaction was accepted hours later under the
retired value, and the file "proved" it couldn't happen.

### 5. Know what restart resets — and what it doesn't

Enumerate per system: in-memory state lost on restart (caches, dedup
sets, day-anchored counters) and external state that survives (open
transactions, DB rows, vendor-side records). Schedule restarts to minimize
the exposure window of the lost state, and know which guards cover the gap
while caches repopulate.

### 6. New behavior ships behind a default-OFF flag

Merely adding the code must not move the baseline; enabling it is a
separate, explicit deploy step with its own verification. Example: two new
subsystems shipped fully wired but default-OFF — merging changed nothing,
and each was enabled in its own deploy with its own boot-banner check.

### 7. Keep shared defaults conservative; calibrate per-project at invocation

Never silently loosen a conservative default in shared code to fit one
project. Pass the project-specific threshold explicitly at the call site,
where it is visible, and record the calibration decision. A loosened
default lets future regressions hide behind softer math for every user of
the shared code.

Example: a shared validation harness kept its strict default threshold;
the project passed its relaxed, justified threshold on the CLI, with the
reasoning recorded in the decision log.

### 8. Ship interdependent fixes together — and say why

When multiple bugs mask each other, applying one fix alone produces
misleading results. Example: of three coordinated fixes, one made the
recorded numbers honest, one stopped the ongoing damage, one recovered
orphaned records — any single fix alone painted a false picture (honest
numbers with ongoing damage, or stopped damage with junk numbers). Ship
them as a set and document the interdependence so a partial cherry-pick
can't happen silently.

### 9. Pre-flight checklist before each deploy

Maintain a per-system checklist covering: environment and credentials;
external services up; config sanity (the *values*, not just the keys —
a 10×-wrong baseline passed every "key exists" check); code health (new
events wired, listeners running); and "what to watch in the first hour"
with expected healthy ranges, so the first anomaly is recognized as one.

## Specs and scope

### 10. Divergent implicit answers = missing spec

If two parts of the system imply different answers to the same question
("can X happen twice?"), the answer is not "the code is right" or "the
other part is right" — it is "we never decided." Stop, name the question,
write the spec. Otherwise the next fix in either part silently locks in
whichever answer that fixer happened to prefer.

### 11. Fix the abstraction before building on its bug

If, while implementing, you discover the abstraction underneath has a bug
whose effect overlaps your feature, fix the abstraction first. Layering on
a buggy primitive inherits its failure mode in a harder-to-diagnose form.
Example: a new protective check needed "loss so far today" — and the
existing "daily" metric turned out not to be daily at all; building the
check on it would have masked the bug under a new name. Deferring such a
fix is allowed only as a deliberate, recorded decision, never a default.

### 12. Keep an append-only trial ledger

Every experiment gets a permanent row — configuration, result, verdict —
pass or fail. Failed rows are the record that stops the same dead idea
from being re-run in three months, and the proof of what was actually
tried. Rows never get edited or deleted.

## Observability and tooling

### 13. Observability is read-only and out-of-tree

Monitoring and dashboard surfaces are read-only consumers: no write path
into the system, no reachability to the action path. Anything published
externally (dashboards, status feeds) lives in a separate repository with
least-privilege tokens — one write token on the producing box, one
read-only token on the rendering side — so nothing sensitive can leak
through the observability path, and a dashboard bug can never place an
action.

### 14. A shared working tree with an automated writer has one safe writer

If a background loop force-pushes or amends from a working tree, pause it
before any manual git operation in that tree — otherwise it silently
resets the staging area and eats your commit mid-operation. Example: a
60-second amend-and-force-push publisher loop collided with a manual
commit, which landed empty with the staged work gone. Stop the loop →
commit → restart the loop. One writer at a time.
