# A gate that matches a keyword misses the engine's aliases for it

**Applies to** every guard, gate or refusal implemented by matching the NAME of a
thing — a SQL keyword, a statement, a command, a filename, a route — and hardest
where the gate exists because the consequence of missing one is not recoverable.

**The rule:** the authority on what a thing may be CALLED is the engine that
accepts the names, never the author of the pattern. Enumerate the target's
synonyms from the engine's own grammar before writing the pattern, and drive one
probe per synonym — a control over the spelling you thought of is precisely the
control that cannot see the spelling you did not.

## The instance

`server/scripts/prove_reconcile.py` runs destructive SQL against a restored copy
of the money database. Its gate 2 refuses any injection whose SQL touches a role,
because roles are CLUSTER-WIDE and the live database shares the cluster. The
pattern was:

    ROLE_SQL = re.compile(r"\b(alter|create|drop)\s+role\b", re.I)

PostgreSQL accepts `ALTER USER`, `CREATE USER` and `DROP USER` as documented
aliases of the ROLE forms, writing the same catalogue (`pg_authid`); and
`ALTER GROUP`, whose RENAME form is defined as `ALTER ROLE ... RENAME` and whose
ADD/DROP USER forms write role membership in `pg_auth_members`. All are
cluster-wide, which is the only property the gate cares about. **None of them
matched.**

Both patterns, run against the same five statements:

| statement | old pattern | new pattern |
| --- | --- | --- |
| `ALTER USER recycle_app BYPASSRLS` | **ADMITTED** | REFUSED |
| `CREATE USER recycle_probe LOGIN PASSWORD 'x'` | **ADMITTED** | REFUSED |
| `DROP USER recycle_probe` | **ADMITTED** | REFUSED |
| `ALTER GROUP recycle_app ADD USER recycle_owner` | **ADMITTED** | REFUSED |
| `ALTER ROLE recycle_app BYPASSRLS` | REFUSED | REFUSED |

**The admitted statement in row one is the sentence the gate's own docstring
names as the thing it exists to refuse.** That docstring reads: *"`ALTER ROLE
recycle_app BYPASSRLS` would be the natural way to prove check S4 — and roles are
CLUSTER-WIDE, so it would disable tenant isolation on the LIVE database sitting
in the same cluster. A proof that endangers production is not a proof … The gate
is mechanical (the SQL is scanned) rather than a promise to remember."*

So the gate refused the statement exactly as its docstring spells it, and admitted
the same statement in the other spelling. What the hole cost, had anyone written
that injection: tenant isolation disabled on real bills for as long as the
injection ran, and left disabled if the script died between apply and undo.

## Why no run could have found it

The gate **has** gone red, and always could. It refuses `ALTER ROLE` correctly,
and a positive control over `ALTER ROLE` passes for the right reason. Every
question this repo normally asks of an instrument answers reassuringly.

The failure is silent by construction, and the asymmetry is the point:

* a gate that **over**-refuses announces itself immediately — the refusal aborts
  the run, so a false positive is a non-start nobody can miss;
* a gate that **under**-refuses changes no output at all. No cell moves, no count
  moves, no exit code moves. There is nothing to notice.

It is found by reading the engine's grammar against the pattern, not by running
the suite. The disproof is one table: put the same inputs through the old pattern
and the new one, and require the old to ADMIT what the new refuses.

## Why it is not [[a-check-that-never-went-red-was-never-observed]]

That file's operative question is whether a check could **ever** have gone red.
Here it could, and did. Its mechanisms are all a check that cannot fire, fires
vacuously, or is looking at the wrong artifact — the instrument failing to reach
its subject. This instrument reaches its subject and answers correctly, on the
input the author thought of.

**A positive control proves the matcher WORKS. It says nothing about the
matcher's DOMAIN.** That is a different question and it needs a different
disproof, which is why this is its own file rather than a tenth mechanism there.

Not [[a-differential-control-is-only-as-good-as-its-weaker-side]] either: neither
operand here is a literal supplied by the test. Both spellings are real strings a
real engine really accepts.

And [[a-checker-must-not-share-the-code-it-checks]] already records this very gate
approvingly — *"the refusal enforced by a scan rather than a comment"* — which
was right, and stays right. A scan does beat a comment. A scan is only as good as
the set of strings it scans FOR, and that second half is what nobody checked.

## The gate whose self-test cannot live in the suite

`guard()` raises `SystemExit` on a match, so a probe injection carrying a role
statement **aborts the entire run** rather than reporting a pass. A gate whose
positive result kills the suite cannot be self-tested from inside it. The probe
here was therefore external and thrown away after it ran.

That has a consequence worth carrying rather than shrugging at: the alias list
has no cell, and a domain that exists only in the head of whoever last widened
the pattern is exactly the promise-to-remember the mechanical gate was written to
replace. **So the alias list is written at the pattern, in source, where the next
person editing that line must read it**, together with the instruction to re-run
the probe when the line changes. When the self-test cannot be a cell, the domain
must at least be a comment at the site — which is weaker, and is the best
available.

## How to apply

1. **Ask what else the engine calls this.** Before writing a pattern that matches
   a statement, command or keyword, read the grammar or the reference page for
   that statement and enumerate its documented aliases and equivalent forms.
2. **One probe per SYNONYM, in one run.** Not one control for the class. Four
   spellings need four refusals; a regex that catches one alias and misses another
   is this defect, and a single control cannot distinguish the two states.
3. **Measure the BEFORE.** Refusals under the new pattern prove nothing alone —
   they are consistent with a pattern that always refused. The evidence is the
   pair: ADMITTED under the old, REFUSED under the new, in one table.
4. **Keep the original capability in the same table.** `ALTER ROLE` refused by
   both patterns is the row that shows the widening did not trade one hole for
   another.
5. **Run the negative half and COUNT it.** Every input that must still pass, still
   passing, with the count measured in that run — 19 injections built, 19 through
   `guard()` — and never quoted from a plan or an earlier run.
6. **Know where the gate's failure aborts.** If a positive result kills the run,
   confirm the guard loop completes before any guarded action executes, so a false
   refusal is a non-start rather than a half-applied change; and write the domain
   at the pattern, because no cell can hold it.
7. **Ask it of the siblings.** Any other gate keyed on a surface form inherits the
   question. `.claude/hooks/pipe_gate.py` matches check scripts by FILENAME shape;
   whether a check reached by another surface form — a different path spelling, a
   `-m` invocation, a wrapper — still matches is **unmeasured here, and is the
   question rather than a finding.**
