# Printed code in a design document is run by nobody

**Applies** to every code block written into an artefact nothing executes — a
design section, a plan, a phase brief's staging sketch, an example no doctest
runs. The block is written like code and reviewed like prose: no typechecker
reads it, no proof runs it, it has no exit code, and it invites the reader to
execute it in their head, which is how it comes to be reviewed as if it had been
run. A head is not an instrument.

**The rule.** State the DECISIONS, which prose and declarations can carry — the
types, each interface member with its contract, the policy axes and what every
value means, what is shared and what is per-kind, and the dynamic behaviour as
RULES, each paired with the acceptance criterion that turns red when an
implementation breaks it. **Print no statement sequence.** When the mechanism's
shape must exist as code, write it where something runs it — under source,
reached by the typecheckers and the proofs — and let the document point at it.

---

## The measurement — three drafts, two reviews, every defect in the printed block

One design (`ROADMAP.md § P1.18`, stages 2 through 2c, 2026-08-18/19) printed
its drain loop three times. Every defect either independent review found in the
MECHANISM lived in the printed code; none lived in the rules stated as prose
beside it.

- **Draft one** printed a loop that re-selected its batch's first row under
  `while (true)`: it could not advance to a second row, did not terminate for a
  kind whose retries stay owed, and carried a `rereadAfterEach` flag no printed
  line read — a policy member whose every value produced the same loop.
- **Draft two, written to repair draft one by a session holding draft one's
  failure in front of it,** printed a pass lock acquired and released on no
  path, declared a schedule member (`nextAttemptAt`) no printed line called, and
  reported skips through a `noteSkip` with no channel out of the pass.
- **Each block passed the session that wrote it and fell to the next independent
  reader**, one review later. That is the datum: the repair of a printed defect
  arrived carrying three new printed defects, so review does not converge on
  printed code — nothing red-greens it, and each reader starts over with a head
  for an interpreter.

Draft three printed nothing. The loop was replaced by the rule list, the reason
was recorded in the design at the site where the block used to be, and the two
findings the printed code had been hiding from every proof — an unpinned
cross-kind drain order, and a staging the stores cannot represent — were
repaired as a stated rule with a criterion, and a deleted cell with its residue
stated.

## What makes this artefact class exempt from every instrument

Every discipline this repository owns is built on execution: a typecheck's exit
code, a proof run twice, a citation checker's counts, a disproof that must
redden a named cell. A code block in prose is exempt from all of it BY
CONSTRUCTION — there is no artefact to run, so there is nothing for a control to
be about and no state in which anything goes red. The defect is not that a
check was weak; it is that the artefact class admits no check while LOOKING like
the most rigorous part of the page.

Type declarations printed in the same document are the bound, not an exception:
an interface or a union in prose is checked by no compiler either, but it fails
as a CONTRACT — a wrong member list surfaces when the criteria derived from it
are staged — not as a hidden execution. The line is drawn at STATEMENT
SEQUENCES: loops, lock protocols, ordered mutations. Those are exactly what a
reader simulates instead of checks.

## Why no existing lesson reaches it

Sibling of the never-went-red family's two document-borne mechanisms — the pair
found in one Prove: document, named here without that lesson's filename because
an index line carrying it would make every filename-handle citation resolve
twice, which is that file's own eleventh mechanism. Separated by direction:
there a document carried an INSTRUMENT that was never armed, and the remedy is
to read the instrument adversarially before dispatch; here the document printed
the MECHANISM itself, there was never an instrument to arm, and no adversarial
reading converged in two attempts. The docstring lesson is the other neighbour —
prose no instrument reads — but its discriminator asks whether the sentence
could turn false without this file changing, and a printed loop is not a claim
about another file: it is wrong in place, from the moment it is written.

## How to apply

1. **Writing a design: no statement sequence.** Types, contracts, policy values,
   and rules-with-red-cases carry everything a mechanism decision needs.
2. **Reviewing a design: treat any code block as unexecuted by definition**, and
   ask for the rule it encodes and the criterion that reddens when the rule is
   broken. A block you can only check by executing it in your head is the
   finding, before any defect in it is.
3. **When the shape must be shown, put it where something runs it** and point at
   it — the document cites the file; the file gets the typecheckers and the
   proofs.

## Bounds

- The three-drafts measurement is one design in one repository; the mechanism —
  written like code, reviewed like prose, executed by nothing — is structural
  and carries the lesson.
- Nothing here forbids code blocks in artefacts something DOES execute (a proof
  file's source, a script) or quoted OUTPUT kept as evidence, which this
  repository's disproof practice requires.
- No instrument was built and none can be: a fence around "code blocks in
  markdown" would also catch quoted evidence and printed types. This file is
  what stands between the next design and the same result.
