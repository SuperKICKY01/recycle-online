# A green cell is evidence about the assertion, not about the claim

**Applies to** every assertion you are about to cite as having established
something — and hardest when the suite is green and the change felt small. A
cell tests exactly the sentence it contains. The CLAIM in your head is a
different object, and the gap between them gets filled by whatever else happened
to be true. FIVE mechanisms produced that gap in ONE phase (P1.7's ownership
work, `a471dc2`..`fde2b0c`), and they are five different mechanisms with one end.

Sibling of `a-check-that-never-went-red-was-never-observed.md`, separated by
where the failure sits: there the instrument is structurally incapable of
firing. Here it fires, correctly, about something adjacent to what you meant.

## 1. A difference-check is satisfied by a wrong non-null value

`proveOwner.ts:297` asserts the bill row read back with an identity signed in
DIFFERS from the same row read back with none. Under a deliberate mutation that
wrote the tenant into the user column — the row wrong in exactly the way the case
exists to catch — **that cell stayed green**, because a wrong non-null value
still differs from null.

What caught it is the cell beside it, `:305`, requiring the difference to run the
right way round: one side owned, the other unowned. Recorded in `0ac09ef`.

**Assert the DIRECTION of a difference, never its existence.**

## 2. A comparison of two literal-typed constants never runs at all

The same file's O4 needed a control that its two identities genuinely differ.
Written the obvious way it would not compile: `const` narrows each string to its
own literal type, so `TENANT_A !== TENANT_B` is a comparison between types with
no overlap and TypeScript rejects it as **TS2367**.

The dangerous repair is the natural one — delete the check, it is "obviously
true". That leaves the case with no defence against a fixture whose two
identities are the same value, which every other assertion in it would pass. The
four constants now carry `: string` annotations for no reason but this, and
`proveOwner.ts:70` says so, because an annotation that looks like noise gets
tidied away. Recorded in `0ac09ef`.

**A widening annotation can be load-bearing. Say why, at the constant.**

## 3. A downstream observable is kept correct by a second mechanism

`proveVoidOwner.ts:387` asserts that after another person signs in, A's void was
not handed back to the queue. `:374` asserts the same event on the ROW: A's
refusal survives B's sign-in.

The sign-in routine was then unfiltered on purpose. **The queue cell stayed
green** — `listVoidsToApply` still filters by requester, so the queue was right
even though the routine had written to a person who was not there. Only the row
cell went red. Recorded in `cfb6633`.

Two mechanisms guarded one observable, so a green there was evidence about
whichever still worked. **Assert on the state the code under test WRITES, not on
what a later reader returns.**

## 4. Reusing a shape carries its assumptions with it

The odd one out: caught by reading, not by a green — which is why it is worth
keeping, because it shows what the green would have been worth.

A permanently rejected void had to leave the void queue. A 403 already did
exactly that, via `void_refused_at`, and reusing it looked free. It is not the
same situation, and the source said so in two places: `clearVoidRefusals`
retracts refusals on every sign-in, so the infinite retry would have RESUMED each
shift — stopped every four seconds, restarted every morning, which is harder to
notice than never stopping; and `billNotice` routes that column through
`forbiddenReason`, whose text is about permission, so the card would have told
the operator their account may not cancel bills, on a bill the server still holds
as live money.

**The attempt-count proof would have passed either way.** The void does stop
being re-sent. `proveVoidTerminal.ts:288`'s V2 exists only because the hazard was
found by reading first. Recorded in `869977a`, and written out at the code in
`engine.ts:463`.

**Before reusing a mechanism, ask whether the SITUATION is the same — not whether
the code fits.** Then look at what already consumes the thing you are reusing.

## 5. A comparison whose fixture is empty holds by arithmetic

`proveDraftOwner.ts` C2 asserts that a draft refused to the wrong person keeps
its LINES — the sharpest half of "nothing was destroyed", because
`local_draft_lines.draft_id` is `REFERENCES local_draft(id) ON DELETE CASCADE`
with `foreign_keys` ON, so deleting the header takes the lines silently and
nothing else in the case would notice.

The fixture came from `newDraft()`, which builds a cart with **no lines**. So the
cell compared 0 with 0 and printed `its LINES survive too — 0 of 0`. **Green, and
incapable of anything else** — no mutation, no defect, no input could have moved
it, because the relation held by arithmetic rather than by the code under test.

Giving the fixture one real line turned the SAME cell red under a mutation that
deletes the refused row: `its LINES survive too — 0 of 1`. Recorded in
`fde2b0c`, and the fixture now carries its own guard at `proveDraftOwner.ts:241`
— `CONTROL: the draft HAS a line to lose — otherwise 'its lines survive' is 0 of
0` — because the next person to simplify that fixture would re-create this
exactly.

**Not mechanism 1 with different words.** There the value was wrong and non-null,
so the cell had two real operands and compared them badly. Here there are no
operands: both sides are empty, and the assertion is true of every universe.

Siblings in the other direction, and worth reading together:
[[a-check-that-never-went-red-was-never-observed]]'s ninth mechanism is the
needle fine and the HAYSTACK empty, and
[[a-control-must-contain-what-fooled-you]] is a control that omits a shape the
real input holds. This is neither — the control contains nothing at all on
EITHER side of the comparison.

**Count the fixture before trusting a relation over it.** A cell asserting that
a collection survived must first assert the collection was non-empty.

## The discriminator

When a cell is green and you are not certain it looked at anything, do not read
the cell. **Break the claim in the smallest way you can and check that THIS cell
moves** — not that the suite goes red, which any of its neighbours can do.

Four questions, in order, and each caught one of the above:

1. Could this have come out the other way, given the inputs I supplied?
   (Catches 1 and 2.)
2. What else, still working, would keep this observable correct if the thing I
   am testing were broken? (Catches 3.)
3. What does the code I am reusing already assume, and who else reads it?
   (Catches 4.)
4. How many things is this cell actually comparing? Print the count, not the
   verdict. (Catches 5 — and it is the cheapest of the four, because `0 of 0`
   and `1 of 1` are the same word until the numbers are on the screen.)

**WHAT TO LOOK AT FIRST when a cell is green and you are not sure it looked at
anything: the OPERANDS, printed, before the verdict.** Not the assertion, which
reads correctly in all five mechanisms above; not the suite, which any neighbour
can redden. Make the cell print what it compared — the two values, the two
counts, the two identities — and read those. Every one of the five was found the
moment its operands were visible: a wrong non-null value beside a null, two
constants the compiler had already resolved, a queue answered by a different
statement, a column reused from a situation with other assumptions, and a
comparison with nothing on either side.

## AMENDED 2026-08-18 (P-SELLERAUTHOR) — the discriminator has a hole: the mutation must be one the SCHEMA WILL STORE

"Break the claim in the smallest way you can and check that THIS cell moves"
assumes the break you chose can actually happen. **A constraint can refuse your
mutation, and then the red you get is about the constraint.**

Measured while adding `sellers.created_by` (migration 0011). The phase brief
named the disproof itself: write the principal's TENANT id into the column — a
wrong, non-null, plausible value — and require the differential cell to redden.
It reddened. **EIGHTEEN cells reddened**, and the two that matter read
`db=None`.

Because `fk_sellers_created_by (tenant_id, created_by) REFERENCES users
(tenant_id, id)` cannot resolve a tenant id to a user row. The INSERT raised
23503; the assign-branch retry loop re-raises anything that is not
`uq_sellers_tenant_code`, and `_raise_for_integrity` re-raises anything not in
`_DUPLICATE_CODE_CONSTRAINTS`; so `POST /sellers` answered 500 and **no row was
written at all**. There was never a wrong value in the column for the cell to
discriminate. A bare `created_by IS NOT NULL` check would have produced the
identical eighteen reds.

**AND THE BLAST RADIUS READS AS MORE EVIDENCE, WHICH IS THE TRAP.** Eighteen red
cells feel like a stronger disproof than one. They are the opposite: a wide red
is what a NEIGHBOUR does, and the discriminator above already says so about
greens. Nobody re-reads that sentence while watching a suite they meant to break
go satisfyingly red.

What DID test the cell was a wrong value the constraint ADMITS — the other
principal's real user id, FK-valid, non-null and entirely plausible. **Exactly
one cell moved**, and it printed the stored value:
`db=35d09981… staff=bef92d61… admin=35d09981…`. Its mirror — the staff id
hardcoded instead — moved exactly the other cell. Neither is reachable by a
one-sided assertion, which is why the cell asserts over TWO rows created by TWO
principals: **one constant is right for at most one of them**, so no single wrong
value can satisfy the pair.

**The rule: before running a disproof, ask whether the schema will ACCEPT what
you are about to write.** If a constraint refuses it, you have measured the
constraint — worth knowing, and not what you came for. Then pick a wrong value
the constraint admits, and require the red to be NARROW and to NAME the value it
found.

Two siblings, and they divide cleanly.
[[a-mutation-on-a-protected-write-path-needs-a-scratch-database]] is about WHERE
a mutation runs; this is about WHAT it writes, and the two are asked in that
order because a mutation that cannot be stored still leaves rows everywhere the
proof got to before it failed.
[[a-differential-control-is-only-as-good-as-its-weaker-side]] is why both
principals are read from `/whoami` rather than from seeddata: a differential
whose sides are literals measures the literals.

## The rule

An assertion is a sentence, and a green is evidence about that sentence and
nothing more. Name in the cell's own text WHICH claim it carries, and when two
cells can both go green for different reasons, keep both — the pair is the
evidence, not either half.
