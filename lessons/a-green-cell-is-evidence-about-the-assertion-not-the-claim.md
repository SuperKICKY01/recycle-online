# A green cell is evidence about the assertion, not about the claim

**Applies to** every assertion you are about to cite as having established
something — and hardest when the suite is green and the change felt small. A
cell tests exactly the sentence it contains. The CLAIM in your head is a
different object, and the gap between them gets filled by whatever else happened
to be true. Four mechanisms produced that gap in ONE phase (P1.7's ownership
work, `a471dc2`..`cfb6633`), and they are four different mechanisms with one end.

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

## The discriminator

When a cell is green and you are not certain it looked at anything, do not read
the cell. **Break the claim in the smallest way you can and check that THIS cell
moves** — not that the suite goes red, which any of its neighbours can do.

Three questions, in order, and each caught one of the above:

1. Could this have come out the other way, given the inputs I supplied?
   (Catches 1 and 2.)
2. What else, still working, would keep this observable correct if the thing I
   am testing were broken? (Catches 3.)
3. What does the code I am reusing already assume, and who else reads it?
   (Catches 4.)

## The rule

An assertion is a sentence, and a green is evidence about that sentence and
nothing more. Name in the cell's own text WHICH claim it carries, and when two
cells can both go green for different reasons, keep both — the pair is the
evidence, not either half.
