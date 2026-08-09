# Roadmap

**What this file is:** the ORDER, and the argument for it. What must be true
before what, why each dependency is a dependency rather than a preference, what
each step unblocks, and how you would know it was done. It answers *"what next,
and why that"* with nobody available to ask.

**What it is not.** It carries no status — that is `PROJECT_STATUS.md § Current phase`,
whose dated observations are the evidence layer under every claim of progress. It
is not the requirements map (`SRS_MAP.md § 1. The map, item by item`), not the
structure (`ARCHITECTURE.md § 2. The programs, and the boundaries between them`),
and not the queue. `OPEN_ITEMS.md § Blocking one real paying shop` holds everything
outstanding, one line each, unranked; this file ranks a subset of it. An item there
and absent here is not off the list — it is off this path.

**Citations** are `file § Section` plus a quoted handle, never a line number into a
document: a small insert into `CLAUDE.md` once invalidated every one of
`START_HERE.md`'s pointers at once, and the shift was not uniform.
They are checked by `tools/verify_citations.ps1`,
which must be passed this file as a source (`-Source START_HERE.md,ARCHITECTURE.md,ROADMAP.md`)
— a checker written before a document existed cannot know about it and will not say
so. Line numbers into CODE are used freely, are expected to drift, and should be
re-derived rather than trusted.

---

## Numbering — the R-numbers are now a closed log

**This file was replaced on 2026-08-07, not amended.** It predated the scope
settled below, `SRS_MAP.md`, `ARCHITECTURE.md`, and every decision in *What the
owner has settled*. Its two-path shape (Path A to one shop, Path B to many) is
gone, because S3 moves the desktop onto the pilot path and the gate between the
two paths no longer falls where that file drew it.

**The R-numbers R1–R10 are a CLOSED LOG. No new R-number will be issued.** This is
the same move that retired the A-numbers, for the same reason and on the same
evidence: measured at `6de5cec`, **120 R-number mentions across 12 tracked markdown
files** outside this one, and **10 commits** whose messages carry one. Renumbering
them to keep a sequence tidy buys nothing and orphans every reference.

**Forward steps are P-numbers** — `P1.1`, `P2.3`, `P3.5` — where the first
component is the stage. `P` was checked for collision before it was chosen:
`git grep -nE '\bP[0-9]+(\.[0-9]+)?\b' -- '*.md'` returned nothing at `6de5cec`.

**How an old reference resolves.** The eight labels that appear outside this file
are `R1 R1b R2 R2b R3 R4 R5 R7`; `R6` and `R8`–`R10` existed only here.

| old | what it was | where it resolves now |
|---|---|---|
| R1, R1b | sign-out, and refusing an issued token | CLOSED. The record is `PROJECT_STATUS.md § Current phase` "R1 and R2 are both CLOSED". Not a forward step. |
| R2 | the daily money screen's device gaps | CLOSED, on evidence of unequal strength recorded at the same place. |
| R2b | the sign-out sheet could not say why the queue was stuck | CLOSED. |
| R3 | a reachable server, HTTPS, backups that run themselves | **P1.2**, substantially unchanged, with the backup half's classification argued rather than assumed. |
| R4 | master data a shop can maintain itself | **SPLIT and its fork dissolved** — price editing is **P1.9** (phone) and **P1.15** (desktop), entity setup is **P1.8** and **P1.15**. See D5. |
| R5 | real accounts, and an app on a real phone | **P1.5** (provisioning) and **P1.11** (the build). |
| R6 | one shop uses it daily | **P2.1**, unchanged in substance. |
| R7 | the desktop back office | **P1.13**–**P1.15**, moved from "after a shop is running" INTO stage 1 by S3. |
| R8 | thermal slip printing | **P1.17**, moved into stage 1 by S3 — which is the answer to the open question that inverted the old file's whole split. |
| R9, R10 | sell flow, stock, and the rest of the out-of-MVP list | Off this file. They are `PROJECT_STATUS.md § What is NOT built` "do not build, do not scaffold" and nothing here schedules them. |

---

## What next, and why that

**Three steps have no predecessor and can start today, in parallel with each other
and with anything else.** They are the head of the queue, and nothing about starting
them waits on a decision that has not been made.

- **P1.1 — the second-hand goods act's obligation.** First because the answer may be
  a schema change, and the pilot's rows cannot be repaired afterwards.
- **P1.2 — the hosting decision.** The only step in this file with external lead
  time: a host has to be chosen, paid for and pointed at a name, and procurement has
  a clock that code does not. This is the one place where parallelism is free.
- **P1.10 — `prove_reconcile.py` back to green. MET 2026-08-07**, so two of the three
  remain. No dependency at all, and it is the instrument stage 2 rests on.

Everything else in stage 1 waits on one of those three, or on another step in it. The
order below is argued step by step; where a step could be moved, the argument for its
position is written into it rather than left implied.

---

## What the owner has settled

Six decisions from a working session. They existed in no file. Recorded with their
reasoning so they are not re-argued; nothing below reopens them.

**S1 — the scope is three deliverables shipped together as one handover:** the
mobile app, the desktop application, and a provider web application. The father is
paying for a finished product, not an instalment. A handover that leaves the owner
running SQL for shop number two is a debt taken on with money already received.

**S2 — a pilot shop is part of the path, not the end of it.** What must be complete
before a PILOT is a different and smaller bar than what must be complete before the
product is SOLD to a stranger. Those two bars plus the pilot between them are why
this file has three stages.

**S3 — the slip is printed from the desktop, after the bill has synced.** The
cashier at the PC issues the receipt. Two consequences, and both are load-bearing
here: the slip always carries a doc_no, so `SRS_MAP.md § 7c. Printing` "whether the
pilot shop needs a printed slip" dissolves — the answer is yes; and **the desktop is
on the pilot path**, because a shop that hands over receipts cannot trade without it.

**S4 — the provider web application shows shop status, licence state, and when each
shop last sent a bill.** It does NOT open a shop's bills, money or sellers. The
reason is not caution: reading a shop's books is the shop owner's job, not the
vendor's, and a tool with no path to a third party's ID number cannot leak one.

**S5 — staff use their own personal phones, and accounts are per person.** This is
not a convenience note; it changes two steps. It removes the fallback of taking a
handset back when someone leaves (P1.4), and it turns Android from a verification
gap into a platform question (P1.11).

**S6 — where a shop could reasonably work either way, the system supports both and
decides nothing.** Every yard runs differently and we cannot know how any particular
one does. Concretely: a seller can be created from the phone at the weighbridge OR
from the desktop at the counter; prices can be edited from either. And when a bill
has not synced the slip cannot be printed, and the system says so plainly rather
than inventing a workaround the shop did not ask for.

---

## Findings this file carries because no other file records them

Four, from the capability survey that preceded this rewrite. Each was re-derived
against the tree at `6de5cec` before it was written down here; the commands are
given so the next session re-runs them rather than trusting these.

**These entries record what a survey found AT THE TIME, and are deliberately NOT
updated when a later decision supersedes one.** Editing history to match the
present erases the record of what was once unknown, and a decision only reads as
necessary against the gap it filled. Where an entry has been superseded, the
answer is written where answers live — *The decisions the ordering forced* below,
and `ARCHITECTURE.md` — and this section is left as the question it was.

**1. There is no shared package to port `shopTime.ts` into, so "port" today can
only mean copy.** `git ls-files | grep 'package.json$'` returns **one** path,
`mobile/package.json`, which carries no `workspaces` key; there is no root
`package.json`; and `git ls-files desktop/` returns `desktop/.gitkeep`, 0 bytes.
The module's own header forbids exactly what a copy would be —
`ARCHITECTURE.md § 6. Time` "The porting constraint" carries the requirement, and
`shopTime.ts` states the reason in its NEXT CONSUMER block. **So the workspace
change is a PREREQUISITE of the desktop (P1.12), not a tidy-up after it.**

**2. The login screen needs a tenant no human can type.** `server/app/main.py:26`
declares `tenant_id: uuid.UUID` — required, no default. Resolving it from a
username is not well defined, because `0001_initial_schema.py:104` is
`CONSTRAINT uq_users_tenant_username UNIQUE (tenant_id, username)`: usernames are
unique *per shop*, not globally. A shop code, a baked-in tenant, or a global
identifier — a schema and owner decision, and a prerequisite of the screen rather
than a detail of it (P1.3, and D4).

**3. CORS is a prerequisite, not a hardening item, because both remaining programs
are browsers** — the provider web by definition, and Electron's renderer by
construction. `git grep -in "CORS\|add_middleware\|Middleware" -- server/` returns
**exit 1**: there is no middleware of any kind.
`SRS_MAP.md § 6. Security posture, per area` "No CORS policy" records the same
absence as harmless while the only clients are native. Mixed content lands with it:
an HTTPS page cannot call a plain-HTTP API, which couples P1.6 to P1.2.

**4. Seller creation is a PILOT item, not set-up-once**, and this file disagrees
with the old R4 on it. A yard buys from walk-ins, and the database refuses a bill
for a seller who does not exist: `purchase_bills.seller_id` is `uuid NOT NULL` and
`fk_bills_seller FOREIGN KEY (tenant_id, seller_id) REFERENCES sellers (tenant_id, id)`
(`0001_initial_schema.py:203, 215-217`). The old file classified sellers with
products and unit-of-measure as "set up once… an inconvenience, not a blocker".
That is right about products and wrong about sellers, and the mechanism is why:
nothing about a truck arriving is set up in advance.

**Two classifications made honestly rather than conveniently.**

**Scheduled off-site backup falls under neither bar as written, and it is at P1.2
anyway.** A pilot shop trades a normal day without it; a stranger buying the
product never sees it. It is in stage 1 because the window it opens — real money
with a single copy — starts at the first real bill and never closes on its own.
Dropping it because neither bar catches it would be worse than misfiling it.

**Android has one pass, on one borrowed handset, on one OS version, and S5 turns
that from a verification gap into a platform question.**
`OPEN_ITEMS.md § Verification gaps — built, not proven` "Android coverage" names
five behaviours the yard depends on that have never run there. When the shop
supplied the phones, "we have not tested Android" was a gap to close at leisure.
When staff bring their own, it is a question about which handsets the product runs
on at all, and it is answered at P1.11 or recorded as accepted.

---

## The decisions the ordering forced

The spine could not be ordered without answering these. **Eight are settled**, with
the owner's reasoning recorded; **four are open**, each with what would settle it.
None of them is derivable from S1–S6.

### Settled

**D1 — `POST /sellers`'s gate changes so staff can create a seller. Staff do NOT
become admins.** Today `server/app/master.py:824-826` is
`Depends(require_admin)`, and `master.py:15` states that as intent. **Creating a
seller and voiding a bill are not the same risk, and `require_admin` currently
conflates them.** The stated intent — a yard phone must not re-price — survives
intact: prices stay admin. *(This corrects the survey's own reading and the spine's
first draft: "the server already accepts both" was true of the endpoint and false
of the gate.)*

**D2 — `MAX(server_received_at)` is a heartbeat, not a read of shop data.** No
money, no name, not even a count. So S4's consequence holds — the provider makes no
reads of shop data to record, and `ARCHITECTURE.md § 10. The three settled decisions`
D3 becomes a log of provider ACTIONS. **Audit it anyway:** over-recording a provider
action costs nothing.

**D3 — a lapsed licence does NOT stop a shop trading.** Cash has already left the
till and the row cannot be removed (`CLAUDE.md § Hard rules` "No hard deletes on
transactions"). It warns on screen and withholds what is not the act of buying and
selling. A money system that locks an operator out mid-shift is a system that costs
them money, and the shop is not the party who failed to pay.

**D4 — the tenant-identity mechanism is a SHOP CODE, resolved through a relation
outside the tenant model.** Not a baked-in tenant, which S1's single handover made
awkward — shop number two would need its own build — and not a global identifier.
The relation is `directory.shop_codes`, mapping a code to a `tenant_id`, and the
same relation is what a provider service enumerates shops from, which closes the
open half of `ARCHITECTURE.md § 10. The three settled decisions` D2. One mapping,
one relation, read by a third role that can reach nothing else. **The migration is
committed and NOT YET APPLIED to any cluster.** The format and its reasoning are
recorded in that architecture section and in the migration's docstring, and are
not repeated here.

**D5 — price editing exists on BOTH surfaces**, per S6. S3 puts the desktop on the
pilot path regardless, so the cost that made the old R4 recommend the phone —
"it pulls the entire Electron scaffold in front of a shop trading" — is already
being paid. What remains is not a fork.

**D8 — the desktop cashier is an admin of the shop.** They issue bills and control
the money. This is what `ARCHITECTURE.md § 3.1 Three authentication tiers, not two`
can express: the role is a two-value CHECK, not a permission system, and it cannot
say "may void, may not re-price".

**D10 — the pilot runs on the production database, and no rebuild of the
2026-08-03 kind is available after the first real bill.** That rebuild is recorded
at `PROJECT_STATUS.md § What the rebuild cost — stated, not glossed` "Also gone:
every user id". This is a **constraint on P1.2's hosting choice**, not a note
beside it: whatever is chosen there must be a thing that can be migrated, backed up
and restored without being emptied first.

**D12 — `CLAUDE.md` is owed TWO corrections, and this file does not make them.**
See *Corrections owed elsewhere* at the end.

### Open — named, with what would settle each

**D6 — what else goes in the shared package once it exists.** The survey names
`shopTime.ts` only. The API client, the money type and the refusal vocabulary are
the same argument, and `OPEN_ITEMS.md § Code debt found and left in place` "The
refusal vocabulary wants its own module" already records one of them as owed.
Including them is scope; excluding them is a second implementation of each.
*Settled by:* a decision at P1.12, when the package is being created and the cost of
adding a module to it is at its lowest.

**D7 — what origin the desktop renderer presents to CORS.** An Electron `file://`
renderer sends `Origin: null`, which is not a shop-specific origin and is what any
sandboxed iframe also presents. The alternatives — a custom scheme, or serving the
renderer from a local HTTP origin — are scaffold decisions. *Settled by:* P1.13
choosing the renderer's origin, which P1.6 then has to allow; if P1.6 lands first it
must leave the list configurable rather than guess.

**D9 — which stage owns Android.** S5 makes it a platform question but does not say
whether it gates the pilot (whose staff own the phones they own) or the sale (whose
staff own anything). *Settled by:* knowing what the pilot shop's staff carry — a
fact about a shop, not about the code.

**D11 — how a desktop app is installed and updated on a shop's PC.** Nothing
exists. For the pilot the owner can install it by hand; for a stranger it is part of
the deliverable, and S1 ships all three together. *Settled by:* the owner deciding
whether an updater is in the handover, which is a scope answer and wants giving
before P1.13 picks a packaging route.

---

# STAGE 1 — what a pilot shop needs to trade a normal day

Seventeen steps. The bar is a shop buying real loads from real sellers and handing
over real receipts, on staff-owned phones, without anyone running a request by hand
for them.

### P1.1 — The second-hand goods act's record-keeping obligation

**What it is.** An answer, from outside this repository, to the question recorded at
`OPEN_ITEMS.md § Business questions — unanswered, and not answerable from the code`
"The second-hand goods act's bookkeeping obligation": which fields must be recorded
about a seller and the goods, in what form, and for how long.

**Depends on:** nothing in the code. It is a statute or an accountant, and it is
first for one reason: if the answer adds a field or a retention rule to the purchase
register, that is a schema change, and the rows a pilot writes cannot be repaired
afterwards. This is the same irreparability that made the bill-author question
urgent — `SRS_MAP.md § 3. The schema gap` "every bill already written is authorless"
— arriving one step earlier, before there is any real data at all. It is a
dependency and not a preference because every step after it may write a row the
answer would have shaped.

**Unblocks:** every step that writes real data, which after P1.2 is all of them.

**DONE WHEN:** `OPEN_ITEMS.md` carries the answer with a source that is not this
repository — a statute section, or the name and date of the accountant or lawyer who
gave it — and either a migration exists for what it requires, or a line records that
it requires nothing.

### P1.2 — A server a shop can reach, on HTTPS, with a backup that runs itself off this box

**What it is.** A host, a name, TLS, and a scheduler that puts dumps somewhere other
than this machine. Substantially the old R3, and the backup half is not new work:
`PROJECT_STATUS.md § What is built` "`backup_db.py` writes plain" records the dump
and restore scripts, the proven round trip, and the disaster-recovery rehearsal.
What is missing is a schedule and an off-box destination.

**Depends on:** nothing technical. It is a spend decision, and it is the only step
in this file with external lead time, so its clock starts independently of every
software step and should start now. **D10 constrains the choice**: after the first
real bill the box cannot be rebuilt, so whatever is chosen must survive migration,
backup and restore without being emptied.

**Why the two halves are one step.** The moment the API is reachable from outside a
LAN it is reachable by everyone else; the moment it holds one real bill, an
unscheduled backup is a single copy. Shipping them separately buys a window in which
real money exists with no automatic copy of it, and that window has a way of lasting
longer than intended.

**HTTPS is a requirement of this step, not a later hardening pass.**
`mobile/app.json` carries a plain `http://` LAN address today; on the public
internet that hands the bearer token, the login credentials and every money value to
anyone on the path. The coupling is one string — `mobile/app/config.ts:24` is the
single reader.

**Unblocks:** P1.5, P1.6, P1.11, and everything that must persist.

**DONE WHEN:** the PHONE — not this box — gets a 200 from `/health` at an `https://`
URL that is not a LAN address, read off the handset; AND a dump written by a
schedule nobody triggered by hand has been fetched from off-box and restored into a
scratch database, with its row counts read back against its own manifest
(`lessons/README.md § Lessons` "a-backup-is-a-claim-until-it-is-restored.md").

### P1.3 — What identifies a shop at login

**What it is.** The decision at D4, then the migration and the server change that
implement it, so that a person can name their shop without typing a uuid.

**Depends on:** D4, which is now answered — a shop code in `directory.shop_codes`.
The dependency was real rather than a preference: the alternative is a screen that
cannot be built, because `main.py:26` requires a uuid and nothing on a login form
can derive one — usernames are unique per shop (`0001_initial_schema.py:104`), so
a username does not identify a tenant. It is before P1.7 because the screen's
fields are decided by the answer, and before the pilot's rows exist because it is
a schema change (D10).

**Where this step now stands.** The SCHEMA half is written: the migration creating
the relation, its constraints and its reader role is committed and **NOT YET
APPLIED to any cluster**. The rest of the step is untouched — the server change is
not written, and this file says nothing about what the login endpoint will do
because that is not decided. Two things are worth naming as absent rather than
assumed: **nothing writes to that relation today**, and **who issues a code when a
new shop is onboarded is undecided** — there is no provisioning path, by any
route, manual or otherwise.

**Unblocks:** P1.4, P1.5, P1.7, P1.14.

**DONE WHEN:** a `POST /auth/login` whose body carries **no uuid** returns 200 and a
usable token, run bare against the server, with the request and response recorded.

### P1.4 — An account that can be locked, not only signed out

**What it is.** A way to stop a person signing in again, as distinct from ending the
sessions they hold. `SRS_MAP.md § 6. Security posture, per area` "No account lock"
records what exists: session revocation, and no `is_active` on `users`, so a
revoked user can sign in again the same second and the endpoint says so in its own
docstring.

**Depends on:** P1.3, because an account is created and locked inside a tenant.
**S5 is what promotes this from a noted absence to a pilot step**: when the shop
owns the handset, a dismissal ends with taking the handset back. When staff use
their own phones, nothing is taken back, and the only remaining lever is the
account. That is a dependency on a decision, not a preference about tidiness.

**Unblocks:** P1.5, and P3.7.

**DONE WHEN:** a locked account's `POST /auth/login` is refused — an observed
response, not a predicted one — and the proof that establishes it has been seen
going RED with the lock check removed
(`lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md").

**MET 2026-08-07, migration 0007. Both clauses, and the second one twice.** The
evidence is `PROJECT_STATUS.md § Current phase` "The first P-number recorded as met" and the dated entry it
points at; it is deliberately NOT restated here, because two copies drift and a
new session believes whichever it reads first. What this file adds is only the
two things about the CLOSURE that belong to ordering rather than to evidence:

- **P1.3 was skipped knowingly.** This step's "Depends on" above names it, and
  it is not done. The capability was built and proven against the login that
  still takes a uuid, so what P1.4 cannot yet do is be exercised by a human
  typing a shop code. **The dependency was real and remains owed** — P1.3 will
  change the login path this step just added a check to, and whoever does it
  must not lose the check.
- **The lock has a consequence on the PHONE that nothing fixes yet.** A locked
  account's handset invites the operator to sign in and the sign-in cannot work.
  `OPEN_ITEMS.md § Code debt found and left in place` "A LOCKED ACCOUNT'S PHONE"
  carries it, against **P3.7**, which this step already lists under Unblocks.
  It is DERIVED from reading the client, not observed on a handset.

### P1.5 — Account provisioning: a first admin, then a person per phone

**What it is.** A path by which a shop's first admin exists, and by which that admin
creates one account per staff member. Today the only credentials in existence come
from the dev fixture — `PROJECT_STATUS.md § What is NOT built` "Real per-shop login".

**Depends on:** P1.3 and P1.4. A user exists only inside a tenant, so the identity
question must be answered first; and per-person accounts are what make locking mean
anything, so the two arrive together or the pilot has accounts it cannot retire.
S5 makes per-person the requirement rather than the ideal.

**Unblocks:** P1.7 (there is something real to sign in as), P1.11, P1.14.

**DONE WHEN:** a shop's first admin and at least one staff account exist in the
production database, created by neither `seed_dev.py` nor a hand-run SQL statement,
and both sign in from a handset.

### P1.6 — CORS, and the origin policy

**What it is.** The first middleware this API will have, plus the list of origins it
answers.

**Depends on:** P1.2, and it is a dependency rather than a preference in two
directions at once. The policy's VALUES are the origins things are served from,
which P1.2 fixes; and a browser will not let an HTTPS page call a plain-HTTP API at
all, so without P1.2 the provider web cannot reach the server whatever the policy
says. D7 decides what the desktop renderer presents here; if this step lands before
P1.13 has chosen, the list must be configurable rather than guessed.

**Unblocks:** P1.13 and P3.5 — both remaining programs are browsers.

**DONE WHEN:** a page served from the desktop renderer's origin and a page served
from the provider web's origin each complete a request to the API, read from the
browser's own network panel; AND a request from an origin not on the list is
refused, which is the control that stops a permissive policy reading as a pass.

### P1.7 — A login screen on the phone

**What it is.** Username and password fields, and whatever P1.3 chose for the shop,
replacing the hardcoded constants in `mobile/app/config.ts`.

**Depends on:** P1.3 and P1.5. Not a preference: the screen cannot ask for an
identifier that does not exist yet, and signing in is meaningless until there is an
account that is not the dev fixture's. The primitive is not new — `TextInput` is
already used in three screens — so what this step is buying is the flow, not the
control.

**Unblocks:** P1.8, P1.9, P1.11.

**DONE WHEN:** a person types their own username and password on a handset and
reaches the cart screen, with the bundle established beforehand
(`CLAUDE.md § Boot check` "WHICH BUNDLE THE HANDSET IS RUNNING"), and
`git grep -n "DEMO" -- mobile/` returns exit 1.

### P1.8 — Seller creation from the phone

**What it is.** D1's gate change on `POST /sellers`, and a screen at the weighbridge
that uses it.

**Depends on:** P1.7, because the seller must be created by a person the server can
name, and on D1, which is settled. It is a stage-1 step and not a set-up-once one
for the mechanism in *Findings* above: a walk-in has no row, and
`fk_bills_seller` refuses the bill. A yard that cannot add a seller in the minute
the truck is on the weighbridge cannot buy the load.

**Unblocks:** trading with anyone who is not already in the shop's list — which, at
a pilot, is most of the first week.

**DONE WHEN:** a **staff** (not admin) session creates a seller from the handset,
a bill for that seller posts and comes back with a doc_no, AND a staff token is
still refused on a price write in the same pass — the second half being the control
that D1 narrowed the gate rather than opened it.

### P1.9 — Price editing on the phone

**What it is.** The shop owner changing a buy price without anyone running a request
for them. Half of D5; the desktop half is P1.15.

**Depends on:** P1.5 and P1.7 — every price write is `require_admin`
(`server/app/master.py:703-708`), so it needs a real admin account signed in as a
person. It is on the pilot path because scrap prices move with the metal market
daily or faster, and a shop that cannot change its own prices cannot trade.

**Unblocks:** the shop pricing its own loads.

**DONE WHEN:** the owner changes a price on the handset and the next bill entered
carries the new value in `purchase_bill_items.list_price`, read back out of Postgres
rather than off the screen.

### P1.10 — `prove_reconcile.py` back to green

**What it is.** Deriving the three expectations that expired in the 2026-08-03
rebuild — recorded at `OPEN_ITEMS.md § Verification gaps — built, not proven`
"`prove_reconcile.py` is RED" — from the restored copy at runtime, instead of
hardcoding counts of a database that no longer exists.

**Depends on:** nothing. Like P1.2 it can run in parallel with anything. It is in
stage 1, not stage 2, for one reason: `reconcile.py` is the instrument that will be
pointed at the shop's real money in P2.2, and `prove_reconcile.py` is what
establishes that the instrument can go RED. A checker whose own proof is red cannot
be cited as evidence about a shop's ledger. The money injections still pass today,
so this is a repair to an instrument, not a defect in the checker.

**Unblocks:** P2.2 meaning anything.

**DONE WHEN:** it exits 0 **twice in a row, bare, against a scratch database, with
no reseed between** (`lessons/README.md § Lessons` "proof-must-run-twice.md"),
`git grep -n "T0" -- server/scripts/prove_reconcile.py` no longer shows a hardcoded
count, **AND the fourth failing cell is green** — `prove_reconcile.py:716`,
`counts.get("X3") == 1`.

**THAT LAST CLAUSE IS A CORRECTION, made 2026-08-07 while doing the step, and the
reason it is written into the DONE WHEN rather than into the record is that this
file is where a future session reads what "finished" means.** As originally
written this step named THREE expectations and required only that they be derived.
There were FOUR failing cells, and the fourth is not one of the three: it holds no
count, so no derivation reaches it. It was red because the X3 probe had stopped
landing its row inside the window it measures — the checker was working, the proof
had stopped probing, and nothing had been edited. **Meeting the step as originally
written would have left the proof red.** The step was one item narrower than the
step.

**MET 2026-08-07. All three clauses, and the third one was found rather than
inherited.** The evidence is `PROJECT_STATUS.md § Baseline observations`
"P1.10, `prove_reconcile.py` back to green" and the phase entry it sits under; it
is deliberately NOT restated here, because two copies drift and a new session
believes whichever it reads first. What belongs to ORDERING rather than to
evidence, and so is added here:

- **P2.2 rests on a NARROWER green at a pilot shop than the one measured here, and
  the narrowing is structural.** On a one-tenant database three injections cannot
  fire — S3/T0, S3/X2 and T10, which are the ones that exercise tenant isolation.
  They now SKIP with the reason printed rather than passing. **A pilot shop's
  database has one tenant** (D10), so this is the ordinary case there.
  `OPEN_ITEMS.md § Verification gaps — built, not proven` "ON A ONE-TENANT DATABASE"
  carries it, with the open question P2.2 has to answer: what the proof is pointed
  at when the shop's data is real. **The number to read there is the skip count,
  not the exit code.**
- **Five residuals are recorded and none is closed.** They are at
  `OPEN_ITEMS.md § Code debt found and left in place`
  "FIVE THINGS IT DID NOT REMOVE", and the X3 probe among them remains a race
  that fails closed.

### P1.11 — An installable build on staff-owned phones, and the Android answer

**What it is.** The app on a phone a staff member owns, from a distribution route
rather than Metro; and a decision on Android per D9.

**Depends on:** P1.2 (the URL the build bakes in), P1.7, P1.8 and P1.9 — every
screen change after a distribution round costs another one, so the mobile screens
land first. This is why the shared package moved to P1.12: see the note there.
The Android half depends on knowing what the pilot's staff carry, which is a fact
about a shop.

**Unblocks:** P2.1. A pilot cannot start on a development machine's Metro.

**DONE WHEN:** the app runs on a staff-owned handset installed from a distribution
link, with the bundle identified in the observation itself; AND each of the five
behaviours named at `OPEN_ITEMS.md § Verification gaps — built, not proven`
"Android coverage" has either been run on an Android handset or recorded in
`PROJECT_STATUS.md § Known device gaps` as accepted-unproven with the owner's
decision beside it.

### P1.12 — The shared package

**What it is.** A workspace change to `mobile/` so `shopTime.ts` lives somewhere the
desktop can import it from.

**Depends on:** the mobile program being green and stable — both typecheck programs
and all fourteen `prove:*` scripts — because that suite is the only instrument that
would see this break something. **It sits here, immediately before the desktop, and
not earlier.** The earlier slot was argued and rejected: restructuring before P1.11
would save one distribution round, but this change restructures the one program that
works, and Metro has already broken once on a nested package
(`lessons/README.md § Lessons` "metro-file-map-nesting.md" — and
`PROJECT_STATUS.md § What is built` "One npm package on purpose" is why the current
shape is deliberate). The desktop is what needs it; the second distribution round is
the cheaper of the two costs.

**Unblocks:** P1.13, and with it every desktop step. Without it, "port `shopTime.ts`"
can only mean copy, which is the second implementation the module's own header
forbids.

**DONE WHEN:** `mobile/src/time/shopTime.ts` is imported from a package outside
`mobile/`, both mobile typecheck programs exit 0 run bare, all fourteen `prove:*`
scripts exit 0 twice bare, and Metro still serves the app to a handset.

### P1.13 — The desktop scaffold

**What it is.** An Electron + React + TypeScript application, built from a directory
that holds one 0-byte file.

**Depends on:** P1.6 (the renderer is a browser and will be refused without a
policy) and P1.12 (so date logic is imported, not re-derived). D7's answer is made
here, because the renderer's origin is a property of how it is scaffolded. It is on
the pilot path only because of S3 — nothing else about a pilot needs a PC.

**Unblocks:** P1.14, P1.15, P1.17.

**DONE WHEN:** an Electron window renders from `desktop/` on this box, and
`git grep -n "543" -- desktop/` returns exit 1 — the negative half, because the
whole point of P1.12 is that this number appears in one place in the system.

### P1.14 — Desktop sign-in, and bill viewing

**What it is.** A session on the desktop, and the shop's bills on a screen.

**Depends on:** P1.13, P1.5 and P1.3 — the desktop asks the same login question the
phone does, which is why P1.3 is one step for both programs rather than one each.
The endpoints are already there and already at the right tier: `GET /bills` and
`GET /bills/{id}` take any signed-in principal (`server/app/bills.py:543, 576`).
D8 settles who signs in: the cashier is an admin of the shop.

**Unblocks:** P1.15 and P1.17 — you print the bill you are looking at.

**DONE WHEN:** a person signs in on the desktop with the credentials they use on the
phone, and reads back a bill the phone created, with its doc_no, off the desktop
screen.

### P1.15 — Master data on the desktop: sellers, entities, prices

**What it is.** S6's second surface, and the desktop half of D5.

**Depends on:** P1.14. The endpoints are the same ones P1.8 and P1.9 already use;
what is new is the screen. This is a step rather than a footnote because S6 requires
both surfaces to exist — the system supports the counter and the weighbridge and
decides between them nowhere.

**Unblocks:** the office doing office work while the yard does yard work.

**DONE WHEN:** a seller created on the desktop is selectable on the phone after a
master-data refresh, and a price changed on the desktop is the one the next bill
quotes — both read back, not assumed.

### P1.16 — Shop identity a slip header can print

**What it is.** Whatever the printed slip has to say about the shop, and an endpoint
that returns it. Today there is nothing to return:
`ARCHITECTURE.md § 4. The data model — ten business tables` records `tenants` as
`(id, name, created_at)` with no address and no phone, and **no endpoint reads it**.

**Depends on:** nothing technical, and it is a dependency of P1.17 rather than a
polish item on it: a slip is the artifact a seller keeps, and a receipt from an
unnamed shop is not one. Because it is a schema change to a table every tenant has,
D10 applies — it wants doing before the pilot's rows exist.

**Unblocks:** P1.17.

**DONE WHEN:** a request returns the shop's name and whatever else the slip carries,
observed as an actual response, and `git grep -n "FROM tenants" -- server/app/` no
longer returns exit 1.

### P1.17 — Thermal slip printing from the desktop

**What it is.** ESC/POS to a 58/80 mm printer, from the desktop, for a bill that has
synced. The last stage-1 step, and the one S3 put here.

**Depends on:** P1.14 (the bill on screen), P1.16 (the header), P1.12 (the date
logic it must import), and a bill that has a doc_no. **S3 is what makes the last of
those a dependency rather than a design choice**: printing after sync means the slip
always has a document number, which is why `SRS_MAP.md § 7c. Printing` "whether the
pilot shop needs a printed slip" no longer has to be answered in the abstract.

**Unblocks:** the shop trading — a yard that hands over receipts cannot do so
without it.

**DONE WHEN:** a thermal printer produces a slip for a synced bill carrying its
doc_no and a Buddhist-era date, photographed; AND the desktop, asked to print a bill
that has not synced, refuses and says so on screen — S6's "says so plainly", and the
half that proves no workaround was invented.

### `GET /users` — landed 2026-08-07, and it is NOT a step in this file

Recorded rather than numbered. **GET /users is not a step in this file**, nothing
is renumbered for it, and the reason it gets a subsection anyway is that a reader
looking for where it fits would otherwise conclude the file had missed it.

**What it is.** The roster: `GET /users`, admin-only, tenant-scoped by RLS.

**Why it is not a P-number.** Every P-number here is a step toward a bar — a
pilot shop trading, or a product sold to a stranger. This is neither. It is a
capability that was ALREADY BUILT and ALREADY PROVEN becoming reachable:
`POST /users/{id}/deactivate`, `/activate` and `/revoke-sessions` all take a uuid
in the path, and no response in this API produced another user's uuid except as a
bare id on a bill header. Three proven capabilities had no caller who could name
their argument. **That is not a step in a plan; it is a plan that had a step
missing**, and the honest record is a note, not a number inserted into a
sequence twelve other files cite.

**It does not advance any stage, and does not shorten one.** Nothing in STAGE 1
depended on it — no step above names it, and P1.4 shipped the lock without it.
The step that will consume it is **P3.7** in stage 3, which owns the screen.
*(Named by number and not cited: a `file § Section` citation into THIS file
would quote its own target heading, and the checker counts two hits and calls
it ambiguous — measured, not guessed.)* That step is unchanged: a roster over
HTTP is not a screen, and P3.7's
DONE WHEN still requires a shop admin adding a user, changing a password and
locking an account **from a screen** — none of which this endpoint provides.

**What it changes for P3.7, stated so the step is not re-scoped by accident:**
P3.7 no longer has to invent a way to enumerate a shop's people, and it inherits
an auth-tier decision rather than making one — recorded at
`OPEN_ITEMS.md § Decisions open` "Whether `GET /users` should stay ADMIN-ONLY".
If the owner reopens that tier, P3.7's screen changes with it.

**The shape worth carrying forward, because this file is where ordering
arguments live.** A capability with no path to it is indistinguishable from an
unbuilt one from outside, and the proof that covers it can hide the gap: this
one passed for months because it obtains other users' ids by logging in AS them,
which is a route the product's actual user does not have. **When a step's DONE
WHEN is met by a proof, ask what the proof had that the shop will not.**

---

# STAGE 2 — what the pilot teaches, and what gets fixed because of it

Six steps, and the content of two of them cannot be written in advance. That is the
point of the stage: a pilot is the cheapest source of truth available about what a
yard actually wants, and everything guessed before it is a guess.

### P2.1 — One shop trades on it, on consecutive days

**What it is.** A milestone with a definition, not a build step — because "a shop is
using it" drifts into meaning "a shop has it installed".

**Depends on:** all of stage 1.

**Unblocks:** every step after it, and the answers to D6, D7, D9, D11 that the
code cannot supply. (D4 was on this list and has been removed: it was settled
before the pilot, by the owner, and not by evidence a shop produced.)

**TRUE WHEN:** a shop that is not ours has bought real loads on this system on
consecutive trading days, with nobody running a request by hand for them, and has
handed the sellers printed slips.

### P2.2 — A standing reconcile against the shop's real data

**What it is.** Running `reconcile.py` against the shop's database regularly, and
reading what it prints. Not a schedule — a person.
`PROJECT_STATUS.md § What is built` "the one instrument that checks the" describes
what it is: it checks the money against itself rather than exercising a path, it
makes no fixtures and writes nothing.

**Depends on:** P1.10 and P2.1. P1.10 is a real dependency and not a formality: a
green from an instrument whose own destructive proof is red is a green nobody has
established can turn red.

**Unblocks:** knowing the money is right, continuously, rather than believing it.

**DONE WHEN:** it has been run against the shop's real database and exited 0, with
the date recorded in `PROJECT_STATUS.md § Baseline observations`, and with the limits
it prints on every run read rather than skipped. **The proofs must never be pointed
at a shop's database** — they write bills that cannot then be removed.

### P2.3 — An off-site restore of real shop data

**What it is.** Taking a dump written after the first real bill, fetching it from
off-box, and restoring it.

**Depends on:** P1.2 and the first real bill. It is separate from P1.2's
done-condition because that one restores a dump of dev data; this one restores a
shop's. The reason it is its own step is that the first restore of real shop data
should not be the one performed in an emergency.

**Unblocks:** the claim that the shop's data is safe.

**DONE WHEN:** a dump taken after the shop's first real bill has been restored into
a scratch database from the off-site copy, and its row counts read back against its
own manifest.

### P2.4 — The residues only real volume can settle

**What it is.** Four things listed at
`OPEN_ITEMS.md § Verification gaps — built, not proven` that no amount of staging
reaches: a truncated day, a past day with real trade in it, two devices racing
inside one millisecond, and the request timeout — which was watched on a stopwatch
and never measured, so what is established is that a hung socket fails safely, not
that the ceiling is what produced it.

**Depends on:** P2.1. These need volume that does not exist before a shop trades;
manufacturing it would measure the fixture.

**Unblocks:** closing four verification gaps honestly.

**DONE WHEN:** each of the four has either been measured, with the measurement dated
in `PROJECT_STATUS.md § Baseline observations`, or recorded as accepted-unproven with
the owner's decision beside it. Both outcomes close the step; silence does not.

### P2.5 — What the day actually broke

**What it is.** The step whose content the pilot writes. It cannot be enumerated
here without pretending to know it.

**Depends on:** P2.1.

**Unblocks:** stage 3 being about a product rather than a prototype.

**DONE WHEN:** every defect the shop reported has a diagnosis with a reproduction,
or is recorded as not reproduced — with the reproduction established before any
cause is named (`CLAUDE.md § Workflow` "For any debugging").

### P2.6 — The decisions the pilot is the evidence for

**What it is.** The four open decisions above, plus the ones S6 deliberately left to
the shop: where sellers actually get created, which surface actually edits prices,
and whether the counter really prints the slip.

**Depends on:** P2.5 — the answers come from what the shop did, not from what it
was asked.

**Unblocks:** stage 3 building for a stranger on evidence rather than on a guess
about one shop.

**DONE WHEN:** D6, D7, D9 and D11 each carry an answer, or a recorded reason the
pilot did not settle it. D4 was on this list and is not: it was settled by the
owner ahead of the pilot, so the pilot is not the evidence for it.

---

# STAGE 3 — what selling to a stranger needs

Nine steps. The bar is different from stage 1's and larger: a shop the vendor has
never met, onboarded by someone who is not the person who built this, running under
a licence somebody has to be able to see the state of.

### P3.1 — What a licence is, where its state lives, and what a lapse does

**What it is.** A definition, a schema for it, and the behaviour at expiry. Nothing
exists: `SRS_MAP.md § 7a. How a licence is enforced — nothing exists` "There is no
licensing" measured every relevant term at zero across the tree with lockfiles
excluded, and `tenants` has no column that could hold it.

**Depends on:** nothing technical. **D3 has settled the hard half** — a lapse does
not stop a shop trading; it warns, and withholds what is not the act of buying and
selling. What remains is which capabilities fall on each side of that line, and
where the state is stored.

**Unblocks:** P3.2, P3.5, P3.9 — every one of them reads or writes this.

**DONE WHEN:** a migration stores licence state, and a document records what a lapse
withholds and what it does not, at a granularity someone can implement without
asking.

### P3.2 — What the provider service enumerates shops FROM

**What it is.** Formerly the unanswered half of
`ARCHITECTURE.md § 10. The three settled decisions`
D2 — cross-tenant reads are a per-tenant loop and no `BYPASSRLS` role is created,
which was satisfiable while the enumeration source stayed open.

**The SOURCE is now decided** and is the same relation D4 chose,
`directory.shop_codes`, read by a third role that holds no access to schema
`public`. Its migration is committed and **NOT YET APPLIED to any cluster**. That
settles what this step reads FROM; it does not by itself complete the step, and
the DONE WHEN below is unchanged for that reason.

**Depends on:** P3.1, since licence state is per shop and the list is what a loop
iterates. It is a hard prerequisite and not a detail: the `tenants` policy is keyed
on the table's own id, so the application role sees exactly one row with the tenant
context set and none without it, and the only working cross-tenant reader in the
system today is `reconcile.py`, which refuses to run unless its admin role is a
superuser (`server/scripts/reconcile.py:627`, listing at `:663`). A provider service
cannot start a loop it cannot get the list for.

**Unblocks:** P3.3, and therefore everything else in this stage.

**DONE WHEN:** a process holding **no superuser connection** lists the shops, proven
by a run whose connection string is recorded with it.

### P3.3 — The provider service

**What it is.** A separate service with its own principal table and its own secret,
per `ARCHITECTURE.md § 10. The three settled decisions` D1 — not a third role inside
`users`, and not an endpoint added to the shop API under a privileged role.

**Depends on:** P3.2. The shape is already decided; the enumeration is the thing it
cannot start without.

**Unblocks:** P3.4, P3.5, P3.6.

**DONE WHEN:** it runs as its own process, refuses to start without its own secret
(`lessons/README.md § Lessons` "config-defaults-must-fail-closed.md"), and the
migration that creates its principal table alters nothing on `users` — read off the
migration, not asserted.

### P3.4 — The provider audit log

**What it is.** A record of what the provider did, from the service's first day.
`ARCHITECTURE.md § 10. The three settled decisions` D3 requires it and gives the
reasoning: retrofitting one tells you nothing about the period before it existed,
which is exactly the period during which nobody was watching.

**Depends on:** P3.3. **D2 narrows what it holds** — provider ACTIONS, because a
heartbeat is not a read of shop data. It is written anyway where the classification
is arguable, because over-recording a provider action costs nothing.

**Unblocks:** P3.5 being defensible to a shop owner who asks what the vendor can see.

**DONE WHEN:** a provider action writes an audit row naming actor, action, shop and
time, read back out of Postgres.

### P3.5 — The provider web application

**What it is.** S4's screen: shop status, licence state, and when each shop last
sent a bill. It does not open a shop's bills, money or sellers.

**Depends on:** P3.1 (the state it displays), P3.3 (the service behind it), P3.4
(the log it writes), and P1.6 (it is a browser, by definition). The only shared
logic it needs is Buddhist-era date rendering — which is P1.12's package, already
built by then.

**Unblocks:** operating more than one shop without remembering which ones have paid.

**DONE WHEN:** the page lists every shop with its licence state and the time each
last sent a bill, in a browser, over HTTPS — AND carries no money field and no
seller field anywhere on it, asserted **negatively**, because a screen that happens
not to show something today is not a screen that cannot
(`lessons/README.md § Lessons` "correct-classification-can-still-render-as-an-error.md").

### P3.6 — Onboarding a shop without SQL

**What it is.** Creating a tenant, its first admin and its starting master data
through a tool. This is S1's actual bar, in its own words: a handover that leaves the
owner running SQL for shop number two is a debt taken on with money already
received.

**Depends on:** P3.3, and on P1.5 having established what an account needs. The
pilot's own shop may legitimately be created by hand; shop number two may not, and
that is the distinction this step exists to hold.

**Unblocks:** selling to anyone.

**DONE WHEN:** a new shop with a working admin account and a usable price list has
been created end to end through the tool, with no `psql` session open at any point,
and that admin signs in from a phone.

### P3.7 — User management inside a shop

**What it is.** Add, edit, deactivate and change a password, from a screen.
`SRS_MAP.md § 1. The map, item by item` records the current state at SRS 4.1: one
route, whose own docstring calls itself a stopgap.

**Depends on:** P1.4 — locking is the capability this screen exposes, and it is
built there because S5 needed it at the pilot. A stranger's shop hires and fires
without us, which is why this cannot stay a request someone runs on their behalf.

**Unblocks:** a shop operating its own staff list.

**DONE WHEN:** a shop admin adds a user, changes a password, and locks an account
from a screen, and the locked account is then refused at login — observed.

### P3.8 — Backup, restore and retention, per shop

**What it is.** A retention rule, and a restore that can be scoped to one shop.
`OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "No retention rule
exists" records that the inventory is accumulating and that inventing a rule in
passing is how a convention gets set by accident.

**Depends on:** P1.2 and P3.6. It becomes a real question rather than a deferred one
the moment backups run unattended for shops the vendor did not set up personally.

**Unblocks:** operating many shops' data without one restore being every shop's.

**DONE WHEN:** a retention rule is written down, a scheduled prune has run and left
what the rule says it should, and a restore of one shop's data has been performed
without touching another's.

### P3.9 — Billing, and the 3% withholding question

**What it is.** How the licence is invoiced, and the answer to
`OPEN_ITEMS.md § Business questions — unanswered, and not answerable from the code`
"3% withholding tax on a monthly service fee".

**Depends on:** P3.1 — an invoice bills a licence, and there is no licence yet. It
is last because there is no billing anywhere in this system, and the question is an
accountant's rather than a schema one until there is.

**Unblocks:** being paid.

**DONE WHEN:** the invoice's required content is recorded with the accountant's
answer and its date, and whatever that requires exists.

---

## What wakes up later, and what wakes it

Deferred on purpose, with the condition that ends the deferral. None is on this
path; all are on a clock.

- **The index on `(tenant_id, server_received_at)`** — every daily report is a
  sequential scan over the tenant's whole bill history and gets one row slower per
  bill, forever. *Wakes at:* roughly a year of trade, or the first shop that says the
  day view feels slow. One migration.
- **The shared proof teardown** — proof bills land active on the real current day and
  are indistinguishable from trade in the daily report. *Wakes when:* the dev
  database's day view becomes unreadable, or a second developer starts running the
  proofs. Never urgent for a shop, because the proofs must never touch one.
- **Per-tenant timezone** — shop time is a fixed offset on both sides, and the two
  constants are not compared by anything:
  `ARCHITECTURE.md § 6. Time` "The structural fact".
  *Wakes at:* a tenant in a zone that observes daylight saving. Schema change plus a
  device verification, not a config edit.
- **The nine unaccountable tuned constants** — none is wrong, none can be safely
  changed. *Wakes when:* one of them needs to move. The trial ledger in
  `PROJECT_STATUS.md § Tuned constants — trial ledger` is what stops that becoming a
  fitting exercise.
- **Everything on the out-of-MVP list** — `PROJECT_STATUS.md § What is NOT built`
  "do not build, do not scaffold". *Wakes when:* a shop that is using the product
  asks for one of them, which is the only evidence that has ever been worth having.

---

## Corrections owed elsewhere

Found while writing this file, and one of them while proving it. **Pointers, not
fixes** — each lives in a file this phase was told not to edit, and a reader should
know they are known rather than undiscovered.

- **`CLAUDE.md § Architecture` describes the yard app as deliberately read-only for
  master data. S6 makes that false**, for sellers and for prices. The correction is
  owed and is D12's first half.
- **`CLAUDE.md § Architecture` enumerates three programs; S1 makes a fourth a
  deliverable.** `ARCHITECTURE.md § 2.3 A tension, recorded and not resolved`
  already records this as a tension between two files; S1 turns it into a statement
  `CLAUDE.md` is now wrong about, because the provider service is no longer merely
  decided — it is in the handover. D12's second half.
- **`CLAUDE.md § Machine footguns` records `lessons/README.md`'s BLOB as CRLF, at
  "41/41" and "42/42", and it is not.** Measured with `git cat-file -p` against a
  synthetic CRLF positive control, every one of those blobs holds **zero** CR bytes;
  the figures are LINE counts. The measurement, its commits and its control live at
  `PROJECT_STATUS.md § Baseline observations`
  "A THIRD, INCIDENTAL MEASUREMENT, AND IT CONTRADICTS A MACHINE FOOTGUN."
  and are deliberately not restated here. **The working-tree half of that entry is
  correct and unchallenged**, and its operational advice — measure the blob, and
  never let git's warning be the observation — is exactly what produced the correct
  measurement. It is wrong in one number and right in its method, which is why it is
  a correction rather than a removal.
- **`CLAUDE.md § Scope and status` still says forward steps are R-numbers**, and
  this file's own *Numbering* section closed them as a log on 2026-08-07 and
  issues P-numbers instead. The exact sentence is "Forward steps are R-numbers,
  defined in ROADMAP.md and nowhere else" — which was true when written and is
  now wrong in the one direction that matters, because it is the pointer a booting
  session follows to find out what the next step is even CALLED. Found while
  closing P1.4. `START_HERE.md § 1. Reading order` "R-numbers are defined here"
  carries the same stale sentence; that file is not locked and is a one-line fix,
  which is why it is listed separately below rather than folded in here.
- **FOUR corrections are now owed to a LOCKED section, and NOT ONE of them is made
  here.** Two are D12's; the third is the CRLF entry above; the fourth is the
  R-number bullet immediately above this one. Each needs the owner's
  confirmation in a phase of its own:
  `ARCHITECTURE.md § 2.3 A tension, recorded and not resolved` "amending it is a separate phase".
- **`START_HERE.md § 1. Reading order` does not name `ARCHITECTURE.md`**, so a
  session following the reading order will not reach it.
  `ARCHITECTURE.md § 12. Corrections owed elsewhere` "Nothing points at this file yet."
  recorded this and it is still true.
- **`START_HERE.md § 1. Reading order` reports `PROJECT_STATUS.md` at a line count
  it no longer has.** Measured at `6de5cec` with `wc -l`: **2253**, against the
  **1940** the pointer states and the **2053** `SRS_MAP.md § 8. Stale references, recorded as stale`
  measured at `ddf3c85`. It matters beyond arithmetic — that file sets its own
  split-review trigger at 2000 lines in its own text, and the pointer a new session
  reads first still reports it as under.
