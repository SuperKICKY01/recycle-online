# A warning written in one file does not protect the file beside it

**Applies to** every hazard this repository has already paid for and written down
at the site where it bit — a comment at the line, a note in a docstring, an
entry in a module header. Those notes are worth keeping. This is about what they
do NOT do.

**The rule:** a warning defends the line it sits on. It does not defend the next
file, the next author, or the same author an hour later, because nobody reads a
file they are not editing. **What defends the second site is an acceptance
criterion that the mistake would fail.** If the hazard can only be caught by
somebody remembering, it will be paid for again, and the interval can be shorter
than a single session.

## The instance

`backup_db.py` carries this at its superuser check, in its own words:

> `rolsuper::text` renders 'true'/'false' (psql only shows t/f for an uncast
> boolean) — comparing against 't' here silently failed every check once.

A precise, dated, correctly-sited warning about a real trap on this box: casting
a boolean to `text` in a psql query yields `true`/`false`, not `t`/`f`.

In the same repository, in the same session, `restore_db.py` grew a new presence
probe that asked the database which relations existed:

    select 'product_prices', (to_regclass('"public"."product_prices"') is not null)::text

and compared the answer with `r[1] == "t"`.

**All thirteen keys reported `MISSING` against a database that held every one of
them.** Every relation was there. The restore was perfect. The check said nothing
had arrived.

The warning was one directory entry away, in the file this script is a sibling of,
about the identical construct, and it did not help — because writing
`restore_db.py` does not involve reading `backup_db.py`, and there is no moment in
that work at which a person would go looking.

## What actually caught it, and it was not a person

The acceptance criterion for the change was written before the change, and it was
not "exit 0". It was:

> the two 0009 dumps: exit 0, **and `directory.shop_codes` PRESENT as an OK row
> with a number on both sides**. A green that reaches exit 0 by not asking about
> that key is the wrong fix and looks like the right one.

That criterion fails the bug instantly and loudly: thirteen `[FAIL] … restored=MISSING`
rows and exit 1. **An exit-code criterion would not have.** The bug's natural
failure direction here happened to be red, but the same mistake pointed the other
way — a comparison that treats every key as absent and has no keys to check —
reaches exit 0 by asking nothing, which is exactly the shape
[[a-check-that-never-went-red-was-never-observed]] catalogues and exactly what the
"number on both sides" clause was written to forbid.

**The defence generalises past this bug.** "Exit 0" is satisfied by a check that
did the work and by a check that skipped it. "This named row is present, and both
sides of it are numbers" can only be satisfied by a check that asked the question
and got an answer.

## Why this is not just "write more tests"

The claim is narrower and it is about WHERE the knowledge has to live. This repo
already does the right thing at the first site: the hazard is recorded at the line
that suffered it, which is what
[[a-gate-that-matches-a-keyword-misses-its-aliases]] concluded when it put an
alias list at a pattern that no test cell could hold. That remains correct. What
this file adds is that a note at the site is a floor and not a ceiling: **the
second site needs its own mechanism, and the cheapest mechanism is an acceptance
criterion phrased as an observation rather than as an outcome.**

Note also what did NOT catch it. The change was reviewed while being written. Its
diff was read. The helper's docstring is careful and correct about identifier
quoting, several paragraphs long, and sits eight lines above the defect. Attention
was fully engaged on the file and on the right subject, and the bug shipped
anyway.

## How to apply

1. **Write the acceptance criterion before the code, and phrase it as an
   observation.** "Row X present with a number on both sides", "the count moved
   from 24 to 20", "the report NAMES this doc_no" — never "it passes", never
   "exit 0".
2. **Ask what a check that did nothing would print**, and make sure your
   criterion refuses it. If a no-op could satisfy the criterion, the criterion is
   about the process exiting, not about the work.
3. **When you write a warning at a site, ask which OTHER sites share the
   construct** and whether anything would make them fail. Grep for the construct,
   not the symptom — `::text` here, not "boolean". This is the sweep
   [[be-year-comes-after-the-timezone]] requires for a computation, applied to a
   hazard.
4. **Do not upgrade a comment into a promise.** A note at a line is worth writing
   and worth keeping; it is not coverage, and a plan that relies on someone
   reading it has no coverage at that point.
5. **Count the interval.** Here it was under an hour, in one session, by one
   author, with the warning in a sibling file. Any argument of the form "we wrote
   it down, so we will remember" has to survive that number.
