# A docstring that states a FILTER is a claim about its CALLER, and nothing checks it

**Applies to** every comment that says what a value EXCLUDES, CONTAINS, is
ALREADY VALIDATED for, is SORTED by, or has had done to it before arrival — on a
function parameter, an interface field, a config key, a queue message. Those
sentences are not about the code they sit on. They are about code somewhere else
that the reader cannot see and no tool will compare them against.

**The rule:** a field's docstring may describe what the field MEANS. The moment
it describes what has been done to the value before it arrives, it has become an
unverified assertion about every call site, and it will outlive the one that made
it true.

## The instance

`mobile/src/sync/statusNotice.ts`, the field the status strip's whole sentence is
built from. At `4bde6e1` its documentation read, in full:

    /** Bills queued to send (pending + syncing). Excludes parked ones. */
    pending: number;

**The second sentence was untrue of every value the field ever received.**
`App.tsx` fed it `listByState('pending') + listByState('syncing')`, which carries
its own `sync_state = ?` predicate and excluded neither parked bills nor other
accounts'. So the operator read a count that included bills they did not own,
could not send, and could not clear by any action available to them — and the
sign-out refusal read the same number, so a device could refuse to be handed over
because of somebody else's work.

Corrected at `959f22d`, which is also the commit whose `git log -S` shows the
false sentence leaving the tree.

## Why every instrument in this repository is blind to it

This is the part that generalises, and it is uncomfortable:

- **Both typechecks passed.** `pending: number` was always a correct type. A
  comment carries no type.
- **Every proof was green**, including proofs that drove `statusNotice` directly.
  They passed the field whatever the sentence claimed, so the sentence could not
  make a cell move.
- **The diff was read** — more than once, across several passes that touched this
  file — and the sentence reads as *true* in isolation. It describes a sensible
  field. Nothing about it looks like a defect.
- **A control cannot reach it.** A positive control proves an instrument works on
  the inputs it contains; there is no instrument here at all, so there is nothing
  for a control to be about.

What finally found it was somebody reading the CALLER and the CALLEE in the same
pass, for an unrelated reason — the strip's numbers were being rewritten. That is
not a method. It is luck with a deadline.

## The discriminator

**Ask of any sentence in a docstring: could this become false without this file
changing?**

If yes, it is a claim about somebody else's code and nothing will tell you when
it turns. "Excludes parked ones" goes false the day a caller passes an unfiltered
number, in a commit that never opens this file — and there is no diff on which
the two appear together.

Contrast with a sentence that cannot rot that way: "the count the operator reads"
is about meaning, and only an edit here can falsify it.

## How to apply

1. **Do not state a filter in a docstring. Name the filtered value instead.** The
   repair here was not better wording — it was `UnsentBreakdown`, a type with four
   named fields, so "this person's, waiting on a connection" is carried by the
   NAME and the caller cannot supply the wrong thing without saying so.
2. **Where a precondition genuinely must be stated, make it a type or a check.**
   A branded string, a narrow interface, an assertion at the boundary — anything
   that fails when the claim does. A comment is the one form that cannot.
3. **When you do write one anyway, write it as an obligation and not a fact.**
   "CALLERS MUST pass the owner-filtered count" tells the next reader where to
   look; "Excludes parked ones" tells them the question is already settled.
4. **Keep the false version when you correct one.** It is the only evidence of
   how long it stood and of what it looked like while it was believed —
   `ARCHITECTURE.md § 13` and `PROJECT_STATUS.md` follow the same rule for the
   same reason. Silently replacing it leaves a file that has always been right.
5. **When a phase rewrites what a number MEANS, re-read every docstring on the
   path it travels.** This one survived four commits that changed the number's
   value and none that changed its description.

## Where this sits among the others

Sibling of [[a-warning-in-one-file-does-not-protect-the-next]], and the opposite
failure: there the note was TRUE and did not travel to the next site; here the
note travelled perfectly and was FALSE. Both are about prose that no instrument
reads, and neither is fixed by writing more of it.

Not [[a-green-cell-is-evidence-about-the-assertion-not-the-claim]]. Every
mechanism in that file is an ASSERTION that fires and measures something
adjacent to what you meant. This is not an assertion at all — nothing executes a
docstring, so there was never a cell to be green.

## AMENDED (P1.8b GATES, 2026-08-25) — THE CLAIM IS NOT ALWAYS PROSE. IT CAN BE A VALUE IN A TOTAL MAPPING, AND THEN IT IS EXECUTABLE

**The instance is this file's own subject wearing the ONE disguise its How-to-apply
recommends as the cure.** Item 2 above says: *where a precondition genuinely must
be stated, make it a type or a check.* Here the claim IS in a type — in the
literal of a mapped type over a union — and the type still cannot see it.

`mobile/src/sync/statusNotice.ts` gained a wording table when the status strip had
to stop claiming the work was sent while a non-bill kind was owed:

```ts
const OWED_STRIP_LINE: { readonly [K in OutboxKind]: ((n: number) => string) | null } = {
  bill_send: null,              // `pending`, `waitingOnMasterData` and `failed` above say it
  bill_void: (n) => `รอแจ้งยกเลิกบิล ${n} ใบ`,
  seller_create: (n) => `รอส่งผู้ขายที่เพิ่มใหม่ ${n} ราย`,
};
```

The mapped type does exactly what it is reached for: a FOURTH kind is a compile
error until somebody writes its line. **That guarantee is over the KEY SET and it
stops there.** `bill_send: null` is not a line — it is a SENTENCE, in executable
form, asserting that three separate inputs of a different function already speak
for that kind's rows. It is true today. It could become false without this file
changing, which is this file's own discriminator, answered *yes*: the three
inputs are supplied by `App.tsx`.

**MEASURED, as the mistake a reader makes rather than as a strawman.** The same
entry, on the wrong member — which is what somebody adding a kind copies from its
neighbour:

    OWED_STRIP_LINE.seller_create = null
      npm run typecheck      -> exit 0
      npm run typecheck:app  -> exit 0

and the strip went straight back to saying `ส่งครบแล้ว` over a device owing a
seller create: the exact sentence the table had been added to stop.

### What this ADDS to the file, rather than repeating it

- **Item 2's remedy has no move here.** "Name the filtered value instead" and
  "make it a type" both assume you can decline to make the claim. A TOTAL mapping
  forces an entry for every member; there is no way to say nothing. So the rule
  gains a clause: **when a total mapping forces an entry, the entries that mean
  *handled elsewhere* are the claims — mark them, say WHICH code has to stay true,
  and give them a cell.**
- **The "why every instrument is blind to it" section has a bullet that is FALSE
  of this instance.** It says *a control cannot reach it — there is no instrument
  here at all, so there is nothing for a control to be about.* Here there IS an
  instrument: a 1152-cell cross product over the strip, with a control, both
  green. It could not resolve the defect for a reason that belongs to
  [[a-green-cell-is-evidence-about-the-assertion-not-the-claim]] and is recorded
  there — the sweep's own dimension moved two members together, so no cell in it
  could separate them. **The two halves of this instance separate exactly along
  the two files' own boundary**, and the measurement lives there.
- **The totality mechanism is what makes it comfortable.** A literal that reddens
  the moment the union grows reads as a literal somebody is checking. Nothing is
  checking the values.

### Separated from the two neighbours it is nearest

- **NOT [[a-narrowing-type-is-not-a-barrier-to-the-object]].** That is about
  NARROWING — a type with fewer fields refuses to let you NAME the missing ones
  and does not refuse to CARRY them. This is TOTALITY, the opposite operation, and
  its compile-time promise is kept in full. There the false belief is about what
  the type keeps OUT of a passed object; here it is about what an entry the type
  demanded happens to SAY. Its remedy — convert at the boundary, field by field,
  never by a spread — has nothing to convert.
- **NOT [[a-check-that-never-went-red-was-never-observed]].** Every mechanism
  there is an instrument that ran and produced a reading carrying no information.
  The 1152 cells ran and every reading was TRUE — the strip really did avoid the
  sentence in all of them — and the negative had a control that fired correctly.
  Nothing was vacuous and nothing was unstageable.
