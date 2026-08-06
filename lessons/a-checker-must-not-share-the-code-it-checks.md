# A checker must not share the code it checks — and must not reach past it

**Applies to** any reconciler, invariant check, audit script or assertion that
re-computes a value the production code already computes; and to any test that
breaks something on purpose in order to prove a check catches it.

One subject, three bounds. The first two pull in OPPOSITE directions; the third
arrived later and is amended in at the end. Get any of them backwards and the
result is a checker that is silently useless — the worst kind, because it prints
a green.

---

## Bound 1 — duplicate ARITHMETIC, never duplicate a CONVENTION

`server/scripts/reconcile.py` has to answer two questions that look identical
and are not:

* does `item.amount` equal `net_weight × unit_price`?
* does the Buddhist-era year inside `doc_no` match the year the bill arrived in?

**The arithmetic is duplicated on purpose.** The checker evaluates
`round(net_weight * unit_price, 2)` in Postgres NUMERIC. `bills._line_amount`
evaluates `Decimal.quantize(ROUND_HALF_UP)` in Python. Two implementations, two
engines, one specified answer — both round ties away from zero, and every value
is non-negative by CHECK, so they MUST agree. **A checker that imported
`_line_amount` would agree with a bug in `_line_amount`.** It would confirm that
the code equals itself, which is true of every program ever written.

**The convention is NOT duplicated.** `_be_year` is imported from `bills.py` —
the same function `doc_no` itself is built from. Writing
`extract(year from x AT TIME ZONE '+07') + 543` in the checker's SQL would have
been a second derivation of a choice, not a second computation of a fact. There
is no independent authority on which timezone a shop day belongs to; there is
only the decision, recorded in one place. A copy of it is correct-by-luck for
most of the day and wrong across Bangkok midnight — which is the whole of
[[be-year-comes-after-the-timezone]], **and whose amendment is precisely this
failure**: the rule was applied to production and the code that CHECKS it was
never swept.

The test that separates them:

> **Could a second competent author, given only the specification, arrive at the
> same answer?** For arithmetic, yes — so duplicate it, and let the two disagree
> when one is wrong. For a convention, no — they would arrive at *an* answer,
> and it would differ at the boundary neither author tested. Import it.

Getting it backwards fails in both directions, and both are silent:

| mistake | what you get |
|---|---|
| checker imports the arithmetic | agrees with the bug. Green forever. |
| checker re-derives the convention | red every new year over a defect that does not exist — or green over one that does, because the copy and the original are wrong the same way |

The second row is the dangerous one. A checker that cries wolf annually gets
switched off, and a checker that is switched off is worth less than none,
because someone believes it is watching.

## Bound 2 — a destructive proof must not be able to reach past its copy

`prove_reconcile.py` breaks each invariant on purpose in a RESTORED COPY and
asserts the checker catches it by name. One check could not be proven this way,
and the reason is the lesson:

**S5 asserts `recycle_app` is NOSUPERUSER + NOBYPASSRLS. The only way to make it
fire is `ALTER ROLE recycle_app BYPASSRLS`. ROLES ARE CLUSTER-WIDE.** The live
database shares the cluster with the copy, so that one statement would disable
tenant isolation on real money data for as long as the injection ran — and leave
it disabled if the script died in between. `ALTER TABLE ... DISABLE ROW LEVEL
SECURITY` is database-scoped and safe; `ALTER ROLE` is not. They sit one line
apart in any injection list and look equally harmless.

So: **know which of your objects are scoped to the database and which to the
cluster, before writing anything that breaks them on purpose.** Roles,
tablespaces and cluster settings are shared. A "restore into a scratch database"
does not sandbox any of them.

The check was left UNPROVEN BY EXECUTION and labelled as such in the output,
rather than proven dangerously or dropped quietly. And the reason is enforced
mechanically — the harness scans every injection's SQL for `ROLE` statements and
refuses them — because a reason that lives only in a comment decays into a
comment nobody reads.

---

## The corollary that made both bounds visible

An injection test only means something if the invariant is **clean before and
clean again after**. Assert three things per injection, never one:

1. the check fires, with the expected count;
2. the report NAMES the actual row (assert against the human report, not a
   machine format — "it must scream" is a claim about what a person reads);
3. **undoing the injection returns the database to a clean run.**

Without (3) a checker whose red never clears, or whose green is sticky, passes
the whole suite. Nineteen injections here each carry all three, and (3) is what
turns them from nineteen assertions into nineteen *measurements*.

See also [[proof-must-run-twice]] — a proof that MUTATES its own fixture must
restore that fixture itself, or its second run measures its first run.

## Amendment (sign-out proof, R1): Bound 3 — the expected value must not come from the subject

Bounds 1 and 2 are about the checker's CODE. This one is about its VALUE, and it
survives every fix the other two ask for: a checker can share no code at all with
what it checks and still be worth nothing, because the number it compares against
was fetched from the thing on trial. Three instances, three languages, one shape.

**1. `mobile/src/proof/proveSignOut.ts:273-304` states it in its own words**, in
the comment left standing where the defect was:

> This used to compare what the applier wrote against CLEARED_SESSION itself,
> which proves PASS-THROUGH and nothing more: the applier reads that same
> object, so the two agree by construction and every cell stays green whatever
> the constant is changed to. Eight of the ten values were unpinned in exactly
> that way — only token (through sessionStateOf, below) and online (=== null)
> had an assertion that could fail.

Ten values, eight of them unfalsifiable. No line of the assertion was wrong. The
expected side simply came from the subject, so `S2` was a real test of "the
applier writes every key exactly once" and simultaneously no test at all of WHAT
it writes. The fix is the boring one: the expected values are now literals in the
proof file, each carrying where in `src/` the specification says that value.

**And the mutation test did not fire — for a reason that is its own trap.** All
eight were substituted in `CLEARED_SESSION`, one field per run, to a
wrong-but-plausible value. Every one was a COMPILE error — `TS2322` at
`signOut.ts`, *"Type 'true' is not assignable to type 'false'"* — so the build
stopped and the proof never ran. **A mutation the compiler catches first has not
tested the runtime check.** The literal types are a real guarantee, and a
different one; what the proof adds is the single case `tsc` cannot see, the
interface literal and the constant widened TOGETHER.

**2. The definition can come from the subject too, not just the value.**
`proveSync.ts:603`, `:666` and `:888` each assert `queueHealth`'s `.offline`, and
each is correct for the input it sends. The function is still wrong on an input
none of them sends. `queueHealth.ts:302`:

```ts
const offline = blocking && !serverRefusing;
```

`serverRefusing` is `head.first_server_error_at !== null` (`:300`), and
`markSessionExpired` (`SqliteLocalStore.ts:361`) sets `first_server_error_at =
NULL, server_error_attempts = 0`. So a queue jammed by a dead token has
`blocking` true and `serverRefusing` false, and reads as OFFLINE — "waiting for
the network", on a device whose network is fine.

The proof shares no code with `queueHealth`; it imports it and calls it, which is
what a proof should do. What it inherited is the SUBJECT'S DEFINITION of the
property. Proof and function were written together from one idea of what
"offline" means, so they agree about the three cases that idea covers. A second
author given only the specification — *offline means the device cannot reach the
server* — would have asked what happens when the server answers 401, which is
Bound 1's test pointed at a definition instead of at a formula. **A green here is
a claim about coverage, and nothing in the output says so.** It reaches no screen
today; that is why it is latent, and not why it is acceptable.

**3. Same shape outside any language with types.** A CR-counting check at this
terminal ran `grep -c $'\r'` inside a `for` loop. `$'\r'` reached grep as an
EMPTY pattern, an empty pattern matches every line, and the count came back equal
to each file's line count. It was read as a CR count. The number was real, it was
just a property of the subject echoed back — a measurement that returns its own
input. (Not recorded in this repo: no `.sh` file and nothing in `git log`. It
happened in a session, and is written down here because that is the only place it
now exists.)

The test, and it is not the same question as Bound 1's:

> **Where did the expected value come from — and could a wrong subject have
> produced it?** Write it down by hand from the specification, never from the
> object, the constant, or the function under test. Then break the subject and
> watch the cell turn red. If it stays green, or if something upstream — a
> compiler, a literal type, a build step — stops the break from ever reaching the
> assertion, then the cell has not been observed.

That last clause is the general rule and it has its own file:
[[a-check-that-never-went-red-was-never-observed]] — Bound 3 is the case where
the un-fireable assertion got its value from the subject; that lesson covers the
ones where it had no value to get. Its sibling on the production side is
[[a-defaulted-getattr-is-a-silent-dead-branch]]: a branch nothing was ever seen
to enter, for the same reason a cell nothing was ever seen to redden.
