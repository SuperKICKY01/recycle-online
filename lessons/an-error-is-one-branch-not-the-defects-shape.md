# An error you observed is one branch, not the defect's shape

**Applies to** the moment you write down what a defect DOES — in a status file,
a queue entry, a commit message, a severity call. Not to diagnosing the cause;
that is [[diagnosis-must-precede-the-fix]]. This is the step AFTER the cause is
correctly named, where the consequence gets recorded and the priority gets set.

**The rule:** the failure you saw is ONE BRANCH. Before recording it as the
defect's shape, ask **what in the DATA selected that branch, and whether that
condition is incidental.** Severity read off a single observation is the
severity of a single branch. An error is not the worst thing a defect can do —
it is evidence that on this input the bad path announced itself.

## The instance

`backup_db.py` interpolated a relation name into `from public.{t}` unquoted.
Run against a database holding `public."Odd Name"`, it produced:

    BACKUP FAILED: psql failed (1): ERROR:  relation "public.odd" does not exist
    LINE 1: select 'Odd Name' as t, count(*) as n from public.Odd Name u...

Exit 1, no artefact, and no `BACKUP_EXIT` line. From that single observation the
defect was written into `PROJECT_STATUS.md` and `OPEN_ITEMS.md`, at three
passages, as:

> **IT FAILS CLOSED, WHICH IS THE SAFE DIRECTION**: no dump, no manifest, no
> half-written artefact that could later be trusted … **The danger is the
> MISSING EXIT LINE, not a corrupt backup.**

**Every word of that is a correct description of what was observed, and the
conclusion is false.** Unquoted, `public.Odd Name` is VALID SQL: it names
relation `Odd` — folded by PostgreSQL to `odd` — with the ALIAS `Name`. It
errored only because no relation `odd` happened to exist.

Measured later, after adding a decoy `public.odd` (11 rows) beside
`public."Odd Name"` (13 rows), the same unquoted code returned:

    {'Odd Name': 11}

No error. No warning. Eleven rows recorded in the manifest for a table holding
thirteen. **The abort was the lucky case**, and the defect's real shape is a
backup that completes and records a count read from the wrong table.

## Why the wrong conclusion was so easy to reach

The error message is the trap. `relation "public.odd" does not exist` reads as
*the SQL is malformed* — the parser is complaining, so surely nothing could have
run. It is in fact the opposite: **the SQL was well formed and pointed at
something else.** A syntax error would have been safer, because a syntax error
cannot be satisfied by data.

Two other things made it comfortable. The exit code was 1, which everything in
this repo is trained to read as "it refused". And "fails closed" is a phrase with
a good reputation here — it is genuinely the right property in
[[config-defaults-must-fail-closed]] — so applying it felt like recognising a
known-good pattern rather than making a claim.

**The cost is not the wrong sentence. It is where the sentence lived.** Status
and queue files are what decide the order work gets done in. A defect that
silently writes wrong numbers into a backup manifest had been filed as the safe
one of three, in the two documents a future session reads to choose what to fix.

## The question that would have caught it, and it is one sentence

**"What would have to be true for this NOT to error?"**

The answer here was "a relation called `odd` exists" — an ordinary thing for a
database to contain, not an exotic one. The moment that answer is written down,
the severity inverts by itself. It costs one sentence and needs no experiment,
though the experiment afterwards is what turns it from an argument into a
measurement.

The same question is what separates this from [[a-backup-is-a-claim-until-it-is-restored]],
which is about not trusting an exit code that says SUCCESS. This is the mirror:
**do not trust an exit code that says FAILURE to tell you how bad the failure
is.** Both are the same underlying error — reading a process's status as a
description of what it did to the data.

## How to apply

1. **Before recording a defect's consequence, name the branch you observed.**
   "It aborted" is an observation. "It aborts" is a claim about every input, and
   it needs more than one input.
2. **Ask what in the data selected that branch**, and write the answer down. If
   the answer is a condition the world could easily satisfy — a name that
   happens to exist, a table that happens to be empty, a list that happens to
   have one element — the branch you saw is not the shape.
3. **Build the input that selects the OTHER branch**, and make its counts
   distinct so a wrong answer cannot coincidentally look right. Here that was a
   decoy relation at 11 rows beside the target at 13; identical counts would
   have hidden the substitution completely.
4. **Treat "fails closed" as a claim requiring proof, not a property you can
   recognise.** It is a statement that no input reaches the bad path, which is a
   claim about every input.
5. **When the correction lands, correct it where it was WRITTEN, at every site.**
   This one had reached three passages in two files; a search found them only
   after a first, broken search reported none — so count the sites, do not fix
   the first one you meet.
6. **A red is not self-explaining.** Ask of any failure whether it is the defect
   announcing itself or the defect being lucky, and say which in the write-up.
