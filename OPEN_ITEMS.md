# Open items

Everything outstanding, one line each: **what it is — why it isn't done
— what unblocks it.**

This is a LIST, not a tracker. There are no priorities and no dates here.
It exists for one reason: so that closing a chat session does not lose
the queue. Several of these have lived only in conversation until now.

**`ROADMAP.md` ranks the subset of this list that is on the critical
path to a shop, and argues the order.** An item here that is absent
there is not off the list — it is off that path. Where an item has a
roadmap step it is named (R1, R2 …). Status of anything already DONE is
in `PROJECT_STATUS.md`; architecture and invariants are in
`BRIEFING.md`. Nothing on this list is a claim that the item is a good
idea — only that it is unresolved.

---

## Blocking one real paying shop

- **A reachable server — `R3`** — the API runs on a development box and
  the app points at a LAN address. *Not done:* no hosting has been chosen
  or paid for. *Unblocks:* a decision on where it runs, then a deploy.
  **The one item with external lead time, so start the decision early.**
  **HTTPS is part of this** — `mobile/app.json` currently holds a plain
  `http://` address, which on the public internet hands over the bearer
  token and every money value to anyone on the path.
- **An installable build — `R5`** — staff need the app on their own
  phone, not Expo served from a development machine. *Not done:* never
  attempted. *Unblocks:* an Expo build/distribution route, plus `R3`
  (the API address is baked in — but it is one string in `app.json` with
  a single reader, so the coupling is shallow).
- **Real per-shop accounts — `R5`** — the only credentials that exist
  are the dev fixture from the seed script. *Not done:* no
  account-provisioning path exists at all. *Unblocks:* deciding who
  creates a shop's first admin, and how.
- **Master-data screens — `R4`, and the biggest fork on the path** — the
  whole master-data WRITE path exists and is proven over HTTP, and the
  only thing that can call it is `curl`. A shop cannot set up its own
  products, prices or sellers. *Not done:* `desktop/` is empty, and the
  yard app is deliberately read-only for master data. *Unblocks:*
  deciding WHERE the screens live (Electron back office vs. an admin
  section in the mobile app) — that is the actual open question, not the
  screens themselves. **`ROADMAP.md` R4 argues splitting this by change
  frequency**: prices move with the metal market and must be
  self-service, while products/sellers/uoms are set up once and can be
  operator-run for the first shop. **The label collision is settled** —
  this was called "A2" in conversation, `PROJECT_STATUS.md` spends A2 on
  the completed reconciliation phase, and A-numbers are now a closed log;
  forward steps are R-numbers.
- **No sign-out, and no server-side token revocation — `R1`, the first
  step** — a shop cannot change who the phone is signed in as, and an
  issued token cannot be refused before it expires. **This is a
  security item, not a convenience one:** a handset that is lost, sold
  or kept by a departing employee holds a working credential for that
  shop until the hour is up, and nothing on the phone or the server can
  take it back. *(Corrected 2026-08-05: this line used to say bills are
  attributed in the database to the person who left. They are not —
  `purchase_bills` records no author at all. See the next item and the
  note under Documentation.)* *Not done:*
  deliberately deferred, and deliberately NOT done by halves — the
  client half is one existing method wired to one button, and shipping
  only that would make the problem look handled while a minted token
  stayed valid. *Unblocks:* a server-side mechanism to reject a live
  token (e.g. a token version on the user row, bumped on password
  change or deactivation, checked where the role is already re-read on
  every request). Exposure is bounded — tokens expire in an hour and
  there is no refresh token — but bounded is not closed.
- **No author on a purchase bill — a SCHEMA and audit question, and NOT
  part of `R1`** — `purchase_bills` has no `created_by` column, so
  nobody can say which staff member bought a load. The only user
  recorded on a bill is `voided_by`, and only on the void. **It is not
  repairable retroactively:** every row written without the column is
  authorless permanently, so the decision wants making BEFORE a real
  shop's data accumulates under the current shape — the same argument
  that applies to the second-hand goods act question below, and for the
  same reason. *Not done:* never designed; it surfaced on 2026-08-05
  when three documents were found asserting an attribution that does not
  exist. *Unblocks:* deciding WHICH user a bill should name. The likely
  shape is the token of the syncing request, exactly as `voided_by`
  works today — but a bill is CREATED on the phone, offline, possibly by
  a different user than the one whose session later syncs it, and **that
  divergence is the actual open question, not the column.** Keep it out
  of `R1`: R1 is about refusing a live token, and no column added there
  would make a single already-written bill traceable.
- **Scheduled and off-site backup — `R3`, same step as the server** —
  the dump/restore scripts exist and the round trip is proven, but
  **nothing schedules them** and the copies sit on the same box. *Not
  done:* out of scope of the phase that built the scripts. *Unblocks:*
  somewhere off-site to put them, and a scheduler; then retention and
  encryption at rest become real questions rather than deferred ones.
  **Not separable from the hosting step:** the moment the server holds
  one real bill, an unscheduled backup is a single copy.
- **A day view on the desktop — `R7`, after a shop is running** — the
  daily money screen exists on the phone only, so an owner who works
  from a PC cannot see the day's takings there. *Not done:* `desktop/`
  is empty. *Unblocks:* same decision as the master-data screens.

## Verification gaps — built, not proven

- **The 403 rendering on the daily money screen has never been drawn on
  a device — `R2`.** *Not done:* the phone could not be made to hold a
  staff session — the token lives in the iOS Keychain and survives
  deleting the app. *Unblocks:* the sign-out item above (`R1`). This is
  the same mechanism wearing a friendlier face, and it is half the
  reason sign-out is the first step rather than a later one.
- **Android coverage** — one pass, one borrowed handset, one OS version.
  The void flow, the offline behaviours, draft recovery, the stale-cache
  price gate and background sync have never run there. *Not done:* no
  Android device on hand. *Unblocks:* a handset.
- **The on-device SQLite crash window** — the multi-statement path
  (write the bill and clear the draft, indivisibly) is proven under
  Node's SQLite with a real kill, but the Expo driver's transaction
  path genuinely differs and has no headless proof. *Not done:* the
  driver cannot run outside a device. *Unblocks:* a scripted device
  test that kills the process mid-transaction, or accepting the risk in
  writing.
- **The 20-second request timeout has never been exercised — `R2`.** The
  offline test killed the network, which throws immediately; the case
  the timeout exists for is a server that ACCEPTS the connection and
  then never answers. *Not done:* never staged. *Unblocks:* a stalling
  proxy or a deliberately hung endpoint.
- **Two devices racing inside the same millisecond** — two phones on one
  shop is observed, but they reconnected 158 ms apart, which is
  "near-simultaneous", not a race. *Not done:* hard to stage by hand.
  *Unblocks:* two devices with a synchronised trigger, or accepting the
  headless barrier proof as sufficient.
- **A truncated day, and a past day with real trade in it** — the
  paging/cap paths on the daily screen are proven headless only.
  *Not done:* needs a day of >200 bills. *Unblocks:* real trade, or a
  staged bulk day on a scratch database.
- **The reconciler's role-attribute check is unproven by execution and
  labelled as such** — the only way to make it fire is a cluster-wide
  role change that would disable tenant isolation on live money data
  while it ran. *Not done:* deliberately, and the harness refuses such
  injections by scanning for them. *Unblocks:* a genuinely separate
  cluster. Low value; recorded so nobody "fixes" the label.

## Code debt found and left in place

- **`TAP_MIN` is a stated standard honoured in two screens and undercut
  everywhere else.** It is `56`, DUPLICATED as a local constant in
  `mobile/app/CartScreen.tsx` and `mobile/app/SellerPicker.tsx` (free to
  drift), while the rest of the UI uses raw `minHeight` literals —
  including **36** (`App.tsx`, `StatusStrip.tsx`) and **44**
  (`CartScreen.tsx` ×3, `DailyScreen.tsx`), both BELOW the standard.
  *Not done:* found during a constants sweep, which was bookkeeping;
  changing tap targets is a behaviour change. *Unblocks:* a decision
  that the standard is real — then one shared constant and a sweep of
  every literal, not just the two below 56.
- **`JUST_FETCHED_WINDOW_MS` serves two unrelated meanings.** It is a
  BANNER threshold ("was master data fetched recently enough that no
  staleness notice is needed") and is ALSO passed as the tolerance on
  "a stored stamp cannot be in the future" in the clock-sanity check.
  Five minutes suits both by coincidence of scale, not by meaning. **So
  tuning it for banner reasons silently widens how far into the future a
  stamp may sit before the app stops trusting its own age arithmetic —
  the direction that defaults a stale price onto a bill.** *Not done:*
  splitting it is a behaviour change, and it was found during a rename
  that deliberately changed no values. *Unblocks:* giving the
  clock-sanity call site its own constant. The call site already says
  so; the comment is the guard until then.
- **Nine tuned constants have no recorded reason** — the sync tick, the
  UI refresh tick, the transport timeout, the undo window, `TAP_MIN`,
  the bill-list page size, both backoff knobs, and the JWT lifetime.
  None is wrong; all are **unaccountable**, which means none can be
  safely changed. Two other decisions rest on the JWT lifetime alone.
  *Not done:* a reason cannot be recovered after the fact, and inventing
  one is worse than a blank. *Unblocks:* nothing — this is a standing
  hazard. The trial ledger in `PROJECT_STATUS.md` exists to stop it
  compounding: any change to one of these values is a TRIAL and gets a
  row.
- **A stale comment cites a TypeScript config that no longer exists**
  (`mobile/src/device/expoSqliteDriver.ts`). *Not done:* comment only,
  nothing depends on it. *Unblocks:* one edit, whenever that file is
  next touched.
- **A malformed date on the daily report returns the framework's own
  422 shape**, not the `kind`/`code` error vocabulary the rest of the
  API uses. *Not done:* no client sends one yet. *Unblocks:* a validator
  on that parameter — small, and worth doing before a second client
  consumes the endpoint.

## Decisions open — the owner's, not the code's

- **The red-team trial — DEFINED 2026-08-05, never yet run.**
  `RED_TEAM.md` now says what the pass is: inputs (BRIEFING, CLAUDE,
  lessons index, the diff — and NOT the conversation that produced the
  code), the job (make the change fail, not assess quality), the three
  shapes hunted first, finding vs nitpick, the report format, and the
  four prohibitions. *Not done:* no diff has been put through it.
  *Unblocks:* a change worth reviewing — the natural first candidate is
  `R1` (sign-out), since it touches auth on both client and server.
  **What remains genuinely open is the TRIAL, not the definition:**
  whether a session held to these rules actually finds anything, and
  whether an empty report from it can be trusted. That is only
  answerable by running it a few times.
- **A shared proof teardown** — recommended and NOT taken. Proof scripts
  create bills they can never delete, so they land ACTIVE bills on the
  real current day, indistinguishable from trade in the daily report.
  The recommendation is ONE shared helper (not five teardowns), with two
  carve-outs it must not swallow: a bill a proof deliberately keeps live
  must be excluded BY KEY rather than by "whatever is left over", and
  the void must be backdated to the bill's own arrival stamp — otherwise
  every teardown drops into today's fraud-surveillance void list, which
  trades bill noise for noise on the one list built to be watched.
  *Not done:* awaiting the owner's accept/refuse. *Unblocks:* that
  answer. The counts restart from zero after the 2026-08-03 rebuild but
  will climb again with every proof run.
- **Whether the bill list should be shop-wide for staff** — a staff
  token can already read every bill in its shop, and each bill carries
  both prices, so the day's numbers are derivable by a phone today. The
  daily report being admin-only is therefore defence in depth, not a
  confidentiality boundary. *Not done:* explicitly left open. *Unblocks:*
  the owner deciding what a yard worker may see.
- **Thousands separators in money** — deliberately absent; `128400.00`
  is genuinely harder to read than `128,400.00`. *Not done:* it is the
  owner's call, and grouping is one edit from splitting a money string
  into numbers. *Unblocks:* the owner asking; then one place, plus a
  proof that the digits are unchanged.
- **Per-tenant timezone** — shop time is a fixed UTC+7 offset on both
  sides. *Not done:* a named zone needs an IANA database (not installed
  on the server box) and a JS engine whose timezone support is verified
  (unverified on the phone). *Unblocks:* installing that database, a
  device verification, and a schema change. Only matters for a tenant in
  a zone that observes daylight saving.

## Business questions — unanswered, and not answerable from the code

Both were raised and neither has been resolved. Recorded as QUESTIONS;
nothing below is an answer, and neither should be answered from memory
or from a plausible-sounding summary.

- **The second-hand goods act's bookkeeping obligation** — Thai law
  governing dealers in used goods imposes record-keeping duties on a
  purchase register (plausibly: which fields must be recorded about a
  seller and the goods, in what form, and for how long the record must
  be kept). *Not done:* the actual text and its current requirements
  have not been read. *Unblocks:* the owner confirming the obligation
  from the statute or an accountant/lawyer. **Why it matters here:** it
  could make currently-optional seller fields mandatory, dictate a
  retention period, or require a printed/exportable register — all of
  which are schema and product decisions, not formatting ones.
- **3% withholding tax on a monthly service fee** — a corporate customer
  paying a monthly SaaS licence in Thailand may be required to withhold
  tax on a service fee and remit it, meaning the shop pays less than the
  invoice and supplies a withholding certificate. *Not done:* not
  confirmed for this fee's classification. *Unblocks:* the owner's
  accountant. **Why it matters here:** it changes what the licence
  invoice must show and how payment is reconciled — a billing design
  question, and there is no billing anywhere in this system yet.

## Documentation

- **~~There is no `ROADMAP.md`~~ — CLOSED 2026-08-05.** It genuinely did
  not exist (checked against git history) and had been referred to as if
  it did; it was written from this list plus `PROJECT_STATUS.md` and now
  holds the order and the dependencies. Kept here as a closed line
  because the queue is where the absence was recorded.
- **The bill-attribution claim — CORRECTED 2026-08-05.**
  `PROJECT_STATUS.md`, `ROADMAP.md` and this file all stated, in
  slightly different words, that bills written on a handed-over phone
  are attributed in `purchase_bills` to the person who left.
  `purchase_bills` has no author column and never has had one. **How it
  happened is the part worth keeping:** `voided_by` exists and does
  record a real user, and phase 2c-6 put `seller_id` and `vehicle_no` on
  the bill header, so a bill visibly "has people" on it. A sentence
  written from that impression was then copied between documents as each
  was drafted from the last, until three files agreed. **Three files,
  one unverified source, and the schema never opened.** Agreement
  between documents is not corroboration when none of them read the
  code; only `grep` and the INSERT statement settle it. Found while
  reading `bills.py` for R1a, not by looking for it.
- **The phase-numbering collision — SETTLED 2026-08-05.** A-numbers are
  a closed log in `PROJECT_STATUS.md` (they are cited in commit bodies
  and so cannot be renamed); forward steps are R-numbers in
  `ROADMAP.md`; no new A-number will be issued.
- **Four open questions carried by `ROADMAP.md` rather than this list**,
  because each one moves a step rather than adding an item: does the
  pilot shop need a printed slip on day one (if yes, printing and the
  desktop scaffold move onto the critical path and the whole order
  changes); where master-data screens live; who creates a shop's first
  admin; and whether the second-hand goods act's answer needs to arrive
  before real data accumulates under the current schema.
