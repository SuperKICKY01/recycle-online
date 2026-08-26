# Recycle Online — Master Plan

**Date:** 2026-08-26. **Read at:** HEAD `79f8f0c` plus three untracked files
(`ARGUS_MOBILE_READ.md`, `COMMIT_MSG.txt`, `UNCOMMITTED_DOCS.diff`). Produced by a
read-only planning session; nothing in the repository was edited. **This is a
proposal the owner edits, not a decree.** It mints no P-numbers — those are issued
in `ROADMAP.md § Numbering` and nowhere else — and it reopens no settled S-number.
Where it needs a name for work that has no P-number yet, it uses plan-letters
(A1, B2 …) that exist only in this document.

---

## 0. What was read, and what could not be

Read in full or in measured part, at HEAD: `CLAUDE.md`, `START_HERE.md`,
`PROJECT_STATUS.md` (§ Current phase, § What is built, § What is NOT built,
§ Known device gaps, § Known scaling limits), `ROADMAP.md` (all stage and step
definitions, all 22 settled decisions, the decision audit), `OPEN_ITEMS.md`
(§ Blocking one real paying shop, § Business questions, § Schema requirements,
§ What a product sold to strangers needs, entry heads of the other sections),
`lessons/README.md`, `ARGUS_MOBILE_READ.md`, `UNCOMMITTED_DOCS.diff`,
`COMMIT_MSG.txt`, plus two read-only tree surveys of `server/` and
`mobile/`+`desktop/`.

**Two inputs the brief names could not be found, and the plan says so rather than
pretending to have read them:**

- **The architecture audit EXISTS — outside the repo, at
  `C:\Users\PC\.claude\projects\E--recycle-online\research\architecture-audit-2026-08-13.md`
  (158 KB, 1,338 lines) — and this plan's first draft wrongly reported it
  missing.** The first search resolved `research/` against the repo and swept
  the user profile only three directories deep; the file sits five deep, one
  directory beside the memory directory this session writes every boot. What
  that first search DID establish still stands, and it is the sharper finding:
  **the audit has never been committed anywhere** — `git log --all --
  research/` is empty — so it exists in exactly one unversioned directory that
  no session's reading order reaches. Two sibling reports live beside it
  (`claude-code-memory-workflow-research-2026-08-12.md`,
  `restructure-phase1-proposal-2026-08-16.md`), equally uncommitted. The audit
  has now been read in full; § 3(c) and phase H rest on it as a measured
  source, and § 8 carries the structural consequence.
- **The "App Store compliance set the mobile survey just found" is still
  findable nowhere.** Not found with these words: `App Store|Play Store|privacy
  policy|account deletion|TestFlight` (case-insensitive) over every tracked
  `*.md`; the untracked `ARGUS_MOBILE_READ.md` is a 2026-08-10 login-screen
  survey and does not mention it; and the profile `research\` directory that
  held the audit holds three reports, none of which is this survey. The
  compliance set enters this plan as an **assumption from the brief** (§ 6,
  phase E3), with the one clause that needs verifying named there — and it is
  now also the clearest live example of § 8's problem.

"Not found with these words" is not "there is none" — if either document exists
outside the repo, hand it to the session that executes the affected phase and let
it correct this plan.

---

## 1. Where the work actually stands (compressed, with the evidence named)

Everything below is from `PROJECT_STATUS.md` and the two tree surveys at HEAD;
this section is a summary of a status file, and it rots — re-read that file
before trusting any line of this one.

**`server/` — a running, proven API. The most finished thing in the project.**
Twelve migrations (0001–0012), thirteen relations: tenants (now carrying
`default_grade` and `seller_code_target_holding`), users (role CHECK admin|staff
— **two roles, not S9's three**, measured at `0001:100` and `auth.py:86-87`),
master data with grades A–D, purchase bills + items (`created_by` since 0006),
doc_no counters, `directory.shop_codes`, seller-code reservations (0012). RLS
FORCEd per tenant; three DB roles, all NOBYPASSRLS. **Forty routes: 3
unauthenticated (`/health`, `/auth/login`, `/auth/shop-code`), 12 for any
signed-in principal, 25 admin-only — and no DELETE verb anywhere, on purpose**
(tree survey, decorator census cross-checked against the auth-dependency
census). `reconcile.py` (27 checks) plus 20 `prove_*.py` scripts.
Backup/restore proven — **but both scripts reach Postgres only by `docker exec`
and cannot reach a remote database at all** (`OPEN_ITEMS.md § Blocking` "THE
BACKUP TOOLING CANNOT REACH A REMOTE DATABASE"), and nothing schedules them.

**`mobile/` — a working offline-first yard app, on a dev box's Metro.** Three
body screens (login/setup, empty-state, cart) and eight sheets under one Modal
host, plus two always-on strips and an in-app numpad. Offline queue with
three-way failure classification and head-of-line ordering; **the outbox is
already one mechanism — one drain, no hand-written loop per kind, a registry
carrying three kinds (`outboxHandlers.ts:20` imports `BILL_SEND, BILL_VOID,
SELLER_CREATE`)** — so P1.18 is substantially built; what is NOT recorded is a
closure against P1.18's own criteria (the hand-written-fourth-path compile
refusal, the multi-row device ordering test). Void flow, sign-out gate that
refuses while work is owed, login against a shop code, daily money screen,
price editing (P1.9, closed 2026-08-26 on a handset), P1.8a online seller
creation (closed 2026-08-17 on a handset). P1.8b offline seller creation:
server half, storage, kind and gates **built and proven headless**; the
surfaces (picker union, reserve level drawing) are deliberately not built —
they wait on S10's undefined UX rework — and **P1.8b has no DONE WHEN**
(`OPEN_ITEMS.md § Decisions open`). ~30 headless proofs green twice at the
last boundary. **Store identity is at zero: no `eas.json` anywhere, no iOS
`bundleIdentifier`, and the app's display name is still `ไม่ใช่ตัวจริง — ทดสอบ`**
(`mobile/app.json:3`, tree survey) — no release build exists on either
platform.

**`desktop/` — one 0-byte file.** Not started (`PROJECT_STATUS.md § What is
built` "`desktop/` — not started").

**Provider service / provider web — nothing.** No licence concept anywhere in
code: `grep -rniE "licen[cs]e" server/app server/migrations` exits 1
(`OPEN_ITEMS.md`, measured 2026-08-19).

**No hosting, no HTTPS, no CORS, no production database.** The API runs on the
dev box; `mobile/app.json` bakes in a plain-HTTP LAN address; the one middleware
in the API is the clock guard (`OPEN_ITEMS.md`, measured). `recycle` is the DEV
database; production will be created fresh when hosting is chosen
(`ARCHITECTURE.md § 10` D5).

**No billing, no monitoring, no deployment path, no data export, no support
path** — all measured absent 2026-08-19 (`OPEN_ITEMS.md § What a product sold to
strangers needs`), all deferred by the owner on the same day to the back of the
queue.

**The four steps to one paying shop** (`ROADMAP.md`): (1) shop code — tool built
and run on dev; (2) real accounts — server complete, production absent;
(3) login screen — built, observed on a handset; (4) reachable server — nothing
chosen or paid for. Two of the four wait on purchases and devices, not on code.

---

## 2. The three revenue lines — and the one structural fact that bends them

The brief asks for three lines: LINE 1 the first shop pays, LINE 2 the second
shop pays, LINE 3 it runs as a business. The repo supports exactly that shape —
with one settled decision sitting across it, and the plan must show it rather
than smooth it over.

**S7 (settled 2026-08-17) makes the pilot wait for ALL THREE deliverables —
mobile, desktop, AND the provider web — and S21 (2026-08-20) refused a
family-trial step in front of it.** S1 says the father pays for a finished
product, not an instalment. `ROADMAP.md` states the consequence in its own
words: *"STAGE 1 AND STAGE 3 MERGE IN EFFECT."*

So under the decisions as they stand, **LINE 1's gate already contains the
provider web** — the deliverable the brief's own framing puts on LINE 2. The
first baht arrives at the handover of all three programs, not when the mobile
app alone could run a trading day.

**DECISION 1 (the owner's, named and not taken here):** keep S7, or supersede
it. This plan is built for **S7 as settled** — the phases and dependencies below
do not change either way; what changes is WHERE the first-revenue gate falls:

- *S7 kept:* first baht = handover gate after phase D5 (provider web). The
  father's shop trades on day one of the pilot with slips, photographs and all
  three programs.
- *S7 superseded (not proposed, merely priced):* first baht could land after
  phase C6 (printing) — the mobile+desktop set is enough for one shop's working
  day — pulling revenue forward by the whole provider chain. The cost is
  everything S7 was protecting, which the owner weighed on 2026-08-17 and again
  on 2026-08-20; nothing in this repo argues he was wrong.

Everything below tags each phase **[L1]**, **[L2]**, **[L3]** by *whose revenue
it serves*, with the understanding that under S7 the [L1] gate includes the
provider-web phases marked [L1/S7].

---

## 3. What the day-to-day work has NOT been tracking

The brief asked for these three specifically; the repo's own audit confirms two
of them and adds a third of its own.

**(a) The UX rework is the load-bearing gap of the whole programme.** S10 defers
every new mobile screen to a rework that is *defined nowhere* — no P-number, no
scope, no gate condition. `ROADMAP.md § Every settled decision` says it plainly:
*"It is a gate with no definition, which is what makes every screen behind it
unschedulable rather than merely unscheduled"* — and both 2026-08-18 owner
answers (photographs in the pilot bar; dashboard on mobile) *"make S10 the
load-bearing gap rather than a tidy-up."* Standing behind it today, by that
audit: the P1.8b surfaces, the camera screens, the shop-owner dashboard, the
per-tenant settings surface (phone half), and P1.21's drawing half. Under S8
(mobile → desktop → provider, sequential), an undefined gate at the head of the
mobile queue holds the entire chain. **Phase B1 turns it into a defined,
reviewable phase.** How much polish it buys is the owner's call — § 7 proposes
an honest bar.

Two measured facts size the rework honestly. *What is missing:* there is no
design system of any kind — no theme, token or shared-style module exists under
`mobile/` (glob over `theme/tokens/colors/styles` names: every hit in
`node_modules/`); styling is one `StyleSheet.create` per file across 14 files
with inline hex colours, and constants are duplicated rather than shared
(`TAP_MIN = 56` byte-identical in three files; the sync-state colour tables
byte-identical in `App.tsx` and `BillsPanel.tsx`). *What makes it cheaper than
it sounds:* the codebase already enforces a strict presentation/decision split —
screen after screen opens with "THIS FILE DECIDES NOTHING" and every wording and
state decision lives in `src/` under headless proofs — so redrawing the
presentation layer does not touch proven logic. The rework is closer to
"introduce the missing shared layer and redraw thin files" than to a rewrite.

**(b) The App Store / distribution compliance set.** Not in the repo (§ 0). The
requirement class is real regardless: distributing an iOS app to staff-owned
phones (S5) outside a developer's own devices means TestFlight or the App
Store, and App Store review wants a privacy policy at a public URL, terms, and —
for apps that support account creation in-app — an account-deletion path.
**This app does not create accounts in-app** (accounts come from an admin;
`POST /users` is called by no client), so whether the deletion rule binds is a
question to verify, not a fact to build on. The set gates on two things the
owner has deferred: the PDPA answers (a privacy policy states retention, and the
five-year synthesis is unconfirmed — `OPEN_ITEMS.md § Schema requirements`) and
the domain (a policy needs a URL; S13 buys the domain at P1.2). Placed at
**E3 [L2]**, with a **named condition that pulls it into [L1]**: if the father's
staff carry iPhones and the pilot must install outside TestFlight's limits, the
set is on LINE 1's clock. D9 — which platform the pilot's staff actually carry —
is a fact about a shop nobody has collected, and it decides this.

**(c) The audit's Band B — now measured, not assumed.** The 2026-08-13 audit
(read in full at the profile path in § 0) recorded, at HEAD `5957042`: **2
Band-A findings (a wrong result or lost money possible that day) and 35 Band-B
findings (traps that fire when someone changes something nearby), every one
verified at its cited file:line by the audit's own inline re-measurement**,
plus 48 surveyor-measured Band-C findings and a full proof census. The Band-B
mass concentrates in four places: the mobile UI wiring layer (`App.tsx` plus
all of `mobile/app/` imported by zero proofs and compiled by neither
typecheck's proof half — hard rule 8's "failure must be visible" is enforced
exactly in the unproven layer), the device adapters (`src/device/` excluded
from the node program), `provision_shop.py` (the permanent-write script no
proof runs), and duplicated cross-side contracts (status-code tables, wire
shapes, the doc_no format, the rounding identity, the 543/timezone pair — each
a hand-held copy with nothing mechanical comparing the sides).

**The audit is thirteen days and several phases old, and spot-checks show real
drift — in the good direction.** Its two Band-A findings are FIXED in today's
tree, re-measured this session: the missing 424 codes are in the client's list
with their own wording and proof cells (`parkedReason.ts:52-53,124,128`;
`proveSeller.ts:758` onward), and a 2xx whose body loses the `doc_no` is now a
retry, never a success — `httpTransport.ts:129` states the audit's exact
mechanism as the reason for the guard. A1's residual seam — nothing KEEPS the
client list complete when the server adds a fifth code — is queued at
`OPEN_ITEMS.md § Verification gaps` "NOTHING NOTICES A FIFTH
master_data_missing CODE", mechanism chosen by the owner. The other 35 have
NOT been re-baselined; some are certainly stale (the proof census has grown
from 41 to ~54 entry points; the route-order trap has since gained a proximity
check), and carrying a 13-day-old measurement as current is the exact rot this
repo's own conventions name. **So phase H is adopt, re-baseline, close — not
re-audit from scratch.** Where it must close: before P1.12, because P1.12's
criterion is "the suite is green" and a suite whose known gaps are unmapped
cannot gate restructuring the one working program; and before P2.2, because a
reconciler whose own proof discipline is unaudited cannot be cited about a
shop's real money.

---

## 4. The phases — ordered, with measured dependencies

Conventions: **Delivers** / **Line** / **Blocked by** (measured in the repo, or
marked *assumption*) / **Parallel with**. Existing P-numbers are named where the
phase IS that step; plan-letters cover work no P-number owns. S8 is respected
throughout: the three client programs are sequential — mobile finishes, then
desktop, then provider web. Parallelism therefore lives in the server-side and
external tracks, which S8 does not sequence.

### Track A — external clocks and owner work (start now; everything here is parallel)

**A1 — Hosting: domain, tunnel, HTTPS, production database, scheduled off-box
backup.** *(= P1.2, under S13.)*
- Delivers: the phone gets a 200 from `/health` at an `https://` URL that is not
  a LAN address; a scheduled dump nobody triggered fetched off-box and restored
  with row counts read back; the production database existing at all.
- Line: **[L1]**.
- Blocked by: nothing technical — a purchase and a name. Two measured sub-items
  ride inside it: the backup tooling's `docker exec`-only reach must gain a DSN
  path (`OPEN_ITEMS.md § Blocking`, sized there), and
  `ARCHITECTURE.md § 14` must be read before the choice (superuser, role
  creation, shell — a managed DB fails the checklist by measurement).
- Parallel with: everything. **The only step with external lead time** —
  `ROADMAP.md` has said "start now" since 2026-08-07.

**A2 — The legal answers.** *(= P1.1, plus the PDPA confirmation.)*
- Delivers: the second-hand goods act's record-keeping obligation answered from
  a statute or a named professional (fields, form, retention); the PDPA
  five-year synthesis confirmed or refuted; the serial-per-line question (does
  it bind bulk scrap by weight?) answered by the licensing officer.
- Line: **[L1]** — every one can add a column to tables whose rows cannot be
  repaired after the pilot writes them (D10's argument, at P1.1).
- Blocked by: nothing in the code. It is the father, an accountant, a lawyer.
- Parallel with: everything.

**A3 — The decision batch.** § 7 lists every decision this plan needs from the
owner. None needs code first. Collecting them in one sitting removes a dozen
future stalls; D9 in particular (what phones the father's staff carry) is a
ten-minute question that decides the shape of B5 and E3.

### Track B — finishing mobile (sequential inside itself; first per S8)

**B1 — Define the UX rework, and mint P1.8b's DONE WHEN.** *(Planning phase —
the one § 9 names as the programme's next move.)*
- Delivers: S10's gate turned into a scoped, P-numbered phase in `ROADMAP.md`
  (screen inventory, the bar from § 7, an explicit DONE WHEN); a DONE WHEN for
  P1.8b, which today *"has no criterion that would say when it is finished"*
  (`PROJECT_STATUS.md § Current phase`); the three P1.8b findings put to the
  owner (the settle-to-refresh window opens a path to a terminal bill for cash
  already paid — a design decision, not a drawing decision).
- Line: **[L1]**.
- Blocked by: the owner's answer on rework scope (§ 7, decision 2). Nothing
  else — this is paper, and it unblocks more than any code phase can.
- Parallel with: A1, A2, B2, H.

**B2 — The internals S10 says come first.**
- Delivers: P1.18 closed. The mechanism is further along than the step's last
  record implies — one drain (`outboxRunner.ts`), a registry of three kinds
  including the two legacy ones (`outboxHandlers.ts:20`: `BILL_SEND, BILL_VOID,
  SELLER_CREATE`), the engine holding "no drain of its own" since stage 3
  (`engine.ts:10`), `OwedByKind` walked from the registry, `prove:outbox`
  inheriting new kinds with no edit — but **no closure against P1.18's own
  criteria is recorded**; the hand-written-fourth-path compile refusal and the
  multi-row device ordering test are its unmet observables, so what remains is
  a closing pass, not a build. The S16 storage that features need next: the
  per-tenant grade model (its own step per the audit — it replaces a CHECK that
  five source sites re-state) and the settings-by-kind columns pulled by
  whichever capability lands (S17 forbids pushing all eight as a set; one of
  eight, `tenants.default_grade`, already exists). The S9 owner-role migration
  with S18's client change in the same commit.
- Line: **[L1]**.
- Blocked by: nothing external. B1 only for the parts whose *surfaces* are being
  designed.
- Parallel with: A1, A2, B1, H.

**B3 — The UX rework itself.**
- Delivers: the recorded screen defects fixed (the two unsent counts that
  disagree, the self-contradicting save confirmation, the `forbidden` sentence
  that promises the impossible — all queued in `OPEN_ITEMS.md § Code debt`); the
  deferred drawings drawn once the state under them has settled: P1.8b surfaces
  (picker union of cache + local rows, reserve-level sentences, parked-bill
  wording), the shop-settings surface if the owner homes it on the phone, the
  shop-owner dashboard (settled 2026-08-18 as mobile); one consistency pass to
  the § 7 bar.
- Line: **[L1]**.
- Blocked by: B1 (the definition), B2 (the state the screens draw). This is the
  measured reason S10 exists: *"a screen drawn now is drawn twice."*
- Parallel with: A-track; C-track may NOT start yet (S8).

**B4 — Photographs, the phone half.** *(S12 — bill photo, seller face photo.
No P-number owns this; the audit says "NEW STEP, and more than one".)*
- Delivers: camera capture at weighing and at seller creation; a photo kind on
  the outbox; server-side storage beside the database (S15), with S15's
  unsettled engineering settled: retention, resolution, compression, where
  "beside" physically is — all named-unanswered in S15 itself.
- Line: **[L1]** — the owner confirmed photographs are in the pilot bar
  (2026-08-18): *"a pilot that omits them is a pilot of a different product."*
- Blocked by: B2 (P1.18's mechanism — and its own recorded residual: the
  mechanism was proven on seller creation and *"has NOT been shown to carry a
  large binary"*; the multi-MB/resumable design check happens here), B3 (the
  camera screen is a drawing), A1 (where "beside" is, is a property of the
  machine), and the S16 storage for *which photographs are required* per shop.
  The STAFF photo is deliberately NOT here — it is taken where an account is
  created, no client can create one, and it couples to P3.7 (**E2 [L2]**).
- Parallel with: nothing mobile; A-track continues.

**B5 — The installable build, the Android answer, and the P1.8b device pass.**
*(= P1.11, plus the outstanding device halves.)*
- Delivers: the app on a staff-owned handset from a distribution route, bundle
  identified in the observation; D9 answered or each of the five never-run
  Android behaviours recorded accepted-unproven with the owner's decision
  beside it; the P1.8b handset half and the scratch-DB server half (a released
  bill reaching a real `POST /bills` with the counter moving — noting each run
  burns reserved shop-code space permanently, so it is staged once, on scratch,
  deliberately); a release build existing on at least one platform. **The
  distance to a release build is measured, and it is the whole distance**: no
  `eas.json` exists anywhere in the tree, `app.json` declares no iOS
  `bundleIdentifier`, the display name is still a test name, the splash asset
  is referenced by nothing, and `app.json`'s version (1.0.0) disagrees with
  `package.json`'s (0.0.0) — store identity has not been started, on either
  platform.
- Line: **[L1]**.
- Blocked by: A1 (the URL the build bakes in — one string, one reader, but a
  rebuild-and-redistribute per change, which is why it lands after the screens
  stop moving: P1.11's own ordering argument), B3/B4 (the screens). iOS
  distribution may pull **E3** forward — see § 3(b) and D9.
- Parallel with: C1 can begin the moment mobile is declared finished (S8).

### Track C — the desktop (after mobile; S8)

**C1 — CORS.** *(= P1.6.)* Server work: the API's first real middleware and an
origin list that must stay configurable until D7 is chosen. Line: **[L1]**.
Blocked by: A1 (origins are where things are served from; HTTPS pages cannot
call plain-HTTP APIs — measured as finding 3 of the capability survey).
Unblocks both remaining programs — they are browsers.

**C2 — The shared package.** *(= P1.12.)* `shopTime.ts` (already extracted to
`packages/shop-time`) imported from outside `mobile/`, both typecheck programs
and every non-live-API proof green twice, Metro still serving a handset. D6
(what else goes in the package) is settled here, at the moment adding a module
is cheapest. Line: **[L1]**. Blocked by: the mobile program being green and
stable — i.e. B-track done, and **H** (the suite it leans on must be honest).

**C3 — The Electron scaffold.** *(= P1.13; S20 keeps Electron.)* D7 (renderer
origin) is decided here; D11 (how a shop's PC gets and updates the app) wants
the owner's scope answer BEFORE packaging is chosen. Line: **[L1]**.
Blocked by: C1, C2.

**C4 — Desktop sign-in and bill viewing.** *(= P1.14.)* The endpoints exist at
the right tiers already. Line: **[L1]**. Blocked by: C3; P1.3/P1.5 are
server-done, so nothing else.

**C5 — Master data, shop identity, and the settings surface.** *(= P1.15 +
P1.16 as widened.)* Sellers/entities/prices editable at the counter (S6's second
surface); `tenants` gains the legally-required slip identity (tax id, address,
licence number — A2 confirms the exact set); the shop-settings surface P1.16
took as scope on 2026-08-18 — today `PATCH /shop` is reachable by `curl` and
nothing else, so the grade default that unblocks two whole shop shapes has a
mechanism and no human who can reach it (`OPEN_ITEMS.md § Blocking`, amended
2026-08-18). The desktop is the only place this can live: the mobile client has
no product create/edit and no seller edit/delete at all (tree survey: the
client's whole write surface is seven POSTs and one PUT, none of them those).
Line: **[L1]**. Blocked by: C4; A2 for the identity fields (a schema change D10
wants before pilot rows).

**C6 — Slip printing and the cash close.** *(= P1.17 + P1.19's surface;
P1.19's RELATION lands early, in B2/A-window, because D10 wants it before real
rows.)* ESC/POS to a 58/80mm printer for a synced bill, doc_no and พ.ศ. date
photographed; the refusal for an unsynced bill shown plainly (S6). Printing
starts from zero: no ESC/POS or thermal code exists anywhere in the tree —
every one of the 29 lines matching a wide printing pattern is documentation
(tree survey, as of this dispatch). **The print
gate vs. missing-photograph contradiction is decided by the owner before this
is built** — S12 has the desk recheck the photo before printing, P1.17's DONE
WHEN doesn't mention one, and hard rule 8 means the photo can arrive
unboundedly later than the bill (`OPEN_ITEMS.md § Decisions open`, found
2026-08-17). Line: **[L1]**. Blocked by: C4, C5, C2 (date logic), that
decision, and B4 (if the answer is "wait for the photo").

### Track D — the provider chain (after desktop; S8) — [L1/S7]: on LINE 1's clock while S7 stands, serving LINE 2's capability

**D1 — What a licence is.** *(= P3.1.)* Definition, schema, lapse behaviour
(D3 already settles the hard half: a lapse never stops trading). Both
owner-creation paths (script now, key-activation later) must write the same
state — S9's own warning. Blocked by: nothing technical.

**D2 — Enumeration without superuser.** *(= P3.2.)* Reads
`directory.shop_codes` — the relation exists and is applied to the live dev DB.
Blocked by: D1 (licence state is per shop).

**D3 — The provider service.** *(= P3.3.)* Own process, own principal table,
own secret, refuses to start without it. Blocked by: D2.

**D4 — The provider audit log.** *(= P3.4.)* From the service's first day —
retrofitting one records nothing about the unwatched period. Blocked by: D3.

**D5 — The provider web.** *(= P3.5.)* Status, licence state, last-bill
heartbeat per shop; no money field, no seller field, asserted negatively.
Blocked by: D1, D3, D4, C1.

**⟶ THE HANDOVER GATE (S1 + S7): all three programs exist. The father's shop is
provisioned on production (`provision_shop.py` by hand is legitimate for shop
one — P3.6 is about shop two). The pilot begins. The first baht is earned
here.**

### Between the lines — the pilot writes the evidence (P2.x)

P2.1 (consecutive real trading days), P2.2 (standing reconcile against real
data), P2.3 (off-site restore of real data), P2.4/P2.5 (the residues and
breakages only volume produces — S19: no substitute exists), P2.6 (the
decisions the pilot answers: D6, D7, D9, D11). **Line: these convert [L1] into
[L2]** — nothing should be sold to a stranger before P2.5 has content. They are
milestones and instruments, not builds, and most of their content cannot be
written in advance by design.

### Track E — LINE 2: the second shop pays

**E1 — Onboarding without SQL.** *(= P3.6.)* Tenant + first admin + starting
master data end-to-end through a tool, no `psql` open, the admin signing in from
a phone. This is S1's own bar in its own words. Blocked by: D3, P1.5 (done on
the server).

**E2 — User management from a screen, and the staff photograph.** *(= P3.7 +
S12's third photo.)* Add, deactivate, password, lock — the routes all exist and
no client reaches them (measured: `grep -rn '"/users' mobile/ desktop/` exits
1). The staff face photo lands here because this is where accounts are created.
Blocked by: E1's shape, C-track (if the screen is desktop) or B3 (if mobile).

**E3 — Store distribution and the compliance set.** *(Assumption from the
brief — § 0.)* Apple/Google developer accounts, review, privacy policy at a URL
on the P1.2 domain, terms; verify whether the account-deletion rule binds an app
with no in-app account creation. Blocked by: A1 (the domain), A2 (PDPA answers
a policy must state), B5 (a release build). **Pulled into [L1] if D9 says the
pilot needs it** — otherwise the pilot rides TestFlight/APK and this lands
before the first stranger.

**E4 — Desktop install and update for strangers.** *(D11's answer, built.)* For
the pilot the owner installs by hand; for a stranger it is part of the
deliverable. Blocked by: C3's packaging choice, the owner's D11 scope answer.

**E5 — Backup, restore, retention per shop.** *(= P3.8.)* Blocked by: A1, E1.

### Track F — LINE 3: it runs as a business

All measured absent on 2026-08-19 and deferred by the owner on the same day;
none entered `ROADMAP.md`. They are listed with their trigger, not scheduled.

- **F1 — Billing and the 3% withholding answer.** *(= P3.9.)* Blocked by: D1,
  the accountant. This is the step whose absence means nobody can be invoiced —
  it is what makes LINE 3 a line.
- **F2 — Monitoring and alerting.** Today the shops would learn of an outage
  before the vendor (measured: one hit for `monitoring|alerting|on-call` across
  six documents, and it is the word "pager" in another sense). The provider
  web's heartbeat (D5) is the seed; an alert is something that finds a person.
  Gates on the owner deciding the vendor is expected to notice at all.
- **F3 — A deployment path, CI, rollback.** Nothing describes how a change
  reaches a shop or comes back out (measured: no `.github`, no CI file, zero
  hits for `rollback`). Becomes real the day the first stranger's shop is on
  production and a bad deploy costs someone else's money.
- **F4 — The operations pack:** request IDs and log structure (two modules log
  today, nothing carries a request id), a support path for a stuck bill (today:
  a developer with a database), data export for a shop that leaves (promised in
  no contract yet), JWT key rotation (today: one symmetric key, and rotating it
  signs out every yard at once), attempt limiting (nothing anywhere limits
  repeated attempts — recorded as a whole-system item), request body limits.
- **F5 — The offline-shift decision.** A yard with no signal at the hour mark
  cannot re-authenticate and the queue stops mid-shift (measured conjunction,
  2026-08-19). Whether a full shift out of signal is a supported shape is a
  product question only the owner can answer; the refresh-token decision was
  argued for the online case only.

### Phase H — keep the instrument honest (cross-cutting; close before C2)

Three parts, in order. **(1) Adopt:** the 2026-08-13 audit and its two sibling
research reports land in `research/` in the repo — owner confirms the commit,
per workflow — see § 8; until then the audit exists in one unversioned
directory. **(2) Re-baseline:** every Band-B finding re-measured at current
HEAD the way the audit itself re-measured them — confirmed-still-open,
fixed-since (the two Band As already are, § 3c), or moved — and the surviving
set recorded where the phase that touches each will meet it, never as a loose
list of 35. **(3) Close the repo-recorded debt of the same class:** every
`prove:*` and `prove_*.py` either green twice bare or exiting its documented
skip code with the reason printed; the two stale scratch databases rebuilt or
retired; `prove_master_write.py`'s red diagnosed; permanent writes to the dev
database by proofs ended or quarantined to scratch (`prove_backup_restore`
first — it adds an authorless bill per run); the `:8137` stale-server pair
retired. Line: **[L1]** (it protects every later green). Blocked by: nothing.
Parallel with: everything in A and B.

---

## 5. The dependency graph

```
  A1 hosting/HTTPS/backup ──────────────┬─────────────┐
  A2 legal answers ───────────┐         │             │
  A3 decision batch ──┐       │         │             │
                      ▼       ▼         │             │
  B1 define UX ──► B2 internals ──► B3 UX rework ──► B4 photos ──► B5 build+device
  H proof hygiene ────────────────────────────────┐   ▲ (A1: URL, storage host)
        (S8: mobile finished)                     ▼   │
                    C1 CORS ──► C2 pkg ──► C3 scaffold ──► C4 sign-in/bills
                    (A1)        (H)        (D7,D11)          │
                                              C5 master+identity+settings (A2)
                                              C6 printing + cash close
                                                 (photo-gate decision, B4)
        (S8: desktop finished)                        │
                    D1 licence ► D2 enumerate ► D3 service ► D4 audit ► D5 web
                                                              (C1)      │
  ══════════════ HANDOVER GATE (S1+S7): first baht ═══════════════════════╡
                    P2.1–P2.6  pilot evidence                             │
                    E1 onboard ► E2 users+staff-photo ► second shop pays ═╡
                    E3 stores (may pull into L1 via D9)   E4 installer    │
                    E5 per-shop backup                                    │
                    F1 billing … F5 offline-shift  — it runs as a business
```

What is genuinely parallel: the whole A-track and H against the whole B-track;
nothing else is, by S8's own decision — the sequencing of the three client
programs is settled, not a preference of this plan.

---

## 6. Deferred — named as deferred, not as phases

Serving no revenue line now, each with the wake condition already recorded in
the repo (`ROADMAP.md § What wakes up later`; `PROJECT_STATUS.md § What is NOT
built`): the entire out-of-MVP list (sell flow, stock, other income/expense,
buyers, employee master, QR, scale integration, Excel export, reports beyond
daily), tablet/large-screen layouts, per-tenant timezone, the daily-report
index, thousands separators, the shared proof teardown. **Adding any of these
before its wake condition fires is scope creep by this plan's own definition.**

---

## 7. The decisions only the owner can make

Named, not taken. Each blocks the phase in brackets.

1. **S7: keep or supersede** — where the first-revenue gate falls (§ 2). [gate]
2. **The UX bar** (B1). Proposal to react to, not a decision made: a 5am yard
   tool needs *legibility at arm's length in sun, wet-hand tap targets (the
   repo already has TAP_MIN as a stated standard, currently undercut in
   places), refusals in Thai derived from the cause, calm offline states, one
   consistent vocabulary* — and does NOT need animation, branding, onboarding
   tours, or consumer-app polish. Fixes first, deferred drawings second, one
   consistency pass last. How much more than that is his call.
3. **The three P1.8b findings** (B1/B3): above all, whether the picker may
   quote a seller mid-settle — as designed it opens a terminal bill for cash
   already paid.
4. **Print gate vs. missing photograph** (C6): wait, print plainly, or print
   with a mark.
5. **D9: what phones the father's staff carry** (B5, E3) — a fact to collect,
   ten minutes, decides the iOS/Android and store-compliance shape.
6. **D11: is an auto-updater in the handover** (C3, E4).
7. **D7: the desktop renderer's origin** (C3) — technical, decided in place.
8. **Which of the eight per-tenant values ship configurable at handover**
   (B2/C5) — S11 says all capabilities ship; the pacing of their settings is
   still his.
9. **The hosting purchase and the domain name** (A1) — S13 settled the shape;
   nothing is bought.
10. **Who answers the legal set** (A2) — statute, accountant, lawyer, licensing
    officer; and the PDPA confirmation before any deletion mechanism exists.
11. **S15's photo engineering** (B4): retention, resolution, where "beside the
    database" physically is.
12. **Is the vendor expected to notice an outage** (F2), and **is a full shift
    out of signal supported** (F5) — both product questions, not code.

---

## 8. The structural recommendation — a finding lands in the repo, or it does not exist

This connects directly to the owner's felt problem, and it is not about the
architecture. The work feels improvised because **major artefacts are produced
in sessions and never written into the repository, so a fresh session cannot
find them and the knowledge does not compound.** The evidence is this plan's
own history, inside one day: a 1,338-line audit — 37 verified findings, ~45
re-measurements, eight agents plus a verification pass — lived for thirteen
days in one unversioned profile directory, was reported missing by a session
explicitly told it existed, and its two Band-A money findings were meanwhile
fixed in the tree with no committed record tying the fixes to their source.
The mobile App-Store survey the brief cites is still findable nowhere at all.
Two more research reports sit beside the audit, equally uncommitted.

This is the same seam the advisor restructure existed to close, showing up in
a second form: not "the advisor cannot see the files" but "the work product
never became a file". The repo already has the rule for its own documents — a
report is a clue, not a source; two copies drift — but it has no home for
session-produced RESEARCH, so research either lands nowhere or lands in a
directory only one machine's profile knows about, which nothing backs up and
no reading order reaches.

**The rule proposed (the owner edits it):** a finding that cost a session to
produce gets committed into the repo — a `research/` directory in the tree,
under the same dating and pin-to-a-commit conventions the other documents
follow — or it is treated as not existing for the next session. Concretely,
and cheap:

1. **Adopt the three existing reports** into `research/` in the repo (the
   owner confirms the commit, per workflow — nothing is committed by this
   plan).
2. **One line in the done-checklist**, the same way the lesson rule works:
   before a research or survey session closes, its artefact is committed,
   UNPROMPTED — being asked is not the trigger; the artefact existing is.
3. **One pointer in `START_HERE.md`'s reading order** so a booting session
   knows `research/` exists.

Nothing else changes. The point is not more process — it is that the next
master-plan session starts from files instead of from archaeology.

## 9. The one thing to do next

**Do first, today, before any phase: rescue the research artefacts.** Copy the
three reports into `research/` in the repo and put the commit in front of the
owner (§ 8). They exist in exactly one unversioned directory; ten minutes ends
the risk that a 1,338-line audit is lost to a profile cleanup. This is not the
programme's next step — it is the stop-loss before it.

Then: **B1 — define the UX rework, and mint P1.8b's DONE WHEN, in one planning
session with the owner.**

Why this and not something else, measured rather than felt:

- The repo's own decision audit names S10 **the load-bearing gap** — twice, on
  two different days, after two different owner answers. Behind it stand the
  P1.8b surfaces, the camera screens (and therefore the photographs the owner
  put in the pilot bar), the dashboard, the settings surface, and P1.21's
  drawing half. No other single item unblocks five queued things.
- S8 makes the programme sequential: desktop cannot start until mobile is
  finished, and mobile cannot finish while its last phases stand behind an
  undefined gate. So the gate's cost is not "some screens later" — it is the
  head of the whole chain's clock.
- It costs nothing but a conversation and a document. Every alternative next
  step (hosting, legal, photos) either needs a purchase, an outside
  professional, or the very definitions this produces.
- P1.8b is currently unfinishable *in principle* — not hard, but criterionless:
  *"nothing in this repository states what would close P1.8b."* A step that
  cannot be declared done cannot be scheduled honestly.

**And in the same week, in parallel, two things that need the owner and not a
coding session:** start A1's purchase (the domain outlives every machine, and
this is the only clock code cannot shorten), and collect D9's fact (what phones
the staff carry). Neither waits on B1; B1 waits on neither.

---

*Every dependency claim above is either cited to a repo file/section or to the
2026-08-13 audit as measured there, or marked as an assumption. Of the two
inputs the brief named, the architecture audit was found outside the repo and
this plan now rests on it (§ 0, § 3c, phase H, § 8); the mobile App-Store
survey remains unfound and its content stands as a flagged assumption. This
plan proposes; `ROADMAP.md` remains the only issuer of step numbers, and the
owner remains the only issuer of decisions.*
