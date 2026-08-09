# A control must contain the thing that fools the counter

**Applies to** every positive control, every fixture, every hand-built input you
put in front of an instrument before trusting its number — and hardest to a
counter, because a counter returns a plausible integer for almost any input and
never announces which lines it looked at.

**The rule:** a control proves an instrument works ON THE INPUTS THE CONTROL
CONTAINS, and says nothing about any shape it does not. Build the control out of
what the REAL input actually holds, including the parts you were not thinking
about. If the control cannot come out wrong under the mistake you are worried
about, it is not a control for that mistake — it is a control for a mistake you
have already ruled out.

## The instance

Counting the rows of a `restore_db.py` want/got block. The counter:

    grep -c "^  \[" <file>

The control was six lines of exactly the shape being counted, with a blank line
and an unanchored decoy, correct answer **4**:

    [OK  ] alpha        dump=1  restored=1
    [FAIL] beta         dump=2  restored=None
    -- a comment mentioning [OK  ] inline
    [OK  ] gamma        dump=3  restored=3
    (blank)
    [OK  ] delta        dump=4  restored=4

It returned **4**. Anchoring proven, blank-line dropping ruled out, and both of
those conclusions were true. Then the same counter, run against a real restore,
returned **17** where the visible table held **13**.

The real output carries a block the control did not:

    === integrity ===
      [OK  ] database.sql (989 bytes, sha256 verified)
      [OK  ] globals.sql (1225 bytes, sha256 verified)
      [OK  ] recycle.sql (214624 bytes, sha256 verified)
      [OK  ] recycle.sql contains no \connect (safe to retarget)

Four lines, same two-space-then-bracket prefix, different meaning. 13 + 4 = 17.

**The control was not weak. It was about the wrong thing.** Every property it
tested, it tested correctly. It simply contained no line of the shape that
produced the error, so no possible result of running it could have moved.

## The repair, and the shape of the evidence

Put the contaminant IN the control and require the two candidate patterns to
disagree over it:

    [OK  ] database.sql (989 bytes, sha256 verified)          <- contaminant
    [OK  ] recycle.sql contains no \connect (safe to retarget) <- contaminant
    [OK  ] alpha     dump=1  restored=1
    [FAIL] beta      dump=2  restored=None
    [FAIL] gamma     dump=3  restored=MISSING
    -- a comment mentioning [OK  ] and restored= inline
    [OK  ] delta     dump=4  restored=4
    (blank)
    [OK  ] epsilon   dump=5  restored=5

| pattern | control | verdict |
| --- | --- | --- |
| `^  \[` | **7** | wrong — counts both contaminants |
| `^  \[.*restored=` | **5** | correct |

**The evidence is the PAIR, not the green.** A refined pattern returning 5 is
consistent with a pattern that was always right; what establishes anything is the
old pattern returning 7 over the same file. Same discipline as
[[a-gate-that-matches-a-keyword-misses-its-aliases]], which requires ADMITTED
under the old and REFUSED under the new in one table, for the same reason: a
control that only ever sees the fixed version measures the fix's existence, not
its effect.

Note the third line of the rebuilt control, `restored=MISSING`. That shape did not
exist when the counter was first written — it was introduced by a change made
later in the same session. **A control has to be re-opened when the thing it
watches grows a new shape**, which is the same failure with time substituted for
inputs, and is the eighth mechanism of
[[a-check-that-never-went-red-was-never-observed]] — a fixture is an input, and it
is the one input nobody re-reads when it changes.

## How to tell this from an ordinary control gap

Ask what the instrument's real input contains that your control does not, and be
concrete: not "edge cases" but "the four lines of the integrity block". The
question has an answer you can read off the actual output in ten seconds, and it
is the only cheap defence, because the failure produces a number rather than an
error and the number is in the right order of magnitude.

**It is caught by disagreement, not by inspection.** 17 against 13 was noticed
only because a visible table could be counted by eye — thirteen rows are
countable, and had the table held ninety the discrepancy would have shipped. So
where the real answer is not eyeball-checkable, get a SECOND instrument on it: the
same phase counted `COPY` headers with both `grep` and a Python parser and
required them to agree, which they did at 11 and at 13.

## How to apply

1. **Read the real input before writing the control.** Not the shape you have in
   mind — the actual bytes the instrument will meet, including the headers,
   banners and summary lines around the part you care about.
2. **Put the confusable in.** If two blocks of the output share a prefix, the
   control must contain a line from each, or the control cannot tell them apart
   any better than the instrument can.
3. **Require two patterns to DISAGREE over it.** The naive one and the intended
   one, both run on the control, both numbers reported. If they agree, the
   control still does not discriminate and you have learned nothing.
4. **Re-open the control when the watched thing grows a new shape.** A new status
   string, a new row type, a new section — each is a new input, and the control
   silently stops covering the output the day it appears.
5. **Where the true answer cannot be checked by eye, use a second instrument**
   and require agreement. One controlled counter is an instrument; two agreeing
   controlled counters are a measurement.
6. **State the definition beside the number.** "Lines matching `^  \[.*restored=`"
   is a claim someone can refute; "13 rows" is not.
