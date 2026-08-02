# A checker must not share the code it checks — and must not reach past it

**Applies to** any reconciler, invariant check, audit script or assertion that
re-computes a value the production code already computes; and to any test that
breaks something on purpose in order to prove a check catches it.

One subject, two bounds, and they pull in OPPOSITE directions. Get either
backwards and the result is a checker that is silently useless — the worst kind,
because it prints a green.

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
