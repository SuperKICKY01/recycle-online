# Roadmap

**What this file is:** the ORDER, and why that order. What must be true before what,
and what each step unblocks. It is meant to answer *"what next, and why that"* with
nobody available to ask.

**What it is not:** a re-listing of the queue. `OPEN_ITEMS.md` holds everything
outstanding, one line each, unranked. This file ranks a subset of it and argues the
ranking. If an item is not here, it is not on the critical path to a shop — it is
still in `OPEN_ITEMS.md`.

**Numbering.** Steps here are **R-numbers** and they are the only forward-looking
labels in this repository. **A-numbers (A1, A2, A3) are RETIRED and belong to
`PROJECT_STATUS.md`** as the log of phases already closed; two commit bodies point at
them (`27a0453`: "the A1 device pass", "a SECURITY item for A3"), so they cannot be
renamed without orphaning the history. **No new A-number will be issued.** A3 was
never opened — the sign-out work it named is now **R1** below.

## What next, and why that

**R1 — sign-out, both halves.** It is blocked by nothing, it is the only item on the
path to a shop that is a *defect* rather than missing infrastructure, and it is the
smallest of the three things it unblocks.

**In parallel, make the hosting decision (R3).** Not the work — the decision. It is
the only step with external lead time: a host has to be chosen, paid for and pointed
at a name. Code has no lead time; procurement does. Starting that clock while R1 is
being written costs nothing and is the one place where working in parallel is free.

## The two paths, and the gate between them

- **Path A — R1…R6: one shop uses this daily.** Everything here is missing
  infrastructure around work that already exists, plus one security defect.
- **Path B — R7…R10: it becomes sellable to many shops.** Sell flow, stock,
  printing, the desktop back office.

**The gate holds: nothing in Path B starts until R6 (a shop is actually using it) or
until Path A is blocked on something outside our control.** The reason is not
discipline for its own sake. Every Path B feature is a guess about what a yard wants
until one yard is using the product, and this project's own record is that the
expensive mistakes were things that looked obviously right to the person who built
them. One real shop is the cheapest source of truth available, and Path B built
before it is the most expensive way to buy the same information.

**One carve-out, and it is R4's doing** — see R4. If master data goes the desktop
route, then Path B's "desktop" is partly consumed by Path A, and B7 shrinks
accordingly. That is a consequence of the R4 decision, not an exception to the gate.

## Path A

### R1 — Sign-out, and the server's ability to refuse a live token

**Depends on:** nothing. **Unblocks:** R2, and makes R5 safe.
**Done when:** a phone can end its session deliberately, AND a token already minted
can be refused by the server before its hour is up — proven by an actual request
that gets refused, not by the button existing.

Read out of the files rather than assumed: `TokenStore.clear()` exists on the
interface (`mobile/src/session/tokenStore.ts:50`), on the in-memory store (`:76`) and
on the device store (`mobile/src/device/secureTokenStore.ts:59`, calling
`SecureStore.deleteItemAsync`). **Its only caller in the entire repository is a
proof** (`mobile/src/proof/proveCold.ts:1142`). Nothing in the app calls it.

Three separate things are waiting on this, which is why it is first despite being
neither the largest nor the most visible:

1. **It is a live defect, not a gap — and a smaller one than this file used to
   claim.** What stood here was that bills written on a handed-over phone are
   attributed in `purchase_bills` to the person who left, i.e. the audit trail
   naming the wrong person. **That was false and is corrected as of 2026-08-05:
   `purchase_bills` records no author at all** (see `OPEN_ITEMS.md`, both the new
   item and the note under Documentation). Nothing on a bill names anyone, so
   nothing on a bill names the wrong person — and R1 would put no name there if it
   landed tomorrow.

   What remains is real and is enough on its own: **an issued token cannot be
   refused.** A handset that is lost, sold, or kept by a departing employee holds a
   working credential for that shop, and there is no way to end that session from
   either side — no button on the phone, no switch on the server. The exposure is
   bounded by `JWT_TTL_SECONDS` (3600, no refresh token) and by the token acting
   only within its own tenant; it is not bounded by anything the shop controls,
   which is the part that makes it a defect rather than a limit. It is an exposure,
   not a corrupted record — and it stops being theoretical the moment R5 puts the
   app on staff-owned phones.
2. **It is the only thing standing between the daily money screen and a complete
   device verification.** The token lives in the iOS Keychain and survives deleting
   the app, so no staff session can be established on a device that already holds an
   admin one — which is why the 403 rendering has never been drawn (R2).
3. **The client half is nearly free and the server half is not, which is exactly why
   it must not be done by halves.** A button alone would make the problem look
   handled while a minted token stayed valid for up to an hour with nothing able to
   refuse it. The likely shape is a token version on the user row, bumped on password
   change or deactivation, checked where the role is already re-read on every request
   — that path exists and runs per request today.

### R2 — Close the daily money screen's device gaps

**Depends on:** R1. **Unblocks:** nothing — it is verification, not capability.
**Done when:** the 403 rendering has been SEEN on a handset under a staff account,
and a server that accepts the connection then never answers has been staged against
the 20 s timeout.

This step exists because the screen is already built and its remaining gaps are
observations nobody can make yet. It is cheap, it becomes possible the moment R1
lands, and doing it here means the owner's own screen is fully verified before a shop
starts depending on it rather than after. The 403 path is proven headless and proven
end-to-end for the void flow; what has never happened is this screen drawing that
refusal on a device.

Also unstaged and belonging here: a truncated day, and a past day with real trade in
it. Both need volume that does not exist yet — carry them to R6 rather than
manufacturing it.

### R3 — A server a shop can reach, with backups that run themselves

**Depends on:** nothing technical; it is a spend decision, and it is the one item
with external lead time. **Unblocks:** R4, R5.
**Done when:** the phone reaches the API over the public internet **on HTTPS**, and a
backup has run unattended, landed off this box, and been RESTORED from there.

**These two are one step and must not be split.** The moment the API is reachable
from outside the LAN it is reachable by everyone else; the moment it holds one real
bill, an unscheduled backup is a single copy. Shipping them separately buys a window
in which real money exists with no automatic copy of it, and that window has a way of
lasting longer than intended.

The backup half is mostly built and should not be re-estimated as new work: the dump
and restore scripts exist, the round trip is proven, and a disaster-recovery
rehearsal has been run on a throwaway cluster. **What is missing is a scheduler and
somewhere off this box to put the files.** A local-only backup does not survive fire,
theft or ransomware, and nothing currently runs it at all.

**NEW, found while writing this and not previously recorded anywhere:
`mobile/app.json` carries `"apiBaseUrl": "http://192.168.1.238:8000"` — plain HTTP.**
On a LAN that is a choice; on the public internet it hands the bearer token, the
login credentials and every money value to anyone on the path. **HTTPS is a
requirement of this step, not a later hardening pass.** The cost is small and the
coupling is one string: `mobile/app/config.ts:24` is the single reader, and the value
lives in one place in `app.json` specifically so a cloud URL can be swapped in with
no code edit.

### R4 — Master data a shop can maintain itself

**Depends on:** R3 (see below). **Unblocks:** R6.
**Done when:** a shop owner can change a price without anyone running a request by
hand.

**This is the largest unbuilt piece of Path A and the place where I most disagree
with the shape it is usually given.** "Master data screens" is one item in the queue;
as one item it is an Electron application built from an empty directory, sitting on
the critical path to a shop trading. It should be split by how often the data
actually changes:

- **Prices change constantly.** Scrap prices move with the metal market — daily or
  faster. A shop that cannot change its own prices cannot trade, so price editing is
  genuinely on the critical path and genuinely must be self-service.
- **Products, sellers, unit-of-measure and categories are set up once.** They change
  occasionally, at a pace where an operator running a request for the first shop is
  an inconvenience, not a blocker. That work is already built and proven over HTTP;
  what it lacks is a screen, and the first shop can live without one.

So the critical-path item is **price editing**, not the back office entire. That is a
much smaller thing, and it changes where it can sensibly live.

**The fork, which is the owner's to settle:**

- **Price editing on mobile (recommended).** The owner already has a phone screen —
  the daily money view — and this is the same person doing the same job at the same
  moment. It avoids scaffolding Electron on the critical path. The honest cost:
  `CLAUDE.md` assigns master data to `desktop/` and describes the yard app as
  deliberately read-only for master data, so this is against the intent. It violates
  none of the eight hard rules and nothing in the locked architecture — both clients
  are clients of the same API, and the server already gates every master-data write
  to admin — but it does put a back-office capability in the yard app, and the reason
  it was kept out was that a yard phone is the wrong place for authority.
- **The full back office on desktop (architecturally right, slower).** Correct home,
  no compromise, and it pulls the entire Electron scaffold — an app that does not
  exist yet — in front of R6.

**Recommendation: price editing on mobile for the first shop, entity setup run by an
operator at onboarding, the full back office deferred to R7.** The trade is
time-to-first-shop against architectural tidiness, and the gate argument above is
what tips it: the desktop app built before a shop is using the product is a guess
about what the back office needs.

**Why this depends on R3:** whichever way it goes, it writes master data through the
API to a server that has to be the same one tomorrow. Master data entered against a
dev box gets thrown away when the box is rebuilt — that is not a hypothetical, it
happened on 2026-08-03 and took every user id with it.

### R5 — Real accounts, and an app on a real phone

**Depends on:** R1 (revocation), R3 (a server that persists, and the URL the build
bakes in). **Unblocks:** R6.
**Done when:** staff at a shop that is not ours sign in with credentials that shop
owns, on an app installed from a store or a distribution link — not Expo served from
a development machine.

These are one step because neither half gets anyone working alone: credentials with
no installable app, or an app with only the dev fixture's accounts, both stop at the
same place. There is currently **no account-provisioning path of any kind** — the
only credentials that exist come from `seed_dev.py`, and the open question is who
creates a shop's first admin and how.

The build's dependency on R3 is real but shallow, and worth stating so it is not
over-planned: the API address is one string in `app.json`, read in one place. A build
made before the host exists is not wasted work, it is a build with the wrong string
in it.

### R6 — One shop uses it daily

**Depends on:** R1–R5. **Unblocks:** all of Path B.
**Not a build step.** A milestone with a definition, because "a shop is using it" is
the kind of claim that drifts into meaning "a shop has it installed".

**True when:** a shop that is not ours has bought real loads on this system on
consecutive trading days, without anyone running a request by hand for them; the
reconciler has been run against that shop's real data and is green; and a backup has
been restored from off-site since the first real bill was written.

That last clause is not ceremony. This project's own lesson is that a backup is a
claim until it is restored, and the first restore of real shop data should not be the
one performed in an emergency.

**Standing practice from here on, not a step:** run the reconciler against real data
regularly. It is the one instrument that checks the money against itself rather than
exercising a path, it writes nothing, and it is built to be pointed at a real
database. It has no schedule and does not need one yet — it needs a person who reads
it. **The proofs must never be pointed at a shop's database**; they create bills that
hard rule 5 then makes permanent.

## Path B — after R6

Ordered loosely; the ordering inside B is worth less than the gate in front of it,
and R6 will change it. Detail deliberately thin, because detail written now is
detail written before the only useful evidence arrives.

- **R7 — the desktop back office**, including the full master-data screens R4
  deferred, bill viewing, and the day's takings on a PC. Shrinks if R4 went the
  desktop route. **Constraint carried forward:** the thermal slip must PORT
  `mobile/src/time/shopTime.ts` (offset, era, ordering), never re-derive `+543` in
  Electron.
- **R8 — thermal slip printing** (ESC/POS, 58/80 mm). **See the open question below
  — this may not be a Path B item at all.**
- **R9 — the sell flow**, then **stock**, which depends on it: stock cannot be
  meaningful while only one side of the movement is recorded.
- **R10 — everything else currently out of MVP**: other income/expense, checkbox
  permissions, employee master, buyers, profile images, QR codes, scale integration,
  Excel export, reports. None of it starts on a guess.

## Where I disagree with the spine

Recorded because the ordering was handed over to be argued with, not accepted.

1. **Sign-out was missing from it entirely, and it is first.** Not an oversight worth
   a footnote — it is the item that unblocks two others and the only one that is a
   defect today. Everything else on Path A is infrastructure that does not exist yet;
   this one is a security hole that does.
2. **The daily money screen is not step one; it is already built.** Listing it first
   implies work that does not exist. What remains is one device observation, and that
   observation is blocked by sign-out — so it cannot be first no matter how it is
   labelled. It is R2 for that reason and no other.
3. **"Master data screens" is too coarse, and it is the item most likely to blow the
   schedule.** Split by change frequency it becomes a much smaller critical-path item
   (prices) plus a deferrable one (entity setup). Left whole, it silently drags an
   entire Electron application in front of the first shop.
4. **Printing may not belong in Path B.** A yard hands the seller something. If the
   pilot shop needs a printed purchase slip to trade, printing is a Path A
   requirement, and because thermal printing lives in `desktop/` it drags the desktop
   scaffold onto the critical path — which inverts the A/B split. **This is the
   single largest risk to the ordering in this file and it cannot be settled from the
   code.** See the open questions.
5. **Agreed, with the carve-out already noted:** B does not start until R6 or until A
   is blocked. The gate is right and the reasoning holds — with the one consequence
   that R4's answer decides how much of R7 Path A has already paid for.

## Open questions that change this order

Not "nice to know" — each one moves a step.

- **Does the pilot shop need a printed slip on day one?** If yes, printing and the
  desktop scaffold move into Path A and the order above changes materially. Owner's
  answer required; nothing in the code can settle it.
- **Where do master data screens live** — mobile, or desktop? R4's fork. Decides
  whether Path A includes an Electron scaffold.
- **Who creates a shop's first admin account, and how?** R5 has no answer today.
- **The two business questions in `OPEN_ITEMS.md`** — the second-hand goods act's
  bookkeeping obligation, and 3% withholding tax on a monthly service fee. The first
  could add required fields or a retention rule to the purchase register, which is a
  schema decision and therefore wants answering BEFORE a shop's real data starts
  accumulating under the current shape. The second is about billing, of which none
  exists, so it can wait for R6.

## What wakes up later, and what wakes it

Deferred on purpose, with the condition that ends the deferral. None of these is on
the roadmap; all of them are on a clock.

- **The index on `(tenant_id, server_received_at)`** — every daily report is a
  sequential scan over the tenant's whole bill history and gets one row slower per
  bill, forever. *Wakes at:* roughly a year of trade, or the first shop that says the
  day view feels slow. One migration.
- **The shared proof teardown** — proof bills land ACTIVE on the real current day and
  are indistinguishable from trade in the daily report. *Wakes when:* the dev
  database's day view becomes unreadable, or a second developer starts running the
  proofs. Never urgent for a shop, because the proofs must never touch one.
- **Per-tenant timezone** — shop time is a fixed UTC+7 offset on both sides. *Wakes
  at:* a tenant in a zone that observes daylight saving. Schema change plus a device
  verification, not a config edit.
- **The nine unaccountable tuned constants** — none is wrong, none can be safely
  changed. *Wakes when:* one of them needs to move. The trial ledger in
  `PROJECT_STATUS.md` is what stops that becoming a fitting exercise.
