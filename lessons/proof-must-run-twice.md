# A proof that passes only once proves the environment, not the code

**Rule: every proof script must be runnable twice in a row against a live
database and still pass.** No truncate between runs, no reseed, no dropped
volume. If it needs a fresh database to be green, it is not testing the code —
it is testing that you remembered to wipe the database.

## What happened

`prove_bills.py` was written in Phase 1c and passed. It was run again in Phase
2c-2, untouched, against the same database it had passed on before. It failed.

The observed response was the giveaway:

```
status=200  doc_no=B-2569-1  status_field=voided
```

A `201` was expected. The server had done nothing wrong — it did exactly what
Phase 1c asked it to do. The script hardcoded its idempotency keys
(`bill-A-0001`, `bill-A-conc-1`, ...) and asserted absolute document numbers
(`doc_no == "B-2569-1"`, then `"B-2569-2"`). On the second run those keys
already existed, so the idempotency guarantee correctly returned the *first
run's* bills — which CASE 4 had since voided. Every later assertion then failed
downstream of that, pointing at the wrong thing.

It had passed in Phase 1c for one reason: the tables had just been truncated.

## Why this is worse than a failing test

A test that fails is honest. This one was green while asserting nothing about
the code — its green depended on a manual step outside the script that nobody
recorded and nobody would repeat. Phase 1c shipped believing bills were proven
idempotent under repeat submission. That property *is* true, but the script had
not demonstrated it: it only ever exercised the fresh-key path.

The failure also arrived disguised. The first instinct was that the new Phase
2c-2 seed data had broken it. `git` showed the file unmodified and the seed
untouched by this path; the `200 / voided` response identified the real cause.
Never diagnose from the *newest* change — diagnose from the observed response
([[metro-file-map-nesting]]).

## The fix

Scope every idempotency key to a per-run UUID, and assert `doc_no` **relative**
to wherever the counter currently sits rather than to a fixed number:

```python
RUN = uuid.uuid4().hex[:8]                       # once, at module level
... f"bill-A-{RUN}-0001" ...                     # keys unique per run
check(re.fullmatch(rf"B-{BE_YEAR}-\d+", doc1))   # shape, not value
check(doc_new == f"B-{BE_YEAR}-{seq_of(doc1) + 1}")  # next, not "2"
```

The invariants being proven — gap-free, never reused, monotonic under
concurrency — are all *relative* properties. Asserting them with absolute
numbers was never testing the invariant, only the starting state.

## AMENDED (Phase 2c-6): the seed's SIZE is an environment fact too

The same mistake has a second shape, and a per-run UUID does not catch it.
`prove_master.py` asserted tenant isolation like this:

```python
check("tenant A sees exactly its own seller", len(sa) == 1 and sa[0]["id"] == ...)
```

It was green for a year. Adding four sellers to the dev seed — a change that
touches no isolation logic whatsoever — turned it red. The count was never the
property: **isolation is a set relation**, not a cardinality. The rewrite says
what was actually meant, and is immune to the seed growing again:

```python
check("no seller is visible to BOTH tenants", ids_a.isdisjoint(ids_b))
```

An assertion that breaks when a fixture is *added* was measuring the fixture. Ask
of every count in a proof: if this number changed, would the property I am
claiming actually be false? If not, assert the property.

## AMENDED AGAIN (migration 0004): a fixture a BILL points at can never be cleaned up

The per-run UUID makes fixtures unique. It does not make them *removable*, and
those are different problems.

`prove_master_write.py` creates a product, seller, uom and category per run and
deletes them in its `finally`. One case then wrote an accepted bill against the
run's own product, to show that reactivating it let the bill through. That bill
can never be deleted — hard rule 5 — so `fk_items_product` pinned the product
forever. Three things went wrong at once:

- the `DELETE` raised inside `finally`, so **every restore after it was
  skipped** — including putting a borrowed seeded row back;
- the traceback replaced the summary that would have said so;
- and the run left a live product in the dev picker, which then turned
  `prove_master.py` red for a completely unrelated-looking reason.

Two rules come out of it:

1. **A proof may write a bill against a SEEDED row, or against a row it can
   delete — never both in one fixture.** If a case needs "a bill already
   references this", borrow a seeded row and restore it, the way
   `prove_master_data_gate.py` borrows a price. Retirement (`is_active`) is not
   an escape either: the row still exists and still accumulates.
2. **Every statement in a `finally` must be isolated.** Wrap each cleanup in its
   own `try/except`, record the failure as a named check, and let the rest run.
   A cleanup block that aborts halfway is worse than one that never ran, because
   it leaves the fixture in a state nobody chose and no output explaining it.

The corollary for the count rule above: it bites in **both** directions. The
products assertion in `prove_master.py` was still `len(pa) == 3` after the
sellers one had been fixed — the amendment was applied to the line that failed
rather than to the class. When you fix an assertion of this shape, grep for its
siblings in the same file before moving on.

## AMENDED A THIRD TIME (daily report, 2026-07-29): debris is PERMANENT, so a count assertion has a half-life

The previous amendment ended with "grep for its siblings in the same file before
moving on." That was done for `prove_master.py` and **not** for
`prove_master_write.py`, which carried this in its own retirement case:

```python
check("...everything else is still there",
      len(default_list) > 0 and len(with_inactive) == len(default_list) + 1)
```

It went red while proving the daily report — on a run that changed nothing in
that path. The cause was a bill from the day before, `mw-f0c445f2-inactive`,
written against that run's OWN seller and product: exactly the trap rule 1 above
names. Hard rule 5 pins the bill, the FKs pin the seller and product, its cleanup
could not remove them, and they sit in the tenant retired and immortal. So there
were now TWO inactive products, and `+ 1` was false.

The retirement worked perfectly. The assertion was counting.

**The new part is the time axis.** The earlier amendments ask "would this break
if a fixture were added?" — a question about the seed, which someone chooses to
change. This one breaks with no change at all, because on any table that cannot
be hard-deleted, leftover rows only ever accumulate. A count assertion over such
a table is not merely fragile; it has a **half-life**. It is not a question of
whether it goes red, only of which unrelated phase is holding it when it does —
and the cost is paid by whoever is debugging something else that day.

The fix is the set difference the check was always trying to state, which needs
the before-set observed:

```python
offered_before = {p["id"] for p in get("/products")}     # BEFORE the deactivate
...
check(offered_before - offered_after == {this_run_product}
      and offered_after and offered_after < with_inactive_ids)
```

And the corollary widens: **grep every proof script for this shape, not just the
file that went red.** `len(x) == n`, `len(a) == len(b) + 1`, and any arithmetic
between two counts of live data are all the same defect wearing different
clothes.

## AMENDED A FOURTH TIME (reconciliation, 2026-08-02): a proof that NORMALISES its own fixture measures its last run

`prove_reconcile.py` breaks each money invariant on purpose in a restored copy.
The live database is not clean — it carries 84 violations, all proof debris — so
the harness first UNDOES the two known causes in the copy, and asserts the copy
then runs green. That assertion is the whole proof of the diagnosis: if those two
causes did not account for all 84, something else does and must be found.

Run 1 was honest. **Run 2 printed this:**

```
  the copy as restored : exit 0, 0 violations {}
  cause 1, prove_rls direct inserts : DELETE 0, DELETE 0
  cause 2, prove_daily_report fixture day : UPDATE 0
  [OK  ] the two known causes account for ALL of the live violations
```

Zero rows deleted, zero updated, and a green tick under it. The copy was still
normalised **from the previous run**, so "before" was already clean and the check
confirmed nothing. Every earlier amendment here is about a proof whose second run
FAILS; this is the other half — a proof whose second run PASSES, for a reason
that has nothing to do with the claim.

The distinguishing feature is that this script mutates its own fixture as a
*setup step* rather than as the thing under test. A per-run UUID cannot help: the
fixture is the whole database.

Two rules:

1. **A proof that mutates its fixture must CREATE that fixture**, not find it.
   `prove_reconcile.py` now runs `restore_db.py` itself, so every run starts from
   the same dump and the "before" state is a fact rather than a hope.
2. **Where a claim needs a precondition, ASSERT the precondition, and SKIP rather
   than pass when it is absent.** The diagnosis check now requires that the copy
   arrived dirty; given a clean one it prints `[SKIP]` and says a fresh restore is
   needed. A check that cannot be made must never be reported as a check that
   passed — the same distinction the checker itself draws between exit 1 (the
   money is wrong) and exit 2 (nobody looked).

See [[a-checker-must-not-share-the-code-it-checks]] for the injection discipline
this sits inside: fires / names the row / **clears again when undone**.

## AMENDED A FIFTH TIME (the rebuild, 2026-08-03): a count the ENVIRONMENT owns expires when the environment is rebuilt

The fourth amendment above was written on 2026-08-02, about `prove_reconcile.py`.
The next day the database was rebuilt and that same file went red. It has been
red ever since, and nothing in R1 or R2 touched it.

Three of its expectations are absolute counts of a database that no longer
exists:

```python
prove_reconcile.py:634   expect={"S3": 1, "B1": 1, "B2": 1, "T0": 91}
prove_reconcile.py:636   "table=tenants  rows_visible_with_no_tenant_context=46"
prove_reconcile.py:718   "table=tenants  rows_at_start=46  rows_at_end=47"
```

They were written against a 46-tenant database. The rebuild took it to 2.

**Measured either side of migration 0005, not inferred** — it fails from a
pre-0005 dump (48 tenants, `T0` got 95), from a second pre-0005 dump (3 tenants,
`T0` got 3), and identically from a post-0005 dump. The same four failures
throughout, so `token_version` is not involved. **Every injection that is about
MONEY still passes.** Only the two tenant-count assertions and the X3 timing
probe fail: what decayed is the proof's expectations about its own fixture, not
the checker's ability to see a money defect.

**The new axis is WHO OWNS the number.** The third amendment's half-life is about
accumulation — debris piles up, so the count drifts on its own with nobody
touching anything. This one does not drift. It was correct on 2026-08-02 and
wrong on 2026-08-03, because somebody legitimately rebuilt the world. Restoring a
dump, reseeding, standing up a fresh tenant, migrating a customer: none of these
are things a proof gets to forbid, and all of them expire a count of rows the
proof did not create. **If the proof did not put the row there, it may not assert
how many there are.** Derive the number from the restored copy at runtime, or
assert a relation the count cannot carry.

**The part worth staring at: this is the fifth bite, in the very file the fourth
amendment was written about.** The second amendment already said "grep for its
siblings in the same file before moving on"; the third widened it to "grep every
proof script for this shape, not just the file that went red." Both were
addressed to exactly this. On 2026-08-02 the sweep would have found `:634`,
`:636` and `:718` while the file was still green — one day before the rebuild
expired them. The rule was written INTO this file and not applied TO it, by the
session that wrote it.

So the sweep is not a step in fixing the assertion that went red. It is a step in
fixing the assertion that went red, run against every file you touched that day,
INCLUDING the one you were editing. A lesson applied only to the case that
prompted it is the defect the lesson describes, one level up.

Recorded in `OPEN_ITEMS.md:179-200` and in `PROJECT_STATUS.md:1603-1620`, which
carries the fuller measurement. Not fixed there or here: deciding what those
numbers derive FROM is a change to a destructive proof, and not one to make in
passing.

## How to apply

Before trusting any proof script:

1. Run it twice in a row without touching the database. If run 2 fails, the
   script is wrong, not the run.
2. Grep it for hardcoded unique keys and absolute expected values. Any
   idempotency key, external reference, or generated number must be per-run.
3. Assert the shape and the *delta*, not the value, for anything the server
   assigns.
4. Grep it for `len(...) == <n>` on seeded data. Rewrite as a membership or
   disjointness claim unless the exact count really is the invariant — and fix
   every one you find, not only the one that went red.
5. Check what the script leaves behind, by querying for its run tag after it
   exits. "It passed" and "it cleaned up" are separate claims, and the second
   one needs its own assertion in the script.
6. Ask of every count that survives step 4: did this script CREATE the rows it
   counts? If not, the number belongs to the environment, and a restore, a
   reseed or a new tenant expires it. Derive it from the fixture at runtime, or
   assert a relation that does not carry a count.

This sits alongside the other lessons about a green result that proves nothing:
[[concurrency-tests-need-a-barrier]] (workers that never overlapped),
[[schema-audit]] (proofs pass while the schema is wrong), and
[[metro-file-map-nesting]] (one green run pinned the wrong cause). The common
shape: **a passing result is only evidence if you know what would have made it
fail.** Here, nothing would have — on a fresh database it could not fail, and
on a used one it could not pass.

## AMENDED A SIXTH TIME (the shifts unit, migration 0021, 2026-09-12): the alembic HEAD is a value the environment owns, and the NEXT migration bumps it

The fifth amendment is *a count the ENVIRONMENT owns expires when the environment is
rebuilt*. **This is the same axis with the migration STACK as the environment**: a proof
written for migration N that asserts `head == "00NN"` reddens the day migration 00NN+1
lands — in an UNRELATED commit, with the proof and the code it tests BOTH UNCHANGED.

**Measured.** `prove_payments.py` (the 0020 ledger proof) asserted `version == "0020"` at
its E0 gate and `return 1` otherwise. Landing migration `0021` — which added a NULLABLE
`payments.shift_id` and four tables `prove_payments` never reads — turned E0 red,
`the scratch is at alembic 0020 (got 0021)`, and `prove_all` reported **RED 1** on it, on a
commit that changed nothing `prove_payments` exercises. `prove_payments` restores its scratch
from a live dump, and the live database is now at 0021, so the absolute assertion could only
be true for exactly one migration's lifetime.

**The fix is the one `prove_branches` used from the start**: assert AT OR PAST
(`version >= "0020"`), or assert the FEATURES the proof needs (the routes, the columns) —
never the head as a fact. The features migration N adds persist through N+1, which is the
whole reason the proof still means something at the later head.

**And the sweep is the part that stings.** This same session, landing 0021, first wrote
`head == "0021"` in its OWN new proof (`prove_shifts`) and used `downgrade -1` / `upgrade
head` for the round trip — the identical brittleness, in the very proof that ships the
migration — and had to correct it to `>= "0021"` with EXPLICIT `downgrade 0020` / `upgrade
0021` targets so migration 0022 cannot move what the round trip isolates. So the rule has a
search attached: **before finishing a migration, grep every proof for `== "00` (and `!= "00`,
and `downgrade -1` / `upgrade head` in a round trip) — the proof you just wrote is the most
likely offender, and the proof of the PREVIOUS unit is the second.** A proof that pins the
head is [[a-migration-stack-is-a-log-not-a-schema]] pointed at a test: the stack is a log, and
its head is a value that moves.

## AMENDED A SEVENTH TIME (the gate repair, 2026-10-09): a scratch restored from a DUMP OF DEV inherits every other proof's and every walk's leftovers

The fifth and sixth amendments are about a number the environment owns. This one is about
the ROWS: a proof that restores its scratch from a dump of dev runs on whatever every OTHER
proof, live round and device walk left in dev — and on 2026-10-09 three of them went red at
once in `prove_all` (RED 3), on a commit that changed none of them and nothing they test,
and the re-gate found a fourth. Measured in `_prove_all/20261009T051545Z` and
`_prove_all/20261009T063337Z`:

1. **`prove_payments` B1** — `every one of Shop A's 1408 live positive bills has live
   allocations summing to its total (2 do not)`. The two were `prove:counter`'s unpaid
   fixtures, B-2569-1619 / -1624: bills that legitimately carry NO payment, because they
   arrived while their branch's `separate_cashier` was on. B1 had assumed every bill in dev
   was paid by the automatic path. Restated over the set that path is responsible for (bills
   keyed `auto:<bill id>`), plus B1b — every bill WITHOUT an automatic payment arrived while
   its branch's switch was ON, read from the `branches` audit trail at the bill's own arrival —
   because the restatement alone goes blind to an automatic payment that was never written
   (the bill simply leaves the set). Disproven both ways on the scratch: an allocation short
   0.01 reddened B1 alone naming the bill; the automatic payment deleted reddened B1b alone.
2. **The round trips** — `prove_drawer` RT1 `downgrade to 0021 ... (got 1)` and
   `prove_shifts` RT/RF: dev held payments naming a channel and real shifts — rows neither
   proof made, whose origin was not traced — so 0022's and 0021's downgrade guards REFUSED — correctly —
   before the cells could judge the mechanics. Now built FROM EMPTY: create the database,
   replay `db/init/00_init_roles.sql`'s in-database half, `alembic upgrade head`,
   `seed_dev.py`, one bill through the real `POST /bills`; each refusal cell MAKES its own
   refusing row and `--disprove-refusal` (the row withheld) reddens exactly the refusal cells.
3. **`prove_shifts` GR's insert** — `INSERT into branch_payment_methods is accepted -- [but
   UniqueViolationError]`: a hard-coded `'transfer'` collided with a row a settings toggle had
   left on dev. The method is now CHOSEN by reading the branch's rows against the CHECK set
   read from `pg_constraint`, and a branch is created when it already holds every method — so
   it survives `transfer` becoming born-with. Measured: with every method held, the chooser
   made a new branch and picked `promptpay`.

4. **`prove_daily_report`, the re-gate the same day** — `[FAIL] 23:59:59.999999+07 is IN the
   day`, exits `[0, 1]`: green on run 1, red on run 2, the report correct. The proof writes
   its fixtures onto ONE fixed day (6 January) on dev and hard rule 5 never lets them go, so
   that day only grows; it held 208 live lines, the report pages its lines at 200 ordered by
   arrival, and `edge_last` — the day's LAST instant, hence the last line — fell onto page 2.
   A count on an append-only table only grows, so **a page-1 assumption has a half-life**,
   exactly like the third amendment's `+ 1`. The sweep of the same file found four more
   page-1 readers (the OUT cells, the off-list lines, both tenant-isolation sets, the money
   strings) and a `limit=500, offset=0` "not truncated" cell due to expire at 500 lines.
   Every membership claim now reads the day across EVERY page at 100 a page, so the pager
   actually turns, cross-checked against `bills.total`, which the report computes by aggregate.
   The "not truncated" cell asks for the LAST page. Disproven on a scratch: with the lines
   query mutated to stop one microsecond early, the IN cell, the coverage cell (168 lines vs
   224) and the last-page cell reddened, as predicted. Green with 228 and 232 lines over
   three pages.

**And the empty build had its own trap, which is the part worth keeping.** The first empty
build ran migrations + seed and nothing else, and `prove_drawer` RT2 went red:
`del_ctr: False`. The migration was right — 0022 recorded `pre0022_app_delete=absent` because
the app role truly lacked DELETE on `doc_no_counters`. What was missing was
`00_init_roles.sql:100-107`: schema ownership, the PUBLIC revoke, USAGE, and the `ALTER
DEFAULT PRIVILEGES` that hands the app role DML on every table — PER-DATABASE statements, so a
new database without them is not the database production runs. The empty build now replays
them READ FROM THE FILE (the parser raises if the `ALTER DEFAULT PRIVILEGES` is not found),
and an empty build compared to dev at head showed 0 differences across 27 relations' owner,
ACL and RLS flags, both schemas, `pg_default_acl` and the database ACL.

**Rule: a proof's expected state comes from rows it READ or rows it MADE — never from dev
being pristine.** Either derive what to expect from the restored copy at runtime (a set the
proof can name, a method the branch does not hold), or build the scratch from empty and make
the precondition yourself. And an "empty" build is only empty of DATA: everything the real
bootstrap does to a new database belongs in it, or it proves a database nobody runs.

## AMENDED AN EIGHTH TIME (lane A, migration 0023, 2026-10-11): an empty build at HEAD carries whatever the born-with rows are TODAY, so a change to born-with rows moves every round trip built on it

The seventh amendment moved the round trips onto a scratch built FROM EMPTY at `head`. That
build is empty of shop DATA but not of BORN-WITH rows: the seed's branches get whatever the
born-with trigger writes at the head of the day. Migration `0023` made `transfer` born-with,
and `prove_shifts` RT went red in the A1 gate (`_prove_all/20261011T072726Z`, run 1 and run 2):
`RT downgrade to 0020 exit 0 (got 1)` -- 0021's guard refused on `branch payment methods beyond
the born-with cash: 2`, the two seeded branches' transfer rows. Nothing in `prove_shifts`
changed; `0023` changed what "empty" means. The refusal is correct and is the design (a
database born at 0023 cannot go below 0022, ADVISOR-DECIDED 2026-10-11): the PROOF's premise
was wrong, so RT/RF now build at `0022` -- the migration whose downgrade they test -- and a new
cell BT proves the refusal at head.

**The miss was in the ORDER, not the code.** Before that gate the session ran `prove_drawer`,
`prove:counter`, `prove:sheets` and `prove:settings` alone -- the proofs it had EDITED -- and
not `prove_shifts`, which it had not edited but which builds and round-trips branches. A red
found by the full gate costs a whole gate run, and on this box a gate run can be killed for
memory before it reports at all (it was, at 31/85, with the red already in its log).

**Rule: after ANY change to born-with rows (a trigger on `branches`, a seeded default, a
backfill), run EVERY proof that creates or round-trips branches ALONE, before the full gate.**
Found 2026-10-11 by two ripgrep content searches over `server/scripts/prove_*.py`,
`mobile/src/proof/*.ts` and `tools/*.py` -- one for `INSERT INTO branches|provision_shop\.py|
"downgrade"|build_empty_scratch\(|branch_payment_methods|payment-methods|payment_methods`, one
for `\bprovision\(|provision_shop import` -- with `prove_shifts` and `prove_drawer` (known to
touch born-with methods) as the positive control, both present. The union, thirteen:
`prove_shifts`, `prove_drawer`, `prove_branches`, `prove_rls`, `prove_reconcile`,
`prove_login_guard`, `prove_grade_tiers`, `prove_reports_summary`, `prove_seller_history`,
`prove_user_create`, `prove_user_admin`, `prove_permissions`, and `mobile/src/proof/proveDrawer.ts`
(run by `prove:counter`). Not found with these words is not proof of absence: re-run both
searches at the time of the change, because the list grows with every proof.

## AMENDED A NINTH TIME (lane A gate, 2026-10-19): a VOLUME inherited from dev expires with the calendar

`desktop/src/proof/proveReportsFlow.ts` F1 needs the week's report to span more than one 200-row
page, and it got that from dev, which held the week's proof runs: 338 rows on the 2026-10-17 gate,
86 on 2026-10-19 once older bills left the trailing seven days -- red both runs, every other cell
green. Nothing in the code changed; the window moved. A proof that needs N rows MAKES them on its
scratch (the proof now tops the week up to 201 with its own bills; removing the top-up brings the
same red back). Inheriting a count from dev is the third amendment's half-life, with the clock as
the decay.
