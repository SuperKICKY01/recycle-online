# A check that has never gone red has not been observed

**Applies to** every assertion, guard, detector and proof cell — and especially
to the instrument you are about to cite as evidence for something else.

**The rule:** every negative assertion needs a POSITIVE CONTROL — a known-true
case, run in the same pass, that makes it fire. A check nobody has watched go red
is a claim about the code, not a measurement of it.

**FIFTEEN MECHANISMS, and this line is the ONLY place in this file that says how
many.** Every heading below names its own mechanism and never the running total,
so appending another is a one-number edit, here. This line exists because the
count used to live in three headings and in this file's index line, and all four
went stale together while the body grew from four to nine — the index line ended
up reading "Six mechanisms" and "a NINTH mechanism" in one sentence.

Sibling of [[a-checker-must-not-share-the-code-it-checks]] — that one is about
where the expected value comes FROM; this one is about whether the assertion
could have failed AT ALL. Of the first four cases below, three share no code
with what they check.

## The first four instances — four mechanisms, one symptom

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

## What the first four have in common

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

---

## A NINTH MECHANISM (2026-08-07) — the needle was fine and the HAYSTACK was empty

Mechanisms 1 and 2 are *the needle was empty* — a defect in how the instrument
built its own search term, fixable by building the needle better. **This is the
same vacuity arriving from the opposite end, and no care taken over the assertion
can prevent it**: the needle is correct, the comparison is correct, and the
COLLECTION being searched came back empty from the system under test.

**The shape.** A cell asserting that something is ABSENT from a collection parsed
out of a response:

```python
b_ids = {u.get("user_id") for u in body_of(r_b_roster).get("users", [])}
check(listed_staff_id is not None and listed_staff_id not in b_ids,
      "tenant A's staff is ABSENT from tenant B's roster")
```

`x not in set()` is true for every `x` that has ever existed. So is `x not in
{something wrong}`. **Absence and correctness are indistinguishable whenever the
response is empty — and also whenever it is uniformly wrong.**

### Two instances, measured on the same day, and the second is the one that decides it

**Instance 1 — the collection was empty because the response was an ERROR.**
`prove_revocation.py` CASE 5 has tenant B's admin revoke ITSELF, deliberately, to
prove self-revocation ends the caller's own session; CASE 6 then mints a fresh
token. A new CASE 6b used the OLD token. `GET /users` answered **401**,
`.get("users", [])` turned that into `[]`, and the isolation cell printed `[OK]`
over a response containing no roster at all.

**Instance 2 — the collection was full, and every value in it was wrong.** A
mutation resolved the roster's `user_id` from `tenant_id`, so tenant A's ids all
came back `1111…` and tenant B's all came back `2222…`. The same cell passed
again — this time because **two WRONG values happened to differ.** The property
it names, tenant isolation, had nothing to do with it.

| | status cell | the ABSENCE cell | the positive control |
|---|---|---|---|
| instance 1 — 401, empty list | **RED** | green, vacuously | **RED** |
| instance 2 — 200, every id wrong | green | green, **by accident** | **RED** |

**Instance 2 is why this is a mechanism and not a note about token hygiene.** In
instance 1 the status assertion also fired, so the run was going red anyway — but
it fires under the wrong NAME, saying "B's admin did not get a 200" rather than
"your isolation cell measured nothing". In instance 2 the status cell is green,
the absence cell is green, and **the positive control is the only red in the
file.** Nothing else available could have substituted for it.

### Why it is not one of the eight, and why it is not the differential lesson

Not mechanisms 1–2: the needle is well built and the assertion is capable of
failing. What is empty is supplied by the system under test, through an error
path, at runtime.

Not mechanism 3: the failing state is perfectly reachable — a genuine isolation
break puts A's id in B's roster and the cell fires correctly. It is reachable and
it was not reached, because a *different* failure got there first and satisfied
the assertion on the way past.

**And deliberately NOT filed under
[[a-differential-control-is-only-as-good-as-its-weaker-side]], which is the near
miss and the reason this section says so out loud.** That lesson is about a
comparison one of whose operands *the proof supplies itself*, and its remedy is to
derive both sides from the real path. **Here the proof supplied neither.** Both
operands were read off live responses; that discipline was followed exactly, and
it did not help. What that file asks — *could this assertion have come out the
other way, given the inputs I supplied?* — is necessary and **not sufficient**:
in instance 2 it could have, and it came out the right way for the wrong reason.
The question this adds is the follow-on: **if it came out right, was it right for
the reason it names?**

### Two more, appended to How to apply

14. **An assertion that something is ABSENT needs a sibling asserting something
    is PRESENT — in the SAME RESPONSE, not merely in the same run.** The failure
    mode is that response being empty, refused or uniformly wrong, and a control
    read from any other response cannot see it. One extra line: assert that the
    collection contains the thing it *should* contain, then that it lacks the
    thing it should lack. Neither half is worth much alone.
15. **Before asserting over a collection parsed from a response, assert the
    response.** `body_of(r).get("users", [])` flattens 401, 403, 404, 500 and an
    unparseable body into the same empty list, and every "is not in" over an empty
    list is true. A defaulted empty collection is
    [[a-defaulted-getattr-is-a-silent-dead-branch]] one layer out — an absent
    value read as a confident answer — and it fails toward green.

**The family.** Mechanisms 1–4 ask *could this have failed given my inputs?*, 5–7
*was it looking at the right thing?*, 8 *does it still reach its failing state on
today's fixture?*. This one asks the question that survives a yes to all four:
**how many DIFFERENT states satisfy this assertion, and is "the code is correct"
the only interesting one?** Every negative assertion — absent, not equal, not
present, zero, empty — has a large satisfying family, and the members of it that
are silent breakage are exactly the ones a proof will never think to supply.

---

## A TENTH MECHANISM (P1.8a, 2026-08-17) — BOTH SIDES OF A CROSS-CHECK CAME FROM THE SAME FAILED OPERATION, AND AGREED

The ninth is *the needle was fine and the haystack was empty*, and it is about a
NEGATIVE assertion over a collection. **This is a POSITIVE assertion between two
scalars, and it is the strongest cell in the file.** It compares a value read off
the response against the same value read back out of Postgres — the cross-check a
phase brief explicitly ordered, in these words:

> Read back OUT OF POSTGRES, not off the response — a response echoing your own
> input proves nothing about what was stored.

That instruction is correct. It was followed. **And the resulting cell is
satisfied by the request never having been served.**

**The shape.**

```python
r1 = client.post(f"{BASE}/sellers", headers=auth(token_staff), json=body1)
b1 = body_of(r1) if r1.status_code == 201 else {}
assigned = b1.get("code")
check(stored_code(b1.get("id")) == assigned,
      "cell1: and Postgres stores that same code for the new row")
```

Under the disproof — `POST /sellers` put back behind `require_admin` — the create
is refused 403. `assigned` is `None`, because there is no body. `stored_code(None)`
is `None`, because there is no id to look up. **`None == None` printed `[ok]`,
directly beneath three cells that had just gone RED**, in the one run whose entire
job was to find out which cells can move.

| cell 1's four checks, under the reverted gate | |
|---|---|
| status is 201 | **RED** — got 403 |
| the response carries a code of the shape S\<n\> | **RED** — `None` |
| the assigned number is the one after the highest that existed | **RED** — `None` |
| **and Postgres stores that same code for the new row** | **green** |

Three of four moved, so the run went red and the disproof looked successful. **The
fourth is the one that mattered**, because it is the only cell in that group that
reads the database at all, and it is the cell a reviewer would point at when asking
whether the write really happened.

### Why it is none of the nine

**Not the ninth.** Neither operand is a collection, neither assertion is negative,
and nothing was defaulted to `[]`. Two scalars are compared and they are equal.

**Not [[a-differential-control-is-only-as-good-as-its-weaker-side]]**, and this is
the near miss worth stating out loud. That lesson is about one operand being a
LITERAL — the relation true by construction. Here NEITHER side is a literal: both
were derived from the real path, which is exactly the remedy that file prescribes,
and it did not help. **What makes them agree is that they are derived from the SAME
EVENT.** When the event does not happen, both derivations return the same null, and
a comparison between two nulls is the most convincing green available.

**The generalisation, and it is uncomfortable in the same way the fifth mechanism
is: the BETTER the cross-check, the more exposed it is to this.** A weak cell
asserts the response against a value the script typed, and a wrong response cannot
match it. A strong cell asserts two INDEPENDENT observations of one write against
each other — and independence is precisely what makes them share a failure mode:
both observers are observing the same absence, and absence is self-consistent.

### And the disproof did not finish, which is the second half

The same run died at cell 5 on `uuid.UUID(None)` — `seller2_id` was `None` for the
same reason. **Cells 6 and 7 never ran, and no `PROVE_SELLER_CREATE_EXIT` line was
printed at all**, which is the absence `CLAUDE.md § Machine footguns` already names
as the signal for a failed restore.

The fourth mechanism is *the deliberate break was stopped BEFORE the assertion ran*
— a compile error, upstream. **This is that sentence pointed downstream.** The
break reached the assertions, three of them fired correctly, and then the
instrument died on the null the mutation had produced. A crash and a red suite are
different results and only one of them is a measurement: a disproof exists to say
WHICH cells move, and this one had nothing to say about the two behind the crash.

Both halves have one cause. **A proof is written along its GREEN path**, where
every id is a string, every body parses and every response is 201 — and the
disproof is the first time any of that is false. Everything the script does with a
response is therefore untested at exactly the moment it matters most.

### Two more, appended to How to apply

16. **A cross-check between two readings of one write must assert, IN THE SAME
    CELL, that the write happened.** `a == b` where both are derived from one
    operation is satisfied when the operation did not occur. The fix is one
    conjunct on the same line — `assigned is not None and stored_code(id) ==
    assigned` — never a separate cell above it, because *a control on one
    assertion says nothing about the one beside it* is this file's oldest rule and
    a status cell three lines up did not stop this. Print both operands in the
    label: `db=None response=None` is unmistakable and `[ok]` is not.
17. **A disproof must reach the last cell, and getting there is a property of the
    proof you have to build on purpose.** Every id, uuid, parse and index on the
    failure path is a crash waiting for the run that matters. Make each one return
    a value that can be absent, make the absence a RED cell rather than an
    exception, and give any cell whose target came from an earlier cell a fixture
    that exists independently — here a sentinel row written before the server
    started, so cells 4–7 kept measuring the gate while 1–3 were refused. Then
    judge the disproof by whether it printed its exit line, not by whether it
    failed.

**The question this adds.** Mechanisms 1–4 ask *could this have failed given my
inputs?*, 5–7 *was it looking at the right thing?*, 8 *does it still reach its
failing state on today's fixture?*, 9 *how many different states satisfy this?*.
This one asks: **when the thing under test does nothing at all, what does each
side of my comparison become — and do those two nothings look the same?**

---

## AN ELEVENTH MECHANISM (P1.8a, 2026-08-17) — THE CHECK WENT RED, AND RED IS NOT ONE STATE

Every mechanism above is a GREEN that carries no information. **This one is a RED
that carries the WRONG information**, and it belongs in this file rather than in
a note about tooling because it is the same defect on the other side of the exit
code. This file's rule is *a passing result is evidence only if you know what
would have made it fail*. Its corollary, which nothing above states, is that **a
failing result is actionable only if you know WHICH of several conditions
produced it.**

**The shape.** `tools/verify_citations.ps1` reads a citation as a backticked
`file § section` followed by a quoted handle, and requires that handle to occur
in the target **exactly once**. It prints the same word for `hits=0` and for
`hits=2`:

```
19  BROKEN  lessons/README.md  sect=Lessons
    handle="a-checker-must-not-share-the-code-it-checks.md"  hits=2 L19,L42
```

**Those two conditions have OPPOSITE REPAIRS.** `hits=0` means the target is
missing — go and write it, or correct the path. `hits=2` means the target is
AMBIGUOUS — the thing pointed at exists twice, and it is the CITING file that
must change. A reader scanning that column for `BROKEN`, which is what the eye
reads, goes looking for a file that is not missing. `hits=N` is the only thing
separating them, and it sits at the end of the line after the handle.

This is the SEVENTH mechanism's rule turned on an instrument's OUTPUT instead of
on a proof cell: *where two mechanisms produce an identical outcome, the shared
outcome is not evidence about either*. There, two guards both answered 401 and
the discriminating field was `code`. Here, two conditions both answer `BROKEN`
and the discriminating field is `hits`.

### Why the handle was ambiguous BY CONSTRUCTION, not by carelessness

The handle was a lesson's FILENAME. In `lessons/README.md` a lesson's filename
appears **twice by design**: once at the head of its own index line, and again
inside another lesson's index line wherever that lesson cross-references it.
`a-checker-must-not-share-the-code-it-checks.md` is at L19, its own entry, and at
L42 inside `a-differential-control-is-only-as-good-as-its-weaker-side.md`'s.
**A filename handle is therefore ambiguous the moment any other lesson mentions
the file — and mentioning each other is what these index lines are FOR.**

**MEASURED 2026-08-17, and the measurement is what turns this from a typo into a
class.** Tool: ripgrep over `*.md`, pattern
`` `lessons/README\.md § Lessons`\s+"[^"]+\.md" `` — a backticked citation into
that file followed by a quoted handle ending `.md`:

| | count |
|---|---|
| citation sites using a FILENAME as the handle | **27**, across 6 files |
| distinct lesson filenames used that way | **16** |
| of those 16, resolving at exactly 1 today | **16 — none is broken now** |

**CONTROL, in the same run, because a count with no control is a count nobody
watched fire:** the handle repaired here comes back at **2** occurrences,
matching the checker's own `hits=2`, which is what says the script is reading
what the checker read; and the replacement handle comes back at **1**. Without
the first number the sixteen zeros mean nothing.

**The broader pattern — a backtick, whitespace, any quoted `.md` — returns the
same 27 across the same 6 files, so every filename-handle citation in this tree
targets `lessons/README.md`.** A second pattern allowing ANY handle into that
file returns **31**, so 27 of 31 citations into the lesson index name a filename.
The two patterns disagreeing by exactly the four non-filename handles is the
evidence that the narrow one discriminates rather than matching everything.

### TWO FAILURE PATHS, and only one of them has been observed

**BORN BROKEN — this is the one that was measured.** A citation is WRITTEN naming
a filename that ALREADY occurs more than once. It is red on its first run, which
is the safe direction; the cost is only that the word sent the author looking for
a missing target. That is what happened at `55b58e9`: the citation was never
valid, not made invalid.

**BECOMES BROKEN LATER — inferred from the mechanism, and never yet seen.** A
citation names a filename occurring once, and a future lesson cross-references
that filename in its index line. The citation breaks **with neither endpoint
edited**: not the citing file, not the cited section, not the handle. Twenty-seven
sites and sixteen distinct handles sit one cross-reference away from it. **Nobody
has observed this happen, and it is written here as a prediction rather than as a
finding**, which is the distinction the ninth mechanism's two instances turn on.

**Why it is not the SIXTH mechanism restated.** That one is damage propagating
*opposite* to the edit — you DELETE a heading in the file you are editing and
break a citation in a file you are not. Its remedy, rule 9 above, is *before
deleting or renaming a heading, grep for it*. This propagates the same way and
**arrives from an ADDITION, in a THIRD file that is neither endpoint**. Rule 9 is
silent about additions, and there is nothing to grep for at the moment of the
edit: the person adding a cross-reference is writing prose about lessons, not
touching anything anybody cites.

**And it shares the EIGHTH mechanism's worst property** — it can arrive with no
diff to review — while differing in what moves. There a fixture SHRANK and a
stimulus stopped being delivered; here a namespace GROWS and a handle stops being
unique. Both are properties of the check and the data together, and neither is
visible in the commit that causes it.

### The repair, so it is reproducible

**Use a distinctive phrase from the target's own index line, never its filename**,
and confirm it occurs exactly once BEFORE writing it. The repair here was
`"DUPLICATE ARITHMETIC"`, measured at 1 occurrence before the citation was
written. A phrase from the index line's own prose cannot be duplicated by another
lesson mentioning the file, because what other lessons write is the FILENAME.

**The residual, stated: one of the twenty-seven is in a file no run opens.**
`server/README.md` carries one such citation and appears in no `-Source` list used
in this repository, so its state is not measured by any check that runs here —
the FIFTH mechanism, still live, in the same instrument this amendment is about.

### Two more, appended to How to apply

18. **When an instrument reports one word for two conditions, read the
    discriminating field before acting on the word.** `BROKEN` covers missing and
    ambiguous; `0 violations` covers clean and never-looked; a non-zero exit
    covers the check failing and the harness failing. Ask of any red: *how many
    different states print this, and which one am I looking at?* — the same
    question the ninth mechanism asks of greens, and it is owed to reds too.
    **AND `BROKEN` COVERS A THIRD STATE, MEASURED 2026-08-17: a SOURCE that
    yielded no citations at all.** `verify_citations.ps1` adds 1 to `BROKEN` when
    its own non-empty control fires —
    `CONTROL FAILED (non-empty): RED_TEAM.md yielded ZERO citations. It was named
    as a source and nothing in it was checked.` — which is this file's whole
    subject working correctly, and it is invisible in the total. `BROKEN=7` was
    reported repeatedly across one day, in replies and in two permanent commit
    bodies, as "seven broken citations, all pre-existing". Six were handles that
    did not resolve. **The seventh was a file that had never been measured at
    all**, and the repair is not a citation fix — it is to write a citation or
    stop naming the file as a source. Found only because the total moved by one
    for a change that added no citation to any file the total was about.
19. **A handle is only as stable as the NAMESPACE it is unique in.** Choose one
    that cannot be duplicated by the ordinary growth of the target: prose from the
    line you mean, never an identifier that the target's own conventions repeat.
    And confirm the count is 1 at the moment you write it — a handle verified once
    is a handle that was unique once, and this file's whole subject is the
    difference between those two sentences.

**The question this adds.** Mechanisms 1–4 ask *could this have failed given my
inputs?*, 5–7 *was it looking at the right thing?*, 8 *does it still reach its
failing state on today's fixture?*, 9 *how many different states satisfy this?*,
10 *when the thing under test does nothing, do both sides of my comparison become
the same nothing?*. This one asks the mirror of the ninth, and it is the only one
in the file addressed to a RED: **how many different states produce this
FAILURE, and does the word in front of me name the one I have?**

---

## A TWELFTH MECHANISM (2026-08-17) — THE CELL WAS SOUND AND THE PREDICTION ABOUT IT WAS WRONG

Every mechanism above is a DEFECTIVE CELL: vacuous, unreachable, intercepted,
pointed at the wrong artifact, starved of its stimulus, or ambiguous in its red.
**This one is a sound cell, correctly written, capable of firing — and an author
who predicted it would move under a particular break, ran the break, and did not
notice it had stayed green.** The mutation was applied, it reached the cell, the
cell ran and printed. It could not move, because **the property it compares is
COARSER than the property the mutation damaged.**

**The shape.** `proveSheets.ts` cell S1 compares two independent walks of one
transition table: the module's own `reachableSheetStacks()`, and the proof
script's `walk()`, which is the same breadth-first search with the break wrappers
inside it. Agreement is a real cell — two implementations of one traversal, and
if they disagree one of them is wrong.

Two of the five breaks damage the reducer:

    --break=always_push   `open` pushes unconditionally, making the duplicate
                          the real `open` refuses to make
    --break=pop_all       `close` empties the stack instead of popping one

The cell was written asserting **the two walks must DISAGREE under either**, on
the reasoning that a damaged reducer must move differently.

**MEASURED. It went red under BOTH, saying `module walked 8, this script 8`.**
The reachable SET is unchanged by either damage, because each transition's
declared `from` keeps the damaged move off the frontier where it would show:

| break | what it damages | why the SET does not move |
|---|---|---|
| `always_push` | `open` stacks a second copy | `open_add_seller` is reachable only `from: ["seller_picker"]`, and pushing `add_seller` onto `[seller_picker]` is where the real `open` puts it anyway |
| `pop_all` | `close` empties instead of popping | `close_top` from `[seller_picker>add_seller]` lands on `-` instead of `[seller_picker]` — and `[seller_picker]` is still reached from `-` by `open_seller_picker` |

**A set is not a transition table.** Eight stacks is a quotient of the table; both
damages live in which transition leads where, which the quotient cannot express.

**And the damage WAS caught, four cells away, which is the whole reason this is
about prediction and not about coverage.** Under `pop_all`: S4
`seller_picker>add_seller -> -` where `seller_picker` was expected, S5
`--close--> -` must land back on `seller_picker`, and S6's count cell reporting
`3 moves` where four are required. Under `always_push`: S7 `72 pairs checked,
7 bad` and S8 `got seller_picker>add_seller>add_seller`. Three red cells per
break, in both cases.

### THE TRAP, and it is a counting habit rather than a reasoning error

**Three cells went red, so the disproof looked successful.** A run that goes red
under a deliberate break is exactly what this file asks for, and both runs did.
Had the reds been counted rather than READ, the conclusion would have been "the
break reddens the proof, S1 is validated" — about a cell that was never asserted
correctly and had just contradicted its author twice.

That is the same false assurance as the FIFTH mechanism's, arriving from the
other side. There a true green was about the wrong object; here a true red is
about the wrong CELL. In both, nothing is faked, the number is real, and the
reader's question is not the one the number answers.

### Why it is none of the eleven

**Not 1–2.** Both operands are genuinely computed lists of eight strings.
Nothing is vacuously true, and the same cell reddens correctly whenever the two
walks really do differ.

**Not 3, and this is the closest.** That one's failing state is unreachable *from
the inputs supplied*, and its remedy is better inputs — a literal `pending: 3`
becomes a derived value. Here the failing state is perfectly reachable: a
transition with a wider `from`, or a damage that pushes a kind not otherwise
reachable, moves this cell. **No input was withheld. The mutation was aimed at a
level of description the assertion does not resolve.**

**Not 4.** The break was not intercepted. It reached the cell, and the cell
printed its verdict.

**Not 5–7.** The right artifact was read — the module's own walk, the thing S1
exists to compare — and through the right field. No sibling guard answered first;
nothing is competing with this cell.

**Not 8.** The fixture is the transition table, and it was current. Nothing
lapsed with no diff; the table was written in the same commit.

**Not 9.** Neither collection was empty. Eight against eight.

**Not 10.** The two sides are two DIFFERENT traversals of one table, not two
readings of one event. They agree because the property is coarse — not because
an operation failed to happen and both derivations returned the same null.

**Not 11.** That one is about a RED whose word covers two conditions. This is a
GREEN under a deliberate break, which is this file's original subject.

### The half that makes it evidence

**The prediction was wrong, not the code.** The reducer break was real, the
reachable set genuinely does not move, and the app is not defective in any way
this uncovered.

What was done, and it matters more than the finding: the expectation was
corrected rather than the cell deleted. S1 now asserts agreement only when the
reducer is undamaged, and under those two breaks it **prints `[skip]` with the
reason in the run output** — a reader of that run is told, in the run, that this
cell is not being asserted and where the damage does show. Deleting the cell
would have removed a working check to hide a wrong guess; leaving the wrong
assertion in place would have left a cell that reddens for a false reason, which
is worse than either.

**A control that corrects its author is the strongest form this file has.** Every
instance above was found because a green was doubted. This one was found because
a RED said something the author had not predicted, and the author read it instead
of counting it.

### Two more, appended to How to apply

20. **Name the cell you expect to move BEFORE running the break, and check that
    cell specifically afterwards.** Rule 1 says make it fail once on purpose;
    that is necessary and not sufficient, because *something* failing is not
    *the thing you were validating* failing. A break with three reds and one
    unexpected green is a finding, and the green is the finding.
21. **Match the granularity of the assertion to the granularity of the damage.**
    Ask what LEVEL OF DESCRIPTION each speaks at: a SET cannot see a damaged
    transition, a COUNT cannot see a reordering, a STATUS cannot see which guard
    answered (the seventh mechanism, one level down), a TOTAL cannot see a
    misallocation. When a cell stays green under a deliberate break, that is
    information about THE CELL and not about the code — resolve it before
    reporting either.

**The question this adds.** Mechanisms 1–4 ask *could this have failed given my
inputs?*, 5–7 *was it looking at the right thing?*, 8 *does it still reach its
failing state on today's fixture?*, 9 *how many different states satisfy this?*,
10 *do both sides become the same nothing?*, 11 *how many states produce this
failure?*. This one asks the question that outranks all of them, because it is
about the pass that validates the others: **which cell did I predict would move,
did THAT cell move, and if it did not, is my model of the cell wrong or my model
of the damage?**

## A THIRTEENTH AND A FOURTEENTH MECHANISM (P-GUARD, 2026-08-17) — ONE AMENDMENT, BECAUSE THE PAIR IS THE FINDING

**Both were produced by ONE `Prove:` document, on ONE day, under ONE review.
Neither was found by running anything.** The thirteenth surfaced because two
measurements of the same command disagreed and somebody refused to pick one; the
fourteenth was found by a person reading the brief before it was dispatched, in
a check that had already been written, reviewed and approved. **Nothing was
executing yet. There was no red to notice and no green to doubt.**

That is why they are appended together. Every mechanism above is a defect in an
instrument pointed at CODE. These two are defects in the document that says the
code was proven — and a document is not run, so the entire disproof discipline
this file teaches never gets a chance to fire on it. **Split into two amendments
months apart, each reads as one more instrument bug and that datum is gone.**

### MECHANISM 13 — THE INSTRUMENT ANSWERS A DIFFERENT QUESTION DEPENDING ON THE INDEX

`git check-ignore` **consults the index by default**, so a TRACKED path is
reported as not-ignored no matter what the patterns say. Measured on
**git 2.50.1.windows.1**, in a throwaway repository, under a deliberately BROKEN
pattern (`.claude/skills/` in the directory form, which makes every negation
under it inert), against a path that is in the index:

```
git check-ignore -q            .claude/skills/async-python-engineering/SKILL.md
  -> exit 1   "not ignored"   READS AS PASS
git check-ignore -q --no-index .claude/skills/async-python-engineering/SKILL.md
  -> exit 0   "ignored"       THE ACTUAL ANSWER: FAIL
```

**All nine authored skill directories in this repository are tracked.** So the
plain form answers PASS over a pattern that would silently stop protecting them
— and it does so for every file the repository guards most, because *tracked* is
what guarded means here. A `Prove:` block written with the plain form is a cell
that cannot go red, in the document whose job is proving the change.

**WRITE THE SECOND HALF, NOT THE FIRST.** The eye-catching detail is that `-v`
prints a line for a NEGATION match too, so "produced output" is not "is
ignored" — `.claude/settings.json` untracked prints `!.claude/settings.json`
while `-q` exits 1. That is a property of one flag. **The lesson is that this
instrument cannot check the very files a repository protects**, and `--no-index`
is what asks the question the author meant. The `-v` detail is also
index-dependent in the opposite direction: for the SAME path TRACKED, `-v`
prints NOTHING. Two correct measurements taken in two index states, which is
exactly how the disagreement that surfaced this arose.

**Not the fifth mechanism.** There the instrument never read the artifact — a
hardcoded source list, a green computed from a different file. Here it reads the
right artifact, at the right path, and answers a DIFFERENT QUESTION about it:
*is this path ignored in practice, given what is already tracked?* rather than
*what do these patterns say?* Both questions are legitimate and the tool answers
the first by default. **The fifth is a wrong target; this is a wrong question
about the right target**, and no source list can fix it.

**Not the ninth.** The haystack is not empty — the path exists, the patterns
exist, the comparison is real. It comes out wrong for a reason that is
documented behaviour.

**The disproof that finds it is one line:** run the same path under a pattern you
know is broken and require the two flag forms to DISAGREE. If they agree, the
cell you are about to trust is not reading the patterns at all.

### MECHANISM 14 — A SET CHECK THAT PASSES ON EXCESS

The phase check in P-GUARD's brief originally required the two commits' file
sets to have an **EMPTY INTERSECTION**. That is a real property and it catches a
real defect: the same file edited by both commits, which is the case where a
two-commit phase goes wrong. **It is blind to a file appearing in NEITHER
declared set.** A commit that also swept in a pile of unrelated untracked paths
has a perfectly empty intersection with the other commit and passes completely.

**THE GENERAL FORM, and it is not about git.** A containment test and a
disjointness test both ask **WHAT IS PRESENT**. Only **EQUALITY** asks **WHAT IS
IN EXCESS.** Any check whose real question is *did anything extra get in here* —
a staging set, an allowlist, a serialised payload, a migration's touched tables,
a response body's keys — is answered by equality and is not answered by either
of the other two, however carefully they are written.

**Measured at the time the check was written:** 152 untracked files in this tree,
`git add *` pre-approved in `.claude/settings.local.json` so a sweeping stage
raises no permission prompt, and a check that would have reported the result
clean.

**Not the third mechanism.** There the failing state is unreachable from the
inputs supplied. Here it is trivially reachable — one `git add -A` reaches it —
and the check simply does not express it.

**Not the twelfth.** There the cell was sound and the prediction about it was
wrong. Here the prediction was right (a wrong file set must redden this) and the
CELL was wrong: it tests a weaker relation than the sentence above it claims.

### THE THIRD DATUM, AND IT ARRIVED INSIDE THE PROBE BUILT TO PROVE THIS PHASE

The `Prove:` block for this phase requires a SECOND INSTRUMENT: `git add -A`
inside the fixture, whose staged list must contain no third-party path. Its
first run printed:

```
STAGED=1  THIRD_PARTY_STAGED=0
```

The one staged path was `.gitignore`. **The fixture had already committed every
authored file, so `git add -A` had nothing to stage and the instrument decided
nothing.** `THIRD_PARTY_STAGED=0` was true, and carried no information — **the
ninth mechanism, in the instrument written to prove a phase about instruments
that carry no information.** Repaired by creating new files on BOTH sides first
(one inside an authored skill, two third-party) and by running the same stage
under case A as a control: `STAGED=10  THIRD_PARTY_STAGED=8`. Only with that
control on the page does the zero above it mean anything.

**This is why the pair is the finding and not a coincidence of timing.** Three
instances in one phase, all in the proving apparatus rather than in the thing
proved.

### Three more, appended to How to apply

22. **Ask what QUESTION your instrument answers by default, not just what
    artifact it opens.** Rule for the fifth mechanism is *which paths does it
    read*; this is one level in from that. A tool can read exactly the right file
    and answer a neighbouring question — `check-ignore` asks about the index,
    `git status` asks about the working tree normalised, a linter asks about the
    files it was handed. **Where a flag switches the question, name the flag in
    the cell and say which question you meant.**
23. **When the real question is "did anything EXTRA get in", only equality
    answers it.** Write the check as *this set EQUALS that set* and never as
    *this set contains* or *these sets are disjoint*. Both weaker forms are
    satisfied by the excess you are looking for.
24. **A `Prove:` block is not exempt from this file, and nothing runs it.** Code
    gets a red eventually; a proof document gets one only if a person reads it
    adversarially before it is dispatched. **Read your own `Prove:` block asking,
    of each cell, what state of the world would make this print PASS while the
    change is broken** — and treat a cell whose answer is "none I can construct"
    as unfinished rather than as strong.

## A FIFTEENTH MECHANISM (P-OUTBOXREVIEW, 2026-08-18) — THE CONTROL WAS BUILT OUT OF THE EXPRESSION THAT FAILED, SO IT SUBTRACTED THE SAME BLIND SPOT FROM BOTH SIDES AND AGREED WITH ITSELF

Every mechanism above is about an assertion. **This one is about a POSITIVE
CONTROL — the thing this file tells you to add — and it is the case where adding
one does not help, because the control is computed by the same expression whose
failure it exists to detect.**

**The instrument.** `tools/verify_citations.ps1` parses `` `FILE § Section` "handle" ``
out of a set of source documents and asserts each resolves to exactly one place.
Its header names the failure it fears, and it is this file's first mechanism: the
parser silently stopping. It had already happened once — the section mark written
as a literal character in a BOM-less `.ps1` read as codepage 874, `CITATIONS=3`
where 36 were present, **exit 0**. So a control was added, and it is a good one:

    SECTIONS - the number of section-bearing citations parsed must equal the
    number present.

**The defect.** Both parsers spell a filename `[A-Za-z0-9_/\.]+\.(?:md|json)` —
letters, digits, underscore, slash, dot. **No hyphen.** So a citation naming a
hyphenated file does not fail to resolve; it is never seen. It is not BROKEN, it
is not counted, and nothing anywhere prints a number that moved. Every file under
`lessons/` is hyphenated.

**AND THE CONTROL CANNOT FIRE, BECAUSE THE CONTROL IS THAT REGEX.** The expected
count is built with the identical class:

    $sectExpected = ([regex]::Matches($text, '`[A-Za-z0-9_/\.]+\.(?:md|json)\s*' + $S)).Count

so an invisible citation is missing from the EXPECTED number and from the PARSED
number in the same breath, and `$sectSeen -eq $sectExpected` holds exactly as
well over a corpus it cannot see. The second control — a source must yield at
least one citation — asks a question this defect never makes false: a document
with twenty parseable citations and three invisible ones is not empty. **Two
positive controls, one of them written for this precise failure mode, and neither
has a state in which it goes red.**

**What actually caught it was arithmetic, and only because the number was small
enough to hold in a head.** Four citations were written into one file; the
checker's count for that file rose by **three**. Nothing was red. Nothing was
missing from the output. The only evidence that existed was a subtraction nobody
was asked to perform.

**TWO INDEPENDENT MEASUREMENTS, MONTHS APART, AND NEITHER COST ANYTHING — WHICH IS
THE POINT.** At `bcd4d40` the defect was measured once already, from the other
direction: hyphenated `.md` paths inside backticks across the then-checked
sources numbered **129**, and in genuine citation form — a path followed by the
section mark — the count was **ZERO**. *(Taken at `bcd4d40`, recorded here, and
deliberately NOT re-taken.)* At `e6249f6`, on a tree carrying no modified tracked
path, a second pass over the 25 tracked documents that cite into `ROADMAP.md`,
`OPEN_ITEMS.md` or `PROJECT_STATUS.md` parsed **435 citations naming 14 distinct
target files, not one of them hyphenated**. So the blind spot is LATENT and has
always been: every document here reaches a lesson through `lessons/README.md`,
which has no hyphen. **Nothing has ever gone unchecked because of it.** The
instrument has been correct about everything it was ever pointed at, and it has
never been able to say so.

**THAT IS WHY IT IS A LESSON AND THE HYPHEN IS A QUEUE ENTRY.** A latent tool bug
gets fixed when someone gets to it. What does not get fixed by fixing it is the
HABIT that let a control be written out of the failing expression — and the next
control written that way will guard something that is not latent.

### Why it is none of the fourteen

**Not mechanisms 1–2, *the needle was empty*, and this is the near miss that
matters.** Those are a needle matching EVERYTHING — `startswith(b'')` true for
every input, a vacuous pass. Here the needle matches a correct SUBSET: every
citation the checker reports is real, and every verdict it gives is right. The
defect is entirely in what it never enumerated, so no amount of care over the
assertion reaches it — and, unlike 1–2, the control that would have caught a
needle problem was present and was itself built from the needle.

**Not mechanism 9, *the haystack was empty*.** The collection is not empty and
does not come from a system under test. It is the instrument's own grammar
excluding a subclass of a corpus it read completely, in files it opened and
decoded correctly.

**Not mechanisms 5–6, *the instrument never read the artifact / never read what
points at it*.** Every file was read, byte for byte, BOM consumed, CRLF
normalised. Reading was not the failure.

**Not 13 or 14.** Thirteen is an instrument answering a different question by
default; fourteen is a containment test asked to do equality's job. Neither is
about a control, and this one is about nothing else.

### The two near misses that are NOT in this file, named out loud

**[[a-differential-control-is-only-as-good-as-its-weaker-side]]** is the closest
thing anywhere, because `$sectExpected` against `$sectSeen` is exactly a
"these two must AGREE" check. It does not cover this and the difference is worth
holding: that lesson's fault is an OPERAND the proof supplied itself, and its
remedy is to derive both sides from the real path. **Both sides here ARE derived
from the real text.** What is shared is not an operand but the GRAMMAR, and a
grammar is invisible in a way a literal is not — you can see a hardcoded `5` in a
comparison; you cannot see the strings a regex declined to match.

**[[a-checker-must-not-share-the-code-it-checks]]** Bound 1 has the RIGHT REMEDY
and the wrong scope. *Duplicate the arithmetic, never the convention* is precisely
what was needed: count the expected citations by a second, independent route and
the two would have disagreed the day a hyphen appeared. But that lesson's subject
is a checker recomputing a value PRODUCTION code computes, and this is a control
recomputing a value THE CHECKER computes — one level in, where nobody was looking.
**A remedy filed under a scope that does not reach your case is not available to
you**, which is the practical half of why this is written here.

### Two more, appended to How to apply

25. **A positive control must not be built from the expression it controls.** Ask
    of every control: *if the thing I fear happened, would this number change?* If
    the control and the suspect share a regex, a parser, a column list, a glob or
    a key space, the answer is no, and the control is a second copy of the failure
    wearing the word "control". Derive it by a route that could disagree — count
    the raw candidates before parsing, count the corpus a different way, or count
    by hand once and pin it to a commit.
26. **When you add N things to something an instrument counts, read the count and
    subtract.** It is the cheapest control there is, it needs no code, and it is
    the only one that caught this. A count that rose by less than you added is a
    class the instrument cannot see — and a class it cannot see is one it will
    never call broken.
