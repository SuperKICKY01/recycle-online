# The observer is a writer to what it observes

**Applies to** every scan, count, grep or log read whose result you are about to
cite as evidence — hardest when the medium is one your own tooling touches, and
hardest of all when you are checking for contamination, because that check is
itself an action.

**The rule:** a reading is not evidence until you have asked who wrote to the
medium, whether your own query is one of those writes, and whether the corrected
number is even inside the domain a count can occupy. All three, at one moment,
before the number is believed.

**THREE MECHANISMS, and this line is the only place in this file that says how
many.** Every heading below names its own mechanism and never the running total,
so appending a fourth is a one-number edit, here. That convention is not
decoration: [[a-check-that-never-went-red-was-never-observed]] carried its count
in three headings and an index line, all four went stale while the body grew
from four mechanisms to nine, and the index line ended up reading "Six
mechanisms" and "a NINTH mechanism" in one sentence.

Sibling of [[a-check-that-never-went-red-was-never-observed]], and the boundary
between them is the direction of causation. That file is about an instrument
that fails to REACH the medium — an empty needle, an unopened artifact, a
haystack the system returned empty. This one is about an instrument that is
INSIDE it.

## Mechanism 1 — the scan read its own command

A probe captured every PreToolUse hook payload verbatim to disk. A later scan
searched the captured set for the string `model` and found exactly one
occurrence: its own command, captured as a payload while it ran.

The capture excludes nothing. Its whole design is to be complete —

    raw = sys.stdin.buffer.read()
    fn  = "payload_%d_%d.json" % (time.time_ns(), os.getpid())

— and completeness is precisely the property that puts the observer in the data.
The scanning script filtered by filename fragment only; nothing anywhere
excluded the record of the invocation doing the reading.

**The number the incident was first reported with was also wrong**, in a way
worth keeping: it was described as "the only occurrence across 136 payloads",
and the directory held 206 files when it was checked. The capture had kept
running after the reading was taken. A set that grows while you cite its size is
the same defect one layer up.

**The remedy is to exclude your own record BY IDENTITY** — this path, this pid,
this timestamp. Not by content. Dropping every payload whose command contains
`model` would also delete a genuine `model` field carried in a payload that
happens to mention it, which is mechanism 3 arriving as the fix for mechanism 1.

## Mechanism 2 — a third party wrote your action into the medium

Two PreToolUse gates in this repo record every shell command they see, verbatim,
into a log inside the working tree:

- `.claude/settings.json` registers both under `"matcher": "*"`
- `.claude/hooks/pipe_gate.py:237` writes the ALLOW line
- `.claude/hooks/commit_gate.py:199` writes its own
- `.claude/hooks/pipe_gate.py:107` truncates at 200 characters and is the only
  transformation applied

So a repo-wide search puts its own search terms into the repository, and the
searcher performs no write. Measured instance, `.claude/hooks/gate.log:192`: a
`grep -rn "409\|503"` over the mobile tree left `409` in the log three times on
one line. Nobody wrote it there. The gate did, on the searcher's behalf.

**THE PROPERTY THAT MAKES THIS ITS OWN MECHANISM: the correction run is
contaminated too.** Re-running the query to check whether the medium is clean
writes another copy of the token. There is no re-measurement that
decontaminates; the token is spent at first use.

**Measured three generations deep, which is the best evidence in this file.** An
rg experiment ran at `gate.log:211` and `:215`. A later command went looking for
`:211` — and landed at `:216`. The check for contamination contaminated the log
again. Between one reading and the next, with no other cause, the match count
for the probe token moved from **4 to 5**. That is the mechanism as a moving
number rather than as an argument, and it is stronger evidence than the incident
this lesson was first proposed from.

**CLAUSE 1 IS NOT "NAME THE WRITERS". IT IS "NAME THE WRITERS AND THE ACTIONS
THEY FIRE ON",** and that distinction was measured rather than reasoned. A
census of the gate log by tool —

    185  ALLOW Bash
     11  ALLOW commit
      4  ALLOW

— shows the gates log **shell calls only**. No Read, no Grep, no Glob entry
exists. So a read-only agent holding Read/Grep/Glob does not contaminate this
medium at all, and a session holding Bash contaminates it on every call. Whether
you are polluting the thing you are measuring depends on **which tool you picked
up**, which is not a detail and is not visible in the result.

**The remedy is a token the writer cannot have seen** — generated inside the
program under test, or a hash prefix rather than the literal you typed — or a
snapshot of the medium taken before your first query.

## Mechanism 3 — the counter's own text was inside its own input

A counting command whose own text contained the literals it was counting
subtracted its own hits and returned a NEGATIVE count.

*(INCIDENT NOT REPRODUCIBLE FROM THIS REPO. Searched: `grep -c|wc -l|count` over
`.claude/hooks/gate.log`, 13 matching lines, none a self-subtraction; no script
in the searched scratchpad subtracts its own hits. It is written down here
because this is now the only place it exists — the same disclosure
[[a-check-that-never-went-red-was-never-observed]] carries for its own
unrecorded case.)*

**Nothing wrote.** That is what separates it from 1 and 2. The instrument's text
was already inside the input set, because the scope that defined that set
happened to include the command. So the question that catches the first two —
*who wrote to this while I was reading?* — returns "nobody", correctly, and the
reading is still wrong.

**The correction IS the defect.** In 1 and 2, excluding your own record is the
remedy. Here it was attempted and over-removed, because it excluded **by
content** — drop lines containing my needle — which necessarily removes the true
positives that resemble the observer's own record.

**It is the only one of the three that announces itself.** A plausible number is
accepted; a negative count is outside the domain of counting and cannot be
mistaken for an answer. That tells you which of the three you may hope to catch
from the output alone, and — by contrast — that the other two you may not.

**It arrived again, in a different instrument, and this one is in-repo.**
`tools/verify_citations.ps1` resolves a citation by counting how many lines of
the TARGET file contain the handle, and requires exactly one. When the target is
the same file the citation is written in, the citation line contains the handle,
so the count includes the observer and can never be one. The first half of this
mechanism — the instrument's own record already sitting in its input, with no
writer involved — with the over-removing correction absent. A same-file citation
in this repo is therefore not a citation that is broken; it is a citation that
cannot exist, and must be written as prose instead.

## The test, and the single-clause version that failed

The platitude to beat is "be careful your measurement doesn't affect the
result", which names no check and so cannot be run.

**The first attempt was a single clause, and it is kept here because the
falsification is the argument:**

> *Name every writer to the medium you are about to read, and ask whether you are
> one of them. Then re-run with your own record excluded and require the number
> to move.*

| | mechanism 1 | mechanism 2 | mechanism 3 |
|---|---|---|---|
| single clause | **CAUGHT** | MISSED | MISSED |

It misses 2 twice over — a gitignored runtime log is not what anyone means by
"the medium", and the prescribed re-run writes another copy of the token. It
misses 3 entirely: no writer exists, so step one honestly returns nobody, and
step two *is the bug* — the subtraction that over-removed.

**One clause caught one of three. The test is therefore three clauses, run
together, before a reading becomes evidence:**

1. **WRITERS.** Name every writer to the medium, including anything that fires
   on your behalf — a hook, a gate, a shell history, a transcript, a capture —
   **and the actions it fires on.** In this repo that list is not empty and not
   abstract: `.claude/settings.json` `"matcher": "*"`, `pipe_gate.py:237`,
   `commit_gate.py:199`, shell calls only.
2. **BURNT TOKENS.** If a writer you found fires on YOUR query too, you may not
   correct by re-running — a stable or rising count is the *expected* reading of
   a contaminated medium. Snapshot before, or use a token that writer cannot
   have seen.
3. **DOMAIN, AND EXCLUDE BY IDENTITY.** Before reading a corrected count's
   value, assert its domain: `>= 0`, `<= the uncorrected count`, moved by
   exactly the delta you predicted. A value outside it indicts the CORRECTION,
   never the subject. And exclude by identity — this path, this record id, this
   pid — never by content.

| | mechanism 1 | mechanism 2 | mechanism 3 |
|---|---|---|---|
| clause 1 WRITERS | **CAUGHT** | may miss | misses (no writer) |
| clause 2 BURNT TOKENS | — | **CAUGHT** | misses (no re-run) |
| clause 3 DOMAIN / IDENTITY | stops the wrong fix | — | **CAUGHT** twice |

**Each is caught by a different clause. That is the argument for one file**, and
it is not that the remedies are similar — they are three different actions. It
is that a session runs the three together or is unprotected, and a session that
runs clause 1 and stops is exactly the session that ships 2 and 3.

**Residue, stated rather than hidden:** if a session suspects nothing and never
attempts a correction, nothing here fires for mechanism 2. The only thing that
closes that gap is clause 1 being CONCRETE — a named path, not a category —
which is why the wording above names files and line numbers.

## Why it is not one of the neighbours

- **Not [[a-check-that-never-went-red-was-never-observed]] mechanisms 1-2, the
  empty needle.** Those are defined there as vacuously true — no input exists
  that fails them. Every reading here *could* have come out differently; the
  haystack was full and answered honestly.
- **Not its fifth mechanism, the instrument that never read the artifact.** That
  is a scope failure: the checker did not OPEN the file, and its zero is a true
  statement about a smaller set. **The boundary is the direction of causation** —
  there the instrument fails to reach the medium, here it is inside it. Ripgrep
  skipping a gitignored path belongs there, not here.
- **Not its ninth mechanism, the empty haystack.** There the collection came back
  empty *from the system under test*. Here the collection was full and included
  the observer.
- **Not [[a-checker-must-not-share-the-code-it-checks]]**, whose "a measurement
  that returns its own input" is the closest sentence in the corpus and means
  something else: the SUBJECT's property echoed back through a broken needle. The
  subject wrote nothing and the instrument added nothing.
- **Not [[proof-must-run-twice]]'s fourth amendment**, the proof that normalises
  its own fixture. That is a deliberate WRITE performed as setup, contaminating a
  LATER run; its remedy — create the fixture rather than find it — is unavailable
  to a read-only scan contaminating the run it is in.

## The remedy is already in this repo, and no lesson had named it

`server/scripts/build_all_lessons.py` excludes its own output from its own input,
by identity, in the function that gathers sources:

    """Lesson files in ASCII filename order. Excludes the index and our output."""
    ...
    (p for p in lessons_dir.glob("*.md")
     if p.name not in (INDEX_NAME, OUTPUT_NAME)),

`OUTPUT_NAME` is the file the generator writes. Without that clause the generated
concatenation would be an input to its own next generation, growing every run.
The exclusion is by NAME, not by content — clause 3, implemented correctly, years
before anything here was written down.

## How to apply

1. **Before citing any scan, count or log read, run all three clauses.** Not the
   one that seems relevant: a session that runs clause 1 and stops is the one
   that ships mechanisms 2 and 3.
2. **Ask which TOOL you are about to use, not only what you are about to look
   for.** The gates here log shell calls and nothing else, so the same question
   asked through Grep and through Bash contaminates differently.
3. **Exclude by identity, never by content.** A content filter deletes the true
   positives that resemble your own record.
4. **Assert a corrected count's DOMAIN before reading its value** — `>= 0`, `<=`
   the uncorrected count, moved by the predicted delta. An impossible value
   indicts the correction, not the subject.
5. **Treat a probe token as spent once the query is issued.** If anything logs
   your commands, uniqueness is gone and no re-run restores it.
6. **When you must check whether a medium is contaminated, do not check it with
   the tool that contaminates it.** Read the file directly, or take the snapshot
   first.
7. **A citation whose target is its own file cannot resolve.** Write it as prose.
