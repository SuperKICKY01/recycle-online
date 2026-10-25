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

## AMENDED (P1.8b MOBILE, 2026-08-25) — A SWEEP IS A TERM **AND A DOMAIN**, AND ONLY THE TERM IS WRITTEN DOWN

**The instance is this file's own subject, committed by a session that had this
file loaded and had already cited it.** `seller_create` was ADDED back to
`OutboxKind` at `1d7f638`. The sweep this file prescribes was run BEFORE the
member landed — and it was run over `proveOutbox.ts` and the `.md` documents, and
over nothing else. **It came back clean across FIVE broken sites in the proof
tree**, and the first anyone knew of it was `prove:sync` going red after the
change.

**THE TERM WAS RIGHT. THE CORPUS WAS WRONG.** Every rule in *How to apply* above
answers WHICH WORDS to grep for, and not one of them answers WHICH TREE. That is
the new half: a sweep has two parameters, this file names one, and a search with
the right needle in the wrong haystack returns exactly what a search with the
wrong needle returns — nothing — and is indistinguishable from a clean result.

### The four instruments, measured over the pre-change tree at `8d979f2`

Corpus `mobile/src`, tool `git grep` against the committed blob so the figures
name an object rather than a working tree. Five sites were broken by the
addition: `proveSync.ts:294`, `proveCart.ts:292`, `engine.ts:109`,
`engine.ts:264`, `outboxRunner.ts:159`.

| instrument | of the 5 | what it missed |
|---|---|---|
| the TYPECHECKER | **0** | all five — measured: with all five present and the construction sites fixed, `npm run typecheck` exited **0** |
| grep the MEMBER (`seller_create`) | **0** | all five — **one hit in the whole tree**, the declaration's own comment |
| grep the QUANTIFIER — this file's own remedy | **2** | `proveSync`, `proveCart`, `engine.ts:109`. Caught only `engine.ts:264` and `outboxRunner.ts:159`, both of which happen to say *every kind* |
| grep the SURVIVING MEMBER PAIR (`bill_send.*bill_void`) | **5** | nothing — over the RIGHT DOMAIN |

**AND THE RATIO CORRECTS A GUESS THAT WAS MADE BEFORE IT WAS MEASURED: ZERO of
the five were compiler-visible, not one.** The typechecker caught 67 OTHER sites —
every construction site that had to supply the new kind's store — and that large,
loud, successful sweep is exactly what made the five feel covered. **A compiler
that finds sixty-seven real sites is not evidence about the sites it cannot
see.**

### The half that is worse: `grep the QUANTIFIER` scored 2 of 5, and this file says to sweep by the quantifier and NEVER by the member

**Both halves of that sentence are still right for the case this file was written
about, and both are wrong here, for one reason: THE DIRECTION OF THE CHANGE
DECIDES WHICH INSTRUMENT WORKS.**

- The original instance was a **REMOVAL**, and its broken sentences were PROSE
  quantifying in natural language — *a non-bill kind* — which by construction
  contains no member name. Grepping the member was useless there and the
  quantifier was the only handle.
- This instance is an **ADDITION to a set of two**, and its broken sites are
  CODE: an assertion and a sum that enumerate the surviving members BY NAME. A
  two-member set leaves the PAIR as a fingerprint, and the pair found all five.

**So the rule is not "quantifier, never member". It is: grep the quantifier for
the prose, AND grep the SURVIVING members for the code — the ones that stay, never
the one that moves.** The member that moves has no occurrences yet if you are
adding it, and none left if you are removing it; the members that STAY are the
ones a hand-written enumeration names.

## AMENDED (P1.8b MOBILE, 2026-08-25) — A HAND-WRITTEN SUM OVER AN ENUMERABLE SET IS INVISIBLE TO **BOTH** INSTRUMENTS

**`proveCart.ts:292` is the site that matters and it is worse than the string
comparison, which at least failed loudly.** It read:

    const recoveredCount = recovered.bill_send.length + recovered.bill_void.length;

**It compiled. It ran. It stayed GREEN. And it silently stopped counting the
third kind** — so the cell, whose stated claim is that NOTHING was recovered,
would have reported nothing over a RECOVERED SELLER.

**WHY NEITHER INSTRUMENT REACHES IT.**

- **The typechecker cannot.** `recovered` is a total map over the union, so
  reading two of its three keys is perfectly well typed. Adding a member widens
  the map and invalidates nothing already written. There is no error to produce.
- **The grep cannot, except by accident.** It contains no quantifier and not the
  new member's name. It was caught here ONLY because both surviving member names
  happened to land on ONE LINE and the pattern was line-oriented. **Written across
  two lines it escapes every sweep in this file**, and nothing else would have
  looked at it:

      const sent = recovered.bill_send.length;
      const voided = recovered.bill_void.length;

- **And the test run cannot.** The cell went green, before and after. Only
  `prove:sync`'s neighbouring STRING comparison went red, and that red is the
  entire reason anybody looked at `proveCart.ts` at all. **A defect found by its
  neighbour is a defect that was not found.**

**THE REMEDY, AND IT IS A WRITING RULE RATHER THAN A SEARCHING ONE.** Enumerate
the set AT RUN TIME instead of summing its members by hand, so the next member is
covered by CONSTRUCTION rather than by somebody remembering:

    const recoveredCount = Object.values(recovered).reduce((n, ids) => n + ids.length, 0);

This is the same shape as the two cells in `proveOutbox.ts` that needed NO edit
at all when the member landed — `O6` and `O10` iterate
`Object.keys(registry)` — and which consequently began covering the new kind on
their own. **In one commit the same file shows both outcomes: the loops that
enumerate gained coverage for free, and the sum that named members by hand went
quietly wrong.** That contrast is the argument.

## The nearest neighbour, and the separation

**The neighbour is THIS FILE'S OWN REMEDY**, *How to apply* step 1, and the
separation is one word: that step is about the search **TERM**, and both
amendments above are about the search **DOMAIN** and about sites no term reaches.

- Step 1 tells you to grep for *every &lt;set&gt;*, the complement noun and the
  count words, case-insensitively. It is right, it was FOLLOWED, and it scored
  **2 of 5** here — because it names no corpus and because two of the five sites
  contain no prose at all.
- **The separation is not "step 1 is wrong".** It is that a sweep has two
  parameters and this file supplied one, and that a set can be broken at a site
  containing neither a quantifier nor a member — an enumeration written out by
  hand.

**Not the never-went-red family, and the discriminator is the same one this file
already draws.** That family is about an instrument that RAN and produced a
reading carrying no information. Here `proveCart.ts`'s cell ran and its reading
was WRONG rather than empty: it asserted a true thing about a set it had silently
narrowed. Nothing was vacuous and nothing was unstageable.

**Not `a-label-is-a-reference-with-no-checker`.** Its remedy needs the broken
sentence to contain the label; `proveCart.ts:292` contains neither the label nor
the member that moved.

**THIS FILE HAS NO DESIGNATED SINGLE COUNT SITE**, checked rather than assumed —
searched for the sentence-shape its own step 3 names, *the ONLY place in this file
that says how many*, and for a declared instance count: **not found with those
words.** Its sections are named and not numbered, so this amendment adds two
without a number to edit. The neighbouring file that DOES have one is named in
step 3 and is untouched here.

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

- **SUPERSEDED — the first bullet of the Bounds above, and the way it went wrong
  is worth more than the correction.** It read: *"The removal is
  documentation-only. `mobile/src/sync/outbox.ts:59` still declares
  `"bill_send" | "bill_void" | "seller_create"`. The member is forbidden by the
  design and present in the tree."* That was true when written. `47d17ab` then
  deleted the member from the tree, and `1d7f638` put it back. **So the sentence
  reads TRUE again today and means the OPPOSITE**: the member is present because
  the design now REQUIRES it, not in spite of the design forbidding it. A reader
  checking that bound finds a real file and a real member and concludes it holds.
  **A present-tense claim that becomes false and then true again for a different
  reason is the worst case the pin-a-claim convention describes**, and it is why
  that convention asks for the anchored form.
- **The figures in the table above are pinned to `8d979f2`** and the five sites
  were repaired at `1d7f638`. They will not rot, because both are statements
  about objects that have already happened.
- **STILL NO INSTRUMENT, and this amendment makes that worse rather than
  better.** The original file could at least say "grep the quantifier". This one
  adds "over the right domain" and "and a hand-written enumeration escapes both",
  neither of which a checker can enforce. **The only mechanical defence found here
  is the WRITING rule** — enumerate at run time — which removes the site instead
  of detecting it.

## AMENDED (the shifts unit, commit 2, 2026-09-29) — MINTING A PERMISSION CONSCRIPTS EVERY HAND-KEPT FULL COPY OF THE CATALOGUE, AND THE SWEEP TERM IS THE LAST CODE MINTED

The permission catalogue is a set this project quantifies over BY HAND on purpose:
proofs restate it rather than import it, so a fixture cannot agree with the server by
construction (`a-checker-must-not-share-the-code-it-checks.md`). Every such copy is a
sentence of the form "these are ALL the codes", and it names no future member.

**Measured.** Migration `0022` minted `shifts.manage`. The unit's own proof sweep looked
for absolute alembic heads and not for catalogue copies, and `prove_all` came back RED 1
on `prove_permissions` cell G: its "all-but-roles.manage" principal, built from a
hand-kept 14-code `PERMS`, now also lacked `shifts.manage`, and the server -- correctly --
answered `over_reach ['roles.manage', 'shifts.manage']` where the cell expected
`['roles.manage']`. The server was right; the copy was stale. The SAME list had been
conscripted once before: `0020`'s mint of `payments.record` added its line there. Two
instances, one list, and nothing but a full suite run noticed either.

**The sweep term is the MOST RECENTLY MINTED code**, not the quantifier and not the new
code. A list that claims to be every code MUST contain the last one minted; a list that
is one role's grant or one gate's code NEED NOT. So searching for the last-minted code
(both quote styles, explicit paths, bytes) returns every FULL copy plus some SUBSETS --
it cannot miss a FULL one that was ever current. Measured 2026-09-29 over 204 files
(`server/scripts`, `server/app`, `mobile/src`): 8 hits in 6 files, with `app/permissions.py`'s
own enum line as the control.

**Classification decides the edit, not the hit.** FULL (a mirror, an "everything"
builder, an all-but-one builder) gains the new code; SUBSET (a role's intended grant, a
single gate's `required_permission`) is NOT edited -- adding the code there would be a
new grant, a product decision, dressed as a sweep. Of the 8 hits: FULL and edited,
`server/scripts/prove_permissions.py` `PERMS` and `mobile/src/proof/proofGrants.ts` `ALL`;
SUBSET and left, `prove_permissions.py` two gate sites, `prove_payments.py` one
`required_permission`, `mobile/src/counter/counterView.ts` one production gate; FULL but
PRODUCTION and left by that brief's fence, the phone's `Permission` union in
`mobile/src/session/deviceRole.ts`, whose own comment says an unknown code "simply lands in
the Set unnamed" (measured at the unit's Task 0(h)). Note the mobile FULL copy was STALE
AND GREEN: no screen gates on `shifts.manage` yet, so nothing read the missing member --
a stale FULL copy fails only where some cell reads the new code.

**How to apply.** In the commit that mints a permission, before the gate: sweep for the
PREVIOUS last-minted code, classify every hit FULL or SUBSET with its reason, and add the
new code to every FULL copy with a comment naming the migration.

## AMENDED (seller search C1, migration 0024, 2026-10-12) — A MINT ALSO BREAKS EVERY PROOF THAT SEEDS OR SERVES BELOW HEAD

The sweep above finds FULL copies of the catalogue in FILES. It cannot find the third FULL
copy, which lives in the CODE's enumeration and is applied to a DATABASE: `seed_system_roles`
grants `SYSTEM_ROLE_GRANTS` (owner = `frozenset(Permission)`, every code), and the server's
`assert_catalogue` demands the database's catalogue EQUAL the code's. Both are correct at head
and both are wrong against a database deliberately built BELOW head.

**Measured.** 0024 minted `sellers.read_personal`. The swept FULL copies were edited and green,
and `prove_all` came back RED 1 on `prove_shifts`, whose round trip builds an empty scratch at
0022 BY DESIGN (a database born at 0023+ cannot go below 0022) and seeds it: `seed_dev.py`
granted the code's 16 codes to a 0022 database that lists 15 -- `ForeignKeyViolationError ...
role_permissions_permission_fkey ... 'sellers.read_personal'`.
With the seed fixed (below head it grants the intersection and prints each skipped code), the
SAME proof went red a second way: `seed_paid_bill` started THIS checkout's server against the
0022 build to post one bill, and `assert_catalogue` refused it (`in code but not in the table :
['sellers.read_personal']`). Through 0023 both paths had worked by COINCIDENCE: 0022 was the
last migration to mint a permission, so a 0022 database's catalogue happened to equal the code's.

**The rule (ADVISOR-DECIDED 2026-10-12, also in CLAUDE.md § Conventions).** A scratch below head
is SEEDED BY SQL ONLY and no server is started against it: today's code serving an old schema
is no released version's route. A below-head fixture is HELD TO THE ROUTE by a guard cell on a
head scratch that writes the same thing both ways and compares every column (`prove_shifts`
FX: 33 non-generated columns over purchase_bills, purchase_bill_items, payments,
payment_allocations; perturbing the fixture's payment method reddened FX alone).
`seed_dev.py` below head grants the INTERSECTION and names each code it skipped; AT head a
missing code is still an error, exit 1 (disproved on a scratch with the row removed).

**The second sweep, run in the commit that mints.** Every proof that builds or moves a scratch
BELOW head. Found by a content search of `server/scripts`, `server/app`, `tools`,
`mobile/src/proof` for `seed_dev`, `seed_system_roles`, `build_empty_scratch(` and
`upgrade`/`downgrade` to a numbered revision (control: `prove_shifts.py`'s 0022 build, the
known case, is among the hits). At 0024: SEEDS below head -- `prove_shifts` (two 0022 builds);
MOVES below head without seeding or serving -- `prove_drawer` (to 0022 and 0021),
`prove_shifts` (to 0020), `prove_seller_personal` (to 0023); every direct caller of
`seed_system_roles` runs on a dev-restored scratch AT head. Run each before the gate:
`prove_shifts` 63/63 twice, `prove_drawer` 97/97, `prove_seller_personal` exit 0.

**A proof never pins head (2026-10-19, after gate `20261017T164702Z` reddened `prove_seller_personal` E0 the day 0025 landed): "the current head" is read from alembic's `ScriptDirectory.get_current_head()`; a literal revision is only a migration the proof walks on purpose, or a floor (`>= "00NN"`).**

## AMENDED (M1 ruling R1, 2026-10-25) — A SWEEP FOR A WRITE MUST NAME THE KEY ALONE, NEVER THE KEY WITH ITS VALUE

Ruling R1 made `separate_cashier`, `shifts_enabled` and the payment methods the owner's, which conscripted
every proof that WRITES one of them as an admin. The sweep for those writers was
`separate_cashier.{0,30}(True|False|true|false)` -- the key AND a literal value. It found five files and
missed `prove_allocation_cap` and `prove_money_faults`, whose helpers write `{"separate_cashier": on}` with
the value in a VARIABLE. Both were GREEN at the commit (no one ran them), and the first gate after it went
RED on proof 1/123 with a 403 (`_prove_all/20261025T072706Z`, stopped; a stale lock file left behind).

The value is the part a caller is free to compute, so a pattern that names it measures the call sites that
happened to type it. Sweep for a WRITE by the key alone (`"separate_cashier"`, `separate_cashier:`) and
classify every hit by reading it; the wider sweep found eight files, of which the two above were the gap.
The same day's control: re-run the narrow pattern over the fixed tree and it still finds only the five --
the instrument never saw the other two, before or after.
