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
