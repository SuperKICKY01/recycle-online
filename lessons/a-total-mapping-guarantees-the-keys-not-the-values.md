# A total mapping guarantees the KEYS. Nobody checks the values.

**Applies** to every mapped type, total record or exhaustive `switch` used as a
completeness mechanism — the shape this repository reaches for whenever a set
must not gain a member silently: `OutboxRegistry`, `SessionSetters`,
`OutboxRow`/`OutboxResult`, a wording table keyed by a code, a per-kind policy
object.

**The rule.** The compiler's guarantee is over the KEY SET and stops there. A
member added to the union is a compile error at every literal of the type — real,
and it is why these shapes are worth reaching for. **But every VALUE in the
literal is unchecked**, and the value that says *somewhere else already handles
this* — a `null`, a no-op, a pass-through, an empty array — is a CLAIM ABOUT
OTHER CODE that nothing verifies. It is the one entry a reader copies from its
neighbour, and the totality mechanism is what makes them comfortable doing it: a
table that reddens when the set changes reads as a table that has been checked.

---

## The instance — `null` meaning "a branch above already says this"

P1.8b GATES widened the sign-out gate from a bill count to a map over every
outbox kind, and the status strip gained one table:

```ts
const OWED_STRIP_LINE: { readonly [K in OutboxKind]: ((n: number) => string) | null } = {
  bill_send: null,              // `pending`, `waitingOnMasterData` and `failed` above say it
  bill_void: (n) => `รอแจ้งยกเลิกบิล ${n} ใบ`,
  seller_create: (n) => `รอส่งผู้ขายที่เพิ่มใหม่ ${n} ราย`,
};
```

The mapped type does exactly what it is there for: a fourth kind is a compile
error until somebody writes its line. **And `bill_send: null` is not a line, it
is a sentence about three inputs of a different function** — that `pending`,
`waitingOnMasterData` and `failed` between them already speak for that kind's
rows. It is true today. Nothing checks it, nothing can, and it is written in the
same literal, in the same syntax, as the two entries that ARE checked.

**MEASURED, as the mistake rather than as a strawman.** `seller_create` set to
`null` — the same entry, on the wrong member, which is what a reader adding a
kind copies:

    npm run typecheck        -> exit 0
    npm run typecheck:app    -> exit 0

and the strip returned to `ส่งครบแล้ว` over a device owing a seller create: the
exact sentence the table had just been added to stop.

## The half that is worse: the 1152-cell sweep could not see it

`proveNotice` sweeps the strip over a full cross product and has done since 2c-7,
on this repository's own rule that the question which catches this class is *what
does the screen say for EVERY state*. P1.8b added the owed dimension to it, and
the negative cell reads: *with non-bill work owed, NO strip message claims the
work is all sent.*

Under the mutation above, **that cell stayed GREEN over all 1152 cells.**

The reason is the dimension, not the assertion. It is one boolean setting BOTH
non-bill kinds at once:

```ts
owed: owedWith({ bill_void: c.owedOther, seller_create: c.owedOther })
```

so in every cell where `seller_create` is owed, `bill_void` is owed too — its
line fires, the message is not the all-sent sentence, and the negative is
satisfied. **A dimension that moves N members together has N−1 differences it can
never distinguish.** The sweep's SIZE is what makes this hard to doubt: 1152 green
cells is a number nobody re-reads.

**What did move, and it is one cell:** the presence sibling written as *the strip
NAMES the owed work, BOTH KINDS*. And the per-kind staging in `proveOwedSurfaces`
— one seller owed and nothing else — reddened three, naming the sentence each
time. The full reading, both files, one mutation:

| instrument | cells red | what it could see |
|---|---|---|
| `npm run typecheck` (both programs) | **0** | nothing — the map is still total |
| `proveNotice`, the 1152-cell negative | **0** | nothing — its dimension moves both kinds together |
| `proveNotice`, the both-kinds presence sibling | **1** | that ONE of the two stopped being named |
| `proveOwedSurfaces`, per-kind staging | **3** | which kind, and which sentence |

**The negative alone was worthless here and the presence sibling carried the
whole claim** — which is the inverse of the usual advice in this directory, where
the negative is the assertion that can fail and the sibling is the guard against
silence. Both are needed and neither is the strong one by default.

## How to apply

1. **When you write a total mapping, ask of every entry: is this a VALUE or a
   CLAIM ABOUT SOMEWHERE ELSE?** A `null`, a no-op, an empty array and a
   pass-through are claims. Say what the claim is, in the entry, and say which
   code has to keep being true for it to hold.
2. **Give a per-member claim a per-member staging, enumerated FROM the set.**
   `for (const k of Object.keys(registry))`, one case each, so the next member
   joins the sweep with no edit. A cross-product dimension is for interactions
   BETWEEN axes; it is the wrong instrument for *does each member get its own
   answer*.
3. **Never let one dimension move two members of a set.** If a staging sets two
   at once, write down what that costs — it cannot separate them, and every
   assertion over that sweep is about their disjunction.
4. **The compile error is evidence about the KEY SET.** Do not let it stand in
   for a reading about the values. It is the same trap as a large successful
   sweep: 67 real sites found says nothing about the ones the instrument cannot
   see ([[a-quantified-sentence-names-no-member]]).

## Why no existing lesson reaches it

- **Not [[a-quantified-sentence-names-no-member]].** Its subject is a SEARCH —
  the term, and (as amended) the domain — over sentences and hand-written
  enumerations. Its remedy is *enumerate the set at run time*, and the strip
  DOES: `unspokenOwed` walks `Object.keys(owed)`. The run-time enumeration is
  correct and the defect is in the datum it enumerates over. That file's rules
  all return clean here.
- **Not [[a-docstring-that-states-a-filter-is-a-claim-about-its-caller]].** Right
  family and the closest sibling: this IS a claim about somebody else's code, and
  its discriminator — *could this become false without this file changing?* —
  answers yes. The difference is that a docstring is inert and this is
  EXECUTABLE, and that the totality mechanism actively argues for trusting it. A
  wrong comment misleads a reader; a wrong `null` removes a branch's coverage
  while the compiler certifies the table is complete.
- **Not [[a-check-that-never-went-red-was-never-observed]].** Every one of those
  1152 cells RAN and its reading was TRUE — the strip really did avoid the
  sentence in all of them. Nothing was vacuous, nothing was unstageable, and no
  guard failed by finding less. The reading was true and carried no information
  about the member that had been dropped, which is a question of RESOLUTION and
  not of whether the instrument fired.
- **Not [[a-differential-control-is-only-as-good-as-its-weaker-side]].** Its test
  — *could this assertion have come out the other way given the inputs I
  supplied?* — is the nearest general form, and it very nearly reaches. It does
  not, because there is no differential here and no literal side: the negative is
  a single assertion over a sweep, and it COULD have come out the other way over
  inputs the sweep does not contain. That file is about a comparison made true by
  construction; this is about a sweep whose axes cannot resolve the members they
  vary.

## Bounds

- **The mutation was run and reverted**, both files restored by copy and verified
  byte-identical with `cmp` (exit 0), both typecheck programs green afterwards,
  and `prove:notice` and `prove:owedsurfaces` green again.
- **No instrument was built, and none is available.** Nothing can read a `null`
  in a mapping and go and check the three inputs it is asserting about. What is
  available is the writing rule in *How to apply* and a per-member staging.
- **The figures are not pinned to a sha**, deliberately: the work carrying this
  file was uncommitted when the sentence was written, so the only sha available
  is the one that does NOT contain it — `CLAUDE.md § Conventions`
  "PIN A CLAIM TO A COMMIT". The cell counts in the table are statements about
  one mutation run and are reproducible from the mutation, which is named in full
  above.
- **A SECOND FINDING CAME OUT OF THE SAME COMMIT AND IS NOT THIS LESSON.** The
  sign-out GATE and the sign-out SHEET were fed two different numbers by one
  caller — `mine + mineBlocked` and `mine` — so one bill parked on missing master
  data drew a confirmation card with a working-looking button over a gate that
  refused. That is an INSTANCE of [[two-green-proofs-do-not-cover-the-seam]],
  which already names `gate/sheet` as a boundary where two correct halves compose
  into a screen that lies, and its prescribed remedy found it unchanged. Recorded
  here rather than as a lesson of its own, because a prediction landing is
  evidence FOR that file and not a new rule.
