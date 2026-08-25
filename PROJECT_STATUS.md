# Project status

Where the work has actually got to. CLAUDE.md holds the static
infrastructure — architecture, hard rules, machine traps, workflow —
and says nothing about progress; everything that moves as phases land
is here.

Update this file at every phase boundary. Nothing enters it that has
not been OBSERVED: a proof that ran, an endpoint that answered, a
screen seen on a device. Implemented is not verified, and a dated
green in here is only as fresh as its date.

`BRIEFING.md` is the fresh-session handoff (architecture, invariants,
lesson shapes). It deliberately holds NO status — update it when
architecture or a hard rule changes, not at every phase boundary.
`OPEN_ITEMS.md` holds everything outstanding, one line each.
`ROADMAP.md` holds the ORDER of what is not done, and why that order.

**THIS FILE IS NOT SPLIT, and the trigger for reconsidering that is written
here so it does not live only in a conversation. Revisit at 2000 lines.**
Splitting "Earlier phases" and "Baseline observations" into a `HISTORY.md` was
considered on 2026-08-06 and REJECTED. The reason is the rule three lines
above: Baseline observations is not an appendix, it is the evidence layer every
claim in this file rests on. Move the dated greens out and what remains is a
file of assertions whose freshness is invisible from where the assertions are
written — and a fresh session reads this file first, because CLAUDE.md names
it and would not name the other. The measured saving did not justify that:
the two sections were 543 of 1457 lines, and removing them would still have
left a file too large to read in one call. **Compress in place instead** —
superseded entries reduce to their finding plus a pointer, which is what was
done to two of them on 2026-08-06.

**PHASE NUMBERING, settled 2026-08-05.** The **A-numbers in this file
are a CLOSED LOG** — A1 (daily money view, mobile screen) and A2
(reconciliation), both complete. They stay as written because commit
bodies point at them (`27a0453`: "the A1 device pass", "a SECURITY item
for A3"), and renaming them would orphan the history. **No new A-number
will be issued.** Forward work is numbered R1, R2 … in `ROADMAP.md`.
A3 was never opened; the sign-out work it named is **R1**.

**Last updated: 2026-08-06 — R1 AND R2 BOTH CLOSED. A phone can end its session
deliberately, and the server can refuse a token it already issued
(`users.token_version`, migration 0005) — both halves observed on a real
handset. The daily money screen's last two device gaps are closed, the 403
rendering on strong evidence and the hung socket on weaker evidence that is
labelled as such. NO PHASE IS OPEN. One finding from the pass is UNDIAGNOSED
and deadlocks a handset whenever a token expires mid-shift; see Current
phase.**

**Also 2026-08-06, DOCUMENTATION ONLY: three further commits landed —
`b955697` (the lessons generator), `b74396e` (`START_HERE.md`, and two workflow
rules that existed nowhere in the repo before that day), and the citation change
below. NONE OF THEM TOUCHED CODE, so no proof and no typecheck was run for any of
them. Every dated green in Baseline observations keeps its own date and none is
refreshed by this work — a reader seeing three commits after the last green must
not read the green as re-run.**

## Current phase

**P1.8b MOBILE — THE DEVICE IDENTITY, THE LOCAL SCHEMA, AND THE `seller_create`
KIND. BUILT AND PROVEN, 2026-08-25. Three commits: `8d979f2` storage and
identity, `1d7f638` the kind, and the documentation commit carrying this entry.**
This supersedes the P1.8b SERVER entry below as the current phase; that entry's
record stands unchanged. **NO SHA IS GIVEN FOR THE THIRD COMMIT**, deliberately —
the work carrying this sentence is uncommitted at the moment it is written, so the
only sha available is the one that does NOT contain it, which is the corollary
`CLAUDE.md § Conventions` "PIN A CLAIM TO A COMMIT" records.

**WHAT EXISTS NOW THAT DID NOT.** Three local tables: `local_device` (a v4 uuid
minted once, keyed `only_row` with `CHECK (only_row = 1)`, written
`ON CONFLICT DO NOTHING`), `local_sellers` (owed work beside `local_bills`, with
its OWN `sync_state` CHECK), and `local_seller_codes` (the holding, with no owner
columns by decision). `local_bills` gained a nullable park PAIR by the
`PRAGMA table_info` migrator and **nothing reads it yet**. `OutboxKind` carries a
THIRD member, `seller_create`, first in the registry literal, with its own row
type, its own outcome union, its own handler and its own policy. `refillOnce` and
the reserve level exist; `HttpSellerTransport` speaks both server routes.

**THE OBSERVATIONS, every command bare with its status read in the same
invocation.** `npm run typecheck` and `npm run typecheck:app` each exit 0.
`npm run prove:sellerstore` exits 0 twice with 56 OK / 0 FAIL and
`SELLERSTORE_EXIT=0` on both; `npm run prove:sellerkind` exits 0 twice with
69 OK / 0 FAIL and `SELLERKIND_EXIT=0` on both. Both proofs CREATE their own
fixtures and both PRESET `process.exitCode = 1` at entry. Twenty-six pre-existing
mobile proofs are green twice with cell counts identical to the pre-phase
baseline, with one exception recorded below.

**`prove:outbox` MOVED 75 -> 77 AND NO CELL WAS ADDED TO IT.** `O6` and `O10`
enumerate the REGISTRY rather than naming kinds, so two inherited criteria began
covering `seller_create` with no edit at all. That is the generalisation paying
rather than costing, and it is recorded because a moved count is otherwise
indistinguishable from a proof somebody quietly widened.

---

### THE CRITERION ENUMERATION — every HEADLESS-labelled criterion, met or not, by name

**THE CLAUSE THIS PHASE WAS ACCEPTED UNDER, corrected by the owner on 2026-08-25
after the brief was found to contradict itself.** The brief's `Prove:` block asked
for *every HEADLESS-labelled criterion* while its OUT OF BOUNDS placed the
surfaces and the parked bill in a later phase — and some HEADLESS criteria live
there. The corrected clause: **this phase meets every HEADLESS-labelled criterion
THAT FALLS INSIDE ITS DECLARED SCOPE, and enumerates the rest BY NAME with the
phase that owns each and why it cannot be reached from here.** An unenumerated
criterion is the one nobody notices is unmet.

**MET, INSIDE SCOPE — nine.**

- `THE-DEVICE-IDENTITY-OUTLIVES-A-SIGN-OUT` — all three cells; the named red case
  (identity in the keystore) RUN, and it destroys the identity as the design says.
- `THE-LOCAL-SCHEMA-ADDS-AND-DOES-NOT-REBUILD` — all three cells against a
  database hand-staged at the ORIGINAL ten-column shape holding unsynced bills;
  cell 1 is equality off the live `sqlite_master`, and the forbidden rebuild is
  staged so cell 1 is SEEN to go red, with a further cell showing a CONTAINMENT
  test would have passed it.
- `NO-ARM-OF-THIS-KIND-SETTLES-A-409` — all three cells, with BOTH named red cases
  staged, including `terminal`, which is the one a narrower wording lets through.
- `THE-OUTCOME-UNION-IS-THIS-KIND-S-OWN` — cell 2 in the proof; cell 1 is a
  COMPILE cell and was run BY HAND, below.
- `THE-TOKEN-IS-ON-THE-WIRE` — the HEADLESS cell, read off the request the
  shipping HTTP client actually built, with the named red case staged. Its SERVER
  pair is not run here and the criterion's own text says that half needs a live
  API.
- `THIS-KIND-KEEPS-EVERY-POLICY-DIFFERENCE-THE-DESIGN-NAMES` — four cells,
  including the behavioural prefix cell the void kind could not have.
- `THIS-KIND-RECOVERS-AT-BOOT-AND-THE-SWEEP-IS-REAL` — both cells through the
  runner, plus the store layer in the other proof; the empty-`recover` red case is
  staged beside the inherited key-set cell, which stays GREEN under it.
- `A-REFILL-ASKS-FOR-THE-SHORTFALL, AND FOR NOTHING WHEN THERE IS NONE` — the
  three corrected cells, read out of a modelled relation because the
  discriminator is a server-side row count no device can see.
- `A-FAILED-REFILL-IS-AN-UNKNOWN-OUTCOME-AND-COSTS-NOTHING-ELSE` — four cells,
  with the attempt count asserted EQUAL to the number of passes the staging ran.

**THE COMPILE CELL, RUN BY HAND AND NOT BY THE PROOF.** A node proof cannot
perform it without writing into `src/` mid-run and shelling out to `tsc` twice,
which would make a green depend on the proof successfully un-editing the source
tree. Staged instead: a value carrying `code_assignment_failed`, typed through
`OutboxResult["seller_create"]`. **Both programs exit 2** and the error set
INCLUDES `src/sync/sellerCreate.ts(53,3)`. Under the named red case — that entry
set to `CreateSellerOutcome` — **the same error DISAPPEARS**: one occurrence under
the correct union, zero under the reused one. Both files restored, `cmp`
byte-identical, both programs green again.

**NOT MET, AND WHY — each named, with the phase that owns it.**

- `A-BILL-BEHIND-AN-UNCREATED-SELLER-IS-NEVER-OFFERED` — **the surfaces phase.**
  Needs the bill park: a bill held out of the sendable queue until its seller
  settles. The park's COLUMNS exist as of `8d979f2` and nothing reads them. NOT
  asserted here in any weaker form.
- `THE-PARKED-SENTENCE-SENDS-NOBODY-TO-THE-OFFICE` — **the surfaces phase.** It is
  a wording criterion over a park that does not exist.
- `THE-RESERVE-LEVEL-IS-REQUIRED-AND-EVERY-VALUE-HAS-ITS-OWN-SENTENCE` — **the
  surfaces phase.** The LEVEL is built and proven, because a refill cell reads it;
  the four sentences, the tone mapping and the compile cell on a call site that
  renders them are not, and no wording function was written.
- `THIS-KIND-DRAINS-BEFORE-BILLS-IN-ONE-PASS` — **PARTLY MET; the release half is
  the surfaces phase.** The member ORDER is asserted in one pass — the seller is
  performed BEFORE the bill — but the criterion's own staging needs a bill WAITING
  on that seller, which needs the park. Under the staging available here the bill
  would have sent under either order.
- `OWED-ASKS-WHO-CREATED-THE-SELLER, AND THE RELEASE DOES NOT` — **PARTLY MET;
  cells 3 and 4 are the surfaces phase.** Cells 1 and 2 are asserted at the store
  and again through the kind, in both directions plus the fail-closed direction.
  Cells 3 and 4 turn on the release crossing the owner filter, which needs the
  park.
- `THE-LOCAL-ROW-SURVIVES-A-REFRESH-THAT-DELETES` — **PARTLY MET; cells 3 and 4
  are the surfaces phase.** Cells 1 and 2 are storage and are met, including the
  presence sibling that the DELETE still runs. Cells 3 and 4 ask what the PICKER
  offers, and the picker's union of the cache with the unsettled local rows is not
  built.
- `EVERY-SURFACE-SEES-A-KIND-THAT-IS-NOT-A-BILL` — **the surfaces phase, and it is
  labelled HANDSET rather than HEADLESS.** Listed here anyway because it BECAME
  REACHABLE the day this kind landed: `seller_create` is the first kind whose rows
  are not in `local_bills`, and `UnsentBreakdown`'s completeness claim is false
  from `1d7f638` onward. **This is a REAL gap in the shipped tree, not a
  theoretical one** — the sign-out gate counts bills only, so a device owing a
  seller create and no bills would permit a sign-out that leaves the work behind.

**THE SERVER-LABELLED CRITERIA are met by the server half and are recorded at its
own entry below; nothing in this phase re-measures them.**

---

## The phase immediately before this — P1.8b SERVER

**P1.8b SERVER — THE RESERVATION RELATION, THE TOP-UP ROUTE, AND THE TWO GUARDS.
BUILT AND PROVEN, 2026-08-24/25. Three commits: `a60aef5` additive, `b8b557f` the
guards, and the documentation commit carrying this entry.** This supersedes the
P-SELLERKIND-DESIGN-AMEND entry below as the current phase; that entry's record
stands unchanged. **NO SHA IS GIVEN FOR THE THIRD COMMIT**, deliberately — the work
carrying this sentence is uncommitted at the moment it is written, so the only sha
available is the one that does NOT contain it, which is the corollary
`CLAUDE.md § Conventions` "PIN A CLAIM TO A COMMIT" records.

**WHAT EXISTS NOW THAT DID NOT.** Migration `0012` creates
`seller_code_reservations`, keyed `PRIMARY KEY (tenant_id, code)` with
`UNIQUE (tenant_id, token)` beside it, two states and one transition, and
`ck_reservations_spent_consistency` tying `spent` to a non-null `seller_id` in both
directions. `tenants` gains `seller_code_target_holding`, `NOT NULL DEFAULT 20`,
floor of 1. `POST /seller-code-reservations` tops a device up to that target,
mints the shortfall IT computes, and answers with the device's WHOLE holding.
`POST /sellers` gained three paths: a reservation token that spends a code and
answers a replay 200 with the first attempt's row; a supplied code REFUSED
`code_reserved` when a handset holds it; and a no-code mint derived above BOTH
tables under a per-tenant lock. `_next_seller_code` is DELETED — an unused function
reading one of the two tables, beside the one reading both, is the one the next
writer calls.

**THE DESIGN WAS AMENDED BY ONE CLAUSE, ON A MEASUREMENT, AND THE OWNER RULED IT.**
`ROADMAP.md`'s lock decision said *taken FOR UPDATE*; it is now FOR NO KEY UPDATE.
`tenants.id` is referenced by **ELEVEN foreign keys — ten in `public`, one in
`directory`, `purchase_bills` and `purchase_bill_items` among them** (re-derived
from `pg_constraint` at `b8b557f`, and re-derived independently by the advising
session, which is why the figure is stated rather than carried). An INSERT's FK
check takes `FOR KEY SHARE` on the parent and `FOR UPDATE` conflicts with it, so
the clause as written would have stalled every insert in the shop for the length of
a refill, on every sync pass, with nothing going red. **MEASURED, 1.5 s hold,
control 3-5 ms: a child INSERT is 4.6 ms with nobody holding, 1506.0 ms under
`FOR UPDATE`, 3.2 ms under `FOR NO KEY UPDATE`, while the other writer's lock is
blocked under both.** Written as a dated supersession at the site of the sentence
it corrects; `git diff --numstat -- ROADMAP.md` reads **58 insertions and ZERO
deletions**, and **no heading was added** (`grep -c "^+#"` over the diff returns 0),
so the blast radius on every citation into that file is zero.

**THE PROOFS, AND BOTH RUN TWICE AGAINST A LIVE SCRATCH DATABASE WITH NO RESEED.**
`prove_seller_code_reservations.py` — 52 cells, exit 0 twice, from a different code
maximum each run. `prove_seller_code_guards.py` — exit 0 twice, from different
starting states (`S014` and `S056`). Both REFUSE the live database and start their
own uvicorn, because an API process is bound to its database at startup; both
require a sentinel written before the server started to come back through the
route.

**THE GUARDS ARE MEASURED AS PAIRS AGAINST A REAL OLD SERVER, not against a
description of one.** `prove_seller_code_guards.py` starts TWO uvicorns on ONE
scratch database — one from a git worktree at `a60aef5`, the commit before the
guards, one from the tree as it stands. ADMITTED: the old server takes a supplied
reserved code (201, row created) and MINTS A CODE FROM INSIDE the reserved block.
REFUSED: the new one answers 409 `code_reserved` with no row, and mints above the
whole relation. Pointing `--old-tree` at the current tree reddens the ADMITTED
cells, which is the instrument checking itself.

**ELEVEN DISPROOFS ACROSS THE PHASE, EACH NAMING ITS CELL BEFORE RUNNING, every one
against a SCRATCH database, with `master.py` restored byte-exact after each
(sha256 verified either side).** The ones worth reading: the NON-WALKING POST-CHECK
reddens the assigner cell exactly as the design predicts — with EXACTLY ONE code
reserved, 409 `code_assignment_failed` and nothing minted; the union half dropped
in the additive commit reddened WIDE (14 cells) because the primary key refused the
write, so a second mutation the key ADMITS (`max + 2`) was run and reddened ONE cell
naming its values; the spend written as a separate unchecked UPDATE reddens the
spent-reservation cell at `seller_id (None)` against a real created id.

**AND ONE DISPROOF THAT CORRECTLY STAYED GREEN, WHICH IS THE FINDING.** Disabling
ONLY the `spent` fast path left the replay cells green — the IntegrityError re-read
answered 200 with the same id on its own. So the fast path is an OPTIMISATION and
the re-read is the GUARANTEE, and that mutation is the staging that makes the
re-read arm EXECUTE. Both had to be disabled before the cell moved. It has its own
lesson.

**TWO LESSONS WERE WRITTEN, AND ONE OF THEM COST THREE REWRITES OF THE SAME CELL.**
A per-tenant lock cannot be proven by a race: a start barrier synchronises the
REQUESTS while the section the lock protects is a sub-millisecond SELECT behind an
auth round trip, so with the lock deleted the barrier race stayed green and, across
five runs, collided ONCE. The second attempt — hold the row `FOR UPDATE` and time
the route — was green with the lock deleted too, because the route's INSERT was
blocked by the proof's OWN holder through the foreign key. The third — time an
unrelated write while the create was blocked — could not fail either, because a
request WAITING for a lock holds nothing. What works is a PAIR OF HOLDS.

**WHAT THE SERVER-LABELLED CRITERIA NOW HAVE, EACH NAMED.**
`A-CODE-HAS-ONE-HOLDER-AND-KEEPS-IT` — both cells, the primary key refusing a second
holder with its presence sibling, and two devices in one tenant whose sets are
disjoint AND whose union is the sum of their sizes.
`A-SPENT-RESERVATION-NAMES-A-ROW-THAT-EXISTS` — all three cells, with the invariant
queries SCOPED TO THE RUN'S OWN DEVICES (see the queue entry; the shop-wide version
is not built). `A-SUPPLIED-RESERVED-CODE-IS-REFUSED`, `A-MINTED-CODE-SKIPS-WHAT-IS-
RESERVED` and `THE-ASSIGNER-STILL-TERMINATES-ABOVE-A-RESERVED-BLOCK` — the pairs
above, the third with all three cells including the single-code staging the
amendment added. `A-REPLAY-CARRYING-THE-TOKEN-IS-ANSWERED-WITH-THE-FIRST-ROW` — all
three cells plus a concurrent replay behind a barrier. **The HEADLESS and HANDSET
criteria are untouched and none is claimed.**

**THE SCHEMA WAS AUDITED FIELD BY FIELD OUT OF POSTGRES, NOT OFF THE MIGRATION, and
it caught something.** The `state` membership CHECK landed AUTO-NAMED
(`seller_code_reservations_state_check`) beside an explicitly named sibling; it is
now `ck_reservations_state`, the convention `0003` and `0010` already follow. Grants
read back from `information_schema`: `recycle_app` holds INSERT, SELECT, UPDATE and
**no DELETE**, so the REVOKE did the work the GRANT could not — 0008's measurement,
confirmed again.

**THE BACKUP/RESTORE KEY SPACE WAS WALKED ON THE COMMIT THAT WIDENED IT.**
`pg_dump` emits a COPY block for the EMPTY new table, so the key space widened at
MIGRATION time and not at first-row time; the manifest key is BARE because the
relation is in `public`, so both sides read it out of `public` and there is no
disagreement to find. Restore into a scratch database: `[OK] dump=0 restored=0`
across 14 keys, `RESTORE_EXIT=0`, RLS **11 ENABLE / 11 FORCE / 11 policies** where
it was 10/10/10.

**`reconcile.py` WENT RED AND THAT WAS THE CHECKER WORKING.** S2 — *no table exists
that this checker does not know about* — reported exactly one violation naming the
new table and prescribing the repair, with S1, S3, S4, S5, B1 and all 68 per-tenant
checks still green. The table is now in `TENANT_TABLES`, which is not bookkeeping:
it puts the relation under S1, S3, B1 and X2, and `SCOPE_COLUMN` gained the entry X2
needs or every row it holds would report as UNSEEN. Its constraints and its index
stay OUT of `REQUIRED_CONSTRAINTS`/`REQUIRED_INDEXES`, the decision `0005`, `0006`
and `0011` each recorded, with the same wake condition.

**EIGHTEEN PRE-EXISTING SERVER PROOFS RUN TWICE, BEFORE AND AFTER THE RISKY HALF.
SEVENTEEN EXIT 0 BOTH TIMES.** `prove_master_write.py` is RED and **was already
red** — four cells, the first being `POST /sellers -> 403` against a 201.
Established by MEASUREMENT rather than by comparing dates: run against HEAD's code
on a server confirmed to answer 404 on the new route, it produces the same four
cells at the same lines with the same text. Queued, not fixed.

**`prove_seller_create.py` WAS UPDATED BECAUSE THE RULE CHANGED, not because it was
wrong.** Its expectation read `max(code)` over `sellers` alone, so it expected
`S845` while the server correctly minted `S1010` above a thousand reservations. The
new SQL is written out in the checker rather than imported, so it remains that
checker's own statement of the rule; what is shared is the DECISION. It was the ONLY
proof encoding that derivation — `grep -rn "max(substring" server/scripts/`.

**THE DEV DATABASE IS AT 0012 AND HOLDS ZERO RESERVATIONS.** Read back:
`reservations=0, rev=0012, targets=20`. Nothing was minted into `recycle` by any of
this, deliberately — a reservation is never reclaimed, so a refill against dev would
burn a stretch of its seller code sequence permanently, which is the refusal the
proof script carries in its own words. The handler is proven against scratch and the
dev server's liveness was established through the changed path without writing a
row: `POST /sellers` carrying a `reservation_token` answered a LIST-shaped 422
`extra_forbidden` before the restart and a DICT-shaped 422 `reservation_not_found`
after it, from the same process family, with the probe writing 0 rows.

**NOTHING WAS MINTED, EACH COUNT WITH ITS TOOL AND ITS DEFINITION.** S-numbers
**22 → 22**, `grep -c '^\*\*S[0-9]\+ — '`. P-number headings **37 → 37**,
`grep -c '^### P[0-9]'`. Both taken against `git show HEAD:ROADMAP.md` and the
working tree.

**THIS PHASE LEFT SIX SCRATCH DATABASES ON THE CLUSTER, RE-DERIVED AGAINST
`pg_database` RATHER THAN COUNTED FROM MEMORY — and the first attempt at this
figure said FOUR and then listed six, which is why it is written with its
command.** `SELECT count(*) FILTER (WHERE datname LIKE 'recycle_p18b_%'), count(*)
FILTER (WHERE datname NOT LIKE 'recycle_p18b_%'), count(*) FROM pg_database WHERE
datname LIKE 'recycle%'` returns **6 / 10 / 16**. The six are
`recycle_p18b_break`, `_clock`, `_gbreak`, `_guards`, `_scratch` and `_users`, all
restored from one backup taken after migration `0012`; `_break` and `_gbreak` hold
deliberate mutation debris and `_guards` holds the invariant violation its
ADMITTED cells create, so none of the six is a clean copy of anything.
**THE OTHER TEN ARE `recycle` ITSELF AND NINE THAT PREDATE THIS WORK**, and they
are NOT this phase's to remove — no retention rule exists for scratch databases at
all, which is queued separately and is where that decision belongs.

**WHAT THIS PHASE DID NOT BUILD, AND NONE OF IT IS CLAIMED.** Nothing under
`mobile/`, `packages/` or `desktop/` moved — the device identity, the
`seller_create` outbox kind and the local schema are the NEXT step, and this one
gives them a server to talk to. The surfaces, the reserve-level wording and the bill
that parks behind an uncreated seller are the third. No screen exists and no Thai
sentence was written for one. Both mobile typecheck programs exit 0 bare, which for
a server-only change is a regression check and evidence about nothing else.

**P-SELLERKIND-DESIGN-AMEND — THE THREE HOLES THE CRITERIA REVIEW OPENED ARE CLOSED
IN THE DESIGN, `low` STOPS BEING A WARNING, AND THE SURFACES QUESTION IS RULED.
DOCUMENTATION ONLY, 2026-08-24. One commit.** This supersedes the P-SELLERKIND-CRITERIA
entry below as the current phase; that entry's record of the criteria stands
unchanged, and **every finding it reported is left exactly as written** — a finding
rewritten after the fact is a record of nothing. What moved is the DESIGN, and each
finding now carries a dated line saying where its answer is.

**AMENDED BY SUPERSESSION, NEVER BY REWRITING, AND THE DIFF IS THE EVIDENCE.**
`git diff --numstat -- ROADMAP.md` reads **425 insertions and ZERO deletions.** Not
one line of the design or of the criteria was removed, including the sentences this
work contradicts; every correction is an appended dated paragraph sitting at the site
of the sentence it corrects. **AND NO HEADING WAS ADDED ANYWHERE**, which is the
cheapest defence available against the sixteenth never-went-red mechanism: a section
citation is a case-insensitive SUBSTRING match, so the blast radius of a new heading
is every citation into the file, and a document that adds none has a blast radius of
zero. The remedy that mechanism prescribes — read the checker's `sect=` column for
the file you are about to write in — was run anyway, and so was its handle twin: the
handles cited INTO both edited files were listed before a word was written, so no new
sentence could turn a resolving citation into `hits=2`.

**NO FILE UNDER `mobile/`, `server/`, `packages/`, `desktop/` OR `tools/` MOVED.** No
source file, no migration, no type, no route. No database was touched, live or
scratch. **NO PROOF AND NO TYPECHECK WAS RUN. That is a fact about this phase and not
an omission from it:** no code was touched, so neither instrument would have carried
information about the change. **Every dated green in Baseline observations keeps its
own date and NONE is refreshed by this work.**

**NOTHING WAS MINTED, AND EACH COUNT WAS TAKEN BEFORE AND AFTER WITH ITS TOOL AND ITS
DEFINITION NAMED.** S-numbers **22 → 22**, `grep -c '^\*\*S[0-9]\+ — '`. P-number
headings **37 → 37**, `grep -c '^### P[0-9]'`. Seller-kind criteria **22 → 22**,
counted by the COST LABEL that follows each name — the same instrument the criteria
step used as its second count, and the one that stays honest here. **A count by
bolded NAME alone would now over-count**, because a `**CORRECTED (…)**` paragraph
opens the page the same way a criterion does; the cost label is what discriminates
them, and it is written down here so the next recount does not pick the other one.

**THE FOUR DECISIONS. Each is recorded at the design; what belongs in a status file
is what a reader would otherwise expect to be true.**

- **THE SKIP LIVES IN THE CANDIDATE DERIVATION, AND A POST-CHECK IS REFUSED AT A
  BLOCK OF ONE.** The next assigned code is the successor of a maximum taken over
  `sellers` AND the reservation relation in one expression, so it costs the same
  whatever the block's length and lands ABOVE the whole block. **Re-derived at the
  artefact rather than carried from the entry below that first recorded it:**
  `_ASSIGN_ATTEMPTS = 8` at `server/app/master.py:897`, the loop bound at `:1017`,
  the figure echoed into the 409 body at `:1045`; `_next_seller_code` at `:900`
  taking its maximum over `sellers` alone. **The module comment above it is what
  decides the placement**, because it states what makes the retry ADVANCE — the loser
  re-reads a maximum that now includes the winner's committed row — and a reservation
  is not a row in `sellers`, so it moves that maximum by nothing.
  **AND THE MECHANISM IS THE LOOP'S SHAPE RATHER THAN A RATIO, which is the half that
  decides the STAGING.** Re-derived bare in this pass, at the file:
  `for _ in range(_ASSIGN_ATTEMPTS):` is `:1017` and
  `candidate = await _next_seller_code(conn)` is `:1018`, the FIRST statement inside
  that loop's body. So the candidate is re-derived on every attempt, out of a table a
  post-check never writes to, and all eight attempts return the identical string.
  **A post-check that does not walk is therefore refused at a block of ONE**, and the
  block length decides nothing about whether the counter is refused — it decides only
  how far a CORRECT derivation must jump, and it separates the WALKING post-check
  alone. The entry below reads *two and a half times the assigner's entire budget*;
  that is right about the outcome and wrong about the cause, it is left exactly as
  written, and the difference is not cosmetic because a fixture reserving one code
  reddens what a fixture sized against the ratio was built to reach.
- **THE REFILL IS A TOP-UP IDENTIFIED BY THE DEVICE, AND ITS ANSWER IS THE WHOLE
  HOLDING.** The request carries `(tenant_id, device identity)` and no quantity; the
  server computes the shortfall itself; and it answers with everything the device
  currently holds rather than with what it just minted. **The second half is the
  load-bearing one and it is the one that looks unnecessary:** a route returning only
  the new block answers a repeat with an empty set, so a device whose response was
  lost asks for ever while a full block sits `held` in its name. One route, two
  opposite failures — mint-again burns the code space, return-nothing strands the
  device — and only *return what it holds* is safe against both.
- **A PERMANENTLY REFUSED CREATE RETURNS ITS CODE TO THE DEVICE'S HOLDING.** Neither
  answer the finding offered is taken. **The design's own state machine had already
  answered the server half and nobody had read it that way:** `held → spent` happens
  only inside the seller INSERT, so a create refused on its payload spent nothing.
  What was missing was the DEVICE half. And the reserve level is now defined —
  codes this device holds that are not bound to a create that has settled or is in
  flight, which is a count of what the yard can still DO and never of what the server
  has issued.
- **`low` KEEPS ITS VALUE AND LOSES ITS TONE.** Tone is derived from the level by one
  question — does this state require a person to do something now? — and on that rule
  there is no amber anywhere in this mechanism: none, none, red, red. An amber that
  fires on the ordinary completion of the ordinary task is not a weaker red, it is a
  red whose reader is being trained to ignore it. **What replaces the warning is a
  number and not a colour**, and the residual is stated rather than hidden: one code
  of twenty and nineteen of twenty are both `low` and both quiet, and no warning floor
  is introduced because it would be a second unmeasured constant.

**THE RULING, WHICH IS THE OWNER'S AND NOT THIS SESSION'S.** S10 defers the DRAWING,
and a sign-out gate is a decision about whether an action proceeds rather than a
drawing; a sign-out that discards owed work is money already paid, which is S10's own
stated exception. **So `EVERY-SURFACE-SEES-A-KIND-THAT-IS-NOT-A-BILL` stays.** Its
scope is bounded by what is already broken and that was re-derived rather than
carried: the outbox step closed with its own surfaces criterion untouched by design,
so the gate, the sheet and the strip still count bills only and the strip still says
the work is sent over an owed void. A third kind WIDENS that gap and does not open a
new one, and the strip's wording moves only as far as stops it stating something
false.

**TWO THINGS THIS PHASE FOUND THAT NOBODY ASKED IT TO LOOK FOR, and both are in the
criteria set rather than in the code.**

- **TWO CRITERIA IN ONE SET CANNOT BOTH BE STAGED, AND THEY WERE WRITTEN IN ONE
  COMMIT.** `A-REFILL-ASKS-FOR-THE-SHORTFALL, AND FOR NOTHING WHEN THERE IS NONE`
  requires that a device AT TARGET makes NO refill request in that pass.
  `A-FAILED-REFILL-IS-AN-UNKNOWN-OUTCOME-AND-COSTS-NOTHING-ELSE` stages a FULL holding
  and asserts the refill is attempted in the last pass as well as the first. **Both
  cannot hold.** It was found by taking a decision that touched one of them and
  sweeping the other, not by searching for it — which is the sweep the brief ordered
  and the reason it was ordered. The design's own words put the request on every pass,
  so the first is the one that moved.
- **A BILL PARKED BEHIND A PERMANENTLY REFUSED SELLER HAS NO RELEASE EVENT.** The
  release fires on a settle and that seller never settles, so the bill is parked for
  ever, for cash already paid, on a row hard rule 5 forbids deleting — the harm the
  park exists to prevent, arriving from the one direction the park does not cover.
  **It is produced BY the third decision and is not answered**, because the repair is
  a decision with a screen behind it. **Nothing measures it:** the criteria set was
  searched for `422` and every hit is the BILL's 422 — not found with these words —
  so no criterion stages a refused seller create and nothing would go red. It is owed
  before the build, not after, and it is recorded at the decision that produced it and
  in the design's not-covered list.

**AND ONE STALE SENTENCE REPORTED AND DELIBERATELY NOT EDITED, because it is outside
this phase's declared file set and this phase did not make it stale.**
`OPEN_ITEMS.md`'s closure of the offline-seller-code decision says the three things
the design still owes — how many codes a device holds, when the holding refills, and
what the screen says when it is low and when it is empty — are "answered nowhere".
The design answered all three the same day that closure was written, and this
amendment has now moved two of them again. It is an unpinned present-tense claim that
rotted within hours, which is the failure the pin-a-claim convention describes, and
it is left for whoever next opens that file.

**IS A LESSON OWED? NO, and the two-homes test is applied by name rather than
asserted.** Nothing here is a MACHINE FOOTGUN: none of it is a property of this box
and all of it would read identically on any machine. And nothing here is a LESSON,
because each shape this phase met is already written down and is already indexed. The
two criteria that cannot both be staged are a document contradicting itself, which is
the third shared check in `CLAUDE.md § Shared checks` in its own words. The
unperformable cell the quantity leaving the wire would have created is
`lessons/README.md § Lessons` "a-quantified-sentence-names-no-member.md — applies the moment you ADD to or REMOVE from any set",
and it was avoided by that lesson's own remedy — sweep by what the change TOUCHES,
never by searching for the words you wrote. The block-of-one refusal is a
discriminator that reached only one of two red cases, which is the twelfth mechanism
of
`lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md — applies to every assertion"
— a sound cell and a wrong prediction about it. **A second note about a rule already
written is what
`lessons/README.md § Lessons` "a-warning-in-one-file-does-not-protect-the-next.md — applies to every hazard this repo has already paid for"
says does not work.**

**WHAT THIS PHASE DID NOT DO.** It built nothing, minted no P-number and no S-number,
deleted no line of any file it touched, reopened no decision of the owner's, and
answered nothing on the design's not-covered list except by adding one item to it. It
ran no proof, no typecheck, no server and no handset, so nothing in it carries an exit
code except the three checkers below. It did not touch `ARCHITECTURE.md` or
`BRIEFING.md`: neither architecture nor a hard rule moves here, which was checked
rather than assumed. And it did not touch `OPEN_ITEMS.md`, because no queue line was
cleared or raised — the one line worth a correction is reported above and left.

**P-SELLERKIND-CRITERIA — THE SELLER KIND HAS ACCEPTANCE CRITERIA, AND WRITING
THEM FOUND THAT THE SKIP THE DESIGN REQUIRES CAN REFUSE AN ONLINE CREATE.
DOCUMENTATION ONLY, 2026-08-24. One commit.** This supersedes the
P-SELLERKIND-DESIGN entry below as the current phase; that entry's record of the
design stands unchanged, and **not one line of the design was edited** — findings
against it are reported beside it and applied nowhere.

**THE CRITERIA LIVE AT
`ROADMAP.md § P1.8 — Seller creation from the phone` "THE SELLER-KIND CRITERIA, DERIVED FROM THE DESIGN ABOVE",
beside the design they are derived from.** They were written by a session that did
not write the design, which is the whole reason this is a separate step: criteria
written by a design's own author inherit its blind spots, and the outbox step wrote
criteria ahead of its own design and had to rebuild them twice.

**NO FILE UNDER `mobile/`, `server/`, `packages/`, `desktop/` OR `tools/` MOVED.**
No source file, no migration, no type, no route. No database was touched, live or
scratch. **NO PROOF AND NO TYPECHECK WAS RUN. That is a fact about this phase and
not an omission from it:** no code was touched, so neither instrument would have
carried information about the change. **Every dated green in Baseline observations
keeps its own date and NONE is refreshed by this work.**

**WHAT EVERY CRITERION CARRIES, because the shape is the deliverable and not the
prose.** The staging that produces its case, named before the assertion — a
criterion demanding a state the design forbids is UNPERFORMABLE, and one outbox
commit shipped three such sites in the same file as the paragraph forbidding the
state. A RED CASE written as an implementation somebody would plausibly build. The
case that DISCRIMINATES — the wrong behaviour that looks identical from outside,
and the observation that separates it — which is what an independent pass fired the
stop on when the outbox criteria could not supply it. And *can a broken
implementation satisfy it?* answered in the criterion's own text. Every absence
assertion carries a presence sibling in the same read; every difference is asserted
by DIRECTION and never by inequality; no statement sequence is printed anywhere; and
no raw count of the artefact appears in any of them, per
`OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "A RAW COUNT INSIDE AN ACCEPTANCE CRITERION ROTS".

**HOW MANY THERE ARE IS RECORDED HERE ONCE AND NOWHERE ELSE, which is this
repository's third repair form for a number that can grow.** Twenty-two criteria at
this commit, counted two independent ways in the same pass — by the bolded name that
opens each, and by the cost label (HEADLESS, SERVER or HANDSET) that follows it —
and the two agreed at twenty-two. The first spelling of that instrument counted
twenty-one, because one criterion's name wrapped across two lines and the pattern
required the closing marker on the opening line: **the splitter failed by finding
LESS, silently, and reported OK about a piece that had swallowed the missing one.**
It was caught only because a second count disagreed. The criterion was renamed to
fit one line, which is also what makes it citable.

**THE FINDING THIS PHASE EXISTED TO PRODUCE, AND IT IS AGAINST THE DESIGN RATHER
THAN AGAINST THE OWNER'S DECISION.** The design requires that the minting path SKIP
codes present in the reservation relation, and says nothing about WHERE the skip
lives. `_next_seller_code` derives its candidate from `max(code)` over `sellers`
alone, and `create_seller`'s no-code path retries a BOUNDED number of times over an
unchanged table — so a reserved block, which sits immediately above that maximum,
defeats a skip implemented as a post-check plus the existing retry. **The result is
a 409 `code_assignment_failed` answered to an ONLINE caller at the counter who
supplied nothing and did nothing wrong:** the yard's counter stops being able to add
a seller because a phone is carrying codes, which is this step's own failure
arriving from the other end.

**AND THE ARITHMETIC MAKES IT A CERTAINTY RATHER THAN A RISK, WHICH IS HOW THIS
ENTRY FIRST STATED IT AND WAS TOO SOFT. Corrected 2026-08-24 on the owner's
instruction, with both numbers RE-DERIVED HERE at their own sites rather than
carried from the advising session that raised it.** `_ASSIGN_ATTEMPTS = 8` at
`server/app/master.py:897`, which is the loop bound at `:1017` and the figure echoed
into the 409 body at `:1045`; the target holding the design proposes is **20**, at
`ROADMAP.md:2163`, labelled there as an assumption no measurement supports. **A
fully provisioned handset therefore holds a contiguous reserved block two and a half
times the assigner's ENTIRE budget**, so every one of those attempts lands inside
the block and the refusal is not a hazard the loop might hit — it is what the loop
does. **Sharper still, and it is the half the first wording missed:** because
`_next_seller_code` reads `sellers` alone and a post-check changes nothing in that
table, such an implementation does not even WALK the block — it re-derives the same
candidate on every pass and spends its whole budget on one value.

**THE ONE CONDITION UNDER WHICH IT IS ONLY A RISK, STATED SO THE CERTAINTY IS NOT
OVERSOLD:** the target holding is a per-tenant column with a floor of 1, so a shop
configured below the assigner's budget would leave gaps the loop can reach. At the
design's own proposed default it cannot. **Both figures rot** — the budget is a
constant somebody may change and the target is an assumption the design says a
trading shop will settle — which is why they are pinned to this dated entry and to
this site alone.

**THE CRITERION CARRIES THE SAME DEFECT WITHOUT THE DIGITS, DELIBERATELY, AND THE
TWO ARE NOT IN DISAGREEMENT.** `THE-ASSIGNER-STILL-TERMINATES-ABOVE-A-RESERVED-BLOCK`
states the condition — a block longer than the budget — and derives the block length
from the artefact when the staging is built, because a raw count inside an
acceptance criterion rots and this one has two that will. The arithmetic showing the
condition is MET at the design's proposed default lives here, in a dated record,
and nowhere else.

**AND SEVEN MORE, EACH RECORDED AT THE STEP RATHER THAN RESTATED HERE.** The three
that change what a reader would otherwise expect:

- **A LOST REFILL RESPONSE BURNS A WHOLE BLOCK, SILENTLY AND REPEATEDLY, AND NO
  CRITERION CAN BE WRITTEN FOR IT.** *An unused reserved code leaks for ever* and
  *if the refill fails, nothing else is affected* are both true of the DEVICE and
  jointly false of the CODE SPACE: the device's shortfall is unchanged, so the next
  pass asks again and the server mints again, and nothing anywhere prints a number
  that moved. The cheapest bound is a refill route made idempotent for a device,
  which is hard rule 4's shape — **and that is a DESIGN decision, so no criterion is
  written for it.** Writing one would take the decision, which is the one thing a
  criteria step must not do.
- **THE BRIEF FOR THIS PHASE ASKED FOR A REFILL THRESHOLD AND THE DESIGN REFUSES
  ONE.** The design decides that every sync pass tops the holding back up to the
  target and rejects a low-water threshold as a second unmeasured constant, so *a
  refill that fires on every pass* — which the brief named as the wrong behaviour to
  be caught — IS the design. The criterion was re-derived onto the QUANTITY
  REQUESTED, where the same hazard is reachable: a refill asking for the target
  rather than the shortfall tops the device up identically, shows `ample`
  identically, and leaks a block per pass into a relation nothing ever reclaims.
  **WHERE THAT PREMISE CAME FROM IS NAMED RATHER THAN LEFT AS A SLIP, confirmed by
  the owner 2026-08-24: it was the ADVISING SESSION'S OWN MODEL of how a refill
  would work, promoted into a prompt, and not a reading of the design it was
  briefing against.** That is the failure the Workflow rule below describes in its
  own words — a report read, believed, and written into the next brief as a premise,
  after which nothing checks it because the brief is the authority and the artefact
  is never reopened. **It was caught only because this step re-derived the design
  before writing a criterion from it**, which is the order the brief itself
  demanded; had the criterion been written obediently it would have staged a reserve
  either side of a threshold that does not exist, and nothing would have run.
- **`low` IS THE NORMAL STATE OF A WORKING DEVICE, FOR AS LONG AS A POLL INTERVAL.**
  `ample` means at target and `low` means below target and still able, and the
  refill tops up every pass — so an online handset that has just created one
  walk-in is amber until its next pass, over a condition that needs nobody. Nothing
  here changes it; it is recorded because the sentence written for `low` will be
  read far more often than the design expects.

The other four are a permanently refused create leaving a reservation held and a
code the device cannot spend; the release's owner question, which decides whether a
second person's bill is released or stranded for ever; the surfaces, deferred and
depended on in the same document; and a caller minting reservations under device
identities it invents, recorded as a bound rather than a stop.

**AND WHAT WAS CHECKED AND HELD, said so the list is not read as one-sided.** The
reservation's key choice, the two-state machine and the rejection of a third state,
no-reclaim and its stated cost, the device-not-user holder argument, the outcome
union's separation from `CreateSellerOutcome`, the registry member order, the
local-table-beside-`local_bills` choice, and the decision to park the bill on the
DEVICE rather than re-answer the server's 422 — each was read against the artefact
it claims about, and each held.

**TWO OF THE OUTBOX STEP'S OWN STATED RESIDUALS GET THEIR FIRST INSTANCE HERE**, and
both are named at the criterion that supplies it: its boot-recovery criterion's
residual, which stood because no kind with DURABLE in-flight state existed, and its
throw criterion's stated limit, that `resendIsIdempotent` is a declaration nothing
measures. The second is closed by reading the REQUEST rather than the row — a
`perform` that omits the reservation token compiles, classifies identically and is
green in every existing cell, while every replay after a lost response creates a
second seller for one person.

**IS A LESSON OWED? NO, and the two-homes test is applied by name rather than
asserted.** Nothing found here is a MACHINE FOOTGUN: none of it is a property of
this box and all of it would read identically on any machine. And nothing found here
is a LESSON, because each shape this phase met is already written down and a second
note about a rule already written is what
`lessons/README.md § Lessons` "a-warning-in-one-file-does-not-protect-the-next.md — applies to every hazard this repo has already paid for"
says does not work. The brief's threshold premise is a report promoted into a
prompt, which `CLAUDE.md § Workflow` "A REPORT IS A CLUE, NOT A SOURCE" already
covers in those words. A criterion green over the ABSENCE of a feature — the device
identity survives a sign-out today because the sign-out clearing this project still
owes is unbuilt — is the third mechanism of
`lessons/README.md § Lessons` "a-green-cell-is-evidence-about-the-assertion-not-the-claim.md — applies to every assertion you are about to cite",
and it is recorded as that criterion's own stated bound. The splitter that failed by
finding less is the oldest shape in
`lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md — applies to every assertion",
caught by the remedy that file already prescribes: a second, independent count.

**WHAT THIS PHASE DID NOT DO.** It built nothing, minted no P-number and no
S-number, edited no line of the design, reopened no decision of the owner's, and
answered none of the design's own not-covered list. It ran no proof, no typecheck,
no server and no handset, so nothing in it carries an exit code except the checkers
below. And it did not touch `ARCHITECTURE.md` or `BRIEFING.md`: neither architecture
nor a hard rule moves here, which was checked rather than assumed.

**P-SELLERKIND-DESIGN — THE SELLER KIND IS DESIGNED, AND THE DESIGN FOUND THAT THE
OWNER'S DECISION DOES NOT MAKE SETTLE-ON-409 SAFE ON ITS OWN. DOCUMENTATION ONLY,
2026-08-23. One commit.** This supersedes the P-SELLERCODE-DECIDED entry below as
the current phase; that entry's record of the decision stands unchanged.

**A DESIGN, AND NOT AN IMPLEMENTATION AND NOT A CRITERION SET.** The design lives
at `ROADMAP.md § P1.8 — Seller creation from the phone`, beside the seven-bullet
survey it answers. **No criteria are written** — they come from the design in the
next step, because the outbox step wrote criteria ahead of its own design and had
to rebuild them twice, and both rebuilds are recorded as supersessions at that
step. **No statement sequence is printed anywhere in it**, for the reason that
step also paid for: three drafts printed a drain, every mechanism defect either
review found lived inside the printed block, and the repair of that block arrived
carrying three new printed ones.

**NO FILE UNDER `mobile/`, `server/`, `packages/`, `desktop/` OR `tools/` MOVED.**
No source file, no migration, no type, no route. No database was touched, live or
scratch. **NO PROOF AND NO TYPECHECK WAS RUN. That is a fact about this phase and
not an omission from it:** no code was touched, so neither instrument would have
carried information about the change. **Every dated green in Baseline observations
keeps its own date and NONE is refreshed by this work.**

**WHAT WAS RE-DERIVED BEFORE ANYTHING WAS DECIDED, because the decision record
this session wrote the day before is a clue and not a source.** `OutboxKind` has
two members and a third is a compile error in three places until a handler exists;
**no seller-shaped outbox type survives** — one hit for `LocalOutboxSeller`,
`OutboxSeller` and `seller_create` across `mobile/src`, `mobile/app` and
`App.tsx`, and it is the comment explaining the removal, controlled against
`bill_void` in the same pass. **The queue entry quoting `LocalOutboxSeller.code`
was CORRECT AT THE SHA IT NAMES** — `e6249f6` holds it, two hits — and `47d17ab`
deleted it, so that quotation is a correctly-pinned historical record the tree has
overtaken rather than a description of anything present. `POST /sellers` refuses a
client-minted id and treats a supplied code and an absent one differently.
`sellers` was read FORWARD through the migration stack with every DROP applied —
**a read of a LOG and not a query of the head state** — and carries no idempotency
key, with no reservation relation anywhere in the stack. **And this device has no
persistent identity at all:** `mobile/app/ids.ts` is a uuid GENERATOR, not an
identity, and `local_identity` holds only tenant, user and a timestamp.

**THE TEN DECISIONS ARE AT THE DESIGN AND ARE NOT RESTATED HERE.** What belongs in
a status file is the three that change what somebody would otherwise expect:

- **AN UNUSED RESERVED CODE LEAKS FOR EVER. There is no reclaim and no
  re-issue**, because re-issuing a code to a second holder recreates the exact
  defect the owner's decision was taken to remove. The cost is gaps in the
  human-readable sequence, and it is accepted rather than glossed. **The race the
  brief asked about does not exist**, which is the answer rather than a dodge:
  with nothing re-issued there is no second holder to race, so no lease, no
  expiry and no stored future instant appears anywhere in the mechanism.
- **THE HOLDER IS A DEVICE, so P1.8b must mint a device identity that does not
  exist**, stored in SQLite and never in the keystore — a sign-out DELETES the
  keystore entry, and reserved codes must outlive a sign-out because the device is
  still holding them.
- **EXHAUSTION IS MADE LEGIBLE AND CANNOT BE MADE RARE ON ANY EVIDENCE THIS
  REPOSITORY HOLDS**, and the design says so in those words. Legible is real and
  is strictly better than what it replaces: the level is known on the device with
  no network call, so it can be shown continuously rather than at the moment
  somebody is refused. Rare is a function of the target holding and the longest
  offline stretch, and neither is measured anywhere here. **The residual the owner
  accepted stands exactly as recorded — the failure is RELOCATED, not removed.**

**THE FINDING THIS PHASE CARRIES, AND IT IS THE ONE THE STEP EXISTED TO
PRODUCE: SERVER-MINTED RESERVATIONS MAKE SETTLE-ON-409 SAFE IN PRINCIPLE AND NOT
AS THE SERVER STANDS.** Two further server decisions are required and neither
follows from the owner's decision on its own:

- **A HUMAN CAN TYPE A RESERVED CODE AND THE SERVER TAKES IT.** A supplied code is
  accepted from any staff session — D2 and S6 exist so a shop can keep its own
  paper codes — and the unique constraint is the only guard, while a reservation
  is not in `sellers`. The offline phone then drains, is answered 409, and under
  settle-on-409 binds its local seller to somebody else's row: **the measured
  defect, reproduced under the new design.**
- **THE SERVER MINTS ONE ITSELF WITH NOBODY MAKING A MISTAKE.** The assigner
  derives its candidate from rows already in `sellers`, and reservations are not
  there, so it will hand a RESERVED code to an online caller who supplied none.
  **This is the worse of the two, because the first needs somebody to type the
  wrong thing and this needs nothing.**

**The decision is NOT reopened** — that would be out of bounds and it is not
warranted. What is recorded is that the reservation is only an answer once the
server enforces it on every path that can write a code, and that with the
reservation TOKEN carried on the create the design does not need settle-on-409 at
all: a repeat is answered with the row the first attempt produced, and a 409 then
means an invariant violation and classifies `needs_review`, never `settled`.

**AND A SECOND FINDING THAT IS NOT IN THE SEVEN-BULLET SURVEY.** `POST /bills`
classifies an unresolvable `seller_id` as **422, PERMANENT, terminal**, on a
premise its own header states: the device could only have got that id from the
server, so a miss is corruption rather than a setup gap. **Offline seller creation
falsifies that premise and edits neither end.** Left alone, the first offline
walk-in produces a terminally failed bill for cash already paid, on a row hard rule
5 forbids deleting. The design does NOT ask for the server rule to change — it
parks the bill on the DEVICE before the request is ever sent, under the ordering
exemption that already exists — and the premise is queued at
`OPEN_ITEMS.md § Code debt found and left in place`.

**IS A LESSON OWED? YES, AND IT IS AN AMENDMENT RATHER THAN A NEW FILE.** Applying
*Two homes, one test* by name: this is not a MACHINE FOOTGUN, because nothing
about it is a property of this box and it would read identically on any machine.
It is a LESSON, because the project would otherwise RELEARN it and the cost of
relearning is a terminally failed bill for money already paid. **The home is
`unavailable-is-not-rejected.md`, which owns this exact classification and whose
index line would have been opened by this task** — and what it did not carry is
that a class is on loan from the CLIENT: each of its three assignments rests on a
premise about what the client can hold, and the client can remove that premise
with nothing edited at either end, nothing failing to compile and no proof
reddening. **The generated file was taken RED then GREEN** rather than green
alone: `--check` failed naming the amendment-count line, `--write` regenerated,
`--check` passed at 468468 bytes.

**AND THE ENTRY BELOW PREDICTED ITS OWN ROT AND WAS RIGHT INSIDE ONE COMMIT.**
P-SELLERCODE-DECIDED named two closed-record sentences by LINE NUMBER and said
both were "certain to drift again". Inserting this entry above them moved both,
and the numbers it carries are now stale. **They are not corrected, and no new
number is written in their place** — every phase entry goes at the head of this
section, so any figure here rots at the next one. The two sentences are the P1.18
stage-3 record's *waits on the owner's open decision* and the stage-2 record's
*cannot specify the seller kind until it is answered*, and **the text is the
handle that does not drift.** Both remain dated records of what was true when they
were written; neither is a live claim.

**WHAT THIS PHASE DID NOT DO.** It built nothing, minted no P-number and no
S-number, wrote no criterion, and answered none of the design's own not-covered
list. It did not sweep the other two failure classes for client-owned premises —
the lesson records that as an explicit bound. And it did not touch
`ARCHITECTURE.md` or `BRIEFING.md`: neither architecture nor a hard rule moves,
checked rather than assumed by reading every `sellers` mention in that file — four
lines, none of which says who mints a seller id or that master data is created
online.

**P-SELLERCODE-DECIDED — THE OWNER ANSWERED THE QUESTION THAT HAS BLOCKED P1.8b
SINCE 2026-08-18, AND P-SHEETFIRSTPRESS CLOSED IN THE SAME PHASE. DOCUMENTATION
ONLY, 2026-08-23. Two commits.** This supersedes the P-SHEETFIRSTPRESS entry
below as the current phase. That entry's record stands, and its close-out is
written into it rather than here.

**NO FILE UNDER `mobile/`, `server/`, `packages/`, `desktop/` OR `tools/` MOVED.**
Not one source file, proof, script, migration or tool. No database was touched,
live or scratch: no `psql`, no `alembic`, no `docker exec`, no `SELECT`. **NO
PROOF AND NO TYPECHECK WAS RUN. That is a fact about this phase and not an
omission from it:** no code was touched, so neither instrument would have carried
information about the change, and running one to produce a green would have
produced a true statement about a different object. **Every dated green in
Baseline observations keeps its own date and NONE is refreshed by this work.**

**COMMIT A — `626fc3c`, `PROJECT_STATUS.md` only.** P-SHEETFIRSTPRESS's last open
bullet superseded: the owner ran the second-press sequence on his handset and the
stack returns. The reading is split from its attestations, and the attestations
are labelled with whose they are — the pre-pass measurements are the advising
session's and were not re-taken here. **The finding inside that commit is the
LABEL, not the press.** The bullet read `R6`, which names nothing in this
repository: `grep -rn '\bR6\b' --include='*.md' .` returns four lines, three of
them the closed R-log's own resolution table and its restatement, in which `R6`
is *one shop uses it daily* and resolves to P2.1. The label came from a phase
brief, and a brief is not a file in this tree. **It arrived by a route the label
lesson's remedy does not name — it was TRANSCRIBED, not minted** — and a
transcriber has no reason to run a check whose trigger is minting.

**COMMIT B — the decision.** **S22** was minted into
`ROADMAP.md § What the owner has settled` after re-deriving the range with its
control in the same pass: 21 definition lines S1–S21 with no gap, the repo-wide
check for an S-number above 21 printing nothing at exit 1, and the control for the
existing range listing twenty files at exit 0. The owner was shown the four
options the queue entry itself records and **SELECTED THE SECOND — a server-minted
reservation, taken while online.** **NO PROSE CAME BACK WITH THE SELECTION**, so
that section's own convention is unmet for S22 exactly as it is for S20 and S21,
and no reasoning is invented in its place. **The cost he was shown is recorded as
what he was shown, not as a motive:** a reservation is finite on the device, so a
handset that exhausts its holding mid-shift cannot create a walk-in — the failure
P1.8b exists to remove, RELOCATED rather than eliminated.

**WHAT THIS PHASE MEASURED FOR THAT DECISION, all bare and all re-derived.**

- **NOTHING ON THE SERVER IMPLEMENTS THE RESERVATION.** Word-anchored,
  case-insensitive over `server/app/` `*.py`: **zero hits, exit 1**. The unanchored
  form returns two, and both are substrings of ordinary words — *releases* at
  `bills.py:537` and *preserve* at `master.py:24`. The same anchored sweep over
  `server/migrations/versions/`, eleven files, also returns **zero at exit 1** —
  **a read of the migration STACK and not a query of the head state**, which are
  two different measurements and this phase took only the first. **The controls,
  same tool and same corpus in the same pass:** the seller-code machinery returns
  ten lines at exit 0 across `db.py`, `master.py` and `seeddata.py`, and the
  `/sellers` route declarations return five at exit 0. The zeros are measurements
  because the instrument was shown to fire.
- **SO P1.8b IS NO LONGER A MOBILE-ONLY STEP.** It pulls a server route and a
  relation, which is a WIDENING of that step rather than a new one, and it is what
  S17 asks for. Five of P1.8b's seven survey bullets are wholly device-side; the
  sixth names a different server change and the seventh a server-schema fact with
  a device-side consequence. **None of the seven is the change this requires.**
- **THREE QUESTIONS THE DESIGN OWES AND NOTHING ANSWERS:** how many codes a device
  holds, when the holding refills, and what the screen says when it is running low
  and when it is empty.

**THE SWEEP WAS RUN BY THE QUANTIFIER, AND IT FOUND MORE THAN THE ONE SECTION THE
PHASE WAS POINTED AT.** In the settled-decisions audit, the range sentence, the
definition-line count and the three totals contain neither `S22` nor the word
*decision*, and all five were corrected by supersession after the row was added,
re-derived from the table rather than arithmetic'd: **ten** have a step, five need
none, seven outstanding, **10 + 5 + 7 = 22**, which equals the row count and the
definition-line count. **Two further sentences were found OUTSIDE that section**,
both live and both falsified by the decision: `ROADMAP.md`'s P1.18 design, which
argued the seller kind could not be specified because identity across offline
devices was an open decision, and that step's own not-covered list, which names
the kind as unspecified *by the owner's open decision*. **Both are superseded in
one clause each and neither is rewritten** — the removal's argument, the tree, and
the fact that the kind is still unspecified are all untouched. What moved is the
BLOCKER.

**WHAT THIS PHASE DID NOT DO.** It designed no seller kind, minted no P-number,
and answered none of the three questions above. It ran no proof, no typecheck, no
server and no database, so **nothing in it carries an exit code except the
citation, shared-check and lesson-builder runs recorded below**. It did not
re-take the advising session's pre-pass measurements. And it did not correct the
present-tense sentences inside CLOSED phase records in THIS file that the decision
also falsifies — the P1.18 stage-3 record's *waits on the owner's open decision*
and the stage-2 record's *cannot specify the seller kind until it is answered*, at
lines **697** and **1230** after this entry was inserted, both re-derived here and
both certain to drift again — **because those are dated records of what was true
when they were written, and this file supersedes rather than rewrites.** They are
named so a reader meeting one does not take it for a live claim.

**A THIRD FINDING ARRIVED FROM A CONTROL FAILING, AND IT IS A MACHINE FOOTGUN
RATHER THAN ANYTHING TO DO WITH THIS DECISION.** A CR-byte check over the three
edited files returned three zeros, and the control in the same invocation —
`lessons/README.md`, the one file this repository already knows carries CRLF in
its working tree — returned zero as well, which cannot be true. **`grep` on this
box opens files in TEXT mode**, so CRLF is stripped before the pattern is applied
and a CR count comes back **0 at exit 1**: a false clean, silently. Measured with
the needle built from its codepoint and confirmed `0d`: over a file whose bytes
read `61 6c 70 68 61 0d 0a 62 65 74 61 0d 0a`, plain `grep -c` returns 0 and
`grep -Uc` returns 2; over `lessons/README.md`, plain returns 0 and `-U` returns
**65**, agreeing exactly with a byte count taken in Python; and the other half,
because a flag that always answers yes would pass the first test too — an LF-only
file under `-U` returns 0 at exit 1. **The three zeros were correct, which is the
worst case**, because nothing in the output separated them from an instrument
that could not look. Re-run under `-U` they hold: CR=0 in all three files, and the
Python byte count agrees. **It is not written into `CLAUDE.md` by this phase**,
whose declared file set does not include that file; the measurement and both
controls are queued under `OPEN_ITEMS.md § Documentation`, beside the
`core.autocrlf` correction it directly serves.

**IS A LESSON OWED? NO — FOR BOTH FINDINGS, AND THE ANSWER IS WRITTEN OUT RATHER
THAN ASSUMED.** Applying *Two homes, one test* by name.

- **The `grep` CR blindness is a MACHINE FOOTGUN and gets no lesson.** It is a
  property of THIS BOX's grep build and would not reproduce on a machine whose
  grep opens files in binary mode, which is exactly the test that section exists
  for — and the rule says an environment trap goes to footguns and does NOT also
  get a lesson, because writing both dilutes an index whose value is that every
  line in it bites.
- **The `R6` collision is neither.** It is not a footgun: nothing about it is a
  property of this machine, and it would read identically anywhere. And it is not
  a lesson, because this project would not RELEARN it —
  `a-label-is-a-reference-with-no-checker.md` already carries **both** remedies
  that reach this case: *grep every other file for that exact label* would have
  returned the closed R-log, and *never write a bare label across a file boundary*
  forbids the sentence outright. The only gap is in the TRIGGER wording, which
  says *before minting*, and a second note about a rule already written is
  precisely what `a-warning-in-one-file-does-not-protect-the-next.md` says does
  not work. **So it is a DATUM about the `R` space and its home is this record** —
  which is also where the label lesson's own bound, that `S`, `P`, `A` and `R`
  were never checked, gets its second answer after the S-space audit checked `S`.

**P-SHEETFIRSTPRESS — THE PHASE FOUND ITS OWN PREMISE WITHDRAWN, AND SHIPPED THE
DEFECT IT FOUND INSTEAD. 2026-08-23. Two commits.** This supersedes the
P-OWNERDECIDED entry below as the current phase. That entry's record stands.

**THE BRIEF WAS WRONG, AND THE BRIEF SAID TO CHECK.** P-SHEETFIRSTPRESS was
dispatched to repair the add-seller sheet not appearing on the first press,
described in its own words as "diagnosed from source 2026-08-17, never repaired".
Its first instruction was to RE-DERIVE the defect before touching it, because the
queue entry's line numbers "have rotted before". They had rotted, and so had the
entry: `1204081` (2026-08-17 16:56:08 +0700) repaired the defect **77 minutes
after `56b5008` recorded it as unrepaired**, and the device pass followed at
`72b9881` two hours later. No code was owed. **The instruction to re-derive is the
only reason this was found rather than re-implemented over a working fix**, and
it is worth more than the phase's own output.

**COMMIT A — `5b441e8`, `OPEN_ITEMS.md` only.** The queue entry superseded, not
deleted, with the cause named: `1204081` did not clear its own queue line.
Measured rather than inferred — `git show --numstat` lists SIXTEEN files for that
commit (`wc -l` over the numstat, one line per file) and `OPEN_ITEMS.md` is not
among them, while its 200-line message quotes this entry's own symptom at `:4`
and names `56b5008` as the before state at `:16`, with `grep OPEN_ITEMS` over
that message returning zero. The author had the paragraph open and the queue was
never in view as a thing to edit. Also added: a NEW queue line recording that
`mobile/src/master/sellerCreateNotice.ts:241` (line re-derived, not copied) still
explains a notice by a two-Modal structure that stopped existing at `1204081` —
**a stale mechanism in a comment and NOT a live defect**, because the conclusion
it supports did not move.

**COMMIT B — an unarmed disproof that announced itself as armed.** Found while
verifying the phase's own instrument. `--break=` was parsed off argv in three
proofs and never compared against the modes each file implements, so one
transposed letter left the model UNDAMAGED while the run printed
`*** NEGATIVE CONTROL ACTIVE: --break=coexsit ***` and then `ALL CELLS PASSED` at
exit 0. **The operator asks for a disproof, is told one is armed, and gets a
clean run of undamaged code.** Swept BY CONSTRUCT rather than by the three
filenames it was reported under: `grep -rln 'startsWith("--break=")' mobile/src/`
returns exactly three, controlled against the eight files under
`mobile/src/proof/` that touch `process.argv`. Each now declares its modes and
refuses anything else AT MODULE SCOPE, above the first `console.log` — a guard
beside the banner would still let a rejected value announce itself on the way out
— and exits **2, not 1**, because in this suite 1 means assertions failed and 2
means could-not-run, which is what `prove:forbidden --offline` and
`reconcile.py` already mean by it. The lesson is a SEVENTEENTH mechanism in
`lessons/a-check-that-never-went-red-was-never-observed.md`, distinguished in
writing from the third — there the failing state is unreachable from the inputs
SUPPLIED; here the input was right and the harness discarded it, and then made a
positive claim about itself.

**WHAT WAS OBSERVED. Every command bare, status read in the same invocation.**

- `npm run typecheck` exit 0 and `npm run typecheck:app` exit 0, each run bare —
  two disjoint programs, both green.
- `npm run prove:sheets` exit 0 TWICE in a row with no reseed;
  `npm run prove:sellernotice` exit 0 TWICE in a row with no reseed.
- **THE PAIR, which is the evidence and not the refusal:** `--break=coexsit`
  exits **2** with the banner count **0** over a 15-line output (the zero
  controlled by the output being non-empty, since a banner is absent from an
  empty file too); `--break=coexist` exits 1, banner count **1**, and S2 still
  reads `asks for 2 — seller_picker + add_seller`. Same pair for
  `proveSellerNotice`: `colapse` exits 2 with no banner, `collapse` exits 1 with
  the banner and five red cells. **A validator that refuses everything passes the
  refusal half exactly as well**, which is why both halves were run.
- The repair of the ORIGINAL defect re-measured at HEAD: `rg` returns ONE
  `<Modal` line over `mobile/App.tsx` and `mobile/app/`, at
  `mobile/app/SheetHost.tsx:67`, with a positive control of 14 files of 14 in the
  same pass. Three disproofs with the cell NAMED IN ADVANCE each moved that named
  cell with its control green.
- `build_all_lessons.py --check` went RED naming the count line at `:496`, then
  `--write`, then `--check` green at 463290 bytes — a red-then-green pair on the
  generated file rather than a green alone.
- Citations: baseline `SOURCES=5 CITATIONS=447 BROKEN=6` taken BEFORE the edit,
  `SOURCES=5 CITATIONS=451 BROKEN=6` after, `SOURCES` read first and equal to
  what was passed, the total risen by exactly the four added. Line numbers read
  rather than the word: all six pre-existing breaks are `hits=0`, none new.

**WHAT WAS NOT OBSERVED, and none of it is rounded up.**

- **`proveSellerCreate`'s known-value half.** That proof needs a server against a
  SCRATCH database and this phase was forbidden any database, so it could not be
  run clean and its banner was never seen to return. What WAS measured is the
  discrimination: `--break=paht` is refused by the validator by name at exit 2,
  and `--break=path` PASSES the validator (`grep -c "unknown --break"` = 0) and
  stops later at the file's own environment guard. That is weaker than the pair
  the other two files carry, and it is the best available here.
- **THE SECOND PRESS. R6 REMAINS OPEN AND IS THE OWNER'S.** What it observes is
  NOT "the button works" — `72b9881` already records that. It is the STACK:
  press `+ เพิ่มผู้ขาย`, close the form, confirm the picker is underneath with
  its search box, and press the control AGAIN from there. `72b9881` records the
  first press and records that closing returns to the picker; it records no press
  from there.
- **The `process.exitCode = 1` preset**, in these three files or any other. Left
  alone deliberately and still queued as a whole-suite sweep, now carrying a
  clause that the files are NOT equivalent: latent where `main()` holds no
  `await` (measured — `proveSheets.ts` has exactly one `await` and it is the
  entrypoint's, against 35 in `proveSellerCreate.ts`), live where one does.
- **`--dump=` in `proveSellerNotice.ts` is still unvalidated.** Judged not to be
  this defect and recorded at the site rather than fixed: a mistyped dump
  selector prints nothing extra and announces no control, so it cannot tell an
  operator a disproof ran.

**SUPERSEDED 2026-08-23 — THE SECOND-PRESS PASS RAN ON A HANDSET, AND
P-SHEETFIRSTPRESS CLOSES AT THIS ENTRY.** The second bullet above is left exactly
as written; only its status moves. The reading and the attestations behind it are
SPLIT below, because a device observation has one instrument and that instrument
is a person.

**FIRST, THE LABEL IN THAT BULLET IS NOT CARRIED FORWARD, AND SAYING SO IS THE
POINT.** `R6` names nothing in this repository. Measured in this pass:
`grep -rn '\bR6\b' --include='*.md' .` returns FOUR lines and no more —
`ROADMAP.md:46` and `ROADMAP.md:56`, which are the closed R-log's own resolution
table, `PROJECT_STATUS.md:5506`, which restates that table, and the bullet itself
at `PROJECT_STATUS.md:144`, every line number re-derived here rather than copied.
**In the only space that defines it, `R6` is *one shop uses it daily*, resolving
to P2.1** — a step about a shop trading for days, which has nothing to do with a
sheet. The bullet's `R6` came from a phase brief, and a brief is not a file in
this tree, so the sentence carried a reference with NO referent here AND a
collision with one that has a referent. That is the measured case in
`lessons/README.md § Lessons` "never write a bare label across a file boundary",
arriving by a route that lesson's remedy does not name: **the label was not
minted by the session that wrote it down, it was TRANSCRIBED**, and a
transcriber has no reason to run a check aimed at minting. The line is superseded
rather than edited, per this file's own convention, and nothing below it uses a
bare label.

**MEASURED BY THE ADVISING SESSION BEFORE THE PASS, AND NOT RE-TAKEN HERE.**
`recycle_pg` was DOWN: the docker API unreachable, port 5544 closed while port
8000 was open — which is what put the clock guard's could-not-evaluate line
(`server/app/clock_guard.py:195`, re-derived in this pass) into the API's startup
output with a ConnectionRefused inside it. The box's LAN address still equalled
`mobile/app.json`'s `extra.apiBaseUrl`, which reads `http://192.168.1.238:8000`
at `mobile/app.json:32`, re-derived here. The owner then started Docker,
restarted uvicorn, and confirmed `/health` FROM THE HANDSET. **This session
touched no container, no server and no database, so every clause in this
paragraph is somebody else's measurement and is labelled as one.**

**THE OWNER'S REPORT, AND IT IS THE ONLY INSTRUMENT A DEVICE OBSERVATION HAS.**
He ran the sequence and reports it correct throughout:

- `+ เพิ่มผู้ขาย` opened the form **ON THE FIRST PRESS**.
- Closing the form returned to the **picker**, with its search box.
- The control opened the form **AGAIN, from there**.

**The third clause is the one no pass in this file has carried before.** The
2026-08-17 modal-host pass recorded below records the first press and records
that closing returns to the picker; it records no press taken from there.

**WHAT THIS ESTABLISHES, AND WHAT IT DOES NOT.** One handset, one build, one
session. It is the first observation that the STACK RETURNS — the property the
one-host repair buys, and the property no headless proof can reach, because the
defect was a native presentation and every proof cell in this repository runs
under node. It says nothing about iOS, nothing about a release build, and
nothing about a second device. **No row was read out of Postgres and none
exists to read:** a presentation leaves no row and no log line, which is the same
bound the 2026-08-17 pass already records for the first press, and it is a
property of the defect rather than a shortcut taken here.

**SO THE PHASE CLOSES, AND ITS FINDING WAS NOT THE REPAIR IT WAS BRIEFED FOR.**
The repair had existed since `1204081` — 2026-08-17 16:56:08 +0700, sha and date
re-derived with `git log -1` in this pass — which is 77 minutes after `56b5008`
(15:39:04 +0700) recorded the defect as unrepaired. What the phase produced
instead is two things it was not sent to find: **the harness that parsed
`--break=` and never compared it against the modes each file implements**, so one
transposed letter left the model undamaged while the run announced that the
negative control was armed; and **the withdrawal, in writing, of three taxonomy
claims** the seventeenth mechanism made about its own place in the file, one of
which the eighth mechanism already carried. Neither is a sheet.

**P-OWNERDECIDED — TWO DECISIONS THE OWNER REFUSED ARE RECORDED, AND FOUR
CAPABILITIES HE NAMED BECOME STAGE-1 STEPS. DOCUMENTATION ONLY, 2026-08-20. Two
commits.** This entry supersedes the P1.18 stage-3 entry below **as the current
DOCUMENTATION phase only**. That entry's record of the closed CODE phase — the
mechanism, the deleted drains, the device pass read out of Postgres — is untouched
by this and remains the current code record.

**NO FILE UNDER `mobile/`, `server/`, `packages/`, `desktop/` OR `tools/` MOVED.**
Not one source file, proof, script, migration or tool. No database was touched,
live or scratch: no `psql`, no `alembic`, no `docker exec`, no `SELECT`. The
schema statements this phase makes were established by reading
`server/migrations/versions/` FORWARD from `0001` to `0011` with every DROP
applied — **a read of the stack and NOT a query of the head state**, which are two
different measurements, and this phase took only the first.

**NO PROOF AND NO TYPECHECK WAS RUN. That is a fact about this phase and not an
omission from it:** no code was touched, so neither instrument would have carried
information about the change, and running one to produce a green would have
produced a true statement about a different object. **Every dated green under
*Baseline observations* keeps its own date and NONE is refreshed by this work** —
nothing below that heading was re-measured, and no line there should be read as
having been re-observed on 2026-08-20.

**COMMIT 1 — the two decisions.** S20 and S21 were minted into
`ROADMAP.md § What the owner has settled` after re-deriving the range: the
repo-wide check for an S-number above 19 printed nothing and exited 1, with a
control in the same pass listing twenty files at exit 0. **S20** — the desktop
back office stays an Electron application; a same-origin web back office with a
small ESC/POS print agent was put to the owner and REJECTED. Two consequences are
recorded and not softened: that file's own D7 and D11 both stay open, and the back
office does not converge with the shop owner's dashboard. Both are qualified BY
FILE, because `ARCHITECTURE.md` carries a different D-space in which D7 is a
different decision. **S21** — there is no family-trial step; a trial at the
owner's father's shop was put to him and REJECTED. **S7 is not superseded, not
amended and not re-argued**; the entry records only that a proposal to run
evidence-gathering in front of S7 was refused. Two rows were added to
`ROADMAP.md § Every settled decision, and the step that owns it`, each cell
established by the command written beside it, and its totals were RE-DERIVED from
the table rather than arithmetic'd: nine have a step, five need none, seven
outstanding, summing to the row count.

**COMMIT 2 — four stage-1 steps.** P1.19 (an end-of-day cash close), P1.20 (price
history), P1.21 (seller history at the weighbridge) and P1.22 (three named anomaly
signals) were minted into `ROADMAP.md § STAGE 1` after re-deriving the highest
existing stage-1 number and checking the four for collision with a control.

**THE DATA PREMISE WAS VERIFIED AND ONE QUARTER OF IT FAILED, which is the finding
this phase carries.** These four arrived on the claim that the data they need
already exists. Three hold: the seller-history facts, the override comparison
(hard rule 6 puts `unit_price` and `list_price` on every line) and the staff and
seller aggregation columns are all present. **P1.20 does not.** `product_prices`
carries no timestamp and no actor, the price write is an
`ON CONFLICT ... DO UPDATE` that overwrites in place, and no history or audit
relation exists anywhere in the stack — so the READING half of that step, not
merely its screen, has a schema dependency. **It is recorded as a dependency and
not built on**, and it is queued separately because it is the one gap where late
work costs data rather than effort: every price change made before that storage
exists is already unrecoverable.

**WHAT THIS PHASE DID NOT DO, and the first is the one most easily misread.**
- **NO MACHINE FOOTGUN WAS ADDED TO `CLAUDE.md`, AND THAT FILE IS NOT IN EITHER
  COMMIT.** A fourth footgun was proposed — that `grep -i` combined with `-F`
  aborts on this box, unconditionally, exit 134 — and **it did not reproduce.**
  Seven bare invocations, status read in the same invocation, all exit 0, on GNU
  grep 3.0 with one binary on `PATH` and `LANG=en_US.UTF-8`; `-iF` returns nine
  matching lines where `-F` returns eight, so the flag pair is producing the
  correct answer rather than failing quietly. The control that makes that negative
  a measurement: `bash -c 'kill -ABRT $$'` printed `Aborted` and exit 134 in the
  same harness. Writing the entry anyway would have put a claim measured false
  into the one section of that file whose value is that every entry re-derives.
  The measurement and its control are queued under `OPEN_ITEMS.md § Documentation`
  so the negative is not lost.
  **SUPERSEDED THE SAME DAY BY COMMIT 3 — THE BULLET ABOVE IS LEFT AS WRITTEN
  BECAUSE EVERY MEASUREMENT IN IT IS STILL TRUE, AND ITS CONCLUSION IS STILL
  WRONG.** The footgun IS written, at `CLAUDE.md § Machine footguns`, and that
  file IS in a commit of this phase. What changed is not a preference but the
  arrival of the mechanism: **the trigger is the C/POSIX locale.** Under
  `LC_ALL=C`, and with no locale exported at all, the pair aborts at 134 in the
  very session whose nine exit-zeros are recorded above; under a UTF-8 locale it
  returns the correct answer; either flag alone is fine in both. So the two
  sessions differed by ONE ENVIRONMENT VARIABLE, neither mis-read anything, and
  the reason the negative above looked general is now the entry's whole subject —
  **the failure is deterministic within a session and opposite between sessions,
  so re-running it confirms your own environment and discovers nothing.**
- **THE THREE FOOTGUNS ALREADY OWED TO `CLAUDE.md` WERE NOT SWEPT**, per the
  phase's own bounds. Their evidence was not re-measured here and the count of
  three has not gone down.
- **NO S-NUMBER WAS SUPERSEDED AND NO EXISTING LABEL WAS RENUMBERED.** Both new
  decisions record a REFUSAL; neither reopens anything.
- **NOTHING WAS OBSERVED ON A DEVICE OR A SERVER**, and nothing in this phase
  needed either.

**ONE FILE OUTSIDE THE PLANNED SET WAS EDITED, BY ONE TOKEN, AND IT IS DECLARED
RATHER THAN QUIET.** Minting `P1.20`, `P1.21` and `P1.22` breaks a live citation
NOBODY EDITED: section citations resolve by case-insensitive SUBSTRING over
heading lines, `P1.2` is a cited section, and each new heading contains it — so
that citation went from one hit to four at both of its sites,
`ARCHITECTURE.md:1371` and `OPEN_ITEMS.md`. Renumbering to dodge it is forbidden,
so both handles were widened to the step's fuller heading, which already resolves
at one elsewhere. **The edit to `ARCHITECTURE.md` is a citation handle and nothing
else** — no architecture and no hard rule moved, and that file's own content is
untouched.

**THE CITATION ARITHMETIC, because a total that rose by LESS than was written is a
class the checker cannot see and will never call broken.** Over ten sources, with
`SOURCES` read first and equal to the ten passed on every run. Baseline taken
BEFORE the first edit: `CITATIONS=477 BROKEN=7`. After commit 1's edits, two
citations written: **479**, +2. After commit 2's edits, eleven more written:
**490**, +11 — and per file, ROADMAP +3, PROJECT_STATUS +6, OPEN_ITEMS +2, which
is what was written in each. **`BROKEN` stayed at 7 across all three runs and the
seven are the same seven identities**, inherited, six of them a handle or section
name wrapped across two source lines; they are itemised under
`OPEN_ITEMS.md § Documentation` and none is this phase's. One break was caught
before it shipped by measuring a handle instead of trusting it, and one was
predicted and repaired before it could appear. The two repo checkers ran bare at
this boundary with status read in the same invocation: shared checks exit 0
(4 items, identical between the two files), `build_all_lessons.py --check` exit 0
(58 lesson files, document matching) — **no lesson was touched, which is what that
green says and all it says.**

**AMENDED 2026-08-20, THE SAME DAY AND BEFORE EITHER COMMIT LANDED — four
repairs, and the first is a defect in what this phase had already written.**

**1 — AN INVENTED ATTRIBUTION WAS REMOVED FROM BOTH NEW DECISIONS.** S20 and S21
each carried a paragraph headed *THE OWNER'S REASONING, recorded so it is not
re-argued*. **The owner gave no reasoning.** He was shown three options per
question and selected one; no prose came back with either selection. Both
paragraphs were therefore assembled prose wearing his name, in the one section of
that file whose declared purpose is to make its contents unarguable. Each is
replaced by **WHAT THE OWNER WAS SHOWN, AND WHAT HE ANSWERED** — the three
options, the one selected, and the fact that no prose accompanied it — followed by
an explicit statement that **the section's own convention is UNMET for S20 and
S21**, since none was given. The consequences that are derivable from the files
are kept and re-labelled as **not his reasons and not evidence of why he refused**;
the arguments that rested on nothing measurable (installation cost, a shop's
goodwill) are deleted rather than relabelled. **The record that a proposal was made
and refused is untouched** — that is the part with value and nothing here weakens
it. Swept across everything this phase wrote, with the words named:
`OWNER'S REASON`, `owner's reason`, `his reason`, `reasoning`, `re-argued`,
`because the owner`, `why he`, `he decided`, `the owner wanted`, `owner chose`,
`his own reason`. **Two hits were this phase's and both are repaired; every other
hit is a pre-existing record from an earlier phase and none was swept** — their
evidence has not been re-measured here.

**2 — `.claude/agents/metis.md` WAS RESTORED, AND IT IS IN NEITHER COMMIT.** The
working tree carried a one-line change to that file: the frontmatter
`description:` value gained surrounding double quotes, which is YAML-equivalent.
Nothing in this phase authored it and nobody can name what did, so it was
restored and `git status --porcelain=v1` re-read bare to confirm the line was
gone. **One correction to how it was reported: it did not move during this
phase.** It was already present as ` M` in the git status snapshot taken when this
session booted, before its first command ran. **And the phase's own staged-set
check was too narrow, which is why it could not see this:** requiring the STAGED
set to equal the declaration asks about the INDEX, and a modified-but-unstaged
path satisfies it completely — the fourteenth mechanism, inside the block written
to prevent it. Both `git diff --cached --name-only` and `git status
--porcelain=v1` are now read bare before each commit, and both must equal the
declaration.

**3 — "IT DID NOT REPRODUCE" WAS STRUCK FROM THE GREP ENTRY. It is a general claim
and it is false.** The advising session measured seven bare aborts (`EXIT=134`)
where this session measured nine bare exit-zeros, on the same day, in the same
repository. **Neither side mis-read a number, and the queue entry now records both
with the instrument each was taken through** rather than picking one. This
session's binary was established rather than assumed, because liveness is not
identity: `type -a grep` shows no alias and no shell function,
`cygpath -w /usr/bin/grep` resolves to `C:\Program Files\Git\usr\bin\grep.exe`,
`md5sum` agrees across `/usr/bin/grep` and `/bin/grep` at
`65b7eb148ea01dacf451bed0d1a4608e`, and the pair was re-run **by absolute path**
to the same exit 0 — so PATH order, aliasing and builtins are all excluded. **The
open question is therefore the execution ENVIRONMENT, not the result**, and it is
left open rather than guessed. The operating rule stands: do not combine `-i` with
`-F` in a shell `grep` on this box, and give any zero a positive control in the
same invocation.

**AND THEN THE MECHANISM WAS FOUND, WHICH IS COMMIT 3 — the paragraph above is
left as written and its conclusion, that `CLAUDE.md` should get nothing, is the
part that turned.** The variable is not the session, it is the **C/POSIX
LOCALE**. Measured in the session whose nine exit-zeros are recorded above:
`LC_ALL=C grep -iF` → `Aborted`, `EXIT=134`, and
`env -u LANG -u LC_ALL grep -iF` → the same, while `LC_ALL=C` with `-F` alone and
with `-i` alone both exit 0, and `LC_ALL=en_US.UTF-8 grep -iF` exits 0 with the
correct nine lines. The same abort reproduces on a two-line file outside the
repository under `LC_ALL=C`, so the file is excluded as well. **Two sessions, one
environment variable, and neither reading was wrong.** The footgun is therefore
written at `CLAUDE.md § Machine footguns` with the supersession stated in the
entry itself, and the queue entry is trimmed to a pointer that keeps both
sessions' observations. **The three footguns already owed there are untouched and
the count stays three.** What remains open is smaller: which shell exported which
locale, which is a question about the harness rather than about `grep`.

**4 — THE LESSON WAS WRITTEN, and it was owed rather than optional.** Minting
`P1.19`–`P1.22` broke a live citation nobody edited, because section names resolve
by case-insensitive SUBSTRING and `P1.20`–`P1.22` each contain the cited `P1.2`.
The two-homes test puts it in `lessons/`: a decimal label space colliding with its
own earlier members is a property of this PROJECT, not of this box. It is written
as an **extension of the sixteenth mechanism and not a seventeenth**, so that
file's single count line stays at sixteen. **The finding that generalises was
measured with its control in one pass:** eleven heading lines contain `P1.1`, so a
section citation naming `P1.1` in that file has been unresolvable since `P1.10`
was minted and **nobody noticed, because nobody cites it** — while the same run
returned fifteen
bare-label section citations at exit 0 naming `P1.7`, `P1.12`, `P1.16` and
`P1.18`. **The label space is already broken and what holds it up is which labels
happen to be cited; `P1.19` breaks nothing by luck, not by design.** A bound was
added at the label lesson's own remedy, because grepping the label you are minting
cannot see a collision created by a label you are not. Both index lines updated,
`all-lessons.md` regenerated: **58 lesson files, unchanged — two amended, none
added or removed.**

**P1.18 STAGE 3 — THE OUTBOX MECHANISM IS BUILT AND `runOnce` RUNS IT; THE TWO
HAND-WRITTEN DRAINS ARE DELETED. Code, two commits: `47d17ab` (2026-08-19) and
the commit carrying this entry (2026-08-20). THE PHASE DOES NOT CLOSE HERE —
the device pass has not run.** This entry supersedes the stage 2c entry below.

Commit 1 built the mechanism BESIDE the untouched engine: `OutboxRegistry` as a
mapped type over the two bill kinds, two handlers transcribing the drains, one
generic runner (policy-driven blocking and re-read, durable per-kind halts, a
PROCESS-scoped pass lock, the horizon refusal at the per-row write), the two
owed-count store members, and `prove:outbox` — 75 cells, green twice, with the
compile break reddening both typecheck programs at the registry literal, a
third-kind drain probe, and three deliberate breaks each moving the cells named
in advance. One lesson landed with it
(`lessons/a-default-exit-code-is-a-default-verdict.md`: a disproof had read as
a pass because node exits 0 when an unsettled await drains the event loop).

The commit carrying this entry switched `runOnce` to the runner and DELETED
`sendOne`, `applyVoids`, the engine's in-flight set and the `sendForbidden`
flag — the runner's halted set replaces it, retracted by `resumeAfterSignIn`
and `resetAfterSignOut` and by nothing else. `recoverInterrupted` now returns a
map keyed by kind whose key set equals the kind set. Observed at this
boundary, all commands bare with status read in the same invocation: both
typecheck programs exit 0; all 29 declared `prove:*` scripts ran twice with no
reseed — 25 exit 0 twice; prove:forbidden (1), prove:login (1),
prove:loginscreen (1) and prove:sellercreate (2) refuse in their own output for
want of a live API, exits identical across runs, with zero listeners measured
on their target ports against a 55-listener control. THE LEAKED-LOCK CATCH IS
MEASURED, NOT ARGUED: with the pass-lock release deliberately removed, the six
headless `runUntilQuiescent` files went red individually — prove:sync 1,
prove:void 1, prove:clock 1, prove:signout 1 (a crash, loud), prove:voidterminal
1, prove:voidowner 1 — and the seventh, prove:forbidden, refuses pre-engine and
cannot carry the catch; the runner was restored byte-exact (sha256) and
canaries re-ran green. Proof edits forced by named behaviour changes, and only
those: the recovery map's shape (proveSync, proveCart, sqliteProof), and
proveSync CASE 6's overlapped pass, which now RETURNS WITHOUT READING ROWS
instead of skipping the held head — the rule `PASSES-OVERLAP-AND-ORDER-HOLDS`
mandates. Per-file assertion counts against the base commit decreased nowhere.
Two dated design corrections went into `ROADMAP.md § P1.18` as supersessions:
`record`'s two stage-3 parameters, and the `skippedInFlight` clause that was
false of the code it described.

**WHAT THIS PHASE HAS NOT ESTABLISHED, plainly.**
- **NOTHING HAS BEEN OBSERVED ON A DEVICE.** The three Postgres-read
  observations — two bills weighed offline in a known order with the counter's
  MOVEMENT, a void requested offline and applied after reconnect, and one bill
  simultaneously awaiting send and carrying a void request — are UNOBSERVED.
  They need the owner at the handset (`npx expo start -c`, cache confirmed
  empty, full reload) against a server whose start time postdates the commit
  under test, on a tree measured clean at that commit. The phase stays open
  until they are read.
- The HANDSET and SERVER halves of the criteria are unobserved: the poison
  alarm driven to red on a handset, a real 424 parking a bill, real doc_no
  order read out of Postgres.
- EVERY-SURFACE-COUNTS-EVERY-KIND is untouched BY DESIGN — no screen was in
  scope — so the sign-out gate, the sheet and the strip still count bills
  only, `OutboxOwed` does not exist yet, and the strip still reads ส่งครบแล้ว
  over an owed void. That criterion's only landed parts are `unsentBreakdown`
  on the `LocalStore` contract and the headless owed/owedCount separation.
- No headless proof drives an engine-level send-403: only the API-bound
  prove:forbidden does. The halt path is proven at the runner level
  (prove:outbox O9) and the engine methods are one-line delegations.
- The seller kind, a large binary, and a second process: absent, per the
  design's own not-covered list. The pass lock is in-process; `claimForSend`
  remains the only cross-process guard.
- Every other proof still lacks the exit preset the new lesson prescribes —
  queued in `OPEN_ITEMS.md § Code debt found and left in place`.

**SUPERSEDED 2026-08-20, SAME DAY: THE DEVICE PASS RAN AND THE PHASE CLOSES AT
THIS ENTRY.** The first not-established bullet above is closed; the readings,
their attestations, and what still stands unobserved follow. Every value below
was read OUT OF POSTGRES (`recycle` on `recycle_pg`, read-only psql through
docker exec), never off a screen and never from the owner's account of it.

**The attestations, measured and not reported.** Tree clean at `bbef7a6`
(committed 2026-08-20T00:41:10+07:00). `recycle_pg` healthy on 5544. uvicorn
`app.main:app --host 0.0.0.0 --port 8000` from `server/.venv`, process created
2026-08-20 00:44:28+07 — three minutes AFTER the commit. Metro's live process
argv reads `expo start -c` (created 00:44:51+07); the `-c` in the argv is the
measured half of the cache attestation, the cache-observed-empty half is the
owner's report from start time. The request through the changed path is the
observations themselves: the changed program is the mobile bundle (this phase
touched no server route), and all three bills below reached Postgres at
00:49–01:03+07, after both processes started.

**(a) ORDERING, two bills weighed offline by staff, 19 seconds apart.**
`B-2569-398`: device_created_at 17:48:55.033Z, server_received_at
17:49:56.811Z. `B-2569-399`: device_created_at 17:49:14.360Z,
server_received_at 17:49:56.899Z. The doc_no order FOLLOWS the
device_created_at order, both landed 88 ms apart in one reconnect drain — the
head settled before the second was sent — and THE COUNTER MOVED: doc_no_counters
for the tenant at be_year 2569 reads last_seq 400, the tip before this pass was
`B-2569-397` (received 2026-08-18), so the pass consumed exactly three
consecutive seqs, 397 → 400, no gap and no rewind.

**(b) A VOID ON AN ALREADY-SYNCED BILL, requested offline by admin, applied
after reconnect.** `B-2569-398` (synced 17:49:56Z, eleven minutes earlier):
voided_at 18:01:07.390Z, voided_by = the admin id, void_reason present —
`ck_bills_void_consistency` enforces the triple, and non-refusal's server-side
evidence is voided_at NOT NULL. The requested-to-applied span is a DEVICE-LOCAL
fact (`void_requested_at` lives only in the handset's SQLite) and was not read
from this box; the offline span is not a defect.

**(c) THE SHARPEST: one bill simultaneously awaiting send and carrying a void
request — the STOP-4 repair read directly.** `B-2569-400`, weighed offline by
admin at device_created_at 18:02:07.365Z and void-requested before it had ever
synced. After reconnect: server_received_at 18:03:15.981087Z, voided_at
18:03:16.148933Z. **The interval is 167.846 ms**, against a 4-second poll
interval. That reading supports ONE PASS — the send settled, the void became
actionable and was read and applied in the SAME pass — and excludes the
reversed-registry-order behaviour, in which the void waits out a whole poll
interval. `SENDS-SETTLE-BEFORE-VOIDS-ARE-READ` holds on the device.

**WHAT THE PASS ESTABLISHED, AND ITS EDGES.** One handset, one Android debug
build served by Metro over one LAN address, one tenant, the dev database, one
staff and one admin account. Nothing here is about a release build, a second
device, iOS, or a route off this network. Still UNOBSERVED after this pass: the
poison alarm driven to yellow and red on a handset; a real 424 parking a bill
on the wire; the sign-out gate, sheet and strip under an owed void
(EVERY-SURFACE, out of this phase's scope by design); `prove:forbidden` still
does not carry the leaked-lock catch (it refuses before any engine runs) and an
engine-level send-403 still has no headless driver; and everything in the
design's own not-covered list — the seller kind, a large binary, a second
process.

**AND WHAT P1.18 DOES NOT GIVE ANYBODY, said so the step is not read as a
feature.** The mechanism carries the same two kinds the device carried before;
no operator sees anything they did not see before this phase. The seller kind
is not built and waits on the owner's open decision about identity across
offline devices. The step's value is a claim about FUTURE work: photographs and
offline seller creation stop paying the parallel-path cost the void paid —
nine columns, a second outcome union, a second transport method and six store
methods, per kind — and that value is realised only when the next kind lands.

**P1.18 STAGE 2c — THE PRINTED DRAIN IS REMOVED, THE TWO DEFECTS NO PROOF CATCHES
ARE REPAIRED, AND DESIGN REVIEW ENDS. Documentation only, 2026-08-19.** A second
independent review read the stage-2b design and criteria and fired the stop: five
stop-class findings, seven improve-class, and its own measurement that the design
is markedly better than what it replaced. This entry supersedes the stage 2b entry
below as the current documentation phase; the P-SELLERAUTHOR record further down
is still the current code phase. **Nothing under `mobile/`, `server/`,
`packages/`, `desktop/` or `tools/` moved**, no P-number was minted, no decision
was reopened, and no third review is scheduled — the remaining defect classes are
ones the existing proof suite reddens on its first run, and they are cheaper to
find there.

**THE MAIN ACT: the design no longer prints executable code.** Three drafts
printed a drain loop, and every mechanism defect either review found lived in the
printed lines — stage 2's could not advance past its first row, beside a flag no
printed line read; stage 2b's rewrite acquired a pass lock it released on no
path, declared a schedule member no printed line called, and reported skips
through a channel that did not exist. The drain is now stated as RULES, each with
a criterion that can turn red; the reason is recorded in the design itself so the
next author does not add the block back; and a lesson is written, because the
next design document is the site the in-file reason cannot protect.

**THE TWO REPAIRS NO PROOF WOULD HAVE CAUGHT.** First, the cross-kind order:
`engine.ts:394` runs the voids only after the send loop closes at `:386`, with
the crash-window argument at `:388-393`, and the design left that order to the
registry literal's member order with no rule and no criterion reading it —
re-derived by searching the criteria for *same pass / order / before / after /
enumerat*: every hit is within one kind or about registry totality. It is now a
stated rule of the mechanism, and `SENDS-SETTLE-BEFORE-VOIDS-ARE-READ` pins it
with a registry literal in the other order as its named red case. Second, the
void criterion's in-flight cell staged a state both stores refuse to represent —
a send in flight is `sync_state = 'syncing'` (`claimForSend`,
`SqliteLocalStore.ts:476-477`, mirrored in the fake) while an owed void requires
`sync_state = 'synced' AND doc_no IS NOT NULL` (`listVoidsToApply`,
`SqliteLocalStore.ts:967`, mirrored in the fake) — one column, two required
values. The cell is deleted; the drain's held branch, which rested on it, is
restaged against two owed voids under one runner, a state the stores CAN produce;
and what the deletion leaves unmeasured is stated at the criterion: nothing
behavioural now separates the prefixed in-flight key from a shared one, and the
field-by-field policy cell is the only carrier of that difference.

**WHAT THE REMOVAL COST, COUNTED.** No criterion referred to the deleted block:
the printed-code references inside criteria are self-contained red cases
describing the FIRST draft's loop, and they still stage. Five passages of design
prose did refer to it — the three-bounds paragraph, the termination sentence, the
`rereadAfterEach` path paragraph, the sentence counting the loop's reads of two
policy fields, and the stage-2b coda — and each now refers to the stated rules or
carries a dated supersession. After the edit the criteria count and the two
per-criterion sentences are EQUAL AT EIGHTEEN: eighteen named criteria, eighteen
with a named RED CASE, eighteen answering CAN A BROKEN IMPLEMENTATION SATISFY IT,
counted by splitting the criteria subsection at bold-name-plus-cost paragraphs
and matching each block with newlines collapsed — the first count, taken per
LINE, reported eight of the eighteen questions absent because the sentence wraps,
and the wrap-insensitive recount moved exactly those eight, which is the pair
that proves the instrument change did the work.

**WHAT REMAINS UNREPAIRED, AND WHICH PROOF IS EXPECTED TO CATCH EACH.** The pass
lock released on every exit path: caught by the seven proof files calling
`runUntilQuiescent` (`engine.ts:566`), which drive up to two hundred passes on an
injected clock, so a leaked lock starves the staged final state and the suite is
red in one run. The 401/offline collapse (`outbox.ts:283-288`, and the send
classifier at `:264-269`): caught by the poison criterion's pass-result cells and
by `proveSignOut` S9's 401-against-outage pairing. `nextAttemptAt`'s missing
caller: caught by nothing mechanical — recorded as an either/or the stage-3 diff
must answer in its own text. Of the seven improve-class findings, two were handed
to this phase and both re-derived: `local_bills` has 28 columns at run time where
the design counted the `CREATE TABLE` body's 27 (`master_as_of` arrives via
`ADDED_BILL_COLUMNS`, `schema.ts:357`, on every open), and `first_attempt_at` is
a fifth load-bearing column no criterion reads back. **The other five were not
among this phase's inputs** and stay with the review's record, for the owner to
route into stage 3's brief.

**WHAT CARRIES AN EXIT CODE, AND WHAT DOES NOT.** `tools\verify_citations.ps1`,
call operator, explicit array, over every file that carries citations — the
fourteen root-and-agent documents plus eleven lesson files: baselined BEFORE any
edit at SOURCES=25 CITATIONS=521 BROKEN=10, exit 1. Finally over twenty-six
sources — the same twenty-five plus the lesson this phase wrote, which carries
one citation — at SOURCES=26 CITATIONS=522 BROKEN=10, exit 1: the rise of one is
that citation exactly, every per-source count otherwise identical, and the ten
broken lines are byte-identical to the baseline's with line numbers stripped —
every one pre-existing, none created and none repaired by this phase.
`tools\verify_shared_checks.py` exits 0. The lesson bundle was regenerated —
`build_all_lessons.py --write` then `--check` exit 0 — which is one command
beyond the brief's read-plus-two-checkers bound, run because the Done table
requires the bundle checker green and a lesson landed this phase; it is a
documentation generator and touches nothing else. **Nothing else was run and
nothing else is claimed** — no build, no proof, no server, no device, no
database; this entry rests on file reads and greps, and each figure names the
command that took it.

**NO SHA IS GIVEN FOR ANY CLAIM IN THIS BLOCK, DELIBERATELY.** The work carrying
it was uncommitted when it was written, so the only sha available is the one that
does NOT contain it — the corollary under the pin-a-claim convention.

**DESIGN REVIEW ENDS HERE.** Two independent passes, both fired the stop, both
found their defects in printed code, and the second measured the design markedly
better than what it replaced. Stage 3 — the implementation — begins on the
owner's confirmation, inheriting the three constraints and the stage-3 inputs
recorded at the foot of the design.

**P-SAASGAPS — WHAT A PRODUCT SOLD TO STRANGERS NEEDS AND THIS ONE HAS NOT BUILT,
WRITTEN DOWN AND NOT SCHEDULED. Documentation only, 2026-08-19.** The owner raised
a set of gaps on 2026-08-19 and **deferred them the same day**. That deferral is a
decision about ORDER and about nothing else; it is not an assessment of importance,
and this phase carried out the recording half only. **Nothing under `mobile/`,
`server/`, `packages/`, `desktop/` or `tools/` moved.** No P-number was minted, no
step was created or extended, no ordering changed, and no S-decision was written or
superseded. Nothing on the list was fixed, including the two that were measured.
Three files changed: `OPEN_ITEMS.md`, `START_HERE.md` and this one.

**WHAT WAS WRITTEN.** One new section in `OPEN_ITEMS.md`, twenty-two items, each
carrying one of two markers and none carrying neither: **fifteen MEASURED** — a
command run in this pass with what it returned quoted at the item — and **seven
UNVERIFIED**, the advising session's reasoning left as reasoning, with the words
it would take to confirm or refute it. **The set is deliberately one section
rather than items distributed among the existing ones**, because the shape of what
twenty-two simultaneous gaps look like is itself the finding and splitting it hides
that. The counts live at the head of that section and nowhere else, this sentence
included by reference rather than by a second copy of the numbers.

**FOURTEEN OF THE THINGS RAISED WERE ALREADY RECORDED, AND ARE POINTED AT RATHER
THAN RESTATED.** The advising session named eight it believed were already on file
and all eight were — attempt limiting, the second free-guessing site at the
password route, the 422 echo, HTTPS, the daily report's scan, the backup's missing
schedule and destination, the backup tooling's inability to reach a database that
is not local, and iOS never having run the migration. **Six more that it did not
know about were found by searching for them**, five of those in `SRS_MAP.md`:
certificate pinning, the audit log, JWT key rotation, the one-hour token, licence
enforcement, and printing. **One of the eight is not merely recorded but CLOSED** —
the 422 echo was fixed on 2026-08-10 and `server/app/main.py:94` holds the handler,
re-derived here.

**TWO OF THE ITEMS AS RAISED WERE WRONG, AND BOTH CORRECTIONS ARE IN THE SECTION
RATHER THAN IN A REPLY.** "No search anywhere" is false: `SellerPicker.tsx`
describes itself as a search screen, renders a box, and calls `searchSellers` — the
true and narrower statement is that the search is a client-side linear scan over
the cached list and that no server route takes a search parameter. "No licence
enforcement behaviour decided" is false: `ROADMAP.md § What the owner has settled`
D3 settles what a lapse does, while `SRS_MAP.md § 7a. How a licence is enforced — nothing exists`
still calls that same question unanswered, so two sentences in the tree disagree
and one of them is stale. What remains true is that no licence concept reaches the
code at all.

**WHAT CARRIES AN EXIT CODE, AND WHAT DOES NOT.** `tools\verify_citations.ps1`,
invoked with the call operator and an explicit array so `[string[]]` binds, over
the fourteen sources that cite into the three files this phase touched: **baselined
BEFORE any edit at SOURCES=14 CITATIONS=483 BROKEN=10, exit 1**, and finally at
**SOURCES=14 CITATIONS=520 BROKEN=10, exit 1** — the same ten, diffed line by line,
with only two index numbers and one neighbouring OK row moving because citations
were added above them. **The rise of thirty-seven is accounted for exactly**:
thirty-one in `OPEN_ITEMS.md` (twenty-eight in the new section, two in the P1.13
entry, one in the closure added under Documentation), five in this file, one in
`START_HERE.md`. That accounting is the check, not the green: a checker that stops
matching fails by finding LESS, so the number it prints is only evidence once the
difference is predicted and met. **Every one of the fourteen sources passed both of
its own controls, before and after** — twenty-eight control lines each run, none
failing. `tools\verify_shared_checks.py` prints
`IDENTICAL: 4 items, 586 chars between markers` and exits 0.
**NOTHING ELSE WAS RUN AND NOTHING ELSE IS CLAIMED** — no build, no proof, no
server, no device, no database, by the brief's own bounds, so this entry rests on
file reads and greps and says which command produced each figure.

**NO SHA IS GIVEN FOR ANY CLAIM IN THIS BLOCK, DELIBERATELY.** The work carrying it
was uncommitted when it was written, so the only sha available is the one that does
NOT contain it — the corollary under `CLAUDE.md § Conventions` to the rule about
anchoring a claim. The item-level measurements inside the new section are dated
2026-08-19 and will rot in the ordinary way; each one names the command that took
it so the next reader re-runs rather than believes.

**ONE THING THIS PHASE SETTLED THAT A FILE HAD RECORDED AS OWED, AND IT IS FLAGGED
RATHER THAN BURIED.** `OPEN_ITEMS.md § Documentation` recorded, on 2026-08-18, a
choice between adding `build_all_lessons.py --check` to the Done table and leaving
the generated document to be regenerated by whoever writes a lesson. The 2026-08-19
brief instructed the first, so the row is now in `START_HERE.md § 4` and that
entry carries a dated closure saying which of the two was taken. **The rest of the
list is untouched: most of it is unverified by design, and nothing on it was
ranked, scheduled or repaired.**

**P1.18 STAGE 2b — THE DESIGN AND THE CRITERIA ARE REVISED, AND THE DRAIN THE
DESIGN PRINTED DID NOT WORK. Documentation only, 2026-08-19.** An independent pass
read the design and the criteria delivered by stage 2 and fired the stop. Seven
findings, all re-derived against the artefacts in this phase before any repair was
written. **Nothing under `mobile/`, `server/`, `packages/`, `desktop/` or `tools/`
moved**, no P-number was minted, no decision was reopened, no S-number was
superseded, and the staff photograph settled on 2026-08-18 is left where P-SWEEP
recorded it. This is the current DOCUMENTATION phase; the P-SELLERAUTHOR record
further down is still the current code phase.

**THE FINDING THAT MATTERS MOST IS THE ONE ABOUT THE MECHANISM, NOT THE
CRITERIA.** The generic drain the design printed **could not advance past its first
row**: it read `batch[0]` on every iteration under `while (true)`, so `batch[1]` was
unreachable and `continue` re-took the row it had just passed over. **And for a kind
whose retries stay owed it did not terminate at all** — `markVoidAttemptFailed`
writes `void_attempts` and `void_last_error`, neither of which appears in
`listVoidsToApply`'s predicate, so a bounced void is owed again on the next read and
the pass re-POSTs it for ever. It had also dropped all three of today's per-pass
bounds: `guard < this.batchLimit` and `!this.sendForbidden` from the loop header, and
the `attempted` set whose own comment says it is what stops "a bill that returns to
pending" being "retried in a tight spin". The design now carries a CURSOR over a
batch, three bounds, a `claim` member for the durable claim, a `halt_kind` that
survives the pass the way `sendForbidden` does, and a rule for when the head blocks
that is derived from the disposition rather than from an enumeration — *is the row
still owed after `record`*, which of the six dispositions exactly one is.

**FOUR MORE CHANGED THE DESIGN RATHER THAN THE CRITERIA, WHICH IS WHAT THE
RESTRUCTURING OF STAGE 2 WAS FOR.** `owedCount()` must NOT share `owed()`'s
predicate — `claimForSend` moves the head out of `QUEUED`, so a count sharing it
drops a bill for the length of its own request, up to twenty seconds, on a screen
that refreshes every 400 ms. The pass must still RETURN what the screen reacts to:
`SyncRunResult`, `sessionExpired`, `skippedInFlight` and `setOnline` appeared zero
times in the design, against a control of `claimForSend` which appeared four times,
while six lines of `mobile/App.tsx` react to those fields. `nextAttemptAt` can write
a schedule its own reader discards, because the horizon check is a CONSTRUCTOR throw
over two integers and cannot follow a per-row function. And the `ใบ` argument for an
exhaustive sheet named two things `OutboxKind` does not contain, because this same
design removed the third.

**TWO CRITERIA A BROKEN IMPLEMENTATION SATISFIED, AND THREE PROPERTIES NO CRITERION
REACHED.** A throw was required only not to be `terminal` — one member of six — so
`settled` passed, and on a void that is worse than the outcome it forbade:
`markVoidApplied` sets `voided_at`, `listVoidsToApply` requires it null, and
`voidProgressLine` then returns `แจ้งระบบแล้ว` on a cancellation the server never
received. The void-refusal guard derived its own domain from the post-change tree and
required each member's count to exceed zero — true by construction, and blind to the
deletion it existed to forbid. Unreached: the status strip (`grep -ci strip` over the
criteria returned 0, against a control of 5 for the same instrument over the whole
step), the owner predicate the design calls a requirement on every kind, and the pass
result. **The set went from TWELVE criteria to SEVENTEEN**, measured with one
whitespace-normalising script run over both objects — the superseded block in
`git show HEAD:ROADMAP.md` and the revised block in the working tree — because these
phrases WRAP and a line-anchored instrument reported five of the seventeen as missing
a sentence they carry. **Twelve of twelve carried a named red case and NONE carried
an answer to *can a broken implementation satisfy it?*; seventeen of seventeen now
carry both**, plus a cost label of HEADLESS, SERVER or HANDSET that none of the
twelve had, so a set nobody can afford to run in one sitting is visible as such.

**THE CONJUNCTION QUESTION WAS ASKED FROM FIVE FIXED DIRECTIONS, AND THE PREVIOUS
ANSWER TO IT WAS ITSELF A FINDING.** It closed with "A FOURTH WAS SOUGHT AND NOT
FOUND. No state was constructed in which every criterion is green and the DRAIN
itself is wrong" — while a wrong drain sat printed on the same page. All five
directions returned something this time, against one before. Three are recorded as
residuals rather than closed: the per-bill card, which no criterion reads and which
this repository has already shipped two defects on; four load-bearing columns of
`local_bills` that the drain writes and no cell reads back, `idempotency_key` the
sharpest of them because hard rule 4 lives on it; and the master cache, unchanged
from the previous answer.

**WHAT CARRIES AN EXIT CODE, AND WHAT DOES NOT.** `tools\verify_citations.ps1`,
invoked with the call operator and an explicit array so `[string[]]` binds:
**baselined BEFORE any edit at SOURCES=25 CITATIONS=487 BROKEN=12, exit 1**, and
finally at **SOURCES=26 CITATIONS=500 BROKEN=12, exit 1** — the same twelve, listed
and compared line by line, none of them in `ROADMAP.md`, and the one difference
between the two lists a line number that moved because `ROADMAP.md` grew above it.
The source list gained the new lesson, because a document that cites and is not a
source is the fifth mechanism this repository has already paid for. **The rise of
THIRTEEN citations is accounted for exactly**: nine added to `ROADMAP.md`, two to
this file, and the new lesson's single citation counted twice — once in the lesson
and once inside the regenerated `lessons/all-lessons.md`. **Two of the thirteen are
this paragraph's own doing**, which is why the figure was wrong once before it was
right: a count of citations, written into a file that is itself a citation source,
moves when you record it. Both positive controls held 26/26 and no `SOURCE MISSING`
appeared. `tools\verify_shared_checks.py` exits **0**.
`server/scripts/build_all_lessons.py --check` exits **1** before the regeneration and
**0** after, over 56 lesson files. **Everything else in this phase is a grep, a read
or a `git show`**, so no other claim in it carries a status: no build, no typecheck,
no proof, no server and no handset were run, and every type-system and behavioural
claim in the revised design is a READING of the artefacts.

**AND BROKEN WENT 12 → 20 → 12 IN THE MIDDLE OF IT, BY THIS PHASE'S OWN HAND.** The
new lesson's index line named a sibling lesson by its FILENAME, and eight citations
across five files use that filename as their handle — so one added line made every
one of them resolve to TWO, with **neither endpoint edited**. That is the ELEVENTH
MECHANISM of the very file the index line was pointing at, executed by the entry
announcing a lesson about sentences a membership change falsifies. It was caught only
because the checker was run over every source rather than over the files this phase
edited, which is the sixth mechanism's remedy and the one thing that could have found
it. The line now names that lesson WITHOUT its `.md`, and says in its own text why.

**AND ONE INSTRUMENT LIED INSIDE THIS PHASE.** `grep -c $'\r'` over
`lessons/README.md` returned 0 through the Bash tool, which reads as that file having
been normalised. Counted in BYTES it holds 62 CR and 62 LF — fully CRLF, exactly as
`CLAUDE.md § Machine footguns` says. The escape did not survive the invocation, which
is the empty-needle mechanism this repository already records; the index line was
appended by a script that COPIES the file's existing ending rather than assuming one,
and the BOM and all 63 CRLFs are intact after it.

**WHAT THIS COMMIT DELETED FROM THIS FILE, AND WHY REPLACEMENT WAS RIGHT FOR ALL OF
IT.** Five lines, in two hunks, and **none of them was a superseded record** — they
are the two occurrences of one present-tense sentence, *"This is the current
DOCUMENTATION phase"*, in the P-SWEEP record and in the P1.18 stage 2 record. Both
were struck through in place with `~~ ~~`, dated 2026-08-19, and given the record
that replaced them, which is this file's own convention rather than an exception to
it; the line count moves because a superseded sentence reflows the paragraph it sits
in, not because anything was dropped. **Two trailing clauses WERE reworded and have
been restored verbatim** — *"the P1.18 stage 2 record immediately below stays as
written"* and *"the P-SELLERAUTHOR record below stays as written"* — because only the
stale clause is the supersession's business and the rest of a sentence must survive
the way it was written. `ROADMAP.md`'s 243 deletions are a different thing and are
the revision itself: replacing a design and a criteria set is what this phase was
dispatched to do.

**WHAT THE SECOND REVIEW MUST BE TOLD, WRITTEN HERE SO THE NEXT DISPATCH INHERITS IT
RATHER THAN REDISCOVERING IT.** The revised design goes to a SECOND independent
review before stage 3 begins. **The drain loop was REWRITTEN, not patched** — a
cursor, three bounds, a `claim` member, a durable `halt_kind`, and a head-blocking
rule derived from the disposition instead of enumerated — **and a rewritten mechanism
has no history of being read.** Both defects the previous draft shipped, a loop that
could not advance past its first row and a policy flag with no path in which its
value took effect, were in PRINTED CODE THAT HAD ALREADY PASSED ONE REVIEW. Attack
the drain first, and read the printed code as code rather than as prose. The
forty-five findings from the review killed part-way through this phase are carried
forward as INPUT to that pass and are recorded at
`ROADMAP.md § What the NEXT review inherits — clues, not findings` with the four the
reviewer named as worth re-deriving first.

**P-SWEEP — EVERY SETTLED DECISION NOW HAS AN OWNER OR IS RECORDED AS HAVING
NONE. Documentation only, 2026-08-18.** S1 to S19 were swept against the steps in
`ROADMAP.md`, and the audited table is at
`ROADMAP.md § Every settled decision, and the step that owns it` "a decision with no step is a commitment nothing schedules".
**No file under `mobile/`, `server/`, `packages/`, `desktop/` or `tools/` moved.**
~~This is the current DOCUMENTATION phase~~ — **superseded 2026-08-19: the P1.18
stage 2b record ABOVE is now the current documentation phase.** The rest of this
sentence stands as written: the P1.18 stage 2 record immediately below stays as
written — and is now superseded in place, there — and the P-SELLERAUTHOR record
further down is still the current code phase.

**WHAT THIS PHASE DID NOT DO, first, because it is the part most likely to be
misread.** **No P-number was minted** — not for the UX rework, not for
photographs, not for the owner role, not for anything. No decision was reopened
and no S-number was superseded. Nothing was ranked. **The table is EVIDENCE for a
decision the owner has not yet taken**: how many steps to open. A reader who
treats a NONE cell as an authorisation has read it backwards.

**THE RESULT IN ONE LINE.** Nineteen decisions swept, nineteen cells established
by grep — equal, which is the check that says none was filled from memory of the
file. **Eight have a step. Four need none** and that is an answer rather than a
gap: S2 is superseded, S7 is a clock, S8 is an ordering rule, S17 is a scheduling
policy. **Seven are outstanding** — S9, S10, S11, S12, S15, S16 in part, and S18,
which cannot be scheduled apart from S9. Three of those seven are relied on
elsewhere in `ROADMAP.md` as the reason something cannot proceed while being
defined nowhere in it: S10, S12 and S16.

**THE FIGURES IN THE PARAGRAPH ABOVE DESCRIBE THE 2026-08-18 SWEEP AND ARE LEFT AS
WRITTEN; THE TABLE HAS SINCE GROWN.** P-OWNERDECIDED added S20 and S21 on
2026-08-20, so the current totals are nine with a step, five needing none and seven
outstanding, over twenty-one rows. **Seven outstanding is unchanged**, which is why
this is a pointer rather than a rewrite: neither new decision added an outstanding
step or closed one, and S10 is still the load-bearing gap this record names.
`ROADMAP.md § Every settled decision, and the step that owns it` carries the
recount, with each cell established by its own command.

**TWO ANSWERS OF 2026-08-18 WERE RECORDED, AND RECORDING THEM CREATED NO OWNER.**
Photographs stay in the pilot bar — the owner CONFIRMED S12 rather than reopening
it, **and then EXTENDED it the same day with a third photograph, one per staff
member** — and the shop owner's dashboard lives on mobile rather than on a fourth
surface, which leaves S1 untouched. All of it is written at the decision, with the
owner's reasoning, so none is re-argued. **None of it is a step**, and S12's cell
still reads NONE — the extension made the missing step bigger, not present.

**AND THE CONSEQUENCE THE TABLE CARRIES THAT NOTHING ELSE DID.** The photograph
chain is four layers — P1.18's outbox, S16's storage answer, the UX rework, and a
camera screen — and exactly ONE of the four is a step in `ROADMAP.md`. P1.18 is
minted and unbuilt: its stage 2 delivered a design and no drain. **So the pilot is
further away than the files in this repository imply**, and the dashboard joins
the camera screen behind S10's undefined rework, which makes S10 the load-bearing
gap rather than a tidy-up.

**THREE FINDINGS WERE RE-DERIVED RATHER THAN CARRIED. TWO HELD; ONE HELD ONLY IN
ITS SECOND HALF.** The dashboard does not need the owner role. The client's one
role-gated predicate — `mayVoid` in `mobile/src/session/deviceRole.ts` — fails
OPEN, **and that turned out not to matter**: an admin-only screen already exists
on the phone, the daily report, and the client deliberately does not gate it at
all. `server/app/reports.py:434` is `Depends(require_admin)` and the refusal is
rendered from the 403, over an argument written into `mobile/App.tsx` that a
token's role claim is advisory and up to an hour stale. **So the pattern a
dashboard would follow is already decided here, and it is server-side.** The
dashboard's server half is not gated by S10: `server/app/reports.py` declares one
route and its only `GROUP BY` is `b.id`, and nothing in `server/app/` aggregates
by `created_by` — the API does resolve a username for `voided_by`, which narrows
the claim to the word that carries it. So the read path is buildable today —
**and building it early would repeat the shape recorded below for `9ad225e`.**
Both halves are recorded; neither is recommended. The third finding named STAFF
photographs; a search of every tracked markdown for that requirement exited 1 at
the moment it was run, and **"not found with these words" is not "there is
none"** — S12 as settled on 2026-08-17 named one photo per bill and one face
photo per seller. Its second half is exactly right: `POST /users` is one of seven
routes in `server/app/users.py` that **no client** calls.

**AND THE OWNER THEN SETTLED THE THIRD PHOTOGRAPH, so the finding's subject now
exists — as of today, and not before.** S12 is EXTENDED with one face photo per
STAFF MEMBER, because `created_by` is a uuid and an owner away from the yard
cannot read one; it is written at the decision in `ROADMAP.md`, dated, as new. **The
measurement was right and the FRAME was wrong: a new requirement cannot be
verified against the tree, because the tree is where it is not yet.** The
consequence is that the two halves were about one thing after all — a photograph
attached to an ACCOUNT is taken where an account is created, no client can create
one, and that surface is **P3.7**. **S12 still gains no owner**; what grew is the
size of the step it does not have.

**WHAT CARRIES AN EXIT CODE, AND WHAT DOES NOT.** Two commands, both run bare with
their status read in the same invocation. `tools\verify_citations.ps1` over the
fourteen sources that cite into the two edited files: **baselined BEFORE any edit
at SOURCES=14 CITATIONS=453 BROKEN=10, exit 1**, and after the edits at
**SOURCES=14 CITATIONS=458 BROKEN=10, exit 1** — the same ten, none of them in
`ROADMAP.md`, and the count risen by exactly the five citations added.
`tools\verify_shared_checks.py` exits **0**. **Everything else in this phase is a
grep or a read**, so no other claim in it carries a status, and no build, proof,
server, database or handset was touched.

**FIVE INDEPENDENT VERIFICATION PASSES WERE DISPATCHED OVER THE TABLE; THREE
COMPLETED AND TWO DID NOT.** The three that ran each moved something — the
already-existing admin screen, the `voided_by` narrowing, the precision on "by
`curl` alone", S13's unreconciled "off-box", and the fact that P2.1 carries no
S-number though S7 is the decision that moved it — and every one was re-measured
here before it was written down. **The two that failed did so on a session limit,
not on a result**, so their subjects are checked by this session alone: a
systematic classification of every S-label occurrence across the tree, and a
completeness critic asking what the audit missed. The S-space collision recorded
in the table has one reader and no second one.

**IS A LESSON OWED? ASKED AND ANSWERED: NO, and the three candidates are named so
the answer can be disagreed with.** *(i)* The S-label collision confirms
`lessons/README.md § Lessons` "A LABEL IS NOT A CITATION" — that
file's own bound reads *S, P, A and R were not checked*, S is now checked, two
spaces exist and **no broken sentence was found**. A confirmation with no new
mechanism adds no rule, and the bound was true of the pass that wrote it. *(ii)*
The handed-down finding whose evidence held and whose subject did not is covered
by the standing rule that a report is a clue and not a source; re-measuring is
exactly what caught it, and nothing wrong reached a permanent file. It is recorded
where a reader of the table meets it. *(iii)* A handle wrapped across two lines in
the TARGET returned zero hits mid-phase — which is the trap
`CLAUDE.md § Conventions` "The target end is the harder one" already carries, hit
and repaired by its own written remedy. **Nothing new was learned, so nothing is
written**; the answer turns if the second shape recurs or reaches a file as a
premise.

**NO SHA IS QUOTED FOR THE TABLE'S MEASUREMENTS**, deliberately. The work carrying
them was uncommitted when they were written, so the only sha available is the one
that does not contain them — the corollary to this repository's pin-a-claim rule.
The line numbers in the table are into `ROADMAP.md` as it stood on 2026-08-18 and
will drift; each row carries the command that reproduces it.

**P1.18 STAGE 2 — THE DESIGN IS WRITTEN AND NO DRAIN IS BUILT. Documentation
only, 2026-08-18.** The generalised device outbox now has a design in
`ROADMAP.md § P1.18 — One outbox, several kinds of work`, and acceptance criteria
DERIVED from it rather than written ahead of it. **Nothing under `mobile/` moved**
and no P-number was minted. ~~This is the current DOCUMENTATION phase~~ —
**superseded 2026-08-19 by the P1.18 STAGE 2b record at the head of this section,
and this one is kept rather than rewritten because it is the evidence for what
replaced it.** An independent pass then read the design AND the criteria this record
announces and fired the stop again: **the printed drain could not advance past its
first row and did not terminate for the void kind**, two criteria were satisfied by
a broken implementation, and three properties — the status strip, the owner
predicate and the pass result — were reached by nothing. What survives below is
accurate about the four things the design concluded; what it does not say is that
the MECHANISM it delivered had to be rewritten rather than patched. The rest of the
struck sentence stands as written: the P-SELLERAUTHOR record below stays as written
and is still the current code phase.

**WHY IT LOOKS LIKE THIS.** The seven criteria that stood before were superseded
on 2026-08-18 because six of seven could be satisfied by a broken implementation
— they were written before the design existed, and criteria for a mechanism with
no shape cannot name the cases that discriminate. So the order was reversed:
design first, criteria out of it, and every criterion carries the name of a
concrete broken implementation it turns red. A criterion with no nameable red
case did not go in.

**WHAT THE DESIGN CONCLUDED, in the four places it disagrees with the sketched
types at `ac535c2`.** Each was re-derived against the artefact at `b3d3654`, a
commit at which `git status --porcelain` reported no tracked path modified.

- **The compile-time guarantee is not armed and cannot be armed as written.**
  `OutboxRegistry` is an interface with three hand-spelled properties that
  reference `OutboxKind` nowhere, so a fourth kind moves nothing — and no literal
  of it exists anywhere under `mobile/`, so nothing is red and nothing can be.
  The design makes it a mapped type over `OutboxKind` and requires a constructed
  literal a proof imports.
- **`dispositionOfSend` contradicts itself.** Its `rejected_resolvable` arm
  returns `{ next: "terminal", ... }` directly beneath its own comment reading
  "It is NOT terminal", while `markMasterDataMissing` writes
  `SET sync_state = 'pending'` and every pass releases parked bills. The design
  splits `parked` out of `terminal`, which is the three-way rule of
  `lessons/README.md § Lessons` "unavailable-is-not-rejected.md — applies to every sync/retry path"
  put in the type rather than in a comment.
- **The poison signal cannot survive the sketched signatures.** `record` takes
  only the disposition, and the `unavailable` arm drops `reachable` — the exact
  bit `markPendingAgain`'s two `CASE WHEN ? = 1` expressions turn on. The design
  hands `record` the kind's own outcome.
- **Nothing serialises the drain across passes, and that was recorded nowhere.**
  `claimForSend` moves the head `pending -> syncing`, and `QUEUED` requires
  `pending`, so a second overlapping pass takes the SECOND bill and both go
  concurrently; `doc_no` then falls to whichever request reaches the counter's row
  lock first. Head-of-line is a property of one pass, not of the device. The
  design adds a per-kind pass lock and states the three scopes it does not cover.

**STAGE 1'S TYPES ARE INPUT TO BE CORRECTED, NOT A FOUNDATION TO EXTEND.** This
paragraph exists for one reader: a stage-3 session that opens
`mobile/src/sync/outbox.ts`, reads its header, and believes it. **Two of the four
findings above are not subtle questions about mechanism design. They are the two
shapes an independent pass exists to catch, and both survived into a commit.**

- **A DOCSTRING MAKING A CLAIM ABOUT CODE TWELVE LINES AWAY, WITH NOTHING
  COMPARING THEM.** The header states the registry is
  `Record<OutboxKind, OutboxHandler<...>>` and argues a compile-time guarantee
  from it; the declaration is an interface with three hand-spelled properties and
  no reference to `OutboxKind`. **The header asserts a guarantee the file does not
  implement.** Nothing in this repository can see it: both typechecks pass because
  every type there is well-formed, no proof imports the file, and nothing executes
  a docstring — the class recorded at
  `lessons/README.md § Lessons` "a-docstring-that-states-a-filter-is-a-claim-about-its-caller.md — applies to every comment saying what a value EXCLUDES".
- **A COMMENT AND ITS OWN RETURN STATEMENT DISAGREEING IN ADJACENT LINES.** On the
  424 path: the comment reads "It is NOT terminal" and the next line returns
  `{ next: "terminal", ... }`. No file boundary, no indirection, nothing to trace
  — two lines.

**NEITHER IS FIXED IN THE COMMIT THAT RECORDS THEM, DELIBERATELY.** This phase is
documentation only and those are stage 1's types; the design RECORDS them and
stage 3 CORRECTS them. What must not happen in between is somebody extending that
file on the strength of its own header. **Read the declaration, not the paragraph
above it** — and treat every sentence in that file as a claim to re-derive, which
is what this design did and is the only reason either was found.

**`seller_create` IS REMOVED FROM `OutboxKind` BY THIS DESIGN.** What identifies a
locally created seller across devices before the server has seen it is an open
decision at
`OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "TWO OFFLINE HANDSETS CAN MINT THE SAME SELLER CODE",
and that entry states in its own text that this design step cannot specify the
seller kind until it is answered. A union member nobody may supply a handler for
is either a permanent red typecheck or a permanent excuse to leave the registry
unbuilt, and the second is what the tree holds today.

**WHAT WAS OBSERVED — and it is a short list, because this phase runs almost
nothing.** No product build, no typecheck, no `prove:*` script, no server, no
handset, no database. Every type-system claim above is READ OFF A DECLARATION and
is not a measured `tsc` result; the first criterion exists to measure exactly
that. **Three things WERE run, and the third is named because a reader could
otherwise call it a build:** the citation checker, the shared-checks checker, and
`build_all_lessons.py`, which the lesson edit obliges — its `--check` mode
reddens the moment a lesson file changes without regeneration.

- `& .\tools\verify_citations.ps1 -Source @('START_HERE.md','ARCHITECTURE.md','ROADMAP.md','OPEN_ITEMS.md','PROJECT_STATUS.md')`
  — run BARE with the call operator so `[string[]]` binds, redirected to a file
  rather than piped, and run BEFORE any edit so the after-run has a control.
  **BEFORE: `SOURCES=5 CITATIONS=355 BROKEN=6`, exit 1. AFTER:
  `SOURCES=5 CITATIONS=373 BROKEN=6`, exit 1** — the same six, decomposed and
  attributed: four under `OPEN_ITEMS.md` as source, two under
  `PROJECT_STATUS.md`, NONE under `ROADMAP.md`, and all six present in the
  before-run character for character, compared with the line numbers stripped
  because an insert of this size moves them. Both positive controls held on all
  five sources. Citations rose by 18 against 18 written — 11 into `ROADMAP.md`
  and 7 into this file — and that subtraction is the control the fifteenth
  never-went-red mechanism asks for. **These two numbers are a MEASUREMENT and
  they rot**: the after-figure was written at 366, then 370, then this, because
  each later edit to either file added citations. Re-run it; do not cite it.
- `server\.venv\Scripts\python.exe tools\verify_shared_checks.py` — exit 0,
  `IDENTICAL: 4 items, 586 chars between markers`.
- `server\.venv\Scripts\python.exe server\scripts\build_all_lessons.py` — run in
  three steps so the checker was seen to MOVE: `--check` exit **1** naming the
  first differing line, then `--write`, then `--check` exit **0**,
  `430371 bytes`. A green from a checker that was never seen red is not an
  observation.
- **ONE CITATION WAS BROKEN BY THIS PHASE AND FIXED INSIDE IT.** A new heading
  reading `#### THE DESIGN — stage 2, ...` made `ROADMAP.md § STAGE 2` resolve to
  TWO headings and took BROKEN from 6 to 7. It is recorded as the sixteenth
  mechanism of `lessons/a-check-that-never-went-red-was-never-observed.md`.

**TWO THINGS THIS SESSION GOT WRONG ABOUT ITS OWN WORK AND CORRECTED BEFORE THE
COMMIT.** Recorded because a phase record that only lists what the pass found in
somebody else's file is not a record of the pass.

- **A COUNT PUBLISHED AND THEN CORRECTED, 11 TO 12.** The criteria were first
  counted with an ad-hoc `awk` pattern whose character class admitted letters,
  digits, commas and hyphens and NOT a space, so the one criterion whose name
  carries a space — `A-THROW-IS-NEVER-TERMINAL, FOR EVERY KIND` — was invisible to
  it and the answer came back 11. Re-measured with a definition that admits the
  space: **12 criterion-opening lines against 12 `RED CASE, NAMED` markers**, one
  per criterion. The instrument failed by finding LESS, with no error and nothing
  red, which is this repository's oldest failure shape — and here it was the
  session's own instrument, built in the same minute, over its own output.
- **A RAW COUNT CAUGHT IN THIS SESSION'S OWN DRAFT.** One criterion had been
  written reading "thirty files under `mobile/src/proof/` import ...", which is
  exactly what
  `OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "A RAW COUNT INSIDE AN ACCEPTANCE CRITERION ROTS"
  forbids: a bare digit over a set the WORK grows, in the sentence used to decide
  a step is finished. It was found by running `CLAUDE.md § Shared checks` against
  the draft rather than against somebody else's file, and replaced by the SET and
  its SOURCE with the number produced at run time. **The check is only worth
  anything pointed inward**, which is the half that is easy to skip.

**WHAT IS STATED AS STILL BROKEN AFTER EVERY CRITERION PASSES.** The design
carries its own counter-example rather than claiming there is none:
`SqliteMasterStore.saveSellers` opens with an unconditional
`DELETE FROM cached_sellers`, and boot ends with a master refresh, so a locally
created seller written into that cache is destroyed on the next successful
refresh while its outbox row drains perfectly and every criterion stays green.
`cached_sellers` has six columns and none marks a row's origin. It is left as a
stated residual and NOT closed by a criterion, because this step must not build
offline seller creation.

**P-SELLERAUTHOR — `sellers` NOW RECORDS WHO CREATED IT. Migration 0011, one
commit, 2026-08-18.** `POST /sellers` writes the principal's user id into a new
`sellers.created_by`, guarded by a composite FK to `users (tenant_id, id)`. This
is the current CODE phase; the P1.12 record below stays as written for the mobile
side.

**WHY IT EXISTS.** P1.8a moved `POST /sellers` off `require_admin` and onto
`get_principal`, so a staff account at the weighbridge can bring a seller into
existence — a row carrying a real person's name, and where the shop asks for
them an id number and an address. Nothing recorded who did it. `purchase_bills`
has carried `created_by` since migration 0006, so the system knew who bought the
load and not who created the person it was bought from.

**WHAT IT DOES NOT DO, AND THIS HALF IS NOT SOFTENED ANYWHERE. NOTHING IS
RETROACTIVE.** There is no backfill and no UPDATE of any existing row. **Every
seller that already existed stays authorless PERMANENTLY**, and a `NULL` in that
column is not recoverable by any later migration, because the fact was never
written down. Measured in the scratch copy after all seven runs of the proof: 78
sellers, **20 carrying an author and 58 carrying none**, and the 58 decomposes
exactly — 47 rows that predated 0011, 7 per-run sentinels (INSERTed directly and
MEANT to read NULL), and the 4 that disproof 1 wrote while the column was removed
from the INSERT. The 20 are 4 apiece from the five runs in which the API wrote an
author. Nothing is unaccounted for.
The column closes the gap going forward and closes nothing behind it. It also
does not record who EDITED a seller: `PATCH /sellers/{id}` keeps `require_admin`
and does not touch this column, so an admin who renames a staff-created seller
leaves the staff member named — which is the truth about who CREATED it, and is
the reason no second column was added. Three other sites INSERT sellers directly
(`seed_dev.py:97`, `prove_rls.py:100` and `:283`, and the binding sentinel in
`prove_seller_create.py:253`) and all three keep writing NULL on purpose: a
fixture is not an API-written row, and teaching the sentinel to fill this column
would destroy the property that makes it discriminating. `_seller_payload` is
unchanged, so **no client sees the column at all** and nothing under `mobile/` or
`desktop/` moved.

**WHAT WAS OBSERVED, AND AGAINST WHAT.** Everything below ran against
`recycle_p18a_scratch`, a scratch database, migrated 0009 -> 0010 -> 0011. **The
live database `recycle` was not migrated, not written and not connected to** —
the scratch route exists because `prove_seller_create.py` creates sellers and
posts a bill through the real path, and `is_active` retires a seller rather than
removing one while hard rule 5 forbids deleting the bill
(`lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-database.md`).
The migration runner used a pre-flight that printed which database the child
would actually resolve to before any DDL ran, with a control run that had to come
back naming `recycle`; it did.

- `prove_seller_create.py --database recycle_p18a_scratch` — **exit 0 twice in a
  row with no reseed between**, run tags `010abeca` and `caaff233`, and a third
  green after the mutations were reverted. `B2` measured the server's binding
  rather than assuming it: a sentinel seller carrying the run's own uuid is
  written before the child uvicorn starts and the server is required to return
  it. The server is a fresh child per run, so it cannot be serving pre-migration
  code — and the changed path was RUN, not reasoned about: `POST /sellers`
  answered 201 and the new column was read back out of Postgres.
- **CELL 8 is the new one, and it is a differential over TWO REAL PRINCIPALS,
  not a non-null check.** It reads `created_by` OUT OF POSTGRES — never off the
  response, which would only prove the API echoes its own input — for the
  staff-created seller AND the admin-created one, and requires each to name ITS
  OWN creator. Both identities come from the SERVER (`/whoami`), neither is a
  literal
  (`lessons/a-differential-control-is-only-as-good-as-its-weaker-side.md`), and a
  cell checks first that the two principals are genuinely distinct. A fourth cell
  requires the directly-INSERTed sentinel to still have NO author, which is the
  nothing-is-retroactive claim as an observable.
- `reconcile.py --database recycle_p18a_scratch` — **exit 0, VIOLATIONS 0**, 78
  checks over 4 tenants, `S5` examining 23 constraints and 1 index. That count is
  UNCHANGED, which is the point: `fk_sellers_created_by` was deliberately NOT
  added to `REQUIRED_CONSTRAINTS`, for the reason 0005 and 0006 both give — a
  dump taken before this migration has neither the column nor the constraint, so
  S5 would redden on every restored copy for a reason that has nothing to do with
  money. The limits it prints on every run are unchanged and are not restated
  here.
- The column comment was verified **at the authority, not by eye**: length 381
  and md5 `b4ca994b1b0b6430c6f09a5d4475af56` read out of `pg_description`
  server-side, equal to the same two numbers computed from the Python literal,
  with a one-character control producing a completely different digest. It is
  ASCII-only and apostrophe-free, checked with positive controls on both halves
  of that instrument.

**THE DISPROOFS — THREE, AND THE FIRST ONE'S RESULT IS A FINDING ABOUT THE
DISPROOF ITSELF.** Each prediction was written down BEFORE the run.

1. **Remove `created_by` from the INSERT.** Predicted: exactly two cells redden,
   both in cell 8, via the non-null conjunct. Observed exactly that —
   `db=None` on both, `failures: 2`, exit 1, and NO other cell moved. Reverted,
   `sha256` byte-identical (`30e18447…`), green again.
2. **Write the principal's TENANT id into the column** — the disproof the brief
   named, a wrong, non-null, plausible value. **It reddened, and it did not test
   what it was meant to test.** The composite FK cannot resolve a tenant id to a
   user row, so the INSERT raised 23503 and `POST /sellers` answered 500:
   EIGHTEEN cells reddened and the two that matter read `db=None`, because no row
   was written and there was no wrong value to discriminate. A bare
   `IS NOT NULL` check would have produced the identical eighteen reds. The
   mechanism was confirmed directly — a probe INSERT naming a tenant id is
   refused by `fk_sellers_created_by`, while the same INSERT with a real user id
   succeeds, both rolled back.
3. **Write a REAL but WRONG user id** — FK-valid, non-null, plausible, which is
   the mutation that actually tests the cell. Writing the ADMIN's id reddened
   **exactly one** cell, the staff side, printing the stored value; writing the
   STAFF id instead reddened exactly the other one. **So both sides of the
   differential are load-bearing**, and no single constant can satisfy the pair.
   The cell is not a non-null check wearing a comparison.

**IS A LESSON OWED? ASKED, AND ANSWERED: YES — AND THE MEASUREMENT IS WHAT
DECIDED IT, NOT THE PLAN.** The brief predicted one probably was not owed, on the
reasonable ground that this is a column added by following an existing precedent,
and that would have been right had disproof 2 not come back as it did. It is a
LESSON and not a machine footgun by `CLAUDE.md § Workflow` "Two homes, one test":
nothing about it is a property of this box. It was written as an AMENDMENT to
`lessons/a-green-cell-is-evidence-about-the-assertion-not-the-claim.md` rather
than as a new file, because that file's "The discriminator" section carries the
very instruction the finding qualifies — *break the claim in the smallest way you
can and check that THIS cell moves* — which silently assumes the break you chose
can happen. A constraint can refuse your mutation, and then the red is about the
constraint; and the wide blast radius reads as MORE evidence when it is the
opposite, because a wide red is what a neighbour does.
`lessons/all-lessons.md` rides in this commit: `--check` went RED on the
amendment first (21 -> 22 amendments across 11 -> 12 files, which is the
generator's own positive control that it saw the change), then `--write`, then
`--check` exit 0 at 424026 bytes.

**`tools/verify_shared_checks.py` exits 0.** Neither copy of the shared four was
touched; it is run because a phase boundary runs it.

**ONE DISCREPANCY IN THE BRIEF, RECORDED RATHER THAN QUIETLY OBEYED.** The
dispatch stated that `prove_seller_create.py` "refuses to run without
`RECYCLE_API_BASE` and `RECYCLE_BINDING_SENTINEL`". Measured at `d02dc32`: it
does not, and no such environment variable appears anywhere in that file. What it
actually does is stronger, and is the thing the sentence was reaching for — it
requires `--database`, REFUSES the name in `APP_DATABASE_URL`, starts its OWN
uvicorn with the scratch URLs injected through the child's environment dict, and
MEASURES the resulting binding with a per-run sentinel. Nothing was supplied to
satisfy the phantom requirement.

**WHAT THIS PHASE STILL CANNOT SEE.** That any client can call the route or any
operator can reach it — there is no screen, and nothing under `mobile/` was
touched or executed. Anything about the live database: **`recycle` is still at
migration 0010** and has neither the column nor the constraint. And the
concurrency path — cell 1's retry loop is exercised in sequence, never by two
callers racing.

**P-OUTBOXREVIEW — THE P1.18 CRITERIA REVIEW RETURNED, THE STOP FIRED, AND STAGE 2
DOES NOT BEGIN. Documentation only, one commit, SIX declared paths, 2026-08-18.** No code path
changed; nothing was run against a server, a database or a device, and no proof
was run because nothing this phase touches is executed. The P1.12 record below
stays the current CODE phase exactly as written.

**WHAT THE REVIEW WAS AND WHAT IT FOUND.** An independent session was given
P1.18's seven acceptance criteria, `CLAUDE.md`, `lessons/README.md`,
`START_HERE.md § 3` and the code under `mobile/`, and was withheld this file,
`OPEN_ITEMS.md`, `ROADMAP.md` and every recent commit body, so that it could not
inherit the author's reasons for believing the criteria adequate. It reported
NINE stop-class findings. The stop rule fires on either a state satisfying all
seven while the work is broken, or a demonstration that any ONE criterion can be
green over a broken implementation; both fired. **Six of the seven have no red
case for the property they name.** The findings are not restated here — they are
a specification at `ROADMAP.md § P1.18 — One outbox, several kinds of work` "THE SEVEN ARE SUPERSEDED, NOT DELETED",
which is where the step's restructure is recorded and where they are load-bearing.

**WHAT THE REVIEW COULD NOT ESTABLISH, AND IT IS MOST OF WHAT A READER WILL WANT.**
It read CRITERIA and stage 1's declared types. It did not build the drain, run a
typecheck, run a proof, reach a server, open a database or touch a handset, so
**nothing in it carries an exit code** and no finding is a device observation.
Every claim in it is a read of source at `e6249f6`. And its independence is
partial in a direction that must be recorded rather than assumed away: **the
dispatch was written by the session that had reviewed these same criteria once
before**, and six of the seven exist because of that earlier pass — so it is
independent of the AUTHOR's reasoning and NOT of the reviewer's. An empty report
from it would therefore have established only that a second reader, holding the
criteria's own justifications and none of the surrounding argument, found nothing
further. That is a weaker claim than "the criteria are sound", and it is the one
that would have been recorded.

**THE INTERPRETIVE QUESTION THE REVIEW RAISED AGAINST ITSELF WAS SETTLED AGAINST
THE REVIEWER'S CAUTION, NOT WITH IT.** The reviewer named, as the strongest reason
to overrule it, that several criteria carry a justifying sentence and an
observable sentence and that it had judged them against the first. The dispatch's
own stop table reads *a broken implementation SATISFIES the criterion → STOP*, and
what a broken implementation satisfies is the OBSERVABLE — so the criterion is its
observable and the justifying sentence is what says whether that observable is
adequate, which is the case rule (b) exists for. All nine stand. The argument is
recorded at the step and not repeated here.

**WHAT THIS PHASE WROTE, AND WHAT IT DELIBERATELY DID NOT.** The seven criteria
are SUPERSEDED IN PLACE and not deleted — they are the evidence for why the step
was restructured to deliver a design first. The replacement criteria are NOT
written: they come from a design that does not exist, and writing them now would
repeat the error being recorded. Two findings were lifted out of the criteria
question into `OPEN_ITEMS.md § Decisions open — the owner's, not the code's` — the
seller-code collision, which is a defect in the design the criteria MANDATE rather
than in a criterion, and the boot-path order disagreement held over from
P-PASTESET. Neither is authorised work.

**SEVEN HANDED-DOWN CLAIMS WERE RE-DERIVED. FIVE HELD; TWO DID NOT.** Both
failures were line numbers rather than facts, and both are corrected at the step:
the send loop's in-flight guard is `break` at `mobile/src/sync/engine.ts:349`, not
`:348`, and `syncOnce` is fired from its interval plus FOUR other call sites, not
five. One claim was narrowed rather than refuted. **This is why a brief's premises
are re-measured and not carried:** three of the seven had been marked verified
before dispatch, and one of the two corrections was in that group. **A wrong
verification badge is worse than no badge**, because its whole function is to
tell the next reader they need not look.

**AND THE PHASE FOUND ONE THING NOBODY SENT IT LOOKING FOR.**
`tools/verify_citations.ps1` cannot parse a citation whose target filename
contains a hyphen — which is every file under `lessons/` — and such a citation is
not reported BROKEN, it is not reported at all. It was caught by arithmetic: the
checker's count rose by three where four citations had been written. **Neither of
the checker's two positive controls can fire on it**, because both count only what
the same failing class already matched. Measured latent — of 442 parsed citations
naming 14 distinct targets, none carries a hyphen, and the only citation-shaped
reference to a hyphenated file in the whole 25-document corpus was the one this
phase had just written, since re-pointed at the index. Filed at
`OPEN_ITEMS.md § Documentation`.

**OBSERVED — the citation checker, before and after, over TWENTY-FIVE sources.**
`tools/verify_citations.ps1`, run with the call operator and an explicit array,
bare, one invocation per pass, output redirected and the status read in the SAME
invocation. `SOURCES=` was read first and equalled the 25 passed. **The source set
is every TRACKED document that CITES INTO one of the three edited files**,
enumerated by grep rather than by memory — the word TRACKED is what makes the
number reproducible, and it is doing work. Taken on the working tree, 2026-08-18.
**ANCHORED 2026-08-18 to `d02dc32` by P-SELLERAUTHOR — the half of the
pin-a-claim convention that gets skipped.** The work these figures describe was
committed as `d02dc32`, and no sha existed that contained them at the moment they
were written, which is why the sentence above says *working tree* and stops
there. **IT IS NOT AN INFERENCE**, the same standard this file applied when it
anchored P-PASTESET's figures below. P-SELLERAUTHOR re-derived the source set by
the same grep over `git ls-files "*.md"` — 25 files, the same 25 — and re-ran the
same checker over them, BEFORE it edited anything, on a tree whose only
`git status --porcelain` entries were three UNTRACKED paths, so the tracked tree
was `d02dc32`. It reproduced the AFTER column exactly: `SOURCES=25
CITATIONS=451 BROKEN=16`, exit 1. The `421060 bytes` figure below was
independently confirmed the same way — `build_all_lessons.py --check` read
exactly that from disk before this phase's own lesson work moved it.

| | before | after |
|---|---|---|
| SOURCES | 25 | 25 |
| CITATIONS | 435 | 451 |
| BROKEN | 16 | 16 |

**BROKEN DID NOT MOVE, AND ALL SIXTEEN PRE-DATE THIS PHASE.** `BROKEN` has FIVE
contributors in this checker, not three: a missing target file, a citation whose
handle or section resolves to a count other than one, the sections control, and
the non-empty control. Two of the five did not fire at all here — no target file
was missing and the sections control printed OK on all 25 sources in both passes.
Decomposed: **ten**
are *resolves to nothing* (`hits=0`) — three of them a section name that wrapped
across two lines in the citing file, two a handle that wrapped and came back
joined by extra spaces, two a section captured with a blockquote marker on the
front, two a handle whose target heading now
wraps a filename in backticks the citation does not, and one a handle absent
from its target entirely; **one** is *resolves to
two things*, `` `core.autocrlf` `` appearing on both `CLAUDE.md:198` and `:200`;
and **five** are the checker's own non-empty control firing on sources THIS PHASE
NAMED that carry no citation in the checked shape at all. **Those five are an
artefact of the source selection and not repository breakage** — they are lesson
files that mention a target filename in prose or with a line range rather than as
a citation. The eleven real ones are in files this phase did not edit except where
noted, and it repaired none of them.

**THE FOUR-AGAINST-SEVEN CHECK THIS PHASE OWED ITSELF.** This phase only ADDS
text, so the one way it could break an existing citation is by repeating a handle
until it resolved TWICE. The 78 distinct handles resolving into the three edited
files were enumerated first and every drafted line was checked against them,
case-insensitively, before anything was written. None collided. The
sixteen citations this phase writes all resolve at one hit each.

**`tools/verify_shared_checks.py` exits 0.** Neither copy of the shared four was
touched; it is run because a phase boundary runs it.

**`server/scripts/build_all_lessons.py --write` then `--check`, both exit 0** —
`CHECK OK ... 421060 bytes`. The generated file rides in this commit because the
checker reddens the moment a lesson changes.

**AND IT CARRIES 51 LINES THIS PHASE DID NOT AUTHOR, WHICH IS SAID HERE BECAUSE A
READER DIFFING THIS COMMIT WILL FIND THEM.** `lessons/all-lessons.md` was ALREADY
STALE at `e6249f6`: measured with `git show`, `lessons/console-is-not-the-
observation.md` carries its P1.12 amendment at that commit and the generated file
does not — one hit against zero, and the banner read `20 across 10 files` where the
sources hold 21 across 11. So `--check` would have exited 1 at `e6249f6`, and this
phase's regeneration necessarily repairs P1.12's omission as well as carrying its
own. The generator is all-or-nothing; there is no partial regeneration to offer.
**None of the amendment count is this phase's:** mechanism 15 is headed `A
FIFTEENTH MECHANISM`, and the generator counts only headings matching
`AMENDED|Amendment`, so the 20 to 21 move belongs entirely to the stale P1.12 work.

**`build_paste_set.py` WAS NOT RUN, in either mode.** The duty was retired at
`e6249f6` and there is no paste-set list to report.

**IS A LESSON OWED? ASKED, AND ANSWERED: YES, AND IT IS WRITTEN.** The phase was
re-opened with a re-declared six-path set for exactly this; the first declaration
was three paths and could not accommodate the `lessons/` exemption its own brief
granted, so the phase stopped rather than close in violation of a rule it holds.
**THE FINDING SPLITS, AND THE TWO HALVES HAVE DIFFERENT HOMES** — the test is
`CLAUDE.md § Workflow` "Two homes, one test", asked as *which thing would the
forgetting break*. The hyphen in the filename class is a DEFECT IN A REPO-OWNED
TOOL: a bug in your own instrument gets fixed, not remembered, so it stays a queue
entry under `OPEN_ITEMS.md § Documentation` and the fix is a `tools/` change in a
later phase. What is lesson-shaped is the MECHANISM, and it is neither the hyphen
nor a machine footgun — nothing about it is a property of this box.
**A FIFTEENTH MECHANISM was appended to
`lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md"**
rather than filed as a new lesson: that file's whole subject is a control that
cannot go red, its established shape is numbered mechanisms each carrying a *why
it is none of the previous* section, and a new file would split one subject across
two homes. The mechanism is sharper than the hyphen that exposed it — **the
positive control was built out of the same expression whose failure it exists to
detect, so it subtracted the identical blind spot from both sides of its own
comparison and agreed with itself.** Its two nearest relatives are named in the
amendment and are both OUTSIDE that file, which is the practical half: one of them
carries the right remedy under a scope statement that does not reach this case.

**P-PASTESET — THE PASTE-SET DUTY IS RETIRED. Documentation only, one commit,
2026-08-18.** No code path changed; nothing was run against a server, a database
or a device, and no proof was run because nothing this phase touches is executed.
The P1.12 record below stays the current CODE phase exactly as written.

**WHAT WAS RETIRED, AND WHY.** The advising role has run as a session inside this
repository since 2026-08-16 and reads the tree live, so the copies
`tools/build_paste_set.py` produces have no reader. The STANDING obligation to
rebuild and re-paste after every commit that moves a declared file was therefore
maintenance of an artefact nobody opens, and it is retired. Two documents carried
it and both are SUPERSEDED IN PLACE rather than rewritten: the second unprompted
duty in `ADVISOR.md § 2. Two duties it performs UNPROMPTED`, and the
`START_HERE.md § 2. Who writes what` bullet that still described the advising
chat as reading a paste set and not the codebase — one dated sentence there,
pointing at the boundary rather than restating it. `P-PASTESET` is a NAMED docs
phase and not a numbered forward step, the same shape as `P-GUARD` and
`P-GRADECARD` below; no P-number was issued and `ROADMAP.md` was not touched.

**WHAT THIS DOES NOT DO — each half stated because the obvious next move is the
wrong one.** `tools/build_paste_set.py` IS NOT TOUCHED and its `SET_FILES` list is
unchanged, so a handover to a reader who does not have the repository is still one
`--write` away. NO SNAPSHOT DIRECTORY IS DELETED. `--check` is neither repaired nor
removed: it is STOOD DOWN, because its question is only meaningful while something
consumes the snapshot, and with no consumer it reddens after any documentation
commit for a remedy that serves nobody. It is available on demand and is no longer
part of any phase's `Prove:` block — this phase deliberately did not run it, in
either mode. The scope defect already queued against it at
`OPEN_ITEMS.md § Code debt found and left in place` is neither closed nor
re-argued here; retiring the duty lowers what that defect costs and does not make
it false.

**OBSERVED — the citation checker, before and after, over SEVEN sources.**
`tools/verify_citations.ps1`, run with the call operator and an explicit array,
bare, one source-set per invocation, the status read in the same invocation.
`SOURCES=` was read first every time and equalled the number passed. Counts are
`CITATIONS / BROKEN`, taken on the WORKING TREE on 2026-08-18, and they carry NO
sha deliberately: the work they describe was uncommitted when they were written,
so the only sha available is the one that does not contain it.
**ANCHORED 2026-08-18 to `e6249f6` — this is the half of the pin-a-claim
convention that usually gets skipped.** The work those figures describe was
committed as `e6249f6`, and nothing moved between the final measurement and the
commit, so that is the sha they were always about. **It is not an inference.**
P-OUTBOXREVIEW re-ran the same checker over the same seven sources at `e6249f6`,
on a tree `git status --porcelain` reported as carrying no modified tracked path,
BEFORE it edited anything — and reproduced the AFTER column exactly: 39/0, 24/0,
46/2, 21/0, 68/0, 83/4, 102/0, total 383/6.

| source | before | after |
|---|---|---|
| `START_HERE.md` | 38 / 0 | 39 / 0 |
| `ADVISOR.md` | 24 / 0 | 24 / 0 |
| `PROJECT_STATUS.md` | 42 / 2 | 46 / 2 |
| `CLAUDE.md` | 21 / 0 | 21 / 0 |
| `ARCHITECTURE.md` | 68 / 0 | 68 / 0 |
| `OPEN_ITEMS.md` | 83 / 4 | 83 / 4 |
| `ROADMAP.md` | 102 / 0 | 102 / 0 |
| **total** | **378 / 6** | **383 / 6** |

**The last four are in the table because they CITE INTO the three edited files,
and an inbound citation breaks in the file nobody edited.** This phase only ADDS
text, so the one way it could have broken such a citation is by repeating a
handle until it resolved TWICE; none did, and the four inbound totals are
byte-for-byte the numbers they were before. The five new citations this phase
writes all resolve at one hit each. **The `PROJECT_STATUS.md` after-figure
counts the citations THIS BLOCK writes** — the instrument is inside the thing
it measures here, so the row was re-taken after the block was in place and not
before, and the first value written into it (45) was already wrong when it was
typed.

**BROKEN DID NOT MOVE, AND ALL SIX PRE-DATE THIS PHASE.** Decomposed into the
three conditions the checker can print: all six are *resolves to nothing*
(`hits=0`); NONE is *resolves to two things*; and NO source yielded zero
citations — both controls, sections and non-empty, printed OK on all seven
sources in both passes, which is what makes these totals a reading rather than
an instrument that never looked. `OPEN_ITEMS.md` already records all six and the
wrapped-handle cause behind three of them. This phase repaired none of them and
is owed nothing by them.

**`tools/verify_shared_checks.py` exits 0** — `IDENTICAL: 4 items, 586 chars
between markers`. Neither copy of the shared four was touched; it is run because
a phase boundary runs it, not because this phase had a reason to move it.

**`build_paste_set.py` WAS NOT RUN, in either mode, and its absence is this
phase's own observable.** Running it here would be the ceremony the phase exists
to end, and a red from it would have meant nothing.

**IS A LESSON OWED? ASKED, AND ANSWERED: NO.** Nothing here was a mistake and
nothing was relearned — a delivery mode ended, and the two documents describing
it were superseded in place rather than rewritten, which is where a later reader
meets the reasoning anyway. Against `CLAUDE.md § Workflow` "Two homes, one test"
it is neither home: it is not something this project would otherwise RELEARN, and
it is not a property of this box.

**P1.12 — THE SHARED PACKAGE. Two commits, 2026-08-18.** `shopTime.ts` now
lives outside `mobile/` and is imported rather than copied, which is what
unblocks the desktop slip.

**The design decision, and it contradicted the brief's premise.** The brief
assumed a hoisted install and asked for "whatever `nodeModulesPaths` a hoisted
install requires". MEASURED: none is required, and supplying them would have
been the trap. `@expo/metro-config`'s `getWatchFolders` and `getModulesPaths`
both branch on `getMetroServerRoot(projectRoot) !== projectRoot`, and
`resolve-workspace-root` reports a root ONLY when the project itself is a
member. The repo root therefore declares `workspaces: ["packages/*"]` and
deliberately omits `mobile`, so `getDefaultConfig` leaves `watchFolders` and
`nodeModulesPaths` at `[]` — measured byte-identical before and after the root
`package.json` existed. Membership would have switched on the exact pair the R4
row of `lessons/README.md § Lessons` "metro-file-map-nesting.md" records as
breaking every nested dependency, and that nesting is live here
(`mobile/node_modules/expo/node_modules/expo-asset`). ONE knob moved:
`watchFolders`, which is about the FILE MAP and not about resolution.

**OBSERVED, both commits.** Both typecheck programs exit 0 run bare. The
`prove:*` set re-derived at run time: 28 declared, 4 excluded as requiring a
live API, 24 run, twice each with no reseed between, `PASS1_RED=0
PASS2_RED=0` on both commits. Controls fired and were predicted in advance: a
broken specifier reddens BOTH typecheck programs (TS2307 at the named line),
reddens `expo export` (exit 1, the resolver naming the directories it searched
— `node_modules` and `..
ode_modules`, which is Metro confirming its own
hierarchical walk reaches the repo root), and reddens node with
`ERR_MODULE_NOT_FOUND`; each cleared byte-exact on restore. Exactly ONE
executable client-side `+543` remains, at
`packages/shop-time/src/shopTime.ts:70`.

**NOT OBSERVED, and this is the part to read.** FOUR `prove:*` scripts require a
live API and were not run: `prove:login` (`:8211`), `prove:loginscreen`
(`:8231`), `prove:forbidden` (`:8000`), `prove:sellercreate` (two env vars, no
defaults, and its BARE form returns 2 by design because it creates sellers
through the real path that hard rule 5 cannot remove). Nothing was listening on
those ports; the same `netstat` saw 38 listening sockets, so that is a
measurement and not a blind instrument. They measure API BEHAVIOUR, which a
workspace change cannot reach.

**THE HANDSET, AND WHAT EACH READING COVERS.** Commit 1: the app opened on the
handset against a Metro started with `-c` and reached a screen. **A
Buddhist-era date was NOT separately confirmed at that commit** — the reading
taken was the launch. That answers commit 1's primary risk on its own, because
Metro builds its graph statically: `App.tsx:93` imports `./src/reports/dailyView`
and `dailyView.ts:103` re-exported from the package, so an unresolvable
specifier would have stopped the bundle and the app would not have reached a
screen at all. It does NOT establish that nothing else broke; that half rests on
the 24 proofs and both typecheck programs.

**Commit 2: `18/08/2569 15:44` rendered on the handset**, against Metro PID 43032
started with `-c` and reporting its cache empty, on the tree at `2eaa75e` plus the
commit-2 changes. It establishes TWO things. Metro resolved the package — the
module edge runs through the moved file, so a failure to resolve would have
stopped the bundle rather than degrading the screen. And the moved code COMPUTES
and RENDERS: 2026 + 543 = 2569, day-first, four-digit BE year, not ISO-shaped,
which is the form `lessons/README.md § Lessons`
"be-year-comes-after-the-timezone.md" requires and the form a printed slip has to
carry.

**AND IT DOES NOT ESTABLISH THE ORDERING — read this before citing the reading
above, because it looks stronger than it is.** A reading taken at 15:44 Bangkok
CANNOT tell the right order from the wrong one. Convert-to-shop-time-then-+543
and +543-then-convert produce the SAME DIGITS for most of the day; they diverge
only across Bangkok midnight, which is the entire subject of that lesson and the
reason the module carries a branded type instead of a comment. A device reading
taken at any ordinary hour is therefore evidence that the code MOVED and RUNS,
and evidence of nothing whatever about the order. **THE ORDER IS PROVEN BY
`proveTime.ts` T8**, which ran green inside the 24 — offline, on the boundary,
with the wrong order's output printed beside the right one. Do not let "a
Buddhist-era date rendered on a device" stand in for that cell.

**`npx expo export` IS NOT THE HANDSET.** It exercised Metro's file map from an
empty cache and its control fired, so it is real evidence — about the file map,
and about nothing further. SERVE and EXPORT are different code paths in Metro,
and P1.12's DONE WHEN names serving.

**A DOCUMENTATION RESTRUCTURE CLOSED 2026-08-16, at `1d58899` and
`5ac22c3`.** Not a P-step: no code path changed, and the P1.7 record
below stays the current CODE phase exactly as written. What the two
commits hold, each figure from that pass's own measurements:

- `CLAUDE.md` went 780 to 620 lines with every removed line accounted
  for (13 blank, 189 moved whole, 6 kept re-wrapped, 21 split at a word
  boundary, 0 dropped — a classifier with a planted-line control): the
  dated incidents, refutation history and measurement provenance moved
  verbatim to `EVIDENCE.md` (new, 345 lines), every rule kept, each cut
  site pointing at the section backing it. The first four sections are
  byte-identical to `742ff65` except two approved insertions: the
  P-number supersession and a role router that routes by the ask.
- `ADVISOR.md` (new) is the advising role's first in-repo home — role
  bounds, the two unprompted duties, the brief-header conventions
  recorded for the first time, and the pre-send checklist. It is in the
  paste set (`SET_FILES` 9 to 10).
- The checklist landed MEASURED, not pasted, and the measurement found
  real drift: the two roles had run different rule-sets for the
  project's whole life, overlapping in four concepts. The shared four
  now live inline in BOTH `CLAUDE.md` and `ADVISOR.md`, held identical
  by `tools/verify_shared_checks.py` (seen red on a planted
  one-character divergence and green on restore, both in the record);
  the finding is written at
  `lessons/README.md § Lessons` "a-rule-outside-the-repo-cannot-be-seen-to-drift.md".
- `ROADMAP.md`'s corrections-owed entry for the CRLF figures was
  cleared with a dated note — the correction predated the work, and the
  git objects were re-measured to confirm it (CR=0 in all 50 blobs).
- Citation checker at `5ac22c3`: eight sources, 307 citations,
  BROKEN=6, all six pre-existing before the restructure began.

**THAT RESTRUCTURE RAN TO FOUR COMMITS, NOT TWO — recorded 2026-08-17.**
The block above names `1d58899` and `5ac22c3`. Two more landed the SAME
day, 2026-08-16, and appeared in no phase record until this line; found
by `git log --stat 5ac22c3..HEAD` in this pass, not from a document:

- `78d3c02` — four sentences the restructure had made false, each
  SUPERSEDED with its date rather than rewritten. `CLAUDE.md` +16,
  `OPEN_ITEMS.md` +20, `PROJECT_STATUS.md` +31, `START_HERE.md` +5:
  72 insertions, no deletions.
- `e6a25dd` — shape A, the boundary rule and the read-list at the top of
  `ADVISOR.md`. 122 insertions, that file alone.

**THE REPORT-LANGUAGE RULE — 2026-08-17. Docs only: no code path
changed, and the P1.7 record below stays the current CODE phase exactly
as written.** A CLI coding session had returned a survey written in Thai.
The tree's only language rule named commit messages, code comments and UI
text; a report to the owner is none of the three, so the rule was ABSENT
rather than ambiguous, and was written for the first time.

- `CLAUDE.md § Conventions` gained a bullet beside the existing one,
  which was not rewritten: a coding session reports in English, QUOTED
  material exempt and reproduced verbatim in Thai, and the advising
  session named as the only exempt role — by pointer, not by copy.
- `ADVISOR.md § 1. Role bounds` gained the advisor's half: it replies to
  the owner in Thai and writes in English everything it dispatches,
  reproduced VERBATIM rather than re-drafted when the owner asks to see a
  brief again. The two are deliberately NOT mirrored: they are different
  rules for different roles, so no checker could ever hold them.
- Measured either side of the edit, both sides in the same pass: the
  citation checker over FIVE sources (a narrower list than the eight
  above, so the totals are not comparable with that line) read 226 then
  229 citations, BROKEN=0 both times; `tools/verify_shared_checks.py`
  exit 0, the mirrored four undisturbed.
- The lesson it produced was written in the NEXT phase, 2026-08-17, as an
  amendment rather than a new file:
  `lessons/README.md § Lessons` "PUT THE SCOPE IN THE LINE THAT LOADS".

**WHAT THAT PHASE DID NOT ESTABLISH, stated because nothing else will.**
The text is in the file. No session's BEHAVIOUR was observed to change,
and applied is not verified. The deferred observable belongs to whoever
runs the next fresh coding session: ask it what language instructions it
holds and see whether it names `CLAUDE.md`. Until then the rule is
WRITTEN, NOT WORKING. It is also prose and not a mechanism — nothing can
grep a reply, and the only mechanism in play is the `REPORTS IN:` field
at the head of a dispatched brief, which travels with the work.

**P-GUARD — 2026-08-17, TWO COMMITS. Docs and one ignore file: no code
path changed, and the P1.7 record below stays the current CODE phase
exactly as written.** The two halves are unrelated in subject and were
run as one phase because their file sets are disjoint.

**Commit 1 — the staging hole.** A third-party skill install (25
directories under `.claude/skills/`, plus `.agents/` and
`skills-lock.json`) sat untracked and UNIGNORED while
`.claude/settings.local.json` pre-approves `Bash(git add *)`, so one
sweeping stage would have committed somebody else's tree with no
permission prompt in the way. `git status --porcelain
--untracked-files=all` counted **152 untracked files** before the
pattern and **3** after — the three being `ARGUS_MOBILE_READ.md`,
`COMMIT_MSG.txt` and `UNCOMMITTED_DOCS.diff`, left alone deliberately as
another session's working files.

- The pattern makes IGNORE the default under `.claude/skills/` and names
  the nine authored directories back in, so the next install is excluded
  without anybody remembering. Negation lines matching
  `^!\.claude/skills/[^/]+/$`: **9**, against **9** directories from
  `git ls-files .claude/skills | cut -d/ -f3 | sort -u`.
- MEASURED in a throwaway repository outside the tree, 14 probes over
  three patterns, every verdict from `git check-ignore -q --no-index`:
  today's pattern **MISMATCHES=5** and `git add -A` staged **8**
  third-party paths; the directory form `.claude/skills/` (no star)
  **MISMATCHES=4**, all nine negations inert; the candidate **0 and 0**.
  The evidence is the PAIR — the case-A staging number is the control
  that makes the candidate's zero mean anything.
- In the real tree, reads only: the tracked set is unchanged
  (`git ls-files` equals `git ls-tree -r HEAD` for that path, 14 paths,
  0 differences); 25 must-keep paths kept and 12 must-ignore paths
  ignored, including the neighbours in the same block — every file under
  `.claude/agents/`, `hooks/*.py` against `hooks/*.log`, and
  `settings.json` against `settings.local.json`.
- **Two mechanisms appended to
  `lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md"
  in ONE amendment**, because both came out of one `Prove:` document on
  one day under one review and neither was found by running anything.
  `git check-ignore` consults the INDEX by default, so a TRACKED path
  reports "not ignored" whatever the patterns say — measured on git
  2.50.1.windows.1, `-q` exits 1 where `-q --no-index` exits 0 under a
  deliberately broken pattern, and all nine authored directories are
  tracked. And a set check that passes on EXCESS: an empty-intersection
  test catches a file in BOTH commits and is blind to a file in NEITHER,
  so the phase check is now EQUALITY. A third instance arrived inside
  the probe itself — the second instrument first printed
  `STAGED=1 THIRD_PARTY_STAGED=0` because the fixture had already
  committed every authored file and the stage decided nothing.

**Commit 2 — the six decisions of 2026-08-17, and two findings.** S14 to
S19 were minted after re-deriving S13 as the highest in use
(`git grep -ohE "\bS([1-9]|[12][0-9]|30)\b" -- '*.md'` returned S1-S13
only). Each answers one of the six review findings, which are CLOSED IN
PLACE with dated closures rather than rewritten: the device outbox
becomes one mechanism carrying several kinds of work and **P1.8b's cut is
REVERSED**, its seven-item survey standing unchanged as the spec;
photographs live BESIDE the database; the eight per-tenant values are
stored by kind with no JSON bag; schema changes are pulled by the feature
that needs them; the mobile client learns the owner role in the same
change that adds it, with the fail-open deliberately kept and re-argued;
and P2.4 and P2.5 stay open until a real shop trades, recorded at both
steps.

Two findings recorded, neither repaired: the print gate and the
photograph disagree about when a slip may be printed, with the negative
search's own words named; and a raw count inside an acceptance criterion
rots, which `ROADMAP.md`'s P1.12 already demonstrates at two sites
against 28 `prove:*` scripts.

**THE SECOND FINDING DEMONSTRATED ITSELF INSIDE THIS PHASE.** The brief
ordering it recorded `git grep -n "fourteen" -- '*.md'` as **seven**
sites; re-derived after commit 1 it is **nine** — the two extra being the
word "fourteenth" in the lesson commit 1 amended and in its generated
copy. The count moved by the phase's own first commit, in the day it took
to write the entry about counts moving.

**WHAT THIS PHASE DID NOT ESTABLISH.** Commit 1 does not prevent a
sweeping stage; it removes what such a stage would have swept, and
`git add -A` remains pre-approved. **No mechanism enforces any of the six
decisions** — a decision recorded is not a decision implemented, no
P-number was minted for the outbox generalisation, and no code exists on
either side of either finding. The citation checker over its eight
sources read `SOURCES=8 CITATIONS=346 BROKEN=7` before commit 1; all
seven pre-date this phase, proven by the handle
"prove_reconcile.py back to green" returning 0 hits against
`git show HEAD:ROADMAP.md`.

**THE FIRST BILL EVER TO TRAVEL DEVICE → SERVER — 2026-08-17.** It is
recorded here because it is in no tracked file at all: the row is in the
DEV database and the observation existed only in a conversation. This is
the event every hard rule was written for, and it is the first time
seven of the eight were exercised end to end by a real person on a real
handset rather than by a proof.

- Shop code **`53R42Z7S`**, issued to Shop A
  (`11111111-1111-1111-1111-111111111111`) by `provision_shop.py`
  against the DEV database `recycle`.
- Bill **`dd25043b-0538-43c7-97f8-7da6912d3751`**, doc_no
  **`B-2569-381`**, counter **380 → 381**.
- **`created_by` is the STAFF account, not an admin** — the person who
  took the goods is the person the row names.
- `device_created_at` **2026-08-17 03:34:59.092+00**,
  `server_received_at` **03:36:07.809+00**: **68.7 seconds apart,
  because airplane mode was on while the bill was weighed.** That gap is
  the observation, not a defect — it is hard rule 7 and hard rule 8
  visible in two columns.
- Money and weight columns **NUMERIC(14,2) / NUMERIC(14,3)**; `amount`
  **150.00**, recomputed IN POSTGRES and agreeing.

**SEVEN OF THE EIGHT HARD RULES EXERCISED END TO END FOR THE FIRST
TIME — 1, 2, 3, 4, 6, 7 and 8. RULE 5 WAS NOT**, because nothing was
voided; the void path's device evidence is still the one from 2c-9 and
this run adds nothing to it.

**THE LIMITS TRAVEL WITH IT, and they are what stops this being read as
more than it is:**

- `tare_weight` was **0.000**, so the tare path is stored-correct and
  **UNEXERCISED** — a bill with a real tare has still never crossed the
  wire from a device.
- `unit_price` **equalled** `list_price`, so **no override path was
  tested**. Hard rule 6 keeps both columns precisely so they can
  differ, and they did not.
- The artefact was **this project's own Android DEBUG build**, on **one
  handset**, over a **LAN address**. Nothing here is about a release
  build, a second device, or a route off this network.
- **The queued-state screen was observed by the OWNER, not by the
  session that read the row.** Two different observers, two different
  artefacts; the database row is this session's evidence and the screen
  is not.

**P1.8a — PHASES 1 AND 2 LANDED, 2026-08-17.** The step was split the
same day (`ROADMAP.md § P1.8 — Seller creation from the phone`): P1.8a
is ONLINE seller creation and closes P1.8's DONE WHEN as written, P1.8b
is OFFLINE and is a subsystem.

- **Phase 1, `2f88403` — the server route.** `POST /sellers` moves from
  `require_admin` to `get_principal`, and `code` becomes optional with
  the server assigning one by generate-then-retry.
  `prove_seller_create.py` exit 0 twice with no reseed, against
  `recycle_p18a_scratch`. **WHAT IT DID NOT ESTABLISH:** that any
  client could call the route — nothing under `mobile/` was touched or
  executed — that any operator could reach it, and the retry was never
  exercised by a real race.
- **Phase 2, `826e4ee` — the client wire.**
  `mobile/src/master/createSeller.ts` and its proof; the deliverable is
  an eight-member outcome union carrying no raw body, no `detail`, no
  `message` and no status number. `npm run prove:sellercreate` exit 0
  twice with no reseed, both typecheck programs green, run bare.
  **WHAT IT DID NOT ESTABLISH:** there is no screen, so no operator can
  reach it; nothing ran on a handset (every cell runs on `node:sqlite`,
  the phone uses `expo-sqlite`'s own connection); `forbidden` cannot
  fire today because the route is behind `get_principal`; `invalid` was
  never driven against a real 422, deliberately, because the honest way
  to reach it is to violate `id_number` and that refusal body is the
  one this route must not read; `ambiguous` is constructed and typed
  and has never been seen; and every call is sequential, so
  `code_assignment_failed` has never been produced by a real race.

**P1.8a IS COMPLETE — PHASES 3 AND 4, AND THE DONE WHEN IS MET AS WRITTEN.
2026-08-17.** Four commits and a device pass. The commits, each sha and
subject re-derived with `git log --no-walk` in this closing pass and not
copied from a brief:

| commit | subject |
|---|---|
| `2f88403` | feat(P1.8a): staff can create a seller, and the server assigns its code |
| `826e4ee` | feat(P1.8a): a client creates a seller, and the outcome comes back classified |
| `dc31353` | docs(lessons): an eleventh mechanism — the check went red, and red is not one state |
| `7b9a002` | feat(P1.8a): the yard adds a seller, and eight outcomes each say a different thing |

- **Phase 3, `7b9a002` — the screen.** `app/AddSellerSheet.tsx` draws, and
  `src/master/sellerCreateNotice.ts` decides: eight outcomes, eight
  sentences, the call site a REQUIRED argument so a second screen cannot
  inherit the yard's wording. The form has NO grade field, and that absence
  is the mechanism rather than an omission — a grade picker at the
  weighbridge is re-pricing the shop wearing a different label.
- **Phase 4, 2026-08-17 — THE DEVICE PASS. No commit; it observes.** Run on
  this project's own Android DEBUG build against a LAN address. **That is a
  TEST artefact and not a shipped one**, and every sentence below is bounded
  by it.

**WHAT THE HANDSET DID, read out of Postgres and never off a screen:**

- Seller **`S006`** / `somkid`, id `e06c6280-a4fa-4e74-abd2-4d64b588367a`,
  created FROM THE HANDSET by the **STAFF** account. Its code is
  **SERVER-ASSIGNED**: the code box was left blank, so the draft carried no
  `code` key at all and the server minted `S006` from the previous maximum
  `S005`. The owner filled only the required name — `phone`, `id_number`,
  `address` and `vehicle_no` are all NULL.
- Bill **`54b8b684-7119-436c-b3be-99d051e2a86d`**, doc_no **`B-2569-382`**,
  counter **381 → 382**.
- `created_by` is **`bef92d61-a02e-412b-abfd-0ed144f6c4ed`, the STAFF
  account — NOT `35d09981-f42a-4eae-8b29-6059dd224eeb`, the admin who set
  the grade.** Migration 0006 records the SUBMITTING session, and the retry
  carried the staff token, so the person who bought the load is on the row
  and the person who fixed the master data is not.
- `unit_price` **1.00** against `list_price` **43.00**. **THE FIRST BILL IN
  THIS PROJECT WHERE THE TWO COLUMNS DIFFER**, and therefore the first row on
  which that audit trail has ever carried information. The operator typed a
  price while the seller had no grade and so no tier to default from; the
  server stamped `list_price` from `product_prices` at posting time, by which
  point a grade existed. `amount` 20.00 = `net_weight` 20.000 × `unit_price`,
  recomputed IN POSTGRES rather than by importing the application's helper.
- `device_created_at` `07:53:23+00` against `server_received_at`
  `08:14:38+00` — **21m15s apart, and THAT GAP IS THE PARKING**, not a defect
  and not a clock problem. Hard rule 7 kept both, so the purchase still says
  it happened when the truck was on the scale.
- Grade **C** set by an admin over HTTP, `PATCH /sellers/{id}`, because there
  is no screen for it on any surface. **IT IS A TEST VALUE AND NOT A POLICY** —
  whether a shop uses grades at all, let alone what a walk-in gets, is a
  per-tenant question with no home in the schema.

**THE PARKED CARD WAS VERIFIED CHARACTER-IDENTICAL AGAINST
`mobile/src/sync/parkedReason.ts`, and this is the first time.** Badge, the
cause sentence, the reassurance and the staff void note all matched their
source literals exactly, and the card's `17/08/2569 14:53` agrees with
`device_created_at` — a value the screen and the row could not have taken from
each other. **The 2c-6 defect this renderer exists for is CONFIRMED ABSENT on a
device, by a person**: no `ผิดพลาด`, no status number, no JSON, no seller uuid,
and no `รหัส:` line, the last because the code was recognised.

**WHAT IT DOES NOT ESTABLISH, and this half is not optional:**

- **2 of the 8 create-outcomes have been reached on a device** — `created`,
  and `forbidden` **only against a STALE SERVER** running code that predated
  the gate change (`CLAUDE.md § Boot check` "WHICH CODE THE SERVER IS RUNNING").
  `forbidden` is UNREACHABLE on this route today. **Not one of the eight has
  had its wording quoted back verbatim by the person who saw it.**
- **The card promises the system sends by itself once the office fixes the
  data. THAT WAS NOT OBSERVED.** The retry was pressed on instruction, so what
  is known is that it sends WHEN PRESSED. A wait is a promise about the future
  exactly as much as a button is.
- **The unpark rendering was never quoted.** The row proves the bill landed;
  what the operator saw on the card as it changed is unobserved.
- **Every walk-in here needed an office action with NO SCREEN behind it,
  performed over HTTP by a developer. THAT IS A TEST, NOT A WORKFLOW.**

**THE MODAL-HOST DEVICE PASS — 2026-08-17. No commit; it observes.** The change
observed is `1204081`, *fix(mobile): one Modal host, because a refused
presentation is recorded as a success*, authored 2026-08-17 16:56:08 +0700 — sha,
subject and date re-derived with `git log -1` in this pass and not copied from a
brief. **That commit's own record states it establishes THAT THE BUTTON WORKS
nowhere and carries no behavioural evidence of any kind. This block is that
evidence, and it is the whole of it.**

**WHAT WAS OBSERVED, on the owner's handset, REPORTED BY THE OWNER rather than
measured by this session.** The same two-observer split the first-bill block above
records, and it binds harder here: a presentation defect leaves no database row
and no log line, so there is no artefact to read the report against.

- **The add-seller control opens the form ON THE FIRST PRESS.** Before `1204081`
  it did nothing until the picker was dismissed with `ปิด`, at which point the form
  appeared — the exact symptom that commit exists for. **This is the observation
  that could not have been made anywhere else:** the defect is native
  presentation behaviour, every proof cell runs under node, and no headless run
  can see it (`lessons/README.md § Lessons` "a-platform-can-refuse-an-effect-and-record-it-as-done.md").
- **Closing a sheet returns to the PREVIOUS sheet, not to the root.** Closing the
  add-seller form comes back to the picker, where the search box is. That is what
  `mobile/src/ui/sheetStack.ts` encodes as a STACK rather than as a single slot,
  and it had never been seen on a device.
- **Both previously-untested transitions present correctly** — picker to the
  seller-change dialog, and the add-seller form to that same dialog. Both are the
  one `ask_seller_change` transition, whose `from` is
  `["seller_picker", "add_seller"]`, and `1204081` classifies both as SAME-COMMIT
  SWAPS that were LATENT: nobody had ever hit either, and the second sits on the
  path a walk-in takes. **A latent defect now exercised is worth more here than
  the reported one**, because nothing was going to reach it by use.
- **Three of the sheets that were already working open and render unchanged.**
  **WHICH three is not recorded, and it is not rounded up.** Of the seven kinds
  declared in `mobile/src/ui/sheetStack.ts` — `sign_out`, `seller_picker`,
  `add_seller`, `confirm_seller_change`, `confirm_save`, `daily`, `bills` — two
  are accounted for above and `confirm_save` is named below as unobserved, which
  leaves FOUR candidates for the three: `sign_out`, `seller_picker`, `daily`,
  `bills`. **One of the four is certain by MECHANISM rather than by report:**
  `open_add_seller`'s `from` is `["seller_picker"]`, so the picker must have been
  open for the first observation above to exist at all. The other two are unnamed
  and stay unnamed.

**WHAT WAS NOT OBSERVED. Three things, and none of them is rounded up.**

- **The save-confirmation dialog.** `confirm_save` was never opened. It is the one
  sheet whose guard `1204081` newly moved TO the state layer — before that commit
  the picker-plus-confirm pair was prevented only by `app/CartScreen.tsx`
  disabling the save button, and `setConfirmOpen(true)` had no guard of its own —
  so the sheet with the newest reason to be checked is the one nobody looked at.
- **The void-reason field clearing on close.** Side effect 3 of `1204081`:
  `BillsPanel` now clears `voidingId` and `reason` when it closes, which the owner
  decided. **A STAFF SESSION CANNOT REACH IT AT ALL**, and the chain is three
  files deep: `mobile/app/BillsPanel.tsx:365` offers the void control only when
  `canRequestVoid(b, role)` holds, `mobile/src/sync/parkedReason.ts:640` requires
  `mayVoid(role)`, and `mobile/src/session/deviceRole.ts:173` is
  `role !== "staff"`. So this gap does not close by pressing harder on the same
  handset — it needs an ADMIN session on a device. **Which account was signed in
  for this pass is not recorded here:** the mechanism is what is stated, not an
  inference about the pass from the shape of the gap.
- **Whether anything LOOKS different.** `1204081` predicted two visual side
  effects — sheet-to-sheet switches no longer animate, and all sheets now present
  transparent where four were opaque, argued visually identical because each
  already paints its own background. **NEITHER WAS CONFIRMED NOR DENIED.** A
  prediction that nothing changed is not an observation that nothing changed.

**WHAT THIS PASS DOES NOT ESTABLISH.**

- **The artefact.** This project's own Android DEBUG build, one handset, over a
  LAN address — a TEST artefact, the same bound every device pass in this file
  carries. Nothing here is about a release build, a second device, or iOS, which
  has never run this code at all.
- **The structure is measured; the structure is not behaviour.** Seven components
  each rendered their own `Modal` and now one file does: `git grep -l '<Modal'` at
  `56b5008` returns seven paths under `mobile/app/` (`AddSellerSheet`,
  `BillsPanel`, `ConfirmSaveDialog`, `ConfirmSellerChangeDialog`, `DailyScreen`,
  `SellerPicker`, `SignOutSheet`), and the working tree at HEAD `1204081` —
  measured clean for `mobile/` in this pass — returns exactly one,
  `mobile/app/SheetHost.tsx`. Counted from git and from the tree, not from the
  commit message that also states it.
- **Nothing was read out of Postgres, and nothing needed to be.** No bill was
  posted and no row is claimed by this pass. This file's usual discipline — read
  the row, never the screen — has no row to offer here, and that is a property of
  the defect rather than a shortcut taken.
- **The hypothesis `1204081` kept as a hypothesis is still one.** Why pressing
  `ปิด` revealed the sheet is unexplained, and the falsifiable prediction that
  commit names — an inner sheet under a TRANSPARENT outer one would never appear
  at all, not even after the outer one closes — was not run. Nothing about the fix
  depends on the answer.
- **`proveSheets` S9 still catches a second `Modal` and still nothing runs it
  automatically.** There is no CI in this repository and no hook that runs a
  proof. A compile error cannot be skipped; that scan can.

**A SHOP-WIDE DEFAULT GRADE IS BUILT, PROVEN, AND UNREACHABLE — `9ad225e`,
2026-08-18.** Recorded as one entry because the two halves are one fact: the
capability is real and no operator can get at it.

- **WHAT WAS OBSERVED, and it is stronger evidence than most entries here
  carry.** `9ad225e` was measured over real HTTP against a server confirmed to be
  running that code — `GET /shop` answered **401 rather than 404** before any
  token existed, which is a request through the changed path and not an inference
  from a clean tree (`CLAUDE.md § Boot check` "WHICH CODE THE SERVER IS RUNNING").
  Five cells, each with a sibling coming out the other way: an ungraded seller
  with no shop default → **424 `seller_grade_unset`**; the same bill with the
  default set to `B` → **201, doc_no B-2569-384**; the default cleared back to
  NULL → **the 424 returns, same code**, which is the cell saying this is a
  fallback and not a deleted check; staff `PATCH /shop` → **403**; staff
  `GET /shop` → **200**. The stored price was read **out of Postgres and not out
  of the response**: list_price 15.00 against tier B 15.00 and tier A 15.50, with
  seller S005's own grade still NULL — the tiers differ, which is what lets that
  cell discriminate. And `ck_tenants_default_grade` was SEEN TO REFUSE: `'Z'`
  raised the named constraint and rolled back, with the surviving value still
  `'B'` rather than nulled.
- **AND NO OPERATOR ON ANY SURFACE CAN SET IT.** `PATCH /shop` is admin-only and
  reachable by `curl` and by nothing else. `desktop/` holds one 0-byte file and
  its scaffold step has not run; the phone has no admin surface and S10 defers new
  screens; and `provision_shop.py` does not set the column either — its tenant
  INSERT names `(id, name)` and the string "grade" does not occur in that file —
  so every shop starts at NULL and stays there. **A capability with no path to it
  is indistinguishable from an unbuilt one from outside**, which is an argument
  `ROADMAP.md § landed 2026-08-07, and it is NOT a step in this file` "A capability with no path to it is indistinguishable from an"
  already makes about a different endpoint. `ROADMAP.md § P1.16` took the
  shop-settings surface as scope on this date; nothing is scheduled.
- **THE DEVICE WORDING CAUGHT UP — `3e35558`, 2026-08-18, and it is a text change
  and nothing more.** The parked card said only "have the office set this
  seller's grade" for a refusal that has had two remedies since `9ad225e`. It was
  never FALSE — the card is drawn only after the server has refused — but it named
  the remedy repeated for every walk-in and never the one that fixes the shop
  once. It now names both and asserts neither, because the device cannot know
  which the shop lacks and nothing in the client reads `GET /shop`. Proven
  NEGATIVELY over the card's concatenation in draw order and over the status strip
  (a second surface, drawn through `parkedSummary` with no badge): the new
  assertion was run against the UNCHANGED string first and reddened **exactly the
  three cells named in advance, with no fourth cell moving**, then went green. All
  five proofs that reach that renderer — located by grep and confirmed by a second
  independent search — exit 0 twice in a row with no reseed, and both TypeScript
  programs exit 0.
- **WHAT THIS DOES NOT ESTABLISH: there has been no device pass, on either
  half.** Nothing on a handset has read `GET /shop`, and the new wording has been
  seen by no screen — it is proven headlessly and by nothing else. `9ad225e`'s own
  record says the same of its half.
- **TWO REAL BILLS WERE LEFT IN THE DEV DATABASE BY THIS PHASE.** `prove:forbidden`
  F6 drives the real API and creates a bill per run through the real path, so the
  two runs the twice-in-a-row rule requires produced **B-2569-395** and
  **B-2569-396**; both were voided by the proof's own admin cell, and hard rule 5
  forbids removing either. This is the class already queued at
  `OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "A shared proof teardown",
  whose argument is not restated here.
- **A FINDING, RECORDED AND NOT FIXED.** The server's code `seller_grade_unset` is
  named after ONE of the two causes it can now stand for, so wording derived from
  the code alone can no longer derive the full remedy. That is the "(code, call
  site)" amendment in
  `lessons/README.md § Lessons` "AMENDED AGAIN (P-GRADECARD, 2026-08-18)"
  arriving at a new site. Renaming it is a client contract and `MASTER_DATA_CODES`
  is a closed union that would move with it, so it is a decision and not a
  tidy-up.

**P1.7 IS COMPLETE. ALL SEVEN STEPS. 2026-08-11, `959f22d`.** This block
SUPERSEDES every P1.7 entry below as the current phase; each is left exactly as
written and was true when written.

**THE STACK IS NOW SIX DEEP, AND IT IS DEEPER THAN WHEN THE ROTATION WAS
QUEUED.** Five blocks sit under this heading — this one, steps 5-and-the-draft,
step 4, step 3, account provisioning — and `## Previous phase` beneath them. The
rotation was owed at three and is owed at six; nothing here is merged or moved,
because deciding what stops being current is a separate judgement and taking it
inside a phase record would settle it silently.

**THE PHASE IS FOURTEEN COMMITS**, from `git rev-list --count a471dc2^..959f22d`
in this pass — a figure worth stating as measured, because the reply that
preceded this block said sixteen and was wrong. Eleven carry code, three are
docs-only (`6b74b89`, `1b94a0c`, `171f6d3`).

| sha | what it landed |
|---|---|
| `a471dc2` | ownership columns, the identity STORE, a migration that cannot stop half-done |
| `6b74b89` | docs — the ownership schema recorded |
| `1f37888` | the login returns `user_id`; the device RECORDS who signed in |
| `0ac09ef` | the owner stamped onto draft and bill rows at creation |
| `a57a648` | the SEND queue filter |
| `869977a` | a permanently rejected void stops being re-sent |
| `cfb6633` | the VOID queue filter |
| `1b94a0c` | docs — step 4, and four ways a green meant nothing |
| `8ec784e` | the master-data cache bound to a TENANT; a mismatch reads ABSENT |
| `fde2b0c` | the draft loader hands back only the current person's cart |
| `171f6d3` | docs — the first phase-close, and a fifth green-cell mechanism |
| `acea1ac` | the login path: a refusal is not an outage, a 200 is not a session |
| `4bde6e1` | the login SCREEN, the shop code, and the end of the hardcoded account |
| `959f22d` | the status strip: three numbers that mean what they say |

**THE SEVEN STEPS AGAINST THE COMMITS THAT CLOSED THEM**, read from
`ROADMAP.md § P1.7` "THE ORDER, AND WHY" and from the commit subjects and
contents in this pass:

| step | closed by |
|---|---|
| (1) confirm three reported items from disk | the pass that produced `a471dc2`; recorded in `6b74b89` |
| (2) correct the void-class outstanding record | `869977a` and `cfb6633`, both of which touched `OPEN_ITEMS.md` |
| (3) schema and migration, kill-mid-migration proof | `a471dc2` (`prove:migration`) |
| (4) owner filter, send AND void, separate evidence each | `a57a648` (`prove:sendowner`) and `cfb6633` (`prove:voidowner`) |
| (5) the cache bound to tenant | `8ec784e` (`prove:cachetenant`) |
| (6) the login screen and the stored identity | the store at `a471dc2`, the recording at `1f37888`, the screen at `4bde6e1` (`prove:loginscreen`) |
| (7) the status strip | `959f22d` (`prove:statuscounts`) |

**TWO COMMITS ARE NOT ANY OF THE SEVEN, and both came out of measuring rather
than from the plan.** `fde2b0c`, the draft loader — the plan never listed it,
and a survey found the loader returned the newest cart to whoever asked.
`acea1ac`, the login path — repaired BEFORE the screen was built so that when
the screen was tested neither defect could be a suspect.

### What an operator can now do that they could not before

They can sign in as themselves. Before this phase every device was the same
person in the same shop, because `app/config.ts` held one tenant, one username
and one password, and every ownership mechanism in the system was driven only by
identities a proof had invented. A handset is now set up ONCE with the shop's
eight-character code, which the SERVER resolves — never typed as an identifier,
never guessed — and from then on the screen asks for a username and a password.
The person who weighs a load owns the bill; the next person to pick the handset
up gets their own queue, their own draft, the same shop's prices, and a number on
the strip that counts their own work. A wrong password says so instead of
claiming the yard is offline.

### Refused, withheld, waiting — three different things, not degrees of one

**REFUSED** is the cache. A tenant mismatch reads as ABSENT rather than stale and
`mayStartBill` stops weighing, because the numbers on the screen would be another
shop's prices and the cash is paid against them. Nothing else in the phase stops
the yard working.

**WITHHELD** is the draft. A cart belonging to somebody else is not handed over,
and it is kept, not adopted and not destroyed — but nothing is blocked, because a
draft says nothing about prices and `ROADMAP.md § P1.7` already rejected controls
the person at the scale can route around: blocked from weighing they use paper or
reinstall, and both lose more.

**WAITING** is the queue. Another account's bills are not selected, not deleted
and not touched; they sit until their owner signs in here. The difference from
the two above is what the operator is asked to do: stop, carry on, or nothing at
all.

### The three numbers, and one of them waits for nobody

`unsentBreakdown` splits every unsent bill in ONE statement, disjoint and
complete, so the parts reconcile with the device. **mine** waits on a CONNECTION
and falls on its own. **otherAccount** waits on a PERSON who exists — the owner
signing in on this handset. **unknownOwner** waits on NOBODY: both columns are
null, null matches no identity, and no sign-in anyone can perform releases it.
Those rows come from a handset upgraded across `a471dc2` and from a save in the
boot window before the identity store opened. The strip says so — that signing in
does not help — rather than telling the operator to wait for somebody who is
never coming. Disposal is undecided and is queued in
`OPEN_ITEMS.md § Code debt`. A fourth, **mineBlocked**, waits on the OFFICE and
already had its own line and its own retry.

### The device-driver limit and the device-pass fact — neither stands alone

**Every mechanism in this phase is proved on the driver the PROOFS run:
`node:sqlite`, against real files on disk. NONE of it is proved on the driver the
HANDSET runs**, which is `expo-sqlite`'s own connection
(`mobile/src/device/expoSqliteDriver.ts`) and cannot be exercised off-device at
all.

**AND NO DEVICE PASS WAS TAKEN FOR ANY OF THE FOURTEEN COMMITS.** Every
observation in this block is a headless proof, an HTTP request to a throwaway
server on this box, or a file read. Nothing has been seen on a handset — not the
login screen, not the setup screen, not the strip's new sentences, not a shift
change. `CLAUDE.md § Boot check` "WHICH BUNDLE THE HANDSET IS RUNNING" applies in
full to whoever takes the first one, and until then the screens are unobserved
rather than working.

**SUPERSEDED 2026-08-12 — A DEVICE PASS HAS SINCE BEEN TAKEN. The paragraph above
is left exactly as written and was true on 2026-08-11.** The correction sits here
because this is the sentence a reader meets first under this heading, and a file
that disagrees with itself is believed at whichever half is met first.

**THE ARTEFACT, AND IT IS A TEST ARTEFACT — every sentence below is bounded by
it.** This project's own Android DEBUG build, built at `9d2eb22`, applicationId
`dev.chutipon.recycle`, on ONE handset, a vivo 1938. Never Expo Go. Its API
address is a plain-HTTP LAN address baked in at build time (`mobile/app.json`
`extra.apiBaseUrl`), so it reaches a server only on this network and cannot be
given to a shop. **NO RELEASE BUILD EXISTS on either platform.**

**WHAT WAS OBSERVED.** The LOGIN SCREEN drawn: after a real sign-out and a cold
start, `LoginScreen` drew the username and password state and nobody was asked
for a shop code. A SESSION established and cleared: `SecureStore.xml` held
`key_v1-recycle.session.token` at count 1 while signed in and count 0 after the
sign-out, while `local_shop` and `local_identity` each still held their one row.
The MIGRATION interrupted: force-stopped twice inside a window widened to tens of
seconds by a 150,000-row pre-P1.7 seed, the complete old shape both times, with
controls both ways. Recorded in full further down
`PROJECT_STATUS.md § Current phase`, in the block superseding the device-driver
limit, and again in `PROJECT_STATUS.md § Known device gaps`; not restated here.
**A self-citation carries no quoted handle on purpose**, for the reason
`lessons/README.md § Lessons` "a citation whose TARGET is its own file"
already gives; re-measured here 2026-08-12 at `hits=2`.

**WHAT WAS NOT.** **Nobody signed in through that screen to reach the cart
screen, and nothing was weighed** — the product and seller lists were empty on
that tenant, so the screen had no goods to offer. The strip's new sentences and a
shift change were not staged. **iOS ran the secure store's clear in the
2026-08-06 pass and has never run the migration.** So this does not meet the
`ROADMAP.md § P1.7` DONE WHEN, which wants a person reaching the cart screen; and
a sentence saying a device pass happened, without these bounds, is the same error
in the other direction.

### The DONE WHEN sweep does not pass, and the reason it cannot

Run as written in `ROADMAP.md § P1.7` in this pass:
`rg --no-ignore --hidden --text --count-matches "DEMO" mobile/` exits **0** where
the criterion requires **1**. Five matches. `mobile/dist` holds **210 files** and
nothing was cleaned, which the criterion requires reporting so an emptied
directory cannot sweep clean for the wrong reason.

**FOUR OF THE FIVE ARE PROSE ABOUT THE REMOVAL ITSELF** — the note in
`app/config.ts` saying what was taken out, a pre-existing sentence in
`session/signOut.ts`, and two compiled copies of the latter under `dist/`. The
fifth is a stale Hermes bundle built while the constants still existed, and it is
the only match that could carry a credential.

**REWORDING THE PROSE TO MAKE THE SWEEP PASS WOULD BE WORSE THAN REPORTING IT.**
The criterion cannot tell a token used as a credential from the same token
written down in an explanation of its deletion, and a check made green by
deleting the words that explain a removal buys a passing sweep at the cost of the
record. The bundle is the owner's call; the prose is not a defect.

**THIS FILE IS 4754 LINES**, measured by `wc -l` and a raw LF count that agree,
against its own "Revisit at 2000 lines" trigger. `START_HERE.md` still tells a
booting session it is 1940. Both stale, neither corrected here.

**P1.7 STEPS 5 AND THE DRAFT HALF ARE COMPLETE: EVERY LOCAL READ OF A ROW THAT
BELONGS TO SOMEBODY NOW ASKS WHOSE IT IS. 2026-08-11, `fde2b0c`.** This block
SUPERSEDES the P1.7 STEP 4 entry below as the current phase; that entry is left
exactly as written, and was true when written.

**THE STACK IS NOW FIVE DEEP AND NOTHING HERE IS ROTATED.** Three blocks sit
under this heading (this one, STEP 4, STEP 3) and a fourth — account
provisioning — below them, with `## Previous phase` beneath that. The rotation
was owed at three, is owed at five, and is deliberately not done here: merging
them is a separate judgement about what stops being current, and doing it inside
a phase record would settle it silently.

**THE PHASE IS TEN COMMITS, read from `git log --oneline a471dc2^..fde2b0c` in
this pass.** Eight carry code, two are docs-only (`6b74b89`, `1b94a0c`):

| sha | what it landed |
|---|---|
| `a471dc2` | ownership columns, the identity store, a migration that cannot stop half-done |
| `6b74b89` | docs only — the ownership schema recorded |
| `1f37888` | the login returns `user_id`; the device records who signed in |
| `0ac09ef` | the owner STAMPED onto draft and bill rows at creation; nothing read it yet |
| `a57a648` | the SEND queue filter |
| `869977a` | a permanently rejected void stops being re-sent |
| `cfb6633` | the VOID queue filter |
| `1b94a0c` | docs only — step 4 recorded, and the four ways a green meant nothing |
| `8ec784e` | the master-data cache bound to a TENANT; a mismatch reads as ABSENT |
| `fde2b0c` | the draft loader hands back only the current person's cart |

**WHERE THE COMPARISON LIVES — THREE PRODUCTION FILES, measured this pass with
`rg` over `mobile/` excluding `dist/`.** `SqliteLocalStore.ts` owns the
definition (`OWNED_BY_CURRENT` at `:119`, `ownerParams` at `:126`, spliced into
`QUEUED` at `:157` and bound at eight statement sites); `SqliteMasterStore.ts`
carries its own tenant-only clause (`CACHE_TENANT_MATCHES` at `:44`) and the
TypeScript half `sameTenant` at `:108`; `SqliteDraftStore.ts` IMPORTS the first
file's two symbols rather than retyping them (`:17-18`, used at `:235` and
`:253`). Both symbols were exported for that import and nothing else changed
about the send queue.

**FOUR AREAS, FOUR SEPARATE ACCEPTANCE SCRIPTS, verified in `mobile/package.json`
this pass — 21 `prove:*` scripts in total.** The send queue: `prove:sendowner`.
The void queue: `prove:voidowner`. The cache: `prove:cachetenant`. The draft
loader: `prove:draftowner`. Each was required to have its own evidence because
none of the four inherits another's filter — the void path draws on neither
shared constant, the cache has no user half, and the draft loader is reached from
`App.tsx` only.

**THE IDENTITY IS STILL NOT CLEARED ON SIGN-OUT, and this was re-measured rather
than carried forward.** A search for `.clear()` across `mobile/` excluding
`dist/` returns one production call — `deps.tokens.clear()` in
`session/signOut.ts:335`, which is the KEYSTORE. `SqliteIdentityStore.clear()`
has no production caller; the only mentions are `App.tsx:1013` explaining its
absence and three proof files. The reason is unchanged: the refusal that must
guard the clearing — a sign-out that will not proceed while unsent bills carry an
owner this device is about to forget — does not exist, and `refused_pending`
counts bills rather than owners.

### What is REFUSED and what is merely WITHHELD — and they are not the same call

**A CACHE MISMATCH STOPS WEIGHING. A FOREIGN DRAFT STOPS NOTHING.** Both are
"this is not yours", and the opposite treatment is deliberate.

The cache decides the NUMBERS ON THE SCREEN. Another shop's price list is not an
old price list, it is a wrong one, and the operator pays cash against it — so a
tenant mismatch reports the fetch stamp as NULL, which every existing reader
already treats as never-fetched, and `mayStartBill` refuses. The stop is
inherited from machinery that was already proven rather than built a second time
where the two could disagree.

A draft says NOTHING about prices. Withholding one costs the next person a cart
they never had; blocking the yard over it would be a control the person at the
scale can route around, and `ROADMAP.md § P1.7` already rejected that class of
control on the ground that they will use paper or reinstall, and both lose more.
So the draft is withheld, kept, not adopted, not destroyed, and SAID OUT LOUD —
a count on the start screen, because withholding otherwise leaves a screen
byte-identical to an ordinary empty morning.

### The upgrade cost, and it is not softened anywhere

**A HANDSET WHOSE CACHE PREDATES THE TENANT COLUMN CANNOT TRADE UNTIL A REFRESH
SUCCEEDS, AND A REFRESH NEEDS A CONNECTION.** Those rows carry NULL, NULL is not
this shop's, so every cached list reads as ABSENT and weighing is refused: not a
degraded mode, not stale prices, no bills. The first offline morning after an
upgrade cannot trade at all.

It follows from the decided rule that an unknown tenant is a mismatch, and the
alternative is worse in the direction that cannot be recovered: treating unknown
as ours hands the scale another shop's prices to pay against, on a device nobody
can open afterwards (`ARCHITECTURE.md § 11`). A lost morning is visible and
recoverable; a mispriced load is neither. Recorded at the reader itself, in
`SqliteMasterStore.ts`'s `readStamp`, so it is met by whoever would relax it.

### The two on-screen unsent counts still disagree, and the operator still sees the wrong one

**UNCHANGED BY THIS PHASE AND STILL OWED.** `pendingQueueSnapshot` counts what
CAN send and carries the owner filter; `listByState` is `WHERE sync_state = ?`
alone and never gained one, so it still totals EVERY account's bills. `App.tsx`
feeds the status strip and the sign-out refusal from the UNFILTERED one and queue
health from the filtered one. What the person at the scale experiences: a count
of unsent bills that includes other accounts' and will not go down however long
they wait, and a sign-out that can refuse over bills they neither own nor can
send. **Resolved by P1.7 step 7, the status strip**, which splits the
parked-for-another-account count from the ordinary unsent count. Not fixed in
this phase on purpose: that step decides what the operator is TOLD, and changing
the number inside a filter commit would settle the decision and implement it in
one pass.

### The device-driver limit — these two sentences must not be separated

**The migration, the owner filters, the cache binding and the draft loader are
proved on the driver the PROOFS run: `node:sqlite`, against real files on disk.
NONE of it is proved on the driver the HANDSET runs**, which is `expo-sqlite`'s
own connection (`mobile/src/device/expoSqliteDriver.ts`) and cannot be exercised
off-device at all. Re-measured this pass: `rg expoSqliteDriver mobile/src/proof`
returns comment mentions and nothing executable. If a way to run against the
device driver ever exists, that is work to return to, not work already finished.

**AND NO DEVICE PASS WAS TAKEN FOR ANY OF THIS PHASE.** Every observation in this
block is a headless proof or a file read on this box. Nothing here has been seen
on a handset, and `CLAUDE.md § Boot check` "WHICH BUNDLE THE HANDSET IS RUNNING"
applies in full to whoever takes the first one.

**THIS FILE HAS PASSED ITS OWN SPLIT TRIGGER BY MORE THAN TWICE OVER.** Measured
this pass by two instruments that agree: `wc -l` returns **4625**, and a raw
LF-byte count returns **4625** with CR=0. Its own trigger at the head of this
file reads "Revisit at 2000 lines", and `START_HERE.md` still tells a booting
session this file is "1940 lines: budget two reads". Both are stale by a wide
margin; neither is corrected here, because this pass may not edit `START_HERE.md`
and the split decision is not a phase record's to take.

**P1.7 STEP 4 IS COMPLETE ON BOTH HALVES: THE SEND QUEUE AND THE VOID QUEUE EACH
CARRY AN OWNER FILTER WITH ITS OWN ACCEPTANCE EVIDENCE. 2026-08-11, `cfb6633`.**
This block SUPERSEDES the P1.7 STEP 3 entry below as the current phase; that
entry is left exactly as written, and was true when written.

**THE STACK IS NOW FOUR DEEP.** The note below already recorded three and called
the rotation owed. Nothing here is merged or rotated — the queue item is
unchanged, and this block makes it one deeper rather than settling it.

**THE COMMITS, read from `git log --oneline a471dc2^..cfb6633` in this pass and
not recalled.** Seven, of which six carry code and one is docs-only:

| sha | what it landed |
|---|---|
| `a471dc2` | ownership columns, the identity store, a migration that cannot stop half-done |
| `6b74b89` | docs only — 1 file, 80 insertions, no deletions |
| `1f37888` | the login returns `user_id`; the device records who signed in |
| `0ac09ef` | the owner STAMPED onto draft and bill rows at creation; nothing reads it yet |
| `a57a648` | the SEND queue filter |
| `869977a` | a permanently rejected void stops being re-sent |
| `cfb6633` | the VOID queue filter |

**WHERE THE OWNER CLAUSE LIVES — ONE PRODUCTION FILE, FIVE SITES.** Measured with
`rg` over `mobile/src` excluding proofs:
`mobile/src/adapters/sqlite/SqliteLocalStore.ts` only, at `:108`
(`OWNED_BY_CURRENT`), `:146` (spliced into `QUEUED`, which reaches six send
statements), `:796` (`requestVoid` capturing who asked), `:856`
(`listVoidsToApply`) and `:946` (`clearVoidRefusals`). No other production file
carries one.

**EACH QUEUE HAS ITS OWN ACCEPTANCE EVIDENCE, which is what step 4 required.**
`npm run prove:sendowner` for the send queue, `npm run prove:voidowner` for the
void queue, `prove:owner` for the stamp and `prove:voidterminal` for the retry
stop — declared at `mobile/package.json:29-32`, out of 19 `prove:*` scripts.

**WHAT WAS NOT TOUCHED, measured with `git log -G` over the phase range rather
than asserted.** The cache readers (`FROM cached_products|cached_sellers|
master_cache`): no commit. The draft loader's selection (`ORDER BY updated_at
DESC`): no commit. `SqliteMasterStore.ts` and `src/session/signOut.ts`: no
commit. The identity is still NOT cleared on sign-out, deliberately, because the
refusal that must guard the clearing does not exist.

**THE TWO ON-SCREEN UNSENT COUNTS NOW DISAGREE BY DESIGN, AND THE ONE THE
OPERATOR SEES IS THE WRONG ONE.** `pendingQueueSnapshot` counts what CAN send;
`listByState` is `WHERE sync_state = ?` alone (`SqliteLocalStore.ts:351-355`) and
never gained the filter, so it still totals every account's bills. `App.tsx:581`
feeds the status strip and the sign-out refusal from the UNFILTERED one, while
`:610` uses the filtered snapshot for queue health. WHAT THE PERSON AT THE SCALE
EXPERIENCES: a count of unsent bills that includes other accounts' bills and will
not go down however long they wait, because nothing they can do releases another
person's rows; and a sign-out that can refuse over bills the person in front of
it neither owns nor can send. Resolved by **P1.7 step 7, the status strip**,
which splits the parked-for-another-account count from the ordinary unsent count.
Not fixed here on purpose: that step decides what the operator is told, and
changing the number inside a filter commit would settle the decision and
implement it in one pass.

**THE MIGRATION CAN NO LONGER STOP HALF-DONE ON THE DRIVER THE PROOFS RUN. IT IS
NOT PROVED ON THE DRIVER THE HANDSET RUNS.** These two sentences must not be
separated. The handset's mechanism is `expo-sqlite`'s
`withExclusiveTransactionAsync` (`mobile/src/device/expoSqliteDriver.ts:73`), a
different mechanism on a different connection; re-measured this pass, no proof
imports that file — `rg expoSqliteDriver mobile/src/proof` returns two COMMENT
mentions and nothing executable. If a way to run against the device driver ever
exists, that is work to return to, not work already finished.

**SUPERSEDED 2026-08-12 — THAT WAY NOW EXISTS AND WAS RUN. The second sentence
above is no longer true for Android.** The route is this project's own Android
DEBUG BUILD, which did not exist when the paragraph was written; it was built at
`9d2eb22` with applicationId `dev.chutipon.recycle` and installed on one handset,
a vivo 1938. **NOT Expo Go** — Expo Go is a third-party release-signed app, runs
neither our package nor a readable private storage, and could not have answered
this, which is why the build exists at all. HOW: a pre-P1.7 database of 150,000
rows was seeded into the app's storage so the O(N) statements inside the
transaction take tens of seconds; the process was force-stopped TWICE, at 4.5 MB
and 64.7 MB of WAL — both past the 32-byte header, so both after BEGIN, the
second about four seconds before the commit a no-kill control had timed — and
both reopens held the COMPLETE OLD SHAPE (6 tables, 0 indexes, 10 columns) with
all 150,000 rows at their original values by SHA256 fixed before the file left
this box. A no-kill control proved the seed migrates fully; a killed database
relaunched reached a file byte-identical to it. **STILL NOT PROVED: iOS has never
run this at all, and NO RELEASE BUILD EXISTS on either platform, so none of it
describes the artefact a shop would install.** The kill also could not be aimed at
a NAMED statement the way `proveMigration` M2 aims under node — two coarse points
inside one window, not a statement-level sweep.

**TWO UNSWEPT HAZARDS IN THE PROOF SUITE, both queued in `OPEN_ITEMS.md § Code
debt found and left in place`.** Neither is a product defect; both make correct
code look broken, which is what makes them expensive.
(1) **A proof that requests a void BEFORE the other bills are synced takes a
PERMANENT refusal.** A sync helper's `runUntilQuiescent` runs the void loop too,
against a throwaway `FakeServer` that answers `not_found` for a bill it has never
seen; that maps to `rejected`, which since `869977a` is terminal. The symptom is
all-zero attempt counts, which reads as an over-strict owner filter or a stopped
engine — both wrong. The discriminator is one column: `void_refused_at` non-null
with code `void_rejected` means ownership never came into it. **UNSWEPT** — found
by `prove:voidowner` W1 failing, not by looking.
(2) **A proof that builds its own store outside the shared harness is not signed
in**, so a strict filter reads as a gate stuck shut; it cost `prove:clock` a red
sweep. **THAT ONE WAS SWEPT** and every site covered.

**AND THE SWEEP'S OWN NUMBER HAS ALREADY ROTTED, WHICH IS RECORDED RATHER THAN
CORRECTED IN PLACE.** That queue entry says THIRTEEN proof files build a store
outside the harness. Thirteen was correct when measured at `a57a648`; re-measured
in this pass the count is **FIFTEEN**, because `proveVoidTerminal.ts` and
`proveVoidOwner.ts` were added by the two commits that followed. The entry's
CLAIM still holds — both newcomers establish an identity
(`proveVoidTerminal.ts:123`, and eight `identity.save` calls in
`proveVoidOwner.ts`) — but its NUMBER did not survive two commits. It is the exact
rot `CLAUDE.md § Conventions` "PIN A CLAIM TO A COMMIT" describes, in a line
written during this phase by the session that wrote the convention's newest
example.

**P1.7 STEP 3: THE OWNERSHIP SCHEMA, AND A MIGRATION THAT CANNOT STOP HALF-DONE.
2026-08-11, `a471dc2`.** Schema and migration only. The owner filter, the cache
readers, the sign-out refusal, the sync engine, the transport and `App.tsx` are
deliberately untouched: they READ what this commit writes, and if a reader moved
in the same commit nobody could tell a wrong schema from a wrong reader.

**THE STACK IS NOW THREE DEEP AND THE ROTATION IS STILL OWED.** This block sits
above the 2026-08-10 account-provisioning entry, which already says the same
thing about the one beneath it. Nothing here is merged and nothing is rotated;
whoever rotates takes all of them. The queue item is unchanged.

**WHAT LANDED — read from `git show --stat a471dc2`, not recalled.** Eight paths,
851 insertions, 17 deletions. **Three are NEW:**
`mobile/src/adapters/sqlite/SqliteIdentityStore.ts`,
`mobile/src/proof/migrationCrashChild.ts` and
`mobile/src/proof/proveMigration.ts`. Five were modified: `OPEN_ITEMS.md`,
`ROADMAP.md`, `mobile/package.json`, `mobile/src/adapters/sqlite/schema.ts` and
`mobile/src/proof/cartCrashChild.ts`.

**THE COLUMNS — read from `schema.ts` on disk at this commit, line by line.**
`local_bills` (`:92-93`) and `local_draft` (`:129-130`) each carry
`owner_tenant_id` AND `owner_user_id`. `master_cache` (`:182`),
`cached_products` (`:201`) and `cached_sellers` (`:211`) carry
`owner_tenant_id` and NO user column, because prices belong to the shop and not
to a person. `local_draft_lines` carries neither: it is reachable only through
`draft_id`, which is `ON DELETE CASCADE` with `foreign_keys` ON, so a second
copy of the owner could only ever disagree with the first. A new single-row
table `local_identity` (`:228`). Every owner column is NULLABLE — `ADD COLUMN
... NOT NULL` with no default is a hard engine error on a table that already
holds rows, and NULL is the value that means UNKNOWN. Upgraded devices converge
through the migration lists: `ADDED_BILL_COLUMNS` (`:301-302`),
`ADDED_DRAFT_COLUMNS` (`:316-317`), and `ADDED_CACHE_TENANT_COLUMN` (`:333`)
applied over `CACHE_TABLES` (`:337`).

**THE SCHEMA PATH IS INSIDE A TRANSACTION** — `schema.ts:435-449`. The pragmas
run first and OUTSIDE it (`:436`), because `journal_mode` cannot be changed
inside a transaction and `busy_timeout` must be in force before anything can
need a lock; then `return db.transaction(async (tx) => {` (`:437`), with every
statement issued through `tx.run` (`:438`, `:446`) because `SqlTx` has no
`exec`.

**THE PROOF IS `npm run prove:migration`**, declared at `mobile/package.json:28`
as `npm run build && node dist/proof/proveMigration.js`.

**THE IDENTITY STORE IS WIRED INTO NO CALLER, and that is deliberate: this
commit had to be provable without one.** Measured, not assumed — a search for
`SqliteIdentityStore`, `LocalIdentity` and `local_identity` across `App.tsx`,
`app/` and `src/` returns the class's own file, the schema's CREATE TABLE, and
`proveMigration.ts`, and nothing else. The bound: the only source file outside
those three roots is `mobile/index.ts`, which returns zero.

**THE LIMIT, AND THESE TWO SENTENCES MUST NOT BE SEPARATED. The migration can no
longer stop half-done on the driver the proofs run. It is NOT proved on the
driver the handset runs**, which is a different mechanism on a different
connection — `expo-sqlite`'s `withExclusiveTransactionAsync`, documented in
`src/device/expoSqliteDriver.ts` as running on its own connection — and which
cannot be exercised off-device at all. The first sentence must never appear in
this file without the second. If a way to run this against the device driver
ever exists, that is **work to return to, not work already finished.**

**SUPERSEDED 2026-08-12.** That way exists and was run: Android only, on this
project's own DEBUG build (`9d2eb22`, `dev.chutipon.recycle`), one vivo 1938,
never Expo Go. Two force-stops inside a window widened to tens of seconds by a
150,000-row pre-P1.7 seed, both leaving the complete OLD shape with every row
intact; controls both ways. The full measurement is recorded once, under
*Current phase*, and is deliberately not restated here. **iOS has never run it
and no release build exists**, so the pairing rule above still binds — it is now
"proved on the driver the handset runs, on ANDROID, on a debuggable build".

**THE INJECTOR CHANGED TARGET WHEN THE CODE BENEATH IT CHANGED.** Making the
migration transactional moved where `proveCart`'s crash injector fired: it
attaches to the FIRST transaction it encounters, and that became the migration
rather than the promotion it means to kill. One case went red. The other stayed
GREEN — on a state produced by killing the migration's first statement, proving
nothing about the transition it is named for, which is the worse half of the
two. **An injector bound to a POSITION rather than to the THING it intends to
kill will change target when the code beneath it changes, and nobody will edit
it.** The fix arms the injector only once the store is open.
`mobile/src/proof/cartCrashChild.ts` was outside the file scope that phase was
given; the commit's own stat confirms it was changed (23 insertions), and the
departure was declared at the time rather than buried.

**A CORRECTION OWED IN THE CODE, FOUND WHILE VERIFYING THIS RECORD.**
`schema.ts`'s own comment states that atomicity is proved at `7b4f22d`. That sha
is the commit BEFORE this one and does not contain the transaction; what is
proved is `a471dc2`. The comment was written while the work was uncommitted and
HEAD still read `7b4f22d`. It is recorded here rather than corrected, because
this pass may not edit `mobile/`.

**ACCOUNT PROVISIONING: THE SERVER HALF IS COMPLETE. 2026-08-10.** Three code
commits landed with no status entry between them, and this is that entry. The
API can now create an account, change a password and reset one, and every
sentence in this file that said otherwise is corrected below.

**THE ROTATION IS NOT DONE.** The block beneath this one is the PREVIOUS phase —
the pilot shop on the dev database — left exactly where it was rather than moved
into the log. It is superseded as "current" and unchanged as a record. Whoever
rotates it should take this block with it.

**FIVE COMMITS SINCE THE LAST ONE THIS FILE RECORDED (`a73c264`), NOT TWO**,
measured with `git log a73c264..HEAD --name-only` rather than counted from
memory. Three of them are code and none had a status entry:

| sha | what it is | status entry before today |
|---|---|---|
| `685c817` | D6–D9 in `ARCHITECTURE.md`, one lesson | none — the decisions live in that file |
| `0241cc8` | **`POST /users`** — an admin creates an account | **none** |
| `a361e53` | the CRLF footgun re-measured; touched this file | not a phase record |
| `c296738` | **the 422 handler** | **none** |
| `cb11f6a` | **the two password routes** | **none** |

**THE PATH COUNT IN THIS FILE IS WRONG AND IS CORRECTED HERE.** It said 29
declared paths with no create-user or password route. Read out of the schema the
app itself publishes, at `cb11f6a`: **31 declared paths, 37 operations**, and six
under `/users` — `GET /users`, `POST /users`, and `POST` on
`/users/me/password`, `/users/{user_id}/password`, `/users/{user_id}/activate`,
`/users/{user_id}/deactivate`, `/users/{user_id}/revoke-sessions`.
**THE COUNT MOVED BY TWO WHILE THREE ROUTES WERE ADDED, AND THAT IS ARITHMETIC
RATHER THAN AN ERROR. DO NOT "CORRECT" IT TO 32.** OpenAPI keys `paths` by PATH,
and `POST /users` shares its path with `GET /users` — it adds an OPERATION to a
path that already existed. So three routes produced two new paths and three new
operations: 29 → 31 paths, 34 → 37 operations. **A number that looks wrong and is
right is the number somebody fixes into being wrong**, so whoever re-derives this
must say which of the two they counted; both are recorded here for that reason.

### The 422 handler — `c296738`

**WHAT IT REMOVES.** FastAPI's default validation handler serialises pydantic's
`input`, which holds the value that failed. So the refusal of a too-short
password RETURNED THAT PASSWORD:
`{"type":"string_too_short","loc":["body","password"],"input":"abc1234",…}`.
`app/main.py::validation_error_handler` drops `input` from every error object and
leaves `type`, `loc`, `msg` and `ctx` — which field, in what way, against what
bound.

**API-WIDE BY CONSTRUCTION, NOT BY A MAINTAINED LIST**, and the distinction is
the whole decision. A list of secret-ish field names — password, new_password,
pin, token — is the author guessing at what a thing may be CALLED, and it fails
in the PERMISSIVE direction: **a field nobody thought to add is a field that
leaks**. Removing one key unconditionally means there is nothing to classify, so
a route written later is covered by a decision already taken. That is not a
prediction: the two password routes in `cb11f6a` did not exist when the handler
landed, and their 422s carry no value.

**THE CONTROL THAT MAKES THE FIX READABLE.** A fix that emptied every validation
error would satisfy "the value is gone" and be worse than the defect. So the
proof asserts, on a NON-SECRET field, that the error still names the field
(`loc`), the rule (`type`), the reason in words (`msg`) and the bound (`ctx`) —
and it does that on `POST /uoms`, **an endpoint with nothing to do with users**,
because a handler that only pleased the create route would be invisible from
inside that route.

**WHAT IT CANNOT REACH, recorded so nobody reads the fix as total:** a CUSTOM
validator that interpolates the rejected value into its own message still echoes
it through `msg`. No handler can tell that from a legitimate sentence, because
the text is the author's. Every constraint in this API is declarative today, so
no such message exists; the rule for the day one is written belongs at the
validator, not here.

### The two password routes — `cb11f6a`

`POST /users/me/password` — guarded by the ordinary authenticated dependency,
takes the current password and the new one, and is the only route in that module
a staff phone may call. `POST /users/{user_id}/password` — admin-guarded, takes
the new password only, names its target in the path.

**BOTH WRITE THE HASH AND THE VERSION BUMP IN ONE STATEMENT**, and the reason is
`deactivate_user`'s, in its own words: one UPDATE leaves *"no window — not even a
transactional one a reader has to reason about — in which the account is locked
and the sessions it holds are not"*. The same window is what a two-statement
password change would open: a credential already replaced while the tokens it
minted are still accepted.

A wrong current password answers **400** — a new status and a new `kind` in the
existing envelope, because none of the five kinds already in play means "the
request is well formed and a value in it is wrong". 422 in this API is for a
payload that can never be valid, and this one is valid with the right password.

### The disproof, and the finding inside it

**REMOVING THE BUMP REDDENED FIVE CELLS, AND THEY ARE NOT ALL THE SAME KIND OF
EVIDENCE.** Three are the session cells — the token held before the change is
re-issued and refused, on two different endpoints. The fourth is the DELTA cell
beside them, which reads the `token_version` the response reports and requires it
to be one higher than the token carried.

**THE DELTA WAS MEASURING THE COLUMN ALL ALONG.** It would be satisfied by a bump
that ended no session — by any statement that incremented the number, whatever
the guard did with it afterwards. **NOBODY SHOULD CITE IT AS EVIDENCE A SESSION
DIED.** The cell that carries that claim is the one that re-issues the
pre-change token and is refused; the delta is a shape check standing next to it,
and the two happened to redden together only because one statement moves both.

The split that proves the session cells are pointed at the right fact: under that
mutation the password genuinely changed — the new one signs in, the old one does
not — and only the SESSION survived.

### The route order is load-bearing

`/users/me/password` is declared BEFORE `/users/{user_id}/password`. Starlette
matches routes in registration order and `{user_id}` carries no converter in the
path string, so the other order sends the literal `me` to the ADMIN route: 422
for a malformed uuid, or 403 for a staff caller who is entitled to the route.
Both are the wrong answer and neither looks like a routing fault.

Verified from the committed blob at `cb11f6a` — self at line 805, admin at line
901 — and the check does not stop at the order: **it requires the REASON to sit
within twelve lines of the decorator**, so a later edit that moves the route away
from its explanation fails rather than passing quietly.

**THE PILOT SHOP IS PROVISIONED ON THE DEV DATABASE, AND THAI SURVIVED FOUR OF
FIVE ENCODING LAYERS. 2026-08-10.** `provision_shop.py` was run against
`recycle` for the first time. No R-number was issued; R-numbers are defined in
`ROADMAP.md` and are the owner's to issue.

**WHAT NOW EXISTS IN `recycle` THAT DID NOT.** Two tenants, two users and two
shop codes, on top of the two seed fixtures:

| tenant | name | users | code | what it is |
|---|---|---|---|---|
| `982d76af-dd35-4c46-a54c-f087c39b92c8` | บางกอก สเกลล์ รีไซเคิล | `admin` | **`R6VD7RAC`** | **the owner's shop** |
| `a45432ea-eda2-41f3-a091-dea5c3a10447` | `ZZ-ENCODING-CONTROL-DO-NOT-USE` | `zz_control_admin` | `VRG5QWBU` | **the ASCII control** |
| `1111…1111` / `2222…2222` | Shop A / Shop B | 2 each | — | `seed_dev.py` fixtures |

**`ZZ-ENCODING-CONTROL-DO-NOT-USE` IS NAMED HERE ON PURPOSE.** It was created by
this session, by the same script and down the identical path, so that the Thai
result at every layer could be read against a name that cannot be mis-encoded.
It is not a shop, it is an instrument, and its removal is an open question for
the owner. A row that explains itself only inside the database is a row the next
reader finds and cannot place.

**THE ENCODING MEASUREMENT, WHICH IS THE REUSABLE PART.** Five layers, expected
bytes fixed ONCE before the write from a file that never crossed a shell:
argv into the script, the row written to and read back from Postgres, the `COPY`
block inside the `pg_dump` body, and that row again after a restore — **all four
that PERSIST the name were byte-exact UTF-8. The one layer that mangled it was
stdout**, and stdout persists nothing.
**THE LAYER THAT CORRUPTS IS THE ONLY LAYER A PERSON CHECKS BY EYE, AND THE FOUR
THAT MATTER ARE ONES NOBODY SEES.** Anyone judging this by looking at the console
would have concluded the opposite of the truth in both directions: the output
looked right, and there would have been no reason to check the four that were.
**What actually happens is not corruption**: Python encodes stdout as CP874 on
this box, CP874 represents every character in that name, so nothing is lost — the
bytes are simply not UTF-8, and anything decoding that stream as UTF-8 gets
mojibake. The full form is in `CLAUDE.md § Machine footguns`, appended to the
codepage entry it extends rather than restating it.
**The ASCII control is what makes that readable** — it matched at every layer
INCLUDING stdout, so the Thai mismatch there is a property of non-ASCII text and
not of a broken comparison. Two bounds: the stdout figure is a PROXY, and the
name carries above-line vowels and a thanthakhat but no below-line vowel, so
that class is untested.

**THE FIXTURES WERE PROVEN UNCHANGED BY ARTEFACT AGAINST ARTEFACT**, not by a
re-read compared with a memory: the `COPY public.tenants` rows for Shop A and
Shop B are byte-identical in the pre-provisioning dump and the post-provisioning
dump, `created_at` included.

**THE SECOND RUN REFUSED AND WROTE NOTHING**, and the no-write is counted rather
than trusted: 4 / 6 / 2 immediately before and 4 / 6 / 2 immediately after.

**TWO BACKUPS, BOTH KEPT.**
`recycle_20260810T090615Z_at-0009-pre-provisioning` — taken before any write,
its schema version read as `0009` out of the dump's own body rather than off its
label, and proven restorable (`RESTORE_EXIT=0`, every want/got row matching).
`recycle_20260810T093442Z_at-0009-post-provisioning` — taken after, 850 rows,
and the source of layers three and four.

**~~NO ENDPOINT CREATES A USER AND NONE CHANGES A PASSWORD.~~ — TRUE AT
`a73c264`, FALSE FROM `cb11f6a`.** The measurement below stands as taken and is
superseded rather than rewritten: at that commit the API declared 29 paths and
under `/users` there was only `GET /users` and `POST /users/{user_id}`
`activate` / `deactivate` / `revoke-sessions`. **It now declares 31 paths and 37
operations**, and all three of the missing routes exist — see § Current phase for
the re-measurement and for why the path count moved by two while three routes
were added. **The bound belongs with the finding, not under it:** that negative
is authoritative for ENDPOINTS because it
comes from the schema the app itself publishes, but the companion survey — which
writers reach `tenants` at all — was run over RAW-SQL SPELLINGS, so its answer is
**three sites FOUND, not three sites proven to be all**; an ORM call or a
differently-spelled statement would not have matched.

Full evidence in the dated entry `2026-08-10 — the pilot shop provisioned, and
the one layer of five that mangles` at the end of this file. **The paragraphs
below describe the phases that PRECEDED this one**, newest first.

**P1.3's CRITERION A IS SATISFIED: THE CHAIN CLOSED IN ONE EXECUTION.
2026-08-10, `b22d449`.** Test-only — no endpoint, request model, login handler,
schema or migration changed, and `recycle` was not written to. No R-number was
issued; R-numbers are defined in `ROADMAP.md` and are the owner's to issue.

**THE CHAIN, WHICH IS THE WHOLE CLAIM.** `POST /auth/shop-code` returned a
tenant identifier; that identifier — the object parsed out of that response, in
the same process, with no value typed anywhere — was posted to
`POST /auth/login`; the token that came back was sent to **`GET /whoami`** and
accepted. `/whoami` is the right endpoint and not merely a convenient one: it
depends on `get_principal`, which verifies the JWT signature, re-reads the user
row and compares `token_version`, so **a 200 there is not producible without a
valid token**. An endpoint whose 200 could be obtained without one would have
proven nothing. It also echoes the tenant the SERVER resolved, so the chain is
closed at both ends rather than only at the client's.

**BOTH CONTROLS RAN IN THE SAME EXECUTION AS THE POSITIVES**, and the run says so
in its own output: an absent code returns 404 with this endpoint's own refusal,
and the same authenticated endpoint refuses with no token and with a tampered
one. **A positive with no paired negative in the same run is not readable** — a
200 from `/whoami` means something only beside a 401 from `/whoami`, against the
same server, in the same process. That is why the run was built this way rather
than as two scripts whose greens are compared afterwards.

**THE FINDING THAT MATTERS MOST, AND IT IS NOT "THE CHAIN IS TESTED".** A
hardcoded correct identifier passes EVERY assertion a chained one passes.
Measured, not reasoned: with A2 rewired to a literal — the chain genuinely
broken — the run passed all five criteria and exited 0, **including the
cross-check that `/whoami` reports the tenant A1 resolved**. A correct hardcode
and a chained value are the same 36 bytes, so **no comparison of values can
separate them**: not equality, not the cross-check, not any status code. What
separated them was **provenance carried by a TYPE** — A1 wraps its parse in a
`str` subclass, the request body carries that object, and the gate asserts the
body's identifier IS that type. With the break in place and the gate present,
exactly one cell reddened and the run exited 1.
**ITS LIMIT, STATED SO A LATER READER DOES NOT CREDIT IT WITH MORE:** it proves
the value FLOWED through the process. It cannot stop an author who hand-writes
the wrapper. It catches an accidental or lazy break — which is what a regression
looks like — and is not a defence against a deliberate forgery.

**AN ASSERTION THAT COULD NEVER GO RED WAS FOUND BY READING THE DIFF BACK.** A5's
"the two refusals differ" was written as `check(True, ...)` — a cell that cannot
fail, sitting in a column of `[ok]` marks where it reads as an assertion. It is
now a printed OBSERVATION with a note in the source saying why it is not a check:
whether those two refusals differ is a fact to record, not a bar to clear.

**THE FIXTURE INSTRUMENT WAS MEASURED BEFORE AND AFTER**, with the same tool both
times, and one open question closed with an unwelcome answer. Both recorded in
the dated entry.

**OUTSTANDING: CRITERION B, AND ONLY B.** Nobody can issue a code, so nothing
resolves in production. "P1.3 is not done" now has exactly one meaning.

Full evidence in the dated entry `2026-08-10 — Criterion A satisfied: the chain,
and what a hardcoded value cannot be told from` at the end of this file. **The
paragraphs below describe the phases that PRECEDED this one**, newest first.

**THE SHOP-CODE LOOKUP IS BUILT AND PROVEN, AND P1.3's DONE WHEN WAS REWRITTEN
BECAUSE THE DECISION MADE IT UNREACHABLE. 2026-08-10.** No R-number was issued;
R-numbers are defined in `ROADMAP.md` and are the owner's to issue.

**WHAT LANDED.** `POST /auth/shop-code` (`1951b19`), unauthenticated, in its own
module rather than beside login — D4's whole content is that resolving a code is
SEPARATE from signing in, and one file would have blurred the boundary that is
the security property. It reads through `recycle_directory` on the second engine
added in `f84b54d`, returns `{"tenant_id": "<uuid>"}` and nothing else (enforced
by a `response_model`, so a future handler cannot widen it by accident), and
refuses unknown, malformed and over-long input from ONE module-level exception
object — three raise sites, one object, so the bodies cannot drift apart.
**Login was not touched**, and that is measured rather than asserted:
`LoginRequest`, `LoginResponse`, `_INVALID_LOGIN`, the handler `def` and the
route decorator each appear **0 times** in the commit's diff, with a presence
control (`directory_router`, 2 hits) proving the search reads the diff.

**THE FIXTURE, AND WHY IT IS REPEATABLE.** Nothing writes to
`directory.shop_codes`, so a hit cannot be tested without a row. The proof
creates one in a SCRATCH database and refuses to run against the live database
for either of its two arguments — and refuses if the two are equal, because that
would delete its own discriminator. The row is DELETED and re-created every run
rather than found, per `lessons/README.md § Lessons` "proof-must-run-twice.md".
Run twice with no reseed: green both times. **`recycle` was not written to.**

**THE FIVE PROPOSITIONS.** P1 a real code resolves and the body carries EXACTLY
`{tenant_id}`, with six named fields asserted ABSENT rather than merely one
asserted present; P2 a well-formed absent code is refused; P3 a malformed code is
refused with a body BYTE-IDENTICAL to P2's; P4 the read went through the
directory role, made discriminating by putting the fixture in one database and
asserting it absent from the other, so the app engine could not have answered for
two independent reasons; P5 CONTROL — login still 200s with a token, still 401s a
wrong password and an unknown user, and those two refusals are still byte-
identical to each other.

**SEEN RED TWICE BEFORE BEING BELIEVED.** Mutation A added one field to the
response model: exactly two cells reddened, the exact-key-set assertion and the
`code` ABSENCE assertion — a presence-only check would have stayed green.
Mutation B gave the malformed case its own 422: exactly P3's two cells reddened.
Both undone, green returned, residue search 0 with a presence control at 1.

**THE FALSE GREEN, AND IT IS THE MOST TRANSFERABLE THING THIS PHASE PRODUCED.**
The proof first used a hardcoded port where a server had been listening since
2026-08-07. The child uvicorn could not bind and exited; the `/health` poll got
200 from THE OTHER SERVER; and **P2 and P3 PASSED against a route that did not
exist**, because a route-not-found 404 is shaped like the refusal we designed —
same status, same `detail` key. Only P1 failed. The proof now takes a free port,
detects a dead child instead of waiting it out, and — the fix that actually
closes it — **asks the server for its own `/openapi.json` and requires it to
declare `/auth/shop-code` before any assertion runs.** P2 is additionally pinned
to this endpoint's own refusal text, so deleting the route reddens it.

**THE DOOR HAS NO KEY, and this is the answer to "why does the thing we just
built not work".** This read "Nothing writes to `directory.shop_codes` by any
route — manual, endpoint, script or migration" until 2026-08-10, and **the
script half became false the same day**: `8d395fc` committed
`server/scripts/provision_shop.py`, which mints a code and INSERTs it as
`recycle_owner`. **No ENDPOINT writes it and no migration does**, which is the
half that has not moved. The door has a key now, and the key is a shell script an
installer runs — not something the running system can do for itself.

**P1.3's DONE WHEN WAS REWRITTEN, AND THE REASON IS CHECKABLE.** It demanded a
`POST /auth/login` carrying **no uuid** returning 200. D4 decided login does not
change, and `LoginRequest.tenant_id` is a required uuid — so that request can only
ever return 422. **The bar was unreachable BY DESIGN, not unmet**, and it was not
touched because the work was hard: the server change it waited for LANDED. It is
now two criteria — **A**, the server is correct, provable today against a
throwaway database; **B**, the route works for a real shop, which needs P1.5.
**Both are outstanding**, and `ROADMAP.md` carries the old wording, the date and
the reason beside them.

**A ROUTE-COUNT FIGURE IN AN EARLIER ENTRY IS CORRECTED**, re-derived here rather
than carried: see the dated entry below.

Full evidence in the dated entry `2026-08-10 — the shop-code endpoint, and the
criterion that had to be rewritten` at the end of this file. **The paragraphs
below describe the phases that PRECEDED this one**, newest first.

**`recycle_directory`'s PRIVILEGES MEASURED ON THE LIVE CLUSTER, AND THE SHOP-CODE
LOOKUP DECIDED. 2026-08-10.** Read-only throughout: no write to any database, no
endpoint written, nothing under `server/app/` or `server/scripts/` touched. No
R-number was issued and none was invented — R-numbers are defined in `ROADMAP.md`
and are the owner's to issue.

**Twenty-four propositions were written down BEFORE the first query ran**, each one
quoted out of `0009`, `db/init/00_init_roles.sql`, `server/README.md`,
`ARCHITECTURE.md`, `SRS_MAP.md` or this file, and each phrased so a query could
refute it. **Twenty-two hold. Two do not**, and both are in `server/README.md`:
that the migration is applied to no cluster (it is on four databases), and a role
table that presents RLS as what contains this role.

**THE CONTROL RAN FIRST AND PASSED, WHICH IS WHAT MAKES EVERY REFUSAL AFTER IT
INFORMATIVE.** As `recycle_directory` itself, a read of `directory.shop_codes`
returned — count, both columns, and the column list resolved through
`::regclass`. Only then were the refusals taken. **A refusal produced by a broken
connection or a missing role looks identical to a refusal produced by a missing
grant**, and nothing in the error text tells them apart; the control is the only
thing that separates them, and it is reported first for that reason.

**THE REFUSALS ARE AT SCHEMA LEVEL, NOT RELATION LEVEL, and a design can rest on
that distinction.** Exactly:

    ERROR:  permission denied for schema public
    LINE 1: SELECT count(*) FROM public.tenants;

Five more — `users`, `purchase_bills`, `purchase_bill_items`, `alembic_version`,
`server_clock_watermark` — were **identical in kind**, naming the schema and never
the relation. A relation-level refusal would mean the role can enter `public` and
is stopped per table, so every future table would need remembering; a schema-level
one means it cannot enter at all, and new tables are excluded by default.

**THE CLAIM WAS NOT QUALIFIED BY DATABASE, SO IT WAS TESTED ON EVERY DATABASE THIS
ROLE CAN CONNECT TO — nine — AND NOT ONLY THE LIVE ONE.** `0009:57-59` says "BY ANY
PATH" and `00_init_roles.sql:39-41` says "even by accident"; neither says "in
`recycle`". **The expectation going in was that the scratch copies would be WEAKER**
— that a database created by restore rather than by the bootstrap script would have
missed `REVOKE ALL ON SCHEMA public FROM PUBLIC` and left PUBLIC its default
`USAGE`. **That expectation was wrong.** All nine report `has_schema_privilege(...,
'public', 'USAGE') = f` and refuse identically, `recycle_restore_scratch` — which
holds a restore of live data — among them. A claim that survives a test nobody asked
of it is worth more than one that passes a test designed to pass, and this one was
not designed to pass.

**WHAT IS NEW HERE AND WHAT WAS ALREADY ON RECORD — separated, because presenting
the whole of it as new would be false.** The GRANT side was read back after the
migration and is recorded at `:3191-3192` and `:3508-3510`; today's figures **agree
with it exactly**, `nspacl` carrying `recycle_directory=U/recycle_owner` and
`relacl` carrying `recycle_directory=r/recycle_owner`, and that is corroboration
rather than discovery. **What had never been observed by anyone is the REFUSAL
side**: no session had connected as this role and been told no. That half is new,
and so are **five capabilities or locations no file in the repository claims** —
recorded as five separate entries in `OPEN_ITEMS.md`, with two bounding negatives
beside them, and not restated here.

**A SEPARATE SURVEY, RUN IN ANOTHER SESSION AND RECORDED SECOND-HAND**, established
what this repository says about limiting repeated login attempts. It is reported,
not verified, and is labelled as such in the dated entry below.

**DECIDED, and recorded where this project records settled decisions** —
`ARCHITECTURE.md § 10. The three settled decisions`, as D4: the shop-code lookup is
a SEPARATE endpoint and the login body does not change. The reasoning, the two
things it leaves open, and why the refusal shape is argued rather than inherited are
there and are deliberately not restated here.

Full evidence in the dated entry `2026-08-10 — recycle_directory's privileges
measured, and the shop-code lookup decided` at the end of this file. **The
paragraphs below describe the phases that PRECEDED this one**, newest first, which
is this section's usual shape.

**MIGRATION 0009 APPLIED TO THE LIVE DATABASE — the first write to `recycle` in
this whole line of work. 2026-08-09.** No R-number was issued and none was
invented: R-numbers are defined in `ROADMAP.md` and are the owner's to issue.

`recycle` reads **0009** and carries schema `directory` with
`directory.shop_codes`, empty. The twelve pre-existing tables are untouched,
compared against a manifest written before the migration. **This does NOT
advance P1.3's DONE WHEN**, which is a login carrying no uuid returning 200;
what it completes is that step's SCHEMA half. `ROADMAP.md` said in THREE places
that the migration had never been applied to any cluster — at D4, at P1.3, and
at P3.2, the step that will read FROM this relation — and all three are
corrected in this update.

**The ordering paid out.** The three backup/restore fixes landed first, on
purpose, so that the first backup taken after the migration would meet a fixed
writer and a fixed reader. It did: the live database at 0009 backs up and
restores green, with `directory.shop_codes` present as an OK row. On the parent
code that exact restore was the red that started this line of work.

Full evidence in the dated entry `2026-08-09 — migration 0009 applied to the
live database` at the end of this file. **The paragraphs below describe the
phases that PRECEDED this one** — identifier quoting on both sides, and the
key-space work before that — and are kept for the arc, newest first, which is
this section's usual shape.

**Three commits, and the arc is one thing**: `89d55ce` quoted every identifier
reaching SQL in `restore_db.py`, `cf2dadf` did the same in `backup_db.py`, and
`68d679d` made the manifest key carry the LOGICAL relation name so a quoted
identifier keys correctly. **Of `backup_db.py`'s three defects, TWO ARE NOW
CLOSED and ONE REMAINS OPEN** — the summary total against its own itemisation,
which is not next and is not scheduled here. Full arc, with every number and
control, in the dated entry `2026-08-10 — identifier quoting on both sides` at
the end of this file.

**THE DEFECT'S REAL SHAPE WAS WRONG IN THESE FILES UNTIL IT WAS MEASURED, and
the correction runs the wrong way.** They said an unquoted identifier made the
backup FAIL CLOSED — abort, no artefact, the only danger a missing exit line.
It does not. `from public.Odd Name` is VALID SQL naming relation `Odd`, folded
to `odd`, with the ALIAS `Name`; it aborted only because no relation `odd`
existed. With one present the backup COMPLETES and records a count from the
WRONG TABLE. **The abort was the lucky case.** Corrected in both files in
`cf2dadf`; the old wording is kept beside each correction.

The paragraphs below this one describe the phase that PRECEDED these commits and
are kept for the arc; the sentence "NOT FIXED: backup_db.py" in them is true of
that moment and no longer true today.

Migration 0009 created `directory.shop_codes`, the first relation outside schema
`public`. `backup_db.py` keys its manifest off whatever `pg_dump` wrote, stripping
a literal `public.` and nothing else; `restore_db.py` built the other side from
schema `public` alone and compared over the UNION of the two key sets. A key
present on one side and absent on the other failed the restore — **a restore in
which every row had landed.**

**THE TRIGGER IS MIGRATION-TIME, NOT FIRST-USE.** `pg_dump` writes a `COPY` header
for a table holding zero rows, so it fires on the first backup taken after the
migration, before any code reads the relation. Everyone's stated guess, recorded
in `OPEN_ITEMS.md` as an unmeasured inference, was the first issued code.

**FIXED: the restore side, commit `4150833`.** The comparison now walks the
manifest's keys and nothing else, splits each key into schema and relation, and
quotes each part separately. **NOT FIXED: `backup_db.py`, deliberately, and it
now carries THREE defects rather than one — the count read TWO until 2026-08-09,
when a control pass measured a third.** All three are named below and in
`OPEN_ITEMS.md`.

The arc, with every number and the controls that make the numbers mean anything,
is in the two dated entries `2026-08-09 — the 0009 key-space defect` and
`2026-08-09, later — the restore side fixed` at the end of this file. The work
this section previously named, `GET /users`, landed 2026-08-07 and has its own
dated entry; it is not restated here.

**EVERYTHING BELOW THIS PARAGRAPH, TO THE END OF THIS SECTION, IS THE SUPERSEDED
PHASE'S RECORD — `GET /users`, landed 2026-08-07 — RETAINED IN PLACE RATHER THAN
ROTATED, AND THAT IS A DEBT AND NOT A DECISION.** This file's convention is a
rotation: the old § Current phase becomes § Previous phase, and the old
§ Previous phase (A2, reconciliation) joins § Earlier phases. Doing it here would
move roughly 360 lines of `GET /users` and roughly 240 of A2 inside a commit whose
subject is a backup/restore defect, and a 600-line move nobody asked for cannot be
reviewed alongside the change it is stapled to. **The rotation is OWED and filed
in `OPEN_ITEMS.md`.** Until it happens: the paragraphs ABOVE are the phase, the
paragraphs BELOW are history, and nothing below has been re-verified today.

`POST /users/{id}/deactivate`, `/activate` and `/revoke-sessions` all take a uuid
in the path, and nothing in this API produced another user's uuid except as a
bare id on a bill header. All three were built, proven and invokable only by
someone with a database connection: a shop owner dismissing an employee had no
way to name them. `GET /users` closes that, admin-only, tenant-scoped by RLS.
Two files: `server/app/users.py` and `server/scripts/prove_revocation.py`.

**THE SURVEY THAT OPENED THIS PHASE WAS WRONG TWICE, and both corrections make
the case stronger rather than weaker.** (1) `prove_revocation.py` does NOT take
its ids from `seeddata.py`'s constants — it reads them from `/whoami` after
logging in AS each user (`:273-275`), which is a route to an id the product's
user does not have, since an owner does not hold an employee's password. (2)
`GET /bills/{id}` DOES return another user's uuid — `created_by` and `voided_by`
(`bills.py:256,259`), to any signed-in principal. The honest premise is the
narrowed one: a uuid with no name, one bill at a time, for bills since 0006 only,
and nothing anywhere answering "who works here".

**THE AUTH TIER IS `require_admin`, WHICH BREAKS THE CONVENTION DELIBERATELY**,
and the asymmetry is the argument. For `GET /bills` a staff token can already
read every bill in its shop, so that open question is whether to close a door
already standing open. Nothing in this API yields a colleague's NAME, so applying
the convention here would have been a NEW disclosure made by inertia. Opening
later is one dependency; closing after every phone has held the roster is not.
Recorded as its own entry under `OPEN_ITEMS.md § Decisions open`, NOT folded into
the `GET /bills` one.

**FIVE KEYS: `user_id`, `username`, `full_name`, `role`, `is_active`.**
`password_hash` obviously never leaves. `token_version` is omitted for a reason
worth keeping: publishing it invites a client to re-derive `get_principal`'s
`claimed != current` check, which is an EQUALITY and never an ordering, and a
client re-deriving it would write the ordering. `created_at` is omitted as a
timestamp shipped ahead of the formatter that must render it.

**BOTH MUTATIONS WERE EXECUTED AGAINST A RESTORED SCRATCH COPY, NEVER DEV, AND
THE HAZARD WAS REAL.** Under the id mutation the lock lands on a uuid naming
nobody, so CASE 7's `POST /bills` under a supposedly-locked account SUCCEEDS.
Measured after the run: **scratch 338 bills, dev 335** — all three unremovable
rows landed in the copy.

**THE FINDING THAT OUTLIVES THE PHASE, and it is about proofs rather than about
users.** A cell asserting tenant A's staff is ABSENT from tenant B's roster
passed twice while measuring nothing: once over a 401 whose empty list made
`x not in set()` trivially true, and once over a mutation where every id was
wrong and two WRONG ids happened to differ. In the second the status cell and the
absence cell are BOTH green and the positive control is the only red in the file.
Written up as the ninth mechanism in
`lessons/a-check-that-never-went-red-was-never-observed.md`.

**A WRITTEN PREDICTION WAS CORRECTED BY A RUN**, and the correction is in the
proof rather than applied quietly: CASE 9 predicted both tenant cells would stay
green under the id mutation. The positive control fired too.

**NOTHING IN THIS PHASE RAN ON A HANDSET AND NO SCREEN EXISTS.** The observations,
with what they do NOT establish, are the dated entry at the end of Baseline
observations.

**The text below this block is the PREVIOUS phase's entry and is left standing** —
a dated record is superseded, never rewritten.

---

**P1.10 — `prove_reconcile.py` BACK TO GREEN. LANDED 2026-08-07. The second
P-number recorded as met.** RED since 2026-08-03, and the four failing cells that
two documents had recorded as one thing turned out to be TWO. Three were absolute
counts of the 46-tenant database the rebuild destroyed and are now DERIVED from the
restored copy at runtime. **The fourth held no count at all** — the X3 probe had
silently stopped landing its row inside the window it measures, because Python
block-buffers a non-tty stdout at 8192 bytes and the checker's whole report over a
2-tenant copy is 5364. **No assertion, no code and no test had been edited**; the
database shrank and the stimulus stopped arriving. The fix is `-u` on the child's
argv. `ROADMAP.md § STAGE 1` "prove_reconcile.py back to green" carries the DONE
WHEN — **corrected there, because as written it named only the three counts and
meeting it would have left the fourth cell red** — and is marked met. The
observations, with what they do NOT establish, are the dated entry at the end of
Baseline observations.

**NOTHING IN THIS PHASE RAN ON A HANDSET, AND NO PRODUCT CODE CHANGED.** One file:
`server/scripts/prove_reconcile.py`. `reconcile.py` was mutated four times to make
the repaired cells go red and is byte-identical to its committed blob.

**THE FINDING THAT MATTERS MORE THAN THE REPAIR, and it is about the pilot.** On a
ONE-TENANT database — which is what a pilot shop's is (`ROADMAP.md` D10) — three
injections cannot fire at all: **S3/T0** (one tenant is visible whether RLS is on
or off, so T0 has nothing to report), **S3/X2** (the per-tenant sum and the global
count are the same number), and **T10** (there is no other shop's seller to point
at). Those are the injections that exercise TENANT ISOLATION, the most heavily
enforced property in the system. They now SKIP with their reason printed rather
than passing or inventing a red, and the run reports a skip count — but the
consequence stands and is not softened by the skip being correct: **this proof's
green says less at a pilot shop than it says on this box, and the number to read
there is the skip count, not the exit code.** Recorded in `OPEN_ITEMS.md`.

**The text below this block is the PREVIOUS phase's entry and is left standing** —
a dated record is superseded, never rewritten.

---

**P1.4 — AN ACCOUNT THAT CAN BE LOCKED, NOT ONLY SIGNED OUT. LANDED 2026-08-07,
migration 0007. The first P-number recorded as met.** `users.is_active`
(NOT NULL DEFAULT true), checked at BOTH sites a lock has to bite —
`POST /auth/login` and `get_principal` — because either alone is half a lock:
login alone leaves every token already in a pocket working until it expires
(`JWT_TTL_SECONDS` 3600), and `get_principal` alone refuses every request while
login keeps handing out usable tokens. Locking bumps `token_version` in the SAME
`UPDATE`, so the sessions the account already holds end with it and there is no
window between the two. `POST /users/{id}/deactivate` and `/activate` are the
capability; **P3.7 owns the screen and no screen exists.**
`ROADMAP.md § STAGE 1` "An account that can be locked, not only signed out"
carries the DONE WHEN and is marked met there. The
observations, with what they do NOT establish, are the dated entry at the end of
Baseline observations.

**NOTHING IN THIS PHASE RAN ON A HANDSET.** Every green is a migration, an HTTP
proof, a catalogue read or a hash on this box.

**THE FINDING THAT OUTLIVED THE PHASE**, because it is about proofs rather than
about locking. `get_principal` holds two guards that are BOTH true of a locked
account's token, since the lock bumps the version in the same statement. The
account check is ordered FIRST deliberately: ordered second it is unreachable
through every path the product has, because minting a token for a locked account
needs a login and login refuses one. Deleting it leaves the request **still
401** and moves only the `code` — so a status-only assertion would have stayed
green with the guard gone, which was MEASURED (mutation B below) rather than
argued. Written up as the seventh mechanism in
`lessons/a-check-that-never-went-red-was-never-observed.md`.

**One thing the phase created and did not fix**, recorded in `OPEN_ITEMS.md`
against P3.7: a locked account's phone invites the operator to sign in and the
sign-in cannot work. **That is DERIVED from reading the client against the
server change, not observed** — no device pass has been run against a locked
account.

**The text below this block is the PREVIOUS phase's entry and is left standing**
— a dated record is superseded, never rewritten.

---

**`created_by` ON `purchase_bills` — LANDED 2026-08-07, migration 0006. Not an
R-number: it is the schema/audit question `OPEN_ITEMS.md` has carried since
2026-08-05, settled by the owner and built in four phases.** Bills written from
now on record the user whose session SUBMITTED them. **Every bill written before
it stays authorless permanently** — the column repairs nothing backwards, which
`ARCHITECTURE.md § 11` already stated as a fact rather than a gap. The bound
lives in the SCHEMA as a `COMMENT ON COLUMN`: it names who SYNCED the bill,
which is not necessarily who weighed the load. Nothing displays it. Observations,
with what they do NOT establish, are the dated entry at the end of Baseline
observations.

**NO PHASE IS OPEN. R1 and R2 closed 2026-08-06; R2b closed 2026-08-07.**

**R2b — the sign-out sheet could not say why the queue was stuck. CLOSED on a
device pass that met its done-condition clause by clause.** With one bill queued
and the token refused, the sheet named the expiry, instructed no wait, and its
own `เข้าสู่ระบบ` button signed in, closed the sheet and posted the bill
(`B-2569-76`). Read off the screen at 12:08, bundle established beforehand,
recorded verbatim in Baseline observations below along with what one pass does
NOT establish. The client change is `f768a18`; behind it, `proveSignOut.ts` S9
drives the real `SyncEngine` against a 401 and against an outage and asserts the
two sheets differ from an identical measured queue count — green twice bare, and
observed going RED in ten cells when the branch is put back to its shipped form.

**Read the closure at its actual width.** What is established is that path, once,
on one handset, under an admin account, with one queued bill, reached by
revocation rather than by a token expiring naturally. The bounds are in the
observation itself and are not repeated here as reassurance.

**R1 and R2 are both CLOSED, on 2026-08-06.**

Read that as a positive statement, not as silence. "Closed" here means a
done-condition written in `ROADMAP.md` before the work started was met and the
meeting of it was OBSERVED, with the observation dated in Baseline observations
below. A phase that had merely stopped would say so; a phase nobody had
recorded would leave this section holding its predecessor, which is exactly the
failure this file has had before.

**R1 — sign-out, and the server's ability to refuse a token it already issued.
Both halves, and the halves were the point.**

- **Server, `19a6b63`.** `users.token_version` (migration `0005`), minted into
  every token and re-read from the user row on every request — on the same
  query `get_principal` already runs to resolve the role, so it costs no extra
  round trip. DEFAULT 1 and never 0, so a token carrying no version claim
  matches no row and is refused rather than read as a confident zero. Bumped
  through `POST /users/{user_id}/revoke-sessions`, admin only, which its own
  docstring labels a STOPGAP because there is nothing else in the system to
  hang the bump on. Proven by `server/scripts/prove_revocation.py`.
- **Client, `7484645`.** Nine files, 1974 insertions: `app/SignOutSheet.tsx`,
  `src/session/signOut.ts`, `src/session/signOutNotice.ts`, the token stores,
  `App.tsx`, `src/sync/engine.ts`, and `src/proof/proveSignOut.ts`. The sheet
  **can refuse** — it will not end a session while bills are still queued
  unsent — and it can fail without claiming success.

**R2 — the daily money screen's device gaps. Closed, but the two halves are
NOT equally strong and this file will not pretend otherwise.**

- **The 403 rendering: strong.** Drawn on a handset under a staff account for
  the first time. The screen carried no money field at all, which is A1's
  design holding on real hardware — the leak is unrepresentable rather than
  guarded. The log tie is by source address and uniqueness, not by clock.
- **The hung socket: weak, and labelled weak.** What is established is that a
  socket which accepts and then never answers ends in the no-number outage
  screen instead of a `0.00` day. That it ended at the 20 s ceiling
  specifically is NOT established — it was watched on a stopwatch, and a
  refused connection would draw the same screen. See Known device gaps.

**WHAT R1 DID NOT FIX — one finding, undiagnosed, and it is worse than it
looks.** During the R1b device pass the sync strip read
`ออฟไลน์ — เก็บไว้ในเครื่อง 1 ใบ จะส่งให้เองเมื่อเน็ตกลับมา` while the network was
up at full strength and the server was answering 401 to every request. In the
same minute, on the same device, the daily money screen classified the SAME
refusal correctly — a `ต้องเข้าสู่ระบบใหม่` card with a sign-in button that
resolved it. Two renderers of one app drew one cause two ways, and the sync
strip's wording is FALSE while it is on screen.

It compounds into a deadlock, which is why it is recorded here and not only in
`OPEN_ITEMS.md`: sign-out REFUSES while a bill is queued, the queue cannot
drain while the token is refused, and the strip tells the operator to wait for
a network that already works. The phone can then neither send nor sign out.
**Revocation is not required to reach this state** — it is what every device
draws when `JWT_TTL_SECONDS` expires mid-shift, which is to say every hour of
every shift, on every handset.

**No cause is named here, deliberately, because none has been measured.** Two
candidates with different fixes are recorded in `OPEN_ITEMS.md`; nobody has yet
read `engine.ts` or `queueHealth.ts` against this reproduction. Naming one
would be `lessons/diagnosis-must-precede-the-fix.md` exactly.

**CORRECTION, 2026-08-07 — THE STRIP HALF OF THE FINDING ABOVE IS WITHDRAWN. The
paragraphs above are left standing on purpose** (a dated observation is not
edited in place; it is superseded, and the supersession is the record). Restaged
the same day on the same iPhone, after `npx expo start -c` and a full reload so
that the bundle was known to be `5e5a756`, the strip drew
`หมดเวลาเข้าใช้งาน — ต้องเข้าสู่ระบบใหม่ บิล 1 ใบยังอยู่ครบ จะส่งให้เองหลังเข้าสู่ระบบ`
with a working sign-in button and held it for five minutes. **`statusNotice.ts`
classified the 401 correctly the whole time**, and it is not a repair site. The
`ออฟไลน์` reading of 2026-08-06 is not a property of any committed code; it came
from a stale Metro bundle, which is now a machine footgun in `CLAUDE.md` and cost
roughly two days of diagnosis aimed at three files that were all correct.

**What survives the correction is narrower and sharper: the SHEET alone, and
there was never a deadlock.** The sign-out sheet had no session input, so it
could not tell "queued because the phone is offline" from "queued because the
caller is nobody" and said the offline sentences for both — promising bills would
send on connection while the phone was connected, and instructing a wait for a
condition that could not arrive. The exit existed the entire time, two
centimetres up the same screen: the strip's sign-in button, which when pressed
posted the queued bill immediately. That is R2b's real defect and what R2b fixes.
The gate in `signOut.ts` is correct and is untouched — the queue carries no
identity, so releasing it would let one operator's bill drain under whoever signs
in next.

**The next step is `ROADMAP.md`'s to choose, and as of 2026-08-07 the two files
agree.** `ROADMAP.md` described R1 and R2 as forthcoming until the same task that
wrote this section updated it; both are marked CLOSED there now, on the same
evidence and with the same asymmetry recorded for R2. R2b is marked CLOSED there
too, on the device pass below. **The head of the queue is now `R3`** — the
hosting decision — which was startable in parallel throughout, because
procurement has lead time and code does not. **`ROADMAP.md` remains the authority
on ORDER**, and that is a
permanent division of responsibility rather than a temporary state: this file
records what has been OBSERVED, that one records what comes NEXT and why. Where
they ever disagree again, the disagreement itself is the finding — a session
reading both would otherwise believe whichever it read first.

### Documentation since R1/R2 — three commits, no code touched

Recorded because each was a phase boundary and this file is updated at phase
boundaries, not because any of them changed behaviour.

- **`b955697` — the lessons generator.** `server/scripts/build_all_lessons.py`
  and the generated `lessons/all-lessons.md`. Counted today rather than taken
  from the commit body: **34 lesson files, and 34 index lines in
  `lessons/README.md`** — directory and index agree — with `all-lessons.md` at
  3778 lines. `lessons/README.md` is excluded from the generated file for TWO
  independent reasons; see the CRLF/BOM footgun in `CLAUDE.md` before removing
  that exclusion on the strength of refuting one.
- **`b74396e` — `START_HERE.md`, and two workflow rules.** The file owns the
  reading order, the role split, the phase-brief shape, and the done-checklist
  as observables; it points for everything else. `CLAUDE.md`'s Workflow section
  gained "every phase brief carries an explicit `Prove:` block" and "do not
  commit until the owner confirms" — **both were surveyed for first and found
  NOWHERE in the repository.** `CLAUDE.md`'s header and `README.md` now name
  `START_HERE.md`; nothing had named it, so it was unreachable from the repo's
  own entry point.
- **This commit — citations by section, not by line.** A three-line insert into
  `CLAUDE.md` had invalidated all twenty of `START_HERE.md`'s pointers at once,
  and the shift was not uniform (+3, +5, +6 by position). Citations are now
  `file § Section` plus a quoted handle, checked by
  `tools/verify_citations.ps1`. See Baseline observations for what the checker
  caught, including its own false green.

Per the CLAUDE.md workflow this is a phase boundary: stop for review.

### R2b follow-up — the sheet's session input is MEASURED now, not typed in

A red-team pass on `62cee25` found four issues. **This closes ONE.** The other
three are untouched and still queued; nothing below says anything about them.

**What it fixes is a PROOF, not a product defect.** The sheet's behaviour is
unchanged on every path, no wording moved, and nothing here ran on a handset.
Read that as the limit it is: this commit makes an existing claim measurable, it
does not repair anything the yard could have seen.

**The finding, in its own terms.** `session` was a hand-typed literal at all 21
of `proveSignOut.ts`'s `session:` call sites, S9's two included. S9 measured
`pending` off a real `SqliteLocalStore` and then typed the session in beside it
— so the one link R2b created, the sheet depending on session state, was
exercised by nothing, and S9's own label claiming "the halves differ in the
ENGINE, not only in what is passed to the card" was the claim not established.
Measured by the red team rather than argued: delete `setSessionEnded(true)` at
`App.tsx:618` and `prove:signout`, `typecheck` and `typecheck:app` all stay
green. (The count is **21**, not the 22 `grep -c 'session:'` reports: one of the
22 is prose at `proveSignOut.ts:1079`.)

**What changed.** `sessionEndedAfterPass` in `src/session/signOut.ts` now owns
the mapping from a `SyncRunResult` to `sessionEnded` — a decision that lived
nowhere but `App.tsx:617`, confirmed by grep across the whole tree before the
change. `App.tsx:617` and `:658` apply it and write no boolean of their own. S9's
two `session:` inputs are derived from the real 401 pass and the real outage
pass. The other 19 literals are untouched on purpose, S6's wording table most of
all: it declares its expectation per cell so the checker does not recompute the
rule it checks.

**The acceptance test asked for at the start of this work was UNMEETABLE and was
replaced.** It required that deleting `App.tsx:618` turn `prove:signout` red;
`tsconfig.node.json` sets `rootDir: "src"`, so no node proof can observe a
deletion in that file. That obstacle was already recorded seven lines away in
`OPEN_ITEMS.md` for the `maySync` placement. The residue it leaves is filed
beside that twin.

**OBSERVED** — the numbers, the disproof and a corrected prediction are in the
dated entry at the end of Baseline observations. Nothing in this subsection is a
claim that was not run.

## Previous phase

**THIS HEADING IS THE A-LOG'S AND IS NOT THE PHASE IMMEDIATELY BEFORE THE CURRENT
ONE — noted 2026-08-25, and the heading itself is deliberately NOT renamed.** The
phase immediately before the current one is P1.8b SERVER, under
`## The phase immediately before this — P1.8b SERVER` near the top of this file.
**The name here is load-bearing:** `tools/verify_citations.ps1` resolves a section
by prefix, so a second heading beginning "Previous phase" makes every citation to
this one resolve to TWO — measured on 2026-08-25, when exactly that was tried and
took BROKEN from 6 to 7. The section above was renamed instead.

**A2 — reconciliation. Server only, one script, no endpoint and no schedule.
COMPLETE. The checker is GREEN and its green means something.**

Until now the money was correct because the code was correct; nothing checked
it, and nothing would have said the day that stopped being true.

`server/scripts/reconcile.py` — 17 checks per tenant plus 10 global.
`server/scripts/prove_reconcile.py` breaks it on purpose, 19 injections, green
twice in a row.

### Where it ended up (2026-08-03, after the approved clean-up)

**`RECONCILE OK: every invariant held, on every tenant.` 44 checks, 2 tenants,
0 violations, 0.2s, run bare twice.**

**The green is not vacuous, and that distinction is the whole phase.** The
database was rebuilt empty, then FILLED BY THE REAL PATH: all nine server proofs
were run against it first, so the checker swept **27 bills, 28 items, 24 prices,
7 sellers and 2 doc_no counter rows** that `POST /bills` actually created —
including voided bills, off-list payments and backdated fixtures. A green over
an empty database would have proved nothing; this one sweeps rows the product
wrote.

**The owner's condition was met without exception: NO transaction row was
deleted to reach green, and no violation survived that was not proof debris.**
The rebuild replaced the whole volume rather than pruning rows out of it, so
nothing was selectively cleared, and there was nothing left to stop and report.

### How it got there — three steps, in the approved order

1. **Both debris sources fixed at source** (commit `5fb07bd`), so the bleeding
   stops before anything is rebuilt. Measured: the same two scripts that had
   taken the checker from 84 to 96 violations in one round now add **zero**.
2. **A backup, verified by restoring it BEFORE the source was destroyed** —
   `a-backup-is-a-claim-until-it-is-restored.md` — see "what the rebuild cost"
   below.
3. **The rebuild**: `docker compose down -v`, `up`, `alembic upgrade head`
   (0001→0004), `seed_dev.py`, then the nine proofs, then the checker.

### What the rebuild cost — stated, not glossed

Backup `recycle_20260802T234603Z_pre-rebuild`, **1207 rows**, restored into
`recycle_prerebuild_verify` and row-count-verified against its own manifest
BEFORE `docker compose down -v` ran. The dump files sit on the host outside the
docker volume, so they survived the volume's destruction; sha256 re-verified
afterwards, all three files OK.

Gone from the live dev database (recoverable only from that dump):

| | before | after |
|---|---|---|
| tenants | 48 | 2 |
| bills | 402 (66 voided) | 27 |
| bill items | 428 | 28 |
| users | 50 | 4 |
| sellers / products | 55 / 53 | 7 / 6 |
| live bill money | 151,985.70 | (fresh) |
| earliest arrival | 2019-03-09 | current shop year |

**The four REAL DEVICE BILLS are among what was dropped** — `B-2569-222`
(220.00, iPhone), `B-2569-223` (11,007.50, Android), `B-2569-224` (210.00),
`B-2569-225` (1075.00), the multi-device evidence from 2026-07-29. They remain
in the dump and in the Baseline observations table below, but **the device pass
they came from can no longer be re-queried live.** That is the real cost of this
rebuild and it is not zero.

**Also gone: every user id.** `seed_dev.py` lets `users.id` default to
`gen_random_uuid()`, so the admin and staff rows have NEW ids. Tenant, seller
and product ids are fixed constants and did NOT move, so a bill queued on a
phone still resolves its references. **The phone must sign in again** — its
Keychain token names a user id that no longer exists, which the client already
handles as the 401 `session_expired` path. Worth noting this is the first time
that path has been triggered by something other than expiry.

### The recommendation this executed

Recorded before the owner approved it, and it was **option 2 then rebuild, in
that order** — fix the scripts first, because a rebuild alone would have been
undone by the next proof run the same day. The measurement above (+12 per round
before, 0 after) is what made the order load-bearing rather than tidy.

**Option 3, a suppression baseline, stays rejected and was never built.** The
mechanism that lets a checker ignore a row is the mechanism that lets it ignore
the row that matters.

### The 96 violations that were there, and what they were

Kept because the diagnosis is the record, and because the rebuild is only
defensible if the diagnosis was right. Both causes were PROOF DEBRIS, not
product defects, and both were read out of the scripts rather than inferred:

- **T5 — 44 bills with a NULL `doc_no`**, one in each of 44 tenants.
  `prove_rls.py:96` INSERTs a whole tenant graph directly under tenant context
  to exercise the RLS `WITH CHECK`, and never calls `create_bill`, so no
  doc_no is ever assigned. One per run, never cleaned up (hard rule 5). **The
  API cannot produce such a row**; the column is nullable only for hard rule 3's
  offline state, which never reaches the server.
- **T7 — 40 bills whose doc_no BE year disagrees with the year they arrived
  in** (36 in tenant A, 4 in tenant B). `prove_daily_report.py` creates bills
  over HTTP — so doc_no comes from the real path, in the current BE year 2569 —
  and then moves `server_received_at` onto its synthetic 2019 fixture day by
  direct UPDATE (its own docstring, line 40). doc_no says 2569; arrival says
  2562. All 40 are exactly seven Gregorian years adrift.

**The diagnosis was PROVEN, not asserted.** `prove_reconcile.py` restores a copy,
undoes those two causes and nothing else, and the copy then runs green — so
those two accounted for all of them. Had they not, the run stops there and says
so. That proof is what made the rebuild defensible rather than a shrug.

### The two fixes, and why each is narrower than it first looked

Both landed in `5fb07bd`. In both cases the obvious fix was the wrong one:

- **`prove_rls.py` must NOT "route through `create_bill`"** — the first thing
  proposed, and wrong. Its whole purpose is to INSERT DIRECTLY so the RLS
  `WITH CHECK` on INSERT is exercised; going through the API would delete the
  thing being proven. The real fix is narrower: it invents THROWAWAY TENANTS
  with `uuid4()`, so it now **deletes both tenant graphs on the way out**. Hard
  rule 5 protects a shop's ledger; it was never about a tenant a proof created
  eight seconds earlier.

  The teardown carries **no `WHERE tenant_id` at all** — each DELETE runs inside
  that tenant's own context and RLS scopes it, which is the same policy the
  script exists to prove. With no context the predicate matches nothing and it
  removes zero rows, so it fails closed; a hand-written predicate would be the
  version that can be wrong. It is registered with
  `AsyncExitStack.push_async_callback` before the first fixture row exists, and
  **that it survives a mid-proof exception was verified by injecting one**:
  teardown ran, 9 rows per tenant, nothing left, before the traceback
  propagated. "Nothing was left behind" is read back through RLS as its own
  assertion rather than assumed.

- **`prove_daily_report.py`'s fixture day moved INTO the current BE year**, not
  away from 2019 arbitrarily. Its quarantine argument — a day far from real
  trade — was sound and is kept; what it missed is that doc_no takes its year
  from the real clock at creation, so backdating across a year boundary is what
  produced the mismatch. The day is now **6 January of the current shop year**:
  the earliest date for which the whole fixture span (`old_bill` at DAY−5 …
  `edge_after` at DAY+1) stays inside one BE year.

  **New consequence, deliberate:** in the first five days of a shop year that
  span does not exist yet, and the script now **refuses with exit 2** rather
  than build a fixture it would have to apologise for. That refusal is the
  be_year fix showing through — backdating across a year boundary is now
  detectably wrong, which is exactly what it should be.

### FINDING — our proofs can write rows the product cannot

Recorded on the owner's instruction. The two fixes above close it for these two
scripts; the finding itself is general and stands. **Both debris causes are the
same defect wearing two faces, and it is not "the proofs are untidy".**

`prove_rls` writes a bill with a NULL `doc_no`. `prove_daily_report` writes a
bill whose `doc_no` year disagrees with its arrival year. **`POST /bills` cannot
produce either row.** There is no input, no ordering, no failure and no race
that gets the product to that state — the first is assigned in the same
transaction as the insert, and the second is now structurally impossible (see
the be_year fix below).

So:

> **A proof that writes a row the product cannot produce has proved something
> about a database, not about the system.**

It bites in three directions, and only the first is obvious:

1. **it pollutes.** 84 permanent violations, and the reconciler's first ever run
   was red for reasons that have nothing to do with the product.
2. **it can pass while the real path is broken.** An assertion made over a
   hand-built row exercises the row, not the code that would have built it.
   `prove_rls`'s bill has never once been through `create_bill`'s doc_no
   assignment, its idempotency check, or its master-data gate.
3. **it teaches the wrong lesson to whoever meets the debris next.** The natural
   reading of a red T5 is "the invariant is too strict" — and relaxing it is one
   edit away, at which point the checker stops being able to see a bill that
   really did lose its number.

Written up as `lessons/a-proof-fixture-must-be-a-row-the-product-could-produce.md`.
**This is why the recommendation above is 2-then-rebuild rather than a
suppression list: the debris is a symptom of a fixture discipline problem, and
suppressing it would preserve the problem in amber.**

**Found while writing T7. NOW FIXED — see "The two-clock be_year defect" below.**
It was one instant per year wide and had never been observed, but it corrupted a
legal document sequence irreparably, so the owner directed the fix immediately
and in its own commit.

Decisions made, each argued in the module docstring:

- **THREE LENSES, deliberately.** Per-tenant checks read through
  `app.db.tenant_connection` — the same `SET LOCAL` primitive the API uses, with
  not one hand-written `WHERE tenant_id` in the file (hard rule 2), so they see
  what a report served to that shop would see. A superuser connection is used for
  exactly two things, listing tenants and counting rows globally, because RLS
  hides `tenants` without a context and both project roles are NOBYPASSRLS by
  design. And a third lens with NO context at all, which must see nothing.
- **X2 is what makes the greens mean anything.** The per-tenant row counts must
  SUM to the global count. Without it every check could pass over rows RLS hid
  from all 46 contexts, and the report would be a confident green about data
  nobody read.
- **ONE REPEATABLE READ SNAPSHOT for the whole sweep**, context re-set per
  tenant inside it. Under READ COMMITTED a bill committing mid-sweep is counted
  by one check and not the next — a violation that is not a violation, in a
  window too narrow to reproduce. Same reasoning as `reports.py`; a reconciler is
  the last thing that should cry wolf. T0 then asserts per tenant that the
  context actually moved, since a missed `set_config` would otherwise print 46
  greens for one tenant read 46 times.
- **Exit 1 and exit 2 are different news.** "The money is wrong" and "nobody
  looked" must never share a code; a checker that returns 1 for an unreachable
  database will one day be believed. Both are proven by injection.
- **DUPLICATE ARITHMETIC, NEVER DUPLICATE A CONVENTION.** T2 recomputes
  `round(net × price, 2)` in Postgres NUMERIC — an implementation independent of
  the `Decimal.quantize` in `_line_amount`, so it can disagree with a bug there.
  T7 IMPORTS `_be_year`. A second `+543` would be a copy of a choice, not a
  second computation of a fact, and copies drift at the boundary neither author
  tested. See `lessons/a-checker-must-not-share-the-code-it-checks.md`.
- **No names are printed, only ids, codes and doc_nos.** Tenant, seller and
  product names are Thai and this box's console is codepage 874. A report whose
  reader cannot tell a rendering artefact from corrupt data is worse than one
  with a column missing.
- **"What this checker CANNOT see" is PRINTED on every run**, not filed in a
  document. Eight items, including bills still on a phone, anything the schema
  would have rejected anyway, any value that was wrong when written, and the
  fact that doc_no order legitimately does NOT match arrival order (the counter
  is taken under a row lock, later than transaction-start `now()`).

**Deliberately NOT built:** no endpoint, no scheduling, no UI, no `--json`, no
suppression list, no auto-repair. The checker refuses to fix anything and says
so in its own failure line.

**One check is UNPROVEN BY EXECUTION and labelled as such.** S4 asserts
`recycle_app` is NOSUPERUSER + NOBYPASSRLS. The only way to make it fire is
`ALTER ROLE recycle_app BYPASSRLS`, and **roles are CLUSTER-WIDE** — the live
database shares the cluster with the copy, so the injection would disable tenant
isolation on real money data while it ran, and leave it disabled if the harness
died. `ALTER TABLE … DISABLE ROW LEVEL SECURITY`, one line above it in the same
list, is database-scoped and safe. The harness scans every injection's SQL for
`ROLE` statements and refuses them, so the reason cannot decay into a comment.

## Earlier phases

**A1 — daily money view, mobile screen. UI only, no server changes. HEADLESS
GREEN, DEVICE-UNVERIFIED.** *(That headline was true when A1 closed and is kept
as the phase's own record. It expired on 2026-08-06: R2 drew the 403 rendering
on a handset and staged the hung socket, so this screen is no longer
device-unverified. Every "STILL UNVERIFIED ON DEVICE" claim below is scoped to
A1's own closing state — see Current phase for what is true now.)* The endpoint
has had no caller but `curl` since it
landed; this is the screen that consumes it, and the first screen in the app built
for the OWNER rather than the yard.

All rendering is pure functions in `mobile/src/reports/dailyView.ts`, proven by
`mobile/src/proof/proveDaily.ts` (`npm run prove:daily`, 11 report shapes + 13
non-report outcomes, green twice). `app/DailyScreen.tsx` is presentation only and
decides nothing; `app/api.ts`'s `fetchDailyReport` is transport only and attaches
no meaning. Same split, same reason, as `billNotice` / `statusNotice`: files under
`app/` are unreachable by the proofs.

Decisions made, each argued in the module docstring:

- **Money is the server's STRING, byte for byte** — no parse, no `toFixed`, no
  grouping, no currency formatter anywhere on the path. `readMoney` REFUSES a JSON
  number outright rather than rendering whatever a double rounded to. Proven with
  values a double cannot hold. **NO THOUSANDS SEPARATORS**, deliberately: grouping
  means splitting the string, which is one edit from splitting it into numbers.
  `128400.00` is genuinely harder to read than `128,400.00` and **that is the
  owner's call to make** — it can be added later in ONE place as a pure string
  regroup with a proof that the digits are unchanged.
- **The understatement warning is UNCONDITIONAL**, inside the headline card, in
  informational blue — not amber, not red. It is true on every trading day, and a
  caveat dressed as a fault is one nobody reads by Friday. It does NOT read
  `completeness.understatement_possible`: that field is a constant `true` by
  construction today, and a client that went silent the day a future server
  computed it would be trusting a guarantee it cannot check.
- **The day-boundary consequence is on the screen**, with the concrete times
  (23:50 weighed / 00:05 synced → tomorrow), permanently, next to the number.
- **The client owns the sentences; the server owns the facts.** `basis.
  consequence_th` and `understatement_reason_th` are deliberately NOT echoed. The
  client keys on `basis.aggregated_on` instead and FLAGS a basis it does not
  recognise — echoing prose would print a confident sentence about a total
  computed some other way.
- **An unreachable server cannot render as a zero day.** The message screens have
  no money field at all, so the leak is unrepresentable rather than guarded.
- **`forbiddenReason` now takes a REQUIRED action** (`"void_bill"` /
  `"daily_report"`). The server answers `admin_required` for every admin path, so
  the old wording would have told a staff account opening the takings that a bill
  had not been cancelled. See the 2d amendment to
  `lessons/correct-classification-can-still-render-as-an-error.md`.
- **`shopWallClock` now trims sub-millisecond digits before parsing.** Postgres
  gives six fractional digits, the ECMAScript date format specifies three, and
  Hermes is unverified. This is the first screen ever to render a SERVER-produced
  instant. See the 2d amendment to
  `lessons/render-in-shop-time-not-device-time.md`.
- **Past days: ‹ ก่อนหน้า / ถัดไป › steppers, no calendar.** Stepping is cheap —
  one subtraction from an instant the server already sent — and is bounded FORWARD
  by the server's own `shop_today`, never by this handset's clock. A full date
  picker is NOT built: there is no date-picker dependency in this app, and adding
  one is not "cheap" in the sense the phase asked for.

**DEVICE PASS 2026-08-02, real iPhone, admin account — four of five steps
correct, and the fifth could not be run at all.** What was exercised:

- the phone reached the API and the screen opened;
- **the day rendered as admin** — the total, the understatement caveat, the
  voids, off-list and the bill list. This settles the microsecond question:
  timestamps rendered as clock times, NOT as the `—` an unparseable instant
  produces, so `shopWallClock`'s trim works under Hermes on a real handset;
- **day stepping** — back to an earlier day, and ถัดไป absent on today;
- **the offline path** — the network killed mid-screen said it could not reach
  the server and showed no number.

**STILL UNVERIFIED ON DEVICE: the 403 rendering on this screen.** It could not be
exercised, and the reason is itself a finding rather than a missed step:
`expo-secure-store` keeps the token in the iOS **Keychain**, which survives
deleting Expo Go — so the app went on using the ADMIN token and never attempted a
staff session at all. Note what this means: `app/config.ts` DEMO **was** switched
to the staff account and it changed nothing, because those credentials are only
read by `signIn()`, and a device holding a restored token never calls it.
Confirmed from the uvicorn log rather than from the screen:
every request from the phone (`.249`) returned **200**, while `curl` with a real
staff token from the box (`.238`) returned **403** `kind=forbidden`
`code=admin_required` `actual_role=staff`.

So **the server gate holds and is observed**; what remains unproven is only what
this screen DRAWS when it meets that refusal. That path is proven headless
(`prove:daily` D5) and proven end-to-end against the live API for the VOID path
(`prove:forbidden` F6), but not for this screen on a device.

The token that could not be discarded is now recorded as a blocker in its own
right — see **no sign-out** under "Blocking one real shop". It is a security item,
not a testing inconvenience.

**Daily money view — complete, server only, no UI.** `GET /reports/daily`
is the number an owner balances the cash box against at closing; until it
existed there was psql or nothing. Admin only, tenant-scoped through the
existing `tenant_connection` path with no hand-written `WHERE tenant_id`.
`server/app/reports.py`, proven by `server/scripts/prove_daily_report.py`
(63 checks, green twice in a row, no reseed).

Decisions made, each argued in the module docstring rather than assumed:

- **The day is `server_received_at` converted to shop time**, half-open
  `[00:00+07, next 00:00+07)`. Never `device_created_at`. The response
  carries the consequence in English AND Thai so the owner is TOLD rather
  than discovers it: **a bill weighed at 23:50 and synced at 00:05 counts
  in the next day.**
- **The server decides "today"**, from `now()` inside the request
  transaction — the same clock that stamps `server_received_at`. A client
  MAY name a past day; a FUTURE day is refused 422 `day_in_the_future`,
  because that is the one wrong-clock case that would otherwise return a
  believable "the shop took nothing today". Every response labels the day
  and ships `server_now`, so a client can compute its own skew.
- **Off-list payments surfaced** — `unit_price <> list_price`, exact
  NUMERIC, per bill and per line, plus `off_list_variance` (paid minus
  what the list would have cost, over active bills only).
- **Admin only.** The day's takings, the void detail and the off-list
  signal are the owner's numbers, and the asymmetry decides it: opening it
  later is one role change, closing it after every phone has shown the
  day's cash is not. NOTE it is defence in depth, not a confidentiality
  boundary — a staff token can already read `GET /bills` tenant-wide and
  `GET /bills/{id}` (which returns both prices), so the numbers are
  derivable today. **Whether `GET /bills` should be tenant-wide for staff
  is the OWNER's question and is deliberately left open.**
- **The honest gap is a CONSTANT, not a computed field.**
  `completeness.understatement_possible` is always `true`: there is no
  device registry, no heartbeat and no device column, so the server has no
  evidence with which to ever say otherwise, and a field that computed
  `false` would be inventing a guarantee. `quiet_for_seconds` is offered
  as the nearest signal and explicitly labelled NOT a sync check — an idle
  yard and a disconnected phone are indistinguishable from here.
- **Size: the money is never paged.** Every total, count and doc_no range
  is a SQL aggregate over the whole day, computed independently of the
  line list, so a truncated list cannot produce a short total *by
  construction*. Lines page at 200 (max 500); the void lists are capped at
  500 and NOT paged, because truncating the fraud-surveillance list is
  precisely the wrong thing to truncate.
- **Two void questions, not one.** `voided` = bills received this day that
  are now void (the reconciliation set). `voids_applied` = voids performed
  this day whatever day the bill belongs to (the surveillance set), each
  flagged `from_earlier_day`. Without the second, a bill from last Tuesday
  voided today appears in NO day anyone opens — that is the unwatched
  void, and it is the one that costs money.

**Needs a migration, NOT added (stopped here as instructed):** an index
`(tenant_id, server_received_at)` on `purchase_bills`. The day predicate
has none — 0001 gives only `(tenant_id, id)` and `(tenant_id, doc_no)`.
At one shop's volume this is a sequential scan over a small table and is
fine; it stops being fine after a year or two of real trade. Nothing else
in the endpoint needs a schema change.

**Known limit, unfixed:** a malformed `date` (e.g. `2026-13-40`) returns
FastAPI's own 422 shape, not the `kind`/`code` vocabulary the rest of the
API uses. No client consumes this endpoint yet; recorded so it is not
re-discovered.

**OPEN DECISION — a shared proof teardown, not taken.** Proofs create bills
they can never delete (hard rule 5), and the measurement above shows only
`prove_backup_restore` leaves nothing live, because it alone voids its own
fixture. The recommendation, for the owner to accept or refuse:

- **The pattern applies** to `prove_bills`, `prove_master_write`,
  `prove_seller_pricing`, `prove_master_data_gate` and `prove_shop_time` —
  every one lands ACTIVE bills on the real current day, where they are now
  indistinguishable from trade in the daily report.
- **It does not apply to `prove_daily_report`**, which solves the same
  problem more strongly: its fixtures are quarantined on a synthetic 2019
  day, so they are invisible to every real day whether voided or not.
  Quarantine beats voiding where the proof controls the date.
- **It should be ONE shared helper**, not five teardowns. The teardown has
  two non-obvious traps already documented once in
  `prove_backup_restore.void_marker`: `ck_bills_void_consistency` requires
  all three void columns to move together, and `voided_by` must be a user
  in the SAME tenant (composite FK). Re-deriving that four more times is
  how they drift.
- **Two carve-outs the helper must not swallow.** A bill a proof
  deliberately keeps LIVE (`prove_master_write`'s `-keep`, whose whole job
  is to be an intact historical bill) must be excluded BY KEY, never by
  "whatever is left over". And voiding stamps `voided_at = now()`, which
  drops every teardown into TODAY's `voids_applied` — the
  fraud-surveillance list. Trading bill noise for void noise on the one
  list built to be watched is arguably worse; the helper should backdate
  the void to the bill's own `server_received_at`, or the dev day view
  fills with proof voids.

**Teaching the client about 403 — complete, device-verified.** The server has
been refusing staff voids since the role gate landed; the client mapped that 403
into `unavailable, reachable: true` and so treated a permission as an outage.
`forbidden` is now a FOURTH failure class on both `SendOutcome` and `VoidOutcome`
(the three older classes are all about the BILL; `session_expired` is about the
caller but its whole definition is that one tap fixes it here). Landed:

- a refused VOID is stamped `void_refused_at`/`void_refused_code`, leaves
  `listVoidsToApply`, and is **never retried** — the old mapping re-POSTed it
  every 4s forever, since that path has no backoff column at all.
- a refused SEND clears the poison columns and gates the send loop on an
  in-memory, device-global `sendForbidden`. Not persisted, deliberately.
- both are retracted by a SIGN-IN and nothing else — the one event on this device
  that can change who is asking. Known limit: a role changed mid-session is
  invisible until the next sign-in (JWT TTL is one hour).
- the card and strip say the account may not do this and name the shop OWNER —
  never support, never "sign in again", never `ผิดพลาด`. `ยกเลิกบิลนี้` is hidden
  from a staff token (read from the token's own `role` claim by a hand-written
  base64url/UTF-8 reader, since `atob`/`TextDecoder` are unverified under Hermes);
  the gate FAILS OPEN on an unreadable token and the server stays the authority.

**Found by this phase, in its own working tree:** `voidProgressLine` still
promised `จะดำเนินการให้อัตโนมัติ` two lines above a notice box saying the system
had NOT cancelled the bill — two renderers of one card, each internally correct,
each separately asserted over hundreds of green cells. `proveNotice` N2b now
asserts the CONCATENATION in draw order.
See `lessons/403-is-about-what-the-caller-may-do.md`.

**Role enforcement + master-data writes — complete EXCEPT deactivation**
(server only; no mobile, no desktop, no UI). `users.role` existed since
migration 0001 and nothing read it, so every device was effectively admin
and any yard phone could void any bill. Now:

- role travels in the JWT as ADVISORY display data, and the SERVER resolves
  it from the `users` row under tenant context on every request — so a
  demotion takes effect at once instead of surviving until the token
  expires. Proven both ways (X1).
- `admin` is required for `POST /bills/{id}/void` and for every master-data
  write. `staff` keeps login, whoami, master-data reads, bill create, bill
  list/read.
- a staff refusal is a **403** carrying `kind: "forbidden"`, distinguishable
  from 401 / 404 / 422-permanent / 424-resolvable **on status alone and on
  `kind` independently**, so the sync engine's existing classes cannot
  absorb it.
- writes: `POST`/`PATCH` for uoms, product-categories, products and sellers,
  plus `PUT /products/{id}/prices/{grade}`; new reads `GET /uoms` and
  `GET /product-categories`. All admin-only, all tenant-scoped through the
  existing RLS path — `app/master.py` contains no hand-written
  `WHERE tenant_id`, and INSERTs take tenant_id from the same GUC the policy
  reads.

**Retirement — complete, migration `0004` applied.** `is_active`
(NOT NULL DEFAULT true) on `sellers`, `products`, `uoms` and
`product_categories`; `id_number` / `address` / `vehicle_no` on `sellers`
(all nullable, SRS 1.6). On top of it:

- `POST /{entity}/{id}/deactivate` and `/activate` for all four, admin only.
  **`activate` was not asked for** and is here because deactivate without an
  undo is a trap: there is no delete either, so a mistyped retirement would
  otherwise strand the row invisible forever.
- list endpoints exclude retired rows by default; `?include_inactive=true`
  is how the back office finds one again.
- **row-level reads never filter.** `GET /bills/{id}` now resolves each
  item's `product_code` and `product_name` through a LEFT JOIN with no
  `is_active` predicate — that is what makes "the bill stays intact"
  observable through the real path rather than only in SQL. LEFT, not
  INNER, so a product that somehow went missing would blank a name rather
  than silently drop a money line and leave the header total disagreeing
  with the lines.
- a new bill against a retired seller or product is **424 resolvable**
  (`seller_inactive` / `product_inactive`), not 422. One admin click makes
  the same bill valid, and the yard has very likely already tipped the
  load — this is the revisit the old note in `bills.py` asked for if master
  data ever gained a delete. It gained a retirement instead.
- filing a NEW product under a retired category/uom is refused 422; existing
  products are untouched. Nothing cascades.

There is still **no delete route anywhere** (proven: 405).

**Found and fixed on the way, not looked for:** `bills.py`'s
idempotency-race handler had been dead code since Phase 1c — it read
`e.orig.constraint_name`, which does not exist on what SQLAlchemy's asyncpg
dialect puts in `.orig`, so the loser of a concurrent same-key submit got a
500 (= `unavailable` = a permanently jammed device queue) instead of the
winner's bill. It now re-SELECTs the key instead of matching a constraint
name. See `lessons/a-defaulted-getattr-is-a-silent-dead-branch.md`.

**Backup and restore — complete** (server-side; `server/scripts/`
only, no app changes). The money data had exactly one copy, on an
un-backed-up docker volume. It now has a dump script, a restore
script, and a round trip proven against a live database:
`backup_db.py`, `restore_db.py`, `prove_backup_restore.py`, and the
operator runbook `server/scripts/BACKUP.md`. Deliberately NOT built:
scheduling, off-site upload, retention, encryption at rest.

**2c-8 — complete.** Master data (products, sellers, prices) is
cached in SQLite and the session token is persisted, so the yard can
work from a cold start with no network. Its device pass then exposed
a clock trap — a phone 14h fast, corrected backwards, stranded the
whole head-of-line queue on a stored future `next_attempt_at` — fixed
in `436b3e9` and recorded in
`lessons/a-stored-future-instant-is-a-promise-about-a-clock.md`.

## The two-clock be_year defect — FIXED 2026-08-02, own commit

Owner-directed, immediately after A2 found it. **The fix is an ORDERING, not a
tolerance**, which was the explicit instruction and is also the only thing that
could have worked: a tolerance on "how far apart may the two clocks be" still
leaves two clocks.

**Before.** `server_received_at` was the column DEFAULT `now()` — Postgres'
TRANSACTION START. `be_year` was `_be_year(datetime.now(tz=timezone.utc))`, a
PYTHON read taken later in the same transaction, after the seller lookup and
every product and price lookup. Two clocks and two moments, a full master-data
round-trip apart.

**After.** `create_bill` reads the arrival instant ONCE, first, from the
transaction's own clock — `SELECT now()` — derives `be_year` from THAT value
through the single `_be_year` authority, and writes THAT SAME VALUE to
`server_received_at` explicitly rather than leaving it to the DEFAULT. One value,
used twice. The column default stays as a floor for any other writer.

**Why it mattered more than a wrong label:** `doc_no_counters` is keyed on
`(tenant_id, be_year)`, so a straddling bill did not merely get a wrong number —
it OPENED THE WRONG COUNTER a year early. The new year's real first bill would
then find that counter at 1 and become `B-<year>-2`, with no `B-<year>-1` ever
existing. A permanent gap in a legal document sequence, of exactly the kind
reconcile.py's T8 exists to scream about, and one nothing can go back and repair.

**Proven by `server/scripts/prove_docno_clock.py`, in both directions, on the
real `create_bill`.** It moves Python's clock across the Buddhist new year while
Postgres keeps the real one, and asserts the code is completely unmoved. It
**REFUSES to run against the live database** — a clock lie against unfixed code
mints a bill in a year that has not happened and opens a counter row for it, and
hard rule 5 means neither can be removed. Scratch copies only.

The before/after is a measurement, not an argument — the same script was run
against the unfixed code first, and both outputs are in Baseline observations.

## What is built

### `server/` — running API

- **Schema**, migrations `0001`–`0005` in `server/migrations/versions/`:
  `tenants`, `users` (role `admin`|`staff`), `uoms`,
  `product_categories`, `products`, `product_prices` (grade A–D),
  `sellers` (grade, id_number, address, vehicle_no — per SRS 1.6),
  `purchase_bills`, `purchase_bill_items`. The four master-data tables
  carry `is_active` (0004). `users.token_version` (0005) is minted into
  every token and re-read from the user row on every request — on the same
  query `get_principal` already runs to resolve the role, so it costs no
  extra round trip. **DEFAULT 1, never 0**, so a token carrying no version
  claim matches no user row: an absent claim is refused rather than read as
  a confident zero. Row-level security is FORCEd per tenant; the
  runtime role `recycle_app` is NOSUPERUSER + NOBYPASSRLS and holds
  DML only.
- **Endpoints** (`server/app/`), in THREE categories, not two. **No
  authentication at all**: `GET /health` (`main.py:105`), `POST /auth/login`
  (`main.py:119`) — read off the handlers, neither of which takes a
  principal. **Both positions were stale and were re-derived at `8b17bc2` on
  2026-08-10**; this read `:53` and `:58`, which are `await engine.dispose()`
  and a blank line. The classification above was and is correct — only the
  two numbers had rotted, which is the failure mode a position-carrying
  citation has and a symbol-carrying one does not.
  This file used to file both under "open to any signed-in
  user", which was wrong in the direction that matters: it described an
  unauthenticated surface as an authenticated one. **Any signed-in user**
  (`Depends(get_principal)`): `GET /whoami`, `GET /products`,
  `GET /sellers`, `GET /uoms`, `GET /product-categories`, `POST /bills`,
  `GET /bills`, `GET /bills/{id}`. **Admin only** (`Depends(require_admin)`):
  `POST /bills/{id}/void`,
  `POST`+`PATCH` on `/uoms`, `/product-categories`, `/products`,
  `/sellers`, `PUT /products/{id}/prices/{grade}`, and
  `POST /{entity}/{id}/deactivate`+`/activate` on all four,
  `GET /reports/daily`, and `POST /users/{user_id}/revoke-sessions`
  (`users.py:56`) — which its own docstring labels a STOPGAP: it ends live
  SESSIONS and does NOT lock the account, because `users` has no
  `is_active` column, so the user can sign in again the same second and
  receive a fresh token carrying the new version. Every request
  is scoped to its token's tenant with `SET LOCAL` inside the request
  transaction. `code` is immutable after create on every entity — it is
  what a historical bill is read against.
- **Reconciliation** — `reconcile.py`, the one instrument that checks the
  money against itself rather than exercising a path. Not a proof: it makes
  no fixtures, writes nothing, and is meant to be run against a REAL
  database, including a restored copy (`--database`). 17 checks per tenant
  (totals, line arithmetic, weights, the doc_no series and its counter,
  reference resolution, the void columns, idempotency keys, line numbering)
  plus 10 global (schema shape, RLS enabled/forced/policy, role attributes,
  named constraints, two blind reads, cross-tenant references, sweep
  completeness, and whether the database moved while it ran). Exit 0 / 1 /
  2 = clean / violations / could-not-run. Runbook is its own `--help` and
  module docstring.
- **Proofs** — THIRTEEN scripts in `server/scripts/`, each exercising a
  real path against a live database: `prove_rls`, `prove_auth`,
  `prove_master`, `prove_bills`, `prove_master_data_gate`,
  `prove_shop_time`, `prove_seller_pricing`, `prove_backup_restore`,
  `prove_master_write`, `prove_daily_report`, `prove_reconcile`,
  `prove_docno_clock`, `prove_revocation`. **Two now require a SCRATCH DATABASE and refuse the live
  one**: `prove_reconcile` (it breaks invariants on purpose) and
  `prove_docno_clock` (it lies to the server about the time, which against
  unfixed code permanently corrupts a doc_no series). Both take `--database`.
  `prove_reconcile` is the odd one out: it can restore a COPY (calling
  `restore_db.py` itself, so that run starts from a known dump), breaks
  each invariant on purpose, and asserts the checker fires, NAMES the row,
  and clears again when the injection is undone. Each must pass twice in a row without
  reseeding (`lessons/proof-must-run-twice.md`). `seed_dev.py` loads
  the dev fixture — now an `admin` AND a `staff` user per tenant, since
  a role gate cannot be proven without a token that gets refused.
  **CORRECTED 2026-08-09 — the `prove_reconcile` sentence above read "so every
  run starts from the same dump" and that was FALSE.** Established from the
  source and not from a run: `restore_copy()` has exactly ONE call site and it
  sits inside `if args.backup:`, so the restore happens only on a run given
  `--from`. `--skip-restore` is the documented alternative, and the argument
  check refuses only when NEITHER flag is passed. A `--skip-restore` run never
  calls `restore_db.py`, SKIPs the diagnosis claim rather than passing it
  (`normalise(..., restored=False)`), and can still return 0 through the
  `PROVE_RECONCILE OK, WITH SKIPS` branch — so a full two-consecutive-run pass
  is completable with the copy never restored from a dump at all. The owner
  had observed such a run; the prose was the thing that was wrong. This
  matters beyond tidiness: the 0009 blast-radius claim in `OPEN_ITEMS.md`
  names this script, and that red can only reach a `--from` run.
- **Backup** — `backup_db.py` writes plain `globals.sql` /
  `database.sql` / `recycle.sql` + manifests + sha256 to a host path
  outside the docker volume; `restore_db.py` restores into a scratch
  database by default and refuses to touch an existing live one
  without `--overwrite-live`. Runbook: `server/scripts/BACKUP.md`.
  `prove_backup_restore.py` mutates the source AFTER the dump, so a
  restore that did nothing cannot pass.
- **Local runtime**: Postgres 16 via `server/docker-compose.yml`,
  container `recycle_pg`, host port `5544`. `JWT_SECRET` has no
  default and the API will not start without one.

### `mobile/` — Expo app, offline-first

One npm package on purpose; nesting a second one breaks Metro's file
map (`lessons/metro-file-map-nesting.md`). Two disjoint TypeScript
programs — see the boot check in CLAUDE.md.

- **Sync engine** (`src/sync/`): local-first writes, per-record
  pending / synced / failed, a strict head-of-line send queue, and
  three-way failure classification — unavailable (retry forever),
  permanent (terminal), resolvable (parked, still owed). Queue-health
  alarm distinguishes an offline backlog from a poisoned head;
  startup recovery sweeps records stranded mid-flight; an expired
  session is its own state, not a bill failure; stored future
  instants are treated as clock evidence, not data.
- **Storage** (`src/adapters/sqlite/`): bills store, crash-safe draft
  store, master-data cache store, shared driver and mutex, schema.
  Money and weight are TEXT — the guarantee is the TypeScript type,
  not the column (`lessons/sqlite-money-is-text.md`).
- **Device-only code** (`src/device/`): the expo-sqlite driver and
  the SecureStore token store. Neither can run under node — see the
  device gaps below.
- **Money and time**: `decimal.js` with precision set for the domain
  scale; one shop-time formatter (fixed UTC+7) with the พ.ศ. year
  derived after the timezone conversion; clock-sanity checks on
  stored stamps.
- **Screens** (`App.tsx`, `app/`): ~~login,~~ cart entry with numpad,
  per-bill seller picker, master-data strip with freshness state,
  status strip and operator notices, bills panel with the void flow,
  and the sign-out sheet (`app/SignOutSheet.tsx`), which can REFUSE —
  it will not end a session while bills are still queued unsent.

  **~~login~~ — NOT A SCREEN. Struck 2026-08-11, measured at
  `5e59894`.** With no token `App.tsx` renders one button, labelled
  `เข้าสู่ระบบ (ร้าน A)`, calling `signIn()` with constants imported from
  `app/config.ts`. It asks for nothing — `TextInput` appears in
  `App.tsx` **0 times**. This file already said so, dated:
  `§ 2026-08-07 — migration 0006 (server + proof)` "has no `TextInput`".
  The struck word entered at `534f289` (2026-07-27), the commit that
  created this file; whether it was true then is not measured here.

  **REINSTATED 2026-08-12 — LOGIN IS A SCREEN AGAIN. The strike above is left
  exactly as taken, because it was true at `5e59894`.**
  `mobile/app/LoginScreen.tsx` landed at `4bde6e1` with username and password
  fields; the shop is an eight-character code typed once at setup and resolved
  BY THE SERVER, and `app/config.ts` now holds only the server URL.
  **OBSERVED ON A HANDSET:** after a real sign-out and a cold start it drew the
  username and password state, and nobody was asked for a shop code. **The
  artefact is a TEST artefact** — this project's own Android DEBUG build
  (`9d2eb22`, `dev.chutipon.recycle`), one vivo 1938, never Expo Go, its API
  address a plain-HTTP LAN address baked in at build time. **NOT OBSERVED:**
  nobody signed in through it to reach the cart screen and nothing was weighed,
  the product and seller lists being empty on that tenant; iOS has never drawn
  it; and no release build exists on either platform.
- **The owner's screen** (`app/DailyScreen.tsx`, `src/reports/dailyView.ts`):
  the day's total, the permanent understatement caveat, voided bills, voids
  applied today against older bills, off-list payments, and the bill list. Read
  only; needs the server; renders calmly when it cannot have one.
- **Proofs**: FOURTEEN headless `npm run prove:*` scripts —
  `sync`, `sqlite`, `money`, `cart`, `entry`, `seller`, `notice`,
  `void`, `time`, `cold`, `clock`, `daily`, `forbidden`, `signout`.
  `prove:signout` (`src/proof/proveSignOut.ts`) covers the refusal path,
  the cleared-session list and the draft that must SURVIVE a sign-out.
  `prove:forbidden` is the
  first mobile proof that REQUIRES the live API: its F6 logs in as the
  seeded staff user and reads the server's actual 403 through the real
  `HttpTransport`. `--offline` skips that case and exits **2**, never 0.

### `desktop/` — not started

Empty but for `.gitkeep`. No Electron scaffold, no printing code.

## What is NOT built

**Out of MVP — do not build, do not scaffold** (moved verbatim from
CLAUDE.md, where it used to live as "MVP scope"):

sell flow, stock, other income/expense, checkbox permissions,
employee master, buyers, profile images, QR codes, scale
integration, Excel export, reports.

**In the product, not yet started**: the entire `desktop/` back
office — master-data editing, bill viewing, ESC/POS thermal slips
(58/80mm). When the slip is built it must PORT `mobile/src/time/
shopTime.ts` (offset constant, brand, ordering rule), not re-derive
`+ 543` in Electron; a second implementation drifts exactly at the
boundary neither author tested.

**Blocking one real shop** (from audit 2). This is NOT a scope list —
it is the gap between "built" and "usable by one paying yard". Every
item below is missing infrastructure around work that already exists,
not a new feature:

- **A reachable server.** The API runs on this box and the app points
  at a LAN address (`mobile/app.json` `extra.apiBaseUrl`). A shop
  needs a host it can reach from anywhere. (The backup half of this
  item is done — see Backup above — but a local-only backup does not
  survive fire, theft or ransomware, and NOTHING SCHEDULES IT. Until
  someone runs it, the honest statement is still "one copy".)
- **An installable build.** Staff need the app on their own phone,
  not Expo served from a development machine.
- **Real per-shop login.** Accounts and credentials the shop owns,
  created for it — not the dev fixture from `seed_dev.py`.
- **SIGN-OUT — CLOSED by R1, 2026-08-06** (`19a6b63` server half, `7484645`
  client half). This item read **"NO SIGN-OUT. A shop cannot change who the
  phone is logged in as."** — **a SECURITY item, not a convenience one.**
  Written here as "A3" before the numbering was settled; A3 was never opened
  and the work became **R1 in `ROADMAP.md`** — the first step, because it was
  blocked by nothing and two other steps waited on it.

  **What now exists.** A phone can end its session deliberately
  (`app/SignOutSheet.tsx`, `src/session/signOut.ts`), and the server can refuse
  a token it already issued: `users.token_version` (migration 0005) is minted
  into every token and re-read from the user row on every request, so bumping
  it through `POST /users/{user_id}/revoke-sessions` stops every token issued
  before the bump at that token's next request. Both halves have been observed
  on a real handset — see Current phase and the 2026-08-06 device pass in
  Baseline observations.

  **The diagnosis that made it first, kept as the record.** Read out of the
  files rather than assumed, at the time: `TokenStore.clear()` EXISTED and
  `SecureTokenStore` implemented it (`SecureStore.deleteItemAsync`), and
  **nothing called it** — `App.tsx` called `load()` at boot and `save()` on
  sign-in and that was all; there was no sign-out button, no menu, no path of
  any kind. `expo-secure-store` puts the token in the iOS **Keychain**, which
  survives deleting Expo Go, so reinstalling the app did not clear it either.
  **That last fact is unchanged by R1** and is still why a handset holds what
  it holds; what changed is that something now calls `clear()`, and that the
  server no longer has to take the token's word for it.

  The exposure was bounded, and the bound is kept here because it is what made
  this a defect rather than a catastrophe: `JWT_TTL_SECONDS` defaults to 3600
  and there is no refresh token, so an issued token stopped being accepted
  within the hour anyway. What was missing was any way to end a session
  **deliberately, at the moment someone leaves** — and any way to end it from
  the server side at all. **Both of those now exist.**

  **What R1 did NOT fix**, written so that "closed" is not read as more than it
  is: `users` still has no `is_active` column, so a revocation ends live
  SESSIONS without locking the ACCOUNT — the user can sign in again the same
  second and receive a fresh token carrying the new version. That is right for
  a handover and wrong for a dismissal, and there is currently no way to
  express the second. The revocation endpoint says so in its own docstring and
  calls itself a stopgap.

  **CORRECTED 2026-08-05.** This paragraph used to end by saying that bills
  written on a handed-over phone are "attributed in `purchase_bills` to the person
  who left", and that this was the audit trail naming the wrong person. **That was
  false, and it had never been read out of the schema.** `purchase_bills` has NO
  AUTHOR COLUMN: `grep -rn "created_by" server/` returns nothing, and the INSERT at
  `server/app/bills.py:450-453` writes id, tenant_id, seller_id, doc_no,
  idempotency_key, total_amount, device_created_at, server_received_at and
  vehicle_no — no user of any kind. The only user recorded on a bill is
  `voided_by`, written from the requesting token when a bill is VOIDED
  (`bills.py:602`). So the audit trail does not name the wrong person; **there is
  no name on it to read at all.** A bill cannot be traced to the staff member who
  weighed the load and handed over the cash, and that is **not repairable
  backwards** — every bill already written stays authorless forever, whatever is
  added later. It is tracked as its own item in `OPEN_ITEMS.md`, as a SCHEMA and
  audit question; it is **not** part of R1 and adding the column would not make one
  existing bill traceable.

  **THIS PREDICTION WAS RIGHT, AND R1 DID BOTH HALVES** — `19a6b63` (server:
  `token_version`, migration 0005, `prove_revocation.py`) and `7484645`
  (client: the sheet, the cleared-session list, `proveSignOut.ts`). The
  text below is kept UNEDITED because a correct prediction is evidence
  that the ordering decision was sound, and because deleting it would leave
  the decision looking arbitrary in hindsight. It argued that a client-only
  sign-out would be a false fix and that the server half was the hard half;
  both held.

  **The client half is nearly free and the server half is not**, which is exactly
  why it must not be done by halves: a sign-out button is one existing method
  wired to one button, and it would make the problem look dealt with while an
  already-minted token stayed valid for up to an hour with nothing able to refuse
  it. The server side needs a way to reject an issued token before its expiry —
  e.g. a token version on `users`, bumped on password change or deactivation and
  checked in `get_principal`, which already re-reads the role on every request.

  Found by the A1 device pass, where it presented as a testing obstacle: the app
  would not take a staff session no matter what `app/config.ts` said, because
  those credentials are only read by `signIn()` and a device holding a restored
  token never calls it. That is the same mechanism wearing a friendlier face, and
  it is why A1's 403 rendering is still unverified on device.

  Deliberately NOT fixed in A1, which was UI-only on an existing endpoint.

  **One sentence in the text above has since expired, and is marked rather than
  edited:** "it is why A1's 403 rendering is still unverified on device" was
  true when written and stopped being true on **2026-08-06**, when R1 made a
  staff session possible on that handset and the 403 rendering was drawn under
  it. That is R2 item 1; see Baseline observations. The mechanism the sentence
  describes is still correctly described — it is the CONSEQUENCE that lifted.
- **A back office to drive any of it.** The whole master-data write path
  now exists and is proven over HTTP, but the only thing that can call it
  is `curl`. `desktop/` is still empty, and the yard app is deliberately
  read-only for master data — so a shop still cannot set up its own
  products, prices or sellers without someone running requests by hand.
- **A daily money view — the server half AND a mobile screen now exist**
  (`GET /reports/daily`; `app/DailyScreen.tsx`). An owner can open it on a
  phone. **No longer device-unverified: R2 closed it on 2026-08-06**, admin
  rendering having been observed on 2026-08-02 and the two remaining paths —
  the 403 refusal and a hung socket — on 2026-08-06. The two are not equally
  strong evidence and Known device gaps says which is which. What remains is
  that the desktop back office still has no version of it — a shop owner who
  works from a PC still cannot see the day's takings there.

## Known device gaps

Everything here is unverified, not broken. It is listed so no one
reports it as proven.

- **Android: ONE pass, 2026-07-29, on a borrowed handset.** No longer
  "never run", and nowhere near covered. What was actually exercised:
  the bundle built and opened; Thai rendered correctly with NO bundled
  font; the real `expo-sqlite` driver created the schema fresh on a
  device that had never held the database; a bill was weighed, saved
  and synced; the numpad kept the OS keyboard off the numeric path;
  the void-REASON input's keyboard behaved; safe-area insets were
  correct. Plus, from the multi-device run below: one bill saved
  offline and synced on reconnect.

  What was NOT run on Android, and must not be reported as working:
  the rest of the offline behaviour (queue-health amber/red, backoff,
  parked bills, expired session, the poison alarm), force-quit draft
  recovery, the stale-cache price gate, the VOID FLOW end to end —
  including the 403 refusal path this phase built, which has only ever
  been seen on iOS — and sync while backgrounded. One handset, one
  OS version, one screen size.

  **A SECOND ANDROID PASS, 2026-08-12 — and it closes none of the list
  above.** The bullet's opening count is now two, not one; the rest of it
  stands. **The artefact was a TEST artefact:** this project's own Android
  DEBUG build (`9d2eb22`, applicationId `dev.chutipon.recycle`), a second
  handset, a vivo 1938, never Expo Go, its API address a plain-HTTP LAN
  address baked in at build time, so it reaches a server only on this
  network. **WHAT IT OBSERVED:** the login screen drawn after a real
  sign-out and a cold start; a session established and cleared, read at
  `shared_prefs/SecureStore.xml` (count 1 signed in, count 0 after) and at
  a new process; and the migration force-stopped twice mid-transaction
  with the complete old shape surviving both times, controls both ways.
  **WHAT IT DID NOT:** nobody signed in through that screen to reach the
  cart screen and nothing was weighed — the product and seller lists were
  empty on that tenant — so the void flow, the offline behaviours, draft
  recovery, the stale-cache price gate and background sync are untouched
  and remain exactly as listed above. **iOS ran the secure store's clear
  in the 2026-08-06 pass and has never run the migration**, and **no
  release build exists on either platform.**
- **Two devices RACING is still unproven on real hardware.** Two phones
  writing to one tenant is now observed (below), but they reconnected
  158 ms apart. That is "near-simultaneous", not "inside the same
  millisecond", and only the second is a race. The concurrent
  same-key/same-counter path remains proven only headless, with a start
  barrier and printed overlap (Phase 1c; see
  `lessons/concurrency-tests-need-a-barrier.md` — without a barrier the
  workers ran sequentially and a green result proved nothing).
- **`src/device/expoSqliteDriver.ts` has no headless proof.** It
  cannot run under node (ESM with extensionless specifiers that only
  Metro resolves, plus `requireNativeModule('ExpoSQLite')`), so it is
  exercised only by manual device passes. Its transaction path
  genuinely differs from the node driver: expo-sqlite's
  `withExclusiveTransactionAsync` hands the callback its OWN
  connection, so isolation comes from SQLite's file write-lock plus
  `busy_timeout`, not the JS mutex. That `changes` is reported
  honestly is an assumption the store methods rest on.
  **The Android pass does not touch this**, and the distinction is the
  whole point: a bill weighing, saving and SYNCING exercises single
  statements, which is every method in `SqliteLocalStore`. The multi-
  statement path is `promoteToBill` (insert the bill and clear the
  draft, indivisibly), and what is unverified there is its CRASH
  WINDOW — kill the process mid-transaction and see that exactly one of
  {draft, bill} survives. That is proven under `node:sqlite` only
  (`proveCart` C5, both sides of the commit, with a real SIGKILL). A
  successful save says nothing about it.
  **NARROWED 2026-08-12, and read the narrowing precisely — it is smaller
  than it looks.** The driver's `transaction()` MECHANISM has now been
  killed mid-flight on real hardware and held: Android only, on this
  project's own DEBUG build (`9d2eb22`, `dev.chutipon.recycle`), one
  vivo 1938, never Expo Go; two force-stops inside a migration window
  widened to tens of seconds by a 150,000-row seed, complete old shape
  both times, rows intact, controls both ways. **What that covers is
  `initConnection`. It does NOT cover `promoteToBill`**, which is a
  different call site with a different failure question — exactly one of
  {draft, bill} — and which no device pass has ever killed. The bullet
  above stands unchanged for that path. **iOS has never run either, and
  no release build exists.** `changes` being reported honestly was not
  isolated by that pass either.
- **`src/device/secureTokenStore.ts`**: that SecureStore honours the
  contract is unverified off-device. **NARROWED, not closed, 2026-08-06.**
  The R1b pass exercised `clear()` on a real handset and the Keychain really
  did clear — after signing out the screen read `ยังไม่ได้เข้าสู่ระบบ`, which
  is different wording from `หมดเวลาเข้าใช้งาน`, so the two states are
  distinguishable ON THE DEVICE and not only in the proof. What that settles
  is `save`/`load`/`clear` on the happy path of one iOS version. It says
  nothing about the store's behaviour when the Keychain itself refuses — a
  locked device, a restore from backup, or a `deleteItemAsync` that throws —
  and those remain unverified off-device.
  **NARROWED AGAIN 2026-08-12 — ANDROID, and with evidence of a kind the iOS
  pass did not have.** On this project's own DEBUG build (`9d2eb22`,
  applicationId `dev.chutipon.recycle`), one vivo 1938, **never through Expo
  Go** — Expo Go is a third party's release-signed package and refuses
  `run-as`, so it could not have produced any of this. Two readings the 2026-08-06
  pass never took. AT THE STORE: `shared_prefs/SecureStore.xml` held the entry
  `key_v1-recycle.session.token` with count **1** while signed in, and count
  **0** after the sign-out — the file still present, 840 bytes down to 65, zero
  entries, which is a different and stronger outcome than the file being gone.
  AT A NEW PROCESS: force-stop, cold start, and `App.tsx:606`'s `load()`
  returned null and drew the login screen — the exact observable
  `src/session/tokenStore.ts` names as the failure it is guarding against.
  Method controlled in the same run: a key known to be absent counted 0, and a
  string known to be present counted 1, on the same file.
  **STILL UNVERIFIED, and this is the whole of what is left**: the REFUSING
  keystore, on either platform — no real store has ever been made to fail, so
  the `failed` branch is still a contract; `AFTER_FIRST_UNLOCK` on a device not
  unlocked since power-on; and **NO RELEASE BUILD EXISTS on either platform**,
  so `run-as` would not work on a shop's artefact and this reading method does
  not transfer to it.
- **The daily money screen: TWO passes — 2026-08-02 (real iPhone, ADMIN) and
  2026-08-06 (real iPhone, STAFF; R2).** Rendering, day stepping and the
  offline path were observed on the first (see Previous phase). What that pass
  settled, worth naming because each was listed as a risk before
  it: `new Date()` on a SIX-DIGIT fractional-second ISO string with a `+07:00`
  offset parses under Hermes (times rendered, not `—`), and the 44pt
  `adjustsFontSizeToFit` amount is readable at a real width.

  **R2 item 1 — the 403 rendering. CLOSED on strong evidence.** Drawn on a
  device for the first time, under a staff account: `GET /reports/daily` from
  the handset was answered 403, and the screen showed a red card with **no
  money field anywhere on it** — not a zero, not a dash. **The tie between the
  log line and the screenshot is by SOURCE ADDRESS AND UNIQUENESS, not by
  clock** — it is the only 403 in the log and it came from the phone's address
  rather than from curl on the box; the uvicorn lines carry no timestamps.
  Full record in Baseline observations.

  **R2 item 2 — a hung socket. CLOSED on the roadmap's wording ("has been
  staged"), and WEAKER than the item's name suggests.** Read this one
  carefully. **What IS established:** a socket that completes the TCP accept
  and then never answers ends in the no-number outage screen rather than a
  `0.00` day. **What is NOT established:** that it ended at the 20 s ceiling
  specifically, rather than at some other transport failure. The duration was
  WATCHED on an operator's stopwatch, not measured, and this is the same
  screen a REFUSED connection would produce. The staged socket is not uvicorn,
  so the log contains no line for it; that absence is expected and is evidence
  of nothing. Treat the ceiling itself as unverified.

  What the two passes did NOT touch, and must not be reported as working:
  - **a truncated day** — `bills_truncated`, the capped void list, and the
    off-list "count outruns the page" note are proven headless only. Reaching them
    needs a day of >200 bills.
  - **a past day with real trade in it**, and **the 422 `day_in_the_future` path**,
    which day stepping is deliberately bounded to avoid.
  - **Android.** The whole screen is iOS-only so far.
- **Hermes `Intl` with a `timeZone` option is unverified.** This is
  why shop time is a fixed UTC+7 offset on both sides rather than a
  named zone: a silently-ignored `timeZone` would print UTC again.
  A per-tenant zone that observes daylight saving cannot be a fixed
  offset and must be verified on a device before it ships.
- **Hermes `crypto.randomUUID` and property escapes** are unverified
  (noted in `src/sync/types.ts` and `src/cart/sellers.ts`).
- **Python `zoneinfo` cannot resolve `Asia/Bangkok` on this box** —
  Windows ships no IANA database and `tzdata` is not installed, so
  `app/config.py` uses a named fixed offset. Installing `tzdata` is
  a prerequisite for any future per-tenant timezone work.

## Known scaling limits

Measured or reasoned, not yet hit. Recorded so they are not rediscovered as
mysteries — and so nobody "optimises" them before they matter.

- **No index for the daily report's day predicate.** `GET /reports/daily`
  filters `purchase_bills` on `(tenant_id, server_received_at)`. Migration
  0001 gives that table only `(tenant_id, id)` and a partial
  `(tenant_id, doc_no)`, so **every daily report is a sequential scan** over
  the tenant's whole bill history, and it gets one row slower per bill
  bought — forever. At one shop's current volume (301 bills in the dev
  tenant) this is not measurable and **must not be fixed yet**: an index is
  a write cost on the hot path (`POST /bills`) paid to speed up a report
  nobody has opened, and the endpoint has no UI. It becomes real at roughly
  a year of trade, or the first time a shop reports the day view feeling
  slow. **The fix, when wanted, is one migration:**
  `CREATE INDEX ix_bills_tenant_received ON purchase_bills (tenant_id, server_received_at)`.
  Deliberately NOT added this phase. Nothing else in `reports.py` needs a
  schema change.
- **`reconcile.py` holds one tenant's numbered bills in memory at a time.**
  T7/T8/T9 need every `doc_no` for the tenant, because the BE year must come
  from `bills._be_year` per row rather than from a second `+543` written in SQL
  (that is the point, not an oversight — see the lesson). Bounded by ONE shop's
  history, not by the whole database, and 305 bills cost 0.9s for the entire
  46-tenant sweep. At the size where this stops being sensible the fix is
  recorded in the function's own docstring: make them per-`be_year` aggregates
  and apply `_be_year` to the year boundaries instead of to each row. Note the
  sweep also holds one REPEATABLE READ snapshot open for its duration — a
  vacuum consideration on a large database, never a correctness one.
- **The void lists are capped, not paged** (500, with a `truncated` flag).
  A day that reaches the cap is itself the finding; paging the
  fraud-surveillance list is the wrong thing to page.

## Tuned constants — trial ledger

**THE RULE. Once a real shop is using this, any change to a value in this table
is a TRIAL and gets a row — old value, new value, date, and what was observed
that prompted it. The COUNT matters, not just the final value.** A threshold
nudged until the complaints stop is a threshold fitted to noise: each nudge looks
like a fix because the thing being measured is somebody's patience, and after
four rounds nobody can say whether the number is right or merely quiet. A value
on its first trial is a guess and should be read as one; a value on its fifth
without a written reason each time is worse than the guess, because it has
acquired authority it never earned.

Every row below is at **trial 1 — chosen once, by judgement, never re-tuned.**
Verified with `git log -S` per constant rather than asserted: each appears in
exactly one commit (`}, 4000)` shows two, and the second is a refactor that moved
the line without changing the number).

These are the values chosen by JUDGEMENT. Values DERIVED from something else are
excluded and listed at the foot, so the next sweep does not re-add them.

### Sync engine and queue health

| constant | value | file | reasoning recorded at the time | trials |
|---|---|---|---|---|
| `backoffBaseMs` | **2 s** (engine default 1 s) | `App.tsx:428` | **unrecorded — chosen without a written reason.** Reconstructible: it is an OVERRIDE of the engine default, so deviating was deliberate even though the target was not written down | 1 |
| `backoffMaxMs` | **30 s** (engine default 5 min) | `App.tsx:429` | **unrecorded — chosen without a written reason.** Reconstructible, and it is load-bearing twice over: `clockSanity.ts:74` cites it by name, and `MAX_ATTEMPT_CYCLE_MS` is derived from it. At 30 s a stuck head retries ≥3× inside `POISON_ALARM_MS` (90 s), so the clock trigger can fire before the count trigger — raising it past 90 s would silently make the count the only live trigger | 1 |
| `masterDataRetryMs` | **5 min** (default, not overridden) | `engine.ts:150` | "deliberately SLOW and deliberately not a backoff: retrying sooner cannot make the office add a price faster, and the operator has an explicit retry for the moment they have added it" | 1 |
| `batchLimit` | **100** | `engine.ts:149` | "bills examined per pass. Bounds the work of one run; not a retry cap" | 1 |
| `POISON_ALARM_MS` | **90 s** | `queueHealth.ts:51` | explicitly labelled a GUESS. "Long enough to ride out a brief server hiccup or deploy blip; short enough that a genuinely poisoned bill surfaces before a real backlog piles up." The offline/amber state deliberately has NO timer | 1 |
| `POISON_ALARM_ATTEMPTS` | **5** | `queueHealth.ts:77` | a second trigger for the same alarm, because a clock alone assumes a poisoned bill takes time to become obvious — only true while the backoff is short. Carries a READ THIS BEFORE CHANGING IT note: the count may only ESCALATE an already-poisoned head, never classify one | 1 |
| `STAMP_TOLERANCE_MS` | **5 s** | `queueHealth.ts:114` | slack on "a stamp cannot be in the future". Written and read by the same device clock, so jitter is nil; wide enough that a rounded `now` cannot trip it, far narrower than the coarsest timezone step (15 min) | 1 |
| sync tick | **4 s** | `App.tsx:601` | **unrecorded — chosen without a written reason.** Reconstructible: it is the real floor on retry cadence, since a bill whose backoff expires waits for the next tick — so the effective first retry is 2–4 s, not `backoffBaseMs`. It is also exactly 10× the UI refresh tick, which may be intent or may be coincidence; nothing says | 1 |
| UI refresh tick | **400 ms** | `App.tsx:532` | **unrecorded — chosen without a written reason.** Reconstructible: the adjacent comment's "150 times" is derived FROM this value (60 000 / 400), so the comment reasons downstream of the tick rather than justifying it. Equal to `FORM_DEBOUNCE_MS`, with nothing linking them | 1 |

### Master-data freshness

| constant | value | file | reasoning recorded at the time | trials |
|---|---|---|---|---|
| `PRICE_DEFAULT_CUTOFF_MS` ⚠ money | **12 h** | `freshness.ts:117` | the most argued number in the codebase — five reasons against a cutoff and four for, written out before choosing. "12 hours is the shortest window a normal working day cannot cross on its own… six would trip during a long afternoon with poor signal; twenty-four would sail straight through the overnight case that is the entire reason for the rule." Ends: "this number is a judgement, not a measurement" | 1 |
| `JUST_FETCHED_WINDOW_MS` | **5 min** | `freshness.ts:139` | "not zero because a refresh that completed ninety seconds ago is not something an operator needs a banner about, and a banner that is always on screen is a banner nobody reads" | 1 |

**RENAMED 2026-08-02, no value changed.** They were `PRICE_DEFAULT_MAX_AGE_MS`
and `FRESH_MAX_AGE_MS` — a shared `_MAX_AGE_MS` suffix on two numbers three
orders of magnitude apart, one cosmetic and one money-critical. They were mixed
up repeatedly, including in a phase brief, and **the failure mode is silent in
the dangerous direction**: reach for "the freshness constant", change the wrong
one, and the staleness banner goes quiet while the price gate stays exactly where
it was. Nothing fails and no proof goes red. Neither name is now readable as "the
freshness constant"; each doc comment names the other and states what changing it
does NOT do.

**One coupling found while renaming, and left in place:** `JUST_FETCHED_WINDOW_MS`
is also passed to `pastStampSuspect` as the tolerance on "a stored stamp cannot be
in the future" (`freshness.ts:242`). That is a reuse of the VALUE, not of the
meaning — 5 minutes suits both by coincidence of scale. So **tuning it for banner
reasons would also widen how far into the future a stamp may sit before the app
stops trusting its own ages**, which is the direction that defaults a stale price.
The call site now says so and says to give it its own constant before tuning.
Not split now: this section is bookkeeping, and splitting it is a behaviour change
however carefully done.

### Clock sanity

| constant | value | file | reasoning recorded at the time | trials |
|---|---|---|---|---|
| `SEND_SCHEDULE_HORIZON_MS` | **15 min** | `clockSanity.ts:86` | 3× the true maximum any writer can produce today (5 min), "which leaves room for a knob to be raised without silently turning real schedules into 'clock moved'", and comfortably below the coarsest timezone step. `SyncEngine`'s constructor THROWS if `backoffMaxMs` or `masterDataRetryMs` ever exceeds it, so the two cannot drift in silence. Explicitly "a judgement, like POISON_ALARM_MS" | 1 |

### Transport timeouts

| constant | value | file | reasoning recorded at the time | trials |
|---|---|---|---|---|
| `HttpTransport.timeoutMs` | **20 s** | `httpTransport.ts:84` | **unrecorded — chosen without a written reason.** Reconstructible: it is load-bearing for `MAX_ATTEMPT_CYCLE_MS`, whose comment names it as "the request itself (HttpTransport's 20s timeout)". Changing it silently changes the cap on a reported poison duration | 1 |
| daily-report abort | **20 s** | `api.ts:121` | matched to the above deliberately; the endpoint is a sequential scan over the tenant's whole bill history (see Known scaling limits), so the budget is generous on purpose | 1 |

### UI timing and touch targets

| constant | value | file | reasoning recorded at the time | trials |
|---|---|---|---|---|
| `FORM_DEBOUNCE_MS` | **400 ms** | `App.tsx:109` | **unrecorded for the 400 itself.** The comment — "form keystrokes are written through on this delay; lines are written at once" — records the SPLIT (form debounced, lines immediate), which is the safety-relevant half: a money line is never left un-persisted waiting on a timer | 1 |
| `UNDO_MS` | **8 s** | `CartScreen.tsx:71` | **unrecorded — chosen without a written reason.** Reconstructible only that it bounds an undo of a deleted cart line, i.e. it is recoverable-by-retyping and not money already committed | 1 |
| `TAP_MIN` | **56** | `CartScreen.tsx:70` **and** `SellerPicker.tsx:37` | **unrecorded — chosen without a written reason.** What IS recorded is the RULE it serves (`CartScreen.tsx:6`, "every tappable thing is at least TAP_MIN tall"). Facts about the number, not reasons for it: 56 exceeds both platform minimums (iOS 44 pt, Android 48 dp). **Two findings beyond the value** — it is DUPLICATED in two files, free to drift; and the rest of the UI does not use it at all, with raw `minHeight` literals of 48 (×6), 44 (×4), 60 (×3), 36 (×2) and 72 — so **the stated standard is honoured in two screens and undercut in others** | 1 |

### Server

| constant | value | file | reasoning recorded at the time | trials |
|---|---|---|---|---|
| `JWT_TTL_SECONDS` | **3600** (env-overridable) | `config.py:59` | **unrecorded — chosen without a written reason**, and its introducing commit says nothing about it either. It is nonetheless leaned on TWICE: `tokenStore.ts` uses "a stolen token is worthless within the hour" to justify persisting the token at all, and the sign-out blocker bounds its exposure with it. **A value two other decisions rest on, with no reasoning of its own** — if it were ever changed for an unrelated reason, both arguments would move without anyone revisiting them | 1 |
| `GET /bills` limit | **50 default, 200 max** | `bills.py:490` | **unrecorded — chosen without a written reason.** Note it is a different pair from the daily report's 200/500 in `reports.py`, with nothing recorded about why the two listing endpoints differ | 1 |
| `_DEFAULT_LINE_LIMIT` / `_MAX_LINE_LIMIT` | **200 / 500** | `reports.py:205-206` | the money is never paged — every total is a SQL aggregate over the whole day, computed independently of the line list, so a truncated list cannot produce a short total by construction. Only the LINES page | 1 |
| `_VOID_CAP` | **500** | `reports.py:210` | not paging, deliberately: "truncating the fraud-surveillance list is exactly the wrong thing to truncate, and voids are rare by nature". A hard cap purely so the response cannot grow unbounded; "a day that hits it is itself the finding" | 1 |
| `seller_code_target_holding` | **20** (per tenant, `NOT NULL DEFAULT 20`, floor of 1) | migration `0012`, column on `tenants` | **labelled an ASSUMPTION by the migration that creates it, in those words, which is what separates it from every "unrecorded" row above** — the reasoning is written down and says it is not a measurement. "The right target is a function of the walk-in rate and the longest offline stretch, and this repository measures neither." 20 is "a day's walk-ins at a yard busy enough to matter and small enough that the gaps from a lost handset are unremarkable". **THE FIRST ROW IN THIS TABLE THAT IS PER-TENANT AND CHANGEABLE WITHOUT A RELEASE** — every other value here is a literal in source, so a trial on this one is an UPDATE and leaves no commit for `git log -S` to find; a trial on it must be recorded HERE or nowhere. What settles it is a shop trading (P2.4); the floor of 1 is enforced by `ck_tenants_seller_code_target_holding` because zero would make offline seller creation permanently impossible while every screen reported a healthy device | 1 |

**THE DESIGN POINTS AT THE WRONG FILE FOR THIS LEDGER, AND THE POINTER IS LOOSE
RATHER THAN WRONG — noted 2026-08-25, and the design is NOT edited for it.**
`ROADMAP.md`'s seller-kind design says the target holding's value "belongs in this
file's tuned-constants ledger the day it lands", and *this file* there means
`ROADMAP.md`, which has no such ledger. The ledger is here, and `ROADMAP.md` itself
cites it correctly elsewhere as
`PROJECT_STATUS.md § Tuned constants — trial ledger`. The row above is recorded
where the ledger actually is. Recorded rather than repaired because the design was
already amended once this phase, by ruling, on one clause; a second edit for a
pointer would make "the design was amended" a sentence nobody can bound.

### Derived, NOT judgement — excluded on purpose

Listed so the next sweep does not add them to the table above. Changing any of
these means the thing it is derived FROM changed; they are not knobs.

- `MAX_ATTEMPT_CYCLE_MS` = **60 s** (`queueHealth.ts:106`) — the closest call in
  this list. It is *derived*: `HttpTransport`'s 20 s timeout plus `backoffMaxMs`
  (30 s in App.tsx), rounded up. But its own comment calls it "a guess like the
  two above", and the two inputs are themselves judgements — so **if either
  input is ever re-tuned this becomes a trial too**, and it is the one row most
  likely to be wrong without anyone noticing.
- `WEIGHT_MAX_INT_DIGITS` 11 / `MONEY_MAX_INT_DIGITS` 12 (`money.ts:45-46`) —
  read off `NUMERIC(14,3)` and `NUMERIC(14,2)`.
- `decimal.js` precision **50** (`money.ts:31`) — the domain needs ~28
  significant digits and the library defaults to 20, which would round mid-
  multiply (`lessons/decimal-precision-for-domain-scale.md`). The *margin*
  above 28 is a judgement; the floor is not.
- `WEIGHT_DP` 3 / `MONEY_DP` 2 — the column scales.
- `BE_YEAR_OFFSET` 543, `SHOP_UTC_OFFSET_MINUTES` 420 — facts, not choices.
  The offset becomes a per-tenant setting eventually; that is a schema change,
  not a tuning.
- `_VOID_CAP`-adjacent SQL limits, `DAY_MS` — arithmetic.

### The unrecorded values, and what could and could not be reconstructed

Nine values were chosen with **no written reason**, in the code or in their
introducing commit: the sync tick (4 s), the UI refresh tick (400 ms),
`HttpTransport.timeoutMs` (20 s), `UNDO_MS` (8 s), `TAP_MIN` (56),
`GET /bills` limit (50/200), both `backoff` knobs at their call site, and
`JWT_TTL_SECONDS`.

**Where the reasoning is genuinely unknown, the row says "unrecorded — chosen
without a written reason" and stops there.** Nothing has been back-filled with a
plausible-sounding justification. An invented reason is worse than a blank,
because a blank makes the next person ask and a plausible sentence makes them
stop — and it would be indistinguishable, a year from now, from a reason someone
actually had.

What IS in those rows is **reconstruction, clearly separated from justification**:
verifiable relationships between one value and another, found by reading the code
rather than guessed at. Those are worth having because they are what makes a
future re-tune dangerous:

- **the 4 s sync tick is the real retry floor.** A bill whose backoff has expired
  still waits for the next tick, so the effective first retry is 2–4 s, not
  `backoffBaseMs`. Anyone tuning the backoff and measuring no change would be
  looking at the wrong knob.
- **`backoffMaxMs` (30 s) sits inside `POISON_ALARM_MS` (90 s) about three
  times.** Raise it past 90 s and the clock trigger can no longer fire first —
  the count trigger becomes the only live one, with nothing announcing that.
- **`HttpTransport.timeoutMs` (20 s) and `backoffMaxMs` (30 s) are the two inputs
  to `MAX_ATTEMPT_CYCLE_MS` (60 s).** Neither has a recorded reason; a value with
  one is derived from two without.
- **the 400 ms refresh tick is upstream of the "150 times" in its own comment**
  (60 000 / 400). The comment reasons from the value; it does not justify it.
- **`TAP_MIN` (56) is a stated standard honoured in two screens and undercut
  elsewhere** — raw `minHeight` literals of 36 and 44 exist, both below it.

None of these values is wrong. All of them are **unaccountable**, which is a
different problem: an unaccountable value cannot be defended, cannot be safely
changed, and cannot be told apart from one that was measured. That is what this
ledger exists to stop compounding.

## Known stale references

Documentation drift found and not yet fixed. Recorded so it is not
re-discovered as a mystery.

- `mobile/src/device/expoSqliteDriver.ts:14` cites
  `tsconfig.device.json`, which no longer exists — the Expo app
  program is `tsconfig.json` (`npm run typecheck:app`). Comment only;
  no behaviour depends on it.
- `BRIEFING.md` says **"32 lesson files"**; there are **34**, and
  `lessons/README.md` indexes 34. Counted 2026-08-06. Prose only — but
  `BRIEFING.md` is the handoff for a reader who will NOT open the codebase, so
  it is the one file whose counts its own reader cannot check.
- **Re-counted 2026-08-07: there are now 36 lesson files and 36 index lines**
  (directory and index agree). The `BRIEFING.md` line above is therefore stale
  by four, not two. Counted with `ls lessons/*.md` excluding `README` and
  `all-lessons`, and `grep -c '^- ' lessons/README.md`.
- **A `CLAUDE.md` MACHINE FOOTGUN IS CONTRADICTED BY MEASUREMENT, and it is the
  one that was already written as a correction of a wrong correction.** The
  CRLF/BOM entry states, of `lessons/README.md`: "blob at `62cee25` CRLF 41/41,
  working tree at `62cee25` CRLF 41/41, blob at `9f929ad` CRLF 42/42, working
  tree CRLF 42/42". **The WORKING-TREE half is confirmed; the BLOB half is
  wrong.** Measured 2026-08-07 with `git cat-file -p` on the raw objects — the
  form that applies no filter, and the one that entry itself offers as the
  alternative to `git show`:

  | commit | blob sha | size | CR | LF |
  |---|---|---|---|---|
  | `62cee25` | `03224812…` | 24531 | **0** | 41 |
  | `9f929ad` | `dd4634ad…` | 25619 | **0** | 42 |
  | `3e2c996` | `dc12bbb7…` | 26222 | **0** | 42 |

  The working tree at `3e2c996` really is CRLF (`CR=42 LF=42`) with BOM
  `efbbbf`, and the blobs really do carry the BOM — so the BOM half of the
  exclusion argument stands untouched, and the CRLF half stands **for the
  working tree**, which is what `build_all_lessons.py` actually reads. **The
  exclusion of `lessons/README.md` from `all-lessons.md` is therefore
  unaffected**; what is wrong is only the claim about what is stored in the
  object database. **~~NOT CORRECTED — `CLAUDE.md` was out of scope for this
  work, and a footgun edited in passing is how the last two wrong versions of
  this one got written.~~** The irony is the point: that entry's own rule is
  "the working tree and the blob are two different objects… Measure the one you
  actually mean", and its numbers conflate exactly those two.

  **CORRECTED 2026-08-10, in the commit that carries this line. The 2026-08-07
  measurement above is left exactly as it was taken** — it was right, and a
  dated measurement is superseded rather than rewritten. The footgun was
  re-measured independently at HEAD `0241cc8`, and deliberately BEFORE this
  note was read, so the two are corroborating rather than one copied forward.
  They agree to the byte: blob `03224812` 24531 bytes CR=0 LF=41, blob
  `dd4634ad` 25619 bytes CR=0 LF=42. **Extended rather than merely confirmed:
  every one of the 45 commits that have ever touched `lessons/README.md` stored
  a blob with CR=0**, so there was never a CRLF blob for anyone to have been
  right about — at HEAD the blob is 51504 bytes CR=0 LF=54, against a working
  tree of 51558 bytes CR=54 LF=54, BOM `efbbbf` on both. The entry now carries
  both objects in a labelled table with the commit and the commands, and its
  `git show` instruction is replaced: on this box a native command's output
  reaches PowerShell as an array of lines with every ending already stripped,
  so a line ending read that way describes the writer and not the blob. **What
  is NOT established is which command produced the original wrong figure**, and
  the entry records that as unestablished rather than guessing it.

*(The `httpTransport.ts:18-23` entry that stood here — "403 stays, the server
has no permission model in the MVP" — is CLOSED. The client was taught the 403
in the phase below, and the comment now records what it cost rather than
asserting the opposite of the code.)*

## SRS references

**THE SRS IS NOT IN THIS REPOSITORY.** The owner holds it. Everything
below is a TRANSCRIPTION, confirmed by the owner on 2026-07-28, recorded
only so a session that cannot read the document does not have to guess at
it. It is not the source of truth and must not be treated as one: if it
disagrees with the owner, the owner is right. Code comments citing "SRS
1.6" throughout `server/` refer to this.

### SRS 1.6 — seller (ผู้ขาย) fields

| SRS field | Column | Notes |
| --- | --- | --- |
| code | `sellers.code` | the PK in SRS terms; here a `uuid` PK plus `UNIQUE (tenant_id, code)`, and immutable after create |
| customer grade | `sellers.grade` | nullable, `A`–`D`; selects the `product_prices` tier |
| national ID / juristic person number | `sellers.id_number` | nullable free text |
| name | `sellers.name` | required |
| address | `sellers.address` | nullable |
| phone | `sellers.phone` | nullable |
| vehicle registration | `sellers.vehicle_no` | nullable; the seller's USUAL vehicle — not `purchase_bills.vehicle_no`, which is the truck that turned up on the day |

Added by migration `0004`: `id_number`, `address`, `vehicle_no`.

**Why `id_number` is free text with no format check and no UNIQUE**, and
why that is the spec's own shape rather than a shortcut: the SRS names the
field "national ID / juristic person number" — นิติบุคคล, juristic person,
is in the document itself. A personal ID and a company registration number
are both 13 digits but are DIFFERENT SCHEMES, so a single format check
would reject one of the two kinds of seller a yard actually buys from. And
a walk-in may carry neither. A UNIQUE would additionally turn a typo in one
seller's row into a refusal to create an unrelated one. If the office wants
duplicates surfaced, that is a report, not a constraint.

## Baseline observations

Dated, because they decay. Re-run them; do not cite them.

- 2026-07-27 — `npm run typecheck` → exit 0, and
  `npm run typecheck:app` → exit 0, each run bare.
- 2026-07-27 — `recycle_pg` up and `(healthy)` on `5544->5432`.
- 2026-07-28 — `prove_backup_restore.py` → exit 0 twice in a row
  against the live database, no reseed between.
- 2026-07-28 — disaster-recovery rehearsal on a THROWAWAY empty
  cluster (`postgres:16`, no `db/init`, no migrations, no seed):
  `restore_db.py --into recycle --with-globals` rebuilt roles,
  database and all 727 rows; uvicorn against it answered
  `POST /auth/login` 200, `GET /bills` 50 bills, item weights and
  money identical to the source, and A's password against tenant B
  still 401. The throwaway cluster was removed afterwards.
- 2026-07-28 — restore safety gates each observed refusing:
  overwriting the live database without `--overwrite-live`, a
  truncated dump (sha256 mismatch), and a body containing `\connect`
  with valid checksums.
- 2026-07-28 — `prove_master_write.py` → exit 0 TWICE in a row against
  the live database, no reseed between, no run fixtures left behind.
- 2026-07-28 — migration `0004` applied to the live database; columns
  verified from `information_schema` (four `is_active` NOT NULL DEFAULT
  true, three nullable seller fields).
- 2026-07-28 — retirement proven end to end: FE-STEEL retired while an
  existing bill referenced it; the bill answered 200 with
  `product_code='FE-STEEL'`, `product_name='Steel scrap'`, every money
  and weight column byte-identical, doc_no and total unmoved. A new bill
  against it in that state was 424 `product_inactive` and wrote no row;
  after reactivating, the identical payload was accepted.
- 2026-07-28 — ALL EIGHT pre-existing server proofs re-run bare and
  green after the auth/bills/db changes AND again after 0004:
  `prove_auth`, `prove_bills`, `prove_rls`, `prove_master`,
  `prove_master_data_gate`, `prove_shop_time`, `prove_seller_pricing`,
  `prove_backup_restore`.
- 2026-07-28 — the concurrent same-key race observed directly: two
  overlapping submits (37.5 ms of measured overlap) returned
  `[200, 201]` with exactly one bill. Before the fix that path was a
  500.
- 2026-07-29 — all TWELVE mobile proofs green TWICE in a row, and both
  TypeScript programs (`typecheck`, `typecheck:app`) exit 0, each run
  bare. `prove:forbidden` ran against the live API both times with no
  reseed between (its own bills were `B-2569-218` then `B-2569-219`).
- 2026-07-29 — **device pass, real iPhone, staff account.** No void
  button under the staff role. With the button forced on, one tap
  produced exactly ONE `POST /bills/{id}/void -> 403` in the uvicorn log
  and NOTHING for the following minute — it is the last line in the log.
  Postgres on that bill (`B-2569-222`): `voided_at NULL`, `voided_by
  NULL`, `void_reason NULL` (read as hex, per the codepage-874 footgun),
  `total_amount 220.00`, still active. The screen: red card, badge
  `ไม่มีสิทธิ์ยกเลิกบิล`, total NOT struck through, no `ยกเลิกแล้ว`, no
  `ติดต่อฝ่ายสนับสนุน`, no sign-in prompt. Signing back in as admin
  retracted the refusal and applied the ORIGINAL void.
- The two temporary device-test edits (`app/config.ts` DEMO switched to
  the staff account, `role={null}` on BillsPanel) were reverted before
  the commit and are NOT in the tree.
- 2026-07-29 — **first Android pass ever**, borrowed handset. Scope and
  the much larger not-scope are in Known device gaps above.
- 2026-07-29 — **two devices, one tenant, no collision and no gap.**
  Read out of `purchase_bills`, not off the screens: `B-2569-222` (iPhone,
  220.00), `B-2569-223` (Android, 11007.50), `B-2569-224` (Android, 210.00),
  `B-2569-225` (iPhone, 1075.00) — contiguous, one bill each, no duplicate and
  no skipped number. Devices identified from the uvicorn log by client IP.
  222 is NOT a fresh tap: it is the same row as the 403 pass above, 39 minutes
  earlier, so the ordering claim iOS-then-Android holds and the "back to back"
  impression does not.

  **COMPRESSED 2026-08-06** — the per-device `device_created_at` /
  `server_received_at` table and the DHCP-lease reasoning are removed. Kept
  because the entry below cites it: `B-2569-225` carries the earlier
  `device_created_at` by 125 ms and arrived 158 ms later. **These four rows no
  longer exist in the dev database** — dropped by the 2026-08-03 rebuild and
  surviving only in the `pre-rebuild` dump, so the removed detail could not be
  re-queried either way. The observation stands as recorded.

- 2026-07-29 — **doc_no and weighing order DISAGREE across devices, and
  that is correct.** In the offline pair above, B-2569-225 carries the
  EARLIER `device_created_at` (by 125 ms) and the LATER doc_no, because
  it arrived 158 ms after the other. Nothing is wrong: doc_no is arrival
  order (`lessons/doc-no-is-arrival-order-not-event-time.md`), the
  strict weighing-order guarantee is a property of ONE device's send
  queue, and there is no shared queue across two phones. The 125 ms is
  also not evidence of anything — it is the difference between two
  untrusted device clocks, and ~3 s of real skew has been measured on
  this hardware before. Recorded here so it is not re-discovered as a
  bug: any report that orders bills by `device_created_at` across
  devices is wrong, and must key on `server_received_at`.

- 2026-07-29 — **`prove_daily_report.py` green TWICE in a row** against the
  live database, no reseed between (63 checks). Its fixtures sit on a
  synthetic day, 2019-03-14, so no real trading day is disturbed; they are
  LEFT IN PLACE (hard rule 5) and every assertion is a set-membership or a
  DELTA, which is why run 2 passes while the day's total doubles.
- 2026-07-29 — **the day boundary, with the wrong answers measured beside
  it.** Same fixtures, one list price of 15.00, three aggregation bases:

  | basis | day total | which fixtures it counts |
  |---|---|---|
  | `server_received_at` + shop tz (**shipped**) | **3053.00** | edge_first, edge_last, on_list, off_list |
  | `server_received_at` + UTC day | 3398.00 | drops edge_first, ADDS edge_after + late_sync |
  | `device_created_at` + shop tz | 3278.00 | drops edge_first, ADDS late_sync |

  A UTC day is off by 345.00 and a device-clock day by 225.00 on nine
  bills. Both edges hold exactly: `00:00:00.000000+07` is IN,
  `23:59:59.999999+07` is IN, and the two instants one microsecond outside
  are OUT (half-open, so midnight is counted once, never twice).
- 2026-07-29 — also observed through the real endpoint: a voided bill
  absent from the total and present in the void list with reason/who/when;
  a void performed against a five-day-old bill appearing ONLY in
  `voids_applied`, flagged `from_earlier_day`; an off-list bill flagged
  and an on-list one not, with `off_list_variance` exact to the baht; a
  staff token 403 `kind: forbidden`; tenant B's day invisible to A and
  visible to B; every money value an exact 2-dp string with no JSON float
  anywhere in the body; `limit=1` returning one line and identical totals;
  a future date refused 422; and `SHOW transaction_isolation` answering
  `repeatable read` for the report and `read committed` by default.
- 2026-07-29 — ALL NINE pre-existing server proofs re-run bare and green
  after the `reports.py` / `db.py` / `main.py` changes.
- 2026-07-29 — **`prove_master_write.py` went red, and it was the
  assertion, not the code.** `len(with_inactive) == len(default_list) + 1`
  assumed this run's product was the tenant's only retired row. A bill
  from 2026-07-28 (`mw-f0c445f2-inactive`) had been written against that
  run's OWN seller and product, so hard rule 5 pins both forever and its
  cleanup could not remove them — two inactive products, and `+ 1` false.
  Rewritten as a set difference; green twice. **The debris is permanent
  and is still there** (`PROD-f0c445f2`, `SELL-f0c445f2`, both retired,
  both pinned by bill `B-2569-194`): it cannot be cleaned without deleting
  a transaction. Third instance of this assertion shape — see the third
  amendment to `lessons/proof-must-run-twice.md`. Every other proof script
  was grepped for the same shape; the rest are distinctness or per-run
  claims and are sound.
- 2026-07-29 — note for whoever runs the proofs next: `prove_master.py`
  defaults to `API_BASE_URL` **8000** while `prove_master_write.py` and
  `prove_daily_report.py` default to **8099**; `mobile/src/proof/
  proveForbidden.ts` F6 defaults to **8000** via `RECYCLE_API_BASE`. A bare
  run against the wrong port fails with `httpx.ConnectError` / a transport
  error, which looks exactly like a dead server. Set the base URL
  explicitly.
- 2026-07-29 — **full sweep of every proof, server and mobile, for
  assertions that measure the fixture rather than the behaviour.** Five
  fragile ones found and fixed; the rest judged sound with the reason
  recorded in-line so the next sweep does not churn them. The fixed ones:
  two BE-year time bombs (`prove_bills.py` derived the year from
  `datetime.now(utc).year + 543`, the exact expression
  `lessons/be-year-comes-after-the-timezone.md` exists for;
  `prove_master_data_gate.py` hardcoded `2569` in two SQL predicates and a
  doc_no regex — all four would have gone red on 2027-01-01 over a defect
  the code does not have); a seed-value literal (`prove_master.py` asserted
  `'"15.00"' in raw` for a price three other scripts mutate and restore, so
  its green depended on everyone else's cleanup); an order-dependent index
  (`sb[0]["id"] != sa[0]["id"]`, which could not fail while the
  disjointness check above it held, and would IndexError the day a tenant
  has no sellers — removed, not repaired); and one of my own in
  `prove_daily_report.py` (`len(cannot_know) >= 3` would have stayed green
  against three empty strings; it now asserts the substance).
  **The mobile proofs are sound as a class and were not churned:** they
  build their world per run in `mkdtempSync` temp dirs or in-memory stores,
  so a count there measures the fixture the test itself just created, which
  IS the behaviour under test. Their absolute doc_nos (`proveClock.ts:341`,
  `B-2569-1,2,3`) come from FAKE servers whose counter resets each run, not
  from the real one. The single mobile proof that touches the live API
  (`proveForbidden` F6) captures the server-assigned `doc_no` and compares
  back rather than asserting a literal.
- 2026-07-29 — **repo-wide sweep for BE-year / shop-date / day-boundary
  derivations that bypass the shop-time module** (`+543`, `.year`,
  hardcoded 2569/2570, SQL date literals, UTC date arithmetic), server and
  mobile, production and proofs. **No new defects: the only four were the
  ones fixed in `af11f71`.** The full inventory, so it is not re-derived:

  | site | verdict |
  |---|---|
  | `server/app/bills.py:139` `_be_year` | SOUND — the one authority |
  | `server/app/reports.py:242,269` | SOUND — converts to shop tz first, then `.date()`; label uses `_be_year` |
  | `server/scripts/prove_backup_restore.py:70,191` | SOUND — already imported `_be_year` with "never re-derive +543". The model the other two should have followed |
  | `server/scripts/prove_shop_time.py:89,98,194` | SOUND BY INTENT — the UTC expression is the DISPROOF, and :194 is guarded by `if utc_be != expected_be` |
  | `server/scripts/prove_daily_report.py:339` | SOUND BY INTENT — deliberately the wrong UTC boundary, for the disproof |
  | `server/scripts/prove_daily_report.py:115,509` | SOUND — builds shop-time instants; converts before `.date()` |
  | `packages/shop-time/src/shopTime.ts:127` | SOUND — the one client authority; `getUTCFullYear()` on an already-shifted branded `ShopWallClock` |
  | `mobile/src/proof/proveTime.ts:134,155,168` | SOUND BY INTENT — UTC slice and `getHours()` shown as the CONTRAST |
  | `proveTime.ts:125-128,223-226`, `proveClock.ts:624,707` | SOUND — fixed input instant → fixed expected string. A constant mapping is correct forever; only a derivation from the CURRENT clock is a time bomb |
  | `mobile/src/proof/fakes.ts:452`, `fileServer.ts:59` | SOUND, deliberately frozen — making the fake derive the real year would add a clock dependency to deterministic tests, and nothing compares fake doc_no to a computed year |
  | `proveClock.ts:341`, `proveSync.ts:169`, `proveForbidden.ts:513`, `proveNotice.ts:453`, `proveSeller.ts:856` | SOUND — literal doc_nos compared against the FAKE's own output; doc_no is an identifier, never a date |
  | every mobile date shown to a human | SOUND — `freshness.ts`, `BillsPanel.tsx`, `StatusStrip.tsx` all render through `shopTime`; no other file imports it and none formats a date without it |
  | SQL date literals | NONE anywhere — `server/db/init/00_init_roles.sql` has no date logic, migrations use `timestamptz DEFAULT now()` (instants, not dates) |
  | `mobile/dist/` | NOT TRACKED by git — the `shopTime.d.ts` copy there is build output, types only, no logic |

- 2026-08-02 — **all THIRTEEN headless mobile proofs green TWICE in a row**, each
  run bare, and both TypeScript programs (`typecheck`, `typecheck:app`) exit 0,
  each run bare. `prove:daily` is new: 11 report shapes and 13 non-report
  outcomes, including the four disproofs (a `toFixed` round trip changing
  `99999999999999999.99`; a flag-gated understatement line going silent; the void
  wording that `admin_required` used to carry; a screen with a total field showing
  `0.00` during an outage).
- 2026-08-02 — **`prove:forbidden` green TWICE in a row** against the live API, no
  reseed between (`recycle_pg` up and `(healthy)` on `5544->5432`; uvicorn
  answering `/health` 200 on 8000, which is F6's default port). Its F6 created
  `B-2569-303`, was refused the void as staff, read `code=admin_required` off the
  real body, confirmed the server still held the bill ACTIVE with its money
  unchanged, and then voided the SAME bill as admin. Earlier in the day this
  script could not be run at all — Docker was down — and that is why it is a
  separate line rather than folded into the thirteen above.
- 2026-08-02 — **device pass, real iPhone, daily money screen, ADMIN account.**
  Four steps correct (render, timestamps, day stepping, offline); the staff 403
  step could not be exercised because the Keychain token survives deleting Expo
  Go. Read out of the uvicorn log, not off the screen: every request from the
  phone (`.249`) → **200**; `curl` from the box (`.238`) with a real staff token
  → **403** `kind=forbidden` `code=admin_required` `actual_role=staff`. The
  server gate is observed; the screen's rendering of it is not.
- 2026-08-02 — **the two freshness thresholds renamed, values byte-identical.**
  `PRICE_DEFAULT_MAX_AGE_MS` → `PRICE_DEFAULT_CUTOFF_MS`, `FRESH_MAX_AGE_MS` →
  `JUST_FETCHED_WINDOW_MS`. Verified from the diff that only the identifiers moved
  (`12 * 60 * 60 * 1000` and `5 * 60 * 1000` unchanged on both sides). ALL
  THIRTEEN proofs green afterwards — including `prove:cold`, which asserts on both
  thresholds directly and prints them — and both TypeScript programs exit 0, each
  run bare.
- 2026-08-02 — one FALSE POSITIVE found and fixed in the new proof itself:
  `proveNotice`'s banned-fragment list, copied over, read the legitimate count
  `รวม 500 ใบ` as a leaked 5xx status. Replaced with a regex over the whole class,
  applied only to the screens that carry no counts — which also catches 418.
- 2026-08-03 — **THE DEV DATABASE WAS REBUILT, and the checker is green.**
  Sequence, each step observed before the next began: both proof scripts fixed
  and green twice → `backup_db.py --label pre-rebuild` (1207 rows) →
  **restored into `recycle_prerebuild_verify` and row-count-verified BEFORE
  anything was destroyed** → `docker compose down -v` → `up` → `recycle_pg`
  `(healthy)` on `5544->5432` → `alembic upgrade head` (0001→0004) →
  `seed_dev.py` → uvicorn → **all nine server proofs green** → `reconcile.py`
  **exit 0, 44 checks, 2 tenants, 0 violations, 0.2s, run bare TWICE.**
  No transaction row was deleted to reach green: the volume was replaced whole,
  not pruned. No violation survived that was not proof debris.
  Before/after: 48→2 tenants, 402→27 bills, 428→28 items, 50→4 users.
  The pre-rebuild dump's three files re-verified by sha256 afterwards, all OK.
- 2026-08-03 — **the two fixed proof scripts add ZERO violations.** The same two
  that took the checker 84→96 in one round were re-run against the old database
  before the rebuild: it stayed at 96. That measurement is why the order was
  fix-then-rebuild and not the reverse.
- 2026-08-03 — **`prove_rls.py`'s teardown proven to survive a failure**, by
  injecting a `RuntimeError` mid-proof and observing the teardown banner, 9 rows
  removed per tenant and "nothing left in any of the 9 tables" printed BEFORE
  the traceback. The injection was reverted and its absence verified by grep.
- 2026-08-03 — **the server on 8000 was restarted from the current tree and
  confirmed FROM A RESPONSE**, not from the process list: the old PID was killed
  and `/health` observed refusing (`000`), then the new process started and
  `/health` answered **200 on `127.0.0.1:8000` AND on `192.168.1.238:8000`** —
  the exact `apiBaseUrl` in `mobile/app.json` — plus `POST /auth/login` 200.
  **The phone will nonetheless have to sign in again**: `seed_dev.py` lets
  `users.id` default to `gen_random_uuid()`, so the rebuilt admin/staff rows
  have new ids and the Keychain token names a user that no longer exists.
  Tenant, seller and product ids are fixed constants and did not move.
- 2026-08-02 — **the two-clock defect, MEASURED before and after the fix.** Same
  script, same lie (Python's clock inside `app.bills` set to
  `2027-01-01T00:00:05+07`, BE 2570; Postgres left on the real 2026-08-02, BE
  2569), same real `create_bill`, a restored scratch copy each time:

  | | doc_no minted | `server_received_at` | `doc_no_counters` |
  |---|---|---|---|
  | **before** | `B-2570-1` | 2026-08-02 (BE 2569) | **`{2569: 305, 2570: 1}`** — a counter opened for a year that has not happened |
  | **after** | `B-2569-306` | 2026-08-02 (BE 2569) | `{2569: 306}` — 2570 `last_seq` before=None after=None |

  Offline, the same `_be_year` over the two instants a straddling transaction
  really produces: `2026-12-31T23:59:59.900+07` → BE **2569**, and
  `2027-01-01T00:00:00.050+07` → BE **2570**. **150 ms apart, one Buddhist year
  apart.** Post-fix the two bills of a run are consecutive in ONE series
  (`B-2569-306` then `B-2569-307`), which they were not before (`B-2570-1` then
  `B-2569-306`). `prove_docno_clock.py` green TWICE in a row with no reseed
  (306/307, then 308/309 — every assertion is a delta).
- 2026-08-02 — **all NINE pre-existing server proofs re-run bare and green after
  the `create_bill` change**, against a uvicorn started from the fixed code on
  8099 (`/health` 200 observed first — the process already on 8000 was NOT
  assumed to be running the new code): `prove_auth`, `prove_bills`, `prove_rls`,
  `prove_master`, `prove_master_data_gate`, `prove_shop_time`,
  `prove_seller_pricing`, `prove_master_write`, `prove_daily_report`,
  `prove_backup_restore`. `prove_shop_time` is the directly relevant one — it
  asserts the counter row `(tenant, 2569).last_seq` holds the bill's own seq, and
  did.
- 2026-08-02 — **the debris grows with every proof run, measured.** One round of
  the proofs above took the reconciler from **84 violations over 46 tenants to 96
  over 48** — `prove_rls` +2 tenants and +2 NULL-doc_no bills, `prove_daily_report`
  +10 mis-yeared fixtures. No NEW violation class appeared, so the fixed
  `create_bill` writes clean rows. **This is the evidence behind the
  recommendation above being "fix the scripts THEN rebuild", in that order: a
  rebuild alone would have been undone the same day.**
- 2026-08-02 — **`reconcile.py` against the LIVE database, run bare TWICE.**
  Both runs byte-identical apart from the start stamp and elapsed: 46 tenants,
  **792 checks, 84 violations (T5: 44, T7: 40), exit 1, 0.9s.** The two runs
  were taken before and after the whole injection exercise, so they are also
  the observation that the live database was never touched by it.
- 2026-08-02 — **`prove_reconcile.py` green TWICE in a row**, no reseed between
  (it restores the copy itself each time). **118 assertions, 0 failures, 19
  injections.** Read out of the run rather than asserted:
  - the copy arrives carrying the live database's `84 violations {T5: 44,
    T7: 40}`; the two normalisation statements report `DELETE 44, DELETE 44`
    and `UPDATE 40`; the copy then runs `exit 0, 0 violations`. That is the
    proof that those two causes account for all 84.
  - every injection produced EXACTLY the predicted check ids and counts, named
    the row, and cleared on undo. Samples: `T1` → `doc_no=B-2569-2
    difference=0.01`; `T2` → `stored_amount=5.01 expected_amount=5.00` with T1
    silent (the total was moved with it, so only the arithmetic check can see
    it); `T3` → `{S5: 1, T3: 1}`, the CHECK had to be dropped first and S5 saw
    that too; `T8` → `MISSING seq=[2] highest=306` plus `counter_last_seq=305
    highest_doc_no=306 difference=-1`; `T10` → `{S5: 1, T10: 1, X1: 1}`, one
    cross-tenant seller seen by three lenses at once; `T16` → `{S5: 1, T16: 1,
    T8: 2}` (a gap AND a duplicate).
  - **RLS off on `tenants`** → `{S3: 1, B1: 1, B2: 1, T0: 91}` — the sweep's own
    context self-check screams before any money check does.
  - **RLS off on `purchase_bills`** → `{B1: 1, B2: 1, S3: 1, X2: 1, T1: 13905,
    T4: 13905, T10: 16470, T16: 184, T8: 184, T9: 45}` = **44 697 violations**.
    Every tenant sees every bill and only its own items.
  - a row landing mid-run is reported by X3 (`rows_at_start=46 rows_at_end=47`),
    not absorbed; a refused admin connection exits **2**, and so does a
    database that does not exist.

  **DECAYED — this green has not held since 2026-08-03, and the cause is not
  R1.** The 118 assertions above were written against the pre-rebuild
  46-tenant database. The 2026-08-03 rebuild took it to 2 tenants, and three of
  them are absolute counts of a database that no longer exists:
  `prove_reconcile.py:634` `{"T0": 91}`, `:636`
  `rows_visible_with_no_tenant_context=46`, and `:718` `rows_at_start=46
  rows_at_end=47`. **Measured either side of migration 0005, not inferred:** it
  fails from a pre-0005 dump (48 tenants, `T0` got 95), from a second pre-0005
  dump (3 tenants, `T0` got 3), and identically from a post-0005 dump — the
  same four failures throughout, so `token_version` is not involved. **What
  still stands: every injection that is about MONEY still passes.** Only the
  two tenant-count assertions and the X3 timing probe fail, so what decayed is
  the proof's expectations about its own fixture, not the checker's ability to
  see a money defect. Tracked in `OPEN_ITEMS.md`; fixing it means deciding what
  those numbers should be derived FROM, which is a change to a destructive
  proof and not one to make in passing. Fifth bite of
  `lessons/proof-must-run-twice.md`, in the very file its fourth amendment was
  written about.
- 2026-08-02 — one wrong PREDICTION found by the harness, in the harness:
  renumbering the TOP bill to `B-2569-99999` was expected to report
  `MISSING seq=[305]`. The checker instead reported 99 694 missing numbers,
  which is correct — if the highest issued number is 99999 then 1..99998 must
  all exist. The injection was changed to a realistic hand-renumber (one past
  the top); the checker was not changed.
- 2026-07-29 — **proof debris measured, tenant A: 301 bills, 248 active, 53
  voided**, by originating script. Only `prove_backup_restore` left nothing
  live, because it is the only one that voids its own fixture. **37 active
  proof bills had landed on the real current day**, mixed in with the 4 real
  device bills on a day `GET /reports/daily` shows.

  **SUPERSEDED by the 2026-08-03 rebuild, and COMPRESSED 2026-08-06** — the
  per-script breakdown and the pinned `PROD-f0c445f2` / `SELL-f0c445f2` pair
  are removed. Every row counted here is gone, including that pair, which was
  described at the time as permanent and uncleanable: it was, by any means
  short of replacing the volume. **The SHAPE of the finding still holds** and
  is why the OPEN DECISION on a shared proof teardown is still open — proof
  bills that land on the real current day are still indistinguishable from
  trade in the daily report, and the counts will climb again from zero.

### 2026-08-06 — device pass, real iPhone (R1b and R2)

Transcribed from the operator's record, which existed in no file in this
repository before this entry — verified by grep for `403` and `16:0` across the
repo, which returned only the 403 *class* as discussed in `lessons/` and code,
one DIFFERENT 403 observation from 2026-07-29
(`lessons/403-is-about-what-the-caller-may-do.md:150`, a void on iPhone `.243`),
and two unrelated ISO timestamps. Every line below was read from a uvicorn log
or from Postgres **except where it says it was read off the screen.**

DEVICE PASS 2026-08-06, real iPhone, R1b and R2.

R1b — sign-out, all cases passed on the handset.
- Booting with an OLD token in the Keychain carrying no version claim:
  GET /products and GET /sellers both 401. The app drew "หมดเวลาเข้าใช้งาน
  — ต้องเข้าสู่ระบบใหม่ บันทึกบิลได้ตามปกติ". It did NOT default to
  letting the session through.
- The pending gate works both ways: an empty queue drew "บิลทั้งหมด
  ส่งขึ้นระบบครบแล้ว" and released; one queued bill drew "ยังออกจาก
  ระบบไม่ได้ / มีบิลรอส่งขึ้นระบบ 1 ใบ" and refused.
- A draft survived the sign-out: a 4-line cart totalling 4384.20 was
  left in the basket before signing out and was still whole after
  signing back in. Off the screen at 16:07, bill B-2569-68 carries
  4 รายการ / 4384.20 — the operator confirms this is that same cart,
  saved and synced after the sign-out.
- The Keychain really cleared: after signing out the screen read
  "ยังไม่ได้เข้าสู่ระบบ", different wording from "หมดเวลาเข้าใช้งาน",
  so the two states are distinguishable on the device and not only in
  the proof.
- Hard rule 3 on the screen: a bill that has not reached the server
  showed "ยังไม่มีเลขที่" rather than a fabricated number.
- The 12-hour price gate fired on real hardware for the first time:
  a 3-day-old cache drew the amber band and the system did not fill
  the price in — the operator typed it.

R2 item 1 — the 403 rendering, drawn on a device for the first time.
- GET /reports/daily from the handset (192.168.1.249:64623) -> 403
  Forbidden, after that same socket's own POST /auth/login 200 and
  GET /products, GET /sellers 200. It is the ONLY 403 in the log, and
  it came from the phone's address, not from curl on the box.
- Off the screen (16:06): a red card, badge "ไม่มีสิทธิ์ดูยอดประจำวัน",
  body "บัญชีนี้ดูยอดเงินประจำวันของร้านไม่ได้ — ต้องแจ้งเจ้าของร้าน".
  NO money field appears anywhere on that screen — not a zero, not a
  dash: total, void list and off-list line are all absent. That is
  A1's design holding on a real handset: the leak is unrepresentable
  rather than guarded.
- Off the screen (16:07): the bill list under the same staff session
  replaced the void control on all three bills with "ยกเลิกบิลได้
  เฉพาะบัญชีเจ้าของร้าน". No void request was attempted and none
  appears in the log — the client refused before the wire. This
  observation therefore says NOTHING about the server's void gate,
  which is proven separately (prove:forbidden F6).
- Limit of this observation: the uvicorn lines carry no timestamps.
  The 403 is tied to the screenshot by being the only one in the log
  and by its source address, not by clock.

R2 item 2 — the 20 s transport timeout, staged for the first time.
WEAKER EVIDENCE THAN THE ABOVE, and recorded as such.
- Staged as a socket that completes the TCP accept and then never
  answers. It is not uvicorn, so the uvicorn log contains NO line for
  it. That absence is expected and is not evidence of anything.
- Off the screen (16:09): badge "ยังติดต่อระบบไม่ได้", body "หน้ายอด
  ประจำวันต้องอ่านตัวเลขจากระบบ ... ยังไม่ได้ตัวเลขจากระบบ จึงยังไม่
  แสดงยอด — ไม่ได้แปลว่าวันนี้ไม่มีการซื้อขาย บิลที่บันทึกไว้ยังอยู่
  ครบทุกใบ", plus a "ลองอีกครั้ง" button. No money field. The day did
  not render as 0.00.
- WHAT THIS DOES NOT ESTABLISH: the ~20 s was watched by the operator,
  not measured, and this is the same screen a REFUSED connection would
  produce. What is proven is that a hung socket ends in the no-number
  outage screen instead of a zero. That it ended at the 20 s ceiling
  specifically, rather than at some other transport failure, rests on
  the operator's stopwatch and nothing else.

- 2026-08-06 — **proof and typecheck runs, READ OUT OF THE TWO COMMIT BODIES,
  not re-run in this documentation phase.** From `7484645`: `prove:signout`
  green TWICE bare with no reseed between the runs, and **both TypeScript
  programs — the node program and the Expo app program — exit 0**. The other
  THIRTEEN mobile proofs were green twice each *earlier in that session*,
  **against a tree differing from the committed one only in
  `proveSignOut.ts`**. That hedge is the commit's own and is kept deliberately:
  it is NOT the same claim as all fourteen green twice on the committed tree,
  and the difference is exactly the kind a later session would round off.
  From `19a6b63`: nine server proofs green plus `prove_backup_restore`, and
  `reconcile.py` against the dev database **exit 0, 44 checks, 0 violations,
  unchanged**. `prove_reconcile.py` was already RED for reasons predating that
  change — see the decay note above.
- 2026-08-06 — **`START_HERE.md`'s citations moved from line numbers to
  section-plus-handle, and the move was DISPROVEN rather than reviewed.**
  `tools/verify_citations.ps1` parses the citations out of `START_HERE.md`
  itself — it carries no list of its own — and asserts each resolves to exactly
  one place: **36 citations, 0 broken, exit 0**, run bare from its committed
  location. Three things it caught, all before the commit:
  - **Three handles were line-WRAPPED** inside `START_HERE.md`, making them
    strings that exist on no single line of the file they point at. First run:
    `BROKEN=3`. The one-line rule now in `START_HERE.md`'s header was found by
    RUNNING the check, not by reasoning about it.
  - **The shift disproof.** A blank line inserted near the top of `CLAUDE.md`
    (above Scope and status) moved every section — 51→52, 70→71, 165→166,
    197→198 — and every handle with them; all 36 still resolved. Repeated on
    `PROJECT_STATUS.md` (Current phase 50→51, What is built 692→693, Baseline
    observations 1291→1292): all 36 still resolved. Both files then restored and
    verified byte-identical by sha256. Line citations would have failed both.
  - **A negative control.** One handle altered to a string absent from its
    target: that citation alone reported `hits=0`, `BROKEN=1`, exit 1. Restored,
    back to exit 0. The green has been observed going red.
- 2026-08-06 — **the checker's FIRST run from `tools/` was a FALSE GREEN, and the
  cause is this box rather than the citations.** It printed `CITATIONS=3
  BROKEN=0` and **exited 0** when there are 36. The section mark had been written
  as a literal character in the `.ps1`; **Windows PowerShell 5.1 reads a BOM-less
  script as the ANSI codepage, which is 874 here**, so the regex silently stopped
  matching every citation carrying a section and the run reported success over
  the 3 that remained. It was caught only by comparing 3 against a count already
  known to be 36 — nothing in the output said anything was wrong. Fixed twice
  over: the source is ASCII-only with the mark built from its codepoint, and the
  run now asserts that sectioned citations parsed equals sectioned citations
  present. That control has itself been seen firing (35 vs 33, while its own
  count regex was still too loose) and then corrected. **A machine-footgun entry
  in `CLAUDE.md` is OWED and is NOT written** — this is the codepage-874 trap in
  SOURCE rather than in data, a form the existing entry does not cover, and
  `CLAUDE.md` was out of scope for this commit.
- 2026-08-07 — **the section-and-handle citation form survived a REAL insert for
  the first time, and the shift it survived was 22 lines, not one.** The staged
  disproof recorded above moved a blank line and put it back; this was a
  committed edit that added a 22-line machine-footgun entry to `CLAUDE.md`.
  **The shift was not uniform, and it split a cited section down the middle.**
  `Scope and status` stayed at 51 and the `Machine footguns` heading stayed at
  70 — both sit at or above the insert point — while `Boot check` moved 165→187
  and `Workflow` 197→219, and the two handles INSIDE `Machine footguns` moved
  90→112 and 98→120 with them. A line citation into that one section would have
  been right for the heading and 22 lines wrong for its own handles, in the same
  breath. **All 25 citations into `CLAUDE.md` still resolved**, inside a run of
  37 (36 before, plus the one this commit adds to `START_HERE.md`): 0 broken,
  exit 0, control 34 sectioned present and 34 parsed, run bare. The prior this
  is measured against — a three-line insert that once invalidated all twenty
  pointers at once — is recorded at `tools/verify_citations.ps1` lines 5-7 and
  is NOT re-measured here; what is new is only that the form has now held
  through an edit somebody actually made, an order of magnitude larger than the
  staged one. Same commit, and stated so the two are not read as one claim: the
  machine-footgun entry the note above records as OWED is now written, and
  `START_HERE.md` and `OPEN_ITEMS.md` name `.claude/`, which nothing in this
  repository did before.

### 2026-08-07 — device pass, real iPhone (R2b staging), bundle `5e5a756`

Recorded verbatim from what was observed, and nothing else. The interpretation is
in Current phase, above, and is deliberately not repeated here.

Metro was restarted with `npx expo start -c` and the handset fully reloaded
BEFORE the staging, so the running bundle is `5e5a756`. Admin account. Wi-Fi at
full strength throughout; airplane mode was not used at any point.

Staging: signed in; bill `B-2569-73` saved and synced normally (201). Then
`POST /users/35d09981-.../revoke-sessions` -> 200, `token_version` 3 -> 4, read
back from Postgres. Then one new bill saved on the handset, 880.00, one line.

Read from the uvicorn log: `GET /products` and `GET /sellers` 401 three times
each on `:57637`, then `POST /bills` 401 ten times on `:57638` through `:57647`.
The device received every one of them.

Read off the screen, 11:16 through 11:21, with no other interaction:

- The sync strip was CORRECT the whole time. It drew, verbatim:
  `หมดเวลาเข้าใช้งาน — ต้องเข้าสู่ระบบใหม่ บิล 1 ใบยังอยู่ครบ จะส่งให้เองหลังเข้าสู่ระบบ`
  with a green `เข้าสู่ระบบ` button beside it. It held that for five minutes
  without the daily screen ever being opened.
- The bill row read: `รอส่ง` / `บิลล่าสุด ยังไม่มีเลขที่` / `880.00 (1)`.
  Hard rule 3 holding — no fabricated number.
- NO LogBox warning appeared. No unhandled rejection, on the handset or in the
  Metro console.
- Then `ออกจากระบบ` was pressed. The sheet drew, verbatim:
  `ยังออกจากระบบไม่ได้` / `มีบิลรอส่งขึ้นระบบ 1 ใบ` /
  `การเข้าสู่ระบบครั้งต่อไปต้องใช้อินเทอร์เน็ตอยู่แล้ว และเมื่อเชื่อมต่อได้ บิลจะส่งเองภายในไม่กี่วินาที` /
  `รอให้ส่งครบก่อน แล้วจึงออกจากระบบได้`
  with one `ปิด` button and nothing else.
- Then the strip's `เข้าสู่ระบบ` button was pressed. The bill posted immediately.

- 2026-08-07 — **R2b client change: `prove:signout` green TWICE bare with no
  reseed between (148 cells each run), and both TypeScript programs exit 0, each
  run bare.** The proof was also **observed going RED**: reverting
  `signOutNotice.ts`'s session branch to its shipped form (`noSession` forced
  false, which reproduces a sheet with no session input) gave exit 1 and 10
  failed cells — the two expired cells in S6's per-cell expiry check, the two
  signed-out head checks, five in S9's dead half, and the control asserting the
  two sheets differ. **The offline half stayed green throughout the break**, which
  is the result that makes the ten mean anything. `signOutNotice.ts` was then
  restored and verified byte-identical by `git hash-object`
  (`dc6c1a9146cd8b1fc17cb8b8238bae456a5def87` before and after), and the proof
  re-run bare to exit 0. **NOT covered by any of that: the handset.**

### 2026-08-07 12:08 — device pass, real iPhone (R2b closing pass)

Recorded verbatim from what was observed, and nothing else.

Bundle established with `npx expo start -c` plus a full reload BEFORE staging,
per `CLAUDE.md § Boot check`. Wi-Fi up throughout; airplane mode was not used.
`token_version` bumped by `revoke-sessions` from the PC.

Read off the screen, verbatim:

- The sheet, with one bill queued and the token refused:
  `ยังออกจากระบบไม่ได้` /
  `มีบิลรอส่งขึ้นระบบ 1 ใบ` /
  `หมดเวลาเข้าใช้งาน — บิลยังอยู่ครบ แต่จะไม่ถูกส่ง` /
  `ต้องเข้าสู่ระบบใหม่ด้วยบัญชีเดิม บิลจึงจะถูกส่ง`
  with a `เข้าสู่ระบบ` button and a `ปิด` button.
- The strip behind it read `หมดเวลาเข้าใช้งาน` with its own `เข้าสู่ระบบ` button.
- The bill row read `รอส่ง` / `บิลล่าสุด ยังไม่มีเลขที่` / `44.00 (1)`.
- The sheet's `เข้าสู่ระบบ` button was pressed. The sheet closed itself. The
  header then read `เข้าสู่ระบบแล้ว`, the strip `ส่งครบแล้ว / ส่งล่าสุด 12:08`,
  and the bill that had no number carried `B-2569-76` with the `ส่งแล้ว` badge.

**WHAT THIS DOES NOT ESTABLISH.** One pass. An admin account — no staff account
took this path. One queued bill, so nothing here says anything about ordering or
about a queue deep enough to expose one. And the dead session was reached by
`revoke-sessions`, NOT by a token expiring naturally, which is the case every
handset actually meets every hour of every shift; the two are believed to reach
the same client state and that belief is not what was measured here.

### 2026-08-07 — headless, this box (R2b follow-up: S9's session input)

**NO DEVICE.** Everything below is a node proof or a compiler. No screen was
read, and the 12:08 device pass above is not refreshed by any of it.

**Baseline, before any edit, at `62cee25` with a clean tree.** Each command run
bare, one per invocation: `npm run prove:signout` exit 0 **twice** with no
reseed, 148 `[OK]` cells; `npm run typecheck` exit 0; `npm run typecheck:app`
exit 0.

**A COUNTING TRAP, recorded because it misreads every run in this entry.**
`proveSignOut` prints FIVE `[FAIL]` strings unconditionally — they are S7's
recorded prose (`proveSignOut.ts:1492-1496`), not cells. `grep -c '\[FAIL\]'`
therefore returns 5 on a fully green run. Every count here is taken ABOVE the S7
header.

**After the change.** `npm run prove:signout` exit 0 twice, no reseed, **151**
`[OK]`, 0 live failures. `npm run typecheck` exit 0. `npm run typecheck:app`
exit 0.

**THE DISPROOF.** `sessionEndedAfterPass`'s `sessionExpired` arm changed from
`return true` to `return false`. `prove:signout` **exit 1, SEVEN live cells, all
in S9**:

- the session the sheet is given is DERIVED from the 401 pass, and it is
  expired — `active`
- the sheet does NOT tell the operator to wait for the queue to finish
- ...and does NOT promise the bills go by themselves in seconds
- ...it names the expiry, in statusNotice's word
- ...and names the account that releases them
- ...and carries the sign-in button — `dismiss`
- **the two sheets DIFFER although the measured count is identical** — the
  paired control, and it fired

**`npm run typecheck` and `npm run typecheck:app` BOTH stayed at exit 0 under
that mutation.** The compiler cannot see it; the proof is the only instrument
that can. Reverted and verified byte-exact — SHA-256
`E24AC2044CB142B16AFD7E31BC0B12932AD17C928CDD7B6DA68A044D2055CBA3`, 17346 bytes
— after which the proof was green again, 151 `[OK]`, 0 failures.

**THE SECOND DISPROOF, AND IT CORRECTED A WRITTEN PREDICTION.** The plan for
this work said that with only the dead half derived, a fold reporting expired
for everything would be caught by the paired control and by nothing else. Three
runs:

| S9's live half | the fold | result |
|---|---|---|
| literal `"active"` | correct | exit 0, 0 failures |
| literal `"active"` | an outage reported as EXPIRED | **exit 0, 0 failures** |
| derived from `liveRun` | the same mutation | exit 1, **6** failures, control among them |

**The prediction was wrong.** With one side of the comparison supplied by the
proof itself, the control catches nothing at all — a fold classifying every
outage as a dead session, which is the R2b defect pointed the other way, ran
FULLY GREEN. Deriving both halves is therefore not a marginal strengthening; it
is the difference between that shipping green and six red cells. Written up as
`lessons/a-differential-control-is-only-as-good-as-its-weaker-side.md`, the
35th lesson.

**WHAT THIS DOES NOT ESTABLISH.**

- **Nothing here ran on a handset.** No sheet was drawn, no button pressed. The
  device evidence for R2b remains the single 12:08 pass above, at its own width.
- **`App.tsx:618` is still unobservable to every node proof.** Deleting it
  leaves `prove:signout` green and both typechecks at 0, and no arrangement
  changes that while the line is in a file `rootDir: "src"` excludes. What moved
  is the DECISION, not the call — tracked in `OPEN_ITEMS.md` beside its
  `maySync` twin, and deliberately not written up as closed.
- **The product's behaviour is unchanged**, which is the point rather than a
  caveat: both `App.tsx` call sites are bit-identical in effect to the literals
  they replaced.

### 2026-08-07 — `purchase_bills.created_by`, migration 0006 (server + proof)

**NO DEVICE.** Everything below is a migration, an HTTP proof or a catalogue
read on this box. No screen was opened; the 12:08 device pass above is not
refreshed by any of it.

**The column.** `created_by uuid`, NULLABLE, no default, plus
`fk_bills_created_by FOREIGN KEY (tenant_id, created_by) REFERENCES users
(tenant_id, id)` and a `COMMENT ON COLUMN` — the first `COMMENT ON` in this
repository, a deliberate new convention. Read back out of the CATALOGUE, not the
file: `information_schema` gives `created_by | uuid | YES |` with no default,
identical in shape to `voided_by`; `pg_constraint` gives the FK definition
byte-for-byte the same shape as `fk_bills_voided_by`. The comment is ASCII by
design so it never needs hex to be trusted on a codepage-874 box, and that was
MEASURED rather than intended: `length 382 = octet_length 382`, no
non-printables.

**The inverse was EXECUTED, not asserted.** `alembic downgrade 0005` → exit 0,
then read back `column_rows 0, fk_rows 0, alembic_version 0005`. Then `upgrade
head` → exit 0, read back `column_rows 1, fk_rows 1, comment_bytes 382,
alembic_version 0006`. Gone, then back byte-identical.

**The write, read out of Postgres rather than reasoned about.** After the proof
set ran: **79 authorless, 32 authored, 111 total.** `created_by` resolves to a
real username with `same_tenant = t` on every row. Cross-checked two ways that
agree: 32 authored rows in Postgres, 32 `POST /bills` 201s in the uvicorn log,
**0 five-hundreds and 0 `BILL_POISON_CANDIDATE` lines**. Both `admin` AND
`staff` appear — bill creation is `Depends(get_principal)`, not
`require_admin`, so this column records something `voided_by` structurally
never can.

**A pre-migration bill read through `GET /bills/{id}` returns
`"created_by": null` explicitly** rather than omitting the key: the authorless
case is now stated by the API instead of being invisible.

**The proof, and the two mutations that make its green mean something.**
`prove_bills.py` CASE 1 asserts `created_by` against `GET /whoami` — both sides
DERIVED, from two different requests, never a literal from `seeddata` (the
2026-08-03 rebuild gave every seeded user a new id). CASE 7 does the staff half
and needs a second login. Green twice bare, no reseed.

| mutation | exit | cells fired |
|---|---|---|
| column, placeholder and `"cb"` param removed from the INSERT | **1** | `case1: … (bill says None, whoami says 35d09981-…)`; `case7: … (bill says None)` |
| seeded staff id hardcoded in place of `principal.user_id` | **1** | `case1: … (bill says bef92d61-…, whoami says 35d09981-…)` — **one cell only** |

**The second mutation is the one that carries the information.** A non-null,
valid, same-tenant, REAL user id was written and case 1 still went red, so the
assertion is not a disguised `is not None`. Case 7 stayed GREEN under it — the
hardcoded id IS the staff user, so that bill's author was accidentally correct.
One assertion can be fooled by a wrong constant; the pair cannot. Each mutation
required killing and restarting uvicorn (no `--reload`); `bill says None` is
what proves the restart took rather than a stale process answering. Reverted and
proven byte-exact by TWO hashes — `git hash-object`
`0d9ee40855924bae70a3f422790267484cd3fa11` and sha256 `30c0b6f1…0006d596`.

**WHAT THE MUTATIONS COST, and it is not zero.** They wrote **TEN permanent
rows the correct product could not have produced** — run `e903453d` five
authorless, run `e63a1c76` five naming the wrong user. They came through the
REAL path, so they are schema-valid, pass every `reconcile.py` check, and are
indistinguishable by inspection from genuine staff-created bills. Hard rule 5
means none can be removed. Written up as
`lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-database.md`;
recorded as debris in `OPEN_ITEMS.md`.

**A PROOF THAT PERTURBS A SEQUENCE HAS BROKEN THE TEST, NOT FOUND A BUG.** The
staff assertion was first written into CASE 1 and turned `case4` RED: cases 4
and 5 assert doc_no ADJACENCY against case 1's bill (`seq_of(doc1) + 1`, then
`prev_max + 1/+2`), so a bill minted between them breaks assertions about the
counter that have nothing to do with authorship. Case 4 was NOT relaxed; the
staff creation moved to CASE 7, at the end, and the reason is recorded at the
site. Measured, not predicted.

**`prove_reconcile.py` — exit 1, 113 `[OK]` / 4 `[FAIL]`, and the four are the
four already recorded.** Verbatim: `S3/T0 … wrong or absent: {'T0': 91}`,
`S3/T0 … rows_visible_with_no_tenant_context=46`, `X3 … got {}`, `X3 … names
the table and both counts`. Every money injection passed across 19 injections.
Nothing in this work touched it. **[19 CORRECTED 2026-08-07 in P1.10; this
sentence read 23 when written. Measured three ways — the run header prints
`injections (19)` from `len(injections)`, 19 constructors stand in `build()`, and
the only commit that has ever touched the file holds 19. NO REASON FOR THE 23 IS
RECORDED: a reconstruction that fits arithmetically is not a recovered reason.]**

**A LINE-ENDING FINDING, AND THE MECHANISM IS UNDETERMINED — no cause is named
here because none was measured.** After editing, `server/scripts/prove_bills.py`
was CRLF in the WORKING TREE (`CR=316 LF=316`) while its blob at HEAD was LF
(`CR=0 LF=249`). Six untouched files were sampled and are all `CR=0`, so it is
not a repository pattern; `server/app/bills.py` is `CR=0` after six edits by the
same editor, so the editor is not uniformly the cause. **`git status` is
structurally BLIND to this** — `.gitattributes`' `text=auto eol=lf` normalises
on comparison, so a CRLF working copy compares EQUAL to an LF blob and nothing
is reported. `git diff` showed 69/2 lines rather than 316, i.e. a commit would
have produced a correct LF blob regardless. The working copy was rewritten to LF
and the diff re-checked byte-identical.

**AND A `CLAUDE.md` FOOTGUN IS CONTRADICTED BY MEASUREMENT — see the note under
Known stale references.** Not corrected here; `CLAUDE.md` was out of scope.

**WHAT THIS DOES NOT ESTABLISH.**

- **Nothing ran on a handset.** No screen was drawn. Whether the mobile client
  behaves any differently is untested and expected to be nil — its
  `BillResponseBody` declares two optional fields and reads only `doc_no`, so a
  new key is inert, which was CONFIRMED by reading the file rather than assumed.
- **No client displays an author anywhere.** `GET /bills` (list), the daily
  report and `reconcile.py` are all untouched and read nothing. The column is
  written and readable through `GET /bills/{id}`; it is on no screen.
- **The distinction the column names is unmeasurable today.** Mobile has ONE
  account (`app/config.ts` DEMO credentials; `App.tsx` has no `TextInput` —
  grep, 0 occurrences), so weigher and syncer are the same principal by
  construction until real per-shop accounts exist.
- **One process on this box was running pre-edit code throughout** — a uvicorn
  on port 8000, three hours old, never restarted. Every proof above was pointed
  explicitly at 8099 and 8099 was established as the current tree BY A RESPONSE
  (`created_by` present in a `GET /bills/{id}` body) rather than by a process
  list. 8000 against the migrated schema writes bills with a NULL author.

### 2026-08-07, later — two corrections to the entry above, both measured

**THE CRLF GENERALISATION ABOVE IS WRONG. It is corrected here rather than
edited there**, because a dated observation is superseded, not rewritten. That
entry says six untouched files were sampled, were all `CR=0`, and that CRLF is
therefore "not a repository pattern". The sample was six files, all under
`server/`, and the conclusion does not survive a full count.

**Measured across all 178 tracked text files: ELEVEN carry CRLF in the working
tree, and ALL ELEVEN have LF blobs.** `lessons/README.md` (43),
`mobile/app/ids.ts` (15), `mobile/src/proof/proveSync.ts` (1550),
`proveNotice.ts` (1253), `proveSeller.ts` (938), `proveVoid.ts` (541),
`proveCart.ts` (462), `sqliteProof.ts` (417), `cartCrashChild.ts` (139),
`draftCrashChild.ts` (64), and `server/scripts/prove_master_data_gate.py`
(286). **Several are proof files nobody touched that day.**

So the pattern is close to the opposite of what was written: working-tree line
endings vary across about 6% of this repository, the blobs are uniformly LF, and
`.gitattributes`' `text=auto eol=lf` normalises on comparison so `git status`
reports none of it. **`prove_bills.py` matches that pre-existing distribution
rather than having been caused by an edit** — which a six-file sample could not
have settled in either direction. The normalisation applied to it was therefore
unnecessary rather than harmful: the blob was going to be LF either way.

**THE MECHANISM REMAINS UNDETERMINED, and no cause is named here because none
has been measured.** What is established is the distribution above and that the
blobs are LF throughout. Nothing here says what writes a CRLF working copy, or
when.

This is `CLAUDE.md`'s own rule about counts, disregarded: "give any count you
are about to rest a decision on a SECOND, independent measurement". A sample of
six was treated as a census of 178.

**THE STALE PORT-8000 PROCESS WROTE NOTHING, and that is a measurement rather
than a relief.** Killed 2026-08-07 — PID 28564, started 13:21:02 shop time,
`uvicorn app.main:app --host 0.0.0.0 --port 8000` from the repo venv, so
pre-0006 code was serving for roughly two hours AFTER 0006 applied. Port
confirmed clear afterwards: nothing LISTENING, `curl` 000. **Authorless bills
written after 0006: SEVEN, every one attributed** — five are mutation 1
(`bill-A-e903453d-*`, recorded above), two are `prove_backup_restore`'s
deliberate direct-INSERT markers (`backup-proof-marker-*`, one per run, voided
rather than deleted). **NONE came from the stale process.** The query bucketed
everything else as "OTHER — investigate" and that bucket returned ZERO rows,
which is the control that makes this a finding instead of an assumption. The
hazard was real and never fired.

### 2026-08-07, later still — `ROADMAP.md` replaced, and a citation break the edited file could not show

**DOCUMENTATION AND ONE LESSON. No code was touched, no proof was run, and no
dated green elsewhere in this file is refreshed by any of it.** `ROADMAP.md` was
replaced rather than amended, on the owner's instruction and against six decisions
(S1–S6) settled in a working session and recorded in no file until now.

**The R-number census, which is what justified closing them as a log.** Measured at
`6de5cec`, excluding `ROADMAP.md` itself: `git grep -oE '\bR(10|[1-9])b?\b' -- '*.md'
':!ROADMAP.md'` returns **120 mentions across 12 tracked files** — `BRIEFING.md`,
`OPEN_ITEMS.md`, `PROJECT_STATUS.md`, `SRS_MAP.md`, and eight under `lessons/`, one
of which (`all-lessons.md`) is generated. `git log --all --format=... --grep='\bR[0-9]' -E`
returns **10 commits**. The eight labels actually in use outside the file are
`R1 R1b R2 R2b R3 R4 R5 R7`; `R6` and `R8`–`R10` existed only inside it. **The
owner's recollection was "six files"; the measurement is twelve, and the file
carries the measurement.**

**The new prefix was checked for collision before it was chosen, not after.**
`git grep -nE '\bP[0-9]+(\.[0-9]+)?\b' -- '*.md'` returned **nothing** at `6de5cec`.
That command necessarily returns many hits now, from `ROADMAP.md` itself; the claim
is dated to the commit, which is the only way it stays true.

**A CITATION WAS BROKEN BY THE REWRITE AND THE EDITED FILE COULD NOT SHOW IT.**
`ARCHITECTURE.md:11` carries a section-only citation
`` `ROADMAP.md § What next, and why that` ``. The replacement did not carry that
heading, so the citation resolved to nothing. **It was caught by an accident of
which sources were in the checker's `-Source` list** — `ARCHITECTURE.md` was there
because the phase required running over every source, not because anyone suspected
it. The repair was made in `ROADMAP.md` (the heading exists again, and now names the
three steps with no predecessor), so `ARCHITECTURE.md` was not edited.

**The disproof was then EXECUTED rather than described**, by deleting the same
heading again on the same tree:

| run | exit | what it reported |
|---|---|---|
| `-Source ROADMAP.md` | **0** | `CITATIONS=56 BROKEN=0`, both controls OK — a true statement about the file, over a broken repository |
| `-Source START_HERE.md,ARCHITECTURE.md,ROADMAP.md` | **1** | the break printed under `=== SOURCE: ARCHITECTURE.md ===` as `22 BROKEN ROADMAP.md sect=What next, and why that hits=0 (section-only)`, while `ROADMAP.md` read `BROKEN=0` in that same run |

**Reverted and proven by hash**, not by inspection: `sha256` of `ROADMAP.md` is
`f23dea1b63d5fa6c4f4d415c4c64fca942fedcbb54ca7a79069e0d6b81f456e3` both before the
mutation and after the revert. Final state, run bare over all three sources:
**`SOURCES=3 CITATIONS=130 BROKEN=0`, exit 0** — per source `START_HERE.md` 37,
`ARCHITECTURE.md` 37, `ROADMAP.md` 56, every count non-zero and both controls
(sections, non-empty) holding on each.

**What this does NOT establish.** That the checker would catch an inbound break in
any other file: it caught this one only because the citing document happened to be
in the source list, and the script's DEFAULT list is
`@('START_HERE.md','ARCHITECTURE.md')`, which never opens `ROADMAP.md` at all. Nor
that no other heading was lost — no inventory of the old file's headings was taken
before it was replaced, and the only one known to have been cited is the one that
went red.

**The lesson that came out of it** is the sixth mechanism in
`lessons/a-check-that-never-went-red-was-never-observed.md`, written unprompted at
the boundary: the fifth inverted — the instrument read the artifact and never what
POINTS AT it. `build_all_lessons.py --check` exits **0** afterwards, over **36
lesson files and 36 toc entries**, 15 amendments across 7 files, 4201 document
lines.

**A THIRD, INCIDENTAL MEASUREMENT, AND IT CONTRADICTS A MACHINE FOOTGUN.**
`CLAUDE.md`'s CRLF entry states, as its corrected and final position, that the
`lessons/README.md` BLOB is CRLF — "blob at `62cee25` CRLF 41/41 … blob at
`9f929ad` CRLF 42/42". **Measured here with `git cat-file -p` and a positive
control, every one of those blobs holds ZERO CR bytes.** The control is a synthetic
`a\r\nb\r\n` stream through the identical counter, which returns 2, so the
instrument is not blind. At `9f929ad` the blob is **0 CR, 42 LF**; at `62cee25`,
**0 CR**; at `6de5cec`, **0 CR, 43 LF**; the BOM (`ef bb bf`) is present on all
three. **The 41/42 figures are LINE counts, and the file is LF in the blob and CRLF
in the working tree** — which is exactly what this file's own entry two sections
above already reports for all eleven such files, and that entry is the one that is
right. The WORKING TREE half of the footgun is correct and unchallenged: 43 CR and
43 LF today, re-measured after this session's edit.

**No file is corrected on the strength of this.** `CLAUDE.md` is out of scope, and
the footgun's operational advice — measure the blob, never let git's warning be the
observation — is sound and is what produced this measurement. What is wrong is one
number in it, recorded here so the next session does not rediscover it as a mystery.
Note also that `git add` printed its usual `CRLF will be replaced by LF` warning on
`lessons/README.md` during this work, and per that same footgun it was not read as
evidence of anything.

### 2026-08-07 — P1.4, `users.is_active`, migration 0007 (server + proof)

**NO DEVICE.** Everything below is a migration, an HTTP proof, a catalogue read
or a hash on this box. No screen was opened and no button pressed; the 12:08
device pass above is not refreshed by any of it.

**The column, read out of the CATALOGUE rather than off the file.**
`information_schema.columns` gives `is_active | boolean | NO | true` — name,
type, is_nullable, default. The `COMMENT ON COLUMN` is the second use of 0006's
convention and is ASCII by design, which was MEASURED rather than intended:
`length 485 = octet_length 485`, so it never needs hex to be trusted on a
codepage-874 box.

**THE INVERSE WAS EXECUTED, NOT ASSERTED**, and the column state was read back at
each of the three points:

| step | exit | column_rows | comment_octets | alembic_version |
|---|---|---|---|---|
| `alembic upgrade head` | 0 | 1 | 485 | 0007 |
| `alembic downgrade 0006` | 0 | **0** | **0** | 0006 |
| `alembic upgrade head` | 0 | 1 | 485 | 0007 |

Gone, then back byte-identical. The comment died with the column, which is what
`downgrade()` claims and why it has no second statement.

**ALL FOUR SEEDED USERS READ BACK `is_active = t`, and zero accounts are
locked.** That is 0004's "the migration cannot change the meaning of any current
data" observed rather than argued — every existing row was already a live
account, so `true` restates a fact instead of guessing one.

**The proof: `prove_revocation.py` CASE 7 and CASE 8, 25 new cells.** Green
TWICE bare with no reseed, **57 `[OK]` / 0 `[FAIL]`** each run, and green twice
again after the mutations were reverted. CASE 3 and CASE 7 are each other's
negation — "a bump does not lock the user out" and "a lock refuses login
entirely" — which is why they are in one file: split across two, no run would
ever hold both.

**Two assertions sharper than the brief asked for, recorded because the reason
generalises.** The locked refusal is asserted INDISTINGUISHABLE from a wrong
password with both sides read off real responses and neither a literal
(`lessons/a-differential-control-is-only-as-good-as-its-weaker-side.md`). And
the peer control is tenant B's `staff` — the SAME username as the locked
account, since usernames are unique only per tenant — which is the one control
that would catch a lock applied by username instead of by id.

**BOTH MUTATIONS, RUN AGAINST A SCRATCH DATABASE, NEVER DEV.** A fresh post-0007
backup was restored into `recycle_lock_scratch` and a marker seller inserted
into it; the marker was then confirmed PRESENT in scratch (1 row) and ABSENT in
dev (0 rows), so "which database is this server on" is answerable from a
response. uvicorn ran on 8098 against the copy, and the dev server was killed
first so exactly one server existed and reaching the wrong one was impossible.
The reason for all of this is
`lessons/a-mutation-on-a-protected-write-path-needs-a-scratch-database.md`: with
either guard removed, CASE 7's `POST /bills` under a locked account SUCCEEDS and
writes a bill the correct product could not have produced, which hard rule 5
makes permanent.

Which code was answering was established BY A RESPONSE at every step, never from
a process list:

| probe | baseline | mutation A | mutation B | after revert |
|---|---|---|---|---|
| database | SCRATCH | SCRATCH | SCRATCH | DEV |
| locked login | 401, no token | **200, token** | 401, no token | 401, no token |
| locked `whoami` | 401 `account_inactive` | 401 `account_inactive` | **401 `token_revoked`** | 401 `account_inactive` |

**MUTATION A** — the `is_active` check removed from `main.py`'s login. Exit 1,
**three cells**, and they are the three CASE 9 predicts: the locked account is
refused at login with the correct password; the refused body carries no
`access_token`; the refusal is indistinguishable from a wrong password. **GREEN:
every token-side cell** — the pre-lock token still refused, the money path still
refused, CASE 8 still restoring. That split is the information: it says the lock
is missing from LOGIN and present in `get_principal`.

**MUTATION B** — `_require_active_account(row["is_active"])` removed from
`get_principal`. Exit 1, **two cells, both of them reading `code`**:
`the refusal names the ACCOUNT (account_inactive), not the token`, on `/whoami`
and on `POST /bills`. **GREEN, and sitting immediately beside them:**
`the token held before the lock is refused` and
`a locked account cannot reach the money path` — the two STATUS cells. The
request is still 401; it falls through to the version check and comes back
`token_revoked`. **A status-only proof would have been 57 of 57 with the guard
deleted.** This is the phase's finding, and it is a measurement.

**Both reverts proven by TWO independent hashes each**, and re-confirmed at the
end of the phase: `main.py` `git hash-object 7d531e96…` / sha256 `e616fbd5…`;
`auth.py` `git hash-object 12f62014…` / sha256 `ec30b1fb…`. Each mutation
required killing and restarting uvicorn (no `--reload`).

**The proof set, each run bare, one command per invocation.** Twelve at exit 0:
`prove_auth`, `prove_revocation`, `prove_bills`, `prove_rls`, `prove_master`,
`prove_master_write`, `prove_master_data_gate`, `prove_seller_pricing`,
`prove_shop_time`, `prove_daily_report`, `prove_backup_restore`,
`prove_docno_clock`. `prove_reconcile` exit 1, **113 `[OK]` / 4 `[FAIL]`**, the
four already recorded, unchanged by this work; every money injection passed.
`reconcile.py` names `users` only by table and by its two constraint names, so a
new column disturbs nothing there. Both mobile TypeScript programs exit 0 bare,
which for a server-only change is a regression check and evidence about nothing
else.

**ONE RUN WAS DISCARDED RATHER THAN COUNTED.** The first `prove_auth` went
through `| tail -6`, so `tail` owned the exit code — `CLAUDE.md`'s pipe footgun
exactly. Everything above was re-run bare with redirection, which is not a pipe.
A second counting trap bit in the same session: `grep -c` over a proof's output
stopped at "Binary file matches" because the 403/404 bodies carry Thai, so every
cell count here was re-taken with `grep -a`.

**WHAT THIS DOES NOT ESTABLISH.**

- **Nothing ran on a handset.** No screen was drawn. Whether a locked account
  looks like anything sensible on a phone is untested.
- **The mobile sign-in loop is DERIVED, not observed.** A locked account's phone
  will invite the operator to sign in and the sign-in cannot work; that is read
  out of the client's 401 handling against the server change, and **no device
  pass has been run against a locked account.** Recorded in `OPEN_ITEMS.md`
  against P3.7, which owns the screen and the decision about what a phone may
  honestly be told.
- **`P1.4`'s stated predecessor P1.3 is not done.** `ROADMAP.md` makes P1.4
  depend on it because an account is created and locked inside a tenant. The
  capability was built and proven against the uuid-carrying login; what it
  cannot yet do is be exercised by a human typing a shop code. Skipped
  knowingly, not overlooked.
- **No account has ever been locked by a person.** Every lock in this record was
  performed by a proof script or a probe.
- **`recycle_lock_scratch` and one more dump directory now exist.** Neither was
  removed, because `OPEN_ITEMS.md` records that no retention rule exists and
  that inventing one in passing is how a convention gets set by accident.

### 2026-08-07 — P1.10, `prove_reconcile.py` back to green (a proof, not the product)

**NO DEVICE AND NO PRODUCT CODE.** Everything below is a proof script, a checker and
a scratch database on this box. One file changed. No dated green elsewhere in this
file is refreshed by any of it.

**THE FOUR FAILING CELLS WERE TWO DIFFERENT DEFECTS**, which `OPEN_ITEMS.md` and this
file had both recorded as one for four days. Reproduced first, from a run made rather
than read: **113 `[OK]` / 4 `[FAIL]`, exit 1**, against a copy restored from the
post-0007 dump (523 rows, 2 tenants).

- **Three were counts of the destroyed database.** `:634` `{"T0": 91}`, `:636`
  `rows_visible_with_no_tenant_context=46`, `:718` `rows_at_start=46 rows_at_end=47`.
  The T0 figure is **2N−1** where N is the tenant count: every tenant sees N instead
  of 1, and every tenant except the `min(id::text)` one also reports the wrong visible
  tenant. Confirmed at three points — 46→91 (the 2026-08-02 green), 48→95 (recorded in
  `OPEN_ITEMS.md`), and **2→3 measured here.** *(The "3 tenants, T0 got 3" line in
  `OPEN_ITEMS.md` does not fit that formula, which predicts 5. Noted, not chased.)*
- **The fourth held no count and is a different defect.** `:716` is
  `counts.get("X3") == 1` and hardcodes nothing. It was red because **X3 genuinely
  did not fire**: the checker reported `exit 0, 0 violations {}`. Established from the
  run's own output — the parent printed `inserted tenant … mid-run`, so it received the
  marker and issued the INSERT; the marker is printed after the checker takes its
  opening fingerprint; X3 still saw no drift; therefore the row landed after the
  CLOSING fingerprint.

**THE CAUSE, MEASURED.** `reconcile.py`'s entire report over this 2-tenant copy is
**5364 bytes**, with the `=== structure` marker at byte **253**. Python block-buffers
a non-tty stdout at **8192** bytes, so nothing reaches the pipe until the child exits.
**Disproof run with the prediction written first, and it required editing nothing:**
`PYTHONUNBUFFERED=1` took the failures from **4 to 3**, turning `X3: a row landing
mid-run is reported` green and leaving the other three red — exactly as predicted.
Written up as the EIGHTH mechanism in
`lessons/a-check-that-never-went-red-was-never-observed.md`.

**THE INJECTION COUNT IS 19**, measured three ways: the header prints
`=== injections (19) ===` from `len(injections)`; `grep -c "^        Injection($"`
returns 19; and `aa0a5d5`, the only commit that has ever touched the file, also holds
19. `git grep "23 injections"` returned exactly one line — `PROJECT_STATUS.md:2212`,
introduced by `9673171` — corrected above with no reason recorded for the 23.

**THE REPAIR.** The tenant count and the tenant id list are read ONCE in `fixtures()`,
before any injection and before the X3 probe moves them, from the prove script's own
superuser connection: a different process, role and query from the checker, which
writes nothing, so no defect in it can move the expectation. Deliberately NOT parsed
out of the checker's report, which is the object under test
(`lessons/a-checker-must-not-share-the-code-it-checks.md`, and its sign-flipped twin
`a-differential-control-is-only-as-good-as-its-weaker-side.md`). **T0 is asserted by
NAME, per tenant, not by count:** 2N−1 transcribes how many problem strings
`context_check` happens to append, which is a convention a second author could not
re-derive, and a count cannot tell "T0 fired for every tenant" from "one tenant fired
three times" — the failure T0 exists to catch.

**GREEN, each run bare, one command per invocation, redirected and never piped.**

| run | when | cells | exit |
|---|---|---|---|
| 1 | before any break | 119 `[OK]` / 0 `[FAIL]` / **1 `[SKIP]`** | **0** |
| 2 | immediately after, no reseed | 119 / 0 / 1 | **0** |
| 3 | after all four breaks were reverted | 119 / 0 / 1 | **0** |

The single skip is pre-existing and correct: the post-0007 dump arrives CLEAN, so the
diagnosis claim has no dirty baseline to demonstrate against and is skipped rather
than passed.

**EACH REPAIRED CELL OBSERVED GOING RED, AND EACH BREAK LEFT ITS NEIGHBOURS GREEN.**
Cells: **1** = T0 by name, **2** = the `rows_visible…=N` needle, **3** = `X3 …
reported`, **4** = the `rows_at_start/end` needle.

| break | where | 1 | 2 | 3 | 4 | exit |
|---|---|---|---|---|---|---|
| A — T0 loses its "how many are visible" problem | `reconcile.py` `context_check` | **RED** | **RED** | green | green | 1 |
| B — the blind read reports one row fewer | `reconcile.py` `blind_read` | green | **RED** | green | green | 1 |
| C — `-u` removed from the X3 child | `prove_reconcile.py` | green | green | **RED** | **RED** | 1 |
| D — the X3 row misreports its end count | `reconcile.py` `did_it_move` | green | green | green | **RED** | 1 |

**Break A is the whole argument for asserting T0 by name.** The old `{"T0": 91}` would
ALSO have gone red under it — T0's count falls to 1 — but it could only have said that
a number was wrong. The by-name cell NAMED WHICH TENANT WENT UNCHECKED:
`11111111-…`, the `min(id::text)` one, whose only remaining T0 problem was precisely
the one the break removed. That is the discriminating field rather than the outcome two
mechanisms share.

**Break C reproduced the original `got {}` on the repaired file**, confirming the
buffering mechanism a second time and that `-u` is load-bearing rather than decoration.

`reconcile.py` reverted and verified byte-exact after every break: `git hash-object`
`ded4ebfd…`, sha256 `c461115b…`, 54654 bytes, identical before and after.

**THE ONE-TENANT RUN.** A copy was restored and the second tenant's whole graph removed
(33 rows across ten tables, one transaction), leaving `SELECT count(*) FROM tenants` =
**1**. The run exits **0 with FOUR skips**, each printing its reason: the diagnosis
claim, plus **T10, S3/T0 and S3/X2 — the three injections that exercise tenant
isolation.** None can fire on one tenant. **Two of those three skips were not asked for
and were forced:** reaching the S3/T0 skip meant `fixtures()` had to survive the absence
of a second tenant, where it previously died on `rows[1]` with an IndexError; and once
past it, S3/X2 and T10 fail for the same structural reason. A pilot shop's database has
one tenant (`ROADMAP.md` D10), so this is the ordinary case there, not an exotic one.

**EXIT 2 ON AN UNFIT FIXTURE, distinct from exit 1, observed on a copy the checker
itself calls clean.** With the voided-bill fixture removed, the run printed
`the normalised copy is a clean, exit-0 run to inject into - exit=0 violations=0 {}`
and then `PROVE_RECONCILE INCONCLUSIVE: the copy does not hold the fixtures this proof
needs: 204 active single-line bills below the top of the series (2 wanted) and 0 voided
bills (1 wanted). Exit 2 — the FIXTURE is unfit. Deliberately NOT exit 1.` **Zero
violations and exit 2**, so the code cannot be read as "the money is wrong". Exit 1
remains reachable and was observed four times in the breaks above.

**WHAT THIS DOES NOT ESTABLISH.**

- **Nothing ran on a handset and no product code changed.** This phase repaired the
  proof of an instrument. It says nothing new about any bill.
- **`reconcile.py` is unchanged**, and nothing here strengthens it. Its S4 role check
  remains unproven by execution for the reason it always was.
- **The X3 probe is still a race**, now failing CLOSED. It can go red on a small copy
  if the sweep finishes between the marker arriving and the INSERT committing; there is
  no path to a false green. Recorded in `OPEN_ITEMS.md`.
- **The 46-tenant half of the buffering explanation is inference, not measurement.**
  5364 bytes over 2 tenants was measured; that the pre-rebuild report exceeded 8192 is
  reasoned from it and cannot be re-measured, that database having been replaced.
- **`normalise()` still carries a hardcoded `interval '7 years'`**, and against a clean
  dump it does nothing at all (`DELETE 0, DELETE 0, UPDATE 0`), so its own correctness
  is unobserved on every current run. Out of this phase's scope; in `OPEN_ITEMS.md`.
- **The scratch-database inventory is UNCHANGED.** `recycle_recon_scratch` was
  restored, mangled and restored again; no new database and no new dump directory was
  created.

### 2026-08-07 — `GET /users`, the roster (server + proof)

**NO DEVICE AND NO SCREEN.** Everything below is an HTTP response, a proof script
or a hash on this box. No dated green elsewhere in this file is refreshed by any
of it. Two files changed: `server/app/users.py` and
`server/scripts/prove_revocation.py`.

**PORTS 8137 AND 8138 WERE CHOSEN BECAUSE NOTHING ELSE ON THIS BOX HAS A REASON
TO TOUCH THEM.** A background task this session did not create was observed
reporting `Restart uvicorn on 8099 against dev with the reverted code`, so 8099
was treated as contested ground. Neither 8137 nor 8138 is any script's default
(8000, 8098 and 8099 are), neither appears in any code — the only `git grep` hits
are coincidental substrings inside `uv.lock` sha256 hashes — and both were free.
**8137 served dev; 8138 served the scratch copy.** Note also that the harness
reported `exit 127` for a uvicorn started in the background AND still running, so
no server claim here rests on an exit code; every one rests on a response.

**WHICH CODE AND WHICH DATABASE, ESTABLISHED BY A RESPONSE AT EVERY STEP.** The
route's own presence is the code probe — `GET /users` answered **404 for all four
callers** before the change (22-byte `{"detail":"Not Found"}`) and **401
unauthenticated** after. The database probe is a marker seller created through
**`POST /sellers`** — the real path, not a direct INSERT — present in
`recycle_users_scratch` (1 row) and absent in `recycle` (0), read out of both
databases:

| step | port | database | staff tier | roster ids |
|---|---|---|---|---|
| baseline | 8137 | DEV (marker absent) | 403 | correct |
| scratch baseline | 8138 | SCRATCH (marker present) | 403 | correct |
| mutation C | 8138 | SCRATCH | 403 | **both the tenant uuid** |
| mutation D | 8138 | SCRATCH | **200 (widened)** | correct |
| after both reverts | 8138 | SCRATCH | 403 | correct |
| final | 8137 | DEV (marker absent) | 403 | correct |

**THE ENDPOINT, READ OFF RESPONSES.** Tenant A admin → 200, two entries, keys
exactly `full_name, is_active, role, user_id, username`. Tenant A staff → **403**
`kind=forbidden` `code=admin_required`. Tenant B admin → 200 with a roster
DISJOINT from A's, A's staff absent from it, B's own admin present. Both tenants
hold a user named `staff`, so a roster resolved by username rather than by tenant
context would have collided there and did not. `include_inactive` exercised in
both directions: locking staff A left the default roster `['admin']` and
`?include_inactive=true` `['admin','staff']` with `is_active=False` reported
honestly; unlocked, and the restore read back off a response.

**THE FORBIDDEN COLUMNS ARE ASSERTED ON RAW BYTES**, not parsed keys and not
decoded text — the 403 bodies carry Thai and this box is codepage 874, so bytes
need no codec to be believed. `b"password_hash"` and `b"token_version"` absent
from every 200.

**THE PROOF: `prove_revocation.py` CASE 6b, 13 new cells.** Green TWICE bare with
no reseed, **70 `[OK]` / 0 `[FAIL]`** each run (57 pre-existing + 13). Counted by
`grep -c '^  \[OK  \]'` — anchored at line start with `check()`'s exact
two-space indent and padding, which no prose in the file can produce. That
mattered: an earlier draft printed `[OK]`/`[FAIL]` inside CASE 9's text and an
unanchored grep read them as cells, returning `OK=72 FAIL=2` over a run that
exited 0. The brackets were removed at source rather than documented, because it
is the trap `proveSignOut` already paid for once.

**ONE CELL THE BRIEF DID NOT SPECIFY WAS ADDED, and without it a mutation would
have fired nothing.** The five cells asked for carry no assertion about the auth
tier, so the tier mutation would have run fully green over a wide-open gate.
Three tier cells (status, kind, code) are in CASE 6b for that reason.

**BOTH MUTATIONS EXECUTED AGAINST `recycle_users_scratch`, NEVER DEV.**

| mutation | what changed | exit | fired | stayed green |
|---|---|---|---|---|
| **C** — the id resolves from the wrong column (`SELECT tenant_id AS id …`) | `users.py` `_USER_SELECT` | **1** | 54 OK / **16 FAIL**: the id cell, the POSITIVE CONTROL, and 14 across CASE 7/8 in cascade | the lookup cell, all three tier cells, the absence cell, all four byte checks |
| **D** — `require_admin` → `get_principal` | `users.py` `list_users` | **1** | 67 OK / **3 FAIL**: exactly the three tier cells | everything else — every other call in the file uses an admin token |

**Mutation C is the one that carries information.** Row count, usernames, full
names, roles, `is_active` and the tier were ALL correct under it — a shape-only
assertion would have been fully green. `get_principal` is not imported by
`users.py`, so mutation D must add the import or it is a `NameError` at import,
uvicorn never boots, and "the tier is open" and "nobody could run the check"
share an outcome; that is recorded in CASE 9.

**A WRITTEN PREDICTION WAS WRONG AND THE RUN CORRECTED IT.** CASE 9 predicted
both tenant cells would stay green under mutation C. **The positive control fired
too**, because it also asserts on an id and every id in B's roster was equally
wrong. Only the disjointness cell survived — by comparing two WRONG ids that
happened to differ, i.e. true by accident rather than by the property it names.
The correction is written into CASE 9 rather than applied quietly.

**A VACUOUS PASS WAS CAUGHT ON THE FIRST EXECUTION OF THE NEW CASE.** The first
run used `b_admin_token`, which CASE 5 deliberately revokes to prove
self-revocation. `GET /users` answered 401, `.get("users", [])` made the roster
`[]`, and `tenant A's staff is ABSENT from tenant B's roster` printed `[OK]` over
a response holding no roster at all. **Two cells fired — the status cell and the
positive control** (an earlier report of this said the control was the only one;
that was wrong). The status cell would have failed the run anyway, but under the
WRONG NAME. Under mutation C the status cell is green, the absence cell is green,
and the positive control is the only red in the file — which is what makes this a
mechanism rather than a note about token hygiene. Ninth mechanism in
`lessons/a-check-that-never-went-red-was-never-observed.md`.

**REVERTS PROVEN BY TWO HASHES EACH, after every mutation.** `users.py`
`git hash-object f1679b94d4e3b4f817d6402759057b727bed7dad`, sha256
`fb89607ceec81acb4e2851fb7f1b0dedde45e67ca76ce29bfa23ded4ee11d7ef`, 19724 bytes —
identical to baseline after mutation C's revert and again after mutation D's.

**THE FULL SERVER PROOF SET RE-RUN AFTER THE PROOF EDITS, each bare, one command
per invocation, redirected and never piped. FOURTEEN runs, every one exit 0:**
`prove_revocation` (twice, 70/0 each), `prove_auth`, `prove_bills`, `prove_rls`,
`prove_master`, `prove_master_write` (128), `prove_master_data_gate` (15),
`prove_seller_pricing` (27), `prove_shop_time` (12), `prove_daily_report` (74),
`prove_backup_restore`, `prove_docno_clock` (12, `--database
recycle_clock_scratch`), and **`prove_reconcile` 119 `[OK]` / 0 `[FAIL]` / 1
`[SKIP]`, exit 0** against `recycle_recon_scratch` restored from the post-0007
dump. `prove_master` needed `API_BASE_URL` set explicitly — its default is 8000.

**WHAT THIS DOES NOT ESTABLISH.**

- **Nothing ran on a handset and no screen exists.** `P3.7` owns the screen. Whether
  a roster is usable, or a locked account looks like anything sensible on a phone,
  is untested.
- **No client calls this endpoint.** Mobile does not, desktop does not exist. The
  only caller is `curl` and the proof.
- **The tier is a decision, not a measurement.** `require_admin` is proven to be
  what the code does; that it is what the OWNER wants is an open item, and the
  endpoint would have to change if the answer changes.
- **`prove_docno_clock`'s fixture is a schema behind.** `recycle_clock_scratch` is
  at 0006 while live is 0007. It passed because it builds its own `Principal` and
  never calls `get_principal`; a future `create_bill` change touching a 0007+
  column would fail there for a fixture-age reason.
- **`recycle_users_scratch` and the dump `recycle_20260807T151023Z_users-phase3`
  now exist.** Neither removed; no retention rule invented. Added to the inventory
  in `OPEN_ITEMS.md`.
- **The mutation runs left 3 bills in `recycle_users_scratch`** (338 against dev's
  335). They are in a scratch copy, which is the whole point, and they stay there
  until it is dropped.

### 2026-08-09 — the directory role, migration 0009, S4, and two tools (eleven commits)

**NO DEVICE, NO SCREEN, AND NO PROOF RUN BY THIS SESSION.** This entry was written
after the fact, from the commits and from the cluster. Every claim below is marked
either MEASURED HERE — this session ran the query or read the file today — or
RECORDED FROM THE COMMIT, meaning the commit message asserts it and this session
did not re-run it. **The distinction is the point of the entry**: nine commits
landed with no status update, and a status file that adopts a commit message's
greens without saying so is exactly the failure that produced the gap.

**ELEVEN COMMITS, NOT NINE, AND ONE IS NOT FROM TODAY.** `f009415` is dated
2026-08-08 23:56:53 +0700; the other ten are 2026-08-09. The nine that are WORK
are `f009415` through `2c8f300`; `845355e` and `eb049e5` are tooling added while
writing this up.

| commit | what it did |
|---|---|
| `f009415` (08-08) | `db/init/00_init_roles.sql` re-runnable (DO blocks, `\gexec`); adds the `recycle_directory` role, `CONNECT` on `recycle`, no `USAGE` on `public` |
| `015bee3` | repairs three citations that `f009415`'s rewrite moved (34 → 117 lines) |
| `12d16a2` | migration **0009** — schema `directory`, `directory.shop_codes`, precondition guard on `pg_roles`, downgrade refuses once a code is issued |
| `0168d8e` | states what tenant isolation covers and what it does not — the GUC is set by the app role FOR ITSELF |
| `fc9cd5c` | records D4 and D2's open half as decided |
| `1e37621` | stale odds and ends; the `Measure-Object -Line` footgun |
| `7d13b9c` | proof gate 2 refused `ALTER ROLE` and admitted `ALTER USER`; new lesson `a-gate-that-matches-a-keyword-misses-its-aliases.md` |
| `50e82c7` | S4 covers `recycle_directory`; `REQUIRED_ROLES` becomes the single declaration; `examined` becomes enforceable |
| `2c8f300` | S4's two blind spots into `CANNOT_SEE`; `not_injected()` stops naming roles |
| `845355e` | `tools/build_paste_set.py` — the paste set and its manifest |
| `eb049e5` | `START_HERE.md` — the advisor's two unprompted duties |

**MIGRATION 0009 IS COMMITTED AND UNAPPLIED. MEASURED HERE.** `recycle_pg` holds
eight databases; **not one has a schema named `directory`** — `SELECT count(*) FROM
pg_namespace WHERE nspname='directory'` returned **0** in every one of `postgres`,
`recycle`, `recycle_clock_scratch`, `recycle_lock_scratch`,
`recycle_recon_pre0005b`, `recycle_recon_scratch`, `recycle_restore_scratch`,
`recycle_users_scratch`. `alembic_version` in `recycle` reads **0008**. The other
fixtures read: `recycle_clock_scratch` 0008, `recycle_recon_scratch` 0008,
`recycle_lock_scratch` 0007, `recycle_restore_scratch` 0007,
`recycle_users_scratch` 0007, `recycle_recon_pre0005b` 0004. **Nothing reads
`shop_codes`** — no endpoint, no client, no code path of any kind.

**`recycle_directory` EXISTS ON THE DEV CLUSTER BY HAND-APPLICATION, NOT BY ANY
MIGRATION, AND ON NO OTHER CLUSTER. MEASURED HERE.** `pg_roles` on `recycle_pg`
returns exactly three `recycle%` roles — `recycle_app` (no rolconfig),
`recycle_owner` (no rolconfig), **`recycle_directory` with
`{search_path=directory}`**. It got there because `db/init/00_init_roles.sql` was
applied by hand: the Postgres entrypoint runs that file **only on an empty data
directory**, and this cluster has been up two days with data in it. No migration
creates the role — 0009 GRANTS to it and guards on its existence, which is why it
reads `pg_roles` before it writes. The second cluster on this box,
`infra-postgres-1` (an unrelated project, `tirerescue`), returns **0** roles
matching `recycle%`. **A fresh clone therefore does not have this role**, and 0009
will refuse there with its own RuntimeError rather than an asyncpg error — that
refusal is RECORDED FROM `12d16a2`, observed on a throwaway, not re-run here.

**S4 NOW COVERS THREE ROLES AND ASSERTS `rolconfig`. VERIFIED HERE BY READING THE
FILE.** `reconcile.py` `REQUIRED_ROLES` (`:353-357`) is the single declaration and
carries `recycle_directory: {"search_path": "directory"}`. The query (`:970-972`)
selects `rolname, rolsuper, rolbypassrls, rolconfig` with `rolname = ANY($1::text[])`
built from that dict, so the SQL, the missing-role arm (`:976`) and the settings
loop (`:980`) cannot drift from each other; the title names no role. Comparison is
**per setting name, never the array whole**, and `examined` reads "N of M roles
(...); C of D declared setting(s) compared" with both halves enforced rather than
displayed. **Its two blind spots are in `CANNOT_SEE` (`:1290-1324`), printed on
every run, green or red**: (1) S4's subject is the CLUSTER, not the database under
test — `pg_roles` is shared, so no dump moves it and no fixture exercises it, and a
green S4 beside a restored scratch copy is a statement about the live money
database too; (2) it checks the VALUE of `search_path` and never that the schema
EXISTS, with three consequences — it cannot distinguish never-upgraded from
downgraded, cannot see a coordinated rename in source, and **cannot see a
per-database override**. RECORDED FROM `2c8f300`: the third was MEASURED on a
throwaway cluster (`tw_s4_` prefix, own volume, port 5599, loopback only) —
`ALTER ROLE … IN DATABASE … SET search_path` writes `pg_db_role_setting` and leaves
`pg_roles.rolconfig` reading `{search_path=directory}`, so **S4 reports green while
a session in the one database it is about gets something else**. Teardown proven;
`recycle_pg` unchanged across it.

**THE PREDICATE WIDENING IS NOT DONE, AND IS CURRENTLY UNPROVABLE ON EVERY FIXTURE
THAT EXISTS. VERIFIED HERE, BOTH HALVES.** `reconcile.py` still bounds its
enumeration to schema `public` at **seven sites** — `:883`, `:892`, `:925`, `:929`,
`:931`, `:1021`, `:1023` — so a relation in schema `directory` is invisible to it.
The limit is the PREDICATE, not the exclusion lists: adding `'shop_codes'` to a
`NOT IN` changes nothing, because the enumeration never produces the name. **And it
cannot be proven today by any fixture on this box**, because the widened predicate
would have to find a relation outside `public` and no database here has one — the
same measurement as above, `directory` schema count 0 in all eight. Until 0009 is
applied somewhere, a green from a widened S1/S2/S3/S5 would be green over an empty
set. **Note the debt's own citations have already rotted**: `12d16a2` recorded the
seven sites as `:809`, `:818`, `:851`, `:855`, `:857`, `:903`, `:905`, and
`50e82c7` and `2c8f300` then added 161 lines to the file. The list above was
re-derived today, not copied.

**`restore_db.py` WILL REPORT A FALSE FAILURE THE MOMENT 0009 IS APPLIED. VERIFIED
HERE BY READING BOTH FILES.** `backup_db.py` (`:348-352`) parses each
`COPY <table> FROM stdin;` and strips **only** a `public.` prefix, so a
`COPY directory.shop_codes FROM stdin;` block is recorded in the manifest under the
key `directory.shop_codes`, unstripped. `restore_db.py` (`:300-304`) builds its
counts from `n.nspname = 'public'` alone, so that key can never appear on the
restored side; `:316` walks `set(expected) | set(counts)` — the UNION — so the key
is compared, `want` is a number, `got` is `None`, and `:323-324` calls `fail()`.
**Every row would have landed correctly and the restore would be reported as
broken.** RECORDED FROM `12d16a2`: it also reddens `prove_backup_restore.py:384`
and `prove_reconcile.py` `restore_copy()` `:358`. Nothing has been changed to
prevent this; the debt is filed in `OPEN_ITEMS.md` and the trigger is the first
backup taken after 0009 is applied.

**THAT SECOND CITATION READ `prove_reconcile.py:331` AND WAS WRONG. Corrected
2026-08-09, re-derived at `0aee22e` rather than carried from a report.** Line 331
is a fragment of the `PROVE_RECONCILE OK, WITH SKIPS` message. The
`RESTORE_EXIT=none` string is at `:358`, inside `restore_copy()`, which begins at
`:343`. **This is the SECOND rotted citation traced to `12d16a2`** — the first is
the reconcile public-only predicate list two paragraphs above, which this file
already records as re-derived rather than copied. One commit, two stale pointers,
and neither looked stale. The mechanism in both was correct; only the position
moved, which is precisely why nobody re-checked it.

**AND THE CLAIM IT SITS IN IS NOW MEASURED RATHER THAN READ. See
`2026-08-09 — the 0009 key-space defect` below**: the restore red was reproduced
on a fixture, and it fires EARLIER than this paragraph implies — with the new
table holding zero rows, not once a code is issued.

**THE PROOF RUNS ARE RECORDED FROM THE COMMITS AND WERE NOT RE-RUN HERE.**
`2c8f300` states `reconcile.py` bare against `recycle_recon_scratch` exit 0 with
`CANNOT_SEE` moving 12 entries to 14 and every other cell byte-identical to the
previous baseline, and `prove_reconcile.py` exit 0 twice consecutively with no
reseed, 19 injections, 0 failures, 1 pre-existing SKIP. `50e82c7` states the D1/D2
differential runs. **This session ran none of them.** The last proof-suite run this
file records by observation is still the fourteen-run set under
`2026-08-07 — GET /users`.

**WHAT THIS DOES NOT ESTABLISH.**

- **No phase boundary was declared and `PROJECT_STATUS.md § Current phase` still
  names `GET /users`, landed 2026-08-07.** Whether these eleven commits constitute
  a phase, and what to call it, is the owner's to set; this entry records the work
  without claiming a phase closed.
- **Nothing here was run on a handset.** No device gap in this file is refreshed.
- **0009 has never been applied to a cluster that survived.** Every application was
  on a throwaway (`tw0009c_pg_a`, `tw0009c_pg_b`, both destroyed). The dev cluster
  was deliberately not migrated: `system_identifier 7669585484237623334`, unchanged.
- **The directory lookup does not exist as a code path.** The migration creates the
  relation; no endpoint resolves a code and no client sends one. Login still takes
  a tenant uuid.
- **A fresh clone cannot run 0009** until `db/init/00_init_roles.sql` is applied,
  and that file is DEV-ONLY by its own statement — its passwords are literal
  strings in a tracked file.
- **`recycle_clock_scratch` is no longer a schema behind.** The
  `2026-08-07 — GET /users` entry records it at 0006 against live 0007; measured
  today both read 0008. That earlier caveat is stale, and is corrected here rather
  than edited there.

### 2026-08-09 — the 0009 key-space defect, measured on a surviving fixture

**NO FIX IS INCLUDED AND THE DEFECT REMAINS OPEN.** `backup_db.py` and
`restore_db.py` are byte-identical to what they were before this work.
`reconcile.py` was not opened and no predicate was widened. What changed is that a
defect previously established by READING two files has now been reproduced, its
trigger measured, and one of its recorded inferences resolved against us.

**WHAT WAS BUILT, AND SURVIVES.** A throwaway database
`recycle_tw20260809_0009fixture`, restored from
`recycle_20260809T045731Z_pre-directory-role` (the only dump at 0008, verified out
of the artefact at `COPY public.alembic_version` and not off the directory name)
and then walked up the REAL upgrade path with `alembic upgrade head` rather than
migrated from 0001. It carries its own provenance as a database comment, readable
with `shobj_description`:

    created 2026-08-09; source dump directory
    recycle_20260809T045731Z_pre-directory-role; DROP WHEN: the backup/restore
    schema symmetry is green AND a dump taken at 0009 exists in the backup root.

Three dump directories under `E:\recycle-online-backups\`, and **that DROP WHEN
condition governs all four artefacts** — they are the fixture the next two phases
need, and nothing here may be deleted before it is met:

| directory | state |
| --- | --- |
| `recycle_tw20260809_0009fixture_20260809T120530Z_tw0009fixture-at-0008` | at 0008, the negative control |
| `recycle_tw20260809_0009fixture_20260809T120912Z_tw0009fixture-at-0009-empty` | at 0009, `directory.shop_codes` empty |
| `recycle_tw20260809_0009fixture_20260809T121049Z_tw0009fixture-at-0009-onerow` | at 0009, one code issued |

Each label states the migration version because nothing else in the artefact does
— `MANIFEST.json` records the source database and the instant and NOT the schema
version, which is the gap the backup-label entry in `OPEN_ITEMS.md` already names.

**WHAT WAS PROVEN, WITH THE NUMBERS.** The counting instrument was controlled
first: `grep -c "^COPY "` against a hand-built six-line file whose correct answer
is 3 returned 3 — not 4, so the pattern is anchored to line start; not fewer, so
blank lines are not being dropped, which is the `Measure-Object -Line` footgun.

- At 0008: **12** `COPY` headers in the dump against **12** user tables
  (`relkind` `'r'`; the `'p'` count is **0**, reported separately). They agree.
  No table in this fixture has zero rows, so this could not settle the
  empty-table question, and did not.
- At 0009 with the new table EMPTY: **13** headers. The header
  `COPY directory.shop_codes (tenant_id, code) FROM stdin;` is present with no
  rows between it and its terminator. The manifest records
  `"directory.shop_codes": 0`, unstripped. `restore_db.py` **exited 1**, printing
  `[FAIL] directory.shop_codes     dump=0  restored=None` with all twelve other
  tables `[OK]`, and `RESTORE FAILED: row counts differ from the dump for
  ['directory.shop_codes']`.
- At 0009 with one code issued (`TW9FXTR2`, constructed from `ck_shop_code` and
  avoiding `O`, `0`, `I`, `1`, `L`): the same red with `dump=1  restored=None`.
- **The restore it condemned was correct.** Read back afterwards, the target held
  schema `directory`, the table, and `alembic_version` 0009, with every public
  table's count equal to the dump's.
- **The second observable waits for the row and the first does not.** At 0009
  empty the summary read `844 rows` over an itemisation of 844 — in agreement. At
  0009 with one row it read `845 rows` over an itemisation of 844, `MANIFEST.txt`
  read `Rows      : 845 across 12 tables` in a list where `shop_codes` appears
  zero times, and `restore_db.py` echoed `rows in dump   : 845`.
- A FAILED `restore_db.py` prints **no** `RESTORE_EXIT` line at all: `fail()`
  calls `sys.exit(1)` before the print. Both reds above are exit 1 with the line
  absent, which is the `RESTORE_EXIT=none` that `prove_reconcile.py` reads.

**THE CONTROL THAT MAKES THE RED MEAN ANYTHING.** A backup of the SAME fixture at
0008 restored into the same default target with the SAME two scripts one migration
earlier: `RESTORE_EXIT=0`, twelve `[OK]` rows. Without that, a red at 0009 is
consistent with a bad fixture, a bad box or a bad pair of scripts, and establishes
nothing about the migration. A second control sits underneath the whole phase and
prevented a much worse outcome: `MIGRATION_DATABASE_URL` was pointed at a database
that does not exist and `alembic` was made to fail naming it, proving the override
reaches `env.py` before the real upgrade ran. `env.py` calls `load_dotenv()`, whose
`.env` names the LIVE database; had the override not won, `alembic upgrade head`
would have migrated `recycle`. Both databases read 0008 at that moment, so nothing
else could have distinguished the two outcomes.

**THE pg_ROLES GUARD — WHAT WAS ACTUALLY OBSERVED, AND WHAT WAS NOT.** What was
observed is that **NOTHING STOPPED THE MIGRATION**. `alembic_version` moved to
0009, `directory.shop_codes` is in `pg_class`, and both GRANTs resolved against a
real role — `nspacl` reads `recycle_directory=U/recycle_owner` and `relacl` reads
`recycle_directory=r/recycle_owner`. The guard is the first statement in
`upgrade()` and raises before anything is written, and `env.py` wraps the run in
one transaction, so those effects existing means the guard cannot have raised.

**That is an inference from an absence, and it is not the same thing as watching
the guard refuse.** A guard that had been deleted outright would have produced the
identical observation. **The refusal path of 0009 has never been seen by any
session of ours.** It is recorded in this file as observed on a throwaway cluster
that was then destroyed, it was not re-run here, and re-running it was explicitly
not this phase's job. Do not let "the guard was satisfied" stand alone anywhere: it
means "nothing raised", which is weaker, and the weaker statement is the true one.

**CORRECTIONS TO THIS FILE THAT THIS WORK FORCES.**

- **"0009 has never been applied to a cluster that survived" is now FALSE**, and
  it is the entry immediately above this one. It has been applied to
  `recycle_tw20260809_0009fixture` on the DEV cluster, which survives on purpose
  under the DROP WHEN condition quoted above. The dev cluster's own
  `recycle` database was NOT migrated and still reads 0008 with a `directory`
  schema count of 0, re-read at the end of the phase alongside its 385 purchase
  bills.
- The `prove_reconcile` bullet under what is built claimed the script restores a
  copy on every run. Corrected in place, with the flag that makes it conditional
  named.

**WHAT THIS DOES NOT ESTABLISH.**

- **No fix, and none is designed here.** `copy_block_counts` and the restore-side
  count query still disagree about schema qualification.
- **No proof suite was run.** Not `prove_reconcile.py`, not
  `prove_backup_restore.py`, neither of which this phase touched or measured.
- **Nothing was run on a handset**, and no device gap in this file is refreshed.
- **The directory lookup still does not exist as a code path.** The fixture has a
  row in `directory.shop_codes` because one was inserted by hand to move the
  second observable; no endpoint resolves a code and no client sends one.

### 2026-08-09, later — the restore side fixed, the backup side deliberately not

**ONE ARC WITH THE ENTRY ABOVE, and it is worth reading as one.** That entry
reproduced the defect on a fixture and measured its trigger; this one records the
fix, which covers ONE OF THE TWO SIDES. Landed as `4150833`, one file,
`server/scripts/restore_db.py`, 173 insertions and 19 deletions.

**THE TRIGGER IS MIGRATION-TIME, AND THAT IS THE FINDING THAT ROTS FASTEST INTO
"we fixed it".** `pg_dump` writes a `COPY` header for a table holding ZERO rows.
Measured: 12 headers in the dump at 0008, **13 at 0009 with `directory.shop_codes`
holding nothing at all**, manifest key `"directory.shop_codes": 0`. So the red
arrives on the first backup taken after the migration is applied — before any
endpoint reads the relation, before any client sends a code, before the feature
exists as a code path. **Everyone's stated guess was first-use**, and
`OPEN_ITEMS.md` had recorded it in those terms as an inference nobody had
measured. The window between "applied" and "first row", which that inference
assumed existed, is zero wide.

**THE PARENT'S NUMBERS, MEASURED ON UNMODIFIED CODE BEFORE ANYTHING WAS TOUCHED.
This is the control, and without it none of the after-numbers mean anything.** A
green measured only after a change is not a control; it is consistent with a
change that silenced the check.

| measured on the parent | result |
| --- | --- |
| the two 0009 dumps | **exit 1**, `[FAIL] directory.shop_codes  dump=0  restored=None` and `dump=1  restored=None` |
| dumps at 0003 / 0006 / 0008, versions read out of each body's `COPY public.alembic_version` block and never off the directory name | **exit 0**, with 11 / 11 / 12 want-got rows equal to each manifest's 11 / 12 keys |
| the bare-key three-beat | green `dump=24 restored=24`, **red** `dump=24 restored=20`, green `dump=24 restored=24`, with the database read back at each beat: 24, 20, 24 |

The same three, re-run after the change: the 0009 pair now **exit 0** with
`directory.shop_codes` present as an OK row carrying a number on BOTH sides —
`dump=0 restored=0` and `dump=1 restored=1` — the older three still exit 0 with
11 / 11 / 12 rows, and the three-beat still reads green / red / green with the
same figures. **The fix did not weaken the case that already worked.**

**THE MEASUREMENT THE PARENT COULD NOT MAKE AT ALL, and it is the one that
distinguishes a fix from a silencing.** A 0009 dump was fabricated whose body had
lost the `shop_codes` row while its manifest still claimed one. Under the parent:

    [FAIL] directory.shop_codes     dump=1  restored=None      <- intact dump, target holds 1
    [FAIL] directory.shop_codes     dump=1  restored=None      <- lossy dump, target holds 0

**Byte-identical output over opposite database states.** That table was not merely
misreported — IT WAS NOT BEING CHECKED. `restored=None` was never a count; it
meant "this key was never asked about", and the parent's target genuinely held the
row (`recycle_restore_scratch` read `0009|1|TW9FXTR2` immediately after that red).
Under the fix the same fabricated dump reads

    [FAIL] directory.shop_codes     dump=1  restored=0

and exits 1. A real count, and a red for the real reason.

**A BUG THE FIX'S OWN NEW CODE SHIPPED, CAUGHT BY THE ACCEPTANCE RUN, and the
warning that did not protect it.** The new presence probe compared `r[1] == "t"`.
`boolean::text` renders `true`/`false`; psql shows `t`/`f` only for an UNCAST
boolean. **All thirteen keys reported MISSING against a database that held every
one of them.** `backup_db.py` already carried the identical warning in its own
text at its superuser check — "comparing against 't' here silently failed every
check once" — and the file beside it made the same mistake within one session. A
warning written in one file does not protect the file next to it. What caught it
was the acceptance criterion, which demanded the key be PRESENT as an OK row with
a number on both sides rather than merely demanding exit 0: a `restored=None`
that had become `restored=MISSING` would have satisfied "exit 0" reasoning and
failed the actual test.

**THE DISPROOF.** `split_key` was mutated to resolve every key to `public`; the
0009 dump went red at `[FAIL] directory.shop_codes dump=1 restored=MISSING`,
because it then looks for `"public"."directory.shop_codes"`. Reverted, green
returned. A check that cannot be made to fail was never observed to work.

**WHAT IS NOT FIXED, DELIBERATELY — AND IT IS THREE DEFECTS, NOT ONE.**
**TRUE OF THIS PHASE, AND NO LONGER TRUE TODAY: two of the three were closed by
`cf2dadf` and `68d679d`, and only the summary-versus-itemisation defect remains.
See `2026-08-10 — identifier quoting on both sides`. Item 3's description below
was also wrong about the defect's shape and is corrected in place.**
`backup_db.py` was not touched, because its divergence has no repeatable control
yet and fixing both sides against one control means a regression could not be
attributed to a side. **THIS ENTRY SAID TWO UNTIL 2026-08-09**, when a control
pass built one relation per identifier shape and measured a third; the count is
corrected here and the third is item 3 below.

1. **The summary total versus its own itemisation.** It sums `counts_dump.values()`
   across every schema while the itemisation beside it iterates public tables
   only, so once a non-public row exists the total stops equalling its own list —
   measured, **845 against 844**, with `shop_codes` appearing zero times in the
   itemisation it is being counted into.
2. **`copy_block_counts` produces a WRONG KEY for any identifier `pg_dump` had to
   quote.** Measured this session with that function IMPORTED rather than
   reimplemented, so the answer cannot be wrong about the code it reports on:
   `COPY directory."Odd Name" (a) FROM stdin;` is keyed as **`directory."Odd`** —
   truncated at the space, quote character retained. The restore side now handles
   such a key correctly (`[OK  ] directory.Odd Name  dump=2  restored=2` against a
   fabricated dump carrying a real `directory."Odd Name"` relation); the writer
   cannot yet produce one.
3. **A quoted identifier in schema `public` makes `live_row_counts` count the
   WRONG RELATION where a colliding name exists, and abort only where one does
   not — see the correction below, which replaces this heading's original
   claim that it always aborts.** `live_row_counts` interpolates
   `public.{t}` UNQUOTED, so a relation `public."Odd Name"` yields
   `... count(*) as n from public.Odd Name ...` and psql refuses it. Measured
   2026-08-09 by creating that relation in a scratch database and running the
   real tool:

       BACKUP FAILED: psql failed (1): ERROR:  relation "public.odd" does not exist
       LINE 1: select 'Odd Name' as t, count(*) as n from public.Odd Name u...

   Exit 1, and **no `BACKUP_EXIT` line** — `fail()` calls `sys.exit(1)` before the
   print is reached.

   **CORRECTED 2026-08-09, AND THE CORRECTION IS THE WHOLE POINT: THE ABORT IS
   THE LUCKY CASE, NOT THE DEFECT.** The paragraph above read "IT FAILS CLOSED,
   WHICH IS THE SAFE DIRECTION — the danger is the MISSING EXIT LINE, not a
   corrupt backup." **That is false, and it is false in the dangerous
   direction.** Unquoted, `from public.Odd Name` is VALID SQL: it names relation
   `Odd` — folded to `odd` — with the ALIAS `Name`. It errored only because no
   relation `odd` existed. **Where one does, the statement SUCCEEDS and the
   backup records a count read from the WRONG TABLE**, with nothing red anywhere.
   Measured 2026-08-09 on `recycle_keyshape_scratch` after adding a decoy
   `public.odd` (11 rows) beside `public."Odd Name"` (13 rows): the unquoted code
   returns `{'Odd Name': 11}` — no error, no warning, the wrong number under the
   right label. So this defect does NOT fail closed; it fails closed only when
   the collision happens to be absent, and it fails SILENTLY and WRONG when it is
   not. The missing `BACKUP_EXIT` line is a real hazard and a lesser one.
   **`prove_backup_restore.py` CARRIES THE IDENTICAL UNQUOTED INTERPOLATION** at
   its own `row_counts()` — `f"select '{t}' || '=' || count(*)::text from
   public.{t}"` — so it would fail the same way on the same input. Read, not run;
   that file is not modified here and was not executed.

**WHAT THIS DOES NOT ESTABLISH.**

- **No proof was run.** `prove_backup_restore.py` was NOT run and the reason is
  now a queue item: it has no argparse and no `--database`, it reads
  `APP_DATABASE_URL` and inserts a marker bill into the LIVE database, and it
  voids rather than deletes it, so under hard rule 5 the bill and its `doc_no` are
  permanent. Its coupling to the changed file was established by READING instead:
  it gates on the child's `returncode` and builds its own counts from its own
  query, parsing none of this script's text. `prove_reconcile.py` DOES parse three
  strings — `RESTORE_EXIT=`, `RESTORE OK`, `rows in dump` — and the change touches
  none of them. Neither proof was executed.
- **The manifest format is unchanged**, deliberately, and still carries no
  version marker of any kind — measured across artefacts: the 2026-07-28 manifest
  has no `roles` key where the 2026-08-09 one does, and nothing in either says
  which shape it is.
- **Nothing was run on a handset**, and no device gap in this file is refreshed.
- **The dev database is still at 0008.** No migration was applied anywhere this
  phase.

### 2026-08-10 — identifier quoting on both sides, and the manifest key space

**ONE ARC ACROSS THREE COMMITS**, and it closes two of `backup_db.py`'s three
defects. `89d55ce` — every identifier reaching SQL in `restore_db.py` quoted.
`cf2dadf` — the same in `backup_db.py`, plus the correction below. `68d679d` —
the manifest key made to carry the LOGICAL relation name. Two more commits landed
in the same window and are status updates rather than work: `2413330` and
`72ba65d`.

**THE DEFECT'S REAL SHAPE, AND THESE FILES HAD IT WRONG.** Both this file and
`OPEN_ITEMS.md` described the third `backup_db.py` defect as failing CLOSED: an
abort, no artefact, the only hazard a missing `BACKUP_EXIT` line. **That was
false, and false in the dangerous direction.** Unquoted, `from public.Odd Name`
is VALID SQL — it names relation `Odd`, folded by PostgreSQL to `odd`, with the
ALIAS `Name`. It errored only because no relation `odd` existed. Measured
2026-08-09 after adding a decoy `public.odd` beside `public."Odd Name"`: the
unquoted code returns **`{'Odd Name': 11}`** where the truth is **13** — no
error, no warning, the wrong number under the right label. **The abort was the
lucky case; the defect's real shape is a silently wrong count in the manifest.**
Both files were corrected in `cf2dadf`, at all three passages that stated it,
with the old wording quoted inside each correction rather than deleted.

**WHAT MADE THE ACCEPTANCE TEST REAL, because before it there was one that
passed with the fix deliberately broken.** Two things, and neither is optional:

- **A DECOY.** `public.odd` (11 rows) is exactly what an unquoted
  `public.Odd Name` resolves to. Without it the defect merely errors and the
  dangerous case — the silent wrong count — cannot be observed at all.
- **DISTINCT ROW COUNTS PER RELATION**, so a count taken from the wrong table
  cannot coincidentally match the right one. Measured and each unique in that
  database: `public.odd` **11**, `public."Odd Name"` **13**, `public."don't"`
  **17**, against the counts already present (1, 2, 3, 4, 5, 6, 7, 24, 385,
  408).

`public."don't"` is there for a third reason: it is the only shape that forces
the LABEL literal to be escaped rather than the FROM clause, and no relation in
the non-public half carries a single quote.

**THE KEY-SPACE DECISION AND ITS BOUNDARY.** The manifest format did NOT change:
a public relation is still a BARE key, anything else is still `schema.relation`.
What changed is that the key now carries the LOGICAL name — pg_dump's quoting is
stripped, because `restore_db.py`'s `split_key` feeds each part through
`quote_ident`, and a key retaining the quotes would be quoted a second time and
name nothing. The reader partitions on the FIRST dot, which decides exactly what
the format can say:

| case | representable? |
| --- | --- |
| a dot inside a relation name in a NON-public schema (`q` + `a.b` → `q.a.b`) | **yes** — the reader stops at the first dot and returns `(q, a.b)` |
| a dot inside a PUBLIC relation's name | **no** — the key is the bare `a.b`, read as schema `a`, relation `b` |
| a dot inside a SCHEMA name (`x.y` + `t` → `x.y.t`) | **no** — read as `(x, y.t)` |

**The two unrepresentable cases COLLIDE with a legitimate key rather than
failing to parse.** They are ambiguous, not detectably wrong: nothing errors,
nothing can tell the two apart, and no check can be written that separates them
without a format change. That limit is the format's and is published in
`restore_db.py`'s CANNOT_SEE block.

**EVERY MANIFEST ALREADY IN THE BACKUP ROOT STILL RESTORES GREEN**, which is the
guarantee the change had to keep. Five artefacts written by the OLD parser,
spanning five schema ages, versions read out of each body's
`COPY public.alembic_version` block and not off its directory name (the version
parser's own control returning `9999` first):

| version | artefact | restore |
| --- | --- | --- |
| 0003 | `recycle_20260728T041551Z` | exit 0 |
| 0006 | `recycle_20260807T092659Z_post-0006` | exit 0 |
| 0007 | `recycle_20260808T074116Z_clock-guard` | exit 0 |
| 0008 | `recycle_20260809T045731Z_pre-directory-role` | exit 0 |
| 0009 | `…_tw0009fixture-at-0009-onerow` | exit 0 |

**THE POSITIVE RESULT.** The identifier-shape fixture backed up and restored
end to end: 22 relations, 22 manifest keys, 22 comparison rows, none absent, and
the source count, the manifest count and the restored count agreeing for every
one — including `q.a.b`, the dotted relation name that round-trips, and the
decoy pair 11 beside 13.

**WHAT THIS DOES NOT ESTABLISH.**

- **One `backup_db.py` defect remains OPEN**: the summary total sums across
  every schema while the itemisation beside it lists public tables only —
  845 against 844 when it was measured. Not fixed, not scheduled here.
- **`prove_backup_restore.py` still carries the identical unquoted
  interpolation** and is not fixed, because proving a fix means running it and
  it writes a permanent bill to the live database.
- **No proof script was run** in any of these commits.
- **Nothing was run on a handset**; the dev database is still at 0008.
  **SUPERSEDED THE SAME DAY: the live database is now at 0009.** See the entry
  below; that sentence was true when written and is the last thing in this file
  that said so.

### 2026-08-09 — migration 0009 applied to the live database

**THE FIRST WRITE TO `recycle` IN THIS WHOLE LINE OF WORK.** Everything before
it — the fixture, the three fixes, the key space — was done on throwaways so
that this could be done once, with a proven path underneath it.

**THE TARGET WAS PROVEN BY A CLUSTER-WIDE DIFFERENTIAL, NOT BY THE EXIT CODE,
and the reason is the whole point.** `env.py` calls `load_dotenv()`, and
`server/.env`'s `MIGRATION_DATABASE_URL` already names `recycle` — so a
deliberate override and a silent fallback to the configured default **land on
the same database**, and `alembic upgrade head` returns 0 either way. An exit
code cannot tell the two apart. What can is a before/after reading of EVERY
database on the cluster:

| database | before | after |
| --- | --- | --- |
| **`recycle`** | **0008, directory=0** | **0009, directory=1** |
| `recycle_clock_scratch` | 0008, directory=0 | unchanged |
| `recycle_keyshape_scratch` | 0009, directory=1 | unchanged |
| `recycle_lock_scratch` | 0007, directory=0 | unchanged |
| `recycle_recon_pre0005b` | 0004, directory=0 | unchanged |
| `recycle_recon_scratch` | 0008, directory=0 | unchanged |
| `recycle_restore_scratch` | 0008, directory=0 | unchanged |
| `recycle_tw20260809_0009fixture` | 0009, directory=1 | unchanged |
| `recycle_users_scratch` | 0007, directory=0 | unchanged |

**Exactly one database moved and it is the one that was meant.** The target was
also named in code rather than inherited: the URL was rebuilt from `.env` with
its database component REPLACED by an explicit constant and asserted before
anything ran, and the credential was kept off the command line because a DSN
carrying one has already been written verbatim into `.claude/hooks/*.log` once.
`ALEMBIC_EXIT=0`.

**THE PREDICTION WAS WRITTEN BEFORE THE RUN AND THE CATALOGUE WAS READ BACK
AFTER IT, item by item. Every item agreed and NOTHING UNPREDICTED APPEARED:**
`alembic_version` 0009; schema `directory`; `directory.shop_codes` at relkind
`r`; **three `pg_class` rows in that schema, not one** — the table plus
`shop_codes_pkey` and `uq_shop_code` at relkind `i`; columns `tenant_id uuid
NOT NULL` and `code text NOT NULL` and no others; four constraints —
`shop_codes_pkey` (p), `uq_shop_code` (u), `ck_shop_code` (c)
`CHECK ((code ~ '^[A-HJKMNP-Z2-9]{8}$'::text))`, `shop_codes_tenant_id_fkey`
(f); both grants and only those, `nspacl` carrying `recycle_directory=U` and
`relacl` carrying `recycle_directory=r`, with `recycle_app` in neither; zero
policies and `relrowsecurity` / `relforcerowsecurity` both false. The table
holds no rows. **The pg_roles guard's precondition was confirmed by query
first** — `recycle_directory` exists on this cluster by hand-application of
`db/init/00_init_roles.sql` and by no migration.

**NOTHING ELSE IN THE LIVE DATABASE MOVED**, compared against an ARTEFACT
written before the migration rather than against a memory: the manifest of
`recycle_20260809T173038Z_at-0008-pre-0009`, whose counts were parsed out of the
dump FILE. All twelve pre-existing tables equal, 844 rows both sides, **zero
tables changed**. Control: the same comparison against a manifest of different
content reports 11 tables differing, so the equality carries information.

**THE BACKUP PATH ON REAL MONEY DATA, AND IT IS WHY THE ORDERING WAS CHOSEN.**
Backed up at 0009 and restored: `BACKUP_EXIT=0`, `RESTORE_EXIT=0`, and

    [OK  ] directory.shop_codes     dump=0  restored=0

present, with a number on both sides. **On the parent code this exact restore
was the red that started this entire line of work** — a byte-correct restore
reported broken because the manifest key and the reader disagreed. The three
fixes went first precisely so the first backup after the migration would meet a
fixed writer and a fixed reader. Two backup directories, both kept:
`recycle_20260809T173038Z_at-0008-pre-0009`, the only pre-0009 copy of real data
that will ever exist and proven restorable before the migration ran, and
`recycle_20260809T173946Z_at-0009`.

**WHAT THIS DOES NOT ESTABLISH.**

- **P1.3 is NOT done.** Its DONE WHEN is a `POST /auth/login` carrying no uuid
  returning 200, run bare with the request and response recorded. Nothing reads
  `directory.shop_codes`, no endpoint resolves a code, no client sends one, and
  **nothing writes to that relation** — there is no provisioning path by any
  route. The schema half is what landed.
- **`backup_db.py`'s summary total against its own itemisation is still open**,
  the last of its three.
- **No proof script was run**, and nothing was run on a handset.
- **The dev cluster is a separate question**: `recycle` is the live database and
  is now at 0009; no other database was migrated.

### 2026-08-10 — recycle_directory's privileges measured, and the shop-code lookup decided

**Read-only throughout.** Every statement executed was a `SELECT` or a psql
meta-command. No `CREATE`, `ALTER`, `GRANT`, `REVOKE`, migration, proof script or
password change was run, and nothing under `server/app/` or `server/scripts/` was
touched. The credential never reached a command line: `pg_hba.conf` carries
`local all all trust`, so the role was reached over the container's Unix socket
with no password supplied anywhere.

**BOOT CHECK.** `recycle_pg` `Up 2 days (healthy)` on `5544->5432`. Repo at
`8b17bc2`, `git status --porcelain` **empty, 0 lines**, before and after. Migration
head per the files is **0009** — nine files, one linear chain `0001←…←0009`, and no
file names `0009` as its `down_revision`, so there is a single head — and the live
database is AT it, neither behind nor ahead.

**THE CLUSTER INVENTORY, AND THE ONE IN THIS FILE AT `§ 2026-08-09 — the directory
role` IS NOW STALE.** Measured across all nine `recycle*` databases:

| database | alembic_version | schema `directory` |
|---|---|---|
| `recycle` | **0009** | yes |
| `recycle_keyshape_scratch` | 0009 | yes |
| `recycle_restore_scratch` | 0009 | yes |
| `recycle_tw20260809_0009fixture` | 0009 | yes |
| `recycle_clock_scratch` | 0008 | no |
| `recycle_recon_scratch` | 0008 | no |
| `recycle_lock_scratch` | 0007 | no |
| `recycle_users_scratch` | 0007 | no |
| `recycle_recon_pre0005b` | 0004 | no |

That earlier entry lists `recycle` at 0008 and `recycle_restore_scratch` at 0007,
and names neither `recycle_keyshape_scratch` nor `recycle_tw20260809_0009fixture`.
**It is not rewritten** — a dated measurement is superseded rather than edited, the
rule this file already follows — and it was true when written. The correction lives
here and in `OPEN_ITEMS.md`. Note that the *last* bullet of that entry's successor,
"no other database was migrated", remains defensible as scoped to that operation:
the three other 0009 databases are a 0009-era fixture and restores of 0009 dumps,
not separate `alembic upgrade` runs. That was not measured today and is not claimed.

**THE ROLE.** `rolsuper f`, `rolinherit t`, `rolcreaterole f`, `rolcreatedb f`,
`rolcanlogin t`, `rolreplication f`, `rolbypassrls f`, `rolconnlimit -1`,
`rolvaliduntil` null, `rolconfig {search_path=directory}`. **Zero role memberships
in either direction** — which closes the third privilege path (direct grant, PUBLIC,
membership) that a listing of direct grants alone cannot rule out.

**WHAT IT HOLDS.** Every relation in every non-system schema, across all seven table
privileges, unfiltered — **exactly one row came back**:

    schema    | relname    | relkind | sel | ins | upd | del | trunc | refs | trig
    directory | shop_codes | r       | t   | f   | f   | f   | f     | f    | f

`nspacl` on `directory` is `{recycle_owner=UC/recycle_owner,recycle_directory=U/recycle_owner}`;
`relacl` on `shop_codes` is `{recycle_owner=arwdDxt/recycle_owner,recycle_directory=r/recycle_owner}`;
`nspacl` on `public` is `{recycle_owner=UC/recycle_owner,recycle_app=U/recycle_owner}`
— no `recycle_directory` entry and no PUBLIC entry. `pg_default_acl` holds **exactly
one row**. Column ACLs: none. Non-system functions executable: none. RLS on
`shop_codes`: `relrowsecurity f`, `relforcerowsecurity f`, **0 policies, 0 rows**.
`pg_catalog` `nspacl` and `information_schema` `nspacl` are both
`{postgres=UC/postgres,=U/postgres}`, exactly as `0009:64-67` predicted.

**THE CONTROL, REPORTED FIRST.** As the role: `directory.shop_codes` returned its
count, both columns, and its column list via `'directory.shop_codes'::regclass`. The
refusals below are therefore about grants and not about a broken session.

**THE REFUSALS.** Six schema-qualified reads of `public` tables, each:
`ERROR:  permission denied for schema public`. **Schema level, never relation
level.** Unqualified `SELECT count(*) FROM tenants` gives
`ERROR:  relation "tenants" does not exist` — no schema, no permission, no
migration named, which is the designed outcome `00_init_roles.sql:78-86` records.
`pg_authid` and `pg_shadow` are both refused.

**WHAT IT CAN SEE, and `0009:68-70` is right that this is larger than nothing.**
Tested as the role: the 12 table names in `public`, the 9 column names of
`public.users`, and RLS policy expressions in full, e.g.
`(tenant_id = (NULLIF(current_setting('app.tenant_id'::text, true), ''::text))::uuid)`.
126 of 140 `pg_catalog` relations are readable. It learns the SHAPE and no CONTENTS.

**TESTED ON EVERY DATABASE, BECAUSE THE CLAIM WAS NOT QUALIFIED BY ONE.** All nine
`recycle*`: `public` USAGE `f`, every read refused. **The expectation was that the
scratch copies would be weaker, and it was wrong** — see `§ Current phase`.

**FIVE CAPABILITIES OR LOCATIONS NO FILE IN THIS REPOSITORY CLAIMS** are recorded as
five separate entries in `OPEN_ITEMS.md`, with two bounding negatives beside them,
and are not restated here. The one that matters most is not about this role at all:
**"no `USAGE` on schema `public`" is a property of the DATABASE `recycle`, not of
the role** — in the `postgres` maintenance database the same role DOES hold `public`
USAGE. That one is also the lesson this phase owed.

**SECOND-HAND, AND LABELLED AS SUCH — a survey run in a DIFFERENT session, which
this session did not see and did not verify.** Reported, not measured:

- **Exactly one written passage in this repository addresses limiting repeated login
  attempts**, and the file it sits in declares in its own words that it records
  findings only and decides nothing. **That passage is therefore an OBSERVATION —
  not a requirement, and not a decision.**
- It exists **in no code and in no schema column**.
- **Nothing anywhere addresses repeated attempts at any endpoint other than login.**
  That absence is recorded in those words; it is as much the answer as a passage
  would have been.

**Its bound, recorded in the same breath.** "One passage" is bounded by what that
survey opened or reached with its patterns, and a survey reports what it read.
**The specific bound proposed for this record does not exist and is therefore not
cited**: a section of `ARCHITECTURE.md` whose title concerns failed attempts was to
be named as unread, and **there is no such section**. Verified here against that
file's complete heading list — thirteen `##` sections and their `###`
subsections — before the bound was written. The nearest two matches are
`## 7. The offline model: record state and failure class are different axes`, whose
"failure class" is sync classification and not login attempts, and
`### D1 — the provider gets a separate seat, not a third role`, which matched only
because "sepa**rate**" contains the letters. The bound stands without it.

**DECIDED — `ARCHITECTURE.md § 10. The three settled decisions`, D4.** The shop-code
lookup is a separate unauthenticated endpoint; the login body does not change; it
returns the tenant identifier and nothing else; it refuses identically whatever the
cause. Reasoning is there, not here.

**WHAT THIS DOES NOT ESTABLISH.**

- **No endpoint was written and no code path exists.** The decision is a decision.
- **P1.3's DONE WHEN is untouched** — a login carrying no uuid returning 200.
- **`TEMPORARY` was measured from the catalogue and NOT exercised**, because
  creating a temp table is a write and this pass took none.
- **One count is unreconciled**: `pg_catalog` readability is 126 by two independent
  `pg_class` definitions (SELECT-only, and any-of-six-privileges — both run, set
  difference empty), while `information_schema.tables` reported 127 in the role's
  own session. The extra row was not identified. Nothing above rests on it.
- **`template0` reports `CONNECT = t` from `has_database_privilege` while
  `datallowconn = f`** blocks it by a different mechanism. Do not read that cell as
  reachability.
- **The second cluster on this box was not enumerated.** `infra-postgres-1` has no
  `postgres` role (`FATAL: role "postgres" does not exist`, exit 2). It is a
  different project and not the cluster `.env` names.

### 2026-08-10 — the shop-code endpoint, and the criterion that had to be rewritten

**WHAT LANDED, `1951b19`.** `POST /auth/shop-code` in `server/app/directory.py`,
a new module rather than a third handler in `main.py`. Unauthenticated. Reads
through `directory_connection()` on the second engine (`f84b54d`), bound to
`recycle_directory` — a role holding SELECT on exactly one relation and no
privilege on any relation in schema `public`. Returns `{"tenant_id": "<uuid>"}`
and nothing else, enforced by a `response_model` so FastAPI STRIPS anything a
future handler adds rather than relying on the handler staying disciplined.
`main.py` gains three lines: an import, an `include_router`, and
`await directory_engine.dispose()` — the debt `f84b54d` named as owed by "the
first commit that opens a connection from the application".

**THE ENDPOINT DOES NOT VALIDATE THE CODE'S SHAPE, and that is a choice with a
reason.** A `pattern=` on the request model would make pydantic answer a
malformed code with 422 while the handler answers an unknown one with 404, and
those two differing IS the oracle D4 exists to close. The login handler's
DUMMY_HASH timing argument was read and does NOT reach the same conclusion here:
rejecting a malformed code early would separate well-formed from malformed, a
property of the string the caller just constructed and already knows, not
exists-from-absent. `ck_shop_code` guarantees no stored code is outside
`^[A-HJKMNP-Z2-9]{8}$`, so a malformed code cannot match a row however far it
travels. One refusal path, because one refusal path cannot disagree with itself.

**LOGIN WAS NOT TOUCHED, MEASURED FROM THE DIFF RATHER THAN RECALLED.**
`LoginRequest`, `LoginResponse`, `_INVALID_LOGIN`, `async def login` and
`@app.post("/auth/login"` each appear **0 times** on a changed line of the
commit; presence control `directory_router` = 2 hits in `main.py`. The three
`/auth/login` occurrences in the diff are all client URLs in the new proof.

**THE FIXTURE.** `server/scripts/prove_shop_code.py` takes `--app-database` and
`--directory-database`, refuses the live database for either, and refuses if they
are equal. It creates its fixture row by DELETE-then-INSERT every run rather than
finding one. Two consecutive runs, no reseed, green both times.
**Inserting a fixture into a scratch database is not issuing a code** — that is
P1.5 and remains undone.

**THE FIVE PROPOSITIONS, all green, `PROVE_SHOP_CODE_EXIT=0`.**

- **P1** a real code resolves; the body carries EXACTLY `{tenant_id}`, with
  `name`, `shop_name`, `code`, `created_at`, `is_active`, `id` each asserted
  ABSENT. A presence-only check would pass against a response that also leaked a
  shop's name, which is why the absences are asserted individually.
- **P2** a well-formed absent code is refused, 404, pinned to this endpoint's own
  `detail` rather than to the status alone.
- **P3** a malformed code is refused with a body BYTE-IDENTICAL to P2's, compared
  in full rather than by status.
- **P4** the read went through the directory role. Discriminating by
  CONSTRUCTION, not by reading the source: the fixture is created in the
  DIRECTORY database and asserted ABSENT from the APP database, and the app role
  is separately shown refused on that relation with `permission denied for schema
  directory`. Two independent reasons the app engine cannot have answered.
- **P5** CONTROL — login still 200s with a token, still 401s a wrong password and
  an unknown user, and those two refusals are still byte-identical to each other.

**SEEN RED, TWICE.** Mutation A added one field to the response model: exactly
two cells reddened — the exact-key-set assertion and the `code` ABSENCE
assertion. Mutation B gave the malformed case its own 422: exactly P3's two cells
reddened, the status comparison and the full-body comparison. Both exit 1. Undone,
green returned, and a residue search over `server/app` found 0 mutation markers
with a presence control on the same files returning 1.

**THE FALSE GREEN — the most transferable thing this phase produced.** The proof
first used a hardcoded port 8137, where a process had been listening since
2026-08-07. The child uvicorn could not bind and exited; `wait_for_health` polled
`/health` and got **200 from the other server**; and **P2 and P3 then PASSED
against a route that did not exist**. A route-not-found 404 is shaped like the
refusal this endpoint was designed to give — same status, same `detail` key — so
an assertion written to check for that refusal is satisfied by its absence. Only
P1 failed, and P1 is the assertion nobody would call the safety net. Three fixes:
a free port chosen at runtime, a dead child detected rather than waited out, and
the one that actually closes it — **the server is asked for its own
`/openapi.json` and must declare `/auth/shop-code` before any assertion runs.**
P2 is additionally pinned to the endpoint's own refusal text.

**THE DOOR WITH NO KEY. This is the answer to "why does the thing we just built
not work", and it is not a defect in the endpoint.** Nothing writes to
`directory.shop_codes` — no endpoint, no script, no migration, no manual path.
The relation is empty on the live database. **So in production `POST
/auth/shop-code` returns 404 for every input, correctly, and will until somebody
can issue a code.** Who issues one is undecided; the work is P1.5.

**P1.3's DONE WHEN WAS REWRITTEN, AND THE RULE THAT MAKES THAT LEGITIMATE IS IN
THE FILE.** It demanded a `POST /auth/login` carrying no uuid returning 200; D4
decided login does not change, and `LoginRequest.tenant_id` is a required uuid, so
that request can only return 422. **Unreachable by design, not unmet** — and NOT
rewritten because the work was hard, since the server change it waited for
landed. `ROADMAP.md` keeps the old wording with the date and the reason beside it,
in that file's existing form for superseded text, and now carries two criteria:
**A** the server is correct (two chained requests, both recorded, plus a
404 control and a token-actually-works control), **B** the route works for a real
shop (needs P1.5). **Both outstanding.** Four other passages in `ROADMAP.md` and
one in `OPEN_ITEMS.md` restated the old criterion and were corrected in the same
change; three passages in THIS file also restate it — at `:138`, and inside the
dated entries at `:3614` and `:3745` — and are deliberately **not** rewritten,
because a dated measurement is superseded rather than edited. They were true when
written; this entry is the supersession.

**A ROUTE-COUNT FIGURE FROM `f84b54d` IS CORRECTED, re-derived here.** That
commit's message said "the route count is unchanged at 11". The number was real
but it was not an endpoint count. **Measured at `1951b19`:** `len(app.routes)` is
**12**, and it decomposes as 4 FastAPI defaults (`/openapi.json`, `/docs`,
`/docs/oauth2-redirect`, `/redoc`) + **5 opaque `_IncludedRouter` wrappers**, one
per `include_router` call + 3 app-level routes (`/health`, `/auth/login`,
`/whoami`). In this FastAPI version an included router's own paths are NOT
flattened into `app.routes`, so that quantity counts routers, not endpoints —
which is why it moved from 11 to 12 when this commit added one router carrying
one path. **The endpoint count is the openapi path count: 29, measured at
`1951b19`.** The before figure is **28**, and it is measured rather than
subtracted: the stale server on 8137 predates this commit, declares 28 paths, and
differs from the current schema by exactly `/auth/shop-code`.

**WHAT THIS DOES NOT ESTABLISH.**

- **No client sends this.** Neither mobile nor desktop calls the endpoint.
- **Criterion A is provable but NOT PROVEN.** The proof exercises the lookup and
  login separately and never chains one into the other; no assertion uses a token
  obtained from a resolved code, and none exercises such a token against an
  authenticated endpoint. That chaining is what A asks for.
- **Repeated-attempt protection is open**, and this endpoint is where it matters
  most: unauthenticated, and it answers a yes/no question about the directory.
- **Case is not normalised.** A lowercase code typed off a printed slip is
  refused indistinguishably from an unknown shop. `OPEN_ITEMS.md` carries it as a
  decision owed to the owner.
- **No proof script was run in the phase that wrote THIS entry**, and no database
  was touched by it.

### 2026-08-10 — Criterion A satisfied: the chain, and what a hardcoded value cannot be told from

**`b22d449`, one file, +133 lines, `server/scripts/prove_shop_code.py`.** No
endpoint, request model, login handler, schema or migration changed. `recycle`
was not written to. **This SUPERSEDES the bullet in the entry above that reads
"Criterion A is provable but NOT PROVEN"** — that was true when written, and a
dated measurement is superseded rather than edited.

**A1..A5, one execution, `PROVE_SHOP_CODE_EXIT=0`, twice in a row with no reseed
between; the only differences between the two runs are the ephemeral port and
the child pid.**

- **A1** `POST /auth/shop-code {"code": "ZZ9TEST4"}` -> `200
  {"tenant_id":"11111111-1111-1111-1111-111111111111"}`.
- **A2** `POST /auth/login` carrying THE OBJECT PARSED FROM A1 -> `200`, token
  returned. Recorded with the password as
  `<REDACTED - a real password WAS sent>` and the token as
  `<REDACTED bearer token, 325 chars>`: both are credentials and this output is
  read in transcripts, so they are redacted rather than omitted, and the field
  names, the response shape and the token's length are still recorded.
- **A3** `GET /whoami` with that token -> `200`, and its `tenant_id` equals the
  one A1 resolved.
- **A4** CONTROL, refusing side: an absent code -> `404 {"detail":"unknown shop
  code"}`, pinned to this endpoint's own refusal rather than to the status.
- **A5** CONTROL, accepting side's negative half: `/whoami` with NO token ->
  401; with a tampered token -> 401; the two refusals do NOT differ.

**WHY `/whoami` AND NOT SOMETHING EASIER.** It depends on `get_principal`, which
verifies the JWT signature, re-reads the user row and compares `token_version` —
so its 200 cannot be produced without a valid token. **An endpoint whose 200 is
obtainable without one would have made A3 vacuous**, which is the trap the
criterion's own wording warns about: a token is a string until something accepts
it. It also echoes the tenant the server resolved, closing the chain at the
server's end and not only at the client's.

**BOTH CONTROLS IN THE SAME EXECUTION, AND THE SCRIPT SAYS WHY IN ITS OWN
OUTPUT.** A positive with no paired negative in the same run is not readable: a
200 from `/whoami` is evidence only beside a 401 from `/whoami`, same server,
same process, same run. Two scripts whose greens are reconciled afterwards would
demonstrate two facts that happen to agree.

**THE FINDING: A HARDCODED CORRECT IDENTIFIER IS INDISTINGUISHABLE FROM A CHAINED
ONE BY ANY ASSERTION OVER VALUES.** This is the part that must not compress into
"the chain is tested". A2 was rewired to a literal — the chain genuinely broken —
and the run **passed every assertion and exited 0**, including A3's cross-check
that `/whoami` reports the tenant A1 resolved. The two are the same 36 bytes.
Equality cannot separate them; the cross-check cannot; no status code can.

**WHAT SEPARATED THEM WAS PROVENANCE CARRIED BY A TYPE.** A1 wraps what it parsed
in `ResolvedTenant`, a `str` subclass; the request body carries that OBJECT (the
wire is unchanged, since it serialises as a plain JSON string); and the gate
asserts the body's identifier IS that type. A literal is a plain `str` and fails
before a request is sent. With the break present and the gate present, **exactly
one cell reddened and the run exited 1** — it is the only cell that can detect
the break. Restored: green; residue search 0 with a presence control at 6.

**THE GATE ASSERTS ON THE REQUEST BODY, NEVER ON THE PARSED VARIABLE**, and the
first version got that wrong. Checking `resolved` passes while a hardcoded
literal sits in the request beside it — the gate would have been green against
the exact break it exists to catch. Found by reading the diff back.

**THE LIMIT, STATED RATHER THAN DISCOVERED LATER.** This proves the value FLOWED
through this process. It cannot stop an author who hand-writes
`ResolvedTenant("...")`. It catches the accidental break and the lazy one, which
is what a regression looks like; it is NOT a defence against a deliberate
forgery, and it should not be cited as one.

**AN ASSERTION THAT COULD NEVER GO RED, AND WHAT HAPPENED TO IT.** A5's
"the two refusals differ" was first written `check(True, ...)`. That is a cell
incapable of failing, printed among `[ok]` marks where a reader scanning the
column takes it for an assertion. It is now a printed OBSERVATION, with a note in
the source giving the reason: whether those two refusals differ is a fact to
record, and `auth.py` collapsing them is a design choice rather than a bar. Found
by reading the diff back, in the same pass as the gate defect above.

**THE FIXTURE INSTRUMENT, BEFORE AND AFTER, SAME TOOL BOTH TIMES.**
`recycle_keyshape_scratch` is recorded as the only instrument that can detect the
manifest key-space defect, and this proof writes into that database. The EXISTING
tool was used rather than a new one — `backup_db.py`, identified as the source of
the failure text the queue entry quotes, because a second instrument measuring
one property is how two disagreeing numbers get born. **BEFORE and AFTER are
identical**: `BACKUP_EXIT=0` both times, 15 tables, the same per-table counts
including the decoy pair `Odd Name`=13 against `odd`=11, and the same manifest
total of 3 files, 222995 bytes, 913 rows. "Intact" was defined FIRST, as a query:
six relations whose names need quoting, a schema whose name needs quoting, and
the lowercase decoy. Nothing moved.

**AND A ROW WAS DISPLACED, WHICH IS A DIFFERENT QUESTION FROM THE INSTRUMENT.**
`OPEN_ITEMS.md` recorded as UNKNOWN whether this proof had overwritten a
pre-existing `directory.shop_codes` row there. Measured: that relation now holds
exactly one row and it is this proof's fixture. The survey taken before the proof
first ran counted one row, and `ZZ9TEST4` is a code this proof invented — **so
the pre-existing row WAS displaced, which means it named tenant A.** The honest
word is displaced, not harmless. The instrument is unaffected because what it
measures is identifier SHAPES in schema `public`, and `shop_codes` is not among
the relations it looks at — which is exactly why the two questions are recorded
separately rather than as one reassuring sentence.

**WHAT THIS DOES NOT ESTABLISH.**

- **CRITERION B IS UNTOUCHED and cannot be attempted.** It needs somebody able to
  issue a code, which is P1.5. Nothing writes to `directory.shop_codes` by any
  route; no shop has a code; in production the endpoint returns 404 for every
  input. **"P1.3 is not done" now has exactly one meaning.**
- **A fixture row in a scratch database is not an issued code**, and A pre-empts
  nothing.
- **No client sends either request.** Neither mobile nor desktop calls the
  endpoint, and nothing ran on a handset.
- **The proof asserts one thing Criterion A does not require** — A5, the
  authenticated endpoint's refusing half. Whether that belongs in the criterion
  or stays as extra rigour is the owner's call and is queued.

### 2026-08-10 — the pilot shop provisioned, and the one layer of five that mangles

**`provision_shop.py` run against `recycle` for the first time**, with
`--yes-this-is-the-live-database`, which is the mechanism the script itself
defines: it compares `--database` against the database named in
`APP_DATABASE_URL` — read from configuration, not hardcoded, so the guard cannot
quietly stop guarding if a deployment renames the database — and requires that
explicit long flag. The admin password came from `PROVISION_ADMIN_PASSWORD` in
the environment and appears in no output and on no command line.

**THE ORDER WAS THE POINT.** A backup was taken and PROVEN RESTORABLE before
anything was written, and the command-line hop was measured before the write
rather than after. These rows cannot be deleted and a shop code cannot be
reissued, so a mangled name would have been permanent. That rule is now in
`CLAUDE.md § Workflow`.

**WHAT LANDED.** Tenant `982d76af-dd35-4c46-a54c-f087c39b92c8`, name 62 bytes /
22 codepoints, `created_at 2026-08-10 09:32:06.883251+00`; user
`35770909-1393-4b8c-b3e9-0feeb6c9ae50`, username `admin`, role `admin`,
`is_active t`, `token_version 1`, password hash prefixed `$argon2id`; code
**`R6VD7RAC`**. Resolved as `recycle_directory`: `R6VD7RAC` ->
`982d76af-…-f087c39b92c8`, which is the shape `POST /auth/shop-code` consumes.
Counts moved 2/4/0 -> 4/6/2 — **two each, not one**, both increments accounted:
the owner's shop and the ASCII control tenant the comparison required.

**THE FIVE LAYERS, HEX AGAINST AN EXPECTED VALUE FIXED ONCE.** Expected was
established from a file written by the editor, never crossing a shell:
`e0b89ae0b8b2…e0b8a5`, 62 bytes.

| layer | Thai | ASCII control |
|---|---|---|
| argv into the script | match | match |
| written to and read back from `recycle` | match, 22 chars / 62 bytes | match |
| **stdout as the script printed it** | **MISMATCH — `bad2a7a1cda1…`, 22 bytes** | **match** |
| the `COPY` block in the dump file | match | match |
| the same row after a restore | match | match |

Layers one, two, four and five were compared by paths a console cannot touch:
`encode(convert_to(name,'UTF8'),'hex')` computed server-side, and the dump read
in BINARY and never decoded.

**THE FIRST AND ONLY LAYER TO DIFFER IS STDOUT, AND WHAT THE BYTES BECAME IS THE
USABLE PART.** Python reports `sys.stdout.encoding=cp874` and
`locale.getpreferredencoding(False)=cp874` on this box. It encoded the 22
characters as 22 single-byte CP874 codes — `บ`->`ba`, `า`->`d2`, `ก`->`a1`,
`์`->`ec`, `ี`->`d5`, `ิ`->`d4`. **CP874 represents every character in that name,
so NOTHING IS LOST**: no error, no `?????`, no mojibake, and it renders correctly
wherever anyone looks at it. It breaks only when something downstream decodes
that stream as UTF-8. **The layer that mangles is the only layer a person checks
by eye, and the four that matter are ones nobody sees.**

**THE CONTROL IS WHAT MAKES THAT READABLE.** An ASCII-only name went down the
identical path in the same round and matched at EVERY layer including stdout, so
the Thai mismatch there is a property of non-ASCII text rather than of a broken
comparison. **Two bounds.** The stdout figure is a PROXY — the same interpreter
writing the same string to a redirected stream, not the captured bytes of the
original run, which cannot be recovered from where the reader sits. And the name
carries above-line vowels (U+0E34, U+0E35) and a thanthakhat (U+0E4C) but **no
below-line vowel**, so that class was not exercised.

**THE FIXTURES, PROVEN UNCHANGED ARTEFACT AGAINST ARTEFACT.** The
`COPY public.tenants` rows for Shop A and Shop B are byte-identical in
`recycle_20260810T090615Z_at-0009-pre-provisioning` and
`recycle_20260810T093442Z_at-0009-post-provisioning`, `created_at` of
`2026-08-02` included. Not a re-read weighed against a memory.

**THE SECOND RUN REFUSED**, naming the one-code-per-shop rule and saying nothing
was written; **counted either side rather than believed**: 4/6/2 before, 4/6/2
after.

**BACKUPS, BOTH KEPT.** `…090615Z_at-0009-pre-provisioning`, its version read as
`0009` from the dump body at `recycle.sql:331` rather than off its label, and
restored green before any write. `…093442Z_at-0009-post-provisioning`, 850 rows,
restored into the default scratch target for layer five.

**WHAT THIS DOES NOT ESTABLISH.**

- **`recycle` IS THE DEV DATABASE AND STAYS DEV.** Production does not exist and
  will be created fresh when hosting is chosen, so this shop, this admin and
  `R6VD7RAC` are discarded with this database. **Nobody should print a slip from
  that code.** Recorded as D5 in `ARCHITECTURE.md § 10. The three settled decisions`.
- **THE FIRST STEP TOWARD A PAYING SHOP IS NOT CLOSED BY THIS RUN.** It is a test
  of the script under the most realistic conditions available today. P1.3's
  Criterion B is still outstanding, because a real shop is one on production.
- **P1.5 IS NOT SATISFIED**, and as of `cb11f6a` that sentence means ONE thing
  where it used to mean two. **~~there is no endpoint by which an admin could
  create one — 29 declared paths, none of them a create-user or password-change
  route~~ — FALSE FROM `cb11f6a`**: 31 paths, and all three routes exist. What is
  outstanding is not an endpoint. It is that **nothing has signed in from a
  handset and the production database does not exist** — P1.7 and P1.11 for the
  phone, P1.2 for the server — rather than anything unwritten. The DONE WHEN is
  untouched and still wants a first admin AND a staff account, both signing in
  from a handset.
  **CORRECTED 2026-08-12 — "nothing has signed in from a handset" is no longer
  true as written, and the bar does not move.** A sign-in and a sign-out have
  since happened on a handset: the login screen drawn, a session established and
  cleared. **The artefact is a TEST artefact** — this project's own Android DEBUG
  build (`9d2eb22`, `dev.chutipon.recycle`), one vivo 1938, never Expo Go, its
  API address a plain-HTTP LAN address baked in at build time, reaching only this
  network's dev server. **What did NOT happen:** nobody signed in through that
  screen to reach the cart screen and nothing was weighed; iOS ran the secure
  store's clear on 2026-08-06 and has never run the migration; and no release
  build exists on either platform. The production database still does not exist,
  so the DONE WHEN — a first admin AND a staff account, in production, both
  signing in from a handset — is untouched by this.
- **The user-writer survey's bound travels with it:** the endpoint negative comes
  from the published schema and is authoritative for endpoints, but the survey of
  which writers reach `tenants` was run over raw-SQL spellings, so it is three
  sites FOUND rather than three proven to be all.
