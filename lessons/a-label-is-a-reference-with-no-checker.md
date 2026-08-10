# A label is a reference, and nothing in this repository checks one

**Applies** the moment you APPEND to any numbered or lettered collection this
project uses as a label space — the D-numbers, `S1`–`S6`, the `P` steps, the closed
`A` and `R` logs — and to every sentence anywhere that names one of those labels
bare.

**A label looks like a citation and is not one.** `tools/verify_citations.ps1`
parses exactly one form, `` `FILE § Section` "handle" ``, and asserts the section
and the handle each resolve to one line in the named file. **A bare `D6` matches
nothing it looks for.** It carries no filename, so there is no target to resolve,
and the checker cannot report a label that resolves to two things any more than it
can report one that resolves to none. **The instrument is not weak here, it is
blind by construction** — and its green says so in neither direction.

## What happened

`ARCHITECTURE.md § 10` had carried its own `D1`–`D5` since 2026-08-10. Four
account-provisioning decisions were appended to it the same day as `D6`–`D9`.

`ROADMAP.md § The decisions the ordering forced` has carried a **different**
`D1`–`D12` since 2026-08-07, about ordering rather than architecture, of which
`D6`, `D7`, `D9` and `D11` are OPEN — the shared package's contents, the desktop
renderer's CORS origin, which stage owns Android, and how a desktop app is
installed. And one sentence names them bare:

    ROADMAP.md, P2.6
    **DONE WHEN:** D6, D7, D9 and D11 each carry an answer, or a recorded
    reason the pilot did not settle it.

**Three of those four labels now name two unrelated things**, and the sentence is a
DONE WHEN — the thing this project uses to decide a step is finished. A session
checking whether `D6` carries an answer, landing in the architecture file, finds a
fully-reasoned decision about creating users and can close a step about a shared
TypeScript package.

**THE CHECKER RAN TWICE, OVER BOTH FILES, AND REPORTED `BROKEN=0` BOTH TIMES**,
while the ambiguity was live in the tree it had just read. Every citation genuinely
did resolve. Nothing was wrong with the run; the class of defect was outside what
it can express.

## Why the obvious search would not have found it

The change was about passwords and account creation. The natural sweep — and the
one that was run first — greps the vocabulary of the change: `password`,
`create.user`, `provisioning`, `rate.?limit`. **The broken sentence contains none
of those words.** It contains four letters and four digits.

It was found by a search whose brief was the SHAPE OF THE CHANGE rather than its
subject: *what enumerates or counts the collection I am about to append to?* That
angle also turned up five other stale counts in the same pass, including `§9`'s
"D1 through D4" and `§12`'s "D1 and D3 remain wholly unbuilt", neither of which
mentions accounts either.

**The general form, and it is the reusable part:** *when you APPEND to a
collection, the sites you break are the ones that REFERENCE the collection, and a
reference need not contain one word of your subject.* Grep for the collection, not
for the change.

## What to do

- **Before minting a label, grep every other file for that exact label.** One
  command. `git grep -nE '\bD6\b' -- '*.md'` would have returned the DONE WHEN
  above before the append, not after.
- **Never write a bare label across a file boundary.** Both files already knew to
  qualify when citing each other — `ARCHITECTURE.md` writes "`ROADMAP.md` D4" and
  `ROADMAP.md` writes `` `ARCHITECTURE.md § 10. The three settled decisions` `` D3
  — which is precisely what makes an UNqualified one readable as either.
- **Do not renumber to dodge the collision.** It orphans every existing reference,
  which is the same argument that closed the `A`-numbers and the `R`-numbers rather
  than tidying them. Record the collision in both spaces instead, which is what was
  done.
- **Know which of your instruments is blind to what.** Ask of any green: what class
  of defect could this run not have expressed? Here the answer was "any defect in a
  reference that is not a citation", and that covers every label in the project.

## Bounds

**The collision was PRE-EXISTING and this change doubled it, rather than creating
it.** `D1`–`D5` already meant different things in the two files before any of this,
and nobody had written that down. So the finding is not "an append introduced a
collision" but "a collision existed, was invisible, and appending is what made a
sentence turn on it".

**Not measured: whether the other label spaces already collide.** `S`, `P`, `A` and
`R` were not checked, and the same command would answer it. The claim here is about
`D` only.

**No instrument was built.** A checker for label spaces is a different change and
was not attempted, so this file is the only thing standing between the next append
and the same result — which is exactly the limit
`a-warning-in-one-file-does-not-protect-the-next.md` describes about itself.

Sibling of `a-check-that-never-went-red-was-never-observed.md`'s sixth mechanism,
separated by what the instrument can REACH: there the checker read the artifact and
not what pointed at it, and pointing it at every source fixed it. Here no source
list helps, because the pointer is not a citation and the checker has no concept of
it.
