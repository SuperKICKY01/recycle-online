# A migration stack is a log, not a schema

**Context.** 2026-08-18, re-deriving how many places encode the grade set A-D. A
paragraph already committed to `OPEN_ITEMS.md` named `purchase_bill_items.grade`
as one of those places and reasoned about its consequence: a HISTORICAL BILL
LINE, protected by hard rules 5 and 6, whose old rows "will carry grades a shop
may later stop defining". Every clause of it was false. That column does not
exist. `0001_initial_schema.py:253` created it and
`0003_move_grade_to_sellers.py:25` dropped it on upgrade, so the site was real
in the source text and dead in the database — and no third file records the
difference.

**Rule.** A migration stack is a LOG OF WHAT WAS DONE, not a description of what
IS. To state what the schema currently holds, read the HEAD STATE: query the
database (`pg_constraint`, `information_schema.columns`), or where that is not
available read the stack FORWARD to head with every DROP and ALTER applied — and
say which of the two you did, because they are not the same measurement. A grep
over `migrations/versions/` measures HISTORY, not state:
every hit is something that was true at one revision, and a later file may have undone it.

**Why (the failure it prevents), and the wrong number is the least of it.**
Because the drop happened, a bill line carries no grade at all — and hard rule 6
is why it never needed to. The line stores `unit_price` AND `list_price`
(`0001_initial_schema.py:257-258`), so a bill records the PRICE a grade
produced, never the grade itself, and a later change to the grade model cannot
reach a historical bill by construction. `0003` closed that deliberately: its
docstring says line items do not carry a grade and that per SRS 1.6 the grade
belongs to the SELLER. So the paragraph did not merely miscount. IT INVENTED A
RISK FOR A CASE THE SCHEMA HAD ALREADY DESIGNED AWAY, and filed it as an open
consequence for whoever plans the per-tenant grade model. A wrong fact costs a
correction; an invented risk costs whatever work somebody does about it, and
that work is indistinguishable from diligence while it is being done.

**Why nothing caught it, and none of the three are fixable by trying harder.**
The grep is a CORRECT instrument answering a NEIGHBOURING question, so it
returns a plausible integer, no error and no red — there is no failing state for
a control to be about. No proof can see it, because nothing executes a sentence
in a status file. And the fact was already written down ONE DIRECTORY AWAY:
`schema-audit.md`'s own "Where proven" paragraph states that `0003` drops the
column. It did not help, because that file's RULE points the other way — it is
about auditing a migration you are WRITING, against the agreed schema — so
nobody reading for a rule about counting live constraints would ever open it.
That is `a-warning-in-one-file-does-not-protect-the-next.md` with a lesson file
as the warning that failed to travel.

**How it got in.** The paragraph came from the advising session and was accepted
into a permanent file without the migrations being opened. CLAUDE.md's "A REPORT
IS A CLUE, NOT A SOURCE" already governs that promotion; what this records is
why a schema report is the easy one to wave through — it cites a filename and a
line number, and both are real. The citation resolves. Only the tense is wrong.

**Where proven.** Both figures re-derived 2026-08-18, each by its own command.
SOURCE TEXT encoding A-D: five — `product_prices.grade` and
`purchase_bill_items.grade` at `0001_initial_schema.py:169` and `:253`,
`ck_sellers_grade` at `0003:31`, `ck_tenants_default_grade` at `0010:52`, and
`Grade = Literal["A", "B", "C", "D"]` at `server/app/master.py:119`
(`git grep -n "IN ('A', 'B', 'C', 'D')" -- server/`, plus a search for the
`Literal`). CHECK constraints IN FORCE at head: three — the same list minus the
dropped column, minus the `Literal`, which is a Python type and not a database
constraint. THE GAP IS TWO AND ONLY ONE OF THEM IS THE DROP, which is the second
way the bare word "sites" misleads.

**BOUND, and it is the same weakness one level up.** The three-figure above was
itself derived by READING the stack forward, not by querying a database; no SQL
was run in the phase that wrote this. A careful forward read of a log is still a
read of the log. `pg_constraint` is the authority and it was not consulted, so
treat the three as the best available reading rather than as a measurement of
the database.

**Sibling of `schema-audit.md`, and the pairing is the point:** that one reads a
migration FORWARD, at commit time, against the spec, and catches a column that
should not land; this reads the stack BACKWARD, long afterwards, to learn
current state, and catches a column that no longer exists. Same artefact,
opposite directions, and neither rule implies the other. Also a sibling of
`a-docstring-that-states-a-filter-is-a-claim-about-its-caller.md` rather than of
the never-went-red family: there is no instrument to be vacuous and no cell to
be green, only a sentence that was true once and is not flagged when it turns.
