# A default exit code is a default verdict

**Applies** to every proof, checker and disproof whose verdict is an exit code
the process assigns LATE — in a final `.then`, at the end of `main`, in a
summary block — on any runtime whose natural exit status defaults to success.
Node is the measured case: an UNSETTLED top-level await is not an error. No
throw, no rejection, nothing left that counts as work — the event loop drains
and the process exits with the DEFAULT code, which is 0. Every line of the run
up to the stall prints normally, the verdict line is absent, and the status
that exists to back the verdict says green.

**Measured 2026-08-19**, node v24.13.0, P1.18 stage 3 commit 1. The
leaked-pass-lock disproof starved `proveOutbox`'s gated-void staging: the
transport's first void call never arrived, `await gated.firstVoidStarted`
could never settle, and the process ended cleanly mid-proof. `npm run
prove:outbox` reported EXIT=0 over a log holding NINE `[FAIL]` cells and no
`OUTBOX_EXIT=` line. **A deliberate break — a run whose entire job was to find
which cells move — read as a pass**, and was caught only by opening the log
and registering the exit line's absence.

## Why the existing defences did not reach it

- **"Run it bare and read its own status"** — the machine-footgun family's
  core rule — was FOLLOWED, and the status lied. Nothing had assigned an exit
  code yet, so the process reported its default, and a default exit code is a
  default verdict of success: the same shape config-defaults-must-fail-closed
  records for identity ("a default value is a default IDENTITY"), one layer
  down, about the one value every check in this repository ultimately rests
  on.
- **"The absence of the exit line is the signal"** exists twice already — in
  the restore footgun, and in the never-went-red family's rule that a disproof
  is judged by whether it printed its exit line (named without the filename,
  for that file's own eleventh-mechanism reason). Both are READING
  disciplines, and both were written against artefacts whose exit CODE
  disagreed with the absent line: a Python `fail()` that calls `sys.exit(1)`
  before reaching its print, and a crash. Reading either signal correctly went
  red there. Here the code AGREES with the green the absence invites — both
  signals point the same wrong way — and only a reader who treats absence as
  failure REGARDLESS of the status survives it. A reading rule that must beat
  a contradicting green status is a rule that loses eventually.

## The rule

**Preset the verdict to red before the run starts, and let only a COMPLETED
run write anything else.** `process.exitCode = 1` at entry, cleared by the
final tally and by nothing else. Every path that ends the process without
finishing — the drained event loop included — then exits non-zero, and the
absent exit line is BACKED by a red status instead of contradicted by a green
one. Re-measured under the same break after the preset: EXIT=1, same truncated
log, same absent exit line — the truncation itself is now red. The reading
rule survives as the other half; this is the writing half, which makes the
artefact incapable of the false green rather than asking every future reader
to notice an absence.

## Where it stands

Applied in `proveOutbox.ts`, whose own disproof found it. **Every other proof
in this suite shares the exposed pattern** — verdict assigned in a trailing
`.then`, nothing preset — measured by reading on the same day, and
deliberately NOT swept here: the sweep was outside the commit's declared file
set and is queued. A proof with no staged gate reaches the drain only through
a hang-shaped bug, which is exactly the moment its false green costs most.

## Bounds

- Node's documented behaviour on any machine, not a property of this box —
  the two-homes test sends it here and not to Machine footguns.
- The preset works because node uses the LAST value assigned to
  `process.exitCode` at a natural exit. A literal `process.exit(0)` anywhere
  would still lie; none of these proofs calls one.
- It removes the INCOMPLETE-run false green only. A run that completes with a
  vacuous or misaimed verdict is the never-went-red family's subject, not
  this file's — every assertion in the measured run was sound, and what lied
  was the process carrying them.

## AMENDED (the shifts unit, commit 3, 2026-09-29) — A COLLIDING EXIT CODE IS A BORROWED VERDICT

The preset closes the drained-event-loop hole. It does not close this one: a run
that never STARTS, whose failure code happens to EQUAL one of the proof's own
success codes.

**Measured.** `npm run prove:counter -- --offline` exits **2** by design when every
headless cell passes and the live round is skipped (the `prove:forbidden --offline`
convention: "incomplete", never 0). A disproof of the drawer's R6 cell deleted the
only read of a parameter; `tsc` refused the build — and **`tsc` exits 2 on a type
error**. `npm run build` stopped, the proof never ran, and npm exited **2**, with
zero `[FAIL]` lines and **no `PROVE_COUNTER_EXIT` line**. By exit code alone that is
"headless green, live skipped"; the disproof driver reported the predicted cell as
"PREDICTED BUT GREEN" — the conclusion it invites is that the cell cannot see its
break, a vacuous-cell verdict about a cell that was never executed. Only the absent
exit line told the two apart. Re-aimed so the mutation still compiled, the same
break reddened exactly the predicted cell.

**The rule, and it is this file's reading half made mandatory:** when a proof
reserves a NON-ZERO code as a success-like outcome (`--offline` = 2, "incomplete"),
its exit code no longer separates "ran and passed" from "the toolchain in front of
it failed" — `tsc` 2, Python's argparse 2, a shell's misuse 2. Judge such a run by
its OWN printed `<NAME>_EXIT=<n>` line and NEVER by the process status; a driver
that automates disproofs must treat an absent exit line as "DID NOT RUN", before it
compares a single cell (the drawer's disproof driver does, since this run). The
writing-half repair — a reserved code no tool in the chain uses — is not made
here: `--offline` = 2 is a convention several proofs share, and changing it is a
suite-wide decision, recorded at `OPEN_ITEMS.md`.
