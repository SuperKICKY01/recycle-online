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
| R1, R1b | sign-out, and refusing an issued token | CLOSED. The record is `archive/PROJECT_STATUS_through_2026_08_28_f7ab2e0.md` "R1 and R2 are both CLOSED". Not a forward step. |
| R2 | the daily money screen's device gaps | CLOSED, on evidence of unequal strength recorded at the same place. |
| R2b | the sign-out sheet could not say why the queue was stuck | CLOSED. |
| R3 | a reachable server, HTTPS, backups that run themselves | **P1.2**, substantially unchanged, with the backup half's classification argued rather than assumed. |
| R4 | master data a shop can maintain itself | **SPLIT and its fork dissolved** — price editing is **P1.9** (phone) and **P1.15** (desktop), entity setup is **P1.8** and **P1.15**. See D5. |
| R5 | real accounts, and an app on a real phone | **P1.5** (provisioning) and **P1.11** (the build). |
| R6 | one shop uses it daily | **P2.1**, unchanged in substance. |
| R7 | the desktop back office | **P1.13**–**P1.15**, moved from "after a shop is running" INTO stage 1 by S3. |
| R8 | thermal slip printing | **P1.17**, moved into stage 1 by S3 — which is the answer to the open question that inverted the old file's whole split. |
| R9, R10 | sell flow, stock, and the rest of the out-of-MVP list | Off this file. They are `PROJECT_STATUS.md § What is NOT built` "do not build, do not scaffold" and nothing here schedules them. |

### Steps met and archived — one line each

A step whose DONE WHEN is met leaves this live spine WHOLE — with its record and
any superseded design blocks — to the cold archive under the
`archive/<SOURCE>_through_<date>_<sha>.md` convention (set 2026-08-28, commit
`9896041`). History is never carved out of a live step: a met step archives as
one unit and gains one row here. Live steps, S1-S22 and § Numbering stay in this
file. This table is the pointer.

| step | what it was | met | full text |
|---|---|---|---|
| P1.4 | an account that can be locked, not only signed out | MET 2026-08-07 (migration 0007) | `archive/ROADMAP_through_2026_08_28_9896041.md` "P1.4 — An account that can be locked" |
| P1.10 | `prove_reconcile.py` back to green | MET 2026-08-07 | `archive/ROADMAP_through_2026_08_28_9896041.md` "the three expectations that expired in the 2026-08-03" |

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

## The completion sequence to handover

**Written 2026-08-29 (M6) because it existed only as a proposal, and the proposal
was wrong on order.** S1 is a three-deliverable handover — the mobile app, the
desktop application, the provider web — and this section names the sequence from
today to that handover. It reorders no step and moves no bar: every `### P` entry
below remains the authority on its own DONE WHEN, its dependencies and its
argument, exactly as *The four steps to one paying shop* above defers to them. This
section says only WHAT is done in WHAT order, and it marks the owner decision that
fixes each ordering. It designs nothing.

**WHAT THIS CORRECTS.** A completion spine was accepted as a PROPOSAL and recorded
at `research/gemini-filter-verdicts-2026-08-29.md` — *hosting → RLS audit →
desktop → licensing → release → backup drills → PDPA/store → monitoring →
support+onboarding*. Verified against this file's own `Depends on` chains and
against S7, S8 and S13 in `ROADMAP.md § What the owner has settled`, that ORDER
does not hold, and the corrections are the point of writing the sequence down
rather than pasting the proposal:

- **It names no MOBILE stage at all, which S8 puts first.** S8 is *mobile, then
  desktop, then the provider web, and it is SEQUENTIAL* — each waits on the one
  before. A spine whose first software stage is *desktop* schedules the second
  deliverable ahead of the first. The mobile program is not finished:
  `ROADMAP.md § P1.23 — The mobile UX rework`, P1.8b's two open passes, P1.18's
  handset criterion, P1.21 and P1.11 are all live.
- **It places *release* after *desktop*, against the mobile program's own
  ordering.** `ROADMAP.md § P1.11 — An installable build on staff-owned phones` is
  argued to land *immediately before the desktop, and not earlier* and *after* the
  mobile screens stop moving — so a distribution round is spent once, not per
  screen change. Release therefore falls between hosting and desktop, never after
  licensing.
- **It omits P1.1, which is first for a reason nothing later can undo.**
  `ROADMAP.md § P1.1 — The second-hand goods act's record-keeping obligation` is
  first *because the answer may be a schema change, and the pilot's rows cannot be
  repaired afterwards* — the same irreparability D10 records. A compliance gate
  placed after real rows exist sits on the wrong side of that argument.
- **Its single *backup drills* slot collapses three drills at three clocks.** One
  is already inside `ROADMAP.md § P1.2 — A server a shop can reach`'s own DONE WHEN
  (a scheduled dump fetched off-box and restored); a second is
  `ROADMAP.md § P2.3 — An off-site restore of real shop data`, which cannot precede
  a trading shop; a third is
  `ROADMAP.md § P3.8 — Backup, restore and retention, per shop`, which depends on
  P3.6. They are not one gate and do not share a position.
- **It orders *desktop* before *licensing* across an unresolved split.** Where a
  licence is ACTIVATED (the desktop, per S1's extension) and where licence STATE is
  written (`ROADMAP.md § P3.1 — What a licence is, where its state lives`) are
  flagged in this file as unreconciled since 2026-08-26. Desktop cannot build an
  activation surface for state P3.1 has not defined.

**THE SEQUENCE, corrected. Four bands; within a band the steps' own `Depends on`
chains order them, and the decision that fixes each band is named. The
S-references resolve at `ROADMAP.md § What the owner has settled`.**

**Band 0 — start now, in parallel, no predecessor.**
`ROADMAP.md § P1.1 — The second-hand goods act's record-keeping obligation` (the
legal answer, first for irreversibility — D10) and
`ROADMAP.md § P1.2 — A server a shop can reach` (hosting, the one step with
external lead time, per S13 the owner's own machine). Neither waits on code; both
have a clock that code does not. P1.10 is met.

**Band 1 — the mobile program, finished to the S23 bar (S8: mobile first).** The
head is `ROADMAP.md § P1.23 — The mobile UX rework`, which draws the deferred
screens and now carries the S23/S24/D-C surfaces inventoried below; P1.8b's two
open passes and P1.18's handset criterion close here;
`ROADMAP.md § P1.21 — Seller history at the weighbridge` gains its drawing half
once its reading endpoint exists.
`ROADMAP.md § P1.11 — An installable build on staff-owned phones` (the release
build) lands after the screens stop moving and before the desktop starts;
`ROADMAP.md § P1.12 — The shared package` is the gate the mobile program clears on
its way out, and S8 reads P1.12's internal ordering as the whole-programme rule.
**The bar is S23** — a commercial-grade general app — so this band is not finished
when the purchase flow works; it is finished when the surfaces the inventory names
are drawn. Two capabilities this band needs have NO step yet and are named, not
minted, except the one below: the grade model (S16 — minted as P1.24) and the
camera screens (S12 — deferred behind the binary-payload mechanism P1.18 refused
to carry, and S15's storage answer).

**Band 2 — the desktop back office (S8: then desktop).**
`ROADMAP.md § P1.13 — The desktop scaffold` through
`ROADMAP.md § P1.17 — Thermal slip printing from the desktop`, plus the three
back-office steps whose drawing half is the desktop:
`ROADMAP.md § P1.19 — The end-of-day cash close` (S1's extension names the desktop
as holder of the cash close), `ROADMAP.md § P1.20` and
`ROADMAP.md § P1.22 — Anomaly signals: three named ones`. The settings surface's
desktop half (D-C) is drawn here — its content is
`ROADMAP.md § P1.16 — Shop identity a slip header can print`, its shell is
P1.13/P1.14. The licence-activation surface belongs to this band by S1's
extension; where its STATE is defined stays with P3.1, and the split flagged
2026-08-26 is reconciled at whichever lands first.

**Band 3 — the provider web (S8: then the provider web).**
`ROADMAP.md § P3.1 — What a licence is, where its state lives` through
`ROADMAP.md § P3.9 — Billing, and the 3% withholding question` in their own chain
— the licence and its state (P3.1), the enumerating service
(`ROADMAP.md § P3.2 — What the provider service enumerates shops FROM`,
`ROADMAP.md § P3.3 — The provider service`), the audit log
(`ROADMAP.md § P3.4 — The provider audit log`), the provider web itself
(`ROADMAP.md § P3.5 — The provider web application`), onboarding a shop without SQL
(`ROADMAP.md § P3.6 — Onboarding a shop without SQL`), user management from a
screen (`ROADMAP.md § P3.7`), per-shop backup and
retention (`ROADMAP.md § P3.8 — Backup, restore and retention, per shop`) and
billing (P3.9). Two operational gates have no step and are named, not minted:
monitoring (a schedule, not the P3.5 display and not P2.2's person) and a support
channel (P3.6 owns provisioning, not support).

**Band 4 — the pilot (S7: only after ALL THREE deliverables exist).** S7 holds
`ROADMAP.md § P2.1 — One shop trades on it, on consecutive days` through
`ROADMAP.md § P2.6 — The decisions the pilot is the evidence for` shut until the
three programs are real; S19 holds
`ROADMAP.md § P2.4 — The residues only real volume can settle` and
`ROADMAP.md § P2.5 — What the day actually broke` open until a real shop trades,
and neither is schedulable before then. One gate belongs at the mouth of this band
and has no step: a tenant-isolation (RLS) audit — the money-critical proof that
one shop cannot read another's rows — owed before a real shop's data lands, owned
by no `### P` step today.

**THE NEW SURFACES S23, S24 AND D-C IMPLY, homed as queue entries under the step
that owns each — S17, schema pulled by the feature that needs it, not pushed as a
set.** None mints a step of its own; each rides the step named:

- **Under P1.23 (the phone surfaces, per the S23 audit row):** an account-settings
  screen and the per-account surfaces it reaches — a profile view (who is signed
  in), a self-service change-own-password surface (the server route
  `POST /users/me/password` exists and no client calls it; P3.7's admin bar can
  close without it), and a visual theme (its shared presentation layer is P1.23
  item 3; a user-selectable theme sits against P1.23's own bar and is the owner's
  to move). The dashboard screen (S24) and its absorption of `DailyScreen` as a
  view inside it. The phone settings screen (D-C) and its `GET /shop` / `PATCH
  /shop` client calls.
- **Under P1.16 (the shop-identity content):** the address and phone the settings
  surface edits, which `tenants` does not yet carry; and the still-open owner
  decision on whether `GET /shop` stays staff-readable while `PATCH /shop` stays
  admin-only, which now shapes two drawn screens instead of none.
- **Pulled by P1.23 under S17, a widening not a step:** the dashboard's server
  reads — aggregation by `created_by` (buildable, not built) and reads across a
  period and by dimension, which today's single `/reports/daily` route does not do.
- **No step owns it — the store-compliance surface (S23):** a privacy-policy link
  at a public URL, terms, and — if the rule binds — an account-deletion path. It is
  research only today; the build/identity half is P1.11 (no `eas.json`, no bundle
  identifier, a placeholder display name), and the server-side PDPA erasure it
  pairs with is a queue entry, not a step.

**THE FREE-NUMBER SPACE, re-derived this pass with its controls, so a future mint
does not collide.** Used, no gaps: stage 1 P1.1–P1.23, stage 2 P2.1–P2.6, stage 3
P3.1–P3.9 (P1.4 and P1.10 are used-and-archived, their headings gone from this
file). The safe next number per stage, and the discipline each carries:

- **Stage 1 (mobile/foundation): P1.24** — its bare `§ P1.24` is a unique heading
  substring, and its only collateral is on `§ P1.2`, already five-way ambiguous and
  cited nowhere in bare form. P1.25–P1.29 are equivalent; P1.30+ is strictly worse
  (it takes `§ P1.3` from one heading to two).
- **Stage 2: P2.7** — cleanly safe; `§ P2.1` stays unique because *P2.1* is not a
  substring of *P2.7*. The cliff is P2.10, where `§ P2.1` goes one heading to two.
- **Stage 3: P3.10** — the next free number, and it is UNAVOIDABLY lossy: *P3.10*
  contains *P3.1*, so `§ P3.1` goes from one heading to two, and every P3.1x does
  the same. Nothing goes red today because every live citation naming a stage-3
  step uses the WIDENED full-heading form. **So a stage-3 mint must be cited in the
  widened form — the file, the section mark, then P3.10 together with its full
  title — never as a bare section label** — the same repair the decimal-substring
  lesson prescribes.

The decimal-substring trap is documented at
`lessons/a-check-that-never-went-red-was-never-observed.md` and is why the numbers
above were derived from a live-citation census, not from arithmetic: the label
space is already broken past ten, and what holds it up is which labels happen to be
cited (P1.7, P1.8, P1.12, P1.16 in bare form — none a substring of P1.24, P2.7 or
P3.10). **The only mint this section makes is P1.24 for the grade model**, the one
ownerless gate the sequence needs numbered now — S16 says in as many words that
*the grade model needs its own step*, no step owns it, and it blocks two of three
shop shapes from trading. Every other ownerless gate above is NAMED and its mint
deferred to when it is scheduled, from this same free space and under this same
discipline.

---

## What the owner has settled

Six decisions from a working session. They existed in no file. Recorded with their
reasoning so they are not re-argued; nothing below reopens them.

**S1 — the scope is three deliverables shipped together as one handover:** the
mobile app, the desktop application, and a provider web application. The father is
paying for a finished product, not an instalment. A handover that leaves the owner
running SQL for shop number two is a debt taken on with money already received.

**EXTENDED 2026-08-26 — WHY THE DESKTOP CANNOT FALL AWAY: IT HOLDS LICENCE
ACTIVATION AND THE SHOP'S CASH CLOSE, NOT ONLY SLIP PRINTING. This is the
owner's reason S1 is locked, confirmed 2026-08-26; it is recorded as an
extension to S1 and mints no S-number, the way S10's targeted exception and
S12's third photograph do.** The desktop application holds licence activation
and the shop's finances — the cash close — so every shop needs it whether or not
that shop prints a slip; slip printing (S3) is therefore one of the desktop's
duties and not the reason it exists, and the three-deliverable scope above cannot
fall to two, because a shop with no printer still needs the program that
activates its licence and closes its day. This records only the owner's reason;
the full design is captured when the desktop phase is built.

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

**EXTENDED 2026-08-28/29 — THE SHOP-SETTINGS SURFACE SHIPS ON BOTH MOBILE AND
DESKTOP: the same support-both logic, applied to a surface S6 did not yet name.
Recorded as an extension to S6 and minting no S-number, the way S1's desktop
extension, S10's targeted exception and S12's third photograph do.** The owner's
words are the record: "เราไม่อยู่ร้าน เราต้องพกคอมหรอไปแก้" — he is not always at
the shop, and configuring it cannot demand that he carry the desktop to do it. So
the surface each shop uses to configure itself is reachable from the phone at the
weighbridge AND the desktop at the counter, exactly as a seller or a price already
is under S6. **This closes the settings half of the homing question P1.23 item 4
carries** — the settings surface is homed on mobile, not conditionally, and also
ships on the desktop — and the audit below records the step split. This records
only the owner's reason; the screens are drawn by their steps.

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

**FLAGGED 2026-08-26, TO BE RECONCILED AT P3.1 OR THE DESKTOP PHASE — NOT
HERE.** The owner's decision recorded at S1 above (EXTENDED 2026-08-26) names the
DESKTOP as where a licence is activated, while the sentence above names the
provider web at P3.5 — so the activation SURFACE (which program the owner
activates from) and where licence STATE is written (P3.1's job, as this block
already sends it) are two separate questions that P3.1 or the desktop phase must
settle together, and this commit only names the tension rather than resolving it.

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

**A TARGETED EXCEPTION, GRANTED 2026-08-25, FOR P1.9 AND FOR NO OTHER SCREEN.**
This does not settle anything new and mints no S-number; it BOUNDS the decision
above at one place. S10 otherwise stands whole, and the drawings deferred by
P1.8b stay deferred.

**WHAT THE OWNER WAS SHOWN, AND WHAT CAME BACK.** He was shown three options —
a targeted exception for P1.9, defining the UX rework so that it has a P-number
of its own, or keeping S10 whole — and chose the first. **NO PROSE CAME BACK,
and none is invented here.** There is no paragraph in this block headed "the
owner's reasoning", because there is no reasoning to record: what is recorded is
the choice, and the material it was made against. Whoever later wants that
paragraph must ask him for it rather than reconstruct it.

**WHAT WAS SHOWN ALONGSIDE THE OPTIONS**, recorded as what was SHOWN and not as
a finding of the owner's. S10's argument is that a screen drawn now is drawn
twice, because the state behind it is still moving. The state behind THIS screen
has not moved:

- **The price WRITE PATH last changed 2026-07-28.** Re-derived while building
  P1.9, not carried from the advising session that first claimed it:
  `git log -L :set_product_price:server/app/master.py` returns two commits,
  `9592140` and `4fb1354`, both dated 2026-07-28, and nothing since. The FILE is
  much newer — `b8b557f`, 2026-08-25 — so a whole-file log would have given the
  wrong answer, and does.
- **`product_prices` has never been re-shaped.** Three migrations mention it and
  only ONE touches its DDL: `0001_initial_schema.py`, 2026-07-20, which declares
  `price numeric(14, 2) NOT NULL CHECK (price >= 0)`. `0003`, 2026-07-21, moved
  the GRADE that keys the tier lookup but altered no column here; `0010`,
  2026-08-18, names the table only in prose. **The advising session's figure was
  2026-07-21 and the correction matters in the direction that strengthens the
  case, not weakens it:** the table's own shape is a day OLDER than claimed, and
  untouched for over five weeks.

**WHAT THE EXCEPTION DOES NOT COVER.** It is for the price-editing screen on the
phone. It is not a precedent for the next screen, it does not define the rework,
and it does not reduce S10 to a formality — the gate is still undefined, and the
audit further down this file still records that as the load-bearing gap.

**NOT PINNED TO A SHA.** This block ships in the commit that carries P1.9, so no
sha yet means what the sentence would need it to mean, and HEAD names the commit
that does NOT contain it — `CLAUDE.md § Conventions` "PIN A CLAIM TO A COMMIT".
The date stands instead; anchor it in a later pass.

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

**TWO MORE, FROM A THIRD WORKING SESSION — 2026-08-20.** Both were put to the
owner as PROPOSALS and both were REFUSED by him on that date, so both record a
refusal rather than a new commitment. **Neither supersedes an S-number and
neither reopens one.** S20 declines to unlock a locked architecture; S21 declines
to insert a step in front of S7. The labels were minted after re-deriving the
range: `grep -rnoE '\bS(2[0-9]|[3-9][0-9])\b' --include='*.md' .` printed nothing
and exited 1, with the control `grep -rlE '\bS(1[0-9]|[1-9])\b' --include='*.md' .`
listing twenty files at exit 0 in the same pass — a negative from an instrument
that was not shown to fire is not a measurement.

**S20 — THE DESKTOP BACK OFFICE STAYS AN ELECTRON APPLICATION. A same-origin web
back office with a small ESC/POS print agent was PUT TO THE OWNER AND REJECTED,
2026-08-20.** The architecture already has it that way and is marked LOCKED; what
this records is the owner declining to unlock it when an alternative was put in
front of him. **That distinction is the whole value of the entry** — without it,
the next session that notices the same convergence argument has no way of telling
an unexamined default from a decision, and will re-argue it.

**WHAT THE OWNER WAS SHOWN, AND WHAT HE ANSWERED — this is the observation, and it
is all there is.** He was shown THREE OPTIONS for this question and SELECTED ONE:
keep Electron. **NO PROSE CAME BACK WITH THE SELECTION.** The other two options
are not recorded in this file, because this phase never saw them; whoever put the
question can supply them, and until then a reader should not assume what they
were.

**SO THIS SECTION'S OWN CONVENTION IS UNMET FOR S20, AND SAYING SO IS THE POINT.**
The section head promises decisions "recorded with their reasoning so they are not
re-argued". **For S20 there is no recorded reasoning, because none was given.**
Anything a later reader finds here explaining WHY is not his, and the safest thing
this file can do is say that out loud rather than supply a plausible substitute.

**WHAT FOLLOWS FROM THE FILES — NOT HIS REASONS, AND NOT EVIDENCE OF WHY HE
REFUSED.** Stated separately, and anchored, so it can be checked rather than
believed: the desktop is already the machine that rechecks a bill against its
photograph and prints the slip, which is S3 and S12 unchanged; and the proposal
was two artefacts, a web application and a print agent, where the architecture has
one. **Neither sentence is a motive and neither may be cited as one.** An earlier
draft of this entry ran a further argument about installation cost that nothing in
this repository measures, and it has been removed rather than labelled.

**THE TWO CONSEQUENCES, AND NEITHER IS SOFTENED.**

- **THIS FILE'S OWN D7 AND D11 BOTH STAY OPEN — and they are qualified by file
  deliberately.** `ARCHITECTURE.md` carries a DIFFERENT D1-D9, in which D7 is *an
  admin may create another admin*, and that collision is already recorded under
  *The decisions the ordering forced* below. A bare D-number across a file
  boundary names two unrelated things, which is the measured case in
  `lessons/README.md § Lessons` "A LABEL IS NOT A CITATION", and
  this sentence is exactly where it would happen again. **D7 of THIS file** — what
  origin the desktop renderer presents to CORS — stays open because an Electron
  renderer still has to be given an origin, and the same-origin proposal was the
  one shape that would have dissolved the question rather than answered it.
  **D11 of THIS file** — how a desktop app is installed and updated on a shop's PC
  — stays open for the same reason, and it is the heavier of the two: a web back
  office would have replaced it with a page load, and keeping Electron keeps a
  packaging and update route that nothing in this repository has begun.
- **THE BACK OFFICE DOES NOT CONVERGE WITH THE SHOP OWNER'S DASHBOARD.** That
  dashboard was settled on 2026-08-18 as living on MOBILE, and the audit below
  records the reasoning. A web back office would have put the two behind one
  origin and one deployment; Electron keeps them two programs on two platforms
  with two release paths, and every screen that both would want is drawn twice.
  **That cost is accepted, not overlooked.**

**S21 — THERE IS NO FAMILY-TRIAL STEP. A trial at the owner's father's shop, on
real goods and real money — P2.1's criteria minus "a shop that is not ours" — was
PUT TO THE OWNER AND REJECTED, 2026-08-20.** The pilot waits for all three
deliverables. **THAT IS S7 UNCHANGED: S7 is NOT superseded, NOT amended and NOT
re-argued by this entry.** What is recorded here is only that a proposal to run
evidence-gathering IN FRONT OF S7 was refused, so the next session meeting the
same idea does not raise it a second time as though it were new.

**THIS DOES NOT CONTRADICT S7'S OWN SENTENCE ABOUT THE OWNER'S TEST, and the two
are worth holding apart.** S7 already says the owner will test with his father
himself and that such a test does not meet P2.1 by being run. That is about an
informal test the owner performs; S21 is about a scheduled STEP with acceptance
criteria, evidence, and a place in this file. The first stays available and
proves nothing about P2.1; the second does not exist. **Neither sentence licenses
the other.**

**WHAT THE OWNER WAS SHOWN, AND WHAT HE ANSWERED — this is the observation, and it
is all there is.** He was shown THREE OPTIONS for this question and SELECTED ONE:
no family-trial step, the pilot waits for all three deliverables. **NO PROSE CAME
BACK WITH THE SELECTION.** The other two options are not recorded in this file,
because this phase never saw them.

**SO THIS SECTION'S OWN CONVENTION IS UNMET FOR S21 TOO. There is no recorded
reasoning, because none was given**, and no substitute is invented here.

**WHAT FOLLOWS FROM THE FILES — NOT HIS REASONS.** Anchored so it can be checked:
S1 makes the deliverable three programs handed over together, and S19 already
states, at P2.4 and P2.5, that a substitute for a real pilot produces evidence
about the substitute — so a shop trading on the mobile app alone would generate
those two steps' residues from a configuration that will never ship. And P1.17 is
unbuilt, so such a trial would be real money in a real till against software that
has never printed a slip. **None of that is a motive and none may be cited as
one.** An earlier draft argued this in the owner's name and about a shop's
goodwill, which nothing here measures; that argument has been removed.

**ONE MORE, FROM A FOURTH WORKING SESSION — 2026-08-23, AND IT ANSWERS A QUESTION
RATHER THAN REFUSING A PROPOSAL, which is what separates it from the two above.**
It supersedes no S-number and reopens none. **The label was minted after
re-deriving the range in that pass, with its control:**
`grep -nE '^\*\*S[0-9]+ —' ROADMAP.md` returns **21** definition lines, S1 through
S21 with no gap, and the repo-wide
`grep -rnoE '\bS(2[2-9]|[3-9][0-9])\b' --include='*.md' .` printed **nothing and
exited 1**, with the control
`grep -rlE '\bS([1-9]|1[0-9]|2[01])\b' --include='*.md' .` listing **twenty files
at exit 0** in the same pass — a negative from an instrument that was not shown to
fire is not a measurement.

**S22 — WHAT IDENTIFIES A LOCALLY CREATED SELLER ACROSS DEVICES IS A
SERVER-MINTED RESERVATION, TAKEN WHILE ONLINE. Decided 2026-08-23.** This answers
the question that has blocked P1.8b since 2026-08-18, filed at
`OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "TWO OFFLINE HANDSETS CAN MINT THE SAME SELLER CODE"
and closed there on the same date.

**WHAT THE OWNER WAS SHOWN, AND WHAT HE ANSWERED — this is the observation, and it
is all there is.** He was shown the FOUR options that entry itself records — a
device-scoped code space; a server-minted reservation taken while online; a
client-supplied idempotency key on `POST /sellers`; and accepting duplicates and
reconciling in the back office — and **SELECTED THE SECOND**. **NO PROSE CAME BACK
WITH THE SELECTION.**

**SO THIS SECTION'S OWN CONVENTION IS UNMET FOR S22, EXACTLY AS IT IS FOR THE TWO
ABOVE.** The section head promises decisions "recorded with their reasoning so
they are not re-argued". **For S22 there is no recorded reasoning, because none
was given**, and none is invented here. Anything a later reader finds in this file
explaining WHY is not his.

**AND HE CHOSE WITH THE COST IN VIEW — recorded as what he was SHOWN, not as a
motive.** The advising session named it and the selection was made with it in
front of him: **a reservation is FINITE ON THE DEVICE**, so a handset that
exhausts its holding mid-shift, with no signal, cannot create a walk-in. That is
the exact failure P1.8b exists to remove, **RELOCATED rather than eliminated**.

**THREE CONSEQUENCES, EACH RE-DERIVED IN THE PASS THAT RECORDED THIS DECISION AND
NONE OF THEM CARRIED FROM A REPORT.**

- **NOTHING ON THE SERVER IMPLEMENTS ANY PART OF IT.** Word-anchored,
  case-insensitive, over `server/app/` `*.py` —
  `\b(reserve|reserved|reservation|reservations|quota|quotas|allocate|allocated|allocation|lease|leased|prefetch)\b`
  — the sweep returns **ZERO hits, exit 1**. The unanchored form returns **two**,
  and both are substrings of ordinary words: `bills.py:537` inside *releases* and
  `master.py:24` inside *preserve*. The same anchored sweep over
  `server/migrations/versions/` (eleven files) also returns **zero, exit 1** —
  which is a read of the migration STACK and not a query of the head state, two
  different measurements and this is the first. **THE CONTROL, same tool, same
  corpus, same pass:** the seller-code machinery already there returns **ten lines
  at exit 0** across `db.py`, `master.py` and `seeddata.py`, and
  `@router.(get|post|patch|put|delete)("/sellers` returns **five lines at exit 0**
  in `master.py`. The instrument reads the corpus; the zeros are measurements.
- **SO P1.8b IS NO LONGER A MOBILE-ONLY STEP.** It now pulls a server ROUTE and a
  RELATION: something must hand a device a block of codes, and something must
  remember which codes are out and to whom. **That is what S17 asks for** — a
  schema change pulled by the feature that needs it rather than pushed as a set —
  so this is a WIDENING of P1.8b and not a new step. Of that step's seven survey
  bullets, **five are wholly device-side**; the sixth names a server change and
  names a DIFFERENT one (accepting a client-minted seller id), and the seventh
  states a server-schema FACT whose stated consequence is device-side. **None of
  the seven is the change this decision requires.**
- **THREE QUESTIONS THE DESIGN MUST ANSWER AND THIS RECORD DOES NOT:** how many
  codes a device holds, when the holding refills, and what the screen says when it
  is running LOW and when it is EMPTY. **They are named and deliberately
  unanswered here.** The seller kind is not designed in this entry, and criteria
  written ahead of a design are something this project has already paid for.

**THREE MORE, FROM A FIFTH WORKING SESSION — 2026-08-28/29. TWO MINT S-NUMBERS
(S23, S24); THE THIRD EXTENDS S6 AND IS RECORDED AT S6 ABOVE.** The sentence at the
head of this section is about the FIRST session and is left as written. None of the
three supersedes an S-number; D-A supersedes a READING this file and
`PROJECT_STATUS.md` both relied on — "mobile finished = business features done" —
which was never an S-number, and that supersession is recorded in S23 itself.
**The two labels were minted after re-deriving the range in this pass, with its
control:** `grep -nE '^\*\*S[0-9]+ —' ROADMAP.md` returned **22** definition lines,
S1 through S22 with no gap, and the repo-wide
`grep -rnoE '\bS(2[3-9]|[3-9][0-9])\b' --include='*.md' .` printed **nothing and
exited 1**, with the control
`grep -rlE '\bS([1-9]|1[0-9]|2[0-2])\b' --include='*.md' .` listing **twenty-five
files at exit 0** in the same pass — a negative from an instrument not shown to
fire is not a measurement.

**S23 — THE MOBILE PROGRAM'S COMPLETION BAR IS A COMMERCIAL-GRADE GENERAL APP, NOT
A YARD TOOL THAT MERELY WORKS. Decided 2026-08-28.** The owner's framing is the
record: "แอพที่ใช้ได้หมดอ่ะ แต่ไม่ใช่ฟรี" — an app where everything works, of the
kind a shop pays for, not a free utility. **This SUPERSEDES every earlier reading
of "mobile finished = business features done"**, a phrase this file and
`PROJECT_STATUS.md` have both leant on. The bar is no longer "the purchase-bill
flow is built" but "the app carries what a paid, general-purpose app is expected to
carry". **It mints an S-number because it is a NEW scope commitment and not the
reason for an existing one.** What "commercial-grade" covers in full is the owner's
to set and can move; the specific surfaces it implies are NOT designed here — they
become queue entries under their owning steps per S17, inventoried in this file's
completion sequence. This records where the bar stands on 2026-08-28.

**S24 — THE SHOP OWNER'S DASHBOARD IS THE SUPERSET, AND THE DAILY SCREEN BECOMES A
VIEW INSIDE IT. Decided 2026-08-28.** The dashboard was settled on 2026-08-18 as
living on MOBILE and was deliberately NOT given a row then — the audit below said
so in as many words, "the dashboard is not a nineteenth decision and gets no row" —
because its only open question at that time was the owner's: whether it was a NEW
screen or an extension of the existing daily screen. **THIS DECISION ANSWERS THAT
QUESTION, and that is what makes it substantive enough to mint the label the
dashboard lacked.** The owner's words set the scope: "Dashboard คือจะมีทุกอย่างหมด
มี Analyst มี filter มี chart มีไร สำหรับการบัญชี … แบบละเอียดยิบย้อย feature
เยอะแยะเลย แต่จะไม่รกนะ" — the dashboard holds everything for the accounting: an
analyst view, filters, charts, feature-dense but explicitly NOT cluttered. The
existing `mobile/app/DailyScreen.tsx` (a `/reports/daily` view) is not a peer to it
but a VIEW inside it. **Precedent: the 2026-08-18 dashboard reasoning was never an
S-number, so this cannot record UNDER one; it is a genuinely new decision — the
dashboard's scope — and mints S24, superseding the "gets no row" note in the audit
below.** The bar — rich but never cluttered — is part of the record; the
dashboard's SHAPE is not designed here and stays with the step that draws it. This
homes the dashboard on mobile, closing the other half of the homing question P1.23
item 4 carries.

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

**EXTENDED 2026-08-20 — THE RANGE IS NOW S1 TO S21, AND THREE SENTENCES ABOVE ARE
SUPERSEDED RATHER THAN REWRITTEN.** Everything above was true of the sweep run on
2026-08-18 and is left exactly as written; what follows corrects only what the two
new rows falsify. **The sentences this addition breaks contain NEITHER new label
NOR the word "decision"** — they say *S1 to S19*, *19*, *Nineteen*, *Eight*,
*Four*, *Seven* — so a sweep for `S20` or `S21` runs clean over a section that
already contradicts itself. That is the measured shape in
`lessons/README.md § Lessons` "Sweep by the QUANTIFIER and never by the member", and
the corrections below were found by sweeping the count words case-insensitively
and not by sweeping the labels.

- ***A sweep of S1 to S19*** above → **S1 to S21**. Nineteen were swept on
  2026-08-18; the two added on 2026-08-20 are swept here by the same method.
- ***returns 19 definition lines, S1 through S19 with no gap*** above →
  **re-derived 2026-08-20, the same command returns 21 definition lines, S1
  through S21 with no gap.** The repo-wide check that the range is closed at the
  top was re-run at the same time and is recorded at S20's own entry, with its
  control, because a negative with no control is not a measurement.
- ***Nineteen decisions swept, nineteen cells established*** above →
  **twenty-one and twenty-one.** The equality is the check, not the number: it
  says no cell was filled from knowledge of the file, and it has to hold at every
  size the table takes.

**EXTENDED AGAIN 2026-08-23 — THE RANGE IS NOW S1 TO S22, AND THE THREE
CORRECTIONS DIRECTLY ABOVE ARE THEMSELVES SUPERSEDED RATHER THAN REWRITTEN.** They
were correct over twenty-one rows and are left exactly as written. **The sentences
this addition breaks contain NEITHER `S22` NOR the word "decision"** — they read
*S1 to S21*, *21 definition lines*, *twenty-one and twenty-one* — so a sweep for
the new label runs clean over a section that already contradicts itself, which is
now the THIRD extension in a row for which that has been true. The corrections
below were found by sweeping the count words case-insensitively and not by
sweeping the label, the same way the 2026-08-20 pair was.

- ***S1 to S21*** above → **S1 to S22**. Twenty-one were swept before
  2026-08-23; the one added on that date is swept here by the same method.
- ***returns 21 definition lines, S1 through S21 with no gap*** above →
  **re-derived 2026-08-23, the same command returns 22 definition lines, S1
  through S22 with no gap.** The repo-wide check that the range is closed at the
  top was re-run in the same pass and is recorded at S22's own entry, with its
  control.
- ***twenty-one and twenty-one*** above → **twenty-two and twenty-two.**

**EXTENDED AGAIN 2026-08-29 — THE RANGE IS NOW S1 TO S24, AND THE THREE CORRECTIONS
DIRECTLY ABOVE ARE THEMSELVES SUPERSEDED RATHER THAN REWRITTEN.** They were correct
over twenty-two rows and are left exactly as written. **The sentences this addition
breaks contain NEITHER `S23`/`S24` NOR the word "decision"** — they read *S1 to
S22*, *22 definition lines*, *twenty-two and twenty-two* — so a sweep for either new
label runs clean over a section that already contradicts itself, which is now the
FOURTH extension in a row for which that has been true. The corrections below were
found by sweeping the count words case-insensitively and not by sweeping the
labels, the same way the three pairs before them were. **Two labels land this time,
not one:** S23 and S24 were minted in the same 2026-08-28/29 pass, and D-C of that
session extended S6 without a row (recorded at S6, owned by P1.23 and P1.13), so the
row count rises by two and not by three.

- ***S1 to S22*** above → **S1 to S24**. Twenty-two were swept before 2026-08-29;
  the two added on that date are swept here by the same method.
- ***returns 22 definition lines, S1 through S22 with no gap*** above →
  **re-derived 2026-08-29, the same command returns 24 definition lines, S1 through
  S24 with no gap.** The repo-wide check that the range is closed at the top was
  re-run in the same pass and is recorded at the S23/S24 mint in
  `ROADMAP.md § What the owner has settled`, with its control.
- ***twenty-two and twenty-two*** above → **twenty-four and twenty-four.**

| # | the decision, in short | owned by — and the command that established it | if none: new step, or extend which | if new: what blocks it |
|---|---|---|---|---|
| S1 | scope is three deliverables, shipped as one handover | **DISTRIBUTED, and the no-SQL bar is P3.6.** `grep -nE '\bS1\b'` → L2991 inside P3.6. The three deliverables are stage 1's mobile steps, P1.13–P1.17, and P3.5 | — | — |
| S2 | a pilot is part of the path | **SUPERSEDED BY S7**, so no step is owed. `grep -nE '\bS2\b'` → L205, L206, L210, every one inside S7's own text | none needed | — |
| S3 | the slip prints from the desktop, after sync | **P1.13 and P1.17.** `grep -nE '\bS3\b'` → L1580 (P1.13), L1686 and L1689 (P1.17). *L1492 is a DIFFERENT S3* — a reconcile injection cell, not this decision | — | — |
| S4 | the provider web shows status, licence, last bill — and no shop data | **P3.5.** `grep -nE '\bS4\b'` → L2972, the step's own *What it is* | — | — |
| S5 | staff-owned phones, accounts per person | **P1.4, P1.5 and P3.7; the platform half at P1.11 through D9.** `grep -nE '\bS5\b'` → L864 (P1.4), L1009 (P1.5), L3022 (P3.7), L631 (D9) | — | — |
| S6 | where a shop could work either way, support both | **P1.15, P1.17 and P2.6; P1.8 and P1.9 through D5.** `grep -nE '\bS6\b'` → L1606 and L1609 (P1.15), L1699 (P1.17), L2866 (P2.6), L587 (D5). **EXTENDED 2026-08-29 (D-C):** the settings surface adds P1.23 (mobile) and P1.13 (desktop) as owners of the same support-both logic — recorded as an S6 extension in `ROADMAP.md § What the owner has settled`, minting no row of its own | — | — |
| S7 | the pilot starts only after all three programs exist | **NONE, and it needs none — it is a CLOCK.** `grep -nE '\bS7\b'` → L2838 (P2.4) and L2859 (P2.5), where both cite it as the reason a step cannot start. Neither builds it, and nothing could. **But P2.1 — the step S7 actually moves — carries no S-number at all**, so the one step whose clock this decision reset does not say so | structural | — |
| S8 | mobile, then desktop, then the provider web — sequentially | **NONE. One mention in the whole file, and it is the definition.** `grep -nE '\bS8\b'` → L232 only. Subject search `grep -niE 'sequential\|mobile, then desktop'` adds nothing inside a step | structural — the order it states is already carried by the steps' own *Depends on* chains (P1.12 before P1.13, P3.5 last). **But no step CITES it**, so an edit to a dependency chain has nothing comparing it to the decision | — |
| S9 | three roles: owner, admin, staff; the owner account transfers | **NONE.** `grep -nE '\bS9\b'` → L245 (definition) and L446 (inside S18). Subject search `grep -niE 'owner role\|three roles\|deviceRole'` → L98, L262, L270, L438–L448, not one of them inside a step | **NEW STEP.** Not an extension of anything: it is a migration against `0001`'s two-value CHECK, a sweep of four spellings of the role pair, and the client change S18 binds into the same commit | **Nothing technical.** The licence half — who mints an owner — is P3.1 and P3.5, and S9 itself sends licence STATE to P3.1; the role model waits on none of that |
| S10 | no new mobile screens until a UX/UI rework | **NONE. The rework is defined nowhere in this file.** `grep -nE '\bS10\b'` → L272 (definition) and L1669, where P1.16 cites it as the reason a shop-settings surface has nowhere to live. Subject search `grep -niE 'UX\|rework\|new mobile screens'` returns those two lines and no third | **NEW STEP** | The internals S10 says come first — P1.18 among them — and the owner's own answer about what the rework covers. **It is a gate with no definition**, which is what makes every screen behind it unschedulable rather than merely unscheduled |
| S11 | every capability ships; each shop configures it | **NONE by label.** `grep -nE '\bS11\b'` → L286 and L289, both inside the decisions. The eight values it implies are queued at `OPEN_ITEMS.md § Blocking one real paying shop` "EIGHT THINGS EACH SHOP CONFIGURES FOR ITSELF" and scheduled nowhere | **EXTEND P1.16** for the operator surface — it took the shop-settings surface as scope on 2026-08-18 (L1665). The STORAGE is S16's, and each value is pulled by its own feature under S17 | For the surface: S10's undefined rework on the phone, and P1.13 on the desktop |
| S12 | photographs are part of the workflow — **three of them since 2026-08-18**, per bill, per seller and per staff member | **NONE. P1.18 UNBLOCKS it and refuses to carry it.** `grep -niE 'photograph\|photo\b\|camera'` → L1755 in P1.18's *Unblocks*, and L1745 in the same step saying it carries the mechanism and not the camera. No `### P…` section builds a photograph | **NEW STEP, and more than one** | P1.18's mechanism, S16's storage answer for *which photographs are required*, the UX rework for a camera screen, and S15's unanswered engineering. **The third photograph adds a fourth blocker the other two do not have**: it is taken where an ACCOUNT is created, and no client can create one, so it couples to P3.7 |
| S13 | hosting is the owner's machine, plus a domain and a tunnel | **P1.2 — established by SUBJECT, because no step names the label.** `grep -niE 'tunnel\|domain\|hosting\|host\b'` → L675, P1.2's own *What it is*: a host, a name, TLS and a scheduler. S13 says at L349–L350 that P1.2's DONE WHEN is untouched by it. **RESIDUAL, and it is a word rather than a gap:** neither "tunnel" nor "domain" occurs anywhere inside P1.2, and that step's title and DONE WHEN are written against "this box" and "off-box" (L871, L921, L923) meaning the DEVELOPMENT box. Once production is the owner's own machine, "off-box" has two candidate referents and nothing in the step says which | — | — |
| S14 | the device outbox becomes one mechanism carrying kinds | **P1.18.** `grep -nE '\bS14\b'` → L1706 and L1707 (P1.18 mints itself after it), L1754, and L1407 where it reverses P1.8b's cut | — | — |
| S15 | photographs live beside the database, not in it | **NONE.** `grep -nE '\bS15\b'` → L396 and L408, both inside the decisions | **Goes with S12's step.** It is a storage answer for a capability that has no step, so it cannot be owned before that one exists | S12's step not existing — and *where beside physically is* is a property of the machine, so P1.2 |
| S16 | the eight per-tenant values are stored by kind | **PARTIAL, and the partial is the finding.** `grep -nE '\bS16\b'` → L413 only. By subject, `grep -niE 'per-tenant\|default_grade\|settings'` → L1665, where P1.16 takes the shop-settings surface as scope — **and does it without naming S16 or S11, and while saying in the same sentence that no step is minted**, so the overlap is by subject and nothing binds the two. **One of the eight is already in the schema and arrived with no step at all** — the shop-wide default grade, at `9ad225e` | **EXTEND P1.16** for shop identity and the surface. **The GRADE MODEL needs its own step**: it replaces a CHECK with a per-tenant table, and `OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "A RAW COUNT INSIDE AN ACCEPTANCE CRITERION ROTS" measures five source sites writing A–D that it opens. **MINTED 2026-08-29 (M6 c2): the grade-model step is now `ROADMAP.md § P1.24 — The per-tenant grade model`; S16 stays PARTIAL, its surface still extends P1.16.** | For the grade model: nothing technical. For the surface: P1.13 on the desktop, or S10's rework on the phone |
| S17 | schema changes are pulled by the feature that needs them | **NONE, and it needs none.** `grep -nE '\bS17\b'` → L424 only; subject search `grep -niE 'pulled by the feature\|schema change'` finds no step naming it | structural — a policy about how schema work is SCHEDULED, not work | — |
| S18 | the client learns the owner role in the same change | **NONE, and it cannot have one of its own.** `grep -nE '\bS18\b'` → L438 only. It is a CONSTRAINT on S9's step rather than a thing to build | **Rides S9's new step.** Scheduling it separately would be scheduling the defect it exists to prevent | whatever blocks S9 |
| S19 | P2.4 and P2.5 stay open until a real shop trades | **P2.4 and P2.5.** `grep -nE '\bS19\b'` → L2837 (P2.4) and L2857 (P2.5). It is a decision NOT to schedule, and it is written at both steps as well as here | — | — |
| S20 | the desktop back office stays an Electron application | **P1.13, established by SUBJECT because no step names the label.** `grep -nE '\bS20\b' ROADMAP.md` → L495 and L502, both inside the decisions, which establishes nothing per the method above. `grep -niE 'electron' ROADMAP.md` → L1953 and L1963, the *What it is* and the DONE WHEN of P1.13, and the only two Electron hits inside any `### P…` section. The three desktop steps that hang off it — P1.14, P1.15, P1.17 — inherit it through their own *Depends on* chains and name no platform themselves | — | — |
| S21 | there is no family-trial step; the pilot waits for all three deliverables | **NONE, and it needs none — it is a REFUSAL TO SCHEDULE, the shape S19 already has.** `grep -nE '\bS21\b' ROADMAP.md` → L495, L540, L551, every one inside the decisions. Subject search `grep -niE 'father\|family trial\|pilot at' ROADMAP.md` → L167 (S1), L225 (S7's own text), L540 and L549 (S21 itself): **not one hit falls inside a `### P…` section**. The step whose clock this protects is P2.1, and S7 already moved it | none needed | — |
| S22 | what identifies a locally created seller across devices — a server-minted reservation, taken while online | **P1.8b, inside `### P1.8`, established by SUBJECT.** `grep -nE '\bS22\b' ROADMAP.md` → L602, L615, L617 (the decision itself) and L720–L735, L762, L791–L801 (this audit), none of which establishes anything per the method above; and **L2682, L2686 and L4169 inside `### P1.18`, where all three are that step saying it does NOT specify the kind** — the shape S7's row already records for P2.4 and P2.5, a step CITING a decision rather than building it. Subject search `grep -niE 'offline seller\|seller code' ROADMAP.md` → L411 (inside S14), L605 and L762 (the decision's own citation and this row — the instrument is inside its corpus and both are excluded by IDENTITY, not by content), **L1945, L1948 and L1985 inside `### P1.8`**, and L2349, L2494, L2531–2, L2673, L3331, L3492 inside `### P1.18`. **P1.8b BUILDS it and this decision WIDENS that step onto the server; P1.18 must CARRY it as a kind** | — | — |
| S23 | mobile's completion bar is a commercial-grade general app | **NONE YET, and the completion sequence in this file assigns it.** `grep -nE '\bS23\b' ROADMAP.md` → the decision's own text and this row, neither establishing ownership per the method above; subject `grep -niE 'commercial-grade\|completion bar'` finds no `### P…` section building it. It is a BAR that widens mobile scope; its surfaces become queue entries under their owning steps per S17, inventoried in the completion sequence this file carries | **NEW ENTRIES under existing steps** — P1.23 for the phone surfaces, the desktop steps for their halves — pulled per S17, not a step of its own | S10's undefined rework for any new phone screen it implies |
| S24 | the owner's dashboard is the superset; the daily screen is a view inside it | **P1.23, behind S10, established by SUBJECT.** `grep -nE '\bS24\b' ROADMAP.md` → the decision's own text and this row; subject `grep -niE 'dashboard'` → the dashboard sub-section in this audit and P1.23 item 4, which now homes it on mobile. `mobile/app/DailyScreen.tsx` exists and becomes a VIEW inside it; the server aggregation by `created_by` is buildable and pulled under S17. **This row SUPERSEDES the "gets no row" note below** | — | — |

**THE TOTALS, so the shape is readable without counting rows.** Eight have a step
— S1 in part, S3, S4, S5, S6, S13, S14, S19. Four need none: S2 is superseded, S7
is a clock, S8 is an ordering rule and S17 is a scheduling policy. **Seven are
outstanding** — S9, S10, S11, S12, S15, S16 in part, and S18 riding S9 — and of
those, three are ANSWERS this file already relies on elsewhere while defining
them nowhere: S10, S12 and S16.

**SUPERSEDED 2026-08-20 BY THE TWO NEW ROWS — every total in the paragraph above
and the count word in the paragraph below are stale, and NONE of those sentences
contains `S20` or `S21`.** The paragraphs are left as written because they were
correct over nineteen rows. **RE-DERIVED FROM THE TABLE, not arithmetic'd from the
two additions:**

- **NINE have a step** — S1 in part, S3, S4, S5, S6, S13, S14, S19, and **S20**.
- **FIVE need none** — S2 superseded, S7 a clock, S8 an ordering rule, S17 a
  scheduling policy, and **S21 a refusal to schedule**. So *THE FOUR STRUCTURAL
  ONES* below is now **FIVE**, and S21 belongs beside S7 rather than beside S19:
  S19 declines to schedule two steps THAT EXIST, S21 declines to create one.
- **SEVEN are outstanding** — unchanged, and that is the point of recording the
  recount rather than the delta. S9, S10, S11, S12, S15, S16 in part, S18 riding
  S9. **Neither new decision added an outstanding step, and neither closed one**,
  so the load-bearing gap is still S10 exactly as the two answers of 2026-08-18
  left it.
- 9 + 5 + 7 = **21**, which equals the row count. That equality is the check; it
  is the same one the range paragraph above makes, and it is why the recount is
  written out rather than asserted.

**SUPERSEDED AGAIN 2026-08-23 BY THE S22 ROW — the recount directly above was
correct over twenty-one rows and is left exactly as written. RE-DERIVED FROM THE
TABLE, not arithmetic'd from the addition:**

- **TEN have a step** — S1 in part, S3, S4, S5, S6, S13, S14, S19, S20, and
  **S22**, whose owner is P1.8b. **That decision GROWS the step that owns it**:
  the reservation is a server route and a relation, and P1.8b's recorded survey
  is five-sevenths device-side. Owned and widened is still owned, so it sits in
  this group and not among the outstanding, and the row says which.
- **FIVE need none** — unchanged. S22 added nothing to that group.
- **SEVEN are outstanding** — unchanged. **S22 neither added an outstanding step
  nor closed one**, so the load-bearing gap is still S10, exactly as the two
  answers of 2026-08-18 and the two decisions of 2026-08-20 left it.
- 10 + 5 + 7 = **22**, which equals the row count. That equality is the check, at
  this size as at the two before it.

**SUPERSEDED AGAIN 2026-08-29 BY THE S23 AND S24 ROWS — the recount directly above
was correct over twenty-two rows and is left exactly as written. RE-DERIVED FROM THE
TABLE, not arithmetic'd from the additions:**

- **ELEVEN have a step** — the ten above and **S24**, whose screen is P1.23 (behind
  S10) and whose aggregation by `created_by` is pulled under S17. Homed-but-deferred
  is still homed, so it sits in this group and the row says which.
- **FIVE need none** — unchanged. Neither addition is structural.
- **EIGHT are outstanding** — the seven above and **S23**, the commercial-grade
  bar: its surfaces have no step yet, and the completion sequence this file carries
  assigns them as queue entries under their owning steps per S17. **The load-bearing
  gap is still S10**, which S23 leans on for every new phone screen it implies. D-C,
  the S6 extension of the same session, added NO row — it is recorded at S6 and owned
  by P1.23 and P1.13 — so it changes none of these three counts.
- 11 + 5 + 8 = **24**, which equals the row count. That equality is the check, at
  this size as at the three before it.

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

**SUPERSEDED 2026-08-29 BY S24 — THE DASHBOARD NOW HAS A ROW.** The paragraph above
was correct on 2026-08-18, when the dashboard's only open question was the owner's:
a new screen, or an extension of the daily one. He took that call on 2026-08-28 —
the dashboard is the SUPERSET and the daily screen a view inside it — and the answer
is substantive enough to mint S24, recorded in
`ROADMAP.md § What the owner has settled` and given its row in the table above.
The dashboard still stands behind S10's rework and is homed on mobile at P1.23; that
part has not changed. What changed is that it is a decision with a row now, not a
THIRD unrowed thing behind S10.

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

**SUPERSEDED 2026-08-29 — THE OWNER TOOK THE CALL.** S24 settles it: the dashboard
is the SUPERSET and `mobile/app/DailyScreen.tsx` becomes a VIEW inside it, not a
peer — a new screen behind S10 that ABSORBS the existing one rather than an
extension of it. The finding's second half — the read path is buildable today, with
no screen and no rework — is untouched; what changes is only that the
new-screen-versus-extension question is no longer open.

**AND BUILDING IT EARLY REPRODUCES THE PATTERN `9ad225e` HAS JUST PRODUCED — a
capability finished on the server that no human can reach.** That instance is
recorded at
`archive/PROJECT_STATUS_through_2026_08_28_f7ab2e0.md` "A SHOP-WIDE DEFAULT GRADE IS BUILT, PROVEN, AND UNREACHABLE"
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
at `archive/PROJECT_STATUS_through_2026_08_28_f7ab2e0.md § What the rebuild cost — stated, not glossed` "Also gone:
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

**CORRECTED 2026-08-20 — TWENTY-TWO, and the figure had already rotted before
this phase touched it.** `grep -oE '^### P1\.[0-9]+' ROADMAP.md` returns one
heading per step: it read EIGHTEEN the moment P1.18 was minted on 2026-08-17
against a sentence saying seventeen, and this phase's four take it to twenty-two.
**The bar itself is unchanged** — only the count of steps standing before it moved.
**Nothing announced the first rot and nothing would have announced the second:**
the sentence contains no step label, so a sweep for `P1.18` or for `P1.19` runs
clean over it, which is why it is corrected by a sweep for the COUNT WORD instead.
The figure is left as a word rather than replaced with a mechanism because this set
is enumerated immediately below it, where a reader adding a twenty-third is looking
at the list rather than at a bare digit.

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

**P1.8b's SERVER AND MOBILE HALVES HAVE LANDED — 2026-08-25. THE SURFACES HAVE
NOT, AND ONE FUNCTION IS DELIBERATELY LEFT WITH NO CALLER.** The server half is at
`a60aef5` and `b8b557f`; the mobile half is at `8d979f2` (storage and the device
identity) and `1d7f638` (the `seller_create` kind, its handler and registry entry,
and the refill client).

**`refillOnce` IS BUILT, PROVEN, AND CALLED BY NOTHING — a deliberate stop, not an
oversight, and it is recorded here because an unwired function with a green proof
is exactly what a later reader takes for finished.** `mobile/src/sync/sellerRefill.ts`
at `1d7f638` exports it; a tree-wide search for a call site outside its own proof
returns none.

**WHY IT WAS NOT WIRED INTO THE SYNC TICK.** The refill mints REAL reserved codes
against the shop's own code space, and nothing on the device can yet spend one —
no screen writes `local_sellers` — nor show the reserve level the codes produce.
Wiring it now would have every handset consume a block of the shop's seller-code
sequence, on every device, for a capability nobody can use, leaving permanent gaps
in a sequence that prints on slips this system never sees again. **Nothing
re-issues a reservation, so that burn is not recoverable.**

**WHICH PHASE OWNS THE CALL SITE: the SURFACES phase, the same one that owns the
sentence derived from the level.** The two belong together — a refill with no way
to see its result is a request whose only observable is in the phase after — and
that phase is also where `EVERY-SURFACE-SEES-A-KIND-THAT-IS-NOT-A-BILL` is met.

**P1.8b's DONE WHEN — MINTED 2026-08-27 (B1), because the split of 2026-08-17
left P1.8b a status and no criterion** (`OPEN_ITEMS.md § Decisions open` "P1.8b HAS NO DONE WHEN").
P1.8a closed the one DONE WHEN above as written, and it says nothing about
offline; three phases of offline work then landed against nothing that could say
when they were finished. This ends that. **P1.8b is DONE when every criterion in
the seller-kind set below — `THE SELLER-KIND CRITERIA, DERIVED FROM THE DESIGN
ABOVE` — passes at its stated cost.** The SET is the SOURCE and no count is
written here. Re-derived at B1 from the three landed phases' own enumerations,
the outstanding work is partitioned by what each piece waits on:

- **Waits on the UX rework (P1.23):** `THE-RESERVE-LEVEL-IS-REQUIRED-AND-EVERY-VALUE-HAS-ITS-OWN-SENTENCE`
  in full, and `THE-LOCAL-ROW-SURVIVES-A-REFRESH-THAT-DELETES` cells 3 and 4 —
  the reserve sentences and the picker union, which are the drawing S10 defers.
  **CELL 4 NO LONGER WAITS ON A DECISION:** the settle-to-refresh repair is
  settled (finding below, 2026-08-27) — the sender swaps the local seller id for
  the server id at send — so the picker may quote a seller mid-settle without a
  422 ever reaching a terminal bill.
  **SUPERSEDED 2026-08-27 (P1.23 c3):** `THE-LOCAL-ROW-SURVIVES-A-REFRESH-THAT-DELETES`
  cells 3 and 4 — THE PICKER UNION — are BUILT and proven headless
  (`prove:pickerseller`: the union cells, plus the send-time resolver reached from
  both `bill_send.owed()` and `.recover()`). Cell 4's send-time repair is the
  branded `ResolvedSellerId` path in `mobile/src/sync/resolveParkedSeller.ts`.
  What still waits on the rework is `THE-RESERVE-LEVEL-…` alone — the four
  sentences, the next commit. NOT PINNED TO A SHA — it ships in the c3 commit.
  **SUPERSEDED 2026-08-28 (P1.23 c4): `THE-RESERVE-LEVEL-…` IS BUILT.** The four
  values each carry their own sentence, the tone is derived from the level by one
  question — does this state need a person now — yielding none, none, red, red
  (no amber), and the compile cell holds: all in
  `mobile/src/master/reserveNotice.ts`, proven headless by `prove:reservenotice`.
  The criterion is HEADLESS and CLOSES. **What is NOT built, and is owed with the
  next unit, is the CONTINUOUS on-screen display:** `reserveSurface` needs the
  device's `target`, which arrives only in a refill answer `refillOnce` discards
  today, and `refillOnce`'s call site is out of this legibility layer's bounds —
  so the strip that shows the level continuously is wired alongside offline
  creation, the sixth item below. Both this item's criteria are now met; what
  remains for it is that sixth item's wiring. NOT PINNED TO A SHA.
  **SUPERSEDED 2026-08-28 (reserve strip, commit 2): THE CONTINUOUS DISPLAY IS
  BUILT, AND THIS ITEM CLOSES.** `topUpReservations` (`engine.ts`) now CAPTURES
  `refillOnce`'s answer — the imprecise "`refillOnce` discards" above should read
  "`topUpReservations` discards"; `refillOnce` always returned it — and persists
  the shop's `target` to a one-row `local_reserve` table. `mobile/app/ReserveStrip.tsx`
  renders `mobile/src/master/reserveStrip.ts` as a third always-on strip, showing
  `low`/`exhausted`/`never_provisioned` and suppressing the calm `ample` (the
  MasterDataStrip pattern). A STALE or clock-suspect target is never presented as a
  sufficiency claim — past a 12h cutoff (its own constant) or a backwards-clock
  stamp it shows the count instead of `ample`
  (`lessons/cached-master-data-is-a-price-claim.md`), and `never_provisioned` shows
  NO NUMBER (`fallback-default-is-a-wrong-number`). Proven headless by
  `prove:reservestrip`: the four states, both disproofs named, and an integration
  cell driving a real `SyncEngine.runOnce` — the refill call site NO proof had ever
  driven, the seam the commit-1 confusion lived in. NOT PINNED TO A SHA — ships in
  commit 2.
- **Waits on a handset device pass:** `EVERY-SURFACE-SEES-A-KIND-THAT-IS-NOT-A-BILL`
  parts 2 and 3 — the sheet and the strip read on a phone and reported verbatim
  in Thai, under the bundle and server attestations
  `CLAUDE.md § Boot check` "WHICH BUNDLE THE HANDSET IS RUNNING" requires.
- **Waits on a scratch-database server pass:** `THE-TOKEN-IS-ON-THE-WIRE` cell 2,
  and `A-BILL-BEHIND-AN-UNCREATED-SELLER-IS-NEVER-OFFERED` cell 6's server half —
  a released bill reaching a real `POST /bills` with the `doc_no_counters` row
  MOVING, staged once on scratch because each run burns reserved code space
  permanently.
- **A FIFTH ITEM, AND IT IS NOT ONE OF THE SELLER-KIND CRITERIA:** a startup
  sweep that recovers a bill parked behind an already-settled seller — the crash
  window (finding below, 2026-08-27: a sweep is owed). It is DESIGN-authorised
  here and BUILT later; its shape is
  `lessons/README.md § Lessons` "sync-state-needs-startup-recovery.md". It is
  owed before P1.8b closes.
  **SUPERSEDED 2026-08-27 (P1.23 c3): BUILT.** The sweep is the SAME
  `resolveParkedBehindSettled` finding 1's send path uses, reached at boot through
  `bill_send`'s `recover` — one function, two entry points, not a second
  mechanism watching for the settle. `prove:pickerseller` R3 drives it and R4 is
  its negative. NOT PINNED TO A SHA — it ships in the c3 commit.
- **A SIXTH ITEM, ADDED 2026-08-27 (P1.23 c3), AND ALSO NOT ONE OF THE
  SELLER-KIND CRITERIA: OFFLINE SELLER CREATION IS NOT WIRED.** The picker now
  OFFERS the local rows (c3), but no screen CREATES one — the add-seller sheet
  still writes through the online `SellerApi` — so `local_sellers` is empty on the
  running build and the union is the cache alone. **P1.8b's DEVICE closure — a
  walk-in created OFFLINE, weighed, and synced — cannot happen until creation is
  wired**, so this is owed before P1.8b closes even though every headless
  criterion is met and `prove:pickerseller` is green. It is owed by a LATER P1.23
  commit — the offline add-seller surface, which routes the sheet to
  `createLocalSeller` when the device is offline, and on whose flow the
  reserve-level sentences (the next commit) render. NOT PINNED TO A SHA.
  **SUPERSEDED 2026-08-28 (offline-creation wiring): BUILT, AND LOCAL-FIRST
  ALWAYS RATHER THAN "WHEN OFFLINE".** The add-seller sheet writes a
  `local_sellers` row and binds a reserved code on EVERY create (`App.tsx`
  `createSeller` → `SqliteLocalSellerStore.createLocalSeller`), then kicks a pass
  so the `seller_create` outbox drains it — immediately when online. This is hard
  rule 8 and the ONE mechanism S14 asks for: the online `SellerApi` direct path is
  REMOVED, not run beside it (`master/createSeller.ts`, `sellerCreateNotice.ts`
  and their two proofs deleted; P1.8a's live-server proof retired with the mint
  path it proved). The exhaustion branch is real — no spendable code refuses BY
  CAUSE with c4's `exhausted`/`never_provisioned` wording
  (`master/localSellerCreateNotice.ts`, proven headless by
  `prove:localsellercreate`) — and the created local seller flows through the c3
  send-time resolution `prove:pickerseller` already proves. WHAT REMAINS for
  P1.8b: the continuous reserve strip (this phase's commit 2), the handset device
  pass, and the scratch-DB server pass. NOT PINNED TO A SHA — ships in this commit.
- **Already met and not re-opened:** every other criterion in the set, at its
  own recorded entry — the headless criteria proven twice at P1.8b MOBILE and
  GATES, the server criteria proven on a scratch database at P1.8b SERVER.

When all of these are green at their stated cost, P1.8b is DONE. **NOT PINNED TO
A SHA:** this block ships in the B1 commit, so HEAD names the commit that does
not contain it; the date stands, anchor it in a later pass
(`CLAUDE.md § Conventions` "PIN A CLAIM TO A COMMIT").

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

---

#### THE SELLER KIND — the design, and what the reservation actually buys

**P-SELLERKIND-DESIGN, 2026-08-23. THIS DECIDES; IT BUILDS NOTHING AND IT WRITES
NO CRITERIA.** The criteria come from this document in the next step and not
here, because the outbox step wrote criteria ahead of its own design and had to
rebuild them twice — both rebuilds are recorded as supersessions at that step —
and a criterion written before the thing it measures exists is a criterion nobody
can perform.

**NO STATEMENT SEQUENCE IS PRINTED BELOW, AND THAT IS A CONSTRAINT RATHER THAN A
STYLE.** Types and member contracts are stated; policy values are stated;
dynamics are stated as RULES, each with the observable that turns red when the
rule is broken. Three drafts of the outbox design printed a drain, every
mechanism defect either review found lived inside the printed block, and the
repair of that block arrived carrying three new printed ones.

**WHAT WAS RE-DERIVED BEFORE ANY OF THIS WAS DECIDED, because the decision record
written the same day is a clue and not a source.**

- **`OutboxKind` has TWO members** — `mobile/src/sync/outbox.ts` declares
  `"bill_send" | "bill_void"`. A third member is a compile error in
  `OutboxRow`, in `OutboxResult`, and in the one registry literal typed by the
  mapped `OutboxRegistry`, until a handler exists; `OutboxHandler` has fourteen
  members and `OutboxDisposition` six.
- **NO SELLER-SHAPED OUTBOX TYPE SURVIVES IN THE TREE.** Searched
  `mobile/src/`, `mobile/app/` and `mobile/App.tsx` for `LocalOutboxSeller`,
  `OutboxSeller` and `seller_create`: **one hit, and it is the doc comment in
  `outbox.ts` explaining the removal** — controlled in the same pass against
  `bill_void`, which returns hits at exit 0. **The queue entry that quotes
  `LocalOutboxSeller.code` was CORRECT AT THE SHA IT NAMES** — `e6249f6` holds
  it, two hits — and `47d17ab` (2026-08-19) deleted it. That quotation is a
  correctly-pinned historical record which the tree has since overtaken, not a
  description of anything present.
- **`POST /sellers` REFUSES A CLIENT-MINTED ID.** `SellerCreate` sets
  `extra="forbid"` and declares no `id`; `sellers.id` carries
  `DEFAULT gen_random_uuid()`. `code` is OPTIONAL: supplied means one attempt and
  a collision is the caller's 409 `duplicate_code`; absent means the server mints
  one by generate-then-retry and answers 409 `code_assignment_failed` on
  exhaustion.
- **`sellers`, READ FORWARD THROUGH THE MIGRATION STACK WITH EVERY DROP APPLIED —
  and that is a read of a LOG, not a query of the head state.** `0001` creates
  `id, tenant_id, code, name, phone` with `uq_sellers_tenant_id` and
  `uq_sellers_tenant_code`; `0003` adds `grade` with `ck_sellers_grade`; `0004`
  adds `is_active` and `id_number, address, vehicle_no`; `0011` adds `created_by`
  with `fk_sellers_created_by`. **There is no idempotency key on this table and
  no reservation relation anywhere in the stack.**
- **THIS DEVICE HAS NO PERSISTENT IDENTITY.** `mobile/app/ids.ts` is a UUID
  GENERATOR (`newId()`), not an identity; `local_identity` holds `tenant_id`,
  `user_id`, `updated_at` and nothing else; a tree-wide search for `device_id`,
  `deviceId`, `installation_id` and `device_uuid` returns that generator and its
  four call sites and nothing else.
- **NEITHER ARCHITECTURE NOR A HARD RULE MOVES.** `ARCHITECTURE.md` mentions
  `sellers` at four lines — the domain sentence, the table inventory, the
  composite-FK argument and a bill's column list — and none of them says who mints
  a seller id or that master data is created online. Hard rule 3 is about BILL
  ids and is untouched; hard rule 4 is about bill creates and is EXTENDED in
  spirit rather than changed; hard rule 5 is honoured by a local row that is never
  deleted; hard rule 8 is what this whole step is for.

---

#### What holds a reserved code, and who the holder is

**DECISION. A server relation, `seller_code_reservations`, keyed
`PRIMARY KEY (tenant_id, code)`, with `UNIQUE (tenant_id, token)` beside it.**
The thing being reserved IS the code, and the invariant the whole design rests on
is *one holder per code per tenant*, so the code is the key and nothing else is.
It carries the holder, an opaque server-generated `token`, the state, the issuing
timestamp and user, and — once spent — the `seller_id` it produced.

**THE HOLDER IS A DEVICE. Not a tenant, and not a user.**

- **Not a TENANT.** A tenant-scoped pool is two handsets in one shop drawing from
  one set of codes, which is the defect the owner's decision was taken to remove,
  written down as a schema.
- **Not a USER.** The codes physically live in ONE device's SQLite. A person signs
  out on handset A and in on handset B and the codes do not travel; the server
  would believe B holds what A is carrying. S5 makes accounts per person and
  phones personal, and that still does not make user and device the same object —
  a reinstall, a spare handset passed round at a busy weighbridge, and one person
  signed in twice all break it, in both directions.

**SO P1.8b MUST MINT A DEVICE IDENTITY, AND THE TREE HAS NONE.** Decision: a v4
uuid minted once and stored in SQLite, never in the keystore. The keystore is
wrong for a measured reason and not a preference — `schema.ts` records at
`local_identity` that a sign-out DELETES the keystore entry, and reserved codes
must outlive a sign-out because the device is still holding them.

> **RULE.** A code appears at most once in this relation, for ever.
> **RED WHEN BROKEN:** issuing the same `(tenant_id, code)` twice is refused by
> the primary key, and a proof that asks for it must observe the refusal rather
> than a second row.

---

#### The states a reservation can be in, and every transition between them

**DECISION. TWO states, `held` and `spent`, and exactly one transition.**

- `held` — issued to a device, not yet used.
- `spent` — a seller row exists that this reservation produced; `seller_id` is
  non-null.
- `held → spent` happens ONLY inside the same transaction as the
  `INSERT INTO sellers`. There is no other writer and no other order.
- `spent → anything` is forbidden. A spent reservation records that a real row
  exists, which is hard rule 5's shape one table over.

**A THIRD STATE WAS CONSIDERED AND REJECTED, and the rejection is the load-bearing
part.** A `void`/reclaimed state would let a shop withdraw codes from a handset
that was lost. It buys nothing, because nothing is ever re-issued (below), and it
costs a transition that can race a use: a device that has been offline for a week
would spend a code the shop had withdrawn, and every answer to that race is worse
than not having the race. **Two states have one transition; three states have
four, and three of them exist only to be got wrong.**

> **RULE.** Nothing outside the seller INSERT may write `spent`.
> **RED WHEN BROKEN:** a reservation observed `spent` with a null `seller_id`, or
> a `sellers` row whose code is reserved and whose reservation is still `held`.

---

#### How a device obtains codes, and what happens to one it never uses

**DECISION. One server route, online only by construction, which issues N codes
in one transaction and returns each with its token.** It takes the same gate as
`POST /sellers` — staff may call it, because a yard that cannot obtain codes
cannot buy a load, which is D1's argument unchanged.

**DECISION. AN UNUSED RESERVED CODE LEAKS FOR EVER. There is no reclaim, and
there is no re-issue.** This is the sharpest decision in the document and it is
taken deliberately against the tidier alternative: **re-issuing a code to a second
holder recreates the original defect exactly** — a device holding a stale
reservation drains days later, collides with a row it did not create, and settles
onto another person's seller. Every reclaim scheme has to defeat that race and
none of them can defeat a handset that is simply switched off.

**WHAT IT COSTS, STATED RATHER THAN GLOSSED:** gaps in the human-readable code
sequence. A shop whose phone is lost holding twenty codes has twenty gaps, and
those gaps are visible on the neighbours of a printed slip and nowhere else.
**A gap in a sequence is not a defect; a wrong seller on a cash purchase is.**

**AND THE RACE THE BRIEF ASKS ABOUT DOES NOT EXIST**, which is the answer rather
than a dodge: with nothing re-issued there is no second holder for a late use to
collide with, so no lock, no lease expiry and no clock is required anywhere in
this mechanism. That matters more than it looks — a lease expiry would be a
stored future instant, and this repository already has a lesson about what a
device clock does to one.

---

#### The three policy values the owner's decision left open

**5 — HOW MANY CODES A DEVICE HOLDS. DECISION: a TARGET HOLDING, per tenant, read
from the tenant row and never a constant.** S16 puts a per-tenant value in a
column of its own with its own CHECK rather than in a settings bag, and S17 says
the column arrives with the feature that needs it, so it is a
`tenants` column added by P1.8b's own migration with a floor of 1.

**THE DEFAULT VALUE IS THE ONE NUMBER IN THIS DESIGN THAT NO MEASUREMENT
SUPPORTS, AND IT IS LABELLED AS SUCH RATHER THAN ARGUED.** The right target is a
function of the walk-in rate and the longest offline stretch, and this repository
measures neither. A starting value of **20** is proposed on the grounds that it is
a day's walk-ins at a yard busy enough to matter and small enough that the gaps
from a lost handset are unremarkable — **that is an assumption, not a
measurement.** The column is what makes it changeable without a release, and the
value belongs in this file's tuned-constants ledger the day it lands, not before.

**6 — WHAT TRIGGERS A REFILL. DECISION: every sync pass, while online, tops the
holding back up to the target.** Not a low-water threshold, which would be a
second unmeasured constant; not on exhaustion, which is too late by definition.

**AND A REFILL IS NOT OUTBOX WORK.** The outbox carries what the device OWES the
server; a refill is what the device WANTS from it. Making it a kind would put a
failed refill into the owed counts, where it would refuse a sign-out and colour
the strip over work nobody is waiting for.

**IF THE REFILL FAILS, NOTHING ELSE IS AFFECTED.** It is an ordinary network
failure: bills and voids drain as they always did, the holding simply does not
grow, and the only thing that changes is the reserve level the wording below is
derived from.

> **RULE.** A refill failure never blocks, parks or fails any other unit of work.
> **RED WHEN BROKEN:** with the refill route refused and the send route working, a
> queued bill still reaches the server in the same pass, and the sign-out gate's
> owed counts do not move.

**AMENDED (P-SELLERKIND-DESIGN-AMEND, 2026-08-24) — WHAT IDENTIFIES A REFILL, AND
WHAT THE SERVER ANSWERS TO A REPEAT. Policy 6 above is UNCHANGED — every sync pass,
while online, still asks — and what is decided here is the ROUTE, which had no
answer for a request it has already served.**

**THE HOLE, STATED AS THE TWO SENTENCES THAT ARE EACH TRUE AND JOINTLY FALSE.** *An
unused reserved code leaks for ever* and *if the refill fails, nothing else is
affected* are both true OF THE DEVICE and both false OF THE CODE SPACE. A refill
whose response is lost after the server committed leaves the device's shortfall
unchanged, so the next pass asks again and the server mints again; nothing is
reclaimed, and no number anywhere prints that it moved. Hard rule 4 already carries
the shape — a repeated request is *already created*, never a new one — and this
route did not have it.

**DECISION. THE ROUTE IS A TOP-UP TO A TARGET, NOT AN ISSUE OF N, AND IT IS
IDENTIFIED BY THE DEVICE RATHER THAN BY ANYTHING ON THE WIRE.** This supersedes the
words *issues N codes* in *How a device obtains codes, and what happens to one it
never uses* above; the single transaction, the online-only construction and the gate
are untouched.

- **WHAT IDENTIFIES A REFILL REQUEST: `(tenant_id, device identity)`.** No request
  id, no idempotency key, no quantity. **The thing being asked for is a LEVEL and
  not an EVENT**, and a level is idempotent by construction: *make this device hold
  its target*, asked twice, is the same sentence as asked once. A key would make a
  repeated ISSUE recognisable; making it a top-up means there is no issue to repeat.
- **WHAT THE SERVER MINTS: the shortfall IT computes** — the tenant's target holding
  minus the reservations currently `held` by this device — and never a number the
  caller supplied. A quantity on the wire is a field the server must either trust,
  which is the leak, or ignore, which is a field nothing reads.
- **WHAT IT ANSWERS, AND THIS IS THE LOAD-BEARING HALF: everything the device
  currently holds, never only what was just minted**, together with the target the
  level is measured against. A repeat after a lost response finds the holding already
  at target, mints ZERO, and hands back the same set — so a device that lost the
  answer is repaired from the server's own view instead of asking for ever.

**AND THE OTHER HALF IS THE ONE THAT LOOKS TIDIER AND DEADLOCKS.** A route that
returns only the newly minted block answers a repeat with an EMPTY set: the server
has already topped this device up, so it mints nothing and says nothing, the device's
own holding never grows, it asks again every pass for ever, and a full block sits
`held` in its name that no reclaim will ever return. **One route, two opposite
failures** — mint-again burns the code space, return-nothing strands the device — and
only *return what it holds* is safe against both.

> **RULE.** A refill is a top-up to target identified by the device, and its answer
> is the device's whole current holding.
> **RED WHEN BROKEN:** with the FIRST refill's response discarded before the device
> reads it, the second pass mints ZERO new reservations — read as the relation's row
> count for that tenant, unchanged from after the first pass — AND the device's
> holding equals the target afterwards. Both readings are required: the count alone
> is satisfied by a route that answers nothing, and the holding alone by a route that
> mints a second block.

**WHAT THIS DOES NOT DO.** It reclaims nothing. A code issued to a device that never
comes back still leaks for ever, which is the no-reclaim decision above and is
untouched. What it removes is the SILENT, REPEATED burn: one lost response now costs
a lookup instead of a block, and every pass after it costs the same lookup. **And it
bounds ONE identity, not the number of identities** — a caller minting reservations
under device identities it invents is unaffected, and that finding stands exactly as
recorded below.

---

#### What the yard is told when the reserve runs low, and when it is gone

**THIS IS THE QUESTION THE WHOLE DECISION TURNS ON, and the honest answer has two
halves that point in different directions.**

**DECISION. The reserve level is a DEVICE-GLOBAL STATE with FOUR values, and it is
a REQUIRED input to the wording — never optional with a default.** A default would
leave every existing call site compiling clean while rendering the wrong sentence,
which is the same defect wearing a parameter; making it required turns every call
site into a compile error until somebody writes its sentence, which is how the
sweep is known to be complete rather than remembered.

| value | what is true | tone |
|---|---|---|
| `ample` | the device can create walk-ins offline | none |
| `low` | it still can, and the holding is below target | amber |
| `exhausted` | **it cannot.** No offline walk-in is possible on this device | red |
| `never_provisioned` | it has never reached the server, so it holds nothing | red |

**`never_provisioned` IS NOT `exhausted`, AND COLLAPSING THEM WOULD SHIP A FALSE
SENTENCE.** A device fresh out of the box has spent nothing; telling its operator
they have used up their codes is a confident lie about something they never did.
The instruction differs too — one is *connect once to get started*, the other is
*you have used them all*.

**THE WORDING OBLIGATIONS, and the screen is NOT drawn here.** S10 defers the
DRAWING and not the rule; what follows is the rule, and the sentences themselves
are written where the existing wording functions live, in the step that builds
them.

- **Derived from the cause, never hardcoded to the common one.** Four values,
  four sentences, and the mapping is pure and takes the level alone so a
  diagnostic cannot be passed in even by accident.
- **Never promise what the system cannot perform, and a WAIT is a promise.**
  `exhausted` must NOT say *wait and it will sort itself out*: waiting fixes it
  only if the device reaches the network, and if it does not, the sentence has
  asked for patience toward a condition that cannot arrive.
- **Name what the system CAN still do, because the exit is usually on another
  screen.** With the reserve gone, a seller can still be created from the counter
  while online, and a bill can still be weighed against a seller who already
  exists. What the sentence must NOT offer is picking a different seller for this
  load — that is a wrong seller on a cash purchase, which is the harm the whole
  step exists to prevent.
- **`low` is amber and `exhausted` is red**, on this repository's existing
  division: red is for something that needs a human now.
- **Asserted NEGATIVELY over the concatenation in draw order**, with a presence
  sibling, because an absence assertion over an empty string is satisfied by
  silence.

**AND NOW THE HALF THAT IS NOT COMFORTABLE. THE DESIGN MAKES EXHAUSTION LEGIBLE.
IT CANNOT, ON ANY EVIDENCE THIS REPOSITORY HOLDS, MAKE IT RARE.**

- **LEGIBLE: yes, and strictly better than what it replaces.** The level is known
  on the device at all times with no network call, so it can be shown CONTINUOUSLY
  — before the operator needs a code, not at the moment they are refused. Under
  device-minted codes there was nothing to run out of and therefore no signal at
  all; there was instead a silent wrong-seller binding, which is worse in kind.
- **RARE: not established, and nothing here can establish it.** Rarity is a
  function of the target holding and the longest offline stretch. The first has no
  measurement behind it and the second is not measured anywhere in this
  repository. **So the residual the owner accepted when he took this decision
  stands exactly as it was recorded: the failure P1.8b exists to remove is
  RELOCATED to the moment a handset runs out, not eliminated.** The only thing
  that will settle the target is a shop trading, which S7 places after all three
  deliverables exist.

**AMENDED (P-SELLERKIND-DESIGN-AMEND, 2026-08-24) — A PERMANENTLY REFUSED CREATE,
AND WHAT THE RESERVE LEVEL ACTUALLY COUNTS.**

A create refused **422** on the payload's own merits — a name the edge rejects —
leaves a local seller that is terminal and a code attached to nothing. The states
are `held` and `spent` with one transition, and there is no state for it.

**THE SERVER HALF IS ALREADY ANSWERED BY THE DESIGN'S OWN STATE MACHINE, which is
why this is a smaller decision than the gap looks.** `held → spent` happens ONLY
inside the same transaction as the `INSERT INTO sellers`. A create refused on its
payload inserts nothing, so nothing was spent: the reservation is still `held`,
still this device's, and the code is in no `sellers` row. **The gap was never about
the reservation. It is about what the DEVICE does with a code it has stopped
needing, and that is the half nothing states.**

**DECISION. THE CODE GOES BACK INTO THE DEVICE'S SPENDABLE HOLDING — neither kept
bound to the dead row nor dropped.** Both answers the gap offered cost something
this one does not: keeping it bound makes the reserve level over-count what the yard
can actually do, and dropping it leaves the device one short against a server that
still counts the code as `held`, so the top-up decided above computes a shortfall of
zero and the device never gets it back.

**WHY IT IS SAFE, AS A PROPERTY AND NOT AS A REASSURANCE.** A 422 the device READ is
a definitive refusal on the payload's merits, so no `sellers` row carries that code;
the reservation is unspent and belongs to this device; and the two server decisions
below mean nothing else can take it — a supplied reserved code is refused, and a
minted one is derived above the whole relation. **A LOST 422 IS NOT A 422:** an
unknown outcome is UNAVAILABLE, the row stays owed and is retried with the SAME code
and the SAME token, and nothing is returned to the pool
(`lessons/README.md § Lessons` "unavailable-is-not-rejected.md — applies to every sync/retry path").
Only a refusal the device actually read returns anything.

**SO WHAT THE RESERVE LEVEL COUNTS, said once and derived nowhere else: codes this
device holds that are not bound to a create that has SETTLED or is IN FLIGHT.** It is
a count of what the yard can still DO and never of what the server has issued. A code
on a terminally refused create is spendable and is counted; a code on a settled
create is not; a code on a create in flight is not, because the device does not yet
know whether it was spent. **The device's count and the server's `held` count
therefore differ by exactly the creates in flight, transiently and by construction**
— which is the state the tone decision immediately below is about.

> **RULE.** A create refused on the payload's own merits returns its code to the
> device's holding, and neither end of the reservation moves.
> **RED WHEN BROKEN:** a device at target with one create refused 422 shows an
> unchanged reserve level and asks for nothing new on the next pass — **with the
> presence sibling in the same run: the same device with one create SETTLED is one
> below target and is topped up by one.** A level that never moves and a level that
> moves for the wrong event print the same digit on the refused case alone.

**AMENDED (P1.8b MOBILE, 2026-08-25) — ONE CLAUSE: WHAT THE COUNT IS TAKEN OVER.
THE SENTENCE ABOVE IS KEPT AND IS NOT REWRITTEN, because it was written to answer
what happens to a REFUSED create's code and it answers that correctly. What is
superseded is only its PREDICATE — the words *not bound to a create that has
SETTLED or is IN FLIGHT* — and nothing else in this subsection moves: what the
level is a count OF, that a terminally refused create's code is spendable, that a
settled one's is not, that an in-flight one's is not, and that the device's count
and the server's `held` count differ by exactly the creates in flight all stand.**

**WHY THE CLAUSE IS WRONG, AND IT IS NOT A WORDING PREFERENCE.** Read literally,
the predicate enumerates the states that DISQUALIFY a code as *settled* and *in
flight* — so a code bound to a create that is merely OWED qualifies as spendable.
That create has not settled and is not in flight; it is sitting in the queue
waiting for a network. **The next create would then pick the same code, and one
reserved code would produce TWO local sellers** — a wrong seller on a cash
purchase, which is the precise harm this whole step exists to remove, reachable
from the document the implementation reads.

**DECISION. THE COUNT IS TAKEN OVER CODES BOUND TO NOTHING — one predicate, and
the binding is what carries the state.** A code is bound when a local seller
spends it and unbound by a WRITE when that create goes terminal, which is what
this subsection's own decision already asks for (*the code goes back into the
device's spendable holding*). The three cases the sentence above enumerates then
fall out with no case analysis at all: a settled create's code stays bound, an
in-flight create's stays bound, an owed create's stays bound, and a terminally
refused create's is unbound at the moment of refusal.

**AND THE REASON IT IS ONE PREDICATE RATHER THAN A TIDIER LIST is the failure
mode of a list.** A predicate that enumerates disqualifying states is wrong the
moment a state is added and nobody revisits it; the omission is silent, and its
symptom is two sellers on one code rather than an error. A predicate that asks
only *is this bound to anything* cannot acquire that hole, because a new state is
still a binding.

**MEASURED, at `1d7f638`.** `mobile/src/adapters/sqlite/SqliteLocalSellerStore.ts`
implements the count as `spent_on IS NULL` and states this derivation at the
statement; `schema.ts` states it at `local_seller_codes`; and
`mobile/src/proof/proveSellerStore.ts` S7 drives all four transitions in one run —
a refusal returns the code, a 409 does not, a settle does not, and an unknown
outcome does not.

**WHAT IS NOT DECIDED HERE.** The residual immediately below — a bill parked
behind a create that is permanently refused, whose seller will never settle — is
untouched by this amendment and remains open exactly as recorded.

**AND THE RESIDUAL THIS DECISION CREATES IS ABOUT MONEY AND IS NOT ANSWERED HERE.** A
bill weighed against a local seller whose create is then permanently refused is
parked, and the design releases a park by that seller SETTLING and by nothing else.
That seller will never settle. **So the bill is parked for ever, for cash already
paid, on a row hard rule 5 forbids deleting** — the harm the park exists to prevent,
arriving from the one direction the park does not cover. Whether the repair is the
operator correcting the SAME local row so the existing settle still fires, or a
second release event, is a decision with a screen behind it and this amendment does
not take it. **It is owed BEFORE the build and not after, because nothing measures
it:** searched the criteria set below for `422` and every hit is the BILL's 422 —
**not found with these words** — so no criterion stages a permanently refused seller
create, and nothing would go red.

**AMENDED (P-SELLERKIND-DESIGN-AMEND, 2026-08-24) — `low` IS THE NORMAL STATE OF A
WORKING DEVICE, AND THE TONE IS THE PART THAT WAS WRONG.**

The values are defined against the target and the refill tops up every pass, so an
online device that has just created one walk-in is below target until its next pass:
`low`, in amber, over a condition that needs nobody and clears itself. The table
above assigns that amber BY HAND, one value at a time.

**DECISION. TONE IS DERIVED FROM THE LEVEL BY ONE QUESTION — *does this state
require a person to do something now?* — and is never written per value.** It is the
rule the wording already works under, applied to the colour: a total mapping taking
the level alone, so a fifth level cannot arrive without a tone and no tone can be
chosen for a reason the level does not carry.

**ON THAT RULE THERE IS NO AMBER IN THIS MECHANISM.** `ample` no. `low` no — the next
pass restores it and there is nothing a person can do that helps. `exhausted` yes.
`never_provisioned` yes. **This supersedes the table's `low`/amber cell and the
bullet reading `low` is amber and `exhausted` is red**: the four tones are none,
none, red, red.

**AND THE ARGUMENT IS NOT TIDINESS.** An amber that fires on the ordinary completion
of the ordinary task is not a weaker red; it is a red whose reader is being trained
to ignore it, and the state that will not be seen is the next one that needs them.

**WHAT REPLACES THE WARNING IS A NUMBER AND NOT A COLOUR.** `low` keeps its value,
its definition and its own sentence, and that sentence names how many codes remain —
derived from the holding the device already has. The design's legibility claim rests
on the level being SHOWN continuously rather than at the moment somebody is refused,
and that is untouched: all four states are shown, and two of them no longer shout.

**WHAT DOES NOT CHANGE, so the amendment is not read as wider than it is.** The four
VALUES and their definitions; `never_provisioned` staying distinct from `exhausted`;
the level being a REQUIRED input with no default; and the level being derived from
the HOLDING and never from the last refill's outcome. This moves the tone and nothing
else.

> **RULE.** Tone is a total mapping from the level alone, and no level that clears
> itself without a person carries a warning tone.
> **RED WHEN BROKEN:** rendered over each of the four levels in one run, `exhausted`
> and `never_provisioned` carry the red tone and `ample` and `low` carry none — **with
> the presence sibling that each render still carries its own sentence**, because a
> mapping that returns no tone for anything satisfies the two negatives on its own.

**AND THE RESIDUAL, BECAUSE REMOVING THE AMBER REMOVES THE ONLY EARLY WARNING THERE
WAS.** A device holding one code of twenty and a device holding nineteen are both
`low` and both quiet. The state that would earn an amber is *few enough that the next
offline stretch exhausts it*, and neither term is measurable here; a floor on the
holding would be a second unmeasured constant, which is what this design refused for
the refill trigger and refused for this reason. **None is introduced.** What settles
it is a shop trading, which is where the target holding already waits.

---

#### The kind as a registry member — row, outcome, ordering, retry

**DECISION. The member is named `seller_create`** — the name the union carried
before it was removed and the name the removal paragraph uses, so it returns under
its own name rather than acquiring a second one.

**ROW.** A LOCAL SELLER DESCRIPTOR of its own — the local row id, the reserved
code, the reservation token, the seller fields, the creating identity, and the
outbox bookkeeping. **The payload may be a field of the row here**, unlike the
photograph kind, because it is a handful of short strings and a batch of them in
memory costs nothing; that kind's descriptor rule is about megabytes and does not
generalise to this one.

**OUTCOME: ITS OWN UNION, AND DELIBERATELY NOT THE ONLINE ONE.**
`CreateSellerOutcome` in `mobile/src/master/createSeller.ts` has eight members
and is right for the online screen. Reusing it here would import two members this
path cannot produce — `code_assignment_failed` requires that no code was
supplied, and this kind always supplies one — and one whose meaning changes
underneath, which the section below is entirely about. **A kind's outcome union is
the kind's own; that is the rule that keeps a 409 from meaning one thing across
two kinds.**

**ORDERING AND RETRY, each mapped onto the per-kind axes and each saying whether
it takes a bill's answer or a different one.**

| axis | value | same as a bill? |
|---|---|---|
| `blocking` | `independent` | **DIFFERENT from `bill_send`.** `head_blocks` exists because a bill's arrival order decides its `doc_no` and a `doc_no` is a legal document. **A seller has no `doc_no` and no arrival-ordered number of any kind**, so the entire argument for head-of-line is absent here. One refused seller must not hold another. |
| `rereadAfterEach` | `false` | Same as `bill_void`, and forced: `independent` with a re-read is the legal-but-slow pair that drains one row per pass. |
| `concurrency` | `parallel_rows` | Same as `bill_void`. Rows are unrelated; a held row must not stop another. |
| `inFlightKey` | prefixed, `seller:` | **DIFFERENT from `bill_send`**, which uses the bare id. A local seller id and a local bill id come from the same generator, so an unprefixed key could collide across kinds in principle; the prefix is a declaration, asserted rather than staged. |
| `resendIsIdempotent` | `true` | Same VALUE as both bill kinds and for a **different reason, and it is the single most load-bearing consequence of the owner's decision.** A bill is idempotent because hard rule 4 puts a key on it. A seller create has no such column — and the reservation TOKEN is one. Without the token this would be `false`, and the kind would have to classify a throw as `needs_review` instead of `retry`. |

**THE OTHER HANDLER MEMBERS, and the two that differ from a bill are the point.**

- `owed(limit)` — rows still owed and actionable, ordered by creation, **and
  filtered to the current identity.** The owner predicate is a requirement on
  every kind and this kind asks a THIRD question: `bill_send` filters on who
  WEIGHED it, `bill_void` on who ORDERED THE REVERSAL, and this on **who CREATED
  the seller.** Three questions, three filters, each written by hand at its own
  site.
- `owedCount()` — wider than `owed`, as the rule requires: everything not settled,
  in-flight rows included, or the strip goes quiet exactly while a send is
  happening.
- `recover(now)` — **a REAL sweep, unlike `bill_void`'s.** This kind has durable
  in-flight state, so rows stranded mid-send at a kill go back to owed and their
  ids are returned. A void's no-op recover is correct because its in-flight guard
  is in memory; that is not true here.
- `claim(row)` — a conditional UPDATE, the shape `claimForSend` already has,
  because there is durable in-flight state to claim.
- `dueAt` / `nextAttemptAt` — a real schedule with backoff on `retry` and null
  otherwise. An offline device must not hammer a route it cannot reach.
- `onThrow(err)` — the kind's own `unavailable`, carrying no `reachable`: the
  poison alarm is about a server refusing a BILL and must not be fed from here.
  `classify(onThrow(x))` is `retry`, which is only legal because the resend is
  idempotent.
- `record(...)` — the kind's only writer, and it does **one thing neither bill
  kind does**: on settling it writes the SERVER's seller id onto the local row and
  releases every bill parked behind it. That is the subject of the last section
  below.

---

#### WHAT A 409 MEANS NOW — and the two cases that would still break it

**THE SHORT ANSWER, AND IT IS NOT THE ONE THE DECISION WAS EXPECTED TO PRODUCE:
server-minted reservations make settle-on-409 safe IN PRINCIPLE and DO NOT make
it safe AS THE SERVER STANDS. Two further decisions are required, neither follows
from the owner's decision on its own, and without both the defect has been moved
rather than removed.**

**FIRST, WHAT CHANGES FOR THE BETTER.** The device always supplies a code, so
`code_assignment_failed` is unreachable from this path — and with it, the
discriminator P1.8a established for this route. *Did the caller supply a code* is
now always yes, so it separates nothing and this kind must not lean on it.
**In its place the caller holds something stronger: the reservation token.** With
the token carried on the create, a repeat is recognisable BY THE SERVER as the
same create, and the server answers with the row the first attempt produced —
hard rule 4's "already created", extended to this route by decision. **So the
ordinary replay is not a 409 at all**, and the question the brief asks becomes
narrower: what is left that a 409 could mean?

**THE TWO CASES THAT WOULD STILL BREAK IT.**

**BREAKING CASE 1 — A HUMAN TYPES A RESERVED CODE, AND THE SERVER TAKES IT.**
`SellerCreate.code` is optional and a SUPPLIED code is accepted from any staff
session; D2 and S6 exist precisely so a shop that keeps its own paper codes can
supply them, and P1.15 will put that on the desktop. So somebody at the counter
can type the code a phone is holding offline. `uq_sellers_tenant_code` is the only
guard and the reservation is not in `sellers`, so the row is created. The phone
then drains, is answered 409, and under settle-on-409 binds its local seller to
the counter's row — **the measured defect, reproduced verbatim under the new
design.**
→ **REQUIRED DECISION: `POST /sellers` must REFUSE a supplied code that is
currently reserved**, with a code of its own, and the refusal must name what
happened without echoing the request body, since a refusal body on this route can
carry an ID card number.

**BREAKING CASE 2 — THE SERVER MINTS ONE ITSELF, AND NOBODY MAKES A MISTAKE.**
`_next_seller_code` derives its candidate from the rows already in `sellers`.
Reservations are not in `sellers`. So the generate-then-retry assigner will hand a
RESERVED code to an online caller who supplied none, insert it, and produce case 1
with no human involved at all. **This is the worse of the two**, because case 1
needs somebody to type the wrong thing and this needs nothing.
→ **REQUIRED DECISION: `_next_seller_code` must skip codes present in the
reservation relation**, in the same transaction that inserts.

**WITH BOTH DECISIONS TAKEN, WHAT IS A 409?** Only this: the reserved code is in
`sellers` and this reservation did not put it there — which the two rules above
make unreachable. **So the disposition for a 409 on this kind is `needs_review`
and NEVER `settled`:** an unreachable state that has been reached is an invariant
violation, and settling on it is exactly the binding this whole step exists to
prevent. `needs_review` is already in the disposition union and was added for a
neighbouring reason on this very route.

> **RULE.** No arm of this kind's `classify` returns `settled` for a 409.
> **RED WHEN BROKEN:** a 409 staged against the kind leaves the row owed and
> operator-visible, and does not clear it.

**AND THE FINDING THE BRIEF ASKED FOR, STATED PLAINLY RATHER THAN SOFTENED.** The
owner's decision is not unworkable and is not reopened here. What it does not do
by itself is make a 409 unambiguous: it makes a code have one holder in the
RESERVATION relation while leaving two other paths able to put that same code into
`sellers`. The reservation is only an answer once the server enforces it on every
path that can write a code, and that enforcement is server work inside P1.8b.

**AMENDED (P-SELLERKIND-DESIGN-AMEND, 2026-08-24) — WHERE THE SKIP LIVES. The
required decision above names WHAT and not WHERE, and the two available placements do
not differ in degree: one of them refuses the counter every time.**

**RE-DERIVED AT THE ARTEFACT, and both figures are pinned to this dated paragraph
because both rot.** `_ASSIGN_ATTEMPTS = 8` — `server/app/master.py:897`, the bound of
the loop at `:1017` and the number echoed into the 409 body at `:1045`.
`_next_seller_code` at `:900` takes `max(substring(code from 2)::numeric)` over
`sellers` alone, filtered to the assigned shape, and adds one. **The module comment
above it states what makes that retry correct and what makes it ADVANCE, in its own
words:** *THE UNIQUE INDEX IS THE ARBITER; THE SELECT ONLY PROPOSES*, and the loser
"re-reads a maximum that now includes the winner's committed row". **A reservation is
not a row in `sellers`, so it moves that maximum by nothing.**

**DECISION. THE SKIP LIVES IN THE CANDIDATE DERIVATION AND NOWHERE ELSE.** The
maximum is taken over the UNION of the assigned-shape codes in `sellers` and the
codes in the reservation relation for this tenant, in ONE expression, and the
candidate is its successor. It costs the same whatever the block's length, and it
returns a code ABOVE the whole block rather than merely outside it — which is the
only answer consistent with the sequence a shop's paper slips carry.

**AND THE RETRY BUDGET KEEPS THE JOB IT ALREADY HAD, WHICH IS THE HALF THAT DECIDES
THIS.** Those eight attempts exist to survive a LOST RACE against another INSERT, and
they work because the winner's commit changes the table the candidate is derived
from. **A post-check cannot borrow that mechanism**: it changes nothing in `sellers`,
so the derivation returns the identical candidate on every one of the eight attempts
and the whole budget is spent on one value. **The refusal therefore does not need a
long block — ONE reserved code is enough**, and it is arithmetic rather than a risk
to be sized.

**TWO POST-CHECK SHAPES EXIST AND THEY FAIL AT DIFFERENT SIZES, which is why the
staging that separates them is named here.** The one that does NOT walk — check the
candidate, and on a reserved value hand back to the existing retry — is refused at a
block of ONE. The one that walks — check the candidate, step up until it is free, and
use the retry as the walker — survives a block of one or two and is refused as soon
as the block outruns the budget. **A single-code staging separates the first from a
correct derivation; a block-length staging separates the second. Neither staging
alone reaches both.**

> **RULE.** The next assigned code is derived above BOTH tables in one expression,
> and no arm of the create path may reach the retry loop because a candidate was
> reserved.
> **RED WHEN BROKEN:** with exactly ONE code reserved for a device and nothing else
> changed, a staff session posting `POST /sellers` with no code is answered 201 and
> the minted code is that reserved code's successor; a non-walking post-check answers
> 409 `code_assignment_failed` to the identical request.

**AND THE DERIVATION IS ONLY AN ANSWER IF NOTHING CAN RESERVE BETWEEN THE READ AND
THE INSERT — which is the second half of *in the same transaction that inserts*, and
the sentence above stops before saying it.** `uq_sellers_tenant_code` is the arbiter
for two creates and is SILENT about a create against a refill: they write different
tables, so both commit, and a reserved code lands in `sellers` with nobody making a
mistake. That is breaking case 2 again, in a window instead of over a whole block.

**DECISION. THE TWO WRITERS OF THE ASSIGNED CODE SPACE SERIALISE PER TENANT, on a
transaction-scoped lock taken BEFORE the derivation, by BOTH of them.** The lock is
the tenant's own row, taken FOR UPDATE. It is an object that already exists, it is
already under a tenant-keyed RLS policy so a mistake cannot reach another shop's row,
the refill route already reads that row for the target holding, and it is released by
the commit rather than at a later moment nobody owns. **An advisory key was weighed
and is not taken:** it is not RLS-scoped, and a lock that appears nowhere in the
schema is a lock the next writer does not know to take.

> **RULE.** Every path that writes an assigned-shape code into `sellers` or into the
> reservation relation takes the per-tenant lock first and derives from the union
> afterwards.
> **RED WHEN BROKEN:** a refill and a no-code create driven concurrently behind a
> start barrier, with the overlap evidence printed, leave `sellers` and the codes
> still `held` sharing no member, both sets asserted non-empty.

**AND ITS RESIDUAL, STATED RATHER THAN HIDDEN: this is a rule a future writer can
forget, and no constraint refuses them.** A third path that mints a code without
taking the lock is not a compile error and not a violated key — it is a silent
re-opening of breaking case 2. What would remove the residual entirely is a single
relation holding every assigned code, so a primary key is the arbiter for both
writers and no lock is remembered anywhere; that is a larger design than this
amendment takes, and its price is a nullable holder, a token for rows that have no
device, and a backfill across every seller a shop already has. **Recorded as the
alternative that was weighed, so a later reader does not have to rediscover it.**

**AMENDED (P1.8b SERVER, 2026-08-25) — ONE CLAUSE: THE LOCK MODE. `FOR UPDATE`
BECOMES `FOR NO KEY UPDATE`, AND THE DIFFERENCE IS NOT A DETAIL.** The words
superseded are *The lock is the tenant's own row, taken FOR UPDATE* in the
paragraph above. Everything else in this subsection stands: that the two writers
serialise per tenant, that the lock is transaction-scoped and taken BEFORE the
derivation by BOTH of them, that the object is the tenant's own row, that an
advisory key was weighed and refused, and the residual immediately above.

**WHY THE CLAUSE IS WRONG. `tenants.id` is referenced by a foreign key from
essentially every table in this database, and an INSERT's foreign-key check takes
`FOR KEY SHARE` on the parent row. `FOR UPDATE` conflicts with `FOR KEY SHARE`;
`FOR NO KEY UPDATE` does not.** So the clause as written serialises the two code
writers AND stalls every insert of every tenant-scoped row in the shop — a bill on
the weighbridge included — for the length of a refill, on every sync pass from
every device, with nothing going red anywhere.

**THE FOREIGN KEYS, RE-DERIVED AT `b8b557f` AND NOT CARRIED FROM ANYWHERE:**
`SELECT ... FROM pg_constraint WHERE contype='f' AND confrelid='public.tenants'::regclass`
returns **ELEVEN — ten in `public`, one in `directory`** —
`directory.shop_codes`, `doc_no_counters`, `product_categories`, `product_prices`,
`products`, `purchase_bill_items`, `purchase_bills`, `seller_code_reservations`,
`sellers`, `uoms`, `users`. **`purchase_bills` and `purchase_bill_items` are both
in that list, which is the whole of the argument**: writing a bill is what would
have waited. Ten of the eleven predate this step; the eleventh is migration 0012's
own.

**MEASURED ON THIS CLUSTER, PostgreSQL 16.14, 2026-08-24, a 1.5 s hold with a
no-holder control:**

| holder on the tenant row | INSERT of a child row (FK `KEY SHARE`) | the other writer's lock |
| --- | --- | --- |
| nobody | 4.6 ms | 2.7 / 4.1 ms |
| `FOR UPDATE` | **1506.0 ms BLOCKED** | 1508.8 ms BLOCKED |
| `FOR NO KEY UPDATE` | **3.2 ms free** | 1511.5 ms BLOCKED |

The bottom row is exactly what this decision asked for and nothing wider: the two
writers of the assigned code space wait for each other, and nothing else waits at
all. The mode is carried in `_lock_shop_for_code_assignment`'s own docstring with
this table in it, so it cannot be tidied back by somebody who has not run it.

**AND A SEPARATE MEASUREMENT, RECORDED HERE AND DELIBERATELY NOT AMENDED, because
this is a one-clause change and that sentence is a different clause.** The RULE
above states its red as *a refill and a no-code create driven concurrently behind
a start barrier, with the overlap evidence printed*. **That observable was measured
NOT TO DISCRIMINATE.** A start barrier synchronises the REQUESTS, while the section
this lock protects is a sub-millisecond SELECT sitting behind an auth round trip —
so with the lock deleted from the route the barrier race stayed GREEN, and across
five runs of the same mutation it collided ONCE. It is a real observable and an
intermittent one, which is worse than none because its greens read as evidence. The
red that DOES discriminate is a pair of HOLDS — hold the tenant row the way the
other writer holds it and the route must wait; hold it the way an ordinary
uncommitted child INSERT holds it and the route must NOT — and it is built at
`prove_seller_code_reservations.py` D5 and `prove_seller_code_guards.py` G7. The
reasoning is at
`lessons/README.md § Lessons` "a-lock-is-proven-by-what-waits-not-by-a-race.md".
**Whether the RULE's own sentence should move is the owner's, and nothing here
touches it.**

---

#### The local schema — an origin marker, a refresh that deletes, and a CHECK

**DECISION. AN UNSETTLED LOCAL SELLER NEVER ENTERS `cached_sellers`.** It lives in
a new table beside `local_bills`, where owed work lives. That answers the survey's
first two bullets by dissolving them rather than patching them:

- **The origin marker.** There is none on `cached_sellers`, because nothing local
  is in there to mark. The cache stays what it is — a copy of the server's list.
- **`saveSellers`'s unconditional `DELETE FROM cached_sellers` DOES NOT CHANGE.**
  A cache is content that follows a rewrite wholesale, and weakening the refresh
  to protect a local row would be the wrong repair to the wrong statement.
- The seller picker reads the UNION of the cache and the unsettled local rows,
  resolved at read time, and stops offering a local row once it has settled AND
  the corresponding server row has actually arrived in a refresh — never at settle
  alone, or the seller disappears from the picker in the window between.

**THE CLASSIFICATION, OUT LOUD, BECAUSE THE BRIEF ASKS AND BECAUSE THE THREE
UPSERTS IN `mobile/src/adapters/sqlite` DELIBERATELY DISAGREE.** The question is
never which columns changed; it is whether the column says WHAT THE ROW NOW HOLDS
or WHERE IT CAME FROM.

| column | classification | consequence |
|---|---|---|
| `owner_tenant_id`, `owner_user_id` on the local seller | **ORIGIN** — who created this seller, and no later edit makes that untrue | must never appear in a DO UPDATE that rewrites the row, exactly as the draft's owner pair does not |
| the server id written at settle | **ORIGIN** — which server row this local row became | written once, never in a DO UPDATE at all |
| `owner_tenant_id` on `cached_sellers` | **CONTENT** — which shop the cache belongs to NOW | already carried forward, and untouched by this design |

**AND A FOURTH SHAPE THE THREE UPSERTS DO NOT COVER, recorded because it is the
one a reader would meet next.** Had the origin marker been put on `cached_sellers`
after all, the failure would have been neither of the two the rule names: that
table is not upserted, it is DELETEd and re-INSERTed, so an origin marker there is
DESTROYED rather than wrongly carried forward. Delete-and-reinsert is a third
rewrite shape, and it fails an origin column in a way no DO UPDATE list can.

**THE `sync_state` CHECK: NEITHER MIGRATED IN PLACE NOR REBUILT, BECAUSE NOTHING
TOUCHES IT.** The new table is created with the CHECK it needs; `local_bills`'s
CHECK is not altered. **So the question of what happens to rows in flight during a
rebuild does not arise — and avoiding that question is one of the reasons a new
table was chosen over widening an old one**, on a database that is already holding
a shop's unsynced bills.

**WHAT `local_bills` DOES GAIN is a nullable column pair recording that a bill is
waiting on a seller this device created.** Additive columns need no rebuild:
`schema.ts`'s migrator adds them by asking `PRAGMA table_info` what the table
already has, and it is already used that way for the existing added bill columns.
**And it must NOT be a new `sync_state` value**, for the reason the schema file
already gives at the parked columns: the CHECK is baked into `CREATE TABLE` and
SQLite cannot alter one without rebuilding the table.

---

#### A BILL CAN NAME A SELLER THE SERVER HAS NEVER SEEN, and today that bill is TERMINAL

**THIS IS NOT IN THE SEVEN-BULLET SURVEY, AND IT IS THE MOST EXPENSIVE THING THIS
DESIGN FOUND.** The server refuses a bill whose `seller_id` does not resolve with
**422 — PERMANENT — terminal**, and it does so on a stated argument:
`server/app/bills.py` records that a reference which does not resolve at all stays
permanent because "the device got those ids from this tenant's own /sellers and
/products, so a miss means a corrupt or stale reference, not a setup gap".

**OFFLINE SELLER CREATION FALSIFIES THAT ARGUMENT'S PREMISE.** After P1.8b the
device will hold seller ids the server has never seen, legitimately, and a bill
naming one is not corrupt — it is valid a few seconds early. **Left alone, the
first offline walk-in produces a terminally failed bill for cash already paid, on
a row hard rule 5 forbids deleting.**

**DECISION. THE BILL IS PARKED, LOCALLY, FROM THE MOMENT IT IS WEIGHED, AND
RELEASED WHEN ITS SELLER SETTLES.** Not excluded from the queue, and not left to
be refused by the server:

- **It reuses the EXISTING parked exemption rather than inventing a second one.**
  The ordering rule permits exactly one exception — a bill out of the sendable
  queue on missing master data — and warns that any further skippable bill needs
  its own argument. A seller that does not exist yet IS master data that is not
  set up, so this is that exemption's own case and not a new one.
- **The bill therefore never enters the sendable queue while its seller is
  un-created**, so there is no head to block, no reordering to argue about, and no
  request is spent discovering what the device already knows.
- **The server's 422 rule does not change.** It stays permanent for a genuinely
  unresolvable reference, which is what it was written for.
- **The wording is a NEW code with a NEW sentence, and it must not borrow the
  existing one.** Every parked sentence today says the OFFICE must act. Here
  nobody must: it resolves itself when the device reaches the server. A message
  that names an action must be derived from the cause, and telling a yard to call
  the office about a bill that will send itself is the confidently-wrong
  instruction this repository has already paid for twice.
- **`record` releases it.** When the seller kind settles, the same writer that
  stores the server id clears the park on every bill behind it — one statement, in
  the kind's own writer, the shape `clearBackoffForPending` already has.

> **RULE.** No bill naming an unsettled local seller is ever offered to the send
> queue, and every such bill is released by the seller settling and by nothing
> else.
> **RED WHEN BROKEN:** a bill weighed against a locally created seller, with the
> seller's own row still owed, is absent from the sendable queue and present in
> the owed COUNT; after the seller settles it is present in both, carrying the
> server's id.

**AND THE REGISTRY'S MEMBER ORDER GAINS A THIRD ENTRY WHOSE POSITION IS
LOAD-BEARING.** `seller_create` drains BEFORE `bill_send`, for the same shape of
reason that puts `bill_send` before `bill_void`: a seller created and a bill
weighed in one offline stretch both become actionable in one pass only if the
seller goes first. Reversed, every such bill waits a whole poll interval behind a
seller that had already settled.

---

#### WHAT THIS DESIGN DOES NOT COVER

Said before anyone reads it as complete.

- **The criteria.** They are derived from this document in the next step. Nothing
  here is an acceptance criterion, and the rules above name what turns red without
  saying how it is staged.
- **Any screen, and any Thai sentence.** S10 defers the drawing. What is decided
  here is the state, the required input, the tone and the wording obligations; the
  strings are written where the wording functions live.
- **The target holding's VALUE.** The mechanism is decided and the number is an
  assumption, labelled as one.
- **Whether exhaustion will be rare.** Not establishable here, and said so above.
- **An admin surface for reservations.** None is designed and none is needed: with
  nothing re-issued there is nothing to administer.
- **The seller FACE PHOTOGRAPH.** S12 requires one per seller. It is a fourth kind
  with a payload measured in megabytes, and none of the reasoning above about a
  row carrying its own payload transfers to it.
- **Authenticating a device.** The token is unguessable and that is the whole of
  the guard. A caller inside the tenant who obtained another device's token could
  spend its reservation; that caller can already create sellers, so this is a
  bound rather than a hole, and it is not closed here.
- **The desktop.** P1.15 creates sellers online; nothing here gives it a
  reservation and nothing here requires one.
- **A second process, and one person signed in on two handsets.** The holder is a
  device, so both are outside the mechanism rather than solved by it.
- **Anything in `server/app/bills.py` beyond naming its 422 rule** and recording
  that the argument printed beside it stops being true when P1.8b ships.
- **THE REPAIR OF A BILL PARKED BEHIND A PERMANENTLY REFUSED SELLER.** Added
  2026-08-24 by the amendment below, which found it while deciding what happens to
  that create's reserved code. The release fires on a settle, and that seller never
  settles. Recorded at the decision that produced it and answered nowhere.
- **THE REFILL'S CALL SITE.** Added 2026-08-25, when the mobile half landed with
  `refillOnce` built, proven and called by NOTHING. It belongs to the phase that
  draws the surfaces, because it must arrive together with the thing that SHOWS
  the level it produces: a refill wired earlier mints real reserved codes, on
  every device and every pass, for a capability nobody can use — and nothing
  re-issues a reservation, so the gaps it burns into the shop's code sequence are
  permanent. The full argument is at the phase entry above; it is repeated here
  because this is the list a reader checks before believing the design is
  covered, and an unwired function with a green proof reads as finished.

- **THE CRASH WINDOW BETWEEN THE SETTLE AND THE RELEASE.** Added 2026-08-25 by
  P1.8b GATES, which built both. `record` writes the server id onto the local
  seller and then releases the bills parked behind it, and the two are writes to
  DIFFERENT TABLES — `local_sellers` and `local_bills` — so no single statement
  can do both. A kill between them leaves a seller `synced` and its bills still
  parked. **They are not lost**: the park is visible, the bills stay `pending`
  and stay inside `owedCount`, and the card says what they are waiting for. But
  nothing releases them, because a seller settles ONCE and the release has no
  second trigger. **This is the subject of
  `lessons/README.md § Lessons` "sync-state-needs-startup-recovery.md — applies to any" and "nothing polls it, so a crash strands the record forever"**
  — an in-progress state nothing polls, which a crash strands for ever unless a
  startup sweep puts it back. Whether this design owes such a sweep is a DESIGN
  question and P1.8b GATES does not answer it: the boot already sweeps
  `syncing` rows per kind, and a bill parked behind a SETTLED seller is a
  different shape of stranding that no existing `recover` looks for. Resolved
  2026-08-27 (B1) and archived in the M2 compression,
  `archive/OPEN_ITEMS_through_2026_08_28_0841d8e.md`
  "A CRASH BETWEEN THE SELLER SETTLE AND THE BILL RELEASE STRANDS THE BILLS".
- **A LOCAL SELLER HELD FOR REVIEW IS OWED AND NEVER ACTIONABLE.** Added
  2026-08-25 by P1.8b GATES, which widened that gate to every kind. A 409 leaves
  the row `pending` with `needs_review_at` set — **both halves required**, by
  `NO-ARM-OF-THIS-KIND-SETTLES-A-409` cell 2 (it must stay inside `owedCount`)
  and by `SELLER_ACTIONABLE` (it must never be re-asked). So it is counted owed
  and is never actionable, and a gate that refuses on owed work refuses for ever,
  under a sheet saying *รอให้ส่งครบก่อน* — a wait that cannot end, on a device
  nobody can hand over. **The design holds the state unreachable** behind the two
  server-side guards, so this is conditional on an invariant violation rather
  than on ordinary use. Nothing in P1.8b GATES treats it as an ordinary end
  state: inventing a disposal would be a design decision, and the two candidates
  — a fourth seller state, or a gate that distinguishes owed-and-drainable from
  owed-and-stuck — are opposite answers with different costs. Resolved
  2026-08-27 (B1) and archived in the M2 compression,
  `archive/OPEN_ITEMS_through_2026_08_28_0841d8e.md`
  "A LOCAL SELLER HELD FOR REVIEW HOLDS THE SIGN-OUT GATE SHUT FOR EVER".

**AMENDED (P-SELLERKIND-DESIGN-AMEND, 2026-08-24) — S10 AND THE SIGN-OUT GATE,
RULED, SO THE CRITERIA'S OPEN QUESTION BELOW IS CLOSED.** The second bullet above
defers any screen and any Thai sentence to S10, and the refill argument two
subsections up relies at the same time on an owed unit of work reaching the owed
counts, refusing a sign-out and colouring the strip. **The reading is: S10 defers the
DRAWING, and a sign-out gate is a decision about whether an action PROCEEDS, not a
drawing.** And a sign-out that discards owed work is money already paid, which is
S10's own stated exception — a defect that makes something unusable. **So
`EVERY-SURFACE-SEES-A-KIND-THAT-IS-NOT-A-BILL` below STAYS and is not dropped.**

**AND ITS SCOPE IS BOUNDED BY WHAT IS ALREADY BROKEN, re-derived rather than carried
from the instruction that ruled it.** The outbox step closed with its own surfaces
criterion untouched BY DESIGN — the gate, the sheet and the strip still count bills
only, and the strip reads `ส่งครบแล้ว` over an owed void
(`archive/PROJECT_STATUS_through_2026_08_28_f7ab2e0.md` "EVERY-SURFACE-COUNTS-EVERY-KIND is untouched BY DESIGN").
**A third kind WIDENS that gap; it does not open a new one.** The strip's wording
moves only as far as stops it stating something false. It is not redesigned here, and
no screen is drawn here.

**WHAT P-SELLERKIND-DESIGN-AMEND CHANGED, listed once so a reader does not have to
find the amendments by reading the design twice.** Each is recorded where the
sentence it corrects lives, by dated supersession, and nothing above was rewritten:
*How a device obtains codes* — the route is a top-up and not an issue of N, decided
under policy 6 where the sentence it supersedes was written; *the three policy
values* — what identifies a refill and what a repeat is answered with; *what the yard
is told* — what the reserve level counts, and tone derived from the level with no
amber left in the mechanism; *what a 409 means now* — where the skip lives, and what
serialises it against a concurrent refill. **One ruling, on S10 and the sign-out
gate, immediately above.** **No P-number and no S-number is minted, no decision of
the owner's is reopened, and the criteria these answers touch are corrected in the
same commit.**

---

#### THE SELLER-KIND CRITERIA, DERIVED FROM THE DESIGN ABOVE

**P-SELLERKIND-CRITERIA, 2026-08-24. THIS WRITES CRITERIA AND NOTHING ELSE — no
code, no type, no migration, no route, and not one line of the design above.** The
design was read as a DOCUMENT TO BE TESTED rather than as a rationale to agree
with, by a session that did not write it. Where it leaves a criterion unwriteable
the gap is recorded in the findings subsection below and NO criterion is invented
to cover it: inventing one would take a design decision inside the step whose
whole job is to measure decisions somebody else took.

**THEY ARE NAMED, NOT NUMBERED**, following the outbox step's own set, and for the
reason that set gives: the seven numbered criteria it superseded could be cited by
a digit that said nothing about what they measured.

**EVERY ONE CARRIES FOUR THINGS, AND THE ORDER IS THE POINT.**

- **THE STAGING** — the concrete state that produces the case, named before the
  assertion. A criterion demanding a state the design FORBIDS is not strict, it is
  UNPERFORMABLE: nothing runs, so nothing goes green and nothing goes red, and an
  unperformable criterion is the one nobody discovers is broken because nobody can
  run it (`lessons/README.md § Lessons` "a-quantified-sentence-names-no-member.md — applies the moment you ADD to or REMOVE from any set").
- **RED CASE, NAMED** — the concrete broken implementation it turns red, written
  as something somebody would plausibly build and not as a strawman.
- **THE CASE THAT DISCRIMINATES** — the wrong behaviour that looks IDENTICAL from
  outside, and the observation that separates the two. Where two mechanisms produce
  one outcome, that outcome is evidence about neither.
- **CAN A BROKEN IMPLEMENTATION SATISFY IT?** answered in the criterion's own text.
  A criterion whose answer is anything but *no* does not go in.

**AND EACH SAYS WHAT IT COSTS TO RUN** — HEADLESS (a proof under
`mobile/src/proof/`, no server and no handset), SERVER (a live API, and for the
mutation halves a SCRATCH database:
`lessons/README.md § Lessons` "a-mutation-on-a-protected-write-path-needs-a-scratch-database.md — applies before mutating production code"),
or HANDSET — because a set nobody can afford to run in one sitting is a set that
gets run in part, and the part that gets dropped is not chosen by its importance.

**NO RAW COUNT OF THE ARTEFACT APPEARS IN ANY OF THEM, INCLUDING IN A NAME**, per
`OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "A RAW COUNT INSIDE AN ACCEPTANCE CRITERION ROTS".
Where a number about the tree is needed it is named as a SET and a SOURCE and
produced when the staging is built — *the assigner's attempt budget, read out of
`server/app/master.py`* — never written here. A count of a criterion's OWN
structure (*two cells*, *the four level values*) is kept, because it is a statement
about the criterion and a reader can finish counting it.

**EVERY ABSENCE ASSERTION CARRIES A PRESENCE SIBLING, IN THE SAME RUN AND OVER THE
SAME READ.** An absence over an empty queue, an empty response body or an empty
string is satisfied by silence —
`lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md — applies to every assertion",
ninth mechanism. And every DIFFERENCE is asserted by DIRECTION and never by
inequality: two wrong values still differ
(`lessons/README.md § Lessons` "a-green-cell-is-evidence-about-the-assertion-not-the-claim.md — applies to every assertion you are about to cite").

**NO STATEMENT SEQUENCE IS PRINTED** — the constraint the design works under, kept
here for the same measured reason
(`lessons/README.md § Lessons` "printed-code-in-a-design-document-is-run-by-nobody.md — applies to every code block written into an artefact nothing executes").
Types, member names and policy values are stated; dynamics are stated as
observables.

**WHAT THIS SET INHERITS AND DELIBERATELY DOES NOT RESTATE.** The outbox step's
criteria already govern every registry member, this one included and by
construction: the registry is total and is what the drain enumerates, the drain
advances and terminates, a lost claim is not an outcome, a schedule stays inside
the horizon, the pass reports what the screen reacts to, and a throw lands in one
of two places. The seller kind joins those sets on the day it is added and the
cells below do not repeat them. **TWO OF THEM GAIN THEIR FIRST INSTANCE HERE**,
and both are named at the criterion that supplies it: the boot-recovery
criterion's residual, which held because no kind with DURABLE in-flight state
existed; and the throw criterion's stated limit, that `resendIsIdempotent` is a
declaration nothing measures.

---

**A-CODE-HAS-ONE-HOLDER-AND-KEEPS-IT.** *(SERVER, scratch)* The reservation
relation's whole invariant, which is the thing the owner's decision buys.
**Staging:** a tenant, a device identity, and a block of codes issued to it; then
a second insert of one of those `(tenant_id, code)` pairs attempted directly
against the relation. **Observable, two cells.** (1) The second insert is REFUSED
by the primary key and no second row exists — **with the presence sibling in the
same run: the identical statement for a code NOT in the relation SUCCEEDS**, so
the refusal is evidence about the key and not about a broken connection or a
mistyped table. (2) Two issue calls to the same tenant, for two different device
identities, return code sets whose INTERSECTION IS EMPTY *and* whose UNION has the
size of the two sets added together — **equality, because a containment or
disjointness test answers what is present and only equality answers what is in
EXCESS**
(`lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md — applies to every assertion",
fourteenth mechanism), with both sets asserted non-empty in the same read.
**RED CASE, NAMED:** a relation keyed `(tenant_id, token)` with the code merely
indexed — the shape a reader reaches for because the token is what the create
carries. It admits two holders for one code, which is the defect S22 was taken to
remove, written down as a schema. **THE CASE THAT DISCRIMINATES:** a single-block
staging passes under BOTH keys, because one block never collides with itself; the
second cell is the only one that separates them, and it needs two blocks in one
tenant. **CAN A BROKEN IMPLEMENTATION SATISFY IT? No** — the token key reddens
cell 2, and a relation with no key at all reddens cell 1.

**A-SPENT-RESERVATION-NAMES-A-ROW-THAT-EXISTS.** *(SERVER, scratch)* The design's
rule that nothing outside the seller INSERT may write `spent`, and that a spent
reservation is a record of a row that is really there. **Staging:** one reservation
issued and then spent by a create that succeeds, and a SECOND reservation issued to
the same device and left untouched. **Observable, three cells, all read out of
Postgres and none off a response.** (1) The spent reservation's `seller_id` EQUALS
the created row's id, **and the same cell asserts the id is non-null** — two
derivations of one event both return null when the event did not happen, and
`None == None` is the most convincing green available
(`lessons/README.md § Lessons` "a-check-that-never-went-red-was-never-observed.md — applies to every assertion",
tenth mechanism). Both operands are PRINTED beside the verdict. (2) The presence
sibling for the state: the second reservation is still `held` in the same read, so
"spent" is a fact about the first row rather than a column defaulted for every row.
(3) The two invariant queries return EMPTY — no reservation `spent` with a null
`seller_id`, and no `sellers` row whose code is in the relation while that
reservation is still `held` — **each with its complementary query returning the
correctly-paired row in the same pass**, because an empty result from a query that
never matched anything is indistinguishable from an invariant that holds.
**RED CASE, NAMED:** an INSERT of the seller followed by a separate UPDATE of the
reservation, which is the natural two-statement shape. **THE CASE THAT
DISCRIMINATES:** from outside, the create succeeded and the seller row exists —
identical under both implementations. What separates them is the reservation's
state after a failure between the two statements: the code is then USED and still
`held`, so a later replay carrying that token finds a reservation it can spend
again and mints a SECOND seller for one person. Cell 3 is the only reading that
sees it. **CAN A BROKEN IMPLEMENTATION SATISFY IT? No**, and cell 2 is why: a
`spent` written unconditionally satisfies cell 1 and reddens cell 2.

**A-SUPPLIED-RESERVED-CODE-IS-REFUSED, AND TODAY THE SERVER TAKES IT.** *(SERVER,
scratch)* The first of the two decisions the design says the reservation requires,
and **the evidence is the PAIR and not either half**, so both halves are RUN and
both are reported. **Staging:** code `C` reserved to device D; then a STAFF session
posts `POST /sellers` supplying `C`, carrying no token, and carrying an
`id_number` and an `address`. **Observable.** (a) **ADMITTED UNDER THE SERVER AS IT
STANDS** — run first, against the unmodified route: 201, and a `sellers` row
carrying `C` exists. That half is what makes the other half a measurement rather
than a restatement of the new code's own behaviour. (b) **REFUSED UNDER THE NEW
RULE** — the same request is refused, the refusal carries a machine-readable `code`
of its OWN that is not `duplicate_code`, and NO `sellers` row carrying `C` exists
afterwards. **Presence sibling, same run:** a create supplying a code that is NOT
reserved still returns 201 and its row is readable, so the refusal is about the
reservation and not about the route having stopped working. (c) **THE BODY DOES
NOT ECHO THE REQUEST** — neither the supplied `id_number` nor the supplied
`address` appears anywhere in the response bytes, **with the presence sibling that
the body is non-empty and names the code**, because an absence over an empty body
is satisfied by silence. **RED CASE, NAMED:** the refusal implemented as an
ordinary duplicate-code answer, reached by inserting the reservation's code into
`sellers` at issue time so the existing unique constraint fires. **THE CASE THAT
DISCRIMINATES:** from outside, a refusal is a refusal. What separates them is that
under the design the reserved code is NOT in `sellers` at the moment of the
refusal — so the staging asserts the code's absence from `sellers` immediately
before the request, and the refusal's own `code` value is the second discriminator.
A shop that later spends the reservation would otherwise find its own code already
taken by a placeholder. **CAN A BROKEN IMPLEMENTATION SATISFY IT? No** — a server
that refuses every supplied code reddens the presence sibling, a server that
refuses nothing reddens (b), and the placeholder implementation reddens the
absence-from-`sellers` assertion.

**A-MINTED-CODE-SKIPS-WHAT-IS-RESERVED, AND TODAY IT DOES NOT.** *(SERVER, scratch)*
The second required decision, and the design calls it the worse of the two because
it needs nobody to make a mistake. **Staging:** a block reserved to device D, then a
STAFF session posts `POST /sellers` with NO code at all, which is the path
`_next_seller_code` owns. **Observable.** (a) **ADMITTED UNDER THE SERVER AS IT
STANDS** — run first: the minted code IS a member of the reserved block, and the
row exists. That is the defect reproduced, and it is what the second half is
measured against. (b) **UNDER THE NEW RULE** the minted code is NOT a member of the
relation for that tenant, **and the create still SUCCEEDS** — the presence sibling,
because a route that started refusing this path would satisfy any assertion phrased
as "no reserved code was minted". (c) **THE SAME TRANSACTION.** With a refill and a
no-code create driven CONCURRENTLY behind a start barrier
(`lessons/README.md § Lessons` "concurrency-tests-need-a-barrier.md — applies to any test asserting behaviour under concurrency"),
and the overlap evidence PRINTED, the set of codes in `sellers` and the set in the
reservation relation share no member afterwards, with both sets asserted non-empty.
**RED CASE, NAMED:** a SELECT that excludes reserved codes, executed as its own
statement before the INSERT, with no lock and no re-check — which is what "skip
codes present in the reservation relation" reads like if the second half of the
sentence is not read. **THE CASE THAT DISCRIMINATES:** sequentially it is
indistinguishable from a correct implementation; only a reservation committed
between the SELECT and the INSERT separates them, and only cell (c) stages that.
**CAN A BROKEN IMPLEMENTATION SATISFY IT? No** — the check-then-insert shape passes
(a) and (b) completely and reddens (c), which is exactly why (c) is not optional.
**CORRECTED (P-SELLERKIND-DESIGN-AMEND, 2026-08-24) — CELL (c)'S RED CASE NOW HAS A
NAMED DESIGN DECISION BEHIND IT, AND ITS SET COMPARISON NEEDS ONE WORD.** The design
now says what *the same transaction* means against the OTHER writer: the refill route
and the no-code create both take a transaction-scoped lock on the tenant's own row
before deriving. Cell (c) is what measures it and stands exactly as written. **The
one word: the disjointness in cell (c) is between `sellers` and the codes still
`held`, not the whole relation.** A SPENT reservation's code is in `sellers` by
construction — that is what `spent` means — so a staging that spends anything turns a
CORRECT implementation red under the unscoped reading. Cell (c)'s own staging spends
nothing and is unaffected today; the scope is written down so the next staging cannot
inherit the wrong sentence.

**THE-ASSIGNER-STILL-TERMINATES-ABOVE-A-RESERVED-BLOCK.** *(SERVER, scratch)*
**This criterion exists because of a finding against the design, recorded below,
and it is the one a reasonable implementation of the criterion above will fail.**
`_next_seller_code` derives its candidate from `max(code)` over `sellers` alone and
`create_seller`'s no-code path retries a BOUNDED number of times, re-deriving from
the same unchanged table each time; a reserved block sits immediately above that
maximum. So a skip implemented as a post-check plus the existing retry exhausts its
budget over a long enough block and answers 409 `code_assignment_failed` — to an
ONLINE caller at the counter, who supplied nothing and did nothing wrong.
**Staging:** a reserved block LONGER than the assigner's attempt budget, the budget
read out of `server/app/master.py` when the staging is built and never written into
this criterion; then a staff session posts `POST /sellers` with no code.
**Observable, two cells.** (1) 201, and the minted code sits ABOVE the reserved
block — not merely outside it, because *above* is the only answer consistent with
the sequence the shop's paper slips carry. (2) **The presence sibling and the
control in one:** with NO reservations held for that tenant, the identical call
mints the successor of the `sellers` maximum, so cell 1 is measuring the skip and
not a server that has started minting from an unrelated place. **RED CASE, NAMED:**
the post-check-and-retry implementation. **THE CASE THAT DISCRIMINATES:** a fixture
that reserves one or two codes passes it completely, and one that reserves a real
holding does not — the discriminator is the LENGTH of the block relative to the
budget, which is why the staging derives the length from the artefact instead of
picking a number. **CAN A BROKEN IMPLEMENTATION SATISFY IT? No**, and this is the
only criterion in the set that separates a skip living in the candidate derivation
from a skip living in the retry loop.
**CORRECTED (P-SELLERKIND-DESIGN-AMEND, 2026-08-24) — THE DESIGN NOW NAMES THE
PLACEMENT, AND THE DISCRIMINATOR ABOVE REACHES ONLY ONE OF THE TWO RED CASES.** The
design decides that the skip lives in the CANDIDATE DERIVATION, as the successor of a
maximum taken over `sellers` and the reservation relation together; this criterion
measures that decision and is not superseded by it. **What is corrected is the
discriminator, and the correction makes the criterion CHEAPER rather than stricter.**
There are two post-check shapes. The one that does NOT walk hands a reserved
candidate back to the existing retry, which re-derives from an UNCHANGED `sellers`
and returns the identical value on every attempt — **so it is refused at a block of
ONE**, and the block-length sentence above passes straight over it. The one that
walks steps the candidate up and uses the retry as its walker; that one survives a
short block and is refused only when the block outruns the budget, which is what the
sentence above describes. **A THIRD CELL IS THEREFORE REQUIRED, and it is the cheap
one:** with exactly ONE code reserved, the no-code create is answered 201 and the
minted code is that code's successor — **with the presence sibling cell 2 already
supplies, no reservations held at all.** Cells 1 and 2 keep the block-length staging
and cell 3 takes the single-code staging; **neither staging alone reaches both red
cases**, which is the whole of the correction.

**A-REPLAY-CARRYING-THE-TOKEN-IS-ANSWERED-WITH-THE-FIRST-ROW.** *(SERVER, scratch)*
Hard rule 4's shape, extended to this route by decision, and the thing that removes
settle-on-409 from the design entirely. **Staging:** device D holds code `C` with
token `T`; a create carrying both is sent, then the BYTE-IDENTICAL request is sent
again. **Observable, three cells.** (1) The second answer carries the SAME
`seller.id` as the first — **with the presence sibling that a DIFFERENT create in
the same run returns a DIFFERENT id**, because "the same id" is satisfied by a
server returning a constant. (2) Read out of Postgres: the number of `sellers` rows
in that tenant carrying `C` is one, and the number carrying the other create's code
is one — a pair of readings rather than a single zero-or-one. (3) The reservation is
`spent` after the first request and STILL `spent`, with the same `seller_id`, after
the second. **RED CASE, NAMED — TWO:** a route that answers the replay 409
`duplicate_code`, which is the behaviour the tree has today and which the design
says must not be settled on; and a route that ignores the token, mints a new code
and returns 201, which is the quieter half already recorded at the closed
offline-seller-code entry — no error, no collision, two sellers for one person.
**THE CASE THAT DISCRIMINATES:** both wrong routes and the right one produce a
successful-looking client. What separates them is the ROW COUNT in Postgres and the
returned id, neither of which the client can see, which is why this criterion is
SERVER and not HEADLESS. **CAN A BROKEN IMPLEMENTATION SATISFY IT? No** — the 409
route reddens (1), the mint-again route reddens (2), and a route that returns a
constant id reddens the presence sibling.

**NO-ARM-OF-THIS-KIND-SETTLES-A-409.** *(HEADLESS)* The design's rule, and the
whole point of the step: an unreachable state that has been reached is an invariant
violation, and settling on it is the binding this work exists to prevent.
**Staging:** the seller kind driven against a fake transport that answers 409, with
a second local seller owed beside it. **Observable, three cells.** (1)
`classify` of the kind's 409 outcome EQUALS `needs_review` — a positive assertion
against one named member, not the exclusion of `settled` from a union of six.
(2) After the pass, the row is STILL returned by `owedCount()` and is
operator-visible, **with the presence sibling that a second row settled by a staged
success in the same run is NOT returned by `owedCount()`** — otherwise "still owed"
is satisfied by a drain that recorded nothing at all. (3) The local row carries NO
server seller id, and the bills parked behind it are STILL parked — the release
belongs to a settle and to nothing else. **RED CASE, NAMED — TWO, AND THE SECOND IS
THE ONE A NARROWER WORDING LETS THROUGH:** `classify` returning `settled`, which
binds this device's seller to a row it did not create; and `classify` returning
`terminal`, which is the cheapest way to satisfy any cell phrased as *the row is not
settled* — it also takes the row out of the queue, it also clears nothing, and it
looks from outside exactly like a correct refusal to settle. **THE CASE THAT
DISCRIMINATES:** `needs_review` leaves the row OWED and `terminal` does not, so cell
2's `owedCount()` reading is the only thing between them; cell 1 alone is satisfied
by neither and cell 2 alone by neither, and the pair is the evidence. **CAN A
BROKEN IMPLEMENTATION SATISFY IT? No.**

**THE-TOKEN-IS-ON-THE-WIRE.** *(HEADLESS, plus SERVER for the pair)* **This closes
a limit the outbox step states about itself and could not close: `resendIsIdempotent`
is a DECLARATION, and an author who sets it wrong and writes `classify` to match is
not caught.** On this kind the declaration is `true` for exactly one reason — the
reservation token — so a `perform` that omits the token from the request compiles,
classifies identically, drains identically, and is green in every existing cell,
while every replay after a lost response creates a second seller row.
**Staging:** the seller kind performed against a recording transport. **Observable,
two cells.** (1) The RECORDED REQUEST carries the reservation token, read off the
request and never off the local row — **with the presence sibling that the same
recorded request carries the reserved code**, so the cell is reading a request that
was actually made. (2) The SERVER pair: the byte-identical replay staging of
`A-REPLAY-CARRYING-THE-TOKEN-IS-ANSWERED-WITH-THE-FIRST-ROW`, driven through this
kind's own `perform` rather than through a hand-built request, so what is proven
idempotent is the thing that ships. **RED CASE, NAMED:** `resendIsIdempotent: true`
beside a `perform` that sends only the code. **THE CASE THAT DISCRIMINATES:** from
outside, every pass on a working network is identical under both; the difference
appears only when a response is lost, which no ordinary run produces. Reading the
request is what turns an invisible difference into a cell. **CAN A BROKEN
IMPLEMENTATION SATISFY IT? No.** **ITS BOUND:** it measures that the token is sent,
not that the server keys on it — cell 2 is what measures that, and it needs a live
API.

**THE-OUTCOME-UNION-IS-THIS-KIND-S-OWN.** *(HEADLESS)* The design forbids reusing
`CreateSellerOutcome`: it would import a member this path cannot produce, and one
whose meaning changes underneath. **Staging:** the kind's outcome type as declared,
and one value constructed against it on purpose — no store, no transport and no
pass, because the state this criterion is about is one the kind cannot reach at run
time. **Observable, two cells, and the first is a
compile cell of the shape the registry criterion already uses.** (1) A value of the
kind's outcome type is constructed carrying `code_assignment_failed` ON PURPOSE;
BOTH mobile typecheck programs must exit non-zero, with the reported error set
REQUIRED TO INCLUDE the file and symbol where the kind's union is declared —
*include*, not *equal*, because the mapped `OutboxResult` entry reddens too and an
exclusive test would argue against a correct implementation; the value is then
removed and the exit-0 pair re-run. **Presence sibling in the same cell:** the
identical construction using a member the kind's union DOES declare compiles.
(2) `classify` is driven over every member of the kind's own union, each verdict
asserted, and the operands PRINTED. **RED CASE, NAMED:** `OutboxResult`'s
`seller_create` entry set to `CreateSellerOutcome`. **THE CASE THAT DISCRIMINATES:**
the reused union drains correctly on every green path and differs only where the
device supplied a code and the server answered about one it minted — a state this
kind cannot produce, so no behavioural staging reaches it. The compile cell is the
only instrument that can, and it works precisely BECAUSE `code_assignment_failed`
is a member of the union being wrongly reused. **CAN A BROKEN IMPLEMENTATION
SATISFY IT? No.**

**A-BILL-BEHIND-AN-UNCREATED-SELLER-IS-NEVER-OFFERED.** *(HEADLESS, plus SERVER for
the release)* And it is released by the settle and by nothing else. **THE CRITERION
THAT COSTS REAL MONEY IF IT REGRESSES.** `POST /bills` classifies an unresolvable
`seller_id` as 422, PERMANENT and terminal, on a premise stated in its own header,
and offline seller creation falsifies that premise
(`lessons/README.md § Lessons` "unavailable-is-not-rejected.md — applies to every sync/retry path").
**Staging:** a local seller created offline and still owed; a bill `X` weighed
against it; a second bill `Y` weighed against a seller the server already knows;
one pass. **Observable, six cells over one staging, and `Y` is the presence sibling for the
first two of them.** (1) `X` is ABSENT from the
sendable queue **and `Y` is PRESENT in the same read** — a queue holding one row
makes "it dams nothing" vacuously true. (2) NO request is made for `X` in that pass
**and a request IS made for `Y`** — this is the cell that keeps the server's 422
from ever being seen, and the design's own words are that no request is spent
discovering what the device already knows. (3) `X`'s `sync_state` is `pending` —
NOT `failed`, and not a value outside the set `local_bills`'s CHECK already
declares. (4) `X` IS counted in the owed count, so nothing on the device claims the
work is done. (5) The parked-release cadences that exist today are run while the
seller is still owed, and `X` stays out of the sendable queue — the *by nothing
else* half, which no assertion about the settle can reach. (6) After the seller
kind settles, `X` is in the sendable queue, carries the SERVER's seller id on its
local row, and sends; the counter's MOVEMENT is reported and never the doc_no's
existence. **RED CASE, NAMED — THREE.** The bill left in the queue and refused
422, marked terminally `failed` for cash already paid on a row hard rule 5 forbids
deleting; the bill excluded by a NEW `sync_state` value, which needs a table
rebuild on a database holding a shop's unsynced bills; and **the bill parked using
the EXISTING master-data park and one of the codes already in `MASTER_DATA_CODES`.**
**THE CASE THAT DISCRIMINATES, and it is the third one:** a bill parked on the
existing code satisfies cells 1, 2, 4 and 6 exactly — same queue behaviour, same
count, same release — and it is wrong in the one place no queue reading looks, the
SENTENCE. That is why the wording has a criterion of its own immediately below.
Between the first red case and a correct park, the discriminators are cell 3 (the
state) and cell 2 (whether a request was made at all): neither bill has a doc_no, so
a doc_no assertion is evidence about neither. **CAN A BROKEN IMPLEMENTATION SATISFY
IT? No.**

**THE-PARKED-SENTENCE-SENDS-NOBODY-TO-THE-OFFICE.** *(HEADLESS)* The design requires
a NEW code with a NEW sentence, because every parked sentence today says the OFFICE
must act and here nobody must — the bill resolves itself when the device reaches the
server. **S10 defers the DRAWING and not this:** the wording functions are pure
modules with headless proofs already pointed at them, so the sentence is testable
the day it is written. **Staging:** a bill parked on an uncreated local seller,
rendered through the wording function, and a bill parked on a genuine master-data
code, rendered in the same run. **Observable, three cells.** (1) The new sentence's
rendered concatenation, in draw order, contains NO instruction to contact the
office — asserted NEGATIVELY over the whole concatenation, **with the presence
sibling in the same string: the sentence that names what is actually happening**,
because an absence over an empty render is satisfied by silence. (2) The two
renders DIFFER BY DIRECTION and not by inequality: the office-owed render contains
the office phrase and the new one does not; the new render contains its own
distinctive phrase and the office-owed one does not. Two directed assertions,
because two wrong strings still differ. (3) The new code is NOT rendered through the
unknown-code fallback — the fallback is cause-neutral by design, so a code nobody
added to the known list produces a plausible, non-committal sentence and satisfies
cell 1 completely. Asserted by the render carrying the new code's OWN text.
**RED CASE, NAMED:** the new state given a code and no entry in the known list.
**THE CASE THAT DISCRIMINATES:** the fallback render and the correct render both
avoid naming the office; only cell 3's positive assertion on the new text separates
them. **CAN A BROKEN IMPLEMENTATION SATISFY IT? No.**

**THE-RESERVE-LEVEL-IS-REQUIRED-AND-EVERY-VALUE-HAS-ITS-OWN-SENTENCE.** *(HEADLESS)*
The design makes the level a REQUIRED input, never optional with a default, so that
every call site becomes a compile error until somebody writes its sentence — which
is how the sweep is known to be complete rather than remembered. **Staging:** the
wording function driven directly, with no screen and no server, over a device whose
holding is set in turn to each value's own precondition — at target, below target
and above zero, zero after at least one successful refill, and never having reached
the server at all — plus one deliberate edit at a named call site for the compile
cell. **Observable, four
cells.** (1) **THE COMPILE CELL.** The level argument is removed at one named call
site on purpose; both typecheck programs must exit non-zero, the reported error set
required to INCLUDE that file and symbol; restored, and the exit-0 pair re-run.
A defaulted parameter reddens nothing here, which is the whole point. (2) **TOTAL
OVER THE VALUES** `ample`, `low`, `exhausted` and `never_provisioned` — the set is
enumerated here rather than counted, and the cell iterates the union so a fifth
value is covered by construction. Each render is asserted to carry its own
distinctive text. (3) **`never_provisioned` IS NOT `exhausted`**, asserted by
DIRECTION in both directions: each render carries its own phrase and does not carry
the other's. Collapsing them ships a confident lie to an operator about something
they never did. (4) **`exhausted` PROMISES NO WAIT AND NAMES WHAT IS STILL
POSSIBLE** — the negative asserted over the whole concatenation in draw order, with
the presence sibling being the sentence naming what the yard CAN still do, and a
second negative that it does NOT offer picking a different seller for this load,
which is the wrong seller on a cash purchase this whole step exists to prevent.
Tone is asserted alongside: `low` amber, `exhausted` red. **RED CASE, NAMED — TWO:**
an optional parameter with a default, which leaves every existing call site
compiling clean while rendering the wrong sentence; and a mapping that takes a
diagnostic as well as the level, so the sentence can be derived from the common
cause instead of from the actual one. **THE CASE THAT DISCRIMINATES:** a defaulted
parameter and a required one are indistinguishable at every call site that passes
the argument — every site the author wrote. Only cell 1's deliberate removal
separates them, and only at a site named in advance. **CAN A BROKEN IMPLEMENTATION
SATISFY IT? No.**
**CORRECTED (P-SELLERKIND-DESIGN-AMEND, 2026-08-24) — CELL 4'S TONE HALF, AND
NOTHING ELSE IN THIS CRITERION.** The design now derives tone from the level by one
question — *does this state require a person to do something now?* — and on that rule
`low` carries NO tone: an amber over a condition that clears itself on the next pass
is a red its reader is being trained to ignore. **So the tone assertion is `ample`
none, `low` none, `exhausted` red, `never_provisioned` red** — four values asserted
rather than two, because a mapping is total only if every member is read. Everything
else in cell 4 stands: the negative over the whole concatenation in draw order, the
presence sibling naming what the yard CAN still do, and the second negative about
offering a different seller. **AND ITS BOUND, because the cell cannot see the
decision it is derived from:** a tone written by hand per value and a tone derived by
rule are behaviourally identical here, so what this cell measures is the four VALUES
and the mapping's totality, never that anybody derived them. Cell 2's iteration over
the union is what keeps a fifth level from arriving without one.

**A-REFILL-ASKS-FOR-THE-SHORTFALL, AND FOR NOTHING WHEN THERE IS NONE.**
*(HEADLESS)* **THE DESIGN NAMES NO THRESHOLD AND EXPLICITLY REFUSES ONE**, so a
criterion phrased as "the trigger fires at the threshold and not above it" has no
staging in this design and is not written; what replaces it measures the same
hazard through the quantity asked for. **Staging:** a device holding a known number
of codes against a per-tenant target, driven through three passes with the transport
recording every request — holding below target, holding equal to target, and the
device offline. **Observable, three cells.** (1) Below target: exactly one refill
request, asking for the SHORTFALL, read off the recorded request rather than
inferred from the resulting holding. (2) At target: NO refill request in that pass
— **with the presence sibling that a queued bill's send request IS recorded in the
same pass**, because an absence over a transport that made no calls at all is
satisfied by an offline device. (3) Offline: no refill request and the holding
unchanged. **RED CASE, NAMED — TWO:** a low-water threshold, which is what the
design refused and which reddens cell 1 for every holding between the threshold and
the target; and **a refill that asks for the TARGET on every pass rather than the
shortfall.** **THE CASE THAT DISCRIMINATES, and it is the second one:** the holding
is topped up either way, the operator sees `ample` either way, and every reading on
the device agrees. The difference is invisible on the device and lives entirely in
the reservation relation — nothing is ever re-issued, so each surplus block leaks
for ever. The discriminator is therefore a SERVER-side reading in the same staging:
after several passes with no seller created, the relation's row count for that
tenant is UNCHANGED from after the first pass, with the presence sibling that the
first pass DID create rows. **CAN A BROKEN IMPLEMENTATION SATISFY IT? No** — and
cell 2 alone cannot see the second red case, which is why the relation is read.
**CORRECTED (P-SELLERKIND-DESIGN-AMEND, 2026-08-24) — THE QUANTITY LEFT THE WIRE, SO
CELLS 1 AND 2 CANNOT BE READ OFF THE REQUEST; AND CELL 2 CONTRADICTED A SIBLING
CRITERION BEFORE THIS AMENDMENT TOUCHED ANYTHING.**

**THE CONTRADICTION FIRST, because it is not this amendment's doing and a reader
should not be left thinking it is.** Cell 2 above requires that a device AT TARGET
makes NO refill request in that pass. `A-FAILED-REFILL-IS-AN-UNKNOWN-OUTCOME-AND-COSTS-NOTHING-ELSE`
below stages *a full holding on the device* and asserts that the refill is attempted
in the LAST pass as well as the first. **Both cannot be staged**, and the two were
written into one set in one commit. One of them had to move, and the design's own
words — *every sync pass, while online, tops the holding back up to the target* — put
the request on every pass, so cell 2 is the one that moves and the sibling criterion
is untouched.

**WHAT REPLACES CELLS 1 TO 3.** The request carries the device identity and no
quantity, and the server computes the shortfall, so *asking for the shortfall* is no
longer a state of the wire and is not readable there. (1) Below target: one refill
request in the pass, and the relation's row count for that tenant rises by EXACTLY
the shortfall, read out of the relation — with the presence sibling that the device's
holding equals the target afterwards. (2) At target: one refill request, and ZERO new
rows in the relation, with the same presence sibling; **this cell now carries the
criterion's whole hazard and is stronger than the absence it replaces**, because a
route that mints on every call reddens it directly rather than by inference. (3)
Offline: no request REACHES the server and the holding is unchanged — the device's
attempt is not a defect and is not asserted against.

**AND THE RED CASES MOVE WITH IT.** *A refill that asks for the TARGET on every pass*
is unreachable, because there is nothing left to ask with. **In its place: a ROUTE
that mints the target on every call rather than the shortfall** — the same leak with
the decision moved to the server — and it reddens cell 2. The low-water threshold red
case is unchanged and still reddens cell 1. **THE DISCRIMINATOR IS UNCHANGED AND IS
STILL THE RELATION:** the device is topped up either way, the operator reads `ample`
either way, and only a server-side count separates them.

**THE NAME IS KEPT.** *ASKS FOR THE SHORTFALL* now describes what is minted rather
than who names it, and renaming would orphan the reference to this criterion in the
findings subsection below.

**A-FAILED-REFILL-IS-AN-UNKNOWN-OUTCOME-AND-COSTS-NOTHING-ELSE.** *(HEADLESS)*
Classified by the three-way rule this repository already holds, a failed refill is
UNAVAILABLE: the outcome is unknown, it is asked again next pass, for ever, with no
attempt cap, and it is NEVER terminal and NEVER parked — there is no payload to be
permanently wrong and no master data for an office to fix. **The design's own rule
is that a refill failure never blocks, parks or fails any other unit of work, and
getting it wrong strands a device that could still trade on the codes it already
holds.** **Staging:** the refill route refused by the transport while the send route
works, a queued bill owed, a full holding on the device, and several passes.
**Observable, four cells.** (1) The refill is attempted in the LAST pass as well as
the first — no cap — with the attempt count asserted EQUAL to the number of passes
the proof ran, a number produced by the staging and not written here. (2) The queued
bill reaches the server in the same pass in which the refill was refused. (3) The
owed count summed over every registry member is UNCHANGED across the refused refill
— **with the presence sibling that queueing one more bill DOES move that same number
in the same run** — so a refill has no queue entry, cannot refuse a sign-out and
cannot colour the strip over work nobody is waiting for. (4) **THE LEVEL IS DERIVED
FROM THE HOLDING AND NOT FROM THE LAST OUTCOME:** with a full holding and a refused
refill the level is `ample`, and in the same run, with an empty holding, it is
`exhausted`. **RED CASE, NAMED — TWO:** the refill modelled as an outbox kind, so a
bounce writes attempt and error columns and enters the owed counts; and a level
computed from the last refill's success, which reports `exhausted` while a full
holding sits in SQLite. **THE CASE THAT DISCRIMINATES, and it is the second:** both
implementations show a red badge on a device that has lost the network, and the
operator's first reading is identical. What separates them is whether the yard can
still create a walk-in — a state cell 4 reads directly and no badge reading can.
**CAN A BROKEN IMPLEMENTATION SATISFY IT? No.**

**THIS-KIND-KEEPS-EVERY-POLICY-DIFFERENCE-THE-DESIGN-NAMES.** *(HEADLESS)* The
differences are ENUMERATED here rather than counted, and the enumeration is the
criterion: `blocking: "independent"`, `rereadAfterEach: false`,
`concurrency: "parallel_rows"`, an `inFlightKey` that PREFIXES the row id with a
prefix distinct from the void kind's, and `resendIsIdempotent: true`.
**Observable, four cells.** (1) **`independent` MEANS THE SECOND ROW GOES IN THE
SAME PASS:** two local sellers owed, the first bouncing `retry`, and the second is
attempted in that same pass. (2) **A HELD ROW IS ADVANCED PAST:** a second pass
entered while the first seller's request is in flight attempts the SECOND seller,
with the presence sibling that the first is performed exactly ONCE across both
passes. (3) **THE PREFIX GETS A BEHAVIOURAL CELL, WHICH THE VOID KIND COULD NOT
HAVE.** The void's prefix is asserted as a declaration only, because a send and a
void of one bill are never simultaneously actionable and the state that would
separate a prefixed key from a bare one is unrepresentable. Here it IS
representable: a local seller id and a local bill id come from ONE generator and
live in two tables, so a fixture can give a local seller and an unparked bill the
SAME id, leave both owed, and hold one in flight — under a bare key the other is
skipped, under the prefix it is performed. (4) The policy object is asserted FIELD
BY FIELD against the list above. **RED CASE, NAMED — TWO:** `blocking:
"head_blocks"` on this kind, which every single-row staging passes because a lone
row has nothing behind it to block; and the bare `inFlightKey` the send kind uses.
**THE CASE THAT DISCRIMINATES:** one owed seller behaves identically under
`head_blocks` and `independent`, so cells 1 and 2 need two rows by construction.
**CAN A BROKEN IMPLEMENTATION SATISFY IT? No.** **ITS BOUND:** cell 4 compares
against a list written by the same author in the same commit, so it catches a LATER
edit and not this one's own error; cells 1 to 3 carry the claim today.

**THIS-KIND-DRAINS-BEFORE-BILLS-IN-ONE-PASS.** *(HEADLESS)* The registry literal's
member ORDER is load-bearing: a seller created and a bill weighed in one offline
stretch both become actionable in one pass only if the seller goes first.
**Staging:** one local seller owed, one bill weighed against it, both released
online, then exactly ONE pass — one by construction, so a second pass cannot be run
to reach green. **Observable:** at the end of that single pass the seller is settled
AND the bill carries a doc_no, **with the presence sibling in the same pass report:
one seller settled and one bill sent, reported together and keyed by kind.**
**RED CASE, NAMED:** a registry literal listing `bill_send` before `seller_create`,
which is a reordering with no diff anywhere else. Under it the bill is still parked
when the send kind's `owed()` runs, so it is not returned; the seller then settles;
and the pass ends with the bill owed until the next tick. **THE CASE THAT
DISCRIMINATES:** over two passes both orders reach the same end state, and every
assertion on the final queue is green under both. Only the ONE-pass staging
separates them. **CAN A BROKEN IMPLEMENTATION SATISFY IT? No.** **ITS BOUND:** it
pins the ORDER of these two kinds, not adjacency — a runner draining a third kind
between them still satisfies it, and should.

**OWED-ASKS-WHO-CREATED-THE-SELLER, AND THE RELEASE DOES NOT.** *(HEADLESS)* The
owner predicate is a requirement on every kind and this kind asks a THIRD question:
the send kind filters on who WEIGHED the bill, the void kind on who ORDERED the
reversal, and this one on **who CREATED the seller.** **AND THE RELEASE CROSSES
THAT FILTER, WHICH IS THE HALF NO SINGLE-KIND FIXTURE REACHES.** **Staging:** two
identities on one device; a local seller created by A; a bill weighed by A against
it; a bill weighed by B against the same local seller; a second local seller created
by B. **Observable, four cells.** (1) With A signed in, `owed()` and `owedCount()`
for this kind return A's seller and NOT B's — an absence with its presence sibling
in the same call. (2) With NO identity stored, `owed()` is EMPTY for this kind, which
is the fail-closed direction. (3) **THE RELEASE IS NOT OWNER-FILTERED:** when A's
seller settles, BOTH bills lose their park and both carry the server's seller id —
**and B's bill is still absent from A's sendable queue**, because the queue's own
owner predicate holds it, and it enters that queue when B signs in. (4) The presence
sibling for cell 3: B's own seller, untouched, is still owed and its bills are still
parked. **RED CASE, NAMED:** a release that carries the owner predicate, written by
somebody sweeping this store for statements missing one — which is a real sweep this
repository has run before, at the sites the queue and the void list were
hand-repaired at. **THE CASE THAT DISCRIMINATES:** with one identity the filtered
and unfiltered releases are identical. With two, the filtered release strands B's
bill FOR EVER — the seller settles exactly once and there is no second event to
release it — for cash already paid, on a row hard rule 5 forbids deleting. **CAN A
BROKEN IMPLEMENTATION SATISFY IT? No**, and cell 3 is the only one that sees it: a
kind filtered by the BILL's owner passes cells 1 and 2 completely.

**THIS-KIND-RECOVERS-AT-BOOT-AND-THE-SWEEP-IS-REAL.** *(HEADLESS)* **This supplies
the outbox step's stated residual its first instance.** That step's boot criterion
asserts the boot's return map is keyed by kind and its key set EQUALS the member
set — which measures that the boot ENUMERATES — and records that nothing measures
that a second kind's recovery WORKS, because no kind with DURABLE in-flight state
existed. This kind has one: `claim` is a conditional UPDATE and `recover` is a real
sweep, unlike the void kind's correct no-op. **Staging:** a local seller left in its
in-flight state, the process killed, the app reopened, one pass run. **Observable,
two cells.** (1) The row is ATTEMPTED in that pass. (2) The id set `recover` returned
EQUALS the set of rows that were in flight — **equality, never containment, because
containment asks what is present and only equality asks what is in excess**, so a
sweep that returns every owed row rather than the stranded ones reddens it, and a
seller that was NOT in flight is the presence sibling on the other side of that
equality. **RED CASE, NAMED:** `recover` returning an empty array — the void kind's
correct answer copied into a kind that has durable state. **THE CASE THAT
DISCRIMINATES:** the empty array satisfies the inherited key-set cell completely,
because that cell asks whether the boot visited the kind and not what the visit did.
This is the first cell in the tree that can tell them apart. **CAN A BROKEN
IMPLEMENTATION SATISFY IT? No.**

**THE-LOCAL-ROW-SURVIVES-A-REFRESH-THAT-DELETES.** *(HEADLESS)* `saveSellers` runs
an unconditional `DELETE FROM cached_sellers` before inserting, and the design does
NOT weaken it: an unsettled local seller lives in a table of its own beside
`local_bills`, where owed work lives. **Staging:** a local seller created offline; a
decoy row written into `cached_sellers` before the refresh; then a refresh whose
payload contains neither. **Observable, four cells.** (1) The local row still exists
and is still owed. (2) **THE DELETE STILL RUNS, and this is cell 1's presence
sibling rather than a separate check** — the decoy is GONE after the refresh and a
seller that WAS in the payload is present, both read in the same pass; without that
pair cell 1 is satisfied by a refresh that did nothing at all. (3) The picker offers
the local seller
after the refresh. (4) **THE WINDOW:** after the seller settles but BEFORE any
refresh has carried the server's row down, the picker STILL offers it — the design
says the local row stops being offered once it has settled AND the server row has
arrived, never at settle alone. **RED CASE, NAMED — TWO:** an origin marker put on
`cached_sellers`, which delete-and-reinsert DESTROYS rather than wrongly carries
forward — a third rewrite shape no DO UPDATE list covers; and the local row dropped
from the picker at settle. **THE CASE THAT DISCRIMINATES, and it is the second:** in
any staging where a refresh follows the settle immediately, dropping at settle and
dropping at arrival are indistinguishable, because the server's row is there either
way. Only a refresh-free interval between the two separates them, and in that
interval the seller the yard has just created disappears from the picker while a
truck is on the weighbridge. **CAN A BROKEN IMPLEMENTATION SATISFY IT? No.**

> **HAZARD FOUND WHILE BUILDING THE PARK (P1.8b GATES, 2026-08-25) — CELL 4, AS
> WRITTEN AND CORRECTLY IMPLEMENTED, CREATES A PATH TO A TERMINALLY FAILED BILL
> FOR CASH ALREADY PAID.** Recorded HERE, at the criterion, and not only in the
> queue: a session building the rework will read this criterion, build exactly
> what it says, and ship the hole with every test agreeing — and it will not be
> editing the file a queue line lives in.
>
> **THE WINDOW CELL 4 REQUIRES IS THE WINDOW.** It demands that the picker go on
> offering the local row after the seller has SETTLED and before a refresh has
> carried the server's row down, and it is right to: dropping at settle makes
> the seller vanish while a truck is on the weighbridge. But a bill weighed
> INSIDE that window is weighed against the LOCAL id, and:
>
> - it is **NOT PARKED**, because `buildLocalBill` parks a bill whose seller is
>   local and the park's release has already run — the seller is `synced`;
> - **NOTHING RELEASES IT**, because the release fires inside the seller kind's
>   `record` on the settle, and that settle has already happened. A seller
>   settles ONCE and there is no second event;
> - so it enters the sendable queue carrying an id the server has never seen,
>   and `POST /bills` answers **422 — PERMANENT, terminal** — which is the exact
>   outcome the park exists to prevent, arriving from the other end.
>
> **UNREACHABLE AT `48c422a`, AND ONLY BECAUSE NO PICKER EXISTS.** Nothing in the
> app can weigh a bill against a local seller at all: the cart's `Draft` carries
> a bare `seller_id` that can only have come from `cached_sellers`, and
> `App.tsx`'s one call site passes `{ kind: "server", … }`. The hole opens on the
> day the union in cell 3 is built, which is the day this criterion is
> implemented.
>
> **NO MECHANISM IS INVENTED HERE, and that is deliberate.** Naming the window
> and the condition is the whole of what the building phase owed; choosing
> between the candidates — resolving the id at send time, a release that also
> runs on the pass, or a picker that hands out the SERVER id once it has one — is
> a design decision and belongs to whoever takes it. Queued at
> `OPEN_ITEMS.md § Decisions open — the owner's, not the code's`
> "A BILL WEIGHED IN THE PICKER'S SETTLE-TO-REFRESH WINDOW IS NOT PARKED AND IS NOT RELEASED".

**THE-LOCAL-SCHEMA-ADDS-AND-DOES-NOT-REBUILD.** *(HEADLESS)* The design's answer to
the survey's `sync_state` CHECK bullet is that nothing touches it: the new table is
created with the CHECK it needs, `local_bills`'s CHECK is not altered, and the park
is a nullable column PAIR added by the migrator that asks `PRAGMA table_info` what
the table already has. **Staging:** a database written at the PREVIOUS schema
version, holding unsynced bills, opened by the new build. **Observable, three
cells.** (1) `local_bills`'s CHECK member set, read out of the live schema and not
off the source file, is EQUAL to the set it held before — equality and not
containment, because a rebuild that ADDED a state passes a containment test and is
exactly what the design forbids. (2) The rows that were owed before the upgrade are
still present and still owed, **with the presence sibling that the new columns exist
on those rows and are null.** (3) The new table's own CHECK member set is asserted.
**RED CASE, NAMED:** `local_bills` rebuilt to widen its CHECK so the park can be a
new `sync_state` value. **THE CASE THAT DISCRIMINATES:** a rebuild that copies rows
correctly passes cell 2 completely and is still the operation the design refuses to
perform on a database holding a shop's unsynced bills; cell 1's equality is what
sees it. **CAN A BROKEN IMPLEMENTATION SATISFY IT? No.**

**THE-DEVICE-IDENTITY-OUTLIVES-A-SIGN-OUT.** *(HEADLESS)* The holder is a DEVICE,
the tree has no device identity, and the design puts the new one in SQLite and never
in the keystore, because reserved codes must outlive a sign-out. **Staging:** a
device identity minted, codes reserved against it, a sign-out performed, the app
reopened. **Observable, three cells.** (1) The identity read after the sign-out
EQUALS the one read before — **with the presence sibling that the keystore entry the
sign-out DOES delete is gone in the same run**, because "equal before and after" is
satisfied by a sign-out that did nothing at all. (2) The reserved codes are still
readable and still spendable afterwards. (3) It is minted ONCE: a second open of the
same database returns the same value, and no second row exists. **RED CASE, NAMED:**
the identity kept beside the token in the keystore, which passes every reading taken
inside one signed-in session and loses the device's whole holding at the first
sign-out — unrecoverably, because nothing is ever re-issued. **THE CASE THAT
DISCRIMINATES:** within a session the two storages are indistinguishable; only a
sign-out separates them, which is why the sign-out is IN the staging rather than a
follow-up. **CAN A BROKEN IMPLEMENTATION SATISFY IT? No.** **AND ITS BOUND, STATED
RATHER THAN HIDDEN, BECAUSE IT IS THE HALF THAT WILL ROT:** the SQLite database is
measured untouched by a sign-out today, and the sign-out clearing this project still
owes is unbuilt — so cell 1 is currently kept green by the ABSENCE of a feature and
not by anything protecting these two tables. A cell held up by a second mechanism is
evidence about whichever mechanism still works. Whoever builds that clearing must be
told, at the tables themselves, that these two are exempt; this criterion cannot
make them so.

**EVERY-SURFACE-SEES-A-KIND-THAT-IS-NOT-A-BILL.** *(HANDSET, plus HEADLESS for the
contract)* **The seller kind is the FIRST kind whose rows are not in `local_bills`**,
and the surfaces are one statement over that table. `UnsentBreakdown`'s own type
text claims its counts are DISJOINT and COMPLETE over every unsent row; the day this
kind lands that claim is false, and the sign-out gate refuses or permits on a number
computed from it. **The design's refill argument already depends on this** — it
refuses to make a refill a kind precisely because a failed refill would then enter
the owed counts, refuse a sign-out and colour the strip — so an owed seller create
reaching those counts is assumed by the design and stated by it nowhere.
**Staging, one:** one local seller owed, NO bill pending, and no terminally failed
bill on the device. **Observable, six parts, ALL IN ONE RUN over that one staging**,
because a defect living between two correct renderers is invisible to either alone.
(1) The gate REFUSES the sign-out. (2) The sheet, READ ON THE HANDSET and reported
VERBATIM in Thai, must not carry `บิลทั้งหมดส่งขึ้นระบบครบแล้ว`, **with a presence sibling in
the same concatenation naming the owed seller** — a card naming nothing satisfies an
absence. (3) The strip, read on the same handset in the same staging and reported
verbatim, must not carry `ส่งครบแล้ว`, with the same presence sibling. (4) **THE
PRESENCE SIBLING HAS ITS OWN CONTROL:** a SECOND staging with nothing owed at all, in
which that sentence is ABSENT from both surfaces, or a line added unconditionally to
every card satisfies (2) and (3) everywhere including where the surfaces are right.
(5) The gate and the sheet read the SAME value, asserted as an equality between the
two inputs in one render. (6) `UnsentBreakdown`'s completeness claim is re-derived
and either re-scoped in the type's own text or the type is split, and whatever value
the gate reads is DECLARED on the `LocalStore` contract. **RED CASE, NAMED:** the
bill-only statement used unchanged — the strip says the work is sent, the gate
permits the sign-out, and the seller create drains later under whoever signs in
next. **THE CASE THAT DISCRIMINATES:** a build that counts the seller in the gate but
not in the strip is green on (1) and red on (3) alone, which is the seam the parts
share a staging in order to reach. **CAN A BROKEN IMPLEMENTATION SATISFY IT? No.** And **before any device reading
here is believed**, state which bundle and which server
process produced it — `npx expo start -c` and a full reload BEFORE the staging that
produces the reading, and the server's start time postdating the commit under test
with a request through the changed path
(`CLAUDE.md § Boot check` "WHICH BUNDLE THE HANDSET IS RUNNING").
**CONFIRMED (P-SELLERKIND-DESIGN-AMEND, 2026-08-24) — THIS CRITERION STAYS.** The
design now rules on the S10 question this criterion was written under: S10 defers the
DRAWING, and a sign-out gate is a decision about whether an action proceeds. The
findings subsection below says that if the owner reads S10 the other way, this is the
criterion to drop; **he does not, and dropping it would ship a sign-out that loses
work.** Its scope is unchanged, its parts are unchanged, and the strip's wording moves
only as far as stops it stating something false.

---

#### WHAT THIS SELLER-KIND SET DOES NOT COVER, SAID BEFORE ANYONE RUNS IT

- **HOW MANY CODES A DEVICE SHOULD HOLD.** The mechanism is measured; the number is
  an assumption the design labels as one, and no criterion here can move it. It
  needs a shop trading, which is P2.4's.
- **WHETHER EXHAUSTION WILL BE RARE.** A frequency claim needs a real shop. What is
  covered is the MECHANISM that produces the reserve level and the sentences derived
  from it — legible, which the design claims, and not rare, which it does not.
- **A SECOND DEVICE AND A SECOND PROCESS.** Every staging above is one device and
  one process. The reservation relation's primary key is what holds across devices
  and it is asserted at the relation, not across two handsets.
- **THE DESKTOP.** P1.15 creates sellers online and holds no reservation. The
  supplied-code refusal above is the only place the two paths meet, and it is
  asserted from a staff session rather than from the desktop client.
- **THE SELLER FACE PHOTOGRAPH.** A fourth kind with a payload measured in
  megabytes. Nothing here stages one, and this kind's row carrying its own payload
  is an argument that explicitly does not transfer to it.
- **A CALLER WHO INVENTS DEVICE IDENTITIES.** Named in the findings below as a
  bound rather than measured: nothing above stages a caller minting reservations
  under identities it makes up.
- **A KIND WHOSE RE-SEND IS NOT IDEMPOTENT.** This kind declares
  `resendIsIdempotent: true`, so the outbox step's `needs_review` arm is STILL
  asserted over no kind after this one lands. That residual is unchanged and is not
  closed here.
- **A CREATE REFUSED PERMANENTLY, AND THE BILLS PARKED BEHIND IT.** Added 2026-08-24
  by P-SELLERKIND-DESIGN-AMEND. Searched this set for `422`: every hit is the BILL's
  422 and none stages a refused SELLER create — **not found with these words.** The
  design now decides what happens to that create's reserved code; it decides nothing
  about a bill whose seller will never settle, and no criterion here reaches either.

---

#### WHAT THE DESIGN LEAVES UNTESTABLE OR UNDECIDED — findings, reported and not applied

**These are FINDINGS against the design, produced by writing criteria from it.
Nothing here edits it, and nothing here is authorised work.** Each says what a
criterion could not be written for and why, so a later reader can see which gaps
were known before the build started.

- **THE ASSIGNER'S ATTEMPT BUDGET AND A RESERVED BLOCK, AND THIS IS THE ONE THAT
  BREAKS THE COUNTER.** The design states the second required decision as *the
  minting path must SKIP reserved codes in the same transaction that inserts*, and
  says nothing about WHERE the skip lives. `_next_seller_code` derives its candidate
  from `max(code)` over `sellers` alone, and the no-code path retries a bounded
  number of times over an unchanged table; a reserved block sits immediately above
  that maximum. **A skip implemented as a post-check plus the existing retry
  therefore refuses an ONLINE create as soon as one handset holds a block longer
  than that budget** — the yard's counter stops being able to add a seller because a
  phone is carrying codes, which is the failure this step exists to remove arriving
  from the other end. `THE-ASSIGNER-STILL-TERMINATES-ABOVE-A-RESERVED-BLOCK` above
  measures it; the design does not name it.
- **A LOST REFILL RESPONSE BURNS A WHOLE BLOCK, SILENTLY AND REPEATEDLY, AND NO
  CRITERION CAN BE WRITTEN FOR IT.** *An unused reserved code leaks for ever* and
  *if the refill fails, nothing else is affected* are both true OF THE DEVICE and
  jointly false of the CODE SPACE. A refill whose response is lost after the server
  committed leaves the device's shortfall unchanged, so the next pass asks again and
  the server mints again; nothing is ever reclaimed, and nothing anywhere prints a
  number that moved. **The cheapest bound is to make the refill route idempotent for
  a device — ensure this device holds its target and return what it holds — which is
  hard rule 4's shape and would cost a lookup.** That is a DESIGN decision and is not
  taken here: a criterion written for it would be the decision, which is the one
  thing this step must not do.
- **THE BRIEF FOR THIS STEP ASKED FOR A REFILL THRESHOLD, AND THE DESIGN REFUSED
  ONE.** Recorded because the two disagree in writing and a later reader will meet
  both. The design decides *every sync pass, while online, tops the holding back up
  to the target*, and rejects a low-water threshold as a second unmeasured constant.
  So "a refill that fires on every pass" is not a wrong behaviour to be caught, it
  IS the design, and a criterion staging a reserve one unit either side of a
  threshold has nothing to stage.
  `A-REFILL-ASKS-FOR-THE-SHORTFALL, AND FOR NOTHING WHEN THERE IS NONE` replaces it
  and reaches the same hazard through the quantity requested.
- **`low` IS THE NORMAL STATE OF A WORKING DEVICE, FOR AS LONG AS A POLL INTERVAL.**
  The level's own definitions make `ample` mean *at target* and `low` mean *below
  target and still able*, and the refill tops up every pass — so an online device
  that has just created one walk-in is `low`, in amber, until its next pass, over a
  condition that needs nobody and resolves itself. The design's tone rule is that
  amber and red divide on whether something needs a human now, and this is the one
  state that meets neither reading. **Nothing here changes it**; it is recorded
  because the sentence written for `low` will be read far more often than the design
  expects, and because a warning that fires routinely is a warning people stop
  reading.
- **A PERMANENTLY REFUSED CREATE LEAVES A RESERVATION HELD AND A CODE THE DEVICE
  CANNOT SPEND.** The states are `held` and `spent` with one transition, and there
  is no state for *the create was refused on the payload's own merits and this
  reservation will never be spent*. Under no-reclaim that is simply another leak and
  is consistent. What the design does not say is what the DEVICE does with the code:
  keep it, and the reserve level over-counts what the yard can actually do; drop it,
  and the next pass tops up, which is right. No criterion is written because either
  answer is a decision.
- **THE RELEASE'S OWNER QUESTION IS NOT ANSWERED IN THE DESIGN.** `record` releases
  *every bill parked behind* a settling seller, and `owed()` is filtered to the
  creating identity. Whether the release carries that filter decides whether a bill
  weighed by a second person against the same local seller is released or stranded
  for ever. `OWED-ASKS-WHO-CREATED-THE-SELLER, AND THE RELEASE DOES NOT` above takes
  the only answer that does not strand a bill, and says so out loud rather than
  leaving it to be inferred — because every neighbouring statement in that store was
  hand-repaired to ADD an owner predicate, and the next sweep for a missing one will
  find this statement and be wrong.
- **THE SURFACES ARE DEFERRED AND DEPENDED ON IN THE SAME DOCUMENT.** The design's
  not-covered list defers any screen and any Thai sentence to S10, and its refill
  argument simultaneously relies on an owed unit of work reaching the owed counts,
  refusing a sign-out and colouring the strip. Both cannot hold. The outbox step's
  own surfaces criterion was left unlanded there by scope and is inherited here,
  where it stops being avoidable: this is the first kind whose rows are not in
  `local_bills`, and the type carrying the counts states a completeness claim that
  becomes false the day the kind lands. `EVERY-SURFACE-SEES-A-KIND-THAT-IS-NOT-A-BILL`
  above is written on the reading that a GATE DECISION is not a drawing; if the owner
  reads S10 the other way, that criterion is the one to drop, and dropping it ships a
  sign-out that loses work.
- **A CALLER CAN MINT RESERVATIONS UNDER IDENTITIES IT INVENTS.** The refill route
  takes the same gate as `POST /sellers`, so staff may call it, and the device
  identity is client-minted and client-supplied. The design's not-covered list bounds
  the token — a caller inside the tenant who obtained another device's token could
  spend that reservation, and that caller can already create sellers — and that
  argument does not reach this one: creating sellers by hand costs one request per
  visible row, while minting under invented identities consumes the code space in
  blocks and leaves only gaps. **Recorded as a bound and not as a stop**, because
  every caller here is already inside the tenant; it becomes sharper if the assigner
  finding above is repaired by anything short of a derivation that skips the whole
  relation.
- **WHAT WAS CHECKED AND FOUND SOUND, said so the list is not read as one-sided.**
  The reservation's key choice, the two-state machine and the rejection of a third
  state, the no-reclaim decision and its stated cost, the device-not-user holder
  argument, the outcome union's separation from `CreateSellerOutcome`, the registry
  member order, the local-table-beside-`local_bills` choice and its dissolution of
  the survey's first two bullets, and the decision to park the bill on the device
  rather than re-answer the server's 422 — each was read against the artefact it
  claims about, and each held. The 422 half in particular is what stops the first
  offline walk-in becoming a terminally failed bill for cash already paid.

**ANSWERED (P-SELLERKIND-DESIGN-AMEND, 2026-08-24) — FOUR OF THESE ARE CLOSED IN THE
DESIGN ABOVE, AND EVERY FINDING IS LEFT EXACTLY AS WRITTEN**, because a finding is the
record of what was true when the criteria were written, and a finding rewritten after
the fact is a record of nothing.

- **THE ASSIGNER'S ATTEMPT BUDGET.** The skip now lives in the CANDIDATE DERIVATION,
  as the successor of a maximum over `sellers` and the reservation relation together,
  and the design says what serialises it against a concurrent refill. This set gains
  a third cell on `THE-ASSIGNER-STILL-TERMINATES-ABOVE-A-RESERVED-BLOCK` and a
  corrected discriminator: the non-walking post-check is refused at a block of ONE,
  which the block-length sentence could not see.
- **A LOST REFILL RESPONSE.** The route is a top-up identified by the device, minting
  the shortfall it computes itself and answering with the device's WHOLE holding.
  `A-REFILL-ASKS-FOR-THE-SHORTFALL, AND FOR NOTHING WHEN THERE IS NONE` is corrected
  — and correcting it resolved a contradiction that was already in this set: it
  required NO request at target while
  `A-FAILED-REFILL-IS-AN-UNKNOWN-OUTCOME-AND-COSTS-NOTHING-ELSE` stages a full
  holding and asserts a request every pass. The second is untouched.
- **A PERMANENTLY REFUSED CREATE.** The code returns to the device's spendable
  holding — the reservation was never spent, because `held → spent` happens only
  inside the seller INSERT — and the reserve level is defined as what the device can
  still spend rather than what the server has issued.
- **`low` IS THE NORMAL STATE.** The level keeps its value and its definition and
  loses its tone. Tone is derived from the level by one question, and on that rule
  there is no amber anywhere in this mechanism.

**THE SURFACES FINDING IS RULED RATHER THAN ANSWERED**, at the design's not-covered
list above: S10 defers the drawing and not a gate decision, so
`EVERY-SURFACE-SEES-A-KIND-THAT-IS-NOT-A-BILL` stays and the sentence in this list
about dropping it does not apply.

**UNCHANGED AND STILL OPEN:** the brief-versus-design threshold disagreement, which
is a record rather than a gap; the release's owner question, which the criterion
above already answered in the only non-stranding direction; and a caller minting
reservations under invented device identities, which the top-up bounds per identity
and does not bound at all in the number of identities.

**AND ONE NEW FINDING, PRODUCED BY CLOSING THE THIRD.** A bill parked behind a seller
whose create is permanently refused has no release event: the release fires on a
settle and that seller never settles. It is cash already paid on a row hard rule 5
forbids deleting, nothing in this set stages it, and it is owed before the build
rather than after. It is recorded at the decision that produced it and in the
design's not-covered list.

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

**CORRECTED 2026-08-20 — "THE LAST STAGE-1 STEP" IS NO LONGER TRUE, AND IT STOPPED
BEING TRUE ON 2026-08-17 rather than today.** P1.18 was minted after this sentence
and P1.19 through P1.22 follow it; the clause is left above because it was true when
written and because what it is REALLY saying — that S3 put slip printing inside the
pilot bar — is untouched by anything that came after. **The half that is dead is the
ORDINAL, not the argument.** It is corrected here rather than swept because a search
for `P1.18` or `P1.22` finds nothing in it: the sentence names no step but this one,
which is the shape a membership change falsifies without naming the member.

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

**SUPERSEDED 2026-08-23 IN ONE CLAUSE ONLY, AND THE PARAGRAPH ABOVE IS LEFT
EXACTLY AS WRITTEN BECAUSE EVERY OTHER CLAUSE IN IT IS STILL TRUE.** The decision
is **no longer open**: S22 above answers it — a server-minted reservation, taken
while online — so *is an OPEN DECISION* and *until it is answered* have both
turned, and the removal's ARGUMENT is untouched by that. **What has NOT changed is
the tree.** The member is still absent from the design, still absent from the
registry, and nothing in this step specifies it: S22 answers what IDENTIFIES a
locally created seller and answers none of how many codes a device holds, when
they refill, or what the screen says when they run out. **So the sentence to read
forward is the last one — the kind returns in the step that answers the
decision — and that step is now unblocked rather than blocked.** This clause is
superseded and not edited because the paragraph is the record of why the member
went, and a reader meeting it should see that the removal was right at the time
and is still right now.

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

**SUPERSEDED 2026-08-20, stage 3 — `record` carries two further parameters, and
this is a dated correction to the printed member above, derived rather than
chosen.** The chain: `classify` returns a disposition that deliberately carries
no reason, so the RUNNER cannot tell a 401 from an offline bounce —
`sessionExpired` versus `retryable` is a fact about `SendOutcome`, and both
classify `retry`; only the handler holds the raw outcome; and `record` is the
only member that runs after it. So the interface as printed cannot satisfy this
design's own pass-report requirement below ("every field those six lines read
must still be produced") — and `backoffsCleared` seals it, because that field is
the return value of a store write only `record` makes, so no runner and no pure
member can fill it. The signature built at `47d17ab` is
`record(row, o, d, attempt, next: Date | null, now, result: SyncRunResult)`:
`next` is the option the inherits section below already names in its own words
(the drain calls `nextAttemptAt` and its "result handed to `record`"), and
`result` is the kind's own fold of its outcome into the pass counters — one
member per thing `engine.ts` did for exactly one kind, which is this
interface's own generative sentence. Both independent reviews of this design
ran against the printed form; this paragraph is why the tree disagrees with it.

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

**ONE DRAIN, NO HAND-WRITTEN LOOP PER KIND — AND IT IS STATED AS RULES, NOT
PRINTED AS CODE.** The policy selects behaviour inside a single function, and the
function is generic over `Row` and `Outcome` so it can name no kind. The rules
that function must satisfy — each of which has a criterion below that can turn
red, which a printed line does not:

- **Runner state outlives a pass.** The set of halted kinds, the in-flight key
  set, and the per-kind pass lock belong to the RUNNER — not to a pass and not
  to a row. A pass over a `serial_per_kind` kind that cannot take the lock
  returns without reading rows; a `parallel_rows` kind takes no lock. **The
  lock is released on every exit path out of the pass, a throw out of
  `perform` included** — recorded as a constraint on stage 3 in the inherits
  section below, with the proof that catches a leak.
- **Kinds drain in a FIXED order within one pass, and `bill_send` drains to its
  stop before `bill_void`'s owed rows are read.** Transcribed, not chosen:
  `engine.ts:394` calls `applyVoids` after the send loop closes at `:386`, and
  the comment at `:388-393` carries the reason — a bill created offline and
  voided offline becomes void-owed the instant its send settles
  (`listVoidsToApply` requires `sync_state = 'synced'`), so the void applies in
  the SAME pass; reversed, the void stays owed for a whole poll interval, and a
  crash in that window looks exactly like a bill the owner cancelled while the
  server still shows it as active. The runner drains kinds in the order it
  enumerates the registry, so the member order of the registry literal is
  LOAD-BEARING; no criterion in the previous revision read that order —
  re-derived 2026-08-19 by searching that criteria set for *same pass*,
  *order*, *before*, *after* and *enumerat*: every hit is within one kind or
  about registry totality — and `SENDS-SETTLE-BEFORE-VOIDS-ARE-READ` below now
  pins it.
- **A batch is iterated by CURSOR, never by re-selecting its first row.** A
  pass reads `owed(limit)` into a batch and moves a cursor over it, so a row
  passed over cannot be handed back by the same batch — the first draft's
  non-advancing loop is the named red case of
  `THE-DRAIN-ADVANCES-AND-TERMINATES`.
- **A held or not-due row is not attempted.** A row whose in-flight key is
  already held, or whose `dueAt` has not arrived — under the clock-sanity read
  that treats an over-horizon schedule as due now — is passed without an
  attempt: under `head_blocks` the kind's pass ENDS; under `independent` the
  cursor ADVANCES.
- **A lost claim is not an outcome.** `claim(row)` answering false performs
  nothing, classifies nothing and records nothing; the pass reports the skip in
  the field `noteSkip` writes today, the cursor advances, and the row is still
  owed.
- **One unit of work is claim, perform, classify, record — with the row's
  in-flight key held from the successful claim until `record` returns**, and a
  throw out of `perform` converted by `onThrow` into the kind's own outcome
  before `classify` sees it.
- **After `record`, the disposition decides the pass.** `halt_kind` stops the
  KIND, durably — the paragraph below owns that argument. `retry` under
  `head_blocks` ends the kind's pass: the row is still owed, which is the rule
  the table below derives. Every other disposition advances.
- **`rereadAfterEach` selects what "advance" means after a row that advanced
  the queue.** TRUE: the batch is discarded, re-read, and the cursor reset —
  which is how a bill freed by `clearBackoffForPending` goes in the SAME pass.
  FALSE: the cursor moves within the one batch the pass read.
- **A pass terminates under every policy.** Every iteration either advances the
  cursor or ends the pass, each row is attempted at most once per pass, and the
  iteration count is bounded by the batch limit — the bound covers the re-read
  path too.

**WHY NO LOOP BODY IS PRINTED HERE, RECORDED SO THE NEXT AUTHOR DOES NOT
HELPFULLY ADD ONE BACK.** Three drafts of this design printed executable
pseudo-code, and every defect either review found in the mechanism lived in the
printed code. Stage 2's block held a loop that re-selected its batch's first row
under `while (true)` — it could not advance and did not terminate — beside a
`rereadAfterEach` flag no printed line read. Stage 2b rewrote that block, and the
rewrite printed a pass lock acquired and released on no path, declared a
schedule member no printed line called, and reported skips through a `noteSkip`
that had no channel out of the pass. Each block passed the session that wrote it
and fell to the next independent reader. **A code block in a design document is
the only artefact in this repository written like code and reviewed like
prose:** no typechecker reads it, no proof runs it, and it has no exit code —
every discipline this project owns is built on execution, and a printed loop is
exempt from all of it while inviting the reader to execute it in their head,
which is how it gets reviewed as if it had been run. So the design keeps the
DECISIONS — the types, the member contracts, the policy values, and the rules
above — and prints no statement sequence. The statement sequence belongs to
stage 3, under `mobile/src/`, where both typecheck programs and the proof suite
reach it.

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
appears in `listVoidsToApply`'s predicate — three of whose clauses are
`void_requested_at IS NOT NULL AND voided_at IS NULL AND void_refused_at IS NULL`;
the full predicate also carries the requester pair and
`sync_state = 'synced' AND doc_no IS NOT NULL`, which is load-bearing for the
staging repair recorded at the void criterion below — so a bounced void is owed
again on the next read, and a loop re-selecting its batch's first row returns the
same row for ever, re-POSTing it inside one pass. Termination is now a property
that can be STATED rather than hoped for — the terminating rule above: every path
either advances the cursor or ends the pass, and the iteration bound covers the
re-read path, so a pass ends within the batch limit under every policy.

**`rereadAfterEach: false` NOW HAS A MEANING.** In the first draft the read was
unconditional at the top of the loop and the flag appeared only in a trailing
comment, so no value of it changed anything and the loop had no cursor a snapshot
could have been iterated with. It is now the advance rule stated above: TRUE
discards and re-reads the batch after every row that advanced the queue; FALSE
moves the cursor within the batch already held.

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

Nothing here unifies the policies; what is unified is the one rule set that reads
them.

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

**SUPERSEDED 2026-08-20, stage 3, in one clause of the paragraph above: "on a
LOST DURABLE CLAIM and on nothing else" was FALSE of the code it described.** At
`91d49d0` the send loop also called `noteSkip` on the in-memory in-flight hold —
the branch at `engine.ts:347-349` at that sha, whose own comment reads "Being
sent by another pass. Also a stop, not a skip" — so the field had two writers,
not one. The runner transcribes both branches. What then makes the sentence TRUE
of the mechanism, by a route this design did not argue: under the process-scoped
pass lock a second pass over the send kind returns without reading rows, so
within one process the held-head branch is unreachable for `bill_send` and a
lost durable claim is the field's one live writer — the held-head skip stays as
defence in depth.

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
MEASURED — AND THE MEASUREMENT FAILED BY FINDING LESS, INSIDE THE SECTION THAT
NAMES THAT FAILURE.** This paragraph read: `local_bills` has **27 columns** at
`mobile/src/adapters/sqlite/schema.ts` on 2026-08-19, counted by reading the
`CREATE TABLE` body and matching column declarations with `grep -cE`.
**Superseded 2026-08-19, found by the second review and re-derived here: the
table has 28 columns AT RUN TIME.** `master_as_of` appears nowhere in the
`CREATE TABLE` body — it is appended by `ADDED_BILL_COLUMNS`
(`mobile/src/adapters/sqlite/schema.ts:357`) on every `initConnection`, fresh
installs included, and it is live: `BillRow`, the shared `COLUMNS` select list
and `billInsertParams` all carry it. The instrument read the schema's STATIC
text while the column set is a RUN-TIME property; the count was correct about
the wrong object. The criteria below read a MINORITY of the columns back after a
pass, and no further figure is written here because it moves with the set. FIVE
that are load-bearing and are not read back by any cell — the fifth found by the
second review:

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
- **`first_attempt_at`, the fifth.** The total-stuck clock: stamped once by
  `COALESCE` in `markPendingAgain`, `markSessionExpired` and `markSendForbidden`,
  surfaced through `pendingQueueSnapshot`'s head, and read by `queueHealth` to
  compute how long the head has been blocked. A `record` that stopped stamping it
  holds that clock at zero while the queue jams, and the poison criterion cannot
  see it: its cells read the two SERVER-error columns, a different pair with a
  different reset rule.

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
than as a state or as nothing. **Superseded 2026-08-19, in the direction that
strengthens the catch.** `runUntilQuiescent` (`engine.ts:566`) BOUNDS its polling at
two hundred passes on the injected clock, whose sleep is instant in a proof, so a
leaked lock does not hang the suite — it STARVES it: every pass after the leak
returns without reading rows, the staged final state never arrives, and the
assertion on that state goes red in the same run. Seven proof files call
`runUntilQuiescent` — measured 2026-08-19 with `grep -l` over `mobile/src/proof/`:
proveSync, proveVoid, proveVoidOwner, proveVoidTerminal, proveSignOut,
proveForbidden, proveClock — so this state IS constructed-and-caught by the suite's
first run, and lock release on every exit path is recorded as a constraint on
stage 3 in the inherits section below, with that suite as its catch.

**AND THE HONEST SUMMARY.** All five directions returned something this time, against
one in the previous answer. Two of the findings changed the DESIGN rather than the
criteria, which is the outcome the restructuring of stage 2 was for. Three are
recorded as residuals and not closed: the per-bill card, the four unread columns, and
the master cache. **The set is stronger and it is not complete**, and the one thing
this revision cannot do for itself is tell whether the five directions are the right
five.

---

#### THE CRITERIA, DERIVED FROM THE DESIGN ABOVE

**These replace the seven, and this is their THIRD revision.** The first derived
set was read by an independent pass on 2026-08-19 and stopped again: two criteria a
broken implementation satisfies, three properties no criterion reached, and a
printed drain loop that could not advance past its first row. The design above moved
first, because four of the findings were about the mechanism rather than about the
wording. **The second derived set was read by a second independent pass, also on
2026-08-19, and stopped a third time:** five stop-class findings — two repaired in
this revision because no proof would catch them (the unpinned cross-kind drain
order, and a void staging the stores cannot produce), three recorded as constraints
on stage 3 in the inherits section below, each with what catches it named — and
seven improve-class findings recorded there as stage-3 inputs. **DESIGN REVIEW ENDS
WITH THIS REVISION**; the boundary and its argument are recorded in the inherits
section. **They are NAMED, not numbered**, for the reason given at the head of this
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

**SENDS-SETTLE-BEFORE-VOIDS-ARE-READ.** *(HEADLESS)* The cross-kind rule of the
drain, pinned: within one pass the runner drains `bill_send` to its stop BEFORE it
reads `bill_void`'s owed rows, because a void becomes owed the moment its bill's
send settles — `listVoidsToApply` requires
`sync_state = 'synced' AND doc_no IS NOT NULL` — and the window between a synced
bill and its still-owed void must not span a poll interval: a crash inside it looks
exactly like a bill the owner cancelled while the server still shows it as active.
**RED CASE, NAMED, AND IT IS A REGISTRY LITERAL IN THE OTHER ORDER:** the runner
obtains handlers by enumerating the registry, so a literal listing `bill_void`
before `bill_send` reverses the drain order with no diff anywhere else — the void
kind's `owed()` runs while its bill is still `pending`, returns nothing, the send
then settles, and the pass ends with the void owed until the next tick.
**Observable:** one bill weighed offline whose void is requested offline, then
released online, then exactly ONE pass. At the end of that single pass the bill is
`synced` with a `doc_no` AND `voided_at` is set, and the presence sibling is in the
same pass's result: one send settled and one void applied, reported together.
**CAN A BROKEN IMPLEMENTATION SATISFY IT? No.** The reversed literal ends the
single pass with `voided_at` null; a drain that never runs the void kind fails the
same cell plus the registry criterion's behavioural cell; and running a second pass
to reach green is refused by the staging, which is ONE pass by construction.
**ITS BOUND:** it pins the ORDER of these two kinds, not adjacency — a runner
draining a third kind between them still satisfies it, and should.

**VOID-KEEPS-EVERY-DIFFERENCE-THE-DESIGN-NAMES.** *(HEADLESS, plus SERVER for the
attempt cell)* **The differences are enumerated here rather than counted**, and the
enumeration is the criterion: no backoff and no attempt cap (`nextAttemptAt` returns
null), no time gate (`dueAt` returns null), `blocking: "independent"`,
`concurrency: "parallel_rows"`, `rereadAfterEach: false`, and an `inFlightKey` that
prefixes the row id. The ordering difference is NOT in the list, and that is the
correction the design above records: `listVoidsToApply` ends
`ORDER BY void_requested_at, id`, so the void QUEUE is ordered and only the DRAIN is
unordered. **RED CASE, NAMED — TWO:** **`blocking: "head_blocks"` on the void
kind**, which every single-void staging passes because a lone row has nothing
behind it to block; and a drain with NO in-flight guard at all, which performs a
row a second time while its first attempt is still in flight.

**A CELL THE PREVIOUS REVISION STAGED IS DELETED HERE, BECAUSE THE STORES CANNOT
PRODUCE ITS STATE — re-derived 2026-08-19 at both stores.** It staged one bill
whose send is in flight while its void is owed. A send in flight is
`sync_state = 'syncing'`: `claimForSend`'s conditional UPDATE writes it and its
own guard requires `sync_state = 'pending'` (`SqliteLocalStore.ts:476-477`,
mirrored by the fake's `claimForSend`). An owed void requires
`sync_state = 'synced' AND doc_no IS NOT NULL` (`SqliteLocalStore.ts:967`,
mirrored by the fake's `listVoidsToApply`). One column, two required values: the
cell's premise is unrepresentable in either store, so the staging could never
have run and any green over it would have measured nothing. **What is
consequently unmeasured, said rather than hidden:** no behavioural cell now
separates the prefixed `inFlightKey` from a shared one, because the only state in
which the two differ is the state those predicates forbid. The prefix survives as
a declaration — one in-flight set is keyed by more than one kind, so the key
spaces must not collide — asserted by the field-by-field cell below and by
nothing behavioural. And the predicates themselves are what protect the same-bill
case: a send and a void of ONE bill are never simultaneously actionable, a
guarantee owned by the store queries, which is stronger than any key prefix and
is why no drain behaviour can be made to turn on it.

**Observable.** With TWO bills synced and both voids owed, ONE runner, and a
transport whose first void call blocks until released: a second pass entered
while that void is in flight must ADVANCE past the held row and attempt the
SECOND void — the held branch under `independent`, staged against a state the
stores CAN produce — with the presence sibling that the first void is performed
exactly ONCE across both passes. **AND TWO VOIDS OWED, THE FIRST BOUNCING:** the
second must be attempted in the SAME pass, which is the whole of what
`independent` means and which no previous cell could see. Plus, in the same run and
each asserted separately: a void that bounced is re-attempted on the NEXT pass with
no wait; a void the server refused on identity grounds leaves the owed queue; and the
policy object for `bill_void` is asserted field by field against the list above.
**CAN A BROKEN IMPLEMENTATION SATISFY IT? No** — `head_blocks` on the void kind
reddens both the held cell (the second pass stops at the held row and the second
void goes unattempted) and the two-void bouncing cell; a missing in-flight guard
reddens the performed-exactly-once sibling; and the field-by-field cell catches a
member silently dropped by a later edit. **ITS BOUND:** the field-by-field
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
  **SUPERSEDED 2026-08-23, AND ONLY THE REASON MOVES:** the decision is ANSWERED
  by S22 — a server-minted reservation, taken while online — so this item is no
  longer *by the owner's open decision*. **It stays on this not-covered list
  unchanged in every other respect.** The kind is still not specified, still not
  proven, and `OutboxKind` still carries two members, because answering what
  identifies a seller across devices is not designing the kind. What it removes is
  the BLOCKER, not the item.
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
  reading WHERE the error points;
  `THE-REGISTRY-IS-TOTAL-AND-IS-WHAT-THE-DRAIN-ENUMERATES` requires the location
  and names this as the likely wrong red. (The first printing of this bullet cited
  `REGISTRY-IS-TOTAL-AND-CONSTRUCTED`, a name no criterion in this file carries —
  corrected 2026-08-19.)
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

**THE SECOND INDEPENDENT REVIEW RAN, 2026-08-19 — AND DESIGN REVIEW ENDS WITH THE
REVISION THAT CARRIES THIS SENTENCE.** It fired the stop: five stop-class findings,
seven improve-class, and its own measurement that this design is markedly better
than the one it replaced. Two independent passes have now both fired the stop, and
both found their defects in printed code — the surface the paragraph above told the
next reader to attack first — which is why this revision removes the printed drain
entirely; the rules subsection above records that argument where the next author
will meet it. Of the five stop-class findings, two are repaired in this revision
because no proof would catch them: the cross-kind drain order is now a stated rule
with `SENDS-SETTLE-BEFORE-VOIDS-ARE-READ` as its criterion, and the void
criterion's in-flight cell — whose staging both stores refuse to represent — is
deleted with its residue stated at the criterion. The other three are NOT repaired
in prose. Each is a CONSTRAINT stage 3 must satisfy, with what catches it named,
because a defect an existing suite reddens on its first run is cheaper found there
than designed against a fourth time:

- **The pass lock is released on every exit path, a throw out of `perform`
  included.** The catch: seven proof files call `runUntilQuiescent`
  (`engine.ts:566`), which drives up to two hundred passes on one engine over an
  injected clock — a leaked lock starves every later pass, the staged final state
  never arrives, and the suite is red on its first run. The measurement is in the
  five-directions section above, superseding the earlier reading that a leak could
  hide from the suite.
- **`nextAttemptAt` gains a caller in the MECHANISM, or leaves the interface.** No
  rule above makes the drain call it; if only a kind's own `record` ever does, it
  is a private computation wearing an interface member's clothes, and the argument
  for putting it on the interface bought nothing the drain can enforce. NOTHING
  MECHANICAL CATCHES AN UNCALLED INTERFACE MEMBER — no typecheck flag, no proof —
  so this constraint is the sentence itself: the stage-3 diff either shows the
  drain's call site, its result handed to `record`, or shows the member removed,
  and the phase report says which.
- **A 401 stays distinguishable from an offline bounce ACROSS the interface.** The
  stage-1 mappings already collapse them — `mobile/src/sync/outbox.ts:283-288`
  maps `session_expired` and `unavailable` to the identical
  `{ next: "retry", reason }`, and the send classifier at `:264-269` does the
  same — and `engine.ts:64-68` names the regression that collapse re-ships: an
  expired session displayed as ออฟไลน์. The catch:
  `THE-POISON-SIGNAL-SURVIVES-BOTH-WAYS` asserts the pass result reports
  `sessionExpired` rather than `retryable` on a 401, and `proveSignOut` S9 drives
  a 401 and an outage to the same count and asserts the sheets DIFFER — both red
  against a classify that folds them.

**THE SEVEN IMPROVE-CLASS FINDINGS ARE STAGE-3 INPUTS, NOT REPAIRS.** Two were
handed to this phase in full, judged sharper than their labels, and both are
re-derived and folded in above: the write-side count is corrected — twenty-eight
columns at run time, not the CREATE body's twenty-seven — and `first_attempt_at`
is recorded as a fifth load-bearing column no criterion reads back. **The
remaining five were not among this phase's inputs:** the dispatch carried the two,
the review's own record holds the rest, and nothing here restates what this phase
has not read. Routing any of the five into stage 3's brief is the owner's call, at
the boundary this entry closes.

---

**FOUR CAPABILITIES THE OWNER NAMED ON 2026-08-20, AND WHY THEY BELONG IN THIS
STAGE. They existed in no file.** Each is the owner's own intent, given in his order,
and each is minted as a stage-1 step below: P1.19 through P1.22, the next four
unused numbers. `grep -oE '^### P1\.[0-9]+' ROADMAP.md` returned eighteen headings
ending at P1.18, and `grep -rnoE '\bP1\.(19|2[0-9])\b' --include='*.md' .` exited
1 over every tracked markdown, with the control `grep -rlE '\bP1\.1[0-8]\b'
--include='*.md' .` listing fourteen files at exit 0 in the same pass. Nothing is
renumbered.

**WHY STAGE 1 AND NOT STAGE 2 OR 3, argued rather than assumed.** S1 makes the
three deliverables ONE handover and S7 merged the pilot bar with the sale bar, so
there is one bar and a capability that SHIPS has to be inside it. Stage 2 is what
the pilot TEACHES — it cannot hold something that must exist before the pilot
begins — and stage 3 is now inside the same bar as stage 1 by S7's own stated
consequence. **Stage 1 is therefore the only stage whose definition these fit**,
and the file's own text was checked against the argument rather than the argument
against the file.

**EVERY ONE OF THE FOUR SPLITS IN TWO, AND THE SPLIT IS THE WHOLE OF THE
SCHEDULING QUESTION.** The READING half is a query and an endpoint. The DRAWING
half needs a surface, and there are only two — the desktop, which S20 has just
kept as an Electron application, and the phone, whose new screens S10 defers to a
UX rework that is defined nowhere. Each step below says which half it is talking
about in its *Depends on*, because a step that blurs them reads as blocked when
half of it is not.

**AND THE DATA CLAIM WAS VERIFIED, NOT INHERITED.** These four were proposed on
the premise that the data they need already exists. That premise is a claim, and
it was checked here against the HEAD STATE by reading `server/migrations/versions/`
FORWARD from `0001` to `0011` with every DROP applied — the method
`lessons/README.md § Lessons` "a migration stack is a LOG OF WHAT WAS DONE"
prescribes, and it is stated because it is a DIFFERENT measurement from querying
the database, which this phase did not do and was not permitted to do. **The claim
held for three of the four and failed for one**, and P1.20 records the failure as
a schema dependency instead of building on it.

**NO DONE WHEN BELOW CARRIES A RAW COUNT.** Each names the SET and its SOURCE so
the number is produced at the moment of the run rather than stored in the
sentence, per
`OPEN_ITEMS.md § Decisions open — the owner's, not the code's` "A RAW COUNT INSIDE AN ACCEPTANCE CRITERION ROTS".

### P1.19 — The end-of-day cash close

**What it is.** At the end of a trading day the shop counts the cash actually in
the drawer and enters that number. The system shows what it says went out that
day. **The difference between the two is displayed AND RECORDED**, so a shop can
look back at which days reconciled and which did not.

**THIS IS NOT THE A-NUMBERED DAILY MONEY VIEW, AND THE DISTINCTION IS WRITTEN
HERE SO A LATER SESSION DOES NOT READ ONE AS THE OTHER.** A1 was built as the
server half plus a mobile screen. Checked against the endpoint rather than
remembered: `server/app/reports.py` opens *"The daily money view — one shop day,
ADMIN ONLY"* and describes itself in its own second sentence as **"The number an
owner balances the cash box against at closing."** That is exactly the
relationship. **A1 PRODUCES the number to balance AGAINST. It does not hold the
counted number, and it records no difference** — it totals rows that already
exist, and a counted drawer is not a row that exists. This step is the other side
of that sentence.

**Depends on — the reading half:** nothing that is not already built. The
system's own figure for the day is what `GET /reports/daily` already computes,
over the shop-time day window applied to `server_received_at`.

**Depends on — a SCHEMA dependency, and it is not optional.** Read forward
across `0001` to `0011` with every DROP applied, **no relation and no column
anywhere holds a counted cash figure**; the only occurrences of the word are
prose inside migration docstrings. The counted number and the recorded difference
are both new storage. Because it is a new relation every tenant will have, D10
applies: it wants doing before the pilot's rows exist.

**Depends on — the drawing half:** a back-office surface, so the desktop, which
under S20 stays an Electron application. Re-derived from each step's own
*Depends on* line: P1.6 depends on P1.2; P1.13 depends on P1.6 **and P1.12**;
P1.14 depends on P1.13. So the chain is P1.2 → P1.6 → P1.13 → P1.14, with P1.12
joining it at P1.13 — a fifth link that the shorthand chain omits.

**Unblocks:** an owner who can tell a counting mistake from a shortfall, which is
the question a daily total alone cannot answer.

**DONE WHEN:** for one named shop day, a counted figure is entered, stored, and
read back unchanged; the system's own figure for that same day EQUALS what
`GET /reports/daily` returns for it, compared value against value rather than
asserted; and the recorded difference equals the two subtracted, including when it
is negative and when it is zero. **The zero case is required, not decorative:** a
day that reconciles exactly is the state most easily produced by a difference
that was never computed.

### P1.20 — Price history: what a price was, when it changed, and who changed it

**What it is.** For each product and grade tier: the price over time, the moment
of each change, and the person who made it.

**THE READING HALF CANNOT BE BUILT ON TODAY'S DATA, AND THIS IS THE ONE OF THE
FOUR WHERE THE PREMISE FAILED.** `product_prices` is `(id, tenant_id, product_id,
grade, price)` at `0001` and nothing since has widened it: no timestamp, no
actor. And the write path OVERWRITES —
`PUT /products/{product_id}/prices/{grade}` ends
`ON CONFLICT (tenant_id, product_id, grade) DO UPDATE SET price = EXCLUDED.price`,
so the previous value is gone the moment the new one lands. Read forward across
`0001` to `0011` with every DROP applied, **there is no history relation and no
audit relation of any kind in this schema.**

**WHAT IS NOT LOST, said explicitly so this is not read as wider than it is.**
Hard rule 6 keeps `unit_price` AND `list_price` on every bill line, so what a
SOLD line was struck at, and the list price it was struck against, are preserved
for ever and no change here can reach them. What is absent is the LIST'S OWN
history: what a tier stood at on a day nobody traded it, when it moved, and who
moved it. Those three facts exist nowhere.

**AND THE PART THAT CANNOT BE RECOVERED LATER.** Every price change made before
this storage exists is already unrecoverable — not hard to reconstruct,
UNRECONSTRUCTABLE, because the old value was overwritten in place and no copy was
kept. **That makes this the one of the four with a deadline rather than an
order**, and it is D10's shape: the cost of building it late is not rework, it is
a permanently empty stretch of history.

**Depends on:** the schema above, first — the reading half depends on it and not
merely the drawing half. Then, for the drawing half, the desktop chain re-derived
at P1.19: P1.2 → P1.6 → P1.13 → P1.14, with P1.12 joining at P1.13.

**Unblocks:** answering "why was this bill priced at that" months later, and the
staff-average signal in P1.22, which compares against a list that has to have
been knowable on the day.

**DONE WHEN:** a tier's price is changed through the real route more than once,
and every change is read back as its own row carrying the value, the instant and
the user id — the SET being the changes made during the run, and the SOURCE the
run's own record of what it sent, so the criterion holds whatever that number
turns out to be. AND the row that a change REPLACED is still readable afterwards,
which is the clause an implementation that merely stamps the current row cannot
satisfy.

### P1.21 — Seller history at the weighbridge

**What it is.** When staff pick a seller on the phone, they see what that seller
last sold: when, what, how much, and at what price.

**THE DATA IS ALL PRESENT, re-derived forward across `0001` to `0011` with every
DROP applied.** `purchase_bills` carries `seller_id`, `doc_no`, `total_amount`,
`device_created_at` and `server_received_at`; `purchase_bill_items` carries
`product_id`, the three weights, `unit_price`, `list_price` and `amount`. Every
one of the four things the owner named has a column behind it, and nothing new is
needed to answer the question.

**THE SPLIT, AND IT IS THE SHARP ONE OF THE FOUR.** The reading half — a query
and an endpoint — can be built today and depends on nothing that is not already
there. **The drawing half is a MOBILE surface, so S10 gates it, and S10 has no
step and no definition.** The audit above records S10 as the load-bearing gap for
exactly this reason. S10's own text says *"What waits is the drawing"* and
explicitly does not defer the internals, so this step is not blocked — half of it
is, by a gate nothing schedules. **P1.16 already carries this shape** and is the
entry to read beside this one.

**Depends on:** nothing, for the reading half. For the drawing half, S10's
undefined rework, and that is a gate rather than a dependency — no step in this
file makes it arrive.

**Unblocks:** the yard recognising a seller it has bought from before, at the
moment the truck is on the weighbridge rather than afterwards.

**DONE WHEN:** for a seller with more than one bill, a request returns that
seller's prior bills with the four facts on each, read back as an actual
response; the SET is the bills that seller holds and the SOURCE is the database
at the moment of the run, so no number is written here. AND a seller with NO
prior bills returns an empty answer that the caller can tell apart from a
failure — the case a query written along its happy path does not distinguish.

### P1.22 — Anomaly signals: three named ones

**What it is.** Three signals, named by the owner and not widened here:

1. **An override far from the list price.**
2. **A seller recurring oddly often.**
3. **A staff member whose bills average higher than everyone else's.**

**THE DATA IS PRESENT FOR ALL THREE, with one bound.** Re-derived forward across
`0001` to `0011` with every DROP applied. For (1), hard rule 6 puts `unit_price`
AND `list_price` on every line, and the daily report already counts lines where
the two DIFFER — so what is new is not the comparison but the MAGNITUDE and the
view across days. For (2), `purchase_bills` carries `seller_id` and
`server_received_at`. For (3), `purchase_bills.created_by` arrived in `0006`.

**THE BOUND ON (3), and it is a property of the column rather than of the
feature:** `0006` adds `created_by uuid` with NO `NOT NULL`, so every bill
written before that migration carries NULL and belongs to no staff member. An
average over authors is an average over the bills that HAVE one, and a signal
that quietly treats the rest as a group will name the wrong person. Say which
population is being averaged, in the answer itself.

**ALL THREE WORDS THE OWNER USED ARE THRESHOLDS — *far*, *oddly often*,
*higher than* — AND A THRESHOLD IS A TUNED CONSTANT.** This project already has
one home for those and one rule about them:
`PROJECT_STATUS.md § Tuned constants — trial ledger`. Every number this step
chooses belongs in that ledger with what it was tried against, or the next
session cannot tell a measured threshold from one somebody typed until the output
looked right.

**Depends on** — the reading half: nothing that is not already built, plus P1.20
for (1) if the signal is ever to be evaluated against the list price AS IT STOOD
on the day rather than as it stands now. **Those are two different signals and
only the second is buildable today**; which one the owner wants is a product
question this step does not settle. The drawing half is back-office work, so the
desktop chain re-derived at P1.19.

**Unblocks:** a shop owner noticing a pattern without reading every bill, which
is the only form of oversight available to somebody who is not in the yard.

**DONE WHEN:** each of the three signals fires on a case constructed to trigger
it AND stays silent on a case constructed not to — both halves, per signal, in
one run. **The silent half is the requirement, not the courtesy:** a detector
that fires on everything and a detector that fires on the right thing produce the
same output on a positive case, and only the negative case separates them. The
SET is the three signals the owner named, its SOURCE this entry, and no count is
written into the criterion because the set is enumerated in the sentence above
it.

### P1.23 — The mobile UX rework: the deferred screens, drawn to one bar

**What it is.** The phase S10 has always pointed at and never defined — the
drawing pass every new mobile screen has been deferred to. It fixes the screen
defects recorded before it, draws the surfaces whose state has now settled,
introduces the shared presentation layer the app has never had, and makes one
consistency pass to an agreed bar. It touches no proven logic: every screen
already opens "THIS FILE DECIDES NOTHING" and every wording and state decision
lives under `mobile/src/` behind headless proofs, so this redraws presentation
only. **Minted 2026-08-27 by B1; this is the definition S10 lacked, and S10
itself is unchanged — it still defers, and this is what it defers to.**

**THE BAR — settled with the owner 2026-08-27 (B1).** A 5am yard tool:
legibility at arm's length in sun; wet-hand tap targets (`TAP_MIN` = 56 is the
stated standard, honoured in a few controls and undercut across most others, and
the whole prices screen declares no floor at all); refusals in Thai derived from
the cause; calm offline states; one consistent vocabulary. NOT animation,
branding, onboarding tours, or consumer-app polish. Order of work: recorded
defects first, deferred drawings second, one consistency pass last. **The bar is
the owner's and can be raised or lowered; this records where it stands.**

**Depends on:**
- The internals each surface reads — the seller kind, the park and the reserve
  level (all landed); the dashboard's aggregation by `created_by` (buildable, not
  built) — the owner HOMED the dashboard here on 2026-08-28 (S24), the daily screen
  becoming a view inside it; the phone's `/shop` settings calls — the owner HOMED
  the settings surface on both mobile and desktop on 2026-08-28/29 (the S6
  extension). **The two "IF" conditionals are settled;** both surfaces still read
  internals that must exist first, which is why they stay in Depends-on and are not
  yet done.
- **The settle-to-refresh repair, settled at B1: resolve the id at send time** —
  the bill carries the local seller id and the sender swaps in the server id
  once it exists, so the picker may quote a seller mid-settle without a 422 ever
  reaching a terminal bill. Without this the picker could not be built as its
  criterion is written; with it, the picker is safe by construction.

**Unblocks:** the head of the mobile queue and, under S8, the whole client
chain — P1.8b's picker, reserve and surfaces criteria close; the camera phone
half gains its screen; P1.21's drawing half; and every screen S10 holds.

**DONE WHEN** — the SET is the B1 screen inventory, the SOURCE is this entry, and
no count is written into the criterion:

1. The three recorded screen defects are fixed by cause and not by wording: the
   save-confirmation contradiction in `mobile/app/ConfirmSaveDialog.tsx` (the
   unconditional warning that a saved bill enters the system at once, beside the
   grade-conditional one that it waits for the office); the `forbidden` sentence
   in `mobile/src/master/sellerCreateNotice.ts` that tells the operator to open a
   permission the two-value role schema does not have, rewritten to speak of a
   ROLE; and the two disagreeing unsent counts — the status strip and sign-out
   fed from the unfiltered total while queue health uses the owner-filtered one
   (`archive/PROJECT_STATUS_through_2026_08_28_f7ab2e0.md § The two on-screen unsent counts still disagree`) —
   reconciled to one number the operator can act on.
2. The P1.8b seller surfaces are drawn and their criteria close: the picker
   union of the cache and the unsettled local rows, the four reserve-level
   sentences with their tone mapping and the compile cell on a call site that
   renders them, and the parked-bill wording surfaced — built to the
   settle-to-refresh repair in Depends-on above.
3. One consistency pass over the existing screen inventory to the bar: `TAP_MIN`
   honoured on every tappable control, one shared presentation layer replacing
   the per-file `StyleSheet` duplication, one vocabulary.
4. The shop-owner dashboard and the phone settings surface are drawn — both homed
   on mobile by the owner (2026-08-28/29): S24 homes the dashboard, absorbing the
   existing daily screen as a view inside it, and the S6 extension homes the
   settings surface, which also ships on the desktop. The "IF" is settled; these
   are no longer conditional. Their SHAPE stays with this step; M6 recorded only
   the homing, not the design.

**WHAT THIS DOES NOT INCLUDE, said before it is built:** the camera screens
(S12 — they draw once a binary-payload mechanism exists) and P1.21's
seller-history drawing (it needs its reading endpoint, which does not exist).
Both are new screens S10 hands this rework's successor, not this phase.

**NOT PINNED TO A SHA:** this step ships in the B1 commit, so HEAD names the
commit that does not contain it; the date stands
(`CLAUDE.md § Conventions` "PIN A CLAIM TO A COMMIT").

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

### P1.24 — The per-tenant grade model

**What it is.** The grade model S16 says needs its own step: the per-tenant storage
that replaces today's CHECK-constrained single letter, so a shop declares whether
it grades at all, how many tiers it uses, and what each is called. **Minted
2026-08-29 (M6 c2) by `ROADMAP.md § The completion sequence to handover`** as the
one ownerless gate that sequence needed numbered — S16's audit cell records in as
many words that the grade model needs its own step, no step owned it, and the block
it lifts is measured: a shop that does not grade takes an office round trip on every
walk-in, which is two of the three shop shapes. This entry names the step and its
place; it designs no table.

**Depends on:** nothing technical for the model itself — S16 settled the STORAGE
shape (per-tenant columns by kind, no JSON bag) and the write path is pulled by the
features that need it under S17: seller creation (P1.8) reads a tier, and the
settings surface configures it (P1.16 and P1.23 on the two clients, per the D-C
extension). It replaces the CHECK constraints migrations `0003` and `0010` add, so
it is a migration against live constraints and belongs BEFORE a pilot writes rows it
cannot repair afterwards (D10).

**DONE WHEN** — SET = the tiers a test shop declares, SOURCE = the database after
the run, and no tier count is written into the criterion: a shop configures a tier
set that is not the default, a seller is created against one of its tiers, and a
bill for that seller is priced from that tier — all three read back out of Postgres,
not off a screen; AND a shop that declares it does not grade at all creates a seller
and posts a walk-in bill with no office round trip, the shape the block above names.
The tier NAMES and their number are the shop's, so the criterion counts nothing.

**NOT PINNED TO A SHA:** this step is minted in the M6 c2 commit, so HEAD names the
commit that does not build it; the date stands
(`CLAUDE.md § Conventions` "PIN A CLAIM TO A COMMIT").

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
  `archive/PROJECT_STATUS_through_2026_08_28_f7ab2e0.md`
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
