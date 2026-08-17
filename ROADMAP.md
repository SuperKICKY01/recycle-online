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

## The four steps to one paying shop

**Written down 2026-08-10 because they existed only in conversation.** This
reorders nothing and ranks nothing new: it names the four things standing between
today and a shop that trades, and points each at the step that owns it. A reader
tomorrow must not have to assemble this from three files.

**THE DISTINCTION THAT RUNS THROUGH ALL FOUR, and it is the only one that
matters here: outstanding because something is UNWRITTEN, against outstanding
because it waits on A HANDSET or on A DATABASE NOBODY HAS CREATED.** Those need
different work from different people, and a list that blurs them reads as four
coding tasks when two of them are not.

**1. A shop can be issued a code — `P1.3`, Criterion B.**
*Done:* the tool exists and has been run. `server/scripts/provision_shop.py`
mints a code from the constraint's own alphabet and inserts it as the owner role,
and the pilot shop on the dev database holds `R6VD7RAC`. Criterion A — the server
resolves a code and the login chains off it — is satisfied and proven.
*Outstanding:* it has never run against production. *Why:* **not unwritten.**
Production does not exist, so there is nothing for it to run against; and who
issues a code when a shop is onboarded is still the owner's decision rather than
the schema's.

**2. Real accounts — `P1.5`.**
*Done:* **the server half is complete as of `cb11f6a`.** An admin creates an
account, an admin resets a password, a person changes their own, all proven over
real HTTP against a scratch database. D6–D9 decided the shape; the routes now
implement it.
*Outstanding:* nothing has signed in from a handset, and the accounts the DONE
WHEN wants must exist in the production database. *Why:* **not unwritten** — it
waits on step 3 for the phone and step 4 for the database. See P1.5 itself, where
this split is argued at length.

**CORRECTED 2026-08-12 — the first clause is no longer true as written; the KIND
is unchanged.** A sign-in and a sign-out have happened on a handset: the login
screen drawn, a session established and cleared, on Android, on this project's
own DEBUG build — **a TEST artefact**, its API address a plain-HTTP LAN address
baked in at build time. Nobody signed in through that screen to reach the cart
screen and nothing was weighed; iOS has never run the migration; no release build
exists on either platform. The accounts this step wants must still exist in **a
production database nobody has created**, so step 2 remains outstanding of the
second kind, not the first.

**3. A login screen on the phone — `P1.7`.**
*Done:* nothing. *Outstanding:* the whole step. *Why:* **unwritten, and this is
the one of the four that is.** The primitives are not new — `TextInput` is
already used in three screens — so what is missing is the flow and the storage of
a session, not the controls. It waits on step 1 for what identifies a shop and on
step 2 for something real to sign in as; both of those are now answered on the
server, so nothing blocks it but the work.

**CORRECTED 2026-08-12 — THIS IS THE ENTRY THAT WENT STALE, AND WHAT CHANGED IS
THE KIND.** The paragraph above is left as written and was true on 2026-08-10.
The work landed in the commits from `a471dc2` to `959f22d`, so step 3 is **no
longer outstanding-because-unwritten** — which is the one distinction this
section exists to draw. It is now the SECOND kind: **it waits on a handset.** The
login screen has been drawn on one, on Android, on this project's own DEBUG build
— **a TEST artefact**, its API address a plain-HTTP LAN address baked in at build
time — but nobody signed in through it to reach the cart screen and nothing was
weighed. iOS has never drawn it, and no release build exists on either platform.
Whether the DONE WHEN is met is P1.7's own entry to say; this section does not.

**4. A reachable server — `P1.2`.**
*Done:* nothing. *Outstanding:* the whole step. *Why:* **neither unwritten nor
waiting on code — nothing has been chosen or paid for.** The API runs on a
development box and `mobile/app.json` points at a LAN address over plain HTTP.
This is the only step in this file with external lead time, which is why it sits
in the head of the queue above, and HTTPS is part of it: on the public internet
that plain address hands the bearer token and every money value to anyone on the
path.

**WHAT THIS LIST IS NOT.** It is not a fifth ranking and it does not move a bar.
Each step's own entry below remains the authority on its DONE WHEN, its
dependencies and its argument; this section only says which four to look at and
what kind of outstanding each one is.

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
**Overtaken as to the COUNT, 2026-08-12; the finding above is left exactly as the survey took it —** `PROJECT_STATUS.md § Known device gaps` "A SECOND ANDROID PASS".

---

## The decisions the ordering forced

The spine could not be ordered without answering these. **Eight are settled**, with
the owner's reasoning recorded; **four are open**, each with what would settle it.
None of them is derivable from S1–S6.

**THE D-NUMBERS BELOW ARE THIS FILE'S OWN, AND THEY COLLIDE WITH
`ARCHITECTURE.md`'s. Noted 2026-08-10; nothing is renumbered.** That file has held
its own D1–D5 since before this section was written and gained **D6 through D9**
(account provisioning) on 2026-08-10, so **every number from D1 to D9 now names two
unrelated things, and which one it means depends on the file you are reading.**
Where this file cites the other's, it says so — D2 and D4 below both name
`ARCHITECTURE.md` explicitly. **Where a sentence in this file gives a bare number
it means THIS file's**, and that includes P2.6's DONE WHEN, which is untouched.
Neither space is renumbered: doing so orphans every reference to it, which is the
same argument that closed the A-numbers and the R-numbers rather than tidying them.

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
committed and APPLIED TO THE LIVE DATABASE `recycle` ON 2026-08-09** — this
sentence read "NOT YET APPLIED to any cluster" until then. The format and its
reasoning are recorded in that architecture section and in the migration's
docstring, and are not repeated here. **What that application settles and what it
does not:** the SCHEMA half of P1.3 is done, and P1.3 itself is not. This read
"that step is finished by a login, not by a migration, and its DONE WHEN is
unchanged" until 2026-08-10, when that DONE WHEN was rewritten — see P1.3, which
carries the reason and the old wording.

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
**WHICH DATABASE THIS MEANS, clarified 2026-08-10 and unchanged in substance.**
This decision is untouched — the pilot still runs on production. What a reader
should not infer is that the database running today IS production: it is not, and
`ARCHITECTURE.md § 10. The three settled decisions` D5 records that `recycle` is
the dev database and that production will be created fresh when the hosting choice
is made. So the pilot shop provisioned into `recycle` on 2026-08-10 is a test of
the path, and the shop this decision is about does not exist yet.

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

**THAT LAST SENTENCE NAMES TWO THINGS WHERE THERE ARE THREE — corrected
2026-08-12, and the sentence is left standing because it was written before
anyone looked.** Also missing is **a way for the backup tooling to reach a
database it cannot `docker exec` into**: both scripts shell into a container and
neither has a DSN path, so on the day the database moves they stop working. The
sized entry is `OPEN_ITEMS.md § Blocking one real paying shop` "THE BACKUP
TOOLING CANNOT REACH A REMOTE DATABASE AT ALL". It matters to the ORDER, which
is this file's job: the backup is half this step's DONE WHEN, and this half
surfaces only once the server half looks finished.

**Depends on:** nothing technical. It is a spend decision, and it is the only step
in this file with external lead time, so its clock starts independently of every
software step and should start now. **D10 constrains the choice**: after the first
real bill the box cannot be rebuilt, so whatever is chosen must survive migration,
backup and restore without being emptied.

**AND D10 IS NO LONGER THE ONLY CONSTRAINT ON THE CHOICE — added 2026-08-12.**
The requirements this system places on a host were read out of the tree and
written down at
`ARCHITECTURE.md § 14. What this system requires of a host` "THIS SYSTEM NEEDS A MACHINE THE PROJECT CONTROLS".
They are not restated here — two copies drift — but the conclusion bears on the
ordering argument above, so it is named: the system needs shell access, a
superuser, role creation and database creation, because the migration chain
raises without a role no migration creates, and because a dump taken without a
superuser SUCCEEDS AND IS EMPTY under FORCE row-level security. **Read that
section BEFORE the choice, not after it.** A requirement discovered after
procurement is a requirement paid for twice.

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
cannot be built, because `LoginRequest.tenant_id` requires a uuid and nothing on
a login form can derive one — usernames are unique per shop
(`0001_initial_schema.py:104`), so
a username does not identify a tenant. It is before P1.7 because the screen's
fields are decided by the answer, and before the pilot's rows exist because it is
a schema change (D10).
*(That citation read `main.py:26` until 2026-08-10 and had rotted — `:26` is
`from .users import router as users_router`. The requirement is at
`server/app/main.py:30`, re-derived at `8b17bc2`. It is written as a SYMBOL here
because a citation carrying a POSITION rots and one naming the file and the symbol
does not — the rule this file's own queue entry records.)*

**Where this step now stands.** The SCHEMA half is written AND APPLIED: the
migration creating the relation, its constraints and its reader role was
**APPLIED TO THE LIVE DATABASE `recycle` ON 2026-08-09**, where this read "NOT
YET APPLIED to any cluster" until then. **THAT DID NOT ADVANCE THIS STEP'S DONE
WHEN** — a migration is not the criterion. This passage read "which is unchanged
below: P1.3 is finished by a login that carries no uuid returning 200, not by a
migration. The rest of the step is untouched — the server change is not written"
until 2026-08-10, and **both halves of that are now false**: the DONE WHEN was
rewritten below for the reason given there, and **the server change IS written**
— `POST /auth/shop-code` landed in `1951b19`, with its own proof.

**WHAT THE ENDPOINT WILL DO IS NOW DECIDED — 2026-08-10.** This passage read "this
file says nothing about what the login endpoint will do because that is not decided"
until then, and that sentence is now false. The decision is recorded at
`ARCHITECTURE.md § 10. The three settled decisions` as D4, and is deliberately NOT
restated here: **the login body does not change**, the code resolves at a separate
unauthenticated endpoint returning the tenant identifier and nothing else, refusing
identically whatever the cause. This sentence read "**THIS STEP'S DONE WHEN IS
UNCHANGED** — a decision is not a login, and P1.3 is still finished by the
observed 200 below" until 2026-08-10. It is now false, and the DONE WHEN below
records why it had to change.

Two things are still worth naming as absent rather than
assumed: **nothing writes to that relation today**, and **who issues a code when a
new shop is onboarded is undecided** — there is no provisioning path, by any
route, manual or otherwise. One more, added by D4: **whether the endpoint is
protected against repeated attempts is undecided**. A third read "the **second
connection it requires does not exist** — no `recycle_directory` DSN is present
anywhere in the tree" until 2026-08-10; it exists, added in `f84b54d` and proven
from the application's own stack.

**THE "REPEATED ATTEMPTS" CLAUSE ABOVE IS NOT A PROPERTY OF THIS ENDPOINT, and
leaving it here is how it gets closed at one route and believed handled.** Added
2026-08-10: nothing anywhere in this API limits repeated attempts — **login
included** — and D4 files it under the shop-code lookup only because that is the
endpoint the question came up at. The system-level record is
`OPEN_ITEMS.md § Decisions open` "NOTHING ANYWHERE LIMITS REPEATED ATTEMPTS", and
it is the one to read before anything is built. The clause is left in place rather
than removed, because it IS still true of this endpoint and deleting it would make
this step look narrower than it is.

**Unblocks:** P1.4, P1.5, P1.7, P1.14.

**DONE WHEN — REWRITTEN 2026-08-10.** This read "a `POST /auth/login` whose body
carries **no uuid** returns 200 and a usable token, run bare against the server,
with the request and response recorded" until then.

**THAT CRITERION IS UNREACHABLE BY DESIGN, NOT UNMET.** D4 in
`ARCHITECTURE.md § 10. The three settled decisions` decided that the login body
does not change, and `LoginRequest.tenant_id` is a required uuid — so a login
carrying no uuid can only ever return 422. The old bar describes a road this
project looked at and decided not to take.

**IT WAS NOT REWRITTEN BECAUSE THE WORK TURNED OUT TO BE HARD**, and that is the
part a later reader should check rather than take: the server change it was
waiting for LANDED, in `1951b19`, and the endpoint the old bar wanted folded INTO
login was deliberately built beside it instead. A criterion is rewritten here
when a DOCUMENTED DECISION changed the route, never for difficulty. The decision
is D4, it is dated, it is quotable, and it predates this rewrite.

**THE STEP IS NOW FINISHED BY TWO CRITERIA, AND THEY FAIL FOR DIFFERENT REASONS.
Whenever this step is called not done, say WHICH ONE**, or "P1.3 is not done"
stays ambiguous between a wrong server and an unusable one.

**CRITERION A — THE SERVER IS CORRECT.** Provable today, against a throwaway
database at 0009 carrying a fixture code. The observables, not a description of
them:

1. **Two requests in sequence, run bare against a running server**:
   `POST /auth/shop-code` exchanges an eight-character code for a tenant
   identifier, and THAT identifier — not one typed by hand — is then used in
   `POST /auth/login` to obtain a token.
2. **Both requests and both responses recorded.**
3. **CONTROL, the refusing side**: a code that does not exist returns 404.
4. **CONTROL, the accepting side**: the token from step 1 is USED against an
   endpoint that requires authentication, and that request succeeds. A token is
   a string until something accepts it, so obtaining one proves nothing alone.

**INSERTING A FIXTURE ROW INTO A SCRATCH DATABASE IS NOT ISSUING A CODE, and A
does not pre-empt P1.5.** A fixture is a row a test wrote into a database no
shop uses. Issuing is a path by which a real shop comes to have a real code, and
there is none.

**CRITERION B — THE ROUTE WORKS FOR A REAL SHOP.** Requires that somebody can
issue a code, which is P1.5. Nothing writes to `directory.shop_codes` by any
route, so in production this endpoint resolves nothing at all.

**B DOES NOT GATE A, AND A DOES NOT SATISFY B.** A is about whether the server is
right; B is about whether anyone can reach it.

**CRITERION A IS SATISFIED — 2026-08-10, `b22d449`.** The chain ran in ONE
execution: the identifier posted to login was the object parsed out of the
resolve response, `GET /whoami` accepted the token that came back, and both
controls ran in the same run as the positives. This passage read "**Outstanding
as of 2026-08-10: BOTH.** A is provable but NOT YET PROVEN — the proof that
exists exercises the lookup and login separately and does not chain one into the
other, and none of its assertions uses a token obtained from a resolved code"
until that commit. Evidence is the dated entry in `PROJECT_STATUS.md`; neither
criterion's wording above is touched.

**OUTSTANDING: CRITERION B, AND ONLY B.** It waits on P1.5 — nobody can issue a
code, so nothing resolves in production. **"P1.3 is not done" therefore has
exactly one meaning now**: not that the server is wrong, but that no shop has a
code. That is what splitting the criteria was for, and a reader with no memory of
either commit can tell which half is missing without asking. The queue item is
`OPEN_ITEMS.md § Blocking one real paying shop` "NOBODY CAN ISSUE A SHOP CODE".

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
creates one account per staff member.

**CORRECTED 2026-08-10 — THE SECOND HALF DESCRIBES SOMETHING THAT DOES NOT EXIST.**
This read "A path by which a shop's first admin exists, and by which that admin
creates one account per staff member. Today the only credentials in existence come
from the dev fixture" until then. **Two different things were wrong with it and
they are not the same kind.** The clause about an admin creating accounts is the
step's GOAL and is not false — it is UNBUILT, and a reader was entitled to take
it as describing something that exists, because nothing said otherwise.
**MEASURED, not inferred: there is no endpoint by which an admin can create any
account.** The API declares 29 paths and the only ones under `/users` are
`GET /users` and `POST /users/{user_id}` `activate` / `deactivate` /
`revoke-sessions` — no create route and no password-change route — so an admin
holding a valid token has no way to bring a staff account into existence.
**The second sentence was flatly false rather than merely unbuilt**: credentials
no longer come only from the dev fixture, since `provision_shop.py` created the
pilot shop's first admin on 2026-08-10.

**IT CHANGED BECAUSE A MEASUREMENT CONTRADICTED IT, NOT BECAUSE THE WORK TURNED OUT
HARD.** Nothing here was attempted and abandoned; the sentence simply described a
capability nobody had built, and it survived because the surrounding step is
correct about the goal. **THE DONE WHEN BELOW IS UNCHANGED** — the bar was always a
staff account existing and signing in, and that bar is untouched by discovering
that the route to it is missing.

**WHAT WOULD HAVE TO BE BUILT for that sentence to become true:** a create-user
endpoint under the admin gate, writing into `users` under the caller's own tenant
context, plus a way to set that user's first password. Today the credentials that
exist come either from the dev fixture — `PROJECT_STATUS.md § What is NOT built`
"Real per-shop login" — or from `server/scripts/provision_shop.py`, which creates a
shop's FIRST admin from the installer's shell and deliberately does not create
anyone else.

**AND WHAT WOULD HAVE TO BE BUILT IS NOW DECIDED — later the same day, 2026-08-10.
It is THREE endpoints, and the paragraph above names two.** The decision and its
reasoning are at `ARCHITECTURE.md § 10. The three settled decisions` D6 and are
deliberately not restated here: an admin creates a user; an admin sets another
user's password; a user changes their own. The paragraph above is left standing
because it was right about the GAP and merely short about the SHAPE — "a way to
set that user's first password" is two routes wearing one phrase, and the two
differ in guard, in request body and in whose session the change ends, which is
why they are not one route branching on the caller.

**Three further decisions land inside this step, and not one of them is built.**
D7 — an admin may create another admin, so a shop is not one lost handset away
from having nobody who can sign in. D8 — a first password is NOT forced to change
on first use; **a later session finding no such mechanism is looking at a decision,
not at an oversight**, and D8 records what that costs and what makes it
acceptable. D9 — the password rule is a minimum length and nothing else, with the
length itself deliberately not chosen yet.

**THIS STEP'S DONE WHEN IS UNTOUCHED BY ALL OF THAT.** The bar was always a first
admin and a staff account existing and both signing in from a handset; deciding
which routes get them there moves no bar, and a decision is not an account.

**CORRECTED AGAIN 2026-08-10, LATER THE SAME DAY: THE SERVER HALF IS COMPLETE AND
THE STEP IS NOT. Those are different facts and this step must say which is
which**, so that "P1.5 is not done" has exactly one meaning to a reader with no
memory of today. Same form as P1.3's split, and the same reason: that step was
ambiguous while two different things could each be what "not done" meant, and it
stopped being ambiguous when one of them landed.

**~~MEASURED, not inferred: there is no endpoint by which an admin can create any
account. The API declares 29 paths and the only ones under `/users` are
`GET /users` and `POST /users/{user_id}` `activate` / `deactivate` /
`revoke-sessions` — no create route and no password-change route.~~** Struck
2026-08-10. All three routes exist as of `cb11f6a`: `POST /users` (`0241cc8`),
`POST /users/me/password` and `POST /users/{user_id}/password` (`cb11f6a`). The
API declares **31 paths and 37 operations**, read out of the schema it publishes.
Everything the three paragraphs above say about the SHAPE — D6's three routes,
D7, D8, D9 — is unchanged and is now built rather than decided.

**IT CHANGED BECAUSE THE WORK LANDED, NOT BECAUSE IT TURNED OUT HARD**, which is
the same sentence P1.3's rewrite needed and for the same reason: a step that
changes wording is otherwise read as a step that ran into trouble. Nothing was
attempted and abandoned, no bar moved, and no scope was cut.

**WHAT IS OUTSTANDING, AND IT IS NOT THAT ANYTHING IS UNWRITTEN.** Two things,
neither of them code:

- **Nothing has signed in from a handset.** Every session this work has ever
  minted was minted over loopback HTTP by a proof. The DONE WHEN asks for a
  person on a phone, and that waits on **P1.7** (a login screen) and **P1.11**
  (an installable build).
  **CORRECTED 2026-08-12 — the first sentence is false as written, and the bar
  does not move.** A session has been minted on a handset and cleared there: the
  login screen drawn after a cold start, `SecureStore.xml` at count 1 while
  signed in and count 0 after a real sign-out. **The artefact is a TEST
  artefact** — this project's own Android DEBUG build (`9d2eb22`,
  `dev.chutipon.recycle`), one vivo 1938, never Expo Go, its API address a
  plain-HTTP LAN address baked in at build time, so the server behind it was this
  network's dev server. **What did NOT happen:** nobody signed in through that
  screen to reach the cart screen, and nothing was weighed — the product and
  seller lists were empty on that tenant. iOS ran the secure store's clear on
  2026-08-06 and has never run the migration; **no release build exists on either
  platform.** The DONE WHEN below is untouched: a first admin AND a staff
  account, in the production database, both signing in from a handset.
- **The production database does not exist.** The DONE WHEN asks for accounts in
  it. `recycle` is the DEV database, and where production runs has not been
  chosen or paid for — **P1.2**.

*(P-numbers, not R-numbers: the table at the head of this file maps the old `R5`
onto this very step, so citing it here would point a reader back at what they are
reading.)*

So "P1.5 is not done" now means exactly one thing: **not a missing endpoint, but
a missing phone and a missing server.** The DONE WHEN below is untouched and
nothing here lowers it.

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
(`CLAUDE.md § Boot check` "WHICH BUNDLE THE HANDSET IS RUNNING"); AND a sweep of
disk finds the constant gone — ripgrep, with the flags written out because each
one buys a blind spot back:
`rg --no-ignore --hidden --text --count-matches "DEMO" mobile/`, which must exit
**1**. `--no-ignore` defeats `.gitignore`, `--hidden` reaches dot-directories,
`--text` reads a bundle as text; the count form is deliberate, so a RED run names
paths and counts and never prints a matched line.

**AND THE RUNNER REPORTS THE FILE COUNT OF `mobile/dist/` IN THE SAME
OBSERVATION.** Not passes it — reports it. A criterion that requires a build
output to be clean is satisfied by deleting the build output, and an empty
directory sweeps clean for the wrong reason. The number is the only thing that
tells those apart, and a run that does not carry it has not met this bar.

**WHY THE COMMAND CHANGED — 2026-08-11, and the bar did not move.** It read
`git grep -n "DEMO" -- mobile/` returns exit 1. **That searches TRACKED FILES
ONLY**, so `mobile/dist/` — which git ignores — was structurally invisible to it:
measured at `5e59894`, pointed at that directory alone the old command exits 1
while the sweep above finds matches inside it. One path, one token, two tools,
opposite answers. The human half above is untouched and nothing was made easier;
a command was replaced because it could have gone green with the thing it looks
for still sitting on disk.

**WHAT THIS STILL CANNOT SEE, written in place rather than left to be found.**
Absence of the token is not absence of the credential: a renamed or minified
constant carries the value without carrying the word, which is what a bundler
produces. The sweep's root is `mobile/`, so anything outside it is unseen.
`node_modules/` sits inside that root, so an unrelated dependency can turn the
sweep red for reasons that have nothing to do with this step. And none of it says
anything about a bundle already installed on a handset — which is what the bundle
clause above is for, and why it is not the optional half of this criterion.

**DONE WHEN — CLAUSE 1 MET, CLAUSE 2 REWRITTEN, 2026-08-17.** Everything above
this line is the criterion as it stood and is kept rather than deleted: the
ripgrep command, the 2026-08-11 note on why the command changed, and the
"WHAT THIS STILL CANNOT SEE" paragraph all stay readable as written. What
follows supersedes the DONE WHEN itself.

**CLAUSE 1 IS MET — 2026-08-17.** A person typed their own username and
password on the handset and reached the cart screen, with the bundle
established beforehand (`npx expo start -c` and a full reload, both BEFORE the
reading that is being relied on, not afterwards to check —
`CLAUDE.md § Boot check` "WHICH BUNDLE THE HANDSET IS RUNNING"). It exceeded
the bar rather than merely meeting it: on that session a bill was weighed and
synced, `B-2569-381`. The observation is recorded in
`PROJECT_STATUS.md § Current phase`.

**CLAUSE 2 — THE DISK SWEEP — IS REWRITTEN. IT WAS NOT REWRITTEN BECAUSE THE
WORK TURNED OUT TO BE HARD**, and that is the part a later reader should check
rather than take. It is P1.3's rule applied here: a criterion is rewritten when
a documented decision or a MEASUREMENT changed what it was measuring, never for
difficulty. Nothing about removing the constant was hard and no work is avoided
by this change — the constant is gone from source. **THE CRITERION MEASURED THE
WRONG THING, IN BOTH DIRECTIONS**, and both directions were measured
2026-08-17:

- **FALSE POSITIVE.** The sweep exits **0** with **5 matches**, and **four of
  the five are prose EXPLAINING that the constant was removed** — including
  this file's own paragraphs above. A token that appears in the explanation of
  its own deletion cannot be the needle, and rewording that prose so a sweep
  passes is exactly what this repository forbids.
- **FALSE NEGATIVE, and this is the half that matters.** The criterion's own
  "WHAT THIS STILL CANNOT SEE" paragraph above states it: "a renamed or
  minified constant carries the value without carrying the word, which is what
  a bundler produces". So the old command could exit **1** — its PASSING
  result — with the credential still sitting on disk. A bar that can go green
  over the thing it is looking for is not a bar.

Measured in the same pass: `mobile/dist/` held **213 files**, so the sweep's
root was not empty and the false positive is not an artefact of a missing
build.

**THE NEW CLAUSE 2 — THREE PARTS.**

1. **HUMAN, UNCHANGED.** A person types their own username and password on a
   handset and reaches the cart screen, with the bundle established
   beforehand. **MET 2026-08-17**, as above.
2. **SOURCE.** No credential VALUE, and no constant DECLARATION as distinct
   from a MENTION, anywhere under `mobile/` excluding `dist/` and
   `node_modules/`. Checked by a SCRIPT that reads the secret out of
   `server/app/seeddata.py` ITSELF and never lets it reach a command line:
   every shell on this box lands verbatim in `.claude/hooks/*.log`, so a
   checker taking the credential as an argument would CREATE the exposure it
   exists to test for.
3. **BUILD OUTPUT.** `mobile/dist/` **REBUILT** after the removal — not
   deleted — with the file count AND the newest file's timestamp reported in
   the same observation, and the same script finding no credential value in
   the rebuilt bundle. Deleting the directory satisfies any absence check for
   the wrong reason, and the timestamp is the only thing that says the bundle
   post-dates the removal.

**THE POSITIVE CONTROL IS PART OF THE CRITERION, not of the runner's
discretion.** In the same run the script must also search for a string KNOWN to
be present — the seed USERNAME will do — and report finding it. Without it
"found nothing" is indistinguishable from an instrument that never looked
(`lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md").

**THE LIMIT, AND NO SWEEP ON THIS BOX CAN CLOSE IT.** None of this says
anything about a bundle already installed on a handset. The old criterion said
so too; it is repeated here rather than assumed inherited, because a rewritten
bar is where an inherited caveat goes missing.

**THE DESIGN — OWNERSHIP BOUND TO EACH LOCAL ROW, KEYED BY TENANT AND USER.**
Chosen 2026-08-11 over two alternatives, and the alternatives are recorded
because the reasons are the design. REFUSING TO SIGN IN while bills are queued
was rejected outright: a yard that opens at five in the morning cannot be stopped
because whoever worked yesterday left something unsent. SIGNING IN FREELY AND
HALTING THE WHOLE QUEUE was rejected too — it makes today's cash hostage to
yesterday's, raises the number of bills that exist only on one phone, and hands
the person at the scale a problem they cannot solve, which they will solve by
reinstalling the app and losing the bills for real.

**WHAT THE KEY IS FOR — TWO FAILURES, NOT ONE.** Across shops the failure is
loud: measured at `16a1938`, a bill sent under another tenant's token returns
**422** with a string `detail`, and 422 is the only terminal class on the send
path, so the bill dies and cash that left the drawer never reaches the server.
Within one shop the failure is silent: the same send returns **201**, and
`created_by` is the principal who sent it, not the person who took the goods.
Measured at `16a1938`, a payload naming a different principal under four
different field names was ignored on all four, and the control send without any
such field produced the identical `created_by` — the client cannot state who
bought, and therefore cannot correct it either. The only remedy is not to send
under the wrong token at all. Both halves of the key block a send; neither fails
a bill.

**THE CACHE IS THE HEAVIEST HALF, AND IT IS NOT ABOUT SYNC.** Prices are per
tenant — measured at `16a1938`, a product belonging to one tenant is invisible to
another under RLS — while the local cache carries no tenant column at all. So a
device that changes shops keeps the old shop's prices, and the person at the
scale sees numbers that look entirely normal, weighs, and pays out cash at
another shop's rate. The wrong money leaves the drawer; nothing about the sync is
wrong, and the bill that follows sends successfully. Worse, the bill carries a
`master_as_of` pointing at the old shop's fetch, so the evidence agrees with
itself and a later audit finds nothing out of place. Read this beside
`ARCHITECTURE.md § 11`: if this happens on a real handset, no one will ever learn
that it did — the bill sent, the price looked ordinary, and no party can open the
device to check. The cache therefore binds to tenant only, not to user, and a
tenant mismatch must mean ABSENT rather than STALE, because the freshness strip
already teaches the operator that stale data is usable and this is the case where
they must stop.

**WHERE THE FILTER HAS TO REACH.** Measured at `16a1938`, fourteen statements in
the local store select rows by predicate. Six draw theirs from the shared
`QUEUED` constant, so one edit reaches six. The other eight carry their own.
`listVoidsToApply` is one of the eight: THE VOID PATH DOES NOT USE `QUEUED` AND
DOES NOT INHERIT THE FILTER. It has its own predicate, its own route, no backoff
column, and no device-global gate — so whoever edits `QUEUED`, runs the send
proofs and sees green will believe the work is done while a void for another
person's bill still leaves the device. An owner filter needs its own acceptance
evidence on the void queue, separate from the send queue. Add `getBill` if
single-row reads are to be checked, and note that three of these statements are
also called from `App.tsx`, outside `mobile/src/`, where a count scoped to
`src/` will not see them.

**PARKING, NOT A NEW STATE.** The send queue is strict head-of-line, so a filter
alone would leave another person's bill blocking the head. The mechanism for
lifting a row out of the queue while it is still owed already exists — it is what
a 424 does when master data is missing. A row belonging to someone else uses that
same path; only the release condition differs, being that person's sign-in rather
than the passage of time. No third state is introduced, because every state must
already answer what the status strip counts, what startup recovery touches, what
the sign-out refusal counts and what the queue-health alarm reads, and the
existing states answer all four and have been tested doing it.
**`resumeAfterSignIn` NEEDS ITS OWN PROOF, NOT CARE.** Today it releases the
queue immediately after a sign-in, which is right, because a 403 halts the loop
in memory only. With a filter in place it becomes the thing most likely to
release another person's rows. The proof must show, in ONE run, zero of the
absent owner's bills selected and a non-zero count of the present owner's — a
proof containing only the absent owner's bills goes green because nothing sends
at all, which is indistinguishable from an engine that has stopped working.

**THE MIGRATION HAS TO BE UNABLE TO FAIL, NOT REPAIRABLE AFTER FAILING.**
Measured at `16a1938`: adding columns to a table that already holds rows works,
and the values survive field by field, not merely in count. But the same
measurement showed `initConnection` runs its statements one at a time with no
enclosing transaction, and a deliberate mid-way failure left a half-migrated
database on disk that the next launch resumes from wherever it stopped. HOW WOULD
WE LEARN THAT THIS HAPPENED ON THE SHOP'S PHONE? WE WOULD NOT. The only signal
would be someone saying the app will not open; which statement stopped it, which
columns went in, which rows were backfilled — none of that is observable, for the
reason recorded in `ARCHITECTURE.md § 11`. The worse case is quieter still: a
statement that succeeds with a wrong result and an app that opens normally. So
the requirement is a migration that cannot stop half-done — one transaction
around the whole set, or, if the driver cannot give that, proof that every
statement is idempotent and order-independent rather than an assumption that they
are, plus a proof that kills the process mid-migration and reopens, and gets
either a correct database or a refusal, never a half one.

**ROWS THAT PREDATE OWNERSHIP GET `null`, WHICH MEANS UNKNOWN AND PARKS.** How
many such rows exist on the shop's handset is unknown and will stay unknown —
`ARCHITECTURE.md § 11`. So the migration must be correct for zero of them and for
many. They are not attributed to the current session: a guess would manufacture
false provenance that reads exactly like true provenance, which is the silent
failure this design exists to prevent. `null` is treated as an owner mismatch and
parks. If the shop's phone does hold queued bills at upgrade, they stop sending,
and that is the correct outcome, because nobody knows whose they are.

**THE UPGRADE GAP IS DECIDED — 2026-08-11, by the owner. DO NOTHING, PLUS A
DISTINCT COUNT.** Nothing above is struck, because nothing above said this was
open: the alternatives were argued in a phase report and never written into this
file, which is the failure this paragraph exists to stop repeating. The gap is
real — a dead token is deliberately kept in the keystore, so after an upgrade the
app boots looking signed in while no identity has ever been stored, and a bill
weighed that morning takes `null` and parks with no connection to sign in over.

**WHY REFUSING TO WEIGH WAS REJECTED, AND IT IS NOT THAT A LOUD STOP IS WORSE
THAN A SILENT PARK.** It is that a control the person at the scale can route
around is not a control. Blocked from weighing, they will write the load on
paper or reinstall the app, and both lose more than parking does — the paper
bill never reaches the system at all, and the reinstall takes the queued bills
with it. Backfilling the identity from the kept token was rejected separately:
it makes the client interpret claims the server signed and it cannot verify, on
the one field where being wrong is invisible, and the token may be expired or
revoked. Parking leaves DELAY, which is visible and recoverable; every
alternative leaves MISATTRIBUTION or LOSS, which are neither.

**THE PARKED COUNT MUST BE SEPARATE FROM THE OWNER-MISMATCH COUNT, and that is
the half of this decision most likely to be dropped as a detail.** One waits for
a connection and the other waits for a person. A combined total makes the
operator wait for the wrong thing: they see a number that looks like an outage,
stand still expecting it to clear, and it never will, because what it is waiting
for is somebody signing in.

**WAITING HAS TO BE VISIBLE.** A bill that waits silently and unrecorded is a
bill that disappears without anyone noticing. The status strip — already in front
of the operator all day — shows how many bills are parked for another account and
the age of the oldest. Not whose, and not their contents. Not a dialog: a dialog
becomes a reflex to dismiss within two days. It must be a number that sits there
and vanishes on its own when the owner returns. It must be counted SEPARATELY
from the ordinary unsent count, because a single total reads as a poor
connection, and the operator will wait for it to clear, and it never will.

**WHAT THE LOGIN SCREEN OWES THE PERSON AT THE SCALE.** Four things. It must
distinguish a wrong password from an unreachable server — at five in the morning
with a truck waiting, that is the difference between typing again and going to
look at the router. It must appear whenever there is no USABLE session, not when
a token is `null`, since `null` is precisely false while a token sits expired. It
must let a morning with no connection through, which forces the identity used for
ownership to be read from stored session state rather than from a live token — a
bill written while the token is dead must still know whose it is, or it inherits
`null` and parks, which is the exact opposite of what is wanted. And when the
identity signing in differs from the one before it on this device, it must say so
THERE, with the count of bills parked for another account, before the first truck
is weighed — and, if the tenant differs, that the previous shop's prices have
been dropped and must be fetched, which needs a connection; a shop change with no
connection must prevent weighing rather than permit it at yesterday's prices.

**WHAT THIS DESIGN KNOWS IT HAS NOT ANSWERED.** A bill nobody ever returns to
send. This is now certain rather than possible: keying ownership to a user means
an employee who leaves with unsent bills leaves them unsent for good. The way out
must be a deliberate one rather than one that happens by accident, and it does
not exist yet.

**THE ORDER, AND WHY.** (1) Confirm from disk the three items still only
reported: that `signIn` discards a 401, that the button renders on
`token === null`, and that a dead token is deliberately left in the keystore.
(2) Correct the outstanding-items record for the void class — see
`OPEN_ITEMS.md § Code debt found and left in place`. (3) Schema and migration,
with the kill-mid-migration proof. (4) The owner filter, send queue and void
queue, with separate acceptance evidence for each. (5) The cache bound to
tenant. (6) The login screen and the stored identity. (7) The status strip.
Steps 1 and 2 need no further decision and can start immediately; every step
after them depends on 1 turning three reports into facts.

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

**THE STEP IS SPLIT — 2026-08-17. P1.8a IS ONLINE, P1.8b IS OFFLINE.** The DONE
WHEN above is UNTOUCHED and says nothing about offline; **P1.8a closes it as
written**. Sub-lettering is this file's own existing convention — R1b and R2b
are already in the closed R log — so this mints **no new P-number** and
`ROADMAP.md § Numbering` is not touched.

**P1.8a — ONLINE SELLER CREATION.** Four phases, each with its own evidence:
the server route (landed `2f88403`), the client wire (landed `826e4ee`), the
screen, the handset.

**P1.8a's DONE WHEN IS MET — 2026-08-17. THE CRITERION IS NOT REWRITTEN.** It
was met AS WRITTEN, which is the ordinary case and the one this file rarely
gets to record. Clause by clause, each closed by an observation and not by an
argument, every figure re-derived from Postgres or from git in the closing
pass rather than copied from the phase report that produced it:

- *a **staff** (not admin) session creates a seller from the handset* — the
  running server's own log carries `POST /auth/login` 200 followed by
  `POST /sellers` **201 Created**, from the handset at `192.168.1.6`. Seller
  `S006` / `somkid`, id `e06c6280-a4fa-4e74-abd2-4d64b588367a`, is in
  `recycle` with `grade` NULL at creation and the code SERVER-ASSIGNED: the
  code box was left blank, so the client had nothing to send and the
  generate-then-retry assigner minted it from the previous maximum `S005`.
- *a bill for that seller posts and comes back with a doc_no* — bill
  `54b8b684-7119-436c-b3be-99d051e2a86d` carries `B-2569-382`, and the
  `doc_no_counters` row for be_year 2569 moved **381 → 382**. The counter's
  MOVEMENT is the claim and not the doc_no's existence: it is what says no
  number was burned and none skipped. The bill was refused 424 first, parked
  on the device with no number, and took 382 only on the retry after an admin
  set the grade — which is the mechanism working, not a degradation.
- *a staff token is still refused on a price write in the same pass* — a
  STAFF token was driven at `PUT /products/{product_id}/prices/{grade}` and
  answered **403**, `code=admin_required`, `actual_role=staff`. `AL-CAN`
  grade C read `43.00` out of Postgres before and after, all four tiers
  intact. The same token answered **200** to `GET /products` in the same run,
  which is the control that makes the 403 evidence about the ROLE rather than
  about a dead token, a wrong base URL or an unrouted path.

**THE THIRD CLAUSE WAS DRIVEN IN THE SAME PASS AS THE FIRST TWO, which is what
it demands and what the earlier evidence could not supply.** `2f88403`'s own
proof had already shown that refusal, but a proof run on another day is a
different pass. The clause exists to show that the gate which ADMITTED staff to
`POST /sellers` did not also admit them to pricing, and only one pass crossing
both routes can show that about one running server.

**P1.8b — offline seller creation — is untouched by this closure and remains
outstanding. Its survey below stands exactly as written.**

**P1.8b — OFFLINE SELLER CREATION, AND IT IS A SUBSYSTEM RATHER THAN A
FOLLOW-UP.** Measured 2026-08-17 by a read-only survey. The split is not
arbitrary, and the reason is that every item below is a change to something the
EXISTING send path already depends on:

- **`cached_sellers` has six columns and NO ORIGIN MARKER**, so a locally
  created seller is indistinguishable from one the server sent.
- **`saveSellers` runs an UNCONDITIONAL `DELETE FROM cached_sellers`** before
  inserting, so a local row is DESTROYED by the next successful refresh.
- **The send queue has ONE row type over ONE table**, and voids are COLUMNS on
  that row rather than a second kind of work. A seller is a third thing to
  send, and the queue has no shape for it.
- **`sync_state` carries a CHECK constraint**, which SQLite cannot alter
  without rebuilding the table.
- **EIGHTEEN sites hand-parallel the send and void paths, and only TWO of them
  are compiler-enforced.** A third path inherits that arithmetic.
- **The server REFUSES a client-minted seller id.** `SellerCreate` sets
  `extra="forbid"` and `sellers.id` defaults to `gen_random_uuid()`, where
  `purchase_bills.id` has NO default. The offline boundary was drawn at the
  BILL deliberately (hard rule 3), so moving it is a server change and not a
  client one.
- **`sellers` has no idempotency key**, so a re-sent create is recognisable
  only by a code collision — and a 409 on the send path classifies as
  retry-forever, which would dam the queue behind a seller that already exists.

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
`public`. Its migration is committed and was **APPLIED TO THE LIVE DATABASE
`recycle` ON 2026-08-09**, where this read "NOT YET APPLIED to any cluster" until
then — so the relation this step reads FROM now exists on the database the pilot
will run on. That settles what this step reads FROM; it does not by itself
complete the step, and the DONE WHEN below is unchanged for that reason. The
schema half of P1.3 being done changes nothing about P1.3's own DONE WHEN either.
That clause read "which is a login rather than a migration" until 2026-08-10;
P1.3's DONE WHEN was rewritten on that date and is now two criteria, for the
reason recorded at P1.3. Nothing about THIS step's DONE WHEN changes.

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

**WHAT D6 SETTLES FOR THIS STEP — added 2026-08-10, and it changes nothing
below.** Account provisioning is decided as THREE endpoints
(`ARCHITECTURE.md § 10. The three settled decisions` D6), so this screen calls
routes whose shape it no longer has to invent. Note that **"changes a password" in
the DONE WHEN is TWO of those routes** — an admin setting somebody else's, and a
person setting their own — and that wording is left exactly as it stands: it is a
bar about what an admin is observed to do from a screen, and the admin path meets
it. D8 also removes work this step might otherwise have assumed it owed: there is
no first-use force-change screen to draw, **by decision rather than by omission.**

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
  **Cleared 2026-08-16:** the correction predates this restructure —
  `CLAUDE.md` already carried the corrected figures at `742ff65`, the false
  ones surviving only quoted as refuted history, and they were re-measured
  this day against the objects: CR=0 in every one of the 50 blobs that have
  ever held the path. The history block itself now lives at
  `EVIDENCE.md § core.autocrlf: the measured table and its history`.
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
