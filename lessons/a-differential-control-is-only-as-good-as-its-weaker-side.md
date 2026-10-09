# A differential control is only as good as its weaker side

**Applies to** every check of the form "these two outputs must DIFFER" or "these
two must AGREE" — a paired control, an A/B assertion, a before/after comparison.
If either side is a hardcoded literal, the relation is true by construction and
the control measures the literal.

## What was measured

`proveSignOut.ts` S9 ends with the control the whole case was built around: the
expired sheet and the offline sheet must differ, from an identical queue count
measured off a real `SqliteLocalStore`. Its own comment says why — *"A sentence
hardcoded into both branches ... cannot survive this line."*

R2b landed with the dead half's `session` derived from a real 401 pass and the
live half's left as the literal `"active"`. In that configuration the fold was
then broken so that a pass which said nothing about the caller — a plain outage,
`retryable` only — reported the session as ENDED. That is not a subtle defect:
it is an outage classified as a dead token, which is the exact wording defect
R2b existed to remove, pointed the other way.

**It ran fully green. Exit 0, zero failed cells.** Deriving the live half as
well, changing nothing else, turned the same mutation into **6 red cells** —
and the control was one of them.

| live half | broken fold | result |
|---|---|---|
| literal `"active"` | outage reported as expired | **exit 0, 0 failures** |
| derived from `liveRun` | same mutation | **exit 1, 6 failures, control fires** |

## Why the control went blind

It compares `deadText !== liveText`. With one side a literal, the literal keeps
the two texts apart no matter what the code under test does. The control cannot
fail, so its green carries no information — the mechanism
`a-check-that-never-went-red-was-never-observed.md` catalogues, wearing a face
that file does not list: not an empty needle, not an unreachable failing state,
not a break that stops the build, but **a comparison one of whose operands the
proof supplies itself.**

It is also the exact twin of
`a-checker-must-not-share-the-code-it-checks.md`, with the sign flipped. There,
a checker reading its expected value out of the thing under test made AGREEMENT
true by construction. Here, a checker supplying one side of a comparison makes
DIFFERENCE true by construction. Same defect, opposite relation — so the test is
neither "did I share code" nor "did I hardcode", but: **could this assertion have
come out the other way, given the inputs I supplied?**

## The prediction, and why it is recorded

The plan for this fix said the control "is the only cell that would notice" a
predicate that reported expired for everything. **That was wrong, and wrong in
the direction that costs most:** with only one half derived the control notices
*nothing*. The reasoning was sound and the conclusion was false, which is the
whole argument for running the disproof instead of arguing it — the null result
in the table above took one run and settled what an hour of reading could not.

## The rule

Derive BOTH sides of a difference from the real path, or the difference measures
the literal. A paired control does not inherit strength from the stronger half;
it is bounded by the weaker one. And when a proof measures one input off a real
run and hand-types another beside it, the hand-typed one is where the next
defect hides — the measured neighbour makes the whole cell look measured.

## AMENDED (shifts commit 3, 2026-10-09): a scanner's needle must not be built from the text it also scans

The opposite failure: a differential that goes red when the product is RIGHT.
`proveDrawer.ts` L5 checks that STAFF's render of a shop account carries no five
consecutive characters of the account number, beside ADMIN's render as the control (both
from the real server, as above). It went red once in `prove_all`, `exits=[0, 1]`:
`proof-drawer-b20852 · ลงท้าย 2364` — a correctly masked render. The account number was
`99` + the run tag's digits, and the channel's LABEL was `proof-drawer-<run tag>`. The run
tag `b20852` put `20852` in both, and the scanner, reading the whole render, found it in
the label. About one run in three hundred draws five digits in a row: a red with a
half-life measured in runs, not days.

**The rule: when a check scans a render for a needle, the needle must share nothing with
the rest of that render by construction, and the proof must ASSERT that as a precondition
— and when the precondition fails, the scan is NOT RUN, never passed.** The account is now
built only from digits the label does not carry, and a precondition cell checks that the
label shares no 5-character run with it. Disproven: with the account's last five digits
planted into the label, the precondition alone went red and the mask cell printed
`[NOT RUN]`; the mask scan itself was not narrowed.
