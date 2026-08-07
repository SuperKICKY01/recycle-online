# A check that has never gone red has not been observed

**Applies to** every assertion, guard, detector and proof cell — and especially
to the instrument you are about to cite as evidence for something else.

**The rule:** every negative assertion needs a POSITIVE CONTROL — a known-true
case, run in the same pass, that makes it fire. A check nobody has watched go red
is a claim about the code, not a measurement of it.

Sibling of [[a-checker-must-not-share-the-code-it-checks]] — that one is about
where the expected value comes FROM; this one is about whether the assertion
could have failed AT ALL, and three of the four cases below share no code with
what they check.

## Four instances, four mechanisms, one symptom

**1. The needle was empty — in the instrument itself.** A verifier written to
confirm `lessons/all-lessons.md` carries no UTF-8 BOM contained:

```python
print(f"starts with UTF-8 BOM : {raw.startswith(b'.'.replace(b'.', b''))}")
```

`b'.'.replace(b'.', b'')` is `b''`, and `startswith(b'')` is **True for every
input that has ever existed**. It printed a confident `True` about a file that
in fact had no BOM — right answer, no measurement, in the one script whose whole
job was to be believed. The sibling line had the same defect: it counted an
escape sequence that the file-writing tool had already converted, so it searched
for text that could not occur.

The fix is the rule, and it is three lines:

```python
BOM_BYTES = bytes([0xEF, 0xBB, 0xBF])   # built numerically: no escape to mangle
assert len(BOM_BYTES) == 3, BOM_BYTES   # the check that the check is real
print(f"contains U+FEFF : {raw.count(BOM_BYTES)}")
print(f"  (control: same count in README.md, known to carry one: "
      f"{(LESSONS / 'README.md').read_bytes().count(BOM_BYTES)})")
```

The control prints **1** for `README.md` and **0** for the generated file. Only
the first number makes the second one mean anything. Without it, `0` is
indistinguishable from a detector that cannot detect.

**2. The needle was empty, in a language with no types to save you.** A
CR-counting check ran `grep -c $'\r'` inside a `for` loop. `$'\r'` reached grep
as an EMPTY pattern; an empty pattern matches every line; the count came back
equal to each file's line count and was read as a CR count. Every file "had CRs".
*(Observed at this terminal and not recorded anywhere in this repo — there is no
`.sh` file and `git log -S "grep -c"` finds nothing. It is written down here
because this is now the only place it exists.)*

**3. The failing case was never reachable, because the input was a literal.**
`mobile/src/proof/proveSignOut.ts:137-152` proves the send queue blocks a
sign-out:

```ts
const outcome = await signOut({
  pending: 3, failed: 0, setSyncPaused: (p) => { paused = p; },
  tokens, engine: null,
});
check("the sign-out is refused", outcome.kind === "refused_pending", outcome.kind);
```

`pending: 3` is a number handed in, and `engine: null` means there is nothing
present that could ever drain it. The cell is true and it proves the gate refuses
**a number** — never that the number is unclearable, which is the only state in
which the refusal is a trap rather than a wait. A green here is silent about the
case where waiting cannot work.

**And this file already knows the rule, twelve lines further down**, applied to
its neighbour and not to this cell:

> The count must come FROM the input. `includes("3")` passed on any sentence
> holding that digit; a sentence with the count baked into it would still
> satisfy the check above. A second, different count cannot be hardcoded.

— followed by a second call with `pending: 7` asserting `7 ใบ`. That is a textbook
positive control, written deliberately, three lines from a cell that has none.
**A control on one assertion says nothing about the one beside it.**

**4. The mutation never reached the assertion.** Eight expected values in
`proveSignOut.ts` were substituted in `CLEARED_SESSION`, one per run, to
wrong-but-plausible values, to find out which cells could fire. Every single one
was a COMPILE error — `TS2322` at `signOut.ts`, *"Type 'true' is not assignable
to type 'false'"*. The build stopped; the proof never ran; not one of the eight
cells was observed doing anything. The literal types are a real guarantee and a
valuable one — but they are a DIFFERENT guarantee, and the mutation test
returned no information about the runtime checks at all. **A disproof that is
intercepted upstream has not been performed.**

## What the four have in common

| | why it could not go red |
|---|---|
| 1, 2 | the assertion is vacuously true — no input exists that fails it |
| 3 | the failing state is unreachable from the inputs the test supplies |
| 4 | the deliberate break was stopped before the assertion ran |

Different mechanisms, one consequence: **a green cell that carries no
information, sitting in a report read as though it did.** That is worse than a
missing test, because a missing test is visible in the count and this is not.

## How to apply

1. **Before citing any check as evidence, make it fail once on purpose.** Keep
   the red output. If you cannot make it fail, you have not found a bug in your
   mutation — you have found that the check is not a check.
2. **Every detector gets a positive control in the same run**, over a case known
   to be true. Print both numbers side by side. `0 violations` means nothing;
   `0 here, 1 in the known-bad case` means something.
3. **Build needles numerically, not from escapes** — `bytes([0xEF,0xBB,0xBF])`,
   `chr(0xFEFF)` — and assert their length. Every layer between you and the file
   (shell, editor, tool) is entitled to rewrite an escape, and a mangled needle
   fails silently toward green.
4. **When you mutate to test, verify the mutation REACHED the assertion.** A
   compile error, a build step, a validation layer or a type can all consume it
   first. The observable is the check running and printing red, not the run
   failing somehow.
5. **Never generalise a control across neighbours.** Instance 3 is the whole
   argument: the author who wrote the control knew the principle, and the cell
   above it still cannot fail.

This is the passing-result twin of
[[a-defaulted-getattr-is-a-silent-dead-branch]] — there, a production branch no
test was ever seen to ENTER; here, an assertion no run was ever seen to REDDEN.
Same question in both: *what would have made this different?* And it sits beside
[[proof-must-run-twice]] and [[concurrency-tests-need-a-barrier]], which are the
same family: **a passing result is evidence only if you know what would have made
it fail.**

## AMENDED (2026-08-07): a fifth mechanism — the instrument never read the artifact

The four above share one shape: a check that **could not fail given its inputs**.
This one is different, and it is worse, because the check is real, it can fail,
and it has been watched failing. **It was pointed at a different file.**

`tools/verify_citations.ps1` resolves every citation in a document and exits 1 if
any is broken. It works — it has a positive control, it has been observed going
red, and its own header records the false green it was hardened against. But its
subject was one hardcoded line:

```powershell
$src = Join-Path $root 'START_HERE.md'   # the only file it would ever open
```

`ARCHITECTURE.md` was then written, carrying **37 citations in exactly the form
this script exists to verify**, and the phase brief named "`verify_citations.ps1`
bare, exit 0" as the observable FOR THOSE CITATIONS. It exited 0. **It had not
opened the file.**

**Why this is the sharpest instance in the file: the green was structurally
incapable of ever turning red.** Mechanisms 1–4 each describe a check that some
input could still move. Here none can. Every citation in `ARCHITECTURE.md` could
be broken, the file could be deleted, and `CITATIONS=37 BROKEN=0` would print
unchanged, because the number was about a different document. **No control inside
the run can catch this**: the sections control asserts the parser saw every
sectioned citation *in the file it read*, and it was correct and green throughout.

**Measured, not reasoned.** The same rules ported to a second instrument and
pointed at `ARCHITECTURE.md` returned **BROKEN=8** at the same moment, on the same
tree, that the committed one returned **BROKEN=0**. Seven were real: six citations
line-wrapped by the writing — a handle split across two source lines is a string
that exists on no line of its target — and one whose TARGET's own prose wraps, so
no handle spanning it could ever resolve. All seven would have shipped under the
green.

*(The eighth was the second instrument's own defect, and it is mechanism 1 again:
it read `lessons/README.md` as plain UTF-8, leaving the BOM in front of the
`# Lessons` heading so the `^#` anchor missed and a VALID citation reported
BROKEN. A second instrument built to check the first needs its own controls.)*

**The disproof that finds this mechanism is one question, and it is not "does it
pass".** Everything in this file passes. It is: **break the artifact on purpose
and watch whether the number moves.** If deliberately breaking the thing you
believe is under test cannot change the output, the output was never about it.
Two minutes, and it is the only test that separates a checker which agrees with
you from a checker which is looking somewhere else.

### Two more, appended to How to apply

6. **An instrument's SCOPE is part of its result, and only its source list states
   it.** A checker's NAME says what it is for; the paths it OPENS say what it
   actually covers, and only the second is true. Read them before quoting an exit
   code — hardest when the artifact is NEW, because a checker written before your
   file existed cannot know about it and will not say so.
7. **Prefer a checker that takes its subject as an argument** over one that
   hardcodes it, and **assert a NON-ZERO count per subject**. A hardcoded source
   silently excludes every file added after it; an argument makes the omission
   something a person has to type. Without the non-zero assertion, "nothing was
   checked" and "nothing is wrong" print the same line.

**And the trap this sets for a reviewer, which is why it belongs here and not in
a note about tooling:** the brief ORDERED the green, the green was produced, and
**it was true**. That exit code really was 0 and really did mean `START_HERE.md`'s
citations resolve. Nothing was faked and nobody was careless; the report would
have been accurate in every word it contained. **A true statement about the wrong
object is the hardest false assurance to see**, because there is no error to
notice and the number is real.

Sibling of [[a-checker-must-not-share-the-code-it-checks]] one step further out:
that one asks where the expected value came FROM, this one asks what the INPUT
was. And it is [[two-green-proofs-do-not-cover-the-seam]] pointed at instruments
rather than components — there, no proof file owned the seam; here, no checker
owned the new file, and in both cases the thing nobody owns is the thing nobody
measures.

## AMENDED AGAIN (2026-08-07): a sixth mechanism — the instrument never read what POINTS AT the artifact

The fifth is *the instrument never read the artifact*. This is its **inverse, and
it is harder to see**: the instrument DID read the artifact, opened it, parsed
every citation in it, ran both controls over it and reported it clean — **and the
report was true.** What it never read was the file pointing AT it.

**The instance.** `ROADMAP.md` was REPLACED rather than amended. The old file
carried a heading `## What next, and why that`; the new one did not. `ARCHITECTURE.md`
line 11 carries a section-only citation, `` `ROADMAP.md § What next, and why that` ``,
naming the file's role in the document map. **Deleting a heading from the file you
are editing breaks a citation that lives in a file you are not**, and nothing in
the edited file records that anyone was depending on it.

**MEASURED, and the measurement is the whole amendment.** The break was found once
by accident and then reproduced deliberately, by re-deleting the same heading on
the same tree:

| run | exit | what it said |
|---|---|---|
| `-Source ROADMAP.md` | **0** | `CITATIONS=56 BROKEN=0`, **both controls OK** |
| `-Source START_HERE.md,ARCHITECTURE.md,ROADMAP.md` | **1** | the break prints under `=== SOURCE: ARCHITECTURE.md ===` — `22 BROKEN ROADMAP.md sect=What next, and why that hits=0 (section-only)` — while `ROADMAP.md` reports `BROKEN=0` **in the same run** |

Reverted; `sha256` `f23dea1b…f456e3` identical before and after; all three sources
then green, `SOURCES=3 CITATIONS=130 BROKEN=0`.

**The first row is the finding.** A person who has just rewritten a file and wants
to know whether they broke anything will scope the checker to that file — it is the
obvious thing to type, and the citations they are anxious about are their own
outbound ones. They would have been told `BROKEN=0`, with both positive controls
holding, about a repository they had just broken.

**Why it is not the fifth mechanism restated.** There, the damaged file was the
SUBJECT of the change and was simply absent from the source list. Here the changed
file is present, is read, and is genuinely clean. **The direction of the pointer is
what hides it**: a citation is WRITTEN in the citing file and LIVES OR DIES on a
heading in the cited one, so the damage propagates *opposite* to the edit. Every
tool that answers "is this file OK" is scoped the wrong way round for it, and the
answer it gives is not wrong — it is about the wrong file.

**This generalises past citations. A heading is an interface**, and so is a file
path, an anchor, an exported name, a handle. Any cross-file reference has this
shape, and it is why "I only touched one file" is never an argument about blast
radius.

### The tool makes this easy to get wrong, and this is the SECOND session to hit it

Said plainly rather than left as a lesson about care:

- **`verify_citations.ps1`'s default `-Source` is `@('START_HERE.md','ARCHITECTURE.md')`
  and is now STALE.** `ROADMAP.md` carries 56 citations and the default will never
  open it. Run with no arguments after editing `ROADMAP.md` and you check two files,
  neither of which is the one you changed, and exit 0. The header already says *"if
  you add a document that cites, ADD IT TO `$Source`"* — that is an edit to the
  script, and a phase constrained to one modified file cannot make it, so the full
  source list has to be typed by hand every time and nothing enforces that.
- **The default is wrong in both directions at once**, which is why it is worth a
  paragraph: it omits the newly written file (missing every OUTBOUND break) and it
  happens to include `ARCHITECTURE.md` (catching this INBOUND one) — the second by
  luck rather than design, because `ARCHITECTURE.md` was added to the default for an
  unrelated reason.
- **`powershell -File script.ps1 -Source A,B,C` does not work**: `-File` binds
  `A,B,C` as a single string, and the script reports `SOURCE MISSING: …A,B,C` and
  exits 1. Harmless because it is red, but it pushes the next person toward the
  bare default, which is the failure above. Invoke the script directly
  (`& .\tools\verify_citations.ps1 -Source A,B,C`) so `[string[]]` binds.

### Two more, appended to How to apply

8. **Run a citation checker over EVERY source, never over the file you are
   editing.** The file you edited is the one place an inbound break cannot appear,
   so scoping to it is the single most dangerous scope available — it is the same
   number the fifth mechanism produced, arrived at from the other side. If you can
   only afford one run, run the whole set; there is no cheaper subset that is safe.
9. **Before deleting or renaming a heading, grep for it across the repository.**
   One command, and it is the only thing that turns "a section I removed" into "a
   contract I broke". Replacing a document entirely is the maximum-risk form of
   this, because every heading it had is deleted at once and the diff shows only
   additions in the file you were looking at.

**The trap it sets is the fifth's trap wearing the opposite face.** There, the
brief ordered a green and got a true statement about the wrong object. Here, the
brief's green is a true statement about the RIGHT object — `ROADMAP.md`'s citations
really do all resolve — and it is still a false assurance, because the question
being asked was "did I break the repository" and the instrument answered "is this
file internally consistent". **Two different questions with the same exit code.**

---

## A SEVENTH MECHANISM (P1.4, 2026-08-07) — the guard is reachable, but a SIBLING GUARD gets there first

The second mechanism is "the failing state is unreachable from the inputs
supplied", and its remedy is to supply better inputs. **This one cannot be fixed
that way, because no input exists.** The state is unreachable through every path
the product has, and it is another correct guard that makes it so.

**The shape.** `POST /users/{id}/deactivate` locks an account and bumps
`token_version` in the SAME `UPDATE` — deliberately, so a lock has no window in
which the sessions it should have ended are still live. `get_principal` then holds
two independent guards:

    _require_active_account(row["is_active"])          # is this account usable
    _require_live_session(token_version, row["..."])   # is this token current

After a lock, **both are true of every token in existence**. Put the account check
second and it can never fire: the version check refuses first, every time, and no
request can be constructed that reaches the account check — because minting a
token for a locked account requires a login, and login refuses one. A guard in
that position is not weakly tested. It is **untestable**, and deleting it changes
nothing observable at all.

**MEASURED, not reasoned.** Ordered FIRST, the guard deleted (mutation B, against
a restored scratch database): `prove_revocation.py` exit 1, and **exactly two
cells fired — both the ones reading `code`.** Sitting immediately beside them,
GREEN:

    [FAIL] case7: the refusal names the ACCOUNT (account_inactive), not the token
    [FAIL] case7: the refused bill create names the account, not the token
    [OK  ] case7: the token held before the lock is refused
    [OK  ] case7: a locked account cannot reach the money path

The request is **still 401**. It falls through to the version check and comes back
`token_revoked` instead of `account_inactive`. **A proof asserting only the status
would have been fully green with the guard deleted** — 57 of 57, nothing to see.

**Two rules, and the second is the one that generalises.**

10. **When two guards can both be true of the same request, ORDER the one that
    names the durable fact first** — and know that you have thereby made the
    other one's green partly uninformative for that input. Ordering is not
    cosmetic here; it decides which guard is observable at all.
11. **Assert on the field that DISCRIMINATES, not the field they share.** Both
    guards answer 401; only `code` says which one answered. Ask of every
    assertion: *if I deleted the thing this is supposed to be watching, would
    this cell move?* Where two mechanisms produce an identical outcome, the
    shared outcome is not evidence about either.

**Why it is not redundancy.** The guard still earns its place — it is what
refuses if any future path mints a token for a locked account (a bump made
conditional, a password reset, an onboarding tool). But its value is
FORWARD-LOOKING, and a forward-looking guard is exactly the kind whose green
nobody checks. Say so at the site, in the code, or the next reader will delete it
as dead and every test will agree with them.

**The family.** The fifth and sixth mechanisms are about an instrument reading
the wrong artifact. This one is about an instrument reading the right artifact
through the wrong FIELD — the observation was available, one key away, and the
obvious assertion could not see it.

---

## AN EIGHTH MECHANISM (P1.10, 2026-08-07) — the stimulus stopped arriving, and NOBODY EDITED ANYTHING

The second mechanism is *"the failing state is unreachable from the inputs
supplied"*, and every instance of it above is about the inputs' VALUES: a literal
`pending: 3`, an empty needle, a mutation the compiler ate. **This is the same
sentence with TIMING substituted for values** — and it has one property none of
the other seven has. **It arrived with no edit at all.** Nobody touched the proof.
The proof stopped proving.

**The shape.** `prove_reconcile.py`'s X3 probe asserts that a row landing WHILE
the checker sweeps is reported rather than absorbed. To land the row inside that
window it watches the checker's own stdout for a marker and inserts the moment it
sees one:

```python
if not injected and b"=== structure" in line:
    await conn.execute("INSERT INTO tenants (id, name) VALUES ($1, 'x3 probe')", tid)
```

Python **block-buffers a non-tty stdout at 8192 bytes**. Measured 2026-08-07: the
checker's entire report over the 2-tenant database is **5364 bytes**, with the
marker at byte **253**. Nothing reaches the pipe until the child exits. The marker
therefore arrives after the sweep is over, the row lands outside the window, X3
correctly reports no drift — and the probe has stopped probing **while still
printing `inserted tenant … mid-run`**.

**It was green on 2026-08-02, honestly, and red on 2026-08-03.** The green was
real: the row genuinely did land mid-sweep, and the report said
`rows_at_start=46 rows_at_end=47`. What changed on 2026-08-03 was that the
database was rebuilt from 46 tenants to 2. *(That the 46-tenant report ran to
several buffers is inference from the measured 5364 — each tenant prints its own
scope block — and it cannot be re-measured, because that database was replaced.)*
**No assertion changed, no code changed, no test was edited.** The fixture shrank,
and the stimulus the assertion depended on stopped being delivered.

**Why it hid, and this part is not incidental.** It failed inside a proof that was
ALREADY RED for three unrelated reasons — three hardcoded counts of the destroyed
database — and it wore the same label they did. Four failing cells, three of one
kind and one of another, recorded in two documents for four days as *"the two
tenant-count assertions and the X3 timing probe"*. Nothing in the output separates
"this expectation is stale" from "this probe never fired": both are a red cell
under one heading. **A failure that resembles the failures beside it does not get
investigated separately** — and the repair everyone had written down (derive the
three counts) would have left this one red, because it had no count to derive.

**MEASURED, with the prediction written first.** The mechanism was named before it
was tested, and the test required editing nothing at all:

| run | change | result |
|---|---|---|
| baseline | none | 4 failing cells, X3 reporting `got {}` |
| disproof | `PYTHONUNBUFFERED=1` on the parent, inherited by the child | **3 failing cells** — `X3: a row landing mid-run is reported` GREEN, the other three unmoved |

One cell moved, exactly the predicted one; three stayed red. The fix is `-u` on the
child's **argv** rather than in the environment, because an argument cannot be
dropped by whoever launches the script, and it changes WHEN bytes arrive and
nothing about what the checker computes. On the repaired file, removing `-u` again
reproduces `got {}` while every neighbouring cell stays green.

### Two more, appended to How to apply

12. **A test that synchronises by OBSERVING the thing under test has an unwritten
    dependency on how much output that thing produces.** Watching for a marker in
    a child's stdout, waiting on a log line, polling until a file appears — each
    ties the assertion's reachability to a volume nobody declared and no fixture
    guarantees. Ask of any such probe: *what does the fixture have to be for this
    to still land?* Write the answer beside it. It is part of the test's contract
    and it exists in no other place.
13. **Prefer a synchronisation point the test CONTROLS over one it merely
    watches.** Where you cannot have one — the marker here is genuinely the
    earliest SAFE point, since anything sooner risks the row landing before the
    window opens, which would be a silent false negative — make the residual fail
    CLOSED and say so at the site: if the row lands late, X3 does not fire and the
    cell is RED. Never green.

**The question this adds, which the other seven do not ask.** Instances 1–4 ask
*could this assertion have failed given the inputs I supplied?* and 5–7 ask *was it
looking at the right thing?*. This one asks: **does this assertion still reach its
failing state on TODAY's fixture?** That is not a property of the test. It is a
property of the test and the data TOGETHER — so it can lapse with no diff, and no
review of the change that broke it will ever show it, because there was no change
to review.

**A fixture is an input.** Everything in this file about inputs applies to it, and
a fixture is the one input nobody re-reads when it changes size. Sibling of
[[proof-must-run-twice]], which is about a fixture a proof normalises for itself;
this is about a fixture the whole team replaced on purpose, correctly, with a
consequence nobody could see from the commit.
