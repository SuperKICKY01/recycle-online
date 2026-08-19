# A sentence that quantifies over a set names no member of it

**Applies** the moment you ADD to or REMOVE from any set this project also
quantifies over IN PROSE — a union or an enum, a registry, a label space, a
numbered list of mechanisms, a set of acceptance criteria.

**The rule.** The sentences that break are the ones that QUANTIFY — *every kind*,
*a non-bill kind*, *FIFTEEN MECHANISMS* — and they contain **neither the member's
name nor the set's name**. So the sweep every other lesson in this directory
prescribes, grep for the expression or grep for the label, runs CLEAN over a
document that already contradicts itself. **Sweep by the QUANTIFIER, never by the
member.**

---

## The instance — a member removed, and two criteria in the same commit that still stage it

`ROADMAP.md § P1.18` designs a device outbox carrying KINDS of work. Its design
subsection removes one of three declared kinds, with an argument and a decision
behind it:

    ROADMAP.md:2383   type OutboxKind = "bill_send" | "bill_void";
    ROADMAP.md:2398   **`seller_create` IS REMOVED FROM `OutboxKind` BY THIS DESIGN

and the same document's own *WHAT THIS SET DOES NOT COVER* repeats it at
`:3012` — "`OutboxKind` carries two members until it is answered."

**The two survivors both carry `LocalBill`.** So *a non-bill kind* has no instance
in the type at all. And the acceptance criteria stage one at THREE SITES, in TWO
criteria:

    2944   NON-BILL kind owed and nothing else, `signOut` returns `refused_pending`; against
    2949   the view maps): with only a non-bill kind owed, the text must NOT contain `ใบ` —
    2958   sweep. **Observable:** a non-bill kind's row is left in its in-flight state, the

All line numbers in this section are `git show 952c1cf:ROADMAP.md`, 3452 lines,
and the criteria block is 2832-3026 in that object. **Two criteria, three sites** —
`:2944` and `:2949` are parts (i) and (ii) of one criterion whose heading is at
`:2941`, and `:2958` belongs to the one at `:2956`.

**What each site cost.** The gate/sheet criterion could not be PERFORMED as
written: no staging of a two-member all-bill union produces "a non-bill kind owed
and nothing else". The `ใบ` clause was worse than unperformable — under the only
substitution available it turns a CORRECT sheet red, because a bill awaiting
cancellation is a bill and `ใบ` is its correct classifier; and the branch its own
named red case actually renders is the confirmation card, which contains no `ใบ`
anywhere, so the assertion was ALSO green over the broken build it was written to
catch. The boot criterion went vacuous: `bill_void`'s in-flight guard is an
in-memory `Set` on the engine, so a void is owed after a kill with or without any
recovery, and its control — "the identical staging with a BILL must still recover" —
passes on the sweep that already existed.

## Both ends are in ONE commit, which kills the "it went stale later" reading

    git log --oneline -S'IS REMOVED FROM' -- ROADMAP.md          -> a60340c
    git log --oneline -S'NON-BILL kind owed and nothing else' --  -> a60340c
    git log --oneline -S'in its in-flight state' --               -> a60340c

**The removal and the sentences it falsifies were authored in one commit, in one
file, 546 lines apart.** Nothing drifted, nothing was inherited from a stale
neighbour, and no second reader was needed to introduce the contradiction. The
vocabulary is older than the removal — *non-bill* was written while `seller_create`
was still a member — but the commit that removed the member is the commit that
shipped the sentences.

## What the standard sweep returns, measured, and its control

Corpus: the criteria block, `952c1cf:ROADMAP.md` 2832-3026. Tool `grep -oi` piped
to `wc -l`, counting OCCURRENCES and not matching lines, stated because the two
differ here.

| needle | occurrences | where |
|---|---|---|
| `seller_create` | **0** | — |
| `OutboxKind` | **4** | `:2848`, `:2850`, `:2852`, `:3012` — **none a staged site** |
| `non-bill` (the CONTROL) | **3** | `:2944`, `:2949`, `:2958` — exactly the three |

**The control is the whole point of the table.** The instrument works on this
corpus and finds these sites — by the QUANTIFIER. Grepping the member returns
nothing, and grepping the TYPE returns four hits of which three are a compile-time
probe in a different criterion and one is the sentence that is already correct. A
faithful sweep by either returns clean over a broken document.

**AND THE QUANTIFIER SWEEP IS CASE-SENSITIVE-FRAGILE HERE.** `grep -o "non-bill"`
without `-i` returns **2** and misses `:2944`, which reads `NON-BILL` in capitals —
this repository shouts its emphasis, so the same phrase appears in two cases within
one criterion. A sweep by the quantifier that forgets `-i` fails by finding LESS,
which is this repository's oldest failure shape.

## The second instance, same commit, pointing the other way — an ADDITION, and a count

`a60340c` also appended a mechanism to a lesson in this directory:

    lessons/a-check-that-never-went-red-was-never-observed.md:1197
      ## A SIXTEENTH MECHANISM (P1.18 stage 2, 2026-08-18) — ...

and did not touch `:10`, which reads, in that file's own words:

    **FIFTEEN MECHANISMS, and this line is the ONLY place in this file that says how
    many.** Every heading below names its own mechanism and never the running total,
    so appending another is a one-number edit, here.

`git show a60340c -- <that file> | grep -E "FIFTEEN|SIXTEEN"` returns exactly one
line, the added heading. **The one-number edit the file's own text demands was not
made**, and the file stood at sixteen mechanisms declaring fifteen until the phase
that wrote this lesson corrected it. Counted by heading: *The first four instances*
(4) + fifth through twelfth (8) + *A THIRTEENTH AND A FOURTEENTH* (2) + fifteenth +
sixteenth = **16**.

**That instance is an ADDITION, which is why this lesson is written over CHANGING
the membership of a set rather than over removing from one.** A rule phrased as
"removing a member is not finished until the criteria are swept" would not have
caught a count line.

## Why no existing lesson reaches it

### Not the be-year sweep — there is no expression, and the type name misses too

`be-year-comes-after-the-timezone.md`'s amendment is the nearest general form: "When
a lesson fixes a computation, the sweep is not done until every OTHER site of that
computation has been checked — tests included", and its instrument is "a repo-wide
grep for the *expression*, not for the symptom". Three things stop it. Its scope noun
is a COMPUTATION and nothing here was computed. Its instrument is an EXPRESSION and
there is none — measured above, the type name misses every broken site. And its
topology presumes an ELSEWHERE, production fixed and proofs missed eight months
apart; here both ends are one file, one section, one commit.

### Not `a-label-is-a-reference-with-no-checker` — its remedy needs the label to be IN the broken sentence

That lesson is the closest sibling and its general form is nearly this one: when you
append to a collection, the sites you break are the ones that REFERENCE the
collection. It does not cover this for three reasons. It is written about APPENDING
and a removal mints no label. Its remedy is "before minting a label, grep every other
file for that exact label", which REQUIRES the broken sentence to contain the label —
its own instance turns on a sentence containing four letters and four digits, and
here the broken sites contain neither the member nor the set. And its object is a
label SPACE, a reference space with no semantics and no checker by construction; this
is a TYPE with a compiler behind it whose broken sites are prose the compiler cannot
reach.

### Not `a-docstring-that-states-a-filter-is-a-claim-about-its-caller` — its discriminator CLEARS this case

Right family: prose no instrument reads. Wrong discriminator. That lesson asks
"could this sentence become false without this file changing?" and says a *yes* means
it is a claim about somebody else's code. The answer here is **no** — the falsifying
sentence is in the same file, the same section and the same commit — so the
discriminator gives a false all-clear on a document that already contradicts itself.

### Not the never-went-red family — UNSTAGEABLE is not VACUOUS

Every mechanism in `a-check-that-never-went-red-was-never-observed.md` concerns an
instrument that RAN and produced a reading carrying no information. Here the criterion
cannot be run at all: it demands a staging the type cannot produce. Nothing goes green
because nothing executes. The decisive corroboration is that the same criteria set
applies that lesson CORRECTLY three criteria further down — "A guard that fails by
finding LESS is this repository's oldest failure shape" — so its author had it loaded,
applied it, and it did not reach the defect higher up the page.

## How to apply

1. **When you add or remove a member of a set, sweep by the QUANTIFIER.** Grep for
   *every &lt;set&gt;*, for the COMPLEMENT noun the prose actually uses (*non-bill*,
   *other than*, *any kind that is not*), and for the count words. **Case-insensitively.**
2. **Ask of every surviving sentence: is there still an instance?** A criterion, an
   observable or a staging that quantifies over a member you just removed is not
   merely wrong, it is UNPERFORMABLE, and an unperformable criterion is the one nobody
   discovers is broken because nobody can run it.
3. **Where a set has a designated single count site, the change is not finished until
   that one number is edited.** A file that says "this line is the ONLY place that
   says how many" has told you exactly which line to open.
4. **Do it in the same commit as the membership change.** Both instances here were
   authored by somebody who knew the set had changed, in the commit that changed it.
   No later reader has the context that makes the contradiction visible.

## Bounds

- **The removal is documentation-only.** `mobile/src/sync/outbox.ts:59` still declares
  `"bill_send" | "bill_void" | "seller_create"`. The member is forbidden by the design
  and present in the tree; the criteria contradict the DESIGN, not the compiler.
- **A deliberate temporary member is NOT an instance and must not be swept.**
  `REGISTRY-IS-TOTAL-AND-CONSTRUCTED` adds a member to `OutboxKind` on purpose,
  observes the compile error, and removes it. Three of the four `OutboxKind` hits in
  the table above are that probe. A repair that treats them as defects is wrong.
- **No instrument was built.** `a-label-is-a-reference-with-no-checker` ends in the
  same place and says so; this file is the only thing standing between the next
  membership change and the same result. A quantifier is a phrase somebody chose, and
  no checker can enumerate the phrasings a future author will reach for.
- **The figures are pinned** to `952c1cf:ROADMAP.md` because that file was being
  rewritten while they were taken, which is also why no line number here names the
  working tree.
