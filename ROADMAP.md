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

**SEVEN MORE, FROM A SECOND WORKING SESSION — 2026-08-17.** The sentence at the
head of this section is about the FIRST session and is left exactly as written.
S7 SUPERSEDES S2; the other six are new and reopen nothing. As with S1-S6, each
carries the owner's reasoning so it is not re-argued.

**S7 — the pilot starts only after ALL THREE deliverables exist: the mobile app,
the desktop application and the provider web application. THIS SUPERSEDES S2,
2026-08-17.** S2 says a pilot is part of the path and that the bar before a pilot
is a different and SMALLER one than the bar before the product is sold to a
stranger. The owner has decided the smaller bar is not taken: nothing goes in
front of a shop until all three programs exist, which is S1's handover arriving
before the pilot rather than after it. **S2 is superseded and NOT deleted** — it
was the decision until this date, and the three-stage shape of this file was
built on it.

**THE CONSEQUENCE, and it is stated here rather than left for a reader to
notice: STAGE 1 AND STAGE 3 MERGE IN EFFECT.** Stage 1 is defined as what a pilot
shop needs to trade a normal day and stage 3 as what selling to a stranger needs.
If the pilot cannot begin until the stranger's deliverables exist, those are ONE
bar and not two. **Nothing is renumbered and no step is moved.** Every step keeps
its number, its dependencies and its DONE WHEN; renumbering orphans every
reference to it, which is the argument that closed the A-, R- and D-numbers
rather than tidying them. What changes is the CLOCK: no step in stage 3 can any
longer be read as "after the pilot", and stage 2's steps still depend on a pilot
that now starts later.

**AND THE OWNER'S OWN TEST IS NOT P2.1.** He will test with his father himself.
P2.1's criterion is a shop buying real loads on CONSECUTIVE TRADING DAYS, with
nobody running a request by hand and printed slips handed over. A test the owner
runs himself does not meet that by being run, however much it teaches — and the
consecutive days are the clause it cannot meet at all. P2.1 stays open until its
own criterion is met, and this decision does not lower it.

**S8 — the order is mobile, then desktop, then the provider web, and it is
SEQUENTIAL.** Not a statement about where attention goes; a statement that each
waits on the one before it. **The reason is measured rather than preferred.**
P1.12 restructures the one program that currently works, and Metro has already
broken once on a nested package
(`lessons/README.md § Lessons` "metro-file-map-nesting.md"). Starting the desktop
before the mobile app is finished pays that restructuring risk while the only
working program is still moving; starting the provider web before the desktop
creates P1.12's package for a consumer that does not exist yet, and P3.5's own
DEPENDS ON already says the only shared logic it needs is the Buddhist-era date
rendering that package carries. This promotes P1.12's internal ordering argument
to a decision about the whole programme.

**S9 — THREE roles: owner, admin, staff.** The OWNER is whoever activates the
licence key. They do everything an admin does, for their OWN shop and no other,
and **the account is TRANSFERABLE**: a shop changes hands and the licence goes
with the shop rather than with the person who first paid for it.

**TWO ENTRY PATHS, ONE STATE — record that, or a shop will one day have an owner
and no licence and nobody will know why.** In the interim
`server/scripts/provision_shop.py` may create an owner; once the provider web
application exists (P3.5), activating a key creates one. Two paths reaching the
SAME state is fine. Two paths that can reach DIFFERENT states is the defect, so
whatever P3.1 settles as licence state has to be written by both paths or by
neither — and P3.1 is where that belongs, not here.

**WHAT IS TRUE TODAY, so the size of this change is not underestimated.** There
are TWO roles and not three: migration 0001 creates
`role text NOT NULL CHECK (role IN ('admin', 'staff'))`
(`0001_initial_schema.py:100`), and the provisioning script creates an `admin` —
the "owner role" in step 1 of *The four steps to one paying shop* above is the
DATABASE role `recycle_owner` it connects as, not a user role — that script's own
header calls it "a role the API never connects as". The two strings have FOUR
spellings across the tree and only TWO of them are bound by a MECHANISM
(`server/app/users.py:351` raises at import when `auth.py`'s pair and the route
module's `Literal` diverge); the migration's CHECK is bound by a comment, and the
fourth spelling is on the phone with nothing holding it. That is a review finding
rather than part of this decision, and it is recorded at
`OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "ADDING AN OWNER ROLE SILENTLY DEGRADES THE MOBILE CLIENT".

**S10 — no new mobile screens until a UX/UI rework, which the owner has said
comes after the internals.** Schema, API and local storage land now; screens land
in the rework. A screen drawn now is drawn twice, and the second drawing is not a
restyle once the state behind it has moved.

**THE ONE EXCEPTION IS A DEFECT THAT MAKES SOMETHING UNUSABLE.** That is an
exception about repair, not about scope — the add-seller control that did nothing
on its first press is the shape of it.

**WHAT THIS RULE DOES NOT SAY, and the difference decides whether a step is
blocked:** it does not defer the WORK a screen will need. A grade default, a
per-tenant settings home, photo columns and `sellers.created_by` are all
internals and all land now. What waits is the drawing.

**S11 — every capability SHIPS, and each shop configures it.** The provider is
not in the loop for a shop's own choices, and the product must not slow a shop's
workflow in order to ask. **This EXTENDS S6 rather than repeating it.** S6 is
about the cases where a shop could reasonably work either way; S11 says the same
of choices that are not either/or, and adds the claim S6 did not have to make — a
capability every shop can turn on is a capability with a PER-TENANT VALUE behind
it, so this is a statement about storage before it is one about features.

**LEGAL COMPLIANCE IS THE SHOP'S DECISION; OURS IS TO MAKE IT POSSIBLE.** The
system must be ABLE to record what a statute requires. Whether a given shop
records it is that shop's call and that shop's liability. This is what keeps
unverified legal material out of the schema as a REQUIREMENT while still
requiring the column to exist — the four limits on the round that raised most of
it are at
`OPEN_ITEMS.md § Schema requirements raised by the 2026-08-17 legal research round`
and are not restated here.

**S12 — photographs are part of the workflow, not an optional practice.** Two
photographs, with different subjects and taken at different moments:

- **ONE PHOTO PER BILL, showing the goods AND the weight display IN ONE FRAME.**
  One frame is the requirement rather than a convenience: two pictures prove a
  weight and some goods and nothing ties the two together.
- **ONE FACE PHOTO PER SELLER**, taken when the seller is created.

The desktop staff then rechecks the bill against the photo and PRINTS.

**THAT IS S3 UNCHANGED, and it is said explicitly because a reader meeting "the
desktop rechecks and prints" could conclude the desktop now ISSUES the bill.** It
does not. The phone creates the bill and the server assigns the doc_no, exactly
as S3 has it; what the desktop gains is a check before the paper.

**NOTHING ALREADY BUILT IS INVALIDATED BY THIS.** No existing column changes
meaning, no hard rule moves, and no proof that passes today would have to be
rewritten to pass tomorrow: hard rule 3's client-minted uuid and server-assigned
doc_no are untouched, and hard rule 8's write-locally-first is untouched. What
this ADDS is storage for binary payloads and a path to send them, and the cost of
that is a review finding rather than a part of this decision — see
`OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "SIX REVIEW FINDINGS".

**EXTENDED 2026-08-18 BY THE OWNER — A THIRD PHOTOGRAPH: ONE PER STAFF MEMBER.
The two bullets above are UNCHANGED and this is an addition to them, not a
correction of them.** The third has its own subject and its own moment: **ONE
FACE PHOTO PER STAFF MEMBER**, belonging to the person's account rather than to a
bill or a seller.

**THE OWNER'S REASON, recorded so it is not re-argued.** `created_by` on a bill
and on a seller is a **uuid**, and an owner who is not standing in the yard cannot
read one. A shop owner looking at who bought a load needs a face, not an
identifier — so the third photograph is what makes authorship legible to the
person who is not there, and it serves the shop owner's dashboard settled on the
same day and recorded in this file's own audit.

**THIS IS NEW ON 2026-08-18 AND WAS AGREED NOWHERE BEFORE IT.** It is written as
new rather than as a clarification, because it is not one: S12 as settled on
2026-08-17 named two photographs and this is a third. Anyone reading the two
bullets above and concluding the set was closed was reading them correctly.

**IT GAINS NO OWNER, AND IT WIDENS THE ONE THAT IS MISSING.** S12 has no step, as
the audit under *Every settled decision, and the step that owns it* below records,
and this changes none of it. *(Named and not cited: a `file § Section` citation
into THIS file quotes its own target and the checker counts two hits — the same
rule the `GET /users` subsection states, measured again here when the citation
took that handle from one hit to two.)* What it changes is the SIZE of the step
that does not exist yet: a photograph attached to an ACCOUNT is taken where an
account is created, and **no client can create an account** — `POST /users` is
declared on the server and called by no client at all. So the third photograph
couples S12 to **P3.7**, which owns that screen, in a way the first two do not.

**S13 — hosting is the owner's own machine plus a domain and a tunnel, deferring
a rented server.** Managed database services are DISQUALIFIED BY MEASUREMENT and
not by price. The measurement is the host checklist's own A-questions, which end
an evaluation on any single "no" — role creation
(`ARCHITECTURE.md § 14.8 The checklist` "Can we create our own database roles"),
a superuser or a role FORCE RLS does not bind
(`ARCHITECTURE.md § 14.8 The checklist` "Can we obtain a superuser connection"),
and shell access with the credentials
(`ARCHITECTURE.md § 14.8 The checklist` "Do we get shell access on the machine")
— under the conclusion at
`ARCHITECTURE.md § 14.1 The conclusion` "THIS SYSTEM NEEDS A MACHINE THE PROJECT CONTROLS".
**Those three are A1, A2 and A5, and they live in § 14.8 rather than in § 14.1**,
which is the conclusion they support; a brief citing § 14.1 for them is pointing
one section too high. **No host or product is named here**, per that section's
own rule, and the choice remains the owner's.

**THE DOMAIN IS THE PART WORTH BUYING EARLY, and that is measured too.**
`ARCHITECTURE.md § 14.7 What the client requires` "One string, one reader"
records that `apiBaseUrl` is baked into the BUILD, so moving the API costs a
rebuild and a redistribution to every handset rather than a setting on a device.
A NAME outlives a machine; an address does not.

**WHAT THIS DECISION DOES NOT SETTLE.** P1.2's DONE WHEN is untouched and still
wants the PHONE getting a 200 from an `https://` URL that is not a LAN address,
AND a scheduled dump fetched off-box and restored. A tunnel is a route, not a
certificate and not a backup; and D10's constraint — whatever is chosen must
survive migration, backup and restore without being emptied — applies to a
machine the owner already owns exactly as it applies to a rented one.

**SIX MORE (2026-08-17), TAKEN AGAINST THE SIX REVIEW FINDINGS RATHER THAN
BEFORE THEM.** S7-S13 were settled first and then attacked; these six are the
owner's answers to that attack, recorded with the reasoning so they are not
re-argued. The findings themselves stay where they are and are closed in place,
at `OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "SIX REVIEW FINDINGS".

**S14 — THE DEVICE OUTBOX BECOMES ONE MECHANISM CARRYING SEVERAL KINDS OF WORK.**
Finding (a) is accepted, and it lands on the side that REVERSES a cut rather
than the side that bounds a feature.

**The cost that cut P1.8b was misidentified.** It was read as "the queue would
need a second ROW TYPE"; what it actually is, is a second HAND-WRITTEN PATH.
The queue already carries a second kind of work — the void — and the columns
were the cheap half of doing it. Re-derived 2026-08-17 against the artefacts,
each count with the command that produced it: **nine void columns** on
`local_bills` in `mobile/src/adapters/sqlite/schema.ts` (`void_reason`,
`void_requested_at`, `void_requested_by_tenant_id`, `void_requested_by_user_id`,
`voided_at`, `void_attempts`, `void_last_error`, `void_refused_at`,
`void_refused_code`, counted in the CREATE TABLE and matched by nine entries in
the same file's migration list); a second index `ix_local_bills_void_owed` at
`:313`; a second outcome union `VoidOutcome` at `mobile/src/sync/types.ts:334`;
a second `Transport` method `voidBill` at `:400`; and **six void-only methods on
`LocalStore`** — `requestVoid`, `listVoidsToApply`, `markVoidApplied`,
`markVoidAttemptFailed`, `markVoidRefused`, `clearVoidRefusals`.

**A photo path built the same way is a THIRD parallel; P1.8b would be a FOURTH.**
Generalising once makes bill send, bill void, bill photo, seller photo and
offline seller creation instances of ONE mechanism, and the eighteen
hand-parallel sites stop growing by one per kind.

**CONSEQUENCE: P1.8b's CUT IS REVERSED.** Its seven-item survey stands UNCHANGED
and becomes the SPEC of the generalisation rather than the argument against it.
The reversal is written at P1.8 as well as here, because that is where a session
reads what the step is.

**AND ONE OPTION WAS NEVER AVAILABLE, which is why this was not a free choice.**
Hard rule 8 says write locally first, always. A photograph taken at the
weighbridge is a record, so "photographs upload online only" cannot coexist with
S12's one-photo-per-bill. A later reader will propose it; this sentence exists to
answer them.

**S15 — PHOTOGRAPHS LIVE BESIDE THE DATABASE, NOT IN IT.** Finding (b) is
accepted on its own counter-argument rather than on its arithmetic. A lost bill
is cash with no record; a lost photograph leaves a bill that still says what was
bought, from whom, at what price, by whom and when. **The photograph
CORROBORATES the record and is not the record**, so the two do not need the same
durability — and that is a statement about what the data IS, which does not rot
when the size estimate does.

This also keeps P1.2's DONE WHEN performable: a scheduled dump fetched off-box
and restored with the row counts read back stays a thing a person will actually
do.

**WHAT S15 DOES NOT SETTLE, and it is most of the engineering:** retention,
resolution, compression, and where "beside" physically is. **The size arithmetic
in finding (b) was never measured and must not be carried forward as a fact** —
that entry labels it the advising session's own figure, and it stays labelled.

**S16 — THE EIGHT PER-TENANT VALUES ARE STORED BY KIND, NOT IN A SETTINGS
STORE.** Finding (c) is accepted. Scalars become columns carrying their own
CHECK constraints; the grade model is a per-tenant TABLE replacing a CHECK
constraint; lump-sum is a change to the bill LINE; shop identity is master data
on `tenants`.

**NO JSON BAG.** It would be the first value in this schema with no constraint on
it, in a system whose whole discipline is that a wrong value must be
unrepresentable. The four named CHECK constraints finding (c) cites are the
evidence, and they are to be re-derived from the migrations rather than copied.

**S17 — SCHEMA CHANGES ARE PULLED BY THE FEATURE THAT NEEDS THEM, NEVER PUSHED
AS A SET.** Finding (d) is accepted. D10's real deadline is BEFORE THE FIRST REAL
ROW, and S7 moved that outward rather than inward, so "all six before the
desktop" was a deadline this project set itself.

**Two of the six already have a feature pulling them:** `sellers.created_by`,
because P1.8a made seller creation reachable from the yard and nothing records
who did it; and the per-tenant grade default, which blocks a whole shop shape
today. **The other four do not, and they wait.** Per-feature pull is also what
keeps the UNVERIFIED local-ordinance material out of a migration — that round's
own four limits are recorded at
`OPEN_ITEMS.md § Schema requirements raised by the 2026-08-17 legal research round`
and are not restated here.

**S18 — WHEN THE OWNER ROLE LANDS, THE MOBILE CLIENT LEARNS IT IN THE SAME
CHANGE. THE FAIL-OPEN IS KEPT.** Finding (e) is accepted as to the defect and
REJECTED as to the remedy it might suggest.

Today the client's role list holds two values, an unrecognised role parses to
`null`, and the void gate refuses only a definite staff — so an owner would read
as UNKNOWN and be offered the void button. **Every one of those is to be
re-derived from `mobile/src/session/deviceRole.ts` in the pass that implements
S9; the line numbers in finding (e) are a clue and not a source.**

**The fail-open itself is NOT reversed.** That file's own header argues it:
enforcement is on the server, and a real admin whose token merely failed to parse
must not be locked out of the one action that corrects a wrong bill. That
argument survives a third role. **What must not survive it is the COMMENT
asserting there are only two roles, with nothing comparing it to the migration.**

**S19 — P2.4 AND P2.5 STAY OPEN UNTIL A REAL SHOP TRADES. NO SUBSTITUTE IS
INVENTED.** Finding (f) is accepted exactly as it was written — as a statement,
not as an argument to reinstate the pilot. S7 pushed P2.1 out past all three
deliverables and those two steps depended on it for their only evidence.
Inventing a staging substitute would produce evidence about staging, which is
the one thing both steps already say cannot work. **This is recorded at both
steps and not only here**, so a later session reading either does not treat it as
schedulable.

---

## Every settled decision, and the step that owns it

**What this is, and what it is NOT.** A sweep of S1 to S19 asking one question of
each: which step in this file builds it. **It is EVIDENCE, not a decision.** No
P-number is minted here, nothing is renumbered, no decision is reopened and no
S-number is superseded. The owner decides how many steps to open from the table;
this section only puts the question in front of him with the measurements
attached.

**WHY IT EXISTS.** Five decisions were sampled by hand and four had no step
owning them. That is a class rather than a dropped item:
**a decision with no step is a commitment nothing schedules**, and the two found
first — S10's UX rework and S12's photographs — are each cited elsewhere in this
file as the reason something else cannot proceed, while being defined nowhere in
it.

**THE RANGE WAS RE-DERIVED AND NOT ASSUMED.** `grep -nE '^\*\*S[0-9]+ —' ROADMAP.md`
returns **19** definition lines, S1 through S19 with no gap. A repo-wide
`grep -rnoE '\bS(2[0-9]|[3-9][0-9])\b' --include='*.md'` exits **1**: no S-number
above 19 exists in any tracked markdown, so the range is closed at the top.
Nineteen decisions swept, nineteen cells established by grep — **the two numbers
are equal, and no cell was filled from knowledge of the file.**

**HOW A CELL WAS ESTABLISHED, because the method decides what the table is worth.**
Two searches per decision. A LABEL search — `grep -nE '\bS<n>\b' ROADMAP.md` — and
where that returned only the decisions section, a SUBJECT search over the words the
step would have to use. A hit only counts as an owner if it falls inside a
`### P…` step section; a hit inside the decisions section, inside a D-number or
inside *Findings* is the decision talking about itself and establishes NOTHING.

**THE LINE NUMBERS IN THE TABLE ARE INTO THIS FILE, MEASURED 2026-08-18, AND THEY
WILL DRIFT.** They are given the way this file gives line numbers into code — as a
thing to re-derive rather than to trust — and every one of them is reproducible
from the command in the row beside it. **No sha is quoted**, deliberately: the work
carrying this table was uncommitted when it was written, so the only sha available
is the one that does not contain it.

| # | the decision, in short | owned by — and the command that established it | if none: new step, or extend which | if new: what blocks it |
|---|---|---|---|---|
| S1 | scope is three deliverables, shipped as one handover | **DISTRIBUTED, and the no-SQL bar is P3.6.** `grep -nE '\bS1\b'` → L2991 inside P3.6. The three deliverables are stage 1's mobile steps, P1.13–P1.17, and P3.5 | — | — |
| S2 | a pilot is part of the path | **SUPERSEDED BY S7**, so no step is owed. `grep -nE '\bS2\b'` → L205, L206, L210, every one inside S7's own text | none needed | — |
| S3 | the slip prints from the desktop, after sync | **P1.13 and P1.17.** `grep -nE '\bS3\b'` → L1580 (P1.13), L1686 and L1689 (P1.17). *L1492 is a DIFFERENT S3* — a reconcile injection cell, not this decision | — | — |
| S4 | the provider web shows status, licence, last bill — and no shop data | **P3.5.** `grep -nE '\bS4\b'` → L2972, the step's own *What it is* | — | — |
| S5 | staff-owned phones, accounts per person | **P1.4, P1.5 and P3.7; the platform half at P1.11 through D9.** `grep -nE '\bS5\b'` → L864 (P1.4), L1009 (P1.5), L3022 (P3.7), L631 (D9) | — | — |
| S6 | where a shop could work either way, support both | **P1.15, P1.17 and P2.6; P1.8 and P1.9 through D5.** `grep -nE '\bS6\b'` → L1606 and L1609 (P1.15), L1699 (P1.17), L2866 (P2.6), L587 (D5) | — | — |
| S7 | the pilot starts only after all three programs exist | **NONE, and it needs none — it is a CLOCK.** `grep -nE '\bS7\b'` → L2838 (P2.4) and L2859 (P2.5), where both cite it as the reason a step cannot start. Neither builds it, and nothing could. **But P2.1 — the step S7 actually moves — carries no S-number at all**, so the one step whose clock this decision reset does not say so | structural | — |
| S8 | mobile, then desktop, then the provider web — sequentially | **NONE. One mention in the whole file, and it is the definition.** `grep -nE '\bS8\b'` → L232 only. Subject search `grep -niE 'sequential\|mobile, then desktop'` adds nothing inside a step | structural — the order it states is already carried by the steps' own *Depends on* chains (P1.12 before P1.13, P3.5 last). **But no step CITES it**, so an edit to a dependency chain has nothing comparing it to the decision | — |
| S9 | three roles: owner, admin, staff; the owner account transfers | **NONE.** `grep -nE '\bS9\b'` → L245 (definition) and L446 (inside S18). Subject search `grep -niE 'owner role\|three roles\|deviceRole'` → L98, L262, L270, L438–L448, not one of them inside a step | **NEW STEP.** Not an extension of anything: it is a migration against `0001`'s two-value CHECK, a sweep of four spellings of the role pair, and the client change S18 binds into the same commit | **Nothing technical.** The licence half — who mints an owner — is P3.1 and P3.5, and S9 itself sends licence STATE to P3.1; the role model waits on none of that |
| S10 | no new mobile screens until a UX/UI rework | **NONE. The rework is defined nowhere in this file.** `grep -nE '\bS10\b'` → L272 (definition) and L1669, where P1.16 cites it as the reason a shop-settings surface has nowhere to live. Subject search `grep -niE 'UX\|rework\|new mobile screens'` returns those two lines and no third | **NEW STEP** | The internals S10 says come first — P1.18 among them — and the owner's own answer about what the rework covers. **It is a gate with no definition**, which is what makes every screen behind it unschedulable rather than merely unscheduled |
| S11 | every capability ships; each shop configures it | **NONE by label.** `grep -nE '\bS11\b'` → L286 and L289, both inside the decisions. The eight values it implies are queued at `OPEN_ITEMS.md § Blocking one real paying shop` "EIGHT THINGS EACH SHOP CONFIGURES FOR ITSELF" and scheduled nowhere | **EXTEND P1.16** for the operator surface — it took the shop-settings surface as scope on 2026-08-18 (L1665). The STORAGE is S16's, and each value is pulled by its own feature under S17 | For the surface: S10's undefined rework on the phone, and P1.13 on the desktop |
| S12 | photographs are part of the workflow — **three of them since 2026-08-18**, per bill, per seller and per staff member | **NONE. P1.18 UNBLOCKS it and refuses to carry it.** `grep -niE 'photograph\|photo\b\|camera'` → L1755 in P1.18's *Unblocks*, and L1745 in the same step saying it carries the mechanism and not the camera. No `### P…` section builds a photograph | **NEW STEP, and more than one** | P1.18's mechanism, S16's storage answer for *which photographs are required*, the UX rework for a camera screen, and S15's unanswered engineering. **The third photograph adds a fourth blocker the other two do not have**: it is taken where an ACCOUNT is created, and no client can create one, so it couples to P3.7 |
| S13 | hosting is the owner's machine, plus a domain and a tunnel | **P1.2 — established by SUBJECT, because no step names the label.** `grep -niE 'tunnel\|domain\|hosting\|host\b'` → L675, P1.2's own *What it is*: a host, a name, TLS and a scheduler. S13 says at L349–L350 that P1.2's DONE WHEN is untouched by it. **RESIDUAL, and it is a word rather than a gap:** neither "tunnel" nor "domain" occurs anywhere inside P1.2, and that step's title and DONE WHEN are written against "this box" and "off-box" (L871, L921, L923) meaning the DEVELOPMENT box. Once production is the owner's own machine, "off-box" has two candidate referents and nothing in the step says which | — | — |
| S14 | the device outbox becomes one mechanism carrying kinds | **P1.18.** `grep -nE '\bS14\b'` → L1706 and L1707 (P1.18 mints itself after it), L1754, and L1407 where it reverses P1.8b's cut | — | — |
| S15 | photographs live beside the database, not in it | **NONE.** `grep -nE '\bS15\b'` → L396 and L408, both inside the decisions | **Goes with S12's step.** It is a storage answer for a capability that has no step, so it cannot be owned before that one exists | S12's step not existing — and *where beside physically is* is a property of the machine, so P1.2 |
| S16 | the eight per-tenant values are stored by kind | **PARTIAL, and the partial is the finding.** `grep -nE '\bS16\b'` → L413 only. By subject, `grep -niE 'per-tenant\|default_grade\|settings'` → L1665, where P1.16 takes the shop-settings surface as scope — **and does it without naming S16 or S11, and while saying in the same sentence that no step is minted**, so the overlap is by subject and nothing binds the two. **One of the eight is already in the schema and arrived with no step at all** — the shop-wide default grade, at `9ad225e` | **EXTEND P1.16** for shop identity and the surface. **The GRADE MODEL needs its own step**: it replaces a CHECK with a per-tenant table, and `OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "A RAW COUNT INSIDE AN ACCEPTANCE CRITERION ROTS" measures five source sites writing A–D that it opens | For the grade model: nothing technical. For the surface: P1.13 on the desktop, or S10's rework on the phone |
| S17 | schema changes are pulled by the feature that needs them | **NONE, and it needs none.** `grep -nE '\bS17\b'` → L424 only; subject search `grep -niE 'pulled by the feature\|schema change'` finds no step naming it | structural — a policy about how schema work is SCHEDULED, not work | — |
| S18 | the client learns the owner role in the same change | **NONE, and it cannot have one of its own.** `grep -nE '\bS18\b'` → L438 only. It is a CONSTRAINT on S9's step rather than a thing to build | **Rides S9's new step.** Scheduling it separately would be scheduling the defect it exists to prevent | whatever blocks S9 |
| S19 | P2.4 and P2.5 stay open until a real shop trades | **P2.4 and P2.5.** `grep -nE '\bS19\b'` → L2837 (P2.4) and L2857 (P2.5). It is a decision NOT to schedule, and it is written at both steps as well as here | — | — |

**THE TOTALS, so the shape is readable without counting rows.** Eight have a step
— S1 in part, S3, S4, S5, S6, S13, S14, S19. Four need none: S2 is superseded, S7
is a clock, S8 is an ordering rule and S17 is a scheduling policy. **Seven are
outstanding** — S9, S10, S11, S12, S15, S16 in part, and S18 riding S9 — and of
those, three are ANSWERS this file already relies on elsewhere while defining
them nowhere: S10, S12 and S16.

**THE FOUR STRUCTURAL ONES ARE AN ANSWER, NOT A GAP, and the distinction matters
because a sweep that reports nineteen holes teaches nothing.** S7 is a clock: it
says WHEN a bar may be attempted, and no code makes a date arrive. S8 is an
ordering rule, already expressed in the steps' dependency chains. S17 is a policy
about how a schema change gets scheduled, which is a rule for writing steps rather
than a step. S2 was superseded before anything could own it. **S8 carries the one
residual in that group**: nothing cites it, so if a dependency chain is ever
edited, no sentence in this file compares the result to the decision.

**AND ONE THING THE SWEEP FOUND THAT IT WAS NOT LOOKING FOR: the S-space collides,
exactly as `lessons/README.md § Lessons` "S, P, A and R were not checked"
predicted it might.** That lesson bounds itself with "S, P, A and R were not
checked"; S is now checked. `grep -rnoE '\bS(1[0-9]|[1-9])\b' --include='*.md'`
outside this file returns hits in two unrelated spaces — these decisions, and
PROOF CELL names (`proveSignOut` S1 and S9, `proveSheets` S9, `prove_reconcile`'s
S3/T0 and S3/X2, which appear in this file at L1492). **No broken sentence was
found today**: every use is disambiguated by what sits beside it. The exposure is
that nothing enforces that, and a bare S-number written across a file boundary
would read as either. It is recorded here because the audit is where it surfaced.

**THE TWO ANSWERS OF 2026-08-18, and both are new — neither was agreed before.**

**PHOTOGRAPHS ARE IN THE PILOT BAR.** The owner CONFIRMED S12 rather than
reopening it. The reasoning is his and is recorded rather than re-argued: the
pilot tests the product being sold, and photographs are what settle a dispute
about weight and goods — which only real money produces. A pilot that omits them
is a pilot of a different product.

**AND HE THEN EXTENDED IT, the same day, WITH A THIRD PHOTOGRAPH — one per STAFF
MEMBER**, because `created_by` is a uuid and an owner who is not at the yard
cannot read one. That is written at the decision itself and is not restated here;
what belongs in the audit is its effect, which is that S12's missing step grew
without gaining an owner, and that the third photograph is the only one of the
three that needs a surface nobody has built.

**THE PILOT IS FURTHER AWAY THAN EVERY FILE IN THIS REPOSITORY CURRENTLY
IMPLIES.** The photograph chain is four layers deep — P1.18's outbox, S16's
storage answer for which photographs are required, the UX rework, and a camera
screen — and it has to be walked before a shop can trade under S12. **The one
qualification, measured rather than inherited:** exactly ONE of those four is a
step in this file. P1.18 is minted, and it is minted-and-unbuilt — its stage 2
delivered a design and no drain, and its criteria were derived only on 2026-08-18.
The other three are not steps at all. That makes the sentence above stronger, not
weaker, and it is stated here because a brief handed this phase the claim that
none of the four was in the sequence, and that clause does not survive a grep.

**THE SHOP OWNER'S DASHBOARD LIVES ON MOBILE, not on a fourth surface.** The
reasoning is the owner's, recorded and not re-argued. A phone is already
"anywhere". Mobile is one of S1's three programs, so **S1 does not change and no
fourth deliverable is created.** The provider web is REFUSED, and the argument is
S4's own: a tool with no path to a shop's data cannot leak one, and a dashboard
would create exactly that path. An Electron application on a shop's PC is not
"anywhere".

**THE COST THE OWNER ACCEPTED, recorded so it is not discovered later as a
surprise:** the dashboard waits on S10, and therefore on S16 and P1.18, like every
other mobile screen. **Nothing about it is separately schedulable while the rework
is undefined.**

**WHAT THOSE TWO ANSWER IN THE TABLE, said plainly.** S12 gains NO owner — a
confirmation is not a step, and the cell stays NONE. The dashboard is not a
nineteenth decision and gets no row; it becomes a THIRD thing standing behind
S10's undefined rework, beside the camera screen and every other new mobile
screen. **So both answers make S10 the load-bearing gap rather than a tidy-up**,
which is the one conclusion this table can carry on its own.

**THREE FINDINGS WERE HANDED TO THIS PHASE AND EACH WAS RE-DERIVED, NOT CARRIED.
Two held. One did not, and its second half held perfectly, which is why it is
worth the space.**

**1 — THE DASHBOARD DOES NOT NEED THE OWNER ROLE. HOLDS, with a qualification the
finding did not carry.** S9 is about who activates a licence and whose account
transfers; nothing in it is about reading a report. What a dashboard needs is an
ADMIN-gated screen. Re-derived from `mobile/src/session/deviceRole.ts`:
`DeviceRole` is `"admin" | "staff" | null` at `:49`, `ROLES` holds two values at
`:56`, `readTokenRole` parses at `:140`, and there is **exactly one role-gated
predicate in the client** — `mayVoid` at `:172`, reached through `canRequestVoid`
and `voidRoleNote` in `mobile/src/sync/parkedReason.ts`. **So S9 and the dashboard
are separable and this table must not couple them.** Two qualifications, and the
second one answers the question the first raises.

*The gate fails OPEN.* `mayVoid` is `role !== "staff"`, so an unreadable token is
`null` and `mayVoid(null)` is true. `role` reaches exactly ONE component in the
app — `mobile/App.tsx:1916`, into `BillsPanel`. So "the client already gates on
role" is true and is not the same sentence as "the client can hide a screen".

**AND AN ADMIN-ONLY SCREEN ALREADY EXISTS, WHICH THE FINDING DOES NOT MENTION AND
WHICH SETTLES THE SHAPE.** The daily-money screen is admin-only —
`server/app/reports.py:434` is `Depends(require_admin)` — and the client
**deliberately does not gate it at all**. The button at `mobile/App.tsx:1963` is
offered to every account, over fourteen lines of comment arguing why: pressing it
costs one refused GET and one plain sentence, whereas the token's role claim is
ADVISORY and up to an hour stale, so gating on it would lock out an owner promoted
this morning. The refusal is rendered from the server's 403 —
`mobile/src/reports/dailyView.ts:729` and `:740`, through
`forbiddenReason(code, "daily_report")` in `mobile/src/sync/parkedReason.ts:287`.
**So the fail-open direction is not the obstacle it looks like: this project has
already decided how a read-only admin screen is built here, and it is server-side
enforcement with a derived sentence, not a client predicate.** A dashboard would
follow that pattern rather than need a new one.

**2 — THE DASHBOARD'S SERVER HALF IS NOT GATED BY S10. HOLDS, re-derived.**
`grep -rnE '@router\.(get|post|patch|put|delete)' server/app/reports.py` returns
ONE line, `:421`, `@router.get("/reports/daily")`. `grep -rn "GROUP BY" server/app/`
returns one source hit, `reports.py:328`, and it is `GROUP BY b.id`.
`grep -rn "created_by" server/app/` returns twelve source lines across `bills.py`,
`master.py` and `users.py`, and **not one of them is in `reports.py` and not one is
an aggregate**. Nothing in this API groups or filters by who created a bill. **So
the read path is buildable today, with no screen and no rework.**

**TWO NARROWINGS, BOTH MEASURED, AND NEITHER OVERTURNS THE FINDING.** *First:* the
API DOES already resolve a user identity into a report — `reports.py:378` and
`:391` are `LEFT JOIN users u ON u.id = b.voided_by`, returning
`voided_by_username`. The claim survives with the word that matters kept: nothing
aggregates by `created_by`. What is missing is the aggregation, not the join.
*Second:* a daily-money screen ALREADY EXISTS on the phone —
`mobile/app/DailyScreen.tsx`, reached from `mobile/App.tsx` and calling
`/reports/daily` from `mobile/app/api.ts`. **Whether a dashboard is a NEW screen,
and therefore behind S10, or an extension of that one, is the owner's call and
this phase does not take it.** It is recorded because the cost the owner accepted
was stated in terms of new screens.

**AND BUILDING IT EARLY REPRODUCES THE PATTERN `9ad225e` HAS JUST PRODUCED — a
capability finished on the server that no human can reach.** That instance is
recorded at
`PROJECT_STATUS.md § Current phase` "A SHOP-WIDE DEFAULT GRADE IS BUILT, PROVEN, AND UNREACHABLE"
— `PATCH /shop` is admin-only and reachable by
`curl` and by nothing else, `desktop/` holds one 0-byte file, and the phone has no
admin surface. **Both halves are recorded and NEITHER is recommended.** Which one
wins is a question about whether a proven-and-unreachable server capability is an
asset or a liability, and this phase does not answer it.

**3 — STAFF PHOTOGRAPHS NEED THE ACCOUNT-CREATION SURFACE. THE SECOND HALF HOLDS
EXACTLY; THE SUBJECT DOES NOT.** `grep -rniE 'staff (face )?photo|photo.{0,30}staff|employee photo'`
over every tracked markdown exits **1**. **Not found with these words** — which is
not the same as "there is none", and a reader who widens the search and finds a
staff-photograph requirement should correct this paragraph rather than assume it
was thorough. What S12 actually requires is one photo per BILL and one face photo
per SELLER. A seller is created from the phone, and that surface EXISTS: P1.8a's
DONE WHEN was met on 2026-08-17. So the seller face photo is blocked on the
camera, not on a missing surface.

**THE SECOND HALF IS TRUE AND IS ABOUT SOMETHING ELSE.**
`grep -rn "@router" server/app/users.py` returns seven routes including
`POST /users` at `:390`; `grep -rn '"/users' mobile/ desktop/` exits **1**; and
`desktop/` holds one 0-byte file. **No CLIENT reaches `POST /users`**, exactly as
reported. That gap is real, it is a second instance of the
server-capability-with-no-caller shape above, and it belongs to **P3.7**, which
owns the screen — not to S12.

**"BY `CURL` ALONE" IS THE ONE WORD TO TIGHTEN, and it matters because it is the
sentence somebody will act on.** Two in-tree callers reach those routes over HTTP
— `server/scripts/prove_user_create.py` and `server/scripts/prove_revocation.py`,
both `httpx`, both proofs — and one path creates an account without HTTP at all:
`server/scripts/provision_shop.py` INSERTs a shop's FIRST admin directly, and
`server/app/users.py:409` records that it refuses a second run. **What is true is
that no CLIENT reaches them**, which is the claim that carries the consequence.

**WHY THIS ONE IS WORTH RECORDING RATHER THAN SILENTLY CORRECTING.** The finding
has two halves, and only one of them is checkable cheaply. *"Y does not exist"*
resolves in two greps and comes back true; *"X needs Y"* needs somebody to read
what X actually is. A reader who checks the half that can be checked gets a
confident green over a claim about the wrong subject — and the repair here was not
a better instrument but reading S12's own two bullets.

**SUPERSEDED THE SAME DAY, 2026-08-18, AND EVERYTHING ABOVE IS LEFT EXACTLY AS
WRITTEN BECAUSE THE MEASUREMENT WAS RIGHT.** The owner has EXTENDED S12 with a
third photograph, one per STAFF MEMBER, and the extension is written at the
decision. So the requirement now exists — **and it did not exist in any tracked
file at the moment the grep above was run, which is precisely what that grep
measured and reported.**

**THE FRAME WAS WRONG, NOT THE INSTRUMENT, AND THAT IS THE PART WORTH KEEPING.**
The claim arrived among items to VERIFY AGAINST THE TREE, and **a new requirement
cannot be verified against the tree, because the tree is exactly where a new
requirement is not yet.** The grep could only ever come back empty, and its
emptiness was evidence about the repository rather than about the owner's
intention — two different objects, and only one of them has a file. Ask of any
claim handed over for checking whether it is a claim about what IS WRITTEN or a
claim about what SHOULD BE; the first is greppable and the second is not, and no
instrument distinguishes them.

**AND THE TWO HALVES TURN OUT TO HAVE BEEN ABOUT THE SAME THING AFTER ALL.** With
the third photograph settled, a photo attached to an ACCOUNT is taken where an
account is created — so the account-creation surface the second half measured as
absent is the surface the requirement needs, and P3.7 is where it lands. The
paragraph above splits them because on the evidence then available they were
split; they are rejoined here rather than by editing it.

**WHAT THIS SECTION DOES NOT DO.** It mints no P-number, for the UX rework or for
anything else. It reopens no decision and supersedes no S-number. It ranks
nothing, and it does not say how many steps should be opened — the table is the
input to that decision and not the decision. And it ran no build, no proof, no
server and no database: every claim in it is a grep or a read, so **nothing here
carries an exit code except the citation and shared-check runs recorded at
`PROJECT_STATUS.md § Current phase`.**

**AND WHAT WAS DISPATCHED FOR INDEPENDENT CHECKING AND DID NOT COME BACK, said
here rather than left as a silence.** Five read-only verification passes were run
over this table. **Three completed** — the unowned cells, the owned cells, and the
three findings — and every one of them moved something in the text above: the
already-existing admin screen, the `voided_by` narrowing, the `curl` narrowing,
S13's "off-box" residual and S7's silent P2.1 all came from them, and each was
re-measured here before it was written. **Two did not run to completion**, so
their subjects are checked by this session alone: the systematic classification of
every S-label occurrence across the tree, and a completeness critic asking what
this audit missed. **The S-space collision recorded above therefore rests on one
grep run here and on no second reader**, which is exactly the strength this file
asks a negative result to declare.

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

**SUPERSEDED 2026-08-17 BY S14 — THE CUT IS REVERSED, AND THE SEVEN BULLETS
ABOVE ARE UNCHANGED BECAUSE THEY ARE NOW THE SPEC.** Nothing in that survey was
wrong. What was wrong is the conclusion drawn from it: the cost was read as "the
queue would need a second ROW TYPE", and it is a second HAND-WRITTEN PATH. The
queue already carries a second kind of work — the void — and doing it that way
cost nine columns, an index, a second outcome union, a second `Transport` method
and six store methods, every one of them hand-parallel to the send path.

**So the seventh bullet's arithmetic is the argument FOR generalising, not
against it.** A photo path built the same way is a THIRD parallel and P1.8b would
be a FOURTH; the eighteen hand-parallel sites grow by one set per kind for as
long as each kind is written out by hand. Generalising once makes bill send, bill
void, bill photo, seller photo and offline seller creation instances of ONE
mechanism, and each bullet above becomes a requirement that mechanism must meet.

**THIS IS NOT A SCHEDULE.** No P-number is minted here and the generalisation has
no entry yet — what it is, what it depends on, what it unblocks and its DONE WHEN
are a planning step's work, not this record's. Read the reversal as: the reason
P1.8b was cut no longer holds.

**SUPERSEDED THE SAME DAY, 2026-08-17: the planning step ran and the entry
EXISTS.** It is **P1.18 — One outbox, several kinds of work**, and this survey is
named there as its spec. The paragraph above is kept rather than deleted because
it is the record of what the recording phase deliberately did not do, and because
a reader meeting P1.18 should be able to see that the step was written after the
decision rather than alongside it.

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
and every `prove:*` script DECLARED IN `mobile/package.json` THAT DOES NOT REQUIRE A
LIVE API, the set counted at run time — because that suite is the only instrument
that would see this break something. **It sits here, immediately before the desktop, and
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

**DONE WHEN:** `shopTime.ts` is imported from a package outside `mobile/`, both
mobile typecheck programs exit 0 run bare, every `prove:*` script DECLARED IN
`mobile/package.json` THAT DOES NOT REQUIRE A LIVE API exits 0 twice bare, and Metro
still SERVES the app to a handset.

**WHY THE CRITERION NAMES A SET, A SOURCE AND A CONDITION RATHER THAN A NUMBER.**
Both sites above said "all fourteen" until 2026-08-18, and that figure had rotted:
`mobile/package.json` declared TWENTY-EIGHT. A raw count inside an acceptance
criterion rots the same way whatever its value, so no fresh number replaces it — the
count belongs in the run report, never here
(`OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "A RAW COUNT INSIDE AN ACCEPTANCE CRITERION ROTS").

The SECOND defect was not a count at all, and nothing recorded it: "all `prove:*`
exit 0 twice bare" is UNSATISFIABLE on any machine without a running API and a
scratch database, which the old criterion never mentioned. FOUR scripts require a
live API and are outside the set: `prove:login` (`127.0.0.1:8211`), `prove:loginscreen`
(`:8231`), `prove:forbidden` (`:8000`), and `prove:sellercreate`, which takes
`RECYCLE_API_BASE` and `RECYCLE_BINDING_SENTINEL` with no defaults and returns 2 in
its BARE form by design, because it creates sellers through the real path and hard
rule 5 means they cannot be removed. They measure API BEHAVIOUR, which a workspace
change cannot reach. Any step whose risk IS an API must name them back in
explicitly.

**Metro SERVES rather than bundles, deliberately.** `npx expo export` exercises the
file map and is not the same code path as the dev server; a green export is not a
served app.

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

**SUPERSEDED 2026-08-18 — "no endpoint reads it" IS FALSE.** Everything above is
left exactly as written and was true when written. `9ad225e` added `GET /shop` and
`PATCH /shop` (`server/app/master.py:1098` and `:1111`), the first routes in this
API to read or write `tenants`, and gave `POST /bills` a read of the same table for
a shop-wide default grade (`server/app/bills.py:367`).

**THE DONE WHEN HAS ALREADY MOVED, AND NOBODY INTENDED IT. Re-derived clause by
clause 2026-08-18; this entry does NOT declare the step done or not done, which is
the owner's call.** Two clauses:

- **Clause 2 — the mechanical one — IS MET.**
  `git grep -n "FROM tenants" -- server/app/` returned **two** hits and **exit 0**:
  `server/app/bills.py:367` and `server/app/master.py:1089`. The clause asks that it
  "no longer return exit 1", and it does not. **The criterion was satisfied by work
  it was not describing** — the grep was written as a proxy for a slip-header
  endpoint and was met by a grade feature that has nothing to do with a slip. It is
  recorded rather than quietly re-tightened, because a criterion that can be met
  sideways is a fact about the criterion.
- **Clause 1 — the observable one — IS PARTLY MET, and the unmet half is the half
  this step is named for.** `GET /shop` does return the shop's `name`
  (`server/app/master.py:1085` selects `id, name, default_grade`), and a real
  response was observed: `9ad225e` records staff `GET /shop` answering **200**.
  **The BODY of that response is recorded in no tracked file**, so "returns the
  shop's name" is established from the code and from a status line, not from a
  transcript. And "whatever else the slip carries" cannot be satisfied by any
  request today: `tenants` still has no address and no phone, so there is nothing
  else to return.

**SCOPE, WIDENED 2026-08-18: THIS STEP OWNS THE SHOP-SETTINGS SURFACE. Nothing is
scheduled here and no step is minted.** `tenants` now carries a value a shop is
meant to choose for itself, and there is no operator surface anywhere that can set
it — `desktop/` holds one 0-byte file and its scaffold step has not run, and
S10 defers new mobile screens to the UX rework while explicitly NOT deferring the
internals ("What waits is the drawing"). A way to SET a shop setting therefore has
nowhere else to live: this is the step that owns `tenants`.

**AND A QUESTION RECORDED RATHER THAN ANSWERED: should a newly provisioned shop be
GIVEN a default grade at provisioning time?** `server/scripts/provision_shop.py` is
the only non-`curl` path that touches a new shop today and it does not set one —
its tenant INSERT names two columns, `INSERT INTO public.tenants (id, name)` at
`:289`, and the string "grade" does not occur anywhere in that file (measured
2026-08-18, `grep -c -i grade` returned 0). So every shop provisioned today starts
with `default_grade` NULL and therefore with the 424. Whether that is the right
starting state is a product question about what a new shop IS, and this phase does
not answer it.

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

### P1.18 — One outbox, several kinds of work

**What it is.** The device's send queue stops being a bill-shaped pipe with a
void bolted to its side, and becomes ONE mechanism that carries KINDS of work.
S14 settled that it should; this step is the building of it. Minted 2026-08-17
after S14; the number is the next unused one and nothing is renumbered for it.

**WHY THE CUT OF P1.8b WAS WRONG, IN ONE SENTENCE:** the cost was read as a
second ROW TYPE and it is a second HAND-WRITTEN PATH. Doing the void that way
already cost nine columns on `local_bills`, an index, a second outcome union, a
second `Transport` method and six store methods — and every one of those is
paid again, in full, for each new kind.

**THE MEASUREMENT THAT SHOULD DECIDE HOW THIS IS BUILT, and it is the opposite
of what "extract the common loop" assumes.** Read 2026-08-17 in
`mobile/src/sync/engine.ts`: the two existing drains are not duplicates, they
are DELIBERATELY DIFFERENT, and each difference has a device incident behind it.

- The **send** loop enforces STRICT HEAD-OF-LINE order over
  `listPendingOldestFirst`, reads the queue WITHOUT the backoff filter, stops
  the whole pass when the head cannot go, applies per-attempt backoff, and
  refuses to run at all while submission is forbidden. Two bills weighed 73
  seconds apart took doc_nos in the wrong order before that ordering existed.
- The **void** drain (`applyVoids`) has **no backoff, no time gate and no
  ordering at all**, iterates everything owed, and keys its in-flight guard
  `void:${id}` so a void and a send of the same bill do not block each other.
  `void_requested_at` is never cleared, so a void stays owed across restarts and
  days offline, and there is no attempt cap.

**So a single shared policy would be a REGRESSION either way it went** — giving
voids head-of-line blocking, or giving bills the void's no-backoff behaviour.
**The mechanism must express ORDERING and RETRY POLICY PER KIND**, with the
shared part being what a kind IS, how it is enqueued, how its outcome is
classified, and how it is made visible. Anything that unifies the policies has
misread the file.

**AND NOTHING IN THIS SYSTEM CARRIES A BINARY PAYLOAD TODAY.** Searched
2026-08-17 with `git grep -inE "multipart|base64|FormData|blob|Buffer|photo|image/jpeg"`
over `mobile/src`, `mobile/app` and `server/app`: 13 lines, every one of them
JWT base64url decoding, a proof harness's buffer, or the word "photographed" in
prose. No upload path exists on either side. **"Not found with these words" is
not "there is none"** — widen it before relying on the negative — but the photo
kinds are a new capability rather than a variation on an existing one, and this
step should carry the mechanism, not the camera.

**Depends on:** nothing outside `mobile/`. It touches no server route, no
migration and no screen, which is exactly why it can be done before the features
that need it rather than inside one of them. **P1.8b's seven-item survey is its
SPEC** — each bullet there is a requirement this mechanism must meet, and the
one about `sync_state`'s CHECK constraint is the one that decides whether the
local schema can be migrated in place.

**Unblocks:** P1.8b (which S14 returns to the plan), the bill photograph and the
seller face photograph S12 requires, and any later kind — without each one
paying the void's price again.

**A SECOND KIND IN THE QUEUE BREAKS A COMPLETENESS CLAIM THE CODE MAKES ABOUT
ITSELF, AND IT BREAKS IT SILENTLY.** `mobile/src/sync/types.ts` documents
`UnsentBreakdown` as **four counts over `sync_state IN ('pending','syncing')`,
DISJOINT and COMPLETE — every unsent row is in exactly one, and the four sum to
the old undivided total.** That predicate is about ROWS IN A STATE, not about
bills, so a photo upload or a seller create sitting in the same queue is an
unsent row belonging to none of the four — or miscounted into `mine`. And
`mobile/src/session/signOutNotice.ts` renders that number as
`มีบิลรอส่งขึ้นระบบ ${pending} ใบ` — the word is BILLS, on the gate that refuses
sign-out. **So the first non-bill kind makes a screen lie to a worker and a gate
refuse for a reason it cannot name.** Deciding what those counts mean under
several kinds is part of this step, not a follow-up.

**DONE WHEN.** No count is written into these criteria, per
`OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "A RAW COUNT INSIDE AN ACCEPTANCE CRITERION ROTS".

**1 — THE THIRD KIND IS OFFLINE SELLER CREATION, NAMED HERE SO IT CANNOT BE THE
EASIEST ONE AVAILABLE.** A generalisation demonstrated on a kind chosen for
being easy has been demonstrated on nothing
(`lessons/README.md § Lessons` "a-control-must-contain-what-fooled-you.md").
Seller creation is named because P1.8b's survey already establishes what makes
it hard, and every one of those must hold through the mechanism rather than
around it: the server REFUSES a client-minted id, `sellers` has NO idempotency
key so a re-send is recognisable only by a code collision, and a 409 means
ALREADY EXISTS rather than retry-forever — which on the bill path would dam the
queue.

**AND WHAT NAMING IT COSTS, STATED RATHER THAN HIDDEN.** The other candidate was
the photograph, and it is hard along a DIFFERENT axis: a multi-megabyte binary
with its own resume semantics, in a system this step measured as carrying no
binary payload anywhere. Seller creation is chosen because it needs no
capability that does not exist, so the mechanism can be built without dragging
the camera in with it — **but a mechanism proven on seller creation has NOT been
shown to carry a large binary.** That residual is real and belongs to whoever
adds the photo kind: the design must be checked against a multi-megabyte payload
and a resumable transfer at DESIGN time, in this step, even though nothing here
proves it at run time.

**2 — A HAND-WRITTEN PATH MUST FAIL TO COMPILE, NOT FAIL A READING.** The
mechanism is the ONLY producer of the value its drain consumes, so a second
path cannot be written without the typechecker refusing it. **This replaces
reading the diff**, which is not an observable: `runOnce` is a function name
rather than a structural property, so moving a per-kind loop into a helper
satisfies a diff-reading criterion while defeating the design, and a single
`send(kind, payload)` switching on `kind` with a hand-written branch per kind
pays the whole original cost in new clothes. The observable is a command with
an exit code: both mobile typecheck programs exit 0 run bare, AND a deliberately
hand-written fourth path, added on purpose, FAILS to compile with its error
recorded.

**3 — THE PROOFS AGREE, AND THEIR OWN DIFF IS REPORTED.** Every `prove:*` script
declared in `mobile/package.json` exits 0 twice in a row with no reseed between,
run bare and with NO FLAGS — `prove:forbidden --offline` exits 2 by design
(`START_HERE.md § 4` "prove:forbidden") and is not a counter-example. Report
THREE numbers and assert the first two are equal: how many the file declares,
how many actually ran, and the per-script exit codes. A run that skipped one and
reported the declared total is the `SOURCES=` defect this repository has already
paid for.
**AND THE PROOFS ARE INSIDE THE BLAST RADIUS**, which is what makes their green
weak here: the files under `mobile/src/proof/` that import `../sync/` or
`../adapters/sqlite/` are edited by the same change they measure, and a proof
adjusted to fit a broken generalisation exits 0 exactly as well. So: report the
proof diff, and **for every assertion that changed, name the behaviour change
that forced it. An assertion that changed where no behaviour changed is a
finding**, not a tidy-up.

**4 — ORDER IS TESTED WITH MORE THAN ONE ROW, ON A DEVICE.** Head-of-line is the
send kind's whole policy and the 73-second incident is this step's own evidence
for it; **one bill is green with ordering removed entirely.** At least two bills
weighed offline in a KNOWN order, then synced, then their `doc_no`s read back
out of Postgres in that same order, with the counter's MOVEMENT reported rather
than the doc_no's existence.

**5 — THE DISCRIMINATING VOID CASE, WHICH IS NOT A VOID ON ITS OWN.** What makes
the void kind different is no backoff, no time gate, no ordering, and an
in-flight guard keyed `void:${id}` so a void and a send of the SAME bill do not
block each other. The case that tests it is therefore ONE BILL that is
simultaneously awaiting send and carrying a void request — driven offline, then
released. Two separate single-row exercises never touch the point where a
unified drain is most likely to fail.

**6 — THE RENDERED NUMBER IS READ, NOT THE STORED ONE.** With a non-bill kind
queued, the sign-out notice and the status strip are READ ON THE HANDSET and
reported verbatim in Thai, and the sign-out gate's decision is exercised. If the
counts still claim completeness over `sync_state`, the claim in
`mobile/src/sync/types.ts` is re-derived and either re-stated or the type is
split — silently leaving a docstring that has become false is the failure this
criterion exists to catch.

**7 — THE QUEUE ALARM SURVIVES THE REWRITE.** `first_server_error_at` and
`server_error_attempts` are POLICY STATE on the send path maintained by the
drain being rewritten. The jam alarm is driven to YELLOW and then to RED after
the change, both states observed on the handset — a mechanism that carries both
kinds correctly can still break the alarm silently, and nothing else here would
notice.

**BEFORE ANY DEVICE READING IS BELIEVED**, state which bundle and which server
process produced it: `npx expo start -c` and a full reload BEFORE the staging
that produces the reading, and the server's start time postdating the commit
under test with a request through the changed path
(`CLAUDE.md § Boot check` "WHICH BUNDLE THE HANDSET IS RUNNING").

**WHAT THIS STEP MUST NOT DO — AND ONE OF THESE HAS A MECHANISM WHILE THE OTHERS
ARE PROSE.** It must not change what the server accepts and must not alter
doc_no assignment. It must not touch the void's identity refusal —
`void_refused_at` and its 403 handling are the outcome of a device incident and
are not part of the shape being generalised. **That last one is unenforceable as
written**, because `void_refused_at` lives inside `applyVoids`, which is the
function being rewritten; the mechanism is that the assertions naming
`void_refused_at` in `proveVoid` and `proveVoidTerminal` appear UNCHANGED in the
diff, which is checkable.

**SUPERSEDED 2026-08-18 — THE SEVEN CRITERIA ABOVE DO NOT DECIDE THIS STEP, AND
THE SEVEN ARE SUPERSEDED, NOT DELETED.** An independent pass read them against
`mobile/` — the criteria and the code, not this file's argument for them — and
reported NINE stop-class findings. The dispatch's stop rule fires on either of
two things: a state that satisfies all seven while the work is broken, or a
demonstration that ANY ONE criterion can be green over a broken implementation.
Both fired. Stage 2 does not begin under these. They stay on the page because
they are the evidence for what replaced them, and a reader has to be able to see
what was tried.

**THE INTERPRETIVE QUESTION, AND IT IS SETTLED FROM THE DISPATCH'S OWN TEXT
RATHER THAN BY A FRESH JUDGEMENT.** Six of the seven carry a justifying sentence
and an observable sentence, and the review judged them against the first — which
the reviewer itself flagged as the one reading that could overturn its own
result. The dispatch's stop table reads *a broken implementation SATISFIES the
criterion → STOP*, and what a broken implementation satisfies is the OBSERVABLE.
So the criterion IS its observable, and the justifying sentence is what says
whether that observable is adequate. Rule (b) exists for exactly that case: an
observable that passes while the property it claims to measure is false. All nine
stand.

**WHY THE REPAIR IS NOT TO PATCH THE SEVEN.** Nearly every finding has one shape
— *the mechanism could be built this way and criterion N would not notice.* That
is a statement about DESIGN FREEDOM, not about wording. Adding clauses to close
nine holes found by one pass closes those nine and leaves the next set, because
**the criteria were written before the design existed**, and criteria for a
mechanism with no shape cannot name the cases that discriminate. Criterion 3 is
the only one of the seven the review could name verified teeth for, and what it
measures is declared-equals-ran, not coverage of the change.

**SO STAGE 2 IS RESTRUCTURED, AND THE ORDER IS THE POINT.** Stage 2 delivers a
DESIGN and no drain. That design is reviewed. The acceptance criteria are then
DERIVED FROM IT. They are deliberately NOT written here: writing them now would
repeat, in the same file, the exact error this supersession records.

#### What any replacement criterion set must catch

One line each. This is a SPECIFICATION the design's criteria must meet — not a queue, and nothing in it is
authorised work. **Every item is a claim RE-DERIVED against the artefact on
2026-08-18 at `e6249f6`**, a commit at which `git status --porcelain` reported no
tracked path modified, so each path:line names the committed blob. Where a
handed-down line number did not hold, the correction is here and the original is
not repeated.

- **A bill weighed offline against a seller created offline.** The server refuses
  a client-minted id, so the local seller's id is never the id the server stores;
  a bill drawn up against it carries an id `POST /bills` cannot resolve, and
  `server/app/bills.py` answers 422, which `mobile/src/adapters/httpTransport.ts`
  classifies `rejected` and the engine marks terminally `failed`. Cash is already
  out of the till. **This is the one composition offline seller creation exists
  for, and no criterion above stages it.**
- **A queued non-bill kind that the sign-out gate and the status strip cannot
  see.** Both read `unsentBreakdown`, which is one statement over `local_bills`;
  the strip then says everything has been sent and the gate permits the sign-out,
  after which the work drains under whoever signs in next — a different tenant
  included, because the server takes the tenant from the caller's token and never
  from the row. Criterion 6 requires the strings be READ and the gate's decision
  EXERCISED, and names no expected value for either.
- **A generalisation whose bypass is not actually refused by the typechecker.**
  `OutboxRegistry` is declared as an interface with three literal keys and not as
  a mapped type over `OutboxKind`, nothing constructs one anywhere under
  `mobile/src`, and `OutboxDisposition` is a structural union any hand-written
  code may produce. The file says so itself in its own header. A criterion whose
  demonstration is "a fourth path fails to compile" must pin WHICH path, or it
  measures registry totality and reports it as bypass-prevention.
- **An assertion-set whose named guard is vacuous.** The MUST NOT below names
  `proveVoid` and `proveVoidTerminal` as the files whose `void_refused_at`
  assertions must appear unchanged. `mobile/src/proof/proveVoid.ts` contains the
  string ZERO times, so half that guard quantifies over an empty set, while
  `proveVoidOwner.ts` carries seven and is not named. A guard that fails by
  finding LESS is this repository's oldest failure shape.
- **The reset half of the poison signal.** `first_server_error_at` and
  `server_error_attempts` are stamped when the server answered and RESET when the
  bounce was transport-level; the reset is the ELSE arm of two CASE expressions in
  `markPendingAgain`, and `dispositionOfSend` drops the `reachable` bit entirely.
  Criterion 7's "yellow then red" drives only the stamp direction — the strip's
  yellow is the offline message and does not read queue health at all — and no
  proof drives a row that accumulated the counters and then bounced offline.
- **A kind whose lost response is not safe to retry.** `sellers` carries no
  idempotency key anywhere in the migration stack, and where the draft supplies
  no code the server MINTS one, so a re-send returns 201 and a SECOND seller row
  rather than a collision. `OutboxDisposition` has four members and none of them
  means *unknown whether the server committed, and NOT safe to retry* — a state
  `mobile/src/master/createSeller.ts` already names as `ambiguous`.
- **Startup recovery for a kind that is not a bill.** `resetSyncingToPending`
  updates `local_bills` alone, and it is the only sweep at boot.
- **Two offline handsets minting the same seller code.** Filed as its own finding
  at `OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "TWO OFFLINE HANDSETS CAN MINT THE SAME SELLER CODE",
  because it is a defect in the design the criteria MANDATE rather than a defect
  in a criterion.
- **Ordering under overlapping passes.** `syncOnce` in `mobile/App.tsx` has no
  re-entrancy guard and is fired on a 4-second interval against a 20-second
  transport timeout, so passes overlap as a matter of course; once a pass has
  claimed the head the row leaves the pending queue and a second pass takes the
  next row and sends it concurrently, and `doc_no` then falls to whichever request
  reaches the counter's row lock first. Criterion 4 stages one drain and cannot
  see it; the only proof with concurrent passes stages one bill.

**AND TWO PROPERTIES OF THE CRITERIA THEMSELVES, WHICH A REPLACEMENT MUST NOT
INHERIT.** Criterion 4's staging leaves every row eligible, so nothing blocks and
head-of-line — the property it exists to test — is never exercised; what is
missing is a row expected NOT to go. Criterion 7 cannot be performed at all with
one bill: `mobile/src/sync/queueHealth.ts` gates both `poisoned` and `alarm`
behind `blocking`, which needs `behind > 0`, and `behind` is `pendingCount - 1`.
Criterion 4 states its minimum and argues for it; criterion 7 states none.

**THE RE-DERIVATION, AND WHAT DID NOT HOLD.** Seven claims were handed to this
phase to check. Five held verbatim. **Two did not, and both are line numbers
rather than facts:** the send loop's in-flight guard is `break` at
`mobile/src/sync/engine.ts:349` and not at `:348`, which is `noteSkip(bill.id);`
— the guard opens at `:347` and the comment calling it "a stop, not a skip" is at
`:346`; and `syncOnce` is fired from the 4-second interval plus FOUR other call
sites, not five. **AND THE FIRST OF THOSE TWO SAT IN THE GROUP THE BRIEF
LABELLED ALREADY VERIFIED, WHICH IS WORSE THAN AN UNLABELLED CLAIM AND NOT
BETTER.** A verification badge is an instruction to the next reader to stop
checking, so a wrong one does not merely fail to help — it withdraws the
attention that would have caught it. Re-derive a labelled claim exactly as hard
as an unlabelled one; the label is evidence about a previous reader, never about
the artefact. One was narrowed: criterion 7's one-bill objection reaches RED
and not yellow, because the strip's yellow comes from the offline branch and not
from `QueueHealth` at all. Everything else — the non-optional `code` field and the
409-settles rule beside it, `QUEUED` carrying no backoff term against
`listPendingOldestFirst`'s "INCLUDING ones still in backoff", the `continue` in
`applyVoids`, the 409 body echoing only the caller's own code while the client
never parses that body, and `proveVoid`'s two engine instances over a per-instance
`inFlight` — held as given.

**WHAT THIS SUPERSESSION DOES NOT CLAIM.** The review read CRITERIA and stage 1's
types; it did not build the drain, run a proof, touch a handset or reach a
server, so nothing in it carries an exit code. Its independence is partial and
stated: it was written by the session that reviewed these criteria the first
time, so it is independent of THIS FILE's reasoning and not of the reviewer's.
Six of the seven criteria exist because of that earlier pass. An empty report
would therefore have established only that a second reader found nothing further.

#### THE OUTBOX DESIGN — and it produces no drain

**WHAT THIS IS.** The mechanism, argued against the artefacts it has to replace,
so that acceptance criteria can be DERIVED from it rather than guessed ahead of
it. That derivation is the whole reason stage 2 was restructured. **Nothing here
is built**, no file under `mobile/src/` moves, and the sketched types at
`ac535c2` are an INPUT to this design and not a thing it extends.

**WHERE ITS FACTS COME FROM.** Every path:line below was re-derived on
2026-08-18 at `b3d3654`, a commit at which `git status --porcelain` reported no
tracked path modified, so each one names the committed blob. Line numbers rot;
where a number and a quoted line disagree, the quoted line is the claim.

**HOW ITS PARTS ARE REFERRED TO.** The criteria are NAMED, never numbered.
`mobile/src/sync/outbox.ts` already cites "the step's criterion 2" and "the
step's criterion 5" in its own header, and those point at the superseded seven —
a second 1-to-7 in this section would make both references resolve two ways,
which is the collision `lessons/README.md § Lessons` "a-label-is-a-reference-with-no-checker.md — applies the moment you APPEND"
records. Re-pointing those two comments belongs to whoever next edits that file.

---

#### The two things the stage-1 types get wrong, measured before anything is designed on them

Both are in `mobile/src/sync/outbox.ts`, both are load-bearing, and neither was
visible to the criteria review, which read the file's declarations and not its
mappings.

**ONE — THE COMPILE-TIME GUARANTEE IS NOT ARMED, AND CANNOT BE ARMED AS
WRITTEN.** The file's header states it as `Record<OutboxKind, OutboxHandler<...>>`
and argues that adding a kind makes every registry literal fail to typecheck.
The declaration is not that. It is an interface with three hand-spelled
properties — `readonly bill_send`, `readonly bill_void`, `readonly seller_create`
— which references `OutboxKind` nowhere, so a fourth member added to that union
moves nothing. **And no literal of it exists.** Searched over `mobile/` for
`OutboxRegistry|OutboxHandler|BILL_SEND_POLICY|BILL_VOID_POLICY|dispositionOfSend|dispositionOfVoid|OutboxKind|OutboxPolicy|LocalOutboxSeller`:
every hit is inside `outbox.ts` itself, and `mobile/src/sync/index.ts` re-exports
`./types.js`, `./engine.js` and `./createBill.js` and not this file. An interface
with no value assigned to it produces no error, so the sentence "the typecheck is
red until stage 3 supplies it" describes a state that does not exist — nothing is
red, and nothing can be, until a literal is written.

**TWO — `dispositionOfSend` CONTRADICTS ITSELF, IN THE ONE MAPPING THE DRAIN
WOULD BE BUILT ON.** Its `rejected_resolvable` arm carries the comment "It is
NOT terminal: the bill becomes valid without anything being re-weighed" and
returns `{ next: "terminal", ... }`. `terminal` is defined thirteen lines above
as "Not done, and no later attempt on this device can differ." The measured
behaviour is the opposite: `SqliteLocalStore.markMasterDataMissing` writes
`SET sync_state = 'pending'`, and every pass calls
`this.store.releaseMasterDataBlocked(this.clock.now(), false)` before the send
loop, so a later attempt differs BY DESIGN and the engine schedules it. The file
describes its two policy constants as "transcriptions of measured behaviour, not
proposals"; this mapping is not one. It also regresses
`lessons/README.md § Lessons` "unavailable-is-not-rejected.md — applies to every sync/retry path",
which is explicit that the split is THREE-WAY and that collapsing a resolvable
refusal into a permanent one strands a load already tipped into the pile.

**WHY BOTH MATTER TO THIS DESIGN AND NOT ONLY TO THAT FILE.** The mapping now
exists twice — once as dead code in `outbox.ts` and once live in `engine.ts`,
whose send classifier is a `switch (outcome.kind)` inside `sendOne` — with
nothing holding the copies together. That is how the disagreement got there
unnoticed, and it is the general form the mechanism has to remove: one producer
per kind, imported and not retyped.

---

#### What a KIND is

A kind is a member of `OutboxKind` with exactly one handler in the registry, and
the registry is a MAPPED TYPE so the set of handlers is total by construction:

    type OutboxKind = "bill_send" | "bill_void";

    interface OutboxRow    { bill_send: LocalBill;   bill_void: LocalBill }
    interface OutboxResult { bill_send: SendOutcome; bill_void: VoidOutcome }

    type OutboxRegistry = {
      readonly [K in OutboxKind]: OutboxHandler<OutboxRow[K], OutboxResult[K]>
    };

Two type parameters, not one. `Row` is the kind's own row so a handler cannot be
handed another kind's; `Outcome` is the kind's own transport union so the drain
never learns what a 409 means. The row map and the result map are separate
interfaces rather than inline conditionals so that adding a kind is three
one-line edits in one file, each of which the compiler demands.

**`seller_create` IS REMOVED FROM `OutboxKind` BY THIS DESIGN, AND THAT IS NOT A
RETREAT.** It is declared at stage 1 with no handler, and the argument given for
declaring it early is that the registry cannot be satisfied without one. That
argument only works once a registry literal exists — and the moment one does, a
kind nobody may build makes the typecheck permanently red. Nobody may build it:
what identifies a locally created seller across devices before the server has
seen it is an OPEN DECISION at
`OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "TWO OFFLINE HANDSETS CAN MINT THE SAME SELLER CODE",
which states in its own text that this design step cannot specify the seller kind
until it is answered. A union member that cannot be given a handler is a
permanent red or a permanent excuse to leave the registry unbuilt, and the second
is what the tree holds today. So the member goes, the reason is recorded here,
and the kind returns in the step that answers the decision.

**WHAT EVERY KIND SUPPLIES.** One member per thing `engine.ts` does today for
exactly one kind, plus the two this design adds and argues for below. **No count is
written in this sentence, and the reason is that the first draft wrote one and it
was wrong** — it said twelve over a printed interface holding thirteen, in a
document that declares a raw count inside an acceptance criterion rots. A count of
an artefact rots; a list the reader can finish counting does not.

    interface OutboxHandler<Row, Outcome> {
      readonly kind: OutboxKind;
      readonly policy: OutboxPolicy;

      /** Rows owed, already in the order `policy` requires, AND already filtered
          to rows this device's current identity may act on. Ordering lives in
          the QUERY: a sort cannot order a row the query did not return, and an
          owner filter applied in the drain is a filter every future kind has to
          remember. */
      owed(limit: number): Promise<Row[]>;
      /** How many the device still OWES. The only input to the visible counts,
          and its predicate is DELIBERATELY WIDER than `owed`'s — see the note
          below, which is the one place these two must not agree. */
      owedCount(): Promise<number>;
      /** Boot sweep for THIS kind: rows stranded in flight go back to owed.
          Returns the ids it swept, so the runner can report a result keyed by
          kind and a missing kind is visible rather than silent. */
      recover(now: Date): Promise<readonly string[]>;

      rowId(row: Row): string;
      attempt(row: Row): number;
      /** The row's own schedule, or null for a kind that carries none. */
      dueAt(row: Row): string | null;

      /** THE DURABLE CLAIM. `claimForSend`'s conditional UPDATE, or a constant
          `true` for a kind that has none. ADDED BY THIS DESIGN because the
          sketch named `claimForSend` as the unchanged durable guard four times
          and gave it no member — so a lost claim had nowhere to be expressed,
          and the only dispositions available to express it (`settled`,
          `terminal`) both take a row out of the queue that was never sent. A
          false answer is not an outcome: nothing is performed, nothing is
          classified, nothing is recorded. */
      claim(row: Row): Promise<boolean>;

      perform(row: Row): Promise<Outcome>;
      /** A throw, converted to THIS kind's own outcome. */
      onThrow(err: unknown): Outcome;
      /** Pure. Drivable headlessly over every member, with no server. */
      classify(o: Outcome): OutboxDisposition;
      /** The next schedule, or null. Covers backoff, the parked cadence, and a
          transfer that made progress and must not be delayed. */
      nextAttemptAt(row: Row, d: OutboxDisposition, attempt: number, now: Date): Date | null;
      /** The only writer for this kind. Takes the OUTCOME as well as the
          disposition — see the poison signal below. */
      record(row: Row, o: Outcome, d: OutboxDisposition, attempt: number, now: Date): Promise<void>;
    }

`recover` is on the handler and not in a boot function because the only sweep
that exists is `resetSyncingToPending`, whose statement is
`UPDATE local_bills ... WHERE sync_state = 'syncing'` — one table, no kind
predicate — and it is called once, from `SyncEngine.recoverInterrupted`, from
`App.tsx`'s boot. A second kind added anywhere else inherits nothing.
`lessons/README.md § Lessons` "sync-state-needs-startup-recovery.md — applies to any"
is the rule; making it a registry member is what makes forgetting it a compile
error rather than a silence.

**`owedCount()` IS NOT `owed().length`, AND MAKING IT ONE IS A REGRESSION THIS
DESIGN NEARLY SHIPPED.** `owed` answers *what may the drain act on right now*;
`owedCount` answers *how much does this device still owe*, and the second set is
strictly larger. For `bill_send` the difference is two whole classes of row.
`claimForSend` moves the head `pending → syncing` and `QUEUED` is
`sync_state = 'pending' AND ...`, so a bill **in flight is outside `owed()`** — and a
count sharing that predicate would drop it for the length of the request, up to
`HttpTransport`'s 20-second timeout, while `mobile/App.tsx` re-reads the screen every
400 ms. With one bill queued the strip would read `ส่งครบแล้ว` throughout every send.
`QUEUED` also carries `master_data_missing_at IS NULL`, so a PARKED bill is outside
`owed()` too, and the gate deliberately counts parked bills today —
`ownUnsentCount` is `mine + mineBlocked`, on the argument written at that state that
the refusal reaches every bill the operator is responsible for. **The rule is that
`owed` is filtered by what can be ATTEMPTED and `owedCount` only by what is
SETTLED**, and today's `unsentBreakdown` already gets this right by counting
`sync_state IN ('pending','syncing')` rather than reusing `QUEUED`. A kind whose two
methods share a predicate is a screen that goes quiet exactly while work is
happening.

**AND THE BOOT SWEEP RETURNS A RESULT KEYED BY KIND, WHICH IS THE ONLY PART OF IT
ANYTHING CAN OBSERVE.** A kind with no durable in-flight state has nothing to
recover — `bill_void`'s guard is the engine's in-memory `inFlight` set and
`markVoidAttemptFailed` writes nothing the queue predicate reads, so a void is owed
after a kill WITH or WITHOUT any sweep at all. Its `recover` is therefore correct as
a no-op, and no assertion about the ROW can tell a correct no-op from a boot that
never called it. What CAN be observed is that the runner iterated the registry: the
boot returns `{ [K in OutboxKind]: readonly string[] }`, and the criterion asserts
its KEY SET EQUALS the member set of `OutboxKind` — equality, because containment
and disjointness ask what is present and only equality asks what is missing, which
is the rule `lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md — applies to every assertion"
records at its thirteenth mechanism. A boot that calls `resetSyncingToPending`
directly produces no such map and cannot satisfy it.

---

#### Ordering, per kind — and `head_of_line` is THREE behaviours, not one

The measured send loop does three separable things. The stage-1 `OutboxOrdering`
names them as one word, and a criterion written against that word cannot break
them apart.

1. **The query returns weighing order, UNFILTERED BY BACKOFF.**
   `listPendingOldestFirst` is `WHERE ${QUEUED} ORDER BY device_created_at, created_at, id`.
   The sender has to SEE the bill it is not allowed to skip; a backoff-filtered
   query hides exactly that bill, which is the 73-second incident.
2. **A row that cannot go STOPS THE PASS for its kind.** Four `break`s in
   `engine.ts`: the empty queue, `attempted.has(bill.id)`, the in-flight guard,
   and `!scheduledInstantIsDue(...)`.
3. **The queue is RE-READ after each unit of work, not iterated as a snapshot.**
   `const queue = await this.store.listPendingOldestFirst(this.batchLimit);`
   sits INSIDE the `for`, and it is load-bearing: a successful send calls
   `clearBackoffForPending`, and re-reading is what lets the bills that call
   frees be picked up in the SAME pass.

The void drain has the opposite of (2) and (3), and **NOT the opposite of (1)**.
`applyVoids` snapshots — `const owed = await this.store.listVoidsToApply(this.batchLimit);`
then iterates it — and `continue`s past a row it cannot take. But
`listVoidsToApply` ends `ORDER BY void_requested_at, id`, so the void queue IS
ordered. "no ordering at all" appears in this step's own text above and in
`outbox.ts`'s header, and it is true of the drain's BEHAVIOUR and false of the
query. The design records the correction rather than repeating the phrase.

So ordering is expressed as policy members plus one query obligation:

    interface OutboxPolicy {
      readonly blocking: "head_blocks" | "independent";
      /** TRUE  -> after every row that advances, discard the batch and re-read.
          FALSE -> iterate ONE batch by cursor. NOT free to combine with
          `blocking`; see the pair rule below. */
      readonly rereadAfterEach: boolean;
      readonly concurrency: "serial_per_kind" | "parallel_rows";
      readonly inFlightKey: (rowId: string) => string;
      /** Can the SERVER recognise a repeat of this kind's request? Read by no
          branch of the drain. It is a declaration the kind makes about its own
          route, and it is what the throw criterion below checks
          `classify(onThrow(x))` against without re-deriving idempotence inside
          a proof. */
      readonly resendIsIdempotent: boolean;
    }

    const BILL_SEND: OutboxPolicy = {
      blocking: "head_blocks", rereadAfterEach: true,
      concurrency: "serial_per_kind", inFlightKey: (id) => id,
      // hard rule 4: every bill create carries an idempotency_key, and a repeat
      // returns the existing bill rather than a second one.
      resendIsIdempotent: true,
    };
    const BILL_VOID: OutboxPolicy = {
      blocking: "independent", rereadAfterEach: false,
      concurrency: "parallel_rows", inFlightKey: (id) => `void:${id}`,
      // a repeat is answered 409, which httpTransport.voidBill maps to
      // `already_voided` and this design settles.
      resendIsIdempotent: true,
    };

and **the order itself stays in the SQL**, which is why `owed` is documented as
returning rows already ordered. The drain cannot check that and must not pretend
to; what the drain owns is what it does with the row it is handed.

**`blocking` AND `rereadAfterEach` ARE NOT INDEPENDENT, AND ONLY TWO OF THE FOUR
PAIRS MEAN ANYTHING.** Written down because this design's first draft printed them
as two free booleans, and one of the two illegal pairs fails by draining SLOWLY
rather than by failing.

- `head_blocks` + re-read — **the send kind.** The re-read is load-bearing and is
  the only reason a bill freed by `clearBackoffForPending` goes in the SAME pass.
  It is safe only here: a row still owed after `record` stops the pass, so no
  re-read can hand the same row back.
- `independent` + snapshot — **the void kind.** `applyVoids` reads once and
  iterates, and a row that stays owed is passed over by the CURSOR rather than by
  leaving the set.
- `independent` + re-read — legal to write, and it drains **one row per pass**: a
  row that stays owed is at the head of every re-read, so the pass ends on the
  per-pass attempted bound instead of on the queue. No error, no red, a throughput
  collapse.
- `head_blocks` + snapshot — the head that must not go sits at the cursor and
  blocks correctly, and the pass can never pick up a row its own success just
  released. It is the send kind with its second half removed.

**ONE DRAIN, NO HAND-WRITTEN LOOP PER KIND.** The policy selects branches inside a
single function, and the function is generic over `Row` and `Outcome` so it can
name no kind. **A CURSOR OVER A BATCH, NEVER `batch[0]`**, and the loop is bounded
three ways:

    // halted, inFlight and lock belong to the RUNNER, not to the pass.
    if (halted.has(h.kind)) return;                   // device-global, ACROSS passes
    if (h.policy.concurrency === "serial_per_kind" && !lock.tryAcquire(h.kind)) return;

    let batch = await h.owed(limit);
    let i = 0;                                        // THE CURSOR
    const attemptedThisPass = new Set<string>();

    for (let guard = 0; guard < limit; guard += 1) {   // BOUND 1: iterations
      const row = batch[i];
      if (row === undefined) break;
      const id = h.rowId(row);
      if (attemptedThisPass.has(id)) break;           // BOUND 2: one try per row per pass

      const due = h.dueAt(row);
      const held = inFlight.has(h.policy.inFlightKey(id));
      const notDue = due !== null && !scheduledInstantIsDue(due, now().getTime());
      if (held || notDue) {
        if (h.policy.blocking === "head_blocks") break;
        i += 1; continue;                             // ADVANCE. A bare `continue` re-takes it.
      }

      // THE DURABLE CLAIM, AND A LOST ONE IS NOT AN OUTCOME: nothing is
      // performed, nothing is classified, nothing is recorded, the row is still
      // owed, and the pass reports the skip.
      if (!(await h.claim(row))) { noteSkip(id); i += 1; continue; }

      attemptedThisPass.add(id);
      inFlight.add(h.policy.inFlightKey(id));
      const attempt = h.attempt(row) + 1;
      try {
        let outcome: Outcome;
        try { outcome = await h.perform(row); } catch (e) { outcome = h.onThrow(e); }
        const d = h.classify(outcome);
        await h.record(row, outcome, d, attempt, now());

        if (d.next === "halt_kind") { halted.add(h.kind); break; }    // BOUND 3
        // THE HEAD BLOCKS WHEN THE ROW IS STILL OWED — never on "not settled".
        if (d.next === "retry" && h.policy.blocking === "head_blocks") break;
      } finally { inFlight.delete(h.policy.inFlightKey(id)); }

      if (h.policy.rereadAfterEach) { batch = await h.owed(limit); i = 0; } else { i += 1; }
    }

**WHY `retry` AND NOT `next !== "settled"`, AND IT IS A TRANSCRIPTION RATHER THAN
A CHOICE.** `engine.ts`'s send loop does NOT stop on a rejected bill, on a parked
one, or on a terminal refusal: `sendOne` returns and the `for` takes its next
iteration. Only a retry-shaped outcome stops it, and it stops it through
`attempted.has(bill.id)` at `engine.ts:345` — the row is still owed, so the re-read
hands it back and the per-pass bound breaks. `next !== "settled"` additionally stops
the pass on `terminal` and on `parked`, so a yard holding several bills the office
has not priced would park ONE per four-second tick instead of all of them in one
pass. The rule that reproduces the file is **is the row still owed after `record`**,
and of the six dispositions exactly one leaves it owed:

| disposition    | the row after `record`                    | under `head_blocks` |
|----------------|-------------------------------------------|---------------------|
| `settled`      | left the queue (`markSynced`)             | advance |
| `terminal`     | left the queue (`markFailed`)             | advance |
| `parked`       | left the SENDABLE queue, blocks nothing   | advance |
| `needs_review` | left the queue into an operator state     | advance |
| `retry`        | STILL OWED                                | **break** |
| `halt_kind`    | still owed, and the KIND stops            | **break, durably** |

**THE THREE BOUNDS ARE NOT REDUNDANT, AND THIS DESIGN'S FIRST DRAFT CARRIED NONE
OF THEM.** It printed `while (true)` and selected `batch[0]` on every iteration, so
`batch[1]` was unreachable and every `continue` re-took the row it had just passed
over. Today's loop header at `engine.ts:311` carries TWO terms —
`guard < this.batchLimit` and `!this.sendForbidden` — and a THIRD bound sits in the
body at `engine.ts:345` under a comment at `:272` saying it is what stops "a bill
that returns to pending" being "retried in a tight spin". All three were dropped.

**AND THE DRAFT DID NOT TERMINATE AT ALL FOR A KIND WHOSE RETRIES STAY OWED.**
`markVoidAttemptFailed` writes `void_attempts` and `void_last_error`, and neither
appears in `listVoidsToApply`'s predicate — `void_requested_at IS NOT NULL AND
voided_at IS NULL AND void_refused_at IS NULL` — so a bounced void is owed again on
the next read and `batch[0]` returns the same row for ever, re-POSTing it inside one
pass. Termination is now a property that can be STATED rather than hoped for: every
path either advances the cursor or breaks, and `guard` bounds the re-read path, so a
pass ends within `limit` iterations under every policy.

**`rereadAfterEach: false` NOW HAS A PATH.** In the draft the read was unconditional
at the top of the loop and the flag appeared only in a trailing comment, so no value
of it changed anything and the loop had no cursor a snapshot could have been
iterated with. It now selects the last line of the body: refresh the batch and reset
the cursor, or advance the cursor within the batch already held.

**`halt_kind` IS DEVICE-GLOBAL AND SURVIVES THE PASS**, which is the whole of what
`sendForbidden` means. `engine.ts:142` holds that flag on the ENGINE — not on a pass
and not on a row — with the argument written at the field: a 403 on `POST /bills`
refuses every bill equally, so it is a fact about the ACCOUNT. Exactly two events
retract it, `resumeAfterSignIn` at `engine.ts:224` and `resetAfterSignOut` at
`engine.ts:248`, and it is deliberately not persisted, so a restart costs one request
and that request is the only way the device can ever discover the role was fixed. A
`halt_kind` that ended one pass would re-ask a settled 403 on every tick — four
seconds, from `mobile/App.tsx:904` — which is the behaviour the flag exists to stop.
So `halted` belongs to the runner, is keyed by kind, and is retracted by those two
events and by nothing else.

`blocking` appears twice and `rereadAfterEach` once, and together they are the whole
difference between the two existing drains at the row level. Nothing here unifies
the policies; what is unified is the loop that reads them.

---

#### Retry, per kind — and where a 409's meaning lives

**A STATUS NEVER REACHES THE DRAIN.** The transport maps a status to the KIND'S
OWN outcome union, and `classify` maps that union to the shared disposition. So
"409 means ALREADY EXISTS here and retry-forever there" needs no drain change at
all: it is two lines in two different `classify` functions over two different
unions. `httpTransport` already answers 409 on the void path as
`{ kind: "already_voided", doc_no: docNo }`, and its send path has no 409 branch
at all — searched `httpTransport.ts` for `409`: two hits, both in `voidBill`.

**A THROW IS THE KIND'S OWN OUTCOME, AND THE TWO KINDS ALREADY DIFFER.**
`engine.ts` builds `{ kind: "unavailable", reason: describeError(err), reachable: false }`
for a send and `{ kind: "unavailable", reason: describeError(err) }` for a void —
different shapes, because `VoidOutcome.unavailable` carries no `reachable`. That
difference is why `onThrow` is a handler member rather than a drain rule. The
drain-level invariant it replaces stays, as an obligation on every kind: **a
throw carries no information about whether the server committed, so
`classify(onThrow(x))` must never be `terminal`.** That is a total, headless,
per-kind assertion, and it is a criterion below.

**SCHEDULES ARE ONE MEMBER, NOT AN ENUM.** `nextAttemptAt` returning `null` is
the void kind — no schedule column, no time gate, no attempt cap, bounded only by
the server settling it. Returning a Date covers the send backoff
(`backoffBaseMs * 2 ** (attempt-1)`, capped at `backoffMaxMs`), the parked slow
cadence (`masterDataRetryMs`, deliberately not a backoff), and the case an enum
cannot express at all: a transfer that MADE PROGRESS and must not be delayed for
having bounced. `SyncEngine`'s constructor already throws when a knob exceeds
`SEND_SCHEDULE_HORIZON_MS`, and that check moves with this member — a kind that
can write a schedule its own reader discards is a backoff silently reduced to
zero.

---

#### How an outcome is classified, and how a kind adds a member without moving another kind's union

    type OutboxDisposition =
      | { next: "settled" }
      | { next: "retry";        reason: string }
      | { next: "parked";       reason: string; code: string }
      | { next: "terminal";     reason: string; code: string }
      | { next: "needs_review"; reason: string; code: string }
      | { next: "halt_kind";    reason: string; code: string };

Six, and two of them are new. Each is a NEXT ACTION for the drain, never a
reason.

**`parked` — not done, out of the sendable queue, and IT COMES BACK BY ITSELF.**
The 424 case. `terminal` cannot express it, and the stage-1 mapping proves the
point by claiming it does while its own comment says otherwise. Splitting it is
the three-way rule of
`lessons/README.md § Lessons` "unavailable-is-not-rejected.md — applies to every sync/retry path"
put in the type instead of in a comment.

**`needs_review` — the server MAY have committed, and it is NOT safe to retry.**
No current member means this. `settled` lies, `terminal` strands work the server
may hold, `retry` duplicates it, and `halt_kind` is about the kind rather than
the row. The state already exists and is already named:
`mobile/src/master/createSeller.ts`'s `{ kind: "ambiguous" }` — a 2xx whose body
could not be read as a seller, on a route with no idempotency key. That member's
own comment says "there is no idempotency_key on this route to recover with" and
"this cannot be retried safely and it cannot be reported as done". A union with
no arm for it forces every implementation to pick one of the three wrong answers.
The row leaves the queue into a named, operator-visible state; nothing on the
device resolves it, and that is what the operator is told.

**THE RULE FOR ADDING A MEMBER, WHICH IS THE PART THAT KEEPS THE KINDS APART.**
A new SERVER MEANING goes in the kind's own outcome union — `SendOutcome`,
`VoidOutcome` — and moves nothing anywhere else, because the drain never sees it
and no other kind imports it. A new NEXT ACTION goes in `OutboxDisposition` and
is a compile error in EVERY kind's `classify`. That expense is deliberate and is
the whole point: a new next-action is a new drain behaviour, and a kind that
silently inherits somebody else's answer to it is the failure
`lessons/README.md § Lessons` "correct-classification-can-still-render-as-an-error.md — applies to every internally-distinguished state"
records three times over.

**THE POISON SIGNAL IS WHY `record` TAKES THE OUTCOME.** `first_server_error_at`
and `server_error_attempts` are maintained by two `CASE WHEN ? = 1` expressions
in `markPendingAgain`, and the `1` is `reachable`. The stage-1 mapping's
`unavailable` arm returns `{ next: "retry", reason: o.reason }` — `reachable` is
dropped — and `record(row, d, attempt, now)` has no second source for it. **With
those two signatures the send kind cannot maintain its own poison columns**, so
`queueHealth`'s `poisoned`, `alarm` and `blockerId` go dark and nothing else in
the tree notices. Handing `record` the kind's own outcome fixes it at the type,
and keeps `reachable` out of the shared union where it does not belong.

---

#### What the PASS reports — and it is not the disposition

**THE DISPOSITION IS FOR THE DRAIN AND THE PASS RESULT IS FOR THE SCREEN, AND THIS
DESIGN'S FIRST DRAFT HAD ONLY THE FIRST.** `classify` yields a next action and
explicitly "never a reason"; `record` returns `void`. Between them nothing carries
anything out of the pass. Searched the design's own subsections for `SyncRunResult`,
`sessionExpired`, `skippedInFlight` and `setOnline`: **not found with these words**,
zero occurrences each, against a control in the same range — `claimForSend`, which
the draft names four times. So a mechanism satisfying every part of the design as
drafted returns nothing, and four reactions in `mobile/App.tsx` have no input.

**THE FOUR REACTIONS, RE-DERIVED AT THE FILE.** They are not interchangeable and
none of them is derivable from `sync_state`:

- `App.tsx:844` — `r.sessionExpired > 0` folds the session flag through
  `sessionEndedAfterPass` and sets `online` TRUE. The server ANSWERED.
- `App.tsx:871` and `:875` — `r.forbidden` sets `submitRefused`, `r.voidsForbidden`
  does not; both set `online` TRUE. One is about what the phone may do from now on,
  the other is a fixed set of purchases already in disagreement.
- `App.tsx:881` — `r.attempted === 0` returns before any conclusion is drawn about
  the connection, which is what stops a pass that sent nothing from claiming one.
- `App.tsx:890` and `:899` — `synced || rejected || masterDataBlocked` sets `online`
  TRUE and clears `submitRefused`; `retryable` alone sets `online` FALSE.

**SO THE RUNNER RETURNS A RESULT AND `SyncRunResult` IS THE FLOOR, NOT A
SUGGESTION.** Whatever shape the generalisation gives it, every field those six
lines read must still be produced, and `skippedInFlight` — which is written today
only by `noteSkip`, on a LOST DURABLE CLAIM and on nothing else — must still be
produced, because with `claim` now a handler member it is the only report that a
row was passed over without being tried. `mobile/src/session/signOut.ts` already
pins four of these fields structurally: `PassEvidence` is a `Pick` off
`SyncRunResult`, so renaming one there is a compile error rather than a branch that
quietly stops matching, and `forbidden` is absent from that `Pick` ON PURPOSE.
A per-kind result may be ADDED beside it; it may not replace it silently.

---

#### How work is made VISIBLE — and the type whose stated invariant a second kind breaks

**WHAT IS THERE NOW.** `UnsentBreakdown` in `mobile/src/sync/types.ts` documents
its four counts as over `sync_state IN ('pending','syncing')`, "DISJOINT and
COMPLETE: every unsent row is in exactly one". The statement that produces them
reads `FROM local_bills`. `signOutNotice.ts` renders the number as
`มีบิลรอส่งขึ้นระบบ ${String(input.pending)} ใบ` — the noun is BILLS, on the gate
that refuses sign-out. So the predicate is about ROWS IN A STATE, the sentence is
about BILLS, and the query is about ONE TABLE; a second kind makes at most two of
those three true at once.

**AND IT IS ALREADY WORSE THAN THE SUPERSESSION SAYS, BEFORE ANY NEW KIND.**
Three findings, re-derived here:

- **The gate and the sheet read DIFFERENT numbers.** `App.tsx` passes
  `pending: ownUnsentCount` to `signOut`, where `ownUnsentCount` is
  `unsent.mine + unsent.mineBlocked`; and it passes `pending: pendingCount` to
  `signOutCard`, where `pendingCount` is `unsent.mine`. With `mine === 0` and
  `mineBlocked > 0` the sheet takes its confirmation branch — `ออกจากระบบ?`,
  `บิลทั้งหมดส่งขึ้นระบบครบแล้ว` — and the button then reaches
  `if (outcome.kind === "refused_pending") return;`, which sets no state. A
  confirm that does nothing, with no sentence anywhere saying why.
- **`unsentBreakdown` is not on the `LocalStore` interface.** Searched
  `mobile/src/sync/types.ts` for `unsentBreakdown`: zero hits, and the interface
  runs from `export interface LocalStore {` to its closing brace without
  declaring it. It resolves only because `App.tsx` types the ref as
  `useRef<SqliteLocalStore | null>(null)` — the concrete class. So the number the
  sign-out gate turns on is supplied by a method the shared contract does not
  require, and a second store implementation owes nothing.
- **The four counts have no kind axis at all**, so they cannot be extended to a
  second kind without either double-counting a bill or inventing a fifth count
  whose completeness claim nothing checks.

**WHAT THE DESIGN DOES.**

1. **`UnsentBreakdown` keeps its four counts and its completeness claim is
   RE-SCOPED IN ITS OWN TEXT to BILLS.** The four split by WHOSE and WAITING ON
   WHAT, which is a question about bills and stays one. The docstring stops
   saying "every unsent row" and says "every unsent BILL", because the sentence
   as written is a claim about a caller nothing verifies —
   `lessons/README.md § Lessons` "a-docstring-that-states-a-filter-is-a-claim-about-its-caller.md — applies to every comment saying what a value EXCLUDES".
   The false wording is superseded in place, not deleted.
2. **A second value carries the kinds, and is total by construction.**

       type OutboxOwed = { readonly [K in OutboxKind]: number };

   Produced by iterating the registry and calling `owedCount()`, so a kind cannot
   be omitted from it without failing to compile, and no hand-written SQL has to
   remember to union a new table.
3. **The gate consumes `OutboxOwed`, never a bill count.** `signOut`'s
   `deps.pending > 0` becomes "any kind owes anything", and its docstring stops
   naming bills.
4. **The STRIP consumes `OutboxOwed` too, and this was missing.** The gate and the
   sheet were the whole of the draft's answer; the surface the yard actually reads
   all day was not in it. `statusNotice`'s `StatusInput` carries no owed-work field
   for any kind but bills — `pending`, `parkedForAnother`, `parkedUnknownOwner`,
   `failed`, `waitingOnMasterData` are all bill counts, and `voidsRefused` counts
   REFUSED voids and never OWED ones — so with a void owed and no bill pending the
   strip falls through every branch to `ส่งครบแล้ว`. That is not a future defect
   waiting on a new kind: **it is true of the tree today**, for the second kind that
   already exists, and the phase where it bites is a yard that orders a
   cancellation offline.
5. **The SHEET takes `OutboxOwed` as a REQUIRED field and switches
   exhaustively**, so every existing call site becomes a compile error until
   somebody writes the sentence for the kinds it can now see. That is the repair
   `correct-classification-can-still-render-as-an-error.md` arrived at twice, and
   the reason `ForbiddenAction` is already a required argument in
   `parkedReason.ts` rather than an optional one carrying the old wording as its
   default.

   **THE DRAFT'S ARGUMENT FOR THIS WAS `ใบ`, AND `ใบ` IS THE WRONG TEST.** It read
   that the classifier "is FALSE of a seller or a photograph" — true, and it names
   two things `OutboxKind` does not contain, because this same design removed
   `seller_create` and never carried a photograph. Under the only substitution
   available, `bill_void`, the classifier is TRUE: a bill awaiting cancellation is a
   bill, and a correct sentence about it says so. **What is false is not the
   classifier but the VERB.** `บิลทั้งหมดส่งขึ้นระบบครบแล้ว` on the sheet and
   `ส่งครบแล้ว` on the strip are claims that the DEVICE OWES NOTHING, and they are
   the sentences that become lies. The test is therefore an absence of THOSE
   SENTENCES while anything is owed, with a presence sibling naming what is owed —
   never an absence of a character.

**AND THE GATE'S REASON IS NOT ONLY COSMETIC — WITH ONE CORRECTION THE DRAFT GOT
BACKWARDS.** The queue carries no identity of its own: `signOut.ts` says so at its
gate, and `HttpTransport` resolves the token from a device-global ref at send time,
so a BILL that survives a sign-out drains under whoever signs in next. That much is
already recorded as a hazard. The draft then extended it to every kind — "the work
drains under whoever signs in next, a different tenant included" — and for the one
non-bill kind that exists that is FALSE and in the safer direction:
`listVoidsToApply` carries `void_requested_by_tenant_id = ? AND
void_requested_by_user_id = ?`, so the void does not drain under anybody else. **The
harm is the opposite one and it is not smaller:** the cancellation never goes at
all, silently, on a bill the server still holds as live money, after a sheet that
told the operator everything had been sent. Two kinds, two different failures, one
missing count — which is exactly why the predicate is per kind. `QUEUED` gained an
owner filter and `listVoidsToApply` gained a requester filter, each written by hand,
at its own site, in its own commit, and the two ask DIFFERENT QUESTIONS: who WEIGHED
it, and who ORDERED THE REVERSAL. So `owed()` carrying the owner predicate is a
REQUIREMENT ON EVERY KIND, it is stated on the interface member itself above rather
than only here, and it has a criterion below — which the draft did not give it.

---

#### What SERIALISES the drain — recorded here because it is recorded nowhere

**TODAY, WITHIN ONE PASS:** the shape of the code and nothing else. `runOnce`'s
loop body ends `await this.sendOne(bill, result);`, so one request is in flight
at a time, and `listPendingOldestFirst` is re-read at the top of each iteration.
That `await` is the entire mechanism by which `doc_no` order is deterministic,
and no member of `OutboxPolicy` means it.

**TODAY, ACROSS PASSES: nothing.** `App.tsx` fires `void syncOnce()` on a
`setInterval(..., 4000)` and from four other sites; `syncOnce` guards only on
`maySync({ paused, token })`; `HttpTransport`'s timeout is `config.timeoutMs ?? 20_000`.
So a request may legitimately outlive the next three ticks. And the two guards
that look like they cover it do not:

- `SyncEngine.inFlight` is keyed by ROW. It stops the same row being sent twice.
- `claimForSend` moves the row `pending → syncing`, and `QUEUED` is
  `sync_state = 'pending' AND ...`. **So the claim itself removes the head from
  the next pass's queue**, pass B's head becomes the SECOND bill, `inFlight` does
  not contain it, its claim succeeds, and both are in flight at once. `doc_no`
  then falls to whichever request reaches the counter's row lock first.

Head-of-line is therefore a property of one pass, not of the device, and the
73-second incident's fix holds only while every request completes inside the tick
interval. That is a timing assumption, and it is written down here for the first
time.

**WHAT THE DESIGN ADDS.** `concurrency: "serial_per_kind"` — a pass over a kind
so marked takes an in-process lock for the whole pass and a second pass over that
kind returns immediately rather than reaching past a claimed head. It is a
member of `OutboxPolicy` because it is a per-kind decision: the void kind is
`parallel_rows` and must stay so, since its rows are independent and its whole
point is that one refusal does not hold another.

**AND WHAT IT DOES NOT COVER, STATED RATHER THAN IMPLIED.** An in-process lock is
a claim about ONE JavaScript context. It does not serialise two PROCESSES, and
nothing on the handset runs two today; `claimForSend`'s conditional UPDATE
remains the durable guard for the crash case and for anything that ever does.
Three mechanisms, three scopes, and each one is needed: the `await` orders one
pass, the lock orders the passes, the claim survives the process.

---

#### The two instances this must be able to carry — and builds neither

**A KIND WHOSE 409 SETTLES.** Expressible with no drain change: it is one arm of
that kind's `classify` over that kind's own union. What the design also has to
say is what it CANNOT settle. `POST /sellers` refuses a client-minted id —
`SellerCreate` sets `model_config = ConfigDict(extra="forbid")` and declares no
`id` — and where a draft supplies NO code the server MINTS one and inserts, so a
re-send returns a second seller rather than any collision at all. Whether a 409
may be read as ALREADY EXISTS is therefore not a client question, and the
decision is the owner's at
`OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "TWO OFFLINE HANDSETS CAN MINT THE SAME SELLER CODE".
**What this design owes that decision is only this:** whichever way it goes, the
mapping is one arm of one `classify`, `needs_review` exists for the arm that
cannot be settled or retried, and `owed()` carries the owner predicate. No other
part of the mechanism moves.

**A MULTI-MEGABYTE BINARY WITH RESUME SEMANTICS.** Four things it needs, and
where each one lands:

- **The payload must never be a field of `Row`.** `owed()` returns rows; a batch
  of them is in memory at once. So `Row` for such a kind is a DESCRIPTOR — an id,
  a path, a size, an offset — and `perform` streams. Nothing in the interface
  forbids the wrong shape, so this is a rule the kind's own row type has to
  carry, not a guarantee the drain provides. Stated because a guarantee believed
  is not a guarantee measured.
- **Partial progress is the kind's own row state.** `record` is the kind's only
  writer and already receives the outcome, so an offset or an upload-session id
  is written there and read back by the next `perform`. The drain needs nothing.
- **`retry` must mean "still owed", never "repeat the same request".** With
  `record` writing the offset and `perform` reading it, the next attempt
  continues. This is a semantic obligation on the disposition and it is why the
  member carries no request in it.
- **A backoff enum would be wrong for it, and `nextAttemptAt` is not.** An
  attempt that transferred four megabytes and then dropped has made progress and
  must not wait out a doubling delay. `nextAttemptAt` sees the row, so the kind
  can return `now` for a bounce that advanced the offset and a real delay for one
  that did not. **This is the single member of the stage-1 policy that the photo
  kind could not have used**, and it is the reason the enum is replaced.

**What is NOT carried, and belongs to whoever adds the kind:** the local store
moves only `string | number | null` across its driver boundary, every table is
`STRICT`, and no BLOB column exists anywhere in `schema.ts`. Bytes on this device
are a filesystem question that the outbox does not answer.

---

#### WHAT SATISFIES EVERY CRITERION BELOW AND STILL LEAVES THE WORK BROKEN

The question that killed the first set, asked of the second — and **the previous
answer to it was itself a finding, which is why this subsection is rewritten rather
than extended.** It ended: *"A FOURTH WAS SOUGHT AND NOT FOUND. No state was
constructed in which every criterion is green and the DRAIN itself is wrong."* **A
state in which the drain itself was wrong was sitting in the printed drain on the
same page.** The loop selected `batch[0]` on every iteration, so it could not reach a
second row and did not terminate for a kind whose retries stay owed, and not one
criterion in that set could see it — `HEAD-BLOCKS-A-ROW-THAT-MUST-NOT-GO`'s own named
red case, run against that loop, ends the pass through the backoff gate with the two
younger bills unsent, which is exactly what its assertion demanded. **An absence of a
counter-example found by one reader is worth what one reader's search is worth**, and
that sentence was the report's own largest hole, named by its author.

So this pass attacks from five fixed directions rather than by looking, and each says
what was found OR what was tried and did not hold, because a direction that came back
empty is part of the answer and not an omission.

**1. THE SEAM — which pair of components no criterion drives TOGETHER.**
`lessons/README.md § Lessons` "two-green-proofs-do-not-cover-the-seam.md — applies to any behaviour passing through more than one proven component".
**FOUND, AND NOW CLOSED: `sync/` against `adapters/sqlite/` at the query obligation.**
The design hands ordering to the SQL and forbids the drain to check it, so the
`ORDER BY` clause IS the ordering guarantee — and no cell read it. An `owed()`
dropping `device_created_at` from its sort passes every ordering assertion in any
staging whose rows are created in weighing order, which is what a fixture naturally
does. `HEAD-BLOCKS` now stages the two clauses in DISAGREEMENT.
**Closed for the surfaces:** the gate, the sheet and the strip were three separate
demands and are now parts of one criterion over one staging, which is what the lesson
prescribes. **Closed for `sync/` against `App.tsx`:**
`THE-PASS-REPORTS-WHAT-THE-SCREEN-REACTS-TO` pins the six reaction sites and the
`PassEvidence` `Pick`. **Sought and did not hold for the cart:** a bill built by a
proof fixture rather than by the real draft promotion would be an unproven
composition, and it is already proven — `promoteToBill` is driven by `proveCart`,
`proveCold` and `proveOwner`, and the first two construct a `SyncEngine`, so the
cart-to-outbox path runs end to end today. What is genuinely unreached is that path
for a kind that is not a bill, which has no instance.

**2. THE SURFACE — what the operator sees that no criterion reads. OPEN, AND IT IS
THE BROADEST OF THE FIVE.** Enumerated: `statusNotice`, `signOutCard`, `billNotice`,
`voidProgressLine`, `voidRoleNote`, `parkedSummary`, `masterNotice`,
`stalePriceHint`, `pricingProvenanceLine`, `sellerCreateNotice`,
`withheldDraftNotice`, `dailyScreen`. The criteria below reach the first two and the
parked wording through `master_data_code`. **The per-bill card is reached by none of
them**, and it is the surface this repository has already shipped two defects on —
one card drawn by two renderers promising an automatic cancel above a box saying the
system had not cancelled it. Every assertion over those builders lives INSIDE the
blast radius: `proveNotice.ts` carries 26 occurrences of `voidProgressLine` and 12 of
`billNotice`, `proveForbidden.ts` 5 and 3, and eight proof files drive
`statusNotice` — all measured with `grep -o … | wc -l` on 2026-08-19, all importing
`../sync/`, all editable by the same change they measure. **PARTLY CLOSED IN THIS
REVISION**, and it is the repair with the widest reach: `THE-PROOFS-AGREE` now
requires a per-file ASSERTION COUNT against a fixed base commit with the SUBTRACTION
reported, so a deleted assertion is a number rather than a promise to explain. What
remains open is an assertion REWRITTEN rather than deleted, which the count cannot
see and only a reader can.

**3. THE WRITE — what the drain writes that no criterion reads back. OPEN, AND
MEASURED.** `local_bills` has **27 columns** at `mobile/src/adapters/sqlite/schema.ts`
on 2026-08-19, counted by reading the `CREATE TABLE` body and matching column
declarations with `grep -cE`. The criteria below read a MINORITY of them back after a
pass, and no figure is written here because it moves with the set. Four that are
load-bearing and are not read back by any cell:

- **`idempotency_key`, and it is the sharpest.** Hard rule 4 lives on it. Nothing in
  this set asserts the key TRAVELS through the rewritten drain, so a `perform` that
  dropped it turns every retry into a second bill and every criterion here stays
  green — the shape
  `lessons/README.md § Lessons` "a-value-comparison-cannot-prove-a-path.md — applies to every test whose claim is that data FLOWED"
  is about, on the field the whole offline design rests on.
- **`void_refused_code`.** `engine.ts` spends forty lines on why the 403 code and the
  rejected code must differ, because `clearVoidRefusals` excludes one and
  `forbiddenReason` words the other. It survives only by the CONJUNCTION of
  `proveVoidTerminal.ts` driving a real `SyncEngine` and two criteria — the guard
  forbidding those hunks to move, and the suite being green. **Remove either and the
  column is unguarded**, which is a fragility rather than a gap.
- **`last_error`.** Written by `record` on almost every path, read back by nothing,
  and the field this repository has already rendered to an operator in red as a raw
  JSON body.
- **`synced_at`.** The only input to the strip's "last synced" line. A `record` that
  stopped writing it leaves the screen claiming the device has never synced, for
  ever, while everything syncs.

**4. TIME — what holds only while a request finishes inside a tick. ONE FOUND AND
CLOSED, ONE FOUND AND MADE A CRITERION, ONE LEFT OPEN.**
**Closed:** `owedCount()` sharing `owed()`'s predicate makes every visible count drop
a bill for the length of its own request, because `claimForSend` moves the head out of
`QUEUED` — twenty seconds of `ส่งครบแล้ว` on a 400 ms refresh, with every other
criterion green because every other staging is quiescent. The design now separates
the two predicates and `EVERY-SURFACE-COUNTS-EVERY-KIND` has a mid-pass staging.
**Made a criterion:** the constructor's horizon throw iterates two integers and cannot
follow `nextAttemptAt` onto a per-row function, and the reader that would catch an
over-horizon schedule fails OPEN by design, so the failure is a backoff silently
reduced to zero. `A-SCHEDULE-STAYS-INSIDE-THE-HORIZON` exists for it.
**OPEN:** `halted` and `inFlight` live in the runner's memory, so a Metro reload or a
JS crash retracts a `halt_kind` without anybody signing in. That is true of
`sendForbidden` today, argued for at the field, and inherited unchanged rather than
introduced.

**5. THE BOUNDARY — what crosses out of the outbox. OPEN, AND LARGELY UNCHANGED FROM
THE PREVIOUS ANSWER.** `SqliteMasterStore.saveSellers` opens with an unconditional
`DELETE FROM cached_sellers` inside its transaction, and `App.tsx`'s boot ends with
`if (token !== null) void refreshMaster(token);`. So a locally created seller written
into `cached_sellers` so the yard can pick it is destroyed by the next successful
refresh — at the next boot, on a device that is merely online — while its outbox row
drains perfectly and every criterion here stays green. Its `cached_sellers` row has no
origin marker to protect it: the table's six columns are
`id, code, name, phone, grade, owner_tenant_id`. **IT IS NOT CLOSED BY A CRITERION
HERE, DELIBERATELY.** This step must not build offline seller creation, and a
criterion about the seller cache would be a criterion about a kind this design is
forbidden to specify. The residual is that **a mechanism proven under these criteria
has NOT been shown to carry a kind whose rows must also be visible in the master
cache**, and whoever adds that kind inherits the cache question with it — the same
shape as the residual this step already accepted for the photograph, in the same
words: proven on one kind is not proven on another.
**The identity store is the second crossing and it is half reached.**
`OWED-CARRIES-THE-OWNER-PREDICATE` fixes an identity for the length of each staging,
and `currentOwner()` is read fresh per statement precisely so that a CHANGE of
identity mid-session is picked up — which nothing here exercises. **Sought and did not
hold as a state:** a pass in flight across a sign-out, because `signOut` pauses the
tick before the keystore clear and `syncOnce` re-checks `maySync` after the pass.
**The draft store is the third and no state was constructed:** `SqliteDraftStore`
imports the shared `OWNED_BY_CURRENT` rather than retyping it, and `proveDraftOwner`
drives it.

**TWO STATES THE PREVIOUS ANSWER CLOSED AND THIS ONE STILL CLOSES.** A mechanism that
carries both kinds and loses the poison alarm — `record` taking only the disposition,
`first_server_error_at` null for ever, the red alarm never firing — which
`THE-POISON-SIGNAL-SURVIVES-BOTH-WAYS` now drives on the RESET arm and on the 401 and
403 arms, because the stamp arm alone is satisfied by code that never resets and the
reset arm alone by a `classify` that collapses every refusal into `retry`. And a
mechanism proven with one row per kind, which is green with ordering removed entirely,
with the pass lock removed, and with the head-blocking `break` turned into an advance
— `HEAD-BLOCKS-A-ROW-THAT-MUST-NOT-GO`, `PASSES-OVERLAP-AND-ORDER-HOLDS`,
`VOID-KEEPS-EVERY-DIFFERENCE-THE-DESIGN-NAMES` and `PARKED-IS-NOT-TERMINAL` each now
state a minimum staging and argue for it.

**TWO STATES SOUGHT AND NOT CONSTRUCTED, REPORTED BECAUSE THE ATTEMPT IS PART OF THE
ANSWER.** A `record` that never increments `attempt_count` reddens by a route outside
this set: `queueHealth` computes `blocking` as `attempts > 0 && behind > 0` and gates
`poisoned` and `alarm` behind it, so the handset half of the poison criterion cannot
reach RED. And a `serial_per_kind` lock leaked by a throw out of `perform` — routine,
since `onThrow` is a designed member — survives the drain, throw and ordering criteria
and could not be cleared through `THE-PROOFS-AGREE`, because `runUntilQuiescent` polls
up to two hundred passes and a leaked lock plausibly hangs a proof that stages
offline-then-online. Reported as a PARTIAL state with its failing branch named rather
than as a state or as nothing.

**AND THE HONEST SUMMARY.** All five directions returned something this time, against
one in the previous answer. Two of the findings changed the DESIGN rather than the
criteria, which is the outcome the restructuring of stage 2 was for. Three are
recorded as residuals and not closed: the per-bill card, the four unread columns, and
the master cache. **The set is stronger and it is not complete**, and the one thing
this revision cannot do for itself is tell whether the five directions are the right
five.

---

#### THE CRITERIA, DERIVED FROM THE DESIGN ABOVE

**These replace the seven, and this is their SECOND revision.** The first derived
set was read by an independent pass on 2026-08-19 and stopped again: two criteria a
broken implementation satisfies, three properties no criterion reached, and a
printed drain loop that could not advance past its first row. The design above moved
first, because four of the findings were about the mechanism rather than about the
wording. **They are NAMED, not numbered**, for the reason given at the head of this
design.

**EVERY ONE NOW CARRIES TWO SENTENCES, AND THE PREVIOUS SET CARRIED ONLY THE
FIRST.** A RED CASE — the concrete broken implementation it turns red — and **CAN A
BROKEN IMPLEMENTATION SATISFY IT? answered in the criterion's own text.** A
criterion whose answer is anything but *no* does not go in. That question is what
killed the seven, and asking it once, at the foot of a document, about the set as a
whole, is how it came to be asked of only some of them.

**AND EACH ONE SAYS WHAT IT COSTS TO RUN** — HEADLESS (a proof under
`mobile/src/proof/`, no server, no handset), SERVER (a live API), or HANDSET —
because a set nobody can afford to run in one sitting is a set that gets run in
part, and the part that gets dropped is not chosen by its importance.

**NO RAW COUNT OF THE ARTEFACT APPEARS IN ANY OF THEM, INCLUDING IN A NAME**, per
`OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "A RAW COUNT INSIDE AN ACCEPTANCE CRITERION ROTS".
**The previous set broke that rule in a name, and the count had already gone stale
inside this same document.** `VOID-KEEPS-ALL-FOUR-DIFFERENCES` counted the void
drain's differences in the criterion's own title, while the design above adds
`concurrency` and `rereadAfterEach` as two further per-kind differences and corrects
"no ordering at all" to a query that IS ordered. A count of a criterion's OWN
STRUCTURE — *three cells*, *four parts* — is kept, because it is a statement about
the criterion and a reader can finish counting it. Where a number about the TREE is
needed it is named as a SET and a SOURCE and produced at run time: *every key
beginning `prove:` under `scripts` in `mobile/package.json`, counted by parsing that
file as JSON and taking `Object.keys`* — a definition that cannot match a script's
name appearing inside another script's command line, which a regex over the file
text can and does.

**AND EVERY ABSENCE ASSERTION IN THIS SET CARRIES A PRESENCE SIBLING IN THE SAME
RUN.** Three of the previous set's cells were bare absences — *the two younger bills
have no `doc_no`*, *it is absent from the sendable queue*, *the text does not contain
that string* — and each is satisfied by a drain that does nothing, by an empty queue,
and by a card that names nothing. That is the ninth mechanism of
`lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md — applies to every assertion",
and it was applied to one criterion in the previous set and to none of its
neighbours.

---

**THE-REGISTRY-IS-TOTAL-AND-IS-WHAT-THE-DRAIN-ENUMERATES.** *(HEADLESS)* A registry
LITERAL exists, its type is the mapped type over `OutboxKind`, and **the runner
obtains handlers ONLY by enumerating it.** **RED CASE, NAMED — THREE, AND THE FIRST
TWO SATISFIED THE PREVIOUS WORDING:**

- **The declaration in the tree today** — `export interface OutboxRegistry {` with
  one hand-spelled property per kind, referencing `OutboxKind` nowhere, and no value
  of it anywhere under `mobile/`.
- **A DECORATIVE registry.** A correct literal exists and a proof imports it, and
  `runOnce` calls `drainKind(billSend)` and `drainKind(billVoid)` from two
  hand-written imports. Adding a kind reddens the literal exactly as demanded, and a
  fourth kind with a handler in the registry is still never drained — which is the
  silence this whole step exists to remove.
- **A literal the shipped app cannot see.** `mobile/tsconfig.json` excludes
  `src/proof` and `mobile/tsconfig.node.json` excludes only `src/device`, so a
  registry whose only literal lives under `mobile/src/proof/` is trivially "imported
  by a proof", reddens `npm run typecheck`, leaves `npm run typecheck:app` at 0, and
  ships an app that constructs no registry at all.

**Observable, three cells.** (1) The literal's path is REPORTED and is outside
`mobile/src/proof/`. (2) Both mobile typecheck programs run BARE, each exiting 0;
then a member is added to `OutboxKind` on purpose and **both** must exit non-zero,
with the reported error set REQUIRED TO INCLUDE the registry literal's file and
symbol — *include*, not *equal*, because the mapped type also reddens `OutboxRow`
and `OutboxResult` and an exclusive test would argue against a correct
implementation; the member is then removed and the exit-0 pair re-run. (3) **THE
BEHAVIOURAL CELL, which is the one the compile cells cannot supply:** a third
handler is added to the registry literal and to nothing else — no edit to the
runner — and one pass DRAINS it, reported by the pass result keyed by kind. **CAN A
BROKEN IMPLEMENTATION SATISFY IT? No.** The decorative registry passes (1) and (2)
and fails (3); the proof-only literal fails (1) and the `typecheck:app` half of (2).

**NO-SECOND-DRAIN, AND ITS COMPILE HALF IS THE WEAKER ONE.** *(HEADLESS)* **RED CASE,
NAMED:** `engine.ts`'s existing send loop and `applyVoids` left exactly where they
are, with the generic drain added beside them and only `bill_void` routed through
it. Both typecheck programs exit 0. The performer then writes the "hand-written
fourth path" as a handler literal carrying `kind: "photo_upload"`, which reddens on
the KIND UNION and not on a second drain, records the error text, and removes it.
**That satisfied the previous wording completely.** **Observable:** the deliberate
break must be a SECOND DRAIN LOOP — a function that reads rows and calls the
transport — **named as a file and a symbol BEFORE it is written**, and the recorded
error must be about its inability to obtain the value the pass consumes, not about a
string that is not a member of a union. **CAN A BROKEN IMPLEMENTATION SATISFY IT?
Not the enumeration property, which is carried by the criterion above and not by
this one.** **AND ITS LIMIT IS STATED:** this cannot make an unsupported path
unwriteable. What it measures is that bypassing the supported path costs a compile
error at a site named in advance, and the reason it stays in the set at all is that
the previous version of it was cited as evidence for a property it could not reach.

**THE-DRAIN-ADVANCES-AND-TERMINATES.** *(HEADLESS)* **RED CASE, NAMED, AND IT IS
THIS DESIGN'S OWN FIRST DRAFT:** a loop reading `const row = batch[0]` on every
iteration under `while (true)`, where `continue` re-enters and re-takes the row it
had just passed over, `batch[1]` is unreachable, and a kind whose retries stay owed
never terminates at all. **Observable, two cells, and they are opposite:** (i) with
several rows owed to an `independent` kind and EVERY one bouncing `retry` — a void
that bounces writes only `void_attempts` and `void_last_error`, so all of them are
still owed at the end — one pass RETURNS, and the set of row ids `perform` was
called on EQUALS the set `owed()` returned at the start of the pass; (ii) with the
same staging on a `head_blocks` kind, `perform` was called on exactly the head and
on nothing else. **CAN A BROKEN IMPLEMENTATION SATISFY IT? No.** A drain that
re-takes `batch[0]` makes unbounded calls and (i) never returns; a drain that
advances but never re-reads fails the same-pass half of the head-of-line criterion
below. **The cells are on the CALLS, not on the final state**, because the final
state of a queue every row of which is still owed is identical under both.

**HEAD-BLOCKS-A-ROW-THAT-MUST-NOT-GO.** *(SERVER)* **RED CASE, NAMED — TWO, AND THE
SECOND WAS REACHED BY NOTHING IN THE PREVIOUS SET:**

- a drain whose `blocking` branch advances the cursor where `head_blocks` requires
  `break`, and one that iterates the batch `owed()` returned instead of re-reading;
- **an `owed()` whose `ORDER BY` drops `device_created_at`.** The design hands
  ordering to the QUERY and forbids the drain to check it, so the sort clause is the
  entire ordering guarantee and no cell in the previous set read it. `ORDER BY
  created_at, id` passes every ordering assertion in any staging whose rows are
  created in weighing order — which is what a fixture naturally does — and
  reintroduces the 73-second incident verbatim.

**Observable, and the staging is the criterion.** At least three bills weighed
offline in a KNOWN order, **with `device_created_at` DELIBERATELY DISAGREEING with
`created_at` and with insertion order** — the older-by-weighing bill written to the
device LAST, which is the shape the incident had and the only shape that separates
the two clauses. The OLDEST BY WEIGHING is made unsendable **by a bounce that
classifies `retry` — the mechanism is named, because parking it or changing its
owner removes it from `owed()` entirely, the head becomes the second bill, and the
assertion then goes red against correct code.** Assert the two younger bills have NO
`doc_no` after the pass, **AND the presence sibling: the oldest was performed
exactly once in that pass.** An absence assertion needs a presence sibling in the
same run:
`lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md — applies to every assertion",
ninth mechanism. Then, separately, the oldest sends and a younger bill still
carrying a backoff must go IN THE SAME PASS, which is what `clearBackoffForPending`
plus the re-read exist for and what a snapshot drain cannot do. Report the counter's
MOVEMENT, never the `doc_no`'s existence. **CAN A BROKEN IMPLEMENTATION SATISFY IT?
No.** The advance-instead-of-break variant sends the younger bills and reddens the
first cell; a do-nothing drain reddens the sibling; a snapshot drain reddens the
same-pass half; and the dropped sort clause reddens the whole staging, which it
could not do while weighing order and insert order agreed.

**PASSES-OVERLAP-AND-ORDER-HOLDS.** *(SERVER)* **RED CASE, NAMED:** the tree as it
stands — `setInterval(() => void syncOnce(), 4000)` at `mobile/App.tsx:904` with no
re-entrancy guard against a 20 s transport timeout, where `claimForSend`'s
`pending → syncing` removes the claimed head from `QUEUED` so the next pass's head
is the SECOND bill and both go concurrently. **Observable:** two bills, a transport
whose first request blocks until released, a second pass started while the first is
in flight, then both released; the `doc_no`s read back out of Postgres in weighing
order. **AND TWO ENGINE INSTANCES OVER ONE STORE, not two passes on one engine.** A
lock held in an instance field passes a one-engine staging and is a claim about ONE
OBJECT rather than one JavaScript context, which is the weaker thing the design
already says it provides; `mobile/src/proof/proveVoid.ts` already constructs several
engines against one store, so the two-instance staging is available and the
one-instance staging cannot see the difference. **AND THE CONTROL IS REQUIRED:** with
`concurrency` forced to `parallel_rows` for the send kind, the identical staging must
go RED, with the observed order printed — a green here that cannot go red is
measuring the fixture. **CAN A BROKEN IMPLEMENTATION SATISFY IT? No, and the two
additions are why:** the assertion alone is satisfied by any staging in which the
second pass happens to lose the race, the control alone is satisfied by a per-object
lock, and only the two-instance staging separates the object from the context. **ITS
BOUND, UNCHANGED:** nothing here reaches a second PROCESS; `claimForSend` remains the
durable guard for that and for the crash case.

**VOID-KEEPS-EVERY-DIFFERENCE-THE-DESIGN-NAMES.** *(HEADLESS, plus SERVER for the
attempt cell)* **The differences are enumerated here rather than counted**, and the
enumeration is the criterion: no backoff and no attempt cap (`nextAttemptAt` returns
null), no time gate (`dueAt` returns null), `blocking: "independent"`,
`concurrency: "parallel_rows"`, `rereadAfterEach: false`, and an `inFlightKey` that
prefixes the row id. The ordering difference is NOT in the list, and that is the
correction the design above records: `listVoidsToApply` ends
`ORDER BY void_requested_at, id`, so the void QUEUE is ordered and only the DRAIN is
unordered. **RED CASE, NAMED — TWO:** `inFlightKey: (rowId) => rowId` for both kinds,
the shared key the current prefix exists to avoid; and **`blocking: "head_blocks"` on
the void kind**, which every single-void staging passes because a lone row has
nothing behind it to block. **Observable:** one bill whose send is in flight while
its void is owed — the void must be ATTEMPTED, not skipped, and the assertion is on
the ATTEMPT rather than on the eventual state because under the shared key the drain
skips it silently and it merely retries later. **AND TWO VOIDS OWED, THE FIRST
BOUNCING:** the second must be attempted in the SAME pass, which is the whole of what
`independent` means and which no previous cell could see. Plus, in the same run and
each asserted separately: a void that bounced is re-attempted on the NEXT pass with
no wait; a void the server refused on identity grounds leaves the owed queue; and the
policy object for `bill_void` is asserted field by field against the list above.
**CAN A BROKEN IMPLEMENTATION SATISFY IT? No** — the two-void cell reddens
`head_blocks`, the in-flight cell reddens the shared key, and the field-by-field cell
catches a member silently dropped by a later edit. **ITS BOUND:** the field-by-field
half compares against a list written by the same author in the same commit, so it
catches a later edit and not this one's own error, which is what
`lessons/README.md § Lessons` "a-differential-control-is-only-as-good-as-its-weaker-side.md — applies to every check of the form"
says about its own remedy. The behavioural cells are what carry the claim today.

**A-THROW-LANDS-IN-ONE-OF-TWO-PLACES.** *(HEADLESS)* **RED CASE, NAMED, AND IT IS NOT
THE ONE THE PREVIOUS WORDING FORBADE:** that criterion asserted only that
`classify(onThrow(x)).next` is not `terminal` — one member excluded out of six, so
`settled` and `needs_review` both passed it. **On `bill_void` `settled` is WORSE than
the outcome that criterion forbade.** `markVoidApplied` writes `SET voided_at = ?`
and clears `void_refused_at` and `void_refused_code`; `listVoidsToApply` requires
`voided_at IS NULL`, so the void leaves the owed queue PERMANENTLY —
`clearVoidRefusals` cannot bring it back, because that statement only clears the
refusal columns — while the server never received the request. And
`parkedReason.ts`'s `voidProgressLine` returns `แจ้งระบบแล้ว` on `voided_at !== null`,
ranked FIRST, above every other branch: the card tells the yard the cancellation was
delivered. **`needs_review` is the cheaper and likelier one.** Every ordinary offline
bounce is a throw, so a `classify` mapping it to `needs_review` takes every bill of a
morning without signal permanently out of the queue and hands it to an operator; and
the local schema has no state for it —
`mobile/src/adapters/sqlite/schema.ts:111` is
`CHECK (sync_state IN ('pending', 'syncing', 'synced', 'failed'))`, four states, none
of which means *the server may have committed* — so the cheapest implementation of
`needs_review` is `markFailed`, the disaster the criterion was written to forbid,
reached through a member it left open.
**Observable:** for every member of the registry, headlessly and with no server,
`classify(onThrow(new Error("x"))).next` is asserted to EQUAL
`policy.resendIsIdempotent ? "retry" : "needs_review"` — a positive assertion over a
two-element set rather than the exclusion of one member of six — iterating the
registry so a new kind is covered by construction. The operands are PRINTED beside
the verdict. **CAN A BROKEN IMPLEMENTATION SATISFY IT? No.** All four other members
redden it: `settled` and `terminal` are the two lies about a request that got no
answer, `parked` claims a named resolvable cause a throw cannot carry, and
`halt_kind` treats one row's silence as a fact about the whole kind. **ITS LIMIT:**
`resendIsIdempotent` is a declaration, so an author who sets it wrong AND writes
`classify` to match is not caught. It removes the accidental disagreement and gives
the assertion something total to compare against; it is not a defence against a
deliberate one, which is the bound
`lessons/README.md § Lessons` "a-value-comparison-cannot-prove-a-path.md — applies to every test whose claim is that data FLOWED"
records about provenance carried by a type. **AND THE RESIDUAL, BECAUSE THE SET IT
QUANTIFIES OVER IS SMALL:** both members declare `resendIsIdempotent: true` today, so
the `needs_review` arm of the equality is asserted over no kind. The criterion is
total by construction; the behaviour has its first instance when the seller kind
arrives.

**A-SCHEDULE-STAYS-INSIDE-THE-HORIZON.** *(HEADLESS)* **RED CASE, NAMED, AND THE
DESIGN CREATED IT:** `SyncEngine`'s constructor throws when a knob exceeds
`SEND_SCHEDULE_HORIZON_MS`, and it iterates exactly two integers — `backoffMaxMs` and
`masterDataRetryMs`. The design replaces those knobs with a per-row FUNCTION,
`nextAttemptAt(row, d, attempt, now): Date | null`, and asserted that "that check
moves with this member". **A constructor check over two constants cannot move onto a
function without becoming a runtime check, and the design never said so.** A handler
returning a Date beyond the horizon writes a schedule its own reader DISCARDS:
`scheduledInstantIsDue` and `DUE_OR_UNBELIEVABLE` both fail OPEN, deliberately, so
the row reads as due NOW — a backoff silently reduced to zero, which the engine's own
comment names as "the kind of defect that shows up as 'the server is being hammered'
months later and is never traced back to a constant". Searched the previous criteria
for `horizon`, `HORIZON`, `SEND_SCHEDULE` and `clockSanity`: zero each, against
controls in the same range and the same instrument — `registry`, `owed()`, `record`,
`classify`, all non-zero. **Observable, two cells:** (i) a handler returning
`now + SEND_SCHEDULE_HORIZON_MS + 1ms` makes the write FAIL LOUDLY, with the kind, the
row id and the value in the message — the constructor's throw, moved to the only
place that can see a per-row value; (ii) a handler returning a legal delay is
HONOURED — the row is not attempted again in the same pass and IS attempted after the
delay, which is the presence sibling for (i). **CAN A BROKEN IMPLEMENTATION SATISFY
IT? No.** A drain that writes whatever it is handed reddens (i); a drain that clamps
silently instead of throwing also reddens (i), and clamping is the repair somebody
will reach for — a clamp turns a wrong constant into a wrong schedule nobody is told
about, which is the same defect one layer quieter.

**PARKED-IS-NOT-TERMINAL.** *(SERVER)* **RED CASE, NAMED — TWO:** the mapping in the
tree today, `dispositionOfSend`'s `rejected_resolvable` arm returning
`{ next: "terminal", ... }` directly beneath its own comment saying "It is NOT
terminal", wired to a drain that treats `terminal` uniformly and calls `markFailed`;
**and a `classify` that maps `session_expired` to `parked`,** which satisfied every
cell of the previous wording while `markMasterDataMissing` cleared
`first_attempt_at`, `first_server_error_at` and `server_error_attempts`, the pass
never incremented `sessionExpired`, the sign-in prompt never fired, and the yard was
told to ring the office about a price. **Observable, four cells:** a bill refused 424
is still `sync_state = 'pending'` with `master_data_missing_at` set; **its
`master_data_code` is read back and EQUALS the code the server sent**, which is the
only input to the sentence the operator acts on and which nothing in the previous set
read; it is absent from the sendable queue so it dams nothing, **with a presence
sibling — a second, unparked bill weighed behind it that MUST send in the same pass**,
because "it dams nothing" is vacuously true of a queue holding one row; and after the
kind's own cadence it returns to that queue with nobody pressing anything. The pass
result is asserted to report this as parked and NOT as a session expiry. **CAN A
BROKEN IMPLEMENTATION SATISFY IT? No.** The first and fourth cells go red under the
424 mapping; the code cell and the pass-result cell go red under the 401 mapping; and
the presence sibling reddens a drain whose `owed()` returns nothing at all, which
passed every cell of the previous wording.

**THE-POISON-SIGNAL-SURVIVES-BOTH-WAYS.** *(SERVER, plus HANDSET for the alarm)*
**RED CASE, NAMED — TWO:** `record`'s first-draft signature
`record(row, d, attempt, now)` fed by a `classify` whose `unavailable` arm returns
`{ next: "retry", reason: o.reason }` — `reachable` dropped, with no other source, so
`markPendingAgain`'s two `CASE WHEN ? = 1` expressions can never take their true
branch; **and a `classify` that collapses `session_expired` and `forbidden` into
`retry`**, with `record` then supplying `reachable: true` because the server did
answer — true, and the exact regression already paid for. **FIVE STORE METHODS WRITE
THESE TWO COLUMNS** — `markPendingAgain`, `markSessionExpired`, `markSendForbidden`,
`markMasterDataMissing` and `markSynced` — and the previous wording drove one of
them. **Observable, four cells:** a bill bounces repeatedly against a REACHABLE
server, and `server_error_attempts` and `first_server_error_at` are read back as
accumulating; then ONE transport-level bounce, and both are read back RESET; then, on
a row that has accumulated them, a 401 and separately a 403, after each of which both
columns are read back RESET **and the pass result reports `sessionExpired` or
`forbidden` rather than `retryable`** — the cells that separate the collapse. The
alarm is then driven to RED on a handset, which needs more than one bill, because
`queueHealth` gates `poisoned` and `alarm` behind `blocking`, which needs
`behind > 0`, and `behind` is `pendingCount - 1`.
Searched `mobile/src/proof/` with `reset|cleared|back to (zero|0)` intersected with
`poison|server_error|first_server`. **THE SEARCH RETURNED HITS, SO THE INSTRUMENT
LOOKED** — and each was read. One asserts the counters cleared by a SUCCESS, which is
a different writer; one is a fake's comment; and the only one naming RESET is a
docstring in `proveSync.ts` whose disproof stages a FRESH queue and starts the
counter at zero, so it cannot reach the `ELSE` arm at all. **Not found with these
words** — the arm that takes a non-zero counter to zero is asserted by nothing.
**AND THAT SEARCH IS A CONTROL FOR THE LITERATURE REVIEW AND NOT FOR THE
MEASUREMENT**, which is stated because the previous wording offered it as though it
were both. `null, 0` read back is indistinguishable between a correct reset, an
UPDATE whose `WHERE id = ?` matched nothing, and a row never written; what
discriminates it is that the ACCUMULATE half is asserted on the SAME row in the SAME
run, so the columns are known non-zero immediately before. **CAN A BROKEN
IMPLEMENTATION SATISFY IT? No.** The stamp half alone is satisfied by code that never
resets; the reset half alone by code that never stamps; and the 401/403 cells by
nothing that collapses them into `retry`.

**EVERY-SURFACE-COUNTS-EVERY-KIND.** *(HANDSET)* **RED CASE, NAMED:**
`unsentBreakdown`'s statement — `FROM local_bills WHERE sync_state IN ('pending','syncing')`
— used unchanged as the input to the gate, the sheet and the strip. **THE STAGING IS
THE KIND THAT ALREADY EXISTS, AND THAT IS THIS CRITERION'S REPAIR.** The previous
wording staged "a NON-BILL kind", and `OutboxKind` has two members which both carry
`LocalBill` — this design removed the third — so the staging had no instance and the
criterion could not be performed as written. **One bill, synced, carrying an owed
void, no bill pending, and NO terminally failed bill on the device** is the second
kind, it is available today, and every surface already gets it wrong. The
failed-bill precondition is named because `failedLine` appends a sentence to BOTH
cards from a count unrelated to what is owed. **Observable, in six parts, ALL IN ONE
RUN over ONE staging**, because a defect that lives between two correct renderers is
invisible to either alone —
`lessons/README.md § Lessons` "two-green-proofs-do-not-cover-the-seam.md — applies to any behaviour passing through more than one proven component":

- **(i) THE GATE.** `signOut` returns `refused_pending`. Against the bill-only count
  it returns `signed_out`, because `ownUnsentCount` is `mine + mineBlocked` over
  `local_bills` and the bill is `synced`.
- **(ii) THE SHEET**, READ ON THE HANDSET and reported VERBATIM in Thai, asserted
  over the whole concatenation in draw order (`signOutCardText`, which is
  `[title, ...lines, ...action labels]` and is what the view maps): the string
  `บิลทั้งหมดส่งขึ้นระบบครบแล้ว` must be ABSENT, **with a PRESENCE sibling in the same
  string** — the sentence naming the owed cancellation — because a card naming
  nothing at all satisfies an absence. **The previous wording asserted the absence of
  `ใบ`, and it is wrong twice over.** The classifier is TRUE of a bill awaiting
  cancellation, so a correct sentence contains it and the assertion turns a correct
  sheet red; and the branch the red case actually produces is the CONFIRMATION card,
  whose four lines and two labels contain no `ใบ` at all, so the assertion was ALSO
  green over its own named broken build. What is false is the verb, not the
  classifier.
- **(iii) THE STRIP**, read on the same handset in the same staging, reported
  verbatim: `ส่งครบแล้ว` must be ABSENT, with the same presence sibling. **The strip
  was in no criterion at all** — `grep -ci strip` over the previous criteria
  subsection returned 0, against a control of 5 matching lines for the same
  instrument over the whole of P1.18 — and it is the surface the yard reads all day.
- **(iv) THE PRESENCE SIBLING HAS ITS OWN CONTROL.** In a SECOND staging with
  nothing owed at all, that sentence must be ABSENT from both surfaces — otherwise a
  line added unconditionally to every card satisfies (ii) and (iii) in every staging
  including the ones where the surfaces are right.
- **(v) THE GATE AND THE SHEET READ THE SAME VALUE.** They do not today:
  `mobile/App.tsx` passes `ownUnsentCount` to `signOut` and `pendingCount` to
  `signOutCard`, and with `mine === 0` and `mineBlocked > 0` the sheet renders its
  confirmation while the button reaches `refused_pending` and sets no state — a
  confirm that does nothing, with no sentence anywhere saying why. Asserted as an
  equality between the two inputs in the same render, because two correct renderers
  fed two different numbers is the seam neither one's own assertion can see.
- **(vi) MID-PASS, AND EVERY OTHER PART OF THIS SET STAGES A QUIESCENT MOMENT.** A
  SECOND staging: one bill queued, a transport whose request blocks until released,
  the surfaces read WHILE it is in flight. `signOut` must still refuse and the strip
  must not read `ส่งครบแล้ว`. **RED CASE FOR THIS PART, NAMED:** `owedCount()` sharing
  `owed()`'s predicate, so a bill the drain has claimed `pending → syncing` is outside
  `QUEUED` and outside the count — the screen goes quiet for the length of the
  request, up to twenty seconds, on a 400 ms refresh. And a THIRD staging with a
  PARKED bill and nothing else, on which the gate must refuse, because `QUEUED`
  carries `master_data_missing_at IS NULL` while the gate counts `mine + mineBlocked`
  today.
- **(vii) THE DOCSTRING AND THE CONTRACT.** `UnsentBreakdown`'s completeness claim is
  re-derived and either re-scoped to bills in the type's own text or the type is
  split; and whatever value the gate now reads is DECLARED ON `LocalStore` in
  `mobile/src/sync/types.ts`. `unsentBreakdown` is not on that interface today —
  measured zero occurrences in the file, against `listPendingOldestFirst`,
  `pendingQueueSnapshot` and `resetSyncingToPending`, which are all declared there —
  so the number the sign-out gate turns on is supplied by a method the shared contract
  does not require, and a second store implementation owes nothing. A docstring that
  has silently become false, and a contract that never gained the member, are both
  invisible to every other instrument in the tree.

**CAN A BROKEN IMPLEMENTATION SATISFY IT? No.** The bill-only count reddens (i) and
leaves the false sentences standing in (ii) and (iii); a build that counts the void
in the gate but not in the strip reddens (iii) alone, which is the seam the parts
share a staging in order to reach; an unconditional sentence reddens (iv); the two
inputs left different redden (v); and a build correct at rest but counting only the
sendable set reddens (vi), which is why (vi) has its own stagings rather than another
assertion on the first one.

**OWED-CARRIES-THE-OWNER-PREDICATE.** *(HEADLESS)* **RED CASE, NAMED:** a kind whose
`owed()` carries no owner clause — the state `listVoidsToApply` and `QUEUED` were each
hand-repaired out of, at their own site, in their own commit, with nothing holding
them together. The design states the predicate as a requirement on every kind and the
previous criteria contained no test of it. Measured with `grep -ci` over the previous
criteria subsection, counting matching LINES: `owned` 0, `tenant` 0, `requester` 0,
`owner` **2 — and both are about something else**, one a citation whose section title
contains "the owner's" and one the filename `proveVoidOwner.ts`. Control in the same
range with the same instrument: `registry` 6. **Observable, for every member of the
registry, driven through the store rather than through a fake:**

- a row belonging to a DIFFERENT identity is ABSENT from `owed()` and from
  `owedCount()`, **with a presence sibling in the same call** — a row belonging to the
  CURRENT identity, present — because an empty result satisfies every absence;
- with NO identity stored on the device, `owed()` is EMPTY for every kind, which is
  the fail-closed direction three-valued logic gives `OWNED_BY_CURRENT` for free and
  which an `IS NOT DISTINCT FROM` written by a second author would silently invert;
- **and the fixtures DIFFER PER KIND, which is the point.** For `bill_send` the
  discriminating row is one weighed by somebody else. For `bill_void` it is a bill
  owned by ME whose void was requested by SOMEBODY ELSE — absent — and a bill owned by
  somebody else whose void I requested — PRESENT. A predicate copied from the send
  path gets both of those backwards and nothing else in the set would notice.

**CAN A BROKEN IMPLEMENTATION SATISFY IT? No**, and the third cell is why: a drain
that filtered every kind by the BILL's owner passes the first two cells completely.
**ITS BOUND:** the identity is fixed for the length of each staging. `currentOwner()`
is read fresh per statement precisely so that a CHANGE of identity mid-session is
picked up, and nothing here exercises that.

**A-LOST-CLAIM-IS-NOT-AN-OUTCOME.** *(HEADLESS)* **RED CASE, NAMED:** a drain that
treats `claim(row) === false` as a disposition — `settled` takes a row out of the
queue that was never sent, with the cash already out of the till and no server record;
`terminal` does the same and puts a reason on it. The first draft named `claimForSend`
four times as the durable guard left unchanged, gave it no handler member, and left no
disposition meaning *I did not get the row*. **Observable:** with `claim` forced to
answer false for one row, `record` is NOT called for it, its `sync_state` and
`attempt_count` are unchanged after the pass, the pass reports the skip in the field
`noteSkip` writes today, and the row is still returned by `owed()`. **CAN A BROKEN
IMPLEMENTATION SATISFY IT? No.** Every disposition-shaped answer moves at least one of
those four. **AND ITS BOUND:** with `concurrency: "serial_per_kind"` a lost claim is
unreachable inside one JavaScript context, so this is exercised by forcing the answer
and not by racing two passes; `claimForSend` remains the durable guard for the crash
case and for a second process, which nothing here stages.

**THE-PASS-REPORTS-WHAT-THE-SCREEN-REACTS-TO.** *(HEADLESS)* **RED CASE, NAMED:** the
first draft's shape — `classify` yielding a next action and "never a reason", `record`
returning `void`, and nothing carrying anything out of the pass. Searched its
subsections for `SyncRunResult`, `sessionExpired`, `skippedInFlight` and `setOnline`:
zero each, against a control of `claimForSend`, which appears four times.
**Observable, and it is a compile-time cell plus a driven one:** every field
`mobile/App.tsx` reads off a pass result still exists and still carries the same
meaning — `sessionExpired` at `:844`, `forbidden` at `:871`, `voidsForbidden` at
`:875`, `attempted` at `:881`, `synced`/`rejected`/`masterDataBlocked` at `:890`,
`retryable` at `:899`, and `skippedInFlight`, whose only writer is a lost durable
claim — and `PassEvidence`, which is a `Pick` off that type in
`mobile/src/session/signOut.ts`, still compiles. Then each of the reactions is DRIVEN
and the resulting device-global state asserted, in particular that a `halt_kind` on
the send kind is STILL SET on the next pass and is retracted by `resumeAfterSignIn`
and by `resetAfterSignOut` and by nothing else. **CAN A BROKEN IMPLEMENTATION SATISFY
IT? No.** A pass-scoped `halt_kind` reddens the survives-the-pass cell, and a result
that dropped a field fails to compile at the `Pick`. **WHY THE COMPILE CELL IS NOT
ENOUGH ON ITS OWN:** a field can survive with its meaning changed, which no type sees
— that is why the reactions are driven and the state they produce is read.

**EVERY-KIND-RECOVERS-AT-BOOT.** *(HEADLESS)* **RED CASE, NAMED:**
`resetSyncingToPending`'s `UPDATE local_bills ... WHERE sync_state = 'syncing'` left as
the whole boot sweep, called directly from boot and never through the registry.
**THE PREVIOUS OBSERVABLE WAS UNSTAGEABLE AND ITS CONTROL DID NOT SAVE IT:** it staged
"a non-bill kind's row left in its in-flight state", and the only non-bill kind is
`bill_void`, whose in-flight guard is the engine's in-memory `inFlight` set — nothing
durable — so the row is owed after a kill WITH or WITHOUT any `recover()`, and the
control (the same staging with a bill) passes on the sweep that already exists.
**Observable, two cells:** (i) a bill left `syncing`, the process killed, the app
reopened, one pass run, and the row attempted — the kind that HAS durable in-flight
state; (ii) the boot's own return value is a map keyed by kind, and its KEY SET is
asserted EQUAL to the member set of `OutboxKind` — equality, never containment,
because containment asks what is present and only equality asks what is missing.
**CAN A BROKEN IMPLEMENTATION SATISFY IT? No.** A boot calling `resetSyncingToPending`
directly satisfies (i) and produces no map at all for (ii); a map missing a kind
reddens the set equality, which a `recover` correctly returning an empty array does
not. **AND THE RESIDUAL, STATED RATHER THAN HIDDEN:** cell (ii) measures that the boot
ENUMERATES, and nothing here measures that a second kind's recovery WORKS, because no
kind with durable in-flight state exists and this step is forbidden to build one. The
design's argument for putting `recover` on the handler is unmeasured until one does.

**THE-PROOFS-AGREE, AND THE ASSERTIONS THEY LOSE ARE COUNTED.** *(HEADLESS and
SERVER)* Every `prove:*` script — the set and source named above, counted at run time
— exits 0 twice in a row with no reseed between, run bare and with no flags;
`prove:forbidden --offline` exits 2 by design (`START_HERE.md § 4` "prove:forbidden")
and is not a counter-example. Report THREE numbers and assert the first two equal:
declared, ran, and the per-script exit codes. **RED CASE, NAMED — TWO:** a run that
skipped one and reported the declared total, the `SOURCES=` defect this repository has
already paid for; **and a change that DELETES an assertion the rewrite would otherwise
have to satisfy.** The previous wording asked for the proof diff to be reported and
for every CHANGED assertion to be justified — a promise to explain, which sees a
changed assertion and is blind to a deleted one, and under which dropping the
`attempted` bound and deleting the one proof case that asserted it leaves every script
at exit 0 with the deletion explained as a tidy-up. **Observable for that half:** a
PER-FILE ASSERTION COUNT over `mobile/src/proof/`, taken at the commit stage 3 branches
from and again in the working tree, with the tool and the definition of *an assertion*
named at the time it is run, and **the SUBTRACTION reported rather than the totals.**
Any file whose count DECREASES is named, with the behaviour change that forced it.
**CAN A BROKEN IMPLEMENTATION SATISFY IT? Not the declared-equals-ran half, and not a
deletion any more.** **WHAT IT STILL DOES NOT MEASURE, SAID PLAINLY:** exiting 0 twice
measures the proofs' idempotence and the suite's coverage of ITSELF, never coverage of
this change. That was the limit the superseded criterion 3 carried and it is carried
here unfixed; it is why this criterion is last and why nothing else in the set leans
on it.
**WHICH ONES NEED A LIVE API IS REPORTED, NOT INFERRED.** Searched
`mobile/src/proof/*.ts` for `API_BASE|apiBaseUrl|localhost:8|127\.0\.0\.1|RECYCLE_API`:
six files match — `proveCold.ts`, `proveDocNo.ts`, `proveForbidden.ts`,
`proveLogin.ts`, `proveLoginScreen.ts`, `proveSellerCreate.ts`. **That grep names a
mention, not a requirement**, and one of them deliberately points at a dead address, so
the run must report which scripts actually refused to proceed without a server, from
their own output. "All pass" is satisfiable only once that list is on the page.
**AND THE PROOFS ARE INSIDE THE BLAST RADIUS:** the affected set is *every file under
`mobile/src/proof/` that imports `../sync/` or `../adapters/sqlite/`* — LISTED by
`grep -l` at the time the criterion is run, with its size reported THERE and not
written here, because that set grows every phase and a digit in a criterion rots
silently. Those files are edited by the same change they measure.

**THE-VOID-REFUSAL-GUARD-IS-DERIVED-FROM-A-FIXED-COMMIT.** *(HEADLESS)* The MUST NOT
below is kept and its mechanism is repaired twice. **RED CASE, NAMED — AND THE SECOND
IS THE PREVIOUS REPAIR ITSELF.** The superseded guard named `proveVoid` and
`proveVoidTerminal` as the files whose `void_refused_at` assertions must appear
unchanged, and `mobile/src/proof/proveVoid.ts` contains that string ZERO times —
counted with `grep -o "void_refused_at" <file> | wc -l`, which counts OCCURRENCES and
not matching lines — so half the guard quantified over an empty set. **The repair
written for it was tautological.** It derived the guarded set as *every file under
`mobile/src/proof/` containing the string* and then required each member's count to
exceed zero: true by construction, over a set and counts both read from the
POST-change tree, so deleting an assertion removes the file from the domain and the
obligation with it, and deleting seven of eight leaves `1 > 0` and a green.
**A guard whose domain is derived from the thing it guards cannot see a deletion.**
**Observable:** the domain is fixed at a COMMIT named at run time — the commit stage 3
branches from — as `git grep -l void_refused_at <base> -- mobile/src/proof/`, with each
file's occurrence count at `<base>` reported beside its name; every file in that set
must still exist in the working tree with a count NOT LESS than its baseline, and
those hunks must appear unchanged in the diff. Report the SUBTRACTION, not the totals.
**AND ONE FILE IS EXEMPT FROM THE UNCHANGED-HUNKS HALF, BY NAME AND WITH ITS REASON:**
`mobile/src/proof/fakes.ts` is the in-memory store this rewrite must change, so
requiring its hunks unchanged would be unsatisfiable by a correct implementation. Its
COUNT floor still applies, because a fake that stops modelling the refusal columns is
exactly how the assertions above it go green over nothing. **CAN A BROKEN
IMPLEMENTATION SATISFY IT? No.** A deleted assertion lowers a count against a fixed
baseline; a deleted FILE is absent from a domain that still names it. **WHY NOT THE
OTHER TWO REPAIRS.** Naming the files is what has already failed once and rots on the
next file that gains the string — measured today, six files under `mobile/src/proof/`
carry `void_refused_at` and the superseded guard named one of them. Dropping the count
and keeping only the unchanged-hunks half quantifies over surviving files alone, which
is the deletion case exactly.

---

#### WHAT THIS SET DOES NOT COVER, SAID BEFORE ANYONE RUNS IT

- **The master cache.** See the residual above: a kind whose rows must also be
  visible in `cached_sellers` is not reached by any criterion here, and
  `saveSellers` will delete such a row on the next successful refresh.
- **Two processes draining at once.** The pass lock is in-process.
  `claimForSend` is the durable guard and is unchanged; nothing here exercises a
  second process.
- **iOS.** Nothing in this step reaches it, and no release build exists on either
  platform.
- **The seller kind.** Not specified, by the owner's open decision, and therefore
  not proven. `OutboxKind` carries two members until it is answered.
- **A LARGE BINARY, AND THE SET NOW SAYS SO WHERE THE DESIGN ONLY IMPLIED IT.**
  Nothing here stages a multi-megabyte payload, a partial transfer, or a resume.
  The design argues where each of those would LAND; no criterion measures one, and
  the argument is a reading.
- **A KIND WHOSE RE-SEND IS NOT IDEMPOTENT.** Both members declare
  `resendIsIdempotent: true`, so the `needs_review` half of the throw criterion is
  asserted over an empty set of kinds today. The MEMBER exists in the union and the
  criterion is total by construction; the BEHAVIOUR has no instance until the seller
  kind arrives, and that is a residual and not a covered case.

**BEFORE ANY DEVICE READING IS BELIEVED**, state which bundle and which server
process produced it — `npx expo start -c` and a full reload BEFORE the staging
that produces the reading, and the server's start time postdating the commit
under test with a request through the changed path
(`CLAUDE.md § Boot check` "WHICH BUNDLE THE HANDSET IS RUNNING").

**WHAT THIS DESIGN DOES NOT CLAIM.** It ran no build, no typecheck, no proof, no
server and no handset — this stage is documentation only, so nothing in it
carries an exit code. Every type-system claim above, including that the current
registry declaration cannot go red, is READ OFF THE DECLARATION and is not a
measured `tsc` result; the first criterion exists to measure exactly that, and
until it is run the claim is a reading.

---

#### What the NEXT review inherits — clues, not findings

**THE REVIEW THAT PRODUCED THIS REVISION WAS KILLED PART-WAY, AND ITS OUTPUT IS
CARRIED FORWARD AS INPUT RATHER THAN ACTED ON.** It had produced forty-five
findings against the PREVIOUS text of this section. **Every one of them is an
UNVERIFIED CLUE about a document that no longer exists in that form**, so
re-reviewing them here would be reviewing text that has been replaced — the
failure `CLAUDE.md § Workflow` "A REPORT IS A CLUE, NOT A SOURCE" describes, with
a report promoted into a premise and the artefact never reopened. They belong to
the SECOND independent review, which is the one that reads what is written above.

**FOUR THE REVIEWER NAMED AS WORTH RE-DERIVING FIRST, and each is recorded with
what would settle it rather than with a verdict:**

- **The registry red may land on the type alias rather than on the literal.** Adding
  a member to `OutboxKind` moves the alias first, and a `tsc` report naming that
  line is not evidence the registry is total. Settled only by running the break and
  reading WHERE the error points; `REGISTRY-IS-TOTAL-AND-CONSTRUCTED` requires the
  location and names this as the likely wrong red.
- **`THE-PROOFS-AGREE`'s declared-equals-ran may not be able to go green run bare.**
  Some `prove:*` scripts reach a live API and one deliberately points at a dead
  address. If the declared set cannot all run in one bare sitting, *declared equals
  ran* is unsatisfiable and the criterion is a permanent red rather than a check.
  Settled by running the set and reporting which scripts refused to proceed, from
  their own output — which the criterion already demands and which has never been
  done.
- **The gate reading `OutboxOwed` may DROP master-data-parked bills.** `owedCount()`
  for `bill_send` would count what `owed()` returns, and `owed()` is
  `listPendingOldestFirst`, whose predicate `QUEUED` carries
  `master_data_missing_at IS NULL`. The gate today reads `ownUnsentCount`, which is
  `mine + mineBlocked` and INCLUDES parked bills, deliberately: `mobile/App.tsx`
  argues at that state that the refusal reaches every bill the operator is
  responsible for, parked or not. **So a naive swap makes the gate refuse LESS than
  it does today**, and `EVERY-SURFACE-COUNTS-EVERY-KIND` stages an owed void rather
  than a parked bill, so nothing in the set would see it. Settled by staging a
  parked bill and nothing else and reading the gate's answer.
- **`NO-SECOND-DRAIN` lets the implementer choose which line fails to compile.** A
  break chosen after the fact can be one that would fail under any design. The
  criterion now requires the line to be NAMED before the break is written; whether
  that is enough is for the next reader.

**AND ONE THING THIS REVISION CHANGED THAT THE NEXT REVIEW SHOULD ATTACK FIRST.**
The drain loop above was rewritten, not patched, and the rewrite added three bounds,
a cursor, a claim member and a durable `halt_kind`. **A rewritten mechanism has no
history of being read**, and the two defects the previous draft shipped — a loop
that could not advance and a flag that could not take effect — were both in printed
code that had already passed one review.

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

**S19 (2026-08-17) — THIS STEP IS OPEN UNTIL A REAL SHOP TRADES, AND NO
SUBSTITUTE WILL BE INVENTED FOR IT.** S7 pushed P2.1 out past all three
deliverables, so the evidence this step needs does not exist yet and will not
before then. That is accepted rather than worked around: a staging substitute
would measure staging, which is exactly what the four items above already say
cannot reach them. **Do not read this step as schedulable.**

### P2.5 — What the day actually broke

**What it is.** The step whose content the pilot writes. It cannot be enumerated
here without pretending to know it.

**Depends on:** P2.1.

**Unblocks:** stage 3 being about a product rather than a prototype.

**DONE WHEN:** every defect the shop reported has a diagnosis with a reproduction,
or is recorded as not reproduced — with the reproduction established before any
cause is named (`CLAUDE.md § Workflow` "For any debugging").

**S19 (2026-08-17) — THIS STEP IS OPEN UNTIL A REAL SHOP TRADES, AND NO
SUBSTITUTE WILL BE INVENTED FOR IT.** The step's own first paragraph says its
content cannot be enumerated in advance without pretending to know it; S7 moved
the only thing that could write that content out past all three deliverables.
Both facts are now recorded together, because a reader meeting one alone could
conclude the step is merely unwritten. **Do not read this step as schedulable.**

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
